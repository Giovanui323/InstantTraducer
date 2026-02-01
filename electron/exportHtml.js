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

const renderInlineHtml = (text, footnotes) => {
  const parts = String(text ?? '').split(/(\*\*.*?\*\*|\*.*?\*|\[\[.*?\]\]|\[FIGURA:.*?\])/g);
  return parts.map((part) => {
    if (!part) return '';
    if (part.startsWith('[FIGURA:') && part.endsWith(']')) {
      const description = part.slice(8, -1).trim();
      return `<div class="figure">
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
    if (part.startsWith('[[') && part.endsWith(']]')) {
      const content = part.slice(2, -2);
      const sepIdx = content.indexOf('|');
      const word = sepIdx >= 0 ? content.slice(0, sepIdx) : content;
      const comment = sepIdx >= 0 ? content.slice(sepIdx + 1) : '';
      if (comment.trim().length > 0) {
        const number = footnotes.push(comment.trim());
        return `${escapeHtml(word)}<sup class="footnoteRef">${escapeHtml(number)}</sup>`;
      }
      return escapeHtml(word);
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return `<strong class="bold">${escapeHtml(part.slice(2, -2))}</strong>`;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return `<em class="italic">${escapeHtml(part.slice(1, -1))}</em>`;
    }
    return escapeHtml(part);
  }).join('');
};

const renderExportBlocksHtml = (text, sharedFootnotes) => {
  const footnotes = Array.isArray(sharedFootnotes) ? sharedFootnotes : [];
  const normalized = String(text ?? '').replace(/\r\n/g, '\n');
  const blocks = normalized.split(/\n{2,}/g);

  let firstParagraph = true;
  let previousWasHeading = false;
  const html = blocks.map((raw) => {
    const block = String(raw ?? '').trim();
    if (!block) return '';

    const headingLevel = detectHeadingLevel(block);
    if (headingLevel > 0) {
      const clean = headingLevel <= 3 && block.startsWith('#')
        ? block.replace(/^#{1,3}\s+/, '')
        : block;
      previousWasHeading = true;
      firstParagraph = false;
      return `<h${headingLevel} class="h${headingLevel}">${renderInlineHtml(clean, footnotes)}</h${headingLevel}>`;
    }

    const className = (firstParagraph || previousWasHeading) ? 'noIndent' : '';
    firstParagraph = false;
    previousWasHeading = false;
    return `<p class="${className}">${renderInlineHtml(block, footnotes)}</p>`;
  }).join('');

  return { html, footnotes };
};

const applyHtmlHighlights = (plain, highlights) => {
  const hs = Array.isArray(highlights) ? highlights.filter(h => Number.isFinite(h?.start) && Number.isFinite(h?.end) && h.end > h.start).sort((a, b) => a.start - b.start) : [];
  if (hs.length === 0) return plain;
  let out = '';
  let cursor = 0;
  for (const h of hs) {
    const start = Math.max(0, Math.min(Number(h.start), plain.length));
    const end = Math.max(start, Math.min(Number(h.end), plain.length));
    if (start > cursor) out += plain.slice(cursor, start);
    out += `<span class="highlight">${escapeHtml(plain.slice(start, end))}</span>`;
    cursor = end;
  }
  if (cursor < plain.length) out += plain.slice(cursor);
  return out;
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
            <div class="content">${contentHtml}</div>
            ${footnotesHtml}
            <div class="pageNumber">${escapeHtml(pageNumber)}</div>
          </div>
        </div>
      `;
    };

    if (String(text).includes(PAGE_SPLIT)) {
      const [leftRaw, rightRaw] = String(text).split(PAGE_SPLIT);
      if (makeSinglePage) {
        const shared = [];
        const left = renderExportBlocksHtml(applyHtmlHighlights(leftRaw || '', highlights), shared);
        const right = renderExportBlocksHtml(applyHtmlHighlights(rightRaw || '', highlights), shared);
        const userNotesHtml = (userNotes && userNotes.length)
          ? `<div class="footnotes"><div class="footnoteSeparator"></div><div class="footnoteList">${userNotes.map((n, i) => `<div class="footnote"><span class="footnoteNumber">${escapeHtml(i + 1)}</span><span class="footnoteText"><em>${escapeHtml(n.text || '')}</em> — ${escapeHtml(n.content || '')}</span></div>`).join('')}</div></div>`
          : '';
        const content = `<div class="contentTwoCol"><div class="col">${left.html}</div><div class="col">${right.html}</div></div>${userNotesHtml}`;
        return makePageHtml({ contentHtml: content, footnotes: shared });
      }
      const leftShared = [];
      const rightShared = [];
      const left = renderExportBlocksHtml(applyHtmlHighlights(leftRaw || '', highlights), leftShared);
      const right = renderExportBlocksHtml(applyHtmlHighlights(rightRaw || '', highlights), rightShared);
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
      const single = renderExportBlocksHtml(applyHtmlHighlights(text, highlights));
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
        padding: 25mm 25mm 30mm 25mm;
        font-family: "Iowan Old Style", Palatino, "Palatino Linotype", "Book Antiqua", Georgia, Cambria, "Times New Roman", Times, serif;
        font-size: 12pt;
        line-height: 1.5;
        color: #1a1a1a;
        position: relative;
        overflow: visible;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .pageInner { position: relative; width: 100%; height: 100%; }
      .content { color: rgb(17, 24, 39); text-align: justify; hyphens: auto; padding-bottom: 22mm; }
      .contentTwoCol { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; }
      .contentTwoCol .col { text-align: justify; hyphens: auto; }
      p { margin: 0; text-indent: 1.2em; margin-bottom: 0.2em; }
      p.noIndent { text-indent: 0; }
      h1, h2, h3 { margin: 0; page-break-after: avoid; break-after: avoid-page; }
      h1 { text-transform: uppercase; font-weight: 700; letter-spacing: 0.02em; padding-bottom: 4mm; border-bottom: 0.6pt solid rgba(0,0,0,0.6); margin-top: 18mm; margin-bottom: 10mm; font-size: 1.8em; }
      h2 { text-transform: uppercase; font-weight: 700; letter-spacing: 0.02em; margin-top: 12mm; margin-bottom: 6mm; font-size: 1.4em; }
      h3 { font-weight: 700; margin-top: 10mm; margin-bottom: 4mm; font-size: 1.2em; }
      .bold { font-weight: 700; }
      .italic { font-style: italic; }
      .highlight { background: rgba(250, 204, 21, 0.25); }
      .footnoteRef { font-size: 0.75em; vertical-align: super; }
      .footnotes { position: absolute; left: 0; right: 0; bottom: 0; }
      .footnoteSeparator { width: 45mm; border-top: 0.6pt solid rgba(0,0,0,0.6); margin-bottom: 3mm; }
      .footnoteList { display: flex; flex-direction: column; gap: 0mm; padding-bottom: 8mm; }
      .footnote { display: flex; gap: 3mm; font-size: 9pt; line-height: 1.3; color: rgba(0,0,0,0.85); margin-bottom: 2mm; }
      .footnoteNumber { min-width: 5mm; text-align: right; font-weight: bold; }
      .footnoteText { flex: 1 1 auto; padding-left: 3mm; text-indent: -5mm; display: block; }
      .pageNumber { position: absolute; right: 0; bottom: 0; font-size: 9pt; color: rgba(0,0,0,0.6); }
      .figure {
        margin: 24pt 0;
        padding: 16pt;
        background: #ffffff;
        border: 0.5pt solid #e2e2e2;
        border-left: 4pt solid #007AFF;
        display: flex;
        align-items: flex-start;
        gap: 16pt;
        page-break-inside: avoid;
      }
      .figureIcon {
        margin-top: 4pt;
        padding: 8pt;
        background: rgba(0, 122, 255, 0.1);
        color: #007AFF;
        border-radius: 4pt;
        flex: 0 0 auto;
      }
      .figureBody { display: flex; flex-direction: column; gap: 4pt; min-width: 0; }
      .figureLabel {
        font-size: 8pt;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #007AFF;
      }
      .figureText { font-size: 11pt; font-style: italic; color: #4b5563; }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`;
};
