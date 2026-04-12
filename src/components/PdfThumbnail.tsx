import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { log } from '../services/logger';
import { withTimeout } from '../utils/async';

interface PdfThumbnailProps {
  pdfDoc: any;
  page: number;
  className?: string;
  width?: number;
  height?: number;
  scale?: number;
}

export const PdfThumbnail: React.FC<PdfThumbnailProps> = ({
  pdfDoc,
  page,
  className,
  width,
  height,
  scale = 1
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const renderSeqRef = useRef(0);

  useEffect(() => {
    let active = true;
    let renderTask: any = null;
    let pdfPage: any = null;
    const seq = ++renderSeqRef.current;
    const RENDER_TIMEOUT_MS = 15000;

    const render = async () => {
      if (!pdfDoc) {
        if (active && seq === renderSeqRef.current) {
          setLoading(false);
        }
        return;
      }

      try {
        if (renderTask) {
          try { renderTask.cancel(); } catch { }
          renderTask = null;
        }

        if (active && seq === renderSeqRef.current) {
          setLoading(true);
          setError(null);
        }

        pdfPage = await withTimeout(pdfDoc.getPage(page), RENDER_TIMEOUT_MS);
        if (!active) return;

        let viewport = pdfPage.getViewport({ scale: 1 });
        let finalScale = scale;

        if (width && height) {
           const scaleW = width / viewport.width;
           const scaleH = height / viewport.height;
           finalScale = Math.min(scaleW, scaleH);
        } else if (width) {
           finalScale = width / viewport.width;
        }

        viewport = pdfPage.getViewport({ scale: finalScale });

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
            renderTask = pdfPage.render({ canvasContext: ctx, viewport });
            await withTimeout(renderTask.promise, RENDER_TIMEOUT_MS, () => {
              try { renderTask?.cancel?.(); } catch { }
            });
          }
        }
      } catch (e: any) {
        if (!active || seq !== renderSeqRef.current) return;
        log.error("PdfThumbnail render error", {
          error: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack : undefined,
          page
        });
        setError("Errore");
      } finally {
        if (seq === renderSeqRef.current) {
          if (active) setLoading(false);
        }
        if (pdfPage && typeof pdfPage.cleanup === 'function') {
          try { pdfPage.cleanup(); } catch { }
        }
        pdfPage = null;
      }
    };

    render();

    return () => {
      active = false;
      if (renderTask) {
        try { renderTask.cancel(); } catch {}
      }
    };
  }, [pdfDoc, page, width, height, scale]);

  return (
    <div className={`relative ${className || ''}`} style={{ width: width || '100%', height: height || '100%' }}>
      <canvas ref={canvasRef} className="block w-full h-full object-contain" />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-3/30">
          <Loader2 className="w-5 h-5 animate-spin text-accent" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-3 text-txt-faint text-[10px] font-bold">
          !
        </div>
      )}
    </div>
  );
};
