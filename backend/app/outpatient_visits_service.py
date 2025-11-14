# import logging
# import sys
# from dataclasses import dataclass
# from datetime import datetime
# from typing import List, Dict, Optional
#
# from flask import Flask, jsonify, request
# from flask_cors import CORS
#
# print(sys.path)
# sys.path.append('../../../..')
# print(sys.path)
# from backend.app.utils import DatabaseManager
#
# # 配置日志
# logging.basicConfig(level=logging.INFO)
# logger = logging.getLogger(__name__)
#
# # 创建Flask应用
# app = Flask(__name__)
# CORS(app)  # 启用跨域支持
#
#
# @dataclass
# class OutpatientVisitsData:
#     """门急诊人次数据模型"""
#     total_visits: int = 0  # 总诊疗人次数
#     outpatient_emergency_visits: int = 0  # 门急诊人次
#     outpatient_visits: int = 0  # 门诊人次
#     outpatient_growth_rate: float = 0.0  # 门诊人次增减率(%)
#     emergency_visits: int = 0  # 急诊人次
#     emergency_growth_rate: float = 0.0  # 急诊人次增减率(%)
#     outpatient_per_capita_ratio: float = 0.0  # 门诊人头人次比(%)
#
#
# @dataclass
# class OutpatientVisitsResponse:
#     """门急诊人次响应数据模型"""
#     date: str
#     data: OutpatientVisitsData
#
#
# @dataclass
# class ComparisonData:
#     """同比环比数据模型"""
#     current_value: float
#     comparison_value: float
#     change_rate: float
#     change_type: str
#
#
#
#
# # 全局数据库管理器
# db_manager = DatabaseManager.DatabaseManager()
#
#
# class OutpatientVisitsService:
#     """门急诊人次服务类"""
#
#     def __init__(self, db_connection=None):
#         """
#         初始化服务
#         :param db_connection: PostgreSQL数据库连接对象
#         """
#         self.db_connection = db_connection
#
#     def get_outpatient_visits_data(
#             self,
#             time_range: str,
#             start_date: Optional[str] = None,
#             end_date: Optional[str] = None,
#             year: Optional[str] = None
#     ) -> List[OutpatientVisitsResponse]:
#         """
#         获取门急诊人次数据 - 修复增长率计算版本
#         """
#         try:
#             logger.info(
#                 f"查询门急诊人次数据 - 时间范围: {time_range}, 开始日期: {start_date}, 结束日期: {end_date}, 年份: {year}")
#
#             if not self.db_connection:
#                 logger.error("数据库连接未配置")
#                 return []
#
#             # 构建SQL查询
#             query = self._build_query_with_growth_rate(time_range, start_date, end_date, year)
#             params = self._get_query_params(start_date, end_date, year)
#
#             logger.info(f"执行的SQL查询: {query}")
#             logger.info(f"查询参数: {params}")
#
#             # 执行查询
#             cursor = self.db_connection.cursor()
#             cursor.execute(query, params)
#             results = cursor.fetchall()
#
#             # 添加调试信息
#             logger.info(f"查询结果条数: {len(results)}")
#             if results:
#                 for i, row in enumerate(results):
#                     logger.info(f"第{i + 1}条结果: {row}")
#
#             # 处理查询结果
#             data_list = []
#             for row in results:
#                 data = OutpatientVisitsData(
#                     total_visits=row[1] or 0,
#                     outpatient_emergency_visits=row[2] or 0,
#                     outpatient_visits=row[3] or 0,
#                     emergency_visits=row[4] or 0,
#                     outpatient_growth_rate=float(row[5] or 0.0),
#                     emergency_growth_rate=float(row[6] or 0.0),
#                     outpatient_per_capita_ratio=float(row[7] or 0.0)
#                 )
#
#                 response = OutpatientVisitsResponse(
#                     date=str(row[0]),
#                     data=data
#                 )
#                 data_list.append(response)
#
#             cursor.close()
#             logger.info(f"成功获取 {len(data_list)} 条数据")
#             return data_list
#
#         except Exception as e:
#             logger.error(f"获取门急诊人次数据失败: {str(e)}")
#             import traceback
#             logger.error(f"详细错误信息: {traceback.format_exc()}")
#             return []
#
#     def get_indicators_summary(self, time_range: str) -> OutpatientVisitsData:
#         """
#         获取指标统计摘要 - 正确计算增长率版本
#         """
#         try:
#             logger.info(f"获取指标摘要 - 时间范围: {time_range}")
#
#             if not self.db_connection:
#                 logger.error("数据库连接未配置")
#                 return OutpatientVisitsData()
#
#             # 构建完整的摘要查询，正确计算增长率
#             summary_query = self._build_summary_query_with_growth_rate(time_range)
#
#             cursor = self.db_connection.cursor()
#             cursor.execute(summary_query)
#             result = cursor.fetchone()
#             cursor.close()
#
#             if result:
#                 return OutpatientVisitsData(
#                     total_visits=result[0] or 0,
#                     outpatient_emergency_visits=result[1] or 0,
#                     outpatient_visits=result[2] or 0,
#                     emergency_visits=result[3] or 0,
#                     outpatient_growth_rate=float(result[4] or 0.0),
#                     emergency_growth_rate=float(result[5] or 0.0),
#                     outpatient_per_capita_ratio=float(result[6] or 0.0)
#                 )
#             else:
#                 return OutpatientVisitsData()
#
#         except Exception as e:
#             logger.error(f"获取指标摘要失败: {str(e)}")
#             import traceback
#             logger.error(f"详细错误: {traceback.format_exc()}")
#             return OutpatientVisitsData()
#
#     def get_comparison_data(self, period_date: str, comparison_type: str) -> Dict[str, ComparisonData]:
#         """获取同比环比分析数据"""
#         try:
#             logger.info(f"获取比较分析数据 - 日期: {period_date}, 类型: {comparison_type}")
#
#             if not self.db_connection:
#                 logger.error("数据库连接未配置")
#                 return {}
#
#             # 构建比较查询SQL - 直接从原始数据计算
#             comparison_query = self._build_comparison_query(period_date, comparison_type)
#
#             cursor = self.db_connection.cursor()
#             cursor.execute(comparison_query, (period_date, period_date))
#             results = cursor.fetchall()
#             cursor.close()
#
#             comparison_data = {}
#             for row in results:
#                 comparison_data[row[0]] = ComparisonData(
#                     current_value=float(row[1]),
#                     comparison_value=float(row[2]),
#                     change_rate=float(row[3]),
#                     change_type=row[4]
#                 )
#
#             return comparison_data
#
#         except Exception as e:
#             logger.error(f"获取比较分析数据失败: {str(e)}")
#             return {}
#
#
#     def _get_date_condition(self, time_range: str) -> str:
#         """根据时间范围获取日期条件"""
#         conditions = {
#             'day': "date_period >= CURRENT_DATE - INTERVAL '30 days'",
#             'month': "date_period >= CURRENT_DATE - INTERVAL '12 months'",
#             'quarter': "date_period >= CURRENT_DATE - INTERVAL '12 months'",
#             'year': "EXTRACT(YEAR FROM date_period) = EXTRACT(YEAR FROM CURRENT_DATE)"
#         }
#         return conditions.get(time_range, "1=1")
#
#     def _get_previous_period_condition(self, time_range: str) -> str:
#         """获取上期数据查询条件"""
#         conditions = {
#             'day': "date_period >= CURRENT_DATE - INTERVAL '60 days' AND date_period < CURRENT_DATE - INTERVAL '30 days'",
#             'month': "date_period >= CURRENT_DATE - INTERVAL '24 months' AND date_period < CURRENT_DATE - INTERVAL '12 months'",
#             'quarter': "date_period >= CURRENT_DATE - INTERVAL '24 months' AND date_period < CURRENT_DATE - INTERVAL '12 months'",
#             'year': "EXTRACT(YEAR FROM date_period) = EXTRACT(YEAR FROM CURRENT_DATE) - 1"
#         }
#         return conditions.get(time_range, "1=0")  # 默认返回无数据条件
#
#     def _get_date_format(self, time_range: str) -> str:
#         """
#         根据时间范围获取PostgreSQL日期格式
#
#         :param time_range: 时间范围
#         :return: PostgreSQL日期格式字符串
#         """
#         formats = {
#             'day': 'YYYY-MM-DD',
#             'month': 'YYYY-MM',
#             'quarter': 'YYYY-Q',
#             'year': 'YYYY'
#         }
#         return formats.get(time_range, 'YYYY-MM-DD')
#
#     def _get_query_params(self, start_date: Optional[str], end_date: Optional[str],
#                           year: Optional[str] = None) -> tuple:
#         """
#         获取查询参数
#
#         :param start_date: 开始日期
#         :param end_date: 结束日期
#         :param year: 年份
#         :return: 查询参数元组
#         """
#         # 如果指定了年份，不需要额外的日期参数
#         if year:
#             return ()
#         # 如果指定了开始和结束日期
#         elif start_date and end_date:
#             return (start_date, end_date)
#         # 如果都没有指定，返回空参数
#         else:
#             return ()
#
#
# class OutpatientVisitsCalculator:
#     """门急诊人次指标计算器"""
#
#     @staticmethod
#     def calculate_growth_rate(current_value: int, previous_value: int) -> float:
#         """
#         计算增减率
#
#         :param current_value: 当前值
#         :param previous_value: 上期值
#         :return: 增减率(%)
#         """
#         if previous_value == 0:
#             return 0.0
#         return ((current_value - previous_value) / previous_value) * 100
#
#     @staticmethod
#     def calculate_per_capita_ratio(patient_count: int, visit_count: int) -> float:
#         """
#         计算人头人次比
#
#         :param patient_count: 患者人数
#         :param visit_count: 就诊人次
#         :return: 人头人次比(%)
#         """
#         if visit_count == 0:
#             return 0.0
#         return (visit_count / patient_count) * 100
#
#     @staticmethod
#     def calculate_total_visits(
#             outpatient_visits: int,
#             emergency_visits: int,
#             health_check_visits: int = 0,
#             health_consultation_visits: int = 0
#     ) -> int:
#         """
#         计算总诊疗人次数
#
#         :param outpatient_visits: 门诊人次
#         :param emergency_visits: 急诊人次
#         :param health_check_visits: 健康检查人次
#         :param health_consultation_visits: 健康咨询指导人次
#         :return: 总诊疗人次数
#         """
#         return outpatient_visits + emergency_visits + health_check_visits + health_consultation_visits
#
#
# # API路由
# @app.route('/api/outpatient-visits', methods=['GET'])
# def get_outpatient_visits_data():
#     """获取门急诊人次数据API接口"""
#     try:
#         time_range = request.args.get('range', 'month')
#         start_date = request.args.get('start_date')
#         end_date = request.args.get('end_date')
#         year = request.args.get('year')
#
#         logger.info(f"API请求 - 时间范围: {time_range}, 开始日期: {start_date}, 结束日期: {end_date}, 年份: {year}")
#
#         # 获取数据库连接并创建服务
#         conn = db_manager.get_connection()
#         if not conn:
#             return jsonify({
#                 'success': False,
#                 'error': '数据库连接失败',
#                 'timestamp': datetime.now().isoformat()
#             }), 500
#
#         service = OutpatientVisitsService(conn)
#
#         try:
#             # 使用修复后的方法获取数据
#             data = service.get_outpatient_visits_data(time_range, start_date, end_date, year)
#
#             # 转换为前端需要的格式
#             result = []
#             for item in data:
#                 result.append({
#                     'date': item.date,
#                     'data': {
#                         'totalVisits': item.data.total_visits,
#                         'outpatientEmergencyVisits': item.data.outpatient_emergency_visits,
#                         'outpatientVisits': item.data.outpatient_visits,
#                         'outpatientGrowthRate': item.data.outpatient_growth_rate,
#                         'emergencyVisits': item.data.emergency_visits,
#                         'emergencyGrowthRate': item.data.emergency_growth_rate,
#                         'outpatientPerCapitaRatio': item.data.outpatient_per_capita_ratio
#                     }
#                 })
#
#             return jsonify({
#                 'success': True,
#                 'data': result,
#                 'timestamp': datetime.now().isoformat()
#             })
#         finally:
#             # 归还数据库连接
#             if conn:
#                 db_manager.return_connection(conn)
#
#     except Exception as e:
#         logger.error(f"API调用失败: {str(e)}")
#         return jsonify({
#             'success': False,
#             'error': str(e),
#             'timestamp': datetime.now().isoformat()
#         }), 500
#
#
# @app.route('/api/outpatient-visits/summary', methods=['GET'])
# def get_visits_summary():
#     """获取门急诊人次摘要数据API接口"""
#     try:
#         time_range = request.args.get('range', 'month')
#
#         # 获取数据库连接并创建服务
#         conn = db_manager.get_connection()
#         if not conn:
#             return jsonify({
#                 'success': False,
#                 'error': '数据库连接失败',
#                 'timestamp': datetime.now().isoformat()
#             }), 500
#
#         service = OutpatientVisitsService(conn)
#
#         try:
#             summary = service.get_indicators_summary(time_range)
#
#             return jsonify({
#                 'success': True,
#                 'data': {
#                     'totalVisits': summary.total_visits,
#                     'outpatientEmergencyVisits': summary.outpatient_emergency_visits,
#                     'outpatientVisits': summary.outpatient_visits,
#                     'outpatientGrowthRate': summary.outpatient_growth_rate,
#                     'emergencyVisits': summary.emergency_visits,
#                     'emergencyGrowthRate': summary.emergency_growth_rate,
#                     'outpatientPerCapitaRatio': summary.outpatient_per_capita_ratio
#                 },
#                 'timestamp': datetime.now().isoformat()
#             })
#         finally:
#             if conn:
#                 db_manager.return_connection(conn)
#
#     except Exception as e:
#         logger.error(f"获取摘要数据失败: {str(e)}")
#         return jsonify({
#             'success': False,
#             'error': str(e),
#             'timestamp': datetime.now().isoformat()
#         }), 500
#
#
# @app.route('/api/outpatient-visits/comparison', methods=['GET'])
# def get_comparison_data():
#     """获取同比环比分析数据API接口 - 修复版本"""
#     try:
#         period_date = request.args.get('period_date', '2024-01-01')
#         comparison_type = request.args.get('type', 'yoy')
#
#         logger.info(f"获取比较分析数据 - 日期: {period_date}, 类型: {comparison_type}")
#
#         # 获取数据库连接并创建服务
#         conn = db_manager.get_connection()
#         if not conn:
#             return jsonify({
#                 'success': False,
#                 'error': '数据库连接失败',
#                 'timestamp': datetime.now().isoformat()
#             }), 500
#
#         service = OutpatientVisitsService(conn)
#
#         try:
#             comparison_data = service.get_comparison_data(period_date, comparison_type)
#
#             # 转换为前端需要的格式
#             result = {}
#             for key, data in comparison_data.items():
#                 result[key] = {
#                     'current_value': data.current_value,
#                     'comparison_value': data.comparison_value,
#                     'change_rate': data.change_rate,
#                     'change_type': data.change_type
#                 }
#
#             logger.info(f"返回比较数据: {len(result)} 个指标")
#             return jsonify({
#                 'success': True,
#                 'data': result,
#                 'timestamp': datetime.now().isoformat()
#             })
#         finally:
#             if conn:
#                 db_manager.return_connection(conn)
#
#     except Exception as e:
#         logger.error(f"获取比较分析数据失败: {str(e)}")
#         import traceback
#         logger.error(f"详细错误: {traceback.format_exc()}")
#         return jsonify({
#             'success': False,
#             'error': str(e),
#             'timestamp': datetime.now().isoformat()
#         }), 500
#
#
# @app.route('/api/outpatient-visits/years', methods=['GET'])
# def get_available_years():
#     """获取数据库中可用的年份列表"""
#     try:
#         conn = db_manager.get_connection()
#         if not conn:
#             return jsonify({
#                 'success': False,
#                 'error': '数据库连接失败',
#                 'timestamp': datetime.now().isoformat()
#             }), 500
#
#         cursor = conn.cursor()
#         cursor.execute("""
#             SELECT DISTINCT EXTRACT(YEAR FROM date_period) as year
#             FROM medical_visits_data
#             ORDER BY year DESC
#         """)
#         results = cursor.fetchall()
#         cursor.close()
#
#         years = [int(row[0]) for row in results]
#
#         return jsonify({
#             'success': True,
#             'data': years,
#             'timestamp': datetime.now().isoformat()
#         })
#
#     except Exception as e:
#         logger.error(f"获取年份列表失败: {str(e)}")
#         return jsonify({
#             'success': False,
#             'error': str(e),
#             'timestamp': datetime.now().isoformat()
#         }), 500
#
#
# def _build_comparison_query(self, period_date: str, comparison_type: str) -> tuple:
#     """
#     构建比较查询SQL - 修复版本
#     """
#     # 解析日期
#     from datetime import datetime
#     try:
#         current_date = datetime.strptime(period_date, '%Y-%m-%d')
#     except:
#         current_date = datetime.now()
#
#     current_year = current_date.year
#     current_month = current_date.month
#
#     if comparison_type == 'yoy':
#         # 同比分析：与去年同期比较
#         query = """
#         WITH current_period AS (
#             SELECT
#                 'totalVisits' as indicator_key,
#                 COALESCE(SUM(total_visits), 0) as current_value
#             FROM medical_visits_data
#             WHERE EXTRACT(YEAR FROM date_period) = %s AND EXTRACT(MONTH FROM date_period) = %s
#
#             UNION ALL
#
#             SELECT
#                 'outpatientEmergencyVisits' as indicator_key,
#                 COALESCE(SUM(outpatient_visits + emergency_visits), 0) as current_value
#             FROM medical_visits_data
#             WHERE EXTRACT(YEAR FROM date_period) = %s AND EXTRACT(MONTH FROM date_period) = %s
#
#             UNION ALL
#
#             SELECT
#                 'outpatientVisits' as indicator_key,
#                 COALESCE(SUM(outpatient_visits), 0) as current_value
#             FROM medical_visits_data
#             WHERE EXTRACT(YEAR FROM date_period) = %s AND EXTRACT(MONTH FROM date_period) = %s
#
#             UNION ALL
#
#             SELECT
#                 'emergencyVisits' as indicator_key,
#                 COALESCE(SUM(emergency_visits), 0) as current_value
#             FROM medical_visits_data
#             WHERE EXTRACT(YEAR FROM date_period) = %s AND EXTRACT(MONTH FROM date_period) = %s
#
#             UNION ALL
#
#             SELECT
#                 'outpatientPerCapitaRatio' as indicator_key,
#                 CASE
#                     WHEN COALESCE(SUM(outpatient_patient_count), 0) > 0
#                     THEN ROUND(COALESCE(SUM(outpatient_visits), 0) * 100.0 / COALESCE(SUM(outpatient_patient_count), 1), 2)
#                     ELSE 0
#                 END as current_value
#             FROM medical_visits_data
#             WHERE EXTRACT(YEAR FROM date_period) = %s AND EXTRACT(MONTH FROM date_period) = %s
#         ),
#         comparison_period AS (
#             SELECT
#                 'totalVisits' as indicator_key,
#                 COALESCE(SUM(total_visits), 0) as comparison_value
#             FROM medical_visits_data
#             WHERE EXTRACT(YEAR FROM date_period) = %s - 1 AND EXTRACT(MONTH FROM date_period) = %s
#
#             UNION ALL
#
#             SELECT
#                 'outpatientEmergencyVisits' as indicator_key,
#                 COALESCE(SUM(outpatient_visits + emergency_visits), 0) as comparison_value
#             FROM medical_visits_data
#             WHERE EXTRACT(YEAR FROM date_period) = %s - 1 AND EXTRACT(MONTH FROM date_period) = %s
#
#             UNION ALL
#
#             SELECT
#                 'outpatientVisits' as indicator_key,
#                 COALESCE(SUM(outpatient_visits), 0) as comparison_value
#             FROM medical_visits_data
#             WHERE EXTRACT(YEAR FROM date_period) = %s - 1 AND EXTRACT(MONTH FROM date_period) = %s
#
#             UNION ALL
#
#             SELECT
#                 'emergencyVisits' as indicator_key,
#                 COALESCE(SUM(emergency_visits), 0) as comparison_value
#             FROM medical_visits_data
#             WHERE EXTRACT(YEAR FROM date_period) = %s - 1 AND EXTRACT(MONTH FROM date_period) = %s
#
#             UNION ALL
#
#             SELECT
#                 'outpatientPerCapitaRatio' as indicator_key,
#                 CASE
#                     WHEN COALESCE(SUM(outpatient_patient_count), 0) > 0
#                     THEN ROUND(COALESCE(SUM(outpatient_visits), 0) * 100.0 / COALESCE(SUM(outpatient_patient_count), 1), 2)
#                     ELSE 0
#                 END as comparison_value
#             FROM medical_visits_data
#             WHERE EXTRACT(YEAR FROM date_period) = %s - 1 AND EXTRACT(MONTH FROM date_period) = %s
#         ),
#         combined_data AS (
#             SELECT
#                 c.indicator_key,
#                 c.current_value,
#                 p.comparison_value,
#                 CASE
#                     WHEN p.comparison_value > 0
#                     THEN ROUND((c.current_value - p.comparison_value) * 100.0 / p.comparison_value, 2)
#                     ELSE 0
#                 END as change_rate
#             FROM current_period c
#             JOIN comparison_period p ON c.indicator_key = p.indicator_key
#         )
#         SELECT * FROM combined_data
#         """
#         params = [current_year, current_month] * 10  # 5个指标 * 2次
#
#     else:  # mom 环比分析
#         # 环比分析：与上个月比较
#         query = """
#         WITH current_period AS (
#             SELECT
#                 'totalVisits' as indicator_key,
#                 COALESCE(SUM(total_visits), 0) as current_value
#             FROM medical_visits_data
#             WHERE EXTRACT(YEAR FROM date_period) = %s AND EXTRACT(MONTH FROM date_period) = %s
#
#             UNION ALL
#
#             SELECT
#                 'outpatientEmergencyVisits' as indicator_key,
#                 COALESCE(SUM(outpatient_visits + emergency_visits), 0) as current_value
#             FROM medical_visits_data
#             WHERE EXTRACT(YEAR FROM date_period) = %s AND EXTRACT(MONTH FROM date_period) = %s
#
#             UNION ALL
#
#             SELECT
#                 'outpatientVisits' as indicator_key,
#                 COALESCE(SUM(outpatient_visits), 0) as current_value
#             FROM medical_visits_data
#             WHERE EXTRACT(YEAR FROM date_period) = %s AND EXTRACT(MONTH FROM date_period) = %s
#
#             UNION ALL
#
#             SELECT
#                 'emergencyVisits' as indicator_key,
#                 COALESCE(SUM(emergency_visits), 0) as current_value
#             FROM medical_visits_data
#             WHERE EXTRACT(YEAR FROM date_period) = %s AND EXTRACT(MONTH FROM date_period) = %s
#
#             UNION ALL
#
#             SELECT
#                 'outpatientPerCapitaRatio' as indicator_key,
#                 CASE
#                     WHEN COALESCE(SUM(outpatient_patient_count), 0) > 0
#                     THEN ROUND(COALESCE(SUM(outpatient_visits), 0) * 100.0 / COALESCE(SUM(outpatient_patient_count), 1), 2)
#                     ELSE 0
#                 END as current_value
#             FROM medical_visits_data
#             WHERE EXTRACT(YEAR FROM date_period) = %s AND EXTRACT(MONTH FROM date_period) = %s
#         ),
#         comparison_period AS (
#             SELECT
#                 'totalVisits' as indicator_key,
#                 COALESCE(SUM(total_visits), 0) as comparison_value
#             FROM medical_visits_data
#             WHERE
#                 (EXTRACT(YEAR FROM date_period) = %s AND EXTRACT(MONTH FROM date_period) = %s - 1)
#                 OR (EXTRACT(YEAR FROM date_period) = %s - 1 AND EXTRACT(MONTH FROM date_period) = 12 AND %s = 1)
#
#             UNION ALL
#
#             SELECT
#                 'outpatientEmergencyVisits' as indicator_key,
#                 COALESCE(SUM(outpatient_visits + emergency_visits), 0) as comparison_value
#             FROM medical_visits_data
#             WHERE
#                 (EXTRACT(YEAR FROM date_period) = %s AND EXTRACT(MONTH FROM date_period) = %s - 1)
#                 OR (EXTRACT(YEAR FROM date_period) = %s - 1 AND EXTRACT(MONTH FROM date_period) = 12 AND %s = 1)
#
#             UNION ALL
#
#             SELECT
#                 'outpatientVisits' as indicator_key,
#                 COALESCE(SUM(outpatient_visits), 0) as comparison_value
#             FROM medical_visits_data
#             WHERE
#                 (EXTRACT(YEAR FROM date_period) = %s AND EXTRACT(MONTH FROM date_period) = %s - 1)
#                 OR (EXTRACT(YEAR FROM date_period) = %s - 1 AND EXTRACT(MONTH FROM date_period) = 12 AND %s = 1)
#
#             UNION ALL
#
#             SELECT
#                 'emergencyVisits' as indicator_key,
#                 COALESCE(SUM(emergency_visits), 0) as comparison_value
#             FROM medical_visits_data
#             WHERE
#                 (EXTRACT(YEAR FROM date_period) = %s AND EXTRACT(MONTH FROM date_period) = %s - 1)
#                 OR (EXTRACT(YEAR FROM date_period) = %s - 1 AND EXTRACT(MONTH FROM date_period) = 12 AND %s = 1)
#
#             UNION ALL
#
#             SELECT
#                 'outpatientPerCapitaRatio' as indicator_key,
#                 CASE
#                     WHEN COALESCE(SUM(outpatient_patient_count), 0) > 0
#                     THEN ROUND(COALESCE(SUM(outpatient_visits), 0) * 100.0 / COALESCE(SUM(outpatient_patient_count), 1), 2)
#                     ELSE 0
#                 END as comparison_value
#             FROM medical_visits_data
#             WHERE
#                 (EXTRACT(YEAR FROM date_period) = %s AND EXTRACT(MONTH FROM date_period) = %s - 1)
#                 OR (EXTRACT(YEAR FROM date_period) = %s - 1 AND EXTRACT(MONTH FROM date_period) = 12 AND %s = 1)
#         ),
#         combined_data AS (
#             SELECT
#                 c.indicator_key,
#                 c.current_value,
#                 p.comparison_value,
#                 CASE
#                     WHEN p.comparison_value > 0
#                     THEN ROUND((c.current_value - p.comparison_value) * 100.0 / p.comparison_value, 2)
#                     ELSE 0
#                 END as change_rate
#             FROM current_period c
#             JOIN comparison_period p ON c.indicator_key = p.indicator_key
#         )
#         SELECT * FROM combined_data
#         """
#         params = [current_year, current_month] * 5 + [current_year, current_month, current_year, current_month] * 5
#
#     logger.info(f"比较查询参数: {params}")
#     return query, params
#
#
# @app.route('/api/health', methods=['GET'])
# def health_check():
#     """健康检查接口"""
#     try:
#         # 检查表是否存在
#         conn = db_manager.get_connection()
#         if not conn:
#             return jsonify({
#                 'status': 'unhealthy',
#                 'database_connected': False,
#                 'service': 'outpatient_visits_service',
#                 'timestamp': datetime.now().isoformat()
#             }), 500
#
#         cursor = conn.cursor()
#
#         # 检查关键表是否存在
#         tables_to_check = ['medical_visits_data']
#         tables_status = {}
#
#         for table in tables_to_check:
#             cursor.execute("""
#                 SELECT EXISTS (
#                     SELECT FROM information_schema.tables
#                     WHERE table_schema = 'public'
#                     AND table_name = %s
#                 );
#             """, (table,))
#             exists = cursor.fetchone()[0]
#             tables_status[table] = exists
#
#         cursor.close()
#         db_manager.return_connection(conn)
#
#         all_tables_exist = all(tables_status.values())
#
#         return jsonify({
#             'status': 'healthy' if all_tables_exist else 'degraded',
#             'database_connected': True,
#             'service': 'outpatient_visits_service',
#             'tables_status': tables_status,
#             'timestamp': datetime.now().isoformat()
#         })
#
#     except Exception as e:
#         logger.error(f"健康检查失败: {str(e)}")
#         return jsonify({
#             'status': 'unhealthy',
#             'error': str(e),
#             'service': 'outpatient_visits_service',
#             'timestamp': datetime.now().isoformat()
#         }), 500
#
#
# # 启动应用
# if __name__ == "__main__":
#     # 初始化数据库连接
#     if db_manager.create_connection_pool():
#         logger.info("数据库连接池初始化成功")
#     else:
#         logger.error("数据库连接池初始化失败")
#
#     # 启动Flask应用
#     app.run(host='0.0.0.0', port=5002, debug=True)
