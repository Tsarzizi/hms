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

interface DRGEfficiencyData {
  avgHospitalizationDays: number;     // DRG出院患者平均住院日
  avgPreoperativeDays: number;        // DRG出院患者术前平均住院日
  totalBedDays: number;               // DRG出院患者占用总床日数
}

interface ChartDataItem {
  date: string;
  data: DRGEfficiencyData;
}

interface SummaryData {
  avgHospitalizationDays: number;
  avgPreoperativeDays: number;
  totalBedDays: number;
}

interface ComparisonData {
  current_value: number;
  comparison_value: number;
  change_rate: number;
  change_type: string;
}

interface DepartmentOption {
  id: string;
  name: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  code?: number;
}

interface InitResponse {
  departments: DepartmentOption[];
}

interface DetailData {
  billing_date: string;
  dep_code: string;
  dep_name: string;
  avg_hospitalization_days: number;
  avg_preoperative_days: number;
  total_bed_days: number;
  total_patients: number;
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

// ==================== API 配置 ====================
const API_CONFIG = {
  baseURL: '/api/drg-efficiency',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
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

// ==================== API 函数 ====================
async function fetchInitData(): Promise<InitResponse> {
  try {
    console.log('正在初始化DRG效率数据...');
    const response = await fetch(`${API_CONFIG.baseURL}/init`, {
      method: 'GET',
      headers: API_CONFIG.headers
    });
    return await handleApiResponse<InitResponse>(response);
  } catch (error) {
    console.error('初始化数据失败:', error);
    throw new Error(`初始化失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function fetchChartData(params: any): Promise<ChartDataItem[]> {
  try {
    console.log('正在获取图表数据:', params);
    const queryParams = new URLSearchParams();
    Object.keys(params).forEach(key => {
      if (params[key] !== null && params[key] !== undefined) {
        if (Array.isArray(params[key])) {
          params[key].forEach((value: string) => queryParams.append(key, value));
        } else {
          queryParams.append(key, params[key]);
        }
      }
    });

    const response = await fetch(`${API_CONFIG.baseURL}/efficiency-chart?${queryParams}`, {
      method: 'GET',
      headers: API_CONFIG.headers
    });
    const data = await handleApiResponse<ChartDataItem[]>(response);
    console.log('图表数据获取成功，条数:', data.length);
    return data;
  } catch (error) {
    console.error('获取图表数据失败:', error);
    throw error;
  }
}

async function fetchSummaryData(params: any): Promise<SummaryData> {
  try {
    console.log('正在获取汇总数据:', params);
    const queryParams = new URLSearchParams();
    Object.keys(params).forEach(key => {
      if (params[key] !== null && params[key] !== undefined) {
        if (Array.isArray(params[key])) {
          params[key].forEach((value: string) => queryParams.append(key, value));
        } else {
          queryParams.append(key, params[key]);
        }
      }
    });

    const response = await fetch(`${API_CONFIG.baseURL}/efficiency-summary?${queryParams}`, {
      method: 'GET',
      headers: API_CONFIG.headers
    });
    const data = await handleApiResponse<SummaryData>(response);
    console.log('汇总数据获取成功:', data);
    return data;
  } catch (error) {
    console.error('获取汇总数据失败:', error);
    throw error;
  }
}

async function fetchComparisonData(type: 'yoy' | 'mom', params: any): Promise<{ [key: string]: ComparisonData }> {
  try {
    console.log(`正在获取${type === 'yoy' ? '同比' : '环比'}数据:`, params);
    const queryParams = new URLSearchParams();
    queryParams.append('type', type);
    Object.keys(params).forEach(key => {
      if (params[key] !== null && params[key] !== undefined) {
        if (Array.isArray(params[key])) {
          params[key].forEach((value: string) => queryParams.append(key, value));
        } else {
          queryParams.append(key, params[key]);
        }
      }
    });

    const response = await fetch(`${API_CONFIG.baseURL}/efficiency-comparison?${queryParams}`, {
      method: 'GET',
      headers: API_CONFIG.headers
    });
    const data = await handleApiResponse<{ [key: string]: ComparisonData }>(response);
    console.log(`${type === 'yoy' ? '同比' : '环比'}数据获取成功:`, data);
    return data;
  } catch (error) {
    console.error(`获取${type === 'yoy' ? '同比' : '环比'}数据失败:`, error);
    throw error;
  }
}

async function fetchDetailData(params: any): Promise<DetailData[]> {
  try {
    console.log('正在获取详细数据:', params);
    const queryParams = new URLSearchParams();
    Object.keys(params).forEach(key => {
      if (params[key] !== null && params[key] !== undefined) {
        if (Array.isArray(params[key])) {
          params[key].forEach((value: string) => queryParams.append(key, value));
        } else {
          queryParams.append(key, params[key]);
        }
      }
    });

    const response = await fetch(`${API_CONFIG.baseURL}/efficiency-detail?${queryParams}`, {
      method: 'GET',
      headers: API_CONFIG.headers
    });
    const data = await handleApiResponse<DetailData[]>(response);
    console.log('详细数据获取成功，条数:', data.length);
    return data;
  } catch (error) {
    console.error('获取详细数据失败:', error);
    throw error;
  }
}

// ==================== 多选下拉组件 ====================
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

// ==================== 错误提示组件 ====================
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

// ==================== 筛选栏组件 ====================
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
  departments: { value: string; label: string }[];
  selectedDeps: Set<string>;
  onChangeStartDate: (date: string) => void;
  onChangeEndDate: (date: string) => void;
  onChangeSelectedDeps: (deps: Set<string>) => void;
  onSubmit: (e?: React.FormEvent) => void;
  onReset: () => void;
}) {
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
            options={departments}
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

// ==================== 汇总卡片组件 ====================
function SummaryCards({
  summary,
  yoyData,
  momData
}: {
  summary: SummaryData | null;
  yoyData: { [key: string]: ComparisonData };
  momData: { [key: string]: ComparisonData };
}) {
  const indicators = [
    {
      key: 'avgHospitalizationDays',
      name: 'DRG出院患者平均住院日',
      color: '#8B5CF6',
      unit: '天'
    },
    {
      key: 'avgPreoperativeDays',
      name: 'DRG出院患者术前平均住院日',
      color: '#06B6D4',
      unit: '天'
    },
    {
      key: 'totalBedDays',
      name: 'DRG出院患者占用总床日数',
      color: '#10B981',
      unit: '床日'
    }
  ];

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('zh-CN').format(num);
  };

  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {indicators.map((indicator) => {
        const stat = summary ? summary[indicator.key as keyof SummaryData] : null;
        const yoy = yoyData[indicator.key];
        const mom = momData[indicator.key];

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
                    {indicator.key === 'totalBedDays' ? formatNumber(stat) : stat.toFixed(1)}
                    <span className="text-lg font-normal ml-1 text-gray-500">{indicator.unit}</span>
                  </>
                ) : (
                  <span className="text-gray-400">--</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">同比</div>
                  {yoy ? (
                    <div className={`text-lg font-semibold ${
                      yoy.change_rate > 0 ? 'text-green-600' : yoy.change_rate < 0 ? 'text-red-600' : 'text-gray-600'
                    }`}>
                      {yoy.change_rate > 0 ? '+' : ''}{yoy.change_rate.toFixed(1)}%
                    </div>
                  ) : (
                    <div className="text-lg font-semibold text-gray-400">--</div>
                  )}
                </div>

                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">环比</div>
                  {mom ? (
                    <div className={`text-lg font-semibold ${
                      mom.change_rate > 0 ? 'text-green-600' : mom.change_rate < 0 ? 'text-red-600' : 'text-gray-600'
                    }`}>
                      {mom.change_rate > 0 ? '+' : ''}{mom.change_rate.toFixed(1)}%
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

const indicators = [
  {
    key: 'avgHospitalizationDays',
    name: 'DRG出院患者平均住院日',
    color: '#8B5CF6',
    unit: '天'
  },
  {
    key: 'avgPreoperativeDays',
    name: 'DRG出院患者术前平均住院日',
    color: '#06B6D4',
    unit: '天'
  },
  {
    key: 'totalBedDays',
    name: 'DRG出院患者占用总床日数',
    color: '#10B981',
    unit: '床日'
  }
];

// ==================== 详细数据表格组件 ====================
function DetailedDataTable({
  detailData,
  selectedDeps,
  departments
}: {
  detailData: DetailData[];
  selectedDeps: Set<string>;
  departments: DepartmentOption[];
}) {
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // 格式化数字
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('zh-CN').format(num);
  };

  // 获取科室显示文本
  const getDepartmentDisplayText = useCallback((departmentCode: string, departmentName?: string) => {
    if (departmentName) return departmentName;
    const dept = departments.find(d => d.id === departmentCode);
    return dept ? dept.name : departmentCode;
  }, [departments]);

  // 分页计算
  const totalItems = detailData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  // 确保当前页在有效范围内
  const safeCurrentPage = Math.max(1, Math.min(currentPage, totalPages));

  // 当前页的数据
  const currentData = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return detailData.slice(startIndex, endIndex);
  }, [detailData, safeCurrentPage, itemsPerPage]);

  // 当数据变化时，重置到第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [detailData]);

  // 分页处理函数
  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const goToPrevious = () => {
    setCurrentPage(prev => Math.max(1, prev - 1));
  };

  const goToNext = () => {
    setCurrentPage(prev => Math.min(totalPages, prev + 1));
  };

  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newItemsPerPage = parseInt(e.target.value, 10);
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // 重置到第一页
  };

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">详细数据</h2>

        {/* 分页控制 - 顶部 */}
        {detailData.length > 0 && (
          <div className="flex items-center gap-4 mt-2 lg:mt-0">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">每页显示:</span>
              <select
                value={itemsPerPage}
                onChange={handleItemsPerPageChange}
                className="border border-gray-300 rounded-lg px-3 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value={5}>5条</option>
                <option value={10}>10条</option>
                <option value={20}>20条</option>
                <option value={50}>50条</option>
              </select>
            </div>

            <div className="text-sm text-gray-600">
              第 {safeCurrentPage} 页，共 {totalPages} 页
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                时间
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                科室
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                平均住院日
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                术前平均住院日
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                占用总床日数
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                患者人数
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {currentData.length > 0 ? (
              currentData.map((item, index) => (
                <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {item.billing_date}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {getDepartmentDisplayText(item.dep_code, item.dep_name)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {item.avg_hospitalization_days.toFixed(1)}天
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {item.avg_preoperative_days.toFixed(1)}天
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatNumber(item.total_bed_days)}床日
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatNumber(item.total_patients)}人
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
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

      {/* 分页控制 - 底部 */}
      {detailData.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-6 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            显示第 {(safeCurrentPage - 1) * itemsPerPage + 1} 到{' '}
            {Math.min(safeCurrentPage * itemsPerPage, totalItems)} 条，共 {totalItems} 条记录
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={goToPrevious}
              disabled={safeCurrentPage === 1}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                safeCurrentPage === 1
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              上一页
            </button>

            {/* 页码显示 */}
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (safeCurrentPage <= 3) {
                  pageNum = i + 1;
                } else if (safeCurrentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = safeCurrentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => goToPage(pageNum)}
                    className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                      safeCurrentPage === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              {totalPages > 5 && safeCurrentPage < totalPages - 2 && (
                <>
                  <span className="px-2 text-gray-400">...</span>
                  <button
                    onClick={() => goToPage(totalPages)}
                    className="w-10 h-10 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm font-medium transition-colors"
                  >
                    {totalPages}
                  </button>
                </>
              )}
            </div>

            <button
              onClick={goToNext}
              disabled={safeCurrentPage === totalPages}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                safeCurrentPage === totalPages
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function DRGEfficiency() {
  const [chartData, setChartData] = useState<ChartDataItem[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [yoyData, setYoyData] = useState<{ [key: string]: ComparisonData }>({});
  const [momData, setMomData] = useState<{ [key: string]: ComparisonData }>({});
  const [detailData, setDetailData] = useState<DetailData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>(
    indicators.map(ind => ind.key)
  );

  // 科室数据状态
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);

  // 筛选条件状态
  const [startDate, setStartDate] = useState(getFirstDayOfMonth());
  const [endDate, setEndDate] = useState(getToday());
  const [selectedDeps, setSelectedDeps] = useState<Set<string>>(new Set());

  // 构建API参数
  const getApiParams = useCallback(() => {
    const params: any = {
      start_date: startDate,
      end_date: endDate
    };

    if (selectedDeps.size > 0) {
      params.department_ids = Array.from(selectedDeps);
    }

    return params;
  }, [startDate, endDate, selectedDeps]);

  // 初始化数据 - 获取科室列表
  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      setError("");
      try {
        // 获取科室列表
        console.log('开始初始化DRG效率数据...');
        const initData = await fetchInitData();
        setDepartments(initData.departments);
        console.log('科室数据加载完成');

        // 获取业务数据
        const params = getApiParams();
        console.log('开始获取业务数据...');
        await Promise.all([
          fetchChartData(params).then(setChartData),
          fetchSummaryData(params).then(setSummaryData),
          fetchComparisonData('yoy', params).then(setYoyData),
          fetchComparisonData('mom', params).then(setMomData),
          fetchDetailData(params).then(setDetailData)
        ]);
        console.log('所有业务数据加载完成');
      } catch (error) {
        console.error('初始化数据失败:', error);
        setError(`数据加载失败: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setLoading(false);
      }
    };

    initializeData();
  }, [getApiParams]);

