
"""
出入院人次数据处理模块 - 严格按照表格指标定义
提供出入院人次相关指标的数据查询和计算功能
支持PostgreSQL数据库

指标定义（严格按照表格）：
1. 入院人次：某期居民到某医院办理入院的人次总数
2. 出院人次：某期居民到某医院办理出院的人次总数  
3. 住院人头人次比：某期居民住院人数/某期居民住院人次数×100%
"""

from datetime import datetime, timedelta
from typing import List, Dict, Optional, Union
from dataclasses import dataclass
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class AdmissionDischargeData:
    """出入院人次数据模型 - 严格按照表格定义"""
    admission_count: int = 0  # 入院人次 - 某期居民到某医院办理入院的人次总数
    discharge_count: int = 0  # 出院人次 - 某期居民到某医院办理出院的人次总数
    inpatient_ratio: float = 0.0  # 住院人头人次比(%) - 某期居民住院人数/某期居民住院人次数×100%

@dataclass
class ComparisonData:
    """同比环比数据模型"""
    current_value: Union[int, float] = 0
    previous_value: Union[int, float] = 0
    comparison_rate: float = 0.0  # 同比/环比率(%)
    comparison_type: str = ""  # "同比" 或 "环比"

@dataclass
class AdmissionDischargeResponse:
    """出入院人次响应数据模型"""
    date: str
    data: AdmissionDischargeData
    year_over_year: Dict[str, ComparisonData]  # 同比数据
    month_over_month: Dict[str, ComparisonData]  # 环比数据

