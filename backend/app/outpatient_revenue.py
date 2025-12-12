import logging
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor

# 因文件放在 backend/app 目录下，导入 shared 模块需用 app.shared 前缀（正确适配路径）
from app.shared.db import get_conn, put_conn
from app.shared.cache import cache_get, cache_set
from app.shared.validators import require_params, parse_date_generic

logger = logging.getLogger(__name__)

# 初始化Blueprint（路由前缀/api，与前端接口匹配）
bp = Blueprint("outpatient_revenue", __name__)

# ====== 常量配置 ======
# 核心数据视图（请替换为你的实际表名）
MAIN_MATERIALIZED_VIEW = "mv_outpatient_income_structure"
# 费用类别映射（前端需要的7类费用）- 使用精确匹配
FEE_CLASS_MAPPING = {
    "westernMedicine": ["西药费", "西药"],
    "chineseMedicine": ["中药费", "中药", "中成药", "草药"],
    "examinationFee": ["化验费", "检验费", "检查费", "放射费", "CT", "彩超", "核磁共振", "心电图"],
    "treatmentFee": ["治疗费", "康复治疗", "理疗费"],
    "surgeryFee": ["手术费", "麻醉费"],
    "materialFee": ["材料费", "医用耗材", "高值耗材"],
    "otherFee": ["其他", "挂号费", "诊查费"]  # 明确指定其他费用
}
# 缓存有效期（10分钟）
CACHE_TTL_SECONDS = 600


# ====== 工具函数 ======

def _to_float(value) -> float:
    """安全转换为 float 类型"""
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _build_dep_filter(dep_ids: Optional[List[str]]) -> Tuple[str, List[Any]]:
    """构造科室过滤条件"""
    if not dep_ids or len(dep_ids) == 0:
        return "", []
    return f" AND dept_code = ANY(%s) ", [dep_ids]


def _build_doctor_filter(doctor_ids: Optional[List[str]]) -> Tuple[str, List[Any]]:
    """构造医生过滤条件（适配虚拟ID）"""
    if not doctor_ids or len(doctor_ids) == 0:
        return "", []
    return f" AND md5(COALESCE(doctor_name, '未知医生') || dept_code) = ANY(%s) ", [doctor_ids]


def _safe_ratio(numerator: float, denominator: float) -> float:
    """安全计算比例（保留2位小数）"""
    if denominator == 0:
        return 0.0
    # 确保数值类型为 float
    numerator_float = _to_float(numerator)
    denominator_float = _to_float(denominator)
    return round((numerator_float / denominator_float) * 100, 2)


def _safe_pct_change(curr: float, prev: float) -> Optional[float]:
    """安全计算百分比变化（返回小数）"""
    if prev is None or prev == 0 or curr is None:
        return None
    try:
        curr_float = _to_float(curr)
        prev_float = _to_float(prev)
        change = (curr_float - prev_float) / prev_float
        # 限制变化率在合理范围内（-1000% 到 1000%）
        if change > 10:  # 1000%
            return 10.0
        elif change < -10:  # -1000%
            return -10.0
        return round(change, 4)
    except Exception:
        return None


def _calculate_change(curr: float, prev: float) -> Tuple[float, str]:
    """计算变化率（百分比）和变化类型"""
    change_rate = _safe_pct_change(curr, prev)
    if change_rate is None:
        return 0.0, "stable"
    change_rate_pct = change_rate * 100
    if change_rate_pct > 0.1:  # 增加阈值避免微小波动
        return (round(change_rate_pct, 1), "increase")
    elif change_rate_pct < -0.1:
        return (round(change_rate_pct, 1), "decrease")
    else:
        return (0.0, "stable")


def _map_fee_class_to_category(fee_class_name: str) -> str:
    """将费用类别名称映射到7大分类"""
    fee_class_lower = fee_class_name.lower()

    # 精确匹配逻辑，避免重复计算
    for category, keywords in FEE_CLASS_MAPPING.items():
        for keyword in keywords:
            if keyword in fee_class_lower:
                return category

    return "otherFee"


def _get_trend_date_list(start_date: date, end_date: date) -> List[str]:
    """生成按月的趋势日期列表（YYYY-MM）"""
    date_list = []
    current = start_date
    while current <= end_date:
        date_str = current.strftime("%Y-%m")
        if date_str not in date_list:
            date_list.append(date_str)
        if current.month == 12:
            current = current.replace(year=current.year + 1, month=1)
        else:
            current = current.replace(month=current.month + 1)
    return date_list


