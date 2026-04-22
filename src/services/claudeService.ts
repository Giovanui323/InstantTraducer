import { TranslationResult, ClaudeModel, PDFMetadata } from "../types";
import Anthropic from "@anthropic-ai/sdk";
import { log } from "./logger";
import { cleanTranslationText } from "./textClean";
import { retry, withTimeout } from "../utils/async";
import { safeParseJsonObject } from "../utils/json";
import { getClaudeTranslateSystemPromptBlocks, getClaudeTranslateUserInstruction, getClaudeAssistantPrefill } from './prompts/claude';
import { getMetadataExtractionPrompt, buildRetryInstruction } from './prompts/shared';
import { getVerifyQualitySystemPrompt } from "./verifierPrompts";
import { AI_VERIFICATION_TIMEOUT_MS } from "../constants";
import { trackUsage } from "./usageTracker";

const normalizeClaudeError = (e: any): Error => {
  if (e?.name === 'AbortError' || e?.message?.includes('aborted')) {
    return new Error("Operazione annullata");
  }
  if (e?.status === 429 || e?.message?.includes('429') || e?.message?.includes('Quota')) {
    return new Error("Quota Claude esaurita");
  }
  return e instanceof Error ? e : new Error(String(e));
};

export const translateWithClaude = async (
  imageBase64: string,
  pageNumber: number,
  sourceLanguage: string,
  previousContext: string,
  prevPageImageBase64: string | undefined,
  prevPageNumber: number | undefined,
  nextPageImageBase64: string | undefined,
  nextPageNumber: number | undefined,
  apiKey: string,
  model: ClaudeModel,
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
  const retryReason = isRetry ? extraInstruction!.trim() : undefined;
  const { stable: systemStable, variable: systemVariable } = getClaudeTranslateSystemPromptBlocks(
    sourceLanguage, previousContext, legalContext ?? true, retryReason, customPrompt, model
  );
  const fullSystemPrompt = systemStable + (systemVariable ? '\n' + systemVariable : '');

  if (onProgress) onProgress(`Preparazione richiesta Claude (${model})`);
  log.wait(`[CLAUDE-TRANSLATION] Richiesta (${model})...`, {
    imageKB: Math.round(imageBytesApprox / 1024),
    systemStableChars: systemStable.length,
    systemVariableChars: systemVariable.length,
    previousContextChars: previousContext?.length || 0,
    aborted: Boolean(signal?.aborted)
  });

  const runAttempt = async (instruction: string): Promise<{ text: string; requestId?: string }> => {
    let messageResponse: Anthropic.Message;
    try {
      const messages: any[] = [];

      const contentBlocks: Anthropic.ContentBlockParam[] = [];
      contentBlocks.push({ type: 'text', text: instruction });

      if (prevPageImageBase64 && prevPageNumber) {
        contentBlocks.push({ type: 'text', text: `[CONTESTO PRECEDENTE] Pagina ${prevPageNumber} — NON tradurre, solo riferimento visivo.` });
        contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: prevPageImageBase64 } });
      }

      contentBlocks.push({ type: 'text', text: `[PAGINA TARGET] Pagina ${pageNumber} — TRADUCI QUESTA.` });
      contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } });

      if (nextPageImageBase64 && nextPageNumber) {
        contentBlocks.push({ type: 'text', text: `[CONTESTO SUCCESSIVO] Pagina ${nextPageNumber} — NON tradurre, solo riferimento visivo.` });
        contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: nextPageImageBase64 } });
      }

      messages.push({ role: 'user', content: contentBlocks });

      const anthropic = new Anthropic({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true
      });

      // Determina se il modello supporta l'Adaptive Thinking (Claude 4.5+, 4.6+)
      const supportsThinking = model.includes('4.5') || model.includes('4.6');

      const assistantPrefill = getClaudeAssistantPrefill();

      // Prompt caching: il prefisso stabile è marcato come ephemeral così Anthropic
      // può riutilizzarlo tra chiamate consecutive nella stessa sessione (TTL ~5 min).
      // Il blocco variable (prevContext + retryMode) cambia per pagina e resta non-cacheato.
      const systemBlocks: Anthropic.TextBlockParam[] = [
        { type: 'text', text: systemStable, cache_control: { type: 'ephemeral' } },
      ];
      if (systemVariable && systemVariable.length > 0) {
        systemBlocks.push({ type: 'text', text: systemVariable });
      }

      const createParams: any = {
        model: model,
        system: systemBlocks,
        messages: [
          ...messages,
          ...(assistantPrefill ? [{ role: 'assistant' as const, content: assistantPrefill }] : []),
        ],
      };

      if (supportsThinking) {
        // Modelli avanzati (Sonnet/Opus 4.5+): abilita Adaptive Thinking e alza i token.
        // temperature: 1 è OBBLIGATORIO quando thinking è abilitato (requisito API Anthropic).
        createParams.max_tokens = 16000;
        createParams.thinking = { type: 'enabled', budget_tokens: 8000 };
        createParams.temperature = 1;
      } else {
        // Haiku e modelli precedenti: chiamata standard senza thinking
        createParams.max_tokens = 8192;
      }

      messageResponse = await anthropic.messages.create(createParams, { signal });
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        log.warning("Richiesta Claude annullata (AbortError).");
        throw e;
      }
      log.error("Errore API Claude", e);
      throw e;
    }

    const requestId = messageResponse.id;
    if (onProgress) onProgress(`Risposta Claude ricevuta (request_id: ${requestId})`);

    if (messageResponse.usage) {
       const usage = messageResponse.usage as Anthropic.Usage & {
         cache_creation_input_tokens?: number | null;
         cache_read_input_tokens?: number | null;
       };
       trackUsage(model, usage.input_tokens || 0, usage.output_tokens || 0);
       const cacheRead = usage.cache_read_input_tokens || 0;
       const cacheCreate = usage.cache_creation_input_tokens || 0;
       if (cacheRead > 0 || cacheCreate > 0) {
         log.info(`[CLAUDE-CACHE] hit=${cacheRead} create=${cacheCreate} input=${usage.input_tokens || 0} output=${usage.output_tokens || 0}`);
       }
    }

    const text = (messageResponse.content?.find(c => c.type === 'text') as Anthropic.TextBlock)?.text || "";
    return { text, requestId };
  };

  const baseInstruction = getClaudeTranslateUserInstruction(pageNumber, sourceLanguage);
  // CLEAN RETRY: quando c'è un extraInstruction (retry dal quality check),
  // usiamo un'istruzione utente minimale per evitare di accumulare contesto
  // duplicato. Il retryReason è già nel system prompt tramite <retry_mode>,
  // quindi qui basta una direttiva breve + le istruzioni di correzione specifiche.
  const effectiveInstruction = extraInstruction?.trim() 
    ? `Ritraduci la pagina ${pageNumber} dal ${sourceLanguage} all'italiano.\n\n${extraInstruction.trim()}`
    : baseInstruction;

  const attempt1 = await retry(
    () => runAttempt(effectiveInstruction),
    2,
    3000,
    (err, attempt) => {
      if (onProgress) onProgress(`Errore temporaneo (Claude), tentativo ${attempt}/2 in corso...`);
      log.warning(`Ritento Claude (attempt ${attempt}) causa errore transiente`, err);
    },
    (err) => {
      const name = String((err as any)?.name || "");
      const msg = String((err as any)?.message || "");
      return name !== "AbortError" && !msg.includes("aborted") && !msg.includes("annullat");
    }
  );
  const elapsedMs = Math.round(performance.now() - startedAt);
  log.recv(`Ricevuta traduzione Claude (${attempt1.text.length} caratteri)`, { elapsedMs, requestId: attempt1.requestId });
  if (onProgress) onProgress(`Output pronto: ${attempt1.text.length} caratteri (tempo: ${elapsedMs}ms)`);

  if (skipPostProcessing) {
    return { text: attempt1.text || "", annotations: [], modelUsed: model, diagnosticPrompt: fullSystemPrompt, diagnosticUserInstruction: effectiveInstruction };
  }

  const cleaned1 = cleanTranslationText(attempt1.text || "");
  if (attempt1.text.length !== cleaned1.length) {
    log.info(`Post-processing Claude: Testo pulito di ${attempt1.text.length - cleaned1.length} caratteri.`);
  }
  return { text: cleaned1, annotations: [], modelUsed: model, diagnosticPrompt: fullSystemPrompt, diagnosticUserInstruction: effectiveInstruction };
};

