import React from "react";
import type { RouteObject } from "react-router-dom";
import NotFound from "../pages/NotFound";
import Home from "../pages/home/page";
import Dashboard from "../pages/dashboard/page";
// import OutpatientVisits from "../pages/OutpatientVisits";
// import OutpatientAppointment from "../pages/OutpatientAppointment";
import Page from '../features/inpatientTotalRevenue/page'


const routes: RouteObject[] = [
  {
    path: "/",
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
  {
    path: "/inpatient-total-revenue",
    element: <Page />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;