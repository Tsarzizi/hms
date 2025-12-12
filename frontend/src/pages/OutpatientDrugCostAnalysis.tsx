// src/yiliaofudan/menjizhencijunyaofei/frontend/menjizhencijunyaofeixiangxi.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
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
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

// ==================== 完整的类型定义 ====================
interface DepartmentOption {
  id: string;
  name: string;
}

interface DrugCostIndicator {
  key: string;
  name: string;
  color: string;
  description: string;
  unit: string;
  category: 'outpatient' | 'emergency';
  type: 'western' | 'chinese' | 'herbal' | 'total';
}

interface DetailedDrugCostData {
  date: string;
  department_id?: string;
  department_name?: string;
  [key: string]: number | string | undefined;
}

// 统计数据类型，包含同比环比数据
interface DrugCostStatsData {
  current: number;      // 当前值
  chain_ratio: number;  // 环比值（百分比，如5.2表示5.2%）
  year_ratio: number;   // 同比值（百分比，如-3.1表示-3.1%）
}

interface DrugCostDataResponse {
  indicators: DrugCostIndicator[];
  data: DetailedDrugCostData[];
  stats: { [key: string]: DrugCostStatsData }; // 统计信息，包含同比环比
  total: number;
}

interface ApiParams {
  start_date: string;
  end_date: string;
  department_ids?: string[];
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

// ==================== 分页配置 ====================
const PAGINATION_CONFIG = {
  pageSize: 10, // 每页显示条数
  pageSizeOptions: [10, 20, 50, 100], // 每页条数选项
};

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

function formatCurrency(num: number): string {
  return `¥${num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(num: number): string {
  return `${num > 0 ? '+' : ''}${num.toFixed(1)}%`;
}

// ==================== API配置和函数 ====================
const API_CONFIG = {
  baseURL: '/api/outpatient-drug-cost-analysis',
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

function buildApiParams(start: string, end: string, deps: string[] | null): ApiParams {
  const params: ApiParams = {
    start_date: start,
    end_date: end
  };

  if (deps && deps.length > 0) {
    params.department_ids = deps;
  }

  return params;
}

async function fetchInitAPI(): Promise<InitResponse> {
  try {
    console.log('正在初始化门急诊药费详细分析数据...');
    const response = await fetch(`${API_CONFIG.baseURL}/init`, {
      method: 'GET',
      headers: API_CONFIG.headers
    });

    return await handleApiResponse<InitResponse>(response);
  } catch (error) {
    console.error('初始化失败:', error);
    throw new Error(`初始化失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function fetchDetailedDataAPI(params: ApiParams): Promise<DrugCostDataResponse> {
  try {
    console.log('正在获取门急诊药费详细数据:', params);
    const response = await fetch(`${API_CONFIG.baseURL}/data`, {
      method: 'POST',
      headers: API_CONFIG.headers,
      body: JSON.stringify(params)
    });

    return await handleApiResponse<DrugCostDataResponse>(response);
  } catch (error) {
    console.error('获取详细数据失败:', error);
    throw error;
  }
}

// ==================== 汇总统计计算（前端兜底计算） ====================
function calculateStats(
  data: DetailedDrugCostData[],
  indicators: DrugCostIndicator[]
): { [key: string]: DrugCostStatsData } {
  const result: { [key: string]: DrugCostStatsData } = {};

  if (!data || data.length === 0 || !indicators || indicators.length === 0) {
    return result;
  }

  // 按日期排序，取最后一条作为“当前值”，倒数第二条作为“环比基准”
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1];
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;

  indicators.forEach(indicator => {
    const currentRaw = last[indicator.key];
    const prevRaw = prev ? prev[indicator.key] : undefined;

    const currentValue =
      typeof currentRaw === 'number'
        ? currentRaw
        : typeof currentRaw === 'string'
        ? Number(currentRaw) || 0
        : 0;

    const prevValue =
      typeof prevRaw === 'number'
        ? prevRaw
        : typeof prevRaw === 'string'
        ? Number(prevRaw) || 0
        : 0;

    let chain_ratio = 0;
    if (prevValue !== 0) {
      chain_ratio = ((currentValue - prevValue) / Math.abs(prevValue)) * 100;
    }

    // 同比暂时用 0，后端如果提供 stats 会覆盖这里
    const year_ratio = 0;

    result[indicator.key] = {
      current: currentValue,
      chain_ratio,
      year_ratio,
    };
  });

  return result;
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

// ==================== 分页组件 ====================
function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const totalPages = Math.ceil(totalItems / pageSize);

  // 生成页码按钮
  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;

    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  };

