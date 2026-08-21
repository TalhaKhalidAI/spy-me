// api/utils/logger.js
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { env } from '../../config/env.js';
import path from 'path';
import fs from 'fs';

const projectRoot = process.cwd();
const logDir = path.join(projectRoot, env.LOG_DIR || 'logs');

// Create logs directory if it doesn't exist
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define log colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

// Custom format for console
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}${info.stack ? '\n' + info.stack : ''}`
  )
);

// Custom format for files (JSON)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Determine log level
const level = () => {
  return env.LOG_LEVEL || (env.NODE_ENV === 'development' ? 'debug' : 'info');
};

// Create transports array
const transports = [
  // Console transport (always on)
  new winston.transports.Console({
    format: consoleFormat,
  }),
];

// Add file transports in ALL environments (so you can see files in dev too)
// Rotating file for all logs
transports.push(
  new DailyRotateFile({
    filename: path.join(logDir, 'application-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: env.NODE_ENV === 'production',
    maxSize: env.LOG_MAX_SIZE || '20m',
    maxFiles: env.LOG_MAX_FILES || '14d',
    format: fileFormat,
    level: 'info',
  })
);

// Separate error log file
transports.push(
  new DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: env.NODE_ENV === 'production',
    maxSize: env.LOG_MAX_SIZE || '20m',
    maxFiles: env.LOG_ERROR_MAX_FILES || '30d',
    format: fileFormat,
    level: 'error',
  })
);

// Audit log for sensitive operations
if (env.ENABLE_AUDIT_LOG) {
  transports.push(
    new DailyRotateFile({
      filename: path.join(logDir, 'audit-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: env.NODE_ENV === 'production',
      maxSize: env.LOG_MAX_SIZE || '20m',
      maxFiles: env.LOG_AUDIT_MAX_FILES || '90d',
      format: fileFormat,
      level: 'info',
    })
  );
}

// Create the base winston logger
const winstonLogger = winston.createLogger({
  level: level(),
  levels,
  format: winston.format.json(),
  transports,
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(logDir, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
    }),
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(logDir, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
    }),
  ],
  exitOnError: false,
});

// Stream for Morgan HTTP logger
export const stream = {
  write: (message) => {
    winstonLogger.http(message.trim());
  },
};

// Simple logger class without context (since you're not using it)
class SimpleLogger {
  error(message, meta = {}) {
    winstonLogger.error(message, meta);
  }

  warn(message, meta = {}) {
    winstonLogger.warn(message, meta);
  }

  info(message, meta = {}) {
    winstonLogger.info(message, meta);
  }

  http(message, meta = {}) {
    winstonLogger.http(message, meta);
  }

  debug(message, meta = {}) {
    winstonLogger.debug(message, meta);
  }
}

// Create and export a single logger instance
const logger = new SimpleLogger();
export default logger;