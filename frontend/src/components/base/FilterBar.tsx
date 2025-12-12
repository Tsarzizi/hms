import { useMemo, useState } from "react";

interface DepartmentOption {
  code: string;
  name: string;
}

interface DoctorOption {
  id: string;
  name: string;
}

interface InpatientFilterBarProps {
  startDate: string;
  endDate: string;
  loading: boolean;

  departments: DepartmentOption[];
  doctors: DoctorOption[];

  selectedDeps: string[];
  selectedDocs: string[];

  depSummaryLabel: string;
  docSummaryLabel: string;

  onChangeStartDate: (v: string) => void;
  onChangeEndDate: (v: string) => void;
  onChangeSelectedDeps: (codes: string[]) => void;
  onChangeSelectedDocs: (ids: string[]) => void;

  /** 原来的 onSubmitSummary */
  onSubmit: (e?: any) => void;
  /** 原来的 onReset */
  onReset: () => void;
}

export default function InpatientFilterBar(props: InpatientFilterBarProps) {
  const {
    startDate,
    endDate,
    loading,
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
    onSubmit,
    onReset,
  } = props;

  // 本组件内部状态：下拉开关 & 搜索关键字
  const [depDropdownOpen, setDepDropdownOpen] = useState(false);
  const [docDropdownOpen, setDocDropdownOpen] = useState(false);
  const [depSearch, setDepSearch] = useState("");
  const [docSearch, setDocSearch] = useState("");

  const filteredDepartments = useMemo(() => {
    const kw = depSearch.trim();
    if (!kw) return departments;
    return departments.filter(
      (d) => d.name.includes(kw) || d.code.includes(kw)
    );
  }, [depSearch, departments]);

  const filteredDoctors = useMemo(() => {
    const kw = docSearch.trim();
    if (!kw) return doctors;
    return doctors.filter((d) => d.name.includes(kw) || d.id.includes(kw));
  }, [docSearch, doctors]);

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

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap md:flex-nowrap gap-4 items-end text-left bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6"
    >
      {/* 开始日期 */}
      <div className="flex flex-col min-w-[180px]">
        <label className="text-sm text-gray-600 mb-1 flex items-center gap-1">
          开始日期<span className="text-red-500">*</span>
        </label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => onChangeStartDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* 结束日期 */}
      <div className="flex flex-col min-w-[180px]">
        <label className="text-sm text-gray-600 mb-1 flex items-center gap-1">
          结束日期<span className="text-red-500">*</span>
        </label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onChangeEndDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* 科室多选 */}
      <div className="flex flex-col gap-2 flex-1 min-w-[260px]">
        <label className="text-sm text-gray-600 mb-1">科室筛选</label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setDepDropdownOpen((o) => !o)}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 bg-white flex justify-between items-center text-left hover:border-blue-500 transition-colors duration-200 shadow-sm"
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
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                      className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-50 last:border-b-0"
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
      </div>

      {/* 医生多选（本地） */}
      <div className="flex flex-col gap-2 flex-1 min-w-[260px]">
        <label className="text-sm text-gray-600 mb-1">医生筛选</label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setDocDropdownOpen((o) => !o)}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 bg-white flex justify-between items-center text-left hover:border-blue-500 transition-colors duration-200 shadow-sm"
          >
            <span className="truncate text-sm text-gray-900">
              {docSummaryLabel || "全部医生"}
            </span>
            <span className="text-xs text-gray-500">
              {docDropdownOpen ? "▴" : "▾"}
            </span>
          </button>
          {docDropdownOpen && (
            <div className="absolute z-20 mt-2 w-80 max-h-80 overflow-auto border border-gray-200 bg-white rounded-lg shadow-lg">
              <div className="p-3 border-b border-gray-100">
                <input
                  placeholder="搜索医生姓名/编号"
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="max-h-60 overflow-auto">
                {filteredDoctors.length === 0 ? (
                  <div className="p-3 text-xs text-gray-400 text-center">
                    没有匹配的医生
                  </div>
                ) : (
                  filteredDoctors.map((d) => (
                    <label
                      key={d.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-50 last:border-b-0"
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
      </div>

      {/* 按钮区 */}
      <div className="flex flex-col gap-2 w-full md:w-44">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium w-full hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? "查询中..." : "应用筛选"}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={loading}
          className="px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 w-full hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          重置
        </button>
      </div>
    </form>
  );
}
