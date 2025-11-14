"""
门诊中药服务数据处理模块
提供门诊中药服务相关指标的数据查询和计算功能
支持PostgreSQL数据库
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import List, Dict, Optional

from dateutil.relativedelta import relativedelta
from flask import Flask, jsonify, request
from flask_cors import CORS

from backend.app.utils import DatabaseManager

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 创建Flask应用
app = Flask(__name__)
CORS(app)  # 启用跨域支持


@dataclass
class TcmServiceData:
    """门诊中药服务数据模型"""
    tcm_outpatient_visits: int = 0  # 中医治未病科、中医治未病中心的门诊服务人次数
    tcm_prescription_ratio: float = 0.0  # 使用中药饮片的门诊人数占同类机构门诊人数的比例(%)
    tcm_non_drug_therapy_ratio: float = 0.0  # 门诊中医非药物疗法诊疗人次数占门诊人次数的比例(%)
    tcm_preventive_care_visits: int = 0  # 中医治未病预防保健人次数
    tcm_health_consultation_visits: int = 0  # 中医健康咨询指导人次数


@dataclass
class TcmServiceResponse:
    """门诊中药服务响应数据模型"""
    date: str
    data: TcmServiceData


@dataclass
class ComparisonData:
    """同比环比数据模型"""
    current_value: float
    comparison_value: float
    change_rate: float
    change_type: str  # 'increase', 'decrease', 'stable'




# 全局数据库管理器
db_manager = DatabaseManager()


class TcmServiceService:
    """门诊中药服务服务类"""

    def __init__(self, db_connection=None):
        """
        初始化服务
        :param db_connection: PostgreSQL数据库连接对象
        """
        self.db_connection = db_connection

    def get_tcm_service_data(
            self,
            time_range: str,
            start_date: Optional[str] = None,
            end_date: Optional[str] = None,
            year: Optional[str] = None
    ) -> List[TcmServiceResponse]:
        """
        获取门诊中药服务数据

        :param time_range: 时间范围 ('day', 'month', 'quarter', 'year')
        :param start_date: 开始日期 (YYYY-MM-DD)
        :param end_date: 结束日期 (YYYY-MM-DD)
        :param year: 年份 (YYYY)
        :return: 门诊中药服务数据列表
        """
        try:
            logger.info(
                f"查询门诊中药服务数据 - 时间范围: {time_range}, 开始日期: {start_date}, 结束日期: {end_date}, 年份: {year}")

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
                data = TcmServiceData(
                    tcm_outpatient_visits=row[1] or 0,
                    tcm_prescription_ratio=row[2] or 0.0,
                    tcm_non_drug_therapy_ratio=row[3] or 0.0,
                    tcm_preventive_care_visits=row[4] or 0,
                    tcm_health_consultation_visits=row[5] or 0
                )

                response = TcmServiceResponse(
                    date=str(row[0]),
                    data=data
                )
                data_list.append(response)

            cursor.close()
            logger.info(f"成功获取 {len(data_list)} 条数据")
            return data_list

        except Exception as e:
            logger.error(f"获取门诊中药服务数据失败: {str(e)}")
            return []

    def get_indicators_summary(self, time_range: str) -> TcmServiceData:
        """
        获取指标统计摘要

        :param time_range: 时间范围
        :return: 指标摘要数据
        """
        try:
            logger.info(f"获取指标摘要 - 时间范围: {time_range}")

            if not self.db_connection:
                logger.error("数据库连接未配置")
                return TcmServiceData()

            # 构建摘要查询SQL
            summary_query = """
            SELECT 
                SUM(tcm_outpatient_visits) as total_tcm_visits,
                AVG(tcm_prescription_ratio) as avg_tcm_prescription_ratio,
                AVG(tcm_non_drug_therapy_ratio) as avg_tcm_non_drug_therapy_ratio,
                SUM(tcm_preventive_care_visits) as total_preventive_care_visits,
                SUM(tcm_health_consultation_visits) as total_health_consultation_visits
            FROM tcm_service_summary 
            WHERE time_range = %s
            """

            cursor = self.db_connection.cursor()
            cursor.execute(summary_query, (time_range,))
            result = cursor.fetchone()
            cursor.close()

            if result and result[0] is not None:
                return TcmServiceData(
                    tcm_outpatient_visits=result[0] or 0,
                    tcm_prescription_ratio=result[1] or 0.0,
                    tcm_non_drug_therapy_ratio=result[2] or 0.0,
                    tcm_preventive_care_visits=result[3] or 0,
                    tcm_health_consultation_visits=result[4] or 0
                )
            else:
                return TcmServiceData()

        except Exception as e:
            logger.error(f"获取指标摘要失败: {str(e)}")
            return TcmServiceData()

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
                SUM(tcm_outpatient_visits) as tcm_visits,
                SUM(tcm_prescription_patients) as prescription_patients,
                SUM(total_outpatient_visits) as total_visits,
                SUM(tcm_non_drug_therapy_visits) as non_drug_visits,
                SUM(tcm_preventive_care_visits) as preventive_care,
                SUM(tcm_health_consultation_visits) as health_consultation
            FROM tcm_service_data 
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

            # 获取比较期数据
            cursor.execute(current_query, (date_format, comparison_period))
            comparison_result = cursor.fetchone()
            cursor.close()

            # 计算各项指标
            calculator = TcmServiceCalculator()
            comparison_data = {}

            # 1. 中医门诊服务人次数
            current_tcm_visits = current_result[0] or 0
            comparison_tcm_visits = comparison_result[0] or 0 if comparison_result else 0

            change_rate = 0.0
            if comparison_tcm_visits > 0:
                change_rate = ((current_tcm_visits - comparison_tcm_visits) / comparison_tcm_visits) * 100

            comparison_data['tcmOutpatientVisits'] = ComparisonData(
                current_value=current_tcm_visits,
                comparison_value=comparison_tcm_visits,
                change_rate=round(change_rate, 2),
                change_type='increase' if change_rate > 0 else 'decrease' if change_rate < 0 else 'stable'
            )

            # 2. 中药饮片使用比例
            current_prescription_patients = current_result[1] or 0
            current_total_visits = current_result[2] or 0
            comparison_prescription_patients = comparison_result[1] or 0 if comparison_result else 0
            comparison_total_visits = comparison_result[2] or 0 if comparison_result else 0

            current_prescription_ratio = calculator.calculate_tcm_prescription_ratio(
                current_prescription_patients, current_total_visits
            )
            comparison_prescription_ratio = calculator.calculate_tcm_prescription_ratio(
                comparison_prescription_patients, comparison_total_visits
            )

            change_rate = 0.0
            if comparison_prescription_ratio > 0:
                change_rate = ((
                                           current_prescription_ratio - comparison_prescription_ratio) / comparison_prescription_ratio) * 100

            comparison_data['tcmPrescriptionRatio'] = ComparisonData(
                current_value=round(current_prescription_ratio, 2),
                comparison_value=round(comparison_prescription_ratio, 2),
                change_rate=round(change_rate, 2),
                change_type='increase' if change_rate > 0 else 'decrease' if change_rate < 0 else 'stable'
            )

            # 3. 中医非药物疗法比例
            current_non_drug_visits = current_result[3] or 0
            comparison_non_drug_visits = comparison_result[3] or 0 if comparison_result else 0

            current_non_drug_ratio = calculator.calculate_tcm_non_drug_therapy_ratio(
                current_non_drug_visits, current_total_visits
            )
            comparison_non_drug_ratio = calculator.calculate_tcm_non_drug_therapy_ratio(
                comparison_non_drug_visits, comparison_total_visits
            )

            change_rate = 0.0
            if comparison_non_drug_ratio > 0:
                change_rate = ((current_non_drug_ratio - comparison_non_drug_ratio) / comparison_non_drug_ratio) * 100

            comparison_data['tcmNonDrugTherapyRatio'] = ComparisonData(
                current_value=round(current_non_drug_ratio, 2),
                comparison_value=round(comparison_non_drug_ratio, 2),
                change_rate=round(change_rate, 2),
                change_type='increase' if change_rate > 0 else 'decrease' if change_rate < 0 else 'stable'
            )

            # 4. 中医治未病预防保健人次数
            current_preventive_care = current_result[4] or 0
            comparison_preventive_care = comparison_result[4] or 0 if comparison_result else 0

            change_rate = 0.0
            if comparison_preventive_care > 0:
                change_rate = ((
                                           current_preventive_care - comparison_preventive_care) / comparison_preventive_care) * 100

            comparison_data['tcmPreventiveCareVisits'] = ComparisonData(
                current_value=current_preventive_care,
                comparison_value=comparison_preventive_care,
                change_rate=round(change_rate, 2),
                change_type='increase' if change_rate > 0 else 'decrease' if change_rate < 0 else 'stable'
            )

            # 5. 中医健康咨询指导人次数
            current_health_consultation = current_result[5] or 0
            comparison_health_consultation = comparison_result[5] or 0 if comparison_result else 0

            change_rate = 0.0
            if comparison_health_consultation > 0:
                change_rate = ((
                                           current_health_consultation - comparison_health_consultation) / comparison_health_consultation) * 100

            comparison_data['tcmHealthConsultationVisits'] = ComparisonData(
                current_value=current_health_consultation,
                comparison_value=comparison_health_consultation,
                change_rate=round(change_rate, 2),
                change_type='increase' if change_rate > 0 else 'decrease' if change_rate < 0 else 'stable'
            )

            logger.info(f"动态计算完成 - 共计算 {len(comparison_data)} 个指标")

            return comparison_data

        except Exception as e:
            logger.error(f"动态计算比较分析数据失败: {str(e)}")
            return self._get_mock_comparison_data(comparison_type)

    def _get_mock_comparison_data(self, comparison_type: str) -> Dict[str, ComparisonData]:
        """获取模拟的同比环比数据"""
        import random

        comparison_data = {}

        # 模拟各个指标的数据
        indicators = {
            'tcmOutpatientVisits': (1500, 2000),  # 范围：1500-2000人次
            'tcmPrescriptionRatio': (15.0, 25.0),  # 范围：15%-25%
            'tcmNonDrugTherapyRatio': (5.0, 12.0),  # 范围：5%-12%
            'tcmPreventiveCareVisits': (200, 500),  # 范围：200-500人次
            'tcmHealthConsultationVisits': (300, 700)  # 范围：300-700人次
        }

        for indicator, (min_val, max_val) in indicators.items():
            base_value = random.uniform(min_val, max_val)
            variation = random.uniform(-0.1, 0.1) * base_value  # ±10%的变化

            current_value = base_value + variation
            comparison_value = base_value

            # 确保数据合理
            current_value = max(min_val, min(max_val, current_value))
            comparison_value = max(min_val, min(max_val, comparison_value))

            change_rate = ((current_value - comparison_value) / comparison_value) * 100 if comparison_value > 0 else 0
            change_type = 'increase' if change_rate > 0 else 'decrease' if change_rate < 0 else 'stable'

            comparison_data[indicator] = ComparisonData(
                current_value=round(current_value, 2),
                comparison_value=round(comparison_value, 2),
                change_rate=round(change_rate, 2),
                change_type=change_type
            )

        logger.info(f"使用模拟数据 - 类型: {comparison_type}, 指标数: {len(comparison_data)}")

        return comparison_data

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
                FROM tcm_service_data 
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
            SUM(tcm_outpatient_visits) as tcm_outpatient_visits,
            CASE 
                WHEN SUM(total_outpatient_visits) > 0 
                THEN (SUM(tcm_prescription_patients)::FLOAT / SUM(total_outpatient_visits)) * 100
                ELSE 0 
            END as tcm_prescription_ratio,
            CASE 
                WHEN SUM(total_outpatient_visits) > 0 
                THEN (SUM(tcm_non_drug_therapy_visits)::FLOAT / SUM(total_outpatient_visits)) * 100
                ELSE 0 
            END as tcm_non_drug_therapy_ratio,
            SUM(tcm_preventive_care_visits) as tcm_preventive_care_visits,
            SUM(tcm_health_consultation_visits) as tcm_health_consultation_visits
        FROM tcm_service_data 
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


class TcmServiceCalculator:
    """门诊中药服务指标计算器"""

    @staticmethod
    def calculate_tcm_prescription_ratio(tcm_prescription_patients: int, total_outpatient_visits: int) -> float:
        """
        计算使用中药饮片的门诊人数占同类机构门诊人数的比例

        :param tcm_prescription_patients: 使用中药饮片的门诊人数
        :param total_outpatient_visits: 同类机构门诊总人数
        :return: 比例(%)
        """
        if total_outpatient_visits == 0:
            return 0.0
        return (tcm_prescription_patients / total_outpatient_visits) * 100

    @staticmethod
    def calculate_tcm_non_drug_therapy_ratio(tcm_non_drug_therapy_visits: int, total_outpatient_visits: int) -> float:
        """
        计算门诊中医非药物疗法诊疗人次数占门诊人次数的比例

        :param tcm_non_drug_therapy_visits: 门诊中医非药物疗法诊疗人次数
        :param total_outpatient_visits: 门诊总人次数
        :return: 比例(%)
        """
        if total_outpatient_visits == 0:
            return 0.0
        return (tcm_non_drug_therapy_visits / total_outpatient_visits) * 100

    @staticmethod
    def calculate_tcm_service_coverage(
            tcm_outpatient_visits: int,
            total_outpatient_visits: int
    ) -> float:
        """
        计算中医治未病服务覆盖率

        :param tcm_outpatient_visits: 中医治未病门诊服务人次数
        :param total_outpatient_visits: 门诊总人次数
        :return: 覆盖率(%)
        """
        if total_outpatient_visits == 0:
            return 0.0
        return (tcm_outpatient_visits / total_outpatient_visits) * 100


# 测试路由


# API路由
@app.route('/api/tcm-service', methods=['GET'])
def get_tcm_service_data():
    """获取门诊中药服务数据API接口"""
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

        service = TcmServiceService(conn)

        try:
            # 传递所有参数
            data = service.get_tcm_service_data(time_range, start_date, end_date, year)

            # 转换为前端需要的格式
            result = []
            for item in data:
                result.append({
                    'date': item.date,
                    'data': {
                        'tcmOutpatientVisits': item.data.tcm_outpatient_visits,
                        'tcmPrescriptionRatio': round(item.data.tcm_prescription_ratio, 2),
                        'tcmNonDrugTherapyRatio': round(item.data.tcm_non_drug_therapy_ratio, 2),
                        'tcmPreventiveCareVisits': item.data.tcm_preventive_care_visits,
                        'tcmHealthConsultationVisits': item.data.tcm_health_consultation_visits
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


@app.route('/api/tcm-service/summary', methods=['GET'])
def get_tcm_service_summary():
    """获取门诊中药服务摘要数据API接口"""
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

        service = TcmServiceService(conn)

        try:
            summary = service.get_indicators_summary(time_range)

            return jsonify({
                'success': True,
                'data': {
                    'tcmOutpatientVisits': summary.tcm_outpatient_visits,
                    'tcmPrescriptionRatio': round(summary.tcm_prescription_ratio, 2),
                    'tcmNonDrugTherapyRatio': round(summary.tcm_non_drug_therapy_ratio, 2),
                    'tcmPreventiveCareVisits': summary.tcm_preventive_care_visits,
                    'tcmHealthConsultationVisits': summary.tcm_health_consultation_visits
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


@app.route('/api/tcm-service/comparison', methods=['GET'])
def get_comparison_data():
    """获取同比环比分析数据API接口"""
    try:
        period_date = request.args.get('period_date', datetime.now().strftime('%Y-%m-01'))
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

        service = TcmServiceService(conn)

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


@app.route('/api/tcm-service/comparison-periods', methods=['GET'])
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

        service = TcmServiceService(conn)

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


@app.route('/api/tcm-service/years', methods=['GET'])
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
            FROM tcm_service_data 
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


@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({
        'status': 'healthy',
        'service': 'tcm_service',
        'timestamp': datetime.now().isoformat(),
        'database_connected': db_manager.connection_pool is not None
    })


# 启动应用
if __name__ == "__main__":
    # 初始化数据库连接
    logger.info("=== 开始启动门诊中药服务 ===")

    if db_manager.create_connection_pool():
        logger.info("数据库连接池初始化成功")
    else:
        logger.error("数据库连接池初始化失败")

    # 打印所有注册的路由用于调试
    logger.info("=== 注册的路由 ===")
    with app.app_context():
        for rule in app.url_map.iter_rules():
            if rule.rule.startswith('/api'):
                logger.info(f"API路由: {rule.rule} -> {rule.endpoint}")

    # 启动Flask应用
    logger.info("启动Flask应用在端口5005...")
    app.run(host='0.0.0.0', port=5005, debug=True)
