# backend/shared/calc_utils.py

from typing import Optional, Union, List, Dict

Number = Union[int, float, str, None]


# ========== 基础函数：前面你已经使用 ==========
def _safe_number(value: Number) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def calc_rate(current: Number, previous: Number) -> Optional[float]:
    """
    通用百分比变化计算函数：
        (current - previous) / previous * 100
    """
    cur = _safe_number(current)
    prev = _safe_number(previous)

    if cur is None or prev is None:
        return None
    if prev == 0:
        return None

    return (cur - prev) / prev * 100


def calc_mom(current: Number, previous: Number) -> Optional[float]:
    """环比"""
    return calc_rate(current, previous)


def calc_yoy(current: Number, previous_year: Number) -> Optional[float]:
    """同比"""
    return calc_rate(current, previous_year)


# ========== 批量计算器 ==========

def calc_trend_fields(
    current_row: Dict,
    prev_month_row: Dict,
    prev_year_row: Dict,
    fields: List[str]
) -> Dict:
    """
    对多个字段批量计算 环比(mom) & 同比(yoy)

    参数：
        current_row     - 本期数据 dict
        prev_month_row  - 上期数据 dict（可能为 None）
        prev_year_row   - 去年同期 dict（可能为 None）
        fields          - 要计算趋势的字段列表

    返回：
        包含原始字段 + 新增的 xxx_mom、xxx_yoy 字段
    """

    result = dict(current_row)  # 保留原始数据

    for field in fields:
        cur = current_row.get(field)
        prev_m = prev_month_row.get(field) if prev_month_row else None
        prev_y = prev_year_row.get(field) if prev_year_row else None

        result[f"{field}_mom"] = calc_mom(cur, prev_m)
        result[f"{field}_yoy"] = calc_yoy(cur, prev_y)

    return result
