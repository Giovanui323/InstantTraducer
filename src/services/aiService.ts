import { translateWithGemini } from "./geminiService";
import { translateWithOpenAI } from "./openaiService";
import { translateWithClaude } from "./claudeService";
import { translateWithGroq, validateGroqForTranslation } from "./groqService";
import { verifyQualityAdapter, extractMetadataAdapter } from "./aiAdapter";
import { getSafeModel } from "./modelManager";
import { AISettings, GeminiModel, TranslationResult, OpenAIModel, ClaudeModel, PageVerification, PDFMetadata, GroqModel } from "../types";
import { log } from "./logger";
import { GEMINI_TRANSLATION_MODEL, GEMINI_VERIFIER_MODEL } from "../constants";

type ProviderReadyResult = { ok: boolean; fromCache: boolean };

const ensureProviderReady = async (
  provider: 'gemini' | 'openai' | 'claude' | 'groq',
  settings: AISettings,
  modelOverride?: string
): Promise<ProviderReadyResult> => {
  const apiKey = provider === 'gemini' ? settings.gemini.apiKey?.trim()
    : provider === 'openai' ? settings.openai.apiKey?.trim()
    : provider === 'claude' ? settings.claude?.apiKey?.trim()
    : settings.groq?.apiKey?.trim();
  
  if (!apiKey) return { ok: false, fromCache: false };
  
  return { ok: true, fromCache: true };
};

export const ensureGeminiReady = (settings: AISettings, modelOverride?: GeminiModel) => 
  ensureProviderReady('gemini', settings, modelOverride);

export const ensureOpenAIReady = (settings: AISettings, modelOverride?: OpenAIModel) => 
  ensureProviderReady('openai', settings, modelOverride);

export const ensureClaudeReady = (settings: AISettings, modelOverride?: ClaudeModel) => 
  ensureProviderReady('claude', settings, modelOverride);

export const ensureGroqReady = (settings: AISettings, modelOverride?: GroqModel) => 
  ensureProviderReady('groq', settings, modelOverride);

export const __resetAiReadinessCache = () => {
  // No-op: Cache removed
};

export const __resetGeminiCacheForTests = __resetAiReadinessCache;

