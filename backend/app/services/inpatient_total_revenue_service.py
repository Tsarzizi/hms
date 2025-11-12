import logging
import time
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from ..utils.inpatient_total_revenue_db import get_conn, put_conn
from ..utils.inpatient_total_revenue_numbers import safe_pct_change

logger = logging.getLogger("inpatient_total_revenue.service")

# ---- Decimal 常量，杜绝 float ----
DEC_0 = Decimal("0")
DEC_100 = Decimal("100")
DEC_POS_EPS = Decimal("0.0001")
DEC_NEG_EPS = Decimal("-0.0001")


def _query_scalar(sql: str, params: list):
    """执行标量查询并记录日志"""
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
        # 处理 2/29 -> 2/28
        if d.month == 2 and d.day == 29:
            return date(d.year - 1, 2, 28)
        return date(d.year - 1, d.month, min(d.day, 28))


def _to_decimal_or_none(v):
    """将 safe_pct_change 的结果规范为 Decimal 或 None"""
    if v is None:
        return None
    if isinstance(v, Decimal):
        return v
    try:
        return Decimal(str(v))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _norm_deps(dep_or_deps):
    """
    归一化科室筛选：None | '0301' | '0301,0402' | ['0301','0402'] -> list | None
    """
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


def _get_total_amount(start, end, departments=None):
    """返回区间内（实时+历史聚合）满足筛选的总收入（元）"""
    deps = _norm_deps(departments)
    dep_filter_a = " AND t_workload_inp_f.patient_in_dept = ANY(%s) " if deps else ""
    dep_filter_b = " AND dep_code = ANY(%s) " if deps else ""
    sql = f"""
        WITH dep_incom AS (
            SELECT
                t_workload_inp_f.rcpt_date,
                t_workload_inp_f.patient_in_dept AS dep_code,
                t_workload_dep_def2his."绩效科室名称" AS dep_name,
                SUM(t_workload_inp_f.amount)  AS amount
            FROM t_workload_inp_f
            LEFT JOIN t_workload_dep_def2his
              ON t_workload_dep_def2his."HIS科室编码" = t_workload_inp_f.patient_in_dept
            WHERE t_workload_inp_f.rcpt_date >= %s AND t_workload_inp_f.rcpt_date < %s
            {dep_filter_a}
            GROUP BY t_workload_inp_f.rcpt_date, t_workload_inp_f.patient_in_dept, t_workload_dep_def2his."绩效科室名称"

            UNION ALL

            SELECT rcpt_date, dep_code, dep_name, amount
            FROM t_dep_income_inp
            WHERE rcpt_date >= %s AND rcpt_date < %s
            {dep_filter_b}
        )
        SELECT COALESCE(SUM(amount), 0) AS total_amount
        FROM dep_incom
    """
    params = [start, end]
    if deps:
        params.append(deps)
    params += [start, end]
    if deps:
        params.append(deps)

    logger.info("Query total amount: start=%s end=%s deps=%s", start, end, deps or "ALL")
    return _query_scalar(sql, params)


