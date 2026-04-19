/**
 * groqService.ts
 * 
 * Groq è compatibile con l'API OpenAI. Usa la stessa struttura di chiamata
 * ma con base URL https://api.groq.com/openai/v1.
 * 
 * NOTA VISION: Solo alcuni modelli Groq supportano immagini (es. llama-4-scout).
 * Per la verifica qualità (solo testo), qualsiasi modello è utilizzabile.
 */

import { TranslationResult, GroqModel, PDFMetadata } from "../types";
import { log } from "./logger";
import { cleanTranslationText } from "./textClean";
import { retry, withTimeout } from "../utils/async";
import { safeParseJsonObject } from "../utils/json";
import { getGroqTranslateSystemPrompt, getGroqTranslateUserInstruction, getGroqVerifyQualitySystemPrompt, GROQ_VISION_MODELS } from './prompts/groq';
import { getMetadataExtractionPrompt } from './prompts/shared';
import { AI_VERIFICATION_TIMEOUT_MS } from "../constants";
import { trackUsage } from "./usageTracker";

const normalizeGroqError = (e: any): Error => {
  if (e?.name === 'AbortError' || e?.message?.includes('aborted')) {
    return new Error("Operazione annullata");
  }
  if (e?.message?.includes('429') || e?.message?.includes('Quota')) {
    return new Error("Quota Groq esaurita");
  }
  return e instanceof Error ? e : new Error(String(e));
};

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

const groqFetch = async (apiKey: string, path: string, body: any, signal?: AbortSignal) => {
  return fetch(`${GROQ_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    signal,
    body: JSON.stringify(body)
  });
};

export const isGroqVisionModel = (model: string) => GROQ_VISION_MODELS.has(model);

/** Max base64 request size for Groq vision (4MB) */
const GROQ_MAX_BASE64_BYTES = 4 * 1024 * 1024;

/** Max images per request for Groq vision */
const GROQ_MAX_IMAGES = 5;

/** Max output tokens per model (from Groq docs) */
const GROQ_MODEL_MAX_OUTPUT: Record<string, number> = {
  'meta-llama/llama-4-scout-17b-16e-instruct': 8192,
  'llama-3.3-70b-versatile': 32768,
  'openai/gpt-oss-120b': 16384,
  'openai/gpt-oss-20b': 16384,
  'qwen/qwen3-32b': 32768,
  'llama-3.1-8b-instant': 8192,
};

/** Get the max output tokens for a Groq model (default 8192) */
const getGroqMaxOutput = (model: string): number => GROQ_MODEL_MAX_OUTPUT[model] || 8192;

/**
 * Pre-flight validation for using Groq as translation provider.
 * Returns { ok: true } or { ok: false, reason: string }.
 * Call this BEFORE starting translation to give the user a clear error.
 */
export const validateGroqForTranslation = (model: string, imageBase64?: string): { ok: true } | { ok: false; reason: string } => {
  if (!isGroqVisionModel(model)) {
    return {
      ok: false,
      reason: `Il modello "${model}" non supporta immagini. Per tradurre PDF con Groq, seleziona "Llama 4 Scout 17B 👁" nelle impostazioni.`
    };
  }
  if (imageBase64) {
    const approxBytes = Math.floor((imageBase64.length * 3) / 4);
    if (approxBytes > GROQ_MAX_BASE64_BYTES) {
      const sizeMB = (approxBytes / (1024 * 1024)).toFixed(1);
      return {
        ok: false,
        reason: `L'immagine della pagina è troppo grande per Groq (${sizeMB}MB). Il limite è 4MB per le immagini base64. Prova a ridurre la risoluzione del PDF o usa un altro provider (Gemini/Claude).`
      };
    }
  }
  return { ok: true };
};

