import { lazy } from "react"
import { Navigate } from "react-router-dom"
import { withGuest, withAuth } from "@/HOCS/authHocCookies"

const Login = lazy(() => import("../../pages/Login/index"))
const Signup = lazy(() => import("../../pages/Signup/index"))
const NotFound = lazy(() => import("../../pages/NotFound/index"))
const Prs = lazy(() => import("../ProtectedRoute/Slice"))
const SfuTets = lazy(() => import("../../pages/SfuTest/"))
const GuestLogin = withGuest(Login)
const GuestSignup = withGuest(Signup)
const ProtectedSfuTest = withAuth(SfuTets)
const SfuTestPaeg = lazy(() => import("../../pages/SfuClientTest"))
export const routeSlice = [
  {
    path: "/",
    component: () => <Navigate to="/login" replace />,
  },
  {
    path: "/login",
    component: GuestLogin,
  },
  {
    path: "/signup",
    component: GuestSignup,
  },
  {
    path: "/talha/*",
    component: Prs,
  },
  {
    path: "/sfu",
    component: ProtectedSfuTest,
  },
  {
    path: "/client",
    component: SfuTestPaeg,
  },
  {
    path: "*",
    component: NotFound,
  }
]
