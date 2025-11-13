// src/components/inpatient/InpatientTrendWithToolbar.tsx
//
// 合并组件：住院收入页面顶部工具栏 + 趋势折线图展示
// 作用：
//  1. 顶部提供“数据详情 / 趋势分析”切换按钮
//  2. 在“趋势分析”模式下，提供“同比 / 环比”切换
//  3. 展示收入 & 床日增长率的折线图，以及说明文字
//
// 使用方式：由父组件管理 viewMode / compare / rows，
// 本组件只负责展示和把用户操作回调给父组件。

import LineChart, { CompareKind } from "./LineChart";
import type { TSRow } from "../services/inpatientTotalRevenueApi";

interface Props {
  /** 当前视图模式：数据详情 or 趋势分析 */
  viewMode: "details" | "chart";
  /** 切换视图模式的回调（父组件负责真正切换内容） */
  onChangeView: (mode: "details" | "chart") => void;

  /** 当前对比方式：同比 / 环比 */
  compare: CompareKind;
  /** 切换同比/环比的回调（会传给 LineChart） */
  onChangeCompare: (kind: CompareKind) => void;

  /** 趋势数据（按日聚合的收入 & 床日增长率） */
  rows: TSRow[];
}

export default function InpatientTrendWithToolbar({
  viewMode,
  onChangeView,
  compare,
  onChangeCompare,
  rows,
}: Props) {
  // 如果当前是“趋势分析”模式，但没有数据，直接给出提示
  const noChartData = viewMode === "chart" && (!rows || rows.length === 0);

  return (
    <section className="space-y-3">
      {/* 顶部工具栏：视图切换 + 同比/环比切换 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* 左侧：切换“数据详情 / 趋势分析” */}
        <div className="inline-flex rounded-lg overflow-hidden border text-sm">
          <button
            type="button"
            onClick={() => onChangeView("details")}
            className={`px-3 py-1 ${
              viewMode === "details"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700"
            }`}
          >
            数据详情
          </button>
          <button
            type="button"
            onClick={() => onChangeView("chart")}
            className={`px-3 py-1 ${
              viewMode === "chart"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700"
            }`}
          >
            趋势分析
          </button>
        </div>

        {/* 右侧：仅在“趋势分析”模式下显示同比/环比切换按钮 */}
        {viewMode === "chart" && (
          <div className="inline-flex rounded-lg overflow-hidden border text-sm">
            <button
              type="button"
              onClick={() => onChangeCompare("yoy")}
              className={`px-3 py-1 ${
                compare === "yoy"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700"
              }`}
            >
              同比
            </button>
            <button
              type="button"
              onClick={() => onChangeCompare("mom")}
              className={`px-3 py-1 ${
                compare === "mom"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700"
              }`}
            >
              环比
            </button>
          </div>
        )}
      </div>

      {/* 趋势图区域：仅在“趋势分析”模式下显示 */}
      {viewMode === "chart" && (
        <>
          {noChartData ? (
            <div className="text-gray-400 text-sm">暂无趋势数据</div>
          ) : (
            <div className="border rounded-lg p-3 bg-white">
              {/* 区块标题 */}
              <div className="mb-3 font-semibold text-sm">
                趋势折线图（收入 &amp; 床日增长率）
              </div>

              {/* 折线图本体：收入 + 床日增长率，两条折线 */}
              <LineChart
                rows={rows.map((r) => ({
                  date: r.date,
                  // 收入：同比 / 环比 增长率
                  yoy_pct: r.yoy_pct ?? null,
                  mom_pct: r.mom_pct ?? null,
                  // 床日：同比 / 环比 增长率
                  bed_yoy_pct:
                    (r as any).bed_yoy_pct != null ? (r as any).bed_yoy_pct : null,
                  bed_mom_pct:
                    (r as any).bed_mom_pct != null ? (r as any).bed_mom_pct : null,
                }))}
                compare={compare}
                // 折线图内部切换同比/环比时，同步回调出去
                onToggleCompare={onChangeCompare}
              />

              {/* 说明文案 */}
              <p className="text-xs text-gray-500 mt-2 text-left">
                注：蓝色折线表示收入增长率，绿色折线表示床日增长率。
                “同比” = 去年同期同日；“环比” = 同长度上一周期对应日期。
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
