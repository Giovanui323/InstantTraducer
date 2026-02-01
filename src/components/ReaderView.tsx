import React, { useEffect, useMemo, useRef, useState } from 'react';
import Draggable from 'react-draggable';
import type { DraggableData, DraggableEvent } from 'react-draggable';
import { Loader2, Pause, Copy, Check, MessageSquare, Maximize2, ShieldCheck, X, RotateCw, Plus, Minus, Highlighter, Trash2, CirclePlay, Wand2, FileImage, Image, Eye, EyeOff } from 'lucide-react';
import { MarkdownText } from './MarkdownText';
import { IndexView } from './IndexView';
import { OriginalPreviewModal } from './OriginalPreviewModal';
import { PageAnnotation, PageVerification, UserHighlight, UserNote, PageStatus } from '../types';
import { safeCopy } from '../utils/clipboard';
import { toDisplayableImageSrc } from '../utils/imageUtils';
import { getNextScaleFromWheel } from '../utils/zoomUtils';
import { getVerificationDisplayData, getVerificationUiState } from '../utils/verificationUi';

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
  onFixPage?: (p: number) => void;
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
  onAddHighlight: (page: number, start: number, end: number, text: string, color?: string) => void;
  onRemoveHighlight: (page: number, id: string) => void;
  onAddNote: (page: number, start: number, end: number, text: string, content: string) => void;
  onUpdateNote: (page: number, id: string, content: string) => void;
  onRemoveNote: (page: number, id: string) => void;
  onScaleChange?: (s: number) => void;
  previewExportLayout?: boolean;
  showConfirm?: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'info' | 'alert') => void;
}

type OriginalThumbnailProps = {
  src: string;
  onOpen: () => void;
  onOpenModal: () => void;
  scale: number;
  onScaleChange: (s: number) => void;
  pageRatio?: number;
};

const OriginalThumbnail: React.FC<OriginalThumbnailProps> = ({ src, onOpen, onOpenModal, scale, onScaleChange, pageRatio }) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [suppressClick, setSuppressClick] = useState(false);
  const [defaultPosition, setDefaultPosition] = useState<{ x: number; y: number } | null>(null);
  const [naturalRatio, setImgNaturalRatio] = useState<number | null>(null);

  const effectiveRatio = pageRatio || naturalRatio || 1.41;

  useEffect(() => {
    const margin = 24;
    const baseW = 96;
    const thumbW = Math.round(baseW * Math.max(0.5, Math.min(3, scale || 1)));
    setDefaultPosition({
      x: Math.max(margin, window.innerWidth - thumbW - margin),
      y: margin
    });
  }, []);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        const next = getNextScaleFromWheel(scale, e, { min: 0.75, max: 2 });
        if (next !== scale) {
          onScaleChange(next);
        }
      }
    };

    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => node.removeEventListener('wheel', handleWheel);
  }, [scale, onScaleChange]);

  if (!defaultPosition) return null;

  const baseW = 96;
  const currentW = Math.round(baseW * scale);
  const currentH = Math.round(currentW * effectiveRatio);

  return (
    <Draggable
      nodeRef={nodeRef}
      bounds="parent"
      defaultPosition={defaultPosition}
      onStart={(_: DraggableEvent, data: DraggableData) => {
        dragStart.current = { x: data.x, y: data.y };
        setSuppressClick(false);
      }}
      onDrag={(_: DraggableEvent, data: DraggableData) => {
        const start = dragStart.current;
        if (!start) return;
        const distance = Math.abs(data.x - start.x) + Math.abs(data.y - start.y);
        if (distance > 4 && !suppressClick) setSuppressClick(true);
      }}
      onStop={() => {
        dragStart.current = null;
        window.setTimeout(() => setSuppressClick(false), 0);
      }}
    >
      <div
        ref={nodeRef}
        className="absolute top-0 left-0 z-20 select-none touch-none cursor-grab active:cursor-grabbing will-change-transform pointer-events-auto"
        onClick={(e) => {
          if (suppressClick) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          onOpen();
        }}
        title="Vedi originale"
      >
        <div
          className="group/thumb relative shadow-xl border border-black/10 rounded-lg overflow-hidden bg-white hover:shadow-2xl hover:border-blue-500/50 hover:scale-[1.02] transition-all duration-150 ease-out"
          style={{
            width: `${currentW}px`,
            height: `${currentH}px`
          }}
        >
          {src ? (
            <img 
              src={src} 
              draggable={false} 
              className="w-full h-full object-contain opacity-90 group-hover/thumb:opacity-100" 
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth && img.naturalHeight) {
                  setImgNaturalRatio(img.naturalHeight / img.naturalWidth);
                }
              }}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 text-gray-400 gap-2">
              <Loader2 size={20} className="animate-spin text-blue-500" />
              <span className="text-[8px] font-bold uppercase tracking-tighter">Caricamento...</span>
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/5 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
            <button
              type="button"
              aria-label="Apri anteprima originale"
              className="pointer-events-auto"
              onClick={(e) => {
                e.stopPropagation();
                onOpenModal();
              }}
            >
              <Maximize2 size={16} className="text-blue-600 drop-shadow-sm bg-white/90 p-1 rounded-md shadow-sm" />
            </button>
          </div>
          <div className="absolute bottom-2 right-2 flex gap-1.5 opacity-0 group-hover/thumb:opacity-100 transition-opacity pointer-events-auto">
            <button
              type="button"
              aria-label="Rimpicciolisci miniatura"
              className="w-7 h-7 flex items-center justify-center rounded-full bg-white/90 text-gray-600 border border-black/10 shadow-sm hover:bg-white"
              onClick={(e) => {
                e.stopPropagation();
                const next = Math.max(0.75, Math.min(2, Number.isFinite(scale) ? scale - 0.1 : 1));
                onScaleChange(Number(next.toFixed(2)));
              }}
            >
              <Minus size={14} />
            </button>
            <button
              type="button"
              aria-label="Ingrandisci miniatura"
              className="w-7 h-7 flex items-center justify-center rounded-full bg-white/90 text-gray-600 border border-black/10 shadow-sm hover:bg-white"
              onClick={(e) => {
                e.stopPropagation();
                const next = Math.max(0.75, Math.min(2, Number.isFinite(scale) ? scale + 0.1 : 1.1));
                onScaleChange(Number(next.toFixed(2)));
              }}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>
    </Draggable>
  );
};

