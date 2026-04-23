const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => {
  switch (ch) {
    case '&': return '&amp;';
    case '<': return '&lt;';
    case '>': return '&gt;';
    case '"': return '&quot;';
    case "'": return '&#39;';
    default: return ch;
  }
});

const detectHeadingLevel = (block) => {
  const line = String(block ?? '').trim();
  if (!line) return 0;
  if (/^\d+\.\s+[A-ZÀ-ÖØ-Ý0-9][A-ZÀ-ÖØ-Ý0-9\s\-–—.,:;()]+$/.test(line)) return 1;
  if (/^[A-Z]\.\s+[A-ZÀ-ÖØ-Ý0-9][A-ZÀ-ÖØ-Ý0-9\s\-–—.,:;()]+$/.test(line)) return 2;
  if (/^[IVXLCDM]+\.\s+/.test(line)) return 3;
  if (/^#{1,3}\s+/.test(line)) {
    const hashes = (line.match(/^#+/) || [''])[0].length;
    return Math.min(3, Math.max(1, hashes));
  }
  return 0;
};

const normalizeHighlightColor = (value) => {
  const fallback = 'rgba(250, 204, 21, 0.4)';
  const s = String(value ?? '').trim();
  if (!s) return fallback;
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
  if (/^(rgba?|hsla?)\([0-9\s,.%deg\/-]+\)$/i.test(s)) return s;
  if (/^[a-zA-Z]+$/.test(s)) return s;
  return fallback;
};

const applyHighlightsToPlainText = (plainText, partStart, highlights) => {
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
    const color = normalizeHighlightColor(h.color);
    result += `<span class="highlight" style="background-color:${color}; border-radius: 2px; box-decoration-break: clone; -webkit-box-decoration-break: clone;">${escapeHtml(chunk)}</span>`;
    cursor = hEndInPart;
  }
  
  if (cursor < originalLength) {
    result += escapeHtml(plainText.slice(cursor));
  }
  
  return result;
};

const renderInlineHtml = (text, footnotes, highlights, blockOffset = 0) => {
  // Regex aligned with src/utils/highlightSelectors.ts
  const SPLIT_REGEX = /(\*\*[\s\S]*?\*\*|\*[\s\S]*?\*|__[\s\S]*?__|_[\s\S]*?_|\[\[.*?\|.*?\]\]|\[FIGURA:.*?\]|§H_START§|§H_END§)/g;
  const parts = String(text ?? '').split(SPLIT_REGEX);
  
  let currentOffset = blockOffset;

  return parts.map((part) => {
    if (!part) return '';
    const partLength = part.length;
    const partStart = currentOffset;

    let rendered;

    if (part === '§H_START§') { rendered = '<span class="highlight">'; }
    else if (part === '§H_END§') { rendered = '</span>'; }
    else if (part.startsWith('[FIGURA:') && part.endsWith(']')) {
      const description = part.slice(8, -1).trim();
      rendered = `<div class="figure">
        <div class="figureIcon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <path d="M21 15l-5-5L5 21"></path>
          </svg>
        </div>
        <div class="figureBody">
          <div class="figureLabel">Elemento Visivo Originale</div>
          <div class="figureText">${escapeHtml(description)}</div>
        </div>
      </div>`;
    }
    else if (part.startsWith('[[') && part.endsWith(']]')) {
      const content = part.slice(2, -2);
      const sepIdx = content.indexOf('|');
      const word = sepIdx >= 0 ? content.slice(0, sepIdx) : content;
      const comment = sepIdx >= 0 ? content.slice(sepIdx + 1) : '';
      if (comment.trim().length > 0) {
        const number = footnotes.push(comment.trim());
        rendered = `${applyHighlightsToPlainText(word, partStart + 2, highlights)}<sup class="footnoteRef">${escapeHtml(number)}</sup>`;
      } else {
        rendered = applyHighlightsToPlainText(word, partStart + 2, highlights);
      }
    }
    else if (part.startsWith('**') && part.endsWith('**')) {
      rendered = `<strong class="bold">${applyHighlightsToPlainText(part.slice(2, -2), partStart + 2, highlights)}</strong>`;
    }
    else if (part.startsWith('__') && part.endsWith('__')) {
      rendered = `<strong class="bold">${applyHighlightsToPlainText(part.slice(2, -2), partStart + 2, highlights)}</strong>`;
    }
    else if (part.startsWith('*') && part.endsWith('*')) {
      rendered = `<em class="italic">${applyHighlightsToPlainText(part.slice(1, -1), partStart + 1, highlights)}</em>`;
    }
    else if (part.startsWith('_') && part.endsWith('_')) {
      rendered = `<em class="italic">${applyHighlightsToPlainText(part.slice(1, -1), partStart + 1, highlights)}</em>`;
    }
    else {
      rendered = applyHighlightsToPlainText(part, partStart, highlights);
    }
    
    currentOffset += partLength;
    return rendered;
  }).join('');
};

const renderExportBlocksHtml = (text, highlights, sharedFootnotes) => {
  const footnotes = Array.isArray(sharedFootnotes) ? sharedFootnotes : [];
  const normalized = String(text ?? '').replace(/\r\n/g, '\n');
  const blocks = normalized.split(/(\n{2,})/g); // Keep delimiters to track offset

  let firstParagraph = true;
  let previousWasHeading = false;
  let currentOffset = 0;

  // Note: We are now passing highlights down to renderInlineHtml instead of pre-processing
  // This avoids the complex split/join logic for highlights across blocks, as each block handles its own highlights via offsets.
  
  const html = blocks.map((raw) => {
    const partLength = raw.length;
    const partStart = currentOffset;
    currentOffset += partLength;

    if (raw.match(/^\n{2,}$/)) return ''; // Skip delimiters

    const block = raw.trim();
    if (!block) return '';

    const headingLevel = detectHeadingLevel(block);
    if (headingLevel > 0) {
      const clean = headingLevel <= 3 && block.startsWith('#')
        ? block.replace(/^#{1,3}\s+/, '')
        : block;
      const headingOffset = partStart + (raw.indexOf(clean));
      previousWasHeading = true;
      firstParagraph = false;
      return `<h${headingLevel} class="h${headingLevel}">${renderInlineHtml(clean, footnotes, highlights, headingOffset)}</h${headingLevel}>`;
    }

    const className = (firstParagraph || previousWasHeading) ? 'noIndent' : '';
    const paragraphOffset = partStart + (raw.indexOf(block));
    firstParagraph = false;
    previousWasHeading = false;
    return `<p class="${className}">${renderInlineHtml(block, footnotes, highlights, paragraphOffset)}</p>`;
  }).join('');

  return { html, footnotes };
};

// Deprecated: applyHtmlHighlights is no longer needed as we handle highlights inline
const applyHtmlHighlights = (plain, highlights) => plain;

const postProcessHtml = (html) => {
  // Già gestito da renderInlineHtml ora, ma lo lasciamo per compatibilità
  return String(html ?? '')
    .replace(/§H_START§/g, '<span class="highlight">')
    .replace(/§H_END§/g, '</span>');
};

export const buildExportHtml = ({ bookName, pages, options = {}, pageDims = {} }) => {
  const body = pages.map((p, idx) => {
    const pageNumber = Number(p?.pageNumber) || 0;
    const text = p?.text ?? '';
    const highlights = Array.isArray(p?.highlights) ? p.highlights : [];
    const userNotes = Array.isArray(p?.userNotes) ? p.userNotes : [];
    const PAGE_SPLIT = '[[PAGE_SPLIT]]';
    const splitIntoTwo = Boolean(options?.exportOptions?.splitSpreadIntoTwoPages);
    const insertBlank = Boolean(options?.exportOptions?.insertBlankPages);
    const makeSinglePage = !splitIntoTwo;

    const makePageHtml = ({ contentHtml, footnotes }) => {
      const footnotesHtml = (footnotes && footnotes.length)
        ? `<div class="footnotes">
             <div class="footnoteSeparator"></div>
             <div class="footnoteList">
               ${footnotes.map((note, i) => {
                   const number = i + 1;
                   return `<div class="footnote"><span class="footnoteNumber">${escapeHtml(number)}</span><span class="footnoteText">${escapeHtml(note)}</span></div>`;
               }).join('')}
             </div>
           </div>`
        : '';
      return `
        <div class="page" style="break-after: page; page-break-after: always;">
          <div class="pageInner">
            <div class="content">${postProcessHtml(contentHtml)}</div>
            ${footnotesHtml}
            <div class="pageNumber">${escapeHtml(pageNumber)}</div>
          </div>
        </div>
      `;
    };

    if (String(text).includes(PAGE_SPLIT)) {
      const parts = String(text).split(PAGE_SPLIT);
      const leftRaw = parts[0] ?? '';
      const rightRaw = parts.slice(1).join(PAGE_SPLIT);
      if (makeSinglePage) {
        const shared = [];
        const left = renderExportBlocksHtml(leftRaw || '', highlights, shared);
        const right = renderExportBlocksHtml(rightRaw || '', highlights, shared);
        const userNotesHtml = (userNotes && userNotes.length)
          ? `<div class="footnotes"><div class="footnoteSeparator"></div><div class="footnoteList">${userNotes.map((n, i) => `<div class="footnote"><span class="footnoteNumber">${escapeHtml(i + 1)}</span><span class="footnoteText"><em>${escapeHtml(n.text || '')}</em> — ${escapeHtml(n.content || '')}</span></div>`).join('')}</div></div>`
          : '';
        const content = `<div class="contentTwoCol"><div class="col">${left.html}</div><div class="col">${right.html}</div></div>${userNotesHtml}`;
        return makePageHtml({ contentHtml: content, footnotes: shared });
      }
      const leftShared = [];
      const rightShared = [];
      const left = renderExportBlocksHtml(leftRaw || '', highlights, leftShared);
      const right = renderExportBlocksHtml(rightRaw || '', highlights, rightShared);
      const leftEmpty = !String(leftRaw || '').trim();
      const rightEmpty = !String(rightRaw || '').trim();
      const pagesOut = [];
      if (!leftEmpty) {
        pagesOut.push(makePageHtml({ contentHtml: left.html, footnotes: [] }));
      } else if (insertBlank) {
        pagesOut.push(makePageHtml({ contentHtml: '', footnotes: [] }));
      }
      if (!rightEmpty) {
        const footHtml = rightShared && rightShared.length ? rightShared : [];
        const userNotesHtml = (userNotes && userNotes.length)
          ? `<div class="footnotes"><div class="footnoteSeparator"></div><div class="footnoteList">${userNotes.map((n, i) => `<div class="footnote"><span class="footnoteNumber">${escapeHtml(i + 1)}</span><span class="footnoteText"><em>${escapeHtml(n.text || '')}</em> — ${escapeHtml(n.content || '')}</span></div>`).join('')}</div></div>`
          : '';
        pagesOut.push(makePageHtml({ contentHtml: `${right.html}${userNotesHtml}`, footnotes: footHtml }));
      } else if (insertBlank) {
        pagesOut.push(makePageHtml({ contentHtml: '', footnotes: [] }));
      }
      return pagesOut.join('');
    } else {
      const single = renderExportBlocksHtml(text, highlights);
      const userNotesHtml = (userNotes && userNotes.length)
        ? `<div class="footnotes"><div class="footnoteSeparator"></div><div class="footnoteList">${userNotes.map((n, i) => `<div class="footnote"><span class="footnoteNumber">${escapeHtml(i + 1)}</span><span class="footnoteText"><em>${escapeHtml(n.text || '')}</em> — ${escapeHtml(n.content || '')}</span></div>`).join('')}</div></div>`
        : '';
      return makePageHtml({ contentHtml: `${single.html}${userNotesHtml}`, footnotes: single.footnotes });
    }
  }).join('');

  return `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Esportazione PDF</title>
    <style>
      @page { size: A4; margin: 0; }
      html, body { margin: 0; padding: 0; background: #ffffff; }
      .page {
        width: 210mm;
        height: 297mm;
        background: #ffffff;
        box-sizing: border-box;
        padding: 22mm 24mm 28mm 24mm;
        font-family: "Literata", "Iowan Old Style", Palatino, "Palatino Linotype", "Book Antiqua", Georgia, Cambria, "Times New Roman", Times, serif;
        font-size: 11.5pt;
        line-height: 1.55;
        color: #1a1a1a;
        position: relative;
        overflow: visible;
        break-inside: avoid;
        page-break-inside: avoid;
        font-kerning: normal;
        font-feature-settings: "kern" 1, "liga" 1, "clig" 1, "calt" 1, "onum" 1;
        letter-spacing: 0.005em;
        text-rendering: optimizeLegibility;
      }
      .pageInner { position: relative; width: 100%; height: 100%; }
      .content { color: #1f2937; text-align: justify; hyphens: auto; padding-bottom: 22mm; max-width: 70ch; margin: 0 auto; }
      .contentTwoCol { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
      .contentTwoCol .col { text-align: justify; hyphens: auto; }
      p { margin: 0; text-indent: 1.2em; margin-bottom: 0.15em; }
      p.noIndent { text-indent: 0; }
      h1, h2, h3 { margin: 0; page-break-after: avoid; break-after: avoid-page; }
      h1 { font-weight: 600; letter-spacing: 0.01em; padding-bottom: 3mm; border-bottom: 0.5pt solid rgba(0,0,0,0.5); margin-top: 16mm; margin-bottom: 8mm; font-size: 1.6em; }
      h2 { font-weight: 600; letter-spacing: 0.01em; margin-top: 10mm; margin-bottom: 5mm; font-size: 1.3em; }
      h3 { font-weight: 600; margin-top: 8mm; margin-bottom: 3mm; font-size: 1.15em; }
      .bold { font-weight: 600; }
      .italic { font-style: italic; }
      .highlight { background: rgba(250, 204, 21, 0.3); print-color-adjust: exact; -webkit-print-color-adjust: exact; border-radius: 2px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
      .footnoteRef { font-size: 0.72em; vertical-align: super; font-weight: 600; }
      .footnotes { position: absolute; left: 0; right: 0; bottom: 0; }
      .footnoteSeparator { width: 40mm; border-top: 0.5pt solid rgba(0,0,0,0.5); margin-bottom: 3mm; }
      .footnoteList { display: flex; flex-direction: column; gap: 0mm; padding-bottom: 8mm; }
      .footnote { display: flex; gap: 3mm; font-size: 8.5pt; line-height: 1.35; color: rgba(0,0,0,0.8); margin-bottom: 1.5mm; }
      .footnoteNumber { min-width: 4.5mm; text-align: right; font-weight: 600; }
      .footnoteText { flex: 1 1 auto; padding-left: 2.5mm; text-indent: -4.5mm; display: block; text-align: justify; hyphens: auto; }
      .pageNumber { position: absolute; right: 0; bottom: 0; font-size: 8.5pt; color: rgba(0,0,0,0.5); }
      .figure {
        margin: 20pt 0;
        padding: 14pt;
        background: #fafafa;
        border: 0.5pt solid #e5e5e5;
        border-left: 3pt solid #6b7280;
        display: flex;
        align-items: flex-start;
        gap: 14pt;
        page-break-inside: avoid;
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      .figureIcon {
        margin-top: 3pt;
        padding: 7pt;
        background: rgba(107, 114, 128, 0.08);
        color: #6b7280;
        border-radius: 4pt;
        flex: 0 0 auto;
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      .figureBody { display: flex; flex-direction: column; gap: 3pt; min-width: 0; }
      .figureLabel {
        font-size: 7.5pt;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #6b7280;
      }
      .figureText { font-size: 10.5pt; font-style: italic; color: #4b5563; }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`;
};
