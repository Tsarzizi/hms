# app/inpatient_avg_cost_ratio.py
import logging
from datetime import timedelta
from typing import List, Optional, Dict

from flask import Blueprint, request, jsonify

from .shared.db import get_conn, put_conn
from .shared.cache import cache_get, cache_set
from .shared.validators import parse_date_generic
from .shared.numbers import safe_pct_change

logger = logging.getLogger(__name__)

bp = Blueprint("inpatient_avg_cost_ratio", __name__)

# ---- 常量定义 ----
INDICATOR_KEYS = [
    "drugCostRatio",
    "materialCostRatio",
    "examinationCostRatio",
    "treatmentCostRatio",
]


# ===== 工具函数 =====

def _parse_date_range_from_request():
    """从 querystring 中解析开始、结束日期，支持多种格式。"""
    start_str = request.args.get("start_date")
    end_str = request.args.get("end_date")

    start_date = parse_date_generic(start_str)
    end_date = parse_date_generic(end_str)

    # 如果前端没传，给一个默认最近 30 天
    from datetime import date
    if not end_date:
        end_date = date.today()
    if not start_date:
        start_date = end_date - timedelta(days=29)

    if start_date > end_date:
        start_date, end_date = end_date, start_date

    return start_date, end_date


def _get_department_ids_from_request() -> List[str]:
    """获取部门过滤条件，多选。"""
    return request.args.getlist("department_ids")


def _build_where_and_params(start_date, end_date, department_ids: Optional[List[str]] = None):
    """公共 WHERE 条件与参数."""
    where_clauses = [
        '"结算日期" >= %s',
        '"结算日期" <= %s',
    ]
    params = [start_date, end_date]

    if department_ids:
        # 按科室名称过滤，如果你有科室编码，可改为编码字段
        where_clauses.append('"科室名称" = ANY(%s)')
        params.append(department_ids)

    where_sql = " AND ".join(where_clauses)
    return where_sql, params


def _compute_ratios_from_row(total_cost, drug_cost, material_cost, exam_cost, treatment_cost) -> Dict[str, Optional[float]]:
    """根据汇总金额计算占比（%）."""
    if total_cost is None or total_cost <= 0:
        return {
            "drugCostRatio": None,
            "materialCostRatio": None,
            "examinationCostRatio": None,
            "treatmentCostRatio": None,
        }

    total = float(total_cost)
    return {
        "drugCostRatio": float(drug_cost or 0) / total * 100,
        "materialCostRatio": float(material_cost or 0) / total * 100,
        "examinationCostRatio": float(exam_cost or 0) / total * 100,
        "treatmentCostRatio": float(treatment_cost or 0) / total * 100,
    }


def _get_period_ratios(start_date, end_date, department_ids: Optional[List[str]] = None) -> Dict[str, Optional[float]]:
    """
    聚合一个时间段内的总费用及各类费用，返回占比字典：
    {
      "drugCostRatio": float | None,
      ...
    }
    """
    conn = get_conn()
    try:
        cur = conn.cursor()
        where_sql, params = _build_where_and_params(start_date, end_date, department_ids)

        sql = f"""
        SELECT
            SUM("总费用") AS total_cost,
            SUM("药品总费用") AS drug_cost,
            SUM("耗材总费用") AS material_cost,
            SUM("化验费") AS exam_cost,
            SUM("服务项目总费用") AS treatment_cost
        FROM t_drg_detailed_analysis
        WHERE {where_sql}
        """
        logger.debug("Period ratio SQL: %s | params=%s", sql, params)
        cur.execute(sql, params)
        row = cur.fetchone()
        if not row:
            return {
                "drugCostRatio": None,
                "materialCostRatio": None,
                "examinationCostRatio": None,
                "treatmentCostRatio": None,
            }

        total_cost, drug_cost, material_cost, exam_cost, treatment_cost = row
        return _compute_ratios_from_row(total_cost, drug_cost, material_cost, exam_cost, treatment_cost)
    finally:
        put_conn(conn)


# ===== 接口实现 =====

@bp.route("/init", methods=["GET"])
def init():
    """
    初始化接口：
    返回科室列表：
    {
      "success": true,
      "data": {
        "departments": [{ "id": "...", "name": "..." }]
      }
    }
    """
    conn = get_conn()
    try:
        cur = conn.cursor()
        # 这里根据 DRG 视图取科室列表，如果实际字段不同自行调整
        sql = """
        SELECT DISTINCT "科室名称"
        FROM t_drg_detailed_analysis
        WHERE "科室名称" IS NOT NULL
        ORDER BY "科室名称"
        """
        cur.execute(sql)
        rows = cur.fetchall()

        departments = [
            {"id": r[0], "name": r[0]}
            for r in rows
        ]

        return jsonify({
            "success": True,
            "data": {
                "departments": departments
            }
        })
    except Exception as e:
        logger.exception("初始化住院次均费用占比失败: %s", e)
        return jsonify({
            "success": False,
            "message": f"初始化失败: {e}"
        }), 500
    finally:
        put_conn(conn)


