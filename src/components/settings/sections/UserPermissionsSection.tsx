import React from 'react';
import { Users, ShieldCheck, Info } from 'lucide-react';
import type { AISettings, AIProvider, UserPermissions } from '../../../types';
import { ToggleSwitch } from '../ToggleSwitch';
import {
  GEMINI_MODELS_LIST,
  OPENAI_MODELS_LIST,
  CLAUDE_MODELS_LIST,
  GROQ_MODELS_LIST,
  MODAL_MODELS_LIST,
  ZAI_MODELS_LIST,
  OPENROUTER_MODELS_LIST,
  ModelInfo,
} from '../../../constants';

interface UserPermissionsSectionProps {
  draftSettings: AISettings;
  updateDraft: (updates: Partial<AISettings>) => void;
}

type ProviderKey = Exclude<AIProvider, 'custom'>;

const PROVIDERS: Array<{ id: ProviderKey; label: string; list: ModelInfo[] }> = [
  { id: 'gemini', label: 'Google Gemini', list: GEMINI_MODELS_LIST },
  { id: 'openai', label: 'OpenAI', list: OPENAI_MODELS_LIST },
  { id: 'claude', label: 'Anthropic Claude', list: CLAUDE_MODELS_LIST },
  { id: 'groq', label: 'Groq', list: GROQ_MODELS_LIST },
  { id: 'modal', label: 'Modal', list: MODAL_MODELS_LIST },
  { id: 'zai', label: 'Z.ai (Zhipu)', list: ZAI_MODELS_LIST },
  { id: 'openrouter', label: 'OpenRouter', list: OPENROUTER_MODELS_LIST },
];

const selectClasses = 'bg-surface-4/50 border border-border-muted rounded-xl py-2 px-3 text-[12px] text-txt-primary outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all duration-200';

export const UserPermissionsSection: React.FC<UserPermissionsSectionProps> = ({ draftSettings, updateDraft }) => {
  const perms: UserPermissions = draftSettings.userPermissions || {};

  const setProviderPerm = (provider: ProviderKey, model: string | null) => {
    const next: UserPermissions = { ...perms };
    if (model == null) {
      delete next[provider];
    } else {
      next[provider] = { model };
    }
    updateDraft({ userPermissions: next });
  };

  const allowedCount = Object.keys(perms).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-surface-4/50 flex items-center justify-center text-txt-primary border border-border-muted">
          <Users size={18} />
        </div>
        <div>
          <div className="text-sm font-bold text-txt-primary">Permessi Utente</div>
          <div className="text-[11px] text-txt-muted">
            Scegli quali provider (e quale singolo modello per provider) saranno disponibili agli utenti non-admin.
            Gli utenti potranno inserire la propria API key, ma non potranno scegliere il modello.
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4 flex gap-3">
        <Info size={16} className="shrink-0 mt-0.5 text-accent" />
        <div className="text-[12px] leading-relaxed text-txt-secondary">
          <strong className="text-txt-primary">Come funziona:</strong> per ogni provider, spunta "Permetti" e seleziona il
          singolo modello che gli utenti useranno. Se un provider non è spuntato, non apparirà nella sezione API Keys
          dell'utente. Attualmente concessi: <span className="font-bold text-accent">{allowedCount}</span> provider.
        </div>
      </div>

      <div className="space-y-3">
        {PROVIDERS.map(p => {
          const current = perms[p.id];
          const allowed = !!current;
          const selectedModel = current?.model || '';
          const firstModelId = p.list[0]?.id || '';
          return (
            <div key={p.id} className="rounded-xl border border-border-muted bg-surface-3/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <ToggleSwitch
                      checked={allowed}
                      onChange={(v) => setProviderPerm(p.id, v ? (selectedModel || firstModelId) : null)}
                    />
                    <span className="text-[12px] font-bold text-txt-primary">Permetti</span>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-txt-primary">{p.label}</div>
                    <div className="text-[11px] text-txt-muted">{p.list.length} modelli disponibili</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck size={14} className={allowed ? 'text-success' : 'text-txt-faint'} />
                  <select
                    value={selectedModel}
                    onChange={(e) => setProviderPerm(p.id, e.target.value)}
                    disabled={!allowed}
                    className={`${selectClasses} min-w-[260px] disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {!allowed && <option value="">— Disattivato —</option>}
                    {p.list.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} · {m.id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
