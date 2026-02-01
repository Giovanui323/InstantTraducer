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
