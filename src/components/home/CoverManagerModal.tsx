import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, BookImage, Upload, ImagePlus, Trash2, Loader2, Check, AlertCircle } from 'lucide-react';
import { extractIsbnFromText, fetchOpenLibraryCover, generateCoverDataURL, CoverSearchResult } from '../../services/coverService';

interface CoverManagerModalProps {
  fileId: string;
  fileName: string;
  currentThumbnail?: string;
  onClose: () => void;
  onRefresh: () => void;
}

type Tab = 'isbn' | 'generate' | 'upload' | 'firstpage';

export const CoverManagerModal: React.FC<CoverManagerModalProps> = ({
  fileId,
  fileName,
  currentThumbnail,
  onClose,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('isbn');
  const [isbn, setIsbn] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<CoverSearchResult | null>(null);
  const [searchError, setSearchError] = useState('');
  const [coverInfo, setCoverInfo] = useState<{ hasCustomCover: boolean; hasFirstPage: boolean; coverSource?: string; isbn?: string } | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [genTitle, setGenTitle] = useState(fileName.replace(/\.pdf$/i, ''));
  const [genAuthor, setGenAuthor] = useState('');
  const [genYear, setGenYear] = useState('');
  const [genPreview, setGenPreview] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Load cover info on mount
  useEffect(() => {
    (async () => {
      try {
        const info = await window.electronAPI.coverGetInfo({ fileId });
        setCoverInfo(info);
        if (info.isbn) setIsbn(info.isbn);
      } catch { /* ignore */ }
    })();
  }, [fileId]);

  // Generate preview when fields change
  useEffect(() => {
    if (activeTab === 'generate') {
      const preview = generateCoverDataURL(genTitle, genAuthor, genYear);
      setGenPreview(preview);
    }
  }, [activeTab, genTitle, genAuthor, genYear]);

  // Try auto-extract ISBN from PDF text
  useEffect(() => {
    if (!coverInfo?.isbn) {
      (async () => {
        try {
          const pdfPath = await window.electronAPI.getOriginalPdfPath(fileId);
          if (!pdfPath?.path) return;
          // Read PDF and extract text from first pages
          const pdfData = await window.electronAPI.readPdfFile(pdfPath.path);
          const pdfJsLib = await import('pdfjs-dist');
          const pdf = await pdfJsLib.getDocument({ data: pdfData }).promise;
          const pagesToCheck = Math.min(pdf.numPages, 5);
          let fullText = '';
          for (let i = 1; i <= pagesToCheck; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            fullText += content.items.map((item: any) => item.str).join(' ') + '\n';
          }
          const extracted = extractIsbnFromText(fullText);
          if (extracted) setIsbn(extracted);
        } catch { /* ignore — PDF may not be available */ }
      })();
    }
  }, [fileId, coverInfo?.isbn]);

  const showStatus = useCallback((text: string, type: 'success' | 'error') => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 3000);
  }, []);

  const handleIsbnSearch = useCallback(async () => {
    if (!isbn.trim()) return;
    setIsSearching(true);
    setSearchError('');
    setSearchResult(null);
    try {
      const result = await fetchOpenLibraryCover(isbn.trim());
      setSearchResult(result);
      if (!result.coverUrl && !result.title) {
        setSearchError('Nessun risultato trovato per questo ISBN.');
      }
    } catch (e: any) {
      setSearchError(e.message || 'Errore nella ricerca.');
    } finally {
      setIsSearching(false);
    }
  }, [isbn]);

  const handleApplyIsbnCover = useCallback(async () => {
    if (!searchResult?.coverUrl) return;
    setIsApplying(true);
    try {
      const res = await window.electronAPI.coverSetFromUrl({
        fileId,
        url: searchResult.coverUrl,
        source: 'isbn',
        isbn: searchResult.isbn
      });
      if (res.success) {
        showStatus('Copertina impostata!', 'success');
        onRefresh();
      } else {
        showStatus(res.error || 'Errore', 'error');
      }
    } catch (e: any) {
      showStatus(e.message, 'error');
    } finally {
      setIsApplying(false);
    }
  }, [fileId, searchResult, onRefresh, showStatus]);

  const handleApplyGenerated = useCallback(async () => {
    if (!genPreview) return;
    setIsApplying(true);
    try {
      const res = await window.electronAPI.coverSetFromBuffer({
        fileId,
        dataUrl: genPreview,
        source: 'generated'
      });
      if (res.success) {
        showStatus('Copertina generata applicata!', 'success');
        onRefresh();
      } else {
        showStatus(res.error || 'Errore', 'error');
      }
    } catch (e: any) {
      showStatus(e.message, 'error');
    } finally {
      setIsApplying(false);
    }
  }, [fileId, genPreview, onRefresh, showStatus]);

  const handleUpload = useCallback(async () => {
    setIsApplying(true);
    try {
      const res = await window.electronAPI.coverSetFromFile({ fileId });
      if (res.success) {
        showStatus('Copertina caricata!', 'success');
        onRefresh();
      } else if (!res.cancelled) {
        showStatus(res.error || 'Errore', 'error');
      }
    } catch (e: any) {
      showStatus(e.message, 'error');
    } finally {
      setIsApplying(false);
    }
  }, [fileId, onRefresh, showStatus]);

  const handleUseFirstPage = useCallback(async () => {
    setIsApplying(true);
    try {
      // Get the source-p1.jpg as a data URL and set it as cover
      const info = await window.electronAPI.coverGetInfo({ fileId });
      if (!info.hasFirstPage) {
        showStatus('Nessuna anteprima prima pagina disponibile.', 'error');
        return;
      }
      const imgData = await window.electronAPI.readProjectImageBase64({
        fileId,
        relPath: 'source-p1.jpg'
      });
      if (!imgData) {
        showStatus('Impossibile leggere la prima pagina.', 'error');
        return;
      }
      const dataUrl = `data:image/jpeg;base64,${imgData}`;
      const res = await window.electronAPI.coverSetFromBuffer({
        fileId,
        dataUrl,
        source: 'firstpage'
      });
      if (res.success) {
        showStatus('Prima pagina impostata come copertina!', 'success');
        onRefresh();
      } else {
        showStatus(res.error || 'Errore', 'error');
      }
    } catch (e: any) {
      showStatus(e.message, 'error');
    } finally {
      setIsApplying(false);
    }
  }, [fileId, onRefresh, showStatus]);

  const handleRemove = useCallback(async () => {
    setIsApplying(true);
    try {
      const res = await window.electronAPI.coverRemove({ fileId });
      if (res.success) {
        showStatus('Copertina personalizzata rimossa.', 'success');
        onRefresh();
        setCoverInfo(prev => prev ? { ...prev, hasCustomCover: false } : prev);
      } else {
        showStatus(res.error || 'Errore', 'error');
      }
    } catch (e: any) {
      showStatus(e.message, 'error');
    } finally {
      setIsApplying(false);
    }
  }, [fileId, onRefresh, showStatus]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'isbn', label: 'ISBN', icon: <Search size={13} /> },
    { id: 'generate', label: 'Genera', icon: <BookImage size={13} /> },
    { id: 'upload', label: 'Carica', icon: <Upload size={13} /> },
    { id: 'firstpage', label: 'Prima Pagina', icon: <ImagePlus size={13} /> },
  ];

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="glass-panel rounded-2xl w-full max-w-[560px] max-h-[90vh] overflow-hidden shadow-surface-xl animate-fade-in-scale flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-muted">
          <div>
            <h2 className="text-sm font-bold text-txt-primary">Gestisci Copertina</h2>
            <p className="text-[11px] text-txt-muted mt-0.5 truncate max-w-[360px]">{fileName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-txt-muted hover:text-txt-primary hover:bg-white/[0.06] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Current cover preview */}
        <div className="flex items-center gap-4 px-5 py-3 border-b border-border-muted/60 bg-surface-2/20">
          <div className="w-12 h-[72px] rounded-sm overflow-hidden border border-border-muted bg-surface-2 shrink-0">
            {currentThumbnail ? (
              <img src={currentThumbnail} alt="Copertina" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-txt-muted text-[8px]">Nessuna</div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-txt-secondary">
              {coverInfo?.hasCustomCover
                ? `Copertina personalizzata (${coverInfo.coverSource || 'custom'})`
                : 'Copertina predefinita (nessuna personalizzata)'}
            </p>
            {coverInfo?.isbn && (
              <p className="text-[10px] text-txt-muted">ISBN: {coverInfo.isbn}</p>
            )}
          </div>
          {coverInfo?.hasCustomCover && (
            <button
              onClick={handleRemove}
              disabled={isApplying}
              className="ml-auto shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-danger/80 hover:bg-danger/10 border border-danger/20 transition-colors disabled:opacity-50"
            >
              <Trash2 size={11} /> Rimuovi
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border-muted/60">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-accent border-b-2 border-accent bg-accent/[0.04]'
                  : 'text-txt-muted hover:text-txt-secondary'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 custom-scrollbar">
          {/* ── ISBN Tab ── */}
          {activeTab === 'isbn' && (
            <>
              <div>
                <label className="block text-[11px] text-txt-secondary mb-1.5 font-medium">Codice ISBN</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={isbn}
                    onChange={e => setIsbn(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleIsbnSearch(); }}
                    placeholder="es. 9788806217149"
                    className="flex-1 px-3 py-2 rounded-lg bg-surface-2 border border-border-muted text-[12px] text-txt-primary placeholder:text-txt-faint focus:outline-none focus:border-accent/40"
                  />
                  <button
                    onClick={handleIsbnSearch}
                    disabled={isSearching || !isbn.trim()}
                    className="px-3 py-2 rounded-lg bg-accent/15 text-accent text-[11px] font-semibold hover:bg-accent/25 disabled:opacity-40 transition-colors flex items-center gap-1.5"
                  >
                    {isSearching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                    Cerca
                  </button>
                </div>
                <p className="text-[10px] text-txt-muted mt-1">Inserisci il codice ISBN-10 o ISBN-13 del libro.</p>
              </div>

              {searchError && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-danger/5 border border-danger/20 text-[11px] text-danger">
                  <AlertCircle size={13} /> {searchError}
                </div>
              )}

              {searchResult && (
                <div className="space-y-3">
                  {searchResult.coverUrl && (
                    <div className="flex gap-4">
                      <div className="w-24 h-36 rounded-sm overflow-hidden border border-border-muted bg-surface-2 shrink-0">
                        <img
                          src={searchResult.coverUrl}
                          alt="Copertina trovata"
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        {searchResult.title && (
                          <p className="text-[12px] font-semibold text-txt-primary leading-snug">{searchResult.title}</p>
                        )}
                        {searchResult.author && (
                          <p className="text-[11px] text-txt-secondary">{searchResult.author}</p>
                        )}
                        {searchResult.year && (
                          <p className="text-[10px] text-txt-muted">{searchResult.year}</p>
                        )}
                        {searchResult.publishers && searchResult.publishers.length > 0 && (
                          <p className="text-[10px] text-txt-muted">{searchResult.publishers.join(', ')}</p>
                        )}
                        <button
                          onClick={handleApplyIsbnCover}
                          disabled={isApplying}
                          className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-success/10 text-success text-[11px] font-semibold hover:bg-success/20 disabled:opacity-40 transition-colors"
                        >
                          {isApplying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          Usa questa copertina
                        </button>
                      </div>
                    </div>
                  )}
                  {!searchResult.coverUrl && searchResult.title && (
                    <div className="space-y-3">
                      <div className="px-3 py-2 rounded-lg bg-accent/[0.04] border border-accent/15 text-[11px] text-txt-secondary">
                        Libro trovato (<span className="font-semibold">{searchResult.title}</span>{searchResult.author ? `, ${searchResult.author}` : ''}) ma nessuna copertina disponibile su Open Library.
                      </div>
                      <div className="px-3 py-2.5 rounded-lg bg-surface-2 border border-border-muted space-y-2">
                        <p className="text-[10px] font-medium text-txt-muted uppercase tracking-wider">Alternative</p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => {
                              if (searchResult.title) setGenTitle(searchResult.title);
                              if (searchResult.author) setGenAuthor(searchResult.author);
                              if (searchResult.year) setGenYear(searchResult.year);
                              setActiveTab('generate');
                            }}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-accent/10 text-accent text-[10px] font-semibold hover:bg-accent/20 transition-colors"
                          >
                            <BookImage size={11} /> Genera copertina con questi dati
                          </button>
                          <button
                            onClick={() => setActiveTab('firstpage')}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-accent/10 text-accent text-[10px] font-semibold hover:bg-accent/20 transition-colors"
                          >
                            <ImagePlus size={11} /> Usa prima pagina PDF
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {!searchResult.coverUrl && !searchResult.title && (
                    <div className="px-3 py-2 rounded-lg bg-danger/5 border border-danger/20 text-[11px] text-danger">
                      Nessun risultato trovato per questo ISBN.
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Generate Tab ── */}
          {activeTab === 'generate' && (
            <>
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-txt-secondary mb-1 font-medium">Titolo</label>
                  <input
                    type="text"
                    value={genTitle}
                    onChange={e => setGenTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border-muted text-[12px] text-txt-primary placeholder:text-txt-faint focus:outline-none focus:border-accent/40"
                    placeholder="Titolo del libro"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-txt-secondary mb-1 font-medium">Autore</label>
                  <input
                    type="text"
                    value={genAuthor}
                    onChange={e => setGenAuthor(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border-muted text-[12px] text-txt-primary placeholder:text-txt-faint focus:outline-none focus:border-accent/40"
                    placeholder="Nome autore"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-txt-secondary mb-1 font-medium">Anno</label>
                  <input
                    type="text"
                    value={genYear}
                    onChange={e => setGenYear(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border-muted text-[12px] text-txt-primary placeholder:text-txt-faint focus:outline-none focus:border-accent/40"
                    placeholder="Anno di pubblicazione"
                  />
                </div>
              </div>

              {genPreview && (
                <div className="space-y-3">
                  <label className="block text-[11px] text-txt-secondary font-medium">Anteprima</label>
                  <div className="flex justify-center">
                    <div className="w-32 h-48 rounded-sm overflow-hidden border border-border-muted shadow-md">
                      <img src={genPreview} alt="Anteprima copertina" className="w-full h-full object-cover" />
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <button
                      onClick={handleApplyGenerated}
                      disabled={isApplying}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-success/10 text-success text-[11px] font-semibold hover:bg-success/20 disabled:opacity-40 transition-colors"
                    >
                      {isApplying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      Usa copertina generata
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Upload Tab ── */}
          {activeTab === 'upload' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-2xl bg-accent/[0.06] border border-accent/15 flex items-center justify-center">
                <Upload size={24} className="text-accent/60" />
              </div>
              <p className="text-[11px] text-txt-secondary text-center max-w-[280px]">
                Carica un'immagine dal tuo computer da usare come copertina. Formati supportati: JPG, PNG, WebP.
              </p>
              <button
                onClick={handleUpload}
                disabled={isApplying}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent/15 text-accent text-[12px] font-semibold hover:bg-accent/25 disabled:opacity-40 transition-colors"
              >
                {isApplying ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Seleziona immagine
              </button>
            </div>
          )}

          {/* ── First Page Tab ── */}
          {activeTab === 'firstpage' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-2xl bg-accent/[0.06] border border-accent/15 flex items-center justify-center">
                <ImagePlus size={24} className="text-accent/60" />
              </div>
              <p className="text-[11px] text-txt-secondary text-center max-w-[280px]">
                Usa la prima pagina del PDF come immagine di copertina.
              </p>
              <button
                onClick={handleUseFirstPage}
                disabled={isApplying || !coverInfo?.hasFirstPage}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent/15 text-accent text-[12px] font-semibold hover:bg-accent/25 disabled:opacity-40 transition-colors"
              >
                {isApplying ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                Usa prima pagina
              </button>
              {!coverInfo?.hasFirstPage && (
                <p className="text-[10px] text-txt-muted">Nessuna anteprima disponibile. Apri il libro prima per generarla.</p>
              )}
            </div>
          )}
        </div>

        {/* Status message */}
        {statusMsg && (
          <div className={`mx-5 mb-3 flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] ${
            statusMsg.type === 'success'
              ? 'bg-success/10 text-success border border-success/20'
              : 'bg-danger/10 text-danger border border-danger/20'
          }`}>
            {statusMsg.type === 'success' ? <Check size={13} /> : <AlertCircle size={13} />}
            {statusMsg.text}
          </div>
        )}
      </div>
    </div>
  );
};
