import { useEffect, useMemo, useState } from "react";

const API_BASE = "/api/performance";
const PAGE_SIZE = 10;

/** ---------- 模拟数据 ---------- */

// 模拟科室数据
const mockDepartments = [
  { value: "cardiology", label: "心血管内科" },
  { value: "neurology", label: "神经内科" },
  { value: "surgery", label: "外科" },
  { value: "pediatrics", label: "儿科" },
  { value: "obstetrics", label: "妇产科" },
  { value: "orthopedics", label: "骨科" },
  { value: "ophthalmology", label: "眼科" },
  { value: "ent", label: "耳鼻喉科" }
];

// 模拟医生数据
const mockDoctors = [
  { value: "zhang_san", label: "张三" },
  { value: "li_si", label: "李四" },
  { value: "wang_wu", label: "王五" },
  { value: "zhao_liu", label: "赵六" },
  { value: "qian_qi", label: "钱七" },
  { value: "sun_ba", label: "孙八" },
  { value: "zhou_jiu", label: "周九" },
  { value: "wu_shi", label: "吴十" }
];

// 模拟绩效数据
const mockPerformanceData = {
  inpatientWorkload: {
    nonSurgeryOrderPoints: 150,
    nonSurgeryExecutePoints: 145,
    workloadUnitPrice: 85,
    nonSurgeryPerformance: 12325,
    surgeryBasePerformance: 8500,
    angiographyPerformance: 3200,
    interventionPerformance: 5600
  },
  selfPayInpatientWorkload: {
    nonSurgeryOrderPoints: 45,
    nonSurgeryExecutePoints: 42,
    workloadUnitPrice: 95,
    nonSurgeryPerformance: 3990,
    surgeryBasePerformance: 2800,
    angiographyPerformance: 1200,
    interventionPerformance: 2100
  },
  drgPerformance: {
    diseaseSettlementFee: 285000,
    drgDiseaseCost: 234000,
    drgBalance: 51000,
    drgCoefficient: 0.35,
    drgPerformance: 17850
  },
  outpatientWorkload: {
    outpatientOrderPoints: 320,
    outpatientExecutePoints: 315,
    workloadUnitPrice: 45,
    outpatientWorkloadPerformance: 14175
  },
  reward: {
    outpatientRegistrationFee: 1200,
    outpatientConsultationFee: 1800,
    threeLevelSurgery: 4500,
    fourLevelSurgery: 6800,
    qualityRewardAndSubsidy: 3200
  },
  totalPayable: 0
};

// 计算总绩效
mockPerformanceData.totalPayable =
  mockPerformanceData.inpatientWorkload.nonSurgeryPerformance +
  mockPerformanceData.inpatientWorkload.surgeryBasePerformance +
  mockPerformanceData.inpatientWorkload.angiographyPerformance +
  mockPerformanceData.inpatientWorkload.interventionPerformance +
  mockPerformanceData.selfPayInpatientWorkload.nonSurgeryPerformance +
  mockPerformanceData.selfPayInpatientWorkload.surgeryBasePerformance +
  mockPerformanceData.selfPayInpatientWorkload.angiographyPerformance +
  mockPerformanceData.selfPayInpatientWorkload.interventionPerformance +
  mockPerformanceData.drgPerformance.drgPerformance +
  mockPerformanceData.outpatientWorkload.outpatientWorkloadPerformance +
  mockPerformanceData.reward.outpatientRegistrationFee +
  mockPerformanceData.reward.outpatientConsultationFee +
  mockPerformanceData.reward.threeLevelSurgery +
  mockPerformanceData.reward.fourLevelSurgery +
  mockPerformanceData.reward.qualityRewardAndSubsidy;

