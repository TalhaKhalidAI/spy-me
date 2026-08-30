// src/api/http/https.ts

import axios, { type AxiosRequestConfig } from "axios"
import axiosRetry from "axios-retry"
import { validateUrl } from "./schema"
import { axiosConfig } from "./config"
import { ToastMsgs } from "../toastUtils"
import { useAuthStore } from "../../store/authStore"
import { getErrorMessage } from "./errorHandler"

// Extend Axios types
declare module 'axios' {
  interface AxiosRequestConfig {
    skipToast?: boolean;
  }
}

const API_URL = import.meta.env.VITE_API_URL

// Get validated URL with fallback
const getValidatedApiUrl = (): string => {
  try {
    return validateUrl(API_URL)
  } catch (err) {
    ToastMsgs.error(`Invalid API URL in environment configuration`)
    console.error('Invalid API URL:', err)

    const fallback = import.meta.env.DEV
      ? axiosConfig.fallbackUrls.development
      : axiosConfig.fallbackUrls.production

    console.log(`Using fallback: ${fallback}`)
    return fallback
  }
}

// ============================================
// ✅ CREATE AXIOS INSTANCE - COOKIE READY
// ============================================
export const axiosInstance = axios.create({
  baseURL: getValidatedApiUrl(),
  timeout: axiosConfig.timeout,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  withCredentials: true,  // ✅ THIS sends cookies automatically!
})

// ============================================
// ✅ RETRY LOGIC (Network errors only)
// ============================================
axiosRetry(axiosInstance, {
  retries: axiosConfig.retryCount,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    return axiosRetry.isNetworkError(error) ||
      (error.response?.status || 0) >= 500
  }
})

// ============================================
// ✅ REQUEST INTERCEPTOR - TOKEN AUTH
// ============================================
axiosInstance.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    config.headers['X-Request-ID'] = crypto.randomUUID?.() || Date.now().toString();
    config.headers['X-App-Version'] = import.meta.env.VITE_APP_VERSION || '1.0.0';

    // ✅ Debug log
    console.log('📤 Request:', {
      url: config.url,
      method: config.method,
      hasToken: !!token,
    });

    return config;
  },
  (error) => Promise.reject(error)
);

// ============================================
// ✅ RESPONSE INTERCEPTOR
// ============================================
axiosInstance.interceptors.response.use(
  (response) => {
    // Success toasts
    const url = response.config.url || '';
    const isAuthRoute = url.includes('/auth/');
    
    if (!response.config.skipToast && !isAuthRoute) {
      const method = response.config.method?.toUpperCase()
      const successMessages: Record<string, string> = {
        'POST': 'Created successfully',
        'PUT': 'Updated successfully',
        'DELETE': 'Deleted successfully',
        'PATCH': 'Updated successfully'
      }

      const message = successMessages[method || '']
      if (message && response.status >= 200 && response.status < 300) {
        ToastMsgs.success(message)
      }
    }
    return response
  },
  async (error) => {
    const originalRequest = error.config
    const url = originalRequest?.url || ''

    // ============================================
    // 1️⃣ NETWORK ERROR
    // ============================================
    if (!error.response) {
      if (!originalRequest?.skipToast) {
        ToastMsgs.error('Network error. Please check your connection.')
      }
      return Promise.reject({
        status: 0,
        message: 'Network error. Please check your connection.',
        code: 'NETWORK_ERROR'
      })
    }

    const status = error.response?.status
    const data = error.response?.data

    // ============================================
    // 2️⃣ USE YOUR ERROR HANDLER ✅
    // ============================================
    const finalMessage = getErrorMessage(status, data)

    // ============================================
    // 3️⃣ SMART 401/422 HANDLING - Cookie Auth
    // ============================================
    // ✅ Handle BOTH 401 AND 422 as unauthorized
    if (status === 401 || status === 422) {
      // Login endpoint - return invalid credentials
      if (url.includes('/login')) {
        if (!originalRequest?.skipToast) {
          ToastMsgs.error(finalMessage || 'Invalid username or password.')
        }
        return Promise.reject({
          status: status,
          message: finalMessage || 'Invalid username or password.',
          code: 'INVALID_CREDENTIALS',
          data: data
        })
      }

      // ✅ Handle /users/me - treat 422 as session expired
      if (url.includes('/me')) {
        const path = window.location.pathname;
        if (!path.includes('/login') && !path.includes('/signup')) {
          handleLogout()
          ToastMsgs.error('Session expired. Please login again.')
        }
        return Promise.reject({
          status: status,
          message: 'Session expired',
          code: 'SESSION_EXPIRED',
          data: data
        })
      }

      // ✅ Any other 401/422 - session expired
      const path = window.location.pathname;
      if (!path.includes('/login') && !path.includes('/signup')) {
        handleLogout()
        ToastMsgs.error('Session expired. Please login again.')
      }
      return Promise.reject({
        status: status,
        message: 'Session expired',
        code: 'SESSION_EXPIRED',
        data: data
      })
    }

    // ============================================
    // 4️⃣ SHOW TOAST ERROR (for non-auth errors)
    // ============================================
    if (!originalRequest?.skipToast) {
      ToastMsgs.error(finalMessage)
    }

    // ============================================
    // 5️⃣ RETURN ERROR WITH ORIGINAL DATA
    // ============================================
    return Promise.reject({
      status: status,
      message: finalMessage,
      data: data,
      code: data?.code || 'UNKNOWN_ERROR',
      response: error.response,
      detail: data?.detail,
    })
  }
)

