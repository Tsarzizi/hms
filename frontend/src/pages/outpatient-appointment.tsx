import { useState, useEffect, useCallback, useMemo } from 'react';
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

// 类型定义
interface AppointmentData {
  appointmentVisits: number;
  appointmentRate: number;
  generalAppointments: number;
  specialAppointments: number;
  specialistAppointments: number;
  diseaseAppointments: number;
  generalAppointmentRate: number;
  specialAppointmentRate: number;
  specialistAppointmentRate: number;
  diseaseAppointmentRate: number;
}

interface ChartData {
  date: string;
  data: AppointmentData;
}

interface SummaryData {
  appointmentVisits: number;
  appointmentRate: number;
  generalAppointments: number;
  specialAppointments: number;
  specialistAppointments: number;
  diseaseAppointments: number;
  generalAppointmentRate: number;
  specialAppointmentRate: number;
  specialistAppointmentRate: number;
  diseaseAppointmentRate: number;
}

interface ComparisonData {
  current_value: number;
  comparison_value: number;
  change_rate: number;
  change_type: string;
}

interface Indicator {
  key: keyof AppointmentData;
  name: string;
  color: string;
  description: string;
  isPercentage?: boolean;
}

// 常量配置
const INDICATORS: Indicator[] = [
  {
    key: 'appointmentVisits',
    name: '预约诊疗人次',
    color: '#3B82F6',
    description: '报告期内某地区患者采用网上、电话、院内登记、双向转诊等方式成功预约诊疗人次之和，含中医',
    isPercentage: false
  },
  {
    key: 'appointmentRate',
    name: '预约就诊率',
    color: '#EF4444',
    description: '预约就诊率(%)=预约就诊人次/门诊人次×100%',
    isPercentage: true
  },
  {
    key: 'generalAppointments',
    name: '普通门诊预约人次',
    color: '#10B981',
    description: '报告期内某地区医疗卫生机构的普通门诊的预约人次数之和',
    isPercentage: false
  },
  {
    key: 'specialAppointments',
    name: '特需门诊预约人次',
    color: '#F59E0B',
    description: '报告期内某地区医疗卫生机构的特需门诊的预约人次数之和',
    isPercentage: false
  },
  {
    key: 'specialistAppointments',
    name: '专科门诊预约人次',
    color: '#8B5CF6',
    description: '报告期内某地区医疗卫生机构的专科门诊的预约人次数之和',
    isPercentage: false
  },
  {
    key: 'diseaseAppointments',
    name: '专病门诊预约人次',
    color: '#EC4899',
    description: '报告期内某地区医疗卫生机构的专病门诊的预约人次数之和',
    isPercentage: false
  },
  {
    key: 'generalAppointmentRate',
    name: '普通门诊预约率',
    color: '#06B6D4',
    description: '普通门诊预约率(%)=普通门诊预约人次/普通门诊总人次×100%',
    isPercentage: true
  },
  {
    key: 'specialAppointmentRate',
    name: '特需门诊预约率',
    color: '#84CC16',
    description: '特需门诊预约率(%)=特需门诊预约人次/特需门诊总人次×100%',
    isPercentage: true
  },
  {
    key: 'specialistAppointmentRate',
    name: '专科门诊预约率',
    color: '#F97316',
    description: '专科门诊预约率(%)=专科门诊预约人次/专科门诊总人次×100%',
    isPercentage: true
  },
  {
    key: 'diseaseAppointmentRate',
    name: '专病门诊预约率',
    color: '#EF4444',
    description: '专病门诊预约率(%)=专病门诊预约人次/专病门诊总人次×100%',
    isPercentage: true
  }
];

const TIME_RANGES = [
  { key: 'day', label: '天' },
  { key: 'month', label: '月' },
  { key: 'quarter', label: '季度' }
] as const;

const API_BASE_URL = '';

// 模拟科室数据
const mockDepartments = [
  { value: "internal", label: "内科" },
  { value: "surgery", label: "外科" },
  { value: "cardiology", label: "心血管内科" },
  { value: "neurology", label: "神经内科" },
  { value: "respiratory", label: "呼吸内科" },
  { value: "gastroenterology", label: "消化内科" }
];

// 模拟医生数据
const mockDoctors = [
  { value: "doctor_1", label: "王医生" },
  { value: "doctor_2", label: "李医生" },
  { value: "doctor_3", label: "张医生" },
  { value: "doctor_4", label: "刘医生" },
  { value: "doctor_5", label: "陈医生" }
];

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
                  <span className="text-sm text-gray-700 truncate" title={`${o.label}（${o.value}）`}>
                    {o.label} <span className="text-gray-400">（{o.value}）</span>
                  </span>
                </label>
              ))
            )}
          </div>
          <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              共 {filtered.length} 项，已选 {selected.size} 项
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-white transition-colors duration-150"
                onClick={clear}
              >
                清空
              </button>
              <button
                type="button"
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-150"
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

