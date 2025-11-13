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
    明细：直接调用 Repository（Repository 里已经做了 COUNT(*) OVER 优化）
    """
    return repo.get_revenue_details(start, end, departments, limit=limit, offset=offset)


def get_revenue_timeseries(start, end, departments=None):
    """
    趋势：直接调用 Repository
    """
    return repo.get_revenue_timeseries(start, end, departments)


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
