# app/outpatient_avg_cost.py
# 只查表版本（性能优化 + 修复 comparison ImportError）

import logging
from datetime import datetime, timedelta
from typing import Any, List, Optional, Dict, Tuple

from flask import Blueprint, request, jsonify

from .shared.db import get_conn, put_conn

logger = logging.getLogger(__name__)

bp = Blueprint("outpatient_avg_cost", __name__)


# =============================
# 工具函数
# =============================

def _parse_date(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%d")


def _json_success(data: Any, message: str = "", code: int = 0):
    return jsonify({"success": True, "data": data, "message": message, "code": code})


def _json_error(message: str, code: int = -1, http_status: int = 500):
    logger.error(f"API error({code}): {message}")
    return (
        jsonify({"success": False, "data": None, "message": message, "code": code}),
        http_status,
    )


def _get_date_params() -> Tuple[str, str]:
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")

    if not start_date or not end_date:
        raise ValueError("start_date 和 end_date 必填，例如：2025-11-01")

    _ = _parse_date(start_date)
    _ = _parse_date(end_date)

    if start_date > end_date:
        raise ValueError("start_date 不能晚于 end_date")

    return start_date, end_date


def _get_department_ids() -> Optional[List[str]]:
    dep_ids = request.args.getlist("department_ids")
    if not dep_ids:
        return None
    # 去重 & 去空
    return list({d for d in dep_ids if d})


def _safe_avg(cost, cnt) -> float:
    if not cnt or cnt == 0:
        return 0.0
    return float(cost or 0) / float(cnt)


# =============================
# 1. 初始化：科室列表（只查科室表）
# =============================

@bp.route("/init", methods=["GET"])
def init_data():
    """
    GET /api/outpatient-avg-cost/init
    """
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        sql = """
            SELECT DISTINCT
                d."HIS科室编码" AS dep_code,
                d."HIS科室名称" AS dep_name
            FROM t_workload_dep_def2his d
            WHERE d."HIS科室编码" IS NOT NULL
        """
        cur.execute(sql)
        rows = cur.fetchall()

        departments = [
            {"id": dep_code, "name": dep_name or dep_code}
            for dep_code, dep_name in rows
        ]

        return _json_success({"departments": departments})
    except Exception as e:
        logger.exception("初始化门急诊次均费用失败")
        return _json_error(f"初始化失败: {e}")
    finally:
        if conn:
            put_conn(conn)


# =============================
# 2. 图表数据（只查 t_workload_outp_f，不连科室表）
# =============================

@bp.route("/chart", methods=["GET"])
def chart():
    """
    GET /api/outpatient-avg-cost/chart
    """
    conn = None
    try:
        start_date, end_date = _get_date_params()
        dep_ids = _get_department_ids()

        conn = get_conn()
        cur = conn.cursor()

        where_clauses = [
            "f.visit_date >= %s",
            "f.visit_date < (%s::date + INTERVAL '1 day')",
        ]
        params: List[Any] = [start_date, end_date]

        if dep_ids:
            where_clauses.append("f.ordered_by = ANY(%s)")
            params.append(dep_ids)

        where_sql = " AND ".join(where_clauses)

        sql = f"""
            SELECT
                f.visit_date::date AS billing_date,
                SUM(f.costs) AS total_costs,
                COUNT(DISTINCT f.visit_no) AS total_visits
            FROM t_workload_outp_f f
            WHERE {where_sql}
            GROUP BY f.visit_date::date
            ORDER BY f.visit_date::date
        """

        cur.execute(sql, params)
        rows = cur.fetchall()

        result: List[Dict[str, Any]] = []
        for billing_date, total_costs, total_visits in rows:
            avg_val = _safe_avg(total_costs, total_visits)
            result.append(
                {
                    "date": billing_date.strftime("%Y-%m-%d"),
                    "data": {
                        "totalAvgCost": round(avg_val, 2),
                        "outpatientAvgCost": round(avg_val, 2),
                        "emergencyAvgCost": 0.0,  # 暂无急诊拆分
                    },
                }
            )

        return _json_success(result)
    except ValueError as e:
        return _json_error(str(e), code=400, http_status=400)
    except Exception as e:
        logger.exception("获取门急诊次均费用图表失败")
        return _json_error(f"查询失败: {e}")
    finally:
        if conn:
            put_conn(conn)


# =============================
# 3. 汇总：内部计算函数 + 对外接口
# =============================

def _compute_summary(
    start_date: str,
    end_date: str,
    dep_ids: Optional[List[str]],
) -> Dict[str, float]:
    """
    统一的汇总计算逻辑：
    - 只查 t_workload_outp_f
    - 时间：visit_date >= start_date AND < end_date + 1
    - 部门：ordered_by = ANY(department_ids)
    """
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        where_clauses = [
            "f.visit_date >= %s",
            "f.visit_date < (%s::date + INTERVAL '1 day')",
        ]
        params: List[Any] = [start_date, end_date]

        if dep_ids:
            where_clauses.append("f.ordered_by = ANY(%s)")
            params.append(dep_ids)

        where_sql = " AND ".join(where_clauses)

        sql = f"""
            SELECT
                SUM(f.costs) AS total_costs,
                COUNT(DISTINCT f.visit_no) AS total_visits
            FROM t_workload_outp_f f
            WHERE {where_sql}
        """

        cur.execute(sql, params)
        row = cur.fetchone()
        if not row:
            return {
                "totalAvgCost": 0.0,
                "outpatientAvgCost": 0.0,
                "emergencyAvgCost": 0.0,
            }

        total_costs, total_visits = row
        avg_val = _safe_avg(total_costs, total_visits)

        return {
            "totalAvgCost": round(avg_val, 2),
            "outpatientAvgCost": round(avg_val, 2),
            "emergencyAvgCost": 0.0,
        }
    finally:
        if conn:
            put_conn(conn)


@bp.route("/summary", methods=["GET"])
def summary():
    """
    GET /api/outpatient-avg-cost/summary
    """
    try:
        start_date, end_date = _get_date_params()
        dep_ids = _get_department_ids()
        data = _compute_summary(start_date, end_date, dep_ids)
        return _json_success(data)
    except ValueError as e:
        return _json_error(str(e), code=400, http_status=400)
    except Exception as e:
        logger.exception("获取门急诊次均费用汇总失败")
        return _json_error(f"查询失败: {e}")


# =============================
# 4. 明细：需要科室名称 → join 科室表
# =============================

@bp.route("/detail", methods=["GET"])
def detail():
    """
    GET /api/outpatient-avg-cost/detail
    """
    conn = None
    try:
        start_date, end_date = _get_date_params()
        dep_ids = _get_department_ids()

        conn = get_conn()
        cur = conn.cursor()

        where_clauses = [
            "f.visit_date >= %s",
            "f.visit_date < (%s::date + INTERVAL '1 day')",
        ]
        params: List[Any] = [start_date, end_date]

        if dep_ids:
            where_clauses.append("f.ordered_by = ANY(%s)")
            params.append(dep_ids)

        where_sql = " AND ".join(where_clauses)

        sql = f"""
            SELECT
                f.visit_date::date AS billing_date,
                f.ordered_by       AS dep_code,
                COALESCE(d."HIS科室名称", f.ordered_by) AS dep_name,
                SUM(f.costs)       AS costs,
                COUNT(DISTINCT f.visit_no) AS visit_count
            FROM t_workload_outp_f f
            LEFT JOIN t_workload_dep_def2his d
              ON d."HIS科室编码"::text = f.ordered_by::text
            WHERE {where_sql}
            GROUP BY f.visit_date::date, f.ordered_by, d."HIS科室名称"
            ORDER BY f.visit_date::date, f.ordered_by
        """

        cur.execute(sql, params)
        rows = cur.fetchall()

        result: List[Dict[str, Any]] = []
        for billing_date, dep_code, dep_name, costs, visit_count in rows:
            result.append(
                {
                    "billing_date": billing_date.strftime("%Y-%m-%d"),
                    "dep_code": dep_code,
                    "dep_name": dep_name,
                    "costs": float(costs or 0),
                    "visit_count": int(visit_count or 0),
                }
            )

        return _json_success(result)
    except ValueError as e:
        return _json_error(str(e), code=400, http_status=400)
    except Exception as e:
        logger.exception("获取门急诊次均费用明细失败")
        return _json_error(f"查询失败: {e}")
    finally:
        if conn:
            put_conn(conn)


# =============================
# 5. 同比 / 环比：基于 _compute_summary
# =============================

def _calc_comparison(current: float, base: float) -> Dict[str, Any]:
    if not base:
        return {
            "current_value": round(current or 0, 2),
            "comparison_value": round(base or 0, 2),
            "change_rate": 0.0,
            "change_type": "flat",
        }

    diff = (current or 0) - (base or 0)
    rate = diff / base * 100.0

    if rate > 0:
        ctype = "up"
    elif rate < 0:
        ctype = "down"
    else:
        ctype = "flat"

    return {
        "current_value": round(current or 0, 2),
        "comparison_value": round(base or 0, 2),
        "change_rate": round(rate, 2),
        "change_type": ctype,
    }


@bp.route("/comparison", methods=["GET"])
def comparison():
    """
    GET /api/outpatient-avg-cost/comparison?type=yoy|mom
    """
    try:
        comp_type = request.args.get("type")
        if comp_type not in ("yoy", "mom"):
            raise ValueError("type 参数必须为 'yoy' 或 'mom'")

        start_date_str, end_date_str = _get_date_params()
        dep_ids = _get_department_ids()

        start_dt = _parse_date(start_date_str)
        end_dt = _parse_date(end_date_str)

        # 当前周期
        current_summary = _compute_summary(start_date_str, end_date_str, dep_ids)

        # 基期周期
        if comp_type == "yoy":
            base_start_dt = start_dt.replace(year=start_dt.year - 1)
            base_end_dt = end_dt.replace(year=end_dt.year - 1)
        else:
            # mom：上一段同长度周期
            delta_days = (end_dt - start_dt).days + 1
            base_end_dt = start_dt - timedelta(days=1)
            base_start_dt = base_end_dt - timedelta(days=delta_days - 1)

        base_summary = _compute_summary(
            base_start_dt.strftime("%Y-%m-%d"),
            base_end_dt.strftime("%Y-%m-%d"),
            dep_ids,
        )

        result: Dict[str, Any] = {}
        for key in ["totalAvgCost", "outpatientAvgCost", "emergencyAvgCost"]:
            curr_val = current_summary.get(key, 0.0)
            base_val = base_summary.get(key, 0.0)
            result[key] = _calc_comparison(curr_val, base_val)

        return _json_success(result)

    except ValueError as e:
        return _json_error(str(e), code=400, http_status=400)
    except Exception as e:
        logger.exception("获取门急诊次均费用同比/环比失败")
        return _json_error(f"查询失败: {e}")
