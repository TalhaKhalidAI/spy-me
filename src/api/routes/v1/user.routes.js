import express from 'express';
import passport from 'passport';
import * as userController from '../../controllers/user.controller.js';
import { authorize } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { updateUserSchema } from '../../validators/user.validator.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management
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

/**
 * @swagger
 * /v1/users:
 *   get:
 *     summary: Get all users (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users
 *       403:
 *         description: Forbidden
 */
router.get('/', authorize('ADMIN'), userController.getAllUsers);

/**
 * @swagger
 * /v1/users/update-me:
 *   patch:
 *     summary: Update current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUser'
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.patch('/update-me', validate(updateUserSchema), userController.updateMe);

/**
 * @swagger
 * /v1/users/delete-me:
 *   delete:
 *     summary: Soft delete current user account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account deleted
 */
router.delete('/delete-me', userController.deleteMe);

// ─── Admin Only Routes ────────────────────────────────────────────────────────
/**
 * @swagger
 * /v1/users/deleted:
 *   get:
 *     summary: Get all deleted users (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of deleted users
 *       403:
 *         description: Forbidden
 */
router.get('/deleted', authorize('ADMIN'), userController.getDeletedUsers);

/**
 * @swagger
 * /v1/users/restore/{id}:
 *   post:
 *     summary: Restore a deleted user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User restored
 */
router.post('/restore/:id', authorize('ADMIN'), userController.restoreUser);

/**
 * @swagger
 * /v1/users/{id}/permissions:
 *   get:
 *     summary: Get permissions of a specific user (Admin only)
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
 *       200:
 *         description: List of user permissions
 *   post:
 *     summary: Add specific permissions to a user (Admin only)
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
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Permissions added
 *   put:
 *     summary: Set exact permissions for a user (Bulk update/overwrite) (Admin only)
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
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Permissions assigned
 *   delete:
 *     summary: Remove specific permissions from a user (Admin only)
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
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Permissions removed
 */
router.route('/:id/permissions')
    .get(authorize('ADMIN'), userController.getUserPermissions)
    .post(authorize('ADMIN'), userController.addPermissions)
    .put(authorize('ADMIN'), userController.assignPermissions)
    .delete(authorize('ADMIN'), userController.removePermissions);

export default router;
