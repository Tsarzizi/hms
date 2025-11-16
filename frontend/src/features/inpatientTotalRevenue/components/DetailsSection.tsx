// src/features/inpatientTotalRevenue/components/DetailsSection.tsx
import React, { useMemo, useState } from "react";

import type { DetailsRow, UIDoctorOption } from "../types";
import type { SortKey } from "../../../services/inpatientTotalRevenueApi";

interface DetailsSectionProps {
  // 数据
  details: DetailsRow[];
  loading: boolean;

  // 医生筛选
  doctors: UIDoctorOption[];
  selectedDocs: string[];
  onChangeSelectedDocs?: (ids: string[]) => void;

  // 排序（可选受控）
  sortKey?: SortKey;
  sortDir?: "asc" | "desc";
  onChangeSortKey?: (key: SortKey) => void;
  onChangeSortDir?: (dir: "asc" | "desc") => void;

  // 分页（前端）
  page: number; // 1-based
  rowsPerPage: number;
  total: number;
  onPageChange: (page: number) => void;
}

type InternalSortKey = SortKey | "";

// 表头列定义
type ColumnKey =
  | "date"
  | "department"
  | "doctor"
  | "item_class_name"
  | "revenue"
  | "cost"
  | "quantity";

interface ColumnDef {
  key: ColumnKey;
  title: string;
  sortable?: boolean;
  sortKey?: SortKey;
  align?: "left" | "right";
}

/**
 * 收入明细：
 *   - 三种模式自动切列
 *   - 点击表头排序（日期 / 科室 / 医生 / 收入/花费）
 *   - 前端分页
 */
