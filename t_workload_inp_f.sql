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

 Date: 16/11/2025 12:09:57
*/


-- ----------------------------
-- Table structure for t_workload_inp_f
-- ----------------------------
DROP TABLE IF EXISTS "public"."t_workload_inp_f";
CREATE FOREIGN TABLE "public"."t_workload_inp_f" (
  "rcpt_id" varchar(32) COLLATE "pg_catalog"."default",
  "patient_id" varchar(32) COLLATE "pg_catalog"."default",
  "visit_id" varchar(32) COLLATE "pg_catalog"."default",
  "fee_type" varchar(8) COLLATE "pg_catalog"."default",
  "status_code" varchar(10) COLLATE "pg_catalog"."default",
  "item_no" varchar(20) COLLATE "pg_catalog"."default",
  "item_class" varchar(32) COLLATE "pg_catalog"."default",
  "item_class_name" varchar(20) COLLATE "pg_catalog"."default",
  "item_name" varchar(160) COLLATE "pg_catalog"."default",
  "item_code" varchar(32) COLLATE "pg_catalog"."default",
  "item_spec" varchar(128) COLLATE "pg_catalog"."default",
  "amount" numeric(10,0),
  "units" varchar(8000) COLLATE "pg_catalog"."default",
  "patient_in_dept" varchar(32) COLLATE "pg_catalog"."default",
  "out_area_code" varchar(20) COLLATE "pg_catalog"."default",
  "ordered_by" varchar(32) COLLATE "pg_catalog"."default",
  "performed_by" varchar(32) COLLATE "pg_catalog"."default",
  "costs" numeric(10,2),
  "charges" numeric(10,2),
  "billing_date_time" date,
  "rcpt_date" date,
  "operator_no" varchar(32) COLLATE "pg_catalog"."default",
  "rcpt_no" varchar(20) COLLATE "pg_catalog"."default",
  "special_charges" numeric(10,2),
  "class_on_inp_rcpt" varchar(32) COLLATE "pg_catalog"."default",
  "subj_code" varchar(32) COLLATE "pg_catalog"."default",
  "class_on_mr" varchar(32) COLLATE "pg_catalog"."default",
  "item_price" numeric(10,2),
  "price_quotiety" varchar(32) COLLATE "pg_catalog"."default",
  "discharge_taking_indicator" varchar(10) COLLATE "pg_catalog"."default",
  "ward_code" varchar(32) COLLATE "pg_catalog"."default",
  "class_on_reckoning" varchar(32) COLLATE "pg_catalog"."default",
  "order_group" varchar(32) COLLATE "pg_catalog"."default",
  "order_doctor" varchar(32) COLLATE "pg_catalog"."default",
  "perform_group" varchar(32) COLLATE "pg_catalog"."default",
  "perform_doctor" varchar(32) COLLATE "pg_catalog"."default",
  "convey_date" varchar(10) COLLATE "pg_catalog"."default",
  "doctor_user" varchar(32) COLLATE "pg_catalog"."default",
  "refund_item_no" varchar(10) COLLATE "pg_catalog"."default",
  "patient_name" varchar(128) COLLATE "pg_catalog"."default",
  "doctor_in_charge" varchar(32) COLLATE "pg_catalog"."default",
  "trade_price" numeric(10,2),
  "basic_drugs_type" varchar(100) COLLATE "pg_catalog"."default",
  "hosp_no" varchar(64) COLLATE "pg_catalog"."default"
)
SERVER "oracle_hiply"
OPTIONS ("schema" 'HIPLY', "table" 'DRG_INP_BILL_DETAIL')
;
