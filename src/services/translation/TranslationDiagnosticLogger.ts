import { log } from '../logger';

export interface DiagnosticEntry {
  page: number;
  timestamp: number;
  provider: string;
  model: string;
  sourceLanguage: string;
  systemPrompt: string;
  userInstruction: string;
  previousContext: string;
  imageWidth?: number;
  imageHeight?: number;
  imageBase64Length: number;
  resultText: string | null;
  resultModelUsed: string | null;
  error: string | null;
  durationMs: number;
}

const entries: DiagnosticEntry[] = [];
let enabled = false;

export const setDiagnosticLogEnabled = (v: boolean) => {
  enabled = v;
  if (!v) entries.length = 0;
  log.info('[DIAGNOSTIC] Translation diagnostic log ' + (v ? 'enabled' : 'disabled'));
};

export const isDiagnosticLogEnabled = () => enabled;

export const addDiagnosticEntry = (entry: DiagnosticEntry) => {
  if (!enabled) return;
  entries.push(entry);
  log.info('[DIAGNOSTIC] Logged page ' + entry.page + ' (' + entry.provider + '/' + entry.model + ') ' + (entry.error ? 'ERROR' : 'OK') + ' ' + entry.durationMs + 'ms');
};

export const getDiagnosticEntries = (): DiagnosticEntry[] => [...entries];

export const getDiagnosticEntriesCount = () => entries.length;

export const clearDiagnosticEntries = () => {
  entries.length = 0;
  log.info('[DIAGNOSTIC] Entries cleared');
};

export const exportDiagnosticLog = (): string => {
  if (entries.length === 0) return '';

  const parts: string[] = [];
  const sep = '═'.repeat(80);
  const subsep = '─'.repeat(80);

  parts.push(sep);
  parts.push('TRANSLATION DIAGNOSTIC LOG');
  parts.push('Generated: ' + new Date().toISOString());
  parts.push('Entries: ' + entries.length);
  parts.push(sep);
  parts.push('');

  for (const e of entries) {
    parts.push(subsep);
    parts.push('PAGE ' + e.page + ' | ' + e.provider + '/' + e.model + ' | ' + e.sourceLanguage);
    parts.push('Time: ' + new Date(e.timestamp).toISOString() + ' | Duration: ' + e.durationMs + 'ms');
    parts.push('Image: ~' + Math.round(e.imageBase64Length / 1024) + 'KB' + (e.imageWidth ? ' (' + e.imageWidth + 'x' + e.imageHeight + ')' : ''));
    parts.push('Result: ' + (e.error ? 'ERROR: ' + e.error : (e.resultText?.length || 0) + ' chars'));
    parts.push(subsep);
    parts.push('');
    parts.push('═══ SYSTEM PROMPT ═══');
    parts.push(e.systemPrompt);
    parts.push('');
    parts.push('═══ USER INSTRUCTION ═══');
    parts.push(e.userInstruction);
    parts.push('');
    if (e.previousContext) {
      parts.push('═══ PREVIOUS CONTEXT ═══');
      parts.push(e.previousContext.slice(0, 5000));
      parts.push('');
    }
    if (e.resultText) {
      parts.push('═══ TRANSLATION RESULT ═══');
      parts.push(e.resultText);
      parts.push('');
    }
    if (e.error) {
      parts.push('═══ ERROR ═══');
      parts.push(e.error);
      parts.push('');
    }
    parts.push('');
  }

  return parts.join('\n');
};

export const exportDiagnosticMarkdown = (): string => {
  if (entries.length === 0) return '';

  const CB = String.fromCharCode(96, 96, 96); // triple backtick
  const lines: string[] = [];

  lines.push('# Translation Diagnostic Report');
  lines.push('');
  lines.push('**Date:** ' + new Date().toISOString());
  lines.push('**Pages logged:** ' + entries.length);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const e of entries) {
    lines.push('## Page ' + e.page);
    lines.push('');
    lines.push('| Field | Value |');
    lines.push('|-------|-------|');
    lines.push('| Provider | ' + e.provider + ' |');
    lines.push('| Model | ' + e.model + ' |');
    lines.push('| Source Language | ' + e.sourceLanguage + ' |');
    lines.push('| Duration | ' + e.durationMs + 'ms |');
    lines.push('| Image Size | ~' + Math.round(e.imageBase64Length / 1024) + 'KB' + (e.imageWidth ? ' (' + e.imageWidth + 'x' + e.imageHeight + ')' : '') + ' |');
    lines.push('| Result | ' + (e.error ? '**ERROR:** ' + e.error : (e.resultText?.length || 0) + ' chars') + ' |');
    lines.push('| Model Used | ' + (e.resultModelUsed || e.model) + ' |');
    lines.push('');

    lines.push('### System Prompt');
    lines.push('');
    lines.push(CB);
    lines.push(e.systemPrompt);
    lines.push(CB);
    lines.push('');

    lines.push('### User Instruction');
    lines.push('');
    lines.push(CB);
    lines.push(e.userInstruction);
    lines.push(CB);
    lines.push('');

    if (e.previousContext) {
      lines.push('### Previous Context');
      lines.push('');
      lines.push(CB);
      lines.push(e.previousContext.slice(0, 5000));
      lines.push(CB);
      lines.push('');
    }

    if (e.resultText) {
      lines.push('### Translation Result');
      lines.push('');
      lines.push(CB);
      lines.push(e.resultText);
      lines.push(CB);
      lines.push('');
    }

    if (e.error) {
      lines.push('### Error');
      lines.push('');
      lines.push('> ' + e.error);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
};
