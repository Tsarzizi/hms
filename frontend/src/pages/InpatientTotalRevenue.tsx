import { useEffect, useMemo, useState } from "react";

const API_BASE = "/api/inpatient_total_revenue";
const PAGE_SIZE = 20;

/** ---------- 工具 ---------- */
function getToday(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split("T")[0];
}
function formatDate(dateStr?: string) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d as any)) return dateStr;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
function extractSummaryFromStd(payload: any) {
  const rev = payload?.revenue || {};
  const std = payload?.summary || {};
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
  const current = toNum(std.current ?? rev.current_total);
  const yoy = toNum(std.growth_rate ?? rev.growth_rate_pct);
  const mom = toNum(std.mom_growth_rate ?? rev.mom_growth_pct);
  if (typeof current !== "undefined") out.total_revenue = current; // 元
  if (typeof yoy !== "undefined") out.yoy_growth_rate = yoy;
  if (typeof mom !== "undefined") out.mom_growth_rate = mom;
  out.trend = (payload?.trend ?? std.trend) ?? undefined;
  return Object.keys(out).length ? out : null;
}

/** ---------- 可搜索多选下拉（带复选框） ---------- */
type Option = { value: string; label: string };
function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = "请选择…",
  searchPlaceholder = "搜索…",
}: {
  label: string;
  options: Option[];
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
    if (next.has(val)) next.delete(val);
    else next.add(val);
    onChange(next);
  };

  const handleAll = () => {
    if (allSelected) onChange(new Set());
    else onChange(new Set(options.map((o) => o.value)));
  };

  const clear = () => onChange(new Set());

  const summaryText =
    selected.size === 0
      ? placeholder
      : selected.size === 1
      ? options.find((o) => o.value === Array.from(selected)[0])?.label ?? placeholder
      : `已选 ${selected.size} 项`;

  return (
    <div className="w-full text-left relative">
      <label className="text-sm text-gray-600 mb-1 block">{label}</label>
      <button
        type="button"
        className="w-full border rounded px-3 py-2 bg-white flex items-center justify-between hover:border-gray-400"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`truncate ${selected.size ? "" : "text-gray-400"}`}>{summaryText}</span>
        <span className="text-gray-500">▾</span>
      </button>

      {open && (
        <div className="absolute z-10 mt-2 w-full border rounded-lg bg-white shadow-lg overflow-hidden">
          <div className="p-2 border-b">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full px-2 py-1 border rounded"
            />
          </div>
          <div className="p-1 overflow-auto max-h-64">
            {options.length > 0 && (
              <label className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50">
                <input type="checkbox" checked={allSelected} onChange={handleAll} />
                <span>{allSelected ? "取消全选" : "全选所有结果"}</span>
              </label>
            )}
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-gray-400">无匹配项</div>
            ) : (
              filtered.map((o) => (
                <label key={o.value} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(o.value)}
                    onChange={() => toggle(o.value)}
                  />
                  <span className="truncate" title={`${o.label}（${o.value}）`}>
                    {o.label}（{o.value}）
                  </span>
                </label>
              ))
            )}
          </div>
          <div className="p-2 border-t flex items-center justify-between">
            <div className="text-xs text-gray-500">共 {filtered.length} 项，已选 {selected.size} 项</div>
            <div className="flex gap-2">
              <button type="button" className="px-2 py-1 text-sm border rounded" onClick={clear}>
                清空
              </button>
              <button type="button" className="px-2 py-1 text-sm border rounded" onClick={() => setOpen(false)}>
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** ---------- API ---------- */
async function fetchSummaryAPI({ start, end, departments }: { start: string; end?: string; departments?: string[] }) {
  const payload: any = { start_date: start };
  if (end && end !== start) payload.end_date = end;
  if (departments && departments.length > 0) payload.departments = departments;
  const res = await fetch(`${API_BASE}/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`SUMMARY 请求失败：${res.status}`);
  return res.json();
}

/** ---------- 组件 ---------- */
export default function InpatientTotalRevenue() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [departments, setDepartments] = useState<{ code: string; name: string }[]>([]);
  const [summary, setSummary] = useState<any>(null);

  // 详情数据（服务端分页）
  const [details, setDetails] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // 筛选条件
  const [startDate, setStartDate] = useState(getToday(0));
  const [endDate, setEndDate] = useState("");
  const [selectedDeps, setSelectedDeps] = useState<Set<string>>(new Set());

  // “医生”筛选（前端本地）：先保留组件与逻辑，等待后端将来提供 doctor 字段后自然生效
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [doctorOptions, setDoctorOptions] = useState<Option[]>([]);

  const depsOptions: Option[] = useMemo(
    () => (departments || []).map((d) => ({ value: d.code, label: d.name || d.code })),
    [departments]
  );

  // 注意：当前后端未返回医生字段，因此这里只能从 rows 里尝试推导（大概率为空）
  function deriveDoctorOptions(rows: any[]): Option[] {
    const set = new Map<string, string>();
    for (const r of rows || []) {
      const code = r?.doctor_code ?? r?.doctorId ?? r?.doctor_id ?? null;
      const name = r?.doctor_name ?? r?.doctor ?? null;
      if (code || name) {
        const id = String(code ?? name);
        const label = String(name ?? code);
        if (!set.has(id)) set.set(id, label);
      }
    }
    return Array.from(set, ([value, label]) => ({ value, label }));
  }

  function getSelectedDepsArr() {
    return Array.from(selectedDeps).filter(Boolean);
  }

  // 服务端分页：带 limit/offset
  async function fetchDetails(pageNum = 1) {
    const payload: any = {
      start_date: startDate,
      limit: PAGE_SIZE,
      offset: (pageNum - 1) * PAGE_SIZE,
    };
    if (endDate && endDate !== startDate) payload.end_date = endDate;
    const deps = getSelectedDepsArr();
    if (deps.length > 0) payload.departments = deps;

    const res = await fetch(`${API_BASE}/details`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`DETAILS 请求失败：${res.status}`);
    const data = await res.json();

    const rows = Array.isArray(data?.rows) ? data.rows : (Array.isArray(data) ? data : []);
    const normalized = rows.map((r: any) => ({
      ...r,
      revenue: r?.revenue != null ? Number(r.revenue) : null,
      revenue_growth_pct: r?.revenue_growth_pct != null ? Number(r.revenue_growth_pct) : null,
    }));

    // 本地医生选项（将来后端有 doctor 字段后会自动出现）
    const docOpts = deriveDoctorOptions(normalized);
    setDoctorOptions(docOpts);
    // 清理无效选择
    if (docOpts.length === 0 && selectedDocs.size > 0) setSelectedDocs(new Set());

    // 本地医生筛选（当前仅对“当前页数据”生效）
    const filteredByDoctor =
      selectedDocs.size === 0
        ? normalized
        : normalized.filter((r: any) => {
            const code = r?.doctor_code ?? r?.doctorId ?? r?.doctor_id ?? "";
            const name = r?.doctor_name ?? r?.doctor ?? "";
            for (const id of selectedDocs) {
              if (id === code || id === name) return true;
            }
            return false;
          });

    setDetails(filteredByDoctor);
    setTotal(Number(data?.total || 0));
    setPage(pageNum);
  }

  // 初始化：/init（今日汇总+科室列表）→ 查询当天全院逐条明细
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API_BASE}/init`);
        if (!res.ok) throw new Error(`INIT 请求失败：${res.status}`);
        const data = await res.json();
        setDepartments(Array.isArray(data?.departments) ? data.departments : []);
        setSummary(extractSummaryFromStd(data));
        await fetchDetails(1);
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 提交筛选：刷新汇总与第 1 页详情
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
      const deps = getSelectedDepsArr();
      const data = await fetchSummaryAPI({
        start: startDate,
        end: endDate || undefined,
        departments: deps,
      });
      setSummary(extractSummaryFromStd(data));
      await fetchDetails(1);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const onReset = () => {
    setStartDate(getToday(0));
    setEndDate("");
    setSelectedDeps(new Set());
    setSelectedDocs(new Set()); // 医生选择也重置
    setError("");
    setPage(1);
    fetchDetails(1).catch(() => {});
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold mb-2 text-left">住院收入分析</h1>
      {error && <div className="text-red-500 text-left">错误：{error}</div>}

      {/* 筛选表单 */}
      <form
          onSubmit={onSubmitSummary}
          className="flex flex-wrap items-end gap-4 text-left"
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
          <label className="text-sm text-gray-600 mb-1">结束日期（可选）</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border rounded px-2 py-1 text-left"
          />
        </div>

        <div className="flex-1 min-w-[200px]">
          <MultiSelect
            label="科室"
            options={depsOptions}
            selected={selectedDeps}
            onChange={setSelectedDeps}
            placeholder="全部科室"
            searchPlaceholder="搜索科室…"
          />
        </div>

        <div className="flex-1 min-w-[200px]">
          <MultiSelect
            label="医生"
            options={doctorOptions}
            selected={selectedDocs}
            onChange={setSelectedDocs}
            placeholder="全部医生"
            searchPlaceholder="搜索医生…"
          />
        </div>

        <div className="flex items-end gap-2">
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

      {/* 汇总卡片：基于筛选条件 */}
      <section className="p-4 border rounded-lg bg-white">
      <h2 className="text-lg font-semibold mb-3 text-left">汇总（基于筛选条件）</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-left">
          <div className="space-y-1">
            <div className="text-sm text-gray-600">总收入（元）</div>
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
            <div className="text-sm text-gray-600">趋势（收入 vs 床日）</div>
            <div>{summary?.trend ?? "-"}</div>
          </div>
        </div>
      </section>

      {/* 数据详情表（逐条，收入=元；服务端分页） */}
      <section className="p-4 border rounded-lg bg-white">
        <h2 className="text-lg font-semibold mb-3 text-left">数据详情</h2>
        <div className="overflow-auto">
          <table className="min-w-full text-sm text-gray-900 table-fixed text-left">
            <thead>
              <tr className="bg-gray-50 border-b text-gray-700">
                <th className="px-3 py-2">日期</th>
                <th className="px-3 py-2">科室</th>
                <th className="px-3 py-2">收入（元）</th>
                <th className="px-3 py-2">收入同比增长</th>
                <th className="px-3 py-2">收入与工作量趋势</th>
              </tr>
            </thead>
            <tbody>
              {details.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-gray-400 py-4">
                    暂无数据
                  </td>
                </tr>
              ) : (
                details.map((r, idx) => (
                  <tr key={idx} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.date)}</td>
                    <td
                      className="px-3 py-2 truncate"
                      title={r.department_name || r.department_code || "—"}
                    >
                      {r.department_name || r.department_code || "—"}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {typeof r.revenue === "number" ? r.revenue.toLocaleString() : "-"}
                    </td>
                    <td className="px-3 py-2">
                      {r.revenue_growth_pct == null
                        ? "-"
                        : `${Number(r.revenue_growth_pct).toFixed(2)}%`}
                    </td>
                    <td className="px-3 py-2 truncate" title={r.trend ?? "-"}>
                      {r.trend ?? "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 分页（服务端） */}
        <div className="flex items-center justify-start gap-3 mt-3">
          <button
            className="px-3 py-1 border rounded disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => fetchDetails(page - 1)}
          >
            上一页
          </button>
          <span className="text-sm text-gray-600">
            第 {page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))} 页（共 {total} 条）
          </span>
          <button
            className="px-3 py-1 border rounded disabled:opacity-50"
            disabled={page >= Math.max(1, Math.ceil(total / PAGE_SIZE))}
            onClick={() => fetchDetails(page + 1)}
          >
            下一页
          </button>
        </div>
      </section>
    </div>
  );
}
