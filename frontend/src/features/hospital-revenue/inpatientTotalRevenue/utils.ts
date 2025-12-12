// src/features/inpatientTotalRevenue/utils.ts
// 住院收入分析页面的通用工具函数：
// - 明细过滤（按医生）
// - 明细排序
// - 前端分页
// - 趋势图数据拼装（给通用 TrendChart 用）

import type { DetailsRow, TSRow } from "./types";
import type { SortKey } from "./api";
import type { TrendChartDataset } from "../../../components/common/TrendChart";

export type CompareMode = "yoy" | "mom";

// 按选中的医生过滤明细（selectedDocs 为空则不过滤）
export function filterDetailsByDoctors(
  rows: DetailsRow[],
  selectedDocs: string[]
): DetailsRow[] {
  if (!selectedDocs?.length) return rows || [];
  const docSet = new Set(selectedDocs.map(String));
  return (rows || []).filter((r) =>
    r.doctor_id ? docSet.has(String(r.doctor_id)) : true
  );
}

// 明细排序
export function sortDetails(
  rows: DetailsRow[],
  sortKey: SortKey,
  sortDir: "asc" | "desc"
): DetailsRow[] {
  const dir = sortDir === "asc" ? 1 : -1;
  const clone = [...(rows || [])];

  clone.sort((a, b) => {
    switch (sortKey) {
      case "date": {
        const da = a.date ?? "";
        const db = b.date ?? "";
        return da < db ? -1 * dir : da > db ? 1 * dir : 0;
      }
      case "department": {
        const na = (a.department_name || a.department_code || "") as string;
        const nb = (b.department_name || b.department_code || "") as string;
        return na.localeCompare(nb) * dir;
      }
      case "doctor": {
        const na = (a.doctor_name || "") as string;
        const nb = (b.doctor_name || "") as string;
        return na.localeCompare(nb) * dir;
      }
      case "revenue": {
        const va = a.revenue ?? 0;
        const vb = b.revenue ?? 0;
        return va === vb ? 0 : va > vb ? dir : -dir;
      }
      case "revenue_yoy": {
        const va = a.revenue_growth_pct ?? -Infinity;
        const vb = b.revenue_growth_pct ?? -Infinity;
        return va === vb ? 0 : va > vb ? dir : -dir;
      }
      case "revenue_mom": {
        const va = a.revenue_mom_growth_pct ?? -Infinity;
        const vb = b.revenue_mom_growth_pct ?? -Infinity;
        return va === vb ? 0 : va > vb ? dir : -dir;
      }
      default:
        return 0;
    }
  });

  return clone;
}

// 通用前端分页
export function paginate<T>(
  rows: T[],
  page: number,
  pageSize: number
): T[] {
  if (!rows?.length) return [];
  const p = Math.max(1, page || 1);
  const size = Math.max(1, pageSize || 1);
  const start = (p - 1) * size;
  return rows.slice(start, start + size);
}

// 趋势图数据拼装（收入 & 床日 的同比 / 环比），直接返回给 TrendChart 使用
export function buildTrendDatasets(
  rows: TSRow[],
  compare: CompareMode
): { labels: string[]; datasets: TrendChartDataset[] } {
  const safeRows = rows || [];
  const labels = safeRows.map((r) => r.date);

  if (compare === "yoy") {
    const revYoy = safeRows.map((r) => r.yoy_pct ?? 0);
    const bedYoy = safeRows.map((r) => r.bed_yoy_pct ?? 0);
    const datasets: TrendChartDataset[] = [
      { label: "收入同比%", data: revYoy, color: "#2563eb" },
      { label: "床日同比%", data: bedYoy, color: "#16a34a" },
    ];
    return { labels, datasets };
  } else {
    const revMom = safeRows.map((r) => r.mom_pct ?? 0);
    const bedMom = safeRows.map((r) => r.bed_mom_pct ?? 0);
    const datasets: TrendChartDataset[] = [
      { label: "收入环比%", data: revMom, color: "#2563eb" },
      { label: "床日环比%", data: bedMom, color: "#16a34a" },
    ];
    return { labels, datasets };
  }
}
