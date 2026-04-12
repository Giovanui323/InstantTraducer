
import { ReaderTheme } from './readerStyling';

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'red';

export interface HighlightColorDef {
  id: HighlightColor;
  label: string;
  hex: string;
  twClass: string; // Tailwind class for the circle button bg
}

export const HIGHLIGHT_COLORS: HighlightColorDef[] = [
  { id: 'yellow', label: 'Giallo', hex: '#FFFF00', twClass: 'bg-[#FFFF00]' },
  { id: 'green', label: 'Verde', hex: '#00FF00', twClass: 'bg-[#00FF00]' },
  { id: 'blue', label: 'Blu', hex: '#3B82F6', twClass: 'bg-blue-500' },
  { id: 'red', label: 'Rosso', hex: '#EF4444', twClass: 'bg-red-500' },
];

export const getHighlightCursor = (color: string): string => {
  let fill = '%23FFFF00'; // Default yellow
  
  switch (color) {
    case 'green': fill = '%2300FF00'; break;
    case 'blue': fill = '%233B82F6'; break;
    case 'red': fill = '%23EF4444'; break;
  }

  return `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3" fill="${fill}" fill-opacity="0.8"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>') 0 24, auto`;
};

export const getHighlightClasses = (color: string | undefined, themeName: string): string => {
  const isDark = themeName === 'dark';
  const isSepia = themeName === 'sepia';
  const c = color || 'yellow';

  switch (c) {
    case 'green':
      if (isDark) return 'bg-[#00FF00]/40 text-white';
      if (isSepia) return 'bg-[#00FF00]/40 text-amber-950';
      return 'bg-[#00FF00]/50 text-black';
    
    case 'blue':
      if (isDark) return 'bg-blue-500/50 text-white';
      if (isSepia) return 'bg-blue-500/40 text-amber-950';
      return 'bg-blue-500/40 text-black';

    case 'red':
      if (isDark) return 'bg-red-500/50 text-white';
      if (isSepia) return 'bg-red-500/40 text-amber-950';
      return 'bg-red-500/40 text-black';

    case 'yellow':
    default:
      if (isDark) return 'bg-[#FFFF00]/50 text-white';
      if (isSepia) return 'bg-[#FFFF00]/60 text-amber-950';
      return 'bg-[#FFFF00]/70 text-black';
  }
};

export const getHighlightButtonStyles = (isActive: boolean, color: HighlightColorDef) => {
    const base = "w-6 h-6 rounded-full border-2 shadow-sm transition-transform hover:scale-110";
    const active = `border-white scale-110 ring-2 ring-${color.id === 'yellow' || color.id === 'green' ? color.id + '-400' : color.id + '-500'}/50`;
    const inactive = "border-transparent";
    
    // Custom handling for yellow/green rings to match original behavior if needed, 
    // but Tailwind dynamic classes might be tricky.
    // Let's use specific ring classes based on color id.
    let ringClass = '';
    if (isActive) {
        if (color.id === 'yellow') ringClass = 'ring-yellow-400/50';
        else if (color.id === 'green') ringClass = 'ring-green-400/50';
        else if (color.id === 'blue') ringClass = 'ring-blue-400/50';
        else if (color.id === 'red') ringClass = 'ring-red-400/50';
    }

    return `${base} ${isActive ? `border-white scale-110 ring-2 ${ringClass}` : inactive}`;
};
