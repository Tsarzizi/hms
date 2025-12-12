# backend/app/outpatient_total_revenue.py

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, asdict, is_dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional, Union

from flask import Blueprint, request, jsonify  # ⭐ 新增 request, jsonify

from .shared.db import get_conn, put_conn


# ======================= 通用工具 & 类型 =======================
bp = Blueprint("outpatient_total_revenue", __name__)

Jsonable = Union[Dict[str, Any], List[Any], str, int, float, bool, None]


def to_jsonable(obj: Any) -> Jsonable:
    """
    dataclass / Decimal / date → 前端可直接 JSON 使用的基础类型
    """
    if obj is None:
        return None
    if isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    if isinstance(obj, list):
        return [to_jsonable(x) for x in obj]
    if isinstance(obj, dict):
        return {k: to_jsonable(v) for k, v in obj.items()}
    if is_dataclass(obj):
        return {k: to_jsonable(v) for k, v in asdict(obj).items()}
    return str(obj)


# ======================= dataclass 结构（保留，可复用） =======================

@dataclass
class Department:
    code: str  # 绩效科室ID 或 HIS 科室编码
    name: str  # 绩效科室名称


@dataclass
class DepartmentDoctor:
    doc_id: str
    doc_name: str
    dep_id: str
    dep_name: str


@dataclass
class RevenueSummary:
    current: float
    growth_rate: Optional[float] = None  # 总收入同比%
    mom_growth_rate: Optional[float] = None  # 总收入环比%


@dataclass
class InitPayload:
    date: date
    departments: List[Department]
    doctors: List[DepartmentDoctor]
    summary: Optional[RevenueSummary] = None


@dataclass
class DetailRow:
    date: date
    department_code: str
    department_name: str
    item_class_name: Optional[str]
    revenue: float
    quantity: float
    doctor_id: Optional[str] = None
    doctor_name: Optional[str] = None


@dataclass
class DetailsResult:
    date_range_start: date
    date_range_end: date
    departments: Optional[List[str]]
    doctors: Optional[List[str]]
    rows: List[DetailRow]
    total: int


@dataclass
class TimeseriesRow:
    date: date
    revenue: float
    last_year: Optional[float]
    yoy_pct: Optional[float]
    mom_pct: Optional[float]


@dataclass
class TimeseriesResult:
    date_range_start: date
    date_range_end: date
    departments: Optional[List[str]]
    rows: List[TimeseriesRow]


@dataclass
class SummaryResult:
    date_range_start: date
    date_range_end: date
    departments: Optional[List[str]]
    summary: RevenueSummary


# ======================= 小工具函数 =======================

