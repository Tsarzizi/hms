"""
门急诊收入增长率服务
提供门急诊收入增长率相关数据的查询和计算服务
"""

import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import os
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RevenueGrowthRateService:
    """门急诊收入增长率服务类"""
    
    def __init__(self):
        """初始化数据库连接"""
        self.db_config = {
            'host': os.getenv('DB_HOST', 'localhost'),
            'port': int(os.getenv('DB_PORT', 5432)),
            'database': os.getenv('DB_NAME', 'hospital_db'),
            'user': os.getenv('DB_USER', ''),
            'password': os.getenv('DB_PASSWORD', ''),
        }
    
    def get_connection(self):
        """获取数据库连接"""
        try:
            conn = psycopg2.connect(**self.db_config)
            return conn
        except Exception as e:
            logger.error(f"数据库连接失败: {e}")
            raise
    
    def get_revenue_growth_rate_data(self, time_range: str, start_date: str = None, end_date: str = None) -> List[Dict[str, Any]]:
        """
        获取门急诊收入增长率数据
        
        Args:
            time_range: 时间范围 ('day', 'month', 'quarter', 'year')
            start_date: 开始日期
            end_date: 结束日期
            
        Returns:
            List[Dict]: 收入增长率数据列表
        """
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # 根据时间范围确定日期格式
            date_format = self._get_date_format(time_range)
            
            # 构建查询SQL
            query = f"""
            WITH revenue_data AS (
                SELECT 
                    TO_CHAR(date_period, '{date_format}') as period,
                    SUM(
                        CASE 
                            WHEN charge_type_code = '门诊' 
                            THEN drug_cost + material_cost + examination_cost + lab_cost + treatment_cost
                            ELSE 0 
                        END
                    ) as outpatient_medical_cost,
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
                    ) as emergency_revenue
                FROM revenue_growth_rate_data 
                WHERE date_period >= %s AND date_period <= %s
                GROUP BY TO_CHAR(date_period, '{date_format}')
                ORDER BY period
            ),
            growth_calculations AS (
                SELECT 
                    period,
                    outpatient_medical_cost,
                    outpatient_emergency_revenue,
                    outpatient_revenue,
                    emergency_revenue,
                    LAG(outpatient_medical_cost) OVER (ORDER BY period) as prev_outpatient_medical_cost,
                    LAG(outpatient_revenue, 12) OVER (ORDER BY period) as prev_year_outpatient_revenue,
                    LAG(emergency_revenue, 12) OVER (ORDER BY period) as prev_year_emergency_revenue
                FROM revenue_data
            )
            SELECT 
                period,
                CASE 
                    WHEN prev_outpatient_medical_cost > 0 
                    THEN ((outpatient_medical_cost - prev_outpatient_medical_cost) / prev_outpatient_medical_cost) * 100
                    ELSE 0 
                END as outpatient_medical_cost_growth_rate,
                CASE 
                    WHEN prev_year_outpatient_revenue > 0 AND prev_year_emergency_revenue > 0
                    THEN (
                        ((outpatient_revenue - prev_year_outpatient_revenue) / prev_year_outpatient_revenue) * 100 +
                        ((emergency_revenue - prev_year_emergency_revenue) / prev_year_emergency_revenue) * 100
                    ) / 2
                    ELSE 0 
                END as outpatient_emergency_revenue_yoy_growth_rate
            FROM growth_calculations
            WHERE prev_outpatient_medical_cost IS NOT NULL
            ORDER BY period
            """
            
            # 设置查询参数
            params = self._get_query_params(start_date, end_date)
            cursor.execute(query, params)
            
            results = cursor.fetchall()
            
            # 转换结果格式
            data = []
            for row in results:
                data.append({
                    'date': row['period'],
                    'data': {
                        'outpatientMedicalCostGrowthRate': float(row['outpatient_medical_cost_growth_rate'] or 0),
                        'outpatientEmergencyRevenueYoyGrowthRate': float(row['outpatient_emergency_revenue_yoy_growth_rate'] or 0)
                    }
                })
            
            cursor.close()
            conn.close()
            
            return data
            
        except Exception as e:
            logger.error(f"获取收入增长率数据失败: {e}")
            return []
    
    def get_indicators_summary(self, time_range: str) -> Dict[str, float]:
        """
        获取收入增长率指标摘要
        
        Args:
            time_range: 时间范围
            
        Returns:
            Dict: 指标摘要数据
        """
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            query = """
            SELECT 
                AVG(outpatient_medical_cost_growth_rate) as avg_outpatient_medical_cost_growth_rate,
                AVG(outpatient_emergency_revenue_yoy_growth_rate) as avg_outpatient_emergency_revenue_yoy_growth_rate
            FROM revenue_growth_rate_summary 
            WHERE time_range = %s
            """
            
            cursor.execute(query, (time_range,))
            result = cursor.fetchone()
            
            cursor.close()
            conn.close()
            
            if result:
                return {
                    'outpatientMedicalCostGrowthRate': float(result['avg_outpatient_medical_cost_growth_rate'] or 0),
                    'outpatientEmergencyRevenueYoyGrowthRate': float(result['avg_outpatient_emergency_revenue_yoy_growth_rate'] or 0)
                }
            else:
                return {
                    'outpatientMedicalCostGrowthRate': 0.0,
                    'outpatientEmergencyRevenueYoyGrowthRate': 0.0
                }
                
        except Exception as e:
            logger.error(f"获取指标摘要失败: {e}")
            return {
                'outpatientMedicalCostGrowthRate': 0.0,
                'outpatientEmergencyRevenueYoyGrowthRate': 0.0
            }
    
    def get_comparison_analysis(self, indicator: str, current_period: str, comparison_type: str = 'yoy') -> Dict[str, Any]:
        """
        获取同比环比分析数据
        
        Args:
            indicator: 指标名称
            current_period: 当前期间
            comparison_type: 比较类型 ('yoy' 同比, 'mom' 环比)
            
        Returns:
            Dict: 比较分析数据
        """
        try:
            conn = self.get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            if comparison_type == 'yoy':
                # 同比分析
                query = f"""
                SELECT 
                    current_data.{indicator} as current_value,
                    previous_data.{indicator} as previous_value
                FROM revenue_growth_rate_data current_data
                LEFT JOIN revenue_growth_rate_data previous_data 
                    ON DATE_PART('month', current_data.date_period) = DATE_PART('month', previous_data.date_period)
                    AND DATE_PART('day', current_data.date_period) = DATE_PART('day', previous_data.date_period)
                    AND DATE_PART('year', previous_data.date_period) = DATE_PART('year', current_data.date_period) - 1
                WHERE current_data.date_period = %s
                """
            else:
                # 环比分析
                query = f"""
                SELECT 
                    current_data.{indicator} as current_value,
                    previous_data.{indicator} as previous_value
                FROM revenue_growth_rate_data current_data
                LEFT JOIN revenue_growth_rate_data previous_data 
                    ON previous_data.date_period = current_data.date_period - INTERVAL '1 month'
                WHERE current_data.date_period = %s
                """
            
            cursor.execute(query, (current_period,))
            result = cursor.fetchone()
            
            cursor.close()
            conn.close()
            
            if result and result['current_value'] is not None and result['previous_value'] is not None:
                current_value = float(result['current_value'])
                previous_value = float(result['previous_value'])
                
                # 计算变化率
                if previous_value != 0:
                    change_rate = ((current_value - previous_value) / abs(previous_value)) * 100
                else:
                    change_rate = 0
                
                # 判断趋势
                if change_rate > 2:
                    trend = 'up'
                elif change_rate < -2:
                    trend = 'down'
                else:
                    trend = 'stable'
                
                return {
                    'currentValue': current_value,
                    'previousValue': previous_value,
                    'growthRate': change_rate,
                    'trend': trend
                }
            else:
                return {
                    'currentValue': 0,
                    'previousValue': 0,
                    'growthRate': 0,
                    'trend': 'stable'
                }
                
        except Exception as e:
            logger.error(f"获取比较分析数据失败: {e}")
            return {
                'currentValue': 0,
                'previousValue': 0,
                'growthRate': 0,
                'trend': 'stable'
            }
    
    def calculate_outpatient_medical_cost_growth_rate(self, current_cost: float, previous_cost: float) -> float:
        """
        计算门诊患者医药费用增长率
        
        Args:
            current_cost: 报告期门诊患者医药费用
            previous_cost: 上期门诊患者医药费用
            
        Returns:
            float: 门诊患者医药费用增长率(%)
        """
        if previous_cost == 0:
            return 0.0
        return ((current_cost - previous_cost) / previous_cost) * 100
    
    def calculate_outpatient_revenue_yoy_growth_rate(self, current_revenue: float, previous_year_revenue: float) -> float:
        """
        计算门诊收入同比增长率
        
        Args:
            current_revenue: 本期门诊收入
            previous_year_revenue: 去年同期门诊收入
            
        Returns:
            float: 门诊收入同比增长率(%)
        """
        if previous_year_revenue == 0:
            return 0.0
        return ((current_revenue - previous_year_revenue) / previous_year_revenue) * 100
    
    def calculate_emergency_revenue_yoy_growth_rate(self, current_revenue: float, previous_year_revenue: float) -> float:
        """
        计算急诊收入同比增长率
        
        Args:
            current_revenue: 本期急诊收入
            previous_year_revenue: 去年同期急诊收入
            
        Returns:
            float: 急诊收入同比增长率(%)
        """
        if previous_year_revenue == 0:
            return 0.0
        return ((current_revenue - previous_year_revenue) / previous_year_revenue) * 100
    
    def _get_date_format(self, time_range: str) -> str:
        """根据时间范围获取日期格式"""
        formats = {
            'day': 'YYYY-MM-DD',
            'month': 'YYYY-MM',
            'quarter': 'YYYY-Q',
            'year': 'YYYY'
        }
        return formats.get(time_range, 'YYYY-MM-DD')
    
    def _get_query_params(self, start_date: str = None, end_date: str = None) -> tuple:
        """获取查询参数"""
        if not start_date:
            start_date = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')
        if not end_date:
            end_date = datetime.now().strftime('%Y-%m-%d')
        
        return (start_date, end_date)

