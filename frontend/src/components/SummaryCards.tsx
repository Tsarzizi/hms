interface SummaryData {
  total_revenue?: number;
  yoy_growth_rate?: number;
  mom_growth_rate?: number;
  bed_day_growth_rate?: number;
  bed_day_mom_growth_rate?: number;
  trend?: string;
}

/**
 * 纯展示型组件：把原来“汇总概览”那块 JSX 抽出来
 */
export default function InpatientSummaryCards({
  summary,
}: {
  summary: SummaryData | null;
}) {
  return (
    <section className="p-4 border rounded-lg bg-white">
      <h2 className="text-lg font-semibold mb-3 text-left">汇总概览</h2>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-left text-sm">
        <div className="space-y-1">
          <div className="text-gray-600">总收入</div>
          <div className="text-lg font-mono">
            {summary?.total_revenue?.toLocaleString?.() ?? "-"}
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-gray-600">收入同比增长 (YoY)</div>
          <div
            className={
              typeof summary?.yoy_growth_rate === "number"
                ? summary.yoy_growth_rate >= 0
                  ? "text-green-600"
                  : "text-red-600"
                : ""
            }
          >
            {typeof summary?.yoy_growth_rate === "number"
              ? `${summary.yoy_growth_rate.toFixed(2)}%`
              : "-"}
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-gray-600">收入环比增长 (MoM)</div>
          <div
            className={
              typeof summary?.mom_growth_rate === "number"
                ? summary.mom_growth_rate >= 0
                  ? "text-green-600"
                  : "text-red-600"
                : ""
            }
          >
            {typeof summary?.mom_growth_rate === "number"
              ? `${summary.mom_growth_rate.toFixed(2)}%`
              : "-"}
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-gray-600">床日同比增长</div>
          <div
            className={
              typeof summary?.bed_day_growth_rate === "number"
                ? summary.bed_day_growth_rate >= 0
                  ? "text-green-600"
                  : "text-red-600"
                : ""
            }
          >
            {typeof summary?.bed_day_growth_rate === "number"
              ? `${summary.bed_day_growth_rate.toFixed(2)}%`
              : "-"}
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-gray-600">床日环比增长</div>
          <div
            className={
              typeof summary?.bed_day_mom_growth_rate === "number"
                ? summary.bed_day_mom_growth_rate >= 0
                  ? "text-green-600"
                  : "text-red-600"
                : ""
            }
          >
            {typeof summary?.bed_day_mom_growth_rate === "number"
              ? `${summary.bed_day_mom_growth_rate.toFixed(2)}%`
              : "-"}
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-gray-500 text-left space-y-1">
        <div>趋势判断：{summary?.trend || "—"}</div>
        <div>
          说明：同比 = 去年同期同区间；环比 = 同长度上一周期。
          床日数据来自在院人数统计（实时表 + 历史表）。
        </div>
      </div>
    </section>
  );
}
