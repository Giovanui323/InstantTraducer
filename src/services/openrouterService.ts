/**
 * openrouterService.ts
 *
 * OpenRouter è compatibile con l'API OpenAI. Usa la stessa struttura di chiamata
 * ma con base URL https://openrouter.ai/api/v1.
 *
 * NOTA: La maggior parte dei modelli su OpenRouter supporta immagini (vision).
 * Non viene fatta validazione pre-flight — OpenRouter gestisce i limiti server-side.
 */

import { TranslationResult, PDFMetadata } from "../types";
import { log } from "./logger";
import { cleanTranslationText } from "./textClean";
import { retry, withTimeout } from "../utils/async";
import { safeParseJsonObject } from "../utils/json";
import { getOpenRouterTranslateSystemPrompt, getOpenRouterTranslateUserInstruction } from './prompts/openrouter';
import { getMetadataExtractionPrompt } from './prompts/shared';
import { getVerifyQualitySystemPrompt } from "./verifierPrompts";
import { AI_VERIFICATION_TIMEOUT_MS } from "../constants";
import { trackUsage } from "./usageTracker";
import { OPENROUTER_VERIFICATION_SCHEMA, OPENROUTER_METADATA_SCHEMA } from "./schemas/openrouterSchemas";

const normalizeOpenRouterError = (e: any): Error => {
  if (e?.name === 'AbortError' || e?.message?.includes('aborted')) {
    return new Error("Operazione annullata");
  }
  if (e?.message?.includes('429') || e?.message?.includes('rate')) {
    return new Error("Rate limit OpenRouter raggiunto");
  }
  return e instanceof Error ? e : new Error(String(e));
};

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const openrouterFetch = async (apiKey: string, path: string, body: any, signal?: AbortSignal) => {
  return fetch(`${OPENROUTER_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://translatorclaude.app',
      'X-Title': 'TranslatorClaude'
    },
    signal,
    body: JSON.stringify(body)
  });
};

/** Default max output tokens for OpenRouter requests */
const OPENROUTER_DEFAULT_MAX_OUTPUT = 16384;

export const translateWithOpenRouter = async (
  imageBase64: string,
  pageNumber: number,
  sourceLanguage: string,
  previousContext: string,
  prevPageImageBase64: string | undefined,
  prevPageNumber: number | undefined,
  nextPageImageBase64: string | undefined,
  nextPageNumber: number | undefined,
  apiKey: string,
  model: string,
  extraInstruction?: string,
  onProgress?: (text: string) => void,
  signal?: AbortSignal,
  legalContext?: boolean,
  customPrompt?: string,
  skipPostProcessing?: boolean
): Promise<TranslationResult> => {
  if (!apiKey) throw new Error("API Key OpenRouter mancante");

  const startedAt = performance.now();
  const isRetry = Boolean(extraInstruction && extraInstruction.trim().length > 0);
  const systemPrompt = getOpenRouterTranslateSystemPrompt(sourceLanguage, previousContext, legalContext ?? true, isRetry, customPrompt);

  if (onProgress) onProgress(`Preparazione richiesta OpenRouter (${model})...`);
  log.wait(`[OPENROUTER-TRANSLATION] Richiesta (${model})...`, {
    imageKB: Math.round(Math.floor((imageBase64.length * 3) / 4) / 1024),
    systemPromptChars: systemPrompt.length,
    previousContextChars: previousContext?.length || 0,
    aborted: Boolean(signal?.aborted)
  });

  const runAttempt = async (instruction: string): Promise<{ text: string; requestId?: string }> => {
    let response: Response;
    try {
      const userContent: any[] = [
        { type: 'text', text: instruction },
        ...(prevPageImageBase64 && prevPageNumber
          ? [
              { type: 'text', text: `CONTESTO (NON tradurre): pagina precedente ${prevPageNumber}` },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${prevPageImageBase64}` } }
            ]
          : []),
        { type: 'text', text: `PAGINA DA TRADURRE: Pagina ${pageNumber}` },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        ...(nextPageImageBase64 && nextPageNumber
          ? [
              { type: 'text', text: `CONTESTO (NON tradurre): pagina successiva ${nextPageNumber}` },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${nextPageImageBase64}` } }
            ]
          : [])
      ];

      // Applica il prompt caching top-level per Anthropic
      // (ma OpenRouter la supporta esplicitamente sui blocchi)
      const systemMessageContent: any[] = [
        { 
          type: 'text', 
          text: systemPrompt,
          cache_control: { type: "ephemeral" } // Prompt Caching
        }
      ];

      const messages = [
        { role: 'system', content: systemMessageContent },
        { role: 'user', content: userContent }
      ];

      // Costruiamo la fallback chain
      const fallbackModels = model === 'openrouter/auto' ? ['openrouter/auto'] : [model, 'openrouter/auto'];

      response = await openrouterFetch(apiKey, '/chat/completions', {
        models: fallbackModels,
        messages,
        max_tokens: OPENROUTER_DEFAULT_MAX_OUTPUT
      }, signal);
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        log.warning("Richiesta OpenRouter annullata (AbortError).");
        throw e;
      }
      log.error("Errore rete durante chiamata OpenRouter", e);
      throw e;
    }

    const requestId = response.headers.get('x-request-id') || undefined;
    if (onProgress) onProgress(`Risposta HTTP ricevuta (status: ${response.status})`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || response.statusText || "Errore sconosciuto";
      log.error("Errore API OpenRouter", { status: response.status, message: errorMsg, body: errorData });
      throw new Error(`Errore API OpenRouter: ${errorMsg} (status ${response.status})`);
    }

    const data = await response.json();

    // Track usage
    if (data.usage) {
      const { prompt_tokens, completion_tokens } = data.usage;
      trackUsage(model, prompt_tokens || 0, completion_tokens || 0);
    }

    const text = data.choices?.[0]?.message?.content || "";
    return { text, requestId };
  };

  const baseInstruction = getOpenRouterTranslateUserInstruction(pageNumber, sourceLanguage);
  const effectiveInstruction = extraInstruction?.trim()
    ? `${baseInstruction}\n\n${extraInstruction.trim()}`
    : baseInstruction;

  const attempt1 = await retry(
    () => runAttempt(effectiveInstruction),
    2,
    3000,
    (err, attempt) => {
      if (onProgress) onProgress(`Errore temporaneo (OpenRouter), tentativo ${attempt}/2 in corso...`);
      log.warning(`Ritento OpenRouter (attempt ${attempt}) causa errore transiente`, err);
    },
    (err) => {
      const name = String((err as any)?.name || "");
      const msg = String((err as any)?.message || "");
      return name !== "AbortError" && !msg.includes("aborted") && !msg.includes("annullat");
    }
  );

  const elapsedMs = Math.round(performance.now() - startedAt);
  log.recv(`Ricevuta traduzione OpenRouter (${attempt1.text.length} caratteri)`, { elapsedMs, requestId: attempt1.requestId });
  if (onProgress) onProgress(`Output pronto: ${attempt1.text.length} caratteri (tempo: ${elapsedMs}ms)`);

  if (skipPostProcessing) {
    return { text: attempt1.text || "", annotations: [], modelUsed: model };
  }

  const cleaned1 = cleanTranslationText(attempt1.text || "");
  return { text: cleaned1, annotations: [], modelUsed: model };
};

/**
 * Verifica qualità con OpenRouter (solo testo).
 */
export const verifyTranslationQualityWithOpenRouter = async (params: {
  apiKey: string;
  verifierModel: string;
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
  customPrompt?: string;
}): Promise<any> => {
  const { 
    apiKey, verifierModel, pageNumber, translatedText, signal, 
    legalContext = true, sourceLanguage = "Tedesco", customPrompt,
    imageBase64, prevPageImageBase64, prevPageNumber, nextPageImageBase64, nextPageNumber 
  } = params;
  if (!apiKey) throw new Error("API Key OpenRouter mancante");

  const systemPrompt = customPrompt && customPrompt.trim().length > 0
    ? customPrompt
    : getVerifyQualitySystemPrompt(legalContext, sourceLanguage, verifierModel);

  const userContent: any[] = [
    { type: 'text', text: `PAGINA DA VERIFICARE: Pagina ${pageNumber}` },
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
    ...(prevPageImageBase64 && prevPageNumber
      ? [
          { type: 'text', text: `CONTESTO (NON TRADURRE): pagina precedente ${prevPageNumber}` },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${prevPageImageBase64}` } }
        ]
      : []),
    ...(nextPageImageBase64 && nextPageNumber
      ? [
          { type: 'text', text: `CONTESTO (NON TRADURRE): pagina successiva ${nextPageNumber}` },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${nextPageImageBase64}` } }
        ]
      : []),
    {
      type: 'text',
      text: `TRADUZIONE DA REVISIONARE:\n"""\n${translatedText}\n"""`
    }
  ];

  const messages = [
    { role: 'system', content: [{ type: 'text', text: systemPrompt, cache_control: { type: "ephemeral" } }] },
    { role: 'user', content: userContent }
  ];

  const STALLED_TIMEOUT_MS = 30000;
  const stalledTimer = setTimeout(() => {
    log.warning(`[OPENROUTER-STALLED] Nessuna risposta dopo ${STALLED_TIMEOUT_MS / 1000}s per pagina ${pageNumber}`);
  }, STALLED_TIMEOUT_MS);

  log.info(`[OPENROUTER] Invio richiesta verifica pagina ${pageNumber} con ${verifierModel}...`);

  let data;
  try {
    data = await withTimeout(
      (async () => {
        const fallbackModels = verifierModel === 'openrouter/auto' ? ['openrouter/auto'] : [verifierModel, 'openrouter/auto'];
        
        const response = await openrouterFetch(apiKey, '/chat/completions', {
          models: fallbackModels,
          messages,
          response_format: OPENROUTER_VERIFICATION_SCHEMA,
          max_tokens: 4096
        }, signal);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`Errore API OpenRouter: ${errorData?.error?.message || response.statusText}`);
        }

        const json = await response.json();
        if (json.usage) {
          const { prompt_tokens, completion_tokens } = json.usage;
          trackUsage(verifierModel, prompt_tokens || 0, completion_tokens || 0);
        }
        return json;
      })(),
      AI_VERIFICATION_TIMEOUT_MS,
      () => log.warning(`Timeout verifica qualità OpenRouter per pagina ${pageNumber}`)
    );
    log.info(`[OPENROUTER] Risposta verifica ricevuta per pagina ${pageNumber}.`);
  } finally {
    clearTimeout(stalledTimer);
  }

  const rawJson = data.choices?.[0]?.message?.content || "{}";
  const parsed = safeParseJsonObject(rawJson);

  return {
    severity: parsed.severity || "ok",
    summary: parsed.summary || "",
    evidence: parsed.evidence || [],
    annotations: parsed.annotations || [],
    retryHint: parsed.retryHint || undefined
  };
};

export const testOpenRouterConnection = async (apiKey: string, model: string, signal?: AbortSignal): Promise<{ success: boolean; message: string }> => {
  if (!apiKey) throw new Error("API Key OpenRouter mancante");
  try {
    log.info(`Test connessione OpenRouter (${model})...`);
    const fallbackModels = model === 'openrouter/auto' ? ['openrouter/auto'] : [model, 'openrouter/auto'];
    const response = await openrouterFetch(apiKey, '/chat/completions', {
      models: fallbackModels,
      messages: [{ role: 'user', content: "Traduci 'Hello World' in Italiano. Rispondi SOLO con la traduzione." }],
      max_tokens: 10
    }, signal);
    if (!response.ok) {
      const e = await response.json().catch(() => ({}));
      return { success: false, message: `Errore OpenRouter: ${e?.error?.message || response.statusText}` };
    }
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    if (text.trim().length > 0) {
      log.success(`Test OpenRouter riuscito: "${text.trim()}"`);
      return { success: true, message: `Connessione riuscita: "${text.trim()}"` };
    }
    return { success: false, message: "Risposta vuota o non valida dall'API." };
  } catch (error: any) {
    log.error("Test connessione OpenRouter fallito", error);
    return { success: false, message: error.message || "Errore sconosciuto durante il test." };
  }
};

/**
 * Estrae i metadati PDF usando OpenRouter.
 */
export const extractPdfMetadataWithOpenRouter = async (
  apiKey: string,
  model: string,
  imagesBase64: string[],
  signal?: AbortSignal,
  targetLanguage?: string,
  customPrompt?: string
): Promise<Partial<PDFMetadata>> => {
  if (!apiKey) throw new Error("API Key OpenRouter mancante");

  const prompt = customPrompt && customPrompt.trim().length > 0 ? customPrompt : getMetadataExtractionPrompt(targetLanguage);

  const content: any[] = [{ type: 'text', text: prompt }];
  imagesBase64.forEach((img, i) => {
    content.push({ type: 'text', text: `Immagine ${i + 1}:` });
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}` } });
  });

  const messages = [{ role: 'user', content }];

  try {
    log.info(`[OPENROUTER-METADATA] Estrazione info PDF (${model})...`);
    
    const fallbackModels = model === 'openrouter/auto' ? ['openrouter/auto'] : [model, 'openrouter/auto'];
    
    const response = await openrouterFetch(apiKey, '/chat/completions', {
      models: fallbackModels,
      messages,
      response_format: OPENROUTER_METADATA_SCHEMA,
      max_tokens: 1024
    }, signal);

    if (!response.ok) {
      const e = await response.json().catch(() => ({}));
      throw new Error(`Errore API OpenRouter: ${e?.error?.message || response.statusText}`);
    }

    const data = await response.json();

    // Track usage
    if (data.usage) {
      const { prompt_tokens, completion_tokens } = data.usage;
      trackUsage(model, prompt_tokens || 0, completion_tokens || 0);
    }

    const rawJson = data.choices?.[0]?.message?.content || "{}";
    const parsed = safeParseJsonObject(rawJson);

    return {
      year: typeof parsed?.year === "string" ? parsed.year.trim() : typeof parsed?.year === "number" ? String(parsed.year) : "0000",
      author: typeof parsed?.author === "string" ? parsed.author.trim() : "Unknown",
      title: typeof parsed?.title === "string" ? parsed.title.trim() : "Untitled"
    };
  } catch (e) {
    log.error("Errore estrazione metadati PDF con OpenRouter", e);
    return {};
  }
};
