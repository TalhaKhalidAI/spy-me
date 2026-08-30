import sfu from '../../services/mediasoup/index.js';
import logger from '../utils/logger.js';
import { catchAsync, sendSuccess } from '../utils/response.util.js';
import { AppError } from '../middleware/error.middleware.js';
import { prisma } from '../../config/databases.js';

/**
 * Create a new room
 * POST /api/v1/rooms
 */
export const createRoom = catchAsync(async (req, res, next) => {
    const { roomId, name, description, options = {} } = req.body;

    if (!roomId) {
        return next(new AppError('roomId is required', 400));
    }

    if (!sfu.isReady()) {
        return next(new AppError('SFU is not initialized', 503));
    }

    try {
        // Create router in Mediasoup
        const router = await sfu.routerManager.createRouter(roomId, {
            mediaCodecs: options.mediaCodecs || undefined,
            appData: {
                name,
                description,
                createdBy: req.user.id
            }
        });

        // Save to database
        await prisma.room.create({
            data: {
                roomId,
                name,
                description,
                userId: req.user.id
            }
        });

        logger.info(`✅ Router created: ${router.id}`);

        sendSuccess(res, 201, {
            roomId,
            routerId: router.id,
            createdAt: new Date().toISOString(),
        });

    } catch (error) {
        logger.error('❌ Failed to create room:', error);
        return next(new AppError(`Room creation failed: ${error.message}`, 500));
    }
});

/**
 * Update a room (name, description)
 * PUT /api/v1/rooms/:roomId
 */
export const updateRoom = catchAsync(async (req, res, next) => {
    const { roomId } = req.params;
    const { name, description } = req.body;

    if (!roomId) {
        return next(new AppError('roomId is required', 400));
    }

    const existingRoom = await prisma.room.findUnique({
        where: { roomId }
    });

    if (!existingRoom) {
        return next(new AppError('Room not found', 404));
    }

    const updatedRoom = await prisma.room.update({
        where: { roomId },
        data: { name, description }
    });

    sendSuccess(res, 200, { room: updatedRoom }, 'Room updated successfully');
});

/**
 * Get all rooms or a specific room
 * GET /api/v1/rooms
 */
export const getRooms = catchAsync(async (req, res, next) => {
    const { id } = req.query; // optional roomId

    if (id) {
        // Fetch specific room
        const dbInfo = await prisma.room.findUnique({
            where: { roomId: id },
            include: { user: true }
        });

        if (!dbInfo) {
            return next(new AppError('Room not found in database', 404));
        }

        const router = sfu.routerManager?.getRouter(id);
        const producers = sfu.producerManager?.getProducersForRoom(id) || [];
        const consumers = sfu.consumerManager?.getConsumersForRoom(id) || [];

        const formattedResponse = {
            [dbInfo.userId]: {
                [id]: {
                    name: dbInfo.name,
                    description: dbInfo.description,
                    routerId: router?.id || null,
                    active: router ? !router.closed : false,
                    producers: producers.map(p => ({
                        id: p.id,
                        kind: p.appData?.kind || p.metadata?.kind,
                        source: p.appData?.source || p.metadata?.source,
                        socketId: p.appData?.socketId || p.metadata?.socketId,
                        paused: p.appData?.paused || p.metadata?.paused,
                        clientName: p.appData?.clientName || p.metadata?.clientName || 'Unknown',
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
                    }
                }
            }
        };

        return sendSuccess(res, 200, formattedResponse);
    }

    // Fetch all rooms grouped by user
    const dbRooms = await prisma.room.findMany({
        include: { user: true }
    });

    const formattedResponse = {};

    // Group rooms by userId with full details
    for (const room of dbRooms) {
        if (!formattedResponse[room.userId]) {
            formattedResponse[room.userId] = {};
        }

        const router = sfu.routerManager?.getRouter(room.roomId);
        const producers = sfu.producerManager?.getProducersForRoom(room.roomId) || [];
        const consumers = sfu.consumerManager?.getConsumersForRoom(room.roomId) || [];

        formattedResponse[room.userId][room.roomId] = {
            name: room.name,
            description: room.description,
            routerId: router?.id || null,
            active: router ? !router.closed : false,
            producers: producers.map(p => ({
                id: p.id,
                kind: p.appData?.kind || p.metadata?.kind,
                source: p.appData?.source || p.metadata?.source,
                socketId: p.appData?.socketId || p.metadata?.socketId,
                paused: p.appData?.paused || p.metadata?.paused,
                clientName: p.appData?.clientName || p.metadata?.clientName || 'Unknown',
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
            }
        };
    }

    sendSuccess(res, 200, formattedResponse);
});

/**
 * Delete a room
 * DELETE /api/v1/rooms/:roomId
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

    // Remove from DB
    await prisma.room.deleteMany({
        where: { roomId }
    });

    logger.info(`🗑️ Room deleted: ${roomId}`);

    sendSuccess(res, 200, {
        roomId,
        deleted: true,
        timestamp: new Date().toISOString(),
    });
});
