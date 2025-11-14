import logging
from datetime import date, timedelta
from flask import Blueprint, jsonify, request
from ..services.inpatient_total_revenue_service import (
    get_revenue_summary,
    get_revenue_details,
    get_revenue_timeseries,
    get_dep_doc_map,  # ⭐ 新增
)
from ..utils.inpatient_total_revenue_validators import require_params, parse_date_generic
from ..utils.cache import cache_get, cache_set

logger = logging.getLogger("inpatient_total_revenue.routes")
bp = Blueprint("inpatient_total_revenue", __name__)


def _to_std_summary(service_result: dict) -> dict:
    """
    标准化汇总给前端使用（单位：元；百分比为数值，12.34 表示 12.34%）
    """
    rev = (service_result or {}).get("revenue") or {}
    trend = (service_result or {}).get("trend")
    bed_obj = (service_result or {}).get("bed") or {}
    bed_top_yoy = (service_result or {}).get("bed_growth_pct")
    bed_top_mom = (service_result or {}).get("bed_mom_growth_pct")

    def _to_num(x):
        try:
            return (round(float(x), 2) if x is not None else None)
        except Exception:
            return None

    return {
        "current": float(rev.get("current_total") or 0.0),
        "last_year": float(rev.get("last_year_total") or 0.0),
        "previous": float(rev.get("previous_total") or 0.0),
        "growth_rate": _to_num(rev.get("growth_rate_pct")),
        "mom_growth_rate": _to_num(rev.get("mom_growth_pct")),
        "bed_growth_rate": _to_num(bed_top_yoy if bed_top_yoy is not None else bed_obj.get("growth_rate_pct")),
        "bed_mom_growth_rate": _to_num(bed_top_mom if bed_top_mom is not None else bed_obj.get("mom_growth_pct")),
        "trend": trend,  # 虽然前端不展示，但保留字段不影响
    }


def _parse_include() -> set:
    include = None
    q = request.args.get("include")
    if q:
        include = q
    if not include:
        h = request.headers.get("X-Include")
        if h:
            include = h
    if not include:
        body = request.get_json(silent=True) or {}
        include = body.get("include")
    if not include:
        # ⭐ 默认只取科室-医生映射
        return {"dep_doc_map"}
    return {s.strip().lower() for s in str(include).split(",") if s.strip()}


def _parse_departments(payload):
    dep_single = payload.get("department") or request.args.get("department")
    deps_field = payload.get("departments") or request.args.get("departments")
    out = []
    if dep_single:
        s = str(dep_single).strip()
        if s:
            out.append(s)
    if deps_field:
        if isinstance(deps_field, (list, tuple, set)):
            out += [str(x).strip() for x in deps_field if str(x).strip()]
        else:
            out += [s.strip() for s in str(deps_field).split(",") if s.strip()]
    out = [x for x in out if x]
    return out or None


@bp.route("/init", methods=["GET"])
def init():
    try:
        include = _parse_include()
        today = date.today()
        logger.info("INIT(today) include=%s", ",".join(sorted(include)))

        resp = {"success": True, "date": today.isoformat()}

        # ⭐ 只处理科室-医生映射
        if "dep_doc_map" in include:
            # 有需要也可以加缓存，这里先直接查
            dep_doc_map = get_dep_doc_map()
            resp["dep_doc_map"] = dep_doc_map

        return jsonify(resp), 200

    except Exception as e:
        logger.exception("Error in /init(today): %s", e)
        return jsonify(
            {"success": False, "code": "INIT_FAILED", "error": str(e)}
        ), 500


