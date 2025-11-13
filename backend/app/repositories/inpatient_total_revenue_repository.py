import logging
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional

from ..utils.db import get_conn, put_conn

logger = logging.getLogger("inpatient_total_revenue.repository")


def _norm_deps(dep_or_deps) -> Optional[List[str]]:
    """
    统一把科室参数变成 List[str] 或 None
    """
    if dep_or_deps is None:
        return None
    if isinstance(dep_or_deps, (list, tuple, set)):
        arr = [str(x).strip() for x in dep_or_deps if x is not None and str(x).strip()]
        return arr or None
    s = str(dep_or_deps).strip()
    if not s:
        return None
    if "," in s:
        arr = [x.strip() for x in s.split(",") if x.strip()]
        return arr or None
    return [s]


def _prim_for_json(v: Any):
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    return v


class InpatientTotalRevenueRepository:
    """
    Repository：只负责和 DB 交互，Service 不直接写 SQL。
    """

    # ========== 通用 DB 工具方法 ==========

    def _query_rows(self, sql: str, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                logger.debug("Executing SQL: %s | params=%s", sql, params)
                cur.execute(sql, params)
                cols = [c[0] for c in cur.description]
                raw = cur.fetchall()
            return [{k: _prim_for_json(v) for k, v in zip(cols, row)} for row in raw]
        finally:
            put_conn(conn)

    def _query_scalar(self, sql: str, params: Dict[str, Any]) -> Decimal:
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                logger.debug("Executing SQL (scalar): %s | params=%s", sql, params)
                cur.execute(sql, params)
                row = cur.fetchone()
                if not row or row[0] is None:
                    return Decimal("0")
                if isinstance(row[0], Decimal):
                    return row[0]
                try:
                    return Decimal(str(row[0]))
                except (InvalidOperation, TypeError, ValueError):
                    return Decimal("0")
        finally:
            put_conn(conn)

    # ========== 业务查询 ==========

    def get_departments(self) -> List[Dict[str, Any]]:
        """
        维持和原 get_departments 相同的逻辑，只返回 code / name。
        """
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
          SELECT x.rcpt_date, x.dep_code, x.dep_name,
                 x.item_name, x.item_code, x.item_class_name,
                 x.charges, x.amount
          FROM t_dep_income_inp x
        )
        SELECT DISTINCT dep_code AS code, dep_name AS name
        FROM dep_incom
        WHERE dep_name IS NOT NULL
        ORDER BY code;
        """
        rows = self._query_rows(sql, {})
        # 只保留 code/name 字段
        return [{"code": r["code"], "name": r["name"]} for r in rows]

    def get_total_charges(self, start: date, end: date, departments=None) -> Decimal:
        deps = _norm_deps(departments)
        params: Dict[str, Any] = {"start": start, "end": end, "deps": deps}
        sql = """
        WITH dep_incom AS (
            SELECT
                f.rcpt_date::date  AS rcpt_date,
                f.patient_in_dept  AS dep_code,
                SUM(f.charges)     AS charges
            FROM t_workload_inp_f f
            WHERE f.rcpt_date >= %(start)s AND f.rcpt_date < %(end)s
              AND (%(deps)s IS NULL OR f.patient_in_dept = ANY(%(deps)s))
            GROUP BY 1,2
            UNION ALL
            SELECT
                x.rcpt_date::date AS rcpt_date,
                x.dep_code        AS dep_code,
                x.charges         AS charges
            FROM t_dep_income_inp x
            WHERE x.rcpt_date >= %(start)s AND x.rcpt_date < %(end)s
              AND (%(deps)s IS NULL OR x.dep_code = ANY(%(deps)s))
        )
        SELECT COALESCE(SUM(charges), 0) AS total_charges
        FROM dep_incom;
        """
        return self._query_scalar(sql, params)

    def get_total_bed(self, start: date, end: date, departments=None) -> Decimal:
        deps = _norm_deps(departments)
        params: Dict[str, Any] = {"start": start, "end": end, "deps": deps}
        sql = """
        WITH bed_data AS (
            SELECT
                r.adm_date::date   AS inbed_date,
                r.adm_dept_code    AS dep_code,
                COUNT(r.mdtrt_id)  AS amount
            FROM t_workload_inbed_reg_f r
            WHERE r.adm_date >= %(start)s AND r.adm_date < %(end)s
              AND (%(deps)s IS NULL OR r.adm_dept_code = ANY(%(deps)s))
            GROUP BY 1,2
            UNION ALL
            SELECT
                b.inbed_date::date AS inbed_date,
                b.dep_code         AS dep_code,
                b.amount           AS amount
            FROM t_dep_count_inbed b
            WHERE b.inbed_date >= %(start)s AND b.inbed_date < %(end)s
              AND b.inbed_date < CURRENT_DATE
              AND (%(deps)s IS NULL OR b.dep_code = ANY(%(deps)s))
        )
        SELECT COALESCE(SUM(amount), 0) AS total_bed
        FROM bed_data;
        """
        return self._query_scalar(sql, params)

    def get_revenue_details(
        self,
        start: date,
        end: Optional[date] = None,
        departments=None,
        limit: int = 20,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """
        明细查询（日期+科室聚合），使用 COUNT(*) OVER() 一次查出 total+rows，减少扫描次数。
        """
        if end is None:
            end = start + timedelta(days=1)

        deps = _norm_deps(departments)
        params: Dict[str, Any] = {
            "start": start,
            "end": end,
            "deps": deps,
            "limit": int(limit),
            "offset": int(offset),
        }

        sql = """
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
          SELECT
            (f.rcpt_date::date + INTERVAL '1 year') AS dt,
            f.patient_in_dept AS dep_code,
            f.charges         AS charges
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
          SELECT
            (f.rcpt_date::date + INTERVAL '1 day') AS dt,
            f.patient_in_dept AS dep_code,
            f.charges         AS charges
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
          SELECT
            r.adm_date::date AS dt,
            r.adm_dept_code  AS dep_code,
            COUNT(r.mdtrt_id) AS bed_cnt
          FROM t_workload_inbed_reg_f r
          WHERE r.adm_date >= %(start)s AND r.adm_date < %(end)s
            AND (%(deps)s IS NULL OR r.adm_dept_code = ANY(%(deps)s))
          GROUP BY 1,2
          UNION ALL
          SELECT
            b.inbed_date::date AS dt,
            b.dep_code,
            b.amount           AS bed_cnt
          FROM t_dep_count_inbed b
          WHERE b.inbed_date >= %(start)s AND b.inbed_date < %(end)s
            AND b.inbed_date < CURRENT_DATE
            AND (%(deps)s IS NULL OR b.dep_code = ANY(%(deps)s))
        ),
        cur_bed AS (
          SELECT dt, dep_code, SUM(bed_cnt) AS bed_cnt
          FROM cur_bed_raw
          GROUP BY 1,2
        ),
        ly_bed_raw AS (
          SELECT
            (r.adm_date::date + INTERVAL '1 year') AS dt,
            r.adm_dept_code AS dep_code,
            COUNT(r.mdtrt_id) AS bed_cnt
          FROM t_workload_inbed_reg_f r
          WHERE r.adm_date >= (%(start)s::timestamp - INTERVAL '1 year')
            AND r.adm_date <  (%(end)s::timestamp   - INTERVAL '1 year')
            AND (%(deps)s IS NULL OR r.adm_dept_code = ANY(%(deps)s))
          GROUP BY 1,2
          UNION ALL
          SELECT
            (b.inbed_date::date + INTERVAL '1 year') AS dt,
            b.dep_code,
            b.amount AS bed_cnt
          FROM t_dep_count_inbed b
          WHERE b.inbed_date >= (%(start)s::timestamp - INTERVAL '1 year')
            AND b.inbed_date <  (%(end)s::timestamp   - INTERVAL '1 year')
            AND b.inbed_date < CURRENT_DATE
            AND (%(deps)s IS NULL OR b.dep_code = ANY(%(deps)s))
        ),
        ly_bed AS (
          SELECT dt, dep_code, SUM(bed_cnt) AS bed_cnt
          FROM ly_bed_raw
          GROUP BY 1,2
        ),
        final AS (
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
                  WHEN ((c.revenue_raw - lr.ly_revenue_raw) > 0.0001
                        AND (cb.bed_cnt - lb.bed_cnt) > 0.0001) THEN '同向'
                  WHEN ((c.revenue_raw - lr.ly_revenue_raw) < -0.0001
                        AND (cb.bed_cnt - lb.bed_cnt) < -0.0001) THEN '同向'
                  WHEN ABS(c.revenue_raw - lr.ly_revenue_raw) <= 0.0001
                       OR ABS(cb.bed_cnt - lb.bed_cnt) <= 0.0001 THEN '持平/未知'
                  ELSE '反向'
                END
            END                              AS trend
          FROM cur_rev c
          LEFT JOIN ly_rev   lr ON lr.dt = c.dt AND lr.dep_code = c.dep_code
          LEFT JOIN prev_rev pr ON pr.dt = c.dt AND pr.dep_code = c.dep_code
          LEFT JOIN cur_bed  cb ON cb.dt = c.dt AND cb.dep_code = c.dep_code
          LEFT JOIN ly_bed   lb ON lb.dt = c.dt AND lb.dep_code = c.dep_code
        )
        SELECT
          *,
          COUNT(*) OVER() AS total_count
        FROM final
        ORDER BY date DESC, department_code
        LIMIT %(limit)s OFFSET %(offset)s;
        """

        rows = self._query_rows(sql, params)
        total = int(rows[0]["total_count"]) if rows else 0
        for r in rows:
            r.pop("total_count", None)
        return {"rows": rows, "total": total}

    def get_revenue_timeseries(
        self,
        start: date,
        end: date,
        departments=None,
    ) -> List[Dict[str, Any]]:
        """
        保持原 get_revenue_timeseries 的业务逻辑，只是挪到 Repository。
        """
        deps = _norm_deps(departments)
        length_days = (end - start).days
        if length_days <= 0:
            length_days = 1

        prev_end = start
        prev_start = prev_end - timedelta(days=length_days)

        params: Dict[str, Any] = {
            "start": start,
            "end": end,
            "deps": deps,
            "prev_start": prev_start,
            "prev_end": prev_end,
            "len_days": length_days,
        }

        dep_live = " AND f.patient_in_dept = ANY(%(deps)s) " if deps else ""
        dep_hist = " AND x.dep_code = ANY(%(deps)s) " if deps else ""
        bed_live = " AND r.adm_dept_code = ANY(%(deps)s) " if deps else ""
        bed_hist = " AND b.dep_code = ANY(%(deps)s) " if deps else ""

        sql = f"""
        WITH days AS (
          SELECT generate_series(
                   %(start)s::date,
                   (%(end)s::date - 1),
                   interval '1 day'
                 )::date AS dt
        ),

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
          GROUP BY 1
        ),

        rev_ly_base AS (
          SELECT (f.rcpt_date::date + INTERVAL '1 year') AS ly_dt, SUM(f.charges) AS charges
          FROM t_workload_inp_f f
          WHERE f.rcpt_date >= (%(start)s::timestamp - INTERVAL '1 year')
            AND f.rcpt_date <  (%(end)s::timestamp   - INTERVAL '1 year')
            {dep_live}
          GROUP BY 1
          UNION ALL
          SELECT (x.rcpt_date::date + INTERVAL '1 year') AS ly_dt, SUM(x.charges) AS charges
          FROM t_dep_income_inp x
          WHERE x.rcpt_date >= (%(start)s::timestamp - INTERVAL '1 year')
            AND x.rcpt_date <  (%(end)s::timestamp   - INTERVAL '1 year')
            {dep_hist}
          GROUP BY 1
        ),
        rev_ly AS (
          SELECT (ly_dt + INTERVAL '1 year')::date AS dt,
                 COALESCE(SUM(charges), 0) AS last_year
          FROM rev_ly_base
          GROUP BY 1
        ),

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
          SELECT
            (prev_dt + (%(len_days)s || ' days')::interval)::date AS dt,
            COALESCE(SUM(charges), 0) AS prev_period
          FROM rev_prev_base
          GROUP BY 1
        ),

        bed_cur_base AS (
          SELECT r.adm_date::date AS dt, COUNT(r.mdtrt_id) AS bed_cnt
          FROM t_workload_inbed_reg_f r
          WHERE r.adm_date >= %(start)s AND r.adm_date < %(end)s
            {bed_live}
          GROUP BY 1
          UNION ALL
          SELECT b.inbed_date::date AS dt, SUM(b.amount) AS bed_cnt
          FROM t_dep_count_inbed b
          WHERE b.inbed_date >= %(start)s AND b.inbed_date < %(end)s
            AND b.inbed_date < CURRENT_DATE
            {bed_hist}
          GROUP BY 1
        ),
        bed_cur AS (
          SELECT dt, COALESCE(SUM(bed_cnt), 0) AS bed_value
          FROM bed_cur_base
          GROUP BY 1
        ),

        bed_ly_base AS (
          SELECT (r.adm_date::date + INTERVAL '1 year') AS ly_dt, COUNT(r.mdtrt_id) AS bed_cnt
          FROM t_workload_inbed_reg_f r
          WHERE r.adm_date >= (%(start)s::timestamp - INTERVAL '1 year')
            AND r.adm_date <  (%(end)s::timestamp   - INTERVAL '1 year')
            {bed_live}
          GROUP BY 1
          UNION ALL
          SELECT (b.inbed_date::date + INTERVAL '1 year') AS ly_dt, SUM(b.amount) AS bed_cnt
          FROM t_dep_count_inbed b
          WHERE b.inbed_date >= (%(start)s::timestamp - INTERVAL '1 year')
            AND b.inbed_date <  (%(end)s::timestamp   - INTERVAL '1 year')
            AND b.inbed_date < CURRENT_DATE
            {bed_hist}
          GROUP BY 1
        ),
        bed_ly AS (
          SELECT (ly_dt + INTERVAL '1 year')::date AS dt,
                 COALESCE(SUM(bed_cnt), 0) AS bed_last_year
          FROM bed_ly_base
          GROUP BY 1
        ),

        bed_prev_base AS (
          SELECT r.adm_date::date AS prev_dt, COUNT(r.mdtrt_id) AS bed_cnt
          FROM t_workload_inbed_reg_f r
          WHERE r.adm_date >= %(prev_start)s AND r.adm_date < %(prev_end)s
            {bed_live}
          GROUP BY 1
          UNION ALL
          SELECT b.inbed_date::date AS prev_dt, SUM(b.amount) AS bed_cnt
          FROM t_dep_count_inbed b
          WHERE b.inbed_date >= %(prev_start)s AND b.inbed_date < %(prev_end)s
            AND b.inbed_date < CURRENT_DATE
            {bed_hist}
          GROUP BY 1
        ),
        bed_prev AS (
          SELECT
            (prev_dt + (%(len_days)s || ' days')::interval)::date AS dt,
            COALESCE(SUM(bed_cnt), 0) AS bed_prev_period
          FROM bed_prev_base
          GROUP BY 1
        ),

        joined AS (
          SELECT
            d.dt,
            rc.revenue,
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

          CASE
            WHEN last_year IS NULL OR last_year = 0 THEN NULL
            ELSE ROUND((revenue - last_year) / last_year * 100.0, 2)
          END AS yoy_pct,

          CASE
            WHEN prev_period IS NULL OR prev_period = 0 THEN NULL
            ELSE ROUND((revenue - prev_period) / prev_period * 100.0, 2)
          END AS mom_pct,

          CASE
            WHEN bed_last_year IS NULL OR bed_last_year = 0 THEN NULL
            ELSE ROUND((bed_value - bed_last_year) / bed_last_year * 100.0, 2)
          END AS bed_yoy_pct,

          CASE
            WHEN bed_prev_period IS NULL OR bed_prev_period = 0 THEN NULL
            ELSE ROUND((bed_value - bed_prev_period) / bed_prev_period * 100.0, 2)
          END AS bed_mom_pct
        FROM joined
        ORDER BY dt;
        """
        return self._query_rows(sql, params)
