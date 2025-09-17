// index.js
import { lazy } from "react";

const BlankPage = lazy(() => import("./Pages/BlankPage"));
const AdminSlice=lazy(()=>import("./Routes/AdminSlice"))
const ClientSlice=lazy(()=>import("./Routes/ClientSlice"))
let NotFound=lazy(()=>import("./Pages/PageNotFound"))
export const pages = [
  {
    path: "/",
    element: <BlankPage />
  },
    {
    path: "/admin/*",
    element: <AdminSlice />
  },
    {
    path: "/client/*",
    element: <ClientSlice />
  },
  {
    path:"*",
    element:<NotFound/>
  }
];
