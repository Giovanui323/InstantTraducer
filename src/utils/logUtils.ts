import { log } from '../services/logger';

/**
 * Utilità per la gestione dei file di log
 */
export const logUtils = {
  /**
   * Ottiene il percorso della cartella dei log
   * Questa funzione è specifica per Electron e richiederà l'API appropriata
   */
  async getLogsDirectory(): Promise<string> {
    try {
      // In un'app Electron, useremo l'API per ottenere il percorso userData
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const userDataPath = await (window as any).electronAPI.getUserDataPath();
        return `${userDataPath}/logs`;
      }
      // Fallback per ambiente di sviluppo
      return './logs';
    } catch (error) {
      log.error('Errore nel recuperare il percorso dei log', {
        error: error instanceof Error ? error.message : String(error)
      });
      return './logs';
    }
  },

  /**
   * Elenca tutti i file di log disponibili
   */
  async listLogFiles(): Promise<string[]> {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        return await (window as any).electronAPI.listLogFiles();
      }
      return [];
    } catch (error) {
      log.error('Errore nel listare i file di log', {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  },

  /**
   * Legge il contenuto di un file di log specifico
   */
  async readLogFile(filename: string): Promise<string> {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        return await (window as any).electronAPI.readLogFile(filename);
      }
      return 'Funzionalità disponibile solo in ambiente Electron';
    } catch (error) {
      log.error(`Errore nella lettura del file di log: ${filename}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      return `Errore nella lettura del file: ${error instanceof Error ? error.message : String(error)}`;
    }
  },

  /**
   * Apre la cartella dei log nel file manager del sistema
   */
  async openLogsDirectory(): Promise<void> {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        await (window as any).electronAPI.openLogsDirectory();
        log.info('Cartella dei log aperta nel file manager');
      } else {
        log.warning('Apertura cartella log non disponibile in ambiente web');
      }
    } catch (error) {
      log.error('Errore nell\'apertura della cartella dei log', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  },

  /**
   * Ottiene informazioni su un file di log
   */
  async getLogFileInfo(filename: string): Promise<{ size: number; modified: Date } | null> {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        return await (window as any).electronAPI.getLogFileInfo(filename);
      }
      return null;
    } catch (error) {
      log.error(`Errore nel recupero informazioni del file di log: ${filename}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  },

  /**
   * Cancella vecchi file di log (più vecchi di X giorni)
   */
  async cleanupOldLogs(daysToKeep: number = 7): Promise<number> {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const deletedCount = await (window as any).electronAPI.cleanupOldLogs(daysToKeep);
        log.info(`Pulizia log completata: ${deletedCount} file eliminati`);
        return deletedCount;
      }
      return 0;
    } catch (error) {
      log.error('Errore nella pulizia dei file di log', {
        error: error instanceof Error ? error.message : String(error)
      });
      return 0;
    }
  }
};