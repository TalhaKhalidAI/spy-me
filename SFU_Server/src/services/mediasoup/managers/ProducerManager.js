// services/mediasoup/ProducerManager.js
import { EventEmitter } from 'events';

/**
 * ProducerManager - Server-side manager for mediasoup producers
 * @class ProducerManager
 * @extends EventEmitter
 * @description Handles creation, monitoring, and lifecycle of media producers on the server
 */
export class ProducerManager extends EventEmitter {
    /** @type {Map<string, import('mediasoup').Producer>} */
    #producers = new Map();
    /** @type {Map<string, {socketId: string, transportId: string, roomId: string, kind: string, source: string, paused: boolean, createdAt: Date, closedAt: Date}>} */
    #producerMetadata = new Map();
    /** @type {Map<string, string[]>} */
    #transportProducers = new Map();
    /** @type {number} */
    #maxProducersPerPeer = parseInt(process.env.MAX_PRODUCERS_PER_PEER || '5', 10);
    /** @type {Function} */
    #transportGetter = null;

    constructor(options = {}) {
        super();
        this.#transportGetter = options.getTransport || null;
        this.#maxProducersPerPeer = options.maxProducersPerPeer || 
            parseInt(process.env.MAX_PRODUCERS_PER_PEER || '5', 10);
        
        console.log('🎬 ProducerManager initialized (Server-Side)');
    }

    /**
     * Set the transport getter function
     * @param {Function} getTransport - Function that takes transportId and returns transport
     */
    setTransportGetter(getTransport) {
        if (typeof getTransport !== 'function') {
            throw new Error('getTransport must be a function');
        }
        this.#transportGetter = getTransport;
        console.log('✅ Transport getter set for ProducerManager');
    }

    /**
     * Create a server-side producer
     * @param {Object} params
     * @param {string} params.transportId - Transport ID
     * @param {string} params.socketId - Client socket ID
     * @param {string} params.roomId - Room ID
     * @param {string} params.kind - 'audio' or 'video'
     * @param {Object} params.rtpParameters - RTP parameters from client
     * @param {string} params.source - 'camera', 'mic', 'screen', 'custom'
     * @param {Object} params.options - Additional options
     * @returns {Promise<import('mediasoup').Producer>}
     */
    async createProducer({ 
        transportId,
        socketId,
        roomId,
        kind,
        rtpParameters,
        source = 'camera',
        options = {},
    }) {
        try {
            // Validate
            if (!transportId) throw new Error('transportId is required');
            if (!socketId) throw new Error('socketId is required');
            if (!roomId) throw new Error('roomId is required');
            if (!kind) throw new Error('kind is required');
            if (!rtpParameters) throw new Error('rtpParameters is required');

            // Check limits
            const peerProducers = this.#getProducersForPeer(socketId);
            if (peerProducers.length >= this.#maxProducersPerPeer) {
                throw new Error(`Maximum producers per peer (${this.#maxProducersPerPeer}) reached`);
            }

            // Get transport
            const transport = this.#getTransport(transportId);
            if (!transport) {
                throw new Error(`Transport ${transportId} not found or closed`);
            }

            if (transport.closed) {
                throw new Error(`Transport ${transportId} is closed`);
            }

            // Check for duplicate producer
            const existing = this.#getProducersForTransport(transportId);
            const duplicate = existing.some(id => {
                const metadata = this.#producerMetadata.get(id);
                return metadata?.socketId === socketId && 
                       metadata?.kind === kind && 
                       metadata?.source === source;
            });
            
            if (duplicate) {
                throw new Error(`Duplicate producer detected: ${kind}/${source} already exists`);
            }

            // ✅ SERVER-SIDE PRODUCER CREATION
            const producer = await transport.produce({
                kind,
                rtpParameters,
                paused: options.paused || false,
                disableTrack: options.disableTrack || false,
                appData: {
                    source,
                    socketId,
                    roomId,
                    ...options.appData,
                },
            });

            const producerId = producer.id;

            // Store producer
            this.#producers.set(producerId, producer);
            this.#producerMetadata.set(producerId, {
                socketId,
                transportId,
                roomId,
                kind,
                source,
                paused: options.paused || false,
                createdAt: new Date(),
                closedAt: null,
            });

