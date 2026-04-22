/**
 * customProviderAdapter.ts
 *
 * Dynamic adapter that routes translation/verification/metadata requests
 * to custom providers based on their configured API format.
 *
 * Supported formats:
 * - 'openai'   → OpenAI-compatible (Bearer auth, /chat/completions)
 * - 'anthropic' → Anthropic-compatible (x-api-key, /v1/messages)
 * - 'gemini'   → Gemini-compatible (key param, /v1beta/models/{model}:generateContent)
 * - 'zhipu'    → Zhipu/Z.ai-compatible (JWT Bearer auth, /v4/chat/completions)
 */

import { CustomProviderConfig, TranslationResult, PDFMetadata, ApiFormat } from '../types';
import { log } from './logger';
import { cleanTranslationText } from './textClean';
import { retry, withTimeout } from '../utils/async';
import { safeParseJsonObject } from '../utils/json';
import { getOpenAITranslateSystemPrompt, getOpenAITranslateUserInstruction } from './prompts/openai';
import { getClaudeTranslateSystemPrompt, getClaudeTranslateUserInstruction } from './prompts/claude';
import { getMetadataExtractionPrompt } from './prompts/shared';
import { getVerifyQualitySystemPrompt } from './verifierPrompts';
import { AI_VERIFICATION_TIMEOUT_MS } from '../constants';
import { trackUsage } from './usageTracker';

// --- Per-provider concurrency queues ---

class ProviderConcurrencyQueue {
  private queues = new Map<string, { active: number; waiters: Array<() => void> }>();

  private getQueue(id: string) {
    if (!this.queues.has(id)) {
      this.queues.set(id, { active: 0, waiters: [] });
    }
    return this.queues.get(id)!;
  }

  async acquire(providerId: string, limit: number): Promise<void> {
    const q = this.getQueue(providerId);
    if (q.active < limit) {
      q.active++;
      return;
    }
    return new Promise<void>((resolve) => {
      q.waiters.push(() => {
        q.active++;
        resolve();
      });
    });
  }

  release(providerId: string) {
    const q = this.getQueue(providerId);
    if (q.active > 0) {
      q.active--;
      while (q.active < (q as any).limit && q.waiters.length > 0) {
        const resolver = q.waiters.shift();
        if (resolver) resolver();
      }
    }
  }
}

const concurrencyQueues = new ProviderConcurrencyQueue();

// --- JWT helpers for zhipu format ---

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

async function generateZhipuToken(apiKey: string): Promise<string> {
  const parts = apiKey.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Formato API Key non valido per formato Zhipu. Richiesto: {id}.{secret}');
  }
  const [id, secret] = parts;
  const now = Date.now();
  const header = base64urlEncode(JSON.stringify({ alg: 'HS256', sign_type: 'SIGN' }));
  const payload = base64urlEncode(JSON.stringify({ api_key: id, exp: now + 3600 * 1000, timestamp: now }));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${arrayBufferToBase64url(signature)}`;
}

// --- Format-specific fetch builders ---

async function buildHeaders(config: CustomProviderConfig): Promise<Record<string, string>> {
  const base: Record<string, string> = { 'Content-Type': 'application/json' };

  if (config.apiFormat === 'openai') {
    base['Authorization'] = `Bearer ${config.apiKey}`;
  } else if (config.apiFormat === 'anthropic') {
    base['x-api-key'] = config.apiKey;
    base['anthropic-version'] = '2023-06-01';
  } else if (config.apiFormat === 'zhipu') {
    const token = await generateZhipuToken(config.apiKey);
    base['Authorization'] = `Bearer ${token}`;
  }
  // gemini: key is passed as query param

  return base;
}

function buildUrl(config: CustomProviderConfig): string {
  let url = config.baseUrl.replace(/\/+$/, '');

  if (config.apiFormat === 'openai') {
    if (!url.endsWith('/chat/completions')) url += '/chat/completions';
  } else if (config.apiFormat === 'anthropic') {
    if (!url.endsWith('/messages')) url += '/v1/messages';
  } else if (config.apiFormat === 'gemini') {
    if (!url.includes(':generateContent') && !url.includes(':streamGenerateContent')) {
      url += `/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
    }
  } else if (config.apiFormat === 'zhipu') {
    if (!url.endsWith('/chat/completions')) url += '/chat/completions';
  }

  return url;
}

