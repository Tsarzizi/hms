"""
处方管理数据处理模块
提供处方管理相关指标的数据查询和计算功能
支持PostgreSQL数据库
"""
import logging
import sys
from dataclasses import dataclass
from datetime import datetime
from typing import List, Dict, Optional

from flask import Flask, jsonify, request
from flask_cors import CORS

sys.path.append('../../..')
from backend.app.utils import DatabaseManager

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 创建Flask应用
app = Flask(__name__)
CORS(app)  # 启用跨域支持

@dataclass
class PrescriptionData:
    """处方管理数据模型"""
    total_prescriptions: int = 0  # 开具处方数
    restricted_antibiotic_prescriptions: int = 0  # 开具限制和特殊抗菌药物处方数
    anesthetic_psychotropic_prescriptions: int = 0  # 开具麻醉药品和第一类精神药品处方数
    pharmacist_reviewed_prescriptions: int = 0  # 药师审核处方数
    pharmacist_adjusted_prescriptions: int = 0  # 药师调剂处方数

@dataclass
class PrescriptionResponse:
    """处方管理响应数据模型"""
    date: str
    data: PrescriptionData

@dataclass
class ComparisonData:
    """同比环比数据模型"""
    current_value: float
    comparison_value: float
    change_rate: float
    change_type: str



# 全局数据库管理器
db_manager = DatabaseManager()

class PrescriptionManagementService:
    """处方管理服务类"""

    def __init__(self, db_connection=None):
        """
        初始化服务
        :param db_connection: PostgreSQL数据库连接对象
        """
        self.db_connection = db_connection

    def get_prescription_data(
        self,
        time_range: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        year: Optional[str] = None
    ) -> List[PrescriptionResponse]:
        """
        获取处方管理数据

        :param time_range: 时间范围 ('day', 'month', 'quarter', 'year')
        :param start_date: 开始日期 (YYYY-MM-DD)
        :param end_date: 结束日期 (YYYY-MM-DD)
        :param year: 年份
        :return: 处方管理数据列表
        """
        try:
            logger.info(f"查询处方管理数据 - 时间范围: {time_range}, 开始日期: {start_date}, 结束日期: {end_date}, 年份: {year}")

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
                data = PrescriptionData(
                    total_prescriptions=row[1] or 0,
                    restricted_antibiotic_prescriptions=row[2] or 0,
                    anesthetic_psychotropic_prescriptions=row[3] or 0,
                    pharmacist_reviewed_prescriptions=row[4] or 0,
                    pharmacist_adjusted_prescriptions=row[5] or 0
                )

                response = PrescriptionResponse(
                    date=str(row[0]),
                    data=data
                )
                data_list.append(response)

            cursor.close()
            logger.info(f"成功获取 {len(data_list)} 条数据")
            return data_list

        except Exception as e:
            logger.error(f"获取处方管理数据失败: {str(e)}")
            return []

    def get_indicators_summary(self, time_range: str) -> PrescriptionData:
        """
        获取指标统计摘要

        :param time_range: 时间范围
        :return: 指标摘要数据
        """
        try:
            logger.info(f"获取指标摘要 - 时间范围: {time_range}")

            if not self.db_connection:
                logger.error("数据库连接未配置")
                return PrescriptionData()

            # 构建摘要查询SQL
            summary_query = """
            SELECT 
                SUM(total_prescriptions) as total_prescriptions,
                SUM(restricted_antibiotic_prescriptions) as restricted_antibiotic_prescriptions,
                SUM(anesthetic_psychotropic_prescriptions) as anesthetic_psychotropic_prescriptions,
                SUM(pharmacist_reviewed_prescriptions) as pharmacist_reviewed_prescriptions,
                SUM(pharmacist_adjusted_prescriptions) as pharmacist_adjusted_prescriptions
            FROM prescription_management_summary 
            WHERE time_range = %s
            """

            cursor = self.db_connection.cursor()
            cursor.execute(summary_query, (time_range,))
            result = cursor.fetchone()
            cursor.close()

            if result and result[0] is not None:
                return PrescriptionData(
                    total_prescriptions=result[0] or 0,
                    restricted_antibiotic_prescriptions=result[1] or 0,
                    anesthetic_psychotropic_prescriptions=result[2] or 0,
                    pharmacist_reviewed_prescriptions=result[3] or 0,
                    pharmacist_adjusted_prescriptions=result[4] or 0
                )
            else:
                return PrescriptionData()

        except Exception as e:
            logger.error(f"获取指标摘要失败: {str(e)}")
            return PrescriptionData()

    def get_comparison_data(
        self,
        period_date: str,
        comparison_type: str = 'yoy'
    ) -> Dict[str, ComparisonData]:
        """
        获取同比环比分析数据

        :param period_date: 统计期间
        :param comparison_type: 比较类型 ('yoy', 'mom')
        :return: 比较分析数据字典
        """
        try:
            logger.info(f"获取比较分析数据 - 日期: {period_date}, 类型: {comparison_type}")

            if not self.db_connection:
                logger.error("数据库连接未配置")
                return {}

            # 构建比较查询SQL
            comparison_query = """
            SELECT 
                indicator_key,
                current_value,
                comparison_value,
                change_rate,
                change_type
            FROM prescription_comparison 
            WHERE period_date = %s AND comparison_type = %s
            """

            cursor = self.db_connection.cursor()
            cursor.execute(comparison_query, (period_date, comparison_type))
            results = cursor.fetchall()
            cursor.close()

            comparison_data = {}
            for row in results:
                comparison_data[row[0]] = ComparisonData(
                    current_value=float(row[1]),
                    comparison_value=float(row[2]),
                    change_rate=float(row[3]),
                    change_type=row[4]
                )

            return comparison_data

        except Exception as e:
            logger.error(f"获取比较分析数据失败: {str(e)}")
            return {}

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
            SUM(total_prescriptions) as total_prescriptions,
            SUM(restricted_antibiotic_prescriptions) as restricted_antibiotic_prescriptions,
            SUM(anesthetic_psychotropic_prescriptions) as anesthetic_psychotropic_prescriptions,
            SUM(pharmacist_reviewed_prescriptions) as pharmacist_reviewed_prescriptions,
            SUM(pharmacist_adjusted_prescriptions) as pharmacist_adjusted_prescriptions
        FROM prescription_management_data 
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

