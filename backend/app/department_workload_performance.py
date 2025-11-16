from decimal import Decimal
from io import BytesIO
from flask import Blueprint, request, jsonify, send_file

from openpyxl import Workbook
from psycopg2.extras import RealDictCursor

from .utils.db import get_conn, put_conn  # ✅ 使用你现有的连接池

bp = Blueprint(
    "department_workload_performance",
    __name__,
    url_prefix="/api/department_workload_performance"
)

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
UNION
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
    from m_v_workload_dep_perform_total
"""
# ----------------
# 工具函数
# ----------------
def to_float(v):
    if v is None:
        return 0.0
    if isinstance(v, Decimal):
        return float(v)
    return float(v)


def build_filter_clause(selected_date, dep_category, dep_type, dep_name):
    clause = """
        WHERE (%s = '' OR yyyy_mm = %s)
          AND (%s = '' OR "绩效科室类别" = %s)
          AND (%s = '' OR "绩效科室类型" = %s)
          AND (%s = '' OR "绩效科室名称" = %s)
    """
    params = [
        selected_date, selected_date,
        dep_category, dep_category,
        dep_type, dep_type,
        dep_name, dep_name,
    ]
    return clause, params


def build_trend_filter_clause(start_date, end_date, dep_category, dep_type, dep_name):
    clause = """
        WHERE yyyy_mm >= %s
          AND yyyy_mm <= %s
          AND (%s = '' OR "绩效科室类别" = %s)
          AND (%s = '' OR "绩效科室类型" = %s)
          AND (%s = '' OR "绩效科室名称" = %s)
    """
    params = [
        start_date, end_date,
        dep_category, dep_category,
        dep_type, dep_type,
        dep_name, dep_name,
    ]
    return clause, params


# ----------------
# 1. 明细数据接口
# ----------------
@bp.route("/performance-data", methods=["GET"])
def performance_data():
    selected_date = request.args.get("selected_date", "")
    dep_category = request.args.get("department_category", "")
    dep_type = request.args.get("department_type", "")
    dep_name = request.args.get("department_name", "")
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

    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql_items, params_items)
            rows = cur.fetchall()

            cur.execute(sql_count, params_count)
            count_row = cur.fetchone()
            total_count = count_row["total_count"] if count_row else 0
    finally:
        put_conn(conn)

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


# ----------------
# 2. 汇总接口
# ----------------
@bp.route("/summary-data", methods=["GET"])
def summary_data():
    selected_date = request.args.get("selected_date", "")
    dep_category = request.args.get("department_category", "")
    dep_type = request.args.get("department_type", "")
    dep_name = request.args.get("department_name", "")

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

    params = filter_params

    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params)
            row = cur.fetchone() or {}
    finally:
        put_conn(conn)

    return jsonify({
        "totalStaffCount": row.get("total_staff_count", 0) or 0,
        "totalSettlementIncome": to_float(row.get("total_settlement_income")),
        "totalDirectCost": to_float(row.get("total_direct_cost")),
        "totalPerformance": to_float(row.get("total_performance")),
        "totalPerCapitaPerformance": to_float(row.get("total_per_capita_performance")),
        "totalInpatientWorkloadPoints": to_float(row.get("total_inpatient_workload_points")),
        "totalInpatientWorkloadPerformance": to_float(row.get("total_inpatient_workload_performance")),
    })


# ----------------
# 3. 筛选选项接口
# ----------------
@bp.route("/filter-options", methods=["GET"])
def filter_options():
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

    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql_cat)
            categories = [r["val"] for r in cur.fetchall()]

            cur.execute(sql_type)
            types = [r["val"] for r in cur.fetchall()]

            cur.execute(sql_name)
            names = [r["val"] for r in cur.fetchall()]
    finally:
        put_conn(conn)

    return jsonify({
        "categories": categories,
        "types": types,
        "names": names
    })


# ----------------
# 4. 趋势接口
# ----------------
@bp.route("/trend-data", methods=["GET"])
def trend_data():
    """返回区间内所有月度科室的明细数据，前端自行聚合。"""
    try:
        start_date = request.args.get("start_date", "")
        end_date = request.args.get("end_date", "")
        dep_category = request.args.get("department_category", "")
        dep_type = request.args.get("department_type", "")
        dep_name = request.args.get("department_name", "")

        if not start_date or not end_date:
            return jsonify({"error": "起始日期和结束日期不能为空", "items": []}), 400

        filter_clause, params = build_trend_filter_clause(
            start_date, end_date, dep_category, dep_type, dep_name
        )

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
            ) AS combined
            {filter_clause}
            ORDER BY yyyy_mm, "绩效科室类别", "绩效科室类型", "同类序号"
        """

        conn = get_conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
        finally:
            put_conn(conn)

        items = []
        for r in rows:
            items.append({
                "month": r.get("month"),
                "departmentId": r.get("department_id"),
                "departmentCategory": r.get("department_category"),
                "departmentType": r.get("department_type"),
                "departmentName": r.get("department_name"),
                "staffCount": int(r.get("staff_count") or 0),
                "settlementIncome": to_float(r.get("settlement_income")),
                "totalPerformance": to_float(r.get("total_performance")),
            })

        return jsonify({"items": items})

    except Exception as e:
        return jsonify({"error": f"获取趋势数据失败: {str(e)}", "items": []}), 500


# ----------------
# 5. Excel 导出接口
# ----------------
@bp.route("/export", methods=["POST"])
def export_excel():
    data = request.get_json(force=True)
    selected_date = data.get("selected_date", "")
    dep_category = data.get("department_category", "")
    dep_type = data.get("department_type", "")
    dep_name = data.get("department_name", "")

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

    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql_items, params_items)
            detail_rows = cur.fetchall()

            cur.execute(sql_summary, params_summary)
            summary = cur.fetchone() or {}
    finally:
        put_conn(conn)

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

    ws2 = wb.create_sheet("汇总")
    ws2.append(["指标", "数值"])
    ws2.append(["总人数", summary.get("total_staff_count", 0) or 0])
    ws2.append(["总结算收入", float(summary.get("total_settlement_income") or 0)])
    ws2.append(["总科室直接成本", float(summary.get("total_direct_cost") or 0)])
    ws2.append(["绩效总额", float(summary.get("total_performance") or 0)])
    ws2.append(["人均绩效", float(summary.get("total_per_capita_performance") or 0)])
    ws2.append(["住院工作量点数", float(summary.get("total_inpatient_workload_points") or 0)])
    ws2.append(["住院工作量绩效", float(summary.get("total_inpatient_workload_performance") or 0)])

    output = BytesIO()
    wb.save(output)
    output.seek(0)

    return send_file(
        output,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=f"绩效明细_{selected_date}.xlsx"
    )