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

interface InsuranceCostData {
  outpatientEmergencyCost: number;    // 门急诊医保患者总费用
  outpatientCost: number;             // 门诊医保患者总费用
  emergencyCost: number;              // 急诊医保患者总费用
}

interface ChartData {
  date: string;
  data: InsuranceCostData;
}

interface SummaryData {
  outpatientEmergencyCost: number;
  outpatientCost: number;
  emergencyCost: number;
}

interface ComparisonData {
  current_value: number;
  comparison_value: number;
  change_rate: number;
  change_type: string;
}

const indicators = [
  {
    key: 'outpatientEmergencyCost',
    name: '门急诊医保患者总费用',
    color: '#3B82F6',
    description: '门急诊医保患者总费用（万元）=期内门急诊患者医保范围内总额之和',
    unit: '万元'
  },
  {
    key: 'outpatientCost',
    name: '门诊医保患者总费用',
    color: '#10B981',
    description: '门诊医保患者总费用（万元）=期内门诊患者医保范围内总额之和',
    unit: '万元'
  },
  {
    key: 'emergencyCost',
    name: '急诊医保患者总费用',
    color: '#F59E0B',
    description: '急诊医保患者总费用（万元）=期内急诊患者医保范围内总额之和',
    unit: '万元'
  }
];

// 时间范围选项
const timeRanges = [
  { key: 'month', label: '月' },
  { key: 'quarter', label: '季度' },
  { key: 'year', label: '年' }
];

// API基础URL
const API_BASE_URL = 'http://localhost:5056';

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

// 多选下拉组件（从第一个代码复制）
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

