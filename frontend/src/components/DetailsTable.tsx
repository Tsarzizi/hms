// src/components/DetailsTable.tsx
//
// 住院收入「数据详情」表格
// - 接收父组件传来的全量 rows（当前筛选条件下的所有明细）
// - 在前端完成：医生筛选 + 排序 + 分页（根据 page/pageSize）
// - 底部使用 Pagination 组件展示分页条

import { useMemo } from "react";
import Pagination from "./base/Pagination";
import {
  formatDate,
  type DetailsRow,
  type DoctorOption,
  type SortKey,
} from "../services/inpatientTotalRevenueApi";

interface Props {
  rows: DetailsRow[];

  // 分页参数（由父组件 InpatientTotalRevenue 维护）
  page: number;
  pageSize: number;
  total: number; // 可以传 rows.length，也可以传后端 total

  loading: boolean;

  // 排序
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onChangeSortKey: (k: SortKey) => void;
  onChangeSortDir: (dir: "asc" | "desc") => void;

  // 医生筛选
  doctors: DoctorOption[];
  selectedDocs: string[];
  onChangeSelectedDocs: (ids: string[]) => void;

  // 分页回调（点击分页或跳页时调用）
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
  // 1️⃣ 先根据“选中的医生”对全量 rows 做过滤
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

  // 2️⃣ 再在“过滤后的全量数据”上做排序（全局排序，不是当前页排序）
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
          return (r as any).yoy_revenue_growth_pct ?? r.revenue_growth_pct ?? null;
        case "revenue_mom": {
          const raw =
            (r as any).revenue_mom_growth_pct ??
            (r as any).mom_growth_pct ??
            (r as any).mom_growth_rate ??
            (r as any)["收入环比增长率"] ??
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
      const sa = String(va);
      const sb = String(vb);
      return sa.localeCompare(sb, "zh-CN");
    };

    const sign = sortDir === "asc" ? 1 : -1;
    const arr = [...filteredRows];
    arr.sort((a, b) => cmp(a, b) * sign);
    return arr;
  }, [filteredRows, sortKey, sortDir]);

  // 3️⃣ 最后在“排好序的全量数据”上做分页切片
  const pagedRows = useMemo(() => {
    const startIdx = (page - 1) * pageSize;
    return sortedRows.slice(startIdx, startIdx + pageSize);
  }, [sortedRows, page, pageSize]);

  // 表头点击排序
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      onChangeSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      onChangeSortKey(key);
      onChangeSortDir(key === "date" ? "desc" : "asc");
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
    <div>
      {/* 表格区域 */}
      <div className="overflow-auto rounded border">
        <table className="min-w-full text-sm text-gray-900 text-left">
          <thead>
            <tr className="bg-gray-50 border-b text-gray-700">
              {/* 日期 */}
              <th className="px-3 py-2 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("date")}
                  className="flex items-center gap-1"
                >
                  <span>日期</span>
                  {renderSortIcon("date")}
                </button>
              </th>
              {/* 科室 */}
              <th className="px-3 py-2 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("department")}
                  className="flex items-center gap-1"
                >
                  <span>科室</span>
                  {renderSortIcon("department")}
                </button>
              </th>
              {/* 医生 */}
              <th className="px-3 py-2 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("doctor")}
                  className="flex items-center gap-1"
                >
                  <span>医生</span>
                  {renderSortIcon("doctor")}
                </button>
              </th>
              {/* 收入（万元） */}
              <th className="px-3 py-2 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("revenue")}
                  className="flex items-center gap-1"
                >
                  <span>住院收入（万元）</span>
                  {renderSortIcon("revenue")}
                </button>
              </th>
              {/* 收入同比 */}
              <th className="px-3 py-2 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("revenue_yoy")}
                  className="flex items-center gap-1"
                >
                  <span>收入同比增长率</span>
                  {renderSortIcon("revenue_yoy")}
                </button>
              </th>
              {/* 收入环比 */}
              <th className="px-3 py-2 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => handleSort("revenue_mom")}
                  className="flex items-center gap-1"
                >
                  <span>收入环比增长率</span>
                  {renderSortIcon("revenue_mom")}
                </button>
              </th>
            </tr>
          </thead>

          <tbody>
            {pagedRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-gray-400 py-4 text-center">
                  暂无数据
                </td>
              </tr>
            ) : (
              pagedRows.map((r, idx) => (
                <tr
                  key={idx}
                  className="border-t hover:bg-gray-50 cursor-default"
                >
                  {/* 日期 */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatDate(r.date)}
                  </td>

                  {/* 科室 */}
                  <td
                    className="px-3 py-2 truncate"
                    title={r.department_name || r.department_code || "—"}
                  >
                    {r.department_name || r.department_code || "—"}
                  </td>

                  {/* 医生 */}
                  <td
                    className="px-3 py-2 truncate"
                    title={
                      (r as any).doctor_name ||
                      (r as any).doctor_id ||
                      "—"
                    }
                  >
                    {(r as any).doctor_name ||
                      (r as any).doctor_id ||
                      "—"}
                  </td>

                  {/* 收入（万元） */}
                  <td className="px-3 py-2 font-mono whitespace-nowrap">
                    {typeof r.revenue === "number"
                      ? r.revenue.toLocaleString()
                      : "-"}
                  </td>

                  {/* 收入同比增长率 */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.revenue_growth_pct == null ? (
                      "-"
                    ) : (
                      <span
                        className={
                          Number(r.revenue_growth_pct) >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }
                      >
                        {Number(r.revenue_growth_pct).toFixed(2)}%
                      </span>
                    )}
                  </td>

                  {/* 收入环比增长率 */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    {(() => {
                      const raw =
                        (r as any).revenue_mom_growth_pct ??
                        (r as any).mom_growth_pct ??
                        (r as any).mom_growth_rate ??
                        (r as any)["收入环比增长率"] ??
                        null;
                      if (raw == null) return "-";
                      const n =
                        typeof raw === "number"
                          ? raw
                          : Number(
                              String(raw).replace(/[\s,%]/g, "")
                            );
                      if (!Number.isFinite(n)) return "-";
                      return (
                        <span
                          className={
                            n >= 0 ? "text-green-600" : "text-red-600"
                          }
                        >
                          {n.toFixed(2)}%
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页条：这里的 total 我建议用 sortedRows.length，保证和前端筛选后条数一致 */}
      <div className="mt-3">
        <Pagination
          page={page}
          pageSize={pageSize}
          total={sortedRows.length || total}
          disabled={loading}
          onChange={onPageChange}
        />
      </div>

      <p className="text-xs text-gray-500 mt-2 text-left">
        提示：点击表头可以按该列排序（再次点击切换升序/降序）；排序作用于全部数据，再按页显示。
      </p>
    </div>
  );
}
