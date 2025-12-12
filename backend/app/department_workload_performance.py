import logging
from decimal import Decimal
from io import BytesIO
from flask import Blueprint, request, jsonify, send_file
from typing import Dict, List, Any, Optional, Tuple
from openpyxl import Workbook
from psycopg2.extras import RealDictCursor

from .shared.db import get_db_connection, get_db_cursor  # ✅ 使用优化后的连接池

bp = Blueprint(
    "department_workload_performance",
    __name__,
    url_prefix="/api/department_workload_performance"
)
logger = logging.getLogger(__name__)


# ====== 工具函数 ======
def to_float(v) -> float:
    """安全转换为浮点数"""
    if v is None:
        return 0.0
    if isinstance(v, Decimal):
        return float(v)
    try:
        return float(v)
    except (ValueError, TypeError):
        return 0.0


def _parse_ym(s: str) -> Tuple[int, int, str]:
    """
    解析年月字符串
    支持两种格式：
    - '202508'
    - '2025-08'
    返回: (year, month, fmt)
    """
    s = (s or "").strip()
    if not s:
        raise ValueError("empty ym string")

    if len(s) == 6 and s.isdigit():
        year = int(s[:4])
        month = int(s[4:6])
        fmt = "YYYYMM"
    elif len(s) == 7 and s[4] == "-" and s[:4].isdigit() and s[5:7].isdigit():
        year = int(s[:4])
        month = int(s[5:7])
        fmt = "YYYY-MM"
    else:
        raise ValueError(f"invalid ym format: {s}")

    if month < 1 or month > 12:
        raise ValueError(f"invalid month: {month}")

    return year, month, fmt


def _format_ym(year: int, month: int, fmt: str) -> str:
    """格式化年月"""
    if fmt == "YYYYMM":
        return f"{year}{month:02d}"
    else:  # "YYYY-MM"
        return f"{year}-{month:02d}"


def _month_add(s: str, delta_months: int) -> str:
    """
    在月份上加减月份
    保持原格式（YYYYMM 或 YYYY-MM）不变
    """
    year, month, fmt = _parse_ym(s)
    # 转成总月数
    total = year * 12 + (month - 1) + delta_months
    new_year = total // 12
    new_month = total % 12 + 1
    return _format_ym(new_year, new_month, fmt)


def _safe_ratio(curr: float, base: float) -> float:
    """
    计算百分比增幅：(curr - base) / base * 100
    base 为 0 或 None 时返回 0
    """
    if base is None or base == 0:
        return 0.0
    try:
        return ((curr - base) / base) * 100
    except (ZeroDivisionError, ValueError, TypeError):
        return 0.0


BASE_PERFORMANCE_SQL = """
SELECT yyyy_mm,
    "绩效科室ID",
    "绩效科室名称",
    "绩效科室类别",
    "绩效科室类型",
    "同类序号",
    COALESCE("人数", 0) AS "人数",
    COALESCE("结算收入", 0) AS "结算收入",
    COALESCE("科室直接成本", 0) AS "科室直接成本",
    COALESCE("绩效总额", 0) AS "绩效总额",
    COALESCE("绩效总额", 0) / NULLIF(COALESCE("人数", 0), 0) AS "人均绩效",
    COALESCE("住院工作量点数", 0) AS "住院工作量点数",
    COALESCE("工作量单价", 0) AS "工作量单价",
    COALESCE("工作量系数", 0) AS "工作量系数",
    COALESCE("住院工作量绩效非手术介入", 0) AS "住院工作量绩效非手术介入",
    COALESCE("基础手术绩效", 0) AS "基础手术绩效",
    COALESCE("介入绩效", 0) AS "介入绩效",
    COALESCE("造影绩效", 0) AS "造影绩效",
    COALESCE("结算收入", 0) AS "结算费用",
    COALESCE("病种成本", 0) AS "DRG病种成本",
    COALESCE("DRG结余", 0) AS "DRG结余",
    COALESCE("drg系数", 0) AS "drg系数",
    COALESCE("DRG绩效", 0) AS "DRG绩效",
    COALESCE("门诊工作量点数", 0) AS "门诊工作量点数",
    COALESCE("门诊工作量绩效非手术介入", 0) AS "门诊工作量绩效非手术介入",
    COALESCE("门诊基础手术绩效", 0) AS "门诊基础手术绩效",
    COALESCE("门诊介入绩效", 0) AS "门诊介入绩效",
    COALESCE("门诊造影绩效", 0) AS "门诊造影绩效",
    COALESCE("挂号费奖励", 0) AS "挂号费奖励",
    COALESCE("诊察费奖励", 0) AS "诊察费奖励",
    COALESCE("三级手术奖励", 0) AS "三级手术奖励",
    COALESCE("四级手术奖励", 0) AS "四级手术奖励",
    COALESCE("单项奖励合计", 0) AS "单项奖励合计"
   FROM m_v_workload_doc_perform_total
"""


