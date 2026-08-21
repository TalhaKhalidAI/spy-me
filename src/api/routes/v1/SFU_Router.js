// src/api/routes/v1/sfu.routes.js
import express from 'express';
import passport from 'passport';
import { authorize } from '../../middleware/auth.middleware.js';
import * as sfuController from '../../controllers/sfu.controller.js';

const SFU_Router = express.Router();

// ─── All SFU routes require admin auth ──────────────
// SFU_Router.use(passport.authenticate('jwt', { session: false }));
// SFU_Router.use(authorize('ADMIN'));



// ─── SFU Control ──────────────────────────────────────────
/**
 * @swagger
 * /v1/sfu/status:
 *   get:
 *     summary: Get SFU status
 *     tags: [SFU]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: SFU status
 */
SFU_Router.get('/status', sfuController.getSFUStatus);

/**
 * @swagger
 * /v1/sfu/start:
 *   post:
 *     summary: Start/Initialize SFU
 *     tags: [SFU]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               listenIp:
 *                 type: string
 *                 default: "0.0.0.0"
 *               announcedIp:
 *                 type: string
 *                 default: "127.0.0.1"
 *     responses:
 *       200:
 *         description: SFU started
 *       400:
 *         description: SFU already running
 */
SFU_Router.post('/start', sfuController.startSFU);

/**
 * @swagger
 * /v1/sfu/stop:
 *   post:
 *     summary: Stop/Shutdown SFU
 *     tags: [SFU]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: SFU stopped
 *       400:
 *         description: SFU not running
 */
SFU_Router.post('/stop', sfuController.stopSFU);

/**
 * @swagger
 * /v1/sfu/restart:
 *   post:
 *     summary: Restart SFU
 *     tags: [SFU]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               listenIp:
 *                 type: string
 *                 default: "0.0.0.0"
 *               announcedIp:
 *                 type: string
 *                 default: "127.0.0.1"
 *     responses:
 *       200:
 *         description: SFU restarted
 */
SFU_Router.post('/restart', sfuController.restartSFU);

/**
 * @swagger
 * tags:
 *   name: SFU
 *   description: WebRTC SFU Management (Admin only)
 */

/**
 * @swagger
 * /v1/sfu/rooms:
 *   post:
 *     summary: Create a new WebRTC room
 *     tags: [SFU]
  
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
 *                 example: "room-123"
 *               options:
 *                 type: object
 *                 properties:
 *                   mediaCodecs:
 *                     type: array
 *                     items:
 *                       type: object
 *     responses:
 *       201:
 *         description: Room created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     roomId:
 *                       type: string
 *                     routerId:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *       400:
 *         description: Room ID required
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 *       503:
 *         description: SFU not ready
 */
SFU_Router.post('/rooms', sfuController.createRoom);

/**
 * @swagger
 * /v1/sfu/rooms:
 *   get:
 *     summary: Get all rooms
 *     tags: [SFU]
 *    
 *     responses:
 *       200:
 *         description: List of all rooms
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     rooms:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           roomId:
 *                             type: string
 *                           routerId:
 *                             type: string
 *                           active:
 *                             type: boolean
 *                           producers:
 *                             type: number
 *                           consumers:
 *                             type: number
 *                     total:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 */
SFU_Router.get('/rooms', sfuController.getRooms);

/**
 * @swagger
 * /v1/sfu/rooms/{roomId}:
 *   get:
 *     summary: Get room details
 *     tags: [SFU]
 
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     responses:
 *       200:
 *         description: Room details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     roomId:
 *                       type: string
 *                     routerId:
 *                       type: string
 *                     active:
 *                       type: boolean
 *                     producers:
 *                       type: array
 *                     consumers:
 *                       type: array
 *                     stats:
 *                       type: object
 *       404:
 *         description: Room not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 */
SFU_Router.get('/rooms/:roomId', sfuController.getRoom);

/**
 * @swagger
 * /v1/sfu/rooms/{roomId}:
 *   delete:
 *     summary: Delete a room
 *     tags: [SFU]
 
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     responses:
 *       200:
 *         description: Room deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     roomId:
 *                       type: string
 *                     deleted:
 *                       type: boolean
 *                     timestamp:
 *                       type: string
 *       404:
 *         description: Room not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 */
SFU_Router.delete('/rooms/:roomId', sfuController.deleteRoom);

