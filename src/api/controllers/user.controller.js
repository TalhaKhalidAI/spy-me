import { prisma } from '../../config/databases.js';
import { catchAsync, sendSuccess } from '../utils/response.util.js';
import { AppError } from '../middleware/error.middleware.js';
import { PasswordService } from '../../services/password.service.js';
export const getAllUsers = catchAsync(async (req, res, next) => {
    const { search } = req.query;

    const whereClause = { deletedAt: null };
    if (search) {
        whereClause.OR = [
            { username: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } }
        ];
    }

    const users = await prisma.user.findMany({
        where: whereClause, // Only non-deleted users matching search
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

export const createUser = catchAsync(async (req, res, next) => {
    const { username, email, password, role } = req.body;

    const existing = await prisma.user.findFirst({
        where: {
            OR: [{ email }, { username }]
        }
    });

    if (existing) {
        return next(new AppError('User with this email or username already exists', 400));
    }

    const hashedPassword = await PasswordService.hash(password);
    const user = await prisma.user.create({
        data: {
            username,
            email,
            password: hashedPassword,
            role: role || 'USER'
        }
    });

    sendSuccess(res, 201, { user: { id: user.id, username: user.username, email: user.email, role: user.role } }, 'User created successfully');
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

export const updateUser = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { username, email, role, isActive } = req.body;

    const userToUpdate = await prisma.user.findUnique({ where: { id } });
    if (!userToUpdate) {
        return next(new AppError('User not found', 404));
    }

    // Prevent users (admins) from changing their own role or deactivating themselves via this endpoint
    if (req.user && req.user.id === id) {
        if (role !== undefined && role !== userToUpdate.role) {
            return next(new AppError('You cannot change your own role', 403));
        }
        if (isActive !== undefined && isActive === false && userToUpdate.isActive === true) {
            return next(new AppError('You cannot deactivate your own account', 403));
        }
    }

    const updateData = {};

    if (username !== undefined) {
        if (username) {
            const existing = await prisma.user.findUnique({ where: { username } });
            if (existing && existing.id !== id) {
                return next(new AppError('Username already taken', 400));
            }
        }
        updateData.username = username;
    }

    if (email !== undefined) {
        if (email) {
            const existing = await prisma.user.findUnique({ where: { email } });
            if (existing && existing.id !== id) {
                return next(new AppError('Email already taken', 400));
            }
        }
        updateData.email = email;
    }

    if (role !== undefined) {
        updateData.role = role;
    }

    if (isActive !== undefined) {
        updateData.isActive = isActive;
    }

    const updatedUser = await prisma.user.update({
        where: { id },
        data: updateData,
    });

    sendSuccess(res, 200, {
        user: {
            id: updatedUser.id,
            email: updatedUser.email,
            username: updatedUser.username,
            role: updatedUser.role,
            isActive: updatedUser.isActive,
        }
    }, 'User updated successfully');
});

export const deleteMe = catchAsync(async (req, res, next) => {
    if (req.user && req.user.role === 'ADMIN') {
        return next(new AppError('Admins cannot delete their own accounts directly.', 403));
    }

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

    if (id) {
        const user = await prisma.user.findFirst({
            where: { id, deletedAt: null },
            include: { permissions: true, rooms: true, grantedRooms: true }
        });
        if (!user) {
            return next(new AppError('User not found', 404));
        }
        return sendSuccess(res, 200, user);
    }

    const users = await prisma.user.findMany({
        where: { deletedAt: null },
        include: { permissions: true, rooms: true, grantedRooms: true }
    });

    return sendSuccess(res, 200, users);
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

/**
 * Grant a room to a user
 */
export const addGrantedRoom = catchAsync(async (req, res, next) => {
    const { id, roomId } = req.params;

    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
        return next(new AppError('User not found', 404));
    }

    const existingRoom = await prisma.room.findUnique({ where: { roomId } });
    if (!existingRoom) {
        return next(new AppError('Room not found', 404));
    }

    try {
        const updatedUser = await prisma.user.update({
            where: { id },
            data: {
                grantedRooms: {
                    connect: { roomId }
                }
            },
            include: { grantedRooms: true }
        });

        sendSuccess(res, 200, { user: updatedUser }, 'Room granted successfully');
    } catch (error) {
        next(error);
    }
});

/**
 * Revoke a granted room from a user
 */
export const removeGrantedRoom = catchAsync(async (req, res, next) => {
    const { id, roomId } = req.params;

    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
        return next(new AppError('User not found', 404));
    }

    try {
        const updatedUser = await prisma.user.update({
            where: { id },
            data: {
                grantedRooms: {
                    disconnect: { roomId }
                }
            },
            include: { grantedRooms: true }
        });

        sendSuccess(res, 200, { user: updatedUser }, 'Room revoked successfully');
    } catch (error) {
        next(error);
    }
});

// Self or Admin: Update a user's password
export const updateUserPassword = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { password } = req.body;

    if (!password) {
        return next(new AppError('Password is required', 400));
    }

    const isSelf = req.user.id === id;
    const isAdmin = req.user.role === 'ADMIN';

    if (!isSelf && !isAdmin) {
        return next(new AppError('You do not have permission to update this user\'s password', 403));
    }

    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
        return next(new AppError('User not found', 404));
    }

    const hashedPassword = await PasswordService.hash(password);

    await prisma.user.update({
        where: { id },
        data: { password: hashedPassword },
    });

    sendSuccess(res, 200, null, 'Password updated successfully');
});

// (EOF)
