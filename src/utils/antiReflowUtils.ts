/**
 * Utility per rendere gli highlight resistenti al reflow del testo
 * quando si cambia zoom o si riaprono progetti.
 */

/**
 * Stili CSS per highlight che minimizzano il reflow
 */
export const HIGHLIGHT_STYLES = {
  // Usa box-decoration-break per mantenere la coerenza dello stile
  ligatureSafe: `
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
    display: inline;
    padding: 0.1em 0;
    margin: 0;
    border-radius: 2px;
    word-break: break-word;
    overflow-wrap: break-word;
  `,
  
  // Stile che evita di rompere le legature
  noLigatureBreak: `
    font-variant-ligatures: no-common-ligatures;
    -webkit-font-variant-ligatures: no-common-ligatures;
    text-rendering: optimizeSpeed;
    -webkit-font-smoothing: antialiased;
  `,
  
  // Stile per mantenere la metrica del font
  fontMetrics: `
    line-height: inherit;
    vertical-align: baseline;
    font-kerning: auto;
    font-feature-settings: "kern" 1, "liga" 1;
  `
};

/**
 * Calcola la posizione di un highlight in modo più robusto
 * considerando fattori che possono causare reflow
 */
export function calculateRobustHighlightPosition(
  text: string,
  startOffset: number,
  endOffset: number,
  containerWidth: number,
  fontSize: number,
  lineHeight: number,
  padding: { left: number; right: number; top: number; bottom: number }
): {
  startLine: number;
  endLine: number;
  startX: number;
  endX: number;
  width: number;
  height: number;
  top: number;
} {
  // Stima caratteri per riga considerando padding
  const effectiveWidth = containerWidth - padding.left - padding.right;
  const avgCharWidth = fontSize * 0.45; // Stima più conservativa
  const charsPerLine = Math.floor(effectiveWidth / avgCharWidth);
  
  // Calcola posizioni linea
  const startLine = Math.floor(startOffset / charsPerLine);
  const endLine = Math.floor(endOffset / charsPerLine);
  
  // Calcola posizioni X relative
  const startX = padding.left + (startOffset % charsPerLine) * avgCharWidth;
  const endX = padding.left + (endOffset % charsPerLine) * avgCharWidth;
  
  // Calcola dimensioni
  const width = endLine === startLine ? endX - startX : effectiveWidth;
  const height = (endLine - startLine + 1) * lineHeight;
  const top = padding.top + startLine * lineHeight;
  
  return {
    startLine,
    endLine,
    startX,
    endX,
    width,
    height,
    top
  };
}

/**
 * Crea highlight segmentati per minimizzare l'impatto del reflow
 * Suddivide l'highlight in segmenti per riga per maggiore stabilità
 */
export function createSegmentedHighlight(
  text: string,
  startOffset: number,
  endOffset: number,
  containerWidth: number,
  fontSize: number,
  lineHeight: number,
  padding: { left: number; right: number; top: number; bottom: number }
): Array<{
  start: number;
  end: number;
  text: string;
  line: number;
  x: number;
  width: number;
  top: number;
}> {
  const segments: Array<{
    start: number;
    end: number;
    text: string;
    line: number;
    x: number;
    width: number;
    top: number;
  }> = [];
  
  const effectiveWidth = containerWidth - padding.left - padding.right;
  const avgCharWidth = fontSize * 0.45;
  const charsPerLine = Math.floor(effectiveWidth / avgCharWidth);
  
  let currentOffset = startOffset;
  
  while (currentOffset < endOffset) {
    const currentLine = Math.floor(currentOffset / charsPerLine);
    const lineStart = currentLine * charsPerLine;
    const lineEnd = Math.min(lineStart + charsPerLine, endOffset);
    
    const segmentText = text.slice(currentOffset, lineEnd);
    const x = currentLine === Math.floor(startOffset / charsPerLine) 
      ? padding.left + (currentOffset % charsPerLine) * avgCharWidth 
      : padding.left;
    const width = currentLine === Math.floor(endOffset / charsPerLine) 
      ? (lineEnd % charsPerLine) * avgCharWidth - (currentOffset % charsPerLine) * avgCharWidth
      : effectiveWidth - x + padding.left;
    
    segments.push({
      start: currentOffset,
      end: lineEnd,
      text: segmentText,
      line: currentLine,
      x,
      width: Math.max(0, width),
      top: padding.top + currentLine * lineHeight
    });
    
    currentOffset = lineEnd;
  }
  
  return segments;
}

/**
 * Verifica se un testo è suscettibile a reflow problematico
 */
export function isTextReflowSensitive(text: string): boolean {
  // Testo breve o con molte legature comuni
  if (text.length < 10) return true;
  
  // Contiene legature comuni
  const commonLigatures = /fi|fl|ff|ffi|ffl/g;
  if (commonLigatures.test(text)) return true;
  
  // Contiene caratteri speciali che possono causare reflow
  const specialChars = /[\u2013\u2014\u2018\u2019\u201c\u201d]/g; // dash e quotes
  if (specialChars.test(text)) return true;
  
  return false;
}

/**
 * Applica strategie anti-reflow al testo selezionato
 */
export function applyAntiReflowStrategy(
  text: string,
  startOffset: number,
  endOffset: number,
  isJustified: boolean = true
): {
  adjustedStart: number;
  adjustedEnd: number;
  adjustedText: string;
  strategy: 'expand-word' | 'expand-line' | 'minimize';
} {
  // Se il testo è corto e contiene legature, espandi alla parola intera
  if (isTextReflowSensitive(text)) {
    // Trova i confini della parola
    const beforeText = text.slice(0, startOffset);
    const afterText = text.slice(endOffset);
    
    // Trova inizio parola
    let wordStart = startOffset;
    while (wordStart > 0 && /\w/.test(text[wordStart - 1])) {
      wordStart--;
    }
    
    // Trova fine parola  
    let wordEnd = endOffset;
    while (wordEnd < text.length && /\w/.test(text[wordEnd])) {
      wordEnd++;
    }
    
    return {
      adjustedStart: wordStart,
      adjustedEnd: wordEnd,
      adjustedText: text.slice(wordStart, wordEnd),
      strategy: 'expand-word'
    };
  }
  
  // Per testo giustificato, considera di espandere all'intera linea se breve
  if (isJustified && text.length < 50) {
    return {
      adjustedStart: startOffset,
      adjustedEnd: endOffset,
      adjustedText: text,
      strategy: 'expand-line'
    };
  }
  
  return {
    adjustedStart: startOffset,
    adjustedEnd: endOffset,
    adjustedText: text,
    strategy: 'minimize'
  };
}