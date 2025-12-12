import { useState, useEffect, useMemo } from 'react';
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

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// 后端接口类型定义
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  code?: number;
}

interface InpatientRevenueRankingData {
  departmentInpatientRevenueRatio: number;
  diseaseCost: number;
}

interface ChartData {
  date: string;
  data: InpatientRevenueRankingData;
}

interface ComparisonData {
  current: number;
  previous: number;
  changeRate: number;
  changeType: 'increase' | 'decrease' | 'stable';
}

interface StructureQueryParams {
  startDate: string;
  endDate: string;
  departments?: string[];
  doctors?: string[];
}

interface DepartmentOption {
  id: string;
  name: string;
}

interface DoctorOption {
  id: string;
  name: string;
  departmentId: string;
}

const indicators = [
  {
    key: 'departmentInpatientRevenueRatio',
    name: '科室住院收入占比',
    color: '#3B82F6',
    unit: '%'
  },
  {
    key: 'diseaseCost',
    name: '病种住院费用',
    color: '#EF4444',
    unit: '元'
  }
];

// 错误提示组件
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

// 多选下拉组件
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
    if (next.has(val)) next.delete(val);
    else next.add(val);
    onChange(next);
  };

  const handleAll = () => {
    if (allSelected) onChange(new Set());
    else onChange(new Set(options.map((o) => o.value)));
  };

  const clear = () => onChange(new Set());

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

