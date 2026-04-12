import { UserHighlight } from '../types';

export const INLINE_PATTERN = '\\*\\*[\\s\\S]*?\\*\\*|\\*[\\s\\S]*?\\*|__[\\s\\S]*?__|_[\\s\\S]*?_|\\[\\[.*?\\|.*?\\]\\]';
// Export regex factories instead of stateful global instances to avoid lastIndex issues
export const getInlineSplitRegex = () => new RegExp(`(${INLINE_PATTERN})`, 'g');
export const getSplitRegex = () => new RegExp(`(${INLINE_PATTERN}|\\[FIGURA:.*?\\])`, 'g');

export function buildSelectableText(text: string, preserveLayout: boolean) {
  const paragraphs = text.split(/\n\s*\n/);
  const out: string[] = [];
  for (const raw of paragraphs) {
    const paragraphText = preserveLayout ? raw : raw.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (!paragraphText) continue;
    const plain = plainFromParagraph(paragraphText);
    // Skip paragraphs that are entirely ignored (like Figures) to match MarkdownText.tsx rendering
    if (!plain && paragraphText.startsWith('[FIGURA:') && paragraphText.endsWith(']')) continue;
    out.push(plain);
  }
  return out.join('\n');
}

export function resolveHighlightsByQuote(
  highlights: UserHighlight[],
  selectableText: string,
  baseOffset: number,
  _pageWidth?: number,
  _pageHeight?: number,
  _scale?: number,
  _containerElement?: HTMLElement
) {
  return highlights.map((h) => resolveHighlightByQuote(h, selectableText, baseOffset));
}

const QUOTE_CONTEXT_LEN = 32;

function plainFromParagraph(paragraphText: string) {
  return getStringFromPart(paragraphText);
}

function getStringFromPart(part: string): string {
  if (part.startsWith('[FIGURA:') && part.endsWith(']')) return '';
  if (part.startsWith('[[') && part.endsWith(']]')) {
    const content = part.slice(2, -2);
    if (content === 'PAGE_SPLIT') return '';
    const [wordRaw] = content.split('|');
    return (wordRaw || '').trim();
  }

  const regex = getSplitRegex();
  const subParts = part.split(regex);

  if (subParts.length > 1 || (subParts.length === 1 && subParts[0] !== part)) {
    let out = '';
    for (const sub of subParts) {
      if (!sub) continue;
      if (sub.startsWith('[FIGURA:') && sub.endsWith(']')) continue;

      if ((sub.startsWith('**') && sub.endsWith('**')) || (sub.startsWith('__') && sub.endsWith('__'))) {
        out += getStringFromPart(sub.slice(2, -2));
      } else if ((sub.startsWith('*') && sub.endsWith('*')) || (sub.startsWith('_') && sub.endsWith('_'))) {
        out += getStringFromPart(sub.slice(1, -1));
      } else if (sub.startsWith('[[') && sub.endsWith(']]')) {
        out += getStringFromPart(sub);
      } else {
        out += sub;
      }
    }
    return out;
  }

  return part;
}

/**
 * Quote-First highlight resolution (W3C Web Annotation Model).
 * 
 * Resolution order:
 * 1. Quote matching with prefix/suffix context (primary)
 * 2. Offset hint as tie-breaker when multiple matches exist
 * 3. Fuzzy matching when exact match fails (resilient to small text changes)
 */
function resolveHighlightByQuote(
  h: UserHighlight,
  selectableText: string,
  baseOffset: number
) {
  const exact = (h.quoteExact ?? h.text) || '';
  if (!exact) return h;

  // Offset hint for disambiguation (NOT primary)
  const offsetHint = Number.isFinite(h.start) ? h.start - baseOffset : null;

  // Step 1: Try exact quote matching with context scoring
  const bestExact = findBestQuoteMatch(selectableText, exact, h.quotePrefix, h.quoteSuffix, offsetHint);
  if (bestExact !== null) {
    return buildResolved(h, selectableText, baseOffset, bestExact, exact.length);
  }

  // Step 2: Try normalized matching (collapse whitespace)
  const normalizedExact = normalizeWS(exact);
  if (normalizedExact !== exact && normalizedExact.length > 0) {
    const normalizedText = normalizeWS(selectableText);
    const bestNorm = findBestQuoteMatch(
      normalizedText,
      normalizedExact,
      h.quotePrefix ? normalizeWS(h.quotePrefix) : undefined,
      h.quoteSuffix ? normalizeWS(h.quoteSuffix) : undefined,
      offsetHint
    );
    if (bestNorm !== null) {
      // Map normalized position back to original text
      const originalPos = mapNormalizedPosition(selectableText, normalizedText, bestNorm, normalizedExact.length);
      if (originalPos !== null) {
        return buildResolved(h, selectableText, baseOffset, originalPos.start, originalPos.length);
      }
    }
  }

  // Step 3: Fuzzy matching — find best approximate match
  if (exact.length >= 8) { // Only for non-trivial strings
    const bestFuzzy = findFuzzyMatch(selectableText, exact, offsetHint);
    if (bestFuzzy !== null) {
      return buildResolved(h, selectableText, baseOffset, bestFuzzy.start, bestFuzzy.length);
    }
  }

  // Step 4: If stored offsets point to valid text, use as last resort
  const localStart = (offsetHint != null && offsetHint >= 0) ? offsetHint : -1;
  const localEnd = localStart >= 0 ? localStart + exact.length : -1;
  if (localStart >= 0 && localEnd <= selectableText.length) {
    return buildResolved(h, selectableText, baseOffset, localStart, exact.length);
  }

  return h; // Cannot anchor — return as-is
}

