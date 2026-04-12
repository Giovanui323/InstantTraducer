
/**
 * Utility per il parsing e la gestione delle note a piè di pagina (footnotes)
 */

export interface ParsedFootnote {
  n: string;
  text: string;
}

/**
 * Divide il testo in corpo e sezione note, cercando il separatore standard (linea orizzontale)
 */
export function splitByFootnoteSeparator(text: string) {
  // 1. Cerca il separatore esplicito (Markdown horizontal rule)
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

  // 2. Fallback: Cerca di individuare un blocco di note numerate alla fine (1, 2, 3...)
  const footnoteBlockRe = /(?:^|\n)\s*(?:1[.\s]|\^1\s?)(?:.|\n)*?(?:^|\n)\s*(?:2[.\s]|\^2\s?)(?:.|\n)*$/;
  const blockMatch = footnoteBlockRe.exec(text);

  if (blockMatch && blockMatch.index != null) {
    // Applichiamo un'euristica: il blocco deve essere nella seconda metà del testo o il testo deve essere corto
    if (blockMatch.index > text.length * 0.3 || text.length < 1000) {
      return {
        body: text.slice(0, blockMatch.index).trimEnd(),
        footnotes: text.slice(blockMatch.index).trim()
      };
    }
  }

  return null;
}

/**
 * Parsa una stringa contenente note (es. "1. nota 2. altra nota") in un array di oggetti
 */
export function parseFootnotes(text: string): ParsedFootnote[] {
  if (!text) return [];
  const compact = text.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!compact) return [];

  const superscripts: Record<string, string> = {
    '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
    '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9'
  };
  const normalizeNum = (s: string) => s.split('').map(c => superscripts[c] || c).join('');

  const candidateRe = /(?:^|\s)(\d{1,4}|[⁰¹²³⁴⁵⁶⁷⁸⁹]{1,4})(?:\.|\s)/g;

  const candidates: Array<{ n: number; raw: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = candidateRe.exec(compact)) !== null) {
    const n = Number(normalizeNum(m[1]));
    const start = m.index + (m[0].startsWith(' ') ? 1 : 0);
    const end = start + m[1].length;

    if (!Number.isFinite(n)) continue;
    if (!isFootnoteMarkerContext(compact, start)) continue;
    candidates.push({ n, raw: m[1], start, end });
  }

  if (candidates.length === 0) return [{ n: '', text: compact }];

  const best = pickBestSequentialRun(candidates);
  if (!best) return [{ n: '', text: compact }];

  const out: ParsedFootnote[] = [];
  for (let i = 0; i < best.length; i++) {
    const curr = best[i];
    const next = best[i + 1];

    let textStart = curr.end;
    if (compact[textStart] === '.') textStart++;

    const textEnd = next ? next.start : compact.length;
    const chunkText = compact.slice(textStart, textEnd).trim();

    if (chunkText.length === 0 && !next) continue;
    out.push({ n: curr.raw, text: chunkText });
  }

  return out.length > 0 ? out : [{ n: '', text: compact }];
}

function isFootnoteMarkerContext(text: string, start: number) {
  if (start === 0) return true;

  const before = text.slice(Math.max(0, start - 8), start);
  const after = text.slice(start, Math.min(text.length, start + 12));

  // Se preceduto da punteggiatura di fine frase, è probabile sia una nota
  if (/[.;:)\]]\s*$/.test(before)) return true;

  // Esclusioni legali/comuni (es. "Art. 1", "§ 1", "Rn. 1")
  if (/\b(?:Art\.|Art|Artikel)\s*$/.test(before)) return false;
  if (/§\s*$/.test(before)) return false;
  if (/\bRn\.?\s*$/.test(before)) return false;

  // Se seguito da "Rn.", probabilmente è un riferimento a un paragrafo/marginale
  if (/^\d+\s*\bRn\./.test(after)) return false;

  return true;
}

function pickBestSequentialRun<T extends { n: number; start: number; end: number }>(candidates: T[]): T[] | null {
  const sorted = [...candidates].sort((a, b) => a.start - b.start);

  let best: T[] | null = null;
  let bestScore = -1;

  for (let i = 0; i < sorted.length; i++) {
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

    const score = run.length * 10 - (startCandidate.n * 0.1);
    if (score > bestScore) {
      bestScore = score;
      best = run;
    }
  }
  return best;
}

/**
 * Conta quante note di tipo [[word|comment]] sono presenti in un testo
 */
export function countInlineNotes(text: string): number {
  if (!text) return 0;
  const matches = text.match(/\[\[.*?\|.*?\]\]/g);
  return matches ? matches.length : 0;
}
