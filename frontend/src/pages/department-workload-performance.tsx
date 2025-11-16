import { useEffect, useMemo, useState } from "react";
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

// 如果你的后端前缀不是这个，请改成后端实际提供的前缀
// 比如："/api/hospital-performance" 或 "/api/department_workload_performance"
const API_BASE = "/api/department_workload_performance";
const PAGE_SIZE = 20;

/** ---------- 工具函数 ---------- */
function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// YYYY-MM -> YYYYMM（后端使用 yyyy_mm = '202401'）
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
  detailByMonth,
}: {
  data: AggregatedTrendItem[];
  detailByMonth: Record<string, TrendItem[]>;
}) {
  const normalized = data.map((d) => ({
    ...d,
    month: `${d.month.slice(0, 4)}-${d.month.slice(4, 6)}`,
  }));

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
          tickFormatter={(value) => {
            const arr = String(value).split("-");
            return (arr[1] || value) + "月";
          }}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickFormatter={(value) =>
            `￥${(Number(value) / 10000).toFixed(0)}万`
          }
        />
        <Tooltip
          content={({ label, payload }) => {
            const monthKey = (label || "").replace("-", "");
            const details = detailByMonth[monthKey] || [];
            return (
              <div className="bg-white rounded-lg shadow-lg p-3 border border-gray-200">
                <div className="font-semibold text-gray-900 mb-1">
                  {label} 月份明细
                </div>
                {(payload || []).map((entry) => (
                  <div key={entry.name} className="text-sm text-gray-700">
                    {entry.name === "totalPerformance" ? "绩效总额" :
                    entry.name === "totalSettlementIncome" ? "结算收入" : "人员数量"}
                    ：
                    {entry.name === "totalStaffCount"
                      ? Number(entry.value || 0).toLocaleString("zh-CN")
                      : `￥${Number(entry.value || 0).toLocaleString("zh-CN", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}`}
                  </div>
                ))}
                <div className="mt-2 text-xs text-gray-500">
                  {details.length ? "包含科室：" : "无明细数据"}
                  {details.map((d) => d.departmentName).join("、")}
                </div>
              </div>
            );
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="totalPerformance"
          name="绩效总额"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ fill: "#3b82f6", strokeWidth: 2, r: 4 }}
          activeDot={{ r: 6, fill: "#1d4ed8" }}
        />
        <Line
          type="monotone"
          dataKey="totalSettlementIncome"
          name="结算收入"
          stroke="#10b981"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={{ fill: "#10b981", strokeWidth: 2, r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="totalStaffCount"
          name="人员数量"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={{ fill: "#f59e0b", strokeWidth: 2, r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** ---------- 同比环比卡片组件（前端简单推算） ---------- */
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
    previousValue && !isNaN(previousValue)
      ? ((currentValue - previousValue) / previousValue) * 100
      : 0;
  const trend = growth > 0 ? "up" : growth < 0 ? "down" : "neutral";

  const trendColors: Record<string, string> = {
    up: "text-green-600 bg-green-100",
    down: "text-red-600 bg-red-100",
    neutral: "text-gray-600 bg-gray-100",
  };

  const formatValue = (value: number) => {
    if (type === "currency") return formatCurrency(value);
    if (type === "percent") return `${value.toFixed(1)}%`;
    return value.toLocaleString("zh-CN");
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
            上期: {formatValue(previousValue)}
          </div>
        </div>
        <div
          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${trendColors[trend]}`}
        >
          {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
          {formatPercent(growth)}
        </div>
      </div>
    </div>
  );
}

/** ---------- 主组件 ---------- */
export default function DepartmentWorkloadPerformancePage() {
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
  const [performanceData, setPerformanceData] = useState<PerformanceRecord[]>(
    []
  );
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
  const [departmentCategories, setDepartmentCategories] = useState<string[]>(
    []
  );
  const [departmentTypes, setDepartmentTypes] = useState<string[]>([]);
  const [departmentNames, setDepartmentNames] = useState<string[]>([]);

  // 趋势数据
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

    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
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

  // 获取汇总数据
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
        totalStaffCount: data.totalStaffCount || 0,
        totalSettlementIncome: data.totalSettlementIncome || 0,
        totalDirectCost: data.totalDirectCost || 0,
        totalPerformance: data.totalPerformance || 0,
        totalPerCapitaPerformance: data.totalPerCapitaPerformance || 0,
        totalInpatientWorkloadPoints:
          data.totalInpatientWorkloadPoints || 0,
        totalInpatientWorkloadPerformance:
          data.totalInpatientWorkloadPerformance || 0,
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

  // 计算趋势起止（以选中月份为截止，往前 11 个月，共 12 个月）
  const calcTrendRange = (month: string, months = 12) => {
    const [yStr, mStr] = month.split("-");
    const end = new Date(Number(yStr), Number(mStr) - 1, 1);
    const start = new Date(end);
    start.setMonth(start.getMonth() - (months - 1));

    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      return `${y}${m}`;
    };

    return {
      start: fmt(start),
      end: fmt(end),
    };
  };

  // 获取趋势数据（带更详细的错误输出）
  const fetchTrendData = async () => {
    try {
      const { start, end } = calcTrendRange(selectedDate, 12);
      const params = new URLSearchParams();
      params.set("start_date", start);
      params.set("end_date", end);
      params.set("department_category", departmentCategory || "");
      params.set("department_type", departmentType || "");
      params.set("department_name", departmentName || "");

      const url = `${API_BASE}/trend-data?${params.toString()}`;
      const res = await fetch(url);
      const cloned = res.clone();

      if (!res.ok) {
        const text = await res.text();
        console.error("趋势接口错误响应:", res.status, text);
        throw new Error(`获取趋势数据失败（HTTP ${res.status}）`);
      }

      let data: any;
      try {
        data = await res.json();
      } catch (parseError) {
        const raw = await cloned.text();
        console.error("趋势接口返回的不是 JSON，原始响应为:", raw);
        throw new Error("获取趋势数据失败：服务器返回的不是合法 JSON");
      }

      const items = (data.items || data || []).map((d: any) => ({
        month: d.month,
        departmentId: String(d.departmentId || ""),
        departmentCategory: d.departmentCategory || "",
        departmentType: d.departmentType || "",
        departmentName: d.departmentName || "",
        staffCount: Number(d.staffCount || 0),
        settlementIncome: Number(d.settlementIncome || 0),
        totalPerformance: Number(d.totalPerformance || 0),
      })) as TrendItem[];
      setTrendData(items);
    } catch (e: any) {
      console.error("获取趋势数据失败:", e);
      setTrendData([]);
      // 可以选择提示给页面
      // setError(e?.message || "获取趋势数据失败");
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
        headers: {
          "Content-Type": "application/json",
        },
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
      setError(e?.message || "下载失败");
    }
  };

  /** ---------- 生命周期 ---------- */

  // 初始化：筛选项 + 首次数据
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        await fetchFilterOptions();
        await fetchPerformanceData(1);
        await fetchSummary();
        await fetchTrendData();
      } catch (e: any) {
        setError(e?.message || "初始化数据失败");
      } finally {
        setLoading(false);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 点击“查询”
  const handleQuery = async () => {
    setLoading(true);
    setCurrentPage(1);
    try {
      await fetchPerformanceData(1);
      await fetchSummary();
      await fetchTrendData();
    } catch (e: any) {
      setError(e?.message || "查询数据失败");
    } finally {
      setLoading(false);
    }
  };

  // 刷新当前页
  const handleRefresh = () => {
    fetchPerformanceData();
    fetchSummary();
    fetchTrendData();
  };

  // 分页操作
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      fetchPerformanceData(newPage);
    }
  };

  // 跳页输入
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

  // 重置筛选
  const handleReset = () => {
    setDepartmentCategory("");
    setDepartmentType("");
    setDepartmentName("");
    setCurrentPage(1);
  };

  const selectedYyyymm = formatMonthParam(selectedDate);

  const shiftMonth = (yyyymm: string, offset: number) => {
    if (!yyyymm || yyyymm.length !== 6) return "";
    const year = Number(yyyymm.slice(0, 4));
    const month = Number(yyyymm.slice(4, 6));
    const date = new Date(year, month - 1, 1);
    date.setMonth(date.getMonth() + offset);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    return `${y}${m}`;
  };

  const trendMap = useMemo(() => {
    const m = new Map<string, AggregatedTrendItem>();
    aggregatedTrendData.forEach((item) => m.set(item.month, item));
    return m;
  }, [aggregatedTrendData]);

  // 同比环比（使用趋势明细聚合结果真实计算）
  const growthData = useMemo(() => {
    const current = trendMap.get(selectedYyyymm);
    const previousMonth = trendMap.get(shiftMonth(selectedYyyymm, -1));
    const previousYear = trendMap.get(shiftMonth(selectedYyyymm, -12));

    const currentPerformance = current?.totalPerformance || 0;
    const currentIncome = current?.totalSettlementIncome || 0;
    const currentStaff = current?.totalStaffCount || 0;
    const currentPerCapita = currentStaff
      ? currentPerformance / currentStaff
      : 0;

    const prevPerformance = previousMonth?.totalPerformance || 0;
    const prevIncome = previousYear?.totalSettlementIncome || 0;
    const prevStaff = previousMonth?.totalStaffCount || 0;
    const prevPerCapita = previousYear?.totalStaffCount
      ? (previousYear.totalPerformance || 0) /
        (previousYear.totalStaffCount || 1)
      : 0;

    return {
      performanceGrowth: {
        current: currentPerformance,
        previous: prevPerformance,
      },
      incomeGrowth: {
        current: currentIncome,
        previous: prevIncome,
      },
      staffGrowth: {
        current: currentStaff,
        previous: prevStaff,
      },
      perCapitaGrowth: {
        current: currentPerCapita,
        previous: prevPerCapita,
      },
    };
  }, [trendMap, selectedYyyymm]);

  const startIndex =
    totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIndex =
    totalCount === 0 ? 0 : Math.min(currentPage * PAGE_SIZE, totalCount);

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* 顶部导航 */}
      <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <h1 className="text-2xl font-bold text-gray-900">
              全院绩效明细
            </h1>
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
        <h2 className="text-lg font-semibold text-gray-900 mb-4 text-left">
          数据筛选
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">
              绩效月份
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
              {departmentCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">
              类型
            </label>
            <select
              value={departmentType}
              onChange={(e) => setDepartmentType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
            >
              <option value="">全部类型</option>
              {departmentTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
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
              {departmentNames.map((name) => (
                <option key={name} value={name}>
                  {name}
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
              onClick={handleDownload}
              className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200 font-medium flex items-center justify-center gap-2"
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
        <h2 className="text-lg font-semibold text-gray-900 mb-4 text-left">
          绩效趋势分析
        </h2>
        <TrendChart data={aggregatedTrendData} detailByMonth={trendDetailByMonth} />
      </section>

      {/* 数据表格 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            绩效明细数据
          </h2>
          <button
            onClick={handleRefresh}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            title="刷新数据"
          >
            <svg
              className="w-5 h-5"
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
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-gray-900 min-w-[1200px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[120px]">
                  绩效科室类别
                </th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[100px]">
                  类型
                </th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-left min-w-[150px]">
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
                          {formatCurrency(
                            record.inpatientWorkloadPerformance
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {/* 汇总行 */}
                  <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                    <td className="px-4 py-3 text-gray-700" colSpan={3}>
                      合计
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      {summaryData.totalStaffCount}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-gray-900">
                        {formatCurrency(
                          summaryData.totalSettlementIncome
                        )}
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
                        {formatCurrency(
                          summaryData.totalPerCapitaPerformance
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      {summaryData.totalInpatientWorkloadPoints.toLocaleString(
                        "zh-CN"
                      )}
                    </td>
                    <td className="px-4 py-3">-</td>
                    <td className="px-4 py-3">-</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-purple-600">
                        {formatCurrency(
                          summaryData.totalInpatientWorkloadPerformance
                        )}
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
            共 {totalCount} 条记录，显示第 {startIndex} - {endIndex} 条
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">第</span>
              <form
                onSubmit={handlePageInputSubmit}
                className="flex items-center gap-2"
              >
                <input
                  type="number"
                  value={pageInput}
                  onChange={handlePageInputChange}
                  min="1"
                  max={totalPages}
                  className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="text-sm text-gray-600">
                  页，共 {totalPages} 页
                </span>
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