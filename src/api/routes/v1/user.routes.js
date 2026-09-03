import express from 'express';
import passport from 'passport';
import * as userController from '../../controllers/user.controller.js';
import { authorize, requirePermission } from '../../middleware/auth.middleware.js';
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
router.get('/', requirePermission('permission.users.manage'), userController.getAllUsers);

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
 */

/**
 * @swagger
 * /v1/users/permissions:
 *   get:
 *     summary: Get all users and their permissions (Admin only)
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: id
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional user ID to get permissions for a specific user
 *     responses:
 *       200:
 *         description: List of all users and permissions
 */
router.get('/permissions', requirePermission('permission.users.manage'), userController.getUserPermissions);

router.route('/:id/permissions')
    .get(requirePermission('permission.users.manage'), userController.getUserPermissions)
    .post(requirePermission('permission.users.manage'), userController.addPermissions);

/**
 * @swagger
 * /v1/users/{id}/permissions/{permissionId}:
 *   post:
 *     summary: Add a single permission to a user (Admin only)
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
 *       - in: path
 *         name: permissionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The permission ID
 *     responses:
 *       200:
 *         description: Permission added successfully
 *   put:
 *     summary: Replace a permission with a new one for a user (Admin only)
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
 *       - in: path
 *         name: permissionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The old permission ID to replace
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               newPermissionId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Permission updated successfully
 *   delete:
 *     summary: Remove a single permission from a user (Admin only)
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
 *       - in: path
 *         name: permissionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The permission ID
 *     responses:
 *       200:
 *         description: Permission removed successfully
 */
router.route('/:id/permissions/:permissionId')
    .post(requirePermission('permission.users.manage'), userController.addSinglePermission)
    .put(requirePermission('permission.users.manage'), userController.updateSinglePermission)
    .delete(requirePermission('permission.users.manage'), userController.removeSinglePermission);


/**
 * @swagger
 * /v1/users/{id}/granted-rooms/{roomId}:
 *   post:
 *     summary: Grant room access to a user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/granted-rooms/:roomId', requirePermission('permission.users.manage'), userController.addGrantedRoom);

/**
 * @swagger
 * /v1/users/{id}/granted-rooms/{roomId}:
 *   delete:
 *     summary: Revoke room access from a user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id/granted-rooms/:roomId', requirePermission('permission.users.manage'), userController.removeGrantedRoom);

/**
 * @swagger
 * /v1/users/{id}/password:
 *   put:
 *     summary: Update a user's password (Admin only)
 *     tags: [Users]
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
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *     responses:
 *       '200':
 *         description: Password updated successfully
 *       '400':
 *         description: Bad request
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: User not found
 */
router.put('/:id/password', requirePermission('permission.users.manage'), userController.updateUserPassword);

export default router;
console.log("user.routes.js completed");
