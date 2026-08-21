// config.ts
export const axiosConfig = {
  timeout: 60000,
  retryCount: 2,
  refreshEndpoint: '/auth/refresh',
  fallbackUrls: {
    development: 'http://192.168.100.185:5050/app.v1',
    production: '/api'
  }
} as const;