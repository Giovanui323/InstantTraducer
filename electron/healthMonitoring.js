/**
 * Health monitoring for save operations
 */
import { inconsistencyTracker } from './state.js';
import { cleanupOrphanedAssets } from './fileUtils.js';

export function setupHealthMonitoring(ipcMain, writeSequencer) {
  ipcMain.handle('get-library-health', async () => {
    return inconsistencyTracker.getReport();
  });

  ipcMain.handle('cleanup-orphaned-assets', async () => {
    return await cleanupOrphanedAssets();
  });

  ipcMain.handle('get-save-health', async () => {
    const health = {
      saveMetrics: {},
      queueStatus: {
        pendingSaves: writeSequencer.pendingSaves?.size || 0,
        debounceTimeouts: writeSequencer.debounceTimeouts?.size || 0
      },
      performance: {
        excessiveSaves: false
      }
    };
    
    return health;
  });

  ipcMain.handle('reset-save-metrics', async () => {
    if (writeSequencer.saveMetrics) {
      writeSequencer.saveMetrics.clear();
    }
    return { success: true };
  });

  ipcMain.handle('force-flush-saves', async () => {
    if (writeSequencer.flushAll) {
      await writeSequencer.flushAll();
    }
    return { success: true };
  });
}