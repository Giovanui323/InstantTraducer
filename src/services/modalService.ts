/**
 * modalService.ts
 *
 * Modal (GLM-5.1) provider — OpenAI-compatible API format.
 * Base URL: https://api.us-west-2.modal.direct/v1/chat/completions
 * Model: zai-org/GLM-5.1-FP8
 * Auth: Bearer token
 *
 * Critical constraint: Modal accepts strictly 1 request at a time.
 * All requests go through ModalConcurrencyManager to serialize access.
 */

import { TranslationResult, PDFMetadata } from '../types';
import { log } from './logger';
import { cleanTranslationText } from './textClean';
import { retry, withTimeout } from '../utils/async';
import { safeParseJsonObject } from '../utils/json';
import { getOpenAITranslateSystemPrompt, getOpenAITranslateUserInstruction } from './prompts/openai';
import { getMetadataExtractionPrompt } from './prompts/shared';
import { getVerifyQualitySystemPrompt } from './verifierPrompts';
import { AI_VERIFICATION_TIMEOUT_MS } from '../constants';
import { trackUsage } from './usageTracker';
import { modalConcurrency } from './ModalConcurrencyManager';

const MODAL_BASE_URL = 'https://api.us-west-2.modal.direct/v1/chat/completions';
const MODAL_MODEL = 'zai-org/GLM-5.1-FP8';

const normalizeModalError = (e: any): Error => {
  if (e?.name === 'AbortError' || e?.message?.includes('aborted')) {
    return new Error('Operazione annullata');
  }
  if (e?.message?.includes('502')) {
    return new Error('Modal: Errore 502 (Bad Gateway). Caricamento modello (Cold Start) in corso, attendere...');
  }
  if (e?.message?.includes('413')) {
    return new Error('Modal: Errore 413 (Payload Too Large). L\'immagine inviata è troppo grande per il gateway.');
  }
  if (e?.message?.includes('503') || e?.message?.includes('Service Unavailable')) {
    return new Error('Modal temporaneamente non disponibile (503). Riprova più tardi.');
  }
  if (e?.message?.includes('429')) {
    return new Error('Modal: troppe richieste. Il sistema accetta solo 1 richiesta alla volta.');
  }
  return e instanceof Error ? e : new Error(String(e));
};

