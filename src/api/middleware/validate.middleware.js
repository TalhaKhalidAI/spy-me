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
        const errors = error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
        }));

        next(new AppError('Validation Failed', 400));
        // We can attach errors to the AppError if we want more detail in response
    }
};
