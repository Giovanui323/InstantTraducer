import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  Cpu, Loader2, Play, Square, AlertTriangle, Check, X,
  ChevronDown, ChevronRight, Award, DollarSign, Clock, ArrowUpDown
} from 'lucide-react';
import type { AIProvider, AISettings } from '../../../types';
import { getAvailableModels, MergedModelInfo } from '../../../services/modelManager';
import { estimateModelCostPerPageUSD } from '../../../services/usageTracker';
import {
  runFullBenchmark,
  BenchmarkRun,
  BenchmarkModelResult,
} from '../../../services/modelBenchmark';
import { GEMINI_VERIFIER_PRO_MODEL, GEMINI_MODELS_LIST, CLAUDE_MODELS_LIST, OPENAI_MODELS_LIST, GROQ_MODELS_LIST, ZAI_MODELS_LIST, MODAL_MODELS_LIST } from '../../../constants';
import { selectClasses } from '../sharedStyles';

// ─── Props ───

interface ModelBenchmarkSectionProps {
  draftSettings: AISettings;
  updateDraft: (updates: Partial<AISettings>) => void;
  getPageImage?: (page: number) => Promise<string | null | undefined>;
  totalPages?: number;
}

// ─── Provider meta ───

const PROVIDER_META: Record<string, { name: string; color: string; hasApiKey: (s: AISettings) => boolean }> = {
  gemini: { name: 'Google Gemini', color: 'text-amber-400', hasApiKey: (s) => !!s.gemini?.apiKey?.trim() },
  claude: { name: 'Anthropic Claude', color: 'text-orange-400', hasApiKey: (s) => !!s.claude?.apiKey?.trim() },
  openai: { name: 'OpenAI', color: 'text-purple-400', hasApiKey: (s) => !!s.openai?.apiKey?.trim() },
  groq: { name: 'Groq', color: 'text-emerald-400', hasApiKey: (s) => !!s.groq?.apiKey?.trim() },
  zai: { name: 'Z.ai', color: 'text-sky-400', hasApiKey: (s) => !!s.zai?.apiKey?.trim() },
  modal: { name: 'Modal', color: 'text-violet-300', hasApiKey: (s) => !!s.modal?.apiKey?.trim() },
  openrouter: { name: 'OpenRouter', color: 'text-rose-400', hasApiKey: (s) => !!s.openrouter?.apiKey?.trim() },
};

type SortKey = 'quality' | 'cost' | 'speed';

// ─── Component ───