# ====== 查询构建工具 ======
def build_filter_clause(selected_date: str, dep_category: str, dep_type: str, dep_name: str) -> Tuple[str, List[Any]]:
    """
    构建过滤条件
    兼容两种日期格式
    """
    clause = """
        WHERE (
            %s = ''                          -- 没传日期就不过滤
            OR yyyy_mm = %s                  -- 直接等于（比如 '2025-08' = '2025-08'）
            OR REPLACE(yyyy_mm, '-', '') = REPLACE(%s, '-', '')  -- 忽略中间的 '-'
        )
          AND (%s = '' OR "绩效科室类别" = %s)
          AND (%s = '' OR "绩效科室类型" = %s)
          AND (%s = '' OR "绩效科室名称" = %s)
    """
    params = [
        selected_date, selected_date, selected_date,
        dep_category, dep_category,
        dep_type, dep_type,
        dep_name, dep_name,
    ]
    return clause, params


def build_trend_filter_clause(start_date: str, end_date: str, dep_category: str,
                              dep_type: str, dep_name: str) -> Tuple[str, List[Any]]:
    """
    构建趋势查询过滤条件
    """
    clause = """
        WHERE (
            (yyyy_mm >= %s AND yyyy_mm <= %s)
            OR (
                REPLACE(yyyy_mm, '-', '') >= REPLACE(%s, '-', '')
                AND REPLACE(yyyy_mm, '-', '') <= REPLACE(%s, '-', '')
            )
          )
          AND (%s = '' OR "绩效科室类别" = %s)
          AND (%s = '' OR "绩效科室类型" = %s)
          AND (%s = '' OR "绩效科室名称" = %s)
    """
    params = [
        start_date, end_date,
        start_date, end_date,
        dep_category, dep_category,
        dep_type, dep_type,
        dep_name, dep_name,
    ]
    return clause, params


def _query_summary_for_month(conn, month_str: str, dep_category: str,
                             dep_type: str, dep_name: str) -> Dict[str, Any]:
    """
    在指定月份 + 当前筛选条件下，汇总一行数据
    """
    if not month_str:
        return {
            "totalStaffCount": 0,
            "totalSettlementIncome": 0.0,
            "totalDirectCost": 0.0,
            "totalPerformance": 0.0,
            "totalPerCapitaPerformance": 0.0,
            "totalInpatientWorkloadPoints": 0.0,
            "totalInpatientWorkloadPerformance": 0.0,
        }

    summary_sql = f"""
        SELECT
            SUM(COALESCE("人数", 0)) AS total_staff_count,
            SUM(COALESCE("结算收入", 0)) AS total_settlement_income,
            SUM(COALESCE("科室直接成本", 0)) AS total_direct_cost,
            SUM(COALESCE("绩效总额", 0)) AS total_performance,
            CASE WHEN SUM(COALESCE("人数", 0)) > 0
                 THEN SUM(COALESCE("绩效总额", 0)) / SUM(COALESCE("人数", 0))
                 ELSE 0 END AS total_per_capita_performance,
            SUM(COALESCE("住院工作量点数", 0)) AS total_inpatient_workload_points,
            SUM(COALESCE("住院工作量绩效非手术介入", 0)) AS total_inpatient_workload_performance
        FROM (
            {BASE_PERFORMANCE_SQL}
        ) AS combined
        WHERE (%s = '' OR yyyy_mm = %s)
          AND (%s = '' OR "绩效科室类别" = %s)
          AND (%s = '' OR "绩效科室类型" = %s)
          AND (%s = '' OR "绩效科室名称" = %s)
    """

    params = [
        month_str, month_str,
        dep_category, dep_category,
        dep_type, dep_type,
        dep_name, dep_name,
    ]

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(summary_sql, params)
        row = cur.fetchone() or {}

    return {
        "totalStaffCount": int(row.get("total_staff_count") or 0),
        "totalSettlementIncome": to_float(row.get("total_settlement_income")),
        "totalDirectCost": to_float(row.get("total_direct_cost")),
        "totalPerformance": to_float(row.get("total_performance")),
        "totalPerCapitaPerformance": to_float(row.get("total_per_capita_performance")),
        "totalInpatientWorkloadPoints": to_float(row.get("total_inpatient_workload_points")),
        "totalInpatientWorkloadPerformance": to_float(row.get("total_inpatient_workload_performance")),
    }


