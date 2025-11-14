// src/pages/Page.tsx
import { useEffect, useState } from "react";
import type { CompareKind } from "../components/base/LineChart";

import ErrorAlert from "../components/ErrorAlert";
import InpatientFilterBar from "../components/base/FilterBar";
import InpatientSummaryCards from "../features/inpatientTotalRevenue/components/SummaryCards";

import InpatientDetailsTable from "../features/inpatientTotalRevenue/components/DetailsTable";
import InpatientTrendSection from "../components/base/TrendSection";
import InpatientToolbar from "../components/base/Toolbar";

import {
  deriveDoctors,
  extractSummaryFromStd,
  fetchDetailsAPI,
  fetchInitAPI,
  fetchSummaryAPI,
  fetchTimeseriesAPI,
  getToday,
  maybeEnsureMoM,
  type DepartmentOption,
  type DoctorOption,
  type DetailsRow,
  type TSRow,
  type SortKey,
  type SummaryViewModel,
} from "../services/inpatientTotalRevenueApi";

export default function InpatientTotalRevenue() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [summary, setSummary] = useState<SummaryViewModel | null>(null);

  // 明细（服务端分页）
  const rowsPerPage = 20;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [details, setDetails] = useState<DetailsRow[]>([]);

  // 排序
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // 趋势数据
  const [tsRows, setTsRows] = useState<TSRow[]>([]);
  const [compare, setCompare] = useState<CompareKind>("yoy");

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

  // 日期
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);

  // 科室 / 医生筛选
  const [selectedDeps, setSelectedDeps] = useState<string[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);

  // 统一 deps 处理
  const getDepsOrNull = () =>
    selectedDeps.length ? selectedDeps : null;

  // 初始化：加载科室 + 今日汇总 + 今日明细 + 今日趋势
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchInitAPI();
        setDepartments(Array.isArray(data?.departments) ? data.departments : []);

        const parsed = extractSummaryFromStd(data);
        setSummary(parsed);

        const today = getToday(0);
        setStartDate(today);
        setEndDate(today);
        setPage(1);
        setCompare("yoy");
        setSortKey("date");
        setSortDir("desc");

        await Promise.all([
          loadDetails(today, today, null, 1),
          loadTimeseries(today, today, null),
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

  async function loadSummary(
    start: string,
    end: string,
    deps: string[] | null
  ) {
    const data = await fetchSummaryAPI({ start, end, deps });
    const curSum = extractSummaryFromStd(data);
    const sumWithMom = await maybeEnsureMoM({
      currentSummary: curSum,
      start,
      end,
      deps,
    });
    setSummary(sumWithMom);
  }

  async function loadDetails(
    start: string,
    end: string,
    deps: string[] | null,
    pageNo: number
  ) {
    const limit = rowsPerPage;
    const offset = (pageNo - 1) * rowsPerPage;

    const data = await fetchDetailsAPI({
      start,
      end,
      deps,
      limit,
      offset,
    });

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

  async function loadTimeseries(
    start: string,
    end: string,
    deps: string[] | null
  ) {
    const data = await fetchTimeseriesAPI({ start, end, deps });
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    setTsRows(rows);
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
      const deps = getDepsOrNull();

      await loadSummary(startDate, endDate, deps);
      setPage(1);

      await Promise.all([
        loadDetails(startDate, endDate, deps, 1),
        loadTimeseries(startDate, endDate, deps),
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
    setError("");
    setPage(1);
    setCompare("yoy");
    setSortKey("date");
    setSortDir("desc");

    setLoading(true);
    try {
      await loadSummary(today, today, null);
      await Promise.all([
        loadDetails(today, today, null, 1),
        loadTimeseries(today, today, null),
      ]);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = async (nextPage: number) => {
    setPage(nextPage);
    await loadDetails(startDate, endDate, getDepsOrNull(), nextPage);
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold mb-2 text-left">住院收入分析</h1>

      <ErrorAlert message={error} />

      {/* 筛选区域 */}
      <InpatientFilterBar
        startDate={startDate}
        endDate={endDate}
        loading={loading}
        departments={departments}
        doctors={doctors}
        selectedDeps={selectedDeps}
        selectedDocs={selectedDocs}
        onChangeStartDate={setStartDate}
        onChangeEndDate={setEndDate}
        onChangeSelectedDeps={setSelectedDeps}
        onChangeSelectedDocs={setSelectedDocs}
        onSubmit={onSubmitSummary}
        onReset={onReset}
      />

      {/* 汇总概览 */}
      <InpatientSummaryCards summary={summary} />

      {/* 工具栏：数据/趋势 + 同比/环比 */}
      <section className="p-4 border rounded-lg bg-white space-y-4">
        <InpatientToolbar
          viewMode={viewMode}
          onChangeView={setAndSyncView}
          compare={compare}
          onChangeCompare={setCompare}
        />

        {/* 数据详情 */}
        <div className={viewMode === "chart" ? "hidden" : ""}>
          <InpatientDetailsTable
            rows={details}
            page={page}
            pageSize={rowsPerPage}
            total={total}
            loading={loading}
            sortKey={sortKey}
            sortDir={sortDir}
            onChangeSortKey={setSortKey}
            onChangeSortDir={setSortDir}
            doctors={doctors}
            selectedDocs={selectedDocs}
            onChangeSelectedDocs={setSelectedDocs}
            onPageChange={handlePageChange}
          />
        </div>

        {/* 趋势分析：收入 + 床日 的同比/环比增长率 */}
        <div className={viewMode === "details" ? "hidden" : ""}>
          <InpatientTrendSection
            rows={tsRows}
            compare={compare}
            onChangeCompare={setCompare}
          />
        </div>
      </section>
    </div>
  );
}
