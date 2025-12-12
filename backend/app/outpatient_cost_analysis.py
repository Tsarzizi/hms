# app/outpatient_cost_analysis.py
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor

from .shared.cache import cache_get, cache_set
from .shared.db import get_conn, put_conn
from .shared.numbers import safe_pct_change
from .shared.validators import require_params, parse_date_generic

bp = Blueprint("outpatient_cost_analysis", __name__)


# ========== 工具函数 ==========


def _safe_div(num: float, den: float) -> float:
    """安全除法，避免除 0 和空值"""
    if not den:
        return 0.0
    try:
        return float(num or 0.0) / float(den)
    except Exception:
        return 0.0


def _build_dep_where_sql(alias: str, dep_ids: Optional[List[str]], params: List[Any]) -> str:
    """
    构建科室过滤：
    - 老口径：按 HIS 科室编码过滤
    - 表：    alias.ordered_by = ANY(%s)
    """
    if not dep_ids:
        return ""

    params.append(dep_ids)
    # 目前只在别名为 o 的表上使用
    if alias == "o":
        return " AND o.ordered_by = ANY(%s) "
    return f" AND {alias}.ordered_by = ANY(%s) "


# ========== 查询层：只查表 t_workload_outp_f ==========


def _query_timeseries(start_date: str, end_date: str, dep_ids: Optional[List[str]]) -> List[Dict[str, Any]]:
    """
    按天汇总门急诊费用（构成 + 人次），供前端折线/饼图使用。

    口径说明（完全对齐 outpatient_avg_cost.py）：
    - 只查表 t_workload_outp_f
    - 时间：visit_date >= start_date AND < end_date + 1
    - 科室：HIS 科室编码 ordered_by = ANY(departments)
    """
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        params: List[Any] = [start_date, end_date]
        where_sql = "o.visit_date >= %s AND o.visit_date < (%s::date + INTERVAL '1 day')"
        dep_where = _build_dep_where_sql("o", dep_ids, params)
        where_sql = where_sql + dep_where

        sql = f"""
            SELECT
                o.visit_date::date AS stat_date,
                SUM(COALESCE(o.costs, 0)) AS total_cost,
                COUNT(DISTINCT o.visit_no) AS visit_count,
                SUM(
                    CASE WHEN o.item_class_name LIKE '%%药%%'
                         THEN COALESCE(o.costs, 0) ELSE 0 END
                ) AS drug_cost,
                SUM(
                    CASE WHEN o.item_class_name LIKE '%%材%%'
                         THEN COALESCE(o.costs, 0) ELSE 0 END
                ) AS material_cost,
                SUM(
                    CASE WHEN o.item_class_name LIKE '%%检%%'
                         THEN COALESCE(o.costs, 0) ELSE 0 END
                ) AS examination_cost,
                SUM(
                    CASE WHEN o.item_class_name LIKE '%%治%%'
                         THEN COALESCE(o.costs, 0) ELSE 0 END
                ) AS treatment_cost,
                SUM(
                    CASE
                        WHEN o.item_class_name LIKE '%%药%%' THEN 0
                        WHEN o.item_class_name LIKE '%%材%%' THEN 0
                        WHEN o.item_class_name LIKE '%%检%%' THEN 0
                        WHEN o.item_class_name LIKE '%%治%%' THEN 0
                        ELSE COALESCE(o.costs, 0)
                    END
                ) AS other_cost
            FROM t_workload_outp_f o
            WHERE {where_sql}
            GROUP BY o.visit_date::date
            ORDER BY o.visit_date::date;
        """

        cur.execute(sql, params)
        rows = cur.fetchall() or []
        return rows
    finally:
        put_conn(conn)


