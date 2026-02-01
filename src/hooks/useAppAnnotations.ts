import { useState, useCallback } from 'react';
import { UserHighlight, UserNote, PDFMetadata } from '../types';

export const useAppAnnotations = (metadata: PDFMetadata | null, updateLibrary: (name: string, data: any) => void) => {
  const [userHighlights, setUserHighlights] = useState<Record<number, UserHighlight[]>>({});
  const [userNotes, setUserNotes] = useState<Record<number, UserNote[]>>({});

  const addUserHighlight = useCallback((page: number, start: number, end: number, text: string, color?: string) => {
    const makeId = () => (globalThis.crypto && 'randomUUID' in globalThis.crypto ? (globalThis.crypto as any).randomUUID() : Math.random().toString(36).slice(2));
    const id = makeId();
    const item: UserHighlight = { id, page, start, end, text, color, createdAt: Date.now() };
    
    setUserHighlights(prev => {
      const nextPage = [...(prev[page] || []), item];
      const next = { ...prev, [page]: nextPage };
      // Spostato fuori dal setter per evitare side effects inconsistenti
      setTimeout(() => {
        if (metadata) updateLibrary(metadata.name, { userHighlights: next });
      }, 0);
      return next;
    });
  }, [metadata, updateLibrary]);

  const removeUserHighlight = useCallback((page: number, id: string) => {
    setUserHighlights(prev => {
      const nextPage = (prev[page] || []).filter(h => h.id !== id);
      const next = { ...prev, [page]: nextPage };
      setTimeout(() => {
        if (metadata) updateLibrary(metadata.name, { userHighlights: next });
      }, 0);
      return next;
    });
  }, [metadata, updateLibrary]);

  const addUserNote = useCallback((page: number, start: number, end: number, text: string, content: string) => {
    const makeId = () => (globalThis.crypto && 'randomUUID' in globalThis.crypto ? (globalThis.crypto as any).randomUUID() : Math.random().toString(36).slice(2));
    const id = makeId();
    const item: UserNote = { id, page, start, end, text, content, createdAt: Date.now() };
    setUserNotes(prev => {
      const nextPage = [...(prev[page] || []), item];
      const next = { ...prev, [page]: nextPage };
      setTimeout(() => {
        if (metadata) updateLibrary(metadata.name, { userNotes: next });
      }, 0);
      return next;
    });
  }, [metadata, updateLibrary]);

  const updateUserNote = useCallback((page: number, id: string, content: string) => {
    setUserNotes(prev => {
      const nextPage = (prev[page] || []).map(n => n.id === id ? { ...n, content } : n);
      const next = { ...prev, [page]: nextPage };
      setTimeout(() => {
        if (metadata) updateLibrary(metadata.name, { userNotes: next });
      }, 0);
      return next;
    });
  }, [metadata, updateLibrary]);

  const removeUserNote = useCallback((page: number, id: string) => {
    setUserNotes(prev => {
      const nextPage = (prev[page] || []).filter(n => n.id !== id);
      const next = { ...prev, [page]: nextPage };
      setTimeout(() => {
        if (metadata) updateLibrary(metadata.name, { userNotes: next });
      }, 0);
      return next;
    });
  }, [metadata, updateLibrary]);

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