/** Build a resolved highlight with updated offsets and fresh context */
function buildResolved(
  h: UserHighlight,
  selectableText: string,
  baseOffset: number,
  localStart: number,
  length: number
): UserHighlight {
  const localEnd = localStart + length;
  const preStart = Math.max(0, localStart - QUOTE_CONTEXT_LEN);
  const sufEnd = Math.min(selectableText.length, localEnd + QUOTE_CONTEXT_LEN);
  const resolvedExact = selectableText.slice(localStart, localEnd);
  return {
    ...h,
    start: baseOffset + localStart,
    end: baseOffset + localEnd,
    quoteExact: resolvedExact || h.quoteExact || h.text,
    quotePrefix: selectableText.slice(preStart, localStart),
    quoteSuffix: selectableText.slice(localEnd, sufEnd)
  };
}

/** Collapse multiple whitespace into single spaces and trim */
function normalizeWS(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Map a position in normalized (whitespace-collapsed) text back to the original text.
 * Returns { start, length } in original text coordinates.
 */
function mapNormalizedPosition(
  original: string,
  _normalized: string,
  normStart: number,
  normLength: number
): { start: number; length: number } | null {
  // Walk both strings in sync
  let oi = 0; // original index
  let ni = 0; // normalized index
  let mappedStart = -1;

  while (oi < original.length && ni < normStart + normLength) {
    // Skip extra whitespace in original
    if (/\s/.test(original[oi]) && (oi === 0 || /\s/.test(original[oi - 1]))) {
      // In normalized, multiple spaces become one. Skip extra spaces in original.
      if (ni > 0 || /\s/.test(original[oi])) {
        // Check if this is an extra space that was collapsed
        const nextNonSpace = original.slice(oi).search(/\S/);
        if (nextNonSpace > 1) {
          oi += nextNonSpace - 1; // Skip to last space before non-space
        }
      }
    }

    if (ni === normStart && mappedStart === -1) {
      mappedStart = oi;
    }

    if (ni >= normStart + normLength) break;

    oi++;
    ni++;
  }

  if (mappedStart === -1) return null;
  const mappedEnd = oi;
  return { start: mappedStart, length: mappedEnd - mappedStart };
}

/**
 * Find the best position of `exact` in `haystack` using context scoring.
 * 
 * Scoring:
 * - Prefix/suffix overlap (0-10 points each, proportional to match length)
 * - Offset proximity hint (small penalty for distance, max -5 points)
 * - Exact prefix/suffix match gets bonus points
 */
function findBestQuoteMatch(
  haystack: string,
  exact: string,
  prefix?: string,
  suffix?: string,
  near?: number | null
): number | null {
  if (!exact) return null;

  let idx = haystack.indexOf(exact);
  if (idx === -1) return null;

  // Collect all candidate positions
  const candidates: number[] = [];
  while (idx !== -1) {
    candidates.push(idx);
    idx = haystack.indexOf(exact, idx + 1);
  }

  // Single match — return immediately (no disambiguation needed)
  if (candidates.length === 1) return candidates[0];

  // Score each candidate
  let bestStart: number | null = null;
  let bestScore = -Infinity;

  for (const start of candidates) {
    let score = 0;

    // Prefix scoring (0-12 points): proportional overlap with bonus for exact match
    if (typeof prefix === 'string' && prefix.length > 0) {
      const maxPrefixLen = Math.min(prefix.length, start);
      if (maxPrefixLen > 0) {
        const actualPrefix = haystack.slice(start - maxPrefixLen, start);
        const expectedPrefix = prefix.slice(prefix.length - maxPrefixLen);
        const overlap = computeOverlapScore(expectedPrefix, actualPrefix);
        score += overlap * 10; // 0-10 proportional
        if (overlap === 1.0) score += 2; // Exact match bonus
      }
    }

    // Suffix scoring (0-12 points): proportional overlap with bonus for exact match
    if (typeof suffix === 'string' && suffix.length > 0) {
      const sufStart = start + exact.length;
      const maxSuffixLen = Math.min(suffix.length, haystack.length - sufStart);
      if (maxSuffixLen > 0) {
        const actualSuffix = haystack.slice(sufStart, sufStart + maxSuffixLen);
        const expectedSuffix = suffix.slice(0, maxSuffixLen);
        const overlap = computeOverlapScore(expectedSuffix, actualSuffix);
        score += overlap * 10;
        if (overlap === 1.0) score += 2;
      }
    }

    // Offset proximity hint (max -5 points penalty)
    if (typeof near === 'number' && Number.isFinite(near)) {
      const distance = Math.abs(start - near);
      score -= Math.min(5, distance / 100); // Gentle penalty
    }

    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }

  return bestStart;
}

/**
 * Compute overlap score between two strings (0.0 = no overlap, 1.0 = identical).
 * Uses character-by-character comparison from the matching end.
 */
function computeOverlapScore(expected: string, actual: string): number {
  if (expected === actual) return 1.0;
  const len = Math.min(expected.length, actual.length);
  if (len === 0) return 0;
  let matching = 0;
  for (let i = 0; i < len; i++) {
    if (expected[i] === actual[i]) matching++;
  }
  return matching / len;
}

/**
 * Fuzzy matching: find the best approximate match of `needle` in `haystack`.
 * Uses sliding window with Levenshtein-like similarity scoring.
 * Only accepts matches with ≥70% similarity.
 */
function findFuzzyMatch(
  haystack: string,
  needle: string,
  near?: number | null
): { start: number; length: number } | null {
  const needleLen = needle.length;
  if (needleLen === 0 || haystack.length === 0) return null;

  // Search within a reasonable window around the hint, or the full text
  const searchRadius = Math.min(haystack.length, Math.max(500, needleLen * 10));
  const center = (typeof near === 'number' && Number.isFinite(near))
    ? Math.max(0, Math.min(near, haystack.length - needleLen))
    : Math.floor(haystack.length / 2);
  const searchStart = Math.max(0, center - searchRadius);
  const searchEnd = Math.min(haystack.length, center + searchRadius);

  // Window sizes to try: exact length, ±10%
  const windowSizes = [
    needleLen,
    Math.max(1, Math.floor(needleLen * 0.9)),
    Math.ceil(needleLen * 1.1)
  ];

  let bestScore = 0.7; // Minimum threshold
  let bestStart = -1;
  let bestLen = needleLen;
  const step = Math.max(1, Math.floor(needleLen / 4)); // Skip some positions for performance

  for (const winLen of windowSizes) {
    for (let i = searchStart; i + winLen <= searchEnd; i += step) {
      const candidate = haystack.slice(i, i + winLen);
      const sim = computeSimilarity(needle, candidate);
      if (sim > bestScore) {
        bestScore = sim;
        bestStart = i;
        bestLen = winLen;
        if (sim > 0.95) break; // Good enough
      }
    }
    if (bestScore > 0.95) break;
  }

  // Refine: if we found a good match with step > 1, search nearby positions exactly
  if (bestStart >= 0 && step > 1) {
    const refineStart = Math.max(searchStart, bestStart - step);
    const refineEnd = Math.min(searchEnd, bestStart + step);
    for (let i = refineStart; i + bestLen <= refineEnd; i++) {
      const candidate = haystack.slice(i, i + bestLen);
      const sim = computeSimilarity(needle, candidate);
      if (sim > bestScore) {
        bestScore = sim;
        bestStart = i;
      }
    }
  }

  if (bestStart === -1) return null;
  return { start: bestStart, length: bestLen };
}

/**
 * Fast similarity score between two strings (0.0-1.0).
 * Uses bigram overlap (Dice coefficient) for speed — O(n) instead of O(n²) Levenshtein.
 */
function computeSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0;
  if (a.length === 1 && b.length === 1) return a === b ? 1 : 0;

  // Bigram Dice coefficient
  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a[i] + a[i + 1]);

  let intersection = 0;
  const bigramsB = new Set<string>();
  for (let i = 0; i < b.length - 1; i++) {
    const bigram = b[i] + b[i + 1];
    bigramsB.add(bigram);
    if (bigramsA.has(bigram)) intersection++;
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}
