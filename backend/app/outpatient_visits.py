import logging
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify

from .shared.db import get_conn, put_conn  # 使用项目里的连接池
import psycopg2.extras

bp = Blueprint("outpatient_visits", __name__)
logger = logging.getLogger(__name__)


# -------------------- 工具函数 --------------------


def _parse_date(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%d")


def _date_range_len(start: datetime, end: datetime) -> int:
    return (end - start).days + 1


def _safe_rate(cur: float, base: float) -> float:
    if base is None or base == 0:
        return 0.0
    return (cur - base) * 100.0 / abs(base)


def _build_dep_filter_sql(dep_ids):
    """
    返回 (额外 WHERE 片段, 参数列表)
    目前按科室过滤：dep_code = ANY(%s)
    """
    if dep_ids:
        return " AND dep_code = ANY(%s) ", [dep_ids]
    return "", []


def _build_base_cte_sql(additional_where: str = ""):
    """
    统一 CTE：历史走视图 t_dep_count_outp，实时走表 t_workload_outp_f

    只取“人数”(visit_count)，不再处理 costs。
    additional_where 用于在 base_outp 外再拼接科室过滤等。
    """
    return f"""
WITH base_outp AS (
    -- 历史：直接查视图（视图内部已限制 visit_date < CURRENT_DATE）
    SELECT
        billing_date,
        dep_code,
        dep_name,
        visit_count
    FROM t_dep_count_outp
    WHERE billing_date BETWEEN %s AND %s

    UNION ALL

    -- 实时：直接查表（visit_date >= CURRENT_DATE）
    SELECT
        f.visit_date AS billing_date,
        f.ordered_by AS dep_code,
        d."HIS科室名称" AS dep_name,
        COUNT(DISTINCT f.visit_no) AS visit_count
    FROM t_workload_outp_f f
    LEFT JOIN t_workload_dep_def2his d
      ON d."HIS科室编码"::text = f.ordered_by::text
    WHERE
      f.visit_date >= CURRENT_DATE
      AND f.visit_date BETWEEN %s AND %s
    GROUP BY
        f.visit_date,
        f.ordered_by,
        d."HIS科室名称"
)
SELECT
    *
FROM base_outp
WHERE 1=1
{additional_where}
"""


# -------------------- 汇总查询（区间 + 同比 + 环比） --------------------


def _query_summary(conn, params):
    """
    汇总：只有门诊人数（visit_count）。
    - outpatientEmergencyVisits = 总门急诊人次（目前 = 门诊人次）
    - outpatientVisits         = 门诊人次
    - outpatientGrowthRate     = 门诊人次环比增减率
    - emergency*               = 全部 0（目前没有急诊数据）
    """
    start = _parse_date(params["start_date"])
    end = _parse_date(params["end_date"])
    length = _date_range_len(start, end)

    dep_ids = params.get("department_ids")
    dep_filter_sql, dep_filter_params = _build_dep_filter_sql(dep_ids)

    # ----- 当前期间 -----
    sql_cur = _build_base_cte_sql(dep_filter_sql).replace(
        "SELECT\n    *\nFROM base_outp",
        """
SELECT
    COALESCE(SUM(visit_count), 0) AS total_visits
FROM base_outp
"""
    )
    params_cur = [
        params["start_date"], params["end_date"],  # 视图
        params["start_date"], params["end_date"],  # 表
        *dep_filter_params,
    ]

    with conn.cursor() as cur:
        cur.execute(sql_cur, params_cur)
        (v,) = cur.fetchone()
        total_cur = float(v or 0)

    # ----- 去年同期（同比）-----
    last_year_start = start.replace(year=start.year - 1)
    last_year_end = end.replace(year=end.year - 1)
    ly_start_str = last_year_start.strftime("%Y-%m-%d")
    ly_end_str = last_year_end.strftime("%Y-%m-%d")

    sql_ly = sql_cur
    params_ly = [
        ly_start_str, ly_end_str,
        ly_start_str, ly_end_str,
        *dep_filter_params,
    ]
    with conn.cursor() as cur:
        cur.execute(sql_ly, params_ly)
        (v,) = cur.fetchone()
        total_ly = float(v or 0)

    # ----- 上一周期（环比）-----
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=length - 1)
    prev_start_str = prev_start.strftime("%Y-%m-%d")
    prev_end_str = prev_end.strftime("%Y-%m-%d")

    sql_prev = sql_cur
    params_prev = [
        prev_start_str, prev_end_str,
        prev_start_str, prev_end_str,
        *dep_filter_params,
    ]
    with conn.cursor() as cur:
        cur.execute(sql_prev, params_prev)
        (v,) = cur.fetchone()
        total_prev = float(v or 0)

    # 只有门诊数据，所以总人次 = 门诊人次；急诊 = 0
    visits_yoy = _safe_rate(total_cur, total_ly)
    visits_mom = _safe_rate(total_cur, total_prev)

    # 按前端 SummaryViewModel 结构返回（字段名必须一致）
    summary = {
        "outpatientEmergencyVisits": {  # 门急诊总人次（=门诊人次）
            "value": total_cur,
            "yoyChange": visits_yoy,
            "momChange": visits_mom,
        },
        "outpatientVisits": {           # 门诊人次
            "value": total_cur,
            "yoyChange": visits_yoy,
            "momChange": visits_mom,
        },
        "outpatientGrowthRate": {       # 门诊人次增减率（这里用环比值做 value）
            "value": visits_mom,
            "yoyChange": 0.0,
            "momChange": 0.0,
        },
        "emergencyVisits": {            # 急诊人次（目前没有急诊数据）
            "value": 0.0,
            "yoyChange": 0.0,
            "momChange": 0.0,
        },
        "emergencyGrowthRate": {        # 急诊人次增减率（全 0）
            "value": 0.0,
            "yoyChange": 0.0,
            "momChange": 0.0,
        },
    }

    return summary


