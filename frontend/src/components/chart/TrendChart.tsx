// src/components/common/TrendChart.tsx
import React, { useEffect, useRef } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title as ChartTitle,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ChartTitle,
  Tooltip,
  Legend
);

export interface TrendChartDataset {
  label: string;
  data: number[];
  color?: string;
}

export interface TrendChartProps {
  labels: string[];
  datasets: TrendChartDataset[];
  title?: string;
  xLabel?: string;
  yLabel?: string;
  loading?: boolean;
  emptyText?: string;
}

/**
 * 🔥 自动高度 TrendChart：
 * - 宽度自适应（Chart.js 默认支持）
 * - 高度会根据 labels 数量自动扩展，避免挤压或溢出
 */
export const TrendChart: React.FC<TrendChartProps> = ({
  labels,
  datasets,
  title,
  xLabel = "X 轴",
  yLabel = "Y 轴",
  loading = false,
  emptyText = "暂无图表数据",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  /** ⭐ 自动高度公式 */
  const computeHeight = () => {
    const base = 260;            // 基本高度
    const extraPer10 = 80;       // 每 10 个标签增加的高度
    const blocks = Math.ceil(labels.length / 10);
    return base + (blocks - 1) * extraPer10;
  };

  const chartHeight = computeHeight();

  const hasData =
    labels.length > 0 &&
    datasets.some((ds) => ds.data && ds.data.length > 0);

  const chartData = {
    labels,
    datasets: datasets.map((ds) => ({
      label: ds.label,
      data: ds.data,
      borderColor: ds.color,
      backgroundColor: ds.color ? ds.color + "20" : undefined,
      tension: 0.1,
    })),
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false, // ⭐ 允许高度增长
    plugins: {
      legend: { position: "top" },
      title: { display: !!title, text: title },
    },
    scales: {
      x: {
        title: { display: !!xLabel, text: xLabel },
        ticks: {
          maxRotation: 45,
          minRotation: 25,
        },
      },
      y: {
        title: { display: !!yLabel, text: yLabel },
      },
    },
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{
        height: `${chartHeight}px`, // ⭐ 动态高度设置
      }}
    >
      {loading ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-gray-500 text-sm">加载数据中...</p>
          </div>
        </div>
      ) : hasData ? (
        <Line data={chartData} options={options} />
      ) : (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <p className="text-gray-500 mb-1">{emptyText}</p>
            <p className="text-xs text-gray-400">请检查查询条件或数据源</p>
          </div>
        </div>
      )}
    </div>
  );
};
