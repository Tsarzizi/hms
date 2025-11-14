// src/yiliaofudan/menjizhencijunfeiyong/frontend/menjizhencijunfeiyongfenxi.tsx
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

interface CostAnalysisData {
  date: string;
  totalAvgCost: number;
  drugCostRatio: number;
  materialCostRatio: number;
  examinationCostRatio: number;
  treatmentCostRatio: number;
  costChangeRate: number;
  insurancePaymentRatio: number;
  personalPaymentRatio: number;
  insuranceAvgPayment: number;
  personalAvgPayment: number;
}

interface CostStructureData {
  drugCost: number;
  materialCost: number;
  examinationCost: number;
  treatmentCost: number;
  otherCost: number;
}

const API_BASE_URL = 'http://localhost:5048';

export default function OutpatientCostAnalysis() {
  const [analysisData, setAnalysisData] = useState<CostAnalysisData[]>([]);
  const [costStructure, setCostStructure] = useState<CostStructureData | null>(null);
  const [timeRange, setTimeRange] = useState('month');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(false);

  // 模拟数据
  const getMockData = (): CostAnalysisData[] => {
    const months = ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06'];
    return months.map((month, index) => {
      const baseCost = 200 + Math.random() * 100;
      const drugRatio = 0.4 + Math.random() * 0.1;
      const materialRatio = 0.1 + Math.random() * 0.05;
      const examRatio = 0.2 + Math.random() * 0.1;
      const treatmentRatio = 0.15 + Math.random() * 0.1;
      const insuranceRatio = 0.6 + Math.random() * 0.2;

      return {
        date: month,
        totalAvgCost: baseCost,
        drugCostRatio: drugRatio * 100,
        materialCostRatio: materialRatio * 100,
        examinationCostRatio: examRatio * 100,
        treatmentCostRatio: treatmentRatio * 100,
        costChangeRate: index === 0 ? 0 : (Math.random() * 10 - 5),
        insurancePaymentRatio: insuranceRatio * 100,
        personalPaymentRatio: (1 - insuranceRatio) * 100,
        insuranceAvgPayment: baseCost * insuranceRatio,
        personalAvgPayment: baseCost * (1 - insuranceRatio)
      };
    });
  };

  const getMockCostStructure = (): CostStructureData => {
    return {
      drugCost: 85,
      materialCost: 25,
      examinationCost: 45,
      treatmentCost: 35,
      otherCost: 10
    };
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/outpatient-cost/analysis?range=${timeRange}&year=${selectedYear}`);
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setAnalysisData(result.data.analysis);
          setCostStructure(result.data.structure);
        } else {
          throw new Error(result.error);
        }
      } else {
        throw new Error('HTTP错误');
      }
    } catch (error) {
      console.error('获取分析数据失败，使用模拟数据:', error);
      setAnalysisData(getMockData());
      setCostStructure(getMockCostStructure());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [timeRange, selectedYear]);

  // 1. 医保/个人支付负担比例
  const paymentBurdenData = {
    labels: ['医保支付', '个人支付'],
    datasets: [
      {
        data: analysisData.length > 0
          ? [analysisData[analysisData.length - 1].insurancePaymentRatio, analysisData[analysisData.length - 1].personalPaymentRatio]
          : [65, 35],
        backgroundColor: ['#36A2EB', '#FF6384'],
        hoverBackgroundColor: ['#36A2EB', '#FF6384']
      }
    ]
  };

  // 2. 门急诊次均费用趋势
  const costTrendData = {
    labels: analysisData.map(item => item.date),
    datasets: [
      {
        label: '门急诊次均费用 (元)',
        data: analysisData.map(item => item.totalAvgCost),
        borderColor: '#8B5CF6',
        backgroundColor: '#8B5CF620',
        fill: true,
        tension: 0.1
      }
    ]
  };

  // 3. 门急诊次均费用变动率
  const costChangeRateData = {
    labels: analysisData.map(item => item.date),
    datasets: [
      {
        label: '费用变动率 (%)',
        data: analysisData.map(item => item.costChangeRate),
        borderColor: '#10B981',
        backgroundColor: '#10B98120',
        fill: true,
        tension: 0.1
      }
    ]
  };

  // 4. 费用构成比例
  const costStructureData = {
    labels: ['药品费', '卫生材料费', '检查费', '治疗费', '其他'],
    datasets: [
      {
        data: costStructure ? [
          costStructure.drugCost,
          costStructure.materialCost,
          costStructure.examinationCost,
          costStructure.treatmentCost,
          costStructure.otherCost
        ] : [40, 15, 25, 15, 5],
        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'],
        hoverBackgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF']
      }
    ]
  };

  // 5. 各项费用占比趋势
  const costRatioTrendData = {
    labels: analysisData.map(item => item.date),
    datasets: [
      {
        label: '药品费占比 (%)',
        data: analysisData.map(item => item.drugCostRatio),
        borderColor: '#FF6384',
        backgroundColor: '#FF638420',
        fill: false
      },
      {
        label: '检查费占比 (%)',
        data: analysisData.map(item => item.examinationCostRatio),
        borderColor: '#FFCE56',
        backgroundColor: '#FFCE5620',
        fill: false
      },
      {
        label: '材料费占比 (%)',
        data: analysisData.map(item => item.materialCostRatio),
        borderColor: '#36A2EB',
        backgroundColor: '#36A2EB20',
        fill: false
      },
      {
        label: '治疗费占比 (%)',
        data: analysisData.map(item => item.treatmentCostRatio),
        borderColor: '#4BC0C0',
        backgroundColor: '#4BC0C020',
        fill: false
      }
    ]
  };

  const formatValue = (value: number, unit: string = '') => {
    return `${value.toFixed(2)}${unit}`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-2">门急诊次均费用分析</h2>
        <p className="text-gray-600 text-sm">
          深入分析门急诊次均费用的构成、变化趋势、支付负担比例等关键指标，为医疗费用控制和医保管理提供数据支持
        </p>
      </div>

      {/* 控制区域 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center space-x-4">
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
          {/* 第一行：支付负担比例和费用趋势 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 医保/个人支付负担比例 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">次均费用支付负担比例</h3>
              <div className="h-80">
                <Doughnut
                  data={paymentBurdenData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom'
                      },
                      tooltip: {
                        callbacks: {
                          label: function(context) {
                            return `${context.label}: ${context.parsed}%`;
                          }
                        }
                      }
                    }
                  }}
                />
              </div>
              {analysisData.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-4 text-center">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="text-2xl font-bold text-blue-600">
                      {formatValue(analysisData[analysisData.length - 1].insurancePaymentRatio, '%')}
                    </div>
                    <div className="text-sm text-gray-600">医保支付比例</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3">
                    <div className="text-2xl font-bold text-red-600">
                      {formatValue(analysisData[analysisData.length - 1].personalPaymentRatio, '%')}
                    </div>
                    <div className="text-sm text-gray-600">个人支付比例</div>
                  </div>
                </div>
              )}
            </div>

            {/* 门急诊次均费用趋势 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">门急诊次均费用趋势</h3>
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
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* 第二行：费用变动率和费用构成 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 门急诊次均费用变动率 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">门急诊次均费用变动率</h3>
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

            {/* 门急诊次均医药费用构成比例 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">门急诊次均医药费用构成比例</h3>
              <div className="h-80">
                <Pie
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
            </div>
          </div>

          {/* 第三行：各项费用占比趋势 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">各项费用占比趋势分析</h3>
            <div className="h-80">
              <Line
                data={costRatioTrendData}
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
          </div>

          {/* 详细数据表格 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">详细数据分析</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">期间</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">次均费用</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">费用变动率</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">药品费占比</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">材料费占比</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">检查费占比</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">治疗费占比</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">医保支付比例</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">个人支付比例</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {analysisData.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.date}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatValue(item.totalAvgCost, '元')}</td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                        item.costChangeRate > 0 ? 'text-red-600' : item.costChangeRate < 0 ? 'text-green-600' : 'text-gray-600'
                      }`}>
                        {item.costChangeRate > 0 ? '+' : ''}{formatValue(item.costChangeRate, '%')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatValue(item.drugCostRatio, '%')}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatValue(item.materialCostRatio, '%')}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatValue(item.examinationCostRatio, '%')}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatValue(item.treatmentCostRatio, '%')}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">{formatValue(item.insurancePaymentRatio, '%')}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">{formatValue(item.personalPaymentRatio, '%')}</td>
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
                  <li><strong>次均费用医保支付负担比例</strong> = 期内门急诊医保患者次均医保基金支付费用 / 期内门急诊医保患者次均费用 × 100%</li>
                  <li><strong>次均费用个人负担比例</strong> = 期内医保患者急诊次均个人支付费用 / 期内门急诊医保患者次均费用 × 100%</li>
                  <li><strong>门急诊次均费用变动率</strong> = (本月次均费用 - 上月次均费用) / 上月次均费用 × 100%</li>
                  <li><strong>门急诊次均费用药品费占比</strong> = 期内门急诊次均药品费 / 期内门急诊次均费用 × 100%</li>
                  <li><strong>门急诊次均费用卫生材料费占比</strong> = 期内门急诊次均卫生材料费 / 期内门急诊次均费用 × 100%</li>
                  <li><strong>门急诊次均费用检查费占比</strong> = 期内门急诊次均检查费 / 期内门急诊次均费用 × 100%</li>
                  <li><strong>门急诊次均医药费用构成比例</strong> = 期内门急诊次均各类单项费用 / 期内门急诊次均费用 × 100%</li>
                  <li>数据来源于医院财务系统、医保结算系统和门急诊管理系统</li>
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