import atexit
import logging
import sys
from dataclasses import dataclass
from datetime import datetime
from typing import List, Dict, Optional

from flask import Flask, jsonify, request, g
from flask_cors import CORS

sys.path.append('../../../HMS')
from backend.app.utils import DatabaseManager

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@dataclass
class FollowUpData:
    """复诊情况数据模型"""
    follow_up_rate: float = 0.0
    follow_up_appointment_rate: float = 0.0


@dataclass
class FollowUpResponse:
    """复诊情况响应数据模型"""
    date: str
    data: FollowUpData


@dataclass
class ComparisonData:
    """同比环比数据模型"""
    current_value: float
    comparison_value: float
    change_rate: float
    change_type: str


# 全局数据库管理器
db_manager = DatabaseManager.DatabaseManager()


def create_app():
    """创建Flask应用实例"""
    app = Flask(__name__)
    CORS(app)

    # 应用配置
    app.config['DEBUG'] = False
    app.config['ENV'] = 'production'
    app.config['JSON_AS_ASCII'] = False
    app.config['JSON_SORT_KEYS'] = False

    # 在应用启动时直接初始化数据库
    if not db_manager.create_connection_pool():
        logger.error("数据库连接池初始化失败")
    else:
        logger.info("数据库连接池初始化成功")

    @app.before_request
    def before_request():
        """在请求开始前获取数据库连接"""
        g.db_conn = db_manager.get_connection()
        if not g.db_conn:
            logger.error("无法获取数据库连接")

    @app.teardown_request
    def teardown_request(exception=None):
        """在请求结束后归还数据库连接"""
        conn = g.pop('db_conn', None)
        if conn:
            db_manager.return_connection(conn)

    return app


# 创建应用实例
app = create_app()


