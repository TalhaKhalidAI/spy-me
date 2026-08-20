// src/api/controllers/sfu.controller.js
import sfu from '../../services/mediasoup/index.js';
import logger from '../utils/logger.js';
import { catchAsync, sendSuccess } from '../utils/response.util.js';
import { AppError } from '../middleware/error.middleware.js';

// ============================================================
// ROOM MANAGEMENT
// ============================================================

/**
 * Start/Initialize SFU
 * POST /api/v1/sfu/start
 */
export const startSFU = catchAsync(async (req, res, next) => {
    const { listenIp = '0.0.0.0', announcedIp = '127.0.0.1' } = req.body;

    if (sfu.isReady()) {
        return next(new AppError('SFU is already initialized', 400));
    }

    try {
        await sfu.initialize({
            listenIp,
            announcedIp,
        });

        logger.info('✅ SFU started via API');

        sendSuccess(res, 200, {
            status: 'started',
            workers: sfu.workerManager?.count || 0,
            routers: sfu.routerManager?.count || 0,
            transports: sfu.transportManager?.count || 0,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        logger.error('❌ Failed to start SFU:', error);
        return next(new AppError(`SFU start failed: ${error.message}`, 500));
    }
});

/**
 * Stop/Shutdown SFU
 * POST /api/v1/sfu/stop
 */

export const stopSFU = catchAsync(async (req, res, next) => {
    if (!sfu.isReady()) {
        return next(new AppError('SFU is not running', 400));
    }

    try {
        // ✅ Use try/catch for each shutdown step
        await sfu.shutdown();

        logger.info('🛑 SFU stopped via API');

        sendSuccess(res, 200, {
            status: 'stopped',
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        logger.error('❌ Failed to stop SFU:', error);
        return next(new AppError(`SFU stop failed: ${error.message}`, 500));
    }
});

export const restartSFU = catchAsync(async (req, res, next) => {
    const { listenIp = '0.0.0.0', announcedIp = '127.0.0.1' } = req.body;

    try {
        // Shutdown if running
        if (sfu.isReady()) {
            await sfu.shutdown();
            logger.info('🛑 SFU stopped for restart');
        }

        // Start fresh
        await sfu.initialize({
            listenIp,
            announcedIp,
        });

        logger.info('🔄 SFU restarted via API');

        sendSuccess(res, 200, {
            status: 'restarted',
            workers: sfu.workerManager?.count || 0,
            routers: sfu.routerManager?.count || 0,
            transports: sfu.transportManager?.count || 0,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        logger.error('❌ Failed to restart SFU:', error);
        return next(new AppError(`SFU restart failed: ${error.message}`, 500));
    }
});

 

/**
 * Get SFU status
 * GET /api/v1/sfu/status
 */
export const getSFUStatus = catchAsync(async (req, res) => {
    const status = {
        initialized: sfu.isReady(),
        workers: sfu.workerManager?.count || 0,
        routers: sfu.routerManager?.count || 0,
        transports: sfu.transportManager?.count || 0,
        producers: sfu.producerManager?.count || 0,
        consumers: sfu.consumerManager?.count || 0,
        workerStatuses: sfu.workerManager?.getWorkerStatuses?.() || [],
        transportStatuses: sfu.transportManager?.getTransportStatuses?.() || [],
        timestamp: new Date().toISOString(),
    };

    sendSuccess(res, 200, status);
});

/**
 * Create a new room
 * POST /api/v1/sfu/rooms
 */


export const createRoom = catchAsync(async (req, res, next) => {
    const { roomId, options = {} } = req.body;

    console.log('📝 Create room request:', { roomId, options });  // ✅ Debug log

    if (!roomId) {
        return next(new AppError('roomId is required', 400));
    }

    if (!sfu.isReady()) {
        return next(new AppError('SFU is not initialized', 503));
    }

    try {
        // ✅ Create router with default codecs
        const router = await sfu.routerManager.createRouter(roomId, {
            mediaCodecs: options.mediaCodecs || undefined,
        });

        console.log('✅ Router created:', router.id);  // ✅ Debug log

        sendSuccess(res, 201, {
            roomId,
            routerId: router.id,
            createdAt: new Date().toISOString(),
        });

    } catch (error) {
        console.error('❌ Failed to create room:', error);  // ✅ Debug log
        return next(new AppError(`Room creation failed: ${error.message}`, 500));
    }
});

/**
 * Get all rooms
 * GET /api/v1/sfu/rooms
 */
export const getRooms = catchAsync(async (req, res) => {
    const rooms = sfu.routerManager?.getAllRouters?.() || [];
    
    const roomList = [];
    for (const [roomId, router] of rooms) {
        const producers = sfu.producerManager?.getProducersForRoom(roomId) || [];
        const consumers = sfu.consumerManager?.getConsumersForRoom(roomId) || [];
        
        roomList.push({
            roomId,
            routerId: router.id,
            active: !router.closed,
            producers: producers.length,
            consumers: consumers.length,
            createdAt: sfu.routerManager?._routerMetadata?.get(roomId)?.createdAt,
        });
    }

    sendSuccess(res, 200, {
        rooms: roomList,
        total: roomList.length,
    });
});

/**
 * Get room details
 * GET /api/v1/sfu/rooms/:roomId
 */
export const getRoom = catchAsync(async (req, res, next) => {
    const { roomId } = req.params;

    if (!roomId) {
        return next(new AppError('roomId is required', 400));
    }

    const router = sfu.routerManager?.getRouter(roomId);
    if (!router) {
        return next(new AppError(`Room ${roomId} not found`, 404));
    }

    const producers = sfu.producerManager?.getProducersForRoom(roomId) || [];
    const consumers = sfu.consumerManager?.getConsumersForRoom(roomId) || [];

    sendSuccess(res, 200, {
        roomId,
        routerId: router.id,
        active: !router.closed,
        producers: producers.map(p => ({
            id: p.id,
            kind: p.metadata?.kind,
            source: p.metadata?.source,
            socketId: p.metadata?.socketId,
            paused: p.metadata?.paused,
        })),
        consumers: consumers.map(c => ({
            id: c.id,
            producerId: c.metadata?.producerId,
            kind: c.metadata?.kind,
            socketId: c.metadata?.socketId,
            paused: c.metadata?.paused,
        })),
        stats: {
            producerCount: producers.length,
            consumerCount: consumers.length,
        },
    });
});
// In sfu.controller.js - the consume endpoint
export const consume = catchAsync(async (req, res, next) => {
  const { transportId, producerId, rtpCapabilities } = req.body;

  if (!transportId || !producerId || !rtpCapabilities) {
    return next(new AppError('transportId, producerId, and rtpCapabilities are required', 400));
  }

  try {
    // Create consumer on the server
    const consumer = await sfu.createConsumer({
      transportId,
      socketId: req.body.socketId || 'anonymous',
      roomId: req.body.roomId || 'default',
      producerId,
      rtpCapabilities,
      options: { paused: true }, // Start paused, resume after creation
    });

    // ✅ IMPORTANT: The consumer object from mediasoup has all the needed data
    // Return the complete consumer data with proper structure
    sendSuccess(res, 200, {
      id: consumer.id,
      producerId: consumer.producerId, // ← This is the producerId being consumed
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters, // ← This must be the FULL rtpParameters
      type: consumer.type,
      // Also include these for debugging
      consumerId: consumer.id,
    });

    // ✅ Resume the consumer after sending response
    await consumer.resume();
    
  } catch (error) {
    logger.error('Consume error:', error);
    return next(new AppError(error.message, 500));
  }
});
/**
 * Delete a room
 * DELETE /api/v1/sfu/rooms/:roomId
 */
export const deleteRoom = catchAsync(async (req, res, next) => {
    const { roomId } = req.params;

    if (!roomId) {
        return next(new AppError('roomId is required', 400));
    }

    const router = sfu.routerManager?.getRouter(roomId);
    if (!router) {
        return next(new AppError(`Room ${roomId} not found`, 404));
    }

    // Close all producers in the room
    await sfu.producerManager?.closeRoomProducers(roomId, 'room_deleted');
    
    // Close all consumers in the room
    await sfu.consumerManager?.closeRoomConsumers(roomId, 'room_deleted');
    
    // Close all transports in the room
    await sfu.transportManager?.closeRoomTransports(roomId, 'room_deleted');
    
    // Close the router
    await sfu.routerManager?.closeRouter(roomId);

    logger.info(`🗑️ Room deleted: ${roomId}`);

    sendSuccess(res, 200, {
        roomId,
        deleted: true,
        timestamp: new Date().toISOString(),
    });
});

// ============================================================
// PRODUCER MANAGEMENT (HTTP Admin APIs)
// ============================================================

/**
 * Get all producers in a room
 * GET /api/v1/sfu/rooms/:roomId/producers
 */
export const getRoomProducers = catchAsync(async (req, res, next) => {
    const { roomId } = req.params;

    if (!roomId) {
        return next(new AppError('roomId is required', 400));
    }

    const producers = sfu.producerManager?.getProducersForRoom(roomId) || [];

    sendSuccess(res, 200, {
        roomId,
        producers: producers.map(p => ({
            id: p.id,
            kind: p.metadata?.kind,
            source: p.metadata?.source,
            socketId: p.metadata?.socketId,
            paused: p.metadata?.paused,
            createdAt: p.metadata?.createdAt,
        })),
        total: producers.length,
    });
});

/**
 * Get all consumers in a room
 * GET /api/v1/sfu/rooms/:roomId/consumers
 */
export const getRoomConsumers = catchAsync(async (req, res, next) => {
    const { roomId } = req.params;

    if (!roomId) {
        return next(new AppError('roomId is required', 400));
    }

    const consumers = sfu.consumerManager?.getConsumersForRoom(roomId) || [];

    sendSuccess(res, 200, {
        roomId,
        consumers: consumers.map(c => ({
            id: c.id,
            producerId: c.metadata?.producerId,
            kind: c.metadata?.kind,
            socketId: c.metadata?.socketId,
            paused: c.metadata?.paused,
            createdAt: c.metadata?.createdAt,
        })),
        total: consumers.length,
    });
});

/**
 * Force close a producer (Admin only)
 * DELETE /api/v1/sfu/producers/:producerId
 */
export const forceCloseProducer = catchAsync(async (req, res, next) => {
    const { producerId } = req.params;

    if (!producerId) {
        return next(new AppError('producerId is required', 400));
    }

    const producer = sfu.producerManager?.getProducer(producerId);
    if (!producer) {
        return next(new AppError(`Producer ${producerId} not found`, 404));
    }

    await sfu.producerManager?.closeProducer(producerId, 'admin_forced');

    logger.info(`🔒 Producer ${producerId} force closed by admin`);

    sendSuccess(res, 200, {
        producerId,
        closed: true,
        timestamp: new Date().toISOString(),
    });
});

/**
 * Force close a consumer (Admin only)
 * DELETE /api/v1/sfu/consumers/:consumerId
 */
export const forceCloseConsumer = catchAsync(async (req, res, next) => {
    const { consumerId } = req.params;

    if (!consumerId) {
        return next(new AppError('consumerId is required', 400));
    }

    const consumer = sfu.consumerManager?.getConsumer(consumerId);
    if (!consumer) {
        return next(new AppError(`Consumer ${consumerId} not found`, 404));
    }

    await sfu.consumerManager?.closeConsumer(consumerId, 'admin_forced');

    logger.info(`🔒 Consumer ${consumerId} force closed by admin`);

    sendSuccess(res, 200, {
        consumerId,
        closed: true,
        timestamp: new Date().toISOString(),
    });
});

// ============================================================
// STATS & MONITORING
// ============================================================

/**
 * Get SFU stats
 * GET /api/v1/sfu/stats
 */
export const getSFUStats = catchAsync(async (req, res) => {
    const stats = {
        sfu: {
            initialized: sfu.isReady(),
            workers: sfu.workerManager?.count || 0,
            routers: sfu.routerManager?.count || 0,
            transports: sfu.transportManager?.count || 0,
            producers: sfu.producerManager?.count || 0,
            consumers: sfu.consumerManager?.count || 0,
        },
        workers: sfu.workerManager?.getWorkerStatuses?.() || [],
        transports: sfu.transportManager?.getTransportStatuses?.() || [],
        timestamp: new Date().toISOString(),
    };

    sendSuccess(res, 200, stats);
});

/**
 * Get SFU health
 * GET /api/v1/sfu/health
 */
export const getSFUHealth = catchAsync(async (req, res) => {
    const workerHealth = await sfu.workerManager?.healthCheck?.() || { healthy: false };
    const transportHealth = sfu.transportManager?.healthCheck?.() || { healthy: false };
    const producerHealth = sfu.producerManager?.healthCheck?.() || { healthy: false };
    const consumerHealth = sfu.consumerManager?.healthCheck?.() || { healthy: false };

    const isHealthy = sfu.isReady() && 
        workerHealth.healthy !== false && 
        transportHealth.healthy !== false &&
        producerHealth.healthy !== false &&
        consumerHealth.healthy !== false;

    sendSuccess(res, isHealthy ? 200 : 503, {
        status: isHealthy ? 'healthy' : 'degraded',
        sfu: {
            initialized: sfu.isReady(),
        },
        workers: workerHealth,
        transports: transportHealth,
        producers: producerHealth,
        consumers: consumerHealth,
        timestamp: new Date().toISOString(),
    });
});

// ============================================================
// UTILITY
// ============================================================

/**
 * Get router capabilities
 * GET /api/v1/sfu/capabilities
 */
export const getCapabilities = catchAsync(async (req, res) => {
    const capabilities = sfu.getRtpCapabilities();
    
    sendSuccess(res, 200, {
        capabilities,
        timestamp: new Date().toISOString(),
    });
});

/**
 * Reset SFU (Admin only - dangerous!)
 * POST /api/v1/sfu/reset
 */
export const resetSFU = catchAsync(async (req, res, next) => {
    // This is a dangerous operation - should be admin only
    // Check if admin role in your auth middleware
    
    logger.warn('⚠️ SFU reset initiated by admin');

    try {
        // Shutdown everything
        await sfu.shutdown();
        
        // Re-initialize
        await sfu.initialize({
            listenIp: '0.0.0.0',
            announcedIp: '127.0.0.1',
        });

        logger.info('✅ SFU reset completed');

        sendSuccess(res, 200, {
            reset: true,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        logger.error('❌ SFU reset failed:', error);
        return next(new AppError('SFU reset failed: ' + error.message, 500));
    }
});