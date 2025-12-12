import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';

// 注册 Chart.js 组件
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

// ==================== 类型定义 ====================
interface DepartmentOption {
  id: string;
  name: string;
}

interface DrugCostItem {
  id: string;
  name: string;
  category: 'outpatient' | 'emergency' | 'total';
  cost: number;
  patientCount: number;
  date: string;
  department?: string;
}

interface SummaryPart {
  drugCost: number;
  patientCount: number;
  avgDrugCost: number;
  drugCostRatio: number;
}

interface ComparisonPart {
  yoyChange: number;
  momChange: number;
}

interface SummaryData {
  total: SummaryPart;
  outpatient: SummaryPart;
  emergency: SummaryPart;
  comparison: {
    total: ComparisonPart;
    outpatient: ComparisonPart;
    emergency: ComparisonPart;
  };
}

interface TimeSeriesSub {
  drugCost: number;
  patientCount: number;
  avgDrugCost: number;
}

interface TimeSeriesData {
  date: string;
  total: TimeSeriesSub;
  outpatient: TimeSeriesSub;
  emergency: TimeSeriesSub;
}

interface DrugCostDetail {
  id: string;
  date: string;
  totalAvgDrugCost: number;
  outpatientAvgDrugCost: number;
  emergencyAvgDrugCost: number;
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

// ==================== 工具函数 ====================
function getToday(offset: number = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().split('T')[0];
}

function getFirstDayOfMonth(): string {
  const date = new Date();
  date.setDate(1);
  return date.toISOString().split('T')[0];
}

function formatNumber(num: number): string {
  return num.toLocaleString('zh-CN');
}

function formatCurrency(num: number): string {
  return `¥${num.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(num: number): string {
  return `${(num * 100).toFixed(2)}%`;
}

// ==================== API 函数 ====================
const API_BASE_URL = '/api/outpatient-avg-drug-cost';

const API_CONFIG = {
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
  },
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
    end_date: end,
  };

  if (deps && deps.length > 0) {
    params.department_ids = deps;
  }

  return params;
}

async function fetchInitAPI(): Promise<InitResponse> {
  try {
    console.log('正在初始化门急诊次均药费数据...');
    const response = await fetch(`${API_BASE_URL}/init`, {
      method: 'GET',
      headers: API_CONFIG.headers,
    });

    return await handleApiResponse<InitResponse>(response);
  } catch (error) {
    console.error('初始化失败:', error);
    throw new Error(`初始化失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function fetchSummaryAPI(params: ApiParams): Promise<SummaryData> {
  try {
    console.log('正在获取门急诊次均药费汇总数据:', params);
    const response = await fetch(`${API_BASE_URL}/summary`, {
      method: 'POST',
      headers: API_CONFIG.headers,
      body: JSON.stringify(params),
    });

    return await handleApiResponse<SummaryData>(response);
  } catch (error) {
    console.error('获取汇总数据失败:', error);
    throw error;
  }
}

async function fetchTimeseriesAPI(params: ApiParams): Promise<TimeSeriesData[]> {
  try {
    console.log('正在获取门急诊次均药费趋势数据:', params);
    const response = await fetch(`${API_BASE_URL}/timeseries`, {
      method: 'POST',
      headers: API_CONFIG.headers,
      body: JSON.stringify(params),
    });

    return await handleApiResponse<TimeSeriesData[]>(response);
  } catch (error) {
    console.error('获取趋势数据失败:', error);
    throw error;
  }
}

async function fetchDetailsAPI(
  params: ApiParams,
): Promise<{ rows: DrugCostDetail[]; total: number }> {
  try {
    console.log('正在获取门急诊次均药费明细数据:', params);
    const response = await fetch(`${API_BASE_URL}/details`, {
      method: 'POST',
      headers: API_CONFIG.headers,
      body: JSON.stringify(params),
    });

    return await handleApiResponse<{ rows: DrugCostDetail[]; total: number }>(response);
  } catch (error) {
    console.error('获取明细数据失败:', error);
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
  placeholder = '请选择…',
  searchPlaceholder = '搜索…',
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  placeholder?: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const filtered = useMemo(
    () =>
      !q
        ? options
        : options.filter(
            (o) =>
              o.label.toLowerCase().includes(q.toLowerCase()) ||
              o.value.toLowerCase().includes(q.toLowerCase()),
          ),
    [options, q],
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
    setQ('');
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
        <span className={`truncate ${selected.size ? 'text-gray-900' : 'text-gray-500'}`}>
          {summaryText}
        </span>
        <span className="text-gray-400 transform transition-transform duration-200">
          {open ? '▴' : '▾'}
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
                  {allSelected ? '取消全选' : '全选所有结果'}
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
                  <span className="text-sm text-gray-700 truncate">{o.label}</span>
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
  const departmentOptions = useMemo(
    () => departments.map((dept) => ({ value: dept.id, label: dept.name })),
    [departments],
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
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                查询中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            重置
          </button>
        </div>
      </div>
    </form>
  );
}

function SummaryCards({ summary }: { summary: SummaryData | null }) {
  const cards = [
    {
      key: 'total',
      title: '门急诊次均药费',
      color: 'purple',
      data: summary?.total,
    },
    {
      key: 'outpatient',
      title: '门诊患者次均药费',
      color: 'blue',
      data: summary?.outpatient,
    },
    {
      key: 'emergency',
      title: '急诊次均药费',
      color: 'green',
      data: summary?.emergency,
    },
  ];

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'purple':
        return { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-600' };
      case 'blue':
        return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600' };
      case 'green':
        return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-600' };
      default:
        return { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-600' };
    }
  };

  const getComparisonIcon = (change: number) => {
    if (change > 0) return '↗';
    if (change < 0) return '↘';
    return '→';
  };

  const getComparisonColor = (change: number) => {
    if (change > 0) return 'text-red-600 bg-red-100';
    if (change < 0) return 'text-green-600 bg-green-100';
    return 'text-gray-600 bg-gray-100';
  };

  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {cards.map((card) => {
        const colorClasses = getColorClasses(card.color);
        const comparison = summary?.comparison?.[card.key as keyof typeof summary.comparison];

        return (
          <div
            key={card.key}
            className={`bg-white rounded-xl shadow-sm border ${colorClasses.border} p-6`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{card.title}</h3>
              <div className={`w-3 h-3 rounded-full ${colorClasses.bg}`} />
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {card.data ? formatCurrency(card.data.avgDrugCost) : '--'}
                </div>
                <div className="text-sm text-gray-500 mt-1">次均药费</div>
              </div>

              <div>
                <div className="text-xl font-semibold text-gray-900">
                  {card.data ? formatPercent(card.data.drugCostRatio) : '--'}
                </div>
                <div className="text-sm text-gray-500 mt-1">药费占比</div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-gray-600 mb-1">药费总额</div>
                  <div className="font-semibold text-gray-900">
                    {card.data ? formatCurrency(card.data.drugCost) : '--'}
                  </div>
                </div>

                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-gray-600 mb-1">患者数量</div>
                  <div className="font-semibold text-gray-900">
                    {card.data ? formatNumber(card.data.patientCount) : '--'}
                  </div>
                </div>
              </div>

              {comparison && (
                <div className="grid grid-cols-2 gap-2">
                  <div
                    className={`text-center p-2 rounded-lg ${getComparisonColor(
                      comparison.yoyChange,
                    )}`}
                  >
                    <div className="text-xs">同比</div>
                    <div className="font-semibold">
                      {getComparisonIcon(comparison.yoyChange)}{' '}
                      {Math.abs(comparison.yoyChange).toFixed(1)}%
                    </div>
                  </div>
                  <div
                    className={`text-center p-2 rounded-lg ${getComparisonColor(
                      comparison.momChange,
                    )}`}
                  >
                    <div className="text-xs">环比</div>
                    <div className="font-semibold">
                      {getComparisonIcon(comparison.momChange)}{' '}
                      {Math.abs(comparison.momChange).toFixed(1)}%
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function TrendCharts({ timeseriesData }: { timeseriesData: TimeSeriesData[] }) {
  // 计算图表数据 + Y 轴 5 条刻度（0%、25%、50%、75%、100%），范围贴合数据
  const { avgCostChartData, yAxis } = useMemo(() => {
    const labels = timeseriesData.map((item) => item.date);

    const totalValues = timeseriesData.map((item) => item.total.avgDrugCost || 0);
    const outpatientValues = timeseriesData.map((item) => item.outpatient.avgDrugCost || 0);
    const emergencyValues = timeseriesData.map((item) => item.emergency.avgDrugCost || 0);

    const hasTotal = totalValues.some((v) => v !== 0);
    const hasOutpatient = outpatientValues.some((v) => v !== 0);
    const hasEmergency = emergencyValues.some((v) => v !== 0);

    const datasets: any[] = [];

    if (hasTotal) {
      datasets.push({
        label: '门急诊次均药费',
        data: totalValues,
        borderColor: '#8B5CF6',
        backgroundColor: '#8B5CF620',
        tension: 0.1,
        borderWidth: 3,
      });
    }

    if (hasOutpatient) {
      datasets.push({
        label: '门诊患者次均药费',
        data: outpatientValues,
        borderColor: '#06B6D4',
        backgroundColor: '#06B6D420',
        tension: 0.1,
        borderWidth: 2,
      });
    }

    if (hasEmergency) {
      datasets.push({
        label: '急诊次均药费',
        data: emergencyValues,
        borderColor: '#10B981',
        backgroundColor: '#10B98120',
        tension: 0.1,
        borderWidth: 2,
      });
    }

    const allValues = [...totalValues, ...outpatientValues, ...emergencyValues].filter(
      (v) => !isNaN(v),
    );

    let min = 0;
    let max = 4;
    let stepSize = 1;

    if (allValues.length > 0) {
      const dataMin = Math.min(...allValues);
      const dataMax = Math.max(...allValues);

      if (dataMax === dataMin) {
        // 全部值一样，给一点上下浮动
        const base = dataMax === 0 ? 1 : dataMax;
        min = base * 0.9;
        max = base * 1.1;
      } else {
        const range = dataMax - dataMin;
        min = dataMin - range * 0.1;
        max = dataMax + range * 0.1;
      }

      if (min < 0) min = 0;

      // 原始步长 = (max-min)/4
      const rawStep = (max - min) / 4 || 1;

      const niceNumber = (value: number) => {
        const exponent = Math.floor(Math.log10(value));
        const fraction = value / Math.pow(10, exponent);

        let niceFraction;
        if (fraction < 1.5) niceFraction = 1;
        else if (fraction < 3) niceFraction = 2;
        else if (fraction < 7) niceFraction = 5;
        else niceFraction = 10;

        return niceFraction * Math.pow(10, exponent);
      };

      stepSize = niceNumber(rawStep);
      // 重新用 stepSize 拼出 5 条刻度的最大值
      max = min + stepSize * 4;
    }

    return {
      avgCostChartData: { labels, datasets },
      yAxis: {
        min,
        max,
        stepSize,
      },
    };
  }, [timeseriesData]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: '门急诊次均药费趋势分析',
      },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += formatCurrency(context.parsed.y);
            }
            return label;
          },
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: '时间',
        },
        ticks: {
          maxTicksLimit: 10,
        },
      },
      y: {
        title: {
          display: true,
          text: '次均药费 (元)',
        },
        beginAtZero: false,
        suggestedMin: yAxis.min,
        suggestedMax: yAxis.max,
        ticks: {
          stepSize: yAxis.stepSize,
        },
      },
    },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 lg:mb-0">次均药费趋势分析</h3>
      </div>
        <div className="h-80">
          {timeseriesData.length > 0 && avgCostChartData.datasets.length > 0 ? (
              <Line data={avgCostChartData} options={chartOptions} />
          ) : (
            <div className="flex items-center justify-center h-full w-full">
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
  );
}

function DetailsTable({
  details,
  loading,
}: {
  details: DrugCostDetail[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-500">加载数据中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {/*<h3 className="text-lg font-semibold text-gray-900">详细数据</h3>*/}
        <div className="text-sm text-gray-500">共 {details.length} 条记录</div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                日期
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                门急诊次均药费
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                门诊患者次均药费
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                急诊次均药费
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {details.length > 0 ? (
              details.map((detail, index) => (
                <tr key={detail.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {detail.date}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-purple-600 font-bold">
                    {formatCurrency(detail.totalAvgDrugCost)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-bold">
                    {formatCurrency(detail.outpatientAvgDrugCost)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-bold">
                    {formatCurrency(detail.emergencyAvgDrugCost)}
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
export default function OutpatientAvgDrugCost() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [timeseriesData, setTimeseriesData] = useState<TimeSeriesData[]>([]);
  const [details, setDetails] = useState<DrugCostDetail[]>([]);

  const [viewMode, setViewMode] = useState<'details' | 'chart'>('chart');

  const [startDate, setStartDate] = useState(getFirstDayOfMonth());
  const [endDate, setEndDate] = useState(getToday());
  const [selectedDeps, setSelectedDeps] = useState<Set<string>>(new Set());

  const getApiParams = useCallback((): ApiParams => {
    return buildApiParams(
      startDate,
      endDate,
      selectedDeps.size > 0 ? Array.from(selectedDeps) : null,
    );
  }, [startDate, endDate, selectedDeps]);

  const loadSummary = useCallback(async (params: ApiParams) => {
    try {
      console.log('正在加载汇总数据:', params);
      const data = await fetchSummaryAPI(params);
      setSummary(data);
      console.log('汇总数据加载完成');
    } catch (error) {
      console.error('加载汇总数据失败:', error);
      throw error;
    }
  }, []);

  const loadTimeseries = useCallback(async (params: ApiParams) => {
    try {
      console.log('正在加载趋势数据:', params);
      const data = await fetchTimeseriesAPI(params);
      setTimeseriesData(data);
      console.log(`趋势数据加载完成，共 ${data.length} 个时间点`);
    } catch (error) {
      console.error('加载趋势数据失败:', error);
      throw error;
    }
  }, []);

  const loadDetails = useCallback(async (params: ApiParams) => {
    try {
      console.log('正在加载明细数据:', params);
      const data = await fetchDetailsAPI(params);
      setDetails(data.rows);
      console.log(`明细数据加载完成，共 ${data.rows.length} 条记录`);
    } catch (error) {
      console.error('加载明细数据失败:', error);
      throw error;
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError('');
      try {
        console.log('正在初始化门急诊次均药费数据...');
        const data = await fetchInitAPI();

        setDepartments(Array.isArray(data?.departments) ? data.departments : []);

        console.log('科室列表加载完成:', data?.departments?.length || 0);

        const initParams = getApiParams();
        await Promise.all([loadSummary(initParams), loadTimeseries(initParams), loadDetails(initParams)]);

        console.log('初始化完成');
      } catch (e: any) {
        console.error('初始化失败:', e);
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [getApiParams, loadSummary, loadTimeseries, loadDetails]);

  const onSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault?.();
    setError('');

    if (!startDate || !endDate) {
      setError('请选择开始日期和结束日期');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setError('开始日期不能晚于结束日期');
      return;
    }

    try {
      setLoading(true);
      const params = getApiParams();
      console.log('提交筛选条件:', params);

      await Promise.all([loadSummary(params), loadTimeseries(params), loadDetails(params)]);

      console.log('筛选查询完成');
    } catch (e: any) {
      console.error('筛选查询失败:', e);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const onReset = async () => {
    console.log('执行重置操作');
    setStartDate(getFirstDayOfMonth());
    setEndDate(getToday());
    setSelectedDeps(new Set());
    setError('');

    setLoading(true);
    try {
      const params = buildApiParams(getFirstDayOfMonth(), getToday(), null);
      await Promise.all([loadSummary(params), loadTimeseries(params), loadDetails(params)]);
      console.log('重置操作完成');
    } catch (e: any) {
      console.error('重置操作失败:', e);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* 页面标题 */}
      <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <h1 className="text-2xl font-bold text-gray-900">门急诊次均药费分析</h1>
            <p className="text-gray-600 text-sm mt-2">
              监控和分析医院门急诊次均药费情况，包括药费总额、患者数量、次均药费和药费占比等关键指标
            </p>
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

      {/* 汇总卡片 */}
      <SummaryCards summary={summary} />

      {/* 工具栏 + 数据详情 / 趋势分析区域 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 lg:mb-0">
            {viewMode === 'details' ? '详情数据' : '趋势分析图表'}
          </h2>
          <Toolbar viewMode={viewMode} onChangeView={setViewMode} />
        </div>

        {/* 数据详情 */}
        <div className={viewMode === 'chart' ? 'hidden' : ''}>
          <DetailsTable details={details} loading={loading} />
        </div>

        {/* 趋势分析 */}
        <div className={viewMode === 'details' ? 'hidden' : ''}>
          <TrendCharts timeseriesData={timeseriesData} />
        </div>
      </section>

      {/* 数据说明 */}
      <section className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <div className="flex items-start">
          <div className="text-blue-600 mr-3 mt-0.5 text-lg">💡</div>
          <div className="text-blue-800">
            <h3 className="font-medium mb-2 text-lg">数据说明：</h3>
            <ul className="list-disc list-inside space-y-2 text-sm">
              <li>数据来源于医院财务系统和药房管理系统，实时更新</li>
              <li>次均药费是衡量药品费用控制水平的重要指标，反映医院合理用药成效</li>
              <li>药费占比 = 药费金额 / 总费用金额</li>
              <li>支持按日期范围、科室等多维度筛选查看数据</li>
              <li>药费分析有助于了解医院药品费用结构和控制药品成本</li>
              <li>后端服务运行在: {API_BASE_URL}</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
