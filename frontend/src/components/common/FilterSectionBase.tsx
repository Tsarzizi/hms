import React, { ReactNode } from "react";

interface FilterSectionBaseProps {
  title?: string;
  loading?: boolean;
  onQuery: () => void;
  onReset?: () => void;
  onDownload?: () => void;
  children: ReactNode;
}

/**
 * 最基础的筛选栏壳子：
 * - 负责卡片样式 + grid 布局 + 按钮区
 * - 不关心具体有哪些字段，字段由 children 决定
 */
export function FilterSectionBase({
  title = "数据筛选",
  loading = false,
  onQuery,
  onReset,
  onDownload,
  children,
}: FilterSectionBaseProps) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 text-left">
        {title}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {/* 这里放具体筛选项，由各板块自己定义 */}
        {children}

        {/* 统一按钮区 */}
        <div className="flex items-end gap-2 col-span-2">
          <button
            onClick={onQuery}
            disabled={loading}
            className="flex-1 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700
              disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200
              font-medium flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291
                    A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824
                    3 7.938l3-2.647z"
                  />
                </svg>
                查询中...
              </>
            ) : (
              "查询"
            )}
          </button>

          {onDownload && (
            <button
              onClick={onDownload}
              className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700
                transition-colors duration-200 font-medium"
            >
              下载
            </button>
          )}

          {onReset && (
            <button
              onClick={onReset}
              className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg
                hover:bg-gray-50 transition-colors duration-200 font-medium"
            >
              重置
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * 小工具组件：单个筛选项的基础样式（label + 控件）
 * 各板块可以按需使用，也可以不用
 */
interface FilterItemProps {
  label: string;
  children: ReactNode;
}

export function FilterItem({ label, children }: FilterItemProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700 block">
        {label}
      </label>
      {children}
    </div>
  );
}