  const toggleIndicator = (key: string) => {
    setSelectedIndicators(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('zh-CN').format(num);
  };

  const getChartOptions = () => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: `DRG效率分析趋势图`
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
          text: selectedIndicators.includes('totalBedDays') ? '天数 (天) / 床日数' : '天数 (天)'
        },
        beginAtZero: true
      }
    },
    elements: {
      line: {
        tension: 0.1,
        borderWidth: 2,
        fill: false
      },
      point: {
        radius: 4,
        hoverRadius: 6
      }
    },
    showLine: true
  });

  const getChartData = () => {
    if (!chartData || chartData.length === 0) {
      return {
        labels: [],
        datasets: []
      };
    }

    const labels = chartData.map(item => item.date);
    const datasets = indicators
      .filter(indicator => selectedIndicators.includes(indicator.key))
      .map(indicator => ({
        label: indicator.name,
        data: chartData.map(item => {
          const value = item.data[indicator.key as keyof DRGEfficiencyData];
          return typeof value === 'number' ? value : 0;
        }),
        borderColor: indicator.color,
        backgroundColor: indicator.color + '80',
        tension: 0.1,
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: false,
        showLine: true,
        yAxisID: indicator.key === 'totalBedDays' ? 'y1' : 'y'
      }));

    return {
      labels,
      datasets,
      // 为床日数指标添加第二个Y轴
      ...(selectedIndicators.includes('totalBedDays') && {
        scales: {
          y: {
            type: 'linear' as const,
            display: true,
            position: 'left' as const,
            title: {
              display: true,
              text: '天数 (天)'
            }
          },
          y1: {
            type: 'linear' as const,
            display: true,
            position: 'right' as const,
            title: {
              display: true,
              text: '床日数'
            },
            grid: {
              drawOnChartArea: false,
            },
          }
        }
      })
    };
  };

  // 提交筛选
  const handleQuery = async (e?: React.FormEvent) => {
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

    setLoading(true);
    try {
      const params = getApiParams();
      console.log('提交筛选查询:', params);
      await Promise.all([
        fetchChartData(params).then(setChartData),
        fetchSummaryData(params).then(setSummaryData),
        fetchComparisonData('yoy', params).then(setYoyData),
        fetchComparisonData('mom', params).then(setMomData),
        fetchDetailData(params).then(setDetailData)
      ]);
      console.log('筛选查询完成');
    } catch (error) {
      console.error('查询数据失败:', error);
      setError(`查询失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  // 重置筛选条件
  const handleReset = () => {
    setStartDate(getFirstDayOfMonth());
    setEndDate(getToday());
    setSelectedDeps(new Set());
    setError("");
  };

  // 处理科室选项
  const departmentOptions = useMemo(() =>
    departments.map(dept => ({ value: dept.id, label: dept.name })),
    [departments]
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* 页面标题 */}
      <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <h1 className="text-2xl font-bold text-gray-900">DRG效率分析</h1>
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
          departments={departmentOptions}
          selectedDeps={selectedDeps}
          onChangeStartDate={setStartDate}
          onChangeEndDate={setEndDate}
          onChangeSelectedDeps={setSelectedDeps}
          onSubmit={handleQuery}
          onReset={handleReset}
        />
      </section>

      {/* 汇总卡片 */}
      <SummaryCards
        summary={summaryData}
        yoyData={yoyData}
        momData={momData}
      />

      {/* 图表区域 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 lg:mb-0">趋势分析图表</h2>

          {/* 指标选择器 */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700">显示指标：</span>
            <button
              onClick={() => setSelectedIndicators(
                selectedIndicators.length === indicators.length ? [] : indicators.map(ind => ind.key)
              )}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              {selectedIndicators.length === indicators.length ? '取消全选' : '全选'}
            </button>
          </div>
        </div>

        {/* 指标选择器 */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            {indicators.map((indicator) => (
              <button
                key={indicator.key}
                onClick={() => toggleIndicator(indicator.key)}
                className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
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
                  style={{ backgroundColor: selectedIndicators.includes(indicator.key) ? 'white' : indicator.color }}
                ></div>
                {indicator.name}
              </button>
            ))}
          </div>
        </div>

        {/* 图表区域 */}
        <div className="h-[500px] flex items-center justify-center">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-500">加载数据中...</p>
              </div>
            </div>
          ) : chartData.length > 0 ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-full max-w-4xl h-full">
                <Line data={getChartData()} options={getChartOptions()} />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg w-full">
              <div className="text-center">
                <div className="text-6xl text-gray-300 mb-4">📊</div>
                <p className="text-gray-500 mb-2 text-lg">暂无图表数据</p>
                <p className="text-gray-400">
                  请选择日期范围并点击查询按钮加载数据
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 详细数据表格 */}
      <DetailedDataTable
        detailData={detailData}
        selectedDeps={selectedDeps}
        departments={departments}
      />
    </div>
  );
}