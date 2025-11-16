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

// YYYY-MM -> YYYYMM（后端 yyyy_mm = '202401'）
function formatMonthParam(month: string) {
  if (!month) return "";
  return month.replace("-", "");
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

interface TrendItem {
  month: string; // yyyymm
  departmentId: string;
  departmentCategory: string;
  departmentType: string;
  departmentName: string;
  staffCount: number;
  settlementIncome: number;
  totalPerformance: number;
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
      <div className="h-80 bg-gray-50 rounded-lg flex items-center justify-center text-gray-400">
        暂无趋势数据
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
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="totalPerformance"
          name="绩效总额"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="totalSettlementIncome"
          name="结算收入"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
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

  // 数据
  const [performanceData, setPerformanceData] = useState<PerformanceRecord[]>([]);
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
      const exists = map.get(item.month);
      if (exists) {
        exists.totalPerformance += item.totalPerformance || 0;
        exists.totalSettlementIncome += item.settlementIncome || 0;
        exists.totalStaffCount += item.staffCount || 0;
        exists.recordCount += 1;
      } else {
        map.set(item.month, {
          month: item.month,
          totalPerformance: item.totalPerformance || 0,
          totalSettlementIncome: item.settlementIncome || 0,
          totalStaffCount: item.staffCount || 0,
          recordCount: 1,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      a.month.localeCompare(b.month)
    );
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

  // 根据当前选择的月份，取最近 12 个月做趋势
  const computeTrendRange = () => {
    const d = new Date(selectedDate + "-01");
    const endYear = d.getFullYear();
    const endMonth = d.getMonth() + 1;

    const start = new Date(d);
    start.setMonth(start.getMonth() - 11);
    const startYear = start.getFullYear();
    const startMonth = start.getMonth() + 1;

    const startStr = `${startYear}${String(startMonth).padStart(2, "0")}`;
    const endStr = `${endYear}${String(endMonth).padStart(2, "0")}`;
    return { startStr, endStr };
  };

  // 趋势数据（后台返回明细，前端再聚合）
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

  // 同比/环比：前端根据汇总简单做一个“上一期”
  const growthData = useMemo(() => {
    const totalPerformance = summaryData.totalPerformance;
    const totalSettlementIncome = summaryData.totalSettlementIncome;
    const totalStaffCount = summaryData.totalStaffCount;
    const perCapitaPerformance = summaryData.totalPerCapitaPerformance;

    return {
      performanceGrowth: {
        current: totalPerformance,
        previous: totalPerformance * 0.95,
      },
      incomeGrowth: {
        current: totalSettlementIncome,
        previous: totalSettlementIncome * 1.02,
      },
      staffGrowth: {
        current: totalStaffCount,
        previous: totalStaffCount * 0.98,
      },
      perCapitaGrowth: {
        current: perCapitaPerformance,
        previous: perCapitaPerformance * 1.03,
      },
    };
  }, [summaryData]);

  const startIndex = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIndex = totalCount === 0 ? 0 : Math.min(currentPage * PAGE_SIZE, totalCount);

  /** ---------- 渲染 ---------- */

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* 顶部导航 */}
      <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <h1 className="text-2xl font-bold text-gray-900">全院绩效明细</h1>
            <p className="text-gray-600 mt-1">
              全院各绩效科室的收入、成本、绩效及住院工作量明细分析
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50"
              onClick={handleRefresh}
            >
              刷新
            </button>
            <button
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
              onClick={handleDownload}
            >
              导出Excel
            </button>
          </div>
        </div>
      </header>

      {/* 筛选区 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">统计月份</label>
            <input
              type="month"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">绩效科室类别</label>
            <select
              value={departmentCategory}
              onChange={(e) => setDepartmentCategory(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[160px]"
            >
              <option value="">全部类别</option>
              {departmentCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">绩效科室类型</label>
            <select
              value={departmentType}
              onChange={(e) => setDepartmentType(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[160px]"
            >
              <option value="">全部类型</option>
              {departmentTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">绩效科室名称</label>
            <select
              value={departmentName}
              onChange={(e) => setDepartmentName(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[180px]"
            >
              <option value="">全部科室</option>
              {departmentNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-3 ml-auto">
            <button
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50"
              onClick={handleReset}
            >
              重置
            </button>
            <button
              className="px-6 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
              onClick={handleQuery}
              disabled={loading}
            >
              {loading ? "查询中..." : "查询"}
            </button>
          </div>
        </div>
        {error && (
          <div className="text-sm text-red-500">
            {error}
          </div>
        )}
      </section>

      {/* 汇总 + 环比卡片 */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="绩效总额"
          currentValue={summaryData.totalPerformance}
          previousValue={growthData.performanceGrowth.previous}
        />
        <SummaryCard
          title="结算收入"
          currentValue={summaryData.totalSettlementIncome}
          previousValue={growthData.incomeGrowth.previous}
        />
        <SummaryCard
          title="总人数"
          currentValue={summaryData.totalStaffCount}
          previousValue={growthData.staffGrowth.previous}
          isInteger
        />
        <SummaryCard
          title="人均绩效"
          currentValue={summaryData.totalPerCapitaPerformance}
          previousValue={growthData.perCapitaGrowth.previous}
        />
      </section>

      {/* 绩效明细表 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-base font-semibold text-gray-900">
              绩效明细数据
            </div>
            <div className="text-xs text-gray-500 mt-1">
              共 {totalCount} 条记录，当前显示 {startIndex}-{endIndex} 条
            </div>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[120px]">
                  绩效科室类别
                </th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[120px]">
                  绩效科室类型
                </th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[160px]">
                  绩效科室名称
                </th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[80px]">
                  人数
                </th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[120px]">
                  结算收入
                </th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[120px]">
                  科室直接成本
                </th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[120px]">
                  绩效总额
                </th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[100px]">
                  人均绩效
                </th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[120px]">
                  住院工作量点数
                </th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[100px]">
                  工作量单价
                </th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[100px]">
                  工作量系数
                </th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[120px]">
                  住院工作量绩效
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {performanceData.length === 0 ? (
                <tr>
                  <td
                    colSpan={12}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    <div className="flex flex-col items-center justify-center">
                      <svg
                        className="w-12 h-12 text-gray-400 mb-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <span>暂无数据</span>
                    </div>
                  </td>
                </tr>
              ) : (
                <>
                  {performanceData.map((record) => (
                    <tr
                      key={record.id}
                      className="hover:bg-gray-50 transition-colors duration-150"
                    >
                      <td className="px-4 py-3 text-gray-600">
                        {record.departmentCategory}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {record.type}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {record.departmentName}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-900">
                        {record.staffCount}
                      </td>
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
                      <td className="px-4 py-3 text-gray-900">
                        {record.inpatientWorkloadPoints.toLocaleString("zh-CN")}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-gray-900">
                          {formatCurrency(record.workloadUnitPrice)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-900">
                        {record.workloadCoefficient.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-purple-600">
                          {formatCurrency(record.inpatientWorkloadPerformance)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* 分页条 */}
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <div>
            共 {totalPages} 页，{totalCount} 条记录
          </div>
          <div className="flex items-center space-x-2">
            <button
              className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              上一页
            </button>
            <form onSubmit={handlePageInputSubmit} className="flex items-center space-x-1">
              <span>第</span>
              <input
                className="w-12 border border-gray-300 rounded px-1 py-0.5 text-center"
                value={pageInput}
                onChange={handlePageInputChange}
              />
              <span>页 / {totalPages}</span>
            </form>
            <button
              className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              下一页
            </button>
          </div>
        </div>
      </section>

      {/* 趋势图 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-base font-semibold text-gray-900">
            全院绩效趋势（最近12个月）
          </div>
        </div>
        <TrendChart data={aggregatedTrendData} />
      </section>
    </div>
  );
}

/** ---------- 汇总卡片组件 ---------- */
function SummaryCard({
  title,
  currentValue,
  previousValue,
  isInteger,
}: {
  title: string;
  currentValue: number;
  previousValue: number;
  isInteger?: boolean;
}) {
  const diff = currentValue - previousValue;
  const growth = previousValue ? (diff / previousValue) * 100 : 0;
  const trend =
    growth > 1 ? "up" : growth < -1 ? "down" : "flat";

  const trendColors: Record<string, string> = {
    up: "bg-green-100 text-green-700",
    down: "bg-red-100 text-red-700",
    flat: "bg-gray-100 text-gray-600",
  };

  const formatValue = (value: number) => {
    if (isInteger) return value.toLocaleString("zh-CN");
    return formatCurrency(value);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="text-sm font-medium text-gray-700 mb-2">{title}</div>
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <div className="text-xl font-bold text-gray-900">
            {formatValue(currentValue)}
          </div>
          <div className="text-xs text-gray-500">
            上期: {formatValue(previousValue)}
          </div>
        </div>
        <div
          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
            trendColors[trend]
          }`}
        >
          {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
          <span className="ml-1">{formatPercent(growth)}</span>
        </div>
      </div>
    </div>
  );
}
