import { app, ipcMain, dialog } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
    getTranslationsDir,
    getTrashDir,
    projectAssetsDirFromFileId,
    resolveLegacyAssetsDirFromFileId,
    findOriginalPdfInAssetsDir,
    safeWriteFile,
    withFileLock,
    getAssetsRootDir
} from './fileUtils.js';
import {
    ensureJsonExtension,
    getFileIdStem,
    isUuidV4FileId,
    normalizeProjectFileId,
    parseTrashFolderName,
    PROJECT_FORMAT_VERSION,
    requireUuidV4FileId
} from './idUtils.js';
import {
    validateProjectData,
    validateGroups,
    checkSize
} from './validation.js';
import {
    writeSequencer,
    inconsistencyTracker
} from './state.js';
import {
    mergeProjectData,
    normalizeLoadedProjectData
} from './translationMerge.js';
import {
    performRename,
    performConsolidation,
    internalRestoreTrashItem
} from './projectLogic.js';
import {
    parseImageDataUrl,
    withTimeout
} from './mainUtils.js';
import {
    safeJoin,
    safeJoinAssets,
    isPathInside
} from './pathSecurity.js';
import { createRevisionGuard } from './revisionGuard.js';
import { calculateFileHash } from './hashUtils.js';
import { performance } from 'node:perf_hooks';

let logger;
let mainWindow;
let handlersRegistered = false;
let lastUserSelectedPdfPath = null;
let pendingTranslationWrites = 0;
let lastTranslationSaveRequestedAt = 0;
let lastTranslationWriteStartedAt = 0;
let activeProjectId = null; // SESSION LOCKING FOR WRITES
const revisionGuard = createRevisionGuard();
const fingerprintCache = new Map();
const fingerprintNameCache = new Map();

const logMain = (msg, meta) => logger?.info(String(msg), meta);
const logDebug = (msg, meta) => logger?.debug(String(msg), meta);
const logWarn = (msg, meta) => logger?.warn(String(msg), meta);
const logError = (msg, meta) => logger?.error(String(msg), meta);

const MAX_JSON_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB

const normalizeFileId = (fileId) => {
    const id = normalizeProjectFileId(fileId);
    if (!id) return '';
    if (!isUuidV4FileId(id)) return '';
    return id;
};

const fileExists = async (p) => {
    try {
        await fs.promises.access(p);
        return true;
    } catch {
        return false;
    }
};

const moveFileCrossDevice = async (src, dst) => {
    try {
        await fs.promises.rename(src, dst);
        return;
    } catch (e) {
        if (e && e.code !== 'EXDEV') throw e;
    }
    await fs.promises.copyFile(src, dst);
    await fs.promises.unlink(src).catch(() => { });
};

const setFingerprintCacheEntry = (fingerprint, fileId, fileName) => {
    if (!fingerprint || !fileId) return;
    const id = normalizeFileId(fileId);
    fingerprintCache.set(fingerprint, id);
    if (fileName) fingerprintNameCache.set(fingerprint, fileName);
};

const removeFingerprintByFileId = (fileId) => {
    const id = normalizeFileId(fileId);
    for (const [fingerprint, cachedId] of fingerprintCache.entries()) {
        if (cachedId === id) {
            fingerprintCache.delete(fingerprint);
            fingerprintNameCache.delete(fingerprint);
            return fingerprint;
        }
    }
    return null;
};

const updateFingerprintNameByFileId = (fileId, fileName) => {
    const id = normalizeFileId(fileId);
    for (const [fingerprint, cachedId] of fingerprintCache.entries()) {
        if (cachedId === id) {
            if (fileName) fingerprintNameCache.set(fingerprint, fileName);
            return fingerprint;
        }
    }
    return null;
};

const tryCacheFromJsonPath = async (jsonPath, fallbackFileId) => {
    try {
        const raw = await fs.promises.readFile(jsonPath, 'utf-8');
        const content = JSON.parse(raw);
        const fingerprint = content?.fingerprint;
        const fileId = normalizeFileId(content?.fileId || fallbackFileId);
        const fileName = content?.fileName || getFileIdStem(fileId);
        if (fingerprint && fileId) {
            setFingerprintCacheEntry(fingerprint, fileId, fileName);
        }
    } catch (e) {
        logWarn('Fingerprint cache update failed', { jsonPath, error: e.message });
    }
};

const updateFingerprintCacheFromTrashId = async (trashId) => {
    const info = parseTrashFolderName(trashId);
    if (!info?.fileId) return;
    const safeId = normalizeFileId(info.fileId);
    if (!safeId) return;
    const translationsDir = await getTranslationsDir();
    const jsonPath = safeJoin(translationsDir, ensureJsonExtension(safeId));
    await tryCacheFromJsonPath(jsonPath, safeId);
};

export async function buildFingerprintCache() {
    const startedAt = performance.now();
    fingerprintCache.clear();
    fingerprintNameCache.clear();
    let translationsDir;
    try {
        translationsDir = await getTranslationsDir();
    } catch (e) {
        logWarn('Fingerprint cache: translations dir not accessible', { error: e.message });
        return;
    }

    let files = [];
    try {
        files = await fs.promises.readdir(translationsDir);
    } catch (e) {
        logWarn('Fingerprint cache: failed to read translations dir', { error: e.message });
        return;
    }

    let jsonFiles = 0;
    let invalidJson = 0;
    let duplicates = 0;

    for (const file of files) {
        if (!file.endsWith('.json') || file.startsWith('.')) continue;
        jsonFiles++;
        const jsonPath = safeJoin(translationsDir, file);
        try {
            const raw = await fs.promises.readFile(jsonPath, 'utf-8');
            const content = JSON.parse(raw);
            const fingerprint = content?.fingerprint;
            if (!fingerprint) continue;
            const fileId = normalizeFileId(content?.fileId || file);
            const fileName = content?.fileName || getFileIdStem(fileId);
            if (!fingerprintCache.has(fingerprint)) {
                setFingerprintCacheEntry(fingerprint, fileId, fileName);
            } else {
                duplicates++;
                logWarn('Fingerprint cache: duplicate fingerprint detected', { fingerprint, fileId });
            }
        } catch (e) {
            invalidJson++;
            logWarn('Fingerprint cache: skip invalid JSON', { file, error: e.message });
        }
    }

    const elapsedMs = Math.round((performance.now() - startedAt) * 100) / 100;
    const metrics = {
        jsonFiles,
        cached: fingerprintCache.size,
        duplicates,
        invalidJson,
        elapsedMs
    };
    logMain('TELEMETRY fingerprintCache init', metrics);
    if (jsonFiles >= 100 && elapsedMs > 50) {
        logWarn('TELEMETRY fingerprintCache over budget', { ...metrics, budgetMs: 50 });
    }
    return metrics;
}

export function getCachedProjectByFingerprint(fingerprint) {
    const fp = typeof fingerprint === 'string' ? fingerprint.trim() : '';
    if (!fp) return null;
    const fileId = fingerprintCache.get(fp);
    if (!fileId) return null;
    return {
        fileId,
        fileName: fingerprintNameCache.get(fp) || getFileIdStem(fileId)
    };
}

export function cacheProjectFingerprint(fingerprint, fileId, fileName) {
    const fp = typeof fingerprint === 'string' ? fingerprint.trim() : '';
    if (!fp) return;
    setFingerprintCacheEntry(fp, fileId, fileName);
}

export function getPendingTranslationWrites() {
    return pendingTranslationWrites;
}

