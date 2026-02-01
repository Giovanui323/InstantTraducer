
import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from "@google/genai";
import { GeminiModel, PageAnnotation, TranslationResult, VerificationSeverity } from "../types";
import { log } from "./logger";
import { cleanTranslationText } from "./textClean";
import { ensureBase64, detectImageMime } from "../utils/imageUtils";
import { 
  looksLikeItalian
} from "./aiUtils";
import { retry } from "../utils/async";
import { safeParseJsonObject } from "../utils/json";
import { 
  GEMINI_TRANSLATION_MODEL, 
  GEMINI_TRANSLATION_FALLBACK_MODEL,
  GEMINI_TRANSLATION_FLASH_MODEL,
  GEMINI_VERIFIER_MODEL,
  GEMINI_VERIFIER_FALLBACK_MODEL,
  GEMINI_COOLDOWN_MS
} from "../constants";

// Stato globale per il cooldown dei modelli Pro
const modelCooldowns: Record<string, number> = {};

const isModelInCooldown = (model: string): boolean => {
  const expiry = modelCooldowns[model];
  if (!expiry) return false;
  if (Date.now() > expiry) {
    delete modelCooldowns[model];
    return false;
  }
  return true;
};

const setModelCooldown = (model: string) => {
  log.warning(`Attivazione cooldown di 20 minuti per il modello ${model} a causa di errori persistenti/quota.`);
  modelCooldowns[model] = Date.now() + GEMINI_COOLDOWN_MS;
};
import { 
  getTranslateSystemPrompt, 
  getTranslateUserInstruction, 
  getVerifyQualitySystemPrompt, 
  getMetadataExtractionPrompt 
} from "./prompts";

const normalizeGeminiError = (e: any) => {
  if (e instanceof Error) return e;
  
  const msg = e?.error?.message || e?.message || e?.statusText || (typeof e === 'string' ? e : "");
  const code = e?.error?.code || e?.status || (e?.name === 'AbortError' ? 'ABORTED' : undefined);
  
  if (msg.includes("Base64 decoding failed")) {
    return new Error("Immagine non valida: fornire Base64 senza prefisso data:, con mime corretto.");
  }
  
  const finalMsg = msg || "Errore sconosciuto Gemini API";
  const err = new Error(finalMsg);
  if (code) (err as any).code = code;
  return err;
};

