// src/features/outpatientTotalRevenue/components/TrendSection.tsx

import React from "react";
import type { CompareMode, TimeseriesRow } from "../types";
import { formatNumber, formatPercent } from "../utils";

interface Props {
  loading: boolean;
  rows: TimeseriesRow[];
  compare: CompareMode;
}

const TrendSection: React.FC<Props> = ({ loading, rows, compare }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-800">门急诊收入趋势</div>
        <div className="text-xs text-gray-500">
          对比模式：
          {compare === "yoy"
            ? "同比"
            : compare === "mom"
            ? "环比"
            : "无"}
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-gray-500 text-sm">
          加载趋势数据中...
        </div>
      ) : !rows.length ? (
        <div className="py-10 text-center text-gray-400 text-sm">暂无趋势数据</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>日期</Th>
                <Th align="right">收入</Th>
                <Th align="right">去年同期收入</Th>
                <Th align="right">收入同比</Th>
                <Th align="right">收入环比</Th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.date}>
                  <Td>{r.date}</Td>
                  <Td align="right">{formatNumber(r.revenue, 2)}</Td>
                  <Td align="right">
                    {r.last_year !== null ? formatNumber(r.last_year, 2) : "-"}
                  </Td>
                  <Td align="right">{formatPercent(r.yoy_pct, 1)}</Td>
                  <Td align="right">{formatPercent(r.mom_pct, 1)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const Th: React.FC<{ align?: "left" | "right" | "center"; children: React.ReactNode }> =
  ({ align = "left", children }) => (
    <th
      className={`px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider text-${align}`}
    >
      {children}
    </th>
  );

const Td: React.FC<{ align?: "left" | "right" | "center"; children: React.ReactNode }> =
  ({ align = "left", children }) => (
    <td className={`px-3 py-2 text-sm text-gray-700 text-${align}`}>{children}</td>
  );

export default TrendSection;