// --- Format-specific body builders ---

function buildOpenAICompatibleBody(
  config: CustomProviderConfig,
  messages: any[],
  options?: { maxTokens?: number; responseFormat?: any }
): any {
  return {
    model: config.model,
    messages,
    max_tokens: options?.maxTokens || 8192,
    ...(options?.responseFormat ? { response_format: options.responseFormat } : {})
  };
}

function buildAnthropicBody(
  config: CustomProviderConfig,
  systemPrompt: string,
  messages: any[],
  options?: { maxTokens?: number }
): any {
  return {
    model: config.model,
    max_tokens: options?.maxTokens || 8192,
    system: systemPrompt,
    messages
  };
}

function buildGeminiBody(
  config: CustomProviderConfig,
  contents: any[],
  options?: { maxTokens?: number }
): any {
  return {
    contents,
    generationConfig: {
      maxOutputTokens: options?.maxTokens || 8192,
    }
  };
}

// --- Generic fetch executor ---

async function executeRequest(
  config: CustomProviderConfig,
  body: any,
  signal?: AbortSignal
): Promise<Response> {
  const url = buildUrl(config);
  const headers = await buildHeaders(config);
  return fetch(url, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify(body)
  });
}

// --- Translation ---

export const translateWithCustomProvider = async (
  config: CustomProviderConfig,
  imageBase64: string,
  pageNumber: number,
  sourceLanguage: string,
  previousContext: string,
  prevPageImageBase64: string | undefined,
  prevPageNumber: number | undefined,
  nextPageImageBase64: string | undefined,
  nextPageNumber: number | undefined,
  extraInstruction?: string,
  onProgress?: (text: string) => void,
  signal?: AbortSignal,
  legalContext?: boolean,
  customPrompt?: string,
  skipPostProcessing?: boolean
): Promise<TranslationResult> => {
  if (!config.apiKey) throw new Error(`API Key mancante per ${config.name}`);

  const concurrencyLimit = config.concurrencyLimit || 3;
  if (onProgress) onProgress(`Preparazione richiesta ${config.name} (${config.model})`);

  await concurrencyQueues.acquire(config.id, concurrencyLimit);
  try {
    return await translateWithCustomProviderInner(
      config, imageBase64, pageNumber, sourceLanguage, previousContext,
      prevPageImageBase64, prevPageNumber, nextPageImageBase64, nextPageNumber,
      extraInstruction, onProgress, signal, legalContext, customPrompt, skipPostProcessing
    );
  } finally {
    concurrencyQueues.release(config.id);
  }
};

