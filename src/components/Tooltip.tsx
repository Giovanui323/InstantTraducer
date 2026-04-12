import React from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, className = '' }) => {
  return (
    <div className={`group relative flex items-center justify-center ${className}`}>
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 px-2.5 py-1.5 bg-surface-5/95 backdrop-blur-xl text-txt-primary text-[10px] font-medium rounded-lg shadow-surface-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-200 ease-out-expo delay-300 pointer-events-none z-[300] border border-border-muted transform translate-y-1 group-hover:translate-y-0">
        {content}
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-[4px] border-transparent border-t-surface-5/95" />
      </div>
    </div>
  );
};
