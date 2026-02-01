import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import AdmZip from 'adm-zip';
import { mergeProjectData, normalizeLoadedProjectData } from './translationMerge.js';
import { createLogger } from './logger.js';
import { buildExportHtml } from './exportHtml.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger({ module: 'MAIN-OFFLINE', toFile: true });
const logMain = (msg, meta) => logger.info(String(msg), meta);
const logError = (msg, meta) => logger.error(String(msg), meta);

// Set userData path
if (!app.isPackaged) {
    const localUserData = path.join(process.cwd(), '.local-userdata-offline');
    if (!fs.existsSync(localUserData)) {
        fs.mkdirSync(localUserData, { recursive: true });
    }
    app.setPath('userData', localUserData);
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

loadCachedSettings();

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: "LibroGenie (OFFLINE)",
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

    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
        logMain('Avvio OFFLINE in modalità DEV, caricamento da http://localhost:3001');
        mainWindow.loadURL('http://localhost:3001/index-offline.html');
    } else {
        logMain('Avvio OFFLINE in modalità PACKAGED, caricamento dist-offline/index-offline.html');
        mainWindow.loadFile(path.join(__dirname, '../dist-offline/index-offline.html'));
    }

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

// Re-use most IPC handlers from main.js by importing or copying them.
// Since we want to keep it simple and independent, I'll copy the essential ones.
// Actually, I'll just include the ones needed for browsing and reading.

function getTranslationsDir() {
    let baseDir;
    // For offline, we might want to look at the same translations dir as the main app
    // but the user might want a separate one. Let's assume they want the same data.
    // However, userData is now .local-userdata-offline. 
    // To see the SAME projects, we should point to the original userData.
    
    const originalUserData = path.join(process.cwd(), '.local-userdata');
    baseDir = originalUserData;

    const translationsDir = path.join(baseDir, 'translations');
    if (!fs.existsSync(translationsDir)) {
        fs.mkdirSync(translationsDir, { recursive: true });
    }
    return translationsDir;
}

function getTrashDir() {
    const translationsDir = getTranslationsDir();
    const trashDir = path.join(translationsDir, '.trash');
    if (!fs.existsSync(trashDir)) {
        fs.mkdirSync(trashDir, { recursive: true });
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
            }
        }
    } catch (e) { }
}

function getAssetsRootDir() {
    const translationsDir = getTranslationsDir();
    const assetsDir = path.join(translationsDir, 'assets');
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
    return assetsDir;
}

function projectAssetsDirFromFileId(fileId) {
    const root = getAssetsRootDir();
    const stem = String(fileId || '').replace(/\.json$/i, '') || 'progetto';
    const dir = path.join(root, stem);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

ipcMain.handle('get-translations', async () => {
    try {
        const translationsDir = getTranslationsDir();
        if (!fs.existsSync(translationsDir)) return [];
        const files = (await fs.promises.readdir(translationsDir)).filter(f => f.endsWith('.json'));
        const result = await Promise.all(files.map(async (file) => {
            const filePath = path.join(translationsDir, file);
            const stats = await fs.promises.stat(filePath);
            const content = JSON.parse(await fs.promises.readFile(filePath, 'utf-8'));
            const assetsDir = projectAssetsDirFromFileId(file);
            const safePdfPath = path.join(assetsDir, 'original.pdf');
            let hasSafePdf = fs.existsSync(safePdfPath);
            return {
                fileName: content.fileName || file,
                lastPage: content.lastPage,
                totalPages: content.totalPages,
                timestamp: stats.mtimeMs,
                fileId: file,
                hasSafePdf,
                originalFilePath: content.originalFilePath,
                inputLanguage: content.inputLanguage,
                groups: content.groups || []
            };
        }));
        return result.sort((a, b) => b.timestamp - a.timestamp);
    } catch (e) { return []; }
});

ipcMain.handle('load-translation', async (event, fileId) => {
    try {
        const translationsDir = getTranslationsDir();
        const filePath = path.join(translationsDir, fileId);
        const raw = await fs.promises.readFile(filePath, 'utf-8');
        return normalizeLoadedProjectData(JSON.parse(raw));
    } catch (e) { return null; }
});

ipcMain.handle('read-pdf-file', async (event, filePath) => {
    return fs.readFileSync(filePath);
});

ipcMain.handle('get-original-pdf-path', async (event, fileId) => {
    const assetsDir = projectAssetsDirFromFileId(fileId);
    const p = path.join(assetsDir, 'original.pdf');
    if (fs.existsSync(p)) return { success: true, path: p };
    return { success: false };
});

ipcMain.handle('read-project-image-base64', async (event, { fileId, relPath }) => {
    try {
        const assetsDir = projectAssetsDirFromFileId(fileId);
        const absPath = path.join(assetsDir, relPath);
        const data = await fs.promises.readFile(absPath);
        return { success: true, base64: data.toString('base64') };
    } catch (e) { return { success: false }; }
});

ipcMain.handle('read-project-image', async (event, { fileId, relPath }) => {
    try {
        const assetsDir = projectAssetsDirFromFileId(fileId);
        const absPath = path.join(assetsDir, relPath);
        const data = await fs.promises.readFile(absPath);
        const ext = path.extname(absPath).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
        return { success: true, dataUrl: `data:${mime};base64,${data.toString('base64')}` };
    } catch (e) { return { success: false }; }
});

ipcMain.handle('load-settings', async () => {
    return cachedSettings;
});

ipcMain.handle('save-settings', async (event, settings) => {
    cachedSettings = settings;
    return { success: true };
});

ipcMain.handle('export-translations-pdf', async (event, payload) => {
    // Basic implementation for offline PDF export if needed
    // In consultation mode, this might still be useful.
    // For brevity, I'll omit the complex permission handling from main.js
    return { success: false, error: "Esportazione PDF non supportata in questa versione offline semplificata." };
});

ipcMain.handle('import-project-package', async () => {
    return null; // Disable import in offline
});

ipcMain.handle('delete-translation', async (event, fileId) => {
    // Allow deletion even in offline mode
    try {
        const translationsDir = getTranslationsDir();
        const filePath = path.join(translationsDir, fileId);
        if (fs.existsSync(filePath)) {
            const trashDir = getTrashDir();
            const timestamp = Date.now();
            const trashFolderName = `trash_${timestamp}_${fileId.replace(/\.json$/i, '')}`;
            const trashFolderPath = path.join(trashDir, trashFolderName);
            
            if (!fs.existsSync(trashFolderPath)) fs.mkdirSync(trashFolderPath, { recursive: true });
            
            // Move JSON
            fs.renameSync(filePath, path.join(trashFolderPath, fileId));
            
            // Move assets
            const assetsDir = projectAssetsDirFromFileId(fileId);
            if (fs.existsSync(assetsDir)) {
                const trashAssetsPath = path.join(trashFolderPath, 'assets');
                fs.renameSync(assetsDir, trashAssetsPath);
            }
            return { success: true };
        }
    } catch (e) { }
    return { success: false };
});

ipcMain.handle('get-trash-contents', async () => {
    try {
        const trashDir = getTrashDir();
        if (!fs.existsSync(trashDir)) return [];
        const folders = fs.readdirSync(trashDir);
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
                    const content = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                    results.push({
                        trashId: folder,
                        fileId: fileId,
                        fileName: content.fileName || fileIdStem,
                        deletedAt: timestamp,
                        originalPath: jsonPath
                    });
                } catch (e) { }
            }
        }
        return results.sort((a, b) => b.deletedAt - a.deletedAt);
    } catch (e) { return []; }
});

