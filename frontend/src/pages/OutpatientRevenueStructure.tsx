import { useState, useEffect, useMemo } from 'react';
import { Pie, Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

// 数据结构定义
interface DrugCostStructure {
  westernMedicine: number; // 西药费
  chineseMedicine: number; // 中药费
  examinationFee: number;  // 检查费
  treatmentFee: number;    // 治疗费
  surgeryFee: number;      // 手术费
  materialFee: number;     // 材料费
  otherFee: number;        // 其他费用
}

interface DepartmentRevenueStructure {
  [departmentName: string]: number; // 动态科室名称和对应的收入占比
}

interface RevenueStructureData {
  drugCostStructure: DrugCostStructure; // 门诊患者医药费用详细构成
  departmentRevenueStructure: DepartmentRevenueStructure; // 门诊各科室收入详细构成
  totalRevenue: number; // 总收入，用于计算实际金额
}

interface ChartData {
  date: string;
  data: RevenueStructureData;
}

interface ComparisonData {
  current: number;
  previous: number;
  changeRate: number;
  changeType: 'increase' | 'decrease' | 'stable';
}

// 费用构成指标配置
const drugCostIndicators = [
  { key: 'westernMedicine', name: '西药费', color: '#3B82F6' },
  { key: 'chineseMedicine', name: '中药费', color: '#10B981' },
  { key: 'examinationFee', name: '检查费', color: '#F59E0B' },
  { key: 'treatmentFee', name: '治疗费', color: '#EF4444' },
  { key: 'surgeryFee', name: '手术费', color: '#8B5CF6' },
  { key: 'materialFee', name: '材料费', color: '#06B6D4' },
  { key: 'otherFee', name: '其他费用', color: '#64748B' }
];

// 图表类型定义
type ChartType = 'pie' | 'bar' | 'line' | 'stackedBar';
type DisplayMode = 'chart' | 'table';

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

// 后端接口类型定义
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  code?: number;
}

interface StructureQueryParams {
  startDate: string;
  endDate: string;
  departments?: string[];
}

interface DepartmentOption {
  id: string;
  name: string;
}

