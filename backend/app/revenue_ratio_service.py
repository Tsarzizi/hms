"""
门急诊收入占比数据处理模块
提供门急诊收入占比相关指标的数据查询和计算功能
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
class RevenueRatioData:
    """门急诊收入占比数据模型"""
    basic_insurance_ratio: float = 0.0  # 门诊基本医疗保险收入占医疗收入的比重(%)
    material_cost_ratio: float = 0.0  # 门急诊材料费用占门急诊收入的比重(%)
    medical_service_ratio: float = 0.0  # 门诊医疗服务收入占医疗收入比重(%)
    special_outpatient_ratio: float = 0.0  # 特需门诊收入占比(%)
    medical_expenditure_ratio: float = 0.0  # 百元门急诊收入的医疗支出(不含药品收入)
    material_expenditure_ratio: float = 0.0  # 百元门急诊收入消耗卫生材料(不含药品收入)

@dataclass
class RevenueRatioResponse:
    """门急诊收入占比响应数据模型"""
    date: str
    data: RevenueRatioData

@dataclass
class ComparisonData:
    """同比环比数据模型"""
    current_value: float
    comparison_value: float
    change_rate: float
    change_type: str  # 'increase', 'decrease', 'stable'

class RevenueRatioService:
    """门急诊收入占比服务类"""
    
    def __init__(self, db_connection=None):
        """
        初始化服务
        :param db_connection: PostgreSQL数据库连接对象
        """
        self.db_connection = db_connection
        
    def get_revenue_ratio_data(
        self, 
        time_range: str, 
        start_date: Optional[str] = None, 
        end_date: Optional[str] = None
    ) -> List[RevenueRatioResponse]:
        """
        获取门急诊收入占比数据
        
        :param time_range: 时间范围 ('day', 'month', 'quarter', 'year')
        :param start_date: 开始日期 (YYYY-MM-DD)
        :param end_date: 结束日期 (YYYY-MM-DD)
        :return: 门急诊收入占比数据列表
        """
        try:
            logger.info(f"查询门急诊收入占比数据 - 时间范围: {time_range}, 开始日期: {start_date}, 结束日期: {end_date}")
            
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
                data = RevenueRatioData(
                    basic_insurance_ratio=float(row[1]) if row[1] else 0.0,
                    material_cost_ratio=float(row[2]) if row[2] else 0.0,
                    medical_service_ratio=float(row[3]) if row[3] else 0.0,
                    special_outpatient_ratio=float(row[4]) if row[4] else 0.0,
                    medical_expenditure_ratio=float(row[5]) if row[5] else 0.0,
                    material_expenditure_ratio=float(row[6]) if row[6] else 0.0
                )
                
                response = RevenueRatioResponse(
                    date=str(row[0]),
                    data=data
                )
                data_list.append(response)
            
            cursor.close()
            logger.info(f"成功获取 {len(data_list)} 条数据")
            return data_list
            
        except Exception as e:
            logger.error(f"获取门急诊收入占比数据失败: {str(e)}")
            raise Exception(f"数据获取失败: {str(e)}")
    
    def get_indicators_summary(self, time_range: str) -> RevenueRatioData:
        """
        获取指标统计摘要
        
        :param time_range: 时间范围
        :return: 指标摘要数据
        """
        try:
            logger.info(f"获取指标摘要 - 时间范围: {time_range}")
            
            if not self.db_connection:
                logger.warning("数据库连接未配置，返回默认数据")
                return RevenueRatioData()
            
            # 构建摘要查询SQL
            summary_query = """
            SELECT 
                AVG(basic_insurance_ratio) as avg_basic_insurance_ratio,
                AVG(material_cost_ratio) as avg_material_cost_ratio,
                AVG(medical_service_ratio) as avg_medical_service_ratio,
                AVG(special_outpatient_ratio) as avg_special_outpatient_ratio,
                AVG(medical_expenditure_ratio) as avg_medical_expenditure_ratio,
                AVG(material_expenditure_ratio) as avg_material_expenditure_ratio
            FROM revenue_ratio_summary 
            WHERE time_range = %s
            """
            
            cursor = self.db_connection.cursor()
            cursor.execute(summary_query, (time_range,))
            result = cursor.fetchone()
            cursor.close()
            
            if result:
                return RevenueRatioData(
                    basic_insurance_ratio=float(result[0]) if result[0] else 0.0,
                    material_cost_ratio=float(result[1]) if result[1] else 0.0,
                    medical_service_ratio=float(result[2]) if result[2] else 0.0,
                    special_outpatient_ratio=float(result[3]) if result[3] else 0.0,
                    medical_expenditure_ratio=float(result[4]) if result[4] else 0.0,
                    material_expenditure_ratio=float(result[5]) if result[5] else 0.0
                )
            else:
                return RevenueRatioData()
                
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
                FROM revenue_ratio_data current_data
                LEFT JOIN revenue_ratio_data previous_data 
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
                FROM revenue_ratio_data current_data
                LEFT JOIN revenue_ratio_data previous_data 
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
            -- 门诊基本医疗保险收入占医疗收入的比重(%)
            CASE 
                WHEN SUM(outpatient_revenue) > 0 
                THEN (SUM(basic_insurance_revenue)::FLOAT / SUM(outpatient_revenue)) * 100
                ELSE 0 
            END as basic_insurance_ratio,
            -- 门急诊材料费用占门急诊收入的比重(%)
            CASE 
                WHEN SUM(outpatient_emergency_revenue) > 0 
                THEN (SUM(material_cost)::FLOAT / SUM(outpatient_emergency_revenue)) * 100
                ELSE 0 
            END as material_cost_ratio,
            -- 门诊医疗服务收入占医疗收入比重(%)
            CASE 
                WHEN SUM(outpatient_revenue) > 0 
                THEN ((SUM(outpatient_revenue) - SUM(drug_revenue) - SUM(material_revenue) - SUM(examination_revenue) - SUM(laboratory_revenue) - SUM(other_revenue))::FLOAT / SUM(outpatient_revenue)) * 100
                ELSE 0 
            END as medical_service_ratio,
            -- 特需门诊收入占比(%)
            CASE 
                WHEN SUM(outpatient_revenue) > 0 
                THEN (SUM(special_outpatient_revenue)::FLOAT / SUM(outpatient_revenue)) * 100
                ELSE 0 
            END as special_outpatient_ratio,
            -- 百元门急诊收入的医疗支出(不含药品收入)
            CASE 
                WHEN SUM(outpatient_emergency_revenue - drug_revenue) > 0 
                THEN ((SUM(business_cost) + SUM(management_cost) - SUM(drug_cost))::FLOAT / SUM(outpatient_emergency_revenue - drug_revenue)) * 100
                ELSE 0 
            END as medical_expenditure_ratio,
            -- 百元门急诊收入消耗卫生材料(不含药品收入)
            CASE 
                WHEN SUM(outpatient_emergency_revenue - drug_revenue) > 0 
                THEN (SUM(material_cost)::FLOAT / SUM(outpatient_emergency_revenue - drug_revenue)) * 100
                ELSE 0 
            END as material_expenditure_ratio
        FROM revenue_ratio_data 
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
            start_date = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')
        if not end_date:
            end_date = datetime.now().strftime('%Y-%m-%d')
        
        return (start_date, end_date)

class RevenueRatioCalculator:
    """门急诊收入占比指标计算器"""
    
    @staticmethod
    def calculate_basic_insurance_ratio(basic_insurance_revenue: float, outpatient_revenue: float) -> float:
        """
        计算门诊基本医疗保险收入占医疗收入的比重
        门诊基本医疗保险收入占医疗收入的比重(%) = 门诊基本医疗保险收入/门诊收入×100%
        
        :param basic_insurance_revenue: 门诊基本医疗保险收入
        :param outpatient_revenue: 门诊收入
        :return: 门诊基本医疗保险收入占医疗收入的比重(%)
        """
        if outpatient_revenue == 0:
            return 0.0
        return (basic_insurance_revenue / outpatient_revenue) * 100
    
    @staticmethod
    def calculate_material_cost_ratio(material_cost: float, outpatient_emergency_revenue: float) -> float:
        """
        计算门急诊材料费用占门急诊收入的比重
        门急诊材料费用占门急诊收入的比重(%) = 门急诊材料费用/门急诊收入×100%
        
        :param material_cost: 门急诊材料费用
        :param outpatient_emergency_revenue: 门急诊收入
        :return: 门急诊材料费用占门急诊收入的比重(%)
        """
        if outpatient_emergency_revenue == 0:
            return 0.0
        return (material_cost / outpatient_emergency_revenue) * 100
    
    @staticmethod
    def calculate_medical_service_ratio(
        outpatient_revenue: float,
        drug_revenue: float,
        material_revenue: float,
        examination_revenue: float,
        laboratory_revenue: float,
        other_revenue: float
    ) -> float:
        """
        计算门诊医疗服务收入占医疗收入比重
        门诊医疗服务收入占门诊收入比重(%) = [(门诊收入-药品收入-卫生材料收入-检查收入-化验收入-其他收入)/门诊收入]×100%
        
        :param outpatient_revenue: 门诊收入
        :param drug_revenue: 药品收入
        :param material_revenue: 卫生材料收入
        :param examination_revenue: 检查收入
        :param laboratory_revenue: 化验收入
        :param other_revenue: 其他收入
        :return: 门诊医疗服务收入占医疗收入比重(%)
        """
        if outpatient_revenue == 0:
            return 0.0
        
        medical_service_revenue = outpatient_revenue - drug_revenue - material_revenue - examination_revenue - laboratory_revenue - other_revenue
        return (medical_service_revenue / outpatient_revenue) * 100
    
    @staticmethod
    def calculate_special_outpatient_ratio(special_outpatient_revenue: float, outpatient_revenue: float) -> float:
        """
        计算特需门诊收入占比
        特需门诊收入占比 = (挂号类别为"特需门诊"的门诊费用汇总求和/门诊收入) *100%
        
        :param special_outpatient_revenue: 特需门诊收入
        :param outpatient_revenue: 门诊收入
        :return: 特需门诊收入占比(%)
        """
        if outpatient_revenue == 0:
            return 0.0
        return (special_outpatient_revenue / outpatient_revenue) * 100
    
    @staticmethod
    def calculate_medical_expenditure_ratio(
        business_cost: float,
        management_cost: float,
        drug_cost: float,
        outpatient_emergency_revenue: float,
        drug_revenue: float
    ) -> float:
        """
        计算百元门急诊收入的医疗支出(不含药品收入)
        百元门急诊收入的医疗支出(不含药品收入) = [(门急诊业务成本+管理费用-药品费) ÷ (门急诊收入-药品收入)]×100
        
        :param business_cost: 门急诊业务成本
        :param management_cost: 管理费用
        :param drug_cost: 药品费
        :param outpatient_emergency_revenue: 门急诊收入
        :param drug_revenue: 药品收入
        :return: 百元门急诊收入的医疗支出(元)
        """
        revenue_excluding_drugs = outpatient_emergency_revenue - drug_revenue
        if revenue_excluding_drugs == 0:
            return 0.0
        
        medical_expenditure = business_cost + management_cost - drug_cost
        return (medical_expenditure / revenue_excluding_drugs) * 100
    
    @staticmethod
    def calculate_material_expenditure_ratio(
        material_cost: float,
        outpatient_emergency_revenue: float,
        drug_revenue: float
    ) -> float:
        """
        计算百元门急诊收入消耗卫生材料(不含药品收入)
        百元门急诊收入消耗卫生材料(不含药品收入) = [卫生材料费 ÷ (门急诊收入-药品收入)]×100
        
        :param material_cost: 卫生材料费
        :param outpatient_emergency_revenue: 门急诊收入
        :param drug_revenue: 药品收入
        :return: 百元门急诊收入消耗卫生材料(元)
        """
        revenue_excluding_drugs = outpatient_emergency_revenue - drug_revenue
        if revenue_excluding_drugs == 0:
            return 0.0
        
        return (material_cost / revenue_excluding_drugs) * 100
    
    @staticmethod
    def analyze_ratio_trend(data_list: List[RevenueRatioData]) -> Dict[str, str]:
        """
        分析收入占比趋势
        
        :param data_list: 收入占比数据列表
        :return: 趋势分析结果
        """
        if len(data_list) < 2:
            return {
                'basic_insurance_ratio_trend': 'stable',
                'material_cost_ratio_trend': 'stable',
                'medical_service_ratio_trend': 'stable',
                'special_outpatient_ratio_trend': 'stable',
                'medical_expenditure_ratio_trend': 'stable',
                'material_expenditure_ratio_trend': 'stable'
            }
        
        trends = {}
        indicators = [
            'basic_insurance_ratio',
            'material_cost_ratio', 
            'medical_service_ratio',
            'special_outpatient_ratio',
            'medical_expenditure_ratio',
            'material_expenditure_ratio'
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
-- 门急诊收入占比数据表
CREATE TABLE IF NOT EXISTS revenue_ratio_data (
    id BIGSERIAL PRIMARY KEY,
    date_period DATE NOT NULL,
    outpatient_revenue DECIMAL(15,2) DEFAULT 0,
    emergency_revenue DECIMAL(15,2) DEFAULT 0,
    outpatient_emergency_revenue DECIMAL(15,2) DEFAULT 0,
    basic_insurance_revenue DECIMAL(15,2) DEFAULT 0,
    material_cost DECIMAL(15,2) DEFAULT 0,
    drug_revenue DECIMAL(15,2) DEFAULT 0,
    material_revenue DECIMAL(15,2) DEFAULT 0,
    examination_revenue DECIMAL(15,2) DEFAULT 0,
    laboratory_revenue DECIMAL(15,2) DEFAULT 0,
    other_revenue DECIMAL(15,2) DEFAULT 0,
    special_outpatient_revenue DECIMAL(15,2) DEFAULT 0,
    business_cost DECIMAL(15,2) DEFAULT 0,
    management_cost DECIMAL(15,2) DEFAULT 0,
    drug_cost DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_revenue_ratio_data_date_period ON revenue_ratio_data(date_period);

-- 添加表注释
COMMENT ON TABLE revenue_ratio_data IS '门急诊收入占比数据表';
COMMENT ON COLUMN revenue_ratio_data.date_period IS '统计日期';
COMMENT ON COLUMN revenue_ratio_data.outpatient_revenue IS '门诊收入(元)';
COMMENT ON COLUMN revenue_ratio_data.emergency_revenue IS '急诊收入(元)';
COMMENT ON COLUMN revenue_ratio_data.outpatient_emergency_revenue IS '门急诊收入(元)';
COMMENT ON COLUMN revenue_ratio_data.basic_insurance_revenue IS '门诊基本医疗保险收入(元)';
COMMENT ON COLUMN revenue_ratio_data.material_cost IS '材料费用(元)';
COMMENT ON COLUMN revenue_ratio_data.drug_revenue IS '药品收入(元)';
COMMENT ON COLUMN revenue_ratio_data.material_revenue IS '卫生材料收入(元)';
COMMENT ON COLUMN revenue_ratio_data.examination_revenue IS '检查收入(元)';
COMMENT ON COLUMN revenue_ratio_data.laboratory_revenue IS '化验收入(元)';
COMMENT ON COLUMN revenue_ratio_data.other_revenue IS '其他收入(元)';
COMMENT ON COLUMN revenue_ratio_data.special_outpatient_revenue IS '特需门诊收入(元)';
COMMENT ON COLUMN revenue_ratio_data.business_cost IS '业务成本(元)';
COMMENT ON COLUMN revenue_ratio_data.management_cost IS '管理费用(元)';
COMMENT ON COLUMN revenue_ratio_data.drug_cost IS '药品费用(元)';

-- 门急诊收入占比汇总数据表
CREATE TABLE IF NOT EXISTS revenue_ratio_summary (
    id BIGSERIAL PRIMARY KEY,
    time_range VARCHAR(20) NOT NULL CHECK (time_range IN ('day', 'month', 'quarter', 'year')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    basic_insurance_ratio DECIMAL(10,2) DEFAULT 0,
    material_cost_ratio DECIMAL(10,2) DEFAULT 0,
    medical_service_ratio DECIMAL(10,2) DEFAULT 0,
    special_outpatient_ratio DECIMAL(10,2) DEFAULT 0,
    medical_expenditure_ratio DECIMAL(10,2) DEFAULT 0,
    material_expenditure_ratio DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_revenue_ratio_summary_time_range_period ON revenue_ratio_summary(time_range, period_start, period_end);

-- 添加表注释
COMMENT ON TABLE revenue_ratio_summary IS '门急诊收入占比汇总数据表';
COMMENT ON COLUMN revenue_ratio_summary.time_range IS '时间范围';
COMMENT ON COLUMN revenue_ratio_summary.period_start IS '统计期间开始日期';
COMMENT ON COLUMN revenue_ratio_summary.period_end IS '统计期间结束日期';
COMMENT ON COLUMN revenue_ratio_summary.basic_insurance_ratio IS '门诊基本医疗保险收入占医疗收入的比重(%)';
COMMENT ON COLUMN revenue_ratio_summary.material_cost_ratio IS '门急诊材料费用占门急诊收入的比重(%)';
COMMENT ON COLUMN revenue_ratio_summary.medical_service_ratio IS '门诊医疗服务收入占医疗收入比重(%)';
COMMENT ON COLUMN revenue_ratio_summary.special_outpatient_ratio IS '特需门诊收入占比(%)';
COMMENT ON COLUMN revenue_ratio_summary.medical_expenditure_ratio IS '百元门急诊收入的医疗支出(元)';
COMMENT ON COLUMN revenue_ratio_summary.material_expenditure_ratio IS '百元门急诊收入消耗卫生材料(元)';

-- 创建更新时间触发器函数（如果不存在）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为两个表创建更新时间触发器
CREATE TRIGGER update_revenue_ratio_data_updated_at BEFORE UPDATE
    ON revenue_ratio_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_revenue_ratio_summary_updated_at BEFORE UPDATE
    ON revenue_ratio_summary FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 创建视图用于门急诊收入占比分析
CREATE OR REPLACE VIEW revenue_ratio_analysis_view AS
SELECT 
    date_period,
    outpatient_revenue,
    emergency_revenue,
    outpatient_emergency_revenue,
    -- 门诊基本医疗保险收入占医疗收入的比重(%)
    CASE 
        WHEN outpatient_revenue > 0 
        THEN (basic_insurance_revenue::FLOAT / outpatient_revenue) * 100
        ELSE 0 
    END as basic_insurance_ratio,
    -- 门急诊材料费用占门急诊收入的比重(%)
    CASE 
        WHEN outpatient_emergency_revenue > 0 
        THEN (material_cost::FLOAT / outpatient_emergency_revenue) * 100
        ELSE 0 
    END as material_cost_ratio,
    -- 门诊医疗服务收入占医疗收入比重(%)
    CASE 
        WHEN outpatient_revenue > 0 
        THEN ((outpatient_revenue - drug_revenue - material_revenue - examination_revenue - laboratory_revenue - other_revenue)::FLOAT / outpatient_revenue) * 100
        ELSE 0 
    END as medical_service_ratio,
    -- 特需门诊收入占比(%)
    CASE 
        WHEN outpatient_revenue > 0 
        THEN (special_outpatient_revenue::FLOAT / outpatient_revenue) * 100
        ELSE 0 
    END as special_outpatient_ratio,
    -- 百元门急诊收入的医疗支出(不含药品收入)
    CASE 
        WHEN (outpatient_emergency_revenue - drug_revenue) > 0 
        THEN ((business_cost + management_cost - drug_cost)::FLOAT / (outpatient_emergency_revenue - drug_revenue)) * 100
        ELSE 0 
    END as medical_expenditure_ratio,
    -- 百元门急诊收入消耗卫生材料(不含药品收入)
    CASE 
        WHEN (outpatient_emergency_revenue - drug_revenue) > 0 
        THEN (material_cost::FLOAT / (outpatient_emergency_revenue - drug_revenue)) * 100
        ELSE 0 
    END as material_expenditure_ratio
FROM revenue_ratio_data
ORDER BY date_period;

-- 添加视图注释
COMMENT ON VIEW revenue_ratio_analysis_view IS '门急诊收入占比分析视图，包含计算后的各项指标';
"""

