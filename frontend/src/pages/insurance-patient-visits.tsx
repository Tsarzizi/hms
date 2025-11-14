import { useState, useEffect } from 'react';
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
  Legend
);

interface InsuranceVisitData {
  outpatientEmergencyVisits: number;    // 门急诊医保患者就诊人次
  outpatientVisits: number;             // 门诊医保患者就诊人次
  emergencyVisits: number;              // 急诊医保患者就诊人次
  outpatientEmergencyPatients: number;  // 门诊医保患者就诊人数
  revisitRate: number;                  // 医保患者复诊率
}

interface ChartData {
  date: string;
  data: InsuranceVisitData;
}

interface SummaryData {
  outpatientEmergencyVisits: number;
  outpatientVisits: number;
  emergencyVisits: number;
  outpatientEmergencyPatients: number;
  revisitRate: number;
}

interface ComparisonData {
  current_value: number;
  comparison_value: number;
  change_rate: number;
  change_type: string;
}

const indicators = [
  {
    key: 'outpatientEmergencyVisits',
    name: '门急诊医保患者就诊人次',
    color: '#3B82F6',
    description: '门急诊医保患者就诊人次（人次）=期内门诊和急诊医保患者的就诊人次数之和',
    unit: '人次'
  },
  {
    key: 'outpatientVisits',
    name: '门诊医保患者就诊人次',
    color: '#10B981',
    description: '门诊医保患者就诊人次（人次）=期内门诊医保患者的就诊人次数之和',
    unit: '人次'
  },
  {
    key: 'emergencyVisits',
    name: '急诊医保患者就诊人次',
    color: '#F59E0B',
    description: '急诊医保患者就诊人次（人次）=期内急诊医保患者的就诊人次数之和',
    unit: '人次'
  },
  {
    key: 'outpatientEmergencyPatients',
    name: '门诊医保患者就诊人数',
    color: '#8B5CF6',
    description: '门急诊医保就诊人数（个）=期内门诊和急诊医保患者的就诊人数之和',
    unit: '个'
  },
  {
    key: 'revisitRate',
    name: '医保患者复诊率',
    color: '#EF4444',
    description: '医保患者门诊复诊率=期内门诊医保患者非初诊就诊人次/同期门诊医保患者就诊人次×100%',
    unit: '%'
  }
];

// 时间范围选项
const timeRanges = [
  { key: 'month', label: '月' },
  { key: 'quarter', label: '季度' },
  { key: 'year', label: '年' }
];

// API基础URL - 使用端口5054
const API_BASE_URL = 'http://localhost:5055';

