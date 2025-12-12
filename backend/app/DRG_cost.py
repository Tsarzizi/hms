from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
from .shared.db import get_db_cursor
from .shared.validators import parse_date_generic
from .shared.calc_utils import calc_rate
from .shared.cache import cache_get, cache_set
import logging

bp = Blueprint("drg_cost", __name__, url_prefix="/api/drg-cost")

logger = logging.getLogger(__name__)


# ======================================================
# 工具函数
# ======================================================
def json_ok(data):
    return jsonify({"success": True, "data": data})


def json_error(msg):
    return jsonify({"success": False, "message": msg}), 400


def build_date_filter_sql(start_date, end_date):
    sql = " WHERE drg.\"结算日期\" >= %s AND drg.\"结算日期\" < %s "
    return sql, [start_date, (end_date + timedelta(days=1))]


def build_dep_filter_sql(dep_ids):
    if not dep_ids:
        return "", []
    placeholders = ",".join(["%s"] * len(dep_ids))
    return f" AND drg.\"科室名称\" IN ({placeholders}) ", dep_ids


# ======================================================
# 1. init – 返回科室列表
# ======================================================
@bp.get("/init")
def init_data():
    cache_key = "drg_cost_init"
    cached = cache_get(cache_key)
    if cached:
        return json_ok(cached)

    sql = """
        SELECT DISTINCT drg."科室名称"
        FROM t_drg_fee_analysis drg
        WHERE drg."科室名称" IS NOT NULL
        ORDER BY drg."科室名称"
    """

    with get_db_cursor() as cur:
        cur.execute(sql)
        rows = cur.fetchall()

    departments = [
        {"id": row[0], "name": row[0]}
        for row in rows
    ]

    result = {"departments": departments}
    cache_set(cache_key, result, ttl_seconds=600)
    return json_ok(result)


# ======================================================
# 2. chart – 图表趋势数据
# ======================================================
@bp.get("/chart")
def chart_data():
    start = request.args.get("start_date")
    end = request.args.get("end_date")
    dep_ids = request.args.getlist("department_ids")

    start_date = parse_date_generic(start)
    end_date = parse_date_generic(end)

    if not start_date or not end_date:
        return json_error("开始/结束日期格式错误")

    date_sql, date_params = build_date_filter_sql(start_date, end_date)
    dep_sql, dep_params = build_dep_filter_sql(dep_ids)

    sql = f"""
        SELECT 
            drg."结算日期"::text AS day,
            AVG(drg."总费用") AS avg_cost,
            AVG(drg."药占比") AS drug_ratio,
            AVG(drg."耗材占比") AS material_ratio
        FROM t_drg_fee_analysis drg
        {date_sql} {dep_sql}
        GROUP BY drg."结算日期"
        ORDER BY drg."结算日期"
    """

    params = date_params + dep_params

    with get_db_cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    result = []
    for r in rows:
        result.append({
            "date": r[0],
            "data": {
                "avgCost": float(r[1] or 0),
                "drugCostRatio": float(r[2] or 0),
                "materialCostRatio": float(r[3] or 0)
            }
        })

    return json_ok(result)


# ======================================================
# 3. summary – 汇总统计卡片
# ======================================================
@bp.get("/summary")
def summary_data():
    start = request.args.get("start_date")
    end = request.args.get("end_date")
    dep_ids = request.args.getlist("department_ids")

    start_date = parse_date_generic(start)
    end_date = parse_date_generic(end)

    date_sql, date_params = build_date_filter_sql(start_date, end_date)
    dep_sql, dep_params = build_dep_filter_sql(dep_ids)

    sql = f"""
        SELECT
            AVG(drg."总费用") AS avg_cost,
            AVG(drg."药占比") AS drug_ratio,
            AVG(drg."耗材占比") AS material_ratio
        FROM t_drg_fee_analysis drg
        {date_sql} {dep_sql}
    """

    params = date_params + dep_params

    with get_db_cursor() as cur:
        cur.execute(sql, params)
        row = cur.fetchone()

    result = {
        "avgCost": float(row[0] or 0),
        "drugCostRatio": float(row[1] or 0),
        "materialCostRatio": float(row[2] or 0)
    }

    return json_ok(result)


