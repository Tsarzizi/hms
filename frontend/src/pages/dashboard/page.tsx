import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from '../../components/base/Sidebar';
import DataCard from '../../components/base/DataCard';

import OutpatientVisits from '../OutpatientVisits';
import OutpatientAppointment from '../outpatient-appointment';
import TcmService from '../tcm-service.tsx';
import FollowUpService from '../follow-up.tsx';
import SpecialClinic from '../special-clinic.tsx';
import PrescriptionManagement from '../prescription-management.tsx';

import AdmissionDischarge from '../AdmissionDischarge.tsx';
import AdmissionPathway from '../admission-pathway.tsx';
import EmergencyAdmission from '../emergency-admission.tsx';
import DiseaseComposition from '../disease-composition.tsx';

// import TransferPatients from '../../../medical-services/referral/transfer-service.tsx';
// import ReferralDiseaseRanking from '../../../medical-services/referral/disease-ranking.tsx';
// import DepartmentTransferStatistics from '../../../medical-services/referral/department-transfer.tsx';

// import HealthExamination from '../../../medical-services/physical-exam/physical-exam.tsx';

// import AdverseEventsCount from '../../../medical-quality/patient-safety/adverse-events-count.tsx';
// import AdverseEventsRate from '../../../medical-quality/patient-safety/adverse-events-rate.tsx';

// import DiagnosisRanks from '../../../medical-quality/diagnosis-quality/diagnosis-ranking.tsx';
// import DiagnosisComplianceRate from '../../../medical-quality/diagnosis-quality/diagnosis-coincidence-rate.tsx';

// import ExaminationCount from '../../../medical-quality/medical-tech-quality/examination-count.tsx';
// import PositiveRates from '../../../medical-quality/medical-tech-quality/positive-rate.tsx';
// import ReportEfficiency from '../../../medical-quality/medical-tech-quality/report-efficiency.tsx';

// import SurgeryCount from '../../../medical-quality/surgery-quality/surgery-count.tsx';
// import SurgerySafety from '../../../medical-quality/surgery-quality/surgery-safety.tsx';
// import SurgeryLevel from '../../../medical-quality/surgery-quality/surgery-level.tsx';
// import SurgeonMain from '../../../medical-quality/surgery-quality/surgeon-main.tsx';
// import DepartmentSurgery from '../../../medical-quality/surgery-quality/department-surgery.tsx';

// import AnesthesiaCount from '../../../medical-quality/anesthesia-quality/anesthesia-count.tsx';
// import AnesthesiaMethodRatio from '../../../medical-quality/anesthesia-quality/anesthesia-method-ratio.tsx';

// import PathwayCount from '../../../medical-quality/clinical-pathway/pathway-count.tsx';
// import PathwayManagement from '../../../medical-quality/clinical-pathway/pathway-management.tsx';

// import KeyDiseaseHospitalization from '../../../medical-quality/key-disease/key-disease-hospitalization.tsx';
// import KeyDiseaseMortality from '../../../medical-quality/key-disease/key-disease-mortality.tsx';
// import KeyDiseaseReadmission from '../../../medical-quality/key-disease/key-disease-readmission.tsx';

import DRGCount from '../DRGCount';
import DRGCost from '../DRGCost';
import DRGEfficiency from '../DRGEfficiency';

// import InfectionCountAnalysis from '../../../medical-quality/hospital-infection/infection-count-analysis.tsx';
// import InfectionRateAnalysis from '../../../medical-quality/hospital-infection/infection-rate-analysis.tsx';
// import RiskFactorAnalysis from '../../../medical-quality/hospital-infection/risk-factor-analysis.tsx';
// import InfectionSiteAnalysis from '../../../medical-quality/hospital-infection/infection-site-analysis.tsx';

// import AccidentType from '../../../medical-quality/medical-accident/accident-type.tsx';

// import EmergencyMortality from '../../../medical-quality/mortality-analysis/emergency-mortality.tsx';
// import InpatientMortality from '../../../medical-quality/mortality-analysis/inpatient-mortality.tsx';
// import NewbornMortality from '../../../medical-quality/mortality-analysis/newborn-mortality.tsx';
// import SurgeryMortality from '../../../medical-quality/mortality-analysis/surgery-mortality.tsx';

// import BloodManagement from '../../../blood-management/blood-product-count.tsx';
// import BloodAdverseReaction from '../../../blood-management/blood-adverse-reaction.tsx';

// import IncomeExpenseAnalysis from '../../../financial-management/income-expense-analysis.tsx';
// import AccountsReceivable from '../../../financial-management/accounts-receivable.tsx';
// import AssetAnalysis from '../../../financial-management/asset-analysis.tsx';

