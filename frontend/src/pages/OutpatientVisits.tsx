import { useState, useEffect, useMemo, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// 注册 Chart.js 组件
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// ==================== 类型定义 ====================
interface DepartmentOption {
  id: string;
  name: string;
}

interface DoctorOption {
  id: string;
  name: string;
  departmentId?: string;
  departmentName?: string;
}

// 简化的详情数据行
interface DetailsRow {
  id: string;
  date: string;
  doctorName: string;
  doctorCode: string;
  department: string;
  outpatientVisits: number;  // 门诊人次
  emergencyVisits: number;   // 急诊人次
}

// 时间序列数据
interface TSRow {
  date: string;
  outpatientEmergencyVisits: number;
  outpatientVisits: number;
  outpatientGrowthRate: number;
  emergencyVisits: number;
  emergencyGrowthRate: number;
}

// 汇总数据
interface SummaryViewModel {
  outpatientEmergencyVisits: { value: number; yoyChange: number; momChange: number };
  outpatientVisits: { value: number; yoyChange: number; momChange: number };
  outpatientGrowthRate: { value: number; yoyChange: number; momChange: number };
  emergencyVisits: { value: number; yoyChange: number; momChange: number };
  emergencyGrowthRate: { value: number; yoyChange: number; momChange: number };
}

interface ApiParams {
  start_date: string;
  end_date: string;
  department_ids?: string[];
  doctor_ids?: string[];
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  code?: number;
}

interface InitResponse {
  departments: DepartmentOption[];
  doctors: DoctorOption[];
  summary?: any;
}

// ==================== 工具函数 ====================
function getToday(offset: number = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().split("T")[0];
}

function getFirstDayOfMonth(): string {
  const date = new Date();
  date.setDate(1);
  return date.toISOString().split("T")[0];
}

function extractSummaryFromStd(data: any): SummaryViewModel | null {
  if (!data) return null;

  return {
    outpatientEmergencyVisits: {
      value: data.outpatientEmergencyVisits?.value ?? data.outpatient_emergency_visits?.value ?? data.outpatientEmergencyVisits ?? 0,
      yoyChange: data.outpatientEmergencyVisits?.yoyChange ?? data.outpatient_emergency_visits?.yoy_change ?? data.yoyOutpatientEmergencyVisits ?? 0,
      momChange: data.outpatientEmergencyVisits?.momChange ?? data.outpatient_emergency_visits?.mom_change ?? data.momOutpatientEmergencyVisits ?? 0
    },
    outpatientVisits: {
      value: data.outpatientVisits?.value ?? data.outpatient_visits?.value ?? data.outpatientVisits ?? 0,
      yoyChange: data.outpatientVisits?.yoyChange ?? data.outpatient_visits?.yoy_change ?? data.yoyOutpatientVisits ?? 0,
      momChange: data.outpatientVisits?.momChange ?? data.outpatient_visits?.mom_change ?? data.momOutpatientVisits ?? 0
    },
    outpatientGrowthRate: {
      value: data.outpatientGrowthRate?.value ?? data.outpatient_growth_rate?.value ?? data.outpatientGrowthRate ?? 0,
      yoyChange: data.outpatientGrowthRate?.yoyChange ?? data.outpatient_growth_rate?.yoy_change ?? data.yoyOutpatientGrowthRate ?? 0,
      momChange: data.outpatientGrowthRate?.momChange ?? data.outpatient_growth_rate?.mom_change ?? data.momOutpatientGrowthRate ?? 0
    },
    emergencyVisits: {
      value: data.emergencyVisits?.value ?? data.emergency_visits?.value ?? data.emergencyVisits ?? 0,
      yoyChange: data.emergencyVisits?.yoyChange ?? data.emergency_visits?.yoy_change ?? data.yoyEmergencyVisits ?? 0,
      momChange: data.emergencyVisits?.momChange ?? data.emergency_visits?.mom_change ?? data.momEmergencyVisits ?? 0
    },
    emergencyGrowthRate: {
      value: data.emergencyGrowthRate?.value ?? data.emergency_growth_rate?.value ?? data.emergencyGrowthRate ?? 0,
      yoyChange: data.emergencyGrowthRate?.yoyChange ?? data.emergency_growth_rate?.yoy_change ?? data.yoyEmergencyGrowthRate ?? 0,
      momChange: data.emergencyGrowthRate?.momChange ?? data.emergency_growth_rate?.mom_change ?? data.momEmergencyGrowthRate ?? 0
    },
  };
}

// ==================== API函数 ====================
const API_CONFIG = {
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
  }
};