# ====== 1. 明细数据接口 ======
@bp.route("/performance-data", methods=["GET"])
def performance_data():
    """获取绩效明细数据"""
    try:
        selected_date = request.args.get("selected_date", "").strip()
        dep_category = request.args.get("department_category", "").strip()
        dep_type = request.args.get("department_type", "").strip()
        dep_name = request.args.get("department_name", "").strip()
        page = int(request.args.get("page", "1"))
        page_size = int(request.args.get("page_size", "20"))
        offset = (page - 1) * page_size

        filter_clause, filter_params = build_filter_clause(
            selected_date, dep_category, dep_type, dep_name
        )

        sql_items = f"""
            SELECT *
            FROM (
                {BASE_PERFORMANCE_SQL}
            ) AS combined
            {filter_clause}
            ORDER BY "绩效科室类别", "绩效科室类型", "同类序号"
            LIMIT %s OFFSET %s
        """

        params_items = filter_params + [page_size, offset]

        sql_count = f"""
            SELECT COUNT(*) AS total_count
            FROM (
                {BASE_PERFORMANCE_SQL}
            ) AS combined
            {filter_clause}
        """

        params_count = filter_params

        # 使用新的连接池
        with get_db_cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql_items, params_items)
            rows = cur.fetchall()

            cur.execute(sql_count, params_count)
            count_row = cur.fetchone()
            total_count = count_row["total_count"] if count_row else 0

        items = []
        for r in rows:
            staff_count = r.get("人数") or 0
            total_perf = r.get("绩效总额") or 0
            per_capita = float(total_perf) / staff_count if staff_count else 0

            items.append({
                "id": r.get("绩效科室ID"),
                "departmentCategory": r.get("绩效科室类别"),
                "type": r.get("绩效科室类型"),
                "departmentName": r.get("绩效科室名称"),
                "staffCount": staff_count,
                "settlementIncome": to_float(r.get("结算收入")),
                "directCost": to_float(r.get("科室直接成本")),
                "totalPerformance": to_float(total_perf),
                "perCapitaPerformance": per_capita,
                "inpatientWorkloadPoints": to_float(r.get("住院工作量点数")),
                "workloadUnitPrice": to_float(r.get("工作量单价")),
                "workloadCoefficient": to_float(r.get("工作量系数")),
                "inpatientWorkloadPerformance": to_float(r.get("住院工作量绩效非手术介入")),
            })

        return jsonify({
            "items": items,
            "totalCount": total_count
        })

    except Exception as e:
        logger.error(f"Error in performance_data: {e}", exc_info=True)
        return jsonify({"error": "服务器内部错误"}), 500


