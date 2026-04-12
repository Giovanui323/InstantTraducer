import React from 'react';
import { useTranslationSnapshot } from '../../hooks/useTranslationSnapshot';

interface Props {
  onClick: () => void;
}

export const HomeTranslationSummaryButton: React.FC<Props> = ({ onClick }) => {
  const { summaryCount, backgroundJob } = useTranslationSnapshot();

  if (summaryCount === 0) {
    return (
      <button
        className="text-[10px] font-medium text-txt-muted hover:text-txt-secondary transition-colors duration-150 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.03] flex items-center gap-2"
        onClick={onClick}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-txt-muted" />
        0 in traduzione
      </button>
    );
  }

  const hasError = backgroundJob?.status === 'error' || backgroundJob?.error;
  const isCompleted = backgroundJob?.status === 'completed';

  let dotColor = "bg-accent";
  let textColor = "text-accent";
  if (hasError) { dotColor = "bg-danger"; textColor = "text-danger"; }
  else if (isCompleted) { dotColor = "bg-success"; textColor = "text-success"; }
  else if (backgroundJob?.status === 'paused') { dotColor = "bg-txt-muted"; textColor = "text-txt-secondary"; }

  return (
    <button
      className={`text-[10px] font-bold ${textColor} hover:brightness-110 transition-all duration-150 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] flex items-center gap-2 border border-border-muted`}
      onClick={onClick}
    >
      <div className={`w-1.5 h-1.5 rounded-full ${dotColor} animate-pulse-glow`} />
      {summaryCount} in traduzione
    </button>
  );
};