class FollowUpService:
    """复诊情况服务类"""

    def __init__(self, db_connection=None):
        self.db_connection = db_connection

    def get_follow_up_data(self, time_range: str, start_date: Optional[str] = None, end_date: Optional[str] = None,
                           year: Optional[str] = None, department: Optional[str] = None) -> List[FollowUpResponse]:
        """获取复诊情况数据 - 增加科室参数"""
        try:
            logger.info(
                f"查询复诊情况数据 - 时间范围: {time_range}, 开始日期: {start_date}, 结束日期: {end_date}, 年份: {year}, 科室: {department}")

            if not self.db_connection:
                logger.error("数据库连接未配置")
                return []

            # 构建SQL查询
            query = self._build_query(time_range, start_date, end_date, year, department)

            # 执行查询
            cursor = self.db_connection.cursor()
            cursor.execute(query, self._get_query_params(start_date, end_date, year, department))
            results = cursor.fetchall()

            # 处理查询结果
            data_list = []
            for row in results:
                data = FollowUpData(
                    follow_up_rate=row[1] or 0.0,
                    follow_up_appointment_rate=row[2] or 0.0
                )

                response = FollowUpResponse(
                    date=str(row[0]),
                    data=data
                )
                data_list.append(response)

            cursor.close()
            logger.info(f"成功获取 {len(data_list)} 条数据")
            return data_list

        except Exception as e:
            logger.error(f"获取复诊情况数据失败: {str(e)}")
            return []

    def get_indicators_summary(self, time_range: str, department: Optional[str] = None) -> FollowUpData:
        """获取指标统计摘要 - 增加科室参数"""
        try:
            logger.info(f"获取指标摘要 - 时间范围: {time_range}, 科室: {department}")

            if not self.db_connection:
                logger.error("数据库连接未配置")
                return FollowUpData()

            # 构建摘要查询SQL
            summary_query = """
            SELECT 
                AVG(follow_up_rate) as avg_follow_up_rate,
                AVG(follow_up_appointment_rate) as avg_follow_up_appointment_rate
            FROM follow_up_summary 
            WHERE time_range = %s
            """
            params = [time_range]

            if department:
                summary_query += " AND department_id = %s"
                params.append(department)

            cursor = self.db_connection.cursor()
            cursor.execute(summary_query, tuple(params))
            result = cursor.fetchone()
            cursor.close()

            if result and result[0] is not None:
                return FollowUpData(
                    follow_up_rate=result[0] or 0.0,
                    follow_up_appointment_rate=result[1] or 0.0
                )
            else:
                return FollowUpData()

        except Exception as e:
            logger.error(f"获取指标摘要失败: {str(e)}")
            return FollowUpData()

    def get_comparison_data(self, period_date: str, comparison_type: str, department: Optional[str] = None) -> Dict[
        str, ComparisonData]:
        """获取同比环比分析数据 - 增加科室参数"""
        try:
            logger.info(f"获取比较分析数据 - 日期: {period_date}, 类型: {comparison_type}, 科室: {department}")

            if not self.db_connection:
                logger.error("数据库连接未配置")
                return {}

            # 修改查询逻辑，支持按年份和科室查询
            comparison_query = """
            SELECT 
                indicator_key,
                current_value,
                comparison_value,
                change_rate,
                change_type
            FROM follow_up_comparison 
            WHERE EXTRACT(YEAR FROM period_date) = EXTRACT(YEAR FROM %s::date) 
              AND comparison_type = %s
            """
            params = [period_date, comparison_type]

            if department:
                comparison_query += " AND department_id = %s"
                params.append(department)

            comparison_query += " ORDER BY period_date DESC LIMIT 2"

            cursor = self.db_connection.cursor()
            cursor.execute(comparison_query, tuple(params))
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

            logger.info(f"成功获取 {len(comparison_data)} 条{comparison_type}数据")
            return comparison_data

        except Exception as e:
            logger.error(f"获取比较分析数据失败: {str(e)}")
            return {}

    def _build_query(self, time_range: str, start_date: Optional[str], end_date: Optional[str],
                     year: Optional[str] = None, department: Optional[str] = None) -> str:
        """构建PostgreSQL查询SQL - 增加科室参数"""
        # 基础查询条件
        where_conditions = ["1=1"]  # 默认条件

        # 如果有指定年份，使用年份过滤
        if year:
            where_conditions.append("EXTRACT(YEAR FROM date_period) = %s")

        # 如果指定了科室
        if department:
            where_conditions.append("department_id = %s")

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
                THEN (SUM(follow_up_visits)::FLOAT / SUM(total_outpatient_visits)) * 100
                ELSE 0 
            END as follow_up_rate,
            CASE 
                WHEN SUM(follow_up_visits) > 0 
                THEN (SUM(follow_up_appointments)::FLOAT / SUM(follow_up_visits)) * 100
                ELSE 0 
            END as follow_up_appointment_rate
        FROM follow_up_data 
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

    def _get_query_params(self, start_date: Optional[str], end_date: Optional[str],
                          year: Optional[str] = None, department: Optional[str] = None) -> tuple:
        """获取查询参数 - 增加科室参数"""
        params = []
        if year:
            params.append(year)
        if department:
            params.append(department)
        elif start_date and end_date:
            params.extend([start_date, end_date])
        return tuple(params)


