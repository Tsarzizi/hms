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

interface RevenueRatioData {
  basicInsuranceRatio: number; // 门诊基本医疗保险收入占医疗收入的比重(%)
  materialCostRatio: number; // 门急诊材料费用占门急诊收入的比重(%)
  medicalServiceRatio: number; // 门诊医疗服务收入占医疗收入比重(%)
  specialOutpatientRatio: number; // 特需门诊收入占比(%)
  medicalExpenditureRatio: number; // 百元门急诊收入的医疗支出(不含药品收入)
  materialExpenditureRatio: number; // 百元门急诊收入消耗卫生材料(不含药品收入)
}

interface ChartData {
  date: string;
  data: RevenueRatioData;
}

interface ComparisonData {
  current: number;
  previous: number;
  changeRate: number;
  changeType: 'increase' | 'decrease' | 'stable';
}

const indicators = [
  {
    key: 'basicInsuranceRatio',
    name: '门诊基本医疗保险收入占医疗收入的比重',
    color: '#3B82F6',
    description: '门诊基本医疗保险收入占医疗收入的比重',
    formula: '门诊基本医疗保险收入占医疗收入的比重(%) = 门诊基本医疗保险收入/门诊收入×100%',
    unit: '%'
  },
  {
    key: 'materialCostRatio',
    name: '门急诊材料费用占门急诊收入的比重',
    color: '#10B981',
    description: '门急诊材料费用占门急诊收入的比重',
    formula: '门诊材料费用占门诊收入的比重(%) = 门诊材料费用/门诊收入×100%；急诊材料费用占卫生总费用的比重(%) = 急诊材料费用/急诊收入×100%',
    unit: '%'
  },
  {
    key: 'medicalServiceRatio',
    name: '门诊医疗服务收入占医疗收入比重',
    color: '#EF4444',
    description: '门诊医疗服务收入(不含药品、耗材、检查、化验收入)占医疗收入比重',
    formula: '门诊医疗服务收入占门诊收入比重(%) = [(门诊收入-药品收入-卫生材料收入-检查收入-化验收入-其他收入)/门诊收入]×100%',
    unit: '%'
  },
  {
    key: 'specialOutpatientRatio',
    name: '特需门诊收入占比',
    color: '#F59E0B',
    description: '特需门诊收入占比',
    formula: '特需门诊收入占比 = (挂号类别为"特需门诊"的门诊费用汇总求和/门诊收入) *100%',
    unit: '%'
  },
  {
    key: 'medicalExpenditureRatio',
    name: '百元门急诊收入的医疗支出',
    color: '#8B5CF6',
    description: '百元门急诊收入的医疗支出(不含药品收入)',
    formula: '百元门急诊收入的医疗支出(不含药品收入) = [(门急诊业务成本+管理费用-药品费) ÷ (门急诊收入-药品收入)]×100',
    unit: '元'
  },
  {
    key: 'materialExpenditureRatio',
    name: '百元门急诊收入消耗卫生材料',
    color: '#EC4899',
    description: '百元门急诊收入消耗卫生材料(不含药品收入)',
    formula: '百元门急诊收入消耗卫生材料(不含药品收入) = [卫生材料费 ÷ (门急诊收入-药品收入)]×100',
    unit: '元'
  }
];

