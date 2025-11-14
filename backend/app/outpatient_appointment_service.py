import logging
import sys
from dataclasses import dataclass
from datetime import datetime
from typing import List, Dict, Optional

from flask import Flask, jsonify, request
from flask_cors import CORS
print(sys.path)
sys.path.append('../../../HMS')
print(sys.path)
from backend.app.utils import DatabaseManager

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 创建Flask应用
app = Flask(__name__)
CORS(app)  # 启用跨域支持

@dataclass
class OutpatientAppointmentData:
    """门诊预约数据模型"""
    appointment_visits: int = 0
    appointment_rate: float = 0.0
    general_appointments: int = 0
    special_appointments: int = 0
    specialist_appointments: int = 0
    disease_appointments: int = 0
    general_appointment_rate: float = 0.0
    special_appointment_rate: float = 0.0
    specialist_appointment_rate: float = 0.0
    disease_appointment_rate: float = 0.0

@dataclass
class OutpatientAppointmentResponse:
    """门诊预约响应数据模型"""
    date: str
    data: OutpatientAppointmentData

@dataclass
class ComparisonData:
    """同比环比数据模型"""
    current_value: float
    comparison_value: float
    change_rate: float
    change_type: str



# 全局数据库管理器
db_manager = DatabaseManager.DatabaseManager()

