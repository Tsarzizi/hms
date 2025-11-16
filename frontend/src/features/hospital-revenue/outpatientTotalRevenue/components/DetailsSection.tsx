// src/features/outpatientTotalRevenue/components/DetailsSection.tsx

import React from "react";
import type { DetailRow, DoctorOption, SortDir, SortKey } from "../types";
import { formatNumber } from "../utils";

interface Props {
  details: DetailRow[];
  loading: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
  onChangeSortKey: (k: SortKey) => void;
  onChangeSortDir: (d: SortDir) => void;
  doctors: DoctorOption[];
  selectedDocs: string[];
  onChangeSelectedDocs: (v: string[]) => void;
  page: number;
  rowsPerPage: number;
  total: number;
  onPageChange: (p: number) => void;
}

const DetailsSection: React.FC<Props> = ({
  details,
  loading,
  sortKey,
  sortDir,
  onChangeSortKey,
  onChangeSortDir,
  doctors,
  selectedDocs,
  onChangeSelectedDocs,
  page,
  rowsPerPage,
  total,
  onPageChange,
}) => {
  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      onChangeSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      onChangeSortKey(key);
      onChangeSortDir("asc");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / rowsPerPage));

  const toggleDocFilter = (id: string) => {
    if (selectedDocs.includes(id)) {
      onChangeSelectedDocs(selectedDocs.filter((v) => v !== id));
    } else {
      onChangeSelectedDocs([...selectedDocs, id]);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-800">
          明细数据（共 {total} 条）
        </div>
        <div className="text-xs text-gray-500">
          当前第 {page} / {totalPages} 页
        </div>
      </div>

      {/* 医生快速筛选（可选） */}
      <div className="text-xs text-gray-500">
        <div className="mb-1">按医生筛选：</div>
        <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
          {doctors.map((d) => {
            const checked = selectedDocs.includes(d.doc_id);
            return (
              <button
                key={d.doc_id}
                type="button"
                onClick={() => toggleDocFilter(d.doc_id)}
                className={`px-2 py-0.5 rounded-full border text-xs ${
                  checked
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-gray-50 text-gray-600 border-gray-300"
                }`}
              >
                {d.doc_name}（{d.doc_id}）
              </button>
            );
          })}
        </div>
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="py-10 text-center text-gray-500 text-sm">
            加载明细数据中...
          </div>
        ) : !details.length ? (
          <div className="py-10 text-center text-gray-400 text-sm">暂无明细数据</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th onClick={() => toggleSort("date")} active={sortKey === "date"} dir={sortDir}>
                  日期
                </Th>
                <Th
                  onClick={() => toggleSort("department_name")}
                  active={sortKey === "department_name"}
                  dir={sortDir}
                >
                  科室
                </Th>
                <Th>医生</Th>
                <Th
                  onClick={() => toggleSort("item_class_name")}
                  active={sortKey === "item_class_name"}
                  dir={sortDir}
                >
                  项目大类
                </Th>
                <Th
                  align="right"
                  onClick={() => toggleSort("revenue")}
                  active={sortKey === "revenue"}
                  dir={sortDir}
                >
                  收入
                </Th>
                <Th
                  align="right"
                  onClick={() => toggleSort("quantity")}
                  active={sortKey === "quantity"}
                  dir={sortDir}
                >
                  数量
                </Th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {details.map((r, idx) => (
                <tr key={`${r.date}-${idx}`}>
                  <Td>{r.date}</Td>
                  <Td>{r.department_name || "-"}</Td>
                  <Td>{r.doctor_name || "-"}</Td>
                  <Td>{r.item_class_name || "-"}</Td>
                  <Td align="right">{formatNumber(r.revenue ?? 0, 2)}</Td>
                  <Td align="right">
                    {r.quantity !== null && r.quantity !== undefined
                      ? formatNumber(r.quantity, 2)
                      : "-"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 分页 */}
      <div className="flex justify-end items-center gap-2 text-xs text-gray-600">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="px-2 py-1 border rounded disabled:opacity-50"
        >
          上一页
        </button>
        <span>
          第 {page} / {totalPages} 页
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="px-2 py-1 border rounded disabled:opacity-50"
        >
          下一页
        </button>
      </div>
    </div>
  );
};

interface ThProps {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  active?: boolean;
  dir?: SortDir;
  onClick?: () => void;
}

const Th: React.FC<ThProps> = ({
  children,
  align = "left",
  active,
  dir,
  onClick,
}) => {
  return (
    <th
      className={`px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider text-${align} cursor-pointer select-none`}
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active && (dir === "asc" ? "↑" : "↓")}
      </span>
    </th>
  );
};

const Td: React.FC<{ align?: "left" | "right" | "center"; children: React.ReactNode }> =
  ({ align = "left", children }) => (
    <td className={`px-3 py-2 text-sm text-gray-700 text-${align}`}>{children}</td>
  );

export default DetailsSection;
