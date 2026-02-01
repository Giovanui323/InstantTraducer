import * as pdfjsLib from 'pdfjs-dist';
import React from 'react';
import { log } from '../services/logger';
import { PAGE_RENDER_TIMEOUT_MS } from '../constants';
import { withTimeout } from './async';
import { dataUrlToBase64 } from './imageUtils';

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

export const renderDocPageToJpeg = async (doc: pdfjsLib.PDFDocumentProxy, pageNum: number, opts?: { scale?: number; jpegQuality?: number; extraRotation?: number; signal?: AbortSignal }) => {
  const { scale = 2.1, jpegQuality = 0.86, extraRotation = 0, signal } = opts || {};
  if (signal?.aborted) throw new Error('Operazione annullata');

  const page = await withTimeout<pdfjsLib.PDFPageProxy>(doc.getPage(pageNum), PAGE_RENDER_TIMEOUT_MS);
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
    await withTimeout(renderTask.promise, PAGE_RENDER_TIMEOUT_MS, () => {
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
  const { scale = 2.1, jpegQuality = 0.86, signal } = opts || {};
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
  const { scale = 2.1, signal } = opts || {};
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
    const outputScale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(outputScale, outputScale);
    renderTask = page.render({ canvasContext: context as any, viewport, canvas });
    await withTimeout(renderTask.promise, PAGE_RENDER_TIMEOUT_MS, () => {
      try { renderTask?.cancel?.(); } catch { }
    });
    return { width: baseViewport.width, height: baseViewport.height };
  } finally {
    try { renderTask?.cancel?.(); } catch { }
    if (isReplacement) {
      try { await doc.destroy(); } catch {}
    }
  }
};
