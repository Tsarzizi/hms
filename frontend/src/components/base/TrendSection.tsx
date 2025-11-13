// src/components/inpatient/InpatientTrendSection.tsx
import LineChart, { CompareKind } from "../LineChart";
import type { TSRow } from "../../services/inpatientTotalRevenueApi";

interface Props {
  rows: TSRow[];
  compare: CompareKind;
  onChangeCompare: (kind: CompareKind) => void;
}

export default function InpatientTrendSection({
  rows,
  compare,
  onChangeCompare,
}: Props) {
  if (!rows || rows.length === 0) {
    return <div className="text-gray-400 text-sm">暂无趋势数据</div>;
  }

  return (
    <div className="border rounded-lg p-3 bg-white">
      <div className="mb-3 font-semibold text-sm">
        趋势折线图（收入 &amp; 床日增长率）
      </div>
      <LineChart
        rows={rows.map((r) => ({
          date: r.date,
          yoy_pct: r.yoy_pct ?? null,
          mom_pct: r.mom_pct ?? null,
          bed_yoy_pct:
            (r as any).bed_yoy_pct != null ? (r as any).bed_yoy_pct : null,
          bed_mom_pct:
            (r as any).bed_mom_pct != null ? (r as any).bed_mom_pct : null,
        }))}
        compare={compare}
        onToggleCompare={onChangeCompare}
      />
      <p className="text-xs text-gray-500 mt-2 text-left">
        注：蓝色折线表示收入增长率，绿色折线表示床日增长率。
        “同比” = 去年同期同日；“环比” = 同长度上一周期对应日期。
      </p>
    </div>
  );
}
