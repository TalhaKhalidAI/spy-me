import { prisma } from '../../config/databases.js';
import { PasswordService } from '../../services/password.service.js';
import { generateAuthTokens, verifyToken } from '../utils/jwt.util.js';
import { AppError } from '../middleware/error.middleware.js';
import { env } from '../../config/env.js';
import { catchAsync, sendSuccess } from '../utils/response.util.js';
import logger from '../utils/logger.js';

export const register = catchAsync(async (req, res, next) => {
    const { email, password, username, firstName, lastName } = req.body;

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
        return next(new AppError('Email already in use', 400));
    }

    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) {
        return next(new AppError('Username already taken', 400));
    }

    const hashedPassword = await PasswordService.hash(password);

    const user = await prisma.user.create({
        data: {
            email,
            password: hashedPassword,
            username,
            firstName,
            lastName,
            provider: 'local',
        },
    });

    const tokens = generateAuthTokens(user);

    logger.info(`User registered: ${user.email}`);

    sendSuccess(res, 201, {
        user: {
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role,
        },
        ...tokens,
    });
});

export const login = catchAsync(async (req, res, next) => {
    const tokens = generateAuthTokens(req.user);

    logger.info(`User logged in: ${req.user.email}`);

    sendSuccess(res, 200, {
        user: {
            id: req.user.id,
            email: req.user.email,
            username: req.user.username,
            role: req.user.role,
        },
        ...tokens,
    });
});

export const getMe = catchAsync(async (req, res) => {
    sendSuccess(res, 200, {
        user: {
            id: req.user.id,
            email: req.user.email,
            username: req.user.username,
            role: req.user.role,
            firstName: req.user.firstName,
            lastName: req.user.lastName,
            avatar: req.user.avatar,
        },
    });
});

export const refreshToken = catchAsync(async (req, res, next) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return next(new AppError('Refresh token is required', 400));
    }

    const decoded = verifyToken(refreshToken, env.JWT_REFRESH_SECRET);
    const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
    });

    if (!user || !user.isActive) {
        return next(new AppError('User not found or inactive', 401));
    }

    const tokens = generateAuthTokens(user);

    sendSuccess(res, 200, {
        ...tokens,
    });
});
