import React, { useRef, useEffect } from 'react';
import { Image as ImageIcon, MessageSquare } from 'lucide-react';
import { UserHighlight, UserNote } from '../types';
import { computeOffsets, computeOffsetsWithContext, normalizeHighlights } from '../utils/textSelection';
import { buildSelectableText, getInlineSplitRegex, getSplitRegex, resolveHighlightsByQuote } from '../utils/highlightSelectors';
import { normalizeTextForRendering } from '../utils/textUtils';
import { sanitizeHTML, validateSelectionRange } from '../utils/securityUtils';
import { debounce } from '../utils/performanceUtils';
import { ErrorBoundary } from './ErrorBoundary';
import { splitByFootnoteSeparator, parseFootnotes } from '../utils/footnoteUtils';
import { calculateVisibleLength } from '../utils/readerTextAlignment';
import {
  textSelectionToPdfCoordinates,
  getTextContainerMetrics,
  PdfRect
} from '../utils/pdfCoordinates';
import {
  applyAntiReflowStrategy,
  HIGHLIGHT_STYLES
} from '../utils/antiReflowUtils';
import { getHighlightClasses, HighlightColor, shouldBlendMultiply } from '../utils/highlightStyles';

interface MarkdownTextProps {
  text: string;
  align?: 'justify' | 'left';
  preserveLayout?: boolean;
  theme?: 'light' | 'sepia' | 'dark';
  searchTerm?: string;
  activeResultId?: string | null;
  pageNumber?: number;
  baseOffset?: number;
  highlights?: UserHighlight[];
  userNotes?: UserNote[];
  onAddHighlight?: (start: number, end: number, text: string, color?: string, quote?: { exact: string; prefix: string; suffix: string }, pdfRect?: PdfRect) => void;
  onRemoveHighlight?: (id: string) => void;
  onAddNote?: (start: number, end: number, text: string, content: string) => void;
  onUpdateNote?: (id: string, content: string) => void;
  onRemoveNote?: (id: string) => void;
  isHighlightToolActive?: boolean;
  highlightColor?: HighlightColor;
  isNoteToolActive?: boolean;
  isEraserToolActive?: boolean;
  onNoteClick?: (id: string) => void;
  hideFootnotes?: boolean;
  externalNotes?: Array<{ n: number | string; word: string; comment: string }>;
  onNotesUpdate?: (notes: Array<{ n: number | string; word: string; comment: string }>) => void;
  noteOffset?: number;
  pageDimensions?: { width: number; height: number };
}

interface NoteListProps {
  notes: Array<{ n: number | string; word?: string; text: string; id?: string }>;
  theme: 'light' | 'sepia' | 'dark';
  renderTextWithHighlights: (plain: string, startOffset: number) => React.ReactNode;
  startOffset: number;
}

