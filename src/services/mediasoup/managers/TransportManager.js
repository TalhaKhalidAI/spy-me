// services/mediasoup/TransportManager.js
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import env from '../../../config/env.js';

/**
 * TransportManager - Manages mediasoup WebRTC transports
 * @class TransportManager
 * @extends EventEmitter
 * @description Handles creation, monitoring, and lifecycle of WebRTC transports
 */
export class TransportManager extends EventEmitter {
    /** @type {Map<string, import('mediasoup').WebRtcTransport>} */
    #transports = new Map();
    /** @type {Map<string, {socketId: string, direction: string, roomId: string, createdAt: Date, closedAt: Date}>} */
    #transportMetadata = new Map();
    /** @type {Object} */
    #config;
    /** @type {import('./RouterManager.js').RouterManager} */
    #routerManager;
    /** @type {number} */
    #maxTransportsPerRoom = parseInt(env.MAX_TRANSPORTS_PER_ROOM || '10', 10);
    /** @type {number} */
    #maxTransportsPerPeer = parseInt(env.MAX_TRANSPORTS_PER_PEER || '2', 10);
    /** @type {number} */
    #transportTimeout = parseInt(env.TRANSPORT_TIMEOUT || '30000', 10);
    /** @type {number} */
    #nextTransportIndex = 0;

    constructor(routerManager, config = {}) {
        super();
        
        if (!routerManager) {
            throw new Error('RouterManager is required for TransportManager');
        }
        
        this.#routerManager = routerManager;
        this.#config = {
            listenIp: config.listenIp || env.LISTEN_IP || '0.0.0.0',
            announcedIp: config.announcedIp || env.ANNOUNCED_IP || '127.0.0.1',
            enableUdp: config.enableUdp !== false,
            enableTcp: config.enableTcp !== false,
            preferUdp: config.preferUdp !== false,
            initialAvailableOutgoingBitrate: config.initialAvailableOutgoingBitrate || 1000000,
            maxBitrate: config.maxBitrate || 10000000, // 10 Mbps
            minBitrate: config.minBitrate || 100000, // 100 Kbps
            ...config
        };
        
