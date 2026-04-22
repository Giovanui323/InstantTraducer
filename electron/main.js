import { app, BrowserWindow, ipcMain, Menu, globalShortcut } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createLogger } from './logger.js';
import { setupHealthMonitoring } from './healthMonitoring.js';

// Moduli estratti
import { inconsistencyTracker, writeSequencer } from './state.js';
import { setupLogHandlers } from './logHandlers.js';
import { setupPackageHandlers } from './packageLogic.js';
import { loadCachedSettings, setupSettingsHandlers } from './settingsLogic.js';
import { setupPdfHandlers } from './pdfHandlers.js';
import { setupProjectHandlers, getPendingTranslationWrites, buildFingerprintCache } from './projectHandlers.js';
import { setupCoverHandlers } from './coverManager.js';
import { runOriginalFilePathUuidMigrationOnce } from './originalFilePathMigration.js';
import { ensureProjectsDataDirs } from './fileUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.platform === 'darwin' && app.isPackaged) {
    app.commandLine.appendSwitch('no-sandbox');
    app.commandLine.appendSwitch('disable-gpu-sandbox');
    
    // REDIRECTION PER COMPATIBILITÀ DATI STORICI
    // Poiché abbiamo rinominato il prodotto in iTraducer, Electron cercherebbe i dati in ~/Library/Application Support/iTraducer.
    // Forza il percorso alla cartella storica ~/Library/Application Support/InstantTraducer per mantenere i progetti esistenti.
    const appData = app.getPath('appData');
    const legacyPath = path.join(appData, 'InstantTraducer');
    if (fs.existsSync(legacyPath)) {
        app.setPath('userData', legacyPath);
    }
}

const logger = createLogger({ module: 'MAIN', toFile: true });
const logMain = (msg, meta) => logger.info(msg, meta);
const logWarn = (msg, meta) => logger.warn(msg, meta);
const logError = (msg, meta) => logger.error(msg, meta);

// --- GLOBAL ERROR HANDLERS ---
process.on('uncaughtException', (error) => {
    logError('UNCAUGHT EXCEPTION', {
        name: error.name,
        message: error.message,
        stack: error.stack
    });
});

process.on('unhandledRejection', (reason) => {
    logError('UNHANDLED REJECTION', {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined
    });
});

// Set userData path to a local directory in development
if (!app.isPackaged) {
    const localUserData = path.join(process.cwd(), '.local-userdata');
    if (!fs.existsSync(localUserData)) {
        fs.mkdirSync(localUserData, { recursive: true });
    }
    app.setPath('userData', localUserData);
    logMain('Dev userData path impostato:', app.getPath('userData'));
}

