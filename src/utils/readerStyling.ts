/**
 * Centralized styling system for reader components
 * Provides consistent, theme-aware styling across all reader elements
 */

import { buildSafeInlineStyle } from './safeHtmlUtils';

export interface ReaderTheme {
  name: string;
  text: {
    primary: string;
    secondary: string;
    muted: string;
  };
  background: {
    primary: string;
    secondary: string;
    highlight: string;
  };
  border: {
    primary: string;
    secondary: string;
  };
  highlight: {
    yellow: string;
    green: string;
    blue: string;
    red: string;
  };
}

export const READER_THEMES: Record<string, ReaderTheme> = {
  light: {
    name: 'Light',
    text: {
      primary: '#1a1a1a',
      secondary: '#4a4a4a',
      muted: '#6b7280'
    },
    background: {
      primary: '#ffffff',
      secondary: '#f9fafb',
      highlight: 'rgba(250, 204, 21, 0.2)'
    },
    border: {
      primary: '#e5e7eb',
      secondary: '#d1d5db'
    },
    highlight: {
      yellow: 'rgba(255, 255, 0, 0.5)',
      green: 'rgba(0, 255, 0, 0.4)',
      blue: 'rgba(59, 130, 246, 0.4)',
      red: 'rgba(239, 68, 68, 0.4)'
    }
  },
  sepia: {
    name: 'Sepia',
    text: {
      primary: '#3c2f1d',
      secondary: '#5a4a32',
      muted: '#8b7355'
    },
    background: {
      primary: '#f4f1e8',
      secondary: '#ede7d3',
      highlight: 'rgba(218, 165, 32, 0.2)'
    },
    border: {
      primary: '#d4c4a8',
      secondary: '#c4b5a0'
    },
    highlight: {
      yellow: 'rgba(255, 255, 0, 0.4)',
      green: 'rgba(0, 255, 0, 0.35)',
      blue: 'rgba(59, 130, 246, 0.35)',
      red: 'rgba(239, 68, 68, 0.35)'
    }
  },
  dark: {
    name: 'Dark',
    text: {
      primary: '#e5e7eb',
      secondary: '#d1d5db',
      muted: '#9ca3af'
    },
    background: {
      primary: '#111827',
      secondary: '#1f2937',
      highlight: 'rgba(255, 255, 0, 0.15)'
    },
    border: {
      primary: '#374151',
      secondary: '#4b5563'
    },
    highlight: {
      yellow: 'rgba(255, 255, 0, 0.5)',
      green: 'rgba(0, 255, 0, 0.4)',
      blue: 'rgba(59, 130, 246, 0.4)',
      red: 'rgba(239, 68, 68, 0.4)'
    }
  }
};

export interface ReaderStyleConfig {
  fontFamily: string;
  fontSize: string;
  lineHeight: number;
  letterSpacing: string;
  textAlign: 'justify' | 'left' | 'center' | 'right';
}

export const DEFAULT_STYLE_CONFIG: ReaderStyleConfig = {
  fontFamily: 'ui-serif, Georgia, "Times New Roman", Times, serif',
  fontSize: '15px',
  lineHeight: 1.6,
  letterSpacing: 'normal',
  textAlign: 'justify'
};

/**
 * Predefined style configurations for common reader elements
 */
