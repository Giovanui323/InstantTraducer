
import React, { useMemo, useRef, useState } from 'react';
import { Settings, Zap, Loader2, Home, BookOpen, ShieldCheck, Sun, Search, ChevronUp, ChevronDown, Filter, MoreVertical, FileDown, Save, RotateCcw, PauseCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { SearchResults, SearchResultItem } from './SearchResults';
import type { ReaderViewModePreference } from './reader/bookLayout';

interface HeaderProps {
  showActions: boolean;
  hasSession: boolean;
  metadata: any;
  isBatchProcessing: boolean;
  isPaused: boolean;
  viewMode: string;
  scale: number;
  canVerifyAll?: boolean;
  verificationStats?: { queued: number; active: number };
  brightness?: number;
  temperature?: number;
  onBatch: () => void;
  onExport: () => void;
  onExportPdf: () => void;
  onExportOriginalPdf?: () => void;
  onImportProject: () => void;
  onToggleView: () => void;
  onScale: (s: number) => void;
  onVerifyAll?: () => void;
  onBrightnessChange?: (b: number) => void;
  onTemperatureChange?: (t: number) => void;
  onSettings: () => void;
  onToggleControls: () => void;
  onReset: () => void;
  onRedoAll?: () => void;
  searchOpen?: boolean;
  searchTerm?: string;
  onSearchToggle?: () => void;
  onSearchChange?: (q: string) => void;
  onSearchNext?: () => void;
  onSearchPrev?: () => void;
  searchTotal?: number;
  statusBadge?: React.ReactNode;
  isSaving?: boolean;
  searchFilters?: { inTitle: boolean; firstTwoPages: boolean };
  onSearchFilterChange?: (key: 'inTitle' | 'firstTwoPages', value: boolean) => void;
  searchResults?: SearchResultItem[];
  onSearchResultSelect?: (item: SearchResultItem) => void;
  currentLanguage?: string;
  onLanguageClick?: () => void;
  isConsultationMode?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  showActions, hasSession, metadata, isBatchProcessing, isPaused, viewMode, scale,
  canVerifyAll, verificationStats, brightness, temperature,
  onBatch, onExport, onExportPdf, onExportOriginalPdf, onImportProject, onToggleView, onScale, onVerifyAll, onSettings, onReset, onBrightnessChange, onTemperatureChange, onToggleControls,
  searchOpen, searchTerm, onSearchToggle, onSearchChange, onSearchNext, onSearchPrev, searchTotal, onRedoAll, statusBadge, isSaving,
  searchFilters, onSearchFilterChange, searchResults, onSearchResultSelect,
  currentLanguage, onLanguageClick, isConsultationMode
}) => {
  const [showSearchFilters, setShowSearchFilters] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const overflowButtonRef = useRef<HTMLButtonElement | null>(null);
  const overflowFirstItemRef = useRef<HTMLButtonElement | null>(null);
  const overflowMenuRef = useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!showSearchFilters && !showOverflowMenu) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.search-filters-container') && !target.closest('.search-filters-trigger')) {
        setShowSearchFilters(false);
      }
      if (!target.closest('.overflow-menu-container') && !target.closest('.overflow-menu-trigger')) {
        if (showOverflowMenu) {
          setShowOverflowMenu(false);
          overflowButtonRef.current?.focus();
        }
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [showSearchFilters, showOverflowMenu]);

  React.useEffect(() => {
    if (!showOverflowMenu) return;
    const id = window.setTimeout(() => {
      overflowFirstItemRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [showOverflowMenu]);

  React.useEffect(() => {
    if (!showOverflowMenu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!showOverflowMenu) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowOverflowMenu(false);
        overflowButtonRef.current?.focus();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const menu = overflowMenuRef.current;
      if (!menu) return;
      const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'));
      if (items.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      const idx = items.findIndex((b) => b === active);
      const nextIdx = e.key === 'ArrowDown'
        ? (idx >= 0 ? (idx + 1) % items.length : 0)
        : (idx >= 0 ? (idx - 1 + items.length) % items.length : items.length - 1);
      e.preventDefault();
      items[nextIdx]?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showOverflowMenu]);

  const electronPlatform = (window as any)?.electronAPI?.platform;
  const isInElectron = typeof electronPlatform === 'string';
  const isMac =
    (isInElectron && electronPlatform === 'darwin') ||
    (!isInElectron &&
      typeof navigator !== 'undefined' &&
      (navigator.platform === 'MacIntel' || /Macintosh|Mac OS X/i.test(navigator.userAgent)));
  const isHomeScreen = hasSession && !showActions;
  const canToggleHome = hasSession;

  const verifyAllRunning = (verificationStats?.active || 0) > 0 || (verificationStats?.queued || 0) > 0;
  const verifyRemaining = (verificationStats?.active || 0) + (verificationStats?.queued || 0);

  const statusModel = useMemo(() => {
    const raw = typeof statusBadge === 'string' ? statusBadge : (statusBadge ? String(statusBadge) : '');
    const text = raw || (isPaused ? 'In pausa' : isBatchProcessing ? 'Traduzione in corso' : 'Pronto');

    if (isConsultationMode) {
      return { mode: 'idle' as const, text: 'Modalità consultazione (solo lettura)', icon: <BookOpen className="w-3.5 h-3.5" /> };
    }
    if (isPaused) {
      return { mode: 'warning' as const, text: 'In pausa', icon: <PauseCircle className="w-3.5 h-3.5" /> };
    }
    if (isBatchProcessing) {
      return { mode: 'running' as const, text: 'Traduzione in corso', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> };
    }
    if (verifyAllRunning) {
      return { mode: 'running' as const, text: `Verifica in corso (${verifyRemaining})`, icon: <ShieldCheck className="w-3.5 h-3.5 animate-pulse" /> };
    }
    if (raw.startsWith('Tradotte:')) {
      return { mode: 'success' as const, text, icon: <CheckCircle2 className="w-3.5 h-3.5" /> };
    }
    if (raw.toLowerCase().includes('errore') || raw.toLowerCase().includes('mancante')) {
      return { mode: 'error' as const, text, icon: <AlertTriangle className="w-3.5 h-3.5" /> };
    }
    if (raw.startsWith('In corso:')) {
      return { mode: 'running' as const, text, icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> };
    }
    return { mode: 'idle' as const, text, icon: <div className="w-3.5 h-3.5" /> };
  }, [isBatchProcessing, isPaused, isConsultationMode, statusBadge, verifyAllRunning, verifyRemaining]);

  const statusColors = statusModel.mode === 'running'
    ? 'bg-accent/8 border-accent/15 text-accent'
    : statusModel.mode === 'success'
      ? 'bg-success/8 border-success/15 text-success'
      : statusModel.mode === 'warning'
        ? 'bg-warning/8 border-warning/15 text-warning'
        : statusModel.mode === 'error'
          ? 'bg-danger/8 border-danger/15 text-danger'
          : 'bg-white/[0.03] border-white/[0.06] text-txt-secondary';

  return (
    <header className="h-12 bg-surface-1/95 backdrop-blur-xl border-b border-border-muted px-4 shrink-0 z-[100] select-none shadow-surface app-region-drag grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      {/* ── LEFT: Traffic lights + title ── */}
      <div className={`min-w-0 flex items-center gap-3 ${isMac ? '' : 'app-region-no-drag'}`}>
        {isMac ? (
          <div className="flex items-center gap-3">
            <div className="w-20" />
            {canToggleHome ? (
              <button
                onClick={onReset}
                className="p-1.5 text-txt-secondary hover:text-txt-primary hover:bg-white/[0.06] rounded-lg transition-all duration-150 app-region-no-drag focus:outline-none"
                title={isHomeScreen ? "Torna al libro" : "Home"}
                aria-label={isHomeScreen ? "Torna al libro" : "Home"}
              >
                {isHomeScreen ? <BookOpen size={15} /> : <Home size={15} />}
              </button>
            ) : null}
          </div>
        ) : isInElectron ? (
          <div className="flex items-center gap-2.5 group app-region-no-drag">
            <button
              onClick={canToggleHome ? onReset : undefined}
              className={`w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e] ${canToggleHome ? 'cursor-pointer hover:brightness-110' : ''} shadow-sm transition-all duration-150`}
              title={canToggleHome ? (isHomeScreen ? "Torna al libro" : "Home") : undefined}
            />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123] shadow-sm" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] shadow-sm" />
            {canToggleHome ? (
              <button
                onClick={onReset}
                className="ml-2 p-1.5 text-txt-secondary hover:text-txt-primary hover:bg-white/[0.06] rounded-lg transition-all duration-150 focus:outline-none"
                title={isHomeScreen ? "Torna al libro" : "Home"}
                aria-label={isHomeScreen ? "Torna al libro" : "Home"}
              >
                {isHomeScreen ? <BookOpen size={15} /> : <Home size={15} />}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {canToggleHome ? (
              <button
                onClick={onReset}
                className="p-1.5 text-txt-secondary hover:text-txt-primary hover:bg-white/[0.06] rounded-lg transition-all duration-150 app-region-no-drag focus:outline-none"
                title={isHomeScreen ? "Torna al libro" : "Home"}
                aria-label={isHomeScreen ? "Torna al libro" : "Home"}
              >
                {isHomeScreen ? <BookOpen size={15} /> : <Home size={15} />}
              </button>
            ) : null}
          </div>
        )}

        <div className="min-w-0 flex items-center gap-2.5">
          <div className="min-w-0 flex flex-col leading-tight">
            <div className="min-w-0 flex items-center gap-2">
              <span className="text-[12px] font-semibold text-txt-primary/90 truncate max-w-[360px] tracking-tight">
                {metadata?.name ? metadata.name : 'iTraducer'}
              </span>
              {isSaving && (
                <span className="shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-success/8 border border-success/15 text-success text-[9px] font-bold uppercase tracking-tight animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-glow" />
                  Salvataggio
                </span>
              )}
              {currentLanguage && (
                <button
                  onClick={isConsultationMode ? undefined : onLanguageClick}
                  disabled={isConsultationMode}
                  className={`shrink-0 px-2 py-0.5 rounded-md bg-accent/8 border border-accent/15 text-accent text-[10px] font-bold uppercase tracking-tight transition-all duration-150 app-region-no-drag focus:outline-none ${isConsultationMode ? 'opacity-40 cursor-default' : 'hover:bg-accent/15 cursor-pointer'}`}
                  title={isConsultationMode ? 'Lingua del progetto' : 'Cambia lingua di input del progetto'}
                  aria-label={isConsultationMode ? 'Lingua del progetto' : 'Cambia lingua di input del progetto'}
                >
                  {currentLanguage}
                </button>
              )}
            </div>
            {(showActions || hasSession) && (
              <div className="text-[9px] text-txt-muted tracking-wide">{showActions ? 'Sessione attiva' : 'Home'}</div>
            )}
          </div>
        </div>
      </div>

      {/* ── CENTER: Status pill (with dividers) ── */}
      <div className="flex items-center justify-center gap-3">
        <div className="h-5 w-px bg-border-muted/50" aria-hidden="true" />
        {hasSession ? (
          <div
            role="status"
            aria-live="polite"
            className={`px-3.5 py-1 rounded-full border text-[10px] font-semibold tracking-wide flex items-center gap-2 max-w-[520px] truncate transition-all duration-300 ${statusColors}`}
            title={statusModel.text}
          >
            <span className="shrink-0">{statusModel.icon}</span>
            <span className="truncate">{statusModel.text}</span>
          </div>
        ) : (
          <div className="text-[10px] text-txt-muted tracking-wide">Pronto</div>
        )}
        <div className="h-5 w-px bg-border-muted/50" aria-hidden="true" />
      </div>

      {/* ── RIGHT: Actions + search + settings ── */}
      <div className="flex items-center justify-end gap-1.5 min-w-0">
        {showActions && !isConsultationMode ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onBatch}
              disabled={isBatchProcessing || isPaused}
              title="Traduci tutto il documento corrente"
              aria-label="Traduci tutto il documento corrente"
              className={`flex items-center justify-center gap-1.5 px-4 py-1.5 h-8 whitespace-nowrap rounded-lg text-[11px] font-semibold tracking-wide transition-all duration-200 shadow-surface app-region-no-drag focus:outline-none ${isBatchProcessing
                ? 'bg-warning/10 text-warning border border-warning/20'
                : 'bg-accent hover:bg-accent-hover text-white border border-accent/20 shadow-glow-accent'
              } ${isPaused ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isBatchProcessing ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
              {isBatchProcessing ? 'Traduzione…' : 'Traduci tutto'}
            </button>

            {onVerifyAll ? (
              <button
                onClick={onVerifyAll}
                disabled={!canVerifyAll || verifyAllRunning}
                title={!canVerifyAll ? 'Carica un PDF con pagine tradotte e configura Gemini per verificare.' : 'Verifica la traduzione pagina per pagina'}
                aria-label={!canVerifyAll ? 'Verifica non disponibile' : 'Verifica tutte le pagine tradotte'}
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 h-8 rounded-lg text-[11px] font-semibold shadow-surface border transition-all duration-200 app-region-no-drag focus:outline-none ${verifyAllRunning
                  ? 'bg-accent/8 text-accent border-accent/15'
                  : (canVerifyAll ? 'bg-white/[0.04] hover:bg-white/[0.07] text-txt-primary/80 hover:text-txt-primary border-white/[0.06] hover:border-white/[0.1]' : 'bg-white/[0.02] text-txt-muted border-white/[0.04] opacity-50 cursor-not-allowed')}`}
              >
                <ShieldCheck size={12} className={verifyAllRunning ? 'animate-pulse' : ''} />
                {verifyAllRunning ? `Verifica (${verifyRemaining})` : 'Verifica'}
              </button>
            ) : null}

            {/* Overflow menu */}
            <div className="relative">
              <button
                ref={overflowButtonRef}
                onClick={() => setShowOverflowMenu(v => !v)}
                className={`p-2 h-8 w-8 rounded-lg text-txt-secondary hover:text-txt-primary hover:bg-white/[0.06] transition-all duration-150 overflow-menu-trigger focus:outline-none ${showOverflowMenu ? 'bg-white/[0.06] text-txt-primary' : ''}`}
                aria-label="Apri menu azioni"
                aria-haspopup="menu"
                aria-expanded={showOverflowMenu}
                title="Azioni"
              >
                <MoreVertical size={16} />
              </button>

              {showOverflowMenu && (
                <div
                  ref={overflowMenuRef}
                  className="absolute top-full right-0 mt-2 w-60 glass-panel rounded-xl overflow-hidden z-[130] flex flex-col overflow-menu-container animate-fade-in-scale"
                  role="menu"
                  aria-label="Menu azioni"
                >
                  <button
                    ref={overflowFirstItemRef}
                    role="menuitem"
                    onClick={() => { setShowOverflowMenu(false); onExportPdf(); overflowButtonRef.current?.focus(); }}
                    className="flex items-center gap-3 px-4 py-3 text-[11px] font-medium text-txt-primary hover:bg-white/[0.04] text-left border-b border-border-muted transition-colors duration-100 focus:outline-none"
                  >
                    <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                      <FileDown size={15} className="text-accent" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-semibold">Esporta PDF</span>
                      <span className="text-[9px] text-txt-muted font-normal mt-0.5">Documento tradotto</span>
                    </div>
                  </button>
                  {onExportOriginalPdf && (
                    <button
                      role="menuitem"
                      onClick={() => { setShowOverflowMenu(false); onExportOriginalPdf(); overflowButtonRef.current?.focus(); }}
                      className="flex items-center gap-3 px-4 py-3 text-[11px] font-medium text-txt-primary hover:bg-white/[0.04] text-left border-b border-border-muted transition-colors duration-100 focus:outline-none"
                    >
                      <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
                        <FileDown size={15} className="text-warning" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold">Scarica PDF originale</span>
                        <span className="text-[9px] text-txt-muted font-normal mt-0.5">File sorgente</span>
                      </div>
                    </button>
                  )}
                  <button
                    role="menuitem"
                    onClick={() => { setShowOverflowMenu(false); onExport(); overflowButtonRef.current?.focus(); }}
                    className="flex items-center gap-3 px-4 py-3 text-[11px] font-medium text-txt-primary hover:bg-white/[0.04] text-left transition-colors duration-100 focus:outline-none"
                  >
                    <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                      <Save size={15} className="text-success" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-semibold">Esporta progetto</span>
                      <span className="text-[9px] text-txt-muted font-normal mt-0.5">File .gpt per backup</span>
                    </div>
                  </button>
                  {onRedoAll ? (
                    <button
                      role="menuitem"
                      onClick={() => { setShowOverflowMenu(false); onRedoAll(); overflowButtonRef.current?.focus(); }}
                      className="flex items-center gap-3 px-4 py-3 text-[11px] font-medium text-danger hover:bg-danger/5 text-left border-t border-border-muted transition-colors duration-100 focus:outline-none"
                    >
                      <div className="w-8 h-8 rounded-lg bg-danger/10 flex items-center justify-center shrink-0">
                        <RotateCcw size={15} className="text-danger" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold">Ritraduci tutto</span>
                        <span className="text-[9px] text-danger/60 font-normal mt-0.5">Reset completo</span>
                      </div>
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {showActions ? (
          <>
            <div className="h-5 w-px bg-border-muted/50 mx-1" aria-hidden="true" />
            <button
              onClick={onToggleControls}
              title="Mostra/nascondi controlli di lettura"
              aria-label="Mostra o nascondi controlli di lettura"
              className="p-2 h-8 w-8 text-txt-muted hover:text-txt-secondary hover:bg-white/[0.06] rounded-lg transition-all duration-150 app-region-no-drag controls-trigger focus:outline-none"
            >
              <Sun size={16} />
            </button>
          </>
        ) : null}

        <button
          onClick={onSettings}
          title="Impostazioni"
          aria-label="Impostazioni"
          className="p-2 h-8 w-8 text-txt-muted hover:text-txt-secondary hover:bg-white/[0.06] rounded-lg transition-all duration-150 app-region-no-drag focus:outline-none"
        >
          <Settings size={16} />
        </button>

        {showActions ? <div className="h-5 w-px bg-border-muted/50 mx-1" aria-hidden="true" /> : null}

        {showActions ? (
          <div className="relative flex items-center app-region-no-drag search-container">
            <button
              onClick={onSearchToggle}
              className={`p-2 h-8 w-8 rounded-lg transition-all duration-150 search-trigger focus:outline-none ${searchOpen ? 'bg-accent/10 text-accent' : 'text-txt-muted hover:text-txt-secondary hover:bg-white/[0.06]'}`}
              title="Cerca nel testo"
              aria-label="Cerca nel testo"
              aria-expanded={searchOpen}
            >
              <Search size={16} />
            </button>
            <div
              className={`flex items-center gap-1.5 relative overflow-visible transition-all duration-200 ease-out-expo ${searchOpen ? 'ml-2 max-w-[420px] opacity-100' : 'max-w-0 opacity-0 ml-0 pointer-events-none'}`}
            >
              {searchOpen ? (
                <>
                <input
                  value={searchTerm || ''}
                  onChange={(e) => onSearchChange?.(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') onSearchToggle?.(); }}
                  autoFocus
                  placeholder="Cerca nel testo"
                  className="w-[220px] bg-surface-3 border border-border rounded-lg px-2.5 py-1 text-[12px] text-txt-primary placeholder:text-txt-muted focus:outline-none focus:border-accent/30 focus:ring-1 focus:ring-accent/15 transition-all duration-150"
                  aria-label="Testo da cercare"
                />
                <button
                  onClick={() => setShowSearchFilters(!showSearchFilters)}
                  className={`p-1.5 rounded-md transition-all duration-150 search-filters-trigger focus:outline-none ${showSearchFilters ? 'bg-white/10 text-txt-primary' : 'text-txt-muted hover:text-txt-secondary hover:bg-white/[0.06]'}`}
                  title="Filtri di ricerca"
                  aria-label="Filtri di ricerca"
                  aria-haspopup="dialog"
                  aria-expanded={showSearchFilters}
                >
                  <Filter size={14} />
                </button>

                {showSearchFilters && searchFilters && (
                  <div className="absolute top-full right-0 mt-2 w-52 glass-panel rounded-lg p-2 z-[120] search-filters-container animate-fade-in-scale">
                    <div className="text-[9px] font-bold text-txt-muted uppercase tracking-wider mb-2 px-1">Opzioni ricerca</div>
                    <label className="flex items-center gap-2 px-1 py-1.5 hover:bg-white/[0.04] rounded cursor-pointer transition-colors duration-100">
                      <input type="checkbox" checked={searchFilters.inTitle} onChange={(e) => onSearchFilterChange?.('inTitle', e.target.checked)} className="rounded border-border bg-surface-4 text-accent focus:ring-0 w-3 h-3" />
                      <span className="text-[11px] text-txt-secondary">Cerca nel titolo</span>
                    </label>
                    <label className="flex items-center gap-2 px-1 py-1.5 hover:bg-white/[0.04] rounded cursor-pointer transition-colors duration-100">
                      <input type="checkbox" checked={searchFilters.firstTwoPages} onChange={(e) => onSearchFilterChange?.('firstTwoPages', e.target.checked)} className="rounded border-border bg-surface-4 text-accent focus:ring-0 w-3 h-3" />
                      <span className="text-[11px] text-txt-secondary">Solo prime 2 pagine</span>
                    </label>
                  </div>
                )}

                {searchTerm && searchResults && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 mt-2 w-[320px] glass-panel rounded-lg shadow-surface-xl overflow-hidden z-[110] max-h-[400px] animate-fade-in-scale">
                    <SearchResults
                      results={searchResults}
                      onSelect={(item) => { onSearchResultSelect?.(item); }}
                      searchTerm={searchTerm}
                    />
                  </div>
                )}

                {searchTerm ? (
                  <div className="flex items-center gap-1 ml-1">
                    <span className="px-2 py-1 rounded-md bg-white/[0.04] border border-border-muted text-[10px] text-txt-secondary tabular-nums">{searchTotal || 0}</span>
                    <button onClick={onSearchPrev} className="p-1 text-txt-muted hover:text-txt-secondary hover:bg-white/[0.06] rounded-md transition-all duration-100 focus:outline-none" title="Occorrenza precedente" aria-label="Occorrenza precedente">
                      <ChevronUp size={14} />
                    </button>
                    <button onClick={onSearchNext} className="p-1 text-txt-muted hover:text-txt-secondary hover:bg-white/[0.06] rounded-md transition-all duration-100 focus:outline-none" title="Occorrenza successiva" aria-label="Occorrenza successiva">
                      <ChevronDown size={14} />
                    </button>
                  </div>
                ) : null}
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
};