export const translatePage = async (
  settings: AISettings,
  config: {
    imageBase64: string,
    pageNumber: number,
    sourceLanguage: string,
    previousContext: string,
    prevPageImageBase64?: string,
    prevPageNumber?: number,
    nextPageImageBase64?: string,
    nextPageNumber?: number,
    extraInstruction?: string,
    translationModelOverride?: GeminiModel,
    skipPostProcessing?: boolean
  },
  onProgress?: (text: string, partialText?: string) => void,
  options?: { signal?: AbortSignal }
): Promise<TranslationResult> => {
  const imageBytesApprox = Math.floor((config.imageBase64.length * 3) / 4);
  log.step(`Instradamento richiesta AI (pagina ${config.pageNumber})`, {
    provider: settings.provider,
    imageKB: Math.round(imageBytesApprox / 1024),
    previousContextChars: config.previousContext?.length || 0
  });
  const startedAt = performance.now();

  if (settings.provider === 'gemini') {
    const rawModel = config.translationModelOverride || settings.gemini.model || GEMINI_TRANSLATION_MODEL;
    const model = getSafeModel(rawModel, 'gemini', settings);
    const readinessStartedAt = performance.now();
    if (onProgress) onProgress(`Verifica configurazione Gemini (${model})...`);
    const ready = await ensureGeminiReady(settings, model);
    if (!ready.ok) {
      const msg = "Gemini non pronto: verifica API key fallita.";
      log.error(msg);
      throw new Error(msg);
    }
    if (onProgress) onProgress(`Gemini pronto (${ready.fromCache ? 'cache' : 'test'} - ${Math.round(performance.now() - readinessStartedAt)}ms)`);
    if (onProgress) onProgress(`Selezionato provider Gemini (model: ${model})`);
    
    // Secure logging of API key usage (last 4 chars only)
    const apiKey = settings.gemini.apiKey || '';
    const maskedKey = apiKey.length > 8 ? `...${apiKey.slice(-4)}` : '(short/invalid)';
    log.info(`[GEMINI] Using API Key suffix: ${maskedKey}`);

    const res = await translateWithGemini(
      config.imageBase64,
      config.pageNumber,
      config.sourceLanguage,
      config.previousContext,
      config.prevPageImageBase64,
      config.prevPageNumber,
      config.nextPageImageBase64,
      config.nextPageNumber,
      model,
      settings.gemini.apiKey,
      config.extraInstruction,
      onProgress,
      options?.signal,
      settings.legalContext ?? true,
      settings.customPrompt,
      config.skipPostProcessing,
      settings.gemini.thinkingLevel
    );
    log.success(`Completata traduzione pagina ${config.pageNumber} con Gemini`, { elapsedMs: Math.round(performance.now() - startedAt), chars: res?.text?.length || 0, model });
    return res;
  }

  if (settings.provider === 'openai') {
    const rawModel = config.translationModelOverride || settings.openai.model;
    const model = getSafeModel(rawModel, 'openai', settings);
    const readinessStartedAt = performance.now();
    if (onProgress) onProgress(`Verifica configurazione OpenAI (${model})...`);
    const ready = await ensureOpenAIReady(settings, model);
    if (!ready.ok) {
      const msg = "OpenAI non pronto: verifica API key fallita.";
      log.error(msg);
      throw new Error(msg);
    }
    if (onProgress) onProgress(`OpenAI pronto (${ready.fromCache ? 'cache' : 'test'} - ${Math.round(performance.now() - readinessStartedAt)}ms)`);
    if (onProgress) onProgress(`Selezionato provider OpenAI (model: ${model})`);
    
    // Secure logging of API key usage (last 4 chars only)
    const apiKey = settings.openai.apiKey || '';
    const maskedKey = apiKey.length > 8 ? `...${apiKey.slice(-4)}` : '(short/invalid)';
    log.info(`[OPENAI] Using API Key suffix: ${maskedKey}`);

    const res = await translateWithOpenAI(
      config.imageBase64,
      config.pageNumber,
      config.sourceLanguage,
      config.previousContext,
      config.prevPageImageBase64,
      config.prevPageNumber,
      config.nextPageImageBase64,
      config.nextPageNumber,
      settings.openai.apiKey,
      model,
      settings.openai.reasoningEffort,
      settings.openai.verbosity,
      config.extraInstruction,
      onProgress,
      options?.signal,
      settings.legalContext ?? true,
      settings.customPrompt,
      config.skipPostProcessing
    );
    log.success(`Completata traduzione pagina ${config.pageNumber} con OpenAI`, { elapsedMs: Math.round(performance.now() - startedAt), chars: res?.text?.length || 0, model });
    return res;
  }

  if (settings.provider === 'claude') {
    const rawModel = config.translationModelOverride || settings.claude.model;
    const model = getSafeModel(rawModel, 'claude', settings);
    const readinessStartedAt = performance.now();
    if (onProgress) onProgress(`Verifica configurazione Claude (${model})...`);
    const ready = await ensureClaudeReady(settings, model);
    if (!ready.ok) {
      const msg = "Claude non pronto: verifica API key fallita.";
      log.error(msg);
      throw new Error(msg);
    }
    if (onProgress) onProgress(`Claude pronto (${ready.fromCache ? 'cache' : 'test'} - ${Math.round(performance.now() - readinessStartedAt)}ms)`);
    if (onProgress) onProgress(`Selezionato provider Claude (model: ${model})`);
    
    // Secure logging of API key usage (last 4 chars only)
    const apiKey = settings.claude.apiKey || '';
    const maskedKey = apiKey.length > 8 ? `...${apiKey.slice(-4)}` : '(short/invalid)';
    log.info(`[CLAUDE] Using API Key suffix: ${maskedKey}`);

    const res = await translateWithClaude(
      config.imageBase64,
      config.pageNumber,
      config.sourceLanguage,
      config.previousContext,
      config.prevPageImageBase64,
      config.prevPageNumber,
      config.nextPageImageBase64,
      config.nextPageNumber,
      settings.claude.apiKey,
      model,
      config.extraInstruction,
      onProgress,
      options?.signal,
      settings.legalContext ?? true,
      settings.customPrompt,
      config.skipPostProcessing
    );
    log.success(`Completata traduzione pagina ${config.pageNumber} con Claude`, { elapsedMs: Math.round(performance.now() - startedAt), chars: res?.text?.length || 0, model });
    return res;
  }

  if (settings.provider === 'groq') {
    const rawModel = config.translationModelOverride || settings.groq?.model || 'meta-llama/llama-4-scout-17b-16e-instruct';
    const model = getSafeModel(rawModel, 'groq' as any, settings); // getSafeModel might need Groq support update
    const readinessStartedAt = performance.now();
    if (onProgress) onProgress(`Verifica configurazione Groq (${model})...`);
    const ready = await ensureGroqReady(settings, model as any);
    if (!ready.ok) {
      const msg = "Groq non pronto: verifica API key fallita.";
      log.error(msg);
      throw new Error(msg);
    }

    // Pre-flight: check if model supports vision and image size
    const preCheck = validateGroqForTranslation(model, config.imageBase64);
    if (!preCheck.ok) {
      throw new Error(preCheck.reason);
    }

    if (onProgress) onProgress(`Groq pronto (${ready.fromCache ? 'cache' : 'test'} - ${Math.round(performance.now() - readinessStartedAt)}ms)`);
    if (onProgress) onProgress(`Selezionato provider Groq (model: ${model})`);
    
    // Secure logging of API key usage (last 4 chars only)
    const apiKey = settings.groq?.apiKey || '';
    const maskedKey = apiKey.length > 8 ? `...${apiKey.slice(-4)}` : '(short/invalid)';
    log.info(`[GROQ] Using API Key suffix: ${maskedKey}`);

    const res = await translateWithGroq(
      config.imageBase64,
      config.pageNumber,
      config.sourceLanguage,
      config.previousContext,
      config.prevPageImageBase64,
      config.prevPageNumber,
      config.nextPageImageBase64,
      config.nextPageNumber,
      settings.groq?.apiKey || '',
      model as GroqModel,
      config.extraInstruction,
      onProgress,
      options?.signal,
      settings.legalContext ?? true,
      settings.customPrompt,
      config.skipPostProcessing
    );
    log.success(`Completata traduzione pagina ${config.pageNumber} con Groq`, { elapsedMs: Math.round(performance.now() - startedAt), chars: res?.text?.length || 0, model });
    return res;
  }

  throw new Error("Provider non supportato.");
};

