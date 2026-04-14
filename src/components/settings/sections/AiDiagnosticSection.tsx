import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity, Loader2, Check, X, AlertTriangle, RotateCcw,
  ChevronRight, Clock, Zap, ShieldCheck, BrainCircuit, Trash2,
} from 'lucide-react';
import type { AISettings, AIProvider } from '../../../types';
import {
  GEMINI_VERIFIER_MODEL,
  GEMINI_TRANSLATION_FLASH_MODEL,
} from '../../../constants';
import { testGeminiConnection } from '../../../services/geminiService';
import { testOpenAIConnection } from '../../../services/openaiService';
import { testClaudeConnection } from '../../../services/claudeService';
import { testGroqConnection } from '../../../services/groqService';
import { testModalConnection } from '../../../services/modalService';
import { testZaiConnection } from '../../../services/zaiService';
import { testOpenRouterConnection } from '../../../services/openrouterService';
import { testCustomProviderConnection } from '../../../services/customProviderAdapter';
import { classifyError } from '../../../utils/diagnosticErrors';
import type { DiagnosticErrorCategory } from '../../../utils/diagnosticErrors';
import {
  loadDiagnosticHistory,
  saveDiagnosticRun,
  clearDiagnosticHistory,
  createEmptyRun,
  computeOverallStatus,
} from '../../../utils/diagnosticStorage';
import type {
  DiagnosticRun,
  ProviderDiagnosticResult,
  DiagnosticHistory,
} from '../../../utils/diagnosticStorage';

// ─── Props ───

interface AiDiagnosticSectionProps {
  draftSettings: AISettings;
  updateDraft: (updates: Partial<AISettings>) => void;
}

// ─── Provider metadata ───

interface ProviderMeta {
  name: string;
  color: string;
  getApiKey: (s: AISettings) => string;
  getModel: (s: AISettings) => string;
  test: (key: string, model: string) => Promise<{ success: boolean; message: string }>;
}

const PROVIDERS: Record<string, ProviderMeta> = {
  gemini: {
    name: 'Google Gemini',
    color: 'text-accent',
    getApiKey: (s) => s.gemini?.apiKey || '',
    getModel: (s) => s.gemini?.model || 'gemini-2.5-pro',
    test: (key, model) => testGeminiConnection(key, model as any),
  },
  openai: {
    name: 'OpenAI',
    color: 'text-purple-400',
    getApiKey: (s) => s.openai?.apiKey || '',
    getModel: (s) => s.openai?.model || 'gpt-4o',
    test: (key, model) => testOpenAIConnection(key, model),
  },
  claude: {
    name: 'Anthropic Claude',
    color: 'text-orange-400',
    getApiKey: (s) => s.claude?.apiKey || '',
    getModel: (s) => s.claude?.model || 'claude-3-5-sonnet-20241022',
    test: (key, model) => testClaudeConnection(key, model as any),
  },
  groq: {
    name: 'Groq',
    color: 'text-success',
    getApiKey: (s) => s.groq?.apiKey || '',
    getModel: (s) => s.groq?.model || 'llama-3.3-70b-versatile',
    test: (key, model) => testGroqConnection(key, model as any),
  },
  modal: {
    name: 'Modal (GLM-5.1)',
    color: 'text-purple-300',
    getApiKey: (s) => s.modal?.apiKey || '',
    getModel: () => 'zai-org/GLM-5.1-FP8',
    test: (key) => testModalConnection(key),
  },
  zai: {
    name: 'Z.ai (Zhipu AI)',
    color: 'text-blue-400',
    getApiKey: (s) => s.zai?.apiKey || '',
    getModel: (s) => s.zai?.model || 'glm-4v-plus',
    test: (key, model) => testZaiConnection(key, model),
  },
  openrouter: {
    name: 'OpenRouter',
    color: 'text-orange-400',
    getApiKey: (s) => s.openrouter?.apiKey || '',
    getModel: (s) => s.openrouter?.model || 'anthropic/claude-sonnet-4.5',
    test: (key, model) => testOpenRouterConnection(key, model),
  },
};

// ─── Helpers ───

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return 'ora';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min fa`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} ore fa`;
  return new Date(timestamp).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function latencyLabel(ms: number): { text: string; color: string } {
  if (ms < 500) return { text: 'Veloce', color: 'text-success' };
  if (ms < 2000) return { text: 'Normale', color: 'text-accent' };
  if (ms < 5000) return { text: 'Lento', color: 'text-warning' };
  return { text: 'Molto lento', color: 'text-danger' };
}

