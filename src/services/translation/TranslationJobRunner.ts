import { AISettings, PageAnnotation, PageStatus, PDFMetadata, PageVerification } from '../../types';
import { log } from '../logger';
import { executePageTranslation, TranslationExecutionContext, TranslationExecutionServices, TranslationExecutionStateSetters } from './TranslationExecutor';
import { buildJpegDataUrlFromBase64, downscaleDataUrlToJpeg, estimateBytesFromBase64 } from '../../utils/imageUtils';
import { PAGE_CACHE_JPEG_QUALITY, PAGE_CACHE_MAX_EDGE } from '../../constants';
import { verifyQualityAdapter } from '../aiAdapter';
import { sleep } from '../../utils/async';

export interface BackgroundJobState {
  fileId: string;
  fileName: string;
  status: 'running' | 'paused' | 'error' | 'completed';
  progress: {
    total: number;
    translated: number;
    current: number;
  };
  error?: string;
}

export class TranslationJobRunner {
  private fileId: string;
  private pdfDoc: any; // PDFDocumentProxy
  private metadata: PDFMetadata;
  private aiSettings: AISettings;
  private inputLanguage: string;

  // State
  private queue: number[] = [];
  private translationMap: Record<number, string> = {};
  private translationsMeta: Record<number, any> = {};
  private annotations: Record<number, PageAnnotation[]> = {};
  private verifications: Record<number, PageVerification> = {}; // Added for robust saving
  private pageStatus: Record<number, PageStatus> = {};

  // Debounce State
  private saveDebounceTimer: NodeJS.Timeout | null = null;
  private pendingSaveData: any = null;

  // Resources
  private pageReplacements: Record<number, any> = {};
  private pageRotations: Record<number, number> = {};
  private pageImagesIndex: any = { sources: {}, crops: {} };

  private abortController: AbortController | null = null;
  private inFlightRequests: Record<number, AbortController> = {};

  private onStateChange: (state: BackgroundJobState) => void;
  private onComplete: () => void;

  private isRunning = false;
  private isPaused = false;
  private loopPromise: Promise<void> | null = null;

  private async saveWithPriority(data: any, priority: 'CRITICAL' | 'BACKGROUND' | 'BATCH' = 'BACKGROUND') {
    try {
      // 1. Accumulate changes locally (always merge into pendingSaveData to ensure consistency)
      if (!this.pendingSaveData) {
        this.pendingSaveData = {};
      }

      for (const key of Object.keys(data)) {
        if (typeof data[key] === 'object' && data[key] !== null && !Array.isArray(data[key])) {
          this.pendingSaveData[key] = { ...(this.pendingSaveData[key] || {}), ...data[key] };
        } else {
          this.pendingSaveData[key] = data[key];
        }
      }

      if (priority === 'CRITICAL') {
        if (this.saveDebounceTimer) {
          clearTimeout(this.saveDebounceTimer);
          this.saveDebounceTimer = null;
        }

        // FIX: Merge pending data into payload for CRITICAL save to avoid data loss
        const payload = { ...this.pendingSaveData };
        this.pendingSaveData = null; // Clear buffer

        const success = await window.electronAPI.saveTranslation({ fileId: this.fileId, data: payload });

        if (!success || (success && success.success === false)) {
          // RESTORE DATA ON FAILURE
          log.warn("[Runner] CRITICAL Save failed, restoring pending data buffer.");
          this.pendingSaveData = { ...payload, ...(this.pendingSaveData || {}) };
          return false;
        }
        return true;
      }

      // THROTTLE LOGIC:
      // If a timer is already running, we DO NOT reset it.
      // We let it run its course. The callback will pick up the new pendingSaveData.
      // This ensures we save at fixed intervals (e.g. every 30s) instead of pushing the save
      // indefinitely into the future (Debounce) or saving too frequently (Throttle with short interval).
      if (this.saveDebounceTimer) {
        return true;
      }

      // Start a new timer
      // We use 30s for BACKGROUND to reduce I/O blocking.
      const delay = 30000;

      this.saveDebounceTimer = setTimeout(async () => {
        await this.flushPendingSave();
      }, delay);

      return true;
    } catch (e) {
      log.error("[Runner] Save failed", e);
      return false;
    }
  }

