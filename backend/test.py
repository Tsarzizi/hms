#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
简单的服务测试脚本，用来直接调用后端 service 方法。

用法示例：

1）测试汇总：
    python test.py --service summary --start 2025-11-01 --end 2025-11-15

2）测试明细：
    python test.py --service details --start 2025-11-10 --end 2025-11-15

3）测试趋势：
    python test.py --service timeseries --start 2025-11-01 --end 2025-11-15

4）测试医生费用（可指定医生工号）：
    python test.py --service doc_fee --start 2025-11-01 --end 2025-11-15 --docs 1001,1002

5）测试在院人数（科室维度）：
    python test.py --service dep_income --start 2025-11-01 --end 2025-11-15 --deps 0101,0201
"""

import argparse
import json
import logging
import sys
import time
from datetime import date, datetime
from pathlib import Path
from typing import List, Optional

# ========= 日志配置 =========
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# ========= 确保可以 import app.* =========
ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# 这里按你项目实际路径导入 service
try:
    from app.services.inpatient_total_revenue_service import (
        get_revenue_summary,
        get_revenue_details,
        get_revenue_timeseries,
        # 如果你已经在 service 里封装了这两个，请取消注释：
        # get_inp_doc_fee,
        # get_inp_dep_income,
    )
except ImportError:
    # 如果你的 service 文件不在 app.services 下，可以根据实际情况改 import 路径
    logger.exception("无法导入 app.services.inpatient_total_revenue_service，请检查项目结构和 PYTHONPATH。")
    sys.exit(1)


def parse_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    return date.fromisoformat(s)


def parse_csv(s: Optional[str]) -> Optional[List[str]]:
    if not s:
        return None
    out = [x.strip() for x in s.split(",") if x.strip()]
    return out or None


def pretty_print(obj):
    """以格式化 JSON 输出结果，避免一次性冲屏。"""
    try:
        text = json.dumps(obj, ensure_ascii=False, indent=2, default=str)
        print(text)
    except TypeError:
        # 有些对象（比如 Decimal）不支持直接序列化，先转成 str
        def default(o):
            try:
                return str(o)
            except Exception:
                return f"<unserializable {type(o)}>"

        text = json.dumps(obj, ensure_ascii=False, indent=2, default=default)
        print(text)


def main():
    parser = argparse.ArgumentParser(description="测试住院收入相关服务方法")

    parser.add_argument(
        "--service",
        required=True,
        choices=["summary", "details", "timeseries", "doc_fee", "dep_income"],
        help="要测试的服务类型",
    )
    parser.add_argument(
        "--start",
        help="开始日期（YYYY-MM-DD），默认：今天",
    )
    parser.add_argument(
        "--end",
        help="结束日期（YYYY-MM-DD，左闭右开），默认：start + 1 天",
    )
    parser.add_argument(
        "--deps",
        help="科室列表，逗号分隔，例如：0101,0201",
    )
    parser.add_argument(
        "--docs",
        help="医生工号列表，逗号分隔，例如：1001,1002（仅部分服务使用）",
    )

    args = parser.parse_args()

    start = parse_date(args.start) or date.today()
    if args.end:
        end = parse_date(args.end)
    else:
        # 默认 end = start + 1 天（和你后端 [start, end) 约定一致）
        end = start.fromordinal(start.toordinal() + 1)

    deps = parse_csv(args.deps)
    docs = parse_csv(args.docs)

    logger.info("准备调用 service=%s start=%s end=%s deps=%s docs=%s",
                args.service, start, end, deps, docs)

    t0 = time.perf_counter()
    try:
        if args.service == "summary":
            # 这里按你的签名来，如果 summary 暂时没有 doctors 参数，可以去掉 doctors=docs
            result = get_revenue_summary(start=start, end=end, departments=deps, doctors=docs)

        elif args.service == "details":
            # 同理，如果 details 没有 doctors 参数，就去掉 doctors=docs
            result = get_revenue_details(start=start, end=end, departments=deps, doctors=docs)

        elif args.service == "timeseries":
            # timeseries 一般只需要 start/end/deps
            result = get_revenue_timeseries(start=start, end=end, departments=deps)

        elif args.service == "doc_fee":
            # 这里假设你后面会在 service 里封装 repo.get_inp_doc_fee
            # from app.services.inpatient_total_revenue_service import get_inp_doc_fee
            from app.repositories.inpatient_total_revenue_repository import (
                InpatientTotalRevenueRepository,
            )

            repo = InpatientTotalRevenueRepository()
            result = repo.get_inp_doc_fee(start=start, end=end, doctors=docs)

        elif args.service == "dep_income":
            # 同理，这里直接调用 repository 层
            from app.repositories.inpatient_total_revenue_repository import (
                InpatientTotalRevenueRepository,
            )

            repo = InpatientTotalRevenueRepository()
            result = repo.get_inp_dep_income(start=start, end=end, departments=deps)

        else:
            raise ValueError(f"未知的 service 类型: {args.service}")

        t1 = time.perf_counter()
        elapsed = t1 - t0

        print("\n================= ✅ 调用成功 =================")
        print(f"服务类型: {args.service}")
        print(f"查询区间: {start} ~ {end} (左闭右开)")
        print(f"耗时: {elapsed:.3f} 秒")
        print("返回结果预览：\n")
        pretty_print(result)

    except Exception as e:
        t1 = time.perf_counter()
        elapsed = t1 - t0
        print("\n================= ❌ 调用失败 =================")
        print(f"服务类型: {args.service}")
        print(f"查询区间: {start} ~ {end} (左闭右开)")
        print(f"耗时: {elapsed:.3f} 秒")
        print("错误类型:", type(e).__name__)
        print("错误消息:", str(e))
        print("完整堆栈：")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    main()
