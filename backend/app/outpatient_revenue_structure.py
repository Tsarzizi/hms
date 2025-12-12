# app/outpatient_revenue_structure.py
import logging
from datetime import date, timedelta

from flask import Blueprint, request, jsonify
import psycopg2.extras

from .shared.db import get_conn, put_conn
from .shared.validators import parse_date_generic

logger = logging.getLogger(__name__)

bp = Blueprint("outpatient_revenue_structure", __name__)

# =====================
# 工具方法
# =====================

def _parse_date_range(args):
    """解析 start_date / end_date，默认最近 30 天"""
    start_str = args.get("start_date")
    end_str = args.get("end_date")

    today = date.today()
    # 和其它模块保持一致：默认统计到“昨天”
    default_end = today - timedelta(days=1)
    default_start = default_end - timedelta(days=29)

    start_date = parse_date_generic(start_str) or default_start
    end_date = parse_date_generic(end_str) or default_end

    if end_date < start_date:
        start_date, end_date = end_date, start_date

    return start_date, end_date


def _parse_dep_filter(args):
    """
    科室筛选：
    - dep_names: 逗号分隔科室名称（优先）
    - dep_codes: 逗号分隔科室编码
    """
    dep_names_raw = args.get("dep_names")
    dep_codes_raw = args.get("dep_codes")

    dep_names = None
    dep_codes = None

    if dep_names_raw:
        dep_names = [x.strip() for x in dep_names_raw.split(",") if x.strip()]
    if dep_codes_raw:
        dep_codes = [x.strip() for x in dep_codes_raw.split(",") if x.strip()]

    return dep_names, dep_codes


def _build_dep_filter_sql(dep_names, dep_codes, params):
    """
    拼接科室过滤条件，写在 WHERE 后面
    """
    conds = []
    if dep_names:
        conds.append("dep_name = ANY(%(dep_names)s)")
        params["dep_names"] = dep_names
    if dep_codes:
        conds.append("t_dep_fee_outp.dep_code = ANY(%(dep_codes)s)")
        params["dep_codes"] = dep_codes

    if conds:
        return " AND (" + " OR ".join(conds) + ")"
    return ""


# =====================
# 主接口：收入结构整体数据
# =====================

