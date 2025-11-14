"""
入院途径数据处理模块 - 严格按照指标要求
提供入院途径相关指标的数据查询和计算功能
支持PostgreSQL数据库

指标定义（严格按照图片要求）：
1. 急诊入院率：急诊入院人次/急诊总人次×100%
2. 门诊入院率：门诊入院人次/门诊总人次×100%
3. 转院入院率：转院入院人次/转院总人次×100%
"""

from datetime import datetime, timedelta
from typing import List, Dict, Optional, Union
from dataclasses import dataclass
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class AdmissionPathwayData:
    """入院途径数据模型 - 严格按照图片指标定义"""
    emergency_admission_rate: float = 0.0  # 急诊入院率(%) - 急诊入院人次/急诊总人次×100%
    outpatient_admission_rate: float = 0.0  # 门诊入院率(%) - 门诊入院人次/门诊总人次×100%
    transfer_admission_rate: float = 0.0  # 转院入院率(%) - 转院入院人次/转院总人次×100%

@dataclass
class ComparisonData:
    """同比环比数据模型"""
    current_value: float = 0.0
    previous_value: float = 0.0
    comparison_rate: float = 0.0  # 同比/环比率(%)
    comparison_type: str = ""  # "同比" 或 "环比"
    change_type: str = "stable"  # "increase", "decrease", "stable"

@dataclass
class AdmissionPathwayResponse:
    """入院途径响应数据模型"""
    date: str
    data: AdmissionPathwayData
    year_over_year: Dict[str, ComparisonData]  # 同比数据
    month_over_month: Dict[str, ComparisonData]  # 环比数据

