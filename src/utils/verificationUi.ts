import { PageAnnotation, PageVerification } from '../types';

export const getVerificationDisplayData = (args: {
  translatedText: unknown;
  verification?: PageVerification;
  annotations?: PageAnnotation[];
}) => {
  const translatedText = typeof args.translatedText === 'string' ? args.translatedText : '';
  const hasText = translatedText.trim().length > 0;

  return {
    hasText,
    translatedText,
    verification: hasText ? args.verification : undefined,
    annotations: hasText ? (args.annotations || []) : []
  };
};

export const getVerificationUiState = (report?: PageVerification) => {
  if (!report) {
    return { dotClass: 'bg-gray-400', label: 'Verifica non avviata', severityLabel: undefined as string | undefined };
  }

  if (report.state === 'verifying') {
    return { dotClass: 'bg-blue-500', label: 'Verifica in corso…', severityLabel: undefined as string | undefined };
  }

  if (report.state === 'failed') {
    return { dotClass: 'bg-red-500', label: 'Verifica fallita', severityLabel: undefined as string | undefined };
  }

  if (report.state === 'verified') {
    if (report.postRetryFailed) {
      return { dotClass: 'bg-amber-500', label: 'Verifica: da ricontrollare', severityLabel: undefined as string | undefined };
    }
    if (report.changed) {
      return { dotClass: 'bg-amber-500', label: 'Verifica: testo aggiornato', severityLabel: undefined as string | undefined };
    }
    if (report.severity === 'severe') {
      return { dotClass: 'bg-red-500', label: 'Verifica: problemi gravi', severityLabel: 'SEVERE' };
    }
    if (report.severity === 'minor') {
      return { dotClass: 'bg-amber-500', label: 'Verifica: attenzione', severityLabel: 'MINOR' };
    }
    return { dotClass: 'bg-green-500', label: 'Verifica OK', severityLabel: undefined as string | undefined };
  }

  return { dotClass: 'bg-gray-400', label: 'Verifica non avviata', severityLabel: undefined as string | undefined };
};
