
import React, { useState } from 'react';
import { Columns, ZoomIn, ZoomOut, Settings, Zap, FileDown, Loader2, Save, Home, BookOpen, ShieldCheck, Sun, SunSnow, Search, ChevronUp, ChevronDown, Filter } from 'lucide-react';
import { SearchResults, SearchResultItem } from './SearchResults';

interface HeaderProps {
  showActions: boolean;
  hasSession: boolean;
  metadata: any;
  isBatchProcessing: boolean;
  isPaused: boolean;
  viewMode: string;
  scale: number;
  canVerifyAll?: boolean;
  verifyAllRunning?: boolean;
  verifyAllCurrent?: number;
  verifyAllTotal?: number;
  brightness?: number;
  temperature?: number;
  onBatch: () => void;
  onExport: () => void;
  onExportPdf: () => void;
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
}

export const Header: React.FC<HeaderProps> = ({
  showActions, hasSession, metadata, isBatchProcessing, isPaused, viewMode, scale,
  canVerifyAll, verifyAllRunning, verifyAllCurrent, verifyAllTotal, brightness, temperature,
  onBatch, onExport, onExportPdf, onImportProject, onToggleView, onScale, onVerifyAll, onSettings, onReset, onBrightnessChange, onTemperatureChange, onToggleControls,
  searchOpen, searchTerm, onSearchToggle, onSearchChange, onSearchNext, onSearchPrev, searchTotal, onRedoAll, statusBadge, isSaving,
  searchFilters, onSearchFilterChange, searchResults, onSearchResultSelect,
  currentLanguage, onLanguageClick
}) => {
  const [showSearchFilters, setShowSearchFilters] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  React.useEffect(() => {
    if (!showSearchFilters && !showExportMenu) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.search-filters-container') && !target.closest('.search-filters-trigger')) {
        setShowSearchFilters(false);
      }
      if (!target.closest('.export-menu-container') && !target.closest('.export-menu-trigger')) {
        setShowExportMenu(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [showSearchFilters, showExportMenu]);

  const isMac =
    typeof navigator !== 'undefined' &&
    (navigator.platform === 'MacIntel' || /Macintosh|Mac OS X/i.test(navigator.userAgent));
  const isHomeScreen = hasSession && !showActions;
  const canToggleHome = hasSession;

  return (
    <header className="h-12 bg-black/5 backdrop-blur-2xl border-b border-white/10 px-4 flex items-center justify-between shrink-0 z-[100] select-none shadow-sm app-region-drag">
      <div className={`flex items-center gap-4 shrink-0 ${isMac ? '' : 'app-region-no-drag'}`}>
        {isMac ? (
          <div className="flex items-center gap-3">
            <div className="w-20" />
            {canToggleHome ? (
              <button onClick={onReset} className="p-1.5 text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-all app-region-no-drag" title={isHomeScreen ? "Torna al libro" : "Home"}>
                {isHomeScreen ? <BookOpen size={15} /> : <Home size={15} />}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-2 group app-region-no-drag">
            <div onClick={canToggleHome ? onReset : undefined} className={`w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e] ${canToggleHome ? 'cursor-pointer' : ''} shadow-sm flex items-center justify-center text-[8px] text-black/50 opacity-100 group-hover:opacity-100 transition-opacity`} title={canToggleHome ? (isHomeScreen ? "Torna al libro" : "Home") : undefined}></div>
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123] shadow-sm" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] shadow-sm" />
            {canToggleHome ? (
              <button onClick={onReset} className="ml-2 p-1.5 text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-all" title={isHomeScreen ? "Torna al libro" : "Home"}>
                {isHomeScreen ? <BookOpen size={15} /> : <Home size={15} />}
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex items-center justify-center px-4">
        <h1 className="text-[13px] font-medium text-white/90 truncate flex items-center gap-2 opacity-80 hover:opacity-100 transition-opacity">
          {metadata ? (
            <>
              <span className="opacity-50 text-[10px] uppercase font-bold tracking-tight">In modifica:</span>
              <span className="truncate max-w-[200px]">{metadata.name}</span>
              {isSaving && (
                <div className="flex items-center gap-1.5 ml-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 animate-pulse">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"></div>
                  <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-tight">Salvataggio...</span>
                </div>
              )}
              {currentLanguage && (
                <button 
                  onClick={onLanguageClick}
                  className="ml-2 px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-tight hover:bg-blue-500/20 transition-all app-region-no-drag"
                  title="Cambia lingua di input del progetto"
                >
                  {currentLanguage}
                </button>
              )}
            </>
          ) : (
            <>
              <span>Gemini Translator Pro</span>
            </>
          )}
        </h1>
      </div>

      <div className="flex items-center justify-end gap-2 shrink-0">
        {showActions ? (
          <>


            <div className="h-4 w-[1px] bg-white/10 mx-1" />

            <button
              onClick={onBatch}
              disabled={isBatchProcessing || isPaused}
              className={`flex items-center justify-center gap-1.5 px-5 py-1.5 min-w-[160px] whitespace-nowrap rounded-full text-[11px] font-semibold tracking-wide transition-all shadow-sm app-region-no-drag ${isBatchProcessing ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                'bg-white/10 hover:bg-white/15 text-gray-200 hover:text-white border border-white/10 hover:border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                }`}
            >
              {isBatchProcessing ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
              {isBatchProcessing ? 'Traduzione...' : 'Traduci Tutto'}
            </button>

            {onRedoAll ? (
              <button
                onClick={onRedoAll}
                className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-semibold shadow-sm border transition-all app-region-no-drag bg-red-500/15 text-red-200 border-red-500/25 hover:bg-red-500/25 hover:text-red-100"
                title="Ritraduci tutto il documento corrente (Reset)"
              >
                <Loader2 size={12} />
                Ritraduci Tutto
              </button>
            ) : null}

            {onVerifyAll ? (
              <button
                onClick={onVerifyAll}
                disabled={!canVerifyAll || verifyAllRunning}
                className={`flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-semibold shadow-sm border transition-all app-region-no-drag ${verifyAllRunning
                  ? 'bg-blue-500/15 text-blue-200 border-blue-500/25'
                  : (canVerifyAll ? 'bg-white/6 hover:bg-white/10 text-gray-200 hover:text-white border-white/10 hover:border-white/20' : 'bg-white/5 text-gray-500 border-white/10 opacity-50 cursor-not-allowed')
                  }`}
                title={!canVerifyAll ? 'Carica un PDF con pagine tradotte e configura Gemini per verificare.' : 'Verifica la traduzione pagina per pagina'}
              >
                <ShieldCheck size={12} />
                {verifyAllRunning ? `Verifica ${verifyAllCurrent || 0}/${verifyAllTotal || 0}` : 'Verifica tutte'}
              </button>
            ) : null}

            {statusBadge ? (
              <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] border bg-white/8 border-white/15 text-gray-200">
                {statusBadge}
              </span>
            ) : null}

            <div className="relative app-region-no-drag">
              <button 
                onClick={() => setShowExportMenu(!showExportMenu)} 
                className={`flex items-center gap-1.5 px-3.5 py-1.5 bg-[#007AFF]/80 hover:bg-[#007AFF] text-white rounded-full text-[11px] font-semibold shadow-sm border border-white/10 transition-all export-menu-trigger ${showExportMenu ? 'ring-2 ring-blue-500/50 ring-offset-2 ring-offset-[#1e1e1e]' : ''}`}
              >
                <FileDown size={12} /> Esporta
              </button>
              
              {showExportMenu && (
                <div className="absolute top-full right-0 mt-2 w-52 bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[110] flex flex-col export-menu-container">
                  <button
                    onClick={() => { setShowExportMenu(false); onExportPdf(); }}
                    className="flex items-center gap-2.5 px-4 py-3 text-[11px] font-medium text-gray-200 hover:bg-white/5 text-left border-b border-white/5 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                      <BookOpen size={14} className="text-blue-400" />
                    </div>
                    <div className="flex flex-col">
                      <span>Esporta PDF</span>
                      <span className="text-[9px] text-gray-500 font-normal">Documento tradotto</span>
                    </div>
                  </button>
                  <button
                    onClick={() => { setShowExportMenu(false); onExport(); }}
                    className="flex items-center gap-2.5 px-4 py-3 text-[11px] font-medium text-gray-200 hover:bg-white/5 text-left transition-colors"
                  >
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <Save size={14} className="text-emerald-400" />
                    </div>
                    <div className="flex flex-col">
                      <span>Esporta Progetto</span>
                      <span className="text-[9px] text-gray-500 font-normal">File .gpt per backup</span>
                    </div>
                  </button>
                </div>
              )}
            </div>

            <div className="h-4 w-[1px] bg-white/10 mx-1" />

            <div className="h-4 w-[1px] bg-white/10 mx-1" />
          </>
        ) : null}

        <button onClick={onToggleControls} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all app-region-no-drag controls-trigger"><Sun size={16} /></button>
        <button onClick={onSettings} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all app-region-no-drag"><Settings size={16} /></button>
        <div className="relative flex items-center app-region-no-drag search-container">
          <button
            onClick={onSearchToggle}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all search-trigger"
            title="Cerca nel testo"
          >
            <Search size={16} />
          </button>
          {searchOpen ? (
            <div className="ml-2 flex items-center gap-1 relative">
              <input
                value={searchTerm || ''}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder="Cerca nel testo"
                className="w-[200px] bg-white/5 border border-white/10 rounded-md px-2 py-1 text-[12px] text-gray-200 placeholder:text-gray-400 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20"
              />
              
              <button 
                onClick={() => setShowSearchFilters(!showSearchFilters)}
                className={`p-1 rounded-md transition-all search-filters-trigger ${showSearchFilters ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                title="Filtri di ricerca"
              >
                <Filter size={14} />
              </button>

              {showSearchFilters && searchFilters && (
                <div className="absolute top-full right-0 mt-2 w-48 bg-[#1e1e1e] border border-white/10 rounded-lg shadow-xl p-2 z-[120] search-filters-container">
                  <div className="text-[10px] font-semibold text-gray-400 mb-2 px-1">OPZIONI RICERCA</div>
                  <label className="flex items-center gap-2 px-1 py-1 hover:bg-white/5 rounded cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={searchFilters.inTitle} 
                      onChange={(e) => onSearchFilterChange?.('inTitle', e.target.checked)}
                      className="rounded border-white/20 bg-white/5 text-blue-500 focus:ring-0 w-3 h-3"
                    />
                    <span className="text-[11px] text-gray-200">Cerca nel titolo</span>
                  </label>
                  <label className="flex items-center gap-2 px-1 py-1 hover:bg-white/5 rounded cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={searchFilters.firstTwoPages} 
                      onChange={(e) => onSearchFilterChange?.('firstTwoPages', e.target.checked)}
                      className="rounded border-white/20 bg-white/5 text-blue-500 focus:ring-0 w-3 h-3"
                    />
                    <span className="text-[11px] text-gray-200">Solo prime 2 pagine</span>
                  </label>
                </div>
              )}

              {searchTerm && searchResults && searchResults.length > 0 && (
                <div className="absolute top-full left-0 mt-2 w-[300px] bg-[#1e1e1e] border border-white/10 rounded-lg shadow-xl overflow-hidden z-[110] max-h-[400px]">
                  <SearchResults 
                    results={searchResults} 
                    onSelect={(item) => {
                      onSearchResultSelect?.(item);
                    }}
                    searchTerm={searchTerm}
                  />
                </div>
              )}

              {searchTerm ? (
                <div className="flex items-center gap-1 ml-1">
                  <span className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[10px] text-gray-300">{searchTotal || 0}</span>
                  <button onClick={onSearchPrev} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-all" title="Occorrenza precedente">
                    <ChevronUp size={14} />
                  </button>
                  <button onClick={onSearchNext} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-all" title="Occorrenza successiva">
                    <ChevronDown size={14} />
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
};
