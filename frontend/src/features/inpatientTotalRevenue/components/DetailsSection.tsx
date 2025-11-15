// src/features/inpatientTotalRevenue/components/DetailsSection.tsx
import React, { useMemo } from "react";
import {
  DataTable,
  type Column,
} from "../../../components/common/DataTable";

import type { DetailsRow, UIDoctorOption } from "../types";
import type { SortKey } from "../../../services/inpatientTotalRevenueApi";

interface DetailsSectionProps {
  // 列表数据（后端 /details 返回的 rows）
  rows: DetailsRow[];

  // 加载状态
  loading: boolean;

  // 医生筛选
  doctors: UIDoctorOption[];
  selectedDocs: string[];
  onChangeSelectedDocs?: (ids: string[]) => void;

  // 排序
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onChangeSortKey?: (key: SortKey) => void;
  onChangeSortDir?: (dir: "asc" | "desc") => void;

  // 分页（前端分页）
  page: number; // 1-based
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

/**
 * 收入明细区块：
 * - 根据医生筛选
 * - 根据 sortKey/sortDir 排序
 * - 前端分页
 * - ⭐ 表格列根据实际数据动态变化
 */
const DetailsSection: React.FC<DetailsSectionProps> = ({
  rows,
  loading,
                                                         selectedDocs,
                                                         sortKey,
  sortDir,
                                                         page,
                                                         pageSize,
                                                         onPageChange,
                                                       }) => {
  // 1) 医生筛选
  const filteredRows = useMemo(() => {
    const data = rows ?? [];
    if (!selectedDocs || selectedDocs.length === 0) return data;

    const set = new Set(selectedDocs);
    return data.filter((row) =>
      row.doctor_id ? set.has(row.doctor_id) : false
    );
  }, [rows, selectedDocs]);

  // 2) 排序（在前端做）
  const sortedRows = useMemo(() => {
    const data = [...filteredRows];
    if (!sortKey) return data;

    const getValue = (row: DetailsRow): any => {
      switch (sortKey) {
        case "date":
          return row.date;
        case "department":
          return row.department_name ?? row.department_code ?? "";
        case "doctor":
          return row.doctor_name ?? row.doctor_id ?? "";
        case "revenue":
          return row.revenue ?? 0;
        case "revenue_yoy":
          return row.revenue_growth_pct ?? 0;
        case "revenue_mom":
          return row.revenue_mom_growth_pct ?? 0;
        default:
          return 0;
      }
    };

    data.sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);

      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;

      if (typeof va === "number" && typeof vb === "number") {
        return va - vb;
      }
      return String(va).localeCompare(String(vb), "zh-CN");
    });

    if (sortDir === "desc") data.reverse();
    return data;
  }, [filteredRows, sortKey, sortDir]);

  // 3) 前端分页
  const totalAfterFilter = sortedRows.length;
  const pagedRows = useMemo(() => {
    const startIdx = (page - 1) * pageSize;
    const endIdx = startIdx + pageSize;
    return sortedRows.slice(startIdx, endIdx);
  }, [sortedRows, page, pageSize]);

  // 4) 动态列：根据实际数据判断是否显示医生、同比、环比
  const columns = useMemo<Column<DetailsRow>[]>(() => {
    const data = sortedRows;

    const hasDoctor = data.some((r) => r.doctor_name || r.doctor_id);
    const hasYoy = data.some((r) => r.revenue_growth_pct != null);
    const hasMom = data.some((r) => r.revenue_mom_growth_pct != null);

    const cols: Column<DetailsRow>[] = [];

    // 日期
    cols.push({
      key: "date",
      title: "日期",
      render: (row) => row.date || "-",
    });

    // 科室
    cols.push({
      key: "department",
      title: "科室",
      render: (row) =>
        row.department_name || row.department_code || "—",
    });

    // 医生（有医生字段时才显示）
    if (hasDoctor) {
      cols.push({
        key: "doctor",
        title: "医生",
        render: (row) =>
          row.doctor_name || row.doctor_id || "—",
      });
    }

    // 收入（必有）
    cols.push({
      key: "revenue",
      title: "住院收入",
      className:
        "px-6 py-4 whitespace-nowrap text-sm text-right text-gray-700",
      headerClassName:
        "px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider",
      render: (row) =>
        typeof row.revenue === "number"
          ? row.revenue.toLocaleString()
          : "-",
    });

    // 收入同比
    if (hasYoy) {
      cols.push({
        key: "revenue_yoy",
        title: "收入同比",
        className:
          "px-6 py-4 whitespace-nowrap text-sm text-right text-gray-700",
        headerClassName:
          "px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider",
        render: (row) => {
          const raw = row.revenue_growth_pct;
          if (raw == null) return "-";
          const n =
            typeof raw === "number"
              ? raw
              : Number(String(raw).replace(/[\s,%]/g, ""));
          if (!Number.isFinite(n)) return "-";
          return `${n.toFixed(2)}%`;
        },
      });
    }

    // 收入环比
    if (hasMom) {
      cols.push({
        key: "revenue_mom",
        title: "收入环比",
        className:
          "px-6 py-4 whitespace-nowrap text-sm text-right text-gray-700",
        headerClassName:
          "px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider",
        render: (row) => {
          const raw = row.revenue_mom_growth_pct;
          if (raw == null) return "-";
          const n =
            typeof raw === "number"
              ? raw
              : Number(String(raw).replace(/[\s,%]/g, ""));
          if (!Number.isFinite(n)) return "-";
          return `${n.toFixed(2)}%`;
        },
      });
    }

    return cols;
  }, [sortedRows]);

  // 5) 医生筛选按钮
  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4">
      {/* 标题行 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold text-gray-900 text-left">
            收入明细
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            当前共{" "}
            <span className="font-semibold text-gray-700">
              {totalAfterFilter}
            </span>{" "}
            条记录（前端分页）
          </p>
        </div>

        {/* 医生筛选 */}
      </div>

      {/* 表格 */}
      <DataTable<DetailsRow>
        data={pagedRows}
        columns={columns}
        title={undefined}
        emptyText={loading ? "加载中..." : "当前条件下没有数据"}
        className="bg-white rounded-lg border border-gray-200"
      />

      {/* 分页 */}
      <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
        <div>
          共{" "}
          <span className="font-medium">
            {totalAfterFilter}
          </span>{" "}
          条记录，每页{" "}
          <span className="font-medium">
            {pageSize}
          </span>{" "}
          条
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1 border rounded disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            上一页
          </button>
          <span className="text-xs text-gray-500">
            第 {page} 页 / 共{" "}
            {Math.max(1, Math.ceil(totalAfterFilter / pageSize))} 页
          </span>
          <button
            type="button"
            className="px-3 py-1 border rounded disabled:opacity-50"
            disabled={page >= Math.ceil(totalAfterFilter / pageSize)}
            onClick={() => onPageChange(page + 1)}
          >
            下一页
          </button>
        </div>
      </div>
    </section>
  );
};

export default DetailsSection;
