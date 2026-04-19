
import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from "@google/genai";
import { trackUsage } from "./usageTracker";
import { GeminiModel, PageAnnotation, TranslationResult, VerificationSeverity } from "../types";
import { log } from "./logger";
import { cleanTranslationText, stripPreamble } from "./textClean";
import { ensureBase64, detectImageMime } from "../utils/imageUtils";
import {
  looksLikeItalian
} from "./aiUtils";
import { retry, withTimeout } from "../utils/async";
import { safeParseJsonObject } from "../utils/json";
import {
  GEMINI_TRANSLATION_MODEL,
  GEMINI_TRANSLATION_FAST_MODEL,
  GEMINI_TRANSLATION_FALLBACK_MODEL,
  GEMINI_TRANSLATION_FLASH_MODEL,
  GEMINI_VERIFIER_MODEL,
  GEMINI_VERIFIER_FALLBACK_MODEL,
  GEMINI_COOLDOWN_MS,
  GEMINI_TIMEOUT_COOLDOWN_MS,
  AI_VERIFICATION_TIMEOUT_MS,
  GEMINI_FIRST_CHUNK_WARNING_MS,
  GEMINI_FIRST_CHUNK_TIMEOUT_MS
} from "../constants";
import { getNextFallbackModel, getNextVerifierFallbackModel } from "./geminiModelLogic";
import {
  resetGeminiCooldowns,
  isGlobalCooldownActive,
  isModelInCooldown,
  setModelCooldown,
  getCooldownStats,
  isModelInExtendedCooldown
} from "./geminiCooldown";
import { setGlobalCooldownUntil, getGlobalCooldownUntil } from "./geminiCooldown";

// Re-export for backwards compatibility
export { resetGeminiCooldowns, isGlobalCooldownActive, isModelInCooldown, setModelCooldown, getCooldownStats, isModelInExtendedCooldown };
import {
  getRetryDelay,
  recordRetryAttempt,
  resetRetryAttempts,
  __resetGeminiRetryStateForTests
} from "./geminiRetry";
import { __resetGeminiCooldownStateForTests } from "./geminiCooldown";
import { normalizeGeminiError } from "./geminiUtils";

export const __resetGeminiStateForTests = () => {
  resetGeminiCooldowns();
  __resetGeminiCooldownStateForTests();
  __resetGeminiRetryStateForTests();
};

import { getGeminiTranslateSystemPrompt, getGeminiTranslateUserInstruction, getGeminiVerifyQualitySystemPrompt } from './prompts/gemini';
import { getMetadataExtractionPrompt, buildRetryInstruction } from './prompts/shared';

const isQuotaError = (e: any): boolean => {
  const msg = String(e?.error?.message || e?.message || "").toLowerCase();
  const status = String(e?.status || e?.response?.status || e?.code || "");

  return (
    msg.includes("quota") ||
    msg.includes("limit exceeded") ||
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("exhausted") ||
    msg.includes("credit") ||
    // Handle 503/Service Unavailable/Overloaded
    msg.includes("503") ||
    msg.includes("service unavailable") ||
    msg.includes("overloaded") ||
    msg.includes("capacity") ||
    status.includes("503")
  );
};

const isHardLimitZero = (e: any): boolean => {
  const msg = String(e?.error?.message || e?.message || "").toLowerCase();
  return msg.includes("limit: 0") || msg.includes("limit:0");
};

const cleanOutput = (text: string): string => cleanTranslationText(text);

const DEFAULT_SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE }
];

let geminiInstance: { ai: GoogleGenAI; key: string } | null = null;

const getGeminiInstance = (apiKey: string): GoogleGenAI => {
  if (geminiInstance && geminiInstance.key === apiKey) {
    return geminiInstance.ai;
  }
  const ai = new GoogleGenAI({ apiKey });
  geminiInstance = { ai, key: apiKey };
  return ai;
};

