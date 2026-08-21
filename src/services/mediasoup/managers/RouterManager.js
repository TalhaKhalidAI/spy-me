// ============================================================
// COMPOSITION (has-a relationship)
// ============================================================
import { workerManager } from "./WorkerManager.js";
import mediasoup from 'mediasoup';

export class RouterManager {
    #routers = new Map();
    #workerManager;
    #mediaCodecs;
    #logger;
    
    constructor(options = {}) {
        // Use WorkerManager instance (composition)
        this.#workerManager = options.workerManager || workerManager;
        this.#logger = options.logger || console;
        this.#mediaCodecs = options.mediaCodecs || this.#defaultCodecs();
        
        this.#logger.info('[RouterManager] Initialized');
    }
    
    #defaultCodecs() {
        return [
            {
                kind: 'audio',
                mimeType: 'audio/opus',
                clockRate: 48000,
                channels: 2,
            },
            {
                kind: 'video',
                mimeType: 'video/VP8',
                clockRate: 90000,
                payloadType: 100,
            },
            {
                kind: 'video',
                mimeType: 'video/H264',
                clockRate: 90000,
                payloadType: 101,
                parameters: {
                    'packetization-mode': 1,
                    'level-asymmetry-allowed': 1,
                },
            },
        ];
    }
    /**
     * Close all routers (graceful shutdown)
     * @returns {Promise<void>}
     */
    async closeAllRouters() {
        console.log(`🛑 Closing ${this.#routers.size} routers...`);
        const promises = [];
        for (const [roomId] of this.#routers) {
            promises.push(this.closeRouter(roomId));
        }
        await Promise.all(promises);
        console.log('✅ All routers closed');
    }
    async createRouter(roomId, options = {}) {
        try {
            this.#logger.info(`[RouterManager] Creating router for room: ${roomId}`);
            
            // Use the worker manager
            const worker = this.#workerManager.getAvailableWorker();
            if (!worker) {
                throw new Error('No worker available');
            }
            
            const router = await worker.createRouter({
                mediaCodecs: options.mediaCodecs || this.#mediaCodecs,
            });
            
            this.#routers.set(roomId, router);
            this.#logger.info(`✅ Router created for room ${roomId}`);
            
            return router;
            
        } catch (error) {
            this.#logger.error(`[RouterManager] Failed to create router:`, error);
            throw error;
        }
    }
    
    getRouter(roomId) {
        return this.#routers.get(roomId);
    }
        getAllRouters() {
        return this.#routers;
    }
        get count() {
        return this.#routers.size;
    }
    async closeRouter(roomId) {
        const router = this.#routers.get(roomId);
        if (!router) return false;
        
        await router.close();
        this.#routers.delete(roomId);
        this.#logger.info(`🗑️ Router for room ${roomId} closed`);
        return true;
    }
}

export const routerManager = new RouterManager();
export default routerManager;