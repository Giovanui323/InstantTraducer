import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  onDismiss: () => void;
  version?: string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onDismiss, version }) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setIsExiting(true), 1500);
    const t2 = setTimeout(onDismiss, 2000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDismiss]);

  return (
    <div
      className={`fixed inset-0 z-[9998] flex items-center justify-center select-none app-region-drag transition-opacity duration-500 ${
        isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{
        background:
          'radial-gradient(ellipse 65% 55% at 50% 45%, rgba(245, 158, 11, 0.12) 0%, rgba(245, 158, 11, 0) 65%), ' +
          'radial-gradient(ellipse 120% 140% at 50% 50%, transparent 55%, rgba(0, 0, 0, 0.55) 100%), ' +
          'repeating-linear-gradient(90deg, transparent 0px, transparent 199px, rgba(245, 220, 175, 0.025) 200px, transparent 201px), ' +
          'linear-gradient(180deg, #0c1428 0%, #050910 100%)'
      }}
      aria-hidden={isExiting}
      role="status"
      aria-label="Apertura di iTraducer"
    >
      <div className="flex flex-col items-center gap-7">
        <svg viewBox="0 0 120 96" className="w-28 h-auto splash-icon" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="splashSpine" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fde68a" />
              <stop offset="0.5" stopColor="#f59e0b" />
              <stop offset="1" stopColor="#b45309" />
            </linearGradient>
            <linearGradient id="splashPageL" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#1a2a52" />
              <stop offset="1" stopColor="#0b1633" />
            </linearGradient>
            <linearGradient id="splashPageR" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#0b1633" />
              <stop offset="1" stopColor="#1a2a52" />
            </linearGradient>
          </defs>
          <ellipse cx="60" cy="86" rx="42" ry="3.5" fill="black" opacity="0.45" />
          <path
            d="M60 22 L12 30 V74 L60 78 Z"
            fill="url(#splashPageL)"
            stroke="rgba(245,158,11,0.45)"
            strokeWidth="0.9"
            strokeLinejoin="round"
          />
          <path
            d="M60 22 L108 30 V74 L60 78 Z"
            fill="url(#splashPageR)"
            stroke="rgba(245,158,11,0.45)"
            strokeWidth="0.9"
            strokeLinejoin="round"
          />
          <line x1="60" y1="22" x2="60" y2="78" stroke="url(#splashSpine)" strokeWidth="2.5" strokeLinecap="round" />
          <g stroke="#f59e0b" strokeOpacity="0.42" strokeWidth="0.8" strokeLinecap="round">
            <line x1="18" y1="40" x2="52" y2="44" />
            <line x1="20" y1="48" x2="53" y2="51" />
            <line x1="18" y1="56" x2="52" y2="59" />
            <line x1="20" y1="64" x2="48" y2="66" />
            <line x1="68" y1="44" x2="102" y2="40" />
            <line x1="67" y1="51" x2="100" y2="48" />
            <line x1="68" y1="59" x2="102" y2="56" />
            <line x1="72" y1="66" x2="100" y2="64" />
          </g>
        </svg>

        <div className="flex flex-col items-center gap-1.5">
          <h1 className="font-reader text-[44px] font-semibold tracking-tight text-txt-primary splash-title leading-none">
            iTraducer
          </h1>
          <p className="font-reader italic text-[14px] text-txt-secondary splash-tagline tracking-wide">
            La biblioteca multilingue
          </p>
        </div>

        <div className="mt-2 h-px w-36 bg-border-muted/60 overflow-hidden rounded-full">
          <div className="splash-loading-bar h-full bg-accent origin-left" />
        </div>

        {version && (
          <div className="text-[9px] text-txt-faint tracking-[0.25em] uppercase font-medium splash-version">
            v{version}
          </div>
        )}
      </div>
    </div>
  );
};
