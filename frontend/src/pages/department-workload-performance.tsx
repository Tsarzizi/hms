import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const API_BASE = "/api/hospital-performance";
const PAGE_SIZE = 20;

/** ---------- 模拟数据生成 ---------- */
const DEPARTMENT_CATEGORIES = ['临床科室', '医技科室', '行政科室', '护理单元'];
const DEPARTMENT_TYPES = ['内科', '外科', '妇产科', '儿科', '放射科', '检验科', '药剂科', '行政'];
const DEPARTMENT_NAMES = [
  '心血管内科', '神经内科', '消化内科', '呼吸内科', '内分泌科',
  '普外科', '骨科', '神经外科', '泌尿外科', '胸外科',
  '妇产科', '儿科', '新生儿科', '急诊科', 'ICU',
  '放射科', 'CT室', 'MRI室', '超声科', '检验科',
  '药剂科', '手术室', '麻醉科', '病理科', '输血科'
];

// 生成随机绩效数据
function generateMockPerformanceData(
  date: string,
  categoryFilter: string,
  typeFilter: string,
  nameFilter: string,
  page: number,
  pageSize: number
): { records: PerformanceRecord[], summary: SummaryData, totalPages: number } {
  const filteredRecords: PerformanceRecord[] = [];
  const totalRecords = 156; // 模拟总记录数

  // 生成当前页的数据
  for (let i = 0; i < pageSize; i++) {
    const index = (page - 1) * pageSize + i;
    if (index >= totalRecords) break;

    const departmentCategory = DEPARTMENT_CATEGORIES[Math.floor(Math.random() * DEPARTMENT_CATEGORIES.length)];
    const type = DEPARTMENT_TYPES[Math.floor(Math.random() * DEPARTMENT_TYPES.length)];
    const departmentName = DEPARTMENT_NAMES[Math.floor(Math.random() * DEPARTMENT_NAMES.length)];

    // 应用筛选条件
    if (categoryFilter && departmentCategory !== categoryFilter) continue;
    if (typeFilter && type !== typeFilter) continue;
    if (nameFilter && departmentName !== nameFilter) continue;

    const staffCount = Math.floor(Math.random() * 30) + 5;
    const settlementIncome = Math.floor(Math.random() * 5000000) + 1000000;
    const directCost = Math.floor(settlementIncome * (0.3 + Math.random() * 0.3));
    const totalPerformance = settlementIncome - directCost;
    const perCapitaPerformance = Math.round(totalPerformance / staffCount);
    const inpatientWorkloadPoints = Math.floor(Math.random() * 10000) + 5000;
    const workloadUnitPrice = 15 + Math.random() * 10;
    const workloadCoefficient = 0.8 + Math.random() * 0.4;
    const inpatientWorkloadPerformance = Math.round(inpatientWorkloadPoints * workloadUnitPrice * workloadCoefficient);

    filteredRecords.push({
      id: `record-${index}`,
      departmentCategory,
      type,
      departmentName,
      staffCount,
      settlementIncome,
      directCost,
      totalPerformance,
      perCapitaPerformance,
      inpatientWorkloadPoints,
      workloadUnitPrice,
      workloadCoefficient,
      inpatientWorkloadPerformance
    });
  }

  // 计算汇总数据
  const summary: SummaryData = {
    totalStaffCount: filteredRecords.reduce((sum, record) => sum + record.staffCount, 0),
    totalSettlementIncome: filteredRecords.reduce((sum, record) => sum + record.settlementIncome, 0),
    totalDirectCost: filteredRecords.reduce((sum, record) => sum + record.directCost, 0),
    totalPerformance: filteredRecords.reduce((sum, record) => sum + record.totalPerformance, 0),
    totalPerCapitaPerformance: filteredRecords.length > 0
      ? Math.round(filteredRecords.reduce((sum, record) => sum + record.totalPerformance, 0) /
                  filteredRecords.reduce((sum, record) => sum + record.staffCount, 0))
      : 0,
    totalInpatientWorkloadPoints: filteredRecords.reduce((sum, record) => sum + record.inpatientWorkloadPoints, 0),
    totalInpatientWorkloadPerformance: filteredRecords.reduce((sum, record) => sum + record.inpatientWorkloadPerformance, 0)
  };

  return {
    records: filteredRecords,
    summary,
    totalPages: Math.ceil(totalRecords / pageSize)
  };
}

