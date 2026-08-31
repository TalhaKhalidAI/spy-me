import { prisma } from '../../config/databases.js';
import { AppError } from '../middleware/error.middleware.js';
import logger from '../utils/logger.js';

/**
 * Get all permissions
 */
export const getAllPermissions = async (req, res, next) => {
  try {
    const permissions = await prisma.permission.findMany();
    
    res.status(200).json({
      status: 'success',
      data: permissions
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new permission
 */
export const createPermission = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return next(new AppError('Permission name is required', 400));
    }
    
    // Check if it already exists
    const existing = await prisma.permission.findUnique({ where: { name } });
    if (existing) {
      return next(new AppError('Permission already exists', 409));
    }
    
    const permission = await prisma.permission.create({
      data: {
        name,
        description
      }
    });
    
    res.status(201).json({
      status: 'success',
      data: {
        permission
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing permission
 */
export const updatePermission = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    
    const permission = await prisma.permission.update({
      where: { id },
      data: { name, description }
    });
    
    res.status(200).json({
      status: 'success',
      data: {
        permission
      }
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return next(new AppError('Permission not found', 404));
    }
    if (error.code === 'P2002') {
      return next(new AppError('Permission name already exists', 409));
    }
    next(error);
  }
};

/**
 * Delete a permission
 */
export const deletePermission = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.permission.delete({
      where: { id }
    });
    
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') {
      return next(new AppError('Permission not found', 404));
    }
    next(error);
  }
};
