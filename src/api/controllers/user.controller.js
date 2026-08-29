import { prisma } from '../../config/databases.js';
import { catchAsync, sendSuccess } from '../utils/response.util.js';
import { AppError } from '../middleware/error.middleware.js';

export const getAllUsers = catchAsync(async (req, res, next) => {
    const users = await prisma.user.findMany({
        where: { deletedAt: null }, // Only non-deleted users
        select: {
            id: true,
            email: true,
            username: true,
            role: true,
            isActive: true,
            createdAt: true,
        },
    });

    sendSuccess(res, 200, { users });
});

export const updateMe = catchAsync(async (req, res, next) => {
    const { firstName, lastName, username, avatar } = req.body;

    // Filter out restricted fields like email, password, role
    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (avatar) updateData.avatar = avatar;

    if (username) {
        // Check if username is already taken
        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing && existing.id !== req.user.id) {
            return next(new AppError('Username already taken', 400));
        }
        updateData.username = username;
    }

    const updatedUser = await prisma.user.update({
        where: { id: req.user.id },
        data: updateData,
    });

    sendSuccess(res, 200, {
        user: {
            id: updatedUser.id,
            email: updatedUser.email,
            username: updatedUser.username,
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            avatar: updatedUser.avatar,
        }
    }, 'Profile updated successfully');
});

export const deleteMe = catchAsync(async (req, res, next) => {
    // Soft delete
    await prisma.user.update({
        where: { id: req.user.id },
        data: {
            deletedAt: new Date(),
            isActive: false
        },
    });

    sendSuccess(res, 200, null, 'Account deleted successfully');
});

// Admin only: Get all deleted users
export const getDeletedUsers = catchAsync(async (req, res, next) => {
    const users = await prisma.user.findMany({
        where: {
            deletedAt: { not: null },
        },
    });

    sendSuccess(res, 200, { users });
});

// Admin only: Restore a deleted user
export const restoreUser = catchAsync(async (req, res, next) => {
    const { id } = req.params;

    const user = await prisma.user.update({
        where: { id },
        data: {
            deletedAt: null,
            isActive: true,
        },
    });

    sendSuccess(res, 200, { user }, 'User restored successfully');
});

// Admin only: Assign permissions to a user
export const assignPermissions = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { permissions } = req.body; // Expects an array of permission names

    if (!Array.isArray(permissions)) {
        return next(new AppError('Permissions must be an array of strings', 400));
    }

    // Map names to objects
    const permissionsToConnect = permissions.map(name => ({ name }));

    const updatedUser = await prisma.user.update({
        where: { id },
        data: {
            permissions: {
                set: [], // Clear existing (or omit to just append, but typically we set exact permissions)
                connect: permissionsToConnect
            }
        },
        include: {
            permissions: true
        }
    });

    sendSuccess(res, 200, { user: updatedUser }, 'Permissions assigned successfully');
});