async function translateWithCustomProviderInner(
  config: CustomProviderConfig,
  imageBase64: string,
  pageNumber: number,
  sourceLanguage: string,
  previousContext: string,
  prevPageImageBase64: string | undefined,
  prevPageNumber: number | undefined,
  nextPageImageBase64: string | undefined,
  nextPageNumber: number | undefined,
  extraInstruction?: string,
  onProgress?: (text: string) => void,
  signal?: AbortSignal,
  legalContext?: boolean,
  customPrompt?: string,
  skipPostProcessing?: boolean
): Promise<TranslationResult> {
  const isRetry = Boolean(extraInstruction && extraInstruction.trim().length > 0);
  const startedAt = performance.now();

  // Build diagnostic prompt for logging
  const diagnosticSystemPrompt = config.apiFormat === 'anthropic'
    ? getClaudeTranslateSystemPrompt(sourceLanguage || 'Tedesco', previousContext || '', legalContext ?? true, undefined, customPrompt)
    : getOpenAITranslateSystemPrompt(sourceLanguage || 'Tedesco', previousContext || '', legalContext ?? true, isRetry, customPrompt);

  const runAttempt = async (instruction: string): Promise<{ text: string }> => {
    if (config.apiFormat === 'anthropic') {
      return runAnthropicTranslation(config, instruction, imageBase64, pageNumber, prevPageImageBase64, prevPageNumber, nextPageImageBase64, nextPageNumber, sourceLanguage, previousContext, legalContext, customPrompt, isRetry, signal);
    } else if (config.apiFormat === 'gemini') {
      return runGeminiTranslation(config, instruction, imageBase64, pageNumber, prevPageImageBase64, prevPageNumber, nextPageImageBase64, nextPageNumber, sourceLanguage, previousContext, legalContext, customPrompt, isRetry, signal);
    } else {
      // openai + zhipu share the same format
      return runOpenAICompatibleTranslation(config, instruction, imageBase64, pageNumber, prevPageImageBase64, prevPageNumber, nextPageImageBase64, nextPageNumber, sourceLanguage, previousContext, legalContext, customPrompt, isRetry, signal);
    }
  };

  const baseInstruction = getOpenAITranslateUserInstruction(pageNumber, sourceLanguage);
  // CLEAN RETRY: istruzione minimale per evitare duplicazione contesto
  const effectiveInstruction = extraInstruction?.trim()
    ? `Ritraduci la pagina ${pageNumber} dal ${sourceLanguage} all'italiano.\n\n${extraInstruction.trim()}`
    : baseInstruction;

  const result = await retry(
    () => runAttempt(effectiveInstruction),
    2, 3000,
    (err, attempt) => {
      if (onProgress) onProgress(`Errore temporaneo ${config.name}, tentativo ${attempt}/2...`);
      log.warning(`Ritento ${config.name} (attempt ${attempt})`, err);
    },
    (err) => {
      const msg = String((err as any)?.message || '');
      return !msg.includes('aborted') && !msg.includes('annullat');
    }
  );

  const elapsedMs = Math.round(performance.now() - startedAt);
  if (onProgress) onProgress(`Output pronto: ${result.text.length} caratteri (tempo: ${elapsedMs}ms)`);
  log.success(`Completata traduzione pagina ${pageNumber} con ${config.name}`, { elapsedMs, chars: result.text.length });

  if (skipPostProcessing) {
    return { text: result.text || '', annotations: [], modelUsed: config.model, diagnosticPrompt: diagnosticSystemPrompt, diagnosticUserInstruction: effectiveInstruction };
  }
  const cleaned = cleanTranslationText(result.text || '');
  return { text: cleaned, annotations: [], modelUsed: config.model, diagnosticPrompt: diagnosticSystemPrompt, diagnosticUserInstruction: effectiveInstruction };
}

