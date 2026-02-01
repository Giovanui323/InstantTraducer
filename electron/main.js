import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import AdmZip from 'adm-zip';
import { mergeProjectData, normalizeLoadedProjectData } from './translationMerge.js';
import { createLogger } from './logger.js';
import { buildExportHtml } from './exportHtml.js';
import { isPathInside, safeJoinAssets } from './pathSecurity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- EXPORT / IMPORT PACKAGES (.gpt) ---

ipcMain.handle('export-project-package', async (_event, { fileId }) => {
    try {
        if (!fileId) throw new Error('FileId mancante');

        // 1. Locate source files
        const translationsDir = getTranslationsDir();
        const jsonPath = path.join(translationsDir, fileId.endsWith('.json') ? fileId : `${fileId}.json`);
        const assetsDir = projectAssetsDirFromFileId(fileId);
        const originalPdfPath = path.join(assetsDir, 'original.pdf');

        // Check availability
        try {
            await fs.promises.access(jsonPath, fs.constants.F_OK);
        } catch {
            logError('Export package failed: file not found', { jsonPath });
            throw new Error('File di traduzione (JSON) non trovato.');
        }

        let hasPdf = false;
        try {
            await fs.promises.access(originalPdfPath, fs.constants.F_OK);
            hasPdf = true;
        } catch {
            // Warn but proceed? Or fail? User expects portability.
            // If missing, we can still export JSON only, but better to warn frontend before calling this.
            // For now, if missing, we just don't add it.
        }

        // 2. Create ZIP
        const zip = new AdmZip();
        const jsonContent = await fs.promises.readFile(jsonPath, 'utf-8');
        zip.addFile('project.json', Buffer.from(jsonContent, 'utf-8'));

        if (hasPdf) {
            const pdfContent = await fs.promises.readFile(originalPdfPath);
            zip.addFile('original.pdf', pdfContent);
        }

        // 3. Save Dialog
        const cleanId = String(fileId || '').replace(/\.json$/i, '');
        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow || undefined, {
            title: 'Esporta Pacchetto Progetto',
            defaultPath: `Project_${cleanId}.gpt`,
            filters: [{ name: 'Gemini Project Translator (.gpt)', extensions: ['gpt'] }]
        });

        if (canceled || !filePath) return { success: false, cancelled: true };

        // 4. Write Zip
        zip.writeZip(filePath);
        logMain('Pacchetto esportato:', filePath);

        return { success: true, path: filePath };

    } catch (error) {
        logError('Errore export package', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('import-project-package', async (_event) => {
    try {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: 'Importa Pacchetto Progetto',
            properties: ['openFile'],
            filters: [{ name: 'Gemini Project Translator (.gpt)', extensions: ['gpt'] }]
        });

        if (canceled || filePaths.length === 0) return null;

        const packagePath = filePaths[0];
        logMain('Importazione pacchetto:', packagePath);

        const zip = new AdmZip(packagePath);
        const zipEntries = zip.getEntries();

        // 1. Extract project.json
        const jsonEntry = zipEntries.find(entry => entry.entryName === 'project.json');
        if (!jsonEntry) throw new Error('Pacchetto non valido: project.json mancante.');

        const jsonContent = zip.readAsText(jsonEntry);
        let projectData;
        try {
            projectData = JSON.parse(jsonContent);
        } catch (e) {
            throw new Error('Pacchetto non valido: JSON corrotto o non parseabile.');
        }

        // 2. Generate new safe File ID
        const fileName = projectData.fileName || 'Imported Project';
        const safeId = fileName.replace(/[^a-z0-9]/gi, '_').toLowerCase();

        // 3. Prepare target paths
        const translationsDir = getTranslationsDir();
        const targetJsonPath = path.join(translationsDir, `${safeId}.json`);
        const targetAssetsDir = projectAssetsDirFromFileId(safeId);

        // 4. Extract PDF if present
        const pdfEntry = zipEntries.find(entry => entry.entryName === 'original.pdf');
        if (pdfEntry) {
            zip.extractEntryTo(pdfEntry, targetAssetsDir, false, true);
        }

        // 5. Update and Save JSON
        const newOriginalPdfPath = path.join(targetAssetsDir, 'original.pdf');
        projectData.originalFilePath = newOriginalPdfPath;
        projectData.timestamp = Date.now();

        await fs.promises.writeFile(targetJsonPath, JSON.stringify(projectData, null, 2), 'utf-8');

        logMain('Pacchetto importato con successo:', safeId);
        return safeId;

    } catch (error) {
        logError('Errore import package', error);
        return null;
    }
});

const logger = createLogger({ module: 'MAIN', toFile: true });
const logMain = (msg, meta) => logger.info(String(msg), meta);
const logDebug = (msg, meta) => logger.debug(String(msg), meta);
const logWarn = (msg, meta) => logger.warn(String(msg), meta);
const logError = (msg, meta) => logger.error(String(msg), meta);
const redactSettings = (settings) => {
    if (!settings) return settings;
    const clone = JSON.parse(JSON.stringify(settings));
    if (clone?.gemini?.apiKey) clone.gemini.apiKey = '[REDACTED]';
    if (clone?.openai?.apiKey) clone.openai.apiKey = '[REDACTED]';
    if (clone?.gemini?.apiKeyEnc) clone.gemini.apiKeyEnc = '[REDACTED]';
    if (clone?.openai?.apiKeyEnc) clone.openai.apiKeyEnc = '[REDACTED]';
    return clone;
};

ipcMain.on('renderer-log', (_event, payload) => {
    try {
        const level = payload && typeof payload === 'object' ? String(payload.level || 'info').toLowerCase() : 'info';
        const message = payload && typeof payload === 'object' ? String(payload.message || '') : String(payload || '');
        const meta = payload && typeof payload === 'object' ? payload.meta : undefined;
        if (level === 'debug') logDebug(`[RENDERER] ${message}`, meta);
        else if (level === 'warn' || level === 'warning') logWarn(`[RENDERER] ${message}`, meta);
        else if (level === 'error') logError(`[RENDERER] ${message}`, meta);
        else logMain(`[RENDERER] ${message}`, meta);
    } catch {
    }
});

// Set userData path to a local directory in development to avoid sandbox permissions issues
if (!app.isPackaged) {
    const localUserData = path.join(process.cwd(), '.local-userdata');
    if (!fs.existsSync(localUserData)) {
        fs.mkdirSync(localUserData, { recursive: true });
    }
    app.setPath('userData', localUserData);
    logMain('Dev userData path impostato:', app.getPath('userData'));
}

let mainWindow;
let cachedSettings = null;

function loadCachedSettings() {
    try {
        const userDataPath = app.getPath('userData');
        const settingsPath = path.join(userDataPath, 'settings.json');
        if (fs.existsSync(settingsPath)) {
            cachedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        }
    } catch (e) {
        console.error('Failed to load cached settings:', e);
    }
}

// Initial load
loadCachedSettings();

let pendingTranslationWrites = 0;
let lastTranslationSaveRequestedAt = 0;
let lastTranslationWriteStartedAt = 0;
let closeInProgress = false;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        ...(process.platform === 'darwin'
            ? {
                titleBarStyle: 'hidden',
                trafficLightPosition: { x: 14, y: 14 },
            }
            : {}),
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    const isDev = !app.isPackaged;

    if (isDev) {
        logMain('Avvio in modalità DEV, caricamento renderer da http://localhost:3000');
        mainWindow.loadURL('http://localhost:3000');
        // mainWindow.webContents.openDevTools();
    } else {
        logMain('Avvio in modalità PACKAGED, caricamento file dist/index.html');
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.on('close', (event) => {
        if (closeInProgress) return;
        const now = Date.now();
        const recentRequest = now - lastTranslationSaveRequestedAt < 900;
        const recentWrite = now - lastTranslationWriteStartedAt < 900;
        if (pendingTranslationWrites > 0 || recentRequest || recentWrite) {
            event.preventDefault();

            const waitStartedAt = Date.now();
            const maxWaitMs = 2000;
            const timer = setInterval(() => {
                const current = Date.now();
                const quietForMs = Math.min(current - lastTranslationSaveRequestedAt, current - lastTranslationWriteStartedAt);
                const isQuiet = quietForMs >= 350;
                const canClose = pendingTranslationWrites === 0 && isQuiet;
                const timedOut = current - waitStartedAt >= maxWaitMs;

                if (canClose || timedOut) {
                    clearInterval(timer);
                    closeInProgress = true;
                    try {
                        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
                    } finally {
                        closeInProgress = false;
                    }
                }
            }, 100);
        }
    });

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

function getTranslationsDir() {
    let baseDir;
    if (cachedSettings?.customProjectsPath && fs.existsSync(cachedSettings.customProjectsPath)) {
        baseDir = cachedSettings.customProjectsPath;
    } else {
        baseDir = app.getPath('userData');
    }

    const translationsDir = path.join(baseDir, 'translations');
    if (!fs.existsSync(translationsDir)) {
        fs.mkdirSync(translationsDir, { recursive: true });
        logMain('Creata cartella translations:', translationsDir);
    }
    return translationsDir;
}

function getTrashDir() {
    const translationsDir = getTranslationsDir();
    const trashDir = path.join(translationsDir, '.trash');
    if (!fs.existsSync(trashDir)) {
        fs.mkdirSync(trashDir, { recursive: true });
        logMain('Creata cartella trash:', trashDir);
    }
    return trashDir;
}

async function autoCleanupTrash() {
    try {
        const trashDir = getTrashDir();
        const items = await fs.promises.readdir(trashDir);
        const now = Date.now();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

        for (const item of items) {
            if (!item.startsWith('trash_')) continue;
            const parts = item.split('_');
            if (parts.length < 2) continue;
            const timestamp = parseInt(parts[1]);
            if (isNaN(timestamp)) continue;

            if (now - timestamp > thirtyDaysMs) {
                const itemPath = path.join(trashDir, item);
                await fs.promises.rm(itemPath, { recursive: true, force: true });
                logMain('Auto-cleanup trash: eliminato elemento scaduto', item);
            }
        }
    } catch (e) {
        logError('Auto-cleanup trash fallito:', e);
    }
}

function getAssetsRootDir() {
    const translationsDir = getTranslationsDir();
    const assetsDir = path.join(translationsDir, 'assets');
    if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
        logMain('Creata cartella assets:', assetsDir);
    }
    return assetsDir;
}

ipcMain.handle('open-logs-dir', async () => {
    try {
        const dir = path.join(app.getPath('userData'), 'logs');
        try { await fs.promises.mkdir(dir, { recursive: true }); } catch { }
        await shell.openPath(dir);
        logMain('IPC open-logs-dir:', dir);
        return { success: true, path: dir };
    } catch (e) {
        logError('IPC open-logs-dir: fallito', e?.message || e);
        return { success: false, error: e?.message || String(e) };
    }
});
function projectAssetsDirFromFileId(fileId) {
    const root = getAssetsRootDir();
    const stem = String(fileId || '').replace(/\.json$/i, '') || 'progetto';
    const dir = path.join(root, stem);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function findOriginalPdfInAssetsDir(assetsDir) {
    try {
        const possible = ['original.pdf', 'original.PDF', 'original.pdF'];
        for (const name of possible) {
            const p = path.join(assetsDir, name);
            if (fs.existsSync(p)) return p;
        }
        const files = fs.readdirSync(assetsDir).filter(f => f.startsWith('original.') && f.toLowerCase().endsWith('.pdf'));
        if (files.length > 0) {
            return path.join(assetsDir, files[0]);
        }
    } catch {
    }
    return null;
}

/**
 * Scrive un file in modo atomico: prima su un file temporaneo e poi rinominandolo.
 * Questo previene la corruzione dei dati in caso di crash durante la scrittura.
 */
async function safeWriteFile(filePath, content, encoding = 'utf-8') {
    const tmpPath = `${filePath}.tmp`;
    try {
        await fs.promises.writeFile(tmpPath, content, encoding);
        // Garantisce che i dati siano scritti fisicamente sul disco (opzionale ma consigliato per atomicità reale)
        // await fs.promises.fsync(fd); // Non disponibile direttamente su fs.promises.writeFile
        await fs.promises.rename(tmpPath, filePath);
    } catch (error) {
        logError(`Salvataggio fallito per ${filePath}:`, error);
        // NON cancelliamo il .tmp se il rename fallisce per un crash di sistema improvviso,
        // ma lo facciamo se l'errore è catturato qui (es. errore di permessi).
        // Tuttavia, se vogliamo un recupero automatico, potremmo volerlo lasciare lì se è integro.
        throw error;
    }
}

/**
 * Recupera automaticamente i file .tmp rimasti orfani a causa di un crash.
 */
async function recoverTemporaryFiles() {
    try {
        const translationsDir = getTranslationsDir();
        const userDataPath = app.getPath('userData');
        const dirsToScan = [translationsDir, userDataPath];

        logMain('Avvio scansione per recupero file temporanei...');

        for (const dir of dirsToScan) {
            if (!fs.existsSync(dir)) continue;
            const files = await fs.promises.readdir(dir);
            const tmpFiles = files.filter(f => f.endsWith('.tmp'));

            for (const tmpFile of tmpFiles) {
                const tmpPath = path.join(dir, tmpFile);
                const targetPath = tmpPath.slice(0, -4); // Rimuove .tmp

                try {
                    const tmpStat = await fs.promises.stat(tmpPath);
                    let shouldRecover = true;

                    if (fs.existsSync(targetPath)) {
                        const targetStat = await fs.promises.stat(targetPath);
                        // Se il file .tmp è più vecchio o uguale al file esistente, non lo usiamo per il recupero
                        if (tmpStat.mtime <= targetStat.mtime) {
                            logMain(`File temporaneo obsoleto trovato: ${tmpFile} (non più recente del file target). Spostamento in backup.`);
                            const oldTmpPath = `${tmpPath}.obsolete_${Date.now()}`;
                            await fs.promises.rename(tmpPath, oldTmpPath);
                            shouldRecover = false;
                        }
                    }

                    if (shouldRecover) {
                        // Verifichiamo se il file .tmp è un JSON valido
                        const content = await fs.promises.readFile(tmpPath, 'utf-8');
                        JSON.parse(content); // Se fallisce, il file è corrotto

                        logMain(`Trovato salvataggio interrotto più recente: ${tmpFile}. Recupero in corso...`);

                        // Se esiste già il file target, facciamo un backup di sicurezza
                        if (fs.existsSync(targetPath)) {
                            const bakPath = `${targetPath}.bak_${Date.now()}`;
                            await fs.promises.rename(targetPath, bakPath);
                            logMain(`Backup del file esistente creato: ${path.basename(bakPath)}`);
                        }

                        // Ripristiniamo il file temporaneo
                        await fs.promises.rename(tmpPath, targetPath);
                        logMain(`Recupero completato: ${path.basename(targetPath)}`);
                    } else {
                        // OTTIMIZZAZIONE: Se il file .tmp è obsoleto o non recuperabile, 
                        // lo eliminiamo se è più vecchio di 24 ore per evitare bloat.
                        const ageMs = Date.now() - tmpStat.mtimeMs;
                        if (ageMs > 24 * 60 * 60 * 1000) {
                            await fs.promises.unlink(tmpPath).catch(() => {});
                            logMain(`File temporaneo obsoleto eliminato: ${tmpFile}`);
                        }
                    }
                } catch (e) {
                    logWarn(`Impossibile recuperare ${tmpFile}: il file potrebbe essere corrotto.`, e.message);
                    
                    // OTTIMIZZAZIONE: Se il file è corrotto ed è molto vecchio, lo eliminiamo invece di rinominarlo
                    const stats = await fs.promises.stat(tmpPath).catch(() => null);
                    if (stats && (Date.now() - stats.mtimeMs > 7 * 24 * 60 * 60 * 1000)) {
                        await fs.promises.unlink(tmpPath).catch(() => {});
                        logMain(`File temporaneo corrotto e vecchio eliminato: ${tmpFile}`);
                    } else {
                        try {
                            const corruptedTmp = `${tmpPath}.corrupted_${Date.now()}`;
                            await fs.promises.rename(tmpPath, corruptedTmp);
                        } catch {}
                    }
                }
            }

            // Pulizia residui di vecchi backup/corrotti
            const allFiles = await fs.promises.readdir(dir);
            const backupPatterns = ['.bak_', '.obsolete_', '.corrupted_'];
            for (const file of allFiles) {
                if (backupPatterns.some(p => file.includes(p))) {
                    const filePath = path.join(dir, file);
                    const stats = await fs.promises.stat(filePath).catch(() => null);
                    if (stats && (Date.now() - stats.mtimeMs > 7 * 24 * 60 * 60 * 1000)) {
                        await fs.promises.unlink(filePath).catch(() => {});
                        logMain(`File di backup obsoleto eliminato: ${file}`);
                    }
                }
            }
        }
    } catch (error) {
        logError('Errore durante il recupero dei file temporanei:', error);
    }
}

function parseImageDataUrl(dataUrl) {
    const value = String(dataUrl || '');
    const match = /^data:(image\/(png|jpeg));base64,(.+)$/i.exec(value);
    if (!match) throw new Error('Data URL immagine non valido.');
    const mime = match[1].toLowerCase();
    const ext = match[2].toLowerCase() === 'png' ? 'png' : 'jpg';
    const base64 = match[3];
    return { mime, ext, base64 };
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return ch;
    }
});

