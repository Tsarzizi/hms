// src/components/chart/ChartHeader.tsx
import React from "react";

interface Option {
  key: string;
  label: string;
  color?: string;
}

interface ChartHeaderProps {
  timeRanges: { key: string; label: string }[];
  activeTimeRange: string;
  onTimeRangeChange: (v: string) => void;

  options: Option[];
  selectedOptions: string[];
  onToggleOption: (key: string) => void;
  onToggleAll?: () => void;
}

export const ChartHeader: React.FC<ChartHeaderProps> = ({
  timeRanges,
  activeTimeRange,
  onTimeRangeChange,

  options,
  selectedOptions,
  onToggleOption,
  onToggleAll,
}) => {
  const allChecked = selectedOptions.length === options.length;

  return (
    <div>
      {/* 时间维度 */}
      <div className="flex items-center space-x-2 mb-6">
        <span className="text-sm text-gray-600">时间维度：</span>
        <div className="flex bg-gray-100 rounded-lg p-1">
          {timeRanges.map((range) => (
            <button
              key={range.key}
              onClick={() => onTimeRangeChange(range.key)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                activeTimeRange === range.key
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* 指标 chips */}
      <div className="mb-6">
        <div className="flex items-center mb-3">
          <span className="text-sm text-gray-600 mr-3">显示指标：</span>

          {onToggleAll && (
            <button
              onClick={onToggleAll}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              {allChecked ? "取消全选" : "全选"}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {options.map((opt) => {
            const active = selectedOptions.includes(opt.key);
            return (
              <button
                key={opt.key}
                onClick={() => onToggleOption(opt.key)}
                className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  active
                    ? "text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
                style={{
                  backgroundColor: active ? opt.color : undefined,
                }}
              >
                {opt.color && (
                  <div
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: opt.color }}
                  />
                )}
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
