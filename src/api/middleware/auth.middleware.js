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

/**
 * Middleware to restrict access based on fine-grained permissions
 * @param {string} permission - The required permission name
 */
export const requirePermission = (permission) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new AppError('You are not logged in', 401));
        }

        // Admin inherently has all permissions
        if (req.user.role === 'ADMIN') {
            return next();
        }

        const userPermissions = req.user.permissions?.map(p => p.name) || [];

        if (!userPermissions.includes(permission)) {
            return next(new AppError(`You do not have the required permission: ${permission}`, 403));
        }

        next();
    };
};