# -------------------- 明细查询 --------------------


def _query_details(conn, params):
    """
    明细：前端期待字段：
      - date
      - doctor_name
      - doctor_code
      - department
      - outpatient_visits
      - emergency_visits
    目前视图只有按科室聚合，没有医生维度：
      -> doctor_name 先返回空字符串
      -> doctor_code 用 dep_code 代替（至少表格有个可看的值）
      -> outpatient_visits = visit_count
      -> emergency_visits = 0
    """
    dep_ids = params.get("department_ids")
    dep_filter_sql, dep_filter_params = _build_dep_filter_sql(dep_ids)

    sql = _build_base_cte_sql(dep_filter_sql).replace(
        "SELECT\n    *\nFROM base_outp\nWHERE 1=1\n" + dep_filter_sql,
        f"""
SELECT
    billing_date,
    dep_code,
    dep_name,
    SUM(visit_count) AS visit_count
FROM base_outp
WHERE 1=1
{dep_filter_sql}
GROUP BY
    billing_date,
    dep_code,
    dep_name
ORDER BY
    billing_date DESC,
    dep_name
"""
    )

    params_sql = [
        params["start_date"], params["end_date"],
        params["start_date"], params["end_date"],
        *dep_filter_params,
    ]

    rows = []
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        cur.execute(sql, params_sql)
        for r in cur.fetchall():
            rows.append({
                "date": r["billing_date"].strftime("%Y-%m-%d"),
                "doctor_name": "",                   # 暂无医生维度
                "doctor_code": r["dep_code"],        # 用科室编码占位
                "department": r["dep_name"],
                "outpatient_visits": int(r["visit_count"] or 0),
                "emergency_visits": 0,               # 急诊全部 0
            })

    return {"rows": rows, "total": len(rows)}


# -------------------- 趋势查询（时间序列） --------------------


