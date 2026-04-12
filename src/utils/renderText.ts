
import { UserHighlight, UserNote } from '../types';
import { PAGE_SPLIT, splitColumns, normalizeTextForRendering } from './textUtils';
import { buildSelectableText, getSplitRegex } from './highlightSelectors';
import { 
  escapeHtml, 
  createSafeElement, 
  createSafeHighlightSpan, 
  validateUserContent,
  buildSafeInlineStyle
} from './safeHtmlUtils';
import { 
  StringBuilder, 
  memoizeStringOperation, 
  globalStringCache, 
  globalRegexCache,
  StringUtils
} from './performanceUtils';
import { READER_STYLES, getReaderTheme } from './readerStyling';
import { log } from '../services/logger';

const normalizeHighlightColor = (value?: string) => {
  const fallback = 'rgba(250, 204, 21, 0.4)';
  const s = String(value ?? '').trim();
  if (!s) return fallback;
  // Hex
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
  // RGB/RGBA/HSL/HSLA - loose check for valid CSS function syntax
  if (/^(rgba?|hsla?)\([0-9\s,.%deg\/-]+\)$/i.test(s)) return s;
  // Named colors (basic check)
  if (/^[a-zA-Z]+$/.test(s)) return s;
  
  return fallback;
};

/**
 * Applica gli highlight a un pezzo di testo piano, restituendo HTML escapato con i tag <span> per i colori.
 */
export const applyHighlightsToPlainText = (plainText: string, partStart: number, highlights?: UserHighlight[]) => {
  if (!highlights || highlights.length === 0) return escapeHtml(plainText);
  
  const originalLength = plainText.length;
  const partEnd = partStart + originalLength;
  const relevant = highlights.filter(h => h.start < partEnd && h.end > partStart);
  
  if (relevant.length === 0) return escapeHtml(plainText);
  
  const builder = new StringBuilder();
  let cursor = 0;
  const sorted = [...relevant].sort((a, b) => a.start - b.start);

  for (const h of sorted) {
    const hStartInPart = Math.max(0, h.start - partStart);
    const hEndInPart = Math.min(originalLength, h.end - partStart);
    
    if (hStartInPart > cursor) {
      builder.append(escapeHtml(plainText.slice(cursor, hStartInPart)));
    }
    
    const chunk = plainText.slice(hStartInPart, hEndInPart);
    builder.append(createSafeHighlightSpan(chunk, h.color || 'rgba(250, 204, 21, 0.4)'));
    cursor = hEndInPart;
  }
  
  if (cursor < originalLength) {
    builder.append(escapeHtml(plainText.slice(cursor)));
  }
  
  return builder.toString();
};

