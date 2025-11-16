import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

from ..utils.db import get_conn, put_conn

logger = logging.getLogger("inpatient_total_revenue.repository")


def _norm_deps(dep_or_deps) -> Optional[List[str]]:
    """
    统一把科室参数变成 List[str] 或 None（用于科室名称）
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


def _norm_docs(doc_or_docs) -> Optional[List[str]]:
    """
    统一把医生参数变成 List[str] 或 None（用于医生工号）
    """
    if doc_or_docs is None:
        return None
    if isinstance(doc_or_docs, (list, tuple, set)):
        arr = [str(x).strip() for x in doc_or_docs if x is not None and str(x).strip()]
        return arr or None
    s = str(doc_or_docs).strip()
    if not s:
        return None
    if "," in s:
        arr = [x.strip() for x in s.split(",") if x.strip()]
        return arr or None
    return [s]


def _prim_for_json(v: Any):
    """
    将 DB 值转成 JSON 友好的基础类型
    """
    from datetime import datetime
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    return v


class InpatientTotalRevenueRepository:
    """
    Repository：只负责和 DB 交互，Service 不直接写 SQL。

    只暴露两个业务方法：
      - get_dep_doc_map：初始化用，返回科室+医生映射
      - get_full_revenue：统一返回 summary + timeseries + details
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

    # ========== 业务：科室 → 医生 映射 ==========

    def get_dep_doc_map(self) -> List[Dict[str, Any]]:
        """
        科室 → 医生列表 映射

        返回结构示例：
        [
          {
            "dep_id": "0101",
            "dep_name": "心内科",
            "doctors": [
              {"doc_id": "8035", "doc_name": "张三"},
              {"doc_id": "8036", "doc_name": "李四"}
            ]
          },
          ...
        ]
        """
        sql = """
        SELECT
          d."绩效科室ID"   AS dep_id,
          d."绩效科室名称" AS dep_name,
          JSON_AGG(DISTINCT jsonb_build_object(
            'doc_id',   d."工号",
            'doc_name', d."姓名"
          )) AS doctors
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
        return rows

    # ========== 内部：科室模式基础数据（历史 + 实时） ==========

    def _query_dep_income_rows(
        self,
        start: date,
        end: date,
        departments=None,
    ) -> List[Dict[str, Any]]:
        """
        科室模式基础收入数据：
        - 历史：t_dep_income_inp
        - 当日实时：t_workload_inp_f + t_workload_dep_def2his
        统一输出字段：
        - rcpt_date
        - dep_code
        - dep_name
        - item_class_name
        - charges
        - amount
        """
        deps = _norm_deps(departments)
        params: Dict[str, Any] = {
            "start_date": start,
            "end_date": end,
            "departments": deps,
        }
        sql = """
        WITH dep_incom AS (
            ----------------------------------------------------------------
            -- 历史部门收入：t_dep_income_inp
            ----------------------------------------------------------------
            SELECT
              x.rcpt_date::date        AS rcpt_date,
              x.dep_code::text         AS dep_code,
              x.dep_name::text         AS dep_name,
              x.item_class_name::text  AS item_class_name,
              x.charges::numeric       AS charges,
              x.amount::numeric        AS amount
            FROM t_dep_income_inp x
            WHERE
              x.rcpt_date < CURRENT_DATE
              AND (
                %(departments)s IS NULL
                OR x.dep_name = ANY(%(departments)s)
              )

            UNION ALL

            ----------------------------------------------------------------
            -- 当日实时部门收入：t_workload_inp_f + t_workload_dep_def2his
            ----------------------------------------------------------------
            SELECT
              f.rcpt_date::date        AS rcpt_date,
              f.patient_in_dept::text  AS dep_code,
              d."绩效科室名称"::text    AS dep_name,
              f.item_class_name::text  AS item_class_name,
              SUM(f.charges)::numeric  AS charges,
              SUM(f.amount)::numeric   AS amount
            FROM t_workload_inp_f f
            LEFT JOIN t_workload_dep_def2his d
              ON d."HIS科室编码"::text = f.patient_in_dept::text
            WHERE
              f.rcpt_date >= CURRENT_DATE
              AND f.rcpt_date <  CURRENT_DATE + 1
              AND (
                %(departments)s IS NULL
                OR d."绩效科室名称" = ANY(%(departments)s)
              )
            GROUP BY
              f.rcpt_date,
              f.patient_in_dept,
              d."绩效科室名称",
              f.item_class_name
        )
        SELECT
          rcpt_date,
          dep_code,
          dep_name,
          item_class_name,
          charges,
          amount
        FROM dep_incom
        WHERE
          rcpt_date >= %(start_date)s
          AND rcpt_date <  %(end_date)s;
        """
        return self._query_rows(sql, params)

    # ========== 内部：医生模式基础数据（历史 + 实时） ==========

    def _query_doc_income_rows(
        self,
        start: date,
        end: date,
        doctors=None,
    ) -> List[Dict[str, Any]]:
        """
        医生模式基础数据（历史 + 实时）：

        约定：
        - 只按医生工号过滤（前端把 doc_id 传进来）
        - 不做任何科室相关 join / where
        - 统一输出字段：
            rcpt_date, doc_code, doc_name, item_class_name, costs, amount
        """
        docs = _norm_docs(doctors)
        params: Dict[str, Any] = {
            "start_date": start,
            "end_date": end,
            "doctors": docs,
        }
        sql = """
        WITH doc_income AS (
          ----------------------------------------------------------------
          -- 1. 实时：t_workload_inp_f
          ----------------------------------------------------------------
          SELECT 
            f.rcpt_date::date        AS rcpt_date,
            f.order_doctor::text     AS doc_code,
            d."姓名"::text           AS doc_name,
            f.item_class_name::text  AS item_class_name,
            SUM(f.costs)::numeric    AS costs,
            SUM(f.amount)::numeric   AS amount
          FROM t_workload_inp_f f
          LEFT JOIN t_workload_doc_2dep_def d 
            ON f.order_doctor = d."工号"
          WHERE 
            f.rcpt_date >= %(start_date)s
            AND f.rcpt_date <  %(end_date)s
            AND (
                %(doctors)s IS NULL
                OR f.order_doctor = ANY(%(doctors)s)
            )
          GROUP BY 
            f.rcpt_date,
            f.order_doctor,
            d."姓名",
            f.item_class_name

          UNION ALL

          ----------------------------------------------------------------
          -- 2. 历史：t_doc_fee_inp
          ----------------------------------------------------------------
          SELECT
            f.billing_date::date     AS rcpt_date,
            f.doc_code::text         AS doc_code,
            f.doc_name::text         AS doc_name,
            f.item_class_name::text  AS item_class_name,
            SUM(f.costs)::numeric    AS costs,
            SUM(f.amount)::numeric   AS amount
          FROM t_doc_fee_inp f
          WHERE
            f.billing_date >= %(start_date)s
            AND f.billing_date <  %(end_date)s
            AND (
                %(doctors)s IS NULL
                OR f.doc_code = ANY(%(doctors)s)
            )
          GROUP BY
            f.billing_date,
            f.doc_code,
            f.doc_name,
            f.item_class_name
        )
        SELECT 
          rcpt_date,
          doc_code,
          doc_name,
          item_class_name,
          costs,
          amount
        FROM doc_income
        ORDER BY rcpt_date, doc_code, item_class_name;
        """
        return self._query_rows(sql, params)

    # ========== 内部：床日（按日期聚合） ==========

    def _query_bed_by_date(
        self,
        start: date,
        end: date,
        departments=None,
    ) -> List[Dict[str, Any]]:
        """
        床日按日期聚合：
        - 实时：t_workload_inbed_reg_f
        - 历史：t_dep_count_inbed
        """
        deps = _norm_deps(departments)
        params: Dict[str, Any] = {"start": start, "end": end, "deps": deps}
        sql = """
        WITH bed_raw AS (
          -- 实时
          SELECT
            r.adm_date::date   AS dt,
            r.adm_dept_code    AS dep_code,
            COUNT(r.mdtrt_id)  AS bed_cnt
          FROM t_workload_inbed_reg_f r
          WHERE r.adm_date >= %(start)s
            AND r.adm_date <  %(end)s
            AND (%(deps)s IS NULL OR r.adm_dept_code = ANY(%(deps)s))
          GROUP BY 1,2
          UNION ALL
          -- 历史物化视图
          SELECT
            b.inbed_date::date AS dt,
            b.dep_code,
            b.amount           AS bed_cnt
          FROM t_dep_count_inbed b
          WHERE b.inbed_date >= %(start)s
            AND b.inbed_date <  %(end)s
            AND b.inbed_date < CURRENT_DATE
            AND (%(deps)s IS NULL OR b.dep_code = ANY(%(deps)s))
        )
        SELECT
          dt::date       AS date,
          SUM(bed_cnt)   AS bed_days
        FROM bed_raw
        GROUP BY dt
        ORDER BY dt;
        """
        return self._query_rows(sql, params)

    # ========== 统一出口：summary + timeseries + details ==========

    def get_full_revenue(
        self,
        start: date,
        end: Optional[date] = None,
        departments=None,
        doctors=None,
    ) -> Dict[str, Any]:
        """
        统一查询入口：

        - 如果有 doctors（医生工号列表），走“医生模式”（忽略部门）
        - 否则走“科室模式”（按部门名称过滤）
        """
        if end is None:
            end = start + timedelta(days=1)

        deps = _norm_deps(departments)
        docs = _norm_docs(doctors)

        # 1）收入基础数据
        if docs:
            # 医生模式：忽略部门
            base_rows = self._query_doc_income_rows(start, end, docs)
            mode = "doctor"
        else:
            # 科室模式：按部门名称过滤
            base_rows = self._query_dep_income_rows(start, end, deps)
            mode = "department"

        # 2）床日（与科室有关：医生模式下仍可按部门过滤或全院）
        bed_rows = self._query_bed_by_date(start, end, deps)

        # 3）summary：收入合 + 床日合
        total_revenue = 0.0
        for r in base_rows:
            if mode == "doctor":
                total_revenue += float(r.get("costs") or 0)
            else:
                total_revenue += float(r.get("charges") or 0)

        total_bed = 0.0
        for r in bed_rows:
            total_bed += float(r.get("bed_days") or 0)

        summary = {
            "total_revenue": total_revenue,
            "total_bed_days": total_bed,
            "yoy_growth_rate": None,
            "mom_growth_rate": None,
            "bed_day_growth_rate": None,
            "bed_day_mom_growth_rate": None,
            "trend": None,
        }

        # 4）timeseries：按 date 聚合收入 + 床日
        from collections import defaultdict

        rev_by_date: Dict[str, float] = defaultdict(float)
        for r in base_rows:
            dt = r.get("rcpt_date") or r.get("date")
            if not dt:
                continue
            val = float(r.get("costs") or r.get("charges") or 0)
            rev_by_date[str(dt)] += val

        bed_by_date: Dict[str, float] = {}
        for r in bed_rows:
            dt = r.get("date")
            if not dt:
                continue
            bed_by_date[str(dt)] = float(r.get("bed_days") or 0)

        all_dates = sorted(set(rev_by_date.keys()) | set(bed_by_date.keys()))
        ts_rows: List[Dict[str, Any]] = []
        for dt in all_dates:
            ts_rows.append(
                {
                    "date": dt,
                    "revenue": rev_by_date.get(dt, 0.0),
                    "last_year": None,
                    "yoy_pct": None,
                    "mom_pct": None,
                    "bed_yoy_pct": None,
                    "bed_mom_pct": None,
                    "bed_days": bed_by_date.get(dt, 0.0),
                }
            )

        # 5）details：按当前模式分组
        detail_rows: List[Dict[str, Any]] = []

        if mode == "doctor":
            # 医生模式：日期 + 医生 + 项目类
            agg: Dict[tuple, Dict[str, Any]] = {}
            for r in base_rows:
                dt = r.get("rcpt_date")
                doc_code = r.get("doc_code")
                doc_name = r.get("doc_name")
                item_class = r.get("item_class_name")
                costs = float(r.get("costs") or 0)
                amount = float(r.get("amount") or 0)

                key = (dt, doc_code, item_class)
                if key not in agg:
                    agg[key] = {
                        "date": dt,
                        "doctor_id": doc_code,
                        "doctor_name": doc_name,
                        "item_class_name": item_class,
                        "revenue": costs,
                        "quantity": amount,
                    }
                else:
                    agg[key]["revenue"] += costs
                    agg[key]["quantity"] += amount

            detail_rows = sorted(
                agg.values(),
                key=lambda x: (
                    x.get("date") or "",
                    x.get("doctor_id") or "",
                    x.get("item_class_name") or "",
                ),
            )
        else:
            # 科室模式：
            # 无科室筛选：按 日期 + 科室 汇总
            # 有科室筛选：按 日期 + 科室 + 项目类 汇总
            has_deps = bool(deps)
            agg: Dict[tuple, Dict[str, Any]] = {}

            for r in base_rows:
                dt = r.get("rcpt_date")
                dep_code = r.get("dep_code")
                dep_name = r.get("dep_name")
                item_class = r.get("item_class_name")
                charges = float(r.get("charges") or 0)
                amount = float(r.get("amount") or 0)

                if not has_deps:
                    key = (dt, dep_code)
                else:
                    key = (dt, dep_code, item_class)

                if key not in agg:
                    row: Dict[str, Any] = {
                        "date": dt,
                        "department_code": dep_code,
                        "department_name": dep_name,
                        "revenue": charges,
                    }
                    if has_deps:
                        row["item_class_name"] = item_class
                        row["quantity"] = amount
                    agg[key] = row
                else:
                    agg[key]["revenue"] += charges
                    if has_deps:
                        agg[key]["quantity"] = (agg[key].get("quantity") or 0) + amount

            detail_rows = sorted(
                agg.values(),
                key=lambda x: (
                    x.get("date") or "",
                    x.get("department_code") or "",
                    x.get("item_class_name") or "",
                ),
            )

        return {
            "date_range": {"start": start.isoformat(), "end": end.isoformat()},
            "departments": deps,
            "doctors": docs,
            "summary": summary,
            "timeseries": ts_rows,
            "details": detail_rows,
            "total": len(detail_rows),
        }
