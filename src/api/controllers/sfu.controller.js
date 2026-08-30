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

// Room management moved to room.controller.js

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
export const getCapabilities = catchAsync(async (req, res, next) => {
    if (!sfu.isReady()) {
        return next(new AppError('SFU not initialized', 503));
    }
    
    // In Mediasoup, typically you get the RTP capabilities from the router.
    // If there is a main router or a way to get default capabilities:
    const router = Array.from(sfu.routerManager?.routers?.values() || [])[0];
    if (!router) {
        return next(new AppError('No active routers found', 503));
    }

    sendSuccess(res, 200, router.rtpCapabilities);
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