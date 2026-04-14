import { storage } from './storageUtils';
import type { AIProvider } from '../types';
import type { DiagnosticErrorCategory } from './diagnosticErrors';

// --- Types ---

export type DiagnosticStatus = 'idle' | 'testing' | 'success' | 'error';

export interface ProviderDiagnosticResult {
  provider: AIProvider;
  model: string;
  role: 'primary' | 'secondary' | 'metadata' | 'standalone';
  status: DiagnosticStatus;
  latencyMs?: number;
  timestamp: number;
  errorCategory?: DiagnosticErrorCategory;
  errorMessage?: string;
  responsePreview?: string;
}

export interface DiagnosticRun {
  id: string;
  startedAt: number;
  completedAt?: number;
  results: ProviderDiagnosticResult[];
  overallStatus: 'running' | 'passed' | 'partial' | 'failed';
}

export interface DiagnosticHistory {
  runs: DiagnosticRun[];
}

// --- Constants ---

const STORAGE_KEY = 'ai_diagnostic_history';
const MAX_RUNS = 10;

// --- Helpers ---

function emptyHistory(): DiagnosticHistory {
  return { runs: [] };
}

function generateId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// --- Public API ---

export function loadDiagnosticHistory(): DiagnosticHistory {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyHistory();
    const parsed = JSON.parse(raw) as DiagnosticHistory;
    if (!parsed?.runs || !Array.isArray(parsed.runs)) return emptyHistory();
    return parsed;
  } catch {
    return emptyHistory();
  }
}

export function saveDiagnosticRun(run: DiagnosticRun): void {
  try {
    const history = loadDiagnosticHistory();
    history.runs.unshift(run);
    if (history.runs.length > MAX_RUNS) {
      history.runs = history.runs.slice(0, MAX_RUNS);
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Silently fail — diagnostics are non-critical
  }
}

export function clearDiagnosticHistory(): void {
  storage.removeItem(STORAGE_KEY);
}

export function createEmptyRun(totalTests: number): DiagnosticRun {
  return {
    id: generateId(),
    startedAt: Date.now(),
    results: [],
    overallStatus: 'running',
  };
}

export function computeOverallStatus(
  results: ProviderDiagnosticResult[]
): 'passed' | 'partial' | 'failed' {
  const completed = results.filter(r => r.status === 'success' || r.status === 'error');
  const succeeded = completed.filter(r => r.status === 'success').length;
  if (succeeded === completed.length && completed.length > 0) return 'passed';
  if (succeeded === 0) return 'failed';
  return 'partial';
}
