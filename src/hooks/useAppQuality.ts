import React, { useState, useCallback, useMemo, useRef } from 'react';
import { AISettings, PDFMetadata, PageVerification, PageAnnotation } from '../types';
import { log } from '../services/logger';
import { verifyTranslationQuality, checkApiConfiguration } from '../services/aiService';
import { translatePage } from '../services/aiService';
import { looksLikeItalian } from '../services/aiUtils';
import { renderPageToJpegBase64 } from '../utils/pdfUtils';
import { cropBase64 } from '../utils/imageUtils';
import { ORIGINAL_THUMB_SCALE, ORIGINAL_THUMB_JPEG_QUALITY, GEMINI_VERIFIER_MODEL } from '../constants';

interface UseAppQualityProps {
  pdfDoc: any;
  metadata: PDFMetadata | null;
  aiSettings: AISettings;
  docInputLanguage: string;
  translationMapRef: React.MutableRefObject<Record<number, string>>;
  originalImagesRef: React.MutableRefObject<Record<number, string>>;
  pageRotationsRef: React.MutableRefObject<Record<number, number>>;
  pageReplacementsRef: React.MutableRefObject<Record<number, any>>;
  setTranslationMap: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  setAnnotationMap: React.Dispatch<React.SetStateAction<Record<number, PageAnnotation[]>>>;
  setTranslationsMeta: React.Dispatch<React.SetStateAction<Record<number, { model: string; savedAt: number }>>>;
  updateLibrary: (name: string, data: any) => void;
  appendPageConsole: (page: number, msg: string, data?: any) => void;
  loadReplacementPdfDoc: (path: string) => Promise<any>;
  getContextImageBase64: (page: number, section: 'top' | 'bottom' | 'full') => Promise<string | undefined>;
  enqueueTranslation: (page: number, options?: { priority: 'front' | 'back', force?: boolean, extraInstruction?: string }) => void;
}

