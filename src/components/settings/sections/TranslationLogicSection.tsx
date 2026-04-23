import React, { useState } from 'react';
import { AISettings } from '../../../types';
import { SettingRow } from '../SettingRow';
import { SettingsSearchItem } from '../search';
import {
  DEFAULT_CONCURRENT_TRANSLATIONS,
  MAX_ALLOWED_CONCURRENCY
} from '../../../constants';
import { Info, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { ToggleSwitch } from '../ToggleSwitch';
import { selectClasses } from '../sharedStyles';

export const translationLogicSearchItems: SettingsSearchItem[] = [
  { id: 'translationLogic.legalContext', sectionId: 'translationLogic', sectionLabel: 'Traduzione & Logica', title: 'Contesto giuridico', description: 'Ottimizza la terminologia per testi di diritto.', keywords: ['legale', 'giuridico', 'terminologia'], anchorId: 'translationLogic.legalContext' },
  { id: 'translationLogic.concurrency', sectionId: 'translationLogic', sectionLabel: 'Traduzione & Logica', title: 'Traduzioni in parallelo', description: 'Numero di pagine elaborate contemporaneamente.', keywords: ['concorrenza', 'parallel', 'velocità'], anchorId: 'translationLogic.concurrency' },
  { id: 'translationLogic.sequential', sectionId: 'translationLogic', sectionLabel: 'Traduzione & Logica', title: 'Continuità narrativa (sequenziale)', description: 'Attende la pagina precedente per coerenza stilistica.', keywords: ['sequenziale', 'contesto', 'coerenza'], anchorId: 'translationLogic.sequential' },
  { id: 'translationLogic.fullResolution', sectionId: 'translationLogic', sectionLabel: 'Traduzione & Logica', title: 'Traduzione accurata (alta risoluzione)', description: 'Invia immagini a piena risoluzione per massima qualità OCR.', keywords: ['risoluzione', 'accurata', 'qualità', 'immagine', 'token', 'downscale'], anchorId: 'translationLogic.fullResolution' },
  { id: 'translationLogic.splitDoubleColumns', sectionId: 'translationLogic', sectionLabel: 'Traduzione & Logica', title: 'Dividi colonne doppie (Sperimentale)', description: 'Rileva e traduce separatamente le pagine a due colonne.', keywords: ['colonne', 'doppie', 'split', 'divisione', 'layout'], anchorId: 'translationLogic.splitDoubleColumns' },
];

interface TranslationLogicSectionProps {
  draftSettings: AISettings;
  updateDraft: (updates: Partial<AISettings>) => void;
  onNavigateToSection?: (sectionId: string) => void;
}

export const TranslationLogicSection = ({
  draftSettings,
  updateDraft,
  onNavigateToSection,
}: TranslationLogicSectionProps) => {
  const legalContext = draftSettings.legalContext ?? true;
  const translationConcurrency = draftSettings.translationConcurrency ?? DEFAULT_CONCURRENT_TRANSLATIONS;
  const sequentialContext = draftSettings.sequentialContext ?? true;
  const fullResolutionMode = draftSettings.fullResolutionMode ?? false;
  const splitDoubleColumns = draftSettings.splitDoubleColumns ?? false;
  const [showConcurrencyInfo, setShowConcurrencyInfo] = useState(false);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="space-y-3">
        <SettingRow
          id="setting-translationLogic.legalContext"
          title="Contesto giuridico"
          description="Ottimizza la terminologia per testi di diritto."
          right={
            <ToggleSwitch checked={legalContext} onChange={(v) => updateDraft({ legalContext: v })} />
          }
        />

        <SettingRow
          id="setting-translationLogic.concurrency"
          title="Traduzioni in parallelo"
          description="Pagine elaborate contemporaneamente (max 3 consigliato)."
          right={
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowConcurrencyInfo(prev => !prev)}
                className="text-txt-faint hover:text-txt-muted transition-colors duration-200"
              >
                <Info size={14} />
              </button>
              <select
                value={String(translationConcurrency)}
                onChange={(e) => updateDraft({ translationConcurrency: Math.max(1, Math.min(MAX_ALLOWED_CONCURRENCY, Number(e.target.value) || DEFAULT_CONCURRENT_TRANSLATIONS)) })}
                className={selectClasses}
              >
                {Array.from({ length: MAX_ALLOWED_CONCURRENCY }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          }
        />

        {showConcurrencyInfo && (
          <div className="px-3 py-2 rounded-xl bg-accent/5 border border-accent/15 text-[11px] text-txt-secondary leading-relaxed animate-fade-in">
            Imposta quante pagine tradurre contemporaneamente. Se &quot;Continuità Narrativa&quot; è attiva, le pagine consecutive restano sequenziali per coerenza stilistica. Disattivala per massima velocità.
          </div>
        )}

        <SettingRow
          id="setting-translationLogic.sequential"
          title="Continuità narrativa (sequenziale)"
          description="Attende la pagina precedente per coerenza. Disattiva per massima velocità."
          right={
            <ToggleSwitch checked={sequentialContext} onChange={(v) => updateDraft({ sequentialContext: v })} />
          }
        />

        <SettingRow
          id="setting-translationLogic.fullResolution"
          title="Traduzione accurata (alta risoluzione)"
          description="Invia le immagini a piena risoluzione senza ridimensionamento. Massima qualità OCR ma consuma più token."
          right={
            <ToggleSwitch checked={fullResolutionMode} onChange={(v) => updateDraft({ fullResolutionMode: v })} />
          }
        />

        <SettingRow
          id="setting-translationLogic.splitDoubleColumns"
          title="Dividi colonne doppie (Sperimentale)"
          description="Rileva e traduce separatamente le colonne. Richiede pre-flight (più lento) ma previene crash sulle pagine doppie."
          right={
            <ToggleSwitch checked={splitDoubleColumns} onChange={(v) => updateDraft({ splitDoubleColumns: v })} />
          }
        />
      </div>

      {/* Link to Prompts section */}
      <button
        onClick={() => onNavigateToSection?.('prompts')}
        className="w-full flex items-center gap-3 p-3 rounded-xl border border-border-muted bg-surface-4/20 hover:bg-surface-4/40 transition-all duration-200 group text-left"
      >
        <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center text-accent shrink-0">
          <MessageSquare size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold text-txt-primary">Gestione Prompt</div>
          <div className="text-[10px] text-txt-muted">Personalizza i prompt di traduzione, verifica e metadati</div>
        </div>
        <div className="text-txt-faint group-hover:text-accent transition-colors duration-200">
          <Info size={14} />
        </div>
      </button>
    </div>
  );
};
