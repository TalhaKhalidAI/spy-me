// config/env.js
import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load .env file
dotenv.config({ path: path.join(process.cwd(), '.env') });

// Define Zod schema
const envSchema = z.object({
  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
 RATE_LIMIT_MAX: z.coerce.number().min(1).max(10000).default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().min(1000).max(3600000).default(900000),
  // Logger Configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  ENABLE_AUDIT_LOG: z.coerce.boolean().default(false),
  LOG_MAX_SIZE: z.string().default('20m'),
  LOG_MAX_FILES: z.string().default('14d'),
  LOG_ERROR_MAX_FILES: z.string().default('30d'),
  LOG_AUDIT_MAX_FILES: z.string().default('90d'),
  LOG_DIR: z.string().default('logs'),
  RTC_MIN_PORT: z.coerce.number().min(1024).max(65535).default(2000),
  RTC_MAX_PORT: z.coerce.number().min(1024).max(65535).default(3000),
  // SSL Configuration
  HTTPS_ENABLED: z.coerce.boolean().default(true),
  SSL_KEY_PATH: z.string().default('./src/certs/status.lab.mli.key'),
  SSL_CERT_PATH: z.string().default('./src/certs/status.lab.mli.crt'),
  // Database Configuration
  DATABASE_URL: z.string().url('Invalid database URL format'),
  DATABASE_POOL_MAX: z.coerce.number().min(1).max(100).default(20),
  DATABASE_POOL_TIMEOUT: z.coerce.number().min(1).max(60).default(10),

  // Server Configuration
  PORT: z.coerce.number().min(1).max(65535).default(3000),
  API_VERSION: z.string().default('v1'),

  // Security & JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // OAuth Configuration
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional(),

  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_CALLBACK_URL: z.string().optional(),

  // Admin Configuration
  ADMIN_USERNAME: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().min(8).default('admin12345'),
  ADMIN_EMAIL: z.string().email().default('admin@example.com'),

  // CORS
  CORS_ORIGIN: z.string().default('*'),
});

// Parse environment variables
const parseEnv = () => {
  try {
    const env = envSchema.parse({
      RATE_LIMIT_MAX:process.env.RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_MS:process.env.RATE_LIMIT_WINDOW_MS,
      LOG_LEVEL: process.env.LOG_LEVEL,
      RTC_MIN_PORT: process.env.RTC_MIN_PORT || process.env.LOG_MIN_PORT,
      RTC_MAX_PORT: process.env.RTC_MAX_PORT || process.env.LOG_MAX_PORT,
      NODE_ENV: process.env.NODE_ENV,
      HTTPS_ENABLED: process.env.HTTPS_ENABLED,
      SSL_KEY_PATH: process.env.SSL_KEY_PATH,
      SSL_CERT_PATH: process.env.SSL_CERT_PATH,
      ENABLE_AUDIT_LOG: process.env.ENABLE_AUDIT_LOG,
      LOG_MAX_SIZE: process.env.LOG_MAX_SIZE,
      LOG_MAX_FILES: process.env.LOG_MAX_FILES,
      LOG_ERROR_MAX_FILES: process.env.LOG_ERROR_MAX_FILES,
      LOG_AUDIT_MAX_FILES: process.env.LOG_AUDIT_MAX_FILES,
      LOG_DIR: process.env.LOG_DIR,
      DATABASE_URL: process.env.DATABASE_URL,
      DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX,
      DATABASE_POOL_TIMEOUT: process.env.DATABASE_POOL_TIMEOUT,
      PORT: process.env.PORT,
      API_VERSION: process.env.API_VERSION,
      JWT_SECRET: process.env.JWT_SECRET,
      JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
      JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL,
      GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
      GITHUB_CALLBACK_URL: process.env.GITHUB_CALLBACK_URL,
      ADMIN_USERNAME: process.env.ADMIN_USERNAME,
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
      ADMIN_EMAIL: process.env.ADMIN_EMAIL,
      CORS_ORIGIN: process.env.CORS_ORIGIN,
    });

    if (env.NODE_ENV === 'development') {
      console.log('✅ Environment variables validated successfully');
      console.log(`📊 DATABASE_URL: ${maskDatabaseUrl(env.DATABASE_URL)}`);
    }

    return env;
  } catch (error) {
    console.error('❌ Environment validation failed:');

    if (error instanceof z.ZodError) {
      error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    } else if (error instanceof Error) {
      console.error(`  - ${error.message}`);
    } else {
      console.error(`  - Unknown error:`, error);
    }

    console.error('\n⚠️  Please check your .env file and try again.');
    process.exit(1);
  }
};

// Helper to mask database URL for logging
// ✅ CORRECT - Added function name 'maskDatabaseUrl'
function maskDatabaseUrl(url) {
  try {
    return url.replace(/:[^:@]*@/, ':***@');
  } catch {
    return 'invalid-url';
  }
}

export const env = parseEnv();
export const isDevelopment = () => env.NODE_ENV === 'development';
export const isProduction = () => env.NODE_ENV === 'production';
export const isTest = () => env.NODE_ENV === 'test';
export default env;