// src/components/common/PageHeader.tsx
import React from "react";

interface PageHeaderProps {
  /** 主标题 */
  title: React.ReactNode;
  /** 副标题 / 描述文案（可选） */
  description?: React.ReactNode;
  /** 右侧操作区（按钮、筛选器等，可选） */
  extra?: React.ReactNode;
  /** 自定义容器 className（可选） */
  className?: string;
}

/**
 * 通用页面标题头
 * - 左侧：标题 + 描述
 * - 右侧：可选操作区（extra）
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  extra,
  className,
}) => {
  const base =
    "bg-white rounded-lg shadow-sm border border-gray-200 p-6";

  return (
    <div className={className ? `${base} ${className}` : base}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">
            {title}
          </h2>
          {description && (
            <p className="text-gray-600 text-sm">{description}</p>
          )}
        </div>

        {extra && (
          <div className="flex items-center space-x-2">{extra}</div>
        )}
      </div>
    </div>
  );
};