@bp.route("/summary", methods=["POST", "GET"])
def summary():
    try:
        payload = request.get_json(silent=True) or {}
        start_date = payload.get("start_date") or request.args.get("start_date")
        end_date = payload.get("end_date") or request.args.get("end_date")
        departments = _parse_departments(payload)

        logger.info("SUMMARY: start=%s end=%s deps=%s", start_date, end_date, departments or "ALL")

        ok, missing = require_params({"start_date": start_date}, ["start_date"])
        if not ok:
            return jsonify(
                {"success": False, "code": "BAD_REQUEST", "error": f"缺少必填参数: {', '.join(missing)}"}), 400

        sd = parse_date_generic(start_date)
        ed = parse_date_generic(end_date) if end_date else None
        if not sd:
            return jsonify({"success": False, "code": "BAD_REQUEST",
                            "error": "日期格式错误（支持 YYYY-MM-DD / YYYY/MM/DD / YYYYMMDD）"}), 400

        single_day = False
        if not ed or ed == sd:
            # 单日：用户只选开始日期或开始=结束 -> 区间为 [sd, sd+1)
            ed = sd + timedelta(days=1)
            single_day = True
        elif ed < sd:
            return jsonify({"success": False, "code": "BAD_REQUEST", "error": "结束日期必须大于开始日期"}), 400
        else:
            # 多日：用户选的是自然日闭区间 [sd, ed]，转换成半开区间 [sd, ed+1)
            ed = ed + timedelta(days=1)

        svc = get_revenue_summary(sd, ed, departments)
        body = {"success": True, "departments": departments}

        if single_day:
            body["date"] = sd.isoformat()
        else:
            body["date_range"] = {"start": sd.isoformat(), "end": ed.isoformat()}

        body["summary"] = _to_std_summary(svc)
        return jsonify(body), 200

    except Exception as e:
        logger.exception("Error while processing /summary: %s", e)
        return jsonify({"success": False, "code": "SERVER_ERROR", "error": str(e)}), 500


@bp.route("/details", methods=["POST"])
def details():
    """
    明细接口：后端不分页，返回全部行，前端自行分页
    """
    try:
        payload = request.get_json(silent=True) or {}
        start_date = payload.get("start_date") or request.args.get("start_date")
        end_date = payload.get("end_date") or request.args.get("end_date")

        departments = _parse_departments(payload)

        if not start_date:
            return jsonify({
                "success": False,
                "error": "缺少 start_date"
            }), 400

        sd = parse_date_generic(start_date)
        ed = parse_date_generic(end_date) if end_date else None
        if not sd:
            return jsonify({"success": False, "error": "日期格式错误"}), 400

        single_day = False
        if not ed or ed == sd:
            ed = sd + timedelta(days=1)
            single_day = True
        elif ed < sd:
            return jsonify({"success": False, "error": "结束日期必须大于开始日期"}), 400
        else:
            ed = ed + timedelta(days=1)

        # ⭐ 调用不分页版 service
        result = get_revenue_details(sd, ed, departments)
        rows, total = result["rows"], result["total"]

        body = {
            "success": True,
            "departments": departments,
            "rows": rows,
            "total": total,
        }
        if single_day:
            body["date"] = sd.isoformat()
        else:
            body["date_range"] = {"start": sd.isoformat(), "end": ed.isoformat()}

        return jsonify(body), 200

    except Exception as e:
        logger.exception("details error: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@bp.route("/timeseries", methods=["POST", "GET"])
def timeseries():
    """
    趋势接口：返回 [start_date, end_date) 区间内的每日收入（charges），以及去年同日/前一日对比的增长率。
    响应 rows: [{date, revenue, last_year, prev_day, yoy_pct, mom_pct}]
    """
    try:
        payload = request.get_json(silent=True) or {}
        start_date = payload.get("start_date") or request.args.get("start_date")
        end_date = payload.get("end_date") or request.args.get("end_date")
        departments = _parse_departments(payload)  # 兼容 department / departments 两种入参

        ok, missing = require_params({"start_date": start_date}, ["start_date"])
        if not ok:
            return jsonify(
                {"success": False, "code": "BAD_REQUEST", "error": f"缺少必填参数: {', '.join(missing)}"}), 400

        sd = parse_date_generic(start_date)
        ed = parse_date_generic(end_date) if end_date else None
        if not sd:
            return jsonify({"success": False, "code": "BAD_REQUEST", "error": "日期格式错误"}), 400

        single_day = False
        if not ed or ed == sd:
            ed = sd + timedelta(days=1)
            single_day = True
        elif ed < sd:
            return jsonify({"success": False, "code": "BAD_REQUEST", "error": "结束日期必须大于开始日期"}), 400
        else:
            ed = ed + timedelta(days=1)

        rows = get_revenue_timeseries(sd, ed, departments)

        body = {
            "success": True,
            "departments": departments,
            "rows": rows,
        }
        if single_day:
            body["date"] = sd.isoformat()
        else:
            body["date_range"] = {"start": sd.isoformat(), "end": ed.isoformat()}
        return jsonify(body), 200

    except Exception as e:
        logger.exception("Error while processing /timeseries: %s", e)
        return jsonify({"success": False, "code": "SERVER_ERROR", "error": str(e)}), 500
