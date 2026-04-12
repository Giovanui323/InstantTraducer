import React, { useMemo } from 'react';
import { AIProvider, AISettings } from '../../../types';
import { SettingRow } from '../SettingRow';
import { SettingsSearchItem } from '../search';
import {
  DEFAULT_CONCURRENT_TRANSLATIONS,
  DEFAULT_TRANSLATION_PROMPT_TEMPLATE,
  GEMINI_TRANSLATION_MODEL,
  GEMINI_VERIFIER_MODEL,
  MAX_ALLOWED_CONCURRENCY
} from '../../../constants';
import { Info } from 'lucide-react';
import { getGeminiTranslateSystemPrompt, getGeminiTranslateUserInstruction } from '../../../services/prompts/gemini';
import { getOpenAITranslateSystemPrompt, getOpenAITranslateUserInstruction } from '../../../services/prompts/openai';
import { getClaudeTranslateSystemPrompt, getClaudeTranslateUserInstruction } from '../../../services/prompts/claude';
import { getGroqTranslateSystemPrompt, getGroqTranslateUserInstruction } from '../../../services/prompts/groq';
import { getVerifyQualitySystemPrompt } from '../../../services/verifierPrompts';
import { getMetadataExtractionPrompt } from '../../../services/prompts/shared';

export const translationLogicSearchItems: SettingsSearchItem[] = [
  { id: 'translationLogic.legalContext', sectionId: 'translationLogic', sectionLabel: 'Traduzione & Logica', title: 'Contesto giuridico', description: 'Ottimizza la terminologia per testi di diritto.', keywords: ['legale', 'giuridico', 'terminologia'], anchorId: 'translationLogic.legalContext' },
  { id: 'translationLogic.concurrency', sectionId: 'translationLogic', sectionLabel: 'Traduzione & Logica', title: 'Traduzioni in parallelo', description: 'Numero di pagine elaborate contemporaneamente.', keywords: ['concorrenza', 'parallel', 'velocità'], anchorId: 'translationLogic.concurrency' },
  { id: 'translationLogic.sequential', sectionId: 'translationLogic', sectionLabel: 'Traduzione & Logica', title: 'Continuità narrativa (sequenziale)', description: 'Attende la pagina precedente per coerenza stilistica.', keywords: ['sequenziale', 'contesto', 'coerenza'], anchorId: 'translationLogic.sequential' },
  { id: 'translationLogic.prompt.translation', sectionId: 'translationLogic', sectionLabel: 'Traduzione & Logica', title: 'Prompt traduzione', description: 'Template principale per la traduzione.', keywords: ['prompt', 'traduzione', 'system'], anchorId: 'translationLogic.prompt.translation' },
  { id: 'translationLogic.prompt.verification', sectionId: 'translationLogic', sectionLabel: 'Traduzione & Logica', title: 'Prompt verifica qualità', description: 'Prompt del modello secondario per la verifica.', keywords: ['prompt', 'verifica', 'quality'], anchorId: 'translationLogic.prompt.verification' },
  { id: 'translationLogic.prompt.metadata', sectionId: 'translationLogic', sectionLabel: 'Traduzione & Logica', title: 'Prompt metadati', description: 'Prompt per estrazione titolo/autore/anno.', keywords: ['prompt', 'metadati', 'metadata'], anchorId: 'translationLogic.prompt.metadata' }
];

const getProviderLabel = (p: AIProvider) => (p === 'gemini' ? 'Gemini' : p === 'openai' ? 'OpenAI' : p === 'claude' ? 'Claude' : 'Groq');

const selectClasses = "bg-surface-4/50 border border-border-muted rounded-xl py-2 px-3 text-[12px] text-txt-primary outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all duration-200";
const textareaClasses = "w-full h-36 rounded-xl border border-border-muted bg-surface-3/30 p-3 text-[11px] text-txt-primary font-mono outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all duration-200 placeholder:text-txt-faint";
const readOnlyTextareaClasses = "w-full h-44 rounded-xl border border-border-muted bg-surface-0/50 p-3 text-[10px] text-txt-secondary font-mono outline-none";

