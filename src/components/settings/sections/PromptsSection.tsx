import React, { useState, useMemo, useCallback } from 'react';
import {
  MessageSquare, ChevronRight, Copy, RotateCcw, FileText,
  Shield, BookOpen, Variable, Eye, Check, Info,
} from 'lucide-react';
import type { AISettings } from '../../../types';
import { SettingsSearchItem } from '../search';
import {
  DEFAULT_TRANSLATION_PROMPT_TEMPLATE,
  LITE_TRANSLATION_PROMPT_TEMPLATE,
  GEMINI_TRANSLATION_MODEL,
  GEMINI_VERIFIER_MODEL,
} from '../../../constants';
import { isLiteModel } from '../../../services/aiUtils';
import { getGeminiTranslateSystemPrompt, getGeminiTranslateUserInstruction } from '../../../services/prompts/gemini';
import { getOpenAITranslateSystemPrompt, getOpenAITranslateUserInstruction } from '../../../services/prompts/openai';
import { getClaudeTranslateSystemPrompt, getClaudeTranslateUserInstruction } from '../../../services/prompts/claude';
import { getGroqTranslateSystemPrompt, getGroqTranslateUserInstruction } from '../../../services/prompts/groq';
import { getOpenRouterTranslateSystemPrompt, getOpenRouterTranslateUserInstruction } from '../../../services/prompts/openrouter';
import { getVerifyQualitySystemPrompt } from '../../../services/verifierPrompts';
import { getMetadataExtractionPrompt } from '../../../services/prompts/shared';

// ─── Search Items ───

export const promptsSearchItems: SettingsSearchItem[] = [
  { id: 'prompts.translation', sectionId: 'prompts', sectionLabel: 'Gestione Prompt', title: 'Prompt traduzione', description: 'Template system per la traduzione. Supporta variabili {{sourceLang}}, {{prevContext}}, {{legalContext}}, {{retryMode}}.', keywords: ['prompt', 'traduzione', 'system', 'template', 'custom'], anchorId: 'prompts.translation' },
  { id: 'prompts.verification', sectionId: 'prompts', sectionLabel: 'Gestione Prompt', title: 'Prompt verifica qualità', description: 'Prompt del modello secondario per la verifica di qualità.', keywords: ['prompt', 'verifica', 'quality', 'revisione'], anchorId: 'prompts.verification' },
  { id: 'prompts.metadata', sectionId: 'prompts', sectionLabel: 'Gestione Prompt', title: 'Prompt metadati', description: 'Prompt per estrazione titolo, autore e anno.', keywords: ['prompt', 'metadati', 'metadata', 'titolo'], anchorId: 'prompts.metadata' },
  { id: 'prompts.legalContext', sectionId: 'prompts', sectionLabel: 'Gestione Prompt', title: 'Contesto giuridico', description: 'Attiva terminologia giuridica nei prompt di traduzione e verifica.', keywords: ['legale', 'giuridico', 'diritto', 'terminologia'], anchorId: 'prompts.legalContext' },
];

// ─── Types ───

type PromptTab = 'translation' | 'verification' | 'metadata';

// ─── Styles ───

const textareaClasses = "w-full h-52 rounded-xl border border-border-muted bg-surface-3/30 p-3 text-[11px] text-txt-primary font-mono outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all duration-200 placeholder:text-txt-faint resize-y";
const readOnlyClasses = "w-full h-52 rounded-xl border border-border-muted bg-surface-0/50 p-3 text-[10px] text-txt-secondary font-mono outline-none resize-none";

// ─── Sub-components ───

const VariableTag = ({ name, description }: { name: string; description: string }) => (
  <div className="flex items-start gap-2 py-1.5">
    <code className="shrink-0 text-[10px] font-bold font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded">{name}</code>
    <span className="text-[10px] text-txt-muted leading-relaxed">{description}</span>
  </div>
);

