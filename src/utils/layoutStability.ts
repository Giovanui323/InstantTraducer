/**
 * Utility per memorizzare e ripristinare lo stato del layout del testo
 * per minimizzare lo spostamento quando si riaprono progetti o si cambia zoom.
 */

export interface TextLayoutSnapshot {
  timestamp: number;
  scrollPosition: { x: number; y: number };
  visibleRange: { start: number; end: number };
  lineMetrics: Array<{
    lineNumber: number;
    yPosition: number;
    height: number;
    textLength: number;
  }>;
  containerMetrics: {
    width: number;
    height: number;
    scrollTop: number;
    scrollLeft: number;
  };
}

/**
 * Crea uno snapshot del layout corrente del testo
 */
export function captureTextLayout(
  container: HTMLElement,
  textContent: string,
  startOffset: number = 0,
  endOffset: number = 0
): TextLayoutSnapshot {
  const containerRect = container.getBoundingClientRect();
  const scrollTop = container.scrollTop;
  const scrollLeft = container.scrollLeft;
  
  // Trova tutti i paragrafi visibili
  const paragraphs = Array.from(container.querySelectorAll('p, div'));
  const lineMetrics: TextLayoutSnapshot['lineMetrics'] = [];
  
  paragraphs.forEach((p, index) => {
    const rect = p.getBoundingClientRect();
    const relativeTop = rect.top - containerRect.top + scrollTop;
    
    lineMetrics.push({
      lineNumber: index,
      yPosition: relativeTop,
      height: rect.height,
      textLength: p.textContent?.length || 0
    });
  });
  
  // Determina il range visibile
  const visibleStart = Math.max(0, Math.floor(scrollTop / 20) * 50); // Stima caratteri
  const visibleEnd = Math.min(textContent.length, visibleStart + 2000); // ~2 pagine
  
  return {
    timestamp: Date.now(),
    scrollPosition: { x: scrollLeft, y: scrollTop },
    visibleRange: { start: visibleStart, end: visibleEnd },
    lineMetrics,
    containerMetrics: {
      width: containerRect.width,
      height: containerRect.height,
      scrollTop,
      scrollLeft
    }
  };
}

/**
 * Confronta due snapshot per rilevare cambiamenti significativi
 */
export function hasSignificantLayoutChange(
  oldSnapshot: TextLayoutSnapshot,
  newSnapshot: TextLayoutSnapshot,
  threshold: number = 5 // pixel
): boolean {
  // Controlla se le dimensioni del container sono cambiate significativamente
  const widthChange = Math.abs(newSnapshot.containerMetrics.width - oldSnapshot.containerMetrics.width);
  const heightChange = Math.abs(newSnapshot.containerMetrics.height - oldSnapshot.containerMetrics.height);
  
  if (widthChange > threshold * 10 || heightChange > threshold * 5) {
    return true;
  }
  
  // Controlla se le posizioni delle linee sono cambiate significativamente
  const oldLines = oldSnapshot.lineMetrics;
  const newLines = newSnapshot.lineMetrics;
  
  if (Math.abs(oldLines.length - newLines.length) > 2) {
    return true; // Numero significativo di linee cambiato
  }
  
  // Confronta le prime 10 linee per rilevare spostamenti
  const linesToCheck = Math.min(10, oldLines.length, newLines.length);
  for (let i = 0; i < linesToCheck; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    
    if (Math.abs(oldLine.yPosition - newLine.yPosition) > threshold) {
      return true;
    }
    
    if (Math.abs(oldLine.height - newLine.height) > threshold) {
      return true;
    }
  }
  
  return false;
}

/**
 * Trova la miglior corrispondenza per un highlight in base al layout
 */
export function findBestHighlightPosition(
  highlightText: string,
  highlightOriginalStart: number,
  highlightOriginalEnd: number,
  currentText: string,
  layoutSnapshot?: TextLayoutSnapshot
): { start: number; end: number; confidence: number } {
  // Prima prova la posizione originale
  const originalText = currentText.slice(highlightOriginalStart, highlightOriginalEnd);
  if (originalText === highlightText) {
    return { start: highlightOriginalStart, end: highlightOriginalEnd, confidence: 1.0 };
  }
  
  // Cerca il testo esatto usando quote matching
  const exactMatch = findTextWithContext(
    currentText,
    highlightText,
    '', // potremmo salvare il contesto
    '',
    highlightOriginalStart
  );
  
  if (exactMatch.found) {
    return { start: exactMatch.position, end: exactMatch.position + highlightText.length, confidence: 0.9 };
  }
  
  // Se abbiamo uno snapshot del layout, usa quello per raffinare la posizione
  if (layoutSnapshot) {
    const layoutBasedPosition = findPositionUsingLayout(
      highlightText,
      highlightOriginalStart,
      currentText,
      layoutSnapshot
    );
    
    if (layoutBasedPosition.confidence > 0.7) {
      return layoutBasedPosition;
    }
  }
  
  // Fallback: cerca il testo con tolleranza
  const fuzzyMatch = findFuzzyTextMatch(currentText, highlightText);
  if (fuzzyMatch.confidence > 0.6) {
    return fuzzyMatch;
  }
  
  // Ultima risorsa: mantieni la posizione originale anche se il testo non corrisponde perfettamente
  return { start: highlightOriginalStart, end: highlightOriginalEnd, confidence: 0.3 };
}