let mainWindow;
let closeInProgress = false;
let libraryRefreshPending = false;
let rendererDidLoad = false;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        center: true,
        ...(process.platform === 'darwin'
            ? {
                titleBarStyle: 'hidden',
                titleBarOverlay: true,
            }
            : {}),
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false,
        },
    });

    const isDev = !app.isPackaged;

    const escapeHtml = (input) => String(input ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

    const showFatalPage = (title, details, extra) => {
        try {
            const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,Arial,sans-serif;background:#0b0f14;color:#e6edf3;margin:0;padding:24px}h1{font-size:18px;margin:0 0 12px}pre{white-space:pre-wrap;background:#111822;border:1px solid #263041;border-radius:10px;padding:12px;line-height:1.35;font-size:12px}p{margin:0 0 10px;color:#b6c2cf}code{background:#111822;border:1px solid #263041;border-radius:6px;padding:2px 6px}</style></head><body><h1>${escapeHtml(title)}</h1><p>Il renderer non è riuscito ad avviarsi correttamente.</p><p>Per debug: prova <code>Cmd+Q</code> per uscire e riapri l'app da Terminale per vedere i log.</p><pre>${escapeHtml(details)}${extra ? `\n\n${escapeHtml(extra)}` : ''}</pre></body></html>`;
            mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        } catch (e) {
            logError('Failed to show fatal page', { error: e?.message || String(e) });
        }
    };

    if (isDev) {
        logMain('Avvio in modalità DEV, caricamento renderer da http://localhost:3000');
        mainWindow.loadURL('http://localhost:3000');
    } else {
        logMain('Avvio in modalità PACKAGED, caricamento file dist/index.html');
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.webContents.on('did-finish-load', () => {
        rendererDidLoad = true;
        if (libraryRefreshPending && mainWindow && !mainWindow.isDestroyed()) {
            libraryRefreshPending = false;
            mainWindow.webContents.send('library-refresh');
        }
    });

    const rendererFatalHandler = (_event, payload) => {
        logError('Renderer fatal', payload);
        const msg = payload && typeof payload === 'object'
            ? `${payload.type || 'fatal'}: ${payload.message || ''}`
            : String(payload || 'fatal');
        const meta = payload && typeof payload === 'object' ? payload.meta : undefined;
        showFatalPage('Errore UI', msg, meta ? JSON.stringify(meta, null, 2) : undefined);
    };
    ipcMain.removeListener('renderer-fatal', rendererFatalHandler);
    ipcMain.on('renderer-fatal', rendererFatalHandler);

    const logRendererConsole =
        isDev ||
        String(process.env.LOG_RENDERER_CONSOLE || '').toLowerCase() === '1' ||
        String(process.env.LOG_RENDERER_CONSOLE || '').toLowerCase() === 'true';

    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
        const lvl = Number(level);
        if (!logRendererConsole && lvl < 2) return;
        if (message === '[object Object]') return;
        if (message === 'console.groupEnd' || message === 'console.groupCollapsed' || message === 'console.group') return;
        const meta = { line, sourceId };
        if (lvl >= 3) logError(`[CONSOLE] ${message}`, meta);
        else if (lvl >= 2) logWarn(`[CONSOLE] ${message}`, meta);
        else logMain(`[CONSOLE] ${message}`, meta);
    });

    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame) return;
        logError('Renderer did-fail-load', { errorCode, errorDescription, validatedURL });
        showFatalPage('Caricamento UI fallito', `${errorCode}: ${errorDescription}`, validatedURL);
    });

    mainWindow.webContents.on('render-process-gone', (_event, details) => {
        logError('Renderer process gone', details);
        showFatalPage('Renderer terminato', JSON.stringify(details, null, 2));
    });

    mainWindow.webContents.on('unresponsive', () => {
        logWarn('Window unresponsive');
    });

    mainWindow.webContents.on('responsive', () => {
        logMain('Window responsive');
    });

    mainWindow.webContents.on('context-menu', (event, params) => {
        const menu = Menu.buildFromTemplate([
            { role: 'copy', enabled: params.editFlags.canCopy, label: 'Copia' },
            { role: 'cut', enabled: params.editFlags.canCut, label: 'Taglia' },
            { role: 'paste', enabled: params.editFlags.canPaste, label: 'Incolla' },
            { type: 'separator' },
            { role: 'selectAll', label: 'Seleziona tutto' },
            ...(isDev ? [
                { type: 'separator' },
                { role: 'reload', label: 'Ricarica' },
                { role: 'toggleDevTools', label: 'Strumenti per sviluppatori' }
            ] : [])
        ]);
        menu.popup();
    });

    mainWindow.on('close', (event) => {
        if (closeInProgress) return;
        if (!rendererDidLoad) {
            closeInProgress = true;
            return;
        }
        event.preventDefault();

        logMain('Chiusura richiesta: avvio handshake di salvataggio...');
        mainWindow.webContents.send('close-request');

        setTimeout(() => {
            if (!closeInProgress && mainWindow && !mainWindow.isDestroyed()) {
                const pending = getPendingTranslationWrites();
                if (pending > 0) {
                    logWarn(`Handshake chiusura timeout ma ci sono ${pending} scritture pendenti. Attendo altri 5s.`);
                    setTimeout(() => {
                        closeInProgress = true;
                        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
                    }, 5000);
                } else {
                    logWarn('Handshake chiusura timeout: forzo chiusura.');
                    closeInProgress = true;
                    mainWindow.close();
                }
            }
        }, 10000);
    });

    ipcMain.on('ready-to-close', () => {
        logMain('Renderer pronto alla chiusura (flush completato).');
        closeInProgress = true;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.close();
        }
    });

    mainWindow.on('closed', function () {
        try { ipcMain.removeListener('renderer-fatal', rendererFatalHandler); } catch { }
        mainWindow = null;
    });

    // Inizializza i gestori IPC che richiedono il riferimento alla finestra
    setupPackageHandlers(logger, mainWindow);
    setupPdfHandlers(logger, mainWindow);
    setupProjectHandlers(logger, mainWindow);
    setupCoverHandlers(logger, mainWindow);
}

