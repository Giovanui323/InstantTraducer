import { AISettings, GeminiModel, PageAnnotation, PageStatus, PDFMetadata, PageVerification } from '../../types';
import { log } from '../logger';
import { translatePage } from '../aiService';
import { cleanTranslationText } from '../textClean';
import { withTimeout, sleep } from '../../utils/async';
import { estimateBytesFromBase64, downscaleDataUrlToJpeg, buildJpegDataUrlFromBase64 } from '../../utils/imageUtils';
import { renderDocPageWithFallback } from '../../utils/pdfUtils';
import { AI_TRANSLATION_TIMEOUT_MS, PAGE_RENDER_TIMEOUT_MS, PAGE_CACHE_MAX_EDGE, PAGE_CACHE_JPEG_QUALITY, VERIFICATION_CONTEXT_TIMEOUT_MS } from '../../constants';
import { ConcurrencyControl } from '../../hooks/useTranslationQueue';

export interface TranslationExecutionServices {
  updateLibrary: (fileId: string, data: any, priority?: 'CRITICAL' | 'BACKGROUND' | 'BATCH') => Promise<string>;
  appendPageConsole: (page: number, msg: string, data?: any) => void;
  verifyAndMaybeFixTranslation: (args: any) => Promise<any>;
  saveSourceForPage: (args: any) => Promise<void>;
  readProjectImageBase64: (args: { fileId: string; relPath: string }) => Promise<string>;
  readProjectImageDataUrl: (args: { fileId: string; relPath: string }) => Promise<string>;
  getContextImageBase64: (page: number, section: 'top' | 'bottom' | 'full') => Promise<string | undefined>;
  loadReplacementPdfDoc: (filePath: string) => Promise<any>;
  renderDocPageToJpeg: (doc: any, page: number, opts: any) => Promise<any>;
  getLatestTranslationMap: () => Record<number, string>;
}

export interface TranslationExecutionContext {
  pdfDoc: any;
  metadata: PDFMetadata | null;
  currentProjectFileId: string | null;
  aiSettings: AISettings;
  docInputLanguage: string;
  sessionId: string;
  verboseLogs: boolean;
  isConsultationMode: boolean;
  pageReplacements: Record<number, any>;
  pageRotations: Record<number, number>;
  pageImagesIndex: any;
  translationMap: Record<number, string>;
  verificationMap?: Record<number, PageVerification>;
}

export interface TranslationExecutionStateSetters {
  updatePageStatus: (page: number, status: PageStatus | null) => void;
  setTranslationMap: (updater: (prev: Record<number, string>) => Record<number, string>) => void;
  setTranslationsMeta: (updater: (prev: Record<number, { model: string; savedAt: number }>) => Record<number, { model: string; savedAt: number }>) => void;
  setAnnotationMap: (updater: (prev: Record<number, PageAnnotation[]>) => Record<number, PageAnnotation[]>) => void;
  setPartialTranslations: (updater: (prev: Record<number, string>) => Record<number, string>) => void;
  setOriginalImages: (updater: (prev: Record<number, string>) => Record<number, string>) => void;
  setPageDims: (updater: (prev: Record<number, { width: number; height: number }>) => Record<number, { width: number; height: number }>) => void;
}