export const translateWithModal = async (
  imageBase64: string,
  pageNumber: number,
  sourceLanguage: string,
  previousContext: string,
  prevPageImageBase64: string | undefined,
  prevPageNumber: number | undefined,
  nextPageImageBase64: string | undefined,
  nextPageNumber: number | undefined,
  apiKey: string,
  extraInstruction?: string,
  onProgress?: (text: string) => void,
  signal?: AbortSignal,
  legalContext?: boolean,
  customPrompt?: string,
  skipPostProcessing?: boolean
): Promise<TranslationResult> => {
  if (!apiKey) throw new Error('API Key Modal mancante');

  const startedAt = performance.now();
  const isRetry = Boolean(extraInstruction && extraInstruction.trim().length > 0);
  const systemPrompt = getOpenAITranslateSystemPrompt(sourceLanguage, previousContext, legalContext ?? true, isRetry, customPrompt);

  if (onProgress) onProgress(`In attesa slot Modal (1 richiesta alla volta)...`);

  // Acquire single-request slot
  await modalConcurrency.acquire(`translate-p${pageNumber}`);

  try {
    if (onProgress) onProgress(`Slot acquisito. Preparazione richiesta Modal (${MODAL_MODEL})`);
    log.wait(`[MODAL-TRANSLATION] Richiesta (${MODAL_MODEL})...`, {
      imageKB: Math.round((imageBase64.length * 3 / 4) / 1024),
      previousContextChars: previousContext?.length || 0,
      aborted: Boolean(signal?.aborted)
    });

    const runAttempt = async (instruction: string): Promise<{ text: string }> => {
      try {
        // [FIX 413] Rimosse le immagini delle pagine adiacenti (prev/next) per Modal,
        // al fine di evitare il blocco per payload troppo pesante (> 1MB)
        const messages = [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: instruction },
              { type: 'text', text: `PAGINA DA TRADURRE: Pagina ${pageNumber}` },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
            ]
          }
        ];

        const response = await fetch(MODAL_BASE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          signal,
          body: JSON.stringify({ model: MODAL_MODEL, messages, max_tokens: 8192 })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = errorData?.error?.message || response.statusText || 'Errore sconosciuto';
          log.error('Errore API Modal', { status: response.status, message: errorMsg });
          throw new Error(`Errore API Modal: ${errorMsg} (status ${response.status})`);
        }

        const data = await response.json();

        if (data.usage) {
          trackUsage(MODAL_MODEL, data.usage.prompt_tokens || 0, data.usage.completion_tokens || 0);
        }

        const text = data.choices?.[0]?.message?.content || '';
        if (!text) throw new Error('Risposta vuota');
        return { text };
      } catch (e: any) {
        if (e?.name === 'AbortError') throw e;
        log.error('Errore rete durante chiamata Modal', e);
        throw e;
      }
    };

    const baseInstruction = getOpenAITranslateUserInstruction(pageNumber, sourceLanguage);
    const effectiveInstruction = extraInstruction?.trim()
      ? `${baseInstruction}\n\n${extraInstruction.trim()}`
      : baseInstruction;

    const result = await retry(
      () => runAttempt(effectiveInstruction),
      4,      // 4 tentativi (al posto di 2) per dare tempo al Cold Start
      15000,  // 15 secondi tra un tentativo e l'altro per il 502

      (err, attempt) => {
        if (onProgress) onProgress(`Errore temporaneo Modal, tentativo ${attempt}/4... (502/413)`);
        log.warning(`Ritento Modal (attempt ${attempt})`, err);
      },
      (err) => {
        const msg = String((err as any)?.message || '');
        return !msg.includes('aborted') && !msg.includes('annullat');
      }
    );

    const elapsedMs = Math.round(performance.now() - startedAt);
    if (onProgress) onProgress(`Output pronto: ${result.text.length} caratteri (tempo: ${elapsedMs}ms)`);
    log.success(`Completata traduzione pagina ${pageNumber} con Modal`, { elapsedMs, chars: result.text.length });

    if (skipPostProcessing) {
      return { text: result.text || '', annotations: [], modelUsed: MODAL_MODEL };
    }

    const cleaned = cleanTranslationText(result.text || '');
    return { text: cleaned, annotations: [], modelUsed: MODAL_MODEL };
  } finally {
    modalConcurrency.release(`translate-p${pageNumber}`);
  }
};

export const verifyTranslationQualityWithModal = async (params: {
  apiKey: string;
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
  const { apiKey, pageNumber, imageBase64, translatedText, prevPageImageBase64, prevPageNumber, nextPageImageBase64, nextPageNumber, signal, legalContext = true, sourceLanguage = 'Tedesco', customPrompt } = params;
  if (!apiKey) throw new Error('API Key Modal mancante');

  const systemPrompt = (customPrompt && customPrompt.trim().length > 0)
    ? customPrompt
    : getVerifyQualitySystemPrompt(legalContext, sourceLanguage);

  await modalConcurrency.acquire(`verify-p${pageNumber}`);
  try {
    // [FIX 413] Come per la traduzione, rimossi i contesti visivi adiacenti per evitare l'errore Payload Too Large di Modal
    const content: any[] = [
      { type: 'text', text: `PAGINA DA VERIFICARE: Pagina ${pageNumber}` },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
      { type: 'text', text: `TRADUZIONE DA REVISIONARE:\n"""\n${translatedText.slice(0, 10000)}\n"""` }
    ];

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content }
    ];

    const data = await withTimeout(
      (async () => {
        const response = await fetch(MODAL_BASE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          signal,
          body: JSON.stringify({ model: MODAL_MODEL, messages, response_format: { type: 'json_object' }, max_tokens: 4096 })
        });
        if (!response.ok) {
          const e = await response.json().catch(() => ({}));
          throw new Error(`Errore API Modal: ${e?.error?.message || response.statusText}`);
        }
        const json = await response.json();
        if (json.usage) trackUsage(MODAL_MODEL, json.usage.prompt_tokens || 0, json.usage.completion_tokens || 0);
        return json;
      })(),
      AI_VERIFICATION_TIMEOUT_MS,
      () => log.warning(`Timeout verifica qualità Modal per pagina ${pageNumber}`)
    );

    const rawJson = data.choices?.[0]?.message?.content || '{}';
    const parsed = safeParseJsonObject(rawJson);

    return {
      severity: parsed.severity || 'ok',
      summary: parsed.summary || '',
      evidence: parsed.evidence || [],
      annotations: parsed.annotations || [],
      retryHint: parsed.retryHint || undefined
    };
  } finally {
    modalConcurrency.release(`verify-p${pageNumber}`);
  }
};

