// src/features/inpatientTotalRevenue/components/TrendSection.tsx
import React, { useMemo, useState, useEffect } from "react";
import { TrendChart } from "../../../../components/common/TrendChart";
import type { TSRow } from "../api";
import { INPATIENT_TREND_TITLE, INPATIENT_DEFAULT_COMPARE } from "../config";
import { buildTrendDatasets } from "../utils";

type CompareMode = "yoy" | "mom";

interface TrendSectionProps {
  loading: boolean;
  rows: TSRow[];
  compare?: CompareMode;
}

const TrendSection: React.FC<TrendSectionProps> = ({
  loading,
  rows,
  compare,
}) => {
  const [mode, setMode] = useState<CompareMode>(
    compare ?? INPATIENT_DEFAULT_COMPARE
  );

  useEffect(() => {
    if (compare) setMode(compare);
  }, [compare]);

  const { labels, datasets } = useMemo(
    () => buildTrendDatasets(rows || [], mode),
    [rows, mode]
  );

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
      {/* 标题区 + 切换按钮 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">趋势图表分析</h2>

        <div className="inline-flex rounded-lg overflow-hidden border text-xs">
          <button
            onClick={() => setMode("yoy")}
            className={`px-3 py-1 ${
              mode === "yoy"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700"
            }`}
          >
            同比
          </button>
          <button
            onClick={() => setMode("mom")}
            className={`px-3 py-1 ${
              mode === "mom"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700"
            }`}
          >
            环比
          </button>
        </div>
      </div>

      {/* 画布容器 —— 更紧凑、更小 */}
      <div className="w-full overflow-x-auto">
        <div className="min-w-[520px] max-w-[760px] mx-auto scale-90 origin-top">
          <TrendChart
            labels={labels}
            datasets={datasets}
            title={INPATIENT_TREND_TITLE[mode]}
            xLabel="日期"
            yLabel="百分比（%）"
            loading={loading}
            emptyText="当前条件下没有趋势数据"
            heightClassName="h-56 md:h-72"
          />
        </div>
      </div>

      <p className="text-xs text-gray-500 mt-1 text-left">
        注：蓝色折线为收入增长率，绿色折线为床日增长率。
      </p>
    </section>
  );
};

export default TrendSection;
