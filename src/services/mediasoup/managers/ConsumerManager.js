// services/mediasoup/ConsumerManager.js
import { EventEmitter } from 'events';

export class ConsumerManager extends EventEmitter {
    #consumers = new Map();
    #consumerMetadata = new Map();
    #peerConsumers = new Map();
    #producerConsumers = new Map();
    #maxConsumersPerPeer = parseInt(process.env.MAX_CONSUMERS_PER_PEER || '10', 10);
    #transportGetter = null;
    #producerGetter = null;

    constructor(options = {}) {
        super();
        this.#transportGetter = options.getTransport || null;
        this.#producerGetter = options.getProducer || null;
        this.#maxConsumersPerPeer = options.maxConsumersPerPeer || 
            parseInt(process.env.MAX_CONSUMERS_PER_PEER || '10', 10);
        console.log('📺 ConsumerManager initialized (Server-Side)');
    }

    setTransportGetter(getTransport) {
        if (typeof getTransport !== 'function') {
            throw new Error('getTransport must be a function');
        }
        this.#transportGetter = getTransport;
        console.log('✅ Transport getter set for ConsumerManager');
    }

    setProducerGetter(getProducer) {
        if (typeof getProducer !== 'function') {
            throw new Error('getProducer must be a function');
        }
        this.#producerGetter = getProducer;
        console.log('✅ Producer getter set for ConsumerManager');
    }

