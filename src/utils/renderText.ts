
import { UserHighlight, UserNote } from '../types';
import { PAGE_SPLIT, splitColumns } from './textUtils';

export const escapeHtml = (value: any): string =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return ch;
    }
  });

const normalizeHighlightColor = (value?: string) => {
  const fallback = 'rgba(250, 204, 21, 0.4)';
  const s = String(value ?? '').trim();
  if (!s) return fallback;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) return s;
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  if (/^#[0-9a-fA-F]{8}$/.test(s)) return s;
  if (/^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0(\.\d+)?|1(\.0+)?)\s*\)$/i.test(s)) return s;
  if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i.test(s)) return s;
  return fallback;
};

/**
 * Applica gli highlight a un pezzo di testo piano, restituendo HTML escapato con i tag <span> per i colori.
 */
const applyHighlightsToPlainText = (plainText: string, partStart: number, highlights?: UserHighlight[]) => {
  if (!highlights || highlights.length === 0) return escapeHtml(plainText);
  
  const originalLength = plainText.length;
  const partEnd = partStart + originalLength;
  const relevant = highlights.filter(h => h.start < partEnd && h.end > partStart);
  
  if (relevant.length === 0) return escapeHtml(plainText);
  
  let result = '';
  let cursor = 0;
  const sorted = [...relevant].sort((a, b) => a.start - b.start);

  for (const h of sorted) {
    const hStartInPart = Math.max(0, h.start - partStart);
    const hEndInPart = Math.min(originalLength, h.end - partStart);
    
    if (hStartInPart > cursor) {
      result += escapeHtml(plainText.slice(cursor, hStartInPart));
    }
    
    const chunk = plainText.slice(hStartInPart, hEndInPart);
    // Usiamo uno stile inline sicuro che non verrà escapato perché lo aggiungiamo DOPO l'escape del testo contenuto
    result += `<span style="background:${normalizeHighlightColor(h.color)}; border-radius: 2px;">${escapeHtml(chunk)}</span>`;
    cursor = hEndInPart;
  }
  
  if (cursor < originalLength) {
    result += escapeHtml(plainText.slice(cursor));
  }
  
  return result;
};

export const renderInlineHtml = (text: string, footnotes: string[], highlights?: UserHighlight[], blockOffset: number = 0) => {
  // Regex per catturare grassetto, corsivo, note e figure
  const parts = String(text ?? "").split(
    /(\*\*.*?\*\*|\*.*?\*|\[\[.*?\]\]|\[FIGURA:.*?\])/g
  );
  
  let currentOffset = blockOffset;

  return parts
    .map((part) => {
      if (!part) return "";
      const partLength = part.length;
      const partStart = currentOffset;

      let rendered: string;

      if (part.startsWith("[FIGURA:") && part.endsWith("]")) {
        const description = part.slice(8, -1).trim();
        rendered = `<div style="margin: 24px 0; padding: 16px; background: rgba(255,255,255,0.06); border-left: 4px solid #60a5fa; border-top-right-radius: 12px; border-bottom-right-radius: 12px; display: flex; align-items: flex-start; gap: 16px;">
          <div style="margin-top: 4px; padding: 8px; background: rgba(96,165,250,0.18); color: #60a5fa; border-radius: 10px; flex: 0 0 auto;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <path d="M21 15l-5-5L5 21"></path>
            </svg>
          </div>
          <div style="display:flex; flex-direction:column; gap:4px; min-width:0;">
            <div style="font-size:10px; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; color:#60a5fa;">Elemento Visivo Originale</div>
            <div style="font-size:14px; font-style:italic; color:#cbd5e1;">${escapeHtml(description)}</div>
          </div>
        </div>`;
      } else if (part.startsWith("[[") && part.endsWith("]]")) {
        const content = part.slice(2, -2);
        const sepIdx = content.indexOf("|");
        const word = sepIdx >= 0 ? content.slice(0, sepIdx) : content;
        const comment = sepIdx >= 0 ? content.slice(sepIdx + 1) : "";
        if (comment.trim().length > 0) {
          const number = footnotes.push(comment.trim());
          rendered = `${applyHighlightsToPlainText(word, partStart + 2, highlights)}<sup style="font-size:0.8em; vertical-align:super; color:#94a3b8; cursor:help;" title="${escapeHtml(comment.trim())}">${escapeHtml(number)}</sup>`;
        } else {
          rendered = applyHighlightsToPlainText(word, partStart + 2, highlights);
        }
      } else if (part.startsWith("**") && part.endsWith("**")) {
        const inner = part.slice(2, -2);
        rendered = `<strong>${applyHighlightsToPlainText(inner, partStart + 2, highlights)}</strong>`;
      } else if (part.startsWith("*") && part.endsWith("*")) {
        const inner = part.slice(1, -1);
        rendered = `<em>${applyHighlightsToPlainText(inner, partStart + 1, highlights)}</em>`;
      } else {
        rendered = applyHighlightsToPlainText(part, partStart, highlights);
      }

      currentOffset += partLength;
      return rendered;
    })
    .join("");
};

