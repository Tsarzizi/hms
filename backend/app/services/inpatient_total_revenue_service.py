import logging
from datetime import date
from typing import Any, Dict, List, Optional

from ..repositories.inpatient_total_revenue_repository import (
    InpatientTotalRevenueRepository,
)

logger = logging.getLogger("inpatient_total_revenue.service")

_repo = InpatientTotalRevenueRepository()


def get_dep_doc_map() -> List[Dict[str, Any]]:
    """
    简单封装：返回科室 + 医生映射，用于前端初始化。
    """
    return _repo.get_dep_doc_map()


def get_full_revenue(
    start: date,
    end: date,
    departments: Optional[List[str]] = None,
    doctors: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    统一查询入口，直接转调 Repository：
    - start / end：日期（end 为「开区间」，一般为 查询结束日期 + 1 天）
    - departments：绩效科室名称列表（可空）
    - doctors：医生工号列表（可空）
    """
    logger.info(
        "get_full_revenue | start=%s end=%s departments=%s doctors=%s",
        start,
        end,
        departments,
        doctors,
    )
    return _repo.get_full_revenue(start, end, departments, doctors)
