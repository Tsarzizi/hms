// src/pages/InpatientTotalRevenue.tsx
//
// 住院收入分析主页面：
//  - 顶部筛选（日期 + 科室 + 医生）
//  - 汇总卡片（总收入、同比、环比等）
//  - 数据详情（表格，前端排序 + 前端分页）
//  - 趋势分析（折线图，同/环比切换）

import { useEffect, useState } from "react";
import type { CompareKind } from "../components/LineChart";

import ErrorAlert from "../components/ErrorAlert";
import InpatientFilterBar from "../components/FilterBar";
import InpatientSummaryCards from "../components/SummaryCards";

import InpatientDetailsTable from "../components/DetailsTable";
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

  // ✅ 明细：现在改成“前端分页”
  // rowsPerPage 只影响前端切页，不再传给后端
  const rowsPerPage = 20;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0); // 可以用 details.length 维护
  const [details, setDetails] = useState<DetailsRow[]>([]); // 保存当前筛选下的“全部明细行”

  // 排序（传给 DetailsTable，由它内部做排序）
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // 趋势数据（折线图）
  const [tsRows, setTsRows] = useState<TSRow[]>([]);
  const [compare, setCompare] = useState<CompareKind>("yoy");

  // 视图切换（数据表 / 趋势图），并同步到 URL ?view=
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

  // 日期筛选
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);

  // 科室 / 医生筛选（科室影响后端查询，医生只在前端过滤）
  const [selectedDeps, setSelectedDeps] = useState<string[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);

  // 统一 deps 处理：没有选中科室时，传 null 给后端表示“全部科室”
  const getDepsOrNull = () => (selectedDeps.length ? selectedDeps : null);

  // 初始化：加载科室 + 今日汇总 + 今日“全量明细” + 今日趋势
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchInitAPI();

        // 科室选项
        setDepartments(Array.isArray(data?.departments) ? data.departments : []);

        // 汇总卡片
        const parsed = extractSummaryFromStd(data);
        setSummary(parsed);

        // 默认日期：今天
        const today = getToday(0);
        setStartDate(today);
        setEndDate(today);
        setPage(1);
        setCompare("yoy");
        setSortKey("date");
        setSortDir("desc");

        // ✅ 明细 + 趋势：一次加载“全量明细 + 趋势”
        await Promise.all([
          loadDetails(today, today, null),
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

  // 加载汇总（summary），依然由后端计算
  async function loadSummary(
    start: string,
    end: string,
    deps: string[] | null
  ) {
    const data = await fetchSummaryAPI({ start, end, deps });
    const curSum = extractSummaryFromStd(data);
    // maybeEnsureMoM：如果缺少环比，会补一次上一周期请求
    const sumWithMom = await maybeEnsureMoM({
      currentSummary: curSum,
      start,
      end,
      deps,
    });
    setSummary(sumWithMom);
  }

  // ✅ 加载明细：后端不再分页，返回当前条件下“全部明细”
  async function loadDetails(
    start: string,
    end: string,
    deps: string[] | null
  ) {
    // ❗ 注意：这里不再传 limit / offset，只传筛选条件
    const data = await fetchDetailsAPI({
      start,
      end,
      deps,
    });

    const rows = Array.isArray(data?.rows) ? data.rows : [];
    setDetails(rows);

    // total 现在就是“全部明细条数”，用于前端分页显示
    setTotal(
      Number.isFinite((data?.total as any) ?? NaN)
        ? Number(data.total)
        : rows.length
    );

    // 从明细中推导医生列表（仅供前端筛选使用）
    const ds = deriveDoctors(rows);
    setDoctors(ds);
    // 清理已选但已不存在的医生
    setSelectedDocs((prev) =>
      prev.filter((id) => ds.some((d) => d.id === id))
    );
  }

  // 趋势数据仍然后端按日期聚合后返回
  async function loadTimeseries(
    start: string,
    end: string,
    deps: string[] | null
  ) {
    const data = await fetchTimeseriesAPI({ start, end, deps });
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    setTsRows(rows);
  }

  // 点击“应用筛选”提交
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

      // 汇总
      await loadSummary(startDate, endDate, deps);

      // 每次筛选变化后，回到第一页
      setPage(1);

      // ✅ 重新加载“全量明细 + 趋势”
      await Promise.all([
        loadDetails(startDate, endDate, deps),
        loadTimeseries(startDate, endDate, deps),
      ]);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  // 点击“重置”按钮
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
        loadDetails(today, today, null),
        loadTimeseries(today, today, null),
      ]);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  // ✅ 前端分页：切换页码时，只需要改前端状态，不再请求后端
  const handlePageChange = (nextPage: number) => {
    setPage(nextPage);
    // 不再调用 loadDetails(...)
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold mb-2 text-left">住院收入分析</h1>

      <ErrorAlert message={error} />

      {/* 筛选区域：日期 + 科室 + 医生（医生筛选仅前端使用） */}
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

      {/* 汇总概览卡片（总收入、同比、环比等） */}
      <InpatientSummaryCards summary={summary} />

      {/* 工具栏 + 数据详情 / 趋势分析区域 */}
      <section className="p-4 border rounded-lg bg-white space-y-4">
        {/* 工具栏：切换“数据详情 / 趋势分析”，以及同比/环比 */}
        <InpatientToolbar
          viewMode={viewMode}
          onChangeView={setAndSyncView}
          compare={compare}
          onChangeCompare={setCompare}
        />

        {/* 数据详情（表格 + 排序 + 前端分页） */}
        <div className={viewMode === "chart" ? "hidden" : ""}>
          <InpatientDetailsTable
            rows={details}             // ⭐ 全量明细，内部会按 page/pageSize 切片
            page={page}
            pageSize={rowsPerPage}
            total={total}              // 或者 details.length，也可以
            loading={loading}
            sortKey={sortKey}
            sortDir={sortDir}
            onChangeSortKey={setSortKey}
            onChangeSortDir={setSortDir}
            doctors={doctors}
            selectedDocs={selectedDocs}
            onChangeSelectedDocs={setSelectedDocs}
            onPageChange={handlePageChange} // ⭐ 只改前端页码
          />
        </div>

        {/* 趋势分析：收入 + 床日 的同比/环比增长率折线图 */}
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
