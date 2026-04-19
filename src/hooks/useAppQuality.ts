import React, { useState, useCallback, useMemo, useRef } from 'react';
import { AISettings, GeminiModel, PDFMetadata, PageVerification, PageAnnotation, PageStatus } from '../types';
import { log } from '../services/logger';
import { verifyTranslationQuality, checkApiConfiguration } from '../services/aiService';
import { looksLikeItalian } from '../services/aiUtils';
import { buildRetryInstruction } from '../services/prompts/shared';
import { useVerificationQueue } from './useVerificationQueue';
import { GEMINI_TRANSLATION_MODEL, GEMINI_VERIFIER_MODEL } from '../constants';

interface UseAppQualityProps {
  pdfDoc: any;
  metadata: PDFMetadata | null;
  aiSettings: AISettings;
  docInputLanguage: string;
  currentProjectFileId: string | null;
  translationMapRef: React.MutableRefObject<Record<number, string>>;
  setTranslationMap: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  setAnnotationMap: React.Dispatch<React.SetStateAction<Record<number, PageAnnotation[]>>>;
  updatePageStatus: (page: number, delta: PageStatus | null) => void;
  updateLibrary: (name: string, data: any) => void;
  appendPageConsole: (page: number, msg: string, data?: any) => void;
  loadReplacementPdfDoc: (path: string) => Promise<any>;
  getContextImageBase64: (page: number, section: 'top' | 'bottom' | 'full') => Promise<string | undefined>;
  enqueueTranslation: (page: number, options?: { priority: 'front' | 'back', force?: boolean, extraInstruction?: string, translationModelOverride?: GeminiModel, onComplete?: () => void, isAutoRetry?: boolean }) => void;
  clearLogs: (page: number) => void;
  isConsultationMode: boolean;
  onSevereError?: (page: number) => void;
}