// 模拟API延迟
const mockDelay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** ---------- 模拟API调用 ---------- */
const mockAPI = {
  // 获取部门类别
  async getDepartmentCategories(): Promise<string[]> {
    await mockDelay(300);
    return DEPARTMENT_CATEGORIES;
  },

  // 获取部门类型
  async getDepartmentTypes(): Promise<string[]> {
    await mockDelay(300);
    return DEPARTMENT_TYPES;
  },

  // 获取部门名称
  async getDepartmentNames(): Promise<string[]> {
    await mockDelay(300);
    return DEPARTMENT_NAMES;
  },

  // 获取绩效数据
  async getPerformanceData(params: {
    date: string;
    page: number;
    pageSize: number;
    departmentCategory?: string;
    departmentType?: string;
    departmentName?: string;
  }): Promise<{ records: PerformanceRecord[], summary: SummaryData, totalPages: number }> {
    await mockDelay(500);
    return generateMockPerformanceData(
      params.date,
      params.departmentCategory || '',
      params.departmentType || '',
      params.departmentName || '',
      params.page,
      params.pageSize
    );
  },

  // 获取趋势数据
  async getTrendData(months: number): Promise<any[]> {
    await mockDelay(400);
    const trendData = [];
    const currentDate = new Date();

    // 基础值
    let basePerformance = 20000000;
    let baseIncome = 30000000;
    let baseStaff = 800;

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(currentDate);
      date.setMonth(date.getMonth() - i);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');

      // 添加一些随机波动和趋势
      const performanceVariation = (Math.random() - 0.5) * 0.2; // ±10% 波动
      const incomeVariation = (Math.random() - 0.5) * 0.15; // ±7.5% 波动
      const staffVariation = (Math.random() - 0.5) * 0.05; // ±2.5% 波动

      // 轻微的增长趋势
      basePerformance *= (1 + 0.02 + performanceVariation);
      baseIncome *= (1 + 0.015 + incomeVariation);
      baseStaff *= (1 + 0.005 + staffVariation);

      trendData.push({
        month: `${year}-${month}`,
        totalPerformance: Math.round(basePerformance),
        totalSettlementIncome: Math.round(baseIncome),
        totalStaffCount: Math.round(baseStaff)
      });
    }

    return trendData;
  },

  // 导出Excel
  async exportData(params: {
    date: string;
    departmentCategory?: string;
    departmentType?: string;
    departmentName?: string;
  }): Promise<Blob> {
    await mockDelay(1000);
    // 创建一个模拟的Blob对象用于下载
    const mockData = JSON.stringify({
      date: params.date,
      filters: {
        departmentCategory: params.departmentCategory,
        departmentType: params.departmentType,
        departmentName: params.departmentName
      },
      message: "这是模拟的Excel文件下载"
    });
    return new Blob([mockData], { type: 'application/vnd.ms-excel' });
  }
};

/** ---------- 工具函数 ---------- */
function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatCurrency(amount: number) {
  return `￥${amount?.toLocaleString() || '0'}`;
}

