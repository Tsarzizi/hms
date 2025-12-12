import logging
import os
import threading
import time
from contextlib import contextmanager
from typing import Optional, Dict, Any
from dataclasses import dataclass, asdict

from dotenv import load_dotenv
from psycopg2 import pool, OperationalError, InterfaceError
from psycopg2.extensions import connection, cursor
from psycopg2.extras import RealDictCursor


# === 配置类 ===
@dataclass
class PoolConfig:
    """连接池配置"""
    min_connections: int = 5
    max_connections: int = 20
    connection_timeout: int = 10
    idle_timeout: int = 300  # 空闲连接超时（秒）
    max_lifetime: int = 3600  # 连接最大寿命（秒）
    retry_attempts: int = 3
    retry_delay: float = 1.0
    health_check_interval: int = 30  # 健康检查间隔（秒）
    statement_timeout: int = 30000  # SQL语句超时（毫秒）


# === 监控统计 ===
@dataclass
class PoolStats:
    """连接池统计信息"""
    total_connections: int = 0
    active_connections: int = 0
    idle_connections: int = 0
    connection_attempts: int = 0
    failed_connections: int = 0
    avg_connection_time: float = 0.0
    last_health_check: float = 0.0


# === 日志配置 ===
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [%(threadName)s] [%(module)s:%(lineno)d] %(message)s",
)
logger = logging.getLogger(__name__)

# 全局变量
_pg_pool: Optional[pool.ThreadedConnectionPool] = None
_pool_config: PoolConfig = PoolConfig()
_pool_stats: PoolStats = PoolStats()
_pool_lock = threading.RLock()
_health_check_thread: Optional[threading.Thread] = None
_shutdown_flag = threading.Event()


def _get_pool_config() -> PoolConfig:
    """从环境变量加载连接池配置"""
    config = PoolConfig()

    try:
        config.min_connections = int(os.getenv("DB_POOL_MINCONN", config.min_connections))
        config.max_connections = int(os.getenv("DB_POOL_MAXCONN", config.max_connections))
        config.connection_timeout = int(os.getenv("DB_CONNECT_TIMEOUT", config.connection_timeout))
        config.idle_timeout = int(os.getenv("DB_IDLE_TIMEOUT", config.idle_timeout))
        config.max_lifetime = int(os.getenv("DB_MAX_LIFETIME", config.max_lifetime))
        config.retry_attempts = int(os.getenv("DB_RETRY_ATTEMPTS", config.retry_attempts))
        config.retry_delay = float(os.getenv("DB_RETRY_DELAY", config.retry_delay))
        config.health_check_interval = int(os.getenv("DB_HEALTH_CHECK_INTERVAL", config.health_check_interval))
        config.statement_timeout = int(os.getenv("DB_STATEMENT_TIMEOUT", config.statement_timeout))
    except (ValueError, TypeError) as e:
        logger.warning(f"Invalid environment variable format: {e}, using defaults")

    # 验证配置
    if config.min_connections < 1:
        config.min_connections = 1
    if config.max_connections < config.min_connections:
        config.max_connections = config.min_connections * 2
    if config.max_connections > 100:  # 安全限制
        config.max_connections = 100

    return config


def _create_connection_params() -> Dict[str, Any]:
    """创建数据库连接参数"""
    load_dotenv()

    return {
        'user': os.getenv("DB_USER"),
        'password': os.getenv("DB_PASSWORD"),
        'host': os.getenv("DB_HOST"),
        'port': os.getenv("DB_PORT", "5432"),
        'database': os.getenv("DB_DATABASE"),
        'connect_timeout': _pool_config.connection_timeout,
        'application_name': os.getenv("APP_NAME", "backend_app"),
        'options': f"-c statement_timeout={_pool_config.statement_timeout}",
    }


def _health_checker():
    """连接池健康检查线程"""
    logger.info("Database health checker started")

    while not _shutdown_flag.is_set():
        try:
            time.sleep(_pool_config.health_check_interval)

            with _pool_lock:
                if _pg_pool is None:
                    continue

                _pool_stats.last_health_check = time.time()

                # 执行健康检查查询
                with get_db_connection(silent=True) as conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT 1")
                        result = cur.fetchone()
                        if result and result[0] == 1:
                            logger.debug("Database health check passed")
                        else:
                            logger.warning("Database health check failed")
        except Exception as e:
            logger.error(f"Health check error: {e}")
        except KeyboardInterrupt:
            break

    logger.info("Database health checker stopped")


