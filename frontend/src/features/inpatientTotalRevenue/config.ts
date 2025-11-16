// src/features/inpatientTotalRevenue/config.ts

import type { Column } from "../../components/common/DataTable";
import type { DetailsRow } from "./types";

//
// 分页 & 默认行为
//
export const INPATIENT_ROWS_PER_PAGE = 20;

// 趋势图对比模式：同比 / 环比
export const INPATIENT_DEFAULT_COMPARE: "yoy" | "mom" = "yoy";

// 明细表默认排序
export const INPATIENT_DEFAULT_SORT_KEY:
  | "date"
  | "department"
  | "doctor"
  | "revenue"
  | "revenue_yoy"
  | "revenue_mom" = "date";

export const INPATIENT_DEFAULT_SORT_DIR: "asc" | "desc" = "desc";

// 页面默认视图：明细表 / 趋势图
export const INPATIENT_DEFAULT_VIEW_MODE: "details" | "chart" = "details";

//
// 汇总卡片配置（总收入 / 收入同比 / 收入环比 / 床日同比 / 床日环比）
// 对应 SummaryViewModel 上的字段：
//   - total_revenue
//   - yoy_growth_rate
//   - mom_growth_rate
//   - bed_day_growth_rate
//   - bed_day_mom_growth_rate
//
export type SummaryFieldKey =
  | "total_revenue"
  | "yoy_growth_rate"
  | "mom_growth_rate"
  | "bed_day_growth_rate"
  | "bed_day_mom_growth_rate";

export interface SummaryIndicatorConfig {
  key: SummaryFieldKey;
  title: string;
  color: string;
  description: string;
  format: "number" | "percent";
}

export const INPATIENT_SUMMARY_INDICATORS: SummaryIndicatorConfig[] = [
  {
    key: "total_revenue",
    title: "总收入",
    color: "#2563eb",
    description: "当前筛选条件下的总收入（元）",
    format: "number",
  },
  {
    key: "yoy_growth_rate",
    title: "收入同比增长",
    color: "#16a34a",
    description: "收入相对去年同期的变化情况",
    format: "percent",
  },
  {
    key: "mom_growth_rate",
    title: "收入环比增长",
    color: "#7c3aed",
    description: "收入相对上一周期的变化情况",
    format: "percent",
  },
  {
    key: "bed_day_growth_rate",
    title: "床日同比增长",
    color: "#f59e0b",
    description: "床日数相对去年同期的变化情况",
    format: "percent",
  },
  {
    key: "bed_day_mom_growth_rate",
    title: "床日环比增长",
    color: "#d946ef",
    description: "床日数相对上一周期的变化情况",
    format: "percent",
  },
];

//
// 趋势图标题配置（同比 / 环比）
// 被 TrendSection.tsx 使用：INPATIENT_TREND_TITLE[compare]
//
export const INPATIENT_TREND_TITLE: Record<"yoy" | "mom", string> = {
  yoy: "收入与床日同比趋势",
  mom: "收入与床日环比趋势",
};

//
// （可选）如果有地方还在用表格列定义，可以在这里保留一份简单的列配置。
// 现在我们的 DetailsSection 已经自己根据数据动态生成列了，所以可以不导出表格列。
// 下面示例仅供需要时使用：
//

// 默认简单列：日期 / 科室 / 收入
export const INPATIENT_DETAIL_COLUMNS_BASE: Column<DetailsRow>[] = [
  {
    key: "date",
    title: "日期",
    render: (row) => row.date || "-",
  },
  {
    key: "department_name",
    title: "科室",
    render: (row) => row.department_name || row.department_code || "—",
  },
  {
    key: "revenue",
    title: "收入（元）",
    className:
      "px-6 py-4 whitespace-nowrap text-sm text-right text-gray-700",
    headerClassName:
      "px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider",
    render: (row) => {
      const raw = row.revenue ?? row.cost ?? null;
      if (raw == null) return "-";
      const n =
        typeof raw === "number"
          ? raw
          : Number(String(raw).replace(/[\s,]/g, ""));
      if (!Number.isFinite(n)) return "-";
      return n.toLocaleString();
    },
  },
];