function formatPercent(value: number) {
  if (value === undefined || value === null) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/** ---------- 类型定义 ---------- */
interface PerformanceRecord {
  id: string;
  departmentCategory: string;
  type: string;
  departmentName: string;
  staffCount: number;
  settlementIncome: number;
  directCost: number;
  totalPerformance: number;
  perCapitaPerformance: number;
  inpatientWorkloadPoints: number;
  workloadUnitPrice: number;
  workloadCoefficient: number;
  inpatientWorkloadPerformance: number;
}

interface SummaryData {
  totalStaffCount: number;
  totalSettlementIncome: number;
  totalDirectCost: number;
  totalPerformance: number;
  totalPerCapitaPerformance: number;
  totalInpatientWorkloadPoints: number;
  totalInpatientWorkloadPerformance: number;
}

/** ---------- 趋势图表组件 ---------- */
function TrendChart({ data }: { data: any[] }) {
  if (data.length === 0) {
    return (
      <div className="h-80 bg-gray-50 rounded-lg flex items-center justify-center text-gray-400">
        暂无趋势数据
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart
        data={data}
        margin={{
          top: 5,
          right: 30,
          left: 20,
          bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => value.split('-')[1] + '月'}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => `￥${(value / 10000).toFixed(0)}万`}
        />
        <Tooltip
          formatter={(value: number, name: string) => {
            if (name === 'totalStaffCount') {
              return [value, '人员数量'];
            }
            return [`￥${(value as number).toLocaleString()}`, name === 'totalPerformance' ? '绩效总额' : '结算收入'];
          }}
          labelFormatter={(label) => `${label.split('-')[0]}年${label.split('-')[1]}月`}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="totalPerformance"
          name="绩效总额"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
          activeDot={{ r: 6, fill: '#1d4ed8' }}
        />
        <Line
          type="monotone"
          dataKey="totalSettlementIncome"
          name="结算收入"
          stroke="#10b981"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="totalStaffCount"
          name="人员数量"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** ---------- 同比环比卡片组件 ---------- */
function GrowthCard({
  title,
  currentValue,
  previousValue,
  type = 'currency'
}: {
  title: string;
  currentValue: number;
  previousValue: number;
  type?: 'currency' | 'percent' | 'number';
}) {
  const growth = previousValue !== 0 ? ((currentValue - previousValue) / previousValue) * 100 : 0;
  const trend = growth > 0 ? 'up' : growth < 0 ? 'down' : 'neutral';

  const trendColors = {
    up: "text-green-600 bg-green-100",
    down: "text-red-600 bg-red-100",
    neutral: "text-gray-600 bg-gray-100"
  };

  const formatValue = (value: number) => {
    if (type === 'currency') return formatCurrency(value);
    if (type === 'percent') return `${value.toFixed(1)}%`;
    return value.toLocaleString();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="text-sm font-medium text-gray-700 mb-2">{title}</div>
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <div className="text-xl font-bold text-gray-900">
            {formatValue(currentValue)}
          </div>
          <div className="text-sm text-gray-500">
            上月: {formatValue(previousValue)}
          </div>
        </div>
        <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${trendColors[trend]}`}>
          {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
          {formatPercent(growth)}
        </div>
      </div>
    </div>
  );
}

/** ---------- 主组件 ---------- */
export default function HospitalPerformanceDetail() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 筛选条件
  const [selectedDate, setSelectedDate] = useState(getCurrentMonth());
  const [departmentCategory, setDepartmentCategory] = useState("");
  const [departmentType, setDepartmentType] = useState("");
  const [departmentName, setDepartmentName] = useState("");

  // 分页
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageInput, setPageInput] = useState("1");

  // 数据
  const [performanceData, setPerformanceData] = useState<PerformanceRecord[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData>({
    totalStaffCount: 0,
    totalSettlementIncome: 0,
    totalDirectCost: 0,
    totalPerformance: 0,
    totalPerCapitaPerformance: 0,
    totalInpatientWorkloadPoints: 0,
    totalInpatientWorkloadPerformance: 0
  });

  // 筛选选项
  const [departmentCategories, setDepartmentCategories] = useState<string[]>([]);
  const [departmentTypes, setDepartmentTypes] = useState<string[]>([]);
  const [departmentNames, setDepartmentNames] = useState<string[]>([]);

  // 趋势数据
  const [trendData, setTrendData] = useState<any[]>([]);

  // 初始化数据
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      try {
        // 使用模拟API获取筛选选项
        const categoriesData = await mockAPI.getDepartmentCategories();
        setDepartmentCategories(categoriesData);

        const typesData = await mockAPI.getDepartmentTypes();
        setDepartmentTypes(typesData);

        const namesData = await mockAPI.getDepartmentNames();
        setDepartmentNames(namesData);

        await fetchPerformanceData();
        await fetchTrendData();

      } catch (e: any) {
        setError(e?.message || "数据加载失败");
      } finally {
        setLoading(false);
      }
    };
    initData();
  }, []);

  // 获取绩效数据
  const fetchPerformanceData = async () => {
    try {
      const data = await mockAPI.getPerformanceData({
        date: selectedDate,
        page: currentPage,
        pageSize: PAGE_SIZE,
        departmentCategory,
        departmentType,
        departmentName
      });
      setPerformanceData(data.records);
      setSummaryData(data.summary);
      setTotalPages(data.totalPages);
      setPageInput(currentPage.toString());
    } catch (e: any) {
      setError(e?.message || "获取绩效数据失败");
    }
  };

  // 获取趋势数据
  const fetchTrendData = async () => {
    try {
      const data = await mockAPI.getTrendData(12);
      setTrendData(data);
    } catch (e: any) {
      console.error("获取趋势数据失败:", e);
    }
  };

  // 查询数据
  const handleQuery = async () => {
    setLoading(true);
    setCurrentPage(1);
    try {
      await fetchPerformanceData();
    } catch (e: any) {
      setError(e?.message || "查询数据失败");
    } finally {
      setLoading(false);
    }
  };

  // 下载Excel
  const handleDownload = async () => {
    try {
      const blob = await mockAPI.exportData({
        date: selectedDate,
        departmentCategory,
        departmentType,
        departmentName
      });

      // 创建下载链接
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `全院绩效明细_${selectedDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e: any) {
      setError(e?.message || "下载失败");
    }
  };

  // 刷新数据
  const handleRefresh = () => {
    fetchPerformanceData();
  };

  // 分页操作
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      setTimeout(() => fetchPerformanceData(), 0);
    }
  };

  // 跳转到指定页
  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInput(e.target.value);
  };

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(pageInput);
    if (pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum);
      setTimeout(() => fetchPerformanceData(), 0);
    }
  };

  // 重置筛选
  const handleReset = () => {
    setDepartmentCategory("");
    setDepartmentType("");
    setDepartmentName("");
    setCurrentPage(1);
  };

  // 计算同比环比数据（模拟）
  const growthData = useMemo(() => {
    const totalPerformance = summaryData.totalPerformance;
    const totalSettlementIncome = summaryData.totalSettlementIncome;
    const totalStaffCount = summaryData.totalStaffCount;
    const perCapitaPerformance = summaryData.totalPerCapitaPerformance;

    return {
      performanceGrowth: {
        current: totalPerformance,
        previous: totalPerformance * 0.95
      },
      incomeGrowth: {
        current: totalSettlementIncome,
        previous: totalSettlementIncome * 1.02
      },
      staffGrowth: {
        current: totalStaffCount,
        previous: totalStaffCount * 0.98
      },
      perCapitaGrowth: {
        current: perCapitaPerformance,
        previous: perCapitaPerformance * 1.03
      }
    };
  }, [summaryData]);

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* 顶部导航 */}
      <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <h1 className="text-2xl font-bold text-gray-900">全院绩效明细</h1>
            <p className="text-gray-600 mt-1">
              全院各科室绩效数据明细查询与分析
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors duration-200">
              <span className="text-lg">🔔</span>
            </button>
          </div>
        </div>
      </header>

      {/* 筛选区域 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 text-left">数据筛选</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">绩效月份</label>
            <input
              type="month"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">绩效科室类别</label>
            <select
              value={departmentCategory}
              onChange={(e) => setDepartmentCategory(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
            >
              <option value="">全部类别</option>
              {departmentCategories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">类型</label>
            <select
              value={departmentType}
              onChange={(e) => setDepartmentType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
            >
              <option value="">全部类型</option>
              {departmentTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">绩效科室名称</label>
            <select
              value={departmentName}
              onChange={(e) => setDepartmentName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
            >
              <option value="">全部科室</option>
              {departmentNames.map(name => (
                <option key={name} value={name}>{name}</option>
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
              onClick={handleDownload}
              className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200 font-medium flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              下载
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors duration-200 font-medium"
            >
              重置
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center">
          <span className="text-lg mr-2">⚠️</span>
          {error}
        </div>
      )}

      {/* 同比环比数据 */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <GrowthCard
          title="绩效总额环比"
          currentValue={growthData.performanceGrowth.current}
          previousValue={growthData.performanceGrowth.previous}
          type="currency"
        />
        <GrowthCard
          title="结算收入同比"
          currentValue={growthData.incomeGrowth.current}
          previousValue={growthData.incomeGrowth.previous}
          type="currency"
        />
        <GrowthCard
          title="人员数量环比"
          currentValue={growthData.staffGrowth.current}
          previousValue={growthData.staffGrowth.previous}
          type="number"
        />
        <GrowthCard
          title="人均绩效同比"
          currentValue={growthData.perCapitaGrowth.current}
          previousValue={growthData.perCapitaGrowth.previous}
          type="currency"
        />
      </section>

      {/* 趋势分析图表 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 text-left">绩效趋势分析</h2>
        <TrendChart data={trendData} />
      </section>

      {/* 数据表格 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">绩效明细数据</h2>
          <button
            onClick={handleRefresh}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            title="刷新数据"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-gray-900 min-w-[1200px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[120px]">绩效科室类别</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[100px]">类型</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[150px]">绩效科室名称</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[80px]">人数</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[120px]">结算收入</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[120px]">科室直接成本</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[120px]">绩效总额</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[100px]">人均绩效</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[120px]">住院工作量点数</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[100px]">工作量单价</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[100px]">工作量系数</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[120px]">住院工作量绩效</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {performanceData.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center">
                      <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span>暂无数据</span>
                    </div>
                  </td>
                </tr>
              ) : (
                <>
                  {performanceData.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50 transition-colors duration-150">
                      <td className="px-4 py-3 text-gray-600">{record.departmentCategory}</td>
                      <td className="px-4 py-3 text-gray-600">{record.type}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{record.departmentName}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-900">{record.staffCount}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-gray-900">
                          {formatCurrency(record.settlementIncome)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-gray-900">
                          {formatCurrency(record.directCost)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-blue-600">
                          {formatCurrency(record.totalPerformance)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-green-600">
                          {formatCurrency(record.perCapitaPerformance)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-900">{record.inpatientWorkloadPoints.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-gray-900">
                          {formatCurrency(record.workloadUnitPrice)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-900">{record.workloadCoefficient.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-purple-600">
                          {formatCurrency(record.inpatientWorkloadPerformance)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {/* 汇总行 */}
                  <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                    <td className="px-4 py-3 text-gray-700" colSpan={3}>合计</td>
                    <td className="px-4 py-3 text-gray-900">{summaryData.totalStaffCount}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-gray-900">
                        {formatCurrency(summaryData.totalSettlementIncome)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-gray-900">
                        {formatCurrency(summaryData.totalDirectCost)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-blue-600">
                        {formatCurrency(summaryData.totalPerformance)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-green-600">
                        {formatCurrency(summaryData.totalPerCapitaPerformance)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-900">{summaryData.totalInpatientWorkloadPoints.toLocaleString()}</td>
                    <td className="px-4 py-3">-</td>
                    <td className="px-4 py-3">-</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-purple-600">
                        {formatCurrency(summaryData.totalInpatientWorkloadPerformance)}
                      </span>
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* 分页控件 */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            显示第 {(currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, performanceData.length + (currentPage - 1) * PAGE_SIZE)} 条
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">第</span>
              <form onSubmit={handlePageInputSubmit} className="flex items-center gap-2">
                <input
                  type="number"
                  value={pageInput}
                  onChange={handlePageInputChange}
                  min="1"
                  max={totalPages}
                  className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-sm text-gray-600">页，共 {totalPages} 页</span>
                <button
                  type="submit"
                  className="px-2 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-150"
                >
                  跳转
                </button>
              </form>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
                disabled={currentPage === 1}
                onClick={() => handlePageChange(1)}
              >
                &lt;&lt;
              </button>
              <button
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
                disabled={currentPage === 1}
                onClick={() => handlePageChange(currentPage - 1)}
              >
                &lt;
              </button>
              <button
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
                disabled={currentPage === totalPages}
                onClick={() => handlePageChange(currentPage + 1)}
              >
                &gt;
              </button>
              <button
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
                disabled={currentPage === totalPages}
                onClick={() => handlePageChange(totalPages)}
              >
                &gt;&gt;
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}