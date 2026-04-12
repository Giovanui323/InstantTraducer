import { ipcMain, dialog } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { 
    getTranslationsDir, 
    projectAssetsDirFromFileId, 
    findOriginalPdfInAssetsDir,
    safeWriteFile 
} from './fileUtils.js';
import { 
    ensureJsonExtension, 
    getFileIdStem,
    requireUuidV4FileId
} from './idUtils.js';
import { 
    validateProjectData,
    validateProjectDataShape,
    checkSize 
} from './validation.js';
import { withTimeout } from './mainUtils.js';
import { safeJoin } from './pathSecurity.js';
import { calculateFileHash } from './hashUtils.js';
import { buildFingerprintCache, getCachedProjectByFingerprint, cacheProjectFingerprint } from './projectHandlers.js';

let logger;
let mainWindow;
let handlersRegistered = false;
const logMain = (msg, meta) => logger?.info(String(msg), meta);
const logDebug = (msg, meta) => logger?.debug(String(msg), meta);
const logError = (msg, meta) => logger?.error(String(msg), meta);

const MAX_JSON_SIZE = 100 * 1024 * 1024; // 100MB
const DEFAULT_IPC_TIMEOUT = 60000;       // 60s

export function setupPackageHandlers(providedLogger, providedMainWindow) {
    logger = providedLogger;
    mainWindow = providedMainWindow;

    if (handlersRegistered) {
        logDebug('IPC handlers for packageLogic already registered, updating window reference only');
        return;
    }

    // Remove existing handlers to prevent "second handler" error
    ipcMain.removeHandler('export-project-package');
    ipcMain.removeHandler('import-project-package');

    handlersRegistered = true;

    ipcMain.handle('export-project-package', async (_event, { fileId }) => {
        const cid = `exp_${Math.random().toString(36).slice(2, 7)}`;
        try {
            if (!fileId) throw new Error('FileId mancante');
            const safeId = requireUuidV4FileId(fileId);
            logMain(`[${cid}] Starting project export`, { fileId });

            const translationsDir = await getTranslationsDir();
            const jsonPath = safeJoin(translationsDir, ensureJsonExtension(safeId));
            const assetsDir = await projectAssetsDirFromFileId(safeId, false);
            const originalPdfPath = await findOriginalPdfInAssetsDir(assetsDir);

            try {
                await fs.promises.access(jsonPath, fs.constants.F_OK);
            } catch (err) {
                logError(`[${cid}] Export package failed: file not found or inaccessible`, { jsonPath, fileId, error: err.message });
                throw new Error(`File di traduzione (JSON) non trovato o non accessibile: ${err.message}`);
            }

            let hasPdf = false;
            hasPdf = Boolean(originalPdfPath);
            if (!hasPdf) logDebug(`[${cid}] PDF not found in assets, exporting JSON only`, { fileId });

            const zip = new AdmZip();
            const jsonContent = await fs.promises.readFile(jsonPath, 'utf-8');
            
            const projectData = JSON.parse(jsonContent);
            validateProjectData(projectData);
            checkSize(jsonContent, MAX_JSON_SIZE, 'Project JSON');

            zip.addFile('project.json', Buffer.from(jsonContent, 'utf-8'));

            if (hasPdf) {
                const pdfContent = await fs.promises.readFile(originalPdfPath);
                checkSize(pdfContent, MAX_JSON_SIZE, 'Original PDF');
                zip.addFile('original.pdf', pdfContent);
            }

            const cleanId = getFileIdStem(safeId);
            const { canceled, filePath } = await dialog.showSaveDialog(mainWindow || undefined, {
                title: 'Esporta Pacchetto Progetto',
                defaultPath: `Project_${cleanId}.gpt`,
                filters: [{ name: 'InstantTraducer Project (.gpt)', extensions: ['gpt'] }]
            });

            if (canceled || !filePath) {
                logMain(`[${cid}] Export cancelled by user`, { fileId });
                return { success: false, cancelled: true };
            }

            await withTimeout(new Promise((resolve, reject) => {
                zip.writeZip(filePath, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            }), DEFAULT_IPC_TIMEOUT, 'Zip write');
            
            logMain(`[${cid}] Project exported successfully`, { fileId, filePath });
            return { success: true, path: filePath };

        } catch (error) {
            logError(`[${cid}] Export package error`, { fileId, error: error.message });
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('import-project-package', async (_event) => {
        const cid = `imp_${Math.random().toString(36).slice(2, 7)}`;
        try {
            const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
                title: 'Importa Pacchetto Progetto',
                properties: ['openFile'],
                filters: [{ name: 'InstantTraducer Project (.gpt)', extensions: ['gpt'] }]
            });

            if (canceled || filePaths.length === 0) return null;

            const packagePath = filePaths[0];
            logMain(`[${cid}] Starting package import`, { packagePath });

            const zip = new AdmZip(packagePath);
            const zipEntries = zip.getEntries();

            const jsonEntry = zipEntries.find(entry => entry.entryName === 'project.json');
            if (!jsonEntry) throw new Error('Pacchetto non valido: project.json mancante.');

            const jsonContent = zip.readAsText(jsonEntry);
            checkSize(jsonContent, MAX_JSON_SIZE, 'Imported Project JSON');

            let projectData;
            try {
                projectData = JSON.parse(jsonContent);
                validateProjectDataShape(projectData);
            } catch (e) {
                logError(`[${cid}] Import failed: invalid JSON structure or validation failure`, { error: e.message, jsonSnippet: jsonContent.slice(0, 100) });
                throw new Error(`Pacchetto non valido: JSON corrotto o struttura non valida (${e.message}).`);
            }

            const translationsDir = await getTranslationsDir();
            const originalFileName = typeof projectData.fileName === 'string' ? projectData.fileName.trim() : '';
            const finalFileName = originalFileName || 'Imported Project';

            const pdfEntry = zipEntries.find(entry => entry.entryName === 'original.pdf');
            const pdfBuffer = pdfEntry ? zip.readFile(pdfEntry) : null;
            if (pdfBuffer) checkSize(pdfBuffer, MAX_JSON_SIZE, 'Imported Original PDF');

            let fingerprint = typeof projectData.fingerprint === 'string' ? projectData.fingerprint.trim() : '';
            if (!fingerprint && pdfBuffer) {
                fingerprint = await calculateFileHash(pdfBuffer);
            }

            if (fingerprint) {
                await buildFingerprintCache();
                const cached = getCachedProjectByFingerprint(fingerprint);
                if (cached?.fileId) {
                    logMain(`[${cid}] Import skipped: duplicate fingerprint found`, { fingerprint, fileId: cached.fileId });
                    return cached.fileId;
                }
            }

            const newUUID = crypto.randomUUID();
            const fileId = ensureJsonExtension(newUUID);
            const targetJsonPath = safeJoin(translationsDir, ensureJsonExtension(fileId));
            const targetAssetsDir = await projectAssetsDirFromFileId(fileId);

            let newOriginalPdfPath;
            if (pdfBuffer) {
                newOriginalPdfPath = path.join(targetAssetsDir, 'original.pdf');
                await safeWriteFile(newOriginalPdfPath, pdfBuffer);
            }

            if (newOriginalPdfPath) {
                projectData.originalFilePath = newOriginalPdfPath;
            } else {
                delete projectData.originalFilePath;
            }
            projectData.createdAt = Date.now();
            projectData.updatedAt = Date.now();
            projectData.fileName = finalFileName;
            projectData.fileId = fileId;
            projectData.id = newUUID;
            if (fingerprint) projectData.fingerprint = fingerprint;

            validateProjectData(projectData);

            await safeWriteFile(targetJsonPath, JSON.stringify(projectData, null, 2));
            if (fingerprint) cacheProjectFingerprint(fingerprint, fileId, finalFileName);

            logMain(`[${cid}] Package imported successfully`, { fileId });
            return fileId;

        } catch (error) {
            logError(`[${cid}] Import package error`, { error: error.message });
            return null;
        }
    });
}
