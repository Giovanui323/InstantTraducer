import { useState, useEffect, useCallback, useRef } from 'react';
import { ReadingProgress, PDFMetadata } from '../types';
import { log } from '../services/logger';
import { computeFileId, projectFileIdFromName } from '../utils/fileUtils';

export const useAppLibrary = (
  metadata: PDFMetadata | null, 
  defaultLang: string, 
  showConfirm?: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'info' | 'alert') => void,
  setIsSaving?: (v: boolean) => void
) => {
  const [recentBooks, setRecentBooks] = useState<Record<string, ReadingProgress>>({});
  const [availableGroups, setAvailableGroups] = useState<string[]>([]);
  const [selectedGroupFilters, setSelectedGroupFilters] = useState<string[]>([]);
  const [currentProjectFileId, setCurrentProjectFileId] = useState<string | null>(null);
  
  const fileIdCacheRef = useRef<Record<string, string>>({});
  const saveTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});
  const recentBooksRef = useRef<Record<string, ReadingProgress>>(recentBooks);

  // Keep ref in sync
  useEffect(() => {
    recentBooksRef.current = recentBooks;
  }, [recentBooks]);

  const refreshLibrary = useCallback(async () => {
    try {
      log.step("Caricamento libreria progetti dal disco...");
      if (!window.electronAPI) {
        log.warning('Caricamento libreria non disponibile: contesto Electron non rilevato.');
        return;
      }
      const books = await window.electronAPI.getTranslations();
      const bookMap: Record<string, ReadingProgress> = {};
      const foundGroups = new Set<string>();

      books.forEach((b: any) => {
        // Ottimizzazione: Riduciamo i dati pesanti per la lista dei recenti
        const { 
          translations, translationsMeta, 
          annotations, 
          verifications, verificationsMeta,
          pageImages, userHighlights, userNotes,
          ...lightBook 
        } = b;
        
        bookMap[b.fileId] = lightBook as ReadingProgress;
        
        if (b.fileName && b.fileId) {
          fileIdCacheRef.current[String(b.fileName)] = String(b.fileId);
        }
        if (Array.isArray(b.groups)) {
          b.groups.forEach((g: string) => {
            if (g && typeof g === 'string') foundGroups.add(g.trim());
          });
        }
      });
      setRecentBooks(bookMap);
      log.success(`Libreria caricata (${Object.keys(bookMap).length} progetti).`);

      // Sincronizzazione automatica gruppi
      if (foundGroups.size > 0) {
        setAvailableGroups(prev => {
          const merged = new Set([...prev, ...foundGroups]);
          const sorted = Array.from(merged).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
          if (sorted.length !== prev.length || sorted.some((g, i) => g !== prev[i])) {
            log.step(`Sincronizzazione gruppi: trovati ${foundGroups.size} gruppi nei progetti.`);
            window.electronAPI?.saveGroups(sorted).catch(console.error);
            return sorted;
          }
          return prev;
        });
      }
    } catch (e) {
      log.error("Errore caricamento libreria", e);
    }
  }, []);

  const loadGroups = useCallback(async () => {
    try {
      const groups = await window.electronAPI?.loadGroups();
      if (groups && Array.isArray(groups)) {
        // Normalizza e ordina
        const sorted = [...groups].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        setAvailableGroups(sorted);
      }
    } catch (e) {
      console.error('Failed to load groups', e);
    }
  }, []);

  useEffect(() => {
    void refreshLibrary();
    void loadGroups();
  }, [refreshLibrary, loadGroups]);

  const handleCreateGroup = useCallback((group: string) => {
    const trimmed = group.trim();
    if (!trimmed) return;

    setAvailableGroups(prev => {
      const exists = prev.some(g => g.toLowerCase() === trimmed.toLowerCase());
      if (exists) return prev;

      const newGroups = [...prev, trimmed].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      window.electronAPI?.saveGroups(newGroups).catch(console.error);
      return newGroups;
    });
  }, []);

  const handleDeleteGroup = useCallback((group: string) => {
    if (showConfirm) {
      showConfirm(
        "Elimina Gruppo",
        `Sei sicuro di voler eliminare il gruppo "${group}" dalla lista globale? (Resterà comunque assegnato ai libri esistenti)`,
        () => {
          setAvailableGroups(prev => {
            const next = prev.filter(g => g !== group);
            window.electronAPI?.saveGroups(next).catch(console.error);
            return next;
          });
          setSelectedGroupFilters(prev => prev.filter(g => g !== group));
        },
        'danger'
      );
    }
  }, [showConfirm]);

  const handleToggleGroupFilter = useCallback((group: string) => {
    setSelectedGroupFilters(prev =>
      prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]
    );
  }, []);

  const updateLibrary = useCallback(async (fileName: string, data: Partial<ReadingProgress>) => {
    // CRITICAL FIX: Ensure we have a safeId, prioritizing data.fileId passed from caller
    const cached = fileIdCacheRef.current[fileName];
    const safeId = data.fileId || cached || computeFileId(fileName, (data as any)?.originalFilePath);
    
    if (fileName) {
      fileIdCacheRef.current[fileName] = safeId;
    }

    // Aggiornamento immediato dello stato locale per reattività UI
    setRecentBooks(prev => {
      const existing = prev[safeId] || { fileName, lastPage: 1, timestamp: Date.now(), fileId: safeId };
      
      // Deep merge fields that are page-indexed maps
      const mergedData = { ...data };
      const deepFields = [
        'translations', 'translationsMeta', 'annotations', 
        'verifications', 'verificationsMeta', 'pageDims', 
        'userHighlights', 'userNotes'
      ] as const;

      for (const field of deepFields) {
        if (data[field] && typeof data[field] === 'object') {
          mergedData[field] = {
            ...(existing[field] || {}),
            ...data[field]
          } as any;
        }
      }

      const updated = { ...existing, ...mergedData, timestamp: Date.now(), fileName, fileId: safeId };
      return { ...prev, [safeId]: updated };
    });

    // Debouncing del salvataggio su disco
    if (saveTimeoutRef.current[safeId]) {
      clearTimeout(saveTimeoutRef.current[safeId]);
    }

    setIsSaving?.(true);

    saveTimeoutRef.current[safeId] = setTimeout(async () => {
      try {
        if (!window.electronAPI) throw new Error('Contesto Electron non rilevato');
        
        const startedAt = performance.now();
        const latestFullData = recentBooksRef.current[safeId];

        if (latestFullData) {
          try {
            const res = await window.electronAPI.saveTranslation({ fileId: safeId, data: latestFullData });
            if (res?.success) {
              log.step(`Salvataggio ritardato riuscito (${safeId})`, { elapsedMs: Math.round(performance.now() - startedAt) });
            }
          } catch (e: any) {
            log.error(`Salvataggio ritardato fallito (${safeId})`, e);
          } finally {
            // Se non ci sono altri timeout attivi per altri file, spegniamo la lucina
            delete saveTimeoutRef.current[safeId];
            const hasOtherTimeouts = Object.keys(saveTimeoutRef.current).length > 0;
            if (!hasOtherTimeouts) setIsSaving?.(false);
          }
        } else {
          delete saveTimeoutRef.current[safeId];
          setIsSaving?.(false);
        }
      } catch (e) { 
        console.error(e);
        setIsSaving?.(false);
      }
    }, 2000); // 2 secondi di debounce

    return safeId;
  }, [setIsSaving]);

  const handleAssignGroup = useCallback((fileId: string, group: string) => {
    // CRITICAL FIX: Use ref to avoid stale closure state
    const book = recentBooksRef.current[fileId];
    if (!book) return;
    
    const currentGroups = book.groups || [];
    const newGroups = currentGroups.includes(group)
      ? currentGroups.filter(g => g !== group)
      : [...currentGroups, group];

    // CRITICAL FIX: Pass explicit fileId to avoid collisions
    void updateLibrary(book.fileName, { fileId, groups: newGroups });
  }, [updateLibrary]);

  const deleteProject = useCallback(async (fileId: string) => {
    return new Promise<boolean>((resolve) => {
      const proceed = async () => {
        try {
          if (!window.electronAPI) throw new Error('Contesto Electron non rilevato');
          const result = await window.electronAPI.deleteTranslation(fileId);
          if (result.success) {
            log.success("Progetto eliminato.");
            void refreshLibrary();
            resolve(true);
            return true;
          } else {
            log.error("Errore eliminazione:", result.error);
            resolve(false);
            return false;
          }
        } catch (e) {
          log.error("Errore eliminazione", e);
          resolve(false);
          return false;
        }
      };

      if (showConfirm) {
        showConfirm(
          "Sposta nel Cestino",
          "Sei sicuro di voler spostare questo progetto nel cestino? Potrai ripristinarlo dalle impostazioni entro 30 giorni.",
          proceed,
          'danger'
        );
      } else if (confirm('Sei sicuro di voler spostare questo progetto nel cestino? Potrai ripristinarlo dalle impostazioni entro 30 giorni.')) {
        void proceed();
      } else {
        resolve(false);
      }
    });
  }, [refreshLibrary, showConfirm]);

  return {
    recentBooks,
    setRecentBooks,
    availableGroups,
    selectedGroupFilters,
    currentProjectFileId,
    setCurrentProjectFileId,
    refreshLibrary,
    createGroup: handleCreateGroup,
    deleteGroup: handleDeleteGroup,
    toggleGroupFilter: handleToggleGroupFilter,
    addBookToGroup: handleAssignGroup,
    removeBookFromGroup: handleAssignGroup, // Same logic toggles
    updateLibrary,
    deleteProject,
    fileIdCacheRef
  };
};
