// config.ts
export const axiosConfig = {
  timeout: 60000,
  retryCount: 2,
  refreshEndpoint: '/auth/refresh',
  fallbackUrls: {
    development: '/api/v1',
    production: '/api'
  }
} as const;