  private async flushPendingSave() {
    this.saveDebounceTimer = null; // Clear timer reference

    if (this.pendingSaveData) {
      // Capture payload to send
      const payload = { ...this.pendingSaveData };
      // Clear pending data before await to allow new data to accumulate
      this.pendingSaveData = null;

      try {
        const result = await window.electronAPI.saveTranslation({ fileId: this.fileId, data: payload });
        if (!result || result.success === false) {
          throw new Error(result?.error || "Unknown save error");
        }
      } catch (e) {
        log.error("[Runner] Flush save failed - RESTORING DATA to pending buffer", e);

        // CRITICAL FIX: Restore data to pending buffer to prevent data loss
        // We merge payload (failed data) with any new data that arrived during the await
        // New data (this.pendingSaveData) takes precedence over old data (payload)
        this.pendingSaveData = {
          ...payload,
          ...(this.pendingSaveData || {})
        };

        // Schedule a retry soon (5s) to ensure we don't lose this data
        if (!this.saveDebounceTimer) {
          this.saveDebounceTimer = setTimeout(() => this.flushPendingSave(), 5000);
        }
      }
    }
  }

  constructor(
    fileId: string,
    pdfDoc: any,
    metadata: PDFMetadata,
    aiSettings: AISettings,
    inputLanguage: string,
    initialTranslationMap: Record<number, string>,
    initialQueue: number[],
    onStateChange: (state: BackgroundJobState) => void,
    onComplete: () => void
  ) {
    this.fileId = fileId;
    this.pdfDoc = pdfDoc;
    this.metadata = metadata;
    this.aiSettings = aiSettings;
    this.inputLanguage = inputLanguage;
    this.translationMap = { ...initialTranslationMap };
    this.queue = [...initialQueue];
    this.onStateChange = onStateChange;
    this.onComplete = onComplete;
  }

  public async start() {
    if (this.isRunning) return;

    const total = this.metadata.totalPages || 0;
    const translated = Object.keys(this.translationMap).length;

    // Only warn if queue is empty AND all pages translated (don't block if queue has items)
    if (total > 0 && translated >= total && this.queue.length === 0) {
      log.warn('TranslationJobRunner: Project appears completed and queue is empty.', {
        fileId: this.fileId,
        total,
        translated
      });
      this.emitState();
      this.onComplete();
      return;
    }

    this.isRunning = true;
    this.isPaused = false;
    this.abortController = new AbortController();

    // Load full project state from disk to ensure we have everything (replacements, rotations, etc)
    await this.loadProjectState();

    this.loopPromise = this.runLoop();
  }

  public pause() {
    this.isPaused = true;
    this.isRunning = false;
    this.abortAll();
    this.emitState();
  }

  public async stop() {
    // Idempotency check: if already stopped/stopping, don't do it again
    if (!this.isRunning && !this.isPaused && !this.pendingSaveData) return;

    this.isRunning = false;
    this.isPaused = false;
    this.abortAll();

    // Flush pending save
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }

    // FIX: Race flush to prevent hanging if I/O is blocked
    try {
      await Promise.race([
        this.flushPendingSave(),
        new Promise(resolve => setTimeout(resolve, 2000)) // 2s max wait
      ]);
    } catch (e) {
      log.error("[Runner] Error flushing on stop", e);
    }

    if (this.loopPromise) {
      try {
        // Wait for loop to exit, but don't hang
        await Promise.race([
          this.loopPromise,
          new Promise(resolve => setTimeout(resolve, 1000))
        ]);
      } catch (e) {
        log.warn("[Runner] Loop stop timeout or error", e);
      }
      this.loopPromise = null;
    }

