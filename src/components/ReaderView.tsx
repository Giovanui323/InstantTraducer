import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { CriticalRetryBanner } from './reader/CriticalRetryBanner';
import { PageSlot } from './reader/PageSlot';
import { OriginalPreviewModal } from './OriginalPreviewModal.tsx';
import { OriginalThumbnail as ExtractedOriginalThumbnail } from './reader/OriginalThumbnail';
import { NotesModal as ExtractedNotesModal } from './reader/NotesModal';
import { ReaderToolbar } from './reader/ReaderToolbar';
import { NewNoteModal, ViewNoteModal } from './reader/NoteModals';
import { readerReducer, initialReaderState } from './reader/readerReducer';
import { PageAnnotation, PageVerification, UserHighlight, UserNote, PageStatus } from '../types';
import { toDisplayableImageSrc } from '../utils/imageUtils';
import { getNextScaleFromWheel } from '../utils/zoomUtils';

interface ReaderViewProps {
  pages: number[];
  pdfDoc?: any;
  currentPage?: number;
  navigationMode?: 'scroll' | 'flip';
  viewMode?: 'single' | 'side-by-side';
  pageDims: Record<number, { width: number, height: number }>;
  scale: number;
  isTranslatedMode: boolean;
  isManualMode: boolean;
  translationTheme?: 'light' | 'sepia' | 'dark';
  previewPage?: number | null;
  onPreviewPageChange?: (p: number | null) => void;
  onOpenOriginalPage?: (p: number) => void;
  onActivePageChange?: (p: number) => void;
  translationMap: Record<number, string>;
  annotationMap: Record<number, PageAnnotation[]>;
  verificationMap: Record<number, PageVerification>;
  pageStatus: Record<number, PageStatus>;
  isPaused: boolean;
  copiedPage: number | null;
  canvasRefs: React.RefObject<HTMLCanvasElement | null>[];
  canvasRefsMap?: Record<number, React.RefObject<HTMLCanvasElement | null>>;
  onCopy: (p: number) => void;
  onRetry: (p: number) => void;
  onRetryAllCritical?: () => void;
  onReplacePage?: (p: number) => void;
  translationLogs?: Record<number, string>;
  partialTranslations?: Record<number, string>;
  originalImages?: Record<number, string>;
  croppedImages?: Record<number, string>;
  onCropPage?: (p: number) => void;
  onClearCrop?: (p: number) => void;
  onRotatePage?: (p: number) => void;
  onVerifyPage?: (p: number) => void;
  onReanalyzePage?: (p: number) => void;
  onFixPage?: (p: number, opts?: any) => void;
  onStop?: (p: number) => void;
  bottomPadding?: number;
  notesPage?: number | null;
  onSetNotesPage?: (p: number | null) => void;
  onPageClick?: (page: number) => void;
  searchTerm?: string;
  activeResultId?: string | null;
  translationsMeta?: Record<number, { model: string; savedAt: number }>;
  verificationsMeta?: Record<number, { model: string; savedAt: number }>;
  userHighlights: Record<number, UserHighlight[]>;
  userNotes: Record<number, UserNote[]>;
  onAddHighlight: (page: number, start: number, end: number, text: string, color?: string, quote?: { exact: string; prefix: string; suffix: string }, pdfRect?: import('../utils/pdfCoordinates').PdfRect) => void;
  onRemoveHighlight: (page: number, id: string) => void;
  onAddNote: (page: number, start: number, end: number, text: string, content: string) => void;
  onUpdateNote: (page: number, id: string, content: string) => void;
  onRemoveNote: (page: number, id: string) => void;
  onScaleChange?: (s: number) => void;
  onToggleTranslatedMode?: () => void;
  showConfirm?: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'info' | 'alert') => void;
  pageRotations?: Record<number, number>;
}

