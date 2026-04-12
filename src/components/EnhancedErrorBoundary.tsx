/**
 * Enhanced Error Boundary with comprehensive error handling and recovery
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, XCircle } from 'lucide-react';
import { log } from '../services/logger';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetOnPropsChange?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
  isRetrying: boolean;
  lastResetTime: number;
}

export class EnhancedErrorBoundary extends Component<Props, State> {
  private retryTimeout: NodeJS.Timeout | null = null;
  private resetTimeout: NodeJS.Timeout | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      isRetrying: false,
      lastResetTime: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      isRetrying: false
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError } = this.props;
    const { retryCount } = this.state;

    log.error('EnhancedErrorBoundary caught error:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      retryCount
    });

    if (onError) {
      try {
        onError(error, errorInfo);
      } catch (handlerError) {
        log.error('Error in error handler:', handlerError);
      }
    }

    this.setState({
      errorInfo,
      hasError: true,
      error,
      isRetrying: false
    });

    this.scheduleRetry();
  }

  componentDidUpdate(prevProps: Props) {
    const { resetOnPropsChange } = this.props;
    const { hasError, lastResetTime } = this.state;

    if (resetOnPropsChange && hasError && this.shouldResetOnPropsChange(prevProps)) {
      const now = Date.now();
      if (now - lastResetTime > 1000) {
        this.reset();
      }
    }
  }

  componentWillUnmount() {
    this.clearTimeouts();
  }

  private shouldResetOnPropsChange(prevProps: Props): boolean {
    const currentProps = this.props;
    const keys = Object.keys(currentProps) as Array<keyof Props>;

    return keys.some(key => {
      if (key === 'children' || key === 'fallback' || key === 'onError') return false;
      return currentProps[key] !== prevProps[key];
    });
  }

  private scheduleRetry = () => {
    const { maxRetries = 3, retryDelay = 2000 } = this.props;
    const { retryCount } = this.state;

    if (retryCount >= maxRetries) {
      log.warn('Max retries reached, giving up');
      return;
    }

    this.clearTimeouts();

    this.retryTimeout = setTimeout(() => {
      this.setState({ isRetrying: true });

      this.setState(prevState => ({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: prevState.retryCount + 1,
        isRetrying: false
      }));

      log.info(`Auto-retrying after error (attempt ${retryCount + 1})`);
    }, retryDelay);
  };

  private reset = () => {
    log.info('Manual reset requested');
    this.clearTimeouts();

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      isRetrying: false,
      lastResetTime: Date.now()
    });
  };

  private clearTimeouts = () => {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    if (this.resetTimeout) {
      clearTimeout(this.resetTimeout);
      this.resetTimeout = null;
    }
  };

  private copyErrorDetails = () => {
    const { error, errorInfo } = this.state;
    if (!error) return;

    const errorDetails = `
Error: ${error.message}
Stack: ${error.stack || 'N/A'}
Component Stack: ${errorInfo?.componentStack || 'N/A'}
Time: ${new Date().toISOString()}
    `.trim();

    navigator.clipboard.writeText(errorDetails).then(() => {
      log.info('Error details copied to clipboard');
    }).catch(err => {
      log.error('Failed to copy error details:', err);
    });
  };

  render() {
    const { children, fallback } = this.props;
    const { hasError, error, retryCount, isRetrying } = this.state;

    if (!hasError) {
      return children;
    }

    if (fallback) {
      return <>{fallback(error!, this.reset)}</>;
    }

    return (
      <div className="p-6 bg-danger/5 border border-danger/15 rounded-xl max-w-2xl mx-auto my-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-danger/10 border border-danger/15 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-danger" />
          </div>
          <div>
            <h3 className="text-[14px] font-bold text-danger">
              Si è verificato un errore
            </h3>
            <p className="text-[12px] text-txt-secondary mt-0.5">
              {error?.message || 'Errore sconosciuto'}
            </p>
          </div>
        </div>

        {isRetrying && (
          <div className="flex items-center gap-2 mb-4 text-[12px] text-txt-secondary">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-accent" />
            Tentativo di ripristino in corso...
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={this.reset}
            disabled={isRetrying}
            className="inline-flex items-center gap-2 px-4 py-2 bg-danger text-white rounded-lg text-[11px] font-semibold hover:bg-danger/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Riprova ora
          </button>

          <button
            onClick={this.copyErrorDetails}
            className="inline-flex items-center gap-2 px-4 py-2 bg-surface-4 text-txt-primary rounded-lg text-[11px] font-semibold hover:bg-surface-5 transition-all duration-200"
          >
            <XCircle className="w-3.5 h-3.5" />
            Copia dettagli errore
          </button>
        </div>

        {retryCount > 0 && (
          <div className="mt-4 p-3 bg-surface-3/50 rounded-lg border border-border-muted">
            <p className="text-[11px] text-txt-secondary">
              Tentativi di ripristino: {retryCount}
              {retryCount >= (this.props.maxRetries || 3) && (
                <span className="block mt-1 font-medium text-danger">
                  Raggiunto il numero massimo di tentativi. Contattare il supporto se il problema persiste.
                </span>
              )}
            </p>
          </div>
        )}

        {error?.stack && (
          <details className="mt-4">
            <summary className="cursor-pointer text-[11px] text-txt-muted hover:text-txt-secondary transition-colors">
              Mostra stack trace
            </summary>
            <pre className="mt-2 p-3 bg-surface-3 rounded-lg text-[10px] text-txt-muted overflow-auto max-h-64 custom-scrollbar font-mono">
              {error.stack}
            </pre>
          </details>
        )}
      </div>
    );
  }
}
