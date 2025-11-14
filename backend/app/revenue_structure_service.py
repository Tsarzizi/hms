"""
门急诊收入结构数据处理模块
提供门急诊收入结构相关指标的数据查询和计算功能
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
class RevenueStructureData:
    """门急诊收入结构数据模型"""
    drug_cost_structure: float = 0.0  # 门诊患者医药费用构成(%)
    department_revenue_structure: float = 0.0  # 门诊各科室收入构成(%)
    regional_revenue_structure: float = 0.0  # 门诊按地域来源收入构成(%)

@dataclass
class RevenueStructureResponse:
    """门急诊收入结构响应数据模型"""
    date: str
    data: RevenueStructureData

@dataclass
class ComparisonData:
    """同比环比数据模型"""
    current_value: float
    comparison_value: float
    change_rate: float
    change_type: str  # 'increase', 'decrease', 'stable'

class RevenueStructureService:
    """门急诊收入结构服务类"""
    
    def __init__(self, db_connection=None):
        """
        初始化服务
        :param db_connection: PostgreSQL数据库连接对象
        """
        self.db_connection = db_connection
        
    def get_revenue_structure_data(
        self, 
        time_range: str, 
        start_date: Optional[str] = None, 
        end_date: Optional[str] = None
    ) -> List[RevenueStructureResponse]:
        """
        获取门急诊收入结构数据
        
        :param time_range: 时间范围 ('day', 'month', 'quarter', 'year')
        :param start_date: 开始日期 (YYYY-MM-DD)
        :param end_date: 结束日期 (YYYY-MM-DD)
        :return: 门急诊收入结构数据列表
        """
        try:
            logger.info(f"查询门急诊收入结构数据 - 时间范围: {time_range}, 开始日期: {start_date}, 结束日期: {end_date}")
            
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
                data = RevenueStructureData(
                    drug_cost_structure=float(row[1]) if row[1] else 0.0,
                    department_revenue_structure=float(row[2]) if row[2] else 0.0,
                    regional_revenue_structure=float(row[3]) if row[3] else 0.0
                )
                
                response = RevenueStructureResponse(
                    date=str(row[0]),
                    data=data
                )
                data_list.append(response)
            
            cursor.close()
            logger.info(f"成功获取 {len(data_list)} 条数据")
            return data_list
            
        except Exception as e:
            logger.error(f"获取门急诊收入结构数据失败: {str(e)}")
            raise Exception(f"数据获取失败: {str(e)}")
    
    def get_indicators_summary(self, time_range: str) -> RevenueStructureData:
        """
        获取指标统计摘要
        
        :param time_range: 时间范围
        :return: 指标摘要数据
        """
        try:
            logger.info(f"获取指标摘要 - 时间范围: {time_range}")
            
            if not self.db_connection:
                logger.warning("数据库连接未配置，返回默认数据")
                return RevenueStructureData()
            
            # 构建摘要查询SQL
            summary_query = """
            SELECT 
                AVG(drug_cost_structure) as avg_drug_cost_structure,
                AVG(department_revenue_structure) as avg_department_revenue_structure,
                AVG(regional_revenue_structure) as avg_regional_revenue_structure
            FROM outpatient_emergency_revenue_structure_summary 
            WHERE time_range = %s
            """
            
            cursor = self.db_connection.cursor()
            cursor.execute(summary_query, (time_range,))
            result = cursor.fetchone()
            cursor.close()
            
            if result:
                return RevenueStructureData(
                    drug_cost_structure=float(result[0]) if result[0] else 0.0,
                    department_revenue_structure=float(result[1]) if result[1] else 0.0,
                    regional_revenue_structure=float(result[2]) if result[2] else 0.0
                )
            else:
                return RevenueStructureData()
                
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
                FROM outpatient_emergency_revenue_structure_data current_data
                LEFT JOIN outpatient_emergency_revenue_structure_data previous_data 
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
                FROM outpatient_emergency_revenue_structure_data current_data
                LEFT JOIN outpatient_emergency_revenue_structure_data previous_data 
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
            -- 门诊患者医药费用构成(%) = 各项目费用/门诊收入×100%
            (SUM(
                CASE 
                    WHEN charge_type_code = '门诊' AND item_type IN ('药品费用', '检查费用', '化验费用', '治疗费用', '手术费用', '材料费用', '其他费用')
                    THEN total_cost 
                    ELSE 0 
                END
            ) / NULLIF(SUM(
                CASE 
                    WHEN charge_type_code = '门诊' 
                    THEN total_cost 
                    ELSE 0 
                END
            ), 0)) * 100 as drug_cost_structure,
            -- 门诊各科室收入构成(%) = 某科室收入/门诊收入×100%
            (SUM(
                CASE 
                    WHEN charge_type_code = '门诊' AND department_code IS NOT NULL
                    THEN total_cost 
                    ELSE 0 
                END
            ) / NULLIF(SUM(
                CASE 
                    WHEN charge_type_code = '门诊' 
                    THEN total_cost 
                    ELSE 0 
                END
            ), 0)) * 100 as department_revenue_structure,
            -- 门诊按地域来源收入构成(%) = 各地患者门诊收入/门诊总收入×100%
            (SUM(
                CASE 
                    WHEN charge_type_code = '门诊' AND patient_region IS NOT NULL
                    THEN total_cost 
                    ELSE 0 
                END
            ) / NULLIF(SUM(
                CASE 
                    WHEN charge_type_code = '门诊' 
                    THEN total_cost 
                    ELSE 0 
                END
            ), 0)) * 100 as regional_revenue_structure
        FROM hospital_revenue_structure_data 
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

class RevenueStructureCalculator:
    """门急诊收入结构指标计算器"""
    
    @staticmethod
    def calculate_drug_cost_structure(item_costs: Dict[str, float], total_outpatient_revenue: float) -> float:
        """
        计算门诊患者医药费用构成
        各项目费用构成(%) = 各项目费用/门诊收入×100%
        
        :param item_costs: 各项目费用字典
        :param total_outpatient_revenue: 门诊总收入
        :return: 医药费用构成百分比
        """
        if total_outpatient_revenue == 0:
            return 0.0
        
        total_item_cost = sum(item_costs.values())
        return (total_item_cost / total_outpatient_revenue) * 100
    
    @staticmethod
    def calculate_department_revenue_structure(department_revenue: float, total_outpatient_revenue: float) -> float:
        """
        计算门诊各科室收入构成
        科室收入构成(%) = 某科室收入/门诊收入×100%
        
        :param department_revenue: 某科室收入
        :param total_outpatient_revenue: 门诊总收入
        :return: 科室收入构成百分比
        """
        if total_outpatient_revenue == 0:
            return 0.0
        
        return (department_revenue / total_outpatient_revenue) * 100
    
    @staticmethod
    def calculate_regional_revenue_structure(regional_revenue: float, total_outpatient_revenue: float) -> float:
        """
        计算门诊按地域来源收入构成
        患者地域来源收入构成(%) = 各地患者门诊收入/门诊总收入×100%
        
        :param regional_revenue: 某地区患者门诊收入
        :param total_outpatient_revenue: 门诊总收入
        :return: 地域来源收入构成百分比
        """
        if total_outpatient_revenue == 0:
            return 0.0
        
        return (regional_revenue / total_outpatient_revenue) * 100
    
    @staticmethod
    def analyze_structure_trend(data_list: List[RevenueStructureData]) -> Dict[str, str]:
        """
        分析收入结构趋势
        
        :param data_list: 收入结构数据列表
        :return: 趋势分析结果
        """
        if len(data_list) < 2:
            return {
                'drug_cost_structure_trend': 'stable',
                'department_revenue_structure_trend': 'stable',
                'regional_revenue_structure_trend': 'stable'
            }
        
        trends = {}
        indicators = [
            'drug_cost_structure',
            'department_revenue_structure', 
            'regional_revenue_structure'
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
-- 门急诊收入结构数据表
CREATE TABLE IF NOT EXISTS outpatient_emergency_revenue_structure_data (
    id BIGSERIAL PRIMARY KEY,
    date_period DATE NOT NULL,
    charge_type_code VARCHAR(20) NOT NULL CHECK (charge_type_code IN ('门诊', '急诊')),
    item_type VARCHAR(50),
    department_code VARCHAR(20),
    department_name VARCHAR(100),
    patient_region VARCHAR(100),
    total_cost DECIMAL(15,2) DEFAULT 0,
    patient_count INTEGER DEFAULT 0,
    visit_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_outpatient_emergency_revenue_structure_date_period ON outpatient_emergency_revenue_structure_data(date_period);
CREATE INDEX IF NOT EXISTS idx_outpatient_emergency_revenue_structure_charge_type ON outpatient_emergency_revenue_structure_data(charge_type_code);
CREATE INDEX IF NOT EXISTS idx_outpatient_emergency_revenue_structure_item_type ON outpatient_emergency_revenue_structure_data(item_type);
CREATE INDEX IF NOT EXISTS idx_outpatient_emergency_revenue_structure_department ON outpatient_emergency_revenue_structure_data(department_code);
CREATE INDEX IF NOT EXISTS idx_outpatient_emergency_revenue_structure_region ON outpatient_emergency_revenue_structure_data(patient_region);

-- 添加表注释
COMMENT ON TABLE outpatient_emergency_revenue_structure_data IS '门急诊收入结构数据表';
COMMENT ON COLUMN outpatient_emergency_revenue_structure_data.date_period IS '统计日期';
COMMENT ON COLUMN outpatient_emergency_revenue_structure_data.charge_type_code IS '挂号类别代码(门诊/急诊)';
COMMENT ON COLUMN outpatient_emergency_revenue_structure_data.item_type IS '费用项目类型';
COMMENT ON COLUMN outpatient_emergency_revenue_structure_data.department_code IS '科室代码';
COMMENT ON COLUMN outpatient_emergency_revenue_structure_data.department_name IS '科室名称';
COMMENT ON COLUMN outpatient_emergency_revenue_structure_data.patient_region IS '患者地域';
COMMENT ON COLUMN outpatient_emergency_revenue_structure_data.total_cost IS '总费用(元)';
COMMENT ON COLUMN outpatient_emergency_revenue_structure_data.patient_count IS '患者人数';
COMMENT ON COLUMN outpatient_emergency_revenue_structure_data.visit_count IS '就诊人次';

-- 门急诊收入结构汇总数据表
CREATE TABLE IF NOT EXISTS outpatient_emergency_revenue_structure_summary (
    id BIGSERIAL PRIMARY KEY,
    time_range VARCHAR(20) NOT NULL CHECK (time_range IN ('day', 'month', 'quarter', 'year')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    drug_cost_structure DECIMAL(5,2) DEFAULT 0,
    department_revenue_structure DECIMAL(5,2) DEFAULT 0,
    regional_revenue_structure DECIMAL(5,2) DEFAULT 0,
    total_outpatient_revenue DECIMAL(15,2) DEFAULT 0,
    total_visit_count INTEGER DEFAULT 0,
    total_patient_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_outpatient_emergency_revenue_structure_summary_time_range_period ON outpatient_emergency_revenue_structure_summary(time_range, period_start, period_end);

-- 添加表注释
COMMENT ON TABLE outpatient_emergency_revenue_structure_summary IS '门急诊收入结构汇总数据表';
COMMENT ON COLUMN outpatient_emergency_revenue_structure_summary.time_range IS '时间范围';
COMMENT ON COLUMN outpatient_emergency_revenue_structure_summary.period_start IS '统计期间开始日期';
COMMENT ON COLUMN outpatient_emergency_revenue_structure_summary.period_end IS '统计期间结束日期';
COMMENT ON COLUMN outpatient_emergency_revenue_structure_summary.drug_cost_structure IS '门诊患者医药费用构成(%)';
COMMENT ON COLUMN outpatient_emergency_revenue_structure_summary.department_revenue_structure IS '门诊各科室收入构成(%)';
COMMENT ON COLUMN outpatient_emergency_revenue_structure_summary.regional_revenue_structure IS '门诊按地域来源收入构成(%)';

-- 创建更新时间触发器函数（如果不存在）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为两个表创建更新时间触发器
CREATE TRIGGER update_outpatient_emergency_revenue_structure_data_updated_at BEFORE UPDATE
    ON outpatient_emergency_revenue_structure_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_outpatient_emergency_revenue_structure_summary_updated_at BEFORE UPDATE
    ON outpatient_emergency_revenue_structure_summary FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 创建视图用于门急诊收入结构分析
CREATE OR REPLACE VIEW outpatient_emergency_revenue_structure_analysis_view AS
SELECT 
    date_period,
    charge_type_code,
    item_type,
    department_name,
    patient_region,
    SUM(total_cost) as total_revenue,
    SUM(patient_count) as total_patients,
    SUM(visit_count) as total_visits,
    CASE 
        WHEN SUM(visit_count) > 0 
        THEN SUM(total_cost) / SUM(visit_count)
        ELSE 0 
    END as average_revenue_per_visit
FROM outpatient_emergency_revenue_structure_data
GROUP BY date_period, charge_type_code, item_type, department_name, patient_region
ORDER BY date_period, charge_type_code, item_type, department_name, patient_region;

-- 添加视图注释
COMMENT ON VIEW outpatient_emergency_revenue_structure_analysis_view IS '门急诊收入结构分析视图，包含计算后的各项指标';
"""

