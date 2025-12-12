from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, asdict
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from flask import Blueprint, jsonify, request

from .shared.db import get_conn, put_conn  # 按你项目真实路径来
from .shared.cache import cache_get, cache_set
from .shared.numbers import safe_pct_change
from .shared.validators import require_params, parse_date_generic

logger = logging.getLogger(__name__)

# 这里不要写 url_prefix，统一在 run.py 里加 /api/revenue-growth-rate
bp = Blueprint("revenue_growth_rate", __name__)


# =========================
#         Dataclasses
# =========================

@dataclass
class Department:
    id: str
    name: str


@dataclass
class Doctor:
    id: str
    name: str
    departmentId: Optional[str] = None
    departmentName: Optional[str] = None


@dataclass
class GrowthMetric:
    value: float        # 本期 vs 去年同期的增长率（百分数）
    yoyChange: float    # 同比（百分数）
    momChange: float    # 环比（百分数）


@dataclass
class SummaryData:
    outpatientMedicalCostGrowthRate: GrowthMetric
    emergencyMedicalCostGrowthRate: GrowthMetric
    outpatientRevenueGrowthRate: GrowthMetric
    emergencyRevenueGrowthRate: GrowthMetric


@dataclass
class DetailRow:
    id: str
    date: str
    doctorName: str
    doctorCode: str
    department: str
    itemName: str
    itemCode: str
    itemClassName: str
    outpatientAmount: float
    emergencyAmount: float
    totalCosts: float
    patientCount: int


@dataclass
class TrendRow:
    date: str
    outpatientMedicalCostGrowthRate: float
    emergencyMedicalCostGrowthRate: float
    outpatientRevenueGrowthRate: float
    emergencyRevenueGrowthRate: float


# =========================
#           Repo
# =========================