def _calculate_medical_cost_ratio(drug_cost_structure: Dict[str, float]) -> float:
    """计算医药费用占比（西药 + 中药 + 材料费）"""
    return round(
        drug_cost_structure["westernMedicine"] +
        drug_cost_structure["chineseMedicine"] +
        drug_cost_structure["materialFee"],
        2
    )


# ====== 接口实现 ======

@bp.route("/departments", methods=["GET"])
def get_departments():
    """获取科室列表"""
    try:
        cache_key = "outpatient_revenue:departments"
        cached_data = cache_get(cache_key)
        if cached_data is not None:
            return jsonify({
                "success": True,
                "data": cached_data,
                "message": "科室列表获取成功（缓存）"
            })

        conn = get_conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(f"""
                    SELECT DISTINCT dept_code AS id, dept_name AS name
                    FROM {MAIN_MATERIALIZED_VIEW}
                    WHERE dept_name != '未知科室'
                    ORDER BY dept_name ASC
                """)
                rows = cur.fetchall()
                departments = [{"id": row["id"], "name": row["name"]} for row in rows]
        finally:
            put_conn(conn)

        cache_set(cache_key, departments, ttl_seconds=CACHE_TTL_SECONDS)
        return jsonify({
            "success": True,
            "data": departments,
            "message": "科室列表获取成功"
        })
    except Exception as e:
        logger.exception("Get departments error")
        return jsonify({
            "success": False,
            "data": [],
            "message": f"获取科室列表失败: {str(e)}"
        }), 500


@bp.route("/doctors", methods=["GET"])
def get_doctors():
    """获取医生列表（支持按科室筛选）"""
    try:
        departments = request.args.get("departments")
        dep_ids = departments.split(",") if departments else None
        if dep_ids == [""]:
            dep_ids = None

        conn = get_conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                dep_sql, dep_params = _build_dep_filter(dep_ids)
                cur.execute(f"""
                    SELECT DISTINCT
                        md5(COALESCE(doctor_name, '未知医生') || dept_code) AS id,
                        COALESCE(doctor_name, '未知医生') AS name,
                        dept_code AS "departmentId"
                    FROM {MAIN_MATERIALIZED_VIEW}
                    WHERE 1=1
                    {dep_sql}
                    ORDER BY name ASC
                """, dep_params)
                rows = cur.fetchall()
                doctors = [dict(row) for row in rows]
        finally:
            put_conn(conn)

        return jsonify({
            "success": True,
            "data": doctors,
            "message": "医生列表获取成功"
        })
    except Exception as e:
        logger.exception("Get doctors error")
        return jsonify({
            "success": False,
            "data": [],
            "message": f"获取医生列表失败: {str(e)}"
        }), 500