  if (totalItems === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 px-2">
      {/* 左侧：每页显示条数选择 */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">每页显示</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {PAGINATION_CONFIG.pageSizeOptions.map(size => (
            <option key={size} value={size}>
              {size} 条
            </option>
          ))}
        </select>
        <span className="text-sm text-gray-600">
          共 {totalItems.toLocaleString()} 条记录
        </span>
      </div>

      {/* 右侧：页码导航 */}
      <div className="flex items-center gap-2">
        {/* 上一页 */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
        >
          上一页
        </button>

        {/* 第一页 */}
        {currentPage > 3 && (
          <>
            <button
              onClick={() => onPageChange(1)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              1
            </button>
            {currentPage > 4 && (
              <span className="px-2 text-gray-400">...</span>
            )}
          </>
        )}

        {/* 页码按钮 */}
        {getPageNumbers().map(page => (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`px-3 py-1.5 border rounded-lg text-sm font-medium transition-colors ${
              page === currentPage
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-gray-300 hover:bg-gray-50'
            }`}
          >
            {page}
          </button>
        ))}

        {/* 最后一页 */}
        {currentPage < totalPages - 2 && (
          <>
            {currentPage < totalPages - 3 && (
              <span className="px-2 text-gray-400">...</span>
            )}
            <button
              onClick={() => onPageChange(totalPages)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              {totalPages}
            </button>
          </>
        )}

        {/* 下一页 */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
        >
          下一页
        </button>

        {/* 跳转 */}
        <div className="flex items-center gap-2 ml-4">
          <span className="text-sm text-gray-600">跳至</span>
          <input
            type="number"
            min="1"
            max={totalPages}
            defaultValue={currentPage}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                const target = e.target as HTMLInputElement;
                const page = Math.max(1, Math.min(totalPages, Number(target.value)));
                onPageChange(page);
                target.value = '';
              }
            }}
            className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder={currentPage.toString()}
          />
          <span className="text-sm text-gray-600">页</span>
        </div>
      </div>
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

