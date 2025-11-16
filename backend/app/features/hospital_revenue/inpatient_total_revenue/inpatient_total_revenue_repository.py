# backend/app/repositories/inpatient_total_revenue_repository.py

import logging
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

from backend.app.shared.db import get_conn, put_conn

logger = logging.getLogger("inpatient_total_revenue.repository")


# ========== 小工具函数 ==========

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
    （注意：日期会转成 ISO 字符串，在 get_full_revenue 再转回 date 对象）
    """
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    return v


def _parse_date_str(s: Any) -> Optional[date]:
    if not s:
        return None
    if isinstance(s, date):
        return s
    try:
        # 只取日期部分
        return date.fromisoformat(str(s)[:10])
    except Exception:
        return None


def _shift_year(d: date, years: int) -> date:
    """
    年份平移：用于去年同期日期映射
    """
    try:
        return d.replace(year=d.year + years)
    except ValueError:
        # 处理 2 月 29 日等情况，简单回退到 2 月 28 日
        if d.month == 2 and d.day == 29:
            return d.replace(year=d.year + years, month=2, day=28)
        # 兜底减 365 天
        return d + timedelta(days=365 * years)


def _pct_change(cur: float, base: Optional[float]) -> Optional[float]:
    """
    计算百分比变化：
      - base 为 None：返回 None（无可比数据）
      - base 为 0：
          - 当前也是 0 => 0%
          - 当前非 0   => 0%（按你“初始化也要看到一个数字”的需求处理）
    """
    if base is None:
        return None
    if base == 0:
        # 这里按业务需求处理为 0%，如果你想区分“从 0 涨到 X”可以改成 100。
        return 0.0
    return (cur - base) / base * 100.0


# ========== Repository ==========

class InpatientTotalRevenueRepository:
    """
    Repository：只负责和 DB 交互。

    只暴露两个业务方法：
      - get_dep_doc_map：初始化用，返回科室+医生映射
      - get_full_revenue：统一返回 summary + timeseries + details
    """

    # ------ 通用 DB 工具方法 ------

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

    # ------ 科室 → 医生 映射 ------

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
        # 如果想按工号排序，可以在 Python 再排一下
        for r in rows:
            docs = r.get("doctors") or []
            r["doctors"] = sorted(
                docs,
                key=lambda x: str((x or {}).get("doc_id") or "")
            )
        return rows

    # ------ 科室模式基础数据（历史 + 实时） ------

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

    # ------ 医生模式基础数据（历史 + 实时） ------

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

    # ------ 床日（按日期聚合） ------

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

    # ------ 统一出口：summary + timeseries + details ------

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

        返回：
        {
          "date_range": {...},
          "departments": [...],
          "doctors": [...],
          "summary": {...},        # 含 当前收入/床日 + 同比/环比
          "timeseries": [...],     # 每日收入/床日 + 同比/环比
          "details": [...],
          "total": <明细条数>
        }
        """
        if end is None:
            end = start + timedelta(days=1)

        if end <= start:
            end = start + timedelta(days=1)

        deps = _norm_deps(departments)
        docs = _norm_docs(doctors)

        # ---------- 1）当前区间基础数据 ----------
        if docs:
            mode = "doctor"
            base_rows_cur = self._query_doc_income_rows(start, end, docs)
            base_rows_prev = self._query_doc_income_rows(
                start - (end - start), start, docs
            )
            # 去年同期：start/end 往前平移一年
            last_start = _shift_year(start, -1)
            last_end = _shift_year(end, -1)
            base_rows_last = self._query_doc_income_rows(
                last_start, last_end, docs
            )
        else:
            mode = "department"
            base_rows_cur = self._query_dep_income_rows(start, end, deps)
            base_rows_prev = self._query_dep_income_rows(
                start - (end - start), start, deps
            )
            last_start = _shift_year(start, -1)
            last_end = _shift_year(end, -1)
            base_rows_last = self._query_dep_income_rows(
                last_start, last_end, deps
            )

        # ---------- 2）床日：当前 / 上周期 / 去年同期 ----------
        bed_rows_cur = self._query_bed_by_date(start, end, deps)
        bed_rows_prev = self._query_bed_by_date(
            start - (end - start), start, deps
        )
        bed_rows_last = self._query_bed_by_date(
            last_start, last_end, deps
        )

        # ---------- 3）汇总（summary） ----------
        def sum_rev(rows: List[Dict[str, Any]]) -> float:
            field = "costs" if mode == "doctor" else "charges"
            s = 0.0
            for r in rows:
                s += float(r.get(field) or 0.0)
            return s

        def sum_bed(rows: List[Dict[str, Any]]) -> float:
            s = 0.0
            for r in rows:
                s += float(r.get("bed_days") or 0.0)
            return s

        cur_rev = sum_rev(base_rows_cur)
        prev_rev = sum_rev(base_rows_prev)
        last_rev = sum_rev(base_rows_last)

        cur_bed = sum_bed(bed_rows_cur)
        prev_bed = sum_bed(bed_rows_prev)
        last_bed = sum_bed(bed_rows_last)

        yoy = _pct_change(cur_rev, last_rev)
        mom = _pct_change(cur_rev, prev_rev)
        bed_yoy = _pct_change(cur_bed, last_bed)
        bed_mom = _pct_change(cur_bed, prev_bed)

        summary = {
            # 让前端 extractSummaryFromStd 能识别
            "current": cur_rev,
            "growth_rate": yoy,
            "mom_growth_rate": mom,
            "bed_growth_rate": bed_yoy,
            "bed_mom_growth_rate": bed_mom,
            # 顺便把床日总量也带出去
            "current_bed_days": cur_bed,
        }

        # ---------- 4）timeseries（每日收入 & 床日 + 同比 & 环比） ----------

        from collections import defaultdict

        # 当前区间
        rev_cur_by_date: Dict[date, float] = defaultdict(float)
        for r in base_rows_cur:
            dt = _parse_date_str(r.get("rcpt_date") or r.get("date"))
            if not dt:
                continue
            val = float(r.get("costs") or r.get("charges") or 0.0)
            rev_cur_by_date[dt] += val

        bed_cur_by_date: Dict[date, float] = {}
        for r in bed_rows_cur:
            dt = _parse_date_str(r.get("date"))
            if not dt:
                continue
            bed_cur_by_date[dt] = float(r.get("bed_days") or 0.0)

        # 去年同期
        rev_last_by_date: Dict[date, float] = defaultdict(float)
        for r in base_rows_last:
            dt = _parse_date_str(r.get("rcpt_date") or r.get("date"))
            if not dt:
                continue
            val = float(r.get("costs") or r.get("charges") or 0.0)
            rev_last_by_date[dt] += val

        bed_last_by_date: Dict[date, float] = {}
        for r in bed_rows_last:
            dt = _parse_date_str(r.get("date"))
            if not dt:
                continue
            bed_last_by_date[dt] = float(r.get("bed_days") or 0.0)

        all_dates = sorted(set(rev_cur_by_date.keys()) | set(bed_cur_by_date.keys()))

        ts_rows: List[Dict[str, Any]] = []
        prev_rev_val: Optional[float] = None
        prev_bed_val: Optional[float] = None

        for d in all_dates:
            rev_val = rev_cur_by_date.get(d, 0.0)
            bed_val = bed_cur_by_date.get(d, 0.0)

            # 去年同日
            last_d = _shift_year(d, -1)
            last_rev_val = rev_last_by_date.get(last_d)
            last_bed_val = bed_last_by_date.get(last_d)

            yoy_pct = _pct_change(rev_val, last_rev_val)
            bed_yoy_pct = _pct_change(bed_val, last_bed_val)

            mom_pct = _pct_change(rev_val, prev_rev_val)
            bed_mom_pct = _pct_change(bed_val, prev_bed_val)

            ts_rows.append(
                {
                    "date": d.isoformat(),
                    "revenue": rev_val,
                    "last_year": last_rev_val,
                    "yoy_pct": yoy_pct,
                    "mom_pct": mom_pct,
                    "bed_yoy_pct": bed_yoy_pct,
                    "bed_mom_pct": bed_mom_pct,
                }
            )

            prev_rev_val = rev_val
            prev_bed_val = bed_val

        # ---------- 5）details（三种模式） ----------

        detail_rows: List[Dict[str, Any]] = []

        # 把部门名称拼好（医生模式下用于回填科室列）
        dep_label = None
        if deps:
            dep_label = ",".join(deps)

        if mode == "doctor":
            # 有医生：日期、科室名（用筛选科室名）、医生名、项目类名、花费(costs)、数量
            agg: Dict[tuple, Dict[str, Any]] = {}
            for r in base_rows_cur:
                dt = _parse_date_str(r.get("rcpt_date"))
                if not dt:
                    continue
                dt_str = dt.isoformat()
                doc_code = r.get("doc_code")
                doc_name = r.get("doc_name")
                item_class = r.get("item_class_name")
                costs = float(r.get("costs") or 0.0)
                amount = float(r.get("amount") or 0.0)

                key = (dt_str, doc_code, item_class)
                if key not in agg:
                    agg[key] = {
                        "date": dt_str,
                        "department_name": dep_label,  # 用筛选的科室名回填
                        "doctor_id": doc_code,
                        "doctor_name": doc_name,
                        "item_class_name": item_class,
                        "cost": costs,
                        "revenue": costs,  # 保留兼容字段
                        "quantity": amount,
                    }
                else:
                    agg[key]["cost"] += costs
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
            # - 无科室：日期、科室、收入
            # - 有科室：日期、科室名、项目类名、收入、数量
            has_deps = bool(deps)
            agg: Dict[tuple, Dict[str, Any]] = {}

            for r in base_rows_cur:
                dt = _parse_date_str(r.get("rcpt_date"))
                if not dt:
                    continue
                dt_str = dt.isoformat()
                dep_code = r.get("dep_code")
                dep_name = r.get("dep_name")
                item_class = r.get("item_class_name")
                charges = float(r.get("charges") or 0.0)
                amount = float(r.get("amount") or 0.0)

                if not has_deps:
                    key = (dt_str, dep_name)
                else:
                    key = (dt_str, dep_name, item_class)

                if key not in agg:
                    row: Dict[str, Any] = {
                        "date": dt_str,
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
                        agg[key]["quantity"] = (agg[key].get("quantity") or 0.0) + amount

            detail_rows = sorted(
                agg.values(),
                key=lambda x: (
                    x.get("date") or "",
                    x.get("department_name") or "",
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
