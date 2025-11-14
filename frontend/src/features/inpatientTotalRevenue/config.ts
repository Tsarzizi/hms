// src/features/inpatientTotalRevenue/config.ts

import type { Column } from "../../components/common/DataTable";
import type { DetailsRow } from "./types";
//
// 页面标题
//
//
// 分页 & 默认行为
//
export const INPATIENT_ROWS_PER_PAGE = 20;
export const INPATIENT_DEFAULT_COMPARE: "yoy" | "mom" = "yoy";
export const INPATIENT_DEFAULT_SORT_KEY = "date";
export const INPATIENT_DEFAULT_SORT_DIR: "asc" | "desc" = "desc";
export const INPATIENT_DEFAULT_VIEW_MODE: "details" | "chart" = "details";

//
// 明细表列定义（可复用、可配置）
//
export const INPATIENT_DETAIL_COLUMNS: Column<DetailsRow>[] = [
  {
    key: "date",
    title: "日期",
  },
  {
    key: "department_name",
    title: "科室",
    render: (row) => row.department_name || row.department_code,
  },
  {
    key: "doctor_name",
    title: "医生",
    render: (row) => row.doctor_name ?? "-",
  },
  {
    key: "revenue",
    title: "收入（元）",
    render: (row) => row.revenue.toLocaleString(),
    className:
      "px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900",
    headerClassName:
      "px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider",
  },
  {
    key: "revenue_growth_pct",
    title: "收入同比",
    render: (row) =>
      typeof row.revenue_growth_pct === "number"
        ? `${row.revenue_growth_pct.toFixed(1)}%`
        : "-",
  },
  {
    key: "revenue_mom_growth_pct",
    title: "收入环比",
    render: (row) =>
      typeof row.revenue_mom_growth_pct === "number"
        ? `${row.revenue_mom_growth_pct.toFixed(1)}%`
        : "-",
  },
];

//
// 趋势图颜色 & 图例配置
//
export const INPATIENT_TREND_TITLE = {
  yoy: "收入 & 床日同比趋势",
  mom: "收入 & 床日环比趋势",
};
export const PAGE_HEADER_CONFIG = {
  title: "住院收入分析",
  description: "查看住院收入的明细、同比与环比趋势",
};


// src/features/inpatientTotalRevenue/config.ts

// 汇总指标 key（要跟 summary 里的字段名对上）
export type SummaryKey =
  | "total_revenue"
  | "yoy_growth_rate"
  | "mom_growth_rate"
  | "bed_day_growth_rate"
  | "bed_day_mom_growth_rate";

export interface SummaryIndicatorConfig {
  key: SummaryKey;              // 对应 summary 的字段名
  title: string;                // 卡片标题
  color: string;                // 小圆点 / 主题色（如果需要）
  description: string;          // 卡片下方说明
  format: "number" | "percent"; // 展示格式
}

// 住院收入页面的汇总指标配置
export const INPATIENT_SUMMARY_INDICATORS: SummaryIndicatorConfig[] = [
  {
    key: "total_revenue",
    title: "总收入（万元）",
    color: "#2563eb",
    description: "当前筛选条件下的总收入",
    format: "number",
  },
  {
    key: "yoy_growth_rate",
    title: "收入同比增长",
    color: "#16a34a",
    description: "与去年同期同区间相比的增长率",
    format: "percent",
  },
  {
    key: "mom_growth_rate",
    title: "收入环比增长",
    color: "#0ea5e9",
    description: "与上一周期（同长度区间）的增长率",
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
