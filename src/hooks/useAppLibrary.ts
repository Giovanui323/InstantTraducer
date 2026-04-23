import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ReadingProgress, PDFMetadata } from '../types';
import { log } from '../services/logger';
import { isUuidV4FileId } from '../utils/idUtils';
import * as usageTracker from '../services/usageTracker';
import { useSaveQueueManager } from './saveQueue/SaveQueueManager';
import { useGroupManager } from './library/GroupManager';
import { useSaveBlockingManager } from './library/SaveBlockingManager';

export const useAppLibrary = (
  metadata: PDFMetadata | null,
  defaultLang: string,
  showConfirm?: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'info' | 'alert') => void,
  setIsSaving?: (v: boolean) => void,
  showToast?: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void
) => {
  const [recentBooks, setRecentBooks] = useState<Record<string, ReadingProgress>>({});
  const [currentProjectFileId, _setCurrentProjectFileId] = useState<string | null>(null);
  const currentProjectFileIdRef = useRef<string | null>(null);
  const recentBooksRef = useRef<Record<string, ReadingProgress>>(recentBooks);
  const processingSaveIdsRef = useRef<Set<string>>(new Set());
  const stableIdNameMismatchLoggedRef = useRef<Set<string>>(new Set());
  const hasInitialized = useRef(false);
  const cancelPendingSavesRef = useRef<(fileId: string) => void>(() => {});

  // Keep ref in sync
  useEffect(() => {
    recentBooksRef.current = recentBooks;
  }, [recentBooks]);

  // Initialize extracted hooks
  const saveBlockingManager = useSaveBlockingManager({
    setIsSaving,
    showToast,
    cancelPendingSavesRef,
    currentProjectFileIdRef,
    setCurrentProjectFileId: _setCurrentProjectFileId
  });

  const saveQueueManager = useSaveQueueManager({
    setIsSaving,
    showToast,
    recentBooksRef,
    setRecentBooks,
    blacklistedIdsRef: saveBlockingManager.blacklistedIdsRef,
    transitioningIdsRef: saveBlockingManager.transitioningIdsRef,
    processingSaveIdsRef,
    renamedIdsRef: saveBlockingManager.renamedIdsRef,
    stableIdNameMismatchLoggedRef,
    blockSave: saveBlockingManager.blockSave,
    currentProjectFileIdRef
  });

  // Extract updateLibrary from saveQueueManager BEFORE passing to groupManager
  const updateLibraryFromQueue = saveQueueManager.updateLibrary;

  const groupManager = useGroupManager({
    showConfirm,
    recentBooksRef,
    updateLibrary: updateLibraryFromQueue
  });

  // Extract functions from hooks
  const {
    processSaveQueue,
    updateLibrary,
    flushSaves,
    cancelPendingSaves,
    saveQueueRef
  } = saveQueueManager;

  // Wire up cancelPendingSavesRef to break the circular dependency
  // SaveBlockingManager needs cancelPendingSaves, but it comes from SaveQueueManager
  cancelPendingSavesRef.current = cancelPendingSaves;

  const {
    availableGroups,
    selectedGroupFilters,
    loadGroups,
    handleCreateGroup,
    handleDeleteGroup,
    handleToggleGroupFilter,
    handleAssignGroup
  } = groupManager;

  const {
    blockSave,
    unblockSave,
    isBlocked,
    registerRename,
    registerNameChange: rawRegisterNameChange
  } = saveBlockingManager;

  // Wrap registerNameChange to pass setRecentBooks and recentBooksRef
  const registerNameChange = useCallback((fileId: string, newName: string) => {
    rawRegisterNameChange(fileId, newName, setRecentBooks, recentBooksRef);
  }, [rawRegisterNameChange, setRecentBooks, recentBooksRef]);

  const setCurrentProjectFileId = useCallback((id: string | null) => {
    const oldId = currentProjectFileIdRef.current;
    if (oldId !== id) {
      log.info(`[Library] Update active project ID: ${oldId} -> ${id}`);
      // Block saves for the old project during transition
      if (oldId) {
        blockSave(oldId, 2000);
      }
    }
    _setCurrentProjectFileId(id);
    currentProjectFileIdRef.current = id;
  }, [blockSave]);

  const refreshLibrary = useCallback(async () => {
    try {
      log.step("Caricamento libreria progetti dal disco...");
      if (!window.electronAPI) {
        log.warning('Caricamento libreria non disponibile: contesto Electron non rilevato.');
        return;
      }
      const books = await window.electronAPI.getTranslations();
      const bookMap: Record<string, ReadingProgress> = {};

      books.forEach((b: Record<string, unknown>) => {
        // Optimize: Reduce heavy data for recent books list
        const {
          translations, translationsMeta,
          annotations,
          verifications, verificationsMeta,
          pageImages, userHighlights, userNotes,
          ...lightBook
        } = b;

        const fileId = b.fileId as string;
        if (fileId) {
          bookMap[fileId] = lightBook as unknown as ReadingProgress;
        }
      });

      setRecentBooks(prev => {
        const next = { ...bookMap };

        // Identify all projects that need preservation (Active + Pending Saves + Processing Saves)
        const projectsToPreserve = new Set<string>();

        // Add active project
        if (currentProjectFileIdRef.current) {
          projectsToPreserve.add(currentProjectFileIdRef.current);
        }

        // Add projects with pending saves
        saveQueueRef.current.forEach(req => projectsToPreserve.add(req.fileId));

        // Add projects currently being processed
        processingSaveIdsRef.current.forEach(id => projectsToPreserve.add(id));

        // Preserve them
        for (const id of projectsToPreserve) {
          if (!prev[id]) continue;

          if (next[id]) {
            // Merge: keep disk data as base, but allow local state to override
            next[id] = { ...next[id], ...prev[id] };
          } else {
            // Preserve memory-only project
            if (id !== currentProjectFileIdRef.current) {
              log.info(`[Library] Preserving pending project '${id}' (memory-only) during refresh.`);
            } else {
              log.info(`[Library] Preserving active project '${id}' (memory-only) during refresh.`);
            }
            next[id] = prev[id];
          }
        }

        return next;
      });
      log.success(`Libreria caricata (${Object.keys(bookMap).length} progetti).`);

    } catch (e) {
      log.error("Errore caricamento libreria", e);
    }
  }, []);

  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      void refreshLibrary();
      void loadGroups();
    }
  }, [refreshLibrary, loadGroups]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = window.electronAPI as any;
    if (!api?.onLibraryRefresh) return;
    const unsubscribe = api.onLibraryRefresh(() => {
      void refreshLibrary();
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [refreshLibrary]);

  const deleteProject = useCallback(async (fileId: string) => {
    return new Promise<boolean>((resolve) => {
      const proceed = async () => {
        try {
          if (!window.electronAPI) throw new Error('Contesto Electron non rilevato');
          const result = await window.electronAPI.deleteTranslation(fileId);
          if (result.success) {
            blockSave(fileId);

            // Optimistically remove from state immediately
            setRecentBooks(prev => {
              const next = { ...prev };
              delete next[fileId];
              return next;
            });

            if (currentProjectFileIdRef.current === fileId) {
              setCurrentProjectFileId(null);
            }

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
  }, [refreshLibrary, showConfirm, blockSave, setCurrentProjectFileId]);

  const actions = useMemo(() => ({
    setCurrentProjectFileId,
    refreshLibrary,
    createGroup: handleCreateGroup,
    deleteGroup: handleDeleteGroup,
    toggleGroupFilter: handleToggleGroupFilter,
    addBookToGroup: handleAssignGroup,
    removeBookFromGroup: handleAssignGroup, // Same logic toggles
    updateLibrary,
    cancelPendingSaves,
    blockSave,
    unblockSave,
    isBlocked,
    flushSaves,
    deleteProject,
    registerRename,
    registerNameChange
  }), [
    setCurrentProjectFileId,
    refreshLibrary,
    handleCreateGroup,
    handleDeleteGroup,
    handleToggleGroupFilter,
    handleAssignGroup,
    updateLibrary,
    cancelPendingSaves,
    blockSave,
    unblockSave,
    isBlocked,
    flushSaves,
    deleteProject,
    registerRename,
    registerNameChange
  ]);

  return useMemo(() => ({
    ...actions,
    recentBooks,
    setRecentBooks,
    availableGroups,
    selectedGroupFilters,
    currentProjectFileId,
  }), [
    actions,
    recentBooks,
    setRecentBooks,
    availableGroups,
    selectedGroupFilters,
    currentProjectFileId
  ]);
};
