import logging
from datetime import timedelta, date
from decimal import Decimal

from ..repositories.inpatient_total_revenue_repository import (
    InpatientTotalRevenueRepository, _norm_deps,
)
from ..utils.inpatient_total_revenue_numbers import safe_pct_change

logger = logging.getLogger("inpatient_total_revenue.service")

# ---- Decimal 常量 ----
DEC_0 = Decimal("0")
DEC_100 = Decimal("100")
DEC_POS_EPS = Decimal("0.0001")
DEC_NEG_EPS = Decimal("-0.0001")
repo = InpatientTotalRevenueRepository()


def _shift_one_year(d: date) -> date:
    """
    把日期往前平移一年：
    - 大部分日期可以直接用 replace(year - 1)
    - 遇到闰年的 2 月 29 日，上一年没有 2 月 29，就退到 2 月 28
    """
    try:
        # 绝大多数日期都能直接成功
        return d.replace(year=d.year - 1)
    except ValueError:
        # 比如 2024-02-29 → 2023-02-28
        # 处理方式：先把 day 调成 28 再减一年
        if d.month == 2 and d.day == 29:
            return d.replace(year=d.year - 1, month=2, day=28)
        # 理论上不会再走到这里，再做一个保底：直接减 365 天
        return d - timedelta(days=365)


def get_departments():
    """
    初始化科室列表：直接调用 Repository.get_departments
    返回: [{"code": "...", "name": "..."}, ...]
    """
    return repo.get_departments()


def get_doctors():
    """
    初始化医生列表：直接调用 Repository.get_doctors
    返回: [{"doc_id", "doc_name", "dep_id", "dep_name"}, ...]
    """
    return repo.get_doctors()


def get_revenue_details(start, end=None, departments=None, doctor_ids=None):
    """
    明细接口服务层：
    - 支持科室筛选（departments）和医生筛选（doctor_ids）
    - Repository 负责：
        * 按日期拆分历史 / 实时
        * 历史部分走物化视图 t_dep_income_inp / t_doc_fee_inp
        * 实时部分走原始表 t_workload_inp_f
        * 所有情况都按 item_class_name 聚合求总收入 (revenue) 和总数量 (quantity)
    - 这里不再计算明细级别的同比/环比和床日，直接把 Repository 的结果返回给路由层
    """
    return repo.get_revenue_details(start, end, departments, doctor_ids)


def get_revenue_details_bak(start, end=None, departments=None, doctors=None):
    """
    明细接口 Service 层：

    - 负责处理默认 end（单日 → [start, start+1)）
    - 调用 Repository.get_revenue_details 得到原始行
    - 统一格式返回给 routes /details
    """
    if end is None:
        end = start + timedelta(days=1)

    raw_rows = repo.get_revenue_details(start, end, departments, doctors)

    rows_out = []
    for r in raw_rows:
        rows_out.append({
            "date": r.get("date"),
            "department_name": r.get("department_name"),
            # 下面字段在不同筛选模式下可能为 None
            "doctor_name": r.get("doctor_name"),
            "item_class_name": r.get("item_class_name"),
            "revenue": float(r.get("revenue") or 0.0),
            "quantity": (
                float(r.get("quantity"))
                if r.get("quantity") is not None
                else None
            ),
        })

    return {"rows": rows_out, "total": len(rows_out)}


def get_revenue_timeseries(start, end, departments=None):
    """
    趋势：
    - Repository 只查每日的收入/床日（当前/去年/上一期）原始值
    - 这里负责算收入/床日的同比、环比百分比，保持前端字段不变
    """
    raw_rows = repo.get_revenue_timeseries(start, end, departments)

    rows_out = []
    for r in raw_rows:
        rev = Decimal(str(r.get("revenue") or "0"))
        ly = Decimal(str(r.get("last_year") or "0"))
        prev = Decimal(str(r.get("prev_period") or "0"))
        bed = Decimal(str(r.get("bed_value") or "0"))
        bed_ly = Decimal(str(r.get("bed_last_year") or "0"))
        bed_prev = Decimal(str(r.get("bed_prev_period") or "0"))

        yoy = safe_pct_change(rev, ly)
        mom = safe_pct_change(rev, prev)
        bed_yoy = safe_pct_change(bed, bed_ly)
        bed_mom = safe_pct_change(bed, bed_prev)

        rows_out.append({
            "date": r.get("date"),
            # 数值统一保留两位小数
            "revenue": float(rev.quantize(Decimal("0.01"))) if rev is not None else 0.0,
            "last_year": float(ly.quantize(Decimal("0.01"))) if ly is not None else None,
            "prev_period": float(prev.quantize(Decimal("0.01"))) if prev is not None else None,
            "bed_value": float(bed.quantize(Decimal("0.01"))) if bed is not None else 0.0,
            "bed_last_year": float(bed_ly.quantize(Decimal("0.01"))) if bed_ly is not None else None,
            "bed_prev_period": float(bed_prev.quantize(Decimal("0.01"))) if bed_prev is not None else None,
            # 百分比字段，前端已经在用：12.34 表示 12.34%
            "yoy_pct": float(yoy * DEC_100) if yoy is not None else None,
            "mom_pct": float(mom * DEC_100) if mom is not None else None,
            "bed_yoy_pct": float(bed_yoy * DEC_100) if bed_yoy is not None else None,
            "bed_mom_pct": float(bed_mom * DEC_100) if bed_mom is not None else None,
        })

    return rows_out


