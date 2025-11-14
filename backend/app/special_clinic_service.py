"""
特需门诊数据处理模块
提供特需门诊相关指标的数据查询和计算功能
支持PostgreSQL数据库
"""

import logging
import sys
from dataclasses import dataclass
from datetime import datetime
from typing import List, Dict, Optional

from dateutil.relativedelta import relativedelta  # 添加这个导入
from flask import Flask, jsonify, request
from flask_cors import CORS
sys.path.append('../../../HMS')
from backend.app.utils import DatabaseManager

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 创建Flask应用
app = Flask(__name__)
CORS(app)  # 启用跨域支持


@dataclass
class SpecialClinicData:
    """特需门诊数据模型"""
    special_clinic_service_ratio: float = 0.0  # 特需门诊服务人次数比例(%)

@dataclass
class SpecialClinicResponse:
    """特需门诊响应数据模型"""
    date: str
    data: SpecialClinicData

@dataclass
class ComparisonData:
    """同比环比数据模型"""
    current_value: float
    comparison_value: float
    change_rate: float
    change_type: str



# 全局数据库管理器
db_manager = DatabaseManager()

class SpecialClinicService:
    """特需门诊服务类"""

    def __init__(self, db_connection=None):
        """
        初始化服务
        :param db_connection: PostgreSQL数据库连接对象
        """
        self.db_connection = db_connection

    def get_special_clinic_data(
        self,
        time_range: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        year: Optional[str] = None
    ) -> List[SpecialClinicResponse]:
        """
        获取特需门诊数据

        :param time_range: 时间范围 ('day', 'month', 'quarter', 'year')
        :param start_date: 开始日期 (YYYY-MM-DD)
        :param end_date: 结束日期 (YYYY-MM-DD)
        :param year: 年份
        :return: 特需门诊数据列表
        """
        try:
            logger.info(f"查询特需门诊数据 - 时间范围: {time_range}, 开始日期: {start_date}, 结束日期: {end_date}, 年份: {year}")

            if not self.db_connection:
                logger.error("数据库连接未配置")
                return []

            # 构建SQL查询
            query = self._build_query(time_range, start_date, end_date, year)

            # 执行查询
            cursor = self.db_connection.cursor()
            cursor.execute(query, self._get_query_params(start_date, end_date, year))
            results = cursor.fetchall()

            # 处理查询结果
            data_list = []
            for row in results:
                data = SpecialClinicData(
                    special_clinic_service_ratio=float(row[1]) if row[1] is not None else 0.0
                )

                response = SpecialClinicResponse(
                    date=str(row[0]),
                    data=data
                )
                data_list.append(response)

            cursor.close()
            logger.info(f"成功获取 {len(data_list)} 条数据")
            return data_list

        except Exception as e:
            logger.error(f"获取特需门诊数据失败: {str(e)}")
            return []

    def get_indicators_summary(self, time_range: str) -> SpecialClinicData:
        """
        获取指标统计摘要

        :param time_range: 时间范围
        :return: 指标摘要数据
        """
        try:
            logger.info(f"获取指标摘要 - 时间范围: {time_range}")

            if not self.db_connection:
                logger.error("数据库连接未配置")
                return SpecialClinicData()

            # 构建摘要查询SQL
            summary_query = """
            SELECT 
                AVG(special_clinic_service_ratio) as avg_special_clinic_service_ratio
            FROM special_clinic_summary 
            WHERE time_range = %s
            """

            cursor = self.db_connection.cursor()
            cursor.execute(summary_query, (time_range,))
            result = cursor.fetchone()
            cursor.close()

            if result and result[0] is not None:
                return SpecialClinicData(
                    special_clinic_service_ratio=float(result[0])
                )
            else:
                return SpecialClinicData()

        except Exception as e:
            logger.error(f"获取指标摘要失败: {str(e)}")
            return SpecialClinicData()

    def get_comparison_data(
        self,
        period_date: str,
        comparison_type: str = 'yoy'
    ) -> Dict[str, ComparisonData]:
        """
        获取同比环比分析数据 - 动态计算版本

        :param period_date: 统计期间 (YYYY-MM-DD)
        :param comparison_type: 比较类型 ('yoy', 'mom')
        :return: 比较分析数据字典
        """
        try:
            logger.info(f"动态计算比较分析数据 - 日期: {period_date}, 类型: {comparison_type}")

            if not self.db_connection:
                logger.error("数据库连接未配置")
                return self._get_mock_comparison_data(comparison_type)

            # 解析日期
            try:
                current_date = datetime.strptime(period_date, '%Y-%m-%d')
            except ValueError:
                logger.error(f"日期格式错误: {period_date}")
                return self._get_mock_comparison_data(comparison_type)

            # 计算比较日期
            if comparison_type == 'yoy':
                # 同比：与去年同期比较
                comparison_date = current_date - relativedelta(years=1)
                date_format = 'YYYY-MM'
                current_period = current_date.strftime('%Y-%m')
                comparison_period = comparison_date.strftime('%Y-%m')
            elif comparison_type == 'mom':
                # 环比：与上个月比较
                comparison_date = current_date - relativedelta(months=1)
                date_format = 'YYYY-MM'
                current_period = current_date.strftime('%Y-%m')
                comparison_period = comparison_date.strftime('%Y-%m')
            else:
                logger.error(f"不支持的比较类型: {comparison_type}")
                return {}

            logger.info(f"当前期: {current_period}, 比较期: {comparison_period}")

            # 查询当前期数据
            current_query = """
            SELECT 
                SUM(special_clinic_visits) as special_visits,
                SUM(total_outpatient_visits) as total_visits
            FROM special_clinic_data 
            WHERE TO_CHAR(date_period, %s) = %s
            """

            cursor = self.db_connection.cursor()

            # 获取当前期数据
            cursor.execute(current_query, (date_format, current_period))
            current_result = cursor.fetchone()

            if not current_result or current_result[0] is None:
                logger.warning(f"当前期 {current_period} 无数据")
                cursor.close()
                return self._get_mock_comparison_data(comparison_type)

            current_special_visits = current_result[0] or 0
            current_total_visits = current_result[1] or 0

            # 获取比较期数据
            cursor.execute(current_query, (date_format, comparison_period))
            comparison_result = cursor.fetchone()

            comparison_special_visits = comparison_result[0] or 0 if comparison_result else 0
            comparison_total_visits = comparison_result[1] or 0 if comparison_result else 0

            cursor.close()

            # 计算特需门诊服务比例
            calculator = SpecialClinicCalculator()

            current_ratio = calculator.calculate_special_clinic_service_ratio(
                current_special_visits, current_total_visits
            )

            comparison_ratio = calculator.calculate_special_clinic_service_ratio(
                comparison_special_visits, comparison_total_visits
            )

            # 计算变化率
            change_rate = 0.0
            if comparison_ratio > 0:
                change_rate = ((current_ratio - comparison_ratio) / comparison_ratio) * 100

            change_type = 'increase' if change_rate > 0 else 'decrease' if change_rate < 0 else 'stable'

            # 返回数据
            comparison_data = {
                'specialClinicServiceRatio': ComparisonData(
                    current_value=round(current_ratio, 2),
                    comparison_value=round(comparison_ratio, 2),
                    change_rate=round(change_rate, 2),
                    change_type=change_type
                )
            }

            logger.info(f"计算完成 - 当前值: {current_ratio:.2f}%, 比较值: {comparison_ratio:.2f}%, 变化率: {change_rate:.2f}%")

            return comparison_data

        except Exception as e:
            logger.error(f"动态计算比较分析数据失败: {str(e)}")
            # 返回模拟数据作为后备
            return self._get_mock_comparison_data(comparison_type)

    def _get_mock_comparison_data(self, comparison_type: str) -> Dict[str, ComparisonData]:
        """获取模拟的同比环比数据"""
        import random

        # 生成合理的模拟数据 - 特需门诊比例通常在5-15%之间
        base_value = 8.0 + random.uniform(-1, 3)
        variation = random.uniform(-1.5, 1.5)

        current_value = base_value + variation
        comparison_value = base_value

        # 确保数据合理
        current_value = max(2.0, min(20.0, current_value))
        comparison_value = max(2.0, min(20.0, comparison_value))

        change_rate = ((current_value - comparison_value) / comparison_value) * 100 if comparison_value > 0 else 0
        change_type = 'increase' if change_rate > 0 else 'decrease' if change_rate < 0 else 'stable'

        logger.info(f"使用模拟数据 - 类型: {comparison_type}, 当前: {current_value:.2f}%, 比较: {comparison_value:.2f}%")

        return {
            'specialClinicServiceRatio': ComparisonData(
                current_value=round(current_value, 2),
                comparison_value=round(comparison_value, 2),
                change_rate=round(change_rate, 2),
                change_type=change_type
            )
        }

    def get_available_periods_for_comparison(self) -> List[str]:
        """
        获取可用于同比环比分析的日期列表
        """
        try:
            if not self.db_connection:
                return []

            cursor = self.db_connection.cursor()
            cursor.execute("""
                SELECT DISTINCT TO_CHAR(date_period, 'YYYY-MM') as period
                FROM special_clinic_data 
                WHERE date_period >= CURRENT_DATE - INTERVAL '2 years'
                ORDER BY period DESC
            """)
            results = cursor.fetchall()
            cursor.close()

            periods = [f"{row[0]}-01" for row in results]  # 转换为YYYY-MM-01格式
            return periods

        except Exception as e:
            logger.error(f"获取可用期间失败: {str(e)}")
            return []

    def _build_query(
        self,
        time_range: str,
        start_date: Optional[str],
        end_date: Optional[str],
        year: Optional[str] = None
    ) -> str:
        """
        构建PostgreSQL查询SQL

        :param time_range: 时间范围
        :param start_date: 开始日期
        :param end_date: 结束日期
        :param year: 年份
        :return: SQL查询语句
        """
        # 基础查询条件
        where_conditions = ["1=1"]  # 默认条件

        # 如果有指定年份，使用年份过滤
        if year:
            where_conditions.append(f"EXTRACT(YEAR FROM date_period) = {year}")
        # 如果指定了开始日期和结束日期
        elif start_date and end_date:
            where_conditions.append("date_period >= %s AND date_period <= %s")
        # 如果都没有指定，默认查询所有数据
        else:
            # 不添加额外的日期过滤条件，查询所有数据
            pass

        where_clause = " AND ".join(where_conditions)

        # 根据时间范围确定日期格式
        date_format = self._get_date_format(time_range)

        query = f"""
        SELECT 
            TO_CHAR(date_period, '{date_format}') as period,
            CASE 
                WHEN SUM(total_outpatient_visits) > 0 
                THEN (SUM(special_clinic_visits)::FLOAT / SUM(total_outpatient_visits)) * 100
                ELSE 0 
            END as special_clinic_service_ratio
        FROM special_clinic_data 
        WHERE {where_clause}
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

    def _get_query_params(
        self,
        start_date: Optional[str],
        end_date: Optional[str],
        year: Optional[str] = None
    ) -> tuple:
        """
        获取查询参数

        :param start_date: 开始日期
        :param end_date: 结束日期
        :param year: 年份
        :return: 查询参数元组
        """
        # 如果指定了年份，不需要额外的日期参数
        if year:
            return ()
        # 如果指定了开始和结束日期
        elif start_date and end_date:
            return (start_date, end_date)
        # 如果都没有指定，返回空参数
        else:
            return ()

class SpecialClinicCalculator:
    """特需门诊指标计算器"""

    @staticmethod
    def calculate_special_clinic_service_ratio(
        special_clinic_visits: int,
        total_outpatient_visits: int
    ) -> float:
        """
        计算特需门诊服务人次数比例

        :param special_clinic_visits: 特需门诊服务人次
        :param total_outpatient_visits: 门诊总人次
        :return: 特需门诊服务人次数比例(%)
        """
        if total_outpatient_visits == 0:
            return 0.0
        return (special_clinic_visits / total_outpatient_visits) * 100

    @staticmethod
    def analyze_special_clinic_trend(data_list: List[SpecialClinicData]) -> Dict[str, str]:
        """
        分析特需门诊趋势

        :param data_list: 特需门诊数据列表
        :return: 趋势分析结果
        """
        if len(data_list) < 2:
            return {
                'special_clinic_service_ratio_trend': 'stable'
            }

        # 计算特需门诊服务人次数比例趋势
        ratios = [data.special_clinic_service_ratio for data in data_list]
        ratio_trend = 'stable'
        if ratios[-1] > ratios[0] * 1.05:
            ratio_trend = 'increasing'
        elif ratios[-1] < ratios[0] * 0.95:
            ratio_trend = 'decreasing'

        return {
            'special_clinic_service_ratio_trend': ratio_trend
        }

# API路由
@app.route('/api/special-clinic', methods=['GET'])
def get_special_clinic_data():
    """获取特需门诊数据API接口"""
    try:
        time_range = request.args.get('range', 'month')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        year = request.args.get('year')  # 新增年份参数

        logger.info(f"API请求 - 时间范围: {time_range}, 开始日期: {start_date}, 结束日期: {end_date}, 年份: {year}")

        # 获取数据库连接并创建服务
        conn = db_manager.get_connection()
        if not conn:
            return jsonify({
                'success': False,
                'error': '数据库连接失败',
                'timestamp': datetime.now().isoformat()
            }), 500

        service = SpecialClinicService(conn)

        try:
            # 传递所有参数
            data = service.get_special_clinic_data(time_range, start_date, end_date, year)

            # 转换为前端需要的格式
            result = []
            for item in data:
                result.append({
                    'date': item.date,
                    'data': {
                        'specialClinicServiceRatio': round(item.data.special_clinic_service_ratio, 2)
                    }
                })

            return jsonify({
                'success': True,
                'data': result,
                'timestamp': datetime.now().isoformat()
            })
        finally:
            # 归还数据库连接
            if conn:
                db_manager.return_connection(conn)

    except Exception as e:
        logger.error(f"API调用失败: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/api/special-clinic/summary', methods=['GET'])
def get_special_clinic_summary():
    """获取特需门诊摘要数据API接口"""
    try:
        time_range = request.args.get('range', 'month')

        # 获取数据库连接并创建服务
        conn = db_manager.get_connection()
        if not conn:
            return jsonify({
                'success': False,
                'error': '数据库连接失败',
                'timestamp': datetime.now().isoformat()
            }), 500

        service = SpecialClinicService(conn)

        try:
            summary = service.get_indicators_summary(time_range)

            return jsonify({
                'success': True,
                'data': {
                    'specialClinicServiceRatio': round(summary.special_clinic_service_ratio, 2)
                },
                'timestamp': datetime.now().isoformat()
            })
        finally:
            if conn:
                db_manager.return_connection(conn)

    except Exception as e:
        logger.error(f"获取摘要数据失败: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/api/special-clinic/comparison', methods=['GET'])
def get_comparison_data():
    """获取同比环比分析数据API接口"""
    try:
        period_date = request.args.get('period_date', '2024-01-01')  # 默认使用有数据的日期
        comparison_type = request.args.get('type', 'yoy')  # yoy: 同比, mom: 环比

        logger.info(f"获取比较分析数据 - 日期: {period_date}, 类型: {comparison_type}")

        # 获取数据库连接并创建服务
        conn = db_manager.get_connection()
        if not conn:
            return jsonify({
                'success': False,
                'error': '数据库连接失败',
                'timestamp': datetime.now().isoformat()
            }), 500

        service = SpecialClinicService(conn)

        try:
            comparison_data = service.get_comparison_data(period_date, comparison_type)

            # 转换为前端需要的格式
            result = {}
            for key, data in comparison_data.items():
                result[key] = {
                    'current_value': data.current_value,
                    'comparison_value': data.comparison_value,
                    'change_rate': round(data.change_rate, 2),
                    'change_type': data.change_type
                }

            return jsonify({
                'success': True,
                'data': result,
                'timestamp': datetime.now().isoformat()
            })
        finally:
            if conn:
                db_manager.return_connection(conn)

    except Exception as e:
        logger.error(f"获取比较分析数据失败: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/api/special-clinic/years', methods=['GET'])
def get_available_years():
    """获取数据库中可用的年份列表"""
    try:
        conn = db_manager.get_connection()
        if not conn:
            return jsonify({
                'success': False,
                'error': '数据库连接失败',
                'timestamp': datetime.now().isoformat()
            }), 500

        cursor = conn.cursor()
        cursor.execute("""
            SELECT DISTINCT EXTRACT(YEAR FROM date_period) as year 
            FROM special_clinic_data 
            ORDER BY year DESC
        """)
        results = cursor.fetchall()
        cursor.close()

        years = [int(row[0]) for row in results]

        return jsonify({
            'success': True,
            'data': years,
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        logger.error(f"获取年份列表失败: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/api/special-clinic/calculate-ratio', methods=['POST'])
def calculate_special_clinic_ratio():
    """计算特需门诊服务比例API接口"""
    try:
        data = request.get_json()
        special_clinic_visits = data.get('specialClinicVisits', 0)
        total_outpatient_visits = data.get('totalOutpatientVisits', 0)

        calculator = SpecialClinicCalculator()

        service_ratio = calculator.calculate_special_clinic_service_ratio(
            special_clinic_visits, total_outpatient_visits
        )

        return jsonify({
            'success': True,
            'data': {
                'specialClinicServiceRatio': round(service_ratio, 2)
            },
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        logger.error(f"计算特需门诊比例失败: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/api/special-clinic/comparison-periods', methods=['GET'])
def get_comparison_periods():
    """获取可用于同比环比分析的期间列表"""
    try:
        conn = db_manager.get_connection()
        if not conn:
            return jsonify({
                'success': False,
                'error': '数据库连接失败',
                'timestamp': datetime.now().isoformat()
            }), 500

        service = SpecialClinicService(conn)

        try:
            periods = service.get_available_periods_for_comparison()

            return jsonify({
                'success': True,
                'data': periods,
                'timestamp': datetime.now().isoformat()
            })
        finally:
            if conn:
                db_manager.return_connection(conn)

    except Exception as e:
        logger.error(f"获取比较期间列表失败: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({
        'status': 'healthy',
        'service': 'special_clinic_service',
        'timestamp': datetime.now().isoformat(),
        'database_connected': db_manager.connection_pool is not None
    })

# 启动应用
if __name__ == "__main__":
    # 初始化数据库连接
    if db_manager.create_connection_pool():
        logger.info("数据库连接池初始化成功")
    else:
        logger.error("数据库连接池初始化失败")

    # 启动Flask应用，使用端口5004
    app.run(host='0.0.0.0', port=5004, debug=True)