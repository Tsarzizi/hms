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

interface RevenueClassificationData {
  basicMedicalInsuranceRatio: number; // 住院收入基本医疗保险占比(%)
  serviceRevenueRatio: number; // 住院服务收入占比(%)
  medicalPaymentMethodRatio: number; // 住院收入医疗费用支付方式占比分析
  patientMedicationStructure: number; // 住院收入患者医药费用构成
  chargeItemAnalysis: number; // 住院收入按费用项目类别分析
}

interface ChartData {
  date: string;
  data: RevenueClassificationData;
}

interface ComparisonData {
  current: number;
  previous: number;
  changeRate: number;
  changeType: 'increase' | 'decrease' | 'stable';
}

const indicators = [
  { 
    key: 'basicMedicalInsuranceRatio', 
    name: '住院收入基本医疗保险占比', 
    color: '#3B82F6', 
    description: '基本医疗保险收入/同期住院收入',
    fullDescription: '住院收入基本医疗保险占比=基本医疗保险收入/同期住院收入',
    unit: '%'
  },
  { 
    key: 'serviceRevenueRatio', 
    name: '住院服务收入占比', 
    color: '#EF4444', 
    description: '(住院收入-各项费用)/住院收入×100%',
    fullDescription: '住院服务收入占比(%)=(住院收入-病理诊断费-实验室诊断费-影像学诊断费-临床诊断项目费-西药费-抗菌药物费用-中成药费-中草药费-检查费-一次性材料费-治疗费-一次性材料费-手术费-一次性材料费)/住院收入×100%',
    unit: '%'
  },
  { 
    key: 'medicalPaymentMethodRatio', 
    name: '住院收入医疗费用支付方式占比分析', 
    color: '#10B981', 
    description: '各种支付方式占比之和',
    fullDescription: '住院收入医疗费用支付方式构成=城镇居民基本医疗保险占比+城乡居民医疗保险占比+新型农村合作医疗占比+商业医疗保险占比+全公费占比+全自费占比+贫困救助占比+其他占比',
    unit: '%'
  },
  { 
    key: 'patientMedicationStructure', 
    name: '住院收入患者医药费用构成', 
    color: '#F59E0B', 
    description: '各项医疗费用构成占比之和',
    fullDescription: '住院收入患者医药费用构成=床位收入占比+诊察收入占比+检查收入占比+化验收入占比+手术收入占比+护理收入占比+卫生材料收入占比+药品收入占比+药事服务费收入占比+其他住院收入占比',
    unit: '%'
  },
  { 
    key: 'chargeItemAnalysis', 
    name: '住院收入按费用项目类别分析', 
    color: '#8B5CF6', 
    description: '药品+诊疗项目+卫生材料收入占比',
    fullDescription: '住院收入按费用项目类别构成=药品收入占比+诊疗项目收入占比+卫生材料收入占比',
    unit: '%'
  }
];

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
    case 'month':
      // 生成12个月的数据
      for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

        data.push({
          date: dateStr,
          data: {
            basicMedicalInsuranceRatio: parseFloat((65 + Math.sin(i * 0.3) * 5 + Math.random() * 3).toFixed(1)),
            serviceRevenueRatio: parseFloat((45 + Math.sin(i * 0.4) * 8 + Math.random() * 4).toFixed(1)),
            medicalPaymentMethodRatio: parseFloat((85 + Math.sin(i * 0.2) * 3 + Math.random() * 2).toFixed(1)),
            patientMedicationStructure: parseFloat((75 + Math.sin(i * 0.5) * 6 + Math.random() * 3).toFixed(1)),
            chargeItemAnalysis: parseFloat((80 + Math.sin(i * 0.3) * 4 + Math.random() * 2).toFixed(1))
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
            basicMedicalInsuranceRatio: parseFloat((67 + Math.sin(i * 0.5) * 4 + Math.random() * 2).toFixed(1)),
            serviceRevenueRatio: parseFloat((47 + Math.sin(i * 0.6) * 6 + Math.random() * 3).toFixed(1)),
            medicalPaymentMethodRatio: parseFloat((86 + Math.sin(i * 0.3) * 2 + Math.random() * 1).toFixed(1)),
            patientMedicationStructure: parseFloat((77 + Math.sin(i * 0.7) * 4 + Math.random() * 2).toFixed(1)),
            chargeItemAnalysis: parseFloat((82 + Math.sin(i * 0.4) * 3 + Math.random() * 1).toFixed(1))
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
            basicMedicalInsuranceRatio: parseFloat((70 + Math.sin(i * 0.6) * 3 + Math.random() * 1).toFixed(1)),
            serviceRevenueRatio: parseFloat((50 + Math.sin(i * 0.8) * 4 + Math.random() * 2).toFixed(1)),
            medicalPaymentMethodRatio: parseFloat((88 + Math.sin(i * 0.4) * 1 + Math.random() * 0.5).toFixed(1)),
            patientMedicationStructure: parseFloat((80 + Math.sin(i * 0.9) * 2 + Math.random() * 1).toFixed(1)),
            chargeItemAnalysis: parseFloat((85 + Math.sin(i * 0.5) * 2 + Math.random() * 0.5).toFixed(1))
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
    const currentValue = chartData[chartData.length - 1].data[indicator.key as keyof RevenueClassificationData];
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
    basicMedicalInsuranceRatio: {
      value: lastData.basicMedicalInsuranceRatio,
      change: prevData ? (lastData.basicMedicalInsuranceRatio - prevData.basicMedicalInsuranceRatio) : 0
    },
    serviceRevenueRatio: {
      value: lastData.serviceRevenueRatio,
      change: prevData ? (lastData.serviceRevenueRatio - prevData.serviceRevenueRatio) : 0
    },
    medicalPaymentMethodRatio: {
      value: lastData.medicalPaymentMethodRatio,
      change: prevData ? (lastData.medicalPaymentMethodRatio - prevData.medicalPaymentMethodRatio) : 0
    },
    patientMedicationStructure: {
      value: lastData.patientMedicationStructure,
      change: prevData ? (lastData.patientMedicationStructure - prevData.patientMedicationStructure) : 0
    },
    chargeItemAnalysis: {
      value: lastData.chargeItemAnalysis,
      change: prevData ? (lastData.chargeItemAnalysis - prevData.chargeItemAnalysis) : 0
    }
  };
};

export default function InpatientRevenueClassification() {
  const [timeRange, setTimeRange] = useState('month');
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>(
    indicators.map(ind => ind.key)
  );
  const [yearOverYear, setYearOverYear] = useState<Record<string, ComparisonData>>({});
  const [monthOverMonth, setMonthOverMonth] = useState<Record<string, ComparisonData>>({});
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  // 筛选条件状态
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedDeps, setSelectedDeps] = useState<Set<string>>(new Set());
  const [selectedDoctors, setSelectedDoctors] = useState<Set<string>>(new Set());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

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

  const toggleCardExpansion = (key: string) => {
    setExpandedCard(expandedCard === key ? null : key);
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
        text: `住院收入分类指标趋势图 (${timeRanges.find(r => r.key === timeRange)?.label})`
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
          text: '百分比(%)'
        },
        min: 0,
        max: 100
      }
    }
  });

  const getChartData = () => {
    const labels = chartData.map(item => item.date);
    const datasets = indicators
      .filter(indicator => selectedIndicators.includes(indicator.key))
      .map(indicator => ({
        label: indicator.name,
        data: chartData.map(item => item.data[indicator.key as keyof RevenueClassificationData]),
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
    setSelectedYear(new Date().getFullYear());

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
            <h1 className="text-2xl font-bold text-gray-900">住院收入分类指标分析</h1>
            <p className="text-gray-600 text-sm mt-2">
              监控和分析住院收入的分类构成情况，包括基本医疗保险占比、服务收入占比等关键指标，支持同比环比分析
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
            <label className="text-sm font-medium text-gray-700 block">分析年份</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
            >
              {[2022, 2023, 2024].map(year => (
                <option key={year} value={year}>{year}年</option>
              ))}
            </select>
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

      {/* 指标卡片 */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {indicators.map((indicator) => {
          const stat = stats ? stats[indicator.key as keyof typeof stats] : null;
          return (
            <div key={indicator.key} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900 leading-tight">{indicator.name}</h3>
                <div 
                  className="w-3 h-3 rounded-full flex-shrink-0" 
                  style={{ backgroundColor: indicator.color }}
                ></div>
              </div>
              <div className="space-y-3">
                <div className="text-2xl font-bold text-gray-900">
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
                      {stat.change > 0 ? '↑' : '↓'} {Math.abs(stat.change).toFixed(1)}%
                      <span className="text-gray-500 ml-1">环比</span>
                    </span>
                  ) : (
                    <span className="text-gray-400 text-sm">等待数据库连接</span>
                  )}
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-gray-600 font-medium">计算公式：</p>
                    <button
                      onClick={() => toggleCardExpansion(indicator.key)}
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                    >
                      {expandedCard === indicator.key ? (
                        <>
                          <span>收起</span>
                          <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </>
                      ) : (
                        <>
                          <span>详情</span>
                          <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {expandedCard === indicator.key ? indicator.fullDescription : indicator.description}
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
                  <div className="flex items-center min-w-0 flex-1">
                    <div 
                      className="w-3 h-3 rounded-full mr-3 flex-shrink-0" 
                      style={{ backgroundColor: indicator.color }}
                    ></div>
                    <span className="text-sm font-medium text-gray-700 truncate" title={indicator.name}>
                      {indicator.name}
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    {comparison ? (
                      <>
                        <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getComparisonColor(comparison.changeType)}`}>
                          <span className="mr-1">{getComparisonIcon(comparison.changeType)}</span>
                          {Math.abs(comparison.changeRate).toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {comparison.current.toFixed(1)}% vs {comparison.previous.toFixed(1)}%
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
                  <div className="flex items-center min-w-0 flex-1">
                    <div 
                      className="w-3 h-3 rounded-full mr-3 flex-shrink-0" 
                      style={{ backgroundColor: indicator.color }}
                    ></div>
                    <span className="text-sm font-medium text-gray-700 truncate" title={indicator.name}>
                      {indicator.name}
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    {comparison ? (
                      <>
                        <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getComparisonColor(comparison.changeType)}`}>
                          <span className="mr-1">{getComparisonIcon(comparison.changeType)}</span>
                          {Math.abs(comparison.changeRate).toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {comparison.current.toFixed(1)}% vs {comparison.previous.toFixed(1)}%
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
                title={indicator.name}
              >
                <div 
                  className="w-2 h-2 rounded-full mr-2" 
                  style={{ backgroundColor: selectedIndicators.includes(indicator.key) ? 'white' : indicator.color }}
                ></div>
                <span className="truncate max-w-32">{indicator.name}</span>
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
                        {item.data[indicator.key as keyof RevenueClassificationData].toFixed(1)}%
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
                      请连接数据库后查看详细统计
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
              <li>数据来源于医院财务系统，每日更新</li>
              <li>所有指标均以百分比形式显示，反映各项收入的构成比例</li>
              <li>住院收入基本医疗保险占比 = 基本医疗保险收入/同期住院收入</li>
              <li>住院服务收入占比 = (住院收入-各项费用)/住院收入×100%</li>
              <li>住院收入医疗费用支付方式占比分析反映不同支付方式的构成情况</li>
              <li>住院收入患者医药费用构成反映各项医疗费用的分布情况</li>
              <li>住院收入按费用项目类别分析反映药品、诊疗项目、卫生材料的收入构成</li>
              <li>支持按月、季度、年查看不同时间粒度的数据趋势</li>
              <li>点击指标卡片中的"详情"按钮可查看完整计算公式</li>
              <li>点击指标标签可控制图表中对应数据线的显示/隐藏</li>
              <li>收入分类分析有助于了解医院收入结构和优化收入管理</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}