const NotesModal: React.FC<{
  page: number;
  verificationMap: Record<number, PageVerification>;
  annotationMap: Record<number, PageAnnotation[]>;
  translationMap: Record<number, string>;
  onClose: () => void;
  onReanalyzePage?: (p: number) => void;
  onVerifyPage?: (p: number) => void;
  onFixPage?: (p: number) => void;
  translationsMeta?: Record<number, { model: string; savedAt: number }>;
  verificationsMeta?: Record<number, { model: string; savedAt: number }>;
}> = ({
  page,
  verificationMap,
  annotationMap,
  translationMap,
  onClose,
  onReanalyzePage,
  onVerifyPage,
  onFixPage,
  translationsMeta,
  verificationsMeta
}) => {
    const nodeRef = useRef<HTMLDivElement>(null);

    const display = getVerificationDisplayData({
      translatedText: translationMap[page],
      verification: verificationMap[page],
      annotations: annotationMap[page]
    });
    const hasText = display.hasText;
    const v = display.verification;
  const state = v?.state || 'idle';
  const isSevere = v?.severity === 'severe';
  const [elapsedSec, setElapsedSec] = useState(0);

    useEffect(() => {
      if (state !== 'verifying' || !v?.startedAt) {
        setElapsedSec(0);
        return;
      }
      const id = setInterval(() => {
        setElapsedSec(Math.max(0, Math.floor((Date.now() - v.startedAt!) / 1000)));
      }, 500);
      return () => clearInterval(id);
    }, [state, v?.startedAt]);
    const ui = getVerificationUiState(v);
    const dot = ui.dotClass;
    const label = ui.label;
    const severity = ui.severityLabel;
    const canReanalyze = Boolean(onReanalyzePage) && hasText && state !== 'verifying';
    const canVerify = Boolean(onVerifyPage) && hasText && state !== 'verifying' && state !== 'verified';
    const evidence = v?.evidence || [];
    const showDisclaimer = Boolean(v) && (state === 'failed' || v?.postRetryFailed || v?.severity === 'severe');
    const disclaimerTitle = state === 'failed' ? 'Verifica non riuscita' : 'Disclaimer';
    const disclaimerBody = state === 'failed'
      ? 'Non è stato possibile completare la verifica qualità. Il testo potrebbe contenere omissioni.'
      : v?.postRetryFailed
        ? 'La verifica post-ritraduzione non è riuscita: il report potrebbe non riflettere il testo aggiornato.'
        : 'La verifica segnala problemi gravi (es. omissioni o pezzi non tradotti).';
    const tooltipReanalyze = !hasText
      ? 'Serve una traduzione per rianalizzare.'
      : !onReanalyzePage
        ? 'Configura Gemini per rianalizzare.'
        : state === 'verifying'
          ? 'Verifica già in corso.'
          : 'Rianalizza';
    const tooltipVerify = !hasText
      ? 'Serve una traduzione per verificare.'
      : !onVerifyPage
        ? 'Configura Gemini per verificare.'
        : state === 'verifying'
          ? 'Verifica già in corso.'
          : state === 'verified'
            ? 'Già verificata. Usa Rianalizza.'
            : 'Verifica';
    const tmeta = translationsMeta?.[page];
    const vmeta = verificationsMeta?.[page];
    const progressLine = state === 'verifying'
      ? `${v?.progress || 'In corso…'}${v?.startedAt ? ` • ${elapsedSec}s` : ''}${typeof v?.runId === 'number' ? ` • run ${v.runId}` : ''}`
      : '';
    const visibleAnnotations = display.annotations;

    return (
      <div className="fixed inset-0 z-[260] flex items-center justify-center" onClick={onClose}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <Draggable nodeRef={nodeRef} cancel=".modal-content, button, [role='button'], a, input, textarea, select" bounds="parent">
          <div
            ref={nodeRef}
            className="w-[600px] max-w-[calc(100vw-48px)] max-h-[90vh] flex flex-col bg-zinc-900/60 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl overflow-hidden relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
            <div className="modal-header shrink-0 p-4 border-b border-white/10 flex items-center justify-between cursor-move select-none hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-white/80" />
                <div className="text-sm font-semibold text-white drop-shadow-md">Dubbi & verifica — Pagina {page}</div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-white/60 hover:text-white hover:bg-white/5 rounded-lg cursor-pointer"
                aria-label="Chiudi"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal-content p-4 space-y-3 overflow-y-auto custom-scrollbar">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex items-center gap-2">
                  <span title={tooltipReanalyze}>
                    <button
                      type="button"
                      onClick={() => onReanalyzePage?.(page)}
                      disabled={!canReanalyze}
                      aria-label="Rianalizza"
                      className={`relative w-8 h-8 flex items-center justify-center rounded-full border transition-all ${canReanalyze
                        ? 'bg-white/5 hover:bg-white/10 text-white/80 border-white/10 hover:border-white/20'
                        : 'bg-white/5 text-white/25 border-white/10 opacity-60 cursor-not-allowed'
                        }`}
                    >
                      <Loader2 size={14} className={state === 'verifying' ? 'animate-spin' : ''} />
                      <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${dot} ${state === 'verifying' ? 'animate-pulse' : ''}`} />
                    </button>
                  </span>

                  <span title={tooltipVerify}>
                    <button
                      type="button"
                      onClick={() => onVerifyPage?.(page)}
                      disabled={!canVerify}
                      aria-label="Verifica"
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-semibold border transition-all ${canVerify
                        ? 'bg-[#007AFF]/80 hover:bg-[#007AFF] text-white border-white/10'
                        : 'bg-white/5 text-white/25 border-white/10 opacity-60 cursor-not-allowed'
                        }`}
                    >
                      <ShieldCheck size={14} />
                      <span>Verifica</span>
                    </button>
                  </span>

                  {isSevere && onFixPage && (
                    <button
                      type="button"
                      onClick={() => {
                        onFixPage(page);
                        onClose();
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-black border border-white/10 transition-all shadow-lg hover:scale-105 active:scale-95"
                    >
                      <Wand2 size={14} />
                      <span>Rifai con suggerimenti</span>
                    </button>
                  )}
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-white/90 drop-shadow">
                    {label}{severity ? ` • ${severity}` : ''}{v?.changed ? ' • testo aggiornato' : ''}
                  </div>
                  <div className="text-[10px] text-white/60 mt-1 leading-tight">
                    <div>Traduzione: {tmeta ? `${new Date(tmeta.savedAt).toLocaleString()} • Modello: ${tmeta.model}` : 'N/D'}</div>
                    <div>Verifica: {vmeta ? `${new Date(vmeta.savedAt).toLocaleString()} • Modello: ${vmeta.model}` : 'N/D'}</div>
                  </div>
                  {state === 'verifying' && <div className="text-[11px] text-white/60 mt-1 leading-snug drop-shadow-sm">{progressLine}</div>}
                  {v?.summary && <div className="text-[11px] text-white/60 mt-1 leading-snug drop-shadow-sm">{v.summary}</div>}
                </div>
              </div>

              {showDisclaimer && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-red-300">{disclaimerTitle}</div>
                  <div className="mt-1 text-[11px] text-red-200/90 leading-snug">{disclaimerBody}</div>
                </div>
              )}

              {evidence.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-white/60">Evidenze</div>
                  <div className="mt-2 space-y-1">
                    {evidence.slice(0, 8).map((ev, i) => (
                      <div key={i} className="text-[11px] text-white/70 leading-snug">• {ev}</div>
                    ))}
                  </div>
                </div>
              )}

              {visibleAnnotations.length === 0 ? (
                <div className="text-[11px] text-white/50">Nessun dubbio segnalato.</div>
              ) : (
                <div className="space-y-2">
                  {visibleAnnotations.map((ann) => (
                    <div key={ann.id} className="bg-white/5 border border-white/10 rounded-xl p-3">
                      {ann.originalText && <div className="text-[11px] text-white font-semibold">"{ann.originalText}"</div>}
                      {ann.comment && <div className="text-[11px] text-white/65 mt-1 leading-snug">{ann.comment}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Draggable>
      </div>
    );
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
  showConfirm
}) => {
  const [showHighlights] = useState<boolean>(true);
  const [showUserNotes] = useState<boolean>(true);
  const [showThumbnail, setShowThumbnail] = useState<boolean>(() => {
    const saved = localStorage.getItem('showThumbnail');
    return saved === null ? true : saved === 'true';
  });

  const toggleThumbnail = () => {
    setShowThumbnail(prev => {
      const next = !prev;
      localStorage.setItem('showThumbnail', String(next));
      return next;
    });
  };

  const [isHighlightToolActive, setIsHighlightToolActive] = useState<boolean>(false);
  const [isNoteToolActive, setIsNoteToolActive] = useState<boolean>(false);
  const [isEraserToolActive, setIsEraserToolActive] = useState<boolean>(false);
  const [newNoteModal, setNewNoteModal] = useState<{ page: number, start: number, end: number, text: string } | null>(null);
  const [viewingNoteId, setViewingNoteId] = useState<{ page: number, id: string } | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageRowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const programmaticTargetPageRef = useRef<number | null>(null);
  const [isSpaceDown, setIsSpaceDown] = useState<boolean>(false);
  const [isPanning, setIsPanning] = useState<boolean>(false);
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
      setIsSpaceDown(true);
      e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      setIsSpaceDown(false);
    };
    const onBlur = () => {
      setIsSpaceDown(false);
      setIsPanning(false);
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
      if (scrollRef.current) {
        setContainerWidth(scrollRef.current.clientWidth);
      } else {
        setContainerWidth(window.innerWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
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

  const [copiedErrorPages, setCopiedErrorPages] = useState<Record<number, boolean>>({});
  const [copiedLogPages, setCopiedLogPages] = useState<Record<number, boolean>>({});

  const [previewShowCrop, setPreviewShowCrop] = useState(true);
  const previewSrcRaw = previewPage != null
    ? ((previewShowCrop ? croppedImages?.[previewPage] : undefined) || originalImages?.[previewPage] || croppedImages?.[previewPage])
    : undefined;
  const previewSrc = toDisplayableImageSrc(previewSrcRaw);
  const [floatingPage, setFloatingPage] = useState<number | null>(null);
  const [activePage, setActivePage] = useState<number | null>(null);

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
    if (!canUseNoteTool) setIsNoteToolActive(false);
  }, [canUseNoteTool]);

  const criticalErrorsCount = useMemo(() => {
    let count = 0;
    pages.forEach(p => {
      const v = verificationMap[p];
      const hasSevere = v && v.severity === 'severe';
      const hasError = pageStatus[p]?.error;
      if (hasSevere || hasError) count++;
    });
    return count;
  }, [pages, verificationMap, pageStatus]);

  const criticalErrorPages = useMemo(() => {
    const arr: number[] = [];
    pages.forEach(p => {
      const v = verificationMap[p];
      const hasSevere = v && v.severity === 'severe';
      const hasError = pageStatus[p]?.error;
      if (hasSevere || hasError) arr.push(p);
    });
    return arr;
  }, [pages, verificationMap, pageStatus]);

  const isRetryAllCriticalInProgress = useMemo(() => {
    return criticalErrorPages.some((p) => Boolean(pageStatus[p]?.processing || pageStatus[p]?.loading));
  }, [criticalErrorPages, pageStatus]);

  const [isRetryAllCriticalCoolingDown, setIsRetryAllCriticalCoolingDown] = useState(false);
  const retryAllCriticalCooldownTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (retryAllCriticalCooldownTimerRef.current != null) {
        window.clearTimeout(retryAllCriticalCooldownTimerRef.current);
        retryAllCriticalCooldownTimerRef.current = null;
      }
    };
  }, []);

  const [isCriticalRetryDismissed, setIsCriticalRetryDismissed] = useState(false);

  useEffect(() => {
    if (criticalErrorsCount === 0 && isCriticalRetryDismissed) {
      setIsCriticalRetryDismissed(false);
    }
  }, [criticalErrorsCount, isCriticalRetryDismissed]);

  const handleRetryAllCriticalClick = () => {
    if (!onRetryAllCritical) return;
    if (isRetryAllCriticalInProgress || isRetryAllCriticalCoolingDown) return;

    setIsRetryAllCriticalCoolingDown(true);
    if (retryAllCriticalCooldownTimerRef.current != null) {
      window.clearTimeout(retryAllCriticalCooldownTimerRef.current);
    }
    retryAllCriticalCooldownTimerRef.current = window.setTimeout(() => {
      setIsRetryAllCriticalCoolingDown(false);
      retryAllCriticalCooldownTimerRef.current = null;
    }, 1500);

    onRetryAllCritical();
  };

  const frameDims = useMemo(() => {
    const dims = Object.values(pageDims) as { width: number; height: number }[];
    const valid = dims.filter((d) => Boolean(d?.width) && Boolean(d?.height));
    const portrait = valid.filter((d) => d.height >= d.width);
    const basis = portrait.length > 0 ? portrait : valid;
    if (basis.length === 0) return { width: 595, height: 842 };
    let maxW = 595;
    let maxH = 842;
    for (const d of basis) {
      if (d.width > maxW) maxW = d.width;
      if (d.height > maxH) maxH = d.height;
    }
    return { width: maxW, height: maxH };
  }, [pageDims]);

  const effectiveScale = useMemo(() => {
    const vw = containerWidth || (scrollRef.current?.clientWidth ?? window.innerWidth) || 0;
    const padPx = 64;
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
    setIsPanning(true);
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
    setIsPanning(false);
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
          setActivePage(bestPage);
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
    setActivePage(currentPage);
  }, [currentPage, pages, navigationMode]);

  useEffect(() => {
    if (!isTranslatedMode) {
      setFloatingPage(null);
      setPreviewPage(null);
      return;
    }
    const focusPage = activePage ?? pages[0] ?? null;
    if (focusPage !== floatingPage) {
      setFloatingPage(focusPage);
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
      className={`flex-1 ${enablePanScroll ? 'overflow-auto' : 'overflow-hidden'} p-4 md:p-8 custom-scrollbar bg-[#121212] ${isSpaceDown ? (isPanning ? 'cursor-grabbing select-none' : 'cursor-grab') : ''}`}
      style={{ paddingBottom: bottomPadding ?? 24 }}
    >
      <div className="flex flex-col items-stretch gap-8 lg:gap-12 min-w-full">
        {renderPages.map((p, idx) => {
          const dims = pageDims[p] || frameDims || { width: 595, height: 842 };
          const verification = verificationMap[p];
          const hasTranslation = typeof translationMap[p] === 'string' && translationMap[p].trim().length > 0;
          const translatedText = hasTranslation ? translationMap[p] : null;
          const PAGE_SPLIT = '[[PAGE_SPLIT]]';
          const splitText = translatedText?.includes(PAGE_SPLIT) ? translatedText.split(PAGE_SPLIT) : null;
          const isSplit = splitText !== null;
          const rightBaseOffset = isSplit ? (splitText![0].length + PAGE_SPLIT.length) : 0;
          const isIndexPage = Boolean(translatedText?.includes('[[INDEX]]'));
          const cRef = canvasRefsMap ? canvasRefsMap[p] : canvasRefs[idx];

          return (
            <div
              key={p}
              data-page={p}
              ref={(el) => {
                pageRowRefs.current[p] = el;
              }}
              className="flex gap-4 items-start w-fit mx-auto"
            >
              <div className={`relative group shrink-0 ${isTranslatedMode ? 'bg-[#f8f9fa] shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/5 rounded-[2px] overflow-hidden' : 'bg-transparent shadow-none border-0 rounded-none overflow-visible'}`}
                style={{
                  width: (dims.width * effectiveScale),
                  height: (dims.height * effectiveScale),
                  maxWidth: 'none'
                }}>

                <div className={(isTranslatedMode && hasTranslation) ? 'hidden' : 'flex items-center justify-center select-none h-full bg-white'}>
                  {cRef ? (
                    <canvas
                      ref={cRef}
                      style={{
                        width: `${dims.width * effectiveScale}px`,
                        height: `${dims.height * effectiveScale}px`
                      }}
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <Loader2 size={24} className="animate-spin" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Caricamento PDF...</span>
                    </div>
                  )}
                </div>

                {isTranslatedMode && hasTranslation && (
                  <>
                    <div
                      className={`${translationTheme === 'dark' ? 'bg-[#1a1a1a] text-gray-200 selection:bg-white/20 selection:text-white ring-1 ring-stone-700/60' : (translationTheme === 'sepia' ? 'bg-[#f6f0e1] text-stone-900 selection:bg-amber-100 selection:text-amber-950 ring-1 ring-stone-200/80' : 'bg-[#fbf7ef] text-stone-900 selection:bg-amber-100 selection:text-amber-950 ring-1 ring-stone-200/80')} h-full overflow-auto relative select-text custom-scrollbar-light shadow-inner ${isSplit ? 'px-[5%] py-[5.5%]' : 'px-[10%] py-[8%]'}`}
                      style={{
                        fontSize: `${(isSplit ? 11.5 : 13.4) * effectiveScale}px`,
                        backgroundImage: translationTheme === 'dark'
                          ? 'radial-gradient(1000px 500px at 20% 25%, rgba(255,255,255,0.02), transparent 55%), radial-gradient(1000px 500px at 80% 75%, rgba(255,255,255,0.02), transparent 55%)'
                          : 'radial-gradient(1200px 600px at 15% 20%, rgba(0,0,0,0.02), transparent 55%), radial-gradient(1200px 600px at 85% 80%, rgba(0,0,0,0.02), transparent 55%)'
                      }}
                    >
                      {isIndexPage ? (
                        <IndexView text={translatedText!} onPageClick={onPageClick} />
                      ) : isSplit ? (
                        <div className="flex h-full gap-8">
                          <div className="flex-1 border-r border-black/10 pr-6">
                            <MarkdownText
                              align="justify"
                              text={splitText![0]}
                              dark={translationTheme === 'dark'}
                              searchTerm={searchTerm}
                              activeResultId={activeResultId}
                              pageNumber={p}
                              baseOffset={0}
                              highlights={(showHighlights ? (userHighlights[p] || []) : [])}
                              userNotes={(showUserNotes ? (userNotes[p] || []) : [])}
                              onAddHighlight={(start, end, text, color) => onAddHighlight(p, start, end, text, color)}
                              onRemoveHighlight={(id) => onRemoveHighlight(p, id)}
                              onAddNote={(start, end, text, content) => onAddNote(p, start, end, text, content)}
                              onUpdateNote={(id, content) => onUpdateNote(p, id, content)}
                              onRemoveNote={(id) => onRemoveNote(p, id)}
                            />
                          </div>
                          <div className="flex-1 pl-2">
                            <MarkdownText
                              align="justify"
                              text={splitText![1]}
                              dark={translationTheme === 'dark'}
                              searchTerm={searchTerm}
                              activeResultId={activeResultId}
                              pageNumber={p}
                              baseOffset={rightBaseOffset}
                              highlights={(showHighlights ? (userHighlights[p] || []) : [])}
                              userNotes={(showUserNotes ? (userNotes[p] || []) : [])}
                              onAddHighlight={(start, end, text, color) => onAddHighlight(p, start, end, text, color)}
                              onRemoveHighlight={(id) => onRemoveHighlight(p, id)}
                              onAddNote={(start, end, text, content) => onAddNote(p, start, end, text, content)}
                              onUpdateNote={(id, content) => onUpdateNote(p, id, content)}
                              onRemoveNote={(id) => onRemoveNote(p, id)}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="mx-auto max-w-[70ch]">
                          <MarkdownText
                            align="justify"
                            text={translatedText!}
                            dark={translationTheme === 'dark'}
                            searchTerm={searchTerm}
                            activeResultId={activeResultId}
                            pageNumber={p}
                            highlights={(showHighlights ? (userHighlights[p] || []) : [])}
                            userNotes={(showUserNotes ? (userNotes[p] || []) : [])}
                            onAddHighlight={(start, end, text, color) => onAddHighlight(p, start, end, text, color)}
                            onRemoveHighlight={(id) => onRemoveHighlight(p, id)}
                            onAddNote={(start, end, text) => setNewNoteModal({ page: p, start, end, text })}
                            onUpdateNote={(id, content) => onUpdateNote(p, id, content)}
                            onRemoveNote={(id) => onRemoveNote(p, id)}
                            isHighlightToolActive={isHighlightToolActive}
                            isNoteToolActive={isNoteToolActive}
                            isEraserToolActive={isEraserToolActive}
                            onNoteClick={(id) => setViewingNoteId({ page: p, id })}
                          />
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => onCopy(p)}
                      className="absolute top-4 right-4 p-2.5 bg-white/80 hover:bg-white backdrop-blur-sm rounded-xl opacity-0 group-hover:opacity-100 transition-all z-10 shadow-sm border border-black/5 text-gray-500 hover:text-blue-600"
                      title="Copia traduzione"
                    >
                      {copiedPage === p ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                    </button>

                    {verification?.state === 'verified' && (verification?.severity === 'severe' || verification?.postRetryFailed) && (
                      <button
                        onClick={() => setNotesPage(p)}
                        className="absolute bottom-4 left-4 z-10 px-3 py-2 rounded-xl bg-red-600 text-white text-[11px] font-semibold shadow-lg hover:bg-red-700 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                      >
                        Disclaimer: possibili omissioni o pezzi non tradotti
                      </button>
                    )}
                    {verification?.state === 'failed' && (
                      <button
                        onClick={() => setNotesPage(p)}
                        className="absolute bottom-4 left-4 z-10 px-3 py-2 rounded-xl bg-red-600 text-white text-[11px] font-semibold shadow-lg hover:bg-red-700 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                      >
                        Disclaimer: verifica qualità non riuscita
                      </button>
                    )}
                    {verification?.state === 'verified' && verification?.severity === 'minor' && (
                      <button
                        onClick={() => setNotesPage(p)}
                        className="absolute bottom-4 left-4 z-10 px-3 py-2 rounded-xl bg-amber-500 text-amber-950 text-[11px] font-semibold shadow-lg hover:bg-amber-600 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                      >
                        Nota: dubbi interpretativi
                      </button>
                    )}
                  </>
                )}

                {isTranslatedMode && !hasTranslation && !pageStatus[p]?.error && (
                  <div className="absolute inset-0 bg-white/95 flex flex-col items-center justify-center backdrop-blur-xl z-50">
                    {!pageStatus[p]?.loading && !pageStatus[p]?.processing ? (
                      isManualMode ? (
                        <div className="flex flex-col items-center gap-4">
                          <button
                            onClick={() => onRetry(p)}
                            className="group/manual-btn relative flex items-center justify-center w-20 h-20 rounded-full bg-blue-500/10 border-2 border-blue-500/30 text-blue-600 hover:bg-blue-500 hover:text-white hover:border-blue-600 transition-all duration-300 shadow-lg hover:shadow-blue-500/40 pointer-events-auto"
                            title="Traduci questa pagina"
                          >
                            <CirclePlay size={40} className="group-hover/manual-btn:scale-110 transition-transform" />
                          </button>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600/70">Clicca per tradurre</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-4">
                          {isPaused ? <Pause size={40} className="text-orange-500 opacity-50" /> : <Loader2 className="animate-spin text-[#007AFF] w-12 h-12" />}
                          <div className="flex flex-col items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600/70">Traduzione automatica in avvio</span>
                            <button
                              onClick={() => onRetry(p)}
                              className="px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:text-blue-700 hover:border-blue-200 rounded-xl text-[10px] font-bold uppercase transition-all shadow-sm hover:shadow-md pointer-events-auto"
                            >
                              Avvia subito
                            </button>
                          </div>
                        </div>
                      )
                    ) : (
                      <>
                        {isPaused ? <Pause size={40} className="text-orange-500 opacity-50 mb-4" /> : <Loader2 className="animate-spin text-[#007AFF] w-12 h-12 mb-4" />}
                        <div className="flex flex-col items-center gap-3 w-full max-w-[320px]">
                          <span className="text-[11px] font-black uppercase tracking-widest text-gray-700 text-center px-4 leading-relaxed drop-shadow-sm">
                            {isPaused ? 'Traduzione in Pausa' : (pageStatus[p]?.loading || pageStatus[p]?.processing || 'Avvio traduzione...')}
                          </span>
                          {!isPaused && (
                            <div className="w-48 h-1 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                              <div className="h-full bg-blue-500 animate-progress w-full origin-left shadow-[0_0_8px_rgba(59,130,246,0.5)]" style={{ animationDuration: '2.5s' }} />
                            </div>
                          )}

                          {translationLogs?.[p] && (
                            <div className="mt-4 w-full bg-[#1e1e1e] rounded-xl border border-white/10 shadow-2xl overflow-hidden pointer-events-auto flex flex-col">
                              <div className="flex items-center justify-between px-3 py-2 bg-white/5 border-b border-white/5">
                                <div className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Log di Elaborazione</span>
                                </div>
                                <button
                                  onClick={async () => {
                                    const ok = await safeCopy(translationLogs[p]);
                                    if (ok) {
                                      setCopiedLogPages(prev => ({ ...prev, [p]: true }));
                                      window.setTimeout(() => setCopiedLogPages(prev => ({ ...prev, [p]: false })), 1500);
                                    }
                                  }}
                                  className="text-[9px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-gray-400 transition-colors"
                                >
                                  {copiedLogPages[p] ? 'Copiato' : 'Copia'}
                                </button>
                              </div>
                              <div className="p-3 text-[9px] font-mono text-blue-400/80 max-h-[140px] overflow-y-auto whitespace-pre-wrap select-text cursor-text leading-relaxed custom-scrollbar-dark">
                                {translationLogs[p].split('\n').slice(-15).join('\n')}
                                <div className="animate-pulse inline-block w-1 h-3 bg-blue-500/50 ml-1 translate-y-0.5" />
                              </div>
                            </div>
                          )}

                          {partialTranslations?.[p] && (
                            <div className="mt-2 w-full flex flex-col gap-1.5 pointer-events-auto">
                              <div className="flex justify-between items-center px-1">
                                <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">Streaming Anteprima</span>
                                <span className="text-[9px] text-gray-400">{partialTranslations[p].length} caratteri</span>
                              </div>
                              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-serif text-slate-700 h-[100px] overflow-y-auto whitespace-pre-wrap select-text cursor-text leading-relaxed shadow-inner">
                                {partialTranslations[p].length > 1000 
                                  ? `...${partialTranslations[p].slice(-1000)}` 
                                  : partialTranslations[p]}
                              </div>
                            </div>
                          )}

                          {!isPaused && (
                            <div className="mt-4 flex gap-2 pointer-events-auto">
                              <button 
                                onClick={() => onStop?.(p)}
                                className="px-4 py-2 bg-white border border-gray-200 text-gray-600 hover:text-red-600 hover:border-red-200 rounded-xl text-[10px] font-bold uppercase transition-all shadow-sm hover:shadow-md"
                              >
                                Stop
                              </button>
                              <button 
                                onClick={() => onRetry(p)}
                                className="px-4 py-2 bg-[#007AFF] text-white hover:bg-blue-600 rounded-xl text-[10px] font-bold uppercase transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                              >
                                <RotateCw size={12} />
                                Riprova
                              </button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {pageStatus[p]?.error && (
                  <div className="absolute inset-0 bg-red-50 flex flex-col items-center justify-center p-8 z-50">
                    <div className="text-red-600 font-black uppercase text-[10px] tracking-widest select-text">Errore Critico AI</div>
                    <div className="mt-2.5 max-w-[320px] w-full">
                      <div className="flex justify-end mb-1">
                        <button
                          onClick={async () => {
                            const ok = await safeCopy(String((typeof pageStatus[p]?.error === 'string' ? pageStatus[p]?.error : pageStatus[p]?.loading) || 'Errore durante la traduzione.'));
                            if (ok) {
                              setCopiedErrorPages(prev => ({ ...prev, [p]: true }));
                              window.setTimeout(() => setCopiedErrorPages(prev => ({ ...prev, [p]: false })), 1500);
                            }
                          }}
                          className="flex items-center gap-1 text-[8px] px-2 py-1 rounded bg-white hover:bg-white text-red-700 border border-red-200"
                          title="Copia errore"
                          aria-live="polite"
                        >
                          <Copy size={10} /> {copiedErrorPages[p] ? 'Copiato' : 'Copia'}
                        </button>
                      </div>
                      <div className="text-red-700/80 text-[10px] font-semibold text-center select-text selection:bg-red-100 selection:text-red-800">
                        {String((typeof pageStatus[p]?.error === 'string' ? pageStatus[p]?.error : pageStatus[p]?.loading) || 'Errore durante la traduzione.')}
                      </div>
                    </div>

                    {partialTranslations?.[p] && (
                      <div className="mt-4 w-[320px] flex flex-col gap-1.5">
                        <div className="text-[9px] font-bold text-red-600 uppercase tracking-wider">Ultimo testo ricevuto ({partialTranslations[p].length} ch)</div>
                        <div className="p-3 bg-red-50/50 border border-red-200/50 rounded-lg text-[10px] font-serif text-red-900/80 h-[100px] overflow-y-auto whitespace-pre-wrap select-text cursor-text pointer-events-auto leading-relaxed">
                          {partialTranslations[p].length > 1000 ? `...${partialTranslations[p].slice(-1000)}` : partialTranslations[p]}
                        </div>
                      </div>
                    )}

                    {translationLogs?.[p] && (
                      <div className="mt-4 p-2 bg-white/80 rounded text-[8px] font-mono text-gray-700 max-w-[320px] max-h-[180px] overflow-y-auto whitespace-pre-wrap border border-red-200 select-text cursor-text pointer-events-auto">
                        <div className="flex justify-end mb-1">
                          <button
                            onClick={async () => {
                              const ok = await safeCopy(translationLogs[p]);
                              if (ok) {
                                setCopiedLogPages(prev => ({ ...prev, [p]: true }));
                                window.setTimeout(() => setCopiedLogPages(prev => ({ ...prev, [p]: false })), 1500);
                              }
                            }}
                            className="flex items-center gap-1 text-[8px] px-2 py-1 rounded bg-white hover:bg-white text-gray-700 border border-red-200"
                            title="Copia log"
                            aria-live="polite"
                          >
                            <Copy size={10} /> {copiedLogPages[p] ? 'Copiato' : 'Copia'}
                          </button>
                        </div>
                        {translationLogs[p]}
                      </div>
                    )}
                    <button onClick={() => onRetry(p)} className="mt-4 px-8 py-3 bg-red-600 text-white rounded-xl text-xs font-black uppercase shadow-xl hover:bg-red-700 transition-colors">Ricarica Pagina</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {notesPage != null && (
        <NotesModal
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
        />
      )}

      {isTranslatedMode && showThumbnail && floatingPage && (
        <div className="fixed inset-0 z-[150] pointer-events-none">
          <div className="relative w-full h-full">
            <OriginalThumbnail
              src={toDisplayableImageSrc(croppedImages?.[floatingPage] || originalImages?.[floatingPage]) || ""}
              onOpen={() => {
                if (onOpenOriginalPage) onOpenOriginalPage(floatingPage);
                else setPreviewPage(floatingPage);
              }}
              onOpenModal={() => setPreviewPage(floatingPage)}
              scale={thumbnailScale}
              onScaleChange={updateThumbnailScale}
              pageRatio={pageDims[floatingPage] ? (pageDims[floatingPage].height / pageDims[floatingPage].width) : 1.41}
            />
          </div>
        </div>
      )}

      {/* Modal Preview */}
      {previewPage != null && (
        <OriginalPreviewModal
          pdfDoc={pdfDoc}
          src={previewSrc}
          page={previewPage}
          onClose={() => setPreviewPage(null)}
          onCrop={onCropPage}
          onRotate={onRotatePage}
          onReplace={onReplacePage}
        />
      )}

      {onRetryAllCritical && criticalErrorsCount > 0 && !isCriticalRetryDismissed && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-top-4 fade-in duration-300 pointer-events-auto">
          <div className="flex items-center gap-2">
            <button
              onClick={handleRetryAllCriticalClick}
              disabled={isRetryAllCriticalInProgress || isRetryAllCriticalCoolingDown}
              className={`flex items-center gap-3 px-6 py-3 bg-red-600 text-white rounded-full shadow-2xl transition-all border border-red-400/30 ${
                (isRetryAllCriticalInProgress || isRetryAllCriticalCoolingDown)
                  ? 'opacity-70 cursor-not-allowed'
                  : 'hover:bg-red-700 hover:scale-105 active:scale-95'
              }`}
            >
              {isRetryAllCriticalInProgress ? (
                <Loader2 size={18} className="text-white/90 animate-spin" />
              ) : (
                <RotateCw size={18} className="text-white/90" />
              )}
              <div className="flex flex-col items-start leading-none">
                <span className="text-[10px] font-black uppercase tracking-widest text-red-200">Attenzione</span>
                <span className="text-sm font-bold">
                  {isRetryAllCriticalInProgress ? 'Riprovo…' : `Riprova ${criticalErrorsCount} pagine con errori`}
                </span>
              </div>
            </button>
            <button
              onClick={() => setIsCriticalRetryDismissed(true)}
              aria-label="Chiudi avviso"
              className="w-8 h-8 rounded-full bg-black/35 flex items-center justify-center border border-white/20 hover:bg-black/45 transition-colors"
            >
              <X size={16} className="text-white/90" />
            </button>
          </div>
        </div>
      )}
      {/* New Note Input Modal */}
      {newNoteModal && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setNewNoteModal(null)}>
          <div className="bg-[#1e1e1e] border border-white/10 p-6 rounded-2xl w-[400px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-white mb-2">Aggiungi Nota</h3>
            <p className="text-xs text-gray-400 mb-4 italic line-clamp-2">"{newNoteModal.text}"</p>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const content = formData.get('content') as string;
              if (content.trim()) {
                onAddNote(newNoteModal.page, newNoteModal.start, newNoteModal.end, newNoteModal.text, content.trim());
                setNewNoteModal(null);
                setIsNoteToolActive(false); // Deactivate after adding
              }
            }}>
              <textarea
                name="content"
                autoFocus
                className="w-full bg-black/20 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-amber-500/50 min-h-[100px]"
                placeholder="Scrivi qui il tuo commento..."
              />
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setNewNoteModal(null)} className="px-4 py-2 text-xs font-medium text-gray-400 hover:text-white">Annulla</button>
                <button type="submit" className="px-4 py-2 bg-amber-500 text-black text-xs font-bold rounded-lg hover:bg-amber-400">Salva Nota</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Note Modal */}
      {viewingNoteId && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setViewingNoteId(null)}>
          <div className="bg-[#1e1e1e] border border-white/10 p-6 rounded-2xl w-[400px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><MessageSquare size={14} className="text-amber-500" /> Nota Utente</h3>
              <button onClick={() => {
                const proceed = () => {
                  onRemoveNote(viewingNoteId.page, viewingNoteId.id);
                  setViewingNoteId(null);
                };

                if (showConfirm) {
                  showConfirm("Elimina Nota", "Sei sicuro di voler eliminare questa nota?", proceed, 'danger');
                } else if (confirm('Eliminare questa nota?')) {
                  proceed();
                }
              }} className="text-red-400 hover:text-red-300"><Trash2 size={14} /></button>
            </div>
            {(() => {
              const note = userNotes[viewingNoteId.page]?.find(n => n.id === viewingNoteId.id);
              if (!note) return <div className="text-gray-500">Nota non trovata.</div>;
              return (
                <div className="space-y-4">
                  <div className="p-3 bg-white/5 rounded-xl border border-white/5 text-xs text-gray-400 italic">"{note.text}"</div>
                  <div className="text-sm text-white whitespace-pre-wrap">{note.content}</div>
                  <div className="text-[10px] text-gray-600 pt-2 border-t border-white/5">{new Date(note.createdAt).toLocaleString()}</div>
                </div>
              )
            })()}
          </div>
        </div>
      )}
      <div className="fixed bottom-8 right-8 z-[100] flex flex-col items-end gap-3 pointer-events-auto">
        <button
          disabled={!canUseNoteTool}
          onClick={() => setIsNoteToolActive(v => {
            if (!canUseNoteTool) return false;
            if (!v) { setIsHighlightToolActive(false); setIsEraserToolActive(false); }
            return !v;
          })}
          className={`flex items-center justify-center w-12 h-12 rounded-full shadow-2xl transition-all border ${isNoteToolActive
            ? 'bg-amber-500 text-black border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)]'
            : 'bg-zinc-800 text-gray-400 border-white/10'
            } ${canUseNoteTool ? 'hover:scale-105 active:scale-95 hover:text-white hover:border-white/20' : 'opacity-40 cursor-not-allowed'}`}
          title={canUseNoteTool ? (isNoteToolActive ? "Disattiva Note" : "Aggiungi Nota") : "Le note si aggiungono sul testo tradotto"}
        >
          <MessageSquare size={20} />
        </button>

        <button
          onClick={() => setIsHighlightToolActive(v => {
            if (!v) { setIsNoteToolActive(false); setIsEraserToolActive(false); }
            return !v;
          })}
          className={`flex items-center justify-center w-12 h-12 rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 border ${isHighlightToolActive
            ? 'bg-yellow-500 text-black border-yellow-400 shadow-[0_0_20px_rgba(234,179,8,0.3)]'
            : 'bg-zinc-800 text-gray-400 hover:text-white border-white/10 hover:border-white/20'
            }`}
          title={isHighlightToolActive ? "Disattiva Evidenziatore" : "Attiva Evidenziatore"}
        >
          <Highlighter size={20} />
        </button>

        <button
          onClick={toggleThumbnail}
          className={`flex items-center justify-center w-12 h-12 rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 border ${showThumbnail
            ? 'bg-blue-600 text-white border-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.4)]'
            : 'bg-zinc-800 text-gray-400 hover:text-white border-white/10 hover:border-white/20'
            }`}
          title={showThumbnail ? "Nascondi miniatura originale" : "Mostra miniatura originale"}
        >
          {showThumbnail ? <Eye size={20} /> : <EyeOff size={20} />}
        </button>

        <button
          onClick={() => setIsEraserToolActive(v => {
            if (!v) { setIsNoteToolActive(false); setIsHighlightToolActive(false); }
            return !v;
          })}
          className={`flex items-center justify-center w-12 h-12 rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 border ${isEraserToolActive
            ? 'bg-rose-500 text-white border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.3)]'
            : 'bg-zinc-800 text-gray-400 hover:text-white border-white/10 hover:border-white/20'
            }`}
          title={isEraserToolActive ? "Disattiva Gomma" : "Attiva Gomma"}
        >
          <Trash2 size={20} />
        </button>
      </div>

    </div>
  )
};
