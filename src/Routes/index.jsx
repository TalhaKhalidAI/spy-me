import { lazy } from "react"
let AdminPage=lazy(()=>import("../Pages/AdminPanel"))
let ClientPage=lazy(()=>import("../Pages/ClientConfig"))
let NotFound=lazy(()=>import("../Pages/PageNotFound"))
 
export const slicePage = [
  {
    path: "config",
    element: AdminPage,
  },
  {
    path: "*",
    element: NotFound,
  },
];

export const ClientPages = [
  {
    path: "config",
    element: ClientPage,
  },
   
  {
    path: "*",
    element: NotFound,
  },
];