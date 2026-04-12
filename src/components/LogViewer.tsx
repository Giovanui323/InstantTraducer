import React, { useState, useEffect, useMemo } from 'react';
import { log } from '../services/logger';

interface LogFile {
  name: string;
  size: number;
  modified: Date;
}

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'unknown';

interface LogEntry {
  timestamp?: Date;
  level: LogLevel;
  lines: string[];
}

type RenderItem =
  | { kind: 'hour'; key: string; label: string; entryCount: number; lineCount: number }
  | { kind: 'line'; text: string };

interface LogViewerProps {
  onClose: () => void;
}

export const LogViewer: React.FC<LogViewerProps> = ({ onClose }) => {
  const [logFiles, setLogFiles] = useState<LogFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [visibleLines, setVisibleLines] = useState(1000);
  const [rangeFrom, setRangeFrom] = useState<string>('');
  const [rangeTo, setRangeTo] = useState<string>('');
  const [timeFrom, setTimeFrom] = useState<string>('');
  const [timeTo, setTimeTo] = useState<string>('');
  const [groupByHour, setGroupByHour] = useState(false);
  const [filters, setFilters] = useState({
    error: true,
    warn: true,
    info: true,
    debug: true
  });

  useEffect(() => {
    loadLogFiles();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedTimeFrom = window.localStorage.getItem('log_viewer_time_from') || '';
      const storedTimeTo = window.localStorage.getItem('log_viewer_time_to') || '';
      const storedGroupByHour = window.localStorage.getItem('log_viewer_group_by_hour') === 'true';
      setTimeFrom(storedTimeFrom);
      setTimeTo(storedTimeTo);
      setGroupByHour(storedGroupByHour);
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('log_viewer_time_from', timeFrom);
      window.localStorage.setItem('log_viewer_time_to', timeTo);
      window.localStorage.setItem('log_viewer_group_by_hour', String(groupByHour));
    } catch {}
  }, [timeFrom, timeTo, groupByHour]);

  useEffect(() => {
    setVisibleLines(1000);
  }, [selectedFile, filters, timeFrom, timeTo, groupByHour]);

  const getDateFromFilename = (filename: string): string | null => {
    const match = String(filename || '').match(/^(?:app|error|debug)-(\d{4}-\d{2}-\d{2})\.log$/);
    return match ? match[1] : null;
  };

  const parsedEntries = useMemo<LogEntry[]>(() => {
    if (!fileContent) return [];

    const timestampRegex = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\b/;
    const lines = fileContent.split('\n');
    const entries: LogEntry[] = [];

    const detectLevel = (line: string): LogLevel => {
      const lower = line.toLowerCase();
      if (lower.includes('error')) return 'error';
      if (lower.includes('warn')) return 'warn';
      if (lower.includes('info')) return 'info';
      if (lower.includes('step')) return 'info';
      if (lower.includes('debug')) return 'debug';
      return 'unknown';
    };

    let current: LogEntry | null = null;
    for (const line of lines) {
      const m = line.match(timestampRegex);
      if (m) {
        if (current) entries.push(current);
        const ts = new Date(m[1]);
        current = { timestamp: isNaN(ts.getTime()) ? undefined : ts, level: detectLevel(line), lines: [line] };
        continue;
      }

      if (!current) {
        current = { timestamp: undefined, level: detectLevel(line), lines: [line] };
        continue;
      }

      current.lines.push(line);
    }

    if (current) entries.push(current);
    return entries;
  }, [fileContent]);

  const filteredEntries = useMemo<LogEntry[]>(() => {
    if (parsedEntries.length === 0) return [];

    const parseTimeToMinutes = (t: string): number | null => {
      const parts = t.split(':');
      if (parts.length < 2) return null;
      const h = Number(parts[0]);
      const m = Number(parts[1]);
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      if (h < 0 || h > 23 || m < 0 || m > 59) return null;
      return h * 60 + m;
    };

    const startMinRaw = parseTimeToMinutes(timeFrom);
    const endMinRaw = parseTimeToMinutes(timeTo);
    const hasTimeFilter = Boolean(timeFrom || timeTo);
    const startMin = startMinRaw ?? 0;
    const endMin = endMinRaw ?? 23 * 60 + 59;

    const levelAllowed = (level: LogLevel): boolean => {
      if (level === 'error') return filters.error;
      if (level === 'warn') return filters.warn;
      if (level === 'debug') return filters.debug;
      return filters.info;
    };

    const timeAllowed = (ts?: Date): boolean => {
      if (!hasTimeFilter) return true;
      if (!ts) return true;
      const mins = ts.getHours() * 60 + ts.getMinutes();
      if (startMin <= endMin) return mins >= startMin && mins <= endMin;
      return mins >= startMin || mins <= endMin;
    };

    return parsedEntries.filter(e => levelAllowed(e.level) && timeAllowed(e.timestamp));
  }, [parsedEntries, filters, timeFrom, timeTo]);

  const filteredLineCount = useMemo(() => {
    return filteredEntries.reduce((acc, e) => acc + e.lines.length, 0);
  }, [filteredEntries]);

  const renderItems = useMemo<RenderItem[]>(() => {
    if (filteredEntries.length === 0) return [];

    if (!groupByHour) {
      return filteredEntries.flatMap((entry) => entry.lines.map((text) => ({ kind: 'line', text } as const)));
    }

    const groups = new Map<string, { label: string; entries: LogEntry[] }>();
    for (const entry of filteredEntries) {
      const hour = entry.timestamp ? String(entry.timestamp.getHours()).padStart(2, '0') : '??';
      const key = hour;
      const label = hour === '??' ? 'Senza orario' : `${hour}:00–${hour}:59`;
      const existing = groups.get(key);
      if (existing) existing.entries.push(entry);
      else groups.set(key, { label, entries: [entry] });
    }

    const keys = Array.from(groups.keys()).sort((a, b) => {
      if (a === '??') return 1;
      if (b === '??') return -1;
      return a.localeCompare(b);
    });

    const items: RenderItem[] = [];
    for (const key of keys) {
      const group = groups.get(key);
      if (!group) continue;
      const lineCount = group.entries.reduce((acc, e) => acc + e.lines.length, 0);
      items.push({
        kind: 'hour',
        key,
        label: group.label,
        entryCount: group.entries.length,
        lineCount
      });
      for (const entry of group.entries) {
        for (const line of entry.lines) {
          items.push({ kind: 'line', text: line });
        }
      }
    }

    return items;
  }, [filteredEntries, groupByHour]);

  const loadLogFiles = async () => {
    try {
      setIsLoading(true);
      setError('');

      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const files = await (window as any).electronAPI.listLogFiles();
        const fileDetails = await Promise.all(
          files.map(async (filename: string) => {
            const info = await (window as any).electronAPI.getLogFileInfo(filename);
            return {
              name: filename,
              size: info?.size || 0,
              modified: info?.modified ? new Date(info.modified) : new Date()
            };
          })
        );
        setLogFiles(fileDetails);
        log.info('Log files loaded', { count: fileDetails.length });

        // Se il file selezionato non esiste più nella nuova lista, pulisci la vista
        if (selectedFile && !fileDetails.find(f => f.name === selectedFile)) {
          setSelectedFile('');
          setFileContent('');
        }
      } else {
        setError('Log viewer non disponibile in ambiente web');
        log.warning('Log viewer accessed in web environment');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Errore nel caricamento file di log: ${errorMessage}`);
      log.error('Error loading log files', { error: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const loadFileContent = async (filename: string) => {
    try {
      setIsLoading(true);
      setError('');

      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const content = await (window as any).electronAPI.readLogFile(filename);
        setFileContent(content);
        setSelectedFile(filename);
        log.info('Log file content loaded', { filename, size: content.length });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Errore nel caricamento contenuto: ${errorMessage}`);
      log.error('Error loading log file content', { filename, error: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const openLogsDirectory = async () => {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        await (window as any).electronAPI.openLogsDir();
        log.info('Logs directory opened');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Errore nell'apertura cartella: ${errorMessage}`);
      log.error('Error opening logs directory', { error: errorMessage });
    }
  };

  const cleanupOldLogs = async (daysToKeep: number = 7) => {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const deletedCount = await (window as any).electronAPI.cleanupOldLogs(daysToKeep);
        log.info('Old logs cleaned up', { deletedCount, daysToKeep });
        await loadLogFiles(); // Ricarica la lista
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Errore nella pulizia log: ${errorMessage}`);
      log.error('Error cleaning up old logs', { error: errorMessage });
    }
  };

  const toggleSelectedFile = (filename: string, checked: boolean) => {
    setSelectedFiles(prev => {
      const set = new Set(prev);
      if (checked) set.add(filename);
      else set.delete(filename);
      return Array.from(set).sort((a, b) => b.localeCompare(a));
    });
  };

  const clearSelection = () => {
    setSelectedFiles([]);
  };

  const selectByRange = () => {
    if (!rangeFrom && !rangeTo) return;

    const from = rangeFrom || '0000-01-01';
    const to = rangeTo || '9999-12-31';
    const start = from <= to ? from : to;
    const end = from <= to ? to : from;

    const matches = logFiles
      .map(f => f.name)
      .filter(name => {
        const d = getDateFromFilename(name);
        if (!d) return false;
        return d >= start && d <= end;
      })
      .sort((a, b) => b.localeCompare(a));

    setSelectedFiles(matches);
  };

  const deleteSelectedLogs = async (filenames: string[]) => {
    try {
      setError('');
      if (filenames.length === 0) return;

      if (!(typeof window !== 'undefined' && (window as any).electronAPI)) {
        setError('Funzionalità disponibile solo in ambiente Electron');
        return;
      }

      const message = filenames.length === 1
        ? `Sei sicuro di voler eliminare il file di log?\n\n${filenames[0]}\n\nQuesta operazione non può essere annullata.`
        : `Sei sicuro di voler eliminare ${filenames.length} file di log selezionati?\n\nQuesta operazione non può essere annullata.`;

      if (!confirm(message)) return;

      setIsLoading(true);
      const res = await (window as any).electronAPI.deleteLogFiles(filenames);
      const deletedCount = typeof res === 'object' ? Number(res.deletedCount || 0) : 0;
      const failed = typeof res === 'object' && Array.isArray(res.failed) ? res.failed : [];

      await loadLogFiles();

      const deletedSelected = new Set(filenames);
      setSelectedFiles(prev => prev.filter(f => !deletedSelected.has(f)));

      if (selectedFile && deletedSelected.has(selectedFile)) {
        setSelectedFile('');
        setFileContent('');
      }

      if (failed.length > 0) {
        alert(`Eliminazione completata parzialmente.\n\nEliminati: ${deletedCount}\nFalliti: ${failed.length}`);
      } else {
        alert(`Eliminazione completata.\n\nEliminati: ${deletedCount}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Errore nell'eliminazione: ${errorMessage}`);
      log.error('Error deleting log files', { error: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getLineColor = (line: string): string => {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('error')) return 'text-danger font-bold';
    if (lowerLine.includes('warn')) return 'text-warning';
    if (lowerLine.includes('info')) return 'text-accent';
    if (lowerLine.includes('step')) return 'text-accent-hover font-medium';
    if (lowerLine.includes('debug')) return 'text-txt-muted';
    return 'text-txt-primary';
  };

  return (
    <div className="fixed inset-0 z-50 bg-surface-0/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel rounded-xl shadow-surface-2xl w-full max-w-6xl h-[80vh] flex flex-col animate-fade-in-scale">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-muted">
          <h2 className="text-xl font-bold text-txt-primary">Visualizzatore Log</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={openLogsDirectory}
              className="px-3 py-1.5 text-sm bg-accent/10 text-accent rounded-lg hover:bg-accent/20 transition-all duration-200 focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
              title="Apri cartella log nel file manager"
            >
              📁 Apri Cartella
            </button>
            <button
              onClick={() => cleanupOldLogs(-1)}
              className="px-3 py-1.5 text-sm bg-danger/10 text-danger rounded-lg hover:bg-danger/20 transition-all duration-200 focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
              title="Elimina tutti i file di log"
            >
              🧹 Pulisci Tutto
            </button>
            <button
              onClick={() => deleteSelectedLogs(selectedFiles)}
              disabled={selectedFiles.length === 0 || isLoading}
              className="px-3 py-1.5 text-sm bg-warning/10 text-warning rounded-lg hover:bg-warning/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
              title={selectedFiles.length === 0 ? 'Seleziona uno o più file' : `Elimina ${selectedFiles.length} file selezionati`}
            >
              🗑️ Elimina Selezionati
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm bg-surface-4 text-txt-secondary rounded-lg hover:bg-surface-5 transition-all duration-200 focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
            >
              ✕ Chiudi
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-3 bg-danger/10 border-b border-danger/20">
            <div className="flex items-center gap-2">
              <span className="text-danger">⚠️</span>
              <span className="text-danger text-sm">{error}</span>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* File List */}
          <div className="w-80 border-r border-border-muted bg-surface-1 overflow-y-auto custom-scrollbar">
            <div className="p-3">
              <h3 className="text-sm font-semibold text-txt-secondary mb-2">File di Log</h3>
              <div className="mb-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-txt-muted mb-1">Da</label>
                    <input
                      type="date"
                      value={rangeFrom}
                      onChange={e => setRangeFrom(e.target.value)}
                      className="w-full text-xs px-2 py-1.5 rounded border border-border-muted bg-surface-2 text-txt-primary focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all duration-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-txt-muted mb-1">A</label>
                    <input
                      type="date"
                      value={rangeTo}
                      onChange={e => setRangeTo(e.target.value)}
                      className="w-full text-xs px-2 py-1.5 rounded border border-border-muted bg-surface-2 text-txt-primary focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all duration-200"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectByRange}
                    className="flex-1 px-2 py-1.5 text-xs bg-surface-3 border border-border-muted rounded hover:bg-surface-4 text-txt-secondary transition-all duration-200"
                    title="Seleziona i file con data nel nome compresa nell'intervallo"
                  >
                    Seleziona intervallo
                  </button>
                  <button
                    onClick={clearSelection}
                    className="px-2 py-1.5 text-xs bg-surface-3 border border-border-muted rounded hover:bg-surface-4 text-txt-secondary transition-all duration-200"
                    title="Deseleziona tutto"
                  >
                    Pulisci
                  </button>
                </div>
                {selectedFiles.length > 0 && (
                  <div className="text-[10px] text-txt-muted">
                    Selezionati: <span className="font-semibold">{selectedFiles.length}</span>
                  </div>
                )}
              </div>
              {isLoading && logFiles.length === 0 ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent mx-auto"></div>
                  <p className="text-xs text-txt-muted mt-2">Caricamento...</p>
                </div>
              ) : logFiles.length === 0 ? (
                <p className="text-xs text-txt-muted text-center py-4">Nessun file di log trovato</p>
              ) : (
                <div className="space-y-1">
                  {logFiles.map((file) => {
                    const isDaily = file.modified.toDateString() === new Date().toDateString();
                    const isChecked = selectedFiles.includes(file.name);
                    return (
                      <div
                        key={file.name}
                        onClick={() => loadFileContent(file.name)}
                        className={`p-2 rounded-lg cursor-pointer transition-all duration-200 ${
                          selectedFile === file.name
                            ? isDaily
                              ? 'bg-success/10 border border-success/30'
                              : 'bg-accent/10 border border-accent/30'
                            : isDaily
                              ? 'bg-success/5 hover:bg-success/10 border border-success/20'
                              : 'bg-surface-2 hover:bg-surface-3 border border-border-muted'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={e => toggleSelectedFile(file.name, e.target.checked)}
                            onClick={e => e.stopPropagation()}
                            className="mt-0.5 rounded border-border text-accent focus:ring-accent/20 w-3.5 h-3.5"
                            title="Seleziona per eliminazione"
                          />
                          <div className="min-w-0 flex-1">
                            <div className={`text-xs font-medium truncate ${isDaily ? 'text-success' : 'text-txt-primary'}`}>
                              {file.name}
                            </div>
                            <div className={`text-xs mt-1 ${isDaily ? 'text-success/70' : 'text-txt-muted'}`}>
                              {formatFileSize(file.size)} • {formatDate(file.modified)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Log Content */}
          <div className="flex-1 flex flex-col bg-surface-0">
            {selectedFile ? (
              <>
                <div className="p-3 border-b border-border-muted bg-surface-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-txt-secondary">
                      {selectedFile}
                    </h3>
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-txt-muted">
                        {formatFileSize(fileContent.length)} • {filteredLineCount} righe visibili (di {fileContent.split('\n').length})
                      </div>
                      <button
                        onClick={() => deleteSelectedLogs([selectedFile])}
                        disabled={isLoading}
                        className="px-2 py-1 text-xs bg-danger/10 text-danger rounded hover:bg-danger/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Elimina questo file di log"
                      >
                        🗑️ Elimina file
                      </button>
                    </div>
                  </div>

                  {/* Filters */}
                  <div className="flex flex-wrap items-center gap-2 text-xs border-t border-border-muted pt-2">
                    <span className="text-txt-muted font-medium">Filtra:</span>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none hover:bg-surface-3 px-2 py-1 rounded transition-all duration-200">
                      <input
                        type="checkbox"
                        checked={filters.error}
                        onChange={e => setFilters(f => ({ ...f, error: e.target.checked }))}
                        className="rounded border-border text-danger focus:ring-danger/20 w-3.5 h-3.5"
                      />
                      <span className="text-danger font-medium">Errori</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none hover:bg-surface-3 px-2 py-1 rounded transition-all duration-200">
                      <input
                        type="checkbox"
                        checked={filters.warn}
                        onChange={e => setFilters(f => ({ ...f, warn: e.target.checked }))}
                        className="rounded border-border text-warning focus:ring-warning/20 w-3.5 h-3.5"
                      />
                      <span className="text-warning font-medium">Warning</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none hover:bg-surface-3 px-2 py-1 rounded transition-all duration-200">
                      <input
                        type="checkbox"
                        checked={filters.info}
                        onChange={e => setFilters(f => ({ ...f, info: e.target.checked }))}
                        className="rounded border-border text-accent focus:ring-accent/20 w-3.5 h-3.5"
                      />
                      <span className="text-accent font-medium">Info</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none hover:bg-surface-3 px-2 py-1 rounded transition-all duration-200">
                      <input
                        type="checkbox"
                        checked={filters.debug}
                        onChange={e => setFilters(f => ({ ...f, debug: e.target.checked }))}
                        className="rounded border-border text-txt-muted focus:ring-txt-muted/20 w-3.5 h-3.5"
                      />
                      <span className="text-txt-muted font-medium">Debug</span>
                    </label>
                    <div className="flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-3 transition-all duration-200">
                      <span className="text-txt-muted font-medium">Orario:</span>
                      <input
                        type="time"
                        value={timeFrom}
                        onChange={(e) => setTimeFrom(e.target.value)}
                        className="bg-surface-2 border border-border-muted rounded px-2 py-1 text-xs text-txt-primary focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all duration-200"
                      />
                      <span className="text-txt-faint">–</span>
                      <input
                        type="time"
                        value={timeTo}
                        onChange={(e) => setTimeTo(e.target.value)}
                        className="bg-surface-2 border border-border-muted rounded px-2 py-1 text-xs text-txt-primary focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all duration-200"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setTimeFrom('');
                          setTimeTo('');
                        }}
                        className="px-2 py-1 rounded bg-surface-3 text-txt-secondary hover:bg-surface-4 transition-all duration-200"
                        title="Azzera il filtro orario"
                      >
                        Reset
                      </button>
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none hover:bg-surface-3 px-2 py-1 rounded transition-all duration-200">
                      <input
                        type="checkbox"
                        checked={groupByHour}
                        onChange={e => setGroupByHour(e.target.checked)}
                        className="rounded border-border text-accent focus:ring-accent/20 w-3.5 h-3.5"
                      />
                      <span className="text-accent font-medium">Seziona per ora</span>
                    </label>
                  </div>
                </div>

                <div className="flex-1 overflow-auto custom-scrollbar">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
                    </div>
                  ) : (
                    <div className="p-4 text-xs font-mono whitespace-pre-wrap break-all select-text">
                      {renderItems.length > 0 ? (
                        <>
                          {renderItems.slice(0, visibleLines).map((item, i) => {
                            if (item.kind === 'hour') {
                              return (
                                <div
                                  key={`${item.key}-${i}`}
                                  className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-surface-1/95 backdrop-blur border-y border-border-muted text-txt-primary font-sans"
                                >
                                  <span className="font-semibold">{item.label}</span>
                                  <span className="text-txt-muted ml-2">
                                    {item.entryCount} eventi • {item.lineCount} righe
                                  </span>
                                </div>
                              );
                            }
                            return (
                              <div key={i} className={`${getLineColor(item.text)} hover:bg-surface-2/50 py-0.5`}>
                                {item.text}
                              </div>
                            );
                          })}
                          {renderItems.length > visibleLines && (
                            <div className="mt-6 text-center pb-4">
                              <button
                                onClick={() => setVisibleLines(prev => prev + 2000)}
                                className="px-4 py-2 text-xs font-medium bg-surface-3 border border-border hover:bg-surface-4 rounded-lg text-txt-secondary transition-all duration-200 shadow-surface"
                              >
                                👇 Carica altre 2000 righe ({renderItems.length - visibleLines} rimanenti)
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-center py-10">
                          <p className="text-txt-muted italic">
                            {fileContent ? 'Nessun log corrisponde ai filtri selezionati' : 'File vuoto'}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center animate-fade-in">
                  <div className="text-4xl mb-4">📝</div>
                  <p className="text-txt-muted">Seleziona un file di log per visualizzarne il contenuto</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
