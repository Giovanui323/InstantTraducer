import { useCallback, useRef } from 'react';
import { ReadingProgress } from '../../types';
import { log } from '../../services/logger';

export interface SaveBlockingManagerProps {
  setIsSaving?: (v: boolean) => void;
  showToast?: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
  cancelPendingSavesRef: React.MutableRefObject<(fileId: string) => void>;
  currentProjectFileIdRef: React.MutableRefObject<string | null>;
  setCurrentProjectFileId: (id: string | null) => void;
}

export interface SaveBlockingManagerResult {
  blockSave: (fileId: string, durationMs?: number, reason?: string) => void;
  unblockSave: (fileId: string) => void;
  isBlocked: (fileId: string) => boolean;
  registerRename: (oldId: string, newId: string) => void;
  registerNameChange: (fileId: string, newName: string, setRecentBooks: React.Dispatch<React.SetStateAction<Record<string, ReadingProgress>>>, recentBooksRef: React.MutableRefObject<Record<string, ReadingProgress>>) => void;
  blacklistedIdsRef: React.MutableRefObject<Set<string>>;
  transitioningIdsRef: React.MutableRefObject<Set<string>>;
  renamedIdsRef: React.MutableRefObject<Map<string, string>>;
  blockSaveTimeoutsRef: React.MutableRefObject<Record<string, NodeJS.Timeout>>;
}

export const useSaveBlockingManager = ({
  setIsSaving,
  showToast,
  cancelPendingSavesRef,
  currentProjectFileIdRef,
  setCurrentProjectFileId
}: SaveBlockingManagerProps): SaveBlockingManagerResult => {
  const blacklistedIdsRef = useRef<Set<string>>(new Set());
  const transitioningIdsRef = useRef<Set<string>>(new Set());
  const renamedIdsRef = useRef<Map<string, string>>(new Map());
  const blockSaveTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});

  const blockSave = useCallback((fileId: string, durationMs: number = 2000, reason?: string) => {
    // Clear existing timeout if any (restart timer)
    if (blockSaveTimeoutsRef.current[fileId]) {
      clearTimeout(blockSaveTimeoutsRef.current[fileId]);
    }

    blacklistedIdsRef.current.add(fileId);
    transitioningIdsRef.current.add(fileId);
    cancelPendingSavesRef.current(fileId);

    // Notify backend to block saves for this ID
    window.electronAPI?.blockSave(fileId).catch(e => log.error("Failed to block save on backend", e));

    const reasonMsg = reason ? ` (Reason: ${reason})` : '';
    log.step(`Save temporaneamente bloccato: ${fileId} (durata: ${durationMs}ms)${reasonMsg}`);
    // Only show toast if duration is significant (> 2s) to avoid UI spam during quick switches
    if (durationMs > 2000) {
      showToast?.(`Salvataggi bloccati temporaneamente (${Math.ceil(durationMs/1000)}s)`, 'warning');
    }

    // Auto-unblock after duration to prevent permanent blocking
    const timeoutId = setTimeout(() => {
      let changed = false;
      if (transitioningIdsRef.current.has(fileId)) {
        transitioningIdsRef.current.delete(fileId);
        changed = true;
      }
      if (blacklistedIdsRef.current.has(fileId)) {
        blacklistedIdsRef.current.delete(fileId);
        changed = true;
      }

      delete blockSaveTimeoutsRef.current[fileId]; // Cleanup ref

      if (changed) {
        log.step(`Sblocco automatico dopo timeout: ${fileId}`);
        // CRITICAL FIX: Ensure backend is also unblocked
        window.electronAPI?.unblockSave(fileId).catch(e => log.error("Failed to auto-unblock save on backend", e));
      }
    }, durationMs);

    blockSaveTimeoutsRef.current[fileId] = timeoutId;
  }, [cancelPendingSavesRef, showToast]);

  const unblockSave = useCallback((fileId: string) => {
    // Clear pending auto-unblock timeout
    if (blockSaveTimeoutsRef.current[fileId]) {
      clearTimeout(blockSaveTimeoutsRef.current[fileId]);
      delete blockSaveTimeoutsRef.current[fileId];
    }

    if (blacklistedIdsRef.current.has(fileId) || transitioningIdsRef.current.has(fileId)) {
      blacklistedIdsRef.current.delete(fileId);
      transitioningIdsRef.current.delete(fileId);

      // Notify backend to unblock saves for this ID
      window.electronAPI?.unblockSave(fileId).catch(e => log.error("Failed to unblock save on backend", e));

      log.step(`Save unblocked for ID: ${fileId}`);
    }
  }, []);

  const isBlocked = useCallback((fileId: string) => {
    return blacklistedIdsRef.current.has(fileId) || transitioningIdsRef.current.has(fileId);
  }, []);

  const registerRename = useCallback((oldId: string, newId: string) => {
    renamedIdsRef.current.set(oldId, newId);
    log.info(`Registered ID redirect: ${oldId} -> ${newId}`);

    // CRITICAL FIX: Update active session ID immediately to prevent blocked saves
    if (currentProjectFileIdRef.current === oldId) {
      log.step(`Updating active session ID due to rename: ${oldId} -> ${newId}`);
      setCurrentProjectFileId(newId);
    }

    // Auto-clear after 60 seconds (enough for any pending saves to flush/redirect)
    setTimeout(() => {
      if (renamedIdsRef.current.get(oldId) === newId) {
        renamedIdsRef.current.delete(oldId);
      }
    }, 60000);
  }, [setCurrentProjectFileId]);

  const registerNameChange = useCallback((fileId: string, newName: string, setRecentBooks: React.Dispatch<React.SetStateAction<Record<string, ReadingProgress>>>, recentBooksRef: React.MutableRefObject<Record<string, ReadingProgress>>) => {
    if (!fileId || !newName) return;

    // Update Local Cache
    const book = recentBooksRef.current[fileId];
    if (book) {
      const oldName = book.fileName;
      log.info(`Registering name change for ${fileId}: '${oldName}' -> '${newName}'`);

      // 1. Update Ref
      const updated = { ...book, fileName: newName };
      recentBooksRef.current = { ...recentBooksRef.current, [fileId]: updated };

      // 2. Update React State
      setRecentBooks((prev: Record<string, ReadingProgress>) => ({ ...prev, [fileId]: updated }));
    } else {
      // Recovery: If book not in memory but we are renaming it (rare), just update cache
      log.warning(`Registering name change for unloaded book ${fileId}: -> '${newName}'`);
    }
  }, []);

  return {
    blockSave,
    unblockSave,
    isBlocked,
    registerRename,
    registerNameChange,
    blacklistedIdsRef,
    transitioningIdsRef,
    renamedIdsRef,
    blockSaveTimeoutsRef
  };
};
