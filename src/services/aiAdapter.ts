import { AISettings, GroqModel, PageVerification, PDFMetadata } from "../types";
import { verifyTranslationQualityWithGemini, extractPdfMetadataWithGemini } from "./geminiService";
import { verifyTranslationQualityWithOpenAI, extractPdfMetadataWithOpenAI } from "./openaiService";
import { verifyTranslationQualityWithClaude, extractPdfMetadataWithClaude } from "./claudeService";
import { verifyTranslationQualityWithGroq, extractPdfMetadataWithGroq } from "./groqService";
import { verifyTranslationQualityWithModal, extractPdfMetadataWithModal } from "./modalService";
import { verifyTranslationQualityWithZai, extractPdfMetadataWithZai } from "./zaiService";
import { verifyTranslationQualityWithOpenRouter, extractPdfMetadataWithOpenRouter } from "./openrouterService";
import { verifyWithCustomProvider, extractMetadataWithCustomProvider } from "./customProviderAdapter";
import { getSafeModel } from "./modelManager";
import { GEMINI_VERIFIER_MODEL } from "../constants";

export const verifyQualityAdapter = async (params: {
  settings: AISettings;
  translatedText: string;
  imageBase64: string;
  pageNumber: number;
  prevPageImageBase64?: string;
  prevPageNumber?: number;
  nextPageImageBase64?: string;
  nextPageNumber?: number;
  signal?: AbortSignal;
  sourceLanguage?: string;
}): Promise<PageVerification> => {
  const { settings, ...rest } = params;
  const verifierProvider = settings.qualityCheck?.verifierProvider || settings.provider;

  if (verifierProvider === "gemini") {
    const rawModel: string = settings.qualityCheck?.verifierModel || GEMINI_VERIFIER_MODEL;
    const model = getSafeModel(rawModel, 'gemini', settings);
    const report = await verifyTranslationQualityWithGemini({
      ...rest,
      apiKey: settings.gemini.apiKey,
      verifierModel: model,
      legalContext: settings.legalContext ?? true,
      sourceLanguage: rest.sourceLanguage,
      thinkingLevel: settings.gemini.thinkingLevel,
      customPrompt: settings.customVerificationPrompt,
    });
    return { ...report, state: "verified", timestamp: Date.now() } as PageVerification;
  }

  if (verifierProvider === "openai") {
    const rawModel: string = settings.qualityCheck?.verifierModel || settings.openai.model;
    const model = getSafeModel(rawModel, 'openai', settings);
    const report = await verifyTranslationQualityWithOpenAI({
      ...rest,
      apiKey: settings.openai.apiKey,
      verifierModel: model,
      legalContext: settings.legalContext ?? true,
      sourceLanguage: rest.sourceLanguage,
      customPrompt: settings.customVerificationPrompt,
    });
    return { ...report, state: "verified", timestamp: Date.now() } as PageVerification;
  }

  if (verifierProvider === "groq") {
    const rawModel: string = settings.qualityCheck?.verifierModel || settings.groq?.model || 'llama-3.3-70b-versatile';
    const report = await verifyTranslationQualityWithGroq({
      ...rest,
      apiKey: settings.groq?.apiKey || '',
      verifierModel: rawModel as GroqModel,
      legalContext: settings.legalContext ?? true,
      sourceLanguage: rest.sourceLanguage,
      customPrompt: settings.customVerificationPrompt,
    });
    return { ...report, state: "verified", timestamp: Date.now() } as PageVerification;
  }

  if (verifierProvider === "openrouter") {
    const rawModel: string = settings.qualityCheck?.verifierModel || settings.openrouter?.model || 'anthropic/claude-sonnet-4.5';
    const report = await verifyTranslationQualityWithOpenRouter({
      ...rest,
      apiKey: settings.openrouter?.apiKey || '',
      verifierModel: rawModel,
      legalContext: settings.legalContext ?? true,
      sourceLanguage: rest.sourceLanguage,
      customPrompt: settings.customVerificationPrompt,
    });
    return { ...report, state: "verified", timestamp: Date.now() } as PageVerification;
  }

  if (verifierProvider === "modal") {
    const report = await verifyTranslationQualityWithModal({
      apiKey: settings.modal.apiKey,
      pageNumber: rest.pageNumber,
      imageBase64: rest.imageBase64,
      translatedText: rest.translatedText,
      prevPageImageBase64: rest.prevPageImageBase64,
      prevPageNumber: rest.prevPageNumber,
      nextPageImageBase64: rest.nextPageImageBase64,
      nextPageNumber: rest.nextPageNumber,
      signal: rest.signal,
      legalContext: settings.legalContext ?? true,
      sourceLanguage: rest.sourceLanguage,
      customPrompt: settings.customVerificationPrompt,
    });
    return { ...report, state: "verified", timestamp: Date.now() } as PageVerification;
  }

  if (verifierProvider === "zai") {
    const report = await verifyTranslationQualityWithZai({
      apiKey: settings.zai.apiKey,
      verifierModel: settings.zai.model || 'glm-4v-plus',
      pageNumber: rest.pageNumber,
      imageBase64: rest.imageBase64,
      translatedText: rest.translatedText,
      prevPageImageBase64: rest.prevPageImageBase64,
      prevPageNumber: rest.prevPageNumber,
      nextPageImageBase64: rest.nextPageImageBase64,
      nextPageNumber: rest.nextPageNumber,
      signal: rest.signal,
      legalContext: settings.legalContext ?? true,
      sourceLanguage: rest.sourceLanguage,
      customPrompt: settings.customVerificationPrompt,
    });
    return { ...report, state: "verified", timestamp: Date.now() } as PageVerification;
  }

  if (verifierProvider === "custom") {
    const activeProvider = settings.customProviders?.find(cp => cp.id === settings.activeCustomProviderId);
    if (!activeProvider) throw new Error("Nessun provider custom attivo per la verifica.");
    const report = await verifyWithCustomProvider(activeProvider, {
      pageNumber: rest.pageNumber,
      imageBase64: rest.imageBase64,
      translatedText: rest.translatedText,
      prevPageImageBase64: rest.prevPageImageBase64,
      prevPageNumber: rest.prevPageNumber,
      nextPageImageBase64: rest.nextPageImageBase64,
      nextPageNumber: rest.nextPageNumber,
      signal: rest.signal,
      legalContext: settings.legalContext ?? true,
      sourceLanguage: rest.sourceLanguage,
      customPrompt: settings.customVerificationPrompt,
    });
    return { ...report, state: "verified", timestamp: Date.now() } as PageVerification;
  }

  // Claude (default fallback)
  const rawModel: string = settings.qualityCheck?.verifierModel || settings.claude.model;
  const model = getSafeModel(rawModel, 'claude', settings);
  const report = await verifyTranslationQualityWithClaude({
    ...rest,
    apiKey: settings.claude.apiKey,
    verifierModel: model,
    legalContext: settings.legalContext ?? true,
    sourceLanguage: rest.sourceLanguage,
    customPrompt: settings.customVerificationPrompt,
  });
  return { ...report, state: "verified", timestamp: Date.now() } as PageVerification;
};

