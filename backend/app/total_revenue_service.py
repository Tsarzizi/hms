"""
门急诊总收入数据处理模块
提供门急诊收入相关指标的数据查询和计算功能
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
class TotalRevenueData:
    """门急诊总收入数据模型"""
    outpatient_emergency_revenue: float = 0.0  # 门急诊收入(万元)
    outpatient_revenue: float = 0.0  # 门诊收入(万元)
    emergency_revenue: float = 0.0  # 急诊收入(万元)
    outpatient_drug_revenue: float = 0.0  # 门诊药品收入(万元)

@dataclass
class TotalRevenueResponse:
    """门急诊总收入响应数据模型"""
    date: str
    data: TotalRevenueData

@dataclass
class ComparisonData:
    """同比环比数据模型"""
    current_value: float
    comparison_value: float
    change_rate: float
    change_type: str  # 'increase', 'decrease', 'stable'

class TotalRevenueService:
    """门急诊总收入服务类"""
    
    def __init__(self, db_connection=None):
        """
        初始化服务
        :param db_connection: PostgreSQL数据库连接对象
        """
        self.db_connection = db_connection
        
    def get_total_revenue_data(
        self, 
        time_range: str, 
        start_date: Optional[str] = None, 
        end_date: Optional[str] = None
    ) -> List[TotalRevenueResponse]:
        """
        获取门急诊总收入数据
        
        :param time_range: 时间范围 ('day', 'month', 'quarter', 'year')
        :param start_date: 开始日期 (YYYY-MM-DD)
        :param end_date: 结束日期 (YYYY-MM-DD)
        :return: 门急诊总收入数据列表
        """
        try:
            logger.info(f"查询门急诊总收入数据 - 时间范围: {time_range}, 开始日期: {start_date}, 结束日期: {end_date}")
            
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
                data = TotalRevenueData(
                    outpatient_emergency_revenue=float(row[1]) / 10000 if row[1] else 0.0,  # 转换为万元
                    outpatient_revenue=float(row[2]) / 10000 if row[2] else 0.0,
                    emergency_revenue=float(row[3]) / 10000 if row[3] else 0.0,
                    outpatient_drug_revenue=float(row[4]) / 10000 if row[4] else 0.0
                )
                
                response = TotalRevenueResponse(
                    date=str(row[0]),
                    data=data
                )
                data_list.append(response)
            
            cursor.close()
            logger.info(f"成功获取 {len(data_list)} 条数据")
            return data_list
            
        except Exception as e:
            logger.error(f"获取门急诊总收入数据失败: {str(e)}")
            raise Exception(f"数据获取失败: {str(e)}")
    
    def get_indicators_summary(self, time_range: str) -> TotalRevenueData:
        """
        获取指标统计摘要
        
        :param time_range: 时间范围
        :return: 指标摘要数据
        """
        try:
            logger.info(f"获取指标摘要 - 时间范围: {time_range}")
            
            if not self.db_connection:
                logger.warning("数据库连接未配置，返回默认数据")
                return TotalRevenueData()
            
            # 构建摘要查询SQL
            summary_query = """
            SELECT 
                SUM(outpatient_emergency_revenue) / 10000 as total_outpatient_emergency_revenue,
                SUM(outpatient_revenue) / 10000 as total_outpatient_revenue,
                SUM(emergency_revenue) / 10000 as total_emergency_revenue,
                SUM(outpatient_drug_revenue) / 10000 as total_outpatient_drug_revenue
            FROM outpatient_emergency_revenue_summary 
            WHERE time_range = %s
            """
            
            cursor = self.db_connection.cursor()
            cursor.execute(summary_query, (time_range,))
            result = cursor.fetchone()
            cursor.close()
            
            if result:
                return TotalRevenueData(
                    outpatient_emergency_revenue=float(result[0]) if result[0] else 0.0,
                    outpatient_revenue=float(result[1]) if result[1] else 0.0,
                    emergency_revenue=float(result[2]) if result[2] else 0.0,
                    outpatient_drug_revenue=float(result[3]) if result[3] else 0.0
                )
            else:
                return TotalRevenueData()
                
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
                FROM outpatient_emergency_revenue_data current_data
                LEFT JOIN outpatient_emergency_revenue_data previous_data 
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
                FROM outpatient_emergency_revenue_data current_data
                LEFT JOIN outpatient_emergency_revenue_data previous_data 
                    ON previous_data.date_period = current_data.date_period - INTERVAL '1 month'
                WHERE current_data.date_period = %s
                """.format(indicator=indicator)
            
            cursor = self.db_connection.cursor()
            cursor.execute(comparison_query, (current_period,))
            result = cursor.fetchone()
            cursor.close()
            
            if result and result[0] is not None and result[1] is not None:
                current_value = float(result[0]) / 10000  # 转换为万元
                previous_value = float(result[1]) / 10000
                
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
            SUM(
                CASE 
                    WHEN charge_type_code IN ('门诊', '急诊') 
                    THEN total_cost 
                    ELSE 0 
                END
            ) as outpatient_emergency_revenue,
            SUM(
                CASE 
                    WHEN charge_type_code = '门诊' 
                    THEN total_cost 
                    ELSE 0 
                END
            ) as outpatient_revenue,
            SUM(
                CASE 
                    WHEN charge_type_code = '急诊' 
                    THEN total_cost 
                    ELSE 0 
                END
            ) as emergency_revenue,
            SUM(
                CASE 
                    WHEN charge_type_code = '门诊' AND item_type = '药品费用' 
                    THEN total_cost 
                    ELSE 0 
                END
            ) as outpatient_drug_revenue
        FROM hospital_revenue_data 
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

