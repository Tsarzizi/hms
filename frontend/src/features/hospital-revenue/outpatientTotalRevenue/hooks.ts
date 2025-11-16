// src/features/outpatientTotalRevenue/hooks.ts

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DepartmentOption,
  DoctorOption,
  Summary,
  TimeseriesRow,
  DetailRow,
  SortDir,
  SortKey,
  CompareMode,
  InitResponse,
  QueryResponse,
} from "./types";
import { daysAgoStr, todayStr, sortDetails } from "./utils";

const API_PREFIX = "/api/outpatient-total-revenue";

const DEFAULT_ROWS_PER_PAGE = 20;

export function useOutpatientTotalRevenuePage() {
  // ------- 状态 -------
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [tsRows, setTsRows] = useState<TimeseriesRow[]>([]);
  const [details, setDetails] = useState<DetailRow[]>([]);

  const [rowsPerPage] = useState(DEFAULT_ROWS_PER_PAGE);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [compare, setCompare] = useState<CompareMode>("yoy");

  const [startDate, setStartDate] = useState<string>(daysAgoStr(6));
  const [endDate, setEndDate] = useState<string>(todayStr());
  const [selectedDeps, setSelectedDeps] = useState<string[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);

  // ------- label -------
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

  // ------- 初始化：获取科室+医生 -------
  const fetchInit = useCallback(async () => {
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
  }, []);

  // ------- 查询汇总+明细 -------
  const onSubmitSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const payload: any = {
        start_date: startDate,
        end_date: endDate,
      };
      if (selectedDeps.length) {
        payload.departments = selectedDeps;
      }
      if (selectedDocs.length) {
        payload.doctors = selectedDocs;
      }

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
      setDetails(data.details || []);
      setTotal(data.total ?? (data.details ? data.details.length : 0));
      setPage(1);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "查询失败");
      setSummary(null);
      setTsRows([]);
      setDetails([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedDeps, selectedDocs]);

  // ------- 重置 -------
  const onReset = useCallback(() => {
    setStartDate(daysAgoStr(6));
    setEndDate(todayStr());
    setSelectedDeps([]);
    setSelectedDocs([]);
    setSortKey("date");
    setSortDir("desc");
    setCompare("yoy");
    setPage(1);
  }, []);

  // ------- 分页 -------
  const onPageChange = useCallback((nextPage: number) => {
    setPage(nextPage);
  }, []);

  // ------- 排序 + 分页后的详情 -------
  const pagedDetails = useMemo(() => {
    const sorted = sortDetails(details, sortKey, sortDir);
    const startIdx = (page - 1) * rowsPerPage;
    return sorted.slice(startIdx, startIdx + rowsPerPage);
  }, [details, sortKey, sortDir, page, rowsPerPage]);

  // ------- 初始化：加载科室+医生，默认加载一次数据 -------
  useEffect(() => {
    fetchInit();
  }, [fetchInit]);

  useEffect(() => {
    // 初始化完成后自动查一次
    if (departments || doctors) {
      onSubmitSummary();
    }
  }, [departments.length, doctors.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
    details: pagedDetails,
    sortKey,
    sortDir,
    tsRows,
    compare,
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
    onSubmitSummary,
    onReset,
    onPageChange,
  };
}
