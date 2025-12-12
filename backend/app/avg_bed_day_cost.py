# app/avg_bed_day_cost.py
import logging

from flask import Blueprint, request, jsonify

from .shared.db import get_conn, put_conn
from .shared.validators import parse_date_generic, require_params

logger = logging.getLogger(__name__)

bp = Blueprint("avg_bed_day_cost", __name__)

# 表 / 视图
INBED_TABLE = "v_workload_inbed_reg_f"   # 出入院 + 住院天数（视图）
INP_FEE_TABLE = "m_t_workload_inp_f"       # 住院费用明细


def json_ok(data, message: str = ""):
    return jsonify({"success": True, "data": data, "message": message, "code": 0})


def json_error(message: str, code: int = 1, http_status: int = 400):
    logger.error(f"[avg-bed-day-cost] {message}")
    return (
        jsonify({"success": False, "data": None, "message": message, "code": code}),
        http_status,
    )


def parse_date_range(args):
    ok, missing = require_params(args, ["start_date", "end_date"])
    if not ok:
        return None, None, f"缺少必要参数: {', '.join(missing)}"

    start = parse_date_generic(args.get("start_date"))
    end = parse_date_generic(args.get("end_date"))

    if not start or not end:
        return None, None, "日期格式错误，应为 YYYY-MM-DD"

    if start > end:
        return None, None, "开始日期不能晚于结束日期"

    return start, end, None