async function handleApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
  }

  const result: ApiResponse<T> = await response.json();

  if (!result.success) {
    throw new Error(result.message || 'API请求失败');
  }

  return result.data;
}

function buildApiParams(start: string, end: string, deps: string[] | null, doctors: string[] | null): ApiParams {
  const params: ApiParams = {
    start_date: start,
    end_date: end
  };

  if (deps && deps.length > 0) {
    params.department_ids = deps;
  }

  if (doctors && doctors.length > 0) {
    params.doctor_ids = doctors;
  }

  return params;
}

async function fetchInitAPI(): Promise<InitResponse> {
  try {
    console.log('正在初始化门急诊人次数据...');
    const response = await fetch('/api/outpatient-visits/init', {
      method: 'GET',
      headers: API_CONFIG.headers
    });

    return await handleApiResponse<InitResponse>(response);
  } catch (error) {
    console.error('初始化失败:', error);
    throw new Error(`初始化失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function fetchSummaryAPI(params: ApiParams): Promise<any> {
  try {
    console.log('正在获取门急诊人次汇总数据:', params);
    const response = await fetch('/api/outpatient-visits/summary', {
      method: 'POST',
      headers: API_CONFIG.headers,
      body: JSON.stringify(params)
    });

    return await handleApiResponse<any>(response);
  } catch (error) {
    console.error('获取汇总数据失败:', error);
    throw error;
  }
}

async function fetchDetailsAPI(params: ApiParams): Promise<{ rows: DetailsRow[]; total: number }> {
  try {
    console.log('正在获取门急诊人次明细数据:', params);
    const response = await fetch('/api/outpatient-visits/details', {
      method: 'POST',
      headers: API_CONFIG.headers,
      body: JSON.stringify(params)
    });

    const data = await handleApiResponse<{ rows: any[]; total: number }>(response);

    // 处理简化的数据
    const processedRows = data.rows.map(item => ({
      id: `${item.doctor_code}_${item.date}`,
      date: item.date,
      doctorName: item.doctor_name,
      doctorCode: item.doctor_code,
      department: item.department,
      outpatientVisits: item.outpatient_visits || 0,
      emergencyVisits: item.emergency_visits || 0
    }));

    return {
      rows: processedRows,
      total: data.total
    };
  } catch (error) {
    console.error('获取明细数据失败:', error);
    throw error;
  }
}

async function fetchTimeseriesAPI(params: ApiParams): Promise<{ rows: TSRow[] }> {
  try {
    console.log('正在获取门急诊人次趋势数据:', params);
    const response = await fetch('/api/outpatient-visits/timeseries', {
      method: 'POST',
      headers: API_CONFIG.headers,
      body: JSON.stringify(params)
    });

    return await handleApiResponse<{ rows: TSRow[] }>(response);
  } catch (error) {
    console.error('获取趋势数据失败:', error);
    throw error;
  }
}

// ==================== 子组件 ====================

function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <div className="flex items-center">
        <div className="text-red-600 mr-3">⚠️</div>
        <div className="text-red-800">
          <p className="font-medium">请求失败</p>
          <p className="text-sm mt-1">{message}</p>
        </div>
      </div>
    </div>
  );
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = "请选择…",
  searchPlaceholder = "搜索…",
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  placeholder?: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(
    () =>
      !q
        ? options
        : options.filter(
            (o) =>
              o.label.toLowerCase().includes(q.toLowerCase()) ||
              o.value.toLowerCase().includes(q.toLowerCase())
          ),
    [options, q]
  );

  const allSelected = selected.size > 0 && selected.size === options.length;

  const toggle = (val: string) => {
    const next = new Set(selected);
    if (next.has(val)) {
      next.delete(val);
    } else {
      next.add(val);
    }
    onChange(next);
  };

  const handleAll = () => {
    if (allSelected) {
      onChange(new Set());
    } else {
      onChange(new Set(options.map((o) => o.value)));
    }
  };

  const clear = () => {
    onChange(new Set());
    setQ("");
  };

  const summaryText =
    selected.size === 0
      ? placeholder
      : selected.size === 1
      ? options.find((o) => o.value === Array.from(selected)[0])?.label ?? placeholder
      : `已选 ${selected.size} 项`;

  return (
    <div className="w-full text-left relative">
      <label className="text-sm font-medium text-gray-700 mb-2 block">{label}</label>
      <button
        type="button"
        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 bg-white flex items-center justify-between hover:border-blue-500 transition-colors duration-200 shadow-sm"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`truncate ${selected.size ? "text-gray-900" : "text-gray-500"}`}>
          {summaryText}
        </span>
        <span className="text-gray-400 transform transition-transform duration-200">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="absolute z-20 mt-2 w-full border border-gray-200 rounded-lg bg-white shadow-lg overflow-hidden">
          <div className="p-3 border-b border-gray-100">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
            />
          </div>
          <div className="max-h-64 overflow-auto">
            {options.length > 0 && (
              <label className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors duration-150">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={handleAll}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  {allSelected ? "取消全选" : "全选所有结果"}
                </span>
              </label>
            )}
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-gray-400 text-center">无匹配项</div>
            ) : (
              filtered.map((o) => (
                <label
                  key={o.value}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 cursor-pointer transition-colors duration-150 border-b border-gray-50 last:border-b-0"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(o.value)}
                    onChange={() => toggle(o.value)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 truncate">
                    {o.label}
                  </span>
                </label>
              ))
            )}
          </div>
          <div className="p-4 border-t border-gray-100 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-gray-500">
                共 {filtered.length} 项，已选 {selected.size} 项
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-white transition-colors duration-150 whitespace-nowrap"
                onClick={clear}
              >
                清空
              </button>
              <button
                type="button"
                className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-150 whitespace-nowrap"
                onClick={() => setOpen(false)}
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterBar({
  startDate,
  endDate,
  loading,
  departments,
  selectedDeps,
  onChangeStartDate,
  onChangeEndDate,
  onChangeSelectedDeps,
  onSubmit,
  onReset,
}: {
  startDate: string;
  endDate: string;
  loading: boolean;
  departments: DepartmentOption[];
  selectedDeps: Set<string>;
  onChangeStartDate: (date: string) => void;
  onChangeEndDate: (date: string) => void;
  onChangeSelectedDeps: (deps: Set<string>) => void;
  onSubmit: (e?: React.FormEvent) => void;
  onReset: () => void;
}) {
  const departmentOptions = useMemo(() =>
    departments.map(dept => ({ value: dept.id, label: dept.name })),
    [departments]
  );

  return (
    <form onSubmit={onSubmit}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 block">开始日期</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onChangeStartDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 block">结束日期</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onChangeEndDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
          />
        </div>

        <div className="space-y-2">
          <MultiSelect
            label="科室筛选"
            options={departmentOptions}
            selected={selectedDeps}
            onChange={onChangeSelectedDeps}
            placeholder="全部科室"
            searchPlaceholder="搜索科室…"
          />
        </div>

        <div className="flex items-end gap-2 col-span-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 font-medium flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                查询中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                查询
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="flex-1 px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200 font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            重置
          </button>
        </div>
      </div>
    </form>
  );
}

function SummaryCards({ summary }: { summary: SummaryViewModel | null }) {
  const indicators = [
    {
      key: 'outpatientEmergencyVisits',
      name: '门急诊总人次',
      color: '#EF4444',
      unit: '人次'
    },
    {
      key: 'outpatientVisits',
      name: '门诊人次',
      color: '#10B981',
      unit: '人次'
    },
    {
      key: 'outpatientGrowthRate',
      name: '门诊人次增减率',
      color: '#F59E0B',
      unit: '%'
    },
    {
      key: 'emergencyVisits',
      name: '急诊人次',
      color: '#8B5CF6',
      unit: '人次'
    },
    {
      key: 'emergencyGrowthRate',
      name: '急诊人次增减率',
      color: '#EC4899',
      unit: '%'
    }
  ];

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {indicators.map((indicator) => {
        const stat = summary ? summary[indicator.key as keyof typeof summary] : null;
        return (
          <div key={indicator.key} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{indicator.name}</h3>
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: indicator.color }}
              ></div>
            </div>
            <div className="space-y-4">
              <div className="text-3xl font-bold text-gray-900">
                {stat ? (
                  <>
                    {indicator.unit === '%' ?
                      `${stat.value >= 0 ? '+' : ''}${stat.value.toFixed(2)}` :
                      stat.value.toLocaleString()
                    }
                    <span className="text-lg font-normal ml-1 text-gray-500">{indicator.unit}</span>
                  </>
                ) : (
                  <span className="text-gray-400">--</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">同比</div>
                  {stat && stat.yoyChange !== 0 ? (
                    <div className={`text-lg font-semibold ${
                      stat.yoyChange > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {stat.yoyChange > 0 ? '+' : ''}{stat.yoyChange.toFixed(1)}%
                    </div>
                  ) : (
                    <div className="text-lg font-semibold text-gray-400">--</div>
                  )}
                </div>

                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">环比</div>
                  {stat && stat.momChange !== 0 ? (
                    <div className={`text-lg font-semibold ${
                      stat.momChange > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {stat.momChange > 0 ? '+' : ''}{stat.momChange.toFixed(1)}%
                    </div>
                  ) : (
                    <div className="text-lg font-semibold text-gray-400">--</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function DetailsTable({
  rows,
  page,
  pageSize,
  total,
  loading,
  sortKey,
  sortDir,
  onChangeSortKey,
  onChangeSortDir,
  onPageChange,
}: {
  rows: DetailsRow[];
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  sortKey: "date" | "department" | "outpatientVisits" | "emergencyVisits";
  sortDir: 'asc' | 'desc';
  onChangeSortKey: (key: "date" | "department" | "outpatientVisits" | "emergencyVisits") => void;
  onChangeSortDir: (dir: 'asc' | 'desc') => void;
  onPageChange: (page: number) => void;
}) {
  const processedRows = useMemo(() => {
    let filtered = rows;

    filtered = [...filtered].sort((a, b) => {
      let aVal: any = a[sortKey];
      let bVal: any = b[sortKey];

      if (sortKey === 'date') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    const startIndex = (page - 1) * pageSize;
    return filtered.slice(startIndex, startIndex + pageSize);
  }, [rows, sortKey, sortDir, page, pageSize]);

  const totalPages = Math.ceil(total / pageSize);

  const handleSort = (key: "date" | "department" | "outpatientVisits" | "emergencyVisits") => {
    if (sortKey === key) {
      onChangeSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      onChangeSortKey(key);
      onChangeSortDir('desc');
    }
  };

  const SortIcon = ({ columnKey }: { columnKey: "date" | "department" | "outpatientVisits" | "emergencyVisits" }) => {
    if (sortKey !== columnKey) return <span className="text-gray-400">↕</span>;
    return sortDir === 'asc' ? <span>↑</span> : <span>↓</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">加载数据中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          共 {total} 条记录，第 {page} / {totalPages} 页
        </div>
        <div className="text-xs text-gray-400">
          *点击列标题可排序
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('date')}
              >
                <div className="flex items-center gap-1">
                  日期
                  <SortIcon columnKey="date" />
                </div>
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('department')}
              >
                <div className="flex items-center gap-1">
                  科室
                  <SortIcon columnKey="department" />
                </div>
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('outpatientVisits')}
              >
                <div className="flex items-center gap-1">
                  门诊人次
                  <SortIcon columnKey="outpatientVisits" />
                </div>
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('emergencyVisits')}
              >
                <div className="flex items-center gap-1">
                  急诊人次
                  <SortIcon columnKey="emergencyVisits" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {processedRows.length > 0 ? (
              processedRows.map((row, index) => (
                <tr key={row.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {row.date}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {row.department}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {row.outpatientVisits.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {row.emergencyVisits.toLocaleString()}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                  <div className="text-4xl mb-2">🗃️</div>
                  <p className="text-lg mb-1">暂无详细数据</p>
                  <p className="text-sm text-gray-400">
                    请选择日期范围并点击查询按钮加载数据
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
          <div className="flex justify-between flex-1 sm:hidden">
            <button
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page === 1}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              上一页
            </button>
            <button
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              下一页
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                显示第 <span className="font-medium">{(page - 1) * pageSize + 1}</span> 到{' '}
                <span className="font-medium">{Math.min(page * pageSize, total)}</span> 条，共{' '}
                <span className="font-medium">{total}</span> 条结果
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                <button
                  onClick={() => onPageChange(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  <span className="sr-only">上一页</span>
                  ←
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => onPageChange(pageNum)}
                      className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                        page === pageNum
                          ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                          : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  <span className="sr-only">下一页</span>
                  →
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TrendSection({
  rows,
}: {
  rows: TSRow[];
}) {
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>([
    'outpatientEmergencyVisits',
    'outpatientVisits',
    'emergencyVisits'
  ]);

  const indicators = [
    {
      key: 'outpatientEmergencyVisits',
      name: '门急诊总人次',
      color: '#EF4444'
    },
    {
      key: 'outpatientVisits',
      name: '门诊人次',
      color: '#10B981'
    },
    {
      key: 'outpatientGrowthRate',
      name: '门诊人次增减率',
      color: '#F59E0B'
    },
    {
      key: 'emergencyVisits',
      name: '急诊人次',
      color: '#8B5CF6'
    },
    {
      key: 'emergencyGrowthRate',
      name: '急诊人次增减率',
      color: '#EC4899'
    }
  ];

  const toggleIndicator = (key: string) => {
    setSelectedIndicators(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  const getChartOptions = () => ({
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: '门急诊人次指标趋势分析'
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: '时间'
        }
      },
      y: {
        title: {
          display: true,
          text: '人次/百分比'
        }
      }
    }
  });

  const getChartData = () => {
    const labels = rows.map(item => item.date);
    const datasets = indicators
      .filter(indicator => selectedIndicators.includes(indicator.key))
      .map(indicator => ({
        label: indicator.name,
        data: rows.map(item => item[indicator.key as keyof TSRow]),
        borderColor: indicator.color,
        backgroundColor: indicator.color + '20',
        tension: 0.1
      }));

    return { labels, datasets };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">门急诊人次指标趋势分析</h3>
      </div>

      {/* 指标选择器 */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center mb-3">
          <span className="text-sm text-gray-600 mr-3">显示指标：</span>
          <button
            onClick={() => setSelectedIndicators(
              selectedIndicators.length === indicators.length ? [] : indicators.map(ind => ind.key)
            )}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            {selectedIndicators.length === indicators.length ? '取消全选' : '全选'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {indicators.map((indicator) => (
            <button
              key={indicator.key}
              onClick={() => toggleIndicator(indicator.key)}
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedIndicators.includes(indicator.key)
                  ? 'text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              style={{
                backgroundColor: selectedIndicators.includes(indicator.key) ? indicator.color : undefined
              }}
            >
              <div
                className="w-2 h-2 rounded-full mr-2"
                style={{ backgroundColor: indicator.color }}
              ></div>
              {indicator.name}
            </button>
          ))}
        </div>
      </div>

      {/* 趋势图表 */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="h-80">
          {rows.length > 0 ? (
            <Line data={getChartData()} options={getChartOptions()} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-4xl mb-2">📊</div>
                <p className="text-lg mb-1">暂无趋势数据</p>
                <p className="text-sm text-gray-400">
                  请选择日期范围并点击查询按钮加载数据
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">趋势数据预览</h4>
          <div className="text-xs text-gray-600">
            共 {rows.length} 个数据点
          </div>
        </div>
      )}
    </div>
  );
}

function Toolbar({
  viewMode,
  onChangeView,
}: {
  viewMode: 'details' | 'chart';
  onChangeView: (view: 'details' | 'chart') => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        onClick={() => onChangeView('details')}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          viewMode === 'details'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        详情数据
      </button>
      <button
        onClick={() => onChangeView('chart')}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          viewMode === 'chart'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        趋势分析
      </button>
    </div>
  );
}

// ==================== 主组件 ====================
export default function OutpatientVisits() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [summary, setSummary] = useState<SummaryViewModel | null>(null);

  const rowsPerPage = 20;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [details, setDetails] = useState<DetailsRow[]>([]);

  const [sortKey, setSortKey] = useState<"date" | "department" | "outpatientVisits" | "emergencyVisits">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [tsRows, setTsRows] = useState<TSRow[]>([]);

  const [viewMode, setViewMode] = useState<"details" | "chart">("details");

  const [startDate, setStartDate] = useState(getFirstDayOfMonth());
  const [endDate, setEndDate] = useState(getToday());

  const [selectedDeps, setSelectedDeps] = useState<Set<string>>(new Set());

  // URL同步视图模式
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const v = sp.get("view");
      if (v === "chart" || v === "details") {
        setViewMode(v);
      }
    } catch {
      // ignore
    }
  }, []);

  const setAndSyncView = useCallback((v: "details" | "chart") => {
    setViewMode(v);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("view", v);
      window.history.replaceState({}, "", url);
    } catch {
      // ignore
    }
  }, []);

  // 获取筛选参数
  const getApiParams = useCallback((): ApiParams => {
    return buildApiParams(
      startDate,
      endDate,
      selectedDeps.size > 0 ? Array.from(selectedDeps) : null,
      null // 不再传递医生筛选参数
    );
  }, [startDate, endDate, selectedDeps]);

  // 初始化
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError("");
      try {
        console.log('开始初始化门急诊人次数据...');
        const data = await fetchInitAPI();

        setDepartments(Array.isArray(data?.departments) ? data.departments : []);
        setDoctors(Array.isArray(data?.doctors) ? data.doctors : []);

        console.log('科室列表加载完成:', data?.departments?.length || 0);
        console.log('医生列表加载完成:', data?.doctors?.length || 0);

        if (data.summary) {
          const parsed = extractSummaryFromStd(data.summary);
          setSummary(parsed);
          console.log('初始化汇总数据加载完成:', parsed);
        }

        setPage(1);
        setSortKey("date");
        setSortDir("desc");

        console.log('开始加载明细和趋势数据...');
        const initParams = getApiParams();
        await Promise.all([
          loadDetails(initParams),
          loadTimeseries(initParams),
        ]);

        if (!data.summary) {
          await loadSummary(initParams);
        }

        console.log('初始化完成');
      } catch (e: any) {
        console.error('初始化失败:', e);
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [getApiParams]);

  // 数据加载函数
  const loadSummary = useCallback(async (params: ApiParams) => {
    try {
      console.log('正在加载汇总数据:', params);
      const data = await fetchSummaryAPI(params);
      const curSum = extractSummaryFromStd(data);
      setSummary(curSum);
      console.log('汇总数据加载完成');
    } catch (error) {
      console.error('加载汇总数据失败:', error);
      throw error;
    }
  }, []);

  const loadDetails = useCallback(async (params: ApiParams) => {
    try {
      console.log('正在加载明细数据:', params);
      const data = await fetchDetailsAPI(params);

      const rows = Array.isArray(data?.rows) ? data.rows : [];
      setDetails(rows);
      console.log(`明细数据加载完成，共 ${rows.length} 条记录`);

      setTotal(
        Number.isFinite(data?.total) ? Number(data.total) : rows.length
      );
    } catch (error) {
      console.error('加载明细数据失败:', error);
      throw error;
    }
  }, []);

  const loadTimeseries = useCallback(async (params: ApiParams) => {
    try {
      console.log('正在加载趋势数据:', params);
      const data = await fetchTimeseriesAPI(params);
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      setTsRows(rows);
      console.log(`趋势数据加载完成，共 ${rows.length} 个时间点`);
    } catch (error) {
      console.error('加载趋势数据失败:', error);
      throw error;
    }
  }, []);

  // 提交筛选
  const onSubmitSummary = async (e?: React.FormEvent) => {
    e?.preventDefault?.();
    setError("");

    if (!startDate || !endDate) {
      setError("请选择开始日期和结束日期");
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setError("开始日期不能晚于结束日期");
      return;
    }

    try {
      setLoading(true);
      const params = getApiParams();
      console.log('提交筛选条件:', params);

      await Promise.all([
        loadSummary(params),
        loadDetails(params),
        loadTimeseries(params)
      ]);

      setPage(1);
      console.log('筛选查询完成');
    } catch (e: any) {
      console.error('筛选查询失败:', e);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  // 重置
  const onReset = async () => {
    console.log('执行重置操作');
    setStartDate(getFirstDayOfMonth());
    setEndDate(getToday());
    setSelectedDeps(new Set());
    setError("");
    setPage(1);
    setSortKey("date");
    setSortDir("desc");

    setLoading(true);
    try {
      const params = buildApiParams(getFirstDayOfMonth(), getToday(), null, null);
      await Promise.all([
        loadSummary(params),
        loadDetails(params),
        loadTimeseries(params)
      ]);
      console.log('重置操作完成');
    } catch (e: any) {
      console.error('重置操作失败:', e);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  // 分页处理
  const handlePageChange = useCallback((nextPage: number) => {
    console.log('切换页码:', nextPage);
    setPage(nextPage);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* 页面标题 */}
      <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <h1 className="text-2xl font-bold text-gray-900">门急诊人次指标分析</h1>
            <p className="text-gray-600 text-sm mt-2">
              监控和分析门急诊服务的各项人次指标，包括门急诊总人次、门诊人次、增减率等关键数据，支持同比环比分析
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium text-gray-900">
                {startDate} 至 {endDate} 数据
              </div>
              <div className="text-xs text-gray-500">数据来源: 医院信息系统</div>
            </div>
          </div>
        </div>
      </header>

      {/* 错误提示 */}
      {error && <ErrorAlert message={error} />}

      {/* 筛选区域 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 text-left">数据筛选</h2>
        <FilterBar
          startDate={startDate}
          endDate={endDate}
          loading={loading}
          departments={departments}
          selectedDeps={selectedDeps}
          onChangeStartDate={setStartDate}
          onChangeEndDate={setEndDate}
          onChangeSelectedDeps={setSelectedDeps}
          onSubmit={onSubmitSummary}
          onReset={onReset}
        />
      </section>

      {/* 汇总卡片 */}
      <SummaryCards summary={summary} />

      {/* 工具栏 + 数据详情 / 趋势分析区域 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 lg:mb-0">
            {viewMode === "details" ? "详情数据" : "趋势分析图表"}
          </h2>
          <Toolbar
            viewMode={viewMode}
            onChangeView={setAndSyncView}
          />
        </div>

        {/* 数据详情 */}
        <div className={viewMode === "chart" ? "hidden" : ""}>
          <DetailsTable
            rows={details}
            page={page}
            pageSize={rowsPerPage}
            total={total}
            loading={loading}
            sortKey={sortKey}
            sortDir={sortDir}
            onChangeSortKey={setSortKey}
            onChangeSortDir={setSortDir}
            onPageChange={handlePageChange}
          />
        </div>

        {/* 趋势分析 */}
        <div className={viewMode === "details" ? "hidden" : ""}>
          <TrendSection rows={tsRows} />
        </div>
      </section>
    </div>
  );
}