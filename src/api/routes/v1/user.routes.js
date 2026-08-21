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

// All routes here require authentication
router.use(passport.authenticate('jwt', { session: false }));

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

export default router;