async function runOpenAICompatibleTranslation(
  config: CustomProviderConfig,
  instruction: string,
  imageBase64: string,
  pageNumber: number,
  prevPageImageBase64?: string,
  prevPageNumber?: number,
  nextPageImageBase64?: string,
  nextPageNumber?: number,
  sourceLanguage?: string,
  previousContext?: string,
  legalContext?: boolean,
  customPrompt?: string,
  isRetry?: boolean,
  signal?: AbortSignal
): Promise<{ text: string }> {
  const systemPrompt = getOpenAITranslateSystemPrompt(sourceLanguage || 'Tedesco', previousContext || '', legalContext ?? true, isRetry ?? false, customPrompt);
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
  const body = buildOpenAICompatibleBody(config, messages);
  const response = await executeRequest(config, body, signal);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Errore API ${config.name}: ${errorData?.error?.message || response.statusText} (status ${response.status})`);
  }
  const data = await response.json();
  if (data.usage) trackUsage(config.model, data.usage.prompt_tokens || 0, data.usage.completion_tokens || 0);
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('Risposta vuota');
  return { text };
}

async function runAnthropicTranslation(
  config: CustomProviderConfig,
  instruction: string,
  imageBase64: string,
  pageNumber: number,
  prevPageImageBase64?: string,
  prevPageNumber?: number,
  nextPageImageBase64?: string,
  nextPageNumber?: number,
  sourceLanguage?: string,
  previousContext?: string,
  legalContext?: boolean,
  customPrompt?: string,
  isRetry?: boolean,
  signal?: AbortSignal
): Promise<{ text: string }> {
  const systemPrompt = getClaudeTranslateSystemPrompt(sourceLanguage || 'Tedesco', previousContext || '', legalContext ?? true, undefined, customPrompt);
  const contentBlocks: any[] = [
    { type: 'text', text: instruction },
    ...(prevPageImageBase64 && prevPageNumber
      ? [
          { type: 'text', text: `CONTESTO (NON tradurre): pagina precedente ${prevPageNumber}` },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: prevPageImageBase64 } }
        ]
      : []),
    { type: 'text', text: `PAGINA DA TRADURRE: Pagina ${pageNumber}` },
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
    ...(nextPageImageBase64 && nextPageNumber
      ? [
          { type: 'text', text: `CONTESTO (NON tradurre): pagina successiva ${nextPageNumber}` },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: nextPageImageBase64 } }
        ]
      : [])
  ];
  const messages = [{ role: 'user', content: contentBlocks }];
  const body = buildAnthropicBody(config, systemPrompt, messages);
  const response = await executeRequest(config, body, signal);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Errore API ${config.name}: ${errorData?.error?.message || response.statusText} (status ${response.status})`);
  }
  const data = await response.json();
  if (data.usage) trackUsage(config.model, data.usage?.input_tokens || 0, data.usage?.output_tokens || 0);
  const text = data.content?.find((c: any) => c.type === 'text')?.text || '';
  if (!text) throw new Error('Risposta vuota');
  return { text };
}