def get_revenue_summary(start_date, end_date, departments=None):
    deps = _norm_deps(departments)
    logger.info("get_revenue_summary: %s ~ %s deps=%s", start_date, end_date, deps or "ALL")

    # 去年同期：同区间回退一年（闭区间/半开区间保持与下游SQL一致）
    ly_start = _shift_one_year(start_date)
    ly_end = _shift_one_year(end_date)

    # 同长度上一期：长度 = (end_date - start_date) + 1 天（按自然日长度），上一期结束为 start_date - 1 天
    _length_days = (end_date - start_date).days + 1
    prev_end = start_date - timedelta(days=1)
    prev_start = prev_end - timedelta(days=_length_days - 1)

    try:
        # —— 这里改成 Repository —— #
        total_curr = repo.get_total_charges(start_date, end_date, deps)
        total_ly = repo.get_total_charges(ly_start, ly_end, deps)
        total_prev = repo.get_total_charges(prev_start, prev_end, deps)

        bed_curr = repo.get_total_bed(start_date, end_date, deps)
        bed_ly = repo.get_total_bed(ly_start, ly_end, deps)
        bed_prev = repo.get_total_bed(prev_start, prev_end, deps)

        # 收入同比 / 环比（这里仍然用“元”的原始值来算，结果不受单位影响）
        rev_growth_pct = safe_pct_change(total_curr, total_ly)  # Decimal or None
        mom_growth_pct = safe_pct_change(total_curr, total_prev)

        # 床日同比 / 环比
        bed_growth_pct = safe_pct_change(bed_curr, bed_ly)
        bed_mom_growth_pct = safe_pct_change(bed_curr, bed_prev)

        # 趋势判断：沿用你原来的规则
        trend = "持平/未知"
        try:
            rev_g = rev_growth_pct or DEC_0
            bed_g = bed_growth_pct or DEC_0
            if rev_g > DEC_POS_EPS and bed_g > DEC_POS_EPS:
                trend = "同向"
            elif rev_g < DEC_NEG_EPS and bed_g < DEC_NEG_EPS:
                trend = "同向"
            elif (rev_g > DEC_POS_EPS and bed_g < DEC_NEG_EPS) or (rev_g < DEC_NEG_EPS and bed_g > DEC_POS_EPS):
                trend = "反向"
        except Exception:
            logger.exception("Error computing trend in get_revenue_summary")

        # —— 这里开始做“元 → 万元”的单位转换，只影响展示 —— #
        def _to_10k(v: Decimal | None) -> Decimal:
            if v is None:
                return DEC_0
            return (v / Decimal("10000")).quantize(Decimal("0.01"))

        total_curr_10k = _to_10k(total_curr)
        total_ly_10k = _to_10k(total_ly)
        total_prev_10k = _to_10k(total_prev)

        # 为前端准备 float %
        rev_growth_pct_f = (float(rev_growth_pct * DEC_100) if rev_growth_pct is not None else None)
        mom_growth_pct_f = (float(mom_growth_pct * DEC_100) if mom_growth_pct is not None else None)
        bed_growth_pct_f = (float(bed_growth_pct * DEC_100) if bed_growth_pct is not None else None)
        bed_mom_growth_pct_f = (float(bed_mom_growth_pct * DEC_100) if bed_mom_growth_pct is not None else None)

        return {
            "params": {
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "departments": deps,
            },
            "periods": {
                "current": {"start": start_date.isoformat(), "end": end_date.isoformat()},
                "last_year_same_period": {"start": ly_start.isoformat(), "end": ly_end.isoformat()},
                "previous_period_same_length": {"start": prev_start.isoformat(), "end": prev_end.isoformat()},
            },
            "revenue": {
                # ✅ 这里三项已经是“万元”，保留两位小数
                "current_total": float(total_curr_10k),
                "last_year_total": float(total_ly_10k),
                "previous_total": float(total_prev_10k),
                "growth_rate_pct": rev_growth_pct_f,
                "mom_growth_pct": mom_growth_pct_f,
                "unit": "万元",
            },
            "bed": {
                "growth_rate_pct": bed_growth_pct_f,
                "mom_growth_pct": bed_mom_growth_pct_f,
            },
            "bed_growth_pct": bed_growth_pct_f,
            "bed_mom_growth_pct": bed_mom_growth_pct_f,
            "trend": trend,
            "notes": [
                "收入单位：万元。",
                "同比 = 与去年同期同区间；环比 = 与同长度上一周期。",
                "床位数：实时(t_workload_inbed_reg_f) + 历史(t_dep_count_inbed<今天) 联合，仅用于趋势判断"
            ]
        }
    except Exception as e:
        logger.exception("Error computing revenue summary: %s", e)
        raise
