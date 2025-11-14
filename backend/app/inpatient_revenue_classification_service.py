"""
住院收入分类数据处理模块
提供住院收入分类相关指标的数据查询和计算功能
支持PostgreSQL数据库
"""

from datetime import datetime, timedelta
from typing import List, Dict, Optional, Union
from dataclasses import dataclass
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class InpatientRevenueClassificationData:
    """住院收入分类数据模型"""
    basic_medical_insurance_ratio: float = 0.0  # 住院收入基本医疗保险占比(%)
    service_revenue_ratio: float = 0.0  # 住院服务收入占比(%)
    medical_payment_method_ratio: float = 0.0  # 住院收入医疗费用支付方式占比分析
    patient_medication_structure: float = 0.0  # 住院收入患者医药费用构成
    charge_item_analysis: float = 0.0  # 住院收入按费用项目类别分析

@dataclass
class InpatientRevenueClassificationResponse:
    """住院收入分类响应数据模型"""
    date: str
    data: InpatientRevenueClassificationData

@dataclass
class ComparisonData:
    """同比环比数据模型"""
    current_value: float
    comparison_value: float
    change_rate: float
    change_type: str  # 'increase', 'decrease', 'stable'

class InpatientRevenueClassificationService:
    """住院收入分类服务类"""
    
    def __init__(self, db_connection=None):
        """
        初始化服务
        :param db_connection: PostgreSQL数据库连接对象
        """
        self.db_connection = db_connection
        
    def get_revenue_classification_data(
        self, 
        time_range: str, 
        start_date: Optional[str] = None, 
        end_date: Optional[str] = None
    ) -> List[InpatientRevenueClassificationResponse]:
        """
        获取住院收入分类数据
        
        :param time_range: 时间范围 ('day', 'month', 'quarter', 'year')
        :param start_date: 开始日期 (YYYY-MM-DD)
        :param end_date: 结束日期 (YYYY-MM-DD)
        :return: 住院收入分类数据列表
        """
        try:
            logger.info(f"查询住院收入分类数据 - 时间范围: {time_range}, 开始日期: {start_date}, 结束日期: {end_date}")
            
            # 如果没有数据库连接，返回空数据
            if not self.db_connection:
                logger.warning("数据库连接未配置，返回空数据")
                return []
            
            # 构建SQL查询
            query = self._build_query(time_range, start_date, end_date)
            
            # 执行查询
            cursor = self.db_connection.cursor()
            cursor.execute(query, self._get_query_params(start_date, end_date))
            results = cursor.fetchall()
            
            # 处理查询结果
            data_list = []
            for row in results:
                data = InpatientRevenueClassificationData(
                    basic_medical_insurance_ratio=row[1] or 0.0,
                    service_revenue_ratio=row[2] or 0.0,
                    medical_payment_method_ratio=row[3] or 0.0,
                    patient_medication_structure=row[4] or 0.0,
                    charge_item_analysis=row[5] or 0.0
                )
                
                response = InpatientRevenueClassificationResponse(
                    date=str(row[0]),
                    data=data
                )
                data_list.append(response)
            
            cursor.close()
            logger.info(f"成功获取 {len(data_list)} 条数据")
            return data_list
            
        except Exception as e:
            logger.error(f"获取住院收入分类数据失败: {str(e)}")
            raise Exception(f"数据获取失败: {str(e)}")
    
    def get_indicators_summary(self, time_range: str) -> InpatientRevenueClassificationData:
        """
        获取指标统计摘要
        
        :param time_range: 时间范围
        :return: 指标摘要数据
        """
        try:
            logger.info(f"获取指标摘要 - 时间范围: {time_range}")
            
            if not self.db_connection:
                logger.warning("数据库连接未配置，返回默认数据")
                return InpatientRevenueClassificationData()
            
            # 构建摘要查询SQL
            summary_query = """
            SELECT 
                AVG(basic_medical_insurance_ratio) as avg_basic_medical_insurance_ratio,
                AVG(service_revenue_ratio) as avg_service_revenue_ratio,
                AVG(medical_payment_method_ratio) as avg_medical_payment_method_ratio,
                AVG(patient_medication_structure) as avg_patient_medication_structure,
                AVG(charge_item_analysis) as avg_charge_item_analysis
            FROM inpatient_revenue_classification_summary 
            WHERE time_range = %s
            """
            
            cursor = self.db_connection.cursor()
            cursor.execute(summary_query, (time_range,))
            result = cursor.fetchone()
            cursor.close()
            
            if result:
                return InpatientRevenueClassificationData(
                    basic_medical_insurance_ratio=result[0] or 0.0,
                    service_revenue_ratio=result[1] or 0.0,
                    medical_payment_method_ratio=result[2] or 0.0,
                    patient_medication_structure=result[3] or 0.0,
                    charge_item_analysis=result[4] or 0.0
                )
            else:
                return InpatientRevenueClassificationData()
                
        except Exception as e:
            logger.error(f"获取指标摘要失败: {str(e)}")
            raise Exception(f"数据获取失败: {str(e)}")
    
    def get_comparison_analysis(
        self, 
        indicator: str, 
        current_period: str, 
        comparison_type: str = 'yoy'  # 'yoy' for year-over-year, 'mom' for month-over-month
    ) -> ComparisonData:
        """
        获取同比环比分析数据
        
        :param indicator: 指标名称
        :param current_period: 当前期间
        :param comparison_type: 比较类型 ('yoy', 'mom')
        :return: 比较分析数据
        """
        try:
            logger.info(f"获取比较分析数据 - 指标: {indicator}, 期间: {current_period}, 类型: {comparison_type}")
            
            if not self.db_connection:
                logger.warning("数据库连接未配置，返回默认数据")
                return ComparisonData(0.0, 0.0, 0.0, 'stable')
            
            # 构建比较查询SQL
            if comparison_type == 'yoy':
                # 同比分析
                comparison_query = """
                SELECT 
                    current_data.{indicator} as current_value,
                    previous_data.{indicator} as previous_value
                FROM inpatient_revenue_classification_data current_data
                LEFT JOIN inpatient_revenue_classification_data previous_data 
                    ON DATE_PART('month', current_data.date_period) = DATE_PART('month', previous_data.date_period)
                    AND DATE_PART('day', current_data.date_period) = DATE_PART('day', previous_data.date_period)
                    AND DATE_PART('year', previous_data.date_period) = DATE_PART('year', current_data.date_period) - 1
                WHERE current_data.date_period = %s
                """.format(indicator=indicator)
            else:
                # 环比分析
                comparison_query = """
                SELECT 
                    current_data.{indicator} as current_value,
                    previous_data.{indicator} as previous_value
                FROM inpatient_revenue_classification_data current_data
                LEFT JOIN inpatient_revenue_classification_data previous_data 
                    ON previous_data.date_period = current_data.date_period - INTERVAL '1 month'
                WHERE current_data.date_period = %s
                """.format(indicator=indicator)
            
            cursor = self.db_connection.cursor()
            cursor.execute(comparison_query, (current_period,))
            result = cursor.fetchone()
            cursor.close()
            
            if result and result[0] is not None and result[1] is not None:
                current_value = float(result[0])
                previous_value = float(result[1])
                
                if previous_value != 0:
                    change_rate = ((current_value - previous_value) / previous_value) * 100
                else:
                    change_rate = 0.0
                
                if change_rate > 2:
                    change_type = 'increase'
                elif change_rate < -2:
                    change_type = 'decrease'
                else:
                    change_type = 'stable'
                
                return ComparisonData(
                    current_value=current_value,
                    comparison_value=previous_value,
                    change_rate=change_rate,
                    change_type=change_type
                )
            else:
                return ComparisonData(0.0, 0.0, 0.0, 'stable')
                
        except Exception as e:
            logger.error(f"获取比较分析数据失败: {str(e)}")
            raise Exception(f"数据获取失败: {str(e)}")
    
    def _build_query(self, time_range: str, start_date: Optional[str], end_date: Optional[str]) -> str:
        """
        构建PostgreSQL查询SQL
        
        :param time_range: 时间范围
        :param start_date: 开始日期
        :param end_date: 结束日期
        :return: SQL查询语句
        """
        # 根据时间范围确定日期格式
        date_format = self._get_date_format(time_range)
        
        query = f"""
        SELECT 
            TO_CHAR(date_period, '{date_format}') as period,
            -- 住院收入基本医疗保险占比
            CASE 
                WHEN SUM(total_inpatient_revenue) > 0 
                THEN (SUM(basic_medical_insurance_revenue)::FLOAT / SUM(total_inpatient_revenue)) * 100
                ELSE 0 
            END as basic_medical_insurance_ratio,
            -- 住院服务收入占比
            CASE 
                WHEN SUM(total_inpatient_revenue) > 0 
                THEN ((SUM(total_inpatient_revenue) - SUM(pathology_diagnosis_fee) - SUM(laboratory_diagnosis_fee) 
                      - SUM(imaging_diagnosis_fee) - SUM(clinical_diagnosis_fee) - SUM(western_medicine_fee) 
                      - SUM(antibacterial_drug_fee) - SUM(chinese_patent_medicine_fee) - SUM(chinese_herbal_medicine_fee) 
                      - SUM(examination_fee) - SUM(disposable_material_fee_1) - SUM(treatment_fee) 
                      - SUM(disposable_material_fee_2) - SUM(surgery_fee) - SUM(disposable_material_fee_3))::FLOAT 
                      / SUM(total_inpatient_revenue)) * 100
                ELSE 0 
            END as service_revenue_ratio,
            -- 住院收入医疗费用支付方式占比分析
            CASE 
                WHEN SUM(total_inpatient_revenue) > 0 
                THEN ((SUM(urban_resident_insurance) + SUM(urban_rural_insurance) + SUM(new_rural_cooperative) 
                      + SUM(commercial_insurance) + SUM(full_public_expense) + SUM(full_self_pay) 
                      + SUM(poverty_assistance) + SUM(other_payment))::FLOAT / SUM(total_inpatient_revenue)) * 100
                ELSE 0 
            END as medical_payment_method_ratio,
            -- 住院收入患者医药费用构成
            CASE 
                WHEN SUM(total_inpatient_revenue) > 0 
                THEN ((SUM(bed_revenue) + SUM(consultation_revenue) + SUM(examination_revenue) 
                      + SUM(laboratory_revenue) + SUM(surgery_revenue) + SUM(nursing_revenue) 
                      + SUM(medical_material_revenue) + SUM(drug_revenue) + SUM(pharmaceutical_service_revenue) 
                      + SUM(other_inpatient_revenue))::FLOAT / SUM(total_inpatient_revenue)) * 100
                ELSE 0 
            END as patient_medication_structure,
            -- 住院收入按费用项目类别分析
            CASE 
                WHEN SUM(total_inpatient_revenue) > 0 
                THEN ((SUM(drug_revenue) + SUM(diagnosis_treatment_revenue) + SUM(medical_material_revenue))::FLOAT 
                      / SUM(total_inpatient_revenue)) * 100
                ELSE 0 
            END as charge_item_analysis
        FROM inpatient_revenue_classification_data 
        WHERE date_period >= %s AND date_period <= %s
        GROUP BY TO_CHAR(date_period, '{date_format}')
        ORDER BY period
        """
        
        return query
    
    def _get_date_format(self, time_range: str) -> str:
        """
        根据时间范围获取PostgreSQL日期格式
        
        :param time_range: 时间范围
        :return: PostgreSQL日期格式字符串
        """
        formats = {
            'day': 'YYYY-MM-DD',
            'month': 'YYYY-MM',
            'quarter': 'YYYY-Q',
            'year': 'YYYY'
        }
        return formats.get(time_range, 'YYYY-MM-DD')
    
    def _get_query_params(self, start_date: Optional[str], end_date: Optional[str]) -> tuple:
        """
        获取查询参数
        
        :param start_date: 开始日期
        :param end_date: 结束日期
        :return: 查询参数元组
        """
        if not start_date:
            start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        if not end_date:
            end_date = datetime.now().strftime('%Y-%m-%d')
        
        return (start_date, end_date)