class PrescriptionCalculator:
    """处方管理指标计算器"""

    @staticmethod
    def calculate_prescription_review_rate(
        reviewed_prescriptions: int,
        total_prescriptions: int
    ) -> float:
        """
        计算处方审核率

        :param reviewed_prescriptions: 审核处方数
        :param total_prescriptions: 总处方数
        :return: 处方审核率(%)
        """
        if total_prescriptions == 0:
            return 0.0
        return (reviewed_prescriptions / total_prescriptions) * 100

    @staticmethod
    def calculate_restricted_antibiotic_rate(
        restricted_prescriptions: int,
        total_prescriptions: int
    ) -> float:
        """
        计算限制抗菌药物处方比例

        :param restricted_prescriptions: 限制抗菌药物处方数
        :param total_prescriptions: 总处方数
        :return: 限制抗菌药物处方比例(%)
        """
        if total_prescriptions == 0:
            return 0.0
        return (restricted_prescriptions / total_prescriptions) * 100

    @staticmethod
    def calculate_controlled_substance_rate(
        controlled_prescriptions: int,
        total_prescriptions: int
    ) -> float:
        """
        计算管制药品处方比例

        :param controlled_prescriptions: 管制药品处方数
        :param total_prescriptions: 总处方数
        :return: 管制药品处方比例(%)
        """
        if total_prescriptions == 0:
            return 0.0
        return (controlled_prescriptions / total_prescriptions) * 100

    @staticmethod
    def analyze_prescription_trend(data_list: List[PrescriptionData]) -> Dict[str, str]:
        """
        分析处方管理趋势

        :param data_list: 处方数据列表
        :return: 趋势分析结果
        """
        if len(data_list) < 2:
            return {
                'total_prescriptions_trend': 'stable',
                'restricted_antibiotic_trend': 'stable',
                'controlled_substance_trend': 'stable',
                'review_trend': 'stable',
                'adjustment_trend': 'stable'
            }

        # 计算各指标趋势
        trends = {}

        # 总处方数趋势
        total_values = [data.total_prescriptions for data in data_list]
        trends['total_prescriptions_trend'] = PrescriptionCalculator._calculate_trend(total_values)

        # 限制抗菌药物处方趋势
        restricted_values = [data.restricted_antibiotic_prescriptions for data in data_list]
        trends['restricted_antibiotic_trend'] = PrescriptionCalculator._calculate_trend(restricted_values)

        # 管制药品处方趋势
        controlled_values = [data.anesthetic_psychotropic_prescriptions for data in data_list]
        trends['controlled_substance_trend'] = PrescriptionCalculator._calculate_trend(controlled_values)

        # 审核处方趋势
        review_values = [data.pharmacist_reviewed_prescriptions for data in data_list]
        trends['review_trend'] = PrescriptionCalculator._calculate_trend(review_values)

        # 调剂处方趋势
        adjustment_values = [data.pharmacist_adjusted_prescriptions for data in data_list]
        trends['adjustment_trend'] = PrescriptionCalculator._calculate_trend(adjustment_values)

        return trends

    @staticmethod
    def _calculate_trend(values: List[int]) -> str:
        """
        计算数值趋势

        :param values: 数值列表
        :return: 趋势类型
        """
        if len(values) < 2:
            return 'stable'

        if values[-1] > values[0] * 1.05:
            return 'increasing'
        elif values[-1] < values[0] * 0.95:
            return 'decreasing'
        else:
            return 'stable'

