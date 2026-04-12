import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';
import { buildExportHtml } from './exportHtml.js';
import { withTimeout } from './mainUtils.js';
import { sanitizeExportName } from './idUtils.js';

let logger;
let mainWindow;
let handlersRegistered = false;
const logMain = (msg, meta) => logger?.info(String(msg), meta);
const logDebug = (msg, meta) => logger?.debug(String(msg), meta);
const logWarn = (msg, meta) => logger?.warn(String(msg), meta);
const logError = (msg, meta) => logger?.error(String(msg), meta);

const DEFAULT_IPC_TIMEOUT = 60000;       // 60s

export function setupPdfHandlers(providedLogger, providedMainWindow) {
    logger = providedLogger;
    mainWindow = providedMainWindow;

    if (handlersRegistered) {
        logDebug('IPC handlers for pdfHandlers already registered, updating window reference only');
        return;
    }

    // Remove existing handlers to prevent "second handler" error
    ipcMain.removeHandler('export-translations-pdf');

    handlersRegistered = true;

    ipcMain.handle('export-translations-pdf', async (event, payload) => {
        const startedAt = Date.now();
        const cid = `pdf_${Math.random().toString(36).slice(2, 7)}`;
        let exportWindow;
        let tempHtmlPath;

        logMain(`[${cid}] Starting PDF export`, { bookName: payload?.bookName, pages: payload?.pages?.length });

        const openMacOsFilesAndFoldersSettings = async () => {
            if (process.platform !== 'darwin') return;
            const urls = [
                'x-apple.systempreferences:com.apple.preference.security?Privacy_DownloadsFolder',
                'x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders',
                'x-apple.systempreferences:com.apple.preference.security?Privacy',
                'x-apple.systempreferences:com.apple.preference.security',
                'x-apple.systempreferences:'
            ];
            for (const url of urls) {
                try {
                    await shell.openExternal(url);
                    return;
                } catch {}
            }
        };

        const openMacOsFullDiskAccessSettings = async () => {
            if (process.platform !== 'darwin') return;
            const urls = [
                'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',
                'x-apple.systempreferences:com.apple.preference.security?Privacy',
                'x-apple.systempreferences:com.apple.preference.security',
                'x-apple.systempreferences:'
            ];
            for (const url of urls) {
                try {
                    await shell.openExternal(url);
                    return;
                } catch {}
            }
        };

        const serializeError = (err, fallbackPath) => {
            if (!err) return { message: 'Errore sconosciuto.' };
            return {
                code: err?.code,
                errno: err?.errno,
                path: err?.path || fallbackPath,
                message: err?.message || String(err)
            };
        };

        try {
            const bookName = typeof payload?.bookName === 'string' ? payload.bookName : 'Libro';
            const pages = Array.isArray(payload?.pages) ? payload.pages : [];
            if (pages.length === 0) {
                return { success: false, error: { message: 'Nessuna pagina da esportare.' } };
            }
            logDebug('IPC export-translations-pdf: start', { bookName, pages: pages.length });

            const defaultStem = sanitizeExportName(bookName);
            const exportsDir = path.join(app.getPath('userData'), 'exports');
            const defaultPath = path.join(exportsDir, `Esportazione_${defaultStem}.pdf`);
            const result = await dialog.showSaveDialog(mainWindow || undefined, {
                title: 'Esporta PDF',
                defaultPath,
                filters: [{ name: 'PDF', extensions: ['pdf'] }],
                securityScopedBookmarks: process.platform === 'darwin'
            });

            if (result.canceled || !result.filePath) return { canceled: true };

            const primaryBookmark =
                typeof result.bookmark === 'string' && result.bookmark.length > 0
                    ? result.bookmark
                    : (Array.isArray(result.bookmarks) ? result.bookmarks[0] : undefined);

            const html = buildExportHtml({ bookName, pages, options: payload || {}, pageDims: (payload && payload.pageDims) || {} });

            tempHtmlPath = path.join(app.getPath('temp'), `export_${Date.now()}.html`);
            await fs.promises.writeFile(tempHtmlPath, html, 'utf-8');
            const fileUrl = pathToFileURL(tempHtmlPath).toString();
            logDebug('IPC export-translations-pdf: temp HTML pronto', { path: tempHtmlPath, bytes: Buffer.byteLength(html, 'utf-8') });

            exportWindow = new BrowserWindow({
                show: false,
                width: 800,
                height: 600,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: true
                }
            });

            await exportWindow.loadURL(fileUrl);
            logDebug(`[${cid}] Content loaded in export window`);
            
            const pdfBuffer = await withTimeout(
                exportWindow.webContents.printToPDF({ pageSize: 'A4', printBackground: true }),
                DEFAULT_IPC_TIMEOUT,
                'PDF Generation'
            );
            
            logDebug(`[${cid}] PDF generated`, { bytes: pdfBuffer.byteLength });

            const isPermissionError = (err) => {
                const code = err?.code;
                return code === 'EPERM' || code === 'EACCES';
            };

            const withSecurityScopedAccess = async (bookmark, fn) => {
                if (process.platform !== 'darwin') return await fn();
                if (!bookmark || typeof app.startAccessingSecurityScopedResource !== 'function') return await fn();
                let stop;
                try {
                    stop = app.startAccessingSecurityScopedResource(bookmark);
                } catch {
                    stop = undefined;
                }
                try {
                    return await fn();
                } finally {
                    try {
                        if (typeof stop === 'function') stop();
                    } catch {}
                }
            };

            const writePdf = async (targetPath, opts) => {
                const dir = path.dirname(targetPath);
                if (opts?.ensureDir || !fs.existsSync(dir)) {
                    await fs.promises.mkdir(dir, { recursive: true });
                }
                await fs.promises.writeFile(targetPath, pdfBuffer);
            };

            try {
                await withSecurityScopedAccess(primaryBookmark, async () => {
                    await writePdf(result.filePath, { ensureDir: true });
                });
            } catch (e) {
                logMain('IPC export-translations-pdf: write fallito', {
                    code: e?.code,
                    errno: e?.errno,
                    path: result.filePath,
                    message: e?.message || String(e)
                });

                if (isPermissionError(e)) {
                    const downloadsPath = app.getPath('downloads');

                    const downloadsHintFor = (targetPath) => {
                        const isDownloadsTarget = typeof downloadsPath === 'string' && String(targetPath || '').startsWith(downloadsPath + path.sep);
                        return isDownloadsTarget
                            ? '\n- in Impostazioni di Sistema → Privacy e sicurezza → File e cartelle, consenti l’accesso a Download per l’app (e per Terminale, se la stai avviando da lì)'
                            : '';
                    };

                    const showPermissionDialog = async (variant) => {
                        const isDarwin = process.platform === 'darwin';
                        const buttons = (() => {
                            if (!isDarwin) return ['Scegli un’altra posizione', 'Annulla'];
                            if (variant === 'afterSettings') {
                                return ['Riprova ora', 'Apri Accesso completo al disco…', 'Scegli un’altra posizione', 'Annulla'];
                            }
                            return ['Apri Impostazioni…', 'Apri Accesso completo al disco…', 'Scegli un’altra posizione', 'Annulla'];
                        })();

                        const chooseIdx = isDarwin ? 2 : 0;
                        const cancelIdx = isDarwin ? 3 : 1;
                        const defaultId = chooseIdx;

                        const detailText = (() => {
                            if (!isDarwin) {
                                return (
                                    `macOS ha bloccato l’accesso in scrittura a:\n${result.filePath}\n\n` +
                                    `Suggerimenti:\n- scegli una cartella diversa\n- verifica se il file è “bloccato” (Get Info)${downloadsHintFor(result.filePath)}`
                                );
                            }

                            if (variant === 'afterSettings') {
                                return (
                                    'Per autorizzare l’accesso:\n' +
                                    '1) Impostazioni di Sistema → Privacy e sicurezza → File e cartelle\n' +
                                    '2) Abilita “Download” per l’app che la sta avviando (Terminale / iTerm / VS Code / Trae, ecc.) e/o per l’app\n\n' +
                                    'Se non vedi l’app in elenco o non trovi l’opzione, prova “Apri Accesso completo al disco…” e abilita Terminale.\n\n' +
                                    'Poi torna qui e clicca “Riprova ora”.\n\n' +
                                    `Percorso:\n${result.filePath}`
                                );
                            }

                            return (
                                `macOS ha bloccato l’accesso in scrittura a:\n${result.filePath}\n\n` +
                                `Suggerimenti:\n- scegli una cartella diversa\n- verifica se il file è “bloccato” (Get Info)${downloadsHintFor(result.filePath)}\n\n` +
                                'Puoi anche cliccare “Apri Impostazioni…” per abilitare i permessi e poi riprovare.'
                            );
                        })();

                        return await dialog.showMessageBox(mainWindow || undefined, {
                            type: 'warning',
                            title: 'Permesso negato',
                            message: 'Impossibile salvare il PDF nella posizione scelta.',
                            detail: detailText,
                            buttons,
                            defaultId,
                            cancelId: cancelIdx
                        });
                    };

                    let variant = 'initial';
                    let retryCount = 0;
                    const MAX_RETRIES = 5;

                    while (retryCount < MAX_RETRIES) {
                        retryCount++;
                        const response = await showPermissionDialog(variant);
                        const isDarwin = process.platform === 'darwin';

                        if (isDarwin && variant === 'initial' && response.response === 0) {
                            await openMacOsFilesAndFoldersSettings();
                            variant = 'afterSettings';
                            continue;
                        }

                        if (isDarwin && variant === 'initial' && response.response === 1) {
                            await openMacOsFullDiskAccessSettings();
                            variant = 'afterSettings';
                            continue;
                        }

                        if (isDarwin && variant === 'afterSettings' && response.response === 1) {
                            await openMacOsFullDiskAccessSettings();
                            continue;
                        }

                        if (isDarwin && variant === 'afterSettings' && response.response === 0) {
                            try {
                                await withSecurityScopedAccess(primaryBookmark, async () => {
                                    await writePdf(result.filePath, { ensureDir: true });
                                });
                                logMain('IPC export-translations-pdf: completato (retry same path)', {
                                    path: result.filePath,
                                    pages: pages.length,
                                    elapsedMs: Date.now() - startedAt
                                });
                                return { success: true, path: result.filePath };
                            } catch (retrySameErr) {
                                if (isPermissionError(retrySameErr)) {
                                    variant = 'initial';
                                    continue;
                                }
                                throw retrySameErr;
                            }
                        }

                        const chooseOtherPressed = isDarwin
                            ? response.response === 1
                            : response.response === 0;

                        if (!chooseOtherPressed) {
                            return { canceled: true };
                        }

                        const retryDefault = path.join(exportsDir, path.basename(result.filePath));
                        const retry = await dialog.showSaveDialog(mainWindow || undefined, {
                            title: 'Esporta PDF (posizione alternativa)',
                            defaultPath: retryDefault,
                            filters: [{ name: 'PDF', extensions: ['pdf'] }],
                            securityScopedBookmarks: process.platform === 'darwin'
                        });

                        if (retry.canceled || !retry.filePath) return { canceled: true };
                        const retryBookmark =
                            typeof retry.bookmark === 'string' && retry.bookmark.length > 0
                                ? retry.bookmark
                                : (Array.isArray(retry.bookmarks) ? retry.bookmarks[0] : undefined);
                        try {
                            await withSecurityScopedAccess(retryBookmark, async () => {
                                await writePdf(retry.filePath, { ensureDir: true });
                            });
                            logMain(`[${cid}] PDF exported successfully (retry)`, { path: retry.filePath, pages: pages.length, elapsedMs: Date.now() - startedAt });
                            return { success: true, path: retry.filePath };
                        } catch (retryErr) {
                            if (isPermissionError(retryErr)) {
                                result.filePath = retry.filePath;
                                variant = 'initial';
                                continue;
                            }
                            throw retryErr;
                        }
                    }
                    
                    logError(`[${cid}] PDF export failed: maximum permission retry limit reached`);
                    return { success: false, error: 'Raggiunto il limite massimo di tentativi. Verifica i permessi di sistema e riprova.' };
                }

                throw e;
            }

            logMain(`[${cid}] PDF exported successfully`, { path: result.filePath, pages: pages.length, elapsedMs: Date.now() - startedAt });
            return { success: true, path: result.filePath };
        } catch (e) {
            logError(`[${cid}] PDF export failed`, { error: e.message });
            return { success: false, error: serializeError(e) };
        } finally {
            if (tempHtmlPath && fs.existsSync(tempHtmlPath)) {
                try { 
                    await fs.promises.unlink(tempHtmlPath); 
                } catch (e) { 
                    logWarn(`[${cid}] Failed to cleanup temp file`, { path: tempHtmlPath, error: e.message }); 
                }
                tempHtmlPath = null;
            }

            if (exportWindow && !exportWindow.isDestroyed()) {
                try { exportWindow.close(); } catch { }
                exportWindow = null;
            }
        }
    });
}