logger = logging.getLogger("outpatient_total_revenue.repository")


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
          - 当前非 0   => 0%（按“初始化也要看到一个数字”的需求处理）
    """
    if base is None:
        return None
    if base == 0:
        return 0.0
    return (cur - base) / base * 100.0


# ======================= Repository：门诊总收入 =======================

class OutpatientTotalRevenueRepository:
    """
    门诊总收入 Repository：
    只负责和 DB 交互。

    暴露三个主要方法：
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
        科室模式基础收入数据（门诊）：
        - 历史：t_dep_income_outp
        - 当日实时：t_workload_outp_f + t_workload_dep_def2his

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
            -- 1. 历史部门收入：t_dep_income_outp
            ----------------------------------------------------------------
            SELECT
              x.rcpt_date::date        AS rcpt_date,
              x.dep_code::text         AS dep_code,
              x.dep_name::text         AS dep_name,
              x.item_class_name::text  AS item_class_name,
              x.charges::numeric       AS charges,
              x.amount::numeric        AS amount
            FROM t_dep_income_outp x
            WHERE
              x.rcpt_date < CURRENT_DATE
              AND (
                %(departments)s IS NULL
                OR x.dep_name = ANY(%(departments)s)
              )

            UNION ALL

            ----------------------------------------------------------------
            -- 2. 当日实时部门收入：t_workload_outp_f + t_workload_dep_def2his
            ----------------------------------------------------------------
            SELECT
              f.visit_date::date        AS rcpt_date,
              f.ordered_by::text  AS dep_code,
              d."绩效科室名称"::text    AS dep_name,
              f.item_class_name::text  AS item_class_name,
              SUM(f.charges)::numeric  AS charges,
              SUM(f.amount)::numeric   AS amount
            FROM t_workload_outp_f f
            LEFT JOIN t_workload_dep_def2his d
              ON d."HIS科室编码"::text = f.ordered_by::text
            WHERE
              f.visit_date >= CURRENT_DATE
              AND f.visit_date <  CURRENT_DATE + 1
              AND (
                %(departments)s IS NULL
                OR d."绩效科室名称" = ANY(%(departments)s)
              )
            GROUP BY
              f.visit_date,
              f.ordered_by,
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
        医生模式基础数据（门诊，历史 + 实时）：

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
          -- 1. 实时：t_workload_outp_f
          ----------------------------------------------------------------
          SELECT 
            f.visit_date::date        AS rcpt_date,
            f.ordered_by_doctor::text     AS doc_code,
            d."姓名"::text           AS doc_name,
            f.item_class_name::text  AS item_class_name,
            SUM(f.costs)::numeric    AS costs,
            SUM(f.amount)::numeric   AS amount
          FROM t_workload_outp_f f
          LEFT JOIN t_workload_doc_2dep_def d 
            ON f.ordered_by_doctor = d."工号"
          WHERE 
            f.visit_date >= %(start_date)s
            AND f.visit_date <  %(end_date)s
            AND (
                %(doctors)s IS NULL
                OR f.ordered_by_doctor = ANY(%(doctors)s)
            )
          GROUP BY 
            f.visit_date,
            f.ordered_by_doctor,
            d."姓名",
            f.item_class_name

          UNION ALL

          ----------------------------------------------------------------
          -- 2. 历史：t_doc_fee_outp
          ----------------------------------------------------------------
          SELECT
            f.billing_date::date     AS rcpt_date,
            f.doc_code::text         AS doc_code,
            f.doc_name::text         AS doc_name,
            f.item_class_name::text  AS item_class_name,
            SUM(f.costs)::numeric    AS costs,
            SUM(f.amount)::numeric   AS amount
          FROM t_doc_fee_outp f
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

    # ------ 统一出口：summary + timeseries + details ------

    def get_full_revenue(
        self,
        start: date,
        end: Optional[date] = None,
        departments=None,
        doctors=None,
    ) -> Dict[str, Any]:
        """
        门诊总收入统一查询入口：

        - 如果有 doctors（医生工号列表），走“医生模式”（忽略部门）
        - 否则走“科室模式”（按部门名称过滤）

        返回：
        {
          "date_range": {...},
          "departments": [...],
          "doctors": [...],
          "summary": {...},        # 含 当前收入 + 同比/环比
          "timeseries": [...],     # 每日收入 + 同比/环比
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

        # ---------- 2）汇总（summary：总收入 + 同比/环比） ----------

        def sum_rev(rows: List[Dict[str, Any]]) -> float:
            field = "costs" if mode == "doctor" else "charges"
            s = 0.0
            for r in rows:
                s += float(r.get(field) or 0.0)
            return s

        cur_rev = sum_rev(base_rows_cur)
        prev_rev = sum_rev(base_rows_prev)
        last_rev = sum_rev(base_rows_last)

        yoy = _pct_change(cur_rev, last_rev)
        mom = _pct_change(cur_rev, prev_rev)

        # ---------- 2）汇总（summary：门诊 / 急诊 / 门急诊） ----------

        # 门诊收入
        outpatient_cur = cur_rev
        outpatient_prev = prev_rev
        outpatient_last = last_rev

        # 急诊收入（当前无急诊数据，所以全部为 0）
        emergency_cur = 0.0
        emergency_prev = 0.0
        emergency_last = 0.0

        def make_block(cur, prev, last):
            return {
                "current": float(cur or 0.0),
                "growth_rate": _pct_change(cur, last),
                "mom_growth_rate": _pct_change(cur, prev),
            }

        summary = {
            # 门急诊总收入 = 门诊 + 急诊
            "outpatientEmergencyTotalRevenue": make_block(
                outpatient_cur + emergency_cur,
                outpatient_prev + emergency_prev,
                outpatient_last + emergency_last
            ),
            "outpatientTotalRevenue": make_block(
                outpatient_cur,
                outpatient_prev,
                outpatient_last
            ),
            "emergencyTotalRevenue": make_block(
                emergency_cur,
                emergency_prev,
                emergency_last
            ),
        }

        # ---------- 3）timeseries（每日收入 + 同比 & 环比） ----------

        rev_cur_by_date: Dict[date, float] = defaultdict(float)
        for r in base_rows_cur:
            dt = _parse_date_str(r.get("rcpt_date") or r.get("date"))
            if not dt:
                continue
            val = float(r.get("costs") or r.get("charges") or 0.0)
            rev_cur_by_date[dt] += val

        rev_last_by_date: Dict[date, float] = defaultdict(float)
        for r in base_rows_last:
            dt = _parse_date_str(r.get("rcpt_date") or r.get("date"))
            if not dt:
                continue
            val = float(r.get("costs") or r.get("charges") or 0.0)
            rev_last_by_date[dt] += val

        all_dates = sorted(set(rev_cur_by_date.keys()))

        ts_rows: List[Dict[str, Any]] = []
        prev_rev_val: Optional[float] = None

        for d in all_dates:
            rev_val = rev_cur_by_date.get(d, 0.0)

            # 去年同日
            last_d = _shift_year(d, -1)
            last_rev_val = rev_last_by_date.get(last_d)

            yoy_pct = _pct_change(rev_val, last_rev_val)
            mom_pct = _pct_change(rev_val, prev_rev_val)

            ts_rows.append(
                {
                    "date": d.isoformat(),
                    "revenue": rev_val,
                    "last_year": last_rev_val,
                    "yoy_pct": yoy_pct,
                    "mom_pct": mom_pct,
                }
            )

            prev_rev_val = rev_val

        # ---------- 4）details（医生 / 科室 两种模式） ----------

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


# ======================= Service：门诊总收入 =======================

service_logger = logging.getLogger("outpatient_total_revenue.service")

_repo = OutpatientTotalRevenueRepository()


def get_dep_doc_map() -> List[Dict[str, Any]]:
    """
    返回科室 + 医生映射，用于前端初始化（门诊）。
    """
    return _repo.get_dep_doc_map()


def get_full_revenue(
    start: date,
    end: date,
    departments: Optional[List[str]] = None,
    doctors: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    门诊总收入统一查询入口：
    - start / end：日期（end 为「开区间」，一般为 查询结束日期 + 1 天）
    - departments：绩效科室名称列表（可空）
    - doctors：医生工号列表（可空）
    """
    service_logger.info(
        "get_full_revenue | start=%s end=%s departments=%s doctors=%s",
        start,
        end,
        departments,
        doctors,
    )
    return _repo.get_full_revenue(start, end, departments, doctors)