class RevenueGrowthRateRepo:
    """
    数据访问层：
    - 历史数据（< CURRENT_DATE）：视图 t_dep_income_outp
    - 当天及以后（>= CURRENT_DATE）：表 t_workload_outp_f
    当前只有门诊数据，所以所有金额都算在“门诊”，急诊为 0。
    """

    # ---------- 通用列表 ----------

    @staticmethod
    def get_departments() -> List[Department]:
        cache_key = "revenue_growth_rate:departments"
        cached = cache_get(cache_key)
        if cached is not None:
            return cached

        conn = get_conn()
        try:
            with conn.cursor() as cur:
                sql = """
                SELECT DISTINCT 
                  "绩效科室ID"   AS id,
                  "绩效科室名称" AS name
                FROM t_workload_doc_2dep_def
                WHERE "在岗状态" = '在岗'
                ORDER BY "绩效科室名称";
                """
                cur.execute(sql)
                rows = [Department(id=r[0], name=r[1]) for r in cur.fetchall()]

            cache_set(cache_key, rows, ttl_seconds=600)
            return rows
        finally:
            put_conn(conn)

    @staticmethod
    def get_doctors() -> List[Doctor]:
        cache_key = "revenue_growth_rate:doctors"
        cached = cache_get(cache_key)
        if cached is not None:
            return cached

        conn = get_conn()
        try:
            with conn.cursor() as cur:
                sql = """
                SELECT DISTINCT 
                  d."工号"          AS id,
                  d."姓名"          AS name,
                  d."绩效科室ID"    AS department_id,
                  d."绩效科室名称"  AS department_name
                FROM t_workload_doc_2dep_def d
                WHERE d."在岗状态" = '在岗'
                ORDER BY d."姓名";
                """
                cur.execute(sql)
                rows = [
                    Doctor(
                        id=r[0],
                        name=r[1],
                        departmentId=r[2],
                        departmentName=r[3],
                    )
                    for r in cur.fetchall()
                ]

            cache_set(cache_key, rows, ttl_seconds=600)
            return rows
        finally:
            put_conn(conn)

    # ---------- 过滤构造 ----------

    @staticmethod
    def _build_filters_for_table(
        department_ids: Optional[List[str]],
        doctor_ids: Optional[List[str]],
    ) -> (str, List[Any]):
        """
        用在 t_workload_outp_f 上的过滤（医生 + 绩效科室）。
        """
        conds: List[str] = []
        params: List[Any] = []

        if department_ids:
            conds.append('doc."绩效科室ID" = ANY(%s)')
            params.append(department_ids)

        if doctor_ids:
            conds.append("t.ordered_by_doctor = ANY(%s)")
            params.append(doctor_ids)

        where_sql = ""
        if conds:
            where_sql = " AND " + " AND ".join(conds)

        return where_sql, params

    @staticmethod
    def _build_filters_for_view(
        department_ids: Optional[List[str]],
    ) -> (str, List[Any]):
        """
        用在 t_dep_income_outp 上的过滤（绩效科室）。
        视图字段：dep_code -> t_workload_dep_def2his."HIS科室编码"
        """
        conds: List[str] = []
        params: List[Any] = []

        if department_ids:
            conds.append('d."绩效科室ID" = ANY(%s)')
            params.append(department_ids)

        where_sql = ""
        if conds:
            where_sql = " AND " + " AND ".join(conds)

        return where_sql, params

    # ---------- 明细（只查表） ----------

    @staticmethod
    def get_detail_rows(
        start: date,
        end: date,
        department_ids: Optional[List[str]],
        doctor_ids: Optional[List[str]],
    ) -> List[DetailRow]:
        """
        明细仍然只查 t_workload_outp_f。
        当前只有门诊：
        - outpatientAmount = SUM(charges)
        - emergencyAmount  = 0
        - totalCosts       = SUM(charges)
        """
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                filter_sql, filter_params = RevenueGrowthRateRepo._build_filters_for_table(
                    department_ids, doctor_ids
                )

                sql = f"""
                SELECT 
                  t.visit_date AS date,
                  t.ordered_by_doctor AS doctor_code,
                  COALESCE(doc."姓名", '') AS doctor_name,
                  COALESCE(doc."绩效科室名称", '') AS department,
                  t.item_name,
                  t.item_code,
                  t.item_class_name,
                  SUM(t.charges) AS outpatient_amount,   -- 全部记为门诊
                  0               AS emergency_amount,   -- 当前无急诊
                  SUM(t.charges) AS total_charges,
                  COUNT(DISTINCT t.patient_id) AS patient_count
                FROM t_workload_outp_f t
                LEFT JOIN t_workload_doc_2dep_def doc 
                  ON t.ordered_by_doctor = doc."工号"
                WHERE t.visit_date BETWEEN %s AND %s
                {filter_sql}
                GROUP BY 
                  t.visit_date,
                  t.ordered_by_doctor, doc."姓名", doc."绩效科室名称",
                  t.item_name, t.item_code, t.item_class_name
                ORDER BY t.visit_date DESC, doctor_code;
                """

                params: List[Any] = [start, end]
                params.extend(filter_params)
                cur.execute(sql, params)

                rows: List[DetailRow] = []
                for r in cur.fetchall():
                    rows.append(
                        DetailRow(
                            id=str(uuid.uuid4()),
                            date=r[0].strftime("%Y-%m-%d"),
                            doctorCode=r[1],
                            doctorName=r[2],
                            department=r[3],
                            itemName=r[4],
                            itemCode=r[5],
                            itemClassName=r[6],
                            outpatientAmount=float(r[7] or 0),
                            emergencyAmount=float(r[8] or 0),
                            totalCosts=float(r[9] or 0),
                            patientCount=int(r[10] or 0),
                        )
                    )

                return rows
        finally:
            put_conn(conn)

    # ---------- 汇总（历史视图 + 当天表） ----------

    @staticmethod
    def get_aggregated_totals(
        start: date,
        end: date,
        department_ids: Optional[List[str]],
        doctor_ids: Optional[List[str]],
    ) -> Dict[str, float]:
        """
        汇总一个时间段内的门诊医药费用(charges) 和 门诊收入(amount)。
        当前只有门诊数据：
        - outpatient_* 有值
        - emergency_* 全为 0
        """
        today = date.today()
        totals = {
            "outpatient_medical_costs": 0.0,
            "emergency_medical_costs": 0.0,
            "outpatient_revenue": 0.0,
            "emergency_revenue": 0.0,
        }

        conn = get_conn()
        try:
            with conn.cursor() as cur:

                # 1) 有医生筛选：全程查表 t_workload_outp_f
                if doctor_ids:
                    filter_sql, filter_params = RevenueGrowthRateRepo._build_filters_for_table(
                        department_ids, doctor_ids
                    )
                    sql = f"""
                    SELECT
                      SUM(t.charges) AS outpatient_medical_costs,
                      SUM(t.amount)  AS outpatient_revenue
                    FROM t_workload_outp_f t
                    LEFT JOIN t_workload_doc_2dep_def doc 
                      ON t.ordered_by_doctor = doc."工号"
                    WHERE t.visit_date BETWEEN %s AND %s
                    {filter_sql};
                    """
                    params: List[Any] = [start, end]
                    params.extend(filter_params)
                    cur.execute(sql, params)
                    row = cur.fetchone() or (0, 0)
                    return {
                        "outpatient_medical_costs": float(row[0] or 0),
                        "emergency_medical_costs": 0.0,
                        "outpatient_revenue": float(row[1] or 0),
                        "emergency_revenue": 0.0,
                    }

                # 2) 无医生筛选：历史视图 + 当天表

                # 2-1 历史部分：视图 t_dep_income_outp（rcpt_date < CURRENT_DATE）
                if start < today:
                    hist_start = start
                    hist_end = min(end, today - timedelta(days=1))

                    filter_sql, filter_params = RevenueGrowthRateRepo._build_filters_for_view(
                        department_ids
                    )

                    sql_hist = f"""
                    SELECT
                      SUM(v.charges) AS outpatient_medical_costs,
                      SUM(v.amount)  AS outpatient_revenue
                    FROM t_dep_income_outp v
                    LEFT JOIN t_workload_dep_def2his d
                      ON d."HIS科室编码" = v.dep_code
                    WHERE v.rcpt_date BETWEEN %s AND %s
                    {filter_sql};
                    """
                    params_hist: List[Any] = [hist_start, hist_end]
                    params_hist.extend(filter_params)
                    cur.execute(sql_hist, params_hist)
                    row = cur.fetchone() or (0, 0)
                    totals["outpatient_medical_costs"] += float(row[0] or 0)
                    totals["outpatient_revenue"] += float(row[1] or 0)

                # 2-2 当前部分：表 t_workload_outp_f（visit_date >= CURRENT_DATE）
                if end >= today:
                    curr_start = max(start, today)
                    curr_end = end

                    filter_sql2, filter_params2 = RevenueGrowthRateRepo._build_filters_for_view(
                        department_ids
                    )

                    sql_curr = f"""
                    SELECT
                      SUM(t.charges) AS outpatient_medical_costs,
                      SUM(t.amount)  AS outpatient_revenue
                    FROM t_workload_outp_f t
                    LEFT JOIN t_workload_dep_def2his d
                      ON d."HIS科室编码" = t.ordered_by
                    WHERE t.visit_date BETWEEN %s AND %s
                    {filter_sql2};
                    """
                    params_curr: List[Any] = [curr_start, curr_end]
                    params_curr.extend(filter_params2)
                    cur.execute(sql_curr, params_curr)
                    row = cur.fetchone() or (0, 0)
                    totals["outpatient_medical_costs"] += float(row[0] or 0)
                    totals["outpatient_revenue"] += float(row[1] or 0)

                # 急诊为 0
                return totals
        finally:
            put_conn(conn)

    # ---------- 趋势（历史视图 + 当天表，按天） ----------

    @staticmethod
    def get_trend_daily_totals(
        start: date,
        end: date,
        department_ids: Optional[List[str]],
        doctor_ids: Optional[List[str]],
    ) -> List[Dict[str, Any]]:
        """
        趋势基础数据：
        当前只有门诊数据：
        - outpatient_* 按天汇总 charges / amount
        - emergency_*  统一为 0
        """
        today = date.today()
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                rows_map: Dict[date, Dict[str, float]] = {}

                # 1) 有医生筛选：全程查表
                if doctor_ids:
                    filter_sql, filter_params = RevenueGrowthRateRepo._build_filters_for_table(
                        department_ids, doctor_ids
                    )
                    sql = f"""
                    SELECT 
                      t.visit_date AS date,
                      SUM(t.charges) AS outpatient_medical_costs,
                      SUM(t.amount)  AS outpatient_revenue
                    FROM t_workload_outp_f t
                    LEFT JOIN t_workload_doc_2dep_def doc 
                      ON t.ordered_by_doctor = doc."工号"
                    WHERE t.visit_date BETWEEN %s AND %s
                    {filter_sql}
                    GROUP BY t.visit_date
                    ORDER BY t.visit_date;
                    """
                    params: List[Any] = [start, end]
                    params.extend(filter_params)
                    cur.execute(sql, params)
                    for r in cur.fetchall():
                        rows_map[r[0]] = {
                            "outpatient_medical_costs": float(r[1] or 0),
                            "emergency_medical_costs": 0.0,
                            "outpatient_revenue": float(r[2] or 0),
                            "emergency_revenue": 0.0,
                        }
                else:
                    # 2) 无医生筛选：历史视图 + 当天表

                    # 2-1 历史：视图 t_dep_income_outp
                    if start < today:
                        hist_start = start
                        hist_end = min(end, today - timedelta(days=1))

                        filter_sql, filter_params = RevenueGrowthRateRepo._build_filters_for_view(
                            department_ids
                        )
                        sql_hist = f"""
                        SELECT 
                          v.rcpt_date AS date,
                          SUM(v.charges) AS outpatient_medical_costs,
                          SUM(v.amount)  AS outpatient_revenue
                        FROM t_dep_income_outp v
                        LEFT JOIN t_workload_dep_def2his d
                          ON d."HIS科室编码" = v.dep_code
                        WHERE v.rcpt_date BETWEEN %s AND %s
                        {filter_sql}
                        GROUP BY v.rcpt_date
                        ORDER BY v.rcpt_date;
                        """
                        params_hist: List[Any] = [hist_start, hist_end]
                        params_hist.extend(filter_params)
                        cur.execute(sql_hist, params_hist)
                        for r in cur.fetchall():
                            rows_map[r[0]] = {
                                "outpatient_medical_costs": float(r[1] or 0),
                                "emergency_medical_costs": 0.0,
                                "outpatient_revenue": float(r[2] or 0),
                                "emergency_revenue": 0.0,
                            }

                    # 2-2 当前：表 t_workload_outp_f
                    if end >= today:
                        curr_start = max(start, today)
                        curr_end = end

                        filter_sql2, filter_params2 = RevenueGrowthRateRepo._build_filters_for_view(
                            department_ids
                        )
                        sql_curr = f"""
                        SELECT 
                          t.visit_date AS date,
                          SUM(t.charges) AS outpatient_medical_costs,
                          SUM(t.amount)  AS outpatient_revenue
                        FROM t_workload_outp_f t
                        LEFT JOIN t_workload_dep_def2his d
                          ON d."HIS科室编码" = t.ordered_by
                        WHERE t.visit_date BETWEEN %s AND %s
                        {filter_sql2}
                        GROUP BY t.visit_date
                        ORDER BY t.visit_date;
                        """
                        params_curr: List[Any] = [curr_start, curr_end]
                        params_curr.extend(filter_params2)
                        cur.execute(sql_curr, params_curr)
                        for r in cur.fetchall():
                            rows_map[r[0]] = {
                                "outpatient_medical_costs": float(r[1] or 0),
                                "emergency_medical_costs": 0.0,
                                "outpatient_revenue": float(r[2] or 0),
                                "emergency_revenue": 0.0,
                            }

                # 按日期排序输出
                result: List[Dict[str, Any]] = []
                for dt in sorted(rows_map.keys()):
                    val = rows_map[dt]
                    result.append(
                        {
                            "date": dt,
                            "outpatient_medical_costs": val["outpatient_medical_costs"],
                            "emergency_medical_costs": val["emergency_medical_costs"],
                            "outpatient_revenue": val["outpatient_revenue"],
                            "emergency_revenue": val["emergency_revenue"],
                        }
                    )
                return result
        finally:
            put_conn(conn)


