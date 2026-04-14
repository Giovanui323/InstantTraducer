import { useCallback, useRef, useState } from 'react';
import { log } from '../services/logger';
// import { globalConcurrency } from '../services/concurrencyManager'; // DISACCOPPIAMENTO: Rimosso uso concorrenza globale

const SAFETY_TIMEOUT_MS = 95000; // 95 secondi timeout di sicurezza
const HEARTBEAT_INTERVAL_MS = 15000; // 15 secondi heartbeat

interface UseVerificationQueueProps {
    processVerification: (page: number, signal?: AbortSignal, options?: any) => Promise<any>;
    MAX_CONCURRENT_VERIFICATIONS: number;
}

export const useVerificationQueue = ({
    processVerification,
    MAX_CONCURRENT_VERIFICATIONS
}: UseVerificationQueueProps) => {

    const verificationQueueRef = useRef<number[]>([]);
    const optionsRef = useRef<Record<number, any>>({});
    const queuedPagesRef = useRef<Set<number>>(new Set());
    const activePagesRef = useRef<Set<number>>(new Set());
    const inFlightVerificationRef = useRef<Record<number, AbortController>>({});
    const lastRequestTimeRef = useRef<Record<number, number>>({});
    const pendingResolversRef = useRef<Record<number, { resolve: (val: any) => void, reject: (err: any) => void }[]>>({});
    const isPumpingQueueRef = useRef<boolean>(false);
    const isAbortingRef = useRef<boolean>(false);
    const [queueStats, setQueueStats] = useState({ queued: 0, active: 0 });

    const pumpQueue = useCallback(async () => {
        if (isPumpingQueueRef.current || isAbortingRef.current) return;

        isPumpingQueueRef.current = true;
        try {
            while (
                verificationQueueRef.current.length > 0 &&
                activePagesRef.current.size < MAX_CONCURRENT_VERIFICATIONS &&
                !isAbortingRef.current
            ) {
                const page = verificationQueueRef.current.shift();
                if (page === undefined) break;

                queuedPagesRef.current.delete(page);
                const options = optionsRef.current[page];
                delete optionsRef.current[page];

                const controller = new AbortController();

                // CRITICAL: Wrap setup in try/catch to prevent slot leaks on sync errors
                try {
                    inFlightVerificationRef.current[page] = controller;
                    activePagesRef.current.add(page);

                    setQueueStats(prev => ({
                        ...prev,
                        queued: verificationQueueRef.current.length,
                        active: activePagesRef.current.size
                    }));

                    log.info(`[VERIF-QUEUE] [${options?.trigger || 'auto'}] Avvio verifica per pagina ${page} (attive: ${activePagesRef.current.size}/${MAX_CONCURRENT_VERIFICATIONS})`);

                    // Avvio asincrono del processo
                    void (async (p: number, ctrl: AbortController, opts?: any) => {
                        let result: any;
                        let heartbeatId: any = null;
                        const startTime = Date.now();

                        try {
                            // DISACCOPPIAMENTO: Non acquisiamo più globalConcurrency per evitare blocchi sulla traduzione

                            // Heartbeat Logger
                            heartbeatId = setInterval(() => {
                                const elapsed = Math.round((Date.now() - startTime) / 1000);
                                log.info(`[VERIF-QUEUE] In attesa verifica pagina ${p} da ${elapsed}s...`);
                            }, HEARTBEAT_INTERVAL_MS);

                            // Safety Timeout Race
                            const timeoutPromise = new Promise<never>((_, reject) => {
                                setTimeout(() => {
                                    reject(new Error(`VERIFICATION_TIMEOUT_SAFETY: Timeout sicurezza (${SAFETY_TIMEOUT_MS}ms) superato per pagina ${p}`));
                                }, SAFETY_TIMEOUT_MS);
                            });

                            // Race between process and timeout
                            result = await Promise.race([
                                processVerification(p, ctrl.signal, opts),
                                timeoutPromise
                            ]);

                            if (result?.state === 'failed') {
                                log.error(`[VERIF-QUEUE] Verifica pagina ${p} completata con ERRORI o FALLITA (${Math.round((Date.now() - startTime) / 1000)}s): ${result.summary}`);
                            } else {
                                log.info(`[VERIF-QUEUE] Verifica pagina ${p} completata con successo (${Math.round((Date.now() - startTime) / 1000)}s).`);
                            }

                        } catch (e: any) {
                            const elapsed = Math.round((Date.now() - startTime) / 1000);

                            // Se è un errore di abort, non logghiamo come errore critico
                            if (e?.name === 'AbortError' || e?.code === 'ABORTED' || ctrl.signal.aborted) {
                                log.info(`[VERIF-QUEUE] Verifica pagina ${p} annullata dopo ${elapsed}s.`);
                            } else if (e?.message?.includes('VERIFICATION_TIMEOUT_SAFETY')) {
                                log.error(`[VERIF-QUEUE] CRITICAL: ${e.message}. Forzo abort della fetch HTTP persistente.`);
                                try { ctrl.abort(); } catch { } // CRITICAL: Stop the STALLED fetch request
                            } else {
                                log.error(`Verification queue process error for page ${p} (${elapsed}s)`, e);
                            }
                        } finally {
                            if (heartbeatId) clearInterval(heartbeatId);

                            // RELEASE SLOT (Local)
                            if (inFlightVerificationRef.current[p] === ctrl) {
                                delete inFlightVerificationRef.current[p];
                            }

                            const wasActive = activePagesRef.current.has(p);
                            if (wasActive) {
                                activePagesRef.current.delete(p);
                                log.info(`[VERIF-QUEUE] Slot rilasciato per pagina ${p}. (Attive: ${activePagesRef.current.size})`);
                            }

                            // Resolve waiting promises (even if failed/timeout, we resolve to let UI unblock if waiting)
                            const resolvers = pendingResolversRef.current[p];
                            if (resolvers) {
                                resolvers.forEach(r => r.resolve(result));
                                delete pendingResolversRef.current[p];
                            }

                            setQueueStats(prev => ({
                                ...prev,
                                queued: verificationQueueRef.current.length,
                                active: activePagesRef.current.size
                            }));

                            if (!isAbortingRef.current) {
                                // Usiamo microtask invece di setTimeout(0)
                                Promise.resolve().then(() => void pumpQueue());
                            }
                        }
                    })(page, controller, options);
                } catch (setupError) {
                    // Emergency cleanup if synchronous setup fails
                    log.error(`[VERIF-QUEUE] Errore sincrono avvio pagina ${page}`, setupError);
                    activePagesRef.current.delete(page);
                    delete inFlightVerificationRef.current[page];
                    setQueueStats(prev => ({
                        ...prev,
                        active: activePagesRef.current.size
                    }));
                }
            }
        } finally {
            isPumpingQueueRef.current = false;
        }
    }, [processVerification, MAX_CONCURRENT_VERIFICATIONS]);

    const enqueueVerification = useCallback((page: number, options: { priority: 'front' | 'back', force?: boolean, trigger?: string, translatedText?: string, bypassConcurrency?: boolean, imageBase64?: string, prevPageImageBase64?: string, nextPageImageBase64?: string } = { priority: 'back' }) => {
        if (!Number.isFinite(page)) return Promise.resolve();

        return new Promise<any>((resolve, reject) => {
            const now = Date.now();
            const lastRequest = lastRequestTimeRef.current[page] || 0;
            const COOLDOWN_MS = 100;

            if (now - lastRequest < COOLDOWN_MS) {
                log.info(`[VERIF-QUEUE] [${options.trigger || 'auto'}] Richiesta troppo rapida per pagina ${page}, ignoro (cooldown ${COOLDOWN_MS}ms).`);
                resolve(undefined);
                return;
            }

            lastRequestTimeRef.current[page] = now;

            // Cleanup periodico delle richieste vecchie (opzionale, per evitare accumulo nel tempo)
            if (Object.keys(lastRequestTimeRef.current).length > 500) {
                const fiveMinutesAgo = now - 5 * 60 * 1000;
                for (const p in lastRequestTimeRef.current) {
                    if (lastRequestTimeRef.current[p] < fiveMinutesAgo) {
                        delete lastRequestTimeRef.current[p];
                    }
                }
            }

            if (options.force) {
                const inFlight = inFlightVerificationRef.current[page];
                if (inFlight) {
                    log.info(`[VERIF-QUEUE] Pagina ${page} già in volo: abort precedente per retry forzato.`);
                    try { inFlight.abort(); } catch { }
                }
            }

            // Aggiungiamo il resolver alla lista
            if (!pendingResolversRef.current[page]) {
                pendingResolversRef.current[page] = [];
            }
            pendingResolversRef.current[page].push({ resolve, reject });

            if (queuedPagesRef.current.has(page) && !options.force) return;
            if (inFlightVerificationRef.current[page] && !options.force) return;

            if (queuedPagesRef.current.has(page)) {
                if (options.priority === 'front') {
                    const idx = verificationQueueRef.current.indexOf(page);
                    if (idx > -1) {
                        verificationQueueRef.current.splice(idx, 1);
                        verificationQueueRef.current.unshift(page);
                    }
                }
                return;
            }

            optionsRef.current[page] = options;
            queuedPagesRef.current.add(page);
            if (options.priority === 'front') {
                verificationQueueRef.current.unshift(page);
            } else {
                verificationQueueRef.current.push(page);
            }
            setQueueStats(prev => ({
                ...prev,
                queued: verificationQueueRef.current.length,
                active: activePagesRef.current.size
            }));
            void pumpQueue();
        });
    }, [pumpQueue]);

    const abortAll = useCallback(() => {
        isAbortingRef.current = true;
        try {
            Object.values(inFlightVerificationRef.current).forEach(ctrl => ctrl.abort());
            inFlightVerificationRef.current = {};
            verificationQueueRef.current = [];
            queuedPagesRef.current.clear();
            activePagesRef.current.clear();
            setQueueStats({ queued: 0, active: 0 });
        } finally {
            // Reset isAborting dopo un breve delay per permettere alle async task di terminare
            setTimeout(() => {
                isAbortingRef.current = false;
            }, 100);
        }
    }, []);

    return {
        enqueueVerification,
        queueStats,
        abortAll,
        inFlightVerificationRef,
        getQueue: () => [...verificationQueueRef.current],
        activePagesRef
    };
};
