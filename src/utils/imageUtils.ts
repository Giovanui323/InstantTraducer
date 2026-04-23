const PAGE_CACHE_JPEG_QUALITY = 0.74;
const PAGE_CACHE_MAX_EDGE = 1600;

import { log } from '../services/logger';

export const estimateBytesFromBase64 = (base64: string) => Math.floor((base64.length * 3) / 4);

export const dataUrlToBase64 = (dataUrl: string) => {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
};

export const buildJpegDataUrlFromBase64 = (base64: string) => `data:image/jpeg;base64,${base64}`;

export const ensureBase64 = (value: string) => {
  const s = String(value || "").trim();
  if (!s) return "";
  
  // Optimization: check if it has the data prefix before using regex
  let base64 = s;
  if (s.startsWith('data:')) {
    const idx = s.indexOf('base64,');
    if (idx >= 0) {
      base64 = s.slice(idx + 7);
    }
  }
  
  // Only use regex if we suspect there are spaces/newlines (rare in canvas output)
  if (base64.length < 100000 && /\s/.test(base64)) {
    return base64.replace(/\s+/g, "");
  }
  return base64;
};

export const detectImageMime = (value: string, fallback: string = "image/jpeg") => {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/i.exec(String(value || ""));
  return m ? m[1].toLowerCase() : fallback;
};

export const downsampleCanvasToJpegBase64 = (canvas: HTMLCanvasElement) => {
  const w = canvas.width;
  const h = canvas.height;
  if (!w || !h) return undefined;

  const maxEdge = Math.max(w, h);
  const ratio = maxEdge > PAGE_CACHE_MAX_EDGE ? (PAGE_CACHE_MAX_EDGE / maxEdge) : 1;
  const outW = Math.max(1, Math.round(w * ratio));
  const outH = Math.max(1, Math.round(h * ratio));

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext('2d', { alpha: false });
  if (!ctx) return undefined;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(canvas, 0, 0, w, h, 0, 0, outW, outH);
  const dataUrl = out.toDataURL('image/jpeg', PAGE_CACHE_JPEG_QUALITY);
  out.width = 0;
  out.height = 0;
  return dataUrlToBase64(dataUrl);
};

export const isProbablyBase64 = (value: string) => {
  const s = String(value || '').trim();
  if (!s) return false;
  if (s.startsWith('data:') || s.startsWith('blob:')) return false;
  if (s.length < 128) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(s);
};

export const toDisplayableImageSrc = (value?: string) => {
  if (!value) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  if (s.startsWith('data:') || s.startsWith('blob:')) return s;
  if (isProbablyBase64(s)) return buildJpegDataUrlFromBase64(s);
  return s;
};

export const canvasToBlob = (canvas: HTMLCanvasElement, quality: number = 0.8): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob failed'));
    }, 'image/jpeg', quality);
  });
};

export const base64ToBlob = (base64: string, mime: string = 'image/jpeg'): Blob => {
  try {
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
    return new Blob([array], { type: mime });
  } catch (e) {
    log.error('Failed to convert base64 to blob', e);
    throw e;
  }
};

export const blobToObjectURL = (blob: Blob): string => {
  return URL.createObjectURL(blob);
};

export const revokeObjectURL = (url: string) => {
  if (url && url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch (e) {
      log.warning('Failed to revoke object URL: ' + url, e);
    }
  }
};

export const rotateJpegBase64 = async (base64: string, degrees: number) => {
  const normalized = (((degrees % 360) + 360) % 360);
  if (normalized === 0) return base64;

  const img = new Image();
  img.src = buildJpegDataUrlFromBase64(base64);
  try {
    await img.decode();
  } catch {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Impossibile caricare immagine'));
    });
  }

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const rad = (normalized * Math.PI) / 180;
  const swap = normalized === 90 || normalized === 270;
  const out = document.createElement('canvas');
  out.width = swap ? h : w;
  out.height = swap ? w : h;
  const ctx = out.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas non disponibile');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2);
  const dataUrl = out.toDataURL('image/jpeg', PAGE_CACHE_JPEG_QUALITY);
  out.width = 0;
  out.height = 0;
  return dataUrlToBase64(dataUrl);
};

