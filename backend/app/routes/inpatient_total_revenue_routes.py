import logging
from datetime import date, timedelta
from flask import Blueprint, jsonify, request
from ..services.inpatient_total_revenue_service import (get_revenue_summary,
                                                        get_departments,
                                                        get_revenue_details, \
    get_doctors,
                                                        get_revenue_timeseries)
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

    # ⭐ 默认返回 科室 + 医生 + 当日 summary
    if not include:
        return {"departments", "doctors", "data"}

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


def _parse_doctors(payload):
    doc_single = payload.get("doctor") or request.args.get("doctor")
    docs_field = payload.get("doctors") or request.args.get("doctors")
    out = []
    if doc_single:
        s = str(doc_single).strip()
        if s:
            out.append(s)
    if docs_field:
        if isinstance(docs_field, (list, tuple, set)):
            out += [str(x).strip() for x in docs_field if str(x).strip()]
        else:
            out += [s.strip() for s in str(docs_field).split(",") if s.strip()]
    out = [x for x in out if x]
    return out or None
@bp.route("/init", methods=["GET", "POST"])
def init():
    try:
        include = _parse_include()
        today = date.today()
        tomorrow = today + timedelta(days=1)

        resp = {"success": True, "date": today.isoformat()}

        # ⭐ 科室
        if "departments" in include:
            cache_key = "departments:latest"
            deps = cache_get(cache_key)
            if deps is None:
                deps = get_departments()
                cache_set(cache_key, deps, ttl_seconds=1800)
            resp["departments"] = deps

        # ⭐ 医生
        if "doctors" in include:
            cache_key = "doctors:latest"
            docs = cache_get(cache_key)
            if docs is None:
                docs = get_doctors()
                cache_set(cache_key, docs, ttl_seconds=1800)
            resp["doctors"] = docs

        # ⭐ 当日 summary
        if "data" in include:
            summary = get_revenue_summary(today, tomorrow, None)
            resp["summary"] = _to_std_summary(summary)

        return jsonify(resp), 200

    except Exception as e:
        logger.exception("init error: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


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

@bp.route("/details", methods=["POST", "GET"])
def details():
    """
    明细接口：后端不分页，返回全部行，由前端自行分页。
    新版逻辑：
      1. 支持科室筛选（departments）
      2. 支持医生筛选（doctors / doctor_ids）
      3. 先按日期拆分历史 / 实时：
           - 历史：< today  走物化视图 t_dep_income_inp / t_doc_fee_inp
           - 实时：>= today 走原始表 t_workload_inp_f
      4. 所有情况统一按 item_class_name 聚合，返回 revenue / quantity
    """
    try:
        payload = request.get_json(silent=True) or {}
        start_date = payload.get("start_date") or request.args.get("start_date")
        end_date = payload.get("end_date") or request.args.get("end_date")

        departments = _parse_departments(payload)

        # ⭐ 新增：医生筛选参数（doctors / doctor_ids）
        doctors_raw = (
            payload.get("doctors")
            or payload.get("doctor_ids")
            or request.args.get("doctors")
        )
        doctor_ids = None
        if isinstance(doctors_raw, list):
            tmp = [str(x).strip() for x in doctors_raw if str(x).strip()]
            doctor_ids = tmp or None
        elif isinstance(doctors_raw, str) and doctors_raw.strip():
            parts = [p.strip() for p in doctors_raw.split(",") if p.strip()]
            doctor_ids = parts or None

        if not start_date:
            return jsonify({"success": False, "error": "缺少 start_date"}), 400

        sd = parse_date_generic(start_date)
        if not sd:
            return jsonify({"success": False, "error": "start_date 格式错误，应为 YYYY-MM-DD"}), 400

        if end_date:
            ed = parse_date_generic(end_date)
            if not ed:
                return jsonify({"success": False, "error": "end_date 格式错误，应为 YYYY-MM-DD"}), 400
            if ed < sd:
                return jsonify({"success": False, "error": "结束日期必须大于等于开始日期"}), 400
            # 左闭右开：内部用 [sd, ed+1)
            end_exclusive = ed + timedelta(days=1)
        else:
            # 单日：内部用 [sd, sd+1)
            ed = sd
            end_exclusive = sd + timedelta(days=1)

        svc_result = get_revenue_details(sd, end_exclusive, departments, doctor_ids)
        rows = svc_result.get("rows", [])
        total = svc_result.get("total", len(rows))

        body = {
            "success": True,
            "rows": rows,
            "total": total,
            "departments": departments,
            "doctor_ids": doctor_ids,
        }

        # 保留给前端的 date / date_range 字段
        if not end_date or end_date == start_date:
            body["date"] = sd.isoformat()
        else:
            body["date_range"] = {
                "start": sd.isoformat(),
                "end": ed.isoformat(),
            }

        return jsonify(body), 200

    except Exception as e:
        logger.exception("details error: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500

@bp.route("/details_bak", methods=["POST", "GET"])
def details_bak():
    """
    明细接口：后端不分页，返回全部行，前端自行分页

    - 支持 POST JSON，也支持 GET query
    - 前端通过 fetchDetailsAPI 传入:
        { start_date, end_date, departments? }
    """
    try:
        payload = request.get_json(silent=True) or {}

        # ⭐ 兼容 start_date / start，两种字段名都认
        start_date = (
            payload.get("start_date")
            or request.args.get("start_date")
            or payload.get("start")
            or request.args.get("start")
        )
        end_date = (
            payload.get("end_date")
            or request.args.get("end_date")
            or payload.get("end")
            or request.args.get("end")
        )

        # 科室筛选（兼容 department / departments / deps）
        departments = _parse_departments(payload)

        if not start_date:
            return jsonify(
                {"success": False, "error": "缺少 start_date"}
            ), 400

        # 解析日期
        sd = parse_date_generic(start_date)
        if not sd:
            return jsonify(
                {
                    "success": False,
                    "error": "start_date 格式错误，应为 YYYY-MM-DD",
                }
            ), 400

        ed = parse_date_generic(end_date) if end_date else None

        single_day = False
        if not ed or ed == sd:
            # 单日：内部使用 [sd, sd+1)
            ed = sd + timedelta(days=1)
            single_day = True
        elif ed < sd:
            return jsonify(
                {
                    "success": False,
                    "error": "结束日期必须大于等于开始日期",
                }
            ), 400
        else:
            # 多日：对外展示为 [sd, ed]，内部查询 [sd, ed+1)
            ed = ed + timedelta(days=1)

        # ⭐ 核心：调用 Service 层明细逻辑
        svc_result = get_revenue_details(sd, ed, departments)
        rows = svc_result.get("rows", [])
        total = svc_result.get("total", len(rows))

        body = {
            "success": True,
            "departments": departments,
            "rows": rows,
            "total": total,
        }

        if single_day:
            body["date"] = sd.isoformat()
        else:
            # 对外展示的结束日期改回自然日闭区间（减一天）
            body["date_range"] = {
                "start": sd.isoformat(),
                "end": (ed - timedelta(days=1)).isoformat(),
            }

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
            "start": sd.isoformat(),
            "end": (ed - timedelta(days=1)).isoformat(),
            "interval": "day",
        }
        if single_day:
            body["date"] = sd.isoformat()
        else:
            body["date_range"] = {
                "start": sd.isoformat(),
                "end": (ed - timedelta(days=1)).isoformat(),
            }
        return jsonify(body), 200

    except Exception as e:
        logger.exception("Error while processing /timeseries: %s", e)
        return jsonify({"success": False, "code": "SERVER_ERROR", "error": str(e)}), 500