class InpatientRevenueClassificationCalculator:
    """住院收入分类指标计算器"""
    
    @staticmethod
    def calculate_basic_medical_insurance_ratio(
        basic_medical_insurance_revenue: float, 
        total_inpatient_revenue: float
    ) -> float:
        """
        计算住院收入基本医疗保险占比
        
        :param basic_medical_insurance_revenue: 基本医疗保险收入
        :param total_inpatient_revenue: 同期住院收入
        :return: 基本医疗保险占比(%)
        """
        if total_inpatient_revenue == 0:
            return 0.0
        return (basic_medical_insurance_revenue / total_inpatient_revenue) * 100
    
    @staticmethod
    def calculate_service_revenue_ratio(
        total_inpatient_revenue: float,
        pathology_diagnosis_fee: float,
        laboratory_diagnosis_fee: float,
        imaging_diagnosis_fee: float,
        clinical_diagnosis_fee: float,
        western_medicine_fee: float,
        antibacterial_drug_fee: float,
        chinese_patent_medicine_fee: float,
        chinese_herbal_medicine_fee: float,
        examination_fee: float,
        disposable_material_fee_1: float,
        treatment_fee: float,
        disposable_material_fee_2: float,
        surgery_fee: float,
        disposable_material_fee_3: float
    ) -> float:
        """
        计算住院服务收入占比
        
        :param total_inpatient_revenue: 住院收入
        :param pathology_diagnosis_fee: 病理诊断费
        :param laboratory_diagnosis_fee: 实验室诊断费
        :param imaging_diagnosis_fee: 影像学诊断费
        :param clinical_diagnosis_fee: 临床诊断项目费
        :param western_medicine_fee: 西药费
        :param antibacterial_drug_fee: 抗菌药物费用
        :param chinese_patent_medicine_fee: 中成药费
        :param chinese_herbal_medicine_fee: 中草药费
        :param examination_fee: 检查费
        :param disposable_material_fee_1: 一次性材料费1
        :param treatment_fee: 治疗费
        :param disposable_material_fee_2: 一次性材料费2
        :param surgery_fee: 手术费
        :param disposable_material_fee_3: 一次性材料费3
        :return: 住院服务收入占比(%)
        """
        if total_inpatient_revenue == 0:
            return 0.0
        
        service_revenue = (total_inpatient_revenue - pathology_diagnosis_fee - laboratory_diagnosis_fee 
                          - imaging_diagnosis_fee - clinical_diagnosis_fee - western_medicine_fee 
                          - antibacterial_drug_fee - chinese_patent_medicine_fee - chinese_herbal_medicine_fee 
                          - examination_fee - disposable_material_fee_1 - treatment_fee 
                          - disposable_material_fee_2 - surgery_fee - disposable_material_fee_3)
        
        return (service_revenue / total_inpatient_revenue) * 100
    
    @staticmethod
    def calculate_medical_payment_method_ratio(
        urban_resident_insurance: float,
        urban_rural_insurance: float,
        new_rural_cooperative: float,
        commercial_insurance: float,
        full_public_expense: float,
        full_self_pay: float,
        poverty_assistance: float,
        other_payment: float,
        total_inpatient_revenue: float
    ) -> float:
        """
        计算住院收入医疗费用支付方式占比分析
        
        :param urban_resident_insurance: 城镇居民基本医疗保险占比
        :param urban_rural_insurance: 城乡居民医疗保险占比
        :param new_rural_cooperative: 新型农村合作医疗占比
        :param commercial_insurance: 商业医疗保险占比
        :param full_public_expense: 全公费占比
        :param full_self_pay: 全自费占比
        :param poverty_assistance: 贫困救助占比
        :param other_payment: 其他占比
        :param total_inpatient_revenue: 住院收入总额
        :return: 医疗费用支付方式占比(%)
        """
        if total_inpatient_revenue == 0:
            return 0.0
        
        total_payment = (urban_resident_insurance + urban_rural_insurance + new_rural_cooperative 
                        + commercial_insurance + full_public_expense + full_self_pay 
                        + poverty_assistance + other_payment)
        
        return (total_payment / total_inpatient_revenue) * 100
    
    @staticmethod
    def calculate_patient_medication_structure(
        bed_revenue: float,
        consultation_revenue: float,
        examination_revenue: float,
        laboratory_revenue: float,
        surgery_revenue: float,
        nursing_revenue: float,
        medical_material_revenue: float,
        drug_revenue: float,
        pharmaceutical_service_revenue: float,
        other_inpatient_revenue: float,
        total_inpatient_revenue: float
    ) -> float:
        """
        计算住院收入患者医药费用构成
        
        :param bed_revenue: 床位收入占比
        :param consultation_revenue: 诊察收入占比
        :param examination_revenue: 检查收入占比
        :param laboratory_revenue: 化验收入占比
        :param surgery_revenue: 手术收入占比
        :param nursing_revenue: 护理收入占比
        :param medical_material_revenue: 卫生材料收入占比
        :param drug_revenue: 药品收入占比
        :param pharmaceutical_service_revenue: 药事服务费收入占比
        :param other_inpatient_revenue: 其他住院收入占比
        :param total_inpatient_revenue: 住院收入总额
        :return: 患者医药费用构成(%)
        """
        if total_inpatient_revenue == 0:
            return 0.0
        
        total_structure = (bed_revenue + consultation_revenue + examination_revenue 
                          + laboratory_revenue + surgery_revenue + nursing_revenue 
                          + medical_material_revenue + drug_revenue + pharmaceutical_service_revenue 
                          + other_inpatient_revenue)
        
        return (total_structure / total_inpatient_revenue) * 100
    
    @staticmethod
    def calculate_charge_item_analysis(
        drug_revenue: float,
        diagnosis_treatment_revenue: float,
        medical_material_revenue: float,
        total_inpatient_revenue: float
    ) -> float:
        """
        计算住院收入按费用项目类别分析
        
        :param drug_revenue: 药品收入占比
        :param diagnosis_treatment_revenue: 诊疗项目收入占比
        :param medical_material_revenue: 卫生材料收入占比
        :param total_inpatient_revenue: 住院收入总额
        :return: 按费用项目类别分析(%)
        """
        if total_inpatient_revenue == 0:
            return 0.0
        
        total_charge_items = drug_revenue + diagnosis_treatment_revenue + medical_material_revenue
        
        return (total_charge_items / total_inpatient_revenue) * 100
    
    @staticmethod
    def analyze_revenue_classification_trend(data_list: List[InpatientRevenueClassificationData]) -> Dict[str, str]:
        """
        分析住院收入分类趋势
        
        :param data_list: 住院收入分类数据列表
        :return: 趋势分析结果
        """
        if len(data_list) < 2:
            return {
                'basic_medical_insurance_ratio_trend': 'stable',
                'service_revenue_ratio_trend': 'stable',
                'medical_payment_method_ratio_trend': 'stable',
                'patient_medication_structure_trend': 'stable',
                'charge_item_analysis_trend': 'stable'
            }
        
        trends = {}
        
        # 分析各指标趋势
        indicators = [
            'basic_medical_insurance_ratio',
            'service_revenue_ratio',
            'medical_payment_method_ratio',
            'patient_medication_structure',
            'charge_item_analysis'
        ]
        
        for indicator in indicators:
            values = [getattr(data, indicator) for data in data_list]
            trend = 'stable'
            if values[-1] > values[0] * 1.05:
                trend = 'increasing'
            elif values[-1] < values[0] * 0.95:
                trend = 'decreasing'
            trends[f'{indicator}_trend'] = trend
        
        return trends

