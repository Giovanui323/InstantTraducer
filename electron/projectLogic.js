import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createLogger } from './logger.js';
import {
    getTranslationsDir,
    getAssetsRootDir,
    projectAssetsDirFromFileId,
    findOriginalPdfInAssetsDir,
    safeWriteFile,
    resolveLegacyAssetsDirFromFileId
} from './fileUtils.js';
import {
    getFileIdStem,
    ensureJsonExtension,
    isUuidV4FileId,
    parseTrashFolderName
} from './idUtils.js';
import {
    mergeProjectData,
    normalizeLoadedProjectData
} from './translationMerge.js';
import { safeJoin } from './pathSecurity.js';

const logger = createLogger({ module: 'PROJECT-LOGIC', toFile: true });
const logMain = (msg, meta) => logger.info(String(msg), meta);
const logWarn = (msg, meta) => logger.warn(String(msg), meta);
const logError = (msg, meta) => logger.error(String(msg), meta);

export async function performRename(oldFileId, newFileId, name, oldPath, newPath, newInputLanguage) {
    let assetsRenamed = false;
    let oldAssets = '';
    let newAssets = '';

    try {
        const contentRaw = await fs.promises.readFile(oldPath, 'utf-8');
        const content = JSON.parse(contentRaw) || {};
        content.fileName = name;
        content.fileId = newFileId;

        if (newInputLanguage && typeof newInputLanguage === 'string') {
            content.inputLanguage = newInputLanguage;
        }

        // Gestione Asset
        const assetsRoot = await getAssetsRootDir();
        oldAssets = safeJoin(assetsRoot, getFileIdStem(oldFileId));
        newAssets = safeJoin(assetsRoot, getFileIdStem(newFileId));

        let oldAssetsExists = false;
        try {
            await fs.promises.access(oldAssets);
            oldAssetsExists = true;
        } catch { }

        // Try legacy asset path resolution if not found and not UUID
        if (!oldAssetsExists && !isUuidV4FileId(oldFileId)) {
            try {
                const legacyPath = await resolveLegacyAssetsDirFromFileId(oldFileId, false);
                await fs.promises.access(legacyPath);
                oldAssets = legacyPath;
                oldAssetsExists = true;
            } catch { }
        }

        if (oldAssetsExists && oldAssets !== newAssets) {
            logMain(`Rinomina asset: ${oldAssets} -> ${newAssets}`);
            try {
                await fs.promises.access(newAssets);
                const backupAssets = `${newAssets}_bak_${Date.now()}`;
                logWarn('Target asset folder already exists, backing up', { backupAssets });
                await fs.promises.rename(newAssets, backupAssets);
            } catch { }
            await fs.promises.rename(oldAssets, newAssets);
            assetsRenamed = true;
        }

        if (typeof content.originalFilePath === 'string' && content.originalFilePath.startsWith(oldAssets)) {
            const base = path.basename(content.originalFilePath);
            content.originalFilePath = path.join(newAssets, base);
        }

        const payload = JSON.stringify(content, null, 2);

        if (newFileId === oldFileId) {
            await safeWriteFile(oldPath, payload);
        } else {
            // Scrittura atomica del nuovo file
            await safeWriteFile(newPath, payload);

            // Verifica che il nuovo file esista e sia leggibile prima di eliminare il vecchio
            try {
                const check = await fs.promises.readFile(newPath, 'utf-8');
                JSON.parse(check);
                // Se siamo qui, il nuovo file è integro. Possiamo eliminare il vecchio.
                await fs.promises.unlink(oldPath);
            } catch (verifyError) {
                logError('Integrity verification failed after rename, rolling back assets', { error: verifyError.message });
                // Rollback asset se possibile
                if (assetsRenamed) {
                    await fs.promises.rename(newAssets, oldAssets).catch(() => { });
                    assetsRenamed = false; // Prevent double rollback in outer catch
                }
                throw new Error('Errore durante la verifica del nuovo file di progetto.');
            }
        }

        return { success: true, fileId: newFileId, fileName: name };
    } catch (e) {
        logError('performRename failed', { oldFileId, newFileId, error: e.message });

        // CRITICAL FIX: Rollback assets if JSON write failed but assets were moved
        if (assetsRenamed) {
            logWarn(`Rolling back asset rename due to JSON write failure: ${newAssets} -> ${oldAssets}`);
            try {
                await fs.promises.rename(newAssets, oldAssets);
            } catch (rollbackErr) {
                logError('CRITICAL: Asset rollback failed', { error: rollbackErr.message });
            }
        }

        return { success: false, error: e.message };
    }
}

