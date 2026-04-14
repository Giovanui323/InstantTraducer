import React, { useState } from 'react';
import { AISettings, ApiFormat, CustomProviderConfig } from '../../../types';
import { SettingRow } from '../SettingRow';
import { Plus, Trash2, Check, X, Zap } from 'lucide-react';
import { testCustomProviderConnection } from '../../../services/customProviderAdapter';

const selectClasses = "bg-surface-4/50 border border-border-muted rounded-xl py-2 px-3 text-[12px] text-txt-primary outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all duration-200";
const inputClasses = "w-full bg-surface-4/50 border border-border-muted rounded-xl py-2 px-3 text-[12px] text-txt-primary placeholder:text-txt-faint outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 font-mono transition-all duration-200";

const API_FORMAT_LABELS: Record<ApiFormat, string> = {
  openai: 'OpenAI Compatibile',
  anthropic: 'Anthropic Compatibile',
  gemini: 'Gemini Compatibile',
  zhipu: 'Zhipu / Z.ai Compatibile',
};

const generateId = () => `cp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

interface CustomProvidersSectionProps {
  draftSettings: AISettings;
  updateDraft: (updates: Partial<AISettings>) => void;
}

export const CustomProvidersSection: React.FC<CustomProvidersSectionProps> = ({ draftSettings, updateDraft }) => {
  const providers = draftSettings.customProviders || [];
  const activeId = draftSettings.activeCustomProviderId;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'testing' | 'success' | 'error'>>({});
  const [testMessage, setTestMessage] = useState<Record<string, string>>({});

  const addProvider = () => {
    const newProvider: CustomProviderConfig = {
      id: generateId(),
      name: 'Nuovo Provider',
      apiFormat: 'openai',
      baseUrl: '',
      model: '',
      apiKey: '',
    };
    const updated = [...providers, newProvider];
    updateDraft({
      customProviders: updated,
      activeCustomProviderId: newProvider.id,
    });
    setEditingId(newProvider.id);
  };

  const removeProvider = (id: string) => {
    const updated = providers.filter(p => p.id !== id);
    const updates: Partial<AISettings> = { customProviders: updated };
    if (activeId === id) {
      updates.activeCustomProviderId = updated.length > 0 ? updated[0].id : undefined;
    }
    updateDraft(updates);
    if (editingId === id) setEditingId(null);
  };

  const updateProvider = (id: string, fields: Partial<CustomProviderConfig>) => {
    const updated = providers.map(p => p.id === id ? { ...p, ...fields } : p);
    updateDraft({ customProviders: updated });
  };

  const selectAsActive = (id: string) => {
    updateDraft({ activeCustomProviderId: id, provider: 'custom' });
  };

  const handleTest = async (provider: CustomProviderConfig) => {
    const key = provider.id;
    setTestStatus(s => ({ ...s, [key]: 'testing' }));
    setTestMessage(s => ({ ...s, [key]: '' }));
    try {
      const result = await testCustomProviderConnection(provider);
      setTestStatus(s => ({ ...s, [key]: result.success ? 'success' : 'error' }));
      setTestMessage(s => ({ ...s, [key]: result.message }));
    } catch (e: any) {
      setTestStatus(s => ({ ...s, [key]: 'error' }));
      setTestMessage(s => ({ ...s, [key]: e?.message || 'Errore imprevisto' }));
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[12px] font-bold text-txt-primary">Provider Personalizzati</div>
          <div className="text-[11px] text-txt-muted mt-0.5">Aggiungi endpoint AI custom con formato API, autenticazione e limite concorrenza.</div>
        </div>
        <button
          onClick={addProvider}
          className="flex items-center gap-1.5 px-3 py-2 bg-accent/10 hover:bg-accent/20 text-accent rounded-xl text-[11px] font-bold transition-all duration-200 border border-accent/20"
        >
          <Plus size={14} /> Aggiungi
        </button>
      </div>

      {providers.length === 0 && (
        <div className="text-[11px] text-txt-muted italic p-4 bg-surface-4/30 rounded-xl border border-border-muted text-center">
          Nessun provider custom configurato. Clicca "Aggiungi" per iniziare.
        </div>
      )}

      {providers.map((provider) => {
        const isEditing = editingId === provider.id;
        const isActive = activeId === provider.id && draftSettings.provider === 'custom';
        const status = testStatus[provider.id] || 'idle';
        const msg = testMessage[provider.id] || '';

        return (
          <div
            key={provider.id}
            className={`rounded-xl border overflow-hidden transition-all duration-200 ${
              isActive ? 'border-accent/40 bg-accent/5' : 'border-border-muted bg-surface-4/30'
            }`}
          >
            {/* Header */}
            <div className="px-3 py-2.5 flex items-center justify-between bg-surface-4/50">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-accent' : 'bg-txt-faint'}`} />
                <span className="text-[11px] font-bold text-txt-primary truncate">{provider.name || 'Senza nome'}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-4/50 text-txt-muted font-mono">
                  {API_FORMAT_LABELS[provider.apiFormat] || provider.apiFormat}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {isActive && (
                  <span className="text-[9px] font-bold text-accent px-1.5 py-0.5 bg-accent/10 rounded">ATTIVO</span>
                )}
                <button
                  onClick={() => setEditingId(isEditing ? null : provider.id)}
                  className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors duration-200 ${
                    isEditing ? 'bg-accent/10 text-accent' : 'bg-surface-4/50 text-txt-secondary hover:text-txt-primary'
                  }`}
                >
                  {isEditing ? 'Chiudi' : 'Modifica'}
                </button>
                {!isActive && (
                  <button
                    onClick={() => selectAsActive(provider.id)}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors duration-200"
                  >
                    Usa
                  </button>
                )}
                <button
                  onClick={() => handleTest(provider)}
                  disabled={status === 'testing'}
                  className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors duration-200 ${
                    status === 'testing' ? 'bg-accent/10 text-accent cursor-wait' :
                    status === 'success' ? 'bg-success/10 text-success' :
                    status === 'error' ? 'bg-danger/10 text-danger' :
                    'bg-surface-4/50 text-txt-secondary hover:text-txt-primary'
                  }`}
                >
                  {status === 'testing' ? '...' : status === 'success' ? 'OK' : status === 'error' ? 'Err' : 'Test'}
                </button>
                <button
                  onClick={() => removeProvider(provider.id)}
                  className="p-1 text-danger/50 hover:text-danger hover:bg-danger/10 rounded-lg transition-colors duration-200"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Test result message */}
            {msg && (
              <div className={`px-3 py-2 text-[10px] border-b ${
                status === 'success' ? 'text-success bg-success/5 border-success/10' : 'text-danger bg-danger/5 border-danger/10'
              }`}>
                {msg}
              </div>
            )}

            {/* Edit form */}
            {isEditing && (
              <div className="p-3 space-y-3 border-t border-border-muted">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] font-bold text-txt-muted uppercase tracking-wider mb-1">Nome Provider</div>
                    <input
                      value={provider.name}
                      onChange={(e) => updateProvider(provider.id, { name: e.target.value })}
                      placeholder="Il mio Provider"
                      className={inputClasses}
                    />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-txt-muted uppercase tracking-wider mb-1">Formato API</div>
                    <select
                      value={provider.apiFormat}
                      onChange={(e) => updateProvider(provider.id, { apiFormat: e.target.value as ApiFormat })}
                      className={selectClasses}
                    >
                      {Object.entries(API_FORMAT_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-txt-muted uppercase tracking-wider mb-1">Base URL</div>
                  <input
                    value={provider.baseUrl}
                    onChange={(e) => updateProvider(provider.id, { baseUrl: e.target.value })}
                    placeholder="https://api.example.com/v1/chat/completions"
                    className={inputClasses}
                  />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] font-bold text-txt-muted uppercase tracking-wider mb-1">Modello</div>
                    <input
                      value={provider.model}
                      onChange={(e) => updateProvider(provider.id, { model: e.target.value })}
                      placeholder="gpt-4o / claude-3-haiku / ..."
                      className={inputClasses}
                    />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-txt-muted uppercase tracking-wider mb-1">Limite Concorrenza (opzionale)</div>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={provider.concurrencyLimit ?? ''}
                      onChange={(e) => updateProvider(provider.id, { concurrencyLimit: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="Vuoto = nessun limite"
                      className={inputClasses}
                    />
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-txt-muted uppercase tracking-wider mb-1">API Key</div>
                  <input
                    type="password"
                    value={provider.apiKey}
                    onChange={(e) => updateProvider(provider.id, { apiKey: e.target.value })}
                    placeholder="sk-... / Bearer token / ..."
                    className={inputClasses}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
