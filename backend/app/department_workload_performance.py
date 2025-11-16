from decimal import Decimal
from io import BytesIO
from flask import Blueprint, request, jsonify, send_file

from openpyxl import Workbook
from psycopg2.extras import RealDictCursor

from app.utils.db import get_conn, put_conn  # ✅ 使用你现有的连接池

bp = Blueprint(
    "department_workload_performance",
    __name__,
    url_prefix="/api/department_workload_performance"
)

BASE_PERFORMANCE_SQL = """
WITH date_range AS (
         SELECT DISTINCT t_workload_inp.yyyy_mm
           FROM t_workload_inp
        ), department_info AS (
         SELECT DISTINCT t_workload_dep_def."绩效科室ID",
            t_workload_dep_def."绩效科室名称",
            t_workload_dep_def."绩效科室属性",
            t_workload_dep_def."绩效科室类别",
            t_workload_dep_def."绩效科室类型",
            t_workload_dep_def."工作量单价",
            t_workload_dep_def."工作量系数",
            t_workload_dep_def."人数",
            t_workload_dep_def."同类序号"
           FROM t_workload_dep_def
        ), main_data AS (
         SELECT d.yyyy_mm,
            h."绩效科室ID",
            h."绩效科室名称",
            h."绩效科室属性",
            h."绩效科室类别",
            h."绩效科室类型",
            h."工作量单价",
            h."工作量系数",
            h."人数",
            h."同类序号"
           FROM (date_range d
             CROSS JOIN department_info h)
        ), income_data AS (
         SELECT combined_data.yyyy_mm,
            combined_data.department,
            sum(combined_data.costs) AS total_cost
           FROM ( SELECT t_workload_inp.yyyy_mm,
                    t_workload_inp.patient_in_dept AS department,
                    t_workload_inp.costs
                   FROM t_workload_inp
                UNION ALL
                 SELECT t_workload_outp.yyyy_mm,
                    t_workload_outp.ordered_by AS department,
                    t_workload_outp.costs
                   FROM t_workload_outp) combined_data
          GROUP BY combined_data.yyyy_mm, combined_data.department
        ), department_income AS (
         SELECT s.yyyy_mm,
            h."绩效科室ID",
            sum(s.total_cost) AS total_income
           FROM (income_data s
             LEFT JOIN t_workload_dep_def2fina h ON (((h."fina科室编码")::text = (s.department)::text)))
          GROUP BY s.yyyy_mm, h."绩效科室ID"
        ), workload_metrics_1 AS (
         SELECT v_workload_matrix.yyyy_mm,
            v_workload_matrix."绩效科室ID",
            sum(v_workload_matrix.inp_zyjx) AS total_inp_zyjx,
            sum(v_workload_matrix.inp_jrjx) AS total_inp_jrjx,
            sum(v_workload_matrix.inp_ssjx) AS total_inp_ssjx,
            sum(v_workload_matrix.inp_bill) AS total_inp_bill,
            sum(v_workload_matrix.inp_zxjx) AS total_inp_zxjx,
            sum(v_workload_matrix.outp_zyjx) AS total_outp_zyjx,
            sum(v_workload_matrix.outp_jrjx) AS total_outp_jrjx,
            sum(v_workload_matrix.outp_ssjx) AS total_outp_ssjx,
            sum(v_workload_matrix.outp_bill) AS total_outp_bill,
            sum(v_workload_matrix.outp_zxjx) AS total_outp_zxjx,
            sum(v_workload_matrix.inp_nurse) AS total_inp_nurse,
            sum(v_workload_matrix.outp_nurse) AS total_outp_nurse
           FROM v_workload_matrix
          GROUP BY v_workload_matrix.yyyy_mm, v_workload_matrix."绩效科室ID"
        ), workload_metrics AS (
         SELECT workload_metrics_1.yyyy_mm,
            workload_metrics_1."绩效科室ID",
            sum(workload_metrics_1.total_inp_zyjx) AS total_inp_zyjx,
            sum(workload_metrics_1.total_inp_jrjx) AS total_inp_jrjx,
            sum(workload_metrics_1.total_inp_ssjx) AS total_inp_ssjx,
            sum(workload_metrics_1.total_inp_bill) AS total_inp_bill,
            sum(workload_metrics_1.total_inp_zxjx) AS total_inp_zxjx,
            sum(workload_metrics_1.total_outp_zyjx) AS total_outp_zyjx,
            sum(workload_metrics_1.total_outp_jrjx) AS total_outp_jrjx,
            sum(workload_metrics_1.total_outp_ssjx) AS total_outp_ssjx,
            sum(workload_metrics_1.total_outp_bill) AS total_outp_bill,
            sum(workload_metrics_1.total_outp_zxjx) AS total_outp_zxjx,
            sum(workload_metrics_1.total_inp_nurse) AS total_inp_nurse,
            sum(workload_metrics_1.total_outp_nurse) AS total_outp_nurse
           FROM workload_metrics_1
          GROUP BY workload_metrics_1.yyyy_mm, workload_metrics_1."绩效科室ID"
        ), award_metrics AS (
         SELECT v_workload_matrix_award.yyyy_mm,
            v_workload_matrix_award."绩效科室ID",
            v_workload_matrix_award."绩效科室名称",
            sum(v_workload_matrix_award.outp_zcfjl) AS total_outp_zcfjl,
            sum(v_workload_matrix_award.outp_ghfjl) AS total_outp_ghfjl,
            sum(v_workload_matrix_award.surgery_award_3) AS total_surgery_award_3,
            sum(v_workload_matrix_award.surgery_award_4) AS total_surgery_award_4,
            sum(v_workload_matrix_award.total_surgery_award) AS total_surgery_award_sum
           FROM v_workload_matrix_award
          GROUP BY v_workload_matrix_award.yyyy_mm, v_workload_matrix_award."绩效科室ID", v_workload_matrix_award."绩效科室名称"
        ), cost_metrics AS (
         SELECT v_workload_dep_cost_month."年月" AS yyyy_mm,
            v_workload_dep_cost_month."绩效科室ID",
            COALESCE(v_workload_dep_cost_month."科室直接成本", (0)::numeric) AS "科室直接成本",
            COALESCE(v_workload_dep_cost_month."人员工资", (0)::numeric) AS "人员工资",
            COALESCE(v_workload_dep_cost_month."五险一金", (0)::numeric) AS "五险一金",
            COALESCE(v_workload_dep_cost_month."卫生材料", (0)::numeric) AS "卫生材料",
            COALESCE(v_workload_dep_cost_month."其他材料", (0)::numeric) AS "其他材料",
            COALESCE(v_workload_dep_cost_month."固定资产折旧", (0)::numeric) AS "固定资产折旧",
            COALESCE(v_workload_dep_cost_month."无形资产摊销", (0)::numeric) AS "无形资产摊销",
            COALESCE(v_workload_dep_cost_month."维修（护）费", (0)::numeric) AS "维修（护）费",
            COALESCE(v_workload_dep_cost_month."培训费", (0)::numeric) AS "培训费",
            COALESCE(v_workload_dep_cost_month."水费", (0)::numeric) AS "水费",
            COALESCE(v_workload_dep_cost_month."电费", (0)::numeric) AS "电费"
           FROM v_workload_dep_cost_month
        ), drg_metrics AS (
         SELECT v."年月",
            d."绩效科室ID",
            sum(v."DRG绩效") AS "DRG绩效总和",
            sum(v."总费用") AS "总费用总和",
            sum(v."总成本") AS "总成本总和"
           FROM (v_workload_drg_bill_detail v
             JOIN t_workload_dep_def2fina d ON (((d."fina科室编码")::text = (v."费用发生科室")::text)))
          WHERE (v."转科" IS NULL)
          GROUP BY v."年月", d."绩效科室ID"
        ), performance_calculations AS (
         SELECT main.yyyy_mm,
            main."绩效科室ID",
            main."绩效科室名称",
            main."绩效科室属性",
            main."绩效科室类别",
            main."绩效科室类型",
            main."工作量单价",
            main."工作量系数",
            main."人数",
            main."同类序号",
            COALESCE(income.total_income, (0)::numeric) AS "总收入",
            COALESCE(aw.total_outp_zcfjl, (0)::numeric) AS "诊察费奖励",
            COALESCE(aw.total_outp_ghfjl, (0)::numeric) AS "挂号费奖励",
            COALESCE(aw.total_surgery_award_3, (0)::numeric) AS "三级手术奖励",
            COALESCE(aw.total_surgery_award_4, (0)::numeric) AS "四级手术奖励",
            COALESCE(wk.total_inp_zyjx, (0)::numeric) AS "造影绩效",
            COALESCE(wk.total_inp_jrjx, (0)::numeric) AS "介入绩效",
            COALESCE(wk.total_inp_bill, (0)::numeric) AS "开单点数",
            COALESCE(wk.total_inp_zxjx, (0)::numeric) AS "执行点数",
            COALESCE(wk.total_inp_ssjx, (0)::numeric) AS "基础手术绩效",
            COALESCE(wk.total_inp_nurse, (0)::numeric) AS "护理点数",
            COALESCE(wk.total_outp_zyjx, (0)::numeric) AS "门诊造影绩效",
            COALESCE(wk.total_outp_jrjx, (0)::numeric) AS "门诊介入绩效",
            COALESCE(wk.total_outp_bill, (0)::numeric) AS "门诊开单点数",
            COALESCE(wk.total_outp_zxjx, (0)::numeric) AS "门诊执行点数",
            COALESCE(wk.total_outp_ssjx, (0)::numeric) AS "门诊基础手术绩效",
            COALESCE(wk.total_outp_nurse, (0)::numeric) AS "门诊护理点数",
            COALESCE(drg."总成本总和", (0)::numeric) AS "病种成本",
            COALESCE(drg."总费用总和", (0)::numeric) AS "病种收入",
            COALESCE(drg."DRG结余", (0)::numeric) AS "DRG结余",
            COALESCE(cost."科室直接成本", (0)::numeric) AS "科室直接成本",
            COALESCE(cost."人员工资", (0)::numeric) AS "人员工资",
            COALESCE(cost."五险一金", (0)::numeric) AS "五险一金",
            COALESCE(cost."卫生材料", (0)::numeric) AS "卫生材料",
            COALESCE(cost."其他材料", (0)::numeric) AS "其他材料",
            COALESCE(cost."固定资产折旧", (0)::numeric) AS "固定资产折旧",
            COALESCE(cost."无形资产摊销", (0)::numeric) AS "无形资产摊销",
            COALESCE(cost."维修（护）费", (0)::numeric) AS "维修（护）费",
            COALESCE(cost."培训费", (0)::numeric) AS "培训费",
            COALESCE(cost."水费", (0)::numeric) AS "水费",
            COALESCE(cost."电费", (0)::numeric) AS "电费",
            (COALESCE(wk.total_inp_bill, (0)::numeric) + COALESCE(wk.total_inp_zxjx, (0)::numeric)) AS inp_work_points,
            (COALESCE(wk.total_outp_bill, (0)::numeric) + COALESCE(wk.total_outp_zxjx, (0)::numeric)) AS outp_work_points,
            (((COALESCE(wk.total_inp_bill, (0)::numeric) + COALESCE(wk.total_inp_zxjx, (0)::numeric)) + COALESCE(wk.total_outp_bill, (0)::numeric)) + COALESCE(wk.total_outp_zxjx, (0)::numeric)) AS work_points,
            (COALESCE(wk.total_inp_nurse, (0)::numeric) + COALESCE(wk.total_outp_nurse, (0)::numeric)) AS total_nursing_points,
            (((COALESCE(wk.total_inp_bill, (0)::numeric) + COALESCE(wk.total_inp_zxjx, (0)::numeric)) * COALESCE(main."工作量单价", (0)::numeric)) * COALESCE(main."工作量系数", (1)::numeric)) AS inp_work_performance,
            (((COALESCE(wk.total_outp_bill, (0)::numeric) + COALESCE(wk.total_outp_zxjx, (0)::numeric)) * COALESCE(main."工作量单价", (0)::numeric)) * COALESCE(main."工作量系数", (1)::numeric)) AS outp_work_performance,
            ((((COALESCE(wk.total_inp_bill, (0)::numeric) + COALESCE(wk.total_inp_zxjx, (0)::numeric)) * COALESCE(main."工作量单价", (0)::numeric)) * COALESCE(main."工作量系数", (1)::numeric)) + (((COALESCE(wk.total_outp_bill, (0)::numeric) + COALESCE(wk.total_outp_zxjx, (0)::numeric)) * COALESCE(main."工作量单价", (0)::numeric)) * COALESCE(main."工作量系数", (1)::numeric))) AS work_performance,
            (((COALESCE(wk.total_inp_nurse, (0)::numeric) + COALESCE(wk.total_outp_nurse, (0)::numeric)) * COALESCE(main."工作量单价", (0)::numeric)) * COALESCE(main."工作量系数", (1)::numeric)) AS nurse_performance,
            (((COALESCE(aw.total_surgery_award_3, (0)::numeric) + COALESCE(aw.total_surgery_award_4, (0)::numeric)) + COALESCE(aw.total_outp_zcfjl, (0)::numeric)) + COALESCE(aw.total_outp_ghfjl, (0)::numeric)) AS work_bonus,
            (((((COALESCE(wk.total_inp_bill, (0)::numeric) + COALESCE(wk.total_inp_zxjx, (0)::numeric)) * COALESCE(main."工作量单价", (0)::numeric)) * COALESCE(main."工作量系数", (1)::numeric)) + (((COALESCE(wk.total_outp_bill, (0)::numeric) + COALESCE(wk.total_outp_zxjx, (0)::numeric)) * COALESCE(main."工作量单价", (0)::numeric)) * COALESCE(main."工作量系数", (1)::numeric))) + (((((COALESCE(wk.total_inp_ssjx, (0)::numeric) + COALESCE(wk.total_inp_zyjx, (0)::numeric)) + COALESCE(wk.total_inp_jrjx, (0)::numeric)) + COALESCE(wk.total_outp_ssjx, (0)::numeric)) + COALESCE(wk.total_outp_zyjx, (0)::numeric)) + COALESCE(wk.total_outp_jrjx, (0)::numeric))) AS total_work_performance,
                CASE
                    WHEN ((main."绩效科室类型")::text = '外科'::text) THEN 0.11
                    WHEN ((main."绩效科室类型")::text = '内科'::text) THEN 0.09
                    WHEN ((main."绩效科室类型")::text = '重症'::text) THEN 0.09
                    ELSE (0)::numeric
                END AS difference_coefficient
           FROM (((((main_data main
             LEFT JOIN workload_metrics wk ON ((((main.yyyy_mm)::text = (wk.yyyy_mm)::text) AND ((main."绩效科室ID")::text = (wk."绩效科室ID")::text))))
             LEFT JOIN award_metrics aw ON ((((main.yyyy_mm)::text = (aw.yyyy_mm)::text) AND ((main."绩效科室ID")::text = (aw."绩效科室ID")::text))))
             LEFT JOIN cost_metrics cost ON ((((main.yyyy_mm)::text = (cost.yyyy_mm)::text) AND ((main."绩效科室ID")::text = (cost."绩效科室ID")::text))))
             LEFT JOIN drg_metrics drg ON ((((main.yyyy_mm)::text = drg."年月") AND ((main."绩效科室ID")::text = (drg."绩效科室ID")::text))))
             LEFT JOIN department_income income ON ((((main.yyyy_mm)::text = (income.yyyy_mm)::text) AND ((main."绩效科室ID")::text = (income."绩效科室ID")::text))))
        )
 SELECT yyyy_mm,
    "绩效科室ID",
    "绩效科室名称",
    "绩效科室属性",
    "绩效科室类别",
    "绩效科室类型",
    "同类序号",
    "工作量单价",
    "工作量系数",
    "人数",
    "总收入" AS "结算收入",
    "科室直接成本",
    (((work_performance + ("DRG结余" * difference_coefficient)) - "科室直接成本"))::numeric(10,2) AS "工作量DRG绩效总和",
    (inp_work_points)::numeric(10,4) AS "住院工作量点数",
    (outp_work_points)::numeric(10,4) AS "门诊工作量点数",
    (work_points)::numeric(10,4) AS "工作量点数",
    (total_nursing_points)::numeric(10,2) AS "护理工作量点数",
    (nurse_performance)::numeric(10,2) AS "护理工作量绩效",
    (inp_work_performance)::numeric(10,2) AS "住院工作量绩效非手术介入",
    (outp_work_performance)::numeric(10,2) AS "门诊工作量绩效非手术介入",
    (work_performance)::numeric(10,2) AS "工作量绩效非手术介入",
    (work_bonus)::numeric(10,2) AS "单项奖励合计",
    (total_work_performance)::numeric(10,2) AS "工作量总绩效",
    "病种收入",
    "病种成本",
    "DRG结余",
    difference_coefficient AS "drg系数",
    (("DRG结余" * difference_coefficient))::numeric(10,2) AS "DRG绩效",
    (((total_work_performance + ("DRG结余" * difference_coefficient)) - "科室直接成本"))::numeric(10,2) AS "绩效总额",
    "三级手术奖励",
    "四级手术奖励",
    "造影绩效",
    "介入绩效",
    "开单点数",
    "执行点数",
    "基础手术绩效",
    "护理点数",
    "诊察费奖励",
    "挂号费奖励",
    "门诊造影绩效",
    "门诊介入绩效",
    "门诊开单点数",
    "门诊执行点数",
    "门诊基础手术绩效",
    "门诊护理点数",
    "人员工资",
    "五险一金",
    "卫生材料",
    "其他材料",
    "固定资产折旧",
    "无形资产摊销",
    "维修（护）费",
    "培训费",
    "水费",
    "电费"
   FROM performance_calculations
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
        WHERE ("绩效科室类别"::text = ANY (ARRAY['医技','护理']))
          AND (%s = '' OR yyyy_mm = %s)
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
        WHERE ("绩效科室类别"::text = ANY (ARRAY['医技','护理']))
          AND yyyy_mm >= %s
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
          AND ("绩效科室类别"::text = ANY (ARRAY['医技','护理']))
        ORDER BY val
    """

    sql_type = f"""
        SELECT DISTINCT "绩效科室类型" AS val
        FROM (
            {BASE_PERFORMANCE_SQL}
        ) x
        WHERE "绩效科室类型" IS NOT NULL
          AND ("绩效科室类别"::text = ANY (ARRAY['医技','护理']))
        ORDER BY val
    """

    sql_name = f"""
        SELECT DISTINCT "绩效科室名称" AS val
        FROM (
            {BASE_PERFORMANCE_SQL}
        ) x
        WHERE "绩效科室名称" IS NOT NULL
          AND ("绩效科室类别"::text = ANY (ARRAY['医技','护理']))
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

        filter_clause, params = build_trend_filter_clause(
            start_date, end_date, dep_category, dep_type, dep_name
        )

        sql = f"""
            SELECT
                yyyy_mm AS month,
                SUM(COALESCE("绩效总额",0)) AS total_performance,
                SUM(COALESCE("结算收入",0)) AS total_settlement_income,
                SUM(COALESCE("人数",0)) AS total_staff_count
            FROM (
                {BASE_PERFORMANCE_SQL}
            ) AS combined
            {filter_clause}
            GROUP BY yyyy_mm
            ORDER BY yyyy_mm
        """

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