export function groupProjectsForConsolidation(projects) {
    const groups = new Map();
    for (const p of projects) {
        const fp = typeof p?.fingerprint === 'string'
            ? p.fingerprint.trim()
            : (typeof p?.content?.fingerprint === 'string' ? p.content.fingerprint.trim() : '');

        if (fp) {
            const key = `fp:${fp}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(p);
            continue;
        }

        let rawFileName = p?.fileName || p?.content?.fileName;

        if (!rawFileName && p?.originalFilePath) {
            const base = path.basename(p.originalFilePath);
            if (!base.toLowerCase().startsWith('original.')) {
                rawFileName = base;
            }
        }

        if (!rawFileName) {
            rawFileName = getFileIdStem(p?.fileId);
        }

        const normalizedName = String(rawFileName).toLowerCase().trim()
            .replace(/\.pdf$/i, '')
            .replace(/[^a-z0-9]/g, '');

        const safeName = normalizedName || getFileIdStem(p?.fileId);
        const totalPages = p?.totalPages ?? p?.content?.totalPages ?? 0;
        const key = `name:${safeName}|pages:${totalPages}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(p);
    }

    const groupKeys = Array.from(groups.keys());
    for (const key of groupKeys) {
        if (!groups.has(key)) continue;

        const currentGroup = groups.get(key);
        for (const p of currentGroup) {
            if (p.originalFilePath && !p.originalFilePath.includes('translations/assets')) {
                const otherGroupKey = groupKeys.find(k => k !== key && groups.has(k) && groups.get(k).some(op => op.originalFilePath === p.originalFilePath));
                if (otherGroupKey) {
                    logMain(`Consolidamento: Unione per percorso identico ${key} in ${otherGroupKey}`);
                    groups.get(otherGroupKey).push(...currentGroup);
                    groups.delete(key);
                    break;
                }
            }
        }
    }
    return groups;
}

export async function performConsolidation() {
    const startedAt = Date.now();
    const translationsDir = await getTranslationsDir();
    const files = (await fs.promises.readdir(translationsDir)).filter(f => f.endsWith('.json'));

    const trashDir = path.join(translationsDir, '.trash');
    try {
        await fs.promises.mkdir(trashDir, { recursive: true });
    } catch { }
    const trashAssetsDir = path.join(trashDir, 'assets');
    try {
        await fs.promises.mkdir(trashAssetsDir, { recursive: true });
    } catch { }

    const projects = [];
    for (const fileId of files) {
        try {
            const filePath = path.join(translationsDir, ensureJsonExtension(fileId));
            const contentRaw = await fs.promises.readFile(filePath, 'utf-8');
            let content = JSON.parse(contentRaw);
            content = normalizeLoadedProjectData(content);
            const stats = await fs.promises.stat(filePath);

            const assetsDir = await projectAssetsDirFromFileId(fileId);
            const hasSafePdf = Boolean(await findOriginalPdfInAssetsDir(assetsDir));
            const translationsCount = Object.keys(content.translations || {}).length;

            projects.push({
                fileId,
                filePath,
                content,
                assetsDir,
                hasSafePdf,
                translationsCount,
                updatedAt: stats.mtimeMs,
                originalFilePath: content.originalFilePath || '',
                fileName: content.fileName || content.name || getFileIdStem(fileId),
                fingerprint: content.fingerprint || '',
                totalPages: content.totalPages || 0
            });
        } catch (e) { }
    }

    const groups = groupProjectsForConsolidation(projects);

    let fixedCount = 0;
    let mergedCount = 0;

    for (const [key, group] of groups.entries()) {
        if (group.length < 2) {
            const p = group[0];
            if (!p.hasSafePdf && p.originalFilePath && !p.originalFilePath.includes('translations/assets')) {
                try {
                    await fs.promises.access(p.originalFilePath);
                    const ext = path.extname(p.originalFilePath).toLowerCase() || '.pdf';
                    const target = path.join(p.assetsDir, `original${ext}`);
                    await fs.promises.copyFile(p.originalFilePath, target);
                    p.content.originalFilePath = target;
                    p.content.hasSafePdf = true;
                    await safeWriteFile(p.filePath, JSON.stringify(p.content, null, 2));
                    fixedCount++;
                    logMain(`Consolidamento: PDF recuperato per progetto singolo ${p.fileId}`);
                } catch { }
            }
            continue;
        }

        group.sort((a, b) => {
            if (a.hasSafePdf !== b.hasSafePdf) return a.hasSafePdf ? -1 : 1;
            if (a.translationsCount !== b.translationsCount) return b.translationsCount - a.translationsCount;
            return b.updatedAt - a.updatedAt;
        });

        const master = group[0];
        const secondaries = group.slice(1);

        logMain(`Consolidamento: Unione gruppo ${key}. Master: ${master.fileId}, Duplicati: ${secondaries.length}`);

        for (const sec of secondaries) {
            master.content = mergeProjectData(master.content, sec.content);
            try {
                await fs.promises.access(sec.assetsDir);
                const secFiles = await fs.promises.readdir(sec.assetsDir);
                for (const f of secFiles) {
                    const src = path.join(sec.assetsDir, f);
                    const dest = path.join(master.assetsDir, f);

                    const isPdf = f.toLowerCase().startsWith('original.') && f.toLowerCase().endsWith('.pdf');
                    let masterHadPdf = master.hasSafePdf;
                    if (!masterHadPdf) {
                        try {
                            await fs.promises.access(path.join(master.assetsDir, 'original.pdf'));
                            masterHadPdf = true;
                        } catch { }
                    }

                    try {
                        await fs.promises.access(dest);
                    } catch {
                        await fs.promises.copyFile(src, dest);
                        if (isPdf && !masterHadPdf) {
                            master.hasSafePdf = true;
                            fixedCount++;
                            logMain(`Consolidamento: PDF recuperato dal duplicato ${sec.fileId} per master ${master.fileId}`);
                        }
                    }
                }
                // Move to Trash
                try {
                    const timestamp = Date.now();
                    const trashFolderName = `trash_${timestamp}_${getFileIdStem(sec.fileId)}`;
                    const trashFolderPath = safeJoin(trashDir, trashFolderName);
                    await fs.promises.mkdir(trashFolderPath, { recursive: true });

                    const targetTrashAssets = path.join(trashFolderPath, 'assets');
                    await fs.promises.rename(sec.assetsDir, targetTrashAssets);

                    const targetTrashJson = path.join(trashFolderPath, sec.fileId);
                    await fs.promises.rename(sec.filePath, targetTrashJson);

                    mergedCount++;
                } catch (e) {
                    logError('Consolidation: Error moving duplicate to trash', { fileId: sec.fileId, error: e.message });
                }
            } catch (e) {
                logError('Consolidation: Error processing duplicate assets', { fileId: sec.fileId, error: e.message });
            }
        }

        if (!master.hasSafePdf && master.originalFilePath && !master.originalFilePath.includes('translations/assets')) {
            try {
                await fs.promises.access(master.originalFilePath);
                const ext = path.extname(master.originalFilePath).toLowerCase() || '.pdf';
                const target = path.join(master.assetsDir, `original${ext}`);
                await fs.promises.copyFile(master.originalFilePath, target);
                master.content.originalFilePath = target;
                master.content.hasSafePdf = true;
                fixedCount++;
                logMain(`Consolidamento: PDF recuperato da path originale per master ${master.fileId}`);
            } catch { }
        }
        await safeWriteFile(master.filePath, JSON.stringify(master.content, null, 2));
    }

    return { success: true, fixedCount, mergedCount, elapsedMs: Date.now() - startedAt };
}

export async function internalRestoreTrashItem(trashId) {
    const trashDir = await getTranslationsDir().then(dir => path.join(dir, '.trash'));
    const folderPath = safeJoin(trashDir, trashId);
    try {
        await fs.promises.access(folderPath);
    } catch {
        throw new Error('Elemento del cestino non trovato.');
    }

    const trashInfo = parseTrashFolderName(trashId);
    if (!trashInfo) throw new Error('ID cestino non valido.');
    const { fileId: sourceFileId } = trashInfo;
    const targetFileId = isUuidV4FileId(sourceFileId)
        ? ensureJsonExtension(sourceFileId)
        : ensureJsonExtension(crypto.randomUUID());

    const translationsDir = await getTranslationsDir();
    const targetJsonPath = safeJoin(translationsDir, targetFileId);
    const sourceJsonPath = safeJoin(folderPath, ensureJsonExtension(sourceFileId));

    try {
        await fs.promises.access(targetJsonPath);
        throw new Error(`Esiste già un progetto con il nome "${targetFileId}" nella libreria.`);
    } catch (e) {
        if (e.message.includes('Esiste già')) throw e;
        // Se non esiste, procediamo
    }

    // Restore JSON
    await fs.promises.rename(sourceJsonPath, targetJsonPath);

    if (targetFileId !== ensureJsonExtension(sourceFileId)) {
        try {
            const raw = await fs.promises.readFile(targetJsonPath, 'utf-8');
            const content = JSON.parse(raw || '{}') || {};
            content.fileId = targetFileId;
            if (!content.id) content.id = getFileIdStem(targetFileId);
            await safeWriteFile(targetJsonPath, JSON.stringify(content, null, 2));
        } catch { }
    }

    // Restore assets
    const sourceAssetsPath = path.join(folderPath, 'assets');
    try {
        await fs.promises.access(sourceAssetsPath);
        // Otteniamo il percorso target SENZA crearlo (create=false)
        const targetAssetsDir = await projectAssetsDirFromFileId(targetFileId, false);

        try {
            await fs.promises.access(targetAssetsDir);
            // Se esiste, facciamo un backup invece di cancellarla
            const backupPath = `${targetAssetsDir}_backup_${Date.now()}`;
            await fs.promises.rename(targetAssetsDir, backupPath);
            logWarn('Restore trash: Existing assets folder backed up', { original: targetAssetsDir, backup: backupPath });
        } catch { }

        await fs.promises.rename(sourceAssetsPath, targetAssetsDir);
    } catch (e) {
        if (e.code !== 'ENOENT') {
            logError('Restore trash: Failed to restore assets', { trashId, error: e.message });
        }
    }

    // Remove trash folder
    await fs.promises.rm(folderPath, { recursive: true, force: true });
    return targetFileId;
}
