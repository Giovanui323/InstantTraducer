import { UserHighlight } from '../types';

export type TextRangeOffsets = { start: number; end: number; text: string };

export function computeOffsets(container: HTMLElement, range: Range): TextRangeOffsets {
  const selectedText = range.toString();
  if (!selectedText) return { start: 0, end: 0, text: '' };

  try {
    const startRange = document.createRange();
    startRange.selectNodeContents(container);
    startRange.setEnd(range.startContainer, range.startOffset);
    const start = startRange.toString().length;

    const endRange = document.createRange();
    endRange.selectNodeContents(container);
    endRange.setEnd(range.endContainer, range.endOffset);
    const end = endRange.toString().length;

    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      return { start: 0, end: 0, text: selectedText };
    }

    return { start, end, text: selectedText };
  } catch {
    return { start: 0, end: 0, text: selectedText };
  }
}

export function normalizeHighlights(highlights: UserHighlight[]): UserHighlight[] {
  const valid = highlights.filter(h => Number.isFinite(h.start) && Number.isFinite(h.end) && h.end > h.start);
  return valid.sort((a, b) => a.start - b.start || a.end - b.end);
}