// 修正后的后端接口调用
const revenueDetailApi = {
  // 获取科室列表
  async getDepartments(): Promise<ApiResponse<DepartmentOption[]>> {
    try {
      console.log('正在请求科室列表...');
      const response = await fetch('/api/outpatient-revenue/departments', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('科室列表响应:', result);
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

  // 获取所有收入数据 - 合并请求
  async getRevenueData(params: StructureQueryParams): Promise<ApiResponse<{
    currentStats: RevenueStructureData;
    trendData: ChartData[];
    comparison: {
      yearOverYear: Record<string, ComparisonData>;
      monthOverMonth: Record<string, ComparisonData>;
    };
  }>> {
    try {
      console.log('正在请求收入数据:', params);
      const response = await fetch('/api/outpatient-revenue/revenue-structure', {
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
      console.log('收入数据响应:', result);
      return result;
    } catch (error) {
      console.error('获取收入数据失败:', error);
      return {
        success: false,
        data: {
          currentStats: {
            drugCostStructure: {
              westernMedicine: 0,
              chineseMedicine: 0,
              examinationFee: 0,
              treatmentFee: 0,
              surgeryFee: 0,
              materialFee: 0,
              otherFee: 0
            },
            departmentRevenueStructure: {},
            totalRevenue: 0
          },
          trendData: [],
          comparison: { yearOverYear: {}, monthOverMonth: {} }
        },
        message: error instanceof Error ? error.message : '未知错误'
      };
    }
  }
};

// 费用构成详细数据表格组件
function DrugCostTable({ data, totalRevenue }: { data: DrugCostStructure; totalRevenue: number }) {
  const totalDrugCost = Object.values(data).reduce((sum, value) => sum + value, 0);

  const tableData = drugCostIndicators.map(indicator => {
    const percentage = data[indicator.key as keyof DrugCostStructure];
    // 修复：正确的金额计算方式
    const amount = totalRevenue * (percentage / 100);
    const percentageInDrugCost = totalDrugCost > 0 ? (percentage / totalDrugCost) * 100 : 0;

    return {
      name: indicator.name,
      percentage,
      amount,
      percentageInDrugCost,
      color: indicator.color
    };
  });

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              费用项目
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              占总收入比例
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              实际金额
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              占医药费用比例
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              占比进度
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {tableData.map((item, index) => (
            <tr key={item.name} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center">
                  <div
                    className="w-3 h-3 rounded-full mr-3"
                    style={{ backgroundColor: item.color }}
                  ></div>
                  <span className="text-sm font-medium text-gray-900">{item.name}</span>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-semibold text-gray-900">{item.percentage.toFixed(2)}%</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-semibold text-blue-600">
                  ¥{item.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-gray-500">
                  (¥{(item.amount / 10000).toFixed(2)}万)
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">{item.percentageInDrugCost.toFixed(2)}%</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: item.color
                    }}
                  ></div>
                </div>
                <div className="text-xs text-gray-500 mt-1">{item.percentage.toFixed(1)}%</div>
              </td>
            </tr>
          ))}
          {/* 总计行 */}
          <tr className="bg-blue-50 font-semibold">
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">总计</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
              {totalDrugCost.toFixed(2)}%
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">
              ¥{(totalRevenue * totalDrugCost / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">100.00%</td>
            <td className="px-6 py-4 whitespace-nowrap">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-blue-600 transition-all duration-500"
                  style={{ width: `${totalDrugCost}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 mt-1">{totalDrugCost.toFixed(1)}%</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// 科室收入详细数据表格组件
function DepartmentRevenueTable({ data, totalRevenue }: { data: DepartmentRevenueStructure; totalRevenue: number }) {
  const tableData = Object.entries(data)
    .sort(([,a], [,b]) => b - a)
    .map(([department, percentage], index) => {
      const amount = totalRevenue * percentage / 100;

      return {
        rank: index + 1,
        department,
        percentage,
        amount
      };
    });

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-yellow-100 text-yellow-800';
      case 2:
        return 'bg-gray-100 text-gray-800';
      case 3:
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              排名
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              科室名称
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              收入占比
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              实际收入金额
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              占比进度
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {tableData.map((item, index) => (
            <tr key={item.department} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRankColor(item.rank)}`}>
                  第{item.rank}名
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">{item.department}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-semibold text-gray-900">{item.percentage.toFixed(2)}%</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-semibold text-blue-600">
                  ¥{item.amount.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">
                  (¥{(item.amount / 10000).toFixed(2)}万)
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="h-2 rounded-full bg-blue-600 transition-all duration-500"
                    style={{ width: `${item.percentage}%` }}
                  ></div>
                </div>
                <div className="text-xs text-gray-500 mt-1">{item.percentage.toFixed(1)}%</div>
              </td>
            </tr>
          ))}
          {/* 总计行 */}
          <tr className="bg-green-50 font-semibold">
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900" colSpan={2}>总计</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
              {Object.values(data).reduce((sum, percentage) => sum + percentage, 0).toFixed(2)}%
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">
              ¥{totalRevenue.toLocaleString()}
            </td>
            <td className="px-6 py-4 whitespace-nowrap">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-green-600 transition-all duration-500"
                  style={{ width: '100%' }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 mt-1">100.0%</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// 展示模式切换组件
function DisplayModeToggle({
  mode,
  onChange
}: {
  mode: DisplayMode;
  onChange: (mode: DisplayMode) => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        onClick={() => onChange('chart')}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          mode === 'chart'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        图表展示
      </button>
      <button
        onClick={() => onChange('table')}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          mode === 'table'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        详细数据
      </button>
    </div>
  );
}

// 汇总卡片组件
function SummaryCards({
  currentStats,
  yearOverYear,
  monthOverMonth
}: {
  currentStats: RevenueStructureData | null;
  yearOverYear: Record<string, ComparisonData>;
  monthOverMonth: Record<string, ComparisonData>;
}) {
  const indicators = [
    {
      key: 'totalRevenue',
      name: '期间总收入',
      color: '#3B82F6',
      unit: '万元',
      getValue: (stats: RevenueStructureData) => (stats.totalRevenue / 10000).toFixed(2),
      getYoyChange: (yoy: Record<string, ComparisonData>) => yoy.totalRevenue?.changeRate || 0,
      getMomChange: (mom: Record<string, ComparisonData>) => mom.totalRevenue?.changeRate || 0
    },
    {
      key: 'drugCostRatio',
      name: '医药费用占比',
      color: '#10B981',
      unit: '%',
      getValue: (stats: RevenueStructureData) => {
        const medicalRatio =
          stats.drugCostStructure.westernMedicine +
          stats.drugCostStructure.chineseMedicine +
          stats.drugCostStructure.materialFee;
        return medicalRatio.toFixed(1);
      },
      getYoyChange: (yoy: Record<string, ComparisonData>) => yoy.drugCostRatio?.changeRate || 0,
      getMomChange: (mom: Record<string, ComparisonData>) => mom.drugCostRatio?.changeRate || 0
    },
    {
      key: 'departmentCount',
      name: '涉及科室数量',
      color: '#EF4444',
      unit: '个',
      getValue: (stats: RevenueStructureData) =>
        Object.keys(stats.departmentRevenueStructure).length.toString(),
      getYoyChange: (yoy: Record<string, ComparisonData>) => yoy.departmentCount?.changeRate || 0,
      getMomChange: (mom: Record<string, ComparisonData>) => mom.departmentCount?.changeRate || 0
    }
  ];

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {indicators.map((indicator) => {
        const stat = currentStats ? indicator.getValue(currentStats) : null;
        const yoyChange = currentStats ? indicator.getYoyChange(yearOverYear) : 0;
        const momChange = currentStats ? indicator.getMomChange(monthOverMonth) : 0;

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
                {stat ? (
                  <>
                    {stat}
                    <span className="text-lg font-normal ml-1 text-gray-500">{indicator.unit}</span>
                  </>
                ) : (
                  <span className="text-gray-400">--</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">同比</div>
                  {yoyChange !== 0 ? (
                    <div className={`text-lg font-semibold ${
                      yoyChange > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {yoyChange > 0 ? '+' : ''}{yoyChange.toFixed(1)}%
                    </div>
                  ) : (
                    <div className="text-lg font-semibold text-gray-400">--</div>
                  )}
                </div>

                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">环比</div>
                  {momChange !== 0 ? (
                    <div className={`text-lg font-semibold ${
                      momChange > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {momChange > 0 ? '+' : ''}{momChange.toFixed(1)}%
                    </div>
                  ) : (
                    <div className="text-lg font-semibold text-gray-400">--</div>
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
  selectedDeps: Set<string>;
  onChangeStartDate: (date: string) => void;
  onChangeEndDate: (date: string) => void;
  onChangeSelectedDeps: (deps: Set<string>) => void;
  onSubmit: (e?: React.FormEvent) => void;
  onReset: () => void;
}) {
  const departmentOptions = useMemo(() =>
    departments.map(dept => ({ value: dept.id, label: dept.name })),
    [departments]
  );

  return (
    <form onSubmit={onSubmit}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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

        <div className="flex items-end gap-2 col-span-2">
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

export default function RevenueStructure() {
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [currentStats, setCurrentStats] = useState<RevenueStructureData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [drugChartType, setDrugChartType] = useState<ChartType>('pie');
  const [deptChartType, setDeptChartType] = useState<ChartType>('bar');
  const [drugDisplayMode, setDrugDisplayMode] = useState<DisplayMode>('chart');
  const [deptDisplayMode, setDeptDisplayMode] = useState<DisplayMode>('chart');
  const [yearOverYear, setYearOverYear] = useState<Record<string, ComparisonData>>({});
  const [monthOverMonth, setMonthOverMonth] = useState<Record<string, ComparisonData>>({});

  // 筛选条件状态
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // 当月第一天
    return d.toISOString().split('T')[0];
  });

  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });

  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [selectedDeps, setSelectedDeps] = useState<Set<string>>(new Set());

  // 初始化数据：获取科室列表和默认数据
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      setError('');
      try {
        console.log('开始初始化收入结构数据...');

        // 获取科室列表
        const deptResponse = await revenueDetailApi.getDepartments();
        if (deptResponse.success) {
          setDepartments(deptResponse.data);
          console.log('科室列表设置成功');
        } else {
          throw new Error(deptResponse.message || '获取科室列表失败');
        }

        // 获取初始数据
        await fetchData();

      } catch (err: any) {
        console.error('初始化失败:', err);
        setError(err?.message || '初始化数据失败');
      } finally {
        setLoading(false);
      }
    };

    initData();
  }, []);

  // 获取数据的主函数
  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      console.log('开始获取收入结构数据...');

      const params: StructureQueryParams = {
        startDate,
        endDate,
        departments: selectedDeps.size > 0 ? Array.from(selectedDeps) : undefined
      };

      console.log('请求参数:', JSON.stringify(params, null, 2));

      // 使用单个接口获取所有数据
      const response = await revenueDetailApi.getRevenueData(params);

      console.log('完整响应:', response);

      if (response.success) {
        setCurrentStats(response.data.currentStats);
        setChartData(response.data.trendData);
        setYearOverYear(response.data.comparison.yearOverYear);
        setMonthOverMonth(response.data.comparison.monthOverMonth);
      } else {
        throw new Error(response.message || '获取数据失败');
      }

    } catch (err: any) {
      console.error('获取数据失败:', err);
      // 更详细的错误信息
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

      // 清空数据
      setChartData([]);
      setCurrentStats(null);
      setYearOverYear({});
      setMonthOverMonth({});
    } finally {
      setLoading(false);
    }
  };

  // 处理查询
  const handleQuery = async (e?: React.FormEvent) => {
    e?.preventDefault?.();
    await fetchData();
  };

  // 处理重置
  const handleReset = () => {
    const d = new Date();
    const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
    setStartDate(firstDay.toISOString().split('T')[0]);
    setEndDate(d.toISOString().split('T')[0]);
    setSelectedDeps(new Set());
    setError('');
  };

  // 获取费用构成图表数据
  const getDrugCostChartData = () => {
    if (!currentStats) return { labels: [], datasets: [] };

    if (drugChartType === 'pie') {
      return {
        labels: drugCostIndicators.map(ind => ind.name),
        datasets: [
          {
            data: drugCostIndicators.map(ind => currentStats.drugCostStructure[ind.key as keyof DrugCostStructure]),
            backgroundColor: drugCostIndicators.map(ind => ind.color),
            borderColor: drugCostIndicators.map(ind => ind.color),
            borderWidth: 2,
          },
        ],
      };
    } else if (drugChartType === 'bar') {
      return {
        labels: drugCostIndicators.map(ind => ind.name),
        datasets: [
          {
            label: '费用占比 (%)',
            data: drugCostIndicators.map(ind => currentStats.drugCostStructure[ind.key as keyof DrugCostStructure]),
            backgroundColor: drugCostIndicators.map(ind => ind.color),
            borderColor: drugCostIndicators.map(ind => ind.color),
            borderWidth: 1,
          },
        ],
      };
    } else {
      // line 或 stackedBar 类型 - 使用趋势数据
      const labels = chartData.map(item => item.date);
      const datasets = drugCostIndicators.map(indicator => ({
        label: indicator.name,
        data: chartData.map(item => item.data.drugCostStructure[indicator.key as keyof DrugCostStructure]),
        borderColor: indicator.color,
        backgroundColor: drugChartType === 'stackedBar' ? indicator.color : indicator.color + '20',
        tension: 0.1,
        fill: drugChartType === 'line'
      }));

      return { labels, datasets };
    }
  };

  // 获取科室收入构成图表数据
  const getDeptRevenueChartData = () => {
    if (!currentStats) return { labels: [], datasets: [] };

    const departments = Object.keys(currentStats.departmentRevenueStructure);
    const values = Object.values(currentStats.departmentRevenueStructure);

    if (deptChartType === 'pie') {
      // 为饼图生成颜色
      const colors = [
        '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
        '#06B6D4', '#84CC16', '#F97316', '#8B5CF6', '#64748B'
      ];

      return {
        labels: departments,
        datasets: [
          {
            data: values,
            backgroundColor: colors.slice(0, departments.length),
            borderColor: colors.slice(0, departments.length),
            borderWidth: 2,
          },
        ],
      };
    } else if (deptChartType === 'bar') {
      return {
        labels: departments,
        datasets: [
          {
            label: '收入占比 (%)',
            data: values,
            backgroundColor: '#3B82F6',
            borderColor: '#3B5CF6',
            borderWidth: 1,
          },
        ],
      };
    } else {
      // line 或 stackedBar 类型 - 使用趋势数据
      const labels = chartData.map(item => item.date);
      const allDepartments = Array.from(
        new Set(chartData.flatMap(item => Object.keys(item.data.departmentRevenueStructure)))
      );

      const colors = [
        '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
        '#06B6D4', '#84CC16', '#F97316', '#8B5CF6', '#64748B'
      ];

      const datasets = allDepartments.map((dept, index) => ({
        label: dept,
        data: chartData.map(item => item.data.departmentRevenueStructure[dept] || 0),
        borderColor: colors[index % colors.length],
        backgroundColor: deptChartType === 'stackedBar' ? colors[index % colors.length] : colors[index % colors.length] + '20',
        tension: 0.1,
        fill: deptChartType === 'line'
      }));

      return { labels, datasets };
    }
  };

  // 获取图表选项
  const getChartOptions = (title: string, isStacked: boolean = false) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: title
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            return `${context.dataset.label || context.label}: ${context.parsed.y || context.parsed}%`;
          }
        }
      }
    },
    scales: isStacked ? {
      x: { stacked: true },
      y: {
        stacked: true,
        min: 0,
        max: 100
      }
    } : {
      y: {
        min: 0,
        max: 100
      }
    }
  });

  const getPieChartOptions = (title: string) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
      },
      title: {
        display: true,
        text: title
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            return `${context.label}: ${context.parsed}%`;
          }
        }
      }
    }
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* 页面标题 */}
      <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <h1 className="text-2xl font-bold text-gray-900">门急诊收入结构详细分析</h1>
            <p className="text-gray-600 text-sm mt-2">
              详细分析门急诊收入结构的各项指标，包括患者医药费用详细构成、各科室收入详细构成等关键数据
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
              <span className="text-lg">📊</span>
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

      {/* 汇总卡片 */}
      <SummaryCards
        currentStats={currentStats}
        yearOverYear={yearOverYear}
        monthOverMonth={monthOverMonth}
      />

      {/* 门诊患者医药费用构成 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 lg:mb-0">门诊患者医药费用构成</h2>

          <div className="flex items-center gap-4">
            {/* 展示模式切换 */}
            <DisplayModeToggle
              mode={drugDisplayMode}
              onChange={setDrugDisplayMode}
            />

            {/* 图表类型选择器 - 仅在图表模式下显示 */}
            {drugDisplayMode === 'chart' && (
              <>
                <span className="text-sm font-medium text-gray-700">图表类型：</span>
                <select
                  value={drugChartType}
                  onChange={(e) => setDrugChartType(e.target.value as ChartType)}
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                >
                  <option value="pie">饼图</option>
                  <option value="bar">柱状图</option>
                  <option value="line">趋势图</option>
                  <option value="stackedBar">堆叠柱状图</option>
                </select>
              </>
            )}
          </div>
        </div>

        {drugDisplayMode === 'chart' ? (
          <div className="h-[500px] flex items-center justify-center">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-500">加载数据中...</p>
                </div>
              </div>
            ) : currentStats ? (
              <div className="w-full h-full">
                {(drugChartType === 'line' || drugChartType === 'stackedBar') && chartData.length === 0 ? (
                  <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg w-full">
                    <div className="text-center">
                      <div className="text-6xl text-gray-300 mb-4">📊</div>
                      <p className="text-gray-500 mb-2 text-lg">暂无趋势数据</p>
                      <p className="text-gray-400">
                        趋势图和堆叠柱状图需要时间序列数据，请选择更长的日期范围
                      </p>
                    </div>
                  </div>
                ) : drugChartType === 'pie' ? (
                  <Pie
                    data={getDrugCostChartData()}
                    options={getPieChartOptions('门诊患者医药费用构成 (%)')}
                  />
                ) : drugChartType === 'bar' ? (
                  <Bar
                    data={getDrugCostChartData()}
                    options={getChartOptions('门诊患者医药费用构成 (%)')}
                  />
                ) : drugChartType === 'line' ? (
                  <Line
                    data={getDrugCostChartData()}
                    options={getChartOptions('门诊患者医药费用构成趋势 (%)')}
                  />
                ) : (
                  <Bar
                    data={getDrugCostChartData()}
                    options={getChartOptions('门诊患者医药费用构成 (%)', true)}
                  />
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg w-full">
                <div className="text-center">
                  <div className="text-6xl text-gray-300 mb-4">📊</div>
                  <p className="text-gray-500 mb-2 text-lg">暂无图表数据</p>
                  <p className="text-gray-400">
                    请选择日期范围并点击查询按钮加载数据
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          // 表格展示模式
          <div>
            {currentStats ? (
              <DrugCostTable
                data={currentStats.drugCostStructure}
                totalRevenue={currentStats.totalRevenue}
              />
            ) : (
              <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg w-full">
                <div className="text-center">
                  <div className="text-6xl text-gray-300 mb-4">📋</div>
                  <p className="text-gray-500 mb-2 text-lg">暂无统计数据</p>
                  <p className="text-gray-400">
                    请选择日期范围并点击查询按钮加载数据
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 门诊各科室收入构成 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 lg:mb-0">门诊各科室收入构成</h2>

          <div className="flex items-center gap-4">
            {/* 展示模式切换 */}
            <DisplayModeToggle
              mode={deptDisplayMode}
              onChange={setDeptDisplayMode}
            />

            {/* 图表类型选择器 - 仅在图表模式下显示 */}
            {deptDisplayMode === 'chart' && (
              <>
                <span className="text-sm font-medium text-gray-700">图表类型：</span>
                <select
                  value={deptChartType}
                  onChange={(e) => setDeptChartType(e.target.value as ChartType)}
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                >
                  <option value="pie">饼图</option>
                  <option value="bar">柱状图</option>
                  <option value="line">趋势图</option>
                  <option value="stackedBar">堆叠柱状图</option>
                </select>
              </>
            )}
          </div>
        </div>

        {deptDisplayMode === 'chart' ? (
          <div className="h-[500px] flex items-center justify-center">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-500">加载数据中...</p>
                </div>
              </div>
            ) : currentStats ? (
              <div className="w-full h-full">
                {(deptChartType === 'line' || deptChartType === 'stackedBar') && chartData.length === 0 ? (
                  <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg w-full">
                    <div className="text-center">
                      <div className="text-6xl text-gray-300 mb-4">📊</div>
                      <p className="text-gray-500 mb-2 text-lg">暂无趋势数据</p>
                      <p className="text-gray-400">
                        趋势图和堆叠柱状图需要时间序列数据，请选择更长的日期范围
                      </p>
                    </div>
                  </div>
                ) : deptChartType === 'pie' ? (
                  <Pie
                    data={getDeptRevenueChartData()}
                    options={getPieChartOptions('门诊各科室收入构成 (%)')}
                  />
                ) : deptChartType === 'bar' ? (
                  <Bar
                    data={getDeptRevenueChartData()}
                    options={getChartOptions('门诊各科室收入构成 (%)')}
                  />
                ) : deptChartType === 'line' ? (
                  <Line
                    data={getDeptRevenueChartData()}
                    options={getChartOptions('门诊各科室收入构成趋势 (%)')}
                  />
                ) : (
                  <Bar
                    data={getDeptRevenueChartData()}
                    options={getChartOptions('门诊各科室收入构成 (%)', true)}
                  />
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg w-full">
                <div className="text-center">
                  <div className="text-6xl text-gray-300 mb-4">📊</div>
                  <p className="text-gray-500 mb-2 text-lg">暂无图表数据</p>
                  <p className="text-gray-400">
                    请选择日期范围并点击查询按钮加载数据
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          // 表格展示模式
          <div>
            {currentStats ? (
              <DepartmentRevenueTable
                data={currentStats.departmentRevenueStructure}
                totalRevenue={currentStats.totalRevenue}
              />
            ) : (
              <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg w-full">
                <div className="text-center">
                  <div className="text-6xl text-gray-300 mb-4">📋</div>
                  <p className="text-gray-500 mb-2 text-lg">暂无统计数据</p>
                  <p className="text-gray-400">
                    请选择日期范围并点击查询按钮加载数据
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

    </div>
  );
}