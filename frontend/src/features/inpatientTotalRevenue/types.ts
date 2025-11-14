// src/features/inpatientTotalRevenue/types.ts
// 住院收入页面相关的类型定义 & re-export

import type {
  DepartmentOption,
  DoctorOption,
  DetailsRow,
  TSRow,
  SummaryViewModel,
} from "../../services/inpatientTotalRevenueApi";

// 直接透出 API 层的一些类型，方便页面内部统一引用
export type {
  DepartmentOption,
  DoctorOption,
  DetailsRow,
  TSRow,
  SummaryViewModel,
};

// UI 层使用的医生类型：在原 DoctorOption 基础上，补充科室信息
export type UIDoctorOption = DoctorOption & {
  dep_code: string;
  dep_name: string;
  perf_dep_name: string;
};
