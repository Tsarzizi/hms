from flask import Blueprint, request, jsonify, send_file
from decimal import Decimal
from io import BytesIO

from openpyxl import Workbook
from psycopg2.extras import RealDictCursor

from app.utils.db import get_conn, put_conn  # ✅ 使用你现有的连接池

bp = Blueprint(
    "department_workload_performance",
    __name__,
    url_prefix="/api/department_workload_performance"
)


# ----------------
# 工具函数
# ----------------
def to_float(v):
    if v is None:
        return 0.0
    if isinstance(v, Decimal):
        return float(v)
    return float(v)


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

    # psycopg2 占位符使用 %s，注意顺序对应
    sql_items = """
        SELECT *
        FROM (
            SELECT * FROM m_v_workload_doc_perform_total
            UNION ALL
            SELECT * FROM m_v_workload_dep_perform_total
        ) AS combined
        WHERE yyyy_mm = %s
          AND (%s = '' OR "绩效科室类别" = %s)
          AND (%s = '' OR "绩效科室类型" = %s)
          AND (%s = '' OR "绩效科室名称" = %s)
        ORDER BY "绩效科室类别", "同类序号"
        LIMIT %s OFFSET %s
    """

    params_items = [
        selected_date,
        dep_category, dep_category,
        dep_type, dep_type,
        dep_name, dep_name,
        page_size, offset,
    ]

    sql_count = """
        SELECT COUNT(*) AS total_count
        FROM (
            SELECT * FROM m_v_workload_doc_perform_total
            UNION ALL
            SELECT * FROM m_v_workload_dep_perform_total
        ) AS combined
        WHERE yyyy_mm = %s
          AND (%s = '' OR "绩效科室类别" = %s)
          AND (%s = '' OR "绩效科室类型" = %s)
          AND (%s = '' OR "绩效科室名称" = %s)
    """

    params_count = [
        selected_date,
        dep_category, dep_category,
        dep_type, dep_type,
        dep_name, dep_name,
    ]

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

    sql = """
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
            SELECT * FROM m_v_workload_doc_perform_total
            UNION ALL
            SELECT * FROM m_v_workload_dep_perform_total
        ) AS combined
        WHERE yyyy_mm = %s
          AND (%s = '' OR "绩效科室类别" = %s)
          AND (%s = '' OR "绩效科室类型" = %s)
          AND (%s = '' OR "绩效科室名称" = %s)
    """

    params = [
        selected_date,
        dep_category, dep_category,
        dep_type, dep_type,
        dep_name, dep_name,
    ]

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
    sql_cat = """
        SELECT DISTINCT "绩效科室类别" AS val
        FROM (
            SELECT "绩效科室类别" FROM m_v_workload_doc_perform_total
            UNION ALL
            SELECT "绩效科室类别" FROM m_v_workload_dep_perform_total
        ) x
        WHERE val IS NOT NULL
        ORDER BY val
    """

    sql_type = """
        SELECT DISTINCT "绩效科室类型" AS val
        FROM (
            SELECT "绩效科室类型" FROM m_v_workload_doc_perform_total
            UNION ALL
            SELECT "绩效科室类型" FROM m_v_workload_dep_perform_total
        ) x
        WHERE val IS NOT NULL
        ORDER BY val
    """

    sql_name = """
        SELECT DISTINCT "绩效科室名称" AS val
        FROM (
            SELECT "绩效科室名称" FROM m_v_workload_doc_perform_total
            UNION ALL
            SELECT "绩效科室名称" FROM m_v_workload_dep_perform_total
        ) x
        WHERE val IS NOT NULL
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
    try:
        start_date = request.args.get("start_date", "")
        end_date = request.args.get("end_date", "")
        dep_category = request.args.get("department_category", "")
        dep_type = request.args.get("department_type", "")
        dep_name = request.args.get("department_name", "")

        # 参数验证
        if not start_date or not end_date:
            return jsonify({"error": "起始日期和结束日期不能为空", "items": []}), 400

        print(f"趋势数据查询参数: start_date={start_date}, end_date={end_date}")  # 调试日志

        sql = """
            SELECT 
                yyyy_mm AS month,
                SUM(COALESCE("绩效总额",0)) AS total_performance,
                SUM(COALESCE("结算收入",0)) AS total_settlement_income,
                SUM(COALESCE("人数",0)) AS total_staff_count
            FROM (
                SELECT * FROM m_v_workload_doc_perform_total
                UNION ALL
                SELECT * FROM m_v_workload_dep_perform_total
            ) AS combined
            WHERE yyyy_mm >= %s
              AND yyyy_mm <= %s
              AND (%s = '' OR "绩效科室类别" = %s)
              AND (%s = '' OR "绩效科室类型" = %s)
              AND (%s = '' OR "绩效科室名称" = %s)
            GROUP BY yyyy_mm
            ORDER BY yyyy_mm
        """

        params = [
            start_date,
            end_date,
            dep_category, dep_category,
            dep_type, dep_type,
            dep_name, dep_name,
        ]

        conn = get_conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
                print(f"查询到 {len(rows)} 条趋势数据")  # 调试日志
        finally:
            put_conn(conn)

        items = []
        for r in rows:
            items.append({
                "month": r["month"],
                "totalPerformance": to_float(r["total_performance"]),
                "totalSettlementIncome": to_float(r["total_settlement_income"]),
                "totalStaffCount": int(r["total_staff_count"] or 0),
            })

        return jsonify({"items": items})

    except Exception as e:
        print(f"趋势数据查询错误: {str(e)}")  # 调试日志
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

    sql_items = """
        SELECT *
        FROM (
            SELECT * FROM m_v_workload_doc_perform_total
            UNION ALL
            SELECT * FROM m_v_workload_dep_perform_total
        ) AS combined
        WHERE yyyy_mm = %s
          AND (%s = '' OR "绩效科室类别" = %s)
          AND (%s = '' OR "绩效科室类型" = %s)
          AND (%s = '' OR "绩效科室名称" = %s)
        ORDER BY "绩效科室类别","同类序号"
    """

    params_items = [
        selected_date,
        dep_category, dep_category,
        dep_type, dep_type,
        dep_name, dep_name,
    ]

    sql_summary = """
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
            SELECT * FROM m_v_workload_doc_perform_total
            UNION ALL
            SELECT * FROM m_v_workload_dep_perform_total
        ) AS combined
        WHERE yyyy_mm = %s
          AND (%s = '' OR "绩效科室类别" = %s)
          AND (%s = '' OR "绩效科室类型" = %s)
          AND (%s = '' OR "绩效科室名称" = %s)
    """

    params_summary = [
        selected_date,
        dep_category, dep_category,
        dep_type, dep_type,
        dep_name, dep_name,
    ]

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
