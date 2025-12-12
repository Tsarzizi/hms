# app/drg_count.py
import logging
from datetime import timedelta
from typing import Any, Dict, List, Tuple, Optional

from flask import Blueprint, request, jsonify

from .shared.db import get_db_cursor
from .shared.validators import parse_date_generic
from .shared.calc_utils import calc_mom, calc_yoy

bp = Blueprint("drg_count", __name__)
logger = logging.getLogger(__name__)


def ok(data):
    return jsonify({"success": True, "data": data})


def bad(msg, status: int = 400):
    return jsonify({"success": False, "message": msg}), status


# ===================== 初始化：科室列表 =====================
@bp.route("/init", methods=["GET"])
def init():
    """
    返回科室筛选列表：
    从 mv_drg_count_analysis 中取 DISTINCT 科室名称，
    id 和 name 都用 科室名称。
    """
    sql = """
        SELECT DISTINCT d."科室名称"
        FROM mv_drg_count_analysis d
        WHERE d."科室名称" IS NOT NULL AND d."科室名称" <> ''
        ORDER BY d."科室名称"
    """

    with get_db_cursor() as cur:
        cur.execute(sql)
        rows = cur.fetchall()

    departments = [
        {"id": r[0], "name": r[0]}
        for r in rows
    ]

    return ok({"departments": departments})


# ===================== 公共 SQL 片段 =====================

# 注意：只负责 WHERE（从哪个视图查 & 时间范围），不做聚合
BASE_WHERE_SQL = """
    FROM mv_drg_count_analysis d
    WHERE d."结算日期" >= %s
      AND d."结算日期" <= %s
"""


def build_where(dep_ids: List[str], sql: str, args: List[Any]) -> Tuple[str, List[Any]]:
    """
    根据科室筛选追加 WHERE 条件
    dep_ids 来自 request.args.getlist("department_ids")
    """
    if dep_ids:
        # 这里使用 科室名称 做筛选
        sql += ' AND d."科室名称" = ANY(%s)'
        args.append(dep_ids)
    return sql, args


# 返回行类型：与 SQL SELECT 字段顺序一致
AggregatedRow = Tuple[Any, str, str, int, int, int]
#            (billing_date, dep_name, dep_code,
#             drg_case_count, drg_coverage_count, total_patients)


def get_aggregated_rows(start, end, dep_ids: List[str]) -> List[AggregatedRow]:
    """
    对给定时间段 + 科室筛选，返回已经聚合好的结果：
    (billing_date, dep_name, dep_code,
     drg_case_count, drg_coverage_count, total_patients)
    """
    sql_where = BASE_WHERE_SQL
    args: List[Any] = [start, end]
    sql_where, args = build_where(dep_ids, sql_where, args)

    sql = f"""
        WITH base AS (
            SELECT DISTINCT
                d.visit_id,
                d."结算日期"::date AS billing_date,
                d."科室名称"      AS dep_name,
                d."科室名称"      AS dep_code,
                d."主要诊断编码"  AS main_diag
            {sql_where}
        )
        SELECT
            b.billing_date,
            b.dep_name,
            b.dep_code,
            COUNT(*)                        AS drg_case_count,
            COUNT(DISTINCT b.main_diag)     AS drg_coverage_count,
            COUNT(*)                        AS total_patients
        FROM base b
        GROUP BY b.billing_date, b.dep_name, b.dep_code
        ORDER BY b.billing_date, b.dep_name
    """

    with get_db_cursor() as cur:
        logger.debug("DRG aggregated SQL: %s, args=%s", sql, args)
        cur.execute(sql, args)
        rows: List[AggregatedRow] = cur.fetchall()

    return rows


def _calc_summary_from_rows(rows: List[AggregatedRow]) -> Dict[str, int]:
    total_case = 0
    total_coverage = 0

    for r in rows:
        total_case += r[3] or 0
        total_coverage += r[4] or 0

    return {
        "diseaseCaseCount": int(total_case),
        "diseaseCoverageCount": int(total_coverage),
    }


