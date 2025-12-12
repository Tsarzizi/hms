import { useState, useEffect } from 'react';
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

// 类型定义
interface DepartmentOption {
  id: string;
  name: string;
}

interface AdmissionDischargeData {
  admissionCount: number; // 入院人次
  dischargeCount: number; // 出院人次
  inpatientRatio: number; // 住院人头人次比
}

interface ChartData {
  date: string;
  data: AdmissionDischargeData;
}

interface SummaryData {
  totalAdmission: number;
  totalDischarge: number;
  totalInpatientRatio: number;
  // 新增同比环比字段
  admissionYoYChange: number | null;
  admissionMoMChange: number | null;
  dischargeYoYChange: number | null;
  dischargeMoMChange: number | null;
  inpatientRatioYoYChange: number | null;
  inpatientRatioMoMChange: number | null;
}

// API响应类型
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  code?: number;
}

// 严格按照表格定义的3个指标
const indicators = [
  {
    key: 'admissionCount',
    name: '入院人次',
    color: '#3B82F6',
    description: '某期居民到某医院办理入院的人次总数',
    unit: '人次'
  },
  {
    key: 'dischargeCount',
    name: '出院人次',
    color: '#10B981',
    description: '某期居民到某医院办理出院的人次总数',
    unit: '人次'
  },
  {
    key: 'inpatientRatio',
    name: '住院人头人次比',
    color: '#8B5CF6',
    description: '某期居民住院人数/某期居民住院人次数×100%',
    unit: '%'
  }
];

// 工具函数
function getToday(offset: number = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().split("T")[0];
}

function getLastMonth(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return date.toISOString().split("T")[0];
}

