import { createLogger } from './logger.js';
import { EventEmitter } from 'events';

const logger = createLogger({ module: 'STATE', toFile: true });
const logMain = (msg, meta) => logger.info(String(msg), meta);
const logDebug = (msg, meta) => logger.debug(String(msg), meta);
const logWarn = (msg, meta) => logger.warn(String(msg), meta);
const logError = (msg, meta) => logger.error(String(msg), meta);

/**
 * Tracciatore di inconsistenze e metriche di errore (Fase 4).
 */
export const inconsistencyTracker = {
    idMismatches: 0,
    recoveredTempFiles: 0,
    writeRetries: 0,
    diskSpaceWarnings: 0,
    encryptionFailures: 0,
    plainTextKeyDetected: 0,
    stateDivergences: 0,
    concurrencyConflicts: 0,
    memoryWarnings: 0,
    validationFailures: 0,
    orphanedAssets: 0,
    missingAssets: 0,
    crashDetected: 0,

    getReport() {
        return {
            idMismatches: this.idMismatches,
            recoveredTempFiles: this.recoveredTempFiles,
            writeRetries: this.writeRetries,
            diskSpaceWarnings: this.diskSpaceWarnings,
            encryptionFailures: this.encryptionFailures,
            plainTextKeyDetected: this.plainTextKeyDetected,
            stateDivergences: this.stateDivergences,
            concurrencyConflicts: this.concurrencyConflicts,
            memoryWarnings: this.memoryWarnings,
            validationFailures: this.validationFailures,
            orphanedAssets: this.orphanedAssets,
            missingAssets: this.missingAssets,
            crashDetected: this.crashDetected,
            totalAlerts: this.idMismatches + this.recoveredTempFiles + this.writeRetries + this.diskSpaceWarnings +
                this.encryptionFailures + this.plainTextKeyDetected + this.stateDivergences +
                this.concurrencyConflicts + this.memoryWarnings + this.validationFailures +
                this.orphanedAssets + this.missingAssets + this.crashDetected
        };
    }
};

/**
 * Gestore code di scrittura per evitare race conditions durante il read-merge-write.
 * Enhanced with debouncing and save request coalescing.
 */
export class WriteSequencer extends EventEmitter {
    constructor() {
        super();
        this.queues = new Map();
        this.pendingSaves = new Map(); // fileId -> { data, timestamp, attempts }
        this.saveMetrics = new Map(); // fileId -> { count, lastSave, avgInterval }
        this.debounceTimeouts = new Map(); // fileId -> { token } (Used for verifying active request)
        this.debounceDelay = 3000; // 3 seconds default (more conservative for disk wear)
        this.maxCoalesceWindow = 10000; // 10 seconds max to coalesce saves (more conservative)
        this.blockedIds = new Set(); // IDs blocked from saving
        this.runningOps = new Map(); // id -> { operationId, enqueuedAt, startedAt, priority }
        this.queueDepth = new Map(); // id -> number
    }

    /**
     * Block writes for a specific ID
     */
    block(id) {
        this.blockedIds.add(id);
        // Clear pending debounce (invalidate token)
        this.debounceTimeouts.delete(id);

        // Remove from pending coalescing
        this.pendingSaves.delete(id);
        logMain(`[WriteSequencer] ID Blocked: ${id}`);
        this.emit('blocked', id);
    }

    /**
     * Unblock writes for a specific ID
     */
    unblock(id) {
        this.blockedIds.delete(id);
        logMain(`[WriteSequencer] ID Unblocked: ${id}`);
        this.emit('unblocked', id);
    }

    /**
     * Cancels all pending operations for a specific ID.
     * Useful when switching projects to ensure no stale data overwrites new state.
     */
    cancelAll(id) {
        const queue = this.queues.get(id);
        if (queue) {
            this.queues.delete(id);
            this.unblock(id);
            // Also explicitly remove any pending debounce timeouts for this ID
            // This is critical to stop the "delayed" save from firing
            for (const [key, context] of this.debounceTimeouts.entries()) {
                if (key === id || (typeof key === 'string' && key.includes(id))) {
                    this.debounceTimeouts.delete(key);
                    logMain(`[WriteSequencer] Cancelled pending debounce for ${key}`);
                }
            }
            logMain(`[WriteSequencer] Cancelled all operations for ID: ${id}`);
        }
    }

