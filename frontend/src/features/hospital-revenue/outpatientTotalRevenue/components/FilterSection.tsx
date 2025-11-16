// src/features/outpatientTotalRevenue/components/FilterSection.tsx

import React from "react";
import type { DepartmentOption, DoctorOption } from "../types";

interface Props {
  loading: boolean;
  startDate: string;
  endDate: string;
  departments: DepartmentOption[];
  doctors: DoctorOption[];
  selectedDeps: string[];
  selectedDocs: string[];
  depSummaryLabel: string;
  docSummaryLabel: string;
  onChangeStartDate: (v: string) => void;
  onChangeEndDate: (v: string) => void;
  onChangeSelectedDeps: (v: string[]) => void;
  onChangeSelectedDocs: (v: string[]) => void;
  onQuery: () => void;
  onReset: () => void;
}

const FilterSection: React.FC<Props> = ({
  loading,
  startDate,
  endDate,
  departments,
  doctors,
  selectedDeps,
  selectedDocs,
  depSummaryLabel,
  docSummaryLabel,
  onChangeStartDate,
  onChangeEndDate,
  onChangeSelectedDeps,
  onChangeSelectedDocs,
  onQuery,
  onReset,
}) => {
  const toggleDep = (name: string) => {
    if (selectedDeps.includes(name)) {
      onChangeSelectedDeps(selectedDeps.filter((n) => n !== name));
    } else {
      onChangeSelectedDeps([...selectedDeps, name]);
    }
  };

  const toggleDoc = (id: string) => {
    if (selectedDocs.includes(id)) {
      onChangeSelectedDocs(selectedDocs.filter((n) => n !== id));
    } else {
      onChangeSelectedDocs([...selectedDocs, id]);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
      {/* 日期 + 按钮 */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          <div>
            <div className="text-xs text-gray-500 mb-1">开始日期</div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => onChangeStartDate(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">结束日期</div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onChangeEndDate(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onQuery}
            disabled={loading}
            className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "查询中..." : "查询"}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="px-4 py-1.5 rounded border border-gray-300 text-sm hover:bg-gray-50"
          >
            重置
          </button>
        </div>
      </div>

      {/* 科室 / 医生选择 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 科室 */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-gray-500">绩效科室（多选）</div>
            <div className="text-xs text-gray-400 truncate max-w-[160px]">
              {depSummaryLabel}
            </div>
          </div>
          <div className="border border-gray-200 rounded max-h-48 overflow-y-auto p-2 text-sm bg-gray-50">
            {departments.length ? (
              departments.map((dep) => {
                const checked = selectedDeps.includes(dep.name);
                return (
                  <label
                    key={dep.code}
                    className="flex items-center gap-2 mb-1 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="h-3 w-3"
                      checked={checked}
                      onChange={() => toggleDep(dep.name)}
                    />
                    <span>{dep.name}</span>
                  </label>
                );
              })
            ) : (
              <div className="text-xs text-gray-400">暂无科室数据</div>
            )}
          </div>
        </div>

        {/* 医生 */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-gray-500">医生（多选）</div>
            <div className="text-xs text-gray-400 truncate max-w-[160px]">
              {docSummaryLabel}
            </div>
          </div>
          <div className="border border-gray-200 rounded max-h-48 overflow-y-auto p-2 text-sm bg-gray-50">
            {doctors.length ? (
              doctors.map((doc) => {
                const checked = selectedDocs.includes(doc.doc_id);
                return (
                  <label
                    key={doc.doc_id}
                    className="flex items-center gap-2 mb-1 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="h-3 w-3"
                      checked={checked}
                      onChange={() => toggleDoc(doc.doc_id)}
                    />
                    <span>
                      {doc.doc_name}（{doc.doc_id} / {doc.dep_name}）
                    </span>
                  </label>
                );
              })
            ) : (
              <div className="text-xs text-gray-400">暂无医生数据</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilterSection;
