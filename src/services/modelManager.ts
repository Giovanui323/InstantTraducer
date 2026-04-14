import { AIProvider, AISettings, CustomModel, GeminiModel, ClaudeModel, OpenAIModel, GroqModel } from '../types';
import { GEMINI_MODELS_LIST, CLAUDE_MODELS_LIST, OPENAI_MODELS_LIST, GROQ_MODELS_LIST, MODAL_MODELS_LIST, ZAI_MODELS_LIST, OPENROUTER_MODELS_LIST } from '../constants';
import { log } from './logger';

export interface MergedModelInfo {
  id: string;
  name: string;
  provider: AIProvider;
  category?: 'flash' | 'pro' | 'standard' | 'mini';
  pricing?: { input: string | number; output: string | number };
  features?: string;
  isCustom: boolean;
}

/**
 * Raggruppa i modelli di default (Gemini, Claude, OpenAI) e quelli custom impostati dall'utente
 */
export const getAvailableModels = (provider: AIProvider, settings?: AISettings): MergedModelInfo[] => {
  const merged: MergedModelInfo[] = [];

  // 1. Aggiungi i modelli custom dell'utente per questo provider
  if (settings?.customModels && Array.isArray(settings.customModels)) {
    const customForProvider = settings.customModels.filter(m => m.provider === provider);
    merged.push(...customForProvider.map(m => ({
      ...m,
      pricing: m.pricing ? { input: m.pricing.input, output: m.pricing.output } : undefined
    })));
  }

  // 2. Aggiungi i modelli standard
  if (provider === 'gemini') {
    merged.push(...GEMINI_MODELS_LIST.map(m => ({ ...m, provider: 'gemini' as AIProvider, isCustom: false })));
  } else if (provider === 'claude') {
    merged.push(...CLAUDE_MODELS_LIST.map(m => ({ ...m, provider: 'claude' as AIProvider, isCustom: false })));
  } else if (provider === 'openai') {
    merged.push(...OPENAI_MODELS_LIST.map(m => ({ ...m, provider: 'openai' as AIProvider, isCustom: false })));
  } else if (provider === 'groq') {
    merged.push(...GROQ_MODELS_LIST.map(m => ({ ...m, provider: 'groq' as AIProvider, isCustom: false })));
  } else if (provider === 'modal') {
    merged.push(...MODAL_MODELS_LIST.map(m => ({ ...m, provider: 'modal' as AIProvider, isCustom: false })));
  } else if (provider === 'zai') {
    merged.push(...ZAI_MODELS_LIST.map(m => ({ ...m, provider: 'zai' as AIProvider, isCustom: false })));
  } else if (provider === 'openrouter') {
    merged.push(...OPENROUTER_MODELS_LIST.map(m => ({ ...m, provider: 'openrouter' as AIProvider, isCustom: false })));
  }

  // Deduplica eventuali conflitti (il custom sovrascrive lo standard)
  const uniqueMap = new Map<string, MergedModelInfo>();
  merged.forEach(m => {
    if (!uniqueMap.has(m.id)) {
      uniqueMap.set(m.id, m);
    }
  });

  return Array.from(uniqueMap.values());
};

/**
 * Safe Fallback Logic: Verifica se un modello esiste e, se è stato deprecato/cancellato
 * intercetta e restituisce un modello stabile standard. Questo previene che un modello inesistente 
 * causi blocchi 404 bloccando le code di traduzione.
 */
export const getSafeModel = (requestedId: string, provider: AIProvider, settings?: AISettings): string => {
  const available = getAvailableModels(provider, settings);
  const exists = available.find(m => m.id === requestedId);

  if (exists) {
    return requestedId;
  }

  // Se non esiste, triggera le regole di fallback esplicite
  log.warning(`[ModelManager] Il modello '${requestedId}' non esiste oppure è deprecato. Applico fallback sicuro.`);
  
  if (provider === 'gemini') {
    if (requestedId.includes('3.1-pro') || requestedId.includes('3-pro')) return 'gemini-3.1-pro-preview';
    if (requestedId.includes('3.1-flash') || requestedId.includes('3-flash')) return 'gemini-3.1-flash-preview';
    if (requestedId.includes('pro-exp') || requestedId.includes('pro')) return 'gemini-2.5-pro';
    if (requestedId.includes('flash-lite')) return 'gemini-2.5-flash-lite';
    return 'gemini-2.5-flash'; // Fallback universale assoluto
  } else if (provider === 'claude') {
    if (requestedId.includes('haiku')) return 'claude-haiku-4-5-20251001';
    if (requestedId.includes('opus')) return 'claude-opus-4-6';
    return 'claude-sonnet-4-6'; // Fallback per sonnet o vecchi modelli
  } else if (provider === 'openai') {
    if (requestedId.includes('o3') || requestedId.includes('o1-mini')) return 'o3-mini';
    if (requestedId.includes('o1')) return 'o1-preview';
    if (requestedId.includes('mini')) return 'gpt-4o-mini';
    return 'gpt-4o';
  } else if (provider === 'groq') {
    if (requestedId.includes('scout') || requestedId.includes('vision')) return 'meta-llama/llama-4-scout-17b-16e-instruct';
    if (requestedId.includes('70b')) return 'llama-3.3-70b-versatile';
    return 'llama-3.1-8b-instant';
  } else if (provider === 'modal') {
    return 'zai-org/GLM-5.1-FP8';
  } else if (provider === 'zai') {
    if (requestedId.includes('4v-plus') || requestedId.includes('vision')) return 'glm-4v-plus';
    if (requestedId.includes('flash')) return 'glm-4-flash';
    if (requestedId.includes('air')) return 'glm-4-air';
    return 'glm-4-plus';
  } else if (provider === 'openrouter') {
    if (requestedId.includes('opus')) {
      return requestedId.includes('fast') ? 'anthropic/claude-opus-4.6-fast' : 'anthropic/claude-opus-4.6';
    }
    if (requestedId.includes('sonnet')) return 'anthropic/claude-sonnet-4.5';
    if (requestedId.includes('haiku')) return 'anthropic/claude-haiku-4.5';
    if (requestedId.includes('flash-lite') || requestedId.includes('flash_lite')) return 'google/gemini-3.1-flash-lite-preview';
    if (requestedId.includes('qwen')) return 'qwen/qwen3.6-plus';
    if (requestedId.includes('grok')) return 'x-ai/grok-4.20-multi-agent';
    if (requestedId.includes('glm-5-turbo') || requestedId.includes('glm-5.1-turbo') || requestedId.includes('glm-5v-turbo')) return 'z-ai/glm-5v-turbo';
    if (requestedId.includes('glm')) return 'z-ai/glm-5.1';
    if (requestedId.includes('mimo')) return 'xiaomi/mimo-v2-flash';
    if (requestedId.includes('elephant')) return 'openrouter/elephant-alpha';
    return 'anthropic/claude-sonnet-4.5';
  }

  return requestedId; // Fallback estremo se nulla matcha (rischia l'errore api, ma noi preverremo prima)
};
