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

 Date: 19/11/2025 16:40:13
*/


-- ----------------------------
-- Table structure for t_workload_inbed_reg_f
-- ----------------------------
DROP TABLE IF EXISTS "public"."t_workload_inbed_reg_f";
CREATE FOREIGN TABLE "public"."t_workload_inbed_reg_f" (
  "mdtrt_id" varchar(30) COLLATE "pg_catalog"."default",
  "hosp_code" varchar(30) COLLATE "pg_catalog"."default",
  "patn_id" varchar(30) COLLATE "pg_catalog"."default",
  "patn_name" varchar(50) COLLATE "pg_catalog"."default",
  "gend" varchar(3) COLLATE "pg_catalog"."default",
  "brdy" varchar(20) COLLATE "pg_catalog"."default",
  "psn_age" varchar(20) COLLATE "pg_catalog"."default",
  "idcard" varchar(20) COLLATE "pg_catalog"."default",
  "is_rcmc" varchar(20) COLLATE "pg_catalog"."default",
  "patn_code" varchar(30) COLLATE "pg_catalog"."default",
  "poolarea" varchar(10) COLLATE "pg_catalog"."default",
  "insutype" varchar(10) COLLATE "pg_catalog"."default",
  "psn_type" varchar(10) COLLATE "pg_catalog"."default",
  "hi_paymtd" varchar(10) COLLATE "pg_catalog"."default",
  "mdtrt_code" varchar(30) COLLATE "pg_catalog"."default",
  "dept_code" varchar(30) COLLATE "pg_catalog"."default",
  "dept_name" varchar(30) COLLATE "pg_catalog"."default",
  "resi_dr_code" varchar(30) COLLATE "pg_catalog"."default",
  "resi_dr_name" varchar(30) COLLATE "pg_catalog"."default",
  "atten_dr_code" varchar(30) COLLATE "pg_catalog"."default",
  "atten_dr_name" varchar(30) COLLATE "pg_catalog"."default",
  "wardarea_code" varchar(30) COLLATE "pg_catalog"."default",
  "wardarea_name" varchar(30) COLLATE "pg_catalog"."default",
  "bedno" varchar(30) COLLATE "pg_catalog"."default",
  "adm_date" date,
  "inbed_status" varchar(30) COLLATE "pg_catalog"."default",
  "dscg_date" date,
  "act_ipt_days" numeric(10,0),
  "adm_dept_code" varchar(30) COLLATE "pg_catalog"."default",
  "adm_dept_name" varchar(30) COLLATE "pg_catalog"."default",
  "adm_wardarea_code" varchar(30) COLLATE "pg_catalog"."default",
  "adm_wardarea_name" varchar(30) COLLATE "pg_catalog"."default",
  "dscg_dept_code" varchar(30) COLLATE "pg_catalog"."default",
  "dscg_dept_name" varchar(30) COLLATE "pg_catalog"."default",
  "dscg_wardarea_code" varchar(30) COLLATE "pg_catalog"."default",
  "dscg_wardarea_name" varchar(30) COLLATE "pg_catalog"."default",
  "med_type" varchar(6) COLLATE "pg_catalog"."default",
  "matn_stas" varchar(3) COLLATE "pg_catalog"."default",
  "dscg_way" varchar(3) COLLATE "pg_catalog"."default",
  "days_rinp_flag_31" varchar(10) COLLATE "pg_catalog"."default"
)
SERVER "oracle_hiply"
OPTIONS ("schema" 'HIPDRGS', "table" 'V_DATA_INBED_REG')
;
