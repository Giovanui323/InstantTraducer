
import { TranslationResult, OpenAIModel, ReasoningEffort, VerbosityLevel, PDFMetadata } from "../types";
import { log } from "./logger";
import { cleanTranslationText } from "./textClean";
import { looksLikeItalian } from "./aiUtils";
import { retry } from "../utils/async";
import { safeParseJsonObject } from "../utils/json";
import { 
  getTranslateSystemPrompt, 
  getTranslateUserInstruction, 
  getVerifyQualitySystemPrompt, 
  getMetadataExtractionPrompt 
} from "./prompts";

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
  legalContext?: boolean
): Promise<TranslationResult> => {
  if (!apiKey) throw new Error("API Key mancante");
  const startedAt = performance.now();
  const imageBytesApprox = Math.floor((imageBase64.length * 3) / 4);
  const systemPrompt = getTranslateSystemPrompt(sourceLanguage, previousContext, legalContext ?? true);

  if (onProgress) onProgress(`Preparazione richiesta OpenAI (effort: ${effort}, verbosity: ${verbosity})`);
  log.wait(`Richiesta OpenAI (${model})...`, {
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
    return { text, requestId };
  };

  const baseInstruction = getTranslateUserInstruction(pageNumber, sourceLanguage);
  const effectiveInstruction = extraInstruction?.trim() 
    ? `${baseInstruction}\n\n${extraInstruction.trim()}`
    : baseInstruction;

  const attempt1 = await retry(
    () => runAttempt(effectiveInstruction),
    2,
    3000,
    (err, attempt) => {
      if (onProgress) onProgress(`Errore temporaneo (OpenAI), tentativo ${attempt}/2 in corso...`);
      log.warning(`Ritento OpenAI (attempt ${attempt}) causa errore transiente`, err);
    },
    (err) => {
      const name = String((err as any)?.name || "");
      const msg = String((err as any)?.message || "");
      return name !== "AbortError" && !msg.includes("aborted") && !msg.includes("annullat");
    }
  );
  const elapsedMs = Math.round(performance.now() - startedAt);
  log.recv(`Ricevuta traduzione OpenAI (${attempt1.text.length} caratteri)`, { elapsedMs, requestId: attempt1.requestId });
  if (onProgress) onProgress(`Output pronto: ${attempt1.text.length} caratteri (tempo: ${elapsedMs}ms)`);

  const cleaned1 = cleanTranslationText(attempt1.text || "");
  if (attempt1.text.length !== cleaned1.length) {
    log.info(`Post-processing OpenAI: Testo pulito di ${attempt1.text.length - cleaned1.length} caratteri.`);
  }
  return { text: cleaned1, annotations: [] };
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
}): Promise<any> => {
  const { apiKey, verifierModel, pageNumber, imageBase64, translatedText, prevPageImageBase64, prevPageNumber, nextPageImageBase64, nextPageNumber, signal, legalContext = true } = params;
  if (!apiKey) throw new Error("API Key mancante");

  const prompt = getVerifyQualitySystemPrompt(legalContext);

  const messages = [
    { role: 'system', content: prompt },
    {
      role: 'user',
      content: [
        ...(prevPageImageBase64 && prevPageNumber
          ? [
              { type: 'text', text: `CONTESTO: Pagina precedente ${prevPageNumber}` },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${prevPageImageBase64}` } }
            ]
          : []),
        { type: 'text', text: `PAGINA DA VERIFICARE: Pagina ${pageNumber}` },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        ...(nextPageImageBase64 && nextPageNumber
          ? [
              { type: 'text', text: `CONTESTO: Pagina successiva ${nextPageNumber}` },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${nextPageImageBase64}` } }
            ]
          : []),
        { type: 'text', text: `TRADUZIONE DA REVISIONARE:\n"""\n${translatedText.slice(0, 10000)}\n"""` }
      ]
    }
  ];

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
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    throw new Error(`Errore API OpenAI: ${response.statusText}`);
  }

  const data = await response.json();
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

export const testOpenAIConnection = async (apiKey: string, model: OpenAIModel, signal?: AbortSignal): Promise<boolean> => {
  if (!apiKey) throw new Error("API Key mancante");

  try {
    log.info(`Test funzionalità OpenAI (${model})...`);
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      signal,
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'user', content: "Traduci 'Hello World' in Italiano. Rispondi SOLO con la traduzione." }
        ],
        max_tokens: 10
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || response.statusText || "Errore sconosciuto";
      throw new Error(`Errore API OpenAI: ${errorMsg} (status ${response.status})`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    if (text && text.trim().length > 0) {
      log.success(`Test OpenAI riuscito: "${text.trim()}"`);
      return true;
    }
    return false;
  } catch (error) {
    log.error("Test connessione OpenAI fallito", error);
    throw error;
  }
};

/**
 * Estrae i metadati PDF usando OpenAI.
 */
export const extractPdfMetadataWithOpenAI = async (
  apiKey: string,
  model: OpenAIModel,
  imagesBase64: string[],
  signal?: AbortSignal
): Promise<Partial<PDFMetadata>> => {
  if (!apiKey) throw new Error("API Key mancante");

  const prompt = getMetadataExtractionPrompt();
  const messages = [
    { role: 'system', content: prompt },
    {
      role: 'user',
      content: imagesBase64.map((img, i) => ([
        { type: 'text', text: `Immagine ${i + 1}:` },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}` } }
      ])).flat()
    }
  ];

  try {
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
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      throw new Error(`Errore API OpenAI: ${response.statusText}`);
    }

    const data = await response.json();
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
