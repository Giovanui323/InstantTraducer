import React from 'react';
import { AIProvider, AISettings, GeminiModel, GroqModel } from '../../../types';
import { SettingRow } from '../SettingRow';
import {
  GEMINI_TRANSLATION_FAST_MODEL,
  GEMINI_TRANSLATION_FLASH_MODEL,
  GEMINI_TRANSLATION_MODEL,
  GEMINI_VERIFIER_MODEL,
  GROQ_MODELS_LIST,
  OPENAI_MODELS_LIST,
  GEMINI_MODELS_LIST,
  availableGeminiModels,
  availableClaudeModels,
  isGroqVisionModel,
  CLAUDE_MODELS_LIST
} from '../../../constants';
import { SettingsSearchItem } from '../search';
import { CustomModelManager } from '../../CustomModelManager';

export const aiRolesSearchItems: SettingsSearchItem[] = [
  {
    id: 'aiRoles.primary.provider',
    sectionId: 'aiRoles',
    sectionLabel: 'Modelli & Ruoli',
    title: 'Provider traduzione',
    description: 'Scegli il provider primario per la traduzione (Vision).',
    keywords: ['traduzione', 'provider', 'primario'],
    anchorId: 'aiRoles.primary.provider'
  },
  {
    id: 'aiRoles.primary.model',
    sectionId: 'aiRoles',
    sectionLabel: 'Modelli & Ruoli',
    title: 'Modello traduzione',
    description: 'Scegli il modello primario per la traduzione.',
    keywords: ['traduzione', 'modello', 'vision'],
    anchorId: 'aiRoles.primary.model'
  },
  {
    id: 'aiRoles.fix.model',
    sectionId: 'aiRoles',
    sectionLabel: 'Modelli & Ruoli',
    title: 'Modello forzato riparazione',
    description: 'Modello usato quando fai "Forza con Modello" (ritraduzione pagina).',
    keywords: ['riparazione', 'forza', 'ritraduci'],
    anchorId: 'aiRoles.fix.model'
  },
  {
    id: 'aiRoles.verifier.enabled',
    sectionId: 'aiRoles',
    sectionLabel: 'Modelli & Ruoli',
    title: 'Verifica qualità abilitata',
    description: 'Attiva/disattiva il modello secondario.',
    keywords: ['verifica', 'quality', 'secondario'],
    anchorId: 'aiRoles.verifier.enabled'
  },
  {
    id: 'aiRoles.verifier.model',
    sectionId: 'aiRoles',
    sectionLabel: 'Modelli & Ruoli',
    title: 'Modello verifica qualità',
    description: 'Scegli provider e modello per la verifica.',
    keywords: ['verifica', 'modello', 'supervisore'],
    anchorId: 'aiRoles.verifier.model'
  },
  {
    id: 'aiRoles.metadata.model',
    sectionId: 'aiRoles',
    sectionLabel: 'Modelli & Ruoli',
    title: 'Modello metadati',
    description: 'Scegli provider e modello per estrazione metadati.',
    keywords: ['metadati', 'titolo', 'autore'],
    anchorId: 'aiRoles.metadata.model'
  }
];

const SectionTitle = ({ title, description }: { title: string; description?: string }) => (
  <div className="space-y-1">
    <div className="text-[12px] font-bold text-txt-primary">{title}</div>
    {description && <div className="text-[11px] text-txt-muted">{description}</div>}
  </div>
);

const selectClasses = "bg-surface-4/50 border border-border-muted rounded-xl py-2 px-3 text-[12px] text-txt-primary outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all duration-200";
const inputClasses = "w-[240px] bg-surface-4/50 border border-border-muted rounded-xl py-2 px-3 text-[12px] text-txt-primary placeholder:text-txt-faint outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 font-mono transition-all duration-200";

