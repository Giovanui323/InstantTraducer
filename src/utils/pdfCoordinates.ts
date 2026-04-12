/**
 * Utility per la conversione tra coordinate DOM e coordinate PDF User Space.
 * 
 * PDF User Space è il sistema di coordinate indipendente dal dispositivo usato da Adobe:
 * - Origine (0,0) in basso-sinistra della pagina
 * - Unità: 1 punto = 1/72 pollice
 * - Indipendente dallo zoom e dalla risoluzione del dispositivo
 * 
 * DOM coordinates:
 * - Origine (0,0) in alto-sinistra dell'elemento
 * - Dipendenti dallo zoom e dalla trasformazione CSS
 */

export interface PdfPoint {
  x: number;
  y: number;
}

export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DomPoint {
  x: number;
  y: number;
}

export interface DomRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Converte coordinate DOM in coordinate PDF User Space
 */
export function domToPdfCoordinates(
  domPoint: DomPoint,
  pageWidth: number,
  pageHeight: number,
  scale: number = 1,
  domRect: DomRect
): PdfPoint {
  // Calcola la posizione relativa nel DOM container
  const relativeX = domPoint.x - domRect.x;
  const relativeY = domPoint.y - domRect.y;
  
  // Converte in coordinate PDF (bottom-left origin)
  // Le dimensioni DOM sono già scalate, quindi dobbiamo rimuovere lo zoom
  const pdfX = relativeX / scale;
  const pdfY = pageHeight - (relativeY / scale);
  
  return { x: pdfX, y: pdfY };
}

/**
 * Converte coordinate PDF User Space in coordinate DOM
 */
export function pdfToDomCoordinates(
  pdfPoint: PdfPoint,
  pageWidth: number,
  pageHeight: number,
  scale: number = 1,
  domRect: DomRect
): DomPoint {
  // Converte da PDF (bottom-left) a DOM (top-left)
  const domX = (pdfPoint.x * scale) + domRect.x;
  const domY = ((pageHeight - pdfPoint.y) * scale) + domRect.y;
  
  return { x: domX, y: domY };
}

/**
 * Converte un rettangolo DOM in rettangolo PDF
 */
export function domToPdfRect(
  domRect: DomRect,
  pageWidth: number,
  pageHeight: number,
  scale: number = 1,
  containerRect: DomRect
): PdfRect {
  const topLeft = domToPdfCoordinates(
    { x: domRect.x, y: domRect.y },
    pageWidth,
    pageHeight,
    scale,
    containerRect
  );
  
  const bottomRight = domToPdfCoordinates(
    { x: domRect.x + domRect.width, y: domRect.y + domRect.height },
    pageWidth,
    pageHeight,
    scale,
    containerRect
  );
  
  return {
    x: topLeft.x,
    y: bottomRight.y, // y del bottom-left in PDF
    width: (domRect.width / scale),
    height: (domRect.height / scale)
  };
}

/**
 * Converte un rettangolo PDF in rettangolo DOM
 */
export function pdfToDomRect(
  pdfRect: PdfRect,
  pageWidth: number,
  pageHeight: number,
  scale: number = 1,
  containerRect: DomRect
): DomRect {
  const topLeft = pdfToDomCoordinates(
    { x: pdfRect.x, y: pdfRect.y + pdfRect.height }, // top-left in PDF
    pageWidth,
    pageHeight,
    scale,
    containerRect
  );
  
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: pdfRect.width * scale,
    height: pdfRect.height * scale
  };
}

/**
 * Calcola le coordinate PDF per una selezione di testo basata sugli offset
 */
export function calculatePdfCoordinatesFromTextSelection(
  startOffset: number,
  endOffset: number,
  textContent: string,
  pageWidth: number,
  pageHeight: number,
  fontSize: number,
  lineHeight: number,
  padding: { left: number; top: number; right: number; bottom: number }
): PdfRect {
  // Stima semplificata: calcola riga e posizione orizzontale
  const avgCharWidth = fontSize * 0.5; // Stima larghezza carattere
  const charsPerLine = (pageWidth - padding.left - padding.right) / avgCharWidth;
  
  const startLine = Math.floor(startOffset / charsPerLine);
  const endLine = Math.floor(endOffset / charsPerLine);
  
  const startX = padding.left + (startOffset % charsPerLine) * avgCharWidth;
  const endX = padding.left + (endOffset % charsPerLine) * avgCharWidth;
  
  const startY = pageHeight - padding.top - (startLine * lineHeight);
  const endY = pageHeight - padding.top - (endLine * lineHeight);
  
  // Per selezioni su più righe, usa la prima e l'ultima riga
  const rect: PdfRect = {
    x: startLine === endLine ? Math.min(startX, endX) : padding.left,
    y: Math.min(endY, startY) - lineHeight,
    width: startLine === endLine ? Math.abs(endX - startX) : (pageWidth - padding.left - padding.right),
    height: (Math.abs(endLine - startLine) + 1) * lineHeight
  };
  
  return rect;
}

/**
 * Converte coordinate mouse in coordinate relative al container del testo
 */
export function getRelativeMousePosition(
  event: MouseEvent,
  container: HTMLElement
): DomPoint {
  const rect = container.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

/**
 * Calcola la posizione e dimensione del container di testo in coordinate DOM
 */
export function getTextContainerMetrics(
  container: HTMLElement,
  scale: number = 1
): {
  domRect: DomRect;
  pageWidth: number;
  pageHeight: number;
} {
  const domRect = container.getBoundingClientRect();
  
  // Le dimensioni PDF sono le dimensioni DOM divise per lo zoom
  const pageWidth = domRect.width / scale;
  const pageHeight = domRect.height / scale;
  
  return {
    domRect: {
      x: domRect.left,
      y: domRect.top,
      width: domRect.width,
      height: domRect.height
    },
    pageWidth,
    pageHeight
  };
}

/**
 * Crea un highlight basato su coordinate PDF (Adobe-like)
 */
export function createPdfHighlight(
  pdfRect: PdfRect,
  color: string,
  opacity: number = 0.3
): HTMLElement {
  const highlight = document.createElement('div');
  highlight.className = 'pdf-highlight';
  highlight.style.cssText = `
    position: absolute;
    left: ${pdfRect.x}px;
    bottom: ${pdfRect.y}px;
    width: ${pdfRect.width}px;
    height: ${pdfRect.height}px;
    background-color: ${color};
    opacity: ${opacity};
    pointer-events: none;
    z-index: 10;
  `;
  return highlight;
}

/**
 * Converte selezione testo in coordinate PDF per memorizzazione
 */
export function textSelectionToPdfCoordinates(
  selection: Selection,
  container: HTMLElement,
  pageWidth: number,
  pageHeight: number,
  scale: number
): PdfRect | null {
  if (!selection || selection.rangeCount === 0) return null;
  
  const range = selection.getRangeAt(0);
  const containerRect = container.getBoundingClientRect();
  
  // Ottieni il bounding rect della selezione
  const selectionRect = range.getBoundingClientRect();
  
  // Converti in coordinate PDF
  return domToPdfRect(
    {
      x: selectionRect.left,
      y: selectionRect.top,
      width: selectionRect.width,
      height: selectionRect.height
    },
    pageWidth,
    pageHeight,
    scale,
    {
      x: containerRect.left,
      y: containerRect.top,
      width: containerRect.width,
      height: containerRect.height
    }
  );
}