export const useAppQuality = ({
  pdfDoc,
  metadata,
  aiSettings,
  docInputLanguage,
  translationMapRef,
  originalImagesRef,
  pageRotationsRef,
  pageReplacementsRef,
  setTranslationMap,
  setAnnotationMap,
  setTranslationsMeta,
  updateLibrary,
  appendPageConsole,
  loadReplacementPdfDoc,
  getContextImageBase64,
  enqueueTranslation
}: UseAppQualityProps) => {
  const [verificationMap, setVerificationMap] = useState<Record<number, PageVerification>>({});
  const verificationMapRef = useRef<Record<number, PageVerification>>(verificationMap);
  const [verificationsMeta, setVerificationsMeta] = useState<Record<number, { model: string; savedAt: number }>>({});
  const [verifyAllState, setVerifyAllState] = useState<{ running: boolean; current: number; total: number }>({ running: false, current: 0, total: 0 });

  const verificationRunIdRef = useRef<Record<number, number>>({});
  const inFlightVerificationRef = useRef<Record<number, AbortController>>({});
  const qualityAutoRetryCountRef = useRef<Record<number, number>>({});
  const verifyAllAbortRef = useRef<AbortController | null>(null);

  // Use refs for stable props to minimize re-creations
  const propsRef = useRef({
    updateLibrary,
    appendPageConsole,
    loadReplacementPdfDoc,
    getContextImageBase64
  });

  React.useEffect(() => {
    propsRef.current = {
      updateLibrary,
      appendPageConsole,
      loadReplacementPdfDoc,
      getContextImageBase64
    };
  }, [updateLibrary, appendPageConsole, loadReplacementPdfDoc, getContextImageBase64]);

  React.useEffect(() => { verificationMapRef.current = verificationMap; }, [verificationMap]);

  const buildRetryInstruction = useCallback((report: any) => {
    const compact = (x: any) => String(x ?? '').replace(/\s+/g, ' ').trim();
    const clip = (s: string, maxLen: number) => (s.length > maxLen ? `${s.slice(0, Math.max(0, maxLen - 1))}…` : s);

    const summaryLine = compact(report.summary);
    const evidenceList = Array.from(
      new Set((Array.isArray(report.evidence) ? (report.evidence as any[]) : []).map(compact).filter(Boolean))
    ).slice(0, 8);
    const annotationList = Array.isArray(report.annotations)
      ? (report.annotations as any[])
          .map((a: any) => {
            const type = compact(a?.type);
            const comment = compact(a?.comment);
            const originalText = compact(a?.originalText);
            const parts = [
              type ? type.toUpperCase() : '',
              comment ? clip(comment, 220) : '',
              originalText ? `Testo: «${clip(originalText, 180)}»` : ''
            ].filter(Boolean);
            return parts.join(' — ');
          })
          .filter(Boolean)
          .slice(0, 8)
      : [];

    const issuesBlocks: string[] = [];
    if (summaryLine) issuesBlocks.push(`SINTESI:\n- ${clip(summaryLine, 260)}`);
    if (evidenceList.length > 0) issuesBlocks.push(`EVIDENZE:\n- ${evidenceList.map((e: string) => clip(e, 240)).join('\n- ')}`);
    if (annotationList.length > 0) issuesBlocks.push(`ANNOTAZIONI:\n- ${annotationList.map((e: string) => clip(e, 400)).join('\n- ')}`);
    const issuesText = issuesBlocks.length > 0 ? `\n\nPROBLEMI DA CORREGGERE (dal report di verifica):\n${issuesBlocks.join('\n')}` : '';

    const retryHint = compact(report.retryHint);
    return `${retryHint ? `${retryHint}\n\n` : ''}RITRADUCI IN MODO PIÙ ACCURATO QUESTA PAGINA, TENENDO CONTO DEI PROBLEMI SEGNALATI QUI SOTTO.
- Correggi nello specifico i problemi elencati (senza introdurre nuovi errori).
- Non omettere titoli, sottosezioni, elenchi, formule, tabelle, didascalie o paragrafi.
- Mantieni numerazione di sezioni e intestazioni così come nella pagina.
- Non riassumere e non comprimere: includi TUTTO il contenuto visibile.
- Se una parola/porzione è illeggibile, usa [ILLEGIBILE] invece di saltarla.
- Output SOLO in italiano, senza meta-testo.${issuesText}`.trim();
  }, []);

  const fixTranslation = useCallback((page: number) => {
    const report = verificationMapRef.current[page];
    if (!report || report.severity !== 'severe') return;

    propsRef.current.appendPageConsole(page, `Ritraduzione manuale migliorata: messa in coda.`);
    
    const retryInstruction = buildRetryInstruction(report);

    enqueueTranslation(page, { 
      priority: 'front', 
      force: true, 
      extraInstruction: retryInstruction
    });
  }, [enqueueTranslation, buildRetryInstruction]);

  const verifyAndMaybeFixTranslation = useCallback(async (args: {
    page: number;
    translatedText: string;
    imageBase64: string;
    prevContext: string;
    prevPageImageBase64?: string;
    prevPageNumber?: number;
    nextPageImageBase64?: string;
    nextPageNumber?: number;
    force?: boolean;
    signal?: AbortSignal;
    trigger?: 'auto' | 'manual' | 'reanalyze' | 'batch';
  }) => {
    const settings = aiSettings;
    const { page, translatedText, imageBase64, prevContext, prevPageImageBase64, prevPageNumber, nextPageImageBase64, nextPageNumber, force } = args;

    if (!force && !settings.qualityCheck?.enabled) return;
    
    // 1. Pre-check: Language Detection
    const isItalian = looksLikeItalian(translatedText as string, docInputLanguage);
    if (!isItalian) {
      const retriesSoFar = qualityAutoRetryCountRef.current[page] || 0;
      if (retriesSoFar < (settings.qualityCheck?.maxAutoRetries || 1)) {
        qualityAutoRetryCountRef.current[page] = retriesSoFar + 1;
        propsRef.current.appendPageConsole(page, `Verifica lingua: rilevato testo non italiano. Messa in coda per ritraduzione forzata.`);
        enqueueTranslation(page, { 
          priority: 'front', 
          force: true, 
          extraInstruction: "L'output precedente non era in Italiano. TRADUCI INTERAMENTE IN ITALIANO. Non lasciare testo in lingua originale." 
        });
        return;
      }
    }

    // 2. Full Quality Verification
    const apiKey = settings.provider === 'gemini' ? settings.gemini.apiKey.trim() : settings.openai.apiKey.trim();
    if (!apiKey) return;

    const verifierModel = settings.qualityCheck?.verifierModel || 
                         (settings.provider === 'gemini' ? GEMINI_VERIFIER_MODEL : settings.openai.model);
    
    const nextRunId = (verificationRunIdRef.current[page] || 0) + 1;
    verificationRunIdRef.current[page] = nextRunId;

    const existing = inFlightVerificationRef.current[page];
    if (existing) {
      try { existing.abort(); } catch { }
      propsRef.current.appendPageConsole(page, `Verifica qualità: annullo richiesta precedente (nuovo run=${nextRunId})`);
    }
    const controller = new AbortController();
    inFlightVerificationRef.current[page] = controller;

    // Link external signal to our internal controller
    if (args.signal) {
      if (args.signal.aborted) {
        controller.abort();
        return;
      }
      args.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    const startedAt = Date.now();
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
      `Verifica qualità: avvio (run=${nextRunId}, motivo=${args.trigger || 'auto'}, provider=${settings.provider}, model=${verifierModel})`
    );

    // Fetch context images if not provided
    let finalPrevImg = prevPageImageBase64;
    let finalNextImg = nextPageImageBase64;
    
    updateProgress('Caricamento contesto…');
    propsRef.current.appendPageConsole(page, `Verifica qualità: carico contesto pagine vicine…`);
    if (!finalPrevImg && page > 1) {
      finalPrevImg = await propsRef.current.getContextImageBase64(page - 1, 'bottom');
    }
    const totalPages = pdfDoc?.numPages || metadata?.totalPages || 0;
    if (!finalNextImg && totalPages > 0 && page < totalPages) {
      finalNextImg = await propsRef.current.getContextImageBase64(page + 1, 'top');
    }

    const makeId = () => (globalThis.crypto && 'randomUUID' in globalThis.crypto ? (globalThis.crypto as any).randomUUID() : Math.random().toString(36).slice(2));

    try {
      updateProgress('Invio richiesta al modello…');
      propsRef.current.appendPageConsole(page, `Verifica qualità: invio richiesta al modello…`);
      const report = await verifyTranslationQuality({
        translatedText,
        imageBase64,
        pageNumber: page,
        prevPageImageBase64: finalPrevImg,
        prevPageNumber: page > 1 ? page - 1 : undefined,
        nextPageImageBase64: finalNextImg,
        nextPageNumber: (totalPages > 0 && page < totalPages) ? page + 1 : undefined,
        settings,
        signal: controller.signal
      });

      if (!report) throw new Error("Errore durante la verifica qualità.");

      if (verificationRunIdRef.current[page] !== nextRunId) return;

      updateProgress('Elaborazione risposta…');
      propsRef.current.appendPageConsole(page, `Verifica qualità: ${(report.severity || 'ok').toUpperCase()}${report.summary ? ` — ${report.summary}` : ''}`);
      
      const annotations = (report.annotations || []).map((a) => ({ id: makeId(), originalText: a.originalText, comment: a.comment, type: a.type } as PageAnnotation));
      setAnnotationMap(prev => {
        const next = { ...prev };
        if (annotations.length > 0) next[page] = annotations;
        else delete next[page];
        
        if (metadata) {
          Promise.resolve().then(() => propsRef.current.updateLibrary(metadata.name, { annotations: next }));
        }
        return next;
      });

      if (report.severity === 'severe') {
        const retriesSoFar = qualityAutoRetryCountRef.current[page] || 0;
        const configuredMaxRetries = settings.qualityCheck?.maxAutoRetries ?? 0;
        if (retriesSoFar < configuredMaxRetries) {
          qualityAutoRetryCountRef.current[page] = retriesSoFar + 1;
          propsRef.current.appendPageConsole(page, `Ritraduzione automatica: messa in coda (tentativo ${retriesSoFar + 1}/${configuredMaxRetries})`);

          const retryInstruction = buildRetryInstruction(report);

          const queuedCheckedAt = Date.now();
          const queuedSummary = `${report.summary ? `${report.summary} — ` : ''}Ritraduzione automatica in coda (tentativo ${retriesSoFar + 1}/${configuredMaxRetries}).`;
          const queuedUpdate: PageVerification = {
            ...report,
            severity: 'severe',
            state: 'verified',
            checkedAt: queuedCheckedAt,
            summary: queuedSummary,
            postRetryFailed: false
          };
          setVerificationMap(prev => ({ ...prev, [page]: queuedUpdate }));
          if (metadata) {
            const metaUpdate = { model: verifierModel, savedAt: queuedCheckedAt };
            setVerificationsMeta(vm => ({ ...vm, [page]: metaUpdate }));
            Promise.resolve().then(() => {
              propsRef.current.updateLibrary(metadata.name, {
                verifications: { [page]: queuedUpdate },
                verificationsMeta: { [page]: metaUpdate }
              });
            });
          }

          // Re-enqueue with the retry hint from verifier
          enqueueTranslation(page, { 
            priority: 'front', 
            force: true, 
            extraInstruction: retryInstruction
          });
          
          // The queue will handle the rest. We can stop here for this run.
          return;
        }
      }

      const vUpdate: PageVerification = {
        ...report,
        severity: report.severity || 'ok',
        state: 'verified',
        checkedAt: Date.now(),
        postRetryFailed: false
      };
      setVerificationMap(prev => ({
        ...prev,
        [page]: vUpdate
      }));
      
      if (metadata) {
        const savedAt = Date.now();
        const metaUpdate = { model: verifierModel, savedAt };
        setVerificationsMeta(vm => ({ ...vm, [page]: metaUpdate }));
        
        Promise.resolve().then(() => {
          propsRef.current.updateLibrary(metadata.name, { 
            verifications: { [page]: vUpdate },
            verificationsMeta: { [page]: metaUpdate } 
          });
        });
      }
    } catch (err: any) {
      if (verificationRunIdRef.current[page] !== nextRunId) return;
      if (controller.signal.aborted || err?.name === 'AbortError') {
        propsRef.current.appendPageConsole(page, `Verifica qualità: annullata (run=${nextRunId})`);
        setVerificationMap(prev => ({ ...prev, [page]: { state: 'idle' } }));
        return;
      }
      const msg = err?.message || 'Errore sconosciuto';
      propsRef.current.appendPageConsole(page, `Verifica qualità: errore (run=${nextRunId}) — ${msg}`);
      setVerificationMap(prev => ({ ...prev, [page]: { state: 'failed', summary: msg } }));
    } finally {
      if (verificationRunIdRef.current[page] === nextRunId) delete inFlightVerificationRef.current[page];
    }
  }, [aiSettings, docInputLanguage, metadata, pdfDoc, setTranslationMap, setAnnotationMap, setTranslationsMeta]);

  const verifyAllTranslatedPages = useCallback(async () => {
    if (verifyAllState.running || !checkApiConfiguration(aiSettings) || !metadata) return;

    const pagesToVerify = Object.keys(translationMapRef.current)
      .map(Number)
      .filter(p => translationMapRef.current[p]?.trim() && verificationMap[p]?.state !== 'verified')
      .sort((a, b) => a - b);

    if (pagesToVerify.length === 0) return;

    const controller = new AbortController();
    verifyAllAbortRef.current = controller;
    setVerifyAllState({ running: true, current: 0, total: pagesToVerify.length });

    try {
      for (let i = 0; i < pagesToVerify.length; i++) {
        if (controller.signal.aborted) break;
        const page = pagesToVerify[i];
        setVerifyAllState(s => ({ ...s, current: i + 1 }));

        const imageBase64 = await getContextImageBase64(page, 'full');
        if (!imageBase64) continue;

        await verifyAndMaybeFixTranslation({
          page,
          translatedText: translationMapRef.current[page],
          imageBase64,
          prevContext: translationMapRef.current[page - 1] || '',
          force: true,
          trigger: 'batch'
        });
      }
    } finally {
      verifyAllAbortRef.current = null;
      setVerifyAllState(s => ({ ...s, running: false }));
    }
  }, [aiSettings.gemini.apiKey, metadata, pdfDoc, translationMapRef, verificationMap, verifyAndMaybeFixTranslation, originalImagesRef, pageReplacementsRef, pageRotationsRef, loadReplacementPdfDoc]);

  const verifySingleTranslatedPage = useCallback(async (page: number, opts?: { reanalyze?: boolean }) => {
    if (!aiSettings.gemini.apiKey.trim() || !metadata) return;
    if (!opts?.reanalyze && verificationMap[page]?.state === 'verified') return;

    const translatedText = translationMapRef.current[page];
    if (!translatedText?.trim()) return;

    propsRef.current.appendPageConsole(
      page,
      opts?.reanalyze ? 'Verifica qualità: rianalisi richiesta (forzo nuova verifica)' : 'Verifica qualità: verifica manuale richiesta'
    );

    const imageBase64 = await getContextImageBase64(page, 'full');
    if (!imageBase64) return;

    if (opts?.reanalyze) {
      qualityAutoRetryCountRef.current[page] = 0;
    }

    await verifyAndMaybeFixTranslation({
      page,
      translatedText,
      imageBase64,
      prevContext: translationMapRef.current[page - 1] || '',
      force: true,
      trigger: opts?.reanalyze ? 'reanalyze' : 'manual'
    });
  }, [aiSettings.gemini.apiKey, metadata, pdfDoc, translationMapRef, verificationMap, verifyAndMaybeFixTranslation, originalImagesRef, pageReplacementsRef, pageRotationsRef, loadReplacementPdfDoc]);

  const canVerifyAll = useMemo(() => {
    if (verifyAllState.running || !checkApiConfiguration(aiSettings) || !metadata) return false;
    return Object.keys(translationMapRef.current).length > 0;
  }, [verifyAllState.running, aiSettings, metadata, translationMapRef]);

  const canVerifyPage = useMemo(() => !!(checkApiConfiguration(aiSettings) && metadata), [aiSettings, metadata]);

  return {
    verificationMap,
    verificationMapRef,
    setVerificationMap,
    verificationsMeta,
    setVerificationsMeta,
    verifyAllState,
    verifyAndMaybeFixTranslation,
    verifyAllTranslatedPages,
    verifySingleTranslatedPage,
    fixTranslation,
    canVerifyAll,
    canVerifyPage
  };
};
