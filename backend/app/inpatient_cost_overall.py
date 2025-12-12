# app/inpatient_cost_overall.py
import logging
from datetime import timedelta
from decimal import Decimal

from flask import Blueprint, jsonify, request

from app.shared.db import get_conn, put_conn
from app.shared.cache import cache_get, cache_set
from app.shared.numbers import safe_pct_change
from app.shared.validators import parse_date_generic

logger = logging.getLogger(__name__)

bp = Blueprint("inpatient_cost_overall", __name__)


# ==================== 通用返回 ====================


def success_response(data):
    return jsonify({"success": True, "data": data})


def error_response(msg: str, code: int = 500):
    logger.error(msg)
    return jsonify({"success": False, "data": None, "message": msg, "code": code}), code


# ==================== 工具函数 ====================


def _to_float(val):
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, Decimal):
        return float(val)
    try:
        return float(val)
    except Exception:
        return None


def _build_date_where(start_date, end_date, alias: str = "d"):
    """
    日期条件：视图 t_drg_detailed_analysis."结算日期"
    alias: 该视图的表别名（默认 d）
    """
    clauses = [f'{alias}."结算日期" >= %s', f'{alias}."结算日期" <= %s']
    params = [start_date, end_date]
    return " AND ".join(clauses), params


def _query_avg_cost_by_period(cur, start_date, end_date, dep_ids):
    """
    查询某个时间区间内的病例级平均费用 & 日均费用：
      - 粒度：DISTINCT visit_id
      - 来源：t_drg_detailed_analysis d
      - 住院天数：t_workload_inbed_reg_f r.act_ipt_days（mdtrt_id = visit_id）
      - 科室：通过 d."科室名称" 关联合同 t_workload_dep_def2his 的 "绩效科室名称"

    返回:
      avg_medical_cost     次均医药费用   = AVG(总费用)
      avg_drug_cost        次均药费     = AVG(药品总费用)
      avg_daily_med_cost   日均医药费用 = AVG(总费用 / 住院天数)（仅对 act_ipt_days > 0 的病例）
      patient_count        病例数
    """
    where_date, params = _build_date_where(start_date, end_date, alias="d")

    dep_filter_sql = ""
    if dep_ids:
        dep_filter_sql = 'AND dep."绩效科室ID" = ANY(%s)'
        params.append(dep_ids)

    sql = f"""
        WITH base AS (
            SELECT DISTINCT
                d.visit_id,
                d."总费用"        AS total_medical_cost,
                d."药品总费用"    AS total_drug_cost,
                COALESCE(r.act_ipt_days, 0) AS inbed_days
            FROM t_drg_detailed_analysis d
            LEFT JOIN t_workload_dep_def2his dep
              ON dep."绩效科室名称" = d."科室名称"
            LEFT JOIN t_workload_inbed_reg_f r
              ON r.mdtrt_id = d.visit_id
            WHERE {where_date}
            {dep_filter_sql}
        )
        SELECT
            AVG(total_medical_cost) AS avg_medical_cost,
            AVG(total_drug_cost)    AS avg_drug_cost,
            AVG(
                CASE
                    WHEN inbed_days > 0 THEN total_medical_cost / inbed_days
                    ELSE NULL
                END
            ) AS avg_daily_med_cost,
            COUNT(*)                AS patient_count
        FROM base
    """
    cur.execute(sql, params)
    row = cur.fetchone()
    if not row:
        return 0.0, 0.0, 0.0, 0

    avg_medical_cost = _to_float(row[0]) or 0.0
    avg_drug_cost = _to_float(row[1]) or 0.0
    avg_daily_med_cost = _to_float(row[2]) or 0.0
    patient_count = int(row[3] or 0)

    return avg_medical_cost, avg_drug_cost, avg_daily_med_cost, patient_count


# ==================== 1. 初始化：部门列表 ====================