export function setupProjectHandlers(providedLogger, providedMainWindow) {
    logger = providedLogger;
    mainWindow = providedMainWindow;

    if (handlersRegistered) {
        logDebug('IPC handlers for projectHandlers already registered, updating window reference only');
        return;
    }

    // Remove existing handlers to prevent "second handler" error
    const handlers = [
        'open-file-dialog',
        'select-directory-dialog',
        'open-project-dialog',
        'load-groups',
        'save-groups',
        'save-translation',
        'save-project-image',
        'read-project-image',
        'read-project-image-base64',
        'delete-project-image',
        'get-translations',
        'load-translation',
        'delete-translation',
        'get-trash-contents',
        'restore-trash-item',
        'delete-trash-item-permanently',
        'restore-all-trash-items',
        'empty-trash',
        'rename-translation',
        'consolidate-library',
        'read-pdf-file',
        'save-original-pdf-buffer',
        'copy-original-pdf',
        'get-original-pdf-path'
    ];
    handlers.forEach(h => ipcMain.removeHandler(h));
    ipcMain.removeAllListeners('save-translation-requested');

    // Listen to sequencer events for UI feedback
    writeSequencer.removeAllListeners('blocked');
    writeSequencer.removeAllListeners('unblocked');

    writeSequencer.on('blocked', (id) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('save-blocked', { fileId: id });
        }
    });

    writeSequencer.on('unblocked', (id) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('save-unblocked', { fileId: id });
        }
    });

    handlersRegistered = true;

    ipcMain.handle('open-file-dialog', async () => {
        const startedAt = Date.now();
        logMain('IPC open-file-dialog: apertura dialog');
        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (result.canceled || result.filePaths.length === 0) {
            logMain('IPC open-file-dialog: annullato', { elapsedMs: Date.now() - startedAt });
            return null;
        }
        logMain('IPC open-file-dialog: selezionato', result.filePaths[0], { elapsedMs: Date.now() - startedAt });
        lastUserSelectedPdfPath = result.filePaths[0];
        return result.filePaths[0];
    });

    ipcMain.handle('select-directory-dialog', async () => {
        const startedAt = Date.now();
        logMain('IPC select-directory-dialog: apertura dialog');
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory', 'createDirectory']
        });

        if (result.canceled || result.filePaths.length === 0) {
            logMain('IPC select-directory-dialog: annullato', { elapsedMs: Date.now() - startedAt });
            return null;
        }
        logMain('IPC select-directory-dialog: selezionato', result.filePaths[0], { elapsedMs: Date.now() - startedAt });
        return result.filePaths[0];
    });

    ipcMain.handle('open-project-dialog', async () => {
        const startedAt = Date.now();
        const translationsDir = await getTranslationsDir();
        logMain('IPC open-project-dialog: apertura dialog', { defaultPath: translationsDir });
        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            defaultPath: translationsDir,
            filters: [{ name: 'Project Files', extensions: ['json'] }]
        });
        if (result.canceled || result.filePaths.length === 0) {
            logMain('IPC open-project-dialog: annullato', { elapsedMs: Date.now() - startedAt });
            return null;
        }
        const selectedPath = result.filePaths[0];
        let fileId = path.basename(selectedPath);
        try {
            fileId = requireUuidV4FileId(fileId);
        } catch {
            logMain('IPC open-project-dialog: fileId non UUID, rifiutato', { selectedPath, elapsedMs: Date.now() - startedAt });
            try {
                const message = 'Questo file progetto usa un ID legacy (non-UUID) e non è più supportato.';
                const detail = `File selezionato: ${selectedPath}`;
                if (mainWindow) {
                    await dialog.showMessageBox(mainWindow, { type: 'error', buttons: ['OK'], defaultId: 0, title: 'File progetto non supportato', message, detail });
                } else {
                    await dialog.showMessageBox({ type: 'error', buttons: ['OK'], defaultId: 0, title: 'File progetto non supportato', message, detail });
                }
            } catch { }
            return null;
        }
        const selectedDir = path.dirname(selectedPath);
        if (selectedDir !== translationsDir) {
            const localPath = path.join(translationsDir, ensureJsonExtension(fileId));
            try {
                await fs.promises.access(localPath);
                logMain('IPC open-project-dialog: file fuori directory, uso locale', { selectedPath, localPath, elapsedMs: Date.now() - startedAt });
                return fileId;
            } catch {
                logMain('IPC open-project-dialog: file non nella directory progetti', { selectedPath, elapsedMs: Date.now() - startedAt });
                return null;
            }
        }
        logMain('IPC open-project-dialog: selezionato', { fileId, elapsedMs: Date.now() - startedAt });
        activeProjectId = fileId; // SET SESSION LOCK
        return fileId;
    });

    ipcMain.handle('load-groups', async () => {
        const cid = `get_grp_${Math.random().toString(36).slice(2, 7)}`;
        try {
            const startedAt = Date.now();
            const userDataPath = app.getPath('userData');
            const groupsPath = path.join(userDataPath, 'groups.json');
            logMain(`[${cid}] IPC load-groups`, { path: groupsPath });

            let raw;
            try {
                raw = await fs.promises.readFile(groupsPath, 'utf-8');
            } catch {
                logMain(`[${cid}] Groups file not found, returning empty array`, { elapsedMs: Date.now() - startedAt });
                return [];
            }

            checkSize(raw, MAX_JSON_SIZE, 'Groups File');
            let data = [];
            try {
                data = JSON.parse(raw);
                try {
                    validateGroups(data);
                } catch (valErr) {
                    logWarn(`[${cid}] Groups validation failed, attempting recovery`, { error: valErr.message });
                    if (Array.isArray(data)) {
                        const validGroups = data.filter(g => g && typeof g === 'object' && g.id && g.name);
                        if (validGroups.length > 0) {
                            logMain(`[${cid}] Recovered ${validGroups.length} valid groups from corrupted file`);
                            data = validGroups;
                        } else {
                            throw valErr;
                        }
                    } else {
                        throw valErr;
                    }
                }
            } catch (e) {
                logWarn(`[${cid}] Groups JSON parse/validate failed, performing reset`, { error: e.message });
                try {
                    const backupPath = `${groupsPath}.corrupted_${Date.now()}`;
                    await fs.promises.rename(groupsPath, backupPath);
                    logMain(`[${cid}] Corrupted groups file backed up to`, { backupPath });
                    await safeWriteFile(groupsPath, '[]');
                    logMain(`[${cid}] Groups file reset to empty array`);
                } catch (resetErr) {
                    logError(`[${cid}] Failed to reset corrupted groups file`, { error: resetErr.message });
                }
                return [];
            }
            logMain(`[${cid}] Groups loaded`, { count: data.length, elapsedMs: Date.now() - startedAt });
            return data;
        } catch (e) {
            logError(`[${cid}] Load groups failed`, { error: e.message });
            return [];
        }
    });

    ipcMain.handle('save-groups', async (event, groups) => {
        const cid = `grp_${Math.random().toString(36).slice(2, 7)}`;
        try {
            const startedAt = Date.now();
            const userDataPath = app.getPath('userData');
            const groupsPath = path.join(userDataPath, 'groups.json');
            logMain(`[${cid}] IPC save-groups`, { path: groupsPath, count: Array.isArray(groups) ? groups.length : 0 });

            validateGroups(groups);
            checkSize(groups, MAX_JSON_SIZE, 'Groups');

            await safeWriteFile(groupsPath, JSON.stringify(groups, null, 2));
            logMain(`[${cid}] Groups saved successfully`, { elapsedMs: Date.now() - startedAt });
            return { success: true };
        } catch (e) {
            logError(`[${cid}] Save groups failed`, { error: e.message });
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('block-save', (event, fileId) => {
        try {
            const safeId = requireUuidV4FileId(fileId);
            writeSequencer.block(safeId);
            return { success: true };
        } catch (e) {
            return { success: false, error: e?.message || String(e) };
        }
    });

    ipcMain.handle('unblock-save', (event, fileId) => {
        try {
            const safeId = requireUuidV4FileId(fileId);
            writeSequencer.unblock(safeId);
            return { success: true };
        } catch (e) {
            return { success: false, error: e?.message || String(e) };
        }
    });

    ipcMain.handle('save-translation', async (event, { fileId, data, correlationId, revision }) => {
        const cid = correlationId || `cid_${Math.random().toString(36).slice(2, 7)}`;
        if (!fileId) {
            logError(`[${cid}] IPC save-translation: fileId mancante nel payload`);
            return { success: false, error: 'fileId mancante' };
        }

        try {
            fileId = requireUuidV4FileId(fileId);
        } catch (e) {
            return { success: false, error: e?.message || String(e) };
        }

        try {
            checkSize(data, MAX_JSON_SIZE, 'Translation Data');
            // DEBUG LOG: Track incoming payload size
            logMain(`[${cid}] IPC save-translation: START`, {
                fileId,
                incomingKeys: Object.keys(data || {}),
                incomingTranslationsCount: data?.translations ? Object.keys(data.translations).length : 0,
                incomingTranslationsMetaCount: data?.translationsMeta ? Object.keys(data.translationsMeta).length : 0
            });
        } catch (e) {
            logError(`[${cid}] Save translation failed: size limit exceeded`, { fileId, error: e.message });
            return { success: false, error: e.message };
        }

        const revCheck = revisionGuard.checkAndUpdate(fileId, revision);
        const rev = revCheck.revision;
        if (revCheck.skip) {
            logWarn(`[${cid}] Stale save skipped (revision)`, { fileId, revision: revCheck.revision, highestSeen: revCheck.highestSeen });
            return { success: true, skipped: true, reason: 'stale_revision', highestSeen: revCheck.highestSeen };
        }

        let priority = 'BACKGROUND';
        if (correlationId) {
            if (correlationId.startsWith('critical_')) priority = 'CRITICAL';
            else if (correlationId.startsWith('batch_')) priority = 'BATCH';
            else if (correlationId.startsWith('debounced_')) priority = 'BACKGROUND';
        }

        // ZOMBIE GUARD: Prevent writes from inactive sessions
        if (activeProjectId && fileId !== activeProjectId) {
            logWarn(`[WriteGuard] Bloccato salvataggio obsoleto per ${fileId}. Progetto attivo: ${activeProjectId}`);
            return { success: false, error: 'ZOMBIE_WRITE_PREVENTED', reason: 'Project is no longer active' };
        }

        return writeSequencer.enqueue(fileId, async (op) => {
            pendingTranslationWrites += 1;
            lastTranslationWriteStartedAt = Date.now();
            try {
                const operationId = op?.operationId || 'unknown';
                const startedAt = Date.now();
                const timings = {};
                const logPhase = (phase, meta = {}) => {
                    const elapsedMs = Date.now() - startedAt;
                    logMain(`[SaveTranslation] [${operationId}] [${fileId}] ${phase}`, { elapsedMs, ...meta });
                };
                const translationsDir = await getTranslationsDir();
                const filePath = path.join(translationsDir, ensureJsonExtension(fileId));
                let existing = {};
                logPhase('START', { priority, cid, filePath, incomingKeys: Object.keys(data || {}) });

                try {
                    const t0 = Date.now();
                    const content = await fs.promises.readFile(filePath, 'utf-8');
                    timings.readMs = Date.now() - t0;
                    logPhase('FILE_READ', { bytesRead: Buffer.byteLength(content, 'utf-8'), readMs: timings.readMs });
                    try {
                        const t1 = Date.now();
                        existing = JSON.parse(content) || {};
                        timings.parseMs = Date.now() - t1;
                        logPhase('JSON_PARSED', { parseMs: timings.parseMs });
                    } catch (parseError) {
                        logError(`[${cid}] JSON parse failed for translation file, rotating backups of corrupted file`, { filePath, error: parseError.message });
                        logPhase('JSON_PARSE_FAILED', { error: parseError.message });
                        try {
                            for (let i = 3; i > 1; i--) {
                                const oldBak = `${filePath}.corrupted_${i - 1}`;
                                const newBak = `${filePath}.corrupted_${i}`;
                                try {
                                    await fs.promises.access(oldBak);
                                    await fs.promises.rename(oldBak, newBak);
                                } catch (e) { }
                            }
                            await fs.promises.rename(filePath, `${filePath}.corrupted_1`);
                            logPhase('CORRUPTED_ROTATED');
                        } catch (backupError) {
                            logError(`[${cid}] Backup rotation failed`, { error: backupError.message });
                            logPhase('CORRUPTED_ROTATION_FAILED', { error: backupError.message });
                        }
                        existing = {};
                    }
                } catch (readErr) {
                    if (readErr.code === 'ENOENT') {
                        // File doesn't exist, start fresh
                        existing = {};
                        logPhase('FILE_MISSING_START_FRESH');
                    } else {
                        // CRITICAL FIX: If read fails for other reasons (lock, permission, busy), ABORT SAVE.
                        // Do NOT default to empty object, as this would overwrite data with partial content.
                        logError(`[${cid}] CRITICAL: Read failed during save. Aborting to prevent data loss.`, { error: readErr.message });
                        logPhase('FILE_READ_FAILED_ABORT', { error: readErr.message });
                        throw readErr;
                    }
                }

                const tMerge = Date.now();
                const merged = mergeProjectData(existing, data);
                timings.mergeMs = Date.now() - tMerge;
                logPhase('DATA_MERGED', { mergeMs: timings.mergeMs });
                merged.formatVersion = PROJECT_FORMAT_VERSION;

                try {
                    const tVal = Date.now();
                    validateProjectData(merged);
                    timings.validateMs = Date.now() - tVal;
                    logPhase('VALIDATED', { validateMs: timings.validateMs });
                } catch (validationError) {
                    logError(`[${cid}] Merged project data validation failed`, { fileId, error: validationError.message });
                    logPhase('VALIDATION_FAILED', { error: validationError.message });
                    throw validationError;
                }

                const requestedId = ensureJsonExtension(fileId);
                const incomingId = typeof data?.fileId === 'string' ? ensureJsonExtension(data.fileId) : '';

                if (incomingId && incomingId !== requestedId) {
                    logWarn(`[${cid}] ID Mismatch critico rilevato! Payload fileId=${incomingId}, richiesta=${requestedId}. Rifiuto salvataggio per prevenire corruzione.`);
                    inconsistencyTracker.idMismatches++;
                    logPhase('ID_MISMATCH_ABORT', { receivedId: incomingId, expectedId: requestedId });
                    return { success: false, error: 'ID_MISMATCH', expectedId: requestedId };
                }

                merged.fileId = requestedId;

                try {
                    const expectedAssetsDir = await projectAssetsDirFromFileId(merged.fileId, false);
                    const expectedOriginalPdf = path.resolve(path.join(expectedAssetsDir, 'original.pdf'));
                    const assetsRootDir = await getAssetsRootDir();
                    const resolveMaybeRelative = (p) => {
                        if (!p) return '';
                        const s = String(p);
                        if (path.isAbsolute(s)) return path.resolve(s);
                        const baseDir = path.dirname(translationsDir);
                        return path.resolve(baseDir, s);
                    };

                    const currentOriginalAbs = resolveMaybeRelative(merged?.originalFilePath);
                    const expectedExists = await fileExists(expectedOriginalPdf);

                    if (expectedExists) {
                        if (currentOriginalAbs !== expectedOriginalPdf) merged.originalFilePath = expectedOriginalPdf;
                    } else {
                        const foundInExpected = await findOriginalPdfInAssetsDir(expectedAssetsDir);
                        if (foundInExpected) {
                            const foundAbs = path.resolve(foundInExpected);
                            if (foundAbs !== expectedOriginalPdf && !await fileExists(expectedOriginalPdf)) {
                                try {
                                    await fs.promises.mkdir(path.dirname(expectedOriginalPdf), { recursive: true });
                                    await moveFileCrossDevice(foundAbs, expectedOriginalPdf);
                                    merged.originalFilePath = expectedOriginalPdf;
                                } catch (e) {
                                    merged.originalFilePath = foundAbs;
                                }
                            } else {
                                merged.originalFilePath = expectedOriginalPdf;
                            }
                        } else if (currentOriginalAbs && await fileExists(currentOriginalAbs)) {
                            if (isPathInside(currentOriginalAbs, expectedAssetsDir)) {
                                merged.originalFilePath = currentOriginalAbs;
                            } else if (isPathInside(currentOriginalAbs, assetsRootDir)) {
                                try {
                                    await fs.promises.mkdir(path.dirname(expectedOriginalPdf), { recursive: true });
                                    await moveFileCrossDevice(currentOriginalAbs, expectedOriginalPdf);
                                    merged.originalFilePath = expectedOriginalPdf;
                                } catch {
                                    merged.originalFilePath = currentOriginalAbs;
                                }
                            }
                        }
                    }
                } catch (e) {
                    logWarn(`[${cid}] Coerenza originalFilePath: controllo fallito`, { fileId, error: e?.message || String(e) });
                }

                logMain(`[${cid}] IPC save-translation`, {
                    operationId,
                    filePath,
                    fileName: merged?.fileName,
                    lastPage: merged?.lastPage,
                    totalPages: merged?.totalPages,
                    translationsCount: merged?.translations ? Object.keys(merged.translations).length : 0
                });
                const tStr = Date.now();
                const payload = JSON.stringify(merged);
                timings.stringifyMs = Date.now() - tStr;
                logPhase('JSON_STRINGIFIED', { stringifyMs: timings.stringifyMs });

                // SAFETY CHECK: Integrity Check (Fix 316 bytes issue)
                const payloadSize = Buffer.byteLength(payload);
                const translationsCount = merged.translations ? Object.keys(merged.translations).length : 0;

                // A project with >0 translations should definitely be larger than ~350 bytes (which is empty metadata)
                if (translationsCount > 0 && payloadSize < 500) {
                    logError(`[${cid}] CRITICAL INTEGRITY CHECK FAILED: Payload too small (${payloadSize} bytes) for ${translationsCount} translations. Aborting save.`);
                    logPhase('INTEGRITY_CHECK_FAILED_ABORT', { payloadSize, translationsCount });
                    return { success: false, error: 'INTEGRITY_CHECK_FAILED: Possible data corruption detected.' };
                }

                const tWrite = Date.now();
                logPhase('ATOMIC_WRITE_START', { bytesToWrite: payloadSize });
                await safeWriteFile(filePath, payload);
                timings.writeMs = Date.now() - tWrite;
                logPhase('ATOMIC_WRITE_COMPLETE', { writeMs: timings.writeMs, bytesWritten: payloadSize });

                if (String(process.env.VALIDATE_WRITE || '').toLowerCase() === 'true') {
                    try {
                        const written = await fs.promises.readFile(filePath, 'utf-8');
                        const writtenBytes = Buffer.byteLength(written, 'utf-8');
                        if (writtenBytes !== payloadSize) {
                            logError(`[SaveTranslation] [${operationId}] [${fileId}] VALIDATION_FAILED: byte mismatch`, { expectedBytes: payloadSize, writtenBytes });
                        } else {
                            logPhase('VALIDATION_SUCCESS', { bytes: writtenBytes });
                        }
                        try {
                            const parsed = JSON.parse(written);
                            validateProjectData(parsed);
                            logPhase('VALIDATION_JSON_OK');
                        } catch (e) {
                            logError(`[SaveTranslation] [${operationId}] [${fileId}] VALIDATION_FAILED: invalid JSON or schema`, { error: e?.message || String(e) });
                        }
                    } catch (e) {
                        logError(`[SaveTranslation] [${operationId}] [${fileId}] VALIDATION_FAILED: readback error`, { error: e?.message || String(e) });
                    }
                }

                logMain(`[${cid}] IPC save-translation: completato`, { operationId, elapsedMs: Date.now() - startedAt, bytes: payloadSize, timings });
                logPhase('SUCCESS');
                return { success: true, revision: rev ?? undefined, operationId };
            } catch (e) {
                logError(`[${cid}] Save failed`, { fileId, error: e.message });
                try {
                    const operationId = op?.operationId || 'unknown';
                    logMain(`[SaveTranslation] [${operationId}] [${fileId}] FAILED`, { error: e?.message || String(e) });
                } catch { }
                return { success: false, error: e.message };
            } finally {
                pendingTranslationWrites = Math.max(0, pendingTranslationWrites - 1);
            }
        }, { priority, coalesce: false, debounceKey: `json_${fileId}` });
    });

    ipcMain.handle('save-project-image', async (event, { fileId, page, kind, dataUrl, buffer, correlationId }) => {
        const cid = correlationId || `cid_${Math.random().toString(36).slice(2, 7)}`;
        if (!fileId) return { success: false, error: 'fileId mancante' };

        try {
            fileId = requireUuidV4FileId(fileId);
        } catch (e) {
            return { success: false, error: e?.message || String(e) };
        }

        // ZOMBIE GUARD: Prevent writes from inactive sessions
        if (activeProjectId && fileId !== activeProjectId) {
            logWarn(`[WriteGuard] Bloccato salvataggio immagine obsoleto per ${fileId}. Progetto attivo: ${activeProjectId}`);
            return { success: false, error: 'ZOMBIE_WRITE_PREVENTED', reason: 'Project is no longer active' };
        }

        return writeSequencer.enqueue(fileId, async (op) => {
            try {
                const startedAt = Date.now();
                const operationId = op?.operationId || 'unknown';
                const assetsDir = await projectAssetsDirFromFileId(fileId);
                const safeKind = String(kind || 'image').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
                const pageNum = Number(page);
                if (!Number.isFinite(pageNum) || pageNum < 1) throw new Error('Numero pagina non valido.');

                let finalBuffer;
                let ext = 'jpg';

                if (buffer) {
                    finalBuffer = Buffer.from(buffer);
                    ext = 'jpg';
                } else if (dataUrl) {
                    const parsed = parseImageDataUrl(dataUrl);
                    finalBuffer = Buffer.from(parsed.base64, 'base64');
                    ext = parsed.ext;
                } else {
                    throw new Error('Nessun dato immagine fornito (né dataUrl né buffer).');
                }

                checkSize(finalBuffer, MAX_IMAGE_SIZE, 'Project Image');

                const fileName = `${safeKind}-p${pageNum}.${ext}`;
                const absPath = path.join(assetsDir, fileName);
                await safeWriteFile(absPath, finalBuffer);

                logMain(`[${cid}] IPC save-project-image`, { operationId, fileId, page: pageNum, kind: safeKind, fileName, elapsedMs: Date.now() - startedAt });
                return { success: true, relPath: fileName, operationId };
            } catch (e) {
                logError(`[${cid}] IPC save-project-image: fallito`, { fileId, error: e.message });
                return { success: false, error: e?.message || String(e) };
            }
        }, { priority: 'NORMAL', debounceKey: `img_${fileId}_${page}_${kind || 'image'}` });
    });

    ipcMain.handle('read-project-image', async (event, { fileId, relPath }) => {
        try {
            fileId = requireUuidV4FileId(fileId);
            const assetsDir = await projectAssetsDirFromFileId(fileId, false);
            const absPath = safeJoinAssets(assetsDir, relPath);
            try {
                await fs.promises.access(absPath);
            } catch {
                return { success: false, error: 'File non trovato.' };
            }
            const ext = path.extname(absPath).toLowerCase();
            const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
            const data = await fs.promises.readFile(absPath);
            return { success: true, dataUrl: `data:${mime};base64,${data.toString('base64')}` };
        } catch (e) {
            return { success: false, error: e?.message || String(e) };
        }
    });

    ipcMain.handle('read-project-image-base64', async (event, { fileId, relPath }) => {
        try {
            fileId = requireUuidV4FileId(fileId);
            const assetsDir = await projectAssetsDirFromFileId(fileId, false);
            const absPath = safeJoinAssets(assetsDir, relPath);
            try {
                await fs.promises.access(absPath);
            } catch {
                return { success: false, error: 'File non trovato.' };
            }
            const data = await fs.promises.readFile(absPath);
            return { success: true, base64: data.toString('base64') };
        } catch (e) {
            return { success: false, error: e?.message || String(e) };
        }
    });

    ipcMain.handle('delete-project-image', async (event, { fileId, relPath }) => {
        try {
            fileId = requireUuidV4FileId(fileId);
            const assetsDir = await projectAssetsDirFromFileId(fileId, false);
            const absPath = safeJoinAssets(assetsDir, relPath);
            try {
                await fs.promises.access(absPath);
                await fs.promises.unlink(absPath);
                return { success: true };
            } catch {
                return { success: false, error: 'File non trovato.' };
            }
        } catch (e) {
            return { success: false, error: e?.message || String(e) };
        }
    });

    ipcMain.handle('get-translations', async () => {
        try {
            const startedAt = Date.now();
            const translationsDir = await getTranslationsDir();
            try {
                await fs.promises.access(translationsDir, fs.constants.R_OK);
            } catch {
                return [];
            }
            const files = (await fs.promises.readdir(translationsDir)).filter(f => f.endsWith('.json') && f !== 'undefined.json');
            const filteredResult = [];

            for (const fileName of files) {
                try {
                    let fileId = normalizeProjectFileId(fileName);
                    if (!fileId) continue;

                    if (!isUuidV4FileId(fileId)) {
                        const oldFileId = fileId;
                        const oldPath = path.join(translationsDir, oldFileId);

                        let oldContent = {};
                        try {
                            const oldRaw = await fs.promises.readFile(oldPath, 'utf-8');
                            oldContent = normalizeLoadedProjectData(JSON.parse(oldRaw || '{}') || {});
                        } catch {
                            oldContent = {};
                        }

                        const newFileId = ensureJsonExtension(crypto.randomUUID());
                        const newPath = path.join(translationsDir, newFileId);
                        const name = typeof oldContent?.fileName === 'string' ? oldContent.fileName : getFileIdStem(oldFileId);
                        const newInputLanguage = typeof oldContent?.inputLanguage === 'string' ? oldContent.inputLanguage : undefined;

                        const ren = await performRename(oldFileId, newFileId, name, oldPath, newPath, newInputLanguage);
                        if (!ren?.success) {
                            logWarn('Migrazione legacy fileId -> UUID fallita, skip', { oldFileId, error: ren?.error });
                            continue;
                        }
                        fileId = newFileId;
                    }

                    fileId = requireUuidV4FileId(fileId);

                    const filePath = path.join(translationsDir, fileId);
                    const stats = await fs.promises.stat(filePath);

                    let content = {};
                    try {
                        const raw = await fs.promises.readFile(filePath, 'utf-8');
                        if (!raw || raw.trim().length < 2) continue;
                        content = JSON.parse(raw) || {};
                        content = normalizeLoadedProjectData(content);
                    } catch (e) {
                        if (fileId.startsWith('.') || fileId.endsWith('.tmp')) continue;
                        logWarn('JSON parse failed in get-translations, skipping file', { fileId, error: e.message });
                        continue;
                    }

                    if (content.fileId !== fileId) {
                        logWarn(`Allineamento ID richiesto per ${fileId}: l'ID interno era ${content.fileId}. Correggo per coerenza col disco.`);
                        inconsistencyTracker.idMismatches++;
                        content.fileId = fileId;
                        await safeWriteFile(filePath, JSON.stringify(content, null, 2));
                    }

                    let assetsDir;
                    try {
                        assetsDir = await projectAssetsDirFromFileId(fileId, false);
                    } catch (e) {
                        logWarn('get-translations: fileId non valido, salto il file', { fileId, error: e?.message || String(e) });
                        continue;
                    }

                const hasSafePdf = Boolean(await findOriginalPdfInAssetsDir(assetsDir));

                    let thumbnail = undefined;
                    const thumbPath = path.join(assetsDir, 'source-p1.jpg');
                    try {
                        await fs.promises.access(thumbPath);
                        const thumbData = await fs.promises.readFile(thumbPath);
                        thumbnail = `data:image/jpeg;base64,${thumbData.toString('base64')}`;
                    } catch { }

                    filteredResult.push({
                        fileName: content.fileName || fileId,
                        lastPage: content.lastPage,
                        totalPages: content.totalPages,
                        timestamp: stats.mtimeMs,
                        fileId,
                        hasSafePdf,
                        thumbnail,
                        originalFilePath: content.originalFilePath,
                        inputLanguage: content.inputLanguage,
                        groups: content.groups || [],
                        fingerprint: content.fingerprint
                    });
                } catch (e) {
                    logWarn('get-translations: skip file per errore', { fileName, error: e?.message || String(e) });
                }
            }

            filteredResult.sort((a, b) => b.timestamp - a.timestamp);
            logMain('IPC get-translations:', { count: filteredResult.length, dir: translationsDir, elapsedMs: Date.now() - startedAt });
            return filteredResult;
        } catch (e) {
            logError('List failed:', e);
            return [];
        }
    });

    ipcMain.handle('load-translation', async (event, fileId) => {
        try {
            fileId = requireUuidV4FileId(fileId);
            const startedAt = Date.now();
            const translationsDir = await getTranslationsDir();
            const filePath = safeJoin(translationsDir, ensureJsonExtension(fileId));
            logMain('IPC load-translation:', filePath);
            try {
                await fs.promises.access(filePath, fs.constants.R_OK);
            } catch {
                throw new Error('File not found');
            }
            const raw = await fs.promises.readFile(filePath, 'utf-8');
            let data;
            try {
                data = JSON.parse(raw);
            } catch (e) {
                logError('IPC load-translation JSON parse failed', { filePath, error: e.message });
                return null;
            }
            data = normalizeLoadedProjectData(data);

            if (data.fileId && ensureJsonExtension(data.fileId) !== ensureJsonExtension(fileId)) {
                logWarn('IPC load-translation: ID Mismatch detected (Auto-aligning)', { requested: fileId, inContent: data.fileId });
                data.fileId = ensureJsonExtension(fileId);
            }

            activeProjectId = fileId; // SET SESSION LOCK

            const assetsDir = await projectAssetsDirFromFileId(fileId, false);
            let localPdf = await findOriginalPdfInAssetsDir(assetsDir);

            if (!localPdf) {
                const baseDir = path.dirname(translationsDir);
                // CRITICAL FIX: Use simple stem for UUID folders, avoid sanitizeProjectName which might alter UUIDs
                const stem = getFileIdStem(fileId); 
                const altAssetsDir = path.join(baseDir, 'assets', stem);
                localPdf = await findOriginalPdfInAssetsDir(altAssetsDir);
            }

            // AUTO-RECOVERY: Check for orphan folders (e.g. id_pdf) if main asset folder is missing/empty
            if (!localPdf) {
                try {
                    const assetsRoot = await getAssetsRootDir();
                    const expectedDirName = path.basename(assetsDir);

                    // Scan for folders starting with the expected assets folder name (also covers UUID sanitized dirs)
                    const entries = await fs.promises.readdir(assetsRoot, { withFileTypes: true });
                    const candidates = entries
                        .filter(e => e.isDirectory() && e.name.startsWith(expectedDirName) && e.name !== expectedDirName)
                        .map(e => e.name);

                    for (const candidate of candidates) {
                        const candidatePath = path.join(assetsRoot, candidate);
                        const candidatePdf = await findOriginalPdfInAssetsDir(candidatePath);

                        if (candidatePdf) {
                            logWarn(`Orphan Recovery: Found orphan asset folder '${candidate}' for project '${fileId}'. Attempting re-link.`);

                            // Check if the *expected* directory exists
                            let targetExists = false;
                            try { await fs.promises.access(assetsDir); targetExists = true; } catch { }

                            let targetEmpty = false;
                            if (targetExists) {
                                const files = await fs.promises.readdir(assetsDir);
                                targetEmpty = files.length === 0;
                            }

                            if (!targetExists || targetEmpty) {
                                // Scenario A: Target doesn't exist or is empty -> RENAME (Best case)
                                if (targetExists) {
                                    await fs.promises.rmdir(assetsDir);
                                }
                                await fs.promises.rename(candidatePath, assetsDir);
                                logMain(`Orphan Recovery: Successfully renamed '${candidate}' to '${path.basename(assetsDir)}'.`);
                                localPdf = await findOriginalPdfInAssetsDir(assetsDir);
                            } else {
                                // Scenario B: Target exists and has content -> COPY PDF
                                const pdfName = path.basename(candidatePdf);
                                const targetPdfPath = path.join(assetsDir, pdfName);
                                await fs.promises.copyFile(candidatePdf, targetPdfPath);
                                logMain(`Orphan Recovery: Copied PDF from '${candidate}' to '${path.basename(assetsDir)}' (Target not empty).`);
                                localPdf = targetPdfPath;
                            }

                            if (localPdf) break; // Stop after successful recovery
                        }
                    }
                } catch (recoveryErr) {
                    logError('Orphan Recovery failed', { fileId, error: recoveryErr.message });
                }
            }

            if (localPdf) {
                let originalExists = false;
                if (data.originalFilePath) {
                    try {
                        await fs.promises.access(data.originalFilePath);
                        originalExists = true;
                    } catch { }
                }
                if (!originalExists) {
                    logDebug(`Ripristino originalFilePath da asset locali per ${fileId}`);
                    data.originalFilePath = localPdf;
                }
            }

            logMain('IPC load-translation successfully completed', {
                fileName: data?.fileName,
                lastPage: data?.lastPage,
                totalPages: data?.totalPages,
                hasOriginalFilePath: Boolean(data?.originalFilePath),
                translationsCount: data?.translations ? Object.keys(data.translations).length : 0,
                elapsedMs: Date.now() - startedAt
            });
            return data;
        } catch (e) {
            logError('IPC load-translation failed', { error: e.message });
            return null;
        }
    });

    ipcMain.handle('delete-translation', async (event, fileId) => {
        try {
            fileId = requireUuidV4FileId(fileId);
            const startedAt = Date.now();
            const translationsDir = await getTranslationsDir();
            const filePath = safeJoin(translationsDir, ensureJsonExtension(fileId));
            logMain('IPC delete-translation (move to trash):', filePath);

            try {
                await fs.promises.access(filePath);
                const trashDir = await getTrashDir();
                const timestamp = Date.now();
                const trashFolderName = `trash_${timestamp}_${getFileIdStem(fileId)}`;
                const trashFolderPath = safeJoin(trashDir, trashFolderName);

                await fs.promises.mkdir(trashFolderPath, { recursive: true });

                const trashJsonPath = safeJoin(trashFolderPath, ensureJsonExtension(fileId));
                await fs.promises.rename(filePath, trashJsonPath);

                try {
                    const assetsDir = await projectAssetsDirFromFileId(fileId, false);
                    let assetsExist = false;
                    try {
                        await fs.promises.access(assetsDir);
                        assetsExist = true;
                    } catch { }

                    if (assetsExist) {
                        const trashAssetsPath = path.join(trashFolderPath, 'assets');
                        await fs.promises.rename(assetsDir, trashAssetsPath);
                    }
                } catch (e) {
                    logError('Failed to move assets to trash, rolling back JSON move:', e);
                    try {
                        await fs.promises.rename(trashJsonPath, filePath);
                        await fs.promises.rm(trashFolderPath, { recursive: true, force: true });
                    } catch (rollbackErr) {
                        logError('CRITICAL: Rollback failed during delete-translation', rollbackErr);
                    }
                    throw new Error(`Impossibile spostare gli asset nel cestino: ${e.message}`);
                }

                removeFingerprintByFileId(fileId);
                logMain('IPC delete-translation: spostato nel cestino', { elapsedMs: Date.now() - startedAt });
                return { success: true };
            } catch {
                return { success: false, error: 'File not found' };
            }
        } catch (e) {
            logError('Delete (trash) failed:', e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('get-trash-contents', async () => {
        try {
            const trashDir = await getTrashDir();
            try {
                await fs.promises.access(trashDir);
            } catch {
                return [];
            }
            const folders = await fs.promises.readdir(trashDir);
            const results = [];

            const now = Date.now();
            const retentionPeriodMs = 7 * 24 * 60 * 60 * 1000; // 7 giorni

            for (const folder of folders) {
                const trashInfo = parseTrashFolderName(folder);
                if (!trashInfo) continue;

                const { timestamp, fileId, fileIdStem } = trashInfo;
                const folderPath = path.join(trashDir, folder);
                const jsonPath = path.join(folderPath, fileId);

                // Calculate expiration consistently with fileUtils.js
                const msLeft = Math.max(0, retentionPeriodMs - (now - timestamp));
                const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

                try {
                    await fs.promises.access(jsonPath);
                    const content = JSON.parse(await fs.promises.readFile(jsonPath, 'utf-8'));
                    results.push({
                        trashId: folder,
                        fileId: fileId,
                        fileName: content.fileName || fileIdStem,
                        deletedAt: timestamp,
                        daysLeft: daysLeft,
                        originalPath: jsonPath
                    });
                } catch (e) {
                    logDebug('Skipping invalid trash item', { folder, error: e.message });
                }
            }
            return results.sort((a, b) => b.deletedAt - a.deletedAt);
        } catch (e) {
            logError('get-trash-contents failed:', e);
            return [];
        }
    });

    ipcMain.handle('restore-trash-item', async (event, trashId) => {
        try {
            const restoredFileId = await internalRestoreTrashItem(trashId);
            if (restoredFileId) {
                const translationsDir = await getTranslationsDir();
                const jsonPath = safeJoin(translationsDir, restoredFileId);
                await tryCacheFromJsonPath(jsonPath, restoredFileId);
            }
            return { success: true, fileId: restoredFileId };
        } catch (e) {
            logError('restore-trash-item failed', { trashId, error: e.message });
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('delete-trash-item-permanently', async (event, trashId) => {
        try {
            const trashDir = await getTrashDir();
            const folderPath = path.join(trashDir, trashId);
            try {
                await fs.promises.access(folderPath);
                await fs.promises.rm(folderPath, { recursive: true, force: true });
                return { success: true };
            } catch {
                return { success: false, error: 'Elemento non trovato.' };
            }
        } catch (e) {
            logError('delete-trash-item-permanently failed', { trashId, error: e.message });
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('restore-all-trash-items', async () => {
        try {
            const trashDir = await getTrashDir();
            try {
                await fs.promises.access(trashDir);
            } catch {
                return { success: true, count: 0 };
            }
            const folders = await fs.promises.readdir(trashDir);
            let count = 0;
            let errors = [];

            for (const folder of folders) {
                if (!folder.startsWith('trash_')) continue;
                try {
                    const restoredFileId = await internalRestoreTrashItem(folder);
                    if (restoredFileId) {
                        const translationsDir = await getTranslationsDir();
                        const jsonPath = safeJoin(translationsDir, restoredFileId);
                        await tryCacheFromJsonPath(jsonPath, restoredFileId);
                    }
                    count++;
                } catch (e) {
                    errors.push(e.message);
                }
            }
            return { success: true, count, errors: errors.length > 0 ? errors : undefined };
        } catch (e) {
            logError('restore-all-trash-items failed', { error: e.message });
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('empty-trash', async () => {
        try {
            const trashDir = await getTrashDir();
            try {
                await fs.promises.access(trashDir);
                const items = await fs.promises.readdir(trashDir);
                for (const item of items) {
                    if (item.startsWith('trash_')) {
                        await fs.promises.rm(path.join(trashDir, item), { recursive: true, force: true });
                    }
                }
            } catch { }
            return { success: true };
        } catch (e) {
            logError('empty-trash failed', { error: e.message });
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('rename-translation', async (event, { fileId, newFileName, newInputLanguage }) => {
        try {
            const translationsDir = await getTranslationsDir();
            const oldFileId = normalizeProjectFileId(fileId);
            const name = String(newFileName || '').trim();
            if (!oldFileId) return { success: false, error: 'ID progetto mancante.' };
            if (!name) return { success: false, error: 'Nome non valido.' };

            const oldPath = safeJoin(translationsDir, oldFileId);

            // 1. Wait for pending writes
            try {
                await writeSequencer.enqueue(oldFileId, async () => { }, { priority: 'CRITICAL', force: true });
            } catch (seqErr) {
                logWarn('Sequencer wait failed during rename pre-check', { error: seqErr.message });
            }

            // 2. Existence Check
            try {
                await fs.promises.access(oldPath);
            } catch {
                return { success: false, error: 'File progetto non trovato.' };
            }

            // 3. Check for UUID (Stable ID)
            const isStableId = isUuidV4FileId(oldFileId);

            if (isStableId) {
                // CASE A: Stable ID -> Update Metadata Only
                logMain('Safe Rename: ID is stable (UUID). Updating metadata.', { oldFileId, newName: name });
                const content = JSON.parse(await fs.promises.readFile(oldPath, 'utf-8'));
                content.fileName = name;
                if (newInputLanguage) content.inputLanguage = newInputLanguage;

                await safeWriteFile(oldPath, JSON.stringify(content, null, 2));
                updateFingerprintNameByFileId(oldFileId, name);
                return { success: true, newFileId: oldFileId };
            } else {
                // CASE B: Legacy Filename -> Migrate to UUID (and MOVE ASSETS)
                const stableId = ensureJsonExtension(crypto.randomUUID());
                const stablePath = safeJoin(translationsDir, stableId);
                logMain('Legacy Rename: Migrating to Stable UUID + Moving Assets', { oldFileId, stableId, newName: name });

                try {
                    // a. Read Old Content
                    const contentValues = JSON.parse(await fs.promises.readFile(oldPath, 'utf-8'));

                    // b. Identify Paths
                    const oldAssetsDir = await resolveLegacyAssetsDirFromFileId(oldFileId, false);
                    const newAssetsDir = await projectAssetsDirFromFileId(stableId, true); // Create new dir

                    // c. Move Assets
                    // Check if old assets exist
                    let assetsMoved = false;
                    try {
                        await fs.promises.access(oldAssetsDir);
                        // Move content of old assets to new assets
                        const files = await fs.promises.readdir(oldAssetsDir);
                        for (const f of files) {
                            await fs.promises.rename(path.join(oldAssetsDir, f), path.join(newAssetsDir, f));
                        }
                        // Try to remove empty old dir
                        await fs.promises.rmdir(oldAssetsDir).catch(() => { });
                        assetsMoved = true;
                        logMain(`Rename: Assets moved from ${oldAssetsDir} to ${newAssetsDir}`);
                    } catch (assetErr) {
                        logWarn('Rename: No assets found or move failed', { error: assetErr.message });
                    }

                    // d. Prepare New Content
                    contentValues.fileName = name;
                    contentValues.fileId = stableId;
                    if (newInputLanguage) contentValues.inputLanguage = newInputLanguage;

                    // e. Update originalFilePath if it was pointing to old assets
                    if (assetsMoved && contentValues.originalFilePath) {
                        // Simple string replacement if logic matches
                        // CRITICAL FIX: Use getFileIdStem for consistent stem generation during migration
                        const oldStem = getFileIdStem(oldFileId);
                        if (contentValues.originalFilePath.includes(oldAssetsDir) || contentValues.originalFilePath.includes(oldStem)) {
                            const baseName = path.basename(contentValues.originalFilePath);
                            contentValues.originalFilePath = path.join(newAssetsDir, baseName);
                        }
                    } else if (!assetsMoved && contentValues.originalFilePath) {
                        // If assets weren't moved (maybe didn't exist), but we have a path, 
                        // we should try to ensure it points to the new structure if we want to enforce it.
                        // But for now, let's leave external paths alone.
                    }

                    // f. Write New JSON
                    await safeWriteFile(stablePath, JSON.stringify(contentValues, null, 2));

                    // g. Remove Old JSON
                    await fs.promises.unlink(oldPath);

                    removeFingerprintByFileId(oldFileId);
                    if (contentValues?.fingerprint) {
                        setFingerprintCacheEntry(contentValues.fingerprint, stableId, name);
                    }
                    writeSequencer.cancelAll(oldFileId);
                    return { success: true, newFileId: stableId };

                } catch (e) {
                    logError('Legacy Migration Failed', { error: e.message });
                    return { success: false, error: 'Errore migrazione a UUID: ' + e.message };
                }
            }
        } catch (e) {
            logError('Rename failed', { fileId, error: e.message });
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('consolidate-library', async () => {
        try {
            return await performConsolidation();
        } catch (e) {
            logError('Consolidate library failed', { error: e.message });
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('read-pdf-file', async (event, filePath) => {
        try {
            const startedAt = Date.now();
            const resolved = path.resolve(String(filePath || ''));
            logMain('IPC read-pdf-file:', resolved);

            if (path.extname(resolved).toLowerCase() !== '.pdf') {
                throw new Error('Formato non consentito.');
            }

            const assetsRoot = path.resolve(await getAssetsRootDir());
            const isUnderAssets = isPathInside(assetsRoot, resolved);
            const lastSelected = lastUserSelectedPdfPath ? path.resolve(String(lastUserSelectedPdfPath || '')) : null;
            const isLastUserSelection = Boolean(lastSelected && lastSelected === resolved);

            if (!isUnderAssets && !isLastUserSelection) {
                logError('Access Denied Details', { 
                     resolved, 
                     assetsRoot, 
                     isUnderAssets, 
                     lastSelected, 
                     isLastUserSelection 
                 });
                throw new Error('Accesso negato.');
            }

            try {
                await fs.promises.access(resolved);
                const buf = await fs.promises.readFile(resolved);
                logMain('IPC read-pdf-file: completato', { bytes: buf.byteLength, elapsedMs: Date.now() - startedAt });
                return buf;
            } catch {
                throw new Error('File not found');
            }
        } catch (e) {
            logError('Read PDF failed', { filePath, error: e.message });
            throw e;
        }
    });

    ipcMain.handle('set-display-name', async (event, { fileId, displayName, inputLanguage }) => {
        try {
            const translationsDir = await getTranslationsDir();
            const id = requireUuidV4FileId(fileId);
            const name = String(displayName || '').trim();
            if (!name) return { success: false, error: 'Nome non valido.' };

            const pathOnDisk = safeJoin(translationsDir, id);
            try {
                await fs.promises.access(pathOnDisk);
            } catch {
                return { success: false, error: 'File non trovato.' };
            }

            // Aggiorna solo i metadati interni senza rinominare ID o asset
            const contentRaw = await fs.promises.readFile(pathOnDisk, 'utf-8');
            let content = {};
            try {
                content = JSON.parse(contentRaw) || {};
            } catch (e) {
                logWarn('IPC set-display-name: JSON non valido', { fileId: id, error: e.message });
                return { success: false, error: 'File progetto non valido.' };
            }
            content.fileName = name;
            if (typeof inputLanguage === 'string' && inputLanguage.trim()) {
                content.inputLanguage = inputLanguage.trim();
            }
            await safeWriteFile(pathOnDisk, JSON.stringify(content, null, 2));
            updateFingerprintNameByFileId(id, name);
            logMain('IPC set-display-name: aggiornato nome visualizzato', { fileId: id, name });
            return { success: true, fileId: id, fileName: name };
        } catch (e) {
            logError('set-display-name failed', { fileId, displayName, error: e.message });
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('init-project-shell', async (event, { fileId, fileName, inputLanguage, groups }) => {
        const cid = `init_${Math.random().toString(36).slice(2, 7)}`;
        try {
            const id = requireUuidV4FileId(fileId);

            activeProjectId = id;

            const translationsDir = await getTranslationsDir();
            return writeSequencer.enqueue(id, async (op) => {
                const operationId = op?.operationId || 'unknown';
                const jsonPath = safeJoin(translationsDir, id);
                const assetsDir = await projectAssetsDirFromFileId(id);
                await fs.promises.mkdir(assetsDir, { recursive: true });

                let existing = null;
                try {
                    const raw = await fs.promises.readFile(jsonPath, 'utf-8');
                    existing = JSON.parse(raw);
                } catch { }

                const now = Date.now();
                const next = (existing && typeof existing === 'object') ? existing : {};
                next.id = getFileIdStem(id);
                next.fileId = id;
                next.createdAt = typeof next.createdAt === 'number' ? next.createdAt : now;
                next.updatedAt = now;
                next.translations = next.translations && typeof next.translations === 'object' ? next.translations : {};
                next.metadata = next.metadata && typeof next.metadata === 'object' ? next.metadata : { totalPages: 0 };

                const name = String(fileName || '').trim();
                if (name) next.fileName = name;
                if (!next.fileName) next.fileName = getFileIdStem(id);

                if (typeof inputLanguage === 'string' && inputLanguage.trim()) {
                    next.inputLanguage = inputLanguage.trim();
                }
                if (Array.isArray(groups)) {
                    next.groups = groups;
                }

                await safeWriteFile(jsonPath, JSON.stringify(next, null, 2));
                logMain(`[${cid}] IPC init-project-shell: completato`, { operationId, fileId: id });
                return { success: true, fileId: id, operationId };
            }, { priority: 'CRITICAL', debounceKey: `init_${id}` });
        } catch (e) {
            logError(`[${cid}] init-project-shell failed`, { fileId, fileName, error: e.message });
            return { success: false, error: e?.message || String(e) };
        }
    });

    ipcMain.handle('save-original-pdf-buffer', async (event, { fileId: requestedFileId, buffer, fileName }) => {
        const cid = `pdf_save_${Math.random().toString(36).slice(2, 7)}`;
        try {
            const startedAt = Date.now();
            if (!buffer) throw new Error('Buffer mancante.');

            const id = requireUuidV4FileId(requestedFileId);

            activeProjectId = id;

            logMain(`[${cid}] IPC save-original-pdf-buffer: richiesta ricevuta`, { requestedFileId: id, bytes: buffer.length });

            // 1. Calculate Fingerprint (CAS)
            const fingerprint = await calculateFileHash(buffer);
            logMain(`[${cid}] Fingerprint calcolato: ${fingerprint}`);

            const cachedFileId = fingerprintCache.get(fingerprint);
            if (cachedFileId) {
                const cachedName = fingerprintNameCache.get(fingerprint) || getFileIdStem(cachedFileId);
                logMain(`[${cid}] DUPLICATO RILEVATO. Restituisco progetto esistente: ${cachedFileId}`);
                activeProjectId = cachedFileId;
                return {
                    success: true,
                    fileId: cachedFileId,
                    isDuplicate: true,
                    fileName: cachedName
                };
            }

            const translationsDir = await getTranslationsDir();
            return writeSequencer.enqueue(id, async (op) => {
                const operationId = op?.operationId || 'unknown';
                logMain(`[${cid}] Sequencer: avvio scrittura PDF`, { operationId, fileId: id });
                try {
                    // 4. Create Strict Asset Structure: assets/{UUID}/original.pdf
                    const assetsDir = await projectAssetsDirFromFileId(id);
                    const targetPdfPath = path.join(assetsDir, 'original.pdf');

                    await fs.promises.mkdir(assetsDir, { recursive: true });

                    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
                    await safeWriteFile(targetPdfPath, buf);

                    // 5. Initialize/Update JSON Project File
                    const jsonPath = safeJoin(translationsDir, id);
                    let existing = {};
                    try {
                        const raw = await fs.promises.readFile(jsonPath, 'utf-8');
                        existing = JSON.parse(raw) || {};
                    } catch { }

                    const name = String(fileName || '').trim();
                    const now = Date.now();
                    const next = (existing && typeof existing === 'object') ? existing : {};
                    next.id = getFileIdStem(id);
                    next.fileId = id;
                    next.fileName = name || next.fileName || getFileIdStem(id);
                    next.originalFilePath = targetPdfPath;
                    next.fingerprint = fingerprint;
                    next.createdAt = typeof next.createdAt === 'number' ? next.createdAt : now;
                    next.updatedAt = now;
                    next.translations = next.translations && typeof next.translations === 'object' ? next.translations : {};
                    next.metadata = next.metadata && typeof next.metadata === 'object' ? next.metadata : { totalPages: 0 };

                    await safeWriteFile(jsonPath, JSON.stringify(next, null, 2));
                    setFingerprintCacheEntry(fingerprint, id, next.fileName);

                    logMain(`[${cid}] Sequencer: scrittura PDF e JSON completata`, { operationId, fileId: id, target: targetPdfPath, elapsedMs: Date.now() - startedAt });
                    return { success: true, fileId: id, path: targetPdfPath, operationId };
                } catch (writeErr) {
                    logError(`[${cid}] Sequencer: errore scrittura PDF`, { fileId: id, error: writeErr.message });
                    throw writeErr;
                }
            }, { priority: 'CRITICAL', debounceKey: `pdf_${id}` });
        } catch (e) {
            logWarn(`[${cid}] IPC save-original-pdf-buffer failed`, {
                requestedFileId,
                error: e.message
            });
            return { success: false, error: e?.message || String(e) };
        }
    });

    ipcMain.handle('copy-original-pdf', async (event, { fileId, sourcePath, fileName }) => {
        const cid = `pdf_copy_${Math.random().toString(36).slice(2, 7)}`;
        try {
            const startedAt = Date.now();
            const id = requireUuidV4FileId(fileId);

            activeProjectId = id;
            logMain(`[${cid}] IPC copy-original-pdf: richiesta ricevuta`, { fileId: id, sourcePath });

            return writeSequencer.enqueue(id, async (op) => {
                const operationId = op?.operationId || 'unknown';
                logMain(`[${cid}] Sequencer: avvio copia PDF`, { operationId, fileId: id });
                try {
                    const assetsDir = await projectAssetsDirFromFileId(id);
                    const ext = (path.extname(sourcePath).toLowerCase() || '.pdf');
                    const target = path.join(assetsDir, `original${ext}`);
                    await fs.promises.mkdir(assetsDir, { recursive: true });

                    await withFileLock(target, async () => {
                        const tmpTarget = `${target}.tmp`;
                        await fs.promises.copyFile(sourcePath, tmpTarget);
                        await fs.promises.rename(tmpTarget, target);
                    });

                    const translationsDir = await getTranslationsDir();
                    const jsonPath = safeJoin(translationsDir, id);
                    let existing = {};
                    try {
                        const raw = await fs.promises.readFile(jsonPath, 'utf-8');
                        existing = JSON.parse(raw) || {};
                    } catch { }

                    const name = String(fileName || '').trim();
                    const now = Date.now();
                    const next = (existing && typeof existing === 'object') ? existing : {};
                    next.id = getFileIdStem(id);
                    next.fileId = id;
                    next.fileName = name || next.fileName || getFileIdStem(id);
                    next.originalFilePath = target;
                    next.createdAt = typeof next.createdAt === 'number' ? next.createdAt : now;
                    next.updatedAt = now;
                    next.translations = next.translations && typeof next.translations === 'object' ? next.translations : {};
                    next.metadata = next.metadata && typeof next.metadata === 'object' ? next.metadata : { totalPages: 0 };

                    await safeWriteFile(jsonPath, JSON.stringify(next, null, 2));
                    logMain(`[${cid}] Sequencer: copia PDF completata`, { operationId, fileId: id, sourcePath, target, elapsedMs: Date.now() - startedAt });
                    return { success: true, fileId: id, path: target, operationId };
                } catch (copyErr) {
                    logError(`[${cid}] Sequencer: errore copia PDF`, { fileId: id, error: copyErr.message });
                    throw copyErr;
                }
            }, { priority: 'CRITICAL', debounceKey: `pdf_${id}` });
        } catch (e) {
            logWarn(`[${cid}] IPC copy-original-pdf failed`, {
                fileId,
                sourcePath,
                error: e.message
            });
            return { success: false, error: e?.message || String(e) };
        }
    });

    ipcMain.handle('get-original-pdf-path', async (event, fileId) => {
        try {
            const id = requireUuidV4FileId(fileId);
            const assetsDir = await projectAssetsDirFromFileId(id);
            const p = await findOriginalPdfInAssetsDir(assetsDir);
            if (p) return { success: true, path: p };
            return { success: false, error: 'File non trovato.' };
        } catch (e) {
            return { success: false, error: e?.message || String(e) };
        }
    });

    ipcMain.handle('export-original-pdf', async (event, fileId) => {
        try {
            const id = requireUuidV4FileId(fileId);
            const assetsDir = await projectAssetsDirFromFileId(id);
            const originalPath = await findOriginalPdfInAssetsDir(assetsDir);
            
            if (!originalPath || !(await fileExists(originalPath))) {
                return { success: false, error: 'File PDF originale non trovato.' };
            }

            const { canceled, filePath } = await dialog.showSaveDialog(mainWindow || undefined, {
                title: 'Esporta PDF originale',
                defaultPath: path.basename(originalPath),
                filters: [{ name: 'PDF', extensions: ['pdf'] }]
            });

            if (canceled || !filePath) return { canceled: true };

            await fs.promises.copyFile(originalPath, filePath);
            return { success: true, path: filePath };
        } catch (e) {
            logError('Export Original PDF failed', { fileId, error: e.message });
            return { success: false, error: e.message };
        }
    });

    ipcMain.on('save-translation-requested', (event, payload) => {
        lastTranslationSaveRequestedAt = Date.now();
        const fileId = payload && typeof payload === 'object' ? payload.fileId : undefined;
        if (fileId) logMain('IPC save-translation: richiesta', { fileId });
    });
}
