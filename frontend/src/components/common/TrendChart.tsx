// src/components/common/TrendChart.tsx
import React from "react";
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
  /** 线条/填充颜色，可选 */
  color?: string;
}

export interface TrendChartProps {
  /** X 轴标签，如日期数组 */
  labels: string[];
  /** 数据集列表，可多条线 */
  datasets: TrendChartDataset[];
  /** 图表标题 */
  title?: string;
  /** X 轴标题 */
  xLabel?: string;
  /** Y 轴标题 */
  yLabel?: string;
  /** 是否加载中 */
  loading?: boolean;
  /** 没有数据时的提示文案 */
  emptyText?: string;
  /** 容器高度 className，默认 h-96 */
  heightClassName?: string;
}

export const TrendChart: React.FC<TrendChartProps> = ({
  labels,
  datasets,
  title,
  xLabel = "X 轴",
  yLabel = "Y 轴",
  loading = false,
  emptyText = "暂无图表数据",
  heightClassName = "h-96",
}) => {
  const hasData =
    labels.length > 0 &&
    datasets.some((ds) => Array.isArray(ds.data) && ds.data.length > 0);

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
    plugins: {
      legend: {
        position: "top" as const,
      },
      title: {
        display: !!title,
        text: title,
      },
    },
    scales: {
      x: {
        title: {
          display: !!xLabel,
          text: xLabel,
        },
      },
      y: {
        title: {
          display: !!yLabel,
          text: yLabel,
        },
      },
    },
  };

  return (
    <div className={heightClassName}>
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
            <p className="text-xs text-gray-400">
              请检查查询条件或数据源配置
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
