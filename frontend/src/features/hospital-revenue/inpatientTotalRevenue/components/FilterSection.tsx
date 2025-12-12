// src/features/inpatientTotalRevenue/components/FilterSection.tsx
//
// 住院收入分析 - 筛选区块

import React, { useMemo, useState } from "react";
import {
  FilterSectionBase,
  FilterItem,
} from "../../../../components/common/FilterSectionBase";

import type { DepartmentOption, UIDoctorOption } from "../types";

interface Props {
  // 状态
  loading: boolean;
  startDate: string;
  endDate: string;
  departments: DepartmentOption[];
  doctors: UIDoctorOption[];     // 👈 带 dep_code 的医生列表（init 时就传进来）
  selectedDeps: string[];
  selectedDocs: string[];
  depSummaryLabel: string;
  docSummaryLabel: string;

  // 事件
  onChangeStartDate: (v: string) => void;
  onChangeEndDate: (v: string) => void;
  onChangeSelectedDeps: (codes: string[]) => void;
  onChangeSelectedDocs: (ids: string[]) => void;
  onQuery: () => void;
  onReset: () => void;
  onDownload?: () => void;
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
  onDownload,
}) => {
  const [depDropdownOpen, setDepDropdownOpen] = useState(false);
  const [docDropdownOpen, setDocDropdownOpen] = useState(false);
  const [depSearch, setDepSearch] = useState("");
  const [docSearch, setDocSearch] = useState("");

  // 科室搜索过滤
  const filteredDepartments = useMemo(() => {
    const kw = depSearch.trim();
    if (!kw) return departments;
    return departments.filter(
      (d) => d.name.includes(kw) || d.code.includes(kw)
    );
  }, [depSearch, departments]);

  // ⭐ 1. 先按已选科室过滤出「可用医生列表」
  const doctorsBySelectedDeps = useMemo(() => {
    if (!selectedDeps.length) return [] as UIDoctorOption[];
    const depSet = new Set(selectedDeps);
    return doctors.filter((d) => depSet.has(d.dep_code));
  }, [doctors, selectedDeps]);

  // ⭐ 2. 在「可用医生」里再做搜索过滤
  const filteredDoctors = useMemo(() => {
    const base = doctorsBySelectedDeps;
    const kw = docSearch.trim();
    if (!kw) return base;
    return base.filter(
      (d) => d.name.includes(kw) || d.id.includes(kw)
    );
  }, [docSearch, doctorsBySelectedDeps]);

  // ⭐ 3. 没选科室 => 禁用医生筛选
  const docDisabled = !selectedDeps.length;

  const handleToggleDep = (code: string) => {
    if (selectedDeps.includes(code)) {
      onChangeSelectedDeps(selectedDeps.filter((c) => c !== code));
    } else {
      onChangeSelectedDeps([...selectedDeps, code]);
    }
  };

  const handleToggleDoc = (id: string) => {
    if (selectedDocs.includes(id)) {
      onChangeSelectedDocs(selectedDocs.filter((c) => c !== id));
    } else {
      onChangeSelectedDocs([...selectedDocs, id]);
    }
  };

  const handleQuery = () => {
    onQuery();
  };

  return (
    <FilterSectionBase
      title="数据筛选"
      loading={loading}
      onQuery={handleQuery}
      onReset={onReset}
      onDownload={onDownload}
    >
      {/* 开始日期 */}
      <FilterItem label="开始日期">
        <input
          type="date"
          value={startDate}
          onChange={(e) => onChangeStartDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-left w-full
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </FilterItem>

      {/* 结束日期 */}
      <FilterItem label="结束日期">
        <input
          type="date"
          value={endDate}
          onChange={(e) => onChangeEndDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-left w-full
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </FilterItem>

      {/* 科室多选 */}
      <FilterItem label="科室筛选">
        <div className="relative">
          <button
            type="button"
            onClick={() => setDepDropdownOpen((o) => !o)}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 bg-white flex justify-between items-center text-left shadow-sm
                       hover:border-blue-500 transition-colors duration-200"
          >
            <span className="truncate text-sm text-gray-900">
              {depSummaryLabel || "全部科室"}
            </span>
            <span className="text-xs text-gray-500">
              {depDropdownOpen ? "▴" : "▾"}
            </span>
          </button>

          {depDropdownOpen && (
            <div className="absolute z-20 mt-2 w-80 max-h-80 overflow-auto border border-gray-200 bg-white rounded-lg shadow-lg">
              <div className="p-3 border-b border-gray-100">
                <input
                  placeholder="搜索科室名称/编码"
                  value={depSearch}
                  onChange={(e) => setDepSearch(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="max-h-60 overflow-auto">
                {filteredDepartments.length === 0 ? (
                  <div className="p-3 text-xs text-gray-400 text-center">
                    没有匹配的科室
                  </div>
                ) : (
                  filteredDepartments.map((d) => (
                    <label
                      key={d.code}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm
                                 border-b border-gray-50 last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={selectedDeps.includes(d.code)}
                        onChange={() => handleToggleDep(d.code)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <span className="truncate text-gray-700">
                        {d.name}{" "}
                        <span className="text-gray-400">({d.code})</span>
                      </span>
                    </label>
                  ))
                )}
              </div>
              <div className="p-3 border-t border-gray-100 flex justify-between text-xs text-gray-600 bg-gray-50">
                <button
                  type="button"
                  onClick={() =>
                    onChangeSelectedDeps(filteredDepartments.map((d) => d.code))
                  }
                  className="hover:text-blue-600"
                >
                  全选当前列表
                </button>
                <button
                  type="button"
                  onClick={() => onChangeSelectedDeps([])}
                  className="hover:text-blue-600"
                >
                  清空
                </button>
              </div>
            </div>
          )}
        </div>
      </FilterItem>

      {/* 医生多选（依赖科室） */}
      <FilterItem label="医生筛选">
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              if (!docDisabled) {
                setDocDropdownOpen((o) => !o);
              }
            }}
            disabled={docDisabled}
            className={`w-full border rounded-lg px-4 py-3 bg-white flex justify-between items-center text-left shadow-sm transition-colors duration-200
              ${
                docDisabled
                  ? "border-gray-200 text-gray-400 cursor-not-allowed bg-gray-50"
                  : "border-gray-300 hover:border-blue-500 text-gray-900"
              }`}
          >
            <span className="truncate text-sm">
              {docDisabled ? "请先选择科室" : docSummaryLabel || "全部医生"}
            </span>
            <span className="text-xs text-gray-500">
              {docDropdownOpen && !docDisabled ? "▴" : "▾"}
            </span>
          </button>

          {/* 只有在「已选科室」且下拉打开时才显示列表 */}
          {!docDisabled && docDropdownOpen && (
            <div className="absolute z-20 mt-2 w-80 max-h-80 overflow-auto border border-gray-200 bg-white rounded-lg shadow-lg">
              <div className="p-3 border-b border-gray-100">
                <input
                  placeholder="搜索医生姓名/编号"
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="max-h-60 overflow-auto">
                {filteredDoctors.length === 0 ? (
                  <div className="p-3 text-xs text-gray-400 text-center">
                    {doctorsBySelectedDeps.length === 0
                      ? "当前科室下没有医生"
                      : "没有匹配的医生"}
                  </div>
                ) : (
                  filteredDoctors.map((d) => (
                    <label
                      key={d.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm
                                 border-b border-gray-50 last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={selectedDocs.includes(d.id)}
                        onChange={() => handleToggleDoc(d.id)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <span className="truncate text-gray-700">
                        {d.name}{" "}
                        <span className="text-gray-400">({d.id})</span>
                      </span>
                    </label>
                  ))
                )}
              </div>
              <div className="p-3 border-t border-gray-100 flex justify-between text-xs text-gray-600 bg-gray-50">
                <button
                  type="button"
                  onClick={() =>
                    onChangeSelectedDocs(filteredDoctors.map((d) => d.id))
                  }
                  className="hover:text-blue-600"
                >
                  全选当前列表
                </button>
                <button
                  type="button"
                  onClick={() => onChangeSelectedDocs([])}
                  className="hover:text-blue-600"
                >
                  清空
                </button>
              </div>
            </div>
          )}
        </div>
      </FilterItem>
    </FilterSectionBase>
  );
};

export default FilterSection;
