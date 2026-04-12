import { useCallback, useRef } from 'react';
import { log } from '../../services/logger';

export interface ConcurrencyControl {
  acquire: (page: number, signal?: AbortSignal) => Promise<void>;
  release: (page: number) => void;
}

export interface SlotManagerProps {
  MAX_CONCURRENT_TRANSLATIONS: number;
  setQueueStats: React.Dispatch<React.SetStateAction<{ queued: number; active: number }>>;
  pumpQueueRef: React.MutableRefObject<(() => Promise<void>) | undefined>;
}

export interface SlotManagerResult {
  acquireSlot: (page: number, signal?: AbortSignal) => Promise<void>;
  releaseSlot: (page: number) => void;
  concurrencyControl: React.MutableRefObject<ConcurrencyControl>;
  activePagesRef: React.MutableRefObject<Set<number>>;
  slotRequestQueueRef: React.MutableRefObject<Array<(value: void | PromiseLike<void>) => void>>;
}

export const useSlotManager = ({
  MAX_CONCURRENT_TRANSLATIONS,
  setQueueStats,
  pumpQueueRef
}: SlotManagerProps): SlotManagerResult => {
  const activePagesRef = useRef<Set<number>>(new Set());
  const slotRequestQueueRef = useRef<Array<(value: void | PromiseLike<void>) => void>>([]);

  const acquireSlot = useCallback(async (page: number, signal?: AbortSignal) => {
    if (signal?.aborted) throw new Error('Aborted');

    // Try to acquire immediately
    if (activePagesRef.current.size < MAX_CONCURRENT_TRANSLATIONS) {
      if (!activePagesRef.current.has(page)) {
        activePagesRef.current.add(page);
        setQueueStats(prev => ({ ...prev, active: activePagesRef.current.size }));
      }
      return;
    }

    // Wait for slot
    log.info(`[QUEUE] Page ${page} waiting for slot re-acquisition...`);
    await new Promise<void>((resolve, reject) => {
      let onAbort: (() => void) | undefined;

      const safeResolve = () => {
        if (onAbort && signal) signal.removeEventListener('abort', onAbort);
        resolve();
      };

      if (signal) {
        onAbort = () => {
          // Remove from queue
          const idx = slotRequestQueueRef.current.indexOf(safeResolve);
          if (idx > -1) slotRequestQueueRef.current.splice(idx, 1);
          reject(new Error('Aborted'));
        };
        signal.addEventListener('abort', onAbort);
      }

      slotRequestQueueRef.current.push(safeResolve);
    });

    // Slot acquired (passed from releaseSlot)
    if (!activePagesRef.current.has(page)) {
      activePagesRef.current.add(page);
      setQueueStats(prev => ({ ...prev, active: activePagesRef.current.size }));

      // Trigger pumpQueue to allow dependent pages to start (Pipelining)
      // since this page is now Active and might satisfy dependencies.
      if (pumpQueueRef.current) {
        void pumpQueueRef.current();
      }
    }
  }, [MAX_CONCURRENT_TRANSLATIONS, setQueueStats]);

  const releaseSlot = useCallback((page: number) => {
    if (activePagesRef.current.has(page)) {
      activePagesRef.current.delete(page);
      setQueueStats(prev => ({ ...prev, active: activePagesRef.current.size }));
      log.info(`[QUEUE] Page ${page} released slot temporarily.`);

      // Prioritize waking up waiting tasks (FIFO)
      if (slotRequestQueueRef.current.length > 0) {
        const resolve = slotRequestQueueRef.current.shift();
        if (resolve) {
          resolve();
          return; // Slot transferred to waiter
        }
      }

      // If no one waiting, pump the queue for new tasks
      // Use the ref to ensure we call the latest version
      if (pumpQueueRef.current) {
        void pumpQueueRef.current();
      }
    }
  }, [setQueueStats]);

  const concurrencyControl = useRef<ConcurrencyControl>({
    acquire: acquireSlot,
    release: releaseSlot
  });

  return {
    acquireSlot,
    releaseSlot,
    concurrencyControl,
    activePagesRef,
    slotRequestQueueRef
  };
};
