import React from 'react';
import { Check, Copy } from 'lucide-react';
import { ErrorBoundary } from '../ErrorBoundary';
import { MarkdownText } from '../MarkdownText';
import type { UserHighlight, UserNote } from '../../types';
import type { PdfRect } from '../../utils/pdfCoordinates';
import { getThemeClasses, READER_THEMES, READER_STYLES, dynamicStyles } from '../../styles/readerStyles';

type Footnote = { n?: number; text: string };

export function TranslatedSpread(props: {
  pageNumber: number;
  leftText: string;
  rightText: string;
  leftFootnotes: Footnote[];
  rightFootnotes: Footnote[];
  theme: 'light' | 'sepia' | 'dark';
  effectiveScale: number;
  pageW: number;
  pageH: number;
  rightBaseOffset: number;
  leftInlineCount: number;
  showHighlights: boolean;
  showUserNotes: boolean;
  highlights: UserHighlight[];
  userNotes: UserNote[];
  isHighlightToolActive: boolean;
  isNoteToolActive: boolean;
  isEraserToolActive: boolean;
  searchTerm?: string;
  activeResultId?: string | null;
  onAddHighlight: (start: number, end: number, text: string, color?: string, quote?: { exact: string; prefix: string; suffix: string }, pdfRect?: PdfRect) => void;
  onRemoveHighlight: (id: string) => void;
  onAddNote: (start: number, end: number, text: string) => void;
  onUpdateNote: (id: string, content: string) => void;
  onRemoveNote: (id: string) => void;
  onNoteClick: (id: string) => void;
  onCopy: () => void;
  copied: boolean;
  rightOverlay?: React.ReactNode;
}) {
  const {
    pageNumber,
    leftText,
    rightText,
    leftFootnotes,
    rightFootnotes,
    theme,
    effectiveScale,
    pageW,
    pageH,
    rightBaseOffset,
    leftInlineCount,
    showHighlights,
    showUserNotes,
    highlights,
    userNotes,
    isHighlightToolActive,
    isNoteToolActive,
    isEraserToolActive,
    searchTerm,
    activeResultId,
    onAddHighlight,
    onRemoveHighlight,
    onAddNote,
    onUpdateNote,
    onRemoveNote,
    onNoteClick,
    onCopy,
    copied,
    rightOverlay,
  } = props;

  const pageDimensions = { width: 595, height: 842 };

  return (
    <div className="flex flex-col items-center gap-10">
      <div className="flex items-start justify-center gap-0">
        <div
          className={`${READER_STYLES.container.base} ${READER_STYLES.container.translated} rounded-r-none`}
          style={dynamicStyles.container(pageW, pageH, true)}
        >
          <div
            className={`${getThemeClasses(theme)} min-h-full overflow-visible relative select-text custom-scrollbar-light shadow-inner pl-[10%] pr-[20%] pt-[8%] pb-[20%]`}
            style={dynamicStyles.markdownText(13.4 * effectiveScale, READER_THEMES[theme].gradient)}
          >
            <div className="mx-auto max-w-[70ch]">
              <ErrorBoundary>
                <MarkdownText
                  align="justify"
                  text={leftText}
                  theme={theme}
                  searchTerm={searchTerm}
                  activeResultId={activeResultId}
                  pageNumber={pageNumber}
                  baseOffset={0}
                  highlights={(showHighlights ? highlights : [])}
                  userNotes={(showUserNotes ? userNotes : [])}
                  onAddHighlight={onAddHighlight}
                  onRemoveHighlight={onRemoveHighlight}
                  onAddNote={onAddNote}
                  onUpdateNote={onUpdateNote}
                  onRemoveNote={onRemoveNote}
                  isHighlightToolActive={isHighlightToolActive}
                  isNoteToolActive={isNoteToolActive}
                  isEraserToolActive={isEraserToolActive}
                  onNoteClick={onNoteClick}
                  hideFootnotes={true}
                  pageDimensions={pageDimensions}
                />
              </ErrorBoundary>
            </div>

            {leftFootnotes.length > 0 && (
              <div className="mt-8 border-t border-black/10 pt-4 opacity-80">
                <MarkdownText
                  text=""
                  theme={theme}
                  hideFootnotes={false}
                  externalNotes={leftFootnotes.map((f, i) => ({ n: f.n || (i + 1), word: '', comment: f.text }))}
                  userNotes={(showUserNotes ? userNotes : [])}
                  onNoteClick={onNoteClick}
                />
              </div>
            )}
          </div>
        </div>

        <div
          className={`${READER_STYLES.container.base} ${READER_STYLES.container.translated} rounded-l-none -ml-px`}
          style={dynamicStyles.container(pageW, pageH, true)}
        >
          <div
            className={`${getThemeClasses(theme)} min-h-full overflow-visible relative select-text custom-scrollbar-light shadow-inner pl-[10%] pr-[20%] pt-[8%] pb-[20%]`}
            style={dynamicStyles.markdownText(13.4 * effectiveScale, READER_THEMES[theme].gradient)}
          >
            <div className="mx-auto max-w-[70ch]">
              <ErrorBoundary>
                <MarkdownText
                  align="justify"
                  text={rightText}
                  theme={theme}
                  searchTerm={searchTerm}
                  activeResultId={activeResultId}
                  pageNumber={pageNumber}
                  baseOffset={rightBaseOffset}
                  highlights={(showHighlights ? highlights : [])}
                  userNotes={(showUserNotes ? userNotes : [])}
                  onAddHighlight={onAddHighlight}
                  onRemoveHighlight={onRemoveHighlight}
                  onAddNote={onAddNote}
                  onUpdateNote={onUpdateNote}
                  onRemoveNote={onRemoveNote}
                  isHighlightToolActive={isHighlightToolActive}
                  isNoteToolActive={isNoteToolActive}
                  isEraserToolActive={isEraserToolActive}
                  onNoteClick={onNoteClick}
                  hideFootnotes={true}
                  noteOffset={leftInlineCount}
                  pageDimensions={pageDimensions}
                />
              </ErrorBoundary>
            </div>

            {rightFootnotes.length > 0 && (
              <div className="mt-8 border-t border-black/10 pt-4 opacity-80">
                <MarkdownText
                  text=""
                  theme={theme}
                  hideFootnotes={false}
                  externalNotes={rightFootnotes.map((f, i) => ({ n: f.n || (i + 1), word: '', comment: f.text }))}
                  userNotes={(showUserNotes ? userNotes : [])}
                  onNoteClick={onNoteClick}
                />
              </div>
            )}
          </div>

          <button
            onClick={onCopy}
            className="absolute top-4 right-4 p-2.5 bg-white/80 hover:bg-white backdrop-blur-sm rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-200 z-10 shadow-surface border border-black/5 text-txt-muted hover:text-accent"
            title="Copia traduzione"
          >
            {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
          </button>

          {rightOverlay}
        </div>
      </div>
    </div>
  );
}
