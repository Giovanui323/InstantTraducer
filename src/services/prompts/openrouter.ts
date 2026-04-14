/**
 * openrouter.ts
 *
 * OpenRouter usa lo stesso formato OpenAI chat completions di Groq.
 * Re-export dei prompt Groq che sono compatibili al formato.
 * Tutti i modelli popolari su OpenRouter supportano vision di default.
 */
export {
  GROQ_TRANSLATION_PROMPT_TEMPLATE as OPENROUTER_TRANSLATION_PROMPT_TEMPLATE,
  getGroqTranslateSystemPrompt as getOpenRouterTranslateSystemPrompt,
  getGroqTranslateUserInstruction as getOpenRouterTranslateUserInstruction,
} from './groq';