const PromptStatusBadge = ({ hasCustom }: { hasCustom: boolean }) => (
  <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${
    hasCustom
      ? 'bg-accent/10 text-accent border-accent/20'
      : 'bg-surface-4/50 text-txt-muted border-border-muted'
  }`}>
    {hasCustom ? <><Check size={9} /> Personalizzato</> : 'Usa default'}
  </span>
);

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold border border-border-muted bg-surface-4/50 text-txt-secondary hover:text-txt-primary hover:bg-surface-4 transition-all duration-200 flex items-center gap-1.5"
    >
      {copied ? <Check size={10} className="text-success" /> : <Copy size={10} />}
      {copied ? 'Copiato' : 'Copia'}
    </button>
  );
};

const CollapsibleSection = ({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) => (
  <details open={defaultOpen} className="group">
    <summary className="cursor-pointer flex items-center gap-2 py-2 select-none">
      <ChevronRight size={12} className="text-txt-muted transition-transform group-open:rotate-90 shrink-0" />
      <span className="text-[11px] font-bold text-txt-secondary">{title}</span>
      {badge}
    </summary>
    <div className="mt-2 space-y-2">{children}</div>
  </details>
);

// ─── Main Component ───

export const PromptsSection: React.FC<{
  draftSettings: AISettings;
  updateDraft: (updates: Partial<AISettings>) => void;
}> = ({ draftSettings, updateDraft }) => {
  const [activeTab, setActiveTab] = useState<PromptTab>('translation');

  const legalContext = draftSettings.legalContext ?? true;
  const provider = draftSettings.provider || 'gemini';
  const verifierProvider = draftSettings.qualityCheck?.verifierProvider || 'gemini';
  const verifierModel = draftSettings.qualityCheck?.verifierModel || GEMINI_VERIFIER_MODEL;
  const geminiModel = draftSettings.gemini?.model || GEMINI_TRANSLATION_MODEL;

  // Default templates per provider
  const defaultTranslationTemplate = useMemo(() => {
    // Determine the specific model ID based on provider
    let activeModelId = '';
    if (provider === 'gemini') activeModelId = draftSettings.gemini?.model || '';
    else if (provider === 'openai') activeModelId = draftSettings.openai?.model || '';
    else if (provider === 'claude') activeModelId = draftSettings.claude?.model || '';
    else if (provider === 'groq') activeModelId = draftSettings.groq?.model || '';
    else if (provider === 'openrouter') activeModelId = draftSettings.openrouter?.model || '';

    const isLite = activeModelId ? isLiteModel(activeModelId) : false;
    return isLite ? LITE_TRANSLATION_PROMPT_TEMPLATE : DEFAULT_TRANSLATION_PROMPT_TEMPLATE;
  }, [provider, draftSettings]);

  // Resolved preview prompts (with variables substituted)
  const translationPreview = useMemo(() => {
    const sourceLang = 'Tedesco';
    const prevContext = '';
    if (provider === 'gemini') return getGeminiTranslateSystemPrompt(sourceLang, prevContext, legalContext, false, draftSettings.customPrompt, geminiModel);
    if (provider === 'openai') return getOpenAITranslateSystemPrompt(sourceLang, prevContext, legalContext, false, draftSettings.customPrompt);
    if (provider === 'claude') return getClaudeTranslateSystemPrompt(sourceLang, prevContext, legalContext, undefined, draftSettings.customPrompt);
    if (provider === 'openrouter') return getOpenRouterTranslateSystemPrompt(sourceLang, prevContext, legalContext, false, draftSettings.customPrompt);
    return getGroqTranslateSystemPrompt(sourceLang, prevContext, legalContext, false, draftSettings.customPrompt);
  }, [provider, legalContext, draftSettings.customPrompt, geminiModel]);

  const userInstructionPreview = useMemo(() => {
    const sourceLang = 'Tedesco';
    if (provider === 'gemini') return getGeminiTranslateUserInstruction(1, sourceLang);
    if (provider === 'openai') return getOpenAITranslateUserInstruction(1, sourceLang);
    if (provider === 'claude') return getClaudeTranslateUserInstruction(1, sourceLang);
    if (provider === 'openrouter') return getOpenRouterTranslateUserInstruction(1, sourceLang);
    return getGroqTranslateUserInstruction(1, sourceLang);
  }, [provider]);

  const verificationPreview = useMemo(() => {
    if (draftSettings.customVerificationPrompt?.trim()) return draftSettings.customVerificationPrompt;
    return getVerifyQualitySystemPrompt(legalContext, 'Tedesco', verifierModel);
  }, [draftSettings.customVerificationPrompt, legalContext, verifierModel]);

  const metadataPreview = useMemo(() => {
    if (draftSettings.customMetadataPrompt?.trim()) return draftSettings.customMetadataPrompt;
    return getMetadataExtractionPrompt('Italiano');
  }, [draftSettings.customMetadataPrompt]);

  const defaultVerificationTemplate = useMemo(() => getVerifyQualitySystemPrompt(true, 'Tedesco', verifierModel), [verifierModel]);
  const defaultMetadataTemplate = useMemo(() => getMetadataExtractionPrompt('Italiano'), []);

  // Provider label
  const providerLabel = provider === 'gemini' ? 'Gemini' : provider === 'openai' ? 'OpenAI' : provider === 'claude' ? 'Claude' : provider === 'groq' ? 'Groq' : provider === 'modal' ? 'Modal' : provider === 'openrouter' ? 'OpenRouter' : 'Z.ai';

  // Tab config
  const tabs: Array<{ id: PromptTab; label: string; icon: React.ReactNode }> = [
    { id: 'translation', label: 'Traduzione', icon: <BookOpen size={13} /> },
    { id: 'verification', label: 'Verifica Qualità', icon: <Shield size={13} /> },
    { id: 'metadata', label: 'Estrazione Metadati', icon: <FileText size={13} /> },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Hero Header ── */}
      <div className="rounded-2xl border border-border-muted bg-gradient-to-br from-surface-3/60 via-surface-2/40 to-surface-3/60 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent border border-accent/15">
            <MessageSquare size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-txt-primary">Gestione Prompt</h3>
            <p className="text-[10px] text-txt-muted mt-0.5">
              Leggi, personalizza e gestisci i prompt per traduzione, verifica ed estrazione metadati.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-txt-muted">Contesto giuridico</span>
            <button
              onClick={() => updateDraft({ legalContext: !legalContext })}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
                legalContext ? 'bg-accent' : 'bg-surface-4'
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-200 ${
                legalContext ? 'translate-x-[18px]' : 'translate-x-[3px]'
              }`} />
            </button>
          </div>
        </div>

        {/* Provider info */}
        <div className="flex items-center gap-2 text-[10px] text-txt-muted">
          <Info size={11} />
          <span>Provider traduzione: <strong className="text-txt-secondary">{providerLabel}</strong></span>
          <span className="text-border-muted">·</span>
          <span>Verifica: <strong className="text-txt-secondary">{verifierProvider === 'gemini' ? 'Gemini' : verifierProvider === 'openai' ? 'OpenAI' : verifierProvider === 'claude' ? 'Claude' : 'Groq'} ({verifierModel})</strong></span>
        </div>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="flex items-center gap-1 bg-surface-4/30 rounded-xl p-1 border border-border-muted">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold rounded-lg transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-surface-3 text-txt-primary shadow-sm border border-border-muted'
                : 'text-txt-muted hover:text-txt-secondary'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}

      {/* === TRANSLATION TAB === */}
      {activeTab === 'translation' && (
        <div className="space-y-4">
          {/* Variables reference */}
          <CollapsibleSection title="Variabili disponibili" badge={<span className="text-[9px] font-mono text-accent/70 bg-accent/5 px-1.5 py-0.5 rounded ml-1">4 variabili</span>}>
            <div className="rounded-lg border border-border-muted bg-surface-4/20 p-3 space-y-0.5">
              <VariableTag name="{{sourceLang}}" description="Lingua del documento originale (es. 'Tedesco', 'Francese'). Inserita automaticamente." />
              <VariableTag name="{{prevContext}}" description="Testo della pagina precedente per coerenza. Troncato a max 3000 caratteri." />
              <VariableTag name="{{legalContext}}" description={`Blocco terminologia giuridica. Attivo solo se il toggle è ON (attualmente ${legalContext ? 'ON' : 'OFF'}).`} />
              <VariableTag name="{{retryMode}}" description="Istruzioni aggiuntive per ritraduzione. Appare solo in modalità retry/correzione." />
            </div>
          </CollapsibleSection>

          {/* Default prompt */}
          <CollapsibleSection title="Prompt di default" badge={<span className="text-[9px] font-mono text-txt-muted bg-surface-4/50 px-1.5 py-0.5 rounded ml-1">{providerLabel}</span>}>
            <div className="relative">
              <textarea readOnly value={defaultTranslationTemplate} className={readOnlyClasses} />
              <div className="absolute top-2 right-2">
                <CopyButton text={defaultTranslationTemplate} />
              </div>
            </div>
          </CollapsibleSection>

          {/* Custom prompt editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-txt-primary">Prompt personalizzato</span>
                <PromptStatusBadge hasCustom={!!draftSettings.customPrompt?.trim()} />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateDraft({ customPrompt: DEFAULT_TRANSLATION_PROMPT_TEMPLATE })}
                  className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold border border-border-muted bg-surface-4/50 text-txt-secondary hover:text-txt-primary hover:bg-surface-4 transition-all duration-200"
                >
                  Usa Default
                </button>
                <button
                  onClick={() => updateDraft({ customPrompt: '' })}
                  className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold border border-danger/15 bg-danger/5 text-danger hover:bg-danger/10 transition-all duration-200"
                >
                  Reset
                </button>
              </div>
            </div>
            <textarea
              value={draftSettings.customPrompt || ''}
              onChange={(e) => updateDraft({ customPrompt: e.target.value })}
              placeholder="Lascia vuoto per usare il prompt di default. Inserisci un template con le variabili {{sourceLang}}, {{prevContext}}, {{legalContext}}, {{retryMode}} per personalizzare la traduzione."
              className={textareaClasses}
            />
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-txt-faint">
                {!draftSettings.customPrompt?.trim() ? 'Vuoto → usa il prompt di default' : `Caratteri: ${draftSettings.customPrompt?.length || 0}`}
              </span>
            </div>
          </div>

          {/* Live preview */}
          <CollapsibleSection title="Anteprima prompt effettivo" badge={<Eye size={10} className="text-txt-muted" />} defaultOpen={false}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="text-[9px] font-bold text-txt-muted uppercase tracking-wider">System Prompt (risolto)</div>
                <textarea readOnly value={translationPreview} className={readOnlyClasses} />
              </div>
              <div className="space-y-1">
                <div className="text-[9px] font-bold text-txt-muted uppercase tracking-wider">User Instruction</div>
                <textarea readOnly value={userInstructionPreview} className={readOnlyClasses} />
              </div>
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* === VERIFICATION TAB === */}
      {activeTab === 'verification' && (
        <div className="space-y-4">
          {/* Default verification prompt */}
          <CollapsibleSection title="Prompt di default" badge={<span className="text-[9px] font-mono text-txt-muted bg-surface-4/50 px-1.5 py-0.5 rounded ml-1">Verifica: {verifierProvider} ({verifierModel})</span>}>
            <div className="relative">
              <textarea readOnly value={defaultVerificationTemplate} className={readOnlyClasses} />
              <div className="absolute top-2 right-2">
                <CopyButton text={defaultVerificationTemplate} />
              </div>
            </div>
          </CollapsibleSection>

          {/* Custom verification prompt editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-txt-primary">Prompt personalizzato</span>
                <PromptStatusBadge hasCustom={!!draftSettings.customVerificationPrompt?.trim()} />
              </div>
              <button
                onClick={() => updateDraft({ customVerificationPrompt: '' })}
                className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold border border-danger/15 bg-danger/5 text-danger hover:bg-danger/10 transition-all duration-200"
              >
                Reset
              </button>
            </div>
            <textarea
              value={draftSettings.customVerificationPrompt || ''}
              onChange={(e) => updateDraft({ customVerificationPrompt: e.target.value })}
              placeholder="Lascia vuoto per usare il prompt di verifica integrato. Il prompt personalizzato sovrascrive completamente il default."
              className={textareaClasses}
            />
            <span className="text-[9px] text-txt-faint">
              {!draftSettings.customVerificationPrompt?.trim() ? 'Vuoto → usa il prompt di verifica integrato' : `Caratteri: ${draftSettings.customVerificationPrompt?.length || 0}`}
            </span>
          </div>

          {/* Verification preview */}
          <CollapsibleSection title="Anteprima prompt effettivo" badge={<Eye size={10} className="text-txt-muted" />} defaultOpen={false}>
            <div className="relative">
              <textarea readOnly value={verificationPreview} className={readOnlyClasses} />
              <div className="absolute top-2 right-2">
                <CopyButton text={verificationPreview} />
              </div>
            </div>
          </CollapsibleSection>
        </div>
      )}

      {/* === METADATA TAB === */}
      {activeTab === 'metadata' && (
        <div className="space-y-4">
          {/* Default metadata prompt */}
          <CollapsibleSection title="Prompt di default" badge={<span className="text-[9px] font-mono text-txt-muted bg-surface-4/50 px-1.5 py-0.5 rounded ml-1">Estrazione</span>}>
            <div className="relative">
              <textarea readOnly value={defaultMetadataTemplate} className={readOnlyClasses} />
              <div className="absolute top-2 right-2">
                <CopyButton text={defaultMetadataTemplate} />
              </div>
            </div>
          </CollapsibleSection>

          {/* Custom metadata prompt editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-txt-primary">Prompt personalizzato</span>
                <PromptStatusBadge hasCustom={!!draftSettings.customMetadataPrompt?.trim()} />
              </div>
              <button
                onClick={() => updateDraft({ customMetadataPrompt: '' })}
                className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold border border-danger/15 bg-danger/5 text-danger hover:bg-danger/10 transition-all duration-200"
              >
                Reset
              </button>
            </div>
            <textarea
              value={draftSettings.customMetadataPrompt || ''}
              onChange={(e) => updateDraft({ customMetadataPrompt: e.target.value })}
              placeholder="Lascia vuoto per usare il prompt di estrazione integrato. Il prompt deve richiedere un JSON con year, author, title."
              className={textareaClasses}
            />
            <span className="text-[9px] text-txt-faint">
              {!draftSettings.customMetadataPrompt?.trim() ? 'Vuoto → usa il prompt di estrazione integrato' : `Caratteri: ${draftSettings.customMetadataPrompt?.length || 0}`}
            </span>
          </div>

          {/* Metadata preview */}
          <CollapsibleSection title="Anteprima prompt effettivo" badge={<Eye size={10} className="text-txt-muted" />} defaultOpen={false}>
            <div className="relative">
              <textarea readOnly value={metadataPreview} className={readOnlyClasses} />
              <div className="absolute top-2 right-2">
                <CopyButton text={metadataPreview} />
              </div>
            </div>
          </CollapsibleSection>
        </div>
      )}
    </div>
  );
};