import OutpatientAvgCost from '../OutpatientAvgCost';
import OutpatientCostAnalysis from '../OutpatientCostAnalysis.tsx';

import OutpatientAvgDrugCost from '../OutpatientAvgDrugCost.tsx';
import OutpatientDrugCostAnalysis from '../OutpatientDrugCostAnalysis.tsx';

import InpatientCostOverall from '../InpatientCostOverall.tsx';
import InpatientAverageCostRatio from '../InpatientAvgCostRatio.tsx';
import AverageBedDayCost from '../AvgBedDayCost.tsx';

import OutpatientInsuranceOverall from '../outpatient-insurance-overall.tsx';
import InsurancePatientTotalCost from '../insurance-patient-total-cost.tsx';
import InsurancePatientVisits from '../insurance-patient-visits.tsx';
import InsurancePatientCost from '../insurance-patient-cost.tsx';

import InpatientInsurancePatients from '../inpatient-insurance-patients.tsx';

// import StaffStructure from '../../../medical-resources/medical-staff/staff-structure.tsx';
// import StaffTotalCount from '../../../medical-resources/medical-staff/staff-total-count.tsx';
// import GrowthRate from '../../../medical-resources/medical-staff/staff-growth-rate.tsx';

// import BedsTotalCount from '../../../medical-resources/hospital-beds/beds-total-count.tsx';
// import BedsDepartmentStructure from '../../../medical-resources/hospital-beds/beds-department-structure.tsx';
// import BedsGrowthRate from '../../../medical-resources/hospital-beds/beds-growth-rate.tsx';

// import StaffBedRatio from '../../../medical-resources/resource-allocation/staff-bed-ratio.tsx';
// import DepartmentStructure from '../../../medical-resources/resource-allocation/department-structure.tsx';

// import GeneralFixedAssets from '../../../medical-resources/fixed-assets/general-fixed-assets.tsx';
// import MedicalEquipmentManagement from '../../../medical-resources/fixed-assets/medical-equipment-management.tsx';
// import RadiationProtectionManagement from '../../../medical-resources/fixed-assets/radiation-protection-management.tsx';

// import BasicDrugUsage from '../../../medication-management/drug-supply/basic-drug-usage.tsx';
// import DrugSupplyStatus from '../../../medication-management/drug-supply/drug-supply-status.tsx';

// import DrugProportionCategory from '../../../medication-management/rational-medication/drug-proportion-category.tsx';
// import AntibioticCategory from '../../../medication-management/rational-medication/antibiotic-category.tsx';
// import HospitalMedicine from '../../../medication-management/rational-medication/hospital-medicine.tsx';

// import BedUsageAnalysis from '../../../medical-efficiency/bed-efficiency/bed-usage-analysis.tsx';
// import BedOpenAnalysis from '../../../medical-efficiency/bed-efficiency/bed-open-analysis.tsx';

// import PhysicianEfficiency from '../../../medical-efficiency/doctor-efficiency/physician-efficiency.tsx';

import OutpatientTotalRevenue from '../OutpatientTotalRevenue.tsx';
import RevenueRatio from '../revenue-ratio.tsx';
import OutpatientRevenueStructure from '../OutpatientRevenueStructure.tsx';
import RevenueGrowthRate from '../OutpatientRevenueGrowth.tsx';
import AverageRevenue from '../average-revenue.tsx';

import InpatientTotalRevenue from '../InpatientTotalRevenue';
import DoctorWorkloadPerformance from '../DoctorWorkloadPerformance';
import DepartmentWorkloadPerformance from '../DepartmentWorkloadPerformance';
import InpatientRevenueRanking from '../inpatient-revenue-ranking.tsx';
import InpatientRevenueClassification from '../inpatient-revenue-classification';

// import PhysicalExaminationRevenue from '../../../hospital-revenue/physical-exam-revenue/physical-exam-average-revenue.tsx';
// import PhysicalExaminationAverageRevenue from '../../../hospital-revenue/physical-exam-revenue/physical-exam-average-revenue.tsx';
// import PhysicalExaminationRevenueRatio from '../../../hospital-revenue/physical-exam-revenue/physical-exam-revenue-ratio.tsx';
// import PhysicalExaminationRevenueGrowthRate from '../../../hospital-revenue/physical-exam-revenue/physical-exam-revenue-growth.a.tsx';


// 定义菜单项类型
interface MenuItem {
  id: string;
  title: string;
  icon: string;
  children: MenuItem[];
}