// 后端接口调用
const revenueRankingApi = {
  // 获取科室列表
  async getDepartments(): Promise<ApiResponse<DepartmentOption[]>> {
    try {
      const response = await fetch('/api/inpatient-revenue-ranking/departments', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('获取科室列表失败:', error);
      return {
        success: false,
        data: [],
        message: error instanceof Error ? error.message : '未知错误'
      };
    }
  },

  // 获取医生列表
  async getDoctors(departmentIds?: string[]): Promise<ApiResponse<DoctorOption[]>> {
    try {
      const params = new URLSearchParams();
      if (departmentIds && departmentIds.length > 0) {
        params.append('departments', departmentIds.join(','));
      }

      const response = await fetch(`/api/inpatient-revenue-ranking/doctors?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('获取医生列表失败:', error);
      return {
        success: false,
        data: [],
        message: error instanceof Error ? error.message : '未知错误'
      };
    }
  },

  // 获取收入排名数据
  async getRevenueRankingData(params: StructureQueryParams): Promise<ApiResponse<{
    currentStats: InpatientRevenueRankingData;
    trendData: ChartData[];
    comparison: {
      yearOverYear: Record<string, ComparisonData>;
      monthOverMonth: Record<string, ComparisonData>;
    };
  }>> {
    try {
      const response = await fetch('/api/inpatient-revenue-ranking/revenue-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('获取收入排名数据失败:', error);
      return {
        success: false,
        data: {
          currentStats: {
            departmentInpatientRevenueRatio: 0,
            diseaseCost: 0
          },
          trendData: [],
          comparison: { yearOverYear: {}, monthOverMonth: {} }
        },
        message: error instanceof Error ? error.message : '未知错误'
      };
    }
  }
};

// 同比环比卡片组件
function GrowthCard({
  title,
  currentValue,
  previousValue,
  type = "currency",
}: {
  title: string;
  currentValue: number;
  previousValue: number;
  type?: "currency" | "percent" | "number";
}) {
  const growth =
    previousValue !== 0
      ? ((currentValue - previousValue) / previousValue) * 100
      : 0;
  const trend = growth > 0 ? "up" : growth < 0 ? "down" : "neutral";

  const trendColors = {
    up: "text-green-600 bg-green-100",
    down: "text-red-600 bg-red-100",
    neutral: "text-gray-600 bg-gray-100",
  };

  const formatValue = (value: number) => {
    if (type === "currency") return `￥${value.toLocaleString()}`;
    if (type === "percent") return `${value.toFixed(1)}%`;
    return value.toLocaleString();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <div
          className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${trendColors[trend]}`}
        >
          {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
          {Math.abs(growth).toFixed(1)}%
        </div>
      </div>
      <div className="space-y-3">
        <div className="text-2xl font-bold text-gray-900">
          {formatValue(currentValue)}
        </div>
        <div className="text-sm text-gray-500">
          上月: {formatValue(previousValue)}
        </div>
      </div>
    </div>
  );
}

export default function InpatientRevenueRanking() {
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [currentStats, setCurrentStats] = useState<InpatientRevenueRankingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>(
    indicators.map(ind => ind.key)
  );
  const [yearOverYear, setYearOverYear] = useState<Record<string, ComparisonData>>({});
  const [monthOverMonth, setMonthOverMonth] = useState<Record<string, ComparisonData>>({});

  // 筛选条件状态
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });

  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });

  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [selectedDeps, setSelectedDeps] = useState<Set<string>>(new Set());
  const [selectedDoctors, setSelectedDoctors] = useState<Set<string>>(new Set());

  // 初始化数据：获取科室列表和默认数据
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      setError('');
      try {
        // 获取科室列表
        const deptResponse = await revenueRankingApi.getDepartments();
        if (deptResponse.success) {
          setDepartments(deptResponse.data);
        } else {
          throw new Error(deptResponse.message || '获取科室列表失败');
        }

        // 获取初始数据
        await fetchData();

      } catch (err: any) {
        console.error('初始化失败:', err);
        setError(err?.message || '初始化数据失败');
      } finally {
        setLoading(false);
      }
    };

    initData();
  }, []);

  // 当选择的科室变化时，更新医生列表
  useEffect(() => {
    const updateDoctors = async () => {
      if (selectedDeps.size > 0) {
        const departmentIds = Array.from(selectedDeps);
        const doctorResponse = await revenueRankingApi.getDoctors(departmentIds);

        if (doctorResponse.success) {
          setDoctors(doctorResponse.data);
        } else {
          console.error('更新医生列表失败:', doctorResponse.message);
        }
      } else {
        setDoctors([]);
        setSelectedDoctors(new Set());
      }
    };

    updateDoctors();
  }, [selectedDeps]);

  // 获取数据的主函数
  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const params: StructureQueryParams = {
        startDate,
        endDate,
        departments: selectedDeps.size > 0 ? Array.from(selectedDeps) : undefined,
        doctors: selectedDoctors.size > 0 ? Array.from(selectedDoctors) : undefined
      };

      const response = await revenueRankingApi.getRevenueRankingData(params);

      if (response.success) {
        setCurrentStats(response.data.currentStats);
        setChartData(response.data.trendData);
        setYearOverYear(response.data.comparison.yearOverYear);
        setMonthOverMonth(response.data.comparison.monthOverMonth);
      } else {
        throw new Error(response.message || '获取数据失败');
      }

    } catch (err: any) {
      console.error('获取数据失败:', err);
      if (err.message.includes('Network') || err.message.includes('Failed to fetch')) {
        setError('网络连接失败，请检查网络设置');
      } else if (err.message.includes('401')) {
        setError('认证失败，请重新登录');
      } else if (err.message.includes('404')) {
        setError('接口不存在，请联系管理员');
      } else if (err.message.includes('500')) {
        setError('服务器内部错误，请稍后重试');
      } else {
        setError(err?.message || '获取数据失败');
      }

      setChartData([]);
      setCurrentStats(null);
      setYearOverYear({});
      setMonthOverMonth({});
    } finally {
      setLoading(false);
    }
  };

  // 处理查询
  const handleQuery = async (e?: React.FormEvent) => {
    e?.preventDefault?.();
    await fetchData();
  };

  // 处理重置
  const handleReset = () => {
    const d = new Date();
    const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
    setStartDate(firstDay.toISOString().split('T')[0]);
    setEndDate(d.toISOString().split('T')[0]);
    setSelectedDeps(new Set());
    setSelectedDoctors(new Set());
    setError('');
  };

  const toggleIndicator = (key: string) => {
    setSelectedIndicators(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  const formatValue = (value: number, unit: string = '') => {
    if (unit === '元' && value >= 10000) {
      return `￥${(value / 10000).toFixed(2)}万`;
    }

    if (unit === '元') {
      return `￥${value.toLocaleString()}`;
    }

    return `${value.toFixed(1)}${unit}`;
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
        text: `住院收入顺位指标趋势图`
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
          text: '数值'
        },
        min: 0
      }
    }
  });

  const getChartData = () => {
    const labels = chartData.map(item => item.date);
    const datasets = indicators
      .filter(indicator => selectedIndicators.includes(indicator.key))
      .map(indicator => ({
        label: indicator.name,
        data: chartData.map(item => item.data[indicator.key as keyof InpatientRevenueRankingData]),
        borderColor: indicator.color,
        backgroundColor: indicator.color + '20',
        tension: 0.1
      }));

    return { labels, datasets };
  };

  const departmentOptions = useMemo(() =>
    departments.map(dept => ({ value: dept.id, label: dept.name })),
    [departments]
  );

  const doctorOptions = useMemo(() =>
    doctors.map(doc => ({ value: doc.id, label: doc.name })),
    [doctors]
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* 页面标题 */}
      <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <h1 className="text-2xl font-bold text-gray-900">住院收入顺位分析</h1>
            <p className="text-gray-600 text-sm mt-2">
              监控和分析住院收入顺位的各项指标，包括科室收入占比、病种住院费用等关键数据
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium text-gray-900">
                {startDate} 至 {endDate} 数据
              </div>
              <div className="text-xs text-gray-500">最后更新：今天 14:30</div>
            </div>
            <button className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors duration-200">
              <span className="text-lg">📊</span>
            </button>
          </div>
        </div>
      </header>

      {/* 错误提示 */}
      {error && <ErrorAlert message={error} />}

      {/* 筛选区域 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 text-left">数据筛选</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">开始日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">结束日期</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
            />
          </div>

          <div className="space-y-2">
            <MultiSelect
              label="科室筛选"
              options={departmentOptions}
              selected={selectedDeps}
              onChange={setSelectedDeps}
              placeholder="全部科室"
              searchPlaceholder="搜索科室…"
            />
          </div>

          <div className="space-y-2">
            <MultiSelect
              label="医生筛选"
              options={doctorOptions}
              selected={selectedDoctors}
              onChange={setSelectedDoctors}
              placeholder="全部医生"
              searchPlaceholder="搜索医生…"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={handleQuery}
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
              onClick={handleReset}
              className="flex-1 px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200 font-medium flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              重置
            </button>
          </div>
        </div>
      </section>

      {/* 同比环比卡片 */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {indicators.map((indicator) => {
          const comparison = yearOverYear[indicator.key];
          return (
            <GrowthCard
              key={indicator.key}
              title={`${indicator.name}同比`}
              currentValue={comparison?.current || 0}
              previousValue={comparison?.previous || 0}
              type={indicator.unit === '%' ? 'percent' : 'currency'}
            />
          );
        })}
      </section>

      {/* 指标卡片 */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {indicators.map((indicator) => (
          <div key={indicator.key} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{indicator.name}</h3>
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: indicator.color }}
              ></div>
            </div>
            <div className="space-y-3">
              <div className="text-3xl font-bold text-gray-900">
                {currentStats ? (
                  formatValue(currentStats[indicator.key as keyof InpatientRevenueRankingData], indicator.unit)
                ) : (
                  '暂无数据'
                )}
              </div>
              <div className="text-sm text-gray-500">
                {indicator.unit === '%' ? '百分比' : '金额'}
              </div>
            </div>
          </div>
        ))}
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
            <div className="w-full h-full">
              <Line data={getChartData()} options={getChartOptions()} />
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
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">详细数据统计</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  时间
                </th>
                {indicators.map((indicator) => (
                  <th key={indicator.key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {indicator.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {chartData.length > 0 ? (
                chartData.map((item, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.date}
                    </td>
                    {indicators.map((indicator) => (
                      <td key={indicator.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatValue(item.data[indicator.key as keyof InpatientRevenueRankingData], indicator.unit)}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={indicators.length + 1} className="px-6 py-12 text-center text-gray-500">
                    <div className="text-4xl mb-2">📋</div>
                    <p className="text-lg mb-1">暂无统计数据</p>
                    <p className="text-sm text-gray-400">
                      请选择日期范围并点击查询按钮加载数据
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}