export const downscaleDataUrlToJpeg = async (dataUrl: string, opts: { maxSide: number; jpegQuality: number }) => {
  const { maxSide, jpegQuality } = opts;
  return await new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const natW = img.naturalWidth;
      const natH = img.naturalHeight;
      if (!natW || !natH) return reject(new Error('Immagine non valida'));
      const longSide = Math.max(natW, natH);
      const scale = longSide > maxSide ? maxSide / longSide : 1;
      const outW = Math.max(1, Math.round(natW * scale));
      const outH = Math.max(1, Math.round(natH * scale));
      const canvas = document.createElement('canvas');
      try {
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return reject(new Error('Canvas non disponibile'));
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, outW, outH);
        ctx.drawImage(img, 0, 0, outW, outH);
        const out = canvas.toDataURL('image/jpeg', jpegQuality);
        resolve(out);
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
    img.onerror = () => reject(new Error('Caricamento immagine fallito'));
    img.src = dataUrl;
  });
};

export const cropBase64 = async (base64: string, section: 'top' | 'bottom', fraction: number = 0.3): Promise<string> => {
  const img = new Image();
  img.src = buildJpegDataUrlFromBase64(base64);
  try {
    await img.decode();
  } catch {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Impossibile caricare immagine'));
    });
  }

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const cropH = Math.floor(h * fraction);

  const out = document.createElement('canvas');
  out.width = w;
  out.height = cropH;
  const ctx = out.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas non disponibile');

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, w, cropH);

  if (section === 'top') {
    // Draw top part: source y=0, source h=cropH
    ctx.drawImage(img, 0, 0, w, cropH, 0, 0, w, cropH);
  } else {
    // Draw bottom part: source y=h-cropH
    ctx.drawImage(img, 0, h - cropH, w, cropH, 0, 0, w, cropH);
  }

  const dataUrl = out.toDataURL('image/jpeg', PAGE_CACHE_JPEG_QUALITY);
  out.width = 0;
  out.height = 0;
  return dataUrlToBase64(dataUrl);
};

/**
 * Ridimensiona un'immagine base64 per l'invio all'API AI.
 * Mantiene il rapporto d'aspetto originale.
 * Se l'immagine è già più piccola di maxLongSide, viene restituita inalterata.
 * @param base64 - Immagine in formato base64 (senza prefisso data:)
 * @param maxLongSide - Lato lungo massimo in pixel (default: 1568)
 * @param jpegQuality - Qualità JPEG (default: 0.85)
 * @returns base64 ridimensionata (senza prefisso data:)
 */
export const downscaleBase64ForAI = async (
  base64: string,
  maxLongSide: number = 1568,
  jpegQuality: number = 0.85
): Promise<string> => {
  const img = new Image();
  img.src = buildJpegDataUrlFromBase64(base64);
  try {
    await img.decode();
  } catch {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Impossibile caricare immagine per downscale AI'));
    });
  }

  const natW = img.naturalWidth || img.width;
  const natH = img.naturalHeight || img.height;
  if (!natW || !natH) return base64; // Safety: immagine non valida

  const longSide = Math.max(natW, natH);
  if (longSide <= maxLongSide) {
    // Immagine già sotto il limite, nessun ridimensionamento necessario
    return base64;
  }

  const scale = maxLongSide / longSide;
  const outW = Math.max(1, Math.round(natW * scale));
  const outH = Math.max(1, Math.round(natH * scale));

  const canvas = document.createElement('canvas');
  try {
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return base64; // Fallback: ritorna originale se canvas non disponibile
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, 0, 0, outW, outH);
    const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
    const result = dataUrlToBase64(dataUrl);

    if (result.length < base64.length) {
      log.info(`[AI-DOWNSCALE] ${natW}x${natH} → ${outW}x${outH} (${Math.round(base64.length * 3 / 4 / 1024)}KB → ${Math.round(result.length * 3 / 4 / 1024)}KB)`);
    }

    return result;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
};

/**
 * Taglia un'immagine base64 a metà verticalmente, restituendo due immagini base64 (sinistra, destra).
 */
export const splitImageVertically = async (base64: string): Promise<[string, string]> => {
  const img = new Image();
  img.src = buildJpegDataUrlFromBase64(base64);
  try {
    await img.decode();
  } catch {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Impossibile caricare immagine per split'));
    });
  }

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const halfW = Math.floor(w / 2);

  const createHalf = (isLeft: boolean): string => {
    const canvas = document.createElement('canvas');
    try {
      canvas.width = halfW;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error("Canvas non disponibile per lo split");
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, halfW, h);
      
      const sx = isLeft ? 0 : halfW;
      ctx.drawImage(img, sx, 0, halfW, h, 0, 0, halfW, h);
      
      const dataUrl = canvas.toDataURL('image/jpeg', PAGE_CACHE_JPEG_QUALITY);
      return dataUrlToBase64(dataUrl);
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  };

  return [createHalf(true), createHalf(false)];
};