# =========================
#          Service
# =========================

class RevenueGrowthRateService:
    @staticmethod
    def calc_pct(curr: float, prev: float) -> float:
        """
        使用 safe_pct_change 计算百分比。
        无法计算时（前值 0 / None），返回 0，避免前端报错。
        """
        r = safe_pct_change(curr, prev)
        if r is None:
            return 0.0
        return float(r * 100)

    @staticmethod
    def calc_periods(start: date, end: date) -> Dict[str, Dict[str, date]]:
        """
        根据当前区间推算：
        - current：当前
        - yoy：去年同期
        - mom：上一周期（长度相同，紧前）
        """
        if end < start:
            raise ValueError("end_date must be >= start_date")

        days = (end - start).days

        yoy_start = date(start.year - 1, start.month, start.day)
        yoy_end = date(end.year - 1, end.month, end.day)

        mom_end = start - timedelta(days=1)
        mom_start = mom_end - timedelta(days=days)

        return {
            "current": {"start": start, "end": end},
            "yoy": {"start": yoy_start, "end": yoy_end},
            "mom": {"start": mom_start, "end": mom_end},
        }

    @staticmethod
    def get_summary(
        start: date,
        end: date,
        department_ids: Optional[List[str]],
        doctor_ids: Optional[List[str]],
    ) -> SummaryData:
        periods = RevenueGrowthRateService.calc_periods(start, end)

        cur_totals = RevenueGrowthRateRepo.get_aggregated_totals(
            periods["current"]["start"], periods["current"]["end"],
            department_ids, doctor_ids
        )
        yoy_totals = RevenueGrowthRateRepo.get_aggregated_totals(
            periods["yoy"]["start"], periods["yoy"]["end"],
            department_ids, doctor_ids
        )
        mom_totals = RevenueGrowthRateRepo.get_aggregated_totals(
            periods["mom"]["start"], periods["mom"]["end"],
            department_ids, doctor_ids
        )

        # 门诊医药费用增长率
        omc_yoy = RevenueGrowthRateService.calc_pct(
            cur_totals["outpatient_medical_costs"],
            yoy_totals["outpatient_medical_costs"],
        )
        omc_mom = RevenueGrowthRateService.calc_pct(
            cur_totals["outpatient_medical_costs"],
            mom_totals["outpatient_medical_costs"],
        )

        # 急诊现在没有数据，计算出来也会是 0
        emc_yoy = RevenueGrowthRateService.calc_pct(
            cur_totals["emergency_medical_costs"],
            yoy_totals["emergency_medical_costs"],
        )
        emc_mom = RevenueGrowthRateService.calc_pct(
            cur_totals["emergency_medical_costs"],
            mom_totals["emergency_medical_costs"],
        )

        # 门诊收入增长率
        or_yoy = RevenueGrowthRateService.calc_pct(
            cur_totals["outpatient_revenue"],
            yoy_totals["outpatient_revenue"],
        )
        or_mom = RevenueGrowthRateService.calc_pct(
            cur_totals["outpatient_revenue"],
            mom_totals["outpatient_revenue"],
        )

        # 急诊收入（现阶段为 0）
        er_yoy = RevenueGrowthRateService.calc_pct(
            cur_totals["emergency_revenue"],
            yoy_totals["emergency_revenue"],
        )
        er_mom = RevenueGrowthRateService.calc_pct(
            cur_totals["emergency_revenue"],
            mom_totals["emergency_revenue"],
        )

        return SummaryData(
            outpatientMedicalCostGrowthRate=GrowthMetric(
                value=omc_yoy, yoyChange=omc_yoy, momChange=omc_mom
            ),
            emergencyMedicalCostGrowthRate=GrowthMetric(
                value=emc_yoy, yoyChange=emc_yoy, momChange=emc_mom
            ),
            outpatientRevenueGrowthRate=GrowthMetric(
                value=or_yoy, yoyChange=or_yoy, momChange=or_mom
            ),
            emergencyRevenueGrowthRate=GrowthMetric(
                value=er_yoy, yoyChange=er_yoy, momChange=er_mom
            ),
        )

    @staticmethod
    def get_detail(
        start: date,
        end: date,
        department_ids: Optional[List[str]],
        doctor_ids: Optional[List[str]],
    ) -> Dict[str, Any]:
        rows = RevenueGrowthRateRepo.get_detail_rows(
            start, end, department_ids, doctor_ids
        )
        return {
            "rows": [asdict(r) for r in rows],
            "total": len(rows),
        }

    @staticmethod
    def get_trend(
        start: date,
        end: date,
        department_ids: Optional[List[str]],
        doctor_ids: Optional[List[str]],
    ) -> List[TrendRow]:
        base_rows = RevenueGrowthRateRepo.get_trend_daily_totals(
            start, end, department_ids, doctor_ids
        )

        trend_rows: List[TrendRow] = []
        prev = None
        for r in base_rows:
            if prev is None:
                # 第一条记录无前值，统一返回 0
                omc = emc = orate = erate = 0.0
            else:
                omc = RevenueGrowthRateService.calc_pct(
                    r["outpatient_medical_costs"], prev["outpatient_medical_costs"]
                )
                emc = RevenueGrowthRateService.calc_pct(
                    r["emergency_medical_costs"], prev["emergency_medical_costs"]
                )
                orate = RevenueGrowthRateService.calc_pct(
                    r["outpatient_revenue"], prev["outpatient_revenue"]
                )
                erate = RevenueGrowthRateService.calc_pct(
                    r["emergency_revenue"], prev["emergency_revenue"]
                )

            trend_rows.append(
                TrendRow(
                    date=r["date"].strftime("%Y-%m-%d"),
                    outpatientMedicalCostGrowthRate=omc,
                    emergencyMedicalCostGrowthRate=emc,
                    outpatientRevenueGrowthRate=orate,
                    emergencyRevenueGrowthRate=erate,
                )
            )
            prev = r

        return trend_rows