const timeRanges = [
  { key: 'day', label: '天' },
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

// 生成模拟数据
const generateMockData = (range: string): ChartData[] => {
  const data: ChartData[] = [];
  const now = new Date();

  switch (range) {
    case 'day':
      // 生成30天的数据
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        data.push({
          date: dateStr,
          data: {
            basicInsuranceRatio: parseFloat((65 + Math.sin(i * 0.3) * 8 + Math.random() * 4).toFixed(1)),
            materialCostRatio: parseFloat((18 + Math.cos(i * 0.2) * 5 + Math.random() * 3).toFixed(1)),
            medicalServiceRatio: parseFloat((45 + Math.sin(i * 0.4) * 6 + Math.random() * 3).toFixed(1)),
            specialOutpatientRatio: parseFloat((8 + Math.cos(i * 0.5) * 3 + Math.random() * 2).toFixed(1)),
            medicalExpenditureRatio: parseFloat((85 + Math.sin(i * 0.3) * 10 + Math.random() * 5).toFixed(1)),
            materialExpenditureRatio: parseFloat((22 + Math.cos(i * 0.4) * 6 + Math.random() * 3).toFixed(1))
          }
        });
      }
      break;

    case 'month':
      // 生成12个月的数据
      for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

        data.push({
          date: dateStr,
          data: {
            basicInsuranceRatio: parseFloat((67 + Math.sin(i * 0.5) * 6 + Math.random() * 3).toFixed(1)),
            materialCostRatio: parseFloat((19 + Math.cos(i * 0.3) * 4 + Math.random() * 2).toFixed(1)),
            medicalServiceRatio: parseFloat((47 + Math.sin(i * 0.6) * 5 + Math.random() * 2).toFixed(1)),
            specialOutpatientRatio: parseFloat((9 + Math.cos(i * 0.7) * 2 + Math.random() * 1).toFixed(1)),
            medicalExpenditureRatio: parseFloat((88 + Math.sin(i * 0.4) * 8 + Math.random() * 4).toFixed(1)),
            materialExpenditureRatio: parseFloat((24 + Math.cos(i * 0.5) * 5 + Math.random() * 2).toFixed(1))
          }
        });
      }
      break;

    case 'quarter':
      // 生成8个季度的数据
      for (let i = 7; i >= 0; i--) {
        const quarter = Math.floor((now.getMonth() / 3) - i % 4);
        const year = now.getFullYear() - Math.floor(i / 4);
        const dateStr = `${year}-Q${(quarter + 4) % 4 + 1}`;

        data.push({
          date: dateStr,
          data: {
            basicInsuranceRatio: parseFloat((69 + Math.sin(i * 0.7) * 4 + Math.random() * 2).toFixed(1)),
            materialCostRatio: parseFloat((20 + Math.cos(i * 0.4) * 3 + Math.random() * 1.5).toFixed(1)),
            medicalServiceRatio: parseFloat((49 + Math.sin(i * 0.8) * 4 + Math.random() * 1.5).toFixed(1)),
            specialOutpatientRatio: parseFloat((10 + Math.cos(i * 0.9) * 1.5 + Math.random() * 1).toFixed(1)),
            medicalExpenditureRatio: parseFloat((90 + Math.sin(i * 0.5) * 6 + Math.random() * 3).toFixed(1)),
            materialExpenditureRatio: parseFloat((26 + Math.cos(i * 0.6) * 4 + Math.random() * 2).toFixed(1))
          }
        });
      }
      break;

    case 'year':
      // 生成5年的数据
      for (let i = 4; i >= 0; i--) {
        const year = now.getFullYear() - i;
        const dateStr = year.toString();

        data.push({
          date: dateStr,
          data: {
            basicInsuranceRatio: parseFloat((70 + Math.sin(i * 0.6) * 3 + Math.random() * 1).toFixed(1)),
            materialCostRatio: parseFloat((21 + Math.cos(i * 0.5) * 2 + Math.random() * 1).toFixed(1)),
            medicalServiceRatio: parseFloat((50 + Math.sin(i * 1) * 3 + Math.random() * 1).toFixed(1)),
            specialOutpatientRatio: parseFloat((11 + Math.cos(i * 1.2) * 1 + Math.random() * 0.5).toFixed(1)),
            medicalExpenditureRatio: parseFloat((92 + Math.sin(i * 0.6) * 4 + Math.random() * 2).toFixed(1)),
            materialExpenditureRatio: parseFloat((28 + Math.cos(i * 0.7) * 3 + Math.random() * 1).toFixed(1))
          }
        });
      }
      break;

    default:
      break;
  }

  return data;
};