export const READER_STYLES = {
  /**
   * Base container styles
   */
  container: (theme: ReaderTheme, config: ReaderStyleConfig = DEFAULT_STYLE_CONFIG) => 
    buildSafeInlineStyle({
      color: theme.text.primary,
      fontFamily: config.fontFamily,
      fontSize: config.fontSize,
      lineHeight: String(config.lineHeight),
      letterSpacing: config.letterSpacing,
      textAlign: config.textAlign
    }),

  /**
   * Paragraph styles
   */
  paragraph: (theme: ReaderTheme, noIndent: boolean = false) =>
    buildSafeInlineStyle({
      margin: '0',
      color: theme.text.primary,
      textIndent: noIndent ? '0' : '1.25em'
    }),

  /**
   * Heading styles
   */
  heading: (theme: ReaderTheme, level: number) => {
    const baseStyles = {
      margin: '0',
      color: theme.text.primary,
      fontWeight: '700'
    };

    switch (level) {
      case 1:
        return buildSafeInlineStyle({
          ...baseStyles,
          textTransform: 'uppercase',
          letterSpacing: '0.02em',
          paddingBottom: '8px',
          borderBottom: `1px solid ${theme.border.primary}`,
          marginTop: '24px',
          marginBottom: '16px'
        });
      case 2:
        return buildSafeInlineStyle({
          ...baseStyles,
          textTransform: 'uppercase',
          letterSpacing: '0.02em',
          marginTop: '20px',
          marginBottom: '12px'
        });
      default:
        return buildSafeInlineStyle({
          ...baseStyles,
          marginTop: '16px',
          marginBottom: '8px'
        });
    }
  },

  /**
   * Figure/Visual element styles
   */
  figure: (theme: ReaderTheme) =>
    buildSafeInlineStyle({
      margin: '24px 0',
      padding: '16px',
      background: 'rgba(255,255,255,0.06)',
      borderLeft: '4px solid #60a5fa',
      borderTopRightRadius: '12px',
      borderBottomRightRadius: '12px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '16px'
    }),

  figureIcon: (theme: ReaderTheme) =>
    buildSafeInlineStyle({
      marginTop: '4px',
      padding: '8px',
      background: 'rgba(96,165,250,0.18)',
      color: '#60a5fa',
      borderRadius: '10px',
      flex: '0 0 auto'
    }),

  figureContent: (theme: ReaderTheme) =>
    buildSafeInlineStyle({
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      minWidth: '0'
    }),

  figureLabel: (theme: ReaderTheme) =>
    buildSafeInlineStyle({
      fontSize: '10px',
      fontWeight: '800',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: '#60a5fa'
    }),

  figureDescription: (theme: ReaderTheme) =>
    buildSafeInlineStyle({
      fontSize: '14px',
      fontStyle: 'italic',
      color: theme.text.secondary
    }),

  /**
   * Footnote styles
   */
  footnotesContainer: (theme: ReaderTheme) =>
    buildSafeInlineStyle({
      marginTop: '22px'
    }),

  footnotesDivider: (theme: ReaderTheme) =>
    buildSafeInlineStyle({
      width: '180px',
      borderTop: `1px solid ${theme.border.secondary}`,
      marginBottom: '10px'
    }),

  footnoteItem: (theme: ReaderTheme) =>
    buildSafeInlineStyle({
      display: 'flex',
      gap: '8px',
      fontSize: '0.9em',
      lineHeight: '1.5',
      color: theme.text.secondary,
      marginBottom: '6px'
    }),

  footnoteNumber: (theme: ReaderTheme) =>
    buildSafeInlineStyle({
      minWidth: '16px',
      textAlign: 'right'
    }),

  footnoteContent: (theme: ReaderTheme) =>
    buildSafeInlineStyle({
      flex: '1 1 auto',
      paddingLeft: '8px',
      textIndent: '-16px',
      display: 'block',
      textAlign: 'justify'
    }),

  /**
   * User note styles
   */
  userNotesContainer: (theme: ReaderTheme) =>
    buildSafeInlineStyle({
      marginTop: '14px'
    }),

  userNoteItem: (theme: ReaderTheme) =>
    buildSafeInlineStyle({
      display: 'flex',
      gap: '8px',
      fontSize: '0.9em',
      lineHeight: '1.5',
      color: theme.text.secondary,
      marginBottom: '6px'
    }),

  userNoteNumber: (theme: ReaderTheme) =>
    buildSafeInlineStyle({
      minWidth: '16px',
      textAlign: 'right'
    }),

  userNoteContent: (theme: ReaderTheme) =>
    buildSafeInlineStyle({
      flex: '1 1 auto',
      paddingLeft: '8px',
      display: 'block'
    }),

  /**
   * Highlight styles
   */
  highlight: (theme: ReaderTheme, color: 'yellow' | 'green' | 'blue' | 'red' = 'yellow') =>
    buildSafeInlineStyle({
      background: theme.highlight[color],
      borderRadius: '2px',
      boxDecorationBreak: 'clone',
      WebkitBoxDecorationBreak: 'clone'
    }),

  /**
   * Superscript styles (for footnote references)
   */
  superscript: (theme: ReaderTheme) =>
    buildSafeInlineStyle({
      fontSize: '0.8em',
      verticalAlign: 'super',
      color: theme.text.muted,
      cursor: 'help'
    }),

  /**
   * Grid layout for two-column view
   */
  twoColumnGrid: (theme: ReaderTheme) =>
    buildSafeInlineStyle({
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '24px'
    })
};

/**
 * Helper function to get theme by name
 */
export function getReaderTheme(themeName: string): ReaderTheme {
  return READER_THEMES[themeName] || READER_THEMES.light;
}

/**
 * Helper function to validate and sanitize theme name
 */
export function sanitizeThemeName(themeName: string): string {
  const validThemes = Object.keys(READER_THEMES);
  return validThemes.includes(themeName) ? themeName : 'light';
}

/**
 * CSS class mapping for different themes
 */
export const THEME_CLASSES = {
  light: {
    text: 'text-gray-900',
    secondary: 'text-gray-700',
    muted: 'text-gray-500',
    background: 'bg-white',
    border: 'border-gray-200'
  },
  sepia: {
    text: 'text-amber-900',
    secondary: 'text-amber-800',
    muted: 'text-amber-600',
    background: 'bg-amber-50',
    border: 'border-amber-200'
  },
  dark: {
    text: 'text-gray-100',
    secondary: 'text-gray-300',
    muted: 'text-gray-400',
    background: 'bg-gray-900',
    border: 'border-gray-700'
  }
};

/**
 * Get CSS classes for a theme
 */
export function getThemeClasses(themeName: string) {
  const sanitized = sanitizeThemeName(themeName);
  return THEME_CLASSES[sanitized as keyof typeof THEME_CLASSES] || THEME_CLASSES.light;
}