export const useAppQuality = ({
  pdfDoc,
  metadata,
  aiSettings,
  docInputLanguage,
  currentProjectFileId,
  translationMapRef,
  setTranslationMap,
  setAnnotationMap,
  updatePageStatus,
  updateLibrary,
  appendPageConsole,
  loadReplacementPdfDoc,
  getContextImageBase64,
  enqueueTranslation,
  clearLogs,
  isConsultationMode,
  onSevereError
}: UseAppQualityProps) => {
  const [verificationMap, setVerificationMap] = useState<Record<number, PageVerification>>({});
  const verificationMapRef = useRef<Record<number, PageVerification>>(verificationMap);
  const [verificationsMeta, setVerificationsMeta] = useState<Record<number, { model: string; savedAt: number }>>({});

  const verificationRunIdRef = useRef<Record<number, number>>({});
  const qualityAutoRetryCountRef = useRef<Record<number, number>>({});
  const fixingPagesRef = useRef<Record<number, boolean>>({});
  const resumedProjectIdRef = useRef<string | null>(null);

  // Helper per verificare se una pagina è già verificata (evita stale state)
  const isPageVerified = useCallback((page: number) => {
    return verificationMapRef.current[page]?.state === 'verified';
  }, []);

  // Use refs for stable props to minimize re-creations
  const propsRef = useRef({
    updateLibrary,
    updatePageStatus,
    appendPageConsole,
    loadReplacementPdfDoc,
    getContextImageBase64,
    clearLogs,
    onSevereError,
    currentProjectFileId
  });

  React.useEffect(() => {
    propsRef.current = {
      updateLibrary,
      updatePageStatus,
      appendPageConsole,
      loadReplacementPdfDoc,
      getContextImageBase64,
      clearLogs,
      onSevereError,
      currentProjectFileId
    };
  }, [updateLibrary, updatePageStatus, appendPageConsole, loadReplacementPdfDoc, getContextImageBase64, clearLogs, onSevereError, currentProjectFileId]);

  React.useEffect(() => { verificationMapRef.current = verificationMap; }, [verificationMap]);

  const processVerificationInternal = useCallback(async (page: number, signal: AbortSignal, options?: any) => {
    if (isConsultationMode) return;
    const settings = aiSettings;
    // Prefer explicitly passed text (fixes race condition), fallback to ref
    const translatedText = options?.translatedText || translationMapRef.current[page];
    const trigger = options?.trigger || 'auto';
    const force = options?.force || false;

    if (!translatedText?.trim()) return;

    // Pre-check: Language Detection
    const isItalian = looksLikeItalian(translatedText, docInputLanguage);
    if (!isItalian) {
      const retriesSoFar = qualityAutoRetryCountRef.current[page] || 0;
      if (retriesSoFar < (settings.qualityCheck?.maxAutoRetries || 1)) {
        qualityAutoRetryCountRef.current[page] = retriesSoFar + 1;
        propsRef.current.appendPageConsole(page, `Verifica lingua: rilevato testo non italiano. Messa in coda per ritraduzione forzata (tentativo ${qualityAutoRetryCountRef.current[page]}).`);

        const langCheckResult: PageVerification = {
          state: 'verified',
          autoRetryActive: true,
          postRetryFailed: false,
          checkedAt: Date.now(),
          summary: 'Ritraduzione automatica in coda (testo non italiano).',
          severity: 'severe' // Treat as severe to skip saving
        };

        // Fix race condition: Update ref immediately
        verificationMapRef.current = {
          ...verificationMapRef.current,
          [page]: {
            ...(verificationMapRef.current[page] || {}),
            ...langCheckResult
          }
        };

        setVerificationMap(prev => ({
          ...prev,
          [page]: {
            ...(prev[page] || {}),
            ...langCheckResult
          }
        }));

        enqueueTranslation(page, {
          priority: 'front',
          force: true,
          isAutoRetry: true,
          extraInstruction: "L'output precedente non era in Italiano. TRADUCI INTERAMENTE IN ITALIANO. Non lasciare testo in lingua originale."
        });
        return langCheckResult;
      }
    }

    // Full Quality Verification
    const verifierProvider = settings.qualityCheck?.verifierProvider || settings.provider;
    let apiKey = '';
    if (verifierProvider === 'gemini') apiKey = (settings.gemini.apiKey || '').trim();
    else if (verifierProvider === 'openai') apiKey = (settings.openai.apiKey || '').trim();
    else if (verifierProvider === 'claude') apiKey = (settings.claude?.apiKey || '').trim();
    else apiKey = (settings.groq?.apiKey || '').trim();
    if (!apiKey) return;

    const verifierModel =
      settings.qualityCheck?.verifierModel ||
      (verifierProvider === 'gemini'
        ? GEMINI_VERIFIER_MODEL
        : verifierProvider === 'openai'
          ? settings.openai.model
          : verifierProvider === 'groq'
            ? (settings.groq?.model || 'llama-3.3-70b-versatile')
            : (settings.claude?.model || ''));

    const nextRunId = (verificationRunIdRef.current[page] || 0) + 1;
    verificationRunIdRef.current[page] = nextRunId;

    const startedAt = Date.now();
    const verifierMetaLabel = `${verifierProvider} • ${verifierModel}`;
    const updateProgress = (progress: string) => {
      setVerificationMap(prev => ({
        ...prev,
        [page]: {
          ...(prev[page] || {}),
          state: 'verifying',
          postRetryFailed: false,
          runId: nextRunId,
          startedAt,
          progress
        }
      }));
    };

    updateProgress('Avvio…');
    propsRef.current.appendPageConsole(
      page,
      `Verifica qualità: avvio (run=${nextRunId}, motivo=${trigger}, provider=${verifierProvider}, model=${verifierModel})`
    );
    if (propsRef.current.currentProjectFileId) {
      const fileId = propsRef.current.currentProjectFileId;
      const metaUpdate = { model: verifierMetaLabel, savedAt: startedAt };
      setVerificationsMeta(vm => ({ ...vm, [page]: metaUpdate }));
      propsRef.current.updateLibrary(fileId, {
        fileId,
        verificationsMeta: { [page]: metaUpdate }
      });
    }

    try {
      updateProgress('Caricamento contesto…');

      let imageBase64: string | undefined = options?.imageBase64;
      if (!imageBase64) {
        for (let i = 0; i < 3; i++) {
          imageBase64 = await propsRef.current.getContextImageBase64(page, 'full');
          if (imageBase64) break;
          if (i < 2) await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      if (!imageBase64) throw new Error("Impossibile recuperare l'immagine della pagina.");

      const totalPages = pdfDoc?.numPages || metadata?.totalPages || 0;
      let prevImg = options?.prevPageImageBase64;
      if (!prevImg && page > 1) {
        prevImg = await propsRef.current.getContextImageBase64(page - 1, 'bottom');
      }

      let nextImg = options?.nextPageImageBase64;
      if (!nextImg && totalPages > 0 && page < totalPages) {
        nextImg = await propsRef.current.getContextImageBase64(page + 1, 'top');
      }

      if (signal.aborted) return;

      updateProgress('Invio richiesta al modello…');
      const report = await verifyTranslationQuality({
        translatedText,
        imageBase64,
        pageNumber: page,
        prevPageImageBase64: prevImg,
        prevPageNumber: page > 1 ? page - 1 : undefined,
        nextPageImageBase64: nextImg,
        nextPageNumber: (totalPages > 0 && page < totalPages) ? page + 1 : undefined,
        settings,
        signal,
        sourceLanguage: docInputLanguage
      });

      // Clear manual fix state as we now have a new verification result
      delete fixingPagesRef.current[page];

      if (!report) throw new Error("Errore durante la verifica qualità.");
      if (verificationRunIdRef.current[page] !== nextRunId) return;

      // HEURISTIC OVERRIDE: If the model mentioned errors or hallucinations but forgot to set severity to severe
      const lowerSummary = (report.summary || "").toLowerCase();
      const lowerHint = (report.retryHint || "").toLowerCase();
      const combined = `${lowerSummary} ${lowerHint}`;

      const isSevereErrorDetected = 
        // Quality/Language
        combined.includes("trascrizione") || combined.includes("lingua originale") || 
        combined.includes("non è una traduzione") || combined.includes("identico parola per parola") ||
        // Hallucinations/Accuracy
        combined.includes("allucinazioni") || combined.includes("gravi errori") || 
        combined.includes("errore di senso") || combined.includes("inverte il senso") ||
        combined.includes("sostituito con") || combined.includes("sostituita con") ||
        combined.includes("omesso") || combined.includes("omissione") ||
        // English keywords for common OR models
        combined.includes("hallucination") || combined.includes("wrong language") ||
        combined.includes("sense inverted") || combined.includes("not a translation");
      
      if (isSevereErrorDetected && report.severity !== 'severe') {
        log.warning(`[QUALITY] Heuristic override: errore grave o allucinazione rilevata ma severity='${report.severity}'. Forza a 'severe'.`);
        report.severity = 'severe';
      }

      updateProgress('Elaborazione risposta…');
      propsRef.current.appendPageConsole(page, `Verifica qualità: ${(report.severity || 'ok').toUpperCase()}${report.summary ? ` — ${report.summary}` : ''}`);

      const makeId = () => (globalThis.crypto && 'randomUUID' in globalThis.crypto ? (globalThis.crypto as any).randomUUID() : Math.random().toString(36).slice(2));
      const annotations = (report.annotations || []).map((a) => ({ id: makeId(), originalText: a.originalText, comment: a.comment, type: a.type } as PageAnnotation));

      setAnnotationMap(prev => {
        const next = { ...prev };
        if (annotations.length > 0) next[page] = annotations;
        else delete next[page];
        if (propsRef.current.currentProjectFileId) {
          const fileId = propsRef.current.currentProjectFileId;
          propsRef.current.updateLibrary(fileId, { fileId, annotations: next });
        }
        return next;
      });

      if (report.severity === 'severe') {
        // Trigger kill switch for subsequent pages
        if (propsRef.current.onSevereError) {
          propsRef.current.onSevereError(page);
        }

        const retriesSoFar = qualityAutoRetryCountRef.current[page] || 0;
        const configuredMaxRetries = settings.qualityCheck?.maxAutoRetries ?? 0;

        if (retriesSoFar < configuredMaxRetries) {
          qualityAutoRetryCountRef.current[page] = retriesSoFar + 1;
          const shouldEscalateToPro =
            settings.provider === 'gemini' &&
            String(settings.gemini?.model || '').includes('flash');
          propsRef.current.appendPageConsole(
            page,
            `Ritraduzione automatica: messa in coda (tentativo ${qualityAutoRetryCountRef.current[page]}/${configuredMaxRetries})${shouldEscalateToPro ? ' • escalation a Pro' : ''}`
          );

          const retryInstruction = buildRetryInstruction(report, { preservePageSplit: translatedText.includes('[[PAGE_SPLIT]]') });
          const queuedCheckedAt = Date.now();
          const queuedUpdate: PageVerification = {
            ...report,
            state: 'verified',
            checkedAt: queuedCheckedAt,
            summary: `${report.summary ? `${report.summary} — ` : ''}Ritraduzione automatica in coda (tentativo ${qualityAutoRetryCountRef.current[page]}/${configuredMaxRetries}).`,
            autoRetryActive: true,
            postRetryFailed: false
          };

          // Fix race condition: Update ref immediately
          verificationMapRef.current = { ...verificationMapRef.current, [page]: queuedUpdate };

          setVerificationMap(prev => ({ ...prev, [page]: queuedUpdate }));
          if (propsRef.current.currentProjectFileId) {
            const fileId = propsRef.current.currentProjectFileId;
            const metaUpdate = { model: verifierMetaLabel, savedAt: queuedCheckedAt };
            setVerificationsMeta(vm => ({ ...vm, [page]: metaUpdate }));
            propsRef.current.updateLibrary(fileId, {
              fileId,
              verifications: { [page]: queuedUpdate },
              verificationsMeta: { [page]: metaUpdate }
            });
          }

          enqueueTranslation(page, {
            priority: 'front',
            force: true,
            isAutoRetry: true,
            extraInstruction: retryInstruction,
            ...(shouldEscalateToPro ? { translationModelOverride: (aiSettings.forceFixTranslationModel?.trim() || GEMINI_TRANSLATION_MODEL) as any } : {})
          });
          return queuedUpdate;
        }
      }

      const retriesSoFar = qualityAutoRetryCountRef.current[page] || 0;
      const configuredMaxRetries = settings.qualityCheck?.maxAutoRetries ?? 0;
      const needsManualAfterRetry = report.severity === 'severe' && retriesSoFar >= configuredMaxRetries;

      const vUpdate: PageVerification = {
        ...report,
        severity: report.severity || 'ok',
        state: 'verified',
        checkedAt: Date.now(),
        autoRetryActive: false,
        postRetryFailed: needsManualAfterRetry
      };

      // Fix race condition: Update ref immediately
      verificationMapRef.current = { ...verificationMapRef.current, [page]: vUpdate };

      setVerificationMap(prev => ({ ...prev, [page]: vUpdate }));
      if (propsRef.current.currentProjectFileId) {
        const fileId = propsRef.current.currentProjectFileId;
        const savedAt = Date.now();
        const metaUpdate = { model: verifierMetaLabel, savedAt };
        setVerificationsMeta(vm => ({ ...vm, [page]: metaUpdate }));
        propsRef.current.updateLibrary(fileId, {
          fileId,
          verifications: { [page]: vUpdate },
          verificationsMeta: { [page]: metaUpdate }
        });
      }
      return vUpdate;
    } catch (err: any) {
      if (verificationRunIdRef.current[page] !== nextRunId) return;

      let errorType = 'GENERIC_ERROR';
      let msg = err?.message || 'Errore sconosciuto';

      if (signal.aborted || err?.name === 'AbortError') {
        propsRef.current.appendPageConsole(page, `Verifica qualità: annullata (run=${nextRunId})`);
        setVerificationMap(prev => ({ ...prev, [page]: { state: 'idle', autoRetryActive: false, postRetryFailed: false } }));
        return;
      }

      if (msg.includes('API key')) errorType = 'AUTH_ERROR';
      else if (msg.includes('quota') || msg.includes('limit')) errorType = 'RATE_LIMIT';
      else if (msg.includes('network') || msg.includes('fetch')) errorType = 'NETWORK_ERROR';

      propsRef.current.appendPageConsole(page, `Verifica qualità: errore [${errorType}] (run=${nextRunId}) — ${msg}`);

      // FIX: Se l'errore è dovuto a Quota (429) o Timeout, NON fallire la pagina (che scarterebbe la traduzione).
      // Invece, segniamo la verifica come "saltata" (state: verified con warning) per preservare il lavoro fatto.
      if (errorType === 'RATE_LIMIT' || errorType === 'NETWORK_ERROR') {
        propsRef.current.appendPageConsole(page, `Verifica qualità: SALTATA per preservare traduzione (causa ${errorType}).`);
        const skippedResult: PageVerification = {
          state: 'verified', // Consideriamo verificato (bypass)
          summary: `Verifica saltata per limiti API (${errorType}). Traduzione preservata.`,
          autoRetryActive: false,
          postRetryFailed: false,
          checkedAt: Date.now()
        };

        // Fix race condition: Update ref immediately
        verificationMapRef.current = { ...verificationMapRef.current, [page]: skippedResult };

        setVerificationMap(prev => ({
          ...prev,
          [page]: skippedResult
        }));
        return skippedResult;
      }

      const errorResult: PageVerification = {
        state: 'failed',
        summary: `Errore verifica (${errorType}): ${msg}`,
        autoRetryActive: false,
        postRetryFailed: false
      };

      // Fix race condition: Update ref immediately
      verificationMapRef.current = { ...verificationMapRef.current, [page]: errorResult };

      setVerificationMap(prev => ({
        ...prev,
        [page]: errorResult
      }));
      // If verification failed (e.g. error), do we block saving?
      // TranslationExecutor looks for severity === 'severe'.
      // If we return { state: failed }, severity is undefined -> OK.
      // So it saves. This is probably correct (fallback to saving if verification fails).
      return errorResult;
    }
  }, [aiSettings, docInputLanguage, metadata, pdfDoc, enqueueTranslation, setAnnotationMap]);

  const { enqueueVerification, queueStats, abortAll: abortAllVerifications, inFlightVerificationRef, getQueue, activePagesRef } = useVerificationQueue({
    processVerification: processVerificationInternal,
    MAX_CONCURRENT_VERIFICATIONS: 2 // O configurabile
  });


  const fixTranslation = useCallback((page: number, opts?: { forcePro?: boolean }) => {
    if (isConsultationMode) return;
    if (fixingPagesRef.current[page]) {
      log.info(`[QUALITY] fixTranslation per pagina ${page} già in corso, ignoro richiesta duplicata.`);
      return;
    }

    const report = verificationMapRef.current[page];
    if (!report || report.severity !== 'severe') {
      log.warning(`fixTranslation annullato per pagina ${page}: report non trovato o non grave.`);
      return;
    }

    fixingPagesRef.current[page] = true;
    propsRef.current.appendPageConsole(page, `Ritraduzione manuale migliorata: messa in coda.`);

    // Feedback immediato: pulizia log e stato
    propsRef.current.clearLogs(page);

    const currentText = translationMapRef.current[page] || '';
    const retryInstruction = buildRetryInstruction(report, { preservePageSplit: currentText.includes('[[PAGE_SPLIT]]') });

    // Feedback immediato: pulizia stato e segnalazione coda
    setVerificationMap(prev => {
      const next = { ...prev };
      delete next[page];
      return next;
    });

    propsRef.current.updatePageStatus(page, {
      error: false,
      loading: "Messa in coda...",
      processing: "Ritraduzione in corso..."
    });

    // Opzionale: puliamo anche la traduzione locale per forzare il refresh visivo
    setTranslationMap(prev => {
      const next = { ...prev };
      delete next[page];
      return next;
    });

    log.info(`[QUALITY] fixTranslation: accodata pagina ${page} con suggerimenti.`);

    const forcedModelOverride = opts?.forcePro
      ? (aiSettings.forceFixTranslationModel?.trim() || (aiSettings.provider === 'gemini' ? GEMINI_TRANSLATION_MODEL : ''))
      : '';

    enqueueTranslation(page, {
      priority: 'front',
      force: true,
      extraInstruction: retryInstruction,
      ...(forcedModelOverride ? { translationModelOverride: forcedModelOverride as any } : {}),
      onComplete: () => {
        log.info(`[QUALITY] fixTranslation per pagina ${page} completato, pulizia flag.`);
        delete fixingPagesRef.current[page];
      }
    });
  }, [aiSettings.forceFixTranslationModel, aiSettings.provider, enqueueTranslation, isConsultationMode, setTranslationMap, setVerificationMap]);

  const verifyAndMaybeFixTranslation = useCallback(async (args: {
    page: number;
    translatedText?: string;
    imageBase64?: string;
    prevContext?: string;
    prevPageImageBase64?: string;
    prevPageNumber?: number;
    nextPageImageBase64?: string;
    nextPageNumber?: number;
    force?: boolean;
    trigger?: 'auto' | 'manual' | 'reanalyze' | 'batch';
    bypassConcurrency?: boolean;
  }) => {
    const startedAt = Date.now();
    const queuedState: PageVerification = {
      ...(verificationMapRef.current[args.page] || {}),
      state: 'verifying',
      progress: 'In coda...',
      startedAt
    };

    verificationMapRef.current = {
      ...verificationMapRef.current,
      [args.page]: queuedState
    };

    setVerificationMap(prev => ({
      ...prev,
      [args.page]: queuedState
    }));

    return await enqueueVerification(args.page, {
      priority: args.trigger === 'manual' || args.trigger === 'reanalyze' ? 'front' : 'back',
      force: args.force,
      trigger: args.trigger,
      translatedText: args.translatedText,
      bypassConcurrency: args.bypassConcurrency,
      imageBase64: args.imageBase64,
      prevPageImageBase64: args.prevPageImageBase64,
      nextPageImageBase64: args.nextPageImageBase64
    });
  }, [enqueueVerification]);

  const verifyAllTranslatedPages = useCallback(async () => {
    if (isConsultationMode || !checkApiConfiguration(aiSettings) || !metadata) return;

    // Usiamo il ref per evitare closure stale durante il loop
    const pagesToVerify = Object.keys(translationMapRef.current)
      .map(Number)
      .filter(p => {
        const text = translationMapRef.current[p];
        const isVerified = verificationMapRef.current[p]?.state === 'verified';
        return text?.trim() && !isVerified;
      })
      .sort((a, b) => a - b);

    if (pagesToVerify.length === 0) return;

    for (let i = 0; i < pagesToVerify.length; i++) {
      const page = pagesToVerify[i];
      enqueueVerification(page, {
        priority: 'back',
        force: true,
        trigger: 'batch'
      });
    }
  }, [aiSettings, metadata, isConsultationMode, enqueueVerification]);

  const verifySingleTranslatedPage = useCallback(async (page: number, opts?: { reanalyze?: boolean }) => {
    if (isConsultationMode || !checkApiConfiguration(aiSettings) || !metadata) return;

    // Check if already verifying
    if (verificationMapRef.current[page]?.state === 'verifying') {
      log.info(`[UI] Ignorata richiesta di verifica per pagina ${page}: operazione già in corso.`);
      return;
    }

    // Check stale state via ref
    if (!opts?.reanalyze && isPageVerified(page)) return;

    if (opts?.reanalyze) {
      qualityAutoRetryCountRef.current[page] = 0;
    }

    setVerificationMap(prev => ({
      ...prev,
      [page]: {
        ...(prev[page] || {}),
        state: 'verifying',
        progress: 'In coda...'
      }
    }));

    enqueueVerification(page, {
      priority: 'front',
      force: true,
      trigger: opts?.reanalyze ? 'reanalyze' : 'manual'
    });
  }, [aiSettings, metadata, isConsultationMode, isPageVerified, enqueueVerification]);

  const forceVerificationSuccess = useCallback((page: number) => {
    const update: PageVerification = {
      state: 'verified',
      severity: 'ok',
      checkedAt: Date.now(),
      summary: 'Verifica confermata manualmente dall\'utente.',
      autoRetryActive: false,
      postRetryFailed: false,
      evidence: []
    };

    setVerificationMap(prev => ({ ...prev, [page]: update }));
    verificationMapRef.current = { ...verificationMapRef.current, [page]: update };

    setAnnotationMap(prev => {
      const next = { ...prev };
      delete next[page];
      if (propsRef.current.currentProjectFileId) {
        const fileId = propsRef.current.currentProjectFileId;
        propsRef.current.updateLibrary(fileId, { fileId, annotations: next });
      }
      return next;
    });

    if (propsRef.current.currentProjectFileId) {
      const fileId = propsRef.current.currentProjectFileId;
      const metaUpdate = { model: 'manual', savedAt: Date.now() };
      setVerificationsMeta(vm => ({ ...vm, [page]: metaUpdate }));
      propsRef.current.updateLibrary(fileId, {
        fileId,
        verifications: { [page]: update },
        verificationsMeta: { [page]: metaUpdate }
      });
    }

    propsRef.current.appendPageConsole(page, 'Verifica forzata positiva manualmente dall\'utente.');
  }, []);

  const canVerifyAll = useMemo(() => {
    if (!checkApiConfiguration(aiSettings) || !metadata) return false;
    return Object.keys(translationMapRef.current).length > 0;
  }, [aiSettings, metadata, translationMapRef]);

  const canVerifyPage = useMemo(() => !!(checkApiConfiguration(aiSettings) && metadata), [aiSettings, metadata]);

  // AUTO-RESUME: Ripresa automatica verifiche
  React.useEffect(() => {
    if (isConsultationMode || !propsRef.current.currentProjectFileId) return;
    const projectId = propsRef.current.currentProjectFileId;

    // Esegui solo se cambia il progetto (o al primo load)
    if (resumedProjectIdRef.current === projectId) return;

    // 2. Auto-Resume: Accoda pagine tradotte ma non verificate
    const pages = Object.keys(translationMapRef.current).map(Number);
    if (pages.length === 0) {
      // Se non ci sono traduzioni, forse non sono ancora caricate nel ref?
      // Non segniamo come "resumed" se è vuoto, così riproverà al prossimo render se il ref si riempie?
      // No, rischiamo loop se il progetto è davvero vuoto.
      // Ma se è vuoto, resumedProjectIdRef.current rimane null? 
      // Meglio aspettare che ci sia qualcosa?
      // Se il progetto ha 0 traduzioni, va bene segnarlo come resumed.
      resumedProjectIdRef.current = projectId;
      return;
    }

    let resumedCount = 0;
    pages.forEach(page => {
      const text = translationMapRef.current[page];
      // Check verification status (using the ref which should be synced if state updated)
      const vState = verificationMapRef.current[page];
      const isVerified = vState?.state === 'verified';

      // Se c'è testo ma non è verificato, accoda
      if (text && text.trim() && !isVerified) {
        enqueueVerification(page, {
          priority: 'back',
          trigger: 'resume',
          force: true
        });
        resumedCount++;
      }
    });

    if (resumedCount > 0) {
      propsRef.current.appendPageConsole(1, `[AUTO-RESUME] Rilevate ${resumedCount} pagine non verificate. Coda di verifica riavviata.`);
    }

    resumedProjectIdRef.current = projectId;

  }, [isConsultationMode, enqueueVerification]);

  return {
    verificationMap,
    verificationMapRef,
    setVerificationMap,
    verificationsMeta,
    setVerificationsMeta,
    verifyAndMaybeFixTranslation,
    verifyAllTranslatedPages,
    verifySingleTranslatedPage,
    forceVerificationSuccess,
    fixTranslation,
    canVerifyAll,
    canVerifyPage,
    verificationQueueStats: queueStats,
    abortAllVerifications,
    inFlightVerificationRef,
    getQueue,
    activeVerificationsRef: activePagesRef
  };
};
