// src/features/inpatientTotalRevenue/Page.tsx
import React from "react";
import { PageHeader } from "../../../components/common/PageHeader";
import ErrorAlert from "../../../components/ErrorAlert";
import { PAGE_HEADER_CONFIG } from "./config";
import { useInpatientTotalRevenuePage } from "./hooks";

import FilterSection from "./components/FilterSection";
import InpatientSummaryCards from "./components/SummaryCards";
import DetailsSection from "./components/DetailsSection";
import TrendSection from "./components/TrendSection";

export default function InpatientTotalRevenuePage() {
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
  } = useInpatientTotalRevenuePage();

  return (
    <div className="p-6 space-y-6">
      <PageHeader {...PAGE_HEADER_CONFIG} />
      <ErrorAlert message={error} />

      {/* 筛选区：已经用 FilterSectionBase 包好了 */}
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

      {/* 汇总指标（用 IndicatorCard 网格） */}
      <InpatientSummaryCards
          summary={summary}
      />



      {/* ✅ 趋势分析模块：只管图表 */}
      <TrendSection
          loading={loading}
          rows={tsRows}
          compare={compare}
      />

      {/* ✅ 数据详情模块：只管表格 */}
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