function internalRestoreTrashItem(trashId) {
    const trashDir = getTrashDir();
    const folderPath = path.join(trashDir, trashId);
    if (!fs.existsSync(folderPath)) throw new Error('Non trovato');
    const parts = trashId.split('_');
    const fileIdStem = parts.slice(2).join('_');
    const fileId = `${fileIdStem}.json`;
    const translationsDir = getTranslationsDir();
    const targetJsonPath = path.join(translationsDir, fileId);
    const sourceJsonPath = path.join(folderPath, fileId);
    if (fs.existsSync(targetJsonPath)) throw new Error('Esiste già');
    fs.renameSync(sourceJsonPath, targetJsonPath);
    const sourceAssetsPath = path.join(folderPath, 'assets');
    if (fs.existsSync(sourceAssetsPath)) {
        const targetAssetsDir = projectAssetsDirFromFileId(fileId);
        if (fs.existsSync(targetAssetsDir)) fs.rmSync(targetAssetsDir, { recursive: true, force: true });
        fs.renameSync(sourceAssetsPath, targetAssetsDir);
    }
    fs.rmSync(folderPath, { recursive: true, force: true });
    return true;
}

ipcMain.handle('restore-trash-item', async (event, trashId) => {
    try {
        internalRestoreTrashItem(trashId);
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('restore-all-trash-items', async () => {
    try {
        const trashDir = getTrashDir();
        if (!fs.existsSync(trashDir)) return { success: true, count: 0 };
        const folders = fs.readdirSync(trashDir);
        let count = 0;
        for (const folder of folders) {
            if (!folder.startsWith('trash_')) continue;
            try {
                internalRestoreTrashItem(folder);
                count++;
            } catch (e) { }
        }
        return { success: true, count };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('delete-trash-item-permanently', async (event, trashId) => {
    try {
        const trashDir = getTrashDir();
        const folderPath = path.join(trashDir, trashId);
        if (fs.existsSync(folderPath)) {
            fs.rmSync(folderPath, { recursive: true, force: true });
            return { success: true };
        }
    } catch (e) { }
    return { success: false };
});

ipcMain.handle('empty-trash', async () => {
    try {
        const trashDir = getTrashDir();
        if (fs.existsSync(trashDir)) {
            const items = fs.readdirSync(trashDir);
            for (const item of items) {
                if (item.startsWith('trash_')) {
                    fs.rmSync(path.join(trashDir, item), { recursive: true, force: true });
                }
            }
        }
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

// Mock others
ipcMain.handle('save-translation', async () => ({ success: false, error: "Sola consultazione" }));
ipcMain.handle('save-project-image', async () => ({ success: false, error: "Sola consultazione" }));

app.on('ready', async () => {
    await autoCleanupTrash();
    createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (mainWindow === null) createWindow(); });
