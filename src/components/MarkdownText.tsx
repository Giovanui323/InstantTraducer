import React, { useRef, useEffect } from 'react';
import { Image as ImageIcon, MessageSquare } from 'lucide-react';
import { UserHighlight, UserNote } from '../types';
import { computeOffsets, normalizeHighlights } from '../utils/textSelection';

interface MarkdownTextProps {
  text: string;
  align?: 'justify' | 'left';
  preserveLayout?: boolean;
  dark?: boolean;
  searchTerm?: string;
  activeResultId?: string | null;
  pageNumber?: number;
  baseOffset?: number;
  highlights?: UserHighlight[];
  userNotes?: UserNote[];
  onAddHighlight?: (start: number, end: number, text: string, color?: string) => void;
  onRemoveHighlight?: (id: string) => void;
  onAddNote?: (start: number, end: number, text: string, content: string) => void;
  onUpdateNote?: (id: string, content: string) => void;
  onRemoveNote?: (id: string) => void;
  isHighlightToolActive?: boolean;
  isNoteToolActive?: boolean;
  isEraserToolActive?: boolean;
  onNoteClick?: (id: string) => void;
}

export const MarkdownText: React.FC<MarkdownTextProps> = ({
  text,
  align = 'justify',
  preserveLayout = false,
  dark = false,
  searchTerm,
  activeResultId,
  pageNumber,
  baseOffset,
  highlights = [],
  userNotes = [],
  onAddHighlight,
  onRemoveHighlight,
  onAddNote,
  isHighlightToolActive = false,
  isEraserToolActive = false,
  isNoteToolActive = false,
  onNoteClick
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const baseOffsetSafe = Number.isFinite(baseOffset) ? (baseOffset as number) : 0;

  // Scroll to active search result
  useEffect(() => {
    if (activeResultId && containerRef.current) {
      const el = containerRef.current.querySelector(`[data-search-id="${activeResultId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeResultId]);

  const normalizedText = preserveLayout
    ? text.replace(/\r\n/g, '\n')
    : text
      .replace(/\r\n/g, '\n')
      .replace(/([A-Za-zÀ-ÖØ-öø-ÿ])-\n\s*([A-Za-zÀ-ÖØ-öø-ÿ])/g, '$1$2');

  const splitFootnotes = splitByFootnoteSeparator(normalizedText);
  const bodyText = splitFootnotes?.body ?? normalizedText;
  const footnotesRaw = splitFootnotes?.footnotes ?? '';
  const parsedFootnotes = splitFootnotes ? parseFootnotes(footnotesRaw) : [];
  const hasPdfFootnotes = Boolean(splitFootnotes) && footnotesRaw.trim().length > 0;

  const normalizedHighlights = normalizeHighlights(highlights || []);

  const paragraphs = bodyText.split(/\n\s*\n/);
  const splitRegex = /(\*\*[\s\S]*?\*\*|\*[\s\S]*?\*|__[\s\S]*?__|_[\s\S]*?_|\[\[.*?\|.*?\]\]|\[FIGURA:.*?\])/g;
  const inlineSplitRegex = /(\*\*[\s\S]*?\*\*|\*[\s\S]*?\*|__[\s\S]*?__|_[\s\S]*?_)/g;

  let globalVisibleOffset = baseOffsetSafe; // Tracks the offset in the "visible" plain text representation
  let renderedParagraphs = 0;
  let noteNumber = 0;
  let pageMatchCounter = 0;
  const notes: Array<{ n: number; word: string; comment: string }> = [];

  const registerNote = (word: string, comment: string) => {
    noteNumber += 1;
    notes.push({ n: noteNumber, word: word.trim(), comment: comment.trim() });
    return noteNumber;
  };

  const renderTextWithHighlights = (plain: string, startOffset: number) => {
    // ... (rest of the component)

    // Combine highlights (ranges) and notes (points)
    const points: Array<{ type: 'note', offset: number, id: string, text: string, content: string }> = [];
    userNotes.forEach(n => {
      // We place the note icon at the end of the selected text (n.end)
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

    if (ranges.length === 0 && points.length === 0) return <span>{plain}</span>;

    // Sort interesting offsets
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
      const isHighlighted = ranges.find(r => r.start < segEnd && r.end > segStart);

      const element = isHighlighted
        ? <span
          key={`s-${segStart}`}
          className={`${dark ? 'bg-yellow-500/40 text-white' : 'bg-yellow-200 text-black'} rounded px-[2px] cursor-pointer hover:brightness-95`}
          title={isEraserToolActive ? "Clicca per cancellare" : undefined}
          onClick={(e) => {
            if (isEraserToolActive && onRemoveHighlight) {
              e.stopPropagation();
              // Remove highlight
              if (isHighlighted.id) onRemoveHighlight(isHighlighted.id);
            }
          }}
        >{segText}</span>
        : <span key={`s-${segStart}`}>{segText}</span>;

      segments.push(element);

      // Check if there is a note at segEnd
      const noteAtEnd = points.filter(p => p.offset === segEnd);
      noteAtEnd.forEach(note => {
        segments.push(
          <button
            key={`note-${note.id}`}
            className="inline-flex items-center justify-center align-text-bottom mx-0.5 hover:scale-110 transition-transform"
            onClick={(e) => {
              e.stopPropagation();
              if (onNoteClick) onNoteClick(note.id);
            }}
            title={note.content}
          >
            <MessageSquare size={16} className="text-amber-500 fill-amber-500/20 drop-shadow-sm" />
          </button>
        );
      });
    }

    return <span>{segments}</span>;
  };

  const tryGetWordRangeAtPoint = (root: HTMLElement, clientX: number, clientY: number) => {
    const docAny = document as any;
    const caretRange: Range | null =
      typeof docAny.caretRangeFromPoint === 'function'
        ? docAny.caretRangeFromPoint(clientX, clientY)
        : (typeof docAny.caretPositionFromPoint === 'function'
          ? (() => {
            const pos = docAny.caretPositionFromPoint(clientX, clientY);
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

  const handleMouseUp: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('button')) return;

    const root = containerRef.current;
    if (!root) return;

    const sel = window.getSelection();
    const isCollapsed = !sel || sel.rangeCount === 0 ? true : sel.isCollapsed;

    // If it's just a click (collapsed), we check validation/eraser but computeOffsets needs selection
    if (isCollapsed) {
      if (!isNoteToolActive || !onAddNote) return;
      const wordRange = tryGetWordRangeAtPoint(root, e.clientX, e.clientY);
      if (!wordRange) return;
      if (!root.contains(wordRange.startContainer) || !root.contains(wordRange.endContainer)) return;
      const { start, end, text: selectedText } = computeOffsets(root, wordRange);
      if (!selectedText || selectedText.trim().length === 0) return;
      onAddNote(start + baseOffsetSafe, end + baseOffsetSafe, selectedText.trim(), "");
      sel?.removeAllRanges();
      return;
    }

    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;

    const { start, end, text: selectedText } = computeOffsets(root, range);

    if (!selectedText || selectedText.trim().length === 0) return;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;

    const adjustedStart = start + baseOffsetSafe;
    const adjustedEnd = end + baseOffsetSafe;

    // ERASER TOOL (Swipe)
    if (isEraserToolActive && onRemoveHighlight) {
      // Find highlights overlapping with selection
      const overlapping = normalizedHighlights.filter(h => h.start < adjustedEnd && h.end > adjustedStart);
      overlapping.forEach(h => onRemoveHighlight(h.id));
      sel.removeAllRanges();
      return;
    }

    // NOTE TOOL
    if (isNoteToolActive && onAddNote) {
      onAddNote(adjustedStart, adjustedEnd, selectedText.trim(), ""); // Content will be asked by modal
      sel.removeAllRanges();
      return;
    }

    // HIGHLIGHT TOOL
    if (isHighlightToolActive && onAddHighlight) {
      onAddHighlight(adjustedStart, adjustedEnd, selectedText);
      sel.removeAllRanges();
      return;
    }
  };

  return (
    <div ref={containerRef} onMouseUp={handleMouseUp} lang="it" className={`${dark ? 'text-gray-200' : 'text-gray-900'} leading-relaxed book-text min-h-full flex flex-col`} style={{
      fontFamily: 'Iowan Old Style, Palatino, "Palatino Linotype", "Book Antiqua", Georgia, Cambria, "Times New Roman", Times, serif',
      fontSize: '1em',
      lineHeight: 1.28,
      textRendering: 'optimizeLegibility',
      fontKerning: 'normal'
    }}>
      <div className="flex-1">
        {paragraphs.map((paragraph, pIndex) => {
          const paragraphText = preserveLayout ? paragraph : paragraph.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
          if (!paragraphText) return null;

          const isFirstRendered = renderedParagraphs === 0;
          renderedParagraphs += 1;

          // Se non è il primo paragrafo, aggiungiamo un offset per la nuova riga (\n) inserita dal browser tra i blocchi <p>
          if (!isFirstRendered) {
            globalVisibleOffset += 1;
          }

          const parts = paragraphText.split(splitRegex);
          const hasBlockElements = parts.some(p => p.startsWith('[FIGURA:') && p.endsWith(']'));
          const looksLikeHeading = /^\s*(\d+\.|[IVXLC]+\.|CAPITOLO\b|ART\.|Art\.)/.test(paragraphText);
          const Container = hasBlockElements ? 'div' : 'p';
          const alignClass = align === 'left' ? 'text-left' : 'text-justify';
          const headingSpacingClass = looksLikeHeading ? (isFirstRendered ? ' mt-0' : ' mt-5') : '';
          const containerClass = hasBlockElements
            ? `mb-6 ${alignClass}`
            : `mb-[1em] ${alignClass}${looksLikeHeading ? ` font-semibold${headingSpacingClass} mb-3 tracking-[0.01em] ${dark ? 'text-gray-100' : 'text-stone-900'}` : ''}`;

          return (
            <Container key={pIndex} className={containerClass} style={preserveLayout ? { whiteSpace: 'pre-wrap', textAlign: align === 'left' ? 'left' : 'justify' } : { textAlign: align === 'left' ? 'left' : 'justify' }}>
              {parts.map((part, i) => {
                const currentStart = globalVisibleOffset;
                let visibleLength = calculateRecursiveVisibleLength(part);
                if (part.startsWith('[[') && part.endsWith(']]')) {
                  const content = part.slice(2, -2);
                  const [, commentRaw] = content.split('|');
                  const comment = (commentRaw || '').trim();
                  if (comment.length > 0) {
                    visibleLength += String(noteNumber + 1).length;
                  }
                }
                globalVisibleOffset += visibleLength;
                // Only add NEWLINE or SPACE offset if paragraphs imply it? 
                // paragraphs are split by \n\n, typically 1 or 2 newlines. 
                // If we treat them as blocks, we don't count the gap? 
                // BUT computeOffsets tracks text content in DOM. Browsers usually insert \n for block elements.
                // We should verify if globalVisibleOffset needs to account for paragraph breaks.
                // Usually, textContent includes newlines only if `white-space: pre`. 
                // For normal blocks, offsets might be contiguous or separated by 1.
                // Let's assume contiguous for now inside paragraph.

                return renderPart(
                  part, 
                  i, 
                  registerNote, 
                  searchTerm, 
                  dark, 
                  renderTextWithHighlights, 
                  currentStart,
                  activeResultId,
                  pageNumber,
                  () => pageMatchCounter++
                );
              })}
            </Container>
          );
        })}
      </div>

      {hasPdfFootnotes && (
        <div className="mt-auto pt-6 flex flex-col items-start w-full">
          <div className="block w-full mb-2">
            <div className={`block h-px w-full ${dark ? 'bg-gray-600' : 'bg-stone-400'}`} />
          </div>
          <div className={`w-full text-[10px] leading-tight ${dark ? 'text-gray-300' : 'text-stone-800'}`} style={{ fontSize: '10px' }}>
            {parsedFootnotes.length >= 2 ? (
              parsedFootnotes.map((note, idx) => (
                <div key={note.n} className="flex gap-1 mb-2 items-start">
                  <span className={`font-semibold shrink-0 ${dark ? 'text-gray-300' : 'text-stone-800'}`}>{note.n}</span>
                  <span className={`block ${dark ? 'text-gray-300' : 'text-stone-800'}`}>
                    {renderInlineMarkdown(note.text, `${note.n}-`, /(\*\*[\s\S]*?\*\*|\*[\s\S]*?\*|__[\s\S]*?__|_[\s\S]*?_)/g)}
                  </span>
                </div>
              ))
            ) : (
              <span className="block">
                {renderInlineMarkdown(
                  footnotesRaw.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim(),
                  'raw-',
                  inlineSplitRegex
                )}
              </span>
            )}
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <div className="mt-auto pt-6 flex flex-col items-start w-full">
          <div className="block w-full mb-2">
            <div className={`block h-px w-full ${dark ? 'bg-gray-600' : 'bg-stone-400'}`} />
          </div>
          <div className={`w-full text-[10px] leading-tight ${dark ? 'text-gray-300' : 'text-stone-800'}`} style={{ fontSize: '10px' }}>
            {notes.map((note, idx) => (
              <span key={note.n} className="block mb-1">
                <span className={`font-semibold ${dark ? 'text-gray-300' : 'text-stone-800'}`}>{note.n}</span>
                <span className={dark ? 'text-gray-300' : 'text-stone-800'}> </span>
                <span className={`italic ${dark ? 'text-gray-100' : 'text-stone-900'}`}>{note.word}</span>
                <span className={dark ? 'text-gray-400' : 'text-stone-500'}> </span>
                <span className={dark ? 'text-gray-300' : 'text-stone-800'}>{note.comment}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {userNotes && userNotes.length > 0 && (
        <div className="mt-2 flex flex-col items-start w-full">
          <div className={`w-full text-[10px] leading-tight ${dark ? 'text-gray-300' : 'text-stone-800'}`} style={{ fontSize: '10px' }}>
            {userNotes.map((n, idx) => (
              <span key={n.id} className="block mb-1">
                <span className={`font-semibold ${dark ? 'text-gray-300' : 'text-stone-800'}`}>{idx + 1}</span>
                <span className={dark ? 'text-gray-300' : 'text-stone-800'}> </span>
                <span className={`italic ${dark ? 'text-gray-100' : 'text-stone-900'}`}>{n.text}</span>
                <span className={dark ? 'text-gray-400' : 'text-stone-500'}> </span>
                <span className={dark ? 'text-gray-300' : 'text-stone-800'}>{n.content}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

function splitByFootnoteSeparator(text: string) {
  // 1. Try explicit separator (Markdown horizontal rule)
  const re = /(?:^|\n)\s*(?:_{3,}|-{3,}|—{3,}|‐{3,}|‑{3,})\s*/;
  const match = re.exec(text);
  if (match && match.index != null) {
    const start = match.index;
    const end = match.index + match[0].length;
    return {
      body: text.slice(0, start).trimEnd(),
      footnotes: text.slice(end).trim()
    };
  }

  // 2. Fallback: Try to detect footnote block at the end (numbered list 1, 2, 3...)
  // Look for the last occurrence of "1" followed by "2" etc.
  // This is a simple heuristic: if we find a block starting with 1 at the end of the text.

  // We'll look for a pattern like: \n1. or \n1
  // followed by \n2. or \n2 later

  const lines = text.split('\n');
  let potentialSplitIndex = -1;

  // Iterate backwards to find where the footnotes might start
  // We look for "1" that starts a line, and verify if it's part of a sequence
  // However, simple regex on the tail might be safer.

  // Let's try to match a sequence of footnotes at the very end of the string.
  // Regex: Finds 1... then 2... at the end.
  const footnoteBlockRe = /(?:^|\n)\s*(?:1[.\s]|\^1\s?)(?:.|\n)*?(?:^|\n)\s*(?:2[.\s]|\^2\s?)(?:.|\n)*$/;
  const blockMatch = footnoteBlockRe.exec(text);

  if (blockMatch && blockMatch.index != null) {
    // If found, we assume this is the footnote block.
    // But we need to make sure we didn't match the start of the document if it's numbered.
    // Check if the match is in the last 50% of the text, or if the text is short.
    if (blockMatch.index > text.length * 0.3 || text.length < 1000) {
      return {
        body: text.slice(0, blockMatch.index).trimEnd(),
        footnotes: text.slice(blockMatch.index).trim()
      };
    }
  }

  return null;
}

function parseFootnotes(text: string): Array<{ n: string; text: string }> {
  // Collapse whitespace but keep numbers distinct
  const compact = text.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!compact) return [];

  // Regex to find footnote numbers: "123 " or "123. "
  // We match digits followed by space, or digits followed by dot then space.
  const candidateRe = /(?:^|\s)(\d{1,4})(?:\.|\s)/g;

  const candidates: Array<{ n: number; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = candidateRe.exec(compact)) !== null) {
    // m[1] is the number
    const n = Number(m[1]);
    const start = m.index + (m[0].startsWith(' ') ? 1 : 0);
    // Be careful with end, m[0] includes the separator
    const end = start + m[1].length;

    if (!Number.isFinite(n)) continue;
    // Context check
    if (!isFootnoteMarkerContext(compact, start)) continue;
    candidates.push({ n, start, end });
  }

  if (candidates.length === 0) return [{ n: '', text: compact }];

  const best = pickBestSequentialRun(candidates);
  if (!best) return [{ n: '', text: compact }];

  const out: Array<{ n: string; text: string }> = [];
  for (let i = 0; i < best.length; i++) {
    const curr = best[i];
    const next = best[i + 1];

    // The text for this footnote starts after the number (and potentially dot)
    // We detected the number part. Let's look at compact[curr.end].
    let textStart = curr.end;
    if (compact[textStart] === '.') textStart++;

    const textEnd = next ? next.start : compact.length;
    const chunkText = compact.slice(textStart, textEnd).trim();

    if (chunkText.length === 0 && !next) continue; // Skip empty last
    out.push({ n: String(curr.n), text: chunkText });
  }

  return out.length > 0 ? out : [{ n: '', text: compact }];
}

function isFootnoteMarkerContext(text: string, start: number) {
  if (start === 0) return true;

  const before = text.slice(Math.max(0, start - 8), start);
  const after = text.slice(start, Math.min(text.length, start + 12));

  if (/[.;:)\]]\s*$/.test(before)) return true;

  if (/\b(?:Art\.|Art|Artikel)\s*$/.test(before)) return false;
  if (/§\s*$/.test(before)) return false;
  if (/\bRn\.?\s*$/.test(before)) return false;

  if (/^\d+\s*\bRn\./.test(after)) return false;

  return true;
}

function pickBestSequentialRun(candidates: Array<{ n: number; start: number; end: number }>) {
  const sorted = [...candidates].sort((a, b) => a.start - b.start);

  let best: Array<{ n: number; start: number; end: number }> | null = null;
  let bestScore = -1;

  for (let i = 0; i < sorted.length; i++) {
    // Run finding logic
    const startCandidate = sorted[i];
    const run = [startCandidate];
    let expected = startCandidate.n + 1;
    let lastStart = startCandidate.start;

    for (let j = i + 1; j < sorted.length; j++) {
      const next = sorted[j];
      if (next.start > lastStart && next.n === expected) {
        run.push(next);
        expected++;
        lastStart = next.start;
      }
    }

    // Heuristic: longer runs are better. Small numbers (start with 1) are better.
    const score = run.length * 10 - (startCandidate.n * 0.1);
    if (score > bestScore) {
      bestScore = score;
      best = run;
    }
  }
  return best;
}

function renderInlineMarkdown(text: string, keyPrefix: string, splitRegex: RegExp) {
  const parts = text.split(splitRegex);
  return parts.map((part, idx) => {
    const key = `${keyPrefix}${idx}`;
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      const inner = part.startsWith('**') ? part.slice(2, -2) : part.slice(2, -2);
      return (
        <strong key={key} className="font-bold text-black">
          {renderInlineMarkdown(inner, `${keyPrefix}${idx}-b-`, splitRegex)}
        </strong>
      );
    }

    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      const inner = part.startsWith('*') ? part.slice(1, -1) : part.slice(1, -1);
      return (
        <em key={key} className="italic text-gray-800">
          {renderInlineMarkdown(inner, `${keyPrefix}${idx}-i-`, splitRegex)}
        </em>
      );
    }

    return <span key={key}>{part}</span>;
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
  getNextMatchIdx?: () => number
) {
  if (part.startsWith('[FIGURA:') && part.endsWith(']')) {
    const description = part.slice(8, -1).trim();
    return (
      <div key={key} className="my-8 p-6 bg-[#fbf7ef] border border-stone-200 rounded-sm flex flex-col items-center gap-3 shadow-sm select-none mx-auto max-w-2xl">
        <div className="p-2 text-stone-500">
          <ImageIcon size={20} />
        </div>
        <div className="flex flex-col gap-1 text-center">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500">Elemento Visivo</span>
          <span className="text-sm italic text-stone-700 leading-relaxed font-serif">{description}</span>
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
      return (
        <span key={key} className="whitespace-nowrap">
          {wordNode}
        </span>
      );
    }
    const n = registerNote(word, comment);
    return (
      <span key={key} className="whitespace-nowrap">
        {wordNode}
        <sup className="ml-0.5 text-[9px] leading-none align-super text-stone-700 font-semibold">{n}</sup>
      </span>
    );
  }

  if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
    const inner = part.startsWith('**') ? part.slice(2, -2) : part.slice(2, -2);
    return (
      <strong key={key} className="font-bold text-black">
        {renderInlineMarkdown(inner, `p-${key}-b-`, /(\*\*[\s\S]*?\*\*|\*[\s\S]*?\*|__[\s\S]*?__|_[\s\S]*?_)/g)}
      </strong>
    );
  }

  if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
    const inner = part.startsWith('*') ? part.slice(1, -1) : part.slice(1, -1);
    return (
      <em key={key} className="italic text-gray-800">
        {renderInlineMarkdown(inner, `p-${key}-i-`, /(\*\*[\s\S]*?\*\*|\*[\s\S]*?\*|__[\s\S]*?__|_[\s\S]*?_)/g)}
      </em>
    );
  }

  if (searchTerm && searchTerm.trim().length > 0) {
    const escaped = escapeRegExp(searchTerm.trim());
    const re = new RegExp(`(${escaped})`, 'gi');
    const chunks = part.split(re);
    return (
      <span key={key}>
        {chunks.map((c, i) => {
          // Quando si usa split con un gruppo di cattura, i match si trovano sempre agli indici dispari
          const isMatch = i % 2 === 1;
          if (isMatch) {
            const matchIdx = getNextMatchIdx ? getNextMatchIdx() : 0;
            const matchId = `search-p${pageNumber}-m${matchIdx}`;
            const isActive = activeResultId === matchId;

            return (
              <mark
                key={`${key}-h-${i}`}
                data-search-id={matchId}
                className={`${isActive ? 'bg-orange-500 text-white z-10 shadow-[0_0_8px_rgba(249,115,22,0.6)] scale-[1.05]' : (dark ? 'bg-yellow-500/40 text-white' : 'bg-yellow-200 text-black')} rounded-[2px] px-[2px] -mx-[2px] transition-all duration-300 inline-block`}
              >
                {c}
              </mark>
            );
          }
          const startOffset = (paragraphStartOffset || 0) + chunks.slice(0, i).join('').length;
          return <span key={`${key}-t-${i}`}>{renderTextWithHighlights ? renderTextWithHighlights(c, startOffset) : c}</span>;
        })}
      </span>
    );
  }

  const startOffset = (paragraphStartOffset || 0);
  return <span key={key}>{renderTextWithHighlights ? renderTextWithHighlights(part, startOffset) : part}</span>;
}



function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function calculateRecursiveVisibleLength(part: string): number {
  if (part.startsWith('[FIGURA:') && part.endsWith(']')) return 0;

  if (part.startsWith('[[') && part.endsWith(']]')) {
    const content = part.slice(2, -2);
    const [word] = content.split('|');
    return word.trim().length;
  }

  const inlineSplitRegex = /(\*\*[\s\S]*?\*\*|\*[\s\S]*?\*|__[\s\S]*?__|_[\s\S]*?_)/g;
  if (inlineSplitRegex.test(part)) {
    // Reset regex index
    inlineSplitRegex.lastIndex = 0;
    const subParts = part.split(inlineSplitRegex);
    let total = 0;
    for (const sub of subParts) {
      if ((sub.startsWith('**') && sub.endsWith('**')) || (sub.startsWith('__') && sub.endsWith('__'))) {
        total += calculateRecursiveVisibleLength(sub.slice(2, -2));
      } else if ((sub.startsWith('*') && sub.endsWith('*')) || (sub.startsWith('_') && sub.endsWith('_'))) {
        total += calculateRecursiveVisibleLength(sub.slice(1, -1));
      } else {
        total += sub.length;
      }
    }
    return total;
  }

  return part.length;
}