const NoteList: React.FC<NoteListProps> = ({ notes, theme, renderTextWithHighlights, startOffset }) => {
  let currentOffset = startOffset;
  const isDark = theme === 'dark';
  const isSepia = theme === 'sepia';

  return (
    <div className="mt-auto pt-6 flex flex-col items-start w-full select-text">
      <div className="block w-full mb-2" data-ignore-offset="true">
        <div className={`block h-px w-full ${isDark ? 'bg-gray-600' : (isSepia ? 'bg-amber-200' : 'bg-stone-400')}`} />
      </div>
      <div className={`w-full leading-tight ${isDark ? 'text-reader-dark-text-soft' : (isSepia ? 'text-reader-sepia-text-soft' : 'text-reader-light-text-soft')}`} style={{ fontSize: '0.88em' }}>
        {notes.map((note) => {
          const noteNumStr = String(note.n);
          const wordStr = note.word || '';

          currentOffset += noteNumStr.length; // Number
          currentOffset += 1; // Space

          let wordNode: React.ReactNode = null;
          if (wordStr) {
            wordNode = (
              <>
                <span className={`italic ${isDark ? 'text-reader-dark-text' : (isSepia ? 'text-reader-sepia-text' : 'text-reader-light-text')}`}>{wordStr}</span>
                <span className={isDark ? 'text-reader-dark-text-soft' : (isSepia ? 'text-reader-sepia-text-soft' : 'text-reader-light-text-soft')}> </span>
              </>
            );
            currentOffset += wordStr.length;
            currentOffset += 1; // Space
          }

          const textElement = renderTextWithHighlights(note.text, currentOffset);
          currentOffset += note.text.length;

          const numClass = `font-semibold ${isDark ? 'text-reader-dark-text-soft' : (isSepia ? 'text-reader-sepia-text-soft' : 'text-reader-light-text-soft')}`;
          const bodyClass = isDark ? 'text-reader-dark-text-soft' : (isSepia ? 'text-reader-sepia-text-soft' : 'text-reader-light-text-soft');

          return (
            <span key={note.id || note.n} className="block mb-1.5">
              <span className={numClass}>{note.n}</span>
              <span className={bodyClass}> </span>
              {wordNode}
              <span className={bodyClass}>{textElement}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
};

export const MarkdownText: React.FC<MarkdownTextProps> = ({
  text,
  align = 'justify',
  preserveLayout = false,
  theme = 'light',
  searchTerm,
  activeResultId,
  pageNumber,
  baseOffset,
  highlights = [],
  userNotes = [],
  onAddHighlight,
  onRemoveHighlight,
  onAddNote,
  onUpdateNote,
  onRemoveNote,
  isHighlightToolActive = false,
  highlightColor = 'yellow',
  isEraserToolActive = false,
  isNoteToolActive = false,
  onNoteClick,
  hideFootnotes = false,
  externalNotes,
  onNotesUpdate,
  noteOffset = 0,
  pageDimensions
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const baseOffsetSafe = Number.isFinite(baseOffset) ? (baseOffset as number) : 0;
  const isDark = theme === 'dark';
  const isSepia = theme === 'sepia';

  // Scroll to active search result
  useEffect(() => {
    if (activeResultId && containerRef.current) {
      const el = containerRef.current.querySelector(`[data-search-id="${activeResultId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeResultId]);

  const normalizedText = React.useMemo(() =>
    normalizeTextForRendering(text, preserveLayout),
    [text, preserveLayout]
  );

  const splitFootnotes = splitByFootnoteSeparator(normalizedText);
  const bodyText = splitFootnotes?.body ?? normalizedText;
  const footnotesRaw = splitFootnotes?.footnotes ?? '';
  const parsedFootnotes = splitFootnotes ? parseFootnotes(footnotesRaw) : [];
  const hasPdfFootnotes = Boolean(splitFootnotes) && footnotesRaw.trim().length > 0;

  const paragraphs = React.useMemo(() => bodyText.split(/\n\s*\n/), [bodyText]);

  const splitRegex = React.useMemo(() => getSplitRegex(), []);
  const inlineSplitRegex = React.useMemo(() => getInlineSplitRegex(), []);

  // Inline notes discovered via [[word|comment]] markdown in the body. They
  // are rendered in the DOM (between PDF footnotes and user notes) but
  // previously were NOT included in selectableText — so DOM-derived offsets
  // for anything after them drifted relative to what the resolver searched,
  // mis-anchoring highlights.
  const inlineNotesData = React.useMemo(() => {
    const list: Array<{ n: number; word: string; comment: string }> = [];
    let counter = noteOffset;
    for (const paragraph of paragraphs) {
      const paragraphText = preserveLayout
        ? paragraph
        : paragraph.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
      if (!paragraphText) continue;
      const parts = paragraphText.split(splitRegex);
      for (const part of parts) {
        collectInlineNotes(part, (word, comment) => {
          counter += 1;
          list.push({ n: counter, word, comment });
        });
      }
    }
    return list;
  }, [paragraphs, preserveLayout, splitRegex, noteOffset]);

  const selectableText = React.useMemo(() => {
    let fullText = buildSelectableText(bodyText, preserveLayout);

    // Append text from notes to match DOM structure and allow highlighting within notes
    // Logic must match how computeOffsets sees the text (concatenated blocks)

    if (!hideFootnotes && hasPdfFootnotes) {
      fullText += '\n'; // Newline for the block separator
      fullText += parsedFootnotes.map(f => `${f.n} ${f.text}`).join('');
    }

    if (!hideFootnotes && inlineNotesData.length > 0) {
      if (fullText.length > 0) fullText += '\n'; // Newline for the block separator
      fullText += inlineNotesData.map(n => {
        const word = n.word ? `${n.word} ` : '';
        return `${n.n} ${word}${n.comment}`;
      }).join('');
    }

    if (!hideFootnotes && userNotes && userNotes.length > 0) {
      if (fullText.length > 0) fullText += '\n'; // Newline for the block separator
      fullText += userNotes.map((n, idx) => {
        const num = idx + 1;
        const word = n.text ? `${n.text} ` : '';
        return `${num} ${word}${n.content}`;
      }).join('');
    }

    if (externalNotes && externalNotes.length > 0) {
      if (fullText.length > 0) fullText += '\n'; // Newline for the block separator
      fullText += externalNotes.map(n => {
        const word = n.word ? `${n.word} ` : '';
        return `${n.n} ${word}${n.comment}`;
      }).join('');
    }

    return fullText;
  }, [bodyText, preserveLayout, hideFootnotes, hasPdfFootnotes, parsedFootnotes, inlineNotesData, userNotes, externalNotes]);

  const normalizedHighlights = React.useMemo(() => {
    const valid = normalizeHighlights(highlights || []);
    // Quote-first resolution: finds each highlight by its text context,
    // using offsets only as a disambiguation hint
    return resolveHighlightsByQuote(valid, selectableText, baseOffsetSafe);
  }, [highlights, selectableText, baseOffsetSafe]);

  // === FIX: Pre-compute all paragraph offsets, inline notes, and NoteList start offsets ===
  // This replaces the mutable variables that were mutated during render (React anti-pattern).
  const precomputed = React.useMemo(() => {
    let offset = baseOffsetSafe;
    let renderedCount = 0;
    let noteNum = noteOffset;
    let matchCounter = 0;
    const inlineNotes: Array<{ n: number; word: string; comment: string }> = [];

    // Pre-process paragraphs to get their start offsets and part offsets
    const paragraphMeta: Array<{
      startOffset: number;
      partOffsets: number[];
      isFirst: boolean;
    }> = [];

    for (const paragraph of paragraphs) {
      const paragraphText = preserveLayout ? paragraph : paragraph.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
      if (!paragraphText) {
        paragraphMeta.push({ startOffset: offset, partOffsets: [], isFirst: false });
        continue;
      }

      const parts = paragraphText.split(splitRegex);
      const hasBlockElements = parts.some(p => p.startsWith('[FIGURA:') && p.endsWith(']'));
      const isIgnoredParagraph = hasBlockElements && parts.length === 1;

      const isFirstRendered = renderedCount === 0;
      if (!isIgnoredParagraph) {
        renderedCount += 1;
        if (!isFirstRendered) {
          offset += 1; // paragraph separator
        }
      }

      const partOffsets: number[] = [];
      for (const part of parts) {
        partOffsets.push(offset);
        const partInfo = calculateVisibleLength(part);
        offset += partInfo.length;

        // Track inline notes — must traverse the same nested markdown that
        // renderInlineMarkdown walks, otherwise notes inside **[[..|..]]** or
        // *[[..|..]]* are missed and downstream NoteList offsets desync.
        if (partInfo.notesCount > 0) {
          collectInlineNotes(part, (word, comment) => {
            noteNum += 1;
            inlineNotes.push({ n: noteNum, word, comment });
          });
        }
      }

      paragraphMeta.push({ startOffset: partOffsets[0] ?? offset, partOffsets, isFirst: isFirstRendered });
    }

    // Compute the final offset after all paragraphs (this is what globalVisibleOffset would be)
    const bodyEndOffset = offset;

    // Pre-compute NoteList start offsets
    // Each NoteList starts at (previous end offset + 1)
    const computeNoteListEndOffset = (
      notes: Array<{ n: number | string; word?: string; text: string }>,
      startOff: number
    ): number => {
      let o = startOff;
      for (const note of notes) {
        o += String(note.n).length; // note number
        o += 1; // space
        if (note.word) {
          o += note.word.length; // plain text length (matches DOM text node)
          o += 1; // space
        }
        o += note.text.length; // plain text length (matches DOM text node)
      }
      return o;
    };

    let runningOffset = bodyEndOffset;

    // PDF footnotes
    let pdfFootnotesStart = runningOffset + 1;
    if (!hideFootnotes && hasPdfFootnotes && parsedFootnotes.length > 0) {
      runningOffset = computeNoteListEndOffset(
        parsedFootnotes.map(f => ({ n: f.n, text: f.text })),
        pdfFootnotesStart
      );
    }

    // Inline notes (registered by [[word|comment]] syntax)
    let inlineNotesStart = runningOffset + 1;
    if (!hideFootnotes && inlineNotes.length > 0) {
      runningOffset = computeNoteListEndOffset(
        inlineNotes.map(n => ({ n: n.n, word: n.word, text: n.comment })),
        inlineNotesStart
      );
    }

    // User notes
    let userNotesStart = runningOffset + 1;
    if (!hideFootnotes && userNotes && userNotes.length > 0) {
      runningOffset = computeNoteListEndOffset(
        userNotes.map((n, idx) => ({ n: idx + 1, word: n.text, text: n.content })),
        userNotesStart
      );
    }

    // External notes
    let externalNotesStart = runningOffset + 1;

    return {
      paragraphMeta,
      inlineNotes,
      noteCount: noteNum,
      pdfFootnotesStart,
      inlineNotesStart,
      userNotesStart,
      externalNotesStart,
    };
  }, [paragraphs, preserveLayout, baseOffsetSafe, noteOffset, splitRegex, hideFootnotes, hasPdfFootnotes, parsedFootnotes, userNotes, externalNotes]);

  // Mutable counters for renderPart callbacks that MUST mutate during render.
  // These are isolated to the minimum needed — the note registration callback
  // and the search match counter. The offset tracking is fully pre-computed above.
  let noteNumberCounter = noteOffset;
  const getNoteNumber = () => noteNumberCounter;
  let pageMatchCounter = 0;
  const inlineNotesCollected: Array<{ n: number | string; word: string; comment: string }> = [];

  const registerNote = (word: string, comment: string) => {
    noteNumberCounter += 1;
    const newNote = { n: noteNumberCounter, word: word.trim(), comment: comment.trim() };
    inlineNotesCollected.push(newNote);
    return noteNumberCounter;
  };

  // Sync pre-computed inline notes with parent if callback provided
  useEffect(() => {
    if (onNotesUpdate && precomputed.inlineNotes.length > 0) {
      onNotesUpdate(precomputed.inlineNotes);
    }
  }, [onNotesUpdate, precomputed.inlineNotes]);


  const renderTextWithHighlights = React.useCallback((plain: string, startOffset: number) => {
    const points: Array<{ type: 'note', offset: number, id: string, text: string, content: string }> = [];
    userNotes.forEach(n => {
      if (n.end > startOffset && n.end <= startOffset + plain.length) {
        points.push({ type: 'note', offset: n.end, id: n.id, text: n.text, content: n.content });
      }
    });

    const ranges = normalizedHighlights.filter(h => h.end > startOffset && h.start < startOffset + plain.length).map(h => ({
      type: 'highlight',
      start: Math.max(h.start, startOffset),
      end: Math.min(h.end, startOffset + plain.length),
      color: h.color,
      id: h.id
    }));

    if (ranges.length === 0 && points.length === 0) return <span key={`p-${startOffset}`}>{plain}</span>;

    const offsets = new Set<number>([startOffset, startOffset + plain.length]);
    ranges.forEach(r => { offsets.add(r.start); offsets.add(r.end); });
    points.forEach(p => offsets.add(p.offset));

    const sortedOffsets = Array.from(offsets).sort((a, b) => a - b);
    const segments: React.ReactNode[] = [];

    for (let i = 0; i < sortedOffsets.length - 1; i++) {
      const segStart = sortedOffsets[i];
      const segEnd = sortedOffsets[i + 1];
      if (segEnd <= segStart) continue;

      const segText = plain.slice(segStart - startOffset, segEnd - startOffset);

      // Find all overlapping highlights and prioritize by severity (red > blue > green > yellow)
      const overlapping = ranges.filter(r => r.start < segEnd && r.end > segStart);
      const SEVERITY_ORDER: Record<string, number> = { 'red': 4, 'blue': 3, 'green': 2, 'yellow': 1 };
      const isHighlighted = overlapping.sort((a, b) => {
        return (SEVERITY_ORDER[b.color || 'yellow'] || 0) - (SEVERITY_ORDER[a.color || 'yellow'] || 0);
      })[0];

      const element = isHighlighted
        ? <span
          key={`s-${segStart}`}
          className={`${getHighlightClasses(isHighlighted.color, theme)} rounded-[2px] cursor-pointer transition-all duration-150 hover:brightness-[0.97]`}
          style={{
            boxDecorationBreak: 'clone',
            WebkitBoxDecorationBreak: 'clone',
            // Marker effect: tint multiplies on the underlying paper color so the
            // glyphs stay full-contrast (Notion/Readwise-style). On dark theme we
            // skip the blend mode (handled by getHighlightClasses).
            mixBlendMode: shouldBlendMultiply(theme) ? 'multiply' : 'normal',
            paddingInline: '1px',
            // Stili anti-reflow per minimizzare spostamenti
            fontVariantLigatures: 'no-common-ligatures',
            WebkitFontVariantLigatures: 'no-common-ligatures',
            textRendering: 'optimizeSpeed',
            fontKerning: 'auto'
          }}
          title={isEraserToolActive ? "Clicca per cancellare" : undefined}
          onClick={(e) => {
            if (isEraserToolActive && onRemoveHighlight) {
              e.stopPropagation();
              if (isHighlighted.id) onRemoveHighlight(isHighlighted.id);
            }
          }}
        >{segText}</span>
        : <span key={`s-${segStart}`}>{segText}</span>;

      segments.push(element);

      const noteAtEnd = points.filter(p => p.offset === segEnd);
      noteAtEnd.forEach(note => {
        segments.push(
          <button
            key={`note-${note.id}`}
            data-ignore-offset="true"
            className="inline-flex items-center justify-center align-text-bottom mx-0.5 hover:scale-110 transition-transform select-none"
            onClick={(e) => {
              e.stopPropagation();
              if (isEraserToolActive && onRemoveNote) {
                if (note.id) onRemoveNote(note.id);
              } else if (onNoteClick) {
                onNoteClick(note.id);
              }
            }}
            title={isEraserToolActive ? "Clicca per rimuovere la nota" : sanitizeHTML(note.content)}
          >
            <MessageSquare size={16} className={`${isEraserToolActive ? 'text-red-500 fill-red-500/20' : 'text-amber-500 fill-amber-500/20'} drop-shadow-sm`} />
          </button>
        );
      });
    }

    return <span key={`p-${startOffset}`}>{segments}</span>;
  }, [userNotes, normalizedHighlights, isDark, isSepia, isEraserToolActive, onRemoveHighlight, onNoteClick]);

  const tryGetWordRangeAtPoint = (root: HTMLElement, clientX: number, clientY: number) => {
    const doc = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };

    const caretRange: Range | null =
      typeof doc.caretRangeFromPoint === 'function'
        ? doc.caretRangeFromPoint(clientX, clientY)
        : (typeof doc.caretPositionFromPoint === 'function'
          ? (() => {
            const pos = doc.caretPositionFromPoint!(clientX, clientY);
            if (!pos) return null;
            const r = document.createRange();
            r.setStart(pos.offsetNode, pos.offset);
            r.setEnd(pos.offsetNode, pos.offset);
            return r;
          })()
          : null);
    if (!caretRange) return null;

    let node: Node | null = caretRange.startContainer;
    let offset = caretRange.startOffset;

    if (!root.contains(node)) return null;

    if (node.nodeType !== Node.TEXT_NODE) {
      const el = node as Element;
      const idx = Math.max(0, Math.min(offset, el.childNodes.length - 1));
      const candidate = el.childNodes[idx] || el;
      const walker = document.createTreeWalker(candidate, NodeFilter.SHOW_TEXT);
      const firstText = walker.nextNode() as Text | null;
      if (!firstText) return null;
      node = firstText;
      offset = 0;
    }

    const textNode = node as Text;
    const s = textNode.data;
    if (!s) return null;

    const isWordChar = (ch: string) => /[\p{L}\p{N}'’\-]/u.test(ch);

    let i = Math.max(0, Math.min(offset, s.length));
    if (i === s.length) i = Math.max(0, s.length - 1);

    if (!isWordChar(s[i] || '')) {
      let found = -1;
      for (let j = i; j < s.length; j++) {
        if (isWordChar(s[j])) { found = j; break; }
        if (j - i > 64) break;
      }
      if (found === -1) {
        for (let j = i; j >= 0; j--) {
          if (isWordChar(s[j])) { found = j; break; }
          if (i - j > 64) break;
        }
      }
      if (found === -1) return null;
      i = found;
    }

    let start = i;
    let end = i + 1;
    while (start > 0 && isWordChar(s[start - 1])) start--;
    while (end < s.length && isWordChar(s[end])) end++;

    const r = document.createRange();
    r.setStart(textNode, start);
    r.setEnd(textNode, end);
    return r;
  };

  const handleMouseUp = React.useCallback(debounce((clientX: number, clientY: number, target: HTMLElement | null) => {
    if (target?.closest('button')) return;

    const bodyRoot = bodyRef.current;
    if (!bodyRoot) return;

    const sel = window.getSelection();
    const isCollapsed = !sel || sel.rangeCount === 0 ? true : sel.isCollapsed;

    if (isCollapsed) {
      if (!isNoteToolActive || !onAddNote) return;
      const wordRange = tryGetWordRangeAtPoint(bodyRoot, clientX, clientY);
      if (!wordRange) return;
      if (!bodyRoot.contains(wordRange.startContainer) || !bodyRoot.contains(wordRange.endContainer)) return;
      const { start, end, text: selectedText } = computeOffsets(bodyRoot, wordRange);
      if (!selectedText || selectedText.trim().length === 0) return;
      onAddNote(start + baseOffsetSafe, end + baseOffsetSafe, selectedText.trim(), "");
      sel?.removeAllRanges();
      return;
    }

    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!bodyRoot.contains(range.startContainer) || !bodyRoot.contains(range.endContainer)) return;

    const { start, end, text: selectedText, prefix, suffix } = computeOffsetsWithContext(bodyRoot, range, 32);

    if (!selectedText || selectedText.trim().length === 0) return;
    if (!validateSelectionRange(start, end, selectableText.length)) return;

    // Use the selection offsets directly — no anti-reflow expansion.
    // Anti-reflow expansion was causing highlights to cover extra text
    // (e.g. expanding to adjacent words when Italian text contains 'fi'/'fl').
    // The user selects exactly what they want highlighted.
    const adjustedStart = start + baseOffsetSafe;
    const adjustedEnd = end + baseOffsetSafe;
    const adjustedText = selectedText;

    if (isEraserToolActive && onRemoveHighlight) {
      const overlapping = normalizedHighlights.filter(h => h.start < adjustedEnd && h.end > adjustedStart);
      overlapping.forEach(h => onRemoveHighlight(h.id));
      sel.removeAllRanges();
      return;
    }

    if (isNoteToolActive && onAddNote) {
      onAddNote(adjustedStart, adjustedEnd, adjustedText.trim(), "");
      sel.removeAllRanges();
      return;
    }

    if (isHighlightToolActive && onAddHighlight) {
      // Calcola coordinate PDF per zoom-indipendenza (Adobe-like)
      let pdfRect: PdfRect | undefined;
      try {
        const scale = (pageDimensions && pageDimensions.width > 0)
          ? bodyRoot.offsetWidth / pageDimensions.width
          : 1;

        const containerMetrics = getTextContainerMetrics(bodyRoot, scale);
        const pdfCoords = textSelectionToPdfCoordinates(
          sel,
          bodyRoot,
          containerMetrics.pageWidth,
          containerMetrics.pageHeight,
          scale
        );
        pdfRect = pdfCoords || undefined; // Converti null in undefined
      } catch (error) {
        console.warn('Errore nel calcolo coordinate PDF:', error);
      }

      // Recalculate prefix/suffix for the selection (use local offsets)
      const localStart = adjustedStart - baseOffsetSafe;
      const localEnd = adjustedEnd - baseOffsetSafe;
      const preStart = Math.max(0, localStart - 32);
      const sufEnd = Math.min(selectableText.length, localEnd + 32);
      const newPrefix = selectableText.slice(preStart, localStart);
      const newSuffix = selectableText.slice(localEnd, sufEnd);

      onAddHighlight(adjustedStart, adjustedEnd, adjustedText, highlightColor, { exact: adjustedText, prefix: newPrefix, suffix: newSuffix }, pdfRect);
      sel.removeAllRanges();
      return;
    }
  }, 150), [
    isNoteToolActive,
    onAddNote,
    baseOffsetSafe,
    isEraserToolActive,
    onRemoveHighlight,
    normalizedHighlights,
    isHighlightToolActive,
    onAddHighlight,
    selectableText.length,
    pageDimensions
  ]);

  return (
    <div ref={containerRef} onMouseUp={(e) => handleMouseUp(e.clientX, e.clientY, e.target as HTMLElement)} lang="it" className={`${isDark ? 'text-reader-dark-text' : (isSepia ? 'text-reader-sepia-text' : 'text-reader-light-text')} font-reader book-text min-h-full flex flex-col`} style={{
      fontSize: '1em',
      // Reading-optimized leading: Literata at ~17px renders best at 1.55-1.6.
      lineHeight: 1.55,
      textRendering: 'optimizeLegibility',
      fontKerning: 'normal',
      // Anti-reflow stability while keeping common ligatures (fi/fl) for serif aesthetics
      fontVariantLigatures: 'common-ligatures contextual',
      WebkitFontVariantLigatures: 'common-ligatures contextual',
      fontFeatureSettings: '"kern" 1, "liga" 1, "clig" 1, "calt" 1, "onum" 1',
      letterSpacing: '0.005em',
      wordSpacing: 'normal',
      overflowWrap: 'break-word',
      wordBreak: 'break-word'
    }}>
      <div ref={bodyRef} className="flex-1">
        {paragraphs.map((paragraph, pIndex) => {
          const paragraphText = preserveLayout ? paragraph : paragraph.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
          if (!paragraphText) return null;

          const parts = paragraphText.split(splitRegex);
          const hasBlockElements = parts.some(p => p.startsWith('[FIGURA:') && p.endsWith(']'));
          const isIgnoredParagraph = hasBlockElements && parts.length === 1;

          // Use pre-computed offsets
          const meta = precomputed.paragraphMeta[pIndex];
          const isFirstRendered = meta?.isFirst ?? false;

          const looksLikeHeading = /^\s*(\d+\.|[IVXLC]+\.|CAPITOLO\b|ART\.|Art\.)/.test(paragraphText);
          const Container = hasBlockElements ? 'div' : 'p';
          const alignClass = align === 'left' ? 'text-left' : 'text-justify';
          const headingSpacingClass = looksLikeHeading ? (isFirstRendered ? ' mt-0' : ' mt-5') : '';
          const containerClass = hasBlockElements
            ? `mb-6 ${alignClass}`
            : `mb-[1em] ${alignClass}${looksLikeHeading ? ` font-semibold${headingSpacingClass} mb-3 tracking-[0.01em] ${isDark ? 'text-reader-dark-text' : (isSepia ? 'text-reader-sepia-text' : 'text-reader-light-text')}` : ''}`;

          return (
            <Container key={pIndex} className={containerClass} style={preserveLayout ? { whiteSpace: 'pre-wrap' } : undefined}>
              {parts.map((part, i) => {
                // Use pre-computed part offset
                const currentStart = meta?.partOffsets[i] ?? 0;

                return renderPart(
                  part,
                  i,
                  registerNote,
                  searchTerm,
                  isDark,
                  renderTextWithHighlights,
                  currentStart,
                  activeResultId,
                  pageNumber,
                  () => pageMatchCounter++,
                  getNoteNumber,
                  isSepia
                );
              })}
            </Container>
          );
        })}

        {!hideFootnotes && hasPdfFootnotes && (
          <NoteList
            notes={parsedFootnotes.map(f => ({ n: f.n, text: f.text }))}
            theme={theme}
            renderTextWithHighlights={renderTextWithHighlights}
            startOffset={precomputed.pdfFootnotesStart}
          />
        )}

        {!hideFootnotes && inlineNotesCollected.length > 0 && (
          <NoteList
            notes={inlineNotesCollected.map(n => ({ n: n.n, word: n.word, text: n.comment }))}
            theme={theme}
            renderTextWithHighlights={renderTextWithHighlights}
            startOffset={precomputed.inlineNotesStart}
          />
        )}

        {!hideFootnotes && userNotes && userNotes.length > 0 && (
          <NoteList
            notes={userNotes.map((n, idx) => ({ n: idx + 1, word: n.text, text: n.content, id: n.id }))}
            theme={theme}
            renderTextWithHighlights={renderTextWithHighlights}
            startOffset={precomputed.userNotesStart}
          />
        )}

        {externalNotes && externalNotes.length > 0 && (
          <NoteList
            notes={externalNotes.map(n => ({ n: n.n, word: n.word, text: n.comment }))}
            theme={theme}
            renderTextWithHighlights={renderTextWithHighlights}
            startOffset={precomputed.externalNotesStart}
          />
        )}
      </div>
    </div>
  );
};

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectInlineNotes(part: string, onFound: (word: string, comment: string) => void): void {
  if (part.startsWith('[FIGURA:') && part.endsWith(']')) return;

  if (part.startsWith('[[') && part.endsWith(']]')) {
    const content = part.slice(2, -2);
    if (content === 'PAGE_SPLIT') return;
    const [wordRaw, commentRaw] = content.split('|');
    const word = (wordRaw || '').trim();
    const comment = (commentRaw || '').trim();
    if (comment.length > 0) onFound(word, comment);
    return;
  }

  if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
    return walkInlineForNotes(part.slice(2, -2), onFound);
  }
  if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
    return walkInlineForNotes(part.slice(1, -1), onFound);
  }
  walkInlineForNotes(part, onFound);
}

function walkInlineForNotes(text: string, onFound: (word: string, comment: string) => void): void {
  const regex = getInlineSplitRegex();
  const subParts = text.split(regex);
  if (subParts.length === 1 && subParts[0] === text) return;
  for (const sub of subParts) {
    if (!sub) continue;
    collectInlineNotes(sub, onFound);
  }
}

function renderInlineMarkdown(
  text: string,
  keyPrefix: string,
  splitRegex: RegExp,
  renderTextWithHighlights?: (plain: string, startOffset: number) => React.ReactNode,
  startOffset?: number,
  getNoteNumber?: () => number,
  dark?: boolean,
  registerNote?: (word: string, comment: string) => number,
  isSepia?: boolean
) {
  const parts = text.split(splitRegex);
  let internalOffset = startOffset || 0;

  return parts.map((part, idx) => {
    const key = `${keyPrefix}${idx}`;
    const currentPartStart = internalOffset;

    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      const inner = part.startsWith('**') ? part.slice(2, -2) : part.slice(2, -2);
      const res = (
        <strong key={key} className={`font-bold ${dark ? 'text-reader-dark-text' : (isSepia ? 'text-reader-sepia-text' : 'text-reader-light-text')}`}>
          {renderInlineMarkdown(inner, `${keyPrefix}${idx}-b-`, splitRegex, renderTextWithHighlights, currentPartStart, getNoteNumber, dark, registerNote, isSepia)}
        </strong>
      );
      const info = calculateVisibleLength(inner);
      internalOffset += info.length;
      return res;
    }

    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      const inner = part.startsWith('*') ? part.slice(1, -1) : part.slice(1, -1);
      const res = (
        <em key={key} className={`italic ${dark ? 'text-reader-dark-text' : (isSepia ? 'text-reader-sepia-text' : 'text-reader-light-text')}`}>
          {renderInlineMarkdown(inner, `${keyPrefix}${idx}-i-`, splitRegex, renderTextWithHighlights, currentPartStart, getNoteNumber, dark, registerNote, isSepia)}
        </em>
      );
      const info = calculateVisibleLength(inner);
      internalOffset += info.length;
      return res;
    }

    if (part.startsWith('[[') && part.endsWith(']]')) {
      const content = part.slice(2, -2);
      if (content === 'PAGE_SPLIT') return null;

      const [wordRaw, commentRaw] = content.split('|');
      const word = (wordRaw || '').trim();
      const comment = (commentRaw || '').trim();

      const info = calculateVisibleLength(part);
      internalOffset += info.length;

      const wordNode = renderTextWithHighlights ? renderTextWithHighlights(word, currentPartStart) : word;

      if (comment.length === 0 || !registerNote) {
        return <span key={key} className="whitespace-nowrap">{wordNode}</span>;
      }
      const n = registerNote(word, comment);
      return (
        <span key={key} className="whitespace-nowrap">{wordNode}<sup data-ignore-offset="true" className={`ml-0.5 text-[0.7em] leading-none align-super font-semibold select-none ${dark ? 'text-reader-dark-text-soft' : (isSepia ? 'text-reader-sepia-text-soft' : 'text-reader-light-text-soft')}`}>{n}</sup></span>
      );
    }

    const res = <span key={key}>{renderTextWithHighlights ? renderTextWithHighlights(part, currentPartStart) : part}</span>;
    internalOffset += part.length;
    return res;
  });
}

function renderPart(
  part: string,
  key: number,
  registerNote: (word: string, comment: string) => number,
  searchTerm?: string,
  dark?: boolean,
  renderTextWithHighlights?: (plain: string, startOffset: number) => React.ReactNode,
  paragraphStartOffset?: number,
  activeResultId?: string | null,
  pageNumber?: number,
  getNextMatchIdx?: () => number,
  getNoteNumber?: () => number,
  isSepia?: boolean
) {
  const inlineRegex = getInlineSplitRegex();

  if (part.startsWith('[FIGURA:') && part.endsWith(']')) {
    const description = part.slice(8, -1).trim();
    return (
      <div key={key} data-ignore-offset="true" className={`my-8 p-6 ${dark ? 'bg-reader-dark-panel border-reader-dark-border' : (isSepia ? 'bg-reader-sepia-panel border-reader-sepia-border' : 'bg-reader-light-panel border-reader-light-border')} border rounded-lg flex flex-col items-center gap-3 shadow-elev-1 select-none mx-auto max-w-2xl`}>
        <div className={dark ? 'text-reader-dark-text-soft' : (isSepia ? 'text-reader-sepia-text-soft' : 'text-reader-light-text-soft')}>
          <ImageIcon size={20} />
        </div>
        <div className="flex flex-col gap-1 text-center">
          <span className={`text-[10px] font-bold uppercase tracking-[0.18em] ${dark ? 'text-reader-dark-text-soft' : (isSepia ? 'text-reader-sepia-text-soft' : 'text-reader-light-text-soft')}`}>Elemento Visivo</span>
          <span className={`text-sm italic leading-relaxed font-reader ${dark ? 'text-reader-dark-text-soft' : (isSepia ? 'text-reader-sepia-text-soft' : 'text-reader-light-text-soft')}`}>{sanitizeHTML(description)}</span>
        </div>
      </div>
    );
  }

  if (part.startsWith('[[') && part.endsWith(']]')) {
    const content = part.slice(2, -2);
    const [wordRaw, commentRaw] = content.split('|');
    const word = (wordRaw || '').trim();
    const comment = (commentRaw || '').trim();
    const wordNode = renderTextWithHighlights ? renderTextWithHighlights(word, paragraphStartOffset || 0) : word;
    if (comment.length === 0) {
      return <span key={key} className="whitespace-nowrap">{wordNode}</span>;
    }
    const n = registerNote(word, comment);
    return (
      <span key={key} className="whitespace-nowrap">{wordNode}<sup data-ignore-offset="true" className="ml-0.5 text-[0.7em] leading-none align-super text-stone-700 font-semibold select-none">{n}</sup></span>
    );
  }

  if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
    const inner = part.startsWith('**') ? part.slice(2, -2) : part.slice(2, -2);
    return (
      <strong key={key} className={`font-bold ${dark ? 'text-reader-dark-text' : (isSepia ? 'text-reader-sepia-text' : 'text-reader-light-text')}`}>
        {renderInlineMarkdown(inner, `p-${key}-b-`, inlineRegex, renderTextWithHighlights, paragraphStartOffset, getNoteNumber, dark, registerNote, isSepia)}
      </strong>
    );
  }

  if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
    const inner = part.startsWith('*') ? part.slice(1, -1) : part.slice(1, -1);
    return (
      <em key={key} className={`italic ${dark ? 'text-reader-dark-text' : (isSepia ? 'text-reader-sepia-text' : 'text-reader-light-text')}`}>
        {renderInlineMarkdown(inner, `p-${key}-i-`, inlineRegex, renderTextWithHighlights, paragraphStartOffset, getNoteNumber, dark, registerNote, isSepia)}
      </em>
    );
  }

  if (searchTerm && searchTerm.trim().length > 0) {
    const escaped = escapeRegExp(searchTerm.trim());
    const re = new RegExp(`(${escaped})`, 'gi');
    const chunks = part.split(re);

    let internalOffset = paragraphStartOffset || 0;

    return (
      <span key={key}>
        {chunks.map((c, i) => {
          const isMatch = i % 2 === 1;
          const currentChunkStart = internalOffset;
          const chunkInfo = calculateVisibleLength(c);
          const visibleLength = chunkInfo.length;
          internalOffset += visibleLength;

          if (isMatch) {
            const matchIdx = getNextMatchIdx ? getNextMatchIdx() : 0;
            const matchId = `search-p${pageNumber}-m${matchIdx}`;
            const isActive = activeResultId === matchId;

            return (
              <mark
                key={`${key}-h-${i}`}
                data-search-id={matchId}
                className={`${isActive ? 'bg-accent text-white z-10 shadow-glow-accent scale-[1.05]' : (dark ? 'bg-marker-yellow/30 text-reader-dark-text' : 'bg-marker-yellow text-reader-light-text')} rounded-[2px] transition-all duration-300 inline`}
                style={{ boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}
              >
                {c}
              </mark>
            );
          }
          return <span key={`${key}-t-${i}`}>{renderTextWithHighlights ? renderTextWithHighlights(c, currentChunkStart) : c}</span>;
        })}
      </span>
    );
  }

  const startOffset = (paragraphStartOffset || 0);
  return <span key={key}>{renderTextWithHighlights ? renderTextWithHighlights(part, startOffset) : part}</span>;
}