export const translateWithGemini = async (
  imageBase64: string,
  pageNumber: number,
  sourceLanguage: string,
  previousContext: string,
  prevPageImageBase64: string | undefined,
  prevPageNumber: number | undefined,
  nextPageImageBase64: string | undefined,
  nextPageNumber: number | undefined,
  requestedModel: GeminiModel,
  apiKey: string,
  extraInstruction?: string,
  onProgress?: (text: string, partialText?: string) => void,
  signal?: AbortSignal,
  legalContext?: boolean,
  customPrompt?: string,
  skipPostProcessing?: boolean,
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high'
): Promise<TranslationResult> => {
  if (!apiKey) throw new Error("API Key mancante");

  // Controllo cooldown Globale
  if (isGlobalCooldownActive()) {
    const remainingS = Math.ceil((getGlobalCooldownUntil() - Date.now()) / 1000);
    throw new Error(`Cooldown Globale Gemini attivo. Riprova tra ${remainingS} secondi (Quota esaurita su tutti i modelli).`);
  }

  // Controllo cooldown per modelli Pro
  let model = requestedModel;

  // Map obsolete incorrect 3.1 flash name to the correct 3.0 flash name
  if (model === 'gemini-3.1-flash-preview') {
      model = 'gemini-3-flash-preview';
  } else if (model === 'gemini-3-pro-preview') {
      model = 'gemini-3.1-pro-preview';
  }

  // Logic to walk down the chain if in cooldown
  while (isModelInExtendedCooldown(model)) {
    const stats = getCooldownStats(model);
    const nextModel = getNextFallbackModel(model);

    // Se il prossimo modello è uguale al corrente (siamo a fine catena) e siamo ancora in cooldown
    if (nextModel === model) {
      // Se anche il modello Flash/Fallback finale è in cooldown, attiviamo/verifichiamo il cooldown globale
      if (!isGlobalCooldownActive()) {
        // Fallback di sicurezza: se siamo qui ma il global non è attivo, lo attiviamo ora per evitare loop
        log.warning(`Tutti i modelli inclusi ${model} sono in cooldown. Attivazione Cooldown Globale.`);
        setGlobalCooldownUntil(Date.now() + GEMINI_COOLDOWN_MS);
      }
      const remainingS = Math.ceil((getGlobalCooldownUntil() - Date.now()) / 1000);
      throw new Error(`Tutti i modelli Gemini sono occupati/quota esaurita. Riprova tra ${remainingS}s.`);
    }

    log.info(`[COOLDOWN] Modello ${model} in cooldown (attivo: ${stats.activationCount}).\n>>> AUTO-FALLBACK: ${model} -> ${nextModel}`, stats);
    if (onProgress) onProgress(`Modello ${model} in pausa (quota/timeout). Uso ${nextModel}...`);
    model = nextModel;
  }

  const startedAt = performance.now();
  const imageBytesApprox = Math.floor((imageBase64.length * 3) / 4);
  if (onProgress) onProgress(`Preparazione richiesta Gemini (${model}) - Immagine: ${Math.round(imageBytesApprox / 1024)}KB`);
  const ai = getGeminiInstance(apiKey);
  const safePreviousContext = looksLikeItalian(previousContext, sourceLanguage) ? previousContext : "";
  const requestStartedAt = performance.now();
  let firstChunkAt: number | null = null;
  let lastChunkAt = requestStartedAt;
  let heartbeatId: any = null;
  let streamingActive = false;
  const abortListener = () => {
    if (heartbeatId) {
      clearInterval(heartbeatId);
      heartbeatId = null;
    }
  };

  try {
    if (signal?.aborted) throw new Error("Richiesta annullata");
    if (signal) signal.addEventListener("abort", abortListener, { once: true });

    const contextInfo = [];
    if (prevPageNumber) contextInfo.push(`prec. p${prevPageNumber}`);
    if (nextPageNumber) contextInfo.push(`succ. p${nextPageNumber}`);
    const contextLabel = contextInfo.length > 0 ? ` (+contesto ${contextInfo.join(', ')})` : '';

    log.wait(`[GEMINI-TRANSLATION] Richiesta (${model}) per pagina ${pageNumber}${contextLabel}...`, {
      imageKB: Math.round(imageBytesApprox / 1024),
      prevContextChars: previousContext?.length || 0
    });

    if (onProgress) onProgress(`Invio richiesta AI...${contextLabel}`);

    if (onProgress) {
      heartbeatId = setInterval(() => {
        if (signal?.aborted) {
          if (heartbeatId) { clearInterval(heartbeatId); heartbeatId = null; }
          return;
        }
        const now = performance.now();
        const elapsedS = Math.round((now - requestStartedAt) / 1000);

        if (!streamingActive) {
          if (elapsedS > 5) {
            onProgress(`In attesa di connessione/risposta... (${elapsedS}s)`);
          }
          return;
        }

        if (firstChunkAt === null) {
          // Timeout critico: se dopo GEMINI_FIRST_CHUNK_TIMEOUT_MS non abbiamo il primo chunk, segnaliamo timeout
          const timeoutS = GEMINI_FIRST_CHUNK_TIMEOUT_MS / 1000;
          if (elapsedS >= timeoutS) {
            log.warning(`Timeout primo chunk Gemini (${timeoutS}s superati) per pagina ${pageNumber}.`);
            if (heartbeatId) { clearInterval(heartbeatId); heartbeatId = null; }
            onProgress(`Errore: Gemini non risponde dopo ${elapsedS}s. Riprovo...`);
          } else if (elapsedS > (timeoutS / 2)) {
            onProgress(`Richiesta complessa in corso... Gemini sta elaborando (attesa: ${elapsedS}s)`);
          } else {
            onProgress(`Connessione stabilita. In attesa del primo chunk... (${elapsedS}s)`);
          }
          return;
        }
        const idleS = Math.round((now - lastChunkAt) / 1000);
        if (idleS >= 15) {
          onProgress(`Ricezione in corso... nessun dato da ${idleS}s (totale: ${elapsedS}s)`);
        }
      }, 5_000);
    }

    const userInstruction = getGeminiTranslateUserInstruction(pageNumber, sourceLanguage);

    // CRITICAL FIX: isRetry must be true ONLY if we have actual corrective instructions.
    // This prevents the AI from entering "critical mode" for empty strings or spaces.
    const isRetry = Boolean(extraInstruction && extraInstruction.trim().length > 0);

    const criticalBlock = isRetry ? (
      `\n\n#############################################################\n` +
      `### ATTENZIONE: MODALITÀ RITRADUZIONE CORRETTIVA          ###\n` +
      `#############################################################\n` +
      `La precedente traduzione presentava errori critici (es. omissioni).\n` +
      `Segui TASSATIVAMENTE le seguenti istruzioni per correggere, ignorando qualsiasi istruzione contrastante:\n\n` +
      `${extraInstruction?.trim() ? extraInstruction.trim() : "Rileggi l'immagine con attenzione massima. TRADUCI TUTTO IN ITALIANO. Non lasciare testo in lingua originale."}\n\n` +
      `#############################################################`
    ) : "";

    // Gemini 3 docs: "Negative constraints should be placed at the end of the instruction"
    const effectiveInstruction = userInstruction + criticalBlock;

    const runAttempt = async (instruction: string, contextForPrompt: string) => {
      streamingActive = true;
      const mainMime = detectImageMime(imageBase64, "image/jpeg");
      const prevMime = detectImageMime(prevPageImageBase64 || "", "image/jpeg");
      const nextMime = detectImageMime(nextPageImageBase64 || "", "image/jpeg");
      const sanitizedMain = ensureBase64(imageBase64);
      const sanitizedPrev = prevPageImageBase64 ? ensureBase64(prevPageImageBase64) : undefined;
      const sanitizedNext = nextPageImageBase64 ? ensureBase64(nextPageImageBase64) : undefined;

      let response;
      try {
        response = await ai.models.generateContentStream({
          model: model,
          contents: [
            {
              role: 'user',
              parts: [
                ...(prevPageImageBase64 && prevPageNumber
                  ? [
                    { text: `CONTESTO: Pagina precedente ${prevPageNumber} (solo contesto, NON tradurre)` },
                    {
                      inlineData: { mimeType: prevMime, data: sanitizedPrev },
                      // @ts-ignore - Supporto Gemini 3 media_resolution
                      mediaResolution: { level: "MEDIA_RESOLUTION_MEDIUM" }
                    } as any
                  ]
                  : []),
                { text: `PAGINA DA TRADURRE: Pagina ${pageNumber}` },
                {
                  inlineData: { mimeType: mainMime, data: sanitizedMain },
                  // @ts-ignore - Supporto Gemini 3 media_resolution
                  mediaResolution: { level: "MEDIA_RESOLUTION_ULTRA_HIGH" }
                } as any,
                ...(nextPageImageBase64 && nextPageNumber
                  ? [
                    { text: `CONTESTO: Pagina successiva ${nextPageNumber} (solo contesto, NON tradurre)` },
                    {
                      inlineData: { mimeType: nextMime, data: sanitizedNext },
                      // @ts-ignore - Supporto Gemini 3 media_resolution
                      mediaResolution: { level: "MEDIA_RESOLUTION_MEDIUM" }
                    } as any
                  ]
                  : []),
                { text: instruction }
              ]
            }
          ],
          config: {
            systemInstruction: (() => {
              const isRetry = Boolean(extraInstruction && extraInstruction.trim().length > 0);
              const prompt = getGeminiTranslateSystemPrompt(sourceLanguage, contextForPrompt, legalContext ?? true, isRetry, customPrompt, model);

              if (onProgress) {
                const isDev = process.env.NODE_ENV === 'development';
                onProgress(`[DEBUG] SYSTEM PROMPT GEN (Retry=${isRetry}, ExtraLen=${extraInstruction?.length || 0})`);
                if (isRetry) {
                  const debugPrompt = isDev ? prompt : `[REDACTED PROMPT: ${prompt.length} chars]`;
                  const debugInstr = isDev ? effectiveInstruction : `[REDACTED INSTR: ${effectiveInstruction.length} chars]`;
                  onProgress(`[DEBUG] CRITICAL MODE ACTIVE.\n\nSYSTEM PROMPT:\n${debugPrompt}\n\nUSER INSTRUCTION:\n${debugInstr}`);
                }
              }
              return prompt;
            })(),
            safetySettings: DEFAULT_SAFETY_SETTINGS,
            temperature: 1.0,
            ...(model.includes("3.1-pro") ? {
              tools: [{ googleSearch: {} }] as any[]
            } : {}),
            // @ts-ignore - Supporto Gemini thinking_config
            ...(model.includes("thinking") || model.includes("3.1-pro") || model.includes("3-flash") || model.includes("3.1-flash") ? {
              thinkingConfig: {
                includeThoughts: true,
                // @ts-ignore
                thinkingLevel: thinkingLevel ? thinkingLevel.toUpperCase() : "HIGH"
              }
            } : {}) as any
          }
        });
      } catch (apiError: any) {
        // FALLBACK FOR THINKING CONFIG ERROR (400 Invalid Argument)
        const isThinkingRelated = (apiError.message?.includes("Thinking level") || apiError.message?.includes("thinkingConfig") || apiError.status === 400);

        if (isThinkingRelated && model.includes("thinking")) {
          console.warn("[Gemini] Thinking Config Rejected (400). Retrying without thinking config...");
          response = await ai.models.generateContentStream({
            model: model,
            contents: [
              {
                role: 'user',
                parts: [
                  ...(prevPageImageBase64 && prevPageNumber ? [{ text: `CONTESTO: Pagina precedente ${prevPageNumber} (solo contesto, NON tradurre)` }, { inlineData: { mimeType: prevMime, data: sanitizedPrev }, mediaResolution: { level: "MEDIA_RESOLUTION_MEDIUM" } } as any] : []),
                  { text: `PAGINA DA TRADURRE: Pagina ${pageNumber}` },
                  { inlineData: { mimeType: mainMime, data: sanitizedMain }, mediaResolution: { level: "MEDIA_RESOLUTION_ULTRA_HIGH" } } as any,
                  ...(nextPageImageBase64 && nextPageNumber ? [{ text: `CONTESTO: Pagina successiva ${nextPageNumber} (solo contesto, NON tradurre)` }, { inlineData: { mimeType: nextMime, data: sanitizedNext }, mediaResolution: { level: "MEDIA_RESOLUTION_MEDIUM" } } as any] : []),
                  { text: instruction }
                ]
              }
            ],
            config: {
              systemInstruction: getGeminiTranslateSystemPrompt(sourceLanguage, contextForPrompt, legalContext ?? true, Boolean(extraInstruction), customPrompt, model),
              safetySettings: DEFAULT_SAFETY_SETTINGS,
              temperature: 1.0,
              ...(model.includes("3.1-pro") ? {
                tools: [{ googleSearch: {} }] as any[]
              } : {})
              // EXPLICITLY OMIT THINKING CONFIG
            }
          });
        } else {
          throw apiError;
        }
      }

      let fullText = "";
      let lastProgressAt = 0;
      let lastNotifiedLength = 0;
      let chunkCount = 0;
      let emptyChunkCount = 0;
      let lastChunk: any = null;

      // Monitor per il primo chunk: se dopo il limite di warning non abbiamo nulla, logghiamo un avviso
      const firstChunkTimeout = setTimeout(() => {
        if (firstChunkAt === null && streamingActive) {
          log.warning(`Timeout iteratore streaming Gemini per pagina ${pageNumber} (${GEMINI_FIRST_CHUNK_WARNING_MS}ms superati)`);
        }
      }, GEMINI_FIRST_CHUNK_WARNING_MS);

      try {
        for await (const chunk of response) {
          try {
            if (signal?.aborted) throw new Error("Richiesta annullata");

            // Check aggiuntivo per timeout primo chunk all'interno del loop
            if (firstChunkAt === null) {
              const now = performance.now();
              if (now - requestStartedAt > GEMINI_FIRST_CHUNK_TIMEOUT_MS) {
                throw new Error(`Timeout: Gemini non ha inviato il primo chunk entro ${GEMINI_FIRST_CHUNK_TIMEOUT_MS / 1000} secondi.`);
              }
            }

            chunkCount += 1;
            lastChunkAt = performance.now();
            lastChunk = chunk;
            if (firstChunkAt === null) {
              firstChunkAt = lastChunkAt;
              if (onProgress) {
                const ttftMs = Math.round(firstChunkAt - requestStartedAt);
                const ttftS = Math.round((ttftMs / 1000) * 10) / 10;
                onProgress(`Prima risposta ricevuta dopo ${ttftS}s (${ttftMs}ms) [${model}]`);
              }
            }

            const chunkText = chunk.text;
            if (chunkText) {
              fullText += chunkText;

              // Salvaguardia contro runaway generation (max 40k caratteri per pagina)
              if (fullText.length > 40000) {
                log.warning(`Runaway generation rilevata (>40k caratteri) per pagina ${pageNumber}. Interruzione streaming.`);
                break;
              }

              const now = performance.now();
              const deltaChars = fullText.length - lastNotifiedLength;
              if (onProgress && (deltaChars >= 600 || now - lastProgressAt >= 900)) {
                lastProgressAt = now;
                lastNotifiedLength = fullText.length;
                onProgress(`Streaming in corso: ${fullText.length} caratteri ricevuti`, fullText);
              }
            } else {
              emptyChunkCount += 1;
            }
          } catch (e: any) {
            if (signal?.aborted || e?.message === "Richiesta annullata" || e?.message?.includes("Timeout")) throw e;
          }
        }
      } finally {
        clearTimeout(firstChunkTimeout);
      }

      streamingActive = false;
      if (onProgress) {
        if (skipPostProcessing) onProgress("Post-processing leggero (rimozione preambolo)...");
        else onProgress("Post-processing testo (pulizia meta-testi/OCR residuo)...");
      }
      const cleaned = skipPostProcessing ? stripPreamble(fullText || "") : cleanOutput(fullText || "");
      if (fullText.length !== cleaned.length) {
        log.info(`Post-processing${skipPostProcessing ? ' (Light)' : ''}: Testo pulito di ${fullText.length - cleaned.length} caratteri.`);
      }
      const text = cleaned;
      const elapsedMs = Math.round(performance.now() - startedAt);
      const finishReason = lastChunk?.candidates?.[0]?.finishReason;
      const promptFeedback = lastChunk?.promptFeedback;
      log.recv(`Ricevuta traduzione pagina ${pageNumber} (${text.length} caratteri).`, {
        elapsedMs,
        chunkCount,
        emptyChunkCount,
        rawChars: fullText.length,
        finishReason,
        promptFeedback
      });
      if (!text || text.trim().length === 0) {
        const safetyRatings = lastChunk?.candidates?.[0]?.safetyRatings;
        log.warning(`Gemini ha restituito testo vuoto (Pagina ${pageNumber}).`, { finishReason, promptFeedback, safetyRatings });
        throw new Error(
          `Risposta vuota da Gemini (finishReason=${finishReason || "N/D"}). Possibile blocco Safety/Recitation o budget insufficiente.`
        );
      }

      const usage = (lastChunk as any)?.usageMetadata;
      if (usage) {
          trackUsage(model, usage.promptTokenCount || 0, usage.candidatesTokenCount || 0);
      }

      return text;
    };

    const attempt1Text = await retry(
      () => runAttempt(effectiveInstruction, safePreviousContext),
      2,
      3000,
      (err, attempt) => {
        if (onProgress) onProgress(`Errore temporaneo (Gemini), tentativo ${attempt}/2 in corso...`);
        log.warning(`Ritento Gemini (attempt ${attempt}) causa errore transiente`, err);
      },
      (err) => {
        // NON riprovare se la richiesta è stata annullata manualmente o se è un Hard Limit
        const msg = String(err?.message || "");
        if (isHardLimitZero(err)) return false;
        return !msg.includes("Richiesta annullata") && !msg.includes("aborted");
      }
    );
    if (onProgress) onProgress(`Completato: ${attempt1Text.length} caratteri`);

    // Reset retry attempts on successful completion
    resetRetryAttempts(pageNumber);

    return { text: attempt1Text, annotations: [], modelUsed: model };
  } catch (error: any) {
    const isQuota = isQuotaError(error);
    const isTimeout = String(error?.message || "").includes("Timeout");
    const isAborted = error?.name === 'AbortError' || error?.code === 'ABORTED' || String(error?.message || "").includes("Richiesta annullata");
    const elapsedMs = Math.round(performance.now() - startedAt);

    if (isAborted) {
      // Just rethrow, no logging, no retry recording
      throw error;
    }

    // Check retry limits before proceeding
    const retryAttempts = recordRetryAttempt(pageNumber);
    if (retryAttempts >= 5) {
      log.error(`[RETRY] Maximum retry attempts reached for page ${pageNumber}. Giving up.`, {
        attempts: retryAttempts,
        errorType: isQuota ? 'QUOTA' : isTimeout ? 'TIMEOUT' : 'UNKNOWN',
        elapsedMs
      });
      throw new Error(`Translation failed after ${retryAttempts} attempts. Please try again later.`);
    }

    // Apply exponential backoff delay
    const retryDelay = getRetryDelay(pageNumber);
    if (retryDelay > 0 && !isQuota && !isTimeout) {
      log.info(`[RETRY] Applying exponential backoff: ${retryDelay}ms delay for page ${pageNumber}`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }

    // Enhanced error context capture
    const errorContext = {
      pageNumber,
      model,
      elapsedMs,
      retryAttempts,
      retryDelay,
      errorType: isQuota ? 'QUOTA' : isTimeout ? 'TIMEOUT' : 'UNKNOWN',
      errorMessage: error?.message || 'Unknown error',
      errorCode: error?.code || error?.status,
      errorStack: error?.stack,
      imageSize: Math.floor((imageBase64.length * 3) / 4),
      hasPreviousContext: Boolean(previousContext),
      hasPrevPage: Boolean(prevPageImageBase64),
      hasNextPage: Boolean(nextPageImageBase64),
      extraInstruction: extraInstruction ? 'PRESENT' : 'NONE',
      retryAttempt: extraInstruction && extraInstruction.trim().length > 0 ? 'YES' : 'NO'
    };

    // Se è un errore di quota o un timeout, attiviamo il cooldown e proviamo il fallback (se disponibile)
    const isHardLimit = isHardLimitZero(error);

    if (isQuota || isTimeout || isHardLimit) {
      if (isHardLimit) {
        setModelCooldown(model, 'hard_limit_zero', 24 * 60 * 60 * 1000); // 24h ban
      } else if (isQuota) {
        setModelCooldown(model, 'quota_exceeded', GEMINI_COOLDOWN_MS);
      }

      if (isTimeout) setModelCooldown(model, 'timeout_error', GEMINI_TIMEOUT_COOLDOWN_MS);

      const nextModel = getNextFallbackModel(model);

      // Se il prossimo modello è lo stesso (fine catena), non possiamo fare fallback ricorsivo qui.
      // Lasciamo che il loop di controllo all'inizio della prossima chiamata (o il throw finale) gestisca la situazione.
      // Tuttavia, per coerenza, se siamo a fine catena e abbiamo quota error, attiviamo subito il global.
      if (nextModel === model && (isQuota || isHardLimit)) {
        log.error(`[CRITICAL] Quota esaurita/Hard Limit sul modello finale ${model}. Attivo Cooldown Globale.`);
        setGlobalCooldownUntil(Date.now() + GEMINI_COOLDOWN_MS);
      }

      // Se c'è un modello diverso da provare, o se vogliamo riprovare lo stesso (ma verrà bloccato dal check iniziale se in cooldown)
      if (nextModel !== model) {
        log.warning(`[FALLBACK] Errore critico su ${model} (${isHardLimit ? 'HARD LIMIT' : (isQuota ? 'QUOTA' : 'TIMEOUT')}).\n>>> SWITCHING MODEL: ${model} -> ${nextModel}`, errorContext);
        if (onProgress) onProgress(`${isHardLimit ? 'Quota 0 (Hard Limit)' : (isQuota ? 'Quota esaurita/Errore Server' : 'Timeout')} per ${model}. Fallback su ${nextModel}...`);

        return translateWithGemini(
          imageBase64,
          pageNumber,
          sourceLanguage,
          previousContext,
          prevPageImageBase64,
          prevPageNumber,
          nextPageImageBase64,
          nextPageNumber,
          nextModel,
          apiKey,
          extraInstruction,
          onProgress,
          signal,
          legalContext,
          customPrompt,
          skipPostProcessing,
          thinkingLevel
        );
      }
    }

    const mapped = normalizeGeminiError(error);
    log.error(`Errore Critico Pagina ${pageNumber} [Model: ${model}]`, {
      ...errorContext,
      normalizedError: {
        name: mapped.name,
        message: mapped.message,
        code: (mapped as any).code,
        stack: mapped.stack
      }
    });
    throw mapped;
  } finally {
    if (signal) signal.removeEventListener("abort", abortListener);
    abortListener();
  }
};

export type TranslationQualityReport = {
  severity: VerificationSeverity;
  summary: string;
  evidence: string[];
  annotations: Array<Pick<PageAnnotation, 'originalText' | 'comment' | 'type'>>;
  retryHint?: string;
};

export const verifyTranslationQualityWithGemini = async (params: {
  apiKey: string;
  verifierModel: GeminiModel;
  pageNumber: number;
  imageBase64: string;
  translatedText: string;
  prevPageImageBase64?: string;
  prevPageNumber?: number;
  nextPageImageBase64?: string;
  nextPageNumber?: number;
  signal?: AbortSignal;
  legalContext?: boolean;
  sourceLanguage?: string;
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
  customPrompt?: string;
}): Promise<TranslationQualityReport> => {
  const {
    apiKey,
    verifierModel: requestedModel,
    pageNumber,
    imageBase64,
    translatedText,
    prevPageImageBase64,
    prevPageNumber,
    nextPageImageBase64,
    nextPageNumber,
    signal,
    legalContext = true,
    sourceLanguage = "Tedesco",
    thinkingLevel,
    customPrompt
  } = params;

  if (isGlobalCooldownActive()) {
    const remainingS = Math.ceil((getGlobalCooldownUntil() - Date.now()) / 1000);
    throw new Error(`Cooldown Globale Gemini attivo. Riprova tra ${remainingS} secondi.`);
  }

  let verifierModel = requestedModel;

  // Map obsolete incorrect 3.1 flash name to the correct 3.0 flash name
  if (verifierModel === 'gemini-3.1-flash-preview') {
      verifierModel = 'gemini-3-flash-preview';
  } else if (verifierModel === 'gemini-3-pro-preview') {
      verifierModel = 'gemini-3.1-pro-preview';
  }

  if (isModelInCooldown(verifierModel)) {
    // Se il modello richiesto è in cooldown, proviamo a scendere
    if (verifierModel === GEMINI_VERIFIER_FALLBACK_MODEL) {
      // Siamo già al fallback
      throw new Error("Modello Verifier Fallback in cooldown.");
    }
    log.info(`Modello verifier ${verifierModel} in cooldown. Utilizzo fallback: ${GEMINI_VERIFIER_FALLBACK_MODEL}`);
    verifierModel = GEMINI_VERIFIER_FALLBACK_MODEL;

    // Check double check
    if (isModelInCooldown(verifierModel)) {
      throw new Error("Tutti i modelli Verifier sono in cooldown.");
    }
  }

  if (!apiKey) throw new Error("API Key mancante");
  const ai = getGeminiInstance(apiKey);
  const sample = (translatedText || "").slice(0, 12000);
  const mime = detectImageMime(imageBase64, "image/jpeg");
  const sanitized = ensureBase64(imageBase64);

  const prevMime = prevPageImageBase64 ? detectImageMime(prevPageImageBase64, "image/jpeg") : undefined;
  const nextMime = nextPageImageBase64 ? detectImageMime(nextPageImageBase64, "image/jpeg") : undefined;
  const sanitizedPrev = prevPageImageBase64 ? ensureBase64(prevPageImageBase64) : undefined;
  const sanitizedNext = nextPageImageBase64 ? ensureBase64(nextPageImageBase64) : undefined;

  const systemInstruction = customPrompt && customPrompt.trim().length > 0 
    ? customPrompt 
    : getGeminiVerifyQualitySystemPrompt(legalContext, sourceLanguage, verifierModel);

  const userParts: any[] = [
    {
      text: `ISTRUZIONI: Analizza l'immagine della PAGINA PRINCIPALE (sorgente, in ${sourceLanguage}) e confrontala con il TESTO TRADOTTO (destinazione, in Italiano) fornito alla fine. Usa le immagini di CONTESTO solo come riferimento visivo.`
    }
  ];

  if (sanitizedPrev && prevPageNumber) {
    userParts.push({ text: `CONTESTO (NON TRADURRE - SOLO RIFERIMENTO): Pagina precedente ${prevPageNumber}` });
    userParts.push({
      inlineData: { mimeType: prevMime, data: sanitizedPrev },
      // @ts-ignore - Supporto Gemini 3 media_resolution
      mediaResolution: { level: "MEDIA_RESOLUTION_MEDIUM" }
    });
  }

  userParts.push({ text: `PAGINA PRINCIPALE (DA VERIFICARE): Pagina ${pageNumber}` });
  userParts.push({
    inlineData: { mimeType: mime, data: sanitized },
    // @ts-ignore - Supporto Gemini 3 media_resolution
    mediaResolution: { level: "MEDIA_RESOLUTION_ULTRA_HIGH" }
  });

  if (sanitizedNext && nextPageNumber) {
    userParts.push({ text: `CONTESTO (NON TRADURRE - SOLO RIFERIMENTO): Pagina successiva ${nextPageNumber}` });
    userParts.push({
      inlineData: { mimeType: nextMime, data: sanitizedNext },
      // @ts-ignore - Supporto Gemini 3 media_resolution
      mediaResolution: { level: "MEDIA_RESOLUTION_MEDIUM" }
    });
  }

  userParts.push({ text: `Ecco il TESTO TRADOTTO DA VERIFICARE (in Italiano):\n"""\n${sample}\n"""\n\nVerifica la corrispondenza con l'immagine "PAGINA PRINCIPALE".` });

  let result;
  // Handshake & Stalled Detection
  const STALLED_TIMEOUT_MS = 30000;
  const stalledTimer = setTimeout(() => {
    log.warning(`[GEMINI-STALLED] QUALITY_CHECK_STALLED: Nessuna risposta da ${STALLED_TIMEOUT_MS / 1000}s per pagina ${pageNumber}`);
  }, STALLED_TIMEOUT_MS);

  log.info(`[GEMINI-VERIFICATION-HANDSHAKE] Invio richiesta verifica (${verifierModel}) per pagina ${pageNumber}...`);

  try {
    const contents: any[] = [
      {
        role: "user",
        parts: userParts
      }
    ];

    if (signal?.aborted) throw new Error("Operazione annullata");

    result = await withTimeout(
      ai.models.generateContent({
        model: verifierModel,
        contents,
        config: {
          systemInstruction,
          safetySettings: DEFAULT_SAFETY_SETTINGS,
          temperature: 0,
          tools: [{ googleSearch: {} }],
          // @ts-ignore
          ...(verifierModel.includes("thinking") || verifierModel.includes("3.1-pro") || verifierModel.includes("3-flash") || verifierModel.includes("3.1-flash") ? { thinkingConfig: { thinkingLevel: thinkingLevel ? thinkingLevel.toUpperCase() : "HIGH" } } : {}) as any
        }
      }),
      AI_VERIFICATION_TIMEOUT_MS,
      () => log.warning(`[GEMINI-VERIFICATION] Timeout per pagina ${pageNumber} (${AI_VERIFICATION_TIMEOUT_MS}ms)`)
    );
    
    // Track usage
    if (result?.usageMetadata) {
      trackUsage(verifierModel, result.usageMetadata.promptTokenCount || 0, result.usageMetadata.candidatesTokenCount || 0);
    }
    
    log.info(`[GEMINI-VERIFICATION-HANDSHAKE] Risposta ricevuta per pagina ${pageNumber}.`);
  } catch (e: any) {
    if (e?.name === 'AbortError' || e?.code === 'ABORTED' || e?.message === "Operazione annullata") {
      throw e;
    }
    const isTimeout = String(e?.message || "").includes("Timeout");
    const isQuota = isQuotaError(e);

    const isHardLimit = isHardLimitZero(e);
    if (isQuota || isTimeout || isHardLimit) {
      const cooldownDuration = isHardLimit
        ? 24 * 60 * 60 * 1000
        : (isTimeout ? GEMINI_TIMEOUT_COOLDOWN_MS : GEMINI_COOLDOWN_MS);
      setModelCooldown(verifierModel, isHardLimit ? 'hard_limit_zero' : (isTimeout ? 'timeout_error' : 'quota_exceeded'), cooldownDuration);

      const nextVerifierModel = getNextVerifierFallbackModel(verifierModel);

      if (nextVerifierModel === verifierModel) {
        // Fine della catena
        if (isQuota || isHardLimit) {
          log.error(`[CRITICAL] Quota esaurita/Hard Limit su Verifier Fallback. Attivazione Cooldown Globale.`);
          setGlobalCooldownUntil(Date.now() + GEMINI_COOLDOWN_MS);
        }
        // Non facciamo nulla, lascerà il throw finale
      } else {
        log.warning(`${isHardLimit ? 'HARD LIMIT 0' : (isTimeout ? 'Timeout' : 'Quota/Errore Server')} per verifier ${verifierModel}. Passaggio a fallback: ${nextVerifierModel}...`);

        return verifyTranslationQualityWithGemini({
          ...params,
          verifierModel: nextVerifierModel
        });
      }
    }
    const mapped = normalizeGeminiError(e);
    log.error(`Verifica qualità fallita (Pagina ${pageNumber}) [Model: ${verifierModel}]`, mapped);
    throw mapped;
  } finally {
    clearTimeout(stalledTimer);
  }

  const parsed = safeParseJsonObject(result.text || "");
  const severity = (String(parsed?.severity || "").toLowerCase() as VerificationSeverity) || "minor";
  const summary = typeof parsed?.summary === "string" ? parsed.summary : "";
  const evidence = Array.isArray(parsed?.evidence) ? parsed.evidence.map((x: any) => String(x)) : [];
  const rawAnnotations = Array.isArray(parsed?.annotations) ? parsed.annotations : [];
  const annotations = rawAnnotations
    .map((a: any) => ({
      originalText: typeof a?.originalText === "string" ? a.originalText : "",
      comment: typeof a?.comment === "string" ? a.comment : "",
      type: (a?.type === "error" || a?.type === "suggestion" || a?.type === "doubt") ? a.type : "doubt"
    }))
    .filter((a: any) => a.originalText.trim() || a.comment.trim());
  const retryHint = typeof parsed?.retryHint === "string" && parsed.retryHint.trim().length > 0 ? parsed.retryHint.trim() : undefined;

  return {
    severity: (severity === "ok" || severity === "minor" || severity === "severe") ? severity : "minor",
    summary,
    evidence,
    annotations,
    retryHint
  };
};

export const testGeminiConnection = async (apiKey: string, model: GeminiModel, signal?: AbortSignal): Promise<{ success: boolean; message: string }> => {
  if (!apiKey) throw new Error("API Key mancante");
  const ai = getGeminiInstance(apiKey);

  try {
    log.info(`Test funzionalità Gemini (${model})...`);
    if (signal?.aborted) throw new Error("Operazione annullata");

    const result = await ai.models.generateContent({
      model: model,
      contents: [{
        role: "user",
        parts: [{ text: "Traduci 'Hello World' in Italiano. Rispondi SOLO con la traduzione." }]
      }],
      config: {
        safetySettings: DEFAULT_SAFETY_SETTINGS,
        temperature: 0,
        tools: [{ googleSearch: {} }],
        // @ts-ignore
        ...(model.includes("thinking") || model.includes("3.1-pro") ? { thinkingConfig: { thinkingLevel: "HIGH" } } : {}) as any
      }
    });

    const text = result.text;

    // Track usage for connection test
    if (result?.usageMetadata) {
      trackUsage(model, result.usageMetadata.promptTokenCount || 0, result.usageMetadata.candidatesTokenCount || 0);
    }

    if (text && text.trim().length > 0) {
      log.success(`Test riuscito: "${text.trim()}"`);
      return { success: true, message: `Connessione riuscita: "${text.trim()}"` };
    }
    return { success: false, message: "Risposta vuota o non valida dall'API." };
  } catch (error: any) {
    const isHardLimit = isHardLimitZero(error);
    if ((isQuotaError(error) || isHardLimit) && model === GEMINI_TRANSLATION_MODEL) {
      if (isHardLimit) setModelCooldown(model, 'hard_limit_zero', 24 * 60 * 60 * 1000);
      log.warning(`Quota esaurita per ${model} durante il test. Provo il modello di fallback ${GEMINI_TRANSLATION_FALLBACK_MODEL}...`);
      return testGeminiConnection(apiKey, GEMINI_TRANSLATION_FALLBACK_MODEL, signal);
    }
    const mapped = normalizeGeminiError(error);
    log.error("Test connessione fallito", mapped);
    return { success: false, message: mapped.message || "Errore sconosciuto durante il test." };
  }
};

export type PdfMetadataResult = {
  year?: string;
  author?: string;
  title?: string;
  originalFileName?: string;
};

export const extractPdfMetadataWithGemini = async (
  apiKey: string,
  model: GeminiModel,
  imagesBase64: string[],
  signal?: AbortSignal,
  targetLanguage?: string,
  customPrompt?: string
): Promise<PdfMetadataResult> => {
  if (isGlobalCooldownActive()) {
    log.warning("[GEMINI-METADATA] Skipping metadata extraction due to Global Cooldown.");
    return {};
  }
  if (!apiKey) throw new Error("API Key mancante");

  log.info(`[GEMINI-METADATA] Estrazione info PDF (${model})...`);

  const runAttempt = async (currentModel: GeminiModel) => {
    // Force new instance to ensure mock is used if getGeminiInstance caches
    const ai = new GoogleGenAI({ apiKey });
    // Or if you prefer using the helper, ensure the helper returns the mocked instance correctly
    // const ai = getGeminiInstance(apiKey); 

    const parts: any[] = [
      { text: customPrompt && customPrompt.trim().length > 0 ? customPrompt : getMetadataExtractionPrompt(targetLanguage) }
    ];

    for (const img of imagesBase64) {
      const mime = detectImageMime(img, "image/jpeg");
      const sanitized = ensureBase64(img);
      parts.push({ inlineData: { mimeType: mime, data: sanitized } });
    }

    if (signal?.aborted) throw new Error("Operazione annullata");

    try {
      // @ts-ignore
      const result = await ai.models.generateContent({
        model: currentModel,
        contents: [{ role: "user", parts }],
        config: {
          safetySettings: DEFAULT_SAFETY_SETTINGS,
          temperature: 0,
          tools: [{ googleSearch: {} }],
          // @ts-ignore
          ...(currentModel.includes("thinking") || currentModel.includes("3.1-pro") ? { thinkingConfig: { thinkingLevel: "HIGH" } } : {}) as any
        }
      });
      
      // Track usage
      if (result?.usageMetadata) {
        trackUsage(currentModel, result.usageMetadata.promptTokenCount || 0, result.usageMetadata.candidatesTokenCount || 0);
      }
      
      // @ts-ignore
      const text = typeof result?.response?.text === 'function' ? result.response.text() : result?.text;
      if (!text) throw new Error("Risposta vuota");

      const parsed = safeParseJsonObject(text);
      if (!parsed) throw new Error("JSON non valido");

      return {
        year: typeof parsed?.year === "string" ? parsed.year.trim() : typeof parsed?.year === "number" ? String(parsed.year) : "0000",
        author: typeof parsed?.author === "string" ? parsed.author.trim() : "Unknown",
        title: typeof parsed?.title === "string" ? parsed.title.trim() : "Untitled"
      };
    } catch (error: any) {
      // Rilancia errori di quota per far scattare il retry/fallback
      if (error?.message && (error.message.includes('429') || error.message.includes('Quota'))) {
        throw new Error('Quota exceeded');
      }
      throw error;
    }
  };

  const candidateModels = [
    model,
    GEMINI_TRANSLATION_FAST_MODEL,
    GEMINI_TRANSLATION_FALLBACK_MODEL,
    GEMINI_TRANSLATION_FLASH_MODEL
  ].filter((m, i, self) => self.indexOf(m) === i); // Deduplicate

  let lastError: any;

  for (const currentModel of candidateModels) {
    try {
      const result = await retry(
        () => runAttempt(currentModel),
        3, // 3 attempts per model
        2000, // 2s delay * 2^i
        (err, attempt) => {
          // Usa la logica di controllo errore del retry per il log
          const msg = String(err?.message || "").toLowerCase();
          if (msg.includes("quota") || msg.includes("429")) {
            log.warning(`[GEMINI-METADATA] Quota esaurita (${currentModel}), tentativo ${attempt}/3 in corso...`);
          } else {
            log.warning(`[GEMINI-METADATA] Errore temporaneo (${currentModel}), tentativo ${attempt}/3...`, err);
          }
        },
        (err) => {
          const msg = String(err?.message || "");
          if (isHardLimitZero(err)) return false;
          // Riprova su quota, timeout, overloaded o qualsiasi errore di rete, MA NON su abort
          return (isQuotaError(err) || msg.includes("Timeout") || msg.includes("overloaded") || msg.includes("Quota")) && !msg.includes("annullata");
        }
      );
      log.success(`[GEMINI-METADATA] Info PDF estratte con successo.`);
      return result;
    } catch (err: any) {
      lastError = err;
      if (err?.name === 'AbortError' || err?.code === 'ABORTED' || String(err?.message).includes("annullata")) {
        throw err;
      }

      // Log warning and continue to next model
      log.warning(`[GEMINI-METADATA] Fallimento con modello ${currentModel}. Passaggio al successivo...`, err);
    }
  }

  log.error("[GEMINI-METADATA] Errore estrazione metadati PDF: falliti tutti i modelli.", lastError);
  return {};
};
