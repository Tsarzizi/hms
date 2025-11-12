# inpatient_total_revenue (psycopg2)

后端：Flask + psycopg2 直连 PostgreSQL。所有 API 与文件名统一前缀 **inpatient_total_revenue**。

## 目录
- `app/routes/inpatient_total_revenue_routes.py`
- `app/services/inpatient_total_revenue_service.py`
- `app/services/inpatient_total_revenue_meta.py`
- `app/utils/inpatient_total_revenue_db.py` (psycopg2 连接池)
- `app/utils/inpatient_total_revenue_validators.py`
- `app/utils/inpatient_total_revenue_numbers.py`
- `run.py`

## 环境变量（.env）
- PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE

## 安装与启动
```bash
pip install -r requirements.txt
python run.py
```

## API

### 初始化元数据
GET `/api/inpatient_total_revenue/init`
返回科室、医生、默认日期（最新 rcpt_date 兜底为 CURRENT_DATE-1）。

### 收入汇总
POST `/api/inpatient_total_revenue/summary`
- 必填：`start_date`, `end_date`
- 可选：`department`（科室编码）

返回：本期/去年同期收入与增长率，及与床位趋势方向的比较（床位来自 `t_workload_inbed_reg_f` + `t_dep_count_inbed<今天` 联合，仅用于趋势判断）。

### 自动初始化
GET /api/inpatient_total_revenue/init_full -> 返回科室、医生、默认日期（最新一天）以及该日期的汇总数据（全院）。