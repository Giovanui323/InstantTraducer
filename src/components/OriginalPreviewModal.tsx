import React, { useEffect, useRef, useState, useLayoutEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, Maximize, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { log } from '../services/logger';
import { useZoomSystem } from '../hooks/useZoomSystem';
import { withTimeout } from '../utils/async';

interface OriginalPreviewModalProps {
  pdfDoc: any;
  src?: string;
  page: number;
  rotation?: number;
  mode?: 'view' | 'edit';
  isCropped?: boolean;
  onClose: () => void;
  onCrop?: (p: number) => void;
  onRotate?: (p: number) => void;
  onReplace?: (p: number) => void;
  isConsultationMode?: boolean;
  onPageChange?: (page: number) => void;
  totalPages?: number;
}

export const OriginalPreviewModal: React.FC<OriginalPreviewModalProps> = ({
  pdfDoc,
  src,
  page,
  rotation = 0,
  mode = 'view',
  onClose,
  onPageChange,
  totalPages: totalPagesProp,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [fitScale, setFitScale] = useState(1);
  const renderTaskRef = useRef<any>(null);
  const seqRef = useRef(0);
  const totalPages = totalPagesProp || pdfDoc?.numPages || 1;

  // ─── Zoom System (user-level zoom, 1 = fit-to-width) ───
  const { scale, setScale, zoomIn, zoomOut, resetZoom, handleWheel } = useZoomSystem({
    initialScale: 1,
    minScale: 0.3,
    maxScale: 5,
    precision: 3,
    scrollContainerRef: containerRef,
  });

  // Actual render scale = fitScale × user zoom
  const renderScale = fitScale * scale;

  // ─── Gesture support for macOS trackpad pinch-to-zoom ───
  const currentScaleRef = useRef(scale);
  useEffect(() => { currentScaleRef.current = scale; }, [scale]);

  const gestureScaleRef = useRef(1);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onGestureStart = (e: any) => {
      e.preventDefault();
      gestureScaleRef.current = currentScaleRef.current;
    };
    const onGestureChange = (e: any) => {
      e.preventDefault();
      setScale(gestureScaleRef.current * e.scale);
    };
    const onGestureEnd = (e: any) => { e.preventDefault(); };

    container.addEventListener('gesturestart', onGestureStart);
    container.addEventListener('gesturechange', onGestureChange);
    container.addEventListener('gestureend', onGestureEnd);
    return () => {
      container.removeEventListener('gesturestart', onGestureStart);
      container.removeEventListener('gesturechange', onGestureChange);
      container.removeEventListener('gestureend', onGestureEnd);
    };
  }, [setScale]);

  // ─── Lock body scroll, prevent browser zoom ───
  useEffect(() => {
    const orig = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    const container = containerRef.current;
    const preventZoom = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); };
    container?.addEventListener('wheel', preventZoom, { passive: false });
    return () => {
      document.body.style.overflow = orig;
      container?.removeEventListener('wheel', preventZoom);
    };
  }, []);

  // ─── Calculate fit-to-width scale on mount / page change ───
  useLayoutEffect(() => {
    if (!pdfDoc) { setLoading(false); return; }

    const calc = async () => {
      try {
        const pdfPage = await pdfDoc.getPage(page);
        const vp = pdfPage.getViewport({ scale: 1, rotation });
        const containerWidth = (containerRef.current?.clientWidth || window.innerWidth) - 80;
        const scaleW = containerWidth / vp.width;
        setFitScale(Math.min(scaleW, 3));
      } catch (e) {
        log.error('[PDF-Reader] Error calculating fit scale', {
          error: e instanceof Error ? e.message : String(e),
        });
        setFitScale(1);
      }
    };
    calc();
  }, [pdfDoc, page, rotation]);

  // ─── Render single page to canvas + text layer ───
  useEffect(() => {
    if (!pdfDoc) { setLoading(false); return; }
    let active = true;
    const seq = ++seqRef.current;

    const render = async () => {
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch { }
        renderTaskRef.current = null;
      }

      setLoading(true);

      try {
        const pdfPage: any = await withTimeout(pdfDoc.getPage(page), 15000);
        if (!active || seq !== seqRef.current) return;

        const viewport = pdfPage.getViewport({ scale: renderScale, rotation });
        const outputScale = Math.min(2, window.devicePixelRatio || 1);

        if (canvasRef.current) {
          const canvas = canvasRef.current;
          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.setTransform(outputScale, 0, 0, outputScale, 0, 0);
            renderTaskRef.current = pdfPage.render({ canvasContext: ctx, viewport });
            await withTimeout(renderTaskRef.current.promise, 15000, () => {
              try { renderTaskRef.current?.cancel?.(); } catch { }
            });
          }
        }

        // Text layer for text selection
        if (active && textLayerRef.current) {
          const div = textLayerRef.current;
          div.innerHTML = '';
          div.style.width = `${Math.floor(viewport.width)}px`;
          div.style.height = `${Math.floor(viewport.height)}px`;
          div.style.setProperty('--scale-factor', `${viewport.scale}`);

          const textContent = await withTimeout(pdfPage.getTextContent(), 10000);
          if (!active) return;

          const textLayer = new pdfjsLib.TextLayer({
            textContentSource: textContent as any,
            container: div,
            viewport,
          });
          await withTimeout(textLayer.render(), 10000);
        }

        if (typeof pdfPage.cleanup === 'function') {
          try { pdfPage.cleanup(); } catch { }
        }
      } catch (e: any) {
        if (!active || seq !== seqRef.current) return;
        log.error(`[PDF-Reader] Render error page ${page}`, {
          error: e instanceof Error ? e.message : String(e),
        });
      } finally {
        if (active && seq === seqRef.current) setLoading(false);
      }
    };

    const tid = setTimeout(render, 80);
    return () => {
      active = false;
      clearTimeout(tid);
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch { }
      }
    };
  }, [pdfDoc, page, renderScale, rotation]);

  // ─── Page navigation ───
  const goToPage = useCallback((p: number) => {
    const clamped = Math.max(1, Math.min(totalPages, p));
    onPageChange?.(clamped);
  }, [totalPages, onPageChange]);

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      switch (e.key) {
        case 'Escape':
          e.preventDefault(); onClose(); break;
        case 'ArrowLeft':
          e.preventDefault(); goToPage(page - 1); break;
        case 'ArrowRight':
          e.preventDefault(); goToPage(page + 1); break;
        case '+': case '=':
          e.preventDefault(); zoomIn(); break;
        case '-': case '_':
          e.preventDefault(); zoomOut(); break;
        case '0':
          e.preventDefault(); resetZoom(); break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, page, goToPage, zoomIn, zoomOut, resetZoom]);

  // ─── Focus on mount ───
  useEffect(() => { containerRef.current?.focus(); }, []);

  return (
    <div className="fixed inset-0 z-[250] outline-none flex flex-col">
      {/* Background */}
      <div className="absolute inset-0 bg-surface-0" />

      {/* ─── Top toolbar ─── */}
      <div className="relative z-[260] flex items-center justify-between px-5 py-2.5 bg-surface-1/95 backdrop-blur-xl border-b border-border-muted shrink-0">
        {/* Left: page nav */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className={`p-1.5 rounded-lg transition-all duration-200 ${page <= 1 ? 'text-txt-faint cursor-not-allowed' : 'text-txt-muted hover:text-txt-primary hover:bg-white/[0.04]'}`}
            title="Pagina precedente (←)"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-txt-primary text-[13px] font-medium tabular-nums min-w-[80px] text-center">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
            className={`p-1.5 rounded-lg transition-all duration-200 ${page >= totalPages ? 'text-txt-faint cursor-not-allowed' : 'text-txt-muted hover:text-txt-primary hover:bg-white/[0.04]'}`}
            title="Pagina successiva (→)"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Center: zoom info */}
        <span className="text-txt-faint text-[11px] font-mono tabular-nums">
          {Math.round(scale * 100)}%
        </span>

        {/* Right: zoom controls + close */}
        <div className="flex items-center gap-0.5">
          <button onClick={zoomOut} className="p-2 rounded-lg text-txt-muted hover:text-txt-primary hover:bg-white/[0.04] transition-all duration-200" title="Riduci (−)">
            <ZoomOut size={17} />
          </button>
          <button onClick={resetZoom} className="p-2 rounded-lg text-txt-muted hover:text-txt-primary hover:bg-white/[0.04] transition-all duration-200" title="Adatta alla larghezza (0)">
            <Maximize size={17} />
          </button>
          <button onClick={zoomIn} className="p-2 rounded-lg text-txt-muted hover:text-txt-primary hover:bg-white/[0.04] transition-all duration-200" title="Ingrandisci (+)">
            <ZoomIn size={17} />
          </button>
          <div className="w-px h-5 bg-border-muted mx-2" />
          <button onClick={onClose} className="p-2 rounded-lg text-txt-muted hover:text-danger hover:bg-danger/10 transition-all duration-200" title="Chiudi (Esc)">
            <X size={17} />
          </button>
        </div>
      </div>

      {/* ─── Scrollable single page ─── */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-auto outline-none select-text bg-surface-0"
        onWheel={handleWheel}
        tabIndex={-1}
      >
        <style>{`
          .pdf-reader-text-layer {
            position: absolute;
            left: 0; top: 0; right: 0; bottom: 0;
            overflow: hidden;
            line-height: 1.0;
          }
          .pdf-reader-text-layer > span {
            color: transparent;
            position: absolute;
            white-space: pre;
            cursor: text;
            transform-origin: 0% 0%;
          }
          .pdf-reader-text-layer > span::selection {
            background: rgba(245, 158, 11, 0.35);
          }
        `}</style>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 className="w-7 h-7 animate-spin text-accent" />
          </div>
        )}

        {pdfDoc ? (
          <div className="flex items-start justify-center py-6 px-10 min-h-full min-w-min">
            <div className="relative bg-white shadow-surface-2xl rounded-sm">
              <canvas ref={canvasRef} className="block" />
              <div ref={textLayerRef} className="pdf-reader-text-layer absolute inset-0" />
            </div>
          </div>
        ) : src ? (
          <div className="flex items-center justify-center min-h-full p-8">
            <img
              src={src}
              alt={`Pagina ${page}`}
              className="max-w-full object-contain rounded shadow-surface-xl"
              style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center min-h-full">
            <span className="text-txt-muted text-[12px] font-medium">Anteprima non disponibile</span>
          </div>
        )}
      </div>
    </div>
  );
};
