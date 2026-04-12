import * as pdfjsLib from 'pdfjs-dist';
import React from 'react';
import { log } from '../services/logger';
import { PAGE_RENDER_TIMEOUT_MS } from '../constants';
import { withTimeout } from './async';
import { dataUrlToBase64, canvasToBlob, blobToObjectURL } from './imageUtils';

export const loadReplacementPdfDoc = async (filePath: string): Promise<pdfjsLib.PDFDocumentProxy> => {
  if (!window.electronAPI) throw new Error('Contesto Electron non rilevato');
  try {
    const buffer = await window.electronAPI.readPdfFile(filePath);
    const doc = await pdfjsLib.getDocument({
      data: buffer,
      cMapUrl: './pdfjs/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: './pdfjs/standard_fonts/'
    }).promise;

    return doc;
  } catch (e: any) {
    log.error(`Errore caricamento PDF sostitutivo: ${filePath}`, e);
    throw e;
  }
};

export const renderDocPageToJpeg = async (doc: pdfjsLib.PDFDocumentProxy, pageNum: number, opts?: { scale?: number; jpegQuality?: number; extraRotation?: number; signal?: AbortSignal; timeoutMs?: number }) => {
  const { scale = 3.0, jpegQuality = 0.86, extraRotation = 0, signal, timeoutMs = PAGE_RENDER_TIMEOUT_MS } = opts || {};
  if (signal?.aborted) throw new Error('Operazione annullata');

  const page = await withTimeout<pdfjsLib.PDFPageProxy>(doc.getPage(pageNum), timeoutMs);
  if (signal?.aborted) throw new Error('Operazione annullata');

  const canvas = document.createElement('canvas');
  let renderTask: any = null;
  try {
    const baseRotation = (((page.rotate || 0) + extraRotation) % 360 + 360) % 360;
    const viewport = page.getViewport({ scale, rotation: baseRotation });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (ctx) {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    renderTask = page.render({ canvasContext: ctx as any, viewport, canvas });
    await withTimeout(renderTask.promise, timeoutMs, () => {
      try { renderTask?.cancel?.(); } catch { }
    });
    if (signal?.aborted) throw new Error('Operazione annullata');

    const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
    const base64 = dataUrlToBase64(dataUrl);
    if (!base64) throw new Error('Immagine vuota');
    return { dataUrl, base64, width: viewport.width, height: viewport.height };
  } finally {
    try { renderTask?.cancel?.(); } catch { }
    canvas.width = 0;
    canvas.height = 0;
    try { page.cleanup(); } catch { }
  }
};

export const renderDocPageToObjectURL = async (doc: pdfjsLib.PDFDocumentProxy, pageNum: number, opts?: { scale?: number; jpegQuality?: number; extraRotation?: number; signal?: AbortSignal; timeoutMs?: number }) => {
  const { scale = 3.0, jpegQuality = 0.86, extraRotation = 0, signal, timeoutMs = PAGE_RENDER_TIMEOUT_MS } = opts || {};
  if (signal?.aborted) throw new Error('Operazione annullata');

  const page = await withTimeout<pdfjsLib.PDFPageProxy>(doc.getPage(pageNum), timeoutMs);
  if (signal?.aborted) throw new Error('Operazione annullata');

  const canvas = document.createElement('canvas');
  let renderTask: any = null;
  try {
    const baseRotation = (((page.rotate || 0) + extraRotation) % 360 + 360) % 360;
    const viewport = page.getViewport({ scale, rotation: baseRotation });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (ctx) {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    renderTask = page.render({ canvasContext: ctx as any, viewport, canvas });
    await withTimeout(renderTask.promise, timeoutMs, () => {
      try { renderTask?.cancel?.(); } catch { }
    });
    if (signal?.aborted) throw new Error('Operazione annullata');

    const blob = await canvasToBlob(canvas, jpegQuality);
    return blobToObjectURL(blob);
  } finally {
    try { renderTask?.cancel?.(); } catch { }
    canvas.width = 0;
    canvas.height = 0;
    try { page.cleanup(); } catch { }
  }
};

export const renderPageToObjectURL = async (
  pageNum: number,
  args: {
    pdfDoc: pdfjsLib.PDFDocumentProxy;
    pageReplacementsRef: React.MutableRefObject<Record<number, any>>;
    pageRotationsRef: React.MutableRefObject<Record<number, number>>;
    loadReplacementPdfDoc: (path: string) => Promise<pdfjsLib.PDFDocumentProxy>;
  },
  opts?: { scale?: number; jpegQuality?: number; signal?: AbortSignal; timeoutMs?: number }
) => {
  const { pdfDoc, pageReplacementsRef, pageRotationsRef, loadReplacementPdfDoc } = args;
  if (!pdfDoc) throw new Error('PDF non caricato');
  const { scale = 3.0, jpegQuality = 0.86, signal, timeoutMs = PAGE_RENDER_TIMEOUT_MS } = opts || {};
  if (signal?.aborted) throw new Error('Operazione annullata');

  const replacement = pageReplacementsRef.current[pageNum];
  const doc = replacement?.filePath ? await loadReplacementPdfDoc(replacement.filePath) : pdfDoc;
  const isReplacement = !!replacement?.filePath;

  const srcPage = replacement?.filePath ? replacement.sourcePage : pageNum;
  const page = await withTimeout<pdfjsLib.PDFPageProxy>(doc.getPage(srcPage), timeoutMs);
  if (signal?.aborted) {
    if (isReplacement) try { await doc.destroy(); } catch { }
    throw new Error('Operazione annullata');
  }

  const canvas = document.createElement('canvas');
  let renderTask: any = null;
  try {
    const userRotation = pageRotationsRef.current[pageNum] || 0;
    const baseRotation = (((page.rotate || 0) + userRotation) % 360 + 360) % 360;
    const viewport = page.getViewport({ scale, rotation: baseRotation });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (ctx) {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    renderTask = page.render({ canvasContext: ctx as any, viewport, canvas });
    await withTimeout(renderTask.promise, timeoutMs, () => {
      try { renderTask?.cancel?.(); } catch { }
    });
    if (signal?.aborted) throw new Error('Operazione annullata');

    const blob = await canvasToBlob(canvas, jpegQuality);
    return blobToObjectURL(blob);
  } finally {
    try { renderTask?.cancel?.(); } catch { }
    canvas.width = 0;
    canvas.height = 0;
    try { page.cleanup(); } catch { }
    if (isReplacement) {
      try { await doc.destroy(); } catch { }
    }
  }
};

// Enhanced error handling for corrupted PDF pages
export interface RenderPageOptions extends Record<string, any> {
  scale?: number;
  jpegQuality?: number;
  extraRotation?: number;
  signal?: AbortSignal;
  maxRetries?: number;
  retryDelay?: number;
}

export interface RenderResult {
  success: boolean;
  dataUrl?: string;
  base64?: string;
  width?: number;
  height?: number;
  error?: any;
  attempts?: number;
}

export const renderDocPageWithFallback = async (
  doc: pdfjsLib.PDFDocumentProxy, 
  pageNum: number, 
  opts: RenderPageOptions = {}
): Promise<RenderResult> => {
  const { maxRetries = 3, retryDelay = 1000 } = opts;
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Progressive quality reduction for corrupted pages, but keeping high standards for OCR
      const quality = attempt === 1 ? (opts.jpegQuality || 0.86) : 
                     attempt === 2 ? 0.80 : 0.75;
      const scale = attempt === 1 ? (opts.scale || 3.0) : 
                   attempt === 2 ? 3.0 : 2.5;
      
      // Reduce timeout for subsequent attempts to fail faster
      const timeoutMs = Math.max(20000, PAGE_RENDER_TIMEOUT_MS - (attempt - 1) * 15000);

      log.info(`Attempting to render page ${pageNum}, attempt ${attempt}/${maxRetries} (quality: ${quality}, scale: ${scale}, timeout: ${timeoutMs}ms)`);
      
      const result = await renderDocPageToJpeg(doc, pageNum, {
        ...opts,
        scale,
        jpegQuality: quality,
        timeoutMs
      });
      
      return {
        success: true,
        ...result,
        attempts: attempt
      };
    } catch (error: any) {
      lastError = error;
      const isRenderingCancelled = error?.name === 'RenderingCancelledException' || 
                                 error?.message?.includes('cancelled');
      
      if (isRenderingCancelled && attempt < maxRetries) {
        log.warning(`Page ${pageNum} render cancelled, retrying in ${retryDelay}ms (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        continue;
      }
      
      // For other errors, try with lower quality immediately
      if (attempt < maxRetries) {
        log.warning(`Page ${pageNum} render failed with error: ${error?.message}, trying lower quality (attempt ${attempt}/${maxRetries})`);
        continue;
      }
    }
  }
  
  return {
    success: false,
    error: lastError,
    attempts: maxRetries
  };
};

// Detect if a PDF page might be corrupted
export const isPageCorrupted = async (
  doc: pdfjsLib.PDFDocumentProxy, 
  pageNum: number
): Promise<boolean> => {
  try {
    const page = await doc.getPage(pageNum);
    
    // Check if page has valid dimensions
    const viewport = page.getViewport({ scale: 1.0 });
    if (!viewport.width || !viewport.height || viewport.width <= 0 || viewport.height <= 0) {
      log.warning(`Page ${pageNum} has invalid dimensions: ${viewport.width}x${viewport.height}`);
      return true;
    }
    
    // Check if page has any content streams
    const operatorList = await page.getOperatorList();
    if (!operatorList.fnArray || operatorList.fnArray.length === 0) {
      log.info(`Page ${pageNum} has no content streams (possibly empty) - proceeding with render test`);
      // Don't mark as corrupted immediately, let the render test decide
    }
    
    // Try a quick render test
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(viewport.width, 100); // Small test render
    canvas.height = Math.min(viewport.height, 100);
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return true;
    
    const renderTask = page.render({
      canvasContext: ctx,
      viewport: page.getViewport({ scale: 0.1 }), // Very small scale for testing
      canvas
    });
    
    await renderTask.promise;
    
    // Clean up
    canvas.width = 0;
    canvas.height = 0;
    
    return false;
  } catch (error: any) {
    log.warning(`Page ${pageNum} corruption detection failed: ${error?.message}`);
    return true;
  }
};

// Enhanced render function with corruption detection
export const renderDocPageSafe = async (
  doc: pdfjsLib.PDFDocumentProxy, 
  pageNum: number, 
  opts: RenderPageOptions = {}
): Promise<RenderResult> => {
  try {
    // First check if page might be corrupted
    const corrupted = await isPageCorrupted(doc, pageNum);
    if (corrupted) {
      log.warning(`Page ${pageNum} detected as potentially corrupted, using fallback rendering`);
      return renderDocPageWithFallback(doc, pageNum, { ...opts, maxRetries: 5 });
    }
    
    // Try normal rendering first
    const result = await renderDocPageToJpeg(doc, pageNum, opts);
    return {
      success: true,
      ...result,
      attempts: 1
    };
  } catch (error: any) {
    log.warning(`Page ${pageNum} normal rendering failed, using fallback: ${error?.message}`);
    return renderDocPageWithFallback(doc, pageNum, opts);
  }
};

export const renderPageToJpegBase64 = async (
  pageNum: number,
  args: {
    pdfDoc: pdfjsLib.PDFDocumentProxy;
    pageReplacementsRef: React.MutableRefObject<Record<number, any>>;
    pageRotationsRef: React.MutableRefObject<Record<number, number>>;
    loadReplacementPdfDoc: (path: string) => Promise<pdfjsLib.PDFDocumentProxy>;
  },
  opts?: { scale?: number; jpegQuality?: number; signal?: AbortSignal }
) => {
  const { pdfDoc, pageReplacementsRef, pageRotationsRef, loadReplacementPdfDoc } = args;
  if (!pdfDoc) throw new Error('PDF non caricato');
  const { scale = 3.0, jpegQuality = 0.86, signal } = opts || {};
  if (signal?.aborted) throw new Error('Operazione annullata');

  const replacement = pageReplacementsRef.current[pageNum];
  const doc = replacement?.filePath ? await loadReplacementPdfDoc(replacement.filePath) : pdfDoc;
  const isReplacement = !!replacement?.filePath;
  
  const srcPage = replacement?.filePath ? replacement.sourcePage : pageNum;
  const page = await withTimeout<pdfjsLib.PDFPageProxy>(doc.getPage(srcPage), PAGE_RENDER_TIMEOUT_MS);
  if (signal?.aborted) {
    if (isReplacement) try { await doc.destroy(); } catch {}
    throw new Error('Operazione annullata');
  }

  const canvas = document.createElement('canvas');
  let renderTask: any = null;
  try {
    const userRotation = pageRotationsRef.current[pageNum] || 0;
    const baseRotation = (((page.rotate || 0) + userRotation) % 360 + 360) % 360;
    const viewport = page.getViewport({ scale, rotation: baseRotation });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (ctx) {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    renderTask = page.render({ canvasContext: ctx as any, viewport, canvas });
    await withTimeout(renderTask.promise, PAGE_RENDER_TIMEOUT_MS, () => {
      try { renderTask?.cancel?.(); } catch { }
    });
    if (signal?.aborted) throw new Error('Operazione annullata');

    const full = canvas.toDataURL('image/jpeg', jpegQuality);
    const base64 = dataUrlToBase64(full);
    if (!base64) throw new Error('Immagine vuota');
    return base64;
  } finally {
    try { renderTask?.cancel?.(); } catch { }
    canvas.width = 0;
    canvas.height = 0;
    try { page.cleanup(); } catch {}
    // Distruggiamo il documento se è un rimpiazzo caricato ad hoc
    if (isReplacement) {
      try { await doc.destroy(); } catch {}
    }
  }
};

export const renderPageOntoCanvas = async (
  pageNum: number,
  canvas: HTMLCanvasElement,
  args: {
    pdfDoc: pdfjsLib.PDFDocumentProxy;
    pageReplacementsRef: React.MutableRefObject<Record<number, any>>;
    pageRotationsRef: React.MutableRefObject<Record<number, number>>;
    loadReplacementPdfDoc: (path: string) => Promise<pdfjsLib.PDFDocumentProxy>;
  },
  opts?: { scale?: number; signal?: AbortSignal }
): Promise<{ width: number; height: number } | void> => {
  const { pdfDoc, pageReplacementsRef, pageRotationsRef, loadReplacementPdfDoc } = args;
  const { scale = 3.0, signal } = opts || {};
  if (!pdfDoc) throw new Error('PDF non caricato');
  if (signal?.aborted) throw new Error('Operazione annullata');
  const replacement = pageReplacementsRef.current[pageNum];
  const doc = replacement?.filePath ? await loadReplacementPdfDoc(replacement.filePath) : pdfDoc;
  const isReplacement = !!replacement?.filePath;
  const srcPage = replacement?.filePath ? replacement.sourcePage : pageNum;
  const page = await withTimeout<pdfjsLib.PDFPageProxy>(doc.getPage(srcPage), PAGE_RENDER_TIMEOUT_MS);
  if (signal?.aborted) {
    if (isReplacement) try { await doc.destroy(); } catch {}
    throw new Error('Operazione annullata');
  }
  let renderTask: any = null;
  try {
    const userRotation = pageRotationsRef.current[pageNum] || 0;
    const baseRotation = (((page.rotate || 0) + userRotation) % 360 + 360) % 360;
    const baseViewport = page.getViewport({ scale: 1, rotation: baseRotation });
    const viewport = page.getViewport({ scale, rotation: baseRotation });
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;
    
    // Cap output scale to 2.0 to save memory on ultra-high DPI screens
    const outputScale = Math.min(2.0, window.devicePixelRatio || 1);
    
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    
    // CRITICAL FIX: Ensure white background to prevent "Black Page" on transparent PDFs
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(outputScale, outputScale);
    renderTask = page.render({ canvasContext: context as any, viewport, canvas });
    await withTimeout(renderTask.promise, PAGE_RENDER_TIMEOUT_MS, () => {
      try { renderTask?.cancel?.(); } catch { }
    });
    return { width: baseViewport.width, height: baseViewport.height };
  } finally {
    try { renderTask?.cancel?.(); } catch { }
    try { page.cleanup(); } catch {}
    if (isReplacement) {
      try { await doc.destroy(); } catch {}
    }
  }
};
