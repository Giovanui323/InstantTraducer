import { AIProvider, AISettings, PageVerification } from '../types';
import { translatePage } from './aiService';
import { verifyQualityAdapter } from './aiAdapter';
import { estimateModelCostPerPageUSD } from './usageTracker';
import { getAvailableModels, MergedModelInfo } from './modelManager';
import { GEMINI_VERIFIER_PRO_MODEL } from '../constants';
import { log } from './logger';

// ─── Types ───

export type BenchmarkModelStatus = 'pending' | 'translating' | 'verifying' | 'success' | 'error';
export type BenchmarkRunStatus = 'idle' | 'running' | 'completed' | 'error' | 'credit_exhausted';

export interface BenchmarkModelResult {
  modelId: string;
  modelName: string;
  status: BenchmarkModelStatus;
  translatedText?: string;
  verification?: PageVerification;
  translationLatencyMs?: number;
  verificationLatencyMs?: number;
  qualityScore?: number;
  costPerPage?: number;
  errorMessage?: string;
  creditExhausted?: boolean;
}

export interface BenchmarkRun {
  id: string;
  provider: AIProvider;
  sourceLanguage: string;
  pageNumber: number;
  status: BenchmarkRunStatus;
  results: BenchmarkModelResult[];
  startedAt?: number;
  completedAt?: number;
  judgeProvider: AIProvider;
  judgeModel: string;
}

export interface BenchmarkParams {
  settings: AISettings;
  provider: AIProvider;
  imageBase64: string;
  pageNumber: number;
  sourceLanguage: string;
  judgeProvider?: AIProvider;
  judgeModel?: string;
  signal?: AbortSignal;
}

// ─── Scoring ───

export const computeQualityScore = (v: PageVerification): number => {
  if (v.state === 'failed') return 0;

  let score = 100;

  if (v.severity === 'minor') {
    const evidenceCount = v.evidence?.length ?? 0;
    score -= Math.min(evidenceCount * 15, 40);
  } else if (v.severity === 'severe') {
    const evidenceCount = v.evidence?.length ?? 0;
    score -= Math.min(evidenceCount * 25, 75);
  }

  const annotationCount = v.annotations?.length ?? 0;
  score -= Math.min(annotationCount * 3, 15);

  return Math.max(0, Math.min(100, score));
};

// ─── Credit exhaustion detection ───

const CREDIT_EXHAUSTED_PATTERNS = [
  'quota', 'esaurita', 'esaurito', 'exhausted', 'credit',
  'billing', 'insufficient', 'limit exceeded', 'resource_exhausted',
  'budget', 'rate limit', '429', 'hard limit',
];

export const isCreditExhaustedError = (err: any): boolean => {
  const msg = String(err?.message || err?.error?.message || '').toLowerCase();
  const status = err?.status || err?.statusCode || 0;
  if (status === 429 || status === 402) return true;
  return CREDIT_EXHAUSTED_PATTERNS.some(p => msg.includes(p));
};

// ─── Helpers ───

const buildTempSettings = (base: AISettings, provider: AIProvider, modelId: string): AISettings => {
  const temp = JSON.parse(JSON.stringify(base)) as AISettings;
  temp.provider = provider;

  if (provider === 'gemini') temp.gemini = { ...temp.gemini, model: modelId as any };
  else if (provider === 'openai') temp.openai = { ...temp.openai, model: modelId };
  else if (provider === 'claude') temp.claude = { ...temp.claude, model: modelId as any };
  else if (provider === 'groq') temp.groq = { ...temp.groq, model: modelId as any };
  else if (provider === 'zai') temp.zai = { ...temp.zai, model: modelId };
  else if (provider === 'openrouter') temp.openrouter = { ...temp.openrouter, model: modelId };
  // modal: single model, no override needed

  return temp;
};

const getModelsForProvider = (provider: AIProvider, settings: AISettings): MergedModelInfo[] => {
  return getAvailableModels(provider, settings);
};

// ─── Core ───

export const runBenchmarkForModel = async (params: {
  settings: AISettings;
  provider: AIProvider;
  model: MergedModelInfo;
  imageBase64: string;
  pageNumber: number;
  sourceLanguage: string;
  judgeSettings: AISettings;
  signal?: AbortSignal;
}): Promise<BenchmarkModelResult> => {
  const { settings, provider, model, imageBase64, pageNumber, sourceLanguage, judgeSettings, signal } = params;
  const result: BenchmarkModelResult = {
    modelId: model.id,
    modelName: model.name,
    status: 'pending',
    costPerPage: estimateModelCostPerPageUSD(model.id, {
      pricingOverride: model.pricing
        ? { input: String(model.pricing.input), output: String(model.pricing.output) }
        : undefined
    }),
  };

  try {
    // Translation
    result.status = 'translating';
    const tempSettings = buildTempSettings(settings, provider, model.id);
    const tStart = performance.now();
    const translation = await translatePage(
      tempSettings,
      {
        imageBase64,
        pageNumber,
        sourceLanguage,
        previousContext: '',
      },
      undefined,
      { signal }
    );
    result.translationLatencyMs = Math.round(performance.now() - tStart);
    result.translatedText = translation.text;

    if (signal?.aborted) { result.status = 'error'; result.errorMessage = 'Annullato'; return result; }

    // Verification
    result.status = 'verifying';
    const vStart = performance.now();
    const verification = await verifyQualityAdapter({
      settings: judgeSettings,
      translatedText: translation.text,
      imageBase64,
      pageNumber,
      sourceLanguage,
      signal,
    });
    result.verificationLatencyMs = Math.round(performance.now() - vStart);
    result.verification = verification;
    result.qualityScore = computeQualityScore(verification);
    result.status = 'success';
  } catch (err: any) {
    if (signal?.aborted) {
      result.status = 'error';
      result.errorMessage = 'Annullato';
    } else {
      result.status = 'error';
      result.errorMessage = err?.message || 'Errore sconosciuto';
      if (isCreditExhaustedError(err)) {
        result.creditExhausted = true;
        result.errorMessage = 'Crediti esauriti per questo provider';
      }
    }
  }

  return result;
};

export const runFullBenchmark = async function* (
  params: BenchmarkParams
): AsyncGenerator<{ index: number; result: BenchmarkModelResult; creditExhausted: boolean }, void, unknown> {
  const {
    settings, provider, imageBase64, pageNumber,
    sourceLanguage, signal,
  } = params;

  const judgeProvider = params.judgeProvider || 'gemini';
  const judgeModel = params.judgeModel || GEMINI_VERIFIER_PRO_MODEL;

  const judgeSettings: AISettings = {
    ...JSON.parse(JSON.stringify(settings)),
    provider: judgeProvider,
    qualityCheck: {
      enabled: true,
      verifierProvider: judgeProvider,
      verifierModel: judgeModel,
      maxAutoRetries: 0,
    },
  };

  const models = getModelsForProvider(provider, settings);
  log.info(`[Benchmark] Starting benchmark for ${provider}: ${models.length} models`);

  for (let i = 0; i < models.length; i++) {
    if (signal?.aborted) break;

    const model = models[i];
    const result = await runBenchmarkForModel({
      settings,
      provider,
      model,
      imageBase64,
      pageNumber,
      sourceLanguage,
      judgeSettings,
      signal,
    });

    yield { index: i, result, creditExhausted: !!result.creditExhausted };

    if (result.creditExhausted) {
      log.warning(`[Benchmark] Crediti esauriti su ${provider}. Interrompo il benchmark.`);
      break;
    }
  }

  log.info(`[Benchmark] Completed for ${provider}`);
};