        console.log(`🚀 TransportManager initialized`);
        this.emit('initialized', { config: this.#config });
    }

    /**
     * Get count of active transports
     * @returns {number}
     */
    get count() {
        return this.#transports.size;
    }

    /**
     * Get all transport IDs
     * @returns {string[]}
     */
    get ids() {
        return Array.from(this.#transports.keys());
    }

    /**
     * Create a send transport for a client
     * @param {string} socketId - Client socket ID
     * @param {string} roomId - Room ID
     * @param {Object} options - Transport options
     * @returns {Promise<Object>}
     */
    async createSendTransport(socketId, roomId, options = {}) {
        return this.#createTransport('send', socketId, roomId, options);
    }

    /**
     * Create a receive transport for a client
     * @param {string} socketId - Client socket ID
     * @param {string} roomId - Room ID
     * @param {Object} options - Transport options
     * @returns {Promise<Object>}
     */
    async createRecvTransport(socketId, roomId, options = {}) {
        return this.#createTransport('recv', socketId, roomId, options);
    }

    /**
     * Internal method to create a transport
     * @param {string} direction - 'send' or 'recv'
     * @param {string} socketId - Client socket ID
     * @param {string} roomId - Room ID
     * @param {Object} options - Transport options
     * @returns {Promise<Object>}
     * @throws {Error} If creation fails
     */
    async #createTransport(direction, socketId, roomId, options = {}) {
        try {
            // Validate parameters
            if (!socketId) {
                throw new Error('socketId is required');
            }
            if (!roomId) {
                throw new Error('roomId is required');
            }

            // Check limits
            const roomTransports = this.#getTransportsForRoom(roomId);
            if (roomTransports.length >= this.#maxTransportsPerRoom) {
                throw new Error(`Maximum transports per room (${this.#maxTransportsPerRoom}) reached`);
            }

            const peerTransports = this.#getTransportsForPeer(socketId);
            if (peerTransports.length >= this.#maxTransportsPerPeer) {
                throw new Error(`Maximum transports per peer (${this.#maxTransportsPerPeer}) reached`);
            }

            // Calculate bitrate
            let bitrate = options.initialAvailableOutgoingBitrate || 
                         this.#config.initialAvailableOutgoingBitrate;
            
            if (direction === 'recv') {
                bitrate = 0; // Receive transports don't need outgoing bitrate
            }

            // Get router for this room
            const router = this.#routerManager.getRouter(roomId);
            if (!router) {
                throw new Error(`Router for room ${roomId} not found`);
            }
            const iceServerss = env.iceServers || [];
            if (iceServerss.length>0){
                console.log("ice server exist",iceServerss)
            }
            // Create the transport
            const transport = await router.createWebRtcTransport({
                listenIps: [
                    {
                        ip: options.listenIp || this.#config.listenIp,
                        announcedIp: options.announcedIp || this.#config.announcedIp
                    }
                ],
                iceServers:iceServerss,
                enableUdp: options.enableUdp !== undefined ? options.enableUdp : this.#config.enableUdp,
                enableTcp: options.enableTcp !== undefined ? options.enableTcp : this.#config.enableTcp,
                preferUdp: options.preferUdp !== undefined ? options.preferUdp : this.#config.preferUdp,
                initialAvailableOutgoingBitrate: bitrate,
                enableSctp: options.enableSctp !== false,
                numSctpStreams: options.numSctpStreams || { OS: 1024, MIS: 1024 },
                maxSctpMessageSize: options.maxSctpMessageSize || 262144,
                appData: options.appData || {},
                // For receive transport, we don't need initial bitrate
                ...(direction === 'recv' && { initialAvailableOutgoingBitrate: 0 }),
            });

            const transportId = transport.id;

            // Store transport
            this.#transports.set(transportId, transport);
            this.#transportMetadata.set(transportId, {
                socketId,
                direction,
                roomId,
                createdAt: new Date(),
                closedAt: null,
                ip: options.announcedIp || this.#config.announcedIp,
            });

            // Add event listeners
            this.#setupTransportListeners(transport, transportId);

            // Set timeout to close inactive transports
            this.#scheduleTimeout(transport, transportId);

            console.log(`🚀 Transport created: ${transportId} (${direction}) for ${socketId} in room ${roomId}`);
            this.emit('transport:created', {
                transportId,
                direction,
                socketId,
                roomId,
                timestamp: new Date()
            });

            return {
                id: transportId,
                transport,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
                sctpParameters: transport.sctpParameters,
            };

        } catch (error) {
            console.error(`❌ Failed to create transport:`, error.message);
            this.emit('transport:error', { error: error.message, socketId, roomId });
            throw new Error(`Transport creation failed: ${error.message}`);
        }
    }

    /**
     * Setup listeners for a transport
     * @param {import('mediasoup').WebRtcTransport} transport
     * @param {string} transportId
     */
    #setupTransportListeners(transport, transportId) {
        // Handle ICE state changes
        transport.on('icestatechange', (state) => {
            this.emit('transport:icestatechange', { transportId, state });
            if (state === 'failed' || state === 'disconnected') {
                console.warn(`⚠️ Transport ${transportId} ICE state: ${state}`);
            }
        });

        // Handle DTLS state changes
        transport.on('dtlsstatechange', (state) => {
            this.emit('transport:dtlsstatechange', { transportId, state });
            if (state === 'failed' || state === 'closed') {
                console.warn(`⚠️ Transport ${transportId} DTLS state: ${state}`);
            }
        });

        // Handle SCTP state changes
        transport.on('sctpstatechange', (state) => {
            this.emit('transport:sctpstatechange', { transportId, state });
        });

        // Handle closed event
        transport.on('close', () => {
            console.log(`🔚 Transport ${transportId} closed`);
            this.#handleTransportClose(transportId);
        });

        // Handle listener errors
        transport.on('listenererror', (error) => {
            console.error(`⚠️ Transport ${transportId} listener error:`, error);
            this.emit('transport:listenererror', { transportId, error });
        });
    }

    /**
     * Schedule timeout for inactive transport
     * @param {import('mediasoup').WebRtcTransport} transport
     * @param {string} transportId
     */
    #scheduleTimeout(transport, transportId) {
        // Transport auto-closes after timeout if no activity
        const timeout = setTimeout(async () => {
            try {
                const metadata = this.#transportMetadata.get(transportId);
                if (!metadata) return;
                
                // Check if transport is still active
                if (!transport.closed && !transport.iceState) {
                    console.log(`⏰ Transport ${transportId} timed out, closing...`);
                    await this.closeTransport(transportId);
                }
            } catch (error) {
                // Ignore errors during timeout cleanup
            }
        }, this.#transportTimeout);

        // Store timeout reference for cleanup
        this.#transportMetadata.set(transportId, {
            ...this.#transportMetadata.get(transportId),
            timeoutRef: timeout,
        });
    }

    /**
     * Connect a transport (DTLS handshake)
     * @param {string} transportId - Transport ID
     * @param {Object} dtlsParameters - DTLS parameters from client
     * @returns {Promise<boolean>}
     */
    async connectTransport(transportId, dtlsParameters) {
        const transport = this.#transports.get(transportId);
        if (!transport) {
            throw new Error(`Transport ${transportId} not found`);
        }

        try {
            await transport.connect({ dtlsParameters });
            console.log(`🔗 Transport connected: ${transportId}`);
            this.emit('transport:connected', { transportId });
            return true;
        } catch (error) {
            console.error(`❌ Failed to connect transport ${transportId}:`, error.message);
            this.emit('transport:connect_error', { transportId, error: error.message });
            throw new Error(`Transport connection failed: ${error.message}`);
        }
    }

    /**
     * Get a transport by ID
     * @param {string} transportId - Transport ID
     * @returns {import('mediasoup').WebRtcTransport | undefined}
     */
    getTransport(transportId) {
        return this.#transports.get(transportId);
    }

    /**
     * Get transport metadata
     * @param {string} transportId - Transport ID
     * @returns {Object | undefined}
     */
    getTransportMetadata(transportId) {
        const metadata = this.#transportMetadata.get(transportId);
        if (!metadata) return undefined;
        
        // Remove timeout ref to avoid leaking internals
        const { timeoutRef, ...safeMetadata } = metadata;
        return safeMetadata;
    }

    /**
     * Get all transports for a room
     * @param {string} roomId - Room ID
     * @returns {Array<{id: string, metadata: Object}>}
     */
    #getTransportsForRoom(roomId) {
        const result = [];
        for (const [id, metadata] of this.#transportMetadata) {
            if (metadata.roomId === roomId && !this.#transports.get(id)?.closed) {
                result.push({ id, metadata });
            }
        }
        return result;
    }

    /**
     * Get all transports for a peer
     * @param {string} socketId - Socket ID
     * @returns {Array<{id: string, metadata: Object}>}
     */
    #getTransportsForPeer(socketId) {
        const result = [];
        for (const [id, metadata] of this.#transportMetadata) {
            if (metadata.socketId === socketId && !this.#transports.get(id)?.closed) {
                result.push({ id, metadata });
            }
        }
        return result;
    }

    /**
     * Close a transport
     * @param {string} transportId - Transport ID
     * @param {string} reason - Reason for closing
     * @returns {Promise<boolean>}
     */
    async closeTransport(transportId, reason = 'manual') {
        const transport = this.#transports.get(transportId);
        if (!transport) {
            console.warn(`⚠️ Transport ${transportId} not found`);
            return false;
        }

        try {
            // Clear timeout
            const metadata = this.#transportMetadata.get(transportId);
            if (metadata?.timeoutRef) {
                clearTimeout(metadata.timeoutRef);
            }

            await transport.close();
            this.#handleTransportClose(transportId, reason);
            return true;
        } catch (error) {
            console.error(`❌ Failed to close transport ${transportId}:`, error.message);
            return false;
        }
    }

    /**
     * Handle transport close event
     * @param {string} transportId - Transport ID
     * @param {string} reason - Reason for closing
     */
    #handleTransportClose(transportId, reason = 'closed') {
        const metadata = this.#transportMetadata.get(transportId);
        if (metadata) {
            metadata.closedAt = new Date();
            this.#transportMetadata.set(transportId, metadata);
        }

        this.#transports.delete(transportId);
        
        console.log(`🗑️ Transport ${transportId} removed (${reason})`);
        this.emit('transport:closed', { 
            transportId, 
            reason, 
            metadata,
            timestamp: new Date() 
        });

        // Clean up after delay
        setTimeout(() => {
            this.#transportMetadata.delete(transportId);
        }, 5000);
    }

    /**
     * Close all transports for a room
     * @param {string} roomId - Room ID
     * @param {string} reason - Reason for closing
     * @returns {Promise<void>}
     */
    async closeRoomTransports(roomId, reason = 'room_closed') {
        const transports = this.#getTransportsForRoom(roomId);
        console.log(`🛑 Closing ${transports.length} transports for room ${roomId}...`);
        
        const promises = transports.map(({ id }) => 
            this.closeTransport(id, reason)
        );
        
        await Promise.all(promises);
        this.emit('room:transports_closed', { roomId, count: transports.length });
    }

    /**
     * Close all transports for a peer
     * @param {string} socketId - Socket ID
     * @param {string} reason - Reason for closing
     * @returns {Promise<void>}
     */
    async closePeerTransports(socketId, reason = 'peer_disconnected') {
        const transports = this.#getTransportsForPeer(socketId);
        console.log(`🛑 Closing ${transports.length} transports for peer ${socketId}...`);
        
        const promises = transports.map(({ id }) => 
            this.closeTransport(id, reason)
        );
        
        await Promise.all(promises);
        this.emit('peer:transports_closed', { socketId, count: transports.length });
    }

    /**
     * Close all transports
     * @param {string} reason - Reason for closing
     * @returns {Promise<void>}
     */
    async closeAllTransports(reason = 'shutdown') {
        console.log(`🛑 Closing ${this.#transports.size} transports...`);
        this.emit('transports:closing', { count: this.#transports.size });
        
        const promises = [];
        for (const [id] of this.#transports) {
            promises.push(this.closeTransport(id, reason));
        }
        
        await Promise.all(promises);
        console.log('✅ All transports closed');
        this.emit('transports:closed');
    }

    /**
     * Get transport stats
     * @param {string} transportId - Transport ID
     * @returns {Promise<Object>}
     */
    async getTransportStats(transportId) {
        const transport = this.#transports.get(transportId);
        if (!transport) {
            throw new Error(`Transport ${transportId} not found`);
        }

        try {
            const stats = await transport.getStats();
            return stats;
        } catch (error) {
            console.error(`❌ Failed to get stats for transport ${transportId}:`, error.message);
            throw error;
        }
    }

    /**
     * Get all transport statuses
     * @returns {Array<Object>}
     */
    getTransportStatuses() {
        const result = [];
        for (const [id, transport] of this.#transports) {
            const metadata = this.#transportMetadata.get(id);
            result.push({
                id,
                direction: metadata?.direction || 'unknown',
                roomId: metadata?.roomId || 'unknown',
                socketId: metadata?.socketId || 'unknown',
                createdAt: metadata?.createdAt || new Date(),
                iceState: transport.iceState,
                dtlsState: transport.dtlsState,
                sctpState: transport.sctpState,
                closed: transport.closed,
                alive: !transport.closed,
            });
        }
        return result;
    }

    /**
     * Health check
     * @returns {Object}
     */
    healthCheck() {
        let healthy = true;
        const details = [];

        for (const [id, transport] of this.#transports) {
            const isAlive = !transport.closed;
            const iceState = transport.iceState;
            
            if (!isAlive || iceState === 'failed' || iceState === 'disconnected') {
                healthy = false;
            }
            
            details.push({
                id,
                alive: isAlive,
                iceState,
                dtlsState: transport.dtlsState,
            });
        }

        return {
            healthy,
            totalTransports: this.#transports.size,
            details,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Update transport configuration
     * @param {Object} config - New configuration
     */
    updateConfig(config = {}) {
        this.#config = {
            ...this.#config,
            ...config
        };
        this.emit('config:updated', { config: this.#config });
        console.log('📋 Transport config updated');
    }
}

// Export singleton instance (requires router)
// Use like: const transportManager = new TransportManager(router);
export default TransportManager;