export const AiRolesSection = ({
  draftSettings,
  updateDraft
}: {
  draftSettings: AISettings;
  updateDraft: (updates: Partial<AISettings>) => void;
}) => {
  const provider = draftSettings.provider;
  const gemini = draftSettings.gemini || { apiKey: '', model: GEMINI_TRANSLATION_MODEL as any };
  const openai = draftSettings.openai || { apiKey: '', model: 'gpt-4o', reasoningEffort: 'medium', verbosity: 'medium' };
  const claude = draftSettings.claude || { apiKey: '', model: 'claude-3-5-sonnet-20241022' as any };
  const groq = draftSettings.groq || { apiKey: '', model: 'llama-3.3-70b-versatile' as any };

  const qualityCheck = draftSettings.qualityCheck || { enabled: true, verifierProvider: 'gemini' as AIProvider, verifierModel: GEMINI_VERIFIER_MODEL, maxAutoRetries: 1 };
  const metadataExtraction = draftSettings.metadataExtraction || { enabled: true, provider: 'gemini' as AIProvider, model: GEMINI_TRANSLATION_FLASH_MODEL };

  const setProvider = (p: AIProvider) => updateDraft({ provider: p });

  const setGeminiModel = (m: GeminiModel) => updateDraft({ gemini: { ...gemini, model: m } as any });
  const setGeminiThinkingLevel = (l: 'minimal' | 'low' | 'medium' | 'high') => updateDraft({ gemini: { ...gemini, thinkingLevel: l, model: gemini.model } as any });
  const setFastMode = (v: boolean) => updateDraft({ fastMode: v });

  const setOpenAIModel = (m: string) => updateDraft({ openai: { ...openai, model: m } as any });
  const setOpenAIReasoningEffort = (e: 'none' | 'low' | 'medium' | 'high') => updateDraft({ openai: { ...openai, reasoningEffort: e } as any });

  const setClaudeModel = (m: string) => updateDraft({ claude: { ...claude, model: m as any } });
  const setGroqModel = (m: GroqModel) => updateDraft({ groq: { ...groq, model: m } as any });

  const setForceFixTranslationModel = (m: string) => updateDraft({ forceFixTranslationModel: m });

  const setQualityEnabled = (e: boolean) => updateDraft({ qualityCheck: { ...qualityCheck, enabled: e } });
  const setVerifierProvider = (p: AIProvider) => {
    let nextModel = qualityCheck.verifierModel;
    if (p === 'gemini') nextModel = GEMINI_VERIFIER_MODEL;
    else if (p === 'openai') nextModel = 'gpt-4o-mini';
    else if (p === 'claude') nextModel = 'claude-3-5-haiku-20241022';
    else if (p === 'groq') nextModel = 'llama-3.3-70b-versatile';
    updateDraft({ qualityCheck: { ...qualityCheck, verifierProvider: p, verifierModel: nextModel } });
  };
  const setQualityModel = (m: string) => updateDraft({ qualityCheck: { ...qualityCheck, verifierModel: m } });
  const setQualityMaxRetries = (n: number) => updateDraft({ qualityCheck: { ...qualityCheck, maxAutoRetries: Math.max(0, Math.min(5, n || 0)) } });

  const setMetadataEnabled = (e: boolean) => updateDraft({ metadataExtraction: { ...metadataExtraction, enabled: e } });
  const setMetadataProvider = (p: AIProvider) => {
    let nextModel = metadataExtraction.model;
    if (p === 'gemini') nextModel = GEMINI_TRANSLATION_FLASH_MODEL;
    else if (p === 'openai') nextModel = 'gpt-4o-mini';
    else if (p === 'claude') nextModel = 'claude-3-5-haiku-20241022';
    else if (p === 'groq') nextModel = 'meta-llama/llama-4-scout-17b-16e-instruct';
    updateDraft({ metadataExtraction: { ...metadataExtraction, provider: p, model: nextModel } });
  };
  const setMetadataModel = (m: string) => updateDraft({ metadataExtraction: { ...metadataExtraction, model: m } });

  const providerModelControl = () => {
    if (provider === 'gemini') {
      return (
        <select
          value={gemini.model}
          onChange={(e) => {
            const val = e.target.value as any;
            setGeminiModel(val);
            const info = availableGeminiModels.find((x) => x.id === val);
            if (info) setFastMode(info.category === 'flash');
          }}
          className={selectClasses}
        >
          {availableGeminiModels.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      );
    }
    if (provider === 'openai') {
      return (
        <input
          value={openai.model}
          onChange={(e) => setOpenAIModel(e.target.value)}
          placeholder="gpt-4o"
          className={inputClasses}
        />
      );
    }
    if (provider === 'claude') {
      return (
        <select
          value={claude.model}
          onChange={(e) => setClaudeModel(e.target.value)}
          className={selectClasses}
        >
          {availableClaudeModels.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      );
    }
    return (
      <select
        value={groq.model as any}
        onChange={(e) => setGroqModel(e.target.value as any)}
        className={selectClasses}
      >
        {GROQ_MODELS_LIST.filter((m) => isGroqVisionModel(m.id)).map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
    );
  };

  const forceFixModelControl = () => {
    const v = draftSettings.forceFixTranslationModel || '';
    if (provider === 'gemini') {
      return (
        <select
          value={v}
          onChange={(e) => setForceFixTranslationModel(e.target.value)}
          className={selectClasses}
        >
          <option value="">Usa modello primario</option>
          {availableGeminiModels.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      );
    }
    if (provider === 'openai') {
      return (
        <input
          value={v}
          onChange={(e) => setForceFixTranslationModel(e.target.value)}
          placeholder="Vuoto = primario"
          className={inputClasses}
        />
      );
    }
    if (provider === 'claude') {
      return (
        <select
          value={v}
          onChange={(e) => setForceFixTranslationModel(e.target.value)}
          className={selectClasses}
        >
          <option value="">Usa modello primario</option>
          {availableClaudeModels.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      );
    }
    return (
      <select
        value={v}
        onChange={(e) => setForceFixTranslationModel(e.target.value)}
        className={selectClasses}
      >
        <option value="">Usa modello primario</option>
        {GROQ_MODELS_LIST.filter((m) => isGroqVisionModel(m.id)).map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
    );
  };

  const verifierModelControl = () => {
    if (qualityCheck.verifierProvider === 'gemini') {
      return (
        <select value={qualityCheck.verifierModel} onChange={(e) => setQualityModel(e.target.value)} className={selectClasses}>
          {availableGeminiModels.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      );
    }
    if (qualityCheck.verifierProvider === 'openai') {
      return (
        <select value={qualityCheck.verifierModel} onChange={(e) => setQualityModel(e.target.value)} className={selectClasses}>
          {OPENAI_MODELS_LIST.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      );
    }
    if (qualityCheck.verifierProvider === 'claude') {
      return (
        <select value={qualityCheck.verifierModel} onChange={(e) => setQualityModel(e.target.value)} className={selectClasses}>
          {CLAUDE_MODELS_LIST.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      );
    }
    return (
      <select value={qualityCheck.verifierModel} onChange={(e) => setQualityModel(e.target.value)} className={selectClasses}>
        {GROQ_MODELS_LIST.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
    );
  };

  const metadataModelControl = () => {
    if (metadataExtraction.provider === 'gemini') {
      return (
        <select value={metadataExtraction.model} onChange={(e) => setMetadataModel(e.target.value)} className={selectClasses}>
          {GEMINI_MODELS_LIST.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      );
    }
    if (metadataExtraction.provider === 'openai') {
      return (
        <select value={metadataExtraction.model} onChange={(e) => setMetadataModel(e.target.value)} className={selectClasses}>
          {OPENAI_MODELS_LIST.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      );
    }
    if (metadataExtraction.provider === 'claude') {
      return (
        <select value={metadataExtraction.model} onChange={(e) => setMetadataModel(e.target.value)} className={selectClasses}>
          {CLAUDE_MODELS_LIST.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      );
    }
    return (
      <select value={metadataExtraction.model} onChange={(e) => setMetadataModel(e.target.value)} className={selectClasses}>
        {GROQ_MODELS_LIST.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-3">
        <SectionTitle title="Traduzione" description="Provider e modello primario (Vision)." />
        <SettingRow
          id="setting-aiRoles.primary.provider"
          title="Provider"
          description="Provider primario per la traduzione."
          right={
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as AIProvider)}
              className={selectClasses}
            >
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI</option>
              <option value="claude">Claude</option>
              <option value="groq">Groq</option>
            </select>
          }
        />
        <SettingRow
          id="setting-aiRoles.primary.model"
          title="Modello"
          description="Modello primario per la traduzione."
          right={providerModelControl()}
        />
        <SettingRow
          id="setting-aiRoles.fix.model"
          title="Modello forzato (riparazione)"
          description={'Usato solo quando fai "Forza con Modello" nei dubbi/verifica.'}
          right={forceFixModelControl()}
        />

        {provider === 'gemini' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <SettingRow
              title="Thinking (Gemini)"
              description="Livello di ragionamento."
              right={
                <select
                  value={gemini.thinkingLevel || 'medium'}
                  onChange={(e) => setGeminiThinkingLevel(e.target.value as any)}
                  className={selectClasses}
                >
                  <option value="minimal">Minimo</option>
                  <option value="low">Basso</option>
                  <option value="medium">Medio</option>
                  <option value="high">Alto</option>
                </select>
              }
            />
            <SettingRow
              title="Modalità Flash"
              description="Se attiva, forza un modello Flash."
              right={
                <input
                  type="checkbox"
                  checked={draftSettings.fastMode ?? false}
                  onChange={(e) => {
                    setFastMode(e.target.checked);
                    if (e.target.checked) setGeminiModel(GEMINI_TRANSLATION_FAST_MODEL as any);
                  }}
                  className="h-4 w-4 accent-accent"
                />
              }
            />
          </div>
        )}

        {provider === 'openai' && (
          <SettingRow
            title="Reasoning effort (OpenAI)"
            description="Quanto ragionamento allocare al modello."
            right={
              <select
                value={openai.reasoningEffort || 'medium'}
                onChange={(e) => setOpenAIReasoningEffort(e.target.value as any)}
                className={selectClasses}
              >
                <option value="none">Nessuno</option>
                <option value="low">Basso</option>
                <option value="medium">Medio</option>
                <option value="high">Alto</option>
              </select>
            }
          />
        )}
      </div>

      <div className="space-y-3">
        <SectionTitle title="Verifica qualità" description="Modello secondario per la revisione." />
        <SettingRow
          id="setting-aiRoles.verifier.enabled"
          title="Abilitata"
          description="Attiva/disattiva la verifica automatica."
          right={
            <input type="checkbox" checked={qualityCheck.enabled} onChange={(e) => setQualityEnabled(e.target.checked)} className="h-4 w-4 accent-success" />
          }
        />
        <div className={qualityCheck.enabled ? '' : 'opacity-40 pointer-events-none'}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <SettingRow
              id="setting-aiRoles.verifier.model"
              title="Provider"
              description="Provider della verifica."
              right={
                <select
                  value={qualityCheck.verifierProvider}
                  onChange={(e) => setVerifierProvider(e.target.value as AIProvider)}
                  className={selectClasses}
                >
                  <option value="gemini">Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="claude">Claude</option>
                  <option value="groq">Groq</option>
                </select>
              }
            />
            <SettingRow title="Modello" description="Modello della verifica." right={verifierModelControl()} />
          </div>
          <SettingRow
            title="Max auto-riprovi"
            description="Numero massimo di tentativi automatici per pagina."
            right={
              <input
                type="number"
                value={qualityCheck.maxAutoRetries || 0}
                onChange={(e) => setQualityMaxRetries(Number(e.target.value))}
                className="w-20 bg-surface-4/50 border border-border-muted rounded-xl py-2 px-3 text-[12px] text-txt-primary outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 font-mono text-right transition-all duration-200"
              />
            }
          />
        </div>
      </div>

      <div className="space-y-3">
        <SectionTitle title="Metadati" description="Estrazione titolo/autore/anno e lingua." />
        <SettingRow
          title="Abilitata"
          description="Attiva/disattiva estrazione metadati."
          right={<input type="checkbox" checked={metadataExtraction.enabled} onChange={(e) => setMetadataEnabled(e.target.checked)} className="h-4 w-4 accent-accent" />}
        />
        <div className={metadataExtraction.enabled ? '' : 'opacity-40 pointer-events-none'}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <SettingRow
              id="setting-aiRoles.metadata.model"
              title="Provider"
              description="Provider metadati."
              right={
                <select
                  value={metadataExtraction.provider}
                  onChange={(e) => setMetadataProvider(e.target.value as AIProvider)}
                  className={selectClasses}
                >
                  <option value="gemini">Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="claude">Claude</option>
                  <option value="groq">Groq</option>
                </select>
              }
            />
            <SettingRow title="Modello" description="Modello metadati." right={metadataModelControl()} />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <SectionTitle title="Modelli custom" description="Aggiungi modelli personalizzati con listino." />
        <CustomModelManager
          settings={draftSettings}
          onUpdateSettings={(updater) => {
            const newS = updater(draftSettings);
            updateDraft({ customModels: newS.customModels || [] });
          }}
        />
      </div>
    </div>
  );
};
