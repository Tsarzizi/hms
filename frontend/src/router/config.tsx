import React from "react";
import type { RouteObject } from "react-router-dom";
import NotFound from "../pages/NotFound";
import Home from "../pages/home/page";
import Dashboard from "../pages/dashboard/page";
// import OutpatientVisits from "../pages/OutpatientVisits";
// import OutpatientAppointment from "../pages/OutpatientAppointment";
import InpatientTotalRevenuePage from '../features/hospital-revenue/inpatientTotalRevenue/page'
import OutpatientTotalRevenuePage from "../pages/outpatientTotalRevenue.tsx";
import DepartmentWorkloadPerformance from "../pages/DepartmentWorkloadPerformance";
import LoginPage from "../pages/Login"; // 假设你的登录页面组件路径

const routes: RouteObject[] = [
  {
    path: "/",
    element: <LoginPage />,
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/home",
    element: <Home />,
  },
  {
    path: "/dashboard",
    element: <Dashboard />,
  },
  // {
  //   path: "/outpatient-visits",
  //   element: <OutpatientVisits />,
  // },
  // {
  //   path: "/outpatient-appointment",
  //   element: <OutpatientAppointment />,
  // },
/*  {
    path: "/department-workload-performance",
    element: <DepartmentWorkloadPerformance />,
  },

  {
    path: "/inpatient-total-revenue",
    element: <InpatientTotalRevenuePage />,
  },
  {
    path: "/outpatient-total-revenue",
    element: <OutpatientTotalRevenuePage />,
  },*/
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;