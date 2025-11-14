"""
门急诊次均收入数据处理模块
提供次均收入相关指标的数据查询和计算功能
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
class AverageRevenueData:
    """次均收入数据模型"""
    medical_insurance_average_revenue: float = 0.0  # 医保患者次均费用(元)
    non_medical_insurance_average_revenue: float = 0.0  # 非医保患者次均费用(元)

@dataclass
class AverageRevenueResponse:
    """次均收入响应数据模型"""
    date: str
    data: AverageRevenueData

@dataclass
class ComparisonData:
    """同比环比数据模型"""
    current_value: float
    comparison_value: float
    change_rate: float
    change_type: str  # 'increase', 'decrease', 'stable'

class AverageRevenueService:
    """次均收入服务类"""
    
    def __init__(self, db_connection=None):
        """
        初始化服务
        :param db_connection: PostgreSQL数据库连接对象
        """
        self.db_connection = db_connection
        
    def get_average_revenue_data(
        self, 
        time_range: str, 
        start_date: Optional[str] = None, 
        end_date: Optional[str] = None
    ) -> List[AverageRevenueResponse]:
        """
        获取次均收入数据
        
        :param time_range: 时间范围 ('day', 'month', 'quarter', 'year')
        :param start_date: 开始日期 (YYYY-MM-DD)
        :param end_date: 结束日期 (YYYY-MM-DD)
        :return: 次均收入数据列表
        """
        try:
            logger.info(f"查询次均收入数据 - 时间范围: {time_range}, 开始日期: {start_date}, 结束日期: {end_date}")
            
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
                data = AverageRevenueData(
                    medical_insurance_average_revenue=row[1] or 0.0,
                    non_medical_insurance_average_revenue=row[2] or 0.0
                )
                
                response = AverageRevenueResponse(
                    date=str(row[0]),
                    data=data
                )
                data_list.append(response)
            
            cursor.close()
            logger.info(f"成功获取 {len(data_list)} 条数据")
            return data_list
            
        except Exception as e:
            logger.error(f"获取次均收入数据失败: {str(e)}")
            raise Exception(f"数据获取失败: {str(e)}")
    
    def get_indicators_summary(self, time_range: str) -> AverageRevenueData:
        """
        获取指标统计摘要
        
        :param time_range: 时间范围
        :return: 指标摘要数据
        """
        try:
            logger.info(f"获取指标摘要 - 时间范围: {time_range}")
            
            if not self.db_connection:
                logger.warning("数据库连接未配置，返回默认数据")
                return AverageRevenueData()
            
            # 构建摘要查询SQL
            summary_query = """
            SELECT 
                AVG(medical_insurance_average_revenue) as avg_medical_insurance_revenue,
                AVG(non_medical_insurance_average_revenue) as avg_non_medical_insurance_revenue
            FROM average_revenue_summary 
            WHERE time_range = %s
            """
            
            cursor = self.db_connection.cursor()
            cursor.execute(summary_query, (time_range,))
            result = cursor.fetchone()
            cursor.close()
            
            if result:
                return AverageRevenueData(
                    medical_insurance_average_revenue=result[0] or 0.0,
                    non_medical_insurance_average_revenue=result[1] or 0.0
                )
            else:
                return AverageRevenueData()
                
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
                FROM average_revenue_data current_data
                LEFT JOIN average_revenue_data previous_data 
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
                FROM average_revenue_data current_data
                LEFT JOIN average_revenue_data previous_data 
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
            CASE 
                WHEN SUM(medical_insurance_visits) > 0 
                THEN SUM(medical_insurance_total_cost)::FLOAT / SUM(medical_insurance_visits)
                ELSE 0 
            END as medical_insurance_average_revenue,
            CASE 
                WHEN SUM(non_medical_insurance_visits) > 0 
                THEN SUM(non_medical_insurance_total_cost)::FLOAT / SUM(non_medical_insurance_visits)
                ELSE 0 
            END as non_medical_insurance_average_revenue
        FROM average_revenue_data 
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

class AverageRevenueCalculator:
    """次均收入指标计算器"""
    
    @staticmethod
    def calculate_medical_insurance_average_revenue(
        total_cost: float, 
        total_visits: int
    ) -> float:
        """
        计算医保患者次均费用
        
        :param total_cost: 医保患者总费用
        :param total_visits: 医保患者就诊人次
        :return: 医保患者次均费用(元)
        """
        if total_visits == 0:
            return 0.0
        return total_cost / total_visits
    
    @staticmethod
    def calculate_non_medical_insurance_average_revenue(
        total_cost: float, 
        total_visits: int
    ) -> float:
        """
        计算非医保患者次均费用
        
        :param total_cost: 非医保患者总费用
        :param total_visits: 非医保患者就诊人次
        :return: 非医保患者次均费用(元)
        """
        if total_visits == 0:
            return 0.0
        return total_cost / total_visits
    
    @staticmethod
    def analyze_revenue_trend(data_list: List[AverageRevenueData]) -> Dict[str, str]:
        """
        分析次均收入趋势
        
        :param data_list: 次均收入数据列表
        :return: 趋势分析结果
        """
        if len(data_list) < 2:
            return {
                'medical_insurance_trend': 'stable',
                'non_medical_insurance_trend': 'stable'
            }
        
        # 计算医保患者次均费用趋势
        medical_revenues = [data.medical_insurance_average_revenue for data in data_list]
        medical_trend = 'stable'
        if medical_revenues[-1] > medical_revenues[0] * 1.05:
            medical_trend = 'increasing'
        elif medical_revenues[-1] < medical_revenues[0] * 0.95:
            medical_trend = 'decreasing'
        
        # 计算非医保患者次均费用趋势
        non_medical_revenues = [data.non_medical_insurance_average_revenue for data in data_list]
        non_medical_trend = 'stable'
        if non_medical_revenues[-1] > non_medical_revenues[0] * 1.05:
            non_medical_trend = 'increasing'
        elif non_medical_revenues[-1] < non_medical_revenues[0] * 0.95:
            non_medical_trend = 'decreasing'
        
        return {
            'medical_insurance_trend': medical_trend,
            'non_medical_insurance_trend': non_medical_trend
        }
    
    @staticmethod
    def calculate_revenue_difference(
        medical_insurance_revenue: float,
        non_medical_insurance_revenue: float
    ) -> Dict[str, float]:
        """
        计算医保与非医保患者次均费用差异
        
        :param medical_insurance_revenue: 医保患者次均费用
        :param non_medical_insurance_revenue: 非医保患者次均费用
        :return: 费用差异分析结果
        """
        difference = non_medical_insurance_revenue - medical_insurance_revenue
        
        if medical_insurance_revenue > 0:
            difference_rate = (difference / medical_insurance_revenue) * 100
        else:
            difference_rate = 0.0
        
        return {
            'absolute_difference': difference,
            'relative_difference_rate': difference_rate
        }

# PostgreSQL数据库表结构创建SQL
CREATE_TABLES_SQL = """
-- 次均收入数据表
CREATE TABLE IF NOT EXISTS average_revenue_data (
    id BIGSERIAL PRIMARY KEY,
    date_period DATE NOT NULL,
    medical_insurance_visits INTEGER DEFAULT 0,
    medical_insurance_total_cost DECIMAL(15,2) DEFAULT 0,
    non_medical_insurance_visits INTEGER DEFAULT 0,
    non_medical_insurance_total_cost DECIMAL(15,2) DEFAULT 0,
    total_outpatient_visits INTEGER DEFAULT 0,
    total_outpatient_revenue DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_average_revenue_data_date_period ON average_revenue_data(date_period);

-- 添加表注释
COMMENT ON TABLE average_revenue_data IS '门急诊次均收入数据表';
COMMENT ON COLUMN average_revenue_data.date_period IS '统计日期';
COMMENT ON COLUMN average_revenue_data.medical_insurance_visits IS '医保患者就诊人次';
COMMENT ON COLUMN average_revenue_data.medical_insurance_total_cost IS '医保患者总费用';
COMMENT ON COLUMN average_revenue_data.non_medical_insurance_visits IS '非医保患者就诊人次';
COMMENT ON COLUMN average_revenue_data.non_medical_insurance_total_cost IS '非医保患者总费用';
COMMENT ON COLUMN average_revenue_data.total_outpatient_visits IS '门急诊总人次';
COMMENT ON COLUMN average_revenue_data.total_outpatient_revenue IS '门急诊总收入';

-- 次均收入汇总数据表
CREATE TABLE IF NOT EXISTS average_revenue_summary (
    id BIGSERIAL PRIMARY KEY,
    time_range VARCHAR(20) NOT NULL CHECK (time_range IN ('day', 'month', 'quarter', 'year')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    medical_insurance_average_revenue DECIMAL(10,2) DEFAULT 0,
    non_medical_insurance_average_revenue DECIMAL(10,2) DEFAULT 0,
    total_medical_insurance_visits INTEGER DEFAULT 0,
    total_non_medical_insurance_visits INTEGER DEFAULT 0,
    total_medical_insurance_cost DECIMAL(15,2) DEFAULT 0,
    total_non_medical_insurance_cost DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_average_revenue_summary_time_range_period ON average_revenue_summary(time_range, period_start, period_end);

-- 添加表注释
COMMENT ON TABLE average_revenue_summary IS '次均收入汇总数据表';
COMMENT ON COLUMN average_revenue_summary.time_range IS '时间范围';
COMMENT ON COLUMN average_revenue_summary.period_start IS '统计期间开始日期';
COMMENT ON COLUMN average_revenue_summary.period_end IS '统计期间结束日期';
COMMENT ON COLUMN average_revenue_summary.medical_insurance_average_revenue IS '医保患者次均费用';
COMMENT ON COLUMN average_revenue_summary.non_medical_insurance_average_revenue IS '非医保患者次均费用';
COMMENT ON COLUMN average_revenue_summary.total_medical_insurance_visits IS '医保患者总人次';
COMMENT ON COLUMN average_revenue_summary.total_non_medical_insurance_visits IS '非医保患者总人次';
COMMENT ON COLUMN average_revenue_summary.total_medical_insurance_cost IS '医保患者总费用';
COMMENT ON COLUMN average_revenue_summary.total_non_medical_insurance_cost IS '非医保患者总费用';

-- 创建更新时间触发器函数（如果不存在）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为两个表创建更新时间触发器
CREATE TRIGGER update_average_revenue_data_updated_at BEFORE UPDATE
    ON average_revenue_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_average_revenue_summary_updated_at BEFORE UPDATE
    ON average_revenue_summary FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 创建视图用于次均收入分析
CREATE OR REPLACE VIEW average_revenue_analysis_view AS
SELECT 
    date_period,
    medical_insurance_visits,
    medical_insurance_total_cost,
    non_medical_insurance_visits,
    non_medical_insurance_total_cost,
    total_outpatient_visits,
    total_outpatient_revenue,
    CASE 
        WHEN medical_insurance_visits > 0 
        THEN medical_insurance_total_cost / medical_insurance_visits
        ELSE 0 
    END as medical_insurance_average_revenue,
    CASE 
        WHEN non_medical_insurance_visits > 0 
        THEN non_medical_insurance_total_cost / non_medical_insurance_visits
        ELSE 0 
    END as non_medical_insurance_average_revenue,
    CASE 
        WHEN total_outpatient_visits > 0 
        THEN total_outpatient_revenue / total_outpatient_visits
        ELSE 0 
    END as overall_average_revenue,
    CASE 
        WHEN total_outpatient_visits > 0 
        THEN (medical_insurance_visits::FLOAT / total_outpatient_visits) * 100
        ELSE 0 
    END as medical_insurance_ratio
FROM average_revenue_data
ORDER BY date_period;

-- 添加视图注释
COMMENT ON VIEW average_revenue_analysis_view IS '次均收入分析视图，包含计算后的各项指标';
"""

# 使用示例
if __name__ == "__main__":
    # 示例：如何使用次均收入服务
    
    # 1. 创建服务实例（需要传入PostgreSQL数据库连接）
    # import psycopg2
    # db_connection = psycopg2.connect(
    #     host='localhost',
    #     user='your_username',
    #     password='your_password',
    #     database='your_database',
    #     port='5432'
    # )
    # service = AverageRevenueService(db_connection)
    
    # 2. 不使用数据库连接的示例
    service = AverageRevenueService()
    
    try:
        # 获取月度数据
        monthly_data = service.get_average_revenue_data('month', '2024-01-01', '2024-12-31')
        print(f"获取到 {len(monthly_data)} 条月度数据")
        
        # 获取指标摘要
        summary = service.get_indicators_summary('month')
        print(f"指标摘要: {summary}")
        
        # 获取同比分析
        yoy_analysis = service.get_comparison_analysis('medical_insurance_average_revenue', '2024-01-01', 'yoy')
        print(f"同比分析: {yoy_analysis}")
        
        # 使用计算器计算指标
        calculator = AverageRevenueCalculator()
        medical_avg = calculator.calculate_medical_insurance_average_revenue(500000, 1000)
        print(f"医保患者次均费用: {medical_avg}元")
        
        non_medical_avg = calculator.calculate_non_medical_insurance_average_revenue(800000, 800)
        print(f"非医保患者次均费用: {non_medical_avg}元")
        
        # 计算费用差异
        difference = calculator.calculate_revenue_difference(medical_avg, non_medical_avg)
        print(f"费用差异分析: {difference}")
        
    except Exception as e:
        print(f"执行失败: {e}")