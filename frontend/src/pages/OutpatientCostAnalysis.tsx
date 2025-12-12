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

// 整体汇总（老口径：总费用/总人次等），后端返回的 overallSummary
interface OverallSummary {
  totalAvgCost: number;
  drugCostRatio: number;
  materialCostRatio: number;
  examinationCostRatio: number;
  treatmentCostRatio: number;
  insurancePaymentRatio: number;
  personalPaymentRatio: number;
  insuranceAvgPayment: number;
  personalAvgPayment: number;
}

interface ComparisonData {
  current: number;
  previous: number;
  changeRate: number;
  changeType: 'increase' | 'decrease' | 'stable';
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  code?: number;
}

interface QueryParams {
  startDate: string;
  endDate: string;
  departments?: string[];
}

interface DepartmentOption {
  id: string;
  name: string;
}

const API_PREFIX = '/api/outpatient-cost-analysis';

const indicators = [
  {
    key: 'totalAvgCost',
    name: '门急诊次均费用',
    color: '#8B5CF6',
    unit: '元'
  },
  {
    key: 'drugCostRatio',
    name: '药品费占比',
    color: '#FF6384',
    unit: '%'
  },
  {
    key: 'materialCostRatio',
    name: '材料费占比',
    color: '#36A2EB',
    unit: '%'
  },
  {
    key: 'examinationCostRatio',
    name: '检查费占比',
    color: '#FFCE56',
    unit: '%'
  },
  {
    key: 'treatmentCostRatio',
    name: '治疗费占比',
    color: '#4BC0C0',
    unit: '%'
  },
  {
    key: 'insurancePaymentRatio',
    name: '医保支付比例',
    color: '#10B981',
    unit: '%'
  },
  {
    key: 'personalPaymentRatio',
    name: '个人支付比例',
    color: '#F59E0B',
    unit: '%'
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
    if (next.has(val)) {
      next.delete(val);
    } else {
      next.add(val);
    }
    onChange(next);
  };

  const handleAll = () => {
    if (allSelected) {
      onChange(new Set());
    } else {
      onChange(new Set(options.map((o) => o.value)));
    }
  };

  const clear = () => {
    onChange(new Set());
    setQ("");
  };

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
const costAnalysisApi = {
  // 获取科室列表
  async getDepartments(): Promise<ApiResponse<DepartmentOption[]>> {
    try {
      const response = await fetch(`${API_PREFIX}/departments`, {
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

  // 获取成本分析数据
  async getCostAnalysisData(params: QueryParams): Promise<ApiResponse<{
    analysisData: CostAnalysisData[];
    costStructure: CostStructureData;
    comparison: {
      yearOverYear: Record<string, ComparisonData>;
      monthOverMonth: Record<string, ComparisonData>;
    };
    overallSummary: OverallSummary;
  }>> {
    try {
      const response = await fetch(`${API_PREFIX}/analysis`, {
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
      console.error('获取成本分析数据失败:', error);
      return {
        success: false,
        data: {
          analysisData: [],
          costStructure: {
            drugCost: 0,
            materialCost: 0,
            examinationCost: 0,
            treatmentCost: 0,
            otherCost: 0
          },
          comparison: { yearOverYear: {}, monthOverMonth: {} },
          overallSummary: {
            totalAvgCost: 0,
            drugCostRatio: 0,
            materialCostRatio: 0,
            examinationCostRatio: 0,
            treatmentCostRatio: 0,
            insurancePaymentRatio: 0,
            personalPaymentRatio: 0,
            insuranceAvgPayment: 0,
            personalAvgPayment: 0,
          }
        },
        message: error instanceof Error ? error.message : '未知错误'
      };
    }
  }
};

// 筛选栏：开始/结束日期 + 科室多选（已移除医生筛选）
function FilterBar({
  startDate,
  endDate,
  loading,
  departments,
  selectedDeps,
  onChangeStartDate,
  onChangeEndDate,
  onChangeSelectedDeps,
  onSubmit,
  onReset,
}: {
  startDate: string;
  endDate: string;
  loading: boolean;
  departments: DepartmentOption[];
  selectedDeps: Set<string>;
  onChangeStartDate: (date: string) => void;
  onChangeEndDate: (date: string) => void;
  onChangeSelectedDeps: (deps: Set<string>) => void;
  onSubmit: (e?: React.FormEvent) => void;
  onReset: () => void;
}) {
  const departmentOptions = useMemo(
    () => departments.map(dept => ({ value: dept.id, label: dept.name })),
    [departments]
  );

  return (
    <form onSubmit={onSubmit}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 block">开始日期</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onChangeStartDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 block">结束日期</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onChangeEndDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
          />
        </div>

        <div className="space-y-2">
          <MultiSelect
            label="科室筛选"
            options={departmentOptions}
            selected={selectedDeps}
            onChange={onChangeSelectedDeps}
            placeholder="全部科室"
            searchPlaceholder="搜索科室…"
          />
        </div>

        <div className="flex items-end gap-2">
          <button
            type="submit"
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
            type="button"
            onClick={onReset}
            className="flex-1 px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200 font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            重置
          </button>
        </div>
      </div>
    </form>
  );
}

// 汇总卡片组件
function SummaryCards({
  analysisData,
  yearOverYear,
  monthOverMonth,
  overallSummary,
}: {
  analysisData: CostAnalysisData[];
  yearOverYear: Record<string, ComparisonData>;
  monthOverMonth: Record<string, ComparisonData>;
  overallSummary: OverallSummary | null;
}) {
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

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {indicators.map((indicator) => {
        const currentData = analysisData.length > 0 ? analysisData[analysisData.length - 1] : null;
        const yoyComparison = yearOverYear[indicator.key];
        const momComparison = monthOverMonth[indicator.key];

        let value: number | null = null;

        // 门急诊次均费用：使用 overallSummary.totalAvgCost（老接口口径）
        if (indicator.key === 'totalAvgCost') {
          if (overallSummary) {
            value = overallSummary.totalAvgCost;
          } else if (currentData) {
            value = currentData.totalAvgCost;
          }
        } else if (currentData) {
          value = currentData[indicator.key as keyof CostAnalysisData] as number;
        }

        const formattedValue =
          typeof value === 'number'
            ? value.toFixed(indicator.unit === '元' ? 2 : 1)
            : '--';

        return (
          <div key={indicator.key} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{indicator.name}</h3>
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: indicator.color }}
              ></div>
            </div>
            <div className="space-y-4">
              <div className="text-3xl font-bold text-gray-900">
                {value !== null ? (
                  <>
                    {formattedValue}
                    <span className="text-lg font-normal ml-1 text-gray-500">{indicator.unit}</span>
                  </>
                ) : (
                  <span className="text-gray-400">--</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">同比</div>
                  {yoyComparison ? (
                    <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getComparisonColor(yoyComparison.changeType)}`}>
                      <span className="mr-1">{getComparisonIcon(yoyComparison.changeType)}</span>
                      {Math.abs(yoyComparison.changeRate).toFixed(1)}%
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400">--</div>
                  )}
                </div>

                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">环比</div>
                  {momComparison ? (
                    <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getComparisonColor(momComparison.changeType)}`}>
                      <span className="mr-1">{getComparisonIcon(momComparison.changeType)}</span>
                      {Math.abs(momComparison.changeRate).toFixed(1)}%
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400">--</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

export default function OutpatientCostAnalysis() {
  const [analysisData, setAnalysisData] = useState<CostAnalysisData[]>([]);
  const [costStructure, setCostStructure] = useState<CostStructureData | null>(null);
  const [overallSummary, setOverallSummary] = useState<OverallSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>(
    indicators.map(ind => ind.key)
  );
  const [yearOverYear, setYearOverYear] = useState<Record<string, ComparisonData>>({});
  const [monthOverMonth, setMonthOverMonth] = useState<Record<string, ComparisonData>>({});

  // 筛选条件状态：开始日期 / 结束日期
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
  const [selectedDeps, setSelectedDeps] = useState<Set<string>>(new Set());

  // 初始化数据
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      setError('');
      try {
        const deptResponse = await costAnalysisApi.getDepartments();
        if (deptResponse.success) {
          setDepartments(deptResponse.data);
        } else {
          throw new Error(deptResponse.message || '获取科室列表失败');
        }

        await fetchData();
      } catch (err: any) {
        console.error('初始化失败:', err);
        setError(err?.message || '初始化数据失败');
      } finally {
        setLoading(false);
      }
    };

    void initData();
  }, []);

  // 获取数据
  const fetchData = async (override?: {
    startDate?: string;
    endDate?: string;
    selectedDeps?: Set<string>;
  }) => {
    setLoading(true);
    setError('');

    const finalStart = override?.startDate ?? startDate;
    const finalEnd = override?.endDate ?? endDate;
    const finalDeps = override?.selectedDeps ?? selectedDeps;

    try {
      const params: QueryParams = {
        startDate: finalStart,
        endDate: finalEnd,
        departments: finalDeps.size > 0 ? Array.from(finalDeps) : undefined
      };

      const response = await costAnalysisApi.getCostAnalysisData(params);

      if (response.success) {
        setAnalysisData(response.data.analysisData);
        setCostStructure(response.data.costStructure);
        setYearOverYear(response.data.comparison.yearOverYear);
        setMonthOverMonth(response.data.comparison.monthOverMonth);
        setOverallSummary(response.data.overallSummary || null);
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

      setAnalysisData([]);
      setCostStructure(null);
      setYearOverYear({});
      setMonthOverMonth({});
      setOverallSummary(null);
    } finally {
      setLoading(false);
    }
  };

  // 处理查询
  const handleQuery = async (e?: React.FormEvent) => {
    e?.preventDefault?.();
    setError('');
    if (!startDate || !endDate) {
      setError('请选择开始日期和结束日期');
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setError('开始日期不能晚于结束日期');
      return;
    }
    await fetchData();
  };

  // 处理重置：重置为本月第一天~今天
  const handleReset = () => {
    const d = new Date();
    const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
    const newStart = firstDay.toISOString().split('T')[0];
    const newEnd = d.toISOString().split('T')[0];
    const newDeps = new Set<string>();

    setStartDate(newStart);
    setEndDate(newEnd);
    setSelectedDeps(newDeps);
    setError('');

    void fetchData({
      startDate: newStart,
      endDate: newEnd,
      selectedDeps: newDeps,
    });
  };

  const toggleIndicator = (key: string) => {
    setSelectedIndicators(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  // 图表数据配置（这里保持用按日数据）
  const paymentBurdenData = {
    labels: ['医保支付', '个人支付'],
    datasets: [
      {
        data: analysisData.length > 0
          ? [analysisData[analysisData.length - 1].insurancePaymentRatio, analysisData[analysisData.length - 1].personalPaymentRatio]
          : [0, 0],
        backgroundColor: ['#36A2EB', '#FF6384'],
        hoverBackgroundColor: ['#36A2EB', '#FF6384']
      }
    ]
  };

  const costTrendData = {
    labels: analysisData.length > 0 ? analysisData.map(item => item.date) : [],
    datasets: [
      {
        label: '门急诊次均费用 (元)',
        data: analysisData.length > 0 ? analysisData.map(item => item.totalAvgCost) : [],
        borderColor: '#8B5CF6',
        backgroundColor: '#8B5CF620',
        fill: true,
        tension: 0.1
      }
    ]
  };

  const costChangeRateData = {
    labels: analysisData.length > 0 ? analysisData.map(item => item.date) : [],
    datasets: [
      {
        label: '费用变动率 (%)',
        data: analysisData.length > 0 ? analysisData.map(item => item.costChangeRate) : [],
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
        ] : [0, 0, 0, 0, 0],
        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'],
        hoverBackgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF']
      }
    ]
  };

  const costRatioTrendData = {
    labels: analysisData.length > 0 ? analysisData.map(item => item.date) : [],
    datasets: [
      {
        label: '药品费占比 (%)',
        data: analysisData.length > 0 ? analysisData.map(item => item.drugCostRatio) : [],
        borderColor: '#FF6384',
        backgroundColor: '#FF638420',
        fill: false
      },
      {
        label: '检查费占比 (%)',
        data: analysisData.length > 0 ? analysisData.map(item => item.examinationCostRatio) : [],
        borderColor: '#FFCE56',
        backgroundColor: '#FFCE5620',
        fill: false
      },
      {
        label: '材料费占比 (%)',
        data: analysisData.length > 0 ? analysisData.map(item => item.materialCostRatio) : [],
        borderColor: '#36A2EB',
        backgroundColor: '#36A2EB20',
        fill: false
      },
      {
        label: '治疗费占比 (%)',
        data: analysisData.length > 0 ? analysisData.map(item => item.treatmentCostRatio) : [],
        borderColor: '#4BC0C0',
        backgroundColor: '#4BC0C020',
        fill: false
      }
    ]
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* 页面标题 */}
      <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <h1 className="text-2xl font-bold text-gray-900">门急诊次均费用分析</h1>
            <p className="text-gray-600 text-sm mt-2">
              深入分析门急诊次均费用的构成、变化趋势、支付负担比例等关键指标
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
              <span className="text-lg">💰</span>
            </button>
          </div>
        </div>
      </header>

      {/* 错误提示 */}
      {error && <ErrorAlert message={error} />}

      {/* 筛选区域 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 text-left">数据筛选</h2>
        <FilterBar
          startDate={startDate}
          endDate={endDate}
          loading={loading}
          departments={departments}
          selectedDeps={selectedDeps}
          onChangeStartDate={setStartDate}
          onChangeEndDate={setEndDate}
          onChangeSelectedDeps={setSelectedDeps}
          onSubmit={handleQuery}
          onReset={handleReset}
        />
      </section>

      {/* 指标卡片（使用 overallSummary 对齐老口径） */}
      <SummaryCards
        analysisData={analysisData}
        yearOverYear={yearOverYear}
        monthOverMonth={monthOverMonth}
        overallSummary={overallSummary}
      />

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
            {analysisData.length > 0 ? (
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
            ) : (
              <div className="h-80 flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <div className="text-4xl mb-2">📊</div>
                  <p>暂无数据</p>
                  <p className="text-sm mt-1">请查询数据后查看图表</p>
                </div>
              </div>
            )}
          </div>

          {/* 费用趋势 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">门急诊次均费用趋势</h3>
            {analysisData.length > 0 ? (
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
            ) : (
              <div className="h-80 flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <div className="text-4xl mb-2">📈</div>
                  <p>暂无数据</p>
                  <p className="text-sm mt-1">请查询数据后查看图表</p>
                </div>
              </div>
            )}
          </div>

          {/* 费用变动率 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">门急诊次均费用变动率</h3>
            {analysisData.length > 0 ? (
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
            ) : (
              <div className="h-80 flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <div className="text-4xl mb-2">📉</div>
                  <p>暂无数据</p>
                  <p className="text-sm mt-1">请查询数据后查看图表</p>
                </div>
              </div>
            )}
          </div>

          {/* 费用构成 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">门急诊次均医药费用构成比例</h3>
            {costStructure ? (
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
            ) : (
              <div className="h-80 flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <div className="text-4xl mb-2">🥧</div>
                  <p>暂无数据</p>
                  <p className="text-sm mt-1">请查询数据后查看图表</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 费用占比趋势 */}
        <div className="mt-6 bg-gray-50 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">各项费用占比趋势分析</h3>
          {analysisData.length > 0 ? (
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
          ) : (
            <div className="h-80 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <div className="text-4xl mb-2">📊</div>
                <p>暂无数据</p>
                <p className="text-sm mt-1">请查询数据后查看图表</p>
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