@bp.route("/chart", methods=["GET"])
def chart():
    """
    图表接口：
    返回按日期 + 科室维度的占比数据列表。
    """
    start_date, end_date = _parse_date_range_from_request()
    department_ids = _get_department_ids_from_request()

    cache_key = f"inpatient_avg_cost_ratio:chart:{start_date}:{end_date}:{','.join(sorted(department_ids))}"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify({"success": True, "data": cached})

    conn = get_conn()
    try:
        cur = conn.cursor()
        where_sql, params = _build_where_and_params(start_date, end_date, department_ids)

        sql = f"""
        SELECT
            "结算日期"::date AS billing_date,
            "科室名称" AS dep_name,
            SUM("总费用") AS total_cost,
            SUM("药品总费用") AS drug_cost,
            SUM("耗材总费用") AS material_cost,
            SUM("化验费") AS exam_cost,
            SUM("服务项目总费用") AS treatment_cost
        FROM t_drg_detailed_analysis
        WHERE {where_sql}
        GROUP BY billing_date, dep_name
        ORDER BY billing_date, dep_name
        """
        logger.debug("Chart SQL: %s | params=%s", sql, params)
        cur.execute(sql, params)
        rows = cur.fetchall()

        result = []
        for row in rows:
            billing_date, dep_name, total_cost, drug_cost, material_cost, exam_cost, treatment_cost = row
            ratios = _compute_ratios_from_row(total_cost, drug_cost, material_cost, exam_cost, treatment_cost)

            # 与前端 ChartDataItem 对应
            item = {
                "date": billing_date.isoformat(),
                "departmentId": dep_name,      # 暂用科室名称作为 ID
                "departmentName": dep_name,
                "data": {
                    key: (ratios[key] if ratios[key] is not None else 0.0)
                    for key in INDICATOR_KEYS
                }
            }
            result.append(item)

        cache_set(cache_key, result, ttl_seconds=300)

        return jsonify({
            "success": True,
            "data": result
        })
    except Exception as e:
        logger.exception("获取住院次均费用占比图表数据失败: %s", e)
        return jsonify({
            "success": False,
            "message": f"获取图表数据失败: {e}"
        }), 500
    finally:
        put_conn(conn)


@bp.route("/summary", methods=["GET"])
def summary():
    """
    汇总接口：
    返回整个时间段、所选科室维度上的总体占比。
    """
    start_date, end_date = _parse_date_range_from_request()
    department_ids = _get_department_ids_from_request()

    cache_key = f"inpatient_avg_cost_ratio:summary:{start_date}:{end_date}:{','.join(sorted(department_ids))}"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify({"success": True, "data": cached})

    try:
        ratios = _get_period_ratios(start_date, end_date, department_ids)
        # 转为 SummaryData 格式（四个字段）
        data = {
            "drugCostRatio": float(ratios["drugCostRatio"] or 0.0),
            "materialCostRatio": float(ratios["materialCostRatio"] or 0.0),
            "examinationCostRatio": float(ratios["examinationCostRatio"] or 0.0),
            "treatmentCostRatio": float(ratios["treatmentCostRatio"] or 0.0),
        }

        cache_set(cache_key, data, ttl_seconds=300)

        return jsonify({
            "success": True,
            "data": data
        })
    except Exception as e:
        logger.exception("获取住院次均费用占比汇总数据失败: %s", e)
        return jsonify({
            "success": False,
            "message": f"获取汇总数据失败: {e}"
        }), 500


@bp.route("/comparison", methods=["GET"])
def comparison():
    """
    同比 / 环比接口：
    GET /comparison?type=yoy|mom&start_date=...&end_date=...&department_ids=...
    返回：
    {
      "drugCostRatio": {
        "current_value": float,
        "comparison_value": float,
        "change_rate": float,   # 百分比，如 5.3 表示 +5.3%
        "change_type": "up"|"down"|"flat"|"no_data"|"no_baseline"
      },
      ...
    }
    """
    type_ = request.args.get("type", "yoy")
    if type_ not in ("yoy", "mom"):
        return jsonify({
            "success": False,
            "message": "type 参数必须是 'yoy' 或 'mom'"
        }), 400

    start_date, end_date = _parse_date_range_from_request()
    department_ids = _get_department_ids_from_request()

    cache_key = f"inpatient_avg_cost_ratio:comparison:{type_}:{start_date}:{end_date}:{','.join(sorted(department_ids))}"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify({"success": True, "data": cached})

    from datetime import timedelta

    # 当前区间长度
    delta_days = (end_date - start_date).days + 1

    # 计算对比区间
    if type_ == "yoy":
        # 尝试按自然年减一
        try:
            prev_start = start_date.replace(year=start_date.year - 1)
            prev_end = end_date.replace(year=end_date.year - 1)
        except Exception:
            # 保险起见，退回按天数减 365
            prev_start = start_date - timedelta(days=365)
            prev_end = end_date - timedelta(days=365)
    else:  # mom
        prev_end = start_date - timedelta(days=1)
        prev_start = prev_end - timedelta(days=delta_days - 1)

    try:
        current_ratios = _get_period_ratios(start_date, end_date, department_ids)
        previous_ratios = _get_period_ratios(prev_start, prev_end, department_ids)

        result = {}
        for key in INDICATOR_KEYS:
            curr_val = current_ratios.get(key)
            prev_val = previous_ratios.get(key)

            # safe_pct_change 返回的是比率，如 0.05 = +5%
            pct_change = safe_pct_change(curr_val, prev_val)
            if pct_change is None:
                change_rate = 0.0
                if curr_val is None:
                    change_type = "no_data"
                else:
                    change_type = "no_baseline"
            else:
                change_rate = pct_change * 100
                if change_rate > 0:
                    change_type = "up"
                elif change_rate < 0:
                    change_type = "down"
                else:
                    change_type = "flat"

            result[key] = {
                "current_value": float(curr_val or 0.0),
                "comparison_value": float(prev_val or 0.0),
                "change_rate": float(change_rate),
                "change_type": change_type,
            }

        cache_set(cache_key, result, ttl_seconds=300)

        return jsonify({
            "success": True,
            "data": result
        })
    except Exception as e:
        logger.exception("获取住院次均费用占比同比/环比数据失败: %s", e)
        return jsonify({
            "success": False,
            "message": f"获取同比/环比数据失败: {e}"
        }), 500
