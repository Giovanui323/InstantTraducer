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

// ─── Scoring (strict) ───

export const computeQualityScore = (v: PageVerification): number => {
  if (v.state === 'failed') return 0;

  let score = 100;

  if (v.severity === 'minor') {
    const evidenceCount = v.evidence?.length ?? 0;
    score -= Math.min(evidenceCount * 12, 40);
  } else if (v.severity === 'severe') {
    const evidenceCount = v.evidence?.length ?? 0;
    score -= Math.min(evidenceCount * 20, 80);
  }

  const annotationCount = v.annotations?.length ?? 0;
  score -= Math.min(annotationCount * 4, 20);

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

// ─── Strict Benchmark Verification Prompt ───
// Molto più severo della verifica standard: ogni dettaglio conta.

const BENCHMARK_STRICT_VERIFICATION_PROMPT = (sourceLanguage: string = "Tedesco") => `<role>
Sei un revisore editoriale ESTREMAMENTE pignolo e severo. Il tuo compito è un confronto riga-per-riga tra l'originale e la traduzione per individuare OGNI singola discrepanza, anche minima.
</role>

<objective>
Questa è una valutazione benchmark per classificare modelli AI. La tua severità determina quale modello viene scelto. NON essere permissivo: segnala TUTTO.
</objective>

<verification_protocol>
<step name="1. LINGUA">Verifica che il testo sia TRADOTTO in Italiano. Se è una trascrizione in ${sourceLanguage}: severity "severe".</step>
<step name="2. CONTEGGIO BLOCCHI">Conta TUTTI i blocchi visibili nella PAGINA PRINCIPALE: titoli, paragrafi, didascalie, note, voci di elenco. Confronta con il numero di blocchi nella traduzione.</step>
<step name="3. RIGA-PER-RIGA">Per OGNI paragrafo dell'originale, verifica che esista una traduzione corrispondente. Una singola frase mancante = segnalazione.</step>
<step name="4. TERMINOLOGIA">Verifica la correttezza di ogni termine tecnico/giuridico. Un falso amico o un termine errato = segnalazione.</step>
<step name="5. LAYOUT">Se la pagina è a due colonne, verifica che [[PAGE_SPLIT]] sia presente e nella posizione corretta. Le note siano nella colonna giusta.</step>
</verification_protocol>

<strict_rules>
<rule>ZERO TOLLERANZA: Segnala anche una singola parola mancante o un refuso.</rule>
<rule>NON ESSERE GENEROSO: Se hai un dubbio, segnalalo come "minor". Un verdict "ok" deve essere guadagnato.</rule>
<rule>CONTEGGIO ESATTO: Se l'originale ha 12 paragrafi e la traduzione ne ha 11, questo è un errore grave.</rule>
<rule>NOTE A PIÈ DI PAGINA: Ogni nota nell'originale DEVE essere presente nella traduzione. Note mancanti = errore.</rule>
<rule>DIDASCALIE E TITOLI: Non trascurare didascalie di immagini, titoli di capitoli, intestazioni di sezione.</rule>
<rule>ELENCHI: Ogni voce di un elenco deve essere tradotta. Voci mancanti = errore.</rule>
<rule>FALSI AMICI ${sourceLanguage === 'Francese' || sourceLanguage === 'fr' ? ': Attenzione speciale a "Arrêter/Arrêt", "Instance", "Magistrat".' : ': Verifica che i termini tecnici siano correttamente tradotti, non trascritti.'}</rule>
</strict_rules>

<severity_rules>
<level name="severe">Omissione di paragrafi interi, colonne intere, o errori di senso che cambiano il significato giuridico. Testo non tradotto (trascrizione in lingua originale).</level>
<level name="minor">QUALSIASI altra discrepanza: singole frasi o parole mancanti, refusi, punteggiatura errata, termini imprecisi, note mancanti, layout errato, didascalie mancanti, elenchi incompleti. SEGNALA SEMPRE.</level>
<level name="ok">SOLO se la traduzione è PERFETTA: completa, accurata, senza errori. Deve essere all'altezza di un volume editoriale pubblicato.</level>
</severity_rules>

<output_format>
Rispondi SOLO con JSON:
{
  "severity": "ok"|"minor"|"severe",
  "summary": "Descrizione concisa del verdetto",
  "evidence": ["Lista di tutte le discrepanze trovate, specificando posizione"],
  "annotations": [{"originalText": "testo originale", "comment": "descrizione errore", "type": "error"|"doubt"|"suggestion"}],
  "retryHint": "Istruzioni specifiche per correggere, se necessario"
}
</output_format>`;

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

    // Verification (strict benchmark prompt)
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
): AsyncGenerator<{ index: number; result: BenchmarkModelResult; creditExhausted: boolean; modelName: string; status: BenchmarkModelStatus }, void, unknown> {
  const {
    settings, provider, imageBase64, pageNumber,
    sourceLanguage, signal,
  } = params;

  const judgeProvider = params.judgeProvider || 'gemini';
  const judgeModel = params.judgeModel || GEMINI_VERIFIER_PRO_MODEL;

  // Build judge settings with strict benchmark verification prompt
  const langMap: Record<string, string> = { en: 'Inglese', de: 'Tedesco', fr: 'Francese', es: 'Spagnolo', pt: 'Portoghese', ja: 'Giapponese', zh: 'Cinese', ko: 'Coreano', ru: 'Russo', ar: 'Arabo' };
  const langName = langMap[sourceLanguage] || sourceLanguage;
  const strictPrompt = BENCHMARK_STRICT_VERIFICATION_PROMPT(langName);

  const judgeSettings: AISettings = {
    ...JSON.parse(JSON.stringify(settings)),
    provider: judgeProvider,
    qualityCheck: {
      enabled: true,
      verifierProvider: judgeProvider,
      verifierModel: judgeModel,
      maxAutoRetries: 0,
    },
    customVerificationPrompt: strictPrompt,
  };

  const models = getModelsForProvider(provider, settings);
  log.info(`[Benchmark] Starting benchmark for ${provider}: ${models.length} models (strict verification)`);

  for (let i = 0; i < models.length; i++) {
    if (signal?.aborted) break;

    const model = models[i];

    // Yield progress update with model name and status before starting
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

    yield { index: i, result, creditExhausted: !!result.creditExhausted, modelName: model.name, status: result.status };

    if (result.creditExhausted) {
      log.warning(`[Benchmark] Crediti esauriti su ${provider}. Interrompo il benchmark.`);
      break;
    }
  }

  log.info(`[Benchmark] Completed for ${provider}`);
};
