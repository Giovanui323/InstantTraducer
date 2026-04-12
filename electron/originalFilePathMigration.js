import fs from 'fs';
import path from 'path';
import { createLogger } from './logger.js';
import { getTranslationsDir, projectAssetsDirFromFileId, findOriginalPdfInAssetsDir, safeWriteFile, resolveLegacyAssetsDirFromFileId } from './fileUtils.js';
import { ensureJsonExtension, getFileIdStem, isUuidV4FileId } from './idUtils.js';

const logger = createLogger({ module: 'MIGRATION-ORIGINAL-FILE-PATH', toFile: true });
const logMain = (msg, meta) => logger.info(String(msg), meta);
const logWarn = (msg, meta) => logger.warn(String(msg), meta);
const logError = (msg, meta) => logger.error(String(msg), meta);

async function exists(p) {
    try {
        await fs.promises.access(p);
        return true;
    } catch {
        return false;
    }
}

async function moveFileCrossDevice(src, dst) {
    try {
        await fs.promises.rename(src, dst);
        return;
    } catch (e) {
        if (e && e.code !== 'EXDEV') throw e;
    }
    await fs.promises.copyFile(src, dst);
    await fs.promises.unlink(src).catch(() => { });
}

async function ensureDir(dir) {
    await fs.promises.mkdir(dir, { recursive: true });
}

function resolveUserPath(maybePath, translationsDir) {
    if (!maybePath) return '';
    const s = String(maybePath);
    if (path.isAbsolute(s)) return path.resolve(s);
    const baseDir = path.dirname(translationsDir);
    return path.resolve(baseDir, s);
}

