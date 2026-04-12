import { AISettings, GeminiModel, OpenAIModel, ClaudeModel, GroqModel, PageVerification, PDFMetadata } from "../types";
import { verifyTranslationQualityWithGemini, extractPdfMetadataWithGemini } from "./geminiService";
import { verifyTranslationQualityWithOpenAI, extractPdfMetadataWithOpenAI } from "./openaiService";
import { verifyTranslationQualityWithClaude, extractPdfMetadataWithClaude } from "./claudeService";
import { verifyTranslationQualityWithGroq, extractPdfMetadataWithGroq } from "./groqService";
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
    // Default to Flash for verification if not specified (Efficiency)
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
    return {
      ...report,
      state: "verified",
      timestamp: Date.now(),
    } as PageVerification;
  } else if (verifierProvider === "openai") {
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
    return {
      ...report,
      state: "verified",
      timestamp: Date.now(),
    } as PageVerification;
  } else if (verifierProvider === "groq") {
    const rawModel: string = settings.qualityCheck?.verifierModel || settings.groq?.model || 'llama-3.3-70b-versatile';
    const report = await verifyTranslationQualityWithGroq({
      ...rest,
      apiKey: settings.groq?.apiKey || '',
      verifierModel: rawModel as GroqModel,
      legalContext: settings.legalContext ?? true,
      sourceLanguage: rest.sourceLanguage,
      customPrompt: settings.customVerificationPrompt,
    });
    return {
      ...report,
      state: "verified",
      timestamp: Date.now(),
    } as PageVerification;
  } else {
    // Claude
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
    return {
      ...report,
      state: "verified",
      timestamp: Date.now(),
    } as PageVerification;
  }
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
    settings.claude.model
  );

  if (metaProvider === "gemini") {
    const meta = await extractPdfMetadataWithGemini(
      settings.gemini.apiKey,
      metaModel,
      base64Images,
      options?.signal,
      options?.targetLanguage,
      settings.customMetadataPrompt
    );
    return {
      ...meta,
      name: meta.title || "Progetto Senza Nome",
      size: 0,
      totalPages: 0,
    } as PDFMetadata;
  } else if (metaProvider === "openai") {
    const meta = await extractPdfMetadataWithOpenAI(
      settings.openai.apiKey,
      metaModel,
      base64Images,
      options?.signal,
      options?.targetLanguage,
      settings.customMetadataPrompt
    );
    return {
      ...meta,
      name: meta.title || "Progetto Senza Nome",
      size: 0,
      totalPages: 0,
    } as PDFMetadata;
  } else if (metaProvider === "groq") {
    const meta = await extractPdfMetadataWithGroq(
      settings.groq.apiKey,
      metaModel as GroqModel,
      base64Images,
      options?.signal,
      options?.targetLanguage,
      settings.customMetadataPrompt
    );
    return {
      ...meta,
      name: meta.title || "Progetto Senza Nome",
      size: 0,
      totalPages: 0,
    } as PDFMetadata;
  } else {
    // Claude/Other
    const meta = await extractPdfMetadataWithClaude(
      settings.claude.apiKey,
      metaModel,
      base64Images,
      options?.signal,
      options?.targetLanguage,
      settings.customMetadataPrompt
    );
    return {
      ...meta,
      name: meta.title || "Progetto Senza Nome",
      size: 0,
      totalPages: 0,
    } as PDFMetadata;
  }
};
