import { useEffect, useMemo, useRef, useState } from "react";

// 后端基础路径
const API_BASE = "/api/inpatient_total_revenue";

/** 返回 YYYY-MM-DD（可带 offset 天数） */
function getToday(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 将标准后端响应映射到页面使用的 summary 结构 */
function extractSummaryFromStd(payload: any) {
  // /init 返回: { success, date, departments, summary, total_revenue? }
  // /summary 返回: { success, date|date_range, department, summary }
  const std = payload?.summary || {};
  const current = Number(std.current ?? NaN);
  const growth = Number(std.growth_rate ?? NaN);
  const trend = typeof std.trend === "string" ? std.trend : undefined;

  const out: any = {};
  if (Number.isFinite(current)) out.total_revenue = current;
  if (Number.isFinite(growth)) out.yoy_growth_rate = growth; // 单位: %
  if (trend) out.trend = trend;
  return Object.keys(out).length ? out : null;
}

/** 构建 /summary 请求体：0 个（全院）或 1 个科室编码 */
function buildSummaryPayload(opts: {
  startDate: string;
  endDate?: string;
  selectedDepCodes: Set<string>;
}) {
  const { startDate, endDate, selectedDepCodes } = opts;

  // 后端支持单日自动化: 没 endDate 或 endDate===startDate -> [start, start+1)
  const payload: any = { start_date: startDate };

  if (endDate && endDate !== startDate) {
    payload.end_date = endDate;
  }

  // 选 1 个就筛该科室，否则传空=全院
  if (selectedDepCodes.size === 1) {
    payload.department = Array.from(selectedDepCodes)[0];
  } else {
    payload.department = null;
  }

  return payload;
}

/** 简单单选下拉（支持“全院”） */
function SingleSelectDropdown({
  label,
  items,
  value,
  onChange,
  allowAll = true,
}: {
  label: string;
  items: { key: string; value: string; text: string }[];
  value: string | null;
  onChange: (v: string | null) => void;
  allowAll?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return items;
    return items.filter((it) => String(it.text).toLowerCase().includes(kw));
  }, [items, q]);

  useEffect(() => {
    const onDoc = (e: any) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const currentText =
    value == null
      ? "全院"
      : items.find((x) => x.value === value)?.text ?? "未知科室";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full border rounded px-3 py-2 flex items-center justify-between text-left"
      >
        <span className="text-sm text-gray-700">
          {label}：<span className="text-gray-900">{currentText}</span>
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.24 4.38a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-full rounded border bg-white shadow">
          <div className="px-3 py-2 border-b text-sm text-gray-600">{label}</div>
          <div className="px-3 py-2 border-b">
            <div className="relative">
              <input
                className="w-full border rounded px-3 py-1.5 pr-8 text-sm"
                placeholder={`搜索${label}...`}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              {q && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
                  onClick={() => setQ("")}
                >
                  ×
                </button>
              )}
            </div>
          </div>
          <div className="max-h-56 overflow-auto p-2 space-y-1">
            {allowAll && (
              <button
                className="w-full text-left px-2 py-1 rounded hover:bg-gray-50 text-sm"
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                全院
              </button>
            )}
            {items.length === 0 ? (
              <div className="text-sm text-gray-400 px-2 py-1">暂无数据</div>
            ) : filtered.length === 0 ? (
              <div className="text-sm text-gray-400 px-2 py-1">无匹配结果</div>
            ) : (
              filtered.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  className="w-full text-left px-2 py-1 rounded hover:bg-gray-50 text-sm"
                  onClick={() => {
                    onChange(it.value);
                    setOpen(false);
                  }}
                >
                  {it.text}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function InpatientTotalRevenue() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [departments, setDepartments] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [details, setDetails] = useState<any[]>([]); // /details 明细

  // 单日统计：默认今天；区间统计：填写 endDate 即可
  const [startDate, setStartDate] = useState(getToday(0));
  const [endDate, setEndDate] = useState<string>("");

  // 科室筛选（单选，null=全院）
  const [selectedDepCode, setSelectedDepCode] = useState<string | null>(null);

  // ========== 明细分页（20/页） ==========
  const rowsPerPage = 20;
  const [page, setPage] = useState(1);

  const totalRows = details.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const pagedRows = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return details.slice(start, start + rowsPerPage);
  }, [details, page]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
    if (page < 1) setPage(1);
  }, [page, pageCount]);

  /** 拉取明细 */
  async function fetchDetails(start: string, end?: string, depCode?: string | null) {
    const payload: any = { start_date: start };
    if (end && end !== start) payload.end_date = end; // 留空或等于 start -> 后端单日
    if (depCode) payload.department = depCode;

    const res = await fetch(`${API_BASE}/details`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`DETAILS 请求失败：${res.status}`);
    const data = await res.json();
    setDetails(Array.isArray(data?.rows) ? data.rows : []);
    setPage(1); // 刷新后回到第一页
  }

  // 初始化：/init（今日 + 部门），并获取今日明细
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API_BASE}/init`);
        if (!res.ok) throw new Error(`INIT 请求失败：${res.status}`);
        const data = await res.json();

        const depList = Array.isArray(data?.departments) ? data.departments : [];
        setDepartments(depList);

        const extracted = extractSummaryFromStd(data);
        setSummary(extracted);

        // 今日单日明细
        await fetchDetails(getToday(0));
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // /summary 提交
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

    const payload = buildSummaryPayload({
      startDate,
      endDate: endDate || undefined, // 空=单日
      selectedDepCodes: selectedDepCode ? new Set([selectedDepCode]) : new Set(),
    });

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`SUMMARY 请求失败：${res.status}`);
      const data = await res.json();
      const extracted = extractSummaryFromStd(data);
      setSummary(extracted);

      // 同步刷新明细
      await fetchDetails(startDate, endDate || undefined, selectedDepCode || null);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const onReset = () => {
    setStartDate(getToday(0)); // 重置为今天
    setEndDate("");
    setSelectedDepCode(null);
    setError("");
  };

  const depItems = useMemo(
    () =>
      departments.map((d: any, i: number) => ({
        key: `${d?.code ?? ""}__${i}`,
        value: d?.code,
        text: d?.name ?? d?.code ?? "未知科室",
      })),
    [departments]
  );

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold">住院收入分析</h1>
      {error && <div className="text-red-500">错误：{error}</div>}

      {/* 查询条件 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="mr-2">开始日期：</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border rounded px-2 py-1"
            />
          </div>
          <div>
            <label className="ml-2 mr-2">结束日期（可选）：</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border rounded px-2 py-1"
              placeholder="留空=单日"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <SingleSelectDropdown
            label="科室"
            items={depItems}
            value={selectedDepCode}
            onChange={setSelectedDepCode}
            allowAll
          />
          <div className="mt-1 text-xs text-gray-600">
            科室总数：{Array.isArray(departments) ? departments.length : 0}
            {selectedDepCode ? `；已选：${selectedDepCode}` : "；已选：全院"}
          </div>
        </div>
      </div>

      {/* 汇总卡片 */}
      <section className="p-4 border rounded-lg bg-white">
        <h2 className="text-lg font-semibold mb-3">汇总</h2>
        <form className="grid grid-cols-1 md:grid-cols-3 gap-4" onSubmit={onSubmitSummary}>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">总收入</label>
            <input
              readOnly
              className="border rounded px-2 py-1 bg-gray-50"
              value={
                summary && typeof summary.total_revenue === "number"
                  ? summary.total_revenue.toLocaleString()
                  : "-"
              }
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">收入同比增长 (YoY)</label>
            <input
              readOnly
              className="border rounded px-2 py-1 bg-gray-50"
              value={
                summary && typeof summary.yoy_growth_rate === "number"
                  ? `${summary.yoy_growth_rate.toFixed(2)}%`
                  : "-"
              }
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">趋势（收入 vs 床日）</label>
            <input
              readOnly
              className="border rounded px-2 py-1 bg-gray-50"
              value={summary && summary.trend ? summary.trend : "-"}
            />
          </div>

          <div className="md:col-span-3 flex items-center gap-3 mt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
            >
              {loading ? "查询中..." : "查询 / 刷新"}
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
      </section>

      {/* 数据详情表单（明细表格） */}
      <section className="p-4 border rounded-lg bg-white">
        <h2 className="text-lg font-semibold mb-3">数据详情</h2>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-gray-700">
                <th className="text-left p-2">日期</th>
                <th className="text-left p-2">科室</th>
                <th className="text-left p-2">医生</th>
                <th className="text-right p-2">收入</th>
                <th className="text-right p-2">收入增长率</th>
                <th className="text-left p-2">收入与工作量趋势</th>
              </tr>
            </thead>
            <tbody className="text-gray-900">
              {pagedRows.length === 0 ? (
                <tr>
                  <td className="py-4 px-4 text-gray-400" colSpan={6}>
                    暂无数据
                  </td>
                </tr>
              ) : (
                pagedRows.map((r, idx) => (
                  <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-4">{r.date}</td>
                    <td className="py-2 px-4">{r.department_name || r.department_code || "—"}</td>
                    <td className="py-2 px-4">—</td>
                    <td className="py-2 px-4 text-right">
                      {typeof r.revenue === "number" ? r.revenue.toLocaleString() : "-"}
                    </td>
                    <td className="py-2 px-4 text-right">
                      {r.revenue_growth_pct == null
                        ? "-"
                        : `${Number(r.revenue_growth_pct).toFixed(2)}%`}
                    </td>
                    <td className="py-2 px-4">{r.trend ?? "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 分页器 */}
        <div className="flex items-center gap-3 mt-3">
          <button
            className="px-3 py-1 border rounded disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <span className="text-sm text-gray-600">
            第 {page} / {pageCount} 页（共 {totalRows} 条）
          </span>
          <button
            className="px-3 py-1 border rounded disabled:opacity-50"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            下一页
          </button>
        </div>
      </section>
    </div>
  );
}
