import logging
from flask import Flask, jsonify
from app.shared.db import init_db

# 首先配置日志
logging.basicConfig(
    level=logging.DEBUG,
    format='[%(asctime)s] [%(levelname)s] [%(module)s:%(lineno)d] %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# ====== 新增：导入 DRG 费用分析蓝图 ======
from app.DRG_cost import bp as drg_cost_bp
from app.DRG_efficiency import bp as drg_efficiency_bp

# 然后导入原有蓝图
from app.features.hospital_revenue.inpatient_revenue.inpatient_total_revenue.inpatient_total_revenue_route import \
    bp as inpatient_total_revenue_bp
from app.department_workload_performance import bp as department_workload_performance_bp
from app.doctor_workload_performance import bp as doctor_workload_performance_bp
from app.outpatient_revenue_growth import bp as outpatient_revenue_growth_bp
from app.outpatient_total_revenue import bp as outpatient_total_revenue_bp
from app.outpatient_avg_cost import bp as outpatient_avg_cost_bp
from app.admission_discharge import bp as admission_discharge_bp
from app.outpatient_visits import bp as outpatient_visits_bp
from app.outpatient_revenue_structure import bp as outpatient_revenue_structure_bp
from app.outpatient_cost_analysis import bp as outpatient_cost_analysis_bp
from app.outpatient_avg_drug_cost import bp as outpatient_avg_drug_cost_bp
from app.outpatient_drug_cost_analysis import bp as outpatient_drug_cost_analysis_bp
from app.inpatient_cost_overall import bp as inpatient_cost_overall_bp
from app.inpatient_avg_cost_ratio import bp as inpatient_avg_cost_ratio_bp
from app.avg_bed_day_cost import bp as avg_bed_day_cost_bp
from app.DRG_count import bp as DRG_count_bp

# 尝试导入 outpatient_revenue 蓝图
try:
    from app.outpatient_revenue import bp as outpatient_revenue_bp
    outpatient_imported = True
except ImportError as e:
    logger.error(f"❌ outpatient_revenue 蓝图导入失败: {e}")
    outpatient_imported = False
    outpatient_revenue_bp = None


def create_app():
    app = Flask(__name__)

    logger.info("Initializing DB connection pool...")
    init_db()
    logger.info("DB connection pool initialized.")

    # 原有蓝图
    app.register_blueprint(inpatient_total_revenue_bp, url_prefix="/api/inpatient_total_revenue")
    app.register_blueprint(department_workload_performance_bp, url_prefix="/api/department_workload_performance")
    app.register_blueprint(doctor_workload_performance_bp, url_prefix="/api/doctor_workload_performance")
    app.register_blueprint(outpatient_revenue_growth_bp, url_prefix="/api/revenue-growth-rate")
    app.register_blueprint(outpatient_avg_cost_bp, url_prefix="/api/outpatient-avg-cost")
    app.register_blueprint(outpatient_total_revenue_bp, url_prefix="/api/outpatient-total-revenue")
    app.register_blueprint(admission_discharge_bp, url_prefix="/api/admission-discharge")
    app.register_blueprint(outpatient_visits_bp, url_prefix="/api/outpatient-visits")
    app.register_blueprint(outpatient_revenue_structure_bp, url_prefix="/api/outpatient_revenue_structure")
    app.register_blueprint(outpatient_cost_analysis_bp, url_prefix="/api/outpatient-cost-analysis")
    app.register_blueprint(outpatient_avg_drug_cost_bp, url_prefix="/api/outpatient-avg-drug-cost")
    app.register_blueprint(outpatient_drug_cost_analysis_bp, url_prefix="/api/outpatient-drug-cost-analysis")
    app.register_blueprint(inpatient_cost_overall_bp, url_prefix="/api/inpatient-cost-overall")
    app.register_blueprint(inpatient_avg_cost_ratio_bp, url_prefix="/api/inpatient-avg-cost-ratio")
    app.register_blueprint(avg_bed_day_cost_bp, url_prefix="/api/avg-bed-day-cost")
    app.register_blueprint(DRG_count_bp, url_prefix="/api/drg-count")
    app.register_blueprint(drg_cost_bp, url_prefix="/api/drg-cost")
    app.register_blueprint(drg_efficiency_bp, url_prefix="/api/drg-efficiency")

    # 注册 outpatient_revenue 蓝图（如果导入成功）
    if outpatient_imported and outpatient_revenue_bp:
        app.register_blueprint(outpatient_revenue_bp, url_prefix="/api/outpatient-revenue")
        logger.info("✅ outpatient_revenue 蓝图注册成功")
    else:
        logger.warning("⚠️ outpatient_revenue 蓝图未注册")

    # 打印所有路由
    outpatient_routes = []
    for rule in app.url_map.iter_rules():
        methods = ",".join(sorted(rule.methods - {"HEAD", "OPTIONS"}))
        route_info = f"[ROUTE] {rule.rule}  [{methods}] -> {rule.endpoint}"

        if 'outpatient-revenue' in rule.rule:
            outpatient_routes.append(route_info)
            logger.info(f"🔍 {route_info}")
        else:
            print(route_info)

    if not outpatient_routes:
        logger.warning("⚠️ 没有找到任何 outpatient-revenue 路由")

    @app.route("/health")
    def health():
        return jsonify({"status": "ok"}), 200

    @app.route("/api/debug/routes")
    def debug_routes():
        routes = []
        for rule in app.url_map.iter_rules():
            if rule.endpoint != 'static':
                routes.append({
                    'endpoint': rule.endpoint,
                    'methods': list(rule.methods),
                    'rule': str(rule)
                })
        return jsonify({
            "total_routes": len(routes),
            "outpatient_revenue_registered": outpatient_imported,
            "routes": routes
        })

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=5010, debug=True, use_reloader=False)
