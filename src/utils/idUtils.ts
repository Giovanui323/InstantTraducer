/**
 * Utility per la gestione coerente degli ID progetto e dei nomi file.
 * Questo file è utilizzato dal processo Renderer (TypeScript).
 * IMPORTANT: KEEP IN SYNC WITH electron/idUtils.js
 */

export const PROJECT_FORMAT_VERSION = "1.0";

export const UUID_V4_FILEID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(\.json)?$/i;

export const isUuidV4FileId = (fileId: string | undefined | null): boolean => {
    return UUID_V4_FILEID_REGEX.test(String(fileId || '').trim());
};

export const normalizeProjectFileId = (fileId: string | undefined | null): string => {
    const id = ensureJsonExtension(String(fileId || '').trim());
    if (!id || id === '.json' || id === 'undefined.json') return '';
    return id;
};

export const requireUuidV4FileId = (fileId: string | undefined | null): string => {
    const id = normalizeProjectFileId(fileId);
    if (!id) throw new Error('ID progetto mancante.');
    if (!isUuidV4FileId(id)) throw new Error('ID progetto non valido: UUID richiesto.');
    return id;
};

export const generateNewProjectId = (): string => {
    const g: any = globalThis as any;
    if (g?.crypto?.randomUUID) {
        return ensureJsonExtension(g.crypto.randomUUID());
    }
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
    return ensureJsonExtension(uuid);
};

/**
 * Restituisce lo "stem" dell'ID (rimuove l'estensione .json).
 */
export const getFileIdStem = (fileId: string): string => {
    return String(fileId || '').trim().replace(/\.json$/i, '');
};

/**
 * Assicura che l'ID termini con .json.
 */
export const ensureJsonExtension = (fileId: string): string => {
    const id = String(fileId || '').trim().toLowerCase();
    if (!id) return '';
    return id.endsWith('.json') ? id : `${id}.json`;
};

export const sanitizeProjectName = (name: string | undefined | null): string => {
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
};

export const parseTrashFolderName = (folderName: string): { timestamp: number; fileIdStem: string; fileId: string } | null => {
    if (!folderName || !folderName.startsWith('trash_')) return null;
    const parts = folderName.split('_');
    if (parts.length < 3) return null;
    const timestamp = parseInt(parts[1]);
    if (Number.isNaN(timestamp)) return null;
    const fileIdStem = parts.slice(2).join('_');
    if (!fileIdStem) return null;
    return { timestamp, fileIdStem, fileId: ensureJsonExtension(fileIdStem) };
};

export const sanitizeExportName = (name: string): string => {
    const base = String(name || '').trim() || 'Libro';
    const noExt = base.replace(/\.[^/.]+$/, '');
    const sanitized = noExt.replace(/[^\w\d\- ]+/g, '_').replace(/\s+/g, ' ').trim();
    return sanitized || 'Libro';
};
