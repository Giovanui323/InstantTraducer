
import { TranslationResult, OpenAIModel, ReasoningEffort, VerbosityLevel, PDFMetadata } from "../types";
import { log } from "./logger";
import { cleanTranslationText } from "./textClean";
import { looksLikeItalian } from "./aiUtils";
import { retry, withTimeout } from "../utils/async";
import { safeParseJsonObject } from "../utils/json";
import { getOpenAITranslateSystemPrompt, getOpenAITranslateUserInstruction, getOpenAIVerifyQualitySystemPrompt } from './prompts/openai';
import { getMetadataExtractionPrompt } from './prompts/shared';
import { AI_VERIFICATION_TIMEOUT_MS } from "../constants";
import { trackUsage } from "./usageTracker";

const normalizeOpenAIError = (e: any): Error => {
  if (e?.name === 'AbortError' || e?.message?.includes('aborted')) {
    return new Error("Operazione annullata");
  }
  if (e?.message?.includes('429') || e?.message?.includes('Quota')) {
    return new Error("Quota OpenAI esaurita");
  }
  return e instanceof Error ? e : new Error(String(e));
};

export const translateWithOpenAI = async (
  imageBase64: string,
  pageNumber: number,
  sourceLanguage: string,
  previousContext: string,
  prevPageImageBase64: string | undefined,
  prevPageNumber: number | undefined,
  nextPageImageBase64: string | undefined,
  nextPageNumber: number | undefined,
  apiKey: string,
  model: OpenAIModel,
  effort: ReasoningEffort,
  verbosity: VerbosityLevel,
  extraInstruction?: string,
  onProgress?: (text: string) => void,
  signal?: AbortSignal,
  legalContext?: boolean,
  customPrompt?: string,
  skipPostProcessing?: boolean
): Promise<TranslationResult> => {
  if (!apiKey) throw new Error("API Key mancante");
  const startedAt = performance.now();
  const imageBytesApprox = Math.floor((imageBase64.length * 3) / 4);
  const isRetry = Boolean(extraInstruction && extraInstruction.trim().length > 0);
  const systemPrompt = getOpenAITranslateSystemPrompt(sourceLanguage, previousContext, legalContext ?? true, isRetry, customPrompt, model);

  if (onProgress) onProgress(`Preparazione richiesta OpenAI (${model})`);
  log.wait(`[OPENAI-TRANSLATION] Richiesta (${model})...`, {
    effort,
    verbosity,
    imageKB: Math.round(imageBytesApprox / 1024),
    systemPromptChars: systemPrompt.length,
    previousContextChars: previousContext?.length || 0,
    aborted: Boolean(signal?.aborted)
  });

  const runAttempt = async (instruction: string): Promise<{ text: string; requestId?: string }> => {
    let response: Response;
    try {
      const isO1 = model.startsWith('o1-') || model.startsWith('o3-');
      const messages = [
        { role: isO1 ? 'developer' : 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
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
          ]
        }
      ];

      const body: any = {
        model: model,
        messages: messages,
      };

      if (isO1) {
        if (effort && effort !== 'none') body.reasoning_effort = effort;
      }

      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        signal,
        body: JSON.stringify(body)
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        log.warning("Richiesta OpenAI annullata (AbortError).");
        throw e;
      }
      log.error("Errore rete durante chiamata OpenAI", e);
      throw e;
    }

    const requestId =
      response.headers.get('x-request-id') ||
      response.headers.get('openai-request-id') ||
      response.headers.get('x-openai-request-id') ||
      undefined;
    if (onProgress) onProgress(`Risposta HTTP ricevuta (status: ${response.status}${requestId ? `, request_id: ${requestId}` : ''})`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || response.statusText || "Errore sconosciuto";
      log.error("Errore API OpenAI", { 
        status: response.status, 
        statusText: response.statusText, 
        requestId, 
        message: errorMsg,
        body: errorData 
      });
      throw new Error(`Errore API OpenAI: ${errorMsg} (status ${response.status})`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    
    // Track usage
    if (data.usage) {
      const { prompt_tokens, completion_tokens } = data.usage;
      trackUsage(model, prompt_tokens || 0, completion_tokens || 0);
    }
    
    if (!text) throw new Error("Risposta vuota");
    return { text, requestId };
  };

  const baseInstruction = getOpenAITranslateUserInstruction(pageNumber, sourceLanguage);
  // CLEAN RETRY: istruzione minimale per evitare duplicazione contesto
  const effectiveInstruction = extraInstruction?.trim() 
    ? `Ritraduci la pagina ${pageNumber} dal ${sourceLanguage} all'italiano.\n\n${extraInstruction.trim()}`
    : baseInstruction;

  try {
    const data = await retry(
      () => runAttempt(effectiveInstruction),
      3,
      2000,
      (err, attempt) => {
        log.warning(`[OPENAI] Errore temporaneo pagina ${pageNumber}, tentativo ${attempt}/3...`, err);
      }
    );
    
    if (onProgress) onProgress(`Output pronto: ${data.text.length} caratteri (tempo: ${Math.round(performance.now() - startedAt)}ms)`);

    if (skipPostProcessing) {
      return { text: data.text || "", annotations: [], modelUsed: model, diagnosticPrompt: systemPrompt, diagnosticUserInstruction: effectiveInstruction };
    }

    const cleaned1 = cleanTranslationText(data.text || "");
    const cleaned2 = cleaned1.replace(/^(Ecco la traduzione della pagina \d+:?\s*)/i, '');

    return { text: cleaned2, annotations: [], modelUsed: model, diagnosticPrompt: systemPrompt, diagnosticUserInstruction: effectiveInstruction };
  } catch (error) {
    throw normalizeOpenAIError(error);
  }
};

