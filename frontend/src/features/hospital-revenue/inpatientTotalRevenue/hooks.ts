// src/features/inpatientTotalRevenue/hooks.ts
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CompareKind } from "../../../components/base/LineChart";

import {
  extractSummaryFromStd,
  fetchFullAPI,
  fetchInitAPI,
  getToday,
  type SortKey,
  type TSRow,
  type SummaryViewModel,
  type DetailsRow,
  type DepartmentOption,
  type FullQueryResponse,
} from "./api";

import {
  INPATIENT_ROWS_PER_PAGE,
  INPATIENT_DEFAULT_COMPARE,
  INPATIENT_DEFAULT_SORT_KEY,
  INPATIENT_DEFAULT_SORT_DIR,
  INPATIENT_DEFAULT_VIEW_MODE,
} from "./config";

import type { UIDoctorOption } from "./types";

const todayStr = getToday(0);

export function useInpatientTotalRevenuePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  // 全量医生列表（不受科室筛选）
  const [allDoctors, setAllDoctors] = useState<UIDoctorOption[]>([]);

  // 科室 / 医生筛选（科室影响后端查询，医生也会传给后端）
  const [selectedDeps, setSelectedDepsRaw] = useState<string[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);

  // 设置科室时清理不属于这些科室的已选医生
  const setSelectedDeps = useCallback(
    (deps: string[]) => {
      setSelectedDepsRaw(deps);

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
    if (!selectedDeps.length) return allDoctors;
    return allDoctors.filter((d) => selectedDeps.includes(d.dep_code));
  }, [allDoctors, selectedDeps]);

  const [summary, setSummary] = useState<SummaryViewModel | null>(null);

  // ✅ 明细：前端分页
  const rowsPerPage = INPATIENT_ROWS_PER_PAGE;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [details, setDetails] = useState<DetailsRow[]>([]);

  // 排序（目前只是占位，后面需要可以实现前端排序）
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

  // 统一：把选中的「绩效科室 code」转换成「绩效科室名称」给后端
  const getDepNamesOrNull = useCallback((): string[] | null => {
    if (!selectedDeps.length) return null;
    const set = new Set(selectedDeps);
    const names = departments
      .filter((d) => set.has(d.code))
      .map((d) => d.name)
      .filter(Boolean);
    return names.length ? names : null;
  }, [departments, selectedDeps]);

  // ---- 核心拉数逻辑 ----

  const applyFullResult = (payload: FullQueryResponse) => {
    // 1）汇总：用 extractSummaryFromStd 解析同比/环比
    const vm = extractSummaryFromStd(payload);
    setSummary(vm);

    // 2）明细
    const rows = ((payload.details ?? payload.rows) || []) as DetailsRow[];
    setDetails(rows);
    setTotal(
      typeof payload.total === "number" && Number.isFinite(payload.total)
        ? payload.total
        : rows.length
    );

    // 3）趋势
    const ts = (payload.timeseries || []) as TSRow[];
    setTsRows(ts);
  };

  // 初始化：加载医生+科室 + 今日数据
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError("");
      try {
        // 1）加载科室 + 医生映射
        const data = await fetchInitAPI();

        const rawDocs = Array.isArray((data as any)?.doctors)
          ? (data as any).doctors
          : [];

        const docList: UIDoctorOption[] = rawDocs
          .map((d: any) => ({
            id: String(d.doc_id ?? ""),
            name: String(d.doc_name ?? ""),
            dep_code: String(d.dep_id ?? ""),
            dep_name: String(d.dep_name ?? ""),
            perf_dep_name: String(d.dep_name ?? ""),
          }))
          .filter((d) => d.id && d.name);

        setAllDoctors(docList);

        // 科室列表：从医生的 dep_code/dep_name 推导去重
        const depMap = new Map<string, string>();
        const depList: DepartmentOption[] = [];
        for (const d of docList) {
          if (d.dep_code && !depMap.has(d.dep_code)) {
            depMap.set(d.dep_code, d.dep_name);
            depList.push({ code: d.dep_code, name: d.dep_name });
          }
        }
        setDepartments(depList);

        // 默认日期：今天
        const today = getToday(0);
        setStartDate(today);
        setEndDate(today);
        setPage(1);
        setCompare(INPATIENT_DEFAULT_COMPARE);
        setSortKey(INPATIENT_DEFAULT_SORT_KEY);
        setSortDir(INPATIENT_DEFAULT_SORT_DIR);

        // 2）拉取今日汇总 + 明细 + 趋势（统一 /query）
        const full = await fetchFullAPI({
          start: today,
          end: today,
          deps: null,
          docs: null,
        });
        applyFullResult(full);
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    };
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      const depNames = getDepNamesOrNull();
      const docs = selectedDocs.length ? selectedDocs : null;

      const full = await fetchFullAPI({
        start: startDate,
        end: endDate,
        deps: depNames,
        docs,
      });

      setPage(1);
      applyFullResult(full);
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
    setSelectedDeps([]);
    setSelectedDocs([]);
    setError("");
    setPage(1);
    setCompare(INPATIENT_DEFAULT_COMPARE);
    setSortKey(INPATIENT_DEFAULT_SORT_KEY);
    setSortDir(INPATIENT_DEFAULT_SORT_DIR);

    setLoading(true);
    try {
      const full = await fetchFullAPI({
        start: today,
        end: today,
        deps: null,
        docs: null,
      });
      applyFullResult(full);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  // FilterBar 展示的标签
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

  // 前端分页
  const onPageChange = (nextPage: number) => {
    setPage(nextPage);
  };

  return {
    // 状态
    loading,
    error,
    departments,
    doctors,
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
    setSelectedDeps,
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
