import logging
from datetime import timedelta
from typing import List, Dict, Any, Optional

from flask import Blueprint, request, jsonify

from .shared.db import get_conn, put_conn
from .shared.cache import cache_get, cache_set
from .shared.validators import parse_date_generic, require_params

logger = logging.getLogger(__name__)

# 前端路由期望前缀为 /api/outpatient-drug-cost-analysis
bp = Blueprint("outpatient_drug_cost_analysis", __name__)

# ===========================================================
# 指标配置（和前端 DrugCostIndicator 类型对应）
# 这里只做门诊(outpatient)的四个指标：
#   门诊次均药费（合计）
#   门诊次均西药费
#   门诊次均草药费
#   门诊次均中药费
# ===========================================================
DRUG_COST_INDICATORS: List[Dict[str, Any]] = [
    {
        "key": "total_avg_cost",
        "name": "门诊次均药费（合计）",
        "color": "#2563eb",
        "description": "（西药费 + 草药费 + 中药费）总额 / 门诊人次",
        "unit": "元",
        "category": "outpatient",
        "type": "total",
    },
    {
        "key": "western_avg_cost",
        "name": "门诊次均西药费",
        "color": "#16a34a",
        "description": "西药费总额 / 门诊人次",
        "unit": "元",
        "category": "outpatient",
        "type": "western",
    },
    {
        "key": "herbal_avg_cost",
        "name": "门诊次均草药费",
        "color": "#f97316",
        "description": "草药费总额 / 门诊人次",
        "unit": "元",
        "category": "outpatient",
        "type": "herbal",
    },
    {
        "key": "chinese_avg_cost",
        "name": "门诊次均中药费",
        "color": "#a855f7",
        "description": "中药费总额 / 门诊人次",
        "unit": "元",
        "category": "outpatient",
        "type": "chinese",
    },
]


# ===========================================================
# 通用工具函数
# ===========================================================
def _success(data: Any):
    return jsonify({
        "code": 0,
        "success": True,
        "data": data,
    })


def _error(msg: str, http_status: int = 400):
    return jsonify({
        "code": 1,
        "success": False,
        "message": msg,
        "data": None,
    }), http_status


def _parse_dates(body: Dict[str, Any]):
    """
    解析 start_date / end_date，并转成左闭右开的查询区间：
    [start_date, end_date + 1)
    """
    ok, missing = require_params(body, ["start_date", "end_date"])
    if not ok:
        return None, None, f"缺少参数: {', '.join(missing)}"

    start_date = parse_date_generic(body.get("start_date"))
    end_date = parse_date_generic(body.get("end_date"))

    if not start_date or not end_date:
        return None, None, "日期格式错误，应为 YYYY-MM-DD"

    if start_date > end_date:
        return None, None, "开始日期不能晚于结束日期"

    end_exclusive = end_date + timedelta(days=1)
    return start_date, end_exclusive, None


def _fetch_departments() -> List[Dict[str, str]]:
    """
    获取绩效科室列表：
    来自 t_workload_dep_def2his 的“绩效科室ID / 绩效科室名称”
    """
    cache_key = "drug-cost-detailed:departments"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    conn = None
    result: List[Dict[str, str]] = []
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            sql = """
                SELECT DISTINCT
                    "绩效科室ID"   AS dep_id,
                    "绩效科室名称" AS dep_name
                FROM t_workload_dep_def2his
                WHERE "绩效科室ID" IS NOT NULL
                ORDER BY "绩效科室名称"
            """
            cur.execute(sql)
            for dep_id, dep_name in cur.fetchall():
                result.append({
                    "id": str(dep_id),
                    "name": dep_name,
                })
    except Exception as e:
        logger.exception("获取科室列表失败: %s", e)
    finally:
        if conn:
            put_conn(conn)

    cache_set(cache_key, result, ttl_seconds=600)
    return result