def _query_timeseries(conn, params):
    """
    趋势：只基于门诊人数。
    - outpatientEmergencyVisits = outpatientVisits（总门急诊人次）
    - outpatientGrowthRate      = 相邻日期门诊人次环比
    - emergency*                = 全 0
    """
    dep_ids = params.get("department_ids")
    dep_filter_sql, dep_filter_params = _build_dep_filter_sql(dep_ids)

    sql = _build_base_cte_sql(dep_filter_sql).replace(
        "SELECT\n    *\nFROM base_outp\nWHERE 1=1\n" + dep_filter_sql,
        f"""
SELECT
    billing_date,
    SUM(visit_count) AS visit_count
FROM base_outp
WHERE 1=1
{dep_filter_sql}
GROUP BY billing_date
ORDER BY billing_date
"""
    )

    params_sql = [
        params["start_date"], params["end_date"],
        params["start_date"], params["end_date"],
        *dep_filter_params,
    ]

    raw = []
    with conn.cursor() as cur:
        cur.execute(sql, params_sql)
        for d, v in cur.fetchall():
            raw.append({
                "date": d.strftime("%Y-%m-%d"),
                "visit_count": float(v or 0),
            })

    ts_rows = []
    prev_total = None
    for r in raw:
        total = r["visit_count"]      # 只有门诊
        growth = _safe_rate(total, prev_total) if prev_total is not None else 0.0

        ts_rows.append({
            "date": r["date"],
            "outpatientEmergencyVisits": total,  # 门急诊总人次 = 门诊人次
            "outpatientVisits": total,
            "outpatientGrowthRate": growth,
            "emergencyVisits": 0.0,
            "emergencyGrowthRate": 0.0,
        })

        prev_total = total

    return {"rows": ts_rows}


# -------------------- 初始化接口 --------------------


def _query_init(conn):
    # 科室列表
    sql_dep = """
        SELECT DISTINCT
            "绩效科室ID"   AS id,
            "绩效科室名称" AS name
        FROM t_workload_dep_def2his
        WHERE "绩效科室ID" IS NOT NULL
        ORDER BY "绩效科室名称"
    """

    departments = []
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        cur.execute(sql_dep)
        for r in cur.fetchall():
            departments.append({
                "id": r["id"],
                "name": r["name"],
            })

    # 目前没有医生维度，这里先返回空数组，前端会兼容
    doctors = []

    # 默认：当前月汇总（全部科室）
    today = datetime.today()
    start = today.replace(day=1).strftime("%Y-%m-%d")
    end = today.strftime("%Y-%m-%d")

    summary = _query_summary(conn, {
        "start_date": start,
        "end_date": end,
        "department_ids": None,
    })

    return {
        "departments": departments,
        "doctors": doctors,
        "summary": summary,
    }


# -------------------- API 包装 --------------------


def api_ok(data):
    return jsonify({"success": True, "data": data})


def api_error(msg):
    return jsonify({"success": False, "message": msg})


def _parse_body_params():
    body = request.get_json(silent=True) or {}
    start_date = body.get("start_date")
    end_date = body.get("end_date")
    if not start_date or not end_date:
        return None

    params = {
        "start_date": start_date,
        "end_date": end_date,
    }

    dep_ids = body.get("department_ids") or []
    if dep_ids:
        params["department_ids"] = dep_ids

    # doctor_ids 前端会传，但目前我们没有医生维度，这里先丢掉即可
    return params


# -------------------- 路由 --------------------


@bp.route("/init", methods=["GET"])
def init_api():
    conn = get_conn()
    try:
        data = _query_init(conn)
        return api_ok(data)
    except Exception as e:
        logger.exception("outpatient_visits init_api error")
        return api_error(str(e))
    finally:
        put_conn(conn)


@bp.route("/summary", methods=["POST"])
def summary_api():
    params = _parse_body_params()
    if not params:
        return api_error("缺少 start_date 或 end_date 参数")

    conn = get_conn()
    try:
        data = _query_summary(conn, params)
        return api_ok(data)
    except Exception as e:
        logger.exception("outpatient_visits summary_api error")
        return api_error(str(e))
    finally:
        put_conn(conn)


@bp.route("/details", methods=["POST"])
def details_api():
    params = _parse_body_params()
    if not params:
        return api_error("缺少 start_date 或 end_date 参数")

    conn = get_conn()
    try:
        data = _query_details(conn, params)
        return api_ok(data)
    except Exception as e:
        logger.exception("outpatient_visits details_api error")
        return api_error(str(e))
    finally:
        put_conn(conn)


@bp.route("/timeseries", methods=["POST"])
def timeseries_api():
    params = _parse_body_params()
    if not params:
        return api_error("缺少 start_date 或 end_date 参数")

    conn = get_conn()
    try:
        data = _query_timeseries(conn, params)
        return api_ok(data)
    except Exception as e:
        logger.exception("outpatient_visits timeseries_api error")
        return api_error(str(e))
    finally:
        put_conn(conn)
