import { useState, useRef, useCallback, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFMetadata, PageReplacement } from '../types';
import { log } from '../services/logger';
import { withTimeout } from '../utils/async';

// Initialize worker locally
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs/pdf.worker.min.mjs';

const PAGE_RENDER_TIMEOUT_MS = 60_000;
const PAGE_CACHE_JPEG_QUALITY = 0.74;
const PAGE_CACHE_MAX_EDGE = 1600;

export const usePdfDocument = () => {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [metadata, setMetadata] = useState<PDFMetadata | null>(null);
  const [viewMode, setViewMode] = useState<'single' | 'side-by-side'>('single');
  const [pageDims, setPageDims] = useState<Record<number, { width: number, height: number }>>({});
  const [isReaderMode, setIsReaderMode] = useState(false);

  const replacementPdfCacheRef = useRef<Map<string, any>>(new Map());
  const renderTaskRef = useRef<{ [key: string]: any }>({});
  const latestPageRef = useRef<{ [key: string]: number }>({});

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      replacementPdfCacheRef.current.forEach(doc => {
        try { doc.destroy().catch(() => {}); } catch { }
      });
      replacementPdfCacheRef.current.clear();
      
      Object.values(renderTaskRef.current).forEach(task => {
        try { task.cancel(); } catch { }
      });
    };
  }, []);

  const loadReplacementPdfDoc = useCallback(async (filePath: string) => {
    const cached = replacementPdfCacheRef.current.get(filePath);
    if (cached) return cached;

    if (!window.electronAPI) throw new Error('Contesto Electron non rilevato');
    const buffer = await window.electronAPI.readPdfFile(filePath);
    const doc = await pdfjsLib.getDocument({
      data: buffer,
      cMapUrl: './pdfjs/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: './pdfjs/standard_fonts/'
    }).promise;

    // Cap cache size
    if (replacementPdfCacheRef.current.size >= 5) {
      const firstKey = replacementPdfCacheRef.current.keys().next().value;
      if (firstKey) {
        const oldestDoc = replacementPdfCacheRef.current.get(firstKey);
        try { oldestDoc?.destroy().catch(() => {}); } catch { }
        replacementPdfCacheRef.current.delete(firstKey);
      }
    }

    replacementPdfCacheRef.current.set(filePath, doc);
    return doc;
  }, []);

  const renderPage = useCallback(async (
    pageNum: number,
    canvas: HTMLCanvasElement,
    canvasKey: string,
    pageReplacements: Record<number, PageReplacement> = {},
    pageRotations: Record<number, number> = {}
  ) => {
    if (!pdfDoc) return;
    latestPageRef.current[canvasKey] = pageNum;

    // Cancel existing render task
    if (renderTaskRef.current[canvasKey]) {
      try {
        renderTaskRef.current[canvasKey].cancel();
        await renderTaskRef.current[canvasKey].promise.catch(() => {});
      } catch (e) { }
    }

    try {
      const replacement = pageReplacements[pageNum];
      const doc = replacement?.filePath ? await loadReplacementPdfDoc(replacement.filePath) : pdfDoc;
      const srcPage = replacement?.filePath ? replacement.sourcePage : pageNum;
      const page: any = await doc.getPage(srcPage);
      
      if (latestPageRef.current[canvasKey] !== pageNum) return;

      const userRotation = pageRotations[pageNum] || 0;
      const baseRotation = (((page?.rotate || 0) + userRotation) % 360 + 360) % 360;

      const baseViewport = page.getViewport({ scale: 1, rotation: baseRotation });
      setPageDims(prev => ({ ...prev, [pageNum]: { width: baseViewport.width, height: baseViewport.height } }));
      const viewport = page.getViewport({ scale: scale, rotation: baseRotation });
      
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return;
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = Math.floor(viewport.width) + "px";
      canvas.style.height = Math.floor(viewport.height) + "px";
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(outputScale, outputScale);
      
      const renderTask = page.render({ canvasContext: context, viewport });
      renderTaskRef.current[canvasKey] = renderTask;
      
      await renderTask.promise;
    } catch (e: any) { 
        if (e.name !== 'RenderingCancelledException') {
             log.error(`Errore render pagina ${pageNum}`, e); 
        }
    }
  }, [pdfDoc, scale, loadReplacementPdfDoc]);

  const renderDocPageToJpeg = useCallback(async (doc: any, pageNum: number, opts?: { scale?: number; jpegQuality?: number; extraRotation?: number; signal?: AbortSignal }) => {
    const { scale = 2.1, jpegQuality = 0.86, extraRotation = 0, signal } = opts || {};
    if (signal?.aborted) throw new Error('Operazione annullata');

    const page: any = await withTimeout<any>(doc.getPage(pageNum), PAGE_RENDER_TIMEOUT_MS);
    if (signal?.aborted) throw new Error('Operazione annullata');

    const canvas = document.createElement('canvas');
    let renderTask: any = null;
    try {
      const baseRotation = (((page?.rotate || 0) + extraRotation) % 360 + 360) % 360;
      const viewport = page.getViewport({ scale, rotation: baseRotation });
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const ctx = canvas.getContext('2d', { alpha: false });
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      renderTask = page.render({ canvasContext: ctx as any, viewport });
      await withTimeout(renderTask.promise, PAGE_RENDER_TIMEOUT_MS, () => {
        try { renderTask?.cancel?.(); } catch { }
      });
      if (signal?.aborted) throw new Error('Operazione annullata');

      const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      if (!base64) throw new Error('Immagine vuota');
      return { dataUrl, base64, width: viewport.width, height: viewport.height };
    } finally {
      try { renderTask?.cancel?.(); } catch { }
      canvas.width = 0;
      canvas.height = 0;
    }
  }, []);

  const renderPageToJpegBase64 = useCallback(async (
    pageNum: number, 
    pageReplacements: Record<number, PageReplacement> = {},
    pageRotations: Record<number, number> = {},
    opts?: { scale?: number; jpegQuality?: number; signal?: AbortSignal }
  ) => {
    if (!pdfDoc) throw new Error('PDF non caricato');
    const { scale = 2.1, jpegQuality = 0.86, signal } = opts || {};
    if (signal?.aborted) throw new Error('Operazione annullata');

    const replacement = pageReplacements[pageNum];
    const doc = replacement?.filePath ? await loadReplacementPdfDoc(replacement.filePath) : pdfDoc;
    const srcPage = replacement?.filePath ? replacement.sourcePage : pageNum;
    const page: any = await withTimeout<any>(doc.getPage(srcPage), PAGE_RENDER_TIMEOUT_MS);
    if (signal?.aborted) throw new Error('Operazione annullata');

    const canvas = document.createElement('canvas');
    let renderTask: any = null;
    try {
      const userRotation = pageRotations[pageNum] || 0;
      const baseRotation = (((page?.rotate || 0) + userRotation) % 360 + 360) % 360;
      const viewport = page.getViewport({ scale, rotation: baseRotation });
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const ctx = canvas.getContext('2d', { alpha: false });
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      renderTask = page.render({ canvasContext: ctx as any, viewport });
      await withTimeout(renderTask.promise, PAGE_RENDER_TIMEOUT_MS, () => {
        try { renderTask?.cancel?.(); } catch { }
      });
      if (signal?.aborted) throw new Error('Operazione annullata');

      const full = canvas.toDataURL('image/jpeg', jpegQuality);
      const base64 = full.includes(',') ? full.split(',')[1] : full;
      if (!base64) throw new Error('Immagine vuota');
      return base64;
    } finally {
      try { renderTask?.cancel?.(); } catch { }
      canvas.width = 0;
      canvas.height = 0;
    }
  }, [loadReplacementPdfDoc, pdfDoc]);

  return {
    pdfDoc,
    setPdfDoc,
    currentPage,
    setCurrentPage,
    scale,
    setScale,
    metadata,
    setMetadata,
    viewMode,
    setViewMode,
    pageDims,
    setPageDims,
    isReaderMode,
    setIsReaderMode,
    loadReplacementPdfDoc,
    renderPage,
    renderDocPageToJpeg,
    renderPageToJpegBase64,
    replacementPdfCacheRef
  };
};
