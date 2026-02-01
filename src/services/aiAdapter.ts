import { AISettings, GeminiModel, OpenAIModel, PageVerification, PDFMetadata } from "../types";
import { verifyTranslationQualityWithGemini, extractPdfMetadata as extractWithGemini } from "./geminiService";
import { verifyTranslationQualityWithOpenAI, extractPdfMetadataWithOpenAI } from "./openaiService";

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
}): Promise<PageVerification> => {
  const { settings, ...rest } = params;
  if (settings.provider === "gemini") {
    const model: GeminiModel = settings.qualityCheck?.verifierModel || settings.gemini.model;
    const report = await verifyTranslationQualityWithGemini({
      ...rest,
      apiKey: settings.gemini.apiKey,
      verifierModel: model,
      legalContext: settings.legalContext ?? true,
    });
    return {
      ...report,
      state: "verified",
      timestamp: Date.now(),
    } as PageVerification;
  } else {
    const model: OpenAIModel = settings.openai.model;
    const report = await verifyTranslationQualityWithOpenAI({
      ...rest,
      apiKey: settings.openai.apiKey,
      verifierModel: model,
      legalContext: settings.legalContext ?? true,
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
  options?: { signal?: AbortSignal }
): Promise<PDFMetadata> => {
  if (settings.provider === "gemini") {
    const meta = await extractWithGemini(
      settings.gemini.apiKey,
      settings.gemini.model,
      base64Images,
      options?.signal
    );
    return {
      ...meta,
      name: "",
      size: 0,
      totalPages: 0,
    } as PDFMetadata;
  } else {
    const meta = await extractPdfMetadataWithOpenAI(
      settings.openai.apiKey,
      settings.openai.model,
      base64Images,
      options?.signal
    );
    return {
      ...meta,
      name: "",
      size: 0,
      totalPages: 0,
    } as PDFMetadata;
  }
};