// axiosInstance.interceptors.response.use(
//   (response) => {
//     // Success toasts
//     if (!response.config.skipToast) {
//       const method = response.config.method?.toUpperCase()
//       const successMessages: Record<string, string> = {
//         'POST': 'Created successfully',
//         'PUT': 'Updated successfully',
//         'DELETE': 'Deleted successfully',
//         'PATCH': 'Updated successfully'
//       }

//       const message = successMessages[method || '']
//       if (message && response.status >= 200 && response.status < 300) {
//         ToastMsgs.success(message)
//       }
//     }
//     return response
//   },
//   async (error) => {
//     const originalRequest = error.config
//     const url = originalRequest?.url || ''

//     // ============================================
//     // 1️⃣ NETWORK ERROR
//     // ============================================
//     if (!error.response) {
//       if (!originalRequest?.skipToast) {
//         ToastMsgs.error('Network error. Please check your connection.')
//       }
//       return Promise.reject({
//         status: 0,
//         message: 'Network error. Please check your connection.',
//         code: 'NETWORK_ERROR'
//       })
//     }

//     const status = error.response?.status
//     const data = error.response?.data

//     // ============================================
//     // 2️⃣ USE YOUR ERROR HANDLER ✅
//     // ============================================
//     const finalMessage = getErrorMessage(status, data)

//     // ============================================
//     // 3️⃣ SMART 401 HANDLING - Cookie Auth
//     // ============================================
//     if (status === 401) {
//       // Login endpoint
//       if (url.includes('/login')) {
//         if (!originalRequest?.skipToast) {
//           ToastMsgs.error(finalMessage || 'Invalid username or password.')
//         }
//         return Promise.reject({
//           status: 401,
//           message: finalMessage || 'Invalid username or password.',
//           code: 'INVALID_CREDENTIALS',
//           data: data
//         })
//       }

//       // ✅ Session expired - cookie is invalid
//       if (!window.location.pathname.includes('/login')) {
//         handleLogout()
//         ToastMsgs.error('Session expired. Please login again.')
//       }
//       return Promise.reject({
//         status: 401,
//         message: 'Session expired',
//         code: 'SESSION_EXPIRED',
//         data: data
//       })
//     }

//     // ============================================
//     // 4️⃣ SHOW TOAST ERROR
//     // ============================================
//     if (!originalRequest?.skipToast) {
//       ToastMsgs.error(finalMessage)
//     }

//     // ============================================
//     // 5️⃣ RETURN ERROR WITH ORIGINAL DATA
//     // ============================================
//     return Promise.reject({
//       status: status,
//       message: finalMessage,
//       data: data,
//       code: data?.code || 'UNKNOWN_ERROR',
//       response: error.response,
//       detail: data?.detail,
//     })
//   }
// )

// ============================================
// ✅ LOGOUT HELPER - Clears session
// ============================================
export const handleLogout = async () => {
  try {
    await axiosInstance.post('/auth/logout', {}, { skipToast: true });
  } catch (err) {
    // Ignore error if session is already expired/invalid
  } finally {
    useAuthStore.getState().logout();
    const path = window.location.pathname;
    if (!path.includes('/login') && !path.includes('/signup')) {
      window.location.href = '/login';
    }
  }
};

// ============================================
// ✅ HTTP WRAPPER
// ============================================
export const http = {
  get: <T = unknown>(url: string, config?: AxiosRequestConfig) =>
    axiosInstance.get<T>(url, config).then(res => res.data),

  post: <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    axiosInstance.post<T>(url, data, config).then(res => res.data),

  put: <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    axiosInstance.put<T>(url, data, config).then(res => res.data),

  patch: <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    axiosInstance.patch<T>(url, data, config).then(res => res.data),

  delete: <T = unknown>(url: string, config?: AxiosRequestConfig) =>
    axiosInstance.delete<T>(url, config).then(res => res.data),

  instance: axiosInstance,
}

// ============================================
// ✅ DEV LOGGING
// ============================================
if (import.meta.env.DEV) {
  axiosInstance.interceptors.request.use(
    (config) => {
      console.group(`🌐 ${config.method?.toUpperCase()} ${config.url}`)
      console.log('Headers:', config.headers)
      console.log('Data:', config.data)
      console.groupEnd()
      return config
    }
  )

  axiosInstance.interceptors.response.use(
    (response) => {
      console.log(`✅ ${response.status} ${response.config.url}`)
      return response
    },
    (error) => {
      console.error(`❌ ${error.response?.status || 'Network'} ${error.config?.url}`)
      console.error('Error:', error.message)
      return Promise.reject(error)
    }
  )
}