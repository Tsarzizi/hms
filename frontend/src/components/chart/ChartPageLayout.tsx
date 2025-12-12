// src/components/chart/ChartPageLayout.tsx
import React from "react";
import { ChartPanel } from "./ChartPanel";
import { ChartHeader } from "./ChartHeader";
import { TrendChart, TrendChartDataset } from "./TrendChart";

export interface TimeRangeOption {
  key: string;
  label: string;
}

export interface MetricOption {
  key: string;
  label: string;
  color?: string;
}

export interface ChartPageLayoutProps {
  /** 时间维度列表（如：天/月/季/年） */
  timeRanges: TimeRangeOption[];
  /** 当前选中的时间维度 key */
  activeTimeRange: string;
  /** 切换时间维度 */
  onTimeRangeChange: (key: string) => void;

  /** 指标列表 */
  metrics: MetricOption[];
  /** 已选中的指标 key 列表 */
  selectedMetricKeys: string[];
  /** 切换某个指标 */
  onToggleMetric: (key: string) => void;
  /** 全选/取消全选（可选） */
  onToggleAllMetrics?: () => void;

  /** 图表横轴标签 */
  chartLabels: string[];
  /** 图表数据集（折线图） */
  chartDatasets: TrendChartDataset[];
  /** 图表是否加载中 */
  loading?: boolean;

  /** 页面根容器 className（可选） */
  className?: string;
}

/**
 * 通用图表页面布局：
 * - 顶部：PageHeader（标题 + 描述）
 * - 中部：ChartPanel（卡片）
 *   - 头部：ChartHeader（时间维度 + 指标 chips）
 *   - 内容：TrendChart（折线图）
 */
export const ChartPageLayout: React.FC<ChartPageLayoutProps> = ({
  pageTitle,
  pageDescription,

  timeRanges,
  activeTimeRange,
  onTimeRangeChange,

  metrics,
  selectedMetricKeys,
  onToggleMetric,
  onToggleAllMetrics,

  chartLabels,
  chartDatasets,
  loading = false,

  className,
}) => {
  return (
    <div className={className ?? "p-6 space-y-6"}>

      {/* 图表区域 */}
      <ChartPanel title="趋势分析图表">
        <ChartHeader
          timeRanges={timeRanges}
          activeTimeRange={activeTimeRange}
          onTimeRangeChange={onTimeRangeChange}
          options={metrics.map((m) => ({
            key: m.key,
            label: m.label,
            color: m.color,
          }))}
          selectedOptions={selectedMetricKeys}
          onToggleOption={onToggleMetric}
          onToggleAll={onToggleAllMetrics}
        />

        <TrendChart
          labels={chartLabels}
          datasets={chartDatasets}
          loading={loading}
          xLabel="时间"
          yLabel="数值"
        />
      </ChartPanel>
    </div>
  );
};