def _build_comparison(start, end, dep_ids: List[str], ctype: str) -> Dict[str, Dict[str, Any]]:
    """
    计算某个区间的同比/环比结果，返回结构：
    {
      "diseaseCaseCount": {...},
      "diseaseCoverageCount": {...}
    }
    """
    if ctype not in ("yoy", "mom"):
        raise ValueError("ctype must be 'yoy' or 'mom'")

    # 计算对比区间
    if ctype == "mom":
        # 环比：前一段同长度时间
        length = (end - start).days + 1
        prev_start = start - timedelta(days=length)
        prev_end = end - timedelta(days=length)
    else:
        # 同比：去年同期
        prev_start = start.replace(year=start.year - 1)
        prev_end = end.replace(year=end.year - 1)

    # 当前区间
    rows_now = get_aggregated_rows(start, end, dep_ids)
    now_summary = _calc_summary_from_rows(rows_now)
    now_case = now_summary["diseaseCaseCount"]
    now_cov = now_summary["diseaseCoverageCount"]

    # 对比区间
    rows_prev = get_aggregated_rows(prev_start, prev_end, dep_ids)
    prev_summary = _calc_summary_from_rows(rows_prev)
    prev_case = prev_summary["diseaseCaseCount"]
    prev_cov = prev_summary["diseaseCoverageCount"]

    # 使用公共函数计算变化率
    if ctype == "mom":
        rate_case = calc_mom(now_case, prev_case)
        rate_cov = calc_mom(now_cov, prev_cov)
    else:
        rate_case = calc_yoy(now_case, prev_case)
        rate_cov = calc_yoy(now_cov, prev_cov)

    def safe_rate(v: Optional[float]) -> float:
        return float(v) if v is not None else 0.0

    result = {
        "diseaseCaseCount": {
            "current_value": now_case,
            "comparison_value": prev_case,
            "change_rate": safe_rate(rate_case),
            "change_type": ctype,
        },
        "diseaseCoverageCount": {
            "current_value": now_cov,
            "comparison_value": prev_cov,
            "change_rate": safe_rate(rate_cov),
            "change_type": ctype,
        },
    }
    return result


# ===================== 图表数据 =====================
@bp.route("/chart", methods=["GET"])
def chart():
    args_qs = request.args
    start = parse_date_generic(args_qs.get("start_date"))
    end = parse_date_generic(args_qs.get("end_date"))
    if not (start and end):
        return bad("开始日期和结束日期不能为空，且格式需为 YYYY-MM-DD")

    dep_ids = request.args.getlist("department_ids")

    rows = get_aggregated_rows(start, end, dep_ids)

    # 按日期汇总（因为图表不按科室拆）
    by_date: Dict[str, Dict[str, int]] = {}
    for r in rows:
        billing_date = r[0].isoformat()
        drg_case_count = r[3] or 0
        drg_coverage_count = r[4] or 0

        if billing_date not in by_date:
            by_date[billing_date] = {
                "diseaseCaseCount": 0,
                "diseaseCoverageCount": 0,
            }

        by_date[billing_date]["diseaseCaseCount"] += drg_case_count
        by_date[billing_date]["diseaseCoverageCount"] += drg_coverage_count

    # 按日期排序输出
    result = [
        {"date": date_str, "data": data}
        for date_str, data in sorted(by_date.items(), key=lambda x: x[0])
    ]

    return ok(result)


# ===================== 汇总卡片 =====================
@bp.route("/summary", methods=["GET"])
def summary():
    args_qs = request.args
    start = parse_date_generic(args_qs.get("start_date"))
    end = parse_date_generic(args_qs.get("end_date"))
    if not (start and end):
        return bad("开始日期和结束日期不能为空，且格式需为 YYYY-MM-DD")

    dep_ids = request.args.getlist("department_ids")

    rows = get_aggregated_rows(start, end, dep_ids)
    data = _calc_summary_from_rows(rows)

    return ok(data)


