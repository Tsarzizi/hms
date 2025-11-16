// src/features/outpatientTotalRevenue/types.ts

export type SortDir = "asc" | "desc";
export type SortKey =
  | "date"
  | "department_name"
  | "doctor_name"
  | "item_class_name"
  | "revenue"
  | "quantity";

export type CompareMode = "none" | "yoy" | "mom";

export interface DepartmentOption {
  code: string;
  name: string;
}

export interface DoctorOption {
  doc_id: string;
  doc_name: string;
  dep_id: string;
  dep_name: string;
}

export interface Summary {
  current: number;
  growth_rate: number | null;
  mom_growth_rate: number | null;
  bed_growth_rate: number | null;
  bed_mom_growth_rate: number | null;
  current_bed_days: number;
}

export interface TimeseriesRow {
  date: string;
  revenue: number;
  last_year: number | null;
  yoy_pct: number | null;
  mom_pct: number | null;
  bed_yoy_pct: number | null;
  bed_mom_pct: number | null;
}

export interface DetailRow {
  date: string;
  department_code?: string | null;
  department_name?: string | null;
  doctor_id?: string | null;
  doctor_name?: string | null;
  item_class_name?: string | null;
  revenue?: number | null;
  cost?: number | null;
  quantity?: number | null;
}

export interface InitResponse {
  success: boolean;
  date: string;
  departments: DepartmentOption[];
  doctors: DoctorOption[];
}

export interface QueryResponse {
  success: boolean;
  date_range: {
    start: string;
    end: string;
  };
  departments?: string[] | null;
  doctors?: string[] | null;
  summary: Summary;
  timeseries: TimeseriesRow[];
  details: DetailRow[];
  total: number;
}
export const PAGE_HEADER_CONFIG = {
  title: "门急诊总收入分析",
  subtitle: "按科室与医生查看门急诊总收入、同比/环比以及床日趋势",
};