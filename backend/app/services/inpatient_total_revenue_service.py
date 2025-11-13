import logging
import time
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from ..utils.db import get_conn, put_conn
from ..utils.inpatient_total_revenue_numbers import safe_pct_change

logger = logging.getLogger("inpatient_total_revenue.service")

# ---- Decimal 常量 ----
DEC_0 = Decimal("0")
DEC_100 = Decimal("100")
DEC_POS_EPS = Decimal("0.0001")
DEC_NEG_EPS = Decimal("-0.0001")


def _query_scalar(sql: str, params: list):
    t0 = time.time()
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            logger.debug("Executing SQL (scalar): %s | params=%s", sql.strip(), params)
            cur.execute(sql, params)
            row = cur.fetchone()
            val = (row[0] if row and row[0] is not None else 0)
            logger.debug("Scalar result: %s (%.2f ms)", val, (time.time() - t0) * 1000)
            return val
    except Exception as e:
        logger.exception("DB error in _query_scalar: %s", e)
        raise
    finally:
        put_conn(conn)


def _shift_one_year(d: date) -> date:
    try:
        return d.replace(year=d.year - 1)
    except ValueError:
        if d.month == 2 and d.day == 29:
            return date(d.year - 1, 2, 28)
        return date(d.year - 1, d.month, min(d.day, 28))


def _to_decimal_or_none(v):
    if v is None:
        return None
    if isinstance(v, Decimal):
        return v
    try:
        return Decimal(str(v))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _norm_deps(dep_or_deps):
    if dep_or_deps is None:
        return None
    if isinstance(dep_or_deps, (list, tuple, set)):
        arr = [str(x).strip() for x in dep_or_deps if x is not None and str(x).strip()]
        return arr if arr else None
    s = str(dep_or_deps).strip()
    if not s:
        return None
    if "," in s:
        arr = [x.strip() for x in s.split(",") if x.strip()]
        return arr if arr else None
    return [s]


def _get_total_charges(start, end, departments=None):
    deps = _norm_deps(departments)
    dep_filter_live = " AND f.patient_in_dept = ANY(%s) " if deps else ""
    dep_filter_hist = " AND x.dep_code = ANY(%s) " if deps else ""
    sql = f"""
        WITH dep_incom AS (
            SELECT
                f.rcpt_date::date                AS rcpt_date,
                f.patient_in_dept                AS dep_code,
                d."绩效科室名称"                  AS dep_name,
                SUM(f.charges)                   AS charges
            FROM t_workload_inp_f f
            LEFT JOIN t_workload_dep_def2his d
              ON d."HIS科室编码" = f.patient_in_dept
            WHERE f.rcpt_date >= %s AND f.rcpt_date < %s
            {dep_filter_live}
            GROUP BY f.rcpt_date::date, f.patient_in_dept, d."绩效科室名称"
            UNION ALL
            SELECT
                x.rcpt_date::date AS rcpt_date,
                x.dep_code,
                x.dep_name,
                x.charges
            FROM t_dep_income_inp x
            WHERE x.rcpt_date >= %s AND x.rcpt_date < %s
            {dep_filter_hist}
        )
        SELECT COALESCE(SUM(charges), 0) AS total_charges
        FROM dep_incom
    """
    params = [start, end]
    if deps:
        params.append(deps)
    params += [start, end]
    if deps:
        params.append(deps)

    logger.info("Query total charges: start=%s end=%s deps=%s", start, end, deps or "ALL")
    return _query_scalar(sql, params)


def _get_total_bed(start, end, departments=None):
    deps = _norm_deps(departments)
    dep_live = " AND r.adm_dept_code = ANY(%s) " if deps else ""
    dep_hist = " AND b.dep_code = ANY(%s) " if deps else ""
    sql = f"""
        WITH bed_data AS (
            SELECT
                r.adm_date AS inbed_date,
                r.adm_dept_code AS dep_code,
                r.adm_dept_name AS dep_name,
                COUNT(r.mdtrt_id) AS amount
            FROM t_workload_inbed_reg_f r
            WHERE r.adm_date >= %s AND r.adm_date < %s
            {dep_live}
            GROUP BY r.adm_date, r.adm_dept_code, r.adm_dept_name
            UNION ALL
            SELECT b.inbed_date, b.dep_code, b.dep_name, b.amount
            FROM t_dep_count_inbed b
            WHERE b.inbed_date >= %s AND b.inbed_date < %s
              AND b.inbed_date < CURRENT_DATE
            {dep_hist}
        )
        SELECT COALESCE(SUM(amount), 0) AS total_bed FROM bed_data
    """
    params = [start, end]
    if deps:
        params.append(deps)
    params += [start, end]
    if deps:
        params.append(deps)
    logger.info("Query total bed: start=%s end=%s deps=%s", start, end, deps or "ALL")
    return _query_scalar(sql, params)


