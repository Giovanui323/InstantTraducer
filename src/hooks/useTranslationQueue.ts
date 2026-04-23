import { useCallback, useEffect, useRef, useState } from 'react';
import { log } from '../services/logger';
import { GeminiModel } from '../types';
import { globalConcurrency } from '../services/concurrencyManager';
import { resetGeminiCooldowns } from '../services/geminiService';

export interface ConcurrencyControl {
    acquire: (page: number, signal?: AbortSignal) => Promise<void>;
    release: (page: number) => void;
}

// Global registry for Circuit Breaker state (per-project persistence)
const globalCircuitBreakerRegistry: Record<string, {
    failures: Record<number, number>;
    lastFailureTime: Record<number, number>;
    isOpen: Record<number, boolean>;
    consecutiveFailures: Record<number, number>;
}> = {};

const createBreakerState = () => ({
    failures: {},
    lastFailureTime: {},
    isOpen: {},
    consecutiveFailures: {}
});

interface UseTranslationQueueProps {
    processPage: (page: number, signal?: AbortSignal, extraInstruction?: string, translationModelOverride?: GeminiModel, concurrencyControl?: ConcurrencyControl) => Promise<void>;
    MAX_CONCURRENT_TRANSLATIONS: number;
    checkDependency?: (page: number, queue: number[], inFlight: Record<number, any>, queued: Set<number>, isForced: boolean, active: Set<number>) => boolean;
    externalInFlightRef?: React.MutableRefObject<Record<number, AbortController>>;
    isPaused?: boolean;
    projectId?: string | null;
}

