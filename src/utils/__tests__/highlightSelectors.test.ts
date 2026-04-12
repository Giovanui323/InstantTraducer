import { describe, expect, it } from 'vitest';
import { buildSelectableText, resolveHighlightsByQuote } from '../highlightSelectors';
import type { UserHighlight } from '../../types';

describe('buildSelectableText', () => {
  it('rimuove marker e mantiene il testo selezionabile', () => {
    const input = 'Uno **due** [[tre|nota]] [FIGURA: immagine]\n\nQuattro';
    const out = buildSelectableText(input, false);
    expect(out).toContain('Uno due tre ');
    expect(out).toContain('\n');
    expect(out).toContain('Quattro');
    expect(out).not.toContain('FIGURA');
    expect(out).not.toContain('[[');
  });
});

describe('resolveHighlightsByQuote', () => {
  it('risolve la posizione con exact+prefix+suffix quando start/end non combaciano', () => {
    const selectableText = 'abc def ghi def xyz';
    const h: UserHighlight = {
      id: 'h1',
      page: 1,
      start: 0,
      end: 3,
      text: 'def',
      quoteExact: 'def',
      quotePrefix: 'ghi ',
      quoteSuffix: ' xyz',
      createdAt: Date.now(),
      color: 'yellow'
    };
    const [resolved] = resolveHighlightsByQuote([h], selectableText, 0);
    expect(selectableText.slice(resolved.start, resolved.end)).toBe('def');
    expect(resolved.start).toBe(12);
    expect(resolved.end).toBe(15);
  });

  it('completa quoteExact/prefix/suffix per highlight vecchi quando lo slice combacia', () => {
    const selectableText = 'Testo\nAltro';
    const h: UserHighlight = {
      id: 'h1',
      page: 1,
      start: 0,
      end: 5,
      text: 'Testo',
      createdAt: Date.now()
    };
    const [resolved] = resolveHighlightsByQuote([h], selectableText, 0);
    expect(resolved.quoteExact).toBe('Testo');
    expect(resolved.quotePrefix).toBe('');
    expect(resolved.quoteSuffix).toContain('\nAltro');
  });
});