class AdmissionDischargeService:
    """出入院人次服务类 - 严格按照表格指标实现"""
    
    def __init__(self, db_connection=None):
        """
        初始化服务
        :param db_connection: PostgreSQL数据库连接对象
        """
        self.db_connection = db_connection
        
    def get_admission_discharge_data(
        self, 
        time_range: str, 
        start_date: Optional[str] = None, 
        end_date: Optional[str] = None
    ) -> List[AdmissionDischargeResponse]:
        """
        获取出入院人次数据
        
        :param time_range: 时间范围 ('day', 'month', 'quarter', 'year')
        :param start_date: 开始日期 (YYYY-MM-DD)
        :param end_date: 结束日期 (YYYY-MM-DD)
        :return: 出入院人次数据列表
        """
        try:
            logger.info(f"查询出入院人次数据 - 时间范围: {time_range}, 开始日期: {start_date}, 结束日期: {end_date}")
            
            # 如果没有数据库连接，返回空数据
            if not self.db_connection:
                logger.warning("PostgreSQL数据库连接未配置，返回空数据")
                return []
            
            # 构建SQL查询 - 严格按照表格指标
            query = self._build_query(time_range, start_date, end_date)
            
            # 执行查询
            cursor = self.db_connection.cursor()
            cursor.execute(query, self._get_query_params(start_date, end_date))
            results = cursor.fetchall()
            
            # 处理查询结果
            data_list = []
            for i, row in enumerate(results):
                # 基础数据 - 严格按照表格定义
                data = AdmissionDischargeData(
                    admission_count=row[1] or 0,  # 入院人次
                    discharge_count=row[2] or 0,  # 出院人次
                    inpatient_ratio=row[3] or 0.0  # 住院人头人次比
                )
                
                # 计算同比环比数据
                year_over_year = self._calculate_year_over_year(results, i, time_range)
                month_over_month = self._calculate_month_over_month(results, i)
                
                response = AdmissionDischargeResponse(
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
            logger.error(f"获取出入院人次数据失败: {str(e)}")
            raise Exception(f"数据获取失败: {str(e)}")
    
    def get_indicators_summary(self, time_range: str) -> AdmissionDischargeData:
        """
        获取指标统计摘要
        
        :param time_range: 时间范围
        :return: 指标摘要数据
        """
        try:
            logger.info(f"获取指标摘要 - 时间范围: {time_range}")
            
            if not self.db_connection:
                logger.warning("PostgreSQL数据库连接未配置，返回默认数据")
                return AdmissionDischargeData()
            
            # 构建摘要查询SQL - 严格按照表格指标
            summary_query = """
            SELECT 
                SUM(admission_count) as total_admissions,
                SUM(discharge_count) as total_discharges,
                CASE 
                    WHEN SUM(admission_count) > 0 
                    THEN (SUM(inpatient_head_count)::FLOAT / SUM(admission_count)) * 100
                    ELSE 0 
                END as avg_inpatient_ratio
            FROM admission_discharge_data 
            WHERE time_range = %s
            """
            
            cursor = self.db_connection.cursor()
            cursor.execute(summary_query, (time_range,))
            result = cursor.fetchone()
            cursor.close()
            
            if result:
                return AdmissionDischargeData(
                    admission_count=result[0] or 0,
                    discharge_count=result[1] or 0,
                    inpatient_ratio=result[2] or 0.0
                )
            else:
                return AdmissionDischargeData()
                
        except Exception as e:
            logger.error(f"获取指标摘要失败: {str(e)}")
            raise Exception(f"数据获取失败: {str(e)}")
    
    def _build_query(self, time_range: str, start_date: Optional[str], end_date: Optional[str]) -> str:
        """
        构建PostgreSQL查询SQL - 严格按照表格指标
        
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
            SUM(admission_count) as admission_count,
            SUM(discharge_count) as discharge_count,
            CASE 
                WHEN SUM(admission_count) > 0 
                THEN (SUM(inpatient_head_count)::FLOAT / SUM(admission_count)) * 100
                ELSE 0 
            END as inpatient_ratio
        FROM admission_discharge_data 
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
            
            # 入院人次同比
            year_over_year['admission_count'] = ComparisonData(
                current_value=current_row[1] or 0,
                previous_value=previous_row[1] or 0,
                comparison_rate=self._calculate_comparison_rate(current_row[1] or 0, previous_row[1] or 0),
                comparison_type="同比"
            )
            
            # 出院人次同比
            year_over_year['discharge_count'] = ComparisonData(
                current_value=current_row[2] or 0,
                previous_value=previous_row[2] or 0,
                comparison_rate=self._calculate_comparison_rate(current_row[2] or 0, previous_row[2] or 0),
                comparison_type="同比"
            )
            
            # 住院人头人次比同比
            year_over_year['inpatient_ratio'] = ComparisonData(
                current_value=current_row[3] or 0.0,
                previous_value=previous_row[3] or 0.0,
                comparison_rate=self._calculate_comparison_rate(current_row[3] or 0.0, previous_row[3] or 0.0),
                comparison_type="同比"
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
            
            # 入院人次环比
            month_over_month['admission_count'] = ComparisonData(
                current_value=current_row[1] or 0,
                previous_value=previous_row[1] or 0,
                comparison_rate=self._calculate_comparison_rate(current_row[1] or 0, previous_row[1] or 0),
                comparison_type="环比"
            )
            
            # 出院人次环比
            month_over_month['discharge_count'] = ComparisonData(
                current_value=current_row[2] or 0,
                previous_value=previous_row[2] or 0,
                comparison_rate=self._calculate_comparison_rate(current_row[2] or 0, previous_row[2] or 0),
                comparison_type="环比"
            )
            
            # 住院人头人次比环比
            month_over_month['inpatient_ratio'] = ComparisonData(
                current_value=current_row[3] or 0.0,
                previous_value=previous_row[3] or 0.0,
                comparison_rate=self._calculate_comparison_rate(current_row[3] or 0.0, previous_row[3] or 0.0),
                comparison_type="环比"
            )
        
        return month_over_month
    
    def _calculate_comparison_rate(self, current_value: Union[int, float], previous_value: Union[int, float]) -> float:
        """
        计算对比率
        
        :param current_value: 当前值
        :param previous_value: 对比值
        :return: 对比率(%)
        """
        if previous_value == 0:
            return 0.0
        return ((current_value - previous_value) / previous_value) * 100

class AdmissionDischargeCalculator:
    """出入院人次指标计算器 - 严格按照表格公式"""
    
    @staticmethod
    def calculate_inpatient_ratio(inpatient_head_count: int, admission_count: int) -> float:
        """
        计算住院人头人次比
        公式：某期居民住院人数/某期居民住院人次数×100%
        
        :param inpatient_head_count: 住院人数
        :param admission_count: 入院人次数
        :return: 住院人头人次比(%)
        """
        if admission_count == 0:
            return 0.0
        return (inpatient_head_count / admission_count) * 100
    
    @staticmethod
    def calculate_admission_growth_rate(current_admission: int, previous_admission: int) -> float:
        """
        计算入院人次增减率
        
        :param current_admission: 本期入院人次
        :param previous_admission: 上期入院人次
        :return: 入院人次增减率(%)
        """
        if previous_admission == 0:
            return 0.0
        return ((current_admission - previous_admission) / previous_admission) * 100
    
    @staticmethod
    def calculate_discharge_growth_rate(current_discharge: int, previous_discharge: int) -> float:
        """
        计算出院人次增减率
        
        :param current_discharge: 本期出院人次
        :param previous_discharge: 上期出院人次
        :return: 出院人次增减率(%)
        """
        if previous_discharge == 0:
            return 0.0
        return ((current_discharge - previous_discharge) / previous_discharge) * 100

# PostgreSQL数据库表结构创建SQL - 严格按照表格指标设计
CREATE_TABLES_SQL = """
-- 出入院人次数据表 - 严格按照表格指标定义
CREATE TABLE IF NOT EXISTS admission_discharge_data (
    id BIGSERIAL PRIMARY KEY,
    date_period DATE NOT NULL,
    department_id VARCHAR(50),
    department_name VARCHAR(100),
    admission_count INTEGER DEFAULT 0, -- 入院人次：某期居民到某医院办理入院的人次总数
    discharge_count INTEGER DEFAULT 0, -- 出院人次：某期居民到某医院办理出院的人次总数
    inpatient_head_count INTEGER DEFAULT 0, -- 住院人数：用于计算住院人头人次比
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_admission_discharge_data_date_period ON admission_discharge_data(date_period);
CREATE INDEX IF NOT EXISTS idx_admission_discharge_data_department ON admission_discharge_data(department_id);

-- 添加表注释
COMMENT ON TABLE admission_discharge_data IS '出入院人次数据表 - 严格按照指标表格定义';
COMMENT ON COLUMN admission_discharge_data.date_period IS '统计日期';
COMMENT ON COLUMN admission_discharge_data.admission_count IS '入院人次 - 某期居民到某医院办理入院的人次总数';
COMMENT ON COLUMN admission_discharge_data.discharge_count IS '出院人次 - 某期居民到某医院办理出院的人次总数';
COMMENT ON COLUMN admission_discharge_data.inpatient_head_count IS '住院人数 - 用于计算住院人头人次比';
COMMENT ON COLUMN admission_discharge_data.department_id IS '科室ID';
COMMENT ON COLUMN admission_discharge_data.department_name IS '科室名称';

-- 出入院人次汇总数据表
CREATE TABLE IF NOT EXISTS admission_discharge_summary (
    id BIGSERIAL PRIMARY KEY,
    time_range VARCHAR(20) NOT NULL CHECK (time_range IN ('day', 'month', 'quarter', 'year')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_admissions INTEGER DEFAULT 0, -- 总入院人次
    total_discharges INTEGER DEFAULT 0, -- 总出院人次
    total_inpatient_head_count INTEGER DEFAULT 0, -- 总住院人数
    avg_inpatient_ratio DECIMAL(10,2) DEFAULT 0, -- 平均住院人头人次比
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_admission_discharge_summary_time_range_period ON admission_discharge_summary(time_range, period_start, period_end);

-- 添加表注释
COMMENT ON TABLE admission_discharge_summary IS '出入院人次汇总数据表';
COMMENT ON COLUMN admission_discharge_summary.time_range IS '时间范围';
COMMENT ON COLUMN admission_discharge_summary.period_start IS '统计期间开始日期';
COMMENT ON COLUMN admission_discharge_summary.period_end IS '统计期间结束日期';
COMMENT ON COLUMN admission_discharge_summary.total_admissions IS '总入院人次';
COMMENT ON COLUMN admission_discharge_summary.total_discharges IS '总出院人次';
COMMENT ON COLUMN admission_discharge_summary.total_inpatient_head_count IS '总住院人数';
COMMENT ON COLUMN admission_discharge_summary.avg_inpatient_ratio IS '平均住院人头人次比(%)';

-- 科室信息表
CREATE TABLE IF NOT EXISTS departments (
    department_id VARCHAR(50) PRIMARY KEY,
    department_name VARCHAR(100) NOT NULL,
    department_type VARCHAR(50) DEFAULT 'clinical',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 添加表注释
COMMENT ON TABLE departments IS '科室信息表';
COMMENT ON COLUMN departments.department_id IS '科室ID';
COMMENT ON COLUMN departments.department_name IS '科室名称';
COMMENT ON COLUMN departments.department_type IS '科室类型';
COMMENT ON COLUMN departments.is_active IS '是否启用';

-- 创建更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为表创建更新时间触发器
CREATE TRIGGER update_admission_discharge_data_updated_at BEFORE UPDATE
    ON admission_discharge_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admission_discharge_summary_updated_at BEFORE UPDATE
    ON admission_discharge_summary FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
"""

# 使用示例
if __name__ == "__main__":
    # 示例：如何使用出入院人次服务
    
    # 1. 创建服务实例（需要传入PostgreSQL数据库连接）
    # import psycopg2
    # db_connection = psycopg2.connect(
    #     host='localhost',
    #     user='your_username',
    #     password='your_password',
    #     database='your_database',
    #     port='5432'
    # )
    # service = AdmissionDischargeService(db_connection)
    
    # 2. 不使用数据库连接的示例
    service = AdmissionDischargeService()
    
    try:
        # 获取月度数据
        monthly_data = service.get_admission_discharge_data('month', '2024-01-01', '2024-12-31')
        print(f"获取到 {len(monthly_data)} 条月度数据")
        
        # 获取指标摘要
        summary = service.get_indicators_summary('month')
        print(f"指标摘要: {summary}")
        
        # 使用计算器计算指标
        calculator = AdmissionDischargeCalculator()
        
        # 计算住院人头人次比：某期居民住院人数/某期居民住院人次数×100%
        inpatient_ratio = calculator.calculate_inpatient_ratio(800, 1000)
        print(f"住院人头人次比: {inpatient_ratio}%")
        
        # 计算入院人次增减率
        admission_growth = calculator.calculate_admission_growth_rate(1200, 1000)
        print(f"入院人次增减率: {admission_growth}%")
        
        # 计算出院人次增减率
        discharge_growth = calculator.calculate_discharge_growth_rate(1150, 1000)
        print(f"出院人次增减率: {discharge_growth}%")
        
    except Exception as e:
        print(f"执行失败: {e}")
