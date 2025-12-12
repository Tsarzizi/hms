# app/outpatient_avg_drug_cost.py
from __future__ import annotations

from datetime import timedelta
from typing import Any, Dict, List, Optional, Tuple

import logging
from flask import Blueprint, request, jsonify
from psycopg2.extras import RealDictCursor

from .shared.db import get_conn, put_conn
from .shared.validators import parse_date_generic
from .shared.numbers import safe_pct_change

logger = logging.getLogger(__name__)

bp = Blueprint("outpatient_avg_drug_cost", __name__)

# ===================== 配置区 =====================

# 视为“药费”的项目大类，根据医院实际情况调整
DRUG_ITEM_CLASSES = [
    '草药费',
    '西药费',
    '中药费'
]

# 门诊工作量明细表
OUTP_TABLE = "t_workload_outp_f"
# 科室维表
DEP_TABLE = "t_workload_dep_def2his"


# ===================== 通用工具 =====================

def json_success(data: Any, message: str = "", code: int = 0):
    return jsonify({"success": True, "data": data, "message": message, "code": code})


def json_error(message: str, code: int = 500):
    logger.exception(message)
    return jsonify({"success": False, "data": None, "message": message, "code": code}), code


def build_dep_filter_sql(department_ids: Optional[List[str]]) -> Tuple[str, List[Any]]:
    """
    部门筛选 SQL 片段 + 参数
    如果传了 department_ids，就按“绩效科室ID”过滤。
    """
    if not department_ids:
        return "", []
    placeholders = ", ".join(["%s"] * len(department_ids))
    return f' AND dep."绩效科室ID" IN ({placeholders}) ', department_ids


# ===================== 核心查询逻辑 =====================

def _query_outpatient_summary(
    conn, start_date_str: str, end_date_str: str, department_ids: Optional[List[str]]
) -> Dict[str, Any]:
    """
    查询门诊汇总：
      - 药费总额 drug_cost
      - 总费用 total_cost
      - 患者人次 patient_count
    """
    dep_sql, dep_params = build_dep_filter_sql(department_ids)

    sql = f"""
        SELECT
            COALESCE(SUM(CASE WHEN f.item_class_name = ANY(%s) THEN f.costs ELSE 0 END), 0) AS drug_cost,
            COALESCE(SUM(f.costs), 0) AS total_cost,
            COALESCE(COUNT(DISTINCT f.visit_no), 0) AS patient_count
        FROM {OUTP_TABLE} f
        LEFT JOIN {DEP_TABLE} dep
            ON dep."HIS科室编码"::text = f.ordered_by::text
        WHERE f.visit_date::date >= %s::date
          AND f.visit_date::date < %s::date + 1
          {dep_sql}
    """

    params: List[Any] = [DRUG_ITEM_CLASSES, start_date_str, end_date_str] + dep_params

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql, params)
        row = cur.fetchone() or {
            "drug_cost": 0,
            "total_cost": 0,
            "patient_count": 0,
        }

    drug_cost = float(row["drug_cost"] or 0)
    total_cost = float(row["total_cost"] or 0)
    patient_count = int(row["patient_count"] or 0)

    avg_drug_cost = drug_cost / patient_count if patient_count > 0 else 0.0
    drug_cost_ratio = drug_cost / total_cost if total_cost > 0 else 0.0

    return {
        "drugCost": drug_cost,
        "totalCost": total_cost,
        "patientCount": patient_count,
        "avgDrugCost": avg_drug_cost,
        "drugCostRatio": drug_cost_ratio,
    }


def _query_outpatient_timeseries(
    conn, start_date_str: str, end_date_str: str, department_ids: Optional[List[str]]
) -> List[Dict[str, Any]]:
    """
    按日统计门诊药费 & 患者人次，用于趋势和明细。
    """
    dep_sql, dep_params = build_dep_filter_sql(department_ids)

    sql = f"""
        SELECT
            f.visit_date::date AS billing_date,
            COALESCE(SUM(CASE WHEN f.item_class_name = ANY(%s) THEN f.costs ELSE 0 END), 0) AS drug_cost,
            COALESCE(SUM(f.costs), 0) AS total_cost,
            COALESCE(COUNT(DISTINCT f.visit_no), 0) AS patient_count
        FROM {OUTP_TABLE} f
        LEFT JOIN {DEP_TABLE} dep
            ON dep."HIS科室编码"::text = f.ordered_by::text
        WHERE f.visit_date::date >= %s::date
          AND f.visit_date::date < %s::date + 1
          {dep_sql}
        GROUP BY billing_date
        ORDER BY billing_date
    """

    params: List[Any] = [DRUG_ITEM_CLASSES, start_date_str, end_date_str] + dep_params

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql, params)
        rows = cur.fetchall() or []

    result: List[Dict[str, Any]] = []

    for r in rows:
        billing_date = r["billing_date"]
        date_str = billing_date.strftime("%Y-%m-%d")

        drug_cost = float(r["drug_cost"] or 0)
        total_cost = float(r["total_cost"] or 0)
        patient_count = int(r["patient_count"] or 0)

        avg_drug_cost = drug_cost / patient_count if patient_count > 0 else 0.0

        outpatient = {
            "drugCost": drug_cost,
            "patientCount": patient_count,
            "avgDrugCost": avg_drug_cost,
        }
        emergency = {
            "drugCost": 0.0,
            "patientCount": 0,
            "avgDrugCost": 0.0,
        }
        total = outpatient  # 当前没有急诊数据，总计 = 门诊

        result.append(
            {
                "date": date_str,
                "total": total,
                "outpatient": outpatient,
                "emergency": emergency,
            }
        )

    return result


