import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { log } from './services/logger';
import pkg from '../package.json';

// Types
import { AISettings, PDFMetadata, PageReplacement, PageAnnotation } from './types';
import { extractPdfMetadata } from './services/geminiService';

// Components
import { Header } from './components/Header';
import { ControlsBar } from './components/ControlsBar';
import { ReaderView } from './components/ReaderView';
import {
  PAGE_RENDER_TIMEOUT_MS,
} from './constants';
import { ImageCropModal } from './components/ImageCropModal';
import { SettingsModal } from './components/SettingsModal';
import { UploadLanguagePrompt } from './components/UploadLanguagePrompt';
import { RenameModal } from './components/RenameModal';
import { PageSelectionModal } from './components/PageSelectionModal';
import { CreateGroupModal } from './components/CreateGroupModal';
import { GroupManagementModal } from './components/GroupManagementModal';
import { SimpleConfirmModal } from './components/SimpleConfirmModal';
import { HomeView } from './components/HomeView';
import { SimplifiedReader } from './components/SimplifiedReader';
import { MainToolbar } from './components/MainToolbar';
import { PagePreviewStrip } from './components/PagePreviewStrip';

// Hooks
import { useAiSettings } from './hooks/useAiSettings';
import { useInputLanguageDefault } from './hooks/useInputLanguageDefault';
import { useSearch } from './hooks/useSearch';
import { useProjectManagement } from './hooks/useProjectManagement';
import { useAppLibrary } from './hooks/useAppLibrary';
import { useAppTranslation } from './hooks/useAppTranslation';
import { useAppQuality } from './hooks/useAppQuality';
import { useAppAnnotations } from './hooks/useAppAnnotations';

// Utils
import {
  loadReplacementPdfDoc,
  renderDocPageToJpeg,
  renderPageToJpegBase64,
  renderPageOntoCanvas
} from './utils/pdfUtils';
import { withTimeout } from './utils/async';
import { safeCopy } from './utils/clipboard';
import {
  buildJpegDataUrlFromBase64,
  rotateJpegBase64,
  cropBase64
} from './utils/imageUtils';
import { projectFileIdFromName, computeFileId } from './utils/fileUtils';

// Configuriamo il worker localmente (copiato in public/pdfjs durante il build/dev)
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs/pdf.worker.min.mjs';