# ====== 2. 汇总接口 ======
@bp.route("/summary-data", methods=["GET"])
def summary_data():
    """
    汇总 + 环比 / 同比接口
    """
    try:
        selected_date = request.args.get("selected_date", "").strip()
        dep_category = request.args.get("department_category", "").strip()
        dep_type = request.args.get("department_type", "").strip()
        dep_name = request.args.get("department_name", "").strip()

        # 如果没传月份，保持原行为：整体汇总（不算环比/同比）
        if not selected_date:
            filter_clause, filter_params = build_filter_clause(
                selected_date, dep_category, dep_type, dep_name
            )

            sql = f"""
                SELECT
                    SUM(COALESCE("人数", 0)) AS total_staff_count,
                    SUM(COALESCE("结算收入", 0)) AS total_settlement_income,
                    SUM(COALESCE("科室直接成本", 0)) AS total_direct_cost,
                    SUM(COALESCE("绩效总额", 0)) AS total_performance,
                    CASE WHEN SUM(COALESCE("人数", 0)) > 0
                         THEN SUM(COALESCE("绩效总额", 0)) / SUM(COALESCE("人数", 0))
                         ELSE 0 END AS total_per_capita_performance,
                    SUM(COALESCE("住院工作量点数", 0)) AS total_inpatient_workload_points,
                    SUM(COALESCE("住院工作量绩效非手术介入", 0)) AS total_inpatient_workload_performance
                FROM (
                    {BASE_PERFORMANCE_SQL}
                ) AS combined
                {filter_clause}
            """

            with get_db_cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql, filter_params)
                row = cur.fetchone() or {}

            curr = {
                "totalStaffCount": int(row.get("total_staff_count") or 0),
                "totalSettlementIncome": to_float(row.get("total_settlement_income")),
                "totalDirectCost": to_float(row.get("total_direct_cost")),
                "totalPerformance": to_float(row.get("total_performance")),
                "totalPerCapitaPerformance": to_float(row.get("total_per_capita_performance")),
                "totalInpatientWorkloadPoints": to_float(row.get("total_inpatient_workload_points")),
                "totalInpatientWorkloadPerformance": to_float(row.get("total_inpatient_workload_performance")),
            }

            return jsonify({
                "totalStaffCount": curr["totalStaffCount"],
                "totalSettlementIncome": curr["totalSettlementIncome"],
                "totalDirectCost": curr["totalDirectCost"],
                "totalPerformance": curr["totalPerformance"],
                "totalPerCapitaPerformance": curr["totalPerCapitaPerformance"],
                "totalInpatientWorkloadPoints": curr["totalInpatientWorkloadPoints"],
                "totalInpatientWorkloadPerformance": curr["totalInpatientWorkloadPerformance"],
                "currentMonth": "",
                "prevMonth": "",
                "lastYearMonth": "",
                "currentSummary": curr,
                "prevSummary": curr,
                "lastYearSummary": curr,
                "performanceMoM": 0.0,
                "incomeYoY": 0.0,
                "staffMoM": 0.0,
                "perCapitaYoY": 0.0,
            })

        # 有 selected_date 的情况：计算本月/上月/去年同月
        try:
            _, _, fmt = _parse_ym(selected_date)
        except ValueError as e:
            return jsonify({"error": f"日期格式错误: {str(e)}"}), 400

        current_month = selected_date
        prev_month = _month_add(current_month, -1)
        last_year_month = _month_add(current_month, -12)

        # 使用单个连接查询所有月份数据
        with get_db_connection() as conn:
            curr = _query_summary_for_month(conn, current_month, dep_category, dep_type, dep_name)
            prev = _query_summary_for_month(conn, prev_month, dep_category, dep_type, dep_name)
            last_year = _query_summary_for_month(conn, last_year_month, dep_category, dep_type, dep_name)

        # 计算环比 / 同比
        performance_mom = _safe_ratio(
            curr["totalPerformance"],
            prev["totalPerformance"],
        )
        income_yoy = _safe_ratio(
            curr["totalSettlementIncome"],
            last_year["totalSettlementIncome"],
        )
        staff_mom = _safe_ratio(
            curr["totalStaffCount"],
            prev["totalStaffCount"],
        )
        per_capita_yoy = _safe_ratio(
            curr["totalPerCapitaPerformance"],
            last_year["totalPerCapitaPerformance"],
        )

        return jsonify({
            "totalStaffCount": curr["totalStaffCount"],
            "totalSettlementIncome": curr["totalSettlementIncome"],
            "totalDirectCost": curr["totalDirectCost"],
            "totalPerformance": curr["totalPerformance"],
            "totalPerCapitaPerformance": curr["totalPerCapitaPerformance"],
            "totalInpatientWorkloadPoints": curr["totalInpatientWorkloadPoints"],
            "totalInpatientWorkloadPerformance": curr["totalInpatientWorkloadPerformance"],
            "currentMonth": current_month,
            "prevMonth": prev_month,
            "lastYearMonth": last_year_month,
            "currentSummary": curr,
            "prevSummary": prev,
            "lastYearSummary": last_year,
            "performanceMoM": round(performance_mom, 2),
            "incomeYoY": round(income_yoy, 2),
            "staffMoM": round(staff_mom, 2),
            "perCapitaYoY": round(per_capita_yoy, 2),
        })

    except Exception as e:
        logger.error(f"Error in summary_data: {e}", exc_info=True)
        return jsonify({"error": "服务器内部错误"}), 500