/**
 * Verifica se la chiave API del provider selezionato è presente.
 */
export const checkApiConfiguration = (settings: AISettings): boolean => {
  if (settings.provider === 'gemini') return (settings.gemini.apiKey || '').trim().length > 0;
  if (settings.provider === 'openai') return (settings.openai.apiKey || '').trim().length > 0;
  if (settings.provider === 'claude') return (settings.claude?.apiKey || '').trim().length > 0;
  if (settings.provider === 'groq') return (settings.groq?.apiKey || '').trim().length > 0;
  return false;
};

/**
 * Verifica la qualità di una traduzione usando il provider selezionato.
 */
export const verifyTranslationQuality = async (
  params: {
    translatedText: string,
    imageBase64: string,
    pageNumber: number,
    prevPageImageBase64?: string,
    prevPageNumber?: number,
    nextPageImageBase64?: string,
    nextPageNumber?: number,
    settings: AISettings,
    signal?: AbortSignal,
    sourceLanguage?: string
  }
): Promise<PageVerification | null> => {
  const { settings, ...rest } = params;
  const provider = settings.qualityCheck?.verifierProvider || settings.provider;
  
  if (provider === 'gemini') {
    const model = settings.qualityCheck?.verifierModel || GEMINI_VERIFIER_MODEL;
    const ready = await ensureGeminiReady(settings, model);
    if (!ready.ok) throw new Error("Gemini non pronto per la verifica.");
    return await verifyQualityAdapter({ settings, ...rest });
  }

  if (provider === 'openai') {
    const model = settings.qualityCheck?.verifierModel || settings.openai.model;
    const ready = await ensureOpenAIReady(settings, model);
    if (!ready.ok) throw new Error("OpenAI non pronto per la verifica.");
    return await verifyQualityAdapter({ settings, ...rest });
  }

  if (provider === 'claude') {
    const model = settings.qualityCheck?.verifierModel || settings.claude.model;
    const ready = await ensureClaudeReady(settings, model);
    if (!ready.ok) throw new Error("Claude non pronto per la verifica.");
    return await verifyQualityAdapter({ settings, ...rest });
  }

  if (provider === 'groq') {
    const model = settings.qualityCheck?.verifierModel || settings.groq?.model || 'llama-3.3-70b-versatile';
    const ready = await ensureGroqReady(settings, model as any);
    if (!ready.ok) throw new Error("Groq non pronto per la verifica.");
    return await verifyQualityAdapter({ settings, ...rest });
  }

  return null;
};

/**
 * Estrae i metadati PDF usando il provider selezionato.
 */
export const extractPdfMetadata = async (
  base64Images: string[],
  settings: AISettings,
  options?: { signal?: AbortSignal }
): Promise<PDFMetadata> => {
  const provider = settings.metadataExtraction?.provider || settings.provider;
  const model = settings.metadataExtraction?.model || (
    provider === 'gemini' ? settings.gemini.model :
    provider === 'openai' ? settings.openai.model :
    provider === 'groq' ? (settings.groq?.model || 'meta-llama/llama-4-scout-17b-16e-instruct') :
    settings.claude.model
  );
  
  if (provider === 'gemini') {
    const ready = await ensureGeminiReady(settings, model);
    if (!ready.ok) throw new Error("Gemini non pronto per l'estrazione metadati.");
    return await extractMetadataAdapter(base64Images, settings, options);
  }

  if (provider === 'openai') {
    const ready = await ensureOpenAIReady(settings, model);
    if (!ready.ok) throw new Error("OpenAI non pronto per l'estrazione metadati.");
    return await extractMetadataAdapter(base64Images, settings, options);
  }

  if (provider === 'claude') {
    const ready = await ensureClaudeReady(settings, model);
    if (!ready.ok) throw new Error("Claude non pronto per l'estrazione metadati.");
    return await extractMetadataAdapter(base64Images, settings, options);
  }

  if (provider === 'groq') {
    // Groq vision (Scout) supports image input — use it for metadata extraction
    if (!settings.groq?.apiKey?.trim()) throw new Error("API key Groq mancante per l'estrazione metadati.");
    const ready = await ensureGroqReady(settings, model as any);
    if (!ready.ok) throw new Error("Groq non pronto per l'estrazione metadati.");
    return await extractMetadataAdapter(base64Images, settings, options);
  }

  throw new Error("Provider non supportato per l'estrazione metadati.");
};
