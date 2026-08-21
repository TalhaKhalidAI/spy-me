import { AppError } from './error.middleware.js';

/**
 * Middleware to restrict access based on user roles
 * @param {...string} roles - Allowed roles
 */
export const authorize = (...roles) => {
    return (req, res, next) => {
        // req.user is populated by passport
        if (!req.user) {
            return next(new AppError('You are not logged in', 401));
        }

        if (!roles.includes(req.user.role)) {
            return next(new AppError('You do not have permission to perform this action', 403));
        }

        next();
    };
};
