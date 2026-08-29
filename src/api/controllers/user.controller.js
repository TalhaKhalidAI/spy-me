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

// bulk update is further down

// Admin only: Get a user's permissions (or all users' permissions if no ID)
export const getUserPermissions = catchAsync(async (req, res, next) => {
    // Check both path param and query param
    const id = req.params.id || req.query.id;

    let users = [];

    if (id) {
        const user = await prisma.user.findFirst({
            where: { id, deletedAt: null },
            include: { permissions: true }
        });
        if (!user) {
            return next(new AppError('User not found', 404));
        }
        users = [user];
    } else {
        users = await prisma.user.findMany({
            where: { deletedAt: null },
            include: { permissions: true }
        });
    }

    // Format the response
    let formattedData = {};

    if (id && users.length === 1) {
        const user = users[0];
        formattedData[user.id] = {
            username: user.username,
            permissions: {}
        };
        for (const perm of user.permissions) {
            formattedData[user.id].permissions[perm.id] = perm;
        }
    } else {
        for (const user of users) {
            // Just return an array of permission IDs for each user
            formattedData[user.id] = user.permissions.map(perm => perm.id);
        }
    }

    sendSuccess(res, 200, formattedData);
});

// Admin only: Add permissions to a user (without removing existing)
export const addPermissions = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { permissions } = req.body;

    if (!Array.isArray(permissions)) {
        return next(new AppError('Permissions must be an array of strings', 400));
    }

    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser || existingUser.deletedAt) {
        return next(new AppError('User not found', 404));
    }

    const permissionsToConnect = permissions.map(name => ({ name }));

    try {
        const updatedUser = await prisma.user.update({
            where: { id },
            data: {
                permissions: {
                    connect: permissionsToConnect
                }
            },
            include: {
                permissions: true
            }
        });

        sendSuccess(res, 200, { user: updatedUser }, 'Permissions added successfully');
    } catch (error) {
        if (error.code === 'P2025') {
            return next(new AppError('User not found', 404));
        }
        next(error);
    }
});

// Admin only: Add a single permission to a user by ID
export const addSinglePermission = catchAsync(async (req, res, next) => {
    const { id, permissionId } = req.params;

    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser || existingUser.deletedAt) {
        return next(new AppError('User not found', 404));
    }

    const existingPermission = await prisma.permission.findUnique({ where: { id: permissionId } });
    if (!existingPermission) {
        return next(new AppError('Permission not found', 404));
    }

    try {
        const updatedUser = await prisma.user.update({
            where: { id },
            data: {
                permissions: {
                    connect: { id: permissionId }
                }
            },
            include: { permissions: true }
        });

        sendSuccess(res, 200, { user: updatedUser }, 'Permission added successfully');
    } catch (error) {
        next(error);
    }
});

// Admin only: Remove a single permission from a user by ID
export const removeSinglePermission = catchAsync(async (req, res, next) => {
    const { id, permissionId } = req.params;

    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser || existingUser.deletedAt) {
        return next(new AppError('User not found', 404));
    }

    const existingPermission = await prisma.permission.findUnique({ where: { id: permissionId } });
    if (!existingPermission) {
        return next(new AppError('Permission not found', 404));
    }

    try {
        const updatedUser = await prisma.user.update({
            where: { id },
            data: {
                permissions: {
                    disconnect: { id: permissionId }
                }
            },
            include: { permissions: true }
        });

        sendSuccess(res, 200, { user: updatedUser }, 'Permission removed successfully');
    } catch (error) {
        next(error);
    }
});

// Admin only: Replace a single permission with a new one
export const updateSinglePermission = catchAsync(async (req, res, next) => {
    const { id, permissionId } = req.params;
    const { newPermissionId } = req.body;

    if (!newPermissionId) {
        return next(new AppError('newPermissionId is required', 400));
    }

    const existingUser = await prisma.user.findUnique({ 
        where: { id },
        include: { permissions: true }
    });
    if (!existingUser || existingUser.deletedAt) {
        return next(new AppError('User not found', 404));
    }

    // Ensure the user actually has the OLD permission
    const hasOldPerm = existingUser.permissions.some(p => p.id === permissionId);
    if (!hasOldPerm) {
        return next(new AppError('User does not have the old permission assigned', 400));
    }

    // Try finding the new permission by ID or by Name
    const newPermission = await prisma.permission.findFirst({ 
        where: { 
            OR: [
                { id: newPermissionId },
                { name: newPermissionId }
            ]
        } 
    });
    
    if (!newPermission) {
        return next(new AppError('New permission not found', 404));
    }

    try {
        const updatedUser = await prisma.user.update({
            where: { id },
            data: {
                permissions: {
                    disconnect: { id: permissionId },
                    connect: { id: newPermission.id }
                }
            },
            include: { permissions: true }
        });

        sendSuccess(res, 200, { user: updatedUser }, 'Permission updated successfully');
    } catch (error) {
        next(error);
    }
});

// (EOF)