async function runGeminiTranslation(
  config: CustomProviderConfig,
  instruction: string,
  imageBase64: string,
  pageNumber: number,
  prevPageImageBase64?: string,
  prevPageNumber?: number,
  nextPageImageBase64?: string,
  nextPageNumber?: number,
  sourceLanguage?: string,
  previousContext?: string,
  legalContext?: boolean,
  customPrompt?: string,
  isRetry?: boolean,
  signal?: AbortSignal
): Promise<{ text: string }> {
  const systemInstruction = (customPrompt && customPrompt.trim().length > 0)
    ? customPrompt
    : getOpenAITranslateSystemPrompt(sourceLanguage || 'Tedesco', previousContext || '', legalContext ?? true, isRetry ?? false, undefined);

  const parts: any[] = [
    { text: instruction },
    ...(prevPageImageBase64 && prevPageNumber
      ? [
          { text: `CONTESTO (NON tradurre): pagina precedente ${prevPageNumber}` },
          { inlineData: { mimeType: 'image/jpeg', data: prevPageImageBase64 } }
        ]
      : []),
    { text: `PAGINA DA TRADURRE: Pagina ${pageNumber}` },
    { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
    ...(nextPageImageBase64 && nextPageNumber
      ? [
          { text: `CONTESTO (NON tradurre): pagina successiva ${nextPageNumber}` },
          { inlineData: { mimeType: 'image/jpeg', data: nextPageImageBase64 } }
        ]
      : [])
  ];

  const body = {
    contents: [{ role: 'user', parts }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: { maxOutputTokens: 8192 }
  };

  // Gemini URL is already built with key param
  const url = buildUrl(config);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Errore API ${config.name}: ${errorData?.error?.message || response.statusText} (status ${response.status})`);
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
  if (!text) throw new Error('Risposta vuota');
  return { text };
}

// --- Verification ---

export const verifyWithCustomProvider = async (
  config: CustomProviderConfig,
  params: {
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
  }
): Promise<any> => {
  const { pageNumber, imageBase64, translatedText, signal, legalContext = true, sourceLanguage = 'Tedesco', customPrompt } = params;
  if (!config.apiKey) throw new Error(`API Key mancante per ${config.name}`);

  const systemPrompt = (customPrompt && customPrompt.trim().length > 0)
    ? customPrompt
    : getVerifyQualitySystemPrompt(legalContext, sourceLanguage);

  const concurrencyLimit = config.concurrencyLimit || 3;
  await concurrencyQueues.acquire(config.id, concurrencyLimit);
  try {
    if (config.apiFormat === 'anthropic') {
      return verifyAnthropic(config, systemPrompt, params);
    } else {
      return verifyOpenAICompatible(config, systemPrompt, params);
    }
  } finally {
    concurrencyQueues.release(config.id);
  }
};

async function verifyOpenAICompatible(
  config: CustomProviderConfig,
  systemPrompt: string,
  params: any
): Promise<any> {
  const { pageNumber, imageBase64, translatedText, prevPageImageBase64, prevPageNumber, nextPageImageBase64, nextPageNumber, signal } = params;
  const content: any[] = [
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
  ];

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content }
  ];

  const body = buildOpenAICompatibleBody(config, messages, { maxTokens: 4096, responseFormat: { type: 'json_object' } });
  const data = await withTimeout(
    (async () => {
      const response = await executeRequest(config, body, signal);
      if (!response.ok) {
        const e = await response.json().catch(() => ({}));
        throw new Error(`Errore API ${config.name}: ${e?.error?.message || response.statusText}`);
      }
      const json = await response.json();
      if (json.usage) trackUsage(config.model, json.usage.prompt_tokens || 0, json.usage.completion_tokens || 0);
      return json;
    })(),
    AI_VERIFICATION_TIMEOUT_MS
  );

  const rawJson = data.choices?.[0]?.message?.content || '{}';
  const parsed = safeParseJsonObject(rawJson);
  return { severity: parsed.severity || 'ok', summary: parsed.summary || '', evidence: parsed.evidence || [], annotations: parsed.annotations || [], retryHint: parsed.retryHint || undefined };
}

async function verifyAnthropic(
  config: CustomProviderConfig,
  systemPrompt: string,
  params: any
): Promise<any> {
  const { pageNumber, imageBase64, translatedText, prevPageImageBase64, prevPageNumber, nextPageImageBase64, nextPageNumber, signal } = params;
  const contentBlocks: any[] = [
    ...(prevPageImageBase64 && prevPageNumber
      ? [
          { type: 'text', text: `CONTESTO: Pagina precedente ${prevPageNumber}` },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: prevPageImageBase64 } }
        ]
      : []),
    { type: 'text', text: `PAGINA DA VERIFICARE: Pagina ${pageNumber}` },
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
    ...(nextPageImageBase64 && nextPageNumber
      ? [
          { type: 'text', text: `CONTESTO: Pagina successiva ${nextPageNumber}` },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: nextPageImageBase64 } }
        ]
      : []),
    { type: 'text', text: `TRADUZIONE DA REVISIONARE:\n"""\n${translatedText.slice(0, 10000)}\n"""` },
    { type: 'text', text: 'Respond ONLY with a valid JSON object.' }
  ];

  const messages = [{ role: 'user', content: contentBlocks }];
  const body = buildAnthropicBody(config, systemPrompt, messages, { maxTokens: 4096 });
  const data = await withTimeout(
    (async () => {
      const response = await executeRequest(config, body, signal);
      if (!response.ok) {
        const e = await response.json().catch(() => ({}));
        throw new Error(`Errore API ${config.name}: ${e?.error?.message || response.statusText}`);
      }
      const json = await response.json();
      if (json.usage) trackUsage(config.model, json.usage?.input_tokens || 0, json.usage?.output_tokens || 0);
      return json;
    })(),
    AI_VERIFICATION_TIMEOUT_MS
  );

  const rawJson = data.content?.find((c: any) => c.type === 'text')?.text || '{}';
  const parsed = safeParseJsonObject(rawJson);
  return { severity: parsed.severity || 'ok', summary: parsed.summary || '', evidence: parsed.evidence || [], annotations: parsed.annotations || [], retryHint: parsed.retryHint || undefined };
}

// --- Metadata Extraction ---

export const extractMetadataWithCustomProvider = async (
  config: CustomProviderConfig,
  imagesBase64: string[],
  signal?: AbortSignal,
  targetLanguage?: string,
  customPrompt?: string
): Promise<Partial<PDFMetadata>> => {
  if (!config.apiKey) throw new Error(`API Key mancante per ${config.name}`);
  const prompt = (customPrompt && customPrompt.trim().length > 0) ? customPrompt : getMetadataExtractionPrompt(targetLanguage);

  try {
    if (config.apiFormat === 'gemini') {
      return extractGeminiMetadata(config, prompt, imagesBase64, signal);
    } else if (config.apiFormat === 'anthropic') {
      return extractAnthropicMetadata(config, prompt, imagesBase64, signal);
    } else {
      return extractOpenAICompatibleMetadata(config, prompt, imagesBase64, signal);
    }
  } catch (e) {
    log.error(`Errore estrazione metadati con ${config.name}`, e);
    return {};
  }
};

async function extractOpenAICompatibleMetadata(config: CustomProviderConfig, prompt: string, images: string[], signal?: AbortSignal): Promise<Partial<PDFMetadata>> {
  const content: any[] = [{ type: 'text', text: prompt }];
  images.forEach((img, i) => {
    content.push({ type: 'text', text: `Immagine ${i + 1}:` });
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}` } });
  });
  const messages = [{ role: 'user', content }];
  const body = buildOpenAICompatibleBody(config, messages, { maxTokens: 1024, responseFormat: { type: 'json_object' } });
  const response = await executeRequest(config, body, signal);
  if (!response.ok) {
    const e = await response.json().catch(() => ({}));
    throw new Error(`Errore API ${config.name}: ${e?.error?.message || response.statusText}`);
  }
  const data = await response.json();
  if (data.usage) trackUsage(config.model, data.usage.prompt_tokens || 0, data.usage.completion_tokens || 0);
  const parsed = safeParseJsonObject(data.choices?.[0]?.message?.content || '{}');
  return {
    year: typeof parsed?.year === 'string' ? parsed.year.trim() : typeof parsed?.year === 'number' ? String(parsed.year) : '0000',
    author: typeof parsed?.author === 'string' ? parsed.author.trim() : 'Unknown',
    title: typeof parsed?.title === 'string' ? parsed.title.trim() : 'Untitled'
  };
}