# API路由
@app.route('/api/prescription-management', methods=['GET'])
def get_prescription_management_data():
    """获取处方管理数据API接口"""
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

        service = PrescriptionManagementService(conn)

        try:
            # 传递所有参数
            data = service.get_prescription_data(time_range, start_date, end_date, year)

            # 转换为前端需要的格式
            result = []
            for item in data:
                result.append({
                    'date': item.date,
                    'data': {
                        'totalPrescriptions': item.data.total_prescriptions,
                        'restrictedAntibioticPrescriptions': item.data.restricted_antibiotic_prescriptions,
                        'anestheticPsychotropicPrescriptions': item.data.anesthetic_psychotropic_prescriptions,
                        'pharmacistReviewedPrescriptions': item.data.pharmacist_reviewed_prescriptions,
                        'pharmacistAdjustedPrescriptions': item.data.pharmacist_adjusted_prescriptions
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

@app.route('/api/prescription-management/summary', methods=['GET'])
def get_prescription_summary():
    """获取处方管理摘要数据API接口"""
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

        service = PrescriptionManagementService(conn)

        try:
            summary = service.get_indicators_summary(time_range)

            return jsonify({
                'success': True,
                'data': {
                    'totalPrescriptions': summary.total_prescriptions,
                    'restrictedAntibioticPrescriptions': summary.restricted_antibiotic_prescriptions,
                    'anestheticPsychotropicPrescriptions': summary.anesthetic_psychotropic_prescriptions,
                    'pharmacistReviewedPrescriptions': summary.pharmacist_reviewed_prescriptions,
                    'pharmacistAdjustedPrescriptions': summary.pharmacist_adjusted_prescriptions
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

@app.route('/api/prescription-management/comparison', methods=['GET'])
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

        service = PrescriptionManagementService(conn)

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

@app.route('/api/prescription-management/years', methods=['GET'])
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
            FROM prescription_management_data 
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

@app.route('/api/prescription-management/calculate-rates', methods=['POST'])
def calculate_prescription_rates():
    """计算处方相关比率API接口"""
    try:
        data = request.get_json()
        total_prescriptions = data.get('totalPrescriptions', 0)
        reviewed_prescriptions = data.get('reviewedPrescriptions', 0)
        restricted_prescriptions = data.get('restrictedPrescriptions', 0)
        controlled_prescriptions = data.get('controlledPrescriptions', 0)

        calculator = PrescriptionCalculator()

        review_rate = calculator.calculate_prescription_review_rate(
            reviewed_prescriptions, total_prescriptions
        )
        restricted_rate = calculator.calculate_restricted_antibiotic_rate(
            restricted_prescriptions, total_prescriptions
        )
        controlled_rate = calculator.calculate_controlled_substance_rate(
            controlled_prescriptions, total_prescriptions
        )

        return jsonify({
            'success': True,
            'data': {
                'prescriptionReviewRate': round(review_rate, 2),
                'restrictedAntibioticRate': round(restricted_rate, 2),
                'controlledSubstanceRate': round(controlled_rate, 2)
            },
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        logger.error(f"计算处方比率失败: {str(e)}")
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

    # 启动Flask使应用，用端口5001
    app.run(host='0.0.0.0', port=5003, debug=True)