// Inizializza i gestori IPC globali
setupLogHandlers(logger);
setupSettingsHandlers(logger);

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.handle('get-system-health', async () => {
    const userDataPath = app.getPath('userData');
    let processMem = null;
    try {
        if (typeof process.getProcessMemoryInfo === 'function') {
            processMem = await process.getProcessMemoryInfo();
        }
    } catch { }
    let systemMem = null;
    try {
        if (typeof process.getSystemMemoryInfo === 'function') {
            systemMem = process.getSystemMemoryInfo();
        }
    } catch { }

    return {
        appVersion: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        isPackaged: app.isPackaged,
        userDataPath,
        translationsPath: path.join(userDataPath, 'translations'),
        logsPath: path.join(userDataPath, 'logs'),
        processMemory: processMem,
        systemMemory: systemMem
    };
});

ipcMain.handle('calculate-file-fingerprint', async (_event, filePath) => {
    try {
        if (!filePath) return null;
        return await new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);
            stream.on('error', err => reject(err));
            stream.on('data', chunk => hash.update(chunk));
            stream.on('end', () => resolve(hash.digest('hex')));
        });
    } catch (error) {
        logError('Error calculating fingerprint', error);
        return null;
    }
});

app.on('ready', async () => {
    logMain(`Application started. Version: ${app.getVersion()}`);
    await loadCachedSettings(logger);
    try {
        await ensureProjectsDataDirs();
    } catch (e) {
        logWarn('Inizializzazione cartelle dati fallita', { error: e?.message || String(e) });
    }
    setupHealthMonitoring(ipcMain, writeSequencer);

    // 0. Check for unclean shutdown
    const runningLock = path.join(app.getPath('userData'), '.running.lock');
    try {
        if (fs.existsSync(runningLock)) {
            logWarn('UNCLEAN SHUTDOWN DETECTED: The application was not closed properly last time.', { lockFile: runningLock });
            inconsistencyTracker.crashDetected++;
        }
        fs.writeFileSync(runningLock, String(Date.now()));
    } catch (e) {
        logError('Failed to handle running lock file', { error: e.message });
    }

    // Initialize UI immediately to prevent blocking
    createWindow();
    try {
        globalShortcut.register('CommandOrControl+Alt+I', () => {
            const wc = mainWindow?.webContents;
            if (!wc) return;
            if (wc.isDevToolsOpened()) wc.closeDevTools();
            else wc.openDevTools({ mode: 'detach' });
        });
    } catch (e) {
        logWarn('Failed to register DevTools shortcut', { error: e?.message || String(e) });
    }

    (async () => {
        try {
            const metrics = await buildFingerprintCache();
            if (metrics) {
                logMain(`Fingerprint cache initialized in ${metrics.elapsedMs}ms`, metrics);
            }
        } catch (e) {
            logWarn('Fingerprint cache initialization failed', { error: e.message });
        }
    })();

    (async () => {
        try {
            const result = await runOriginalFilePathUuidMigrationOnce();
            if (result?.changed) libraryRefreshPending = true;
            if (libraryRefreshPending && mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
                libraryRefreshPending = false;
                mainWindow.webContents.send('library-refresh');
            }
        } catch (e) {
            logWarn('Migrazione originalFilePath fallita', { error: e?.message || String(e) });
        }
    })();
});

app.on('will-quit', () => {
    try {
        try { globalShortcut.unregisterAll(); } catch { }
        const runningLock = path.join(app.getPath('userData'), '.running.lock');
        if (fs.existsSync(runningLock)) {
            fs.unlinkSync(runningLock);
            logMain('Clean shutdown: Removed running lock file.');
        }
    } catch (e) {
        logError('Failed to remove running lock file', { error: e.message });
    }
});

app.on('window-all-closed', function () {
    app.quit();
});

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});
