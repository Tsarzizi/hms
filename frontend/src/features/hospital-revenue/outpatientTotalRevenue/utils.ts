// src/features/outpatientTotalRevenue/utils.ts

import type { SortDir, SortKey, DetailRow } from "./types";

export const formatNumber = (v: number | null | undefined, digits = 2): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return v.toFixed(digits);
};

export const formatPercent = (v: number | null | undefined, digits = 1): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return `${v.toFixed(digits)}%`;
};

export const todayStr = (): string => {
  return new Date().toISOString().slice(0, 10);
};

export const daysAgoStr = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

export const sortDetails = (
  rows: DetailRow[],
  sortKey: SortKey,
  sortDir: SortDir,
): DetailRow[] => {
  const getVal = (row: DetailRow): any => {
    switch (sortKey) {
      case "date":
        return row.date || "";
      case "department_name":
        return row.department_name || "";
      case "doctor_name":
        return row.doctor_name || "";
      case "item_class_name":
        return row.item_class_name || "";
      case "revenue":
        return row.revenue ?? 0;
      case "quantity":
        return row.quantity ?? 0;
      default:
        return "";
    }
  };

  const sorted = [...rows].sort((a, b) => {
    const va = getVal(a);
    const vb = getVal(b);
    if (va === vb) return 0;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return sortDir === "asc" ? -1 : 1;
  });

  return sorted;
};