/**
 * @swagger
 * /v1/sfu/rooms/{roomId}/producers:
 *   get:
 *     summary: Get all producers in a room
 *     tags: [SFU]
 
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     responses:
 *       200:
 *         description: List of producers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     roomId:
 *                       type: string
 *                     producers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           kind:
 *                             type: string
 *                           source:
 *                             type: string
 *                           socketId:
 *                             type: string
 *                           paused:
 *                             type: boolean
 *                     total:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 */
SFU_Router.get('/rooms/:roomId/producers', sfuController.getRoomProducers);

/**
 * @swagger
 * /v1/sfu/rooms/{roomId}/consumers:
 *   get:
 *     summary: Get all consumers in a room
 *     tags: [SFU]
 
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     responses:
 *       200:
 *         description: List of consumers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     roomId:
 *                       type: string
 *                     consumers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           producerId:
 *                             type: string
 *                           kind:
 *                             type: string
 *                           socketId:
 *                             type: string
 *                           paused:
 *                             type: boolean
 *                     total:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 */
SFU_Router.get('/rooms/:roomId/consumers', sfuController.getRoomConsumers);

/**
 * @swagger
 * /v1/sfu/producers/{producerId}:
 *   delete:
 *     summary: Force close a producer (Admin)
 *     tags: [SFU]
 
 *     parameters:
 *       - in: path
 *         name: producerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Producer ID
 *     responses:
 *       200:
 *         description: Producer closed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     producerId:
 *                       type: string
 *                     closed:
 *                       type: boolean
 *                     timestamp:
 *                       type: string
 *       404:
 *         description: Producer not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 */
SFU_Router.delete('/producers/:producerId', sfuController.forceCloseProducer);

/**
 * @swagger
 * /v1/sfu/consumers/{consumerId}:
 *   delete:
 *     summary: Force close a consumer (Admin)
 *     tags: [SFU]
 
 *     parameters:
 *       - in: path
 *         name: consumerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Consumer ID
 *     responses:
 *       200:
 *         description: Consumer closed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     consumerId:
 *                       type: string
 *                     closed:
 *                       type: boolean
 *                     timestamp:
 *                       type: string
 *       404:
 *         description: Consumer not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 */
SFU_Router.delete('/consumers/:consumerId', sfuController.forceCloseConsumer);

/**
 * @swagger
 * /v1/sfu/stats:
 *   get:
 *     summary: Get SFU statistics
 *     tags: [SFU]
 
 *     responses:
 *       200:
 *         description: SFU statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     sfu:
 *                       type: object
 *                       properties:
 *                         initialized:
 *                           type: boolean
 *                         workers:
 *                           type: number
 *                         routers:
 *                           type: number
 *                         transports:
 *                           type: number
 *                         producers:
 *                           type: number
 *                         consumers:
 *                           type: number
 *                     workers:
 *                       type: array
 *                     transports:
 *                       type: array
 *                     timestamp:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 */
SFU_Router.get('/stats', sfuController.getSFUStats);

/**
 * @swagger
 * /v1/sfu/health:
 *   get:
 *     summary: Get SFU health status
 *     tags: [SFU]
 
 *     responses:
 *       200:
 *         description: SFU is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [healthy, degraded]
 *                     sfu:
 *                       type: object
 *                     workers:
 *                       type: object
 *                     transports:
 *                       type: object
 *                     producers:
 *                       type: object
 *                     consumers:
 *                       type: object
 *                     timestamp:
 *                       type: string
 *       503:
 *         description: SFU is degraded
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 */
SFU_Router.get('/health', sfuController.getSFUHealth);

/**
 * @swagger
 * /v1/sfu/capabilities:
 *   get:
 *     summary: Get RTP capabilities
 *     tags: [SFU]
 
 *     responses:
 *       200:
 *         description: RTP capabilities
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     capabilities:
 *                       type: object
 *                     timestamp:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 */
SFU_Router.get('/capabilities', sfuController.getCapabilities);

/**
 * @swagger
 * /v1/sfu/reset:
 *   post:
 *     summary: Reset SFU (Admin only - DANGEROUS)
 *     tags: [SFU]
  
 *     responses:
 *       200:
 *         description: SFU reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     reset:
 *                       type: boolean
 *                     timestamp:
 *                       type: string
 *       500:
 *         description: Reset failed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 */
SFU_Router.post('/reset', sfuController.resetSFU);

export default SFU_Router;