class AdmissionPathwayService:
    """入院途径服务类 - 严格按照图片指标实现"""
    
    def __init__(self, db_connection=None):
        """
        初始化服务
        :param db_connection: PostgreSQL数据库连接对象
        """
        self.db_connection = db_connection
        
    def get_admission_pathway_data(
        self, 
        time_range: str, 
        start_date: Optional[str] = None, 
        end_date: Optional[str] = None
    ) -> List[AdmissionPathwayResponse]:
        """
        获取入院途径数据
        
        :param time_range: 时间范围 ('day', 'month', 'quarter', 'year')
        :param start_date: 开始日期 (YYYY-MM-DD)
        :param end_date: 结束日期 (YYYY-MM-DD)
        :return: 入院途径数据列表
        """
        try:
            logger.info(f"查询入院途径数据 - 时间范围: {time_range}, 开始日期: {start_date}, 结束日期: {end_date}")
            
            # 如果没有数据库连接，返回空数据
            if not self.db_connection:
                logger.warning("PostgreSQL数据库连接未配置，返回空数据")
                return []
            
            # 构建SQL查询 - 严格按照图片指标
            query = self._build_query(time_range, start_date, end_date)
            
            # 执行查询
            cursor = self.db_connection.cursor()
            cursor.execute(query, self._get_query_params(start_date, end_date))
            results = cursor.fetchall()
            
            # 处理查询结果
            data_list = []
            for i, row in enumerate(results):
                # 基础数据 - 严格按照图片定义
                data = AdmissionPathwayData(
                    emergency_admission_rate=row[1] or 0.0,  # 急诊入院率
                    outpatient_admission_rate=row[2] or 0.0,  # 门诊入院率
                    transfer_admission_rate=row[3] or 0.0  # 转院入院率
                )
                
                # 计算同比环比数据
                year_over_year = self._calculate_year_over_year(results, i, time_range)
                month_over_month = self._calculate_month_over_month(results, i)
                
                response = AdmissionPathwayResponse(
                    date=str(row[0]),
                    data=data,
                    year_over_year=year_over_year,
                    month_over_month=month_over_month
                )
                data_list.append(response)
            
            cursor.close()
            logger.info(f"成功获取 {len(data_list)} 条数据")
            return data_list
            
        except Exception as e:
            logger.error(f"获取入院途径数据失败: {str(e)}")
            raise Exception(f"数据获取失败: {str(e)}")
    
    def get_indicators_summary(self, time_range: str) -> AdmissionPathwayData:
        """
        获取指标统计摘要
        
        :param time_range: 时间范围
        :return: 指标摘要数据
        """
        try:
            logger.info(f"获取指标摘要 - 时间范围: {time_range}")
            
            if not self.db_connection:
                logger.warning("PostgreSQL数据库连接未配置，返回默认数据")
                return AdmissionPathwayData()
            
            # 构建摘要查询SQL - 严格按照图片指标
            summary_query = """
            SELECT 
                CASE 
                    WHEN SUM(emergency_total_visits) > 0 
                    THEN (SUM(emergency_admissions)::FLOAT / SUM(emergency_total_visits)) * 100
                    ELSE 0 
                END as avg_emergency_admission_rate,
                CASE 
                    WHEN SUM(outpatient_total_visits) > 0 
                    THEN (SUM(outpatient_admissions)::FLOAT / SUM(outpatient_total_visits)) * 100
                    ELSE 0 
                END as avg_outpatient_admission_rate,
                CASE 
                    WHEN SUM(transfer_total_visits) > 0 
                    THEN (SUM(transfer_admissions)::FLOAT / SUM(transfer_total_visits)) * 100
                    ELSE 0 
                END as avg_transfer_admission_rate
            FROM admission_pathway_data 
            WHERE time_range = %s
            """
            
            cursor = self.db_connection.cursor()
            cursor.execute(summary_query, (time_range,))
            result = cursor.fetchone()
            cursor.close()
            
            if result:
                return AdmissionPathwayData(
                    emergency_admission_rate=result[0] or 0.0,
                    outpatient_admission_rate=result[1] or 0.0,
                    transfer_admission_rate=result[2] or 0.0
                )
            else:
                return AdmissionPathwayData()
                
        except Exception as e:
            logger.error(f"获取指标摘要失败: {str(e)}")
            raise Exception(f"数据获取失败: {str(e)}")
    
    def _build_query(self, time_range: str, start_date: Optional[str], end_date: Optional[str]) -> str:
        """
        构建PostgreSQL查询SQL - 严格按照图片指标
        
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
                WHEN SUM(emergency_total_visits) > 0 
                THEN (SUM(emergency_admissions)::FLOAT / SUM(emergency_total_visits)) * 100
                ELSE 0 
            END as emergency_admission_rate,
            CASE 
                WHEN SUM(outpatient_total_visits) > 0 
                THEN (SUM(outpatient_admissions)::FLOAT / SUM(outpatient_total_visits)) * 100
                ELSE 0 
            END as outpatient_admission_rate,
            CASE 
                WHEN SUM(transfer_total_visits) > 0 
                THEN (SUM(transfer_admissions)::FLOAT / SUM(transfer_total_visits)) * 100
                ELSE 0 
            END as transfer_admission_rate
        FROM admission_pathway_data 
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
    
    def _calculate_year_over_year(self, results: List, current_index: int, time_range: str) -> Dict[str, ComparisonData]:
        """
        计算同比数据
        
        :param results: 查询结果列表
        :param current_index: 当前数据索引
        :param time_range: 时间范围
        :return: 同比数据字典
        """
        year_over_year = {}
        
        # 根据时间范围确定同比对比的索引偏移
        offset_map = {
            'day': 365,  # 去年同一天
            'month': 12,  # 去年同月
            'quarter': 4,  # 去年同季度
            'year': 1     # 上一年
        }
        
        offset = offset_map.get(time_range, 12)
        previous_index = current_index - offset
        
        if previous_index >= 0 and previous_index < len(results):
            current_row = results[current_index]
            previous_row = results[previous_index]
            
            # 急诊入院率同比
            year_over_year['emergencyAdmissionRate'] = self._create_comparison_data(
                current_row[1] or 0.0, previous_row[1] or 0.0, "同比"
            )
            
            # 门诊入院率同比
            year_over_year['outpatientAdmissionRate'] = self._create_comparison_data(
                current_row[2] or 0.0, previous_row[2] or 0.0, "同比"
            )
            
            # 转院入院率同比
            year_over_year['transferAdmissionRate'] = self._create_comparison_data(
                current_row[3] or 0.0, previous_row[3] or 0.0, "同比"
            )
        
        return year_over_year
    
    def _calculate_month_over_month(self, results: List, current_index: int) -> Dict[str, ComparisonData]:
        """
        计算环比数据
        
        :param results: 查询结果列表
        :param current_index: 当前数据索引
        :return: 环比数据字典
        """
        month_over_month = {}
        
        previous_index = current_index - 1
        
        if previous_index >= 0:
            current_row = results[current_index]
            previous_row = results[previous_index]
            
            # 急诊入院率环比
            month_over_month['emergencyAdmissionRate'] = self._create_comparison_data(
                current_row[1] or 0.0, previous_row[1] or 0.0, "环比"
            )
            
            # 门诊入院率环比
            month_over_month['outpatientAdmissionRate'] = self._create_comparison_data(
                current_row[2] or 0.0, previous_row[2] or 0.0, "环比"
            )
            
            # 转院入院率环比
            month_over_month['transferAdmissionRate'] = self._create_comparison_data(
                current_row[3] or 0.0, previous_row[3] or 0.0, "环比"
            )
        
        return month_over_month
    
    def _create_comparison_data(self, current_value: float, previous_value: float, comparison_type: str) -> ComparisonData:
        """
        创建比较数据对象
        
        :param current_value: 当前值
        :param previous_value: 对比值
        :param comparison_type: 比较类型
        :return: 比较数据对象
        """
        comparison_rate = self._calculate_comparison_rate(current_value, previous_value)
        
        # 确定变化类型
        if comparison_rate > 2:
            change_type = "increase"
        elif comparison_rate < -2:
            change_type = "decrease"
        else:
            change_type = "stable"
        
        return ComparisonData(
            current_value=current_value,
            previous_value=previous_value,
            comparison_rate=comparison_rate,
            comparison_type=comparison_type,
            change_type=change_type
        )
    
    def _calculate_comparison_rate(self, current_value: float, previous_value: float) -> float:
        """
        计算对比率
        
        :param current_value: 当前值
        :param previous_value: 对比值
        :return: 对比率(%)
        """
        if previous_value == 0:
            return 0.0
        return ((current_value - previous_value) / previous_value) * 100

class AdmissionPathwayCalculator:
    """入院途径指标计算器 - 严格按照图片公式"""
    
    @staticmethod
    def calculate_emergency_admission_rate(emergency_admissions: int, emergency_total_visits: int) -> float:
        """
        计算急诊入院率
        公式：急诊入院人次/急诊总人次×100%
        
        :param emergency_admissions: 急诊入院人次
        :param emergency_total_visits: 急诊总人次
        :return: 急诊入院率(%)
        """
        if emergency_total_visits == 0:
            return 0.0
        return (emergency_admissions / emergency_total_visits) * 100
    
    @staticmethod
    def calculate_outpatient_admission_rate(outpatient_admissions: int, outpatient_total_visits: int) -> float:
        """
        计算门诊入院率
        公式：门诊入院人次/门诊总人次×100%
        
        :param outpatient_admissions: 门诊入院人次
        :param outpatient_total_visits: 门诊总人次
        :return: 门诊入院率(%)
        """
        if outpatient_total_visits == 0:
            return 0.0
        return (outpatient_admissions / outpatient_total_visits) * 100
    
    @staticmethod
    def calculate_transfer_admission_rate(transfer_admissions: int, transfer_total_visits: int) -> float:
        """
        计算转院入院率
        公式：转院入院人次/转院总人次×100%
        
        :param transfer_admissions: 转院入院人次
        :param transfer_total_visits: 转院总人次
        :return: 转院入院率(%)
        """
        if transfer_total_visits == 0:
            return 0.0
        return (transfer_admissions / transfer_total_visits) * 100
    
    @staticmethod
    def analyze_pathway_trends(data_list: List[AdmissionPathwayData]) -> Dict[str, str]:
        """
        分析入院途径趋势
        
        :param data_list: 入院途径数据列表
        :return: 趋势分析结果
        """
        if len(data_list) < 2:
            return {
                'emergency_trend': 'stable',
                'outpatient_trend': 'stable',
                'transfer_trend': 'stable'
            }
        
        # 计算各指标趋势
        emergency_rates = [data.emergency_admission_rate for data in data_list]
        outpatient_rates = [data.outpatient_admission_rate for data in data_list]
        transfer_rates = [data.transfer_admission_rate for data in data_list]
        
        def get_trend(rates):
            if rates[-1] > rates[0] * 1.05:
                return 'increasing'
            elif rates[-1] < rates[0] * 0.95:
                return 'decreasing'
            else:
                return 'stable'
        
        return {
            'emergency_trend': get_trend(emergency_rates),
            'outpatient_trend': get_trend(outpatient_rates),
            'transfer_trend': get_trend(transfer_rates)
        }

# PostgreSQL数据库表结构创建SQL - 严格按照图片指标设计
CREATE_TABLES_SQL = """
-- 入院途径数据表 - 严格按照图片指标定义
CREATE TABLE IF NOT EXISTS admission_pathway_data (
    id BIGSERIAL PRIMARY KEY,
    date_period DATE NOT NULL,
    department_id VARCHAR(50),
    department_name VARCHAR(100),
    emergency_total_visits INTEGER DEFAULT 0, -- 急诊总人次
    emergency_admissions INTEGER DEFAULT 0, -- 急诊入院人次
    outpatient_total_visits INTEGER DEFAULT 0, -- 门诊总人次
    outpatient_admissions INTEGER DEFAULT 0, -- 门诊入院人次
    transfer_total_visits INTEGER DEFAULT 0, -- 转院总人次
    transfer_admissions INTEGER DEFAULT 0, -- 转院入院人次
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_admission_pathway_data_date_period ON admission_pathway_data(date_period);
CREATE INDEX IF NOT EXISTS idx_admission_pathway_data_department ON admission_pathway_data(department_id);

-- 添加表注释
COMMENT ON TABLE admission_pathway_data IS '入院途径数据表 - 严格按照指标图片定义';
COMMENT ON COLUMN admission_pathway_data.date_period IS '统计日期';
COMMENT ON COLUMN admission_pathway_data.emergency_total_visits IS '急诊总人次';
COMMENT ON COLUMN admission_pathway_data.emergency_admissions IS '急诊入院人次';
COMMENT ON COLUMN admission_pathway_data.outpatient_total_visits IS '门诊总人次';
COMMENT ON COLUMN admission_pathway_data.outpatient_admissions IS '门诊入院人次';
COMMENT ON COLUMN admission_pathway_data.transfer_total_visits IS '转院总人次';
COMMENT ON COLUMN admission_pathway_data.transfer_admissions IS '转院入院人次';
COMMENT ON COLUMN admission_pathway_data.department_id IS '科室ID';
COMMENT ON COLUMN admission_pathway_data.department_name IS '科室名称';

-- 入院途径汇总数据表
CREATE TABLE IF NOT EXISTS admission_pathway_summary (
    id BIGSERIAL PRIMARY KEY,
    time_range VARCHAR(20) NOT NULL CHECK (time_range IN ('day', 'month', 'quarter', 'year')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_emergency_visits INTEGER DEFAULT 0, -- 总急诊人次
    total_emergency_admissions INTEGER DEFAULT 0, -- 总急诊入院人次
    total_outpatient_visits INTEGER DEFAULT 0, -- 总门诊人次
    total_outpatient_admissions INTEGER DEFAULT 0, -- 总门诊入院人次
    total_transfer_visits INTEGER DEFAULT 0, -- 总转院人次
    total_transfer_admissions INTEGER DEFAULT 0, -- 总转院入院人次
    avg_emergency_admission_rate DECIMAL(10,2) DEFAULT 0, -- 平均急诊入院率
    avg_outpatient_admission_rate DECIMAL(10,2) DEFAULT 0, -- 平均门诊入院率
    avg_transfer_admission_rate DECIMAL(10,2) DEFAULT 0, -- 平均转院入院率
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_admission_pathway_summary_time_range_period ON admission_pathway_summary(time_range, period_start, period_end);

-- 添加表注释
COMMENT ON TABLE admission_pathway_summary IS '入院途径汇总数据表';
COMMENT ON COLUMN admission_pathway_summary.time_range IS '时间范围';
COMMENT ON COLUMN admission_pathway_summary.period_start IS '统计期间开始日期';
COMMENT ON COLUMN admission_pathway_summary.period_end IS '统计期间结束日期';
COMMENT ON COLUMN admission_pathway_summary.avg_emergency_admission_rate IS '平均急诊入院率(%)';
COMMENT ON COLUMN admission_pathway_summary.avg_outpatient_admission_rate IS '平均门诊入院率(%)';
COMMENT ON COLUMN admission_pathway_summary.avg_transfer_admission_rate IS '平均转院入院率(%)';

-- 创建更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为表创建更新时间触发器
CREATE TRIGGER update_admission_pathway_data_updated_at BEFORE UPDATE
    ON admission_pathway_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admission_pathway_summary_updated_at BEFORE UPDATE
    ON admission_pathway_summary FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 创建视图用于入院途径分析
CREATE OR REPLACE VIEW admission_pathway_analysis_view AS
SELECT 
    date_period,
    department_id,
    department_name,
    emergency_total_visits,
    emergency_admissions,
    outpatient_total_visits,
    outpatient_admissions,
    transfer_total_visits,
    transfer_admissions,
    CASE 
        WHEN emergency_total_visits > 0 
        THEN (emergency_admissions::FLOAT / emergency_total_visits) * 100
        ELSE 0 
    END as emergency_admission_rate,
    CASE 
        WHEN outpatient_total_visits > 0 
        THEN (outpatient_admissions::FLOAT / outpatient_total_visits) * 100
        ELSE 0 
    END as outpatient_admission_rate,
    CASE 
        WHEN transfer_total_visits > 0 
        THEN (transfer_admissions::FLOAT / transfer_total_visits) * 100
        ELSE 0 
    END as transfer_admission_rate
FROM admission_pathway_data
ORDER BY date_period, department_id;

-- 添加视图注释
COMMENT ON VIEW admission_pathway_analysis_view IS '入院途径分析视图，包含计算后的各项入院率指标';
"""

# 使用示例
if __name__ == "__main__":
    # 示例：如何使用入院途径服务
    
    # 1. 创建服务实例（需要传入PostgreSQL数据库连接）
    # import psycopg2
    # db_connection = psycopg2.connect(
    #     host='localhost',
    #     user='your_username',
    #     password='your_password',
    #     database='your_database',
    #     port='5432'
    # )
    # service = AdmissionPathwayService(db_connection)
    
    # 2. 不使用数据库连接的示例
    service = AdmissionPathwayService()
    
    try:
        # 获取月度数据
        monthly_data = service.get_admission_pathway_data('month', '2024-01-01', '2024-12-31')
        print(f"获取到 {len(monthly_data)} 条月度数据")
        
        # 获取指标摘要
        summary = service.get_indicators_summary('month')
        print(f"指标摘要: {summary}")
        
        # 使用计算器计算指标
        calculator = AdmissionPathwayCalculator()
        
        # 计算急诊入院率：急诊入院人次/急诊总人次×100%
        emergency_rate = calculator.calculate_emergency_admission_rate(120, 1000)
        print(f"急诊入院率: {emergency_rate}%")
        
        # 计算门诊入院率：门诊入院人次/门诊总人次×100%
        outpatient_rate = calculator.calculate_outpatient_admission_rate(80, 2000)
        print(f"门诊入院率: {outpatient_rate}%")
        
        # 计算转院入院率：转院入院人次/转院总人次×100%
        transfer_rate = calculator.calculate_transfer_admission_rate(45, 150)
        print(f"转院入院率: {transfer_rate}%")
        
    except Exception as e:
        print(f"执行失败: {e}")