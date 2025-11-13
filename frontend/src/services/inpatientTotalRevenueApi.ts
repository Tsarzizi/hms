// src/services/inpatientTotalRevenueApi.ts
import type { RequestInit } from "react";

export type Trend = "同向" | "反向" | "持平/未知" | string;

export interface DepartmentOption {
  code: string;
  name: string;
}

export interface DoctorOption {
  id: string;
  name: string;
}

export interface RevenueSummaryStd {
  current: number;
  growth_rate?: number | null;
  mom_growth_rate?: number | null;
  bed_growth_rate?: number | null;
  bed_mom_growth_rate?: number | null;
  trend?: Trend;
}

export interface DetailsRow {
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

export interface InitResponse {
  success: boolean;
  date?: string;
  departments?: DepartmentOption[];
  summary?: RevenueSummaryStd;
}

export interface SummaryResponse {
  success: boolean;
  date?: string;
  date_range?: { start: string; end: string };
  departments?: string[] | null;
  summary: RevenueSummaryStd;
  // 后端可能还带 revenue / bed 等字段，这里不做强约束
  [k: string]: any;
}

export interface DetailsResponse {
  success: boolean;
  date?: string;
  date_range?: { start: string; end: string };
  departments?: string[] | null;
  rows: DetailsRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface TSRow {
  date: string;
  revenue: number;
  last_year: number | null;
  yoy_pct: number | null;
  mom_pct: number | null;
  bed_yoy_pct?: number | null;
  bed_mom_pct?: number | null;
}

export interface TSResponse {
  success: boolean;
  rows: TSRow[];
  date?: string;
  date_range?: { start: string; end: string };
  departments?: string[] | null;
}

export type SortKey =
  | "date"
  | "department"
  | "doctor"
  | "revenue"
  | "revenue_yoy"
  | "revenue_mom";

// 支持环境变量覆盖：VITE_API_BASE
export const API_BASE =
  typeof import.meta !== "undefined" &&
  (import.meta as any).env &&
  (import.meta as any).env.VITE_API_BASE
    ? (import.meta as any).env.VITE_API_BASE
    : "/api/inpatient_total_revenue";

export function getToday(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split("T")[0];
}

export function getPrevRange(startStr: string, endStr?: string) {
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

export async function apiFetch(
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

export async function fetchInitAPI(): Promise<InitResponse> {
  const res = await apiFetch(`${API_BASE}/init`);
  if (!res.ok) throw new Error(`INIT 请求失败：${res.status}`);
  return res.json();
}

export async function fetchSummaryAPI(params: {
  start: string;
  end: string;
  deps?: string[] | null;
}): Promise<SummaryResponse> {
  const { start, end, deps } = params;
  const payload: Record<string, any> = {
    start_date: start,
    end_date: end,
  };
  if (deps && deps.length) payload.departments = deps;

  const res = await apiFetch(`${API_BASE}/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`SUMMARY 请求失败：${res.status}`);
  return res.json();
}

export async function fetchDetailsAPI(params: {
  start: string;
  end: string;
  deps?: string[] | null;
  limit: number;
  offset: number;
}): Promise<DetailsResponse> {
  const { start, end, deps, limit, offset } = params;
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
  return res.json();
}

export async function fetchTimeseriesAPI(params: {
  start: string;
  end: string;
  deps?: string[] | null;
}): Promise<TSResponse> {
  const { start, end, deps } = params;
  const payload: Record<string, any> = { start_date: start, end_date: end };
  if (deps && deps.length) payload.departments = deps;

  const res = await apiFetch(`${API_BASE}/timeseries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`TIMESERIES 请求失败：${res.status}`);
  return res.json();
}

export interface SummaryViewModel {
  total_revenue?: number;
  yoy_growth_rate?: number;
  mom_growth_rate?: number;
  bed_day_growth_rate?: number;
  bed_day_mom_growth_rate?: number;
  trend?: Trend;
}

export function extractSummaryFromStd(payload: any): SummaryViewModel | null {
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

  const out: SummaryViewModel = {};
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

export async function maybeEnsureMoM(params: {
  currentSummary: SummaryViewModel | null;
  start: string;
  end: string;
  deps?: string[] | null;
}): Promise<SummaryViewModel | null> {
  const { currentSummary, start, end, deps } = params;
  if (!currentSummary) return null;

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

export function formatDate(dateStr?: string | null) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(+d)) return String(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function deriveDoctors(rows: any[]): DoctorOption[] {
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
