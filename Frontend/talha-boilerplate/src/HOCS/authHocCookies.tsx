// src/HOCS/authHocCookies.tsx

import { type ComponentType, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { http } from "../api/http/https";
import { Box, CircularProgress, Typography } from "@mui/material";

export const withAuth = <P extends object>(
  Component: ComponentType<P>
) => {
  const Wrapper = (props: P) => {
    const { user, isAuthenticated, setAuth, logout } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const [shouldRedirect, setShouldRedirect] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
      let isMounted = true;

      const validateSession = async () => {
        try {
          console.log('🔍 Validating cookie session via /auth/me...');

          const response = await http.get<any>('/auth/me', {
            skipToast: true,
          });

          console.log('✅ Session validated:', response);

          const u = response?.data?.user || response?.user || response?.data || response;

          if (u && (u.id || u.user_id || u.username || u.email)) {
            if (isMounted) {
              setAuth({
                id: String(u.id || u.user_id || ''),
                email: u.email || '',
                name: u.full_name || u.username || u.name || '',
                role: u.role || '',
                permissions: u.permissions || [],
              }, useAuthStore.getState().token || '');
            }
          } else {
            if (isMounted) {
              logout();
              setShouldRedirect(true);
            }
          }
        } catch (error: any) {
          const status = error?.response?.status || error?.status;
          console.error('❌ Session validation failed:', status);

          if (isMounted) {
            logout();
            setShouldRedirect(true);
          }
        } finally {
          if (isMounted) {
            setLoading(false);
          }
        }
      };

      validateSession();

      return () => {
        isMounted = false;
      };
    }, []);

    // ✅ Force redirect if shouldRedirect is true
    useEffect(() => {
      if (!loading && shouldRedirect) {
        console.log('🔒 Force redirecting to login');
        navigate('/login', { replace: true });
      }
    }, [loading, shouldRedirect, navigate]);

    if (loading) {
      return (
        <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#0f0c29', color: 'white' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <CircularProgress color="primary" />
            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
              Verifying session...
            </Typography>
          </Box>
        </Box>
      );
    }

    // ✅ Check if authenticated
    if (!isAuthenticated || !user || shouldRedirect) {
      console.log('🔒 Not authenticated, redirecting to login');
      return <Navigate to="/login" replace state={{ from: location }} />;
    }

    console.log('✅ Authenticated as:', user.name);
    return <Component {...props} />;
  };

  Wrapper.displayName = `withAuth(${Component.displayName || Component.name || 'Component'})`;
  return Wrapper;
};

export const withGuest = <P extends object>(
  Component: ComponentType<P>
) => {
  const Wrapper = (props: P) => {
    const { user, isAuthenticated, setAuth, logout } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [shouldRedirect, setShouldRedirect] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
      let isMounted = true;

      if (isAuthenticated && user) {
        setIsLoggedIn(true);
        setLoading(false);
        return;
      }

      const checkSession = async () => {
        try {
          const response = await http.get<any>('/auth/me', {
            skipToast: true,
          });

          const u = response?.data?.user || response?.user || response?.data || response;
          if (u && (u.id || u.user_id || u.username || u.email)) {
            if (isMounted) {
              setAuth({
                id: String(u.id || u.user_id || ''),
                email: u.email || '',
                name: u.full_name || u.username || u.name || '',
                role: u.role || '',
                permissions: u.permissions || [],
              }, useAuthStore.getState().token || '');
              setIsLoggedIn(true);
            }
          } else {
            if (isMounted) {
              setIsLoggedIn(false);
              logout();
            }
          }
        } catch (error) {
          if (isMounted) {
            setIsLoggedIn(false);
            logout();
          }
        } finally {
          if (isMounted) {
            setLoading(false);
          }
        }
      };

      checkSession();

      return () => {
        isMounted = false;
      };
    }, []);

    // ✅ Force redirect if logged in
    useEffect(() => {
      if (!loading && isLoggedIn) {
        console.log('🔓 Already logged in, redirecting to dashboard');
        navigate('/sfu', { replace: true });
      }
    }, [loading, isLoggedIn, navigate]);

    if (loading) {
      return (
        <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#0f0c29', color: 'white' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <CircularProgress color="primary" />
            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
              Checking session...
            </Typography>
          </Box>
        </Box>
      );
    }

    if (isLoggedIn) {
      console.log('🔓 Already logged in, redirecting to dashboard');
      return <Navigate to="/talha/webrtc" replace />;
    }

    return <Component {...props} />;
  };

  Wrapper.displayName = `withGuest(${Component.displayName || Component.name || 'Component'})`;
  return Wrapper;
};

export const hocComponentCookies = withAuth;