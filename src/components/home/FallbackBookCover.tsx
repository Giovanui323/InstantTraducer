import React from 'react';

interface FallbackBookCoverProps {
  fileName: string;
}

const PALETTES = [
  { band: '#7c1d2e', body: '#2a0e16', accent: '#fde68a' }, // bordeaux
  { band: '#1e3a5f', body: '#0b1a30', accent: '#fde68a' }, // navy
  { band: '#1f3d2b', body: '#0d1f16', accent: '#fde68a' }, // forest
  { band: '#3d2817', body: '#1a1109', accent: '#fde68a' }, // leather brown
  { band: '#3a1a4d', body: '#1a0b26', accent: '#fde68a' }, // deep purple
  { band: '#4a3014', body: '#1e1408', accent: '#fde68a' }, // mustard
  { band: '#1a3d3a', body: '#081a19', accent: '#fde68a' }, // teal
  { band: '#4a1a1a', body: '#200b0b', accent: '#fde68a' }, // oxblood
];

const hashString = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const cleanTitle = (name: string): string => {
  return name
    .replace(/\.pdf$/i, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const FallbackBookCover: React.FC<FallbackBookCoverProps> = ({ fileName }) => {
  const palette = PALETTES[hashString(fileName) % PALETTES.length];
  const title = cleanTitle(fileName);

  return (
    <div
      className="absolute inset-0 flex flex-col"
      style={{
        backgroundColor: palette.body,
        backgroundImage:
          'radial-gradient(ellipse 110% 60% at 50% 0%, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 50%), ' +
          'repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 3px)'
      }}
    >
      <div
        className="h-[34%] relative flex items-end justify-center pb-2"
        style={{
          backgroundColor: palette.band,
          boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)'
        }}
      >
        <div
          className="w-10 h-[1px] opacity-70"
          style={{ background: palette.accent }}
        />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-3 text-center">
        <div
          className="font-reader font-semibold text-[10.5px] leading-[1.2] line-clamp-4 tracking-tight"
          style={{ color: palette.accent }}
        >
          {title}
        </div>
      </div>
      <div
        className="py-1.5 flex items-center justify-center"
        style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          boxShadow: 'inset 0 1px 0 rgba(0,0,0,0.35)'
        }}
      >
        <span
          className="text-[7px] font-bold uppercase tracking-[0.28em]"
          style={{ color: palette.accent, opacity: 0.55 }}
        >
          PDF
        </span>
      </div>
    </div>
  );
};
