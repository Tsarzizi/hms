import logging
from datetime import datetime, timedelta
from decimal import Decimal

from ..utils.db import get_conn, put_conn

logger = logging.getLogger("inpatient_total_revenue.repository")

from datetime import date
from typing import Any, Dict, List, Optional


def _norm_docs(doc_or_docs) -> Optional[List[str]]:
    """
    统一把医生参数变成 List[str] 或 None
    """
    if doc_or_docs is None:
        return None
    if isinstance(doc_or_docs, list):
        out = [str(x).strip() for x in doc_or_docs if str(x).strip()]
        return out or None
    s = str(doc_or_docs).strip()
    if not s:
        return None
    if "," in s:
        out = [p.strip() for p in s.split(",") if p.strip()]
        return out or None
    return [s]


def _split_history_realtime(start: date, end: date, today: date):
    """
    把 [start, end) 划分成：
    - 历史区间 [hist_start, hist_end)  （落在 today 之前的部分）
    - 实时区间 [rt_start,   rt_end)    （落在 today 及之后的部分）
    若某一段不存在，则对应返回 (None, None)
    """
    hist_start = start
    hist_end = min(end, today)

    rt_start = max(start, today)
    rt_end = end

    if hist_start >= hist_end:
        hist_start = hist_end = None
    if rt_start >= rt_end:
        rt_start = rt_end = None

    return hist_start, hist_end, rt_start, rt_end


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

    # ========== 明细查询：历史/实时 + 科室/医生 + item_class 聚合 ==========

    def _query_dep_history(
            self,
            start: date,
            end: date,
            deps: Optional[List[str]],
    ) -> List[Dict[str, Any]]:
        """
        历史部分（科室维度）：
        - 从物化视图 t_dep_income_inp 查询
        - 【按科室名称 dep_name 过滤】
        - 查询结果仍然包含 dep_code（HIS科室编码）+ dep_name
        """
        params: Dict[str, Any] = {"start": start, "end": end, "deps": deps}
        sql = """
        SELECT
          x.rcpt_date::date          AS date,
          x.dep_code::text           AS department_code,   -- HIS 科室编码
          x.dep_name::text           AS department_name,   -- 绩效科室名称
          x.item_class_name::text    AS item_class_name,
          SUM(x.charges)             AS revenue,
          SUM(x.amount)              AS quantity
        FROM t_dep_income_inp x
        WHERE x.rcpt_date >= %(start)s
          AND x.rcpt_date <  %(end)s
          -- ⭐ 历史部分按科室“名称”筛选
          AND (%(deps)s IS NULL OR x.dep_name = ANY(%(deps)s))
        GROUP BY 1,2,3,4
        ORDER BY 1,2,4;
        """
        return self._query_rows(sql, params)

    def _query_dep_realtime(
            self,
            start: date,
            end: date,
            deps: Optional[List[str]],
    ) -> List[Dict[str, Any]]:
        """
        实时部分（科室维度）：
        - 从收费原表 t_workload_inp_f 查询
        - 按日期 + 科室 + item_class_name 聚合
        """
        params: Dict[str, Any] = {"start": start, "end": end, "deps": deps}
        sql = """
        SELECT
          f.rcpt_date::date                      AS date,
          f.patient_in_dept::text                AS department_code,
          dep."绩效科室名称"::text               AS department_name,
          f.item_class_name::text                AS item_class_name,
          SUM(f.charges)                         AS revenue,
          SUM(f.amount)                          AS quantity
        FROM t_workload_inp_f f
        LEFT JOIN t_workload_dep_def2his dep
          ON dep."HIS科室编码" = f.patient_in_dept
        WHERE f.rcpt_date >= %(start)s
          AND f.rcpt_date <  %(end)s
          AND (%(deps)s IS NULL OR f.patient_in_dept = ANY(%(deps)s))
        GROUP BY 1,2,3,4
        ORDER BY 1,2,4;
        """
        return self._query_rows(sql, params)

    # def _query_dep_realtime(
    #     self,
    #     start: date,
    #     end: date,
    #     deps: Optional[List[str]],
    # ) -> List[Dict[str, Any]]:
    #     """
    #     实时部分（科室维度）：
    #     - 从 t_workload_inp_f 查询
    #     - 通过 dep 表获取“绩效科室名称”
    #     - 【按绩效科室名称过滤】
    #     """
    #     params: Dict[str, Any] = {"start": start, "end": end, "deps": deps}
    #     sql = """
    #     SELECT
    #       f.rcpt_date::date                      AS date,
    #       f.patient_in_dept::text                AS department_code,       -- HIS 科室编码
    #       dep."绩效科室名称"::text               AS department_name,       -- 绩效科室名称
    #       f.item_class_name::text                AS item_class_name,
    #       SUM(f.charges)                         AS revenue,
    #       SUM(f.amount)                          AS quantity
    #     FROM t_workload_inp_f f
    #     LEFT JOIN t_workload_dep_def2his dep
    #       ON dep."HIS科室编码" = f.patient_in_dept
    #     WHERE f.rcpt_date >= %(start)s
    #       AND f.rcpt_date <  %(end)s
    #       -- ⭐ 实时部分同样按“绩效科室名称”筛选
    #       AND (
    #         %(deps)s IS NULL
    #         OR dep."绩效科室名称" = ANY(%(deps)s)
    #       )
    #     GROUP BY 1,2,3,4
    #     ORDER BY 1,2,4;
    #     """
    #     return self._query_rows(sql, params)

    def _query_doc_realtime(
            self,
            start: date,
            end: date,
            deps: Optional[List[str]],
            docs: Optional[List[str]],
    ) -> List[Dict[str, Any]]:
        """
        实时部分（医生维度）：
        - 从收费原表 t_workload_inp_f 查询
        - 按日期 + 科室 + 医生 + item_class_name 聚合
        """
        params: Dict[str, Any] = {
            "start": start,
            "end": end,
            "deps": deps,
            "docs": docs,
        }
        sql = """
        SELECT
          f.rcpt_date::date                      AS date,
          dep."绩效科室ID"::text                 AS department_code,
          dep."绩效科室名称"::text               AS department_name,
          f.order_doctor::text                   AS doctor_id,
          doc."姓名"::text                       AS doctor_name,
          f.item_class_name::text                AS item_class_name,
          SUM(f.charges)                         AS revenue,
          SUM(f.amount)                          AS quantity
        FROM t_workload_inp_f f
        LEFT JOIN t_workload_doc_2dep_def doc
          ON doc."工号" = f.order_doctor
        LEFT JOIN t_workload_dep_def2his dep
          ON dep."HIS科室编码" = f.patient_in_dept
        WHERE f.rcpt_date >= %(start)s
          AND f.rcpt_date <  %(end)s
          AND (%(deps)s IS NULL OR dep."绩效科室ID" = ANY(%(deps)s))
          AND (%(docs)s IS NULL OR f.order_doctor = ANY(%(docs)s))
        GROUP BY 1,2,3,4,5,6
        ORDER BY 1,2,4,6;
        """
        return self._query_rows(sql, params)

    def _query_doc_history(
            self,
            start: date,
            end: date,
            deps: Optional[List[str]],
            docs: Optional[List[str]],
    ) -> List[Dict[str, Any]]:
        """
        历史部分（医生维度）：
        - 从 t_doc_fee_inp 查询
        - 通过 map_dep 映射到绩效科室
        - 【按 map_dep."绩效科室名称" 来过滤】
        """
        params: Dict[str, Any] = {
            "start": start,
            "end": end,
            "deps": deps,
            "docs": docs,
        }
        sql = """
        SELECT
          x.billing_date::date                   AS date,
          map_dep."绩效科室ID"::text             AS department_code,    -- 绩效科室ID
          map_dep."绩效科室名称"::text           AS department_name,    -- 绩效科室名称
          x.doc_code::text                       AS doctor_id,
          x.doc_name::text                       AS doctor_name,
          x.item_class_name::text                AS item_class_name,
          SUM(x.costs)                           AS revenue,
          SUM(x.amount)                          AS quantity
        FROM t_doc_fee_inp x
        LEFT JOIN t_workload_doc_2dep_def map_dep
          ON map_dep."工号" = x.doc_code
        WHERE x.billing_date >= %(start)s
          AND x.billing_date <  %(end)s
          -- ⭐ 历史部分按“绩效科室名称”来筛选
          AND (
            %(deps)s IS NULL
            OR map_dep."绩效科室名称" = ANY(%(deps)s)
          )
          AND (%(docs)s IS NULL OR x.doc_code = ANY(%(docs)s))
        GROUP BY 1,2,3,4,5,6
        ORDER BY 1,2,4,6;
        """
        return self._query_rows(sql, params)

    def _aggregate_detail_rows(
            self,
            rows: List[Dict[str, Any]],
            has_deps: bool,
            has_docs: bool,
    ) -> List[Dict[str, Any]]:
        """
        把历史 + 实时查询结果合并，并按业务要求分组：

        1）无部门、无医生筛选：
            按 (date, department_code) 分组
            → 每天每个科室一行，收入/数量为该科室所有项目合计

        2）有部门筛选、无医生：
            按 (date, department_code, item_class_name) 分组
            → 每天每个科室每个项目类型一行

        3）有医生筛选（不论是否传 departments）：
            按 (date, department_code, doctor_id, item_class_name) 分组
            → 每天每个科室每个医生每个项目类型一行
        """
        agg: Dict[tuple, Dict[str, Any]] = {}

        for r in rows:
            date_val = r.get("date")
            dep_code = r.get("department_code")
            dep_name = r.get("department_name")
            doc_id = r.get("doctor_id")
            doc_name = r.get("doctor_name")
            item_class = r.get("item_class_name")

            if not has_deps and not has_docs:
                # 情况 1：无部门、无医生筛选 → 按日期+科室汇总
                key = (date_val, dep_code)
            elif has_deps and not has_docs:
                # 情况 2：有部门、无医生 → 按日期+科室+项目类型分组
                key = (date_val, dep_code, item_class)
            else:
                # 情况 3：有医生筛选 → 按日期+科室+医生+项目类型分组
                key = (date_val, dep_code, doc_id, item_class)

            if key not in agg:
                row_out: Dict[str, Any] = {
                    "date": date_val,
                    "department_code": dep_code,
                    "department_name": dep_name,
                    "revenue": float(r.get("revenue") or 0),
                    "quantity": float(r.get("quantity") or 0),
                }
                # 情况 2 和 3 都要带 item_class_name
                if has_deps or has_docs:
                    row_out["item_class_name"] = item_class
                # 情况 3 需要医生信息
                if has_docs:
                    row_out["doctor_id"] = doc_id
                    row_out["doctor_name"] = doc_name

                agg[key] = row_out
            else:
                agg[key]["revenue"] += float(r.get("revenue") or 0)
                agg[key]["quantity"] += float(r.get("quantity") or 0)

        result = list(agg.values())
        # 排序：按日期 → 科室 → 医生 → 项目类型
        result.sort(
            key=lambda x: (
                x.get("date") or "",
                x.get("department_code") or "",
                x.get("doctor_id") or "",
                x.get("item_class_name") or "",
            )
        )
        return result

    def get_revenue_details(
            self,
            start: date,
            end: Optional[date] = None,
            departments=None,
            doctor_ids=None,
    ) -> Dict[str, Any]:
        """
        明细查询统一入口（前端不分页）：

        - departments：前端传来的科室名称列表（或 None）
        - doctor_ids：医生工号列表（或 None）

        分组规则：
          1）无部门、无医生：日期 + 科室
          2）有部门、无医生：日期 + 科室 + 项目类型
          3）有医生（不管是否传部门）：日期 + 科室 + 医生 + 项目类型
        """
        if end is None:
            end = start + timedelta(days=1)

        deps = _norm_deps(departments)
        docs = _norm_docs(doctor_ids)

        has_deps = bool(deps)
        has_docs = bool(docs)

        today = date.today()
        hist_start, hist_end, rt_start, rt_end = _split_history_realtime(
            start, end, today
        )

        rows: List[Dict[str, Any]] = []

        if not has_docs:
            # 无医生筛选 → 科室维度（历史 + 实时）
            if hist_start and hist_end:
                rows += self._query_dep_history(hist_start, hist_end, deps)
            if rt_start and rt_end:
                rows += self._query_dep_realtime(rt_start, rt_end, deps)

            merged = self._aggregate_detail_rows(
                rows,
                has_deps=has_deps,
                has_docs=False,
            )
        else:
            # 有医生筛选 → 医生维度（历史 + 实时）
            if hist_start and hist_end:
                rows += self._query_doc_history(hist_start, hist_end, deps, docs)
            if rt_start and rt_end:
                rows += self._query_doc_realtime(rt_start, rt_end, deps, docs)

            merged = self._aggregate_detail_rows(
                rows,
                has_deps=has_deps,
                has_docs=True,
            )

        return {"rows": merged, "total": len(merged)}

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
                return Decimal(str(row[0]))
        finally:
            put_conn(conn)


    # ========== 业务查询 ==========
    def get_departments(self) -> List[Dict[str, Any]]:
        """
        科室列表：来自 t_workload_doc_2dep_def
        返回结构: [{"code": "绩效科室ID", "name": "绩效科室名称"}, ...]
        """
        sql = """
        SELECT DISTINCT
          d."绩效科室ID"   AS dep_id,
          d."绩效科室名称" AS dep_name
        FROM t_workload_doc_2dep_def d
        WHERE d."绩效科室ID" IS NOT NULL
          AND d."绩效科室ID" <> ''
          AND d."绩效科室名称" IS NOT NULL
          AND d."绩效科室名称" <> ''
        ORDER BY d."绩效科室ID";
        """
        rows = self._query_rows(sql, {})
        return [{"code": str(r["dep_id"]), "name": str(r["dep_name"])} for r in rows]

    def get_doctors(self) -> List[Dict[str, Any]]:
        """
        医生列表：包含所属科室
        返回结构:
        [
          {"doc_id": "...", "doc_name": "...", "dep_id": "...", "dep_name": "..."},
          ...
        ]
        """
        sql = """
        SELECT
          d."工号"         AS doc_id,
          d."姓名"         AS doc_name,
          d."绩效科室ID"   AS dep_id,
          d."绩效科室名称" AS dep_name
        FROM t_workload_doc_2dep_def d
        WHERE d."工号" IS NOT NULL
          AND d."工号" <> ''
          AND d."姓名" IS NOT NULL
          AND d."姓名" <> ''
          AND d."绩效科室ID" IS NOT NULL
          AND d."绩效科室ID" <> ''
          AND d."绩效科室名称" IS NOT NULL
          AND d."绩效科室名称" <> ''
        ORDER BY d."绩效科室ID", d."工号";
        """
        rows = self._query_rows(sql, {})
        return [
            {
                "doc_id": str(r["doc_id"]),
                "doc_name": str(r["doc_name"]),
                "dep_id": str(r["dep_id"]),
                "dep_name": str(r["dep_name"]),
            }
            for r in rows
        ]

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
        """
        sql = """
        SELECT
          d."绩效科室ID"   AS dep_id,
          d."绩效科室名称" AS dep_name,
          ARRAY_AGG(
            DISTINCT (d."工号", d."姓名")::record
            ORDER BY (d."工号", d."姓名")::record
          ) AS doctors_raw
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

        # doctors_raw 是 composite 数组：[(工号, 姓名), ...]
        for r in rows:
            raw_list = r.get("doctors_raw") or []
            doctors: List[Dict[str, Any]] = []

            for tup in raw_list:
                if tup is None:
                    continue

                # psycopg2 对 composite 类型会解析成 tuple
                if isinstance(tup, tuple) and len(tup) >= 2:
                    doc_id, doc_name = tup[0], tup[1]
                else:
                    # 兜底：字符串形式 "(1001,张三)"
                    s = str(tup).strip("()")
                    parts = s.split(",", 1)
                    if len(parts) != 2:
                        continue
                    doc_id, doc_name = parts[0], parts[1]

                if not doc_id or not doc_name:
                    continue

                doctors.append({
                    "doc_id": str(doc_id),
                    "doc_name": str(doc_name),
                })

            r["doctors"] = doctors
            r.pop("doctors_raw", None)

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
             -- 历史部分：按科室名称 dep_name 来过滤
            AND (%(deps)s IS NULL OR x.dep_name = ANY(%(deps)s))
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
        dep_hist = " AND x.dep_name = ANY(%(deps)s) " if deps else ""
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
