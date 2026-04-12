import { app, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { createLogger } from './logger.js';
import { inconsistencyTracker } from './state.js';
import { retry } from './mainUtils.js';
import { getFileIdStem, ensureJsonExtension, normalizeProjectFileId, parseTrashFolderName, requireUuidV4FileId, sanitizeProjectName } from './idUtils.js';

const logger = createLogger({ module: 'FILE-UTILS', toFile: true });
const logMain = (msg, meta) => logger.info(String(msg), meta);
const logDebug = (msg, meta) => logger.debug(String(msg), meta);
const logWarn = (msg, meta) => logger.warn(String(msg), meta);
const logError = (msg, meta) => logger.error(String(msg), meta);

// Cache locale dei settings per determinare i path, sincronizzata da main.js
let localCachedSettings = null;
let runtimeBaseDirOverride = null;
let customPathDialogShown = false;

export function setFileUtilSettings(settings) {
    localCachedSettings = settings;
}

export function clearRuntimeBaseDirOverride() {
    runtimeBaseDirOverride = null;
}

const ensureWritableDir = async (dirPath) => {
    const p = String(dirPath || '').trim();
    if (!p) throw new Error('Percorso cartella non valido');
    await fs.promises.mkdir(p, { recursive: true });
    await fs.promises.access(p, fs.constants.W_OK);
};

const resolveProjectsBaseDir = async ({ interactive = true } = {}) => {
    const defaultBase = app.getPath('userData');
    if (runtimeBaseDirOverride) return runtimeBaseDirOverride;

    const custom = localCachedSettings?.customProjectsPath ? String(localCachedSettings.customProjectsPath).trim() : '';
    if (!custom) return defaultBase;

    try {
        await ensureWritableDir(custom);
        return custom;
    } catch (e) {
        if (interactive && !customPathDialogShown) {
            customPathDialogShown = true;
            const parent = BrowserWindow.getFocusedWindow() || undefined;
            const res = parent
                ? await dialog.showMessageBox(parent, {
                    type: 'error',
                    buttons: ['Usa Default', 'Annulla'],
                    defaultId: 0,
                    cancelId: 1,
                    title: 'Cartella Progetti non disponibile',
                    message: 'Non riesco a scrivere nella cartella progetti personalizzata.',
                    detail: `Percorso: ${custom}\n\nPossibili cause: disco scollegato o permessi insufficienti.\n\nVuoi tornare temporaneamente alla cartella di default?`
                })
                : await dialog.showMessageBox({
                    type: 'error',
                    buttons: ['Usa Default', 'Annulla'],
                    defaultId: 0,
                    cancelId: 1,
                    title: 'Cartella Progetti non disponibile',
                    message: 'Non riesco a scrivere nella cartella progetti personalizzata.',
                    detail: `Percorso: ${custom}\n\nPossibili cause: disco scollegato o permessi insufficienti.\n\nVuoi tornare temporaneamente alla cartella di default?`
                });
            if (res.response === 0) {
                runtimeBaseDirOverride = defaultBase;
                return defaultBase;
            }
            throw new Error(`Impossibile accedere alla cartella progetti: ${custom}`);
        }
        return defaultBase;
    }
};

export async function getProjectsBaseDir() {
    return resolveProjectsBaseDir({ interactive: true });
}

export async function getTranslationsDir() {
    const baseDir = await resolveProjectsBaseDir({ interactive: true });

    const translationsDir = path.join(baseDir, 'translations');
    try {
        await fs.promises.access(translationsDir);
    } catch {
        await fs.promises.mkdir(translationsDir, { recursive: true });
        logMain('Creata cartella translations:', translationsDir);
    }
    return translationsDir;
}

export async function getTrashDir() {
    const translationsDir = await getTranslationsDir();
    const trashDir = path.join(translationsDir, '.trash');
    try {
        await fs.promises.access(trashDir);
    } catch {
        await fs.promises.mkdir(trashDir, { recursive: true });
        logMain('Creata cartella trash:', trashDir);
    }
    return trashDir;
}

export async function getAssetsRootDir() {
    const translationsDir = await getTranslationsDir();
    const assetsDir = path.join(translationsDir, 'assets');
    try {
        await fs.promises.access(assetsDir);
    } catch {
        await fs.promises.mkdir(assetsDir, { recursive: true });
        logMain('Creata cartella assets:', assetsDir);
    }
    return assetsDir;
}

export async function getLogsDir() {
    const baseDir = await resolveProjectsBaseDir({ interactive: true });
    const logsDir = path.join(baseDir, 'logs');
    try {
        await fs.promises.access(logsDir);
    } catch {
        await fs.promises.mkdir(logsDir, { recursive: true });
        logMain('Creata cartella logs:', logsDir);
    }
    return logsDir;
}

export async function ensureProjectsDataDirs() {
    const baseDir = await resolveProjectsBaseDir({ interactive: true });
    const translationsDir = await getTranslationsDir();
    const assetsDir = await getAssetsRootDir();
    const logsDir = await getLogsDir();
    return { baseDir, translationsDir, assetsDir, logsDir };
}

export async function projectAssetsDirFromFileId(fileId, create = true) {
    const root = await getAssetsRootDir();
    const safeFileId = requireUuidV4FileId(fileId);
    const stem = getFileIdStem(safeFileId);
    const dir = path.join(root, stem);
    if (create) {
        try {
            await fs.promises.access(dir);
        } catch {
            await fs.promises.mkdir(dir, { recursive: true });
        }
    }
    return dir;
}

export async function resolveLegacyAssetsDirFromFileId(fileId, create = false) {
    const root = await getAssetsRootDir();
    const normalizedId = normalizeProjectFileId(fileId);
    if (!normalizedId) throw new Error('ID progetto mancante.');
    const stem = getFileIdStem(normalizedId);
    if (!stem) throw new Error('ID progetto mancante.');
    if (/[\\/]/.test(stem) || stem.split(/[\\/]+/g).includes('..') || stem === '.' || stem === '..') {
        throw new Error('ID progetto non valido.');
    }

    const candidates = Array.from(new Set([stem, sanitizeProjectName(stem)].filter(Boolean)));
    for (const name of candidates) {
        const dir = path.join(root, name);
        try {
            await fs.promises.access(dir);
            return dir;
        } catch {
        }
    }

    const fallbackDir = path.join(root, candidates[0] || stem);
    if (create) {
        await fs.promises.mkdir(fallbackDir, { recursive: true });
    }
    return fallbackDir;
}

export async function findOriginalPdfInAssetsDir(assetsDir) {
    try {
        const possible = ['original.pdf', 'original.PDF', 'original.pdF'];
        for (const name of possible) {
            const p = path.join(assetsDir, name);
            try {
                await fs.promises.access(p);
                return p;
            } catch { }
        }
        const files = (await fs.promises.readdir(assetsDir)).filter(f => f.startsWith('original.') && f.toLowerCase().endsWith('.pdf'));
        if (files.length > 0) {
            return path.join(assetsDir, files[0]);
        }
    } catch {
    }
    return null;
}

export async function hasEnoughDiskSpace(dirPath, requiredBytes) {
    try {
        if (!fs.promises.statfs) return true;
        const stats = await fs.promises.statfs(dirPath);
        const freeSpace = stats.bavail * stats.bsize;
        return freeSpace > requiredBytes + (50 * 1024 * 1024); // Margine 50MB
    } catch (e) {
        return true;
    }
}

export async function withFileLock(filePath, task) {
    const lockPath = `${filePath}.lock`;
    const maxWait = 10000; // Increased from 5000ms to 10s to handle burst writes during switching
    const interval = 200;  // Increased check interval
    const staleLockMs = 15000; // Reduced stale threshold to 15s (was 10m) to recover faster from crashes
    let waited = 0;
    let acquired = false;

    while (waited < maxWait) {
        try {
            await fs.promises.writeFile(lockPath, String(process.pid), { flag: 'wx' });
            acquired = true;
            break;
        } catch (e) {
            if (e.code === 'EEXIST') {
                try {
                    const st = await fs.promises.stat(lockPath);
                    // Check if lock is stale
                    if (Date.now() - st.mtimeMs > staleLockMs) {
                        try {
                            await fs.promises.unlink(lockPath);
                            logWarn('Removed stale lock file', { lockPath, age: Date.now() - st.mtimeMs });
                            continue; // Retry immediately
                        } catch (unlinkErr) {
                            // If unlink fails, race condition or permission, explicitly ignore and wait
                        }
                    }
                } catch {
                    // Stat failed (maybe lock was removed in between), retry immediately
                    continue;
                }
                await new Promise(resolve => setTimeout(resolve, interval));
                waited += interval;
                continue;
            }
            throw e;
        }
    }

    if (waited > 0) {
        inconsistencyTracker.concurrencyConflicts++;
        logDebug('File lock contention resolved', { filePath, waitedMs: waited });
    }

    if (!acquired) {
        logWarn('Lock timeout - Operation aborted', { file: path.basename(filePath) });
        throw new Error(`Lock timeout for ${path.basename(filePath)} (waited ${maxWait}ms)`);
    }

    try {
        return await task();
    } finally {
        if (acquired) {
            try {
                await fs.promises.unlink(lockPath);
            } catch (e) {
                // If it fails to remove lock (e.g. someone else deleted it?), it's weird but not fatal for the task result
                if (e.code !== 'ENOENT') {
                    logWarn('Failed to remove lock file', { lockPath, error: e.message });
                }
            }
        }
    }
}

export async function safeWriteFile(filePath, content, encoding = 'utf-8') {
    return withFileLock(filePath, async () => {
        const tmpPath = `${filePath}.tmp`;
        const bytes = typeof content === 'string' ? Buffer.byteLength(content, encoding) : content.length;
        const dir = path.dirname(filePath);

        if (!await hasEnoughDiskSpace(dir, bytes)) {
            inconsistencyTracker.diskSpaceWarnings++;
            throw new Error(`Spazio su disco insufficiente per salvare ${path.basename(filePath)}`);
        }

        // Increased retries for actual write operation
        return retry(async () => {
            const tempFileHandle = await fs.promises.open(tmpPath, 'w');
            try {
                if (typeof content === 'string') {
                    await tempFileHandle.writeFile(content, encoding);
                } else {
                    await tempFileHandle.writeFile(content);
                }
                // FORCE FLUSH TO DISK
                await tempFileHandle.sync();
            } finally {
                await tempFileHandle.close();
            }
            // Atomic Rename
            await fs.promises.rename(tmpPath, filePath);
        }, 5, 500).catch(err => {
            inconsistencyTracker.writeRetries++;
            logError(`safeWriteFile failed for ${path.basename(filePath)}`, { error: err.message });
            throw err;
        });
    });
}

export async function isValidImageBuffer(buffer) {
    if (!buffer || buffer.length < 4) return false;
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;
    return false;
}

export async function recoverTemporaryFiles() {
    try {
        const translationsDir = await getTranslationsDir();
        const userDataPath = app.getPath('userData');
        const assetsRootDir = await getAssetsRootDir();
        const dirsToScan = [translationsDir, userDataPath, assetsRootDir];

        logMain('Avvio scansione per recupero file temporanei...');

        for (const baseDir of dirsToScan) {
            try {
                await fs.promises.access(baseDir);
            } catch {
                continue;
            }

            const walk = async (dir) => {
                let files = [];
                try {
                    const list = await fs.promises.readdir(dir);
                    for (const file of list) {
                        const fullPath = path.join(dir, file);
                        const stat = await fs.promises.stat(fullPath);
                        if (stat.isDirectory()) {
                            files = files.concat(await walk(fullPath));
                        } else if (file.endsWith('.tmp')) {
                            files.push(fullPath);
                        }
                    }
                } catch (e) {
                    logWarn('Directory scan failed during temp recovery', { dir, error: e.message });
                }
                return files;
            };

            const tmpFiles = await walk(baseDir);

            for (const tmpPath of tmpFiles) {
                const targetPath = tmpPath.slice(0, -4);
                const tmpFile = path.basename(tmpPath);

                try {
                    await withFileLock(targetPath, async () => {
                        const tmpStat = await fs.promises.stat(tmpPath);
                        let shouldRecover = true;

                        try {
                            await fs.promises.access(targetPath);
                            const targetStat = await fs.promises.stat(targetPath);
                            if (tmpStat.mtime <= targetStat.mtime) {
                                const ageMs = Date.now() - tmpStat.mtimeMs;
                                if (ageMs > 7 * 24 * 60 * 60 * 1000) {
                                    const trashDir = await getTrashDir();
                                    const recoveredDir = path.join(trashDir, 'recovered_temp');
                                    try {
                                        await fs.promises.access(recoveredDir);
                                    } catch {
                                        await fs.promises.mkdir(recoveredDir, { recursive: true });
                                    }
                                    await fs.promises.rename(tmpPath, path.join(recoveredDir, `${Date.now()}_${tmpFile}`)).catch((e) => {
                                        logWarn('Failed to move obsolete temp file to recovered_temp', { tmpFile, error: e.message });
                                    });
                                    logMain(`File temporaneo obsoleto spostato in recovered_temp: ${tmpFile}`);
                                } else {
                                    const oldTmpPath = `${tmpPath}.obsolete_${Date.now()}`;
                                    await fs.promises.rename(tmpPath, oldTmpPath).catch((e) => {
                                        logWarn('Failed to rename obsolete temp file', { tmpFile, error: e.message });
                                    });
                                }
                                shouldRecover = false;
                            }
                        } catch (e) { }

                        if (shouldRecover) {
                            if (targetPath.endsWith('.json')) {
                                try {
                                    const content = await fs.promises.readFile(tmpPath, 'utf-8');
                                    JSON.parse(content);
                                } catch (e) {
                                    inconsistencyTracker.validationFailures++;
                                    throw new Error('JSON corrotto');
                                }
                            } else if (targetPath.endsWith('.jpg') || targetPath.endsWith('.png') || targetPath.endsWith('.jpeg')) {
                                try {
                                    const buffer = await fs.promises.readFile(tmpPath);
                                    if (!await isValidImageBuffer(buffer)) throw new Error('Buffer immagine non valido');
                                } catch (e) {
                                    inconsistencyTracker.validationFailures++;
                                    throw new Error(`Immagine corrotta: ${e.message}`);
                                }
                            }

                            logMain(`Recupero file temporaneo: ${tmpFile} -> ${path.basename(targetPath)}`);
                            inconsistencyTracker.recoveredTempFiles++;
                            try {
                                await fs.promises.access(targetPath);
                                const bakPath = `${targetPath}.bak_${Date.now()}`;
                                await fs.promises.rename(targetPath, bakPath);
                            } catch (e) { }
                            await fs.promises.rename(tmpPath, targetPath);
                        }
                    });
                } catch (e) {
                    logWarn('Unable to recover temp file', { tmpFile, error: e.message });
                    try {
                        const stats = await fs.promises.stat(tmpPath);
                        if (Date.now() - stats.mtimeMs > 7 * 24 * 60 * 60 * 1000) {
                            await fs.promises.unlink(tmpPath);
                        }
                    } catch (e) { }
                }
            }
        }
    } catch (error) {
        logError('Error during temporary files recovery', { error: error.message });
    }
}

export async function performDeepHealthCheck() {
    logMain('=== Starting Deep Health Check ===');
    const translationsDir = await getTranslationsDir();
    const assetsRootDir = await getAssetsRootDir();

    // 1. Scan Projects
    let projectFiles = [];
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        projectFiles = []; // Reset
        try {
            const entries = await fs.promises.readdir(translationsDir, { withFileTypes: true });
            for (const ent of entries) {
                if (!ent.isFile()) continue;
                const f = ent.name;
                if (!f.endsWith('.json')) continue;
                if (f === 'undefined.json') continue;
                if (f.startsWith('.')) continue;
                if (f.endsWith('.tmp')) continue;
                projectFiles.push(f);
            }

            if (projectFiles.length > 0) {
                logMain(`Deep Health Check: Found ${projectFiles.length} project(s)`);
                break;
            } else {
                if (attempt < maxRetries) {
                    logWarn(`Deep Health Check: Found 0 projects (attempt ${attempt}/${maxRetries}). Retrying in 2s...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    logMain(`Deep Health Check: Found 0 project(s) after ${maxRetries} attempts.`);
                }
            }
        } catch (e) {
            logError('Deep Health Check: Failed to scan translations dir', { error: e.message });
            return;
        }
    }

    // 2. Scan Assets
    const assetFolders = [];
    try {
        const files = await fs.promises.readdir(assetsRootDir);
        for (const f of files) {
            const fullPath = path.join(assetsRootDir, f);
            const stat = await fs.promises.stat(fullPath);
            if (stat.isDirectory()) {
                assetFolders.push(f);
            }
        }
        logMain(`Deep Health Check: Found ${assetFolders.length} asset folder(s)`);
    } catch (e) {
        logError('Deep Health Check: Failed to scan assets dir', { error: e.message });
        return;
    }

    if (projectFiles.length === 0) {
        logWarn('Deep Health Check: Found 0 projects. Skipping missing/orphan assets scan (do not delete assets manually).', { translationsDir, assetsRootDir });
        logMain('=== Deep Health Check Completed ===');
        return;
    }

    // 3. Check for Missing Assets & Original Files
    const validAssetPaths = new Set();
    for (const projFile of projectFiles) {
        const fileId = projFile;
        const projectPath = path.join(translationsDir, projFile);
        let expectedPath = '';
        try {
            expectedPath = await projectAssetsDirFromFileId(fileId, false);
        } catch {
            logWarn('Deep Health Check: skip progetto con fileId non UUID', { fileId });
            continue;
        }

        // Add to valid set for next step
        validAssetPaths.add(expectedPath);

        // Check asset folder
        try {
            await fs.promises.access(expectedPath);
        } catch {
            inconsistencyTracker.missingAssets++;
            logWarn(`MISSING ASSETS: Project '${projFile}' has no asset folder.`, {
                fileId,
                expectedPath: path.basename(expectedPath)
            });
        }

        // Check original PDF file
        try {
            const content = await fs.promises.readFile(projectPath, 'utf-8');
            const projectData = JSON.parse(content);
            if (projectData.originalFilePath) {
                try {
                    await fs.promises.access(projectData.originalFilePath);
                } catch {
                    inconsistencyTracker.missingAssets++;
                    logWarn(`MISSING ORIGINAL FILE: Project '${projFile}' references missing file '${projectData.originalFilePath}'`, {
                        fileId,
                        originalFilePath: projectData.originalFilePath
                    });
                }
            }
        } catch (e) {
            logWarn(`Deep Health Check: Failed to read/parse project file '${projFile}'`, { error: e.message });
        }
    }

    // 4. Check for Orphaned Assets
    for (const folderName of assetFolders) {
        const fullPath = path.join(assetsRootDir, folderName);
        let isOrphan = true;

        if (validAssetPaths.has(fullPath)) {
            isOrphan = false;
        }

        if (isOrphan) {
            inconsistencyTracker.orphanedAssets++;
            logWarn(`POSSIBLE ORPHANED ASSET FOLDER: '${folderName}' not matched to any project file on disk. Do not delete manually; use in-app cleanup.`, {
                folder: folderName,
                fullPath
            });
        }
    }

    logMain('=== Deep Health Check Completed ===');
}

export async function autoCleanupTrash() {
    try {
        const trashDir = await getTrashDir();
        try {
            await fs.promises.access(trashDir);
        } catch {
            return;
        }

        const items = await fs.promises.readdir(trashDir);
        const now = Date.now();
        const retentionPeriodMs = 7 * 24 * 60 * 60 * 1000; // 7 giorni
        let deletedCount = 0;

        for (const item of items) {
            const trashInfo = parseTrashFolderName(item);
            if (!trashInfo) continue;

            const { timestamp } = trashInfo;

            if (now - timestamp > retentionPeriodMs) {
                const itemPath = path.join(trashDir, item);
                try {
                    await retry(async () => {
                        await fs.promises.rm(itemPath, { recursive: true, force: true });
                    }, 3, 500);
                    deletedCount++;
                    logMain('Auto-cleanup trash: eliminato elemento scaduto', { item });
                } catch (e) {
                    logError(`Auto-cleanup trash: impossibile eliminare ${item} dopo retry`, { error: e.message });
                }
            }
        }

        if (deletedCount > 0) {
            logMain(`Auto-cleanup trash completed. Removed ${deletedCount} items.`);
        }
    } catch (e) {
        logError('Auto-cleanup trash failed', { error: e.message });
    }
}

export async function cleanupOrphanedAssets() {
    logMain('=== Starting Orphaned Assets Cleanup ===');
    const translationsDir = await getTranslationsDir();
    const assetsRootDir = await getAssetsRootDir();
    const trashDir = await getTrashDir();

    // 1. Scan Projects
    const projectFiles = [];
    try {
        const entries = await fs.promises.readdir(translationsDir, { withFileTypes: true });
        for (const ent of entries) {
            if (!ent.isFile()) continue;
            const f = ent.name;
            if (!f.endsWith('.json')) continue;
            if (f === 'undefined.json') continue;
            if (f.startsWith('.')) continue;
            if (f.endsWith('.tmp')) continue;
            projectFiles.push(f);
        }
    } catch (e) {
        logError('Cleanup: Failed to scan translations dir', { error: e.message });
        throw e;
    }

    // 2. Scan Assets
    const assetFolders = [];
    try {
        const files = await fs.promises.readdir(assetsRootDir);
        for (const f of files) {
            const fullPath = path.join(assetsRootDir, f);
            const stat = await fs.promises.stat(fullPath);
            if (stat.isDirectory()) {
                assetFolders.push(f);
            }
        }
    } catch (e) {
        logError('Cleanup: Failed to scan assets dir', { error: e.message });
        throw e;
    }

    if (projectFiles.length === 0) {
        logWarn('Cleanup aborted: Found 0 projects. Refusing to move asset folders to trash.', { translationsDir, assetsRootDir, assetFoldersCount: assetFolders.length });
        return 0;
    }

    // 3. Identify Valid Paths
    const validAssetPaths = new Set();
    for (const projFile of projectFiles) {
        const fileId = projFile;
        try {
            const expectedPath = await projectAssetsDirFromFileId(fileId, false);
            validAssetPaths.add(expectedPath);
        } catch {
            continue;
        }
    }

    // 4. Move Orphans to Trash
    let cleanedCount = 0;
    for (const folderName of assetFolders) {
        const fullPath = path.join(assetsRootDir, folderName);

        if (!validAssetPaths.has(fullPath)) {
            // It is an orphan
            const timestamp = Date.now();
            // Use a format consistent with other trash items if possible, or a distinct one
            const trashName = `trash_${timestamp}_orphan_${folderName}`;
            const trashPath = path.join(trashDir, trashName);

            try {
                await fs.promises.rename(fullPath, trashPath);
                cleanedCount++;
                logMain(`Cleanup: Moved orphan '${folderName}' to trash`, { trashPath });
            } catch (e) {
                logError(`Cleanup: Failed to move orphan '${folderName}'`, { error: e.message });
            }
        }
    }

    // 5. Update State
    // Re-run health check to update the tracker accurately
    await performDeepHealthCheck();

    return cleanedCount;
}
