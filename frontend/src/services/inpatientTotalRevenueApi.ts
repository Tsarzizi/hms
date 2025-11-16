// src/services/inpatientTotalRevenueApi.ts
// ------------------------------------------------------
// 住院收入分析 API 服务层（前端分页版）
// 修改内容：
//   1. fetchDetailsAPI 不再传 limit / offset
//   2. DetailsResponse 不再包含 limit/offset
//   3. 后端 /details 只需返回 rows + total
//   4. /init 现在返回 doctors（医生+科室映射）
//   5. fetchDetailsAPI 增加 doctors 字段
// ------------------------------------------------------
export type Trend = "同向" | "反向" | "持平/未知" | string;

export interface DepartmentOption {
  code: string;
  name: string;
}

export interface DoctorOption {
  id: string;
  name: string;
}

// 科室下医生结构（来自 /init 的 doctors）
export interface DepDoctor {
  doc_id: string;
  doc_name: string;
}

export interface DepDocMapRow {
  dep_id: string;
  dep_name: string;
  doctors: DepDoctor[];
}

export interface DepDocMapResponse {
  success: boolean;
  rows: DepDocMapRow[];
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
  item_class_name?: string;
  quantity?: number;
}

// ⭐ InitResponse：增加 doctors 字段（来自 get_doc_dep_map）
export interface InitResponse {
  success: boolean;
  date?: string;

  // 旧的科室列表字段（目前前端已从 doctors 推导，可保留以兼容）
  departments?: DepartmentOption[];

  // 新：医生 + 绩效科室映射
  doctors?: {
    doc_id: string;
    doc_name: string;
    dep_id: string;
    dep_name: string;
  }[];

  summary?: RevenueSummaryStd;
}

export interface SummaryResponse {
  success: boolean;
  date?: string;
  date_range?: { start: string; end: string };
  departments?: string[] | null;
  summary: RevenueSummaryStd;
  [k: string]: any;
}

// ⭐ 修改：去掉 limit / offset（后端不再分页）
export interface DetailsResponse {
  success: boolean;
  rows: DetailsRow[];
  total: number;
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

// --- 基础封装 ---
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

// 初始化（医生+科室映射 + 汇总 + 今日日期）
export async function fetchInitAPI(): Promise<InitResponse> {
  const res = await apiFetch(`${API_BASE}/init`);
  if (!res.ok) throw new Error(`INIT 请求失败：${res.status}`);
  return res.json();
}

// 汇总（summary）
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

// ⭐ 关键修改：后端不分页 → 删除 limit / offset 参数
// ⭐ 同时增加 doctors 字段，把医生 ID 传给后端
export async function fetchDetailsAPI(params: {
  start: string;
  end: string;
  deps?: string[] | null;
  doctors?: string[] | null;
}): Promise<DetailsResponse> {
  const { start, end, deps, doctors } = params;

  const payload: Record<string, any> = {
    start_date: start,
    end_date: end,
  };
  if (deps && deps.length) {
    // 这里 deps 已经是“科室名称”数组（由 hooks 里 getDepsOrNull 处理）
    payload.departments = deps;
  }
  if (doctors && doctors.length) {
    payload.doctors = doctors;
  }

  const res = await apiFetch(`${API_BASE}/details`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`DETAILS 请求失败：${res.status}`);
  return res.json();
}

// 趋势数据
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

// --- 汇总模型转换 ---
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

// 缺少环比时自动补一次上一周期 summary
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

// 从明细中推导出医生列表（用于前端筛选）
// 现在主路径改为：从 /init 的 doctors 获取医生，
// 本方法保留，便于将来需要从明细兜底推导。
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
/* =================== 统一查询接口（/query） =================== */

export interface FullQuerySummary extends SummaryViewModel {
  /** 查询期内总床日数（可选，用于展示） */
  total_bed_days?: number;
}

export interface FullQueryResponse {
  success: boolean;
  date_range?: { start: string; end: string };
  departments?: string[] | null;
  doctors?: string[] | null;
  summary?: FullQuerySummary | null;
  /** 折线图数据 */
  timeseries?: TSRow[];
  /** 明细数据（推荐使用 details） */
  details?: DetailsRow[];
  /** 为兼容，后端也可能返回 rows 字段 */
  rows?: DetailsRow[];
  total?: number;
}

/**
 * 统一查询接口：后端会根据是否有 doctors 自动切换科室/医生模式
 */
export async function fetchFullAPI(params: {
  start: string;
  end: string;
  deps?: string[] | null;
  docs?: string[] | null;
}): Promise<FullQueryResponse> {
  const { start, end, deps, docs } = params;

  const payload: Record<string, any> = {
    start_date: start,
    end_date: end,
  };
  if (deps && deps.length) payload.departments = deps;
  if (docs && docs.length) payload.doctors = docs;

  const res = await apiFetch(`${API_BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`QUERY 请求失败：${res.status}`);
  return res.json();
}