# ====== 3. 筛选选项接口 ======
@bp.route("/filter-options", methods=["GET"])
def filter_options():
    """获取筛选选项"""
    try:
        sql_cat = f"""
            SELECT DISTINCT "绩效科室类别" AS val
            FROM (
                {BASE_PERFORMANCE_SQL}
            ) x
            WHERE "绩效科室类别" IS NOT NULL
            ORDER BY val
        """

        sql_type = f"""
            SELECT DISTINCT "绩效科室类型" AS val
            FROM (
                {BASE_PERFORMANCE_SQL}
            ) x
            WHERE "绩效科室类型" IS NOT NULL
            ORDER BY val
        """

        sql_name = f"""
            SELECT DISTINCT "绩效科室名称" AS val
            FROM (
                {BASE_PERFORMANCE_SQL}
            ) x
            WHERE "绩效科室名称" IS NOT NULL
            ORDER BY val
        """

        with get_db_cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql_cat)
            categories = [r["val"] for r in cur.fetchall()]

            cur.execute(sql_type)
            types = [r["val"] for r in cur.fetchall()]

            cur.execute(sql_name)
            names = [r["val"] for r in cur.fetchall()]

        return jsonify({
            "categories": categories,
            "types": types,
            "names": names
        })

    except Exception as e:
        logger.error(f"Error in filter_options: {e}", exc_info=True)
        return jsonify({"error": "服务器内部错误"}), 500


# ====== 4. 趋势接口 ======
@bp.route("/trend-data", methods=["GET"])
def trend_data():
    """
    返回某年份（月区间 01~12）的月度明细数据
    """
    try:
        start_date = request.args.get("start_date", "")
        end_date = request.args.get("end_date", "")
        dep_category = request.args.get("department_category", "")
        dep_type = request.args.get("department_type", "")
        dep_name = request.args.get("department_name", "")

        if not start_date or not end_date:
            return jsonify({"error": "起始日期和结束日期不能为空", "items": []}), 400

        # 构建 WHERE 条件
        where_clauses = ["yyyy_mm >= %s", "yyyy_mm <= %s"]
        params = [start_date, end_date]

        if dep_category:
            where_clauses.append('"绩效科室类别" = %s')
            params.append(dep_category)

        if dep_type:
            where_clauses.append('"绩效科室类型" = %s')
            params.append(dep_type)

        if dep_name:
            where_clauses.append('"绩效科室名称" = %s')
            params.append(dep_name)

        where_sql = " AND ".join(where_clauses)

        sql = f"""
            SELECT
                yyyy_mm AS month,
                "绩效科室ID" AS department_id,
                "绩效科室类别" AS department_category,
                "绩效科室类型" AS department_type,
                "绩效科室名称" AS department_name,
                COALESCE("人数", 0) AS staff_count,
                COALESCE("结算收入", 0) AS settlement_income,
                COALESCE("绩效总额", 0) AS total_performance
            FROM (
                {BASE_PERFORMANCE_SQL}
            ) t
            WHERE {where_sql}
            ORDER BY yyyy_mm, "绩效科室类别", "绩效科室类型"
        """

        with get_db_cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

        items = []
        for r in rows:
            items.append({
                "month": r["month"],
                "departmentId": r["department_id"],
                "departmentCategory": r["department_category"],
                "departmentType": r["department_type"],
                "departmentName": r["department_name"],
                "staffCount": int(r["staff_count"] or 0),
                "settlementIncome": float(r["settlement_income"] or 0),
                "totalPerformance": float(r["total_performance"] or 0),
            })

        return jsonify({"items": items})

    except Exception as e:
        logger.error(f"Error in trend_data: {e}", exc_info=True)
        return jsonify({"error": "服务器内部错误", "items": []}), 500


