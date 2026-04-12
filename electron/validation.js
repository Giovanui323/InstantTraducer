/**
 * Utility per la validazione strutturale dei dati JSON.
 * Questo file è utilizzato dal processo Main (Node.js).
 */

/**
 * Valida la struttura dei dati di un progetto.
 */
import { isUuidV4FileId, normalizeProjectFileId } from './idUtils.js';

export function validateProjectDataShape(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('Dati progetto non validi: atteso un oggetto.');
    }

    if (data.translations && (typeof data.translations !== 'object' || Array.isArray(data.translations))) {
        throw new Error('Dati progetto non validi: translations deve essere un oggetto (mappa).');
    }

    if (data.totalPages !== undefined) {
        const n = Number(data.totalPages);
        if (isNaN(n) || n < 0) throw new Error('Dati progetto non validi: totalPages non valido.');
    }

    return true;
}

export function validateProjectData(data) {
    validateProjectDataShape(data);

    // Campi obbligatori minimi per un progetto
    const required = ['fileName', 'fileId'];
    for (const field of required) {
        if (!data[field]) {
            throw new Error(`Dati progetto non validi: campo "${field}" mancante.`);
        }
    }

    if (typeof data.fileName !== 'string') throw new Error('Dati progetto non validi: fileName deve essere una stringa.');
    if (typeof data.fileId !== 'string') throw new Error('Dati progetto non validi: fileId deve essere una stringa.');

    const normalizedId = normalizeProjectFileId(data.fileId);
    if (!normalizedId || !isUuidV4FileId(normalizedId)) {
        throw new Error('Dati progetto non validi: fileId deve essere un UUID v4 (con .json).');
    }

    return true;
}

/**
 * Valida la struttura delle impostazioni dell'app.
 */
export function validateSettings(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('Impostazioni non valide: atteso un oggetto.');
    }

    // Le impostazioni possono essere vuote all'inizio, ma se presenti devono essere coerenti
    if (data.gemini && typeof data.gemini !== 'object') throw new Error('Impostazioni non valide: sezione gemini deve essere un oggetto.');
    if (data.openai && typeof data.openai !== 'object') throw new Error('Impostazioni non valide: sezione openai deve essere un oggetto.');
    
    return true;
}

/**
 * Valida la struttura dei gruppi.
 */
export function validateGroups(data) {
    if (!Array.isArray(data)) {
        throw new Error('Gruppi non validi: atteso un array.');
    }

    for (let i = 0; i < data.length; i++) {
        const g = data[i];
        if (!g || typeof g !== 'object' || !g.id || !g.name) {
            throw new Error(`Gruppo all'indice ${i} non valido: campi id o name mancanti.`);
        }
    }

    return true;
}

/**
 * Utility per verificare la dimensione di un oggetto o buffer.
 */
export function checkSize(data, maxSize, label = 'Dati') {
    let size = 0;
    if (Buffer.isBuffer(data)) {
        size = data.length;
    } else if (typeof data === 'string') {
        size = Buffer.byteLength(data, 'utf-8');
    } else {
        size = Buffer.byteLength(JSON.stringify(data), 'utf-8');
    }

    if (size > maxSize) {
        const mb = (size / (1024 * 1024)).toFixed(2);
        const limitMb = (maxSize / (1024 * 1024)).toFixed(2);
        throw new Error(`${label} troppo grande: ${mb}MB (limite: ${limitMb}MB).`);
    }
    
    return size;
}
