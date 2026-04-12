import path from 'path';

export const isPathInside = (baseDir, candidatePath) => {
  const base = path.resolve(String(baseDir || ''));
  const target = path.resolve(String(candidatePath || ''));
  const rel = path.relative(base, target);
  return rel === '' || rel === '.' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

export function safeJoinAssets(assetsDir, relPath) {
  const normalized = path.normalize(String(relPath || ''));
  const segments = normalized.split(/[\\/]+/g).filter(Boolean);
  if (segments.includes('..')) {
    throw new Error('Accesso negato: il percorso è fuori dalla directory del progetto.');
  }
  const safeRel = normalized.replace(/^([\\\/]+|[A-Za-z]:[\\\/]+)+/, '');
  const base = path.resolve(String(assetsDir || ''));
  const absPath = path.resolve(base, safeRel);

  if (!isPathInside(base, absPath)) {
    throw new Error('Accesso negato: il percorso è fuori dalla directory del progetto.');
  }
  return absPath;
}

/**
 * Unisce i componenti del percorso in modo sicuro, impedendo la risalita (path traversal)
 * e garantendo che il risultato sia contenuto nella directory di base.
 */
export function safeJoin(baseDir, ...parts) {
  const normalizedParts = parts.map(p => path.normalize(String(p || '')));
  
  // Rimuove eventuali slash iniziali o lettere di unità per evitare percorsi assoluti indesiderati
  const sanitizedParts = normalizedParts.map(p => p.replace(/^([\\\/]+|[A-Za-z]:[\\\/]+)+/, ''));

  for (const part of sanitizedParts) {
    if (part.split(/[\\/]+/g).includes('..')) {
      throw new Error('Accesso negato: tentativo di path traversal rilevato.');
    }
  }

  const base = path.resolve(String(baseDir || ''));
  const absPath = path.resolve(base, ...sanitizedParts);

  if (!isPathInside(base, absPath)) {
    throw new Error('Accesso negato: il percorso risultante è fuori dalla directory consentita.');
  }
  return absPath;
}