const formatPageRanges = (pages: number[]) => {
  const list = Array.from(new Set(pages)).filter((p) => Number.isFinite(p)).sort((a, b) => a - b);
  if (list.length === 0) return '';
  const parts: string[] = [];
  let start = list[0];
  let prev = list[0];
  for (let i = 1; i <= list.length; i++) {
    const cur = list[i];
    const isConsecutive = i < list.length && cur === prev + 1;
    if (isConsecutive) {
      prev = cur;
      continue;
    }
    if (start === prev) parts.push(String(start));
    else parts.push(`${start}–${prev}`);
    start = cur;
    prev = cur;
  }
  return parts.join(', ');
};

const truncateLabel = (value: string, maxChars: number) => {
  const v = String(value || '');
  if (v.length <= maxChars) return v;
  return `${v.slice(0, Math.max(0, maxChars - 1))}…`;
};

export const ReaderView: React.FC<ReaderViewProps> = ({
  pages,
  pdfDoc,
  currentPage,
  navigationMode = 'scroll',
  viewMode = 'single',
  pageDims,
  scale,
  isTranslatedMode,
  isManualMode,
  previewPage: previewPageProp,
  onPreviewPageChange,
  onActivePageChange,
  onOpenOriginalPage,
  translationMap,
  annotationMap,
  verificationMap,
  pageStatus,
  isPaused,
  copiedPage,
  canvasRefs,
  canvasRefsMap,
  onCopy,
  onRetry,
  onReplacePage,
  translationLogs,
  partialTranslations,
  originalImages,
  croppedImages,
  onCropPage,
  onRotatePage,
  onVerifyPage,
  onReanalyzePage,
  onFixPage,
  onStop,
  onRetryAllCritical,
  bottomPadding,
  translationTheme,
  notesPage: notesPageProp,
  onSetNotesPage,
  onPageClick,
  searchTerm,
  activeResultId,
  translationsMeta,
  verificationsMeta,
  userHighlights,
  userNotes,
  onAddHighlight,
  onRemoveHighlight,
  onAddNote,
  onUpdateNote,
  onRemoveNote,
  onScaleChange,
  onToggleTranslatedMode,
  showConfirm,
  pageRotations
}) => {
  const initialThumbnail = useMemo(() => {
    const saved = localStorage.getItem('showThumbnail');
    return saved === null ? true : saved === 'true';
  }, []);

  const [state, dispatch] = useReducer(readerReducer, initialReaderState(initialThumbnail));

  const {
    showHighlights, showUserNotes, showThumbnail,
    isHighlightToolActive, isNoteToolActive, isEraserToolActive, isHandToolActive,
    highlightColor,
    newNoteModal, viewingNoteId,
    containerWidth,
    isSpaceDown, isPanning,
    activePage, floatingPage
  } = state;

  const toggleThumbnail = () => {
    dispatch({ type: 'TOGGLE_THUMBNAIL' });
    const next = !showThumbnail;
    localStorage.setItem('showThumbnail', String(next));
  };

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageRowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const programmaticTargetPageRef = useRef<number | null>(null);
  const panStateRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0
  });

  const renderPages = useMemo(() => {
    if (navigationMode !== 'flip') return pages;
    const base = (typeof currentPage === 'number' && Number.isFinite(currentPage)) ? currentPage : (pages[0] ?? null);
    if (base == null) return [];
    if (viewMode === 'side-by-side') {
      return [base, base + 1].filter((p) => pages.includes(p));
    }
    return pages.includes(base) ? [base] : [];
  }, [navigationMode, pages, currentPage, viewMode]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !onScaleChange) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const next = getNextScaleFromWheel(scale, e, { min: 0.3, max: 5 });
        if (next !== scale) {
          onScaleChange(next);
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [scale, onScaleChange]);

  useEffect(() => {
    const isEditableTarget = (el: Element | null) => {
      if (!el) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      const htmlEl = el as HTMLElement;
      return Boolean(htmlEl.isContentEditable);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (isEditableTarget(document.activeElement)) return;
      dispatch({ type: 'SET_SPACE_DOWN', isDown: true });
      e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      dispatch({ type: 'SET_SPACE_DOWN', isDown: false });
    };
    const onBlur = () => {
      dispatch({ type: 'SET_SPACE_DOWN', isDown: false });
      dispatch({ type: 'SET_PANNING', isPanning: false });
      panStateRef.current.active = false;
      panStateRef.current.pointerId = null;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    const updateWidth = () => {
      const w = scrollRef.current?.clientWidth || window.innerWidth;
      if (w > 0) dispatch({ type: 'SET_CONTAINER_WIDTH', width: w });
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);

    const el = scrollRef.current;
    let ro: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => updateWidth());
      ro.observe(el);
    }

    // Fallback: force update after mount when ref is definitely available
    const t = requestAnimationFrame(() => updateWidth());
    return () => {
      cancelAnimationFrame(t);
      window.removeEventListener('resize', updateWidth);
      ro?.disconnect();
    };
  }, []);

  // UNDO LOGIC (Ctrl+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (newNoteModal || viewingNoteId) return;
        e.preventDefault();
        let newest: { page: number, id: string, ts: number, type: 'highlight' | 'note' } | null = null;
        Object.entries(userHighlights || {}).forEach(([pStr, list]) => {
          const p = Number(pStr);
          (list as UserHighlight[])?.forEach(h => {
            if (!newest || h.createdAt > newest.ts) {
              newest = { page: p, id: h.id, ts: h.createdAt, type: 'highlight' };
            }
          });
        });
        Object.entries(userNotes || {}).forEach(([pStr, list]) => {
          const p = Number(pStr);
          (list as UserNote[])?.forEach(n => {
            if (!newest || n.createdAt > newest.ts) {
              newest = { page: p, id: n.id, ts: n.createdAt, type: 'note' };
            }
          });
        });
        if (newest) {
          const n = newest as { page: number, id: string, type: 'highlight' | 'note' };
          if (n.type === 'highlight') {
            onRemoveHighlight?.(n.page, n.id);
          } else {
            onRemoveNote?.(n.page, n.id);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [userHighlights, userNotes, onRemoveHighlight, onRemoveNote, newNoteModal, viewingNoteId]);

  const [thumbnailScale, setThumbnailScale] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('thumbnailScale');
      const n = raw ? parseFloat(raw) : 1;
      const clamped = Math.max(0.75, Math.min(2, Number.isFinite(n) ? n : 1));
      return clamped;
    } catch {
      return 1;
    }
  });
  const updateThumbnailScale = (s: number) => {
    const clamped = Math.max(0.75, Math.min(2, Number.isFinite(s) ? s : 1));
    setThumbnailScale(clamped);
    try {
      localStorage.setItem('thumbnailScale', String(clamped));
    } catch { }
  };
  const [previewPageInternal, setPreviewPageInternal] = useState<number | null>(null);
  const previewPage = previewPageProp !== undefined ? previewPageProp : previewPageInternal;
  const setPreviewPage = onPreviewPageChange ?? setPreviewPageInternal;

  const [notesPageInternal, setNotesPageInternal] = useState<number | null>(null);
  const notesPage = notesPageProp !== undefined ? notesPageProp : notesPageInternal;
  const setNotesPage = onSetNotesPage ?? setNotesPageInternal;

  const [previewShowCrop, setPreviewShowCrop] = useState(true);
  const previewSrcRaw = previewPage != null
    ? ((previewShowCrop ? croppedImages?.[previewPage] : undefined) || originalImages?.[previewPage] || croppedImages?.[previewPage])
    : undefined;
  const previewSrc = toDisplayableImageSrc(previewSrcRaw);

  const pageForTools = useMemo(() => {
    const p = (typeof activePage === 'number' && Number.isFinite(activePage))
      ? activePage
      : ((typeof currentPage === 'number' && Number.isFinite(currentPage)) ? currentPage : (pages[0] ?? null));
    return typeof p === 'number' && Number.isFinite(p) ? p : null;
  }, [activePage, currentPage, pages]);

  const canUseNoteTool = useMemo(() => {
    if (!isTranslatedMode) return false;
    if (pageForTools == null) return false;
    const t = translationMap[pageForTools];
    return typeof t === 'string' && t.trim().length > 0;
  }, [isTranslatedMode, pageForTools, translationMap]);

  useEffect(() => {
    if (!canUseNoteTool) dispatch({ type: 'SET_TOOL', tool: null });
  }, [canUseNoteTool]);

  const criticalErrorPagesAll = useMemo(() => {
    const arr: number[] = [];
    pages.forEach((p) => {
      const v = verificationMap[p];
      const hasError = pageStatus[p]?.error;
      const needsManualVerification = Boolean(v && (v.state === 'failed' || v.postRetryFailed));
      const isAutoRetrying = Boolean(v?.autoRetryActive);
      const proc = String(pageStatus[p]?.processing || '');
      const hasRetryMarker = proc.toLowerCase().includes('ritraduz') || proc.toLowerCase().includes('rielabor');
      if (hasError || (needsManualVerification && !isAutoRetrying) || hasRetryMarker) arr.push(p);
    });
    return arr;
  }, [pages, verificationMap, pageStatus]);

  const pagesInRetry = useMemo(() => {
    return criticalErrorPagesAll.filter((p) => {
      const st = pageStatus[p];
      if (!st) return false;
      if (st.error) return false;
      return Boolean(st.processing || st.loading);
    });
  }, [criticalErrorPagesAll, pageStatus]);

  const criticalErrorPagesPending = useMemo(() => {
    const inRetry = new Set(pagesInRetry);
    return criticalErrorPagesAll.filter((p) => !inRetry.has(p));
  }, [criticalErrorPagesAll, pagesInRetry]);

  const criticalErrorsCount = criticalErrorPagesPending.length;
  const totalCriticalCount = criticalErrorPagesAll.length;

  const criticalErrorPagesLabel = useMemo(() => {
    return formatPageRanges(criticalErrorPagesPending);
  }, [criticalErrorPagesPending]);

  const criticalErrorPagesLabelShort = useMemo(() => {
    return truncateLabel(criticalErrorPagesLabel, 80);
  }, [criticalErrorPagesLabel]);

  const retryPagesLabel = useMemo(() => {
    return formatPageRanges(pagesInRetry);
  }, [pagesInRetry]);

  const retryPagesLabelShort = useMemo(() => {
    return truncateLabel(retryPagesLabel, 80);
  }, [retryPagesLabel]);

  const frameDims = useMemo(() => {
    const dims = Object.values(pageDims) as { width: number; height: number }[];
    const valid = dims.filter((d) => Boolean(d?.width) && Boolean(d?.height));
    if (valid.length === 0) return { width: 595, height: 842 };

    const portrait = valid.filter((d) => d.height >= d.width);
    const basis = portrait.length > 0 ? portrait : valid;
    
    const sortedW = [...basis].sort((a, b) => a.width - b.width);
    const sortedH = [...basis].sort((a, b) => a.height - b.height);
    const midIdx = Math.floor(basis.length / 2);
    
    return { 
      width: Math.max(300, sortedW[midIdx].width), 
      height: Math.max(400, sortedH[midIdx].height) 
    };
  }, [pageDims]);

  const effectiveScale = useMemo(() => {
    const vw = containerWidth || (scrollRef.current?.clientWidth ?? window.innerWidth) || 0;
    const padPx = 128;
    const maxWidth = (frameDims.width || 595);
    
    // Fallback se vw è 0 (inizializzazione)
    if (vw <= 0) return scale;

    const fit = maxWidth > 0 ? (vw - padPx) / maxWidth : scale;
    const target = fit * Math.max(0.3, Math.min(5, Number.isFinite(scale) ? scale : 1));
    const clamped = Math.max(0.1, Math.min(4, target));
    const result = Number.isFinite(clamped) ? clamped : (Number.isFinite(scale) ? scale : 1);
    return Math.round(result * 1000) / 1000;
  }, [pageDims, frameDims.width, scale, containerWidth]);

  const enablePanScroll = true;

  const onViewerPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    const container = scrollRef.current;
    if (!container) return;
    if (!enablePanScroll) return;
    const shouldPan = isSpaceDown || e.button === 1;
    if (!shouldPan) return;

    e.preventDefault();
    try {
      container.setPointerCapture(e.pointerId);
    } catch { }
    panStateRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startScrollLeft: container.scrollLeft,
      startScrollTop: container.scrollTop
    };
    dispatch({ type: 'SET_PANNING', isPanning: true });
  };

  const onViewerPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    const container = scrollRef.current;
    if (!container) return;
    const st = panStateRef.current;
    if (!st.active) return;
    if (st.pointerId !== e.pointerId) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    container.scrollLeft = st.startScrollLeft - dx;
    container.scrollTop = st.startScrollTop - dy;
  };

  const endPan: React.PointerEventHandler<HTMLDivElement> = (e) => {
    const st = panStateRef.current;
    if (!st.active) return;
    if (st.pointerId !== e.pointerId) return;
    panStateRef.current.active = false;
    panStateRef.current.pointerId = null;
    dispatch({ type: 'SET_PANNING', isPanning: false });
  };

  useEffect(() => {
    if (navigationMode === 'flip') return;
    const root = scrollRef.current;
    if (!root) return;
    const thresholds = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];
    const observer = new IntersectionObserver(
      (entries) => {
        let bestPage: number | null = null;
        let bestRatio = 0;
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const pageAttr = el.getAttribute('data-page');
          const page = pageAttr ? Number(pageAttr) : NaN;
          if (!Number.isFinite(page)) continue;
          if (entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestPage = page;
          }
        }
        if (bestPage !== null && bestRatio > 0) {
          dispatch({ type: 'SET_ACTIVE_PAGE', page: bestPage });
          const programmaticTarget = programmaticTargetPageRef.current;
          if (programmaticTarget != null && bestPage !== programmaticTarget) return;
          if (typeof bestPage === 'number') onActivePageChange?.(bestPage);
        }
      },
      { root, threshold: thresholds }
    );
    for (const p of pages) {
      const el = pageRowRefs.current[p];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [pages, onActivePageChange, navigationMode]);

  useEffect(() => {
    if (navigationMode === 'flip') return;
    if (typeof currentPage !== 'number') return;
    if (!pages.includes(currentPage)) return;

    const root = scrollRef.current;
    const el = pageRowRefs.current[currentPage];
    if (!root || !el) return;

    const rootRect = root.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const isFullyVisible = elRect.top >= rootRect.top && elRect.bottom <= rootRect.bottom;
    if (isFullyVisible) return;

    programmaticTargetPageRef.current = currentPage;
    el.scrollIntoView({ block: 'start', behavior: 'auto' });
    window.setTimeout(() => {
      if (programmaticTargetPageRef.current === currentPage) programmaticTargetPageRef.current = null;
    }, 250);
  }, [currentPage, pages, navigationMode]);

  useEffect(() => {
    if (navigationMode !== 'flip') return;
    if (typeof currentPage !== 'number') return;
    if (!pages.includes(currentPage)) return;
    dispatch({ type: 'SET_ACTIVE_PAGE', page: currentPage });
  }, [currentPage, pages, navigationMode]);

  useEffect(() => {
    if (!isTranslatedMode) {
      dispatch({ type: 'SET_FLOATING_PAGE', page: null });
      setPreviewPage(null);
      return;
    }
    const focusPage = activePage ?? pages[0] ?? null;
    if (focusPage !== floatingPage) {
      dispatch({ type: 'SET_FLOATING_PAGE', page: focusPage });
    }
  }, [activePage, floatingPage, isTranslatedMode, pages]);

  useEffect(() => {
    if (previewPage == null) return;
    if (pages.includes(previewPage)) return;
    const next = pages.find((p) => Boolean(croppedImages?.[p] || originalImages?.[p])) ?? pages[0];
    if (typeof next === 'number') setPreviewPage(next);
    else setPreviewPage(null);
  }, [croppedImages, originalImages, pages, previewPage, setPreviewPage]);

  useEffect(() => {
    if (previewPage == null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewPage(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewPage, setPreviewPage]);

  useEffect(() => {
    if (previewPage == null) return;
    setPreviewShowCrop(Boolean(croppedImages?.[previewPage]));
  }, [croppedImages, previewPage]);

  return (
    <div
      ref={scrollRef}
      onPointerDown={onViewerPointerDown}
      onPointerMove={onViewerPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      className={`flex-1 ${enablePanScroll ? 'overflow-auto' : 'overflow-hidden'} p-4 md:p-8 custom-scrollbar ${translationTheme === 'light' ? 'bg-stone-100' : translationTheme === 'sepia' ? 'bg-amber-50' : 'bg-[#121212]'} ${isSpaceDown ? (isPanning ? 'cursor-grabbing select-none' : 'cursor-grab') : ''}`}
      style={{ paddingBottom: bottomPadding ?? 24 }}
    >
      <div className="flex flex-col items-stretch gap-2 lg:gap-3 min-w-full">
        {renderPages.map((p, idx) => {
          const dims = pageDims[p] || frameDims || { width: 595, height: 842 };
          return (
            <div
              key={p}
              data-page={p}
              ref={(el) => { pageRowRefs.current[p] = el; }}
            >
              <PageSlot
                page={p}
                idx={idx}
                dims={dims}
                frameDims={frameDims}
                effectiveScale={effectiveScale}
                isTranslatedMode={isTranslatedMode}
                isManualMode={isManualMode}
                isPaused={isPaused}
                navigationMode={navigationMode}
                translationTheme={translationTheme}
                searchTerm={searchTerm}
                activeResultId={activeResultId}
                showHighlights={showHighlights}
                showUserNotes={showUserNotes}
                isHighlightToolActive={isHighlightToolActive}
                highlightColor={highlightColor as import('../utils/highlightStyles').HighlightColor}
                isNoteToolActive={isNoteToolActive}
                isEraserToolActive={isEraserToolActive}
                copiedPage={copiedPage}
                canvasRefs={canvasRefs}
                canvasRefsMap={canvasRefsMap}
                originalImages={originalImages}
                croppedImages={croppedImages}
                translationMap={translationMap}
                verificationMap={verificationMap}
                pageStatus={pageStatus}
                translationLogs={translationLogs}
                partialTranslations={partialTranslations}
                userHighlights={userHighlights}
                userNotes={userNotes}
                onPageClick={onPageClick}
                onCopy={onCopy}
                onRetry={onRetry}
                onStop={onStop}
                onAddHighlight={onAddHighlight}
                onRemoveHighlight={onRemoveHighlight}
                onAddNote={onAddNote}
                onUpdateNote={onUpdateNote}
                onRemoveNote={onRemoveNote}
                onOpenNoteModal={(page, start, end, text) => dispatch({ type: 'OPEN_NOTE_MODAL', page, start, end, text })}
                onViewNote={(page, id) => dispatch({ type: 'VIEW_NOTE', page, id })}
                onSetNotesPage={setNotesPage}
              />
            </div>
          );
        })}
      </div>

      {notesPage != null && (
        <ExtractedNotesModal
          page={notesPage}
          verificationMap={verificationMap}
          annotationMap={annotationMap}
          translationMap={translationMap}
          onClose={() => setNotesPage(null)}
          onReanalyzePage={onReanalyzePage}
          onVerifyPage={onVerifyPage}
          onFixPage={onFixPage}
          translationsMeta={translationsMeta}
          verificationsMeta={verificationsMeta}
          showConfirm={showConfirm}
        />
      )}

      {isTranslatedMode && showThumbnail && floatingPage && (
        <div className="fixed inset-0 z-[150] pointer-events-none">
          <div className="relative w-full h-full">
            <ExtractedOriginalThumbnail
              src={toDisplayableImageSrc(croppedImages?.[floatingPage] || originalImages?.[floatingPage]) || ""}
              pdfDoc={pdfDoc}
              page={floatingPage}
              isCropped={Boolean(croppedImages?.[floatingPage])}
              onOpen={() => {
                if (onOpenOriginalPage) onOpenOriginalPage(floatingPage);
                else setPreviewPage(floatingPage);
              }}
              onEdit={() => setPreviewPage(floatingPage)}
              scale={thumbnailScale}
              onScaleChange={updateThumbnailScale}
              pageRatio={pageDims[floatingPage] ? (pageDims[floatingPage].height / pageDims[floatingPage].width) : 1.41}
            />
          </div>
        </div>
      )}

      {!isTranslatedMode && onToggleTranslatedMode && (
        <div className="fixed top-8 right-8 z-[150] pointer-events-auto">
          <button
            onClick={onToggleTranslatedMode}
            className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-600 text-white shadow-2xl border border-blue-400 hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(37,99,235,0.4)]"
            title="Torna alla traduzione"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
          </button>
        </div>
      )}

      {/* Modal Preview */}
      {previewPage != null && (
        <OriginalPreviewModal
          pdfDoc={pdfDoc}
          src={previewSrc}
          page={previewPage}
          rotation={pageRotations?.[previewPage] || 0}
          onClose={() => setPreviewPage(null)}
          onCrop={onCropPage}
          onRotate={onRotatePage}
          onReplace={onReplacePage}
        />
      )}

      <CriticalRetryBanner
        criticalErrorsCount={criticalErrorsCount}
        totalCriticalCount={totalCriticalCount}
        pagesInRetry={pagesInRetry}
        criticalErrorPagesLabel={criticalErrorPagesLabel}
        criticalErrorPagesLabelShort={criticalErrorPagesLabelShort}
        retryPagesLabelShort={retryPagesLabelShort}
        onRetryAllCritical={onRetryAllCritical}
      />
      {/* New Note Input Modal */}
      <NewNoteModal
        noteModal={newNoteModal}
        onAddNote={onAddNote}
        onClose={() => dispatch({ type: 'CLOSE_NOTE_MODAL' })}
        onToolChange={(tool) => dispatch({ type: 'SET_TOOL', tool })}
      />

      {/* View Note Modal */}
      <ViewNoteModal
        viewingNoteId={viewingNoteId}
        userNotes={userNotes}
        onRemoveNote={onRemoveNote}
        onClose={() => dispatch({ type: 'CLOSE_NOTE_VIEW' })}
        showConfirm={showConfirm}
      />
      <ReaderToolbar
        isHandToolActive={isHandToolActive}
        isNoteToolActive={isNoteToolActive}
        isHighlightToolActive={isHighlightToolActive}
        isEraserToolActive={isEraserToolActive}
        highlightColor={highlightColor}
        showThumbnail={showThumbnail}
        canUseNoteTool={canUseNoteTool}
        isExporting={false}
        isCriticalRetryDismissed={false}
        totalCriticalCount={0}
        pageForTools={pageForTools}
        criticalErrorPagesAll={[]}
        onToolChange={(tool) => dispatch({ type: 'SET_TOOL', tool })}
        onHighlightColorChange={(color) => dispatch({ type: 'SET_HIGHLIGHT_COLOR', color })}
        onToggleThumbnail={toggleThumbnail}
        onExport={() => {}}
        onRestoreCriticalRetry={() => {}}
      />

    </div>
  )
};