# 使用示例
if __name__ == "__main__":
    # 示例：如何使用门急诊收入结构服务
    
    # 1. 创建服务实例（需要传入PostgreSQL数据库连接）
    # import psycopg2
    # db_connection = psycopg2.connect(
    #     host='localhost',
    #     user='your_username',
    #     password='your_password',
    #     database='your_database',
    #     port='5432'
    # )
    # service = RevenueStructureService(db_connection)
    
    # 2. 不使用数据库连接的示例
    service = RevenueStructureService()
    
    try:
        # 获取月度数据
        monthly_data = service.get_revenue_structure_data('month', '2024-01-01', '2024-12-31')
        print(f"获取到 {len(monthly_data)} 条月度数据")
        
        # 获取指标摘要
        summary = service.get_indicators_summary('month')
        print(f"指标摘要: {summary}")
        
        # 获取同比分析
        yoy_analysis = service.get_comparison_analysis('drug_cost_structure', '2024-01-01', 'yoy')
        print(f"同比分析: {yoy_analysis}")
        
        # 使用计算器计算指标
        calculator = RevenueStructureCalculator()
        item_costs = {'药品费用': 50000, '检查费用': 30000, '化验费用': 20000}
        drug_cost_structure = calculator.calculate_drug_cost_structure(item_costs, 200000)
        print(f"门诊患者医药费用构成: {drug_cost_structure}%")
        
    except Exception as e:
        print(f"执行失败: {e}")