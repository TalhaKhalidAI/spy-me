import { type ComponentType } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export const hocComponent = <P extends object>(
  Component: ComponentType<P>
) => {
  const Wrapper = (props: P) => {
    const token = useAuthStore((state) => state.token);

    if (!token) {
      return <Navigate to="/login" replace />;
    }

    return <Component {...props} />;
  };

  Wrapper.displayName = `HOC(${Component.displayName || Component.name || 'Component'})`;
  return Wrapper;
};