export const verifyTranslationQualityWithOpenAI = async (params: {
  apiKey: string;
  verifierModel: OpenAIModel;
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
  const { apiKey, verifierModel, pageNumber, imageBase64, translatedText, prevPageImageBase64, prevPageNumber, nextPageImageBase64, nextPageNumber, signal, legalContext = true, sourceLanguage = "Tedesco", customPrompt } = params;
  if (!apiKey) throw new Error("API Key mancante");

  const prompt = customPrompt && customPrompt.trim().length > 0 
    ? customPrompt 
    : getOpenAIVerifyQualitySystemPrompt(legalContext, sourceLanguage);

  const isO1 = verifierModel.startsWith('o1-') || verifierModel.startsWith('o3-');
  const messages = [
    { role: isO1 ? 'developer' : 'system', content: prompt },
    {
      role: 'user',
      content: [
        ...(prevPageImageBase64 && prevPageNumber
          ? [
              { type: 'text', text: `CONTESTO (NON TRADURRE): Pagina precedente ${prevPageNumber}` },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${prevPageImageBase64}` } }
            ]
          : []),
        { type: 'text', text: `PAGINA DA VERIFICARE: Pagina ${pageNumber}` },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        ...(nextPageImageBase64 && nextPageNumber
          ? [
              { type: 'text', text: `CONTESTO (NON TRADURRE): Pagina successiva ${nextPageNumber}` },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${nextPageImageBase64}` } }
            ]
          : []),
        { type: 'text', text: `TRADUZIONE DA REVISIONARE (DEVE CONTENERE SOLO LA PAGINA ${pageNumber}):\n"""\n${translatedText.slice(0, 10000)}\n"""` }
      ]
    }
  ];

  // Handshake & Stalled Detection
  const STALLED_TIMEOUT_MS = 30000;
  const stalledTimer = setTimeout(() => {
    log.warning(`[OPENAI-STALLED] QUALITY_CHECK_STALLED: Nessuna risposta da ${STALLED_TIMEOUT_MS/1000}s per pagina ${pageNumber}`);
  }, STALLED_TIMEOUT_MS);

  log.info(`[OPENAI-HANDSHAKE] Invio richiesta verifica pagina ${pageNumber}...`);

  let data;
  try {
    data = await withTimeout(
      (async () => {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          signal,
          body: JSON.stringify({
            model: verifierModel,
            messages,
            ...(isO1 ? {} : { response_format: { type: "json_object" } })
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`Errore API OpenAI: ${errorData?.error?.message || response.statusText}`);
        }

        const resData = await response.json();
        
        // Track usage
        if (resData.usage) {
          const { prompt_tokens, completion_tokens } = resData.usage;
          trackUsage(verifierModel, prompt_tokens || 0, completion_tokens || 0);
        }
        
        return resData;
      })(),
      AI_VERIFICATION_TIMEOUT_MS,
      () => log.warning(`Timeout verifica qualità OpenAI per pagina ${pageNumber} (${AI_VERIFICATION_TIMEOUT_MS}ms)`)
    );
    log.info(`[OPENAI-HANDSHAKE] Risposta ricevuta per pagina ${pageNumber}.`);
  } catch (error) {
    throw normalizeOpenAIError(error);
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

export const testOpenAIConnection = async (apiKey: string, model: OpenAIModel, signal?: AbortSignal): Promise<{ success: boolean; message: string }> => {
  if (!apiKey) throw new Error("API Key mancante");

  try {
    log.info(`Test funzionalità OpenAI (${model})...`);
      const isO1 = model.startsWith('o1-') || model.startsWith('o3-');
      const body: any = {
        model: model,
        messages: [
          { role: 'user', content: "Traduci 'Hello World' in Italiano. Rispondi SOLO con la traduzione." }
        ]
      };

      if (isO1) {
        body.max_completion_tokens = 10;
      } else {
        body.max_tokens = 10;
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        signal,
        body: JSON.stringify(body)
      });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || response.statusText || "Errore sconosciuto";
      return { success: false, message: `Errore OpenAI: ${errorMsg}` };
    }

    const data = await response.json();

    // Track usage for connection test
    if (data.usage) {
      const { prompt_tokens, completion_tokens } = data.usage;
      trackUsage(model, prompt_tokens || 0, completion_tokens || 0);
    }

    const text = data.choices?.[0]?.message?.content || "";

    if (text && text.trim().length > 0) {
      log.success(`Test OpenAI riuscito: "${text.trim()}"`);
      return { success: true, message: `Connessione riuscita: "${text.trim()}"` };
    }
    return { success: false, message: "Risposta vuota o non valida dall'API." };
  } catch (error: any) {
    log.error("Test connessione OpenAI fallito", error);
    return { success: false, message: error.message || "Errore sconosciuto durante il test." };
  }
};

