// src/features/inpatientRevenueRanking/InfoNote.tsx
export function InfoNote() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-start">
        <i className="ri-information-line text-blue-600 mr-2 mt-0.5" />
        <div className="text-blue-800 text-sm">
          <p className="font-medium mb-1">数据说明：</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>数据来源于医院信息系统，每日更新</li>
            <li>某科室住院收入占总住院收入比反映各科室的收入贡献度</li>
            <li>病种住院费用体现不同病种的平均治疗成本</li>
            <li>支持按天、月、季度、年查看不同时间粒度的数据趋势</li>
            <li>同比环比分析帮助了解收入顺位的发展趋势和季节性变化</li>
            <li>点击指标标签可控制图表中对应数据线的显示/隐藏</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
