import { ipcMain, dialog, nativeImage } from 'electron';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import {
    getTranslationsDir,
    projectAssetsDirFromFileId,
    safeWriteFile
} from './fileUtils.js';
import { requireUuidV4FileId } from './idUtils.js';
import { safeJoin } from './pathSecurity.js';
import { checkSize } from './validation.js';

let logger;
let mainWindow;
let handlersRegistered = false;
const logMain = (msg, meta) => logger?.info(String(msg), meta);
const logError = (msg, meta) => logger?.error(String(msg), meta);

const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB
const COVER_WIDTH = 400;

export function setupCoverHandlers(providedLogger, providedMainWindow) {
    logger = providedLogger;
    mainWindow = providedMainWindow;

    if (handlersRegistered) {
        return;
    }

    const channels = [
        'cover-set-from-file',
        'cover-set-from-buffer',
        'cover-set-from-url',
        'cover-remove',
        'cover-get-info'
    ];
    channels.forEach(ch => ipcMain.removeHandler(ch));
    handlersRegistered = true;

    // ── Set cover from native file dialog ──
    ipcMain.handle('cover-set-from-file', async (_event, { fileId }) => {
        const cid = `cov_${Math.random().toString(36).slice(2, 7)}`;
        try {
            const safeId = requireUuidV4FileId(fileId);
            const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow || undefined, {
                title: 'Seleziona Copertina',
                properties: ['openFile'],
                filters: [{ name: 'Immagini', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }]
            });
            if (canceled || !filePaths?.[0]) return { success: false, cancelled: true };

            const imgPath = filePaths[0];
            const raw = await fs.promises.readFile(imgPath);
            checkSize(raw, MAX_IMAGE_SIZE, 'Immagine copertina');

            const nImg = nativeImage.createFromBuffer(raw);
            if (nImg.isEmpty()) throw new Error('Formato immagine non supportato.');

            const resized = nImg.resize({ width: COVER_WIDTH });
            const jpegBuf = resized.toJPEG(0.85);

            const assetsDir = await projectAssetsDirFromFileId(safeId);
            const coverPath = path.join(assetsDir, 'cover.jpg');
            await safeWriteFile(coverPath, jpegBuf);

            const thumbnail = `data:image/jpeg;base64,${jpegBuf.toString('base64')}`;
            await updateProjectCoverMeta(safeId, 'custom');

            logMain(`[${cid}] Cover set from file`, { fileId });
            return { success: true, thumbnail };
        } catch (error) {
            logError(`[${cid}] cover-set-from-file error`, { fileId, error: error.message });
            return { success: false, error: error.message };
        }
    });

    // ── Set cover from base64 buffer (renderer-side canvas) ──
    ipcMain.handle('cover-set-from-buffer', async (_event, { fileId, dataUrl, source }) => {
        const cid = `cov_${Math.random().toString(36).slice(2, 7)}`;
        try {
            const safeId = requireUuidV4FileId(fileId);

            const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
            const raw = Buffer.from(base64, 'base64');
            checkSize(raw, MAX_IMAGE_SIZE, 'Immagine copertina');

            const nImg = nativeImage.createFromBuffer(raw);
            if (nImg.isEmpty()) throw new Error('Formato immagine non supportato.');

            const resized = nImg.resize({ width: COVER_WIDTH });
            const jpegBuf = resized.toJPEG(0.85);

            const assetsDir = await projectAssetsDirFromFileId(safeId);
            const coverPath = path.join(assetsDir, 'cover.jpg');
            await safeWriteFile(coverPath, jpegBuf);

            const thumbnail = `data:image/jpeg;base64,${jpegBuf.toString('base64')}`;
            await updateProjectCoverMeta(safeId, source || 'custom');

            logMain(`[${cid}] Cover set from buffer`, { fileId, source });
            return { success: true, thumbnail };
        } catch (error) {
            logError(`[${cid}] cover-set-from-buffer error`, { fileId, error: error.message });
            return { success: false, error: error.message };
        }
    });

    // ── Set cover from URL (Open Library etc.) ──
    ipcMain.handle('cover-set-from-url', async (_event, { fileId, url, source, isbn }) => {
        const cid = `cov_${Math.random().toString(36).slice(2, 7)}`;
        try {
            const safeId = requireUuidV4FileId(fileId);

            const raw = await downloadBuffer(url);
            checkSize(raw, MAX_IMAGE_SIZE, 'Immagine copertina da URL');

            const nImg = nativeImage.createFromBuffer(raw);
            if (nImg.isEmpty()) throw new Error('Formato immagine non supportato.');

            const resized = nImg.resize({ width: COVER_WIDTH });
            const jpegBuf = resized.toJPEG(0.85);

            const assetsDir = await projectAssetsDirFromFileId(safeId);
            const coverPath = path.join(assetsDir, 'cover.jpg');
            await safeWriteFile(coverPath, jpegBuf);

            const thumbnail = `data:image/jpeg;base64,${jpegBuf.toString('base64')}`;
            await updateProjectCoverMeta(safeId, source || 'isbn', false, isbn);

            logMain(`[${cid}] Cover set from URL`, { fileId, url: url.slice(0, 80) });
            return { success: true, thumbnail };
        } catch (error) {
            logError(`[${cid}] cover-set-from-url error`, { fileId, error: error.message });
            return { success: false, error: error.message };
        }
    });

    // ── Remove custom cover ──
    ipcMain.handle('cover-remove', async (_event, { fileId }) => {
        const cid = `cov_${Math.random().toString(36).slice(2, 7)}`;
        try {
            const safeId = requireUuidV4FileId(fileId);
            const assetsDir = await projectAssetsDirFromFileId(safeId, false);
            const coverPath = path.join(assetsDir, 'cover.jpg');

            try {
                await fs.promises.access(coverPath);
                await fs.promises.unlink(coverPath);
            } catch { /* no cover file, that's fine */ }

            await updateProjectCoverMeta(safeId, undefined, true);

            logMain(`[${cid}] Cover removed`, { fileId });
            return { success: true };
        } catch (error) {
            logError(`[${cid}] cover-remove error`, { fileId, error: error.message });
            return { success: false, error: error.message };
        }
    });

    // ── Get cover info ──
    ipcMain.handle('cover-get-info', async (_event, { fileId }) => {
        try {
            const safeId = requireUuidV4FileId(fileId);
            const assetsDir = await projectAssetsDirFromFileId(safeId, false);
            const coverPath = path.join(assetsDir, 'cover.jpg');
            const sourcePath = path.join(assetsDir, 'source-p1.jpg');

            let hasCustomCover = false;
            try { await fs.promises.access(coverPath); hasCustomCover = true; } catch { }

            let hasFirstPage = false;
            try { await fs.promises.access(sourcePath); hasFirstPage = true; } catch { }

            // Read project JSON for metadata
            const translationsDir = await getTranslationsDir();
            const jsonPath = safeJoin(translationsDir, requireUuidV4FileId(fileId));
            let coverSource = undefined;
            let isbn = undefined;
            try {
                const content = JSON.parse(await fs.promises.readFile(jsonPath, 'utf-8'));
                coverSource = content.coverSource;
                isbn = content.isbn;
            } catch { }

            return {
                hasCustomCover,
                hasFirstPage,
                coverSource: coverSource || (hasCustomCover ? 'custom' : undefined),
                isbn
            };
        } catch (error) {
            return { hasCustomCover: false, hasFirstPage: false, error: error.message };
        }
    });
}

// ── Helpers ──

async function updateProjectCoverMeta(fileId, source, remove = false, isbn = undefined) {
    const translationsDir = await getTranslationsDir();
    const jsonPath = safeJoin(translationsDir, requireUuidV4FileId(fileId));
    const content = JSON.parse(await fs.promises.readFile(jsonPath, 'utf-8'));
    if (remove) {
        delete content.coverSource;
        delete content.isbn;
    } else {
        content.coverSource = source || 'custom';
        if (isbn) content.isbn = isbn;
    }
    await safeWriteFile(jsonPath, JSON.stringify(content, null, 2));
}

function downloadBuffer(url) {
    return new Promise((resolve, reject) => {
        const proto = url.startsWith('https') ? https : http;
        const request = proto.get(url, { timeout: 15000 }, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                return downloadBuffer(response.headers.location).then(resolve, reject);
            }
            if (response.statusCode !== 200) {
                return reject(new Error(`HTTP ${response.statusCode}`));
            }
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', reject);
        });
        request.on('error', reject);
        request.on('timeout', () => { request.destroy(); reject(new Error('Download timeout')); });
    });
}
