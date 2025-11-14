
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

interface AdmissionDischargeData {
  admissionCount: number; // 入院人次
  dischargeCount: number; // 出院人次
  inpatientRatio: number; // 住院人头人次比
}

interface ChartData {
  date: string;
  data: AdmissionDischargeData;
}

// 严格按照表格定义的3个指标
const indicators = [
  { 
    key: 'admissionCount', 
    name: '入院人次', 
    color: '#3B82F6', 
    description: '某期居民到某医院办理入院的人次总数',
    unit: '人次'
  },
  { 
    key: 'dischargeCount', 
    name: '出院人次', 
    color: '#10B981', 
    description: '某期居民到某医院办理出院的人次总数',
    unit: '人次'
  },
  { 
    key: 'inpatientRatio', 
    name: '住院人头人次比', 
    color: '#8B5CF6', 
    description: '某期居民住院人数/某期居民住院人次数×100%',
    unit: '%'
  }
];

const timeRanges = [
  { key: 'day', label: '天' },
  { key: 'month', label: '月' },
  { key: 'quarter', label: '季度' },
  { key: 'year', label: '年' }
];

export default function AdmissionDischarge() {
  const [timeRange, setTimeRange] = useState('month');
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>(
    ['admissionCount', 'dischargeCount', 'inpatientRatio']
  );

  // 获取数据
  const fetchData = async (range: string) => {
    setLoading(true);
    try {
      // 这里应该调用实际的后端API
      // const response = await fetch(`/api/admission-discharge?range=${range}`);
      // const data = await response.json();
      // setChartData(data);
      
      // 暂时返回空数据，等待连接PostgreSQL数据库
      setChartData([]);
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
        text: `出入院人次指标趋势图 (${timeRanges.find(r => r.key === timeRange)?.label})`
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
          text: '数值'
        }
      }
    }
  });

  const getChartData = () => {
    const labels = chartData.map(item => item.date);
    const datasets = indicators
      .filter(indicator => selectedIndicators.includes(indicator.key))
      .map(indicator => ({
        label: indicator.name,
        data: chartData.map(item => item.data[indicator.key as keyof AdmissionDischargeData]),
        borderColor: indicator.color,
        backgroundColor: indicator.color + '20',
        tension: 0.1
      }));

    return { labels, datasets };
  };

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-2">出入院人次统计分析</h2>
        <p className="text-gray-600 text-sm">
          监控和分析住院服务的出入院人次指标，包括入院人次、出院人次、住院人头人次比等核心数据
        </p>
      </div>

      {/* 指标卡片 - 严格按照表格的3个指标 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {indicators.map((indicator) => (
          <div key={indicator.key} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-700">{indicator.name}</h3>
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: indicator.color }}
              ></div>
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">
              暂无数据
            </div>
            <div className="text-xs text-gray-400 mb-2">
              等待数据库连接
            </div>
            <p className="text-xs text-gray-500 leading-tight">
              {indicator.description}
            </p>
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
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  selectedIndicators.includes(indicator.key)
                    ? 'text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={{
                  backgroundColor: selectedIndicators.includes(indicator.key) ? indicator.color : undefined
                }}
              >
                <div 
                  className="w-2 h-2 rounded-full mr-2" 
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
                  请连接PostgreSQL数据库后查看数据
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 数据详情表格 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">详细数据</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">入院人次</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">出院人次</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">住院人头人次比(%)</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                  <i className="ri-database-line text-4xl mb-2"></i>
                  <p>暂无详细数据</p>
                  <p className="text-sm text-gray-400 mt-1">请连接PostgreSQL数据库后查看详细统计</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 数据说明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <i className="ri-information-line text-blue-600 mr-2 mt-0.5"></i>
          <div className="text-blue-800 text-sm">
            <p className="font-medium mb-1">指标说明：</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li><strong>入院人次：</strong>某期居民到某医院办理入院的人次总数</li>
              <li><strong>出院人次：</strong>某期居民到某医院办理出院的人次总数</li>
              <li><strong>住院人头人次比：</strong>某期居民住院人数/某期居民住院人次数×100%</li>
              <li>数据来源于PostgreSQL数据库，连接后实时更新</li>
              <li>可通过时间维度切换查看不同时间粒度的数据趋势</li>
              <li>环比数据显示与上期相比的增减情况</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
