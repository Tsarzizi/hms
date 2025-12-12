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

 Date: 16/11/2025 18:13:20
*/


-- ----------------------------
-- Table structure for t_workload_outp_f
-- ----------------------------
DROP TABLE IF EXISTS "public"."t_workload_outp_f";
CREATE FOREIGN TABLE "public"."t_workload_outp_f" (
  "rcpt_id" varchar(32) COLLATE "pg_catalog"."default",
  "visit_date" date,
  "visit_no" varchar(32) COLLATE "pg_catalog"."default",
  "rcpt_no" varchar(32) COLLATE "pg_catalog"."default",
  "status_code" varchar(10) COLLATE "pg_catalog"."default",
  "item_no" varchar(20) COLLATE "pg_catalog"."default",
  "item_class" varchar(32) COLLATE "pg_catalog"."default",
  "item_class_name" varchar(20) COLLATE "pg_catalog"."default",
  "class_on_rcpt" varchar(32) COLLATE "pg_catalog"."default",
  "item_code" varchar(32) COLLATE "pg_catalog"."default",
  "item_name" varchar(160) COLLATE "pg_catalog"."default",
  "item_spec" varchar(128) COLLATE "pg_catalog"."default",
  "amount" numeric(10,0),
  "units" varchar(100) COLLATE "pg_catalog"."default",
  "performed_by" varchar(32) COLLATE "pg_catalog"."default",
  "costs" numeric(10,2),
  "charges" numeric(10,2),
  "special_charges" numeric(10,2),
  "ordered_by" varchar(32) COLLATE "pg_catalog"."default",
  "ordered_by_doctor" varchar(32) COLLATE "pg_catalog"."default",
  "patient_id" varchar(64) COLLATE "pg_catalog"."default",
  "patient_name" varchar(128) COLLATE "pg_catalog"."default",
  "trade_price" numeric(10,2),
  "performed_by_doctor" varchar(32) COLLATE "pg_catalog"."default",
  "ward_code" varchar(32) COLLATE "pg_catalog"."default"
)
SERVER "oracle_hiply"
OPTIONS ("schema" 'HIPLY', "table" 'DRG_OUTP_BILL_ITEMS')
;