# PostgreSQL数据库表结构创建SQL
CREATE_TABLES_SQL = """
-- 住院收入分类数据表
CREATE TABLE IF NOT EXISTS inpatient_revenue_classification_data (
    id BIGSERIAL PRIMARY KEY,
    date_period DATE NOT NULL,
    total_inpatient_revenue DECIMAL(15,2) DEFAULT 0,
    basic_medical_insurance_revenue DECIMAL(15,2) DEFAULT 0,
    pathology_diagnosis_fee DECIMAL(15,2) DEFAULT 0,
    laboratory_diagnosis_fee DECIMAL(15,2) DEFAULT 0,
    imaging_diagnosis_fee DECIMAL(15,2) DEFAULT 0,
    clinical_diagnosis_fee DECIMAL(15,2) DEFAULT 0,
    western_medicine_fee DECIMAL(15,2) DEFAULT 0,
    antibacterial_drug_fee DECIMAL(15,2) DEFAULT 0,
    chinese_patent_medicine_fee DECIMAL(15,2) DEFAULT 0,
    chinese_herbal_medicine_fee DECIMAL(15,2) DEFAULT 0,
    examination_fee DECIMAL(15,2) DEFAULT 0,
    disposable_material_fee_1 DECIMAL(15,2) DEFAULT 0,
    treatment_fee DECIMAL(15,2) DEFAULT 0,
    disposable_material_fee_2 DECIMAL(15,2) DEFAULT 0,
    surgery_fee DECIMAL(15,2) DEFAULT 0,
    disposable_material_fee_3 DECIMAL(15,2) DEFAULT 0,
    urban_resident_insurance DECIMAL(15,2) DEFAULT 0,
    urban_rural_insurance DECIMAL(15,2) DEFAULT 0,
    new_rural_cooperative DECIMAL(15,2) DEFAULT 0,
    commercial_insurance DECIMAL(15,2) DEFAULT 0,
    full_public_expense DECIMAL(15,2) DEFAULT 0,
    full_self_pay DECIMAL(15,2) DEFAULT 0,
    poverty_assistance DECIMAL(15,2) DEFAULT 0,
    other_payment DECIMAL(15,2) DEFAULT 0,
    bed_revenue DECIMAL(15,2) DEFAULT 0,
    consultation_revenue DECIMAL(15,2) DEFAULT 0,
    examination_revenue DECIMAL(15,2) DEFAULT 0,
    laboratory_revenue DECIMAL(15,2) DEFAULT 0,
    surgery_revenue DECIMAL(15,2) DEFAULT 0,
    nursing_revenue DECIMAL(15,2) DEFAULT 0,
    medical_material_revenue DECIMAL(15,2) DEFAULT 0,
    drug_revenue DECIMAL(15,2) DEFAULT 0,
    pharmaceutical_service_revenue DECIMAL(15,2) DEFAULT 0,
    other_inpatient_revenue DECIMAL(15,2) DEFAULT 0,
    diagnosis_treatment_revenue DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_inpatient_revenue_classification_data_date_period ON inpatient_revenue_classification_data(date_period);

-- 添加表注释
COMMENT ON TABLE inpatient_revenue_classification_data IS '住院收入分类数据表';
COMMENT ON COLUMN inpatient_revenue_classification_data.date_period IS '统计日期';
COMMENT ON COLUMN inpatient_revenue_classification_data.total_inpatient_revenue IS '住院收入总额';
COMMENT ON COLUMN inpatient_revenue_classification_data.basic_medical_insurance_revenue IS '基本医疗保险收入';
COMMENT ON COLUMN inpatient_revenue_classification_data.pathology_diagnosis_fee IS '病理诊断费';
COMMENT ON COLUMN inpatient_revenue_classification_data.laboratory_diagnosis_fee IS '实验室诊断费';
COMMENT ON COLUMN inpatient_revenue_classification_data.imaging_diagnosis_fee IS '影像学诊断费';
COMMENT ON COLUMN inpatient_revenue_classification_data.clinical_diagnosis_fee IS '临床诊断项目费';
COMMENT ON COLUMN inpatient_revenue_classification_data.western_medicine_fee IS '西药费';
COMMENT ON COLUMN inpatient_revenue_classification_data.antibacterial_drug_fee IS '抗菌药物费用';
COMMENT ON COLUMN inpatient_revenue_classification_data.chinese_patent_medicine_fee IS '中成药费';
COMMENT ON COLUMN inpatient_revenue_classification_data.chinese_herbal_medicine_fee IS '中草药费';
COMMENT ON COLUMN inpatient_revenue_classification_data.examination_fee IS '检查费';
COMMENT ON COLUMN inpatient_revenue_classification_data.disposable_material_fee_1 IS '一次性材料费1';
COMMENT ON COLUMN inpatient_revenue_classification_data.treatment_fee IS '治疗费';
COMMENT ON COLUMN inpatient_revenue_classification_data.disposable_material_fee_2 IS '一次性材料费2';
COMMENT ON COLUMN inpatient_revenue_classification_data.surgery_fee IS '手术费';
COMMENT ON COLUMN inpatient_revenue_classification_data.disposable_material_fee_3 IS '一次性材料费3';
COMMENT ON COLUMN inpatient_revenue_classification_data.urban_resident_insurance IS '城镇居民基本医疗保险';
COMMENT ON COLUMN inpatient_revenue_classification_data.urban_rural_insurance IS '城乡居民医疗保险';
COMMENT ON COLUMN inpatient_revenue_classification_data.new_rural_cooperative IS '新型农村合作医疗';
COMMENT ON COLUMN inpatient_revenue_classification_data.commercial_insurance IS '商业医疗保险';
COMMENT ON COLUMN inpatient_revenue_classification_data.full_public_expense IS '全公费';
COMMENT ON COLUMN inpatient_revenue_classification_data.full_self_pay IS '全自费';
COMMENT ON COLUMN inpatient_revenue_classification_data.poverty_assistance IS '贫困救助';
COMMENT ON COLUMN inpatient_revenue_classification_data.other_payment IS '其他支付方式';
COMMENT ON COLUMN inpatient_revenue_classification_data.bed_revenue IS '床位收入';
COMMENT ON COLUMN inpatient_revenue_classification_data.consultation_revenue IS '诊察收入';
COMMENT ON COLUMN inpatient_revenue_classification_data.examination_revenue IS '检查收入';
COMMENT ON COLUMN inpatient_revenue_classification_data.laboratory_revenue IS '化验收入';
COMMENT ON COLUMN inpatient_revenue_classification_data.surgery_revenue IS '手术收入';
COMMENT ON COLUMN inpatient_revenue_classification_data.nursing_revenue IS '护理收入';
COMMENT ON COLUMN inpatient_revenue_classification_data.medical_material_revenue IS '卫生材料收入';
COMMENT ON COLUMN inpatient_revenue_classification_data.drug_revenue IS '药品收入';
COMMENT ON COLUMN inpatient_revenue_classification_data.pharmaceutical_service_revenue IS '药事服务费收入';
COMMENT ON COLUMN inpatient_revenue_classification_data.other_inpatient_revenue IS '其他住院收入';
COMMENT ON COLUMN inpatient_revenue_classification_data.diagnosis_treatment_revenue IS '诊疗项目收入';

-- 住院收入分类汇总数据表
CREATE TABLE IF NOT EXISTS inpatient_revenue_classification_summary (
    id BIGSERIAL PRIMARY KEY,
    time_range VARCHAR(20) NOT NULL CHECK (time_range IN ('day', 'month', 'quarter', 'year')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    basic_medical_insurance_ratio DECIMAL(10,2) DEFAULT 0,
    service_revenue_ratio DECIMAL(10,2) DEFAULT 0,
    medical_payment_method_ratio DECIMAL(10,2) DEFAULT 0,
    patient_medication_structure DECIMAL(10,2) DEFAULT 0,
    charge_item_analysis DECIMAL(10,2) DEFAULT 0,
    total_inpatient_revenue DECIMAL(15,2) DEFAULT 0,
    total_basic_medical_insurance_revenue DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_inpatient_revenue_classification_summary_time_range_period ON inpatient_revenue_classification_summary(time_range, period_start, period_end);

-- 添加表注释
COMMENT ON TABLE inpatient_revenue_classification_summary IS '住院收入分类汇总数据表';
COMMENT ON COLUMN inpatient_revenue_classification_summary.time_range IS '时间范围';
COMMENT ON COLUMN inpatient_revenue_classification_summary.period_start IS '统计期间开始日期';
COMMENT ON COLUMN inpatient_revenue_classification_summary.period_end IS '统计期间结束日期';
COMMENT ON COLUMN inpatient_revenue_classification_summary.basic_medical_insurance_ratio IS '住院收入基本医疗保险占比';
COMMENT ON COLUMN inpatient_revenue_classification_summary.service_revenue_ratio IS '住院服务收入占比';
COMMENT ON COLUMN inpatient_revenue_classification_summary.medical_payment_method_ratio IS '住院收入医疗费用支付方式占比分析';
COMMENT ON COLUMN inpatient_revenue_classification_summary.patient_medication_structure IS '住院收入患者医药费用构成';
COMMENT ON COLUMN inpatient_revenue_classification_summary.charge_item_analysis IS '住院收入按费用项目类别分析';
COMMENT ON COLUMN inpatient_revenue_classification_summary.total_inpatient_revenue IS '住院收入总额';
COMMENT ON COLUMN inpatient_revenue_classification_summary.total_basic_medical_insurance_revenue IS '基本医疗保险收入总额';

-- 创建更新时间触发器函数（如果不存在）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为两个表创建更新时间触发器
CREATE TRIGGER update_inpatient_revenue_classification_data_updated_at BEFORE UPDATE
    ON inpatient_revenue_classification_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inpatient_revenue_classification_summary_updated_at BEFORE UPDATE
    ON inpatient_revenue_classification_summary FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 创建视图用于住院收入分类分析
CREATE OR REPLACE VIEW inpatient_revenue_classification_analysis_view AS
SELECT 
    date_period,
    total_inpatient_revenue,
    basic_medical_insurance_revenue,
    CASE 
        WHEN total_inpatient_revenue > 0 
        THEN (basic_medical_insurance_revenue / total_inpatient_revenue) * 100
        ELSE 0 
    END as basic_medical_insurance_ratio,
    CASE 
        WHEN total_inpatient_revenue > 0 
        THEN ((total_inpatient_revenue - pathology_diagnosis_fee - laboratory_diagnosis_fee 
              - imaging_diagnosis_fee - clinical_diagnosis_fee - western_medicine_fee 
              - antibacterial_drug_fee - chinese_patent_medicine_fee - chinese_herbal_medicine_fee 
              - examination_fee - disposable_material_fee_1 - treatment_fee 
              - disposable_material_fee_2 - surgery_fee - disposable_material_fee_3) 
              / total_inpatient_revenue) * 100
        ELSE 0 
    END as service_revenue_ratio,
    CASE 
        WHEN total_inpatient_revenue > 0 
        THEN ((urban_resident_insurance + urban_rural_insurance + new_rural_cooperative 
              + commercial_insurance + full_public_expense + full_self_pay 
              + poverty_assistance + other_payment) / total_inpatient_revenue) * 100
        ELSE 0 
    END as medical_payment_method_ratio,
    CASE 
        WHEN total_inpatient_revenue > 0 
        THEN ((bed_revenue + consultation_revenue + examination_revenue 
              + laboratory_revenue + surgery_revenue + nursing_revenue 
              + medical_material_revenue + drug_revenue + pharmaceutical_service_revenue 
              + other_inpatient_revenue) / total_inpatient_revenue) * 100
        ELSE 0 
    END as patient_medication_structure,
    CASE 
        WHEN total_inpatient_revenue > 0 
        THEN ((drug_revenue + diagnosis_treatment_revenue + medical_material_revenue) 
              / total_inpatient_revenue) * 100
        ELSE 0 
    END as charge_item_analysis
FROM inpatient_revenue_classification_data
ORDER BY date_period;

-- 添加视图注释
COMMENT ON VIEW inpatient_revenue_classification_analysis_view IS '住院收入分类分析视图，包含计算后的各项指标';
"""

