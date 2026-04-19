import React from 'react';
import { BrainCircuit, ShieldCheck, FileText, Info, Lock } from 'lucide-react';
import type { AISettings, AIProvider } from '../../../types';

const PROVIDER_LABEL: Record<string, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  claude: 'Anthropic Claude',
  groq: 'Groq',
  modal: 'Modal',
  zai: 'Z.ai (Zhipu)',
  openrouter: 'OpenRouter',
  custom: 'Provider custom',
};

const providerLabel = (p: AIProvider | string | undefined, settings?: AISettings): string => {
  if (!p) return '—';
  if (p === 'custom') {
    const cp = settings?.customProviders?.find(c => c.id === settings?.activeCustomProviderId);
    return cp?.name || PROVIDER_LABEL.custom;
  }
  return PROVIDER_LABEL[p] || String(p);
};

const providerModel = (p: AIProvider | string | undefined, settings: AISettings): string => {
  if (!p) return '—';
  switch (p) {
    case 'gemini': return settings.gemini?.model || '—';
    case 'openai': return settings.openai?.model || '—';
    case 'claude': return settings.claude?.model || '—';
    case 'groq': return settings.groq?.model || '—';
    case 'openrouter': return settings.openrouter?.model || '—';
    case 'zai': return settings.zai?.model || '—';
    case 'modal': return 'zai-org/GLM-5.1-FP8';
    case 'custom': {
      const cp = settings.customProviders?.find(c => c.id === settings.activeCustomProviderId);
      return cp?.model || '—';
    }
    default: return '—';
  }
};

interface ModelCardProps {
  icon: React.ReactNode;
  label: string;
  provider: string;
  model: string;
  tone: 'success' | 'accent' | 'neutral';
  disabledHint?: string;
}

const ModelCard: React.FC<ModelCardProps> = ({ icon, label, provider, model, tone, disabledHint }) => {
  const toneClasses = tone === 'success'
    ? 'bg-success/10 border-success/20 text-success'
    : tone === 'accent'
      ? 'bg-accent/10 border-accent/20 text-accent'
      : 'bg-surface-3/50 border-border-muted text-txt-primary';
  return (
    <div className={`relative overflow-hidden rounded-xl border p-4 ${toneClasses}`}>
      <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest opacity-80">
        {icon}
        <span>{label}</span>
      </div>
      {disabledHint ? (
        <div className="mt-2 text-sm font-bold">{disabledHint}</div>
      ) : (
        <>
          <div className="mt-2 text-sm font-bold">{provider}</div>
          <div className="text-xs text-txt-muted mt-1 font-mono truncate">{model}</div>
        </>
      )}
    </div>
  );
};

interface ReadOnlyModelsSectionProps {
  settings: AISettings;
}

export const ReadOnlyModelsSection: React.FC<ReadOnlyModelsSectionProps> = ({ settings }) => {
  const primaryProvider = settings.provider;
  const primaryModel = providerModel(primaryProvider, settings);

  const qc = settings.qualityCheck;
  const verifierEnabled = !!qc?.enabled;
  const verifierProvider = qc?.verifierProvider;
  const verifierModel = qc?.verifierModel || providerModel(verifierProvider, settings);

  const meta = settings.metadataExtraction;
  const metadataEnabled = !!meta?.enabled;
  const metadataProvider = meta?.provider;
  const metadataModel = meta?.model || providerModel(metadataProvider, settings);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-surface-4/50 flex items-center justify-center text-txt-primary border border-border-muted">
          <Lock size={18} />
        </div>
        <div>
          <div className="text-sm font-bold text-txt-primary">Modelli in uso</div>
          <div className="text-[11px] text-txt-muted">
            Vista di sola lettura dei modelli attualmente configurati per il tuo account.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ModelCard
          icon={<BrainCircuit size={12} />}
          label="Traduzione primaria"
          provider={providerLabel(primaryProvider, settings)}
          model={primaryModel}
          tone="success"
        />
        <ModelCard
          icon={<ShieldCheck size={12} />}
          label="Verifica qualità"
          provider={verifierEnabled ? providerLabel(verifierProvider, settings) : ''}
          model={verifierEnabled ? verifierModel : ''}
          tone="accent"
          disabledHint={verifierEnabled ? undefined : 'Disattivata'}
        />
        <ModelCard
          icon={<FileText size={12} />}
          label="Estrazione metadati"
          provider={metadataEnabled ? providerLabel(metadataProvider, settings) : ''}
          model={metadataEnabled ? metadataModel : ''}
          tone="neutral"
          disabledHint={metadataEnabled ? undefined : 'Disattivata'}
        />
      </div>

      <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 flex gap-3">
        <Info size={16} className="shrink-0 mt-0.5 text-warning" />
        <div className="text-[12px] leading-relaxed text-txt-primary">
          <div className="font-bold text-warning mb-1">Configurazione gestita dal provider</div>
          <div className="text-txt-secondary">
            Per modificare i modelli, le API keys, i prompt o qualsiasi altra impostazione avanzata,
            <strong className="text-txt-primary"> contatta il tuo provider</strong>.
            Solo gli amministratori possono alterare questi parametri dalla sezione <em>Admin</em>.
          </div>
        </div>
      </div>
    </div>
  );
};
