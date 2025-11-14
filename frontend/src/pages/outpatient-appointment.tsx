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
        const years = result.data.sort((a: number, b: number) => b - a); // 降序排列
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
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-600">分析年份：</span>
        <div className="text-sm text-gray-500">加载中...</div>
      </div>
    );
  }

  if (availableYears.length === 0) {
    return (
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-600">分析年份：</span>
        <div className="text-sm text-red-500">无可用数据</div>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      <span className="text-sm text-gray-600">分析年份：</span>
      <select
        value={selectedYear}
        onChange={(e) => onYearChange(Number(e.target.value))}
        className="bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
      >
        {availableYears.map(year => (
          <option key={year} value={year}>{year}年</option>
        ))}
      </select>
    </div>
  );
};

// 子组件 - 指标卡片
const IndicatorCard = ({
  indicator,
  value
}: {
  indicator: Indicator;
  value: number | null;
}) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-sm font-medium text-gray-700 truncate" title={indicator.name}>
        {indicator.name}
      </h3>
      <div
        className="w-3 h-3 rounded-full flex-shrink-0 ml-2"
        style={{ backgroundColor: indicator.color }}
      />
    </div>
    <div className="text-2xl font-bold text-gray-900 mb-1 min-h-[36px] flex items-center">
      {value !== null ? (
        indicator.isPercentage ? formatPercentage(value) : formatNumber(value)
      ) : (
        <span className="text-gray-400 text-lg">加载中...</span>
      )}
    </div>
    <p className="text-xs text-gray-500 leading-tight line-clamp-2">
      {indicator.description}
    </p>
  </div>
);

