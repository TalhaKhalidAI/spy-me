console.log("DEBUG: server.js started!");
// server.js - FIXED VERSION

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import http from 'http';
import https from 'https';
import path from 'path';
import fs from 'fs';
import { Server } from 'socket.io';

import passport from './src/config/passport.js';
import { env } from './src/config/env.js';
import logger from './src/api/utils/logger.js';
import { errorHandler } from './src/api/middleware/error.middleware.js';
import swaggerSpec from './src/config/swagger.js';
import apiRouter from './src/api/index.js';
import { randomUUID } from 'crypto';

// ✅ Import SFU
import sfu from './src/services/mediasoup/index.js';

import { prisma } from './src/config/databases.js';
import jwt from "jsonwebtoken";
console.log("DEBUG: server.js line 30 executed");

// Global error handling for promises and exceptions
process.on('unhandledRejection', (reason, promise) => {
    console.error('❗ Unhandled Rejection at:', promise, 'reason:', reason);
    logger.error('❗ Unhandled Rejection', { reason });
});
process.on('uncaughtException', (err) => {
    console.error('❗ Uncaught Exception:', err);
    logger.error('❗ Uncaught Exception', { err });
    // Optionally exit after logging
    // process.exit(1);
});

console.log("DEBUG: server.js express created");
const app = express();
app.set('trust proxy', 1);

/**
 * Helper to safely extract callback function from socket.io arguments
 */
const extractCallback = (...args) => {
    for (let i = args.length - 1; i >= 0; i--) {
        if (typeof args[i] === 'function') {
            return args[i];
        }
    }
    return null;
};

/**
 * Load SSL certificates with robust candidate fallbacks
 */
const getSslOptions = () => {
    const defaultCandidates = [
        {
            key: env.SSL_KEY_PATH || './src/certs/status.lab.mli.key',
            cert: env.SSL_CERT_PATH || './src/certs/status.lab.mli.crt',
            ca: './src/certs/talha-rootCA.crt',
            name: 'configured / status.lab.mli',
        },
        {
            key: './src/certs/server.key',
            cert: './src/certs/server.crt',
            ca: './src/certs/talha-rootCA.crt',
            name: 'fallback server.key/server.crt',
        },
        {
            key: './src/certs/status.lab.mli.key',
            cert: './src/certs/status.lab.mli.crt',
            ca: './src/certs/talha-rootCA.crt',
            name: 'status.lab.mli standard certs',
        }
    ];

    for (const candidate of defaultCandidates) {
        const keyPath = path.isAbsolute(candidate.key) ? candidate.key : path.resolve(process.cwd(), candidate.key);
        const certPath = path.isAbsolute(candidate.cert) ? candidate.cert : path.resolve(process.cwd(), candidate.cert);

        if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
            try {
                const key = fs.readFileSync(keyPath);
                const cert = fs.readFileSync(certPath);
                const sslOptions = { key, cert };

                if (candidate.ca) {
                    const caPath = path.isAbsolute(candidate.ca) ? candidate.ca : path.resolve(process.cwd(), candidate.ca);
                    if (fs.existsSync(caPath)) {
                        try {
                            sslOptions.ca = fs.readFileSync(caPath);
                        } catch (caErr) {
                            // CA is optional
                        }
                    }
                }

                console.log(`🔒 SSL Certificates loaded successfully (${candidate.name}):`);
                console.log(`   🔑 Key:  ${keyPath}`);
                console.log(`   📜 Cert: ${certPath}`);
                return sslOptions;
            } catch (err) {
                if (err.code === 'EACCES') {
                    console.warn(`⚠️  [SSL Permission Error] Cannot read key/cert at ${err.path}`);
                    logger.warn(`⚠️  [SSL Permission Error] Cannot read key/cert at ${err.path}`);
                } else {
                    console.warn(`⚠️  [SSL Error] Failed to read certificate candidate (${candidate.name}): ${err.message}`);
                    logger.warn(`⚠️  [SSL Error] Failed to read certificate candidate (${candidate.name}): ${err.message}`);
                }
            }
        }
    }

    throw new Error('No valid SSL certificate and key pair could be loaded from ./src/certs/');
};

