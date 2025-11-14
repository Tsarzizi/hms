"""
住院收入顺位数据处理模块
提供住院收入顺位相关指标的数据查询和计算功能
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
class InpatientRevenueRankingData:
    """住院收入顺位数据模型"""
    department_inpatient_revenue_ratio: float = 0.0  # 某科室住院收入占总住院收入比(%)
    department_inpatient_revenue_cost_ratio: float = 0.0  # 病种住院费用(元)

@dataclass
class InpatientRevenueRankingResponse:
    """住院收入顺位响应数据模型"""
    date: str
    data: InpatientRevenueRankingData

@dataclass
class ComparisonData:
    """同比环比数据模型"""
    current_value: float
    comparison_value: float
    change_rate: float
    change_type: str  # 'increase', 'decrease', 'stable'

class InpatientRevenueRankingService:
    """住院收入顺位服务类"""
    
    def __init__(self, db_connection=None):
        """
        初始化服务
        :param db_connection: PostgreSQL数据库连接对象
        """
        self.db_connection = db_connection
        
    def get_inpatient_revenue_ranking_data(
        self, 
        time_range: str, 
        start_date: Optional[str] = None, 
        end_date: Optional[str] = None
    ) -> List[InpatientRevenueRankingResponse]:
        """
        获取住院收入顺位数据
        
        :param time_range: 时间范围 ('day', 'month', 'quarter', 'year')
        :param start_date: 开始日期 (YYYY-MM-DD)
        :param end_date: 结束日期 (YYYY-MM-DD)
        :return: 住院收入顺位数据列表
        """
        try:
            logger.info(f"查询住院收入顺位数据 - 时间范围: {time_range}, 开始日期: {start_date}, 结束日期: {end_date}")
            
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
                data = InpatientRevenueRankingData(
                    department_inpatient_revenue_ratio=row[1] or 0.0,
                    department_inpatient_revenue_cost_ratio=row[2] or 0.0
                )
                
                response = InpatientRevenueRankingResponse(
                    date=str(row[0]),
                    data=data
                )
                data_list.append(response)
            
            cursor.close()
            logger.info(f"成功获取 {len(data_list)} 条数据")
            return data_list
            
        except Exception as e:
            logger.error(f"获取住院收入顺位数据失败: {str(e)}")
            raise Exception(f"数据获取失败: {str(e)}")
    
    def get_indicators_summary(self, time_range: str) -> InpatientRevenueRankingData:
        """
        获取指标统计摘要
        
        :param time_range: 时间范围
        :return: 指标摘要数据
        """
        try:
            logger.info(f"获取指标摘要 - 时间范围: {time_range}")
            
            if not self.db_connection:
                logger.warning("数据库连接未配置，返回默认数据")
                return InpatientRevenueRankingData()
            
            # 构建摘要查询SQL
            summary_query = """
            SELECT 
                AVG(department_inpatient_revenue_ratio) as avg_department_revenue_ratio,
                AVG(department_inpatient_revenue_cost_ratio) as avg_department_cost_ratio
            FROM inpatient_revenue_ranking_summary 
            WHERE time_range = %s
            """
            
            cursor = self.db_connection.cursor()
            cursor.execute(summary_query, (time_range,))
            result = cursor.fetchone()
            cursor.close()
            
            if result:
                return InpatientRevenueRankingData(
                    department_inpatient_revenue_ratio=result[0] or 0.0,
                    department_inpatient_revenue_cost_ratio=result[1] or 0.0
                )
            else:
                return InpatientRevenueRankingData()
                
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
                FROM inpatient_revenue_ranking_data current_data
                LEFT JOIN inpatient_revenue_ranking_data previous_data 
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
                FROM inpatient_revenue_ranking_data current_data
                LEFT JOIN inpatient_revenue_ranking_data previous_data 
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
                WHEN SUM(total_inpatient_revenue) > 0 
                THEN (SUM(department_inpatient_revenue)::FLOAT / SUM(total_inpatient_revenue)) * 100
                ELSE 0 
            END as department_inpatient_revenue_ratio,
            CASE 
                WHEN SUM(disease_patient_count) > 0 
                THEN SUM(disease_total_cost)::FLOAT / SUM(disease_patient_count)
                ELSE 0 
            END as department_inpatient_revenue_cost_ratio
        FROM inpatient_revenue_ranking_data 
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

class InpatientRevenueRankingCalculator:
    """住院收入顺位指标计算器"""
    
    @staticmethod
    def calculate_department_revenue_ratio(
        department_revenue: float, 
        total_inpatient_revenue: float
    ) -> float:
        """
        计算某科室住院收入占总住院收入比
        
        :param department_revenue: 某科室住院收入
        :param total_inpatient_revenue: 总住院收入
        :return: 某科室住院收入占总住院收入比(%)
        """
        if total_inpatient_revenue == 0:
            return 0.0
        return (department_revenue / total_inpatient_revenue) * 100
    
    @staticmethod
    def calculate_disease_cost_per_patient(
        disease_total_cost: float, 
        disease_patient_count: int
    ) -> float:
        """
        计算病种住院费用
        
        :param disease_total_cost: 某病种总费用
        :param disease_patient_count: 该病种总人次
        :return: 病种住院费用(元)
        """
        if disease_patient_count == 0:
            return 0.0
        return disease_total_cost / disease_patient_count
    
    @staticmethod
    def analyze_revenue_ranking_trend(data_list: List[InpatientRevenueRankingData]) -> Dict[str, str]:
        """
        分析住院收入顺位趋势
        
        :param data_list: 住院收入顺位数据列表
        :return: 趋势分析结果
        """
        if len(data_list) < 2:
            return {
                'department_revenue_ratio_trend': 'stable',
                'disease_cost_trend': 'stable'
            }
        
        # 计算科室收入占比趋势
        revenue_ratios = [data.department_inpatient_revenue_ratio for data in data_list]
        revenue_ratio_trend = 'stable'
        if revenue_ratios[-1] > revenue_ratios[0] * 1.05:
            revenue_ratio_trend = 'increasing'
        elif revenue_ratios[-1] < revenue_ratios[0] * 0.95:
            revenue_ratio_trend = 'decreasing'
        
        # 计算病种费用趋势
        cost_ratios = [data.department_inpatient_revenue_cost_ratio for data in data_list]
        cost_trend = 'stable'
        if cost_ratios[-1] > cost_ratios[0] * 1.05:
            cost_trend = 'increasing'
        elif cost_ratios[-1] < cost_ratios[0] * 0.95:
            cost_trend = 'decreasing'
        
        return {
            'department_revenue_ratio_trend': revenue_ratio_trend,
            'disease_cost_trend': cost_trend
        }

# PostgreSQL数据库表结构创建SQL
CREATE_TABLES_SQL = """
-- 住院收入顺位数据表
CREATE TABLE IF NOT EXISTS inpatient_revenue_ranking_data (
    id BIGSERIAL PRIMARY KEY,
    date_period DATE NOT NULL,
    department_id VARCHAR(50),
    department_name VARCHAR(100),
    department_inpatient_revenue DECIMAL(15,2) DEFAULT 0,
    total_inpatient_revenue DECIMAL(15,2) DEFAULT 0,
    disease_code VARCHAR(50),
    disease_name VARCHAR(200),
    disease_total_cost DECIMAL(15,2) DEFAULT 0,
    disease_patient_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_inpatient_revenue_ranking_date_period ON inpatient_revenue_ranking_data(date_period);
CREATE INDEX IF NOT EXISTS idx_inpatient_revenue_ranking_department ON inpatient_revenue_ranking_data(department_id);
CREATE INDEX IF NOT EXISTS idx_inpatient_revenue_ranking_disease ON inpatient_revenue_ranking_data(disease_code);

-- 添加表注释
COMMENT ON TABLE inpatient_revenue_ranking_data IS '住院收入顺位数据表';
COMMENT ON COLUMN inpatient_revenue_ranking_data.date_period IS '统计日期';
COMMENT ON COLUMN inpatient_revenue_ranking_data.department_id IS '科室ID';
COMMENT ON COLUMN inpatient_revenue_ranking_data.department_name IS '科室名称';
COMMENT ON COLUMN inpatient_revenue_ranking_data.department_inpatient_revenue IS '某科室住院收入';
COMMENT ON COLUMN inpatient_revenue_ranking_data.total_inpatient_revenue IS '总住院收入';
COMMENT ON COLUMN inpatient_revenue_ranking_data.disease_code IS '疾病编码';
COMMENT ON COLUMN inpatient_revenue_ranking_data.disease_name IS '疾病名称';
COMMENT ON COLUMN inpatient_revenue_ranking_data.disease_total_cost IS '某病种总费用';
COMMENT ON COLUMN inpatient_revenue_ranking_data.disease_patient_count IS '该病种总人次';

-- 住院收入顺位汇总数据表
CREATE TABLE IF NOT EXISTS inpatient_revenue_ranking_summary (
    id BIGSERIAL PRIMARY KEY,
    time_range VARCHAR(20) NOT NULL CHECK (time_range IN ('day', 'month', 'quarter', 'year')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    department_inpatient_revenue_ratio DECIMAL(10,2) DEFAULT 0,
    department_inpatient_revenue_cost_ratio DECIMAL(15,2) DEFAULT 0,
    total_department_revenue DECIMAL(15,2) DEFAULT 0,
    total_disease_cost DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_inpatient_revenue_ranking_summary_time_range_period ON inpatient_revenue_ranking_summary(time_range, period_start, period_end);

-- 添加表注释
COMMENT ON TABLE inpatient_revenue_ranking_summary IS '住院收入顺位汇总数据表';
COMMENT ON COLUMN inpatient_revenue_ranking_summary.time_range IS '时间范围';
COMMENT ON COLUMN inpatient_revenue_ranking_summary.period_start IS '统计期间开始日期';
COMMENT ON COLUMN inpatient_revenue_ranking_summary.period_end IS '统计期间结束日期';
COMMENT ON COLUMN inpatient_revenue_ranking_summary.department_inpatient_revenue_ratio IS '某科室住院收入占总住院收入比';
COMMENT ON COLUMN inpatient_revenue_ranking_summary.department_inpatient_revenue_cost_ratio IS '病种住院费用';
COMMENT ON COLUMN inpatient_revenue_ranking_summary.total_department_revenue IS '科室总收入';
COMMENT ON COLUMN inpatient_revenue_ranking_summary.total_disease_cost IS '疾病总费用';

-- 创建更新时间触发器函数（如果不存在）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为两个表创建更新时间触发器
CREATE TRIGGER update_inpatient_revenue_ranking_data_updated_at BEFORE UPDATE
    ON inpatient_revenue_ranking_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inpatient_revenue_ranking_summary_updated_at BEFORE UPDATE
    ON inpatient_revenue_ranking_summary FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 创建视图用于住院收入顺位分析
CREATE OR REPLACE VIEW inpatient_revenue_ranking_analysis_view AS
SELECT 
    date_period,
    department_id,
    department_name,
    department_inpatient_revenue,
    total_inpatient_revenue,
    CASE 
        WHEN total_inpatient_revenue > 0 
        THEN (department_inpatient_revenue / total_inpatient_revenue) * 100
        ELSE 0 
    END as department_revenue_ratio,
    disease_code,
    disease_name,
    disease_total_cost,
    disease_patient_count,
    CASE 
        WHEN disease_patient_count > 0 
        THEN disease_total_cost / disease_patient_count
        ELSE 0 
    END as disease_cost_per_patient
FROM inpatient_revenue_ranking_data
ORDER BY date_period, department_revenue_ratio DESC;

-- 添加视图注释
COMMENT ON VIEW inpatient_revenue_ranking_analysis_view IS '住院收入顺位分析视图，包含计算后的各项指标';

-- 创建科室收入排名视图
CREATE OR REPLACE VIEW department_revenue_ranking_view AS
SELECT 
    date_period,
    department_id,
    department_name,
    department_inpatient_revenue,
    total_inpatient_revenue,
    (department_inpatient_revenue / total_inpatient_revenue) * 100 as revenue_ratio,
    ROW_NUMBER() OVER (PARTITION BY date_period ORDER BY department_inpatient_revenue DESC) as revenue_rank
FROM inpatient_revenue_ranking_data
WHERE total_inpatient_revenue > 0
ORDER BY date_period, revenue_rank;

-- 添加视图注释
COMMENT ON VIEW department_revenue_ranking_view IS '科室收入排名视图';

-- 创建病种费用排名视图
CREATE OR REPLACE VIEW disease_cost_ranking_view AS
SELECT 
    date_period,
    disease_code,
    disease_name,
    disease_total_cost,
    disease_patient_count,
    CASE 
        WHEN disease_patient_count > 0 
        THEN disease_total_cost / disease_patient_count
        ELSE 0 
    END as cost_per_patient,
    ROW_NUMBER() OVER (PARTITION BY date_period ORDER BY (disease_total_cost / NULLIF(disease_patient_count, 0)) DESC) as cost_rank
FROM inpatient_revenue_ranking_data
WHERE disease_patient_count > 0
ORDER BY date_period, cost_rank;

-- 添加视图注释
COMMENT ON VIEW disease_cost_ranking_view IS '病种费用排名视图';
"""

# 使用示例
if __name__ == "__main__":
    # 示例：如何使用住院收入顺位服务
    
    # 1. 创建服务实例（需要传入PostgreSQL数据库连接）
    # import psycopg2
    # db_connection = psycopg2.connect(
    #     host='localhost',
    #     user='your_username',
    #     password='your_password',
    #     database='your_database',
    #     port='5432'
    # )
    # service = InpatientRevenueRankingService(db_connection)
    
    # 2. 不使用数据库连接的示例
    service = InpatientRevenueRankingService()
    
    try:
        # 获取月度数据
        monthly_data = service.get_inpatient_revenue_ranking_data('month', '2024-01-01', '2024-12-31')
        print(f"获取到 {len(monthly_data)} 条月度数据")
        
        # 获取指标摘要
        summary = service.get_indicators_summary('month')
        print(f"指标摘要: {summary}")
        
        # 获取同比分析
        yoy_analysis = service.get_comparison_analysis('department_inpatient_revenue_ratio', '2024-01-01', 'yoy')
        print(f"同比分析: {yoy_analysis}")
        
        # 使用计算器计算指标
        calculator = InpatientRevenueRankingCalculator()
        department_ratio = calculator.calculate_department_revenue_ratio(500000, 2000000)
        print(f"科室收入占比: {department_ratio}%")
        
        disease_cost = calculator.calculate_disease_cost_per_patient(150000, 50)
        print(f"病种住院费用: {disease_cost}元")
        
    except Exception as e:
        print(f"执行失败: {e}")