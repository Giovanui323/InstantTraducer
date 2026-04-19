
export const READER_STYLES = {
  shadow: {
    base: "shadow-surface-xl",
    hover: "hover:shadow-surface-2xl",
    light: "shadow-surface",
    inner: "shadow-inner",
  },
  border: {
    default: "border border-border-muted",
    light: "border border-black/5",
    active: "border-accent/40",
  },
  rounded: {
    default: "rounded-xl",
    sm: "rounded-lg",
    full: "rounded-full",
  },
  transition: {
    base: "transition-all duration-200 ease-out-expo",
    slow: "transition-all duration-300 ease-out-expo",
  },

  container: {
    base: "relative group shrink-0 overflow-hidden",
    translated: "bg-[#f8f9fa] shadow-surface-xl border border-black/[0.04] rounded-xl",
    original: "bg-transparent shadow-none border-0 rounded-none overflow-visible",
  },

  thumbnail: {
    wrapper: "group/thumb relative shadow-elev-3 border border-reader-light-border rounded-lg overflow-hidden bg-reader-light-bg transition-all duration-200 ease-out-expo cursor-pointer hover:shadow-surface-xl hover:border-accent/40 hover:scale-[1.02] active:scale-[0.99] active:border-accent/50",
    button: "w-8 h-8 flex items-center justify-center rounded-full bg-white/95 text-reader-light-text-soft border border-reader-light-border transition-all duration-150 backdrop-blur-sm hover:bg-white hover:text-accent hover:border-accent/30 hover:shadow-elev-1",
    maximizeBtn: "text-accent drop-shadow-sm bg-white/95 p-1.5 rounded-lg shadow-elev-1 transition-all duration-150 hover:bg-white hover:shadow-elev-2",
  },

  buttons: {
    primary: "px-4 py-2 bg-accent text-white hover:bg-accent-hover rounded-xl text-[10px] font-bold uppercase transition-all duration-200 shadow-surface hover:shadow-surface-lg hover:shadow-glow-accent flex items-center gap-2 active:scale-95",
    secondary: "px-4 py-2 bg-white border border-border text-txt-secondary hover:text-accent hover:border-accent/20 rounded-xl text-[10px] font-bold uppercase transition-all duration-200 shadow-surface hover:shadow-surface-lg active:scale-95",
    danger: "px-4 py-2 bg-white border border-border text-txt-secondary hover:text-danger hover:border-danger/20 rounded-xl text-[10px] font-bold uppercase transition-all duration-200 shadow-surface hover:shadow-surface-lg active:scale-95",
    icon: "flex items-center justify-center w-12 h-12 rounded-full bg-accent text-white shadow-surface-xl border border-accent/30 hover:scale-105 active:scale-95 transition-all duration-200 shadow-glow-accent",
    manual: "group/manual-btn relative flex items-center justify-center w-20 h-20 rounded-full bg-accent/8 border-2 border-accent/20 text-accent hover:bg-accent hover:text-white hover:border-accent transition-all duration-300 shadow-surface-lg hover:shadow-glow-accent-lg pointer-events-auto",
  }
};

export const READER_THEMES = {
  // Light: warm paper white instead of bluish-grey, matches print feel.
  light: {
    bg: "bg-reader-light-bg",
    containerBg: "bg-reader-light-panel",
    text: "text-reader-light-text",
    selection: "selection:bg-amber-300/30 selection:text-reader-light-text",
    ring: "ring-1 ring-reader-light-border",
    gradient: "radial-gradient(1400px 700px at 15% 20%, rgba(0,0,0,0.012), transparent 55%), radial-gradient(1400px 700px at 85% 80%, rgba(0,0,0,0.012), transparent 55%)"
  },
  // Sepia: Kindle Paperwhite reference (#f4ecd8 / #5b4636), much less yellow than before.
  sepia: {
    bg: "bg-reader-sepia-bg",
    containerBg: "bg-reader-sepia-panel",
    text: "text-reader-sepia-text",
    selection: "selection:bg-amber-300/35 selection:text-reader-sepia-text",
    ring: "ring-1 ring-reader-sepia-border",
    gradient: "radial-gradient(1400px 700px at 15% 20%, rgba(91,70,54,0.025), transparent 55%), radial-gradient(1400px 700px at 85% 80%, rgba(91,70,54,0.025), transparent 55%)"
  },
  // Dark: true neutral dark (no blue cast), text color tuned for long reading.
  dark: {
    bg: "bg-reader-dark-bg",
    containerBg: "bg-reader-dark-panel",
    text: "text-reader-dark-text",
    selection: "selection:bg-amber-200/20 selection:text-reader-dark-text",
    ring: "ring-1 ring-reader-dark-border",
    gradient: "radial-gradient(1200px 600px at 20% 25%, rgba(255,255,255,0.012), transparent 55%), radial-gradient(1200px 600px at 80% 75%, rgba(255,255,255,0.012), transparent 55%)"
  }
};

export const getThemeClasses = (theme: 'light' | 'sepia' | 'dark' = 'light') => {
  const t = READER_THEMES[theme];
  return `${t.bg} ${t.text} ${t.selection} ${t.ring}`;
};

export const dynamicStyles = {
  thumbnail: (width: number, height: number) => ({
    width: `${width}px`,
    height: `${height}px`
  }),
  container: (width: number, height: number, isAutoHeight: boolean) => ({
    width: `${width}px`,
    minHeight: `${height}px`,
    height: isAutoHeight ? 'auto' : `${height}px`,
    maxWidth: 'none'
  }),
  markdownText: (fontSize: number, gradient: string) => ({
    fontSize: `${fontSize}px`,
    backgroundImage: gradient
  })
};