export const useTranslationQueue = ({
    processPage,
    MAX_CONCURRENT_TRANSLATIONS,
    checkDependency,
    externalInFlightRef,
    isPaused = false,
    projectId
}: UseTranslationQueueProps) => {

    const translationQueueRef = useRef<number[]>([]);
    const extraInstructionsRef = useRef<Record<number, string>>({});
    const translationModelOverridesRef = useRef<Record<number, GeminiModel>>({});
    const completionCallbacksRef = useRef<Record<number, () => void>>({});
    const queuedPagesRef = useRef<Set<number>>(new Set());
    const activePagesRef = useRef<Set<number>>(new Set());
    const internalInFlightRef = useRef<Record<number, AbortController>>({});
    const inFlightTranslationRef = externalInFlightRef || internalInFlightRef;
    const isPumpingQueueRef = useRef<boolean>(false);
    const isAbortingRef = useRef<boolean>(false);
    const forcedPagesRef = useRef<Set<number>>(new Set());
    // LOOP FIX: Track active parameters to prevent redundant forced enqueues
    const activeTranslationParamsRef = useRef<Record<number, { extraInstruction?: string, translationModelOverride?: GeminiModel, onComplete?: () => void }>>({});
    const [queueStats, setQueueStats] = useState({ queued: 0, active: 0 });
    const isPausedRef = useRef(isPaused);
    const slotRequestQueueRef = useRef<Array<(value: void | PromiseLike<void>) => void>>([]);

    // Circuit breaker pattern implementation - Uses Global Registry
    const getBreaker = useCallback(() => {
        const key = projectId || 'default';
        if (!globalCircuitBreakerRegistry[key]) {
            globalCircuitBreakerRegistry[key] = createBreakerState();
        }
        return globalCircuitBreakerRegistry[key];
    }, [projectId]);

    const CIRCUIT_BREAKER_THRESHOLD = 3; // Max consecutive failures before opening circuit
    const CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds before trying again

    // Queue health monitoring
    const queueHealthRef = useRef<{
        translationStartTimes: Record<number, number>;
        stuckTranslations: Record<number, number>;
        lastHealthCheck: number;
    }>({
        translationStartTimes: {},
        stuckTranslations: {},
        lastHealthCheck: Date.now()
    });

    const STUCK_TRANSLATION_TIMEOUT = 300000; // 5 minutes
    const HEALTH_CHECK_INTERVAL = 60000; // 1 minute

    useEffect(() => {
        const wasPaused = isPausedRef.current;
        isPausedRef.current = isPaused;
        if (wasPaused && !isPaused) {
            // Se eravamo in pausa e ora non lo siamo più, facciamo ripartire la coda
            void pumpQueue();
        }
    }, [isPaused]);

    // Circuit breaker helper functions
    const isCircuitOpen = useCallback((page: number): boolean => {
        const breaker = getBreaker();
        const now = Date.now();

        // Check if circuit is open and timeout has passed
        if (breaker.isOpen[page]) {
            const lastFailure = breaker.lastFailureTime[page];
            if (now - lastFailure > CIRCUIT_BREAKER_TIMEOUT) {
                // Reset circuit breaker
                breaker.isOpen[page] = false;
                breaker.consecutiveFailures[page] = 0;
                log.info(`[CIRCUIT] Circuit breaker reset for page ${page} after timeout`);
                return false;
            }
            return true;
        }

        return false;
    }, [getBreaker]);

    const recordFailure = useCallback((page: number): void => {
        const breaker = getBreaker();
        const now = Date.now();

        breaker.failures[page] = (breaker.failures[page] || 0) + 1;
        breaker.lastFailureTime[page] = now;
        breaker.consecutiveFailures[page] = (breaker.consecutiveFailures[page] || 0) + 1;

        log.warning(`[CIRCUIT] Failure recorded for page ${page} (consecutive: ${breaker.consecutiveFailures[page]})`);

        // Open circuit if threshold reached
        if (breaker.consecutiveFailures[page] >= CIRCUIT_BREAKER_THRESHOLD) {
            breaker.isOpen[page] = true;
            log.error(`[CIRCUIT] Circuit breaker OPENED for page ${page} after ${CIRCUIT_BREAKER_THRESHOLD} consecutive failures`);
        }
    }, [getBreaker]);

    const recordSuccess = useCallback((page: number): void => {
        const breaker = getBreaker();

        if (breaker.consecutiveFailures[page] > 0) {
            log.info(`[CIRCUIT] Success recorded for page ${page}, resetting consecutive failure count`);
        }

        // Reset consecutive failures on success
        breaker.consecutiveFailures[page] = 0;
        breaker.isOpen[page] = false;
    }, [getBreaker]);

    const processPageRef = useRef(processPage);

    // Update processPageRef whenever processPage changes (e.g. settings update)
    useEffect(() => {
        processPageRef.current = processPage;
    }, [processPage]);

    // Ref to hold the latest pumpQueue function to avoid stale closures in recursive calls
    const pumpQueueRef = useRef<(() => Promise<void>) | undefined>(undefined);

    const acquireSlot = useCallback(async (page: number, signal?: AbortSignal) => {
        if (signal?.aborted) throw new Error('Aborted');

        // Try to acquire immediately
        if (activePagesRef.current.size < MAX_CONCURRENT_TRANSLATIONS) {
            if (!activePagesRef.current.has(page)) {
                activePagesRef.current.add(page);
                setQueueStats(prev => ({ ...prev, active: activePagesRef.current.size }));
            }
            return;
        }

        // Wait for slot
        log.info(`[QUEUE] Page ${page} waiting for slot re-acquisition...`);
        await new Promise<void>((resolve, reject) => {
            let onAbort: (() => void) | undefined;

            const safeResolve = () => {
                if (onAbort && signal) signal.removeEventListener('abort', onAbort);
                resolve();
            };

            if (signal) {
                onAbort = () => {
                    // Remove from queue
                    const idx = slotRequestQueueRef.current.indexOf(safeResolve);
                    if (idx > -1) slotRequestQueueRef.current.splice(idx, 1);
                    reject(new Error('Aborted'));
                };
                signal.addEventListener('abort', onAbort);
            }

            slotRequestQueueRef.current.push(safeResolve);
        });

        // Slot acquired (passed from releaseSlot)
        if (!activePagesRef.current.has(page)) {
            activePagesRef.current.add(page);
            setQueueStats(prev => ({ ...prev, active: activePagesRef.current.size }));

            // Trigger pumpQueue to allow dependent pages to start (Pipelining)
            // since this page is now Active and might satisfy dependencies.
            if (pumpQueueRef.current) {
                void pumpQueueRef.current();
            }
        }
    }, [MAX_CONCURRENT_TRANSLATIONS]);

    const releaseSlot = useCallback((page: number) => {
        if (activePagesRef.current.has(page)) {
            activePagesRef.current.delete(page);
            setQueueStats(prev => ({ ...prev, active: activePagesRef.current.size }));
            log.info(`[QUEUE] Page ${page} released slot temporarily.`);

            // Prioritize waking up waiting tasks (FIFO)
            if (slotRequestQueueRef.current.length > 0) {
                const resolve = slotRequestQueueRef.current.shift();
                if (resolve) {
                    resolve();
                    return; // Slot transferred to waiter
                }
            }

            // If no one waiting, pump the queue for new tasks
            // Use the ref to ensure we call the latest version
            if (pumpQueueRef.current) {
                void pumpQueueRef.current();
            }
        }
    }, []);

    const concurrencyControl = useRef<ConcurrencyControl>({
        acquire: acquireSlot,
        release: releaseSlot
    });

    // Update concurrency control refs when dependencies change
    useEffect(() => {
        concurrencyControl.current = { acquire: acquireSlot, release: releaseSlot };
    }, [acquireSlot, releaseSlot]);

    const pumpQueue = useCallback(async () => {
        if (isPumpingQueueRef.current || isAbortingRef.current) {
            return;
        }

        isPumpingQueueRef.current = true;
        try {
            while (
                translationQueueRef.current.length > 0 &&
                activePagesRef.current.size < MAX_CONCURRENT_TRANSLATIONS &&
                !isAbortingRef.current
            ) {
                // Trova la prima pagina che può procedere
                const pageIndex = translationQueueRef.current.findIndex(p => {
                    // Una pagina "forced" ignora lo stato di pausa (MODIFICA: Ora rispetta la pausa per evitare loop su errori)
                    const isForced = forcedPagesRef.current.has(p);
                    if (isPausedRef.current) return false;

                    if (!checkDependency) return true;

                    const ok = checkDependency(p, translationQueueRef.current, inFlightTranslationRef.current, queuedPagesRef.current, isForced, activePagesRef.current);
                    if (!ok && translationQueueRef.current.length > 0 && translationQueueRef.current[0] === p) {
                        log.info(`[QUEUE] Pagina ${p} in attesa di dipendenze...`);
                    }
                    return ok;
                });

                if (pageIndex === -1) {
                    // Se siamo qui, o la coda è vuota (non possibile per il while), 
                    // o tutte le pagine sono bloccate da dipendenze o dalla pausa
                    if (translationQueueRef.current.length > 0) {
                        if (isPausedRef.current) {
                            log.info(`[QUEUE] Coda in pausa. ${translationQueueRef.current.length} pagine in attesa.`);
                        } else if (activePagesRef.current.size > 0) {
                            // If there are active pages, we are not stalled, just bottlenecked by dependencies.
                            // Log as info/debug to reduce noise.
                            // log.debug(`[QUEUE] Blocked by dependencies (${translationQueueRef.current.length} waiting), but ${activePagesRef.current.size} pages are active.`);
                        } else {
                            const first = translationQueueRef.current[0];
                            const activeIds = Array.from(activePagesRef.current).join(',');
                            const inFlightIds = Object.keys(inFlightTranslationRef.current).join(',');
                            log.warn(`[QUEUE] STALLED: All ${translationQueueRef.current.length} pages blocked. Head (p${first}) blocked. Active: ${activePagesRef.current.size} [${activeIds}], InFlight: [${inFlightIds}]`);

                            // SELF-HEAL: Check for Zombies in queuedPagesRef
                            // Pages that are in the Set but NOT in the Array and NOT active are zombies.
                            const zombies = Array.from(queuedPagesRef.current).filter(p =>
                                !translationQueueRef.current.includes(p) &&
                                !activePagesRef.current.has(p) &&
                                !inFlightTranslationRef.current[p]
                            );

                            if (zombies.length > 0) {
                                log.error(`[QUEUE] Found ${zombies.length} ZOMBIE pages in queuedPagesRef (not in queue/active). Clearing: ${zombies.join(', ')}`);
                                zombies.forEach(z => queuedPagesRef.current.delete(z));
                                // Retry pumping immediately since state has changed
                                continue;
                            }
                        }
                    }
                    break;
                }

                const page = translationQueueRef.current.splice(pageIndex, 1)[0];
                if (page === undefined) break;

                // Check circuit breaker before processing
                if (isCircuitOpen(page)) {
                    const failures = getBreaker().consecutiveFailures[page] || 0;
                    log.error(`[QUEUE] Page ${page} failed too many times (${failures}). Skipping/Dropping to unblock queue.`);

                    // Remove from tracking sets to unblock dependencies
                    queuedPagesRef.current.delete(page);
                    forcedPagesRef.current.delete(page);

                    // Cleanup callbacks and instructions
                    delete extraInstructionsRef.current[page];
                    delete translationModelOverridesRef.current[page];
                    const onComplete = completionCallbacksRef.current[page];
                    delete completionCallbacksRef.current[page];

                    // Notify caller if needed (best effort)
                    if (onComplete) {
                        try { onComplete(); } catch (e) { log.error(`Error in completion callback for skipped page ${page}`, e); }
                    }

                    // Update stats
                    setQueueStats(prev => ({
                        ...prev,
                        queued: translationQueueRef.current.length,
                        active: activePagesRef.current.size
                    }));

                    // Continue to next page immediately
                    continue;
                }

                queuedPagesRef.current.delete(page);
                forcedPagesRef.current.delete(page); // Rimuoviamo il flag force una volta prelevata
                const extraInstruction = extraInstructionsRef.current[page];
                delete extraInstructionsRef.current[page];
                const translationModelOverride = translationModelOverridesRef.current[page];
                delete translationModelOverridesRef.current[page];
                const onComplete = completionCallbacksRef.current[page];
                delete completionCallbacksRef.current[page];

                const controller = new AbortController();
                inFlightTranslationRef.current[page] = controller;
                activePagesRef.current.add(page);

                // LOOP FIX: Store active parameters
                activeTranslationParamsRef.current[page] = {
                    extraInstruction,
                    translationModelOverride,
                    onComplete
                };

                setQueueStats(prev => ({
                    ...prev,
                    queued: translationQueueRef.current.length,
                    active: activePagesRef.current.size
                }));

                log.info(`[QUEUE] Avvio traduzione per pagina ${page} (attive: ${activePagesRef.current.size}/${MAX_CONCURRENT_TRANSLATIONS})`);

                // SAFETY VALVE TIMEOUT: 5 minutes (must be > AI_TRANSLATION_TIMEOUT_MS)
                const SAFETY_TIMEOUT_MS = 300000;

                // Avvio asincrono del processo
                void (async (p: number, ctrl: AbortController, extra?: string, modelOverride?: GeminiModel, done?: () => void) => {
                    let safetyTimer: NodeJS.Timeout | undefined;
                    try {
                        // ACQUIRE GLOBAL SLOT to prevent resource contention with verification queue
                        await globalConcurrency.acquire('Translation');

                        // Double-check Pause State (in case it changed during await acquire)
                        if (isPausedRef.current && !forcedPagesRef.current.has(p)) {
                            log.info(`[QUEUE] Pagina ${p} saltata dopo acquisizione slot perché la coda è in pausa.`);
                            // We don't throw, we just exit. Finally block will release slot.
                            return;
                        }

                        // USE REF to get the LATEST processPage (with updated settings/keys)
                        // WRAP IN SAFETY TIMEOUT RACE to prevent Leaky Semaphore (Zombie Slots)
                        await Promise.race([
                            processPageRef.current(p, ctrl.signal, extra, modelOverride, concurrencyControl.current),
                            new Promise<void>((_, reject) => {
                                safetyTimer = setTimeout(() => {
                                    reject(new Error(`Queue Safety Watchdog: Timeout forced for page ${p}`));
                                }, SAFETY_TIMEOUT_MS);
                            })
                        ]);

                        recordSuccess(p); // Record success for circuit breaker
                    } catch (e: any) {
                        log.error(`Queue process error for page ${p}`, e);

                        // If it was our safety timeout, we MUST ensure the controller is aborted
                        // to kill any underlying stuck fetch/process
                        if (e.message?.includes('Queue Safety Watchdog')) {
                            log.error(`[WATCHDOG] Force-aborting stuck page ${p} to release slot.`);
                            try { ctrl.abort(); } catch { }
                        }

                        recordFailure(p); // Record failure for circuit breaker
                    } finally {
                        if (safetyTimer) clearTimeout(safetyTimer);

                        // RELEASE GLOBAL SLOT
                        globalConcurrency.release('Translation');

                        // Pulizia stato in volo
                        if (inFlightTranslationRef.current[p] === ctrl) {
                            delete inFlightTranslationRef.current[p];
                        }

                        // Rimuoviamo la pagina dal set degli attivi
                        activePagesRef.current.delete(p);
                        delete activeTranslationParamsRef.current[p];

                        // CRITICAL FIX: Prioritize waking up waiting tasks (Pipelining Starvation Fix)
                        // If we don't wake them up, pumpQueue will fill the slot with a NEW task,
                        // starving the waiting task (e.g., Page 9 waiting for Page 8) and causing a stall.
                        if (slotRequestQueueRef.current.length > 0) {
                            const resolve = slotRequestQueueRef.current.shift();
                            if (resolve) {
                                log.info(`[QUEUE] Slot transferred to waiting task (Pipelining priority).`);
                                resolve();
                            }
                        }

                        // Eseguiamo la callback di completamento se presente
                        if (done) {
                            try { done(); } catch (err) {
                                log.error(`Error in completion callback for page ${p}`, err);
                            }
                        }

                        setQueueStats(prev => ({
                            ...prev,
                            queued: translationQueueRef.current.length,
                            active: activePagesRef.current.size
                        }));

                        if (!isAbortingRef.current) {
                            // Segnala che un posto si è liberato e riprova a pompare
                            // FIX: Use setTimeout(0) instead of Promise.resolve() to allow React state updates 
                            // (like setTranslationMap) to propagate before pumpQueue checks dependencies.
                            setTimeout(() => void pumpQueueRef.current?.(), 0);
                        }
                    }
                })(page, controller, extraInstruction, translationModelOverride, onComplete);
            }

            if (activePagesRef.current.size >= MAX_CONCURRENT_TRANSLATIONS && translationQueueRef.current.length > 0) {
                log.info(`[QUEUE] Limite concorrenza raggiunto (${activePagesRef.current.size}/${MAX_CONCURRENT_TRANSLATIONS}). ${translationQueueRef.current.length} pagine in attesa.`);
            }
        } finally {
            isPumpingQueueRef.current = false;
        }
    }, [MAX_CONCURRENT_TRANSLATIONS, checkDependency, isCircuitOpen, recordSuccess, recordFailure]);

    // Keep pumpQueueRef up to date
    useEffect(() => {
        pumpQueueRef.current = pumpQueue;
    }, [pumpQueue]);

    const enqueueTranslation = useCallback((page: number, options: { priority: 'front' | 'back', force?: boolean, extraInstruction?: string, translationModelOverride?: GeminiModel, onComplete?: () => void, isAutoRetry?: boolean } = { priority: 'back' }) => {
        if (!Number.isFinite(page)) return;

        // Reset cooldowns if the user is explicitly forcing a retry
        if (options.force && !options.isAutoRetry) {
            resetGeminiCooldowns();
        }

        if (options.extraInstruction) {
            extraInstructionsRef.current[page] = options.extraInstruction;
        }
        if (options.translationModelOverride) {
            translationModelOverridesRef.current[page] = options.translationModelOverride;
        }
        if (options.onComplete) {
            completionCallbacksRef.current[page] = options.onComplete;
        }

        if (options.force) {
            // Se è un auto-retry generato dal QualityCheck e la pagina è in volo (traduzione in corso),
            // ignoriamo la richiesta di force per non abortire la traduzione manuale corrente.
            if (options.isAutoRetry && (inFlightTranslationRef.current[page] || activePagesRef.current.has(page))) {
                log.warning(`[QUEUE] Auto-Retry ignorato per pagina ${page}: una traduzione (manuale/precedente) è già attiva in volo.`);
                return;
            }

            // LOOP FIX: Check if parameters are identical to avoid redundant force enqueue
            const isQueued = queuedPagesRef.current.has(page);
            const isActive = activePagesRef.current.has(page);
            const newExtra = options.extraInstruction;
            const newModel = options.translationModelOverride;

            let isRedundant = false;

            if (isQueued) {
                // For queued pages, check stored refs
                const currentExtra = extraInstructionsRef.current[page];
                const currentModel = translationModelOverridesRef.current[page];
                // Treat undefined/null as equivalent
                const extraMatch = (currentExtra || '') === (newExtra || '');
                const modelMatch = currentModel === newModel;

                if (extraMatch && modelMatch) {
                    isRedundant = true;
                }
            } else if (isActive) {
                // For active pages, check activeTranslationParamsRef
                const currentParams = activeTranslationParamsRef.current[page];
                if (currentParams) {
                    const extraMatch = (currentParams.extraInstruction || '') === (newExtra || '');
                    const modelMatch = currentParams.translationModelOverride === newModel;
                    if (extraMatch && modelMatch) {
                        isRedundant = true;
                    }
                }
            }

            if (isRedundant) {
                log.info(`[QUEUE] Enqueue forzato per pagina ${page} IGNORATO: parametri identici e pagina già in coda/esecuzione.`);
                return;
            }

            // Se forziamo, aggiungiamo la pagina al set dei "forced" per ignorare la pausa
            forcedPagesRef.current.add(page);
            if (isPausedRef.current) {
                log.info(`[QUEUE] Enqueue forzato per pagina ${page}: aggiunto in cima (in attesa di ripresa dalla pausa).`);
            } else {
                log.info(`[QUEUE] Enqueue forzato per pagina ${page}: priorità massima acquisita.`);
            }

            const inFlight = inFlightTranslationRef.current[page];
            if (inFlight) {
                log.info(`[QUEUE] Pagina ${page} già in volo: abort precedente per retry forzato.`);
                try { inFlight.abort(); } catch { }
            }

            // Reset circuit breaker on manual force retry
            const breaker = getBreaker();
            delete breaker.failures[page];
            delete breaker.lastFailureTime[page];
            delete breaker.isOpen[page];
            delete breaker.consecutiveFailures[page];
        }

        if (queuedPagesRef.current.has(page) && !options.force) return;
        if (inFlightTranslationRef.current[page] && !options.force) return;

        if (queuedPagesRef.current.has(page)) {
            // Move to front if high priority
            if (options.priority === 'front') {
                const idx = translationQueueRef.current.indexOf(page);
                if (idx > -1) {
                    translationQueueRef.current.splice(idx, 1);
                    translationQueueRef.current.unshift(page);
                    log.info(`[QUEUE] Pagina ${page} spostata in cima alla coda.`);
                    void pumpQueue();
                }
            }
            return;
        }

        queuedPagesRef.current.add(page);
        if (options.priority === 'front') {
            translationQueueRef.current.unshift(page);
            log.info(`[QUEUE] Pagina ${page} aggiunta in cima alla coda.`);
        } else {
            translationQueueRef.current.push(page);
            log.info(`[QUEUE] Pagina ${page} aggiunta in fondo alla coda.`);
        }
        setQueueStats(prev => ({
            ...prev,
            queued: translationQueueRef.current.length,
            active: activePagesRef.current.size
        }));
        void pumpQueue();
    }, [pumpQueue]);

    const enqueueMultipleTranslations = useCallback((pages: number[], options: { priority: 'front' | 'back', force?: boolean, extraInstruction?: string, translationModelOverride?: GeminiModel, onComplete?: () => void } = { priority: 'back' }) => {
        if (!pages || pages.length === 0) return;

        let hasNew = false;
        pages.forEach(page => {
            if (!Number.isFinite(page)) return;

            if (options.extraInstruction) {
                extraInstructionsRef.current[page] = options.extraInstruction;
            }
            if (options.translationModelOverride) {
                translationModelOverridesRef.current[page] = options.translationModelOverride;
            }
            if (options.onComplete) {
                completionCallbacksRef.current[page] = options.onComplete;
            }

            if (options.force) {
                forcedPagesRef.current.add(page);
                const inFlight = inFlightTranslationRef.current[page];
                if (inFlight) {
                    try { inFlight.abort(); } catch { }
                }
                // Reset circuit breaker for this page so it won't be skipped
                const breaker = getBreaker();
                delete breaker.failures[page];
                delete breaker.lastFailureTime[page];
                delete breaker.isOpen[page];
                delete breaker.consecutiveFailures[page];
            }

            if (queuedPagesRef.current.has(page) && !options.force) return;
            if (inFlightTranslationRef.current[page] && !options.force) return;

            if (queuedPagesRef.current.has(page)) {
                // Already queued, just handle priority move if needed
                if (options.priority === 'front') {
                    const idx = translationQueueRef.current.indexOf(page);
                    if (idx > -1) {
                        translationQueueRef.current.splice(idx, 1);
                        translationQueueRef.current.unshift(page);
                    }
                }
                return;
            }

            queuedPagesRef.current.add(page);
            if (options.priority === 'front') {
                translationQueueRef.current.unshift(page);
            } else {
                translationQueueRef.current.push(page);
            }
            hasNew = true;
        });

        if (hasNew) {
            log.info(`[QUEUE] Enqueued ${pages.length} pages (Batch). New size: ${translationQueueRef.current.length}`);
            setQueueStats(prev => ({
                ...prev,
                queued: translationQueueRef.current.length,
                active: activePagesRef.current.size
            }));
            void pumpQueue();
        }
    }, [pumpQueue]);

    const resetQueue = useCallback(() => {
        translationQueueRef.current = [];
        queuedPagesRef.current.clear();
        extraInstructionsRef.current = {};
        translationModelOverridesRef.current = {};
        completionCallbacksRef.current = {};
        setQueueStats({ queued: 0, active: 0 });

        // Reset circuit breaker for CURRENT project only
        const breaker = getBreaker();
        // We modify the existing object in place to keep references valid if needed, 
        // or we could replace it in the registry. 
        // Since getBreaker returns the reference from registry, modifying it works.
        breaker.failures = {};
        breaker.lastFailureTime = {};
        breaker.isOpen = {};
        breaker.consecutiveFailures = {};

        // Reset queue health
        queueHealthRef.current = {
            translationStartTimes: {},
            stuckTranslations: {},
            lastHealthCheck: Date.now()
        };

        log.info('[QUEUE] Queue and Circuit Breaker reset.');
    }, [getBreaker]);

    const clearQueue = useCallback(() => {
        translationQueueRef.current = [];
        queuedPagesRef.current.clear();
        extraInstructionsRef.current = {};
        translationModelOverridesRef.current = {};
        completionCallbacksRef.current = {};
        setQueueStats(prev => ({ ...prev, queued: 0 }));
    }, []);

    const abortAll = useCallback((clear = true) => {
        isAbortingRef.current = true;
        try {
            Object.values(inFlightTranslationRef.current).forEach((ctrl: any) => ctrl.abort());
            inFlightTranslationRef.current = {};

            if (clear) {
                activePagesRef.current.clear();
                forcedPagesRef.current.clear();
                clearQueue();
                setQueueStats({ queued: 0, active: 0 });
            } else {
                // Se non puliamo, rimettiamo le pagine attive in cima alla coda per il resume
                const activeList = Array.from(activePagesRef.current);
                activePagesRef.current.clear();
                forcedPagesRef.current.clear(); // Reset forced flag on stop/pause

                if (activeList.length > 0) {
                    // Restore last known params for pages that were in-flight so they can be resumed.
                    for (const p of activeList) {
                        const params = activeTranslationParamsRef.current[p];
                        if (params?.extraInstruction) {
                            extraInstructionsRef.current[p] = params.extraInstruction;
                        }
                        if (params?.translationModelOverride) {
                            translationModelOverridesRef.current[p] = params.translationModelOverride;
                        }
                        if (params?.onComplete) {
                            completionCallbacksRef.current[p] = params.onComplete;
                        }
                    }

                    const newToQueue = activeList.filter(p => !queuedPagesRef.current.has(p));
                    newToQueue.forEach(p => queuedPagesRef.current.add(p));
                    translationQueueRef.current.unshift(...newToQueue);
                    log.info(`[QUEUE] Re-queued ${newToQueue.length} aborted pages due to Stop.`);
                }

                setQueueStats(prev => ({
                    queued: translationQueueRef.current.length,
                    active: 0
                }));
            }
        } finally {
            // Reset isAborting dopo un breve delay per permettere alle async task di terminare
            setTimeout(() => {
                isAbortingRef.current = false;
                void pumpQueue(); // Resume processing items enqueued during the abort window
            }, 100);
        }
    }, [clearQueue, pumpQueue]);

    const setExtraInstruction = useCallback((page: number, extraInstruction: string | undefined) => {
        if (!Number.isFinite(page)) return;
        if (!extraInstruction) {
            delete extraInstructionsRef.current[page];
            return;
        }
        extraInstructionsRef.current[page] = extraInstruction;
    }, []);

    const stopTranslation = useCallback((page: number) => {
        const ctrl = inFlightTranslationRef.current[page];
        if (ctrl) {
            ctrl.abort();
            // Non cancelliamo qui inFlightTranslationRef.current[page] o activeTranslationsRef.current
            // perché il finally del wrapper asincrono in pumpQueue se ne occuperà
            // garantendo la coerenza del contatore.
        }

        // Rimuoviamo dalla coda se presente
        if (queuedPagesRef.current.has(page)) {
            queuedPagesRef.current.delete(page);
            translationQueueRef.current = translationQueueRef.current.filter(p => p !== page);
            setQueueStats(prev => ({ ...prev, queued: translationQueueRef.current.length }));
        }
    }, []);

    const getCircuitBreakerState = useCallback(() => {
        const breaker = getBreaker();
        return {
            failures: { ...breaker.failures },
            consecutiveFailures: { ...breaker.consecutiveFailures },
            isOpen: { ...breaker.isOpen },
            lastFailureTime: { ...breaker.lastFailureTime }
        };
    }, [getBreaker]);

    return {
        enqueueTranslation,
        enqueueMultipleTranslations,
        queueStats,
        setQueueStats,
        inFlightTranslationRef,
        translationQueueRef,
        queuedPagesRef,
        activePagesRef,
        isPausedRef,
        clearQueue,
        resetQueue,
        abortAll,
        setExtraInstruction,
        stopTranslation,
        getCircuitBreakerState
    };
};