@bp.route("/revenue-structure", methods=["POST"])
def get_revenue_data():
    """获取收入结构完整数据"""
    try:
        payload = request.get_json(force=True) or {}

        # 验证必填参数
        ok, missing = require_params(payload, ["startDate", "endDate"])
        if not ok:
            return jsonify({
                "success": False,
                "data": None,
                "message": f"缺少必填参数: {', '.join(missing)}"
            }), 400

        # 解析日期
        start_date = parse_date_generic(payload["startDate"])
        end_date = parse_date_generic(payload["endDate"])
        if not start_date or not end_date:
            return jsonify({
                "success": False,
                "data": None,
                "message": "日期格式错误，应为YYYY-MM-DD"
            }), 400
        if start_date > end_date:
            return jsonify({
                "success": False,
                "data": None,
                "message": "开始日期不能大于结束日期"
            }), 400

        # 解析筛选参数
        dep_ids = payload.get("departments")
        if dep_ids and not isinstance(dep_ids, list):
            dep_ids = None
        doctor_ids = payload.get("doctors")
        if doctor_ids and not isinstance(doctor_ids, list):
            doctor_ids = None

        conn = get_conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # 基础查询条件
                dep_sql, dep_params = _build_dep_filter(dep_ids)
                doctor_sql, doctor_params = _build_doctor_filter(doctor_ids)
                base_query = f"""
                    SELECT
                        stat_date, stat_month, dept_code, dept_name,
                        fee_class_name, fee_class_group, fee_amount
                    FROM {MAIN_MATERIALIZED_VIEW}
                    WHERE stat_date BETWEEN %s AND %s
                    {dep_sql}
                    {doctor_sql}
                """
                base_params = [start_date, end_date] + dep_params + doctor_params

                # 1. 当前统计数据
                # 1.1 总收入
                cur.execute(f"SELECT COALESCE(SUM(fee_amount), 0) AS total FROM ({base_query}) AS sub", base_params)
                total_revenue_result = cur.fetchone()["total"] or 0.0
                total_revenue = _to_float(total_revenue_result)  # 转换为 float

                if total_revenue == 0:
                    return jsonify({
                        "success": True,
                        "data": {
                            "currentStats": {
                                "drugCostStructure": {k: 0.0 for k in FEE_CLASS_MAPPING.keys()},
                                "departmentRevenueStructure": {},
                                "totalRevenue": 0.0
                            },
                            "trendData": [],
                            "comparison": {"yearOverYear": {}, "monthOverMonth": {}}
                        },
                        "message": "当前筛选条件下无数据"
                    })

                # 1.2 医药费用构成 - 修复版本
                # 直接按费用类别分组，然后映射到7大分类
                cur.execute(f"""
                    SELECT fee_class_name, COALESCE(SUM(fee_amount), 0) AS class_total
                    FROM ({base_query}) AS sub
                    GROUP BY fee_class_name
                """, base_params)
                fee_class_rows = cur.fetchall()

                # 初始化费用结构
                drug_cost_structure = {k: 0.0 for k in FEE_CLASS_MAPPING.keys()}
                category_amounts = {k: 0.0 for k in FEE_CLASS_MAPPING.keys()}  # 存储实际金额

                # 首先计算每个类别的实际金额
                for row in fee_class_rows:
                    fee_class_name = row["fee_class_name"]
                    class_total = _to_float(row["class_total"])

                    # 将费用类别映射到7大分类
                    category = _map_fee_class_to_category(fee_class_name)
                    category_amounts[category] += class_total

                # 然后计算百分比
                for category, amount in category_amounts.items():
                    drug_cost_structure[category] = _safe_ratio(amount, total_revenue)

                # 确保总比例为100%，处理浮点误差
                total_ratio = sum(drug_cost_structure.values())
                if abs(total_ratio - 100.0) > 0.1:  # 允许0.1%的误差
                    # 重新归一化
                    for key in drug_cost_structure:
                        drug_cost_structure[key] = round(drug_cost_structure[key] * 100.0 / total_ratio, 2)

                # 1.3 科室收入构成
                cur.execute(f"""
                    SELECT dept_name, COALESCE(SUM(fee_amount), 0) AS dept_total
                    FROM ({base_query}) AS sub
                    GROUP BY dept_name
                    ORDER BY dept_total DESC
                """, base_params)
                dept_rows = cur.fetchall()
                dept_revenue_structure = {
                    row["dept_name"]: _safe_ratio(_to_float(row["dept_total"]), total_revenue)
                    for row in dept_rows
                }

                current_stats = {
                    "drugCostStructure": drug_cost_structure,
                    "departmentRevenueStructure": dept_revenue_structure,
                    "totalRevenue": round(total_revenue, 2)
                }

                # 2. 趋势数据 - 使用相同的修复逻辑
                trend_date_list = _get_trend_date_list(start_date, end_date)
                cur.execute(f"""
                    SELECT
                        stat_month AS date,
                        fee_class_name,
                        dept_name,
                        COALESCE(SUM(fee_amount), 0) AS fee_total
                    FROM ({base_query}) AS sub
                    GROUP BY stat_month, fee_class_name, dept_name
                    ORDER BY stat_month ASC
                """, base_params)
                trend_rows = cur.fetchall()

                trend_date_map = {}
                for date_str in trend_date_list:
                    trend_date_map[date_str] = {
                        "category_amounts": {k: 0.0 for k in FEE_CLASS_MAPPING.keys()},
                        "dept_amounts": {},
                        "total": 0.0
                    }

                for row in trend_rows:
                    date_str = row["date"]
                    if date_str not in trend_date_map:
                        continue

                    fee_class_name = row["fee_class_name"]
                    fee_total = _to_float(row["fee_total"])
                    dept_name = row["dept_name"]

                    # 映射费用类别
                    category = _map_fee_class_to_category(fee_class_name)
                    trend_date_map[date_str]["category_amounts"][category] += fee_total

                    # 科室金额
                    trend_date_map[date_str]["dept_amounts"][dept_name] = trend_date_map[date_str]["dept_amounts"].get(
                        dept_name, 0.0) + fee_total
                    trend_date_map[date_str]["total"] += fee_total

                trend_data = []
                for date_str, data in trend_date_map.items():
                    # 计算百分比
                    month_drug_cost = {}
                    for category, amount in data["category_amounts"].items():
                        month_drug_cost[category] = _safe_ratio(amount, data["total"])

                    # 确保月度总比例为100%
                    month_total_ratio = sum(month_drug_cost.values())
                    if month_total_ratio > 0 and abs(month_total_ratio - 100.0) > 0.1:
                        for key in month_drug_cost:
                            month_drug_cost[key] = round(month_drug_cost[key] * 100.0 / month_total_ratio, 2)

                    month_dept_revenue = {
                        dept: _safe_ratio(amt, data["total"])
                        for dept, amt in data["dept_amounts"].items()
                    }

                    trend_data.append({
                        "date": date_str,
                        "data": {
                            "drugCostStructure": month_drug_cost,
                            "departmentRevenueStructure": month_dept_revenue,
                            "totalRevenue": round(data["total"], 2)
                        }
                    })

                # 3. 同比环比数据
                # 3.1 当前衍生指标
                current_med_ratio = _calculate_medical_cost_ratio(drug_cost_structure)
                current_dept_count = len(dept_revenue_structure)

                # 3.2 同比
                try:
                    yoy_start = start_date.replace(year=start_date.year - 1)
                    yoy_end = end_date.replace(year=end_date.year - 1)
                except ValueError:
                    yoy_start = start_date - timedelta(days=365)
                    yoy_end = end_date - timedelta(days=365)

                # 同比基础查询
                yoy_base_query = f"""
                    SELECT
                        stat_date, stat_month, dept_code, dept_name,
                        fee_class_name, fee_class_group, fee_amount
                    FROM {MAIN_MATERIALIZED_VIEW}
                    WHERE stat_date BETWEEN %s AND %s
                    {dep_sql}
                    {doctor_sql}
                """
                yoy_params = [yoy_start, yoy_end] + dep_params + doctor_params

                # 同比总收入
                cur.execute(f"SELECT COALESCE(SUM(fee_amount), 0) AS total FROM ({yoy_base_query}) AS sub", yoy_params)
                yoy_total_result = cur.fetchone()["total"] or 0.0
                yoy_total = _to_float(yoy_total_result)

                # 同比医药费用构成
                yoy_med_ratio = 0.0
                if yoy_total > 0:
                    cur.execute(f"""
                        SELECT fee_class_name, COALESCE(SUM(fee_amount), 0) AS class_total
                        FROM ({yoy_base_query}) AS sub
                        GROUP BY fee_class_name
                    """, yoy_params)
                    yoy_fee_class_rows = cur.fetchall()

                    yoy_category_amounts = {k: 0.0 for k in FEE_CLASS_MAPPING.keys()}
                    for row in yoy_fee_class_rows:
                        fee_class_name = row["fee_class_name"]
                        class_total = _to_float(row["class_total"])
                        category = _map_fee_class_to_category(fee_class_name)
                        yoy_category_amounts[category] += class_total

                    yoy_med_ratio = _safe_ratio(
                        yoy_category_amounts["westernMedicine"] +
                        yoy_category_amounts["chineseMedicine"] +
                        yoy_category_amounts["materialFee"],
                        yoy_total
                    )

                # 同比科室数量
                cur.execute(f"SELECT COUNT(DISTINCT dept_name) AS cnt FROM ({yoy_base_query}) AS sub", yoy_params)
                yoy_dept_count = cur.fetchone()["cnt"] or 0

                # 3.3 环比
                # 计算环比日期范围（相同天数）
                period_days = (end_date - start_date).days + 1
                mom_start = start_date - timedelta(days=period_days)
                mom_end = end_date - timedelta(days=period_days)

                # 环比基础查询
                mom_base_query = f"""
                    SELECT
                        stat_date, stat_month, dept_code, dept_name,
                        fee_class_name, fee_class_group, fee_amount
                    FROM {MAIN_MATERIALIZED_VIEW}
                    WHERE stat_date BETWEEN %s AND %s
                    {dep_sql}
                    {doctor_sql}
                """
                mom_params = [mom_start, mom_end] + dep_params + doctor_params

                # 环比总收入
                cur.execute(f"SELECT COALESCE(SUM(fee_amount), 0) AS total FROM ({mom_base_query}) AS sub", mom_params)
                mom_total_result = cur.fetchone()["total"] or 0.0
                mom_total = _to_float(mom_total_result)

                # 环比医药费用构成
                mom_med_ratio = 0.0
                if mom_total > 0:
                    cur.execute(f"""
                        SELECT fee_class_name, COALESCE(SUM(fee_amount), 0) AS class_total
                        FROM ({mom_base_query}) AS sub
                        GROUP BY fee_class_name
                    """, mom_params)
                    mom_fee_class_rows = cur.fetchall()

                    mom_category_amounts = {k: 0.0 for k in FEE_CLASS_MAPPING.keys()}
                    for row in mom_fee_class_rows:
                        fee_class_name = row["fee_class_name"]
                        class_total = _to_float(row["class_total"])
                        category = _map_fee_class_to_category(fee_class_name)
                        mom_category_amounts[category] += class_total

                    mom_med_ratio = _safe_ratio(
                        mom_category_amounts["westernMedicine"] +
                        mom_category_amounts["chineseMedicine"] +
                        mom_category_amounts["materialFee"],
                        mom_total
                    )

                # 环比科室数量
                cur.execute(f"SELECT COUNT(DISTINCT dept_name) AS cnt FROM ({mom_base_query}) AS sub", mom_params)
                mom_dept_count = cur.fetchone()["cnt"] or 0

                # 3.4 组装同比环比
                comparison = {
                    "yearOverYear": {
                        "totalRevenue": {
                            "current": round(total_revenue, 2),
                            "previous": round(yoy_total, 2),
                            "changeRate": _calculate_change(total_revenue, yoy_total)[0],
                            "changeType": _calculate_change(total_revenue, yoy_total)[1]
                        },
                        "drugCostRatio": {
                            "current": round(current_med_ratio, 2),
                            "previous": round(yoy_med_ratio, 2),
                            "changeRate": _calculate_change(current_med_ratio, yoy_med_ratio)[0],
                            "changeType": _calculate_change(current_med_ratio, yoy_med_ratio)[1]
                        },
                        "departmentCount": {
                            "current": current_dept_count,
                            "previous": yoy_dept_count,
                            "changeRate": _calculate_change(current_dept_count, yoy_dept_count)[0],
                            "changeType": _calculate_change(current_dept_count, yoy_dept_count)[1]
                        }
                    },
                    "monthOverMonth": {
                        "totalRevenue": {
                            "current": round(total_revenue, 2),
                            "previous": round(mom_total, 2),
                            "changeRate": _calculate_change(total_revenue, mom_total)[0],
                            "changeType": _calculate_change(total_revenue, mom_total)[1]
                        },
                        "drugCostRatio": {
                            "current": round(current_med_ratio, 2),
                            "previous": round(mom_med_ratio, 2),
                            "changeRate": _calculate_change(current_med_ratio, mom_med_ratio)[0],
                            "changeType": _calculate_change(current_med_ratio, mom_med_ratio)[1]
                        },
                        "departmentCount": {
                            "current": current_dept_count,
                            "previous": mom_dept_count,
                            "changeRate": _calculate_change(current_dept_count, mom_dept_count)[0],
                            "changeType": _calculate_change(current_dept_count, mom_dept_count)[1]
                        }
                    }
                }

                return jsonify({
                    "success": True,
                    "data": {
                        "currentStats": current_stats,
                        "trendData": trend_data,
                        "comparison": comparison
                    },
                    "message": "收入结构数据获取成功"
                })
        finally:
            put_conn(conn)
    except Exception as e:
        logger.exception("获取收入结构数据时发生异常（详细信息）")
        return jsonify({
            "success": False,
            "data": None,
            "message": f"获取收入结构数据失败: {str(e)}"
        }), 500