export const TranslationLogicSection = ({
  draftSettings,
  updateDraft
}: {
  draftSettings: AISettings;
  updateDraft: (updates: Partial<AISettings>) => void;
}) => {
  const provider = draftSettings.provider;
  const legalContext = draftSettings.legalContext ?? true;
  const translationConcurrency = draftSettings.translationConcurrency ?? DEFAULT_CONCURRENT_TRANSLATIONS;
  const sequentialContext = draftSettings.sequentialContext ?? true;

  const geminiModel = draftSettings.gemini?.model || (GEMINI_TRANSLATION_MODEL as any);
  const openAIModel = draftSettings.openai?.model || 'gpt-4o';
  const claudeModel = draftSettings.claude?.model || 'claude-3-5-sonnet-20241022';
  const groqModel = draftSettings.groq?.model || 'llama-3.3-70b-versatile';
  const verifierProvider = draftSettings.qualityCheck?.verifierProvider || 'gemini';
  const verifierModel = draftSettings.qualityCheck?.verifierModel || GEMINI_VERIFIER_MODEL;

  const sourceLang = 'Tedesco';
  const prevContext = '';
  const pageNumber = 1;

  const translationSystem = useMemo(() => {
    if (provider === 'gemini') return getGeminiTranslateSystemPrompt(sourceLang, prevContext, legalContext, false, draftSettings.customPrompt, geminiModel);
    if (provider === 'openai') return getOpenAITranslateSystemPrompt(sourceLang, prevContext, legalContext, false, draftSettings.customPrompt);
    if (provider === 'claude') return getClaudeTranslateSystemPrompt(sourceLang, prevContext, legalContext, undefined, draftSettings.customPrompt);
    return getGroqTranslateSystemPrompt(sourceLang, prevContext, legalContext, false, draftSettings.customPrompt);
  }, [provider, sourceLang, prevContext, legalContext, draftSettings.customPrompt, geminiModel]);

  const translationUser = useMemo(() => {
    if (provider === 'gemini') return getGeminiTranslateUserInstruction(pageNumber, sourceLang);
    if (provider === 'openai') return getOpenAITranslateUserInstruction(pageNumber, sourceLang);
    if (provider === 'claude') return getClaudeTranslateUserInstruction(pageNumber, sourceLang);
    return getGroqTranslateUserInstruction(pageNumber, sourceLang);
  }, [provider, pageNumber, sourceLang]);

  const verificationSystem = useMemo(() => {
    if (draftSettings.customVerificationPrompt && draftSettings.customVerificationPrompt.trim().length > 0) {
      return draftSettings.customVerificationPrompt;
    }
    const modelName =
      verifierProvider === 'gemini'
        ? verifierModel
        : verifierProvider === 'openai'
          ? openAIModel
          : verifierProvider === 'groq'
            ? groqModel
            : claudeModel;
    return getVerifyQualitySystemPrompt(legalContext, sourceLang, modelName);
  }, [draftSettings.customVerificationPrompt, verifierProvider, verifierModel, openAIModel, groqModel, claudeModel, legalContext, sourceLang]);

  const metadataPrompt = useMemo(() => {
    if (draftSettings.customMetadataPrompt && draftSettings.customMetadataPrompt.trim().length > 0) {
      return draftSettings.customMetadataPrompt;
    }
    return getMetadataExtractionPrompt('Italiano');
  }, [draftSettings.customMetadataPrompt]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="text-[11px] text-txt-muted">
        Configura la logica di traduzione e i prompt. L'anteprima mostra i prompt effettivamente usati (con sourceLang={sourceLang}, page={pageNumber}, prevContext vuoto).
      </div>

      <div className="space-y-3">
        <SettingRow
          id="setting-translationLogic.legalContext"
          title="Contesto giuridico"
          description="Ottimizza la terminologia per testi di diritto."
          right={
            <input type="checkbox" checked={legalContext} onChange={(e) => updateDraft({ legalContext: e.target.checked })} className="h-4 w-4 accent-accent" />
          }
        />

        <SettingRow
          id="setting-translationLogic.concurrency"
          title="Traduzioni in parallelo"
          description="Pagine elaborate contemporaneamente (max 3 consigliato)."
          right={
            <div className="flex items-center gap-2">
              <button
                onClick={() => alert("Imposta quante pagine tradurre contemporaneamente.\n\nSe 'Continuità Narrativa' è ATTIVA, le pagine consecutive sono comunque sequenziali per coerenza stilistica.\n\nDisattivala per massima velocità (le pagine partiranno tutte insieme).")}
                className="text-txt-faint hover:text-txt-muted transition-colors duration-200"
              >
                <Info size={14} />
              </button>
              <select
                value={String(translationConcurrency)}
                onChange={(e) => updateDraft({ translationConcurrency: Math.max(1, Math.min(MAX_ALLOWED_CONCURRENCY, Number(e.target.value) || DEFAULT_CONCURRENT_TRANSLATIONS)) })}
                className={selectClasses}
              >
                {Array.from({ length: MAX_ALLOWED_CONCURRENCY }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          }
        />

        <SettingRow
          id="setting-translationLogic.sequential"
          title="Continuità narrativa (sequenziale)"
          description="Attende la pagina precedente per coerenza. Disattiva per massima velocità."
          right={
            <input type="checkbox" checked={sequentialContext} onChange={(e) => updateDraft({ sequentialContext: e.target.checked })} className="h-4 w-4 accent-accent" />
          }
        />
      </div>

      <div className="space-y-3">
        <div className="text-[12px] font-bold text-txt-primary">Prompt personalizzati</div>

        <SettingRow
          id="setting-translationLogic.prompt.translation"
          title="Prompt traduzione (template)"
          description={`Provider primario: ${getProviderLabel(provider)}. Se vuoto, usa il default.`}
          right={
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateDraft({ customPrompt: DEFAULT_TRANSLATION_PROMPT_TEMPLATE })}
                className="px-2.5 py-2 rounded-xl text-[11px] font-bold border border-border-muted bg-surface-4/50 text-txt-secondary hover:text-txt-primary hover:bg-surface-4 transition-all duration-200"
              >
                Default
              </button>
              <button
                onClick={() => updateDraft({ customPrompt: '' })}
                className="px-2.5 py-2 rounded-xl text-[11px] font-bold border border-danger/15 bg-danger/5 text-danger hover:bg-danger/10 transition-all duration-200"
              >
                Reset
              </button>
            </div>
          }
        />
        <textarea
          value={draftSettings.customPrompt || ''}
          onChange={(e) => updateDraft({ customPrompt: e.target.value })}
          placeholder="Lascia vuoto per il default…"
          className={textareaClasses}
        />

        <SettingRow
          id="setting-translationLogic.prompt.verification"
          title="Prompt verifica qualità (system)"
          description="Se vuoto, usa il prompt integrato del revisore."
          right={
            <button
              onClick={() => updateDraft({ customVerificationPrompt: '' })}
              className="px-2.5 py-2 rounded-xl text-[11px] font-bold border border-danger/15 bg-danger/5 text-danger hover:bg-danger/10 transition-all duration-200"
            >
              Reset
            </button>
          }
        />
        <textarea
          value={draftSettings.customVerificationPrompt || ''}
          onChange={(e) => updateDraft({ customVerificationPrompt: e.target.value })}
          placeholder="Lascia vuoto per usare il default…"
          className={textareaClasses}
        />

        <SettingRow
          id="setting-translationLogic.prompt.metadata"
          title="Prompt estrazione metadati"
          description="Se vuoto, usa il prompt integrato."
          right={
            <button
              onClick={() => updateDraft({ customMetadataPrompt: '' })}
              className="px-2.5 py-2 rounded-xl text-[11px] font-bold border border-danger/15 bg-danger/5 text-danger hover:bg-danger/10 transition-all duration-200"
            >
              Reset
            </button>
          }
        />
        <textarea
          value={draftSettings.customMetadataPrompt || ''}
          onChange={(e) => updateDraft({ customMetadataPrompt: e.target.value })}
          placeholder="Lascia vuoto per usare il default…"
          className={textareaClasses}
        />
      </div>

      <div className="space-y-3">
        <div className="text-[12px] font-bold text-txt-primary">Prompt effettivi (anteprima)</div>
        <div className="rounded-xl border border-border-muted bg-surface-3/30 p-4 space-y-4">
          <div className="text-[10px] text-txt-muted">
            Provider traduzione: {getProviderLabel(provider)} • Verifica: {getProviderLabel(verifierProvider)} ({verifierModel})
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-txt-secondary uppercase">Traduzione • System</div>
              <textarea readOnly value={translationSystem} className={readOnlyTextareaClasses} />
            </div>
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-txt-secondary uppercase">Traduzione • User</div>
              <textarea readOnly value={translationUser} className={readOnlyTextareaClasses} />
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-txt-secondary uppercase">Verifica • System</div>
              <textarea readOnly value={verificationSystem} className={readOnlyTextareaClasses} />
            </div>
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-txt-secondary uppercase">Metadati • Prompt</div>
              <textarea readOnly value={metadataPrompt} className={readOnlyTextareaClasses} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