def _compute_avg_from_summary(summary: Dict[str, Any]) -> float:
    drug_cost = float(summary.get("drugCost") or 0)
    patient_count = int(summary.get("patientCount") or 0)
    return drug_cost / patient_count if patient_count > 0 else 0.0


def _calc_yoy_and_mom(
    conn, start_date_str: str, end_date_str: str, department_ids: Optional[List[str]]
) -> Dict[str, Dict[str, float]]:
    """
    计算同比 & 环比，基于“次均药费”：
      - 同比：去年同一日期范围
      - 环比：前一个同长度时间段
    返回的 yoyChange / momChange 是“百分数值”（例如 12.3 对应 12.3%）
    """
    start_date = parse_date_generic(start_date_str)
    end_date = parse_date_generic(end_date_str)
    if not start_date or not end_date:
        raise ValueError("日期格式错误，必须为 YYYY-MM-DD")

    delta = end_date - start_date

    # 去年同期
    last_year_start = start_date.replace(year=start_date.year - 1)
    last_year_end = end_date.replace(year=end_date.year - 1)

    # 上一周期（环比）
    prev_period_end = start_date - timedelta(days=1)
    prev_period_start = prev_period_end - delta

    current_summary = _query_outpatient_summary(conn, start_date_str, end_date_str, department_ids)
    last_year_summary = _query_outpatient_summary(
        conn,
        last_year_start.strftime("%Y-%m-%d"),
        last_year_end.strftime("%Y-%m-%d"),
        department_ids,
    )
    prev_period_summary = _query_outpatient_summary(
        conn,
        prev_period_start.strftime("%Y-%m-%d"),
        prev_period_end.strftime("%Y-%m-%d"),
        department_ids,
    )

    current_avg = _compute_avg_from_summary(current_summary)
    last_year_avg = _compute_avg_from_summary(last_year_summary)
    prev_avg = _compute_avg_from_summary(prev_period_summary)

    yoy_ratio = safe_pct_change(current_avg, last_year_avg)
    mom_ratio = safe_pct_change(current_avg, prev_avg)

    yoy = float(yoy_ratio * 100) if yoy_ratio is not None else 0.0
    mom = float(mom_ratio * 100) if mom_ratio is not None else 0.0

    # 当前只有门诊，急诊为 0，总计 = 门诊
    return {
        "total": {"yoyChange": yoy, "momChange": mom},
        "outpatient": {"yoyChange": yoy, "momChange": mom},
        "emergency": {"yoyChange": 0.0, "momChange": 0.0},
    }


# ===================== 参数解析 =====================

def _parse_body_params() -> Tuple[str, str, Optional[List[str]]]:
    """
    解析 POST body：start_date, end_date, department_ids
    返回的 start_date / end_date 依然是字符串（YYYY-MM-DD），方便直接用于 SQL。
    """
    data = request.get_json(silent=True) or {}
    start_date_str = data.get("start_date")
    end_date_str = data.get("end_date")
    department_ids = data.get("department_ids")

    if not start_date_str or not end_date_str:
        raise ValueError("start_date 和 end_date 为必填参数")

    # 校验一下日期格式
    if not parse_date_generic(start_date_str) or not parse_date_generic(end_date_str):
        raise ValueError("日期格式错误，必须为 YYYY-MM-DD")

    if department_ids is not None and not isinstance(department_ids, list):
        raise ValueError("department_ids 必须为字符串数组或省略")

    return start_date_str, end_date_str, department_ids


# ===================== 路由实现 =====================

