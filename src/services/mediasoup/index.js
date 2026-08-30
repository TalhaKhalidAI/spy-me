
// ============================================================
// 1. EXPORT ALL MANAGERS (for direct access)
// ============================================================
export { WorkerManager } from './managers/WorkerManager.js';
export { RouterManager } from './managers/RouterManager.js';
export { TransportManager } from './managers/TransportManager.js';
export { ProducerManager } from './managers/ProducerManager.js';
export { ConsumerManager } from './managers/ConsumerManager.js';

// ============================================================
// 2. EXPORT SINGLETON INSTANCES (ready-to-use)
// ============================================================
export { workerManager } from './managers/WorkerManager.js';
export { routerManager } from './managers/RouterManager.js';
export { producerManager } from './managers/ProducerManager.js';
export { consumerManager } from './managers/ConsumerManager.js';

// ============================================================
// 3. SFU ORCHESTRATOR (Main entry point - RECOMMENDED)
// ============================================================
import TransportManager from './managers/TransportManager.js';
import { workerManager } from './managers/WorkerManager.js';
import { routerManager } from './managers/RouterManager.js';
import { producerManager } from './managers/ProducerManager.js';
import { consumerManager } from './managers/ConsumerManager.js';

class SFU {
    constructor() {
        this.workerManager = workerManager;
        this.routerManager = routerManager;
        this.transportManager = null;
        this.producerManager = producerManager;
        this.consumerManager = consumerManager;
        this.router = null;
        this.initialized = false;
    }

    async initialize(config = {}) {
        try {
            const worker = await this.workerManager.createWorker();
            console.log(`✅ Worker: ${worker.pid}`);

            this.router = await this.routerManager.createRouter(
                config.roomId || 'default-room'
            );
            console.log(`✅ Router: ${this.router.id}`);

            this.transportManager = new TransportManager(this.routerManager, {
                listenIp: config.listenIp || '0.0.0.0',
                announcedIp: config.announcedIp || '127.0.0.1',
            });
            console.log('✅ TransportManager created');

            this.producerManager.setTransportGetter((id) => {
                return this.transportManager.getTransport(id);
            });

            this.consumerManager.setTransportGetter((id) => {
                return this.transportManager.getTransport(id);
            });

            this.consumerManager.setProducerGetter((id) => {
                return this.producerManager.getProducer(id);
            });

            this.initialized = true;
            console.log('✅ SFU initialized');
            return true;
        } catch (error) {
            console.error('❌ SFU init failed:', error);
            throw error;
        }
    }

    isReady() {
        return this.initialized;
    }

    getRtpCapabilities() {
        if (!this.router) return null;
        return this.router.rtpCapabilities;
    }

    async createSendTransport(socketId, roomId, options = {}) {
        this.#checkReady();
        return this.transportManager.createSendTransport(socketId, roomId, options);
    }

    async createRecvTransport(socketId, roomId, options = {}) {
        this.#checkReady();
        return this.transportManager.createRecvTransport(socketId, roomId, options);
    }

    async connectTransport(transportId, dtlsParameters) {
        this.#checkReady();
        return this.transportManager.connectTransport(transportId, dtlsParameters);
    }

    async createProducer({ transportId, socketId, roomId, kind, rtpParameters, source, appData }) {
        this.#checkReady();
        return this.producerManager.createProducer({
            transportId,
            socketId,
            roomId,
            kind,
            rtpParameters,
            source: source || 'camera',
            appData: appData || {},
        });
    }

    async createConsumer({ transportId, socketId, roomId, producerId, rtpCapabilities, options }) {
        this.#checkReady();
        return this.consumerManager.createConsumer({
            transportId,
            socketId,
            roomId,
            producerId,
            rtpCapabilities,
            options: options || { paused: true },
        });
    }

    async pauseProducer(producerId) {
        this.#checkReady();
        return this.producerManager.pauseProducer(producerId);
    }

    async resumeProducer(producerId) {
        this.#checkReady();
        return this.producerManager.resumeProducer(producerId);
    }

    async pauseConsumer(consumerId) {
        this.#checkReady();
        return this.consumerManager.pauseConsumer(consumerId);
    }

    async resumeConsumer(consumerId) {
        this.#checkReady();
        return this.consumerManager.resumeConsumer(consumerId);
    }

    async closeProducer(producerId) {
        this.#checkReady();
        return this.producerManager.closeProducer(producerId);
    }

    async closeConsumer(consumerId) {
        this.#checkReady();
        return this.consumerManager.closeConsumer(consumerId);
    }

    getProducers(roomId) {
        this.#checkReady();
        return this.producerManager.getProducersForRoom(roomId);
    }

    getConsumers(roomId) {
        this.#checkReady();
        return this.consumerManager.getConsumersForRoom(roomId);
    }

    async cleanupPeer(socketId) {
        await this.producerManager.closePeerProducers(socketId);
        await this.consumerManager.closePeerConsumers(socketId);
        await this.transportManager.closePeerTransports(socketId);
    }

    async shutdown() {
        await this.transportManager?.closeAllTransports();
        await this.producerManager?.closeAllProducers();
        await this.consumerManager?.closeAllConsumers();
        await this.routerManager?.closeAllRouters();
        await this.workerManager?.closeAllWorkers();
        this.initialized = false;
        console.log('✅ SFU shutdown complete');
    }

    #checkReady() {
        if (!this.initialized) {
            throw new Error('SFU not initialized. Call initialize() first.');
        }
    }
}

export const sfu = new SFU();
export default sfu;