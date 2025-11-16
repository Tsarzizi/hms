// src/yiliaofudan/menjizhencijunfeiyong/frontend/menjizhencijunfeiyongfenxi.tsx
import { useState, useEffect, useMemo } from 'react';
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
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
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

interface CostAnalysisData {
  date: string;
  totalAvgCost: number;
  drugCostRatio: number;
  materialCostRatio: number;
  examinationCostRatio: number;
  treatmentCostRatio: number;
  costChangeRate: number;
  insurancePaymentRatio: number;
  personalPaymentRatio: number;
  insuranceAvgPayment: number;
  personalAvgPayment: number;
}

interface CostStructureData {
  drugCost: number;
  materialCost: number;
  examinationCost: number;
  treatmentCost: number;
  otherCost: number;
}

interface ComparisonData {
  current: number;
  previous: number;
  changeRate: number;
  changeType: 'increase' | 'decrease' | 'stable';
}

const API_BASE_URL = 'http://localhost:5048';

const indicators = [
  {
    key: 'totalAvgCost',
    name: '门急诊次均费用',
    color: '#8B5CF6',
    description: '期内门急诊患者医疗总费用 / 期内门急诊总人次',
    unit: '元'
  },
  {
    key: 'drugCostRatio',
    name: '药品费占比',
    color: '#FF6384',
    description: '期内门急诊次均药品费 / 期内门急诊次均费用 × 100%',
    unit: '%'
  },
  {
    key: 'materialCostRatio',
    name: '材料费占比',
    color: '#36A2EB',
    description: '期内门急诊次均卫生材料费 / 期内门急诊次均费用 × 100%',
    unit: '%'
  },
  {
    key: 'examinationCostRatio',
    name: '检查费占比',
    color: '#FFCE56',
    description: '期内门急诊次均检查费 / 期内门急诊次均费用 × 100%',
    unit: '%'
  },
  {
    key: 'treatmentCostRatio',
    name: '治疗费占比',
    color: '#4BC0C0',
    description: '期内门急诊次均治疗费 / 期内门急诊次均费用 × 100%',
    unit: '%'
  },
  {
    key: 'insurancePaymentRatio',
    name: '医保支付比例',
    color: '#10B981',
    description: '期内门急诊医保患者次均医保基金支付费用 / 期内门急诊医保患者次均费用 × 100%',
    unit: '%'
  },
  {
    key: 'personalPaymentRatio',
    name: '个人支付比例',
    color: '#F59E0B',
    description: '期内医保患者急诊次均个人支付费用 / 期内门急诊医保患者次均费用 × 100%',
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
  { value: "pediatrics", label: "儿科" },
  { value: "emergency", label: "急诊科" },
  { value: "traditional", label: "中医科" },
  { value: "stomatology", label: "口腔科" }
];

// 模拟医生数据
const mockDoctors = [
  { value: "doctor_1", label: "王医生" },
  { value: "doctor_2", label: "李医生" },
  { value: "doctor_3", label: "张医生" },
  { value: "doctor_4", label: "刘医生" },
  { value: "doctor_5", label: "陈医生" }
];

// 多选下拉组件（复用原代码的组件）
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
const generateMockData = (range: string): CostAnalysisData[] => {
  const data: CostAnalysisData[] = [];
  const now = new Date();

  switch (range) {
    case 'month':
      // 生成12个月的数据
      for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

        const baseCost = 200 + Math.sin(i * 0.5) * 30 + Math.random() * 20;
        const drugRatio = 0.4 + Math.sin(i * 0.3) * 0.05 + Math.random() * 0.03;
        const materialRatio = 0.1 + Math.sin(i * 0.4) * 0.02 + Math.random() * 0.02;
        const examRatio = 0.2 + Math.sin(i * 0.6) * 0.04 + Math.random() * 0.03;
        const treatmentRatio = 0.15 + Math.sin(i * 0.7) * 0.03 + Math.random() * 0.02;
        const insuranceRatio = 0.6 + Math.sin(i * 0.2) * 0.1 + Math.random() * 0.05;

        data.push({
          date: dateStr,
          totalAvgCost: parseFloat(baseCost.toFixed(2)),
          drugCostRatio: parseFloat((drugRatio * 100).toFixed(1)),
          materialCostRatio: parseFloat((materialRatio * 100).toFixed(1)),
          examinationCostRatio: parseFloat((examRatio * 100).toFixed(1)),
          treatmentCostRatio: parseFloat((treatmentRatio * 100).toFixed(1)),
          costChangeRate: i === 0 ? 0 : parseFloat((Math.random() * 8 - 4).toFixed(1)),
          insurancePaymentRatio: parseFloat((insuranceRatio * 100).toFixed(1)),
          personalPaymentRatio: parseFloat(((1 - insuranceRatio) * 100).toFixed(1)),
          insuranceAvgPayment: parseFloat((baseCost * insuranceRatio).toFixed(2)),
          personalAvgPayment: parseFloat((baseCost * (1 - insuranceRatio)).toFixed(2))
        });
      }
      break;

    case 'quarter':
      // 生成8个季度的数据
      for (let i = 7; i >= 0; i--) {
        const quarter = Math.floor((now.getMonth() / 3) - i % 4);
        const year = now.getFullYear() - Math.floor(i / 4);
        const dateStr = `${year}-Q${(quarter + 4) % 4 + 1}`;

        const baseCost = 210 + Math.sin(i * 0.7) * 25 + Math.random() * 15;
        const drugRatio = 0.38 + Math.sin(i * 0.5) * 0.04 + Math.random() * 0.02;
        const materialRatio = 0.12 + Math.sin(i * 0.6) * 0.03 + Math.random() * 0.02;
        const examRatio = 0.22 + Math.sin(i * 0.8) * 0.05 + Math.random() * 0.02;
        const treatmentRatio = 0.16 + Math.sin(i * 0.9) * 0.04 + Math.random() * 0.02;
        const insuranceRatio = 0.62 + Math.sin(i * 0.3) * 0.08 + Math.random() * 0.04;

        data.push({
          date: dateStr,
          totalAvgCost: parseFloat(baseCost.toFixed(2)),
          drugCostRatio: parseFloat((drugRatio * 100).toFixed(1)),
          materialCostRatio: parseFloat((materialRatio * 100).toFixed(1)),
          examinationCostRatio: parseFloat((examRatio * 100).toFixed(1)),
          treatmentCostRatio: parseFloat((treatmentRatio * 100).toFixed(1)),
          costChangeRate: i === 0 ? 0 : parseFloat((Math.random() * 6 - 3).toFixed(1)),
          insurancePaymentRatio: parseFloat((insuranceRatio * 100).toFixed(1)),
          personalPaymentRatio: parseFloat(((1 - insuranceRatio) * 100).toFixed(1)),
          insuranceAvgPayment: parseFloat((baseCost * insuranceRatio).toFixed(2)),
          personalAvgPayment: parseFloat((baseCost * (1 - insuranceRatio)).toFixed(2))
        });
      }
      break;

    case 'year':
      // 生成5年的数据
      for (let i = 4; i >= 0; i--) {
        const year = now.getFullYear() - i;
        const dateStr = year.toString();

        const baseCost = 220 + Math.sin(i * 0.6) * 20 + Math.random() * 10;
        const drugRatio = 0.36 + Math.sin(i * 0.7) * 0.03 + Math.random() * 0.02;
        const materialRatio = 0.14 + Math.sin(i * 0.8) * 0.04 + Math.random() * 0.01;
        const examRatio = 0.24 + Math.sin(i * 1.0) * 0.06 + Math.random() * 0.02;
        const treatmentRatio = 0.18 + Math.sin(i * 1.1) * 0.05 + Math.random() * 0.02;
        const insuranceRatio = 0.64 + Math.sin(i * 0.4) * 0.06 + Math.random() * 0.03;

        data.push({
          date: dateStr,
          totalAvgCost: parseFloat(baseCost.toFixed(2)),
          drugCostRatio: parseFloat((drugRatio * 100).toFixed(1)),
          materialCostRatio: parseFloat((materialRatio * 100).toFixed(1)),
          examinationCostRatio: parseFloat((examRatio * 100).toFixed(1)),
          treatmentCostRatio: parseFloat((treatmentRatio * 100).toFixed(1)),
          costChangeRate: i === 0 ? 0 : parseFloat((Math.random() * 4 - 2).toFixed(1)),
          insurancePaymentRatio: parseFloat((insuranceRatio * 100).toFixed(1)),
          personalPaymentRatio: parseFloat(((1 - insuranceRatio) * 100).toFixed(1)),
          insuranceAvgPayment: parseFloat((baseCost * insuranceRatio).toFixed(2)),
          personalAvgPayment: parseFloat((baseCost * (1 - insuranceRatio)).toFixed(2))
        });
      }
      break;

    default:
      break;
  }

  return data;
};

