import { describe, it, expect } from 'vitest';
import { normalizeHighlights } from '../src/utils/textSelection';

describe('normalizeHighlights', () => {
  it('normalizes and sorts highlights correctly', () => {
    const sample = [
      { id: 'a', page: 1, start: 10, end: 20, text: 'foo', createdAt: Date.now() },
      { id: 'b', page: 1, start: 5, end: 8, text: 'bar', createdAt: Date.now() },
      { id: 'c', page: 1, start: 8, end: 8, text: 'baz', createdAt: Date.now() } // invalid
    ] as any[];

    const out = normalizeHighlights(sample as any);
    expect(out.length).toBe(2);
    expect(out[0].id).toBe('b');
    expect(out[1].id).toBe('a');
  });
});
