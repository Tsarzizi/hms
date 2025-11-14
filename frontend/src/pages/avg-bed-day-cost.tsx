// 文件路径: src\yiliaofudan\pingjunchuangrifeiyong\frontend\AverageBedDayCost.tsx

import { useState, useEffect } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// 注册 Chart.js 组件
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface DiseaseBedDayCost {
  diseaseName: string;           // 病种名称
  totalCost: number;             // 医药总费用（元）
  totalBedDays: number;          // 总床日数
  avgBedDayCost: number;         // 平均床日费用（元）
  patientCount: number;          // 出院患者数
}

interface ChartData {
  date: string;
  data: {
    avgBedDayCost: number;       // 总体平均床日费用
    diseases: DiseaseBedDayCost[]; // 各病种数据
  };
}

interface SummaryData {
  overallAvgBedDayCost: number;  // 总体平均床日费用
  topDiseases: DiseaseBedDayCost[]; // 重点病种数据
  totalPatients: number;         // 总出院患者数
  totalBedDays: number;          // 总床日数
}

interface ComparisonData {
  current_value: number;
  comparison_value: number;
  change_rate: number;
  change_type: string;
}

const diseaseTypes = [
  { id: 'all', name: '全部病种', color: '#3B82F6' },
  { id: 'hypertension', name: '高血压', color: '#EF4444' },
  { id: 'diabetes', name: '糖尿病', color: '#10B981' },
  { id: 'coronary', name: '冠心病', color: '#F59E0B' },
  { id: 'stroke', name: '脑卒中', color: '#8B5CF6' },
  { id: 'copd', name: 'COPD', color: '#06B6D4' },
  { id: 'pneumonia', name: '肺炎', color: '#F97316' }
];

// 时间范围选项
const timeRanges = [
  { key: 'month', label: '月' },
  { key: 'quarter', label: '季度' },
  { key: 'year', label: '年' }
];

// API基础URL - 使用端口5054
const API_BASE_URL = 'http://localhost:5054';