def _query_summary(start_date: str, end_date: str, dep_ids: Optional[List[str]]) -> Dict[str, float]:
    """
    汇总某个区间的整体指标，用于同比 / 环比。
    口径对齐 outpatient_avg_cost.py：
    - 只查表 t_workload_outp_f
    - totalAvgCost = 区间总费用 / 区间总人次
    """
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        params: List[Any] = [start_date, end_date]
        where_sql = "o.visit_date >= %s AND o.visit_date < (%s::date + INTERVAL '1 day')"
        dep_where = _build_dep_where_sql("o", dep_ids, params)
        where_sql = where_sql + dep_where

        sql = f"""
            SELECT
                SUM(COALESCE(o.costs, 0)) AS total_cost,
                COUNT(DISTINCT o.visit_no) AS visit_count,
                SUM(
                    CASE WHEN o.item_class_name LIKE '%%药%%'
                         THEN COALESCE(o.costs, 0) ELSE 0 END
                ) AS drug_cost,
                SUM(
                    CASE WHEN o.item_class_name LIKE '%%材%%'
                         THEN COALESCE(o.costs, 0) ELSE 0 END
                ) AS material_cost,
                SUM(
                    CASE WHEN o.item_class_name LIKE '%%检%%'
                         THEN COALESCE(o.costs, 0) ELSE 0 END
                ) AS examination_cost,
                SUM(
                    CASE WHEN o.item_class_name LIKE '%%治%%'
                         THEN COALESCE(o.costs, 0) ELSE 0 END
                ) AS treatment_cost,
                SUM(
                    CASE
                        WHEN o.item_class_name LIKE '%%药%%' THEN 0
                        WHEN o.item_class_name LIKE '%%材%%' THEN 0
                        WHEN o.item_class_name LIKE '%%检%%' THEN 0
                        WHEN o.item_class_name LIKE '%%治%%' THEN 0
                        ELSE COALESCE(o.costs, 0)
                    END
                ) AS other_cost
            FROM t_workload_outp_f o
            WHERE {where_sql};
        """

        cur.execute(sql, params)
        row = cur.fetchone() or {}

        total_cost = float(row.get("total_cost") or 0.0)
        visit_count = float(row.get("visit_count") or 0.0)
        drug_cost = float(row.get("drug_cost") or 0.0)
        material_cost = float(row.get("material_cost") or 0.0)
        exam_cost = float(row.get("examination_cost") or 0.0)
        treatment_cost = float(row.get("treatment_cost") or 0.0)
        other_cost = float(row.get("other_cost") or 0.0)

        total_avg = _safe_div(total_cost, visit_count)

        drug_ratio = _safe_div(drug_cost, total_cost) * 100
        material_ratio = _safe_div(material_cost, total_cost) * 100
        exam_ratio = _safe_div(exam_cost, total_cost) * 100
        treatment_ratio = _safe_div(treatment_cost, total_cost) * 100

        # 医保 / 个人支付：全部忽略，统一返回 0（方案 A）
        insurance_ratio = 0.0
        personal_ratio = 0.0
        insurance_avg = 0.0
        personal_avg = 0.0

        return {
            "totalAvgCost": total_avg,
            "drugCostRatio": drug_ratio,
            "materialCostRatio": material_ratio,
            "examinationCostRatio": exam_ratio,
            "treatmentCostRatio": treatment_ratio,
            "insurancePaymentRatio": insurance_ratio,
            "personalPaymentRatio": personal_ratio,
            "insuranceAvgPayment": insurance_avg,
            "personalAvgPayment": personal_avg,
        }
    finally:
        put_conn(conn)


def _build_comparison(
    current: Dict[str, float],
    previous: Dict[str, float],
) -> Dict[str, Dict[str, Any]]:
    """
    构造前端需要的 ComparisonData：
    {
      indicatorKey: {
        current,
        previous,
        changeRate,  # 百分数（如 12.3 表示 12.3%）
        changeType: 'increase' | 'decrease' | 'stable'
      }
    }
    """
    keys = [
        "totalAvgCost",
        "drugCostRatio",
        "materialCostRatio",
        "examinationCostRatio",
        "treatmentCostRatio",
        "insurancePaymentRatio",
        "personalPaymentRatio",
    ]
    result: Dict[str, Dict[str, Any]] = {}

    for key in keys:
        cur_val = float(current.get(key) or 0.0)
        prev_val = float(previous.get(key) or 0.0)

        pct = safe_pct_change(cur_val, prev_val)  # 比值，如 0.12
        if pct is None:
            change_rate = 0.0
        else:
            change_rate = pct * 100

        if abs(change_rate) < 1e-6:
            change_type = "stable"
        elif change_rate > 0:
            change_type = "increase"
        else:
            change_type = "decrease"

        result[key] = {
            "current": round(cur_val, 2),
            "previous": round(prev_val, 2),
            "changeRate": round(change_rate, 2),
            "changeType": change_type,
        }

    return result


