# app/drg_efficiency.py

import logging
from datetime import timedelta, date
from typing import Dict, Any, Optional, List

from flask import Blueprint, request, jsonify

from .shared.db import get_db_cursor
from .shared.validators import parse_date_generic
from .shared.calc_utils import calc_mom, calc_yoy

bp = Blueprint("drg_efficiency", __name__)
logger = logging.getLogger(__name__)


# ===========================
#   通用响应封装
# ===========================
def success(data=None):
    return jsonify({"success": True, "data": data if data is not None else {}})


def error(msg: str, code: int = 400):
    return jsonify({"success": False, "message": msg}), code


# ===========================
#   公共计算函数（基于 mv_drg）
# ===========================
def _build_base_where_and_params(
    start_date: date,
    end_date: date,
    department_ids: Optional[List[str]] = None,
) -> (str, List[Any]):
    where = """
        WHERE bill_dt >= %s
          AND bill_dt <= %s
    """
    params: List[Any] = [start_date, end_date]

    if department_ids:
        where += " AND dep_code = ANY(%s)"
        params.append(department_ids)

    # 只统计有实际住院天数的记录
    where += " AND act_ipt_days IS NOT NULL AND act_ipt_days > 0"

    return where, params


def _compute_summary(
    start_date: date,
    end_date: date,
    department_ids: Optional[List[str]] = None,
) -> Dict[str, Optional[float]]:
    """
    计算汇总指标：
      - avgHospitalizationDays: DRG出院患者平均住院日（act_ipt_days 平均值）
      - avgPreoperativeDays: DRG出院患者术前平均住院日（手术日期 - 入院日期）
      - totalBedDays: DRG出院患者占用总床日数（act_ipt_days 求和）
    """

    where, params = _build_base_where_and_params(start_date, end_date, department_ids)

    sql = f"""
        WITH base AS (
            SELECT
                bill_dt,
                dep_code,
                dep_name,
                act_ipt_days,
                CASE
                    WHEN operating_time IS NOT NULL AND adm_date IS NOT NULL THEN
                        GREATEST(
                            (operating_time::date - adm_date)::int,
                            0
                        )
                    ELSE NULL
                END AS preop_days
            FROM mv_drg
            {where}
        )
        SELECT
            AVG(act_ipt_days)::float8       AS avg_hosp_days,
            AVG(preop_days)::float8        AS avg_preop_days,
            SUM(act_ipt_days)::float8      AS total_bed_days
        FROM base
    """

    logger.info("DRG efficiency summary SQL: %s", sql)
    logger.info("Params: %s", params)

    with get_db_cursor() as cur:
        cur.execute(sql, params)
        row = cur.fetchone()

    if not row:
        return {
            "avgHospitalizationDays": None,
            "avgPreoperativeDays": None,
            "totalBedDays": None,
        }

    avg_hosp_days, avg_preop_days, total_bed_days = row

    return {
        "avgHospitalizationDays": avg_hosp_days,
        "avgPreoperativeDays": avg_preop_days,
        "totalBedDays": total_bed_days,
    }


# ===========================
#   1. 初始化接口 /init
# ===========================
@bp.route("/init", methods=["GET"])
def init_data():
    """
    初始化：
      - 返回科室列表 departments: [{id, name}]
    """
    sql = """
        SELECT DISTINCT dep_code, dep_name
        FROM mv_drg
        WHERE dep_code IS NOT NULL AND dep_code <> ''
        ORDER BY dep_code
    """
    with get_db_cursor() as cur:
        cur.execute(sql)
        rows = cur.fetchall()

    departments = [
        {"id": r[0], "name": r[1] or r[0]}
        for r in rows
    ]

    return success({"departments": departments})


# ===========================
#   2. 汇总接口 /efficiency-summary
# ===========================
@bp.route("/efficiency-summary", methods=["GET"])
def efficiency_summary():
    start_date = parse_date_generic(request.args.get("start_date"))
    end_date = parse_date_generic(request.args.get("end_date"))
    department_ids = request.args.getlist("department_ids")

    if not start_date or not end_date:
        return error("开始日期和结束日期不能为空")

    if start_date > end_date:
        return error("开始日期不能大于结束日期")

    summary = _compute_summary(start_date, end_date, department_ids or None)

    # 前端 SummaryCards 只需要这三个字段
    return success(
        {
            "avgHospitalizationDays": summary["avgHospitalizationDays"] or 0.0,
            "avgPreoperativeDays": summary["avgPreoperativeDays"] or 0.0,
            "totalBedDays": summary["totalBedDays"] or 0.0,
        }
    )


# ===========================
#   3. 趋势图接口 /efficiency-chart
# ===========================
@bp.route("/efficiency-chart", methods=["GET"])
def efficiency_chart():
    start_date = parse_date_generic(request.args.get("start_date"))
    end_date = parse_date_generic(request.args.get("end_date"))
    department_ids = request.args.getlist("department_ids")

    if not start_date or not end_date:
        return error("开始日期和结束日期不能为空")

    if start_date > end_date:
        return error("开始日期不能大于结束日期")

    where, params = _build_base_where_and_params(start_date, end_date, department_ids or None)

    sql = f"""
        WITH base AS (
            SELECT
                bill_dt::date AS billing_date,
                dep_code,
                dep_name,
                act_ipt_days,
                CASE
                    WHEN operating_time IS NOT NULL AND adm_date IS NOT NULL THEN
                        GREATEST(
                            (operating_time::date - adm_date)::int,
                            0
                        )
                    ELSE NULL
                END AS preop_days
            FROM mv_drg
            {where}
        )
        SELECT
            billing_date,
            AVG(act_ipt_days)::float8  AS avg_hosp_days,
            AVG(preop_days)::float8    AS avg_preop_days,
            SUM(act_ipt_days)::float8  AS total_bed_days
        FROM base
        GROUP BY billing_date
        ORDER BY billing_date
    """

    logger.info("DRG efficiency chart SQL: %s", sql)
    logger.info("Params: %s", params)

    with get_db_cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    data = []
    for billing_date, avg_hosp, avg_preop, total_bed in rows:
        data.append(
            {
                "date": billing_date.isoformat(),
                "data": {
                    "avgHospitalizationDays": avg_hosp or 0.0,
                    "avgPreoperativeDays": avg_preop or 0.0,
                    "totalBedDays": total_bed or 0.0,
                },
            }
        )

    return success(data)


