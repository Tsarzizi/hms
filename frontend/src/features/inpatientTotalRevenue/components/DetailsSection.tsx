// src/features/inpatientTotalRevenue/components/DetailsSection.tsx
import React, { useMemo } from "react";
import { DataTable } from "../../../components/common/DataTable";

import type { DetailsRow, UIDoctorOption } from "../types";
import type { SortKey } from "../../../services/inpatientTotalRevenueApi";
import {
  INPATIENT_DETAIL_COLUMNS,
} from "../config";
import {
  filterDetailsByDoctors,
  sortDetails,
  paginate,
} from "../utils";

interface DetailsSectionProps {
  loading: boolean;
  details: DetailsRow[];

  // 医生筛选
  doctors: UIDoctorOption[];
  selectedDocs: string[];

  // 排序
  sortKey: SortKey;
  sortDir: "asc" | "desc";

  // 分页
  page: number;
  rowsPerPage: number;
  total: number;
  onPageChange: (page: number) => void;
}

const DetailsSection: React.FC<DetailsSectionProps> = ({
  loading,
  details,
  doctors,
  selectedDocs,
  sortKey,
  sortDir,
  page,
  rowsPerPage,
  total,
  onPageChange,
}) => {
  // 过滤 + 排序
  const processedRows = useMemo(() => {
    const filtered = filterDetailsByDoctors(details || [], selectedDocs);
    return sortDetails(filtered, sortKey, sortDir);
  }, [details, selectedDocs, sortKey, sortDir]);

  // 前端分页
  const pagedRows = useMemo(
    () => paginate<DetailsRow>(processedRows, page, rowsPerPage),
    [processedRows, page, rowsPerPage]
  );

  const totalAfterFilter = processedRows.length || total;

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4">
      {/* 标题 */}
      <h2 className="text-lg font-semibold text-gray-900 text-left">
        收入明细
      </h2>

      {/* ⭐ 数据部分 */}
      <DataTable<DetailsRow>
        className="overflow-x-auto"   // 👈 关键：覆盖默认卡片样式
        title={undefined}
        data={pagedRows}
        columns={INPATIENT_DETAIL_COLUMNS}
        emptyText={loading ? "加载中..." : "当前条件下没有数据"}
      />

      {/* ⭐ 页码条 */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <div>共 {totalAfterFilter} 条记录</div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1 border rounded disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            上一页
          </button>

          <span>
            第 {page} 页 / 共{" "}
            {Math.max(1, Math.ceil(totalAfterFilter / rowsPerPage))} 页
          </span>

          <button
            type="button"
            className="px-3 py-1 border rounded disabled:opacity-50"
            disabled={page >= Math.ceil(totalAfterFilter / rowsPerPage)}
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
