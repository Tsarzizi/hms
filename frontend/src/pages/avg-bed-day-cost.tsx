// 文件路径: src\yiliaofudan\pingjunchuangrifeiyong\frontend\AverageBedDayCost.tsx

import { useState, useEffect, useMemo } from 'react';
import { Bar, Line } from 'react-chartjs-2';
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

interface DiseaseBedDayCost {
  diseaseName: string;           // 病种名称
  totalCost: number;             // 医药总费用（元）
  totalBedDays: number;          // 总床日数
  avgBedDayCost: number;         // 平均床日费用（元）
  patientCount: number;          // 出院患者数
}

interface ChartData {
  date: string;
  data: {
    avgBedDayCost: number;       // 总体平均床日费用
    diseases: DiseaseBedDayCost[]; // 各病种数据
  };
}

interface SummaryData {
  overallAvgBedDayCost: number;  // 总体平均床日费用
  topDiseases: DiseaseBedDayCost[]; // 重点病种数据
  totalPatients: number;         // 总出院患者数
  totalBedDays: number;          // 总床日数
}

interface ComparisonData {
  current_value: number;
  comparison_value: number;
  change_rate: number;
  change_type: string;
}

// 指标定义
const indicators = [
  {
    key: 'overallAvgBedDayCost',
    name: '总体平均床日费用',
    color: '#3B82F6',
    description: '总体平均床日费用(元) = 所有病种医药总费用之和 / 所有病种总床日数',
    unit: '元'
  },
  {
    key: 'totalPatients',
    name: '总出院患者数',
    color: '#10B981',
    description: '报告期内所有病种出院患者总数',
    unit: '人'
  },
  {
    key: 'totalBedDays',
    name: '总占用床日数',
    color: '#8B5CF6',
    description: '报告期内所有病种患者占用总床日数',
    unit: '床日'
  }
];

const diseaseTypes = [
  { id: 'all', name: '全部病种', color: '#3B82F6' },
  { id: 'hypertension', name: '高血压', color: '#EF4444' },
  { id: 'diabetes', name: '糖尿病', color: '#10B981' },
  { id: 'coronary', name: '冠心病', color: '#F59E0B' },
  { id: 'stroke', name: '脑卒中', color: '#8B5CF6' },
  { id: 'copd', name: 'COPD', color: '#06B6D4' },
  { id: 'pneumonia', name: '肺炎', color: '#F97316' }
];

// 时间范围选项
const timeRanges = [
  { key: 'month', label: '月' },
  { key: 'quarter', label: '季度' },
  { key: 'year', label: '年' }
];

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

// API基础URL - 使用端口5054
const API_BASE_URL = 'http://localhost:5054';

// 多选下拉组件（从模板复制）
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