    #getTransport(transportId) {
        if (!this.#transportGetter) {
            console.warn('⚠️ No transport getter set! Call setTransportGetter() first.');
            return null;
        }
        return this.#transportGetter(transportId);
    }

    #getProducer(producerId) {
        if (!this.#producerGetter) {
            console.warn('⚠️ No producer getter set! Call setProducerGetter() first.');
            return null;
        }
        return this.#producerGetter(producerId);
    }

    #getConsumersForPeer(socketId) {
        const result = [];
        const consumerIds = this.#peerConsumers.get(socketId) || [];
        for (const id of consumerIds) {
            const metadata = this.#consumerMetadata.get(id);
            if (metadata && !this.#consumers.get(id)?.closed) {
                result.push({ id, metadata });
            }
        }
        return result;
    }

    #getConsumersForProducer(producerId) {
        const result = [];
        const consumerIds = this.#producerConsumers.get(producerId) || [];
        for (const id of consumerIds) {
            const metadata = this.#consumerMetadata.get(id);
            if (metadata && !this.#consumers.get(id)?.closed) {
                result.push({ id, metadata });
            }
        }
        return result;
    }

    async createConsumer({
        transportId,
        socketId,
        roomId,
        producerId,
        rtpCapabilities,
        options = {},
    }) {
        try {
            // ✅ Validate
            if (!transportId) throw new Error('transportId is required');
            if (!socketId) throw new Error('socketId is required');
            if (!roomId) throw new Error('roomId is required');
            if (!producerId) throw new Error('producerId is required');
            if (!rtpCapabilities) throw new Error('rtpCapabilities is required');

            // ✅ Check limits
            const peerConsumers = this.#getConsumersForPeer(socketId);
            if (peerConsumers.length >= this.#maxConsumersPerPeer) {
                throw new Error(`Maximum consumers per peer (${this.#maxConsumersPerPeer}) reached`);
            }

            // ✅ Check if already consuming
            const existing = this.#getConsumersForProducer(producerId);
            const duplicate = existing.some(id => {
                const metadata = this.#consumerMetadata.get(id);
                return metadata?.socketId === socketId;
            });
            
            if (duplicate) {
                throw new Error(`Already consuming producer ${producerId}`);
            }

            // ✅ Get transport
            const transport = this.#getTransport(transportId);
            if (!transport) {
                throw new Error(`Transport ${transportId} not found or closed`);
            }

            if (transport.closed) {
                throw new Error(`Transport ${transportId} is closed`);
            }

            // ✅ Check if can consume
            let canConsume = true;
            if (typeof transport.canConsume === 'function') {
                try {
                    canConsume = await transport.canConsume({
                        producerId,
                        rtpCapabilities,
                    });
                } catch (e) {
                    console.warn('⚠️ canConsume check failed, continuing:', e.message);
                    canConsume = true;
                }
            }

            if (!canConsume) {
                throw new Error(`Cannot consume producer ${producerId}`);
            }

            // ✅ Create consumer
            const consumer = await transport.consume({
                producerId,
                rtpCapabilities,
                paused: options.paused !== undefined ? options.paused : true,
                appData: {
                    socketId,
                    roomId,
                    ...options.appData,
                },
            });

            const consumerId = consumer.id;

            // ✅ Store consumer
            this.#consumers.set(consumerId, consumer);
            this.#consumerMetadata.set(consumerId, {
                socketId,
                transportId,
                roomId,
                producerId,
                kind: consumer.kind,
                paused: options.paused !== undefined ? options.paused : true,
                createdAt: new Date(),
                closedAt: null,
            });

            // ✅ Track mappings
            if (!this.#peerConsumers.has(socketId)) {
                this.#peerConsumers.set(socketId, []);
            }
            this.#peerConsumers.get(socketId).push(consumerId);

            if (!this.#producerConsumers.has(producerId)) {
                this.#producerConsumers.set(producerId, []);
            }
            this.#producerConsumers.get(producerId).push(consumerId);

            // ✅ Setup listeners
            this.#setupConsumerListeners(consumer, consumerId);

            console.log(`📺 Consumer created: ${consumerId} (${consumer.kind}) for ${socketId} -> producer ${producerId}`);
            this.emit('consumer:created', {
                consumerId,
                producerId,
                kind: consumer.kind,
                socketId,
                roomId,
                timestamp: new Date(),
            });

            // ✅ Return the consumer object
            return consumer;

        } catch (error) {
            console.error(`❌ Failed to create consumer:`, error.message);
            this.emit('consumer:error', { 
                error: error.message, 
                socketId, 
                transportId,
                producerId 
            });
            throw error;
        }
    }

    #setupConsumerListeners(consumer, consumerId) {
        consumer.on('pause', () => {
            const metadata = this.#consumerMetadata.get(consumerId);
            if (metadata) {
                metadata.paused = true;
                this.#consumerMetadata.set(consumerId, metadata);
            }
            this.emit('consumer:paused', { consumerId });
        });

        consumer.on('resume', () => {
            const metadata = this.#consumerMetadata.get(consumerId);
            if (metadata) {
                metadata.paused = false;
                this.#consumerMetadata.set(consumerId, metadata);
            }
            this.emit('consumer:resumed', { consumerId });
        });

        consumer.on('close', () => {
            this.#handleConsumerClose(consumerId);
        });

        consumer.on('score', (score) => {
            this.emit('consumer:score', { consumerId, score });
        });

        consumer.on('listenererror', (error) => {
            console.error(`⚠️ Consumer ${consumerId} listener error:`, error);
            this.emit('consumer:listenererror', { consumerId, error });
        });

        consumer.on('trackended', () => {
            this.emit('consumer:trackended', { consumerId });
        });
    }

    async resumeConsumer(consumerId) {
        const consumer = this.#consumers.get(consumerId);
        if (!consumer) {
            console.warn(`⚠️ Consumer ${consumerId} not found`);
            return false;
        }
        if (consumer.closed) {
            console.warn(`⚠️ Consumer ${consumerId} already closed`);
            return false;
        }
        try {
            await consumer.resume();
            console.log(`▶️ Consumer resumed: ${consumerId}`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to resume consumer ${consumerId}:`, error.message);
            return false;
        }
    }

    async pauseConsumer(consumerId) {
        const consumer = this.#consumers.get(consumerId);
        if (!consumer) {
            console.warn(`⚠️ Consumer ${consumerId} not found`);
            return false;
        }
        if (consumer.closed) {
            console.warn(`⚠️ Consumer ${consumerId} already closed`);
            return false;
        }
        try {
            await consumer.pause();
            console.log(`⏸️ Consumer paused: ${consumerId}`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to pause consumer ${consumerId}:`, error.message);
            return false;
        }
    }

    async closeConsumer(consumerId, reason = 'manual') {
        const consumer = this.#consumers.get(consumerId);
        if (!consumer) {
            console.warn(`⚠️ Consumer ${consumerId} not found`);
            return false;
        }
        if (consumer.closed) {
            this.#handleConsumerClose(consumerId, reason);
            return true;
        }
        try {
            await consumer.close();
            this.#handleConsumerClose(consumerId, reason);
            return true;
        } catch (error) {
            console.error(`❌ Failed to close consumer ${consumerId}:`, error.message);
            this.#handleConsumerClose(consumerId, 'force_close_failed');
            return false;
        }
    }

    #handleConsumerClose(consumerId, reason = 'closed') {
        const metadata = this.#consumerMetadata.get(consumerId);
        if (metadata) {
            metadata.closedAt = new Date();
            this.#consumerMetadata.set(consumerId, metadata);

            const socketId = metadata.socketId;
            if (this.#peerConsumers.has(socketId)) {
                const consumers = this.#peerConsumers.get(socketId);
                const index = consumers.indexOf(consumerId);
                if (index !== -1) {
                    consumers.splice(index, 1);
                }
                if (consumers.length === 0) {
                    this.#peerConsumers.delete(socketId);
                }
            }

            const producerId = metadata.producerId;
            if (this.#producerConsumers.has(producerId)) {
                const consumers = this.#producerConsumers.get(producerId);
                const index = consumers.indexOf(consumerId);
                if (index !== -1) {
                    consumers.splice(index, 1);
                }
                if (consumers.length === 0) {
                    this.#producerConsumers.delete(producerId);
                }
            }
        }

        this.#consumers.delete(consumerId);
        console.log(`🗑️ Consumer ${consumerId} closed (${reason})`);
        this.emit('consumer:closed', {
            consumerId,
            reason,
            metadata,
            timestamp: new Date(),
        });

        setTimeout(() => {
            this.#consumerMetadata.delete(consumerId);
        }, 5000);
    }

    getConsumer(consumerId) {
        return this.#consumers.get(consumerId);
    }

    getConsumerMetadata(consumerId) {
        return this.#consumerMetadata.get(consumerId);
    }

    getConsumersForRoom(roomId) {
        const result = [];
        for (const [id, metadata] of this.#consumerMetadata) {
            if (metadata.roomId === roomId && !this.#consumers.get(id)?.closed) {
                result.push({ id, metadata });
            }
        }
        return result;
    }

    getAllConsumers() {
        const result = [];
        for (const [id, consumer] of this.#consumers) {
            if (!consumer.closed) {
                const metadata = this.#consumerMetadata.get(id);
                result.push({
                    id,
                    kind: metadata?.kind,
                    producerId: metadata?.producerId,
                    socketId: metadata?.socketId,
                    roomId: metadata?.roomId,
                    paused: metadata?.paused,
                    active: !consumer.closed,
                    createdAt: metadata?.createdAt,
                });
            }
        }
        return result;
    }

    get count() {
        return this.#consumers.size;
    }

    hasConsumer(consumerId) {
        return this.#consumers.has(consumerId) && !this.#consumers.get(consumerId)?.closed;
    }

    async closePeerConsumers(socketId, reason = 'peer_disconnected') {
        const consumers = this.#getConsumersForPeer(socketId);
        console.log(`🛑 Closing ${consumers.length} consumers for peer ${socketId}...`);
        const promises = consumers.map(({ id }) => this.closeConsumer(id, reason));
        await Promise.all(promises);
        this.emit('peer:consumers_closed', { socketId, count: consumers.length });
    }

    async closeRoomConsumers(roomId, reason = 'room_closed') {
        const consumers = this.getConsumersForRoom(roomId);
        console.log(`🛑 Closing ${consumers.length} consumers for room ${roomId}...`);
        const promises = consumers.map(({ id }) => this.closeConsumer(id, reason));
        await Promise.all(promises);
        this.emit('room:consumers_closed', { roomId, count: consumers.length });
    }

    async closeProducerConsumers(producerId, reason = 'producer_closed') {
        const consumers = this.#getConsumersForProducer(producerId);
        console.log(`🛑 Closing ${consumers.length} consumers for producer ${producerId}...`);
        const promises = consumers.map(({ id }) => this.closeConsumer(id, reason));
        await Promise.all(promises);
        this.emit('producer:consumers_closed', { producerId, count: consumers.length });
    }

    async closeAllConsumers(reason = 'shutdown') {
        console.log(`🛑 Closing ${this.#consumers.size} consumers...`);
        this.emit('consumers:closing', { count: this.#consumers.size });
        const promises = [];
        for (const [id] of this.#consumers) {
            promises.push(this.closeConsumer(id, reason));
        }
        await Promise.all(promises);
        console.log('✅ All consumers closed');
        this.emit('consumers:closed');
    }

    async getConsumerStats(consumerId) {
        const consumer = this.#consumers.get(consumerId);
        if (!consumer) {
            throw new Error(`Consumer ${consumerId} not found`);
        }
        if (consumer.closed) {
            throw new Error(`Consumer ${consumerId} is closed`);
        }
        try {
            const stats = await consumer.getStats();
            return stats;
        } catch (error) {
            console.error(`❌ Failed to get stats for consumer ${consumerId}:`, error.message);
            throw error;
        }
    }

    healthCheck() {
        let healthy = true;
        const details = [];
        for (const [id, consumer] of this.#consumers) {
            const isAlive = !consumer.closed;
            const metadata = this.#consumerMetadata.get(id);
            if (!isAlive) {
                healthy = false;
            }
            details.push({
                id,
                kind: metadata?.kind,
                producerId: metadata?.producerId,
                alive: isAlive,
                paused: metadata?.paused,
                createdAt: metadata?.createdAt,
            });
        }
        return {
            healthy,
            totalConsumers: this.#consumers.size,
            details,
            timestamp: new Date().toISOString(),
        };
    }
}

export const consumerManager = new ConsumerManager();
export default consumerManager;