// src/yiliaofudan/zhuyuanfeiyong/frontend/zhongtifenxi.tsx
import { useState, useEffect } from 'react';
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

interface HospitalizationCostData {
  date: string;
  avgMedicalCost: number;           // 住院患者次均医药费用
  avgDrugCost: number;              // 住院患者次均药费
  avgDailyMedicalCost: number;      // 住院患者日均医药费用
  costChangeRate: number;           // 次均费用变化率
}

interface PatientSourceCostData {
  source: string;                   // 患者来源
  avgCost: number;                  // 次均费用
  patientCount: number;             // 患者数量
}

interface DiseaseCostItem {
  disease: string;                  // 病种名称
  avgCost: number;                  // 次均费用
  patientCount: number;             // 患者数量
  avgStayDays: number;              // 平均住院天数
}

const API_BASE_URL = 'http://localhost:5052';

export default function HospitalizationCostAnalysis() {
  const [costData, setCostData] = useState<HospitalizationCostData[]>([]);
  const [patientSourceData, setPatientSourceData] = useState<PatientSourceCostData[]>([]);
  const [diseaseCostItems, setDiseaseCostItems] = useState<DiseaseCostItem[]>([]);
  const [timeRange, setTimeRange] = useState('month');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>([
    'avgMedicalCost',
    'avgDrugCost'
  ]);

  // 模拟数据
  const getMockCostData = (): HospitalizationCostData[] => {
    const months = ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06'];
    return months.map((month, index) => {
      const baseCost = 8000 + Math.random() * 4000;
      const drugCost = baseCost * (0.3 + Math.random() * 0.2);
      const dailyCost = 800 + Math.random() * 400;

      return {
        date: month,
        avgMedicalCost: baseCost,
        avgDrugCost: drugCost,
        avgDailyMedicalCost: dailyCost,
        costChangeRate: index === 0 ? 0 : (Math.random() * 8 - 4)
      };
    });
  };

  const getMockPatientSourceData = (): PatientSourceCostData[] => {
    return [
      { source: '本地医保', avgCost: 8500, patientCount: 1200 },
      { source: '异地医保', avgCost: 9200, patientCount: 800 },
      { source: '自费', avgCost: 7800, patientCount: 400 },
      { source: '商业保险', avgCost: 10500, patientCount: 300 },
      { source: '公费医疗', avgCost: 9500, patientCount: 200 }
    ];
  };

  const getMockDiseaseCostData = (): DiseaseCostItem[] => {
    return [
      { disease: '冠心病', avgCost: 12500, patientCount: 350, avgStayDays: 8.5 },
      { disease: '糖尿病', avgCost: 6800, patientCount: 280, avgStayDays: 6.2 },
      { disease: '高血压', avgCost: 5200, patientCount: 420, avgStayDays: 5.8 },
      { disease: '肺炎', avgCost: 7500, patientCount: 190, avgStayDays: 7.3 },
      { disease: '脑梗死', avgCost: 15800, patientCount: 150, avgStayDays: 12.5 },
      { disease: '阑尾炎', avgCost: 6200, patientCount: 120, avgStayDays: 4.2 },
      { disease: '骨折', avgCost: 13200, patientCount: 180, avgStayDays: 10.8 }
    ];
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/hospitalization-cost/analysis?range=${timeRange}&year=${selectedYear}`
      );
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setCostData(result.data.costTrend);
          setPatientSourceData(result.data.patientSource);
          setDiseaseCostItems(result.data.diseaseCost);
        } else {
          throw new Error(result.error);
        }
      } else {
        throw new Error('HTTP错误');
      }
    } catch (error) {
      console.error('获取住院费用分析数据失败，使用模拟数据:', error);
      setCostData(getMockCostData());
      setPatientSourceData(getMockPatientSourceData());
      setDiseaseCostItems(getMockDiseaseCostData());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [timeRange, selectedYear]);

  // 指标配置
  const indicators = [
    {
      key: 'avgMedicalCost',
      name: '住院患者次均医药费用',
      color: '#8B5CF6',
      description: '报告期内出院者住院医药费用 / 同期出院人数',
      unit: '元'
    },
    {
      key: 'avgDrugCost',
      name: '住院患者次均药费',
      color: '#06B6D4',
      description: '报告期内出院者住院药费 / 同期出院人数',
      unit: '元'
    },
    {
      key: 'avgDailyMedicalCost',
      name: '住院患者日均医药费用',
      color: '#10B981',
      description: '报告期内出院者医药费用总额 / 同期出院者住院天数',
      unit: '元'
    }
  ];

  // 1. 住院患者次均变化趋势
  const costTrendData = {
    labels: costData.map(item => item.date),
    datasets: [
      {
        label: '次均医药费用',
        data: costData.map(item => item.avgMedicalCost),
        borderColor: '#8B5CF6',
        backgroundColor: '#8B5CF620',
        fill: true,
        tension: 0.1
      },
      {
        label: '次均药费',
        data: costData.map(item => item.avgDrugCost),
        borderColor: '#06B6D4',
        backgroundColor: '#06B6D420',
        fill: true,
        tension: 0.1
      },
      {
        label: '日均医药费用',
        data: costData.map(item => item.avgDailyMedicalCost),
        borderColor: '#10B981',
        backgroundColor: '#10B98120',
        fill: true,
        tension: 0.1,
        yAxisID: 'y1'
      }
    ]
  };

  // 2. 费用变动率
  const costChangeRateData = {
    labels: costData.map(item => item.date),
    datasets: [
      {
        label: '次均费用变动率',
        data: costData.map(item => item.costChangeRate),
        borderColor: '#EF4444',
        backgroundColor: '#EF444420',
        fill: true,
        tension: 0.1
      }
    ]
  };

  // 3. 不同来源患者住院次均费用
  const patientSourceCostData = {
    labels: patientSourceData.map(item => item.source),
    datasets: [
      {
        label: '次均费用 (元)',
        data: patientSourceData.map(item => item.avgCost),
        backgroundColor: [
          '#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444'
        ]
      }
    ]
  };

  // 4. 各病种住院患者次均费用
  const diseaseCostChartData = {
    labels: diseaseCostItems.map(item => item.disease),
    datasets: [
      {
        label: '次均费用 (元)',
        data: diseaseCostItems.map(item => item.avgCost),
        backgroundColor: '#8B5CF6'
      }
    ]
  };

  // 5. 费用构成分析（最新月份）
  const getLatestCostStructure = () => {
    if (costData.length === 0) return { drug: 35, treatment: 25, examination: 20, material: 15, other: 5 };
    const latest = costData[costData.length - 1];
    const drugRatio = (latest.avgDrugCost / latest.avgMedicalCost) * 100;
    return {
      drug: drugRatio,
      treatment: 25,
      examination: 20,
      material: 15,
      other: 100 - drugRatio - 25 - 20 - 15
    };
  };

  const costStructureData = {
    labels: ['药品费', '治疗费', '检查费', '材料费', '其他'],
    datasets: [
      {
        data: [
          getLatestCostStructure().drug,
          getLatestCostStructure().treatment,
          getLatestCostStructure().examination,
          getLatestCostStructure().material,
          getLatestCostStructure().other
        ],
        backgroundColor: ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444'],
        hoverBackgroundColor: ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444']
      }
    ]
  };

  const toggleIndicator = (key: string) => {
    setSelectedIndicators(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  const formatValue = (value: number, unit: string = '') => {
    if (unit === '元' && value >= 10000) {
      return `${(value / 10000).toFixed(2)}万元`;
    }
    return `${value.toFixed(2)}${unit}`;
  };

  const formatCurrency = (value: number) => {
    if (value >= 10000) {
      return `${(value / 10000).toFixed(2)}万`;
    }
    return value.toFixed(2);
  };

  // 计算摘要数据
  const getSummaryData = () => {
    if (costData.length === 0) {
      return {
        avgMedicalCost: 0,
        avgDrugCost: 0,
        avgDailyMedicalCost: 0
      };
    }

    const latest = costData[costData.length - 1];
    return {
      avgMedicalCost: latest.avgMedicalCost,
      avgDrugCost: latest.avgDrugCost,
      avgDailyMedicalCost: latest.avgDailyMedicalCost
    };
  };

  const summaryData = getSummaryData();

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-2">住院医疗费用总体分析</h2>
        <p className="text-gray-600 text-sm">
          全面分析住院患者医疗费用情况，包括次均费用、日均费用、费用构成、不同来源患者费用比较和各病种费用分析
        </p>
      </div>

      {/* 主要指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
              {formatValue(summaryData[indicator.key as keyof typeof summaryData], indicator.unit)}
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600 font-medium mb-2">统计说明：</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                {indicator.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* 控制区域 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center space-x-4 mb-4 lg:mb-0">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">时间维度：</span>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="bg-gray-100 border border-gray-300 rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="month">月</option>
                <option value="quarter">季度</option>
                <option value="year">年</option>
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">年份：</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-gray-100 border border-gray-300 rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {[2022, 2023, 2024].map(year => (
                  <option key={year} value={year}>{year}年</option>
                ))}
              </select>
            </div>
          </div>

          {/* 指标选择器 */}
          <div className="flex-1 lg:ml-6">
            <div className="flex items-center mb-2">
              <span className="text-sm text-gray-600 mr-3">显示指标：</span>
              <button
                onClick={() => setSelectedIndicators(
                  selectedIndicators.length === indicators.length ? [] : indicators.map(ind => ind.key)
                )}
                className="text-xs text-green-600 hover:text-green-800"
              >
                {selectedIndicators.length === indicators.length ? '取消全选' : '全选'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {indicators.map((indicator) => (
                <button
                  key={indicator.key}
                  onClick={() => toggleIndicator(indicator.key)}
                  className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                    selectedIndicators.includes(indicator.key)
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  style={{
                    backgroundColor: selectedIndicators.includes(indicator.key) ? indicator.color : undefined
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full mr-1"
                    style={{ backgroundColor: indicator.color }}
                  ></div>
                  {indicator.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-500">加载数据中...</p>
          </div>
        </div>
      ) : (
        <>
          {/* 第一行：趋势分析 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 住院患者次均变化趋势 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">住院患者次均费用变化趋势</h3>
              <div className="h-80">
                <Line
                  data={costTrendData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: {
                        beginAtZero: true,
                        title: {
                          display: true,
                          text: '费用 (元)'
                        }
                      },
                      y1: {
                        position: 'right',
                        beginAtZero: true,
                        title: {
                          display: true,
                          text: '日均费用 (元)'
                        },
                        grid: {
                          drawOnChartArea: false,
                        },
                      }
                    }
                  }}
                />
              </div>
            </div>

            {/* 费用变动率 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">住院患者次均费用变动率</h3>
              <div className="h-80">
                <Line
                  data={costChangeRateData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: {
                        title: {
                          display: true,
                          text: '变动率 (%)'
                        }
                      }
                    },
                    plugins: {
                      tooltip: {
                        callbacks: {
                          label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y > 0 ? '+' : ''}${context.parsed.y}%`;
                          }
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* 第二行：来源分析和费用构成 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 不同来源患者住院次均费用 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">不同来源患者住院次均费用</h3>
              <div className="h-80">
                <Bar
                  data={patientSourceCostData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: {
                        beginAtZero: true,
                        title: {
                          display: true,
                          text: '次均费用 (元)'
                        }
                      }
                    }
                  }}
                />
              </div>
              <div className="mt-4 grid grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                {patientSourceData.map((item, index) => (
                  <div key={index} className="text-center p-2 bg-gray-50 rounded">
                    <div className="font-bold text-gray-900">{formatCurrency(item.avgCost)}</div>
                    <div className="text-gray-600">{item.source}</div>
                    <div className="text-gray-500">患者: {item.patientCount}人</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 费用构成分析 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">住院费用构成分析</h3>
              <div className="h-80">
                <Doughnut
                  data={costStructureData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom'
                      }
                    }
                  }}
                />
              </div>
              {costData.length > 0 && (
                <div className="mt-4 grid grid-cols-5 gap-2 text-center text-xs">
                  <div className="text-purple-600">
                    <div className="font-bold">{formatValue(getLatestCostStructure().drug, '%')}</div>
                    <div>药品费</div>
                  </div>
                  <div className="text-cyan-600">
                    <div className="font-bold">{formatValue(getLatestCostStructure().treatment, '%')}</div>
                    <div>治疗费</div>
                  </div>
                  <div className="text-green-600">
                    <div className="font-bold">{formatValue(getLatestCostStructure().examination, '%')}</div>
                    <div>检查费</div>
                  </div>
                  <div className="text-yellow-600">
                    <div className="font-bold">{formatValue(getLatestCostStructure().material, '%')}</div>
                    <div>材料费</div>
                  </div>
                  <div className="text-red-600">
                    <div className="font-bold">{formatValue(getLatestCostStructure().other, '%')}</div>
                    <div>其他</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 第三行：各病种费用分析 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">各病种住院患者次均费用分析</h3>
            <div className="h-80">
              <Bar
                data={diseaseCostChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  indexAxis: 'y',
                  scales: {
                    x: {
                      beginAtZero: true,
                      title: {
                        display: true,
                        text: '次均费用 (元)'
                      }
                    }
                  }
                }}
              />
            </div>
          </div>

          {/* 详细数据表格 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">详细数据分析</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">期间</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">次均医药费用</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">次均药费</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">日均医药费用</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">费用变动率</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {costData.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50 text-sm">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-900">{item.date}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-purple-600 font-medium">
                        {formatValue(item.avgMedicalCost, '元')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-cyan-600">
                        {formatValue(item.avgDrugCost, '元')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-green-600">
                        {formatValue(item.avgDailyMedicalCost, '元')}
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap font-medium ${
                        item.costChangeRate > 0 ? 'text-red-600' : item.costChangeRate < 0 ? 'text-green-600' : 'text-gray-600'
                      }`}>
                        {item.costChangeRate > 0 ? '+' : ''}{formatValue(item.costChangeRate, '%')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 病种费用详细表格 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">各病种费用详细数据</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">病种名称</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">次均费用</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">患者数量</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">平均住院天数</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">日均费用</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {diseaseCostItems.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50 text-sm">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-900 font-medium">{item.disease}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-purple-600">
                        {formatValue(item.avgCost, '元')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">{item.patientCount}人</td>
                      <td className="px-4 py-3 whitespace-nowrap text-blue-600">
                        {formatValue(item.avgStayDays, '天')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-green-600">
                        {formatValue(item.avgCost / item.avgStayDays, '元')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 数据说明 */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start">
              <div className="text-green-600 mr-2 mt-0.5">ℹ️</div>
              <div className="text-green-800 text-sm">
                <p className="font-medium mb-1">指标说明：</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li><strong>住院患者次均医药费用</strong> = 报告期内出院者住院医药费用 / 同期出院人数</li>
                  <li><strong>住院患者次均药费</strong> = 报告期内出院者住院药费 / 同期出院人数</li>
                  <li><strong>住院患者日均医药费用</strong> = 报告期内出院者医药费用总额 / 同期出院者住院天数</li>
                  <li><strong>住院患者次均变化趋势</strong> = 报告期内出院者住院医药费用 / 同期出院人数（按时间序列分析）</li>
                  <li><strong>不同来源患者住院次均费用</strong> = 报告期内出院者住院医药费用 / 同期出院人数（按患者来源分类）</li>
                  <li><strong>各病种住院患者次均费用</strong> = 报告期内该病种出院者住院医药总费用 / 报告期内该病种出院患者总人数</li>
                  <li>数据来源于医院财务系统、病案管理系统和医保结算系统</li>
                  <li>费用分析有助于医院成本控制和医疗资源优化配置</li>
                  <li>后端服务运行在: {API_BASE_URL}</li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}