@bp.route("/init", methods=["GET"])
def init():
    """
    初始化接口：
      GET /api/drug-cost/init
    返回科室列表：
      { departments: {id, name}[] }
    """
    conn = None
    try:
        conn = get_conn()

        sql = f"""
            SELECT DISTINCT
                d."绩效科室ID" AS id,
                d."绩效科室名称" AS name
            FROM {DEP_TABLE} d
            WHERE d."绩效科室ID" IS NOT NULL
              AND d."绩效科室名称" IS NOT NULL
            ORDER BY d."绩效科室名称"
        """

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql)
            rows = cur.fetchall() or []

        departments = [
            {"id": row["id"], "name": row["name"]}
            for row in rows
        ]

        return json_success({"departments": departments})

    except Exception as e:
        return json_error(f"初始化门急诊次均药费失败: {e}")
    finally:
        if conn is not None:
            put_conn(conn)


@bp.route("/summary", methods=["POST"])
def summary():
    """
    汇总接口：
      POST /api/drug-cost/summary

    对应前端 SummaryData：
      {
        total: { drugCost, patientCount, avgDrugCost, drugCostRatio },
        outpatient: {...},
        emergency: {...},
        comparison: {
          total: {yoyChange, momChange},
          outpatient: {...},
          emergency: {...}
        }
      }
    """
    conn = None
    try:
        start_date_str, end_date_str, department_ids = _parse_body_params()
        conn = get_conn()

        outpatient_summary = _query_outpatient_summary(
            conn, start_date_str, end_date_str, department_ids
        )
        comparison = _calc_yoy_and_mom(
            conn, start_date_str, end_date_str, department_ids
        )

        # 当前：总计 = 门诊；急诊全部为 0
        result = {
            "total": {
                "drugCost": outpatient_summary["drugCost"],
                "patientCount": outpatient_summary["patientCount"],
                "avgDrugCost": outpatient_summary["avgDrugCost"],
                "drugCostRatio": outpatient_summary["drugCostRatio"],
            },
            "outpatient": {
                "drugCost": outpatient_summary["drugCost"],
                "patientCount": outpatient_summary["patientCount"],
                "avgDrugCost": outpatient_summary["avgDrugCost"],
                "drugCostRatio": outpatient_summary["drugCostRatio"],
            },
            "emergency": {
                "drugCost": 0.0,
                "patientCount": 0,
                "avgDrugCost": 0.0,
                "drugCostRatio": 0.0,
            },
            "comparison": comparison,
        }

        return json_success(result)

    except ValueError as ve:
        return json_error(str(ve), code=400)
    except Exception as e:
        return json_error(f"获取门急诊次均药费汇总失败: {e}")
    finally:
        if conn is not None:
            put_conn(conn)


@bp.route("/timeseries", methods=["POST"])
def timeseries():
    """
    趋势接口：
      POST /api/drug-cost/timeseries

    返回 TimeSeriesData[]：
      {
        date: 'YYYY-MM-DD',
        total: { drugCost, patientCount, avgDrugCost },
        outpatient: {...},
        emergency: {...}
      }[]
    """
    conn = None
    try:
        start_date_str, end_date_str, department_ids = _parse_body_params()
        conn = get_conn()

        data = _query_outpatient_timeseries(
            conn, start_date_str, end_date_str, department_ids
        )

        return json_success(data)

    except ValueError as ve:
        return json_error(str(ve), code=400)
    except Exception as e:
        return json_error(f"获取门急诊次均药费趋势失败: {e}")
    finally:
        if conn is not None:
            put_conn(conn)


@bp.route("/details", methods=["POST"])
def details():
    """
    明细接口：
      POST /api/drug-cost/details

    返回：
      {
        rows: DrugCostDetail[],
        total: number
      }

    DrugCostDetail：
      {
        id: string;
        date: string;
        totalAvgDrugCost: number;
        outpatientAvgDrugCost: number;
        emergencyAvgDrugCost: number;
      }
    """
    conn = None
    try:
        start_date_str, end_date_str, department_ids = _parse_body_params()
        conn = get_conn()

        ts = _query_outpatient_timeseries(
            conn, start_date_str, end_date_str, department_ids
        )

        rows: List[Dict[str, Any]] = []
        for item in ts:
            date_str = item["date"]
            total = item["total"]
            outpatient = item["outpatient"]
            emergency = item["emergency"]

            rows.append(
                {
                    "id": date_str,
                    "date": date_str,
                    "totalAvgDrugCost": float(total["avgDrugCost"] or 0.0),
                    "outpatientAvgDrugCost": float(outpatient["avgDrugCost"] or 0.0),
                    "emergencyAvgDrugCost": float(emergency["avgDrugCost"] or 0.0),
                }
            )

        return json_success({"rows": rows, "total": len(rows)})

    except ValueError as ve:
        return json_error(str(ve), code=400)
    except Exception as e:
        return json_error(f"获取门急诊次均药费明细失败: {e}")
    finally:
        if conn is not None:
            put_conn(conn)
