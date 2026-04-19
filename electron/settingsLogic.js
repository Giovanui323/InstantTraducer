import { app, ipcMain, safeStorage, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { settingsMutex } from './state.js';
import { safeWriteFile, setFileUtilSettings } from './fileUtils.js';
import { setLogsDir } from './logger.js';
import { redactSettings } from './mainUtils.js';
import { validateSettings, checkSize } from './validation.js';

let logger;
let cachedSettings = null;
const logMain = (msg, meta) => logger?.info(String(msg), meta);
const logError = (msg, meta) => logger?.error(String(msg), meta);

const MAX_JSON_SIZE = 100 * 1024 * 1024; // 100MB

export function getCachedSettings() {
    return cachedSettings;
}

export async function loadCachedSettings(providedLogger) {
    if (providedLogger) logger = providedLogger;
    try {
        const userDataPath = app.getPath('userData');
        const settingsPath = path.join(userDataPath, 'settings.json');
        try {
            await fs.promises.access(settingsPath);
            const content = await fs.promises.readFile(settingsPath, 'utf-8');
            cachedSettings = JSON.parse(content);
            setFileUtilSettings(cachedSettings);
            try {
                const custom = cachedSettings?.customProjectsPath ? String(cachedSettings.customProjectsPath).trim() : '';
                if (custom) {
                    await fs.promises.mkdir(custom, { recursive: true });
                    await fs.promises.access(custom, fs.constants.W_OK);
                    setLogsDir(path.join(custom, 'logs'));
                } else {
                    setLogsDir(path.join(userDataPath, 'logs'));
                }
            } catch {
                setLogsDir(path.join(userDataPath, 'logs'));
            }
        } catch (err) {
            if (err.code !== 'ENOENT') {
                logError('Error accessing settings file during initial load:', { path: settingsPath, error: err.message });
            }
        }
    } catch (e) {
        logError('Failed to load cached settings:', e);
    }
}

export function setupSettingsHandlers(providedLogger) {
    logger = providedLogger;

    ipcMain.handle('save-settings', async (event, settings) => {
        const cid = `set_${Math.random().toString(36).slice(2, 7)}`;
        return settingsMutex.enqueue('global', async (op) => {
            try {
                const operationId = op?.operationId || 'unknown';
                const startedAt = Date.now();
                const userDataPath = app.getPath('userData');
                const settingsPath = path.join(userDataPath, 'settings.json');
                
                logMain(`[${cid}] IPC save-settings`, { operationId, path: settingsPath, settings: redactSettings(settings) });
                
                validateSettings(settings);
                checkSize(settings, MAX_JSON_SIZE, 'Settings');

                const toPersist = JSON.parse(JSON.stringify(settings));
                let encryptionUsed = false;

                try {
                    const canEncrypt = safeStorage && safeStorage.isEncryptionAvailable();
                    if (canEncrypt) {
                        if (toPersist?.gemini?.apiKey) {
                            const enc = safeStorage.encryptString(String(toPersist.gemini.apiKey));
                            toPersist.gemini.apiKeyEnc = Buffer.from(enc).toString('base64');
                            delete toPersist.gemini.apiKey;
                            encryptionUsed = true;
                        }
                        if (toPersist?.openai?.apiKey) {
                            const enc = safeStorage.encryptString(String(toPersist.openai.apiKey));
                            toPersist.openai.apiKeyEnc = Buffer.from(enc).toString('base64');
                            delete toPersist.openai.apiKey;
                            encryptionUsed = true;
                        }
                    }
                } catch (encError) {
                    logError(`[${cid}] Encryption failed, saving in plain text`, encError);
                }

                const content = JSON.stringify(toPersist, null, 2);
                await safeWriteFile(settingsPath, content, 'utf-8');
                
                cachedSettings = JSON.parse(JSON.stringify(settings));
                setFileUtilSettings(cachedSettings);
                try {
                    const custom = cachedSettings?.customProjectsPath ? String(cachedSettings.customProjectsPath).trim() : '';
                    if (custom) setLogsDir(path.join(custom, 'logs'));
                    else setLogsDir(path.join(userDataPath, 'logs'));
                } catch { }

                logMain(`[${cid}] Settings salvati con successo`, { 
                    operationId,
                    encryption: encryptionUsed,
                    elapsedMs: Date.now() - startedAt 
                });
                return { success: true };
            } catch (error) {
                logError(`[${cid}] Error saving settings`, error);
                return { success: false, error: error.message };
            }
        });
    });

    ipcMain.handle('load-settings', async () => {
        const cid = `lod_${Math.random().toString(36).slice(2, 7)}`;
        return settingsMutex.enqueue('global', async (op) => {
            try {
                const operationId = op?.operationId || 'unknown';
                const userDataPath = app.getPath('userData');
                const settingsPath = path.join(userDataPath, 'settings.json');
                
                let rawContent;
                try {
                    rawContent = await fs.promises.readFile(settingsPath, 'utf-8');
                } catch (err) {
                    if (err.code === 'ENOENT') {
                        logMain(`[${cid}] Settings file not found, returning defaults`);
                        return null;
                    }
                    logError(`[${cid}] Error reading settings file`, { path: settingsPath, error: err.message });
                    throw new Error(`Impossibile leggere il file delle impostazioni: ${err.message}`);
                }

                let settings;
                try {
                    settings = JSON.parse(rawContent);
                } catch (err) {
                    logError(`[${cid}] Settings file contains invalid JSON`, { path: settingsPath, error: err.message });
                    throw new Error(`File delle impostazioni corrotto (JSON non valido): ${err.message}`);
                }
                let decryptionUsed = false;

                const canDecrypt = safeStorage && safeStorage.isEncryptionAvailable();
                let staleCiphertextRemoved = false;
                if (canDecrypt) {
                    const tryDecrypt = (provider) => {
                        const section = settings?.[provider];
                        if (!section?.apiKeyEnc) return;
                        try {
                            const buf = Buffer.from(section.apiKeyEnc, 'base64');
                            section.apiKey = safeStorage.decryptString(buf);
                            delete section.apiKeyEnc;
                            decryptionUsed = true;
                        } catch (decError) {
                            logError(`[${cid}] Decryption failed for ${provider} — clearing stale ciphertext, user must re-enter the API key`, {
                                name: decError?.name,
                                message: decError?.message,
                                code: decError?.code,
                            });
                            delete section.apiKeyEnc;
                            staleCiphertextRemoved = true;
                        }
                    };
                    tryDecrypt('gemini');
                    tryDecrypt('openai');
                }

                if (staleCiphertextRemoved) {
                    try {
                        const sanitized = JSON.parse(JSON.stringify(settings));
                        if (sanitized?.gemini?.apiKey) delete sanitized.gemini.apiKey;
                        if (sanitized?.openai?.apiKey) delete sanitized.openai.apiKey;
                        await safeWriteFile(settingsPath, JSON.stringify(sanitized, null, 2), 'utf-8');
                        logMain(`[${cid}] Stale ciphertext removed from settings.json on disk`);
                    } catch (writeErr) {
                        logError(`[${cid}] Failed to persist cleaned settings`, {
                            name: writeErr?.name,
                            message: writeErr?.message,
                        });
                    }
                }

                cachedSettings = JSON.parse(JSON.stringify(settings));
                setFileUtilSettings(cachedSettings);
                try {
                    const custom = cachedSettings?.customProjectsPath ? String(cachedSettings.customProjectsPath).trim() : '';
                    if (custom) setLogsDir(path.join(custom, 'logs'));
                    else setLogsDir(path.join(userDataPath, 'logs'));
                } catch { }

                logMain(`[${cid}] Settings caricati`, { 
                    operationId,
                    decryption: decryptionUsed,
                    settings: redactSettings(settings) 
                });
                return settings;
            } catch (error) {
                logError(`[${cid}] Error loading settings`, error);
                return null;
            }
        }, { priority: 'CRITICAL' });
    });

    ipcMain.handle('choose-and-set-projects-base-dir', async () => {
        const cid = `pdir_${Math.random().toString(36).slice(2, 7)}`;
        return settingsMutex.enqueue('global', async (op) => {
            const operationId = op?.operationId || 'unknown';
            const startedAt = Date.now();
            const userDataPath = app.getPath('userData');
            const settingsPath = path.join(userDataPath, 'settings.json');

            const parent = BrowserWindow.getFocusedWindow() || undefined;

            const getBaseFromSettings = (s) => {
                const custom = s?.customProjectsPath;
                return (custom && String(custom).trim()) ? String(custom) : userDataPath;
            };

            const readSettingsJson = async () => {
                try {
                    const raw = await fs.promises.readFile(settingsPath, 'utf-8');
                    try {
                        return JSON.parse(raw);
                    } catch (e) {
                        throw new Error(`File delle impostazioni corrotto (JSON non valido): ${e.message}`);
                    }
                } catch (e) {
                    if (e.code === 'ENOENT') return {};
                    throw new Error(`Impossibile leggere il file delle impostazioni: ${e.message}`);
                }
            };

            const writeSettingsJson = async (obj) => {
                const content = JSON.stringify(obj || {}, null, 2);
                await safeWriteFile(settingsPath, content, 'utf-8');
            };

            const ensureWritableDir = async (dirPath) => {
                const p = String(dirPath || '').trim();
                if (!p) throw new Error('Percorso cartella non valido');
                await fs.promises.mkdir(p, { recursive: true });
                await fs.promises.access(p, fs.constants.W_OK);
                const probe = path.join(p, `.write_test_${process.pid}_${Date.now()}_${Math.random().toString(16).slice(2)}`);
                try {
                    await fs.promises.writeFile(probe, 'ok', 'utf-8');
                } finally {
                    try { await fs.promises.unlink(probe); } catch { }
                }
            };

            const ensureBaseStructure = async (baseDir) => {
                const translationsDir = path.join(baseDir, 'translations');
                const assetsDir = path.join(translationsDir, 'assets');
                await fs.promises.mkdir(translationsDir, { recursive: true });
                await fs.promises.mkdir(assetsDir, { recursive: true });
            };

            const isDirEmptyOrMissing = async (dirPath) => {
                try {
                    const entries = await fs.promises.readdir(dirPath);
                    return entries.length === 0;
                } catch (e) {
                    if (e.code === 'ENOENT') return true;
                    throw e;
                }
            };

            const moveDir = async (src, dst) => {
                try {
                    await fs.promises.rename(src, dst);
                    return;
                } catch (e) {
                    if (e.code !== 'EXDEV') throw e;
                }
                await fs.promises.cp(src, dst, { recursive: true, errorOnExist: true, force: false });
                await fs.promises.rm(src, { recursive: true, force: true });
            };

            try {
                logMain(`[${cid}] IPC choose-and-set-projects-base-dir`, { operationId });

                const result = parent
                    ? await dialog.showOpenDialog(parent, { properties: ['openDirectory', 'createDirectory'] })
                    : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
                if (result.canceled || result.filePaths.length === 0) {
                    logMain(`[${cid}] Projects base dir selection cancelled`, { elapsedMs: Date.now() - startedAt });
                    return { success: false, cancelled: true };
                }

                const selectedBase = String(result.filePaths[0] || '').trim();
                if (!selectedBase) return { success: false, error: 'Percorso cartella non valido' };

                const currentSettingsJson = await readSettingsJson();
                const oldBase = getBaseFromSettings(currentSettingsJson);

                if (path.resolve(selectedBase) === path.resolve(oldBase)) {
                    return { success: true, customProjectsPath: currentSettingsJson?.customProjectsPath || '' };
                }

                await ensureWritableDir(selectedBase);

                const choice = parent
                    ? await dialog.showMessageBox(parent, {
                    type: 'question',
                    buttons: ['Sposta progetti', 'Inizia libreria vuota', 'Annulla'],
                    defaultId: 0,
                    cancelId: 2,
                    title: 'Cambia Cartella Progetti',
                    message: 'Vuoi spostare i progetti attuali nella nuova cartella o iniziare con una libreria vuota?',
                    detail: 'Sposta: trasferisce JSON e assets nella nuova cartella.\nNuova: cambia solo il percorso, i file restano nella vecchia cartella.'
                })
                    : await dialog.showMessageBox({
                        type: 'question',
                        buttons: ['Sposta progetti', 'Inizia libreria vuota', 'Annulla'],
                        defaultId: 0,
                        cancelId: 2,
                        title: 'Cambia Cartella Progetti',
                        message: 'Vuoi spostare i progetti attuali nella nuova cartella o iniziare con una libreria vuota?',
                        detail: 'Sposta: trasferisce JSON e assets nella nuova cartella.\nNuova: cambia solo il percorso, i file restano nella vecchia cartella.'
                    });

                if (choice.response === 2) return { success: false, cancelled: true };

                const newTranslations = path.join(selectedBase, 'translations');
                if (choice.response === 0) {
                    const emptyOk = await isDirEmptyOrMissing(newTranslations);
                    if (!emptyOk) {
                        return { success: false, error: 'La cartella selezionata contiene già una libreria (translations non vuota). Seleziona una cartella vuota.' };
                    }
                    const oldTranslations = path.join(oldBase, 'translations');
                    try {
                        await fs.promises.access(oldTranslations);
                        await moveDir(oldTranslations, newTranslations);
                    } catch (e) {
                        if (e.code !== 'ENOENT') throw e;
                    }
                    await ensureBaseStructure(selectedBase);
                } else {
                    await ensureBaseStructure(selectedBase);
                }

                const patch = { customProjectsPath: path.resolve(selectedBase) === path.resolve(userDataPath) ? '' : selectedBase };
                const updatedSettingsJson = { ...(currentSettingsJson || {}), ...patch };
                await writeSettingsJson(updatedSettingsJson);

                cachedSettings = JSON.parse(JSON.stringify(updatedSettingsJson));
                setFileUtilSettings(cachedSettings);
                try {
                    const custom = cachedSettings?.customProjectsPath ? String(cachedSettings.customProjectsPath).trim() : '';
                    if (custom) setLogsDir(path.join(custom, 'logs'));
                    else setLogsDir(path.join(userDataPath, 'logs'));
                } catch { }

                try {
                    for (const win of BrowserWindow.getAllWindows()) {
                        if (win && !win.isDestroyed()) win.webContents.send('library-refresh', { reason: 'projects-base-dir-changed', customProjectsPath: patch.customProjectsPath });
                    }
                } catch { }

                logMain(`[${cid}] Projects base dir updated`, {
                    operationId,
                    oldBase,
                    newBase: selectedBase,
                    mode: choice.response === 0 ? 'moved' : 'new',
                    elapsedMs: Date.now() - startedAt
                });
                return { success: true, customProjectsPath: patch.customProjectsPath, mode: choice.response === 0 ? 'moved' : 'new' };
            } catch (error) {
                logError(`[${cid}] choose-and-set-projects-base-dir failed`, { error: error.message });
                return { success: false, error: error.message };
            }
        }, { priority: 'CRITICAL' });
    });

    ipcMain.handle('reset-projects-base-dir-to-default', async () => {
        const cid = `pdef_${Math.random().toString(36).slice(2, 7)}`;
        return settingsMutex.enqueue('global', async (op) => {
            const operationId = op?.operationId || 'unknown';
            const startedAt = Date.now();
            const userDataPath = app.getPath('userData');
            const settingsPath = path.join(userDataPath, 'settings.json');
            const parent = BrowserWindow.getFocusedWindow() || undefined;

            const readSettingsJson = async () => {
                try {
                    const raw = await fs.promises.readFile(settingsPath, 'utf-8');
                    try {
                        return JSON.parse(raw);
                    } catch (e) {
                        throw new Error(`File delle impostazioni corrotto (JSON non valido): ${e.message}`);
                    }
                } catch (e) {
                    if (e.code === 'ENOENT') return {};
                    throw new Error(`Impossibile leggere il file delle impostazioni: ${e.message}`);
                }
            };

            const writeSettingsJson = async (obj) => {
                const content = JSON.stringify(obj || {}, null, 2);
                await safeWriteFile(settingsPath, content, 'utf-8');
            };

            const ensureBaseStructure = async (baseDir) => {
                const translationsDir = path.join(baseDir, 'translations');
                const assetsDir = path.join(translationsDir, 'assets');
                await fs.promises.mkdir(translationsDir, { recursive: true });
                await fs.promises.mkdir(assetsDir, { recursive: true });
            };

            const isDirEmptyOrMissing = async (dirPath) => {
                try {
                    const entries = await fs.promises.readdir(dirPath);
                    return entries.length === 0;
                } catch (e) {
                    if (e.code === 'ENOENT') return true;
                    throw e;
                }
            };

            const moveDir = async (src, dst) => {
                try {
                    await fs.promises.rename(src, dst);
                    return;
                } catch (e) {
                    if (e.code !== 'EXDEV') throw e;
                }
                await fs.promises.cp(src, dst, { recursive: true, errorOnExist: true, force: false });
                await fs.promises.rm(src, { recursive: true, force: true });
            };

            try {
                logMain(`[${cid}] IPC reset-projects-base-dir-to-default`, { operationId });

                const currentSettingsJson = await readSettingsJson();
                const oldCustom = currentSettingsJson?.customProjectsPath ? String(currentSettingsJson.customProjectsPath) : '';
                if (!oldCustom.trim()) {
                    await ensureBaseStructure(userDataPath);
                    return { success: true, customProjectsPath: '' };
                }

                const choice = parent
                    ? await dialog.showMessageBox(parent, {
                    type: 'question',
                    buttons: ['Sposta progetti', 'Inizia libreria vuota', 'Annulla'],
                    defaultId: 0,
                    cancelId: 2,
                    title: 'Ripristina Cartella Default',
                    message: 'Vuoi spostare i progetti attuali nella cartella di default o iniziare con una libreria vuota?',
                    detail: 'Sposta: trasferisce JSON e assets nella cartella di default.\nNuova: cambia solo il percorso, i file restano nella vecchia cartella.'
                })
                    : await dialog.showMessageBox({
                        type: 'question',
                        buttons: ['Sposta progetti', 'Inizia libreria vuota', 'Annulla'],
                        defaultId: 0,
                        cancelId: 2,
                        title: 'Ripristina Cartella Default',
                        message: 'Vuoi spostare i progetti attuali nella cartella di default o iniziare con una libreria vuota?',
                        detail: 'Sposta: trasferisce JSON e assets nella cartella di default.\nNuova: cambia solo il percorso, i file restano nella vecchia cartella.'
                    });

                if (choice.response === 2) return { success: false, cancelled: true };

                const newTranslations = path.join(userDataPath, 'translations');
                if (choice.response === 0) {
                    const emptyOk = await isDirEmptyOrMissing(newTranslations);
                    if (!emptyOk) {
                        return { success: false, error: 'La cartella di default contiene già una libreria (translations non vuota). Sposta/backup prima e riprova.' };
                    }
                    const oldTranslations = path.join(oldCustom, 'translations');
                    try {
                        await fs.promises.access(oldTranslations);
                        await moveDir(oldTranslations, newTranslations);
                    } catch (e) {
                        if (e.code !== 'ENOENT') throw e;
                    }
                    await ensureBaseStructure(userDataPath);
                } else {
                    await ensureBaseStructure(userDataPath);
                }

                const updatedSettingsJson = { ...(currentSettingsJson || {}), customProjectsPath: '' };
                await writeSettingsJson(updatedSettingsJson);

                cachedSettings = JSON.parse(JSON.stringify(updatedSettingsJson));
                setFileUtilSettings(cachedSettings);
                try {
                    const custom = cachedSettings?.customProjectsPath ? String(cachedSettings.customProjectsPath).trim() : '';
                    if (custom) setLogsDir(path.join(custom, 'logs'));
                    else setLogsDir(path.join(userDataPath, 'logs'));
                } catch { }

                try {
                    for (const win of BrowserWindow.getAllWindows()) {
                        if (win && !win.isDestroyed()) win.webContents.send('library-refresh', { reason: 'projects-base-dir-reset-default', customProjectsPath: '' });
                    }
                } catch { }

                logMain(`[${cid}] Projects base dir reset to default`, {
                    operationId,
                    oldBase: oldCustom,
                    newBase: userDataPath,
                    mode: choice.response === 0 ? 'moved' : 'new',
                    elapsedMs: Date.now() - startedAt
                });
                return { success: true, customProjectsPath: '', mode: choice.response === 0 ? 'moved' : 'new' };
            } catch (error) {
                logError(`[${cid}] reset-projects-base-dir-to-default failed`, { error: error.message });
                return { success: false, error: error.message };
            }
        }, { priority: 'CRITICAL' });
    });
}