// 模拟趋势数据
const mockTrendData = [
  { month: '2024-01', performance: 68500, outpatient: 280, surgery: 45 },
  { month: '2024-02', performance: 72300, outpatient: 295, surgery: 52 },
  { month: '2024-03', performance: 69800, outpatient: 275, surgery: 48 },
  { month: '2024-04', performance: 75600, outpatient: 310, surgery: 55 },
  { month: '2024-05', performance: 78900, outpatient: 325, surgery: 58 },
  { month: '2024-06', performance: 81200, outpatient: 340, surgery: 62 },
  { month: '2024-07', performance: 84500, outpatient: 355, surgery: 65 },
  { month: '2024-08', performance: 82300, outpatient: 345, surgery: 60 },
  { month: '2024-09', performance: 86700, outpatient: 365, surgery: 68 },
  { month: '2024-10', performance: 89200, outpatient: 380, surgery: 72 },
  { month: '2024-11', performance: 91500, outpatient: 395, surgery: 75 },
  { month: '2024-12', performance: 94200, outpatient: 410, surgery: 78 }
];

// 模拟API延迟
const simulateApiDelay = (ms: number = 500) =>
  new Promise(resolve => setTimeout(resolve, ms));

/** ---------- 工具函数 ---------- */
function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatCurrency(amount: number) {
  return `￥${amount?.toLocaleString() || '0'}`;
}