const App: React.FC = () => {
  const sessionId = useMemo(() => Math.random().toString(36).slice(2, 10), []);
  const verboseLogs = useMemo(() => localStorage.getItem('verbose_logs') !== '0', []);

  // --- Core State ---
  const [pdfDoc, setPdfDoc] = useState<any>(null);

  // --- Refs ---
  const originalImagesRef = useRef<Record<number, string>>({});
  const croppedImagesRef = useRef<Record<number, string>>({});
  const pageRotationsRef = useRef<Record<number, number>>({});
  const pageReplacementsRef = useRef<Record<number, PageReplacement>>({});
  const pageImagesIndexRef = useRef<{ sources: Record<number, string>; crops: Record<number, string> }>({ sources: {}, crops: {} });
  const annotationMapRef = useRef<Record<number, PageAnnotation[]>>({});
  const renderTaskRef = useRef<{ [key: string]: any }>({});
  const latestPageRef = useRef<{ [key: string]: number }>({});
  const pageTraceRef = useRef<Record<number, { t0: number; seq: number; traceId: string }>>({});
  const cachedReplacementDocsRef = useRef<Record<string, any>>({});
  const batchRunIdRef = useRef<number>(0);
  const isPausedRef = useRef<boolean>(false);
  const pendingAutoStartRef = useRef<{ page: number; language: string } | null>(null);
  const autoTranslateTimerRef = useRef<number | null>(null);
  const draggableRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRefRight = useRef<HTMLCanvasElement>(null);
  const canvasRef3 = useRef<HTMLCanvasElement>(null);
  const canvasRef4 = useRef<HTMLCanvasElement>(null);
  const canvasRef5 = useRef<HTMLCanvasElement>(null);
  const allRefs = [canvasRef, canvasRefRight, canvasRef3, canvasRef4, canvasRef5];

  // --- PDF Cleanup ---
  useEffect(() => {
    return () => {
      if (pdfDoc) {
        log.step("Cleanup: Distruzione documento PDF precedente...");
        try {
          pdfDoc.destroy().catch(() => { });
        } catch { }
      }
      // Pulizia anche dei PDF sostitutivi in cache
      Object.values(cachedReplacementDocsRef.current).forEach(doc => {
        try { (doc as any).destroy().catch(() => { }); } catch { }
      });
      cachedReplacementDocsRef.current = {};
    };
  }, [pdfDoc]);

  const getCachedReplacementPdfDoc = useCallback(async (filePath: string) => {
    if (cachedReplacementDocsRef.current[filePath]) {
      return cachedReplacementDocsRef.current[filePath];
    }
    const doc = await loadReplacementPdfDoc(filePath);

    // Cap resources: if we have more than 5 cached docs, destroy the oldest one
    const keys = Object.keys(cachedReplacementDocsRef.current);
    if (keys.length >= 5) {
      const oldestKey = keys[0];
      const oldestDoc = cachedReplacementDocsRef.current[oldestKey];
      try {
        log.step(`Capping cache: Distruzione documento PDF obsoleto: ${oldestKey}`);
        oldestDoc.destroy().catch(() => { });
      } catch { }
      delete cachedReplacementDocsRef.current[oldestKey];
    }

    cachedReplacementDocsRef.current[filePath] = doc;
    return doc;
  }, []);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(() => {
    const raw = localStorage.getItem('page_scale');
    const s = raw ? Number(raw) : 1.2;
    return Math.max(0.3, Math.min(5, Number.isFinite(s) ? s : 1.2));
  });
  const [renderScale, setRenderScale] = useState<number>(scale);
  const [metadata, setMetadata] = useState<PDFMetadata | null>(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isManualMode, setIsManualMode] = useState<boolean>(false);
  const [isTranslatedMode, setIsTranslatedMode] = useState<boolean>(false);
  const [isHomeView, setIsHomeView] = useState(true);
  const [isReaderMode, setIsReaderMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'single' | 'side-by-side'>('single');
  const [showPreviewStrip, setShowPreviewStrip] = useState<boolean>(false);
  const [previewThumbnails, setPreviewThumbnails] = useState<Record<number, string>>({});
  const [previewPage, setPreviewPage] = useState<number | null>(null);
  const [copiedPage, setCopiedPage] = useState<number | null>(null);
  const [notesPage, setNotesPage] = useState<number | null>(null);
  const [brightness, setBrightness] = useState<number>(() => {
    const raw = localStorage.getItem('reader_brightness');
    const n = raw ? Number(raw) : 1;
    return Math.max(0.4, Math.min(1.6, Number.isFinite(n) ? n : 1));
  });
  const [temperature, setTemperature] = useState<number>(() => {
    const raw = localStorage.getItem('reader_temperature');
    const n = raw ? Number(raw) : 0;
    return Math.max(-100, Math.min(100, Number.isFinite(n) ? n : 0));
  });
  const [translationTheme, setTranslationTheme] = useState<'light' | 'sepia' | 'dark'>(() => {
    const raw = localStorage.getItem('translation_theme');
    return (raw === 'light' || raw === 'sepia' || raw === 'dark') ? raw : 'dark';
  });

  const { aiSettings, isSettingsOpen, setIsSettingsOpen, saveSettings, isApiConfigured } = useAiSettings();

  const { defaultLang, setDefaultLang } = useInputLanguageDefault();
  const [docInputLanguage, setDocInputLanguage] = useState<string>(defaultLang || 'tedesco');

  useEffect(() => {
    const t = window.setTimeout(() => setRenderScale(scale), 140);
    return () => window.clearTimeout(t);
  }, [scale]);

  // Sync docInputLanguage with defaultLang when not in a session
  useEffect(() => {
    if (!pdfDoc && !metadata) {
      setDocInputLanguage(defaultLang || 'tedesco');
    }
  }, [defaultLang, pdfDoc, metadata]);

  const [originalImages, setOriginalImages] = useState<Record<number, string>>({});
  const [croppedImages, setCroppedImages] = useState<Record<number, string>>({});
  const [pageRotations, setPageRotations] = useState<Record<number, number>>({});
  const [pageReplacements, setPageReplacements] = useState<Record<number, PageReplacement>>({});
  const [pageImagesIndex, setPageImagesIndex] = useState<{ sources: Record<number, string>; crops: Record<number, string> }>({ sources: {}, crops: {} });
  const [annotationMap, setAnnotationMap] = useState<Record<number, PageAnnotation[]>>({});
  const [geminiLogs, setGeminiLogs] = useState<Record<number, string>>({});
  const [pageDims, setPageDims] = useState<Record<number, { width: number, height: number }>>({});

  const [bottomBarHeight, setBottomBarHeight] = useState<number>(24);
  const [showControls, setShowControls] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [cropModal, setCropModal] = useState<null | { page: number; src: string }>(null);
  const [uploadPromptOpen, setUploadPromptOpen] = useState<boolean>(false);
  const [editLanguagePromptOpen, setEditLanguagePromptOpen] = useState<boolean>(false);
  const [pendingUpload, setPendingUpload] = useState<null | any>(null);
  const [createGroupModalOpen, setCreateGroupModalOpen] = useState(false);
  const [activeGroupModalBookId, setActiveGroupModalBookId] = useState<string | null>(null);
  const [renameState, setRenameState] = useState<null | any>(null);
  const [pageSelectionModal, setPageSelectionModal] = useState<any>({ isOpen: false, total: 0, targetPage: 0 });
  const [pendingReplacement, setPendingReplacement] = useState<any>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type?: 'danger' | 'info' | 'alert';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { }
  });

  const showConfirm = useCallback((title: string, message: string, onConfirm: () => void, type: 'danger' | 'info' | 'alert' = 'info') => {
    setConfirmModal({ isOpen: true, title, message, onConfirm, type });
  }, []);

  // --- Hook Initialization ---
  const library = useAppLibrary(metadata, docInputLanguage, showConfirm, setIsSaving);

  // --- Pre-scansione dimensioni pagine ---
  useEffect(() => {
    if (!pdfDoc || !metadata?.name) return;

    let isMounted = true;
    const scanDims = async () => {
      try {
        const totalPages = pdfDoc.numPages;
        const currentDims = pageDims;
        const newDims: Record<number, { width: number, height: number }> = {};

        // Priority: current page and neighbors
        const priorityPages = [currentPage];
        if (currentPage > 1) priorityPages.push(currentPage - 1);
        if (currentPage < totalPages) priorityPages.push(currentPage + 1);

        let changed = false;
        for (const p of priorityPages) {
          if (!currentDims[p]) {
            const page = await pdfDoc.getPage(p);
            const userRotation = pageRotations[p] || 0;
            const baseRotation = (((page?.rotate || 0) + userRotation) % 360 + 360) % 360;
            const viewport = page.getViewport({ scale: 1, rotation: baseRotation });
            newDims[p] = { width: viewport.width, height: viewport.height };
            changed = true;
          }
        }

        if (changed && isMounted) {
          setPageDims(prev => ({ ...prev, ...newDims }));
          void library.updateLibrary(metadata.name, { pageDims: { ...currentDims, ...newDims } });
        }

        // Background scanning for other pages in small batches
        if (isMounted) {
          const others = [];
          for (let i = 1; i <= totalPages; i++) {
            if (!currentDims[i] && !newDims[i]) others.push(i);
          }

          if (others.length > 0) {
            // Wait a bit before background scanning
            await new Promise(r => setTimeout(r, 2000));
            if (!isMounted) return;

            const batchSize = 10;
            for (let i = 0; i < others.length; i += batchSize) {
              const batch = others.slice(i, i + batchSize);
              const batchDims: Record<number, { width: number, height: number }> = {};
              for (const p of batch) {
                if (!isMounted) return;
                try {
                  const page = await pdfDoc.getPage(p);
                  const userRotation = pageRotations[p] || 0;
                  const baseRotation = (((page?.rotate || 0) + userRotation) % 360 + 360) % 360;
                  const viewport = page.getViewport({ scale: 1, rotation: baseRotation });
                  batchDims[p] = { width: viewport.width, height: viewport.height };
                } catch { }
              }

              if (isMounted && Object.keys(batchDims).length > 0) {
                setPageDims(prev => {
                  const merged = { ...prev, ...batchDims };
                  void library.updateLibrary(metadata!.name, { pageDims: merged });
                  return merged;
                });
                // Throttle background batches
                await new Promise(r => setTimeout(r, 1000));
              }
            }
          }
        }
      } catch (e) {
        log.error("Errore durante la scansione delle dimensioni del PDF", e);
      }
    };

    void scanDims();
    return () => { isMounted = false; };
  }, [pdfDoc, metadata?.name, currentPage]);

  // Sync refs
  useEffect(() => { originalImagesRef.current = originalImages; }, [originalImages]);
  useEffect(() => { croppedImagesRef.current = croppedImages; }, [croppedImages]);
  useEffect(() => { pageRotationsRef.current = pageRotations; }, [pageRotations]);
  useEffect(() => { pageReplacementsRef.current = pageReplacements; }, [pageReplacements]);
  useEffect(() => { pageImagesIndexRef.current = pageImagesIndex; }, [pageImagesIndex]);
  useEffect(() => { annotationMapRef.current = annotationMap; }, [annotationMap]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  useEffect(() => {
     if (!isTranslatedMode && !isReaderMode) return;
     if (!currentPage || (!library.currentProjectFileId && !pdfDoc)) return;
 
     const ensureImageLoaded = async (p: number) => {
       if (originalImages[p]) return;
       
       // 1. Prova a caricare dal disco se disponibile nell'indice
       const relPath = pageImagesIndex.sources[p];
       if (relPath && library.currentProjectFileId) {
         try {
           const res = await window.electronAPI.readProjectImageBase64({ 
             fileId: library.currentProjectFileId!, 
             relPath 
           });
           if (res.success && res.base64) {
             const dataUrl = buildJpegDataUrlFromBase64(res.base64);
             setOriginalImages(prev => ({ ...prev, [p]: dataUrl }));
             return;
           }
         } catch (e) {
           console.error(`Failed to load original image from disk for page ${p}`, e);
         }
       }

       // 2. Se non è sul disco ma abbiamo il PDF, caricalo/generalo al volo
       if (pdfDoc) {
         try {
           const base64 = await renderPageToJpegBase64(p, {
             pdfDoc,
             pageReplacementsRef,
             pageRotationsRef,
             loadReplacementPdfDoc: getCachedReplacementPdfDoc
           }, { scale: 1.5, jpegQuality: 0.7 });
           
           const dataUrl = buildJpegDataUrlFromBase64(base64);
           setOriginalImages(prev => ({ ...prev, [p]: dataUrl }));
         } catch (e) {
           console.error(`Failed to render original image from PDF for page ${p}`, e);
         }
       }
     };
 
     void ensureImageLoaded(currentPage);
   }, [currentPage, isTranslatedMode, isReaderMode, pageImagesIndex.sources, library.currentProjectFileId, originalImages, pdfDoc, getCachedReplacementPdfDoc]);

  // --- Image Cache Cleanup (RAM Optimization) ---
  useEffect(() => {
    if (!currentPage) return;
    const windowSize = 30; // Manteniamo 30 pagine di buffer per lato

    const cleanup = (prev: Record<number, string>) => {
      const keys = Object.keys(prev).map(Number);
      if (keys.length <= windowSize * 2) return prev;

      const next = { ...prev };
      let cleaned = 0;
      for (const p of keys) {
        if (Math.abs(p - currentPage) > windowSize) {
          delete next[p];
          cleaned++;
        }
      }
      return cleaned > 0 ? next : prev;
    };

    setOriginalImages(cleanup);
    setCroppedImages(cleanup);
    setPreviewThumbnails(cleanup);
  }, [currentPage]);

  const annotations = useAppAnnotations(metadata, library.updateLibrary);

  // Forward references to bridge hooks
  const translationMapRef = useRef<Record<number, string>>({});

  // Helper Methods
  const ensurePreviewThumbnail = useCallback(async (p: number) => {
    if (previewThumbnails[p] || !pdfDoc) return previewThumbnails[p] || null;
    try {
      const result = await renderDocPageToJpeg(pdfDoc, p, { scale: 0.2 });
      const dataUrl = typeof result === 'string' ? result : result.dataUrl;
      setPreviewThumbnails((prev: Record<number, string>) => ({ ...prev, [p]: dataUrl }));
      return dataUrl;
    } catch { return null; }
  }, [pdfDoc, previewThumbnails]);

  const appendPageConsole = useCallback((page: number, msg: string, data?: unknown) => {
    const trace = pageTraceRef.current[page];
    if (trace) trace.seq += 1;
    const now = performance.now();
    const elapsedMs = trace ? Math.round(now - trace.t0) : undefined;
    const tid = trace?.traceId || `${sessionId}-p${page}`;
    const seqLabel = trace?.seq === undefined ? '---' : String(trace.seq).padStart(3, '0');
    const elapsedLabel = elapsedMs === undefined ? '---' : String(elapsedMs);
    const line = `${new Date().toLocaleTimeString()}  [${tid}] [#${seqLabel} +${elapsedLabel}ms] ${msg}`;

    setGeminiLogs((prev: Record<number, string>) => {
      const existing = prev[page] || "";
      const next = (existing ? `${existing}\n` : "") + line;
      return { ...prev, [page]: next.length > 12000 ? next.slice(-12000) : next };
    });
    if (verboseLogs) {
      log.step(`TRACE p${page} #${trace?.seq ?? '---'} +${elapsedMs ?? '---'}ms`, { sessionId, traceId: trace?.traceId, msg, data });
    }
  }, [sessionId, verboseLogs]);

  const getContextImageBase64 = useCallback(async (pageNum: number, section: 'top' | 'bottom' | 'full' = 'full'): Promise<string | undefined> => {
    let fullBase64: string | undefined = undefined;
    const cropExisting = croppedImagesRef.current?.[pageNum];
    if (cropExisting && cropExisting.includes(',')) {
      fullBase64 = cropExisting.split(',')[1];
    } else {
      const existing = originalImagesRef.current?.[pageNum];
      if (existing && existing.includes(',')) {
        fullBase64 = existing.split(',')[1];
      }
    }

    if (!fullBase64 && !pdfDoc) {
      const fileName = metadata?.name;
      if (fileName) {
        const fileId = library.currentProjectFileId || projectFileIdFromName(fileName);
        const cropRel = pageImagesIndexRef.current?.crops?.[pageNum];
        const sourceRel = pageImagesIndexRef.current?.sources?.[pageNum];
        const rel = cropRel || sourceRel;
        if (rel) {
          try {
            const res = await window.electronAPI.readProjectImageBase64({ fileId, relPath: rel });
            fullBase64 = res.base64;
          } catch { }
        }
      }
    }

    if (!fullBase64 && pdfDoc) {
      const thumbCanvas = document.createElement('canvas');
      try {
        const replacement = pageReplacementsRef.current?.[pageNum];
        const doc = replacement?.filePath ? await getCachedReplacementPdfDoc(replacement.filePath) : pdfDoc;
        const srcPage = replacement?.filePath ? replacement.sourcePage : pageNum;
        const p: any = await withTimeout<any>(doc.getPage(srcPage), PAGE_RENDER_TIMEOUT_MS);
        const uRot = pageRotationsRef.current?.[pageNum] || 0;
        const rot = (((p?.rotate || 0) + uRot) % 360 + 360) % 360;
        const viewport = p.getViewport({ scale: 1.3, rotation: rot });
        thumbCanvas.width = viewport.width;
        thumbCanvas.height = viewport.height;
        const ctx = thumbCanvas.getContext('2d', { alpha: false });
        if (ctx) {
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
        }
        const task = p.render({ canvasContext: ctx as any, viewport });
        await withTimeout(task.promise, PAGE_RENDER_TIMEOUT_MS);
        const dataUrl = thumbCanvas.toDataURL('image/jpeg', 0.62);
        fullBase64 = dataUrl.split(',')[1];
      } catch { fullBase64 = undefined; } finally { thumbCanvas.width = 0; thumbCanvas.height = 0; }
    }

    if (!fullBase64) return undefined;
    if (section === 'full') return fullBase64;
    return cropBase64(fullBase64, section, 0.4);
  }, [pdfDoc, metadata, library.currentProjectFileId, getCachedReplacementPdfDoc]);

  const translation = useAppTranslation({
    pdfDoc, metadata, aiSettings, docInputLanguage,
    updateLibrary: library.updateLibrary,
    appendPageConsole,
    verifyAndMaybeFixTranslation: (args: any) => quality.verifyAndMaybeFixTranslation(args),
    setAnnotationMap,
    originalImagesRef, pageRotationsRef, pageReplacementsRef, pageImagesIndexRef,
    pageTraceRef, geminiLogs, setGeminiLogs,
    setOriginalImages, setCroppedImages, croppedImagesRef,
    setPageDims,
    readProjectImageBase64: async (args: any) => window.electronAPI.readProjectImageBase64(args).then((r: any) => r.base64),
    readProjectImageDataUrl: async (args: any) => window.electronAPI.readProjectImage(args).then((r: any) => r.dataUrl),
    saveSourceForPage: async (args: any) => {
      let buffer: Uint8Array | undefined;
      const dataUrl = args.sourceDataUrl || args.dataUrl;
      if (dataUrl && dataUrl.startsWith('data:')) {
        const base64 = dataUrl.split(',')[1];
        const binary = atob(base64);
        buffer = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          buffer[i] = binary.charCodeAt(i);
        }
      }
      const res = await window.electronAPI.saveProjectImage({
        ...args,
        buffer,
        kind: 'source',
        fileId: library.currentProjectFileId || ''
      });
      setPageImagesIndex((prev: any) => ({ ...prev, sources: { ...prev.sources, [args.page]: res.relPath } }));
    },
    getContextImageBase64,
    sessionId, verboseLogs,
    isPaused,
    currentProjectFileId: library.currentProjectFileId,
    loadReplacementPdfDoc: getCachedReplacementPdfDoc,
    renderDocPageToJpeg
  });

  const quality = useAppQuality({
    pdfDoc, metadata, aiSettings, docInputLanguage,
    translationMapRef,
    originalImagesRef, pageRotationsRef, pageReplacementsRef,
    setTranslationMap: translation.setTranslationMap,
    setAnnotationMap,
    setTranslationsMeta: translation.setTranslationsMeta,
    updateLibrary: library.updateLibrary,
    appendPageConsole,
    loadReplacementPdfDoc: getCachedReplacementPdfDoc,
    getContextImageBase64,
    enqueueTranslation: (page: number, options?: any) => translation.enqueueTranslation(page, options)
  });

  // Link quality hook with translation state
  useEffect(() => {
    translationMapRef.current = translation.translationMap;
  }, [translation.translationMap]);

  const { redoAllPages, retryAllErrors, scanAndRenameOldFiles, scanAndRenameAllFiles } = useProjectManagement({
    pdfDoc, setPdfDoc, metadata, setMetadata, recentBooks: library.recentBooks, setRecentBooks: library.setRecentBooks,
    aiSettings, refreshLibrary: library.refreshLibrary,
    updateLibrary: library.updateLibrary,
    setTranslationMap: translation.setTranslationMap,
    setAnnotationMap,
    setVerificationMap: quality.setVerificationMap,
    setPageStatus: translation.setPageStatus,
    setGeminiLogs,
    enqueueTranslation: translation.enqueueTranslation,
    setIsTranslatedMode,
    setIsPaused,
    readProjectImageBase64: async (args: any) => window.electronAPI.readProjectImageBase64(args).then((r: any) => r.base64),
    translationMapRef,
    annotationMapRef,
    pageStatusRef: translation.pageStatusRef,
    verificationMapRef: quality.verificationMapRef,
    showConfirm,
    ensurePageImageSaved: async (page: number) => {
      try {
        if (!metadata?.name) return null;
        let rel = pageImagesIndexRef.current?.sources?.[page];
        if (rel) return await window.electronAPI.readProjectImageBase64({ fileId: library.currentProjectFileId || projectFileIdFromName(metadata.name), relPath: rel }).then((r: any) => r.base64);

        // If not found, render and save
        log.info(`Generating missing source image for page ${page} for rename scan...`);
        const base64 = await renderPageToJpegBase64(page, {
          pdfDoc,
          pageReplacementsRef,
          pageRotationsRef,
          loadReplacementPdfDoc
        }, { scale: 2.1, jpegQuality: 0.88 });
        await translation.saveSourceForPage({ page, sourceDataUrl: `data:image/jpeg;base64,${base64}` });
        return base64;
      } catch (e) {
        log.error(`EnsurePageImageSaved failed for page ${page}`, e);
        return null;
      }
    }
  });

  const search = useSearch(translation.translationMap, currentPage, (p: number) => setCurrentPage(p), metadata?.name);

  const normalizePageNumber = useCallback((pageValue: unknown, totalValue?: unknown) => {
    const raw = Number(pageValue);
    const total = Number(totalValue);
    let page = Number.isFinite(raw) ? Math.floor(raw) : 1;
    if (page < 1) page = 1;
    if (Number.isFinite(total) && total > 0) {
      page = Math.min(page, Math.floor(total));
    }
    return page;
  }, []);

  const resetProjectState = useCallback(() => {
    try { translation.abortAll(); } catch { }
    translation.setTranslationMap({});
    translation.setTranslationsMeta({});
    translation.setPageStatus({});
    translation.setPartialTranslations({});
    quality.setVerificationMap({});
    quality.setVerificationsMeta({});
    setAnnotationMap({});
    annotations.setUserHighlights({});
    annotations.setUserNotes({});

    setOriginalImages({});
    originalImagesRef.current = {};
    setCroppedImages({});
    croppedImagesRef.current = {};
    setPreviewThumbnails({});
    setGeminiLogs({});
    pageTraceRef.current = {};
    setPageDims({});
    setPageImagesIndex({ sources: {}, crops: {} });
    pageImagesIndexRef.current = { sources: {}, crops: {} };
    setPageRotations({});
    pageRotationsRef.current = {};
    setPageReplacements({});
    pageReplacementsRef.current = {};

    setPreviewPage(null);
    setNotesPage(null);
    setCopiedPage(null);
    search.setActiveResultId(null);
  }, [annotations, quality, search, translation]);

  // --- Handlers ---
  const handleSearchResultSelect = useCallback((item: any) => {
    setCurrentPage(item.page);
    search.setActiveResultId(item.id);
    // Auto-switch to translated mode to see the match
    setIsTranslatedMode(true);
  }, [search.setActiveResultId]);

  const handleOpenProject = useCallback(async (fileId: string) => {
    try {
      if (!fileId || fileId === 'undefined') return;
      library.setCurrentProjectFileId(fileId);
      log.step(`Caricamento progetto dal disco (${fileId})...`);
      if (!window.electronAPI) throw new Error('Contesto Electron non rilevato');

      const data = await window.electronAPI.loadTranslation(fileId);
      if (!data) {
        log.error('Dati progetto non trovati per:', fileId);
        return;
      }
      setDocInputLanguage((data as any).inputLanguage || defaultLang || 'tedesco');

      // Reset project-specific states to avoid pollution
      setIsBatchProcessing(false);
      setIsPaused(false);
      resetProjectState();

      const loadedSources = (data.pageImages?.sources && typeof data.pageImages.sources === 'object') ? data.pageImages.sources : {};
      const loadedCrops = (data.pageImages?.crops && typeof data.pageImages.crops === 'object') ? data.pageImages.crops : {};
      setPageImagesIndex({ sources: loadedSources, crops: loadedCrops });
      pageImagesIndexRef.current = { sources: loadedSources, crops: loadedCrops };

      const loadedRotations = (data.rotations && typeof data.rotations === 'object') ? data.rotations : {};
      setPageRotations(loadedRotations);
      pageRotationsRef.current = loadedRotations;

      const loadedReplacements = (data.pageReplacements && typeof data.pageReplacements === 'object') ? data.pageReplacements : {};
      setPageReplacements(loadedReplacements);
      pageReplacementsRef.current = loadedReplacements;

      const loadedDims = (data.pageDims && typeof data.pageDims === 'object') ? data.pageDims : {};
      setPageDims(loadedDims);

      translation.setTranslationMap(data.translations || {});
      translation.setTranslationsMeta(data.translationsMeta || {});
      annotations.setUserHighlights(data.userHighlights || {});
      annotations.setUserNotes(data.userNotes || {});
      quality.setVerificationMap(data.verifications || {});
      quality.setVerificationsMeta(data.verificationsMeta || {});
      setAnnotationMap(data.annotations || {});
      setCurrentPage(normalizePageNumber((data as any).lastPage ?? 1, (data as any).totalPages));

      setIsReaderMode(true);
      setIsHomeView(false);

      // Load PDF
      const pdfPathRes = await window.electronAPI.getOriginalPdfPath(fileId);
      let pdfPath = (pdfPathRes?.success && pdfPathRes?.path) ? pdfPathRes.path : data.originalFilePath;
      if (pdfPathRes?.success && pdfPathRes?.path && !data.originalFilePath) {
        try {
          await library.updateLibrary(data.fileName, { fileId, originalFilePath: pdfPathRes.path, hasSafePdf: true });
        } catch { }
      }
      if ((!pdfPathRes?.success || !pdfPathRes?.path) && data.originalFilePath) {
        try {
          const recopyRes = await window.electronAPI.copyOriginalPdf({ fileId, sourcePath: data.originalFilePath });
          if (recopyRes?.success && recopyRes?.path) pdfPath = recopyRes.path;
        } catch { }
      }
      if ((!pdfPathRes?.success || !pdfPathRes?.path) && !pdfPath) {
        try {
          const picked = await window.electronAPI.openFileDialog();
          if (picked) {
            const recopyRes = await window.electronAPI.copyOriginalPdf({ fileId, sourcePath: picked });
            if (recopyRes?.success && recopyRes?.path) {
              pdfPath = recopyRes.path;
              await library.updateLibrary(data.fileName, { fileId, originalFilePath: pdfPath, hasSafePdf: true });
              library.refreshLibrary();
            }
          }
        } catch { }
      }

      if (pdfPath) {
        try {
          const buffer = await window.electronAPI.readPdfFile(pdfPath);
          const pdf = await pdfjsLib.getDocument({
            data: buffer,
            cMapUrl: './pdfjs/cmaps/',
            cMapPacked: true,
            standardFontDataUrl: './pdfjs/standard_fonts/'
          }).promise;
          setPdfDoc(pdf);
          setMetadata({ name: data.fileName, size: 0, totalPages: pdf.numPages });
          setIsReaderMode(false);

          // Generate thumbnail if missing
          if (!loadedSources[1]) {
            try {
              const page = await pdf.getPage(1);
              const viewport = page.getViewport({ scale: 1.5 });
              const canvas = document.createElement('canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                await (page as any).render({ canvasContext: ctx, viewport }).promise;
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                const res = await window.electronAPI.saveProjectImage({
                  fileId,
                  page: 1,
                  kind: 'source',
                  dataUrl
                });
                if (res.success) {
                  setPageImagesIndex(prev => ({ ...prev, sources: { ...prev.sources, [1]: 'source-p1.jpg' } }));
                  pageImagesIndexRef.current.sources[1] = 'source-p1.jpg';
                  // Force refresh library to show thumbnail in home
                  library.refreshLibrary();
                }
              }
              canvas.width = 0; canvas.height = 0;
            } catch (e) { console.error("Failed to generate missing thumbnail", e); }
          }
        } catch (err) {
          log.warning("PDF originale non trovato o corrotto. Apertura in modalità 'Solo Testo'.");
          setPdfDoc(null);
          setMetadata({ name: data.fileName, size: 0, totalPages: data.totalPages || 0 });
          setIsReaderMode(true);
        }
      } else {
        setPdfDoc(null);
        setMetadata({ name: data.fileName, size: 0, totalPages: data.totalPages || 0 });
        setIsReaderMode(true);
      }
    } catch (e) {
      log.error("Errore apertura progetto", e);
    }
  }, [library, defaultLang, translation, annotations, quality]);

  const continueUploadWithLanguage = useCallback(async (file: File, lang: string, groups?: string[]) => {
    const fileName = file.name;

    try {
      log.step(`Avvio elaborazione PDF: ${fileName} (Lingua: ${lang})...`);
      const buffer = await file.arrayBuffer();
      const pdfParseBuffer = buffer.slice(0);
      const safeSaveBuffer = buffer.slice(0);
      const pdf = await pdfjsLib.getDocument({
        data: pdfParseBuffer,
        cMapUrl: './pdfjs/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: './pdfjs/standard_fonts/'
      }).promise;

      setPdfDoc(pdf);
      setMetadata({ name: fileName, size: buffer.byteLength, totalPages: pdf.numPages });
      setDocInputLanguage(lang);
      setIsHomeView(false);
      const canTranslate = Boolean(isApiConfigured);
      setIsTranslatedMode(canTranslate);
      setIsManualMode(!canTranslate);
      setIsPaused(!canTranslate);
      setIsReaderMode(false);
      setCurrentPage(1);
      setPreviewPage(null);
      setNotesPage(null);

      // Initial reset for new session
      resetProjectState();
      if (!canTranslate) {
        showConfirm(
          "API non configurate",
          "Hai caricato il PDF correttamente, ma per avviare la traduzione serve una API key nelle Impostazioni.",
          () => setIsSettingsOpen(true),
          'alert'
        );
      }

      // Copy PDF and create project
      if (window.electronAPI) {
        const fileId = computeFileId(fileName, (file as any).path || '');
        let finalPath: string | undefined = undefined;
        let hasSafePdf = false;
        const sourcePath = (file as any).path;
        try {
          window.electronAPI.logToMain?.({
            level: 'info',
            message: 'Upload PDF: avvio salvataggio copia safe',
            meta: {
              fileName,
              fileId,
              sourcePathPresent: Boolean(sourcePath),
              saveOriginalPdfBufferType: typeof (window.electronAPI as any)?.saveOriginalPdfBuffer,
              copyOriginalPdfType: typeof (window.electronAPI as any)?.copyOriginalPdf
            }
          });
        } catch { }
        try {
          if (sourcePath) {
            const copyRes = await window.electronAPI.copyOriginalPdf({ fileId, sourcePath });
            if (copyRes?.success && copyRes?.path) {
              finalPath = copyRes.path;
              hasSafePdf = true;
              try {
                window.electronAPI.logToMain?.({
                  level: 'info',
                  message: 'Upload PDF: copia da path riuscita',
                  meta: { fileId, targetPath: copyRes.path }
                });
              } catch { }
            } else {
              try {
                window.electronAPI.logToMain?.({
                  level: 'warn',
                  message: 'Upload PDF: copia da path fallita',
                  meta: { fileId, sourcePathPresent: Boolean(sourcePath), error: copyRes?.error }
                });
              } catch { }
            }
          }
        } catch (e) {
          try {
            window.electronAPI.logToMain?.({
              level: 'error',
              message: 'Upload PDF: eccezione durante copia da path',
              meta: { fileId, sourcePathPresent: Boolean(sourcePath), error: (e as any)?.message || String(e) }
            });
          } catch { }
        }
        if (!finalPath) {
          try {
            const saveRes = await window.electronAPI.saveOriginalPdfBuffer({ fileId, buffer: new Uint8Array(safeSaveBuffer) });
            if (saveRes?.success && saveRes?.path) {
              finalPath = saveRes.path;
              hasSafePdf = true;
              try {
                window.electronAPI.logToMain?.({
                  level: 'info',
                  message: 'Upload PDF: salvataggio da buffer riuscito',
                  meta: { fileId, targetPath: saveRes.path, bytes: safeSaveBuffer.byteLength }
                });
              } catch { }
            } else {
              try {
                window.electronAPI.logToMain?.({
                  level: 'warn',
                  message: 'Upload PDF: salvataggio da buffer fallito',
                  meta: { fileId, bytes: safeSaveBuffer.byteLength, error: saveRes?.error }
                });
              } catch { }
            }
          } catch (e) {
            try {
              window.electronAPI.logToMain?.({
                level: 'error',
                message: 'Upload PDF: eccezione durante salvataggio da buffer',
                meta: { fileId, bytes: safeSaveBuffer.byteLength, error: (e as any)?.message || String(e) }
              });
            } catch { }
          }
        }
        if (!finalPath) finalPath = sourcePath;
        if (!hasSafePdf) {
          try {
            window.electronAPI.logToMain?.({
              level: 'error',
              message: 'Upload PDF: copia safe non creata (nessun path finale)',
              meta: { fileId, sourcePathPresent: Boolean(sourcePath) }
            });
          } catch { }
        }

        await library.updateLibrary(fileName, {
          fileId,
          originalFilePath: finalPath,
          hasSafePdf,
          totalPages: pdf.numPages,
          inputLanguage: lang,
          groups: groups || []
        });
        library.setCurrentProjectFileId(fileId);

        // Metadata detection & Thumbnail generation
        try {
          const images: string[] = [];
          for (let i = 1; i <= Math.min(3, pdf.numPages); i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              await (page as any).render({ canvasContext: ctx, viewport }).promise;
              const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
              const base64 = dataUrl.split(',')[1];
              images.push(base64);
              
              // Save first page as thumbnail/source-p1
              if (i === 1) {
                await window.electronAPI.saveProjectImage({
                  fileId,
                  page: 1,
                  kind: 'source',
                  dataUrl
                });
                setPageImagesIndex((prev: any) => ({ ...prev, sources: { ...prev.sources, [1]: 'source-p1.jpg' } }));
              }
            }
            canvas.width = 0; canvas.height = 0;
          }

          if (images.length > 0 && aiSettings.gemini.apiKey.trim()) {
            try {
              const meta = await extractPdfMetadata(aiSettings.gemini.apiKey, aiSettings.gemini.model, images);
              const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9\s]/g, '').trim();
              if (meta.author && meta.title && meta.author !== 'Unknown' && meta.title !== 'Untitled') {
                const y = meta.year && meta.year !== '0000' && meta.year !== 'Unknown' ? sanitize(meta.year) : "";
                const a = sanitize(meta.author);
                const t = sanitize(meta.title);
                const newName = y ? `${y}_${a}_${t}` : `${a}_${t}`;

                if (newName.length > 5 && newName !== fileName) {
                  const res = await window.electronAPI.renameTranslation({ fileId, newFileName: newName });
                  if (res?.success) {
                    log.success(`Rinomina automatica: ${newName}`);
                    setMetadata(prev => prev ? ({ ...prev, name: newName }) : prev);
                    const newId = computeFileId(newName, finalPath);
                    library.setCurrentProjectFileId(newId);
                    library.refreshLibrary();
                  }
                }
              }
            } catch (e) { log.error("Errore autodetect metadati", e); }
          }
        } catch (e) { log.error("Errore generazione anteprima/metadati", e); }

      }
    } catch (e) {
      log.error("Errore caricamento PDF", e);
    }
  }, [aiSettings, library, translation, annotations, quality, isApiConfigured, showConfirm, setIsSettingsOpen]);

  const renderPage = useCallback(async (pageNum: number, cRef: React.RefObject<HTMLCanvasElement | null>) => {
    if (!pdfDoc || !cRef.current) return;
    const canvas = cRef.current;
    const refIdx = allRefs.indexOf(cRef as any);
    const canvasKey = refIdx !== -1 ? `canvas_${refIdx}` : 'default';
    latestPageRef.current[canvasKey] = pageNum;
    if (renderTaskRef.current[canvasKey]) {
      try {
        renderTaskRef.current[canvasKey].cancel();
        await renderTaskRef.current[canvasKey].promise.catch(() => { });
      } catch { }
    }
    try {
      const dims = await renderPageOntoCanvas(
        pageNum,
        canvas,
        {
          pdfDoc,
          pageReplacementsRef,
          pageRotationsRef,
          loadReplacementPdfDoc: getCachedReplacementPdfDoc
        },
        { scale: renderScale }
      );
      if (dims) {
        setPageDims(prev => ({ ...prev, [pageNum]: { width: dims.width, height: dims.height } }));
      }
    } catch (e: any) {
      if (e?.name !== 'RenderingCancelledException' && !e?.message?.includes('cancelled')) {
        log.error(`Errore render pagina ${pageNum}`, e);
      }
    }
  }, [pdfDoc, renderScale, getCachedReplacementPdfDoc]);

  const handleExport = useCallback(async () => {
    if (!library.currentProjectFileId) {
      log.warning("Nessun progetto aperto da esportare.");
      return;
    }
    try {
      const result = await window.electronAPI.exportProjectPackage({ fileId: library.currentProjectFileId });
      if (result.success) {
        log.success("Esportazione progetto completata.");
      } else if (result.error) {
        log.error("Errore esportazione progetto", result.error);
      }
    } catch (e) { log.error("Errore fatale esportazione", e); }
  }, [library.currentProjectFileId]);

  const handleExportPdf = useCallback(async () => {
    if (!metadata?.name) {
      log.warning("Metadati progetto mancanti.");
      return;
    }
    try {
      const pages = Object.entries(translation.translationMap)
        .map(([num, text]) => ({
          pageNumber: Number(num),
          text,
          highlights: annotations.userHighlights[Number(num)] || [],
          userNotes: annotations.userNotes[Number(num)] || []
        }))
        .sort((a, b) => a.pageNumber - b.pageNumber);

      if (pages.length === 0) {
        log.warning("Nessuna pagina tradotta da esportare.");
        return;
      }

      const result = await window.electronAPI.exportTranslationsPdf({
        bookName: metadata.name,
        pages,
        pageDims,
        exportOptions: aiSettings.exportOptions
      });

      if (result.success) {
        log.success("Esportazione PDF completata.");
      } else if (result.error) {
        log.error("Errore esportazione PDF", result.error);
      }
    } catch (e) { log.error("Errore fatale esportazione PDF", e); }
  }, [metadata, translation.translationMap, annotations.userHighlights, annotations.userNotes, pageDims, aiSettings.exportOptions]);

  const handleExportById = useCallback(async (fileId: string) => {
    try {
      const result = await window.electronAPI.exportProjectPackage({ fileId });
      if (result.success) {
        log.success("Esportazione progetto completata.");
      } else if (result.error) {
        log.error("Errore esportazione progetto", result.error);
      }
    } catch (e) { log.error("Errore esportazione", e); }
  }, []);

  const handleImportProject = useCallback(async () => {
    try {
      const importedId = await window.electronAPI.importProjectPackage();
      if (importedId) {
        log.success('Progetto importato con successo!');
        library.refreshLibrary();
        await handleOpenProject(importedId);
      }
    } catch (e) { log.error("Errore importazione", e); }
  }, [library, handleOpenProject]);

  const handleRotatePage = useCallback(async (page: number, deg: number) => {
    const current = pageRotations[page] || 0;
    const next = (current + deg) % 360;
    setPageRotations(prev => ({ ...prev, [page]: next }));

    // If we have a cached image, we should rotate it or clear it
    if (originalImages[page]) {
      const rotated = await rotateJpegBase64(originalImages[page].split(',')[1], deg);
      const newUrl = buildJpegDataUrlFromBase64(rotated);
      setOriginalImages(prev => ({ ...prev, [page]: newUrl }));
    }
  }, [pageRotations, originalImages]);

  const handleCropPage = useCallback((page: number) => {
    const src = originalImages[page] || "";
    if (src) setCropModal({ page, src });
  }, [originalImages]);

  const handleClearCrop = useCallback(async (page: number) => {
    const relPath = pageImagesIndex.crops[page];
    if (relPath && library.currentProjectFileId) {
      try {
        await window.electronAPI.deleteProjectImage({ fileId: library.currentProjectFileId, relPath });
      } catch (e) { log.error("Errore eliminazione ritaglio", e); }
    }
    setCroppedImages((prev: Record<number, string>) => {
      const next = { ...prev };
      delete next[page];
      return next;
    });
    setPageImagesIndex((prev: any) => {
      const next = { ...prev, crops: { ...prev.crops } };
      delete next.crops[page];
      return next;
    });
  }, [pageImagesIndex, library.currentProjectFileId]);

  const handleReplacePage = useCallback(async (page: number) => {
    try {
      const filePath = await window.electronAPI.openFileDialog();
      if (filePath) {
        const doc = await getCachedReplacementPdfDoc(filePath);
        setPendingReplacement({ page, filePath, doc, totalPages: doc.numPages });
        setPageSelectionModal({ isOpen: true, total: doc.numPages, targetPage: page });
      }
    } catch (e) { log.error("Errore sostituzione pagina", e); }
  }, [getCachedReplacementPdfDoc]);

  const handleRetryPage = useCallback((page: number) => {
    if (!isApiConfigured) {
      showConfirm(
        "API non configurate",
        "Per avviare la traduzione serve una API key nelle Impostazioni.",
        () => setIsSettingsOpen(true),
        'alert'
      );
      return;
    }
    translation.retranslatePage(page);
  }, [isApiConfigured, showConfirm, translation, setIsSettingsOpen]);

  const handleRetranslatePages = useCallback((pages: number[]) => {
    if (!isApiConfigured) {
      showConfirm(
        "API non configurate",
        "Per ritradurre le pagine serve una API key nelle Impostazioni.",
        () => setIsSettingsOpen(true),
        'alert'
      );
      return;
    }
    pages.forEach(p => translation.retranslatePage(p));
  }, [isApiConfigured, showConfirm, translation, setIsSettingsOpen]);

  const handleRetryAllCritical = useCallback(() => {
    if (!isApiConfigured) {
      showConfirm(
        "API non configurate",
        "Per riprovare le pagine con errori serve una API key nelle Impostazioni.",
        () => setIsSettingsOpen(true),
        'alert'
      );
      return;
    }
    retryAllErrors();
  }, [isApiConfigured, showConfirm, setIsSettingsOpen, retryAllErrors]);

  // --- Effects ---
  useEffect(() => {
    const next = pendingAutoStartRef.current;
    if (!next) return;
    if (!pdfDoc) return;
    if (isManualMode) return;
    if (!isApiConfigured) return;
    if (docInputLanguage.trim().toLowerCase() !== next.language.trim().toLowerCase()) return;
    pendingAutoStartRef.current = null;
    translation.retranslatePage(next.page);
  }, [pdfDoc, isManualMode, isApiConfigured, docInputLanguage, translation]);

  useEffect(() => {
    if (autoTranslateTimerRef.current) {
      window.clearTimeout(autoTranslateTimerRef.current);
      autoTranslateTimerRef.current = null;
    }
    if (isHomeView) return;
    if (isManualMode) return;
    if (isPaused) return;
    if (!isApiConfigured) return;

    const total = pdfDoc?.numPages || metadata?.totalPages || 0;
    if (total <= 0) return;

    const rawPrefetch = localStorage.getItem('auto_prefetch_pages');
    const parsedPrefetch = rawPrefetch ? Number(rawPrefetch) : 2;
    const prefetchPages = Math.max(0, Math.min(10, Number.isFinite(parsedPrefetch) ? Math.floor(parsedPrefetch) : 2));

    const visiblePages = viewMode === 'side-by-side'
      ? [currentPage, currentPage + 1].filter(p => p >= 1 && p <= total)
      : [currentPage].filter(p => p >= 1 && p <= total);
    const visibleSet = new Set<number>(visiblePages);
    const basePage = visiblePages.length ? Math.max(...visiblePages) : currentPage;

    const pagesToRequest = new Set<number>(visiblePages);
    for (let i = 1; i <= prefetchPages; i += 1) {
      const p = basePage + i;
      if (p > total) break;
      pagesToRequest.add(p);
    }

    autoTranslateTimerRef.current = window.setTimeout(() => {
      const ordered = Array.from(pagesToRequest).sort((a, b) => a - b);
      for (const p of ordered) {
        const already = translation.shouldSkipTranslation(p);
        if (already) continue;
        const hasError = Boolean(translation.pageStatusRef.current?.[p]?.error);
        if (hasError) continue;
        translation.enqueueTranslation(p, { priority: visibleSet.has(p) ? 'front' : 'back' });
      }
    }, 260);

    return () => {
      if (autoTranslateTimerRef.current) {
        window.clearTimeout(autoTranslateTimerRef.current);
        autoTranslateTimerRef.current = null;
      }
    };
  }, [
    currentPage,
    viewMode,
    pdfDoc,
    metadata,
    isHomeView,
    isManualMode,
    isPaused,
    isApiConfigured,
    translation.enqueueTranslation,
    translation.shouldSkipTranslation,
    translation.pageStatusRef,
    translation.translationMap
  ]);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Menù contestuali (Home)
      if (openMenuId && !target.closest('.menu-container') && !target.closest('.menu-trigger')) {
        setOpenMenuId(null);
      }

      // Controlli luminosità
      if (showControls && !target.closest('.controls-container') && !target.closest('.controls-trigger')) {
        setShowControls(false);
      }

      // Barra di ricerca
      if (search.searchOpen && !target.closest('.search-container') && !target.closest('.search-trigger')) {
        search.setSearchOpen(false);
      }
    };
    window.addEventListener('mousedown', handleGlobalClick);
    return () => window.removeEventListener('mousedown', handleGlobalClick);
  }, [openMenuId, showControls, search.searchOpen, search]);

  useEffect(() => {
    if (showPreviewStrip && pdfDoc) {
      void (async () => {
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          if (previewThumbnails[i]) continue;
          await ensurePreviewThumbnail(i);
        }
      })();
    }
  }, [showPreviewStrip, pdfDoc, previewThumbnails, ensurePreviewThumbnail]);

  useEffect(() => {
    if (!isBatchProcessing) return;
    if (isManualMode) {
      setIsBatchProcessing(false);
      return;
    }
    if (!pdfDoc) { setIsBatchProcessing(false); return; }
    if (!isApiConfigured) {
      showConfirm(
        "API non configurate",
        "Impossibile avviare 'Traduci tutto' senza una API key. Apri Impostazioni per configurarla.",
        () => setIsSettingsOpen(true),
        'alert'
      );
      setIsBatchProcessing(false);
      return;
    }

    const runId = batchRunIdRef.current + 1;
    batchRunIdRef.current = runId;
    const total = pdfDoc.numPages || 0;
    const startPage = currentPage;

    log.step("Traduci tutto avviato", { totalPages: total, startPage });

    const order: number[] = [];
    for (let p = startPage; p <= total; p += 1) order.push(p);
    for (let p = 1; p < startPage; p += 1) order.push(p);

    order.forEach(p => {
      const already = typeof translation.translationMap[p] === 'string' && translation.translationMap[p].trim().length > 0;
      const hasError = Boolean(translation.pageStatus[p]?.error);
      if (!already && !hasError) translation.enqueueTranslation(p, { priority: 'back' });
    });

    const intervalId = window.setInterval(() => {
      if (batchRunIdRef.current !== runId) return;
      if (isPausedRef.current) {
        setIsBatchProcessing(false);
        return;
      }

      let remaining = 0;
      for (let p = 1; p <= total; p += 1) {
        const done = (typeof translation.translationMap[p] === 'string' && translation.translationMap[p].trim().length > 0) || Boolean(translation.pageStatus[p]?.error);
        if (!done) remaining += 1;
      }

      const active = translation.queueStats.active;
      if (remaining === 0 && active === 0) {
        setIsBatchProcessing(false);
        log.success("Traduci tutto completato.");
      }
    }, 500);

    return () => {
      window.clearInterval(intervalId);
      batchRunIdRef.current += 1;
    };
  }, [isBatchProcessing, pdfDoc, isApiConfigured, currentPage, translation, showConfirm, setIsSettingsOpen]);

  const getPageStatus = useCallback((p: number) => {
    if (translation.pageStatus[p]?.error) return 'error';
    if (translation.pageStatus[p]?.processing === 'Elaborazione' || translation.pageStatus[p]?.loading) return 'in_progress';
    if (translation.translationMap[p]) return 'done';
    return 'pending';
  }, [translation]);

  const hasSession = Boolean(pdfDoc || (metadata && metadata.totalPages > 0) || isReaderMode);
  const showHome = !hasSession || isHomeView;
  const totalPages = pdfDoc?.numPages || metadata?.totalPages || 0;

  useEffect(() => {
    const isEditableTarget = (el: Element | null) => {
      if (!el) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      const htmlEl = el as HTMLElement;
      return Boolean(htmlEl.isContentEditable);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (showHome) return;
      if (totalPages <= 0) return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (search.searchOpen) return;
      if (isEditableTarget(document.activeElement)) return;

      if (
        isSettingsOpen ||
        uploadPromptOpen ||
        editLanguagePromptOpen ||
        Boolean(renameState) ||
        createGroupModalOpen ||
        Boolean(activeGroupModalBookId) ||
        Boolean(cropModal) ||
        Boolean(pendingReplacement) ||
        Boolean(pageSelectionModal?.isOpen) ||
        Boolean(confirmModal?.isOpen) ||
        previewPage != null ||
        notesPage != null
      ) {
        return;
      }

      const step = viewMode === 'side-by-side' ? 2 : 1;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentPage((p) => Math.max(1, p - step));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentPage((p) => Math.min(totalPages, p + step));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    showHome,
    totalPages,
    viewMode,
    search.searchOpen,
    isSettingsOpen,
    uploadPromptOpen,
    editLanguagePromptOpen,
    renameState,
    createGroupModalOpen,
    activeGroupModalBookId,
    cropModal,
    pendingReplacement,
    pageSelectionModal,
    confirmModal,
    previewPage,
    notesPage
  ]);

  const translatedCount = Object.keys(translation.translationMap).length;
  const workingCount = Object.values(translation.pageStatus).filter(s => s.loading || s.processing).length;
  const statusBadge = workingCount > 0
    ? `In corso: ${workingCount}`
    : translatedCount > 0
      ? `Tradotte: ${translatedCount}/${totalPages}`
      : null;

  const allPages = useMemo(() => {
    const arr = [];
    for (let i = 1; i <= totalPages; i++) arr.push(i);
    return arr;
  }, [totalPages]);

  const canvasRefsMap = useMemo(() => {
    const map: Record<number, React.RefObject<HTMLCanvasElement | null>> = {};
    if (totalPages === 0) return map;

    // Assegna fino a 5 canvas alle pagine vicine a quella corrente
    const centerRaw = Number(currentPage);
    const center = (Number.isFinite(centerRaw) && centerRaw >= 1) ? Math.floor(centerRaw) : 1;
    const range = [center - 2, center - 1, center, center + 1, center + 2]
      .filter(p => p >= 1 && p <= totalPages);

    range.forEach((p, idx) => {
      if (allRefs[idx]) map[p] = allRefs[idx];
    });

    return map;
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (totalPages <= 0) return;
    setCurrentPage((p: any) => normalizePageNumber(p, totalPages));
  }, [totalPages, normalizePageNumber]);

  useEffect(() => {
    if (isHomeView) {
      setBottomBarHeight(24);
      return;
    }
    const el = draggableRef.current;
    if (!el) return;
    const update = () => {
      try {
        const h = el.offsetHeight || 0;
        setBottomBarHeight(h);
      } catch { }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const onResize = () => update();
    window.addEventListener('resize', onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [isHomeView]);

  useEffect(() => {
    if (pdfDoc) {
      Object.entries(canvasRefsMap).forEach(([p, ref]) => {
        renderPage(Number(p), ref);
      });
    }
  }, [pdfDoc, canvasRefsMap, renderScale, renderPage, pageRotations]);

  useEffect(() => {
    localStorage.setItem('reader_brightness', String(brightness));
  }, [brightness]);

  useEffect(() => {
    localStorage.setItem('reader_temperature', String(temperature));
  }, [temperature]);

  useEffect(() => {
    localStorage.setItem('translation_theme', translationTheme);
  }, [translationTheme]);

  useEffect(() => {
    localStorage.setItem('page_scale', String(scale));
  }, [scale]);

  return (
    <div className="w-screen flex flex-col bg-[#1e1e1e] text-gray-200 overflow-hidden font-sans select-none" style={{ height: '100dvh' }}>
      <Header
        showActions={!showHome}
        hasSession={hasSession}
        metadata={metadata}
        isBatchProcessing={isBatchProcessing}
        isPaused={isPaused}
        viewMode={viewMode}
        scale={scale}
        canVerifyAll={quality.canVerifyAll}
        verifyAllRunning={quality.verifyAllState.running}
        verifyAllCurrent={quality.verifyAllState.current}
        verifyAllTotal={quality.verifyAllState.total}
        brightness={brightness}
        temperature={temperature}
        onBatch={() => { setIsTranslatedMode(true); setIsPaused(false); setIsBatchProcessing(true); }}
        onExport={handleExport}
        onExportPdf={handleExportPdf}
        onImportProject={handleImportProject}
        onSettings={() => setIsSettingsOpen(true)}
        onVerifyAll={quality.verifyAllTranslatedPages}
        searchFilters={search.filters}
        onSearchFilterChange={search.setFilter}
        searchResults={search.searchResults}
        onSearchResultSelect={handleSearchResultSelect}
        statusBadge={statusBadge}
        onToggleView={() => setViewMode(v => v === 'single' ? 'side-by-side' : 'single')}
        onScale={setScale}
        onBrightnessChange={setBrightness}
        onTemperatureChange={setTemperature}
        onToggleControls={() => setShowControls(!showControls)}
        onRedoAll={redoAllPages}
        onReset={() => setIsHomeView(!isHomeView)}
        searchOpen={search.searchOpen}
        searchTerm={search.searchTerm}
        onSearchToggle={search.toggleSearch}
        onSearchChange={search.setSearchTerm}
        searchTotal={search.totalHits}
        onSearchNext={search.goToNextSearch}
        onSearchPrev={search.goToPrevSearch}
        currentLanguage={docInputLanguage}
        onLanguageClick={() => setEditLanguagePromptOpen(true)}
        isSaving={isSaving}
      />

      {showControls && (
        <ControlsBar
          brightness={brightness} temperature={temperature} translationTheme={translationTheme} scale={scale}
          onScale={setScale} onBrightnessChange={setBrightness} onTemperatureChange={setTemperature} onThemeChange={setTranslationTheme}
        />
      )}

      <main className="flex-1 relative bg-[#121212] flex flex-col overflow-hidden" style={{ filter: `brightness(${brightness})` }}>
        {/* Overlay Temperatura Colore (Caldo/Freddo) */}
        {temperature !== 0 && (
          <div
            className="pointer-events-none absolute inset-0 z-[180] transition-colors duration-300"
            style={{
              backgroundColor: temperature > 0
                ? `rgba(255, 120, 0, ${Math.abs(temperature) * 0.0015})`
                : `rgba(0, 120, 255, ${Math.abs(temperature) * 0.0015})`,
            }}
          />
        )}
        {showHome ? (
          <HomeView
            hasSession={hasSession}
            metadata={metadata}
            docInputLanguage={docInputLanguage}
            currentPage={currentPage}
            recentBooks={library.recentBooks}
            availableGroups={library.availableGroups}
            selectedGroupFilters={library.selectedGroupFilters}
            currentProjectFileId={library.currentProjectFileId}
            isDragging={isDragging}
            isApiConfigured={isApiConfigured}
            openMenuId={openMenuId}
            pkgVersion={pkg.version}
            onCloseSession={() => {
              setPdfDoc(null);
              setMetadata(null);
              setIsReaderMode(false);
              library.setCurrentProjectFileId(null);
              resetProjectState();
            }}
            onReturnToSession={() => setIsHomeView(false)}
            onBrowseClick={() => fileInputRef.current?.click()}
            onDragOver={(e: any) => { e.preventDefault(); if (!isDragging) setIsDragging(true); }}
            onDragLeave={(e: any) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={(e: any) => {
              e.preventDefault();
              setIsDragging(false);
              const files = Array.from(e.dataTransfer.files) as File[];
              const file = files[0];
              if (file) {
                if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
                  setPendingUpload({ file });
                  setUploadPromptOpen(true);
                } else {
                  showConfirm(
                    "Formato non supportato",
                    "Spiacenti, è possibile caricare solo file in formato PDF.",
                    () => { },
                    'alert'
                  );
                }
              }
            }}
            onImportProject={handleImportProject}
            onOpenProject={handleOpenProject}
            onRenameProject={(id: string, name: string, e: any) => { e?.stopPropagation(); setRenameState({ fileId: id, currentName: name }); }}
            onDeleteProject={async (id: string, e: any) => {
              e?.stopPropagation();
              const deleted = await library.deleteProject(id);
              if (deleted && library.currentProjectFileId === id) {
                setPdfDoc(null);
                setMetadata(null);
                setIsReaderMode(false);
                library.setCurrentProjectFileId(null);
                resetProjectState();
              }
            }}
            onToggleGroupFilter={library.toggleGroupFilter}
            onCreateGroup={() => setCreateGroupModalOpen(true)}
            onSetOpenMenuId={setOpenMenuId}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onManageGroups={setActiveGroupModalBookId}
            onExportGpt={handleExportById}
            onDeleteGroup={library.deleteGroup}
          />
        ) : (
          <ReaderView
            pages={allPages}
            pdfDoc={pdfDoc}
            currentPage={currentPage}
            navigationMode="flip"
            viewMode={viewMode}
            pageDims={pageDims}
            scale={scale}
            isTranslatedMode={isTranslatedMode || isReaderMode}
            isManualMode={isManualMode}
            previewPage={previewPage}
            onPreviewPageChange={setPreviewPage}
            onOpenOriginalPage={(p: number) => {
              setPreviewPage(null);
              setCurrentPage(p);
              setViewMode('single');
              setIsTranslatedMode(false);
              setIsReaderMode(false);
            }}
            onActivePageChange={(p: number) => setCurrentPage(p)}
            onPageClick={(p: number) => {
              if (pdfDoc && p >= 1 && p <= pdfDoc.numPages) {
                setCurrentPage(p);
              }
            }}
            translationMap={translation.translationMap}
            annotationMap={annotationMap}
            verificationMap={quality.verificationMap}
            pageStatus={translation.pageStatus}
            isPaused={isPaused}
            copiedPage={copiedPage}
            translationLogs={geminiLogs}
            partialTranslations={translation.partialTranslations}
            originalImages={originalImages}
            croppedImages={croppedImages}
            canvasRefs={[]}
            canvasRefsMap={canvasRefsMap}
            onRetry={handleRetryPage}
            onStop={translation.stopTranslation}
            onCopy={(p: number) => {
              safeCopy(translation.translationMap[p] || '');
              setCopiedPage(p);
              window.setTimeout(() => setCopiedPage(null), 2000);
            }}
            onRotatePage={(p: number) => handleRotatePage(p, 90)}
            onCropPage={handleCropPage}
            onClearCrop={handleClearCrop}
            onReplacePage={handleReplacePage}
            onVerifyPage={quality.verifySingleTranslatedPage}
            onReanalyzePage={(p: number) => quality.verifySingleTranslatedPage(p, { reanalyze: true })}
            onFixPage={quality.fixTranslation}
            onRetryAllCritical={handleRetryAllCritical}
            onScaleChange={setScale}
            showConfirm={showConfirm}
            bottomPadding={bottomBarHeight + 24}
            translationTheme={translationTheme}
            notesPage={notesPage}
            onSetNotesPage={setNotesPage}
            searchTerm={search.searchTerm}
            activeResultId={search.activeResultId}
            translationsMeta={translation.translationsMeta}
            verificationsMeta={quality.verificationsMeta}
            userHighlights={annotations.userHighlights}
            userNotes={annotations.userNotes}
            onAddHighlight={annotations.addUserHighlight}
            onRemoveHighlight={annotations.removeUserHighlight}
            onAddNote={annotations.addUserNote}
            onUpdateNote={annotations.updateUserNote}
            onRemoveNote={annotations.removeUserNote}
          />
        )}

        {!showHome && previewPage == null && (
          <MainToolbar
            draggableRef={draggableRef}
            currentPage={currentPage}
            totalPages={totalPages}
            viewMode={viewMode}
            queueStats={translation.queueStats}
            isPaused={isPaused}
            isTranslatedMode={isTranslatedMode}
            isManualMode={isManualMode}
            previewPage={previewPage}
            verificationMap={quality.verificationMap}
            annotationMap={annotationMap}
            translationMap={translation.translationMap}
            currentPages={viewMode === 'side-by-side' ? [currentPage, currentPage + 1].filter(p => p <= totalPages) : [currentPage]}
            onPrevPage={() => setCurrentPage((p: number) => Math.max(1, p - (viewMode === 'side-by-side' ? 2 : 1)))}
            onNextPage={() => setCurrentPage((p: number) => Math.min(totalPages, p + (viewMode === 'side-by-side' ? 2 : 1)))}
            onTogglePreviewStrip={() => setShowPreviewStrip(!showPreviewStrip)}
            onTogglePause={() => setIsPaused(!isPaused)}
            onRetranslatePages={handleRetranslatePages}
            onToggleTranslatedMode={() => setIsTranslatedMode(!isTranslatedMode)}
            onToggleManualMode={() => setIsManualMode(!isManualMode)}
            onOpenNotes={(p: number | null) => setNotesPage(p)}
          />
        )}

        {showPreviewStrip && !showHome && previewPage == null && (
          <div className="fixed bottom-[80px] left-0 w-full z-[190] px-8 animate-in slide-in-from-bottom-4 fade-in duration-300">
            <PagePreviewStrip
              totalPages={totalPages}
              currentPage={currentPage}
              onSelect={(p: number) => { setCurrentPage(p); setShowPreviewStrip(false); }}
              onClose={() => setShowPreviewStrip(false)}
              getThumbnail={(p: number) => previewThumbnails[p] || null}
              getStatus={getPageStatus}
              getTranslatedText={(p: number) => translation.translationMap[p] || null}
              theme={translationTheme}
            />
          </div>
        )}
      </main>

      {/* Hidden File Input */}
      <input type="file" ref={fileInputRef} className="hidden" accept="application/pdf" onChange={(e: any) => {
        const file = e.target.files?.[0];
        if (file) {
          if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            setPendingUpload({ file });
            setUploadPromptOpen(true);
          } else {
            showConfirm(
              "Formato non supportato",
              "Spiacenti, è possibile caricare solo file in formato PDF.",
              () => { },
              'alert'
            );
          }
        }
        e.target.value = '';
      }} />

      {/* Modals */}
      {isSettingsOpen && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          currentSettings={aiSettings}
          onSave={async (s: AISettings) => {
            await saveSettings(s);
            if (s.inputLanguageDefault) setDefaultLang(s.inputLanguageDefault);
          }}
          onRedoAll={redoAllPages}
          onRetroactiveRename={scanAndRenameOldFiles}
          onRetroactiveRenameAll={scanAndRenameAllFiles}
          onRefreshLibrary={library.refreshLibrary}
          isLibraryView={isHomeView}
          showConfirm={showConfirm}
        />
      )}

      {uploadPromptOpen && (
        <UploadLanguagePrompt
          isOpen={uploadPromptOpen}
          defaultValue={docInputLanguage}
          onCancel={() => { setUploadPromptOpen(false); setPendingUpload(null); }}
          onConfirm={(lang: string, groups: string[]) => {
            const file: File | undefined = pendingUpload?.file;
            setUploadPromptOpen(false);
            setPendingUpload(null);
            if (!file) {
              pendingAutoStartRef.current = null;
              return;
            }
            pendingAutoStartRef.current = { page: 1, language: lang };
            void continueUploadWithLanguage(file, lang, groups);
          }}
          availableGroups={library.availableGroups}
        />
      )}

      {editLanguagePromptOpen && (
        <UploadLanguagePrompt
          isOpen={editLanguagePromptOpen}
          defaultValue={docInputLanguage}
          onCancel={() => setEditLanguagePromptOpen(false)}
          onConfirm={async (lang: string) => {
            setDocInputLanguage(lang);
            if (metadata?.name) {
              await library.updateLibrary(metadata.name, { inputLanguage: lang });
              log.success(`Lingua di input aggiornata a: ${lang}`);
            }
            setEditLanguagePromptOpen(false);
          }}
        />
      )}

      {renameState && (
        <RenameModal
          isOpen={!!renameState}
          currentName={renameState.currentName}
          onClose={() => setRenameState(null)}
          onRename={async (newName: string) => {
            const res = await window.electronAPI.renameTranslation({ fileId: renameState.fileId, newFileName: newName });
            if (res.success) {
              library.refreshLibrary();
              if (library.currentProjectFileId === renameState.fileId) {
                setMetadata(prev => prev ? { ...prev, name: newName } : null);
              }
              setRenameState(null);
            }
          }}
        />
      )}

      {createGroupModalOpen && (
        <CreateGroupModal
          isOpen={createGroupModalOpen}
          onClose={() => setCreateGroupModalOpen(false)}
          onConfirm={(group: string) => { library.createGroup(group); setCreateGroupModalOpen(false); }}
        />
      )}

      {activeGroupModalBookId && (
        <GroupManagementModal
          isOpen={!!activeGroupModalBookId}
          fileName={library.recentBooks[activeGroupModalBookId]?.fileName || ''}
          availableGroups={library.availableGroups}
          assignedGroups={library.recentBooks[activeGroupModalBookId]?.groups || []}
          onClose={() => setActiveGroupModalBookId(null)}
          onToggleGroup={(group: string) => library.addBookToGroup(activeGroupModalBookId, group)}
          onCreateGroup={(group: string) => library.createGroup(group)}
        />
      )}

      {cropModal && (
        <ImageCropModal
          isOpen={!!cropModal}
          src={cropModal.src}
          page={cropModal.page}
          onClose={() => setCropModal(null)}
          onConfirm={async (result: { page: number; croppedDataUrl: string; rect: any }) => {
            const page = result.page;
            setCroppedImages((prev: Record<number, string>) => ({ ...prev, [page]: result.croppedDataUrl }));
            const res = await window.electronAPI.saveProjectImage({
              fileId: library.currentProjectFileId || '',
              page,
              kind: 'crop',
              dataUrl: result.croppedDataUrl
            });
            if (res?.relPath) {
              setPageImagesIndex((prev: any) => ({ ...prev, crops: { ...prev.crops, [page]: res.relPath } }));
            }
            setCropModal(null);
          }}
        />
      )}

      {pageSelectionModal.isOpen && (
        <PageSelectionModal
          isOpen={pageSelectionModal.isOpen}
          total={pageSelectionModal.total}
          defaultPage={pageSelectionModal.targetPage}
          onClose={() => {
            setPageSelectionModal((prev: any) => ({ ...prev, isOpen: false }));
            setPendingReplacement(null);
          }}
          onConfirm={(page: number) => {
            if (pendingReplacement) {
              setPageReplacements((prev: Record<number, PageReplacement>) => ({
                ...prev,
                [pendingReplacement.page]: { filePath: pendingReplacement.filePath, sourcePage: page, updatedAt: Date.now() }
              }));
              setPendingReplacement(null);
            }
            setPageSelectionModal((prev: any) => ({ ...prev, isOpen: false }));
          }}
        />
      )}

      <SimpleConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
        onConfirm={confirmModal.onConfirm}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

export default App;
