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
  dep,
}: {
  start: string;
  end?: string;
  dep?: string | null;
}) {
  const payload: Record<string, any> = { start_date: start };
  if (end && end !== start) payload.end_date = end;
  if (dep) payload.department = dep;

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
  dep,
}: {
  start: string;
  end?: string;
  dep?: string | null;
}) {
  const payload: Record<string, any> = { start_date: start };
  if (end && end !== start) payload.end_date = end;
  if (dep) payload.departments = [dep];

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
  dep,
}: {
  currentSummary: any;
  start: string;
  end?: string;
  dep?: string | null;
}) {
  const hasMom =
    typeof currentSummary?.mom_growth_rate === "number" &&
    Number.isFinite(currentSummary.mom_growth_rate);
  if (hasMom) return currentSummary;

  const { prevStart, prevEnd } = getPrevRange(start, end);
  const prevPayload = await fetchSummaryAPI({
    start: prevStart,
    end: prevEnd,
    dep,
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
  const [doctors, setDoctors] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);

  // 明细（服务端分页）
  const rowsPerPage = 20;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [details, setDetails] = useState<DetailsRow[]>([]);
  const pagedRows = details;
  const pageCount = Math.max(1, Math.ceil(total / rowsPerPage)); // 目前没用到 pageCount，但先保留

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

  const [startDate, setStartDate] = useState(getToday(0));
  const [endDate, setEndDate] = useState("");
  const [selectedDep, setSelectedDep] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    if (!selectedDoc) return pagedRows;
    return pagedRows.filter(
      (r) =>
        (r as any)?.doctor_id === selectedDoc ||
        (r as any)?.doctor_name === selectedDoc
    );
  }, [pagedRows, selectedDoc]);

  async function fetchDetails(
    start: string,
    end?: string,
    dep?: string | null,
    pageNo = 1
  ) {
    const limit = rowsPerPage;
    const offset = (pageNo - 1) * rowsPerPage;

    const payload: Record<string, any> = {
      start_date: start,
      limit,
      offset,
    };
    if (end && end !== start) payload.end_date = end;
    if (dep) payload.department = dep;

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
    if (selectedDoc && !ds.some((d) => d.id === selectedDoc))
      setSelectedDoc(null);
  }

  async function fetchTimeseries(
    start: string,
    end?: string,
    dep?: string | null
  ) {
    const data = await fetchTimeseriesAPI({ start, end, dep });
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

        setPage(1);
        const today = getToday(0);

        await Promise.all([
          fetchDetails(today, undefined, undefined, 1),
          fetchTimeseries(today, undefined, undefined),
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

  async function fetchSummaryAPIWrap() {
    const data = await fetchSummaryAPI({
      start: startDate,
      end: endDate || undefined,
      dep: selectedDep || null,
    });
    const curSum = extractSummaryFromStd(data);
    const sumWithMom = await maybeEnsureMoM({
      currentSummary: curSum,
      start: startDate,
      end: endDate || undefined,
      dep: selectedDep || null,
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
    if (endDate && new Date(startDate) > new Date(endDate)) {
      setError("开始日期不能晚于结束日期");
      return;
    }

    try {
      setLoading(true);
      await fetchSummaryAPIWrap();
      setPage(1);

      await Promise.all([
        fetchDetails(startDate, endDate || undefined, selectedDep || null, 1),
        fetchTimeseries(startDate, endDate || undefined, selectedDep || null),
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
    setEndDate("");
    setSelectedDep(null);
    setSelectedDoc(null);
    setError("");
    setPage(1);
    setCompare("yoy");

    setLoading(true);
    try {
      await fetchSummaryAPIWrap();
      await Promise.all([
        fetchDetails(today, undefined, null, 1),
        fetchTimeseries(today, undefined, null),
      ]);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

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
        className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end text-left"
      >
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">开始日期</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border rounded px-2 py-1 text-left"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">
            结束日期（可选）
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border rounded px-2 py-1 text-left"
          />
        </div>

        <div className="flex flex-col md:flex-row md:items-end gap-3 justify-start">
          <div className="flex-1">
            <label className="text-sm text-gray-600 mb-1">科室</label>
            <select
              className="border rounded w-full px-2 py-1 text-left"
              value={selectedDep || ""}
              onChange={(e) => setSelectedDep(e.target.value || null)}
            >
              <option value="">全部</option>
              {departments.length === 0 ? (
                <option value="" disabled>
                  暂无数据
                </option>
              ) : (
                departments.map((d, i) => (
                  <option key={i} value={d.code}>
                    {d.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="flex-1">
            <label className="text-sm text-gray-600 mb-1">
              医生（本地筛选，不请求后端）
            </label>
            <select
              className="border rounded w-full px-2 py-1 text-left"
              value={selectedDoc || ""}
              onChange={(e) => setSelectedDoc(e.target.value || null)}
            >
              <option value="">全部</option>
              {doctors.length === 0 ? (
                <option value="" disabled>
                  暂无数据
                </option>
              ) : (
                doctors.map((d, i) => (
                  <option key={i} value={d.id}>
                    {d.name}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        <div className="md:col-span-3 flex items-center justify-start gap-3">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
          >
            {loading ? "查询中..." : "应用筛选"}
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={loading}
            className="px-4 py-2 rounded border bg-white disabled:opacity-60"
          >
            重置
          </button>
        </div>
      </form>

      {/* 汇总卡片 */}
      <section className="p-4 border rounded-lg bg-white">
        <h2 className="text-lg font-semibold mb-3 text-left">汇总</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-left">
          <div className="space-y-1">
            <div className="text-sm text-gray-600">总收入</div>
            <div className="text-lg font-mono">
              {summary?.total_revenue?.toLocaleString?.() ?? "-"}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-gray-600">收入同比增长 (YoY)</div>
            <div>
              {typeof summary?.yoy_growth_rate === "number"
                ? `${summary.yoy_growth_rate.toFixed(2)}%`
                : "-"}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-gray-600">收入环比增长 (MoM)</div>
            <div>
              {typeof summary?.mom_growth_rate === "number"
                ? `${summary.mom_growth_rate.toFixed(2)}%`
                : "-"}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-gray-600">床日同比增长</div>
            <div>
              {typeof summary?.bed_day_growth_rate === "number"
                ? `${summary.bed_day_growth_rate.toFixed(2)}%`
                : "-"}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-gray-600">床日环比增长</div>
            <div>
              {typeof summary?.bed_day_mom_growth_rate === "number"
                ? `${summary.bed_day_mom_growth_rate.toFixed(2)}%`
                : "-"}
            </div>
          </div>
        </div>
      </section>

      {/* 数据详情 + 趋势分析 */}
      <section className="p-4 border rounded-lg bg-white">
        <div className="flex items-center justify-start mb-3">
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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {/* 数据详情 */}
          <div
            className={`lg:col-span-2 ${
              viewMode === "chart" ? "hidden" : ""
            }`}
          >
            <div className="overflow-auto">
              <table className="min-w-full text-sm text-gray-900 table-fixed text-left">
                <thead>
                  <tr className="bg-gray-50 border-b text-gray-700">
                    <th className="px-3 py-2">日期</th>
                    <th className="px-3 py-2">科室</th>
                    <th className="px-3 py-2">医生</th>
                    <th className="px-3 py-2">收入</th>
                    <th className="px-3 py-2">收入同比增长率</th>
                    <th className="px-3 py-2">收入环比增长率</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-gray-400 py-4">
                        暂无数据
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((r, idx) => (
                      <tr
                        key={idx}
                        className="border-t hover:bg-gray-50 cursor-default"
                      >
                        <td className="px-3 py-2 whitespace-nowrap">
                          {formatDate(r.date)}
                        </td>
                        <td
                          className="px-3 py-2 truncate"
                          title={
                            r.department_name || r.department_code || "—"
                          }
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
                        <td className="px-3 py-2 font-mono">
                          {typeof r.revenue === "number"
                            ? r.revenue.toLocaleString()
                            : "-"}
                        </td>
                        <td className="px-3 py-2">
                          {r.revenue_growth_pct == null
                            ? "-"
                            : `${Number(r.revenue_growth_pct).toFixed(2)}%`}
                        </td>
                        <td className="px-3 py-2">
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
                                : Number(String(raw).replace(/[\s,%]/g, ""));
                            return Number.isFinite(n)
                              ? `${n.toFixed(2)}%`
                              : "-";
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
                    endDate || undefined,
                    selectedDep || null,
                    next
                  );
                }}
              />
            </div>
          </div>

          {/* 趋势分析：收入 + 床日 的同比/环比增长率 */}
          <div
            className={`border rounded-lg p-3 bg-white ${
              viewMode === "details" ? "hidden" : "lg:col-span-3"
            }`}
          >
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <span className="font-semibold">
                趋势折线图（收入 &amp; 床日增长率）
              </span>
            </div>

            {tsRows.length === 0 ? (
              <div className="text-gray-400 text-sm">暂无趋势数据</div>
            ) : (
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
            )}

            <p className="text-xs text-gray-500 mt-2 text-left">
              注：蓝色折线表示收入增长率，绿色折线表示床日增长率。
              “同比” = 去年同期同日；“环比” = 同长度上一周期对应日期。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
