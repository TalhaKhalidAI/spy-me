import { Router } from 'express';
import passport from 'passport';
import { authorize } from '../../middleware/auth.middleware.js';
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
router.use(authorize('ADMIN'));

/**
 * @swagger
 * /v1/permissions:
 *   get:
 *     summary: Get all permissions (Admin only)
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of permissions
 *       403:
 *         description: Forbidden
 *   post:
 *     summary: Create a new permission (Admin only)
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Permission created
 */
router
  .route('/')
  .get(getAllPermissions)
  .post(createPermission);

/**
 * @swagger
 * /v1/permissions/{id}:
 *   put:
 *     summary: Update an existing permission (Admin only)
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Permission updated
 *   delete:
 *     summary: Delete a permission (Admin only)
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Permission deleted
 */
router
  .route('/:id')
  .put(updatePermission)
  .delete(deletePermission);

export default router;