export default function AverageBedDayCost() {
  const [timeRange, setTimeRange] = useState('month');
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [yoyData, setYoyData] = useState<{ [key: string]: ComparisonData }>({});
  const [momData, setMomData] = useState<{ [key: string]: ComparisonData }>({});
  const [loading, setLoading] = useState(false);
  const [selectedDiseases, setSelectedDiseases] = useState<string[]>(['all']);
  const [chartType, setChartType] = useState<'trend' | 'comparison'>('trend');

  // 筛选条件状态
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedDeps, setSelectedDeps] = useState<Set<string>>(new Set());
  const [selectedDoctors, setSelectedDoctors] = useState<Set<string>>(new Set());

  // 从后端获取图表数据
  const fetchData = async (range: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        range: range
      });

      const url = `${API_BASE_URL}/api/bed-day-cost?${params}`;
      console.log('请求平均床日费用URL:', url);

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP错误! 状态码: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        setChartData(result.data);
      } else {
        throw new Error(result.error || 'API返回错误');
      }
    } catch (error) {
      console.error('获取平均床日费用数据失败:', error);
      setChartData(getMockData());
    } finally {
      setLoading(false);
    }
  };

  // 获取摘要数据
  const fetchSummaryData = async (range: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/bed-day-cost/summary?range=${range}`);

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
      const currentDate = new Date();
      const periodDate = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-01`;

      const response = await fetch(
        `${API_BASE_URL}/api/bed-day-cost/comparison?type=${type}&period_date=${periodDate}`
      );

      if (!response.ok) {
        throw new Error(`HTTP错误! 状态码: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        setData(result.data);
      } else {
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
        return true;
      }
    } catch (error) {
      console.error('后端连接测试失败:', error);
    }
    return false;
  };

  // 模拟数据函数
  const getMockData = (): ChartData[] => {
    const mockData: ChartData[] = [];
    const months = ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06'];

    months.forEach(month => {
      const diseases: DiseaseBedDayCost[] = diseaseTypes
        .filter(d => d.id !== 'all')
        .map(disease => {
          const totalCost = Math.floor(Math.random() * 500000) + 500000; // 50-100万元
          const totalBedDays = Math.floor(Math.random() * 2000) + 1000; // 1000-3000床日
          const avgBedDayCost = totalCost / totalBedDays;
          const patientCount = Math.floor(Math.random() * 200) + 100; // 100-300患者

          return {
            diseaseName: disease.name,
            totalCost,
            totalBedDays,
            avgBedDayCost,
            patientCount
          };
        });

      const overallAvgBedDayCost = diseases.reduce((sum, disease) => sum + disease.avgBedDayCost, 0) / diseases.length;

      mockData.push({
        date: month,
        data: {
          avgBedDayCost: overallAvgBedDayCost,
          diseases
        }
      });
    });

    return mockData;
  };

  // 生成模拟同比环比数据
  const generateMockComparisonData = () => {
    if (!summaryData) return { yearOverYear: {}, monthOverMonth: {} };

    const yearOverYear: Record<string, ComparisonData> = {};
    const monthOverMonth: Record<string, ComparisonData> = {};

    indicators.forEach(indicator => {
      const currentValue = summaryData[indicator.key as keyof SummaryData] as number;
      const previousYearValue = currentValue * (0.9 + Math.random() * 0.2); // 模拟去年数据
      const previousMonthValue = currentValue * (0.95 + Math.random() * 0.1); // 模拟上月数据

      const yoyChangeRate = ((currentValue - previousYearValue) / previousYearValue) * 100;
      const momChangeRate = ((currentValue - previousMonthValue) / previousMonthValue) * 100;

      yearOverYear[indicator.key] = {
        current_value: currentValue,
        comparison_value: previousYearValue,
        change_rate: yoyChangeRate,
        change_type: yoyChangeRate > 0 ? 'increase' : yoyChangeRate < 0 ? 'decrease' : 'stable'
      };

      monthOverMonth[indicator.key] = {
        current_value: currentValue,
        comparison_value: previousMonthValue,
        change_rate: momChangeRate,
        change_type: momChangeRate > 0 ? 'increase' : momChangeRate < 0 ? 'decrease' : 'stable'
      };
    });

    return { yearOverYear, monthOverMonth };
  };

  useEffect(() => {
    const initializeData = async () => {
      const isBackendConnected = await testBackendConnection();

      if (!isBackendConnected) {
        console.log('后端服务不可用，使用模拟数据');
        const mockData = getMockData();
        setChartData(mockData);

        // 计算摘要数据
        const overallAvg = mockData.reduce((sum, item) => sum + item.data.avgBedDayCost, 0) / mockData.length;
        const totalPatients = mockData.reduce((sum, item) =>
          sum + item.data.diseases.reduce((dSum, disease) => dSum + disease.patientCount, 0), 0
        );
        const totalBedDays = mockData.reduce((sum, item) =>
          sum + item.data.diseases.reduce((dSum, disease) => dSum + disease.totalBedDays, 0), 0
        );

        const summary = {
          overallAvgBedDayCost: overallAvg,
          topDiseases: mockData[0].data.diseases.slice(0, 5), // 取前5个病种
          totalPatients,
          totalBedDays
        };

        setSummaryData(summary);

        // 生成模拟同比环比数据
        const comparisonData = generateMockComparisonData();
        setYoyData(comparisonData.yearOverYear);
        setMomData(comparisonData.monthOverMonth);
        return;
      }

      await fetchData(timeRange);
      await fetchSummaryData(timeRange);
      await fetchComparisonData('yoy', setYoyData);
      await fetchComparisonData('mom', setMomData);
    };

    initializeData();
  }, [timeRange]);

  const handleQuery = async () => {
    setLoading(true);
    try {
      await fetchData(timeRange);
      await fetchSummaryData(timeRange);
    } catch (error) {
      console.error('查询数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    // 重置筛选条件
    setSelectedDate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    setSelectedDeps(new Set());
    setSelectedDoctors(new Set());
    setTimeRange('month');

    // 重新查询数据
    fetchData('month');
  };

  const getTrendChartData = () => {
    if (!chartData || chartData.length === 0) {
      return {
        labels: [],
        datasets: []
      };
    }

    const labels = chartData.map(item => item.date);

    if (selectedDiseases.includes('all')) {
      // 显示总体趋势
      return {
        labels,
        datasets: [
          {
            label: '总体平均床日费用',
            data: chartData.map(item => item.data.avgBedDayCost),
            borderColor: '#3B82F6',
            backgroundColor: '#3B82F680',
            tension: 0.1,
            borderWidth: 2,
            fill: false,
          }
        ]
      };
    } else {
      // 显示选中病种的趋势
      const datasets = selectedDiseases.map(diseaseId => {
        const disease = diseaseTypes.find(d => d.id === diseaseId);
        return {
          label: disease?.name || '',
          data: chartData.map(item => {
            const diseaseData = item.data.diseases.find(d =>
              d.diseaseName === disease?.name
            );
            return diseaseData ? diseaseData.avgBedDayCost : 0;
          }),
          borderColor: disease?.color || '#666',
          backgroundColor: disease?.color + '80' || '#6666',
          tension: 0.1,
          borderWidth: 2,
          fill: false,
        };
      });

      return { labels, datasets };
    }
  };

  const getComparisonChartData = () => {
    if (!summaryData || !summaryData.topDiseases) {
      return {
        labels: [],
        datasets: []
      };
    }

    const labels = summaryData.topDiseases.map(disease => disease.diseaseName);

    return {
      labels,
      datasets: [
        {
          label: '平均床日费用（元）',
          data: summaryData.topDiseases.map(disease => disease.avgBedDayCost),
          backgroundColor: summaryData.topDiseases.map((_, index) =>
            diseaseTypes[index + 1]?.color || '#3B82F6'
          ),
          borderColor: summaryData.topDiseases.map((_, index) =>
            diseaseTypes[index + 1]?.color || '#3B82F6'
          ),
          borderWidth: 1,
        }
      ]
    };
  };

  const getChartOptions = (type: 'trend' | 'comparison') => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: type === 'trend'
          ? `平均床日费用趋势图 (${timeRanges.find(r => r.key === timeRange)?.label})`
          : '各病种平均床日费用对比'
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: type === 'trend' ? '时间' : '病种'
        }
      },
      y: {
        title: {
          display: true,
          text: '平均床日费用（元）'
        },
        beginAtZero: true,
      }
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('zh-CN').format(num);
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

  const toggleDisease = (diseaseId: string) => {
    if (diseaseId === 'all') {
      setSelectedDiseases(['all']);
    } else {
      const newSelection = selectedDiseases.includes(diseaseId)
        ? selectedDiseases.filter(id => id !== diseaseId)
        : [...selectedDiseases.filter(id => id !== 'all'), diseaseId];

      if (newSelection.length === 0) {
        setSelectedDiseases(['all']);
      } else {
        setSelectedDiseases(newSelection);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* 页面标题 */}
      <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <h1 className="text-2xl font-bold text-gray-900">平均床日费用分析</h1>
            <p className="text-gray-600 text-sm mt-2">
              监控和分析各病种出院患者平均床日费用情况，支持按病种和时间维度进行深入分析
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium text-gray-900">{selectedDate} 数据</div>
              <div className="text-xs text-gray-500">最后更新：今天 14:30</div>
            </div>
            <button className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors duration-200">
              <span className="text-lg">🏥</span>
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
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {indicators.map((indicator) => {
          const value = summaryData ? summaryData[indicator.key as keyof SummaryData] as number : 0;
          return (
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
                  {summaryData ? (
                    <>
                      {indicator.key === 'overallAvgBedDayCost' ? formatCurrency(value) : formatNumber(value)}
                      <span className="text-lg font-normal ml-1 text-gray-500">{indicator.unit}</span>
                    </>
                  ) : (
                    '暂无数据'
                  )}
                </div>
                <div className="text-sm">
                  {summaryData ? (
                    <span className="text-gray-400 text-sm">当前统计周期</span>
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
          );
        })}
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
                          {indicator.key === 'overallAvgBedDayCost' ? formatCurrency(comparison.current_value) : formatNumber(comparison.current_value)}
                          vs
                          {indicator.key === 'overallAvgBedDayCost' ? formatCurrency(comparison.comparison_value) : formatNumber(comparison.comparison_value)}
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
                          {indicator.key === 'overallAvgBedDayCost' ? formatCurrency(comparison.current_value) : formatNumber(comparison.current_value)}
                          vs
                          {indicator.key === 'overallAvgBedDayCost' ? formatCurrency(comparison.comparison_value) : formatNumber(comparison.comparison_value)}
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
          <h2 className="text-lg font-semibold text-gray-900 mb-4 lg:mb-0">费用分析图表</h2>

          <div className="flex flex-col lg:flex-row lg:items-center space-y-4 lg:space-y-0 lg:space-x-4">
            {/* 图表类型选择 */}
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-700">图表类型：</span>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setChartType('trend')}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    chartType === 'trend'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  趋势分析
                </button>
                <button
                  onClick={() => setChartType('comparison')}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    chartType === 'comparison'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  病种对比
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 病种选择器 - 仅趋势分析时显示 */}
        {chartType === 'trend' && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-700">病种选择：</h3>
              <button
                onClick={() => setSelectedDiseases(
                  selectedDiseases.length === diseaseTypes.length ? [] : diseaseTypes.map(d => d.id)
                )}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                {selectedDiseases.length === diseaseTypes.length ? '取消全选' : '全选'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {diseaseTypes.map((disease) => (
                <button
                  key={disease.id}
                  onClick={() => toggleDisease(disease.id)}
                  className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedDiseases.includes(disease.id)
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  style={{
                    backgroundColor: selectedDiseases.includes(disease.id) ? disease.color : undefined
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full mr-2"
                    style={{ backgroundColor: selectedDiseases.includes(disease.id) ? 'white' : disease.color }}
                  ></div>
                  {disease.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 图表区域 */}
        <div className="h-[500px] flex items-center justify-center">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-500">加载数据中...</p>
              </div>
            </div>
          ) : chartData && chartData.length > 0 ? (
            chartType === 'trend' ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-full max-w-4xl h-full">
                  <Line data={getTrendChartData()} options={getChartOptions('trend')} />
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-full max-w-4xl h-full">
                  <Bar data={getComparisonChartData()} options={getChartOptions('comparison')} />
                </div>
              </div>
            )
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  总体平均床日费用
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  出院患者总数
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  总占用床日数
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {chartData.length > 0 ? (
                chartData.map((item, index) => {
                  const totalPatients = item.data.diseases.reduce((sum, disease) => sum + disease.patientCount, 0);
                  const totalBedDays = item.data.diseases.reduce((sum, disease) => sum + disease.totalBedDays, 0);

                  return (
                    <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {item.date}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatCurrency(item.data.avgBedDayCost)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatNumber(totalPatients)}人
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatNumber(totalBedDays)}床日
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
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
              <li>数据来源于医院住院结算系统和病案首页，每月更新</li>
              <li><strong>平均床日费用计算公式</strong>：报告期内某病种出院患者平均床日费用 = 报告期内某病种出院患者医药总费用 / 报告期内该病种出院患者占用总床日数</li>
              <li>平均床日费用反映住院患者的每日医疗费用水平，是医疗费用控制的重要指标</li>
              <li>支持按不同病种、不同时间维度进行分析比较</li>
              <li>可通过趋势分析查看费用变化趋势，通过病种对比了解各病种费用差异</li>
              <li>后端服务运行在: {API_BASE_URL}</li>
              <li>点击病种标签可控制图表中对应数据线的显示/隐藏</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}