def _validate_connection(conn: connection) -> bool:
    """验证连接是否有效"""
    if conn.closed:
        return False

    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
            cur.fetchone()
        return True
    except (OperationalError, InterfaceError):
        return False
    except Exception:
        return False


def init_db():
    """初始化 PostgreSQL 连接池"""
    global _pg_pool, _pool_config, _health_check_thread

    with _pool_lock:
        if _pg_pool is not None:
            logger.warning("Database pool already initialized")
            return

        try:
            # 加载配置
            _pool_config = _get_pool_config()

            # 创建连接参数
            conn_params = _create_connection_params()

            logger.info("Initializing PostgreSQL connection pool with config: %s",
                        {k: v if k != 'password' else '***' for k, v in conn_params.items()})

            # 使用 ThreadedConnectionPool 替代 SimpleConnectionPool 以获得更好的线程安全
            _pg_pool = pool.ThreadedConnectionPool(
                minconn=_pool_config.min_connections,
                maxconn=_pool_config.max_connections,
                **conn_params
            )

            if not _pg_pool:
                raise RuntimeError("Failed to create PostgreSQL connection pool")

            # 测试连接池
            _test_connection_pool()

            # 启动健康检查线程
            if not _health_check_thread:
                _shutdown_flag.clear()
                _health_check_thread = threading.Thread(
                    target=_health_checker,
                    name="DB-HealthChecker",
                    daemon=True
                )
                _health_check_thread.start()

            logger.info("PostgreSQL connection pool initialized successfully. "
                        f"Pool size: {_pool_config.min_connections}-{_pool_config.max_connections}")

        except Exception as e:
            logger.exception(f"Error initializing PostgreSQL connection pool: {e}")
            _cleanup()
            raise


def _test_connection_pool():
    """测试连接池中的所有连接"""
    connections = []

    try:
        # 获取多个连接进行测试
        for i in range(min(3, _pool_config.min_connections)):
            conn = _pg_pool.getconn()
            connections.append(conn)

            with conn.cursor() as cur:
                cur.execute("SELECT version(), current_database(), current_user")
                version_info = cur.fetchone()
                logger.info(f"Connection {i + 1}: PostgreSQL {version_info[0]}, "
                            f"DB: {version_info[1]}, User: {version_info[2]}")

                # 设置连接参数
                cur.execute(f"SET statement_timeout = {_pool_config.statement_timeout}")

    finally:
        # 归还所有连接
        for conn in connections:
            if conn and not conn.closed:
                _pg_pool.putconn(conn)


def _cleanup():
    """清理资源"""
    global _pg_pool, _health_check_thread

    with _pool_lock:
        _shutdown_flag.set()

        if _health_check_thread:
            _health_check_thread.join(timeout=5)
            _health_check_thread = None

        if _pg_pool:
            try:
                _pg_pool.closeall()
                logger.info("Closed all database connections")
            except Exception as e:
                logger.error(f"Error closing connection pool: {e}")
            finally:
                _pg_pool = None


def shutdown_db():
    """优雅关闭数据库连接池"""
    logger.info("Shutting down database connection pool...")
    _cleanup()


