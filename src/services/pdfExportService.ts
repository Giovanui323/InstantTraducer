/**
 * PDF Export Service — Selectable-text WYSIWYG export of reader pages.
 * 
 * Uses jsPDF to render translated text directly as selectable PDF text.
 * Parses the markdown formatting to apply bold/italic styling.
 * 
 * This keeps all export logic out of ReaderView.tsx.
 */
import { jsPDF } from 'jspdf';
import { log } from './logger';

export interface PdfExportOptions {
    /** Page numbers to export (1-indexed) */
    pages: number[];
    /** Map of page number → translated text */
    translationMap: Record<number, string>;
    /** Reader theme for styling */
    theme?: 'light' | 'sepia' | 'dark';
    /** Filename for the exported PDF (without .pdf extension) */
    filename?: string;
    /** Progress callback: called with (currentPage, totalPages) */
    onProgress?: (current: number, total: number) => void;
    /** Called when export starts */
    onStart?: () => void;
    /** Called when export completes */
    onComplete?: (success: boolean, error?: string) => void;
}

// ─── Page layout (A4, mm) ────────────────────────────────────────────────────
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_LEFT = 25;
const MARGIN_RIGHT = 25;
const MARGIN_TOP = 30;
const MARGIN_BOTTOM = 25;
const TEXT_WIDTH = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT;
const FONT_SIZE = 11;
const LINE_HEIGHT = 1.45; // multiplier
const PARAGRAPH_SPACING = 4; // mm between paragraphs
const PAGE_NUM_FONT_SIZE = 8;

// ─── Theme colors ────────────────────────────────────────────────────────────
const THEME_COLORS: Record<string, { bg: [number, number, number]; text: [number, number, number]; muted: [number, number, number] }> = {
    light: { bg: [251, 247, 239], text: [28, 25, 23], muted: [120, 113, 108] },
    sepia: { bg: [246, 240, 225], text: [28, 25, 23], muted: [120, 113, 108] },
    dark: { bg: [26, 26, 26], text: [229, 231, 235], muted: [156, 163, 175] },
};

// ─── Inline markdown regex ───────────────────────────────────────────────────
const INLINE_RE = /(\*\*[\s\S]*?\*\*|\*[\s\S]*?\*|__[\s\S]*?__|_[\s\S]*?_)/g;
const FIGURE_RE = /^\[FIGURA:.*\]$/;
const NOTE_RE = /\[\[([^|]*)\|([^\]]*)\]\]/g;
const PAGE_SPLIT_RE = /\[\[PAGE_SPLIT\]\]/g;

interface TextSegment {
    text: string;
    bold: boolean;
    italic: boolean;
}

/**
 * Parse a line of text into segments with bold/italic flags.
 */
function parseInlineFormatting(line: string): TextSegment[] {
    // First remove inline notes: [[word|comment]] → word
    const cleaned = line
        .replace(NOTE_RE, '$1')
        .replace(PAGE_SPLIT_RE, '');

    const segments: TextSegment[] = [];
    const parts = cleaned.split(INLINE_RE);

    for (const part of parts) {
        if (!part) continue;

        if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
            const inner = part.slice(2, -2);
            if (inner) segments.push({ text: inner, bold: true, italic: false });
        } else if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
            const inner = part.slice(1, -1);
            if (inner) segments.push({ text: inner, bold: false, italic: true });
        } else {
            segments.push({ text: part, bold: false, italic: false });
        }
    }

    return segments;
}

/**
 * Measure the width of a text segment in the current font.
 */
function measureSegment(pdf: jsPDF, segment: TextSegment, fontSize: number): number {
    const style = segment.bold && segment.italic ? 'bolditalic'
        : segment.bold ? 'bold'
            : segment.italic ? 'italic'
                : 'normal';
    pdf.setFont('helvetica', style);
    pdf.setFontSize(fontSize);
    return pdf.getTextWidth(segment.text);
}

/**
 * Word-wrap a list of segments to fit within maxWidth.
 * Returns an array of lines, each being an array of segments.
 */
function wrapSegments(
    pdf: jsPDF,
    segments: TextSegment[],
    maxWidth: number,
    fontSize: number
): TextSegment[][] {
    const lines: TextSegment[][] = [];
    let currentLine: TextSegment[] = [];
    let currentWidth = 0;

    for (const seg of segments) {
        const words = seg.text.split(/(\s+)/);
        for (const word of words) {
            if (!word) continue;
            const testSeg: TextSegment = { text: word, bold: seg.bold, italic: seg.italic };
            const wordWidth = measureSegment(pdf, testSeg, fontSize);

            if (currentWidth + wordWidth > maxWidth && currentLine.length > 0 && word.trim()) {
                lines.push(currentLine);
                currentLine = [];
                currentWidth = 0;
                // Skip leading space on new line
                if (!word.trim()) continue;
            }

            currentLine.push(testSeg);
            currentWidth += wordWidth;
        }
    }

    if (currentLine.length > 0) {
        lines.push(currentLine);
    }

    return lines;
}

