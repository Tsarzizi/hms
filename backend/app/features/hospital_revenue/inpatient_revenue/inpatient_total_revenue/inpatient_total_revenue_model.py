# backend/app/models/inpatient_total_revenue_model.py

from __future__ import annotations
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional, Any, Dict, Union

# --------- 通用工具：dataclass → 可 JSON 的 dict ---------
Jsonable = Union[Dict[str, Any], List[Any], str, int, float, bool, None]


def to_jsonable(obj):
    from dataclasses import is_dataclass, asdict

    if obj is None:
        return None
    if isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    if isinstance(obj, list):
        return [to_jsonable(x) for x in obj]
    if isinstance(obj, dict):
        return {k: to_jsonable(v) for k, v in obj.items()}
    if is_dataclass(obj):
        return {k: to_jsonable(v) for k, v in asdict(obj).items()}
    return str(obj)



# --------- 基础结构 ---------

@dataclass
class Department:
    code: str  # 绩效科室ID 或 HIS 科室编码（看你后端当前语义）
    name: str  # 绩效科室名称


@dataclass
class DepartmentDoctor:
    doc_id: str
    doc_name: str
    dep_id: str
    dep_name: str


@dataclass
class RevenueSummary:
    current: float
    growth_rate: Optional[float] = None  # 总收入同比%
    mom_growth_rate: Optional[float] = None  # 总收入环比%
    bed_growth_rate: Optional[float] = None  # 床日同比%
    bed_mom_growth_rate: Optional[float] = None  # 床日环比%


# --------- INIT ---------

@dataclass
class InitPayload:
    date: date
    departments: List[Department]
    doctors: List[DepartmentDoctor]
    summary: Optional[RevenueSummary] = None


# --------- 明细 ---------

@dataclass
class DetailRow:
    date: date
    department_code: str
    department_name: str
    item_class_name: Optional[str]
    revenue: float
    quantity: float
    # 后端可以保留医生字段，但前端可以选择不展示
    doctor_id: Optional[str] = None
    doctor_name: Optional[str] = None


@dataclass
class DetailsResult:
    date_range_start: date
    date_range_end: date
    departments: Optional[List[str]]
    doctors: Optional[List[str]]
    rows: List[DetailRow]
    total: int


# --------- 趋势 ---------

@dataclass
class TimeseriesRow:
    date: date
    revenue: float
    last_year: Optional[float]
    yoy_pct: Optional[float]
    mom_pct: Optional[float]
    bed_yoy_pct: Optional[float] = None
    bed_mom_pct: Optional[float] = None


@dataclass
class TimeseriesResult:
    date_range_start: date
    date_range_end: date
    departments: Optional[List[str]]
    rows: List[TimeseriesRow]


# --------- 汇总 ---------

@dataclass
class SummaryResult:
    date_range_start: date
    date_range_end: date
    departments: Optional[List[str]]
    summary: RevenueSummary
