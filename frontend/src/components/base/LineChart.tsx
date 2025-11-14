import React from "react";
import {
  ResponsiveContainer,
  LineChart as RLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export type CompareKind = "yoy" | "mom";

export interface TrendRow {
  date: string;
  yoy_pct: number | null;
  mom_pct: number | null;
  bed_yoy_pct?: number | null;
  bed_mom_pct?: number | null;
}

interface Props {
  rows: TrendRow[];
  compare: CompareKind; // 'yoy' = 同比, 'mom' = 环比
  onToggleCompare?: (kind: CompareKind) => void;
}

const formatPercent = (v: any) => {
  if (v == null || !Number.isFinite(Number(v))) return "-";
  return `${Number(v).toFixed(2)}%`;
};

const formatDateLabel = (raw: string) => {
  // 后端返回 'YYYY-MM-DD'，简单截一下
  if (!raw) return "";
  return raw.slice(5); // 显示 MM-DD
};

const LineChart: React.FC<Props> = ({ rows, compare }) => {
  // 根据 compare 映射出统一的数据字段
  const data = rows.map((r) => ({
    date: r.date,
    revenue: compare === "yoy" ? r.yoy_pct : r.mom_pct,
    bed:
      compare === "yoy"
        ? r.bed_yoy_pct ?? null
        : r.bed_mom_pct ?? null,
  }));

  const title =
    compare === "yoy"
      ? "收入 / 床日同比增长率(%)"
      : "收入 / 床日环比增长率(%)";

  const revName = compare === "yoy" ? "收入同比(%)" : "收入环比(%)";
  const bedName = compare === "yoy" ? "床日同比(%)" : "床日环比(%)";

  return (
    <div className="w-full h-[360px]">
      <div className="text-sm font-semibold mb-2 text-left text-gray-900">
        {title}
      </div>
      <ResponsiveContainer>
        <RLineChart
          data={data}
          margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDateLabel}
            minTickGap={16}
          />
          <YAxis tickFormatter={formatPercent} domain={["auto", "auto"]} />
          <Tooltip
            formatter={(value: any) => formatPercent(value)}
            labelFormatter={(label: any) => String(label)}
          />
          <Legend />
          {/* 收入折线 */}
          <Line
            type="monotone"
            dataKey="revenue"
            name={revName}
            dot={false}
            strokeWidth={2}
          />
          {/* 床日折线 */}
          <Line
            type="monotone"
            dataKey="bed"
            name={bedName}
            dot={false}
            strokeWidth={2}
          />
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default LineChart;
