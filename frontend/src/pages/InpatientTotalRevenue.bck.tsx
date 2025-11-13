import { useEffect, useMemo, useState } from "react";
import Pagination from "../components/Pagination";
import LineChart, { CompareKind } from "../components/LineChart";

// 支持环境变量覆盖：VITE_API_BASE
const API_BASE =
  typeof import.meta !== "undefined" &&
  (import.meta as any).env &&
  (import.meta as any).env.VITE_API_BASE
    ? (import.meta as any).env.VITE_API_BASE
    : "/api/inpatient_total_revenue";

type Trend = "同向" | "反向" | "持平/未知" | string;

interface DepartmentOption {
  code: string;
  name: string;
}

interface RevenueSummaryStd {
  current: number;
  growth_rate?: number | null;
  mom_growth_rate?: number | null;
  bed_growth_rate?: number | null;
  bed_mom_growth_rate?: number | null;
  trend?: Trend;
}

interface DetailsRow {
  date: string;
  department_code: string;
  department_name?: string;
  revenue: number;
  revenue_growth_pct?: number | null;
  revenue_mom_growth_pct?: number | null;
  trend?: Trend;
  doctor_id?: string;
  doctor_name?: string;
}

interface InitResponse {
  success: boolean;
  date: string;
  departments?: DepartmentOption[];
  summary?: RevenueSummaryStd;
}

interface SummaryResponse {
  success: boolean;
  date?: string;
  date_range?: { start: string; end: string };
  departments?: string[] | null;
  summary: RevenueSummaryStd;
}

interface DetailsResponse {
  success: boolean;
  date?: string;
  date_range?: { start: string; end: string };
  departments?: string[] | null;
  rows: DetailsRow[];
  total: number;
  limit: number;
  offset: number;
}

// /timeseries 原始返回的行
interface TSRow {
  date: string;
  revenue: number;
  last_year: number | null;
  // 后端目前只保证有 yoy_pct / mom_pct；床日的先做成可选，后端补上即可用
  yoy_pct: number | null;
  mom_pct: number | null;
  bed_yoy_pct?: number | null;
  bed_mom_pct?: number | null;
}

interface TSResponse {
  success: boolean;
  rows: TSRow[];
  date?: string;
  date_range?: { start: string; end: string };
  departments?: string[] | null;
}

type SortKey =
  | "date"
  | "department"
  | "doctor"
  | "revenue"
  | "revenue_yoy"
  | "revenue_mom";

function getPrevRange(startStr: string, endStr?: string) {
  const parse = (s: string) => new Date(s);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const start = parse(startStr);
  const end = endStr ? parse(endStr) : new Date(startStr);
  const oneDay = 24 * 60 * 60 * 1000;

  const sameDay = fmt(start) === fmt(end);
  const lenDays = sameDay ? 1 : Math.floor((+end - +start) / oneDay) + 1;

  const prevEndExclusive = start;
  const prevStart = new Date(prevEndExclusive.getTime() - lenDays * oneDay);
  return { prevStart: fmt(prevStart), prevEnd: fmt(prevEndExclusive) };
}

async function apiFetch(
  url: string,
  options: RequestInit = {},
  timeoutMs = 60000
) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctl.signal });
    return res;
  } catch (err: any) {
    const msg =
      err?.name === "AbortError"
        ? "请求超时：无法连接后端服务。"
        : "网络错误：可能后端未启动或代理未连通。";
    const e: any = new Error(msg);
    e.original = err;
    throw e;
  } finally {
    clearTimeout(id);
  }
}

async function fetchSummaryAPI({
  start,
  end,
  deps,
}: {
  start: string;
  end: string;
  deps?: string[] | null;
}) {
  const payload: Record<string, any> = { start_date: start, end_date: end };
  if (deps && deps.length) payload.departments = deps;

  const res = await apiFetch(`${API_BASE}/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`SUMMARY 请求失败：${res.status}`);
  return res.json() as Promise<SummaryResponse>;
}

async function fetchTimeseriesAPI({
  start,
  end,
  deps,
}: {
  start: string;
  end: string;
  deps?: string[] | null;
}) {
  const payload: Record<string, any> = { start_date: start, end_date: end };
  if (deps && deps.length) payload.departments = deps;

  const res = await apiFetch(`${API_BASE}/timeseries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`TIMESERIES 请求失败：${res.status}`);
  return res.json() as Promise<TSResponse>;
}