@bp.route("/init", methods=["GET"])
def init_inpatient_cost_overall():
    """
    住院费用总体 - 初始化：部门列表
    部门获取方式与之前保持一致：从 t_workload_dep_def2his 获取绩效科室
      - id   = "绩效科室ID"
      - name = "绩效科室名称"
    """
    cache_key = "inpatient_cost_overall:init:departments"
    cached = cache_get(cache_key)
    if cached is not None:
        return success_response({"departments": cached})

    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        sql = """
            SELECT DISTINCT
                "绩效科室ID"   AS dep_id,
                "绩效科室名称" AS dep_name
            FROM t_workload_dep_def2his
            WHERE "绩效科室ID" IS NOT NULL
              AND "绩效科室名称" IS NOT NULL
            ORDER BY "绩效科室名称"
        """
        cur.execute(sql)
        rows = cur.fetchall()

        departments = [{"id": r[0], "name": r[1]} for r in rows]

        cache_set(cache_key, departments, ttl_seconds=600)
        return success_response({"departments": departments})
    except Exception as e:
        logger.exception("初始化住院费用总体失败")
        return error_response(f"初始化失败: {e}")
    finally:
        if conn:
            put_conn(conn)


# ==================== 2. 趋势图 /chart ====================


@bp.route("/chart", methods=["GET"])
def inpatient_cost_overall_chart():
    """
    住院费用总体 - 趋势图（病例级，不展示总额）
    步骤：
      1. 从 t_drg_detailed_analysis 取 DISTINCT visit_id + 结算日期 + 费用
      2. 关联 t_workload_inbed_reg_f，取 act_ipt_days
      3. 按 "结算日期" 分组，按病例做平均：
           - avgMedicalCost      = AVG(总费用)
           - avgDrugCost         = AVG(药品总费用)
           - avgDailyMedicalCost = AVG(总费用 / 住院天数) 仅对 inbed_days > 0
    """
    start_date_str = request.args.get("start_date")
    end_date_str = request.args.get("end_date")
    # 前端传的是绩效科室ID 列表
    dep_ids = request.args.getlist("department_ids")

    start_date = parse_date_generic(start_date_str)
    end_date = parse_date_generic(end_date_str)
    if not start_date or not end_date:
        return error_response("start_date 或 end_date 格式不正确，应为 YYYY-MM-DD", 400)
    if start_date > end_date:
        return error_response("开始日期不能晚于结束日期", 400)

    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        where_date, params = _build_date_where(start_date, end_date, alias="d")
        dep_filter_sql = ""
        if dep_ids:
            dep_filter_sql = 'AND dep."绩效科室ID" = ANY(%s)'
            params.append(dep_ids)

        sql = f"""
            WITH base AS (
                SELECT DISTINCT
                    d.visit_id,
                    d."结算日期"    AS stat_date,
                    d."总费用"      AS total_medical_cost,
                    d."药品总费用"  AS total_drug_cost,
                    COALESCE(r.act_ipt_days, 0) AS inbed_days
                FROM t_drg_detailed_analysis d
                LEFT JOIN t_workload_dep_def2his dep
                  ON dep."绩效科室名称" = d."科室名称"
                LEFT JOIN t_workload_inbed_reg_f r
                  ON r.mdtrt_id = d.visit_id
                WHERE {where_date}
                {dep_filter_sql}
            )
            SELECT
                stat_date,
                AVG(total_medical_cost) AS avg_medical_cost,
                AVG(total_drug_cost)    AS avg_drug_cost,
                AVG(
                    CASE
                        WHEN inbed_days > 0 THEN total_medical_cost / inbed_days
                        ELSE NULL
                    END
                ) AS avg_daily_med_cost,
                COUNT(*)                AS patient_count
            FROM base
            GROUP BY stat_date
            ORDER BY stat_date
        """
        cur.execute(sql, params)
        rows = cur.fetchall()

        results = []
        prev_avg_medical_cost = None

        for row in rows:
            stat_date = row[0]
            avg_medical_cost = _to_float(row[1]) or 0.0
            avg_drug_cost = _to_float(row[2]) or 0.0
            avg_daily_med_cost = _to_float(row[3]) or 0.0

            # 与前一日相比的变动率（%）—— 用次均医药费用做对比
            if prev_avg_medical_cost is None or prev_avg_medical_cost == 0:
                cost_change_rate = 0.0
            else:
                pct = safe_pct_change(avg_medical_cost, prev_avg_medical_cost)
                cost_change_rate = round(pct * 100, 2) if pct is not None else 0.0

            prev_avg_medical_cost = avg_medical_cost

            date_str = stat_date.strftime("%Y-%m-%d")
            results.append(
                {
                    "date": date_str,
                    "data": {
                        "date": date_str,
                        "avgMedicalCost": round(avg_medical_cost, 2),
                        "avgDrugCost": round(avg_drug_cost, 2),
                        "avgDailyMedicalCost": round(avg_daily_med_cost, 2),
                        "costChangeRate": round(cost_change_rate, 2),
                    },
                }
            )

        return success_response(results)
    except Exception as e:
        logger.exception("获取住院费用总体趋势数据失败")
        return error_response(f"获取图表数据失败: {e}")
    finally:
        if conn:
            put_conn(conn)


