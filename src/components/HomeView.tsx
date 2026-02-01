import React from 'react';
import { Upload, BookOpen, Trash2, ArrowRight, Settings, Pencil, MoreHorizontal, FileDown, Tag, Plus, AlertCircle, X } from 'lucide-react';
import { ReadingProgress, PDFMetadata } from '../types';
import { getLanguageFlag } from '../utils/languageUtils';

interface HomeViewProps {
  hasSession: boolean;
  metadata: PDFMetadata | null;
  docInputLanguage?: string;
  currentPage: number;
  recentBooks: Record<string, ReadingProgress>;
  availableGroups: string[];
  selectedGroupFilters: string[];
  currentProjectFileId: string | null;
  isDragging: boolean;
  isApiConfigured: boolean;
  openMenuId: string | null;
  pkgVersion: string;
  onCloseSession: () => void;
  onReturnToSession: () => void;
  onBrowseClick: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onImportProject: () => void;
  onOpenProject: (fileId: string) => void;
  onRenameProject: (fileId: string, currentName: string, e: React.MouseEvent) => void;
  onDeleteProject: (fileId: string, e: React.MouseEvent) => void;
  onToggleGroupFilter: (group: string) => void;
  onCreateGroup: () => void;
  onSetOpenMenuId: (id: string | null) => void;
  onOpenSettings: () => void;
  onManageGroups: (fileId: string) => void;
  onExportGpt: (fileId: string) => void;
  onDeleteGroup: (group: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  hasSession,
  metadata,
  docInputLanguage,
  currentPage,
  recentBooks,
  availableGroups,
  selectedGroupFilters,
  currentProjectFileId,
  isDragging,
  isApiConfigured,
  openMenuId,
  pkgVersion,
  onCloseSession,
  onReturnToSession,
  onBrowseClick,
  onDragOver,
  onDragLeave,
  onDrop,
  onImportProject,
  onOpenProject,
  onRenameProject,
  onDeleteProject,
  onToggleGroupFilter,
  onCreateGroup,
  onSetOpenMenuId,
  onOpenSettings,
  onManageGroups,
  onExportGpt,
  onDeleteGroup
}) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-start pt-12 p-4 overflow-y-auto select-none">
      {hasSession && (
        <div className="w-full max-w-2xl mt-6 mb-4">
          <div
            onClick={onReturnToSession}
            title="Torna alla sessione"
            aria-label="Torna alla sessione"
            className="group cursor-pointer bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-2xl px-4 py-3 shadow-xl backdrop-blur-xl transition-all"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Sessione attiva</div>
                <div className="font-serif text-xl text-white mt-1 truncate flex items-center gap-2">
                  <span className="text-sm opacity-80" title={docInputLanguage}>{getLanguageFlag(docInputLanguage || "")}</span>
                  {metadata?.name || 'Senza titolo'}
                </div>
                <div className="text-xs text-white/50 mt-1">Ultima pagina letta: {currentPage}</div>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); onCloseSession(); }}
                title="Chiudi sessione"
                className="w-10 h-10 flex items-center justify-center rounded-full bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-all border border-red-500/20 hover:border-red-500/50"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="w-full max-w-4xl grid lg:grid-cols-2 gap-10 items-start mt-2">
        <div className="flex flex-col gap-4">
          <div
            className={`group bg-[#1e1e1e] border rounded-3xl p-10 text-center cursor-pointer transition-all duration-300 ease-out ${isDragging ? 'border-[#007AFF] bg-[#007AFF]/10 scale-[1.02]' : 'border-white/5 hover:border-[#007AFF]/40 hover:shadow-[0_0_50px_-10px_rgba(0,122,255,0.15)]'}`}
            onClick={onBrowseClick}
            onDragOver={onDragOver}
            onDragEnter={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <div className="w-20 h-20 bg-gradient-to-br from-[#007AFF] to-[#0055b3] rounded-2xl shadow-xl flex items-center justify-center mx-auto mb-8 transition-transform group-hover:scale-105 group-hover:rotate-3 group-active:scale-95">
              <Upload className="text-white w-9 h-9" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-3 tracking-tight">Apri PDF</h2>
            <p className="text-gray-400 text-sm mb-8 leading-relaxed">Trascina qui il tuo libro o clicca per selezionare un file dal computer.</p>
            <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#2a2a2a] text-white font-medium rounded-full text-xs hover:bg-[#007AFF] transition-all shadow-sm group-hover:shadow-md">
              Sfoglia File <ArrowRight size={14} />
            </div>
          </div>

          <button
            onClick={onImportProject}
            className="w-full bg-[#1e1e1e] border border-white/5 rounded-2xl p-4 text-center cursor-pointer hover:bg-[#252525] hover:border-white/10 transition-all flex items-center justify-center gap-3 text-gray-400 hover:text-white"
          >
            <FileDown size={18} />
            <span className="text-sm font-medium">Importa Progetto (.gpt)</span>
          </button>
        </div>

        <div className="space-y-6">
          <div className="px-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <Tag size={14} /> Gruppi
              </h3>
              <button
                onClick={onCreateGroup}
                className="text-gray-500 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-md"
                title="Crea nuovo gruppo"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {availableGroups.length === 0 && <span className="text-xs text-gray-600 italic pl-1">Nessun gruppo</span>}
              {availableGroups.map(g => (
                <button
                  key={g}
                  onClick={() => onToggleGroupFilter(g)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all flex items-center gap-1.5 group/gbtn ${selectedGroupFilters.includes(g)
                    ? 'bg-[#007AFF]/20 border-[#007AFF]/50 text-[#007AFF]'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'
                    }`}
                >
                  {g}
                  <X 
                    size={10} 
                    className="opacity-0 group-hover/gbtn:opacity-50 hover:opacity-100 transition-opacity ml-0.5" 
                    onClick={(e) => { e.stopPropagation(); onDeleteGroup(g); }}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between px-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-gray-400 uppercase tracking-wider">
              Recenti
            </h3>
            <button
              onClick={onOpenSettings}
              className={`flex items-center gap-1.5 text-[10px] font-medium uppercase transition-colors px-3 py-1.5 rounded-full border ${isApiConfigured ? 'text-emerald-400 bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10' : 'text-rose-400 bg-rose-500/5 border-rose-500/20 hover:bg-rose-500/10'}`}
            >
              <Settings size={12} /> {isApiConfigured ? 'API Configurate' : 'Configura API'}
            </button>
          </div>

          <div className="max-h-[min(600px,65vh)] overflow-y-auto pr-2 custom-scrollbar">
            <div className="grid gap-2 pb-32">
              {Object.values(recentBooks).length === 0 && (
                <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed border-white/10 rounded-2xl text-gray-600">
                  <BookOpen size={24} className="mb-2 opacity-20" />
                  <span className="text-xs">Nessun libro recente</span>
                </div>
              )}
              {Object.values(recentBooks || {})
                .filter((b): b is ReadingProgress => !!(b && b.fileId && b.fileId !== 'undefined'))
                .filter(b => {
                  if (selectedGroupFilters.length === 0) return true;
                  if (!b || !b.groups) return false;
                  // Logica AND: il libro deve avere TUTTI i gruppi selezionati
                  return selectedGroupFilters.every(g => b.groups?.includes(g));
                })
                .sort((a, b) => b.timestamp - a.timestamp)
                .map((book) => {
                  const isActive = book.fileId === currentProjectFileId;
                  return (
                    <div
                      key={book.fileId}
                      className={`p-3.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer group shadow-sm relative ${
                        openMenuId === book.fileId ? 'z-30' : 'z-10'
                      } ${isActive
                        ? 'bg-[#1a2e1a] border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                        : 'bg-[#1e1e1e] border-white/5 hover:bg-[#252525] hover:border-white/10'
                        }`}
                      onClick={() => onOpenProject(book.fileId || "")}
                    >
                      {isActive && (
                        <div className="absolute -left-[1px] top-3 bottom-3 w-[3px] bg-emerald-500 rounded-r-full shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                      )}
                      <div className="flex items-center gap-3.5">
                        <div className="relative">
                          {book.thumbnail ? (
                            <img 
                              src={book.thumbnail} 
                              alt={book.fileName} 
                              className="w-9 h-12 object-cover rounded-md shadow-sm border border-white/10" 
                            />
                          ) : (
                            <div className="w-9 h-9 bg-[#2a2a2a] text-gray-300 rounded-lg flex items-center justify-center shadow-inner text-[10px] font-bold border border-white/5">PDF</div>
                          )}
                          {book.hasSafePdf === false && (
                            <div className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 border border-[#1e1e1e]" title="PDF originale mancante (vecchia versione)">
                              <AlertCircle size={10} />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col">
                          <p
                            className="font-medium text-sm text-gray-200 truncate max-w-[180px] group-hover:text-white transition-colors flex items-center gap-1.5"
                            onDoubleClick={(e) => { e.stopPropagation(); onRenameProject(book.fileId || "", book.fileName || "", e); }}
                            title="Doppio click per rinominare"
                          >
                            <span className="text-xs shrink-0" title={book.inputLanguage}>{getLanguageFlag(book.inputLanguage || "")}</span>
                            {book.fileName}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-gray-500 font-medium">Pagina {book.lastPage}</span>
                            <span className="text-[10px] text-gray-600">•</span>
                            <span className="text-[10px] text-gray-500">{new Date(book.timestamp).toLocaleDateString()}</span>
                            {book.groups && book.groups.length > 0 && (
                              <>
                                <span className="text-[10px] text-gray-600">•</span>
                                <div className="flex gap-1">
                                  {book.groups.slice(0, 2).map((g: string) => (
                                    <span key={g} className="text-[9px] bg-white/10 text-gray-300 px-1.5 rounded-sm">{g}</span>
                                  ))}
                                  {book.groups.length > 2 && <span className="text-[9px] text-gray-500">+{book.groups.length - 2}</span>}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => onRenameProject(book.fileId || "", book.fileName || "", e)}
                          className="p-2 text-gray-600 hover:text-[#60a5fa] hover:bg-[#007AFF]/10 rounded-lg transition-all"
                          title="Rinomina"
                        >
                          <Pencil size="14" />
                        </button>
                        <button
                          onClick={(e) => onDeleteProject(book.fileId || "", e)}
                          className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                          title="Rimuovi dalla cronologia"
                        >
                          <Trash2 size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onSetOpenMenuId(openMenuId === (book.fileId || "") ? null : (book.fileId || "")); }}
                          className="p-2 text-gray-600 hover:text-white hover:bg-white/5 rounded-lg transition-all menu-trigger"
                          title="Altro"
                          aria-haspopup="menu"
                          aria-expanded={openMenuId === book.fileId}
                        >
                          <MoreHorizontal size={14} />
                        </button>
                        {openMenuId === book.fileId && (
                          <div className="absolute right-2 top-full mt-1 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50 flex flex-col min-w-[160px] menu-container">
                            <button
                              onClick={(e) => { e.stopPropagation(); onSetOpenMenuId(null); onManageGroups(book.fileId || ""); }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-200 hover:bg-white/5 text-left"
                            >
                              <Tag size={14} />
                              Gestisci Gruppi
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); onSetOpenMenuId(null); onRenameProject(book.fileId || "", book.fileName || "", e); }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-200 hover:bg-white/5 text-left"
                            >
                              <Pencil size={14} />
                              Rinomina
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); onSetOpenMenuId(null); onExportGpt(book.fileId || ""); }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-200 hover:bg-white/5 text-left"
                            >
                              <FileDown size={14} />
                              Esporta (.gpt)
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); onSetOpenMenuId(null); onDeleteProject(book.fileId || "", e); }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-200 hover:bg-white/5 text-red-400 text-left"
                            >
                              <Trash2 size={14} />
                              Rimuovi
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
      <div className="fixed bottom-3 right-3 text-[10px] font-bold text-white/50">v{pkgVersion}</div>
    </div>
  );
};
