/**
 * Utility per la gestione coerente degli ID progetto e dei nomi file.
 * Questo file è utilizzato dal processo Main (Node.js).
 * IMPORTANT: KEEP IN SYNC WITH src/utils/idUtils.ts
 */

import crypto from 'crypto';
import { createLogger } from './logger.js';
const logger = createLogger({ module: 'ID-UTILS' });

export const PROJECT_FORMAT_VERSION = "1.0";

export const UUID_V4_FILEID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(\.json)?$/i;

export function isUuidV4FileId(fileId) {
    return UUID_V4_FILEID_REGEX.test(String(fileId || '').trim());
}

export function normalizeProjectFileId(fileId) {
    const id = ensureJsonExtension(String(fileId || '').trim());
    if (!id || id === '.json' || id === 'undefined.json') return '';
    return id;
}

export function requireUuidV4FileId(fileId) {
    const id = normalizeProjectFileId(fileId);
    if (!id) throw new Error('ID progetto mancante.');
    if (!isUuidV4FileId(id)) throw new Error('ID progetto non valido: UUID richiesto.');
    return id;
}

/**
 * Generates a completely new random UUID-based ID.
 * Use this when creating a NEW project from scratch.
 */
export function generateNewProjectId() {
    if (crypto.randomUUID) {
        return ensureJsonExtension(crypto.randomUUID());
    }
    const b = crypto.randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = b.toString('hex');
    const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return ensureJsonExtension(uuid);
}

export function getFileIdStem(fileId) {
    return String(fileId || '').trim().replace(/\.json$/i, '');
}

export function ensureJsonExtension(fileId) {
    const id = String(fileId || '').trim().toLowerCase();
    if (!id) return '';
    return id.endsWith('.json') ? id : `${id}.json`;
}

export function parseTrashFolderName(folderName) {
    if (!folderName || !folderName.startsWith('trash_')) return null;
    const parts = folderName.split('_');

    // Validazione strutturale rigorosa
    if (parts.length < 3) {
        logger.error(`Struttura cartella cestino invalida: ${folderName}`);
        return null;
    }

    const timestamp = parseInt(parts[1]);
    if (isNaN(timestamp)) {
        logger.error(`Timestamp cestino invalido: ${parts[1]} in ${folderName}`);
        return null;
    }

    const fileIdStem = parts.slice(2).join('_');
    if (!fileIdStem) {
        logger.error(`ID progetto mancante nel nome cartella cestino: ${folderName}`);
        return null;
    }

    return {
        timestamp,
        fileIdStem,
        fileId: ensureJsonExtension(fileIdStem)
    };
}

export function sanitizeProjectName(name) {
    const raw = String(name || '').trim();
    if (!raw || raw === 'undefined') return '';

    const maybeId = ensureJsonExtension(raw);
    if (isUuidV4FileId(maybeId)) return raw.toLowerCase();

    const noExt = raw.replace(/\.json$/i, '');
    const sanitized = noExt
        .replace(/[\\/]+/g, '_')
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_-]+/gi, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();

    return sanitized;
}

export function sanitizeExportName(name) {
    const base = String(name || '').trim() || 'Libro';
    const noExt = base.replace(/\.[^/.]+$/, '');
    const sanitized = noExt.replace(/[^\w\d\- ]+/g, '_').replace(/\s+/g, ' ').trim();
    return sanitized || 'Libro';
}