# =========================
#           Routes
# =========================

def _parse_common_body(json_data: dict):
    ok, missing = require_params(json_data, ["start_date", "end_date"])
    if not ok:
        return None, jsonify({
            "success": False,
            "data": None,
            "message": f"缺少必填参数: {', '.join(missing)}",
            "code": 400,
        }), 400

    start = parse_date_generic(json_data.get("start_date"))
    end = parse_date_generic(json_data.get("end_date"))
    if not start or not end:
        return None, jsonify({
            "success": False,
            "data": None,
            "message": "日期格式不正确，必须是 YYYY-MM-DD",
            "code": 400,
        }), 400

    department_ids = json_data.get("department_ids") or []
    doctor_ids = json_data.get("doctor_ids") or []

    if not department_ids:
        department_ids = None
    if not doctor_ids:
        doctor_ids = None

    return (start, end, department_ids, doctor_ids), None, None


@bp.route("/init", methods=["GET"])
def init_data():
    try:
        deps = RevenueGrowthRateRepo.get_departments()
        docs = RevenueGrowthRateRepo.get_doctors()

        data = {
            "departments": [asdict(d) for d in deps],
            "doctors": [asdict(d) for d in docs],
        }

        return jsonify({
            "success": True,
            "data": data,
            "message": "ok",
            "code": 0,
        })
    except Exception as e:
        logger.exception("Error in /init")
        return jsonify({
            "success": False,
            "data": None,
            "message": str(e),
            "code": 500,
        }), 500