// API函数
async function fetchInitAPI(): Promise<any> {
  try {
    const response = await fetch('/api/admission-discharge/init', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result: ApiResponse<any> = await response.json();

    if (!result.success) {
      throw new Error(result.message || '初始化失败');
    }

    return result.data;
  } catch (error) {
    console.error('初始化失败:', error);
    throw error;
  }
}

async function fetchSummaryAPI(params: {
  start: string;
  end: string;
  deps: string[] | null;
}): Promise<SummaryData> {
  try {
    const response = await fetch('/api/admission-discharge/summary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
      },
      body: JSON.stringify({
        startDate: params.start,
        endDate: params.end,
        departments: params.deps
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result: ApiResponse<SummaryData> = await response.json();

    if (!result.success) {
      throw new Error(result.message || '获取汇总数据失败');
    }

    return result.data;
  } catch (error) {
    console.error('获取汇总数据失败:', error);
    throw error;
  }
}

async function fetchChartDataAPI(params: {
  start: string;
  end: string;
  deps: string[] | null;
}): Promise<ChartData[]> {
  try {
    const response = await fetch('/api/admission-discharge/chart-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
      },
      body: JSON.stringify({
        startDate: params.start,
        endDate: params.end,
        departments: params.deps
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result: ApiResponse<ChartData[]> = await response.json();

    if (!result.success) {
      throw new Error(result.message || '获取图表数据失败');
    }

    return result.data;
  } catch (error) {
    console.error('获取图表数据失败:', error);
    throw error;
  }
}

// 筛选栏组件
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
  selectedDeps: string[];
  onChangeStartDate: (date: string) => void;
  onChangeEndDate: (date: string) => void;
  onChangeSelectedDeps: (deps: string[]) => void;
  onSubmit: (e?: React.FormEvent) => void;
  onReset: () => void;
}) {
  return (
    <form onSubmit={onSubmit}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
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
          <label className="text-sm font-medium text-gray-700 block">科室筛选</label>
          <select
            value={selectedDeps[0] || ''}
            onChange={(e) => onChangeSelectedDeps(e.target.value ? [e.target.value] : [])}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">全部科室</option>
            {departments.map(dept => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end gap-2 col-span-3">
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

function SummaryCards({ summary }: { summary: SummaryData | null }) {
  // 格式化变化率：将小数转换为百分比显示，如 0.1 => "+10%"
  const formatChange = (value: number | null) => {
    if (value === null || value === undefined) return "--";

    // 转换为百分比，保留1位小数
    const percent = (value * 100).toFixed(1);

    // 添加正负号
    if (value > 0) {
      return `+${percent}%`;
    } else if (value < 0) {
      return `${percent}%`; // 负数自带负号
    } else {
      return "0%";
    }
  };

  // 根据指标键获取对应的同比环比值
  const getChangeValues = (key: string) => {
    if (!summary) return { yoy: null, mom: null };

    switch (key) {
      case 'admissionCount':
        return {
          yoy: summary.admissionYoYChange,
          mom: summary.admissionMoMChange
        };
      case 'dischargeCount':
        return {
          yoy: summary.dischargeYoYChange,
          mom: summary.dischargeMoMChange
        };
      case 'inpatientRatio':
        return {
          yoy: summary.inpatientRatioYoYChange,
          mom: summary.inpatientRatioMoMChange
        };
      default:
        return { yoy: null, mom: null };
    }
  };

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {indicators.map((indicator) => {
        let value: number | null = null;
        if (summary) {
          switch (indicator.key) {
            case 'admissionCount':
              value = summary.totalAdmission;
              break;
            case 'dischargeCount':
              value = summary.totalDischarge;
              break;
            case 'inpatientRatio':
              value = summary.totalInpatientRatio;
              break;
          }
        }

        const changes = getChangeValues(indicator.key);

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
                    {value.toLocaleString()}
                    <span className="text-lg font-normal ml-1 text-gray-500">{indicator.unit}</span>
                  </>
                ) : (
                  <span className="text-gray-400">--</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">同比</div>
                  <div className={`text-lg font-semibold ${
                    changes.yoy === null ? 'text-gray-400' : 
                    changes.yoy > 0 ? 'text-green-600' : 
                    changes.yoy < 0 ? 'text-red-600' : 'text-gray-600'
                  }`}>
                    {formatChange(changes.yoy)}
                  </div>
                </div>

                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">环比</div>
                  <div className={`text-lg font-semibold ${
                    changes.mom === null ? 'text-gray-400' : 
                    changes.mom > 0 ? 'text-green-600' : 
                    changes.mom < 0 ? 'text-red-600' : 'text-gray-600'
                  }`}>
                    {formatChange(changes.mom)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function DetailsTable({
  rows,
}: {
  rows: ChartData[];
}) {
  if (rows.length === 0) {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">入院人次</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">出院人次</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">住院人头人次比(%)</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            <tr>
              <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                <div className="text-4xl mb-2">🗃️</div>
                <p className="text-lg mb-1">暂无详细数据</p>
                <p className="text-sm text-gray-400">
                  请选择日期范围并点击查询按钮加载数据
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">入院人次</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">出院人次</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">住院人头人次比(%)</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {rows.map((row, index) => (
            <tr key={row.date} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {row.date}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {row.data.admissionCount.toLocaleString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {row.data.dischargeCount.toLocaleString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {row.data.inpatientRatio.toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrendSection({
  chartData,
  selectedIndicators,
  loading,
}: {
  chartData: ChartData[];
  selectedIndicators: string[];
  loading: boolean;
}) {
  const getChartOptions = () => ({
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: '出入院人次指标趋势图'
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
        }
      }
    }
  });

  const getChartData = () => {
    const labels = chartData.map(item => item.date);
    const datasets = indicators
      .filter(indicator => selectedIndicators.includes(indicator.key))
      .map(indicator => ({
        label: indicator.name,
        data: chartData.map(item => item.data[indicator.key as keyof AdmissionDischargeData]),
        borderColor: indicator.color,
        backgroundColor: indicator.color + '20',
        tension: 0.1
      }));

    return { labels, datasets };
  };

  return (
    <div className="space-y-6">
      {/* 指标选择器 */}
      <div className="mb-6">
        <div className="flex items-center mb-3">
          <span className="text-sm text-gray-600 mr-3">显示指标：</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {indicators.map((indicator) => (
            <div
              key={indicator.key}
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                selectedIndicators.includes(indicator.key)
                  ? 'text-white'
                  : 'bg-gray-100 text-gray-600'
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
            </div>
          ))}
        </div>
      </div>

      {/* 图表区域 */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h4 className="text-md font-semibold text-gray-900 mb-4">出入院人次趋势图表</h4>
        <div className="h-80">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-500">加载数据中...</p>
              </div>
            </div>
          ) : chartData.length > 0 ? (
            <Line data={getChartData()} options={getChartOptions()} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-4xl mb-2">📊</div>
                <p className="text-gray-500 mb-2">暂无图表数据</p>
                <p className="text-sm text-gray-400">
                  请选择日期范围并查询数据
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 图例 */}
        <div className="flex justify-center mt-4 gap-6">
          {indicators
            .filter(indicator => selectedIndicators.includes(indicator.key))
            .map(indicator => (
              <div key={indicator.key} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: indicator.color }}
                ></div>
                <span className="text-sm text-gray-600">{indicator.name}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function Toolbar({
  viewMode,
  onChangeView,
}: {
  viewMode: 'details' | 'chart';
  onChangeView: (view: 'details' | 'chart') => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        onClick={() => onChangeView('details')}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          viewMode === 'details'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        详情数据
      </button>
      <button
        onClick={() => onChangeView('chart')}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          viewMode === 'chart'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        趋势分析
      </button>
    </div>
  );
}

// 主组件
export default function AdmissionDischarge() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [selectedIndicators] = useState<string[]>(
    ['admissionCount', 'dischargeCount', 'inpatientRatio']
  );

  const [viewMode, setViewMode] = useState<'details' | 'chart'>('details');

  const todayStr = getToday(0);
  const lastMonthStr = getLastMonth();
  const [startDate, setStartDate] = useState(lastMonthStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [selectedDeps, setSelectedDeps] = useState<string[]>([]);

  // 初始化
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        console.log('开始初始化出入院人次数据...');
        const data = await fetchInitAPI();

        setDepartments(Array.isArray(data?.departments) ? data.departments : []);
        console.log('科室列表加载完成:', data?.departments?.length || 0);

        // 初始化时加载最近一个月的数据
        await loadSummaryData(lastMonthStr, todayStr, null);
        await loadChartData(lastMonthStr, todayStr, null);

        console.log('初始化完成');
      } catch (e: any) {
        console.error('初始化失败:', e);
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, []);

  // 加载汇总数据
  const loadSummaryData = async (start: string, end: string, deps: string[] | null) => {
    try {
      const data = await fetchSummaryAPI({ start, end, deps });
      setSummaryData(data);
    } catch (error) {
      console.error('加载汇总数据失败:', error);
      throw error;
    }
  };

  // 加载图表数据
  const loadChartData = async (start: string, end: string, deps: string[] | null) => {
    try {
      const data = await fetchChartDataAPI({ start, end, deps });
      setChartData(data);
    } catch (error) {
      console.error('加载图表数据失败:', error);
      throw error;
    }
  };

  // 提交筛选
  const onSubmitSummary = async (e?: React.FormEvent) => {
    e?.preventDefault?.();
    setError("");
    if (!startDate) {
      setError("请选择开始日期");
      return;
    }
    if (!endDate) {
      setError("请选择结束日期");
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setError("开始日期不能晚于结束日期");
      return;
    }

    try {
      setLoading(true);
      const deps = selectedDeps.length ? selectedDeps : null;

      await Promise.all([
        loadSummaryData(startDate, endDate, deps),
        loadChartData(startDate, endDate, deps)
      ]);
      console.log('筛选查询完成');
    } catch (e: any) {
      console.error('筛选查询失败:', e);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  // 重置
  const onReset = async () => {
    console.log('执行重置操作');
    const today = getToday(0);
    const lastMonth = getLastMonth();
    setStartDate(lastMonth);
    setEndDate(today);
    setSelectedDeps([]);
    setError("");

    setLoading(true);
    try {
      await Promise.all([
        loadSummaryData(lastMonth, today, null),
        loadChartData(lastMonth, today, null)
      ]);
      console.log('重置操作完成');
    } catch (e: any) {
      console.error('重置操作失败:', e);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* 页面标题 */}
      <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <h1 className="text-2xl font-bold text-gray-900">出入院人次统计分析</h1>
            <p className="text-gray-600 text-sm mt-2">
              监控和分析住院服务的出入院人次指标，包括入院人次、出院人次、住院人头人次比等核心数据
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
              <span className="text-lg">🏥</span>
            </button>
          </div>
        </div>
      </header>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="text-red-600 mr-3">⚠️</div>
            <div className="text-red-800">
              <p className="font-medium">请求失败</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

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
          onSubmit={onSubmitSummary}
          onReset={onReset}
        />
      </section>

      {/* 汇总卡片 */}
      <SummaryCards summary={summaryData} />

      {/* 工具栏 + 数据详情 / 趋势分析区域 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 lg:mb-0">
            {viewMode === "details" ? "详情数据" : "趋势分析图表"}
          </h2>
          <Toolbar
            viewMode={viewMode}
            onChangeView={setViewMode}
          />
        </div>

        {/* 数据详情 */}
        <div className={viewMode === "chart" ? "hidden" : ""}>
          <DetailsTable rows={chartData} />
        </div>

        {/* 趋势分析 */}
        <div className={viewMode === "details" ? "hidden" : ""}>
          <TrendSection
            chartData={chartData}
            selectedIndicators={selectedIndicators}
            loading={loading}
          />
        </div>
      </section>

      {/* 数据说明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <div className="text-blue-600 mr-2 mt-0.5">ℹ️</div>
          <div className="text-blue-800 text-sm">
            <p className="font-medium mb-1">指标说明：</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li><strong>入院人次：</strong>某期居民到某医院办理入院的人次总数</li>
              <li><strong>出院人次：</strong>某期居民到某医院办理出院的人次总数</li>
              <li><strong>住院人头人次比：</strong>某期居民住院人数/某期居民住院人次数×100%</li>
              <li>数据来源于PostgreSQL数据库，实时更新</li>
              <li>可通过日期范围和科室筛选查看不同维度的数据</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}