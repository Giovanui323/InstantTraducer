import { useState, useEffect, useCallback } from 'react';

const ADMIN_PASSWORD = 'LUCA';
const SUPER_ADMIN_PASSWORD = 'SUPERLUCA';
const STORAGE_KEY = 'translatorClaude.adminUnlocked';

export type AdminRole = 'none' | 'admin' | 'super';

const readStoredRole = (): AdminRole => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return 'none';
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'super') return 'super';
    // Retrocompat: la versione precedente salvava '1' per admin.
    if (v === 'admin' || v === '1') return 'admin';
    return 'none';
  } catch {
    return 'none';
  }
};

const writeStoredRole = (role: AdminRole) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (role === 'none') {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, role);
    }
  } catch {
    /* ignore storage failures (private mode, quota, ...) */
  }
};

export interface AdminAuthState {
  role: AdminRole;
  isAdmin: boolean;       // admin O super admin
  isSuperAdmin: boolean;  // solo super admin
  unlock: (password: string) => boolean;
  lock: () => void;
}

/**
 * Hook di autenticazione admin: due livelli.
 *   - LUCA      → admin (sezioni avanzate tranne "Gestione Prompt")
 *   - SUPERLUCA → super admin (tutto, incluso "Gestione Prompt")
 * Stato persistente su localStorage. La password è hardcoded nel bundle,
 * quindi è un gate UX, non una protezione crittografica.
 */
export const useAdminAuth = (): AdminAuthState => {
  const [role, setRole] = useState<AdminRole>(() => readStoredRole());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setRole(readStoredRole());
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const unlock = useCallback((password: string): boolean => {
    const p = (password || '').trim();
    if (p === SUPER_ADMIN_PASSWORD) {
      writeStoredRole('super');
      setRole('super');
      return true;
    }
    if (p === ADMIN_PASSWORD) {
      writeStoredRole('admin');
      setRole('admin');
      return true;
    }
    return false;
  }, []);

  const lock = useCallback(() => {
    writeStoredRole('none');
    setRole('none');
  }, []);

  return {
    role,
    isAdmin: role === 'admin' || role === 'super',
    isSuperAdmin: role === 'super',
    unlock,
    lock,
  };
};
