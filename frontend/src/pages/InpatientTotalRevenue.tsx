// src/pages/InpatientTotalRevenue.tsx
//
// 路由入口：简单转发到 feature 内部的页面组件

import InpatientTotalRevenuePage from "../features/hospital-revenue/inpatientTotalRevenue/Page";

export default function InpatientTotalRevenue() {
  return <InpatientTotalRevenuePage />;
}
