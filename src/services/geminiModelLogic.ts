
import { GeminiModel } from "../types";
import {
  GEMINI_TRANSLATION_MODEL,
  GEMINI_TRANSLATION_FAST_MODEL,
  GEMINI_TRANSLATION_FALLBACK_MODEL,
  GEMINI_TRANSLATION_FLASH_MODEL,
  GEMINI_VERIFIER_MODEL,
  GEMINI_VERIFIER_PRO_MODEL,
  GEMINI_VERIFIER_FALLBACK_MODEL
} from "../constants";

/**
 * Logica di fallback per la traduzione.
 * Gestisce la catena di retry passando a modelli progressivamente più leggeri o stabili.
 */
export const getNextFallbackModel = (currentModel: string): GeminiModel => {
  switch (currentModel) {
    // Pro Chain
    case 'gemini-3.1-pro-preview': return 'gemini-3.1-flash-preview';
    case 'gemini-3.1-flash-preview': return 'gemini-3-flash-preview';
    case 'gemini-3-flash-preview': return 'gemini-2.5-flash';
    case 'gemini-2.5-pro': return 'gemini-3.1-pro-preview';

    // Flash Chain
    case 'gemini-3.1-flash-lite-preview': return 'gemini-2.5-flash';
    case 'gemini-2.5-flash': return 'gemini-2.5-flash-lite';
    case 'gemini-2.5-flash-lite': return 'gemini-2.5-flash-lite';

    // Legacy/Other
    case 'gemini-2.0-flash': return 'gemini-2.5-flash';
    case 'gemini-1.5-pro': return 'gemini-2.5-pro';
    case 'gemini-2.0-pro-exp-02-05': return 'gemini-2.5-pro';
    case 'gemini-2.0-flash-lite-preview-02-05': return 'gemini-2.5-flash';
    case 'gemini-2.0-flash-thinking-exp-01-21': return 'gemini-2.5-flash';

    // Default safety net
    default: return GEMINI_TRANSLATION_FALLBACK_MODEL;
  }
};

/**
 * Logica di fallback per la verifica.
 */
export const getNextVerifierFallbackModel = (currentModel: string): GeminiModel => {
  switch (currentModel) {
    case 'gemini-3.1-pro-preview': return 'gemini-3.1-flash-preview';
    case 'gemini-3.1-flash-preview': return 'gemini-3-flash-preview';
    case 'gemini-3-flash-preview': return 'gemini-2.5-flash';
    case 'gemini-2.5-pro': return 'gemini-2.5-flash';
    case 'gemini-2.5-flash': return 'gemini-2.5-flash-lite';
    default: return GEMINI_VERIFIER_FALLBACK_MODEL;
  }
};