def get_departments():
    sql = """
    WITH dep_incom AS (
      SELECT f.rcpt_date,
             f.patient_in_dept AS dep_code,
             d."绩效科室名称"   AS dep_name,
             f.item_name, f.item_code, f.item_class_name,
             SUM(f.charges) AS charges, SUM(f.amount) AS amount
      FROM t_workload_inp_f f
      LEFT JOIN t_workload_dep_def2his d
        ON d."HIS科室编码"::text = f.patient_in_dept::text
      WHERE f.rcpt_date >= CURRENT_DATE AND f.rcpt_date < CURRENT_DATE + 1
      GROUP BY f.rcpt_date, f.patient_in_dept, d."绩效科室名称",
               f.item_name, f.item_code, f.item_class_name
      UNION ALL
      SELECT x.rcpt_date, x.dep_code, x.dep_name, x.item_name, x.item_code, x.item_class_name, x.charges, x.amount
      FROM t_dep_income_inp x
    )
    SELECT DISTINCT dep_code AS code, dep_name AS name
    FROM dep_incom
    WHERE dep_name IS NOT NULL
    ORDER BY code;
    """
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall()
            return [{"code": r[0], "name": r[1]} for r in rows]
    finally:
        put_conn(conn)


def get_revenue_summary(start_date, end_date, departments=None):
    deps = _norm_deps(departments)
    logger.info("get_revenue_summary: %s ~ %s deps=%s", start_date, end_date, deps or "ALL")

    # 去年同期：同区间回退一年（闭区间/半开区间保持与下游SQL一致）
    ly_start = _shift_one_year(start_date)
    ly_end   = _shift_one_year(end_date)

    # 同长度上一期：长度 = (end_date - start_date) + 1 天（按自然日长度），上一期结束为 start_date - 1 天
    _length_days = (end_date - start_date).days + 1
    prev_end   = start_date - timedelta(days=1)
    prev_start = prev_end - timedelta(days=_length_days - 1)

    try:
        total_curr = _get_total_charges(start_date, end_date, deps)
        total_ly   = _get_total_charges(ly_start, ly_end, deps)
        total_prev = _get_total_charges(prev_start, prev_end, deps)

        bed_curr = _get_total_bed(start_date, end_date, deps)
        bed_ly   = _get_total_bed(ly_start, ly_end, deps)
        bed_prev = _get_total_bed(prev_start, prev_end, deps)

        rev_growth_pct      = _to_decimal_or_none(safe_pct_change(total_curr, total_ly))
        mom_growth_pct      = _to_decimal_or_none(safe_pct_change(total_curr, total_prev))
        bed_growth_pct      = _to_decimal_or_none(safe_pct_change(bed_curr, bed_ly))
        bed_mom_growth_pct  = _to_decimal_or_none(safe_pct_change(bed_curr, bed_prev))

        def _dir(v: Decimal | None) -> str:
            if v is None:
                return "未知"
            if v > DEC_POS_EPS:
                return "上升"
            if v < DEC_NEG_EPS:
                return "下降"
            return "持平"

        rev_dir = _dir(rev_growth_pct)
        bed_dir = _dir(bed_growth_pct)
        trend = "持平/未知" if "未知" in (rev_dir, bed_dir) else ("同向" if rev_dir == bed_dir else "反向")

        rev_growth_pct_f      = (float(rev_growth_pct * DEC_100) if rev_growth_pct is not None else None)
        mom_growth_pct_f      = (float(mom_growth_pct * DEC_100) if mom_growth_pct is not None else None)
        bed_growth_pct_f      = (float(bed_growth_pct * DEC_100) if bed_growth_pct is not None else None)
        bed_mom_growth_pct_f  = (float(bed_mom_growth_pct * DEC_100) if bed_mom_growth_pct is not None else None)

        return {
            "params": {
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "departments": deps,
            },
            "periods": {
                "current": {"start": start_date.isoformat(), "end": end_date.isoformat()},
                "last_year_same_period": {"start": ly_start.isoformat(), "end": ly_end.isoformat()},
                "previous_period_same_length": {"start": prev_start.isoformat(), "end": prev_end.isoformat()},
            },
            "revenue": {
                "current_total": float(total_curr or 0),
                "last_year_total": float(total_ly or 0),
                "previous_total": float(total_prev or 0),
                "growth_rate_pct": rev_growth_pct_f,
                "mom_growth_pct": mom_growth_pct_f,
            },
            "bed": {
                "growth_rate_pct": bed_growth_pct_f,
                "mom_growth_pct": bed_mom_growth_pct_f,
            },
            "bed_growth_pct": bed_growth_pct_f,
            "bed_mom_growth_pct": bed_mom_growth_pct_f,
            "trend": trend,
            "notes": [
                "同比 = 与去年同期同区间；环比 = 与同长度上一周期。",
                "床位数：实时(t_workload_inbed_reg_f) + 历史(t_dep_count_inbed<今天) 联合，仅用于趋势判断"
            ]
        }
    except Exception as e:
        logger.exception("Error computing revenue summary: %s", e)
        raise