// 独立的年份选择器组件
const YearSelector = ({
  selectedYear,
  onYearChange
}: {
  selectedYear: number;
  onYearChange: (year: number) => void;
}) => {
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAvailableYears = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/bed-day-cost/years`);

      if (!response.ok) {
        throw new Error(`HTTP错误! 状态码: ${response.status}`);
      }

      const result = await response.json();

      if (result.success && result.data) {
        setAvailableYears(result.data);
        if (result.data.length > 0 && !selectedYear) {
          onYearChange(result.data[0]);
        }
      } else {
        console.error('获取年份列表失败:', result.error);
      }
    } catch (error) {
      console.error('获取年份列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailableYears();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-600">分析年份：</span>
        <div className="text-sm text-gray-500">加载中...</div>
      </div>
    );
  }

  if (availableYears.length === 0) {
    return (
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-600">分析年份：</span>
        <div className="text-sm text-red-500">无可用数据</div>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      <span className="text-sm text-gray-600">分析年份：</span>
      <select
        value={selectedYear}
        onChange={(e) => onYearChange(Number(e.target.value))}
        className="bg-gray-100 border border-gray-300 rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
      >
        {availableYears.map(year => (
          <option key={year} value={year}>{year}年</option>
        ))}
      </select>
    </div>
  );
};

// 病种选择器组件
const DiseaseSelector = ({
  selectedDiseases,
  onDiseaseChange
}: {
  selectedDiseases: string[];
  onDiseaseChange: (diseases: string[]) => void;
}) => {
  const toggleDisease = (diseaseId: string) => {
    if (diseaseId === 'all') {
      onDiseaseChange(['all']);
    } else {
      const newSelection = selectedDiseases.includes(diseaseId)
        ? selectedDiseases.filter(id => id !== diseaseId)
        : [...selectedDiseases.filter(id => id !== 'all'), diseaseId];

      if (newSelection.length === 0) {
        onDiseaseChange(['all']);
      } else {
        onDiseaseChange(newSelection);
      }
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <span className="text-sm text-gray-600">病种选择：</span>
      <div className="flex flex-wrap gap-2">
        {diseaseTypes.map(disease => (
          <button
            key={disease.id}
            onClick={() => toggleDisease(disease.id)}
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              selectedDiseases.includes(disease.id)
                ? 'text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            style={{
              backgroundColor: selectedDiseases.includes(disease.id) ? disease.color : undefined
            }}
          >
            <div
              className="w-2 h-2 rounded-full mr-2"
              style={{ backgroundColor: disease.color }}
            ></div>
            {disease.name}
          </button>
        ))}
      </div>
    </div>
  );
};

export default function AverageBedDayCost() {
  const [timeRange, setTimeRange] = useState('month');
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [yoyData, setYoyData] = useState<{ [key: string]: ComparisonData }>({});
  const [momData, setMomData] = useState<{ [key: string]: ComparisonData }>({});
  const [loading, setLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedDiseases, setSelectedDiseases] = useState<string[]>(['all']);
  const [chartType, setChartType] = useState<'trend' | 'comparison'>('trend');

  // 从后端获取图表数据
  const fetchData = async (range: string, year?: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        range: range
      });

      if (year) {
        params.append('year', year.toString());
      }

      const url = `${API_BASE_URL}/api/bed-day-cost?${params}`;
      console.log('请求平均床日费用URL:', url);

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP错误! 状态码: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        setChartData(result.data);
      } else {
        throw new Error(result.error || 'API返回错误');
      }
    } catch (error) {
      console.error('获取平均床日费用数据失败:', error);
      setChartData(getMockData());
    } finally {
      setLoading(false);
    }
  };

  // 获取摘要数据
  const fetchSummaryData = async (range: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/bed-day-cost/summary?range=${range}`);

      if (!response.ok) {
        console.error('获取摘要数据失败，状态码:', response.status);
        return;
      }

      const result = await response.json();

      if (result.success) {
        setSummaryData(result.data);
      } else {
        console.error('获取摘要数据失败:', result.error);
      }
    } catch (error) {
      console.error('获取摘要数据失败:', error);
    }
  };

  // 获取同比环比数据
  const fetchComparisonData = async (type: 'yoy' | 'mom', setData: React.Dispatch<React.SetStateAction<{ [key: string]: ComparisonData }>>) => {
    try {
      const currentDate = new Date();
      const periodDate = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-01`;

      const response = await fetch(
        `${API_BASE_URL}/api/bed-day-cost/comparison?type=${type}&period_date=${periodDate}`
      );

      if (!response.ok) {
        throw new Error(`HTTP错误! 状态码: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        setData(result.data);
      } else {
        setData({});
      }
    } catch (error) {
      console.error(`获取${type === 'yoy' ? '同比' : '环比'}数据失败:`, error);
      setData({});
    }
  };

  // 测试后端连接
  const testBackendConnection = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`);
      if (response.ok) {
        return true;
      }
    } catch (error) {
      console.error('后端连接测试失败:', error);
    }
    return false;
  };

  // 模拟数据函数
  const getMockData = (): ChartData[] => {
    const mockData: ChartData[] = [];
    const months = ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06'];

    months.forEach(month => {
      const diseases: DiseaseBedDayCost[] = diseaseTypes
        .filter(d => d.id !== 'all')
        .map(disease => {
          const totalCost = Math.floor(Math.random() * 500000) + 500000; // 50-100万元
          const totalBedDays = Math.floor(Math.random() * 2000) + 1000; // 1000-3000床日
          const avgBedDayCost = totalCost / totalBedDays;
          const patientCount = Math.floor(Math.random() * 200) + 100; // 100-300患者

          return {
            diseaseName: disease.name,
            totalCost,
            totalBedDays,
            avgBedDayCost,
            patientCount
          };
        });

      const overallAvgBedDayCost = diseases.reduce((sum, disease) => sum + disease.avgBedDayCost, 0) / diseases.length;

      mockData.push({
        date: month,
        data: {
          avgBedDayCost: overallAvgBedDayCost,
          diseases
        }
      });
    });

    return mockData;
  };

  useEffect(() => {
    const initializeData = async () => {
      const isBackendConnected = await testBackendConnection();

      if (!isBackendConnected) {
        console.log('后端服务不可用，使用模拟数据');
        const mockData = getMockData();
        setChartData(mockData);

        // 计算摘要数据
        const overallAvg = mockData.reduce((sum, item) => sum + item.data.avgBedDayCost, 0) / mockData.length;
        const totalPatients = mockData.reduce((sum, item) =>
          sum + item.data.diseases.reduce((dSum, disease) => dSum + disease.patientCount, 0), 0
        );
        const totalBedDays = mockData.reduce((sum, item) =>
          sum + item.data.diseases.reduce((dSum, disease) => dSum + disease.totalBedDays, 0), 0
        );

        setSummaryData({
          overallAvgBedDayCost: overallAvg,
          topDiseases: mockData[0].data.diseases.slice(0, 5), // 取前5个病种
          totalPatients,
          totalBedDays
        });
        return;
      }

      await fetchData(timeRange, selectedYear);
      await fetchSummaryData(timeRange);
      await fetchComparisonData('yoy', setYoyData);
      await fetchComparisonData('mom', setMomData);
    };

    initializeData();
  }, [timeRange, selectedYear]);

  const getTrendChartData = () => {
    if (!chartData || chartData.length === 0) {
      return {
        labels: [],
        datasets: []
      };
    }

    const labels = chartData.map(item => item.date);

    if (selectedDiseases.includes('all')) {
      // 显示总体趋势
      return {
        labels,
        datasets: [
          {
            label: '总体平均床日费用',
            data: chartData.map(item => item.data.avgBedDayCost),
            borderColor: '#3B82F6',
            backgroundColor: '#3B82F680',
            tension: 0.1,
            borderWidth: 2,
            fill: false,
          }
        ]
      };
    } else {
      // 显示选中病种的趋势
      const datasets = selectedDiseases.map(diseaseId => {
        const disease = diseaseTypes.find(d => d.id === diseaseId);
        return {
          label: disease?.name || '',
          data: chartData.map(item => {
            const diseaseData = item.data.diseases.find(d =>
              d.diseaseName === disease?.name
            );
            return diseaseData ? diseaseData.avgBedDayCost : 0;
          }),
          borderColor: disease?.color || '#666',
          backgroundColor: disease?.color + '80' || '#6666',
          tension: 0.1,
          borderWidth: 2,
          fill: false,
        };
      });

      return { labels, datasets };
    }
  };

  const getComparisonChartData = () => {
    if (!summaryData || !summaryData.topDiseases) {
      return {
        labels: [],
        datasets: []
      };
    }

    const labels = summaryData.topDiseases.map(disease => disease.diseaseName);

    return {
      labels,
      datasets: [
        {
          label: '平均床日费用（元）',
          data: summaryData.topDiseases.map(disease => disease.avgBedDayCost),
          backgroundColor: summaryData.topDiseases.map((_, index) =>
            diseaseTypes[index + 1]?.color || '#3B82F6'
          ),
          borderColor: summaryData.topDiseases.map((_, index) =>
            diseaseTypes[index + 1]?.color || '#3B82F6'
          ),
          borderWidth: 1,
        }
      ]
    };
  };

  const getChartOptions = (type: 'trend' | 'comparison') => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: type === 'trend'
          ? `平均床日费用趋势图 (${timeRanges.find(r => r.key === timeRange)?.label})`
          : '各病种平均床日费用对比'
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: type === 'trend' ? '时间' : '病种'
        }
      },
      y: {
        title: {
          display: true,
          text: '平均床日费用（元）'
        },
        beginAtZero: true,
      }
    },
  });

  const formatCurrency = (amount: number) => {
    return `¥${amount.toFixed(2)}`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-2">平均床日费用</h2>
        <p className="text-gray-600 text-sm">
          监控和分析各病种出院患者平均床日费用情况，支持按病种和时间维度进行深入分析
        </p>
      </div>

      {/* 主要指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-700">总体平均床日费用</h3>
            <div className="w-4 h-4 rounded-full bg-blue-500"></div>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-3">
            {summaryData ? formatCurrency(summaryData.overallAvgBedDayCost) : '加载中...'}
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 font-medium mb-2">统计说明：</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              报告期内出院患者平均每日住院费用
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-700">总出院患者数</h3>
            <div className="w-4 h-4 rounded-full bg-green-500"></div>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-3">
            {summaryData ? `${summaryData.totalPatients.toLocaleString()}人` : '加载中...'}
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 leading-relaxed">
              报告期内各病种出院患者总数
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-700">总占用床日数</h3>
            <div className="w-4 h-4 rounded-full bg-purple-500"></div>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-3">
            {summaryData ? `${summaryData.totalBedDays.toLocaleString()}床日` : '加载中...'}
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 leading-relaxed">
              报告期内各病种患者占用总床日数
            </p>
          </div>
        </div>
      </div>

      {/* 图表控制区域 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 lg:mb-0">费用分析</h3>

          <div className="flex flex-col lg:flex-row lg:items-center space-y-4 lg:space-y-0 lg:space-x-4">
            {/* 图表类型选择 */}
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">图表类型：</span>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setChartType('trend')}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    chartType === 'trend'
                      ? 'bg-green-600 text-white'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  趋势分析
                </button>
                <button
                  onClick={() => setChartType('comparison')}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    chartType === 'comparison'
                      ? 'bg-green-600 text-white'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  病种对比
                </button>
              </div>
            </div>

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
                        ? 'bg-green-600 text-white'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>

            <YearSelector
              selectedYear={selectedYear}
              onYearChange={setSelectedYear}
            />
          </div>
        </div>

        {/* 病种选择器 */}
        {chartType === 'trend' && (
          <div className="mb-6">
            <DiseaseSelector
              selectedDiseases={selectedDiseases}
              onDiseaseChange={setSelectedDiseases}
            />
          </div>
        )}

        {/* 图表区域 */}
        <div className="h-96">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
                <p className="text-gray-500">加载数据中...</p>
              </div>
            </div>
          ) : chartData && chartData.length > 0 ? (
            chartType === 'trend' ? (
              <Line data={getTrendChartData()} options={getChartOptions('trend')} />
            ) : (
              <Bar data={getComparisonChartData()} options={getChartOptions('comparison')} />
            )
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-6xl text-gray-300 mb-4">📊</div>
                <p className="text-gray-500 mb-2">暂无图表数据</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 病种费用详情表格 */}
      {summaryData && summaryData.topDiseases && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">各病种费用详情</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    病种名称
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    出院患者数
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    总床日数
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    医药总费用
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    平均床日费用
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {summaryData.topDiseases.map((disease, index) => (
                  <tr key={disease.diseaseName}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <div className="flex items-center">
                        <div
                          className="w-3 h-3 rounded-full mr-2"
                          style={{ backgroundColor: diseaseTypes[index + 1]?.color || '#3B82F6' }}
                        ></div>
                        {disease.diseaseName}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {disease.patientCount.toLocaleString()}人
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {disease.totalBedDays.toLocaleString()}床日
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatCurrency(disease.totalCost)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-blue-600">
                      {formatCurrency(disease.avgBedDayCost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 数据说明 */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start">
          <div className="text-green-600 mr-2 mt-0.5">ℹ️</div>
          <div className="text-green-800 text-sm">
            <p className="font-medium mb-1">数据说明：</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>数据来源于医院住院结算系统和病案首页，每月更新</li>
              <li><strong>平均床日费用计算公式</strong>：报告期内某病种出院患者平均床日费用 = 报告期内某病种出院患者医药总费用 / 报告期内该病种出院患者占用总床日数</li>
              <li>平均床日费用反映住院患者的每日医疗费用水平，是医疗费用控制的重要指标</li>
              <li>支持按不同病种、不同时间维度进行分析比较</li>
              <li>可通过趋势分析查看费用变化趋势，通过病种对比了解各病种费用差异</li>
              <li>后端服务运行在: {API_BASE_URL}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}