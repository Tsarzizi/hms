// src/features/outpatientTotalRevenue/Page.tsx

import React from "react";
import { PageHeader } from "../../../components/common/PageHeader";
import ErrorAlert from "../../../components/ErrorAlert";
import { PAGE_HEADER_CONFIG } from "./config";
import { useOutpatientTotalRevenuePage } from "./hooks";

import FilterSection from "./components/FilterSection";
import SummaryCards from "./components/SummaryCards";
import DetailsSection from "./components/DetailsSection";
import TrendSection from "./components/TrendSection";

export default function OutpatientTotalRevenuePage() {
  const {
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
  } = useOutpatientTotalRevenuePage();

  return (
    <div className="p-6 space-y-6">
      <PageHeader {...PAGE_HEADER_CONFIG} />
      <ErrorAlert message={error || undefined} />

      {/* 筛选区 */}
      <FilterSection
        loading={loading}
        startDate={startDate}
        endDate={endDate}
        departments={departments}
        doctors={doctors}
        selectedDeps={selectedDeps}
        selectedDocs={selectedDocs}
        depSummaryLabel={depSummaryLabel}
        docSummaryLabel={docSummaryLabel}
        onChangeStartDate={setStartDate}
        onChangeEndDate={setEndDate}
        onChangeSelectedDeps={setSelectedDeps}
        onChangeSelectedDocs={setSelectedDocs}
        onQuery={onSubmitSummary}
        onReset={onReset}
      />

      {/* 汇总指标 */}
      <SummaryCards summary={summary} />

      {/* 趋势分析 */}
      <TrendSection loading={loading} rows={tsRows} compare={compare} />

      {/* 明细 */}
      <DetailsSection
        details={details}
        loading={loading}
        sortKey={sortKey}
        sortDir={sortDir}
        onChangeSortKey={setSortKey}
        onChangeSortDir={setSortDir}
        doctors={doctors}
        selectedDocs={selectedDocs}
        onChangeSelectedDocs={setSelectedDocs}
        page={page}
        rowsPerPage={rowsPerPage}
        total={total}
        onPageChange={onPageChange}
      />
    </div>
  );
}
