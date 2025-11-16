// src/components/SummaryCards.tsx
import React from "react";
import IndicatorCard from "../../../../components/common/IndicatorCard";
import {
  INPATIENT_SUMMARY_INDICATORS,
  type SummaryIndicatorConfig,
} from "../config";

interface SummaryData {
  total_revenue?: number;
  yoy_growth_rate?: number;
  mom_growth_rate?: number;
  bed_day_growth_rate?: number;
  bed_day_mom_growth_rate?: number;
  trend?: string;
}

/**
 * 汇总指标展示：
 * - 配置在 config.ts（INPATIENT_SUMMARY_INDICATORS）
 * - 这里根据配置 + summary 数据渲染一排 IndicatorCard
 * - 不再有最外层“汇总概览”大卡片
 */
export default function InpatientSummaryCards({
  summary,
}: {
  summary: SummaryData | null;
}) {
  const safeSummary = summary ?? {};

  const formatValue = (cfg: SummaryIndicatorConfig, raw: any): string => {
    if (typeof raw !== "number" || Number.isNaN(raw)) return "-";

    if (cfg.format === "number") {
      return raw.toLocaleString();
    }
    // percent
    return `${raw.toFixed(2)}%`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 md:gap-6">
      {INPATIENT_SUMMARY_INDICATORS.map((cfg) => {
        const rawValue = (safeSummary as any)[cfg.key];
        const valueText = formatValue(cfg, rawValue);

        return (
          <IndicatorCard key={cfg.key} title={cfg.title}>
            <div className="text-2xl font-bold font-mono text-gray-900">
              {valueText}
            </div>
            <div className="text-xs text-gray-500">{cfg.description}</div>
          </IndicatorCard>
        );
      })}
    </div>
  );
}
