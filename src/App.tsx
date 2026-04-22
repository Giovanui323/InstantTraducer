import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Services
import { log, extractMetadataAdapter, translationManager, TranslationCompletionNotifier } from './services';
import { setActiveProject } from './services/usageTracker';

// Utils
import {
  storage,
  setStorageLogging,
  loadReplacementPdfDoc,
  renderDocPageToJpeg,
  renderDocPageToObjectURL,
  renderPageToJpegBase64,
  renderPageOntoCanvas,
  renderPageToObjectURL,
  renderDocPageSafe,
  renderDocPageWithFallback,
  isPageCorrupted,
  withTimeout,
  safeCopy,
  pdfRenderAnalytics,
  cropBase64,
  revokeObjectURL,
  base64ToBlob,
  blobToObjectURL,
  sanitizeMetadataField,
  ensureJsonExtension,
  requireUuidV4FileId
} from './utils';

// Types
import { AISettings, PDFMetadata, PageReplacement, PageAnnotation, PageVerification } from './types';

// Components
import {
  Header,
  ControlsBar,
  ReaderView,
  ImageCropModal,
  SettingsModal,
  UploadLanguagePrompt,
  RenameModal,
  PageSelectionModal,
  CreateGroupModal,
  GroupManagementModal,
  CoverManagerModal,
  SimpleConfirmModal,
  PdfRenderErrorNotification,
  ToastNotification,
  ToastType,
  HomeView,
  MainToolbar,
  PagePreviewStrip,
  GlobalLoadingOverlay,
  SplashScreen
} from './components';

import { PAGE_RENDER_TIMEOUT_MS } from './constants';

// Contexts
import { LibraryContext } from './contexts';

// Hooks
import {
  useAiSettings,
  useInputLanguageDefault,
  useSearch,
  useProjectManagement,
  useAppLibrary,
  useAppTranslation,
  useAppQuality,
  useAppAnnotations
} from './hooks';

// Configuriamo il worker localmente (copiato in public/pdfjs durante il build/dev)
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs/pdf.worker.min.mjs';

const MAX_IMAGE_CACHE_SIZE = 50; // Numero massimo di immagini (originali/ritagli) da tenere in RAM