# API路由
@app.route('/api/follow-up/data', methods=['GET'])
def get_follow_up_data():
    """获取复诊情况数据API接口 - 增加科室参数"""
    try:
        time_range = request.args.get('range', 'month')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        year = request.args.get('year')
        department = request.args.get('department')  # 新增科室参数

        logger.info(
            f"API请求 - 时间范围: {time_range}, 开始日期: {start_date}, 结束日期: {end_date}, 年份: {year}, 科室: {department}")

        # 从应用上下文中获取数据库连接
        conn = g.get('db_conn')
        if not conn:
            return jsonify({
                'success': False,
                'error': '数据库连接失败',
                'timestamp': datetime.now().isoformat()
            }), 500

        service = FollowUpService(conn)

        # 传递所有参数，包括科室
        data = service.get_follow_up_data(time_range, start_date, end_date, year, department)

        # 转换为前端需要的格式
        result = []
        for item in data:
            result.append({
                'date': item.date,
                'data': {
                    'followUpRate': round(item.data.follow_up_rate, 2),
                    'followUpAppointmentRate': round(item.data.follow_up_appointment_rate, 2)
                }
            })

        return jsonify({
            'success': True,
            'data': result,
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        logger.error(f"API调用失败: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500


@app.route('/api/follow-up/summary', methods=['GET'])
def get_follow_up_summary():
    """获取复诊情况摘要数据API接口 - 增加科室参数"""
    try:
        time_range = request.args.get('range', 'month')
        department = request.args.get('department')  # 新增科室参数

        # 从应用上下文中获取数据库连接
        conn = g.get('db_conn')
        if not conn:
            return jsonify({
                'success': False,
                'error': '数据库连接失败',
                'timestamp': datetime.now().isoformat()
            }), 500

        service = FollowUpService(conn)
        summary = service.get_indicators_summary(time_range, department)

        return jsonify({
            'success': True,
            'data': {
                'followUpRate': round(summary.follow_up_rate, 2),
                'followUpAppointmentRate': round(summary.follow_up_appointment_rate, 2)
            },
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        logger.error(f"获取摘要数据失败: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500


@app.route('/api/follow-up/years', methods=['GET'])
def get_available_years():
    """获取数据库中可用的年份列表"""
    try:
        # 从应用上下文中获取数据库连接
        conn = g.get('db_conn')
        if not conn:
            return jsonify({
                'success': False,
                'error': '数据库连接失败',
                'timestamp': datetime.now().isoformat()
            }), 500

        cursor = conn.cursor()
        cursor.execute("""
            SELECT DISTINCT EXTRACT(YEAR FROM date_period) as year 
            FROM follow_up_data 
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


@app.route('/api/follow-up/departments', methods=['GET'])
def get_departments():
    """获取科室列表API接口"""
    try:
        # 从应用上下文中获取数据库连接
        conn = g.get('db_conn')
        if not conn:
            return jsonify({
                'success': False,
                'error': '数据库连接失败',
                'timestamp': datetime.now().isoformat()
            }), 500

        cursor = conn.cursor()

        # 查询科室列表
        cursor.execute("""
            SELECT DISTINCT department_id, department_name 
            FROM departments 
            ORDER BY department_name
        """)

        results = cursor.fetchall()
        cursor.close()

        departments = []
        for row in results:
            departments.append({
                'id': row[0],
                'name': row[1]
            })

        return jsonify({
            'success': True,
            'data': departments,
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        logger.error(f"获取科室列表失败: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500


@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    db_healthy = db_manager.connection_pool is not None
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'database_connected': db_healthy,
        'service': 'follow_up_service'
    })


@app.route('/')
def index():
    """根路径返回服务信息"""
    return jsonify({
        'service': '复诊情况数据服务',
        'version': '1.0.0',
        'status': '运行中',
        'timestamp': datetime.now().isoformat()
    })


def close_connection_pool():
    """关闭数据库连接池"""
    db_manager.close_pool()


# 注册退出处理
atexit.register(close_connection_pool)

# 在启动部分彻底关闭调试
if __name__ == "__main__":
    # 初始化数据库连接
    if db_manager.create_connection_pool():
        logger.info("数据库连接池初始化成功")
    else:
        logger.error("数据库连接池初始化失败")

    # 启动Flask应用
    try:
        logger.info("启动复诊情况数据服务...")
        app.run(
            host='0.0.0.0',
            port=5001,  # 使用不同端口避免冲突
            debug=False,
            use_reloader=False,
            use_debugger=False
        )
    except KeyboardInterrupt:
        logger.info("服务已停止")
    except Exception as e:
        logger.error(f"服务启动失败: {str(e)}")
    finally:
        close_connection_pool()