async function extractAnthropicMetadata(config: CustomProviderConfig, prompt: string, images: string[], signal?: AbortSignal): Promise<Partial<PDFMetadata>> {
  const contentBlocks: any[] = [];
  images.forEach((img, i) => {
    contentBlocks.push({ type: 'text', text: `Immagine ${i + 1}:` });
    contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img } });
  });
  contentBlocks.push({ type: 'text', text: 'Respond ONLY with a valid JSON object.' });
  const messages = [{ role: 'user', content: contentBlocks }];
  const body = buildAnthropicBody(config, prompt, messages, { maxTokens: 1024 });
  const response = await executeRequest(config, body, signal);
  if (!response.ok) {
    const e = await response.json().catch(() => ({}));
    throw new Error(`Errore API ${config.name}: ${e?.error?.message || response.statusText}`);
  }
  const data = await response.json();
  if (data.usage) trackUsage(config.model, data.usage?.input_tokens || 0, data.usage?.output_tokens || 0);
  const rawJson = data.content?.find((c: any) => c.type === 'text')?.text || '{}';
  const parsed = safeParseJsonObject(rawJson);
  return {
    year: typeof parsed?.year === 'string' ? parsed.year.trim() : typeof parsed?.year === 'number' ? String(parsed.year) : '0000',
    author: typeof parsed?.author === 'string' ? parsed.author.trim() : 'Unknown',
    title: typeof parsed?.title === 'string' ? parsed.title.trim() : 'Untitled'
  };
}

