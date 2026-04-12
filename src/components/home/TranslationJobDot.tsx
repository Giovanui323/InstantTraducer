import React from 'react';
import { useTranslationSnapshot } from '../../hooks/useTranslationSnapshot';

interface Props {
  fileId: string;
  isCurrentProjectTranslating?: boolean;
}

export const TranslationJobDot: React.FC<Props> = ({ fileId, isCurrentProjectTranslating }) => {
  const { backgroundJob } = useTranslationSnapshot();

  let status: 'running' | 'paused' | 'error' | null = null;

  if (backgroundJob && backgroundJob.fileId === fileId) {
    status = backgroundJob.status === 'completed' ? null : backgroundJob.status;
  }

  if (isCurrentProjectTranslating) {
    status = 'running';
  }

  if (!status) return null;

  const colorClass = status === 'running' ? 'bg-accent' : status === 'error' ? 'bg-danger' : 'bg-txt-muted';

  return (
    <div className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${colorClass} border-2 border-surface-2 shadow-glow-accent z-10 ${status === 'running' ? 'animate-pulse-glow' : ''}`} />
  );
};