class OutpatientAppointmentService:
    """门诊预约服务类"""

    def __init__(self, db_connection=None):
        self.db_connection = db_connection

    def get_appointment_data(self, time_range: str, start_date: Optional[str] = None, end_date: Optional[str] = None, year: Optional[str] = None) -> List[OutpatientAppointmentResponse]:
        """获取门诊预约数据"""
        try:
            logger.info(f"查询门诊预约数据 - 时间范围: {time_range}, 开始日期: {start_date}, 结束日期: {end_date}, 年份: {year}")

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
                data = OutpatientAppointmentData(
                    appointment_visits=row[1] or 0,
                    appointment_rate=row[2] or 0.0,
                    general_appointments=row[3] or 0,
                    special_appointments=row[4] or 0,
                    specialist_appointments=row[5] or 0,
                    disease_appointments=row[6] or 0,
                    general_appointment_rate=row[7] or 0.0,
                    special_appointment_rate=row[8] or 0.0,
                    specialist_appointment_rate=row[9] or 0.0,
                    disease_appointment_rate=row[10] or 0.0
                )

                response = OutpatientAppointmentResponse(
                    date=str(row[0]),
                    data=data
                )
                data_list.append(response)

            cursor.close()
            logger.info(f"成功获取 {len(data_list)} 条数据")
            return data_list

        except Exception as e:
            logger.error(f"获取门诊预约数据失败: {str(e)}")
            return []

    def get_indicators_summary(self, time_range: str) -> OutpatientAppointmentData:
        """获取指标统计摘要"""
        try:
            logger.info(f"获取指标摘要 - 时间范围: {time_range}")

            if not self.db_connection:
                logger.error("数据库连接未配置")
                return OutpatientAppointmentData()

            # 构建摘要查询SQL
            summary_query = """
            SELECT 
                SUM(appointment_visits) as total_appointment_visits,
                AVG(appointment_rate) as avg_appointment_rate,
                SUM(general_appointments) as total_general_appointments,
                SUM(special_appointments) as total_special_appointments,
                SUM(specialist_appointments) as total_specialist_appointments,
                SUM(disease_appointments) as total_disease_appointments,
                AVG(general_appointment_rate) as avg_general_appointment_rate,
                AVG(special_appointment_rate) as avg_special_appointment_rate,
                AVG(specialist_appointment_rate) as avg_specialist_appointment_rate,
                AVG(disease_appointment_rate) as avg_disease_appointment_rate
            FROM appointment_summary 
            WHERE time_range = %s
            """

            cursor = self.db_connection.cursor()
            cursor.execute(summary_query, (time_range,))
            result = cursor.fetchone()
            cursor.close()

            if result and result[0] is not None:
                return OutpatientAppointmentData(
                    appointment_visits=result[0] or 0,
                    appointment_rate=result[1] or 0.0,
                    general_appointments=result[2] or 0,
                    special_appointments=result[3] or 0,
                    specialist_appointments=result[4] or 0,
                    disease_appointments=result[5] or 0,
                    general_appointment_rate=result[6] or 0.0,
                    special_appointment_rate=result[7] or 0.0,
                    specialist_appointment_rate=result[8] or 0.0,
                    disease_appointment_rate=result[9] or 0.0
                )
            else:
                return OutpatientAppointmentData()

        except Exception as e:
            logger.error(f"获取指标摘要失败: {str(e)}")
            return OutpatientAppointmentData()

    def get_comparison_data(self, period_date: str, comparison_type: str) -> Dict[str, ComparisonData]:
        """获取同比环比分析数据"""
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
            FROM appointment_comparison 
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

    def _build_query(self, time_range: str, start_date: Optional[str], end_date: Optional[str], year: Optional[str] = None) -> str:
        """构建PostgreSQL查询SQL"""
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
            SUM(appointment_visits) as appointment_visits,
            CASE 
                WHEN SUM(total_outpatient_visits) > 0 
                THEN (SUM(appointment_visits)::FLOAT / SUM(total_outpatient_visits)) * 100
                ELSE 0 
            END as appointment_rate,
            SUM(general_appointments) as general_appointments,
            SUM(special_appointments) as special_appointments,
            SUM(specialist_appointments) as specialist_appointments,
            SUM(disease_appointments) as disease_appointments,
            CASE 
                WHEN SUM(general_total_visits) > 0 
                THEN (SUM(general_appointments)::FLOAT / SUM(general_total_visits)) * 100
                ELSE 0 
            END as general_appointment_rate,
            CASE 
                WHEN SUM(special_total_visits) > 0 
                THEN (SUM(special_appointments)::FLOAT / SUM(special_total_visits)) * 100
                ELSE 0 
            END as special_appointment_rate,
            CASE 
                WHEN SUM(specialist_total_visits) > 0 
                THEN (SUM(specialist_appointments)::FLOAT / SUM(specialist_total_visits)) * 100
                ELSE 0 
            END as specialist_appointment_rate,
            CASE 
                WHEN SUM(disease_total_visits) > 0 
                THEN (SUM(disease_appointments)::FLOAT / SUM(disease_total_visits)) * 100
                ELSE 0 
            END as disease_appointment_rate
        FROM appointment_data 
        WHERE {where_clause}
        GROUP BY TO_CHAR(date_period, '{date_format}')
        ORDER BY period
        """

        return query

    def _get_date_format(self, time_range: str) -> str:
        """根据时间范围获取PostgreSQL日期格式"""
        formats = {
            'day': 'YYYY-MM-DD',
            'month': 'YYYY-MM',
            'quarter': 'YYYY-Q',
            'year': 'YYYY'
        }
        return formats.get(time_range, 'YYYY-MM-DD')

    def _get_query_params(self, start_date: Optional[str], end_date: Optional[str], year: Optional[str] = None) -> tuple:
        """获取查询参数"""
        # 如果指定了年份，不需要额外的日期参数
        if year:
            return ()
        # 如果指定了开始和结束日期
        elif start_date and end_date:
            return (start_date, end_date)
        # 如果都没有指定，返回空参数
        else:
            return ()

# API路由
@app.route('/api/outpatient-appointment', methods=['GET'])
def get_outpatient_appointment_data():
    """获取门诊预约数据API接口"""
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

        service = OutpatientAppointmentService(conn)

        try:
            # 传递所有参数
            data = service.get_appointment_data(time_range, start_date, end_date, year)

            # 转换为前端需要的格式
            result = []
            for item in data:
                result.append({
                    'date': item.date,
                    'data': {
                        'appointmentVisits': item.data.appointment_visits,
                        'appointmentRate': round(item.data.appointment_rate, 2),
                        'generalAppointments': item.data.general_appointments,
                        'specialAppointments': item.data.special_appointments,
                        'specialistAppointments': item.data.specialist_appointments,
                        'diseaseAppointments': item.data.disease_appointments,
                        'generalAppointmentRate': round(item.data.general_appointment_rate, 2),
                        'specialAppointmentRate': round(item.data.special_appointment_rate, 2),
                        'specialistAppointmentRate': round(item.data.specialist_appointment_rate, 2),
                        'diseaseAppointmentRate': round(item.data.disease_appointment_rate, 2)
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

@app.route('/api/outpatient-appointment/summary', methods=['GET'])
def get_appointment_summary():
    """获取门诊预约摘要数据API接口"""
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

        service = OutpatientAppointmentService(conn)

        try:
            summary = service.get_indicators_summary(time_range)

            return jsonify({
                'success': True,
                'data': {
                    'appointmentVisits': summary.appointment_visits,
                    'appointmentRate': round(summary.appointment_rate, 2),
                    'generalAppointments': summary.general_appointments,
                    'specialAppointments': summary.special_appointments,
                    'specialistAppointments': summary.specialist_appointments,
                    'diseaseAppointments': summary.disease_appointments,
                    'generalAppointmentRate': round(summary.general_appointment_rate, 2),
                    'specialAppointmentRate': round(summary.special_appointment_rate, 2),
                    'specialistAppointmentRate': round(summary.specialist_appointment_rate, 2),
                    'diseaseAppointmentRate': round(summary.disease_appointment_rate, 2)
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

@app.route('/api/outpatient-appointment/comparison', methods=['GET'])
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

        service = OutpatientAppointmentService(conn)

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

@app.route('/api/outpatient-appointment/years', methods=['GET'])
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
            FROM appointment_data 
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

    # 启动Flask应用
    app.run(host='0.0.0.0', port=5000, debug=True)