async function extractGeminiMetadata(config: CustomProviderConfig, prompt: string, images: string[], signal?: AbortSignal): Promise<Partial<PDFMetadata>> {
  const parts: any[] = [{ text: prompt }];
  images.forEach((img, i) => {
    parts.push({ text: `Immagine ${i + 1}:` });
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: img } });
  });
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { maxOutputTokens: 1024 }
  };
  const url = buildUrl(config);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const e = await response.json().catch(() => ({}));
    throw new Error(`Errore API ${config.name}: ${e?.error?.message || response.statusText}`);
  }
  const data = await response.json();
  const rawJson = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '{}';
  const parsed = safeParseJsonObject(rawJson);
  return {
    year: typeof parsed?.year === 'string' ? parsed.year.trim() : typeof parsed?.year === 'number' ? String(parsed.year) : '0000',
    author: typeof parsed?.author === 'string' ? parsed.author.trim() : 'Unknown',
    title: typeof parsed?.title === 'string' ? parsed.title.trim() : 'Untitled'
  };
}

// --- Test Connection ---

export const testCustomProviderConnection = async (
  config: CustomProviderConfig,
  signal?: AbortSignal
): Promise<{ success: boolean; message: string }> => {
  if (!config.apiKey) return { success: false, message: 'API Key mancante' };
  try {
    log.info(`Test connessione ${config.name} (${config.apiFormat})...`);

    if (config.apiFormat === 'anthropic') {
      const body = buildAnthropicBody(config, 'Reply with exactly: OK', [
        { role: 'user', content: "Traduci 'Hello World' in Italiano. Rispondi SOLO con la traduzione." }
      ], { maxTokens: 10 });
      const response = await executeRequest(config, body, signal);
      if (!response.ok) {
        const e = await response.json().catch(() => ({}));
        return { success: false, message: `Errore ${config.name}: ${e?.error?.message || response.statusText}` };
      }
      const data = await response.json();
      const text = data.content?.find((c: any) => c.type === 'text')?.text || '';
      return text.trim().length > 0
        ? { success: true, message: `Connessione ${config.name} riuscita: "${text.trim()}"` }
        : { success: false, message: 'Risposta vuota.' };
    } else {
      // openai, zhipu, gemini — use simple text-only request
      const messages = [{ role: 'user', content: "Traduci 'Hello World' in Italiano. Rispondi SOLO con la traduzione." }];
      if (config.apiFormat === 'gemini') {
        const body = { contents: [{ role: 'user', parts: [{ text: "Traduci 'Hello World' in Italiano. Rispondi SOLO con la traduzione." }] }], generationConfig: { maxOutputTokens: 10 } };
        const url = buildUrl(config);
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal, body: JSON.stringify(body) });
        if (!response.ok) {
          const e = await response.json().catch(() => ({}));
          return { success: false, message: `Errore ${config.name}: ${e?.error?.message || response.statusText}` };
        }
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return text.trim().length > 0
          ? { success: true, message: `Connessione ${config.name} riuscita: "${text.trim()}"` }
          : { success: false, message: 'Risposta vuota.' };
      } else {
        const body = buildOpenAICompatibleBody(config, messages, { maxTokens: 10 });
        const response = await executeRequest(config, body, signal);
        if (!response.ok) {
          const e = await response.json().catch(() => ({}));
          return { success: false, message: `Errore ${config.name}: ${e?.error?.message || response.statusText}` };
        }
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';
        return text.trim().length > 0
          ? { success: true, message: `Connessione ${config.name} riuscita: "${text.trim()}"` }
          : { success: false, message: 'Risposta vuota.' };
      }
    }
  } catch (error: any) {
    log.error(`Test connessione ${config.name} fallito`, error);
    return { success: false, message: error.message || 'Errore sconosciuto.' };
  }
};