const menuItems: MenuItem[] = [
  // 将工作量与绩效放在第一个位置
  {
    id: 'workload_performance',
    title: '工作量与绩效',
    icon: 'ri-bar-chart-line',
    children: [
      {
        id: 'doctor_workload_performance',
        title: '医生工作量与绩效',
        icon: 'ri-user-star-line',
        children: []
      },
      {
        id: 'department_workload_performance',
        title: '科室工作量与绩效',
        icon: 'ri-building-line',
        children: []
      }
    ]
  },
  {
    id: 'medical-services',
    title: '医疗服务',
    icon: 'ri-service-line',
    children: [
      {
        id: 'outpatient-emergency',
        title: '门急诊服务',
        icon: 'ri-hospital-line',
        children: [
          { id: 'outpatient-visits', title: '门急诊人次', icon: 'ri-user-line', children: [] },
          { id: 'outpatient-appointment', title: '门诊预约', icon: 'ri-calendar-check-line', children: [] },
          { id: 'tcm-service', title: '门诊中药服务', icon: 'ri-leaf-line', children: [] },
          { id: 'follow-up', title: '复诊情况', icon: 'ri-repeat-line', children: [] },
          { id: 'special-clinic', title: '特需门诊', icon: 'ri-vip-crown-line', children: [] },
          { id: 'prescription-management', title: '处方管理', icon: 'ri-file-text-line', children: [] }
        ]
      },
      {
        id: 'inpatient-service',
        title: '住院服务',
        icon: 'ri-hotel-bed-line',
        children: [
          { id: 'admission-discharge', title: '出入院人次', icon: 'ri-door-open-line', children: [] },
          { id: 'admission-pathway', title: '入院途径', icon: 'ri-route-line', children: [] },
          { id: 'emergency-admission', title: '门急诊入院', icon: 'ri-arrow-right-line', children: [] },
          { id: 'disease-composition', title: '疾病构成', icon: 'ri-pie-chart-line', children: [] }
        ]
      },
      {
        id: 'referral',
        title: '转诊服务',
        icon: 'ri-arrow-left-right-line',
        children: [
          { id: 'transfer-service', title: '转诊人次', icon: 'ri-arrow-left-right-line', children: [] },
          { id: 'disease-ranking', title: '转诊疾病顺位', icon: 'ri-file-list-3-line', children: [] },
          { id: 'department-transfer', title: '科室转诊人次统计', icon: 'ri-building-2-line', children: [] }
        ]
      },
      {
        id: 'physical-exam',
        title: '体检服务',
        icon: 'ri-stethoscope-line',
        children: [
          { id: 'physical-exam-visits', title: '体检人次', icon: 'ri-user-heart-line', children: [] }
        ]
      }
    ]
  },
  {
    id: 'hospital-revenue',
    title: '医院收入情况',
    icon: 'ri-money-dollar-circle-line',
    children: [
      {
        id: 'outpatient-revenue',
        title: '门急诊收入',
        icon: 'ri-coins-line',
        children: [
          { id: 'total-revenue', title: '总收入', icon: 'ri-money-dollar-circle-line', children: [] },
          { id: 'revenue-ratio', title: '收入占比', icon: 'ri-pie-chart-line', children: [] },
          { id: 'revenue-structure', title: '收入结构', icon: 'ri-bar-chart-grouped-line', children: [] },
          { id: 'revenue-growth', title: '收入增长率', icon: 'ri-line-chart-line', children: [] },
          { id: 'average-revenue', title: '次均收入', icon: 'ri-calculator-line', children: [] }
        ]
      },
      {
        id: 'inpatient-revenue',
        title: '住院收入',
        icon: 'ri-bank-card-line',
        children: [
          { id: 'inpatient-total-revenue', title: '总收入', icon: 'ri-money-dollar-circle-line', children: [] },
          { id: 'inpatient-revenue-ranking', title: '收入顺位', icon: 'ri-trophy-line', children: [] },
          { id: 'inpatient-revenue-classification', title: '收入分类', icon: 'ri-pie-chart-2-line', children: [] }
        ]
      },
      {
        id: 'physical-exam-revenue',
        title: '体检收入',
        icon: 'ri-wallet-3-line',
        children: [
          { id: 'physical-exam-total-revenue', title: '总收入', icon: 'ri-money-dollar-circle-line', children: [] },
          { id: 'physical-exam-average-revenue', title: '均次收入', icon: 'ri-calculator-line', children: [] },
          { id: 'physical-exam-revenue-ratio', title: '收入占比', icon: 'ri-pie-chart-line', children: [] },
          { id: 'physical-exam-revenue-growth', title: '收入增长率', icon: 'ri-line-chart-line', children: [] }
        ]
      }
    ]
  },
  {
    id: 'medical-burden',
    title: '医疗负担',
    icon: 'ri-funds-line',
    children: [
      {
        id: 'outpatient-cost',
        title: '门急诊次均费用',
        icon: 'ri-price-tag-3-line',
        children: [
          { id: 'outpatient-avg-cost', title: '门急诊次均费用', icon: 'ri-calculator-line', children: [] },
          { id: 'outpatient-cost-analysis', title: '门急诊次均费用分析', icon: 'ri-bar-chart-line', children: [] }
        ]
      },
      {
        id: 'outpatient-drug-cost',
        title: '门急诊药费情况',
        icon: 'ri-medicine-bottle-line',
        children: [
          { id: 'outpatient-avg-drug-cost', title: '门急诊次均药费', icon: 'ri-calculator-line', children: [] },
          { id: 'outpatient-drug-cost-analysis', title: '门急诊次均药费分析', icon: 'ri-bar-chart-line', children: [] }
        ]
      },
      {
        id: 'inpatient-cost',
        title: '住院医疗费用',
        icon: 'ri-bill-line',
        children: [
          { id: 'inpatient-cost-overall', title: '总体分析', icon: 'ri-dashboard-line', children: [] },
          { id: 'inpatient-avg-cost-ratio', title: '住院次均费用占比', icon: 'ri-pie-chart-line', children: [] },
          { id: 'avg-bed-day-cost', title: '平均床日费用', icon: 'ri-hotel-bed-line', children: [] }
        ]
      }
    ]
  },
  {
    id: 'medical-insurance',
    title: '医疗保障',
    icon: 'ri-shield-user-line',
    children: [
      {
        id: 'outpatient-insurance',
        title: '门急诊医疗保障',
        icon: 'ri-shield-check-line',
        children: [
          { id: 'outpatient-insurance-overall', title: '总体分析', icon: 'ri-dashboard-line', children: [] },
          { id: 'insurance-patient-total-cost', title: '医保患者总费用', icon: 'ri-money-dollar-circle-line', children: [] },
          { id: 'insurance-patient-visits', title: '医保患者就诊情况', icon: 'ri-user-line', children: [] },
          { id: 'insurance-patient-cost', title: '医保患者费用', icon: 'ri-price-tag-3-line', children: [] }
        ]
      },
      {
        id: 'inpatient-insurance',
        title: '住院医疗保障',
        icon: 'ri-shield-star-line',
        children: [
          { id: 'inpatient-insurance-patients', title: '医保住院患者情况', icon: 'ri-hotel-bed-line', children: [] }
        ]
      }
    ]
  },
  {
    id: 'medical-quality',
    title: '医疗质量安全',
    icon: 'ri-shield-check-line',
    children: [
      {
        id: 'patient-safety',
        title: '患者安全',
        icon: 'ri-user-heart-line',
        children: [
          { id: 'adverse-events-count', title: '不良事件发生人次', icon: 'ri-alarm-warning-line', children: [] },
          { id: 'adverse-events-rate', title: '不良事件发生率', icon: 'ri-bar-chart-line', children: [] }
        ]
      },
      {
        id: 'diagnosis-quality',
        title: '诊断质量',
        icon: 'ri-search-eye-line',
        children: [
          { id: 'diagnosis-ranking', title: '诊断顺位', icon: 'ri-list-ordered', children: [] },
          { id: 'diagnosis-coincidence-rate', title: '诊断符合率', icon: 'ri-checkbox-circle-line', children: [] }
        ]
      },
      {
        id: 'medical-tech-quality',
        title: '医技质量',
        icon: 'ri-microscope-line',
        children: [
          { id: 'examination-count', title: '检查人次', icon: 'ri-user-line', children: [] },
          { id: 'positive-rate', title: '阳性率', icon: 'ri-line-chart-line', children: [] },
          { id: 'report-efficiency', title: '出报告效率', icon: 'ri-time-line', children: [] }
        ]
      },
      {
        id: 'surgery-quality',
        title: '手术质量',
        icon: 'ri-surgical-mask-line',
        children: [
          { id: 'surgery-count', title: '手术人次', icon: 'ri-user-line', children: [] },
          { id: 'surgery-level', title: '手术级别', icon: 'ri-star-line', children: [] },
          { id: 'surgery-safety', title: '手术安全', icon: 'ri-shield-check-line', children: [] },
          { id: 'surgeon-main', title: '手术医师(主刀)', icon: 'ri-user-star-line', children: [] },
          { id: 'department-surgery', title: '科室手术情况', icon: 'ri-building-line', children: [] }
        ]
      },
      {
        id: 'anesthesia-quality',
        title: '麻醉质量',
        icon: 'ri-syringe-line',
        children: [
          { id: 'anesthesia-count', title: '麻醉例数', icon: 'ri-number-1', children: [] },
          { id: 'anesthesia-method-ratio', title: '各麻醉方式占比', icon: 'ri-pie-chart-line', children: [] }
        ]
      },
      {
        id: 'clinical-pathway',
        title: '临床路径管理',
        icon: 'ri-route-line',
        children: [
          { id: 'pathway-count', title: '路径数量', icon: 'ri-list-check', children: [] },
          { id: 'pathway-management', title: '路径管理', icon: 'ri-settings-5-line', children: [] }
        ]
      },
      {
        id: 'key-disease',
        title: '重点疾病管理',
        icon: 'ri-heart-pulse-line',
        children: [
          { id: 'key-disease-hospitalization', title: '重点疾病住院情况', icon: 'ri-hotel-bed-line', children: [] },
          { id: 'key-disease-mortality', title: '重点疾病死亡情况', icon: 'ri-bar-chart-2-line', children: [] },
          { id: 'key-disease-readmission', title: '住院重点疾病重返例数', icon: 'ri-repeat-line', children: [] }
        ]
      },
      {
        id: 'single-disease',
        title: '单病种管理',
        icon: 'ri-file-list-3-line',
        children: [
          { id: 'single-disease-count', title: '单病种数量', icon: 'ri-list-check', children: [] },
          { id: 'single-disease-cost', title: '单病种费用', icon: 'ri-money-dollar-circle-line', children: [] },
          { id: 'single-disease-efficiency', title: '单病种效率', icon: 'ri-speed-line', children: [] }
        ]
      },
      {
        id: 'hospital-infection',
        title: '医院感染情况',
        icon: 'ri-virus-line',
        children: [
          { id: 'infection-count-analysis', title: '感染人数分析', icon: 'ri-user-line', children: [] },
          { id: 'infection-rate-analysis', title: '感染率分析', icon: 'ri-line-chart-line', children: [] },
          { id: 'risk-factor-analysis', title: '风险因素分析', icon: 'ri-alert-line', children: [] },
          { id: 'infection-site-analysis', title: '感染部位分析', icon: 'ri-body-scan-line', children: [] }
        ]
      },
      {
        id: 'medical-accident',
        title: '医疗事故',
        icon: 'ri-alarm-warning-line',
        children: [
          { id: 'accident-type', title: '医疗事故类型', icon: 'ri-error-warning-line', children: [] }
        ]
      },
      {
        id: 'mortality-analysis',
        title: '病死分析',
        icon: 'ri-bar-chart-line',
        children: [
          { id: 'emergency-mortality', title: '急诊病死分析', icon: 'ri-first-aid-kit-line', children: [] },
          { id: 'inpatient-mortality', title: '住院病死分析', icon: 'ri-hotel-bed-line', children: [] },
          { id: 'newborn-mortality', title: '新生儿病死分析', icon: 'ri-baby-carriage-line', children: [] },
          { id: 'surgery-mortality', title: '手术病死分析', icon: 'ri-surgical-mask-line', children: [] }
        ]
      }
    ]
  },
  {
    id: 'medical-efficiency',
    title: '医疗效率',
    icon: 'ri-speed-line',
    children: [
      {
        id: 'bed-efficiency',
        title: '床位效率',
        icon: 'ri-hotel-bed-line',
        children: [
          { id: 'bed-usage-analysis', title: '床位使用分析', icon: 'ri-dashboard-line', children: [] },
          { id: 'bed-open-analysis', title: '床位开放分析', icon: 'ri-door-open-line', children: [] }
        ]
      },
      {
        id: 'doctor-efficiency',
        title: '医生效率',
        icon: 'ri-user-star-line',
        children: [
          { id: 'physician-efficiency', title: '职业医师效率', icon: 'ri-user-voice-line', children: [] }
        ]
      }
    ]
  },
  {
    id: 'medication-management',
    title: '用药管理',
    icon: 'ri-capsule-line',
    children: [
      {
        id: 'rational-medication',
        title: '合理用药',
        icon: 'ri-medicine-bottle-line',
        children: [
          { id: 'hospital-medicine', title: '全院药品', icon: 'ri-medicine-bottle-line', children: [] },
          { id: 'antibiotic-category', title: '抗菌药类', icon: 'ri-bug-line', children: [] },
          { id: 'drug-proportion-category', title: '药占分类', icon: 'ri-pie-chart-line', children: [] }
        ]
      },
      {
        id: 'drug-supply',
        title: '药品供应保障',
        icon: 'ri-truck-line',
        children: [
          { id: 'drug-supply-status', title: '药品供应', icon: 'ri-store-2-line', children: [] },
          { id: 'basic-drug-usage', title: '基本药物使用', icon: 'ri-heart-pulse-line', children: [] }
        ]
      }
    ]
  },
  {
    id: 'blood-management',
    title: '输血管理',
    icon: 'ri-drop-line',
    children: [
      { id: 'blood-product-count', title: '输血品种数量', icon: 'ri-drop-line', children: [] },
      { id: 'blood-adverse-reaction', title: '输血不良反应', icon: 'ri-alert-line', children: [] }
    ]
  },
  {
    id: 'financial-management',
    title: '财务管理',
    icon: 'ri-calculator-line',
    children: [
      { id: 'income-expense-analysis', title: '收入支出结余分析', icon: 'ri-line-chart-line', children: [] },
      { id: 'accounts-receivable', title: '应收账款', icon: 'ri-wallet-line', children: [] },
      { id: 'asset-analysis', title: '资产分析', icon: 'ri-building-line', children: [] }
    ]
  },
  {
    id: 'medical-resources',
    title: '医疗资源',
    icon: 'ri-building-2-line',
    children: [
      {
        id: 'medical-staff',
        title: '医疗卫生人员',
        icon: 'ri-team-line',
        children: [
          { id: 'staff-total-count', title: '总数量', icon: 'ri-user-line', children: [] },
          { id: 'staff-structure', title: '人员结构', icon: 'ri-pie-chart-line', children: [] },
          { id: 'staff-growth-rate', title: '增长率', icon: 'ri-line-chart-line', children: [] }
        ]
      },
      {
        id: 'hospital-beds',
        title: '医院床位情况',
        icon: 'ri-hotel-bed-line',
        children: [
          { id: 'beds-total-count', title: '总数量', icon: 'ri-hotel-bed-line', children: [] },
          { id: 'beds-department-structure', title: '科室构成', icon: 'ri-building-line', children: [] },
          { id: 'beds-growth-rate', title: '增长率', icon: 'ri-line-chart-line', children: [] }
        ]
      },
      {
        id: 'resource-allocation',
        title: '医疗资源配置',
        icon: 'ri-pie-chart-line',
        children: [
          { id: 'staff-bed-ratio', title: '人员床位比', icon: 'ri-user-line', children: [] },
          { id: 'department-structure', title: '科室结构', icon: 'ri-building-line', children: [] }
        ]
      },
      {
        id: 'fixed-assets',
        title: '固定资产管理',
        icon: 'ri-building-line',
        children: [
          { id: 'general-fixed-assets', title: '一般固定资产', icon: 'ri-building-line', children: [] },
          { id: 'medical-equipment-management', title: '医疗设备管理', icon: 'ri-tools-line', children: [] },
          { id: 'radiation-protection-management', title: '放射防护管理', icon: 'ri-shield-line', children: [] }
        ]
      }
    ]
  }
];

