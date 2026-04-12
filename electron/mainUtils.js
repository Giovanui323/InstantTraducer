/**
 * Utility generiche per il processo Main (Node.js).
 */

/**
 * Utility per eseguire una promise con un timeout.
 */
export async function withTimeout(promise, ms, operationName = 'Operazione') {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`${operationName} in timeout dopo ${ms}ms`));
        }, ms);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Utility per eseguire un'operazione asincrona con tentativi multipli e backoff esponenziale.
 */
export async function retry(fn, maxAttempts = 3, initialDelay = 500, maxDelay = 10000) {
    let lastError;
    for (let i = 0; i < maxAttempts; i++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (i < maxAttempts - 1) {
                // Backoff esponenziale con jitter per evitare "thundering herd"
                const delay = Math.min(maxDelay, initialDelay * Math.pow(2, i));
                const jitter = Math.random() * 0.3 * delay; // 30% jitter
                await new Promise(r => setTimeout(r, delay + jitter));
            }
        }
    }
    throw lastError;
}

export function parseImageDataUrl(dataUrl) {
    const value = String(dataUrl || '');
    const match = /^data:(image\/(png|jpeg));base64,(.+)$/i.exec(value);
    if (!match) throw new Error('Data URL immagine non valido.');
    const mime = match[1].toLowerCase();
    const ext = match[2].toLowerCase() === 'png' ? 'png' : 'jpg';
    const base64 = match[3];
    return { mime, ext, base64 };
}

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return ch;
    }
});

export const redactSettings = (settings) => {
    if (!settings) return settings;
    try {
        const clone = JSON.parse(JSON.stringify(settings));
        const sensitiveKeys = ['apiKey', 'apiKeyEnc', 'password', 'token', 'secret'];
        
        const traverseAndRedact = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            for (const key in obj) {
                if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
                    obj[key] = '[REDACTED]';
                } else if (typeof obj[key] === 'object') {
                    traverseAndRedact(obj[key]);
                }
            }
        };
        
        traverseAndRedact(clone);
        return clone;
    } catch (e) {
        return '[ERROR REDACTING]';
    }
};