# 数据库表结构SQL
"""
-- 收入增长率数据表
CREATE TABLE IF NOT EXISTS revenue_growth_rate_data (
    id BIGSERIAL PRIMARY KEY,
    date_period DATE NOT NULL,
    charge_type_code VARCHAR(20) NOT NULL COMMENT '挂号类别代码(门诊/急诊)',
    total_cost DECIMAL(15,2) DEFAULT 0 COMMENT '总费用',
    drug_cost DECIMAL(15,2) DEFAULT 0 COMMENT '药品费用',
    material_cost DECIMAL(15,2) DEFAULT 0 COMMENT '材料费用',
    examination_cost DECIMAL(15,2) DEFAULT 0 COMMENT '检查费用',
    lab_cost DECIMAL(15,2) DEFAULT 0 COMMENT '化验费用',
    treatment_cost DECIMAL(15,2) DEFAULT 0 COMMENT '治疗费用',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_revenue_growth_rate_date_period ON revenue_growth_rate_data(date_period);
CREATE INDEX IF NOT EXISTS idx_revenue_growth_rate_charge_type ON revenue_growth_rate_data(charge_type_code);

-- 收入增长率汇总表
CREATE TABLE IF NOT EXISTS revenue_growth_rate_summary (
    id BIGSERIAL PRIMARY KEY,
    time_range VARCHAR(20) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    outpatient_medical_cost_growth_rate DECIMAL(10,2) DEFAULT 0,
    outpatient_emergency_revenue_yoy_growth_rate DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_revenue_growth_rate_summary_time_range ON revenue_growth_rate_summary(time_range);
CREATE INDEX IF NOT EXISTS idx_revenue_growth_rate_summary_period ON revenue_growth_rate_summary(period_start, period_end);

-- 添加表注释
COMMENT ON TABLE revenue_growth_rate_data IS '门急诊收入增长率基础数据表';
COMMENT ON TABLE revenue_growth_rate_summary IS '门急诊收入增长率汇总数据表';

-- 添加字段注释
COMMENT ON COLUMN revenue_growth_rate_data.date_period IS '数据日期';
COMMENT ON COLUMN revenue_growth_rate_data.charge_type_code IS '挂号类别代码(门诊/急诊)';
COMMENT ON COLUMN revenue_growth_rate_data.total_cost IS '总费用';
COMMENT ON COLUMN revenue_growth_rate_data.drug_cost IS '药品费用';
COMMENT ON COLUMN revenue_growth_rate_data.material_cost IS '材料费用';
COMMENT ON COLUMN revenue_growth_rate_data.examination_cost IS '检查费用';
COMMENT ON COLUMN revenue_growth_rate_data.lab_cost IS '化验费用';
COMMENT ON COLUMN revenue_growth_rate_data.treatment_cost IS '治疗费用';

COMMENT ON COLUMN revenue_growth_rate_summary.time_range IS '时间范围(day/month/quarter/year)';
COMMENT ON COLUMN revenue_growth_rate_summary.period_start IS '统计期间开始日期';
COMMENT ON COLUMN revenue_growth_rate_summary.period_end IS '统计期间结束日期';
COMMENT ON COLUMN revenue_growth_rate_summary.outpatient_medical_cost_growth_rate IS '门诊患者医药费用增长率(%)';
COMMENT ON COLUMN revenue_growth_rate_summary.outpatient_emergency_revenue_yoy_growth_rate IS '门急诊收入同比增长率(%)';
"""

# 使用示例
if __name__ == "__main__":
    service = RevenueGrowthRateService()
    
    # 获取月度收入增长率数据
    data = service.get_revenue_growth_rate_data('month')
    print("收入增长率数据:", data)
    
    # 获取指标摘要
    summary = service.get_indicators_summary('month')
    print("指标摘要:", summary)
    
    # 获取同比分析
    comparison = service.get_comparison_analysis('outpatient_medical_cost_growth_rate', '2024-01-01', 'yoy')
    print("同比分析:", comparison)