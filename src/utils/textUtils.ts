export const countWords = (text: string) => (text.trim().match(/\S+/g) || []).length;
export const countParagraphs = (text: string) => text.split(/\n\s*\n/).filter(Boolean).length;

export const PAGE_SPLIT = '[[PAGE_SPLIT]]';

export function normalize(text: string) {
  return text.replace(/\r\n/g, '\n').replace(/\t/g, ' ').replace(/ {2,}/g, ' ').trim();
}

/**
 * Sanifica un campo di metadati (titolo, autore, anno) per l'uso in un nome file.
 * Rimuove i caratteri illegali per il file system ma mantiene la leggibilità.
 */
export function sanitizeMetadataField(s: string) {
  if (!s) return "";
  return s
    .replace(/[/\\?%*:|"<>]/g, '-') // Sostituisce i caratteri proibiti nei nomi file con '-'
    .replace(/\s+/g, ' ')           // Normalizza gli spazi
    .trim();
}

export function splitColumns(text: string) {
  const hasSplit = text.includes(PAGE_SPLIT);
  if (!hasSplit) return [text];
  const parts = text.split(PAGE_SPLIT);
  const left = parts[0] ?? '';
  const right = parts.slice(1).join(PAGE_SPLIT);
  return [left, right];
}

function splitByFootnoteSeparator(text: string) {
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
  return null;
}

function hasFootnoteRefs(text: string) {
  return /[\u00B9\u00B2\u00B3\u2070-\u2079]|\^\d{1,4}\b/.test(text);
}

export function normalizePageSplitFootnotes(text: string) {
  if (!text.includes(PAGE_SPLIT)) return text;
  const parts = splitColumns(text);
  if (parts.length < 2) return text;
  const left = parts[0] ?? '';
  const right = parts[1] ?? '';

  const leftFoot = splitByFootnoteSeparator(left);
  const rightFoot = splitByFootnoteSeparator(right);
  if (leftFoot || !rightFoot) return text;
  if (!rightFoot.footnotes) return text;

  if (hasFootnoteRefs(left) && !hasFootnoteRefs(rightFoot.body)) {
    const newLeft = `${left.trimEnd()}\n\n---\n${rightFoot.footnotes}\n`;
    const newRight = rightFoot.body.trim();
    return `${newLeft}${PAGE_SPLIT}${newRight}`;
  }

  return text;
}
