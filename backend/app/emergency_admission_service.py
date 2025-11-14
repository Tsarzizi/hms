"""
门急诊入院数据处理模块
提供门急诊入院相关指标的数据查询和计算功能
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
class EmergencyAdmissionData:
    """门急诊入院数据模型"""
    emergency_admission_rate: float = 0.0  # 门急诊入院率(%)

@dataclass
class EmergencyAdmissionResponse:
    """门急诊入院响应数据模型"""
    date: str
    data: EmergencyAdmissionData

@dataclass
class ComparisonData:
    """同比环比数据模型"""
    current_value: float
    comparison_value: float
    change_rate: float
    change_type: str  # 'increase', 'decrease', 'stable'

class EmergencyAdmissionService:
    """门急诊入院服务类"""
    
    def __init__(self, db_connection=None):
        """
        初始化服务
        :param db_connection: PostgreSQL数据库连接对象
        """
        self.db_connection = db_connection
        
    def get_emergency_admission_data(
        self, 
        time_range: str, 
        start_date: Optional[str] = None, 
        end_date: Optional[str] = None
    ) -> List[EmergencyAdmissionResponse]:
        """
        获取门急诊入院数据
        
        :param time_range: 时间范围 ('day', 'month', 'quarter', 'year')
        :param start_date: 开始日期 (YYYY-MM-DD)
        :param end_date: 结束日期 (YYYY-MM-DD)
        :return: 门急诊入院数据列表
        """
        try:
            logger.info(f"查询门急诊入院数据 - 时间范围: {time_range}, 开始日期: {start_date}, 结束日期: {end_date}")
            
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
                data = EmergencyAdmissionData(
                    emergency_admission_rate=row[1] or 0.0
                )
                
                response = EmergencyAdmissionResponse(
                    date=str(row[0]),
                    data=data
                )
                data_list.append(response)
            
            cursor.close()
            logger.info(f"成功获取 {len(data_list)} 条数据")
            return data_list
            
        except Exception as e:
            logger.error(f"获取门急诊入院数据失败: {str(e)}")
            raise Exception(f"数据获取失败: {str(e)}")
    
    def get_indicators_summary(self, time_range: str) -> EmergencyAdmissionData:
        """
        获取指标统计摘要
        
        :param time_range: 时间范围
        :return: 指标摘要数据
        """
        try:
            logger.info(f"获取指标摘要 - 时间范围: {time_range}")
            
            if not self.db_connection:
                logger.warning("数据库连接未配置，返回默认数据")
                return EmergencyAdmissionData()
            
            # 构建摘要查询SQL
            summary_query = """
            SELECT 
                AVG(emergency_admission_rate) as avg_emergency_admission_rate
            FROM emergency_admission_summary 
            WHERE time_range = %s
            """
            
            cursor = self.db_connection.cursor()
            cursor.execute(summary_query, (time_range,))
            result = cursor.fetchone()
            cursor.close()
            
            if result:
                return EmergencyAdmissionData(
                    emergency_admission_rate=result[0] or 0.0
                )
            else:
                return EmergencyAdmissionData()
                
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
                FROM emergency_admission_data current_data
                LEFT JOIN emergency_admission_data previous_data 
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
                FROM emergency_admission_data current_data
                LEFT JOIN emergency_admission_data previous_data 
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
                WHEN (SUM(outpatient_visits) + SUM(emergency_visits)) > 0 
                THEN (SUM(emergency_admissions)::FLOAT / (SUM(outpatient_visits) + SUM(emergency_visits))) * 100
                ELSE 0 
            END as emergency_admission_rate
        FROM emergency_admission_data 
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

class EmergencyAdmissionCalculator:
    """门急诊入院指标计算器"""
    
    @staticmethod
    def calculate_emergency_admission_rate(
        emergency_admissions: int, 
        outpatient_visits: int, 
        emergency_visits: int
    ) -> float:
        """
        计算门急诊入院率
        
        :param emergency_admissions: 门急诊入院人数
        :param outpatient_visits: 门诊人次数
        :param emergency_visits: 急诊人次数
        :return: 门急诊入院率(%)
        """
        total_visits = outpatient_visits + emergency_visits
        if total_visits == 0:
            return 0.0
        return (emergency_admissions / total_visits) * 100
    
    @staticmethod
    def analyze_emergency_admission_trend(data_list: List[EmergencyAdmissionData]) -> Dict[str, str]:
        """
        分析门急诊入院趋势
        
        :param data_list: 门急诊入院数据列表
        :return: 趋势分析结果
        """
        if len(data_list) < 2:
            return {
                'emergency_admission_rate_trend': 'stable'
            }
        
        # 计算门急诊入院率趋势
        admission_rates = [data.emergency_admission_rate for data in data_list]
        admission_rate_trend = 'stable'
        if admission_rates[-1] > admission_rates[0] * 1.05:
            admission_rate_trend = 'increasing'
        elif admission_rates[-1] < admission_rates[0] * 0.95:
            admission_rate_trend = 'decreasing'
        
        return {
            'emergency_admission_rate_trend': admission_rate_trend
        }

# PostgreSQL数据库表结构创建SQL
CREATE_TABLES_SQL = """
-- 门急诊入院数据表
CREATE TABLE IF NOT EXISTS emergency_admission_data (
    id BIGSERIAL PRIMARY KEY,
    date_period DATE NOT NULL,
    outpatient_visits INTEGER DEFAULT 0,
    emergency_visits INTEGER DEFAULT 0,
    emergency_admissions INTEGER DEFAULT 0,
    total_admissions INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_emergency_admission_data_date_period ON emergency_admission_data(date_period);

-- 添加表注释
COMMENT ON TABLE emergency_admission_data IS '门急诊入院数据表';
COMMENT ON COLUMN emergency_admission_data.date_period IS '统计日期';
COMMENT ON COLUMN emergency_admission_data.outpatient_visits IS '门诊人次数';
COMMENT ON COLUMN emergency_admission_data.emergency_visits IS '急诊人次数';
COMMENT ON COLUMN emergency_admission_data.emergency_admissions IS '门急诊入院人数';
COMMENT ON COLUMN emergency_admission_data.total_admissions IS '总入院人数';

-- 门急诊入院汇总数据表
CREATE TABLE IF NOT EXISTS emergency_admission_summary (
    id BIGSERIAL PRIMARY KEY,
    time_range VARCHAR(20) NOT NULL CHECK (time_range IN ('day', 'month', 'quarter', 'year')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    emergency_admission_rate DECIMAL(10,2) DEFAULT 0,
    total_emergency_admissions INTEGER DEFAULT 0,
    total_outpatient_visits INTEGER DEFAULT 0,
    total_emergency_visits INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_emergency_admission_summary_time_range_period ON emergency_admission_summary(time_range, period_start, period_end);

-- 添加表注释
COMMENT ON TABLE emergency_admission_summary IS '门急诊入院汇总数据表';
COMMENT ON COLUMN emergency_admission_summary.time_range IS '时间范围';
COMMENT ON COLUMN emergency_admission_summary.period_start IS '统计期间开始日期';
COMMENT ON COLUMN emergency_admission_summary.period_end IS '统计期间结束日期';
COMMENT ON COLUMN emergency_admission_summary.emergency_admission_rate IS '门急诊入院率';
COMMENT ON COLUMN emergency_admission_summary.total_emergency_admissions IS '门急诊入院总人数';
COMMENT ON COLUMN emergency_admission_summary.total_outpatient_visits IS '门诊总人次';
COMMENT ON COLUMN emergency_admission_summary.total_emergency_visits IS '急诊总人次';

-- 创建更新时间触发器函数（如果不存在）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为两个表创建更新时间触发器
CREATE TRIGGER update_emergency_admission_data_updated_at BEFORE UPDATE
    ON emergency_admission_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_emergency_admission_summary_updated_at BEFORE UPDATE
    ON emergency_admission_summary FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 创建视图用于门急诊入院分析
CREATE OR REPLACE VIEW emergency_admission_analysis_view AS
SELECT 
    date_period,
    outpatient_visits,
    emergency_visits,
    emergency_admissions,
    total_admissions,
    (outpatient_visits + emergency_visits) as total_visits,
    CASE 
        WHEN (outpatient_visits + emergency_visits) > 0 
        THEN (emergency_admissions::FLOAT / (outpatient_visits + emergency_visits)) * 100
        ELSE 0 
    END as emergency_admission_rate,
    CASE 
        WHEN total_admissions > 0 
        THEN (emergency_admissions::FLOAT / total_admissions) * 100
        ELSE 0 
    END as emergency_admission_proportion
FROM emergency_admission_data
ORDER BY date_period;

-- 添加视图注释
COMMENT ON VIEW emergency_admission_analysis_view IS '门急诊入院分析视图，包含计算后的各项指标';
"""

# 使用示例
if __name__ == "__main__":
    # 示例：如何使用门急诊入院服务
    
    # 1. 创建服务实例（需要传入PostgreSQL数据库连接）
    # import psycopg2
    # db_connection = psycopg2.connect(
    #     host='localhost',
    #     user='your_username',
    #     password='your_password',
    #     database='your_database',
    #     port='5432'
    # )
    # service = EmergencyAdmissionService(db_connection)
    
    # 2. 不使用数据库连接的示例
    service = EmergencyAdmissionService()
    
    try:
        # 获取月度数据
        monthly_data = service.get_emergency_admission_data('month', '2024-01-01', '2024-12-31')
        print(f"获取到 {len(monthly_data)} 条月度数据")
        
        # 获取指标摘要
        summary = service.get_indicators_summary('month')
        print(f"指标摘要: {summary}")
        
        # 获取同比分析
        yoy_analysis = service.get_comparison_analysis('emergency_admission_rate', '2024-01-01', 'yoy')
        print(f"同比分析: {yoy_analysis}")
        
        # 使用计算器计算指标
        calculator = EmergencyAdmissionCalculator()
        admission_rate = calculator.calculate_emergency_admission_rate(50, 800, 200)
        print(f"门急诊入院率: {admission_rate}%")
        
    except Exception as e:
        print(f"执行失败: {e}")