export const verifyTranslationQualityWithClaude = async (params: {
  apiKey: string;
  verifierModel: ClaudeModel;
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

  const systemPrompt = customPrompt && customPrompt.trim().length > 0 
    ? customPrompt 
    : getVerifyQualitySystemPrompt(legalContext, sourceLanguage);

  const contentBlocks: any[] = [];
  
  if (prevPageImageBase64 && prevPageNumber) {
    contentBlocks.push({ type: 'text', text: `CONTESTO (NON TRADURRE): Pagina precedente ${prevPageNumber}` });
    contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: prevPageImageBase64 } });
  }

  contentBlocks.push({ type: 'text', text: `PAGINA DA VERIFICARE: Pagina ${pageNumber}` });
  contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } });

  if (nextPageImageBase64 && nextPageNumber) {
    contentBlocks.push({ type: 'text', text: `CONTESTO (NON TRADURRE): Pagina successiva ${nextPageNumber}` });
    contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: nextPageImageBase64 } });
  }

  contentBlocks.push({ type: 'text', text: `TRADUZIONE DA REVISIONARE (DEVE CONTENERE SOLO LA PAGINA ${pageNumber}):\n"""\n${translatedText.slice(0, 10000)}\n"""` });
  contentBlocks.push({ type: 'text', text: `Respond ONLY with a valid JSON object. No markdown formatting or extra text.` });

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: contentBlocks }];

  const STALLED_TIMEOUT_MS = 30000;
  const stalledTimer = setTimeout(() => {
    log.warning(`[CLAUDE-STALLED] QUALITY_CHECK_STALLED: Nessuna risposta da ${STALLED_TIMEOUT_MS/1000}s per pagina ${pageNumber}`);
  }, STALLED_TIMEOUT_MS);

  log.info(`[CLAUDE-HANDSHAKE] Invio richiesta verifica pagina ${pageNumber}...`);

  let data;
  try {
    data = await withTimeout(
      (async () => {
        const anthropic = new Anthropic({
          apiKey: apiKey,
          dangerouslyAllowBrowser: true
        });

        return await anthropic.messages.create({
          model: verifierModel,
          max_tokens: 4096,
          // Il verifier prompt è interamente stabile per sessione (dipende solo da
          // legalContext/sourceLanguage): ephemeral caching riduce il costo di ogni pagina.
          system: [
            { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
          ],
          messages: messages
        }, { signal });
      })(),
      AI_VERIFICATION_TIMEOUT_MS,
      () => log.warning(`Timeout verifica qualità Claude per pagina ${pageNumber} (${AI_VERIFICATION_TIMEOUT_MS}ms)`)
    );
    log.info(`[CLAUDE-HANDSHAKE] Risposta ricevuta per pagina ${pageNumber}.`);

    // Track usage
    if (data.usage) {
      const usage = data.usage as Anthropic.Usage & {
        cache_creation_input_tokens?: number | null;
        cache_read_input_tokens?: number | null;
      };
      trackUsage(verifierModel, usage.input_tokens || 0, usage.output_tokens || 0);
      const cacheRead = usage.cache_read_input_tokens || 0;
      const cacheCreate = usage.cache_creation_input_tokens || 0;
      if (cacheRead > 0 || cacheCreate > 0) {
        log.info(`[CLAUDE-VERIFY-CACHE] hit=${cacheRead} create=${cacheCreate} input=${usage.input_tokens || 0} output=${usage.output_tokens || 0}`);
      }
    }
  } finally {
    clearTimeout(stalledTimer);
  }

  const rawJson = (data.content?.find(c => c.type === 'text') as Anthropic.TextBlock)?.text || "{}";
  const parsed = safeParseJsonObject(rawJson);

  return {
    severity: parsed.severity || "ok",
    summary: parsed.summary || "",
    evidence: parsed.evidence || [],
    annotations: parsed.annotations || [],
    retryHint: parsed.retryHint || undefined
  };
};

