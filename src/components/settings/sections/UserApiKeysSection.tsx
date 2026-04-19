import React, { useState } from 'react';
import { Key, Check, AlertCircle, Lock, Loader2 } from 'lucide-react';
import type { AISettings, AIProvider } from '../../../types';
import { testGeminiConnection } from '../../../services/geminiService';
import { testOpenAIConnection } from '../../../services/openaiService';
import { testClaudeConnection } from '../../../services/claudeService';
import { testGroqConnection } from '../../../services/groqService';
import { testModalConnection } from '../../../services/modalService';
import { testZaiConnection } from '../../../services/zaiService';
import { testOpenRouterConnection } from '../../../services/openrouterService';

interface UserApiKeysSectionProps {
  draftSettings: AISettings;
  updateDraft: (updates: Partial<AISettings>) => void;
}

const PROVIDER_LABEL: Record<string, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  claude: 'Anthropic Claude',
  groq: 'Groq',
  modal: 'Modal',
  zai: 'Z.ai (Zhipu)',
  openrouter: 'OpenRouter',
};

const getProviderApiKey = (s: AISettings, p: AIProvider): string => {
  switch (p) {
    case 'gemini': return s.gemini?.apiKey || '';
    case 'openai': return s.openai?.apiKey || '';
    case 'claude': return s.claude?.apiKey || '';
    case 'groq': return s.groq?.apiKey || '';
    case 'modal': return s.modal?.apiKey || '';
    case 'zai': return s.zai?.apiKey || '';
    case 'openrouter': return s.openrouter?.apiKey || '';
    default: return '';
  }
};

const setProviderApiKey = (s: AISettings, p: AIProvider, key: string, model: string): Partial<AISettings> => {
  switch (p) {
    case 'gemini': return { gemini: { ...(s.gemini || {}), apiKey: key, model: model as any } as any };
    case 'openai': return { openai: { ...(s.openai || {}), apiKey: key, model, reasoningEffort: s.openai?.reasoningEffort || 'medium', verbosity: s.openai?.verbosity || 'medium' } as any };
    case 'claude': return { claude: { ...(s.claude || {}), apiKey: key, model } as any };
    case 'groq': return { groq: { ...(s.groq || {}), apiKey: key, model: model as any } as any };
    case 'modal': return { modal: { ...(s.modal || {}), apiKey: key } };
    case 'zai': return { zai: { ...(s.zai || {}), apiKey: key, model } };
    case 'openrouter': return { openrouter: { ...(s.openrouter || {}), apiKey: key, model } };
    default: return {};
  }
};

const testProvider = async (s: AISettings, p: AIProvider, model: string): Promise<{ success: boolean; message: string }> => {
  const key = getProviderApiKey(s, p);
  if (!key) return { success: false, message: 'API key vuota' };
  switch (p) {
    case 'gemini': return testGeminiConnection(key, model as any);
    case 'openai': return testOpenAIConnection(key, model);
    case 'claude': return testClaudeConnection(key, model as any);
    case 'groq': return testGroqConnection(key, model as any);
    case 'modal': return testModalConnection(key);
    case 'zai': return testZaiConnection(key, model);
    case 'openrouter': return testOpenRouterConnection(key, model);
    default: return { success: false, message: 'Provider non supportato' };
  }
};