    /**
     * Enhanced enqueue with strict sequential execution and debouncing
     */
    enqueue(id, task, options = {}) {
        const { priority = 'NORMAL', force = false } = options;
        const operationId = `writeOp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const enqueuedAt = Date.now();
        const nextDepth = (this.queueDepth.get(id) || 0) + 1;
        this.queueDepth.set(id, nextDepth);

        logMain(`[WriteSequencer] [${id}] Enqueued ${operationId}`, { id, operationId, priority, queueDepth: nextDepth });

        // Immediate check: if blocked, reject
        if (this.blockedIds.has(id) && !force) {
            logWarn(`[WriteSequencer] [${id}] Rejected ${operationId}: blocked`, { id, operationId, priority, queueDepth: nextDepth });
            this.queueDepth.set(id, Math.max(0, (this.queueDepth.get(id) || 1) - 1));
            return Promise.resolve({ success: false, error: 'BLOCKED_BY_BACKEND' });
        }

        // Track save metrics for monitoring
        this.trackSaveMetrics(id);

        // Generate a unique token for this request
        const requestToken = Symbol('requestToken');
        const debounceKey = options.debounceKey || id;

        let forceExecution = null;
        const delayPromise = new Promise(resolve => {
            const timerId = setTimeout(() => resolve(false), this.getDebounceDelay(priority));
            forceExecution = () => {
                clearTimeout(timerId);
                resolve(true); // true = forced/flushed
            };
        });

        this.debounceTimeouts.set(debounceKey, {
            token: requestToken,
            force: forceExecution
        });

        const current = this.queues.get(id) || Promise.resolve();

        const start = current.then(async () => {
            // 1. Check if blocked (again, before execution)
            if (this.blockedIds.has(id) && !force) {
                logWarn(`[WriteSequencer] [${id}] Aborted ${operationId}: blocked before execution`, { id, operationId, priority });
                return {
                    response: Promise.resolve({ success: false, error: 'BLOCKED_BY_BACKEND' }),
                    completion: Promise.resolve()
                };
            }

            // 2. Handle Debounce Delay
            const delay = this.getDebounceDelay(priority);
            if (delay > 0) {
                // Wait for delay or force flush
                const wasForced = await delayPromise;

                if (wasForced) {
                    logDebug(`[WriteSequencer] [${id}] Forced execution (flush) for ${operationId}`, { id, operationId });
                }

                // Check if this request is still the latest one for this key
                const active = this.debounceTimeouts.get(debounceKey);
                if (!active || active.token !== requestToken) {
                    logDebug(`[WriteSequencer] [${id}] Skipped ${operationId}: debounced_replaced (key: ${debounceKey})`, { id, operationId, priority });
                    return {
                        response: Promise.resolve({ success: true, skipped: true, reason: 'debounced_replaced' }),
                        completion: Promise.resolve()
                    };
                }
            }

            // 3. Execute Task
            const startedAt = Date.now();
            this.runningOps.set(id, { id, operationId, enqueuedAt, startedAt, priority });
            this.pendingSaves.set(id, { timestamp: startedAt, attempts: 1, operationId });

            logMain(`[WriteSequencer] [${id}] Start ${operationId}`, {
                id,
                operationId,
                priority,
                queueDepth: this.queueDepth.get(id) || 0,
                metrics: this.getMetrics(id)
            });

            const timeoutMs = 30000;
            let timeoutId;
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    const pending = this.pendingSaves.get(id);
                    const ageMs = pending?.timestamp ? Date.now() - pending.timestamp : undefined;
                    const running = this.runningOps.get(id);
                    logError(`[WriteSequencer] [${id}] CRITICAL TIMEOUT (> ${Math.round(timeoutMs / 1000)}s) for ${running?.operationId || operationId}. Queue remains locked until completion.`, {
                        id,
                        operationId: running?.operationId || operationId,
                        priority,
                        ageMs,
                        queueDepth: this.queueDepth.get(id) || 0
                    });
                    reject(new Error('WriteSequencer task timeout'));
                }, timeoutMs);
            });

            const opContext = { id, operationId, priority, enqueuedAt, startedAt };
            const taskPromise = (async () => task(opContext))();
            const completion = taskPromise.finally(() => {
                try {
                    clearTimeout(timeoutId);
                } catch { }
                this.pendingSaves.delete(id);
                this.runningOps.delete(id);
                const active = this.debounceTimeouts.get(debounceKey);
                if (active && active.token === requestToken) {
                    this.debounceTimeouts.delete(debounceKey);
                }
                const prevDepth = this.queueDepth.get(id) || 0;
                const newDepth = Math.max(0, prevDepth - 1);
                if (newDepth === 0) this.queueDepth.delete(id);
                else this.queueDepth.set(id, newDepth);
            });

            const response = Promise.race([completion, timeoutPromise]).catch((e) => {
                if (e?.message !== 'WriteSequencer task timeout') {
                    logError(`[WriteSequencer] [${id}] Failed ${operationId}`, { id, operationId, priority, error: e?.message || String(e) });
                }
                throw e;
            });

            return { response, completion };
        });

        const responsePromise = start.then(({ response }) => response);
        const completionPromise = start.then(({ completion }) => completion).catch(() => { });

        this.queues.set(id, completionPromise);
        return responsePromise;
    }

    /**
     * Get debounce delay based on priority
     */
    getDebounceDelay(priority) {
        switch (priority) {
            case 'CRITICAL': return 0; // No debounce for critical saves
            case 'BACKGROUND': return 3000; // 3 seconds for background saves
            case 'BATCH': return 10000; // 10 seconds for batch operations
            default: return this.debounceDelay;
        }
    }

    /**
     * Track save metrics for monitoring
     */
    trackSaveMetrics(fileId) {
        const now = Date.now();
        const metrics = this.saveMetrics.get(fileId) || { count: 0, lastSave: 0, avgInterval: 0 };

        if (metrics.lastSave > 0) {
            const interval = now - metrics.lastSave;
            metrics.avgInterval = (metrics.avgInterval * metrics.count + interval) / (metrics.count + 1);
        }

        metrics.count++;
        metrics.lastSave = now;

        this.saveMetrics.set(fileId, metrics);

        // Alert on excessive save rates
        if (metrics.count > 10 && metrics.avgInterval < 1000) {
            inconsistencyTracker.concurrencyConflicts++;
            logWarn(`High save frequency detected for ${fileId}`, {
                count: metrics.count,
                avgInterval: Math.round(metrics.avgInterval),
                lastInterval: now - (metrics.lastSave - metrics.avgInterval)
            });
        }
    }

    /**
     * Get save metrics for a file
     */
    getMetrics(fileId) {
        return this.saveMetrics.get(fileId) || { count: 0, lastSave: 0, avgInterval: 0 };
    }

    /**
     * Force flush all pending saves
     */
    async flushAll() {
        logMain('WriteSequencer flushAll initiated');

        // Force execution of all pending debounced tasks
        for (const context of this.debounceTimeouts.values()) {
            if (context && typeof context.force === 'function') {
                context.force();
            }
        }

        // Do NOT clear debounceTimeouts here immediately.
        // The tasks need to find themselves in the map to validate their token.
        // They will clean themselves up upon completion.

        // Wait for current queue to complete
        const promises = [];
        for (const [id, queue] of this.queues) {
            promises.push(queue);
        }

        await Promise.allSettled(promises);

        // Now it's safe to clear remaining state if any
        this.pendingSaves.clear();
        this.runningOps.clear();
        this.queueDepth.clear();
        this.debounceTimeouts.clear(); // Safe to clear now that everything has run

        logMain('WriteSequencer flush completed', {
            filesFlushed: promises.length,
            pendingCleared: this.pendingSaves.size
        });
    }
}

export const writeSequencer = new WriteSequencer();
export const settingsMutex = new WriteSequencer();
