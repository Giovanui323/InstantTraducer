import React, { Component, ErrorInfo, ReactNode } from 'react';
import { log as logger } from '../services/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('ErrorBoundary caught uncaught error', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorName: error.name
    });
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-8 bg-danger/5 border border-danger/15 rounded-xl text-center">
          <h2 className="text-danger font-bold text-[14px] mb-2">Qualcosa è andato storto</h2>
          <p className="text-txt-secondary text-[12px] leading-relaxed">Si è verificato un errore durante il rendering di questa sezione.</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="mt-4 px-4 py-2 bg-danger text-white rounded-lg text-[11px] font-bold hover:bg-danger/80 transition-all duration-200 active:scale-95"
          >
            Riprova
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
