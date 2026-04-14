import React, { useEffect, useState } from 'react';
import { AISettings, GeminiModel, GroqModel } from '../../../types';
import { SettingRow } from '../SettingRow';
import { testGeminiConnection } from '../../../services/geminiService';
import { testOpenAIConnection } from '../../../services/openaiService';
import { testClaudeConnection } from '../../../services/claudeService';
import { testGroqConnection } from '../../../services/groqService';
import { testModalConnection } from '../../../services/modalService';
import { testZaiConnection } from '../../../services/zaiService';
import { testOpenRouterConnection } from '../../../services/openrouterService';
import { BrainCircuit, Check, Key, X, Zap, Cpu, Globe } from 'lucide-react';
import { SettingsSearchItem } from '../search';
import { GEMINI_TRANSLATION_MODEL } from '../../../constants';

export const apiKeysSearchItems: SettingsSearchItem[] = [
  { id: 'apiKeys.gemini', sectionId: 'apiKeys', sectionLabel: 'API Keys', title: 'Chiave API Gemini', description: 'Inserisci o modifica la chiave API per Google Gemini.', keywords: ['gemini', 'api key', 'chiave'], anchorId: 'apiKeys.gemini' },
  { id: 'apiKeys.openai', sectionId: 'apiKeys', sectionLabel: 'API Keys', title: 'Chiave API OpenAI', description: 'Inserisci o modifica la chiave API per OpenAI.', keywords: ['openai', 'chatgpt', 'api key', 'chiave'], anchorId: 'apiKeys.openai' },
  { id: 'apiKeys.claude', sectionId: 'apiKeys', sectionLabel: 'API Keys', title: 'Chiave API Claude', description: 'Inserisci o modifica la chiave API per Anthropic Claude.', keywords: ['claude', 'anthropic', 'api key', 'chiave'], anchorId: 'apiKeys.claude' },
  { id: 'apiKeys.groq', sectionId: 'apiKeys', sectionLabel: 'API Keys', title: 'Chiave API Groq', description: 'Inserisci o modifica la chiave API per Groq.', keywords: ['groq', 'api key', 'chiave'], anchorId: 'apiKeys.groq' },
  { id: 'apiKeys.modal', sectionId: 'apiKeys', sectionLabel: 'API Keys', title: 'Chiave API Modal', description: 'Inserisci o modifica la chiave API per Modal (GLM-5.1).', keywords: ['modal', 'glm', 'api key', 'chiave'], anchorId: 'apiKeys.modal' },
  { id: 'apiKeys.zai', sectionId: 'apiKeys', sectionLabel: 'API Keys', title: 'Chiave API Z.ai', description: 'Inserisci o modifica la chiave API per Z.ai (Zhipu AI).', keywords: ['zai', 'zhipu', 'api key', 'chiave'], anchorId: 'apiKeys.zai' },
  { id: 'apiKeys.openrouter', sectionId: 'apiKeys', sectionLabel: 'API Keys', title: 'Chiave API OpenRouter', description: 'Inserisci o modifica la chiave API per OpenRouter (accesso a 300+ modelli).', keywords: ['openrouter', 'router', 'api key', 'chiave'], anchorId: 'apiKeys.openrouter' },
  { id: 'apiKeys.custom', sectionId: 'apiKeys', sectionLabel: 'API Keys', title: 'Provider Custom', description: 'Gestisci provider personalizzati con API custom.', keywords: ['custom', 'provider', 'api key', 'chiave'], anchorId: 'apiKeys.custom' }
];

const inputClasses = "w-[240px] bg-surface-4/50 border border-border-muted rounded-xl py-2 px-3 text-[12px] text-txt-primary placeholder:text-txt-faint outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 font-mono transition-all duration-200";
const btnClasses = "px-2.5 py-2 rounded-xl text-[11px] font-bold border transition-all duration-200";

