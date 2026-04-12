import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ReadingProgress, PDFMetadata, Group } from '../types';
import { log } from '../services/logger';
import equal from 'fast-deep-equal';
import { isUuidV4FileId } from '../utils/idUtils';
import { buildProjectSavePayload, mergeSaveDelta } from '../utils/saveQueueUtils';
import * as usageTracker from '../services/usageTracker';
import { useSaveQueueManager, type SavePriority } from './saveQueue/SaveQueueManager';
import { useGroupManager } from './library/GroupManager';
import { useSaveBlockingManager } from './library/SaveBlockingManager';

const MAX_QUEUE_SIZE = 50;
const MAX_REQUEST_AGE = 5 * 60 * 1000; // 5 minutes

export const useAppLibrary = (
  metadata: PDFMetadata | null, 
  defaultLang: string, 
  showConfirm?: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'info' | 'alert') => void,
  setIsSaving?: (v: boolean) => void,
  showToast?: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void
) => {
  const [recentBooks, setRecentBooks] = useState<Record<string, ReadingProgress>>({});
  const [availableGroups, setAvailableGroups] = useState<Group[]>([]);
  const [selectedGroupFilters, setSelectedGroupFilters] = useState<string[]>([]); // Array of IDs
  const [currentProjectFileId, _setCurrentProjectFileId] = useState<string | null>(null);
  const currentProjectFileIdRef = useRef<string | null>(null);


  const saveTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});
  const blockSaveTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
  const saveQueueRef = useRef<SaveRequest[]>([]);
  const isProcessingQueueRef = useRef<boolean>(false);
  const blacklistedIdsRef = useRef<Set<string>>(new Set());
  const transitioningIdsRef = useRef<Set<string>>(new Set());
  const processingSaveIdsRef = useRef<Set<string>>(new Set()); // Tracks IDs currently being processed in save queue
  const renamedIdsRef = useRef<Map<string, string>>(new Map()); // OldID -> NewID
  const stableIdNameMismatchLoggedRef = useRef<Set<string>>(new Set());
  const recentBooksRef = useRef<Record<string, ReadingProgress>>(recentBooks);
  const hasInitialized = useRef(false);
  const blockedErrorCountRef = useRef(0);

  // Keep ref in sync
  useEffect(() => {
    recentBooksRef.current = recentBooks;
  }, [recentBooks]);

  // Use extracted hooks - TEMPORARY: Keep old definitions for compatibility during transition
  // Will be removed after full migration
  const saveBlockingManager = useSaveBlockingManager({
    setIsSaving,
    showToast,
    cancelPendingSaves: () => {}, // Placeholder - will use old implementation for now
    currentProjectFileIdRef,
    setCurrentProjectFileId: _setCurrentProjectFileId
  });

  const saveQueueManager = useSaveQueueManager({
    setIsSaving,
    showToast,
    recentBooksRef,
    blacklistedIdsRef: saveBlockingManager.blacklistedIdsRef,
    transitioningIdsRef: saveBlockingManager.transitioningIdsRef,
    processingSaveIdsRef,
    renamedIdsRef: saveBlockingManager.renamedIdsRef,
    stableIdNameMismatchLoggedRef,
    blockSave: saveBlockingManager.blockSave,
    currentProjectFileIdRef
  });

  const groupManager = useGroupManager({
    showConfirm
  });

  // Override old function implementations with new ones
  const {
    processSaveQueue,
    updateLibrary,
    flushSaves,
    cancelPendingSaves: newCancelPendingSaves,
    blockedErrorCountRef: newBlockedErrorCountRef
  } = saveQueueManager;

  const {
    loadGroups: newLoadGroups,
    handleCreateGroup: newHandleCreateGroup,
    handleDeleteGroup: newHandleDeleteGroup,
    handleToggleGroupFilter: newHandleToggleGroupFilter,
    handleAssignGroup: newHandleAssignGroup
  } = groupManager;

  const {
    blockSave: newBlockSave,
    unblockSave: newUnblockSave,
    isBlocked: newIsBlocked,
    registerRename: newRegisterRename,
    registerNameChange: newRegisterNameChange
  } = saveBlockingManager;

  const cancelPendingSaves = useCallback((fileId: string) => {
    let wasPending = false;

    if (saveTimeoutRef.current[fileId]) {
      clearTimeout(saveTimeoutRef.current[fileId]);
      delete saveTimeoutRef.current[fileId];
      wasPending = true;
    }

    const originalLength = saveQueueRef.current.length;
    saveQueueRef.current = saveQueueRef.current.filter(req => req.fileId !== fileId);
    if (saveQueueRef.current.length < originalLength) wasPending = true;
      
    if (wasPending) {
      const hasOtherTimeouts = Object.keys(saveTimeoutRef.current).length > 0;
      const hasOtherQueue = saveQueueRef.current.length > 0;
      if (!hasOtherTimeouts && !hasOtherQueue) setIsSaving?.(false);
      
      log.step(`Cancellato salvataggio pendente per ${fileId}`);
    }
  }, [setIsSaving]);

  const blockSave = useCallback((fileId: string, durationMs: number = 2000, reason?: string) => {
    // Clear existing timeout if any (restart timer)
    if (blockSaveTimeoutsRef.current[fileId]) {
      clearTimeout(blockSaveTimeoutsRef.current[fileId]);
    }

    blacklistedIdsRef.current.add(fileId);
    transitioningIdsRef.current.add(fileId);
    cancelPendingSaves(fileId);
    
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
  }, [cancelPendingSaves, showToast]);

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

  const setCurrentProjectFileId = useCallback((id: string | null) => {
    const oldId = currentProjectFileIdRef.current;
    if (oldId !== id) {
        log.info(`[Library] Update active project ID: ${oldId} -> ${id}`);
        // CRITICAL FIX: Block saves for the old project during transition to prevent data contamination
        if (oldId) {
             // Block for 2 seconds to allow UI to unmount and pending requests to be dropped
             newBlockSave(oldId, 2000);
        }
    }
    _setCurrentProjectFileId(id);
    currentProjectFileIdRef.current = id;
  }, [newBlockSave]);

  const loadGroups = useCallback(async () => {
    try {
      const groups = await window.electronAPI?.loadGroups();
      if (groups && Array.isArray(groups)) {
        let normalizedGroups: Group[] = [];
        let hasChanges = false;

        // Migration logic: Convert strings to Objects
        normalizedGroups = groups.map((g: any) => {
          if (typeof g === 'string') {
            hasChanges = true;
            return { id: crypto.randomUUID(), name: g };
          }
          if (typeof g === 'object' && g.id && g.name) {
            return g;
          }
          // If invalid object, skip or try to recover?
          // For safety, if it has name but no id
          if (typeof g === 'object' && g.name && !g.id) {
             hasChanges = true;
             return { ...g, id: crypto.randomUUID() };
          }
          return null;
        }).filter(Boolean) as Group[];

        // Sort by name
        normalizedGroups.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        
        setAvailableGroups(normalizedGroups);

        if (hasChanges) {
          log.step("Migrazione gruppi legacy completata: salvataggio nuova struttura.");
          window.electronAPI?.saveGroups(normalizedGroups).catch(e => log.error("Failed to save migrated groups", e));
        }
      }
    } catch (e) {
      log.error('Failed to load groups', e);
    }
  }, []);

  const refreshLibrary = useCallback(async () => {
    try {
      log.step("Caricamento libreria progetti dal disco...");
      if (!window.electronAPI) {
        log.warning('Caricamento libreria non disponibile: contesto Electron non rilevato.');
        return;
      }
      const books = await window.electronAPI.getTranslations();
      const bookMap: Record<string, ReadingProgress> = {};
      
      // Load groups first to have the ID mapping available
      // Note: We can't await loadGroups() here easily because it sets state. 
      // Instead, we should rely on availableGroups state if possible, or reload them.
      // But since refreshLibrary is called in parallel with loadGroups, let's just do book loading here.
      // Ideally, we need the group list to migrate book groups.
      
      // Temporary: we will trust the book's groups for now, and rely on the UI to map Names -> IDs if needed,
      // or migrate them on the fly when saving.
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
      });

      setRecentBooks(prev => {
        const next = { ...bookMap };
        
        // 1. Identify all projects that need preservation (Active + Pending Saves + Processing Saves)
        const projectsToPreserve = new Set<string>();
        
        // Add active project
        if (currentProjectFileIdRef.current) {
            projectsToPreserve.add(currentProjectFileIdRef.current);
        }
        
        // Add projects with pending saves
        saveQueueRef.current.forEach(req => projectsToPreserve.add(req.fileId));

        // Add projects currently being processed (CRITICAL for avoiding race conditions)
        processingSaveIdsRef.current.forEach(id => projectsToPreserve.add(id));

        // 2. Preserve them
        for (const id of projectsToPreserve) {
            if (!prev[id]) continue; // Can't preserve what we don't have

            if (next[id]) {
                // Merge: keep disk data as base, but allow local state to override/augment it
                // This is crucial for things like 'lastPage' or 'translations' being updated in memory
                next[id] = { ...next[id], ...prev[id] };
            } else {
                // Preserve memory-only project (e.g. new upload or background job not yet saved)
                // Only log if it's not the active project (to avoid spam) or if it's important
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
    const api: any = window.electronAPI;
    if (!api?.onLibraryRefresh) return;
    const unsubscribe = api.onLibraryRefresh(() => {
      void refreshLibrary();
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [refreshLibrary]);

  const handleCreateGroup = useCallback((groupName: string) => {
    const trimmed = groupName.trim();
    if (!trimmed) return;

    setAvailableGroups(prev => {
      // Check for duplicate name
      const exists = prev.some(g => g.name.toLowerCase() === trimmed.toLowerCase());
      if (exists) return prev;

      const newGroup: Group = { id: crypto.randomUUID(), name: trimmed };
      const newGroups = [...prev, newGroup].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      
      window.electronAPI?.saveGroups(newGroups).catch(e => log.error("Failed to save groups", e));
      return newGroups;
    });
  }, []);

  const handleDeleteGroup = useCallback((groupId: string) => {
    if (showConfirm) {
      // Find group name for display
      const groupName = availableGroups.find(g => g.id === groupId)?.name || groupId;

      showConfirm(
        "Elimina Gruppo",
        `Sei sicuro di voler eliminare il gruppo "${groupName}" dalla lista globale? (Resterà comunque assegnato ai libri esistenti)`,
        () => {
          setAvailableGroups(prev => {
            const next = prev.filter(g => g.id !== groupId);
            window.electronAPI?.saveGroups(next).catch(e => log.error("Failed to save groups", e));
            return next;
          });
          setSelectedGroupFilters(prev => prev.filter(g => g !== groupId));
        },
        'danger'
      );
    }
  }, [showConfirm, availableGroups]);

  const handleToggleGroupFilter = useCallback((groupId: string) => {
    setSelectedGroupFilters(prev =>
      prev.includes(groupId) ? prev.filter(g => g !== groupId) : [...prev, groupId]
    );
  }, []);

  const processSaveQueue = useCallback(async () => {
    if (isProcessingQueueRef.current || saveQueueRef.current.length === 0) return;
    
    isProcessingQueueRef.current = true;
    const queue = [...saveQueueRef.current];
    saveQueueRef.current = [];
    
    // Group by fileId and take latest for each
    const latestByFileId = new Map<string, SaveRequest>();
    const now = Date.now();

    for (const request of queue) {
      // CRITICAL OPTIMIZATION: Skip blocked/blacklisted files immediately
      // This prevents memory saturation by avoiding populating the map with blocked requests
      if (blacklistedIdsRef.current.has(request.fileId) || transitioningIdsRef.current.has(request.fileId)) {
        continue;
      }

      // CRITICAL FIX: Garbage Collection for stale requests
      if (now - request.timestamp > MAX_REQUEST_AGE) {
         log.warning(`Dropping stale save request for ${request.fileId} (Age: ${Math.round((now - request.timestamp)/1000)}s)`);
         continue;
      }

      const existing = latestByFileId.get(request.fileId);
      if (!existing || request.timestamp > existing.timestamp) {
        latestByFileId.set(request.fileId, request);
      }
    }
    
    const uniqueRequests = Array.from(latestByFileId.values());
    // Reduced log level to avoid spam
    if (uniqueRequests.length > 5) {
      log.info(`Processing save queue: ${uniqueRequests.length} unique requests from ${queue.length} total`);
    }
    
    // CRITICAL FIX: Track processing IDs to prevent library refresh from wiping them
    uniqueRequests.forEach(r => processingSaveIdsRef.current.add(r.fileId));

    try {
      for (const request of uniqueRequests) {
        // Yield to main thread to prevent UI freezing during heavy batch processing
        await new Promise(resolve => setTimeout(resolve, 0));

        // CRITICAL CHECK: Skip if blocked/blacklisted
        if (blacklistedIdsRef.current.has(request.fileId) || transitioningIdsRef.current.has(request.fileId)) {
          log.warning(`Skipping queued save for ID bloccato: ${request.fileId}`);
          continue;
        }

      // CRITICAL FIX: Check for ID Redirection (Rename)
      let effectiveFileId = request.fileId;
      if (renamedIdsRef.current.has(request.fileId)) {
          const newId = renamedIdsRef.current.get(request.fileId)!;
          log.info(`Redirecting queued save: ${request.fileId} -> ${newId}`);
          effectiveFileId = newId;
          // Update request object for future retries/logging
          request.fileId = newId;
          if (request.data && request.data.fileId) {
              request.data.fileId = newId;
          }
      }

      try {
        const startedAt = performance.now();
        const payload = buildProjectSavePayload(request.fileId, request.data, recentBooksRef.current[request.fileId]);
        
        // CRITICAL FIX: Prevent "Dati progetto non validi" error in Electron
        // If the project was unloaded from memory (currentData is undefined) AND
        // the request is a partial update (missing fileName), we must abort.
        if (!payload?.fileName) {
           log.warning(`Skipping save: Missing fileName for ID ${request.fileId} (orphaned partial update)`);
           continue;
        }
        
        const res = await window.electronAPI.saveTranslation({ 
          fileId: effectiveFileId, 
          data: payload
        });
        
        if (res?.success) {
          blockedErrorCountRef.current = 0;
          log.info(`Queued save completed (${effectiveFileId})`, { 
            priority: request.priority,
            elapsedMs: Math.round(performance.now() - startedAt) 
          });
        } else if (res?.error === 'BLOCKED_BY_BACKEND') {
             throw new Error('BLOCKED_BY_BACKEND');
        } else {
           throw new Error(res?.error || 'Unknown save error');
        }
      } catch (e: any) {
        if (e.message === 'BLOCKED_BY_BACKEND') {
            blockedErrorCountRef.current++;
            log.warning(`Queued save paused (Backend Blocked) for ${effectiveFileId}. Retrying... (Attempt ${blockedErrorCountRef.current}/5)`);
            
            if (blockedErrorCountRef.current >= 5) {
                log.error('CRITICAL: Save queue paused due to persistent backend block.');
                if (showToast) showToast('Errore critico salvataggio: Backend bloccato. Riavviare l\'applicazione.', 'error');
                if (setIsSaving) setIsSaving(false);
                isProcessingQueueRef.current = false;
                return;
            }
        } else {
            blockedErrorCountRef.current = 0;
            log.error(`Queued save failed (${effectiveFileId})`, e);
        }
        
        // Retry logic for failed saves
        if (request.attempts < 3) {
          request.attempts++;
          request.timestamp = Date.now();
          saveQueueRef.current.push(request);
        }
      }
    }
    } finally {
      // Cleanup processing IDs
      uniqueRequests.forEach(r => processingSaveIdsRef.current.delete(r.fileId));
      isProcessingQueueRef.current = false;
      
      // Process any new requests that came in during processing
      if (saveQueueRef.current.length > 0) {
        setTimeout(() => processSaveQueue(), 100);
      } else {
        setIsSaving?.(false);
      }
    }
  }, [setIsSaving]);

  const updateLibrary = useCallback(async (fileId: string, data: any, priority: SavePriority = 'BACKGROUND', silent: boolean = false) => {
    // CRITICAL FIX: Enhanced ID resolution to prevent "Ghost Writes" (saving Old Project data to New Project ID)
    let safeId = data?.fileId || fileId;

    // 0. CHECK REDIRECTION (Fix for Issue #2)
    if (safeId && renamedIdsRef.current.has(safeId)) {
        const newId = renamedIdsRef.current.get(safeId)!;
        log.warning(`Redirecting save from old ID ${safeId} to new ID ${newId}`);
        safeId = newId;
        // Also update the data payload to match
        if (data.fileId) data.fileId = newId;
    }

    // 1. Fallback to current session ID (should be rare; callers should always pass fileId)
    if (!safeId && currentProjectFileIdRef.current) {
      safeId = currentProjectFileIdRef.current;
    }

    // 3. Strict Check: If we have an ID, but it doesn't match the active session, 
    // we should still allow it if it's a valid ID (background save).
    // But we must ensure we aren't overwriting with stale data.

    if (!safeId) {
      log.warning(`Skipping save: No stable FileID available.`);
      return "";
    }

    if (!isUuidV4FileId(safeId)) {
      log.warning(`Skipping save for non-UUID project ID: ${safeId}`);
      if (!silent) {
        showToast?.("Salvataggio non possibile: ID progetto non valido (UUID). Rinomina/migra il progetto.", 'error');
      }
      return "";
    }

    const existingBook = recentBooksRef.current[safeId];
    const isStableId = isUuidV4FileId(safeId);
    let effectiveFileName = existingBook?.fileName;
    if (!effectiveFileName && data?.fileName) {
      effectiveFileName = data.fileName;
    }

    if (!effectiveFileName) {
      log.warning(`Skipping save for ${safeId}: Missing fileName.`);
      return "";
    }

    try {
      const usage = usageTracker.getUsageMetrics()?.projects?.[safeId];
      if (usage && typeof usage.cost === 'number') {
        const existingMetrics = (recentBooksRef.current[safeId]?.projectMetrics || {}) as any;
        data = {
          ...data,
          projectMetrics: {
            ...existingMetrics,
            totalCost: usage.cost,
            translatedPages: typeof existingMetrics.translatedPages === 'number' ? existingMetrics.translatedPages : 0,
            verifiedPages: typeof existingMetrics.verifiedPages === 'number' ? existingMetrics.verifiedPages : 0,
            totalCalls: usage.calls,
            lastUpdated: usage.lastUpdated
          }
        };
      }
    } catch {
      // ignore
    }

    if (existingBook && existingBook.fileName && existingBook.fileName !== effectiveFileName) {
      if (isStableId) {
        if (!stableIdNameMismatchLoggedRef.current.has(safeId)) {
          stableIdNameMismatchLoggedRef.current.add(safeId);
          log.info(
            `Nome progetto cambiato per ID stabile ${safeId}: '${effectiveFileName}' -> '${existingBook.fileName}'. Uso il nome più recente.`
          );
        }
        effectiveFileName = existingBook.fileName;
      } else {
        log.error(`[CRITICAL] Collisione identificativo: ${safeId} appartiene a '${existingBook.fileName}'. Salvataggio annullato.`);
        showToast?.("Collisione ID rilevata: salvataggio annullato per sicurezza.", 'error');
        return "";
      }
    }

    if (safeId && blacklistedIdsRef.current.has(safeId)) {
      log.warning(`Blocked save attempt for blacklisted ID: ${safeId}`);
      showToast?.("Salvataggio bloccato: Operazione critica in corso. Riprova tra pochi secondi.", 'error');
      return "";
    }
    
    if (safeId && transitioningIdsRef.current.has(safeId)) {
      log.info(`Tentativo di salvataggio bloccato temporaneamente: ${safeId}`);
      // No toast for transitioning (usually very fast) unless repeated?
      return "";
    }

    // PREVENT REDUNDANT SAVES: Check if content actually changed
    const existingForCheck = recentBooksRef.current[safeId] || { fileName: effectiveFileName, lastPage: 1, timestamp: 0, fileId: safeId };
    
    // Deep merge logic (mirrors setRecentBooks below) to check result
    const mergedDataForCheck = { ...data };
    const deepFieldsCheck = [
      'translations', 'translationsMeta', 'annotations', 
      'verifications', 'verificationsMeta', 'pageDims', 
      'userHighlights', 'userNotes'
    ] as const;

    for (const field of deepFieldsCheck) {
      if (data[field] && typeof data[field] === 'object') {
        mergedDataForCheck[field] = {
          ...(existingForCheck[field] || {}),
          ...data[field]
        } as any;
      }
    }

    const candidateState = { ...existingForCheck, ...mergedDataForCheck, fileId: safeId, fileName: effectiveFileName };
    
    // Compare content excluding timestamp
    const { timestamp: _t1, ...existingContent } = existingForCheck;
    const { timestamp: _t2, ...candidateContent } = candidateState;

    if (equal(existingContent, candidateContent)) {
       return safeId;
    }

    // Aggiornamento immediato dello stato locale per reattività UI
    // CRITICAL FIX: Update Ref synchronously to prevent race conditions/double saves
    const currentRefState = recentBooksRef.current;
    const existing = currentRefState[safeId] || { fileName: effectiveFileName, lastPage: 1, timestamp: Date.now(), fileId: safeId };
    
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

    const updated = { ...existing, ...mergedData, timestamp: Date.now(), fileName: effectiveFileName, fileId: safeId };
    
    // 1. Update Ref IMMEDIATELY
    const nextState = { ...currentRefState, [safeId]: updated };
    recentBooksRef.current = nextState;

    // 2. Update React State
    setRecentBooks(nextState);

    const saveRequest: SaveRequest = {
      fileId: safeId,
      data: data,
      priority,
      timestamp: Date.now(),
      attempts: 0
    };

    // CRITICAL FIX: Upsert logic to prevent queue growth
    // If a request for this file already exists, update it instead of adding a new one.
    const existingIndex = saveQueueRef.current.findIndex(r => r.fileId === safeId);

    if (existingIndex !== -1) {
        const existing = saveQueueRef.current[existingIndex];
        
        // Upgrade priority if needed
        if (priority === 'CRITICAL' && existing.priority !== 'CRITICAL') {
            existing.priority = 'CRITICAL';
        }
        
        // Update data and timestamp
        existing.data = mergeSaveDelta(existing.data, data);
        existing.timestamp = Date.now();
        existing.attempts = 0; 

        // If it is CRITICAL, move to front and process immediately
        if (priority === 'CRITICAL') {
             saveQueueRef.current.splice(existingIndex, 1);
             saveQueueRef.current.unshift(existing);
             setTimeout(() => processSaveQueue(), 0);
        } else {
             // Reset debounce timer for non-critical updates
             if (saveTimeoutRef.current[safeId]) {
                clearTimeout(saveTimeoutRef.current[safeId]);
             }
             saveTimeoutRef.current[safeId] = setTimeout(() => {
                delete saveTimeoutRef.current[safeId];
                processSaveQueue();
             }, priority === 'BACKGROUND' ? 30000 : 1000);
        }
        
        return safeId;
    }

    // Queue the save request based on priority (New Request)
    if (saveQueueRef.current.length >= MAX_QUEUE_SIZE && priority !== 'CRITICAL') {
      log.warning(`Save queue full (${MAX_QUEUE_SIZE}), dropping background save for ${safeId} to prevent memory saturation.`);
      return safeId;
    }

    if (priority === 'CRITICAL') {
      // Process immediately
      saveQueueRef.current.unshift(saveRequest);
      setTimeout(() => processSaveQueue(), 0);
    } else {
      // Add to queue and debounce processing
      saveQueueRef.current.push(saveRequest);
      if (!silent) setIsSaving?.(true);
      
      // Clear existing debounce timeout for this file
      if (saveTimeoutRef.current[safeId]) {
        clearTimeout(saveTimeoutRef.current[safeId]);
      }
      
      // Set new debounce timeout
      saveTimeoutRef.current[safeId] = setTimeout(() => {
        delete saveTimeoutRef.current[safeId];
        processSaveQueue();
      }, priority === 'BACKGROUND' ? 30000 : 1000);
    }

    return safeId;
  }, [setIsSaving, processSaveQueue]);


  const flushSaves = useCallback(async (onlyFileIds?: string[] | string) => {
    const normalizeTargets = () => {
      const only = typeof onlyFileIds === 'string'
        ? [onlyFileIds]
        : (Array.isArray(onlyFileIds) ? onlyFileIds : null);

      const timeoutIds = Object.keys(saveTimeoutRef.current);
      const queueIds = Array.from(new Set(saveQueueRef.current.map(r => r.fileId)));
      const all = Array.from(new Set([...timeoutIds, ...queueIds]));

      return only ? all.filter(id => only.includes(id)) : all;
    };

    const targetFileIds = normalizeTargets();
    if (targetFileIds.length === 0) return true;

    log.info(`Forzo il salvataggio sequenziale di ${targetFileIds.length} progetti in sospeso...`);

    let allSuccess = true;

    for (const fileId of targetFileIds) {
      if (saveTimeoutRef.current[fileId]) {
        clearTimeout(saveTimeoutRef.current[fileId]);
        delete saveTimeoutRef.current[fileId];
      }

      if (blacklistedIdsRef.current.has(fileId) || transitioningIdsRef.current.has(fileId)) {
        log.warning(`Flush saltato per ID bloccato: ${fileId}`);
        allSuccess = false;
        continue;
      }

      const pendingForId = saveQueueRef.current.filter(r => r.fileId === fileId);
      if (pendingForId.length > 0) {
        saveQueueRef.current = saveQueueRef.current.filter(r => r.fileId !== fileId);
      }

      const mergedData: any = pendingForId.reduce((acc, r) => mergeSaveDelta(acc, r.data), {});
      const payload = buildProjectSavePayload(fileId, mergedData, recentBooksRef.current[fileId]);
      if (!payload) {
        allSuccess = false;
        continue;
      }

      try {
        await new Promise(resolve => setTimeout(resolve, 0));
        const res = await window.electronAPI?.saveTranslation({ fileId, data: payload });
        if (!res?.success) {
          log.error(`Flush fallito per ${fileId}: ${res?.error || 'Unknown error'}`);
          allSuccess = false;
        }
      } catch (e) {
        log.error(`Flush fallito per ${fileId}:`, e);
        allSuccess = false;
      }
    }

    setIsSaving?.(false);
    return allSuccess;
  }, [setIsSaving]);

  const handleAssignGroup = useCallback((fileId: string, groupIdOrName: string) => {
    // CRITICAL FIX: Use ref to avoid stale closure state
    const book = recentBooksRef.current[fileId];
    if (!book) return;
    
    // MIGRATION ON THE FLY: If user passed a Name, try to find ID. 
    // If not found, create it? No, assume ID is passed or Name is valid.
    // To support both legacy (string names in book) and new (IDs), we need logic.
    // However, the cleanest way is: we assume `groupIdOrName` is the target ID we want to toggle.
    // BUT, existing books have names.
    // So if book.groups contains "Sci-Fi" (name) and we toggle "123" (ID of Sci-Fi), we should remove "Sci-Fi" and add "123"?
    // Or just check if "Sci-Fi" exists in availableGroups?
    
    // Let's resolve the target ID from the input (which might be a name if coming from legacy UI, but we updated UI to pass ID)
    // Actually, we updated UI to pass ID. So `groupIdOrName` should be an ID.
    
    let targetId = groupIdOrName;
    
    const currentGroups = book.groups || [];
    
    // Check if we are adding or removing
    // We need to check if *any* existing group matches the target ID (either by exact ID or by Name resolution)
    
    // Find the group object for the target ID
    const targetGroupObj = availableGroups.find(g => g.id === targetId);
    const targetName = targetGroupObj?.name;

    const isAlreadyAssigned = currentGroups.some(g => {
        if (g === targetId) return true;
        if (targetName && g === targetName) return true; // Match by name (legacy)
        return false;
    });

    let newGroups: string[];
    
    if (isAlreadyAssigned) {
        // Remove both ID and Name (clean up legacy)
        newGroups = currentGroups.filter(g => g !== targetId && g !== targetName);
    } else {
        // Add ID
        newGroups = [...currentGroups, targetId];
    }

    // CRITICAL FIX: Pass explicit fileId to avoid collisions
    void updateLibrary(fileId, { fileId, groups: newGroups });
  }, [updateLibrary, availableGroups]);

  const deleteProject = useCallback(async (fileId: string) => {
    return new Promise<boolean>((resolve) => {
      const proceed = async () => {
        try {
          if (!window.electronAPI) throw new Error('Contesto Electron non rilevato');
          const result = await window.electronAPI.deleteTranslation(fileId);
          if (result.success) {
            blockSave(fileId);
            
            // CRITICAL FIX: Optimistically remove from state immediately to prevent "File Not Found" loops
            // if the UI tries to re-render or save before refreshLibrary completes.
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
  }, [refreshLibrary, showConfirm]);

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

  const registerNameChange = useCallback((fileId: string, newName: string) => {
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
        setRecentBooks(prev => ({ ...prev, [fileId]: updated }));
    } else {
        // Recovery: If book not in memory but we are renaming it (rare), just update cache
        log.warning(`Registering name change for unloaded book ${fileId}: -> '${newName}'`);
    }
  }, []);

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
