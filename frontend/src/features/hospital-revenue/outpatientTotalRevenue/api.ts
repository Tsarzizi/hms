// src/api/outpatientTotalRevenue.ts
// 门急诊总收入接口封装，对应后端 /api/outpatient-total-revenue

export interface OutpatientDepartment {
  code: string;
  name: string;
}

export interface OutpatientDoctor {
  doc_id: string;
  doc_name: string;
  dep_id: string;
  dep_name: string;
}

export interface OutpatientInitResponse {
  success: boolean;
  date: string;
  departments: OutpatientDepartment[];
  doctors: OutpatientDoctor[];
}

export interface OutpatientQueryParams {
  startDate: string;        // '2025-11-10'
  endDate?: string;         // '2025-11-14' 可选
  departments?: string[];   // 绩效科室名称列表
  doctors?: string[];       // 医生工号列表
}

export interface OutpatientSummary {
  current: number;
  growth_rate: number | null;        // 同比
  mom_growth_rate: number | null;    // 环比
  bed_growth_rate: number | null;
  bed_mom_growth_rate: number | null;
  current_bed_days: number;
}

export interface OutpatientTimeseriesPoint {
  date: string;               // '2025-11-10'
  revenue: number;            // 当日收入
  last_year: number | null;   // 去年同期收入
  yoy_pct: number | null;     // 当天同比
  mom_pct: number | null;     // 当天环比（相邻天）
  bed_yoy_pct: number | null;
  bed_mom_pct: number | null;
}

export interface OutpatientDetailRow {
  // 注意：医生模式 & 科室模式字段略有不同，这里用可选字段
  date: string;                 // 日期
  department_code?: string;
  department_name?: string;
  doctor_id?: string;
  doctor_name?: string;
  item_class_name?: string;
  revenue?: number;
  cost?: number;
  quantity?: number;
}

export interface OutpatientQueryResponse {
  success: boolean;
  date_range: {
    start: string;
    end: string;
  };
  departments?: string[] | null;
  doctors?: string[] | null;
  summary: OutpatientSummary;
  timeseries: OutpatientTimeseriesPoint[];
  details: OutpatientDetailRow[];
  total: number;
}

// ========== 实际请求函数 ==========

const BASE_URL = "/api/outpatient-total-revenue";

export async function fetchOutpatientInit(): Promise<OutpatientInitResponse> {
  const res = await fetch(`${BASE_URL}/init`);
  if (!res.ok) {
    throw new Error(`获取门急诊初始化数据失败：${res.status}`);
  }
  const data = (await res.json()) as OutpatientInitResponse;
  if (!data.success) {
    throw new Error("获取门急诊初始化数据失败（success = false）");
  }
  return data;
}

export async function fetchOutpatientRevenue(
  params: OutpatientQueryParams,
): Promise<OutpatientQueryResponse> {
  const payload: any = {
    start_date: params.startDate,
  };
  if (params.endDate) payload.end_date = params.endDate;
  if (params.departments && params.departments.length > 0) {
    payload.departments = params.departments;
  }
  if (params.doctors && params.doctors.length > 0) {
    payload.doctors = params.doctors;
  }

  const res = await fetch(`${BASE_URL}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`查询门急诊总收入失败：${res.status}`);
  }

  const data = (await res.json()) as OutpatientQueryResponse;
  if (!data.success) {
    throw new Error(data && (data as any).error ? (data as any).error : "查询门急诊总收入失败（success = false）");
  }
  return data;
}
