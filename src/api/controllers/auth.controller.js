import { prisma } from '../../config/databases.js';
import { PasswordService } from '../../services/password.service.js';
import { generateAuthTokens, verifyToken } from '../utils/jwt.util.js';
import { AppError } from '../middleware/error.middleware.js';
import { env } from '../../config/env.js';
import { catchAsync, sendSuccess } from '../utils/response.util.js';
import logger from '../utils/logger.js';
import jwt from 'jsonwebtoken';

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
            permissions: {
                connectOrCreate: [
                    { where: { name: 'permission.room.view' }, create: { name: 'permission.room.view', description: 'View available rooms' } },
                    { where: { name: 'permission.room.create' }, create: { name: 'permission.room.create', description: 'Create new rooms' } },
                    { where: { name: 'permission.room.update' }, create: { name: 'permission.room.update', description: 'Update existing room details' } },
                    { where: { name: 'permission.room.delete' }, create: { name: 'permission.room.delete', description: 'Delete rooms' } },
                    { where: { name: 'permission.sfu.start' }, create: { name: 'permission.sfu.start', description: 'Start the SFU server instance' } },
                    { where: { name: 'permission.sfu.stop' }, create: { name: 'permission.sfu.stop', description: 'Stop the SFU server instance' } },
                    { where: { name: 'permission.sfu.restart' }, create: { name: 'permission.sfu.restart', description: 'Restart the SFU server' } },
                    { where: { name: 'permission.sfu.reset' }, create: { name: 'permission.sfu.reset', description: 'Reset SFU state' } },
                    { where: { name: 'permission.view.uplink' }, create: { name: 'permission.view.uplink', description: 'View uplink streams and producers' } },
                    { where: { name: 'permission.view.downlink' }, create: { name: 'permission.view.downlink', description: 'View downlink streams and consumers' } },
                    { where: { name: 'permission.view.video' }, create: { name: 'permission.view.video', description: 'View video streams' } },
                    { where: { name: 'permission.remove.peer' }, create: { name: 'permission.remove.peer', description: 'Force remove peers/producers/consumers' } },
                    { where: { name: 'permission.users.manage' }, create: { name: 'permission.users.manage', description: 'Manage user permissions and access control' } },
                    { where: { name: 'permission.peer.refresh' }, create: { name: 'permission.peer.refresh', description: 'Send refresh/sync command to peers' } },
                    { where: { name: 'permission.peer.kick' }, create: { name: 'permission.peer.kick', description: 'Kick/close tabs of peers from a room' } },
                    { where: { name: 'permission.peer.cam' }, create: { name: 'permission.peer.cam', description: 'Toggle camera of peers remotely' } },
                    { where: { name: 'permission.peer.mic' }, create: { name: 'permission.peer.mic', description: 'Toggle microphone of peers remotely' } }
                ]
            }
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
            permissions: req.user.permissions,
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
            permissions: req.user.permissions,
        },
    });
});

export const logout = catchAsync(async (req, res) => {
    // JWT is stateless — the real logout happens by clearing the token on the client.
    // This endpoint exists so clients can signal the logout and we can log it.
    logger.info(`User logged out: ${req.user?.email || 'unknown'}`);
    sendSuccess(res, 200, { message: 'Logged out successfully.' });
});

export const refreshToken = catchAsync(async (req, res, next) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return next(new AppError('Refresh token is required', 400));
    }

    let decoded;
    try {
        decoded = verifyToken(refreshToken, env.JWT_REFRESH_SECRET);
    } catch (err) {
        return next(new AppError('Invalid or expired refresh token', 401));
    }

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

export const generatePermanentToken = catchAsync(async (req, res, next) => {
    const { roomId } = req.body; // optional: scope token to a specific room

    const payload = {
        sub: req.user.id,
        role: req.user.role,
        type: 'permanent',
        ...(roomId ? { roomId } : {}),  // embed roomId if provided
    };

    const token = jwt.sign(payload, env.JWT_SECRET); // No expiresIn option

    logger.info(`Permanent WS token generated by ${req.user?.username || 'Admin'}${roomId ? ` for room ${roomId}` : ''}`);

    sendSuccess(res, 200, {
        message: 'Permanent token generated successfully',
        token,
        roomId: roomId || null,
        note: roomId
            ? `This token never expires and is scoped to room: ${roomId}`
            : 'This token never expires and allows access to all rooms.',
    });
});
