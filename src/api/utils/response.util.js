/**
 * Formats API success responses consistently
 * @param {import('express').Response} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {any} data - Data to send in response
 * @param {string} [message] - Optional message
 */
export const sendSuccess = (res, statusCode, data, message) => {
    res.status(statusCode).json({
        status: 'success',
        ...(message && { message }),
        data,
    });
};

/**
 * Higher-order function to catch async errors in controllers
 * @param {Function} fn - Async controller function
 * @returns {Function} - Express route handler
 */
export const catchAsync = (fn) => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};
