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
  MODAL_MODELS_LIST,
  ZAI_MODELS_LIST,
  OPENROUTER_MODELS_LIST,
  availableGeminiModels,
  availableClaudeModels,
  isGroqVisionModel,
  CLAUDE_MODELS_LIST
} from '../../../constants';
import { getModelPriceInfo } from '../../../services/aiUtils';
import { getAvailableModels } from '../../../services/modelManager';
import { SettingsSearchItem } from '../search';
import { CustomModelManager } from '../../CustomModelManager';
import { CustomProvidersSection } from './CustomProvidersSection';

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
    title: 'Modello Metadati',
    description: 'Modello usato per estrarre info dal PDF.',
    keywords: ['metadati', 'metadata', 'estrazione'],
    anchorId: 'aiRoles.metadata.model'
  },
  {
    id: 'aiRoles.enableClaudeOpusFast',
    sectionId: 'aiRoles',
    sectionLabel: 'Modelli & Ruoli',
    title: 'Abilita Claude Opus Fast (OpenRouter)',
    description: 'Rende visibile il modello Opus 4.6 Fast (molto costoso) nelle liste.',
    keywords: ['opus', 'fast', 'caro', 'costoso', 'expensive'],
    anchorId: 'aiRoles.enableClaudeOpusFast'
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

const ModelOption = ({ model }: { model: { id: string, name: string, pricing?: { input: string | number, output: string | number } } }) => {
  const info = getModelPriceInfo(model.pricing);
  return (
    <option key={model.id} value={model.id} style={{ color: info.color }}>
      {info.indicator} {model.name} {info.label && `(${info.label})`}
    </option>
  );
};

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

  const disabledProviders = draftSettings.disabledProviders || [];
  const isProviderAvailable = (p: AIProvider) => !disabledProviders.includes(p);

  const qualityCheck = draftSettings.qualityCheck || { enabled: true, verifierProvider: 'gemini' as AIProvider, verifierModel: GEMINI_VERIFIER_MODEL, maxAutoRetries: 1 };
  const metadataExtraction = draftSettings.metadataExtraction || { enabled: true, provider: 'gemini' as AIProvider, model: GEMINI_TRANSLATION_FLASH_MODEL };

  const setProvider = (p: AIProvider) => {
    const newDisabled = disabledProviders.includes(p) ? disabledProviders.filter(dp => dp !== p) : undefined;
    updateDraft({ 
      provider: p,
      ...(newDisabled !== undefined ? { disabledProviders: newDisabled } : {})
    });
  };

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
    else if (p === 'modal') nextModel = 'zai-org/GLM-5.1-FP8';
    else if (p === 'zai') nextModel = 'glm-4-plus';
    else if (p === 'openrouter') nextModel = 'anthropic/claude-haiku-4.5';
    const newDisabled = disabledProviders.includes(p) ? disabledProviders.filter(dp => dp !== p) : undefined;
    updateDraft({ 
      qualityCheck: { ...qualityCheck, verifierProvider: p, verifierModel: nextModel },
      ...(newDisabled !== undefined ? { disabledProviders: newDisabled } : {})
    });
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
    else if (p === 'modal') nextModel = 'zai-org/GLM-5.1-FP8';
    else if (p === 'zai') nextModel = 'glm-4v-flash';
    else if (p === 'openrouter') nextModel = 'anthropic/claude-haiku-4.5';
    const newDisabled = disabledProviders.includes(p) ? disabledProviders.filter(dp => dp !== p) : undefined;
    updateDraft({ 
      metadataExtraction: { ...metadataExtraction, provider: p, model: nextModel },
      ...(newDisabled !== undefined ? { disabledProviders: newDisabled } : {})
    });
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
            <ModelOption key={m.id} model={m} />
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
            <ModelOption key={m.id} model={m} />
          ))}
        </select>
      );
    }
    if (provider === 'modal') {
      return (
        <select
          value="zai-org/GLM-5.1-FP8"
          disabled
          className={selectClasses}
        >
          {MODAL_MODELS_LIST.map((m) => (
            <ModelOption key={m.id} model={m} />
          ))}
        </select>
      );
    }
    if (provider === 'zai') {
      const zai = draftSettings.zai || { apiKey: '', model: 'glm-4v-plus' };
      return (
        <select
          value={zai.model || 'glm-4v-plus'}
          onChange={(e) => updateDraft({ zai: { ...zai, model: e.target.value } })}
          className={selectClasses}
        >
          {ZAI_MODELS_LIST.map((m) => (
            <ModelOption key={m.id} model={m} />
          ))}
        </select>
      );
    }
    if (provider === 'openrouter') {
      const openrouter = draftSettings.openrouter || { apiKey: '', model: 'anthropic/claude-sonnet-4.5' };
      return (
        <div className="flex items-center gap-2">
          <select
            value={openrouter.model}
            onChange={(e) => updateDraft({ openrouter: { ...openrouter, model: e.target.value } })}
            className={selectClasses}
          >
            {getAvailableModels('openrouter', draftSettings).map((m) => (
              <ModelOption key={m.id} model={m} />
            ))}
          </select>
          <input
            value={openrouter.model}
            onChange={(e) => updateDraft({ openrouter: { ...openrouter, model: e.target.value } })}
            placeholder="Oppure custom (es. provider/model)"
            className={`${inputClasses} ml-1`}
          />
        </div>
      );
    }
    if (provider === 'custom') {
      const active = draftSettings.customProviders?.find(cp => cp.id === draftSettings.activeCustomProviderId);
      return (
        <input
          value={active ? `${active.model} (${active.name})` : 'Nessun provider custom selezionato'}
          readOnly
          className={inputClasses}
        />
      );
    }
    return (
      <select
        value={groq.model as any}
        onChange={(e) => setGroqModel(e.target.value as any)}
        className={selectClasses}
      >
        {GROQ_MODELS_LIST.filter((m) => isGroqVisionModel(m.id)).map((m) => (
          <ModelOption key={m.id} model={m} />
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
            <ModelOption key={m.id} model={m} />
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
            <ModelOption key={m.id} model={m} />
          ))}
        </select>
      );
    }
    if (provider === 'modal') {
      return (
        <input
          value={v}
          onChange={(e) => setForceFixTranslationModel(e.target.value)}
          placeholder="zai-org/GLM-5.1-FP8"
          readOnly
          className={inputClasses}
        />
      );
    }
    if (provider === 'zai') {
      return (
        <select
          value={v}
          onChange={(e) => setForceFixTranslationModel(e.target.value)}
          className={selectClasses}
        >
          <option value="">Usa modello primario</option>
          {ZAI_MODELS_LIST.map((m) => (
            <ModelOption key={m.id} model={m} />
          ))}
        </select>
      );
    }
    if (provider === 'openrouter') {
      return (
        <div className="flex items-center gap-2">
          <select
            value={v}
            onChange={(e) => setForceFixTranslationModel(e.target.value)}
            className={selectClasses}
          >
            <option value="">Usa modello primario</option>
            {OPENROUTER_MODELS_LIST.map((m) => (
              <ModelOption key={m.id} model={m} />
            ))}
          </select>
          {v && !OPENROUTER_MODELS_LIST.find(m => m.id === v) && (
            <span className="text-[10px] text-accent">Custom</span>
          )}
        </div>
      );
    }
    if (provider === 'custom') {
      return (
        <input
          value={v}
          onChange={(e) => setForceFixTranslationModel(e.target.value)}
          placeholder="Vuoto = primario"
          className={inputClasses}
        />
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
          <ModelOption key={m.id} model={m} />
        ))}
      </select>
    );
  };

  const verifierModelControl = () => {
    if (qualityCheck.verifierProvider === 'gemini') {
      return (
        <select value={qualityCheck.verifierModel} onChange={(e) => setQualityModel(e.target.value)} className={selectClasses}>
          {availableGeminiModels.map((m) => (
            <ModelOption key={m.id} model={m} />
          ))}
        </select>
      );
    }
    if (qualityCheck.verifierProvider === 'openai') {
      return (
        <select value={qualityCheck.verifierModel} onChange={(e) => setQualityModel(e.target.value)} className={selectClasses}>
          {OPENAI_MODELS_LIST.map((m) => (
            <ModelOption key={m.id} model={m} />
          ))}
        </select>
      );
    }
    if (qualityCheck.verifierProvider === 'claude') {
      return (
        <select value={qualityCheck.verifierModel} onChange={(e) => setQualityModel(e.target.value)} className={selectClasses}>
          {CLAUDE_MODELS_LIST.map((m) => (
            <ModelOption key={m.id} model={m} />
          ))}
        </select>
      );
    }
    if (qualityCheck.verifierProvider === 'modal') {
      return (
        <select value={qualityCheck.verifierModel} onChange={(e) => setQualityModel(e.target.value)} className={selectClasses}>
          {MODAL_MODELS_LIST.map((m) => (
            <ModelOption key={m.id} model={m} />
          ))}
        </select>
      );
    }
    if (qualityCheck.verifierProvider === 'zai') {
      return (
        <select value={qualityCheck.verifierModel} onChange={(e) => setQualityModel(e.target.value)} className={selectClasses}>
          {ZAI_MODELS_LIST.map((m) => (
            <ModelOption key={m.id} model={m} />
          ))}
        </select>
      );
    }
    if (qualityCheck.verifierProvider === 'openrouter') {
      return (
        <select value={qualityCheck.verifierModel} onChange={(e) => setQualityModel(e.target.value)} className={selectClasses}>
          {getAvailableModels('openrouter', draftSettings).map((m) => (
            <ModelOption key={m.id} model={m} />
          ))}
        </select>
      );
    }
    return (
      <select value={qualityCheck.verifierModel} onChange={(e) => setQualityModel(e.target.value)} className={selectClasses}>
        {GROQ_MODELS_LIST.map((m) => (
          <ModelOption key={m.id} model={m} />
        ))}
      </select>
    );
  };

  const metadataModelControl = () => {
    if (metadataExtraction.provider === 'gemini') {
      return (
        <select value={metadataExtraction.model} onChange={(e) => setMetadataModel(e.target.value)} className={selectClasses}>
          {GEMINI_MODELS_LIST.map((m) => (
            <ModelOption key={m.id} model={m} />
          ))}
        </select>
      );
    }
    if (metadataExtraction.provider === 'openai') {
      return (
        <select value={metadataExtraction.model} onChange={(e) => setMetadataModel(e.target.value)} className={selectClasses}>
          {OPENAI_MODELS_LIST.map((m) => (
            <ModelOption key={m.id} model={m} />
          ))}
        </select>
      );
    }
    if (metadataExtraction.provider === 'claude') {
      return (
        <select value={metadataExtraction.model} onChange={(e) => setMetadataModel(e.target.value)} className={selectClasses}>
          {CLAUDE_MODELS_LIST.map((m) => (
            <ModelOption key={m.id} model={m} />
          ))}
        </select>
      );
    }
    if (metadataExtraction.provider === 'modal') {
      return (
        <select value={metadataExtraction.model} onChange={(e) => setMetadataModel(e.target.value)} className={selectClasses}>
          {MODAL_MODELS_LIST.map((m) => (
            <ModelOption key={m.id} model={m} />
          ))}
        </select>
      );
    }
    if (metadataExtraction.provider === 'zai') {
      return (
        <select value={metadataExtraction.model} onChange={(e) => setMetadataModel(e.target.value)} className={selectClasses}>
          {ZAI_MODELS_LIST.map((m) => (
            <ModelOption key={m.id} model={m} />
          ))}
        </select>
      );
    }
    if (metadataExtraction.provider === 'openrouter') {
      return (
        <select value={metadataExtraction.model} onChange={(e) => setMetadataModel(e.target.value)} className={selectClasses}>
          {getAvailableModels('openrouter', draftSettings).map((m) => (
            <ModelOption key={m.id} model={m} />
          ))}
        </select>
      );
    }
    return (
      <select value={metadataExtraction.model} onChange={(e) => setMetadataModel(e.target.value)} className={selectClasses}>
        {GROQ_MODELS_LIST.map((m) => (
          <ModelOption key={m.id} model={m} />
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
              <option value="gemini">Google Gemini{!isProviderAvailable('gemini') && ' (disattivato)'}</option>
              <option value="openai">OpenAI{!isProviderAvailable('openai') && ' (disattivato)'}</option>
              <option value="claude">Claude{!isProviderAvailable('claude') && ' (disattivato)'}</option>
              <option value="groq">Groq{!isProviderAvailable('groq') && ' (disattivato)'}</option>
              <option value="modal">Modal (GLM-5.1){!isProviderAvailable('modal') && ' (disattivato)'}</option>
              <option value="zai">Z.ai (Zhipu AI){!isProviderAvailable('zai') && ' (disattivato)'}</option>
              <option value="openrouter">OpenRouter{!isProviderAvailable('openrouter') && ' (disattivato)'}</option>
              {draftSettings.customProviders && draftSettings.customProviders.length > 0 && (
                <option value="custom">Custom Provider</option>
              )}
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
                  <option value="gemini">Gemini{!isProviderAvailable('gemini') && ' (disattivato)'}</option>
                  <option value="openai">OpenAI{!isProviderAvailable('openai') && ' (disattivato)'}</option>
                  <option value="claude">Claude{!isProviderAvailable('claude') && ' (disattivato)'}</option>
                  <option value="groq">Groq{!isProviderAvailable('groq') && ' (disattivato)'}</option>
                  <option value="modal">Modal{!isProviderAvailable('modal') && ' (disattivato)'}</option>
                  <option value="zai">Z.ai{!isProviderAvailable('zai') && ' (disattivato)'}</option>
                  <option value="openrouter">OpenRouter{!isProviderAvailable('openrouter') && ' (disattivato)'}</option>
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
                  <option value="gemini">Gemini{!isProviderAvailable('gemini') && ' (disattivato)'}</option>
                  <option value="openai">OpenAI{!isProviderAvailable('openai') && ' (disattivato)'}</option>
                  <option value="claude">Claude{!isProviderAvailable('claude') && ' (disattivato)'}</option>
                  <option value="groq">Groq{!isProviderAvailable('groq') && ' (disattivato)'}</option>
                  <option value="modal">Modal{!isProviderAvailable('modal') && ' (disattivato)'}</option>
                  <option value="zai">Z.ai{!isProviderAvailable('zai') && ' (disattivato)'}</option>
                  <option value="openrouter">OpenRouter{!isProviderAvailable('openrouter') && ' (disattivato)'}</option>
                </select>
              }
            />
            <SettingRow title="Modello" description="Modello metadati." right={metadataModelControl()} />
          </div>
        </div>
      </div>

      <div className="pt-2 border-t border-border-muted/30 pb-4">
        <SettingRow
          id="setting-aiRoles.enableClaudeOpusFast"
          title="Abilita Claude Opus Fast"
          description="Permette di selezionare il modello Opus 4.6 Fast su OpenRouter. Attenzione: costi molto elevati ($30/$150)."
          right={
            <input
              type="checkbox"
              checked={draftSettings.enableClaudeOpusFast ?? false}
              onChange={(e) => updateDraft({ enableClaudeOpusFast: e.target.checked })}
              className="h-4 w-4 accent-red-500"
            />
          }
        />
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

      <div className="space-y-3">
        <SectionTitle title="Provider Personalizzati" description="Aggiungi endpoint AI custom (OpenAI/Anthropic/Gemini/Zhipu compatibili)." />
        <CustomProvidersSection draftSettings={draftSettings} updateDraft={updateDraft} />
      </div>
    </div>
  );
};