ipcMain.handle('logger-selfcheck', async () => {
    try {
        logger.trace('SELF-CHECK trace');
        logger.debug('SELF-CHECK debug');
        logger.info('SELF-CHECK info');
        logger.warn('SELF-CHECK warn');
        logger.error('SELF-CHECK error');
        const dir = path.join(app.getPath('userData'), 'logs');
        return { success: true, path: dir };
    } catch (e) {
        return { success: false, error: e?.message || String(e) };
    }
});
const fileStemFromName = (name) => {
    const base = String(name ?? '').trim() || 'Libro';
    const noExt = base.replace(/\.[^/.]+$/, '');
    const sanitized = noExt.replace(/[^\w\d\- ]+/g, '_').replace(/\s+/g, ' ').trim();
    return sanitized || 'Libro';
};

let lastUserSelectedPdfPath = null;



// IPC HANDLERS
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
    const translationsDir = getTranslationsDir();
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
    const fileId = path.basename(selectedPath);
    const selectedDir = path.dirname(selectedPath);
    if (selectedDir !== translationsDir) {
        const localPath = path.join(translationsDir, fileId);
        if (fs.existsSync(localPath)) {
            logMain('IPC open-project-dialog: file fuori directory, uso locale', { selectedPath, localPath, elapsedMs: Date.now() - startedAt });
            return fileId;
        }
        logMain('IPC open-project-dialog: file non nella directory progetti', { selectedPath, elapsedMs: Date.now() - startedAt });
        return null;
    }
    logMain('IPC open-project-dialog: selezionato', { fileId, elapsedMs: Date.now() - startedAt });
    return fileId;
});