export const extractMetadataAdapter = async (
  base64Images: string[],
  settings: AISettings,
  options?: { signal?: AbortSignal, targetLanguage?: string }
): Promise<PDFMetadata> => {
  const metaProvider = settings.metadataExtraction?.provider || settings.provider;
  const metaModel = settings.metadataExtraction?.model || (
    metaProvider === 'gemini' ? 'gemini-3.1-flash-lite-preview' :
    metaProvider === 'openai' ? 'gpt-4o-mini' :
    metaProvider === 'groq' ? 'llama-3.1-8b-instant' :
    metaProvider === 'openrouter' ? 'anthropic/claude-haiku-4.5' :
    metaProvider === 'modal' ? 'zai-org/GLM-5.1-FP8' :
    metaProvider === 'zai' ? 'glm-4v-flash' :
    settings.claude.model
  );

  if (metaProvider === "gemini") {
    const meta = await extractPdfMetadataWithGemini(
      settings.gemini.apiKey, metaModel, base64Images, options?.signal, options?.targetLanguage, settings.customMetadataPrompt
    );
    return { ...meta, name: meta.title || "Progetto Senza Nome", size: 0, totalPages: 0 } as PDFMetadata;
  }

  if (metaProvider === "openai") {
    const meta = await extractPdfMetadataWithOpenAI(
      settings.openai.apiKey, metaModel, base64Images, options?.signal, options?.targetLanguage, settings.customMetadataPrompt
    );
    return { ...meta, name: meta.title || "Progetto Senza Nome", size: 0, totalPages: 0 } as PDFMetadata;
  }

  if (metaProvider === "groq") {
    const meta = await extractPdfMetadataWithGroq(
      settings.groq.apiKey, metaModel as GroqModel, base64Images, options?.signal, options?.targetLanguage, settings.customMetadataPrompt
    );
    return { ...meta, name: meta.title || "Progetto Senza Nome", size: 0, totalPages: 0 } as PDFMetadata;
  }

  if (metaProvider === "openrouter") {
    const meta = await extractPdfMetadataWithOpenRouter(
      settings.openrouter.apiKey, metaModel, base64Images, options?.signal, options?.targetLanguage, settings.customMetadataPrompt
    );
    return { ...meta, name: meta.title || "Progetto Senza Nome", size: 0, totalPages: 0 } as PDFMetadata;
  }

  if (metaProvider === "modal") {
    const meta = await extractPdfMetadataWithModal(
      settings.modal.apiKey, base64Images, options?.signal, options?.targetLanguage, settings.customMetadataPrompt
    );
    return { ...meta, name: meta.title || "Progetto Senza Nome", size: 0, totalPages: 0 } as PDFMetadata;
  }

  if (metaProvider === "zai") {
    const meta = await extractPdfMetadataWithZai(
      settings.zai.apiKey, 'glm-4v-flash', base64Images, options?.signal, options?.targetLanguage, settings.customMetadataPrompt
    );
    return { ...meta, name: meta.title || "Progetto Senza Nome", size: 0, totalPages: 0 } as PDFMetadata;
  }

  if (metaProvider === "custom") {
    const activeProvider = settings.customProviders?.find(cp => cp.id === settings.activeCustomProviderId);
    if (!activeProvider) throw new Error("Nessun provider custom attivo per l'estrazione metadati.");
    const meta = await extractMetadataWithCustomProvider(
      activeProvider, base64Images, options?.signal, options?.targetLanguage, settings.customMetadataPrompt
    );
    return { ...meta, name: meta.title || "Progetto Senza Nome", size: 0, totalPages: 0 } as PDFMetadata;
  }

  // Claude (default fallback)
  const meta = await extractPdfMetadataWithClaude(
    settings.claude.apiKey, metaModel, base64Images, options?.signal, options?.targetLanguage, settings.customMetadataPrompt
  );
  return { ...meta, name: meta.title || "Progetto Senza Nome", size: 0, totalPages: 0 } as PDFMetadata;
};
