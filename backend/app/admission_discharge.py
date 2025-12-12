import logging
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

from flask import Blueprint, jsonify, request
from psycopg2.extras import RealDictCursor

from .shared.db import get_conn, put_conn
from .shared.cache import cache_get, cache_set
from .shared.validators import require_params, parse_date_generic

logger = logging.getLogger(__name__)

bp = Blueprint("admission_discharge", __name__)

# ====== 常量配置 ======
INPATIENT_FACT_TABLE = "t_workload_inbed_reg_f"
INPATIENT_ADM_VIEW = "t_dep_count_inbed"
INPATIENT_DSCG_VIEW = "t_dep_count_outbed"

# 住院人数（人头）去重字段
PATIENT_ID_COLUMN = "patn_id"   # 来自 t_workload_inbed_reg_f 表定义


# ====== 工具函数 ======

def _split_history_realtime(start_date: date, end_date: date) -> Dict[str, Optional[Tuple[date, date]]]:
    """
    将前端传入的 [start_date, end_date]（闭区间）转换为：
      - history: [h_start, h_end)  用视图，限制 < CURRENT_DATE
      - realtime: [r_start, r_end) 用表，限制 >= CURRENT_DATE

    且统一采用左闭右开：
      date >= start
      date < end
    其中 end = end_date + 1 天。
    """
    today = date.today()
    end_plus_one = end_date + timedelta(days=1)

    # 历史区间：从 start_date 到 min(end_plus_one, today)，左闭右开
    history_start = start_date
    history_end = min(end_plus_one, today)
    history_range = (history_start, history_end) if history_start < history_end else None

    # 实时区间：从 max(start_date, today) 到 end_plus_one，左闭右开
    realtime_start = max(start_date, today)
    realtime_end = end_plus_one
    realtime_range = (realtime_start, realtime_end) if realtime_start < realtime_end else None

    return {"history": history_range, "realtime": realtime_range}


def _build_dep_filter(dep_ids: Optional[List[str]], col: str) -> Tuple[str, List[Any]]:
    """
    构造科室过滤条件：使用 ANY 方便传 list
    """
    if not dep_ids:
        return "", []
    return f" AND {col} = ANY(%s) ", [dep_ids]


def _safe_ratio(head_cnt: int, times_cnt: int) -> float:
    """
    住院人头人次比 = 住院人数 / 住院人次数 * 100
    """
    if not times_cnt:
        return 0.0
    return round(float(head_cnt) * 100.0 / float(times_cnt), 2)


def _safe_pct_change(curr, prev):
    """
    同比 / 环比百分比变化 = (curr - prev) / prev
    返回小数，例如 0.1 表示 +10%
    """
    if prev is None or prev == 0 or curr is None:
        return None
    try:
        return (curr - prev) / prev
    except Exception:
        return None


def _calc_totals_for_period(
    cur,
    start_date: date,
    end_date: date,
    dep_ids: Optional[List[str]],
) -> Tuple[int, int, int]:
    """
    计算一个时间段的：
      - 入院人次 total_adm
      - 出院人次 total_dscg
      - 住院人数（人头） head_cnt

    时间段：闭区间 [start_date, end_date]，
    实际 SQL 使用：>= start 和 < end+1。
    """
    ranges = _split_history_realtime(start_date, end_date)

    total_adm = 0
    total_dscg = 0

    # ---------- 历史部分：查视图 ----------
    if ranges["history"]:
        h_start, h_end = ranges["history"]  # 左闭右开
        dep_sql, dep_params = _build_dep_filter(dep_ids, "dep_code")

        # 入院次数（视图）
        cur.execute(
            f"""
            SELECT COALESCE(SUM(amount), 0) AS cnt
            FROM {INPATIENT_ADM_VIEW}
            WHERE inbed_date >= %s AND inbed_date < %s
            {dep_sql}
            """,
            [h_start, h_end, *dep_params],
        )
        row = cur.fetchone() or {}
        total_adm += int(row.get("cnt") or 0)

        # 出院次数（视图）
        cur.execute(
            f"""
            SELECT COALESCE(SUM(amount), 0) AS cnt
            FROM {INPATIENT_DSCG_VIEW}
            WHERE inbed_date >= %s AND inbed_date < %s
            {dep_sql}
            """,
            [h_start, h_end, *dep_params],
        )
        row = cur.fetchone() or {}
        total_dscg += int(row.get("cnt") or 0)

    # ---------- 实时部分：查表 ----------
    if ranges["realtime"]:
        r_start, r_end = ranges["realtime"]  # 左闭右开

        # 入院次数（表）
        dep_sql, dep_params = _build_dep_filter(dep_ids, "adm_dept_code")
        cur.execute(
            f"""
            SELECT COUNT(*) AS cnt
            FROM {INPATIENT_FACT_TABLE}
            WHERE adm_date >= %s AND adm_date < %s
            {dep_sql}
            """,
            [r_start, r_end, *dep_params],
        )
        row = cur.fetchone() or {}
        total_adm += int(row.get("cnt") or 0)

        # 出院次数（表）
        dep_sql2, dep_params2 = _build_dep_filter(dep_ids, "dscg_dept_code")
        cur.execute(
            f"""
            SELECT COUNT(*) AS cnt
            FROM {INPATIENT_FACT_TABLE}
            WHERE dscg_date >= %s AND dscg_date < %s
            {dep_sql2}
            """,
            [r_start, r_end, *dep_params2],
        )
        row = cur.fetchone() or {}
        total_dscg += int(row.get("cnt") or 0)

    # ---------- 住院人数（人头）：全时段查明细表 ----------
    end_plus_one = end_date + timedelta(days=1)
    dep_sql_head, dep_params_head = _build_dep_filter(dep_ids, "adm_dept_code")
    cur.execute(
        f"""
        SELECT COUNT(DISTINCT {PATIENT_ID_COLUMN}) AS head_cnt
        FROM {INPATIENT_FACT_TABLE}
        WHERE adm_date >= %s AND adm_date < %s
        {dep_sql_head}
        """,
        [start_date, end_plus_one, *dep_params_head],
    )
    row = cur.fetchone() or {}
    head_cnt = int(row.get("head_cnt") or 0)

    return total_adm, total_dscg, head_cnt


