import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { log } from './services/logger';
import pkg from '../package.json';

// Types
import { AISettings, PDFMetadata, PageReplacement, PageAnnotation } from './types';

// Components
import { Header } from './components/Header';
import { ControlsBar } from './components/ControlsBar';
import { ReaderView } from './components/ReaderView';
import {
  PAGE_RENDER_TIMEOUT_MS,
} from './constants';
import { ImageCropModal } from './components/ImageCropModal';
import { SettingsModal } from './components/SettingsModal';
import { RenameModal } from './components/RenameModal';
import { PageSelectionModal } from './components/PageSelectionModal';
import { CreateGroupModal } from './components/CreateGroupModal';
import { GroupManagementModal } from './components/GroupManagementModal';
import { SimpleConfirmModal } from './components/SimpleConfirmModal';
import { HomeView } from './components/HomeView';
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

// Mock AI Service for Offline
// We'll override the translatePage function in the hook or just let it fail gracefully
import { translatePage as translatePageOffline } from './services/aiServiceOffline';

// Configuriamo il worker localmente (copiato in public/pdfjs durante il build/dev)
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs/pdf.worker.min.mjs';

const AppOffline: React.FC = () => {
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
    const keys = Object.keys(cachedReplacementDocsRef.current);
    if (keys.length >= 5) {
      const oldestKey = keys[0];
      const oldestDoc = cachedReplacementDocsRef.current[oldestKey];
      try { oldestDoc.destroy().catch(() => { }); } catch { }
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
  const [isManualMode, setIsManualMode] = useState<boolean>(true); // Sempre manuale in offline
  const [isTranslatedMode, setIsTranslatedMode] = useState<boolean>(true);
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
  const [renameState, setRenameState] = useState<null | any>(null);
  const [pageSelectionModal, setPageSelectionModal] = useState<any>({ isOpen: false, total: 0, targetPage: 0 });
  const [pendingReplacement, setPendingReplacement] = useState<any>(null);
  const [createGroupModalOpen, setCreateGroupModalOpen] = useState(false);
  const [activeGroupModalBookId, setActiveGroupModalBookId] = useState<string | null>(null);

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

  const library = useAppLibrary(metadata, docInputLanguage, showConfirm, setIsSaving);

  useEffect(() => {
    const t = window.setTimeout(() => setRenderScale(scale), 140);
    return () => window.clearTimeout(t);
  }, [scale]);

  useEffect(() => {
    localStorage.setItem('page_scale', String(scale));
  }, [scale]);

  // Sync refs
  useEffect(() => { originalImagesRef.current = originalImages; }, [originalImages]);
  useEffect(() => { croppedImagesRef.current = croppedImages; }, [croppedImages]);
  useEffect(() => { pageRotationsRef.current = pageRotations; }, [pageRotations]);
  useEffect(() => { pageReplacementsRef.current = pageReplacements; }, [pageReplacements]);
  useEffect(() => { pageImagesIndexRef.current = pageImagesIndex; }, [pageImagesIndex]);
  useEffect(() => { annotationMapRef.current = annotationMap; }, [annotationMap]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  const annotations = useAppAnnotations(metadata, library.updateLibrary);
  const translationMapRef = useRef<Record<number, string>>({});

  const appendPageConsole = useCallback((page: number, msg: string) => {
    setGeminiLogs((prev: Record<number, string>) => {
      const existing = prev[page] || "";
      const line = `${new Date().toLocaleTimeString()} [OFFLINE] ${msg}`;
      const next = (existing ? `${existing}\n` : "") + line;
      return { ...prev, [page]: next.slice(-12000) };
    });
  }, []);

  const getContextImageBase64 = useCallback(async (pageNum: number): Promise<string | undefined> => {
    const fileName = metadata?.name;
    if (!fileName) return undefined;
    const fileId = library.currentProjectFileId || projectFileIdFromName(fileName);
    const rel = pageImagesIndexRef.current?.crops?.[pageNum] || pageImagesIndexRef.current?.sources?.[pageNum];
    if (rel) {
      try { return (await window.electronAPI.readProjectImageBase64({ fileId, relPath: rel })).base64; } catch { }
    }
    return undefined;
  }, [metadata, library.currentProjectFileId]);

  const translation = useAppTranslation({
    pdfDoc, metadata, aiSettings, docInputLanguage,
    updateLibrary: library.updateLibrary,
    appendPageConsole,
    verifyAndMaybeFixTranslation: async () => { }, // Disable verification in offline
    setAnnotationMap,
    originalImagesRef, pageRotationsRef, pageReplacementsRef, pageImagesIndexRef,
    pageTraceRef, geminiLogs, setGeminiLogs,
    setOriginalImages, setCroppedImages, croppedImagesRef,
    setPageDims,
    readProjectImageBase64: async (args: any) => window.electronAPI.readProjectImageBase64(args).then((r: any) => r.base64),
    readProjectImageDataUrl: async (args: any) => window.electronAPI.readProjectImage(args).then((r: any) => r.dataUrl),
    saveSourceForPage: async () => { }, // Disable saving in offline
    getContextImageBase64: (p) => getContextImageBase64(p),
    loadReplacementPdfDoc: getCachedReplacementPdfDoc,
    renderDocPageToJpeg,
    sessionId, verboseLogs,
    isPaused,
    currentProjectFileId: library.currentProjectFileId
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
    getContextImageBase64: (p) => getContextImageBase64(p),
    enqueueTranslation: (p, opt) => { }  // Dummy for offline
  });

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
    enqueueTranslation: () => { }, // Disable in offline
    setIsTranslatedMode,
    setIsPaused,
    readProjectImageBase64: async (args: any) => window.electronAPI.readProjectImageBase64(args).then((r: any) => r.base64),
    translationMapRef,
    annotationMapRef,
    pageStatusRef: translation.pageStatusRef,
    verificationMapRef: quality.verificationMapRef,
    showConfirm,
    ensurePageImageSaved: async () => null
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

  const handleOpenProject = useCallback(async (fileId: string) => {
    try {
      if (!fileId || fileId === 'undefined') return;
      library.setCurrentProjectFileId(fileId);
      const data = await window.electronAPI.loadTranslation(fileId);
      if (!data) return;
      setDocInputLanguage((data as any).inputLanguage || defaultLang || 'tedesco');

      resetProjectState();

      const loadedSources = data.pageImages?.sources || {};
      const loadedCrops = data.pageImages?.crops || {};
      setPageImagesIndex({ sources: loadedSources, crops: loadedCrops });
      pageImagesIndexRef.current = { sources: loadedSources, crops: loadedCrops };

      setPageRotations(data.rotations || {});
      setPageReplacements(data.pageReplacements || {});
      setPageDims(data.pageDims || {});

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

      const pdfPathRes = await window.electronAPI.getOriginalPdfPath(fileId);
      let pdfPath = (pdfPathRes?.success && pdfPathRes?.path) ? pdfPathRes.path : data.originalFilePath;
      if (pdfPathRes?.success && pdfPathRes?.path && !data.originalFilePath) {
        try {
          await library.updateLibrary(data.fileName, { fileId, originalFilePath: pdfPathRes.path, hasSafePdf: true });
          library.refreshLibrary();
        } catch { }
      }
      if ((!pdfPathRes?.success || !pdfPathRes?.path) && data.originalFilePath) {
        try {
          const recopyRes = await window.electronAPI.copyOriginalPdf({ fileId, sourcePath: data.originalFilePath });
          if (recopyRes?.success && recopyRes?.path) {
            pdfPath = recopyRes.path;
            await library.updateLibrary(data.fileName, { fileId, originalFilePath: pdfPath, hasSafePdf: true });
            library.refreshLibrary();
          }
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
        } catch {
          setPdfDoc(null);
          setMetadata({ name: data.fileName, size: 0, totalPages: data.totalPages || 0 });
          setIsReaderMode(true);
        }
      } else {
        setPdfDoc(null);
        setMetadata({ name: data.fileName, size: 0, totalPages: data.totalPages || 0 });
        setIsReaderMode(true);
      }
    } catch (e) { log.error("Errore apertura progetto", e); }
  }, [library, defaultLang, translation, annotations, quality]);

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
      await renderPageOntoCanvas(
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
    } catch { }
  }, [pdfDoc, renderScale, getCachedReplacementPdfDoc]);

  const handleExportPdf = useCallback(async () => {
    if (!metadata?.name) return;
    try {
      const pages = Object.entries(translation.translationMap)
        .map(([num, text]) => ({
          pageNumber: Number(num),
          text,
          highlights: annotations.userHighlights[Number(num)] || [],
          userNotes: annotations.userNotes[Number(num)] || []
        }))
        .sort((a, b) => a.pageNumber - b.pageNumber);
      if (pages.length === 0) return;
      await window.electronAPI.exportTranslationsPdf({
        bookName: metadata.name,
        pages,
        pageDims,
        exportOptions: aiSettings.exportOptions
      });
    } catch { }
  }, [metadata, translation.translationMap, annotations.userHighlights, annotations.userNotes, pageDims, aiSettings.exportOptions]);

  const handleImportProject = useCallback(async () => {
    try {
      const importedId = await window.electronAPI.importProjectPackage();
      if (importedId) {
        library.refreshLibrary();
        await handleOpenProject(importedId);
      }
    } catch { }
  }, [library, handleOpenProject]);

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
      if (isHomeView) return;
      if (totalPages <= 0) return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (search.searchOpen) return;
      if (isEditableTarget(document.activeElement)) return;

      if (
        isSettingsOpen ||
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
    isHomeView,
    totalPages,
    viewMode,
    search.searchOpen,
    isSettingsOpen,
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

  const allPages = useMemo(() => {
    const arr = [];
    for (let i = 1; i <= totalPages; i++) arr.push(i);
    return arr;
  }, [totalPages]);

  const canvasRefsMap = useMemo(() => {
    const map: Record<number, React.RefObject<HTMLCanvasElement | null>> = {};
    if (totalPages === 0) return map;
    const centerRaw = Number(currentPage);
    const center = (Number.isFinite(centerRaw) && centerRaw >= 1) ? Math.floor(centerRaw) : 1;
    const range = [center - 2, center - 1, center, center + 1, center + 2].filter(p => p >= 1 && p <= totalPages);
    range.forEach((p, idx) => { if (allRefs[idx]) map[p] = allRefs[idx]; });
    return map;
  }, [currentPage, totalPages, allRefs]);

  useEffect(() => {
    if (totalPages <= 0) return;
    setCurrentPage((p: any) => normalizePageNumber(p, totalPages));
  }, [totalPages, normalizePageNumber]);

  useEffect(() => {
    if (pdfDoc) {
      Object.entries(canvasRefsMap).forEach(([p, ref]) => {
        renderPage(Number(p), ref);
      });
    }
  }, [pdfDoc, canvasRefsMap, renderScale, renderPage, pageRotations]);

  return (
    <div className="w-screen flex flex-col bg-[#1e1e1e] text-gray-200 overflow-hidden font-sans select-none" style={{ height: '100dvh' }}>
      <div className="bg-blue-600 text-white text-xs py-1 px-4 text-center font-bold">
        MODALITÀ OFFLINE - SOLO CONSULTAZIONE (TRADUZIONE DISABILITATA)
      </div>
      <Header
        showActions={!isHomeView}
        hasSession={!!metadata}
        metadata={metadata}
        isBatchProcessing={false}
        isPaused={true}
        viewMode={viewMode}
        scale={scale}
        canVerifyAll={false}
        verifyAllRunning={false}
        brightness={brightness}
        temperature={temperature}
        onBatch={() => { }} // Disabilitato
        onExport={() => { }} // Disabilitato
        onExportPdf={handleExportPdf}
        onImportProject={handleImportProject}
        onSettings={() => setIsSettingsOpen(true)}
        onVerifyAll={() => { }} // Disabilitato
        searchFilters={search.filters}
        onSearchFilterChange={search.setFilter}
        searchResults={search.searchResults}
        onSearchResultSelect={(item: any) => { setCurrentPage(item.page); search.setActiveResultId(item.id); setIsTranslatedMode(true); }}
        statusBadge={null}
        onToggleView={() => setViewMode(v => v === 'single' ? 'side-by-side' : 'single')}
        onScale={setScale}
        onBrightnessChange={setBrightness}
        onTemperatureChange={setTemperature}
        onToggleControls={() => setShowControls(!showControls)}
        onRedoAll={() => { }} // Disabilitato
        onReset={() => setIsHomeView(!isHomeView)}
        searchOpen={search.searchOpen}
        searchTerm={search.searchTerm}
        onSearchToggle={search.toggleSearch}
        onSearchChange={search.setSearchTerm}
        searchTotal={search.totalHits}
        onSearchNext={search.goToNextSearch}
        onSearchPrev={search.goToPrevSearch}
        currentLanguage={docInputLanguage}
        onLanguageClick={() => { }} // Disabilitato
        isSaving={isSaving}
      />

      {showControls && (
        <ControlsBar
          brightness={brightness} temperature={temperature} translationTheme={translationTheme} scale={scale}
          onScale={setScale} onBrightnessChange={setBrightness} onTemperatureChange={setTemperature} onThemeChange={setTranslationTheme}
        />
      )}

      <main className="flex-1 relative bg-[#121212] flex flex-col overflow-hidden" style={{ filter: `brightness(${brightness})` }}>
        {isHomeView ? (
          <HomeView
            hasSession={!!metadata}
            metadata={metadata}
            docInputLanguage={docInputLanguage}
            currentPage={currentPage}
            recentBooks={library.recentBooks}
            availableGroups={library.availableGroups}
            selectedGroupFilters={library.selectedGroupFilters}
            currentProjectFileId={library.currentProjectFileId}
            isDragging={false}
            isApiConfigured={false}
            openMenuId={openMenuId}
            pkgVersion={`${pkg.version} (OFFLINE)`}
            onCloseSession={() => { setPdfDoc(null); setMetadata(null); setIsReaderMode(false); library.setCurrentProjectFileId(null); resetProjectState(); }}
            onReturnToSession={() => setIsHomeView(false)}
            onBrowseClick={() => { }} // Disabilitato
            onDragOver={(e: any) => e.preventDefault()}
            onDragLeave={(e: any) => e.preventDefault()}
            onDrop={(e: any) => e.preventDefault()}
            onImportProject={handleImportProject}
            onOpenProject={handleOpenProject}
            onRenameProject={() => { }} // Disabilitato
            onDeleteProject={async (id: string, e: any) => {
              e?.stopPropagation();
              const deleted = await library.deleteProject(id);
              if (deleted && library.currentProjectFileId === id) {
                setPdfDoc(null); setMetadata(null); setIsReaderMode(false); library.setCurrentProjectFileId(null);
              }
            }}
            onToggleGroupFilter={library.toggleGroupFilter}
            onCreateGroup={() => setCreateGroupModalOpen(true)}
            onSetOpenMenuId={setOpenMenuId}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onManageGroups={setActiveGroupModalBookId}
            onExportGpt={() => { }} // Disabilitato
            onDeleteGroup={library.deleteGroup}
          />
        ) : (
          <ReaderView
            pages={allPages}
            pdfDoc={pdfDoc}
            pageDims={pageDims}
            scale={scale}
            isTranslatedMode={true}
            isManualMode={true}
            previewPage={previewPage}
            onPreviewPageChange={setPreviewPage}
            onActivePageChange={(p: number) => setCurrentPage(p)}
            onPageClick={(p: number) => { if (pdfDoc && p >= 1 && p <= pdfDoc.numPages) setCurrentPage(p); }}
            translationMap={translation.translationMap}
            annotationMap={annotationMap}
            verificationMap={quality.verificationMap}
            pageStatus={translation.pageStatus}
            isPaused={true}
            copiedPage={copiedPage}
            translationLogs={geminiLogs}
            partialTranslations={{}}
            originalImages={originalImages}
            croppedImages={croppedImages}
            canvasRefs={[]}
            canvasRefsMap={canvasRefsMap}
            onRetry={() => { }} // Disabilitato
            onStop={() => { }} // Disabilitato
            onCopy={(p: number) => { safeCopy(translation.translationMap[p] || ''); setCopiedPage(p); window.setTimeout(() => setCopiedPage(null), 2000); }}
            onRotatePage={() => { }} // Disabilitato
            onCropPage={() => { }} // Disabilitato
            onClearCrop={() => { }} // Disabilitato
            onReplacePage={() => { }} // Disabilitato
            onVerifyPage={() => { }} // Disabilitato
            onReanalyzePage={() => { }} // Disabilitato
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

        {!isHomeView && (
          <MainToolbar
            draggableRef={draggableRef}
            currentPage={currentPage}
            totalPages={totalPages}
            viewMode={viewMode}
            queueStats={{ active: 0, queued: 0 }}
            isPaused={true}
            isTranslatedMode={true}
            isManualMode={true}
            previewPage={previewPage}
            verificationMap={quality.verificationMap}
            annotationMap={annotationMap}
            translationMap={translation.translationMap}
            currentPages={viewMode === 'side-by-side' ? [currentPage, currentPage + 1].filter(p => p <= totalPages) : [currentPage]}
            onPrevPage={() => setCurrentPage((p: number) => Math.max(1, p - (viewMode === 'side-by-side' ? 2 : 1)))}
            onNextPage={() => setCurrentPage((p: number) => Math.min(totalPages, p + (viewMode === 'side-by-side' ? 2 : 1)))}
            onTogglePreviewStrip={() => setShowPreviewStrip(!showPreviewStrip)}
            onTogglePause={() => { }}
            onRetranslatePages={() => { }}
            onToggleTranslatedMode={() => { }}
            onToggleManualMode={() => { }}
            onOpenNotes={(p: number | null) => setNotesPage(p)}
          />
        )}
      </main>

      {/* Modals */}
      {isSettingsOpen && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          currentSettings={aiSettings}
          onSave={async (s: AISettings) => { await saveSettings(s); }}
          onRedoAll={async () => { }}
          onRetroactiveRename={async () => { }}
          onRetroactiveRenameAll={async () => { }}
          onRefreshLibrary={library.refreshLibrary}
          isLibraryView={isHomeView}
          showConfirm={showConfirm}
        />
      )}

      {renameState && (
        <RenameModal
          isOpen={!!renameState}
          currentName={renameState.currentName}
          onClose={() => setRenameState(null)}
          onRename={async () => { }} // Disabilitato
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

export default AppOffline;
