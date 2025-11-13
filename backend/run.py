import logging
from flask import Flask, jsonify
from app.routes.inpatient_total_revenue_routes import bp as inpatient_total_revenue_bp
# ✅ 统一：只从 db_manager 导入 init_db（或你的函数名）
from app.utils.db import init_db
# from backend.app.services.hospital_revenue_ranking import hospital_revenue_bp

# 建议在这里配置一次全局日志
logging.basicConfig(
    level=logging.INFO,  # 需要更详细日志改成 DEBUG
    format='[%(asctime)s] [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)


def create_app():
    app = Flask(__name__)

    # ✅ 先初始化连接池（只初始化这一套）
    logger.info("Initializing DB connection pool...")
    init_db()
    logger.info("DB connection pool initialized.")
    # app.register_blueprint(hospital_revenue_bp, url_prefix='/api/hospital_revenue')
    # ✅ 再注册蓝图
    app.register_blueprint(inpatient_total_revenue_bp, url_prefix="/api/inpatient_total_revenue")
    for rule in app.url_map.iter_rules():
        methods = ",".join(sorted(rule.methods - {"HEAD", "OPTIONS"}))
        print(f"[ROUTE] {rule.rule}  [{methods}] -> {rule.endpoint}")

    @app.route("/health")
    def health():
        return jsonify({"status": "ok"}), 200

    return app


if __name__ == "__main__":
    app = create_app()
    # ⚠️ Windows 下 debug 的自动重载会双进程，容易导致“看起来初始化了，但实际不是同一个模块实例”
    app.run(host="0.0.0.0", port=5010, debug=True, use_reloader=False)