# ======================================================
# 4. comparison – 同比/环比 (%)
# ======================================================
@bp.get("/comparison")
def comparison_data():
    change_type = request.args.get("type")  # yoy 或 mom
    start = request.args.get("start_date")
    end = request.args.get("end_date")
    dep_ids = request.args.getlist("department_ids")

    start_date = parse_date_generic(start)
    end_date = parse_date_generic(end)

    if not start_date or not end_date:
        return json_error("日期格式错误")

    # 本期
    date_sql, params = build_date_filter_sql(start_date, end_date)
    dep_sql, dep_params = build_dep_filter_sql(dep_ids)

    base_sql = f"""
        SELECT
            AVG(drg."总费用") AS avg_cost,
            AVG(drg."药占比") AS drug_ratio,
            AVG(drg."耗材占比") AS material_ratio
        FROM t_drg_fee_analysis drg
        {date_sql} {dep_sql}
    """

    with get_db_cursor() as cur:
        cur.execute(base_sql, params + dep_params)
        curr = cur.fetchone()

    # 对比期间
    if change_type == "mom":  # 环比 = 上一周期
        last_start = start_date - (end_date - start_date) - timedelta(days=1)
        last_end = start_date - timedelta(days=1)
    else:  # yoy = 去年同期
        last_start = start_date.replace(year=start_date.year - 1)
        last_end = end_date.replace(year=end_date.year - 1)

    date_sql2, params2 = build_date_filter_sql(last_start, last_end)
    base_sql2 = f"""
        SELECT
            AVG(drg."总费用") AS avg_cost,
            AVG(drg."药占比") AS drug_ratio,
            AVG(drg."耗材占比") AS material_ratio
        FROM t_drg_fee_analysis drg
        {date_sql2} {dep_sql}
    """

    with get_db_cursor() as cur:
        cur.execute(base_sql2, params2 + dep_params)
        prev = cur.fetchone()

    keys = ["avgCost", "drugCostRatio", "materialCostRatio"]

    result = {}
    for i, key in enumerate(keys):
        curr_val = float(curr[i] or 0)
        prev_val = float(prev[i] or 0)
        rate = calc_rate(curr_val, prev_val)
        result[key] = {
            "current_value": curr_val,
            "comparison_value": prev_val,
            "change_rate": round(rate, 4) * 100 if rate is not None else 0,
            "change_type": change_type
        }

    return json_ok(result)


# ======================================================
# 5. detail – 详细表格
# ======================================================
@bp.get("/detail")
def detail_data():
    start = request.args.get("start_date")
    end = request.args.get("end_date")
    dep_ids = request.args.getlist("department_ids")

    start_date = parse_date_generic(start)
    end_date = parse_date_generic(end)

    date_sql, params = build_date_filter_sql(start_date, end_date)
    dep_sql, dep_params = build_dep_filter_sql(dep_ids)

    sql = f"""
        SELECT
            drg."结算日期"::text,
            drg."科室名称",
            AVG(drg."总费用") AS avg_cost,
            AVG(drg."药占比") AS drug_ratio,
            AVG(drg."耗材占比") AS material_ratio,
            COUNT(drg.visit_id) AS patients
        FROM t_drg_fee_analysis drg
        {date_sql} {dep_sql}
        GROUP BY drg."结算日期", drg."科室名称"
        ORDER BY drg."结算日期", drg."科室名称"
    """

    with get_db_cursor() as cur:
        cur.execute(sql, params + dep_params)
        rows = cur.fetchall()

    result = []
    for r in rows:
        result.append({
            "billing_date": r[0],
            "dep_code": r[1],
            "dep_name": r[1],
            "avg_cost": float(r[2] or 0),
            "drug_cost_ratio": float(r[3] or 0),
            "material_cost_ratio": float(r[4] or 0),
            "total_patients": int(r[5] or 0),
        })

    return json_ok(result)
