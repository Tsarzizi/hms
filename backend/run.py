import logging
from flask import Flask, jsonify
from app.routes.inpatient_total_revenue_routes import bp as inpatient_total_revenue_bp
from app.department_workload_performance import bp as department_workload_performance_bp  # ⭐ 新增
from app.utils.db import init_db

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)


def create_app():
    app = Flask(__name__)

    logger.info("Initializing DB connection pool...")
    init_db()
    logger.info("DB connection pool initialized.")

    # 原有蓝图
    app.register_blueprint(inpatient_total_revenue_bp, url_prefix="/api/inpatient_total_revenue")

    # ⭐ 新增：科室工作量绩效蓝图（已经在文件里自带 url_prefix）
    # 注意：department_workload_performance 这个 bp 里已经写了 url_prefix="/api/department_workload_performance"
    # 所以这里只用 register_blueprint，不要再传 url_prefix，避免重复 /api/api/...
    app.register_blueprint(department_workload_performance_bp, url_prefix="/api/department_workload_performance", )

    for rule in app.url_map.iter_rules():
        methods = ",".join(sorted(rule.methods - {"HEAD", "OPTIONS"}))
        print(f"[ROUTE] {rule.rule}  [{methods}] -> {rule.endpoint}")

    @app.route("/health")
    def health():
        return jsonify({"status": "ok"}), 200

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=5010, debug=True, use_reloader=False)
