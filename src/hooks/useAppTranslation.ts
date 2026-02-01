import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AISettings, PDFMetadata, PageAnnotation, PageStatus } from '../types';
import { log } from '../services/logger';
import { translatePage } from '../services/aiService';
import { useTranslationQueue } from './useTranslationQueue';
import { renderPageToJpegBase64 } from '../utils/pdfUtils';
import { withTimeout } from '../utils/async';
import { buildJpegDataUrlFromBase64, estimateBytesFromBase64, downscaleDataUrlToJpeg, cropBase64, rotateJpegBase64 } from '../utils/imageUtils';
import { projectFileIdFromName } from '../utils/fileUtils';
import { AI_TRANSLATION_TIMEOUT_MS, PAGE_RENDER_TIMEOUT_MS, PAGE_CACHE_MAX_EDGE, PAGE_CACHE_JPEG_QUALITY } from '../constants';

interface UseAppTranslationProps {
  pdfDoc: any;
  metadata: PDFMetadata | null;
  aiSettings: AISettings;
  docInputLanguage: string;
  updateLibrary: (fileName: string, data: any) => Promise<string>;
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
  currentProjectFileId: string | null;
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
  currentProjectFileId
}: UseAppTranslationProps) => {
  const [translationMap, _setTranslationMap] = useState<Record<number, string>>({});
  const [translationsMeta, setTranslationsMeta] = useState<Record<number, { model: string; savedAt: number }>>({});
  const [pageStatus, setPageStatus] = useState<Record<number, PageStatus>>({});
  const [partialTranslations, setPartialTranslations] = useState<Record<number, string>>({});

  const translationMapRef = useRef<Record<number, string>>(translationMap);
  const pageStatusRef = useRef<Record<number, PageStatus>>(pageStatus);
  const inFlightTranslationRef = useRef<Record<number, AbortController>>({});

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
    verboseLogs
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
      verboseLogs
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
    verboseLogs
  ]);

  useEffect(() => { translationMapRef.current = translationMap; }, [translationMap]);

  const shouldSkipTranslation = useCallback((page: number) => {
    const s = translationMap[page];
    return typeof s === 'string' && s.trim().length > 0;
  }, [translationMap]);

  const processPage = useCallback(async (targetPage: number, signal?: AbortSignal, extraInstruction?: string) => {
    const totalPages = pdfDoc?.numPages || metadata?.totalPages || 0;
    if (targetPage < 1 || (totalPages > 0 && targetPage > totalPages)) return;
    
    // If extraInstruction is present, we DON'T skip (it's a retry)
    if (shouldSkipTranslation(targetPage) && !extraInstruction) return;

    const startedAt = performance.now();
    const traceId = `${sessionId}-p${targetPage}-${Date.now().toString(36).slice(2, 6)}`;
    pageTraceRef.current[targetPage] = { t0: performance.now(), seq: 0, traceId };

    let pdfTimeout = false;
    let aiTimeout = false;
    let canvas: HTMLCanvasElement | null = null;
    const providerLabel = aiSettings.provider === 'gemini' ? 'Gemini' : 'OpenAI';

    try {
      const isRetry = Boolean(extraInstruction);
      const preferFullImage = isRetry;
      log.info(`${isRetry ? 'Riacquisizione/Ritraduzione' : 'Inizio traduzione'} AI per Pagina ${targetPage}...`);

      const apiKey = (aiSettings.provider === 'gemini' ? aiSettings.gemini.apiKey : aiSettings.openai.apiKey) || '';
      if (apiKey.trim().length === 0) {
        updatePageStatus(targetPage, {
          error: true,
          loading: `API non configurate: apri Impostazioni per usare ${providerLabel}.`,
          processing: 'Bloccato'
        });
        propsRef.current.appendPageConsole(targetPage, `API key mancante: impossibile avviare ${providerLabel}.`);
        return;
      }
      
      updatePageStatus(targetPage, { 
        processing: isRetry ? "Rielaborazione" : "Elaborazione",
        error: false 
      });

      propsRef.current.appendPageConsole(targetPage, `${isRetry ? 'Retry' : 'Trace'} avviato (provider=${aiSettings.provider}, verbose=${propsRef.current.verboseLogs ? 'ON' : 'OFF'})`, {
        sessionId,
        traceId,
        page: targetPage,
        isRetry,
        extraInstruction,
        translationMapSize: Object.keys(translationMapRef.current).length
      });
      
      let imageData: string | undefined;

      if (pdfDoc) {
        const fileName = metadata?.name;
        const fileId = currentProjectFileId || (fileName ? projectFileIdFromName(fileName) : null);
        const replacement = pageReplacementsRef.current?.[targetPage];

        if (replacement?.filePath) {
          updatePageStatus(targetPage, { loading: "Rendering pagina sostituita..." });
          propsRef.current.appendPageConsole(targetPage, `Sostituzione rilevata: PDF esterno ${replacement.filePath}`);

          const renderScale = aiSettings.provider === 'gemini' ? 2.8 : 2.5;
          const jpegQuality = aiSettings.provider === 'gemini' ? 0.92 : 0.9;
          const userRotation = pageRotationsRef.current?.[targetPage] || 0;
          const doc = await propsRef.current.loadReplacementPdfDoc(replacement.filePath);
          const result = await propsRef.current.renderDocPageToJpeg(doc, replacement.sourcePage, { scale: renderScale, jpegQuality, extraRotation: userRotation, signal });
          imageData = result.base64;

          propsRef.current.appendPageConsole(targetPage, `Render sostituzione completato - ${Math.round(result.width)}x${Math.round(result.height)}`, { scale: renderScale });

          let sourceDataUrl = result.dataUrl;
          try {
            sourceDataUrl = await downscaleDataUrlToJpeg(result.dataUrl, { maxSide: PAGE_CACHE_MAX_EDGE, jpegQuality: PAGE_CACHE_JPEG_QUALITY });
          } catch { }
          setOriginalImages(prev => ({ ...prev, [targetPage]: sourceDataUrl }));
          if (metadata?.name) {
            try { await propsRef.current.saveSourceForPage({ page: targetPage, sourceDataUrl }); } catch { }
          }
        }

        const cropRel = fileId ? pageImagesIndexRef.current?.crops?.[targetPage] : undefined;
        const sourceRel = fileId ? pageImagesIndexRef.current?.sources?.[targetPage] : undefined;

        if (!imageData && sourceRel && fileId) {
          try {
            updatePageStatus(targetPage, { loading: "Caricamento immagine originale salvata..." });
            imageData = await propsRef.current.readProjectImageBase64({ fileId, relPath: sourceRel });
            if (!originalImagesRef.current?.[targetPage]) {
              try {
                const sourceDataUrl = await propsRef.current.readProjectImageDataUrl({ fileId, relPath: sourceRel });
                setOriginalImages(prev => ({ ...prev, [targetPage]: sourceDataUrl }));
              } catch {
                setOriginalImages(prev => ({ ...prev, [targetPage]: buildJpegDataUrlFromBase64(imageData!) }));
              }
            }
            propsRef.current.appendPageConsole(targetPage, `Immagine originale caricata (base64 ~${Math.round(estimateBytesFromBase64(imageData) / 1024)}KB)`);
          } catch { imageData = undefined; }
        }

        if (!imageData) {
          updatePageStatus(targetPage, { loading: "Rendering pagina PDF..." });
          propsRef.current.appendPageConsole(targetPage, "Caricamento pagina da PDF originale...");
          const page: any = await withTimeout<any>(pdfDoc.getPage(targetPage), PAGE_RENDER_TIMEOUT_MS, () => {
            pdfTimeout = true;
          });
          const renderScale = aiSettings.provider === 'gemini' ? 2.8 : 2.5;
          const jpegQuality = aiSettings.provider === 'gemini' ? 0.92 : 0.9;
          const userRotation = pageRotationsRef.current?.[targetPage] || 0;
          const baseRotation = (((page?.rotate || 0) + userRotation) % 360 + 360) % 360;
          const viewport = page.getViewport({ scale: renderScale, rotation: baseRotation });
          
          const baseViewport = page.getViewport({ scale: 1, rotation: baseRotation });
          setPageDims(prev => ({ ...prev, [targetPage]: { width: baseViewport.width, height: baseViewport.height } }));

          // Creazione differita canvas: solo se necessario e appena prima del render
          canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          const context = canvas.getContext('2d', { alpha: false });
          if (context) {
            context.fillStyle = 'white';
            context.fillRect(0, 0, canvas.width, canvas.height);
          }

          const renderStartedAt = performance.now();
          const renderTask = page.render({ canvasContext: context as any, viewport });
          await withTimeout(renderTask.promise, PAGE_RENDER_TIMEOUT_MS, () => {
            pdfTimeout = true;
            try { renderTask.cancel(); } catch { }
          });
          propsRef.current.appendPageConsole(targetPage, `Render completato (${Math.round(performance.now() - renderStartedAt)}ms) - ${Math.round(viewport.width)}x${Math.round(viewport.height)}`, { scale: renderScale });

          const fullImageData = canvas.toDataURL('image/jpeg', jpegQuality);
          imageData = fullImageData.split(',')[1];
          propsRef.current.appendPageConsole(targetPage, `Immagine JPEG generata (base64 ~${Math.round(estimateBytesFromBase64(imageData) / 1024)}KB)`, {
            quality: jpegQuality,
            canvas: { width: canvas.width, height: canvas.height }
          });

          let sourceDataUrl = fullImageData;
          try {
            sourceDataUrl = await downscaleDataUrlToJpeg(fullImageData, { maxSide: PAGE_CACHE_MAX_EDGE, jpegQuality: PAGE_CACHE_JPEG_QUALITY });
          } catch { }
          setOriginalImages(prev => ({ ...prev, [targetPage]: sourceDataUrl }));
          if (metadata?.name) {
            try { await propsRef.current.saveSourceForPage({ page: targetPage, sourceDataUrl }); } catch { }
          }
        }
      } else {
        const fileName = metadata?.name;
        if (!fileName && !currentProjectFileId) return;
        const fileId = currentProjectFileId || projectFileIdFromName(fileName!);
        const sourceRel = pageImagesIndexRef.current?.sources?.[targetPage];
        if (!sourceRel) {
          updatePageStatus(targetPage, { 
            loading: "Immagine pagina non disponibile: PDF originale mancante. Riapri il progetto e seleziona il PDF.",
            processing: "Errore!",
            error: true
          });
          return;
        }

        try {
          updatePageStatus(targetPage, { loading: "Caricamento immagine originale..." });
          imageData = await propsRef.current.readProjectImageBase64({ fileId, relPath: sourceRel });
          if (!originalImagesRef.current?.[targetPage]) {
            try {
              const sourceDataUrl = await propsRef.current.readProjectImageDataUrl({ fileId, relPath: sourceRel });
              setOriginalImages(prev => ({ ...prev, [targetPage]: sourceDataUrl }));
            } catch {
              setOriginalImages(prev => ({ ...prev, [targetPage]: buildJpegDataUrlFromBase64(imageData!) }));
            }
          }
        } catch {
          updatePageStatus(targetPage, {
            error: true,
            loading: "Errore caricamento immagine originale dal disco.",
            processing: "Errore!"
          });
          return;
        }
        propsRef.current.appendPageConsole(targetPage, `Immagine caricata da cache progetto (base64 ~${Math.round(estimateBytesFromBase64(imageData) / 1024)}KB)`);
      }

      if (!imageData) throw new Error('Immagine non disponibile');
      
      updatePageStatus(targetPage, { loading: "Recupero contesto (pagine adiacenti)..." });

      const prevContext = translationMapRef.current[targetPage - 1] || "";

      const prevPageNumber = targetPage > 1 ? targetPage - 1 : undefined;
      const nextPageNumber = targetPage + 1 <= (pdfDoc?.numPages || 0) ? targetPage + 1 : undefined;
      const prevPageImageBase64 = prevPageNumber ? await propsRef.current.getContextImageBase64(prevPageNumber, 'bottom') : undefined;
      const nextPageImageBase64 = nextPageNumber ? await propsRef.current.getContextImageBase64(nextPageNumber, 'top') : undefined;

      updatePageStatus(targetPage, { loading: `In attesa di ${providerLabel}...` });
      propsRef.current.appendPageConsole(targetPage, `Preparazione richiesta ${providerLabel} completata. Invio in corso...`);
      
      const result = await withTimeout(
          translatePage(aiSettings, {
            imageBase64: imageData,
            pageNumber: targetPage,
            sourceLanguage: docInputLanguage,
            previousContext: prevContext,
            prevPageImageBase64,
            prevPageNumber,
            nextPageImageBase64,
            nextPageNumber,
            extraInstruction // Use the instruction from retry if present
          }, (progressText, partial) => {
            propsRef.current.appendPageConsole(targetPage, progressText);
            updatePageStatus(targetPage, { loading: progressText });
            if (partial !== undefined) {
              setPartialTranslations(prev => ({ ...prev, [targetPage]: partial }));
            }
          }, { signal }),
          AI_TRANSLATION_TIMEOUT_MS,
          () => { 
            aiTimeout = true; 
            // Forziamo l'abort della richiesta AI al timeout dell'app
            try {
              const ctrl = inFlightTranslationRef.current[targetPage];
              if (ctrl) {
                log.warning(`Timeout globale app (${AI_TRANSLATION_TIMEOUT_MS}ms) superato per pagina ${targetPage}. Forzo interruzione.`);
                ctrl.abort();
              }
            } catch (e) { }
          }
        );

      if (!result.text || result.text.trim().length === 0) throw new Error('Risposta vuota dal provider AI');

      const modelLabel = aiSettings.provider === 'gemini' ? aiSettings.gemini.model : aiSettings.openai.model;
      const savedAt = Date.now();
      const metaUpdate = { model: modelLabel, savedAt };

      setTranslationMap(prev => {
        const next = { ...prev, [targetPage]: result.text };
        translationMapRef.current = next;
        if (metadata) {
          // Optimized: only send the delta for this page to updateLibrary
          Promise.resolve().then(() => propsRef.current.updateLibrary(metadata.name, {
            translations: { [targetPage]: result.text },
            translationsMeta: { [targetPage]: metaUpdate },
            annotations: { [targetPage]: result.annotations || [] }
          }));
        }
        return next;
      });
      
      setTranslationsMeta(pm => ({ ...pm, [targetPage]: metaUpdate }));
      setAnnotationMap(prev => ({ ...prev, [targetPage]: result.annotations || [] }));

      void propsRef.current.verifyAndMaybeFixTranslation({
        page: targetPage,
        translatedText: result.text,
        imageBase64: imageData,
        prevContext,
        prevPageImageBase64,
        prevPageNumber,
        nextPageImageBase64,
        nextPageNumber,
        signal // Pass the signal to allow cancellation of verification/retry
      });

      updatePageStatus(targetPage, null); // Pulisce lo stato al termine con successo
      setPartialTranslations(prev => { const n = { ...prev }; delete n[targetPage]; return n; });
      propsRef.current.appendPageConsole(targetPage, `Completata (tempo totale: ${Math.round(performance.now() - startedAt)}ms)`);
    } catch (err: any) {
      if (signal?.aborted && !aiTimeout && !pdfTimeout) return;
      
      let message = err?.message || "Errore sconosciuto";
      if (pdfTimeout) {
        message = `Timeout Rendering PDF (${Math.round(PAGE_RENDER_TIMEOUT_MS / 1000)}s) - La pagina è troppo complessa da caricare.`;
      } else if (aiTimeout) {
        message = `Timeout globale AI (${Math.round(AI_TRANSLATION_TIMEOUT_MS / 1000)}s) - ${providerLabel} non ha risposto in tempo.`;
      } else if (err?.name === 'AbortError' || err?.code === 'ABORTED') {
        message = "Richiesta annullata o interrotta per timeout.";
      }

      propsRef.current.appendPageConsole(targetPage, `ERRORE: ${message}`, err);
      
      updatePageStatus(targetPage, { 
        error: true, 
        loading: message,
        processing: "Errore!" 
      });
    } finally {
      if (canvas) { 
        canvas.width = 0; 
        canvas.height = 0;
        canvas = null; // Aiuto GC
      }
    }
  }, [pdfDoc, metadata, shouldSkipTranslation, sessionId, aiSettings, docInputLanguage, translationMapRef, projectFileIdFromName, pageReplacementsRef, pageRotationsRef, setOriginalImages, setPageDims, setAnnotationMap, setTranslationsMeta, updatePageStatus]);

  const { enqueueTranslation, queueStats, setQueueStats, abortAll, stopTranslation: stopQueueTranslation } = useTranslationQueue({
    processPage,
    MAX_CONCURRENT_TRANSLATIONS: Math.max(1, Math.min(4, Number(aiSettings.translationConcurrency ?? 2) || 2)),
    externalInFlightRef: inFlightTranslationRef,
    isPaused,
    checkDependency: (page, queue, inFlight, queued) => {
      // Se è la prima pagina, non ci sono dipendenze
      if (page <= 1) return true;
      const prevPage = page - 1;
      // Se la pagina precedente è già tradotta nel map persistente, ok
      if (translationMapRef.current[prevPage]) return true;
      // Se la pagina precedente è in lavorazione, aspettiamo per evitare lavoro simultaneo su pagine consecutive
      if (inFlight[prevPage]) return false;
      // Se la pagina precedente è in coda, aspettiamo per mantenere l'ordine sequenziale e il contesto
      if (queued.has(prevPage)) return false;
      // Se non è né tradotta, né in volo, né in coda, procediamo (caso di traduzione singola sparsa)
      return true;
    }
  });

  const retranslatePage = useCallback((page: number) => {
    stopQueueTranslation(page);

    updatePageStatus(page, { error: false, loading: undefined, processing: undefined });

    if (translationMapRef.current?.[page]) {
      const nextRef = { ...translationMapRef.current };
      delete nextRef[page];
      translationMapRef.current = nextRef;
    }

    setTranslationMap(prev => {
      const next = { ...prev };
      delete next[page];
      if (metadata) {
        Promise.resolve().then(() => updateLibrary(metadata.name, { translations: next }));
      }
      return next;
    });
    enqueueTranslation(page, { priority: 'front', force: true });
  }, [enqueueTranslation, metadata, updateLibrary, stopQueueTranslation, updatePageStatus]);

  const stopTranslation = useCallback((page: number) => {
    stopQueueTranslation(page);
    
    updatePageStatus(page, null);
    setPartialTranslations(prev => { const n = { ...prev }; delete n[page]; return n; });
    appendPageConsole(page, "Traduzione interrotta manualmente.");
  }, [appendPageConsole, stopQueueTranslation, updatePageStatus]);

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
    queueStats,
    setQueueStats,
    abortAll,
    retranslatePage,
    stopTranslation,
    shouldSkipTranslation,
    saveSourceForPage
  };
};