// Memoized version of renderInlineHtml for better performance
const memoizedRenderInlineHtml = memoizeStringOperation((
  text: string,
  footnotesJson: string,
  highlightsJson: string,
  blockOffset: number,
  themeName: string
): string => {
  const footnotes: string[] = JSON.parse(footnotesJson);
  const highlights: UserHighlight[] = JSON.parse(highlightsJson);
  const theme = getReaderTheme(themeName);
  
  // Use centralized regex logic to ensure consistency with MarkdownText and highlightSelectors
  const parts = StringUtils.split(text, getSplitRegex(), globalStringCache);
  
  const builder = new StringBuilder();
  let currentOffset = blockOffset;

  for (const part of parts) {
    try {
      if (!part) continue;
      const partLength = part.length;
      const partStart = currentOffset;

      let rendered: string;

      if (part.startsWith("[FIGURA:") && part.endsWith("]")) {
        const description = part.slice(8, -1).trim();
        if (!validateUserContent(description)) {
          rendered = escapeHtml(part);
        } else {
          const figureStyles = READER_STYLES.figure(theme);
          const iconStyles = READER_STYLES.figureIcon(theme);
          const contentStyles = READER_STYLES.figureContent(theme);
          const labelStyles = READER_STYLES.figureLabel(theme);
          const descStyles = READER_STYLES.figureDescription(theme);
          
          const svgContent = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="M21 15l-5-5L5 21"></path></svg>`;
          
          rendered = `<div style="${figureStyles}"><div style="${iconStyles}">${svgContent}</div><div style="${contentStyles}"><div style="${labelStyles}">Elemento Visivo Originale</div><div style="${descStyles}">${escapeHtml(description)}</div></div></div>`;
        }
      } else if (part.startsWith("[[") && part.endsWith("]]")) {
        const content = part.slice(2, -2);
        const sepIdx = content.indexOf("|");
        const word = sepIdx >= 0 ? content.slice(0, sepIdx) : content;
        const comment = sepIdx >= 0 ? content.slice(sepIdx + 1) : "";
        if (comment.trim().length > 0) {
          const number = footnotes.push(comment.trim());
          const supStyles = READER_STYLES.superscript(theme);
          rendered = `${applyHighlightsToPlainText(word, partStart + 2, highlights)}<sup style="${supStyles}" title="${escapeHtml(comment.trim())}">${escapeHtml(String(number))}</sup>`;
        } else {
          rendered = applyHighlightsToPlainText(word, partStart + 2, highlights);
        }
      } else if (part.startsWith("**") && part.endsWith("**")) {
        const inner = part.slice(2, -2);
        rendered = createSafeElement('strong', {}, applyHighlightsToPlainText(inner, partStart + 2, highlights));
      } else if (part.startsWith("*") && part.endsWith("*")) {
        const inner = part.slice(1, -1);
        rendered = createSafeElement('em', {}, applyHighlightsToPlainText(inner, partStart + 1, highlights));
      } else {
        rendered = applyHighlightsToPlainText(part, partStart, highlights);
      }

      currentOffset += partLength;
      builder.append(rendered);
    } catch (error) {
      log.error('Error processing text part in memoizedRenderInlineHtml', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        part: part ? part.slice(0, 100) : 'empty' // Limit part length for logging
      });
      builder.append(escapeHtml(part || ''));
    }
  }
  
  return builder.toString();
});

export const renderInlineHtml = (text: string, footnotes: string[], highlights: UserHighlight[] | undefined, blockOffset: number = 0, themeName: string = 'dark') => {
  try {
    // Validate input
    if (typeof text !== 'string') {
      log.warning('renderInlineHtml received non-string input', { 
        inputType: typeof text,
        inputValue: String(text ?? '').slice(0, 100) // Limit for logging
      });
      return escapeHtml(String(text ?? ''));
    }
    
    if (!Array.isArray(footnotes)) {
      log.warning('renderInlineHtml received non-array footnotes', { 
        footnotesType: typeof footnotes,
        footnotesValue: String(footnotes ?? '').slice(0, 100)
      });
      footnotes = [];
    }
    
    return memoizedRenderInlineHtml(
      text,
      JSON.stringify(footnotes),
      JSON.stringify(highlights || []),
      blockOffset,
      themeName
    );
  } catch (error) {
    log.error('Error in renderInlineHtml', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      inputText: text ? text.slice(0, 100) : 'empty'
    });
    return escapeHtml(String(text ?? ''));
  }
};

const HEADING_LEVEL_1_REGEX = /^\d+\.\s+[A-ZÀ-ÖØ-Ý0-9][A-ZÀ-ÖØ-Ý0-9\s\-–—.,:;()]+$/;
const HEADING_LEVEL_2_REGEX = /^[A-Z]\.\s+[A-ZÀ-ÖØ-Ý0-9][A-ZÀ-ÖØ-Ý0-9\s\-–—.,:;()]+$/;
const HEADING_LEVEL_3_REGEX = /^[IVXLCDM]+\.\s+/;
const HASH_HEADING_REGEX = /^#{1,3}\s+/;
const HASH_ONLY_REGEX = /^#+/;

export const detectHeadingLevel = (block: string): number => {
  const line = String(block ?? "").trim();
  if (!line) return 0;
  
  if (HEADING_LEVEL_1_REGEX.test(line)) return 1;
  if (HEADING_LEVEL_2_REGEX.test(line)) return 2;
  if (HEADING_LEVEL_3_REGEX.test(line)) return 3;
  
  if (HASH_HEADING_REGEX.test(line)) {
    const hashes = (line.match(HASH_ONLY_REGEX) || [""])[0].length;
    return Math.min(3, Math.max(1, hashes));
  }
  return 0;
};

export const renderReaderBlocksHtml = (text: string, highlights?: UserHighlight[], sharedFootnotes?: string[], baseOffset: number = 0, themeName: string = 'dark') => {
  try {
    // Validate input
    if (typeof text !== 'string') {
      console.warn('renderReaderBlocksHtml received non-string input:', text);
      text = String(text ?? '');
    }
    
    if (sharedFootnotes && !Array.isArray(sharedFootnotes)) {
      console.warn('renderReaderBlocksHtml received non-array sharedFootnotes:', sharedFootnotes);
      sharedFootnotes = undefined;
    }
    
    const footnotes: string[] = sharedFootnotes ?? [];
    // Use unified normalization logic (unhyphenation) to match MarkdownText behavior
    const normalized = normalizeTextForRendering(String(text ?? ""), false); // preserveLayout=false by default for reader
    const theme = getReaderTheme(themeName);
    
    // Dividiamo in blocchi mantenendo traccia dell'offset originale
    // Usiamo una regex che cattura anche i delimitatori per non perdere la posizione
    const blockParts = normalized.split(/(\n{2,})/g);

    let currentOffset = baseOffset;
    let firstParagraph = true;
    let previousWasHeading = false;

    const html = blockParts
      .map((raw) => {
        try {
          const partLength = buildSelectableText(raw, false).length; // Use selectable length to match highlight offsets
          const partStart = currentOffset;
          currentOffset += partLength;

      if (raw.match(/^\n{2,}$/)) return ""; // Saltiamo i delimitatori di blocco nel rendering ma non nell'offset

      const block = raw.trim();
      if (!block) return "";

      const headingLevel = detectHeadingLevel(block);
      if (headingLevel > 0) {
        const clean = headingLevel <= 3 && block.startsWith("#") ? block.replace(/^#{1,3}\s+/, "") : block;
        const headingOffset = partStart + (raw.indexOf(clean));
        
        previousWasHeading = true;
        firstParagraph = false;
        
        const headingStyles = READER_STYLES.heading(theme, headingLevel);
        
        return createSafeElement(`h${headingLevel}`, { style: headingStyles }, renderInlineHtml(clean, footnotes, highlights, headingOffset, themeName));
      }

      const noIndent = firstParagraph || previousWasHeading;
      const paragraphOffset = partStart + (raw.indexOf(block));
      firstParagraph = false;
      previousWasHeading = false;
      
      const pStyles = READER_STYLES.paragraph(theme, noIndent);
      
      return createSafeElement('p', { style: pStyles }, renderInlineHtml(block, footnotes, highlights, paragraphOffset, themeName));
        } catch (error) {
          log.error('Error processing block in renderReaderBlocksHtml', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            rawText: raw ? raw.slice(0, 100) : 'empty'
          });
          const safePStyles = buildSafeInlineStyle({
            'margin': '0',
            'color': theme.text.primary
          });
          return createSafeElement('p', { style: safePStyles }, escapeHtml(String(raw ?? '')));
        }
      })
      .join("");

    const footnotesHtml =
      footnotes.length > 0
        ? (() => {
            const containerStyles = READER_STYLES.footnotesContainer(theme);
            const dividerStyles = READER_STYLES.footnotesDivider(theme);
            const noteStyles = READER_STYLES.footnoteItem(theme);
            const numberStyles = READER_STYLES.footnoteNumber(theme);
            const contentStyles = READER_STYLES.footnoteContent(theme);
            
            const notesHtml = footnotes
              .map((note, i) => {
                const number = i + 1;
                return `<div style="${noteStyles}"><span style="${numberStyles}">${escapeHtml(String(number))}</span><span style="${contentStyles}">${escapeHtml(note)}</span></div>`;
              })
              .join("");
            
            return `<div style="${containerStyles}"><div style="${dividerStyles}"></div>${notesHtml}</div>`;
          })()
        : "";

    return { html, footnotesHtml };
  } catch (error) {
    log.error('Error in renderReaderBlocksHtml', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      inputText: text ? text.slice(0, 100) : 'empty'
    });
    const theme = getReaderTheme(themeName);
    return { 
      html: createSafeElement('p', { style: buildSafeInlineStyle({ 'color': theme.text.primary }) }, escapeHtml(String(text ?? ''))), 
      footnotesHtml: '' 
    };
  }
};

/**
 * Renderizza le note utente in HTML sicuro
 */
const renderUserNotesHtml = (userNotes: UserNote[] | undefined, themeName: string) => {
  if (!userNotes || userNotes.length === 0) return '';
  
  try {
    const theme = getReaderTheme(themeName);
    const containerStyles = READER_STYLES.userNotesContainer(theme);
    const noteStyles = READER_STYLES.userNoteItem(theme);
    const numberStyles = READER_STYLES.userNoteNumber(theme);
    const contentStyles = READER_STYLES.userNoteContent(theme);
    
    const notesHtml = userNotes.map((n, idx) => {
      if (!validateUserContent(n.text) || !validateUserContent(n.content)) {
        return '';
      }
      return `<div style="${noteStyles}"><span style="${numberStyles}">${escapeHtml(String(idx + 1))}</span><span style="${contentStyles}"><em>${escapeHtml(n.text)}</em> — ${escapeHtml(n.content)}</span></div>`;
    }).join('');
    
    return `<div style="${containerStyles}">${notesHtml}</div>`;
  } catch (error) {
    log.error('Error in renderUserNotesHtml', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return '';
  }
};

/**
 * Genera l'HTML finale per il reader, supportando temi e colonne
 */
export const buildReaderHtml = (text: string, highlights?: UserHighlight[], userNotes?: UserNote[], themeName: string = 'dark') => {
  try {
    // Validate input
    if (typeof text !== 'string') {
      log.warning('buildReaderHtml received non-string input', { 
        inputType: typeof text,
        inputValue: String(text ?? '').slice(0, 100) // Limit for logging
      });
      text = String(text ?? '');
    }
    
    const theme = getReaderTheme(themeName);
    const baseStyle = READER_STYLES.container(theme);
    const hasSplit = String(text || '').includes(PAGE_SPLIT);
  
  if (!hasSplit) {
    const { html, footnotesHtml } = renderReaderBlocksHtml(text, highlights, undefined, 0, themeName);
    const userNotesHtml = renderUserNotesHtml(userNotes, themeName);
    const body = `${html}${footnotesHtml}${userNotesHtml}`;
    return `<div style="${baseStyle}">${body}</div>`;
  }
  
  const [leftRaw, rightRaw] = splitColumns(String(text || ''));
  const sharedFootnotes: string[] = [];
  
  // Safe offset calculation
  let rightOffset = 0;
  try {
    const leftSelectable = buildSelectableText(leftRaw || '', false);
    rightOffset = leftSelectable.length + 1; // +1 per lo split character implicito
  } catch (e) {
    log.error('Error calculating right column offset', {
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined
    });
    // Fallback: stima basata sulla lunghezza grezza
    rightOffset = (leftRaw || '').length; 
  }
  
  // Usiamo lo stesso array sharedFootnotes per entrambe le colonne
  const left = renderReaderBlocksHtml(leftRaw || '', highlights, sharedFootnotes, 0, themeName);
  const right = renderReaderBlocksHtml(rightRaw || '', highlights, sharedFootnotes, rightOffset, themeName);
  
  // Generiamo l'HTML delle note una sola volta usando l'array condiviso popolato da entrambe le colonne
  const unifiedFootnotesHtml = sharedFootnotes.length > 0
      ? (() => {
          const containerStyles = READER_STYLES.footnotesContainer(theme);
          const dividerStyles = READER_STYLES.footnotesDivider(theme);
          const noteStyles = READER_STYLES.footnoteItem(theme);
          const numberStyles = READER_STYLES.footnoteNumber(theme);
          const contentStyles = READER_STYLES.footnoteContent(theme);
          
          const notesHtml = sharedFootnotes
            .map((note, i) => {
              const number = i + 1;
              return `<div style="${noteStyles}"><span style="${numberStyles}">${escapeHtml(String(number))}</span><span style="${contentStyles}">${escapeHtml(note)}</span></div>`;
            })
            .join("");
          
          return `<div style="${containerStyles}"><div style="${dividerStyles}"></div>${notesHtml}</div>`;
        })()
      : "";

  const userNotesHtml = renderUserNotesHtml(userNotes, themeName);
  const gridStyles = READER_STYLES.twoColumnGrid(theme);
  
  const body = `
      <div style="${gridStyles}">
        <div>${left.html}</div>
        <div>${right.html}</div>
      </div>
      ${unifiedFootnotesHtml}
      ${userNotesHtml}
    `;
    return `<div style="${baseStyle}">${body}</div>`;
  } catch (error) {
    log.error('Error in buildReaderHtml', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      inputText: text ? text.slice(0, 100) : 'empty'
    });
    const theme = getReaderTheme(themeName);
    const safeStyle = buildSafeInlineStyle({ 
      'color': theme.text.primary, 
      'font-family': 'ui-serif, Georgia, Times New Roman, Times, serif',
      'font-size': '15px',
      'line-height': '1.6'
    });
    return createSafeElement('div', { style: safeStyle }, escapeHtml(String(text ?? '')));
  }
};

/**
 * Clears global caches used by the rendering engine.
 * Should be called when unmounting the reader or switching books.
 */
export const clearRenderCaches = () => {
  globalStringCache.clear();
  globalRegexCache.clear();
};