# ======================= API 路由：对接前端 =======================

@bp.route("/init", methods=["GET"])
def api_outpatient_total_revenue_init():
    """
    初始化：
    - 返回科室列表（id/name）
    - 医生列表（id/name/departmentId/departmentName）
    - 可以按需附带一个默认 summary（这里先不算，前端会单独请求）
    """
    try:
        dep_doc_rows = get_dep_doc_map()

        departments: Dict[str, Dict[str, str]] = {}
        doctors: List[Dict[str, Any]] = []

        for row in dep_doc_rows:
            dep_id = str(row.get("dep_id") or "").strip()
            dep_name = str(row.get("dep_name") or "").strip()
            if dep_id and dep_id not in departments:
                departments[dep_id] = {"id": dep_id, "name": dep_name}

            docs = row.get("doctors") or []
            for d in docs:
                doc_id = str((d or {}).get("doc_id") or "").strip()
                doc_name = str((d or {}).get("doc_name") or "").strip()
                if not doc_id:
                    continue
                doctors.append(
                    {
                        "id": doc_id,
                        "name": doc_name,
                        "departmentId": dep_id,
                        "departmentName": dep_name,
                    }
                )

        payload = {
            "date": date.today(),
            "departments": list(departments.values()),
            "doctors": doctors,
            # "summary": None,  # 如需默认汇总，可后面补
        }

        return jsonify({"success": True, "data": to_jsonable(payload)})
    except Exception as e:
        service_logger.exception("init failed")
        return jsonify({"success": False, "message": str(e)}), 500


