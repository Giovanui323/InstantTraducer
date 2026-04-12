import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AISettings, GeminiModel, PDFMetadata, PageAnnotation, PageStatus, PageVerification } from '../types';
import { log } from '../services/logger';
import { DEFAULT_CONCURRENT_TRANSLATIONS, MAX_ALLOWED_CONCURRENCY } from '../constants';
import { executePageTranslation, TranslationExecutionContext, TranslationExecutionServices, TranslationExecutionStateSetters } from '../services/translation/TranslationExecutor';
import { ConcurrencyControl, useTranslationQueue } from './useTranslationQueue';

interface UseAppTranslationProps {
  pdfDoc: any;
  metadata: PDFMetadata | null;
  aiSettings: AISettings;
  docInputLanguage: string;
  updateLibrary: (fileId: string, data: any, priority?: 'CRITICAL' | 'BACKGROUND' | 'BATCH') => Promise<string>;
  appendPageConsole: (page: number, msg: string, data?: any) => void;
  verifyAndMaybeFixTranslation: (args: any) => Promise<void>;
  setAnnotationMap: React.Dispatch<React.SetStateAction<Record<number, PageAnnotation[]>>>;
  originalImagesRef: React.MutableRefObject<Record<number, string>>;
  pageRotationsRef: React.MutableRefObject<Record<number, number>>;
  pageReplacementsRef: React.MutableRefObject<Record<number, any>>;
  pageImagesIndexRef: React.MutableRefObject<any>;
  pageTraceRef: React.MutableRefObject<Record<number, { t0: number; seq: number; traceId: string }>>;
  geminiLogs: Record<number, string>;
  setGeminiLogs: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  setOriginalImages: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  setPageDims: React.Dispatch<React.SetStateAction<Record<number, { width: number; height: number }>>>;
  readProjectImageBase64: (args: any) => Promise<string>;
  readProjectImageDataUrl: (args: any) => Promise<string>;
  saveSourceForPage: (args: any) => Promise<void>;
  getContextImageBase64: (page: number, section: 'top' | 'bottom' | 'full') => Promise<string | undefined>;
  loadReplacementPdfDoc: (filePath: string) => Promise<any>;
  renderDocPageToJpeg: (doc: any, page: number, opts: any) => Promise<any>;
  sessionId: string;
  verboseLogs: boolean;
  isPaused: boolean;
  isConsultationMode: boolean;
  currentProjectFileId: string | null;
  verificationMapRef: React.MutableRefObject<Record<number, PageVerification>>;
}

