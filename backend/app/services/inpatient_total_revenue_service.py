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
    科室列表查询：委托给 Repository，保持返回结构不变。
    """
    return repo.get_departments()


def get_revenue_details(start, end=None, departments=None, limit=20, offset=0):
    """
    明细：
    - Repository 只查原始值（当前/去年/上一期收入 + 床日）
    - 这里负责算收入同比/环比、趋势等，再返回给路由/前端
    """
    raw = repo.get_revenue_details(start, end, departments, limit=limit, offset=offset)

    rows_out = []
    for r in raw["rows"]:
        # 原始值（仓储层已经把 Decimal/date 转成基本类型了）
        curr = Decimal(str(r.get("revenue_raw") or "0"))
        ly = Decimal(str(r.get("ly_revenue_raw") or "0"))
        prev = Decimal(str(r.get("prev_revenue_raw") or "0"))
        bed_curr = Decimal(str(r.get("bed_value") or "0"))
        bed_ly = Decimal(str(r.get("bed_last_year") or "0"))

        # 收入同比 / 环比（返回的是小数，例如 0.1234 表示 12.34%）
        rev_growth = safe_pct_change(curr, ly)
        rev_mom = safe_pct_change(curr, prev)

        # 床日同比，用于趋势判断
        bed_growth = safe_pct_change(bed_curr, bed_ly)

        # 趋势判断，沿用之前的逻辑
        trend = "持平/未知"
        try:
            rev_g = rev_growth if rev_growth is not None else DEC_0
            bed_g = bed_growth if bed_growth is not None else DEC_0
            if rev_g > DEC_POS_EPS and bed_g > DEC_POS_EPS:
                trend = "同向"
            elif rev_g < DEC_NEG_EPS and bed_g < DEC_NEG_EPS:
                trend = "同向"
            elif (rev_g > DEC_POS_EPS and bed_g < DEC_NEG_EPS) or (rev_g < DEC_NEG_EPS and bed_g > DEC_POS_EPS):
                trend = "反向"
        except Exception:
            logger.exception("Error computing trend in get_revenue_details")

        rows_out.append({
            "date": r.get("date"),
            "department_code": r.get("department_code"),
            "department_name": r.get("department_name"),
            # 收入本身保留两位小数
            "revenue": float(curr.quantize(Decimal("0.01"))),
            # 百分比：返回 12.34 表示 12.34%
            "revenue_growth_pct": float(rev_growth * DEC_100) if rev_growth is not None else None,
            "revenue_mom_growth_pct": float(rev_mom * DEC_100) if rev_mom is not None else None,
            "trend": trend,
        })

    return {
        "rows": rows_out,
        "total": raw.get("total", 0),
    }



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

        # 收入同比 / 环比
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
                "current_total": float(total_curr or 0),
                "last_year_total": float(total_ly or 0),
                "previous_total": float(total_prev or 0),
                "growth_rate_pct": rev_growth_pct_f,
                "mom_growth_pct": mom_growth_pct_f,
            },
            "bed": {
                "growth_rate_pct": bed_growth_pct_f,
                "mom_growth_pct": bed_mom_growth_pct_f,
            },
            "bed_growth_pct": bed_growth_pct_f,
            "bed_mom_growth_pct": bed_mom_growth_pct_f,
            "trend": trend,
            "notes": [
                "同比 = 与去年同期同区间；环比 = 与同长度上一周期。",
                "床位数：实时(t_workload_inbed_reg_f) + 历史(t_dep_count_inbed<今天) 联合，仅用于趋势判断"
            ]
        }
    except Exception as e:
        logger.exception("Error computing revenue summary: %s", e)
        raise
