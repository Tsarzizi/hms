import React, { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const API_BASE = "/api/department_workload_performance";
const PAGE_SIZE = 20;

/** ---------- 工具函数 ---------- */
function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// 直接用 YYYY-MM（后端 yyyy_mm = '2025-08'）
function formatMonthParam(month: string) {
  // 后端使用 yyyy_mm = '2025-08' 这样的格式，这里不再去掉短横线
  if (!month) return "";
  return month;
}

function formatCurrency(amount: number) {
  if (amount === null || amount === undefined || isNaN(amount)) return "￥0";
  return `￥${amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number) {
  if (value === undefined || value === null || isNaN(value)) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/** ---------- 错误提示组件 ---------- */
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
  totalInpatientWorkloadPerformance: number;
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

interface TrendItem {
  // 月份，可以是 "202508" 或 "2025-08"
  month: string;
  departmentId?: string;
  departmentCategory?: string;
  departmentType?: string;
  departmentName?: string;
  // 明细数据里的字段
  staffCount?: number;
  settlementIncome?: number;
  totalPerformance?: number;
  // 如果后端已经按月聚合，也可以直接返回这些汇总字段
  totalSettlementIncome?: number;
  totalStaffCount?: number;
}

interface AggregatedTrendItem {
  month: string;
  totalPerformance: number;
  totalSettlementIncome: number;
  totalStaffCount: number;
  recordCount: number;
}

/** ---------- 趋势图表组件 ---------- */
function TrendChart({
  data,
}: {
  data: AggregatedTrendItem[];
}) {
  const normalized = data.map((d) => {
    let label = d.month;
    if (/^\d{6}$/.test(d.month)) {
      label = `${d.month.slice(0, 4)}-${d.month.slice(4, 6)}`;
    }
    return { ...d, month: label };
  });

  if (normalized.length === 0) {
    return (
      <div className="h-80 bg-gray-50 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl text-gray-300 mb-4">📊</div>
          <p className="text-gray-500 mb-2 text-lg">暂无趋势数据</p>
          <p className="text-gray-400">
            请选择日期范围并点击查询按钮加载数据
          </p>
        </div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart
        data={normalized}
        margin={{
          top: 10,
          right: 20,
          left: 0,
          bottom: 10,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => {
            const parts = String(value).split("-");
            return parts.length === 2 ? `${parts[1]}月` : value;
          }}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => `￥${(Number(value) / 10000).toFixed(0)}万`}
        />
        <Tooltip
          formatter={(value: number, name: string) => {
            if (name === "绩效总额" || name === "结算收入") {
              return [formatCurrency(value), name];
            }
            if (name === "人数") {
              return [value, name];
            }
            return [value, name];
          }}
          labelFormatter={(label) => `月份：${label}`}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="totalPerformance"
          name="绩效总额"
          stroke="#3b82f6"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="totalSettlementIncome"
          name="结算收入"
          stroke="#10b981"
          dot={false}
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
  type = "currency",
}: {
  title: string;
  currentValue: number;
  previousValue: number;
  type?: "currency" | "percent" | "number";
}) {
  const growth =
    previousValue !== 0
      ? ((currentValue - previousValue) / previousValue) * 100
      : 0;
  const trend = growth > 0 ? "up" : growth < 0 ? "down" : "neutral";

  const trendColors = {
    up: "text-green-600 bg-green-100",
    down: "text-red-600 bg-red-100",
    neutral: "text-gray-600 bg-gray-100",
  };

  const formatValue = (value: number) => {
    if (type === "currency") return formatCurrency(value);
    if (type === "percent") return `${value.toFixed(1)}%`;
    return value.toLocaleString();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <div
          className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${trendColors[trend]}`}
        >
          {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
          {formatPercent(growth)}
        </div>
      </div>
      <div className="space-y-3">
        <div className="text-2xl font-bold text-gray-900">
          {formatValue(currentValue)}
        </div>
        <div className="text-sm text-gray-500">
          上月: {formatValue(previousValue)}
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
  const [totalCount, setTotalCount] = useState(0);

  // 明细数据
  const [performanceData, setPerformanceData] = useState<PerformanceRecord[]>(
    []
  );
  // 汇总
  const [summaryData, setSummaryData] = useState<SummaryData>({
    totalStaffCount: 0,
    totalSettlementIncome: 0,
    totalDirectCost: 0,
    totalPerformance: 0,
    totalPerCapitaPerformance: 0,
    totalInpatientWorkloadPoints: 0,
    totalInpatientWorkloadPerformance: 0,
  });

  // 筛选选项
  const [departmentCategories, setDepartmentCategories] = useState<string[]>([]);
  const [departmentTypes, setDepartmentTypes] = useState<string[]>([]);
  const [departmentNames, setDepartmentNames] = useState<string[]>([]);

  // 趋势数据（明细 + 汇总）
  const [trendData, setTrendData] = useState<TrendItem[]>([]);

  const trendDetailByMonth = useMemo(() => {
    const grouped: Record<string, TrendItem[]> = {};
    trendData.forEach((item) => {
      if (!grouped[item.month]) grouped[item.month] = [];
      grouped[item.month].push(item);
    });
    return grouped;
  }, [trendData]);

  const aggregatedTrendData = useMemo<AggregatedTrendItem[]>(() => {
    const map = new Map<string, AggregatedTrendItem>();

    trendData.forEach((item) => {
      const monthKey = item.month;
      const perf = item.totalPerformance ?? 0;
      const income =
        (item as any).totalSettlementIncome ?? item.settlementIncome ?? 0;
      const staff = (item as any).totalStaffCount ?? item.staffCount ?? 0;

      const exists = map.get(monthKey);
      if (exists) {
        exists.totalPerformance += perf;
        exists.totalSettlementIncome += income;
        exists.totalStaffCount += staff;
        exists.recordCount += 1;
      } else {
        map.set(monthKey, {
          month: monthKey,
          totalPerformance: perf,
          totalSettlementIncome: income,
          totalStaffCount: staff,
          recordCount: 1,
        });
      }
    });

    // 只保留有实际数据的月份（绩效 / 收入 / 人数三者之一非 0）
    const arr = Array.from(map.values()).filter(
      (m) =>
        (m.totalPerformance || 0) !== 0 ||
        (m.totalSettlementIncome || 0) !== 0 ||
        (m.totalStaffCount || 0) !== 0
    );

    return arr.sort((a, b) => a.month.localeCompare(b.month));
  }, [trendData]);

  /** ---------- 请求封装 ---------- */

  // 获取筛选选项
  const fetchFilterOptions = async () => {
    try {
      const res = await fetch(`${API_BASE}/filter-options`);
      if (!res.ok) throw new Error("获取筛选项失败");
      const data = await res.json();
      setDepartmentCategories(data.categories || []);
      setDepartmentTypes(data.types || []);
      setDepartmentNames(data.names || []);
    } catch (e: any) {
      setError(e?.message || "获取筛选项失败");
    }
  };

  // 获取绩效数据（列表）
  const fetchPerformanceData = async (pageOverride?: number) => {
    try {
      const page = pageOverride ?? currentPage;
      const params = new URLSearchParams();
      params.set("selected_date", formatMonthParam(selectedDate));
      params.set("page", String(page));
      params.set("page_size", String(PAGE_SIZE));
      params.set("department_category", departmentCategory || "");
      params.set("department_type", departmentType || "");
      params.set("department_name", departmentName || "");

      const res = await fetch(
        `${API_BASE}/performance-data?${params.toString()}`
      );
      if (!res.ok) throw new Error("获取绩效数据失败");
      const data = await res.json();

      const items = (data.items || []) as any[];
      const mapped = items.map((r) => ({
        ...r,
        // 后端有的字段叫 departmentType，这里兼容一下
        type: (r as any).type ?? (r as any).departmentType ?? "",
        id: String(r.id),
      })) as PerformanceRecord[];

      setPerformanceData(mapped);

      const count = data.totalCount ?? 0;
      setTotalCount(count);
      const pages = count ? Math.max(1, Math.ceil(count / PAGE_SIZE)) : 1;
      setTotalPages(pages);
      setPageInput(String(page));
      setCurrentPage(page);
    } catch (e: any) {
      setError(e?.message || "获取绩效数据失败");
      setPerformanceData([]);
      setTotalPages(1);
      setTotalCount(0);
    }
  };

  // 汇总数据
  const fetchSummary = async () => {
    try {
      const params = new URLSearchParams();
      params.set("selected_date", formatMonthParam(selectedDate));
      params.set("department_category", departmentCategory || "");
      params.set("department_type", departmentType || "");
      params.set("department_name", departmentName || "");

      const res = await fetch(
        `${API_BASE}/summary-data?${params.toString()}`
      );
      if (!res.ok) throw new Error("获取汇总数据失败");
      const data = await res.json();
      setSummaryData({
        totalStaffCount: data.totalStaffCount ?? 0,
        totalSettlementIncome: data.totalSettlementIncome ?? 0,
        totalDirectCost: data.totalDirectCost ?? 0,
        totalPerformance: data.totalPerformance ?? 0,
        totalPerCapitaPerformance: data.totalPerCapitaPerformance ?? 0,
        totalInpatientWorkloadPoints: data.totalInpatientWorkloadPoints ?? 0,
        totalInpatientWorkloadPerformance:
          data.totalInpatientWorkloadPerformance ?? 0,
      });
    } catch (e: any) {
      setError(e?.message || "获取汇总数据失败");
      setSummaryData({
        totalStaffCount: 0,
        totalSettlementIncome: 0,
        totalDirectCost: 0,
        totalPerformance: 0,
        totalPerCapitaPerformance: 0,
        totalInpatientWorkloadPoints: 0,
        totalInpatientWorkloadPerformance: 0,
      });
    }
  };

  // 根据当前选择的月份，取该年份 1-12 月做趋势
  const computeTrendRange = () => {
    // selectedDate 形如 "2025-08"
    if (!selectedDate) {
      const now = new Date();
      const year = now.getFullYear();
      const startStr = `${year}-01`;
      const endStr = `${year}-12`;
      return { startStr, endStr };
    }

    const year =
      selectedDate.split("-")[0] || String(new Date().getFullYear());
    const startStr = `${year}-01`;
    const endStr = `${year}-12`;
    return { startStr, endStr };
  };

  // 趋势数据：查询当年 1~12 月，后端可以返回明细或已按月汇总
  const fetchTrendData = async () => {
    try {
      const { startStr, endStr } = computeTrendRange();
      const params = new URLSearchParams();
      params.set("start_date", startStr);
      params.set("end_date", endStr);
      params.set("department_category", departmentCategory || "");
      params.set("department_type", departmentType || "");
      params.set("department_name", departmentName || "");

      const res = await fetch(`${API_BASE}/trend-data?${params.toString()}`);
      if (!res.ok) throw new Error("获取趋势数据失败");
      const data = await res.json();
      const items = (data.items || []) as TrendItem[];
      setTrendData(items);
    } catch (e) {
      console.error("获取趋势数据失败:", e);
      setTrendData([]);
    }
  };

  // 导出 Excel
  const handleDownload = async () => {
    try {
      const body = {
        selected_date: formatMonthParam(selectedDate),
        department_category: departmentCategory || "",
        department_type: departmentType || "",
        department_name: departmentName || "",
      };
      const res = await fetch(`${API_BASE}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("导出失败");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `全院绩效明细_${selectedDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e: any) {
      setError(e?.message || "导出失败");
    }
  };

  /** ---------- 初始化 ---------- */
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError("");
      try {
        await fetchFilterOptions();
        await fetchPerformanceData(1);
        await fetchSummary();
        await fetchTrendData();
      } finally {
        setLoading(false);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ---------- 交互逻辑 ---------- */

  // 查询按钮：根据当前筛选条件查列表 + 汇总 + 趋势
  const handleQuery = async () => {
    setLoading(true);
    setError("");
    try {
      await fetchPerformanceData(1);
      await fetchSummary();
      await fetchTrendData();
    } finally {
      setLoading(false);
    }
  };

  // 刷新当前页（不改变筛选）
  const handleRefresh = () => {
    fetchPerformanceData();
    fetchSummary();
    fetchTrendData();
  };

  // 分页
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      fetchPerformanceData(newPage);
    }
  };

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInput(e.target.value);
  };

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(pageInput);
    if (pageNum >= 1 && pageNum <= totalPages) {
      handlePageChange(pageNum);
    }
  };

  const handleReset = () => {
    setDepartmentCategory("");
    setDepartmentType("");
    setDepartmentName("");
    setCurrentPage(1);
  };

  const startIndex =
    totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIndex =
    totalCount === 0 ? 0 : Math.min(currentPage * PAGE_SIZE, totalCount);

  /** ---------- 渲染 ---------- */

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* 页面标题 */}
      <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <h1 className="text-2xl font-bold text-gray-900">全院绩效明细</h1>
            <p className="text-gray-600 text-sm mt-2">
              全院各绩效科室的收入、成本、绩效及住院工作量明细分析
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium text-gray-900">
                {selectedDate} 数据
              </div>
              <div className="text-xs text-gray-500">最后更新：系统当前</div>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">
              统计月份
            </label>
            <input
              type="month"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">
              绩效科室类别
            </label>
            <select
              value={departmentCategory}
              onChange={(e) => setDepartmentCategory(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
            >
              <option value="">全部类别</option>
              {departmentCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">
              绩效科室类型
            </label>
            <select
              value={departmentType}
              onChange={(e) => setDepartmentType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
            >
              <option value="">全部类型</option>
              {departmentTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">
              绩效科室名称
            </label>
            <select
              value={departmentName}
              onChange={(e) => setDepartmentName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
            >
              <option value="">全部科室</option>
              {departmentNames.map((n) => (
                <option key={n} value={n}>
                  {n}
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
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  查询中...
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  查询
                </>
              )}
            </button>
            <button
              onClick={handleReset}
              className="flex-1 px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200 font-medium flex items-center justify-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              重置
            </button>
          </div>
        </div>
      </section>

      {/* 同比环比卡片 */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <GrowthCard
          title="总绩效环比"
          currentValue={summaryData.totalPerformance}
          previousValue={summaryData.totalPerformance * 0.95}
          type="currency"
        />
        <GrowthCard
          title="结算收入同比"
          currentValue={summaryData.totalSettlementIncome}
          previousValue={summaryData.totalSettlementIncome * 1.1}
          type="currency"
        />
        <GrowthCard
          title="人员数量环比"
          currentValue={summaryData.totalStaffCount}
          previousValue={summaryData.totalStaffCount * 0.98}
          type="number"
        />
        <GrowthCard
          title="人均绩效同比"
          currentValue={summaryData.totalPerCapitaPerformance}
          previousValue={summaryData.totalPerCapitaPerformance * 1.05}
          type="currency"
        />
      </section>

      {/* 绩效明细表（当前统计月份） */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">绩效明细数据</h2>
            <div className="text-sm text-gray-600">
              共 {totalCount} 条记录，当前显示 {startIndex}-{endIndex} 条
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200 font-medium flex items-center justify-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              刷新
            </button>
            <button
              onClick={handleDownload}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200 font-medium flex items-center justify-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              导出Excel
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  绩效科室类别
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  绩效科室类型
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  绩效科室名称
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  人数
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  结算收入
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  科室直接成本
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  绩效总额
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  人均绩效
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  住院工作量点数
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  工作量单价
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  工作量系数
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  住院工作量绩效
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {performanceData.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-6 py-8 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="text-6xl text-gray-300 mb-4">📋</div>
                      <p className="text-gray-500 mb-2 text-lg">暂无统计数据</p>
                      <p className="text-gray-400">
                        请选择日期范围并点击查询按钮加载数据
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                performanceData.map((record, index) => (
                  <tr key={record.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {record.departmentCategory}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {record.type}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {record.departmentName}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {record.staffCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">
                        {formatCurrency(record.settlementIncome)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">
                        {formatCurrency(record.directCost)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-blue-600">
                        {formatCurrency(record.totalPerformance)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-green-600">
                        {formatCurrency(record.perCapitaPerformance)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {record.inpatientWorkloadPoints.toLocaleString("zh-CN")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">
                        {formatCurrency(record.workloadUnitPrice)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {record.workloadCoefficient.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-purple-600">
                        {formatCurrency(
                          record.totalInpatientWorkloadPerformance
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 分页条 */}
        <div className="flex items-center justify-between mt-6">
          <div className="text-sm text-gray-600">
            第 {currentPage} 页，共 {totalPages} 页，{totalCount} 条记录
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handlePageChange(1)}
              disabled={currentPage === 1}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
            >
              &lt;&lt;
            </button>
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
            >
              &lt;
            </button>
            <form
              onSubmit={handlePageInputSubmit}
              className="flex items-center gap-2"
            >
              <span className="text-sm text-gray-600">第</span>
              <input
                className="w-12 border border-gray-300 rounded-lg px-2 py-1 text-center text-sm"
                value={pageInput}
                onChange={handlePageInputChange}
              />
              <span className="text-sm text-gray-600">页 / {totalPages}</span>
            </form>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
            >
              &gt;
            </button>
            <button
              onClick={() => handlePageChange(totalPages)}
              disabled={currentPage === totalPages}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
            >
              &gt;&gt;
            </button>
          </div>
        </div>
      </section>

      {/* 趋势图：该年份 1~12 月 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 text-left">
          全院绩效趋势分析
        </h2>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-gray-700">
              近12个月绩效趋势
            </div>
            <div className="flex gap-4 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-blue-500"></span>
                绩效总额（折线）
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-green-500"></span>
                结算收入（折线）
              </span>
            </div>
          </div>
          <TrendChart data={aggregatedTrendData} />
        </div>
      </section>
    </div>
  );
}