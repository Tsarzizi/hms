# backend/app/routes/inpatient_total_revenue_routes.py

import logging
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from flask import Blueprint, jsonify, request

from ..services.inpatient_total_revenue_service import (
    get_dep_doc_map,
    get_full_revenue,
)
from ..utils.inpatient_total_revenue_validators import parse_date_generic
from ..utils.cache import cache_get, cache_set

logger = logging.getLogger("inpatient_total_revenue.routes")
bp = Blueprint("inpatient_total_revenue", __name__)


def _parse_departments(payload: Dict[str, Any]) -> Optional[List[str]]:
    """
    从 JSON body / query string 中解析部门名称列表（绩效科室名称）
    """
    dep_single = payload.get("department") or request.args.get("department")
    deps_field = payload.get("departments") or request.args.get("departments")
    out: List[str] = []
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


def _parse_doctors(payload: Dict[str, Any]) -> Optional[List[str]]:
    """
    从 JSON body / query string 中解析医生工号列表
    """
    doc_single = payload.get("doctor") or request.args.get("doctor")
    docs_field = payload.get("doctors") or request.args.get("doctors")
    out: List[str] = []
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


@bp.route("/init", methods=["GET"])
def init():
    """
    初始化接口：
      - 返回科室列表（code = dep_id, name = dep_name）
      - 返回医生列表（带所在绩效科室）
    """
    try:
        cache_key = "inpatient_total_revenue:init:v3"
        cached = cache_get(cache_key)
        if cached:
            return jsonify(cached), 200

        today = date.today()

        rows = get_dep_doc_map()

        departments: List[Dict[str, Any]] = []
        dep_seen: set = set()
        doctors: List[Dict[str, Any]] = []

        for r in rows:
            dep_id = str(r.get("dep_id") or "").strip()
            dep_name = str(r.get("dep_name") or "").strip()
            if dep_id and dep_id not in dep_seen:
                dep_seen.add(dep_id)
                departments.append({"code": dep_id, "name": dep_name})

            for d in r.get("doctors") or []:
                doc_id = str(d.get("doc_id") or "").strip()
                doc_name = str(d.get("doc_name") or "").strip()
                if not doc_id or not doc_name:
                    continue
                doctors.append(
                    {
                        "doc_id": doc_id,
                        "doc_name": doc_name,
                        "dep_id": dep_id,
                        "dep_name": dep_name,
                    }
                )

        body = {
            "success": True,
            "date": today.isoformat(),
            "departments": departments,
            "doctors": doctors,
        }
        cache_set(cache_key, body)
        return jsonify(body), 200
    except Exception as e:
        logger.exception("Error while processing /init: %s", e)
        return (
            jsonify(
                {"success": False, "code": "SERVER_ERROR", "error": str(e)}
            ),
            500,
        )


@bp.route("/query", methods=["POST"])
def query():
    """
    统一查询接口：
      body:
      {
        "start_date": "2025-11-10",
        "end_date": "2025-11-14",       # 可选，省略视为单日
        "departments": ["儿科一病区"],  # 可选，绩效科室名称
        "doctors": ["8035", "8036"]     # 可选，医生工号；有医生时后端会忽略科室收入查询中的部门条件
      }
    """
    try:
        payload = request.get_json(force=True) or {}

        start_date = payload.get("start_date") or request.args.get("start_date")
        end_date = payload.get("end_date") or request.args.get("end_date")

        if not start_date:
            return (
                jsonify({"success": False, "error": "缺少 start_date"}),
                400,
            )

        sd = parse_date_generic(start_date)
        if not sd:
            return (
                jsonify({"success": False, "error": "start_date 格式错误"}),
                400,
            )

        if end_date:
            ed0 = parse_date_generic(end_date)
            if not ed0:
                return (
                    jsonify({"success": False, "error": "end_date 格式错误"}),
                    400,
                )
        else:
            ed0 = sd

        if ed0 < sd:
            return (
                jsonify({"success": False, "error": "结束日期必须不早于开始日期"}),
                400,
            )

        # 右开区间：end_exclusive = 查询结束日期 + 1 天
        ed_exclusive = ed0 + timedelta(days=1)

        departments = _parse_departments(payload)
        doctors = _parse_doctors(payload)

        logger.info(
            "/query | sd=%s ed=%s departments=%s doctors=%s",
            sd,
            ed_exclusive,
            departments,
            doctors,
        )

        data = get_full_revenue(sd, ed_exclusive, departments, doctors)
        body = {"success": True, **data}
        return jsonify(body), 200
    except Exception as e:
        logger.exception("Error while processing /query: %s", e)
        return (
            jsonify(
                {
                    "success": False,
                    "code": "SERVER_ERROR",
                    "error": str(e),
                }
            ),
            500,
        )