# ====== 1. /init 科室初始化 ======

@bp.route("/init", methods=["GET"])
def init():
    """
    返回出入院相关科室列表（去重）：
    {
      "success": true,
      "data": {
        "departments": [
          {"id": "01", "name": "内科"},
          ...
        ]
      }
    }
    """
    try:
        cache_key = "admission_discharge:init_departments"
        cached = cache_get(cache_key)
        if cached is not None:
            return jsonify({
                "success": True,
                "data": {"departments": cached},
                "message": "初始化成功（缓存）"
            })

        conn = get_conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # 视图中已经有 dep_code / dep_name
                cur.execute(
                    f"""
                    SELECT DISTINCT dep_code, dep_name
                    FROM (
                        SELECT dep_code, dep_name FROM {INPATIENT_ADM_VIEW}
                        UNION
                        SELECT dep_code, dep_name FROM {INPATIENT_DSCG_VIEW}
                    ) t
                    ORDER BY dep_name
                    """
                )
                rows = cur.fetchall()
        finally:
            put_conn(conn)

        departments = [
            {"id": row["dep_code"], "name": row["dep_name"]}
            for row in rows
        ]

        # 缓存 10 分钟
        cache_set(cache_key, departments, ttl_seconds=600)

        return jsonify({
            "success": True,
            "data": {"departments": departments},
            "message": "初始化成功"
        })
    except Exception as e:
        logger.exception("AdmissionDischarge init error")
        return jsonify({
            "success": False,
            "data": None,
            "message": f"初始化失败: {e}"
        }), 500


# ====== 2. /summary 汇总接口（含同比 / 环比） ======