const App: React.FC = () => {
  const sessionId = useMemo(() => Math.random().toString(36).slice(2, 10), []);

  // --- App Version State ---
  const [appVersion, setAppVersion] = useState<string>('4.3.1');
  const [showSplash, setShowSplash] = useState<boolean>(true);

  useEffect(() => {
    if (window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then(setAppVersion).catch(err => log.error('Failed to get app version', err));
    }
  }, []);

  // CRITICAL: Unique key to force full remount of Reader/Translation engine on project switch
  // This ensures "two completely distinct processes" as requested.
  const [projectKey, setProjectKey] = useState(0);

  // --- Core State ---
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);

  // --- Refs ---
  const originalImagesRef = useRef<Record<number, string>>({});
  const croppedImagesRef = useRef<Record<number, string>>({});
  const pageRotationsRef = useRef<Record<number, number>>({});
  const pageReplacementsRef = useRef<Record<number, PageReplacement>>({});
  const lastRenderedRef = useRef<Record<string, { page: number, scale: number, rotation: number, timestamp: number }>>({});
  const pageImagesIndexRef = useRef<{ sources: Record<number, string>; crops: Record<number, string> }>({ sources: {}, crops: {} });
  const annotationMapRef = useRef<Record<number, PageAnnotation[]>>({});
  const verificationMapRef = useRef<Record<number, PageVerification>>({}); // Shared ref for verification map to break circular dependency
  const renderTaskRef = useRef<{ [key: string]: any }>({});
  const latestPageRef = useRef<{ [key: string]: number }>({});
  const metadataRef = useRef<PDFMetadata | null>(null);
  const pageDimsRef = useRef<Record<number, { width: number, height: number }>>({});
  const pageTraceRef = useRef<Record<number, { t0: number; seq: number; traceId: string }>>({});
  const cachedReplacementDocsRef = useRef<Record<string, any>>({});
  const loadingImagesRef = useRef<Set<number>>(new Set());
  const batchRunIdRef = useRef<number>(0);
  const isPausedRef = useRef<boolean>(false);
  const pendingAutoStartRef = useRef<{ page: number; language: string } | null>(null);
  const autoTranslateTimerRef = useRef<number | null>(null);
  const draggableRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openingProjectRef = useRef<string | null>(null);
  const prevIsBatchProcessingRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRefRight = useRef<HTMLCanvasElement>(null);
  const canvasRef3 = useRef<HTMLCanvasElement>(null);
  const canvasRef4 = useRef<HTMLCanvasElement>(null);
  const canvasRef5 = useRef<HTMLCanvasElement>(null);
  const allRefs = [canvasRef, canvasRefRight, canvasRef3, canvasRef4, canvasRef5];

  const shouldDestroyPdfDocRef = useRef(true);
  const isClosingSessionRef = useRef(false);
  const isProjectLoadedRef = useRef(false);

  // --- PDF Cleanup ---
  useEffect(() => {
    return () => {
      if (pdfDoc && shouldDestroyPdfDocRef.current) {
        log.step("Cleanup: Distruzione documento PDF precedente...");
        try {
          pdfDoc.destroy().catch(() => { });
        } catch { }
      }
      shouldDestroyPdfDocRef.current = true; // Reset for next time

      // Pulizia anche dei PDF sostitutivi in cache
      Object.values(cachedReplacementDocsRef.current).forEach(doc => {
        try { (doc as any).destroy().catch(() => { }); } catch { }
      });
      cachedReplacementDocsRef.current = {};

      // RAM Optimization: Revoca tutti i Blob URL per liberare memoria
      [originalImages, croppedImages, previewThumbnails].forEach(map => {
        Object.values(map).forEach(url => {
          if (url && url.startsWith('blob:')) {
            revokeObjectURL(url);
          }
        });
      });
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
  const { aiSettings, isSettingsOpen, setIsSettingsOpen, saveSettings, isApiConfigured, settingsLoaded } = useAiSettings();

  // --- Activity Detection ---
  const [isFocused, setIsFocused] = useState(true);
  const isFocusedRef = useRef(true);
  useEffect(() => { isFocusedRef.current = isFocused; }, [isFocused]);

  const [isIdle, setIsIdle] = useState(false);
  const isIdleRef = useRef(false);
  useEffect(() => { isIdleRef.current = isIdle; }, [isIdle]);
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    const handleFocus = () => setIsFocused(true);
    const handleBlur = () => setIsFocused(false);
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
      if (isIdle) setIsIdle(false);
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('touchstart', handleActivity);

    const idleCheckInterval = setInterval(() => {
      const now = Date.now();
      // Se non c'è attività da più di 1 minuto, consideriamo l'app idle
      if (now - lastActivityRef.current > 60000) {
        if (!isIdle) setIsIdle(true);
      }
    }, 10000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      clearInterval(idleCheckInterval);
    };
  }, [isIdle]);

  // Sincronizza il logging dello storage e del logger globale con l'impostazione verboseLogs
  useEffect(() => {
    if (!settingsLoaded) return;
    const isEnabled = !!aiSettings.verboseLogs;
    setStorageLogging(isEnabled);
    // Sync for logger.ts (defaults to 'false' if disabled)
    // Avoid redundant writes
    const current = storage.getItem('verbose_logs');
    const target = isEnabled ? 'true' : 'false';
    if (current !== target) {
      storage.setItem('verbose_logs', target);
    }
  }, [aiSettings.verboseLogs, settingsLoaded]);

  // Sync translation diagnostic log setting with the service
  useEffect(() => {
    if (!settingsLoaded) return;
    import('./services/translation/TranslationDiagnosticLogger').then(({ setDiagnosticLogEnabled }) => {
      setDiagnosticLogEnabled(!!aiSettings.translationDiagnosticLog);
    });
  }, [aiSettings.translationDiagnosticLog, settingsLoaded]);

  // FIX: Auto-start translation when settings become available (race condition fix)
  // If the user opens a project BEFORE settings are loaded, isPaused will be TRUE.
  // Once settings load and we confirm API is configured, we can unpause automatically.
  useEffect(() => {
    if (settingsLoaded && isApiConfigured && isPaused && !isManualMode && !isConsultationMode) {
      // Only unpause if we have a valid session that was likely waiting for API
      if (pdfDoc || (metadata && metadata.totalPages > 0)) {
        log.info("Impostazioni caricate e API configurata: avvio automatico traduzione (recovery da race condition).");
        setIsPaused(false);
      }
    }
  }, [settingsLoaded, isApiConfigured]);

  const isConsultationMode = Boolean(aiSettings.consultationMode);
  const { defaultLang, setDefaultLang } = useInputLanguageDefault();

  const currentPageRef = useRef<number>(1);
  const [currentPage, _setCurrentPage] = useState<number>(1);
  const lastSavedPageRef = useRef<number>(1);
  const setCurrentPage = useCallback((page: number | ((p: number) => number)) => {
    _setCurrentPage(prev => {
      const next = typeof page === 'function' ? page(prev) : page;
      currentPageRef.current = next;
      return next;
    });
  }, []);

  const [scale, setScale] = useState<number>(() => {
    const raw = storage.getItem('page_scale');
    const s = raw ? Number(raw) : 1.2;
    return Math.max(0.3, Math.min(5, Number.isFinite(s) ? s : 1.2));
  });
  const hasEffectiveScaleRef = useRef(false);
  const [renderScaleTarget, setRenderScaleTarget] = useState<number>(scale);
  const [renderScale, setRenderScale] = useState<number>(scale);
  const [metadata, setMetadata] = useState<PDFMetadata | null>(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isAutodetecting, setIsAutodetecting] = useState<boolean>(false);
  const [autodetectLogs, setAutodetectLogs] = useState<string>('');
  const [isManualMode, setIsManualMode] = useState<boolean>(false);

  // Forced consultation mode
  useEffect(() => {
    if (isConsultationMode) {
      setIsPaused(true);
      setIsManualMode(true);
    }
  }, [isConsultationMode]);
  const [isTranslatedMode, setIsTranslatedMode] = useState<boolean>(false);
  const [isHomeView, setIsHomeView] = useState(true);
  const [isReaderMode, setIsReaderMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClosingSession, setIsClosingSession] = useState(false);
  const [viewMode, setViewMode] = useState<'auto' | 'single' | 'spread'>(() => {
    const rawNew = storage.getItem('reader_page_split_mode_v1');
    const rawOld = storage.getItem('reader_view_mode_v1');
    const raw = rawNew ?? rawOld;
    if (raw === 'auto' || raw === 'single' || raw === 'spread') return raw;
    if (raw === 'side-by-side') return 'spread';
    return 'single';
  });
  const [navigationMode, setNavigationMode] = useState<'scroll' | 'flip'>(() => {
    const raw = storage.getItem('reader_navigation_mode_v1');
    if (raw === 'scroll' || raw === 'flip') return raw;
    return 'scroll';
  });
  const [showPreviewStrip, setShowPreviewStrip] = useState<boolean>(false);
  const [previewThumbnails, setPreviewThumbnails] = useState<Record<number, string>>({});
  const [previewPage, setPreviewPage] = useState<number | null>(null);
  const [copiedPage, setCopiedPage] = useState<number | null>(null);
  const [notesPage, setNotesPage] = useState<number | null>(null);
  const [brightness, setBrightness] = useState<number>(() => {
    const raw = storage.getItem('reader_brightness');
    const n = raw ? Number(raw) : 1;
    return Math.max(0.4, Math.min(1.6, Number.isFinite(n) ? n : 1));
  });
  const [temperature, setTemperature] = useState<number>(() => {
    const raw = storage.getItem('reader_temperature');
    const n = raw ? Number(raw) : 0;
    return Math.max(-100, Math.min(100, Number.isFinite(n) ? n : 0));
  });
  const [translationTheme, setTranslationTheme] = useState<'light' | 'sepia' | 'dark'>(() => {
    const raw = storage.getItem('translation_theme');
    return (raw === 'light' || raw === 'sepia' || raw === 'dark') ? raw : 'dark';
  });
  const [columnLayout, setColumnLayout] = useState<number>(() => {
    const raw = storage.getItem('reader_column_layout');
    const n = raw ? Number(raw) : 0.5;
    return Math.max(0.2, Math.min(0.8, Number.isFinite(n) ? n : 0.5));
  });

  const [docInputLanguage, setDocInputLanguage] = useState<string>(defaultLang || 'tedesco');

  useEffect(() => {
    storage.setItem('reader_page_split_mode_v1', viewMode);
    storage.setItem('reader_view_mode_v1', viewMode);
  }, [viewMode]);

  useEffect(() => {
    storage.setItem('reader_navigation_mode_v1', navigationMode);
  }, [navigationMode]);

  useEffect(() => {
    if (hasEffectiveScaleRef.current) return;
    setRenderScaleTarget(scale);
  }, [scale]);

  const handleEffectiveScaleChange = useCallback((s: number) => {
    hasEffectiveScaleRef.current = true;
    setRenderScaleTarget(s);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setRenderScale(renderScaleTarget), 140);
    return () => window.clearTimeout(t);
  }, [renderScaleTarget]);

  // Sync docInputLanguage with defaultLang when not in a session
  useEffect(() => {
    if (!pdfDoc && !metadata) {
      setDocInputLanguage(defaultLang || 'tedesco');
    }
  }, [defaultLang, pdfDoc, metadata]);

  const [originalImages, _setOriginalImages] = useState<Record<number, string>>({});
  const [croppedImages, _setCroppedImages] = useState<Record<number, string>>({});

  const pruneImageCache = useCallback((cache: Record<number, string>, current: number, max: number) => {
    const keys = Object.keys(cache).map(Number);
    if (keys.length <= max) return cache;

    // Ordiniamo per distanza dalla pagina corrente (le più lontane per prime)
    keys.sort((a, b) => Math.abs(b - current) - Math.abs(a - current));

    const nextCache = { ...cache };
    const toRemove = keys.slice(0, keys.length - max);
    toRemove.forEach(k => {
      const url = nextCache[k];
      if (url && url.startsWith('blob:')) {
        revokeObjectURL(url);
      }
      delete nextCache[k];
    });
    return nextCache;
  }, []);

  const setOriginalImages = useCallback((update: any) => {
    _setOriginalImages((prev: Record<number, string>) => {
      const next = typeof update === 'function' ? update(prev) : update;
      const pruned = pruneImageCache(next, currentPageRef.current, MAX_IMAGE_CACHE_SIZE);
      originalImagesRef.current = pruned;
      return pruned;
    });
  }, [pruneImageCache]);

  const setCroppedImages = useCallback((update: any) => {
    _setCroppedImages((prev: Record<number, string>) => {
      const next = typeof update === 'function' ? update(prev) : update;
      const pruned = pruneImageCache(next, currentPageRef.current, MAX_IMAGE_CACHE_SIZE);
      croppedImagesRef.current = pruned;
      return pruned;
    });
  }, [pruneImageCache]);

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
  const [coverModalFileId, setCoverModalFileId] = useState<string | null>(null);
  const [renameState, setRenameState] = useState<null | any>(null);
  const [editLanguageTarget, setEditLanguageTarget] = useState<{ fileId: string, currentLang: string } | null>(null);
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

  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const showConfirm = useCallback((title: string, message: string, onConfirm: () => void, type: 'danger' | 'info' | 'alert' = 'info') => {
    setConfirmModal({ isOpen: true, title, message, onConfirm, type });
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  }, []);

  // --- Hook Initialization ---
  const library = useAppLibrary(metadata, docInputLanguage, showConfirm, setIsSaving, showToast);

  // --- Pre-scansione dimensioni pagine ---
  useEffect(() => {
    if (!pdfDoc || !metadata?.name) return;

    let isMounted = true;
    const scanDims = async () => {
      try {
        const totalPages = pdfDoc.numPages;
        // FIX: Use ref to get the absolute latest state (including just-loaded data)
        const currentDims = pageDimsRef.current || {};
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
          // REMOVED: void library.updateLibrary(metadata.name, { pageDims: { ...currentDims, ...newDims } }, 'BACKGROUND', true);
        }

        // Background scanning for other pages in small batches
        if (isMounted) {
          const others = [];
          for (let i = 1; i <= totalPages; i++) {
            if (!currentDims[i] && !newDims[i]) others.push(i);
          }

          if (others.length > 0) {
            // Wait longer before background scanning (5s instead of 2s)
            await new Promise(r => setTimeout(r, 5000));
            if (!isMounted) return;

            const batchSize = 5;
            let accumulatedDims: Record<number, { width: number, height: number }> = {};
            let pagesSinceLastSave = 0;

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
                // Removed background pause logic to allow batch processing when unfocused

                // Optimization: update state but debounce library save
                let hasNewData = false;
                Object.assign(accumulatedDims, batchDims);
                pagesSinceLastSave += batch.length;

                setPageDims(prev => {
                  const merged = { ...prev };
                  for (const [p, dims] of Object.entries(batchDims)) {
                    const pNum = Number(p);
                    if (!prev[pNum] || prev[pNum].width !== dims.width || prev[pNum].height !== dims.height) {
                      merged[pNum] = dims;
                      hasNewData = true;
                    }
                  }

                  return merged;
                });

                // Throttle background batches drastically (15s instead of 3s)
                await new Promise(r => setTimeout(r, 15000));
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
  }, [pdfDoc, metadata?.name, currentPage, isFocused, isIdle]);

  useEffect(() => {
    if (window.electronAPI?.onCloseRequest) {
      window.electronAPI.onCloseRequest(async () => {
        log.step("Ricevuta richiesta di chiusura: stop background e flush salvataggi...");
        try {
          // FIX: Save last page state before closing (Silent Save)
          if (library.currentProjectFileId && currentPageRef.current) {
            const payload: any = { lastPage: currentPageRef.current };
            // Add pageDims if available to save them once at the end
            if (pageDimsRef.current && Object.keys(pageDimsRef.current).length > 0) {
              payload.pageDims = pageDimsRef.current;
            }
            const fileId = library.currentProjectFileId;
            await library.updateLibrary(fileId, { fileId, ...payload }, 'CRITICAL', true);
          }

          // Stop background job first to prevent new saves and release resources
          await translationManager.stopBackground();

          // Force timeout after 8 seconds to ensure we reply to main process (which waits 10s)
          // FIX: Check return value to report actual status
          const success = await Promise.race([
            library.flushSaves(),
            new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error('Flush timeout')), 8000))
          ]);

          if (!success) {
            log.error("CRITICAL: Flush salvataggi fallito. Alcuni dati potrebbero non essere stati scritti su disco.");
          } else {
            log.success("Flush salvataggi completato con successo.");
          }
        } catch (e) {
          log.error("Errore (o timeout) durante flush in chiusura", e);
        } finally {
          window.electronAPI.readyToClose();
        }
      });
    }
  }, [library.flushSaves]);

  // Sync refs
  useEffect(() => { originalImagesRef.current = originalImages; }, [originalImages]);
  useEffect(() => { croppedImagesRef.current = croppedImages; }, [croppedImages]);
  useEffect(() => { pageRotationsRef.current = pageRotations; }, [pageRotations]);
  useEffect(() => { pageReplacementsRef.current = pageReplacements; }, [pageReplacements]);
  useEffect(() => { pageImagesIndexRef.current = pageImagesIndex; }, [pageImagesIndex]);
  useEffect(() => { annotationMapRef.current = annotationMap; }, [annotationMap]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { metadataRef.current = metadata; }, [metadata]);
  useEffect(() => { 
    const projectName = metadata?.name || metadata?.title || 'Progetto Senza Nome';
    const projectId = library.currentProjectFileId || projectName;
    setActiveProject(projectId, projectName); 
  }, [library.currentProjectFileId, metadata?.name, metadata?.title]);
  useEffect(() => { pageDimsRef.current = pageDims; }, [pageDims]);

  // Track corrupted pages and failed renders
  const [corruptedPages, setCorruptedPages] = useState<Set<number>>(new Set());
  const [failedRenders, setFailedRenders] = useState<Record<number, number>>({});
  const [internalSevereError, setInternalSevereError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!isTranslatedMode && !isReaderMode) return;
    if (!currentPage || (!library.currentProjectFileId && !pdfDoc)) return;

    const abortCtrl = new AbortController();
    const signal = abortCtrl.signal;

    const renderPageWithRetry = async (p: number, attempt: number = 1, opts?: { quality?: number, scale?: number }): Promise<string> => {
      if (!isMounted || signal.aborted) throw new Error('cancelled');
      if (!pdfDoc) throw new Error('PDF document not available');

      const startTime = Date.now();

      // Determine target quality/scale for this attempt
      // Attempt 1: Use requested quality (default 1.0) and scale (default 1.5)
      // Retry 1 (Attempt 2): Drop to 0.5 quality, 1.0 scale
      // Retry 2 (Attempt 3): Drop to 0.3 quality, 0.7 scale
      const baseQuality = opts?.quality ?? 1.0;
      const baseScale = opts?.scale ?? 1.5;

      const quality = attempt === 1 ? baseQuality : attempt === 2 ? 0.5 : 0.3;
      const scale = attempt === 1 ? baseScale : attempt === 2 ? 1.0 : 0.7;

      pdfRenderAnalytics.recordRenderAttempt(p, quality);

      // First check if page might be corrupted
      try {
        const isCorrupted = await isPageCorrupted(pdfDoc, p);
        if (isCorrupted) {
          log.warning(`Page ${p} detected as potentially corrupted, using enhanced fallback rendering`);
          pdfRenderAnalytics.recordCorruptedPage(p);

          const result = await renderDocPageSafe(pdfDoc, p, {
            scale: scale, // Use the calculated scale
            jpegQuality: quality, // Use the calculated quality
            maxRetries: 5
          });

          if (result.success && result.dataUrl) {
            const renderTime = Date.now() - startTime;
            pdfRenderAnalytics.recordRenderSuccess(p, renderTime, result.attempts);
            return result.dataUrl;
          } else {
            throw new Error(`Failed to render corrupted page ${p}: ${result.error?.message}`);
          }
        }
      } catch (corruptionError: any) {
        log.warning(`Corruption detection failed for page ${p}, proceeding with normal rendering: ${corruptionError?.message}`);
      }

      const maxAttempts = 3;
      const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
      const timeoutMs = Math.max(20000, PAGE_RENDER_TIMEOUT_MS - (attempt - 1) * 15000);

      try {
        if (!isMounted) throw new Error('cancelled');
        log.info(`Attempting to render page ${p}, attempt ${attempt}/${maxAttempts} (quality: ${quality}, scale: ${scale}, timeout: ${timeoutMs}ms)`);

        const result = await renderPageToObjectURL(p, {
          pdfDoc,
          pageReplacementsRef,
          pageRotationsRef,
          loadReplacementPdfDoc: getCachedReplacementPdfDoc
        }, { scale, jpegQuality: quality, timeoutMs, signal });

        const renderTime = Date.now() - startTime;
        pdfRenderAnalytics.recordRenderSuccess(p, renderTime, attempt);
        return result;
      } catch (e: any) {
        if (!isMounted) throw new Error('cancelled');
        const isRenderingCancelled = e?.name === 'RenderingCancelledException' || e?.message?.includes('cancelled');
        const isTimeout = e?.message?.includes('timeout') || e?.message?.includes('Timeout');

        if (isRenderingCancelled && attempt < maxAttempts) {
          // If cancelled (e.g. PDF destroyed), checking isMounted helps, but if we are still mounted
          // and just cancelled for another reason, we might want to retry? 
          // Actually if PDF is destroyed, we shouldn't retry.
          // But here we rely on isMounted check mostly.
          if (!isMounted) throw e;

          log.warning(`Page ${p} render cancelled, retrying in ${retryDelay}ms (attempt ${attempt}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return renderPageWithRetry(p, attempt + 1, opts);
        }

        if (isTimeout && attempt < maxAttempts) {
          log.warning(`Page ${p} render timeout, retrying with lower quality (attempt ${attempt}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return renderPageWithRetry(p, attempt + 1, opts);
        }

        // If it's not a recoverable error or we've exhausted retries, throw
        throw e;
      }
    };

    const ensureImageLoaded = async (p: number) => {
      if (!isMounted) return;
      if (originalImagesRef.current[p] || corruptedPages.has(p)) return;
      if (loadingImagesRef.current.has(p)) return;

      loadingImagesRef.current.add(p);
      try {
        // 1. Prova a caricare dal disco se disponibile nell'indice
        const relPath = pageImagesIndex.sources[p];
        if (relPath && library.currentProjectFileId) {
          try {
            const res = await window.electronAPI.readProjectImageBase64({
              fileId: library.currentProjectFileId!,
              relPath
            });
            if (res.success && res.base64) {
              const blob = base64ToBlob(res.base64);
              const objectUrl = blobToObjectURL(blob);
              if (isMounted) {
                setOriginalImages((prev: Record<number, string>) => ({ ...prev, [p]: objectUrl }));
              }
              return;
            }
          } catch (e) {
            log.error(`Failed to load original image from disk for page ${p}`, e);
          }
        }

        if (!isMounted) return;

        // 2. Se non è sul disco ma abbiamo il PDF, caricalo/generalo al volo
        if (pdfDoc) {
          try {
            const objectUrl = await renderPageWithRetry(p);
            if (isMounted) {
              setOriginalImages((prev: Record<number, string>) => ({ ...prev, [p]: objectUrl }));

              // Clear failed renders tracking on success
              setFailedRenders(prev => {
                const updated = { ...prev };
                delete updated[p];
                return updated;
              });

              log.success(`Successfully rendered page ${p}`);
            }
          } catch (e: any) {
            if (!isMounted) return;
            const errorMsg = e?.message || e?.toString() || JSON.stringify(e);
            const isRenderingCancelled = e?.name === 'RenderingCancelledException' || e?.message?.includes('cancelled');

            if (isRenderingCancelled) {
              log.info(`Render cancelled for page ${p} (likely due to cleanup or navigation)`);
              return;
            }

            // Track failed renders
            setFailedRenders(prev => ({ ...prev, [p]: (prev[p] || 0) + 1 }));

            // Record failure in analytics
            pdfRenderAnalytics.recordRenderFailure(p, e, (failedRenders[p] || 0) + 1);

            // Mark as corrupted after 3 failed attempts
            if ((failedRenders[p] || 0) >= 2) {
              setCorruptedPages(prev => new Set([...prev, p]));
              pdfRenderAnalytics.recordCorruptedPage(p);
              log.error(`Page ${p} marked as corrupted after multiple failed attempts`, errorMsg);
            } else {
              log.error(`Failed to render original image from PDF for page ${p}`, errorMsg);
            }

            // Provide user feedback for rendering failures
            // Store error information for potential user notification
            log.warning(`Page ${p} may contain corrupted elements. Consider checking the PDF file.`);
          }
        }
      } finally {
        loadingImagesRef.current.delete(p);
      }
    };

    void ensureImageLoaded(currentPage);
    return () => {
      isMounted = false;
      abortCtrl.abort();
    };
  }, [currentPage, isTranslatedMode, isReaderMode, pageImagesIndex.sources, library.currentProjectFileId, pdfDoc, getCachedReplacementPdfDoc, setOriginalImages]);

  const annotations = useAppAnnotations(metadata, library.currentProjectFileId, library.updateLibrary);

  // Forward references to bridge hooks
  const translationMapRef = useRef<Record<number, string>>({});

  // Helper Methods
  const ensurePreviewThumbnail = useCallback(async (p: number) => {
    if (previewThumbnails[p] || !pdfDoc) return previewThumbnails[p] || null;
    try {
      const objectUrl = await renderDocPageToObjectURL(pdfDoc, p, { scale: 0.2 });
      setPreviewThumbnails((prev: Record<number, string>) => ({ ...prev, [p]: objectUrl }));
      return objectUrl;
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
    if (aiSettings.verboseLogs) {
      log.step(`TRACE p${page} #${trace?.seq ?? '---'} +${elapsedMs ?? '---'}ms`, { sessionId, traceId: trace?.traceId, msg, data });
    }
  }, [sessionId, aiSettings.verboseLogs]);

  const appendAutodetectLog = useCallback((msg: string) => {
    const line = `${new Date().toLocaleTimeString()}  ${msg}`;
    setAutodetectLogs((prev) => {
      const next = (prev ? `${prev}\n` : "") + line;
      return next.length > 6000 ? next.slice(-6000) : next;
    });
  }, []);

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
        const fileId = library.currentProjectFileId;
        if (!fileId) return undefined;
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
      try {
        const replacement = pageReplacementsRef.current?.[pageNum];
        const doc = replacement?.filePath ? await getCachedReplacementPdfDoc(replacement.filePath) : pdfDoc;
        const srcPage = replacement?.filePath ? replacement.sourcePage : pageNum;

        const result = await renderDocPageWithFallback(doc, srcPage, {
          scale: 1.3,
          jpegQuality: 0.62,
          extraRotation: pageRotationsRef.current?.[pageNum] || 0,
          timeoutMs: PAGE_RENDER_TIMEOUT_MS,
          maxRetries: 2
        });

        if (result.success) {
          if (result.base64) fullBase64 = result.base64;
          else if (result.dataUrl) fullBase64 = result.dataUrl.split(',')[1];
        }
      } catch (e) {
        fullBase64 = undefined;
      }
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
    setOriginalImages,
    setPageDims,
    readProjectImageBase64: async (args: any) => window.electronAPI.readProjectImageBase64(args).then((r: any) => r.base64),
    readProjectImageDataUrl: async (args: any) => window.electronAPI.readProjectImage(args).then((r: any) => r.dataUrl),
    saveSourceForPage: async (args: any) => {
      const targetId = library.currentProjectFileId || '';
      if (library.isBlocked(targetId)) {
        log.warning(`Blocked saveSourceForPage for ${targetId} (blacklisted/transitioning)`);
        return;
      }

      const dataUrl = args.sourceDataUrl || args.dataUrl;
      if (!dataUrl && !args.buffer) return;

      let buffer: Uint8Array | undefined;
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
    sessionId, verboseLogs: !!aiSettings.verboseLogs,
    isPaused,
    isConsultationMode,
    currentProjectFileId: library.currentProjectFileId,
    loadReplacementPdfDoc: getCachedReplacementPdfDoc,
    renderDocPageToJpeg,
    verificationMapRef // Pass the shared ref
  });

  // KILL SWITCH: Log only, but do not kill adjacent pages to isolate errors.
  const onSevereError = useCallback((failedPage: number) => {
    setInternalSevereError(true);
    log.info(`[SAFETY] Errore critico sulla pagina ${failedPage}. (Isolamento attivo: Nessuna interruzione a catena sulle altre pagine).`);
  }, []);

  const quality = useAppQuality({
    pdfDoc, metadata, aiSettings, docInputLanguage,
    currentProjectFileId: library.currentProjectFileId,
    translationMapRef,
    setTranslationMap: translation.setTranslationMap,
    setAnnotationMap,
    updatePageStatus: translation.updatePageStatus,
    updateLibrary: library.updateLibrary,
    appendPageConsole,
    loadReplacementPdfDoc: getCachedReplacementPdfDoc,
    getContextImageBase64,
    enqueueTranslation: (page: number, options?: any) => translation.enqueueTranslation(page, options),
    clearLogs: (page: number) => {
      setGeminiLogs(prev => {
        const next = { ...prev };
        delete next[page];
        return next;
      });
      translation.setPartialTranslations(prev => {
        const next = { ...prev };
        delete next[page];
        return next;
      });
    },
    isConsultationMode,
    onSevereError // Pass the kill switch callback
  });

  // Link quality hook with translation state
  useEffect(() => {
    translationMapRef.current = translation.translationMap;
  }, [translation.translationMap]);

  // Sync verification map to shared ref
  useEffect(() => {
    verificationMapRef.current = quality.verificationMap;
  }, [quality.verificationMap]);

  const combinedQueueStats = useMemo(() => ({
    active: translation.queueStats.active + quality.verificationQueueStats.active,
    queued: translation.queueStats.queued + quality.verificationQueueStats.queued,
    details: [
      ...Array.from(translation.activePagesRef.current).map(p => ({ page: p, type: 'translation' as const, status: 'active' as const })),
      ...translation.getQueue().map(p => ({ page: p, type: 'translation' as const, status: 'queued' as const })),
      ...Array.from(quality.activeVerificationsRef.current).map(p => ({ page: p, type: 'verification' as const, status: 'active' as const })),
      ...quality.getQueue().map(p => ({ page: p, type: 'verification' as const, status: 'queued' as const }))
    ]
  }), [translation.queueStats, quality.verificationQueueStats, translation.getQueue, quality.getQueue]);

  const { redoAllPages, retryAllErrors, scanAndRenameOldFiles, scanAndRenameAllFiles } = useProjectManagement({
    pdfDoc, setPdfDoc, metadata, setMetadata, recentBooks: library.recentBooks, setRecentBooks: library.setRecentBooks,
    currentProjectFileId: library.currentProjectFileId,
    aiSettings, refreshLibrary: library.refreshLibrary, flushSaves: library.flushSaves,
    updateLibrary: library.updateLibrary,
    cancelPendingSaves: library.cancelPendingSaves,
    blockSave: library.blockSave,
    unblockSave: library.unblockSave,
    registerRename: library.registerRename,
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
    isConsultationMode,
    ensurePageImageSaved: async (page: number) => {
      try {
        if (!metadata?.name) return null;
        let rel = pageImagesIndexRef.current?.sources?.[page];
        const fileId = library.currentProjectFileId;
        if (rel && fileId) return await window.electronAPI.readProjectImageBase64({ fileId, relPath: rel }).then((r: any) => r.base64);

        // If not found, render and save
        if (!pdfDoc) return null;
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

  const handleConsolidate = useCallback(async (silent = false) => {
    if (!window.electronAPI?.consolidateLibrary) return;
    try {
      if (!silent) log.step("Avvio consolidamento libreria...");
      const res = await window.electronAPI.consolidateLibrary();
      if (res.success) {
        if (!silent) {
          log.success(`Consolidamento completato. File recuperati: ${res.fixedCount}, Ancora mancanti: ${res.missingCount}`);
          showConfirm("Consolidamento Completato", `Operazione riuscita!\n\nFile recuperati: ${res.fixedCount}\nFile ancora mancanti: ${res.missingCount}\n\n(I file ancora mancanti sono quelli che non sono stati trovati nemmeno nel percorso originale sul disco)`, () => { }, 'alert');
          library.refreshLibrary();
        } else if (res.fixedCount > 0) {
          // All'avvio silenzioso, ricarichiamo solo se abbiamo effettivamente recuperato qualcosa
          log.info(`Consolidamento silenzioso completato: ${res.fixedCount} file recuperati.`);
          library.refreshLibrary();
        }
      } else {
        if (!silent) log.error("Consolidamento fallito:", res.error);
      }
    } catch (e) {
      if (!silent) log.error("Errore durante il consolidamento", e);
    }
  }, [library.refreshLibrary, showConfirm]);

  useEffect(() => {
    // Consolidamento automatico silenzioso all'avvio
    const timer = setTimeout(() => {
      handleConsolidate(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [handleConsolidate]);

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

  const resetProjectState = useCallback((reason: string = "Unknown") => {
    log.step(`[App] Resetting project state. Reason: ${reason}`);

    // TASK 39: STOP RENDERING IMMEDIATELY
    // Clearing the PDF document stops the rendering loop in useEffect
    setPdfDoc(null);
    setInternalSevereError(false);
    isProjectLoadedRef.current = false;

    try { translation.abortAll(true); } catch { } // FORCE CLEAR queue and active tasks
    try { quality.abortAllVerifications(); } catch { }
    try { translation.resetQueue(); } catch { }
    pendingAutoStartRef.current = null; // Evita ritraduzioni automatiche residue

    // RAM Optimization: Revoca tutti i Blob URL prima di svuotare
    [originalImages, croppedImages, previewThumbnails].forEach(map => {
      Object.values(map).forEach(url => {
        if (url && url.startsWith('blob:')) {
          revokeObjectURL(url);
        }
      });
    });

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

  const [isOpeningProject, setIsOpeningProject] = useState<string | null>(null);

  const handleOpenProject = useCallback(async (fileId: string) => {
    let targetFileId = '';
    try {
      targetFileId = requireUuidV4FileId(fileId);
    } catch (e) {
      showToast((e as any)?.message || 'ID progetto non valido (UUID).', 'error');
      return;
    }

    // TASK 37: Redundancy Verification
    // Prevent reloading the same project if it is already active
    if (library.currentProjectFileId === targetFileId) {
      log.info(`[App] Progetto ${targetFileId} già attivo. Ignoro ricaricamento.`);
      return;
    }

    if (openingProjectRef.current === targetFileId) {
      log.warn(`[App] Apertura progetto ${targetFileId} già in corso. Ignoro richiesta duplicata.`);
      return;
    }
    // Global lock to prevent rapid switching race conditions
    if (openingProjectRef.current && openingProjectRef.current !== targetFileId) {
      log.warn(`[App] Cambio progetto troppo rapido. Ignoro ${targetFileId} mentre apro ${openingProjectRef.current}`);
      return;
    }

    log.info(`[App] 🔄 Inizio cambio progetto: ${library.currentProjectFileId || 'Nessuno'} -> ${targetFileId}`);
    const switchStartTime = performance.now();

    openingProjectRef.current = targetFileId;
    setIsOpeningProject(targetFileId);

    try {
      // 0. Ensure we save the CURRENT project state before doing anything else
      // This prevents "translationsCount: 0" on the old project when it reloads
      if (library.currentProjectFileId) {
        log.info(`[App] 💾 Salvataggio stato progetto precedente (${library.currentProjectFileId})...`);
      }
      // TASK 38: Wait for flush to complete to avoid collision
      await library.flushSaves(library.currentProjectFileId || undefined);

      // BACKGROUND TRANSLATION HANDOFF
      if (library.currentProjectFileId && library.currentProjectFileId !== targetFileId) {
        const queue = translation.getQueue();
        const isTranslating = translation.queueStats.active > 0 || queue.length > 0;

        if (isTranslating && pdfDoc && metadata) {
          const success = translationManager.requestBackground(
            library.currentProjectFileId,
            pdfDoc,
            metadata,
            aiSettings,
            docInputLanguage,
            translation.translationMapRef.current,
            queue
          );
          if (success) {
            shouldDestroyPdfDocRef.current = false;
            log.info(`[App] Progetto ${metadata.name} spostato in background.`);
          }
        }
      }

      // Notify Manager about the new current file (stops background if it matches)
      await translationManager.setCurrentFileId(targetFileId);

      // CRITICAL FIX: Clean handoff to prevent "Ghost State" and ID mismatches
      // 1. Block saves for the OLD project to prevent trailing debounces writing to the wrong file
      if (library.currentProjectFileId) {
        library.cancelPendingSaves(library.currentProjectFileId);
        // TASK 38: Reduced timeout from 10s to 2s
        library.blockSave(library.currentProjectFileId, 2000);
      }

      // 2. Reset local state immediately (clears logs, maps, stats) BEFORE switching ID
      // This ensures the UI never renders "New ID" + "Old Data"

      // CRITICAL FIX: Detach metadata first to stop effects in hooks (like useAppAnnotations)
      // from trying to save empty state to the old project ID.
      setMetadata(null);

      resetProjectState(`Switching to ${targetFileId}`);
      setIsBatchProcessing(false);
      setIsPaused(true);

      // 3. Now safe to switch the ID
      library.setCurrentProjectFileId(targetFileId);
      log.info(`[App] ✅ ID progetto attivato: ${targetFileId}`);

      // Force React to teardown the old component tree and mount a fresh one
      setProjectKey(prev => prev + 1);

      // Ensure we can save to this NEW ID (in case it was previously blacklisted)
      library.unblockSave(targetFileId);

      pdfRenderAnalytics.reset();
      log.step(`Caricamento dati JSON (${targetFileId})...`);
      if (!window.electronAPI) throw new Error('Contesto Electron non rilevato');

      const data = await window.electronAPI.loadTranslation(targetFileId);

      if (!data) {
        log.error('Dati progetto non trovati per:', targetFileId);
        return;
      }
      log.info(`[App] Dati caricati: ${data.fileName} (${data.totalPages} pagine)`);

      setDocInputLanguage((data as any).inputLanguage || defaultLang || 'tedesco');

      // Impostiamo i metadati base dal JSON subito, prima di caricare il PDF
      setMetadata({
        name: data.fileName || fileId,
        size: 0,
        totalPages: (data.totalPages && data.totalPages > 0) ? data.totalPages : 1
      });

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
      // CRITICAL FIX: Sync translationMapRef immediately for hooks (like useAppQuality auto-resume)
      translationMapRef.current = data.translations || {};

      translation.setTranslationsMeta(data.translationsMeta || {});
      annotations.setUserHighlights(data.userHighlights || {});
      annotations.setUserNotes(data.userNotes || {});
      quality.setVerificationMap(data.verifications || {});
      quality.setVerificationsMeta(data.verificationsMeta || {});
      setAnnotationMap(data.annotations || {});

      // MARK PROJECT AS FULLY LOADED
      // This prevents the prefetch/auto-translate logic from running on partial state
      // resolving the "Lost Progress" and "Massive Redundant Rendering" issues.
      isProjectLoadedRef.current = true;
      const loadedCount = Object.keys(data.translations || {}).length;
      if (loadedCount > 0) {
        log.info(`[App] Stato caricato con successo: ${loadedCount} traduzioni verificate.`);
        setIsTranslatedMode(true);
      }

      const targetPage = normalizePageNumber((data as any).lastPage ?? 1, (data as any).totalPages);

      lastSavedPageRef.current = targetPage;
      setCurrentPage(targetPage);
      try {
        // Entriamo subito in modalità lettura
        setIsHomeView(false);
        // Se non abbiamo immagini caricate per la pagina corrente, attiviamo la modalità semplificata
        const hasImage = Boolean(loadedSources[targetPage]);
        setIsReaderMode(!hasImage);

        // TASK 39: Load PDF with Retry Logic
        // Handle "Original PDF not found" race condition
        let pdfPath = data.originalFilePath;

        if (!pdfPath) {
          // Try to fetch path from library if missing in JSON
          const pdfPathRes = await window.electronAPI.getOriginalPdfPath(targetFileId);
          if (pdfPathRes?.success && pdfPathRes?.path) {
            pdfPath = pdfPathRes.path;
          }
        }

        // Retry loop if path is missing but expected
        if (!pdfPath && data.originalFilePath) {
          for (let attempt = 0; attempt < 3; attempt++) {
            log.info(`[App] Retry fetching PDF path (attempt ${attempt + 1})...`);
            await new Promise(r => setTimeout(r, 500));
            const retryRes = await window.electronAPI.getOriginalPdfPath(targetFileId);
            if (retryRes?.success && retryRes?.path) {
              pdfPath = retryRes.path;
              break;
            }
          }
        }

        if (pdfPath && !data.originalFilePath) {
          try {
            await library.updateLibrary(targetFileId, { fileId: targetFileId, originalFilePath: pdfPath, hasSafePdf: true });
          } catch { }
        }

        if (!pdfPath && data.originalFilePath) {
          try {
            const recopyRes = await window.electronAPI.copyOriginalPdf({ fileId: targetFileId, sourcePath: data.originalFilePath });
            if (recopyRes?.success && recopyRes?.path) pdfPath = recopyRes.path;
          } catch { }
        }

        // Se il PDF non viene trovato nei percorsi noti, NON apriamo il selettore file automaticamente.
        // Lo faremo solo se l'utente prova a fare un'azione che richiede il PDF (es. re-render).
        // Per ora, proseguiamo con quello che abbiamo.

        if (pdfPath) {
          try {
            log.info(`[App] 📄 Caricamento PDF sorgente: ${pdfPath}`);

            // BACKFILL FINGERPRINT if missing
            if (!(data as any).fingerprint && window.electronAPI?.calculateFileFingerprint) {
              const fp = await window.electronAPI.calculateFileFingerprint(pdfPath);
              if (fp) {
                log.info(`Backfilling fingerprint for ${data.fileName}: ${fp}`);
                await library.updateLibrary(fileId, { fileId, fingerprint: fp }, 'CRITICAL');
                (data as any).fingerprint = fp; // Update local reference
              }
            }

            const buffer = await window.electronAPI.readPdfFile(pdfPath);
            log.info(`[App] PDF letto in memoria (${Math.round(buffer.byteLength / 1024 / 1024)} MB). Parsing...`);

            const pdf = await pdfjsLib.getDocument({
              data: buffer,
              cMapUrl: './pdfjs/cmaps/',
              cMapPacked: true,
              standardFontDataUrl: './pdfjs/standard_fonts/'
            }).promise;

            // NOTE: We do NOT use PDF.js fingerprint anymore, as we rely on the SHA256 file hash
            // calculated via calculateFileFingerprint above. This ensures stricter file identity.


            setPdfDoc(pdf);
            setMetadata({ name: data.fileName, size: 0, totalPages: pdf.numPages });

            // FIX: Ensure totalPages is synced to disk if it differs from JSON
            // This prevents "8 pages" issues if the JSON was corrupted/guessed while the PDF has 20.
            if (data.totalPages !== pdf.numPages) {
              log.info(`Discrepanza pagine rilevata: JSON=${data.totalPages} vs PDF=${pdf.numPages}. Aggiornamento metadati in corso...`);
              void library.updateLibrary(fileId, { fileId, totalPages: pdf.numPages });
            }

            // Se il PDF è caricato con successo, possiamo uscire dalla modalità "solo testo"
            setIsReaderMode(false);
            log.success(`[App] PDF caricato correttamente (${pdf.numPages} pagine)`);

            // Generate thumbnail if missing
            if (!loadedSources[1]) {
              const canvas = document.createElement('canvas');
              try {
                const page = await pdf.getPage(1);
                const viewport = page.getViewport({ scale: 1.5 });
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  await (page as any).render({ canvasContext: ctx, viewport }).promise;
                  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                  const res = await window.electronAPI.saveProjectImage({
                    fileId: targetFileId,
                    page: 1,
                    kind: 'source',
                    dataUrl
                  });
                  if (res.success) {
                    setPageImagesIndex(prev => ({ ...prev, sources: { ...prev.sources, [1]: 'source-p1.jpg' } }));
                    pageImagesIndexRef.current.sources[1] = 'source-p1.jpg';
                    library.refreshLibrary();
                  } else {
                    log.error(`Failed to save project image for file ${targetFileId}`, res.error);
                  }
                }
              } catch (e) {
                log.error(`Failed to generate missing thumbnail for file ${targetFileId}`, e);
              } finally {
                canvas.width = 0;
                canvas.height = 0;
              }
            }
          } catch (err) {
            log.warning("PDF originale non trovato o corrotto. Apertura in modalità 'Solo Testo'.");
            setPdfDoc(null);
          }
        } else {
          log.info("PDF originale non trovato nei percorsi salvati. Modalità 'Solo Testo' attiva.");
          setPdfDoc(null);

          if (data.originalFilePath) {
            showConfirm(
              "File PDF Mancante",
              "Il file PDF originale non è stato trovato. Vuoi ricollegarlo manualmente?",
              async () => {
                try {
                  const newPath = await window.electronAPI.openFileDialog();
                  if (newPath) {
                    log.step(`Ricollegamento PDF: ${newPath}`);
                    const res = await window.electronAPI.copyOriginalPdf({ fileId: targetFileId, sourcePath: newPath });
                    if (res?.success) {
                      log.success("PDF ricollegato con successo. Ricaricamento...");
                      setTimeout(() => {
                        openingProjectRef.current = null; // Reset lock
                        handleOpenProject(targetFileId);
                      }, 500);
                    } else {
                      log.error("Errore ricollegamento PDF", res?.error);
                      showToast("Errore durante il ricollegamento.", 'error');
                    }
                  }
                } catch (e) {
                  log.error("Eccezione ricollegamento", e);
                }
              },
              'alert'
            );
          }
        }

        // Fine caricamento: ripristiniamo la pausa se le API sono configurate
        setIsPaused(!isApiConfigured);

        const duration = Math.round(performance.now() - switchStartTime);
        log.success(`[App] ✅ Cambio progetto completato con successo in ${duration}ms`);
      } catch (e) {
        log.error("Errore apertura progetto", e);
        setIsPaused(false);
      }
    } finally {
      if (openingProjectRef.current === targetFileId) {
        openingProjectRef.current = null;
      }
      setIsOpeningProject(null);
    }

  }, [library, defaultLang, translation, annotations, quality]);

  const continueUploadWithLanguage = useCallback(async (file: File, lang: string, groups: string[] | undefined, stableFileId: string) => {
    const sourcePath = (file as any).path || '';

    // SMART IMPORT: Check if we already have this file in our library
    // This prevents creating a new ID (and thus a new file) if we've already imported 
    // and potentially renamed this PDF.
    if (sourcePath && window.electronAPI?.calculateFileFingerprint) {
      // 1. Calculate fingerprint
      const fingerprint = await window.electronAPI.calculateFileFingerprint(sourcePath);

      // 2. Check for duplicates by fingerprint OR path (normalized)
      const normalizePath = (p: string) => p.toLowerCase().replace(/\\/g, '/').trim();
      const normalizedSource = normalizePath(sourcePath);

      let existingBook = Object.values(library.recentBooks).find(b => {
        // Strict Fingerprint Match (Best)
        if (fingerprint && b.fingerprint === fingerprint) return true;

        // Path Match (Normalized)
        if (b.originalFilePath) {
          if (b.originalFilePath === sourcePath) return true;
          // CRITICAL FIX: Also check if path points to the assets folder of this project ID (UUID based)
          // This handles cases where file was moved but structure is intact
          if (normalizePath(b.originalFilePath) === normalizedSource) return true;
        }
        return false;
      });

      if (existingBook) {
        log.info(`Smart Import: Trovato progetto esistente per questo PDF: ${existingBook.fileName} (${existingBook.fileId}) [Fingerprint match: ${Boolean(fingerprint && existingBook.fingerprint === fingerprint)}]`);

        const existingId = String(existingBook.fileId || '').trim();
        if (!existingId) {
          log.warning('Smart Import: progetto esistente trovato ma fileId mancante. Operazione annullata.');
          return;
        }

        // If the language matches or we want to update it, we can just open it
        // We might want to update the language if it's different
        if (existingBook.inputLanguage !== lang) {
          await library.updateLibrary(existingId, { fileId: existingId, inputLanguage: lang });
        }

        // Ensure we backfill fingerprint if the existing match was only by path
        if (fingerprint && !existingBook.fingerprint) {
          await library.updateLibrary(existingId, { fileId: existingId, fingerprint });
        }

        // Update path if it changed (e.g. file moved but fingerprint matched)
        if (existingBook.originalFilePath !== sourcePath) {
          await library.updateLibrary(existingId, { fileId: existingId, originalFilePath: sourcePath });
        }

        await handleOpenProject(existingId);
        return;
      }
    } else if (sourcePath) {
      // Fallback for path-only check if fingerprinting fails or API missing
      const normalizePath = (p: string) => p.toLowerCase().replace(/\\/g, '/').trim();
      const normalizedSource = normalizePath(sourcePath);

      const existingBook = Object.values(library.recentBooks).find(b => {
        if (!b.originalFilePath) return false;
        return normalizePath(b.originalFilePath) === normalizedSource;
      });

      if (existingBook) {
        log.info(`Smart Import (Path Only): Trovato progetto esistente: ${existingBook.fileName}`);
        const existingId = String(existingBook.fileId || '').trim();
        if (!existingId) {
          log.warning('Smart Import: progetto esistente trovato ma fileId mancante. Operazione annullata.');
          return;
        }
        if (existingBook.inputLanguage !== lang) {
          await library.updateLibrary(existingId, { fileId: existingId, inputLanguage: lang });
        }
        await handleOpenProject(existingId);
        return;
      }
    }

    const originalFileName = file.name;
    const fileId = ensureJsonExtension(stableFileId);

    const doUpload = async (projectName: string) => {
      try {
        log.step(`Avvio elaborazione PDF: ${projectName} (Lingua: ${lang})...`);

        // CRITICAL: Flush pending saves before starting a new heavy operation
        await library.flushSaves();

        const buffer = await file.arrayBuffer();
        const pdfParseBuffer = buffer.slice(0);
        const safeSaveBuffer = buffer.slice(0);
        let finalPath: string | undefined = undefined;
        let hasSafePdf = false;

        // 1. Load PDF and prepare state (Validate PDF Integrity)
        const pdfDoc = await pdfjsLib.getDocument({
          data: pdfParseBuffer,
          cMapUrl: './pdfjs/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: './pdfjs/standard_fonts/'
        }).promise;

        // 2. Initialize Project Shell AFTER validation to reserve the UUID
        if (window.electronAPI?.initProjectShell) {
          await window.electronAPI.initProjectShell({
            fileId,
            fileName: projectName,
            inputLanguage: lang,
            groups
          });
        }

        // CRITICAL FIX: Block saves for the OLD project before switching
        if (library.currentProjectFileId) {
          library.blockSave(library.currentProjectFileId, 10000);
        }

        // 3. Set Active Project ID immediately to lock the session to the new UUID
        library.setCurrentProjectFileId(fileId);

        // 4. Save PDF buffer (Atomic)
        if (window.electronAPI?.saveOriginalPdfBuffer) {
          try {
            window.electronAPI.logToMain?.({
              level: 'info',
              message: 'Upload PDF: avvio salvataggio copia safe (CAS/fingerprint)',
              meta: {
                fileName: projectName,
                fileId,
                sourcePathPresent: Boolean(sourcePath),
                saveOriginalPdfBufferType: typeof (window.electronAPI as any)?.saveOriginalPdfBuffer,
                copyOriginalPdfType: typeof (window.electronAPI as any)?.copyOriginalPdf
              }
            });
          } catch { }

          try {
            const saveRes = await window.electronAPI.saveOriginalPdfBuffer({
              fileId,
              buffer: new Uint8Array(safeSaveBuffer),
              fileName: projectName
            });

            if (saveRes?.success && saveRes?.isDuplicate && saveRes?.fileId) {
              // If it's a duplicate, we abort the new project creation and switch to the existing one.
              // We must unblock saves first if we blocked them.
              if (library.currentProjectFileId) {
                library.unblockSave(library.currentProjectFileId);
              }

              await library.refreshLibrary();
              await handleOpenProject(saveRes.fileId);
              return;
            }

            if (saveRes?.success && saveRes?.path) {
              finalPath = saveRes.path;
              hasSafePdf = true;
            } else if (saveRes?.success && saveRes?.fileId && saveRes?.fileId !== fileId) {
              await library.refreshLibrary();
              await handleOpenProject(saveRes.fileId);
              return;
            } else if (saveRes?.success === false) {
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

          if (!finalPath && sourcePath && window.electronAPI?.copyOriginalPdf) {
            try {
              const copyRes = await window.electronAPI.copyOriginalPdf({ fileId, sourcePath, fileName: projectName });
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
            } catch (e) {
              try {
                window.electronAPI.logToMain?.({
                  level: 'error',
                  message: 'Upload PDF: eccezione durante copia da path',
                  meta: { fileId, sourcePathPresent: Boolean(sourcePath), error: (e as any)?.message || String(e) }
                });
              } catch { }
            }
          }
        }

        if (!finalPath) finalPath = sourcePath;

        // 5. Initialize the core project metadata into library memory FIRST,
        // so that any sub-components that react to 'currentProjectFileId' 
        // will find a fully valid project state with a 'fileName'.
        if (window.electronAPI) {
          await library.updateLibrary(fileId, {
            fileId,
            fileName: projectName,
            originalFilePath: finalPath,
            hasSafePdf,
            totalPages: pdfDoc.numPages,
            inputLanguage: lang,
            groups: groups || []
          }, 'CRITICAL');
        }

        // Detach metadata to stop side-effects from useAppAnnotations
        setMetadata(null);

        // Initial reset for new session
        resetProjectState(`New Upload: ${projectName}`);
        pdfRenderAnalytics.reset();

        // 6. Set Active Project ID (triggers hooks)
        library.setCurrentProjectFileId(fileId);

        setPdfDoc(pdfDoc);
        setMetadata({ name: projectName, size: buffer.byteLength, totalPages: pdfDoc.numPages });
        setDocInputLanguage(lang);
        setDefaultLang(lang);
        setIsHomeView(false);
        const canTranslate = Boolean(isApiConfigured);
        setIsTranslatedMode(canTranslate);
        setIsManualMode(!canTranslate);
        setIsPaused(!canTranslate);
        setIsReaderMode(false);
        lastSavedPageRef.current = 1;
        setCurrentPage(1);
        setPreviewPage(null);
        setNotesPage(null);

        if (!canTranslate) {
          showConfirm(
            "API non configurate",
            "Hai caricato il PDF correttamente, ma per avviare la traduzione serve una API key nelle Impostazioni.",
            () => setIsSettingsOpen(true),
            'alert'
          );
        }

        isProjectLoadedRef.current = true;

        // Metadata detection & Thumbnail generation
        try {
          const images: string[] = [];
          appendAutodetectLog("Preparazione miniature per riconoscimento titolo...");
          // Generate thumbnails for up to 5 pages (was 3) to improve metadata extraction context
          for (let i = 1; i <= Math.min(5, pdfDoc.numPages); i++) {
            const canvas = document.createElement('canvas');
            try {
              const page = await pdfDoc.getPage(i);
              const viewport = page.getViewport({ scale: 1.5 });
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                await (page as any).render({ canvasContext: ctx, viewport }).promise;
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                const base64 = dataUrl.split(',')[1];
                images.push(base64);
                appendAutodetectLog(`Miniatura pagina ${i}/${Math.min(5, pdfDoc.numPages)} pronta`);

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
            } finally {
              canvas.width = 0;
              canvas.height = 0;
            }
          }

          if (images.length > 0 && isApiConfigured) {
            try {
              setIsAutodetecting(true);
              setAutodetectLogs('');
              appendAutodetectLog("Ricerca nome libro con AI in corso...");
              
              const metaProvider = aiSettings.metadataExtraction?.provider || aiSettings.provider;
              appendAutodetectLog(`Provider: ${metaProvider}`);
              appendAutodetectLog(`Miniature pronte (${images.length})`);
              appendAutodetectLog("Invio richiesta...");
              log.step("Autodetect metadati in corso...");
              
              const meta = await extractMetadataAdapter(images, aiSettings, { targetLanguage: lang });
              appendAutodetectLog("Risposta ricevuta");

              const y = sanitizeMetadataField(meta.year || "");
              const a = sanitizeMetadataField(meta.author || "");
              const t = sanitizeMetadataField(meta.title || "");
              appendAutodetectLog(`Titolo: ${t || 'N/D'}`);
              appendAutodetectLog(`Autore: ${a || 'N/D'}`);
              appendAutodetectLog(`Anno: ${y || 'N/D'}`);

              if (t && t !== 'Untitled' && t.length > 2) {
                const yearPart = y && y !== '0000' && y !== 'Unknown' ? `${y}_` : "";
                const authorPart = a && a !== 'Unknown' ? `${a}_` : "";
                const newName = `${yearPart}${authorPart}${t}`;
                appendAutodetectLog(`Nome proposto: ${newName}`);

                if (newName.length > 5 && newName !== projectName) {
                  const res = await window.electronAPI.setDisplayName({ fileId, displayName: newName });
                  if (res?.success) {
                    log.success(`Nome aggiornato automaticamente: ${newName}`);
                    appendAutodetectLog("Nome aggiornato");
                    setMetadata(prev => prev ? ({ ...prev, name: newName }) : prev);

                    // CRITICAL FIX: Synchronize local state immediately to avoid race conditions with saves
                    if (library.registerNameChange) {
                      library.registerNameChange(fileId, newName);
                    }

                    library.refreshLibrary();
                  } else {
                    log.warning(`Aggiornamento nome fallito: ${res?.error || 'Errore sconosciuto'}`);
                    appendAutodetectLog(`Aggiornamento nome fallito: ${res?.error || 'Errore sconosciuto'}`);
                  }
                } else {
                  log.info(`Salto rinomina: nome identico o troppo corto (${newName})`);
                  appendAutodetectLog(`Salto rinomina: nome identico o troppo corto (${newName})`);
                }
              } else {
                log.warning("Salto rinomina: titolo non trovato o non valido nell'estrazione AI", { meta });
              }
            } catch (e) {
              log.error("Errore autodetect metadati", e);
              appendAutodetectLog(`Errore ricerca nome: ${e instanceof Error ? e.message : String(e)}`);
            } finally {
              setIsAutodetecting(false);
            }
          }
        } catch (e) { log.error("Errore generazione anteprima/metadati", e); }

      } catch (e) {
        log.error("Errore caricamento PDF", e);
      }
    };

    await doUpload(originalFileName);
  }, [aiSettings, library, translation, annotations, quality, isApiConfigured, showConfirm, setIsSettingsOpen, appendAutodetectLog]);

  const renderPage = useCallback(async (pageNum: number, cRef: React.RefObject<HTMLCanvasElement | null>) => {
    if (!pdfDoc || !cRef.current) return;
    const canvas = cRef.current;
    const refIdx = allRefs.indexOf(cRef as any);
    const canvasKey = refIdx !== -1 ? `canvas_${refIdx}` : 'default';

    const rotation = pageRotationsRef.current?.[pageNum] || 0;
    const last = lastRenderedRef.current[canvasKey];
    if (last && last.page === pageNum && Math.abs(last.scale - renderScale) < 0.001 && last.rotation === rotation) {
      return;
    }

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
        lastRenderedRef.current[canvasKey] = { page: pageNum, scale: renderScale, rotation, timestamp: Date.now() };
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

  const handleExportOriginalPdf = useCallback(async () => {
    if (!library.currentProjectFileId) return;
    try {
      const result = await window.electronAPI.exportOriginalPdf(library.currentProjectFileId);
      if (result.success) {
        log.success("PDF originale esportato con successo.");
      } else if (result.canceled) {
        // User canceled
      } else {
        log.error("Errore esportazione PDF originale", result.error);
        showToast(result.error || "Errore esportazione", 'error');
      }
    } catch (e: any) { log.error("Errore fatale esportazione PDF originale", e); }
  }, [library.currentProjectFileId, showToast]);

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
      } else {
        showToast('Importazione annullata o progetto non valido.', 'warning');
      }
    } catch (e) {
      log.error("Errore importazione", e);
      showToast('Impossibile importare il progetto. Riprova.', 'error');
    }
  }, [library, handleOpenProject, showToast]);

  const handleRotatePage = useCallback(async (page: number, deg: number) => {
    const current = pageRotations[page] || 0;
    const next = (current + deg) % 360;
    setPageRotations(prev => ({ ...prev, [page]: next }));

    // Puliamo la cache per forzare il ricaricamento/rendering con la nuova rotazione
    setOriginalImages((prev: Record<number, string>) => {
      const nextMap = { ...prev };
      if (nextMap[page]) {
        revokeObjectURL(nextMap[page]);
        delete nextMap[page];
      }
      return nextMap;
    });
    setCroppedImages((prev: Record<number, string>) => {
      const nextMap = { ...prev };
      if (nextMap[page]) {
        revokeObjectURL(nextMap[page]);
        delete nextMap[page];
      }
      return nextMap;
    });
  }, [pageRotations]);

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
      if (next[page]) {
        revokeObjectURL(next[page]);
        delete next[page];
      }
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
    if (isPaused) {
      const isQueued = translation.getQueue().includes(page);
      const isActive = translation.activePagesRef.current.has(page);
      const hasPartial = Boolean(translation.partialTranslations?.[page]?.trim());
      const hasStatus = Boolean(translation.pageStatusRef.current?.[page]?.loading || translation.pageStatusRef.current?.[page]?.processing);

      if (isQueued || isActive || hasPartial || hasStatus) {
        setIsPaused(false);
        return;
      }
    }

    setIsPaused(false);
    translation.retranslatePage(page);
  }, [isApiConfigured, showConfirm, translation, setIsSettingsOpen, setIsPaused, isPaused]);

  const handleTogglePauseActiveProject = useCallback(() => {
    if (!isPaused) {
      translation.pauseAllTranslations();
      setIsPaused(true);
      return;
    }
    setIsPaused(false);
  }, [isPaused, setIsPaused, translation]);

  const handleStopActiveProject = useCallback(() => {
    translation.stopAllTranslations(true);
    setIsPaused(true);
  }, [setIsPaused, translation]);

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
    setIsPaused(false);
    pages.forEach(p => translation.retranslatePage(p));
  }, [isApiConfigured, showConfirm, translation, setIsSettingsOpen, setIsPaused]);

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
    if (translation.queueStats.active > 0) {
      translationManager.notifyActiveTranslationStarted();
    }
  }, [translation.queueStats.active]);

  useEffect(() => {
    const next = pendingAutoStartRef.current;
    if (!next) return;
    if (!pdfDoc) return;
    if (isManualMode) return;
    if (!isApiConfigured) return;
    if (docInputLanguage.trim().toLowerCase() !== next.language.trim().toLowerCase()) return;
    pendingAutoStartRef.current = null;
    translation.retranslatePage(next.page);
  }, [autoTranslateTimerRef]);

  // FIX: Cache prefetch value to avoid localStorage reads on every render
  const prefetchPagesValue = useMemo(() => {
    const rawPrefetch = storage.getItem('auto_prefetch_pages');
    const parsedPrefetch = rawPrefetch ? Number(rawPrefetch) : 2;
    return Math.max(0, Math.min(10, Number.isFinite(parsedPrefetch) ? Math.floor(parsedPrefetch) : 2));
  }, []);

  useEffect(() => {
    if (autoTranslateTimerRef.current) {
      window.clearTimeout(autoTranslateTimerRef.current);
      autoTranslateTimerRef.current = null;
    }
    if (isManualMode) return;
    if (isPaused) return;
    if (isConsultationMode) return;
    if (!isApiConfigured) return;

    // SAFETY: Do not start prefetch/auto-translate if project is not fully loaded
    if (!isProjectLoadedRef.current) return;

    // Se l'app non è focalizzata o l'utente è inattivo, non avviamo nuove traduzioni automatiche
    // Questo evita "scritture fantasma" quando l'utente non sta usando l'app.
    if (!isFocused || isIdle) return;

    const total = pdfDoc?.numPages || metadata?.totalPages || 0;
    if (total <= 0) return;

    const prefetchPages = prefetchPagesValue;

    const visiblePages = [currentPage].filter(p => p >= 1 && p <= total);
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

        // FIX: Stop prefetching if we encounter an error.
        // This prevents eager rendering of future pages when the current/previous page is blocked,
        // saving CPU/RAM and preventing "obsolete" work if the user needs to change parameters (e.g. brightness).
        if (hasError) break;

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
    pdfDoc,
    metadata,
    isHomeView,
    isManualMode,
    isPaused,
    isApiConfigured,
    translation.enqueueTranslation,
    translation.shouldSkipTranslation,
    translation.pageStatusRef,
    translation.translationMap,
    isFocused,
    isIdle
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

      // Miniature (PagePreviewStrip)
      if (showPreviewStrip && !target.closest('.preview-strip-container') && !target.closest('.preview-strip-trigger')) {
        setShowPreviewStrip(false);
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
    if (!isBatchProcessing) {
      prevIsBatchProcessingRef.current = false;
      return;
    }
    if (isManualMode) {
      setIsBatchProcessing(false);
      return;
    }
    if (isConsultationMode) {
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

    const isStarting = !prevIsBatchProcessingRef.current;
    prevIsBatchProcessingRef.current = true;

    let runId = batchRunIdRef.current;
    const total = pdfDoc.numPages || 0;

    if (isStarting) {
      runId += 1;
      batchRunIdRef.current = runId;
      const startPage = currentPage;

      log.step("Traduci tutto avviato", { totalPages: total, startPage });

      // Fix: Use batch enqueue to prevent UI freeze and log spam (STALLED warnings)
      // This queues all pages at once and triggers pumpQueue only once.
      const pagesToQueue: number[] = [];
      for (let p = 1; p <= total; p += 1) {
        const already = typeof translation.translationMap[p] === 'string' && translation.translationMap[p].trim().length > 0;
        const hasError = Boolean(translation.pageStatus[p]?.error);
        if (!already && !hasError) pagesToQueue.push(p);
      }

      if (pagesToQueue.length > 0) {
        translation.enqueueMultipleTranslations(pagesToQueue, { priority: 'back' });
      }
    }

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
      const queued = translation.queueStats.queued;

      // Stop if everything is done OR if the queue/active are empty (deadlock/finished state)
      if (remaining === 0 || (active === 0 && queued === 0)) {
        setIsBatchProcessing(false);
        if (remaining === 0) {
          log.success("Traduci tutto completato.");
        } else {
          log.warning(`Traduci tutto terminato con ${remaining} pagine incomplete (coda vuota).`);
        }
      }
    }, 500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isBatchProcessing, pdfDoc, isApiConfigured, currentPage, translation, showConfirm, setIsSettingsOpen]);

  const getPageStatus = useCallback((p: number) => {
    if (translation.pageStatus[p]?.error) return 'error';
    if (translation.pageStatus[p]?.processing || translation.pageStatus[p]?.loading) return 'in_progress';
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
        Boolean(coverModalFileId) ||
        Boolean(cropModal) ||
        Boolean(pendingReplacement) ||
        Boolean(pageSelectionModal?.isOpen) ||
        Boolean(confirmModal?.isOpen) ||
        previewPage != null ||
        notesPage != null
      ) {
        return;
      }

      const step = 1;
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
    search.searchOpen,
    isSettingsOpen,
    uploadPromptOpen,
    editLanguagePromptOpen,
    renameState,
    createGroupModalOpen,
    activeGroupModalBookId,
    coverModalFileId,
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

    let timeoutId: number | null = null;
    const onResize = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(update, 150);
    };

    window.addEventListener('resize', onResize);
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [isHomeView]);

  useEffect(() => {
    if (!pdfDoc) return;

    let cancelled = false;
    const timeouts: number[] = [];

    const schedule = (fn: () => void, delayMs: number) => {
      const id = window.setTimeout(fn, delayMs);
      timeouts.push(id);
    };

    const tryRender = (page: number, ref: React.RefObject<HTMLCanvasElement | null>, attempt: number) => {
      if (cancelled) return;

      if (!ref.current) {
        if (attempt < 2) {
          schedule(() => tryRender(page, ref, attempt + 1), 100);
        }
        return;
      }

      void renderPage(page, ref);
    };

    Object.entries(canvasRefsMap).forEach(([p, ref]) => {
      tryRender(Number(p), ref, 0);
    });

    return () => {
      cancelled = true;
      timeouts.forEach((id) => window.clearTimeout(id));
    };
  }, [pdfDoc, canvasRefsMap, renderScale, renderPage, pageRotations]);

  useEffect(() => {
    const target = String(brightness);
    if (storage.getItem('reader_brightness') !== target) {
      storage.setItem('reader_brightness', target);
    }
  }, [brightness]);

  useEffect(() => {
    const target = String(temperature);
    if (storage.getItem('reader_temperature') !== target) {
      storage.setItem('reader_temperature', target);
    }
  }, [temperature]);

  useEffect(() => {
    if (storage.getItem('translation_theme') !== translationTheme) {
      storage.setItem('translation_theme', translationTheme);
    }
  }, [translationTheme]);

  // Generate analytics report when PDF changes or significant rendering events occur
  useEffect(() => {
    if (pdfDoc) {
      const analytics = pdfRenderAnalytics.getAnalytics();
      if (analytics.totalAttempts > 0) {
        log.info('PDF Render Analytics Update', {
          totalAttempts: analytics.totalAttempts,
          successRate: analytics.successfulRenders / analytics.totalAttempts * 100,
          corruptedPages: analytics.corruptedPages.size,
          averageAttempts: analytics.averageAttemptsPerPage
        });

        // Generate detailed report if there are corrupted pages
        if (analytics.corruptedPages.size > 0) {
          const report = pdfRenderAnalytics.generateReport();
          log.warning('PDF Render Issues Detected', report);
        }
      }
    }
  }, [pdfDoc, corruptedPages]);

  useEffect(() => {
    const target = String(columnLayout);
    if (storage.getItem('reader_column_layout') !== target) {
      storage.setItem('reader_column_layout', target);
    }
  }, [columnLayout]);

  useEffect(() => {
    const target = String(scale);
    if (storage.getItem('page_scale') !== target) {
      storage.setItem('page_scale', target);
    }
  }, [scale]);


  const closeSession = useCallback(async () => {
    if (isClosingSessionRef.current) return;
    isClosingSessionRef.current = true;
    setIsClosingSession(true);
    try {
      log.step("Chiusura sessione: salvataggio modifiche pendenti...");
      if (library.currentProjectFileId && currentPageRef.current) {
        const payload: any = { lastPage: currentPageRef.current };
        if (pageDimsRef.current && Object.keys(pageDimsRef.current).length > 0) {
          payload.pageDims = pageDimsRef.current;
        }
        const fileId = library.currentProjectFileId;
        await library.updateLibrary(fileId, { fileId, ...payload }, 'CRITICAL', true);
      }
      await library.flushSaves();
      setPdfDoc(null);
      setMetadata(null);
      setIsReaderMode(false);
      library.setCurrentProjectFileId(null);
      resetProjectState("Close Session");
    } finally {
      setIsClosingSession(false);
      setTimeout(() => {
        isClosingSessionRef.current = false;
      }, 1000);
    }
  }, [library, resetProjectState]);

  return (
    <LibraryContext.Provider value={library}>
      {showSplash && (
        <SplashScreen version={appVersion} onDismiss={() => setShowSplash(false)} />
      )}
      <div className="w-screen flex flex-col bg-[#1e1e1e] text-gray-200 overflow-hidden font-sans select-none" style={{ height: '100dvh' }}>
        {isConsultationMode && (
          <div className="bg-blue-600/90 text-white text-[10px] font-bold py-1 px-4 text-center z-[100] border-b border-blue-400/20 backdrop-blur-sm">
            MODALITÀ CONSULTAZIONE - SOLO LETTURA (FUNZIONI AI DISABILITATE)
          </div>
        )}
        <Header
          showActions={!showHome}
          hasSession={hasSession}
          metadata={metadata}
          isBatchProcessing={isBatchProcessing}
          isPaused={isPaused}
          viewMode={viewMode}
          scale={scale}
          canVerifyAll={quality.canVerifyAll}
          verificationStats={quality.verificationQueueStats}
          brightness={brightness}
          temperature={temperature}
          onBatch={() => { setIsTranslatedMode(true); setIsPaused(false); setIsBatchProcessing(true); }}
          onExport={handleExport}
          onExportPdf={handleExportPdf}
          onExportOriginalPdf={handleExportOriginalPdf}
          onImportProject={handleImportProject}
          onSettings={() => setIsSettingsOpen(true)}
          onVerifyAll={quality.verifyAllTranslatedPages}
          searchFilters={search.filters}
          onSearchFilterChange={search.setFilter}
          searchResults={search.searchResults}
          onSearchResultSelect={handleSearchResultSelect}
          statusBadge={statusBadge}
          onToggleView={() => setViewMode((v) => (v === 'auto' ? 'single' : v === 'single' ? 'spread' : 'auto'))}
          onScale={setScale}
          onBrightnessChange={setBrightness}
          onTemperatureChange={setTemperature}
          onToggleControls={() => setShowControls(!showControls)}
          onRedoAll={redoAllPages}
          onReset={() => {
            if (!isHomeView && library.currentProjectFileId && currentPage) {
              const payload: any = { lastPage: currentPage };
              if (pageDims && Object.keys(pageDims).length > 0) {
                payload.pageDims = pageDims;
              }
              const fileId = library.currentProjectFileId;
              void library.updateLibrary(fileId, { fileId, ...payload }, 'CRITICAL', true);
            }
            setIsHomeView(!isHomeView);
          }}
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
          isConsultationMode={isConsultationMode}
        />

        {showControls && (
          <ControlsBar
            brightness={brightness} temperature={temperature} translationTheme={translationTheme} scale={scale}
            onScale={setScale} onBrightnessChange={setBrightness} onTemperatureChange={setTemperature} onThemeChange={setTranslationTheme}
            viewMode={viewMode} onViewModeChange={setViewMode}
            columnLayout={columnLayout} onColumnLayoutChange={setColumnLayout}
            navigationMode={navigationMode} onNavigationModeChange={setNavigationMode}
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
              isDragging={isDragging}
              isApiConfigured={isApiConfigured}
              openMenuId={openMenuId}
              pkgVersion={appVersion}
              onRequestCloseSession={() => {
                showConfirm(
                  "Chiudere la sessione?",
                  "Verrà salvata l'ultima pagina e tornerai alla Libreria.",
                  () => {
                    void closeSession();
                  },
                  'info'
                );
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
                    const fileId = crypto.randomUUID();
                    const stableFileId = ensureJsonExtension(fileId);
                    setPendingUpload({ file, fileId: stableFileId });
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
              onRenameProject={(id: string, name: string, e: any, lang?: string) => { e?.stopPropagation(); setRenameState({ fileId: id, currentName: name, currentLang: lang }); }}
              onEditLanguageProject={(id: string, lang: string) => { setEditLanguageTarget({ fileId: id, currentLang: lang }); setEditLanguagePromptOpen(true); }}
              onDeleteProject={async (id: string, e: any) => {
                e?.stopPropagation();
                const deleted = await library.deleteProject(id);
                if (deleted && library.currentProjectFileId === id) {
                  setPdfDoc(null);
                  setMetadata(null);
                  setIsReaderMode(false);
                  library.setCurrentProjectFileId(null);
                  resetProjectState("Project Deleted");
                }
              }}
              onCreateGroup={() => setCreateGroupModalOpen(true)}
              onSetOpenMenuId={setOpenMenuId}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onManageGroups={setActiveGroupModalBookId}
              onExportGpt={handleExportById}
              onManageCover={setCoverModalFileId}
              isConsultationMode={isConsultationMode}
              isActiveProjectPaused={isPaused}
              activeProjectQueueStats={combinedQueueStats}
              onPauseActiveProject={handleTogglePauseActiveProject}
              onStopActiveProject={handleStopActiveProject}
              isOpeningProject={isOpeningProject}
              isClosingSession={isClosingSession}
            />
          ) : (
            <ReaderView
              key={`reader-${projectKey}`}
              pages={allPages}
              pdfDoc={pdfDoc}
              currentPage={currentPage}
              navigationMode={navigationMode}
              viewMode={viewMode === 'spread' ? 'side-by-side' : 'single'}
              pageDims={pageDims}
              scale={scale}
              isTranslatedMode={isTranslatedMode || isReaderMode}
              isManualMode={isManualMode}
              previewPage={previewPage}
              onPreviewPageChange={setPreviewPage}
              onOpenOriginalPage={(p: number) => {
                setCurrentPage(p);
                setPreviewPage(p);
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
              onFixPage={(p, opts) => {
                log.info(`[UI] Azione 'Rifai con suggerimenti' per pagina ${p}`, opts);
                setIsPaused(false);
                setIsManualMode(false);
                quality.fixTranslation(p, opts);
              }}
              onRetryAllCritical={handleRetryAllCritical}

              onScaleChange={setScale}
              showConfirm={showConfirm}
              pageRotations={pageRotations}
              bottomPadding={bottomBarHeight + 120}
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
              queueStats={combinedQueueStats}
              isPaused={isPaused}
              isTranslatedMode={isTranslatedMode}
              isManualMode={isManualMode}
              previewPage={previewPage}
              verificationMap={quality.verificationMap}
              annotationMap={annotationMap}
              translationMap={translation.translationMap}
              currentPages={[currentPage]}
              onPrevPage={() => {
                const step = (navigationMode === 'flip' && viewMode === 'spread') ? 2 : 1;
                setCurrentPage((p: number) => Math.max(1, p - step));
              }}
              onNextPage={() => {
                const step = (navigationMode === 'flip' && viewMode === 'spread') ? 2 : 1;
                setCurrentPage((p: number) => Math.min(totalPages, p + step));
              }}
              onTogglePreviewStrip={() => setShowPreviewStrip(!showPreviewStrip)}
              onTogglePause={handleTogglePauseActiveProject}
              onStop={handleStopActiveProject}
              onRetranslatePages={handleRetranslatePages}

              onOpenOriginalPreview={() => setPreviewPage(currentPage)}
              onToggleManualMode={() => setIsManualMode(!isManualMode)}
              onOpenNotes={(p: number | null) => setNotesPage(p)}
              isConsultationMode={isConsultationMode}
            />
          )}

          {showPreviewStrip && !showHome && previewPage == null && (
            <div className="fixed top-[60px] left-0 w-full z-[190] px-8 animate-in slide-in-from-top-4 fade-in duration-300">
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

        {/* PDF Render Error Notification */}
        <PdfRenderErrorNotification
          corruptedPages={corruptedPages}
          failedRenders={failedRenders}
          onDismiss={() => {
            log.info('User dismissed PDF render error notification');
          }}
          onSkipPage={(pageNum) => {
            log.info(`User chose to skip corrupted page ${pageNum}`);
            setCorruptedPages(prev => {
              const updated = new Set(prev);
              updated.delete(pageNum);
              return updated;
            });
          }}
        />

        {/* Hidden File Input */}
        <input type="file" ref={fileInputRef} className="hidden" accept="application/pdf" onChange={(e: any) => {
          const file = e.target.files?.[0];
          if (file) {
            if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
              const fileId = crypto.randomUUID();
              const stableFileId = ensureJsonExtension(fileId);
              setPendingUpload({ file, fileId: stableFileId });
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
            onClose={() => setIsSettingsOpen(false)}
            settings={aiSettings}
            onSave={async (s: AISettings) => {
              await saveSettings(s);
            }}
            onRedoAll={redoAllPages}
            onRetroactiveRename={scanAndRenameOldFiles}
            onRetroactiveRenameAll={scanAndRenameAllFiles}
            onConsolidate={handleConsolidate}
            onRefreshLibrary={library.refreshLibrary}
            isLibraryView={isHomeView}
            currentBookTitle={metadata?.name}
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
              const stableFileId: string | undefined = pendingUpload?.fileId;
              setUploadPromptOpen(false);
              setPendingUpload(null);
              if (!file) {
                pendingAutoStartRef.current = null;
                return;
              }
              const effectiveId = stableFileId || ensureJsonExtension(crypto.randomUUID());
              pendingAutoStartRef.current = { page: 1, language: lang };
              void continueUploadWithLanguage(file, lang, groups, effectiveId);
            }}
            availableGroups={library.availableGroups}
          />
        )}

        {editLanguagePromptOpen && (
          <UploadLanguagePrompt
            isOpen={editLanguagePromptOpen}
            defaultValue={editLanguageTarget ? editLanguageTarget.currentLang : docInputLanguage}
            onCancel={() => { setEditLanguagePromptOpen(false); setEditLanguageTarget(null); }}
            onConfirm={async (lang: string) => {
              if (editLanguageTarget) {
                // Modifica da Home o menu contestuale per progetto specifico
                const targetId = String(editLanguageTarget.fileId || '').trim();
                if (!targetId) {
                  setEditLanguageTarget(null);
                  setEditLanguagePromptOpen(false);
                  return;
                }

                const book = library.recentBooks[targetId];
                if (book) {
                  await library.updateLibrary(targetId, { fileId: targetId, inputLanguage: lang });
                  log.success(`Lingua aggiornata per "${book.fileName}" a: ${lang}`);
                  await library.refreshLibrary();
                }
                setEditLanguageTarget(null);
              } else {
                // Modifica per progetto attivo (dal Reader)
                setDocInputLanguage(lang);
                setDefaultLang(lang);
                if (library.currentProjectFileId) {
                  const fileId = library.currentProjectFileId;
                  await library.updateLibrary(fileId, { fileId, inputLanguage: lang });
                  log.success(`Lingua di input aggiornata a: ${lang}`);
                }
              }
              setEditLanguagePromptOpen(false);
            }}
          />
        )}

        {renameState && (
          <RenameModal
            isOpen={!!renameState}
            currentName={renameState.currentName}
            currentLanguage={renameState.currentLang}
            onClose={() => setRenameState(null)}
            onRename={async (newName: string, newLang: string) => {
              const oldId = renameState.fileId;
              const res = await window.electronAPI.setDisplayName({
                fileId: oldId,
                displayName: newName,
                inputLanguage: newLang
              });

              if (res?.success) {
                if (library.currentProjectFileId === oldId) {
                  setMetadata(prev => prev ? { ...prev, name: newName } : null);
                  if (newLang && newLang !== docInputLanguage) {
                    setDocInputLanguage(newLang);
                    setDefaultLang(newLang);
                  }
                }

                if (library.registerNameChange) {
                  library.registerNameChange(oldId, newName);
                }

                library.refreshLibrary();

                setRenameState(null);
              } else {
                log.warning(`Aggiornamento nome fallito: ${res?.error || 'Errore sconosciuto'}`);
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
              if (library.currentProjectFileId && library.isBlocked(library.currentProjectFileId)) {
                log.warning(`Blocked save crop for ${library.currentProjectFileId} (blacklisted/transitioning)`);
                setCropModal(null);
                return;
              }
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

        {coverModalFileId && (
          <CoverManagerModal
            fileId={coverModalFileId}
            fileName={library.recentBooks[coverModalFileId]?.fileName || ''}
            currentThumbnail={library.recentBooks[coverModalFileId]?.thumbnail}
            onClose={() => setCoverModalFileId(null)}
            onRefresh={library.refreshLibrary}
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

        {toast && (
          <ToastNotification
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}

        <TranslationCompletionNotifier
          showConfirm={showConfirm}
          onOpenProject={handleOpenProject}
        />

        <GlobalLoadingOverlay
          isVisible={!!isOpeningProject}
          message={isOpeningProject ? "Apertura progetto in corso..." : undefined}
        />
      </div>
    </LibraryContext.Provider>
  );
};

export default App;
