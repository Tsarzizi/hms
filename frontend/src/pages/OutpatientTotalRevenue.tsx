// src/pages/outpatient-OutpatientTotalRevenue.tsx
// 自包含版门急诊总收入页面：带筛选栏 + 汇总卡片 + 明细表
import React, { useEffect, useMemo, useState } from "react";

type SortDir = "asc" | "desc";
type SortKey = "date" | "department_name" | "doctor_name" | "item_class_name" | "revenue" | "quantity";

interface DepartmentOption {
  code: string;
  name: string;
}

interface DoctorOption {
  doc_id: string;
  doc_name: string;
  dep_id: string;
  dep_name: string;
}

interface Summary {
  current: number;
  growth_rate: number | null;
  mom_growth_rate: number | null;
  bed_growth_rate: number | null;
  bed_mom_growth_rate: number | null;
  current_bed_days: number;
}

interface TimeseriesRow {
  date: string;
  revenue: number;
  last_year: number | null;
  yoy_pct: number | null;
  mom_pct: number | null;
  bed_yoy_pct: number | null;
  bed_mom_pct: number | null;
}

interface DetailRow {
  date: string;
  department_code?: string | null;
  department_name?: string | null;
  doctor_id?: string | null;
  doctor_name?: string | null;
  item_class_name?: string | null;
  revenue?: number | null;
  cost?: number | null;
  quantity?: number | null;
}

interface InitResponse {
  success: boolean;
  date: string;
  departments: DepartmentOption[];
  doctors: DoctorOption[];
}

interface QueryResponse {
  success: boolean;
  date_range: { start: string; end: string };
  departments?: string[] | null;
  doctors?: string[] | null;
  summary: Summary;
  timeseries: TimeseriesRow[];
  details: DetailRow[];
  total: number;
}

const API_PREFIX = "/api/outpatient-total-revenue";

const formatNumber = (v: number | null | undefined, digits = 2) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return v.toFixed(digits);
};

const formatPercent = (v: number | null | undefined, digits = 1) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  return `${v.toFixed(digits)}%`;
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