export const ModelBenchmarkSection: React.FC<ModelBenchmarkSectionProps> = ({
  draftSettings,
  getPageImage,
  totalPages = 0,
}) => {
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('gemini');
  const [selectedPage, setSelectedPage] = useState(1);
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [judgeProvider, setJudgeProvider] = useState<AIProvider>(
    draftSettings.qualityCheck?.verifierProvider || 'gemini'
  );
  const [judgeModel, setJudgeModel] = useState(
    draftSettings.qualityCheck?.verifierModel || GEMINI_VERIFIER_PRO_MODEL
  );
  const [results, setResults] = useState<BenchmarkModelResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [creditExhausted, setCreditExhausted] = useState(false);
  const [currentModelIndex, setCurrentModelIndex] = useState(-1);
  const [totalModels, setTotalModels] = useState(0);
  const [sortBy, setSortBy] = useState<SortKey>('quality');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const models = useMemo(
    () => getAvailableModels(selectedProvider, draftSettings),
    [selectedProvider, draftSettings]
  );

  const hasApiKey = PROVIDER_META[selectedProvider]?.hasApiKey(draftSettings) ?? false;
  const canRun = hasApiKey && totalPages > 0 && !isRunning;

  const estimatedCost = useMemo(() => {
    return models.reduce((sum, m) => {
      const cost = estimateModelCostPerPageUSD(m.id, {
        pricingOverride: m.pricing
          ? { input: String(m.pricing.input), output: String(m.pricing.output) }
          : undefined,
      });
      return sum + cost * 2; // translate + verify
    }, 0);
  }, [models]);

  const sortedResults = useMemo(() => {
    const sorted = [...results];
    if (sortBy === 'quality') sorted.sort((a, b) => (b.qualityScore ?? -1) - (a.qualityScore ?? -1));
    else if (sortBy === 'cost') sorted.sort((a, b) => (a.costPerPage ?? Infinity) - (b.costPerPage ?? Infinity));
    else if (sortBy === 'speed') sorted.sort((a, b) => (a.translationLatencyMs ?? Infinity) - (b.translationLatencyMs ?? Infinity));
    return sorted;
  }, [results, sortBy]);

  // ─── Run benchmark ───

  const startBenchmark = useCallback(async () => {
    if (!getPageImage) return;
    setIsRunning(true);
    setCreditExhausted(false);
    setResults([]);
    setCurrentModelIndex(0);
    setTotalModels(models.length);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const imageBase64 = await getPageImage(selectedPage);
      if (!imageBase64 || controller.signal.aborted) {
        setIsRunning(false);
        setCurrentModelIndex(-1);
        return;
      }

      const generator = runFullBenchmark({
        settings: draftSettings,
        provider: selectedProvider,
        imageBase64,
        pageNumber: selectedPage,
        sourceLanguage,
        judgeProvider,
        judgeModel,
        signal: controller.signal,
      });

      const collected: BenchmarkModelResult[] = [];
      for await (const { index, result, creditExhausted: noCredit } of generator) {
        if (controller.signal.aborted) break;
        collected.push(result);
        setResults([...collected]);
        setCurrentModelIndex(index + 1);
        if (noCredit) {
          setCreditExhausted(true);
          controller.abort();
        }
      }
    } catch {
      // aborted or error
    } finally {
      setIsRunning(false);
      setCurrentModelIndex(-1);
      abortRef.current = null;
    }
  }, [getPageImage, draftSettings, selectedProvider, selectedPage, sourceLanguage, judgeProvider, judgeModel, models.length]);

  const stopBenchmark = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ─── Score badge ───

  const scoreBadge = (score: number | undefined) => {
    if (score === undefined) return null;
    let color = 'text-red-400 bg-red-500/10 border-red-500/15';
    if (score >= 80) color = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/15';
    else if (score >= 60) color = 'text-amber-400 bg-amber-500/10 border-amber-500/15';
    return (
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${color} tabular-nums`}>
        {score}/100
      </span>
    );
  };

  // ─── Render ───

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/15 flex items-center justify-center text-accent shrink-0">
            <Cpu size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-txt-primary">Benchmark Modelli</div>
            <div className="text-[11px] text-txt-muted">Confronta tutti i modelli di un provider su una pagina di prova</div>
          </div>
        </div>
      </div>

      {/* Config */}
      <div className="bg-surface-4/20 border border-border-muted rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Provider */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-txt-muted tracking-wider">Provider</label>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value as AIProvider)}
              className={`${selectClasses} w-full`}
            >
              {Object.entries(PROVIDER_META).map(([id, meta]) => (
                <option key={id} value={id}>{meta.name}</option>
              ))}
            </select>
          </div>

          {/* Page */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-txt-muted tracking-wider">Pagina</label>
            <select
              value={selectedPage}
              onChange={(e) => setSelectedPage(Number(e.target.value))}
              className={`${selectClasses} w-full`}
              disabled={totalPages === 0}
            >
              {totalPages === 0 ? (
                <option value={1}>Nessun progetto</option>
              ) : (
                Array.from({ length: totalPages }, (_, i) => (
                  <option key={i + 1} value={i + 1}>Pagina {i + 1}</option>
                ))
              )}
            </select>
          </div>

          {/* Source Language */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-txt-muted tracking-wider">Lingua origine</label>
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value)}
              className={`${selectClasses} w-full`}
            >
              <option value="en">Inglese</option>
              <option value="de">Tedesco</option>
              <option value="fr">Francese</option>
              <option value="es">Spagnolo</option>
              <option value="pt">Portoghese</option>
              <option value="ja">Giapponese</option>
              <option value="zh">Cinese</option>
              <option value="ko">Coreano</option>
              <option value="ru">Russo</option>
              <option value="ar">Arabo</option>
            </select>
          </div>

          {/* Judge */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-txt-muted tracking-wider">Giudice (verifica)</label>
            <select
              value={`${judgeProvider}|${judgeModel}`}
              onChange={(e) => {
                const [p, ...rest] = e.target.value.split('|');
                setJudgeProvider(p as AIProvider);
                setJudgeModel(rest.join('|'));
              }}
              className={`${selectClasses} w-full`}
            >
              <option value={`gemini|${GEMINI_VERIFIER_PRO_MODEL}`}>Gemini Pro (consigliato)</option>
              <option value={`claude|claude-sonnet-4-20250514`}>Claude Sonnet 4</option>
              <option value={`openai|gpt-4o`}>GPT-4o</option>
            </select>
          </div>
        </div>

        {/* Models count + cost estimate */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="text-[10px] text-txt-muted">
            {models.length} modelli disponibili — Costo stimato totale: <span className="text-warning font-bold">${estimatedCost.toFixed(4)}</span>
          </div>
          <div className="flex items-center gap-2">
            {!hasApiKey && (
              <span className="text-[10px] text-red-400 flex items-center gap-1">
                <AlertTriangle size={10} /> API Key mancante
              </span>
            )}
            {totalPages === 0 && (
              <span className="text-[10px] text-amber-400 flex items-center gap-1">
                <AlertTriangle size={10} /> Apri un progetto
              </span>
            )}
            {!isRunning ? (
              <button
                onClick={startBenchmark}
                disabled={!canRun}
                className={`px-4 py-2 text-[12px] font-bold rounded-xl flex items-center gap-2 transition-all duration-200 ${
                  canRun
                    ? 'bg-accent hover:bg-accent-hover text-white shadow-glow-accent'
                    : 'bg-surface-4/50 text-txt-muted cursor-not-allowed'
                }`}
              >
                <Play size={14} /> Avvia Benchmark
              </button>
            ) : (
              <button
                onClick={stopBenchmark}
                className="px-4 py-2 text-[12px] font-bold rounded-xl flex items-center gap-2 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-all duration-200"
              >
                <Square size={14} /> Ferma
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Progress */}
      {isRunning && (
        <div className="space-y-2 animate-fade-in">
          <div className="h-1 bg-surface-4 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
              style={{ width: `${totalModels > 0 ? (currentModelIndex / totalModels) * 100 : 0}%` }}
            />
          </div>
          <div className="text-[11px] text-txt-muted flex items-center gap-2">
            <Loader2 size={12} className="animate-spin text-accent" />
            <span>{currentModelIndex}/{totalModels} — Traduzione e verifica in corso...</span>
          </div>
        </div>
      )}

      {/* Credit exhausted banner */}
      {creditExhausted && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3 animate-fade-in">
          <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-[12px] font-bold text-red-400">Crediti esauriti</div>
            <div className="text-[11px] text-red-400/80 mt-0.5">
              Il benchmark è stato interrotto perché il provider ha segnalato crediti o quota insufficienti.
              I risultati parziali raccolti fino a questo punto sono mostrati sotto.
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3 animate-fade-in">
          {/* Sort controls */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-txt-muted uppercase font-bold tracking-wider">Ordina per:</span>
            {([
              { key: 'quality' as SortKey, label: 'Qualità', icon: <Award size={10} /> },
              { key: 'cost' as SortKey, label: 'Costo', icon: <DollarSign size={10} /> },
              { key: 'speed' as SortKey, label: 'Velocità', icon: <Clock size={10} /> },
            ]).map(opt => (
              <button
                key={opt.key}
                onClick={() => setSortBy(opt.key)}
                className={`text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1 transition-all ${
                  sortBy === opt.key
                    ? 'bg-accent/15 text-accent border border-accent/20'
                    : 'text-txt-muted hover:text-txt-secondary'
                }`}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>

          {/* Table header */}
          <div className="grid grid-cols-[32px_1fr_80px_80px_70px_40px] gap-2 px-3 py-1.5 text-[9px] font-bold uppercase text-txt-muted tracking-wider border-b border-border-muted">
            <div>#</div>
            <div>Modello</div>
            <div>Qualità</div>
            <div>Costo/Pag</div>
            <div>Tempo</div>
            <div></div>
          </div>

          {/* Rows */}
          {sortedResults.map((r, idx) => {
            const isExpanded = expandedRow === r.modelId;
            const statusIcon = r.status === 'success'
              ? <Check size={12} className="text-emerald-400" />
              : r.status === 'error'
              ? <X size={12} className="text-red-400" />
              : <Loader2 size={12} className="animate-spin text-accent" />;

            return (
              <div key={r.modelId} className="space-y-0">
                <div
                  className={`grid grid-cols-[32px_1fr_80px_80px_70px_40px] gap-2 px-3 py-2.5 items-center rounded-lg border transition-all ${
                    r.status === 'success'
                      ? 'bg-surface-4/20 border-border-muted hover:border-emerald-500/20'
                      : r.status === 'error'
                      ? 'bg-red-500/[0.03] border-red-500/10'
                      : 'bg-accent/[0.03] border-accent/15'
                  }`}
                >
                  <div className="text-[11px] font-bold text-txt-muted tabular-nums text-center">{idx + 1}</div>
                  <div className="text-[12px] font-medium text-txt-primary truncate" title={r.modelId}>
                    {r.modelName}
                  </div>
                  <div className="flex justify-center">{scoreBadge(r.qualityScore)}</div>
                  <div className="text-[11px] font-mono text-txt-secondary tabular-nums">
                    {r.costPerPage === 0 ? 'FREE' : r.costPerPage !== undefined ? `$${r.costPerPage.toFixed(4)}` : '—'}
                  </div>
                  <div className="text-[11px] font-mono text-txt-secondary tabular-nums">
                    {r.translationLatencyMs !== undefined ? `${(r.translationLatencyMs / 1000).toFixed(1)}s` : '—'}
                  </div>
                  <div className="flex justify-center">
                    {r.verification && (
                      <button
                        onClick={() => setExpandedRow(isExpanded ? null : r.modelId)}
                        className="text-txt-muted hover:text-txt-secondary transition-colors"
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && r.verification && (
                  <div className="bg-surface-4/30 border border-border-muted border-t-0 rounded-b-lg px-4 py-3 space-y-2 animate-fade-in">
                    {r.verification.summary && (
                      <div className="text-[11px] text-txt-secondary">{r.verification.summary}</div>
                    )}
                    {r.verification.severity && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase text-txt-muted">Severità:</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          r.verification.severity === 'ok' ? 'text-emerald-400 bg-emerald-500/10' :
                          r.verification.severity === 'minor' ? 'text-amber-400 bg-amber-500/10' :
                          'text-red-400 bg-red-500/10'
                        }`}>
                          {r.verification.severity.toUpperCase()}
                        </span>
                      </div>
                    )}
                    {r.verification.evidence && r.verification.evidence.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase text-txt-muted">Evidenze:</span>
                        {r.verification.evidence.map((ev, i) => (
                          <div key={i} className="text-[11px] text-txt-muted pl-3 border-l-2 border-border-muted">
                            {ev}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-4 text-[10px] text-txt-muted pt-1">
                      <span>Traduzione: {r.translationLatencyMs ? `${r.translationLatencyMs}ms` : '—'}</span>
                      <span>Verifica: {r.verificationLatencyMs ? `${r.verificationLatencyMs}ms` : '—'}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {results.length === 0 && !isRunning && (
        <div className="text-center py-10 text-txt-muted">
          <Cpu size={32} className="mx-auto mb-3 opacity-20" />
          <div className="text-[12px]">Seleziona un provider e avvia il benchmark per confrontare i modelli.</div>
          <div className="text-[10px] mt-1">Ogni modello tradurrà la pagina selezionata e verrà valutato dal giudice.</div>
        </div>
      )}
    </div>
  );
};