# ====== 5. Excel 导出接口 ======
@bp.route("/export", methods=["POST"])
def export_excel():
    """导出 Excel 文件"""
    try:
        data = request.get_json(force=True)
        selected_date = data.get("selected_date", "").strip()
        dep_category = data.get("department_category", "").strip()
        dep_type = data.get("department_type", "").strip()
        dep_name = data.get("department_name", "").strip()

        filter_clause, filter_params = build_filter_clause(
            selected_date, dep_category, dep_type, dep_name
        )

        sql_items = f"""
            SELECT *
            FROM (
                {BASE_PERFORMANCE_SQL}
            ) AS combined
            {filter_clause}
            ORDER BY "绩效科室类别","绩效科室类型","同类序号"
        """

        params_items = filter_params

        sql_summary = f"""
            SELECT
                SUM(COALESCE("人数", 0)) as total_staff_count,
                SUM(COALESCE("结算收入", 0)) as total_settlement_income,
                SUM(COALESCE("科室直接成本", 0)) as total_direct_cost,
                SUM(COALESCE("绩效总额", 0)) as total_performance,
                CASE
                    WHEN SUM(COALESCE("人数", 0)) > 0
                    THEN SUM(COALESCE("绩效总额", 0)) / SUM(COALESCE("人数", 0))
                    ELSE 0
                END as total_per_capita_performance,
                SUM(COALESCE("住院工作量点数", 0)) as total_inpatient_workload_points,
                SUM(COALESCE("住院工作量绩效非手术介入", 0)) as total_inpatient_workload_performance
            FROM (
                {BASE_PERFORMANCE_SQL}
            ) AS combined
            {filter_clause}
        """

        params_summary = filter_params

        # 使用新的连接池
        with get_db_cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql_items, params_items)
            detail_rows = cur.fetchall()

            cur.execute(sql_summary, params_summary)
            summary = cur.fetchone() or {}

        # 创建 Excel 工作簿
        wb = Workbook()
        ws = wb.active
        ws.title = "绩效明细"

        headers = [
            "绩效月份", "绩效科室ID", "绩效科室类别", "绩效科室类型", "绩效科室名称",
            "人数", "结算收入", "科室直接成本", "绩效总额", "人均绩效",
            "住院工作量点数", "工作量单价", "工作量系数", "住院工作量绩效"
        ]
        ws.append(headers)

        for r in detail_rows:
            staff_count = r.get("人数") or 0
            total_perf = r.get("绩效总额") or 0
            per_capita = float(total_perf) / staff_count if staff_count else 0

            ws.append([
                r.get("yyyy_mm"),
                r.get("绩效科室ID"),
                r.get("绩效科室类别"),
                r.get("绩效科室类型"),
                r.get("绩效科室名称"),
                staff_count,
                float(r.get("结算收入") or 0),
                float(r.get("科室直接成本") or 0),
                float(total_perf or 0),
                per_capita,
                float(r.get("住院工作量点数") or 0),
                float(r.get("工作量单价") or 0),
                float(r.get("工作量系数") or 0),
                float(r.get("住院工作量绩效非手术介入") or 0),
            ])

        # 创建汇总表
        ws2 = wb.create_sheet("汇总")
        ws2.append(["指标", "数值"])
        ws2.append(["总人数", summary.get("total_staff_count", 0) or 0])
        ws2.append(["总结算收入", float(summary.get("total_settlement_income") or 0)])
        ws2.append(["总科室直接成本", float(summary.get("total_direct_cost") or 0)])
        ws2.append(["绩效总额", float(summary.get("total_performance") or 0)])
        ws2.append(["人均绩效", float(summary.get("total_per_capita_performance") or 0)])
        ws2.append(["住院工作量点数", float(summary.get("total_inpatient_workload_points") or 0)])
        ws2.append(["住院工作量绩效", float(summary.get("total_inpatient_workload_performance") or 0)])

        # 保存到内存
        output = BytesIO()
        wb.save(output)
        output.seek(0)

        # 生成文件名
        filename = f"绩效明细_{selected_date or '全部'}"
        if dep_category:
            filename += f"_{dep_category}"
        if dep_type:
            filename += f"_{dep_type}"
        filename += ".xlsx"

        return send_file(
            output,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        logger.error(f"Error in export_excel: {e}", exc_info=True)
        return jsonify({"error": "导出失败"}), 500