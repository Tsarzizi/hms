// src/features/inpatientRevenueRanking/IndicatorCard.tsx
import React, { ReactNode } from "react";

export interface IndicatorCardProps {
  title?: string;
  extra?: ReactNode;      // 右上角区域（可选）
  children?: ReactNode;   // 内容由使用者自由渲染
}

export default function IndicatorCard({
  title,
  extra,
  children,
}: IndicatorCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      {/* 标题 + 右侧扩展 */}
      {(title || extra) && (
        <div className="flex items-center justify-between mb-3">
          {title && (
            <div className="text-sm font-medium text-gray-700">{title}</div>
          )}
          {extra && <div>{extra}</div>}
        </div>
      )}

      {/* 自定义内容 */}
      <div className="space-y-2">
        {children}
      </div>
    </div>
  );
}