async function maybeEnsureMoM({
  currentSummary,
  start,
  end,
  deps,
}: {
  currentSummary: any;
  start: string;
  end: string;
  deps?: string[] | null;
}) {
  const hasMom =
    typeof currentSummary?.mom_growth_rate === "number" &&
    Number.isFinite(currentSummary.mom_growth_rate);
  if (hasMom) return currentSummary;

  const { prevStart, prevEnd } = getPrevRange(start, end);
  const prevPayload = await fetchSummaryAPI({
    start: prevStart,
    end: prevEnd,
    deps,
  });
  const prev = extractSummaryFromStd(prevPayload);
  const curTotal =
    typeof currentSummary?.total_revenue === "number"
      ? currentSummary.total_revenue
      : undefined;
  const prevTotal =
    typeof prev?.total_revenue === "number" ? prev.total_revenue : undefined;

  let mom: number | undefined;
  if (
    typeof curTotal === "number" &&
    typeof prevTotal === "number" &&
    prevTotal !== 0
  ) {
    mom = ((curTotal - prevTotal) / prevTotal) * 100;
  }
  return {
    ...currentSummary,
    ...(typeof mom === "number" && Number.isFinite(mom)
      ? { mom_growth_rate: mom }
      : {}),
  };
}

function getToday(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split("T")[0];
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(+d)) return String(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function extractSummaryFromStd(payload: any) {
  const rev = payload?.revenue || {};
  const std = payload?.summary || {};
  const bed = (payload as any)?.bed || {};

  const toNum = (v: any) => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const s = v.replace(/[\s,]/g, "").replace(/%$/, "");
      const n = Number(s);
      if (Number.isFinite(n)) return n;
    }
    return undefined;
  };

  const out: any = {};
  const current = toNum(rev.current_total ?? std.current);
  const yoy = toNum(
    rev.growth_rate_pct ?? std.growth_rate ?? std.growth_rate_pct
  );
  const mom = toNum(
    rev.mom_growth_pct ?? std.mom_growth_rate ?? std.mom ?? std.mom_growth_pct
  );
  const bedYoy = toNum(
    (payload as any)?.bed_growth_pct ??
      bed.growth_rate_pct ??
      (std as any)?.bed_growth_rate ??
      (std as any)?.bed_growth_pct
  );
  const bedMom = toNum(
    (payload as any)?.bed_mom_growth_pct ??
      bed.mom_growth_pct ??
      (std as any)?.bed_mom_growth_rate ??
      (std as any)?.bed_mom_growth_pct
  );

  if (typeof current !== "undefined") out.total_revenue = current;
  if (typeof yoy !== "undefined") out.yoy_growth_rate = yoy;
  if (typeof mom !== "undefined") out.mom_growth_rate = mom;
  if (typeof bedYoy !== "undefined") out.bed_day_growth_rate = bedYoy;
  if (typeof bedMom !== "undefined") out.bed_day_mom_growth_rate = bedMom;

  if (typeof (payload?.trend ?? std.trend) === "string")
    out.trend = payload?.trend ?? std.trend;

  return Object.keys(out).length ? out : null;
}

function deriveDoctors(rows: any[]) {
  const map = new Map<string, string>();
  for (const r of rows || []) {
    let id: any =
      (r as any)?.doctor_id ??
      (r as any)?.doctorCode ??
      (r as any)?.doctor ??
      null;
    let name: any =
      (r as any)?.doctor_name ??
      (r as any)?.doctorName ??
      (r as any)?.doctor ??
      null;

    if (id == null && name != null) id = String(name);
    if (id != null) {
      const key = String(id);
      if (!map.has(key)) map.set(key, String(name ?? id));
    }
  }
  return Array.from(map, ([id, name]) => ({ id, name }));
}

