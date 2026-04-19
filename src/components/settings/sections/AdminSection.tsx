import React, { useState } from 'react';
import { Shield, Lock, Unlock, Eye, EyeOff, Check, AlertCircle } from 'lucide-react';
import type { AdminAuthState } from '../../../hooks/useAdminAuth';

interface AdminSectionProps {
  auth: AdminAuthState;
}

export const AdminSection: React.FC<AdminSectionProps> = ({ auth }) => {
  const { isAdmin, isSuperAdmin, unlock, lock } = auth;
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justUnlocked, setJustUnlocked] = useState(false);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const ok = unlock(password);
    if (ok) {
      setPassword('');
      setError(null);
      setJustUnlocked(true);
      setTimeout(() => setJustUnlocked(false), 2000);
    } else {
      setError('Password non corretta.');
    }
  };

  const handleLock = () => {
    lock();
    setPassword('');
    setError(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-surface-4/50 flex items-center justify-center text-txt-primary border border-border-muted">
          <Shield size={18} />
        </div>
        <div>
          <div className="text-sm font-bold text-txt-primary">Area Admin</div>
          <div className="text-[11px] text-txt-muted">
            Sblocca le impostazioni avanzate. La password admin dà accesso a modelli, API keys, costi, diagnostica.
            La password super-admin aggiunge la gestione dei prompt.
          </div>
        </div>
      </div>

      {isAdmin ? (
        <div className="rounded-2xl border border-success/30 bg-success/10 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-success/20 flex items-center justify-center text-success">
              <Unlock size={18} />
            </div>
            <div>
              <div className="text-sm font-bold text-success">
                {isSuperAdmin ? 'Accesso super-admin attivo' : 'Accesso admin attivo'}
              </div>
              <div className="text-[11px] text-txt-muted">
                {isSuperAdmin
                  ? 'Tutte le sezioni sono visibili e modificabili, inclusa la gestione dei prompt. Lo stato persiste tra le sessioni finché non blocchi manualmente.'
                  : 'Sezioni admin sbloccate. La gestione dei prompt resta riservata ai super-admin — inserisci la password super-admin per accedervi.'}
              </div>
            </div>
          </div>
          {!isSuperAdmin && (
            <form onSubmit={handleSubmit} className="space-y-2 pt-2 border-t border-success/20">
              <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wider">
                Eleva a super-admin
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Password super-admin"
                    className="w-full bg-surface-4/50 border border-border-muted rounded-xl py-2 pl-3 pr-10 text-sm text-txt-primary placeholder:text-txt-faint outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 font-mono transition-all duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-txt-muted hover:text-txt-primary hover:bg-surface-4/50 transition-colors"
                    aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={!password.trim()}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition-colors"
                >
                  <Unlock size={14} />
                  Eleva
                </button>
              </div>
              {error && (
                <div className="flex items-center gap-2 text-[11px] text-danger">
                  <AlertCircle size={12} />
                  <span>{error}</span>
                </div>
              )}
              {justUnlocked && (
                <div className="inline-flex items-center gap-1 text-[11px] text-success">
                  <Check size={12} /> Sbloccato
                </div>
              )}
            </form>
          )}
          <button
            type="button"
            onClick={handleLock}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-4/50 hover:bg-surface-4 border border-border-muted text-xs font-bold text-txt-primary transition-colors"
          >
            <Lock size={14} />
            Blocca area admin
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-border-muted bg-surface-3/40 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-surface-4/50 flex items-center justify-center text-txt-muted border border-border-muted">
              <Lock size={18} />
            </div>
            <div>
              <div className="text-sm font-bold text-txt-primary">Area bloccata</div>
              <div className="text-[11px] text-txt-muted">
                Inserisci la password admin (o super-admin per sbloccare anche la gestione dei prompt).
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-txt-muted uppercase tracking-wider">
              Password admin / super-admin
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                placeholder="Inserisci password"
                className="w-full bg-surface-4/50 border border-border-muted rounded-xl py-2.5 pl-3 pr-10 text-sm text-txt-primary placeholder:text-txt-faint outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 font-mono transition-all duration-200"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-txt-muted hover:text-txt-primary hover:bg-surface-4/50 transition-colors"
                aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-[11px] text-danger">
                <AlertCircle size={12} />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={!password.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition-colors"
            >
              <Unlock size={14} />
              Sblocca
            </button>
            {justUnlocked && (
              <span className="inline-flex items-center gap-1 text-[11px] text-success">
                <Check size={12} /> Sbloccato
              </span>
            )}
          </div>

          <div className="text-[11px] text-txt-muted leading-relaxed border-t border-border-muted pt-3">
            Non ricordi la password? Contatta l'amministratore del tuo provider.
          </div>
        </form>
      )}
    </div>
  );
};
