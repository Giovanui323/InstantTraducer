import { translateWithGemini, testGeminiConnection } from "./geminiService";
import { translateWithOpenAI, testOpenAIConnection } from "./openaiService";
import { verifyQualityAdapter, extractMetadataAdapter } from "./aiAdapter";
import { AISettings, GeminiModel, TranslationResult, OpenAIModel, PageVerification, PDFMetadata } from "../types";
import { log } from "./logger";
import { GEMINI_TRANSLATION_MODEL, GEMINI_VERIFIER_MODEL } from "../constants";

const readinessByProviderModel: Record<string, { checkedAt: number; valid: boolean }> = {};
const CHECK_TTL_MS = 5 * 60 * 1000;

type ProviderReadyResult = { ok: boolean; fromCache: boolean };

const ensureProviderReady = async (
  provider: 'gemini' | 'openai',
  settings: AISettings,
  modelOverride?: string
): Promise<ProviderReadyResult> => {
  if (settings.provider !== provider) return { ok: true, fromCache: true };
  
  const apiKey = provider === 'gemini' ? settings.gemini.apiKey?.trim() : settings.openai.apiKey?.trim();
  const model = modelOverride ?? (provider === 'gemini' ? settings.gemini.model : settings.openai.model);
  
  if (!apiKey) return { ok: false, fromCache: false };
  
  const cacheKey = `${provider}:${model}`;
  const now = Date.now();
  const cache = readinessByProviderModel[cacheKey];
  
  if (cache?.valid && (now - cache.checkedAt) < CHECK_TTL_MS) {
    return { ok: true, fromCache: true };
  }
  
  try {
    const ok = provider === 'gemini' 
      ? await testGeminiConnection(apiKey, model as any)
      : await testOpenAIConnection(apiKey, model as any);
      
    readinessByProviderModel[cacheKey] = { valid: ok, checkedAt: Date.now() };
    return { ok, fromCache: false };
  } catch (e) {
    readinessByProviderModel[cacheKey] = { valid: false, checkedAt: Date.now() };
    return { ok: false, fromCache: false };
  }
};

export const ensureGeminiReady = (settings: AISettings, modelOverride?: GeminiModel) => 
  ensureProviderReady('gemini', settings, modelOverride);

export const ensureOpenAIReady = (settings: AISettings, modelOverride?: OpenAIModel) => 
  ensureProviderReady('openai', settings, modelOverride);

export const __resetAiReadinessCache = () => {
  for (const k of Object.keys(readinessByProviderModel)) delete readinessByProviderModel[k];
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
    translationModelOverride?: GeminiModel
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
    const model = GEMINI_TRANSLATION_MODEL;
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
      settings.legalContext ?? true
    );
    log.success(`Completata traduzione pagina ${config.pageNumber} con Gemini`, { elapsedMs: Math.round(performance.now() - startedAt), chars: res?.text?.length || 0, model });
    return res;
  }

  if (settings.provider === 'openai') {
    const model = settings.openai.model;
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
      settings.legalContext ?? true
    );
    log.success(`Completata traduzione pagina ${config.pageNumber} con OpenAI`, { elapsedMs: Math.round(performance.now() - startedAt), chars: res?.text?.length || 0, model: settings.openai.model });
    return res;
  }

  throw new Error("Provider non supportato.");
};

/**
 * Verifica se la chiave API del provider selezionato è presente.
 */
export const checkApiConfiguration = (settings: AISettings): boolean => {
  const provider = settings.provider;
  const apiKey = provider === 'gemini' ? settings.gemini.apiKey : settings.openai.apiKey;
  return !!apiKey?.trim();
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
    signal?: AbortSignal
  }
): Promise<PageVerification | null> => {
  const { settings, ...rest } = params;
  const provider = settings.provider;
  
  if (provider === 'gemini') {
    const model = GEMINI_VERIFIER_MODEL;
    const ready = await ensureGeminiReady(settings, model);
    if (!ready.ok) throw new Error("Gemini non pronto per la verifica.");
    return await verifyQualityAdapter({ settings, ...rest });
  }

  if (provider === 'openai') {
    const model = settings.openai.model;
    const ready = await ensureOpenAIReady(settings, model);
    if (!ready.ok) throw new Error("OpenAI non pronto per la verifica.");
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
  const provider = settings.provider;
  
  if (provider === 'gemini') {
    const model = settings.gemini.model;
    const ready = await ensureGeminiReady(settings, model);
    if (!ready.ok) throw new Error("Gemini non pronto per l'estrazione metadati.");
    return await extractMetadataAdapter(base64Images, settings, options);
  }

  if (provider === 'openai') {
    const model = settings.openai.model;
    const ready = await ensureOpenAIReady(settings, model);
    if (!ready.ok) throw new Error("OpenAI non pronto per l'estrazione metadati.");
    return await extractMetadataAdapter(base64Images, settings, options);
  }

  throw new Error("Provider non supportato per l'estrazione metadati.");
};
