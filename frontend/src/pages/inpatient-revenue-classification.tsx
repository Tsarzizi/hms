
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

interface RevenueClassificationData {
  basicMedicalInsuranceRatio: number; // 住院收入基本医疗保险占比(%)
  serviceRevenueRatio: number; // 住院服务收入占比(%)
  medicalPaymentMethodRatio: number; // 住院收入医疗费用支付方式占比分析
  patientMedicationStructure: number; // 住院收入患者医药费用构成
  chargeItemAnalysis: number; // 住院收入按费用项目类别分析
}

interface ChartData {
  date: string;
  data: RevenueClassificationData;
}

const indicators = [
  { 
    key: 'basicInsuranceRatio', 
    name: '住院收入基本医疗保险占比', 
    color: '#3B82F6', 
    description: '基本医疗保险收入/同期住院收入',
    fullDescription: '住院收入基本医疗保险占比=基本医疗保险收入/同期住院收入',
    unit: '%'
  },
  { 
    key: 'serviceIncomeRatio', 
    name: '住院服务收入占比', 
    color: '#EF4444', 
    description: '(住院收入-各项费用)/住院收入×100%',
    fullDescription: '住院服务收入占比(%)=(住院收入-病理诊断费-实验室诊断费-影像学诊断费-临床诊断项目费-西药费-抗菌药物费用-中成药费-中草药费-检查费-一次性材料费-治疗费-一次性材料费-手术费-一次性材料费)/住院收入×100%',
    unit: '%'
  },
  { 
    key: 'paymentMethodRatio', 
    name: '住院收入医疗费用支付方式占比分析', 
    color: '#10B981', 
    description: '各种支付方式占比之和',
    fullDescription: '住院收入医疗费用支付方式构成=城镇居民基本医疗保险占比+城乡居民医疗保险占比+新型农村合作医疗占比+商业医疗保险占比+全公费占比+全自费占比+贫困救助占比+其他占比',
    unit: '%'
  },
  { 
    key: 'medicalCostComposition', 
    name: '住院收入患者医药费用构成', 
    color: '#F59E0B', 
    description: '各项医疗费用构成占比之和',
    fullDescription: '住院收入患者医药费用构成=床位收入占比+诊察收入占比+检查收入占比+化验收入占比+手术收入占比+护理收入占比+卫生材料收入占比+药品收入占比+药事服务费收入占比+其他住院收入占比',
    unit: '%'
  },
  { 
    key: 'costCategoryAnalysis', 
    name: '住院收入按费用项目类别分析', 
    color: '#8B5CF6', 
    description: '药品+诊疗项目+卫生材料收入占比',
    fullDescription: '住院收入按费用项目类别构成=药品收入占比+诊疗项目收入占比+卫生材料收入占比',
    unit: '%'
  }
];

const timeRanges = [
  { key: 'day', label: '天' },
  { key: 'month', label: '月' },
  { key: 'quarter', label: '季度' },
  { key: 'year', label: '年' }
];

export default function InpatientRevenueClassification() {
  const [timeRange, setTimeRange] = useState('month');
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>(
    indicators.map(ind => ind.key)
  );
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  // 模拟从后端获取数据
  const fetchData = async (range: string) => {
    setLoading(true);
    try {
      // 这里应该调用实际的后端API
      // const response = await fetch(`/api/inpatient-revenue-classification?range=${range}`);
      // const data = await response.json();
      
      // 暂时返回空数据，等待后端接入
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

  const toggleCardExpansion = (key: string) => {
    setExpandedCard(expandedCard === key ? null : key);
  };

  const getChartOptions = () => ({
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: `住院收入分类指标趋势图 (${timeRanges.find(r => r.key === timeRange)?.label})`
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
        data: chartData.map(item => (item.data as any)[indicator.key]),
        borderColor: indicator.color,
        backgroundColor: indicator.color + '20',
        tension: 0.1
      }));

    return { labels, datasets };
  };

  const formatCurrency = (value: number | string) => {
    if (typeof value === 'string') return value;
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(value);
  };

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-2">住院收入分类指标分析</h2>
        <p className="text-gray-600 text-sm">
          监控和分析住院收入的分类构成情况，包括基本医疗保险占比、服务收入占比等关键指标，支持同比环比分析
        </p>
      </div>

      {/* 指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {indicators.map((indicator) => (
          <div key={indicator.key} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-700 leading-tight">{indicator.name}</h3>
              <div 
                className="w-4 h-4 rounded-full flex-shrink-0" 
                style={{ backgroundColor: indicator.color }}
              ></div>
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-3">
              暂无数据
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-600 font-medium">计算公式：</p>
                <button
                  onClick={() => toggleCardExpansion(indicator.key)}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
                >
                  {expandedCard === indicator.key ? (
                    <>
                      <span>收起</span>
                      <i className="ri-arrow-up-s-line ml-1"></i>
                    </>
                  ) : (
                    <>
                      <span>详情</span>
                      <i className="ri-arrow-down-s-line ml-1"></i>
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                {expandedCard === indicator.key ? indicator.fullDescription : indicator.description}
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
                className={`inline-flex items-center px-3 py-2 rounded-full text-xs font-medium transition-colors ${
                  selectedIndicators.includes(indicator.key)
                    ? 'text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={{
                  backgroundColor: selectedIndicators.includes(indicator.key) ? indicator.color : undefined
                }}
                title={indicator.name}
              >
                <div 
                  className="w-2 h-2 rounded-full mr-2" 
                  style={{ backgroundColor: indicator.color }}
                ></div>
                <span className="truncate max-w-32">{indicator.name}</span>
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
            {indicators.map((indicator) => (
              <div key={`yoy-${indicator.key}`} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
                <div className="flex items-center min-w-0 flex-1">
                  <div 
                    className="w-3 h-3 rounded-full mr-3 flex-shrink-0" 
                    style={{ backgroundColor: indicator.color }}
                  ></div>
                  <span className="text-sm text-gray-700 truncate" title={indicator.name}>
                    {indicator.name}
                  </span>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <div className="text-sm text-gray-500">暂无数据</div>
                  <div className="text-xs text-gray-400">同比增减率</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">环比分析</h3>
          <p className="text-xs text-gray-500 mb-4">与上期相比的增减情况</p>
          <div className="space-y-4">
            {indicators.map((indicator) => (
              <div key={`mom-${indicator.key}`} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
                <div className="flex items-center min-w-0 flex-1">
                  <div 
                    className="w-3 h-3 rounded-full mr-3 flex-shrink-0" 
                    style={{ backgroundColor: indicator.color }}
                  ></div>
                  <span className="text-sm text-gray-700 truncate" title={indicator.name}>
                    {indicator.name}
                  </span>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <div className="text-sm text-gray-500">暂无数据</div>
                  <div className="text-xs text-gray-400">环比增减率</div>
                </div>
              </div>
            ))}
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
              <li>数据来源于医院财务系统，每日更新</li>
              <li>所有指标均以百分比形式显示，反映各项收入的构成比例</li>
              <li>支持按天、月、季度、年查看不同时间粒度的数据趋势</li>
              <li>同比环比分析帮助了解收入结构的变化趋势</li>
              <li>点击指标卡片中的"详情"按钮可查看完整计算公式</li>
              <li>点击指标标签可控制图表中对应数据线的显示/隐藏</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