// 工具函数
const formatNumber = (num: any): string => {
  const numberValue = typeof num === 'number' ? num :
                     typeof num === 'string' ? parseFloat(num) : 0;

  if (numberValue >= 10000) {
    return (numberValue / 10000).toFixed(1) + '万';
  }
  return new Intl.NumberFormat('zh-CN').format(numberValue);
};

const formatPercentage = (num: any): string => {
  const numberValue = typeof num === 'number' ? num :
                     typeof num === 'string' ? parseFloat(num) : 0;
  return `${numberValue.toFixed(2)}%`;
};

// 子组件 - 年份选择器
const YearSelector = ({
  selectedYear,
  onYearChange
}: {
  selectedYear: number;
  onYearChange: (year: number) => void;
}) => {
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAvailableYears = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/outpatient-appointment/years`);

      if (!response.ok) {
        throw new Error(`HTTP错误! 状态码: ${response.status}`);
      }

      const result = await response.json();

      if (result.success && result.data) {
        const years = result.data.sort((a: number, b: number) => b - a);
        setAvailableYears(years);
        if (years.length > 0 && !selectedYear) {
          onYearChange(years[0]);
        }
      } else {
        console.error('获取年份列表失败:', result.error);
      }
    } catch (error) {
      console.error('获取年份列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, onYearChange]);

  useEffect(() => {
    fetchAvailableYears();
  }, [fetchAvailableYears]);

  if (loading) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 block">分析年份</label>
        <div className="text-sm text-gray-500">加载中...</div>
      </div>
    );
  }

  if (availableYears.length === 0) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 block">分析年份</label>
        <div className="text-sm text-red-500">无可用数据</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700 block">分析年份</label>
      <select
        value={selectedYear}
        onChange={(e) => onYearChange(Number(e.target.value))}
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
      >
        {availableYears.map(year => (
          <option key={year} value={year}>{year}年</option>
        ))}
      </select>
    </div>
  );
};

export default function OutpatientAppointment() {
  const [timeRange, setTimeRange] = useState<string>('month');
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [yoyData, setYoyData] = useState<{ [key: string]: ComparisonData }>({});
  const [momData, setMomData] = useState<{ [key: string]: ComparisonData }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>(
    ['appointmentVisits', 'appointmentRate', 'generalAppointments']
  );
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // 筛选条件状态
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedDeps, setSelectedDeps] = useState<Set<string>>(new Set());
  const [selectedDoctors, setSelectedDoctors] = useState<Set<string>>(new Set());

  // 数据获取函数
  const fetchData = useCallback(async (range: string, year?: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ range });
      if (year) params.append('year', year.toString());

      const url = `${API_BASE_URL}/api/outpatient-appointment?${params}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP错误! 状态码: ${response.status}`);
      }

      const result = await response.json();
      if (result.success) {
        setChartData(result.data);
      } else {
        throw new Error(result.error || 'API返回错误');
      }
    } catch (error) {
      console.error('获取数据失败:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      setError(errorMessage);
      setChartData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSummaryData = useCallback(async (range: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/outpatient-appointment/summary?range=${range}`);
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setSummaryData(result.data);
        }
      }
    } catch (error) {
      console.error('获取摘要数据失败:', error);
    }
  }, []);

  const fetchComparisonData = useCallback(async (type: 'yoy' | 'mom', setData: React.Dispatch<React.SetStateAction<{ [key: string]: ComparisonData }>>) => {
    try {
      const periodDate = `${selectedYear}-01-01`;
      const response = await fetch(
        `${API_BASE_URL}/api/outpatient-appointment/comparison?type=${type}&period_date=${periodDate}`
      );

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setData(result.data);
        }
      }
    } catch (error) {
      console.error(`获取${type === 'yoy' ? '同比' : '环比'}数据失败:`, error);
    }
  }, [selectedYear]);

  const testBackendConnection = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`);
      return response.ok;
    } catch (error) {
      console.error('后端连接测试失败:', error);
      return false;
    }
  }, []);

  // 初始化数据
  const initializeData = useCallback(async () => {
    const isBackendConnected = await testBackendConnection();
    if (!isBackendConnected) {
      setError('无法连接到后端服务，请确保后端服务正在运行');
      return;
    }

    await Promise.all([
      fetchData(timeRange, selectedYear),
      fetchSummaryData(timeRange),
      fetchComparisonData('yoy', setYoyData),
      fetchComparisonData('mom', setMomData)
    ]);
  }, [timeRange, selectedYear, testBackendConnection, fetchData, fetchSummaryData, fetchComparisonData]);

  // 重试连接
  const retryConnection = useCallback(() => {
    setError(null);
    initializeData();
  }, [initializeData]);

  useEffect(() => {
    initializeData();
  }, [initializeData]);

  // 当选中年份变化时重新获取同比环比数据
  useEffect(() => {
    if (selectedYear) {
      fetchComparisonData('yoy', setYoyData);
      fetchComparisonData('mom', setMomData);
    }
  }, [selectedYear, fetchComparisonData]);

  // 切换指标显示
  const toggleIndicator = useCallback((key: string) => {
    setSelectedIndicators(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  }, []);

  const toggleAllIndicators = useCallback(() => {
    setSelectedIndicators(
      selectedIndicators.length === INDICATORS.length
        ? []
        : INDICATORS.map(ind => ind.key)
    );
  }, [selectedIndicators.length]);

  const getComparisonIcon = (changeType: string) => {
    switch (changeType) {
      case 'increase':
        return '↑';
      case 'decrease':
        return '↓';
      default:
        return '→';
    }
  };

  const getComparisonColor = (changeType: string) => {
    switch (changeType) {
      case 'increase':
        return 'text-green-600 bg-green-100';
      case 'decrease':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const handleQuery = async () => {
    setLoading(true);
    try {
      await fetchData(timeRange, selectedYear);
      await fetchSummaryData(timeRange);
      await fetchComparisonData('yoy', setYoyData);
      await fetchComparisonData('mom', setMomData);
    } catch (error) {
      console.error('查询数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedDate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    setSelectedDeps(new Set());
    setSelectedDoctors(new Set());
    setTimeRange('month');
    setSelectedYear(new Date().getFullYear());

    fetchData('month', new Date().getFullYear());
  };

  // 图表配置
  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: `门诊预约指标趋势图 (${TIME_RANGES.find(r => r.key === timeRange)?.label})`
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
  }), [timeRange]);

  const chartDataConfig = useMemo(() => {
    if (!chartData || chartData.length === 0) {
      return { labels: [], datasets: [] };
    }

    const labels = chartData.map(item => item.date);
    const datasets = INDICATORS
      .filter(indicator => selectedIndicators.includes(indicator.key))
      .map(indicator => ({
        label: indicator.name,
        data: chartData.map(item => {
          const value = item.data[indicator.key];
          return typeof value === 'number' ? value : 0;
        }),
        borderColor: indicator.color,
        backgroundColor: `${indicator.color}20`,
        tension: 0.1,
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: false,
        showLine: true
      }));

    return { labels, datasets };
  }, [chartData, selectedIndicators]);

  const getSummaryValue = (key: keyof AppointmentData) => {
    if (!summaryData) return '暂无数据';
    const value = summaryData[key];
    const indicator = INDICATORS.find(ind => ind.key === key);

    if (!indicator) return '暂无数据';

    return value !== null && value !== undefined
      ? indicator.isPercentage
        ? formatPercentage(value)
        : formatNumber(value)
      : `0${indicator.isPercentage ? '%' : ''}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* 页面标题 */}
      <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <h1 className="text-2xl font-bold text-gray-900">门诊预约指标分析</h1>
            <p className="text-gray-600 text-sm mt-2">
              监控和分析门诊预约服务的各项指标，包括预约人次、预约率等关键数据，支持同比环比分析
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium text-gray-900">{selectedDate} 数据</div>
              <div className="text-xs text-gray-500">最后更新：今天 14:30</div>
            </div>
            <button className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors duration-200">
              <span className="text-lg">📅</span>
            </button>
          </div>
        </div>
      </header>

      {/* 筛选区域 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 text-left">数据筛选</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">统计月份</label>
            <input
              type="month"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
            />
          </div>

          <div className="space-y-2">
            <MultiSelect
              label="科室筛选"
              options={mockDepartments}
              selected={selectedDeps}
              onChange={setSelectedDeps}
              placeholder="全部科室"
              searchPlaceholder="搜索科室…"
            />
          </div>

          <div className="space-y-2">
            <MultiSelect
              label="医生筛选"
              options={mockDoctors}
              selected={selectedDoctors}
              onChange={setSelectedDoctors}
              placeholder="全部医生"
              searchPlaceholder="搜索医生…"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">时间维度</label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
            >
              {TIME_RANGES.map((range) => (
                <option key={range.key} value={range.key}>
                  {range.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <YearSelector
              selectedYear={selectedYear}
              onYearChange={setSelectedYear}
            />
          </div>

          <div className="flex items-end gap-2 col-span-2">
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

      {/* 指标卡片 */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {INDICATORS.map((indicator) => (
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
                {getSummaryValue(indicator.key)}
              </div>
              <div className="text-sm">
                {summaryData ? (
                  <span className="text-gray-400 text-sm">当前平均值</span>
                ) : (
                  <span className="text-gray-400 text-sm">等待数据库连接</span>
                )}
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 font-medium mb-2">计算公式：</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {indicator.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* 同比环比分析 */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">同比分析</h2>
          <p className="text-sm text-gray-500 mb-4">与去年同期相比的增减情况</p>
          <div className="space-y-4">
            {INDICATORS.map((indicator) => {
              const comparison = yoyData[indicator.key];
              return (
                <div key={`yoy-${indicator.key}`} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
                  <div className="flex items-center">
                    <div
                      className="w-3 h-3 rounded-full mr-3"
                      style={{ backgroundColor: indicator.color }}
                    ></div>
                    <span className="text-sm font-medium text-gray-700">{indicator.name}</span>
                  </div>
                  <div className="text-right">
                    {comparison ? (
                      <>
                        <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getComparisonColor(comparison.change_type)}`}>
                          <span className="mr-1">{getComparisonIcon(comparison.change_type)}</span>
                          {Math.abs(comparison.change_rate).toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {indicator.isPercentage ? formatPercentage(comparison.current_value) : formatNumber(comparison.current_value)} vs {indicator.isPercentage ? formatPercentage(comparison.comparison_value) : formatNumber(comparison.comparison_value)}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-gray-500">暂无数据</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">环比分析</h2>
          <p className="text-sm text-gray-500 mb-4">与上期相比的增减情况</p>
          <div className="space-y-4">
            {INDICATORS.map((indicator) => {
              const comparison = momData[indicator.key];
              return (
                <div key={`mom-${indicator.key}`} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
                  <div className="flex items-center">
                    <div
                      className="w-3 h-3 rounded-full mr-3"
                      style={{ backgroundColor: indicator.color }}
                    ></div>
                    <span className="text-sm font-medium text-gray-700">{indicator.name}</span>
                  </div>
                  <div className="text-right">
                    {comparison ? (
                      <>
                        <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getComparisonColor(comparison.change_type)}`}>
                          <span className="mr-1">{getComparisonIcon(comparison.change_type)}</span>
                          {Math.abs(comparison.change_rate).toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {indicator.isPercentage ? formatPercentage(comparison.current_value) : formatNumber(comparison.current_value)} vs {indicator.isPercentage ? formatPercentage(comparison.comparison_value) : formatNumber(comparison.comparison_value)}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-gray-500">暂无数据</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 图表控制区域 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 lg:mb-0">趋势分析图表</h2>

          {/* 指标选择器 */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700">显示指标：</span>
            <button
              onClick={toggleAllIndicators}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              {selectedIndicators.length === INDICATORS.length ? '取消全选' : '全选'}
            </button>
          </div>
        </div>

        {/* 指标选择器 */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            {INDICATORS.map((indicator) => (
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
                <Line data={chartDataConfig} options={chartOptions} />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg w-full">
              <div className="text-center">
                <div className="text-6xl text-gray-300 mb-4">📊</div>
                <p className="text-gray-500 mb-2 text-lg">暂无图表数据</p>
                <p className="text-gray-400">
                  请确保后端数据源已正确配置并连接
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
                {INDICATORS.map((indicator) => (
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
                    {INDICATORS.map((indicator) => (
                      <td key={indicator.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {indicator.isPercentage
                          ? formatPercentage(item.data[indicator.key])
                          : formatNumber(item.data[indicator.key])
                        }
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={INDICATORS.length + 1} className="px-6 py-12 text-center text-gray-500">
                    <div className="text-4xl mb-2">🗃️</div>
                    <p className="text-lg mb-1">暂无详细数据</p>
                    <p className="text-sm text-gray-400">
                      请连接PostgreSQL数据库后查看详细统计
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 数据说明 */}
      <section className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <div className="flex items-start">
          <div className="text-blue-600 mr-3 mt-0.5 text-lg">💡</div>
          <div className="text-blue-800">
            <h3 className="font-medium mb-2 text-lg">数据说明：</h3>
            <ul className="list-disc list-inside space-y-2 text-sm">
              <li>数据来源于医院预约系统，每日更新</li>
              <li>预约率指标以百分比形式显示，反映预约服务的普及程度</li>
              <li>支持按天、月、季度查看不同时间粒度的数据趋势</li>
              <li>同比环比分析帮助了解预约服务的发展趋势和季节性变化</li>
              <li>点击指标标签可控制图表中对应数据线的显示/隐藏</li>
              <li>预约诊疗分析有助于了解医院预约服务的使用情况和效率</li>
              <li>不同门诊类型的预约数据反映患者对不同医疗服务的需求</li>
              <li>后端服务运行在: {API_BASE_URL}</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}