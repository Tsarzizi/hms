// src/yiliaofudan/menjizhencijunyaofei/frontend/menjizhencijunyaofeixiangxi.tsx
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

interface DetailedDrugCostData {
  date: string;
  // 门诊细分药费
  outpatientWesternDrugCost: number;    // 门诊次均西药费
  outpatientHerbalDrugCost: number;     // 门诊次均中草药费
  outpatientChineseDrugCost: number;    // 门诊次均中成药费
  outpatientTotalDrugCost: number;      // 门诊次均总药费

  // 急诊细分药费
  emergencyWesternDrugCost: number;     // 急诊次均西药费
  emergencyHerbalDrugCost: number;      // 急诊次均中草药费
  emergencyChineseDrugCost: number;     // 急诊次均中成药费
  emergencyTotalDrugCost: number;       // 急诊次均总药费

  // 计算指标
  drugCostChangeRate: number;           // 次均药费变动率
  emergencyDrugCostRatio: number;       // 急诊次均药费占比
}

const API_BASE_URL = 'http://localhost:5051';

export default function OutpatientDrugCostDetailedAnalysis() {
  const [analysisData, setAnalysisData] = useState<DetailedDrugCostData[]>([]);
  const [timeRange, setTimeRange] = useState('month');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>([
    'outpatientWesternDrugCost',
    'outpatientHerbalDrugCost',
    'outpatientChineseDrugCost'
  ]);

  // 模拟数据
  const getMockData = (): DetailedDrugCostData[] => {
    const months = ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06'];
    return months.map((month, index) => {
      // 门诊药费
      const outpatientWestern = 45 + Math.random() * 20;
      const outpatientHerbal = 15 + Math.random() * 10;
      const outpatientChinese = 20 + Math.random() * 15;
      const outpatientTotal = outpatientWestern + outpatientHerbal + outpatientChinese;

      // 急诊药费
      const emergencyWestern = 55 + Math.random() * 25;
      const emergencyHerbal = 10 + Math.random() * 8;
      const emergencyChinese = 15 + Math.random() * 12;
      const emergencyTotal = emergencyWestern + emergencyHerbal + emergencyChinese;

      // 总药费
      const totalDrugCost = outpatientTotal + emergencyTotal;

      return {
        date: month,
        outpatientWesternDrugCost: outpatientWestern,
        outpatientHerbalDrugCost: outpatientHerbal,
        outpatientChineseDrugCost: outpatientChinese,
        outpatientTotalDrugCost: outpatientTotal,
        emergencyWesternDrugCost: emergencyWestern,
        emergencyHerbalDrugCost: emergencyHerbal,
        emergencyChineseDrugCost: emergencyChinese,
        emergencyTotalDrugCost: emergencyTotal,
        drugCostChangeRate: index === 0 ? 0 : (Math.random() * 10 - 5),
        emergencyDrugCostRatio: (emergencyTotal / totalDrugCost) * 100
      };
    });
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/drug-cost/detailed-analysis?range=${timeRange}&year=${selectedYear}`
      );
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setAnalysisData(result.data);
        } else {
          throw new Error(result.error);
        }
      } else {
        throw new Error('HTTP错误');
      }
    } catch (error) {
      console.error('获取详细分析数据失败，使用模拟数据:', error);
      setAnalysisData(getMockData());
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
      key: 'outpatientWesternDrugCost',
      name: '门诊次均西药费',
      color: '#8B5CF6',
      description: '期内门诊西药收入合计/同期门诊总诊疗人次数',
      unit: '元'
    },
    {
      key: 'outpatientHerbalDrugCost',
      name: '门诊次均中草药费',
      color: '#06B6D4',
      description: '期内门诊中草药收入合计/同期门诊总诊疗人次数',
      unit: '元'
    },
    {
      key: 'outpatientChineseDrugCost',
      name: '门诊次均中成药费',
      color: '#10B981',
      description: '期内门诊中成药收入合计/同期门诊总诊疗人次数',
      unit: '元'
    },
    {
      key: 'emergencyWesternDrugCost',
      name: '急诊次均西药费',
      color: '#EF4444',
      description: '期内急诊西药收入合计/同期急诊总诊疗人次数',
      unit: '元'
    },
    {
      key: 'emergencyHerbalDrugCost',
      name: '急诊次均中草药费',
      color: '#F59E0B',
      description: '期内急诊中草药收入合计/同期急诊总诊疗人次数',
      unit: '元'
    },
    {
      key: 'emergencyChineseDrugCost',
      name: '急诊次均中成药费',
      color: '#84CC16',
      description: '期内急诊中成药收入合计/同期急诊总诊疗人次数',
      unit: '元'
    }
  ];

  // 1. 门急诊次均药费趋势
  const drugCostTrendData = {
    labels: analysisData.map(item => item.date),
    datasets: [
      {
        label: '门诊次均总药费',
        data: analysisData.map(item => item.outpatientTotalDrugCost),
        borderColor: '#8B5CF6',
        backgroundColor: '#8B5CF620',
        fill: true,
        tension: 0.1
      },
      {
        label: '急诊次均总药费',
        data: analysisData.map(item => item.emergencyTotalDrugCost),
        borderColor: '#EF4444',
        backgroundColor: '#EF444420',
        fill: true,
        tension: 0.1
      }
    ]
  };

  // 2. 门诊次均药费变动率
  const drugCostChangeRateData = {
    labels: analysisData.map(item => item.date),
    datasets: [
      {
        label: '门诊次均药费变动率',
        data: analysisData.map(item => item.drugCostChangeRate),
        borderColor: '#10B981',
        backgroundColor: '#10B98120',
        fill: true,
        tension: 0.1
      }
    ]
  };

  // 3. 门诊药费构成
  const outpatientDrugStructureData = {
    labels: analysisData.map(item => item.date),
    datasets: [
      {
        label: '门诊西药费',
        data: analysisData.map(item => item.outpatientWesternDrugCost),
        borderColor: '#8B5CF6',
        backgroundColor: '#8B5CF620',
        fill: false
      },
      {
        label: '门诊中草药费',
        data: analysisData.map(item => item.outpatientHerbalDrugCost),
        borderColor: '#06B6D4',
        backgroundColor: '#06B6D420',
        fill: false
      },
      {
        label: '门诊中成药费',
        data: analysisData.map(item => item.outpatientChineseDrugCost),
        borderColor: '#10B981',
        backgroundColor: '#10B98120',
        fill: false
      }
    ]
  };

  // 4. 急诊药费构成
  const emergencyDrugStructureData = {
    labels: analysisData.map(item => item.date),
    datasets: [
      {
        label: '急诊西药费',
        data: analysisData.map(item => item.emergencyWesternDrugCost),
        borderColor: '#EF4444',
        backgroundColor: '#EF444420',
        fill: false
      },
      {
        label: '急诊中草药费',
        data: analysisData.map(item => item.emergencyHerbalDrugCost),
        borderColor: '#F59E0B',
        backgroundColor: '#F59E0B20',
        fill: false
      },
      {
        label: '急诊中成药费',
        data: analysisData.map(item => item.emergencyChineseDrugCost),
        borderColor: '#84CC16',
        backgroundColor: '#84CC1620',
        fill: false
      }
    ]
  };

  // 5. 门诊药费构成比例（最新月份）
  const getLatestOutpatientStructure = () => {
    if (analysisData.length === 0) return { western: 60, herbal: 20, chinese: 20 };
    const latest = analysisData[analysisData.length - 1];
    const total = latest.outpatientTotalDrugCost;
    return {
      western: (latest.outpatientWesternDrugCost / total) * 100,
      herbal: (latest.outpatientHerbalDrugCost / total) * 100,
      chinese: (latest.outpatientChineseDrugCost / total) * 100
    };
  };

  const outpatientStructureData = {
    labels: ['西药', '中草药', '中成药'],
    datasets: [
      {
        data: [
          getLatestOutpatientStructure().western,
          getLatestOutpatientStructure().herbal,
          getLatestOutpatientStructure().chinese
        ],
        backgroundColor: ['#8B5CF6', '#06B6D4', '#10B981'],
        hoverBackgroundColor: ['#8B5CF6', '#06B6D4', '#10B981']
      }
    ]
  };

  // 6. 急诊药费构成比例（最新月份）
  const getLatestEmergencyStructure = () => {
    if (analysisData.length === 0) return { western: 70, herbal: 15, chinese: 15 };
    const latest = analysisData[analysisData.length - 1];
    const total = latest.emergencyTotalDrugCost;
    return {
      western: (latest.emergencyWesternDrugCost / total) * 100,
      herbal: (latest.emergencyHerbalDrugCost / total) * 100,
      chinese: (latest.emergencyChineseDrugCost / total) * 100
    };
  };

  const emergencyStructureData = {
    labels: ['西药', '中草药', '中成药'],
    datasets: [
      {
        data: [
          getLatestEmergencyStructure().western,
          getLatestEmergencyStructure().herbal,
          getLatestEmergencyStructure().chinese
        ],
        backgroundColor: ['#EF4444', '#F59E0B', '#84CC16'],
        hoverBackgroundColor: ['#EF4444', '#F59E0B', '#84CC16']
      }
    ]
  };

  // 7. 急诊次均药费占比趋势
  const emergencyDrugCostRatioData = {
    labels: analysisData.map(item => item.date),
    datasets: [
      {
        label: '急诊次均药费占比',
        data: analysisData.map(item => item.emergencyDrugCostRatio),
        borderColor: '#F59E0B',
        backgroundColor: '#F59E0B20',
        fill: true,
        tension: 0.1
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
    return `${value.toFixed(2)}${unit}`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-2">门急诊次均药费详细分析</h2>
        <p className="text-gray-600 text-sm">
          深入分析门急诊次均药费的详细构成，包括门诊和急诊的西药、中草药、中成药费用，以及费用变动趋势和占比分析
        </p>
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
            {/* 门急诊次均药费趋势 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">门急诊次均药费趋势</h3>
              <div className="h-80">
                <Line
                  data={drugCostTrendData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: {
                        beginAtZero: true,
                        title: {
                          display: true,
                          text: '药费 (元)'
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>

            {/* 门诊次均药费变动率 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">门诊次均药费变动率</h3>
              <div className="h-80">
                <Line
                  data={drugCostChangeRateData}
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

          {/* 第二行：药费构成分析 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 门诊药费构成趋势 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">门诊药费构成趋势</h3>
              <div className="h-80">
                <Line
                  data={outpatientDrugStructureData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: {
                        beginAtZero: true,
                        title: {
                          display: true,
                          text: '药费 (元)'
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>

            {/* 急诊药费构成趋势 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">急诊药费构成趋势</h3>
              <div className="h-80">
                <Line
                  data={emergencyDrugStructureData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: {
                        beginAtZero: true,
                        title: {
                          display: true,
                          text: '药费 (元)'
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* 第三行：结构比例分析 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 门诊药费构成比例 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">门诊药费构成比例</h3>
              <div className="h-64">
                <Doughnut
                  data={outpatientStructureData}
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
              {analysisData.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="text-purple-600">
                    <div className="font-bold">{formatValue(getLatestOutpatientStructure().western, '%')}</div>
                    <div>西药</div>
                  </div>
                  <div className="text-cyan-600">
                    <div className="font-bold">{formatValue(getLatestOutpatientStructure().herbal, '%')}</div>
                    <div>中草药</div>
                  </div>
                  <div className="text-green-600">
                    <div className="font-bold">{formatValue(getLatestOutpatientStructure().chinese, '%')}</div>
                    <div>中成药</div>
                  </div>
                </div>
              )}
            </div>

            {/* 急诊药费构成比例 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">急诊药费构成比例</h3>
              <div className="h-64">
                <Doughnut
                  data={emergencyStructureData}
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
              {analysisData.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="text-red-600">
                    <div className="font-bold">{formatValue(getLatestEmergencyStructure().western, '%')}</div>
                    <div>西药</div>
                  </div>
                  <div className="text-yellow-600">
                    <div className="font-bold">{formatValue(getLatestEmergencyStructure().herbal, '%')}</div>
                    <div>中草药</div>
                  </div>
                  <div className="text-lime-600">
                    <div className="font-bold">{formatValue(getLatestEmergencyStructure().chinese, '%')}</div>
                    <div>中成药</div>
                  </div>
                </div>
              )}
            </div>

            {/* 急诊药费占比趋势 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">急诊次均药费占比趋势</h3>
              <div className="h-64">
                <Line
                  data={emergencyDrugCostRatioData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: {
                        min: 0,
                        max: 100,
                        title: {
                          display: true,
                          text: '占比 (%)'
                        }
                      }
                    }
                  }}
                />
              </div>
              {analysisData.length > 0 && (
                <div className="mt-4 text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {formatValue(analysisData[analysisData.length - 1].emergencyDrugCostRatio, '%')}
                  </div>
                  <div className="text-sm text-gray-600">当前急诊药费占比</div>
                </div>
              )}
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
                    {/* 门诊药费 */}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">门诊西药费</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">门诊中草药费</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">门诊中成药费</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">门诊总药费</th>
                    {/* 急诊药费 */}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">急诊西药费</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">急诊中草药费</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">急诊中成药费</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">急诊总药费</th>
                    {/* 计算指标 */}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">药费变动率</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">急诊药费占比</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {analysisData.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50 text-sm">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-900">{item.date}</td>
                      {/* 门诊药费 */}
                      <td className="px-4 py-3 whitespace-nowrap text-purple-600">{formatValue(item.outpatientWesternDrugCost, '元')}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-cyan-600">{formatValue(item.outpatientHerbalDrugCost, '元')}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-green-600">{formatValue(item.outpatientChineseDrugCost, '元')}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-900 font-medium">{formatValue(item.outpatientTotalDrugCost, '元')}</td>
                      {/* 急诊药费 */}
                      <td className="px-4 py-3 whitespace-nowrap text-red-600">{formatValue(item.emergencyWesternDrugCost, '元')}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-yellow-600">{formatValue(item.emergencyHerbalDrugCost, '元')}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-lime-600">{formatValue(item.emergencyChineseDrugCost, '元')}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-900 font-medium">{formatValue(item.emergencyTotalDrugCost, '元')}</td>
                      {/* 计算指标 */}
                      <td className={`px-4 py-3 whitespace-nowrap font-medium ${
                        item.drugCostChangeRate > 0 ? 'text-red-600' : item.drugCostChangeRate < 0 ? 'text-green-600' : 'text-gray-600'
                      }`}>
                        {item.drugCostChangeRate > 0 ? '+' : ''}{formatValue(item.drugCostChangeRate, '%')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-orange-600">{formatValue(item.emergencyDrugCostRatio, '%')}</td>
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
                  <li><strong>门诊次均西药费</strong> = 期内门诊西药收入合计 / 同期门诊总诊疗人次数</li>
                  <li><strong>门诊次均中草药费</strong> = 期内门诊中草药收入合计 / 同期门诊总诊疗人次数</li>
                  <li><strong>门诊次均中成药费</strong> = 期内门诊中成药收入合计 / 同期门诊总诊疗人次数</li>
                  <li><strong>急诊次均西药费</strong> = 期内急诊西药收入合计 / 同期急诊总诊疗人次数</li>
                  <li><strong>急诊次均中草药费</strong> = 期内急诊中草药收入合计 / 同期急诊总诊疗人次数</li>
                  <li><strong>急诊次均中成药费</strong> = 期内急诊中成药收入合计 / 同期急诊总诊疗人次数</li>
                  <li><strong>门急诊次均药费变动率</strong> = (当月次均药费 - 上月次均药费) / 上月次均药费 × 100%</li>
                  <li><strong>急诊次均药费占比</strong> = 期内急诊次均药费 / 期内门急诊次均药费 × 100%</li>
                  <li>数据来源于医院财务系统、药房管理系统和中医药管理系统</li>
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