export const testModalConnection = async (apiKey: string, signal?: AbortSignal): Promise<{ success: boolean; message: string }> => {
  if (!apiKey) throw new Error('API Key Modal mancante');
  try {
    log.info('Test connessione Modal...');
    await modalConcurrency.acquire('test');
    try {
      const response = await fetch(MODAL_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        signal,
        body: JSON.stringify({
          model: MODAL_MODEL,
          messages: [{ role: 'user', content: "Ciao Modal, esegui un test di connettività. Rispondi con una breve frase di conferma." }],
          max_tokens: 150, // Aumentato per permettere ai modelli reasoning di ultimare il pensiero
          temperature: 0.7
        })
      });
      if (!response.ok) {
        const e = await response.json().catch(() => ({}));
        return { success: false, message: `Errore Modal: ${e?.error?.message || response.statusText}` };
      }
      const data = await response.json();
      
      const messageObj = data.choices?.[0]?.message;
      const contentText = messageObj?.content || '';
      const reasoningText = messageObj?.reasoning_content || '';
      
      if (!contentText && !reasoningText) {
        log.error('Risposta vuota da Modal', { fullData: JSON.stringify(data) });
        return { success: false, message: 'Risposta vuota da Modal (controlla i log per info).' };
      }

      // Se produce del testo normale (content)
      if (contentText.trim().length > 0) {
        log.success(`Test Modal riuscito: "${contentText.trim()}"`);
        return { success: true, message: `Connessione Modal riuscita: "${contentText.trim()}"` };
      }
      
      // Se si ferma al reasoning (es. timeout length sui token) lo consideriamo comunque una connessione valida
      if (reasoningText.trim().length > 0) {
        log.success(`Test Modal riuscito (ragionamento in corso): "${reasoningText.substring(0, 50)}..."`);
        return { success: true, message: `Connessione Modal riuscita (modello reasoning).` };
      }

      return { success: false, message: 'Risposta vuota da Modal dopo il trim.' };
    } finally {
      modalConcurrency.release('test');
    }
  } catch (error: any) {
    log.error('Test connessione Modal fallito', error);
    return { success: false, message: error.message || 'Errore sconosciuto.' };
  }
};

export const extractPdfMetadataWithModal = async (
  apiKey: string,
  imagesBase64: string[],
  signal?: AbortSignal,
  targetLanguage?: string,
  customPrompt?: string
): Promise<Partial<PDFMetadata>> => {
  if (!apiKey) throw new Error('API Key Modal mancante');
  const prompt = (customPrompt && customPrompt.trim().length > 0) ? customPrompt : getMetadataExtractionPrompt(targetLanguage);
  const content: any[] = [{ type: 'text', text: prompt }];
  imagesBase64.forEach((img, i) => {
    content.push({ type: 'text', text: `Immagine ${i + 1}:` });
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}` } });
  });

  await modalConcurrency.acquire('metadata');
  try {
    log.info('[MODAL-METADATA] Estrazione info PDF...');
    const response = await fetch(MODAL_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      signal,
      body: JSON.stringify({ model: MODAL_MODEL, messages: [{ role: 'user', content }], response_format: { type: 'json_object' }, max_tokens: 1024 })
    });
    if (!response.ok) {
      const e = await response.json().catch(() => ({}));
      throw new Error(`Errore API Modal: ${e?.error?.message || response.statusText}`);
    }
    const data = await response.json();
    if (data.usage) trackUsage(MODAL_MODEL, data.usage.prompt_tokens || 0, data.usage.completion_tokens || 0);
    const rawJson = data.choices?.[0]?.message?.content || '{}';
    const parsed = safeParseJsonObject(rawJson);
    return {
      year: typeof parsed?.year === 'string' ? parsed.year.trim() : typeof parsed?.year === 'number' ? String(parsed.year) : '0000',
      author: typeof parsed?.author === 'string' ? parsed.author.trim() : 'Unknown',
      title: typeof parsed?.title === 'string' ? parsed.title.trim() : 'Untitled'
    };
  } catch (e) {
    log.error('Errore estrazione metadati PDF con Modal', e);
    return {};
  } finally {
    modalConcurrency.release('metadata');
  }
};
