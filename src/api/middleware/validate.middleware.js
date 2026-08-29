import { AppError } from './error.middleware.js';

/**
 * Middleware to validate request against search schema
 * @param {Object} schema - Zod schema to validate against
 * @param {string} source - Request part to validate (body, query, params)
 */
export const validate = (schema, source = 'body') => (req, res, next) => {
    try {
        const data = req[source];
        schema.parse(data);
        next();
    } catch (error) {
        if (error.errors && Array.isArray(error.errors)) {
            const errors = error.errors.map(err => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            // You can optionally pass these detailed errors to AppError
            return next(new AppError('Validation Failed', 400));
        }
        return next(new AppError('Validation Error', 400));
    }
};
