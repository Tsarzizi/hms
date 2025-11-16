// src/yiliaofudan/menjizhencijunyaofei/frontend/menjizhencijunyaofeixiangxi.tsx
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

interface DetailedDrugCostData {
  date: string;
  // 门诊细分药费
  outpatientWesternDrugCost: number;    // 门诊次均西药费
  outpatientHerbalDrugCost: number;     // 门诊次均中草药费
  outpatientChineseDrugCost: number;    // 门诊次均中成药费
  outpatientTotalDrugCost: number;      // 门诊次均总药费

  // 急诊细分药费
  emergencyWesternDrugCost: number;     // 急诊次均西药费
  emergencyHerbalDrugCost: number;      // 急诊次均中草药费
  emergencyChineseDrugCost: number;     // 急诊次均中成药费
  emergencyTotalDrugCost: number;       // 急诊次均总药费

  // 计算指标
  drugCostChangeRate: number;           // 次均药费变动率
  emergencyDrugCostRatio: number;       // 急诊次均药费占比
}

interface ComparisonData {
  current: number;
  previous: number;
  changeRate: number;
  changeType: 'increase' | 'decrease' | 'stable';
}

const API_BASE_URL = 'http://localhost:5051';

const indicators = [
  {
    key: 'outpatientWesternDrugCost',
    name: '门诊次均西药费',
    color: '#8B5CF6',
    description: '期内门诊西药收入合计/同期门诊总诊疗人次数',
    unit: '元'
  },
  {
    key: 'outpatientHerbalDrugCost',
    name: '门诊次均中草药费',
    color: '#06B6D4',
    description: '期内门诊中草药收入合计/同期门诊总诊疗人次数',
    unit: '元'
  },
  {
    key: 'outpatientChineseDrugCost',
    name: '门诊次均中成药费',
    color: '#10B981',
    description: '期内门诊中成药收入合计/同期门诊总诊疗人次数',
    unit: '元'
  },
  {
    key: 'emergencyWesternDrugCost',
    name: '急诊次均西药费',
    color: '#EF4444',
    description: '期内急诊西药收入合计/同期急诊总诊疗人次数',
    unit: '元'
  },
  {
    key: 'emergencyHerbalDrugCost',
    name: '急诊次均中草药费',
    color: '#F59E0B',
    description: '期内急诊中草药收入合计/同期急诊总诊疗人次数',
    unit: '元'
  },
  {
    key: 'emergencyChineseDrugCost',
    name: '急诊次均中成药费',
    color: '#84CC16',
    description: '期内急诊中成药收入合计/同期急诊总诊疗人次数',
    unit: '元'
  },
  {
    key: 'outpatientTotalDrugCost',
    name: '门诊次均总药费',
    color: '#6366F1',
    description: '期内门诊药费收入合计/同期门诊总诊疗人次数',
    unit: '元'
  },
  {
    key: 'emergencyTotalDrugCost',
    name: '急诊次均总药费',
    color: '#DC2626',
    description: '期内急诊药费收入合计/同期急诊总诊疗人次数',
    unit: '元'
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
const generateMockData = (range: string): DetailedDrugCostData[] => {
  const data: DetailedDrugCostData[] = [];
  const now = new Date();

  switch (range) {
    case 'month':
      // 生成12个月的数据
      for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

        // 门诊药费
        const outpatientWestern = 45 + Math.sin(i * 0.5) * 8 + Math.random() * 5;
        const outpatientHerbal = 15 + Math.sin(i * 0.3) * 4 + Math.random() * 3;
        const outpatientChinese = 20 + Math.sin(i * 0.4) * 6 + Math.random() * 4;
        const outpatientTotal = outpatientWestern + outpatientHerbal + outpatientChinese;

        // 急诊药费
        const emergencyWestern = 55 + Math.sin(i * 0.6) * 10 + Math.random() * 6;
        const emergencyHerbal = 10 + Math.sin(i * 0.2) * 3 + Math.random() * 2;
        const emergencyChinese = 15 + Math.sin(i * 0.5) * 5 + Math.random() * 3;
        const emergencyTotal = emergencyWestern + emergencyHerbal + emergencyChinese;

        // 总药费
        const totalDrugCost = outpatientTotal + emergencyTotal;

        data.push({
          date: dateStr,
          outpatientWesternDrugCost: parseFloat(outpatientWestern.toFixed(2)),
          outpatientHerbalDrugCost: parseFloat(outpatientHerbal.toFixed(2)),
          outpatientChineseDrugCost: parseFloat(outpatientChinese.toFixed(2)),
          outpatientTotalDrugCost: parseFloat(outpatientTotal.toFixed(2)),
          emergencyWesternDrugCost: parseFloat(emergencyWestern.toFixed(2)),
          emergencyHerbalDrugCost: parseFloat(emergencyHerbal.toFixed(2)),
          emergencyChineseDrugCost: parseFloat(emergencyChinese.toFixed(2)),
          emergencyTotalDrugCost: parseFloat(emergencyTotal.toFixed(2)),
          drugCostChangeRate: i === 0 ? 0 : parseFloat((Math.random() * 8 - 4).toFixed(1)),
          emergencyDrugCostRatio: parseFloat(((emergencyTotal / totalDrugCost) * 100).toFixed(1))
        });
      }
      break;

    case 'quarter':
      // 生成8个季度的数据
      for (let i = 7; i >= 0; i--) {
        const quarter = Math.floor((now.getMonth() / 3) - i % 4);
        const year = now.getFullYear() - Math.floor(i / 4);
        const dateStr = `${year}-Q${(quarter + 4) % 4 + 1}`;

        // 门诊药费
        const outpatientWestern = 48 + Math.sin(i * 0.7) * 6 + Math.random() * 4;
        const outpatientHerbal = 16 + Math.sin(i * 0.4) * 3 + Math.random() * 2;
        const outpatientChinese = 22 + Math.sin(i * 0.5) * 4 + Math.random() * 3;
        const outpatientTotal = outpatientWestern + outpatientHerbal + outpatientChinese;

        // 急诊药费
        const emergencyWestern = 58 + Math.sin(i * 0.8) * 8 + Math.random() * 5;
        const emergencyHerbal = 11 + Math.sin(i * 0.3) * 2 + Math.random() * 2;
        const emergencyChinese = 17 + Math.sin(i * 0.6) * 4 + Math.random() * 2;
        const emergencyTotal = emergencyWestern + emergencyHerbal + emergencyChinese;

        // 总药费
        const totalDrugCost = outpatientTotal + emergencyTotal;

        data.push({
          date: dateStr,
          outpatientWesternDrugCost: parseFloat(outpatientWestern.toFixed(2)),
          outpatientHerbalDrugCost: parseFloat(outpatientHerbal.toFixed(2)),
          outpatientChineseDrugCost: parseFloat(outpatientChinese.toFixed(2)),
          outpatientTotalDrugCost: parseFloat(outpatientTotal.toFixed(2)),
          emergencyWesternDrugCost: parseFloat(emergencyWestern.toFixed(2)),
          emergencyHerbalDrugCost: parseFloat(emergencyHerbal.toFixed(2)),
          emergencyChineseDrugCost: parseFloat(emergencyChinese.toFixed(2)),
          emergencyTotalDrugCost: parseFloat(emergencyTotal.toFixed(2)),
          drugCostChangeRate: i === 0 ? 0 : parseFloat((Math.random() * 6 - 3).toFixed(1)),
          emergencyDrugCostRatio: parseFloat(((emergencyTotal / totalDrugCost) * 100).toFixed(1))
        });
      }
      break;

    case 'year':
      // 生成5年的数据
      for (let i = 4; i >= 0; i--) {
        const year = now.getFullYear() - i;
        const dateStr = year.toString();

        // 门诊药费
        const outpatientWestern = 50 + Math.sin(i * 0.6) * 5 + Math.random() * 3;
        const outpatientHerbal = 18 + Math.sin(i * 0.5) * 2 + Math.random() * 2;
        const outpatientChinese = 25 + Math.sin(i * 0.7) * 3 + Math.random() * 2;
        const outpatientTotal = outpatientWestern + outpatientHerbal + outpatientChinese;

        // 急诊药费
        const emergencyWestern = 60 + Math.sin(i * 1.0) * 6 + Math.random() * 4;
        const emergencyHerbal = 12 + Math.sin(i * 0.4) * 2 + Math.random() * 1;
        const emergencyChinese = 20 + Math.sin(i * 0.8) * 3 + Math.random() * 2;
        const emergencyTotal = emergencyWestern + emergencyHerbal + emergencyChinese;

        // 总药费
        const totalDrugCost = outpatientTotal + emergencyTotal;

        data.push({
          date: dateStr,
          outpatientWesternDrugCost: parseFloat(outpatientWestern.toFixed(2)),
          outpatientHerbalDrugCost: parseFloat(outpatientHerbal.toFixed(2)),
          outpatientChineseDrugCost: parseFloat(outpatientChinese.toFixed(2)),
          outpatientTotalDrugCost: parseFloat(outpatientTotal.toFixed(2)),
          emergencyWesternDrugCost: parseFloat(emergencyWestern.toFixed(2)),
          emergencyHerbalDrugCost: parseFloat(emergencyHerbal.toFixed(2)),
          emergencyChineseDrugCost: parseFloat(emergencyChinese.toFixed(2)),
          emergencyTotalDrugCost: parseFloat(emergencyTotal.toFixed(2)),
          drugCostChangeRate: i === 0 ? 0 : parseFloat((Math.random() * 4 - 2).toFixed(1)),
          emergencyDrugCostRatio: parseFloat(((emergencyTotal / totalDrugCost) * 100).toFixed(1))
        });
      }
      break;

    default:
      break;
  }

  return data;
};

// 生成模拟同比环比数据
const generateMockComparisonData = (chartData: DetailedDrugCostData[]) => {
  if (chartData.length === 0) return { yearOverYear: {}, monthOverMonth: {} };

  const yearOverYear: Record<string, ComparisonData> = {};
  const monthOverMonth: Record<string, ComparisonData> = {};

  indicators.forEach(indicator => {
    const currentValue = chartData[chartData.length - 1][indicator.key as keyof DetailedDrugCostData] as number;
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
const calculateStats = (data: DetailedDrugCostData[]) => {
  if (data.length === 0) return null;

  const lastData = data[data.length - 1];
  const prevData = data.length > 1 ? data[data.length - 2] : null;

  return {
    outpatientWesternDrugCost: {
      value: lastData.outpatientWesternDrugCost,
      change: prevData ? (lastData.outpatientWesternDrugCost - prevData.outpatientWesternDrugCost) : 0
    },
    outpatientHerbalDrugCost: {
      value: lastData.outpatientHerbalDrugCost,
      change: prevData ? (lastData.outpatientHerbalDrugCost - prevData.outpatientHerbalDrugCost) : 0
    },
    outpatientChineseDrugCost: {
      value: lastData.outpatientChineseDrugCost,
      change: prevData ? (lastData.outpatientChineseDrugCost - prevData.outpatientChineseDrugCost) : 0
    },
    emergencyWesternDrugCost: {
      value: lastData.emergencyWesternDrugCost,
      change: prevData ? (lastData.emergencyWesternDrugCost - prevData.emergencyWesternDrugCost) : 0
    },
    emergencyHerbalDrugCost: {
      value: lastData.emergencyHerbalDrugCost,
      change: prevData ? (lastData.emergencyHerbalDrugCost - prevData.emergencyHerbalDrugCost) : 0
    },
    emergencyChineseDrugCost: {
      value: lastData.emergencyChineseDrugCost,
      change: prevData ? (lastData.emergencyChineseDrugCost - prevData.emergencyChineseDrugCost) : 0
    },
    outpatientTotalDrugCost: {
      value: lastData.outpatientTotalDrugCost,
      change: prevData ? (lastData.outpatientTotalDrugCost - prevData.outpatientTotalDrugCost) : 0
    },
    emergencyTotalDrugCost: {
      value: lastData.emergencyTotalDrugCost,
      change: prevData ? (lastData.emergencyTotalDrugCost - prevData.emergencyTotalDrugCost) : 0
    }
  };
};

export default function OutpatientDrugCostDetailedAnalysis() {
  const [timeRange, setTimeRange] = useState('month');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [analysisData, setAnalysisData] = useState<DetailedDrugCostData[]>([]);
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
      setYearOverYear(comparisonData.yearOverYear);
      setMonthOverMonth(comparisonData.monthOverMonth);

    } catch (error) {
      console.error('获取数据失败:', error);
      setAnalysisData([]);
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
  const drugCostTrendData = {
    labels: analysisData.map(item => item.date),
    datasets: [
      {
        label: '门诊次均总药费',
        data: analysisData.map(item => item.outpatientTotalDrugCost),
        borderColor: '#8B5CF6',
        backgroundColor: '#8B5CF620',
        fill: true,
        tension: 0.1
      },
      {
        label: '急诊次均总药费',
        data: analysisData.map(item => item.emergencyTotalDrugCost),
        borderColor: '#EF4444',
        backgroundColor: '#EF444420',
        fill: true,
        tension: 0.1
      }
    ]
  };

  const drugCostChangeRateData = {
    labels: analysisData.map(item => item.date),
    datasets: [
      {
        label: '门诊次均药费变动率',
        data: analysisData.map(item => item.drugCostChangeRate),
        borderColor: '#10B981',
        backgroundColor: '#10B98120',
        fill: true,
        tension: 0.1
      }
    ]
  };

  const outpatientDrugStructureData = {
    labels: analysisData.map(item => item.date),
    datasets: [
      {
        label: '门诊西药费',
        data: analysisData.map(item => item.outpatientWesternDrugCost),
        borderColor: '#8B5CF6',
        backgroundColor: '#8B5CF620',
        fill: false
      },
      {
        label: '门诊中草药费',
        data: analysisData.map(item => item.outpatientHerbalDrugCost),
        borderColor: '#06B6D4',
        backgroundColor: '#06B6D420',
        fill: false
      },
      {
        label: '门诊中成药费',
        data: analysisData.map(item => item.outpatientChineseDrugCost),
        borderColor: '#10B981',
        backgroundColor: '#10B98120',
        fill: false
      }
    ]
  };

  const emergencyDrugStructureData = {
    labels: analysisData.map(item => item.date),
    datasets: [
      {
        label: '急诊西药费',
        data: analysisData.map(item => item.emergencyWesternDrugCost),
        borderColor: '#EF4444',
        backgroundColor: '#EF444420',
        fill: false
      },
      {
        label: '急诊中草药费',
        data: analysisData.map(item => item.emergencyHerbalDrugCost),
        borderColor: '#F59E0B',
        backgroundColor: '#F59E0B20',
        fill: false
      },
      {
        label: '急诊中成药费',
        data: analysisData.map(item => item.emergencyChineseDrugCost),
        borderColor: '#84CC16',
        backgroundColor: '#84CC1620',
        fill: false
      }
    ]
  };

  // 门诊药费构成比例（最新月份）
  const getLatestOutpatientStructure = () => {
    if (analysisData.length === 0) return { western: 60, herbal: 20, chinese: 20 };
    const latest = analysisData[analysisData.length - 1];
    const total = latest.outpatientTotalDrugCost;
    return {
      western: (latest.outpatientWesternDrugCost / total) * 100,
      herbal: (latest.outpatientHerbalDrugCost / total) * 100,
      chinese: (latest.outpatientChineseDrugCost / total) * 100
    };
  };

  const outpatientStructureData = {
    labels: ['西药', '中草药', '中成药'],
    datasets: [
      {
        data: [
          getLatestOutpatientStructure().western,
          getLatestOutpatientStructure().herbal,
          getLatestOutpatientStructure().chinese
        ],
        backgroundColor: ['#8B5CF6', '#06B6D4', '#10B981'],
        hoverBackgroundColor: ['#8B5CF6', '#06B6D4', '#10B981']
      }
    ]
  };

  // 急诊药费构成比例（最新月份）
  const getLatestEmergencyStructure = () => {
    if (analysisData.length === 0) return { western: 70, herbal: 15, chinese: 15 };
    const latest = analysisData[analysisData.length - 1];
    const total = latest.emergencyTotalDrugCost;
    return {
      western: (latest.emergencyWesternDrugCost / total) * 100,
      herbal: (latest.emergencyHerbalDrugCost / total) * 100,
      chinese: (latest.emergencyChineseDrugCost / total) * 100
    };
  };

  const emergencyStructureData = {
    labels: ['西药', '中草药', '中成药'],
    datasets: [
      {
        data: [
          getLatestEmergencyStructure().western,
          getLatestEmergencyStructure().herbal,
          getLatestEmergencyStructure().chinese
        ],
        backgroundColor: ['#EF4444', '#F59E0B', '#84CC16'],
        hoverBackgroundColor: ['#EF4444', '#F59E0B', '#84CC16']
      }
    ]
  };

  // 急诊次均药费占比趋势
  const emergencyDrugCostRatioData = {
    labels: analysisData.map(item => item.date),
    datasets: [
      {
        label: '急诊次均药费占比',
        data: analysisData.map(item => item.emergencyDrugCostRatio),
        borderColor: '#F59E0B',
        backgroundColor: '#F59E0B20',
        fill: true,
        tension: 0.1
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
            <h1 className="text-2xl font-bold text-gray-900">门急诊次均药费详细分析</h1>
            <p className="text-gray-600 text-sm mt-2">
              深入分析门急诊次均药费的详细构成，包括门诊和急诊的西药、中草药、中成药费用，以及费用变动趋势和占比分析
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium text-gray-900">{selectedDate} 数据</div>
              <div className="text-xs text-gray-500">最后更新：今天 14:30</div>
            </div>
            <button className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors duration-200">
              <span className="text-lg">💊</span>
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
                      {stat.value.toFixed(2)}
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
                          {comparison.current.toFixed(2)}{indicator.unit} vs {comparison.previous.toFixed(2)}{indicator.unit}
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
                          {comparison.current.toFixed(2)}{indicator.unit} vs {comparison.previous.toFixed(2)}{indicator.unit}
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
          <h2 className="text-lg font-semibold text-gray-900 mb-4 lg:mb-0">药费分析图表</h2>

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
          {/* 门急诊次均药费趋势 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">门急诊次均药费趋势</h3>
            <div className="h-80">
              <Line
                data={drugCostTrendData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      beginAtZero: true,
                      title: {
                        display: true,
                        text: '药费 (元)'
                      }
                    }
                  }
                }}
              />
            </div>
          </div>

          {/* 门诊次均药费变动率 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">门诊次均药费变动率</h3>
            <div className="h-80">
              <Line
                data={drugCostChangeRateData}
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

          {/* 门诊药费构成趋势 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">门诊药费构成趋势</h3>
            <div className="h-80">
              <Line
                data={outpatientDrugStructureData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      beginAtZero: true,
                      title: {
                        display: true,
                        text: '药费 (元)'
                      }
                    }
                  }
                }}
              />
            </div>
          </div>

          {/* 急诊药费构成趋势 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">急诊药费构成趋势</h3>
            <div className="h-80">
              <Line
                data={emergencyDrugStructureData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      beginAtZero: true,
                      title: {
                        display: true,
                        text: '药费 (元)'
                      }
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* 结构比例分析 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* 门诊药费构成比例 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">门诊药费构成比例</h3>
            <div className="h-64">
              <Doughnut
                data={outpatientStructureData}
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
            {analysisData.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="text-purple-600">
                  <div className="font-bold">{getLatestOutpatientStructure().western.toFixed(1)}%</div>
                  <div>西药</div>
                </div>
                <div className="text-cyan-600">
                  <div className="font-bold">{getLatestOutpatientStructure().herbal.toFixed(1)}%</div>
                  <div>中草药</div>
                </div>
                <div className="text-green-600">
                  <div className="font-bold">{getLatestOutpatientStructure().chinese.toFixed(1)}%</div>
                  <div>中成药</div>
                </div>
              </div>
            )}
          </div>

          {/* 急诊药费构成比例 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">急诊药费构成比例</h3>
            <div className="h-64">
              <Doughnut
                data={emergencyStructureData}
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
            {analysisData.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="text-red-600">
                  <div className="font-bold">{getLatestEmergencyStructure().western.toFixed(1)}%</div>
                  <div>西药</div>
                </div>
                <div className="text-yellow-600">
                  <div className="font-bold">{getLatestEmergencyStructure().herbal.toFixed(1)}%</div>
                  <div>中草药</div>
                </div>
                <div className="text-lime-600">
                  <div className="font-bold">{getLatestEmergencyStructure().chinese.toFixed(1)}%</div>
                  <div>中成药</div>
                </div>
              </div>
            )}
          </div>

          {/* 急诊药费占比趋势 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">急诊次均药费占比趋势</h3>
            <div className="h-64">
              <Line
                data={emergencyDrugCostRatioData}
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
            {analysisData.length > 0 && (
              <div className="mt-4 text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {analysisData[analysisData.length - 1].emergencyDrugCostRatio.toFixed(1)}%
                </div>
                <div className="text-sm text-gray-600">当前急诊药费占比</div>
              </div>
            )}
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
                {/* 门诊药费 */}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  门诊西药费
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  门诊中草药费
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  门诊中成药费
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  门诊总药费
                </th>
                {/* 急诊药费 */}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  急诊西药费
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  急诊中草药费
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  急诊中成药费
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  急诊总药费
                </th>
                {/* 计算指标 */}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  药费变动率
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  急诊药费占比
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
                    {/* 门诊药费 */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-purple-600">
                      {item.outpatientWesternDrugCost.toFixed(2)}元
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-cyan-600">
                      {item.outpatientHerbalDrugCost.toFixed(2)}元
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                      {item.outpatientChineseDrugCost.toFixed(2)}元
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                      {item.outpatientTotalDrugCost.toFixed(2)}元
                    </td>
                    {/* 急诊药费 */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                      {item.emergencyWesternDrugCost.toFixed(2)}元
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-600">
                      {item.emergencyHerbalDrugCost.toFixed(2)}元
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-lime-600">
                      {item.emergencyChineseDrugCost.toFixed(2)}元
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                      {item.emergencyTotalDrugCost.toFixed(2)}元
                    </td>
                    {/* 计算指标 */}
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                      item.drugCostChangeRate > 0 ? 'text-red-600' : item.drugCostChangeRate < 0 ? 'text-green-600' : 'text-gray-600'
                    }`}>
                      {item.drugCostChangeRate > 0 ? '+' : ''}{item.drugCostChangeRate.toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-orange-600">
                      {item.emergencyDrugCostRatio.toFixed(1)}%
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-gray-500">
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
              <li>数据来源于医院财务系统、药房管理系统和中医药管理系统</li>
              <li><strong>门诊次均西药费</strong> = 期内门诊西药收入合计 / 同期门诊总诊疗人次数</li>
              <li><strong>门诊次均中草药费</strong> = 期内门诊中草药收入合计 / 同期门诊总诊疗人次数</li>
              <li><strong>门诊次均中成药费</strong> = 期内门诊中成药收入合计 / 同期门诊总诊疗人次数</li>
              <li><strong>急诊次均西药费</strong> = 期内急诊西药收入合计 / 同期急诊总诊疗人次数</li>
              <li><strong>急诊次均中草药费</strong> = 期内急诊中草药收入合计 / 同期急诊总诊疗人次数</li>
              <li><strong>急诊次均中成药费</strong> = 期内急诊中成药收入合计 / 同期急诊总诊疗人次数</li>
              <li><strong>门急诊次均药费变动率</strong> = (当月次均药费 - 上月次均药费) / 上月次均药费 × 100%</li>
              <li><strong>急诊次均药费占比</strong> = 期内急诊次均药费 / 期内门急诊次均药费 × 100%</li>
              <li>后端服务运行在: {API_BASE_URL}</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}