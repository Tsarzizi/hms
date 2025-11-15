// src/features/inpatientTotalRevenue/hooks.ts
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CompareKind } from "../../components/base/LineChart";

import {
  extractSummaryFromStd,
  fetchDetailsAPI,
  fetchInitAPI,
  fetchSummaryAPI,
  fetchTimeseriesAPI,
  getToday,
  maybeEnsureMoM,
  type SortKey,
} from "../../services/inpatientTotalRevenueApi";

import {
  INPATIENT_ROWS_PER_PAGE,
  INPATIENT_DEFAULT_COMPARE,
  INPATIENT_DEFAULT_SORT_KEY,
  INPATIENT_DEFAULT_SORT_DIR,
  INPATIENT_DEFAULT_VIEW_MODE,
} from "./config";

import type {
  DepartmentOption,
  UIDoctorOption,
  DetailsRow,
  TSRow,
  SummaryViewModel,
} from "./types";

const todayStr = getToday(0);

export function useInpatientTotalRevenuePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [departments, setDepartments] = useState<DepartmentOption[]>([]);

  // 全量医生列表（不受科室筛选）
  const [allDoctors, setAllDoctors] = useState<UIDoctorOption[]>([]);

  // 科室 / 医生筛选（科室影响后端查询，医生参与后端查询 + 前端过滤）
  const [selectedDeps, setSelectedDepsRaw] = useState<string[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);

  // 设置科室时，同时清理掉不属于这些科室的已选医生
  const setSelectedDeps = useCallback(
    (deps: string[]) => {
      setSelectedDepsRaw(deps);

      // 没选科室时，不强制清空医生（保持原有行为）
      if (!deps.length) return;

      setSelectedDocs((prev) =>
        prev.filter((id) => {
          const doc = allDoctors.find((d) => d.id === id);
          return doc && deps.includes(doc.dep_code);
        })
      );
    },
    [allDoctors]
  );

  // 根据选中的科室，推导当前可选医生列表
  const doctors = useMemo(() => {
    // 没选科室 → 视为全部科室
    if (!selectedDeps.length) return allDoctors;
    return allDoctors.filter((d) => selectedDeps.includes(d.dep_code));
  }, [allDoctors, selectedDeps]);

  const [summary, setSummary] = useState<SummaryViewModel | null>(null);

  // ✅ 明细：前端分页
  const rowsPerPage = INPATIENT_ROWS_PER_PAGE;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0); // 当前筛选下的总行数
  const [details, setDetails] = useState<DetailsRow[]>([]); // 当前筛选下的全部明细行

  // 排序
  const [sortKey, setSortKey] = useState<SortKey>(INPATIENT_DEFAULT_SORT_KEY);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    INPATIENT_DEFAULT_SORT_DIR
  );

  // 趋势数据（折线图）
  const [tsRows, setTsRows] = useState<TSRow[]>([]);
  const [compare, setCompare] = useState<CompareKind>(
    INPATIENT_DEFAULT_COMPARE
  );

  // 视图切换（数据表 / 趋势图），并同步到 URL ?view=
  const [viewMode, setViewModeState] = useState<"details" | "chart">(
    INPATIENT_DEFAULT_VIEW_MODE
  );
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const v = sp.get("view");
      if (v === "chart" || v === "details") {
        setViewModeState(v as "details" | "chart");
      }
    } catch {
      // ignore
    }
  }, []);
  const setViewMode = (v: "details" | "chart") => {
    setViewModeState(v);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("view", v);
      window.history.replaceState({}, "", url);
    } catch {
      // ignore
    }
  };

  // 日期筛选
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);

  // 统一 deps 处理：
  // 现在后端按“科室名称”筛选，
  // 所以前端内部仍然用 code（dep_id）保存选中项，
  // 但在发请求时要把 code 映射成 name 传给后端。
  const getDepsOrNull = () => {
    if (!selectedDeps.length) return null;
    if (!departments.length) return null;

    const codeToName = new Map(
      departments.map((d) => [d.code, d.name] as [string, string])
    );

    const names = selectedDeps
      .map((code) => codeToName.get(code))
      .filter((name): name is string => !!name);

    return names.length ? names : null;
  };

  // 统一 doctors 处理：没有选中医生时传 null
  const getDocsOrNull = () => (selectedDocs.length ? selectedDocs : null);

  // ---- 核心拉数逻辑 ----

  // 初始化：加载医生+科室 + 今日汇总 + 今日全量明细 + 今日趋势
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchInitAPI();

        // 医生列表：从 init 返回的 doctors（来自 get_doc_dep_map）转成 UIDoctorOption
        const rawDocs = Array.isArray((data as any)?.doctors)
          ? (data as any).doctors
          : [];

        const docList: UIDoctorOption[] = rawDocs
          .map((d: any) => ({
            id: String(d.doc_id ?? ""),
            name: String(d.doc_name ?? ""),
            dep_code: String(d.dep_id ?? ""),
            dep_name: String(d.dep_name ?? ""),
            // 这里直接使用 dep_name 作为绩效科室名称
            perf_dep_name: String(d.dep_name ?? ""),
          }))
          .filter((d) => d.id && d.name); // 简单过滤空数据

        // 保存全量医生
        setAllDoctors(docList);

        // 科室列表：从医生的 dep_code/dep_name 推导去重得到
        const depMap = new Map<string, string>();
        const depList: DepartmentOption[] = [];
        for (const d of docList) {
          if (d.dep_code && !depMap.has(d.dep_code)) {
            depMap.set(d.dep_code, d.dep_name);
            depList.push({ code: d.dep_code, name: d.dep_name });
          }
        }
        setDepartments(depList);

        // 汇总卡片
        const parsed = extractSummaryFromStd(data);
        setSummary(parsed);

        // 默认日期：今天
        const today = getToday(0);
        setStartDate(today);
        setEndDate(today);
        setPage(1);
        setCompare(INPATIENT_DEFAULT_COMPARE);
        setSortKey(INPATIENT_DEFAULT_SORT_KEY);
        setSortDir(INPATIENT_DEFAULT_SORT_DIR);

        // 全量明细 + 趋势
        await Promise.all([
          loadDetails(today, today, null, null),
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

  // 加载汇总（summary）
  async function loadSummary(
    start: string,
    end: string,
    deps: string[] | null
  ) {
    const data = await fetchSummaryAPI({ start, end, deps });
    const curSum = extractSummaryFromStd(data);
    // maybeEnsureMoM：如缺环比，则自动补上一周期请求
    const sumWithMom = await maybeEnsureMoM({
      currentSummary: curSum,
      start,
      end,
      deps,
    });
    setSummary(sumWithMom);
  }

  // 加载明细：后端不分页，返回当前条件下“全部明细”
  async function loadDetails(
    start: string,
    end: string,
    deps: string[] | null,
    docs: string[] | null
  ) {
    const data = await fetchDetailsAPI({
      start,
      end,
      deps,
      doctors: docs,
    });

    const rows = Array.isArray(data?.rows) ? data.rows : [];
    setDetails(rows);

    // total 现在就是“全部明细条数”，用于前端分页显示
    setTotal(
      Number.isFinite((data?.total as any) ?? NaN)
        ? Number(data.total)
        : rows.length
    );
  }

  // 趋势数据：收入 + 床日聚合
  async function loadTimeseries(
    start: string,
    end: string,
    deps: string[] | null
  ) {
    const data = await fetchTimeseriesAPI({ start, end, deps });
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    setTsRows(rows);
  }

  // 点击“应用筛选”
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
      const docs = getDocsOrNull();

      // 汇总
      await loadSummary(startDate, endDate, deps);

      // 每次筛选变化后，回到第一页
      setPage(1);

      // 全量明细 + 趋势
      await Promise.all([
        loadDetails(startDate, endDate, deps, docs),
        loadTimeseries(startDate, endDate, deps),
      ]);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  // 点击“重置”
  const onReset = async () => {
    const today = getToday(0);
    setStartDate(today);
    setEndDate(today);
    setSelectedDeps([]); // 使用包装后的 setSelectedDeps
    setSelectedDocs([]);
    setError("");
    setPage(1);
    setCompare(INPATIENT_DEFAULT_COMPARE);
    setSortKey(INPATIENT_DEFAULT_SORT_KEY);
    setSortDir(INPATIENT_DEFAULT_SORT_DIR);

    setLoading(true);
    try {
      await loadSummary(today, today, null);
      await Promise.all([
        loadDetails(today, today, null, null),
        loadTimeseries(today, today, null),
      ]);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  // 供 FilterBar 显示的简短摘要标签（比如已选项的名称或数量）
  const depSummaryLabel =
    selectedDeps.length > 0
      ? departments
          .filter((d) => selectedDeps.includes(d.code))
          .map((d) => d.name)
          .join(", ")
      : "";

  const docSummaryLabel =
    selectedDocs.length > 0
      ? doctors
          .filter((d) => selectedDocs.includes(d.id))
          .map((d) => d.name)
          .join(", ")
      : "";

  // 前端分页：只改前端页码，不再请求后端
  const onPageChange = (nextPage: number) => {
    setPage(nextPage);
  };

  return {
    // 状态
    loading,
    error,
    departments,
    doctors, // <- 已按科室过滤后的医生列表
    summary,
    rowsPerPage,
    page,
    total,
    details,
    sortKey,
    sortDir,
    tsRows,
    compare,
    viewMode,
    startDate,
    endDate,
    selectedDeps,
    selectedDocs,
    depSummaryLabel,
    docSummaryLabel,
    // 操作
    setStartDate,
    setEndDate,
    setSelectedDeps, // <- 包装过的 setter
    setSelectedDocs,
    setSortKey,
    setSortDir,
    setCompare,
    setViewMode,
    onSubmitSummary,
    onReset,
    onPageChange,
  };
}