# ===========================================================
# 核心查询：
#   1）真实数据从 t_workload_outp_f 查
#   2）SQL 只汇总“总额 + 人次”
#   3）四个“次均”在应用层计算
#   4）合计只包含：草药费 + 西药费 + 中药费
# ===========================================================
def _query_outpatient_drug_cost(
    start_date,
    end_date_exclusive,
    department_ids: Optional[List[str]],
) -> List[Dict[str, Any]]:
    """
    从门诊明细表 t_workload_outp_f 查询门诊药费数据：
    - 只统计三种药费：草药费 / 西药费 / 中药费
    - 以 (visit_date, 绩效科室) 为粒度聚合
    - 在应用层计算四个“次均药费”指标
    """
    conn = None
    rows: List[Dict[str, Any]] = []

    try:
        conn = get_conn()
        with conn.cursor() as cur:
            params: Dict[str, Any] = {
                "start": start_date,
                "end": end_date_exclusive,
            }

            dep_filter_sql = ""
            if department_ids:
                # 前端传的是绩效科室ID
                params["dep_ids"] = department_ids
                dep_filter_sql = 'AND d."绩效科室ID" = ANY(%(dep_ids)s)'

            # 真实数据从 t_workload_outp_f 表取：
            #   item_class_name 只有：草药费 / 西药费 / 中药费
            #   合计只由这三类组成，不再单独 SUM(f.costs)
            sql = f"""
                SELECT
                    f.visit_date                            AS billing_date,
                    d."绩效科室ID"                           AS dep_id,
                    d."绩效科室名称"                         AS dep_name,
                    COUNT(DISTINCT f.visit_no)              AS visit_count,

                    -- 三种药费
                    SUM(CASE WHEN f.item_class_name = '西药费' THEN f.costs ELSE 0 END) AS western_cost,
                    SUM(CASE WHEN f.item_class_name = '草药费' THEN f.costs ELSE 0 END) AS herbal_cost,
                    SUM(CASE WHEN f.item_class_name = '中药费' THEN f.costs ELSE 0 END) AS chinese_cost

                FROM t_workload_outp_f f
                LEFT JOIN t_workload_dep_def2his d
                    ON d."HIS科室编码"::text = f.ordered_by::text
                WHERE
                    f.visit_date >= %(start)s
                    AND f.visit_date < %(end)s::date + 1
                    {dep_filter_sql}
                GROUP BY
                    f.visit_date,
                    d."绩效科室ID",
                    d."绩效科室名称"
                ORDER BY
                    f.visit_date,
                    d."绩效科室名称"
            """

            logger.debug("drug-cost-detailed SQL: %s; params=%s", sql, params)
            cur.execute(sql, params)

            for (
                billing_date,
                dep_id,
                dep_name,
                visit_count,
                western_cost,
                herbal_cost,
                chinese_cost,
            ) in cur.fetchall():
                visits = visit_count or 0

                if visits <= 0:
                    western_avg = 0.0
                    herbal_avg = 0.0
                    chinese_avg = 0.0
                    total_avg = 0.0
                else:
                    western_sum = float(western_cost or 0)
                    herbal_sum = float(herbal_cost or 0)
                    chinese_sum = float(chinese_cost or 0)

                    # 单项平均
                    western_avg = western_sum / visits
                    herbal_avg = herbal_sum / visits
                    chinese_avg = chinese_sum / visits

                    # ✅ 合计只包含这三种药费
                    total_sum = western_sum + herbal_sum + chinese_sum
                    total_avg = total_sum / visits

                rows.append({
                    "date": billing_date.strftime("%Y-%m-%d"),
                    "department_id": str(dep_id) if dep_id is not None else None,
                    "department_name": dep_name or "全部科室",

                    # 四个“次均”字段（前端 indicator.key 就读这些）
                    "total_avg_cost": round(total_avg, 2),
                    "western_avg_cost": round(western_avg, 2),
                    "herbal_avg_cost": round(herbal_avg, 2),
                    "chinese_avg_cost": round(chinese_avg, 2),
                })

    except Exception as e:
        logger.exception("查询门诊药费数据失败: %s", e)
        raise
    finally:
        if conn:
            put_conn(conn)

    return rows


# ===========================================================
# 接口：初始化
#   GET /api/drug-cost-detailed/init
#   返回科室列表（和可选的指标配置）
# ===========================================================
@bp.route("/init", methods=["GET"])
def init_drug_cost_detailed():
    try:
        data = {
            "departments": _fetch_departments(),
            # 多返回一个 indicators，前端现在只用 departments，不会出错
            "indicators": DRUG_COST_INDICATORS,
        }
        return _success(data)
    except Exception as e:
        logger.exception("drug-cost-detailed init 接口异常: %s", e)
        return _error("初始化失败，请稍后重试", http_status=500)


# ===========================================================
# 接口：数据
#   POST /api/drug-cost-detailed/data
#   body:
#   {
#     "start_date": "2025-11-01",
#     "end_date": "2025-11-21",
#     "department_ids": ["101", "102"]   # 可选
#   }
#
#   返回：
#   {
#     "indicators": [...],
#     "data": [...],
#     "total": 123
#   }
# ===========================================================
@bp.route("/data", methods=["POST"])
def get_drug_cost_detailed_data():
    try:
        body = request.get_json(force=True) or {}
    except Exception:
        body = {}

    # 解析日期
    start_date, end_date_exclusive, err = _parse_dates(body)
    if err:
        return _error(err)

    # 科室筛选
    department_ids = body.get("department_ids") or []
    if not isinstance(department_ids, list):
        return _error("department_ids 必须为字符串数组")

    # 简单缓存：同一时间段 + 同一科室组合，缓存 5 分钟
    cache_key = f"drug-cost-detailed:data:{start_date}:{end_date_exclusive}:{','.join(sorted(map(str, department_ids)))}"
    cached = cache_get(cache_key)
    if cached is not None:
        logger.debug("命中 drug-cost-detailed 数据缓存: %s", cache_key)
        return _success(cached)

    try:
        records = _query_outpatient_drug_cost(start_date, end_date_exclusive, department_ids)

        resp_data = {
            "indicators": DRUG_COST_INDICATORS,
            "data": records,
            "total": len(records),
        }

        cache_set(cache_key, resp_data, ttl_seconds=300)
        return _success(resp_data)
    except Exception as e:
        logger.exception("drug-cost-detailed data 接口异常: %s", e)
        return _error("查询失败，请稍后重试", http_status=500)