# ===================== 1. 初始化接口：科室列表 =====================
@bp.route("/init", methods=["GET"])
def init_endpoint():
    """
    返回筛选用科室列表：
    {
      "departments": [
        {"id": "3201", "name": "心内科"},
        ...
      ]
    }
    科室来源：出院视图 v_workload_inbed_reg_f 的 dscg_dept_code/name
    """
    try:
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT DISTINCT
                        dscg_dept_code AS dep_code,
                        dscg_dept_name AS dep_name
                    FROM {INBED_TABLE}
                    WHERE dscg_dept_code IS NOT NULL
                      AND dscg_dept_name IS NOT NULL
                    ORDER BY dscg_dept_name
                    """
                )
                rows = cur.fetchall()

            departments = [
                {"id": r[0], "name": r[1]}
                for r in rows
                if r[0] and r[1]
            ]
            return json_ok({"departments": departments})
        finally:
            put_conn(conn)
    except Exception as e:
        logger.exception("初始化平均床日费用科室列表失败")
        return json_error(f"初始化失败: {e}", http_status=500)


# ===================== 公共汇总函数（带费用） =====================
def query_summary(start_date, end_date, dep_ids=None):
    """
    区间汇总：
      overallAvgBedDayCost = 总费用 / 总床日
      totalPatients        = 出院人次
      totalBedDays         = 总床日

    费用表与出院表关联：
      t_workload_inp_f.visit_id = v_workload_inbed_reg_f.mdtrt_id
    """
    conn = get_conn()
    try:
        sql = f"""
            WITH stay AS (
                SELECT
                    mdtrt_id,
                    dscg_date,
                    dscg_dept_code,
                    dscg_dept_name,
                    COALESCE(act_ipt_days, 0) AS act_ipt_days
                FROM {INBED_TABLE}
                WHERE dscg_date >= %(start_date)s
                  AND dscg_date <= %(end_date)s
                  AND dscg_date IS NOT NULL
            ),
            fee AS (
                -- 只统计当前区间里这些住院号的费用，避免全表扫描
                SELECT
                    f.visit_id,
                    COALESCE(SUM(f.costs), 0) AS total_cost
                FROM {INP_FEE_TABLE} f
                JOIN (
                    SELECT DISTINCT mdtrt_id
                    FROM stay
                    WHERE mdtrt_id IS NOT NULL
                ) s2
                  ON s2.mdtrt_id = f.visit_id
                GROUP BY f.visit_id
            )
            SELECT
                COALESCE(
                    SUM(f.total_cost) / NULLIF(SUM(s.act_ipt_days), 0),
                    0
                ) AS overall_avg_bed_day_cost,
                COALESCE(COUNT(DISTINCT s.mdtrt_id), 0) AS total_patients,
                COALESCE(SUM(s.act_ipt_days), 0) AS total_bed_days
            FROM stay s
            LEFT JOIN fee f
              ON f.visit_id = s.mdtrt_id
            WHERE 1=1
        """

        params = {"start_date": start_date, "end_date": end_date}

        if dep_ids:
            sql += " AND s.dscg_dept_code = ANY(%(dep_ids)s)"
            params["dep_ids"] = dep_ids

        with conn.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()

        if not row:
            return {
                "overallAvgBedDayCost": 0.0,
                "totalPatients": 0,
                "totalBedDays": 0.0,
            }

        return {
            "overallAvgBedDayCost": float(row[0] or 0),
            "totalPatients": int(row[1] or 0),
            "totalBedDays": float(row[2] or 0),
        }
    finally:
        put_conn(conn)


# ===================== 2. 汇总接口 =====================
@bp.route("/summary", methods=["GET"])
def summary_endpoint():
    args = request.args
    start, end, err = parse_date_range(args)
    if err:
        return json_error(err)

    dep_ids = args.getlist("department_ids") or None

    try:
        summary = query_summary(start, end, dep_ids)
        return json_ok(summary)
    except Exception as e:
        logger.exception("获取平均床日费用汇总失败")
        return json_error(f"获取汇总数据失败: {e}", http_status=500)


# ===================== 3. 趋势图接口 =====================
@bp.route("/bed-day-cost/chart", methods=["GET"])
def chart_endpoint():
    """
    返回按出院日期聚合的时间序列：
    [
      {
        "date": "2025-11-01",
        "data": {
          "overallAvgBedDayCost": 1234.56,
          "totalPatients": 10,
          "totalBedDays": 40
        }
      },
      ...
    ]
    """
    args = request.args
    start, end, err = parse_date_range(args)
    if err:
        return json_error(err)

    dep_ids = args.getlist("department_ids") or None

    try:
        conn = get_conn()
        try:
            sql = f"""
                WITH stay AS (
                    SELECT
                        mdtrt_id,
                        dscg_date,
                        dscg_dept_code,
                        dscg_dept_name,
                        COALESCE(act_ipt_days, 0) AS act_ipt_days
                    FROM {INBED_TABLE}
                    WHERE dscg_date >= %(start_date)s
                      AND dscg_date <= %(end_date)s
                      AND dscg_date IS NOT NULL
                ),
                fee AS (
                    SELECT
                        f.visit_id,
                        COALESCE(SUM(f.costs), 0) AS total_cost
                    FROM {INP_FEE_TABLE} f
                    JOIN (
                        SELECT DISTINCT mdtrt_id
                        FROM stay
                        WHERE mdtrt_id IS NOT NULL
                    ) s2
                      ON s2.mdtrt_id = f.visit_id
                    GROUP BY f.visit_id
                )
                SELECT
                    s.dscg_date AS billing_date,
                    COALESCE(
                        SUM(f.total_cost) / NULLIF(SUM(s.act_ipt_days), 0),
                        0
                    ) AS overall_avg_bed_day_cost,
                    COALESCE(COUNT(DISTINCT s.mdtrt_id), 0) AS total_patients,
                    COALESCE(SUM(s.act_ipt_days), 0) AS total_bed_days
                FROM stay s
                LEFT JOIN fee f
                  ON f.visit_id = s.mdtrt_id
                WHERE 1=1
            """

            params = {"start_date": start, "end_date": end}

            if dep_ids:
                sql += " AND s.dscg_dept_code = ANY(%(dep_ids)s)"
                params["dep_ids"] = dep_ids

            sql += """
                GROUP BY s.dscg_date
                ORDER BY s.dscg_date
            """

            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()

            result = []
            for billing_date, avg_cost, patients, bed_days in rows:
                result.append(
                    {
                        "date": billing_date.strftime("%Y-%m-%d"),
                        "data": {
                            "overallAvgBedDayCost": float(avg_cost or 0),
                            "totalPatients": int(patients or 0),
                            "totalBedDays": float(bed_days or 0),
                        },
                    }
                )

            return json_ok(result)
        finally:
            put_conn(conn)
    except Exception as e:
        logger.exception("获取平均床日费用趋势图失败")
        return json_error(f"获取图表数据失败: {e}", http_status=500)


# ===================== 4. 明细接口 =====================
@bp.route("/detail", methods=["GET"])
def detail_endpoint():
    """
    返回按 日期+科室 的明细：
    [
      {
        "billing_date": "2025-11-01",
        "dep_code": "3201",
        "dep_name": "心内科",
        "avg_bed_day_cost": 1234.56,
        "total_patients": 10,
        "total_bed_days": 40
      },
      ...
    ]
    """
    args = request.args
    start, end, err = parse_date_range(args)
    if err:
        return json_error(err)

    dep_ids = args.getlist("department_ids") or None

    try:
        conn = get_conn()
        try:
            sql = f"""
                WITH stay AS (
                    SELECT
                        mdtrt_id,
                        dscg_date,
                        dscg_dept_code,
                        dscg_dept_name,
                        COALESCE(act_ipt_days, 0) AS act_ipt_days
                    FROM {INBED_TABLE}
                    WHERE dscg_date >= %(start_date)s
                      AND dscg_date <= %(end_date)s
                      AND dscg_date IS NOT NULL
                ),
                fee AS (
                    SELECT
                        f.visit_id,
                        COALESCE(SUM(f.costs), 0) AS total_cost
                    FROM {INP_FEE_TABLE} f
                    JOIN (
                        SELECT DISTINCT mdtrt_id
                        FROM stay
                        WHERE mdtrt_id IS NOT NULL
                    ) s2
                      ON s2.mdtrt_id = f.visit_id
                    GROUP BY f.visit_id
                )
                SELECT
                    s.dscg_date      AS billing_date,
                    s.dscg_dept_code AS dep_code,
                    s.dscg_dept_name AS dep_name,
                    COALESCE(
                        SUM(f.total_cost) / NULLIF(SUM(s.act_ipt_days), 0),
                        0
                    ) AS avg_bed_day_cost,
                    COALESCE(COUNT(DISTINCT s.mdtrt_id), 0) AS total_patients,
                    COALESCE(SUM(s.act_ipt_days), 0) AS total_bed_days
                FROM stay s
                LEFT JOIN fee f
                  ON f.visit_id = s.mdtrt_id
                WHERE 1=1
            """

            params = {"start_date": start, "end_date": end}

            if dep_ids:
                sql += " AND s.dscg_dept_code = ANY(%(dep_ids)s)"
                params["dep_ids"] = dep_ids

            sql += """
                GROUP BY s.dscg_date, s.dscg_dept_code, s.dscg_dept_name
                ORDER BY s.dscg_date, s.dscg_dept_code, s.dscg_dept_name
            """

            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()

            result = []
            for billing_date, dep_code, dep_name, avg_cost, patients, bed_days in rows:
                result.append(
                    {
                        "billing_date": billing_date.strftime("%Y-%m-%d"),
                        "dep_code": dep_code,
                        "dep_name": dep_name,
                        "avg_bed_day_cost": float(avg_cost or 0),
                        "total_patients": int(patients or 0),
                        "total_bed_days": float(bed_days or 0),
                    }
                )

            return json_ok(result)
        finally:
            put_conn(conn)
    except Exception as e:
        logger.exception("获取平均床日费用明细失败")
        return json_error(f"获取明细数据失败: {e}", http_status=500)


# ===================== 5. 同比 / 环比接口（暂不计算，固定返回） =====================
@bp.route("/comparison", methods=["GET"])
def comparison_endpoint():
    """
    同比 / 环比暂时不计算，
    为了兼容前端结构，直接返回 change_rate = 0，避免前端报错或一直 loading。
    """
    dummy = {
        "current_value": 0,
        "comparison_value": 0,
        "change_rate": 0.0,
        "change_type": "no_change",
    }

    return json_ok({
        "overallAvgBedDayCost": dummy,
        "totalPatients": dummy,
        "totalBedDays": dummy,
    })