# ===================== 同比 / 环比 =====================
@bp.route("/comparison", methods=["GET"])
def comparison():
    args_qs = request.args
    ctype = args_qs.get("type")  # 'yoy' or 'mom'
    start = parse_date_generic(args_qs.get("start_date"))
    end = parse_date_generic(args_qs.get("end_date"))

    if ctype not in ("yoy", "mom"):
        return bad("type 必须为 'yoy' 或 'mom'")
    if not (start and end):
        return bad("开始日期和结束日期不能为空，且格式需为 YYYY-MM-DD")

    dep_ids = request.args.getlist("department_ids")

    result = _build_comparison(start, end, dep_ids, ctype)
    return ok(result)


# ===================== 详细数据表格 =====================
@bp.route("/detail", methods=["GET"])
def detail():
    args_qs = request.args
    start = parse_date_generic(args_qs.get("start_date"))
    end = parse_date_generic(args_qs.get("end_date"))
    if not (start and end):
        return bad("开始日期和结束日期不能为空，且格式需为 YYYY-MM-DD")

    dep_ids = request.args.getlist("department_ids")

    rows = get_aggregated_rows(start, end, dep_ids)

    data: List[Dict[str, Any]] = []
    for r in rows:
        billing_date = r[0].isoformat()
        dep_name = r[1]
        dep_code = r[2]
        drg_case_count = r[3] or 0
        drg_coverage_count = r[4] or 0
        total_patients = r[5] or 0

        data.append({
            "billing_date": billing_date,
            "dep_code": dep_code,
            "dep_name": dep_name,
            "drg_case_count": int(drg_case_count),
            "drg_coverage_count": int(drg_coverage_count),
            "total_patients": int(total_patients),
        })

    return ok(data)


# ===================== 聚合接口：overview =====================
@bp.route("/overview", methods=["GET"])
def overview():
    """
    聚合接口，一次返回：
    - chart: 走势图数据
    - summary: 汇总卡片
    - yoy: 同比结果
    - mom: 环比结果
    - detail: 明细表格数据
    """
    args_qs = request.args
    start = parse_date_generic(args_qs.get("start_date"))
    end = parse_date_generic(args_qs.get("end_date"))
    if not (start and end):
        return bad("开始日期和结束日期不能为空，且格式需为 YYYY-MM-DD")

    dep_ids = request.args.getlist("department_ids")

    # 当前区间聚合行
    rows = get_aggregated_rows(start, end, dep_ids)

    # 汇总
    summary_data = _calc_summary_from_rows(rows)

    # 明细 + 图表数据（按日期再汇总）
    detail_rows: List[Dict[str, Any]] = []
    by_date: Dict[str, Dict[str, int]] = {}

    for r in rows:
        billing_date_obj = r[0]
        billing_date = billing_date_obj.isoformat()
        dep_name = r[1]
        dep_code = r[2]
        drg_case_count = r[3] or 0
        drg_coverage_count = r[4] or 0
        total_patients = r[5] or 0

        detail_rows.append({
            "billing_date": billing_date,
            "dep_code": dep_code,
            "dep_name": dep_name,
            "drg_case_count": int(drg_case_count),
            "drg_coverage_count": int(drg_coverage_count),
            "total_patients": int(total_patients),
        })

        if billing_date not in by_date:
            by_date[billing_date] = {
                "diseaseCaseCount": 0,
                "diseaseCoverageCount": 0,
            }

        by_date[billing_date]["diseaseCaseCount"] += drg_case_count
        by_date[billing_date]["diseaseCoverageCount"] += drg_coverage_count

    chart_data = [
        {"date": date_str, "data": data}
        for date_str, data in sorted(by_date.items(), key=lambda x: x[0])
    ]

    # 同比 & 环比
    yoy_data = _build_comparison(start, end, dep_ids, "yoy")
    mom_data = _build_comparison(start, end, dep_ids, "mom")

    result = {
        "chart": chart_data,
        "summary": summary_data,
        "yoy": yoy_data,
        "mom": mom_data,
        "detail": detail_rows,
    }

    return ok(result)