// 独立的年份选择器组件（样式调整）
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
      const response = await fetch(`${API_BASE_URL}/api/insurance-cost/years`);

      if (!response.ok) {
        throw new Error(`HTTP错误! 状态码: ${response.status}`);
      }

      const result = await response.json();

      if (result.success && result.data) {
        setAvailableYears(result.data);
        if (result.data.length > 0 && !selectedYear) {
          onYearChange(result.data[0]);
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

// 期间选择器组件（样式调整）
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
      const response = await fetch(`${API_BASE_URL}/api/insurance-cost/comparison-periods`);

      if (!response.ok) {
        throw new Error(`HTTP错误! 状态码: ${response.status}`);
      }

      const result = await response.json();

      if (result.success && result.data) {
        setAvailablePeriods(result.data);
        if (result.data.length > 0 && !selectedPeriod) {
          onPeriodChange(result.data[0]);
        }
      } else {
        console.error('获取期间列表失败:', result.error);
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
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 block">分析期间</label>
        <div className="text-sm text-gray-500">加载中...</div>
      </div>
    );
  }

  if (availablePeriods.length === 0) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 block">分析期间</label>
        <div className="text-sm text-red-500">无可用数据</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700 block">分析期间</label>
      <select
        value={selectedPeriod}
        onChange={(e) => onPeriodChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
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

export default function InsurancePatientTotalCost() {
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

  // 筛选条件状态
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedDeps, setSelectedDeps] = useState<Set<string>>(new Set());
  const [selectedDoctors, setSelectedDoctors] = useState<Set<string>>(new Set());

  // 从后端获取图表数据
  const fetchData = async (range: string, year?: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        range: range
      });

      if (year) {
        params.append('year', year.toString());
      }

      const url = `${API_BASE_URL}/api/insurance-cost?${params}`;
      console.log('请求医保患者总费用URL:', url);

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('医保患者总费用API响应错误:', {
          status: response.status,
          statusText: response.statusText,
          url: url,
          responseText: errorText
        });
        throw new Error(`HTTP错误! 状态码: ${response.status}, 响应: ${errorText.substring(0, 100)}`);
      }

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
      console.log('医保患者总费用API响应:', result);

      if (result.success) {
        console.log('获取到医保患者总费用数据条数:', result.data.length);
        setChartData(result.data);
      } else {
        throw new Error(result.error || 'API返回错误');
      }
    } catch (error) {
      console.error('获取医保患者总费用数据失败:', error);
      setChartData(getMockData());
    } finally {
      setLoading(false);
    }
  };

  // 获取摘要数据
  const fetchSummaryData = async (range: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/insurance-cost/summary?range=${range}`);

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
      let periodDate = selectedPeriod;
      if (!periodDate) {
        const currentDate = new Date();
        periodDate = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-01`;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/insurance-cost/comparison?type=${type}&period_date=${periodDate}`
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
      const outpatientEmergencyCost = Math.floor(Math.random() * 200) + 300;
      const outpatientCost = Math.floor(Math.random() * 150) + 200;
      const emergencyCost = Math.floor(Math.random() * 100) + 50;

      mockData.push({
        date: month,
        data: {
          outpatientEmergencyCost,
          outpatientCost,
          emergencyCost
        }
      });
    });

    return mockData;
  };

  useEffect(() => {
    const initializeData = async () => {
      const isBackendConnected = await testBackendConnection();

      if (!isBackendConnected) {
        console.log('后端服务不可用，使用模拟数据');
        const mockData = getMockData();
        setChartData(mockData);

        const totalOutpatientEmergencyCost = mockData.reduce((sum, item) => sum + item.data.outpatientEmergencyCost, 0) / mockData.length;
        const totalOutpatientCost = mockData.reduce((sum, item) => sum + item.data.outpatientCost, 0) / mockData.length;
        const totalEmergencyCost = mockData.reduce((sum, item) => sum + item.data.emergencyCost, 0) / mockData.length;

        setSummaryData({
          outpatientEmergencyCost: totalOutpatientEmergencyCost,
          outpatientCost: totalOutpatientCost,
          emergencyCost: totalEmergencyCost
        });
        return;
      }

      await fetchData(timeRange, selectedYear);
      await fetchSummaryData(timeRange);
      await fetchComparisonData('yoy', setYoyData);
      await fetchComparisonData('mom', setMomData);
    };

    initializeData();
  }, [timeRange, selectedYear]);

  useEffect(() => {
    if (selectedYear) {
      fetchComparisonData('yoy', setYoyData);
      fetchComparisonData('mom', setMomData);
    }
  }, [selectedYear]);

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

  const getSummaryValue = (key: keyof InsuranceCostData) => {
    if (!summaryData) return '暂无数据';
    const value = summaryData[key];
    const indicator = indicators.find(ind => ind.key === key);

    return value !== null && value !== undefined
      ? `${value.toFixed(2)}${indicator?.unit || ''}`
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
        text: `医保患者总费用指标趋势图 (${timeRanges.find(r => r.key === timeRange)?.label})`
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
          text: '费用 (万元)'
        },
        beginAtZero: true,
        ticks: {
          callback: function(value: any) {
            return value + '万元';
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
          const value = item.data[indicator.key as keyof InsuranceCostData];
          return typeof value === 'number' ? value : 0;
        }),
        borderColor: indicator.color,
        backgroundColor: indicator.color + '80',
        tension: 0.1,
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: false,
        showLine: true
      }));

    return {
      labels,
      datasets
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
    setSelectedPeriod('');

    fetchData('month', new Date().getFullYear());
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* 页面标题 */}
      <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <h1 className="text-2xl font-bold text-gray-900">医保患者总费用分析</h1>
            <p className="text-gray-600 text-sm mt-2">
              监控和分析医院医保患者费用情况，包括门急诊医保患者总费用、门诊医保患者总费用、急诊医保患者总费用等关键指标，支持同比环比分析
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium text-gray-900">{selectedDate} 数据</div>
              <div className="text-xs text-gray-500">最后更新：今天 14:30</div>
            </div>
            <button className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors duration-200">
              <span className="text-lg">💰</span>
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
              {timeRanges.map((range) => (
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

          <div className="space-y-2">
            <PeriodSelector
              selectedPeriod={selectedPeriod}
              onPeriodChange={setSelectedPeriod}
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
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                {getSummaryValue(indicator.key as keyof InsuranceCostData)}
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
            {indicators.map((indicator) => {
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
                          {formatValue(comparison.current_value, indicator.unit)} vs {formatValue(comparison.comparison_value, indicator.unit)}
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
            {indicators.map((indicator) => {
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
                          {formatValue(comparison.current_value, indicator.unit)} vs {formatValue(comparison.comparison_value, indicator.unit)}
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
                        {formatValue(item.data[indicator.key as keyof InsuranceCostData], indicator.unit)}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={indicators.length + 1} className="px-6 py-12 text-center text-gray-500">
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
              <li>数据来源于医院医保费用管理系统，每月更新</li>
              <li><strong>门急诊医保患者总费用</strong> = 期内门急诊患者医保范围内总额之和</li>
              <li><strong>门诊医保患者总费用</strong> = 期内门诊患者医保范围内总额之和</li>
              <li><strong>急诊医保患者总费用</strong> = 期内急诊患者医保范围内总额之和</li>
              <li>医保费用管理是医院医保管理的重要组成部分，反映医院医保费用控制水平</li>
              <li>支持按月、季度、年查看不同时间粒度的数据趋势</li>
              <li>点击指标标签可控制图表中对应数据线的显示/隐藏</li>
              <li>医保费用分析有助于了解医院医保费用结构和变化趋势</li>
              <li>后端服务运行在: {API_BASE_URL}</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}