// 生成模拟同比环比数据
const generateMockComparisonData = (chartData: ChartData[]) => {
  if (chartData.length === 0) return { yearOverYear: {}, monthOverMonth: {} };

  const yearOverYear: Record<string, ComparisonData> = {};
  const monthOverMonth: Record<string, ComparisonData> = {};

  indicators.forEach(indicator => {
    const currentValue = chartData[chartData.length - 1].data[indicator.key as keyof RevenueRatioData];
    const previousYearValue = currentValue * (0.9 + Math.random() * 0.2); // 模拟去年数据
    const previousMonthValue = currentValue * (0.95 + Math.random() * 0.1); // 模拟上月数据

    const yoyChangeRate = ((currentValue - previousYearValue) / previousYearValue) * 100;
    const momChangeRate = ((currentValue - previousMonthValue) / previousMonthValue) * 100;

    yearOverYear[indicator.key] = {
      current: currentValue,
      previous: previousYearValue,
      changeRate: yoyChangeRate,
      changeType: yoyChangeRate > 0 ? 'increase' : yoyChangeRate < 0 ? 'decrease' : 'stable'
    };

    monthOverMonth[indicator.key] = {
      current: currentValue,
      previous: previousMonthValue,
      changeRate: momChangeRate,
      changeType: momChangeRate > 0 ? 'increase' : momChangeRate < 0 ? 'decrease' : 'stable'
    };
  });

  return { yearOverYear, monthOverMonth };
};

// 计算统计数据
const calculateStats = (data: ChartData[]) => {
  if (data.length === 0) return null;

  const lastData = data[data.length - 1].data;
  const prevData = data.length > 1 ? data[data.length - 2].data : null;

  return {
    basicInsuranceRatio: {
      value: lastData.basicInsuranceRatio,
      change: prevData ? (lastData.basicInsuranceRatio - prevData.basicInsuranceRatio) : 0
    },
    materialCostRatio: {
      value: lastData.materialCostRatio,
      change: prevData ? (lastData.materialCostRatio - prevData.materialCostRatio) : 0
    },
    medicalServiceRatio: {
      value: lastData.medicalServiceRatio,
      change: prevData ? (lastData.medicalServiceRatio - prevData.medicalServiceRatio) : 0
    },
    specialOutpatientRatio: {
      value: lastData.specialOutpatientRatio,
      change: prevData ? (lastData.specialOutpatientRatio - prevData.specialOutpatientRatio) : 0
    },
    medicalExpenditureRatio: {
      value: lastData.medicalExpenditureRatio,
      change: prevData ? (lastData.medicalExpenditureRatio - prevData.medicalExpenditureRatio) : 0
    },
    materialExpenditureRatio: {
      value: lastData.materialExpenditureRatio,
      change: prevData ? (lastData.materialExpenditureRatio - prevData.materialExpenditureRatio) : 0
    }
  };
};