# ==================== 3. 汇总卡片 /summary ====================


@bp.route("/summary", methods=["GET"])
def inpatient_cost_overall_summary():
    """
    住院费用总体 - 汇总卡片（病例级平均）
      - avgMedicalCost      = AVG(病例总费用)
      - avgDrugCost         = AVG(病例药费)
      - avgDailyMedicalCost = AVG(病例总费用 / 住院天数)（inbed_days > 0）
    """
    start_date_str = request.args.get("start_date")
    end_date_str = request.args.get("end_date")
    dep_ids = request.args.getlist("department_ids")

    start_date = parse_date_generic(start_date_str)
    end_date = parse_date_generic(end_date_str)
    if not start_date or not end_date:
        return error_response("start_date 或 end_date 格式不正确，应为 YYYY-MM-DD", 400)
    if start_date > end_date:
        return error_response("开始日期不能晚于结束日期", 400)

    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        avg_medical_cost, avg_drug_cost, avg_daily_med_cost, _ = _query_avg_cost_by_period(
            cur, start_date, end_date, dep_ids
        )

        data = {
            "avgMedicalCost": round(avg_medical_cost, 2),
            "avgDrugCost": round(avg_drug_cost, 2),
            "avgDailyMedicalCost": round(avg_daily_med_cost, 2),
        }
        return success_response(data)
    except Exception as e:
        logger.exception("获取住院费用总体汇总失败")
        return error_response(f"获取汇总数据失败: {e}")
    finally:
        if conn:
            put_conn(conn)


# ==================== 4. 同比 / 环比 /comparison ====================


@bp.route("/comparison", methods=["GET"])
def inpatient_cost_overall_comparison():
    """
    住院费用总体 - 同比 / 环比
    指标：
      - avgMedicalCost      当前区间病例级平均总费用
      - avgDrugCost         当前区间病例级平均药费
      - avgDailyMedicalCost 当前区间病例级平均日均医药费用
    对比方式：
      - type=yoy：与去年同期比较
      - type=mom：与上一等长周期比较
    """
    comp_type = request.args.get("type")
    start_date_str = request.args.get("start_date")
    end_date_str = request.args.get("end_date")
    dep_ids = request.args.getlist("department_ids")

    if comp_type not in ("yoy", "mom"):
        return error_response("type 参数必须为 'yoy' 或 'mom'", 400)

    start_date = parse_date_generic(start_date_str)
    end_date = parse_date_generic(end_date_str)
    if not start_date or not end_date:
        return error_response("start_date 或 end_date 格式不正确，应为 YYYY-MM-DD", 400)
    if start_date > end_date:
        return error_response("开始日期不能晚于结束日期", 400)

    # 计算对比区间
    try:
        if comp_type == "yoy":
            prev_start = start_date.replace(year=start_date.year - 1)
            prev_end = end_date.replace(year=end_date.year - 1)
        else:
            # 环比：上一周期（同长度）
            days = (end_date - start_date).days + 1
            prev_end = start_date - timedelta(days=1)
            prev_start = prev_end - timedelta(days=days - 1)
    except Exception as e:
        return error_response(f"计算对比区间失败: {e}", 400)

    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        # 当前区间
        curr_med, curr_drug, curr_daily, _ = _query_avg_cost_by_period(
            cur, start_date, end_date, dep_ids
        )

        # 对比区间
        prev_med, prev_drug, prev_daily, _ = _query_avg_cost_by_period(
            cur, prev_start, prev_end, dep_ids
        )

        def build_item(curr_val, prev_val):
            pct = safe_pct_change(curr_val, prev_val)
            if pct is None:
                change_rate = 0.0
            else:
                change_rate = round(pct * 100, 2)

            if change_rate > 0:
                change_type = "up"
            elif change_rate < 0:
                change_type = "down"
            else:
                change_type = "flat"

            return {
                "current_value": round(curr_val, 2),
                "comparison_value": round(prev_val, 2),
                "change_rate": change_rate,
                "change_type": change_type,
            }

        data = {
            "avgMedicalCost": build_item(curr_med, prev_med),
            "avgDrugCost": build_item(curr_drug, prev_drug),
            "avgDailyMedicalCost": build_item(curr_daily, prev_daily),
        }

        return success_response(data)
    except Exception as e:
        logger.exception("获取住院费用总体同比/环比失败")
        return error_response(f"获取同比/环比数据失败: {e}")
    finally:
        if conn:
            put_conn(conn)