function formatPercent(value: number) {
  if (value === undefined || value === null) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/** ---------- 类型定义 ---------- */
type Option = { value: string; label: string };
type FieldType = 'number' | 'text' | 'currency';

interface PerformanceField {
  key: string;
  label: string;
  type?: FieldType;
  unit?: string;
  calculated?: boolean;
}

interface PerformanceSectionConfig {
  key: string;
  title: string;
  fields: PerformanceField[];
}

/** ---------- 折线图组件 ---------- */
function LineChart({ data }: { data: any[] }) {
  const chartHeight = 200;
  const chartWidth = 1000; // 固定宽度以便更好地展示折线

  // 计算数据的最大值，用于比例缩放
  const maxPerformance = Math.max(...data.map(d => d.performance));
  const maxOutpatient = Math.max(...data.map(d => d.outpatient));
  const maxSurgery = Math.max(...data.map(d => d.surgery));

  // 计算点的位置
  const getPoint = (value: number, index: number, maxValue: number) => {
    const x = (index / (data.length - 1)) * chartWidth;
    const y = chartHeight - (value / maxValue) * chartHeight;
    return { x, y };
  };

  // 生成绩效折线的路径
  const performancePath = data.map((item, index) => {
    const point = getPoint(item.performance, index, maxPerformance);
    return `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`;
  }).join(' ');

  // 生成门诊量折线的路径
  const outpatientPath = data.map((item, index) => {
    const point = getPoint(item.outpatient, index, maxOutpatient);
    return `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`;
  }).join(' ');

  // 生成手术量折线的路径
  const surgeryPath = data.map((item, index) => {
    const point = getPoint(item.surgery, index, maxSurgery);
    return `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`;
  }).join(' ');

  // 生成数据点
  const performancePoints = data.map((item, index) => {
    const point = getPoint(item.performance, index, maxPerformance);
    return (
      <g key={`performance-${index}`}>
        <circle
          cx={point.x}
          cy={point.y}
          r="3"
          fill="#3b82f6"
          className="hover:r-4 transition-all duration-200"
        />
        <title>
          {item.month}: 绩效 {formatCurrency(item.performance)}
        </title>
      </g>
    );
  });

  const outpatientPoints = data.map((item, index) => {
    const point = getPoint(item.outpatient, index, maxOutpatient);
    return (
      <g key={`outpatient-${index}`}>
        <circle
          cx={point.x}
          cy={point.y}
          r="3"
          fill="#10b981"
          className="hover:r-4 transition-all duration-200"
        />
        <title>
          {item.month}: 门诊量 {item.outpatient}人次
        </title>
      </g>
    );
  });

  const surgeryPoints = data.map((item, index) => {
    const point = getPoint(item.surgery, index, maxSurgery);
    return (
      <g key={`surgery-${index}`}>
        <circle
          cx={point.x}
          cy={point.y}
          r="3"
          fill="#8b5cf6"
          className="hover:r-4 transition-all duration-200"
        />
        <title>
          {item.month}: 手术量 {item.surgery}台
        </title>
      </g>
    );
  });

  return (
    <div className="overflow-x-auto">
      <svg
        width={chartWidth}
        height={chartHeight + 30}
        className="min-w-full"
      >
        {/* 网格线 */}
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e5e7eb" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height={chartHeight} fill="url(#grid)" />

        {/* Y轴标签 */}
        <text x="10" y="15" fontSize="10" fill="#6b7280">￥{maxPerformance.toLocaleString()}</text>
        <text x="10" y={chartHeight/2} fontSize="10" fill="#6b7280">￥{(maxPerformance/2).toLocaleString()}</text>
        <text x="10" y={chartHeight-5} fontSize="10" fill="#6b7280">￥0</text>

        {/* 折线 */}
        <path
          d={performancePath}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          className="drop-shadow-sm"
        />
        <path
          d={outpatientPath}
          fill="none"
          stroke="#10b981"
          strokeWidth="2"
          className="drop-shadow-sm"
        />
        <path
          d={surgeryPath}
          fill="none"
          stroke="#8b5cf6"
          strokeWidth="2"
          className="drop-shadow-sm"
        />

        {/* 数据点 */}
        {performancePoints}
        {outpatientPoints}
        {surgeryPoints}

        {/* X轴标签 */}
        {data.map((item, index) => {
          const x = (index / (data.length - 1)) * chartWidth;
          return (
            <text
              key={item.month}
              x={x}
              y={chartHeight + 20}
              fontSize="10"
              fill="#6b7280"
              textAnchor="middle"
            >
              {item.month.split('-')[1]}月
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/** ---------- 多选下拉组件 ---------- */
function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = "请选择…",
  searchPlaceholder = "搜索…",
}: {
  label: string;
  options: Option[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  placeholder?: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(
    () =>
      !q
        ? options
        : options.filter(
            (o) =>
              o.label.toLowerCase().includes(q.toLowerCase()) ||
              o.value.toLowerCase().includes(q.toLowerCase())
          ),
    [options, q]
  );

  const allSelected = selected.size > 0 && selected.size === options.length;

  const toggle = (val: string) => {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    onChange(next);
  };

  const handleAll = () => {
    if (allSelected) onChange(new Set());
    else onChange(new Set(options.map((o) => o.value)));
  };

  const clear = () => onChange(new Set());

  const summaryText =
    selected.size === 0
      ? placeholder
      : selected.size === 1
      ? options.find((o) => o.value === Array.from(selected)[0])?.label ?? placeholder
      : `已选 ${selected.size} 项`;

  return (
    <div className="w-full text-left relative">
      <label className="text-sm font-medium text-gray-700 mb-2 block">{label}</label>
      <button
        type="button"
        className="w-full border border-gray-300 rounded-lg px-4 py-3 bg-white flex items-center justify-between hover:border-blue-500 transition-colors duration-200 shadow-sm"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`truncate ${selected.size ? "text-gray-900" : "text-gray-500"}`}>
          {summaryText}
        </span>
        <span className="text-gray-400 transform transition-transform duration-200">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="absolute z-20 mt-2 w-full border border-gray-200 rounded-lg bg-white shadow-lg overflow-hidden">
          <div className="p-3 border-b border-gray-100">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
            />
          </div>
          <div className="max-h-64 overflow-auto">
            {options.length > 0 && (
              <label className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors duration-150">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={handleAll}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  {allSelected ? "取消全选" : "全选所有结果"}
                </span>
              </label>
            )}
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-gray-400 text-center">无匹配项</div>
            ) : (
              filtered.map((o) => (
                <label
                  key={o.value}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 cursor-pointer transition-colors duration-150 border-b border-gray-50 last:border-b-0"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(o.value)}
                    onChange={() => toggle(o.value)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 truncate" title={`${o.label}（${o.value}）`}>
                    {o.label} <span className="text-gray-400">（{o.value}）</span>
                  </span>
                </label>
              ))
            )}
          </div>
          <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              共 {filtered.length} 项，已选 {selected.size} 项
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-white transition-colors duration-150"
                onClick={clear}
              >
                清空
              </button>
              <button
                type="button"
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-150"
                onClick={() => setOpen(false)}
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** ---------- 绩效板块组件 ---------- */
function PerformanceSection({
  title,
  fields,
  data,
  onDataChange,
  readonly = false
}: {
  title: string;
  fields: PerformanceField[];
  data: any;
  onDataChange?: (key: string, value: number) => void;
  readonly?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 text-left border-b pb-2">
        {title}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {fields.map((field) => (
          <div key={field.key} className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">
              {field.label}
              {field.unit && <span className="text-gray-500 ml-1">({field.unit})</span>}
            </label>
            {readonly || field.calculated ? (
              <div className="w-full border border-gray-300 rounded-lg px-3 py-2.5 bg-gray-50">
                <span className="text-gray-900">
                  {field.type === 'currency' ? formatCurrency(data?.[field.key] || 0) : data?.[field.key] || 0}
                </span>
              </div>
            ) : (
              <input
                type="number"
                value={data?.[field.key] || ''}
                onChange={(e) => onDataChange?.(field.key, parseFloat(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                placeholder={`请输入${field.label}`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** ---------- 同比环比卡片组件 ---------- */
function GrowthCard({
  title,
  currentValue,
  previousValue,
  type = 'currency'
}: {
  title: string;
  currentValue: number;
  previousValue: number;
  type?: 'currency' | 'percent' | 'number';
}) {
  const growth = previousValue !== 0 ? ((currentValue - previousValue) / previousValue) * 100 : 0;
  const trend = growth > 0 ? 'up' : growth < 0 ? 'down' : 'neutral';

  const trendColors = {
    up: "text-green-600 bg-green-100",
    down: "text-red-600 bg-red-100",
    neutral: "text-gray-600 bg-gray-100"
  };

  const formatValue = (value: number) => {
    if (type === 'currency') return formatCurrency(value);
    if (type === 'percent') return `${value.toFixed(1)}%`;
    return value.toLocaleString();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="text-sm font-medium text-gray-700 mb-2">{title}</div>
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <div className="text-xl font-bold text-gray-900">
            {formatValue(currentValue)}
          </div>
          <div className="text-sm text-gray-500">
            上月: {formatValue(previousValue)}
          </div>
        </div>
        <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${trendColors[trend]}`}>
          {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
          {formatPercent(growth)}
        </div>
      </div>
    </div>
  );
}

/** ---------- 主组件 ---------- */
export default function PerformanceManagement() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // 用户信息 - 改为根据选择动态变化
  const [currentUserInfo, setCurrentUserInfo] = useState({
    name: "张医生",
    department: "心血管内科"
  });

  // 筛选条件
  const [selectedDate, setSelectedDate] = useState(getCurrentMonth());
  const [departments, setDepartments] = useState<Option[]>([]);
  const [doctors, setDoctors] = useState<Option[]>([]);
  const [selectedDeps, setSelectedDeps] = useState<Set<string>>(new Set());
  const [selectedDoctors, setSelectedDoctors] = useState<Set<string>>(new Set());

  // 分页
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // 绩效数据
  const [performanceData, setPerformanceData] = useState({
    // 住院工作量绩效
    inpatientWorkload: {
      nonSurgeryOrderPoints: 0,
      nonSurgeryExecutePoints: 0,
      workloadUnitPrice: 0,
      nonSurgeryPerformance: 0,
      surgeryBasePerformance: 0,
      angiographyPerformance: 0,
      interventionPerformance: 0
    },
    // 自费住院工作量绩效
    selfPayInpatientWorkload: {
      nonSurgeryOrderPoints: 0,
      nonSurgeryExecutePoints: 0,
      workloadUnitPrice: 0,
      nonSurgeryPerformance: 0,
      surgeryBasePerformance: 0,
      angiographyPerformance: 0,
      interventionPerformance: 0
    },
    // DRG绩效
    drgPerformance: {
      diseaseSettlementFee: 0,
      drgDiseaseCost: 0,
      drgBalance: 0,
      drgCoefficient: 0,
      drgPerformance: 0
    },
    // 门诊工作量绩效
    outpatientWorkload: {
      outpatientOrderPoints: 0,
      outpatientExecutePoints: 0,
      workloadUnitPrice: 0,
      outpatientWorkloadPerformance: 0
    },
    // 奖励板块
    reward: {
      outpatientRegistrationFee: 0,
      outpatientConsultationFee: 0,
      threeLevelSurgery: 0,
      fourLevelSurgery: 0,
      qualityRewardAndSubsidy: 0
    },
    // 应发合计
    totalPayable: 0
  });

  // 趋势数据
  const [trendData, setTrendData] = useState<any[]>([]);

  // 更新当前用户信息
  useEffect(() => {
    const updateCurrentUserInfo = () => {
      // 如果选择了医生，使用选择的医生信息
      if (selectedDoctors.size > 0) {
        const selectedDoctorValues = Array.from(selectedDoctors);
        if (selectedDoctorValues.length === 1) {
          const doctor = doctors.find(d => d.value === selectedDoctorValues[0]);
          if (doctor) {
            setCurrentUserInfo(prev => ({
              ...prev,
              name: doctor.label
            }));
          }
        } else {
          setCurrentUserInfo(prev => ({
            ...prev,
            name: `已选${selectedDoctorValues.length}位医生`
          }));
        }
      } else {
        // 默认显示张医生
        setCurrentUserInfo(prev => ({
          ...prev,
          name: "张医生"
        }));
      }

      // 如果选择了科室，使用选择的科室信息
      if (selectedDeps.size > 0) {
        const selectedDepValues = Array.from(selectedDeps);
        if (selectedDepValues.length === 1) {
          const department = departments.find(d => d.value === selectedDepValues[0]);
          if (department) {
            setCurrentUserInfo(prev => ({
              ...prev,
              department: department.label
            }));
          }
        } else {
          setCurrentUserInfo(prev => ({
            ...prev,
            department: `已选${selectedDepValues.length}个科室`
          }));
        }
      } else {
        // 默认显示心血管内科
        setCurrentUserInfo(prev => ({
          ...prev,
          department: "心血管内科"
        }));
      }
    };

    updateCurrentUserInfo();
  }, [selectedDoctors, selectedDeps, doctors, departments]);

  // 辅助函数来计算从数据对象的总绩效
  const calculateTotalPayableFromData = (data: any) => {
    const {
      inpatientWorkload,
      selfPayInpatientWorkload,
      drgPerformance,
      outpatientWorkload,
      reward
    } = data;

    return (
      (inpatientWorkload.nonSurgeryPerformance || 0) +
      (inpatientWorkload.surgeryBasePerformance || 0) +
      (inpatientWorkload.angiographyPerformance || 0) +
      (inpatientWorkload.interventionPerformance || 0) +
      (selfPayInpatientWorkload.nonSurgeryPerformance || 0) +
      (selfPayInpatientWorkload.surgeryBasePerformance || 0) +
      (selfPayInpatientWorkload.angiographyPerformance || 0) +
      (selfPayInpatientWorkload.interventionPerformance || 0) +
      (drgPerformance.drgPerformance || 0) +
      (outpatientWorkload.outpatientWorkloadPerformance || 0) +
      (reward.outpatientRegistrationFee || 0) +
      (reward.outpatientConsultationFee || 0) +
      (reward.threeLevelSurgery || 0) +
      (reward.fourLevelSurgery || 0) +
      (reward.qualityRewardAndSubsidy || 0)
    );
  };

  // 初始化数据
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      try {
        // 模拟API调用延迟
        await simulateApiDelay(800);

        // 使用模拟数据
        setDepartments(mockDepartments);
        setDoctors(mockDoctors);

        // 设置默认选中当前用户所在科室和本人
        setSelectedDeps(new Set(["cardiology"]));
        setSelectedDoctors(new Set(["zhang_san"]));

        // 设置模拟绩效数据
        setPerformanceData(mockPerformanceData);
        setTrendData(mockTrendData);
        setTotalPages(5); // 模拟总页数

      } catch (e: any) {
        setError(e?.message || "数据加载失败");
      } finally {
        setLoading(false);
      }
    };
    initData();
  }, []);

  // 获取绩效数据
  const fetchPerformanceData = async () => {
    try {
      setLoading(true);
      await simulateApiDelay(300);

      // 根据筛选条件返回不同的模拟数据
      let adjustedData = { ...mockPerformanceData };

      // 模拟根据科室和医生筛选调整数据
      if (selectedDeps.size > 0 || selectedDoctors.size > 0) {
        const adjustmentFactor = 0.8 + Math.random() * 0.4; // 0.8-1.2 的随机调整
        Object.keys(adjustedData).forEach(section => {
          if (typeof adjustedData[section] === 'object') {
            Object.keys(adjustedData[section]).forEach(key => {
              if (typeof adjustedData[section][key] === 'number') {
                adjustedData[section][key] = Math.round(adjustedData[section][key] * adjustmentFactor);
              }
            });
          }
        });
      }

      // 重新计算总绩效
      adjustedData.totalPayable = calculateTotalPayableFromData(adjustedData);

      setPerformanceData(adjustedData);
      setTotalPages(5);

    } catch (e: any) {
      setError(e?.message || "获取绩效数据失败");
    } finally {
      setLoading(false);
    }
  };

  // 获取趋势数据
  const fetchTrendData = async () => {
    try {
      await simulateApiDelay(200);
      setTrendData(mockTrendData);
    } catch (e: any) {
      console.error("获取趋势数据失败:", e);
    }
  };

  // 处理数据变更
  const handleDataChange = (section: string, key: string, value: number) => {
    setPerformanceData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
  };

  // 计算应发合计
  const calculateTotalPayable = () => {
    const {
      inpatientWorkload,
      selfPayInpatientWorkload,
      drgPerformance,
      outpatientWorkload,
      reward
    } = performanceData;

    const total =
      (inpatientWorkload.nonSurgeryPerformance || 0) +
      (inpatientWorkload.surgeryBasePerformance || 0) +
      (inpatientWorkload.angiographyPerformance || 0) +
      (inpatientWorkload.interventionPerformance || 0) +
      (selfPayInpatientWorkload.nonSurgeryPerformance || 0) +
      (selfPayInpatientWorkload.surgeryBasePerformance || 0) +
      (selfPayInpatientWorkload.angiographyPerformance || 0) +
      (selfPayInpatientWorkload.interventionPerformance || 0) +
      (drgPerformance.drgPerformance || 0) +
      (outpatientWorkload.outpatientWorkloadPerformance || 0) +
      (reward.outpatientRegistrationFee || 0) +
      (reward.outpatientConsultationFee || 0) +
      (reward.threeLevelSurgery || 0) +
      (reward.fourLevelSurgery || 0) +
      (reward.qualityRewardAndSubsidy || 0);

    return total;
  };

  // 保存数据
  const handleSave = async () => {
    setSaving(true);
    try {
      await simulateApiDelay(600);

      const dataToSave = {
        ...performanceData,
        totalPayable: calculateTotalPayable()
      };

      console.log('保存的数据:', dataToSave); // 在实际应用中会发送到后端

      // 更新本地数据
      setPerformanceData(prev => ({
        ...prev,
        totalPayable: calculateTotalPayable()
      }));

      alert('数据保存成功！');
    } catch (e: any) {
      setError(e?.message || "保存数据失败");
    } finally {
      setSaving(false);
    }
  };

  // 查询数据
  const handleQuery = async () => {
    setLoading(true);
    try {
      await fetchPerformanceData();
    } catch (e: any) {
      setError(e?.message || "查询数据失败");
    } finally {
      setLoading(false);
    }
  };

  // 分页操作
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  // 绩效板块配置 - 修复类型问题
  const performanceSections: PerformanceSectionConfig[] = [
    {
      key: 'inpatientWorkload',
      title: '住院工作量绩效',
      fields: [
        { key: 'nonSurgeryOrderPoints', label: '非手术开单点数', type: 'number' as FieldType },
        { key: 'nonSurgeryExecutePoints', label: '非手术执行点数', type: 'number' as FieldType },
        { key: 'workloadUnitPrice', label: '工作量单价', type: 'currency' as FieldType },
        { key: 'nonSurgeryPerformance', label: '非手术绩效', type: 'currency' as FieldType, calculated: true },
        { key: 'surgeryBasePerformance', label: '手术基础绩效', type: 'currency' as FieldType },
        { key: 'angiographyPerformance', label: '造影绩效', type: 'currency' as FieldType },
        { key: 'interventionPerformance', label: '介入绩效', type: 'currency' as FieldType }
      ]
    },
    {
      key: 'selfPayInpatientWorkload',
      title: '自费住院工作量绩效',
      fields: [
        { key: 'nonSurgeryOrderPoints', label: '非手术开单点数', type: 'number' as FieldType },
        { key: 'nonSurgeryExecutePoints', label: '非手术执行点数', type: 'number' as FieldType },
        { key: 'workloadUnitPrice', label: '工作量单价', type: 'currency' as FieldType },
        { key: 'nonSurgeryPerformance', label: '非手术绩效', type: 'currency' as FieldType, calculated: true },
        { key: 'surgeryBasePerformance', label: '手术基础绩效', type: 'currency' as FieldType },
        { key: 'angiographyPerformance', label: '造影绩效', type: 'currency' as FieldType },
        { key: 'interventionPerformance', label: '介入绩效', type: 'currency' as FieldType }
      ]
    },
    {
      key: 'drgPerformance',
      title: 'DRG绩效',
      fields: [
        { key: 'diseaseSettlementFee', label: '病种结算费用', type: 'currency' as FieldType },
        { key: 'drgDiseaseCost', label: 'DRG病种成本', type: 'currency' as FieldType },
        { key: 'drgBalance', label: 'DRG结余', type: 'currency' as FieldType, calculated: true },
        { key: 'drgCoefficient', label: 'DRG系数', type: 'number' as FieldType },
        { key: 'drgPerformance', label: 'DRG绩效', type: 'currency' as FieldType, calculated: true }
      ]
    },
    {
      key: 'outpatientWorkload',
      title: '门诊工作量绩效',
      fields: [
        { key: 'outpatientOrderPoints', label: '门诊开单点数', type: 'number' as FieldType },
        { key: 'outpatientExecutePoints', label: '门诊执行点数', type: 'number' as FieldType },
        { key: 'workloadUnitPrice', label: '工作量单价', type: 'currency' as FieldType },
        { key: 'outpatientWorkloadPerformance', label: '门诊工作量绩效', type: 'currency' as FieldType, calculated: true }
      ]
    },
    {
      key: 'reward',
      title: '奖励板块',
      fields: [
        { key: 'outpatientRegistrationFee', label: '门诊挂号费', type: 'currency' as FieldType },
        { key: 'outpatientConsultationFee', label: '门诊诊察费', type: 'currency' as FieldType },
        { key: 'threeLevelSurgery', label: '三级手术', type: 'currency' as FieldType },
        { key: 'fourLevelSurgery', label: '四级手术', type: 'currency' as FieldType },
        { key: 'qualityRewardAndSubsidy', label: '质量奖罚与津贴', type: 'currency' as FieldType }
      ]
    }
  ];

  // 获取当前绩效统计信息
  const getPerformanceStats = () => {
    const total = calculateTotalPayable();
    const outpatientCount = performanceData.outpatientWorkload.outpatientOrderPoints;
    const surgeryCount = Math.round(
      (performanceData.inpatientWorkload.surgeryBasePerformance / 1000) +
      (performanceData.selfPayInpatientWorkload.surgeryBasePerformance / 1000)
    );

    return {
      total,
      outpatientCount,
      surgeryCount
    };
  };

  const stats = getPerformanceStats();

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* 顶部导航 - 修改为医生工作量与绩效 */}
      <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <h1 className="text-2xl font-bold text-gray-900">医生工作量与绩效</h1>
            <div className="flex items-center gap-6 mt-2">
              <div className="text-sm text-gray-600">
                <span className="font-medium">当前查看：</span>{currentUserInfo.name} | {currentUserInfo.department}
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  <span>本月总绩效：{formatCurrency(stats.total)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <span>门诊量：{stats.outpatientCount}人次</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                  <span>手术量：{stats.surgeryCount}台</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium text-gray-900">{selectedDate} 数据</div>
              <div className="text-xs text-gray-500">最后更新：今天 14:30</div>
            </div>
            <button className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors duration-200">
              <span className="text-lg">🔔</span>
            </button>
          </div>
        </div>
      </header>

      {/* 筛选区域 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 text-left">数据筛选</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">绩效月份</label>
            <input
              type="month"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
            />
          </div>

          <div className="space-y-2">
            <MultiSelect
              label="科室筛选"
              options={departments}
              selected={selectedDeps}
              onChange={setSelectedDeps}
              placeholder="全部科室"
              searchPlaceholder="搜索科室…"
            />
          </div>

          <div className="space-y-2">
            <MultiSelect
              label="医生筛选"
              options={doctors}
              selected={selectedDoctors}
              onChange={setSelectedDoctors}
              placeholder="全部医生"
              searchPlaceholder="搜索医生…"
            />
          </div>

          <div className="flex items-end gap-2 col-span-3">
            <button
              onClick={handleQuery}
              disabled={loading}
              className="flex-1 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 font-medium flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  查询中...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  查询
                </>
              )}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 font-medium flex items-center justify-center gap-2"
            >
              {saving ? "保存中..." : "保存数据"}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center">
          <span className="text-lg mr-2">⚠️</span>
          {error}
        </div>
      )}

      {/* 同比环比数据 */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <GrowthCard
          title="总绩效环比"
          currentValue={calculateTotalPayable()}
          previousValue={calculateTotalPayable() * 0.95}
          type="currency"
        />
        <GrowthCard
          title="门诊量同比"
          currentValue={performanceData.outpatientWorkload.outpatientOrderPoints}
          previousValue={performanceData.outpatientWorkload.outpatientOrderPoints * 1.1}
          type="number"
        />
        <GrowthCard
          title="手术量环比"
          currentValue={
            (performanceData.inpatientWorkload.surgeryBasePerformance / 1000) +
            (performanceData.selfPayInpatientWorkload.surgeryBasePerformance / 1000)
          }
          previousValue={
            (performanceData.inpatientWorkload.surgeryBasePerformance / 1000) +
            (performanceData.selfPayInpatientWorkload.surgeryBasePerformance / 1000) * 0.98
          }
          type="number"
        />
        <GrowthCard
          title="DRG绩效同比"
          currentValue={performanceData.drgPerformance.drgPerformance}
          previousValue={performanceData.drgPerformance.drgPerformance * 1.05}
          type="currency"
        />
      </section>

      {/* 绩效数据录入区域 */}
      <div className="space-y-6">
        {performanceSections.map((section) => (
          <PerformanceSection
            key={section.key}
            title={section.title}
            fields={section.fields}
            data={performanceData[section.key]}
            onDataChange={(key, value) => handleDataChange(section.key, key, value)}
          />
        ))}
      </div>

      {/* 应发合计 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 text-left">应发合计</h2>
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            所有绩效板块与奖励板块的金额汇总
          </div>
          <div className="text-3xl font-bold text-green-600">
            {formatCurrency(calculateTotalPayable())}
          </div>
        </div>
      </section>

      {/* 趋势分析图表 - 使用折线图 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 text-left">绩效趋势分析</h2>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-gray-700">近12个月绩效趋势</div>
            <div className="flex gap-4 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-blue-500"></span>
                总绩效
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-green-500"></span>
                门诊量
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-purple-500"></span>
                手术量
              </span>
            </div>
          </div>
          <LineChart data={mockTrendData} />
        </div>
      </section>

      {/* 分页导航 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            第 {currentPage} 页，共 {totalPages} 页
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handlePageChange(1)}
              disabled={currentPage === 1}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
            >
              &lt;&lt;
            </button>
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
            >
              &lt;
            </button>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
            >
              &gt;
            </button>
            <button
              onClick={() => handlePageChange(totalPages)}
              disabled={currentPage === totalPages}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
            >
              &gt;&gt;
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}