# 使用示例
if __name__ == "__main__":
    # 示例：如何使用住院收入分类服务
    
    # 1. 创建服务实例（需要传入PostgreSQL数据库连接）
    # import psycopg2
    # db_connection = psycopg2.connect(
    #     host='localhost',
    #     user='your_username',
    #     password='your_password',
    #     database='your_database',
    #     port='5432'
    # )
    # service = InpatientRevenueClassificationService(db_connection)
    
    # 2. 不使用数据库连接的示例
    service = InpatientRevenueClassificationService()
    
    try:
        # 获取月度数据
        monthly_data = service.get_revenue_classification_data('month', '2024-01-01', '2024-12-31')
        print(f"获取到 {len(monthly_data)} 条月度数据")
        
        # 获取指标摘要
        summary = service.get_indicators_summary('month')
        print(f"指标摘要: {summary}")
        
        # 获取同比分析
        yoy_analysis = service.get_comparison_analysis('basic_medical_insurance_ratio', '2024-01-01', 'yoy')
        print(f"同比分析: {yoy_analysis}")
        
        # 使用计算器计算指标
        calculator = InpatientRevenueClassificationCalculator()
        basic_insurance_ratio = calculator.calculate_basic_medical_insurance_ratio(500000, 1000000)
        print(f"住院收入基本医疗保险占比: {basic_insurance_ratio}%")
        
        service_ratio = calculator.calculate_service_revenue_ratio(
            1000000, 50000, 30000, 40000, 20000, 200000, 
            15000, 80000, 60000, 25000, 10000, 35000, 
            8000, 45000, 12000
        )
        print(f"住院服务收入占比: {service_ratio}%")
        
    except Exception as e:
        print(f"执行失败: {e}")