const isQuotaError = (e: any): boolean => {
  const msg = String(e?.error?.message || e?.message || "").toLowerCase();
  return (
    msg.includes("quota") ||
    msg.includes("limit exceeded") ||
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("exhausted") ||
    msg.includes("credit")
  );
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
  legalContext?: boolean
): Promise<TranslationResult> => {
  if (!apiKey) throw new Error("API Key mancante");

  // Controllo cooldown per modelli Pro
  let model = requestedModel;
  if (model !== GEMINI_TRANSLATION_FLASH_MODEL && isModelInCooldown(model)) {
    log.info(`Modello ${model} in cooldown. Utilizzo fallback rapido: ${GEMINI_TRANSLATION_FLASH_MODEL}`);
    if (onProgress) onProgress(`Modello Pro in pausa (quota/timeout). Uso ${GEMINI_TRANSLATION_FLASH_MODEL}...`);
    model = GEMINI_TRANSLATION_FLASH_MODEL;
  }

  const startedAt = performance.now();
  const imageBytesApprox = Math.floor((imageBase64.length * 3) / 4);
  if (onProgress) onProgress(`Preparazione richiesta Gemini (${model}) - Immagine: ${Math.round(imageBytesApprox / 1024)}KB`);
  const ai = getGeminiInstance(apiKey);
  const safePreviousContext = looksLikeItalian(previousContext, sourceLanguage) ? previousContext : "";
  const requestStartedAt = Date.now();
  let firstChunkAt: number | null = null;
  let lastChunkAt = Date.now();
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

    log.wait(`Richiesta Gemini (${model}) per pagina ${pageNumber}${contextLabel}...`, {
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
        const now = Date.now();
        const elapsedS = Math.round((now - requestStartedAt) / 1000);
        
        if (!streamingActive) {
          if (elapsedS > 5) {
            onProgress(`In attesa di connessione/risposta... (${elapsedS}s)`);
          }
          return;
        }

        if (firstChunkAt === null) {
          // Timeout critico: se dopo 120s non abbiamo il primo chunk, segnaliamo timeout
          if (elapsedS >= 120) {
            log.warning(`Timeout primo chunk Gemini (120s superati) per pagina ${pageNumber}.`);
            if (heartbeatId) { clearInterval(heartbeatId); heartbeatId = null; }
            onProgress(`Errore: Gemini non risponde dopo ${elapsedS}s. Riprovo...`);
          } else if (elapsedS > 60) {
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

    const userInstruction = getTranslateUserInstruction(pageNumber, sourceLanguage);

    const effectiveInstruction = extraInstruction?.trim()
      ? `${userInstruction}\n\n${extraInstruction.trim()}`
      : userInstruction;

    const runAttempt = async (instruction: string, contextForPrompt: string) => {
      streamingActive = true;
      const mainMime = detectImageMime(imageBase64, "image/jpeg");
      const prevMime = detectImageMime(prevPageImageBase64 || "", "image/jpeg");
      const nextMime = detectImageMime(nextPageImageBase64 || "", "image/jpeg");
      const sanitizedMain = ensureBase64(imageBase64);
      const sanitizedPrev = prevPageImageBase64 ? ensureBase64(prevPageImageBase64) : undefined;
      const sanitizedNext = nextPageImageBase64 ? ensureBase64(nextPageImageBase64) : undefined;
      
      const response = await ai.models.generateContentStream({
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
          systemInstruction: getTranslateSystemPrompt(sourceLanguage, contextForPrompt, legalContext ?? true),
          safetySettings: DEFAULT_SAFETY_SETTINGS,
          temperature: 1.0,
          // @ts-ignore - Supporto Gemini 3 thinking_config
          thinkingConfig: {
            includeThoughts: true,
            // @ts-ignore
            thinkingLevel: "HIGH"
          }
        }
      });

      let fullText = "";
      let lastProgressAt = 0;
      let lastNotifiedLength = 0;
      let chunkCount = 0;
      let emptyChunkCount = 0;
      let lastChunk: any = null;

      // Monitor per il primo chunk: se dopo 100s non abbiamo nulla, logghiamo un avviso
      const firstChunkTimeout = setTimeout(() => {
        if (firstChunkAt === null && streamingActive) {
          log.warning(`Timeout iteratore streaming Gemini per pagina ${pageNumber} (100s superati)`);
        }
      }, 100000);

      try {
        for await (const chunk of response) {
          try {
            if (signal?.aborted) throw new Error("Richiesta annullata");
            
            // Check aggiuntivo per timeout primo chunk all'interno del loop
            if (firstChunkAt === null) {
              const now = Date.now();
              if (now - requestStartedAt > 120000) {
                throw new Error("Timeout: Gemini non ha inviato il primo chunk entro 120 secondi.");
              }
            }

            chunkCount += 1;
            lastChunkAt = Date.now();
            lastChunk = chunk;
            if (firstChunkAt === null) {
              firstChunkAt = lastChunkAt;
              if (onProgress) onProgress(`Prima risposta ricevuta dopo ${Math.round((firstChunkAt - requestStartedAt) / 1000)}s`);
            }
            
            const chunkText = chunk.text;
            if (chunkText) {
              fullText += chunkText;
              
              // Salvaguardia contro runaway generation (max 40k caratteri per pagina)
              if (fullText.length > 40000) {
                log.warning(`Runaway generation rilevata (>40k caratteri) per pagina ${pageNumber}. Interruzione streaming.`);
                break; 
              }

              const now = Date.now();
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
      if (onProgress) onProgress("Post-processing testo (pulizia meta-testi/OCR residuo)...");
      const cleaned = cleanOutput(fullText || "");
      if (fullText.length !== cleaned.length) {
        log.info(`Post-processing: Testo pulito di ${fullText.length - cleaned.length} caratteri.`);
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
        // NON riprovare se la richiesta è stata annullata manualmente
        const msg = String(err?.message || "");
        return !msg.includes("Richiesta annullata") && !msg.includes("aborted");
      }
    );
    if (onProgress) onProgress(`Completato: ${attempt1Text.length} caratteri`);

    return { text: attempt1Text, annotations: [] };
  } catch (error: any) {
    const isQuota = isQuotaError(error);
    const isTimeout = String(error?.message || "").includes("Timeout");

    // Se è un errore di quota o un timeout sul modello Pro, attiviamo il cooldown e passiamo a Flash
    if ((isQuota || isTimeout) && model !== GEMINI_TRANSLATION_FLASH_MODEL) {
      if (isQuota) setModelCooldown(model);
      
      const nextModel = model === GEMINI_TRANSLATION_MODEL ? GEMINI_TRANSLATION_FALLBACK_MODEL : GEMINI_TRANSLATION_FLASH_MODEL;
      
      log.warning(`Errore (${isQuota ? 'Quota' : 'Timeout'}) per ${model}. Passaggio a ${nextModel}...`);
      if (onProgress) onProgress(`${isQuota ? 'Quota esaurita' : 'Timeout'} per ${model}. Provo con ${nextModel}...`);
      
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
        legalContext
      );
    }
    
    const mapped = normalizeGeminiError(error);
    log.error(`Errore Critico Pagina ${pageNumber}`, mapped);
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
    legalContext = true
  } = params;

  let verifierModel = requestedModel;
  if (verifierModel !== GEMINI_VERIFIER_FALLBACK_MODEL && isModelInCooldown(verifierModel)) {
    log.info(`Modello verifier ${verifierModel} in cooldown. Utilizzo fallback: ${GEMINI_VERIFIER_FALLBACK_MODEL}`);
    verifierModel = GEMINI_VERIFIER_FALLBACK_MODEL;
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

  let result;
  try {
    const contents: any[] = [
      {
        role: "user",
        parts: [
          {
            text: `${getVerifyQualitySystemPrompt(legalContext)}\n\nPAGINA DA VERIFICARE: ${pageNumber}`
          }
        ]
      }
    ];

    if (sanitizedPrev && prevPageNumber) {
      contents.push({ role: "user", parts: [{ text: `CONTESTO: Pagina precedente ${prevPageNumber}` }] });
      contents.push({ role: "user", parts: [{ inlineData: { mimeType: prevMime, data: sanitizedPrev } }] });
    }

    contents.push({ role: "user", parts: [{ text: `PAGINA PRINCIPALE: ${pageNumber}` }] });
    contents.push({ role: "user", parts: [{ inlineData: { mimeType: mime, data: sanitized } }] });

    if (sanitizedNext && nextPageNumber) {
      contents.push({ role: "user", parts: [{ text: `CONTESTO: Pagina successiva ${nextPageNumber}` }] });
      contents.push({ role: "user", parts: [{ inlineData: { mimeType: nextMime, data: sanitizedNext } }] });
    }

    contents.push({ role: "user", parts: [{ text: `TRADUZIONE DA REVISIONARE:\n"""\n${sample}\n"""` }] });

    if (signal?.aborted) throw new Error("Operazione annullata");

    result = await ai.models.generateContent({
      model: verifierModel,
      contents,
      config: {
        safetySettings: DEFAULT_SAFETY_SETTINGS,
        temperature: 0
      }
    });
  } catch (e: any) {
    if (isQuotaError(e) && verifierModel !== GEMINI_VERIFIER_FALLBACK_MODEL) {
      setModelCooldown(verifierModel);
      log.warning(`Quota esaurita per verifier ${verifierModel}. Passaggio a fallback: ${GEMINI_VERIFIER_FALLBACK_MODEL}...`);
      return verifyTranslationQualityWithGemini({
        ...params,
        verifierModel: GEMINI_VERIFIER_FALLBACK_MODEL
      });
    }
    const mapped = normalizeGeminiError(e);
    log.error("Verifica qualità fallita", mapped);
    throw mapped;
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

export const testGeminiConnection = async (apiKey: string, model: GeminiModel, signal?: AbortSignal): Promise<boolean> => {
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
      }
    });

    const text = result.text;

    if (text && text.trim().length > 0) {
      log.success(`Test riuscito: "${text.trim()}"`);
      return true;
    }
    return false;
  } catch (error) {
    if (isQuotaError(error) && model === GEMINI_TRANSLATION_MODEL) {
      log.warning(`Quota esaurita per ${model} durante il test. Provo il modello di fallback ${GEMINI_TRANSLATION_FALLBACK_MODEL}...`);
      return testGeminiConnection(apiKey, GEMINI_TRANSLATION_FALLBACK_MODEL, signal);
    }
    const mapped = normalizeGeminiError(error);
    log.error("Test connessione fallito", mapped);
    throw mapped;
  }
};

export type PdfMetadataResult = {
  year?: string;
  author?: string;
  title?: string;
  originalFileName?: string;
};

export const extractPdfMetadata = async (
  apiKey: string,
  model: GeminiModel,
  imagesBase64: string[],
  signal?: AbortSignal
): Promise<PdfMetadataResult> => {
  if (!apiKey) throw new Error("API Key mancante");
  const ai = getGeminiInstance(apiKey);

  const parts: any[] = [
    {
      text: getMetadataExtractionPrompt()
    }
  ];

  for (const img of imagesBase64) {
    const mime = detectImageMime(img, "image/jpeg");
    const sanitized = ensureBase64(img);
    parts.push({ inlineData: { mimeType: mime, data: sanitized } });
  }

  try {
    if (signal?.aborted) throw new Error("Operazione annullata");

    const result = await ai.models.generateContent({
      model,
      contents: [{
        role: "user",
        parts
      }],
      config: {
        safetySettings: DEFAULT_SAFETY_SETTINGS,
        temperature: 0
      }
    });

    const parsed = safeParseJsonObject(result.text || "");
    return {
      year: typeof parsed?.year === "string" ? parsed.year.trim() : typeof parsed?.year === "number" ? String(parsed.year) : "0000",
      author: typeof parsed?.author === "string" ? parsed.author.trim() : "Unknown",
      title: typeof parsed?.title === "string" ? parsed.title.trim() : "Untitled"
    };
  } catch (e) {
    if (isQuotaError(e) && model === GEMINI_TRANSLATION_MODEL) {
      log.warning(`Quota/Crediti esauriti per ${model} durante estrazione metadati. Tentativo con fallback...`);
      return extractPdfMetadata(apiKey, GEMINI_TRANSLATION_FALLBACK_MODEL, imagesBase64, signal);
    }
    log.error("Errore estrazione metadati PDF", e);
    return {};
  }
};
