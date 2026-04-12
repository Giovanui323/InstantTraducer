import { log } from '../services/logger';

let _enableLogging = false;

// Keys that are read frequently (e.g. on render) and should not clutter the logs
const IGNORED_LOG_KEYS = new Set([
  'showThumbnail',
  'auto_prefetch_pages',
  'page_scale',
  'reader_brightness',
  'reader_temperature',
  'translation_theme',
  'reader_column_layout',
  'thumbnailScale',
  'verbose_logs'
]);

/**
 * Abilita o disabilita il logging delle operazioni di storage.
 * Utile per ridurre lo spam nei log durante il rendering frequente.
 */
export const setStorageLogging = (enabled: boolean) => {
  _enableLogging = enabled;
};

/**
 * Wrapper per localStorage con logging integrato per debug e audit trail
 * Updated: Fixed removeItem implementation and added logging toggle
 */
export const storage = {
  /**
   * Salva un valore nel localStorage con logging
   */
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
      if (_enableLogging) {
        log.step(`localStorage.setItem: ${key}`, { key, valueLength: value.length });
      }
    } catch (error) {
      log.error(`Failed to set localStorage item: ${key}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        key
      });
      throw error;
    }
  },

  /**
   * Recupera un valore dal localStorage con logging
   */
  getItem(key: string): string | null {
    try {
      const value = localStorage.getItem(key);
      if (_enableLogging && !IGNORED_LOG_KEYS.has(key)) {
        log.step(`localStorage.getItem: ${key}`, { key, found: value !== null, valueLength: value?.length });
      }
      return value;
    } catch (error) {
      log.error(`Failed to get localStorage item: ${key}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        key
      });
      return null;
    }
  },

  /**
   * Rimuove un valore dal localStorage con logging
   */
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
      if (_enableLogging) {
        log.step(`localStorage.removeItem: ${key}`, { key });
      }
    } catch (error) {
      log.error(`Failed to remove localStorage item: ${key}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        key
      });
      throw error;
    }
  },

  /**
   * Cancella tutto il localStorage con logging
   */
  clear(): void {
    try {
      localStorage.clear();
      log.warning('localStorage.clear: All items removed');
    } catch (error) {
      log.error('Failed to clear localStorage', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }
};

/**
 * Wrapper per sessionStorage con logging integrato per debug e audit trail
 */
export const sessionStorageWrapper = {
  /**
   * Salva un valore nel sessionStorage con logging
   */
  setItem(key: string, value: string): void {
    try {
      globalThis.sessionStorage.setItem(key, value);
      if (_enableLogging) {
        log.step(`sessionStorage.setItem: ${key}`, { key, valueLength: value.length });
      }
    } catch (error) {
      log.error(`Failed to set sessionStorage item: ${key}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        key
      });
      throw error;
    }
  },

  /**
   * Recupera un valore dal sessionStorage con logging
   */
  getItem(key: string): string | null {
    try {
      const value = globalThis.sessionStorage.getItem(key);
      if (_enableLogging && !IGNORED_LOG_KEYS.has(key)) {
        log.step(`sessionStorage.getItem: ${key}`, { key, found: value !== null, valueLength: value?.length });
      }
      return value;
    } catch (error) {
      log.error(`Failed to get sessionStorage item: ${key}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        key
      });
      return null;
    }
  },

  /**
   * Rimuove un valore dal sessionStorage con logging
   */
  removeItem(key: string): void {
    try {
      globalThis.sessionStorage.removeItem(key);
      if (_enableLogging) {
        log.step(`sessionStorage.removeItem: ${key}`, { key: key });
      }
    } catch (error) {
      log.error(`Failed to remove sessionStorage item: ${key}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        key: key
      });
      throw error;
    }
  },

  /**
   * Cancella tutto il sessionStorage con logging
   */
  clear(): void {
    try {
      globalThis.sessionStorage.clear();
      log.warning('sessionStorage.clear: All items removed');
    } catch (error) {
      log.error('Failed to clear sessionStorage', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }
};