export default function Dashboard() {
  const location = useLocation();
  const [activeMenu, setActiveMenu] = useState('workload_performance'); // 默认激活工作量与绩效

  // 根据URL参数设置默认激活的菜单
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const moduleParam = urlParams.get('module');

    if (moduleParam) {
      // 根据模块参数设置对应的菜单项
      const moduleMapping: { [key: string]: string } = {
        'workload_performance': 'doctor_workload_performance',
        'medical-services': 'outpatient-visits',
        'hospital-revenue': 'total-revenue',
        'medical-burden': 'outpatient-avg-cost',
        'medical-insurance': 'outpatient-insurance-overall',
        'medical-quality': 'adverse-events-count',
        'medical-efficiency': 'bed-usage-analysis',
        'medical-resources': 'staff-total-count',
        'medication-management': 'hospital-medicine',
        'blood-management': 'blood-product-count',
        'financial-management': 'income-expense-analysis'
      };

      const targetMenu = moduleMapping[moduleParam] || moduleParam;
      setActiveMenu(targetMenu);
    }
  }, [location.search]);

  const getPageTitle = (menuId: string): string => {
    // 递归查找菜单标题
    const findTitle = (items: MenuItem[], targetId: string): string | null => {
      for (const item of items) {
        if (item.id === targetId) {
          return item.title;
        }
        if (item.children.length > 0) {
          const found = findTitle(item.children, targetId);
          if (found) return found;
        }
      }
      return null;
    };

    return findTitle(menuItems, menuId) || '工作量与绩效';
  };

