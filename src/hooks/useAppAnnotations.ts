import { useState, useCallback, useEffect } from 'react';
import { UserHighlight, UserNote, PDFMetadata } from '../types';
import { PdfRect } from '../utils/pdfCoordinates';

export const useAppAnnotations = (metadata: PDFMetadata | null, fileId: string | null, updateLibrary: (fileId: string, data: any) => void) => {
  const [userHighlights, setUserHighlights] = useState<Record<number, UserHighlight[]>>({});
  const [userNotes, setUserNotes] = useState<Record<number, UserNote[]>>({});

  // Sync highlights to library whenever they change
  useEffect(() => {
    if (fileId) {
      updateLibrary(fileId, { userHighlights, fileId });
    }
  }, [userHighlights, fileId, updateLibrary]);

  // Sync notes to library whenever they change
  useEffect(() => {
    if (fileId) {
      updateLibrary(fileId, { userNotes, fileId });
    }
  }, [userNotes, fileId, updateLibrary]);

  const addUserHighlight = useCallback((page: number, start: number, end: number, text: string, color?: string, quote?: { exact: string; prefix: string; suffix: string }, pdfRect?: PdfRect) => {
    setUserHighlights(prev => {
      const existing = prev[page] || [];

      // Deduplication: check for overlapping highlights (≥80% intersection)
      const newLen = end - start;
      for (const h of existing) {
        const overlapStart = Math.max(h.start, start);
        const overlapEnd = Math.min(h.end, end);
        const overlapLen = Math.max(0, overlapEnd - overlapStart);
        const existingLen = h.end - h.start;
        const overlapRatio = Math.max(overlapLen / newLen, overlapLen / existingLen);

        if (overlapRatio >= 0.8) {
          if ((h.color || 'yellow') === (color || 'yellow')) {
            // Same color, same range → ignore duplicate
            return prev;
          } else {
            // Different color → update existing highlight's color (merge)
            const nextPage = existing.map(item =>
              item.id === h.id ? { ...item, color } : item
            );
            return { ...prev, [page]: nextPage };
          }
        }
      }

      // No significant overlap found → create new highlight
      const makeId = () => (globalThis.crypto && 'randomUUID' in globalThis.crypto ? (globalThis.crypto as any).randomUUID() : Math.random().toString(36).slice(2));
      const id = makeId();
      const item: UserHighlight = { id, page, start, end, text, quoteExact: quote?.exact, quotePrefix: quote?.prefix, quoteSuffix: quote?.suffix, color, createdAt: Date.now(), pdfRect };
      const nextPage = [...existing, item];
      return { ...prev, [page]: nextPage };
    });
  }, []);

  const removeUserHighlight = useCallback((page: number, id: string) => {
    setUserHighlights(prev => {
      const nextPage = (prev[page] || []).filter(h => h.id !== id);
      return { ...prev, [page]: nextPage };
    });
  }, []);

  const addUserNote = useCallback((page: number, start: number, end: number, text: string, content: string) => {
    const makeId = () => (globalThis.crypto && 'randomUUID' in globalThis.crypto ? (globalThis.crypto as any).randomUUID() : Math.random().toString(36).slice(2));
    const id = makeId();
    const item: UserNote = { id, page, start, end, text, content, createdAt: Date.now() };
    setUserNotes(prev => {
      const nextPage = [...(prev[page] || []), item];
      return { ...prev, [page]: nextPage };
    });
  }, []);

  const updateUserNote = useCallback((page: number, id: string, content: string) => {
    setUserNotes(prev => {
      const nextPage = (prev[page] || []).map(n => n.id === id ? { ...n, content } : n);
      return { ...prev, [page]: nextPage };
    });
  }, []);

  const removeUserNote = useCallback((page: number, id: string) => {
    setUserNotes(prev => {
      const nextPage = (prev[page] || []).filter(n => n.id !== id);
      return { ...prev, [page]: nextPage };
    });
  }, []);

  return {
    userHighlights,
    setUserHighlights,
    userNotes,
    setUserNotes,
    addUserHighlight,
    removeUserHighlight,
    addUserNote,
    updateUserNote,
    removeUserNote
  };
};