# 使用示例
if __name__ == "__main__":
    # 示例：如何使用门急诊收入占比服务
    
    # 1. 创建服务实例（需要传入PostgreSQL数据库连接）
    # import psycopg2
    # db_connection = psycopg2.connect(
    #     host='localhost',
    #     user='your_username',
    #     password='your_password',
    #     database='your_database',
    #     port='5432'
    # )
    # service = RevenueRatioService(db_connection)
    
    # 2. 不使用数据库连接的示例
    service = RevenueRatioService()
    
    try:
        # 获取月度数据
        monthly_data = service.get_revenue_ratio_data('month', '2024-01-01', '2024-12-31')
        print(f"获取到 {len(monthly_data)} 条月度数据")
        
        # 获取指标摘要
        summary = service.get_indicators_summary('month')
        print(f"指标摘要: {summary}")
        
        # 获取同比分析
        yoy_analysis = service.get_comparison_analysis('basic_insurance_ratio', '2024-01-01', 'yoy')
        print(f"同比分析: {yoy_analysis}")
        
        # 使用计算器计算指标
        calculator = RevenueRatioCalculator()
        basic_insurance_ratio = calculator.calculate_basic_insurance_ratio(800000.0, 1000000.0)
        print(f"门诊基本医疗保险收入占医疗收入的比重: {basic_insurance_ratio}%")
        
        material_cost_ratio = calculator.calculate_material_cost_ratio(150000.0, 1500000.0)
        print(f"门急诊材料费用占门急诊收入的比重: {material_cost_ratio}%")
        
    except Exception as e:
        print(f"执行失败: {e}")