export const executePageTranslation = async (
  targetPage: number,
  services: TranslationExecutionServices,
  context: TranslationExecutionContext,
  setters: TranslationExecutionStateSetters,
  signal?: AbortSignal,
  extraInstruction?: string,
  translationModelOverride?: GeminiModel,
  inFlightRef?: React.RefObject<Record<number, AbortController>>,
  concurrencyControl?: ConcurrencyControl
) => {
  const { pdfDoc, metadata, currentProjectFileId, aiSettings, docInputLanguage, sessionId, verboseLogs, isConsultationMode } = context;

  if (isConsultationMode) return;
  const totalPages = pdfDoc?.numPages || metadata?.totalPages || 0;
  if (targetPage < 1 || (totalPages > 0 && targetPage > totalPages)) return;

  // If extraInstruction is present, we DON'T skip (it's a retry)
  const isRetry = typeof extraInstruction === 'string' && extraInstruction.length > 0;
  if (context.translationMap[targetPage] && context.translationMap[targetPage].trim().length > 0 && !isRetry) {
    log.info(`[TRANSLATION] Salto pagina ${targetPage}: già tradotta e non è un retry.`);
    return;
  }

  const startedAt = performance.now();
  const traceId = `${sessionId}-p${targetPage}-${Date.now().toString(36).slice(2, 6)}`;

  let pdfTimeout = false;
  let aiTimeout = false;
  let page: any = null;
  const providerLabel = aiSettings.provider === 'gemini' ? 'Gemini'
    : aiSettings.provider === 'claude' ? 'Claude'
    : aiSettings.provider === 'groq' ? 'Groq'
    : aiSettings.provider === 'modal' ? 'Modal'
    : aiSettings.provider === 'zai' ? 'Z.ai'
    : aiSettings.provider === 'openrouter' ? 'OpenRouter'
    : aiSettings.provider === 'custom' ? 'Custom'
    : 'OpenAI';

  try {
    // PIPELINING SYNCHRONIZATION (Optimized: Before Rendering)
    // We check if we need to wait for the previous page's translation.
    // If so, we release the concurrency slot to allow other independent tasks to run.
    if (targetPage > 1 && inFlightRef?.current) {
      const prevPageNum = targetPage - 1;
      let attempts = 0;
      const MAX_WAIT_ATTEMPTS = 600; // 5 minutes max wait

      const needsWait = () =>
        inFlightRef.current![prevPageNum] &&
        !services.getLatestTranslationMap()[prevPageNum] &&
        !signal?.aborted;

      if (needsWait()) {
        if (concurrencyControl) {
          log.info(`[PIPELINE] Pagina ${targetPage} rilascia slot concorrenza in attesa di ${prevPageNum}...`);
          concurrencyControl.release(targetPage);
        }

        while (needsWait() && attempts < MAX_WAIT_ATTEMPTS) {
          if (attempts === 0) {
            services.appendPageConsole(targetPage, "In attesa del completamento della pagina precedente (Pipelining)...");
            setters.updatePageStatus(targetPage, { loading: "In attesa pagina precedente..." });
          }
          await sleep(500);
          attempts++;
          if (attempts % 20 === 0) {
            log.info(`[PIPELINE] Pagina ${targetPage} in attesa di ${prevPageNum} da ${attempts * 0.5}s...`);
          }
        }

        if (concurrencyControl && !signal?.aborted) {
          log.info(`[PIPELINE] Pagina ${targetPage} riacquisisce slot concorrenza...`);
          setters.updatePageStatus(targetPage, { loading: "In coda per slot AI..." });
          await concurrencyControl.acquire(targetPage, signal);
        }

        if (attempts > 0) {
          services.appendPageConsole(targetPage, `Sincronizzazione completata (attesa: ${(attempts * 0.5).toFixed(1)}s).`);
        }
      }
    }

    const processingMsg = extraInstruction && extraInstruction.includes("RITRADUCI")
      ? "Rielaborazione con suggerimenti AI…"
      : (isRetry ? "Rielaborazione" : "Elaborazione");

    log.info(`${isRetry ? 'Riacquisizione/Ritraduzione' : 'Inizio traduzione'} AI per Pagina ${targetPage}...`);

    let apiKey = '';
    if (aiSettings.provider === 'gemini') apiKey = aiSettings.gemini.apiKey || '';
    else if (aiSettings.provider === 'claude') apiKey = aiSettings.claude?.apiKey || '';
    else if (aiSettings.provider === 'groq') apiKey = aiSettings.groq?.apiKey || '';
    else if (aiSettings.provider === 'modal') apiKey = aiSettings.modal?.apiKey || '';
    else if (aiSettings.provider === 'zai') apiKey = aiSettings.zai?.apiKey || '';
    else if (aiSettings.provider === 'openrouter') apiKey = aiSettings.openrouter?.apiKey || '';
    else if (aiSettings.provider === 'custom') apiKey = aiSettings.customProviders?.find(cp => cp.id === aiSettings.activeCustomProviderId)?.apiKey || '';
    else apiKey = aiSettings.openai.apiKey || '';
    if (apiKey.trim().length === 0) {
      setters.updatePageStatus(targetPage, {
        error: true,
        loading: `API non configurate: apri Impostazioni per usare ${providerLabel}.`,
        processing: 'Bloccato'
      });
      services.appendPageConsole(targetPage, `API key mancante: impossibile avviare ${providerLabel}.`);
      return;
    }

    setters.updatePageStatus(targetPage, {
      processing: processingMsg,
      error: false
    });

    services.appendPageConsole(targetPage, `${isRetry ? 'Retry' : 'Trace'} avviato (provider=${aiSettings.provider}, verbose=${verboseLogs ? 'ON' : 'OFF'})`, {
      sessionId,
      traceId,
      page: targetPage,
      isRetry,
      extraInstruction,
      translationMapSize: Object.keys(context.translationMap).length
    });

    let imageData: string | undefined;

    if (pdfDoc) {
      const fileId = currentProjectFileId || null;
      const replacement = context.pageReplacements?.[targetPage];

      if (replacement?.filePath) {
        setters.updatePageStatus(targetPage, { loading: "Rendering pagina sostituita..." });
        services.appendPageConsole(targetPage, `Sostituzione rilevata: PDF esterno ${replacement.filePath}`);

        const renderScale = aiSettings.provider === 'gemini' ? 2.8 : 2.5;
        const jpegQuality = aiSettings.provider === 'gemini' ? 0.92 : 0.9;
        const userRotation = context.pageRotations?.[targetPage] || 0;
        const doc = await services.loadReplacementPdfDoc(replacement.filePath);
        const result = await services.renderDocPageToJpeg(doc, replacement.sourcePage, { scale: renderScale, jpegQuality, extraRotation: userRotation, signal });
        imageData = result.base64;

        services.appendPageConsole(targetPage, `Render sostituzione completato - ${Math.round(result.width)}x${Math.round(result.height)}`, { scale: renderScale });

        let sourceDataUrl = result.dataUrl;
        try {
          sourceDataUrl = await downscaleDataUrlToJpeg(result.dataUrl, { maxSide: PAGE_CACHE_MAX_EDGE, jpegQuality: PAGE_CACHE_JPEG_QUALITY });
        } catch { }
        setters.setOriginalImages(prev => ({ ...prev, [targetPage]: sourceDataUrl }));
        // OPTIMIZATION: We do NOT save the generated image to disk to avoid waste.
        // The UI renders directly from PDF, and this image is only for AI.
        // if (metadata?.name) {
        //   try { await services.saveSourceForPage({ page: targetPage, sourceDataUrl }); } catch { }
        // }
      }

      const cropRel = fileId ? context.pageImagesIndex?.crops?.[targetPage] : undefined;
      const sourceRel = fileId ? context.pageImagesIndex?.sources?.[targetPage] : undefined;
      const preferredRel = cropRel || sourceRel;

      if (!imageData && preferredRel && fileId) {
        try {
          setters.updatePageStatus(targetPage, { loading: cropRel ? "Caricamento immagine ritagliata salvata..." : "Caricamento immagine originale salvata..." });
          imageData = await services.readProjectImageBase64({ fileId, relPath: preferredRel });

          // Try to update original images UI cache if possible (fire and forget)
          try {
            const sourceDataUrl = await services.readProjectImageDataUrl({ fileId, relPath: preferredRel });
            setters.setOriginalImages(prev => ({ ...prev, [targetPage]: sourceDataUrl }));
          } catch {
            if (imageData) {
              setters.setOriginalImages(prev => ({ ...prev, [targetPage]: buildJpegDataUrlFromBase64(imageData!) }));
            }
          }

          services.appendPageConsole(targetPage, `Immagine originale caricata (base64 ~${Math.round(estimateBytesFromBase64(imageData) / 1024)}KB)`);
        } catch { imageData = undefined; }
      }

      if (!imageData) {
        services.appendPageConsole(targetPage, "Caricamento pagina da PDF originale...");

        // Use standard rendering with fallback logic (retry with lower quality/scale on failure)
        // This handles corrupted pages and timeouts gracefully
        const baseRenderScale = aiSettings.provider === 'gemini' ? 2.8 : 2.5;
        const jpegQuality = aiSettings.provider === 'gemini' ? 0.92 : 0.9;

        try {
          const result = await renderDocPageWithFallback(pdfDoc, targetPage, {
            scale: baseRenderScale,
            jpegQuality,
            extraRotation: context.pageRotations?.[targetPage] || 0,
            maxRetries: 3
          });

          if (!result.success || !result.base64 || !result.dataUrl) {
            throw result.error || new Error('Rendering failed without error details');
          }

          imageData = result.base64;

          setters.setPageDims(prev => ({
            ...prev,
            [targetPage]: { width: result.width || 0, height: result.height || 0 }
          }));

          services.appendPageConsole(
            targetPage,
            `Render completato (${result.attempts} tentativi) - ${Math.round(result.width || 0)}x${Math.round(result.height || 0)}`,
            { scale: baseRenderScale }
          );

          services.appendPageConsole(targetPage, `Immagine JPEG generata (base64 ~${Math.round(estimateBytesFromBase64(imageData) / 1024)}KB)`, {
            quality: jpegQuality,
            canvas: { width: result.width, height: result.height }
          });

          let sourceDataUrl = result.dataUrl;
          try {
            sourceDataUrl = await downscaleDataUrlToJpeg(result.dataUrl, { maxSide: PAGE_CACHE_MAX_EDGE, jpegQuality: PAGE_CACHE_JPEG_QUALITY });
          } catch { }
          setters.setOriginalImages(prev => ({ ...prev, [targetPage]: sourceDataUrl }));

        } catch (e: any) {
          log.error(`Failed to render page ${targetPage} after retries`, e);
          throw e;
        }
      }
    } else {
      const fileId = currentProjectFileId;
      if (!fileId) return;
      const sourceRel = context.pageImagesIndex?.sources?.[targetPage];
      if (!sourceRel) {
        setters.updatePageStatus(targetPage, {
          error: "Immagine pagina non disponibile: PDF originale mancante. Riapri il progetto e seleziona il PDF.",
          loading: undefined,
          processing: "Errore!"
        });
        return;
      }

      try {
        setters.updatePageStatus(targetPage, { loading: "Caricamento immagine originale..." });
        imageData = await services.readProjectImageBase64({ fileId, relPath: sourceRel });

        // Try update UI cache
        try {
          const sourceDataUrl = await services.readProjectImageDataUrl({ fileId, relPath: sourceRel });
          setters.setOriginalImages(prev => ({ ...prev, [targetPage]: sourceDataUrl }));
        } catch {
          if (imageData) setters.setOriginalImages(prev => ({ ...prev, [targetPage]: buildJpegDataUrlFromBase64(imageData!) }));
        }
      } catch {
        setters.updatePageStatus(targetPage, {
          error: "Errore caricamento immagine originale dal disco.",
          loading: undefined,
          processing: "Errore!"
        });
        return;
      }
      services.appendPageConsole(targetPage, `Immagine caricata da cache progetto (base64 ~${Math.round(estimateBytesFromBase64(imageData) / 1024)}KB)`);
    }

    if (!imageData) throw new Error('Immagine non disponibile');

    // PIPELINING SYNCHRONIZATION: Moved to start of function to save resources.

    setters.updatePageStatus(targetPage, { loading: "Recupero contesto (pagine adiacenti)..." });
    services.appendPageConsole(targetPage, "Recupero contesto visivo (rendering pagine adiacenti)...");

    // Recupero contesto pagina precedente (Traduzione e/o Originale)
    const currentTranslationMap = services.getLatestTranslationMap();
    let prevTranslatedText = currentTranslationMap[targetPage - 1] || "";

    if (prevTranslatedText && context.verificationMap) {
      const prevVerification = context.verificationMap[targetPage - 1];
      if (prevVerification?.severity === 'severe') {
        prevTranslatedText = "";
        services.appendPageConsole(targetPage, "Context: Ignorata traduzione pagina precedente (Quality Check fallito: SEVERE).");
      } else if (prevVerification?.state === 'verifying' && prevVerification.startedAt) {
        const elapsed = Date.now() - prevVerification.startedAt;
        if (elapsed > VERIFICATION_CONTEXT_TIMEOUT_MS) {
          prevTranslatedText = "";
          services.appendPageConsole(targetPage, "Context: Verifica precedente in ritardo, uso solo originale.");
        }
      }
    }

    let prevOriginalText = "";

    // Tentiamo SEMPRE di recuperare il testo originale per arricchire il contesto (se pagina > 1)
    if (targetPage > 1 && pdfDoc) {
      try {
        const prevPage = await pdfDoc.getPage(targetPage - 1);
        const textContent = await prevPage.getTextContent();
        prevOriginalText = textContent.items
          .map((item: any) => item.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      } catch (e) {
        // Ignoriamo errori nel recupero del testo originale
      }
    }

    let prevContext = "";

    if (prevTranslatedText && prevOriginalText) {
      // Caso OTTIMALE: Abbiamo entrambi. Forniamo entrambi per massima chiarezza.
      // Mettiamo prima l'originale, poi la traduzione, così il slice(-3000) nel prompt preserva la traduzione (più importante).
      prevContext = `[TESTO ORIGINALE PAGINA PRECEDENTE]: ${prevOriginalText}\n\n[TRADUZIONE PAGINA PRECEDENTE]: ${prevTranslatedText}`;
      services.appendPageConsole(targetPage, "Context: Usato doppio contesto (Originale + Traduzione).");
    } else if (prevTranslatedText) {
      // Caso STANDARD: Abbiamo solo la traduzione.
      prevContext = prevTranslatedText;
    } else if (prevOriginalText) {
      // Caso FALLBACK: Solo originale.
      prevContext = `[TESTO ORIGINALE]: ${prevOriginalText}`;
      services.appendPageConsole(targetPage, "Context fallback: usato testo originale pagina precedente.");
    }

    const prevPageNumber = targetPage > 1 ? targetPage - 1 : undefined;
    const nextPageNumber = targetPage + 1 <= (pdfDoc?.numPages || 0) ? targetPage + 1 : undefined;
    const prevPageImageBase64 = prevPageNumber ? await services.getContextImageBase64(prevPageNumber, 'bottom') : undefined;
    const nextPageImageBase64 = nextPageNumber ? await services.getContextImageBase64(nextPageNumber, 'top') : undefined;

    setters.updatePageStatus(targetPage, { loading: `In attesa di ${providerLabel}...` });
    services.appendPageConsole(targetPage, `Preparazione richiesta ${providerLabel} completata. Invio in corso...`);

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
        extraInstruction, // Use the instruction from retry if present
        translationModelOverride,
        skipPostProcessing: true // OPTIMIZATION: Defer cleaning until after QC
      }, (progressText, partial) => {
        const progressData: any = { sessionId, traceId, page: targetPage };
        if (partial !== undefined) progressData.partialChars = partial.length;
        services.appendPageConsole(targetPage, progressText, progressData);
        setters.updatePageStatus(targetPage, { loading: progressText });
        if (partial !== undefined) {
          setters.setPartialTranslations(prev => ({ ...prev, [targetPage]: partial }));
        }
      }, { signal }),
      AI_TRANSLATION_TIMEOUT_MS,
      () => {
        aiTimeout = true;
        // Forziamo l'abort della richiesta AI al timeout dell'app
        try {
          if (inFlightRef?.current) {
            const ctrl = inFlightRef.current[targetPage];
            if (ctrl) {
              log.warning(`Timeout globale app (${AI_TRANSLATION_TIMEOUT_MS}ms) superato per pagina ${targetPage}. Forzo interruzione.`);
              ctrl.abort();
            }
          }
        } catch (e) { }
      }
    );

    if (!result.text || result.text.trim().length === 0) throw new Error('Risposta vuota dal provider AI');

    // 1. Initial Draft (Minimally cleaned)
    let normalizedText = result.text;
    const modelLabel = result.modelUsed || (
      aiSettings.provider === 'gemini' ? aiSettings.gemini.model
      : aiSettings.provider === 'claude' ? aiSettings.claude?.model
      : aiSettings.provider === 'groq' ? aiSettings.groq?.model
      : aiSettings.provider === 'modal' ? 'zai-org/GLM-5.1-FP8'
      : aiSettings.provider === 'zai' ? aiSettings.zai?.model
      : aiSettings.provider === 'openrouter' ? aiSettings.openrouter?.model
      : aiSettings.provider === 'custom' ? aiSettings.customProviders?.find(cp => cp.id === aiSettings.activeCustomProviderId)?.model
      : aiSettings.openai.model
    ) || 'sconosciuto';
    const savedAt = Date.now();
    const metaUpdate = { model: modelLabel, savedAt };

    // Update UI immediately with draft so user sees progress
    setters.setTranslationMap(prev => ({ ...prev, [targetPage]: normalizedText }));
    setters.setTranslationsMeta(pm => ({ ...pm, [targetPage]: metaUpdate }));
    setters.setAnnotationMap(prev => ({ ...prev, [targetPage]: result.annotations || [] }));

    setters.updatePageStatus(targetPage, {
      processing: "Salvataggio risultati...",
      error: false
    });

    normalizedText = cleanTranslationText(normalizedText);

    setters.setTranslationMap(prev => ({ ...prev, [targetPage]: normalizedText }));

    if (currentProjectFileId) {
      const fileId = currentProjectFileId;
      const saveResultId = await services.updateLibrary(fileId, {
        fileId,
        translations: { [targetPage]: normalizedText },
        translationsMeta: { [targetPage]: metaUpdate },
        annotations: { [targetPage]: result.annotations || [] }
      }, 'CRITICAL');

      if (!saveResultId) {
        throw new Error("Salvataggio su disco fallito (File bloccato o errore I/O).");
      }
    }

    void services.verifyAndMaybeFixTranslation({
      page: targetPage,
      translatedText: normalizedText,
      imageBase64: imageData,
      prevContext,
      prevPageImageBase64,
      prevPageNumber,
      nextPageImageBase64,
      nextPageNumber,
      trigger: 'auto',
      bypassConcurrency: true
    }).catch((err: any) => {
      log.warning(`[QUALITY] Errore accodamento verifica pagina ${targetPage}: ${err?.message || err}`);
    });

    setters.updatePageStatus(targetPage, null);
    setters.setPartialTranslations(prev => { const n = { ...prev }; delete n[targetPage]; return n; });
    services.appendPageConsole(targetPage, `Completata (tempo totale: ${Math.round(performance.now() - startedAt)}ms)`);
  } catch (err: any) {
    let message = err?.message || "Errore sconosciuto";

    // Detect PDF destruction/cleanup errors
    const isDestructionError =
      message.includes("Invalid page request") ||
      message.includes("Worker was destroyed") ||
      message.includes("Transport destroyed") ||
      message.includes("cancelled");

    if ((signal?.aborted || isDestructionError) && !aiTimeout && !pdfTimeout) {
      log.info(`[TRANSLATION] Pagina ${targetPage}: operazione interrotta (Cleanup/Abort).`);
      return;
    }

    if (pdfTimeout) {
      message = `Timeout Rendering PDF (${Math.round(PAGE_RENDER_TIMEOUT_MS / 1000)}s) - Pagina ${targetPage}: la renderizzazione è troppo lenta o complessa. Prova a ritagliare/sostituire la pagina o riprova.`;
    } else if (aiTimeout) {
      message = `Timeout globale AI (${Math.round(AI_TRANSLATION_TIMEOUT_MS / 1000)}s) - Pagina ${targetPage}: ${providerLabel} non ha risposto in tempo.`;
    } else if (err?.name === 'AbortError' || err?.code === 'ABORTED') {
      // Standard abort (e.g., from Watchdog Timeout or user manual stop)
      log.info(`[TRANSLATION] Pagina ${targetPage}: operazione annullata.`);

      // CRITICAL FIX: Ensure the aborted page is marked as error so the batch monitor counts it.
      // If we return silently without setting error/done, it becomes a zombie and breaks the Queue Monitor.
      setters.updatePageStatus(targetPage, {
        error: "Timeout di sicurezza (Connessione instabile o elaborazione troppo complessa). Riprova.",
        loading: undefined,
        processing: "Annullata!"
      });
      return;
    }

    services.appendPageConsole(targetPage, `ERRORE: ${message}`, err);

    setters.updatePageStatus(targetPage, {
      error: message,
      loading: undefined,
      processing: "Errore!"
    });

    // CRITICAL FIX: Re-throw error to trigger Circuit Breaker in the queue
    // But only for critical errors, not for user aborts or temporary PDF issues
    const isCritical =
      message.includes("BLOCKED_BY_BACKEND") ||
      message.includes("API key mancante") ||
      message.includes("Timeout globale AI") ||
      message.includes("Risposta vuota") ||
      message.includes("Salvataggio su disco fallito");

    if (isCritical) {
      log.warning(`[EXECUTOR] Rethrowing critical error for Circuit Breaker: ${message}`);
      throw err;
    }
  } finally {
    if (page) {
      try {
        // Cleanup PDF page resources to prevent memory leaks/zombie processes
        page.cleanup();
      } catch (e) { }
      page = null;
    }
  }
};
