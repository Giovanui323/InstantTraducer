import { AISettings, PDFMetadata } from '../../types';
import { log } from '../logger';
import { BackgroundJobState, TranslationJobRunner } from './TranslationJobRunner';

export interface ManagerSnapshot {
  currentFileId: string | null;
  backgroundJob: BackgroundJobState | null;
  summaryCount: number; // 0 or 1 (since we only have 1 active at a time)
}

type Listener = (snapshot: ManagerSnapshot) => void;

class TranslationManager {
  private static instance: TranslationManager;
  
  private currentFileId: string | null = null;
  private backgroundJob: TranslationJobRunner | null = null;
  private backgroundJobState: BackgroundJobState | null = null;
  
  private listeners: Set<Listener> = new Set();
  
  private constructor() {}
  
  public static getInstance(): TranslationManager {
    if (!TranslationManager.instance) {
      TranslationManager.instance = new TranslationManager();
    }
    return TranslationManager.instance;
  }
  
  public async setCurrentFileId(fileId: string | null) {
    if (this.currentFileId === fileId) return;
    
    // If we are opening a file that is currently the background job,
    // we must STOP the background job so the App can take over.
    if (fileId && this.backgroundJobState?.fileId === fileId) {
      log.info(`[Manager] Apertura file background (${fileId}): stop background job per passaggio a foreground.`);
      await this.stopBackground();
    }
    
    this.currentFileId = fileId;
    this.emit();
  }
  
  public requestBackground(
    fileId: string,
    pdfDoc: any,
    metadata: PDFMetadata,
    aiSettings: AISettings,
    inputLanguage: string,
    translationMap: Record<number, string>,
    queue: number[]
  ): boolean {
    if (!fileId || queue.length === 0) return false;
    
    // Constraint: Only 1 background slot.
    // If occupied by a DIFFERENT file, Pause + Close the old one.
    if (this.backgroundJob) {
      if (this.backgroundJobState?.fileId === fileId) {
        log.info(`[Manager] Richiesta background per file già in background (${fileId}). Ignoro.`);
        return true;
      }
      log.info(`[Manager] Sostituzione slot background: chiusura ${this.backgroundJobState?.fileName}`);
      this.stopBackground();
    }
    
    log.info(`[Manager] Avvio background per ${metadata.name} (${queue.length} pagine in coda)`);
    
    this.backgroundJob = new TranslationJobRunner(
      fileId,
      pdfDoc,
      metadata,
      aiSettings,
      inputLanguage,
      translationMap,
      queue,
      (state) => {
        this.backgroundJobState = state;
        this.emit();
      },
      () => {
        // On complete
        log.success(`[Manager] Job background completato: ${metadata.name}`);
        // We keep the state as 'completed' but stop the runner
        // The runner stops itself, but we might want to cleanup refs?
        // We keep it until user acknowledges or opens another project.
      }
    );
    
    // Start it
    this.backgroundJob.start();
    
    // Initial state
    this.backgroundJobState = this.backgroundJob.getSnapshot();
    this.emit();
    
    return true;
  }
  
  public async stopBackground() {
    if (this.backgroundJob) {
      await this.backgroundJob.stop();
      this.backgroundJob = null;
      this.backgroundJobState = null;
      this.emit();
    }
  }
  
  /**
   * Called when the active project starts translating.
   * Single Slot Policy REMOVED: Background jobs continue running.
   */
  public notifyActiveTranslationStarted() {
    // if (this.backgroundJob && this.backgroundJobState?.status === 'running') {
    //   log.info("[Manager] Traduzione attiva avviata: pausa forzata background job (Single Slot Policy).");
    //   this.backgroundJob.pause();
    //   this.stopBackground();
    // }
  }
  
  public getSnapshot(): ManagerSnapshot {
    let count = 0;
    if (this.backgroundJobState?.status === 'running') count = 1;
    // We don't track active job status here perfectly (App handles it), 
    // but the UI usually sums them up.
    
    return {
      currentFileId: this.currentFileId,
      backgroundJob: this.backgroundJobState,
      summaryCount: count
    };
  }
  
  public subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }
  
  private emit() {
    const snapshot = this.getSnapshot();
    this.listeners.forEach(l => {
      try {
        l(snapshot);
      } catch (e) {
        log.error("[Manager] Error in listener:", e);
      }
    });
  }
  
  // Helper for App.tsx to check if it should destroy pdfDoc
  public isManaged(pdfDoc: any): boolean {
    // We can't easily compare pdfDoc objects without reference equality.
    // But we know the fileId.
    // If the fileId corresponding to this pdfDoc is the background job, then we manage it.
    // But this method is hard to use because App.tsx might not know if the pdfDoc it holds matches the background one
    // (since it might have been replaced).
    // Instead, App.tsx will call requestBackground passing the pdfDoc.
    // If requestBackground returns true, App.tsx should NOT destroy it.
    return false; 
  }
}

export const translationManager = TranslationManager.getInstance();
