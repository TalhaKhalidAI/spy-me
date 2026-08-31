import express from 'express';
import passport from 'passport';
import { requirePermission } from '../../middleware/auth.middleware.js';
import * as roomController from '../../controllers/room.controller.js';

const router = express.Router();

// All room routes require authentication
router.use(passport.authenticate('jwt', { session: false }));

/**
 * @swagger
 * tags:
 *   name: Rooms
 *   description: Room Management
 */

/**
 * @swagger
 * /v1/rooms:
 *   get:
 *     summary: Get all rooms or a specific room
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: id
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional room ID to get details for a specific room
 *     responses:
 *       200:
 *         description: List of rooms
 */
router.get('/', roomController.getRooms);

/**
 * @swagger
 * /v1/rooms:
 *   post:
 *     summary: Create a new room
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - roomId
 *             properties:
 *               roomId:
 *                 type: string
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               options:
 *                 type: object
 *     responses:
 *       201:
 *         description: Room created
 */
router.post('/', requirePermission('permission.room.create'), roomController.createRoom);

/**
 * @swagger
 * /v1/rooms/{roomId}:
 *   put:
 *     summary: Update room details
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
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
 *         description: Room updated
 */
router.put('/:roomId', requirePermission('permission.room.update'), roomController.updateRoom);

/**
 * @swagger
 * /v1/rooms/{roomId}:
 *   delete:
 *     summary: Delete a room
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Room deleted
 */
router.delete('/:roomId', requirePermission('permission.room.delete'), roomController.deleteRoom);

export default router;