@bp.route("/detail", methods=["GET"])
def outpatient_revenue_structure_detail():
    """
    门诊收入结构接口（根据文档实现）：

    请求参数（query string）：
      - start_date: YYYY-MM-DD
      - end_date:   YYYY-MM-DD
      - dep_names:  逗号分隔科室名称（可选）
      - dep_codes:  逗号分隔科室编码（可选）
      - cycle:      时间粒度：day / week / month，默认 month（趋势图用）

    返回：
    {
      "code": 0,
      "data": {
        "summary": { ... },
        "pie": [ ... ],
        "departmentBar": [ ... ],
        "trend": [ ... ],
        "stacked": [ ... ]
      }
    }
    """
    conn = None
    cur = None

    try:
        # ---- 参数解析 ----
        start_date, end_date = _parse_date_range(request.args)
        dep_names, dep_codes = _parse_dep_filter(request.args)

        cycle = (request.args.get("cycle") or "month").lower()
        if cycle not in ("day", "week", "month"):
            cycle = "month"

        logger.info(
            f"[outpatient_revenue_structure] start={start_date}, end={end_date}, "
            f"dep_names={dep_names}, dep_codes={dep_codes}, cycle={cycle}"
        )

        conn = get_conn()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # ===========================
        # 1. 期间总收入 / 医药费用占比 / 涉及科室数量
        # ===========================
        params = {
            "start_date": start_date,
            "end_date": end_date,
        }
        dep_filter_sql = _build_dep_filter_sql(dep_names, dep_codes, params)

        # 医药费用 = 药品类 + 材料类
        # - 药品类：item_class_name LIKE '药品%' OR IN ('西药费','中药费')
        # - 材料类：item_class_name LIKE '材料%' OR IN ('耗材费','医用耗材')
        summary_sql = f"""
            SELECT
                COALESCE(SUM(costs), 0) AS total_revenue,
                COALESCE(SUM(
                    CASE
                        WHEN item_class_name LIKE '药品%%'
                          OR item_class_name IN ('西药费', '中药费')
                        THEN costs
                        ELSE 0
                    END
                ), 0)
                +
                COALESCE(SUM(
                    CASE
                        WHEN item_class_name LIKE '材料%%'
                          OR item_class_name IN ('耗材费', '医用耗材')
                        THEN costs
                        ELSE 0
                    END
                ), 0) AS med_material_cost,
                COALESCE(COUNT(DISTINCT dep_name), 0) AS department_count
            FROM t_dep_fee_outp
            WHERE visit_date BETWEEN %(start_date)s AND %(end_date)s
            {dep_filter_sql}
        """

        cur.execute(summary_sql, params)
        row = cur.fetchone() or {}
        total_revenue = float(row.get("total_revenue") or 0)
        med_material_cost = float(row.get("med_material_cost") or 0)
        dept_count = int(row.get("department_count") or 0)

        if total_revenue > 0:
            med_pct = round(med_material_cost / total_revenue * 100, 2)
        else:
            med_pct = 0.0

        summary = {
            "startDate": start_date.strftime("%Y-%m-%d"),
            "endDate": end_date.strftime("%Y-%m-%d"),
            "totalRevenue": round(total_revenue, 2),
            "medicineCost": round(med_material_cost, 2),
            "medicineSharePct": med_pct,   # 医药费用占比 (%)
            "departmentCount": dept_count, # 涉及科室数量
        }

        # ===========================
        # 2. 饼图：门诊总费用构成占比（按费用类别）
        # ===========================
        params_pie = params.copy()
        dep_filter_sql_pie = _build_dep_filter_sql(dep_names, dep_codes, params_pie)

        pie_sql = f"""
            SELECT
                item_class_name AS fee_category,
                SUM(costs)      AS fee_amount
            FROM t_dep_fee_outp
            WHERE visit_date BETWEEN %(start_date)s AND %(end_date)s
            {dep_filter_sql_pie}
            GROUP BY item_class_name
            HAVING SUM(costs) > 0
            ORDER BY fee_amount DESC
        """

        cur.execute(pie_sql, params_pie)
        pie_rows = cur.fetchall() or []

        total_for_pie = sum(float(r["fee_amount"] or 0) for r in pie_rows) or 1.0

        pie_data = []
        for r in pie_rows:
            amt = float(r["fee_amount"] or 0)
            pct = round(amt / total_for_pie * 100, 2)
            pie_data.append({
                "itemClassName": r["fee_category"],
                "amount": round(amt, 2),
                "percent": pct,
            })

        # ===========================
        # 3. 柱状图：各科室收入对比（总收入 + 占比）
        # ===========================
        params_dep = params.copy()
        dep_filter_sql_dep = _build_dep_filter_sql(dep_names, dep_codes, params_dep)

        dept_sql = f"""
            SELECT
                dep_name        AS department_name,
                SUM(costs)      AS department_revenue
            FROM t_dep_fee_outp
            WHERE visit_date BETWEEN %(start_date)s AND %(end_date)s
            {dep_filter_sql_dep}
            GROUP BY dep_name
            HAVING SUM(costs) > 0
            ORDER BY department_revenue DESC
        """

        cur.execute(dept_sql, params_dep)
        dept_rows = cur.fetchall() or []

        total_for_dept = sum(float(r["department_revenue"] or 0) for r in dept_rows) or 1.0

        dept_bar_data = []
        for r in dept_rows:
            amt = float(r["department_revenue"] or 0)
            pct = round(amt / total_for_dept * 100, 2)
            dept_bar_data.append({
                "departmentName": r["department_name"],
                "amount": round(amt, 2),
                "percent": pct,
            })

        # ===========================
        # 4. 趋势图：收入 & 医药占比时间趋势
        # ===========================
        # 参考文档：按时间周期（day/week/month）汇总 total_income + med_material_cost
        params_trend = params.copy()
        dep_filter_sql_trend = _build_dep_filter_sql(dep_names, dep_codes, params_trend)
        cycle_field = {
            "day": "DATE_TRUNC('day', visit_date)",
            "week": "DATE_TRUNC('week', visit_date)",
            "month": "DATE_TRUNC('month', visit_date)",
        }[cycle]

        trend_sql = f"""
            WITH time_trend_data AS (
                SELECT
                    {cycle_field}           AS stat_time,
                    SUM(costs)             AS total_income,
                    SUM(
                        CASE
                            WHEN item_class_name LIKE '药品%%'
                              OR item_class_name IN ('西药费', '中药费')
                            THEN costs
                            ELSE 0
                        END
                    )
                    +
                    SUM(
                        CASE
                            WHEN item_class_name LIKE '材料%%'
                              OR item_class_name IN ('耗材费', '医用耗材')
                            THEN costs
                            ELSE 0
                        END
                    ) AS med_material_cost
                FROM t_dep_fee_outp
                WHERE visit_date BETWEEN %(start_date)s AND %(end_date)s
                {dep_filter_sql_trend}
                GROUP BY stat_time
            )
            SELECT
                stat_time,
                total_income,
                med_material_cost
            FROM time_trend_data
            ORDER BY stat_time ASC
        """

        cur.execute(trend_sql, params_trend)
        trend_rows = cur.fetchall() or []

        trend_data = []
        for r in trend_rows:
            stat_time = r["stat_time"]
            total_income = float(r["total_income"] or 0)
            med_cost = float(r["med_material_cost"] or 0)
            if total_income > 0:
                med_pct_trend = round(med_cost / total_income * 100, 2)
            else:
                med_pct_trend = 0.0

            if cycle == "month":
                label = stat_time.strftime("%Y-%m")
            elif cycle == "week":
                # 周：用 年-周号
                label = stat_time.strftime("%Y-W%W")
            else:
                label = stat_time.strftime("%Y-%m-%d")

            trend_data.append({
                "period": label,
                "totalIncome": round(total_income, 2),
                "medicineSharePct": med_pct_trend,
            })

        # ===========================
        # 5. 堆叠柱状图：各科室费用结构细分
        # ===========================
        params_stack = params.copy()
        dep_filter_sql_stack = _build_dep_filter_sql(dep_names, dep_codes, params_stack)

        stacked_sql = f"""
            SELECT
                dep_name        AS department_name,
                item_class_name AS fee_category,
                SUM(costs)      AS fee_amount,
                -- 科室内部占比：当前类别费用 ÷ 该科室总收入
                ROUND(
                    SUM(costs) / NULLIF(
                        SUM(SUM(costs)) OVER (PARTITION BY dep_name), 0
                    ) * 100,
                    2
                ) AS percent_in_department
            FROM t_dep_fee_outp
            WHERE visit_date BETWEEN %(start_date)s AND %(end_date)s
            {dep_filter_sql_stack}
            GROUP BY dep_name, item_class_name
            HAVING SUM(costs) > 0
            ORDER BY dep_name, fee_amount DESC
        """

        cur.execute(stacked_sql, params_stack)
        stack_rows = cur.fetchall() or []

        stacked_data = []
        for r in stack_rows:
            amt = float(r["fee_amount"] or 0)
            stacked_data.append({
                "departmentName": r["department_name"],
                "itemClassName": r["fee_category"],
                "amount": round(amt, 2),
                "percentInDepartment": float(r["percent_in_department"] or 0),
            })

        # ===========================
        # 组合返回
        # ===========================
        resp = {
            "code": 0,
            "data": {
                "summary": summary,
                "pie": pie_data,
                "departmentBar": dept_bar_data,
                "trend": trend_data,
                "stacked": stacked_data,
            },
        }
        return jsonify(resp)

    except Exception as e:
        logger.exception("Error in outpatient_revenue_structure_detail")
        return jsonify({
            "code": 500,
            "message": str(e),
            "data": {
                "summary": {},
                "pie": [],
                "departmentBar": [],
                "trend": [],
                "stacked": [],
            }
        }), 500
    finally:
        if cur:
            cur.close()
        if conn:
            put_conn(conn)
