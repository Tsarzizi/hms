/*
 Navicat Premium Dump SQL

 Source Server         : HMS
 Source Server Type    : PostgreSQL
 Source Server Version : 160008 (160008)
 Source Host           : 192.168.20.73:5432
 Source Catalog        : miasv2
 Source Schema         : public

 Target Server Type    : PostgreSQL
 Target Server Version : 160008 (160008)
 File Encoding         : 65001

 Date: 22/11/2025 14:31:09
*/


-- ----------------------------
-- Table structure for t_workload_drgs_f
-- ----------------------------
DROP TABLE IF EXISTS "public"."t_workload_drgs_f";
CREATE FOREIGN TABLE "public"."t_workload_drgs_f" (
  "inbed_drgs_id" varchar(20) COLLATE "pg_catalog"."default",
  "inbed_reg_id" varchar(20) COLLATE "pg_catalog"."default",
  "psn_name" varchar(50) COLLATE "pg_catalog"."default",
  "inbed_code" varchar(50) COLLATE "pg_catalog"."default",
  "inbed_days" varchar(6) COLLATE "pg_catalog"."default",
  "age" numeric(4,0),
  "birth_day" date,
  "gender_code" varchar(1) COLLATE "pg_catalog"."default",
  "gender_name" varchar(50) COLLATE "pg_catalog"."default",
  "icd_code" varchar(20) COLLATE "pg_catalog"."default",
  "icd_name" varchar(200) COLLATE "pg_catalog"."default",
  "oper_code" varchar(20) COLLATE "pg_catalog"."default",
  "oper_name" varchar(200) COLLATE "pg_catalog"."default",
  "cc_icd_code" varchar(500) COLLATE "pg_catalog"."default",
  "cc_icd_name" varchar(500) COLLATE "pg_catalog"."default",
  "bill_amt" numeric(10,2),
  "drug_amt" numeric(10,2),
  "mdc_id" numeric(8,0),
  "mdc_code" varchar(50) COLLATE "pg_catalog"."default",
  "mdc_name" varchar(200) COLLATE "pg_catalog"."default",
  "adrg_id" numeric(8,0),
  "adrg_code" varchar(50) COLLATE "pg_catalog"."default",
  "adrg_name" varchar(400) COLLATE "pg_catalog"."default",
  "drgs_id" numeric(4,0),
  "drgs_code" varchar(50) COLLATE "pg_catalog"."default",
  "drgs_name" varchar(200) COLLATE "pg_catalog"."default",
  "is_death" numeric(1,0),
  "doctor_code" varchar(50) COLLATE "pg_catalog"."default",
  "doctor_name" varchar(100) COLLATE "pg_catalog"."default",
  "dep_code" varchar(50) COLLATE "pg_catalog"."default",
  "dep_name" varchar(100) COLLATE "pg_catalog"."default",
  "inbed_days_avg" numeric(6,0),
  "payment_avg" numeric(10,2),
  "bill_dt" date,
  "create_dt" date,
  "status" varchar(8) COLLATE "pg_catalog"."default",
  "modify_dt" varchar(20) COLLATE "pg_catalog"."default",
  "rw" varchar(20) COLLATE "pg_catalog"."default",
  "score" numeric(10,4),
  "death_lev" numeric(16,0),
  "represent_flag" varchar(10) COLLATE "pg_catalog"."default",
  "represent_res" varchar(400) COLLATE "pg_catalog"."default",
  "operating_status" varchar(2) COLLATE "pg_catalog"."default",
  "operating_time" varchar(20) COLLATE "pg_catalog"."default",
  "re_drgs_name" varchar(200) COLLATE "pg_catalog"."default",
  "re_drgs_code" varchar(20) COLLATE "pg_catalog"."default",
  "re_oper_name" varchar(200) COLLATE "pg_catalog"."default",
  "re_oper_code" varchar(20) COLLATE "pg_catalog"."default",
  "re_icd_code" varchar(20) COLLATE "pg_catalog"."default",
  "re_icd_name" varchar(200) COLLATE "pg_catalog"."default",
  "pre_drgs_name" varchar(200) COLLATE "pg_catalog"."default",
  "pre_drgs_code" varchar(20) COLLATE "pg_catalog"."default",
  "pre_oper_name" varchar(200) COLLATE "pg_catalog"."default",
  "pre_oper_code" varchar(20) COLLATE "pg_catalog"."default",
  "pre_icd_code" varchar(20) COLLATE "pg_catalog"."default",
  "pre_icd_name" varchar(200) COLLATE "pg_catalog"."default",
  "case_type" varchar(50) COLLATE "pg_catalog"."default",
  "plan_area" varchar(100) COLLATE "pg_catalog"."default",
  "match_oper" varchar(100) COLLATE "pg_catalog"."default",
  "key_drug_fee" varchar(20) COLLATE "pg_catalog"."default",
  "recliner_fee" numeric(18,4),
  "food_fee" numeric(18,4),
  "excessive_bed_fee" numeric(18,4),
  "cash_pay_fee" numeric(18,4),
  "other_accounts" numeric(18,4),
  "rule_deductions" numeric(18,4),
  "psn_category" varchar(100) COLLATE "pg_catalog"."default",
  "participant_id" varchar(100) COLLATE "pg_catalog"."default",
  "disbursement_dt" varchar(20) COLLATE "pg_catalog"."default",
  "benchmark_points" varchar(20) COLLATE "pg_catalog"."default",
  "cv_st" varchar(20) COLLATE "pg_catalog"."default",
  "case_points" varchar(20) COLLATE "pg_catalog"."default",
  "total_points" varchar(20) COLLATE "pg_catalog"."default",
  "key_drug_points" varchar(20) COLLATE "pg_catalog"."default",
  "dialed_points" varchar(20) COLLATE "pg_catalog"."default",
  "disbursement_points" varchar(20) COLLATE "pg_catalog"."default",
  "point_fee" numeric(18,4),
  "additional_points" numeric(18,4),
  "additional_fee" numeric(18,4),
  "re_drgs_fee" numeric(18,4),
  "pre_yk" numeric(10,4),
  "re_yk" numeric(10,4),
  "outhosp_date" varchar(30) COLLATE "pg_catalog"."default",
  "hosp_id" varchar(30) COLLATE "pg_catalog"."default",
  "si_type_id" varchar(3) COLLATE "pg_catalog"."default",
  "payment_st" varchar(20) COLLATE "pg_catalog"."default",
  "medical_number" varchar(100) COLLATE "pg_catalog"."default",
  "self_amount" varchar(20) COLLATE "pg_catalog"."default",
  "case_rate" numeric(18,4),
  "group_type" varchar(20) COLLATE "pg_catalog"."default",
  "dip_type" varchar(20) COLLATE "pg_catalog"."default",
  "group_result" varchar(20) COLLATE "pg_catalog"."default",
  "reason_type" varchar(20) COLLATE "pg_catalog"."default",
  "reason_detail" varchar(100) COLLATE "pg_catalog"."default",
  "stable_group" varchar(100) COLLATE "pg_catalog"."default",
  "basic_group" varchar(100) COLLATE "pg_catalog"."default",
  "mcc_icd_code" varchar(100) COLLATE "pg_catalog"."default",
  "mcc_icd_name" varchar(100) COLLATE "pg_catalog"."default",
  "except_reason" varchar(100) COLLATE "pg_catalog"."default",
  "bed_day_paytype" varchar(100) COLLATE "pg_catalog"."default",
  "bed_day_memo" varchar(100) COLLATE "pg_catalog"."default",
  "DRG编码" varchar(10) COLLATE "pg_catalog"."default",
  "DRG名称" varchar(100) COLLATE "pg_catalog"."default",
  "初始点数" varchar(10) COLLATE "pg_catalog"."default",
  "基准点数" varchar(10) COLLATE "pg_catalog"."default",
  "差异系数" varchar(10) COLLATE "pg_catalog"."default",
  "费用倍率" varchar(10) COLLATE "pg_catalog"."default",
  "例均费用" varchar(10) COLLATE "pg_catalog"."default",
  "总费用" varchar(10) COLLATE "pg_catalog"."default",
  "统筹支付" varchar(10) COLLATE "pg_catalog"."default",
  "最终点数" varchar(10) COLLATE "pg_catalog"."default",
  "点值" varchar(10) COLLATE "pg_catalog"."default",
  "调节系数" varchar(10) COLLATE "pg_catalog"."default",
  "按DRG清算金额" varchar(20) COLLATE "pg_catalog"."default",
  "按政策调节后DRG清算金额" varchar(20) COLLATE "pg_catalog"."default"
)
SERVER "oracle_ybdb"
OPTIONS ("schema" 'YBDB', "table" 'V_WORKLOAD_DRGS')
;
