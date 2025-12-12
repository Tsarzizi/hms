// src/yiliaofudan/zhuyuanfeiyong/frontend/zhongtifenxi.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

interface HospitalizationCostData {
  date: string;
  avgMedicalCost: number;
  avgDrugCost: number;
  avgDailyMedicalCost: number;
  costChangeRate: number;
}

interface DiseaseCostItem {
  disease: string;
  avgCost: number;
  patientCount: number;
  avgStayDays: number;
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

interface ChartDataItem {
  date: string;
  data: HospitalizationCostData;
}

interface SummaryData {
  avgMedicalCost: number;
  avgDrugCost: number;
  avgDailyMedicalCost: number;
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
  baseURL: '/api/inpatient-cost-overall',
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
    console.log('正在初始化住院费用数据...');
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

    const response = await fetch(`${API_CONFIG.baseURL}/chart?${queryParams}`, {
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

    const response = await fetch(`${API_CONFIG.baseURL}/summary?${queryParams}`, {
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

    const response = await fetch(`${API_CONFIG.baseURL}/comparison?${queryParams}`, {
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

async function fetchDiseaseCostData(params: any): Promise<DiseaseCostItem[]> {
  try {
    console.log('正在获取病种费用数据:', params);
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

    const response = await fetch(`${API_CONFIG.baseURL}/disease-cost?${queryParams}`, {
      method: 'GET',
      headers: API_CONFIG.headers
    });
    const data = await handleApiResponse<DiseaseCostItem[]>(response);
    console.log('病种费用数据获取成功:', data);
    return data;
  } catch (error) {
    console.error('获取病种费用数据失败:', error);
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

// ==================== 分页组件 ====================
function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (itemsPerPage: number) => void;
}) {
  const goToPrevious = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const goToNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newItemsPerPage = parseInt(e.target.value, 10);
    onItemsPerPageChange(newItemsPerPage);
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-6 border-t border-gray-200">
      <div className="text-sm text-gray-600">
        显示第 {(currentPage - 1) * itemsPerPage + 1} 到{' '}
        {Math.min(currentPage * itemsPerPage, totalItems)} 条，共 {totalItems} 条记录
      </div>

      <div className="flex items-center gap-4">
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

        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevious}
            disabled={currentPage === 1}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentPage === 1
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
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => onPageChange(pageNum)}
                  className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === pageNum
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            {totalPages > 5 && currentPage < totalPages - 2 && (
              <>
                <span className="px-2 text-gray-400">...</span>
                <button
                  onClick={() => onPageChange(totalPages)}
                  className="w-10 h-10 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm font-medium transition-colors"
                >
                  {totalPages}
                </button>
              </>
            )}
          </div>

          <button
            onClick={goToNext}
            disabled={currentPage === totalPages}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentPage === totalPages
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== 详细数据表格组件 ====================
function DetailedDataTable({ chartData }: { chartData: ChartDataItem[] }) {
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const formatValue = (value: number, unit: string = '') => {
    if (unit === '元' && value >= 10000) {
      return `${(value / 10000).toFixed(2)}万元`;
    }
    return `${value.toFixed(2)}${unit}`;
  };

  // 分页计算
  const totalItems = chartData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  // 确保当前页在有效范围内
  const safeCurrentPage = Math.max(1, Math.min(currentPage, totalPages));

  // 当前页的数据
  const currentData = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return chartData.slice(startIndex, endIndex);
  }, [chartData, safeCurrentPage, itemsPerPage]);

  // 当数据变化时，重置到第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [chartData]);

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">详细数据统计</h2>

        {/* 分页控制 - 顶部 */}
        {chartData.length > 0 && (
          <div className="flex items-center gap-4 mt-2 lg:mt-0">
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
                期间
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                次均医药费用
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                次均药费
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                日均医药费用
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                费用变动率
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {currentData.length > 0 ? (
              currentData.map((item, index) => (
                <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {item.date}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-purple-600 font-medium">
                    {formatValue(item.data.avgMedicalCost, '元')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-cyan-600">
                    {formatValue(item.data.avgDrugCost, '元')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                    {formatValue(item.data.avgDailyMedicalCost, '元')}
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                    item.data.costChangeRate > 0 ? 'text-red-600' : item.data.costChangeRate < 0 ? 'text-green-600' : 'text-gray-600'
                  }`}>
                    {item.data.costChangeRate > 0 ? '+' : ''}{formatValue(item.data.costChangeRate, '%')}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
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

      {/* 分页控制 */}
      {chartData.length > 0 && (
        <Pagination
          currentPage={safeCurrentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={(newItemsPerPage) => {
            setItemsPerPage(newItemsPerPage);
            setCurrentPage(1);
          }}
        />
      )}
    </section>
  );
}

// ==================== 病种费用表格组件 ====================
function DiseaseCostTable({ diseaseCostData }: { diseaseCostData: DiseaseCostItem[] }) {
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const formatValue = (value: number, unit: string = '') => {
    if (unit === '元' && value >= 10000) {
      return `${(value / 10000).toFixed(2)}万元`;
    }
    return `${value.toFixed(2)}${unit}`;
  };

  // 分页计算
  const totalItems = diseaseCostData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  // 确保当前页在有效范围内
  const safeCurrentPage = Math.max(1, Math.min(currentPage, totalPages));

  // 当前页的数据
  const currentData = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return diseaseCostData.slice(startIndex, endIndex);
  }, [diseaseCostData, safeCurrentPage, itemsPerPage]);

  // 当数据变化时，重置到第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [diseaseCostData]);

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">各病种费用详细数据</h2>

        {/* 分页控制 - 顶部 */}
        {diseaseCostData.length > 0 && (
          <div className="flex items-center gap-4 mt-2 lg:mt-0">
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
                病种名称
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                次均费用
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                患者数量
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                平均住院天数
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                日均费用
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {currentData.length > 0 ? (
              currentData.map((item, index) => (
                <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {item.disease}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-purple-600">
                    {formatValue(item.avgCost, '元')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {item.patientCount}人
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">
                    {formatValue(item.avgStayDays, '天')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                    {formatValue(item.avgCost / item.avgStayDays, '元')}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  <div className="text-4xl mb-2">📊</div>
                  <p className="text-lg mb-1">暂无病种费用数据</p>
                  <p className="text-sm text-gray-400">
                    请选择日期范围并点击查询按钮加载数据
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 分页控制 */}
      {diseaseCostData.length > 0 && (
        <Pagination
          currentPage={safeCurrentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={(newItemsPerPage) => {
            setItemsPerPage(newItemsPerPage);
            setCurrentPage(1);
          }}
        />
      )}
    </section>
  );
}

const indicators = [
  {
    key: 'avgMedicalCost',
    name: '住院患者次均医药费用',
    color: '#8B5CF6',
    unit: '元'
  },
  {
    key: 'avgDrugCost',
    name: '住院患者次均药费',
    color: '#06B6D4',
    unit: '元'
  },
  {
    key: 'avgDailyMedicalCost',
    name: '住院患者日均医药费用',
    color: '#10B981',
    unit: '元'
  }
];

export default function HospitalizationCostAnalysis() {
  const [chartData, setChartData] = useState<ChartDataItem[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [yoyData, setYoyData] = useState<{ [key: string]: ComparisonData }>({});
  const [momData, setMomData] = useState<{ [key: string]: ComparisonData }>({});
  const [diseaseCostData, setDiseaseCostData] = useState<DiseaseCostItem[]>([]);
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
        console.log('开始初始化数据...');
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
          fetchDiseaseCostData(params).then(setDiseaseCostData)
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

  const formatValue = (value: number, unit: string = '') => {
    if (unit === '元' && value >= 10000) {
      return `${(value / 10000).toFixed(2)}万元`;
    }
    return `${value.toFixed(2)}${unit}`;
  };

  // 图表数据配置
  const costTrendData = {
    labels: chartData.map(item => item.date),
    datasets: [
      {
        label: '次均医药费用',
        data: chartData.map(item => item.data.avgMedicalCost),
        borderColor: '#8B5CF6',
        backgroundColor: '#8B5CF620',
        fill: true,
        tension: 0.1
      },
      {
        label: '次均药费',
        data: chartData.map(item => item.data.avgDrugCost),
        borderColor: '#06B6D4',
        backgroundColor: '#06B6D420',
        fill: true,
        tension: 0.1
      },
      {
        label: '日均医药费用',
        data: chartData.map(item => item.data.avgDailyMedicalCost),
        borderColor: '#10B981',
        backgroundColor: '#10B98120',
        fill: true,
        tension: 0.1,
        yAxisID: 'y1'
      }
    ]
  };

  const costChangeRateData = {
    labels: chartData.map(item => item.date),
    datasets: [
      {
        label: '次均费用变动率',
        data: chartData.map(item => item.data.costChangeRate),
        borderColor: '#EF4444',
        backgroundColor: '#EF444420',
        fill: true,
        tension: 0.1
      }
    ]
  };

  const diseaseCostChartData = {
    labels: diseaseCostData.map(item => item.disease),
    datasets: [
      {
        label: '次均费用 (元)',
        data: diseaseCostData.map(item => item.avgCost),
        backgroundColor: '#8B5CF6'
      }
    ]
  };

  // 费用构成分析（使用最新数据）
  const getLatestCostStructure = () => {
    if (chartData.length === 0) return null;
    const latest = chartData[chartData.length - 1].data;
    const drugRatio = (latest.avgDrugCost / latest.avgMedicalCost) * 100;
    return {
      drug: drugRatio,
      treatment: 25,
      examination: 20,
      material: 15,
      other: 100 - drugRatio - 25 - 20 - 15
    };
  };

  const costStructureData = {
    labels: ['药品费', '治疗费', '检查费', '材料费', '其他'],
    datasets: [
      {
        data: [
          getLatestCostStructure()?.drug || 0,
          getLatestCostStructure()?.treatment || 0,
          getLatestCostStructure()?.examination || 0,
          getLatestCostStructure()?.material || 0,
          getLatestCostStructure()?.other || 0
        ],
        backgroundColor: ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444'],
        hoverBackgroundColor: ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444']
      }
    ]
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
        fetchDiseaseCostData(params).then(setDiseaseCostData)
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
            <h1 className="text-2xl font-bold text-gray-900">住院医疗费用总体分析</h1>
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

      {/* 指标卡片 */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {indicators.map((indicator) => {
          const stat = summaryData ? summaryData[indicator.key as keyof SummaryData] : null;
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
                      {stat.toFixed(2)}
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

      {/* 图表控制区域 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
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

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-500">加载数据中...</p>
            </div>
          </div>
        ) : (
          <>
            {/* 第一行：趋势分析 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* 住院患者次均变化趋势 */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">住院患者次均费用变化趋势</h3>
                <div className="h-80">
                  <Line
                    data={costTrendData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      scales: {
                        y: {
                          beginAtZero: true,
                          title: {
                            display: true,
                            text: '费用 (元)'
                          }
                        },
                        y1: {
                          position: 'right',
                          beginAtZero: true,
                          title: {
                            display: true,
                            text: '日均费用 (元)'
                          },
                          grid: {
                            drawOnChartArea: false,
                          },
                        }
                      }
                    }}
                  />
                </div>
              </div>

              {/* 费用变动率 */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">住院患者次均费用变动率</h3>
                <div className="h-80">
                  <Line
                    data={costChangeRateData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      scales: {
                        y: {
                          title: {
                            display: true,
                            text: '变动率 (%)'
                          }
                        }
                      },
                      plugins: {
                        tooltip: {
                          callbacks: {
                            label: function(context) {
                              return `${context.dataset.label}: ${context.parsed.y > 0 ? '+' : ''}${context.parsed.y}%`;
                            }
                          }
                        }
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            {/* 第二行：费用构成分析 */}
            <div className="grid grid-cols-1 gap-6 mb-6">
              {/* 费用构成分析 */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">住院费用构成分析</h3>
                <div className="h-80">
                  <Doughnut
                    data={costStructureData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: 'bottom'
                        }
                      }
                    }}
                  />
                </div>
                {chartData.length > 0 && (
                  <div className="mt-4 grid grid-cols-5 gap-2 text-center text-xs">
                    <div className="text-purple-600">
                      <div className="font-bold">{formatValue(getLatestCostStructure()?.drug || 0, '%')}</div>
                      <div>药品费</div>
                    </div>
                    <div className="text-cyan-600">
                      <div className="font-bold">{formatValue(getLatestCostStructure()?.treatment || 0, '%')}</div>
                      <div>治疗费</div>
                    </div>
                    <div className="text-green-600">
                      <div className="font-bold">{formatValue(getLatestCostStructure()?.examination || 0, '%')}</div>
                      <div>检查费</div>
                    </div>
                    <div className="text-yellow-600">
                      <div className="font-bold">{formatValue(getLatestCostStructure()?.material || 0, '%')}</div>
                      <div>材料费</div>
                    </div>
                    <div className="text-red-600">
                      <div className="font-bold">{formatValue(getLatestCostStructure()?.other || 0, '%')}</div>
                      <div>其他</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 第三行：各病种费用分析 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">各病种住院患者次均费用分析</h3>
              <div className="h-80">
                <Bar
                  data={diseaseCostChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    scales: {
                      x: {
                        beginAtZero: true,
                        title: {
                          display: true,
                          text: '次均费用 (元)'
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>
          </>
        )}
      </section>

      {/* 详细数据表格 */}
      <DetailedDataTable chartData={chartData} />

      {/* 病种费用详细表格 */}
      <DiseaseCostTable diseaseCostData={diseaseCostData} />
    </div>
  );
}