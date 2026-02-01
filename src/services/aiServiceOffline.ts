import { AISettings, TranslationResult } from "../types";
import { log } from "./logger";

export const ensureGeminiReady = async (): Promise<boolean> => {
  return false;
};

export const ensureOpenAIReady = async (): Promise<boolean> => {
  return false;
};

export const translatePage = async (
  _settings: AISettings,
  config: { pageNumber: number }
): Promise<TranslationResult> => {
  const msg = `Traduzione disabilitata in modalità Offline (Pagina ${config.pageNumber}).`;
  log.error(msg);
  throw new Error("La traduzione non è disponibile in modalità offline. Questa versione è solo per consultazione.");
};

export const __resetAiReadinessCache = () => {};
