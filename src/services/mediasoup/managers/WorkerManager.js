// services/mediasoup/WorkerManager.js
import mediasoup from 'mediasoup';
import { EventEmitter } from 'events';
import env from '../../../config/env.js';

/**
 * WorkerManager - Manages mediasoup workers
 * @class WorkerManager
 * @extends EventEmitter
 * @description Handles creation, monitoring, and lifecycle of mediasoup workers
 */
export class WorkerManager extends EventEmitter {
    /** @type {Map<number, import('mediasoup').Worker>} */
    #workers = new Map();
    /** @type {Map<number, {createdAt: Date, status: string}>} */
    #workerMetadata = new Map();
    /** @type {number} */
    #maxWorkers = parseInt(env.WORKER_MAX || '1', 10);
    /** @type {string} */
    #logLevel = env.LOG_LEVEL || 'warn';
    /** @type {number} */
    #rtcMinPort = parseInt(env.RTC_MIN_PORT || '2000', 10);
    /** @type {number} */
    #rtcMaxPort = parseInt(env.RTC_MAX_PORT || '3000', 10);
    /** @type {number} */
    #nextWorkerIndex = 0;
    /** @type {boolean} */
    #autoRestart = env.AUTO_RESTART_WORKER !== 'false';

    /**
     * Get the number of active workers
     * @returns {number}
     */
    get count() {
        return this.#workers.size;
    }

    /**
     * Check if any workers are active
     * @returns {boolean}
     */
    get hasWorkers() {
        return this.#workers.size > 0;
    }