// ==================== 主组件 ====================
export default function OutpatientDrugCostDetailedAnalysis() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [indicators, setIndicators] = useState<DrugCostIndicator[]>([]);
  const [analysisData, setAnalysisData] = useState<DetailedDrugCostData[]>([]);
  const [statsData, setStatsData] = useState<{ [key: string]: DrugCostStatsData }>({});
  const [selectedIndicators, setSelectedIndicators] = useState<Set<string>>(new Set());

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGINATION_CONFIG.pageSize);

  const [startDate, setStartDate] = useState(getFirstDayOfMonth());
  const [endDate, setEndDate] = useState(getToday());
  const [selectedDeps, setSelectedDeps] = useState<Set<string>>(new Set());

  // 获取当前选择的科室名称
  const getSelectedDepartmentNames = useCallback(() => {
    if (selectedDeps.size === 0) {
      return "全部科室";
    }

    const selectedNames = Array.from(selectedDeps).map(depId => {
      const dept = departments.find(d => d.id === depId);
      return dept ? dept.name : depId;
    });

    return selectedNames.join(", ");
  }, [selectedDeps, departments]);

  // 获取筛选参数
  const getApiParams = useCallback((): ApiParams => {
    return buildApiParams(
      startDate,
      endDate,
      selectedDeps.size > 0 ? Array.from(selectedDeps) : null
    );
  }, [startDate, endDate, selectedDeps]);

  // 分页数据计算
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return analysisData.slice(startIndex, endIndex);
  }, [analysisData, currentPage, pageSize]);

  // 当数据变化时重置到第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [analysisData]);

  // 初始化
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError("");
      try {
        console.log('开始初始化门急诊药费详细分析数据...');
        const data = await fetchInitAPI();

        setDepartments(Array.isArray(data?.departments) ? data.departments : []);

        console.log('科室列表加载完成:', data?.departments?.length || 0);

        console.log('开始加载详细数据...');
        const initParams = getApiParams();
        await loadDetailedData(initParams);

        console.log('初始化完成');
      } catch (e: any) {
        console.error('初始化失败:', e);
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    };
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 数据加载函数
  const loadDetailedData = useCallback(async (params: ApiParams) => {
    try {
      console.log('正在加载详细数据:', params);
      const data = await fetchDetailedDataAPI(params);

      // 动态设置指标和数据
      setIndicators(data.indicators || []);
      setAnalysisData(data.data || []);

      // 如果后端没有提供 stats 或为空，则在前端用 data 兜底计算
      const backendStats = data.stats || {};
      const hasBackendStats = backendStats && Object.keys(backendStats).length > 0;
      const finalStats = hasBackendStats
        ? backendStats
        : calculateStats(data.data || [], data.indicators || []);

      setStatsData(finalStats);

      // 默认选中所有指标
      if (data.indicators) {
        setSelectedIndicators(new Set(data.indicators.map(ind => ind.key)));
      }

      console.log(
        `详细数据加载完成，共 ${data.data?.length || 0} 条记录，${data.indicators?.length || 0} 个指标`
      );
    } catch (error) {
      console.error('加载详细数据失败:', error);
      throw error;
    }
  }, []);

  // 提交筛选
  const onSubmit = async (e?: React.FormEvent) => {
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

      await loadDetailedData(params);

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
    const defaultStart = getFirstDayOfMonth();
    const defaultEnd = getToday();
    setStartDate(defaultStart);
    setEndDate(defaultEnd);
    setSelectedDeps(new Set());
    setError("");

    setLoading(true);
    try {
      const params = buildApiParams(defaultStart, defaultEnd, null);
      await loadDetailedData(params);
      console.log('重置操作完成');
    } catch (e: any) {
      console.error('重置操作失败:', e);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  // 分页处理函数
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    // 滚动到表格顶部
    const tableElement = document.querySelector('table');
    if (tableElement) {
      tableElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1); // 切换每页条数时回到第一页
  }, []);

  // 按类别分组指标
  const groupedIndicators = useMemo(() => {
    const groups = {
      outpatient: indicators.filter(ind => ind.category === 'outpatient'),
      emergency: indicators.filter(ind => ind.category === 'emergency')
    };
    return groups;
  }, [indicators]);

  // 切换指标选择
  const toggleIndicator = (key: string) => {
    setSelectedIndicators(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // 切换整个类别
  const toggleCategory = (category: string) => {
    const categoryIndicators = groupedIndicators[category as keyof typeof groupedIndicators];
    const allSelected = categoryIndicators.every(ind => selectedIndicators.has(ind.key));

    setSelectedIndicators(prev => {
      const next = new Set(prev);
      categoryIndicators.forEach(ind => {
        if (allSelected) {
          next.delete(ind.key);
        } else {
          next.add(ind.key);
        }
      });
      return next;
    });
  };

  // 动态生成图表数据（按日期汇总所有科室）
  const generateChartData = useCallback((indicators: DrugCostIndicator[], selectedKeys: Set<string>) => {
    const selectedIndicatorsList = indicators.filter(ind => selectedKeys.has(ind.key));

    // 按日期分组数据
    const dateGroups: { [date: string]: DetailedDrugCostData[] } = {};
    analysisData.forEach(item => {
      if (!dateGroups[item.date]) {
        dateGroups[item.date] = [];
      }
      dateGroups[item.date].push(item);
    });

    // 计算每个日期的汇总值
    const aggregatedData = Object.keys(dateGroups).map(date => {
      const aggregated: { [key: string]: number } = {};
      indicators.forEach(indicator => {
        aggregated[indicator.key] = 0;
      });

      dateGroups[date].forEach(item => {
        indicators.forEach(indicator => {
          const value = item[indicator.key] as number;
          if (value) {
            aggregated[indicator.key] += value;
          }
        });
      });

      return { date, ...aggregated };
    }).sort((a, b) => a.date.localeCompare(b.date));

    return {
      labels: aggregatedData.map(item => item.date),
      datasets: selectedIndicatorsList.map(indicator => ({
        label: indicator.name,
        data: aggregatedData.map(item => item[indicator.key] as number),
        borderColor: indicator.color,
        backgroundColor: `${indicator.color}20`,
        fill: false,
        tension: 0.1
      }))
    };
  }, [analysisData, indicators]);

  const chartData = generateChartData(indicators, selectedIndicators);

  // 生成药费构成数据（按最新日期汇总所有科室）
  const getStructureData = useCallback((category: 'outpatient' | 'emergency') => {
    if (analysisData.length === 0) return null;

    // 获取最新日期
    const dates = [...new Set(analysisData.map(item => item.date))].sort();
    const latestDate = dates[dates.length - 1];

    // 获取最新日期的所有数据
    const latestData = analysisData.filter(item => item.date === latestDate);

    const categoryIndicators = indicators.filter(ind =>
      ind.category === category && ind.type !== 'total'
    );

    const totalKey = indicators.find(ind =>
      ind.category === category && ind.type === 'total'
    )?.key;

    if (!totalKey) return null;

    // 计算汇总值
    let totalValue = 0;
    latestData.forEach(item => {
      const value = item[totalKey] as number;
      if (value) {
        totalValue += value;
      }
    });

    if (!totalValue) return null;

    const structureData = {
      labels: categoryIndicators.map(ind => ind.name),
      datasets: [{
        data: categoryIndicators.map(ind => {
          let value = 0;
          latestData.forEach(item => {
            const itemValue = item[ind.key] as number;
            if (itemValue) {
              value += itemValue;
            }
          });
          return totalValue > 0 ? (value / totalValue) * 100 : 0;
        }),
        backgroundColor: categoryIndicators.map(ind => ind.color),
        hoverBackgroundColor: categoryIndicators.map(ind => ind.color)
      }]
    };

    return {
      chartData: structureData,
      percentages: categoryIndicators.map(ind => {
        let value = 0;
        latestData.forEach(item => {
          const itemValue = item[ind.key] as number;
          if (itemValue) {
            value += itemValue;
          }
        });
        return totalValue > 0 ? (value / totalValue) * 100 : 0;
      })
    };
  }, [analysisData, indicators]);

  const outpatientStructure = getStructureData('outpatient');
  const emergencyStructure = getStructureData('emergency');

  // 获取当前选择的科室名称用于显示
  const currentDepartmentNames = getSelectedDepartmentNames();

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* 页面标题 */}
      <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <h1 className="text-2xl font-bold text-gray-900">门急诊药费详细分析</h1>
            <div className="mt-2 text-sm text-gray-600">
              当前科室: <span className="font-medium text-blue-600">{currentDepartmentNames}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium text-gray-900">
                {startDate} 至 {endDate} 数据
              </div>
              <div className="text-xs text-gray-500">数据来源: 医院信息系统</div>
            </div>
            <button className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors duration-200">
              <span className="text-lg">💊</span>
            </button>
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
          onSubmit={onSubmit}
          onReset={onReset}
        />
      </section>

      {/* 动态指标卡片 */}
      <section className="space-y-6">
        {/* 门诊药费卡片 */}
        {groupedIndicators.outpatient.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">门诊药费</h3>
              <div className="text-sm text-gray-500">
                科室: {currentDepartmentNames}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {groupedIndicators.outpatient.map((indicator) => {
                const stat = statsData[indicator.key];
                return (
                  <div key={indicator.key} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-900 text-sm">{indicator.name}</h4>
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: indicator.color }}></div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-2xl font-bold text-gray-900">
                        {stat ? (
                          <>
                            {stat.current.toFixed(2)}
                            <span className="text-sm font-normal ml-1 text-gray-500">{indicator.unit}</span>
                          </>
                        ) : (
                          <span className="text-gray-400">--</span>
                        )}
                      </div>
                      {stat && (
                        <div className="space-y-1">
                          {/* 环比 */}
                          {stat.chain_ratio !== 0 && (
                            <div className={`text-xs font-medium ${
                              stat.chain_ratio > 0 ? 'text-red-600' : 'text-green-600'
                            }`}>
                              {stat.chain_ratio > 0 ? '↗' : '↘'} 环比 {formatPercent(stat.chain_ratio)}
                            </div>
                          )}
                          {/* 同比 */}
                          {stat.year_ratio !== 0 && (
                            <div className={`text-xs font-medium ${
                              stat.year_ratio > 0 ? 'text-red-600' : 'text-green-600'
                            }`}>
                              {stat.year_ratio > 0 ? '↗' : '↘'} 同比 {formatPercent(stat.year_ratio)}
                            </div>
                          )}
                          {/* 如果环比同比都为0，显示持平 */}
                          {stat.chain_ratio === 0 && stat.year_ratio === 0 && (
                            <div className="text-xs font-medium text-gray-500">
                              → 环比同比均持平
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 急诊药费卡片 */}
        {groupedIndicators.emergency.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">急诊药费</h3>
              <div className="text-sm text-gray-500">
                科室: {currentDepartmentNames}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {groupedIndicators.emergency.map((indicator) => {
                const stat = statsData[indicator.key];
                return (
                  <div key={indicator.key} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-900 text-sm">{indicator.name}</h4>
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: indicator.color }}></div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-2xl font-bold text-gray-900">
                        {stat ? (
                          <>
                            {stat.current.toFixed(2)}
                            <span className="text-sm font-normal ml-1 text-gray-500">{indicator.unit}</span>
                          </>
                        ) : (
                          <span className="text-gray-400">--</span>
                        )}
                      </div>
                      {stat && (
                        <div className="space-y-1">
                          {/* 环比 */}
                          {stat.chain_ratio !== 0 && (
                            <div className={`text-xs font-medium ${
                              stat.chain_ratio > 0 ? 'text-red-600' : 'text-green-600'
                            }`}>
                              {stat.chain_ratio > 0 ? '↗' : '↘'} 环比 {formatPercent(stat.chain_ratio)}
                            </div>
                          )}
                          {/* 同比 */}
                          {stat.year_ratio !== 0 && (
                            <div className={`text-xs font-medium ${
                              stat.year_ratio > 0 ? 'text-red-600' : 'text-green-600'
                            }`}>
                              {stat.year_ratio > 0 ? '↗' : '↘'} 同比 {formatPercent(stat.year_ratio)}
                            </div>
                          )}
                          {/* 如果环比同比都为0，显示持平 */}
                          {stat.chain_ratio === 0 && stat.year_ratio === 0 && (
                            <div className="text-xs font-medium text-gray-500">
                              → 环比同比均持平
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* 动态图表区域 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">药费趋势分析</h2>
            <div className="text-sm text-gray-500">
              科室: {currentDepartmentNames}
            </div>
          </div>

        {/* 类别选择器 */}
          <div className="flex items-center gap-4 mt-4 lg:mt-0">
            {Object.entries(groupedIndicators).map(([category, categoryIndicators]) => (
              categoryIndicators.length > 0 && (
                <button
                  key={category}
                  onClick={() => toggleCategory(category)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    categoryIndicators.every(ind => selectedIndicators.has(ind.key))
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {category === 'outpatient' ? '门诊' : '急诊'}
                </button>
              )
            ))}
          </div>
        </div>

        {/* 指标选择器 */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            {indicators.map((indicator) => (
              <button
                key={indicator.key}
                onClick={() => toggleIndicator(indicator.key)}
                className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  selectedIndicators.has(indicator.key)
                    ? 'text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={{
                  backgroundColor: selectedIndicators.has(indicator.key) ? indicator.color : undefined
                }}
              >
                <div
                  className="w-2 h-2 rounded-full mr-2"
                  style={{ backgroundColor: selectedIndicators.has(indicator.key) ? 'white' : indicator.color }}
                ></div>
                {indicator.name}
              </button>
            ))}
          </div>
        </div>

        {/* 动态图表 */}
        <div className="h-96">
          {analysisData.length > 0 && selectedIndicators.size > 0 ? (
            <Line
              data={chartData}
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
                  }
                }
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              请选择要显示的指标
            </div>
          )}
        </div>
      </section>

      {/* 结构比例分析 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 门诊药费构成比例 */}
        {outpatientStructure && (
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">门诊药费构成比例</h3>
              <div className="text-sm text-gray-500">
                科室: {currentDepartmentNames}
              </div>
            </div>
            <div className="h-64">
              <Doughnut
                data={outpatientStructure.chartData}
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
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              {groupedIndicators.outpatient
                .filter(ind => ind.type !== 'total')
                .map((indicator, index) => (
                <div key={indicator.key} style={{ color: indicator.color }}>
                  <div className="font-bold">{outpatientStructure.percentages[index].toFixed(1)}%</div>
                  <div>{indicator.name.replace('门诊', '')}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 急诊药费构成比例 */}
        {emergencyStructure && (
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">急诊药费构成比例</h3>
              <div className="text-sm text-gray-500">
                科室: {currentDepartmentNames}
              </div>
            </div>
            <div className="h-64">
              <Doughnut
                data={emergencyStructure.chartData}
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
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              {groupedIndicators.emergency
                .filter(ind => ind.type !== 'total')
                .map((indicator, index) => (
                <div key={indicator.key} style={{ color: indicator.color }}>
                  <div className="font-bold">{emergencyStructure.percentages[index].toFixed(1)}%</div>
                  <div>{indicator.name.replace('急诊', '')}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* 动态数据表格 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">详细数据</h2>
          <div className="text-sm text-gray-500">
            科室: {currentDepartmentNames}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  期间
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  科室
                </th>
                {indicators.map(indicator => (
                  <th key={indicator.key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {indicator.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedData.length > 0 ? (
                paginatedData.map((item, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.department_name || '全部科室'}
                    </td>
                    {indicators.map(indicator => (
                      <td key={indicator.key} className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: indicator.color }}>
                        {typeof item[indicator.key] === 'number'
                          ? `${(item[indicator.key] as number).toFixed(2)}${indicator.unit}`
                          : '--'
                        }
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={indicators.length + 2} className="px-6 py-12 text-center text-gray-500">
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

        {/* 分页组件 */}
        <Pagination
          currentPage={currentPage}
          totalItems={analysisData.length}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      </section>
    </div>
  );
}
