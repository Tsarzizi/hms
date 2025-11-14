"""
疾病构成数据处理模块 - 严格按照表格指标定义
提供疾病构成相关指标的数据查询和计算功能
支持PostgreSQL数据库

指标定义（严格按照表格）：
1. 出院患者疾病构成：某种疾病出院患者人次/出院患者人次×100%
"""

from datetime import datetime, timedelta
from typing import List, Dict, Optional, Union
from dataclasses import dataclass
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class DiseaseCompositionData:
    """疾病构成数据模型 - 严格按照表格定义"""
    disease_composition_rate: float = 0.0  # 出院患者疾病构成(%) - 某种疾病出院患者人次/出院患者人次×100%

@dataclass
class ComparisonData:
    """同比环比数据模型"""
    current_value: float = 0.0
    previous_value: float = 0.0
    comparison_rate: float = 0.0  # 同比/环比率(%)
    comparison_type: str = ""  # "同比" 或 "环比"
    change_type: str = "stable"  # "increase", "decrease", "stable"

@dataclass
class DiseaseCompositionResponse:
    """疾病构成响应数据模型"""
    date: str
    data: DiseaseCompositionData
    year_over_year: Dict[str, ComparisonData]  # 同比数据
    month_over_month: Dict[str, ComparisonData]  # 环比数据