// ─── Request Context ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
    req.id = req.headers['x-request-id'] || randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
});

// ─── Rate Limiting ───────────────────────────────────────────────────────────
const limiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS || 60000, // 1 minute
    max: env.RATE_LIMIT_MAX || 10000, // 10000 requests per minute

    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 'fail', message: 'Too many requests, please try again later.' },
});
if (env.RATE_LIMIT_ENABLED) {
    app.use('/api', limiter);
}


// ─── Core Middleware ─────────────────────────────────────────────────────────
app.use(helmet());
let corsOptions = { credentials: true };
if (env.CORS_ORIGIN && env.CORS_ORIGIN !== '*') {
    corsOptions.origin = env.CORS_ORIGIN.split(',').map(o => o.trim());
} else {
    corsOptions.origin = true; // Reflect request origin to allow credentials for any domain
}
app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// ─── HTTP Request Logger ─────────────────────────────────────────────────────
app.use((req, res, next) => {
    logger.http(`${req.method} ${req.url}`, { requestId: req.id });
    next();
});

// ─── Passport ────────────────────────────────────────────────────────────────
app.use(passport.initialize());

// ─── Swagger Documentation ───────────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use('/api', apiRouter);

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
    res.status(200).json({
        status: 'success',
        server: 'up',
        sfu: sfu.isReady() ? 'ready' : 'initializing',
        timestamp: new Date().toISOString(),
    });
});

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({
        status: 'fail',
        message: `Cannot ${req.method} ${req.originalUrl}`,
    });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Create Server (HTTPS / HTTP) ───────────────────────────────────────────
const PORT = env.PORT || 3000;

const createServerInstance = () => {
    if (env.HTTPS_ENABLED !== false) {
        try {
            const sslOptions = getSslOptions();
            return https.createServer(sslOptions, app);
        } catch (sslErr) {
            console.error(`❌ Could not start HTTPS server due to SSL certificate error: ${sslErr.message}`);
            console.warn(`⚠️  Falling back to HTTP server...`);
            logger.error(`❌ Could not start HTTPS server due to SSL certificate error: ${sslErr.message}`);
            logger.warn(`⚠️  Falling back to HTTP server...`);
            return http.createServer(app);
        }
    }
    return http.createServer(app);
};

const server = createServerInstance();

// ─── Socket.IO Server ────────────────────────────────────────────────────────
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true,
    },
    allowEIO3: true,
    transports: ['websocket', 'polling'],
    allowUpgrades: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 45000,
    maxHttpBufferSize: 1e6,
});

// ─── Socket.IO Authentication Middleware ────────────────────────────────────
io.use(async (socket, next) => {
    try {
        let token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token) {
            return next(new Error('Authentication error: Token required'));
        }

        // Remove 'Bearer ' if passed in
        if (token.startsWith('Bearer ')) token = token.slice(7);

        const decoded = jwt.verify(token, env.JWT_SECRET);

        // Ensure ONLY the permanent token can connect to WebSockets
        if (decoded.type !== 'permanent') {
            return next(new Error('Authentication error: Only permanent service tokens are allowed for WebSockets'));
        }

        // Load the real user from the database
        const user = await prisma.user.findUnique({
            where: { id: decoded.sub },
            include: { 
                permissions: true,
                rooms: true,
                grantedRooms: true
            }
        });

        if (!user || !user.isActive || user.deletedAt) {
            return next(new Error('Authentication error: User inactive or not found'));
        }

        socket.user = user;
        next();
    } catch (err) {
        return next(new Error('Authentication error: Invalid token'));
    }
});

// Helper to verify if a user has access to a specific room
const getAuthorizedRoomId = (data, socket) => {
    const roomId = data?.roomId || socket.roomId;
    if (socket.user.role === 'ADMIN') return roomId;
    const isOwner = socket.user.rooms?.some(r => r.roomId === roomId);
    const isGranted = socket.user.grantedRooms?.some(r => r.roomId === roomId);
    if (!isOwner && !isGranted) {
        throw new Error(`Forbidden: You do not have permission to access room ${roomId}`);
    }
    return roomId;
};

