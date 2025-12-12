// src/features/inpatientRevenueRanking/AnalysisList.tsx
import { INDICATORS } from './config';

interface Props {
  title: string;
  subtitle: string;
  valueLabel?: string; // 以后可传入实际值，如 "5.2%"
}

export function AnalysisList({ title, subtitle }: Props) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
      <p className="text-xs text-gray-500 mb-4">{subtitle}</p>
      <div className="space-y-4">
        {INDICATORS.map(indicator => (
          <div
            key={indicator.key}
            className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0"
          >
            <div className="flex items-center">
              <div
                className="w-3 h-3 rounded-full mr-3"
                style={{ backgroundColor: indicator.color }}
              />
              <span className="text-sm text-gray-700">
                {indicator.name}
              </span>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">暂无数据</div>
              <div className="text-xs text-gray-400">增减率</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