def get_revenue_details(start, end=None, departments=None, limit=20, offset=0):
    from datetime import timedelta
    if end is None:
        end = start + timedelta(days=1)

    deps = _norm_deps(departments)
    limit  = int(limit)  if (isinstance(limit, int) and limit  > 0) else 20
    offset = int(offset) if (isinstance(offset, int) and offset >= 0) else 0

    params = {"start": start, "end": end, "deps": deps, "limit": limit, "offset": offset}

    sql_count = """
    WITH base AS (
      SELECT f.rcpt_date::date AS dt, f.patient_in_dept AS dep_code
      FROM t_workload_inp_f f
      WHERE f.rcpt_date >= %(start)s AND f.rcpt_date < %(end)s
        AND (%(deps)s IS NULL OR f.patient_in_dept = ANY(%(deps)s))
      GROUP BY 1,2
    )
    SELECT COUNT(*) FROM base;
    """

    sql_data = """
    WITH base AS (
      SELECT
        f.rcpt_date::date AS dt,
        f.patient_in_dept AS dep_code,
        d."绩效科室名称"  AS dep_name,
        f.charges         AS charges
      FROM t_workload_inp_f f
      LEFT JOIN t_workload_dep_def2his d
        ON d."HIS科室编码"::text = f.patient_in_dept::text
      WHERE f.rcpt_date >= %(start)s AND f.rcpt_date < %(end)s
        AND (%(deps)s IS NULL OR f.patient_in_dept = ANY(%(deps)s))
    ),
    cur_rev AS (
      SELECT dt, dep_code, MAX(dep_name) AS dep_name, SUM(charges) AS revenue_raw
      FROM base
      GROUP BY 1,2
    ),
    ly_base AS (
      SELECT (f.rcpt_date::date + INTERVAL '1 year') AS dt,
             f.patient_in_dept AS dep_code,
             f.charges AS charges
      FROM t_workload_inp_f f
      WHERE f.rcpt_date >= (%(start)s::timestamp - INTERVAL '1 year')
        AND f.rcpt_date <  (%(end)s::timestamp   - INTERVAL '1 year')
        AND (%(deps)s IS NULL OR f.patient_in_dept = ANY(%(deps)s))
    ),
    ly_rev AS (
      SELECT dt, dep_code, SUM(charges) AS ly_revenue_raw
      FROM ly_base
      GROUP BY 1,2
    ),
    prev_base AS (
      SELECT (f.rcpt_date::date + INTERVAL '1 day') AS dt,
             f.patient_in_dept AS dep_code,
             f.charges AS charges
      FROM t_workload_inp_f f
      WHERE f.rcpt_date >= (%(start)s::timestamp - INTERVAL '1 day')
        AND f.rcpt_date <  (%(end)s::timestamp   - INTERVAL '1 day')
        AND (%(deps)s IS NULL OR f.patient_in_dept = ANY(%(deps)s))
    ),
    prev_rev AS (
      SELECT dt, dep_code, SUM(charges) AS prev_revenue_raw
      FROM prev_base
      GROUP BY 1,2
    ),
    cur_bed_raw AS (
      SELECT r.adm_date::date AS dt, r.adm_dept_code AS dep_code, COUNT(r.mdtrt_id) AS bed_cnt
      FROM t_workload_inbed_reg_f r
      WHERE r.adm_date >= %(start)s AND r.adm_date < %(end)s
        AND (%(deps)s IS NULL OR r.adm_dept_code = ANY(%(deps)s))
      GROUP BY 1,2
      UNION ALL
      SELECT b.inbed_date::date AS dt, b.dep_code, b.amount AS bed_cnt
      FROM t_dep_count_inbed b
      WHERE b.inbed_date >= %(start)s AND b.inbed_date < %(end)s AND b.inbed_date < CURRENT_DATE
        AND (%(deps)s IS NULL OR b.dep_code = ANY(%(deps)s))
    ),
    cur_bed AS (
      SELECT dt, dep_code, SUM(bed_cnt) AS bed_cnt FROM cur_bed_raw GROUP BY 1,2
    ),
    ly_bed_raw AS (
      SELECT (r.adm_date::date + INTERVAL '1 year') AS dt, r.adm_dept_code AS dep_code, COUNT(r.mdtrt_id) AS bed_cnt
      FROM t_workload_inbed_reg_f r
      WHERE r.adm_date >= (%(start)s::timestamp - INTERVAL '1 year')
        AND r.adm_date <  (%(end)s::timestamp   - INTERVAL '1 year')
        AND (%(deps)s IS NULL OR r.adm_dept_code = ANY(%(deps)s))
      GROUP BY 1,2
      UNION ALL
      SELECT (b.inbed_date::date + INTERVAL '1 year') AS dt, b.dep_code, b.amount AS bed_cnt
      FROM t_dep_count_inbed b
      WHERE b.inbed_date >= (%(start)s::timestamp - INTERVAL '1 year')
        AND b.inbed_date <  (%(end)s::timestamp   - INTERVAL '1 year')
        AND b.inbed_date < CURRENT_DATE
        AND (%(deps)s IS NULL OR b.dep_code = ANY(%(deps)s))
    ),
    ly_bed AS (
      SELECT dt, dep_code, SUM(bed_cnt) AS bed_cnt FROM ly_bed_raw GROUP BY 1,2
    )
    SELECT
      c.dt                             AS date,
      c.dep_code                       AS department_code,
      c.dep_name                       AS department_name,
      ROUND(c.revenue_raw::numeric, 2) AS revenue,
      CASE WHEN lr.ly_revenue_raw IS NULL OR lr.ly_revenue_raw = 0 THEN NULL
           ELSE ROUND((c.revenue_raw - lr.ly_revenue_raw) / lr.ly_revenue_raw * 100.0, 2)
      END                              AS revenue_growth_pct,
      CASE WHEN pr.prev_revenue_raw IS NULL OR pr.prev_revenue_raw = 0 THEN NULL
           ELSE ROUND((c.revenue_raw - pr.prev_revenue_raw) / pr.prev_revenue_raw * 100.0, 2)
      END                              AS revenue_mom_growth_pct,
      CASE
        WHEN lr.ly_revenue_raw IS NULL OR lr.ly_revenue_raw = 0
             OR lb.bed_cnt IS NULL OR lb.bed_cnt = 0 THEN '持平/未知'
        ELSE
          CASE
            WHEN ((c.revenue_raw - lr.ly_revenue_raw) > 0.0001 AND (cb.bed_cnt - lb.bed_cnt) > 0.0001) THEN '同向'
            WHEN ((c.revenue_raw - lr.ly_revenue_raw) < -0.0001 AND (cb.bed_cnt - lb.bed_cnt) < -0.0001) THEN '同向'
            WHEN ABS(c.revenue_raw - lr.ly_revenue_raw) <= 0.0001 OR ABS(cb.bed_cnt - lb.bed_cnt) <= 0.0001 THEN '持平/未知'
            ELSE '反向'
          END
      END                              AS trend
    FROM cur_rev c
    LEFT JOIN ly_rev   lr ON lr.dt = c.dt AND lr.dep_code = c.dep_code
    LEFT JOIN prev_rev pr ON pr.dt = c.dt AND pr.dep_code = c.dep_code
    LEFT JOIN cur_bed  cb ON cb.dt = c.dt AND cb.dep_code = c.dep_code
    LEFT JOIN ly_bed   lb ON lb.dt = c.dt AND lb.dep_code = c.dep_code
    ORDER BY c.dt DESC, c.dep_code
    LIMIT %(limit)s OFFSET %(offset)s;
    """

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql_count, params)
            total = int(cur.fetchone()[0] or 0)

            cur.execute(sql_data, params)
            cols = [c[0] for c in cur.description]
            raw = cur.fetchall()

        from decimal import Decimal
        from datetime import date as _date, datetime as _dt
        def _prim(v):
            if isinstance(v, Decimal): return float(v)
            if isinstance(v, (_date, _dt)): return v.isoformat()
            return v
        rows = [{k: _prim(v) for k, v in zip(cols, r)} for r in raw]
        return {"rows": rows, "total": total}
    except Exception as e:
        logger.exception("DB error in get_revenue_details (date+dept sum charges): %s", e)
        raise
    finally:
        put_conn(conn)


