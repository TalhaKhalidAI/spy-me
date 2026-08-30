import sfu from '../../services/mediasoup/index.js';
import { prisma } from '../../config/databases.js';

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

/**
 * Middleware to allow admin or members of the transport's room to manage viewers
 * @param {object} req - Express request (must have user populated by passport)
 * @param {object} res - Express response
 * @param {function} next - Next middleware
 */
export const requireAdminOrRoomMember = async (req, res, next) => {
  const { transportId } = req.params;
  if (!transportId) {
    return next(new AppError('transportId is required', 400));
  }

  // Ensure transport exists
  const metadata = sfu?.transportManager?.getTransportMetadata(transportId);
  if (!metadata) {
    return next(new AppError(`Transport ${transportId} not found`, 404));
  }

  // Admin bypass
  if (req.user && req.user.role === 'ADMIN') {
    return next();
  }

  // Verify the user is a member of the room associated with the transport
  const member = await prisma.roomMember.findFirst({
    where: { roomId: metadata.roomId, userId: req.user.id },
  });
  if (!member) {
    return next(new AppError('Forbidden – not a room member', 403));
  }
  return next();
};