export const translateWithGroq = async (
  imageBase64: string,
  pageNumber: number,
  sourceLanguage: string,
  previousContext: string,
  prevPageImageBase64: string | undefined,
  prevPageNumber: number | undefined,
  nextPageImageBase64: string | undefined,
  nextPageNumber: number | undefined,
  apiKey: string,
  model: GroqModel,
  extraInstruction?: string,
  onProgress?: (text: string) => void,
  signal?: AbortSignal,
  legalContext?: boolean,
  customPrompt?: string,
  skipPostProcessing?: boolean
): Promise<TranslationResult> => {
  if (!apiKey) throw new Error("API Key Groq mancante");

  // Pre-flight validation
  const check = validateGroqForTranslation(model, imageBase64);
  if (!check.ok) {
    throw new Error(check.reason);
  }

  // Validate context images too
  if (prevPageImageBase64) {
    const prevBytes = Math.floor((prevPageImageBase64.length * 3) / 4);
    if (prevBytes > GROQ_MAX_BASE64_BYTES) {
      log.warning(`Immagine contesto pagina precedente troppo grande per Groq (${(prevBytes / (1024 * 1024)).toFixed(1)}MB), la ometto.`);
      prevPageImageBase64 = undefined;
      prevPageNumber = undefined;
    }
  }
  if (nextPageImageBase64) {
    const nextBytes = Math.floor((nextPageImageBase64.length * 3) / 4);
    if (nextBytes > GROQ_MAX_BASE64_BYTES) {
      log.warning(`Immagine contesto pagina successiva troppo grande per Groq (${(nextBytes / (1024 * 1024)).toFixed(1)}MB), la ometto.`);
      nextPageImageBase64 = undefined;
      nextPageNumber = undefined;
    }
  }

  const startedAt = performance.now();
  const imageBytesApprox = Math.floor((imageBase64.length * 3) / 4);
  const isRetry = Boolean(extraInstruction && extraInstruction.trim().length > 0);
  const systemPrompt = getGroqTranslateSystemPrompt(sourceLanguage, previousContext, legalContext ?? true, isRetry, customPrompt, model);

  if (onProgress) onProgress(`Preparazione richiesta Groq (${model})...`);
  log.wait(`[GROQ-TRANSLATION] Richiesta (${model})...`, {
    imageKB: Math.round(imageBytesApprox / 1024),
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

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ];

      response = await groqFetch(apiKey, '/chat/completions', {
        model,
        messages,
        max_completion_tokens: getGroqMaxOutput(model)
      }, signal);
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        log.warning("Richiesta Groq annullata (AbortError).");
        throw e;
      }
      log.error("Errore rete durante chiamata Groq", e);
      throw e;
    }

    const requestId = response.headers.get('x-request-id') || undefined;
    if (onProgress) onProgress(`Risposta HTTP ricevuta (status: ${response.status})`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || response.statusText || "Errore sconosciuto";
      log.error("Errore API Groq", { status: response.status, message: errorMsg, body: errorData });
      throw new Error(`Errore API Groq: ${errorMsg} (status ${response.status})`);
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

  const baseInstruction = getGroqTranslateUserInstruction(pageNumber, sourceLanguage);
  const effectiveInstruction = extraInstruction?.trim()
    ? `${baseInstruction}\n\n${extraInstruction.trim()}`
    : baseInstruction;

  const attempt1 = await retry(
    () => runAttempt(effectiveInstruction),
    2,
    3000,
    (err, attempt) => {
      if (onProgress) onProgress(`Errore temporaneo (Groq), tentativo ${attempt}/2 in corso...`);
      log.warning(`Ritento Groq (attempt ${attempt}) causa errore transiente`, err);
    },
    (err) => {
      const name = String((err as any)?.name || "");
      const msg = String((err as any)?.message || "");
      return name !== "AbortError" && !msg.includes("aborted") && !msg.includes("annullat");
    }
  );

  const elapsedMs = Math.round(performance.now() - startedAt);
  log.recv(`Ricevuta traduzione Groq (${attempt1.text.length} caratteri)`, { elapsedMs, requestId: attempt1.requestId });
  if (onProgress) onProgress(`Output pronto: ${attempt1.text.length} caratteri (tempo: ${elapsedMs}ms)`);

  if (skipPostProcessing) {
    return { text: attempt1.text || "", annotations: [], modelUsed: model };
  }

  const cleaned1 = cleanTranslationText(attempt1.text || "");
   return { text: cleaned1, annotations: [], modelUsed: model };
};

/**
 * Verifica qualità con Groq (solo testo — nessun requisito vision).
 * I modelli Groq come llama-3.3-70b sono rapidissimi per questa task.
 */