export const UserApiKeysSection: React.FC<UserApiKeysSectionProps> = ({ draftSettings, updateDraft }) => {
  const perms = draftSettings.userPermissions || {};
  const allowedProviders = Object.keys(perms) as AIProvider[];
  const activeProvider = draftSettings.provider;

  const [tempKeys, setTempKeys] = useState<Partial<Record<AIProvider, string>>>(() => {
    const init: Partial<Record<AIProvider, string>> = {};
    for (const p of allowedProviders) init[p] = getProviderApiKey(draftSettings, p);
    return init;
  });
  const [editing, setEditing] = useState<Partial<Record<AIProvider, boolean>>>({});
  const [testStatus, setTestStatus] = useState<Partial<Record<AIProvider, 'idle' | 'testing' | 'success' | 'error'>>>({});
  const [testMessage, setTestMessage] = useState<Partial<Record<AIProvider, string>>>({});

  if (allowedProviders.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-4/50 flex items-center justify-center text-txt-primary border border-border-muted">
            <Key size={18} />
          </div>
          <div>
            <div className="text-sm font-bold text-txt-primary">Le tue API Keys</div>
            <div className="text-[11px] text-txt-muted">Inserisci le tue chiavi per i provider autorizzati.</div>
          </div>
        </div>
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 flex gap-3">
          <AlertCircle size={16} className="shrink-0 mt-0.5 text-warning" />
          <div className="text-[12px] leading-relaxed text-txt-primary">
            <div className="font-bold text-warning mb-1">Nessun provider autorizzato</div>
            <div className="text-txt-secondary">
              L'amministratore non ha ancora concesso permessi di utilizzo. Contatta il tuo provider per richiedere l'accesso.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const toggleEdit = (p: AIProvider) => {
    const currentlyEditing = !!editing[p];
    if (currentlyEditing) {
      const newKey = (tempKeys[p] || '').trim();
      const model = perms[p]?.model || '';
      if (model) {
        updateDraft(setProviderApiKey(draftSettings, p, newKey, model));
      }
      setEditing(s => ({ ...s, [p]: false }));
    } else {
      setTempKeys(s => ({ ...s, [p]: getProviderApiKey(draftSettings, p) }));
      setEditing(s => ({ ...s, [p]: true }));
    }
  };

  const onTest = async (p: AIProvider) => {
    const model = perms[p]?.model || '';
    if (!model) return;
    setTestStatus(s => ({ ...s, [p]: 'testing' }));
    setTestMessage(s => ({ ...s, [p]: '' }));
    try {
      const res = await testProvider(draftSettings, p, model);
      setTestStatus(s => ({ ...s, [p]: res.success ? 'success' : 'error' }));
      setTestMessage(s => ({ ...s, [p]: res.message || (res.success ? 'Connessione ok' : 'Errore') }));
    } catch (e: any) {
      setTestStatus(s => ({ ...s, [p]: 'error' }));
      setTestMessage(s => ({ ...s, [p]: e?.message || 'Errore' }));
    }
  };

  const setActiveProvider = (p: AIProvider) => {
    updateDraft({ provider: p });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-surface-4/50 flex items-center justify-center text-txt-primary border border-border-muted">
          <Key size={18} />
        </div>
        <div>
          <div className="text-sm font-bold text-txt-primary">Le tue API Keys</div>
          <div className="text-[11px] text-txt-muted">
            Inserisci le tue chiavi per i provider autorizzati. Il modello usato è fisso (scelto dall'amministratore).
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {allowedProviders.map(p => {
          const lockedModel = perms[p]?.model || '';
          const hasKey = !!getProviderApiKey(draftSettings, p).trim();
          const isEditing = !!editing[p];
          const status = testStatus[p] || 'idle';
          const msg = testMessage[p] || '';
          const isActive = activeProvider === p;
          return (
            <div key={p} className={`rounded-xl border p-4 ${isActive ? 'border-accent/40 bg-accent/5' : 'border-border-muted bg-surface-3/40'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-[260px]">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-bold text-txt-primary">{PROVIDER_LABEL[p] || p}</div>
                    {isActive && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/30">
                        Attivo
                      </span>
                    )}
                    {hasKey ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">
                        <Check size={10} className="inline mr-1" />Key presente
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20">
                        Key mancante
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-txt-muted">
                    <Lock size={10} />
                    <span>Modello: </span>
                    <span className="font-mono text-txt-secondary">{lockedModel || '—'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => setActiveProvider(p)}
                      className="px-2.5 py-2 rounded-xl text-[11px] font-bold border border-border-muted bg-surface-4/50 hover:bg-surface-4 text-txt-primary transition-colors"
                    >
                      Imposta come attivo
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type={isEditing ? 'text' : 'password'}
                  value={isEditing ? (tempKeys[p] || '') : (getProviderApiKey(draftSettings, p) ? '••••••••••••' : '')}
                  onChange={(e) => setTempKeys(s => ({ ...s, [p]: e.target.value }))}
                  placeholder={`Inserisci API key ${PROVIDER_LABEL[p] || p}`}
                  disabled={!isEditing}
                  className="flex-1 min-w-[220px] bg-surface-4/50 border border-border-muted rounded-xl py-2 px-3 text-[12px] text-txt-primary placeholder:text-txt-faint outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 font-mono transition-all duration-200 disabled:opacity-70"
                />
                <button
                  type="button"
                  onClick={() => toggleEdit(p)}
                  className="px-2.5 py-2 rounded-xl text-[11px] font-bold border border-border-muted bg-surface-4/50 hover:bg-surface-4 text-txt-primary transition-colors"
                >
                  {isEditing ? 'Salva' : 'Modifica'}
                </button>
                <button
                  type="button"
                  onClick={() => onTest(p)}
                  disabled={status === 'testing' || !hasKey}
                  className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[11px] font-bold border border-border-muted bg-surface-4/50 hover:bg-surface-4 text-txt-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === 'testing' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Test
                </button>
              </div>

              {msg && (
                <div className={`mt-2 text-[11px] ${status === 'success' ? 'text-success' : status === 'error' ? 'text-danger' : 'text-txt-muted'}`}>
                  {msg}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
