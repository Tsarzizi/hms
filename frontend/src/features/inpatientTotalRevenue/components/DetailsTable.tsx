// src/features/inpatientTotalRevenue/components/DetailsTable.tsx
import { useMemo } from "react";
import Pagination from "../../../components/base/Pagination";
import {
  formatDate,
  type DetailsRow,
  type DoctorOption,
  type SortKey,
} from "../../../services/inpatientTotalRevenueApi";

interface Props {
  rows: DetailsRow[];

  page: number;
  pageSize: number;
  total: number;

  loading: boolean;

  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onChangeSortKey: (k: SortKey) => void;
  onChangeSortDir: (dir: "asc" | "desc") => void;

  doctors: DoctorOption[];
  selectedDocs: string[];
  onChangeSelectedDocs: (ids: string[]) => void;

  onPageChange: (page: number) => void;
}

export default function InpatientDetailsTable({
  rows,
  page,
  pageSize,
  total,
  loading,
  sortKey,
  sortDir,
  onChangeSortKey,
  onChangeSortDir,
  doctors,
  selectedDocs,
  onChangeSelectedDocs,
  onPageChange,
}: Props) {
  // 过滤医生
  const filteredRows = useMemo(() => {
    if (!selectedDocs.length) return rows;
    const set = new Set(selectedDocs);
    return rows.filter((r) => {
      const id =
        (r as any).doctor_id ??
        (r as any).doctor ??
        (r as any).doctorCode ??
        null;
      const name =
        (r as any).doctor_name ??
        (r as any).doctorName ??
        (r as any).doctor ??
        null;
      if (id != null && set.has(String(id))) return true;
      if (name != null && set.has(String(name))) return true;
      return false;
    });
  }, [rows, selectedDocs]);

  // 排序
  const sortedRows = useMemo(() => {
    const getSortValue = (r: DetailsRow): any => {
      switch (sortKey) {
        case "date":
          return new Date(r.date);
        case "department":
          return r.department_name || r.department_code || "";
        case "doctor":
          return (
            (r as any).doctor_name ||
            (r as any).doctor_id ||
            (r as any).doctor ||
            ""
          );
        case "revenue":
          return typeof r.revenue === "number" ? r.revenue : null;
        case "revenue_yoy":
          return (
            (r as any).yoy_revenue_growth_pct ??
            r.revenue_growth_pct ??
            null
          );
        case "revenue_mom": {
          const raw =
            (r as any).revenue_mom_growth_pct ??
            (r as any).mom_growth_pct ??
            (r as any).mom_growth_rate ??
            null;
          if (raw == null) return null;
          const n =
            typeof raw === "number"
              ? raw
              : Number(String(raw).replace(/[\s,%]/g, ""));
          return Number.isFinite(n) ? n : null;
        }
        default:
          return null;
      }
    };

    const cmp = (a: DetailsRow, b: DetailsRow) => {
      const va = getSortValue(a);
      const vb = getSortValue(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;

      if (va instanceof Date && vb instanceof Date) {
        return va.getTime() - vb.getTime();
      }
      if (typeof va === "number" && typeof vb === "number") {
        return va - vb;
      }
      return String(va).localeCompare(String(vb), "zh-CN");
    };

    const sign = sortDir === "asc" ? 1 : -1;
    const arr = [...filteredRows];
    arr.sort((a, b) => cmp(a, b) * sign);
    return arr;
  }, [filteredRows, sortKey, sortDir]);

  // 分页
  const pagedRows = useMemo(() => {
    const startIdx = (page - 1) * pageSize;
    return sortedRows.slice(startIdx, startIdx + pageSize);
  }, [sortedRows, page, pageSize]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      onChangeSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      onChangeSortKey(key);
      onChangeSortDir("asc");
    }
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <span className="text-xs text-gray-400">↕</span>;
    return (
      <span className="text-xs text-gray-500">
        {sortDir === "asc" ? "↑" : "↓"}
      </span>
    );
  };

  return (
    <div className="space-y-3">
      {/* ⭐ 纯 table，不再有 rounded / border / bg-white */}
      <table className="min-w-full text-sm text-gray-900 text-left">
        <thead>
          <tr className="border-b text-gray-700 text-xs uppercase tracking-wide">
            <th className="px-3 py-2 whitespace-nowrap font-medium">
              <button onClick={() => handleSort("date")} className="flex items-center gap-1">
                日期 {renderSortIcon("date")}
              </button>
            </th>
            <th className="px-3 py-2 whitespace-nowrap font-medium">
              <button onClick={() => handleSort("department")} className="flex items-center gap-1">
                科室 {renderSortIcon("department")}
              </button>
            </th>
            <th className="px-3 py-2 whitespace-nowrap font-medium">
              <button onClick={() => handleSort("doctor")} className="flex items-center gap-1">
                医生 {renderSortIcon("doctor")}
              </button>
            </th>
            <th className="px-3 py-2 whitespace-nowrap font-medium">
              <button onClick={() => handleSort("revenue")} className="flex items-center gap-1">
                住院收入 {renderSortIcon("revenue")}
              </button>
            </th>
            <th className="px-3 py-2 whitespace-nowrap font-medium">
              <button onClick={() => handleSort("revenue_yoy")} className="flex items-center gap-1">
                收入同比 {renderSortIcon("revenue_yoy")}
              </button>
            </th>
            <th className="px-3 py-2 whitespace-nowrap font-medium">
              <button onClick={() => handleSort("revenue_mom")} className="flex items-center gap-1">
                收入环比 {renderSortIcon("revenue_mom")}
              </button>
            </th>
          </tr>
        </thead>

        <tbody>
          {pagedRows.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-gray-400 py-6 text-center">
                暂无数据
              </td>
            </tr>
          ) : (
            pagedRows.map((r, idx) => (
              <tr key={idx} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.date)}</td>
                <td className="px-3 py-2 truncate">{r.department_name || r.department_code || "—"}</td>
                <td className="px-3 py-2 truncate">
                  {(r as any).doctor_name || (r as any).doctor_id || "—"}
                </td>
                <td className="px-3 py-2 font-mono whitespace-nowrap">
                  {typeof r.revenue === "number" ? r.revenue.toLocaleString() : "-"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.revenue_growth_pct == null
                    ? "-"
                    : `${Number(r.revenue_growth_pct).toFixed(2)}%`}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {(() => {
                    const raw =
                      (r as any).revenue_mom_growth_pct ??
                      (r as any).mom_growth_pct ??
                      (r as any).mom_growth_rate ??
                      null;
                    if (raw == null) return "-";
                    const n =
                      typeof raw === "number"
                        ? raw
                        : Number(String(raw).replace(/[\s,%]/g, ""));
                    if (!Number.isFinite(n)) return "-";
                    return `${n.toFixed(2)}%`;
                  })()}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* ⭐ 分页条 */}
      <Pagination
        page={page}
        pageSize={pageSize}
        total={sortedRows.length || total}
        disabled={loading}
        onChange={onPageChange}
      />

      {/* ⭐ 提示 */}
      <p className="text-xs text-gray-500 leading-relaxed">
        提示：点击表头可以排序；排序作用于全部数据，再按页显示。
      </p>
    </div>
  );
}