/**
 * Check that the connected user (non-admin) has a specific permission.
 * Admins always pass. Throws on failure — cannot be bypassed by frontend JS.
 */
const socketRequirePermission = (socket, permissionName) => {
    if (socket.user.role === 'ADMIN') return; // Admins always allowed
    const hasPermission = socket.user.permissions?.some(p => p.name === permissionName);
    if (!hasPermission) {
        throw new Error(`Forbidden: Missing permission '${permissionName}'`);
    }
};

// ─── Socket.IO Connection Handler ────────────────────────────────────────────
io.on('connection', (socket) => {
    const socketId = socket.id;
    console.log(`🔌 Client connected: ${socketId}`);

    // ─── 1️⃣ getRouterRtpCapabilities ──────────────────────────
    socket.on('getRouterRtpCapabilities', async (...args) => {
        const callback = extractCallback(...args);
        try {
            if (!sfu.isReady()) {
                throw new Error('SFU not ready');
            }

            const caps = sfu.getRtpCapabilities();

            if (callback) {
                callback({
                    codecs: caps.codecs || [],
                    headerExtensions: caps.headerExtensions || [],
                });
            }

            console.log(`📡 RTP capabilities sent to ${socketId}`);
        } catch (error) {
            console.error(`❌ getRouterRtpCapabilities error:`, error.message);
            if (callback) callback({ error: error.message });
        }
    });

    // ─── 2️⃣ createSendTransport ─────────────────────────────────
    socket.on('createSendTransport', async (...args) => {
        const callback = extractCallback(...args);
        const data = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};
        try {
            if (!sfu.isReady()) {
                throw new Error('SFU not ready');
            }

            const roomId = getAuthorizedRoomId(data, socket);
            const result = await sfu.createSendTransport(socketId, roomId, {
                appData: {
                    clientName: socket.user.username,
                    role: socket.user.role
                }
            });

            if (callback) {
                callback({
                    id: result.id,
                    iceParameters: result.iceParameters,
                    iceCandidates: result.iceCandidates,
                    dtlsParameters: result.dtlsParameters,
                    sctpParameters: result.sctpParameters,
                });
            }

            console.log(`🚀 Send transport created: ${result.id} for ${socketId} in room ${roomId}`);
        } catch (error) {
            console.error(`❌ createSendTransport error:`, error.message);
            if (callback) callback({ error: error.message });
        }
    });

    // ─── 3️⃣ createRecvTransport ─────────────────────────────────
    socket.on('createRecvTransport', async (...args) => {
        const callback = extractCallback(...args);
        const data = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};
        try {
            if (!sfu.isReady()) {
                throw new Error('SFU not ready');
            }

            const roomId = getAuthorizedRoomId(data, socket);
            const result = await sfu.createRecvTransport(socketId, roomId, {
                appData: {
                    clientName: socket.user.username,
                    role: socket.user.role
                }
            });

            if (callback) {
                callback({
                    id: result.id,
                    iceParameters: result.iceParameters,
                    iceCandidates: result.iceCandidates,
                    dtlsParameters: result.dtlsParameters,
                    sctpParameters: result.sctpParameters,
                });
            }

            console.log(`📥 Receive transport created: ${result.id} for ${socketId} in room ${roomId}`);
        } catch (error) {
            console.error(`❌ createRecvTransport error:`, error.message);
            if (callback) callback({ error: error.message });
        }
    });

    // ─── 4️⃣ connectTransport ─────────────────────────────────
    socket.on('connectTransport', async (...args) => {
        const callback = extractCallback(...args);
        const data = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};
        try {
            if (!sfu.isReady()) {
                throw new Error('SFU not ready');
            }

            const { transportId, dtlsParameters } = data;

            if (!transportId) {
                throw new Error('transportId is required');
            }
            if (!dtlsParameters) {
                throw new Error('dtlsParameters is required');
            }

            await sfu.connectTransport(transportId, dtlsParameters);

            if (callback) callback({ success: true });
            console.log(`🔗 Transport connected: ${transportId}`);
        } catch (error) {
            console.error(`❌ connectTransport error:`, error.message);
            if (callback) callback({ error: error.message });
        }
    });

    // ─── 5️⃣ produce ─────────────────────────────────────────────
    socket.on('produce', async (...args) => {
        const callback = extractCallback(...args);
        const data = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};
        try {
            if (!sfu.isReady()) {
                throw new Error('SFU not ready');
            }

            const {
                transportId,
                kind,
                rtpParameters,
                source = 'camera',
                roomId = getAuthorizedRoomId(data, socket)
            } = data;

            if (!transportId) {
                throw new Error('transportId is required');
            }
            if (!kind) {
                throw new Error('kind is required');
            }
            if (!rtpParameters) {
                throw new Error('rtpParameters is required');
            }

            const producer = await sfu.createProducer({
                transportId,
                socketId,
                roomId,
                kind,
                rtpParameters,
                source,
                appData: {
                    clientName: socket.clientName || socket.user?.username || 'Unknown',
                    role: socket.user?.role || 'user'
                }
            });

            // Notify other clients in the room
            socket.to(roomId).emit('newProducer', {
                producerId: producer.id,
                socketId: socketId,
                kind: kind,
                source: source,
                clientName: socket.clientName || socket.user?.username || 'Unknown',
            });

            if (callback) {
                callback({
                    producerId: producer.id,
                });
            }

            console.log(`📹 Producer created: ${producer.id} (${kind}) for ${socketId}`);
        } catch (error) {
            console.error(`❌ produce error:`, error.message);
            if (callback) callback({ error: error.message });
        }
    });

    // ─── 6️⃣ consume ─────────────────────────────────────────────
    socket.on('consume', async (...args) => {
        const callback = extractCallback(...args);
        const data = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};
        try {
            if (!sfu.isReady()) {
                throw new Error('SFU not ready');
            }

            const {
                transportId,
                producerId,
                rtpCapabilities,
                roomId = getAuthorizedRoomId(data, socket)
            } = data;

            if (!transportId) {
                throw new Error('transportId is required');
            }
            if (!producerId) {
                throw new Error('producerId is required');
            }
            if (!rtpCapabilities) {
                throw new Error('rtpCapabilities is required');
            }

            const consumer = await sfu.createConsumer({
                transportId,
                socketId,
                roomId,
                producerId,
                rtpCapabilities,
                options: {
                    paused: false,
                    appData: {
                        clientName: socket.user.username,
                        role: socket.user.role
                    }
                },
            });
            if (consumer.kind === 'video') {
                await consumer.requestKeyFrame();
            }
            if (callback) {
                callback({
                    consumerId: consumer.id,
                    rtpParameters: consumer.rtpParameters,
                    kind: consumer.kind,
                    producerId: consumer.producerId,
                });
            }

            console.log(`📥 Consumer created: ${consumer.id} for ${socketId}`);
        } catch (error) {
            console.error(`❌ consume error:`, error.message);
            if (callback) callback({ error: error.message });
        }
    });

    // ─── 7️⃣ pauseProducer ────────────────────────────────────────
    socket.on('pauseProducer', async (...args) => {
        const callback = extractCallback(...args);
        const data = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};
        try {
            // Ownership: only own producers or ADMIN
            const producer = sfu.producerManager?.getProducer(data.producerId);
            if (producer && socket.user.role !== 'ADMIN' && producer.appData?.socketId !== socket.id) {
                throw new Error('Forbidden: Cannot pause another peer\'s producer');
            }
            await sfu.pauseProducer(data.producerId);
            if (callback) callback({ success: true });
            console.log(`⏸️ Producer paused: ${data.producerId}`);
        } catch (error) {
            console.error(`❌ pauseProducer error:`, error.message);
            if (callback) callback({ error: error.message });
        }
    });

    // ─── 8️⃣ resumeProducer ───────────────────────────────────────
    socket.on('resumeProducer', async (...args) => {
        const callback = extractCallback(...args);
        const data = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};
        try {
            // Ownership: only own producers or ADMIN
            const producer = sfu.producerManager?.getProducer(data.producerId);
            if (producer && socket.user.role !== 'ADMIN' && producer.appData?.socketId !== socket.id) {
                throw new Error('Forbidden: Cannot resume another peer\'s producer');
            }
            await sfu.resumeProducer(data.producerId);
            if (callback) callback({ success: true });
            console.log(`▶️ Producer resumed: ${data.producerId}`);
        } catch (error) {
            console.error(`❌ resumeProducer error:`, error.message);
            if (callback) callback({ error: error.message });
        }
    });

    // ─── 9️⃣ pauseConsumer ────────────────────────────────────────
    socket.on('pauseConsumer', async (...args) => {
        const callback = extractCallback(...args);
        const data = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};
        try {
            await sfu.pauseConsumer(data.consumerId);
            if (callback) callback({ success: true });
            console.log(`⏸️ Consumer paused: ${data.consumerId}`);
        } catch (error) {
            console.error(`❌ pauseConsumer error:`, error.message);
            if (callback) callback({ error: error.message });
        }
    });

    // ─── 1️⃣0️⃣ resumeConsumer ──────────────────────────────────────
    socket.on('resumeConsumer', async (...args) => {
        const callback = extractCallback(...args);
        const data = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};
        try {
            await sfu.resumeConsumer(data.consumerId);

            // ✅ Fetch the real consumer, then request keyframe
            const consumer = sfu.consumerManager.getConsumer(data.consumerId);
            if (consumer && consumer.kind === 'video') {
                await consumer.requestKeyFrame();
            }

            if (callback) callback({ success: true });
            console.log(`▶️ Consumer resumed: ${data.consumerId}`);
        } catch (error) {
            console.error(`❌ resumeConsumer error:`, error.message);
            if (callback) callback({ error: error.message });
        }
    });

    // ─── 1️⃣1️⃣ closeProducer ──────────────────────────────────────
    socket.on('closeProducer', async (...args) => {
        const callback = extractCallback(...args);
        const data = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};
        try {
            // Ownership: only own producers or ADMIN
            const producer = sfu.producerManager?.getProducer(data.producerId);
            if (producer && socket.user.role !== 'ADMIN' && producer.appData?.socketId !== socket.id) {
                throw new Error('Forbidden: Cannot close another peer\'s producer');
            }
            await sfu.closeProducer(data.producerId);
            if (socket.roomId) {
                socket.to(socket.roomId).emit('producerClosed', { producerId: data.producerId });
            }
            if (callback) callback({ success: true });
            console.log(`🗑️ Producer closed: ${data.producerId}`);
        } catch (error) {
            console.error(`❌ closeProducer error:`, error.message);
            if (callback) callback({ error: error.message });
        }
    });

    // ─── 1️⃣2️⃣ closeConsumer ──────────────────────────────────────
    socket.on('closeConsumer', async (...args) => {
        const callback = extractCallback(...args);
        const data = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};
        try {
            await sfu.closeConsumer(data.consumerId);
            if (callback) callback({ success: true });
            console.log(`🗑️ Consumer closed: ${data.consumerId}`);
        } catch (error) {
            console.error(`❌ closeConsumer error:`, error.message);
            if (callback) callback({ error: error.message });
        }
    });

    // ─── 1️⃣3️⃣ joinRoom ───────────────────────────────────────────
    socket.on('joinRoom', async (...args) => {
        const callback = extractCallback(...args);
        const data = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};
        try {
            const roomId = getAuthorizedRoomId(data, socket);
            const { clientName } = data;

            if (clientName) {
                socket.clientName = clientName;
            }

            // 1. Verify the room actually exists in the Prisma Database
            const dbRoom = await prisma.room.findUnique({
                where: { roomId }
            });
            if (!dbRoom) {
                throw new Error('Invalid Room: This room does not exist in the database');
            }

            // 2. Check if the Mediasoup Router exists in memory
            let router = sfu.routerManager?.getRouter(roomId);

            // 3. If the server rebooted (wiping memory) but the DB room is valid, recreate the Mediasoup router!
            if (!router) {
                console.log(`⚠️ Router missing for DB room ${roomId}. Re-creating in Mediasoup...`);
                router = await sfu.routerManager.createRouter(roomId);
            }

            // Leave previous room
            if (socket.roomId) {
                socket.leave(socket.roomId);
            }

            // Join new room
            socket.join(roomId);
            socket.roomId = roomId;

            // ✅ Send callback
            if (callback) {
                callback({ success: true, roomId });
            }

            console.log(`🏠 ${socketId} joined room: ${roomId}`);
        } catch (error) {
            console.error(`❌ joinRoom error:`, error.message);
            if (callback) {
                callback({ error: error.message });
            }
        }
    });

    socket.on('refreshPage', async (...args) => {
        const callback = extractCallback(...args);
        const data = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};
        try {
            socketRequirePermission(socket, 'permission.peer.refresh');
            const roomId = getAuthorizedRoomId(data, socket);
            const { targetSocketId } = data;

            if (!roomId) {
                throw new Error('roomId is required');
            }

            // 1. If you provided a specific target client, send the command ONLY to them
            if (targetSocketId) {
                socket.to(targetSocketId).emit('executeCommand', { command: 'refresh' });
                console.log(`🔄 Sent refresh command to specific client: ${targetSocketId}`);
            }
            // 2. Otherwise, broadcast the command to EVERYONE in the room
            else {
                socket.to(roomId).emit('executeCommand', { command: 'refresh' });
                console.log(`🔄 Broadcasted refresh command to room: ${roomId}`);
            }

            // ✅ Acknowledge success back to the Admin dashboard
            if (callback) {
                callback({ success: true, roomId });
            }

        } catch (error) {
            console.error(`❌ refreshPage error:`, error.message);
            if (callback) {
                callback({ error: error.message });
            }
        }
    });

    socket.on('closeTab', async (...args) => {
        const callback = extractCallback(...args);
        const data = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};

        try {
            socketRequirePermission(socket, 'permission.peer.kick');
            const roomId = getAuthorizedRoomId(data, socket);
            const { targetSocketId } = data;

            if (targetSocketId) {
                socket.to(targetSocketId).emit('executeCommand', { command: 'closeTab' });
                console.log(`🚪 Sent close tab to specific client: ${targetSocketId}`);
            } else {
                socket.to(roomId).emit('executeCommand', { command: 'closeTab' });
                console.log(`🚪 Broadcasted close tab to room: ${roomId}`);
            }

            if (callback) callback({ success: true, roomId });
        } catch (error) {
            console.error(`❌ closeTab error:`, error.message);
            if (callback) callback({ error: error.message });
        }
    });

    // ─── Location Tracking ──────────────────────────────────────────────
    socket.on('requestLocation', async (...args) => {
        const callback = extractCallback(...args);
        const data = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};

        try {
            socketRequirePermission(socket, 'permission.peer.location');
            const roomId = getAuthorizedRoomId(data, socket);
            const { targetSocketId } = data;

            if (targetSocketId) {
                socket.to(targetSocketId).emit('executeCommand', { 
                    command: 'getLocation', 
                    payload: { requesterId: socket.id } 
                });
                console.log(`📍 Requested location from specific client: ${targetSocketId}`);
            } else {
                socket.to(roomId).emit('executeCommand', { 
                    command: 'getLocation',
                    payload: { requesterId: socket.id }
                });
                console.log(`📍 Broadcasted location request to room: ${roomId}`);
            }

            if (callback) callback({ success: true, roomId });
        } catch (error) {
            console.error(`❌ requestLocation error:`, error.message);
            if (callback) callback({ error: error.message });
        }
    });

    socket.on('submitLocation', async (...args) => {
        const callback = extractCallback(...args);
        const data = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};

        try {
            const { requesterId, location } = data;
            if (requesterId && location) {
                socket.to(requesterId).emit('locationResult', {
                    targetId: socket.id,
                    location
                });
                console.log(`📍 Forwarded location from ${socket.id} to ${requesterId}`);
            }
            if (callback) callback({ success: true });
        } catch (error) {
            console.error(`❌ submitLocation error:`, error.message);
            if (callback) callback({ error: error.message });
        }
    });

    // ─── Toggle Camera ──────────────────────────────────────────────────
    socket.on('toggleCamera', async (...args) => {
        const callback = extractCallback(...args);
        const data = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};

        try {
            socketRequirePermission(socket, 'permission.peer.cam');
            const roomId = getAuthorizedRoomId(data, socket);
            const { targetSocketId, enabled } = data;

            const command = {
                command: 'toggleCamera',
                payload: { enabled: enabled !== undefined ? enabled : true }
            };

            if (targetSocketId) {
                socket.to(targetSocketId).emit('executeCommand', command);
                console.log(`📷 Sent toggle camera to specific client: ${targetSocketId} (${enabled ? 'ON' : 'OFF'})`);
            } else {
                socket.to(roomId).emit('executeCommand', command);
                console.log(`📷 Broadcasted toggle camera to room: ${roomId} (${enabled ? 'ON' : 'OFF'})`);
            }

            if (callback) callback({ success: true, roomId });
        } catch (error) {
            console.error(`❌ toggleCamera error:`, error.message);
            if (callback) callback({ error: error.message });
        }
    });

    // ─── Toggle Microphone ──────────────────────────────────────────────
    socket.on('toggleMic', async (...args) => {
        const callback = extractCallback(...args);
        const data = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};

        try {
            socketRequirePermission(socket, 'permission.peer.mic');
            const roomId = getAuthorizedRoomId(data, socket);
            const { targetSocketId, enabled } = data;

            const command = {
                command: 'toggleMic',
                payload: { enabled: enabled !== undefined ? enabled : true }
            };

            if (targetSocketId) {
                socket.to(targetSocketId).emit('executeCommand', command);
                console.log(`🎤 Sent toggle mic to specific client: ${targetSocketId} (${enabled ? 'ON' : 'OFF'})`);
            } else {
                socket.to(roomId).emit('executeCommand', command);
                console.log(`🎤 Broadcasted toggle mic to room: ${roomId} (${enabled ? 'ON' : 'OFF'})`);
            }

            if (callback) callback({ success: true, roomId });
        } catch (error) {
            console.error(`❌ toggleMic error:`, error.message);
            if (callback) callback({ error: error.message });
        }
    });

    // ─── Mute Audio (Force mute) ─────────────────────────────────────────
    socket.on('muteAudio', async (...args) => {
        const callback = extractCallback(...args);
        const data = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};

        try {
            socketRequirePermission(socket, 'permission.peer.mic');
            const roomId = getAuthorizedRoomId(data, socket);
            const { targetSocketId } = data;

            if (targetSocketId) {
                socket.to(targetSocketId).emit('executeCommand', {
                    command: 'muteAudio',
                    payload: { muted: true }
                });
                console.log(`🔇 Sent mute audio to specific client: ${targetSocketId}`);
            } else {
                socket.to(roomId).emit('executeCommand', {
                    command: 'muteAudio',
                    payload: { muted: true }
                });
                console.log(`🔇 Broadcasted mute audio to room: ${roomId}`);
            }

            if (callback) callback({ success: true, roomId });
        } catch (error) {
            console.error(`❌ muteAudio error:`, error.message);
            if (callback) callback({ error: error.message });
        }
    });

    // ─── Unmute Audio ─────────────────────────────────────────────────────
    socket.on('unmuteAudio', async (...args) => {
        const callback = extractCallback(...args);
        const data = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};

        try {
            socketRequirePermission(socket, 'permission.peer.mic');
            const roomId = getAuthorizedRoomId(data, socket);
            const { targetSocketId } = data;

            if (targetSocketId) {
                socket.to(targetSocketId).emit('executeCommand', {
                    command: 'unmuteAudio',
                    payload: { muted: false }
                });
                console.log(`🔊 Sent unmute audio to specific client: ${targetSocketId}`);
            } else {
                socket.to(roomId).emit('executeCommand', {
                    command: 'unmuteAudio',
                    payload: { muted: false }
                });
                console.log(`🔊 Broadcasted unmute audio to room: ${roomId}`);
            }

            if (callback) callback({ success: true, roomId });
        } catch (error) {
            console.error(`❌ unmuteAudio error:`, error.message);
            if (callback) {
                callback({ error: error.message });
            }
        }
    });

    // ─── Stop Video (Force stop) ─────────────────────────────────────────
    socket.on('stopVideo', async (...args) => {
        const callback = extractCallback(...args);
        const data = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};

        try {
            socketRequirePermission(socket, 'permission.peer.cam');
            const roomId = getAuthorizedRoomId(data, socket);
            const { targetSocketId } = data;

            if (targetSocketId) {
                socket.to(targetSocketId).emit('executeCommand', {
                    command: 'stopVideo',
                    payload: { videoEnabled: false }
                });
                console.log(`📹 Sent stop video to specific client: ${targetSocketId}`);
            } else {
                socket.to(roomId).emit('executeCommand', {
                    command: 'stopVideo',
                    payload: { videoEnabled: false }
                });
                console.log(`📹 Broadcasted stop video to room: ${roomId}`);
            }

            if (callback) callback({ success: true, roomId });
        } catch (error) {
            console.error(`❌ stopVideo error:`, error.message);
            if (callback) {
                callback({ error: error.message });
            }
        }
    });

    // ─── Start Video ──────────────────────────────────────────────────────
    socket.on('startVideo', async (...args) => {
        const callback = extractCallback(...args);
        const data = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};

        try {
            socketRequirePermission(socket, 'permission.peer.cam');
            const roomId = getAuthorizedRoomId(data, socket);
            const { targetSocketId } = data;

            if (targetSocketId) {
                socket.to(targetSocketId).emit('executeCommand', {
                    command: 'startVideo',
                    payload: { videoEnabled: true }
                });
                console.log(`📹 Sent start video to specific client: ${targetSocketId}`);
            } else {
                socket.to(roomId).emit('executeCommand', {
                    command: 'startVideo',
                    payload: { videoEnabled: true }
                });
                console.log(`📹 Broadcasted start video to room: ${roomId}`);
            }

            if (callback) callback({ success: true, roomId });
        } catch (error) {
            console.error(`❌ startVideo error:`, error.message);
            if (callback) callback({ error: error.message });
        }
    });

    // ─── 1️⃣4️⃣ disconnect ─────────────────────────────────────────
    socket.on('disconnect', async () => {
        console.log(`🔌 Client disconnected: ${socketId}`);

        // Clean up all resources for this peer
        await sfu.cleanupPeer(socketId);

        // Notify others in the room
        if (socket.roomId) {
            socket.to(socket.roomId).emit('clientLeft', {
                socketId: socketId,
                roomId: socket.roomId,
            });
        }
    });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const start = async () => {
    console.log("DEBUG: start() function execution began!");
    try {
        // ✅ Initialize SFU first
        await sfu.initialize({
            listenIp: env.LISTEN_IP,
            announcedIp: env.ANNOUNCED_IP,
        });
        console.log('✅ SFU initialized');

        const isHttpsServer = server instanceof https.Server;
        const protocol = isHttpsServer ? 'https' : 'http';
        console.log('🔧 Debug: About to call server.listen with PORT', PORT, 'and IP', env.LISTEN_IP || '0.0.0.0');
        const wsProtocol = isHttpsServer ? 'wss' : 'ws';

        server.listen(PORT, env.LISTEN_IP || '0.0.0.0', () => {
            const displayHost = env.LISTEN_IP === '0.0.0.0' ? (env.ANNOUNCED_IP || 'localhost') : env.LISTEN_IP;
            const banner = [
                '═══════════════════════════════════════════════════════',
                `🚀 Server running in ${env.NODE_ENV} mode on port ${PORT} (${protocol.toUpperCase()})`,
                `🔗 API:       ${protocol}://${displayHost}:${PORT}/api/v1`,
                `📚 Docs:      ${protocol}://${displayHost}:${PORT}/api-docs`,
                `💚 Health:    ${protocol}://${displayHost}:${PORT}/health`,
                `📡 WebSocket: ${wsProtocol}://${displayHost}:${PORT}`,
                '═══════════════════════════════════════════════════════',
            ].join('\n');

            console.log(banner);
            logger.info(`Server started successfully on port ${PORT} (${protocol.toUpperCase()})`);
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        logger.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
const shutdown = async (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    logger.info(`${signal} received. Shutting down gracefully...`);
    await sfu.shutdown();
    server.close(() => {
        console.log('Server closed. Process terminated.');
        logger.info('Server closed. Process terminated.');
        process.exit(0);
    });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

console.log("DEBUG: calling start()");
start();

export default app;
export { io, server };