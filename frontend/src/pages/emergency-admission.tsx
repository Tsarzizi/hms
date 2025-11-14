import { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface EmergencyAdmissionData {
  emergencyAdmissionRate: number; // 门急诊入院率(%)
}

interface ChartData {
  date: string;
  data: EmergencyAdmissionData;
}

interface ComparisonData {
  currentValue: number;
  previousValue: number;
  changeRate: number;
  changeType: 'increase' | 'decrease' | 'stable';
}

const indicators = [
  { 
    key: 'emergencyAdmissionRate', 
    name: '门急诊入院率', 
    color: '#3B82F6', 
    description: '门急诊入院人数/(门诊人次数+急诊人次数)×100',
    unit: '%'
  }
];

const timeRanges = [
  { key: 'day', label: '天' },
  { key: 'month', label: '月' },
  { key: 'quarter', label: '季度' },
  { key: 'year', label: '年' }
];

export default function EmergencyAdmission() {
  const [timeRange, setTimeRange] = useState('month');
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>(
    indicators.map(ind => ind.key)
  );
  const [yoyComparison, setYoyComparison] = useState<{ [key: string]: ComparisonData }>({});
  const [momComparison, setMomComparison] = useState<{ [key: string]: ComparisonData }>({});

  // 从后端获取数据
  const fetchData = async (range: string) => {
    setLoading(true);
    try {
      // 这里应该调用实际的后端API
      // const response = await fetch(`/api/emergency-admission?range=${range}`);
      // const data = await response.json();
      
      // 暂时返回空数据，等待后端接入
      setChartData([]);
      setYoyComparison({});
      setMomComparison({});
    } catch (error) {
      console.error('获取数据失败:', error);
      setChartData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(timeRange);
  }, [timeRange]);

  const toggleIndicator = (key: string) => {
    setSelectedIndicators(prev => 
      prev.includes(key) 
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  const getChartOptions = () => ({
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: `门急诊入院指标趋势图 (${timeRanges.find(r => r.key === timeRange)?.label})`
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: '时间'
        }
      },
      y: {
        title: {
          display: true,
          text: '百分比(%)'
        },
        min: 0
      }
    }
  });

  const getChartData = () => {
    const labels = chartData.map(item => item.date);
    const datasets = indicators
      .filter(indicator => selectedIndicators.includes(indicator.key))
      .map(indicator => ({
        label: indicator.name,
        data: chartData.map(item => item.data[indicator.key as keyof EmergencyAdmissionData]),
        borderColor: indicator.color,
        backgroundColor: indicator.color + '20',
        tension: 0.1
      }));

    return { labels, datasets };
  };

  const getChangeIcon = (changeType: string) => {
    switch (changeType) {
      case 'increase':
        return <i className="ri-arrow-up-line text-red-500"></i>;
      case 'decrease':
        return <i className="ri-arrow-down-line text-green-500"></i>;
      default:
        return <i className="ri-subtract-line text-gray-500"></i>;
    }
  };

  const getChangeColor = (changeType: string) => {
    switch (changeType) {
      case 'increase':
        return 'text-red-600';
      case 'decrease':
        return 'text-green-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-2">门急诊入院指标分析</h2>
        <p className="text-gray-600 text-sm">
          监控和分析门急诊入院的关键指标，包括门急诊入院率等数据，支持同比环比分析
        </p>
      </div>

      {/* 指标卡片 */}
      <div className="grid grid-cols-1 gap-6">
        {indicators.map((indicator) => (
          <div key={indicator.key} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-700">{indicator.name}</h3>
              <div 
                className="w-4 h-4 rounded-full" 
                style={{ backgroundColor: indicator.color }}
              ></div>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-3">
              暂无数据
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600 font-medium mb-2">计算公式：</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                {indicator.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* 图表控制区域 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 lg:mb-0">趋势分析图表</h3>
          
          {/* 时间维度选择 */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">时间维度：</span>
            <div className="flex bg-gray-100 rounded-lg p-1">
              {timeRanges.map((range) => (
                <button
                  key={range.key}
                  onClick={() => setTimeRange(range.key)}
                  className={`px-3 py-1 text-sm rounded-md transition-colors whitespace-nowrap ${
                    timeRange === range.key
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 指标选择器 */}
        <div className="mb-6">
          <div className="flex items-center mb-3">
            <span className="text-sm text-gray-600 mr-3">显示指标：</span>
            <button
              onClick={() => setSelectedIndicators(
                selectedIndicators.length === indicators.length ? [] : indicators.map(ind => ind.key)
              )}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              {selectedIndicators.length === indicators.length ? '取消全选' : '全选'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {indicators.map((indicator) => (
              <button
                key={indicator.key}
                onClick={() => toggleIndicator(indicator.key)}
                className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selectedIndicators.includes(indicator.key)
                    ? 'text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={{
                  backgroundColor: selectedIndicators.includes(indicator.key) ? indicator.color : undefined
                }}
              >
                <div 
                  className="w-3 h-3 rounded-full mr-2" 
                  style={{ backgroundColor: indicator.color }}
                ></div>
                {indicator.name}
              </button>
            ))}
          </div>
        </div>

        {/* 图表区域 */}
        <div className="h-96">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <i className="ri-loader-4-line text-4xl text-gray-400 animate-spin mb-2"></i>
                <p className="text-gray-500">加载数据中...</p>
              </div>
            </div>
          ) : chartData.length > 0 ? (
            <Line data={getChartData()} options={getChartOptions()} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <i className="ri-bar-chart-line text-6xl text-gray-300 mb-4"></i>
                <p className="text-gray-500 mb-2">暂无图表数据</p>
                <p className="text-sm text-gray-400">
                  请确保后端数据源已正确配置并连接
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 同比环比分析 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">同比分析</h3>
          <p className="text-xs text-gray-500 mb-4">与去年同期相比的增减情况</p>
          <div className="space-y-4">
            {indicators.map((indicator) => {
              const comparison = yoyComparison[indicator.key];
              return (
                <div key={`yoy-${indicator.key}`} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
                  <div className="flex items-center">
                    <div 
                      className="w-3 h-3 rounded-full mr-3" 
                      style={{ backgroundColor: indicator.color }}
                    ></div>
                    <span className="text-sm text-gray-700">{indicator.name}</span>
                  </div>
                  <div className="text-right">
                    {comparison ? (
                      <>
                        <div className={`text-sm font-medium flex items-center ${getChangeColor(comparison.changeType)}`}>
                          {getChangeIcon(comparison.changeType)}
                          <span className="ml-1">{Math.abs(comparison.changeRate).toFixed(2)}%</span>
                        </div>
                        <div className="text-xs text-gray-400">同比增减率</div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm text-gray-500">暂无数据</div>
                        <div className="text-xs text-gray-400">同比增减率</div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">环比分析</h3>
          <p className="text-xs text-gray-500 mb-4">与上期相比的增减情况</p>
          <div className="space-y-4">
            {indicators.map((indicator) => {
              const comparison = momComparison[indicator.key];
              return (
                <div key={`mom-${indicator.key}`} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
                  <div className="flex items-center">
                    <div 
                      className="w-3 h-3 rounded-full mr-3" 
                      style={{ backgroundColor: indicator.color }}
                    ></div>
                    <span className="text-sm text-gray-700">{indicator.name}</span>
                  </div>
                  <div className="text-right">
                    {comparison ? (
                      <>
                        <div className={`text-sm font-medium flex items-center ${getChangeColor(comparison.changeType)}`}>
                          {getChangeIcon(comparison.changeType)}
                          <span className="ml-1">{Math.abs(comparison.changeRate).toFixed(2)}%</span>
                        </div>
                        <div className="text-xs text-gray-400">环比增减率</div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm text-gray-500">暂无数据</div>
                        <div className="text-xs text-gray-400">环比增减率</div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 数据说明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <i className="ri-information-line text-blue-600 mr-2 mt-0.5"></i>
          <div className="text-blue-800 text-sm">
            <p className="font-medium mb-1">数据说明：</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>数据来源于医院信息系统，每日更新</li>
              <li>门急诊入院率反映门急诊患者的住院转化情况</li>
              <li>该指标有助于评估门急诊服务的医疗质量和患者病情严重程度</li>
              <li>支持按天、月、季度、年查看不同时间粒度的数据趋势</li>
              <li>同比环比分析帮助了解门急诊入院服务的发展趋势和季节性变化</li>
              <li>点击指标标签可控制图表中对应数据线的显示/隐藏</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}