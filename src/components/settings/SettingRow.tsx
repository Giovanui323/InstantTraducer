import React from 'react';

export type SettingRowProps = {
  id?: string;
  title: string;
  description?: string;
  right: React.ReactNode;
};

export const SettingRow = ({ id, title, description, right }: SettingRowProps) => {
  return (
    <div id={id} className="rounded-xl border border-border-muted bg-surface-3/30 px-4 py-3 transition-colors duration-200 hover:bg-surface-3/50">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[12px] font-bold text-txt-primary truncate">{title}</div>
          {description && <div className="mt-1 text-[11px] text-txt-muted leading-snug">{description}</div>}
        </div>
        <div className="shrink-0">{right}</div>
      </div>
    </div>
  );
};