@bp.route("/summary", methods=["POST"])
def summary():
    try:
        json_data = request.get_json() or {}
        parsed, resp, status = _parse_common_body(json_data)
        if resp is not None:
            return resp, status

        start, end, department_ids, doctor_ids = parsed
        summary_data = RevenueGrowthRateService.get_summary(
            start, end, department_ids, doctor_ids
        )
        return jsonify({
            "success": True,
            "data": asdict(summary_data),
            "message": "ok",
            "code": 0,
        })
    except Exception as e:
        logger.exception("Error in /summary")
        return jsonify({
            "success": False,
            "data": None,
            "message": str(e),
            "code": 500,
        }), 500


@bp.route("/details", methods=["POST"])
def details():
    try:
        json_data = request.get_json() or {}
        parsed, resp, status = _parse_common_body(json_data)
        if resp is not None:
            return resp, status

        start, end, department_ids, doctor_ids = parsed
        data = RevenueGrowthRateService.get_detail(
            start, end, department_ids, doctor_ids
        )
        return jsonify({
            "success": True,
            "data": data,
            "message": "ok",
            "code": 0,
        })
    except Exception as e:
        logger.exception("Error in /details")
        return jsonify({
            "success": False,
            "data": None,
            "message": str(e),
            "code": 500,
        }), 500


@bp.route("/timeseries", methods=["POST"])
def timeseries():
    try:
        json_data = request.get_json() or {}
        parsed, resp, status = _parse_common_body(json_data)
        if resp is not None:
            return resp, status

        start, end, department_ids, doctor_ids = parsed
        rows = RevenueGrowthRateService.get_trend(
            start, end, department_ids, doctor_ids
        )
        return jsonify({
            "success": True,
            "data": {"rows": [asdict(r) for r in rows]},
            "message": "ok",
            "code": 0,
        })
    except Exception as e:
        logger.exception("Error in /timeseries")
        return jsonify({
            "success": False,
            "data": None,
            "message": str(e),
            "code": 500,
        }), 500
