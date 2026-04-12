import { UserHighlight } from '../types';
import { log } from '../services/logger';

export type TextRangeOffsets = { start: number; end: number; text: string };
export type TextRangeOffsetsWithContext = TextRangeOffsets & { prefix: string; suffix: string };

function isIgnored(node: Node, root: HTMLElement): boolean {
  let curr: Node | null = node;
  while (curr && curr !== root) {
    if (curr.nodeType === Node.ELEMENT_NODE) {
      const el = curr as Element;
      if (el.getAttribute('data-ignore-offset') === 'true') return true;
      const className = el.getAttribute('class') || '';
      if (/\bselect-none\b/.test(className)) return true;
    }
    curr = curr.parentNode;
  }
  return false;
}

export function computeOffsets(container: HTMLElement, range: Range): TextRangeOffsets {
  try {
    const root = container;
    let start = -1;
    let end = -1;
    let extractedText = '';
    let currentOffset = 0;

    const blocks = Array.from(root.childNodes);

    const validBlocks = blocks.filter(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        return (node.textContent || '').trim().length > 0;
      }
      return true;
    });

    let isFirst = true;

    for (const block of validBlocks) {
      if (isIgnored(block, root)) continue;

      if (!isFirst) {
        if (start !== -1 && end === -1) {
          extractedText += '\n';
        }
        currentOffset += 1;
      }
      isFirst = false;

      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => isIgnored(node, root) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
      });

      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const text = node.data;
        const len = text.length;

        if (range.intersectsNode(node)) {
          let nodeStart = 0;
          let nodeEnd = len;

          if (range.startContainer === node) {
            nodeStart = range.startOffset;
          }

          if (range.endContainer === node) {
            nodeEnd = range.endOffset;
          }

          const chunk = text.slice(nodeStart, nodeEnd);
          
          if (start === -1) {
            start = currentOffset + nodeStart;
          }
          
          // Always update end if we are in the range
          end = currentOffset + nodeEnd;
          
          extractedText += chunk;
        }

        currentOffset += len;
      }
    }

    return { start: start === -1 ? 0 : start, end: end === -1 ? 0 : end, text: extractedText };
  } catch (err) {
    log.error('Error computing text offsets', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    });
    return { start: 0, end: 0, text: '' };
  }
}

export function computeOffsetsWithContext(container: HTMLElement, range: Range, contextLen = 32): TextRangeOffsetsWithContext {
  try {
    const root = container;
    let start = -1;
    let end = -1;
    let extractedText = '';
    let currentOffset = 0;
    let prefix = '';
    let suffix = '';

    const pushPrefix = (s: string) => {
      if (!s) return;
      prefix = (prefix + s);
      if (prefix.length > contextLen) prefix = prefix.slice(prefix.length - contextLen);
    };
    const pushSuffix = (s: string) => {
      if (!s) return;
      if (suffix.length >= contextLen) return;
      suffix += s.slice(0, contextLen - suffix.length);
    };

    const blocks = Array.from(root.childNodes);

    const validBlocks = blocks.filter(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        return (node.textContent || '').trim().length > 0;
      }
      return true;
    });

    let isFirst = true;
    let started = false;
    let ended = false;

    for (const block of validBlocks) {
      if (isIgnored(block, root)) continue;

      if (!isFirst) {
        if (!started) pushPrefix('\n');
        if (started && !ended) extractedText += '\n';
        if (ended) pushSuffix('\n');
        currentOffset += 1;
      }
      isFirst = false;

      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => isIgnored(node, root) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
      });

      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const text = node.data;
        const len = text.length;

        if (!range.intersectsNode(node)) {
          if (!started) pushPrefix(text);
          if (ended) pushSuffix(text);
          currentOffset += len;
          continue;
        }

        let nodeStart = 0;
        let nodeEnd = len;
        if (range.startContainer === node) nodeStart = range.startOffset;
        if (range.endContainer === node) nodeEnd = range.endOffset;

        if (!started) {
          pushPrefix(text.slice(0, nodeStart));
          start = currentOffset + nodeStart;
          started = true;
        }

        const chunk = text.slice(nodeStart, nodeEnd);
        if (started && !ended) {
          extractedText += chunk;
          end = currentOffset + nodeEnd;
        }

        if (!ended && range.endContainer === node) {
          ended = true;
          pushSuffix(text.slice(nodeEnd));
        }

        currentOffset += len;
      }
    }

    return { start: start === -1 ? 0 : start, end: end === -1 ? 0 : end, text: extractedText, prefix, suffix };
  } catch (err) {
    log.error('Error computing text offsets with context', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    });
    return { start: 0, end: 0, text: '', prefix: '', suffix: '' };
  }
}

export function normalizeHighlights(highlights: UserHighlight[]): UserHighlight[] {
  const valid = highlights.filter(h => Number.isFinite(h.start) && Number.isFinite(h.end) && h.end > h.start);
  return valid.sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * Espande gli offset di selezione per includere parole intere se la selezione cade all'interno di una parola.
 * Questo aiuta a prevenire problemi di reflow dovuti alla rottura delle legature e migliora l'UX.
 * Versione conservativa per minimizzare lo spostamento del testo.
 */
export function expandToWordBoundaries(text: string, start: number, end: number): { start: number; end: number; text: string } {
  if (!text) return { start, end, text: '' };
  
  const len = text.length;
  let newStart = Math.max(0, Math.min(start, len));
  let newEnd = Math.max(0, Math.min(end, len));

  // Helper per verificare se un carattere è parte di una parola
  // Includiamo lettere, numeri, e alcuni segni comuni nelle parole (come accenti, apostrofi interni)
  const isWordChar = (char: string) => /[\p{L}\p{N}_'\-]/u.test(char);
  
  // Controlla se la selezione è troppo grande per l'espansione (previene espansioni eccessive)
  const selectionLength = newEnd - newStart;
  if (selectionLength > 200) {
    return { start: newStart, end: newEnd, text: text.slice(newStart, newEnd) };
  }

  // Espandi start all'indietro solo se siamo chiaramente dentro una parola
  if (newStart > 0 && newStart < len && isWordChar(text[newStart]) && isWordChar(text[newStart - 1])) {
    let expandStart = newStart;
    while (expandStart > 0 && isWordChar(text[expandStart - 1])) {
      expandStart--;
    }
    
    // Limita l'espansione per prevenire cambiamenti troppo grandi
    const maxExpansion = Math.min(10, selectionLength * 2);
    newStart = Math.max(expandStart, newStart - maxExpansion);
  }

  // Espandi end in avanti solo se siamo chiaramente dentro una parola
  if (newEnd > 0 && newEnd < len && isWordChar(text[newEnd - 1]) && isWordChar(text[newEnd])) {
    let expandEnd = newEnd;
    while (expandEnd < len && isWordChar(text[expandEnd])) {
      expandEnd++;
    }
    
    // Limita l'espansione per prevenire cambiamenti troppo grandi
    const maxExpansion = Math.min(10, selectionLength * 2);
    newEnd = Math.min(expandEnd, newEnd + maxExpansion);
  }

  // Se l'espansione ha senso (non ha stravolto tutto o non è vuota)
  if (newEnd > newStart) {
    return {
      start: newStart,
      end: newEnd,
      text: text.slice(newStart, newEnd)
    };
  }

  return { start, end, text: text.slice(start, end) };
}
