
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
    wrapper: "group/thumb relative shadow-surface-lg border border-border-muted rounded-xl overflow-hidden bg-white transition-all duration-200 ease-out-expo cursor-pointer hover:shadow-surface-2xl hover:border-accent/30 hover:scale-[1.02] active:scale-[0.99] active:border-accent/50",
    button: "w-8 h-8 flex items-center justify-center rounded-full bg-white/90 text-txt-muted border border-border transition-all duration-150 backdrop-blur-sm hover:bg-white hover:text-accent hover:border-accent/20",
    maximizeBtn: "text-accent drop-shadow-sm bg-white/90 p-1.5 rounded-lg shadow-surface transition-all duration-150 hover:bg-white",
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
  light: {
    bg: "bg-[#faf9f6]",
    containerBg: "bg-stone-100",
    text: "text-stone-900",
    selection: "selection:bg-accent/20 selection:text-accent",
    ring: "ring-1 ring-stone-200/60",
    gradient: "radial-gradient(1200px 600px at 15% 20%, rgba(0,0,0,0.015), transparent 55%), radial-gradient(1200px 600px at 85% 80%, rgba(0,0,0,0.015), transparent 55%)"
  },
  sepia: {
    bg: "bg-[#f5eedd]",
    containerBg: "bg-[#e8e2d2]",
    text: "text-stone-900",
    selection: "selection:bg-amber-200/40 selection:text-amber-950",
    ring: "ring-1 ring-stone-300/50",
    gradient: "radial-gradient(1200px 600px at 15% 20%, rgba(139,90,43,0.03), transparent 55%), radial-gradient(1200px 600px at 85% 80%, rgba(139,90,43,0.03), transparent 55%)"
  },
  dark: {
    bg: "bg-[#1a1d23]",
    containerBg: "bg-[#0d1117]",
    text: "text-[#c9d1d9]",
    selection: "selection:bg-accent/25 selection:text-white",
    ring: "ring-1 ring-white/[0.06]",
    gradient: "radial-gradient(1000px 500px at 20% 25%, rgba(255,255,255,0.015), transparent 55%), radial-gradient(1000px 500px at 80% 75%, rgba(255,255,255,0.015), transparent 55%)"
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