    /**
     * Create a new mediasoup worker
     * @param {Object} options - Worker options
     * @param {string} options.logLevel - Log level
     * @param {number} options.rtcMinPort - Min RTC port
     * @param {number} options.rtcMaxPort - Max RTC port
     * @returns {Promise<import('mediasoup').Worker>}
     * @throws {Error} If worker creation fails
     */
    async createWorker(options = {}) {
        console.log('DEBUG: createWorker called with options:', options);
        try {
            // Check max workers
            if (this.#workers.size >= this.#maxWorkers) {
                throw new Error(`Maximum workers (${this.#maxWorkers}) reached`);
            }

            // Validate port range
            const minPort = options.rtcMinPort || this.#rtcMinPort;
            const maxPort = options.rtcMaxPort || this.#rtcMaxPort;

            if (minPort >= maxPort) {
                throw new Error(`Invalid port range: min (${minPort}) must be < max (${maxPort})`);
            }
            if (minPort < 1024 || maxPort > 65535) {
                throw new Error('Ports must be between 1024 and 65535');
            }

            // Map application log level to valid mediasoup logLevel ('debug' | 'warn' | 'error' | 'none')
            const validMediasoupLevels = ['debug', 'warn', 'error', 'none'];
            const requestedLevel = (options.logLevel || this.#logLevel || '').toLowerCase();
            const mediasoupLogLevel = validMediasoupLevels.includes(requestedLevel) ? requestedLevel : 'warn';

            console.log('DEBUG: About to call mediasoup.createWorker with:', { logLevel: mediasoupLogLevel, rtcMinPort: minPort, rtcMaxPort: maxPort });
            const worker = await mediasoup.createWorker({
                logLevel: mediasoupLogLevel,
                rtcMinPort: minPort,
                rtcMaxPort: maxPort,
            });
            console.log('DEBUG: mediasoup.createWorker finished successfully');

            const pid = worker.pid;
            
            // Store worker
            this.#workers.set(pid, worker);
            this.#workerMetadata.set(pid, {
                createdAt: new Date(),
                status: 'running',
            });

            // Handle worker death
            worker.on('died', () => {
                console.error(`❌ Worker ${pid} died unexpectedly`);
                this.#handleWorkerDeath(pid);
            });

            // Handle worker usage (for monitoring)
            worker.on('usage', (usage) => {
                this.emit('worker:usage', { pid, usage });
            });

            console.log(`✅ Worker created (PID: ${pid})`);
            this.emit('worker:created', { pid });

            return worker;

        } catch (error) {
            console.error(`❌ Failed to create worker:`, error.message);
            this.emit('worker:error', { error: error.message });
            throw new Error(`Worker creation failed: ${error.message}`);
        }
    }

    /**
     * Get a worker by PID
     * @param {number} pid - Worker process ID
     * @returns {import('mediasoup').Worker | undefined}
     */
    getWorker(pid) {
        return this.#workers.get(pid);
    }

    /**
     * Get the next available worker (round-robin)
     * @param {string} strategy - 'round-robin' | 'least-loaded' | 'random'
     * @returns {import('mediasoup').Worker | null}
     */
    getAvailableWorker(strategy = 'round-robin') {
        if (this.#workers.size === 0) {
            return null;
        }

        const workerArray = Array.from(this.#workers.values());

        switch (strategy) {
            case 'round-robin':
                const worker = workerArray[this.#nextWorkerIndex % workerArray.length];
                this.#nextWorkerIndex++;
                return worker;
            
            case 'random':
                return workerArray[Math.floor(Math.random() * workerArray.length)];
            
            case 'least-loaded':
                // Simple: return the first one (you could track load)
                return workerArray[0];
            
            default:
                return workerArray[0];
        }
    }

    /**
     * Get all worker statuses
     * @returns {Array<{pid: number, createdAt: Date, status: string, alive: boolean}>}
     */
    getWorkerStatuses() {
        const result = [];
        for (const [pid, worker] of this.#workers) {
            const metadata = this.#workerMetadata.get(pid);
            result.push({
                pid,
                createdAt: metadata?.createdAt || new Date(),
                status: metadata?.status || 'unknown',
                alive: !worker.closed,
            });
        }
        return result;
    }

    /**
     * Close a specific worker
     * @param {number} pid - Worker process ID
     * @returns {Promise<boolean>}
     */
    async closeWorker(pid) {
        const worker = this.#workers.get(pid);
        if (!worker) {
            console.warn(`⚠️ Worker ${pid} not found`);
            return false;
        }

        try {
            await worker.close();
            this.#workers.delete(pid);
            this.#workerMetadata.delete(pid);
            console.log(`🗑️ Worker ${pid} closed successfully`);
            this.emit('worker:closed', { pid });
            return true;
        } catch (error) {
            console.error(`❌ Failed to close worker ${pid}:`, error.message);
            this.emit('worker:error', { pid, error: error.message });
            return false;
        }
    }

    /**
     * Close all workers (graceful shutdown)
     * @returns {Promise<void>}
     */
    async closeAllWorkers() {
        console.log(`🛑 Closing ${this.#workers.size} workers...`);
        this.emit('workers:closing', { count: this.#workers.size });
        
        const promises = [];
        for (const [pid] of this.#workers) {
            promises.push(this.closeWorker(pid));
        }
        await Promise.all(promises);
        
        console.log('✅ All workers closed');
        this.emit('workers:closed');
    }

    /**
     * Handle worker death (cleanup and optional restart)
     * @param {number} pid - Worker process ID
     * @private
     */
    #handleWorkerDeath(pid) {
        this.#workers.delete(pid);
        const metadata = this.#workerMetadata.get(pid);
        if (metadata) {
            metadata.status = 'died';
            this.#workerMetadata.set(pid, metadata);
        }

        this.emit('worker:died', { pid, timestamp: new Date() });

        // Auto-restart if enabled and no workers left
        if (this.#autoRestart && this.#workers.size === 0) {
            console.log('🔄 Auto-restarting worker...');
            this.createWorker().catch((error) => {
                console.error('❌ Auto-restart failed:', error);
                this.emit('worker:restart_failed', { error: error.message });
            });
        }
    }

    /**
     * Health check for all workers
     * @returns {Promise<{healthy: boolean, details: any[], totalWorkers: number, timestamp: string}>}
     */
    async healthCheck() {
        const details = [];
        let healthy = true;

        for (const [pid, worker] of this.#workers) {
            try {
                const isAlive = !worker.closed;
                details.push({
                    pid,
                    alive: isAlive,
                    closed: worker.closed,
                });
                if (!isAlive) {
                    healthy = false;
                }
            } catch (error) {
                healthy = false;
                details.push({
                    pid,
                    error: error.message,
                    alive: false,
                });
            }
        }

        return {
            healthy,
            details,
            totalWorkers: this.#workers.size,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Get worker statistics
     * @returns {Object}
     */
    getStats() {
        return {
            count: this.#workers.size,
            maxWorkers: this.#maxWorkers,
            statuses: this.getWorkerStatuses(),
        };
    }
}

// Export singleton instance
export const workerManager = new WorkerManager();

// Export default
export default workerManager;