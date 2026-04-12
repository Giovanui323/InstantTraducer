
import { getSplitRegex, getInlineSplitRegex } from './highlightSelectors';

export interface VisibleTextInfo {
  length: number;
  notesCount: number;
}

/**
 * Calcola la lunghezza visibile del testo e il numero di note presenti.
 * Questa logica deve essere identica tra MarkdownText (schermo) e il calcolo degli offset (selezione).
 */
export function calculateVisibleLength(part: string): VisibleTextInfo {
  let length = 0;
  let notesCount = 0;

  if (part.startsWith('[FIGURA:') && part.endsWith(']')) {
    return { length: 0, notesCount: 0 };
  }

  if (part.startsWith('[[') && part.endsWith(']]')) {
    const content = part.slice(2, -2);
    if (content === 'PAGE_SPLIT') return { length: 0, notesCount: 0 };
    
    const [wordRaw, commentRaw] = content.split('|');
    const word = (wordRaw || '').trim();
    const comment = (commentRaw || '').trim();

    length += word.length;
    if (comment.length > 0) {
      notesCount += 1;
    }
    return { length, notesCount };
  }

  const regex = getInlineSplitRegex();
  const subParts = part.split(regex);
  
  if (subParts.length > 1 || (subParts.length === 1 && subParts[0] !== part)) {
    for (const sub of subParts) {
      if (!sub) continue;

      if ((sub.startsWith('**') && sub.endsWith('**')) || (sub.startsWith('__') && sub.endsWith('__'))) {
        const res = calculateVisibleLength(sub.slice(2, -2));
        length += res.length;
        notesCount += res.notesCount;
      } else if ((sub.startsWith('*') && sub.endsWith('*')) || (sub.startsWith('_') && sub.endsWith('_'))) {
        const res = calculateVisibleLength(sub.slice(1, -1));
        length += res.length;
        notesCount += res.notesCount;
      } else if (sub.startsWith('[[') && sub.endsWith(']]')) {
        const res = calculateVisibleLength(sub);
        length += res.length;
        notesCount += res.notesCount;
      } else {
        length += sub.length;
      }
    }
    return { length, notesCount };
  }

  return { length: part.length, notesCount: 0 };
}

/**
 * Versione semplificata che restituisce solo la lunghezza visibile.
 * Usata da highlightSelectors per buildSelectableText.
 */
export function getVisibleLength(text: string): number {
  return calculateVisibleLength(text).length;
}
