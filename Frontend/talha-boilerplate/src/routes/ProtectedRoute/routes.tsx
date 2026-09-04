import { lazy } from "react"
import { hocComponentCookies } from "@/HOCS/authHocCookies"
import { Navigate } from "react-router-dom"

const MainRoute = lazy(() => import("../../pages/SfuTest"))
const ProtectedMainRoute = hocComponentCookies(MainRoute)
const Wrtc = lazy(() => import("../../pages/TestRtc"))
const WrtcP = hocComponentCookies(Wrtc)
const LiveCallRoute = lazy(() => import("../../pages/LiveCall/index"))
const Lcr = hocComponentCookies(LiveCallRoute)
const WsTest2 = lazy(() => import("../../pages/RtcTest2/index"))
const TpR2 = hocComponentCookies(WsTest2)

const AdminUsersRoute = lazy(() => import("../../pages/AdminUsers/index"))
const ProtectedAdminUsers = hocComponentCookies(AdminUsersRoute)

export const routeSlice = [
  {
    path: "dashboard",
    component: ProtectedMainRoute,
  },
  {
    path: "admin/users",
    component: ProtectedAdminUsers,
  },
  {
    path: "live",
    component: Lcr,
  },
  {
    path: "test2",
    component: TpR2,
  },
  {
    path: "",
    component: () => <Navigate to="/sfu" replace />,
  },
  {
    path: "*",
    component: () => <Navigate to="/sfu" replace />,
  }
]