export default function OutpatientTotalRevenuePage() {
  // 状态
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [tsRows, setTsRows] = useState<TimeseriesRow[]>([]);
  const [detailsAll, setDetailsAll] = useState<DetailRow[]>([]);
  const [total, setTotal] = useState(0);

  const [startDate, setStartDate] = useState(daysAgoStr(6));
  const [endDate, setEndDate] = useState(todayStr());
  const [selectedDeps, setSelectedDeps] = useState<string[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const rowsPerPage = 20;

  // 初始化：科室 + 医生
  useEffect(() => {
    const fetchInit = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_PREFIX}/init`);
        if (!res.ok) throw new Error(`初始化失败：${res.status}`);
        const data = (await res.json()) as InitResponse;
        if (!data.success) throw new Error("初始化失败");
        setDepartments(data.departments || []);
        setDoctors(data.doctors || []);
      } catch (e: any) {
        console.error(e);
        setError(e?.message || "初始化失败");
      } finally {
        setLoading(false);
      }
    };
    fetchInit();
  }, []);

  // 查询
  const handleQuery = async () => {
    if (!startDate) {
      setError("请选择开始日期");
      return;
    }
    if (endDate && endDate < startDate) {
      setError("结束日期不能早于开始日期");
      return;
    }
    try {
      setLoading(true);
      setError(null);

      const payload: any = {
        start_date: startDate,
        end_date: endDate,
      };
      if (selectedDeps.length) payload.departments = selectedDeps;
      if (selectedDocs.length) payload.doctors = selectedDocs;

      const res = await fetch(`${API_PREFIX}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`查询失败：${res.status}`);
      const data = (await res.json()) as QueryResponse;
      if (!data.success) throw new Error((data as any).error || "查询失败");

      setSummary(data.summary);
      setTsRows(data.timeseries || []);
      setDetailsAll(data.details || []);
      setTotal(data.total ?? (data.details ? data.details.length : 0));
      setPage(1);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "查询失败");
      setSummary(null);
      setTsRows([]);
      setDetailsAll([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  // 初始化完成后自动查一次
  useEffect(() => {
    if (departments.length || doctors.length) {
      handleQuery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departments.length, doctors.length]);

  const handleReset = () => {
    setStartDate(daysAgoStr(6));
    setEndDate(todayStr());
    setSelectedDeps([]);
    setSelectedDocs([]);
    setSortKey("date");
    setSortDir("desc");
    setPage(1);
    setError(null);
  };

  const toggleDep = (name: string) => {
    setSelectedDeps((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  };

  const toggleDoc = (id: string) => {
    setSelectedDocs((prev) =>
      prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id],
    );
  };

  // 排序 + 分页
  const sortedDetails = useMemo(() => {
    const getVal = (row: DetailRow): any => {
      switch (sortKey) {
        case "date":
          return row.date || "";
        case "department_name":
          return row.department_name || "";
        case "doctor_name":
          return row.doctor_name || "";
        case "item_class_name":
          return row.item_class_name || "";
        case "revenue":
          return row.revenue ?? 0;
        case "quantity":
          return row.quantity ?? 0;
        default:
          return "";
      }
    };
    const arr = [...detailsAll].sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (va === vb) return 0;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return sortDir === "asc" ? -1 : 1;
    });
    return arr;
  }, [detailsAll, sortKey, sortDir]);

  const pagedDetails = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return sortedDetails.slice(start, start + rowsPerPage);
  }, [sortedDetails, page]);

  const totalPages = Math.max(1, Math.ceil(total / rowsPerPage));

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const depSummaryLabel = useMemo(() => {
    if (!selectedDeps.length) return "全部科室";
    if (selectedDeps.length === 1) return selectedDeps[0];
    return `${selectedDeps[0]} 等 ${selectedDeps.length} 个科室`;
  }, [selectedDeps]);

  const docSummaryLabel = useMemo(() => {
    if (!selectedDocs.length) return "全部医生";
    if (selectedDocs.length === 1) return selectedDocs[0];
    return `${selectedDocs[0]} 等 ${selectedDocs.length} 名医生`;
  }, [selectedDocs]);

  return (
    <div className="p-6 space-y-6">
      {/* 标题 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h2 className="text-xl font-bold text-gray-800 mb-1">门急诊总收入分析</h2>
        <p className="text-sm text-gray-500">
          与住院板块保持一致：按日期、科室、医生维度进行门急诊总收入统计分析。
        </p>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3">
          {error}
        </div>
      )}

      {/* ✅ 筛选栏 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
        {/* 日期 + 按钮 */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="flex flex-wrap gap-4">
            <div>
              <div className="text-xs text-gray-500 mb-1">开始日期</div>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">结束日期</div>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleQuery}
              disabled={loading}
              className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "查询中..." : "查询"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-1.5 rounded border border-gray-300 text-sm hover:bg-gray-50"
            >
              重置
            </button>
          </div>
        </div>

        {/* 科室 / 医生多选 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 科室 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-gray-500">绩效科室（多选）</div>
              <div className="text-xs text-gray-400 truncate max-w-[160px]">
                {depSummaryLabel}
              </div>
            </div>
            <div className="border border-gray-200 rounded max-h-56 overflow-y-auto p-2 text-sm bg-gray-50">
              {departments.length ? (
                departments.map((dep) => {
                  const checked = selectedDeps.includes(dep.name);
                  return (
                    <label
                      key={dep.code}
                      className="flex items-center gap-2 mb-1 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="h-3 w-3"
                        checked={checked}
                        onChange={() => toggleDep(dep.name)}
                      />
                      <span>{dep.name}</span>
                    </label>
                  );
                })
              ) : (
                <div className="text-xs text-gray-400">暂无科室数据</div>
              )}
            </div>
          </div>

          {/* 医生 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-gray-500">医生（多选）</div>
              <div className="text-xs text-gray-400 truncate max-w-[160px]">
                {docSummaryLabel}
              </div>
            </div>
            <div className="border border-gray-200 rounded max-h-56 overflow-y-auto p-2 text-sm bg-gray-50">
              {doctors.length ? (
                doctors.map((doc) => {
                  const checked = selectedDocs.includes(doc.doc_id);
                  return (
                    <label
                      key={doc.doc_id}
                      className="flex items-center gap-2 mb-1 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="h-3 w-3"
                        checked={checked}
                        onChange={() => toggleDoc(doc.doc_id)}
                      />
                      <span>
                        {doc.doc_name}（{doc.doc_id} / {doc.dep_name}）
                      </span>
                    </label>
                  );
                })
              ) : (
                <div className="text-xs text-gray-400">暂无医生数据</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <SummaryCard
          label="当前门急诊收入"
          value={summary ? formatNumber(summary.current, 2) : "-"}
          suffix="元"
        />
        <SummaryCard
          label="收入同比"
          value={summary ? formatPercent(summary.growth_rate, 1) : "-"}
        />
        <SummaryCard
          label="收入环比"
          value={summary ? formatPercent(summary.mom_growth_rate, 1) : "-"}
        />
        <SummaryCard
          label="当前床日"
          value={summary ? formatNumber(summary.current_bed_days, 0) : "-"}
          suffix="床日"
        />
        <SummaryCard
          label="床日同比"
          value={summary ? formatPercent(summary.bed_growth_rate, 1) : "-"}
        />
        <SummaryCard
          label="床日环比"
          value={summary ? formatPercent(summary.bed_mom_growth_rate, 1) : "-"}
        />
      </div>

      {/* 简单趋势表（可以以后换成图表） */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-gray-800">门急诊收入趋势</div>
          <div className="text-xs text-gray-500">
            共 {tsRows.length} 天
          </div>
        </div>
        <div className="overflow-x-auto">
          {tsRows.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">暂无趋势数据</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>日期</Th>
                  <Th align="right">收入</Th>
                  <Th align="right">去年同期收入</Th>
                  <Th align="right">收入同比</Th>
                  <Th align="right">收入环比</Th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {tsRows.map((r) => (
                  <tr key={r.date}>
                    <Td>{r.date}</Td>
                    <Td align="right">{formatNumber(r.revenue, 2)}</Td>
                    <Td align="right">
                      {r.last_year !== null ? formatNumber(r.last_year, 2) : "-"}
                    </Td>
                    <Td align="right">{formatPercent(r.yoy_pct, 1)}</Td>
                    <Td align="right">{formatPercent(r.mom_pct, 1)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 明细表 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-800">
            明细数据（共 {total} 条）
          </div>
          <div className="text-xs text-gray-500">
            第 {page} / {totalPages} 页
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-8 text-center text-gray-500 text-sm">加载明细中...</div>
          ) : pagedDetails.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">暂无明细数据</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th onClick={() => toggleSort("date")} active={sortKey === "date"} dir={sortDir}>
                    日期
                  </Th>
                  <Th
                    onClick={() => toggleSort("department_name")}
                    active={sortKey === "department_name"}
                    dir={sortDir}
                  >
                    科室
                  </Th>
                  <Th>医生</Th>
                  <Th
                    onClick={() => toggleSort("item_class_name")}
                    active={sortKey === "item_class_name"}
                    dir={sortDir}
                  >
                    项目大类
                  </Th>
                  <Th
                    align="right"
                    onClick={() => toggleSort("revenue")}
                    active={sortKey === "revenue"}
                    dir={sortDir}
                  >
                    收入
                  </Th>
                  <Th
                    align="right"
                    onClick={() => toggleSort("quantity")}
                    active={sortKey === "quantity"}
                    dir={sortDir}
                  >
                    数量
                  </Th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {pagedDetails.map((r, idx) => (
                  <tr key={`${r.date}-${idx}`}>
                    <Td>{r.date}</Td>
                    <Td>{r.department_name || "-"}</Td>
                    <Td>{r.doctor_name || "-"}</Td>
                    <Td>{r.item_class_name || "-"}</Td>
                    <Td align="right">{formatNumber(r.revenue ?? 0, 2)}</Td>
                    <Td align="right">
                      {r.quantity !== null && r.quantity !== undefined
                        ? formatNumber(r.quantity, 2)
                        : "-"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 分页 */}
        <div className="flex justify-end items-center gap-2 text-xs text-gray-600">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-2 py-1 border rounded disabled:opacity-50"
          >
            上一页
          </button>
          <span>
            第 {page} / {totalPages} 页
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-2 py-1 border rounded disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}

const Th: React.FC<{
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  active?: boolean;
  dir?: SortDir;
  onClick?: () => void;
}> = ({ children, align = "left", active, dir, onClick }) => (
  <th
    className={`px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider text-${align} cursor-pointer select-none`}
    onClick={onClick}
  >
    <span className="inline-flex items-center gap-1">
      {children}
      {active && (dir === "asc" ? "↑" : "↓")}
    </span>
  </th>
);

const Td: React.FC<{ children: React.ReactNode; align?: "left" | "right" | "center" }> = ({
  children,
  align = "left",
}) => <td className={`px-3 py-2 text-sm text-gray-700 text-${align}`}>{children}</td>;

const SummaryCard: React.FC<{ label: string; value: string; suffix?: string }> = ({
  label,
  value,
  suffix,
}) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
    <div className="text-xs text-gray-500 mb-1">{label}</div>
    <div className="text-xl font-semibold text-gray-900">
      {value}
      {suffix ? <span className="ml-1 text-xs text-gray-500">{suffix}</span> : null}
    </div>
  </div>
);