def _parse_request_date(s: Any, field: str) -> date:
    if not s:
        raise ValueError(f"{field} 不能为空")
    try:
        return date.fromisoformat(str(s)[:10])
    except Exception:
        raise ValueError(f"{field} 格式错误，应为 YYYY-MM-DD")


@bp.route("/summary", methods=["POST"])
def api_outpatient_total_revenue_summary():
    """
    汇总接口：
    - 入参：start_date, end_date, department_ids, doctor_ids
    - 出参：summary 对象（current, growth_rate, mom_growth_rate）
    """
    try:
        payload = request.get_json(silent=True) or {}
        start_str = payload.get("start_date")
        end_str = payload.get("end_date")

        start = _parse_request_date(start_str, "start_date")
        end_inclusive = _parse_request_date(end_str, "end_date")
        end_exclusive = end_inclusive + timedelta(days=1)

        departments = payload.get("department_ids")
        doctors = payload.get("doctor_ids")

        full = get_full_revenue(
            start=start,
            end=end_exclusive,
            departments=departments,
            doctors=doctors,
        )

        # 前端 extractSummaryFromStd 支持 data 或 data.summary，这里直接返回 summary
        return jsonify({"success": True, "data": to_jsonable(full.get("summary"))})
    except ValueError as ve:
        return jsonify({"success": False, "message": str(ve)}), 400
    except Exception as e:
        service_logger.exception("summary failed")
        return jsonify({"success": False, "message": str(e)}), 500


@bp.route("/details", methods=["POST"])
def api_outpatient_total_revenue_details():
    """
    明细接口：
    - 入参：start_date, end_date, department_ids, doctor_ids
    - 出参：{ rows: [...], total: N }
    """
    try:
        payload = request.get_json(silent=True) or {}
        start_str = payload.get("start_date")
        end_str = payload.get("end_date")

        start = _parse_request_date(start_str, "start_date")
        end_inclusive = _parse_request_date(end_str, "end_date")
        end_exclusive = end_inclusive + timedelta(days=1)

        departments = payload.get("department_ids")
        doctors = payload.get("doctor_ids")

        full = get_full_revenue(
            start=start,
            end=end_exclusive,
            departments=departments,
            doctors=doctors,
        )

        data = {
            "rows": full.get("details") or [],
            "total": full.get("total") or 0,
        }
        return jsonify({"success": True, "data": to_jsonable(data)})
    except ValueError as ve:
        return jsonify({"success": False, "message": str(ve)}), 400
    except Exception as e:
        service_logger.exception("details failed")
        return jsonify({"success": False, "message": str(e)}), 500


@bp.route("/timeseries", methods=["POST"])
def api_outpatient_total_revenue_timeseries():
    """
    趋势接口：
    - 入参：start_date, end_date, department_ids, doctor_ids
    - 出参：{ timeseries: [...] }
    """
    try:
        payload = request.get_json(silent=True) or {}
        start_str = payload.get("start_date")
        end_str = payload.get("end_date")

        start = _parse_request_date(start_str, "start_date")
        end_inclusive = _parse_request_date(end_str, "end_date")
        end_exclusive = end_inclusive + timedelta(days=1)

        departments = payload.get("department_ids")
        doctors = payload.get("doctor_ids")

        full = get_full_revenue(
            start=start,
            end=end_exclusive,
            departments=departments,
            doctors=doctors,
        )

        data = {
            "timeseries": full.get("timeseries") or [],
        }
        return jsonify({"success": True, "data": to_jsonable(data)})
    except ValueError as ve:
        return jsonify({"success": False, "message": str(ve)}), 400
    except Exception as e:
        service_logger.exception("timeseries failed")
        return jsonify({"success": False, "message": str(e)}), 500
