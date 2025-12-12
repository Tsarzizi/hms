import { useEffect, useMemo, useState } from "react";

const API_BASE = "/api/doctor_workload_performance";

/** ---------- 工具函数 ---------- */
function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatCurrency(amount: number) {
  if (!amount) return "￥0";
  return `￥${amount.toLocaleString()}`;
}

function formatPercent(value: number) {
  if (value === undefined || value === null) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

type Option = { value: string; label: string };
type FieldType = "number" | "text" | "currency";

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

/** ---------- 错误提示组件 ---------- */
function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <div className="flex items-center">
        <div className="text-red-600 mr-3">⚠️</div>
        <div className="text-red-800">
          <p className="font-medium">请求失败</p>
          <p className="text-sm mt-1">{message}</p>
        </div>
      </div>
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
      ? options.find((o) => o.value === Array.from(selected)[0])?.label ??
        placeholder
      : `已选 ${selected.size} 项`;

  return (
    <div className="w-full text-left relative">
      <label className="text-sm font-medium text-gray-700 mb-2 block">
        {label}
      </label>
      <button
        type="button"
        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 bg-white flex items-center justify-between hover:border-blue-500 transition-colors duration-200 shadow-sm"
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className={`truncate ${
            selected.size ? "text-gray-900" : "text-gray-500"
          }`}
        >
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
              <div className="px-4 py-6 text-gray-400 text-center">
                无匹配项
              </div>
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
                  <span
                    className="text-sm text-gray-700 truncate"
                    title={`${o.label}（${o.value}）`}
                  >
                    {o.label}{" "}
                    <span className="text-gray-400">（{o.value}）</span>
                  </span>
                </label>
              ))
            )}
          </div>
          <div className="p-4 border-t border-gray-100 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-gray-500">
                共 {filtered.length} 项，已选 {selected.size} 项
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-white transition-colors duration-150 whitespace-nowrap"
                onClick={clear}
              >
                清空
              </button>
              <button
                type="button"
                className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-150 whitespace-nowrap"
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