export const useAppTranslation = ({
  pdfDoc,
  metadata,
  aiSettings,
  docInputLanguage,
  updateLibrary,
  appendPageConsole,
  verifyAndMaybeFixTranslation,
  setAnnotationMap,
  originalImagesRef,
  pageRotationsRef,
  pageReplacementsRef,
  pageImagesIndexRef,
  pageTraceRef,
  geminiLogs,
  setGeminiLogs,
  setOriginalImages,
  setPageDims,
  readProjectImageBase64,
  readProjectImageDataUrl,
  saveSourceForPage,
  getContextImageBase64,
  loadReplacementPdfDoc,
  renderDocPageToJpeg,
  sessionId,
  verboseLogs,
  isPaused,
  isConsultationMode,
  currentProjectFileId,
  verificationMapRef
}: UseAppTranslationProps) => {
  const [translationMap, _setTranslationMap] = useState<Record<number, string>>({});
  const [translationsMeta, setTranslationsMeta] = useState<Record<number, { model: string; savedAt: number }>>({});
  const [pageStatus, setPageStatus] = useState<Record<number, PageStatus>>({});
  const [partialTranslations, setPartialTranslations] = useState<Record<number, string>>({});

  const translationMapRef = useRef<Record<number, string>>(translationMap);
  const pageStatusRef = useRef<Record<number, PageStatus>>(pageStatus);
  const partialTranslationsRef = useRef<Record<number, string>>(partialTranslations);
  const inFlightTranslationRef = useRef<Record<number, AbortController>>({});

  useEffect(() => {
    partialTranslationsRef.current = partialTranslations;
  }, [partialTranslations]);

  const setTranslationMap = useCallback((updater: React.SetStateAction<Record<number, string>>) => {
    _setTranslationMap(prev => {
      const next = (typeof updater === 'function')
        ? (updater as (p: Record<number, string>) => Record<number, string>)(prev)
        : updater;
      translationMapRef.current = next;
      return next;
    });
  }, []);

  // Helper per aggiornare lo stato di una pagina in modo atomico
  const updatePageStatus = useCallback((page: number, delta: PageStatus | null) => {
    setPageStatus(prev => {
      let next;
      if (delta === null) {
        if (!prev[page]) return prev;
        next = { ...prev };
        delete next[page];
      } else {
        next = {
          ...prev,
          [page]: { ...prev[page], ...delta }
        };
      }
      pageStatusRef.current = next;
      return next;
    });
  }, []);

  // Use refs for stable props to minimize processPage re-creations
  const propsRef = useRef({
    appendPageConsole,
    verifyAndMaybeFixTranslation,
    updateLibrary,
    saveSourceForPage,
    readProjectImageBase64,
    readProjectImageDataUrl,
    loadReplacementPdfDoc,
    renderDocPageToJpeg,
    getContextImageBase64,
    verboseLogs,
    verificationMapRef
  });

  useEffect(() => {
    propsRef.current = {
      appendPageConsole,
      verifyAndMaybeFixTranslation,
      updateLibrary,
      saveSourceForPage,
      readProjectImageBase64,
      readProjectImageDataUrl,
      loadReplacementPdfDoc,
      renderDocPageToJpeg,
      getContextImageBase64,
      verboseLogs,
      verificationMapRef
    };
  }, [
    appendPageConsole,
    verifyAndMaybeFixTranslation,
    updateLibrary,
    saveSourceForPage,
    readProjectImageBase64,
    readProjectImageDataUrl,
    loadReplacementPdfDoc,
    renderDocPageToJpeg,
    getContextImageBase64,
    verboseLogs,
    verificationMapRef
  ]);

  useEffect(() => { translationMapRef.current = translationMap; }, [translationMap]);

  const shouldSkipTranslation = useCallback((page: number) => {
    const s = translationMapRef.current[page];
    if (typeof s === 'string' && s.trim().length > 0) return true;
    
    // Check if currently in progress (loading/processing) to prevent redundant queueing
    const status = pageStatusRef.current[page];
    if (status?.loading || status?.processing) return true;
    
    return false;
  }, [translationMapRef, pageStatusRef]);

  const processPage = useCallback(async (targetPage: number, signal?: AbortSignal, extraInstruction?: string, translationModelOverride?: GeminiModel, concurrencyControl?: ConcurrencyControl) => {
    // REDUNDANCY GUARD: Prevent processing if already translated (unless forced via extraInstruction)
    // This acts as a second layer of defense against race conditions in the queue
    if (translationMapRef.current[targetPage] && (!extraInstruction || extraInstruction.trim().length === 0)) {
        log.info(`[PROCESS] Skipping page ${targetPage} - Already translated (Guard Layer).`);
        return;
    }

    const services: TranslationExecutionServices = {
      updateLibrary: propsRef.current.updateLibrary,
      appendPageConsole: propsRef.current.appendPageConsole,
      verifyAndMaybeFixTranslation: propsRef.current.verifyAndMaybeFixTranslation,
      saveSourceForPage: propsRef.current.saveSourceForPage,
      readProjectImageBase64: propsRef.current.readProjectImageBase64,
      readProjectImageDataUrl: propsRef.current.readProjectImageDataUrl,
      getContextImageBase64: propsRef.current.getContextImageBase64,
      loadReplacementPdfDoc: propsRef.current.loadReplacementPdfDoc,
      renderDocPageToJpeg: propsRef.current.renderDocPageToJpeg,
      getLatestTranslationMap: () => translationMapRef.current
    };

    const context: TranslationExecutionContext = {
      pdfDoc,
      metadata,
      currentProjectFileId,
      aiSettings,
      docInputLanguage,
      sessionId,
      verboseLogs: propsRef.current.verboseLogs,
      isConsultationMode,
      pageReplacements: pageReplacementsRef.current,
      pageRotations: pageRotationsRef.current,
      pageImagesIndex: pageImagesIndexRef.current,
      translationMap: translationMapRef.current,
      verificationMap: propsRef.current.verificationMapRef.current
    };

    const setters: TranslationExecutionStateSetters = {
      updatePageStatus,
      setTranslationMap,
      setTranslationsMeta,
      setAnnotationMap,
      setPartialTranslations,
      setOriginalImages,
      setPageDims
    };

    await executePageTranslation(
      targetPage,
      services,
      context,
      setters,
      signal,
      extraInstruction,
      translationModelOverride,
      inFlightTranslationRef,
      concurrencyControl
    );
  }, [
    pdfDoc, metadata, currentProjectFileId, aiSettings, docInputLanguage, sessionId, isConsultationMode,
    pageReplacementsRef, pageRotationsRef, pageImagesIndexRef, translationMapRef,
    updatePageStatus, setTranslationMap, setTranslationsMeta, setAnnotationMap, setPartialTranslations, setOriginalImages, setPageDims
  ]);

  const {
    enqueueTranslation,
    enqueueMultipleTranslations,
    queueStats,
    setQueueStats,
    abortAll,
    setExtraInstruction,
    resetQueue,
    stopTranslation: stopQueueTranslation,
    translationQueueRef,
    activePagesRef
  } = useTranslationQueue({
    processPage,
    MAX_CONCURRENT_TRANSLATIONS: Math.max(1, Math.min(MAX_ALLOWED_CONCURRENCY, Number(aiSettings.translationConcurrency) || DEFAULT_CONCURRENT_TRANSLATIONS)),
    externalInFlightRef: inFlightTranslationRef,
    isPaused,
    projectId: currentProjectFileId,
    checkDependency: (page, queue, inFlight, queued, isForced, active) => {
      // Se è la prima pagina, non ci sono dipendenze
      if (page <= 1) return true;

      // Se è forzato (Avvia subito), ignoriamo le dipendenze
      if (isForced) return true;

      // Se l'utente ha disabilitato la continuità sequenziale,
      // ignoriamo le dipendenze della pagina precedente per sbloccare la velocità.
      const sequentialContext = aiSettings.sequentialContext ?? true;
      
      // FIX: Se sequentialContext è true, DOBBIAMO rispettare la dipendenza,
      // indipendentemente dalla concorrenza impostata.
      if (!sequentialContext) {
          return true;
      }

      const prevPage = page - 1;
      // Se la pagina precedente è già tradotta nel map persistente, ok
      if (translationMapRef.current[prevPage]) return true;
      
      // Se la pagina precedente è in lavorazione, ASPETTIAMO.
      // Rimuoviamo l'ottimizzazione "Pipelining" che causava occupazione indebita di slot attivi.
      // La pagina deve restare in coda (WAITING) finché la dipendenza non è completata.
      if (inFlight[prevPage]) {
          return false;
      }

      // Se la pagina precedente è in coda, aspettiamo per mantenere l'ordine sequenziale e il contesto
      // TUTTAVIA: se la pagina attuale è FORCED, e la precedente è in coda ma NON è forced ed è PAUSA, 
      // potremmo voler procedere comunque o forzare anche la precedente.
      // Per ora, se è forced, permettiamo di saltare la dipendenza se la precedente è bloccata da pausa.
      if (queued.has(prevPage)) {
        // FIX: Check if the page is REALLY in the queue.
        // queued (Set) might be out of sync with queue (Array) in rare race conditions (Zombie Page).
        // If it's in the Set but not in the Array, it's a "Zombie" (already processed but not cleared).
        if (queue.includes(prevPage)) {
             return false;
        }
        // If we are here, prevPage is in 'queued' Set but NOT in 'queue' Array.
        // Treat it as DONE (Zombie) and allow pipelining.
        log.warn(`[QUEUE] Zombie dependency detected: Page ${prevPage} is in queued Set but not in Queue Array. Ignoring dependency.`);
      }
      // Se non è né tradotta, né in volo, né in coda, procediamo (caso di traduzione singola sparsa)
      return true;
    }
  });

  const retranslatePage = useCallback((page: number) => {
    if (isConsultationMode) return;

    // Prevent double-click / accidental re-trigger
    const currentStatus = pageStatusRef.current[page];
    if (currentStatus?.loading || currentStatus?.processing) {
        log.info(`[UI] Ignorata richiesta di ritraduzione per pagina ${page}: operazione già in corso.`);
        return;
    }

    stopQueueTranslation(page);

    // Feedback immediato: pulizia log e stato
    setGeminiLogs(prev => { const n = { ...prev }; delete n[page]; return n; });
    setPartialTranslations(prev => { const n = { ...prev }; delete n[page]; return n; });

    updatePageStatus(page, { error: false, loading: undefined, processing: "Riconnessione a Gemini..." });

    if (translationMapRef.current?.[page]) {
      const nextRef = { ...translationMapRef.current };
      delete nextRef[page];
      translationMapRef.current = nextRef;
    }

    setTranslationMap(prev => {
      const next = { ...prev };
      delete next[page];
      if (currentProjectFileId) {
        const fileId = currentProjectFileId;
        Promise.resolve().then(() => updateLibrary(fileId, { fileId, translations: next }));
      }
      return next;
    });
    enqueueTranslation(page, { priority: 'front', force: true, extraInstruction: ' ' });
  }, [enqueueTranslation, updateLibrary, stopQueueTranslation, updatePageStatus, currentProjectFileId]);

  const stopTranslation = useCallback((page: number) => {
    stopQueueTranslation(page);

    updatePageStatus(page, null);
    setPartialTranslations(prev => { const n = { ...prev }; delete n[page]; return n; });
    appendPageConsole(page, "Traduzione interrotta manualmente.");
  }, [appendPageConsole, stopQueueTranslation, updatePageStatus]);

  const stopAllTranslations = useCallback((clear = false) => {
    const activeList = Array.from(activePagesRef.current);
    abortAll(clear);
    activeList.forEach((page) => {
      updatePageStatus(page, null);
      setPartialTranslations(prev => { const n = { ...prev }; delete n[page]; return n; });
      appendPageConsole(page, "Traduzione interrotta manualmente.");
    });
  }, [abortAll, activePagesRef, appendPageConsole, updatePageStatus]);

  const pauseAllTranslations = useCallback(() => {
    const activeList = Array.from(activePagesRef.current);
    abortAll(false);
    activeList.forEach((page) => {
      const partial = partialTranslationsRef.current?.[page];
      if (partial && partial.trim().length > 0) {
        const MAX_CHARS = 4000;
        const tail = partial.length > MAX_CHARS ? partial.slice(-MAX_CHARS) : partial;
        setExtraInstruction(
          page,
          `Continua la traduzione ESATTAMENTE dal testo già prodotto qui sotto, senza riscriverlo e senza duplicare contenuti. Completa solo la parte mancante fino a fine pagina.\n\nTESTO GIÀ PRODOTTO (NON RIPETERE):\n<<<\n${tail}\n>>>\n`
        );
      }

      updatePageStatus(page, { loading: undefined, processing: 'In pausa' });
      appendPageConsole(page, "Traduzione messa in pausa.");
    });
  }, [abortAll, activePagesRef, appendPageConsole, setExtraInstruction, updatePageStatus]);

  return {
    translationMap,
    setTranslationMap,
    translationsMeta,
    setTranslationsMeta,
    pageStatus,
    setPageStatus,
    geminiLogs,
    setGeminiLogs,
    partialTranslations,
    setPartialTranslations,
    translationMapRef,
    pageStatusRef,
    inFlightTranslationRef,
    pageTraceRef,
    enqueueTranslation,
    enqueueMultipleTranslations,
    queueStats,
    setQueueStats,
    abortAll,
    pauseAllTranslations,
    stopAllTranslations,
    resetQueue,
    retranslatePage,
    stopTranslation,
     updatePageStatus,
     shouldSkipTranslation,
     saveSourceForPage,
     getQueue: () => [...translationQueueRef.current],
     activePagesRef
   };
 };
