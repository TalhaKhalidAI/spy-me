import logger from '../utils/logger.js';
import { env } from '../../config/env.js';

/**
 * Global error handling middleware
 */
export const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';

    logger.error('Error 💥:', {
        requestId: req.id,
        message: err.message,
        stack: err.stack,
        path: req.originalUrl,
        method: req.method,
    });

    res.status(statusCode).json({
        status,
        message: err.message || 'Internal Server Error',
        ...(env.NODE_ENV === 'development' && { stack: err.stack }),
        ...(err.errors && { errors: err.errors }),
    });
};

/**
 * Custom error class for API errors
 */
export class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}
