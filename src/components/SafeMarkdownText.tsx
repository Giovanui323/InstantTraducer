/**
 * Safe wrapper for MarkdownText component with enhanced error handling and race condition prevention
 */

import React, { useCallback, useRef, useEffect } from 'react';
import { MarkdownText as OriginalMarkdownText } from './MarkdownText';
import { EnhancedErrorBoundary } from './EnhancedErrorBoundary';
import { UserHighlight, UserNote } from '../types';
import { log } from '../services/logger';

interface SafeMarkdownTextProps {
  text: string;
  align?: 'justify' | 'left';
  preserveLayout?: boolean;
  dark?: boolean;
  searchTerm?: string;
  activeResultId?: string | null;
  pageNumber?: number;
  baseOffset?: number;
  highlights?: UserHighlight[];
  userNotes?: UserNote[];
  onAddHighlight?: (start: number, end: number, text: string, color?: string, quote?: { exact: string; prefix: string; suffix: string }) => void;
  onRemoveHighlight?: (id: string) => void;
  onAddNote?: (start: number, end: number, text: string, content: string) => void;
  onUpdateNote?: (id: string, content: string) => void;
  onRemoveNote?: (id: string) => void;
  isHighlightToolActive?: boolean;
  isNoteToolActive?: boolean;
  isEraserToolActive?: boolean;
  onNoteClick?: (id: string) => void;
}

/**
 * Error boundary wrapper for MarkdownText
 */