export const ApiKeysSection = ({
  draftSettings,
  updateDraft
}: {
  draftSettings: AISettings;
  updateDraft: (updates: Partial<AISettings>) => void;
}) => {
  const geminiKey = draftSettings.gemini?.apiKey || '';
  const geminiModel = draftSettings.gemini?.model || (GEMINI_TRANSLATION_MODEL as any);
  const openAIKey = draftSettings.openai?.apiKey || '';
  const openAIModel = draftSettings.openai?.model || 'gpt-4o';
  const claudeKey = draftSettings.claude?.apiKey || '';
  const claudeModel = draftSettings.claude?.model || 'claude-3-5-sonnet-20241022';
  const groqKey = draftSettings.groq?.apiKey || '';
  const groqModel = draftSettings.groq?.model || ('llama-3.3-70b-versatile' as any);
  const modalKey = draftSettings.modal?.apiKey || '';
  const zaiKey = draftSettings.zai?.apiKey || '';
  const openrouterKey = draftSettings.openrouter?.apiKey || '';
  const openrouterModel = draftSettings.openrouter?.model || 'anthropic/claude-sonnet-4.5';

  const [editing, setEditing] = useState<Record<string, boolean>>({ gemini: false, openai: false, claude: false, groq: false, modal: false, zai: false, openrouter: false });
  const [tempKeys, setTempKeys] = useState({ gemini: geminiKey, openai: openAIKey, claude: claudeKey, groq: groqKey, modal: modalKey, zai: zaiKey, openrouter: openrouterKey });

  useEffect(() => {
    setTempKeys({ gemini: geminiKey, openai: openAIKey, claude: claudeKey, groq: groqKey, modal: modalKey, zai: zaiKey, openrouter: openrouterKey });
  }, [geminiKey, openAIKey, claudeKey, groqKey, modalKey, zaiKey, openrouterKey]);

  const renderKeyControl = (p: 'gemini' | 'openai' | 'claude' | 'groq' | 'modal' | 'zai' | 'openrouter') => {
    const isEditing = editing[p];
    const value = tempKeys[p] || '';
    const currentKey = p === 'gemini' ? geminiKey : p === 'openai' ? openAIKey : p === 'claude' ? claudeKey : p === 'groq' ? groqKey : p === 'modal' ? modalKey : p === 'zai' ? zaiKey : openrouterKey;
    const hasKey = Boolean(currentKey?.trim());

    const onToggleEdit = () => {
      if (isEditing) {
        if (p === 'gemini') updateDraft({ gemini: { ...(draftSettings.gemini || {}), apiKey: value, model: geminiModel } as any });
        if (p === 'openai') updateDraft({ openai: { ...(draftSettings.openai || {}), apiKey: value, model: openAIModel, reasoningEffort: draftSettings.openai?.reasoningEffort || 'medium', verbosity: draftSettings.openai?.verbosity || 'medium' } as any });
        if (p === 'claude') updateDraft({ claude: { ...(draftSettings.claude || {}), apiKey: value, model: claudeModel } as any });
        if (p === 'groq') updateDraft({ groq: { ...(draftSettings.groq || {}), apiKey: value, model: groqModel } as any });
        if (p === 'modal') updateDraft({ modal: { ...(draftSettings.modal || {}), apiKey: value } });
        if (p === 'zai') updateDraft({ zai: { ...(draftSettings.zai || {}), apiKey: value } });
        if (p === 'openrouter') updateDraft({ openrouter: { ...(draftSettings.openrouter || {}), apiKey: value, model: openrouterModel } });
        setEditing((s) => ({ ...s, [p]: false }));
      } else {
        setTempKeys((s) => ({ ...s, [p]: currentKey }));
        setEditing((s) => ({ ...s, [p]: true }));
      }
    };

    const onTest = async () => {
      try {
        if (p === 'gemini') {
          const res = await testGeminiConnection(geminiKey, geminiModel as GeminiModel);
          alert(res.success ? 'Connessione Gemini OK!' : `Errore Gemini: ${res.message}`);
        } else if (p === 'openai') {
          const res = await testOpenAIConnection(openAIKey, openAIModel);
          alert(res.success ? 'Connessione OpenAI OK!' : `Errore OpenAI: ${res.message}`);
        } else if (p === 'claude') {
          const res = await testClaudeConnection(claudeKey, claudeModel as any);
          alert(res.success ? 'Connessione Claude OK!' : `Errore Claude: ${res.message}`);
        } else if (p === 'groq') {
          const res = await testGroqConnection(groqKey, groqModel as GroqModel);
          alert(res.success ? 'Connessione Groq OK!' : `Errore Groq: ${res.message}`);
        } else if (p === 'modal') {
          const res = await testModalConnection(modalKey);
          alert(res.success ? 'Connessione Modal OK!' : `Errore Modal: ${res.message}`);
        } else if (p === 'zai') {
          const res = await testZaiConnection(zaiKey, 'glm-4-flash');
          alert(res.success ? 'Connessione Z.ai OK!' : `Errore Z.ai: ${res.message}`);
        } else if (p === 'openrouter') {
          const res = await testOpenRouterConnection(openrouterKey, openrouterModel);
          alert(res.success ? 'Connessione OpenRouter OK!' : `Errore OpenRouter: ${res.message}`);
        }
      } catch (e: any) {
        alert(e?.message || String(e));
      }
    };

    return (
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="password"
            value={isEditing ? value : hasKey ? `${currentKey.slice(0, 3)}••••••••••••` : ''}
            onChange={isEditing ? (e) => setTempKeys((s) => ({ ...s, [p]: e.target.value })) : undefined}
            readOnly={!isEditing}
            placeholder={p === 'openai' ? 'sk-…' : p === 'zai' ? 'id.secret' : '…'}
            className={inputClasses}
          />
        </div>
        <button
          onClick={onToggleEdit}
          className={`${btnClasses} ${isEditing ? 'bg-surface-4 text-txt-primary border-border' : 'bg-surface-4/50 text-txt-secondary border-border-muted hover:text-txt-primary hover:bg-surface-4'}`}
        >
          {isEditing ? 'Salva' : 'Modifica'}
        </button>
        <button
          onClick={onTest}
          className={`${btnClasses} bg-surface-4/50 text-txt-secondary border-border-muted hover:text-txt-primary hover:bg-surface-4`}
        >
          Test
        </button>
        {hasKey ? <Check size={14} className="text-success" /> : <X size={14} className="text-danger/50" />}
      </div>
    );
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="text-[11px] text-txt-muted">
        Inserisci le chiavi API per ogni provider. Puoi testare subito la connessione.
      </div>

      <SettingRow
        id="setting-apiKeys.gemini"
        title="Google Gemini"
        description="Chiave API per Gemini."
        right={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-accent/10 border border-accent/15 flex items-center justify-center text-accent">
              <Zap size={16} />
            </div>
            {renderKeyControl('gemini')}
          </div>
        }
      />

      <SettingRow
        id="setting-apiKeys.openai"
        title="OpenAI"
        description="Chiave API per OpenAI."
        right={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-accent/10 border border-accent/15 flex items-center justify-center text-accent">
              <BrainCircuit size={16} />
            </div>
            {renderKeyControl('openai')}
          </div>
        }
      />

      <SettingRow
        id="setting-apiKeys.claude"
        title="Anthropic Claude"
        description="Chiave API per Claude."
        right={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-warning/10 border border-warning/15 flex items-center justify-center text-warning">
              <Key size={16} />
            </div>
            {renderKeyControl('claude')}
          </div>
        }
      />

      <SettingRow
        id="setting-apiKeys.groq"
        title="Groq"
        description="Chiave API per Groq (gratis sul tuo account)."
        right={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-success/10 border border-success/15 flex items-center justify-center text-success">
              <Zap size={16} />
            </div>
            {renderKeyControl('groq')}
          </div>
        }
      />

      <SettingRow
        id="setting-apiKeys.modal"
        title="Modal (GLM-5.1)"
        description="Chiave API per Modal — 1 richiesta alla volta."
        right={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/15 flex items-center justify-center text-purple-400">
              <Cpu size={16} />
            </div>
            {renderKeyControl('modal')}
          </div>
        }
      />

      <SettingRow
        id="setting-apiKeys.zai"
        title="Z.ai (Zhipu AI)"
        description="Chiave API Zhipu (formato: id.secret). Genera JWT automaticamente."
        right={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/15 flex items-center justify-center text-blue-400">
              <BrainCircuit size={16} />
            </div>
            {renderKeyControl('zai')}
          </div>
        }
      />

      <SettingRow
        id="setting-apiKeys.openrouter"
        title="OpenRouter"
        description="Chiave API per OpenRouter (accesso a 300+ modelli)."
        right={
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/15 flex items-center justify-center text-orange-400">
              <Globe size={16} />
            </div>
            {renderKeyControl('openrouter')}
          </div>
        }
      />
    </div>
  );
};