            // Track transport -> producers mapping
            if (!this.#transportProducers.has(transportId)) {
                this.#transportProducers.set(transportId, []);
            }
            this.#transportProducers.get(transportId).push(producerId);

            // Setup listeners
            this.#setupProducerListeners(producer, producerId);

            console.log(`📹 Producer created (server): ${producerId} (${kind}/${source}) for ${socketId}`);
            this.emit('producer:created', {
                producerId,
                kind,
                source,
                socketId,
                roomId,
                timestamp: new Date(),
            });

            return producer;

        } catch (error) {
            console.error(`❌ Failed to create producer:`, error.message);
            this.emit('producer:error', { 
                error: error.message, 
                socketId, 
                transportId,
                kind,
                source 
            });
            throw new Error(`Producer creation failed: ${error.message}`);
        }
    }

    /**
     * Setup listeners for a producer
     * @param {import('mediasoup').Producer} producer
     * @param {string} producerId
     */
    #setupProducerListeners(producer, producerId) {
        // Producer paused
        producer.on('pause', () => {
            const metadata = this.#producerMetadata.get(producerId);
            if (metadata) {
                metadata.paused = true;
                this.#producerMetadata.set(producerId, metadata);
            }
            this.emit('producer:paused', { producerId });
        });

        // Producer resumed
        producer.on('resume', () => {
            const metadata = this.#producerMetadata.get(producerId);
            if (metadata) {
                metadata.paused = false;
                this.#producerMetadata.set(producerId, metadata);
            }
            this.emit('producer:resumed', { producerId });
        });

        // Producer closed
        producer.on('close', () => {
            this.#handleProducerClose(producerId);
        });

        // Score changes (quality)
        producer.on('score', (score) => {
            this.emit('producer:score', { producerId, score });
        });

        // Video orientation changes
        producer.on('videoorientationchange', (orientation) => {
            this.emit('producer:videoorientation', { producerId, orientation });
        });

        // Listener errors
        producer.on('listenererror', (error) => {
            console.error(`⚠️ Producer ${producerId} listener error:`, error);
            this.emit('producer:listenererror', { producerId, error });
        });
    }

    /**
     * Pause a producer (stop sending)
     * @param {string} producerId - Producer ID
     * @returns {Promise<boolean>}
     */
    async pauseProducer(producerId) {
        const producer = this.#producers.get(producerId);
        if (!producer) {
            console.warn(`⚠️ Producer ${producerId} not found`);
            return false;
        }

        if (producer.closed) {
            console.warn(`⚠️ Producer ${producerId} already closed`);
            return false;
        }

        try {
            await producer.pause();
            console.log(`⏸️ Producer paused: ${producerId}`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to pause producer ${producerId}:`, error.message);
            return false;
        }
    }

    /**
     * Resume a producer (start sending)
     * @param {string} producerId - Producer ID
     * @returns {Promise<boolean>}
     */
    async resumeProducer(producerId) {
        const producer = this.#producers.get(producerId);
        if (!producer) {
            console.warn(`⚠️ Producer ${producerId} not found`);
            return false;
        }

        if (producer.closed) {
            console.warn(`⚠️ Producer ${producerId} already closed`);
            return false;
        }

        try {
            await producer.resume();
            console.log(`▶️ Producer resumed: ${producerId}`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to resume producer ${producerId}:`, error.message);
            return false;
        }
    }

    /**
     * Close a producer
     * @param {string} producerId - Producer ID
     * @param {string} reason - Reason for closing
     * @returns {Promise<boolean>}
     */
    async closeProducer(producerId, reason = 'manual') {
        const producer = this.#producers.get(producerId);
        if (!producer) {
            console.warn(`⚠️ Producer ${producerId} not found`);
            return false;
        }

        if (producer.closed) {
            this.#handleProducerClose(producerId, reason);
            return true;
        }

        try {
            await producer.close();
            this.#handleProducerClose(producerId, reason);
            return true;
        } catch (error) {
            console.error(`❌ Failed to close producer ${producerId}:`, error.message);
            this.#handleProducerClose(producerId, 'force_close_failed');
            return false;
        }
    }

    /**
     * Handle producer close
     * @param {string} producerId - Producer ID
     * @param {string} reason - Reason for closing
     */
    #handleProducerClose(producerId, reason = 'closed') {
        const metadata = this.#producerMetadata.get(producerId);
        if (metadata) {
            metadata.closedAt = new Date();
            this.#producerMetadata.set(producerId, metadata);

            // Remove from transport mapping
            const transportId = metadata.transportId;
            if (this.#transportProducers.has(transportId)) {
                const producers = this.#transportProducers.get(transportId);
                const index = producers.indexOf(producerId);
                if (index !== -1) {
                    producers.splice(index, 1);
                }
                if (producers.length === 0) {
                    this.#transportProducers.delete(transportId);
                }
            }
        }

        this.#producers.delete(producerId);

        console.log(`🗑️ Producer ${producerId} closed (${reason})`);
        this.emit('producer:closed', {
            producerId,
            reason,
            metadata,
            timestamp: new Date(),
        });

        setTimeout(() => {
            this.#producerMetadata.delete(producerId);
        }, 5000);
    }

    /**
     * Get a producer by ID
     * @param {string} producerId 
     * @returns {import('mediasoup').Producer | undefined}
     */
    getProducer(producerId) {
        return this.#producers.get(producerId);
    }

    /**
     * Get producer metadata
     * @param {string} producerId 
     * @returns {Object | undefined}
     */
    getProducerMetadata(producerId) {
        return this.#producerMetadata.get(producerId);
    }

    // ============================================================
    // ✅ ALL PRIVATE METHODS DECLARED HERE
    // ============================================================

    /**
     * Get all producers for a peer (Private)
     * @param {string} socketId 
     * @returns {Array<{id: string, metadata: Object}>}
     */
    #getProducersForPeer(socketId) {
        const result = [];
        for (const [id, metadata] of this.#producerMetadata) {
            if (metadata.socketId === socketId && !this.#producers.get(id)?.closed) {
                result.push({ id, metadata });
            }
        }
        return result;
    }

    /**
     * Get all producers for a transport (Private)
     * @param {string} transportId 
     * @returns {string[]}
     */
    #getProducersForTransport(transportId) {
        return this.#transportProducers.get(transportId) || [];
    }

    /**
     * Get transport by ID (Private)
     * @param {string} transportId 
     * @returns {import('mediasoup').WebRtcTransport | null}
     */
    #getTransport(transportId) {
        if (!this.#transportGetter) {
            console.warn('⚠️ No transport getter set! Call setTransportGetter() first.');
            return null;
        }
        return this.#transportGetter(transportId);
    }

    // ============================================================
    // ✅ PUBLIC METHODS
    // ============================================================

    /**
     * Get all producers for a room
     * @param {string} roomId 
     * @returns {Array<{id: string, metadata: Object}>}
     */
    getProducersForRoom(roomId) {
        const result = [];
        for (const [id, metadata] of this.#producerMetadata) {
            if (metadata.roomId === roomId && !this.#producers.get(id)?.closed) {
                result.push({ id, metadata });
            }
        }
        return result;
    }

    /**
     * Get all producers for a transport (Public)
     * @param {string} transportId 
     * @returns {string[]}
     */
    getProducersForTransport(transportId) {
        return this.#transportProducers.get(transportId) || [];
    }

    /**
     * Get all active producers
     * @returns {Array<Object>}
     */
    getAllProducers() {
        const result = [];
        for (const [id, producer] of this.#producers) {
            if (!producer.closed) {
                const metadata = this.#producerMetadata.get(id);
                result.push({
                    id,
                    kind: metadata?.kind,
                    source: metadata?.source,
                    socketId: metadata?.socketId,
                    roomId: metadata?.roomId,
                    paused: metadata?.paused,
                    active: !producer.closed,
                    createdAt: metadata?.createdAt,
                });
            }
        }
        return result;
    }

    /**
     * Get producer count
     * @returns {number}
     */
    get count() {
        return this.#producers.size;
    }

    /**
     * Check if producer exists
     * @param {string} producerId 
     * @returns {boolean}
     */
    hasProducer(producerId) {
        return this.#producers.has(producerId) && !this.#producers.get(producerId)?.closed;
    }

    /**
     * Close all producers for a peer
     * @param {string} socketId 
     * @param {string} reason 
     * @returns {Promise<void>}
     */
    async closePeerProducers(socketId, reason = 'peer_disconnected') {
        const producers = this.#getProducersForPeer(socketId);
        console.log(`🛑 Closing ${producers.length} producers for peer ${socketId}...`);
        
        const promises = producers.map(({ id }) => 
            this.closeProducer(id, reason)
        );
        
        await Promise.all(promises);
        this.emit('peer:producers_closed', { socketId, count: producers.length });
    }

    /**
     * Close all producers for a room
     * @param {string} roomId 
     * @param {string} reason 
     * @returns {Promise<void>}
     */
    async closeRoomProducers(roomId, reason = 'room_closed') {
        const producers = this.getProducersForRoom(roomId);
        console.log(`🛑 Closing ${producers.length} producers for room ${roomId}...`);
        
        const promises = producers.map(({ id }) => 
            this.closeProducer(id, reason)
        );
        
        await Promise.all(promises);
        this.emit('room:producers_closed', { roomId, count: producers.length });
    }

    /**
     * Close all producers for a transport
     * @param {string} transportId 
     * @param {string} reason 
     * @returns {Promise<void>}
     */
    async closeTransportProducers(transportId, reason = 'transport_closed') {
        const producerIds = this.#transportProducers.get(transportId) || [];
        console.log(`🛑 Closing ${producerIds.length} producers for transport ${transportId}...`);
        
        const promises = producerIds.map((id) => 
            this.closeProducer(id, reason)
        );
        
        await Promise.all(promises);
        this.#transportProducers.delete(transportId);
        this.emit('transport:producers_closed', { transportId, count: producerIds.length });
    }

    /**
     * Close all producers
     * @param {string} reason 
     * @returns {Promise<void>}
     */
    async closeAllProducers(reason = 'shutdown') {
        console.log(`🛑 Closing ${this.#producers.size} producers...`);
        this.emit('producers:closing', { count: this.#producers.size });
        
        const promises = [];
        for (const [id] of this.#producers) {
            promises.push(this.closeProducer(id, reason));
        }
        
        await Promise.all(promises);
        console.log('✅ All producers closed');
        this.emit('producers:closed');
    }

    /**
     * Get producer stats
     * @param {string} producerId 
     * @returns {Promise<Object>}
     */
    async getProducerStats(producerId) {
        const producer = this.#producers.get(producerId);
        if (!producer) {
            throw new Error(`Producer ${producerId} not found`);
        }

        if (producer.closed) {
            throw new Error(`Producer ${producerId} is closed`);
        }

        try {
            const stats = await producer.getStats();
            return stats;
        } catch (error) {
            console.error(`❌ Failed to get stats for producer ${producerId}:`, error.message);
            throw error;
        }
    }

    /**
     * Health check
     * @returns {Object}
     */
    healthCheck() {
        let healthy = true;
        const details = [];

        for (const [id, producer] of this.#producers) {
            const isAlive = !producer.closed;
            const metadata = this.#producerMetadata.get(id);
            
            if (!isAlive) {
                healthy = false;
            }
            
            details.push({
                id,
                kind: metadata?.kind,
                source: metadata?.source,
                alive: isAlive,
                paused: metadata?.paused,
                createdAt: metadata?.createdAt,
            });
        }

        return {
            healthy,
            totalProducers: this.#producers.size,
            details,
            timestamp: new Date().toISOString(),
        };
    }
}

// Export singleton
export const producerManager = new ProducerManager();
export default producerManager;