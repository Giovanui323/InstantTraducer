
import { ReaderTheme } from './readerStyling';

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'red';

export interface HighlightColorDef {
  id: HighlightColor;
  label: string;
  hex: string;
  twClass: string; // Tailwind class for the circle button bg
}

// Marker-style palette: desaturated, paper-friendly. The visible "marker" effect
// is achieved by combining these tints with mix-blend-multiply so the underlying
// text stays fully legible (vs. flat saturated overlays that dim the glyphs).
export const HIGHLIGHT_COLORS: HighlightColorDef[] = [
  { id: 'yellow', label: 'Giallo', hex: '#fde68a', twClass: 'bg-marker-yellow' },
  { id: 'green',  label: 'Verde',  hex: '#bbf7d0', twClass: 'bg-marker-green' },
  { id: 'blue',   label: 'Blu',    hex: '#bfdbfe', twClass: 'bg-marker-blue' },
  { id: 'red',    label: 'Rosso',  hex: '#fecaca', twClass: 'bg-marker-red' },
];

export const getHighlightCursor = (color: string): string => {
  let fill = '%23fde68a'; // marker yellow

  switch (color) {
    case 'green': fill = '%23bbf7d0'; break;
    case 'blue':  fill = '%23bfdbfe'; break;
    case 'red':   fill = '%23fecaca'; break;
  }

  return `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3" fill="${fill}" fill-opacity="0.9"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>') 0 24, auto`;
};

// Returns Tailwind classes; on light/sepia the text color is inherited (mix-blend
// keeps the original glyph color), on dark we lighten the background so the
// marker reads as a tinted highlight rather than a colored block.
export const getHighlightClasses = (color: string | undefined, themeName: string): string => {
  const isDark = themeName === 'dark';
  const c = color || 'yellow';

  if (isDark) {
    switch (c) {
      case 'green': return 'bg-marker-green/25 text-reader-dark-text';
      case 'blue':  return 'bg-marker-blue/25 text-reader-dark-text';
      case 'red':   return 'bg-marker-red/25 text-reader-dark-text';
      case 'yellow':
      default:      return 'bg-marker-yellow/25 text-reader-dark-text';
    }
  }

  // Light & sepia: marker tint + mix-blend-multiply (set in MarkdownText style).
  switch (c) {
    case 'green': return 'bg-marker-green';
    case 'blue':  return 'bg-marker-blue';
    case 'red':   return 'bg-marker-red';
    case 'yellow':
    default:      return 'bg-marker-yellow';
  }
};

// Whether the highlight should use mix-blend-multiply (light/sepia) or not (dark).
export const shouldBlendMultiply = (themeName: string): boolean => themeName !== 'dark';

export const getHighlightButtonStyles = (isActive: boolean, color: HighlightColorDef) => {
    const base = "w-6 h-6 rounded-full border shadow-elev-1 transition-all duration-150 hover:scale-110";
    const inactive = "border-black/10";

    let ringClass = '';
    if (isActive) {
        if (color.id === 'yellow') ringClass = 'ring-amber-300/70';
        else if (color.id === 'green') ringClass = 'ring-emerald-300/70';
        else if (color.id === 'blue') ringClass = 'ring-sky-300/70';
        else if (color.id === 'red') ringClass = 'ring-rose-300/70';
    }

    return `${base} ${isActive ? `border-white scale-110 ring-2 ${ringClass}` : inactive}`;
};
