import logging
from datetime import date, timedelta
from flask import Blueprint, jsonify, request

from ..services.inpatient_total_revenue_service import get_revenue_summary, get_departments, get_revenue_details
from ..utils.inpatient_total_revenue_validators import require_params, parse_date_generic
from ..utils.cache import cache_get, cache_set  # 保持缓存
logger = logging.getLogger("inpatient_total_revenue.routes")
bp = Blueprint("inpatient_total_revenue", __name__)


def _to_std_summary(service_result: dict) -> dict:
    """
    标准化汇总给前端使用（单位：元；百分比为数值，12.34 表示 12.34%）
    """
    rev = (service_result or {}).get("revenue") or {}
    trend = (service_result or {}).get("trend")

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
        "trend": trend,
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
        return {"departments", "data"}
    return {s.strip().lower() for s in str(include).split(",") if s.strip()}


def _parse_departments(payload):
    """
    兼容：
      - department=0301
      - departments=0301,0402
      - {"departments": ["0301","0402"]}
    """
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


@bp.route("/init", methods=["GET", "POST"])
def init():
    """
    初始化：返回今日日期、科室列表、今日全院汇总（YoY/MoM/趋势）
    """
    try:
        include = _parse_include()
        today = date.today()
        tomorrow = today + timedelta(days=1)
        logger.info("INIT(today) include=%s", ",".join(sorted(include)))

        resp = {"success": True, "date": today.isoformat()}

        if "departments" in include:
            cache_key = "departments:latest"
            deps = cache_get(cache_key)
            if deps is None:
                deps = get_departments()
                cache_set(cache_key, deps, ttl_seconds=1800)  # 30 min
            resp["departments"] = deps

        if "data" in include:
            svc = get_revenue_summary(today, tomorrow, None)  # 全院
            resp["summary"] = _to_std_summary(svc)

        return jsonify(resp), 200
    except Exception as e:
        logger.exception("Error in /init(today): %s", e)
        return jsonify({"success": False, "code": "INIT_FAILED", "error": str(e)}), 500


@bp.route("/summary", methods=["POST", "GET"])
def summary():
    """
    汇总查询（基于筛选集合）：返回
      - current（元）
      - growth_rate（同比%）
      - mom_growth_rate（环比%）
      - trend（收入 vs 床日）
    以及 last_year/previous 便于展示或校对。
    """
    try:
        payload = request.get_json(silent=True) or {}
        start_date = payload.get("start_date") or request.args.get("start_date")
        end_date   = payload.get("end_date")   or request.args.get("end_date")
        departments = _parse_departments(payload)

        logger.info("SUMMARY: start=%s end=%s deps=%s", start_date, end_date, departments or "ALL")

        ok, missing = require_params({"start_date": start_date}, ["start_date"])
        if not ok:
            return jsonify({"success": False, "code": "BAD_REQUEST", "error": f"缺少必填参数: {', '.join(missing)}"}), 400

        sd = parse_date_generic(start_date)
        ed = parse_date_generic(end_date) if end_date else None
        if not sd:
            return jsonify({"success": False, "code": "BAD_REQUEST", "error": "日期格式错误（支持 YYYY-MM-DD / YYYY/MM/DD / YYYYMMDD）"}), 400

        single_day = False
        if not ed or ed == sd:
            ed = sd + timedelta(days=1)
            single_day = True
        elif ed <= sd:
            return jsonify({"success": False, "code": "BAD_REQUEST", "error": "结束日期必须大于开始日期"}), 400

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


@bp.route("/details", methods=["POST", "GET"])
def details():
    """
    明细汇总（按 日期 × 科室 聚合；收入 = charges；忽略 amount）
    请求：
      {
        "start_date": "YYYY-MM-DD",
        "end_date": "YYYY-MM-DD" (可选),
        "departments": ["0301","0402"] 或 "0301,0402" (可选),
        "limit": 20, "offset": 0  (可选)
      }

    响应：
      {
        "success": true,
        "date" 或 "date_range": {...},
        "departments": [...],
        "limit": 20,
        "offset": 0,
        "total": 123,
        "rows": [
          {
            "date": "2025-11-12",
            "department_code": "0301",
            "department_name": "心内科",
            "revenue": 23456.78,
            "revenue_growth_pct": 12.34,
            "trend": "同向"
          },
          ...
        ]
      }
    """
    try:
        payload = request.get_json(silent=True) or {}
        start_date = payload.get("start_date") or request.args.get("start_date")
        end_date   = payload.get("end_date")   or request.args.get("end_date")

        # ---------- 参数解析 ----------
        def _parse_list(v):
            """支持列表或逗号分隔字符串"""
            if v is None:
                return None
            if isinstance(v, (list, tuple, set)):
                return [str(x).strip() for x in v if str(x).strip()]
            return [s.strip() for s in str(v).split(",") if s.strip()]

        departments = _parse_list(payload.get("departments") or request.args.get("departments"))

        def _to_int(x, default):
            try:
                return int(x)
            except Exception:
                return default

        limit  = _to_int(payload.get("limit")  or request.args.get("limit"),  20)
        offset = _to_int(payload.get("offset") or request.args.get("offset"), 0)
        if limit <= 0: limit = 20
        if offset < 0: offset = 0

        ok, missing = require_params({"start_date": start_date}, ["start_date"])
        if not ok:
            return jsonify({
                "success": False,
                "code": "BAD_REQUEST",
                "error": f"缺少必填参数: {', '.join(missing)}"
            }), 400

        # ---------- 日期解析 ----------
        sd = parse_date_generic(start_date)
        ed = parse_date_generic(end_date) if end_date else None
        if not sd:
            return jsonify({"success": False, "code": "BAD_REQUEST", "error": "日期格式错误"}), 400

        single_day = False
        if not ed or ed == sd:
            from datetime import timedelta
            ed = sd + timedelta(days=1)
            single_day = True
        elif ed <= sd:
            return jsonify({
                "success": False,
                "code": "BAD_REQUEST",
                "error": "结束日期必须大于开始日期"
            }), 400

        # ---------- 调用服务 ----------
        result = get_revenue_details(sd, ed, departments, limit=limit, offset=offset)
        rows, total = result["rows"], int(result["total"])

        # ---------- 构造响应 ----------
        body = {
            "success": True,
            "departments": departments,
            "rows": rows,
            "total": total,
            "limit": limit,
            "offset": offset,
        }

        if single_day:
            body["date"] = sd.isoformat()
        else:
            body["date_range"] = {"start": sd.isoformat(), "end": ed.isoformat()}

        return jsonify(body), 200

    except Exception as e:
        logger.exception("Error while processing /details: %s", e)
        return jsonify({
            "success": False,
            "code": "SERVER_ERROR",
            "error": str(e)
        }), 500





