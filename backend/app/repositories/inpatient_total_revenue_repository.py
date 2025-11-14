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

    def get_dep_doc_map(self) -> List[Dict[str, Any]]:
        """
        科室 → 医生列表 映射：

        返回示例：
        [
          {
            "dep_id": "0101",
            "dep_name": "心内科",
            "doctors": [
              {"doc_id": "1001", "doc_name": "张三"},
              {"doc_id": "1002", "doc_name": "李四"},
            ],
          },
          ...
        ]
        只保留有效的工号 / 姓名 / 绩效科室ID / 绩效科室名称。
        """
        sql = """
        SELECT
          d."绩效科室ID"   AS dep_id,
          d."绩效科室名称" AS dep_name,
          ARRAY_AGG(
            DISTINCT jsonb_build_object(
              'doc_id',   d."工号",
              'doc_name', d."姓名"
            )
            ORDER BY d."工号"
          ) AS doctors
        FROM t_workload_doc_2dep_def d
        WHERE
          d."工号" IS NOT NULL
          AND d."工号" <> ''
          AND d."姓名" IS NOT NULL
          AND d."姓名" <> ''
          AND d."绩效科室ID" IS NOT NULL
          AND d."绩效科室ID" <> ''
          AND d."绩效科室名称" IS NOT NULL
          AND d."绩效科室名称" <> ''
        GROUP BY
          d."绩效科室ID",
          d."绩效科室名称"
        ORDER BY
          d."绩效科室ID";
        """
        rows = self._query_rows(sql, {})
        # rows 里已经是 dep_id / dep_name / doctors（三列），doctors 是 JSONB → Python dict 列表
        return rows

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

    def get_inp_dep_income(
            self,
            start: date,
            end: date,
            departments: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """
        住院在院人数（科室维度）：
        - 历史表 t_dep_count_inbed：查询“今天之前”的在院人数
        - 实时表 t_workload_inbed_reg_f：查询“今天”的在院人数
        - 参数：
            start: 起始日期（含）
            end  : 结束日期（不含）
            departments: 可选的科室编码列表（绩效/His，看你库里 dep_code 存的是什么）
        - 返回：
            [
              {
                "inbed_date": date,
                "dep_code": str,
                "dep_name": str,
                "amount": int
              },
              ...
            ]
        """
        deps = _norm_deps(departments)

        params: Dict[str, Any] = {
            "start": start,
            "end": end,
            "deps": deps,
        }

        sql = """
        WITH params AS (
          SELECT
            %(start)s::date AS start_date,
            %(end)s::date   AS end_date,
            CURRENT_DATE    AS today,
            %(deps)s        AS dep_list
        ),

        inbed_data AS (
          -- ① 历史在院数据：t_dep_count_inbed，查“今天之前”的数据
          SELECT
              h.inbed_date::date AS inbed_date,
              h.dep_code,
              h.dep_name,
              SUM(h.amount)      AS amount
          FROM t_dep_count_inbed AS h
          JOIN params p ON TRUE
          WHERE h.inbed_date::date >= p.start_date
            AND h.inbed_date::date <  LEAST(p.end_date, p.today)
            AND (
                  p.dep_list IS NULL
                  OR h.dep_code = ANY(p.dep_list)
                )
          GROUP BY
              h.inbed_date::date,
              h.dep_code,
              h.dep_name

          UNION ALL

          -- ② 当天实时在院数据：t_workload_inbed_reg_f，只查“今天”的数据
          SELECT
              i.adm_date::date   AS inbed_date,
              i.adm_dept_code    AS dep_code,
              i.adm_dept_name    AS dep_name,
              COUNT(i.mdtrt_id)  AS amount
          FROM t_workload_inbed_reg_f AS i
          JOIN params p ON TRUE
          WHERE i.adm_date::date >= p.start_date
            AND i.adm_date::date <  p.end_date
            AND i.adm_date::date =  p.today
            AND (
                  p.dep_list IS NULL
                  OR i.adm_dept_code = ANY(p.dep_list)
                )
          GROUP BY
              i.adm_date::date,
              i.adm_dept_code,
              i.adm_dept_name
        )

        SELECT
            inbed_date,
            dep_code,
            dep_name,
            SUM(amount) AS amount
        FROM inbed_data
        GROUP BY
            inbed_date,
            dep_code,
            dep_name
        ORDER BY
            inbed_date DESC,
            dep_code;
        """

        return self._query_rows(sql, params)
    def get_inp_doc_fee(
            self,
            start: date,
            end: date,
            doctors: Optional[List[str]] = None,
    ):
        """
        医生费用明细（住院）：
        - 历史表 t_doc_fee_inp 查今天之前的数据
        - 实时表 t_workload_inp_f 查今天当天的数据
        - 可选参数 doctors: 医生工号列表；为空则不筛选
        """

        # 转换 doctor 列表 → PostgreSQL 可用数组
        doc_list = None
        if doctors:
            doc_list = [str(d).strip() for d in doctors if str(d).strip()]

        params = {
            "start": start,
            "end": end,
            "doctors": doc_list,
        }

        sql = """
        WITH params AS (
          SELECT 
            %(start)s::date AS start_date,
            %(end)s::date   AS end_date,
            %(doctors)s     AS doctor_list
        ),

        doc_fee AS (
          -- ① 历史表：查“今天之前”的数据
          SELECT
              t.billing_date::date     AS billing_date,
              t.doc_code               AS doc_code,
              t.item_class_name        AS item_class_name,
              SUM(t.costs)             AS costs,
              SUM(t.amount)            AS amount
          FROM t_doc_fee_inp AS t
          JOIN params p ON TRUE
          WHERE t.billing_date::date >= p.start_date
            AND t.billing_date::date < LEAST(p.end_date, CURRENT_DATE)
            AND (
                  p.doctor_list IS NULL
                  OR t.doc_code = ANY(p.doctor_list)
                )
          GROUP BY
              t.billing_date::date,
              t.doc_code,
              t.item_class_name

          UNION ALL

          -- ② 实时表：查“今天”的数据
          SELECT
              i.rcpt_date::date        AS billing_date,
              i.order_doctor           AS doc_code,
              i.item_class_name        AS item_class_name,
              SUM(i.charges)           AS costs,
              SUM(i.amount)            AS amount
          FROM t_workload_inp_f AS i
          JOIN params p ON TRUE
          WHERE i.rcpt_date::date >= p.start_date
            AND i.rcpt_date::date <  p.end_date
            AND i.rcpt_date::date =  CURRENT_DATE
            AND (
                  p.doctor_list IS NULL
                  OR i.order_doctor = ANY(p.doctor_list)
                )
          GROUP BY
              i.rcpt_date::date,
              i.order_doctor,
              i.item_class_name
        )

        SELECT
          billing_date,
          doc_code,
          item_class_name,
          costs,
          amount
        FROM doc_fee
        ORDER BY
          billing_date,
          doc_code,
          item_class_name;
        """

        return self._query_rows(sql, params)

    def get_revenue_details(
            self,
            start: date,
            end: date,
            departments=None,
            limit: int = 20,
            offset: int = 0,
    ) -> Dict[str, Any]:
        """
        明细查询（日期+科室聚合），仓储层只负责查原始值：
        - 当前收入 revenue_raw
        - 去年同期收入 ly_revenue_raw
        - 上一周期收入 prev_revenue_raw
        - 当前床日 bed_value
        - 去年同期床日 bed_last_year
        具体的同比/环比/趋势由应用层计算。
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
          -- ✅ 当前区间收入：
          --   - 历史 (< today) 从物化视图 t_dep_income_inp 取
          --   - 当天 (>= today) 从实时表 t_workload_inp_f 取
          SELECT
            x.rcpt_date::date AS dt,
            x.dep_code        AS dep_code,
            x.dep_name        AS dep_name,
            x.charges         AS charges
          FROM t_dep_income_inp x
          WHERE x.rcpt_date >= %(start)s
            AND x.rcpt_date <  LEAST(%(end)s, CURRENT_DATE)
            AND (%(deps)s IS NULL OR x.dep_code = ANY(%(deps)s))

          UNION ALL

          SELECT
            f.rcpt_date::date AS dt,
            f.patient_in_dept AS dep_code,
            d."绩效科室名称"  AS dep_name,
            f.charges         AS charges
          FROM t_workload_inp_f f
          LEFT JOIN t_workload_dep_def2his d
            ON d."HIS科室编码"::text = f.patient_in_dept::text
          WHERE f.rcpt_date >= GREATEST(%(start)s, CURRENT_DATE)
            AND f.rcpt_date <  %(end)s
            AND (%(deps)s IS NULL OR f.patient_in_dept = ANY(%(deps)s))
        ),
        cur_rev AS (
          SELECT dt, dep_code, MAX(dep_name) AS dep_name, SUM(charges) AS revenue_raw
          FROM base
          GROUP BY 1,2
        ),

        -- ✅ 去年同期：完全是历史数据，统一走物化视图
        ly_base AS (
          SELECT
            (x.rcpt_date::date + INTERVAL '1 year') AS dt,
            x.dep_code  AS dep_code,
            x.charges   AS charges
          FROM t_dep_income_inp x
          WHERE x.rcpt_date >= (%(start)s::timestamp - INTERVAL '1 year')
            AND x.rcpt_date <  (%(end)s::timestamp   - INTERVAL '1 year')
            AND (%(deps)s IS NULL OR x.dep_code = ANY(%(deps)s))
        ),
        ly_rev AS (
          SELECT dt, dep_code, SUM(charges) AS ly_revenue_raw
          FROM ly_base
          GROUP BY 1,2
        ),

        -- ✅ 上一周期：同样是历史区间，仍然只查物化视图
        prev_base AS (
          SELECT
            (x.rcpt_date::date + INTERVAL '1 day') AS dt,
            x.dep_code  AS dep_code,
            x.charges   AS charges
          FROM t_dep_income_inp x
          WHERE x.rcpt_date >= (%(start)s::timestamp - INTERVAL '1 day')
            AND x.rcpt_date <  (%(end)s::timestamp   - INTERVAL '1 day')
            AND (%(deps)s IS NULL OR x.dep_code = ANY(%(deps)s))
        ),
        prev_rev AS (
          SELECT dt, dep_code, SUM(charges) AS prev_revenue_raw
          FROM prev_base
          GROUP BY 1,2
        ),

        -- ✅ 床日部分沿用现在的“历史=物化视图”设计
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
            c.dt               AS date,
            c.dep_code         AS department_code,
            c.dep_name         AS department_name,
            c.revenue_raw      AS revenue_raw,
            lr.ly_revenue_raw  AS ly_revenue_raw,
            pr.prev_revenue_raw AS prev_revenue_raw,
            cb.bed_cnt         AS bed_value,
            lb.bed_cnt         AS bed_last_year
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
        趋势查询：仓储层只查原始值（收入/床日及对比区间），
        yoy/mom 等百分比全部交给应用层计算。
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

        -- 去年收入：先取“去年真实日期 src_date”，再 +1 年对齐到当前日期
        rev_ly_base AS (
          SELECT f.rcpt_date::date AS src_date, SUM(f.charges) AS charges
          FROM t_workload_inp_f f
          WHERE f.rcpt_date >= (%(start)s::timestamp - INTERVAL '1 year')
            AND f.rcpt_date <  (%(end)s::timestamp   - INTERVAL '1 year')
            {dep_live}
          GROUP BY 1
          UNION ALL
          SELECT x.rcpt_date::date AS src_date, SUM(x.charges) AS charges
          FROM t_dep_income_inp x
          WHERE x.rcpt_date >= (%(start)s::timestamp - INTERVAL '1 year')
            AND x.rcpt_date <  (%(end)s::timestamp   - INTERVAL '1 year')
            {dep_hist}
          GROUP BY 1
        ),
        rev_ly AS (
          SELECT (src_date + INTERVAL '1 year')::date AS dt,
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

        -- 去年床日：同样使用 src_date + 1 年对齐
        bed_ly_base AS (
          SELECT r.adm_date::date AS src_date, COUNT(r.mdtrt_id) AS bed_cnt
          FROM t_workload_inbed_reg_f r
          WHERE r.adm_date >= (%(start)s::timestamp - INTERVAL '1 year')
            AND r.adm_date <  (%(end)s::timestamp   - INTERVAL '1 year')
            {bed_live}
          GROUP BY 1
          UNION ALL
          SELECT b.inbed_date::date AS src_date, SUM(b.amount) AS bed_cnt
          FROM t_dep_count_inbed b
          WHERE b.inbed_date >= (%(start)s::timestamp - INTERVAL '1 year')
            AND b.inbed_date <  (%(end)s::timestamp   - INTERVAL '1 year')
            AND b.inbed_date < CURRENT_DATE
            {bed_hist}
          GROUP BY 1
        ),
        bed_ly AS (
          SELECT (src_date + INTERVAL '1 year')::date AS dt,
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
          dt                AS date,
          revenue           AS revenue,
          last_year         AS last_year,
          prev_period       AS prev_period,
          bed_value         AS bed_value,
          bed_last_year     AS bed_last_year,
          bed_prev_period   AS bed_prev_period
        FROM joined
        ORDER BY dt;
        """
        return self._query_rows(sql, params)