# ===========================
#   4. 同比/环比接口 /efficiency-comparison
# ===========================
def _compute_prev_range_for_mom(start_date: date, end_date: date):
    """
    环比：使用“前一周期（长度相同）”
    """
    days = (end_date - start_date).days + 1
    prev_end = start_date - timedelta(days=1)
    prev_start = prev_end - timedelta(days=days - 1)
    return prev_start, prev_end


def _compute_prev_range_for_yoy(start_date: date, end_date: date):
    """
    同比：使用“去年同一时间段”
    简化为：往前平移 365 天
    """
    prev_start = start_date - timedelta(days=365)
    prev_end = end_date - timedelta(days=365)
    return prev_start, prev_end


@bp.route("/efficiency-comparison", methods=["GET"])
def efficiency_comparison():
    cmp_type = request.args.get("type", "yoy")  # yoy / mom
    start_date = parse_date_generic(request.args.get("start_date"))
    end_date = parse_date_generic(request.args.get("end_date"))
    department_ids = request.args.getlist("department_ids")

    if not start_date or not end_date:
        return error("开始日期和结束日期不能为空")

    if start_date > end_date:
        return error("开始日期不能大于结束日期")

    if cmp_type not in ("yoy", "mom"):
        return error("type 只能是 yoy 或 mom")

    # 当前期间
    current = _compute_summary(start_date, end_date, department_ids or None)

    # 对比期间
    if cmp_type == "mom":
        prev_start, prev_end = _compute_prev_range_for_mom(start_date, end_date)
        rate_func = calc_mom
    else:
        prev_start, prev_end = _compute_prev_range_for_yoy(start_date, end_date)
        rate_func = calc_yoy

    previous = _compute_summary(prev_start, prev_end, department_ids or None)

    indicators = ["avgHospitalizationDays", "avgPreoperativeDays", "totalBedDays"]

    result: Dict[str, Dict[str, Any]] = {}

    for key in indicators:
        cur_val = current.get(key)
        prev_val = previous.get(key)

        # 使用公共百分比计算函数（返回值已经是百分数）
        rate = rate_func(cur_val, prev_val)
        if rate is None:
            change_rate = 0.0
        else:
            change_rate = rate

        if change_rate > 0:
            change_type = "increase"
        elif change_rate < 0:
            change_type = "decrease"
        else:
            change_type = "none"

        result[key] = {
            "current_value": cur_val if cur_val is not None else 0.0,
            "comparison_value": prev_val if prev_val is not None else 0.0,
            "change_rate": change_rate,
            "change_type": change_type,
        }

    return success(result)


# ===========================
#   5. 详细数据接口 /efficiency-detail
# ===========================
@bp.route("/efficiency-detail", methods=["GET"])
def efficiency_detail():
    start_date = parse_date_generic(request.args.get("start_date"))
    end_date = parse_date_generic(request.args.get("end_date"))
    department_ids = request.args.getlist("department_ids")

    if not start_date or not end_date:
        return error("开始日期和结束日期不能为空")

    if start_date > end_date:
        return error("开始日期不能大于结束日期")

    where, params = _build_base_where_and_params(start_date, end_date, department_ids or None)

    sql = f"""
        WITH base AS (
            SELECT
                bill_dt::date AS billing_date,
                dep_code,
                dep_name,
                act_ipt_days,
                CASE
                    WHEN operating_time IS NOT NULL AND adm_date IS NOT NULL THEN
                        GREATEST(
                            (operating_time::date - adm_date)::int,
                            0
                        )
                    ELSE NULL
                END AS preop_days
            FROM mv_drg
            {where}
        )
        SELECT
            billing_date,
            dep_code,
            dep_name,
            AVG(act_ipt_days)::float8  AS avg_hosp_days,
            AVG(preop_days)::float8    AS avg_preop_days,
            SUM(act_ipt_days)::float8  AS total_bed_days,
            COUNT(*)                   AS total_patients
        FROM base
        GROUP BY billing_date, dep_code, dep_name
        ORDER BY billing_date DESC, dep_code
    """

    logger.info("DRG efficiency detail SQL: %s", sql)
    logger.info("Params: %s", params)

    with get_db_cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    data = []
    for (
        billing_date,
        dep_code,
        dep_name,
        avg_hosp,
        avg_preop,
        total_bed,
        total_patients,
    ) in rows:
        data.append(
            {
                "billing_date": billing_date.isoformat(),
                "dep_code": dep_code,
                "dep_name": dep_name,
                "avg_hospitalization_days": avg_hosp or 0.0,
                "avg_preoperative_days": avg_preop or 0.0,
                "total_bed_days": total_bed or 0.0,
                "total_patients": int(total_patients or 0),
            }
        )

    return success(data)
