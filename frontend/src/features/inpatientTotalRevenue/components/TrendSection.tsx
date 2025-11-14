// src/features/inpatientTotalRevenue/components/TrendSection.tsx
import React, { useMemo } from "react";
import { TrendChart } from "../../../components/common/TrendChart";
import type { TSRow } from "../types";
import { INPATIENT_TREND_TITLE } from "../config";
import { buildTrendDatasets } from "../utils";

interface TrendSectionProps {
  loading: boolean;
  rows: TSRow[];
  compare: "yoy" | "mom";
}

const TrendSection: React.FC<TrendSectionProps> = ({
  loading,
  rows,
  compare,
}) => {
  const { labels, datasets } = useMemo(
    () => buildTrendDatasets(rows || [], compare),
    [rows, compare]
  );

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
      <h2 className="text-lg font-semibold text-gray-900 text-left">
        趋势图表分析
      </h2>

      <TrendChart
        labels={labels}
        datasets={datasets}
        title={INPATIENT_TREND_TITLE[compare]}
        xLabel="日期"
        yLabel="百分比（%）"
        loading={loading}
        emptyText="当前条件下没有趋势数据"
        heightClassName="h-96"
      />
    </section>
  );
};

export default TrendSection;