@bp.route("/summary", methods=["POST"])
def summary():
    """
    汇总总出入院人次 + 住院人头人次比 + 同比 / 环比

    请求体：
    {
      "startDate": "2025-11-01",
      "endDate": "2025-11-18",
      "departments": ["01", "02"] | null
    }

    响应体（示例）：
    {
      "success": true,
      "data": {
        "totalAdmission": 100,
        "totalDischarge": 90,
        "totalInpatientRatio": 85.5,
        "admissionYoYChange": 0.12,
        "admissionMoMChange": -0.05,
        "dischargeYoYChange": 0.10,
        "dischargeMoMChange": -0.02,
        "inpatientRatioYoYChange": 0.08,
        "inpatientRatioMoMChange": 0.01
      }
    }
    """
    try:
        payload = request.get_json(force=True) or {}

        ok, missing = require_params(payload, ["startDate", "endDate"])
        if not ok:
            return jsonify({
                "success": False,
                "data": None,
                "message": f"缺少必填参数: {', '.join(missing)}"
            }), 400

        start_date = parse_date_generic(payload.get("startDate"))
        end_date = parse_date_generic(payload.get("endDate"))

        if not start_date or not end_date:
            return jsonify({
                "success": False,
                "data": None,
                "message": "日期格式错误，应为 YYYY-MM-DD"
            }), 400

        if start_date > end_date:
            return jsonify({
                "success": False,
                "data": None,
                "message": "开始日期不能大于结束日期"
            }), 400

        dep_ids = payload.get("departments")
        if isinstance(dep_ids, list):
            dep_ids = [str(d) for d in dep_ids]
        else:
            dep_ids = None

        # 当前区间长度（天数）
        period_days = (end_date + timedelta(days=1) - start_date).days

        conn = get_conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # ---------- 当前区间 ----------
                cur_adm, cur_dscg, cur_head = _calc_totals_for_period(
                    cur, start_date, end_date, dep_ids
                )
                cur_ratio = _safe_ratio(cur_head, cur_adm)

                # ---------- 环比（上一周期：长度相同，紧挨当前区间之前） ----------
                prev_end = start_date - timedelta(days=1)
                prev_start = prev_end - timedelta(days=period_days - 1)
                prev_adm, prev_dscg, prev_head = _calc_totals_for_period(
                    cur, prev_start, prev_end, dep_ids
                )
                prev_ratio = _safe_ratio(prev_head, prev_adm)

                # ---------- 同比（去年同期） ----------
                try:
                    yoy_start = start_date.replace(year=start_date.year - 1)
                    yoy_end = end_date.replace(year=end_date.year - 1)
                except ValueError:
                    # 处理 2-29 这类特殊情况，退回 365 天
                    yoy_start = start_date - timedelta(days=365)
                    yoy_end = end_date - timedelta(days=365)

                yoy_adm, yoy_dscg, yoy_head = _calc_totals_for_period(
                    cur, yoy_start, yoy_end, dep_ids
                )
                yoy_ratio = _safe_ratio(yoy_head, yoy_adm)

        finally:
            put_conn(conn)

        # ====== 计算同比 / 环比（使用小数） ======
        admission_yoy = _safe_pct_change(cur_adm, yoy_adm)
        admission_mom = _safe_pct_change(cur_adm, prev_adm)

        discharge_yoy = _safe_pct_change(cur_dscg, yoy_dscg)
        discharge_mom = _safe_pct_change(cur_dscg, prev_dscg)

        ratio_yoy = _safe_pct_change(cur_ratio, yoy_ratio)
        ratio_mom = _safe_pct_change(cur_ratio, prev_ratio)

        return jsonify({
            "success": True,
            "data": {
                "totalAdmission": cur_adm,
                "totalDischarge": cur_dscg,
                "totalInpatientRatio": cur_ratio,
                "admissionYoYChange": admission_yoy,
                "admissionMoMChange": admission_mom,
                "dischargeYoYChange": discharge_yoy,
                "dischargeMoMChange": discharge_mom,
                "inpatientRatioYoYChange": ratio_yoy,
                "inpatientRatioMoMChange": ratio_mom
            },
            "message": "汇总数据获取成功"
        })
    except Exception as e:
        logger.exception("AdmissionDischarge summary error")
        return jsonify({
            "success": False,
            "data": None,
            "message": f"获取汇总数据失败: {e}"
        }), 500


# ====== 3. /chart-data 曲线接口（保持原来结构，不加同比环比） ======