export const testClaudeConnection = async (apiKey: string, model: ClaudeModel, signal?: AbortSignal): Promise<{ success: boolean; message: string }> => {
  if (!apiKey) throw new Error("API Key mancante");
  try {
    log.info(`Test funzionalità Claude (${model})...`);
    const anthropic = new Anthropic({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true
    });

    const response = await anthropic.messages.create({
      model: model,
      max_tokens: 10,
      messages: [{ role: 'user', content: "Traduci 'Hello World' in Italiano. Rispondi SOLO con la traduzione." }]
    }, { signal });

    // Track usage
    if (response.usage) {
      const { input_tokens, output_tokens } = response.usage;
      trackUsage(model, input_tokens || 0, output_tokens || 0);
    }

    const text = (response.content?.find(c => c.type === 'text') as Anthropic.TextBlock)?.text || "";

    if (text && text.trim().length > 0) {
      log.success(`Test Claude riuscito: "${text.trim()}"`);
      return { success: true, message: `Connessione riuscita: "${text.trim()}"` };
    }
    return { success: false, message: "Risposta vuota o non valida dall'API." };
  } catch (error: any) {
    log.error("Test connessione Claude fallito", error);
    return { success: false, message: error.message || "Errore sconosciuto durante il test." };
  }
};

export const extractPdfMetadataWithClaude = async (
  apiKey: string,
  model: ClaudeModel,
  imagesBase64: string[],
  signal?: AbortSignal,
  targetLanguage?: string,
  customPrompt?: string
): Promise<Partial<PDFMetadata>> => {
  if (!apiKey) throw new Error("API Key mancante");

  const systemPrompt = customPrompt && customPrompt.trim().length > 0 ? customPrompt : getMetadataExtractionPrompt(targetLanguage);
  const contentBlocks: any[] = [];
  
  imagesBase64.forEach((img, i) => {
    contentBlocks.push({ type: 'text', text: `Immagine ${i + 1}:` });
    contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img } });
  });
  contentBlocks.push({ type: 'text', text: `Respond ONLY with a valid JSON object.` });

  try {
    log.info(`[CLAUDE-METADATA] Estrazione info PDF (${model})...`);
    const anthropic = new Anthropic({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true
    });

    const response = await anthropic.messages.create({
      model: model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: contentBlocks }]
    }, { signal });

    // Track usage
    if (response.usage) {
      const { input_tokens, output_tokens } = response.usage;
      trackUsage(model, input_tokens || 0, output_tokens || 0);
    }

    const rawJson = (response.content?.find(c => c.type === 'text') as Anthropic.TextBlock)?.text || "{}";
    const parsed = safeParseJsonObject(rawJson);

    return {
      year: typeof parsed?.year === "string" ? parsed.year.trim() : typeof parsed?.year === "number" ? String(parsed.year) : "0000",
      author: typeof parsed?.author === "string" ? parsed.author.trim() : "Unknown",
      title: typeof parsed?.title === "string" ? parsed.title.trim() : "Untitled"
    };
  } catch (e) {
    log.error("Errore estrazione metadati PDF con Claude", e);
    return {};
  }
};