export async function runOriginalFilePathUuidMigrationOnce() {
    const translationsDir = await getTranslationsDir();
    const markerPath = path.join(translationsDir, '.migration_originalFilePath_uuid_v2.done');

    if (await exists(markerPath)) {
        return { ran: false, changed: false };
    }

    const stats = {
        ran: true,
        changed: false,
        scanned: 0,
        updatedJson: 0,
        movedPdf: 0,
        errors: 0
    };

    logMain('Avvio migrazione originalFilePath v2 (UUID assets + legacy recovery)');

    let entries = [];
    try {
        entries = await fs.promises.readdir(translationsDir, { withFileTypes: true });
    } catch (e) {
        logError('Impossibile leggere translations dir', { translationsDir, error: e?.message || String(e) });
        throw e;
    }

    for (const ent of entries) {
        if (!ent.isFile()) continue;
        const name = ent.name;
        if (!name.endsWith('.json')) continue;
        if (name === 'undefined.json') continue;
        if (name.startsWith('.')) continue;
        if (name.endsWith('.tmp')) continue;

        stats.scanned += 1;
        const projectJsonPath = path.join(translationsDir, name);

        let raw = '';
        let project = null;
        try {
            raw = await fs.promises.readFile(projectJsonPath, 'utf-8');
            project = JSON.parse(raw);
        } catch (e) {
            stats.errors += 1;
            logWarn('Skip progetto: JSON non leggibile/parseabile', { file: name, error: e?.message || String(e) });
            continue;
        }

        const fileIdFromContent = ensureJsonExtension(typeof project?.fileId === 'string' ? project.fileId : '');
        const fileStemFromContent = getFileIdStem(fileIdFromContent);

        let fileId = '';
        if (fileStemFromContent && isUuidV4FileId(ensureJsonExtension(fileStemFromContent))) {
            fileId = fileIdFromContent;
        } else {
            const fileStemFromFilename = getFileIdStem(name);
            if (fileStemFromFilename && isUuidV4FileId(ensureJsonExtension(fileStemFromFilename))) {
                fileId = ensureJsonExtension(fileStemFromFilename);
            }
        }

        if (!fileId) continue;
        const uuidStem = getFileIdStem(fileId);

        let assetsDir;
        try {
            assetsDir = await projectAssetsDirFromFileId(fileId, false);
        } catch (e) {
            stats.errors += 1;
            logWarn('Skip progetto: impossibile determinare assetsDir', { fileId, error: e?.message || String(e) });
            continue;
        }

        // TENTATIVO DI RECUPERO CARTELLA ASSET LEGACY (se la cartella UUID è vuota o assente)
        let assetsFound = false;
        try {
            const files = await fs.promises.readdir(assetsDir);
            if (files.length > 0) assetsFound = true;
        } catch { }

        if (!assetsFound) {
            const legacyHint = project.fileName || '';
            // Se abbiamo un nome che non è l'UUID, proviamo a cercare la cartella legacy
            if (legacyHint && legacyHint !== getFileIdStem(fileId)) {
                try {
                    // resolveLegacyAssetsDirFromFileId cercherà sia "Nome" che "nome_sanitizzato"
                    const legacyFolder = await resolveLegacyAssetsDirFromFileId(legacyHint);
                    if (await exists(legacyFolder)) {
                        // Trovata! Spostiamola nella nuova posizione UUID
                        await ensureDir(path.dirname(assetsDir));
                        await fs.promises.rename(legacyFolder, assetsDir);
                        logMain(`Recuperata cartella asset legacy per ${fileId}: ${legacyFolder} -> ${assetsDir}`);
                        stats.movedPdf += 1; 
                    }
                } catch (e) {
                    // Ignoriamo errori di lookup (es. cartella non trovata o nome invalido)
                }
            }
        }

        const correctPdfPath = path.resolve(path.join(assetsDir, 'original.pdf'));
        const currentOriginal = typeof project?.originalFilePath === 'string' ? String(project.originalFilePath) : '';
        const currentOriginalAbs = resolveUserPath(currentOriginal, translationsDir);

        let updated = false;

        const correctExists = await exists(correctPdfPath);
        if (correctExists) {
            if (currentOriginalAbs !== correctPdfPath) {
                project.originalFilePath = correctPdfPath;
                updated = true;
            }
        } else {
            const foundInAssets = await findOriginalPdfInAssetsDir(assetsDir);
            if (foundInAssets && path.resolve(foundInAssets) !== correctPdfPath && !await exists(correctPdfPath)) {
                try {
                    await ensureDir(path.dirname(correctPdfPath));
                    await moveFileCrossDevice(foundInAssets, correctPdfPath);
                    stats.movedPdf += 1;
                } catch (e) {
                    stats.errors += 1;
                    logWarn('Impossibile rinominare PDF in original.pdf', { fileId, from: foundInAssets, to: correctPdfPath, error: e?.message || String(e) });
                }
            }

            if (!await exists(correctPdfPath) && currentOriginalAbs && await exists(currentOriginalAbs)) {
                try {
                    await ensureDir(path.dirname(correctPdfPath));
                    await moveFileCrossDevice(currentOriginalAbs, correctPdfPath);
                    stats.movedPdf += 1;
                } catch (e) {
                    stats.errors += 1;
                    logWarn('Impossibile spostare PDF legacy in assets UUID', { fileId, from: currentOriginalAbs, to: correctPdfPath, error: e?.message || String(e) });
                }
            }

            if (await exists(correctPdfPath)) {
                if (currentOriginalAbs !== correctPdfPath) {
                    project.originalFilePath = correctPdfPath;
                    updated = true;
                }
            }
        }

        if (updated) {
            try {
                await safeWriteFile(projectJsonPath, JSON.stringify(project, null, 2), 'utf-8');
                stats.updatedJson += 1;
                stats.changed = true;
            } catch (e) {
                stats.errors += 1;
                logWarn('Impossibile salvare JSON aggiornato', { file: name, error: e?.message || String(e) });
            }
        }
    }

    try {
        await safeWriteFile(markerPath, JSON.stringify({ doneAt: Date.now(), stats }, null, 2), 'utf-8');
    } catch (e) {
        logWarn('Impossibile scrivere marker migrazione (verrà ripetuta al prossimo avvio)', { markerPath, error: e?.message || String(e) });
        return stats;
    }

    logMain('Migrazione originalFilePath completata', stats);
    return stats;
}