export const verifyTranslationQualityWithGroq = async (params: {
  apiKey: string;
  verifierModel: GroqModel;
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
  if (!apiKey) throw new Error("API Key Groq mancante");

  const systemPrompt = customPrompt && customPrompt.trim().length > 0
    ? customPrompt
    : getGroqVerifyQualitySystemPrompt(legalContext, sourceLanguage, verifierModel);

  const isVision = isGroqVisionModel(verifierModel);
  if (!isVision) {
    throw new Error(`La verifica richiede il confronto visivo. Il modello Groq selezionato (${verifierModel}) non supporta immagini. Seleziona un modello Vision o cambia provider per la verifica.`);
  }

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
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  const STALLED_TIMEOUT_MS = 30000;
  const stalledTimer = setTimeout(() => {
    log.warning(`[GROQ-STALLED] Nessuna risposta dopo ${STALLED_TIMEOUT_MS / 1000}s per pagina ${pageNumber}`);
  }, STALLED_TIMEOUT_MS);

  log.info(`[GROQ] Invio richiesta verifica pagina ${pageNumber} con ${verifierModel}...`);

  let data;
  try {
    data = await withTimeout(
      (async () => {
        const response = await groqFetch(apiKey, '/chat/completions', {
          model: verifierModel,
          messages,
          response_format: { type: "json_object" },
          max_completion_tokens: 4096 // Ridotto per evitare TPM limits su free tier
        }, signal);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`Errore API Groq: ${errorData?.error?.message || response.statusText}`);
        }

        const json = await response.json();
        if (json.usage) {
          const { prompt_tokens, completion_tokens } = json.usage;
          trackUsage(verifierModel, prompt_tokens || 0, completion_tokens || 0);
        }
        return json;
      })(),
      AI_VERIFICATION_TIMEOUT_MS,
      () => log.warning(`Timeout verifica qualità Groq per pagina ${pageNumber}`)
    );
    log.info(`[GROQ] Risposta verifica ricevuta per pagina ${pageNumber}.`);
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

export const testGroqConnection = async (apiKey: string, model: GroqModel, signal?: AbortSignal): Promise<{ success: boolean; message: string }> => {
  if (!apiKey) throw new Error("API Key Groq mancante");
  try {
    log.info(`Test connessione Groq (${model})...`);
    const response = await groqFetch(apiKey, '/chat/completions', {
      model,
      messages: [{ role: 'user', content: "Traduci 'Hello World' in Italiano. Rispondi SOLO con la traduzione." }],
      max_tokens: 10
    }, signal);
    if (!response.ok) {
      const e = await response.json().catch(() => ({}));
      return { success: false, message: `Errore Groq: ${e?.error?.message || response.statusText}` };
    }
    const data = await response.json();

    // Track usage for connection test
    if (data.usage) {
      const { prompt_tokens, completion_tokens } = data.usage;
      trackUsage(model, prompt_tokens || 0, completion_tokens || 0);
    }

    const text = data.choices?.[0]?.message?.content || "";
    if (text.trim().length > 0) {
      log.success(`Test Groq riuscito: "${text.trim()}"`);
      return { success: true, message: `Connessione riuscita: "${text.trim()}"` };
    }
    return { success: false, message: "Risposta vuota o non valida dall'API." };
  } catch (error: any) {
    log.error("Test connessione Groq fallito", error);
    return { success: false, message: error.message || "Errore sconosciuto durante il test." };
  }
};

/**
 * Estrae i metadati PDF usando Groq.
 */
export const extractPdfMetadataWithGroq = async (
  apiKey: string,
  model: GroqModel,
  imagesBase64: string[],
  signal?: AbortSignal,
  targetLanguage?: string,
  customPrompt?: string
): Promise<Partial<PDFMetadata>> => {
  if (!apiKey) throw new Error("API Key Groq mancante");

  const prompt = customPrompt && customPrompt.trim().length > 0 ? customPrompt : getMetadataExtractionPrompt(targetLanguage);
  const isVision = GROQ_VISION_MODELS.has(model as any);
  
  const content: any[] = [{ type: 'text', text: prompt }];
  if (isVision) {
    imagesBase64.forEach((img, i) => {
      content.push({ type: 'text', text: `Immagine ${i + 1}:` });
      content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}` } });
    });
  } else {
    log.warning(`[GROQ] Il modello ${model} non supporta immagini per i metadati. Estrazione limitata.`);
  }

  const messages = [{ role: 'user', content }];

  try {
    log.info(`[GROQ-METADATA] Estrazione info PDF (${model})...`);
    const response = await groqFetch(apiKey, '/chat/completions', {
      model,
      messages,
      response_format: { type: "json_object" },
      max_completion_tokens: 1024
    }, signal);

    if (!response.ok) {
      const e = await response.json().catch(() => ({}));
      throw new Error(`Errore API Groq: ${e?.error?.message || response.statusText}`);
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
    log.error("Errore estrazione metadati PDF con Groq", e);
    return {};
  }
};