    // Cleanup references
    this.pdfDoc = null;
  }

  public getSnapshot(): BackgroundJobState {
    const total = this.metadata.totalPages || 0;
    const translated = Object.keys(this.translationMap).length;
    const current = this.queue.length > 0 ? this.queue[0] : 0;

    let status: 'running' | 'paused' | 'error' | 'completed' = 'completed';

    if (this.isRunning) {
      status = 'running';
    } else if (this.isPaused) {
      status = 'paused';
    } else if (this.queue.length === 0) {
      status = 'completed';
    } else {
      status = 'error';
    }

    return {
      fileId: this.fileId,
      fileName: this.metadata.name,
      status,
      progress: { total, translated, current },
      error: Object.values(this.pageStatus).find(s => s.error)?.error as string | undefined
    };
  }

  private abortAll() {
    this.abortController?.abort();
    Object.values(this.inFlightRequests).forEach(c => c.abort());
    this.inFlightRequests = {};
  }

  private emitState() {
    this.onStateChange(this.getSnapshot());
  }

  private async loadProjectState() {
    try {
      if (!window.electronAPI) return;
      const data = await window.electronAPI.loadTranslation(this.fileId);
      if (data) {
        this.pageReplacements = data.pageReplacements || {};
        this.pageRotations = data.rotations || {};
        this.pageImagesIndex = data.pageImages || { sources: {}, crops: {} };
        // We merge translations just in case, but usually we trust the constructor init
        this.translationMap = { ...data.translations, ...this.translationMap };
        this.translationsMeta = { ...data.translationsMeta, ...this.translationsMeta };
        this.annotations = { ...data.annotations, ...this.annotations };
        this.verifications = { ...data.verifications, ...this.verifications };
      }
    } catch (e) {
      log.error(`[Runner] Errore caricamento stato progetto ${this.fileId}`, e);
    }
  }

  private async runLoop() {
    log.info(`[Runner] Avvio loop traduzione background per ${this.metadata.name}`);

    while (this.isRunning && !this.isPaused) {
      // 1. Check queue
      if (this.queue.length === 0) {
        log.success(`[Runner] Coda vuota per ${this.metadata.name}. Completato.`);
        this.isRunning = false;
        await this.flushPendingSave(); // Force flush on complete
        this.emitState();
        this.onComplete();
        break;
      }

      const page = this.queue[0];

      // 2. Check concurrency (Simple: 1 page at a time for background to be safe and low resource)
      // The user said "1 background job", implies low resource usage. 
      // We process sequentially.

      try {
        await this.processPage(page);

        // Success: remove from queue
        this.queue.shift();
        this.emitState();

        // Small delay to breathe
        await new Promise(r => setTimeout(r, 500));
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          log.info(`[Runner] Pagina ${page} abortita.`);
          break;
        }

        log.error(`[Runner] Errore pagina ${page}`, e);

        // Remove errored page from queue and continue to next page
        this.queue.shift();
        this.emitState();

        // Brief pause before continuing
        await new Promise(r => setTimeout(r, 1000));
        // Continue to next page instead of stopping
      }
    }
  }

  private async processPage(page: number) {
    // Check if already translated
    if (this.translationMap[page]) {
      return;
    }

    const abortCtrl = new AbortController();
    this.inFlightRequests[page] = abortCtrl;

    // Bridge services
    const services: TranslationExecutionServices = {
      updateLibrary: async (fileName, data, priority = 'BACKGROUND') => {
        // Direct save to electron
        if (!window.electronAPI) return "";
        try {
          // Merge with local state
          if (data.translations) Object.assign(this.translationMap, data.translations);
          if (data.translationsMeta) Object.assign(this.translationsMeta, data.translationsMeta);
          if (data.annotations) Object.assign(this.annotations, data.annotations);
          
          // CRITICAL FIX: Add retry logic for background saves
          let success = false;
          let saveAttempts = 0;
          const MAX_SAVE_ATTEMPTS = 3;

          while (saveAttempts < MAX_SAVE_ATTEMPTS) {
             success = await this.saveWithPriority({
               ...data,
               fileName: this.metadata.name
             }, priority);
             if (success) break;

             saveAttempts++;
             if (saveAttempts < MAX_SAVE_ATTEMPTS) {
                 log.warn(`[Runner] Salvataggio respinto (Tentativo ${saveAttempts}/${MAX_SAVE_ATTEMPTS}). Riprovo tra 1s...`);
                 await sleep(1000);
             }
          }

          if (!success) {
            const msg = "Salvataggio su disco fallito dopo vari tentativi. Verifica lo stato del progetto. Job in pausa.";
            log.error(`[Runner] ${msg}`);
            this.pause();
            throw new Error(msg);
          }

          return this.fileId;
        } catch (e) {
          log.error("[Runner] Save failed", e);
          this.pause(); // Ensure we pause on any error
          throw e; // Re-throw to stop executor
        }
      },
      appendPageConsole: (p, msg, data) => {
        // Minimal logging for background
        if (msg.includes("ERRORE")) log.error(`[BG-p${p}] ${msg}`, data);
        else log.info(`[BG-p${p}] ${msg}`);
      },
      verifyAndMaybeFixTranslation: async (params) => {
        // Verifica in background abilitata se configurata nelle impostazioni
        if (!this.aiSettings.qualityCheck?.enabled) {
          return undefined;
        }

        try {
          const report = await verifyQualityAdapter({
            settings: this.aiSettings,
            translatedText: params.translatedText,
            imageBase64: params.imageBase64,
            pageNumber: params.pageNumber,
            prevPageImageBase64: params.prevPageImageBase64,
            prevPageNumber: params.prevPageNumber,
            nextPageImageBase64: params.nextPageImageBase64,
            nextPageNumber: params.nextPageNumber,
            signal: abortCtrl.signal,
            sourceLanguage: this.inputLanguage
          });

          // Salviamo il report di verifica
          if (report) {
            const verificationEntry: PageVerification = {
              ...report,
              changed: false,
              checkedAt: Date.now(),
              runId: Date.now(),
              autoRetryActive: false // Non attiviamo auto-retry in background per semplicità per ora, ma salviamo il report
            };

            // Salviamo le evidenze di errore
            if (window.electronAPI) {
              // Aggiorniamo verifications map
              this.verifications[params.pageNumber] = verificationEntry;

              // Se ci sono annotazioni dal report, le uniamo
              if (report.annotations && report.annotations.length > 0) {
                const pageAnns = (report.annotations || []).map((a: any) => ({
                  ...a,
                  id: Math.random().toString(36).slice(2, 9)
                }));
                this.annotations[params.pageNumber] = pageAnns; // Aggiorna stato locale
              }

              // Use BATCH priority for verification saves as they're low priority
              // We don't pass data here because saveWithPriority uses local state
              await this.saveWithPriority({}, 'BATCH');
            }

            return verificationEntry;
          }
        } catch (e) {
          log.error(`[BG-p${params.pageNumber}] Errore verifica qualità`, e);
        }
        return undefined;
      },
      saveSourceForPage: async (args) => {
        if (!window.electronAPI) return;
        if (!args.dataUrl && !args.buffer) {
          log.warn(`[BG-Runner] saveSourceForPage saltato: dati immagine mancanti per pagina ${args.page}`);
          return;
        }
        await window.electronAPI.saveProjectImage({ ...args, fileId: this.fileId, kind: 'source' });
      },
      readProjectImageBase64: async (args) => {
        if (!window.electronAPI) throw new Error("No Electron");
        const res = await window.electronAPI.readProjectImageBase64({ ...args, fileId: this.fileId });
        return res.base64;
      },
      readProjectImageDataUrl: async (args) => {
        if (!window.electronAPI) throw new Error("No Electron");
        const res = await window.electronAPI.readProjectImage({ ...args, fileId: this.fileId });
        return res.dataUrl;
      },
      getContextImageBase64: async (p, section) => {
        // We need to implement this. 
        // It tries to get from cache, then disk, then render.
        // We can reuse the logic if we had the state.
        // For simplicity: try disk, then render.

        // 1. Disk
        const rel = this.pageImagesIndex.sources?.[p];
        if (rel) {
          const res = await window.electronAPI?.readProjectImageBase64({ fileId: this.fileId, relPath: rel });
          if (res?.base64) return res.base64; // TODO: Crop if needed
        }

        // 2. Render
        if (this.pdfDoc) {
          // Render page logic... this is duplicated from executor? 
          // Executor expects `getContextImageBase64` to be passed in.
          // We can implement a simplified version here.
          try {
            if (p < 1 || (this.pdfDoc.numPages && p > this.pdfDoc.numPages)) return undefined;
            const page = await this.pdfDoc.getPage(p);
            const viewport = page.getViewport({ scale: 1.0 }); // Low scale for context
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
            const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
            return dataUrl.split(',')[1];
          } catch { }
        }
        return undefined;
      },
      loadReplacementPdfDoc: async (path) => {
        // We don't have the cache from App.tsx. 
        // Just load it (it will be destroyed when job stops?)
        // Or use a simple cache here.
        return await window.electronAPI?.readPdfFile(path).then((data: any) =>
          (window as any).pdfjsLib.getDocument(data).promise
        );
      },
      renderDocPageToJpeg: async (doc, p, opts) => {
        // Minimal implementation
        if (!doc) throw new Error("Documento non disponibile");
        if (p < 1 || (doc.numPages && p > doc.numPages)) throw new Error(`Pagina non valida: ${p}`);

        const page = await doc.getPage(p);
        const viewport = page.getViewport({ scale: opts.scale || 1.5, rotation: opts.extraRotation || 0 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', opts.jpegQuality || 0.8);
        return { dataUrl, base64: dataUrl.split(',')[1], width: viewport.width, height: viewport.height };
      },
      getLatestTranslationMap: () => this.translationMap
    };

    const context: TranslationExecutionContext = {
      pdfDoc: this.pdfDoc,
      metadata: this.metadata,
      currentProjectFileId: this.fileId,
      aiSettings: this.aiSettings,
      docInputLanguage: this.inputLanguage,
      sessionId: "bg-" + this.fileId,
      verboseLogs: false,
      isConsultationMode: false,
      pageReplacements: this.pageReplacements,
      pageRotations: this.pageRotations,
      pageImagesIndex: this.pageImagesIndex,
      translationMap: this.translationMap,
      verificationMap: this.verifications
    };

    // Setters that update local state
    const setters: TranslationExecutionStateSetters = {
      updatePageStatus: (p, status) => {
        if (status === null) delete this.pageStatus[p];
        else this.pageStatus[p] = { ...this.pageStatus[p], ...status };
        this.emitState();
      },
      setTranslationMap: (updater) => {
        // Not used much by executor directly for state, mostly for ref
        // But we update our local map
        // Executor calls this with a callback
        // We can just ignore the callback form for now or support it?
        // Executor does: setTranslationMap(prev => { ... })
        // We need to support function
        const prev = this.translationMap;
        // @ts-ignore
        const next = updater(prev);
        this.translationMap = next;
      },
      setTranslationsMeta: (updater) => {
        // @ts-ignore
        this.translationsMeta = updater(this.translationsMeta);
      },
      setAnnotationMap: (updater) => {
        // @ts-ignore
        this.annotations = updater(this.annotations);
      },
      setPartialTranslations: () => { }, // Ignore partials in background
      setOriginalImages: () => { }, // Ignore UI images
      setPageDims: () => { } // Ignore dims
    };

    await executePageTranslation(
      page,
      services,
      context,
      setters,
      abortCtrl.signal,
      undefined, // No extra instruction
      undefined, // No model override
      undefined // No ref
    );

    // FIX: Check if the page ended in error (e.g. save failed caught by executor)
    if (this.pageStatus[page]?.error) {
      throw new Error(`Page ${page} failed: ${this.pageStatus[page].error}`);
    }

    delete this.inFlightRequests[page];
  }
}