/**
 * Trova testo usando contesto e posizione approssimativa
 */
function findTextWithContext(
  haystack: string,
  needle: string,
  prefix: string,
  suffix: string,
  nearPosition: number
): { found: boolean; position: number; confidence: number } {
  // Implementazione semplificata di quote matching
  let position = haystack.indexOf(needle);
  
  if (position === -1) {
    return { found: false, position: -1, confidence: 0 };
  }
  
  // Se è vicino alla posizione originale, aumenta la fiducia
  const distance = Math.abs(position - nearPosition);
  const confidence = Math.max(0.5, 1.0 - (distance / 1000)); // Perde fiducia con la distanza
  
  return { found: true, position, confidence };
}

/**
 * Trova corrispondenze fuzzy del testo
 */
function findFuzzyTextMatch(text: string, target: string): { start: number; end: number; confidence: number } {
  // Implementazione semplificata: cerca la prima occorrenza con 80% di similarità
  const targetLower = target.toLowerCase();
  
  for (let i = 0; i <= text.length - target.length; i++) {
    const slice = text.slice(i, i + target.length).toLowerCase();
    let matches = 0;
    
    for (let j = 0; j < target.length; j++) {
      if (slice[j] === targetLower[j]) {
        matches++;
      }
    }
    
    const similarity = matches / target.length;
    if (similarity > 0.8) {
      return { start: i, end: i + target.length, confidence: similarity * 0.8 };
    }
  }
  
  return { start: 0, end: 0, confidence: 0 };
}

/**
 * Usa informazioni di layout per trovare la posizione
 */
function findPositionUsingLayout(
  highlightText: string,
  originalStart: number,
  currentText: string,
  layoutSnapshot: TextLayoutSnapshot
): { start: number; end: number; confidence: number } {
  // Stima la posizione basandosi sulla linea originale
  const originalLine = layoutSnapshot.lineMetrics.find(line => 
    originalStart >= (line.textLength * 0.8) && originalStart <= (line.textLength * 1.2)
  );
  
  if (!originalLine) {
    return { start: originalStart, end: originalStart + highlightText.length, confidence: 0.5 };
  }
  
  // Trova una linea simile nel testo corrente
  const similarLine = findSimilarLine(currentText, originalLine);
  
  if (similarLine) {
    // Stima la posizione nella nuova linea
    const relativePosition = originalStart / originalLine.textLength;
    const estimatedStart = Math.floor(similarLine.textLength * relativePosition);
    
    return { 
      start: Math.max(0, estimatedStart - 10), // Piccola tolleranza
      end: Math.min(currentText.length, estimatedStart + highlightText.length + 10),
      confidence: 0.75
    };
  }
  
  return { start: originalStart, end: originalStart + highlightText.length, confidence: 0.4 };
}

/**
 * Trova una linea simile nel testo corrente
 */
function findSimilarLine(text: string, targetLine: { textLength: number; lineNumber: number }): { textLength: number; startOffset: number } | null {
  // Implementazione semplificata: cerca una linea con lunghezza simile
  const lines = text.split('\n');
  let bestMatch: { textLength: number; startOffset: number; similarity: number } | null = null;
  let currentOffset = 0;
  
  for (const line of lines) {
    const lineLength = line.length;
    const similarity = 1 - Math.abs(lineLength - targetLine.textLength) / Math.max(lineLength, targetLine.textLength);
    
    if (!bestMatch || similarity > bestMatch.similarity) {
      bestMatch = {
        textLength: lineLength,
        startOffset: currentOffset,
        similarity
      };
    }
    
    currentOffset += line.length + 1; // +1 per il newline
  }
  
  return bestMatch && bestMatch.similarity > 0.7 ? bestMatch : null;
}