export const detectHeadingLevel = (block: string): number => {
  const line = String(block ?? "").trim();
  if (!line) return 0;
  if (/^\d+\.\s+[A-ZÀ-ÖØ-Ý0-9][A-ZÀ-ÖØ-Ý0-9\s\-–—.,:;()]+$/.test(line)) return 1;
  if (/^[A-Z]\.\s+[A-ZÀ-ÖØ-Ý0-9][A-ZÀ-ÖØ-Ý0-9\s\-–—.,:;()]+$/.test(line)) return 2;
  if (/^[IVXLCDM]+\.\s+/.test(line)) return 3;
  if (/^#{1,3}\s+/.test(line)) {
    const hashes = (line.match(/^#+/) || [""])[0].length;
    return Math.min(3, Math.max(1, hashes));
  }
  return 0;
};

export const renderReaderBlocksHtml = (text: string, highlights?: UserHighlight[], sharedFootnotes?: string[], baseOffset: number = 0) => {
  const footnotes: string[] = sharedFootnotes ?? [];
  const normalized = String(text ?? "").replace(/\r\n/g, "\n");
  
  // Dividiamo in blocchi mantenendo traccia dell'offset originale
  // Usiamo una regex che cattura anche i delimitatori per non perdere la posizione
  const blockParts = normalized.split(/(\n{2,})/g);

  let currentOffset = baseOffset;
  let firstParagraph = true;
  let previousWasHeading = false;

  const html = blockParts
    .map((raw) => {
      const partLength = raw.length;
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
        return `<h${headingLevel} style="margin:0; ${
          headingLevel === 1
            ? "text-transform:uppercase; font-weight:700; letter-spacing:0.02em; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.08); margin-top:24px; margin-bottom:16px;"
            : headingLevel === 2
            ? "text-transform:uppercase; font-weight:700; letter-spacing:0.02em; margin-top:20px; margin-bottom:12px;"
            : "font-weight:700; margin-top:16px; margin-bottom:8px;"
        } color:#e5e7eb;">${renderInlineHtml(clean, footnotes, highlights, headingOffset)}</h${headingLevel}>`;
      }

      const noIndent = firstParagraph || previousWasHeading;
      const paragraphOffset = partStart + (raw.indexOf(block));
      firstParagraph = false;
      previousWasHeading = false;
      
      return `<p style="margin:0; color:#e5e7eb; ${
        noIndent ? "text-indent:0;" : "text-indent:1.25em;"
      }">${renderInlineHtml(block, footnotes, highlights, paragraphOffset)}</p>`;
    })
    .join("");

  const footnotesHtml =
    footnotes.length > 0
      ? `<div style="margin-top:22px;">
           <div style="width:180px; border-top:1px solid rgba(255,255,255,0.18); margin-bottom:10px;"></div>
           ${footnotes
             .map((note, i) => {
               const number = i + 1;
               return `<div style="display:flex; gap:8px; font-size:0.9em; line-height:1.5; color:#cbd5e1; margin-bottom:6px;">
                         <span style="min-width:16px; text-align:right;">${escapeHtml(number)}</span>
                         <span style="flex:1 1 auto; padding-left:8px; text-indent:-16px; display:block;">${escapeHtml(note)}</span>
                       </div>`;
             })
             .join("")}
         </div>`
      : "";

  return { html, footnotesHtml };
};

export const buildReaderHtml = (text: string, highlights?: UserHighlight[], userNotes?: UserNote[]) => {
  const hasSplit = String(text || '').includes(PAGE_SPLIT);
  const baseStyle = "color:#e5e7eb; font-family: ui-serif, Georgia, 'Times New Roman', Times, serif; font-size:15px; line-height:1.6;";
  
  if (!hasSplit) {
    const { html, footnotesHtml } = renderReaderBlocksHtml(text, highlights);
    const userNotesHtml = (userNotes && userNotes.length > 0)
      ? `<div style="margin-top:14px;">${userNotes.map((n, idx) => `<div style="display:flex; gap:8px; font-size:0.9em; line-height:1.5; color:#cbd5e1; margin-bottom:6px;"><span style="min-width:16px; text-align:right;">${idx + 1}</span><span style="flex:1 1 auto; padding-left:8px; display:block;"><em>${escapeHtml(n.text)}</em> — ${escapeHtml(n.content)}</span></div>`).join('')}</div>`
      : '';
    const body = `${html}${footnotesHtml}${userNotesHtml}`;
    return `<div style="${baseStyle}">${body}</div>`;
  }
  
  const [leftRaw, rightRaw] = splitColumns(String(text || ''));
  const sharedFootnotes: string[] = [];
  
  // Per la pagina destra, dobbiamo aggiungere l'offset della pagina sinistra + la lunghezza del marker PAGE_SPLIT
  const rightOffset = leftRaw.length + PAGE_SPLIT.length;
  
  const left = renderReaderBlocksHtml(leftRaw || '', highlights, sharedFootnotes, 0);
  const right = renderReaderBlocksHtml(rightRaw || '', highlights, sharedFootnotes, rightOffset);
  
  const body = `
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 24px;">
      <div>${left.html}</div>
      <div>${right.html}</div>
    </div>
    ${(left.footnotesHtml || right.footnotesHtml || '')}
    ${(userNotes && userNotes.length > 0) ? `<div style="margin-top:14px;">${userNotes.map((n, idx) => `<div style="display:flex; gap:8px; font-size:0.9em; line-height:1.5; color:#cbd5e1; margin-bottom:6px;"><span style="min-width:16px; text-align:right;">${idx + 1}</span><span style="flex:1 1 auto; padding-left:8px; display:block;"><em>${escapeHtml(n.text)}</em> — ${escapeHtml(n.content)}</span></div>`).join('')}</div>` : ''}
  `;
  return `<div style="${baseStyle}">${body}</div>`;
};
