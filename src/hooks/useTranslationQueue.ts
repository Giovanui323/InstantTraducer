
import { useCallback, useEffect, useRef, useState } from 'react';
import { log } from '../services/logger';

interface UseTranslationQueueProps {
    processPage: (page: number, signal?: AbortSignal, extraInstruction?: string) => Promise<void>;
    MAX_CONCURRENT_TRANSLATIONS: number;
    checkDependency?: (page: number, queue: number[], inFlight: Record<number, any>, queued: Set<number>) => boolean;
    externalInFlightRef?: React.MutableRefObject<Record<number, AbortController>>;
    isPaused?: boolean;
}

export const useTranslationQueue = ({
    processPage,
    MAX_CONCURRENT_TRANSLATIONS,
    checkDependency,
    externalInFlightRef,
    isPaused = false
}: UseTranslationQueueProps) => {

    const translationQueueRef = useRef<number[]>([]);
    const extraInstructionsRef = useRef<Record<number, string>>({});
    const queuedPagesRef = useRef<Set<number>>(new Set());
    const activeTranslationsRef = useRef<number>(0);
    const internalInFlightRef = useRef<Record<number, AbortController>>({});
    const inFlightTranslationRef = externalInFlightRef || internalInFlightRef;
    const isPumpingQueueRef = useRef<boolean>(false);
    const [queueStats, setQueueStats] = useState({ queued: 0, active: 0 });
    const isPausedRef = useRef(isPaused);

    useEffect(() => {
        const wasPaused = isPausedRef.current;
        isPausedRef.current = isPaused;
        if (wasPaused && !isPaused) {
            // Se eravamo in pausa e ora non lo siamo più, facciamo ripartire la coda
            void pumpQueue();
        }
    }, [isPaused]);

    const pumpQueue = useCallback(async () => {
        if (isPausedRef.current || isPumpingQueueRef.current) return;

        isPumpingQueueRef.current = true;
        try {
            while (
                translationQueueRef.current.length > 0 &&
                activeTranslationsRef.current < MAX_CONCURRENT_TRANSLATIONS &&
                !isPausedRef.current
            ) {
                // Trova la prima pagina che non ha dipendenze bloccanti
                const pageIndex = checkDependency 
                    ? translationQueueRef.current.findIndex(p => checkDependency(p, translationQueueRef.current, inFlightTranslationRef.current, queuedPagesRef.current))
                    : 0;

                if (pageIndex === -1) break; // Tutte le pagine in coda sono bloccate da dipendenze

                const page = translationQueueRef.current.splice(pageIndex, 1)[0];
                if (page === undefined) break;

                queuedPagesRef.current.delete(page);
                const extraInstruction = extraInstructionsRef.current[page];
                delete extraInstructionsRef.current[page];

                const controller = new AbortController();
                inFlightTranslationRef.current[page] = controller;
                activeTranslationsRef.current++;

                setQueueStats({ queued: translationQueueRef.current.length, active: activeTranslationsRef.current });

                // Avvio asincrono del processo
                void (async (p: number, ctrl: AbortController, extra?: string) => {
                    try {
                        await processPage(p, ctrl.signal, extra);
                    } catch (e) {
                        console.error(`Queue process error for page ${p}`, e);
                    } finally {
                        // Pulizia stato in volo
                        if (inFlightTranslationRef.current[p] === ctrl) {
                            delete inFlightTranslationRef.current[p];
                        }
                        
                        // Decrementiamo SEMPRE il contatore degli attivi se questo task era considerato attivo
                        // Indipendentemente dal fatto che sia stato rimosso o meno da inFlightTranslationRef esternamente
                        activeTranslationsRef.current = Math.max(0, activeTranslationsRef.current - 1);
                        
                        setQueueStats({ 
                            queued: translationQueueRef.current.length, 
                            active: activeTranslationsRef.current 
                        });
                        
                        // Segnala che un posto si è liberato e riprova a pompare
                        // Usiamo setTimeout per evitare ricorsione eccessiva
                        setTimeout(() => {
                            void pumpQueue();
                        }, 0);
                    }
                })(page, controller);
            }
        } finally {
            isPumpingQueueRef.current = false;
        }
    }, [processPage, MAX_CONCURRENT_TRANSLATIONS, checkDependency]);

    const enqueueTranslation = useCallback((page: number, options: { priority: 'front' | 'back', force?: boolean, extraInstruction?: string } = { priority: 'back' }) => {
        if (!Number.isFinite(page)) return;
        
        if (options.extraInstruction) {
            extraInstructionsRef.current[page] = options.extraInstruction;
        }

        // If force is true, we might re-queue even if already queued?
        // For now, if already queued, ignore unless force?
        if (queuedPagesRef.current.has(page) && !options.force) return;

        // If active, ignore?
        if (inFlightTranslationRef.current[page] && !options.force) return;

        if (options.force) {
            const inFlight = inFlightTranslationRef.current[page];
            if (inFlight) {
                try { inFlight.abort(); } catch { }
                // Non cancelliamo qui inFlightTranslationRef.current[page] o activeTranslationsRef.current
                // perché il finally del wrapper asincrono in pumpQueue se ne occuperà.
            }
        }

        if (queuedPagesRef.current.has(page)) {
            // Move to front if high priority
            if (options.priority === 'front') {
                const idx = translationQueueRef.current.indexOf(page);
                if (idx > -1) {
                    translationQueueRef.current.splice(idx, 1);
                    translationQueueRef.current.unshift(page);
                    void pumpQueue();
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
        setQueueStats({ queued: translationQueueRef.current.length, active: activeTranslationsRef.current });
        void pumpQueue();
    }, [pumpQueue]);

    const clearQueue = useCallback(() => {
        translationQueueRef.current = [];
        queuedPagesRef.current.clear();
        setQueueStats(prev => ({ ...prev, queued: 0 }));
    }, []);

    const abortAll = useCallback(() => {
        Object.values(inFlightTranslationRef.current).forEach((ctrl: any) => ctrl.abort());
        inFlightTranslationRef.current = {};
        activeTranslationsRef.current = 0;
        clearQueue();
        setQueueStats({ queued: 0, active: 0 });
    }, [clearQueue]);

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

    return {
        enqueueTranslation,
        queueStats,
        setQueueStats,
        inFlightTranslationRef,
        translationQueueRef,
        queuedPagesRef,
        activeTranslationsRef,
        isPausedRef,
        clearQueue,
        abortAll,
        stopTranslation
    };
};
