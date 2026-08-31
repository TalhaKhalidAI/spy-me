import { Router } from 'express';
import passport from 'passport';
import { authorize, requirePermission } from '../../middleware/auth.middleware.js';
import {
  getAllPermissions,
  createPermission,
  updatePermission,
  deletePermission
} from '../../controllers/permission.controller.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Permissions
 *   description: Permission management
 */


router.use((req, res, next) => {
    passport.authenticate('jwt', { session: false }, (err, user, info) => {
        if (err) return next(err);
        if (!user) {
            return res.status(401).json({
                status: 'fail',
                message: 'Unauthorized'
            });
        }
        req.user = user;
        next();
    })(req, res, next);
});
// Only ADMIN can create/delete/update permissions — but listing is allowed for users.manage
router
  .route('/')
  .get(requirePermission('permission.users.manage'), getAllPermissions)
  .post(authorize('ADMIN'), createPermission);

/**
 * @swagger
 *     responses:
 *       204:
 *         description: Permission deleted
 */
router
  .route('/:id')
  .put(authorize('ADMIN'), updatePermission)
  .delete(authorize('ADMIN'), deletePermission);

export default router;
