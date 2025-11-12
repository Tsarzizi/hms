import os
import logging
from psycopg2 import pool
import psycopg2
from dotenv import load_dotenv

# === 日志配置 ===
logging.basicConfig(
    level=logging.INFO,                     # 可改为 DEBUG 查看更详细日志
    format="[%(asctime)s] [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

pg_pool = None


def init_db():
    """初始化 PostgreSQL 连接池"""
    global pg_pool
    load_dotenv()
    try:
        db_user = os.getenv("DB_USER")
        db_password = os.getenv("DB_PASSWORD")
        db_host = os.getenv("DB_HOST")
        db_port = os.getenv("DB_PORT", "5432")
        db_database = os.getenv("DB_DATABASE")

        logger.info("Initializing PostgreSQL connection pool...")
        logger.info(f"DB_HOST={db_host}, DB_PORT={db_port}, DB_USER={db_user}, DB_DATABASE={db_database}")

        pg_pool = pool.SimpleConnectionPool(
            1, 10,
            user=db_user,
            password=db_password,
            host=db_host,
            port=db_port,
            database=db_database
        )

        if not pg_pool:
            raise RuntimeError("Failed to create PostgreSQL connection pool")

        # 测试连接
        conn = pg_pool.getconn()
        with conn.cursor() as cur:
            cur.execute("SELECT version();")
            version = cur.fetchone()
            logger.info(f"Connected to PostgreSQL: {version[0]}")
        pg_pool.putconn(conn)

        logger.info("PostgreSQL connection pool created successfully.")

    except Exception as e:
        logger.exception(f"Error initializing PostgreSQL connection pool: {e}")
        raise


def get_conn():
    """从连接池获取连接"""
    global pg_pool
    if pg_pool is None:
        logger.error("DB pool not initialized. Call init_db() first.")
        raise RuntimeError("DB pool not initialized. Call init_db() first.")
    try:
        conn = pg_pool.getconn()
        logger.debug("Acquired a PostgreSQL connection from pool.")
        return conn
    except Exception as e:
        logger.exception(f"Error acquiring connection: {e}")
        raise


def put_conn(conn):
    """将连接归还到连接池"""
    global pg_pool
    if not pg_pool:
        logger.warning("Connection pool not available while returning connection.")
        return
    if not conn:
        logger.warning("Attempted to return a null connection to pool.")
        return
    try:
        pg_pool.putconn(conn)
        logger.debug("Returned a PostgreSQL connection to pool.")
    except Exception as e:
        logger.exception(f"Error returning connection to pool: {e}")