# ========= 新增：按日趋势 =========
from datetime import timedelta
from decimal import Decimal

# ========= 修改后的：按日趋势 =========
def get_revenue_timeseries(start, end, departments=None):
    """
    返回 [start, end) 区间内“每日”的收入 / 床日趋势：

      - revenue: 当期收入（charges）
      - last_year: 去年同期同日收入
      - prev_period: 同长度上一周期对应日收入
      - yoy_pct: 收入同比增长率（去年同日）
      - mom_pct: 收入环比增长率（同长度上一周期对应日）

      - bed_value: 当期床日
      - bed_last_year: 去年同期同日床日
      - bed_prev_period: 同长度上一周期对应日床日
      - bed_yoy_pct: 床日同比增长率
      - bed_mom_pct: 床日环比增长率

    rows: [{
      "date": "2025-11-01",
      "revenue": 12345.67,
      "last_year": 11111.11,
      "prev_period": 10000.00,
      "yoy_pct": 11.11,
      "mom_pct": 23.45,
      "bed_value": 234.0,
      "bed_last_year": 220.0,
      "bed_prev_period": 210.0,
      "bed_yoy_pct": 6.36,
      "bed_mom_pct": 11.43
    }, ...]
    """
    deps = _norm_deps(departments)

    # 当前周期长度（天数）：用于确定“同长度上一周期”
    length_days = (end - start).days
    if length_days <= 0:
        length_days = 1

    prev_start = start - timedelta(days=length_days)
    prev_end   = start  # 上一周期区间 [prev_start, prev_end)

    params = {
        "start": start,
        "end": end,
        "deps": deps,
        "prev_start": prev_start,
        "prev_end": prev_end,
        "len_days": length_days,
    }

    # 收入使用的科室过滤（和前面 _get_total_charges 一致）
    dep_live = " AND f.patient_in_dept = ANY(%(deps)s) " if deps else ""
    dep_hist = " AND x.dep_code = ANY(%(deps)s) " if deps else ""

    # 床日使用的科室过滤（和 _get_total_bed / get_revenue_details 一致）
    bed_live = " AND r.adm_dept_code = ANY(%(deps)s) " if deps else ""
    bed_hist = " AND b.dep_code = ANY(%(deps)s) " if deps else ""

    sql = f"""
    WITH days AS (
      -- 当前周期的每一天：用于保证时间轴连续
      SELECT generate_series(%(start)s::date,
                             (%(end)s::date - 1),
                             interval '1 day')::date AS dt
    ),

    -- ========== 收入：当前周期 ==========
    rev_cur_base AS (
      SELECT f.rcpt_date::date AS dt, SUM(f.charges) AS charges
      FROM t_workload_inp_f f
      WHERE f.rcpt_date >= %(start)s AND f.rcpt_date < %(end)s
        {dep_live}
      GROUP BY 1
      UNION ALL
      SELECT x.rcpt_date::date AS dt, SUM(x.charges) AS charges
      FROM t_dep_income_inp x
      WHERE x.rcpt_date >= %(start)s AND x.rcpt_date < %(end)s
        {dep_hist}
      GROUP BY 1
    ),
    rev_cur AS (
      SELECT dt, COALESCE(SUM(charges), 0) AS revenue
      FROM rev_cur_base
      GROUP BY dt
    ),

    -- ========== 收入：去年同期 ==========
    rev_ly_base AS (
      SELECT f.rcpt_date::date AS ly_dt, SUM(f.charges) AS charges
      FROM t_workload_inp_f f
      WHERE f.rcpt_date >= (%(start)s::timestamp - INTERVAL '1 year')
        AND f.rcpt_date <  (%(end)s::timestamp   - INTERVAL '1 year')
        {dep_live}
      GROUP BY 1
      UNION ALL
      SELECT x.rcpt_date::date AS ly_dt, SUM(x.charges) AS charges
      FROM t_dep_income_inp x
      WHERE x.rcpt_date >= (%(start)s::timestamp - INTERVAL '1 year')
        AND x.rcpt_date <  (%(end)s::timestamp   - INTERVAL '1 year')
        {dep_hist}
      GROUP BY 1
    ),
    rev_ly AS (
      -- 把去年的日期 +1 年，对齐到当前周期的日期
      SELECT (ly_dt + INTERVAL '1 year')::date AS dt,
             COALESCE(SUM(charges), 0) AS last_year
      FROM rev_ly_base
      GROUP BY 1
    ),

    -- ========== 收入：同长度上一周期 ==========
    rev_prev_base AS (
      SELECT f.rcpt_date::date AS prev_dt, SUM(f.charges) AS charges
      FROM t_workload_inp_f f
      WHERE f.rcpt_date >= %(prev_start)s AND f.rcpt_date < %(prev_end)s
        {dep_live}
      GROUP BY 1
      UNION ALL
      SELECT x.rcpt_date::date AS prev_dt, SUM(x.charges) AS charges
      FROM t_dep_income_inp x
      WHERE x.rcpt_date >= %(prev_start)s AND x.rcpt_date < %(prev_end)s
        {dep_hist}
      GROUP BY 1
    ),
    rev_prev AS (
      -- 上一周期的日期 + length_days 天，对齐到当前周期
      SELECT
        (prev_dt + (%(len_days)s || ' days')::interval)::date AS dt,
        COALESCE(SUM(charges), 0) AS prev_period
      FROM rev_prev_base
      GROUP BY 1
    ),

    -- ========== 床日：当前周期 ==========
    bed_cur_base AS (
      SELECT
        r.adm_date::date AS dt,
        COUNT(r.mdtrt_id) AS bed_cnt
      FROM t_workload_inbed_reg_f r
      WHERE r.adm_date >= %(start)s AND r.adm_date < %(end)s
        {bed_live}
      GROUP BY 1
      UNION ALL
      SELECT
        b.inbed_date::date AS dt,
        b.amount AS bed_cnt
      FROM t_dep_count_inbed b
      WHERE b.inbed_date >= %(start)s AND b.inbed_date < %(end)s
        AND b.inbed_date < CURRENT_DATE
        {bed_hist}
    ),
    bed_cur AS (
      SELECT dt, COALESCE(SUM(bed_cnt), 0) AS bed_value
      FROM bed_cur_base
      GROUP BY dt
    ),

    -- ========== 床日：去年同期 ==========
    bed_ly_base AS (
      SELECT
        r.adm_date::date AS ly_dt,
        COUNT(r.mdtrt_id) AS bed_cnt
      FROM t_workload_inbed_reg_f r
      WHERE r.adm_date >= (%(start)s::timestamp - INTERVAL '1 year')
        AND r.adm_date <  (%(end)s::timestamp   - INTERVAL '1 year')
        {bed_live}
      GROUP BY 1
      UNION ALL
      SELECT
        b.inbed_date::date AS ly_dt,
        b.amount AS bed_cnt
      FROM t_dep_count_inbed b
      WHERE b.inbed_date >= (%(start)s::timestamp - INTERVAL '1 year')
        AND b.inbed_date <  (%(end)s::timestamp   - INTERVAL '1 year')
        AND b.inbed_date < CURRENT_DATE
        {bed_hist}
    ),
    bed_ly AS (
      SELECT
        (ly_dt + INTERVAL '1 year')::date AS dt,
        COALESCE(SUM(bed_cnt), 0) AS bed_last_year
      FROM bed_ly_base
      GROUP BY 1
    ),

    -- ========== 床日：同长度上一周期 ==========
    bed_prev_base AS (
      SELECT
        r.adm_date::date AS prev_dt,
        COUNT(r.mdtrt_id) AS bed_cnt
      FROM t_workload_inbed_reg_f r
      WHERE r.adm_date >= %(prev_start)s AND r.adm_date < %(prev_end)s
        {bed_live}
      GROUP BY 1
      UNION ALL
      SELECT
        b.inbed_date::date AS prev_dt,
        b.amount AS bed_cnt
      FROM t_dep_count_inbed b
      WHERE b.inbed_date >= %(prev_start)s AND b.inbed_date < %(prev_end)s
        AND b.inbed_date < CURRENT_DATE
        {bed_hist}
    ),
    bed_prev AS (
      SELECT
        (prev_dt + (%(len_days)s || ' days')::interval)::date AS dt,
        COALESCE(SUM(bed_cnt), 0) AS bed_prev_period
      FROM bed_prev_base
      GROUP BY 1
    ),

    -- ========== 汇总每天：收入 + 床日 ==========
    join_all AS (
      SELECT
        d.dt,
        COALESCE(rc.revenue, 0)::numeric AS revenue,
        rly.last_year,
        rpr.prev_period,
        bcur.bed_value,
        bly.bed_last_year,
        bpr.bed_prev_period
      FROM days d
      LEFT JOIN rev_cur  rc  ON rc.dt  = d.dt
      LEFT JOIN rev_ly   rly ON rly.dt = d.dt
      LEFT JOIN rev_prev rpr ON rpr.dt = d.dt
      LEFT JOIN bed_cur  bcur ON bcur.dt = d.dt
      LEFT JOIN bed_ly   bly  ON bly.dt  = d.dt
      LEFT JOIN bed_prev bpr  ON bpr.dt  = d.dt
    )

    SELECT
      dt AS date,
      ROUND(revenue::numeric, 2) AS revenue,
      CASE WHEN last_year       IS NULL THEN NULL ELSE ROUND(last_year::numeric, 2)       END AS last_year,
      CASE WHEN prev_period     IS NULL THEN NULL ELSE ROUND(prev_period::numeric, 2)     END AS prev_period,
      CASE WHEN bed_value       IS NULL THEN NULL ELSE ROUND(bed_value::numeric, 2)       END AS bed_value,
      CASE WHEN bed_last_year   IS NULL THEN NULL ELSE ROUND(bed_last_year::numeric, 2)   END AS bed_last_year,
      CASE WHEN bed_prev_period IS NULL THEN NULL ELSE ROUND(bed_prev_period::numeric, 2) END AS bed_prev_period,

      -- 收入同比
      CASE
        WHEN last_year IS NULL OR last_year = 0 THEN NULL
        ELSE ROUND((revenue - last_year) / last_year * 100.0, 2)
      END AS yoy_pct,

      -- 收入环比（同长度上一周期）
      CASE
        WHEN prev_period IS NULL OR prev_period = 0 THEN NULL
        ELSE ROUND((revenue - prev_period) / prev_period * 100.0, 2)
      END AS mom_pct,

      -- 床日同比
      CASE
        WHEN bed_last_year IS NULL OR bed_last_year = 0 THEN NULL
        ELSE ROUND((bed_value - bed_last_year) / bed_last_year * 100.0, 2)
      END AS bed_yoy_pct,

      -- 床日环比（同长度上一周期）
      CASE
        WHEN bed_prev_period IS NULL OR bed_prev_period = 0 THEN NULL
        ELSE ROUND((bed_value - bed_prev_period) / bed_prev_period * 100.0, 2)
      END AS bed_mom_pct

    FROM join_all
    ORDER BY date;
    """

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            logger.info(
                "timeseries (rev+bed, same-length prev period): %s ~ %s deps=%s prev=[%s,%s)",
                start, end, deps or "ALL", prev_start, prev_end
            )
            cur.execute(sql, params)
            cols = [c[0] for c in cur.description]
            rows = cur.fetchall()

        from datetime import date as _date, datetime as _dt
        def _prim(v):
            if isinstance(v, Decimal):
                return float(v)
            if isinstance(v, (_date, _dt)):
                return v.isoformat()
            return v

        data = [{k: _prim(v) for k, v in zip(cols, r)} for r in rows]
        return data
    except Exception as e:
        logger.exception("DB error in get_revenue_timeseries: %s", e)
        raise
    finally:
        put_conn(conn)