const getMockCostStructure = (): CostStructureData => {
  return {
    drugCost: 85,
    materialCost: 25,
    examinationCost: 45,
    treatmentCost: 35,
    otherCost: 10
  };
};

// 生成模拟同比环比数据
const generateMockComparisonData = (chartData: CostAnalysisData[]) => {
  if (chartData.length === 0) return { yearOverYear: {}, monthOverMonth: {} };

  const yearOverYear: Record<string, ComparisonData> = {};
  const monthOverMonth: Record<string, ComparisonData> = {};

  indicators.forEach(indicator => {
    const currentValue = chartData[chartData.length - 1][indicator.key as keyof CostAnalysisData] as number;
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
const calculateStats = (data: CostAnalysisData[]) => {
  if (data.length === 0) return null;

  const lastData = data[data.length - 1];
  const prevData = data.length > 1 ? data[data.length - 2] : null;

  return {
    totalAvgCost: {
      value: lastData.totalAvgCost,
      change: prevData ? (lastData.totalAvgCost - prevData.totalAvgCost) : 0
    },
    drugCostRatio: {
      value: lastData.drugCostRatio,
      change: prevData ? (lastData.drugCostRatio - prevData.drugCostRatio) : 0
    },
    materialCostRatio: {
      value: lastData.materialCostRatio,
      change: prevData ? (lastData.materialCostRatio - prevData.materialCostRatio) : 0
    },
    examinationCostRatio: {
      value: lastData.examinationCostRatio,
      change: prevData ? (lastData.examinationCostRatio - prevData.examinationCostRatio) : 0
    },
    treatmentCostRatio: {
      value: lastData.treatmentCostRatio,
      change: prevData ? (lastData.treatmentCostRatio - prevData.treatmentCostRatio) : 0
    },
    insurancePaymentRatio: {
      value: lastData.insurancePaymentRatio,
      change: prevData ? (lastData.insurancePaymentRatio - prevData.insurancePaymentRatio) : 0
    },
    personalPaymentRatio: {
      value: lastData.personalPaymentRatio,
      change: prevData ? (lastData.personalPaymentRatio - prevData.personalPaymentRatio) : 0
    }
  };
};

export default function OutpatientCostAnalysis() {
  const [timeRange, setTimeRange] = useState('month');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [analysisData, setAnalysisData] = useState<CostAnalysisData[]>([]);
  const [costStructure, setCostStructure] = useState<CostStructureData | null>(null);
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

      setAnalysisData(mockData);
      setCostStructure(getMockCostStructure());
      setYearOverYear(comparisonData.yearOverYear);
      setMonthOverMonth(comparisonData.monthOverMonth);

    } catch (error) {
      console.error('获取数据失败:', error);
      setAnalysisData([]);
      setCostStructure(null);
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

  // 图表数据配置
  const paymentBurdenData = {
    labels: ['医保支付', '个人支付'],
    datasets: [
      {
        data: analysisData.length > 0
          ? [analysisData[analysisData.length - 1].insurancePaymentRatio, analysisData[analysisData.length - 1].personalPaymentRatio]
          : [65, 35],
        backgroundColor: ['#36A2EB', '#FF6384'],
        hoverBackgroundColor: ['#36A2EB', '#FF6384']
      }
    ]
  };

  const costTrendData = {
    labels: analysisData.map(item => item.date),
    datasets: [
      {
        label: '门急诊次均费用 (元)',
        data: analysisData.map(item => item.totalAvgCost),
        borderColor: '#8B5CF6',
        backgroundColor: '#8B5CF620',
        fill: true,
        tension: 0.1
      }
    ]
  };

  const costChangeRateData = {
    labels: analysisData.map(item => item.date),
    datasets: [
      {
        label: '费用变动率 (%)',
        data: analysisData.map(item => item.costChangeRate),
        borderColor: '#10B981',
        backgroundColor: '#10B98120',
        fill: true,
        tension: 0.1
      }
    ]
  };

  const costStructureData = {
    labels: ['药品费', '卫生材料费', '检查费', '治疗费', '其他'],
    datasets: [
      {
        data: costStructure ? [
          costStructure.drugCost,
          costStructure.materialCost,
          costStructure.examinationCost,
          costStructure.treatmentCost,
          costStructure.otherCost
        ] : [40, 15, 25, 15, 5],
        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'],
        hoverBackgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF']
      }
    ]
  };

  const costRatioTrendData = {
    labels: analysisData.map(item => item.date),
    datasets: [
      {
        label: '药品费占比 (%)',
        data: analysisData.map(item => item.drugCostRatio),
        borderColor: '#FF6384',
        backgroundColor: '#FF638420',
        fill: false
      },
      {
        label: '检查费占比 (%)',
        data: analysisData.map(item => item.examinationCostRatio),
        borderColor: '#FFCE56',
        backgroundColor: '#FFCE5620',
        fill: false
      },
      {
        label: '材料费占比 (%)',
        data: analysisData.map(item => item.materialCostRatio),
        borderColor: '#36A2EB',
        backgroundColor: '#36A2EB20',
        fill: false
      },
      {
        label: '治疗费占比 (%)',
        data: analysisData.map(item => item.treatmentCostRatio),
        borderColor: '#4BC0C0',
        backgroundColor: '#4BC0C020',
        fill: false
      }
    ]
  };

  const stats = calculateStats(analysisData);

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* 页面标题 */}
      <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <h1 className="text-2xl font-bold text-gray-900">门急诊次均费用分析</h1>
            <p className="text-gray-600 text-sm mt-2">
              深入分析门急诊次均费用的构成、变化趋势、支付负担比例等关键指标，为医疗费用控制和医保管理提供数据支持
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
            <label className="text-sm font-medium text-gray-700 block">年份</label>
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
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {indicators.map((indicator) => {
          const stat = stats ? stats[indicator.key as keyof typeof stats] : null;
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
                  {stat ? (
                    <>
                      {stat.value.toFixed(indicator.unit === '元' ? 2 : 1)}
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
                      {stat.change > 0 ? '↑' : '↓'} {Math.abs(stat.change).toFixed(2)}{indicator.unit}
                      <span className="text-gray-500 ml-1">环比</span>
                    </span>
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
              const comparison = yearOverYear[indicator.key];
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
                        <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getComparisonColor(comparison.changeType)}`}>
                          <span className="mr-1">{getComparisonIcon(comparison.changeType)}</span>
                          {Math.abs(comparison.changeRate).toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {comparison.current.toFixed(indicator.unit === '元' ? 2 : 1)}{indicator.unit} vs {comparison.previous.toFixed(indicator.unit === '元' ? 2 : 1)}{indicator.unit}
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
                    <span className="text-sm font-medium text-gray-700">{indicator.name}</span>
                  </div>
                  <div className="text-right">
                    {comparison ? (
                      <>
                        <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getComparisonColor(comparison.changeType)}`}>
                          <span className="mr-1">{getComparisonIcon(comparison.changeType)}</span>
                          {Math.abs(comparison.changeRate).toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {comparison.current.toFixed(indicator.unit === '元' ? 2 : 1)}{indicator.unit} vs {comparison.previous.toFixed(indicator.unit === '元' ? 2 : 1)}{indicator.unit}
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

      {/* 图表区域 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 lg:mb-0">费用分析图表</h2>

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

        {/* 图表网格 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 支付负担比例 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">次均费用支付负担比例</h3>
            <div className="h-80">
              <Doughnut
                data={paymentBurdenData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'bottom'
                    },
                    tooltip: {
                      callbacks: {
                        label: function(context) {
                          return `${context.label}: ${context.parsed}%`;
                        }
                      }
                    }
                  }
                }}
              />
            </div>
            {analysisData.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-4 text-center">
                <div className="bg-blue-50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-blue-600">
                    {analysisData[analysisData.length - 1].insurancePaymentRatio.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-600">医保支付比例</div>
                </div>
                <div className="bg-red-50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-red-600">
                    {analysisData[analysisData.length - 1].personalPaymentRatio.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-600">个人支付比例</div>
                </div>
              </div>
            )}
          </div>

          {/* 费用趋势 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">门急诊次均费用趋势</h3>
            <div className="h-80">
              <Line
                data={costTrendData}
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
            </div>
          </div>

          {/* 费用变动率 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">门急诊次均费用变动率</h3>
            <div className="h-80">
              <Line
                data={costChangeRateData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      title: {
                        display: true,
                        text: '变动率 (%)'
                      }
                    }
                  },
                  plugins: {
                    tooltip: {
                      callbacks: {
                        label: function(context) {
                          return `${context.dataset.label}: ${context.parsed.y > 0 ? '+' : ''}${context.parsed.y}%`;
                        }
                      }
                    }
                  }
                }}
              />
            </div>
          </div>

          {/* 费用构成 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">门急诊次均医药费用构成比例</h3>
            <div className="h-80">
              <Pie
                data={costStructureData}
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
          </div>
        </div>

        {/* 费用占比趋势 */}
        <div className="mt-6 bg-gray-50 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">各项费用占比趋势分析</h3>
          <div className="h-80">
            <Line
              data={costRatioTrendData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  y: {
                    min: 0,
                    max: 100,
                    title: {
                      display: true,
                      text: '占比 (%)'
                    }
                  }
                }
              }}
            />
          </div>
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
                  期间
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  次均费用
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  费用变动率
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  药品费占比
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  材料费占比
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  检查费占比
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  治疗费占比
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  医保支付比例
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  个人支付比例
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {analysisData.length > 0 ? (
                analysisData.map((item, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.totalAvgCost.toFixed(2)}元
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                      item.costChangeRate > 0 ? 'text-red-600' : item.costChangeRate < 0 ? 'text-green-600' : 'text-gray-600'
                    }`}>
                      {item.costChangeRate > 0 ? '+' : ''}{item.costChangeRate.toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.drugCostRatio.toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.materialCostRatio.toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.examinationCostRatio.toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.treatmentCostRatio.toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">
                      {item.insurancePaymentRatio.toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                      {item.personalPaymentRatio.toFixed(1)}%
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
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
              <li>数据来源于医院财务系统、医保结算系统和门急诊管理系统</li>
              <li><strong>次均费用医保支付负担比例</strong> = 期内门急诊医保患者次均医保基金支付费用 / 期内门急诊医保患者次均费用 × 100%</li>
              <li><strong>次均费用个人负担比例</strong> = 期内医保患者急诊次均个人支付费用 / 期内门急诊医保患者次均费用 × 100%</li>
              <li><strong>门急诊次均费用变动率</strong> = (本月次均费用 - 上月次均费用) / 上月次均费用 × 100%</li>
              <li><strong>门急诊次均费用药品费占比</strong> = 期内门急诊次均药品费 / 期内门急诊次均费用 × 100%</li>
              <li><strong>门急诊次均费用卫生材料费占比</strong> = 期内门急诊次均卫生材料费 / 期内门急诊次均费用 × 100%</li>
              <li><strong>门急诊次均费用检查费占比</strong> = 期内门急诊次均检查费 / 期内门急诊次均费用 × 100%</li>
              <li><strong>门急诊次均医药费用构成比例</strong> = 期内门急诊次均各类单项费用 / 期内门急诊次均费用 × 100%</li>
              <li>后端服务运行在: {API_BASE_URL}</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}