@bp.route("/chart-data", methods=["POST"])
def chart_data():
    """
    返回按天的出入院人次 + 住院人头人次比（会补全日期）

    请求体同 /summary

    响应:
    {
      "success": true,
      "data": [
        {
          "date": "2025-11-01",
          "data": {
            "admissionCount": 10,
            "dischargeCount": 8,
            "inpatientRatio": 80.0
          }
        },
        ...
      ]
    }
    """
    try:
        payload = request.get_json(force=True) or {}

        ok, missing = require_params(payload, ["startDate", "endDate"])
        if not ok:
            return jsonify({
                "success": False,
                "data": None,
                "message": f"缺少必填参数: {', '.join(missing)}"
            }), 400

        start_date = parse_date_generic(payload.get("startDate"))
        end_date = parse_date_generic(payload.get("endDate"))

        if not start_date or not end_date:
            return jsonify({
                "success": False,
                "data": None,
                "message": "日期格式错误，应为 YYYY-MM-DD"
            }), 400

        if start_date > end_date:
            return jsonify({
                "success": False,
                "data": None,
                "message": "开始日期不能大于结束日期"
            }), 400

        dep_ids = payload.get("departments")
        if isinstance(dep_ids, list):
            dep_ids = [str(d) for d in dep_ids]
        else:
            dep_ids = None

        ranges = _split_history_realtime(start_date, end_date)

        # 日期列表：补全 [start_date, end_date]
        day_list: List[date] = []
        cur_day = start_date
        while cur_day <= end_date:
            day_list.append(cur_day)
            cur_day += timedelta(days=1)

        adm_map = {d: 0 for d in day_list}    # 入院人次
        dscg_map = {d: 0 for d in day_list}   # 出院人次
        head_map = {d: 0 for d in day_list}   # 住院人数（人头）

        conn = get_conn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # ---------- 1) 历史入/出院：视图 ----------
                if ranges["history"]:
                    h_start, h_end = ranges["history"]
                    dep_sql, dep_params = _build_dep_filter(dep_ids, "dep_code")

                    # 入院视图
                    cur.execute(
                        f"""
                        SELECT inbed_date::date AS stat_date,
                               SUM(amount)      AS cnt
                        FROM {INPATIENT_ADM_VIEW}
                        WHERE inbed_date >= %s AND inbed_date < %s
                        {dep_sql}
                        GROUP BY inbed_date::date
                        """,
                        [h_start, h_end, *dep_params],
                    )
                    for row in cur.fetchall():
                        d = row["stat_date"]
                        if d in adm_map:
                            adm_map[d] += int(row["cnt"] or 0)

                    # 出院视图
                    cur.execute(
                        f"""
                        SELECT inbed_date::date AS stat_date,
                               SUM(amount)      AS cnt
                        FROM {INPATIENT_DSCG_VIEW}
                        WHERE inbed_date >= %s AND inbed_date < %s
                        {dep_sql}
                        GROUP BY inbed_date::date
                        """,
                        [h_start, h_end, *dep_params],
                    )
                    for row in cur.fetchall():
                        d = row["stat_date"]
                        if d in dscg_map:
                            dscg_map[d] += int(row["cnt"] or 0)

                # ---------- 2) 实时入/出院：表 ----------
                if ranges["realtime"]:
                    r_start, r_end = ranges["realtime"]

                    # 入院表
                    dep_sql, dep_params = _build_dep_filter(dep_ids, "adm_dept_code")
                    cur.execute(
                        f"""
                        SELECT adm_date::date AS stat_date,
                               COUNT(*)       AS cnt
                        FROM {INPATIENT_FACT_TABLE}
                        WHERE adm_date >= %s AND adm_date < %s
                        {dep_sql}
                        GROUP BY adm_date::date
                        """,
                        [r_start, r_end, *dep_params],
                    )
                    for row in cur.fetchall():
                        d = row["stat_date"]
                        if d in adm_map:
                            adm_map[d] += int(row["cnt"] or 0)

                    # 出院表
                    dep_sql2, dep_params2 = _build_dep_filter(dep_ids, "dscg_dept_code")
                    cur.execute(
                        f"""
                        SELECT dscg_date::date AS stat_date,
                               COUNT(*)         AS cnt
                        FROM {INPATIENT_FACT_TABLE}
                        WHERE dscg_date >= %s AND dscg_date < %s
                        {dep_sql2}
                        GROUP BY dscg_date::date
                        """,
                        [r_start, r_end, *dep_params2],
                    )
                    for row in cur.fetchall():
                        d = row["stat_date"]
                        if d in dscg_map:
                            dscg_map[d] += int(row["cnt"] or 0)

                # ---------- 3) 住院人数（人头）：按天查表 ----------
                end_plus_one = end_date + timedelta(days=1)
                dep_sql_head, dep_params_head = _build_dep_filter(dep_ids, "adm_dept_code")
                cur.execute(
                    f"""
                    SELECT adm_date::date          AS stat_date,
                           COUNT(DISTINCT {PATIENT_ID_COLUMN}) AS head_cnt
                    FROM {INPATIENT_FACT_TABLE}
                    WHERE adm_date >= %s AND adm_date < %s
                    {dep_sql_head}
                    GROUP BY adm_date::date
                    """,
                    [start_date, end_plus_one, *dep_params_head],
                )
                for row in cur.fetchall():
                    d = row["stat_date"]
                    if d in head_map:
                        head_map[d] = int(row["head_cnt"] or 0)

        finally:
            put_conn(conn)

        # 组装返回
        result: List[Dict[str, Any]] = []
        for d in day_list:
            adm = adm_map[d]
            dscg = dscg_map[d]
            head = head_map[d]
            ratio = _safe_ratio(head, adm)
            result.append({
                "date": d.strftime("%Y-%m-%d"),
                "data": {
                    "admissionCount": adm,
                    "dischargeCount": dscg,
                    "inpatientRatio": ratio
                }
            })

        return jsonify({
            "success": True,
            "data": result,
            "message": "图表数据获取成功"
        })
    except Exception as e:
        logger.exception("AdmissionDischarge chart_data error")
        return jsonify({
            "success": False,
            "data": None,
            "message": f"获取图表数据失败: {e}"
        }), 500