const DetailsSection: React.FC<DetailsSectionProps> = ({
  details,
  loading,
  doctors,
  selectedDocs,
  onChangeSelectedDocs,
  sortKey,
  sortDir,
  onChangeSortKey,
  onChangeSortDir,
  page,
  rowsPerPage,
  total,
  onPageChange,
}) => {
  // ---- 0. 内部排序状态（父组件没接管时使用） ----
  const [innerSortKey, setInnerSortKey] = useState<InternalSortKey>("");
  const [innerSortDir, setInnerSortDir] = useState<"asc" | "desc">("asc");

  const effSortKey: InternalSortKey =
    onChangeSortKey && typeof sortKey === "string"
      ? sortKey
      : innerSortKey;

  const effSortDir: "asc" | "desc" =
    onChangeSortDir && sortDir ? sortDir : innerSortDir;

  // ---- 1. 医生筛选 ----
  const filteredRows = useMemo(() => {
    const data = details ?? [];
    if (!selectedDocs || selectedDocs.length === 0) return data;

    const set = new Set(selectedDocs);
    return data.filter((row) =>
      row.doctor_id ? set.has(row.doctor_id) : false
    );
  }, [details, selectedDocs]);

  // ---- 2. 排序 ----
  const sortedRows = useMemo(() => {
    const data = [...filteredRows];

    if (!effSortKey) return data;

    const getValue = (row: DetailsRow): any => {
      switch (effSortKey) {
        case "date":
          return row.date;
        case "department":
          return row.department_name ?? row.department_code ?? "";
        case "doctor":
          return row.doctor_name ?? row.doctor_id ?? "";
        case "revenue":
          return (row.revenue ?? row.cost ?? 0) || 0;
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

    if (effSortDir === "desc") data.reverse();
    return data;
  }, [filteredRows, effSortKey, effSortDir]);

  // ---- 3. 分页 ----
  const totalAfterFilter = sortedRows.length;
  const pagedRows = useMemo(() => {
    const startIdx = (page - 1) * rowsPerPage;
    const endIdx = startIdx + rowsPerPage;
    return sortedRows.slice(startIdx, endIdx);
  }, [sortedRows, page, rowsPerPage]);

  // ---- 4. 根据数据自动推断列模式 ----
  const columns = useMemo<ColumnDef[]>(() => {
    const data = sortedRows;

    const hasDoctor = data.some((r) => r.doctor_name || r.doctor_id);
    const hasItemClass = data.some((r) => (r as any).item_class_name);
    const hasQuantity = data.some(
      (r) => typeof (r as any).quantity === "number"
    );

    const cols: ColumnDef[] = [];

    // 公共：日期（可排序）
    cols.push({
      key: "date",
      title: "日期",
      sortable: true,
      sortKey: "date",
    });

    // 公共：科室（可排序）
    cols.push({
      key: "department",
      title: "科室",
      sortable: true,
      sortKey: "department",
    });

    // 3）有医生：日期 / 科室 / 医生 / 项目类名 / 花费 / 数量
    if (hasDoctor) {
      cols.push({
        key: "doctor",
        title: "医生",
        sortable: true,
        sortKey: "doctor",
      });

      if (hasItemClass) {
        cols.push({
          key: "item_class_name",
          title: "项目类名",
        });
      }

      cols.push({
        key: "cost",
        title: "花费（元）",
        align: "right",
        sortable: true,
        sortKey: "revenue", // 用 revenue 这个 sortKey 来统一金额排序
      });

      if (hasQuantity) {
        cols.push({
          key: "quantity",
          title: "数量",
          align: "right",
        });
      }

      return cols;
    }

    // 2）有科室（有项目类名或数量）：日期 / 科室 / 项目类名 / 收入 / 数量
    if (hasItemClass || hasQuantity) {
      cols.push({
        key: "item_class_name",
        title: "项目类名",
      });

      cols.push({
        key: "revenue",
        title: "收入（元）",
        align: "right",
        sortable: true,
        sortKey: "revenue",
      });

      if (hasQuantity) {
        cols.push({
          key: "quantity",
          title: "数量",
          align: "right",
        });
      }

      return cols;
    }

    // 1）默认：日期 / 科室 / 收入
    cols.push({
      key: "revenue",
      title: "收入（元）",
      align: "right",
      sortable: true,
      sortKey: "revenue",
    });

    return cols;
  }, [sortedRows]);

  // ---- 5. 点击表头切换排序 ----
  const handleHeaderClick = (col: ColumnDef) => {
    if (!col.sortable || !col.sortKey) return;
    const colKey = col.sortKey;

    // 受控模式：父组件接管
    if (onChangeSortKey && onChangeSortDir) {
      if (sortKey !== colKey) {
        onChangeSortKey(colKey);
        onChangeSortDir("asc");
      } else {
        onChangeSortDir(sortDir === "asc" ? "desc" : "asc");
      }
      return;
    }

    // 非受控：自己维护
    if (innerSortKey !== colKey) {
      setInnerSortKey(colKey);
      setInnerSortDir("asc");
    } else {
      setInnerSortDir(innerSortDir === "asc" ? "desc" : "asc");
    }
  };

  const renderSortIcon = (col: ColumnDef) => {
    if (!col.sortable || !col.sortKey) return null;

    const k = col.sortKey;
    const curKey = effSortKey;
    const curDir = effSortDir;

    if (curKey !== k) {
      return (
        <span className="ml-1 text-gray-300 select-none">↕</span>
      );
    }
    if (curDir === "asc") {
      return (
        <span className="ml-1 text-blue-500 select-none">↑</span>
      );
    }
    return (
      <span className="ml-1 text-blue-500 select-none">↓</span>
    );
  };

  // 单元格渲染
  const renderCell = (row: DetailsRow, col: ColumnDef) => {
    switch (col.key) {
      case "date":
        return row.date || "-";
      case "department":
        return row.department_name || row.department_code || "—";
      case "doctor":
        return row.doctor_name || row.doctor_id || "—";
      case "item_class_name":
        // @ts-ignore
        return (row as any).item_class_name || "—";
      case "revenue": {
        const raw = row.revenue ?? row.cost ?? null;
        if (raw == null) return "-";
        const n =
          typeof raw === "number"
            ? raw
            : Number(String(raw).replace(/[\s,]/g, ""));
        if (!Number.isFinite(n)) return "-";
        return n.toLocaleString();
      }
      case "cost": {
        const raw =
          // @ts-ignore
          (row as any).cost ?? row.revenue ?? null;
        if (raw == null) return "-";
        const n =
          typeof raw === "number"
            ? raw
            : Number(String(raw).replace(/[\s,]/g, ""));
        if (!Number.isFinite(n)) return "-";
        return n.toLocaleString();
      }
      case "quantity": {
        // @ts-ignore
        const q = (row as any).quantity;
        if (q == null) return "-";
        return typeof q === "number" ? q : Number(q);
      }
      default:
        return "";
    }
  };

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
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={
                    "px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider select-none " +
                    (col.sortable ? "cursor-pointer " : "") +
                    (col.align === "right"
                      ? "text-right"
                      : "text-left")
                  }
                  onClick={() =>
                    col.sortable && handleHeaderClick(col)
                  }
                >
                  <span className="inline-flex items-center">
                    {col.title}
                    {renderSortIcon(col)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {loading && totalAfterFilter === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-6 text-center text-gray-500"
                >
                  加载中...
                </td>
              </tr>
            ) : totalAfterFilter === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-6 text-center text-gray-400 text-xs"
                >
                  当前条件下没有数据
                </td>
              </tr>
            ) : (
              pagedRows.map((row, rowIndex) => (
                <tr key={`${row.date}-${rowIndex}`}>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={
                        "px-4 py-2 whitespace-nowrap " +
                        (col.align === "right"
                          ? "text-right text-gray-800"
                          : "text-left text-gray-800")
                      }
                    >
                      {renderCell(row, col)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
        <div>
          共{" "}
          <span className="font-medium">
            {totalAfterFilter}
          </span>{" "}
          条记录，每页{" "}
          <span className="font-medium">
            {rowsPerPage}
          </span>{" "}
          条
        </div>
        <div className="flex items-center_gap-2">
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
            {Math.max(
              1,
              Math.ceil(totalAfterFilter / rowsPerPage)
            )}{" "}
            页
          </span>
          <button
            type="button"
            className="px-3 py-1 border rounded disabled:opacity-50"
            disabled={
              page >= Math.ceil(totalAfterFilter / rowsPerPage)
            }
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
