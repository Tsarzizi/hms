// src/features/outpatientTotalRevenue/components/SummaryCards.tsx

import React from "react";
import type { Summary } from "../types";
import { formatNumber, formatPercent } from "../utils";

interface Props {
  summary: Summary | null;
}

const SummaryCards: React.FC<Props> = ({ summary }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <Card
        label="当前门急诊收入"
        value={summary ? formatNumber(summary.current, 2) : "-"}
        suffix="元"
      />
      <Card
        label="收入同比"
        value={summary ? formatPercent(summary.growth_rate, 1) : "-"}
      />
      <Card
        label="收入环比"
        value={summary ? formatPercent(summary.mom_growth_rate, 1) : "-"}
      />
      <Card
        label="当前床日"
        value={summary ? formatNumber(summary.current_bed_days, 0) : "-"}
        suffix="床日"
      />
      <Card
        label="床日同比"
        value={summary ? formatPercent(summary.bed_growth_rate, 1) : "-"}
      />
      <Card
        label="床日环比"
        value={summary ? formatPercent(summary.bed_mom_growth_rate, 1) : "-"}
      />
    </div>
  );
};

interface CardProps {
  label: string;
  value: string;
  suffix?: string;
}

const Card: React.FC<CardProps> = ({ label, value, suffix }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-xl font-semibold text-gray-900">
        {value}
        {suffix ? <span className="ml-1 text-xs text-gray-500">{suffix}</span> : null}
      </div>
    </div>
  );
};

export default SummaryCards;