function maskKey(key: string): string {
  if (!key) return 'non configurata';
  if (key.length <= 8) return '••••••••';
  return '••••••••' + key.slice(-4);
}

// ─── Sub-components ───

const ErrorInsight = ({
  category,
  title,
  description,
  suggestedFix,
  severity,
}: {
  category: DiagnosticErrorCategory;
  title: string;
  description: string;
  suggestedFix: string;
  severity: 'critical' | 'warning';
}) => (
  <div
    className={`mt-2 rounded-lg p-3 space-y-1.5 ${
      severity === 'critical'
        ? 'bg-danger/5 border border-danger/15'
        : 'bg-warning/5 border border-warning/15'
    }`}
  >
    <div
      className={`flex items-center gap-2 text-xs font-bold ${
        severity === 'critical' ? 'text-danger' : 'text-warning'
      }`}
    >
      <AlertTriangle size={14} />
      {title}
    </div>
    <p className="text-[11px] text-txt-muted leading-relaxed">{description}</p>
    <p className="text-[11px] text-txt-secondary leading-relaxed">{suggestedFix}</p>
  </div>
);

const RoleBadge = ({ label, active }: { label: string; active: boolean }) => (
  <span
    className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border transition-all duration-200 ${
      active
        ? 'bg-accent/10 text-accent border-accent/20'
        : 'bg-surface-4/50 text-txt-muted border-border-muted'
    }`}
  >
    {active && <Check size={9} />}
    {label}
  </span>
);

const DisabledBadge = () => (
  <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border bg-danger/10 text-danger border-danger/20">
    <X size={9} /> Disattivato
  </span>
);

// ─── Main Component ───

export const AiDiagnosticSection: React.FC<AiDiagnosticSectionProps> = ({
  draftSettings,
  updateDraft,
}) => {
  const [history, setHistory] = useState<DiagnosticHistory>({ runs: [] });
  const [currentRun, setCurrentRun] = useState<DiagnosticRun | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTestLabel, setCurrentTestLabel] = useState('');
  const abortRef = useRef(false);

  const disabledProviders = draftSettings.disabledProviders || [];

  const toggleProviderDisabled = useCallback((providerId: AIProvider) => {
    const current = disabledProviders;
    if (current.includes(providerId)) {
      updateDraft({ disabledProviders: current.filter(p => p !== providerId) });
    } else {
      updateDraft({ disabledProviders: [...current, providerId] });
    }
  }, [disabledProviders, updateDraft]);

  useEffect(() => {
    setHistory(loadDiagnosticHistory());
  }, []);

  // Build the list of tests to run
  const buildTestPlan = useCallback((): Array<{
    provider: AIProvider;
    model: string;
    role: ProviderDiagnosticResult['role'];
    key: string;
  }> => {
    const plan: Array<{
      provider: AIProvider;
      model: string;
      role: ProviderDiagnosticResult['role'];
      key: string;
    }> = [];

    const s = draftSettings;
    const provider = s.provider || 'gemini';

    // Phase 1: Configured roles
    // Primary
    const primaryMeta = PROVIDERS[provider];
    if (primaryMeta) {
      plan.push({
        provider: provider as AIProvider,
        model: primaryMeta.getModel(s),
        role: 'primary',
        key: primaryMeta.getApiKey(s),
      });
    }

    // Secondary (Verifier)
    const vProvider = s.qualityCheck?.verifierProvider || 'gemini';
    const vModel = s.qualityCheck?.verifierModel || GEMINI_VERIFIER_MODEL;
    const vMeta = PROVIDERS[vProvider];
    if (vMeta) {
      plan.push({
        provider: vProvider as AIProvider,
        model: vModel,
        role: 'secondary',
        key: vMeta.getApiKey(s),
      });
    }

    // Metadata
    const mProvider = s.metadataExtraction?.provider || 'gemini';
    const mModel = s.metadataExtraction?.model || GEMINI_TRANSLATION_FLASH_MODEL;
    const mMeta = PROVIDERS[mProvider];
    if (mMeta) {
      plan.push({
        provider: mProvider as AIProvider,
        model: mModel,
        role: 'metadata',
        key: mMeta.getApiKey(s),
      });
    }

    // Phase 2: Other providers with API keys (not already in plan)
    const testedProviders = new Set(plan.map((t) => t.provider));
    for (const [pId, meta] of Object.entries(PROVIDERS)) {
      if (testedProviders.has(pId as AIProvider)) continue;
      const key = meta.getApiKey(s);
      if (!key.trim()) continue;
      plan.push({
        provider: pId as AIProvider,
        model: meta.getModel(s),
        role: 'standalone',
        key,
      });
    }

    // Phase 3: Custom providers
    if (s.customProviders && s.customProviders.length > 0) {
      for (const cp of s.customProviders) {
        plan.push({
          provider: 'custom' as AIProvider,
          model: cp.model || 'custom',
          role: 'standalone',
          key: cp.apiKey || '',
        });
      }
    }

    return plan;
  }, [draftSettings]);

  // Run a single test
  const runSingleTest = useCallback(
    async (
      provider: AIProvider,
      model: string,
      role: ProviderDiagnosticResult['role'],
      key: string
    ): Promise<ProviderDiagnosticResult> => {
      const meta = PROVIDERS[provider];

      if (!key.trim()) {
        return {
          provider,
          model,
          role,
          status: 'error',
          timestamp: Date.now(),
          errorCategory: 'invalid_key',
          errorMessage: 'API Key non configurata',
        };
      }

      setCurrentTestLabel(
        `${meta?.name || provider} (${model})`
      );

      const start = performance.now();
      let result: { success: boolean; message: string };

      try {
        if (provider === 'custom') {
          const cp = draftSettings.customProviders?.find(
            (c) => c.model === model
          );
          if (cp) {
            result = await testCustomProviderConnection(cp);
          } else {
            result = { success: false, message: 'Provider custom non trovato' };
          }
        } else if (meta) {
          result = await meta.test(key, model);
        } else {
          result = { success: false, message: 'Provider non supportato' };
        }
      } catch (e: any) {
        result = { success: false, message: e?.message || 'Errore imprevisto' };
      }

      const latencyMs = Math.round(performance.now() - start);

      if (result.success) {
        return {
          provider,
          model,
          role,
          status: 'success',
          latencyMs,
          timestamp: Date.now(),
          responsePreview:
            result.message.length > 80
              ? result.message.slice(0, 80) + '...'
              : result.message,
        };
      }

      const insight = classifyError(provider, result.message);
      return {
        provider,
        model,
        role,
        status: 'error',
        latencyMs,
        timestamp: Date.now(),
        errorCategory: insight.category,
        errorMessage: result.message,
      };
    },
    [draftSettings.customProviders]
  );

  // Run full diagnostic
  const runDiagnostic = useCallback(async () => {
    if (isRunning) return;
    abortRef.current = false;
    setIsRunning(true);

    const plan = buildTestPlan();
    const run = createEmptyRun(plan.length);
    setCurrentRun({ ...run });

    for (let i = 0; i < plan.length; i++) {
      if (abortRef.current) break;

      const test = plan[i];
      const result = await runSingleTest(
        test.provider,
        test.model,
        test.role,
        test.key
      );

      const updatedResults = [...run.results, result];
      run.results = updatedResults;
      setCurrentRun({
        ...run,
        results: updatedResults,
      });
    }

    // Finalize run
    const finalRun: DiagnosticRun = {
      ...run,
      completedAt: Date.now(),
      overallStatus: computeOverallStatus(run.results),
    };

    setCurrentRun(finalRun);
    saveDiagnosticRun(finalRun);
    setHistory(loadDiagnosticHistory());
    setIsRunning(false);
    setCurrentTestLabel('');
  }, [isRunning, buildTestPlan, runSingleTest]);

  // Retry a single provider
  const retrySingle = useCallback(
    async (provider: AIProvider, model: string, role: ProviderDiagnosticResult['role']) => {
      if (isRunning) return;
      const meta = PROVIDERS[provider];
      const key = meta ? meta.getApiKey(draftSettings) : '';
      if (!key.trim()) return;

      setIsRunning(true);
      setCurrentTestLabel(`${meta?.name || provider} (${model})`);

      const result = await runSingleTest(provider, model, role, key);

      // Update currentRun or latest run
      setCurrentRun((prev) => {
        if (!prev) {
          const newRun: DiagnosticRun = {
            id: `run-${Date.now()}`,
            startedAt: Date.now(),
            completedAt: Date.now(),
            results: [result],
            overallStatus: computeOverallStatus([result]),
          };
          saveDiagnosticRun(newRun);
          setHistory(loadDiagnosticHistory());
          setIsRunning(false);
          setCurrentTestLabel('');
          return newRun;
        }
        // Replace the matching result
        const updatedResults = prev.results.map((r) =>
          r.provider === provider && r.model === model && r.role === role
            ? result
            : r
        );
        // Or add if not found
        const exists = prev.results.some(
          (r) => r.provider === provider && r.model === model && r.role === role
        );
        const finalResults = exists ? updatedResults : [...prev.results, result];

        const updated: DiagnosticRun = {
          ...prev,
          results: finalResults,
          overallStatus: computeOverallStatus(finalResults),
        };
        saveDiagnosticRun(updated);
        setHistory(loadDiagnosticHistory());
        setIsRunning(false);
        setCurrentTestLabel('');
        return updated;
      });
    },
    [isRunning, draftSettings, runSingleTest]
  );

  // Clear history
  const handleClearHistory = useCallback(() => {
    clearDiagnosticHistory();
    setHistory({ runs: [] });
  }, []);

  // Get latest result for a provider/model/role
  const getResult = useCallback(
    (
      provider: AIProvider,
      model: string,
      role: string
    ): ProviderDiagnosticResult | undefined => {
      if (currentRun) {
        const found = currentRun.results.find(
          (r) => r.provider === provider && r.model === model && r.role === role
        );
        if (found) return found;
      }
      // Check history
      for (const run of history.runs) {
        const found = run.results.find(
          (r) => r.provider === provider && r.model === model && r.role === role
        );
        if (found) return found;
      }
      return undefined;
    },
    [currentRun, history]
  );

  // Build test plan for display
  const testPlan = buildTestPlan();
  const totalTests = testPlan.length;
  const completedTests = currentRun?.results.length || 0;
  const latestRun = currentRun || (history.runs.length > 0 ? history.runs[0] : null);

  // Determine which roles are configured
  const hasPrimary = true;
  const hasSecondary = draftSettings.qualityCheck?.enabled !== false;
  const hasMetadata = draftSettings.metadataExtraction?.enabled !== false;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Hero Header ── */}
      <div className="rounded-2xl border border-border-muted bg-gradient-to-br from-surface-3/60 via-surface-2/40 to-surface-3/60 p-6 space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent border border-accent/15">
            <Activity size={24} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-txt-primary">
              Diagnostica AI
            </h3>
            <p className="text-xs text-txt-muted mt-0.5">
              Verifica connettività, chiavi API e tempi di risposta di tutti i
              provider configurati
            </p>
          </div>
          {latestRun?.completedAt && !isRunning && (
            <div className="text-[10px] text-txt-muted shrink-0 text-right">
              <div>Ultimo test:</div>
              <div className="font-semibold text-txt-secondary">
                {formatRelativeTime(latestRun.completedAt)}
              </div>
            </div>
          )}
        </div>

        {/* Role badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-txt-muted font-bold uppercase tracking-wider mr-1">
            Ruoli configurati:
          </span>
          <RoleBadge label="Traduzione" active={hasPrimary} />
          <RoleBadge label="Verifica Qualità" active={hasSecondary} />
          <RoleBadge label="Estrazione Metadati" active={hasMetadata} />
        </div>

        {/* Action button */}
        <div className="flex items-center justify-between">
          <button
            onClick={runDiagnostic}
            disabled={isRunning}
            className={`px-5 py-2.5 text-sm font-bold rounded-xl flex items-center gap-2.5 transition-all duration-200 ${
              isRunning
                ? 'bg-accent/20 text-accent cursor-wait'
                : 'bg-accent hover:bg-accent-hover text-white shadow-glow-accent'
            }`}
          >
            {isRunning ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RotateCcw size={16} />
            )}
            {isRunning ? 'Diagnostica in corso...' : 'Esegui Diagnostica Completa'}
          </button>

          {isRunning && (
            <span className="text-xs text-txt-muted tabular-nums">
              {completedTests}/{totalTests} completati
            </span>
          )}
        </div>

        {/* Progress bar */}
        {isRunning && (
          <div className="space-y-2">
            <div className="h-1.5 bg-surface-4 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${
                    totalTests > 0 ? (completedTests / totalTests) * 100 : 0
                  }%`,
                }}
              />
            </div>
            {currentTestLabel && (
              <div className="text-xs text-txt-muted flex items-center gap-2">
                <Loader2 size={12} className="animate-spin text-accent" />
                <span>
                  Verificando: <strong className="text-txt-secondary">{currentTestLabel}</strong>
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Overall Result Banner ── */}
      {latestRun?.completedAt && !isRunning && (
        <div
          className={`rounded-xl border p-4 flex items-center justify-between ${
            latestRun.overallStatus === 'passed'
              ? 'bg-success/5 border-success/20'
              : latestRun.overallStatus === 'partial'
              ? 'bg-warning/5 border-warning/20'
              : 'bg-danger/5 border-danger/20'
          }`}
        >
          <div className="flex items-center gap-3">
            {latestRun.overallStatus === 'passed' ? (
              <Check size={20} className="text-success" />
            ) : latestRun.overallStatus === 'partial' ? (
              <AlertTriangle size={20} className="text-warning" />
            ) : (
              <X size={20} className="text-danger" />
            )}
            <div>
              <div
                className={`text-sm font-bold ${
                  latestRun.overallStatus === 'passed'
                    ? 'text-success'
                    : latestRun.overallStatus === 'partial'
                    ? 'text-warning'
                    : 'text-danger'
                }`}
              >
                {latestRun.overallStatus === 'passed'
                  ? 'Tutti i test superati'
                  : latestRun.overallStatus === 'partial'
                  ? 'Test parziali — alcuni provider hanno problemi'
                  : 'Nessun test superato'}
              </div>
              <div className="text-[11px] text-txt-muted mt-0.5">
                {latestRun.results.filter((r) => r.status === 'success').length}/
                {latestRun.results.length} connessioni riuscite
                {latestRun.results.some((r) => r.latencyMs != null) && (
                  <span>
                    {' '}
                    · Latenza media:{' '}
                    {Math.round(
                      latestRun.results
                        .filter((r) => r.latencyMs != null)
                        .reduce((sum, r) => sum + (r.latencyMs || 0), 0) /
                        latestRun.results.filter((r) => r.latencyMs != null)
                          .length
                    )}
                    ms
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Provider Cards Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {testPlan.map((test, idx) => {
          const meta = PROVIDERS[test.provider];
          const result = getResult(test.provider, test.model, test.role);
          const status = result?.status;
          const isDisabled = disabledProviders.includes(test.provider);
          const isActiveInRun =
            isRunning &&
            currentRun?.results.length === idx &&
            currentRun?.results.every(
              (r, i) => i < idx || r.status !== 'idle'
            );

          return (
            <div
              key={`${test.provider}-${test.model}-${test.role}`}
              className={`relative rounded-xl border p-4 space-y-3 transition-all duration-300 ${
                isDisabled
                  ? 'bg-surface-4/15 border-border-muted opacity-60'
                  : status === 'success'
                  ? 'bg-success/[0.03] border-success/15'
                  : status === 'error'
                  ? 'bg-danger/[0.03] border-danger/15'
                  : isActiveInRun
                  ? 'bg-accent/[0.04] border-accent/20'
                  : 'bg-surface-4/30 border-border-muted'
              }`}
            >
              {/* Provider header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`text-sm font-bold ${
                      meta?.color || 'text-txt-primary'
                    }`}
                  >
                    {meta?.name || test.provider}
                  </span>
                  {test.role !== 'standalone' && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/15 shrink-0">
                      {test.role === 'primary'
                        ? 'Traduzione'
                        : test.role === 'secondary'
                        ? 'Verifica'
                        : 'Metadati'}
                    </span>
                  )}
                  {isDisabled && <DisabledBadge />}
                </div>
                {/* Status indicator */}
                {!isDisabled && (status === 'success' ? (
                  <span className="flex items-center gap-1.5 text-xs text-success font-bold shrink-0">
                    <Check size={14} /> Connesso
                  </span>
                ) : status === 'error' ? (
                  <span className="flex items-center gap-1.5 text-xs text-danger font-bold shrink-0">
                    <X size={14} /> Errore
                  </span>
                ) : isActiveInRun ? (
                  <span className="flex items-center gap-1.5 text-xs text-accent font-bold shrink-0">
                    <Loader2 size={14} className="animate-spin" /> Verificando...
                  </span>
                ) : status === 'testing' ? (
                  <span className="flex items-center gap-1.5 text-xs text-accent font-bold shrink-0">
                    <Loader2 size={14} className="animate-spin" /> Verificando...
                  </span>
                ) : null)}
              </div>

              {/* Model + API Key */}
              <div className="space-y-1">
                <div className="text-[11px] text-txt-secondary font-mono truncate">
                  {test.model}
                </div>
                <div className="text-[10px] text-txt-muted">
                  API Key:{' '}
                  <span
                    className={
                      test.key.trim()
                        ? 'text-txt-secondary'
                        : 'text-danger font-semibold'
                    }
                  >
                    {maskKey(test.key)}
                  </span>
                </div>
              </div>

              {/* Latency or error detail */}
              {status === 'success' && result?.latencyMs != null && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-txt-secondary tabular-nums">
                    {result.latencyMs}ms
                  </span>
                  <span
                    className={`text-[10px] font-bold ${latencyLabel(result.latencyMs).color}`}
                  >
                    {latencyLabel(result.latencyMs).text}
                  </span>
                  {result.responsePreview && (
                    <span className="text-[10px] text-txt-muted truncate ml-auto">
                      «{result.responsePreview}»
                    </span>
                  )}
                </div>
              )}

              {/* Error insight */}
              {status === 'error' && result?.errorCategory && (
                <ErrorInsight
                  category={result.errorCategory}
                  title={
                    classifyError(test.provider, result.errorMessage || '')
                      .title
                  }
                  description={
                    classifyError(test.provider, result.errorMessage || '')
                      .description
                  }
                  suggestedFix={
                    classifyError(test.provider, result.errorMessage || '')
                      .suggestedFix
                  }
                  severity={
                    classifyError(test.provider, result.errorMessage || '')
                      .severity
                  }
                />
              )}

              {/* Timestamp + retry + toggle */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-txt-muted">
                  {result?.timestamp
                    ? formatRelativeTime(result.timestamp)
                    : 'Mai testato'}
                </span>
                <div className="flex items-center gap-2">
                  {!isRunning && (
                    <button
                      onClick={() =>
                        retrySingle(test.provider, test.model, test.role)
                      }
                      className="text-[10px] font-bold text-txt-muted hover:text-accent px-2 py-1 rounded-md hover:bg-accent/10 transition-all duration-200 flex items-center gap-1"
                    >
                      <RotateCcw size={10} /> Riprova
                    </button>
                  )}
                  <button
                    onClick={() => toggleProviderDisabled(test.provider)}
                    className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200 shrink-0 ${
                      isDisabled ? 'bg-surface-4' : 'bg-accent'
                    }`}
                    title={isDisabled ? 'Riattiva provider' : 'Disattiva provider'}
                  >
                    <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform duration-200 ${
                      isDisabled ? 'translate-x-[3px]' : 'translate-x-[14px]'
                    }`} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── History Panel ── */}
      {history.runs.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs font-bold text-txt-muted uppercase tracking-wider flex items-center gap-2 py-2 select-none">
            <ChevronRight
              size={14}
              className="transition-transform group-open:rotate-90"
            />
            Cronologia Diagnostica ({history.runs.length} esecuzioni)
          </summary>
          <div className="space-y-2 mt-2">
            {history.runs.map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between text-xs text-txt-muted bg-surface-4/30 rounded-lg px-3 py-2 border border-border-muted"
              >
                <div className="flex items-center gap-2">
                  <Clock size={12} className="text-txt-faint" />
                  <span className="text-txt-secondary font-medium">
                    {new Date(run.startedAt).toLocaleString('it-IT', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <span className="tabular-nums">
                  {run.results.filter((r) => r.status === 'success').length}/
                  {run.results.length} superati
                </span>
                <span
                  className={`font-bold ${
                    run.overallStatus === 'passed'
                      ? 'text-success'
                      : run.overallStatus === 'partial'
                      ? 'text-warning'
                      : 'text-danger'
                  }`}
                >
                  {run.overallStatus === 'passed'
                    ? 'Passato'
                    : run.overallStatus === 'partial'
                    ? 'Parziale'
                    : 'Fallito'}
                </span>
              </div>
            ))}
            <button
              onClick={handleClearHistory}
              className="text-[10px] text-danger/60 hover:text-danger font-bold flex items-center gap-1 px-2 py-1 hover:bg-danger/5 rounded-md transition-colors duration-200"
            >
              <Trash2 size={10} /> Cancella cronologia
            </button>
          </div>
        </details>
      )}
    </div>
  );
};
