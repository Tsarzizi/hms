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

 Date: 24/11/2025 16:36:47
*/


-- ----------------------------
-- Table structure for t_workload_drg_bill_detail
-- ----------------------------
DROP TABLE IF EXISTS "public"."t_workload_drg_bill_detail";
CREATE TABLE "public"."t_workload_drg_bill_detail" (
  "序号" int4,
  "mdtrt_id" varchar(30) COLLATE "pg_catalog"."default",
  "结算日期" date,
  "年月" text COLLATE "pg_catalog"."default",
  "参保类型" text COLLATE "pg_catalog"."default",
  "参保地" varchar(10) COLLATE "pg_catalog"."default",
  "转科" varchar(6) COLLATE "pg_catalog"."default",
  "姓名" varchar(50) COLLATE "pg_catalog"."default",
  "drg编码" varchar(50) COLLATE "pg_catalog"."default",
  "drg名称" varchar(200) COLLATE "pg_catalog"."default",
  "总费用" numeric(10,2),
  "总成本" numeric(10,2),
  "医保支付价" numeric(10,2),
  "盈亏" numeric,
  "总费用支付价比" numeric,
  "绩效基数" numeric,
  "治疗方式" text COLLATE "pg_catalog"."default",
  "科室代码" varchar(30) COLLATE "pg_catalog"."default",
  "科室名称" varchar(30) COLLATE "pg_catalog"."default",
  "药品总费用" numeric(16,2),
  "服务项目总费用" numeric(16,2),
  "耗材总费用" numeric(16,2),
  "基准点数" varchar(10) COLLATE "pg_catalog"."default",
  "点值" varchar(10) COLLATE "pg_catalog"."default",
  "差异系数" varchar(10) COLLATE "pg_catalog"."default",
  "费用发生科室" varchar(32) COLLATE "pg_catalog"."default",
  "费用科室名称" varchar COLLATE "pg_catalog"."default",
  "科室总费用" numeric,
  "费用占比" numeric,
  "科室总治疗成本" numeric,
  "科室成本费用比" numeric,
  "化验费" numeric(12,2),
  "床位费" numeric(12,2),
  "治疗费" numeric(12,2),
  "西药费" numeric(12,2),
  "材料费" numeric(12,2),
  "肺功能检查" numeric(12,2),
  "放射费" numeric(12,2),
  "手术费" numeric(12,2),
  "诊查费" numeric(12,2),
  "CT" numeric(12,2),
  "中药费" numeric(12,2),
  "护理费" numeric(12,2),
  "输氧费" numeric(12,2),
  "医疗废物" numeric(12,2),
  "脑电图" numeric(12,2),
  "高值耗材" numeric(12,2),
  "康复治疗" numeric(12,2),
  "彩超费" numeric(12,2),
  "核磁共振" numeric(12,2),
  "心电图" numeric(12,2),
  "麻醉费" numeric(12,2),
  "肠镜" numeric(12,2),
  "血费" numeric(12,2),
  "病理" numeric(12,2),
  "草药费" numeric(12,2),
  "胃镜" numeric(12,2),
  "病理外检" numeric(12,2),
  "科室检查" numeric(12,2),
  "检验外检" numeric(12,2),
  "肾透析" numeric(12,2),
  "救护车" numeric(12,2),
  "其他" numeric(12,2),
  "resi_dr_code" varchar(30) COLLATE "pg_catalog"."default",
  "doctor_code" varchar(20) COLLATE "pg_catalog"."default",
  "doctor_name" varchar(20) COLLATE "pg_catalog"."default",
  "绩效" numeric(20,0)
)
;

-- ----------------------------
-- Indexes structure for table t_workload_drg_bill_detail
-- ----------------------------
CREATE INDEX "idx_drg_mdtrt_id" ON "public"."t_workload_drg_bill_detail" USING btree (
  "mdtrt_id" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);