/**
 * Draw a line of segments at the given position.
 */
function drawLine(
    pdf: jsPDF,
    segments: TextSegment[],
    x: number,
    y: number,
    fontSize: number,
    textColor: [number, number, number]
): void {
    let cursorX = x;
    for (const seg of segments) {
        const style = seg.bold && seg.italic ? 'bolditalic'
            : seg.bold ? 'bold'
                : seg.italic ? 'italic'
                    : 'normal';
        pdf.setFont('helvetica', style);
        pdf.setFontSize(fontSize);
        pdf.setTextColor(...textColor);
        pdf.text(seg.text, cursorX, y);
        cursorX += pdf.getTextWidth(seg.text);
    }
}

/**
 * Export reader pages to a PDF file with selectable text.
 */
export async function exportReaderToPdf(options: PdfExportOptions): Promise<void> {
    const {
        pages,
        translationMap,
        theme = 'light',
        filename = 'traduzione',
        onProgress,
        onStart,
        onComplete
    } = options;

    if (pages.length === 0) {
        onComplete?.(false, 'Nessuna pagina da esportare');
        return;
    }

    onStart?.();
    log.info(`[PdfExport] Starting text-based export of ${pages.length} pages`);

    try {
        const colors = THEME_COLORS[theme] || THEME_COLORS.light;
        const lineHeightMm = (FONT_SIZE * LINE_HEIGHT * 25.4) / 72; // pt → mm

        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        let isFirstPage = true;
        let exportedCount = 0;

        for (let i = 0; i < pages.length; i++) {
            const pageNum = pages[i];
            const text = translationMap[pageNum];
            onProgress?.(i + 1, pages.length);
            const hasText = text && text.trim();

            if (!isFirstPage) pdf.addPage();
            isFirstPage = false;

            // Draw page background
            pdf.setFillColor(...colors.bg);
            pdf.rect(0, 0, PAGE_W, PAGE_H, 'F');

            if (!hasText) {
                // Untranslated page — draw placeholder
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(12);
                pdf.setTextColor(...colors.muted);
                const label = 'Pagina non tradotta';
                const w = pdf.getTextWidth(label);
                pdf.text(label, (PAGE_W - w) / 2, PAGE_H / 2);
                drawPageNumber(pdf, pageNum, colors.muted);
                exportedCount++;
                continue;
            }

            // Split into paragraphs
            const paragraphs = text.split(/\n\s*\n/);
            let cursorY = MARGIN_TOP;

            for (const rawParagraph of paragraphs) {
                const paragraph = rawParagraph.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
                if (!paragraph) continue;

                // Skip figure placeholders
                if (FIGURE_RE.test(paragraph)) {
                    cursorY += PARAGRAPH_SPACING;
                    continue;
                }

                // Parse inline formatting and word-wrap
                const segments = parseInlineFormatting(paragraph);
                const lines = wrapSegments(pdf, segments, TEXT_WIDTH, FONT_SIZE);

                for (const line of lines) {
                    // Check if we need a new page
                    if (cursorY + lineHeightMm > PAGE_H - MARGIN_BOTTOM) {
                        // Page number at bottom of current page
                        drawPageNumber(pdf, pageNum, colors.muted);
                        pdf.addPage();
                        pdf.setFillColor(...colors.bg);
                        pdf.rect(0, 0, PAGE_W, PAGE_H, 'F');
                        cursorY = MARGIN_TOP;
                    }

                    drawLine(pdf, line, MARGIN_LEFT, cursorY, FONT_SIZE, colors.text);
                    cursorY += lineHeightMm;
                }

                cursorY += PARAGRAPH_SPACING;
            }

            // Page number at the bottom
            drawPageNumber(pdf, pageNum, colors.muted);
            exportedCount++;

            // Yield to allow UI updates
            if (i % 5 === 0) await new Promise(r => setTimeout(r, 10));
        }

        if (exportedCount === 0) {
            onComplete?.(false, 'Nessuna pagina con testo da esportare');
            return;
        }

        // Trigger download
        const pdfBlob = pdf.output('blob');
        const url = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);

        log.info(`[PdfExport] Export completed: ${exportedCount}/${pages.length} pages`);
        onComplete?.(true);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error('[PdfExport] Export failed', { error: msg });
        onComplete?.(false, msg);
    }
}

function drawPageNumber(pdf: jsPDF, pageNum: number, color: [number, number, number]) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(PAGE_NUM_FONT_SIZE);
    pdf.setTextColor(...color);
    const label = String(pageNum);
    const labelWidth = pdf.getTextWidth(label);
    pdf.text(label, (PAGE_W - labelWidth) / 2, PAGE_H - 12);
}

/**
 * Get the list of page numbers that have translated text.
 */
export function getExportablePages(
    pages: number[],
    translationMap: Record<number, string>
): number[] {
    return pages.filter(p => {
        const text = translationMap[p];
        return typeof text === 'string' && text.trim().length > 0;
    });
}