@contextmanager
def get_db_connection(silent: bool = False, retry: bool = True) -> connection:
    """使用上下文管理器获取数据库连接

    Args:
        silent: 是否静默模式（不记录调试日志）
        retry: 是否启用重试机制
    """
    global _pg_pool

    if _pg_pool is None:
        logger.error("DB pool not initialized. Call init_db() first.")
        raise RuntimeError("DB pool not initialized. Call init_db() first.")

    conn = None
    attempt = 0
    max_attempts = _pool_config.retry_attempts if retry else 1

    while attempt < max_attempts:
        attempt += 1
        _pool_stats.connection_attempts += 1

        try:
            start_time = time.time()

            # 获取连接，设置超时
            conn = _pg_pool.getconn()

            if not silent:
                logger.debug(f"Acquired PostgreSQL connection (attempt {attempt}/{max_attempts}) "
                             f"in {(time.time() - start_time) * 1000:.2f}ms")

            # 验证连接有效性
            if not _validate_connection(conn):
                logger.warning(f"Connection invalid, attempting to reset (attempt {attempt})")
                try:
                    conn.close()
                except:
                    pass

                if attempt < max_attempts:
                    time.sleep(_pool_config.retry_delay * attempt)
                    continue
                else:
                    raise OperationalError("Cannot establish valid database connection")

            # 更新统计
            _pool_stats.active_connections += 1
            _pool_stats.total_connections = _pg_pool.maxconn

            # 设置连接参数
            with conn.cursor() as cur:
                cur.execute(f"SET statement_timeout = {_pool_config.statement_timeout}")

            yield conn
            break

        except pool.PoolError as e:
            _pool_stats.failed_connections += 1

            if attempt >= max_attempts:
                logger.error(f"Failed to get connection from pool after {max_attempts} attempts: {e}")
                raise ConnectionError(f"Cannot get database connection: {e}")

            logger.warning(f"Pool error on attempt {attempt}: {e}, retrying...")
            time.sleep(_pool_config.retry_delay * attempt)

        except Exception as e:
            _pool_stats.failed_connections += 1
            logger.error(f"Unexpected error while getting connection: {e}")
            raise

        finally:
            if conn:
                try:
                    # 再次验证连接是否仍然有效
                    if not conn.closed and _validate_connection(conn):
                        _pg_pool.putconn(conn)
                        if not silent:
                            logger.debug("Returned valid PostgreSQL connection to pool")
                    else:
                        # 连接已损坏，丢弃并创建新连接
                        try:
                            conn.close()
                        except:
                            pass

                        # 尝试创建新连接补充到池中
                        try:
                            new_conn = _pg_pool._connect()
                            _pg_pool.putconn(new_conn)
                            logger.warning("Replaced damaged connection in pool")
                        except Exception as e:
                            logger.error(f"Failed to replace damaged connection: {e}")

                    _pool_stats.active_connections = max(0, _pool_stats.active_connections - 1)

                except Exception as e:
                    logger.error(f"Error returning connection to pool: {e}")
                    try:
                        if not conn.closed:
                            conn.close()
                    except:
                        pass


@contextmanager
def get_db_cursor(cursor_factory=None, silent: bool = False) -> cursor:
    """获取数据库游标的便捷上下文管理器

    Args:
        cursor_factory: 游标工厂类（如 RealDictCursor）
        silent: 是否静默模式
    """
    with get_db_connection(silent=silent) as conn:
        cur = conn.cursor(cursor_factory=cursor_factory) if cursor_factory else conn.cursor()
        try:
            yield cur
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"Database operation failed, rolled back: {e}")
            raise
        finally:
            cur.close()


@contextmanager
def get_dict_cursor(silent: bool = False) -> RealDictCursor:
    """获取返回字典格式的游标"""
    with get_db_cursor(cursor_factory=RealDictCursor, silent=silent) as cur:
        yield cur


def get_pool_stats() -> Dict[str, Any]:
    """获取连接池统计信息"""
    stats = asdict(_pool_stats)

    if _pg_pool:
        try:
            # ThreadedConnectionPool 不直接暴露连接数，但我们可以估算
            stats['idle_connections'] = max(0, _pg_pool.maxconn - _pool_stats.active_connections)
        except:
            pass

    return stats


def execute_query(query: str, params: tuple = None, fetch: bool = True) -> Optional[list]:
    """执行查询的快捷函数

    Args:
        query: SQL查询语句
        params: 查询参数
        fetch: 是否获取结果

    Returns:
        查询结果或None
    """
    with get_db_cursor() as cur:
        cur.execute(query, params)
        if fetch:
            return cur.fetchall()
    return None


def execute_transaction(queries: list) -> bool:
    """执行事务（多个查询）

    Args:
        queries: [(sql, params), ...] 格式的查询列表

    Returns:
        是否成功
    """
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                for query, params in queries:
                    cur.execute(query, params)
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            logger.error(f"Transaction failed: {e}")
            return False


# 应用程序关闭时自动清理
import atexit

atexit.register(shutdown_db)


# 向后兼容的旧函数（保持一段时间后移除）
def get_conn():
    """不推荐使用：请使用 get_db_connection() 上下文管理器"""
    logger.warning("get_conn() is deprecated. Use get_db_connection() context manager instead.")
    if _pg_pool is None:
        raise RuntimeError("DB pool not initialized. Call init_db() first.")
    return _pg_pool.getconn()


def put_conn(conn):
    """不推荐使用：请使用 get_db_connection() 上下文管理器"""
    logger.warning("put_conn() is deprecated. Use get_db_connection() context manager instead.")
    if _pg_pool and conn:
        _pg_pool.putconn(conn)