const renderContent = () => {
  // 根据选中的菜单渲染对应内容
  switch (activeMenu) {
    case 'inpatient-total-revenue':
      return <InpatientTotalRevenue />;
    case 'doctor_workload_performance':
      return <DoctorWorkloadPerformance />;
    case 'department_workload_performance':
      return <DepartmentWorkloadPerformance />;
    case 'outpatient-visits':
      return <OutpatientVisits />;
    case 'outpatient-appointment':
      return <OutpatientAppointment />;
    case 'tcm-service':
      return <TcmService />;
    case 'follow-up':
      return <FollowUpService />;
    case 'special-clinic':
      return <SpecialClinic />;
    case 'prescription-management':
      return <PrescriptionManagement />;
    case 'admission-discharge':
      return <AdmissionDischarge />;
    case 'admission-pathway':
      return <AdmissionPathway />;
    case 'emergency-admission':
      return <EmergencyAdmission />;
    case 'disease-composition':
      return <DiseaseComposition />;
    // case 'transfer-service': // 这是正确的转诊人次
    //   return <TransferPatients />;
    // case 'disease-ranking':
    //   return <ReferralDiseaseRanking />;
    // case 'department-transfer':
    //   return <DepartmentTransferStatistics />;
    // case 'physical-exam-visits':
    //   return <HealthExamination />;
    case 'total-revenue':
      return <OutpatientTotalRevenue />;
    case 'revenue-ratio':
      return <RevenueRatio />;
    case 'revenue-structure':
      return <OutpatientRevenueStructure />;
    case 'revenue-growth':
      return <RevenueGrowthRate />;
    case 'revenue-growth-rate':
      return <RevenueGrowthRate />;
    case 'average-revenue':
      return <AverageRevenue />;
    case 'inpatient-revenue-ranking':
      return <InpatientRevenueRanking />;
    case 'inpatient-revenue-classification':
      return <InpatientRevenueClassification />;
    // case 'physical-exam-total-revenue':
    //   return <PhysicalExaminationRevenue />;
    // case 'physical-exam-average-revenue':
    //   return <PhysicalExaminationAverageRevenue />;
    // case 'physical-exam-revenue-ratio':
    //   return <PhysicalExaminationRevenueRatio />;
    // case 'physical-exam-revenue-growth':
    //   return <PhysicalExaminationRevenueGrowthRate />;
    // case 'health-examination':
    //   return <HealthExamination />;
    // case 'bed-usage-analysis':
    //   return <BedUsageAnalysis />;
    // case 'bed-open-analysis':
    //   return <BedOpenAnalysis />;
    // case 'physician-efficiency':
    //   return <PhysicianEfficiency />;
    // case 'adverse-events-count':
    //   return <AdverseEventsCount />;
    // case 'adverse-events-rate':
    //   return <AdverseEventsRate />;
    // case 'diagnosis-ranking':
    //   return <DiagnosisRanks />;
    // case 'diagnosis-coincidence-rate':
    //   return <DiagnosisComplianceRate />;
    // case 'examination-count':
    //   return <ExaminationCount />;
    // case 'positive-rate':
    //   return <PositiveRates />;
    //  case 'report-efficiency':
    //   return <ReportEfficiency />;
    // case 'surgery-count':
    //   return <SurgeryCount />;
    // case 'surgery-safety':
    //   return <SurgerySafety />
    // case 'surgery-level':
    //   return <SurgeryLevel />;
    // case 'surgeon-main':
    //   return <SurgeonMain />;
    // case 'department-surgery':
    //   return <DepartmentSurgery />;
    // case 'anesthesia-count':
    //   return <AnesthesiaCount />;
    // case 'anesthesia-method-ratio':
    //   return <AnesthesiaMethodRatio />;
    // case 'pathway-count':
    //   return <PathwayCount />;
    // case 'pathway-management':
    //   return <PathwayManagement />;
    // case 'hospital-medicine':
    //   return <HospitalMedicine />;
    // case 'key-disease-hospitalization':
    //   return <KeyDiseaseHospitalization />;
    // case 'key-disease-mortality':
    //   return <KeyDiseaseMortality />;
    // case 'key-disease-readmission':
    //   return <KeyDiseaseReadmission />;
    // 单病种数量
    case 'single-disease-count':
      return <DRGCount />;
    // 单病种费用
    case 'single-disease-cost':
      return <DRGCost />;
    // 单病种效率
    case 'single-disease-efficiency':
      return <DRGEfficiency />;

    // case 'infection-count-analysis':
    //   return <InfectionCountAnalysis />;
    // case 'infection-rate-analysis':
    //   return <InfectionRateAnalysis />;
    // case 'risk-factor-analysis':
    //   return <RiskFactorAnalysis />;
    // case 'infection-site-analysis':
    //   return <InfectionSiteAnalysis />;
    // case 'accident-type':
    //   return <AccidentType />
    //
    // case 'emergency-mortality':
    //   return <EmergencyMortality />;
    // case 'inpatient-mortality':
    //   return <InpatientMortality />;
    // case 'newborn-mortality':
    //   return <NewbornMortality />;
    // case 'surgery-mortality':
    //   return <SurgeryMortality />;
    // case 'blood-product-count':
    //   return <BloodManagement />;
    // case 'blood-adverse-reaction':
    //   return <BloodAdverseReaction />;
    // case 'income-expense-analysis':
    //   return <IncomeExpenseAnalysis />;
    // case 'accounts-receivable':
    //   return <AccountsReceivable />;
    // case 'asset-analysis':
    //   return <AssetAnalysis />;
    case 'outpatient-avg-cost':
      return <OutpatientAvgCost />;
    case 'outpatient-cost-analysis':
      return <OutpatientCostAnalysis />;
    case 'outpatient-avg-drug-cost':
      return <OutpatientAvgDrugCost />;
    case 'outpatient-drug-cost-analysis':
      return <OutpatientDrugCostAnalysis />;
    case 'inpatient-cost-overall':
      return <InpatientCostOverall />;
    case 'inpatient-avg-cost-ratio':
      return <InpatientAverageCostRatio  />;
    case 'avg-bed-day-cost':
      return <AverageBedDayCost />;
    case 'outpatient-insurance-overall':
      return <OutpatientInsuranceOverall />;
    case 'insurance-patient-total-cost':
      return <InsurancePatientTotalCost />;
    case 'insurance-patient-visits':
      return <InsurancePatientVisits />;
    case 'insurance-patient-cost':
      return <InsurancePatientCost />;
    case 'inpatient-insurance-patients':
      return <InpatientInsurancePatients />;
    // case 'staff-total-count':
    //   return <StaffTotalCount />;
    // case 'staff-structure':
    //   return <StaffStructure />;
    // case 'staff-growth-rate':
    //   return <GrowthRate />;
    // case 'beds-total-count':
    //   return <BedsTotalCount />;
    // case 'beds-department-structure':
    //   return <BedsDepartmentStructure />;
    // case 'beds-growth-rate':
    //   return <BedsGrowthRate />;
    // case 'staff-bed-ratio':
    //   return <StaffBedRatio />;
    // case 'department-structure':
    //   return <DepartmentStructure />;
    // case 'general-fixed-assets':
    //   return <GeneralFixedAssets />;
    // case 'medical-equipment-management':
    //   return <MedicalEquipmentManagement />;
    // case 'radiation-protection-management':
    //   return <RadiationProtectionManagement />;
    // case 'drug-proportion-category':
    //   return <DrugProportionCategory />;
    // case 'antibiotic-category':
    //   return <AntibioticCategory />;
    // case 'drug-supply-status':
    //   return <DrugSupplyStatus />;
    // case 'basic-drug-usage':
    //   return <BasicDrugUsage />;




    default:
      return (
        <div className="p-6">
          <div className="mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center">
                <i className="ri-information-line text-blue-600 mr-2"></i>
                <span className="text-blue-800 text-sm">
                  当前模块：{getPageTitle(activeMenu)} - 数据将从后端系统获取，暂无模拟数据
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <DataCard
              title="总体指标"
              icon="ri-dashboard-line"
              error="等待后端数据接入"
            />
            <DataCard
              title="实时数据"
              icon="ri-pulse-line"
              error="等待后端数据接入"
            />
            <DataCard
              title="统计分析"
              icon="ri-bar-chart-2-line"
              error="等待后端数据接入"
            />
            <DataCard
              title="趋势预测"
              icon="ri-line-chart-line"
              error="等待后端数据接入"
            />
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              {getPageTitle(activeMenu)} - 详细数据
            </h3>
            <div className="text-center py-12">
              <i className="ri-database-2-line text-6xl text-gray-300 mb-4"></i>
              <p className="text-gray-500 mb-2">暂无数据显示</p>
              <p className="text-sm text-gray-400">
                请确保后端数据源已正确配置并连接
              </p>
            </div>
          </div>
        </div>
      );
  }
};

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        menuItems={menuItems}
        onMenuClick={setActiveMenu}
        activeMenu={activeMenu}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}