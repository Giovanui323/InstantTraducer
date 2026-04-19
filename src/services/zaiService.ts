/**
 * zaiService.ts
 *
 * Z.ai Ufficiale (Zhipu AI) provider.
 * API Key format: {API Key ID}.{secret}
 * Authentication: JWT token generated from id + secret using HMAC-SHA256.
 * Endpoint: https://open.bigmodel.cn/api/paas/v4/chat/completions
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

const ZAI_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

// --- JWT Generation for Zhipu AI ---

function base64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function arrayBufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateZaiToken(apiKey: string): Promise<string> {
  const parts = apiKey.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Formato API Key Z.ai non valido. Richiesto: {id}.{secret}');
  }
  const [id, secret] = parts;
  const now = Date.now();
  const header = base64urlEncode(JSON.stringify({ alg: 'HS256', sign_type: 'SIGN' }));
  const payload = base64urlEncode(JSON.stringify({
    api_key: id,
    exp: now + 3600 * 1000,
    timestamp: now
  }));

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${arrayBufferToBase64url(signature)}`;
}

// --- Internal fetch helper ---

const zaiFetch = async (apiKey: string, body: any, signal?: AbortSignal) => {
  const token = await generateZaiToken(apiKey);
  return fetch(ZAI_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    signal,
    body: JSON.stringify(body)
  });
};

const normalizeZaiError = (e: any): Error => {
  if (e?.name === 'AbortError' || e?.message?.includes('aborted')) {
    return new Error('Operazione annullata');
  }
  if (e?.message?.includes('429')) {
    return new Error('Quota Z.ai esaurita');
  }
  return e instanceof Error ? e : new Error(String(e));
};

// --- Translation ---

export const translateWithZai = async (
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
  if (!apiKey) throw new Error('API Key Z.ai mancante');

  const startedAt = performance.now();
  const isRetry = Boolean(extraInstruction && extraInstruction.trim().length > 0);
  const systemPrompt = getOpenAITranslateSystemPrompt(sourceLanguage, previousContext, legalContext ?? true, isRetry, customPrompt, model);

  if (onProgress) onProgress(`Preparazione richiesta Z.ai (${model})`);
  log.wait(`[ZAI-TRANSLATION] Richiesta (${model})...`, {
    imageKB: Math.round((imageBase64.length * 3 / 4) / 1024),
    previousContextChars: previousContext?.length || 0
  });

  const runAttempt = async (instruction: string): Promise<{ text: string }> => {
    try {
      const messages = [
        { role: 'system', content: systemPrompt },
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

      const response = await zaiFetch(apiKey, { model, messages, max_tokens: 8192 }, signal);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData?.error?.message || response.statusText || 'Errore sconosciuto';
        log.error('Errore API Z.ai', { status: response.status, message: errorMsg });
        throw new Error(`Errore API Z.ai: ${errorMsg} (status ${response.status})`);
      }

      const data = await response.json();
      if (data.usage) trackUsage(model, data.usage.prompt_tokens || 0, data.usage.completion_tokens || 0);
      const text = data.choices?.[0]?.message?.content || '';
      if (!text) throw new Error('Risposta vuota');
      return { text };
    } catch (e: any) {
      if (e?.name === 'AbortError') throw e;
      log.error('Errore rete durante chiamata Z.ai', e);
      throw e;
    }
  };

  const baseInstruction = getOpenAITranslateUserInstruction(pageNumber, sourceLanguage);
  const effectiveInstruction = extraInstruction?.trim()
    ? `${baseInstruction}\n\n${extraInstruction.trim()}`
    : baseInstruction;

  try {
    const result = await retry(
      () => runAttempt(effectiveInstruction),
      2,
      3000,
      (err, attempt) => {
        if (onProgress) onProgress(`Errore temporaneo Z.ai, tentativo ${attempt}/2...`);
        log.warning(`Ritento Z.ai (attempt ${attempt})`, err);
      },
      (err) => {
        const msg = String((err as any)?.message || '');
        return !msg.includes('aborted') && !msg.includes('annullat');
      }
    );

    const elapsedMs = Math.round(performance.now() - startedAt);
    if (onProgress) onProgress(`Output pronto: ${result.text.length} caratteri (tempo: ${elapsedMs}ms)`);
    log.success(`Completata traduzione pagina ${pageNumber} con Z.ai`, { elapsedMs, chars: result.text.length, model });

    if (skipPostProcessing) {
      return { text: result.text || '', annotations: [], modelUsed: model };
    }

    const cleaned = cleanTranslationText(result.text || '');
    return { text: cleaned, annotations: [], modelUsed: model };
  } catch (error) {
    throw normalizeZaiError(error);
  }
};

// --- Verification ---

export const verifyTranslationQualityWithZai = async (params: {
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
  const { apiKey, verifierModel, pageNumber, imageBase64, translatedText, prevPageImageBase64, prevPageNumber, nextPageImageBase64, nextPageNumber, signal, legalContext = true, sourceLanguage = 'Tedesco', customPrompt } = params;
  if (!apiKey) throw new Error('API Key Z.ai mancante');

  const systemPrompt = (customPrompt && customPrompt.trim().length > 0)
    ? customPrompt
    : getVerifyQualitySystemPrompt(legalContext, sourceLanguage);

  const content: any[] = [
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
    { type: 'text', text: `TRADUZIONE DA REVISIONARE:\n"""\n${translatedText.slice(0, 10000)}\n"""` }
  ];

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content }
  ];

  let data;
  try {
    data = await withTimeout(
      (async () => {
        const response = await zaiFetch(apiKey, {
          model: verifierModel,
          messages,
          response_format: { type: 'json_object' },
          max_tokens: 4096
        }, signal);
        if (!response.ok) {
          const e = await response.json().catch(() => ({}));
          throw new Error(`Errore API Z.ai: ${e?.error?.message || response.statusText}`);
        }
        const json = await response.json();
        if (json.usage) trackUsage(verifierModel, json.usage.prompt_tokens || 0, json.usage.completion_tokens || 0);
        return json;
      })(),
      AI_VERIFICATION_TIMEOUT_MS,
      () => log.warning(`Timeout verifica qualità Z.ai per pagina ${pageNumber}`)
    );
  } catch (error) {
    throw normalizeZaiError(error);
  }

  const rawJson = data.choices?.[0]?.message?.content || '{}';
  const parsed = safeParseJsonObject(rawJson);
  return {
    severity: parsed.severity || 'ok',
    summary: parsed.summary || '',
    evidence: parsed.evidence || [],
    annotations: parsed.annotations || [],
    retryHint: parsed.retryHint || undefined
  };
};

// --- Test Connection ---

export const testZaiConnection = async (apiKey: string, model: string, signal?: AbortSignal): Promise<{ success: boolean; message: string }> => {
  if (!apiKey) throw new Error('API Key Z.ai mancante');
  if (!apiKey.includes('.')) return { success: false, message: 'Formato API Key non valido. Richiesto: {id}.{secret}' };
  try {
    log.info(`Test connessione Z.ai (${model})...`);
    const response = await zaiFetch(apiKey, {
      model,
      messages: [{ role: 'user', content: "Traduci 'Hello World' in Italiano. Rispondi SOLO con la traduzione." }],
      max_tokens: 10
    }, signal);
    if (!response.ok) {
      const e = await response.json().catch(() => ({}));
      return { success: false, message: `Errore Z.ai: ${e?.error?.message || response.statusText}` };
    }
    const data = await response.json();

    // Track usage for connection test
    if (data.usage) {
      const { prompt_tokens, completion_tokens } = data.usage;
      trackUsage(model, prompt_tokens || 0, completion_tokens || 0);
    }

    const text = data.choices?.[0]?.message?.content || '';
    if (text.trim().length > 0) {
      log.success(`Test Z.ai riuscito: "${text.trim()}"`);
      return { success: true, message: `Connessione Z.ai riuscita: "${text.trim()}"` };
    }
    return { success: false, message: 'Risposta vuota da Z.ai.' };
  } catch (error: any) {
    log.error('Test connessione Z.ai fallito', error);
    return { success: false, message: error.message || 'Errore sconosciuto.' };
  }
};

// --- Metadata Extraction ---

export const extractPdfMetadataWithZai = async (
  apiKey: string,
  model: string,
  imagesBase64: string[],
  signal?: AbortSignal,
  targetLanguage?: string,
  customPrompt?: string
): Promise<Partial<PDFMetadata>> => {
  if (!apiKey) throw new Error('API Key Z.ai mancante');
  const prompt = (customPrompt && customPrompt.trim().length > 0) ? customPrompt : getMetadataExtractionPrompt(targetLanguage);
  const content: any[] = [{ type: 'text', text: prompt }];
  imagesBase64.forEach((img, i) => {
    content.push({ type: 'text', text: `Immagine ${i + 1}:` });
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}` } });
  });

  try {
    log.info(`[ZAI-METADATA] Estrazione info PDF (${model})...`);
    const response = await zaiFetch(apiKey, {
      model,
      messages: [{ role: 'user', content }],
      response_format: { type: 'json_object' },
      max_tokens: 1024
    }, signal);
    if (!response.ok) {
      const e = await response.json().catch(() => ({}));
      throw new Error(`Errore API Z.ai: ${e?.error?.message || response.statusText}`);
    }
    const data = await response.json();
    if (data.usage) trackUsage(model, data.usage.prompt_tokens || 0, data.usage.completion_tokens || 0);
    const rawJson = data.choices?.[0]?.message?.content || '{}';
    const parsed = safeParseJsonObject(rawJson);
    return {
      year: typeof parsed?.year === 'string' ? parsed.year.trim() : typeof parsed?.year === 'number' ? String(parsed.year) : '0000',
      author: typeof parsed?.author === 'string' ? parsed.author.trim() : 'Unknown',
      title: typeof parsed?.title === 'string' ? parsed.title.trim() : 'Untitled'
    };
  } catch (e) {
    log.error('Errore estrazione metadati PDF con Z.ai', e);
    return {};
  }
};