# ========== 科室下拉（按 HIS 科室口径） ==========


@bp.route("/departments", methods=["GET"])
def get_departments():
    """
    科室列表接口（老口径：HIS 科室）：
    返回：
    {
      "success": true,
      "data": [
        { "id": "...HIS科室编码...", "name": "...HIS科室名称..." },
        ...
      ]
    }
    """
    cache_key = "outpatient_cost_departments_his"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify({"success": True, "data": cached})

    conn = get_conn()
    try:
        sql = """
            SELECT DISTINCT
                d."HIS科室编码" AS id,
                d."HIS科室名称" AS name
            FROM t_workload_dep_def2his d
            WHERE d."HIS科室编码" IS NOT NULL
            ORDER BY d."HIS科室名称";
        """
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql)
            rows = cur.fetchall() or []

        cache_set(cache_key, rows, ttl_seconds=600)
        return jsonify({"success": True, "data": rows})
    except Exception as e:
        print("获取门急诊次均费用 - 科室列表失败:", e)
        return jsonify({
            "success": False,
            "data": [],
            "message": f"获取科室列表失败: {e}",
        }), 500
    finally:
        put_conn(conn)


# ========== 主分析接口 ==========


@bp.route("/analysis", methods=["POST"])
def analysis():
    """
    门急诊次均费用分析接口（POST JSON）：
    请求：
    {
      "startDate": "2025-11-01",
      "endDate": "2025-11-18",
      "departments": ["HIS001", "HIS002"]   # HIS 科室编码列表，可选
    }

    返回：
    {
      "success": true,
      "data": {
        "analysisData": [...],     # 按日
        "costStructure": {...},    # 区间费用构成合计
        "comparison": {
          "yearOverYear": {...},
          "monthOverMonth": {...}
        },
        "overallSummary": {...}    # totalAvgCost 口径与 /outpatient-avg-cost/summary 一致
      }
    }
    """
    try:
        payload = request.get_json(silent=True) or {}

        ok, missing = require_params(payload, ["startDate", "endDate"])
        if not ok:
            return jsonify({
                "success": False,
                "data": {},
                "message": f"缺少必填参数: {', '.join(missing)}",
            }), 400

        start_date_raw = payload.get("startDate")
        end_date_raw = payload.get("endDate")
        dep_ids = payload.get("departments") or None

        start_date = parse_date_generic(start_date_raw)
        end_date = parse_date_generic(end_date_raw)

        if not start_date or not end_date:
            return jsonify({
                "success": False,
                "data": {},
                "message": "startDate 或 endDate 格式不正确，应为 YYYY-MM-DD",
            }), 400

        if start_date > end_date:
            return jsonify({
                "success": False,
                "data": {},
                "message": "开始日期不能晚于结束日期",
            }), 400

        start_str = start_date.isoformat()
        end_str = end_date.isoformat()

        # 1. 时序数据（按日）
        rows = _query_timeseries(
            start_date=start_str,
            end_date=end_str,
            dep_ids=dep_ids,
        )

        analysis_data: List[Dict[str, Any]] = []
        total_drug = total_material = total_exam = total_treatment = total_other = 0.0
        prev_avg_for_change = 0.0

        for r in rows:
            # stat_date 是 date 类型（RealDictCursor），也可能已是字符串
            stat_date = r.get("stat_date")
            if hasattr(stat_date, "isoformat"):
                date_str = stat_date.isoformat()
            else:
                date_str = str(stat_date)

            total_cost = float(r.get("total_cost") or 0.0)
            visit_count = float(r.get("visit_count") or 0.0)
            drug_cost = float(r.get("drug_cost") or 0.0)
            material_cost = float(r.get("material_cost") or 0.0)
            exam_cost = float(r.get("examination_cost") or 0.0)
            treatment_cost = float(r.get("treatment_cost") or 0.0)
            other_cost = float(r.get("other_cost") or 0.0)

            total_avg = _safe_div(total_cost, visit_count)

            drug_ratio = _safe_div(drug_cost, total_cost) * 100
            material_ratio = _safe_div(material_cost, total_cost) * 100
            exam_ratio = _safe_div(exam_cost, total_cost) * 100
            treatment_ratio = _safe_div(treatment_cost, total_cost) * 100

            # 医保 / 个人支付：统一为 0（方案 A）
            insurance_ratio = 0.0
            personal_ratio = 0.0
            insurance_avg = 0.0
            personal_avg = 0.0

            # 单日费用变动率：与前一天平均费用对比
            pct = safe_pct_change(total_avg, prev_avg_for_change) if prev_avg_for_change else None
            cost_change_rate = (pct or 0.0) * 100

            analysis_data.append({
                "date": date_str,
                "totalAvgCost": round(total_avg, 2),
                "drugCostRatio": round(drug_ratio, 2),
                "materialCostRatio": round(material_ratio, 2),
                "examinationCostRatio": round(exam_ratio, 2),
                "treatmentCostRatio": round(treatment_ratio, 2),
                "costChangeRate": round(cost_change_rate, 2),
                "insurancePaymentRatio": round(insurance_ratio, 2),
                "personalPaymentRatio": round(personal_ratio, 2),
                "insuranceAvgPayment": round(insurance_avg, 2),
                "personalAvgPayment": round(personal_avg, 2),
            })

            prev_avg_for_change = total_avg

            # 汇总构成
            total_drug += drug_cost
            total_material += material_cost
            total_exam += exam_cost
            total_treatment += treatment_cost
            total_other += other_cost

        cost_structure = {
            "drugCost": round(total_drug, 2),
            "materialCost": round(total_material, 2),
            "examinationCost": round(total_exam, 2),
            "treatmentCost": round(total_treatment, 2),
            "otherCost": round(total_other, 2),
        }

        # 2. 整体汇总（老口径：总费用/总人次）
        current_summary = _query_summary(
            start_date=start_str,
            end_date=end_str,
            dep_ids=dep_ids,
        )

        # 3. 同比：往前平移一年（365 天）
        yoy_start = (start_date - timedelta(days=365)).isoformat()
        yoy_end = (end_date - timedelta(days=365)).isoformat()
        yoy_summary = _query_summary(
            start_date=yoy_start,
            end_date=yoy_end,
            dep_ids=dep_ids,
        )

        # 4. 环比：取同长度的上一时间段
        delta_days = (end_date - start_date).days + 1
        mom_end_date = start_date - timedelta(days=1)
        mom_start_date = mom_end_date - timedelta(days=delta_days - 1)
        mom_summary = _query_summary(
            start_date=mom_start_date.isoformat(),
            end_date=mom_end_date.isoformat(),
            dep_ids=dep_ids,
        )

        year_over_year = _build_comparison(current_summary, yoy_summary)
        month_over_month = _build_comparison(current_summary, mom_summary)

        return jsonify({
            "success": True,
            "data": {
                "analysisData": analysis_data,
                "costStructure": cost_structure,
                "comparison": {
                    "yearOverYear": year_over_year,
                    "monthOverMonth": month_over_month,
                },
                "overallSummary": {
                    k: round(v, 2) for k, v in current_summary.items()
                },
            },
        })
    except Exception as e:
        print("门急诊次均费用分析接口异常:", e)
        return jsonify({
            "success": False,
            "data": {
                "analysisData": [],
                "costStructure": {
                    "drugCost": 0,
                    "materialCost": 0,
                    "examinationCost": 0,
                    "treatmentCost": 0,
                    "otherCost": 0,
                },
                "comparison": {
                    "yearOverYear": {},
                    "monthOverMonth": {},
                },
                "overallSummary": {},
            },
            "message": f"门急诊次均费用分析失败: {e}",
        }), 500