/**
 * Estrae i metadati PDF usando OpenAI.
 */
export const extractPdfMetadataWithOpenAI = async (
  apiKey: string,
  model: OpenAIModel,
  imagesBase64: string[],
  signal?: AbortSignal,
  targetLanguage?: string,
  customPrompt?: string
): Promise<Partial<PDFMetadata>> => {
  if (!apiKey) throw new Error("API Key mancante");

  const prompt = customPrompt && customPrompt.trim().length > 0 ? customPrompt : getMetadataExtractionPrompt(targetLanguage);
  const isO1 = model.startsWith('o1-') || model.startsWith('o3-');
  const messages = [
    { role: isO1 ? 'developer' : 'system', content: prompt },
    {
      role: 'user',
      content: imagesBase64.map((img, i) => ([
        { type: 'text', text: `Immagine ${i + 1}:` },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}` } }
      ])).flat()
    }
  ];

  try {
    log.info(`[OPENAI-METADATA] Estrazione info PDF (${model})...`);
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      signal,
      body: JSON.stringify({
        model: model,
        messages,
        ...(isO1 ? {} : { response_format: { type: "json_object" } })
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Errore API OpenAI: ${errorData?.error?.message || response.statusText}`);
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
    log.error("Errore estrazione metadati PDF con OpenAI", e);
    return {};
  }
};