export const SafeMarkdownText: React.FC<SafeMarkdownTextProps> = (props) => {
  const errorCountRef = useRef(0);
  const lastErrorRef = useRef<Error | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [hasError, setHasError] = React.useState(false);
  const [errorInfo, setErrorInfo] = React.useState<{ error: Error; info: React.ErrorInfo } | null>(null);

  // Validate props
  const validateProps = useCallback(() => {
    const { text, highlights, userNotes, baseOffset } = props;

    if (typeof text !== 'string') {
      log.warn('SafeMarkdownText received non-string text:', text);
      return false;
    }

    if (highlights && !Array.isArray(highlights)) {
      log.warn('SafeMarkdownText received non-array highlights:', highlights);
      return false;
    }

    if (userNotes && !Array.isArray(userNotes)) {
      log.warn('SafeMarkdownText received non-array userNotes:', userNotes);
      return false;
    }

    if (baseOffset !== undefined && (!Number.isFinite(baseOffset) || baseOffset < 0)) {
      log.warn('SafeMarkdownText received invalid baseOffset:', baseOffset);
      return false;
    }

    return true;
  }, [props]);

  // Safe event handlers with debouncing and race condition prevention
  const safeOnAddHighlight = useCallback((
    start: number,
    end: number,
    text: string,
    color?: string,
    quote?: { exact: string; prefix: string; suffix: string }
  ) => {
    try {
      if (!props.onAddHighlight) return;

      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
        log.warn('Invalid highlight range:', { start, end });
        return;
      }

      if (typeof text !== 'string' || text.trim().length === 0) {
        log.warn('Invalid highlight text:', text);
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        log.warn('No valid selection found for highlight');
        return;
      }

      log.debug('Adding highlight:', { start, end, text: text.substring(0, 50) + '...', color });
      props.onAddHighlight(start, end, text, color, quote);
    } catch (error) {
      log.error('Error in safeOnAddHighlight:', error);
    }
  }, [props.onAddHighlight]);

  const safeOnRemoveHighlight = useCallback((id: string) => {
    try {
      if (!props.onRemoveHighlight) return;

      if (typeof id !== 'string' || id.trim().length === 0) {
        log.warn('Invalid highlight ID:', id);
        return;
      }

      log.debug('Removing highlight:', id);
      props.onRemoveHighlight(id);
    } catch (error) {
      log.error('Error in safeOnRemoveHighlight:', error);
    }
  }, [props.onRemoveHighlight]);

  const safeOnAddNote = useCallback((
    start: number,
    end: number,
    text: string,
    content: string
  ) => {
    try {
      if (!props.onAddNote) return;

      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
        log.warn('Invalid note range:', { start, end });
        return;
      }

      if (typeof text !== 'string' || text.trim().length === 0) {
        log.warn('Invalid note text:', text);
        return;
      }

      if (typeof content !== 'string') {
        log.warn('Invalid note content:', content);
        return;
      }

      const sanitizedContent = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

      log.debug('Adding note:', { start, end, text: text.substring(0, 50) + '...', content: sanitizedContent.substring(0, 50) + '...' });
      props.onAddNote(start, end, text, sanitizedContent);
    } catch (error) {
      log.error('Error in safeOnAddNote:', error);
    }
  }, [props.onAddNote]);

  const safeOnUpdateNote = useCallback((id: string, content: string) => {
    try {
      if (!props.onUpdateNote) return;

      if (typeof id !== 'string' || id.trim().length === 0) {
        log.warn('Invalid note ID:', id);
        return;
      }

      if (typeof content !== 'string') {
        log.warn('Invalid note content:', content);
        return;
      }

      const sanitizedContent = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

      log.debug('Updating note:', { id, content: sanitizedContent.substring(0, 50) + '...' });
      props.onUpdateNote(id, sanitizedContent);
    } catch (error) {
      log.error('Error in safeOnUpdateNote:', error);
    }
  }, [props.onUpdateNote]);

  const safeOnRemoveNote = useCallback((id: string) => {
    try {
      if (!props.onRemoveNote) return;

      if (typeof id !== 'string' || id.trim().length === 0) {
        log.warn('Invalid note ID:', id);
        return;
      }

      log.debug('Removing note:', id);
      props.onRemoveNote(id);
    } catch (error) {
      log.error('Error in safeOnRemoveNote:', error);
    }
  }, [props.onRemoveNote]);

  // Error boundary logic
  useEffect(() => {
    if (hasError && errorInfo) {
      errorCountRef.current += 1;
      lastErrorRef.current = errorInfo.error;

      log.error('SafeMarkdownText error boundary caught error:', {
        error: errorInfo.error,
        errorCount: errorCountRef.current,
        componentStack: errorInfo.info.componentStack
      });

      if (errorCountRef.current <= 3) {
        retryTimeoutRef.current = setTimeout(() => {
          setHasError(false);
          setErrorInfo(null);
          log.info('Auto-retrying SafeMarkdownText after error');
        }, 2000);
      }
    }

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [hasError, errorInfo]);

  useEffect(() => {
    if (errorCountRef.current > 0) {
      errorCountRef.current = 0;
      setHasError(false);
      setErrorInfo(null);
    }
  }, [props.text, props.pageNumber]);

  if (hasError && errorCountRef.current > 3) {
    return (
      <div className="p-4 bg-danger/5 border border-danger/15 rounded-xl animate-fade-in">
        <div className="text-danger font-semibold text-[13px] mb-2">Errore nel rendering del testo</div>
        <div className="text-txt-secondary text-[12px] mb-3 leading-relaxed">
          Si è verificato un errore durante il rendering del contenuto.
          {lastErrorRef.current && (
            <div className="mt-2 font-mono text-[10px] text-txt-muted">
              Errore: {lastErrorRef.current.message}
            </div>
          )}
        </div>
        <button
          onClick={() => {
            errorCountRef.current = 0;
            setHasError(false);
            setErrorInfo(null);
          }}
          className="px-3 py-1.5 bg-danger text-white rounded-lg text-[11px] font-bold hover:bg-danger/80 transition-all duration-200 active:scale-95"
        >
          Riprova
        </button>
      </div>
    );
  }

  if (!validateProps()) {
    return (
      <div className="p-4 bg-warning/5 border border-warning/15 rounded-xl animate-fade-in">
        <div className="text-warning font-semibold text-[13px]">Contenuto non valido</div>
        <div className="text-txt-secondary text-[12px] leading-relaxed">
          Il contenuto fornito non è valido e non può essere visualizzato.
        </div>
      </div>
    );
  }

  return (
    <EnhancedErrorBoundary
      onError={(error: Error, info: React.ErrorInfo) => {
        setHasError(true);
        setErrorInfo({ error, info });
      }}
    >
      <OriginalMarkdownText
        {...props}
        onAddHighlight={safeOnAddHighlight}
        onRemoveHighlight={safeOnRemoveHighlight}
        onAddNote={safeOnAddNote}
        onUpdateNote={safeOnUpdateNote}
        onRemoveNote={safeOnRemoveNote}
      />
    </EnhancedErrorBoundary>
  );
};