class TotalRevenueCalculator:
    """门急诊总收入指标计算器"""
    
    @staticmethod
    def calculate_outpatient_emergency_revenue(outpatient_revenue: float, emergency_revenue: float) -> float:
        """
        计算门急诊收入
        门急诊收入(万元) = 总费用的汇总求和
        
        :param outpatient_revenue: 门诊收入
        :param emergency_revenue: 急诊收入
        :return: 门急诊收入(万元)
        """
        return outpatient_revenue + emergency_revenue
    
    @staticmethod
    def calculate_outpatient_revenue(total_outpatient_cost: float) -> float:
        """
        计算门诊收入
        门诊收入(万元) = 挂号类别代码为门诊的总费用汇总求和
        
        :param total_outpatient_cost: 门诊总费用
        :return: 门诊收入(万元)
        """
        return total_outpatient_cost / 10000
    
    @staticmethod
    def calculate_emergency_revenue(total_emergency_cost: float) -> float:
        """
        计算急诊收入
        急诊收入(万元) = 挂号类别代码为急诊的总费用汇总求和
        
        :param total_emergency_cost: 急诊总费用
        :return: 急诊收入(万元)
        """
        return total_emergency_cost / 10000
    
    @staticmethod
    def calculate_outpatient_drug_revenue(total_outpatient_drug_cost: float) -> float:
        """
        计算门诊药品收入
        门诊药品收入(万元) = 挂号类别代码为门诊的药品费用汇总求和
        
        :param total_outpatient_drug_cost: 门诊药品总费用
        :return: 门诊药品收入(万元)
        """
        return total_outpatient_drug_cost / 10000
    
    @staticmethod
    def analyze_revenue_trend(data_list: List[TotalRevenueData]) -> Dict[str, str]:
        """
        分析收入趋势
        
        :param data_list: 收入数据列表
        :return: 趋势分析结果
        """
        if len(data_list) < 2:
            return {
                'outpatient_emergency_revenue_trend': 'stable',
                'outpatient_revenue_trend': 'stable',
                'emergency_revenue_trend': 'stable',
                'outpatient_drug_revenue_trend': 'stable'
            }
        
        trends = {}
        indicators = [
            'outpatient_emergency_revenue',
            'outpatient_revenue', 
            'emergency_revenue',
            'outpatient_drug_revenue'
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
-- 门急诊收入数据表
CREATE TABLE IF NOT EXISTS outpatient_emergency_revenue_data (
    id BIGSERIAL PRIMARY KEY,
    date_period DATE NOT NULL,
    charge_type_code VARCHAR(20) NOT NULL CHECK (charge_type_code IN ('门诊', '急诊')),
    item_type VARCHAR(50),
    total_cost DECIMAL(15,2) DEFAULT 0,
    patient_count INTEGER DEFAULT 0,
    visit_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_outpatient_emergency_revenue_date_period ON outpatient_emergency_revenue_data(date_period);
CREATE INDEX IF NOT EXISTS idx_outpatient_emergency_revenue_charge_type ON outpatient_emergency_revenue_data(charge_type_code);
CREATE INDEX IF NOT EXISTS idx_outpatient_emergency_revenue_item_type ON outpatient_emergency_revenue_data(item_type);

-- 添加表注释
COMMENT ON TABLE outpatient_emergency_revenue_data IS '门急诊收入数据表';
COMMENT ON COLUMN outpatient_emergency_revenue_data.date_period IS '统计日期';
COMMENT ON COLUMN outpatient_emergency_revenue_data.charge_type_code IS '挂号类别代码(门诊/急诊)';
COMMENT ON COLUMN outpatient_emergency_revenue_data.item_type IS '费用项目类型';
COMMENT ON COLUMN outpatient_emergency_revenue_data.total_cost IS '总费用(元)';
COMMENT ON COLUMN outpatient_emergency_revenue_data.patient_count IS '患者人数';
COMMENT ON COLUMN outpatient_emergency_revenue_data.visit_count IS '就诊人次';

-- 门急诊收入汇总数据表
CREATE TABLE IF NOT EXISTS outpatient_emergency_revenue_summary (
    id BIGSERIAL PRIMARY KEY,
    time_range VARCHAR(20) NOT NULL CHECK (time_range IN ('day', 'month', 'quarter', 'year')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    outpatient_emergency_revenue DECIMAL(15,2) DEFAULT 0,
    outpatient_revenue DECIMAL(15,2) DEFAULT 0,
    emergency_revenue DECIMAL(15,2) DEFAULT 0,
    outpatient_drug_revenue DECIMAL(15,2) DEFAULT 0,
    total_visit_count INTEGER DEFAULT 0,
    total_patient_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_outpatient_emergency_revenue_summary_time_range_period ON outpatient_emergency_revenue_summary(time_range, period_start, period_end);

-- 添加表注释
COMMENT ON TABLE outpatient_emergency_revenue_summary IS '门急诊收入汇总数据表';
COMMENT ON COLUMN outpatient_emergency_revenue_summary.time_range IS '时间范围';
COMMENT ON COLUMN outpatient_emergency_revenue_summary.period_start IS '统计期间开始日期';
COMMENT ON COLUMN outpatient_emergency_revenue_summary.period_end IS '统计期间结束日期';
COMMENT ON COLUMN outpatient_emergency_revenue_summary.outpatient_emergency_revenue IS '门急诊收入(元)';
COMMENT ON COLUMN outpatient_emergency_revenue_summary.outpatient_revenue IS '门诊收入(元)';
COMMENT ON COLUMN outpatient_emergency_revenue_summary.emergency_revenue IS '急诊收入(元)';
COMMENT ON COLUMN outpatient_emergency_revenue_summary.outpatient_drug_revenue IS '门诊药品收入(元)';

-- 创建更新时间触发器函数（如果不存在）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为两个表创建更新时间触发器
CREATE TRIGGER update_outpatient_emergency_revenue_data_updated_at BEFORE UPDATE
    ON outpatient_emergency_revenue_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_outpatient_emergency_revenue_summary_updated_at BEFORE UPDATE
    ON outpatient_emergency_revenue_summary FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 创建视图用于门急诊收入分析
CREATE OR REPLACE VIEW outpatient_emergency_revenue_analysis_view AS
SELECT 
    date_period,
    charge_type_code,
    SUM(total_cost) as total_revenue,
    SUM(patient_count) as total_patients,
    SUM(visit_count) as total_visits,
    CASE 
        WHEN SUM(visit_count) > 0 
        THEN SUM(total_cost) / SUM(visit_count)
        ELSE 0 
    END as average_revenue_per_visit
FROM outpatient_emergency_revenue_data
GROUP BY date_period, charge_type_code
ORDER BY date_period, charge_type_code;

-- 添加视图注释
COMMENT ON VIEW outpatient_emergency_revenue_analysis_view IS '门急诊收入分析视图，包含计算后的各项指标';
"""

# 使用示例
if __name__ == "__main__":
    # 示例：如何使用门急诊总收入服务
    
    # 1. 创建服务实例（需要传入PostgreSQL数据库连接）
    # import psycopg2
    # db_connection = psycopg2.connect(
    #     host='localhost',
    #     user='your_username',
    #     password='your_password',
    #     database='your_database',
    #     port='5432'
    # )
    # service = TotalRevenueService(db_connection)
    
    # 2. 不使用数据库连接的示例
    service = TotalRevenueService()
    
    try:
        # 获取月度数据
        monthly_data = service.get_total_revenue_data('month', '2024-01-01', '2024-12-31')
        print(f"获取到 {len(monthly_data)} 条月度数据")
        
        # 获取指标摘要
        summary = service.get_indicators_summary('month')
        print(f"指标摘要: {summary}")
        
        # 获取同比分析
        yoy_analysis = service.get_comparison_analysis('outpatient_emergency_revenue', '2024-01-01', 'yoy')
        print(f"同比分析: {yoy_analysis}")
        
        # 使用计算器计算指标
        calculator = TotalRevenueCalculator()
        outpatient_emergency_revenue = calculator.calculate_outpatient_emergency_revenue(1000.0, 500.0)
        print(f"门急诊收入: {outpatient_emergency_revenue}万元")
        
    except Exception as e:
        print(f"执行失败: {e}")