export default function RevenueRatio() {
  const [timeRange, setTimeRange] = useState('month');
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>(
    indicators.map(ind => ind.key)
  );
  const [yearOverYear, setYearOverYear] = useState<Record<string, ComparisonData>>({});
  const [monthOverMonth, setMonthOverMonth] = useState<Record<string, ComparisonData>>({});

  // 筛选条件状态
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedDeps, setSelectedDeps] = useState<Set<string>>(new Set());
  const [selectedDoctors, setSelectedDoctors] = useState<Set<string>>(new Set());

  // 获取数据
  const fetchData = async (range: string) => {
    setLoading(true);
    try {
      // 模拟API延迟
      await new Promise(resolve => setTimeout(resolve, 800));

      // 使用模拟数据
      const mockData = generateMockData(range);
      const comparisonData = generateMockComparisonData(mockData);

      setChartData(mockData);
      setYearOverYear(comparisonData.yearOverYear);
      setMonthOverMonth(comparisonData.monthOverMonth);

    } catch (error) {
      console.error('获取数据失败:', error);
      setChartData([]);
      setYearOverYear({});
      setMonthOverMonth({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(timeRange);
  }, [timeRange]);

  const toggleIndicator = (key: string) => {
    setSelectedIndicators(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
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
        text: `门急诊收入占比指标趋势图 (${timeRanges.find(r => r.key === timeRange)?.label})`
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
          text: '比重(%)/支出(元)'
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
        data: chartData.map(item => item.data[indicator.key as keyof RevenueRatioData]),
        borderColor: indicator.color,
        backgroundColor: indicator.color + '20',
        tension: 0.1
      }));

    return { labels, datasets };
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
      await fetchData(timeRange);
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

  const stats = calculateStats(chartData);

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* 页面标题 */}
      <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <h1 className="text-2xl font-bold text-gray-900">门急诊收入占比分析</h1>
            <p className="text-gray-600 text-sm mt-2">
              监控和分析门急诊收入占比的各项指标，包括基本医疗保险收入占比、材料费用占比、医疗服务收入占比等关键数据，支持同比环比分析
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
        {indicators.map((indicator) => {
          const stat = stats ? stats[indicator.key as keyof typeof stats] : null;
          return (
            <div key={indicator.key} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 line-clamp-2">{indicator.name}</h3>
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: indicator.color }}
                ></div>
              </div>
              <div className="space-y-3">
                <div className="text-3xl font-bold text-gray-900">
                  {stat ? (
                    <>
                      {stat.value.toFixed(1)}
                      <span className="text-lg font-normal ml-1 text-gray-500">{indicator.unit}</span>
                    </>
                  ) : (
                    '暂无数据'
                  )}
                </div>
                <div className="text-sm">
                  {stat && stat.change !== 0 ? (
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      stat.change > 0 ? 'text-green-600 bg-green-100' : 'text-red-600 bg-red-100'
                    }`}>
                      {stat.change > 0 ? '↑' : '↓'} {Math.abs(stat.change).toFixed(1)}
                      <span className="text-gray-500 ml-1">环比</span>
                    </span>
                  ) : (
                    <span className="text-gray-400 text-sm">等待数据库连接</span>
                  )}
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 font-medium mb-2">计算公式：</p>
                  <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">
                    {indicator.formula}
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
              const comparison = yearOverYear[indicator.key];
              return (
                <div key={`yoy-${indicator.key}`} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
                  <div className="flex items-center">
                    <div
                      className="w-3 h-3 rounded-full mr-3"
                      style={{ backgroundColor: indicator.color }}
                    ></div>
                    <span className="text-sm font-medium text-gray-700 line-clamp-1">{indicator.name}</span>
                  </div>
                  <div className="text-right">
                    {comparison ? (
                      <>
                        <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getComparisonColor(comparison.changeType)}`}>
                          <span className="mr-1">{getComparisonIcon(comparison.changeType)}</span>
                          {Math.abs(comparison.changeRate).toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {comparison.current.toFixed(1)}{indicator.unit} vs {comparison.previous.toFixed(1)}{indicator.unit}
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
              const comparison = monthOverMonth[indicator.key];
              return (
                <div key={`mom-${indicator.key}`} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
                  <div className="flex items-center">
                    <div
                      className="w-3 h-3 rounded-full mr-3"
                      style={{ backgroundColor: indicator.color }}
                    ></div>
                    <span className="text-sm font-medium text-gray-700 line-clamp-1">{indicator.name}</span>
                  </div>
                  <div className="text-right">
                    {comparison ? (
                      <>
                        <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getComparisonColor(comparison.changeType)}`}>
                          <span className="mr-1">{getComparisonIcon(comparison.changeType)}</span>
                          {Math.abs(comparison.changeRate).toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {comparison.current.toFixed(1)}{indicator.unit} vs {comparison.previous.toFixed(1)}{indicator.unit}
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
                        {item.data[indicator.key as keyof RevenueRatioData].toFixed(1)}{indicator.unit}
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
              <li>数据来源于医院信息系统，每日更新</li>
              <li>门诊基本医疗保险收入占医疗收入的比重：门诊基本医疗保险收入/门诊收入×100%</li>
              <li>门急诊材料费用占门急诊收入的比重：门诊材料费用/门诊收入×100%；急诊材料费用/急诊收入×100%</li>
              <li>门诊医疗服务收入占医疗收入比重：[(门诊收入-药品收入-卫生材料收入-检查收入-化验收入-其他收入)/门诊收入]×100%</li>
              <li>特需门诊收入占比：(挂号类别为"特需门诊"的门诊费用汇总求和/门诊收入) *100%</li>
              <li>百元门急诊收入的医疗支出：[(门急诊业务成本+管理费用-药品费) ÷ (门急诊收入-药品收入)]×100</li>
              <li>百元门急诊收入消耗卫生材料：[卫生材料费 ÷ (门急诊收入-药品收入)]×100</li>
              <li>支持按天、月、季度、年查看不同时间粒度的数据趋势</li>
              <li>同比环比分析帮助了解收入占比的发展趋势和季节性变化</li>
              <li>点击指标标签可控制图表中对应数据线的显示/隐藏</li>
              <li>收入占比分析有助于了解医院收入结构和成本控制情况</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}