/** ---------- 绩效板块组件（只读） ---------- */
function PerformanceSection({
  title,
  fields,
  data,
  readonly = false,
}: {
  title: string;
  fields: PerformanceField[];
  data: any;
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
              {field.unit && (
                <span className="text-gray-500 ml-1">({field.unit})</span>
              )}
            </label>
            {/* 只读显示框 */}
            <div className="w-full border border-gray-300 rounded-lg px-3 py-2.5 bg-gray-50">
              <span className="text-gray-900">
                {field.type === "currency"
                  ? formatCurrency(data?.[field.key] || 0)
                  : data?.[field.key] || 0}
              </span>
            </div>
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
  type = "currency",
}: {
  title: string;
  currentValue: number;
  previousValue: number;
  type?: "currency" | "percent" | "number";
}) {
  const growth =
    previousValue !== 0
      ? ((currentValue - previousValue) / previousValue) * 100
      : 0;
  const trend = growth > 0 ? "up" : growth < 0 ? "down" : "neutral";

  const trendColors = {
    up: "text-green-600 bg-green-100",
    down: "text-red-600 bg-red-100",
    neutral: "text-gray-600 bg-gray-100",
  };

  const formatValue = (value: number) => {
    if (type === "currency") return formatCurrency(value);
    if (type === "percent") return `${value.toFixed(1)}%`;
    return value.toLocaleString();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <div
          className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${trendColors[trend]}`}
        >
          {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
          {formatPercent(growth)}
        </div>
      </div>
      <div className="space-y-3">
        <div className="text-2xl font-bold text-gray-900">
          {formatValue(currentValue)}
        </div>
        <div className="text-sm text-gray-500">
          上月: {formatValue(previousValue)}
        </div>
      </div>
    </div>
  );
}

/** ---------- 折线图组件（总绩效 + 门诊绩效 + 手术绩效） ---------- */
function LineChart({ data }: { data: any[] }) {
  const chartHeight = 200;
  const chartWidth = 1000;

  if (!data || data.length === 0) {
    return (
      <div className="overflow-x-auto">
        <div className="w-full h-[230px] flex items-center justify-center bg-gray-50 rounded-lg">
          <div className="text-center">
            <div className="text-6xl text-gray-300 mb-4">📊</div>
            <p className="text-gray-500 mb-2 text-lg">暂无趋势数据</p>
            <p className="text-gray-400">
              请选择日期范围并点击查询按钮加载数据
            </p>
          </div>
        </div>
      </div>
    );
  }

  const maxPerformance = Math.max(
    ...data.map((d) => d.performance || 0),
    1
  );
  const maxOutpatient = Math.max(...data.map((d) => d.outpatient || 0), 0);
  const maxSurgery = Math.max(...data.map((d) => d.surgery || 0), 0);
  const maxY = Math.max(maxPerformance, maxOutpatient, maxSurgery, 1);

  const len = Math.max(data.length, 1);

  const getX = (index: number) => {
    if (len === 1) return chartWidth / 2;
    return (index / (len - 1)) * chartWidth;
  };

  const getY = (value: number) => {
    return chartHeight - (value / maxY) * chartHeight;
  };

  // 折线：总绩效
  const performancePath = data
    .map((item, index) => {
      const x = getX(index);
      const y = getY(item.performance || 0);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  const performancePoints = data.map((item, index) => {
    const x = getX(index);
    const y = getY(item.performance || 0);
    return (
      <g key={`perf-${index}`}>
        <circle
          cx={x}
          cy={y}
          r="3"
          fill="#3b82f6"
          className="hover:r-4 transition-all duration-200"
        />
        <title>
          {item.month}: 总绩效 {formatCurrency(item.performance || 0)}
        </title>
      </g>
    );
  });

  // 折线：门诊绩效
  const outpatientPath = data
    .map((item, index) => {
      const x = getX(index);
      const y = getY(item.outpatient || 0);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  const outpatientPoints = data.map((item, index) => {
    const x = getX(index);
    const y = getY(item.outpatient || 0);
    return (
      <g key={`outp-${index}`}>
        <circle
          cx={x}
          cy={y}
          r="3"
          fill="#10b981"
          className="hover:r-4 transition-all duration-200"
        />
        <title>
          {item.month}: 门诊绩效 {formatCurrency(item.outpatient || 0)}
        </title>
      </g>
    );
  });

  // 折线：手术绩效
  const surgeryPath = data
    .map((item, index) => {
      const x = getX(index);
      const y = getY(item.surgery || 0);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  const surgeryPoints = data.map((item, index) => {
    const x = getX(index);
    const y = getY(item.surgery || 0);
    return (
      <g key={`surg-${index}`}>
        <circle
          cx={x}
          cy={y}
          r="3"
          fill="#8b5cf6"
          className="hover:r-4 transition-all duration-200"
        />
        <title>
          {item.month}: 手术绩效 {formatCurrency(item.surgery || 0)}
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
        {/* 网格 */}
        <defs>
          <pattern
            id="grid"
            width="50"
            height="50"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 50 0 L 0 0 0 50"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height={chartHeight} fill="url(#grid)" />

        {/* Y轴（按最大值标记，总绩效 / 门诊绩效 / 手术绩效同一坐标） */}
        <text x="10" y="15" fontSize="10" fill="#6b7280">
          ￥{maxY.toLocaleString()}
        </text>
        <text x="10" y={chartHeight / 2} fontSize="10" fill="#6b7280">
          ￥{(maxY / 2).toLocaleString()}
        </text>
        <text x="10" y={chartHeight - 5} fontSize="10" fill="#6b7280">
          ￥0
        </text>

        {/* 折线：总绩效 */}
        <path
          d={performancePath}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          className="drop-shadow-sm"
        />
        {performancePoints}

        {/* 折线：门诊绩效 */}
        <path
          d={outpatientPath}
          fill="none"
          stroke="#10b981"
          strokeWidth="2"
          className="drop-shadow-sm"
        />
        {outpatientPoints}

        {/* 折线：手术绩效 */}
        <path
          d={surgeryPath}
          fill="none"
          stroke="#8b5cf6"
          strokeWidth="2"
          className="drop-shadow-sm"
        />
        {surgeryPoints}

        {/* X轴月份 */}
        {data.map((item, index) => {
          const x = getX(index);
          return (
            <text
              key={item.month}
              x={x}
              y={chartHeight + 20}
              fontSize="10"
              fill="#6b7280"
              textAnchor="middle"
            >
              {item.month?.split("-")[1]}月
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/** ---------- 主组件：医生工作量与绩效 ---------- */
export default function DoctorWorkloadPerformance() {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const [currentUserInfo, setCurrentUserInfo] = useState({
    name: "张医生",
    department: "心血管内科",
  });

  const [selectedDate, setSelectedDate] = useState(getCurrentMonth());
  const [departments, setDepartments] = useState<Option[]>([]);
  const [doctors, setDoctors] = useState<Option[]>([]);
  const [selectedDeps, setSelectedDeps] = useState<Set<string>>(new Set());
  const [selectedDoctors, setSelectedDoctors] = useState<Set<string>>(
    new Set()
  );

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages] = useState(1);

  const [performanceData, setPerformanceData] = useState({
    inpatientWorkload: {
      nonSurgeryOrderPoints: 0,
      nonSurgeryExecutePoints: 0,
      workloadUnitPrice: 0,
      nonSurgeryPerformance: 0,
      surgeryBasePerformance: 0,
      angiographyPerformance: 0,
      interventionPerformance: 0,
    },
    selfPayInpatientWorkload: {
      nonSurgeryOrderPoints: 0,
      nonSurgeryExecutePoints: 0,
      workloadUnitPrice: 0,
      nonSurgeryPerformance: 0,
      surgeryBasePerformance: 0,
      angiographyPerformance: 0,
      interventionPerformance: 0,
    },
    drgPerformance: {
      diseaseSettlementFee: 0,
      drgDiseaseCost: 0,
      drgBalance: 0,
      drgCoefficient: 0,
      drgPerformance: 0,
    },
    outpatientWorkload: {
      outpatientOrderPoints: 0,
      outpatientExecutePoints: 0,
      workloadUnitPrice: 0,
      outpatientWorkloadPerformance: 0,
    },
    reward: {
      outpatientRegistrationFee: 0,
      outpatientConsultationFee: 0,
      threeLevelSurgery: 0,
      fourLevelSurgery: 0,
      qualityRewardAndSubsidy: 0,
    },
    totalPayable: 0,
  });

  const [trendData, setTrendData] = useState<any[]>([]);

  const calculateTotalPayableFromData = (data: typeof performanceData) => {
    const {
      inpatientWorkload,
      selfPayInpatientWorkload,
      drgPerformance,
      outpatientWorkload,
      reward,
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

  // 初始化
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API_BASE}/options`);
        if (!res.ok) throw new Error(`获取筛选项失败：${res.status}`);
        const json = await res.json();
        const deptOptions: Option[] = json.departments || [];
        const doctorOptions: Option[] = json.doctors || [];
        setDepartments(deptOptions);
        setDoctors(doctorOptions);

        const depSet =
          deptOptions.length > 0
            ? new Set<string>([deptOptions[0].value])
            : new Set<string>();
        const docSet =
          doctorOptions.length > 0
            ? new Set<string>([doctorOptions[0].value])
            : new Set<string>();
        setSelectedDeps(depSet);
        setSelectedDoctors(docSet);

        await Promise.all([
          fetchPerformanceData({
            month: selectedDate,
            depSet,
            doctorSet: docSet,
          }),
          fetchTrendData({ depSet, doctorSet: docSet }),
        ]);
      } catch (e: any) {
        setError(e?.message || "初始化失败");
      } finally {
        setLoading(false);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 更新当前用户信息
  useEffect(() => {
    const updateCurrentUserInfo = () => {
      if (selectedDoctors.size > 0) {
        const values = Array.from(selectedDoctors);
        if (values.length === 1) {
          const doctor = doctors.find((d) => d.value === values[0]);
          if (doctor) {
            setCurrentUserInfo((prev) => ({
              ...prev,
              name: doctor.label,
            }));
          }
        } else {
          setCurrentUserInfo((prev) => ({
            ...prev,
            name: `已选${values.length}位医生`,
          }));
        }
      } else {
        setCurrentUserInfo((prev) => ({ ...prev, name: "张医生" }));
      }

      if (selectedDeps.size > 0) {
        const values = Array.from(selectedDeps);
        if (values.length === 1) {
          const dep = departments.find((d) => d.value === values[0]);
          if (dep) {
            setCurrentUserInfo((prev) => ({
              ...prev,
              department: dep.label,
            }));
          }
        } else {
          setCurrentUserInfo((prev) => ({
            ...prev,
            department: `已选${values.length}个科室`,
          }));
        }
      } else {
        setCurrentUserInfo((prev) => ({
          ...prev,
          department: "心血管内科",
        }));
      }
    };

    updateCurrentUserInfo();
  }, [selectedDoctors, selectedDeps, doctors, departments]);

  const buildLast12Months = (endMonth?: string) => {
    let year: number;
    let month: number;
    if (endMonth) {
      const [y, m] = endMonth.split("-");
      year = parseInt(y, 10);
      month = parseInt(m, 10);
    } else {
      const [y, m] = getCurrentMonth().split("-");
      year = parseInt(y, 10);
      month = parseInt(m, 10);
    }

    const list: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0"
      )}`;
      list.push(ym);
    }
    return list;
  };

  const fetchPerformanceData = async (opts?: {
    month?: string;
    depSet?: Set<string>;
    doctorSet?: Set<string>;
  }) => {
    const month = opts?.month ?? selectedDate;
    const depSet = opts?.depSet ?? selectedDeps;
    const doctorSet = opts?.doctorSet ?? selectedDoctors;

    try {
      const params = new URLSearchParams();
      if (month) params.append("month", month);
      if (depSet.size > 0)
        params.append("dep_ids", Array.from(depSet).join(","));
      if (doctorSet.size > 0)
        params.append("doctor_ids", Array.from(doctorSet).join(","));

      const res = await fetch(`${API_BASE}/summary?${params.toString()}`);
      if (!res.ok) throw new Error(`获取绩效数据失败：${res.status}`);
      const json = await res.json();
      const data = json.performanceData || json;

      const totalPayable = calculateTotalPayableFromData(data);
      data.totalPayable = totalPayable;
      setPerformanceData(data);
    } catch (e: any) {
      setError(e?.message || "获取绩效数据失败");
    }
  };

  const fetchTrendData = async (opts?: {
    depSet?: Set<string>;
    doctorSet?: Set<string>;
  }) => {
    const depSet = opts?.depSet ?? selectedDeps;
    const doctorSet = opts?.doctorSet ?? selectedDoctors;

    try {
      const params = new URLSearchParams();
      params.append("months", "12");
      if (depSet.size > 0)
        params.append("dep_ids", Array.from(depSet).join(","));
      if (doctorSet.size > 0)
        params.append("doctor_ids", Array.from(doctorSet).join(","));

      const res = await fetch(`${API_BASE}/trend?${params.toString()}`);
      if (!res.ok) throw new Error(`获取趋势数据失败：${res.status}`);
      const raw = (await res.json()) as any[];

      if (!raw || raw.length === 0) {
        const months = buildLast12Months();
        setTrendData(
          months.map((m) => ({
            month: m,
            performance: 0,
            outpatient: 0,
            surgery: 0,
          }))
        );
        return;
      }

      const latestMonth = raw.reduce(
        (max, item) => (item.month > max ? item.month : max),
        raw[0].month
      );
      const months = buildLast12Months(latestMonth);

      const map = new Map<string, any>();
      raw.forEach((item) => {
        map.set(item.month, item);
      });

      const filled = months.map((m) => {
        const v = map.get(m);
        return {
          month: m,
          performance: v?.performance || 0,
          outpatient: v?.outpatient || 0,
          surgery: v?.surgery || 0,
        };
      });

      setTrendData(filled);
    } catch (e: any) {
      setError(e?.message || "获取趋势数据失败");
    }
  };

  const handleQuery = async () => {
    setLoading(true);
    setError("");
    try {
      await Promise.all([fetchPerformanceData(), fetchTrendData()]);
    } catch (e: any) {
      setError(e?.message || "查询失败");
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const params = new URLSearchParams();
      if (selectedDate) params.append("month", selectedDate);
      if (selectedDeps.size > 0)
        params.append("dep_ids", Array.from(selectedDeps).join(","));
      if (selectedDoctors.size > 0)
        params.append("doctor_ids", Array.from(selectedDoctors).join(","));

      const res = await fetch(`${API_BASE}/export?${params.toString()}`, {
        method: "GET",
      });
      if (!res.ok) throw new Error(`导出失败：${res.status}`);

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `医生工作量绩效_${selectedDate || "全部"}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message || "导出失败");
    } finally {
      setExporting(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) setCurrentPage(newPage);
  };

  const performanceSections: PerformanceSectionConfig[] = [
    {
      key: "inpatientWorkload",
      title: "住院工作量绩效",
      fields: [
        { key: "nonSurgeryOrderPoints", label: "非手术开单点数", type: "number" },
        {
          key: "nonSurgeryExecutePoints",
          label: "非手术执行点数",
          type: "number",
        },
        { key: "workloadUnitPrice", label: "工作量单价", type: "currency" },
        {
          key: "nonSurgeryPerformance",
          label: "非手术绩效",
          type: "currency",
          calculated: true,
        },
        {
          key: "surgeryBasePerformance",
          label: "手术基础绩效",
          type: "currency",
        },
        {
          key: "angiographyPerformance",
          label: "造影绩效",
          type: "currency",
        },
        {
          key: "interventionPerformance",
          label: "介入绩效",
          type: "currency",
        },
      ],
    },
    {
      key: "selfPayInpatientWorkload",
      title: "自费住院工作量绩效",
      fields: [
        { key: "nonSurgeryOrderPoints", label: "非手术开单点数", type: "number" },
        {
          key: "nonSurgeryExecutePoints",
          label: "非手术执行点数",
          type: "number",
        },
        { key: "workloadUnitPrice", label: "工作量单价", type: "currency" },
        {
          key: "nonSurgeryPerformance",
          label: "非手术绩效",
          type: "currency",
          calculated: true,
        },
        {
          key: "surgeryBasePerformance",
          label: "手术基础绩效",
          type: "currency",
        },
        {
          key: "angiographyPerformance",
          label: "造影绩效",
          type: "currency",
        },
        {
          key: "interventionPerformance",
          label: "介入绩效",
          type: "currency",
        },
      ],
    },
    {
      key: "drgPerformance",
      title: "DRG绩效",
      fields: [
        {
          key: "diseaseSettlementFee",
          label: "病种结算费用",
          type: "currency",
        },
        { key: "drgDiseaseCost", label: "DRG病种成本", type: "currency" },
        { key: "drgBalance", label: "DRG结余", type: "currency" },
        { key: "drgCoefficient", label: "DRG系数", type: "number" },
        { key: "drgPerformance", label: "DRG绩效", type: "currency" },
      ],
    },
    {
      key: "outpatientWorkload",
      title: "门诊工作量绩效",
      fields: [
        {
          key: "outpatientOrderPoints",
          label: "门诊开单点数",
          type: "number",
        },
        {
          key: "outpatientExecutePoints",
          label: "门诊执行点数",
          type: "number",
        },
        { key: "workloadUnitPrice", label: "工作量单价", type: "currency" },
        {
          key: "outpatientWorkloadPerformance",
          label: "门诊工作量绩效",
          type: "currency",
          calculated: true,
        },
      ],
    },
    {
      key: "reward",
      title: "奖励板块",
      fields: [
        {
          key: "outpatientRegistrationFee",
          label: "门诊挂号费",
          type: "currency",
        },
        {
          key: "outpatientConsultationFee",
          label: "门诊诊察费",
          type: "currency",
        },
        { key: "threeLevelSurgery", label: "三级手术", type: "currency" },
        { key: "fourLevelSurgery", label: "四级手术", type: "currency" },
        {
          key: "qualityRewardAndSubsidy",
          label: "质量奖罚与津贴",
          type: "currency",
        },
      ],
    },
  ];

  const calculateTotalPayable = () =>
    calculateTotalPayableFromData(performanceData);

  const getPerformanceStats = () => {
    const total = calculateTotalPayable();
    const outpatientCount =
      performanceData.outpatientWorkload.outpatientOrderPoints;
    const surgeryCount = Math.round(
      performanceData.inpatientWorkload.surgeryBasePerformance / 1000 +
        performanceData.selfPayInpatientWorkload.surgeryBasePerformance / 1000
    );
    return { total, outpatientCount, surgeryCount };
  };

  const stats = getPerformanceStats();

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* 页面标题 */}
      <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <h1 className="text-2xl font-bold text-gray-900">
              医生工作量与绩效
            </h1>
            <p className="text-gray-600 text-sm mt-2">
              详细分析医生工作量与绩效的各项指标，包括住院工作量、门诊工作量、DRG绩效等关键数据
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-medium text-gray-900">
                {selectedDate} 数据
              </div>
              <div className="text-xs text-gray-500">最后更新：系统当前</div>
            </div>
            <button className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors duration-200">
              <span className="text-lg">📊</span>
            </button>
          </div>
        </div>
      </header>

      {/* 错误提示 */}
      {error && <ErrorAlert message={error} />}

      {/* 筛选区域 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 text-left">数据筛选</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">
              绩效月份
            </label>
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
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  查询中...
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  查询
                </>
              )}
            </button>
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="flex-1 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 font-medium flex items-center justify-center gap-2"
            >
              {exporting ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  导出中...
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  导出Excel
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* 同比环比卡片 */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <GrowthCard
          title="总绩效环比"
          currentValue={calculateTotalPayable()}
          previousValue={calculateTotalPayable() * 0.95}
          type="currency"
        />
        <GrowthCard
          title="门诊量同比"
          currentValue={
            performanceData.outpatientWorkload.outpatientOrderPoints
          }
          previousValue={
            performanceData.outpatientWorkload.outpatientOrderPoints * 1.1
          }
          type="number"
        />
        <GrowthCard
          title="手术量环比"
          currentValue={
            performanceData.inpatientWorkload.surgeryBasePerformance / 1000 +
            performanceData.selfPayInpatientWorkload.surgeryBasePerformance /
              1000
          }
          previousValue={
            performanceData.inpatientWorkload.surgeryBasePerformance / 1000 +
            (performanceData.selfPayInpatientWorkload.surgeryBasePerformance /
              1000) *
              0.98
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

      {/* 绩效板块 */}
      <div className="space-y-6">
        {performanceSections.map((section) => (
          <PerformanceSection
            key={section.key}
            title={section.title}
            fields={section.fields}
            data={performanceData[section.key as keyof typeof performanceData]}
            readonly={true}
          />
        ))}
      </div>

      {/* 应发合计 */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 text-left">
          应发合计
        </h2>
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            所有绩效板块与奖励板块的金额汇总
          </div>
          <div className="text-3xl font-bold text-green-600">
            {formatCurrency(calculateTotalPayable())}
          </div>
        </div>
      </section>

      {/* 趋势分析（总绩效 + 门诊绩效 + 手术绩效） */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 text-left">
          绩效趋势分析
        </h2>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-gray-700">
              近12个月绩效趋势
            </div>
            <div className="flex gap-4 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-blue-500"></span>
                总绩效（折线）
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-green-500"></span>
                门诊绩效（折线）
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-purple-500"></span>
                手术绩效（折线）
              </span>
            </div>
          </div>
          <LineChart data={trendData} />
        </div>
      </section>

      {/* 分页 */}
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