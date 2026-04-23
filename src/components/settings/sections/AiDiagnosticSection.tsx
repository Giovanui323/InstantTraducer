import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity, Loader2, Check, X, AlertTriangle, RotateCcw,
  ChevronRight, ChevronDown, Clock, Zap, ShieldCheck, Trash2,
  Wifi, WifiOff, Timer, ArrowRight, CircleDot
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
import { ToggleSwitch } from '../ToggleSwitch';

// ─── Props ───

interface AiDiagnosticSectionProps {
  draftSettings: AISettings;
  updateDraft: (updates: Partial<AISettings>) => void;
}

// ─── Provider metadata ───

interface ProviderMeta {
  name: string;
  color: string;
  bgLight: string;
  borderLight: string;
  getApiKey: (s: AISettings) => string;
  getModel: (s: AISettings) => string;
  test: (key: string, model: string) => Promise<{ success: boolean; message: string }>;
}

const PROVIDERS: Record<string, ProviderMeta> = {
  gemini: {
    name: 'Google Gemini',
    color: 'text-amber-400',
    bgLight: 'bg-amber-500/8',
    borderLight: 'border-amber-500/15',
    getApiKey: (s) => s.gemini?.apiKey || '',
    getModel: (s) => s.gemini?.model || 'gemini-2.5-pro',
    test: (key, model) => testGeminiConnection(key, model as any),
  },
  openai: {
    name: 'OpenAI',
    color: 'text-purple-400',
    bgLight: 'bg-purple-500/8',
    borderLight: 'border-purple-500/15',
    getApiKey: (s) => s.openai?.apiKey || '',
    getModel: (s) => s.openai?.model || 'gpt-4o',
    test: (key, model) => testOpenAIConnection(key, model),
  },
  claude: {
    name: 'Anthropic Claude',
    color: 'text-orange-400',
    bgLight: 'bg-orange-500/8',
    borderLight: 'border-orange-500/15',
    getApiKey: (s) => s.claude?.apiKey || '',
    getModel: (s) => s.claude?.model || 'claude-3-5-sonnet-20241022',
    test: (key, model) => testClaudeConnection(key, model as any),
  },
  groq: {
    name: 'Groq',
    color: 'text-emerald-400',
    bgLight: 'bg-emerald-500/8',
    borderLight: 'border-emerald-500/15',
    getApiKey: (s) => s.groq?.apiKey || '',
    getModel: (s) => s.groq?.model || 'llama-3.3-70b-versatile',
    test: (key, model) => testGroqConnection(key, model as any),
  },
  modal: {
    name: 'Modal (GLM-5.1)',
    color: 'text-violet-300',
    bgLight: 'bg-violet-500/8',
    borderLight: 'border-violet-500/15',
    getApiKey: (s) => s.modal?.apiKey || '',
    getModel: () => 'zai-org/GLM-5.1-FP8',
    test: (key) => testModalConnection(key),
  },
  zai: {
    name: 'Z.ai (Zhipu AI)',
    color: 'text-sky-400',
    bgLight: 'bg-sky-500/8',
    borderLight: 'border-sky-500/15',
    getApiKey: (s) => s.zai?.apiKey || '',
    getModel: (s) => s.zai?.model || 'glm-4v-plus',
    test: (key, model) => testZaiConnection(key, model),
  },
  openrouter: {
    name: 'OpenRouter',
    color: 'text-rose-400',
    bgLight: 'bg-rose-500/8',
    borderLight: 'border-rose-500/15',
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
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h fa`;
  return new Date(timestamp).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function latencyBadge(ms: number): { text: string; color: string; bg: string } {
  if (ms < 500) return { text: 'Veloce', color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
  if (ms < 2000) return { text: 'Normale', color: 'text-amber-400', bg: 'bg-amber-500/10' };
  if (ms < 5000) return { text: 'Lento', color: 'text-orange-400', bg: 'bg-orange-500/10' };
  return { text: 'Molto lento', color: 'text-red-400', bg: 'bg-red-500/10' };
}

function maskKey(key: string): string {
  if (!key) return 'non configurata';
  if (key.length <= 8) return '••••••••';
  return '••••' + key.slice(-4);
}

const ROLE_META: Record<string, { label: string; color: string; bg: string }> = {
  primary: { label: 'Traduzione', color: 'text-sky-400', bg: 'bg-sky-500/10' },
  secondary: { label: 'Verifica', color: 'text-violet-400', bg: 'bg-violet-500/10' },
  metadata: { label: 'Metadati', color: 'text-teal-400', bg: 'bg-teal-500/10' },
  standalone: { label: 'Extra', color: 'text-txt-muted', bg: 'bg-surface-4/50' },
};

// ─── Main Component ───

export const AiDiagnosticSection: React.FC<AiDiagnosticSectionProps> = ({
  draftSettings,
  updateDraft,
}) => {
  const [history, setHistory] = useState<DiagnosticHistory>({ runs: [] });
  const [currentRun, setCurrentRun] = useState<DiagnosticRun | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTestLabel, setCurrentTestLabel] = useState('');
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
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

  useEffect(() => { setHistory(loadDiagnosticHistory()); }, []);

  // Build test plan
  const buildTestPlan = useCallback((): Array<{
    provider: AIProvider; model: string; role: ProviderDiagnosticResult['role']; key: string;
  }> => {
    const plan: Array<{ provider: AIProvider; model: string; role: ProviderDiagnosticResult['role']; key: string }> = [];
    const s = draftSettings;
    const provider = s.provider || 'gemini';

    const primaryMeta = PROVIDERS[provider];
    if (primaryMeta) plan.push({ provider: provider as AIProvider, model: primaryMeta.getModel(s), role: 'primary', key: primaryMeta.getApiKey(s) });

    const vProvider = s.qualityCheck?.verifierProvider || 'gemini';
    const vModel = s.qualityCheck?.verifierModel || GEMINI_VERIFIER_MODEL;
    const vMeta = PROVIDERS[vProvider];
    if (vMeta) plan.push({ provider: vProvider as AIProvider, model: vModel, role: 'secondary', key: vMeta.getApiKey(s) });

    const mProvider = s.metadataExtraction?.provider || 'gemini';
    const mModel = s.metadataExtraction?.model || GEMINI_TRANSLATION_FLASH_MODEL;
    const mMeta = PROVIDERS[mProvider];
    if (mMeta) plan.push({ provider: mProvider as AIProvider, model: mModel, role: 'metadata', key: mMeta.getApiKey(s) });

    const testedProviders = new Set(plan.map(t => t.provider));
    for (const [pId, meta] of Object.entries(PROVIDERS)) {
      if (testedProviders.has(pId as AIProvider)) continue;
      const key = meta.getApiKey(s);
      if (!key.trim()) continue;
      plan.push({ provider: pId as AIProvider, model: meta.getModel(s), role: 'standalone', key });
    }

    if (s.customProviders?.length) {
      for (const cp of s.customProviders) {
        plan.push({ provider: 'custom' as AIProvider, model: cp.model || 'custom', role: 'standalone', key: cp.apiKey || '' });
      }
    }

    return plan;
  }, [draftSettings]);

  // Run single test
  const runSingleTest = useCallback(async (
    provider: AIProvider, model: string, role: ProviderDiagnosticResult['role'], key: string
  ): Promise<ProviderDiagnosticResult> => {
    const meta = PROVIDERS[provider];
    if (!key.trim()) return { provider, model, role, status: 'error', timestamp: Date.now(), errorCategory: 'invalid_key', errorMessage: 'API Key non configurata' };
    setCurrentTestLabel(`${meta?.name || provider} · ${model}`);
    const start = performance.now();
    let result: { success: boolean; message: string };
    try {
      if (provider === 'custom') {
        const cp = draftSettings.customProviders?.find(c => c.model === model);
        result = cp ? await testCustomProviderConnection(cp) : { success: false, message: 'Provider custom non trovato' };
      } else if (meta) {
        result = await meta.test(key, model);
      } else {
        result = { success: false, message: 'Provider non supportato' };
      }
    } catch (e: any) {
      result = { success: false, message: e?.message || 'Errore imprevisto' };
    }
    const latencyMs = Math.round(performance.now() - start);
    if (result.success) return { provider, model, role, status: 'success', latencyMs, timestamp: Date.now(), responsePreview: result.message.length > 80 ? result.message.slice(0, 80) + '...' : result.message };
    const insight = classifyError(provider, result.message);
    return { provider, model, role, status: 'error', latencyMs, timestamp: Date.now(), errorCategory: insight.category, errorMessage: result.message };
  }, [draftSettings.customProviders]);

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
      const result = await runSingleTest(plan[i].provider, plan[i].model, plan[i].role, plan[i].key);
      const updatedResults = [...run.results, result];
      run.results = updatedResults;
      setCurrentRun({ ...run, results: updatedResults });
    }
    const finalRun: DiagnosticRun = { ...run, completedAt: Date.now(), overallStatus: computeOverallStatus(run.results) };
    setCurrentRun(finalRun);
    saveDiagnosticRun(finalRun);
    setHistory(loadDiagnosticHistory());
    setIsRunning(false);
    setCurrentTestLabel('');
  }, [isRunning, buildTestPlan, runSingleTest]);

  // Retry single
  const retrySingle = useCallback(async (provider: AIProvider, model: string, role: ProviderDiagnosticResult['role']) => {
    if (isRunning) return;
    const meta = PROVIDERS[provider];
    const key = meta ? meta.getApiKey(draftSettings) : '';
    if (!key.trim()) return;
    setIsRunning(true);
    setCurrentTestLabel(`${meta?.name || provider} · ${model}`);
    const result = await runSingleTest(provider, model, role, key);
    setCurrentRun(prev => {
      if (!prev) {
        const newRun: DiagnosticRun = { id: `run-${Date.now()}`, startedAt: Date.now(), completedAt: Date.now(), results: [result], overallStatus: computeOverallStatus([result]) };
        saveDiagnosticRun(newRun); setHistory(loadDiagnosticHistory()); setIsRunning(false); setCurrentTestLabel('');
        return newRun;
      }
      const updatedResults = prev.results.map(r => r.provider === provider && r.model === model && r.role === role ? result : r);
      const exists = prev.results.some(r => r.provider === provider && r.model === model && r.role === role);
      const finalResults = exists ? updatedResults : [...prev.results, result];
      const updated: DiagnosticRun = { ...prev, results: finalResults, overallStatus: computeOverallStatus(finalResults) };
      saveDiagnosticRun(updated); setHistory(loadDiagnosticHistory()); setIsRunning(false); setCurrentTestLabel('');
      return updated;
    });
  }, [isRunning, draftSettings, runSingleTest]);

  const handleClearHistory = useCallback(() => { clearDiagnosticHistory(); setHistory({ runs: [] }); }, []);

  const getResult = useCallback((provider: AIProvider, model: string, role: string): ProviderDiagnosticResult | undefined => {
    if (currentRun) { const found = currentRun.results.find(r => r.provider === provider && r.model === model && r.role === role); if (found) return found; }
    for (const run of history.runs) { const found = run.results.find(r => r.provider === provider && r.model === model && r.role === role); if (found) return found; }
    return undefined;
  }, [currentRun, history]);

  const testPlan = buildTestPlan();
  const totalTests = testPlan.length;
  const completedTests = currentRun?.results.length || 0;
  const latestRun = currentRun || (history.runs.length > 0 ? history.runs[0] : null);

  // Computed stats
  const successCount = latestRun?.results.filter(r => r.status === 'success').length || 0;
  const errorCount = latestRun?.results.filter(r => r.status === 'error').length || 0;
  const avgLatency = latestRun?.results.filter(r => r.latencyMs != null).length
    ? Math.round(latestRun!.results.filter(r => r.latencyMs != null).reduce((s, r) => s + (r.latencyMs || 0), 0) / latestRun!.results.filter(r => r.latencyMs != null).length)
    : null;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Control Bar ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/15 flex items-center justify-center text-accent shrink-0">
            <Activity size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-txt-primary">Diagnostica AI</div>
            <div className="text-[11px] text-txt-muted">Verifica connettività e tempi di risposta</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {latestRun?.completedAt && !isRunning && (
            <span className="text-[10px] text-txt-muted tabular-nums hidden sm:block">
              {formatRelativeTime(latestRun.completedAt)}
            </span>
          )}
          <button
            onClick={runDiagnostic}
            disabled={isRunning}
            className={`px-4 py-2 text-[12px] font-bold rounded-xl flex items-center gap-2 transition-all duration-200 ${
              isRunning
                ? 'bg-accent/15 text-accent/80 cursor-wait'
                : 'bg-accent hover:bg-accent-hover text-white shadow-glow-accent'
            }`}
          >
            {isRunning ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            {isRunning ? `${completedTests}/${totalTests}` : 'Esegui Test'}
          </button>
        </div>
      </div>

      {/* ── Progress Bar ── */}
      {isRunning && (
        <div className="space-y-2 animate-fade-in">
          <div className="h-1 bg-surface-4 rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all duration-500 ease-out" style={{ width: `${totalTests > 0 ? (completedTests / totalTests) * 100 : 0}%` }} />
          </div>
          {currentTestLabel && (
            <div className="text-[11px] text-txt-muted flex items-center gap-2">
              <Loader2 size={12} className="animate-spin text-accent" />
              <span>Verificando <strong className="text-txt-secondary">{currentTestLabel}</strong></span>
            </div>
          )}
        </div>
      )}

      {/* ── Dashboard Summary ── */}
      {latestRun?.completedAt && !isRunning && (
        <div className="grid grid-cols-3 gap-3 animate-fade-in">
          <div className={`rounded-xl border p-3 text-center ${
            latestRun.overallStatus === 'passed' ? 'bg-emerald-500/[0.04] border-emerald-500/15' :
            latestRun.overallStatus === 'partial' ? 'bg-amber-500/[0.04] border-amber-500/15' :
            'bg-red-500/[0.04] border-red-500/15'
          }`}>
            <div className={`text-2xl font-bold tabular-nums ${
              latestRun.overallStatus === 'passed' ? 'text-emerald-400' :
              latestRun.overallStatus === 'partial' ? 'text-amber-400' : 'text-red-400'
            }`}>
              {successCount}/{latestRun.results.length}
            </div>
            <div className="text-[10px] text-txt-muted font-bold uppercase tracking-wider mt-1">Superati</div>
          </div>
          <div className="rounded-xl border border-border-muted bg-surface-4/30 p-3 text-center">
            <div className="text-2xl font-bold text-txt-primary tabular-nums">
              {avgLatency != null ? `${avgLatency}` : '—'}
            </div>
            <div className="text-[10px] text-txt-muted font-bold uppercase tracking-wider mt-1">ms Media</div>
          </div>
          <div className={`rounded-xl border p-3 text-center ${
            errorCount === 0 ? 'bg-surface-4/30 border-border-muted' : 'bg-red-500/[0.04] border-red-500/15'
          }`}>
            <div className={`text-2xl font-bold tabular-nums ${errorCount > 0 ? 'text-red-400' : 'text-txt-muted'}`}>
              {errorCount}
            </div>
            <div className="text-[10px] text-txt-muted font-bold uppercase tracking-wider mt-1">Errori</div>
          </div>
        </div>
      )}

      {/* ── Provider Cards ── */}
      <div className="space-y-2">
        {testPlan.map((test, idx) => {
          const meta = PROVIDERS[test.provider];
          const result = getResult(test.provider, test.model, test.role);
          const status = result?.status;
          const isDisabled = disabledProviders.includes(test.provider);
          const isActiveInRun = isRunning && currentRun?.results.length === idx;
          const isExpanded = expandedProvider === `${test.provider}-${test.model}-${test.role}`;
          const roleMeta = ROLE_META[test.role] || ROLE_META.standalone;
          const cardKey = `${test.provider}-${test.model}-${test.role}`;

          // Status bar color on left
          const statusBar = status === 'success' ? 'bg-emerald-500' : status === 'error' ? 'bg-red-500' : isActiveInRun ? 'bg-accent' : 'bg-transparent';

          return (
            <div
              key={cardKey}
              className={`relative rounded-xl border overflow-hidden transition-all duration-200 ${
                isDisabled
                  ? 'bg-surface-4/10 border-border-muted/50 opacity-50'
                  : status === 'success'
                  ? 'bg-surface-4/20 border-emerald-500/10'
                  : status === 'error'
                  ? 'bg-surface-4/20 border-red-500/10'
                  : isActiveInRun
                  ? 'bg-accent/[0.03] border-accent/15 ring-1 ring-accent/10'
                  : 'bg-surface-4/20 border-border-muted'
              }`}
            >
              {/* Status bar */}
              <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl ${statusBar} transition-colors duration-300`} />

              <div className="pl-4 pr-3 py-3">
                {/* Row 1: Provider + Role + Status */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-[13px] font-bold ${meta?.color || 'text-txt-primary'} truncate`}>
                      {meta?.name || test.provider}
                    </span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${roleMeta.bg} ${roleMeta.color} border border-current/10 shrink-0`}>
                      {roleMeta.label}
                    </span>
                    {isDisabled && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/15 shrink-0 flex items-center gap-0.5">
                        <WifiOff size={8} /> OFF
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {status === 'success' && (
                      <span className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-bold">
                        <Check size={13} /> OK
                      </span>
                    )}
                    {status === 'error' && (
                      <button
                        onClick={() => setExpandedProvider(isExpanded ? null : cardKey)}
                        className="flex items-center gap-1.5 text-[11px] text-red-400 font-bold hover:text-red-300 transition-colors"
                      >
                        <X size={13} /> Errore
                        <ChevronDown size={12} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                    {isActiveInRun && (
                      <span className="flex items-center gap-1.5 text-[11px] text-accent font-bold">
                        <Loader2 size={13} className="animate-spin" />
                      </span>
                    )}
                  </div>
                </div>

                {/* Row 2: Model + Key + Latency */}
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-[11px] text-txt-secondary font-mono truncate">
                    {test.model}
                  </span>
                  <span className="text-[10px] text-txt-faint">
                    key: {maskKey(test.key)}
                  </span>
                  {status === 'success' && result?.latencyMs != null && (() => {
                    const lb = latencyBadge(result.latencyMs);
                    return (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${lb.bg} ${lb.color} ml-auto shrink-0`}>
                        {result.latencyMs}ms · {lb.text}
                      </span>
                    );
                  })()}
                </div>

                {/* Expanded error detail */}
                {isExpanded && status === 'error' && result?.errorMessage && (
                  <div className="mt-3 p-3 rounded-xl bg-red-500/[0.04] border border-red-500/10 space-y-2 animate-fade-in">
                    {(() => {
                      const insight = classifyError(test.provider, result.errorMessage);
                      return (
                        <>
                          <div className="flex items-center gap-2 text-[11px] font-bold text-red-400">
                            <AlertTriangle size={13} />
                            {insight.title}
                          </div>
                          <p className="text-[11px] text-txt-muted leading-relaxed">{insight.description}</p>
                          <div className="flex items-start gap-2 text-[11px] text-txt-secondary leading-relaxed">
                            <ArrowRight size={12} className="shrink-0 mt-0.5 text-accent" />
                            {insight.suggestedFix}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* Row 3: Actions */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border-muted/30">
                  <span className="text-[10px] text-txt-faint">
                    {result?.timestamp ? formatRelativeTime(result.timestamp) : 'In attesa'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {!isRunning && result && (
                      <button
                        onClick={() => retrySingle(test.provider, test.model, test.role)}
                        className="text-[10px] font-bold text-txt-muted hover:text-accent px-2 py-1 rounded-lg hover:bg-accent/5 transition-all duration-200 flex items-center gap-1"
                      >
                        <RotateCcw size={10} /> Riprova
                      </button>
                    )}
                    <ToggleSwitch
                      checked={!isDisabled}
                      onChange={() => toggleProviderDisabled(test.provider)}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── History Panel ── */}
      {history.runs.length > 0 && (
        <div className="border-t border-border-muted/30 pt-4">
          <button
            onClick={() => setShowHistory(prev => !prev)}
            className="flex items-center gap-2 text-[11px] font-bold text-txt-muted uppercase tracking-wider hover:text-txt-secondary transition-colors w-full"
          >
            <ChevronRight size={13} className={`transition-transform ${showHistory ? 'rotate-90' : ''}`} />
            Cronologia ({history.runs.length} esecuzioni)
          </button>
          {showHistory && (
            <div className="space-y-1.5 mt-3 animate-fade-in">
              {history.runs.map((run) => {
                const passed = run.results.filter(r => r.status === 'success').length;
                const total = run.results.length;
                return (
                  <div key={run.id} className="flex items-center justify-between text-[11px] bg-surface-4/20 rounded-xl px-3 py-2 border border-border-muted/50">
                    <div className="flex items-center gap-2">
                      <Clock size={11} className="text-txt-faint" />
                      <span className="text-txt-secondary font-medium">
                        {new Date(run.startedAt).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <span className="text-txt-muted tabular-nums">{passed}/{total}</span>
                    <span className={`font-bold ${
                      run.overallStatus === 'passed' ? 'text-emerald-400' :
                      run.overallStatus === 'partial' ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {run.overallStatus === 'passed' ? 'Passato' : run.overallStatus === 'partial' ? 'Parziale' : 'Fallito'}
                    </span>
                  </div>
                );
              })}
              <button
                onClick={handleClearHistory}
                className="text-[10px] text-red-400/60 hover:text-red-400 font-bold flex items-center gap-1 px-2 py-1.5 hover:bg-red-500/5 rounded-lg transition-colors duration-200"
              >
                <Trash2 size={10} /> Cancella cronologia
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