export default function InpatientTotalRevenue() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [doctors, setDoctors] = useState<{ id: string; name: string }[]>([]);
  const [summary, setSummary] = useState<any>(null);

  // 明细（服务端分页）
  const rowsPerPage = 20;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [details, setDetails] = useState<DetailsRow[]>([]);
  const pagedRows = details;

  // 排序
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // 趋势数据：只显示“收入 + 床日”的增长率折线图
  const [tsRows, setTsRows] = useState<TSRow[]>([]);
  const [compare, setCompare] = useState<CompareKind>("yoy"); // 默认同比

  // 视图切换（数据表 / 趋势图）
  const [viewMode, setViewMode] = useState<"details" | "chart">("details");
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const v = sp.get("view");
      if (v === "chart" || v === "details")
        setViewMode(v as "details" | "chart");
    } catch {
      // ignore
    }
  }, []);
  const setAndSyncView = (v: "details" | "chart") => {
    setViewMode(v);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("view", v);
      window.history.replaceState({}, "", url);
    } catch {
      // ignore
    }
  };

  const todayStr = getToday(0);
  // 开始&结束日期：初始化即为“今天=今天”
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);

  // 科室/医生多选 + 搜索
  const [selectedDeps, setSelectedDeps] = useState<string[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [depDropdownOpen, setDepDropdownOpen] = useState(false);
  const [docDropdownOpen, setDocDropdownOpen] = useState(false);
  const [depSearch, setDepSearch] = useState("");
  const [docSearch, setDocSearch] = useState("");

  const filteredDepartments = useMemo(() => {
    const kw = depSearch.trim();
    if (!kw) return departments;
    return departments.filter(
      (d) => d.name.includes(kw) || d.code.includes(kw)
    );
  }, [depSearch, departments]);

  const filteredDoctors = useMemo(() => {
    const kw = docSearch.trim();
    if (!kw) return doctors;
    return doctors.filter(
      (d) => d.name.includes(kw) || d.id.includes(kw)
    );
  }, [docSearch, doctors]);

  const sortedRows = useMemo(() => {
    // 先按医生筛选
    const base = (() => {
      if (!selectedDocs.length) return pagedRows;
      const docSet = new Set(selectedDocs);
      return pagedRows.filter((r) => {
        const id =
          (r as any).doctor_id ??
          (r as any).doctor ??
          (r as any).doctor_name ??
          null;
        const name =
          (r as any).doctor_name ??
          (r as any).doctor ??
          (r as any).doctor_id ??
          null;
        if (id != null && docSet.has(String(id))) return true;
        if (name != null && docSet.has(String(name))) return true;
        return false;
      });
    })();

    const getSortValue = (r: DetailsRow): any => {
      switch (sortKey) {
        case "date":
          return new Date(r.date);
        case "department":
          return r.department_name || r.department_code || "";
        case "doctor":
          return (
            (r as any).doctor_name ||
            (r as any).doctor_id ||
            (r as any).doctor ||
            ""
          );
        case "revenue":
          return typeof r.revenue === "number" ? r.revenue : null;
        case "revenue_yoy":
          return r.revenue_growth_pct ?? null;
        case "revenue_mom": {
          const raw =
            (r as any).revenue_mom_growth_pct ??
            (r as any).mom_growth_pct ??
            (r as any).mom_growth_rate ??
            (r as any)["收入环比增长率"] ??
            null;
          if (raw == null) return null;
          const n =
            typeof raw === "number"
              ? raw
              : Number(String(raw).replace(/[\s,%]/g, ""));
          return Number.isFinite(n) ? n : null;
        }
        default:
          return null;
      }
    };

    const cmp = (a: DetailsRow, b: DetailsRow) => {
      const va = getSortValue(a);
      const vb = getSortValue(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;

      if (va instanceof Date && vb instanceof Date) {
        return va.getTime() - vb.getTime();
      }
      if (typeof va === "number" && typeof vb === "number") {
        return va - vb;
      }
      const sa = String(va);
      const sb = String(vb);
      return sa.localeCompare(sb, "zh-CN");
    };

    const sign = sortDir === "asc" ? 1 : -1;
    const arr = [...base];
    arr.sort((a, b) => cmp(a, b) * sign);
    return arr;
  }, [pagedRows, selectedDocs, sortKey, sortDir]);

  async function fetchDetails(
    start: string,
    end: string,
    deps?: string[] | null,
    pageNo = 1
  ) {
    const limit = rowsPerPage;
    const offset = (pageNo - 1) * rowsPerPage;

    const payload: Record<string, any> = {
      start_date: start,
      end_date: end,
      limit,
      offset,
    };
    if (deps && deps.length) payload.departments = deps;

    const res = await apiFetch(`${API_BASE}/details`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`DETAILS 请求失败：${res.status}`);

    const data = (await res.json()) as DetailsResponse;
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    setDetails(rows);
    setTotal(
      Number.isFinite((data?.total as any) ?? NaN)
        ? Number(data.total)
        : rows.length
    );

    const ds = deriveDoctors(rows);
    setDoctors(ds);
    // 清理已选但不再存在的医生
    setSelectedDocs((prev) =>
      prev.filter((id) => ds.some((d) => d.id === id))
    );
  }

  async function fetchTimeseries(
    start: string,
    end: string,
    deps?: string[] | null
  ) {
    const data = await fetchTimeseriesAPI({ start, end, deps });
    setTsRows(Array.isArray(data?.rows) ? data.rows : []);
  }

  // 初始化：加载科室 + 今日汇总 + 今日明细 + 今日趋势
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await apiFetch(`${API_BASE}/init`);
        if (!res.ok) throw new Error(`INIT 请求失败：${res.status}`);

        const data = (await res.json()) as InitResponse;
        setDepartments(Array.isArray(data?.departments) ? data.departments : []);

        const parsed = extractSummaryFromStd(data);
        setSummary(parsed);

        const today = getToday(0);
        setStartDate(today);
        setEndDate(today);
        setPage(1);

        await Promise.all([
          fetchDetails(today, today, null, 1),
          fetchTimeseries(today, today, null),
        ]);
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    };
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchSummaryAPIWrap(
    override?: { start: string; end: string; deps?: string[] | null }
  ) {
    const start = override?.start ?? startDate;
    const end = override?.end ?? endDate;
    const deps =
      override?.deps ?? (selectedDeps.length ? selectedDeps : null);

    const data = await fetchSummaryAPI({
      start,
      end,
      deps,
    });
    const curSum = extractSummaryFromStd(data);
    const sumWithMom = await maybeEnsureMoM({
      currentSummary: curSum,
      start,
      end,
      deps,
    });
    setSummary(sumWithMom);
  }

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
      await fetchSummaryAPIWrap({
        start: startDate,
        end: endDate,
        deps,
      });
      setPage(1);

      await Promise.all([
        fetchDetails(startDate, endDate, deps, 1),
        fetchTimeseries(startDate, endDate, deps),
      ]);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const onReset = async () => {
    const today = getToday(0);
    setStartDate(today);
    setEndDate(today);
    setSelectedDeps([]);
    setSelectedDocs([]);
    setDepSearch("");
    setDocSearch("");
    setError("");
    setPage(1);
    setCompare("yoy");
    setSortKey("date");
    setSortDir("desc");

    setLoading(true);
    try {
      await fetchSummaryAPIWrap({ start: today, end: today, deps: null });
      await Promise.all([
        fetchDetails(today, today, null, 1),
        fetchTimeseries(today, today, null),
      ]);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDep = (code: string) => {
    setSelectedDeps((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleToggleDoc = (id: string) => {
    setSelectedDocs((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <span className="text-xs text-gray-400">↕</span>;
    return (
      <span className="text-xs text-gray-500">
        {sortDir === "asc" ? "↑" : "↓"}
      </span>
    );
  };

  const depSummaryLabel =
    selectedDeps.length === 0
      ? "全部科室"
      : selectedDeps.length === 1
      ? departments.find((d) => d.code === selectedDeps[0])?.name ||
        selectedDeps[0]
      : `已选 ${selectedDeps.length} 个科室`;

  const docSummaryLabel =
    selectedDocs.length === 0
      ? "全部医生"
      : selectedDocs.length === 1
      ? doctors.find((d) => d.id === selectedDocs[0])?.name ||
        selectedDocs[0]
      : `已选 ${selectedDocs.length} 位医生`;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold mb-2 text-left">住院收入分析</h1>

      {error && (
        <div className="text-red-500 text-left space-y-1">
          <div>错误：{error}</div>
          <div className="text-xs text-gray-600">
            如果提示“网络错误/请求超时”，多为前端代理未连通或后端未启动。开发时可设置{" "}
            <code>VITE_API_BASE</code> 指向后端地址，或检查 Vite 代理与后端服务。
          </div>
        </div>
      )}

      {/* 筛选区域 */}
      <form
        onSubmit={onSubmitSummary}
        className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end text-left bg-white p-4 rounded-lg border"
      >
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1 flex items-center gap-1">
            开始日期<span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border rounded px-2 py-1 text-left"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1 flex items-center gap-1">
            结束日期<span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border rounded px-2 py-1 text-left"
          />
        </div>

        <div className="flex flex-col gap-3">
          {/* 科室多选 */}
          <div className="flex-1">
            <label className="text-sm text-gray-600 mb-1">科室筛选</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setDepDropdownOpen((o) => !o)}
                className="w-full border rounded px-2 py-1 flex justify-between items-center text-left"
              >
                <span className="truncate">{depSummaryLabel}</span>
                <span className="text-xs text-gray-500">
                  {depDropdownOpen ? "▲" : "▼"}
                </span>
              </button>
              {depDropdownOpen && (
                <div className="absolute z-20 mt-1 w-72 max-h-80 overflow-auto border bg-white rounded shadow">
                  <div className="p-2 border-b">
                    <input
                      placeholder="搜索科室名称/编码"
                      value={depSearch}
                      onChange={(e) => setDepSearch(e.target.value)}
                      className="w-full border rounded px-2 py-1 text-sm"
                    />
                  </div>
                  <div className="max-h-60 overflow-auto">
                    {filteredDepartments.length === 0 ? (
                      <div className="p-2 text-xs text-gray-400">
                        没有匹配的科室
                      </div>
                    ) : (
                      filteredDepartments.map((d) => (
                        <label
                          key={d.code}
                          className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 cursor-pointer text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={selectedDeps.includes(d.code)}
                            onChange={() => handleToggleDep(d.code)}
                          />
                          <span className="truncate">
                            {d.name} ({d.code})
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                  <div className="p-2 border-t flex justify-between text-xs text-gray-600">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedDeps(filteredDepartments.map((d) => d.code))
                      }
                      className="hover:text-blue-600"
                    >
                      全选当前列表
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDeps([])}
                      className="hover:text-blue-600"
                    >
                      清空
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 医生多选（本地） */}
          <div className="flex-1">
            <label className="text-sm text-gray-600 mb-1">
              医生筛选（本地，不请求后端）
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setDocDropdownOpen((o) => !o)}
                className="w-full border rounded px-2 py-1 flex justify-between items-center text-left"
              >
                <span className="truncate">{docSummaryLabel}</span>
                <span className="text-xs text-gray-500">
                  {docDropdownOpen ? "▲" : "▼"}
                </span>
              </button>
              {docDropdownOpen && (
                <div className="absolute z-20 mt-1 w-72 max-h-80 overflow-auto border bg-white rounded shadow">
                  <div className="p-2 border-b">
                    <input
                      placeholder="搜索医生姓名/编号"
                      value={docSearch}
                      onChange={(e) => setDocSearch(e.target.value)}
                      className="w-full border rounded px-2 py-1 text-sm"
                    />
                  </div>
                  <div className="max-h-60 overflow-auto">
                    {filteredDoctors.length === 0 ? (
                      <div className="p-2 text-xs text-gray-400">
                        暂无医生数据
                      </div>
                    ) : (
                      filteredDoctors.map((d) => (
                        <label
                          key={d.id}
                          className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 cursor-pointer text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={selectedDocs.includes(d.id)}
                            onChange={() => handleToggleDoc(d.id)}
                          />
                          <span className="truncate">
                            {d.name} ({d.id})
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                  <div className="p-2 border-t flex justify-between text-xs text-gray-600">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedDocs(filteredDoctors.map((d) => d.id))
                      }
                      className="hover:text-blue-600"
                    >
                      全选当前列表
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDocs([])}
                      className="hover:text-blue-600"
                    >
                      清空
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-start gap-3 md:col-span-1">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60 w-full"
          >
            {loading ? "查询中..." : "应用筛选"}
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={loading}
            className="px-4 py-2 rounded border bg-white disabled:opacity-60 w-full"
          >
            重置
          </button>
        </div>
      </form>

      {/* 汇总卡片 */}
      <section className="p-4 border rounded-lg bg-white">
        <h2 className="text-lg font-semibold mb-3 text-left">汇总概览</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-left text-sm">
          <div className="space-y-1">
            <div className="text-gray-600">总收入</div>
            <div className="text-lg font-mono">
              {summary?.total_revenue?.toLocaleString?.() ?? "-"}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-gray-600">收入同比增长 (YoY)</div>
            <div
              className={
                typeof summary?.yoy_growth_rate === "number"
                  ? summary.yoy_growth_rate >= 0
                    ? "text-green-600"
                    : "text-red-600"
                  : ""
              }
            >
              {typeof summary?.yoy_growth_rate === "number"
                ? `${summary.yoy_growth_rate.toFixed(2)}%`
                : "-"}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-gray-600">收入环比增长 (MoM)</div>
            <div
              className={
                typeof summary?.mom_growth_rate === "number"
                  ? summary.mom_growth_rate >= 0
                    ? "text-green-600"
                    : "text-red-600"
                  : ""
              }
            >
              {typeof summary?.mom_growth_rate === "number"
                ? `${summary.mom_growth_rate.toFixed(2)}%`
                : "-"}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-gray-600">床日同比增长</div>
            <div
              className={
                typeof summary?.bed_day_growth_rate === "number"
                  ? summary.bed_day_growth_rate >= 0
                    ? "text-green-600"
                    : "text-red-600"
                  : ""
              }
            >
              {typeof summary?.bed_day_growth_rate === "number"
                ? `${summary.bed_day_growth_rate.toFixed(2)}%`
                : "-"}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-gray-600">床日环比增长</div>
            <div
              className={
                typeof summary?.bed_day_mom_growth_rate === "number"
                  ? summary.bed_day_mom_growth_rate >= 0
                    ? "text-green-600"
                    : "text-red-600"
                  : ""
              }
            >
              {typeof summary?.bed_day_mom_growth_rate === "number"
                ? `${summary.bed_day_mom_growth_rate.toFixed(2)}%`
                : "-"}
            </div>
          </div>
        </div>
      </section>

      {/* 数据详情 + 趋势分析 */}
      <section className="p-4 border rounded-lg bg-white">
        <div className="flex items-center justify-between mb-3">
          <div className="inline-flex rounded-lg overflow-hidden border">
            <button
              type="button"
              onClick={() => setAndSyncView("details")}
              className={`px-3 py-1 text-sm ${
                viewMode === "details"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700"
              }`}
            >
              数据详情
            </button>
            <button
              type="button"
              onClick={() => setAndSyncView("chart")}
              className={`px-3 py-1 text-sm ${
                viewMode === "chart"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700"
              }`}
            >
              趋势分析
            </button>
          </div>

          {viewMode === "chart" && (
            <div className="inline-flex rounded-lg overflow-hidden border text-sm">
              <button
                type="button"
                onClick={() => setCompare("yoy")}
                className={`px-3 py-1 ${
                  compare === "yoy"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700"
                }`}
              >
                同比
              </button>
              <button
                type="button"
                onClick={() => setCompare("mom")}
                className={`px-3 py-1 ${
                  compare === "mom"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700"
                }`}
              >
                环比
              </button>
            </div>
          )}
        </div>

        {/* 数据详情 */}
        <div className={viewMode === "chart" ? "hidden" : ""}>
          <div className="overflow-auto rounded border">
            <table className="min-w-full text-sm text-gray-900 text-left">
              <thead>
                <tr className="bg-gray-50 border-b text-gray-700">
                  <th className="px-3 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort("date")}
                      className="flex items-center gap-1"
                    >
                      <span>日期</span>
                      {renderSortIcon("date")}
                    </button>
                  </th>
                  <th className="px-3 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort("department")}
                      className="flex items-center gap-1"
                    >
                      <span>科室</span>
                      {renderSortIcon("department")}
                    </button>
                  </th>
                  <th className="px-3 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort("doctor")}
                      className="flex items-center gap-1"
                    >
                      <span>医生</span>
                      {renderSortIcon("doctor")}
                    </button>
                  </th>
                  <th className="px-3 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort("revenue")}
                      className="flex items-center gap-1"
                    >
                      <span>收入</span>
                      {renderSortIcon("revenue")}
                    </button>
                  </th>
                  <th className="px-3 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort("revenue_yoy")}
                      className="flex items-center gap-1"
                    >
                      <span>收入同比增长率</span>
                      {renderSortIcon("revenue_yoy")}
                    </button>
                  </th>
                  <th className="px-3 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort("revenue_mom")}
                      className="flex items-center gap-1"
                    >
                      <span>收入环比增长率</span>
                      {renderSortIcon("revenue_mom")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-gray-400 py-4 text-center">
                      暂无数据
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((r, idx) => (
                    <tr
                      key={idx}
                      className="border-t hover:bg-gray-50 cursor-default"
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatDate(r.date)}
                      </td>
                      <td
                        className="px-3 py-2 truncate"
                        title={r.department_name || r.department_code || "—"}
                      >
                        {r.department_name || r.department_code || "—"}
                      </td>
                      <td
                        className="px-3 py-2 truncate"
                        title={
                          (r as any).doctor_name ||
                          (r as any).doctor_id ||
                          "—"
                        }
                      >
                        {(r as any).doctor_name ||
                          (r as any).doctor_id ||
                          "—"}
                      </td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">
                        {typeof r.revenue === "number"
                          ? r.revenue.toLocaleString()
                          : "-"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.revenue_growth_pct == null ? (
                          "-"
                        ) : (
                          <span
                            className={
                              Number(r.revenue_growth_pct) >= 0
                                ? "text-green-600"
                                : "text-red-600"
                            }
                          >
                            {Number(r.revenue_growth_pct).toFixed(2)}%
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {(() => {
                          const raw =
                            (r as any).revenue_mom_growth_pct ??
                            (r as any).mom_growth_pct ??
                            (r as any).mom_growth_rate ??
                            (r as any)["收入环比增长率"] ??
                            null;
                          if (raw == null) return "-";
                          const n =
                            typeof raw === "number"
                              ? raw
                              : Number(
                                  String(raw).replace(/[\s,%]/g, "")
                                );
                          if (!Number.isFinite(n)) return "-";
                          return (
                            <span
                              className={
                                n >= 0 ? "text-green-600" : "text-red-600"
                              }
                            >
                              {n.toFixed(2)}%
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3">
            <Pagination
              page={page}
              pageSize={rowsPerPage}
              total={total}
              disabled={loading}
              onChange={async (next) => {
                setPage(next);
                await fetchDetails(
                  startDate,
                  endDate,
                  selectedDeps.length ? selectedDeps : null,
                  next
                );
              }}
            />
          </div>

          <p className="text-xs text-gray-500 mt-2 text-left">
            提示：点击表头可以按该列排序（再次点击切换升序/降序）；日期按时间先后排序。
          </p>
        </div>

        {/* 趋势分析：收入 + 床日 的同比/环比增长率 */}
        <div className={viewMode === "details" ? "hidden" : ""}>
          {tsRows.length === 0 ? (
            <div className="text-gray-400 text-sm">暂无趋势数据</div>
          ) : (
            <div className="border rounded-lg p-3 bg-white">
              <div className="mb-3 font-semibold text-sm">
                趋势折线图（收入 &amp; 床日增长率）
              </div>
              <LineChart
                rows={tsRows.map((r) => ({
                  date: r.date,
                  yoy_pct: r.yoy_pct ?? null,
                  mom_pct: r.mom_pct ?? null,
                  bed_yoy_pct:
                    (r as any).bed_yoy_pct != null
                      ? (r as any).bed_yoy_pct
                      : null,
                  bed_mom_pct:
                    (r as any).bed_mom_pct != null
                      ? (r as any).bed_mom_pct
                      : null,
                }))}
                compare={compare}
                onToggleCompare={setCompare}
              />
              <p className="text-xs text-gray-500 mt-2 text-left">
                注：蓝色折线表示收入增长率，绿色折线表示床日增长率。
                “同比” = 去年同期同日；“环比” = 同长度上一周期对应日期。
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