def _get_total_bed(start, end, departments=None):
    """返回区间内（实时+历史聚合）满足筛选的床位合计，仅用于趋势判断"""
    deps = _norm_deps(departments)
    dep_live = " AND adm_dept_code = ANY(%s) " if deps else ""
    dep_hist = " AND dep_code = ANY(%s) " if deps else ""
    sql = f"""
        WITH bed_data AS (
            SELECT
                adm_date AS inbed_date,
                adm_dept_code AS dep_code,
                adm_dept_name AS dep_name,
                COUNT(mdtrt_id) AS amount
            FROM t_workload_inbed_reg_f
            WHERE adm_date >= %s AND adm_date < %s
            {dep_live}
            GROUP BY adm_date, adm_dept_code, adm_dept_name

            UNION ALL

            SELECT inbed_date, dep_code, dep_name, amount
            FROM t_dep_count_inbed
            WHERE inbed_date >= %s AND inbed_date < %s
              AND inbed_date < CURRENT_DATE
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
    # 今日有数据或历史聚合存在的科室清单
    sql = """
    WITH dep_incom AS (
      SELECT t_workload_inp_f.rcpt_date,
             t_workload_inp_f.patient_in_dept AS dep_code,
             t_workload_dep_def2his."绩效科室名称" AS dep_name,
             t_workload_inp_f.item_name, t_workload_inp_f.item_code, t_workload_inp_f.item_class_name,
             SUM(t_workload_inp_f.charges) AS charges, SUM(t_workload_inp_f.amount) AS amount
      FROM t_workload_inp_f
      LEFT JOIN t_workload_dep_def2his
        ON t_workload_dep_def2his."HIS科室编码"::text = t_workload_inp_f.patient_in_dept::text
      WHERE t_workload_inp_f.rcpt_date >= CURRENT_DATE AND t_workload_inp_f.rcpt_date < CURRENT_DATE + 1
      GROUP BY t_workload_inp_f.rcpt_date, t_workload_inp_f.patient_in_dept,
               t_workload_dep_def2his."绩效科室名称",
               t_workload_inp_f.item_name, t_workload_inp_f.item_code, t_workload_inp_f.item_class_name
      UNION ALL
      SELECT rcpt_date, dep_code, dep_name, item_name, item_code, item_class_name, charges, amount
      FROM t_dep_income_inp
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
    """
    汇总主入口：基于筛选集合汇总“总收入（元）”、同比%、环比%、趋势。
    YoY = 与去年同区间；MoM = 与同长度上一周期。
    """
    deps = _norm_deps(departments)
    logger.info("get_revenue_summary: %s ~ %s deps=%s", start_date, end_date, deps or "ALL")

    ly_start = _shift_one_year(start_date)
    ly_end = _shift_one_year(end_date)

    # 同长度上一周期（环比）：[prev_start, prev_end)
    period_days = (end_date - start_date).days or 1
    prev_end = start_date
    prev_start = start_date - timedelta(days=period_days)

    try:
        total_curr = _get_total_amount(start_date, end_date, deps)
        total_ly   = _get_total_amount(ly_start, ly_end, deps)
        total_prev = _get_total_amount(prev_start, prev_end, deps)

        bed_curr = _get_total_bed(start_date, end_date, deps)
        bed_ly   = _get_total_bed(ly_start, ly_end, deps)

        rev_growth_pct = _to_decimal_or_none(safe_pct_change(total_curr, total_ly))
        mom_growth_pct = _to_decimal_or_none(safe_pct_change(total_curr, total_prev))
        bed_growth_pct = _to_decimal_or_none(safe_pct_change(bed_curr, bed_ly))

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
                "growth_rate_pct": (float(rev_growth_pct * DEC_100) if rev_growth_pct is not None else None),
                "mom_growth_pct": (float(mom_growth_pct * DEC_100) if mom_growth_pct is not None else None),
            },
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
    """
    数据详情（以 日期 + 部门 聚合）
    - 收入口径：SUM(charges)
    - 忽略 amount
    - 字段: 日期、科室编码、科室名称、收入(元)、收入同比增长率(%)、收入与床日趋势
    """
    from datetime import timedelta
    if end is None:
        end = start + timedelta(days=1)

    deps = _norm_deps(departments)
    limit  = int(limit)  if (isinstance(limit, int) and limit  > 0) else 20
    offset = int(offset) if (isinstance(offset, int) and offset >= 0) else 0

    params = {"start": start, "end": end, "deps": deps, "limit": limit, "offset": offset}

    # 统计总行数（日期 × 科室）
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

    # 主查询：日期+部门汇总
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
      SELECT
        dt,
        dep_code,
        MAX(dep_name) AS dep_name,
        SUM(charges)  AS revenue_raw
      FROM base
      GROUP BY 1,2
    ),
    -- 去年同期 (日期+科室)，映射到今年同日
    ly_base AS (
      SELECT
        (f.rcpt_date::date + INTERVAL '1 year') AS dt,
        f.patient_in_dept                        AS dep_code,
        f.charges                                AS charges
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
    -- 当期/去年床日 (日期+科室)
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
      c.dt                                   AS date,
      c.dep_code                             AS department_code,
      c.dep_name                             AS department_name,
      ROUND(c.revenue_raw::numeric, 2)       AS revenue,
      CASE
        WHEN lr.ly_revenue_raw IS NULL OR lr.ly_revenue_raw = 0 THEN NULL
        ELSE ROUND((c.revenue_raw - lr.ly_revenue_raw) / lr.ly_revenue_raw * 100.0, 2)
      END                                    AS revenue_growth_pct,
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
      END                                    AS trend
    FROM cur_rev c
    LEFT JOIN ly_rev   lr ON lr.dt = c.dt AND lr.dep_code = c.dep_code
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