// 子组件 - 比较分析项
const ComparisonItem = ({
  indicator,
  data,
  type
}: {
  indicator: Indicator;
  data: ComparisonData | undefined;
  type: 'yoy' | 'mom';
}) => {
  const getChangeColor = (changeType: string) => {
    switch (changeType) {
      case 'increase': return 'text-green-600';
      case 'decrease': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getComparisonText = () => {
    return type === 'yoy' ? '同期' : '上期';
  };

  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
      <div className="flex items-center min-w-0 flex-1">
        <div
          className="w-3 h-3 rounded-full mr-3 flex-shrink-0"
          style={{ backgroundColor: indicator.color }}
        />
        <span className="text-sm text-gray-700 truncate">{indicator.name}</span>
      </div>
      <div className="text-right ml-4 flex-shrink-0">
        {data ? (
          <>
            <div className={`text-sm font-medium ${getChangeColor(data.change_type)}`}>
              {formatPercentage(data.change_rate)}
            </div>
            <div className="text-xs text-gray-500 whitespace-nowrap">
              当前: {indicator.isPercentage ? formatPercentage(data.current_value) : formatNumber(data.current_value)} |
              {getComparisonText()}: {indicator.isPercentage ? formatPercentage(data.comparison_value) : formatNumber(data.comparison_value)}
            </div>
          </>
        ) : (
          <>
            <div className="text-sm text-gray-500">暂无数据</div>
            <div className="text-xs text-gray-400">
              {type === 'yoy' ? '同比' : '环比'}增减率
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// 子组件 - 错误提示
const ErrorDisplay = ({ error, onRetry }: { error: string; onRetry: () => void }) => (
  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center">
        <div className="text-red-600 mr-3">⚠️</div>
        <div>
          <p className="text-red-800 font-medium">连接失败</p>
          <p className="text-red-600 text-sm">{error}</p>
          <p className="text-red-500 text-xs mt-1">
            请确保后端服务正在运行: {API_BASE_URL}
          </p>
        </div>
      </div>
      <button
        onClick={onRetry}
        className="bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700 transition-colors whitespace-nowrap"
      >
        重试连接
      </button>
    </div>
  </div>
);

// 子组件 - 加载状态
const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-full">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
      <p className="text-gray-500">加载数据中...</p>
    </div>
  </div>
);

// 子组件 - 空状态
const EmptyState = ({ error }: { error: string | null }) => (
  <div className="flex items-center justify-center h-full">
    <div className="text-center">
      <div className="text-6xl text-gray-300 mb-4">📊</div>
      <p className="text-gray-500 mb-2">暂无图表数据</p>
      <p className="text-sm text-gray-400">
        {error ? '数据加载失败，请检查后端服务' : '请确保后端数据源已正确配置并连接'}
      </p>
    </div>
  </div>
);

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

  // 图表配置
  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 15,
        }
      },
      title: {
        display: true,
        text: `门诊预约指标趋势图 (${TIME_RANGES.find(r => r.key === timeRange)?.label})`,
        font: {
          size: 16
        }
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      }
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false
    },
    scales: {
      x: {
        title: {
          display: true,
          text: '时间'
        },
        grid: {
          display: false
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
        radius: 3,
        hoverRadius: 5,
        hitRadius: 10
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
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: indicator.color,
        fill: false,
        showLine: true
      }));

    return { labels, datasets };
  }, [chartData, selectedIndicators]);

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-2">门诊预约指标分析</h2>
        <p className="text-gray-600 text-sm">
          监控和分析门诊预约服务的各项指标，包括预约人次、预约率等关键数据，支持同比环比分析
        </p>
      </div>

      {/* 错误提示 */}
      {error && <ErrorDisplay error={error} onRetry={retryConnection} />}

      {/* 指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {INDICATORS.map((indicator) => (
          <IndicatorCard
            key={indicator.key}
            indicator={indicator}
            value={summaryData ? summaryData[indicator.key] : null}
          />
        ))}
      </div>

      {/* 图表控制区域 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
          <h3 className="text-lg font-semibold text-gray-800">趋势分析图表</h3>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* 时间维度选择 */}
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600 whitespace-nowrap">时间维度：</span>
              <div className="flex bg-gray-100 rounded-lg p-1">
                {TIME_RANGES.map((range) => (
                  <button
                    key={range.key}
                    onClick={() => setTimeRange(range.key)}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap min-w-[50px] ${
                      timeRange === range.key
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-gray-600 hover:text-gray-800 hover:bg-gray-200'
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 年份选择器 */}
            <YearSelector
              selectedYear={selectedYear}
              onYearChange={setSelectedYear}
            />
          </div>
        </div>

        {/* 指标选择器 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-600">显示指标：</span>
            <button
              onClick={toggleAllIndicators}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              {selectedIndicators.length === INDICATORS.length ? '取消全选' : '全选'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {INDICATORS.map((indicator) => (
              <button
                key={indicator.key}
                onClick={() => toggleIndicator(indicator.key)}
                className={`inline-flex items-center px-3 py-2 rounded-full text-xs font-medium transition-all ${
                  selectedIndicators.includes(indicator.key)
                    ? 'text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={{
                  backgroundColor: selectedIndicators.includes(indicator.key)
                    ? indicator.color
                    : undefined
                }}
              >
                <div
                  className="w-2 h-2 rounded-full mr-2"
                  style={{
                    backgroundColor: selectedIndicators.includes(indicator.key)
                      ? 'white'
                      : indicator.color
                  }}
                />
                {indicator.name}
              </button>
            ))}
          </div>
        </div>

        {/* 图表区域 */}
        <div className="h-96">
          {loading ? (
            <LoadingSpinner />
          ) : chartData && chartData.length > 0 ? (
            <Line data={chartDataConfig} options={chartOptions} />
          ) : (
            <EmptyState error={error} />
          )}
        </div>
      </div>

      {/* 同比环比分析 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">同比分析</h3>
          <p className="text-xs text-gray-500 mb-4">与去年同期相比的增减情况</p>
          <div className="space-y-3">
            {INDICATORS.map((indicator) => (
              <ComparisonItem
                key={`yoy-${indicator.key}`}
                indicator={indicator}
                data={yoyData[indicator.key]}
                type="yoy"
              />
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">环比分析</h3>
          <p className="text-xs text-gray-500 mb-4">与上期相比的增减情况</p>
          <div className="space-y-3">
            {INDICATORS.map((indicator) => (
              <ComparisonItem
                key={`mom-${indicator.key}`}
                indicator={indicator}
                data={momData[indicator.key]}
                type="mom"
              />
            ))}
          </div>
        </div>
      </div>

      {/* 数据说明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <div className="text-blue-600 mr-3 mt-0.5 text-lg">ℹ️</div>
          <div className="text-blue-800 text-sm">
            <p className="font-medium mb-2">数据说明：</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>数据来源于医院预约系统，每日更新</li>
              <li>预约率指标以百分比形式显示，反映预约服务的普及程度</li>
              <li>支持按天、月、季度查看不同时间粒度的数据趋势</li>
              <li>同比环比分析帮助了解预约服务的发展趋势和季节性变化</li>
              <li>点击指标标签可控制图表中对应数据线的显示/隐藏</li>
              <li>后端服务运行在: {API_BASE_URL}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}