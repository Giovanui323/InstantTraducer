import React from 'react';
import { AISettings } from '../../../types';
import { SettingRow } from '../SettingRow';
import { SettingsSearchItem } from '../search';
import {
  DEFAULT_CONCURRENT_TRANSLATIONS,
  MAX_ALLOWED_CONCURRENCY
} from '../../../constants';
import { Info, MessageSquare } from 'lucide-react';

export const translationLogicSearchItems: SettingsSearchItem[] = [
  { id: 'translationLogic.legalContext', sectionId: 'translationLogic', sectionLabel: 'Traduzione & Logica', title: 'Contesto giuridico', description: 'Ottimizza la terminologia per testi di diritto.', keywords: ['legale', 'giuridico', 'terminologia'], anchorId: 'translationLogic.legalContext' },
  { id: 'translationLogic.concurrency', sectionId: 'translationLogic', sectionLabel: 'Traduzione & Logica', title: 'Traduzioni in parallelo', description: 'Numero di pagine elaborate contemporaneamente.', keywords: ['concorrenza', 'parallel', 'velocità'], anchorId: 'translationLogic.concurrency' },
  { id: 'translationLogic.sequential', sectionId: 'translationLogic', sectionLabel: 'Traduzione & Logica', title: 'Continuità narrativa (sequenziale)', description: 'Attende la pagina precedente per coerenza stilistica.', keywords: ['sequenziale', 'contesto', 'coerenza'], anchorId: 'translationLogic.sequential' },
  { id: 'translationLogic.fullResolution', sectionId: 'translationLogic', sectionLabel: 'Traduzione & Logica', title: 'Traduzione accurata (alta risoluzione)', description: 'Invia immagini a piena risoluzione per massima qualità OCR.', keywords: ['risoluzione', 'accurata', 'qualità', 'immagine', 'token', 'downscale'], anchorId: 'translationLogic.fullResolution' },
];

const selectClasses = "bg-surface-4/50 border border-border-muted rounded-xl py-2 px-3 text-[12px] text-txt-primary outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all duration-200";

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

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="space-y-3">
        <SettingRow
          id="setting-translationLogic.legalContext"
          title="Contesto giuridico"
          description="Ottimizza la terminologia per testi di diritto."
          right={
            <input type="checkbox" checked={legalContext} onChange={(e) => updateDraft({ legalContext: e.target.checked })} className="h-4 w-4 accent-accent" />
          }
        />

        <SettingRow
          id="setting-translationLogic.concurrency"
          title="Traduzioni in parallelo"
          description="Pagine elaborate contemporaneamente (max 3 consigliato)."
          right={
            <div className="flex items-center gap-2">
              <button
                onClick={() => alert("Imposta quante pagine tradurre contemporaneamente.\n\nSe 'Continuità Narrativa' è ATTIVA, le pagine consecutive sono comunque sequenziali per coerenza stilistica.\n\nDisattivala per massima velocità (le pagine partiranno tutte insieme).")}
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

        <SettingRow
          id="setting-translationLogic.sequential"
          title="Continuità narrativa (sequenziale)"
          description="Attende la pagina precedente per coerenza. Disattiva per massima velocità."
          right={
            <input type="checkbox" checked={sequentialContext} onChange={(e) => updateDraft({ sequentialContext: e.target.checked })} className="h-4 w-4 accent-accent" />
          }
        />

        <SettingRow
          id="setting-translationLogic.fullResolution"
          title="Traduzione accurata (alta risoluzione)"
          description="Invia le immagini a piena risoluzione senza ridimensionamento. Massima qualità OCR ma consuma più token."
          right={
            <input type="checkbox" checked={fullResolutionMode} onChange={(e) => updateDraft({ fullResolutionMode: e.target.checked })} className="h-4 w-4 accent-accent" />
          }
        />
      </div>

      {/* Link to Prompts section */}
      <button
        onClick={() => onNavigateToSection?.('prompts')}
        className="w-full flex items-center gap-3 p-3 rounded-xl border border-border-muted bg-surface-4/20 hover:bg-surface-4/40 transition-all duration-200 group text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0">
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
