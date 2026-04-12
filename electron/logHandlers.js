import { app, shell, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { inconsistencyTracker } from './state.js';
import { closeAllStreams } from './logger.js';
import { getLogsDir } from './fileUtils.js';

let logger;
const logMain = (msg, meta) => logger?.info(String(msg), meta);
const logDebug = (msg, meta) => logger?.debug(String(msg), meta);
const logWarn = (msg, meta) => logger?.warn(String(msg), meta);
const logError = (msg, meta) => logger?.error(String(msg), meta);

export function setupLogHandlers(providedLogger) {
    logger = providedLogger;

    ipcMain.on('renderer-log', (_event, payload) => {
        try {
            const level = payload && typeof payload === 'object' ? String(payload.level || 'info').toLowerCase() : 'info';
            const message = payload && typeof payload === 'object' ? String(payload.message || '') : String(payload || '');
            const meta = payload && typeof payload === 'object' ? payload.meta : undefined;
            const type = payload && typeof payload === 'object' ? payload.type : undefined;

            if (type === 'state-inconsistency') {
                inconsistencyTracker.stateDivergences++;
            }

            if (level === 'debug') logDebug(`[RENDERER] ${message}`, meta);
            else if (level === 'warn' || level === 'warning') logWarn(`[RENDERER] ${message}`, meta);
            else if (level === 'error') logError(`[RENDERER] ${message}`, meta);
            else logMain(`[RENDERER] ${message}`, meta);
        } catch (e) {
            if (typeof logError === 'function') logError('Renderer log handler failed', { error: e.message });
        }
    });

    ipcMain.handle('open-logs-dir', async () => {
        try {
            const dir = await getLogsDir();
            await shell.openPath(dir);
            logMain('IPC open-logs-dir:', dir);
            return { success: true, path: dir };
        } catch (e) {
            logError('IPC open-logs-dir failed', { error: e.message });
            return { success: false, error: e?.message || String(e) };
        }
    });

    ipcMain.handle('get-user-data-path', async () => {
        try {
            return app.getPath('userData');
        } catch (e) {
            logError('IPC get-user-data-path failed', { error: e.message });
            throw e;
        }
    });

    ipcMain.handle('list-log-files', async () => {
        try {
            const logsDir = await getLogsDir();
            
            const files = await fs.promises.readdir(logsDir);
            const logFiles = files.filter(f => (f.startsWith('app-') || f.startsWith('error-') || f.startsWith('debug-')) && f.endsWith('.log'));
            
            logFiles.sort((a, b) => b.localeCompare(a));
            
            logMain('IPC list-log-files:', { count: logFiles.length, files: logFiles });
            return logFiles;
        } catch (e) {
            logError('IPC list-log-files failed', { error: e.message });
            return [];
        }
    });

    ipcMain.handle('read-log-file', async (event, filename) => {
        try {
            const logsDir = await getLogsDir();
            const filePath = path.join(logsDir, filename);
            
            if (!filePath.startsWith(logsDir)) {
                throw new Error('Percorso file non valido');
            }
            
            await fs.promises.access(filePath, fs.constants.F_OK);
            
            const content = await fs.promises.readFile(filePath, 'utf-8');
            logMain('IPC read-log-file:', { filename, size: content.length });
            return content;
        } catch (e) {
            logError('IPC read-log-file failed', { error: e.message, filename });
            throw e;
        }
    });

    ipcMain.handle('get-log-file-info', async (event, filename) => {
        try {
            const logsDir = await getLogsDir();
            const filePath = path.join(logsDir, filename);
            
            if (!filePath.startsWith(logsDir)) {
                throw new Error('Percorso file non valido');
            }
            
            const stats = await fs.promises.stat(filePath);
            logMain('IPC get-log-file-info:', { filename, size: stats.size, modified: stats.mtime });
            
            return {
                size: stats.size,
                modified: stats.mtime
            };
        } catch (e) {
            logError('IPC get-log-file-info failed', { error: e.message, filename });
            return null;
        }
    });

    ipcMain.handle('cleanup-old-logs', async (event, daysToKeep = 7) => {
        return await executeLogCleanup(daysToKeep);
    });

    ipcMain.handle('delete-log-files', async (_event, payload) => {
        return await executeDeleteLogFiles(payload);
    });

    ipcMain.handle('logger-selfcheck', async () => {
        try {
            logger.trace('SELF-CHECK trace');
            logger.debug('SELF-CHECK debug');
            logger.info('SELF-CHECK info');
            logger.warn('SELF-CHECK warn');
            logger.error('SELF-CHECK error');
            const dir = await getLogsDir();
            return { success: true, path: dir };
        } catch (e) {
            return { success: false, error: e?.message || String(e) };
        }
    });
}

export async function executeLogCleanup(daysToKeep = 7) {
    try {
        // Always close streams to ensure we don't hold handles to deleted files
        // and to force rotation/creation on next log.
        try { closeAllStreams(); } catch (e) { console.error('Error closing streams:', e); }

        const logsDir = await getLogsDir();
        
        // Calcola la data di cutoff come stringa YYYY-MM-DD
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
        
        logMain(`Starting log cleanup. Keeping logs from ${cutoffDateStr} onwards (last ${daysToKeep} days). Directory: ${logsDir}`);
        
        const files = await fs.promises.readdir(logsDir);
        const logFiles = files.filter(f => (f.startsWith('app-') || f.startsWith('error-') || f.startsWith('debug-')) && f.endsWith('.log'));
        
        let deletedCount = 0;
        
        for (const filename of logFiles) {
            try {
                const filePath = path.join(logsDir, filename);
                
                // Estrai la data dal nome del file: app-2024-02-08.log -> 2024-02-08
                const match = filename.match(/^(?:app|error|debug)-(\d{4}-\d{2}-\d{2})(?:-v[^/]+)?\.log$/);
                
                if (match) {
                    const fileDateStr = match[1];
                    
                    // Confronto stringhe: "2024-01-31" < "2024-02-01" -> TRUE (Delete)
                    if (fileDateStr < cutoffDateStr) {
                        await fs.promises.unlink(filePath);
                        deletedCount++;
                        logMain('Deleted old log file (by name):', filename);
                    }
                } else {
                    // Fallback a mtime se il nome non ha una data valida ma rispetta il pattern generico
                    const stats = await fs.promises.stat(filePath);
                    if (stats.mtime < cutoffDate) {
                        await fs.promises.unlink(filePath);
                        deletedCount++;
                        logMain('Deleted old log file (by mtime):', filename);
                    }
                }
            } catch (fileError) {
                logWarn('Failed to process log file for cleanup', { filename, error: fileError.message });
            }
        }
        
        logMain('IPC cleanup-old-logs completed:', { deletedCount, daysToKeep, cutoffDateStr, totalFound: logFiles.length });
        return { deletedCount, totalFound: logFiles.length, daysToKeep };
    } catch (e) {
        logError('IPC cleanup-old-logs failed', { error: e.message });
        return { deletedCount: 0, totalFound: 0, error: e.message };
    }
}

export async function executeDeleteLogFiles(payload) {
    const result = { deletedCount: 0, totalRequested: 0, failed: [] };
    try {
        const filenames = Array.isArray(payload?.filenames) ? payload.filenames : (Array.isArray(payload) ? payload : []);
        result.totalRequested = filenames.length;

        if (filenames.length === 0) {
            return result;
        }

        try { closeAllStreams(); } catch (e) { console.error('Error closing streams:', e); }

        const logsDir = await getLogsDir();

        const allowed = /^(?:app|error|debug)-\d{4}-\d{2}-\d{2}(?:-v[^/]+)?\.log$/;

        for (const filename of filenames) {
            try {
                const safeName = String(filename || '');
                if (!allowed.test(safeName)) {
                    throw new Error('Nome file non valido');
                }

                const filePath = path.join(logsDir, safeName);
                if (!filePath.startsWith(logsDir)) {
                    throw new Error('Percorso file non valido');
                }

                await fs.promises.unlink(filePath);
                result.deletedCount++;
            } catch (e) {
                result.failed.push({ filename: String(filename || ''), error: e?.message || String(e) });
            }
        }

        logMain('IPC delete-log-files completed:', { ...result });
        return result;
    } catch (e) {
        logError('IPC delete-log-files failed', { error: e?.message || String(e) });
        return { ...result, error: e?.message || String(e) };
    }
}
