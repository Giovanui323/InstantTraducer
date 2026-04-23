import { useCallback, useRef } from 'react';
import { ReadingProgress } from '../../types';
import { log } from '../../services/logger';
import equal from 'fast-deep-equal';
import { isUuidV4FileId } from '../../utils/idUtils';
import { buildProjectSavePayload, mergeSaveDelta } from '../../utils/saveQueueUtils';
import * as usageTracker from '../../services/usageTracker';

export type SavePriority = 'CRITICAL' | 'BACKGROUND' | 'BATCH';

export interface SaveRequest {
  fileId: string;
  data: any;
  priority: SavePriority;
  timestamp: number;
  attempts: number;
}

const MAX_QUEUE_SIZE = 50;
const MAX_REQUEST_AGE = 5 * 60 * 1000; // 5 minutes

export interface SaveQueueManagerProps {
  setIsSaving?: (v: boolean) => void;
  showToast?: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
  recentBooksRef: React.MutableRefObject<Record<string, ReadingProgress>>;
  setRecentBooks: React.Dispatch<React.SetStateAction<Record<string, ReadingProgress>>>;
  blacklistedIdsRef: React.MutableRefObject<Set<string>>;
  transitioningIdsRef: React.MutableRefObject<Set<string>>;
  processingSaveIdsRef: React.MutableRefObject<Set<string>>;
  renamedIdsRef: React.MutableRefObject<Map<string, string>>;
  stableIdNameMismatchLoggedRef: React.MutableRefObject<Set<string>>;
  blockSave: (fileId: string, durationMs?: number, reason?: string) => void;
  currentProjectFileIdRef: React.MutableRefObject<string | null>;
}

export interface SaveQueueManagerResult {
  processSaveQueue: () => Promise<void>;
  updateLibrary: (fileId: string, data: any, priority?: SavePriority, silent?: boolean) => Promise<string>;
  flushSaves: (onlyFileIds?: string[] | string) => Promise<boolean>;
  cancelPendingSaves: (fileId: string) => void;
  saveQueueRef: React.MutableRefObject<SaveRequest[]>;
  saveTimeoutRef: React.MutableRefObject<Record<string, NodeJS.Timeout>>;
  blockedErrorCountRef: React.MutableRefObject<number>;
}

export const useSaveQueueManager = ({
  setIsSaving,
  showToast,
  recentBooksRef,
  setRecentBooks,
  blacklistedIdsRef,
  transitioningIdsRef,
  processingSaveIdsRef,
  renamedIdsRef,
  stableIdNameMismatchLoggedRef,
  blockSave,
  currentProjectFileIdRef
}: SaveQueueManagerProps): SaveQueueManagerResult => {
  const saveTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});
  const saveQueueRef = useRef<SaveRequest[]>([]);
  const isProcessingQueueRef = useRef<boolean>(false);
  const blockedErrorCountRef = useRef(0);

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
  }, [setIsSaving, showToast]);

  const updateLibrary = useCallback(async (fileId: string, data: any, priority: SavePriority = 'BACKGROUND', silent: boolean = false) => {
    // CRITICAL FIX: Enhanced ID resolution to prevent "Ghost Writes"
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

    if (!safeId) {
      log.warning(`[SaveQueue] Skipping save: No stable FileID available. Current session ID: ${currentProjectFileIdRef.current}`);
      return "";
    }

    if (!isUuidV4FileId(safeId)) {
      log.warning(`[SaveQueue] Skipping save for non-UUID project ID: ${safeId} (priority=${priority})`);
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
      log.warning(`[SaveQueue] Skipping save for ${safeId}: Missing fileName (priority=${priority}).`);
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
        log.error(`[SaveQueue-CRITICAL] Collisione identificativo: ${safeId} appartiene a '${existingBook.fileName}'. Salvataggio annullato.`);
        showToast?.("Collisione ID rilevata: salvataggio annullato per sicurezza.", 'error');
        return "";
      }
    }

    if (safeId && blacklistedIdsRef.current.has(safeId)) {
      log.warning(`[SaveQueue] Blocked save attempt for blacklisted ID (critical operation in progress): ${safeId}`);
      showToast?.("Salvataggio bloccato: Operazione critica in corso. Riprova tra pochi secondi.", 'error');
      return "";
    }

    if (safeId && transitioningIdsRef.current.has(safeId)) {
      log.info(`[SaveQueue] Tentativo di salvataggio bloccato temporaneamente causa transizione ID: ${safeId}`);
      return "";
    }

    // PREVENT REDUNDANT SAVES: Check if content actually changed
    const existingForCheck = recentBooksRef.current[safeId] || { fileName: effectiveFileName, lastPage: 1, timestamp: 0, fileId: safeId };

    // Deep merge logic to check result
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

    // CRITICAL FIX: Optimistically update UI state immediately
    setRecentBooks(prev => {
      const existing = prev[safeId];
      if (!existing) return prev;
      return {
        ...prev,
        [safeId]: { ...existing, ...data }
      };
    });

    const saveRequest: SaveRequest = {
      fileId: safeId,
      data: data,
      priority,
      timestamp: Date.now(),
      attempts: 0
    };

    // CRITICAL FIX: Upsert logic to prevent queue growth
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
  }, [setIsSaving, showToast, processSaveQueue]);

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

  return {
    processSaveQueue,
    updateLibrary,
    flushSaves,
    cancelPendingSaves,
    saveQueueRef,
    saveTimeoutRef,
    blockedErrorCountRef
  };
};
