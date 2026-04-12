
import crypto from 'crypto';
import fs from 'fs';
import { createLogger } from './logger.js';

const logger = createLogger({ module: 'HASH-UTILS' });

/**
 * Calcola l'hash SHA-256 di un buffer o di un file.
 * @param {Buffer|Uint8Array|ArrayBuffer|string} input - Buffer/bytes del file o percorso del file.
 * @returns {Promise<string>} Hash SHA-256 in esadecimale.
 */
export async function calculateFileHash(input) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');

        if (Buffer.isBuffer(input)) {
            hash.update(input);
            resolve(hash.digest('hex'));
        } else if (input instanceof ArrayBuffer) {
            hash.update(Buffer.from(new Uint8Array(input)));
            resolve(hash.digest('hex'));
        } else if (ArrayBuffer.isView(input)) {
            const view = input;
            hash.update(Buffer.from(view.buffer, view.byteOffset, view.byteLength));
            resolve(hash.digest('hex'));
        } else if (typeof input === 'string') {
            const stream = fs.createReadStream(input);
            stream.on('error', err => reject(err));
            stream.on('data', chunk => hash.update(chunk));
            stream.on('end', () => resolve(hash.digest('hex')));
        } else {
            reject(new Error('Input non valido per calcolo hash (richiesto Buffer/Uint8Array/ArrayBuffer o path stringa)'));
        }
    });
}