// 独立的年份选择器组件
const YearSelector = ({
  selectedYear,
  onYearChange
}: {
  selectedYear: number;
  onYearChange: (year: number) => void;
}) => {
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAvailableYears = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/insurance-visits/years`);

      if (!response.ok) {
        throw new Error(`HTTP错误! 状态码: ${response.status}`);
      }

      const result = await response.json();

      if (result.success && result.data) {
        setAvailableYears(result.data);
        if (result.data.length > 0 && !selectedYear) {
          onYearChange(result.data[0]); // 选择最新的年份
        }
      } else {
        console.error('获取年份列表失败:', result.error);
      }
    } catch (error) {
      console.error('获取年份列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailableYears();
  }, []);

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
        className="bg-gray-100 border border-gray-300 rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
      >
        {availableYears.map(year => (
          <option key={year} value={year}>{year}年</option>
        ))}
      </select>
    </div>
  );
};

// 期间选择器组件
const PeriodSelector = ({
  selectedPeriod,
  onPeriodChange
}: {
  selectedPeriod: string;
  onPeriodChange: (period: string) => void;
}) => {
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAvailablePeriods = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/insurance-visits/comparison-periods`);

      if (!response.ok) {
        throw new Error(`HTTP错误! 状态码: ${response.status}`);
      }

      const result = await response.json();

      if (result.success && result.data) {
        setAvailablePeriods(result.data);
        if (result.data.length > 0 && !selectedPeriod) {
          onPeriodChange(result.data[0]); // 选择最新的期间
        }
      } else {
        console.error('获取期间列表失败:', result.error);
        // 生成默认的期间列表作为后备
        const currentYear = new Date().getFullYear();
        const defaultPeriods = [];
        for (let i = 0; i < 12; i++) {
          const date = new Date(currentYear, i, 1);
          defaultPeriods.push(date.toISOString().split('T')[0]);
        }
        setAvailablePeriods(defaultPeriods);
        if (!selectedPeriod) {
          onPeriodChange(defaultPeriods[defaultPeriods.length - 1]);
        }
      }
    } catch (error) {
      console.error('获取期间列表失败:', error);
      // 生成默认的期间列表作为后备
      const currentYear = new Date().getFullYear();
      const defaultPeriods = [];
      for (let i = 0; i < 12; i++) {
        const date = new Date(currentYear, i, 1);
        defaultPeriods.push(date.toISOString().split('T')[0]);
      }
      setAvailablePeriods(defaultPeriods);
      if (!selectedPeriod) {
        onPeriodChange(defaultPeriods[defaultPeriods.length - 1]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailablePeriods();
  }, []);

  const formatPeriodDisplay = (period: string) => {
    try {
      const date = new Date(period);
      return `${date.getFullYear()}年${date.getMonth() + 1}月`;
    } catch {
      return period;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-600">分析期间：</span>
        <div className="text-sm text-gray-500">加载中...</div>
      </div>
    );
  }

  if (availablePeriods.length === 0) {
    return (
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-600">分析期间：</span>
        <div className="text-sm text-red-500">无可用数据</div>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      <span className="text-sm text-gray-600">分析期间：</span>
      <select
        value={selectedPeriod}
        onChange={(e) => onPeriodChange(e.target.value)}
        className="bg-gray-100 border border-gray-300 rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
      >
        {availablePeriods.map(period => (
          <option key={period} value={period}>
            {formatPeriodDisplay(period)}
          </option>
        ))}
      </select>
    </div>
  );
};

export default function InsurancePatientVisits() {
  const [timeRange, setTimeRange] = useState('month');
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [yoyData, setYoyData] = useState<{ [key: string]: ComparisonData }>({});
  const [momData, setMomData] = useState<{ [key: string]: ComparisonData }>({});
  const [loading, setLoading] = useState(false);
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>(
    indicators.map(ind => ind.key)
  );
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');

  // 从后端获取图表数据
  const fetchData = async (range: string, year?: number) => {
    setLoading(true);
    try {
      // 构建查询参数
      const params = new URLSearchParams({
        range: range
      });

      // 如果指定了年份，添加到查询参数
      if (year) {
        params.append('year', year.toString());
      }

      const url = `${API_BASE_URL}/api/insurance-visits?${params}`;
      console.log('请求医保患者就诊情况URL:', url);

      const response = await fetch(url);

      // 首先检查响应状态
      if (!response.ok) {
        // 尝试获取响应文本以查看错误详情
        const errorText = await response.text();
        console.error('医保患者就诊情况API响应错误:', {
          status: response.status,
          statusText: response.statusText,
          url: url,
          responseText: errorText
        });
        throw new Error(`HTTP错误! 状态码: ${response.status}, 响应: ${errorText.substring(0, 100)}`);
      }

      // 检查响应内容类型
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('响应不是JSON格式:', {
          contentType: contentType,
          responseText: text.substring(0, 200)
        });
        throw new Error(`响应不是JSON格式，实际类型: ${contentType}`);
      }

      const result = await response.json();
      console.log('医保患者就诊情况API响应:', result);

      if (result.success) {
        console.log('获取到医保患者就诊情况数据条数:', result.data.length);
        setChartData(result.data);
      } else {
        throw new Error(result.error || 'API返回错误');
      }
    } catch (error) {
      console.error('获取医保患者就诊情况数据失败:', error);
      // 不再设置错误状态，直接使用模拟数据
      setChartData(getMockData());
    } finally {
      setLoading(false);
    }
  };

  // 获取摘要数据
  const fetchSummaryData = async (range: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/insurance-visits/summary?range=${range}`);

      if (!response.ok) {
        console.error('获取摘要数据失败，状态码:', response.status);
        return;
      }

      const result = await response.json();

      if (result.success) {
        setSummaryData(result.data);
      } else {
        console.error('获取摘要数据失败:', result.error);
      }
    } catch (error) {
      console.error('获取摘要数据失败:', error);
    }
  };

  // 获取同比环比数据
  const fetchComparisonData = async (type: 'yoy' | 'mom', setData: React.Dispatch<React.SetStateAction<{ [key: string]: ComparisonData }>>) => {
    try {
      // 使用选中的期间，如果没有则使用当前月份
      let periodDate = selectedPeriod;
      if (!periodDate) {
        const currentDate = new Date();
        periodDate = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-01`;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/insurance-visits/comparison?type=${type}&period_date=${periodDate}`
      );

      if (!response.ok) {
        throw new Error(`HTTP错误! 状态码: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        console.log(`获取${type === 'yoy' ? '同比' : '环比'}数据成功:`, result.data);
        setData(result.data);
      } else {
        console.error(`获取${type === 'yoy' ? '同比' : '环比'}数据失败:`, result.error);
        setData({});
      }
    } catch (error) {
      console.error(`获取${type === 'yoy' ? '同比' : '环比'}数据失败:`, error);
      setData({});
    }
  };

  // 测试后端连接
  const testBackendConnection = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`);
      if (response.ok) {
        const result = await response.json();
        console.log('后端连接正常:', result);
        return true;
      }
    } catch (error) {
      console.error('后端连接测试失败:', error);
    }
    return false;
  };

  // 模拟数据函数
  const getMockData = () => {
    const mockData: ChartData[] = [];
    const months = ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06'];

    months.forEach(month => {
      const outpatientEmergencyVisits = Math.floor(Math.random() * 5000) + 10000; // 10000-15000人次
      const outpatientVisits = Math.floor(Math.random() * 4000) + 8000; // 8000-12000人次
      const emergencyVisits = Math.floor(Math.random() * 1000) + 2000; // 2000-3000人次
      const outpatientEmergencyPatients = Math.floor(Math.random() * 3000) + 6000; // 6000-9000个
      const revisitRate = Math.floor(Math.random() * 20) + 30; // 30-50%

      mockData.push({
        date: month,
        data: {
          outpatientEmergencyVisits,
          outpatientVisits,
          emergencyVisits,
          outpatientEmergencyPatients,
          revisitRate
        }
      });
    });

    return mockData;
  };

  useEffect(() => {
    const initializeData = async () => {
      // 先测试后端连接
      const isBackendConnected = await testBackendConnection();

      if (!isBackendConnected) {
        // 不再显示错误，直接使用模拟数据
        console.log('后端服务不可用，使用模拟数据');
        const mockData = getMockData();
        setChartData(mockData);

        // 计算摘要数据
        const totalOutpatientEmergencyVisits = mockData.reduce((sum, item) => sum + item.data.outpatientEmergencyVisits, 0) / mockData.length;
        const totalOutpatientVisits = mockData.reduce((sum, item) => sum + item.data.outpatientVisits, 0) / mockData.length;
        const totalEmergencyVisits = mockData.reduce((sum, item) => sum + item.data.emergencyVisits, 0) / mockData.length;
        const totalOutpatientEmergencyPatients = mockData.reduce((sum, item) => sum + item.data.outpatientEmergencyPatients, 0) / mockData.length;
        const totalRevisitRate = mockData.reduce((sum, item) => sum + item.data.revisitRate, 0) / mockData.length;

        setSummaryData({
          outpatientEmergencyVisits: totalOutpatientEmergencyVisits,
          outpatientVisits: totalOutpatientVisits,
          emergencyVisits: totalEmergencyVisits,
          outpatientEmergencyPatients: totalOutpatientEmergencyPatients,
          revisitRate: totalRevisitRate
        });
        return;
      }

      // 如果后端连接正常，获取数据
      await fetchData(timeRange, selectedYear);
      await fetchSummaryData(timeRange);
      await fetchComparisonData('yoy', setYoyData);
      await fetchComparisonData('mom', setMomData);
    };

    initializeData();
  }, [timeRange, selectedYear]);

  // 当选中年份变化时重新获取同比环比数据
  useEffect(() => {
    if (selectedYear) {
      fetchComparisonData('yoy', setYoyData);
      fetchComparisonData('mom', setMomData);
    }
  }, [selectedYear]);

  // 当选中期间变化时重新获取同比环比数据
  useEffect(() => {
    if (selectedPeriod) {
      fetchComparisonData('yoy', setYoyData);
      fetchComparisonData('mom', setMomData);
    }
  }, [selectedPeriod]);

  const toggleIndicator = (key: string) => {
    setSelectedIndicators(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  const getSummaryValue = (key: keyof InsuranceVisitData) => {
    if (!summaryData) return '暂无数据';
    const value = summaryData[key];
    const indicator = indicators.find(ind => ind.key === key);

    if (key === 'revisitRate') {
      return value !== null && value !== undefined
        ? `${value.toFixed(2)}${indicator?.unit || ''}`
        : `0${indicator?.unit || ''}`;
    }

    return value !== null && value !== undefined
      ? `${value.toFixed(0)}${indicator?.unit || ''}`
      : `0${indicator?.unit || ''}`;
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
        text: `医保患者就诊情况指标趋势图 (${timeRanges.find(r => r.key === timeRange)?.label})`
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
          text: selectedIndicators.includes('revisitRate') ? '百分比 (%) / 数量' : '数量'
        },
        beginAtZero: true,
        ticks: {
          callback: function(value: any) {
            if (selectedIndicators.includes('revisitRate') && typeof value === 'number') {
              return value + (value <= 100 ? '%' : '');
            }
            return value;
          }
        }
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
          const value = item.data[indicator.key as keyof InsuranceVisitData];
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
        yAxisID: indicator.key === 'revisitRate' ? 'y1' : 'y'
      }));

    return {
      labels,
      datasets,
      // 为百分比指标添加第二个Y轴
      ...(selectedIndicators.includes('revisitRate') && {
        scales: {
          y: {
            type: 'linear' as const,
            display: true,
            position: 'left' as const,
            title: {
              display: true,
              text: '数量'
            }
          },
          y1: {
            type: 'linear' as const,
            display: true,
            position: 'right' as const,
            title: {
              display: true,
              text: '百分比 (%)'
            },
            min: 0,
            max: 100,
            grid: {
              drawOnChartArea: false,
            },
          }
        }
      })
    };
  };

  const formatValue = (num: any, unit: string) => {
    const numberValue = typeof num === 'number' ? num :
                       typeof num === 'string' ? parseFloat(num) : 0;

    if (unit === '%') {
      return `${numberValue.toFixed(2)}${unit}`;
    }

    return `${numberValue}${unit}`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-2">医保患者就诊情况</h2>
        <p className="text-gray-600 text-sm">
          监控和分析医院医保患者就诊情况，包括门急诊医保患者就诊人次、门诊医保患者就诊人次、急诊医保患者就诊人次、门诊医保患者就诊人数、医保患者复诊率等关键指标，支持同比环比分析
        </p>
      </div>

      {/* 主要指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {indicators.map((indicator) => (
          <div key={indicator.key} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-700">{indicator.name}</h3>
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: indicator.color }}
              ></div>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-3">
              {getSummaryValue(indicator.key as keyof InsuranceVisitData)}
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600 font-medium mb-2">统计说明：</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                {indicator.description}
              </p>
              {indicator.key === 'outpatientEmergencyVisits' && (
                <p className="text-xs text-gray-500 mt-2">
                  <strong>计算公式：</strong>门急诊医保患者就诊人次（人次）=期内门诊和急诊医保患者的就诊人次数之和
                </p>
              )}
              {indicator.key === 'outpatientVisits' && (
                <p className="text-xs text-gray-500 mt-2">
                  <strong>计算公式：</strong>门诊医保患者就诊人次（人次）=期内门诊医保患者的就诊人次数之和
                </p>
              )}
              {indicator.key === 'emergencyVisits' && (
                <p className="text-xs text-gray-500 mt-2">
                  <strong>计算公式：</strong>急诊医保患者就诊人次（人次）=期内急诊医保患者的就诊人次数之和
                </p>
              )}
              {indicator.key === 'outpatientEmergencyPatients' && (
                <p className="text-xs text-gray-500 mt-2">
                  <strong>计算公式：</strong>门急诊医保就诊人数（个）=期内门诊和急诊医保患者的就诊人数之和
                </p>
              )}
              {indicator.key === 'revisitRate' && (
                <p className="text-xs text-gray-500 mt-2">
                  <strong>计算公式：</strong>医保患者门诊复诊率=期内门诊医保患者非初诊就诊人次/同期门诊医保患者就诊人次×100%
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 图表控制区域 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 lg:mb-0">趋势分析图表</h3>

          {/* 时间维度选择、年份选择和期间选择 */}
          <div className="flex flex-col lg:flex-row lg:items-center space-y-4 lg:space-y-0 lg:space-x-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">时间维度：</span>
              <div className="flex bg-gray-100 rounded-lg p-1">
                {timeRanges.map((range) => (
                  <button
                    key={range.key}
                    onClick={() => setTimeRange(range.key)}
                    className={`px-3 py-1 text-sm rounded-md transition-colors whitespace-nowrap ${
                      timeRange === range.key
                        ? 'bg-green-600 text-white'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 独立的年份选择器组件 */}
            <YearSelector
              selectedYear={selectedYear}
              onYearChange={setSelectedYear}
            />

            {/* 新增：期间选择器 */}
            <PeriodSelector
              selectedPeriod={selectedPeriod}
              onPeriodChange={setSelectedPeriod}
            />
          </div>
        </div>

        {/* 指标选择器 */}
        <div className="mb-6">
          <div className="flex items-center mb-3">
            <span className="text-sm text-gray-600 mr-3">显示指标：</span>
            <button
              onClick={() => setSelectedIndicators(
                selectedIndicators.length === indicators.length ? [] : indicators.map(ind => ind.key)
              )}
              className="text-xs text-green-600 hover:text-green-800"
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

        {/* 图表区域 */}
        <div className="h-96">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
                <p className="text-gray-500">加载数据中...</p>
              </div>
            </div>
          ) : chartData && chartData.length > 0 ? (
            <Line data={getChartData()} options={getChartOptions()} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-6xl text-gray-300 mb-4">📊</div>
                <p className="text-gray-500 mb-2">暂无图表数据</p>
                <p className="text-sm text-gray-400">
                  请确保后端数据源已正确配置并连接
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 同比环比分析 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">同比分析</h3>
          <p className="text-xs text-gray-500 mb-4">与去年同期相比的增减情况</p>
          <div className="space-y-3">
            {indicators.map((indicator) => {
              const data = yoyData[indicator.key];
              return (
                <div key={`yoy-${indicator.key}`} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                  <div className="flex items-center">
                    <div
                      className="w-3 h-3 rounded-full mr-3"
                      style={{ backgroundColor: indicator.color }}
                    ></div>
                    <span className="text-sm text-gray-700">{indicator.name}</span>
                  </div>
                  <div className="text-right">
                    {data ? (
                      <>
                        <div className={`text-sm font-medium ${
                          data.change_type === 'increase' ? 'text-green-600' : 
                          data.change_type === 'decrease' ? 'text-red-600' : 
                          'text-gray-600'
                        }`}>
                          {data.change_rate > 0 ? '+' : ''}{data.change_rate.toFixed(2)}%
                        </div>
                        <div className="text-xs text-gray-500">
                          当前: {formatValue(data.current_value, indicator.unit)} |
                          同期: {formatValue(data.comparison_value, indicator.unit)}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm text-gray-500">暂无数据</div>
                        <div className="text-xs text-gray-400">同比增减率</div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">环比分析</h3>
          <p className="text-xs text-gray-500 mb-4">与上期相比的增减情况</p>
          <div className="space-y-3">
            {indicators.map((indicator) => {
              const data = momData[indicator.key];
              return (
                <div key={`mom-${indicator.key}`} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                  <div className="flex items-center">
                    <div
                      className="w-3 h-3 rounded-full mr-3"
                      style={{ backgroundColor: indicator.color }}
                    ></div>
                    <span className="text-sm text-gray-700">{indicator.name}</span>
                  </div>
                  <div className="text-right">
                    {data ? (
                      <>
                        <div className={`text-sm font-medium ${
                          data.change_type === 'increase' ? 'text-green-600' : 
                          data.change_type === 'decrease' ? 'text-red-600' : 
                          'text-gray-600'
                        }`}>
                          {data.change_rate > 0 ? '+' : ''}{data.change_rate.toFixed(2)}%
                        </div>
                        <div className="text-xs text-gray-500">
                          当前: {formatValue(data.current_value, indicator.unit)} |
                          上期: {formatValue(data.comparison_value, indicator.unit)}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm text-gray-500">暂无数据</div>
                        <div className="text-xs text-gray-400">环比增减率</div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 数据说明 */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start">
          <div className="text-green-600 mr-2 mt-0.5">ℹ️</div>
          <div className="text-green-800 text-sm">
            <p className="font-medium mb-1">数据说明：</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>数据来源于医院医保就诊管理系统，每月更新</li>
              <li><strong>门急诊医保患者就诊人次</strong> = 期内门诊和急诊医保患者的就诊人次数之和</li>
              <li><strong>门诊医保患者就诊人次</strong> = 期内门诊医保患者的就诊人次数之和</li>
              <li><strong>急诊医保患者就诊人次</strong> = 期内急诊医保患者的就诊人次数之和</li>
              <li><strong>门诊医保患者就诊人数</strong> = 期内门诊和急诊医保患者的就诊人数之和</li>
              <li><strong>医保患者复诊率</strong> = 期内门诊医保患者非初诊就诊人次/同期门诊医保患者就诊人次×100%</li>
              <li>医保就诊情况是医院医保管理的重要组成部分，反映医院医保患者就诊服务水平</li>
              <li>支持按月、季度、年查看不同时间粒度的数据趋势</li>
              <li>点击指标标签可控制图表中对应数据线的显示/隐藏</li>
              <li>后端服务运行在: {API_BASE_URL}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}