ipcMain.handle('save-settings', async (event, settings) => {
    try {
        const startedAt = Date.now();
        const userDataPath = app.getPath('userData');
        const settingsPath = path.join(userDataPath, 'settings.json');
        logMain('IPC save-settings:', settingsPath, redactSettings(settings));
        const toPersist = JSON.parse(JSON.stringify(settings));
        try {
            const canEncrypt = safeStorage && safeStorage.isEncryptionAvailable();
            if (canEncrypt) {
                if (toPersist?.gemini?.apiKey) {
                    const enc = safeStorage.encryptString(String(toPersist.gemini.apiKey));
                    toPersist.gemini.apiKeyEnc = Buffer.from(enc).toString('base64');
                    delete toPersist.gemini.apiKey;
                }
                if (toPersist?.openai?.apiKey) {
                    const enc = safeStorage.encryptString(String(toPersist.openai.apiKey));
                    toPersist.openai.apiKeyEnc = Buffer.from(enc).toString('base64');
                    delete toPersist.openai.apiKey;
                }
            } else {
                // Fallback: keep plain fields; at least ensure redact in logs
                logMain('IPC save-settings: cifratura non disponibile, salvataggio in chiaro');
            }
        } catch (e) {
            logMain('IPC save-settings: errore cifratura, salvataggio in chiaro', e?.message || e);
        }
        await safeWriteFile(settingsPath, JSON.stringify(toPersist, null, 2));
        cachedSettings = toPersist;
        logMain('IPC save-settings: completato', { elapsedMs: Date.now() - startedAt });
        return { success: true };
    } catch (e) {
        logError('Save settings failed:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('load-settings', async () => {
    try {
        const startedAt = Date.now();
        const userDataPath = app.getPath('userData');
        const settingsPath = path.join(userDataPath, 'settings.json');
        logMain('IPC load-settings:', settingsPath);
        if (fs.existsSync(settingsPath)) {
            const rawContent = await fs.promises.readFile(settingsPath, 'utf-8');
            const raw = JSON.parse(rawContent);
            const data = JSON.parse(JSON.stringify(raw));
            try {
                const canDecrypt = safeStorage && safeStorage.isEncryptionAvailable();
                if (canDecrypt) {
                    if (data?.gemini?.apiKeyEnc && !data?.gemini?.apiKey) {
                        const buf = Buffer.from(String(data.gemini.apiKeyEnc), 'base64');
                        data.gemini.apiKey = safeStorage.decryptString(buf);
                    }
                    if (data?.openai?.apiKeyEnc && !data?.openai?.apiKey) {
                        const buf = Buffer.from(String(data.openai.apiKeyEnc), 'base64');
                        data.openai.apiKey = safeStorage.decryptString(buf);
                    }
                } else {
                    // Fallback: use plain apiKey if present
                }
            } catch (e) {
                logMain('IPC load-settings: errore decifratura, ritorno dati grezzi', e?.message || e);
            }
            logMain('IPC load-settings: trovato', redactSettings(data), { elapsedMs: Date.now() - startedAt });
            cachedSettings = raw;
            return data;
        }
        logMain('IPC load-settings: non trovato', { elapsedMs: Date.now() - startedAt });
        return null;
    } catch (e) {
        logError('Load settings failed:', e);
        return null;
    }
});

ipcMain.handle('load-groups', async () => {
    try {
        const startedAt = Date.now();
        const userDataPath = app.getPath('userData');
        const groupsPath = path.join(userDataPath, 'groups.json');
        logMain('IPC load-groups:', groupsPath);
        if (fs.existsSync(groupsPath)) {
            const raw = fs.readFileSync(groupsPath, 'utf-8');
            let data = [];
            try {
                data = JSON.parse(raw);
            } catch (e) {
                logWarn('IPC load-groups: JSON parse failed, returning empty list', { message: e?.message || String(e) });
                return [];
            }
            logMain('IPC load-groups: caricati', { count: Array.isArray(data) ? data.length : 0, elapsedMs: Date.now() - startedAt });
            return Array.isArray(data) ? data : [];
        }
        logMain('IPC load-groups: file non trovato, ritorno array vuoto', { elapsedMs: Date.now() - startedAt });
        return [];
    } catch (e) {
        logError('Load groups failed:', e);
        return [];
    }
});

ipcMain.handle('save-groups', async (event, groups) => {
    try {
        const startedAt = Date.now();
        const userDataPath = app.getPath('userData');
        const groupsPath = path.join(userDataPath, 'groups.json');
        logMain('IPC save-groups:', groupsPath, { count: Array.isArray(groups) ? groups.length : 0 });
        
        if (!Array.isArray(groups)) {
            throw new Error('Formato gruppi non valido: atteso array.');
        }

        await safeWriteFile(groupsPath, JSON.stringify(groups, null, 2));
        logMain('IPC save-groups: completato', { elapsedMs: Date.now() - startedAt });
        return { success: true };
    } catch (e) {
        logError('Save groups failed:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.on('save-translation-requested', (event, payload) => {
    lastTranslationSaveRequestedAt = Date.now();
    const fileId = payload && typeof payload === 'object' ? payload.fileId : undefined;
    if (fileId) logMain('IPC save-translation: richiesta', { fileId });
});

ipcMain.handle('save-translation', async (event, { fileId, data }) => {
    pendingTranslationWrites += 1;
    lastTranslationWriteStartedAt = Date.now();
    try {
        const startedAt = Date.now();
        const translationsDir = getTranslationsDir();
        const filePath = path.join(translationsDir, fileId);
        let existing = {};
        
        if (fs.existsSync(filePath)) {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            try {
                existing = JSON.parse(content) || {};
            } catch (parseError) {
                logError('JSON parse failed for translation file, backing up corrupted file:', parseError);
                // In caso di JSON corrotto, facciamo un backup invece di sovrascrivere
                const corruptedPath = `${filePath}.corrupted_${Date.now()}`;
                await fs.promises.rename(filePath, corruptedPath);
                existing = {}; // Partiamo da zero ma salviamo il vecchio file
            }
        }

        const merged = mergeProjectData(existing, data);

        logMain('IPC save-translation:', filePath, {
            fileName: merged?.fileName,
            lastPage: merged?.lastPage,
            totalPages: merged?.totalPages,
            translationsCount: merged?.translations ? Object.keys(merged.translations).length : 0
        });
        const payload = JSON.stringify(merged);
        await safeWriteFile(filePath, payload);
        logMain('IPC save-translation: completato', { elapsedMs: Date.now() - startedAt, bytes: Buffer.byteLength(payload) });
        return { success: true };
    } catch (e) {
        logError('Save failed:', e);
        return { success: false, error: e.message };
    } finally {
        pendingTranslationWrites = Math.max(0, pendingTranslationWrites - 1);
    }
});

ipcMain.handle('save-project-image', async (event, { fileId, page, kind, dataUrl, buffer }) => {
    try {
        const startedAt = Date.now();
        const assetsDir = projectAssetsDirFromFileId(fileId);
        const safeKind = String(kind || 'image').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
        const pageNum = Number(page);
        if (!Number.isFinite(pageNum) || pageNum < 1) throw new Error('Numero pagina non valido.');
        
        let finalBuffer;
        let ext = 'jpg';

        if (buffer) {
            // Se riceviamo un buffer (o Uint8Array) direttamente dal bridge IPC
            finalBuffer = Buffer.from(buffer);
            // Determiniamo l'estensione se possibile, altrimenti default jpg
            ext = 'jpg'; 
        } else if (dataUrl) {
            const parsed = parseImageDataUrl(dataUrl);
            finalBuffer = Buffer.from(parsed.base64, 'base64');
            ext = parsed.ext;
        } else {
            throw new Error('Nessun dato immagine fornito (né dataUrl né buffer).');
        }

        const fileName = `${safeKind}-p${pageNum}.${ext}`;
        const absPath = path.join(assetsDir, fileName);
        await fs.promises.writeFile(absPath, finalBuffer);
        
        logMain('IPC save-project-image:', { fileId, page: pageNum, kind: safeKind, fileName, elapsedMs: Date.now() - startedAt });
        return { success: true, relPath: fileName };
    } catch (e) {
        logMain('IPC save-project-image: fallito', e?.message || e);
        return { success: false, error: e?.message || String(e) };
    }
});

ipcMain.handle('read-project-image', async (event, { fileId, relPath }) => {
    try {
        const assetsDir = projectAssetsDirFromFileId(fileId);
        const absPath = safeJoinAssets(assetsDir, relPath);
        if (!fs.existsSync(absPath)) return { success: false, error: 'File non trovato.' };
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
        const assetsDir = projectAssetsDirFromFileId(fileId);
        const absPath = safeJoinAssets(assetsDir, relPath);
        if (!fs.existsSync(absPath)) return { success: false, error: 'File non trovato.' };
        const data = await fs.promises.readFile(absPath);
        return { success: true, base64: data.toString('base64') };
    } catch (e) {
        return { success: false, error: e?.message || String(e) };
    }
});

ipcMain.handle('delete-project-image', async (event, { fileId, relPath }) => {
    try {
        const assetsDir = projectAssetsDirFromFileId(fileId);
        const absPath = safeJoinAssets(assetsDir, relPath);
        if (fs.existsSync(absPath)) {
            await fs.promises.unlink(absPath);
            return { success: true };
        }
        return { success: false, error: 'File non trovato.' };
    } catch (e) {
        return { success: false, error: e?.message || String(e) };
    }
});

ipcMain.handle('get-translations', async () => {
    try {
        const startedAt = Date.now();
        const translationsDir = getTranslationsDir();
        try {
            await fs.promises.access(translationsDir, fs.constants.R_OK);
        } catch {
            return [];
        }
        const files = (await fs.promises.readdir(translationsDir)).filter(f => f.endsWith('.json'));
        const result = await Promise.all(files.map(async (file) => {
            const filePath = path.join(translationsDir, file);
            const stats = await fs.promises.stat(filePath);
            let content = {};
            try {
                content = JSON.parse(await fs.promises.readFile(filePath, 'utf-8')) || {};
            } catch (e) {
                logWarn('JSON parse failed in get-translations, skipping file', { file, message: e?.message || String(e) });
                return {
                    fileName: file,
                    lastPage: undefined,
                    totalPages: undefined,
                    timestamp: stats.mtimeMs,
                    fileId: file,
                    hasSafePdf: false,
                    originalFilePath: undefined,
                    inputLanguage: undefined,
                    groups: []
                };
            }

            // Check for safe PDF and thumbnail
            const assetsDir = projectAssetsDirFromFileId(file);
            const hasSafePdf = Boolean(findOriginalPdfInAssetsDir(assetsDir));
            
            let thumbnail = undefined;
            const thumbPath = path.join(assetsDir, 'source-p1.jpg');
            if (fs.existsSync(thumbPath)) {
                try {
                    const thumbData = await fs.promises.readFile(thumbPath);
                    thumbnail = `data:image/jpeg;base64,${thumbData.toString('base64')}`;
                } catch (e) {
                    logWarn('Failed to read thumbnail', { file, error: e.message });
                }
            }

            return {
                fileName: content.fileName || file,
                lastPage: content.lastPage,
                totalPages: content.totalPages,
                timestamp: stats.mtimeMs,
                fileId: file,
                hasSafePdf,
                thumbnail,
                originalFilePath: content.originalFilePath,
                inputLanguage: content.inputLanguage,
                groups: content.groups || []
            };
        }));
        result.sort((a, b) => b.timestamp - a.timestamp);
        logMain('IPC get-translations:', { count: files.length, dir: translationsDir, elapsedMs: Date.now() - startedAt });
        return result;
    } catch (e) {
        logError('List failed:', e);
        return [];
    }
});

ipcMain.handle('load-translation', async (event, fileId) => {
    try {
        const startedAt = Date.now();
        const translationsDir = getTranslationsDir();
        const filePath = path.join(translationsDir, fileId);
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
            logError('IPC load-translation: JSON parse failed', { filePath, message: e?.message || String(e) });
            return null;
        }
        data = normalizeLoadedProjectData(data);
        logMain('IPC load-translation: completato', {
            fileName: data?.fileName,
            lastPage: data?.lastPage,
            totalPages: data?.totalPages,
            hasOriginalFilePath: Boolean(data?.originalFilePath),
            translationsCount: data?.translations ? Object.keys(data.translations).length : 0,
            elapsedMs: Date.now() - startedAt
        });
        return data;
    } catch (e) {
        logMain('IPC load-translation: fallito', e?.message || e);
        return null;
    }
});

ipcMain.handle('delete-translation', async (event, fileId) => {
    try {
        const startedAt = Date.now();
        const translationsDir = getTranslationsDir();
        const filePath = path.join(translationsDir, fileId);
        logMain('IPC delete-translation (move to trash):', filePath);
        
        if (fs.existsSync(filePath)) {
            const trashDir = getTrashDir();
            const timestamp = Date.now();
            const trashFolderName = `trash_${timestamp}_${fileId.replace(/\.json$/i, '')}`;
            const trashFolderPath = path.join(trashDir, trashFolderName);
            
            await fs.promises.mkdir(trashFolderPath, { recursive: true });
            
            // Move JSON
            await fs.promises.rename(filePath, path.join(trashFolderPath, fileId));
            
            // Move assets
            try {
                const assetsDir = projectAssetsDirFromFileId(fileId);
                if (fs.existsSync(assetsDir)) {
                    const trashAssetsPath = path.join(trashFolderPath, 'assets');
                    await fs.promises.rename(assetsDir, trashAssetsPath);
                }
            } catch (e) {
                logError('Failed to move assets to trash:', e);
            }
            
            logMain('IPC delete-translation: spostato nel cestino', { elapsedMs: Date.now() - startedAt });
            return { success: true };
        }
        return { success: false, error: 'File not found' };
    } catch (e) {
        logError('Delete (trash) failed:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-trash-contents', async () => {
    try {
        const trashDir = getTrashDir();
        if (!fs.existsSync(trashDir)) return [];
        const folders = await fs.promises.readdir(trashDir);
        const results = [];
        
        for (const folder of folders) {
            if (!folder.startsWith('trash_')) continue;
            const parts = folder.split('_');
            if (parts.length < 3) continue;
            
            const timestamp = parseInt(parts[1]);
            const fileIdStem = parts.slice(2).join('_');
            const fileId = `${fileIdStem}.json`;
            const folderPath = path.join(trashDir, folder);
            const jsonPath = path.join(folderPath, fileId);
            
            if (fs.existsSync(jsonPath)) {
                try {
                    const content = JSON.parse(await fs.promises.readFile(jsonPath, 'utf-8'));
                    results.push({
                        trashId: folder,
                        fileId: fileId,
                        fileName: content.fileName || fileIdStem,
                        deletedAt: timestamp,
                        originalPath: jsonPath
                    });
                } catch (e) {
                    logError('Error reading trash item JSON:', e);
                }
            }
        }
        return results.sort((a, b) => b.deletedAt - a.deletedAt);
    } catch (e) {
        logError('get-trash-contents failed:', e);
        return [];
    }
});

async function internalRestoreTrashItem(trashId) {
    const trashDir = getTrashDir();
    const folderPath = path.join(trashDir, trashId);
    if (!fs.existsSync(folderPath)) throw new Error('Elemento del cestino non trovato.');

    const parts = trashId.split('_');
    if (parts.length < 3) throw new Error('ID cestino non valido.');
    const fileIdStem = parts.slice(2).join('_');
    const fileId = `${fileIdStem}.json`;

    const translationsDir = getTranslationsDir();
    const targetJsonPath = path.join(translationsDir, fileId);
    const sourceJsonPath = path.join(folderPath, fileId);

    if (fs.existsSync(targetJsonPath)) {
        throw new Error(`Esiste già un progetto con il nome "${fileId}" nella libreria.`);
    }

    // Restore JSON
    await fs.promises.rename(sourceJsonPath, targetJsonPath);

    // Restore assets
    const sourceAssetsPath = path.join(folderPath, 'assets');
    if (fs.existsSync(sourceAssetsPath)) {
        const targetAssetsDir = projectAssetsDirFromFileId(fileId);
        if (fs.existsSync(targetAssetsDir)) {
            await fs.promises.rm(targetAssetsDir, { recursive: true, force: true });
        }
        await fs.promises.rename(sourceAssetsPath, targetAssetsDir);
    }

    // Remove trash folder
    await fs.promises.rm(folderPath, { recursive: true, force: true });
    return true;
}

ipcMain.handle('restore-trash-item', async (event, trashId) => {
    try {
        await internalRestoreTrashItem(trashId);
        return { success: true };
    } catch (e) {
        logError('restore-trash-item failed:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('delete-trash-item-permanently', async (event, trashId) => {
    try {
        const trashDir = getTrashDir();
        const folderPath = path.join(trashDir, trashId);
        if (fs.existsSync(folderPath)) {
            await fs.promises.rm(folderPath, { recursive: true, force: true });
            return { success: true };
        }
        return { success: false, error: 'Elemento non trovato.' };
    } catch (e) {
        logError('delete-trash-item-permanently failed:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('restore-all-trash-items', async () => {
    try {
        const trashDir = getTrashDir();
        if (!fs.existsSync(trashDir)) return { success: true, count: 0 };
        const folders = await fs.promises.readdir(trashDir);
        let count = 0;
        let errors = [];

        for (const folder of folders) {
            if (!folder.startsWith('trash_')) continue;
            try {
                await internalRestoreTrashItem(folder);
                count++;
            } catch (e) {
                errors.push(e.message);
            }
        }
        return { success: true, count, errors: errors.length > 0 ? errors : undefined };
    } catch (e) {
        logError('restore-all-trash-items failed:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('empty-trash', async () => {
    try {
        const trashDir = getTrashDir();
        if (fs.existsSync(trashDir)) {
            const items = await fs.promises.readdir(trashDir);
            for (const item of items) {
                if (item.startsWith('trash_')) {
                    await fs.promises.rm(path.join(trashDir, item), { recursive: true, force: true });
                }
            }
        }
        return { success: true };
    } catch (e) {
        logError('empty-trash failed:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('rename-translation', async (event, { fileId, newFileName }) => {
    try {
        const startedAt = Date.now();
        const translationsDir = getTranslationsDir();
        const oldFileId = String(fileId || '');
        const name = String(newFileName || '').trim();
        if (!oldFileId) return { success: false, error: 'fileId non valido.' };
        if (!name) return { success: false, error: 'Nome non valido.' };

        const newFileId = name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json';
        const oldPath = path.join(translationsDir, oldFileId);
        const newPath = path.join(translationsDir, newFileId);
        logMain('IPC rename-translation:', { oldFileId, newFileId, name });

        if (!fs.existsSync(oldPath)) return { success: false, error: 'File not found' };
        if (newFileId !== oldFileId && fs.existsSync(newPath)) {
            return { success: false, error: 'Esiste già un progetto con questo nome.' };
        }

        const contentRaw = await fs.promises.readFile(oldPath, 'utf-8');
        const content = JSON.parse(contentRaw) || {};
        content.fileName = name;
        content.fileId = newFileId;

        try {
            const assetsRoot = getAssetsRootDir();
            const oldAssets = path.join(assetsRoot, oldFileId.replace(/\.json$/i, ''));
            const newAssets = path.join(assetsRoot, newFileId.replace(/\.json$/i, ''));
            if (fs.existsSync(oldAssets) && !fs.existsSync(newAssets)) {
                await fs.promises.rename(oldAssets, newAssets);
            }
            if (typeof content.originalFilePath === 'string' && content.originalFilePath.startsWith(oldAssets)) {
                const base = path.basename(content.originalFilePath);
                content.originalFilePath = path.join(newAssets, base);
            }
        } catch (e) {
            logError('Assets rename failed during project rename:', e);
        }

        const payload = JSON.stringify(content, null, 2);
        if (newFileId === oldFileId) {
            await safeWriteFile(oldPath, payload);
        } else {
            await safeWriteFile(newPath, payload);
            await fs.promises.unlink(oldPath);
        }

        logMain('IPC rename-translation: completato', { elapsedMs: Date.now() - startedAt });
        return { success: true, fileId: newFileId, fileName: name };
    } catch (e) {
        logError('Rename failed:', e);
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

        const assetsRoot = path.resolve(getAssetsRootDir());
        const isUnderAssets = isPathInside(assetsRoot, resolved);
        const lastSelected = lastUserSelectedPdfPath ? path.resolve(String(lastUserSelectedPdfPath || '')) : null;
        const isLastUserSelection = Boolean(lastSelected && lastSelected === resolved);

        if (!isUnderAssets && !isLastUserSelection) {
            throw new Error('Accesso negato.');
        }

        if (fs.existsSync(resolved)) {
            const buf = await fs.promises.readFile(resolved);
            logMain('IPC read-pdf-file: completato', { bytes: buf.byteLength, elapsedMs: Date.now() - startedAt });
            return buf;
        }
        throw new Error('File not found');
    } catch (e) {
        logError('Read PDF failed:', e);
        throw e;
    }
});

ipcMain.handle('save-original-pdf-buffer', async (event, { fileId, buffer }) => {
    try {
        const startedAt = Date.now();
        const assetsDir = projectAssetsDirFromFileId(fileId);
        const target = path.join(assetsDir, 'original.pdf');

        if (!buffer) throw new Error('Buffer mancante.');
        const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
        await fs.promises.writeFile(target, buf);

        logMain('IPC save-original-pdf-buffer:', { fileId, bytes: buf.byteLength, target, elapsedMs: Date.now() - startedAt });
        return { success: true, path: target };
    } catch (e) {
        logWarn('IPC save-original-pdf-buffer: fallito', {
            fileId,
            bufferPresent: Boolean(buffer),
            bufferType: typeof buffer,
            bytes: buffer && (buffer.byteLength ?? buffer.length),
            message: e?.message || String(e)
        });
        return { success: false, error: e?.message || String(e) };
    }
});

ipcMain.handle('copy-original-pdf', async (event, { fileId, sourcePath }) => {
    try {
        const startedAt = Date.now();
        const assetsDir = projectAssetsDirFromFileId(fileId);
        const ext = (path.extname(sourcePath).toLowerCase() || '.pdf');
        const target = path.join(assetsDir, `original${ext}`);
        
        await fs.promises.copyFile(sourcePath, target);
        
        logMain('IPC copy-original-pdf:', { fileId, sourcePath, target, elapsedMs: Date.now() - startedAt });
        return { success: true, path: target };
    } catch (e) {
        logWarn('IPC copy-original-pdf: fallito', {
            fileId,
            sourcePathPresent: Boolean(sourcePath),
            sourcePathType: typeof sourcePath,
            message: e?.message || String(e)
        });
        return { success: false, error: e?.message || String(e) };
    }
});

ipcMain.handle('get-original-pdf-path', async (event, fileId) => {
    try {
        const assetsDir = projectAssetsDirFromFileId(fileId);
        const p = findOriginalPdfInAssetsDir(assetsDir);
        if (p) return { success: true, path: p };
        return { success: false, error: 'File non trovato.' };
    } catch (e) {
        return { success: false, error: e?.message || String(e) };
    }
});
ipcMain.handle('export-translations-pdf', async (event, payload) => {
    const startedAt = Date.now();
    let exportWindow;
    let tempHtmlPath;

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
            } catch {
            }
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
            } catch {
            }
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

        const defaultStem = fileStemFromName(bookName);
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

        // Use a temporary file instead of data URL to avoid length limits
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
        logDebug('IPC export-translations-pdf: contenuto caricato');
        const pdfBuffer = await exportWindow.webContents.printToPDF({ pageSize: 'A4', printBackground: true });
        logDebug('IPC export-translations-pdf: PDF generato', { bytes: pdfBuffer.byteLength });

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
                } catch {
                }
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
                while (true) {
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
                        logMain('IPC export-translations-pdf: completato (retry)', { path: retry.filePath, pages: pages.length, elapsedMs: Date.now() - startedAt });
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
            }

            throw e;
        }

        logMain('IPC export-translations-pdf: completato', { path: result.filePath, pages: pages.length, elapsedMs: Date.now() - startedAt });
        return { success: true, path: result.filePath };
    } catch (e) {
        logMain('IPC export-translations-pdf: fallito', e?.message || e);
        return { success: false, error: serializeError(e) };
    } finally {
        // Clean up temp file
        if (tempHtmlPath && fs.existsSync(tempHtmlPath)) {
            try { await fs.promises.unlink(tempHtmlPath); } catch (e) { logError('Failed to cleanup temp file:', e); }
            tempHtmlPath = null;
        }

        if (exportWindow && !exportWindow.isDestroyed()) {
            try { exportWindow.close(); } catch { }
        }
    }
});

app.on('ready', async () => {
    // Prima di aprire la finestra, recuperiamo eventuali salvataggi interrotti
    await recoverTemporaryFiles();
    // Pulisce il cestino dai file vecchi di 30 giorni
    await autoCleanupTrash();
    createWindow();
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});