# ==================== 5. 病种费用 /disease-cost ====================


@bp.route("/disease-cost", methods=["GET"])
def inpatient_disease_cost():
    """
    住院患者次均费用（按“病种”/DRG） —— 病例级：
      - 病种名称: d."drg名称"
      - 粒度    : DISTINCT visit_id
      - avgCost      = AVG(病例总费用)
      - avgStayDays  = AVG(住院天数 act_ipt_days)（>0 的病例）
      - patientCount = 病例数
    """
    start_date_str = request.args.get("start_date")
    end_date_str = request.args.get("end_date")
    dep_ids = request.args.getlist("department_ids")

    start_date = parse_date_generic(start_date_str)
    end_date = parse_date_generic(end_date_str)
    if not start_date or not end_date:
        return error_response("start_date 或 end_date 格式不正确，应为 YYYY-MM-DD", 400)
    if start_date > end_date:
        return error_response("开始日期不能晚于结束日期", 400)

    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        where_date, params = _build_date_where(start_date, end_date, alias="d")
        dep_filter_sql = ""
        if dep_ids:
            dep_filter_sql = 'AND dep."绩效科室ID" = ANY(%s)'
            params.append(dep_ids)

        sql = f"""
            WITH base AS (
                SELECT DISTINCT
                    d.visit_id,
                    COALESCE(d."drg名称", '未分组') AS disease_name,
                    d."总费用" AS total_medical_cost,
                    COALESCE(r.act_ipt_days, 0) AS inbed_days
                FROM t_drg_detailed_analysis d
                LEFT JOIN t_workload_dep_def2his dep
                  ON dep."绩效科室名称" = d."科室名称"
                LEFT JOIN t_workload_inbed_reg_f r
                  ON r.mdtrt_id = d.visit_id
                WHERE {where_date}
                {dep_filter_sql}
            )
            SELECT
                disease_name,
                AVG(total_medical_cost) AS avg_cost,
                AVG(
                    CASE
                        WHEN inbed_days > 0 THEN inbed_days
                        ELSE NULL
                    END
                ) AS avg_stay_days,
                COUNT(*)                AS patient_count
            FROM base
            GROUP BY disease_name
            HAVING COUNT(*) > 0
            ORDER BY avg_cost DESC
            LIMIT 100
        """
        cur.execute(sql, params)
        rows = cur.fetchall()

        results = []
        for row in rows:
            disease_name = row[0]
            avg_cost = _to_float(row[1]) or 0.0
            avg_stay_days = _to_float(row[2]) or 0.0
            patient_count = int(row[3] or 0)

            results.append(
                {
                    "disease": disease_name,
                    "avgCost": round(avg_cost, 2),
                    "patientCount": patient_count,
                    "avgStayDays": round(avg_stay_days, 2),
                }
            )

        return success_response(results)
    except Exception as e:
        logger.exception("获取住院病种费用数据失败")
        return error_response(f"获取病种费用数据失败: {e}")
    finally:
        if conn:
            put_conn(conn)