class DiseaseCompositionService:
    """疾病构成服务类 - 严格按照表格指标实现"""
    
    def __init__(self, db_connection=None):
        """
        初始化服务
        :param db_connection: PostgreSQL数据库连接对象
        """
        self.db_connection = db_connection
        
    def get_disease_composition_data(
        self, 
        time_range: str, 
        start_date: Optional[str] = None, 
        end_date: Optional[str] = None,
        disease_type: Optional[str] = None
    ) -> List[DiseaseCompositionResponse]:
        """
        获取疾病构成数据
        
        :param time_range: 时间范围 ('day', 'month', 'quarter', 'year')
        :param start_date: 开始日期 (YYYY-MM-DD)
        :param end_date: 结束日期 (YYYY-MM-DD)
        :param disease_type: 疾病类型筛选
        :return: 疾病构成数据列表
        """
        try:
            logger.info(f"查询疾病构成数据 - 时间范围: {time_range}, 开始日期: {start_date}, 结束日期: {end_date}")
            
            # 如果没有数据库连接，返回空数据
            if not self.db_connection:
                logger.warning("PostgreSQL数据库连接未配置，返回空数据")
                return []
            
            # 构建SQL查询 - 严格按照表格指标
            query = self._build_query(time_range, start_date, end_date, disease_type)
            
            # 执行查询
            cursor = self.db_connection.cursor()
            cursor.execute(query, self._get_query_params(start_date, end_date, disease_type))
            results = cursor.fetchall()
            
            # 处理查询结果
            data_list = []
            for i, row in enumerate(results):
                # 基础数据 - 严格按照表格定义
                data = DiseaseCompositionData(
                    disease_composition_rate=row[1] or 0.0  # 出院患者疾病构成
                )
                
                # 计算同比环比数据
                year_over_year = self._calculate_year_over_year(results, i, time_range)
                month_over_month = self._calculate_month_over_month(results, i)
                
                response = DiseaseCompositionResponse(
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
            logger.error(f"获取疾病构成数据失败: {str(e)}")
            raise Exception(f"数据获取失败: {str(e)}")
    
    def get_indicators_summary(self, time_range: str) -> DiseaseCompositionData:
        """
        获取指标统计摘要
        
        :param time_range: 时间范围
        :return: 指标摘要数据
        """
        try:
            logger.info(f"获取指标摘要 - 时间范围: {time_range}")
            
            if not self.db_connection:
                logger.warning("PostgreSQL数据库连接未配置，返回默认数据")
                return DiseaseCompositionData()
            
            # 构建摘要查询SQL - 严格按照表格指标
            summary_query = """
            SELECT 
                AVG(disease_composition_rate) as avg_disease_composition_rate
            FROM disease_composition_summary 
            WHERE time_range = %s
            """
            
            cursor = self.db_connection.cursor()
            cursor.execute(summary_query, (time_range,))
            result = cursor.fetchone()
            cursor.close()
            
            if result:
                return DiseaseCompositionData(
                    disease_composition_rate=result[0] or 0.0
                )
            else:
                return DiseaseCompositionData()
                
        except Exception as e:
            logger.error(f"获取指标摘要失败: {str(e)}")
            raise Exception(f"数据获取失败: {str(e)}")
    
    def get_comparison_analysis(
        self, 
        current_period: str, 
        comparison_type: str = 'yoy'  # 'yoy' for year-over-year, 'mom' for month-over-month
    ) -> ComparisonData:
        """
        获取同比环比分析数据
        
        :param current_period: 当前期间
        :param comparison_type: 比较类型 ('yoy', 'mom')
        :return: 比较分析数据
        """
        try:
            logger.info(f"获取比较分析数据 - 期间: {current_period}, 类型: {comparison_type}")
            
            if not self.db_connection:
                logger.warning("PostgreSQL数据库连接未配置，返回默认数据")
                return ComparisonData(0.0, 0.0, 0.0, comparison_type, 'stable')
            
            # 构建比较查询SQL
            if comparison_type == 'yoy':
                # 同比分析
                comparison_query = """
                SELECT 
                    current_data.disease_composition_rate as current_value,
                    previous_data.disease_composition_rate as previous_value
                FROM disease_composition_data current_data
                LEFT JOIN disease_composition_data previous_data 
                    ON DATE_PART('month', current_data.date_period) = DATE_PART('month', previous_data.date_period)
                    AND DATE_PART('day', current_data.date_period) = DATE_PART('day', previous_data.date_period)
                    AND DATE_PART('year', previous_data.date_period) = DATE_PART('year', current_data.date_period) - 1
                WHERE current_data.date_period = %s
                """
            else:
                # 环比分析
                comparison_query = """
                SELECT 
                    current_data.disease_composition_rate as current_value,
                    previous_data.disease_composition_rate as previous_value
                FROM disease_composition_data current_data
                LEFT JOIN disease_composition_data previous_data 
                    ON previous_data.date_period = current_data.date_period - INTERVAL '1 month'
                WHERE current_data.date_period = %s
                """
            
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
                    previous_value=previous_value,
                    comparison_rate=change_rate,
                    comparison_type="同比" if comparison_type == 'yoy' else "环比",
                    change_type=change_type
                )
            else:
                return ComparisonData(0.0, 0.0, 0.0, "同比" if comparison_type == 'yoy' else "环比", 'stable')
                
        except Exception as e:
            logger.error(f"获取比较分析数据失败: {str(e)}")
            raise Exception(f"数据获取失败: {str(e)}")
    
    def _build_query(self, time_range: str, start_date: Optional[str], end_date: Optional[str], disease_type: Optional[str]) -> str:
        """
        构建PostgreSQL查询SQL - 严格按照表格指标
        
        :param time_range: 时间范围
        :param start_date: 开始日期
        :param end_date: 结束日期
        :param disease_type: 疾病类型
        :return: SQL查询语句
        """
        # 根据时间范围确定日期格式
        date_format = self._get_date_format(time_range)
        
        # 基础查询 - 严格按照表格指标公式
        query = f"""
        SELECT 
            TO_CHAR(date_period, '{date_format}') as period,
            CASE 
                WHEN SUM(total_discharge_patients) > 0 
                THEN (SUM(disease_discharge_patients)::FLOAT / SUM(total_discharge_patients)) * 100
                ELSE 0 
            END as disease_composition_rate
        FROM disease_composition_data 
        WHERE date_period >= %s AND date_period <= %s
        """
        
        # 如果指定了疾病类型，添加筛选条件
        if disease_type:
            query += " AND disease_type = %s"
        
        query += f" GROUP BY TO_CHAR(date_period, '{date_format}') ORDER BY period"
        
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
    
    def _get_query_params(self, start_date: Optional[str], end_date: Optional[str], disease_type: Optional[str]) -> tuple:
        """
        获取查询参数
        
        :param start_date: 开始日期
        :param end_date: 结束日期
        :param disease_type: 疾病类型
        :return: 查询参数元组
        """
        if not start_date:
            start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        if not end_date:
            end_date = datetime.now().strftime('%Y-%m-%d')
        
        params = [start_date, end_date]
        if disease_type:
            params.append(disease_type)
        
        return tuple(params)
    
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
            
            current_value = current_row[1] or 0.0
            previous_value = previous_row[1] or 0.0
            
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
            
            # 出院患者疾病构成同比
            year_over_year['disease_composition_rate'] = ComparisonData(
                current_value=current_value,
                previous_value=previous_value,
                comparison_rate=change_rate,
                comparison_type="同比",
                change_type=change_type
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
            
            current_value = current_row[1] or 0.0
            previous_value = previous_row[1] or 0.0
            
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
            
            # 出院患者疾病构成环比
            month_over_month['disease_composition_rate'] = ComparisonData(
                current_value=current_value,
                previous_value=previous_value,
                comparison_rate=change_rate,
                comparison_type="环比",
                change_type=change_type
            )
        
        return month_over_month

class DiseaseCompositionCalculator:
    """疾病构成指标计算器 - 严格按照表格公式"""
    
    @staticmethod
    def calculate_disease_composition_rate(disease_discharge_patients: int, total_discharge_patients: int) -> float:
        """
        计算出院患者疾病构成
        公式：某种疾病出院患者人次/出院患者人次×100%
        
        :param disease_discharge_patients: 某种疾病出院患者人次
        :param total_discharge_patients: 出院患者人次
        :return: 出院患者疾病构成(%)
        """
        if total_discharge_patients == 0:
            return 0.0
        return (disease_discharge_patients / total_discharge_patients) * 100
    
    @staticmethod
    def calculate_disease_composition_growth_rate(current_rate: float, previous_rate: float) -> float:
        """
        计算疾病构成增减率
        
        :param current_rate: 本期疾病构成率
        :param previous_rate: 上期疾病构成率
        :return: 疾病构成增减率(%)
        """
        if previous_rate == 0:
            return 0.0
        return ((current_rate - previous_rate) / previous_rate) * 100
    
    @staticmethod
    def analyze_disease_composition_trend(data_list: List[DiseaseCompositionData]) -> Dict[str, str]:
        """
        分析疾病构成趋势
        
        :param data_list: 疾病构成数据列表
        :return: 趋势分析结果
        """
        if len(data_list) < 2:
            return {'disease_composition_trend': 'stable'}
        
        # 计算疾病构成趋势
        rates = [data.disease_composition_rate for data in data_list]
        
        if rates[-1] > rates[0] * 1.05:
            trend = 'increasing'
        elif rates[-1] < rates[0] * 0.95:
            trend = 'decreasing'
        else:
            trend = 'stable'
        
        return {'disease_composition_trend': trend}

# PostgreSQL数据库表结构创建SQL - 严格按照表格指标设计
CREATE_TABLES_SQL = """
-- 疾病构成数据表 - 严格按照表格指标定义
CREATE TABLE IF NOT EXISTS disease_composition_data (
    id BIGSERIAL PRIMARY KEY,
    date_period DATE NOT NULL,
    disease_type VARCHAR(100), -- 疾病类型
    disease_name VARCHAR(200), -- 疾病名称
    icd_code VARCHAR(20), -- ICD编码
    disease_discharge_patients INTEGER DEFAULT 0, -- 某种疾病出院患者人次
    total_discharge_patients INTEGER DEFAULT 0, -- 出院患者人次总数
    department_id VARCHAR(50),
    department_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_disease_composition_data_date_period ON disease_composition_data(date_period);
CREATE INDEX IF NOT EXISTS idx_disease_composition_data_disease_type ON disease_composition_data(disease_type);
CREATE INDEX IF NOT EXISTS idx_disease_composition_data_icd_code ON disease_composition_data(icd_code);

-- 添加表注释
COMMENT ON TABLE disease_composition_data IS '疾病构成数据表 - 严格按照指标表格定义';
COMMENT ON COLUMN disease_composition_data.date_period IS '统计日期';
COMMENT ON COLUMN disease_composition_data.disease_type IS '疾病类型';
COMMENT ON COLUMN disease_composition_data.disease_name IS '疾病名称';
COMMENT ON COLUMN disease_composition_data.icd_code IS 'ICD疾病编码';
COMMENT ON COLUMN disease_composition_data.disease_discharge_patients IS '某种疾病出院患者人次';
COMMENT ON COLUMN disease_composition_data.total_discharge_patients IS '出院患者人次总数';
COMMENT ON COLUMN disease_composition_data.department_id IS '科室ID';
COMMENT ON COLUMN disease_composition_data.department_name IS '科室名称';

-- 疾病构成汇总数据表
CREATE TABLE IF NOT EXISTS disease_composition_summary (
    id BIGSERIAL PRIMARY KEY,
    time_range VARCHAR(20) NOT NULL CHECK (time_range IN ('day', 'month', 'quarter', 'year')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    disease_type VARCHAR(100),
    disease_composition_rate DECIMAL(10,2) DEFAULT 0, -- 出院患者疾病构成率
    total_disease_discharge_patients INTEGER DEFAULT 0, -- 该疾病出院患者总人次
    total_discharge_patients INTEGER DEFAULT 0, -- 出院患者总人次
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_disease_composition_summary_time_range_period ON disease_composition_summary(time_range, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_disease_composition_summary_disease_type ON disease_composition_summary(disease_type);

-- 添加表注释
COMMENT ON TABLE disease_composition_summary IS '疾病构成汇总数据表';
COMMENT ON COLUMN disease_composition_summary.time_range IS '时间范围';
COMMENT ON COLUMN disease_composition_summary.period_start IS '统计期间开始日期';
COMMENT ON COLUMN disease_composition_summary.period_end IS '统计期间结束日期';
COMMENT ON COLUMN disease_composition_summary.disease_type IS '疾病类型';
COMMENT ON COLUMN disease_composition_summary.disease_composition_rate IS '出院患者疾病构成率(%)';
COMMENT ON COLUMN disease_composition_summary.total_disease_discharge_patients IS '该疾病出院患者总人次';
COMMENT ON COLUMN disease_composition_summary.total_discharge_patients IS '出院患者总人次';

-- 疾病分类字典表
CREATE TABLE IF NOT EXISTS disease_categories (
    id BIGSERIAL PRIMARY KEY,
    disease_type VARCHAR(100) NOT NULL,
    disease_category VARCHAR(100) NOT NULL,
    icd_code_prefix VARCHAR(10),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 添加表注释
COMMENT ON TABLE disease_categories IS '疾病分类字典表';
COMMENT ON COLUMN disease_categories.disease_type IS '疾病类型';
COMMENT ON COLUMN disease_categories.disease_category IS '疾病分类';
COMMENT ON COLUMN disease_categories.icd_code_prefix IS 'ICD编码前缀';
COMMENT ON COLUMN disease_categories.description IS '描述';
COMMENT ON COLUMN disease_categories.is_active IS '是否启用';

-- 创建更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为表创建更新时间触发器
CREATE TRIGGER update_disease_composition_data_updated_at BEFORE UPDATE
    ON disease_composition_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_disease_composition_summary_updated_at BEFORE UPDATE
    ON disease_composition_summary FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 创建视图用于疾病构成分析
CREATE OR REPLACE VIEW disease_composition_analysis_view AS
SELECT 
    date_period,
    disease_type,
    disease_name,
    icd_code,
    disease_discharge_patients,
    total_discharge_patients,
    CASE 
        WHEN total_discharge_patients > 0 
        THEN (disease_discharge_patients::FLOAT / total_discharge_patients) * 100
        ELSE 0 
    END as disease_composition_rate,
    department_name
FROM disease_composition_data
ORDER BY date_period, disease_composition_rate DESC;

-- 添加视图注释
COMMENT ON VIEW disease_composition_analysis_view IS '疾病构成分析视图，包含计算后的疾病构成率';

-- 插入常见疾病分类数据
INSERT INTO disease_categories (disease_type, disease_category, icd_code_prefix, description) VALUES
('循环系统疾病', '心血管疾病', 'I', '包括高血压、心肌梗死、心律失常等'),
('呼吸系统疾病', '呼吸道疾病', 'J', '包括肺炎、慢阻肺、哮喘等'),
('消化系统疾病', '消化道疾病', 'K', '包括胃炎、肝炎、胆囊炎等'),
('内分泌疾病', '代谢性疾病', 'E', '包括糖尿病、甲状腺疾病等'),
('神经系统疾病', '神经疾病', 'G', '包括脑梗死、癫痫、帕金森等'),
('肿瘤', '恶性肿瘤', 'C', '各种恶性肿瘤'),
('外伤', '损伤和中毒', 'S,T', '各种外伤、骨折、中毒等'),
('泌尿系统疾病', '泌尿生殖疾病', 'N', '包括肾炎、尿路感染等')
ON CONFLICT DO NOTHING;
"""

# 使用示例
if __name__ == "__main__":
    # 示例：如何使用疾病构成服务
    
    # 1. 创建服务实例（需要传入PostgreSQL数据库连接）
    # import psycopg2
    # db_connection = psycopg2.connect(
    #     host='localhost',
    #     user='your_username',
    #     password='your_password',
    #     database='your_database',
    #     port='5432'
    # )
    # service = DiseaseCompositionService(db_connection)
    
    # 2. 不使用数据库连接的示例
    service = DiseaseCompositionService()
    
    try:
        # 获取月度数据
        monthly_data = service.get_disease_composition_data('month', '2024-01-01', '2024-12-31')
        print(f"获取到 {len(monthly_data)} 条月度数据")
        
        # 获取指标摘要
        summary = service.get_indicators_summary('month')
        print(f"指标摘要: {summary}")
        
        # 获取同比分析
        yoy_analysis = service.get_comparison_analysis('2024-01-01', 'yoy')
        print(f"同比分析: {yoy_analysis}")
        
        # 使用计算器计算指标
        calculator = DiseaseCompositionCalculator()
        
        # 计算出院患者疾病构成：某种疾病出院患者人次/出院患者人次×100%
        disease_composition_rate = calculator.calculate_disease_composition_rate(150, 1000)
        print(f"出院患者疾病构成: {disease_composition_rate}%")
        
        # 计算疾病构成增减率
        growth_rate = calculator.calculate_disease_composition_growth_rate(15.5, 12.3)
        print(f"疾病构成增减率: {growth_rate}%")
        
    except Exception as e:
        print(f"执行失败: {e}")