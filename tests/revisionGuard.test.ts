import { describe, it, expect } from 'vitest';
import { createRevisionGuard } from '../electron/revisionGuard.js';

describe('revisionGuard', () => {
  it('scarta revision più vecchie per lo stesso fileId', () => {
    const guard = createRevisionGuard();

    const a1 = guard.checkAndUpdate('a.json', 10);
    expect(a1.skip).toBe(false);

    const a2 = guard.checkAndUpdate('a.json', 9);
    expect(a2.skip).toBe(true);
    expect(a2.highestSeen).toBe(10);

    const a3 = guard.checkAndUpdate('a.json', 10);
    expect(a3.skip).toBe(false);

    const a4 = guard.checkAndUpdate('a.json', 11);
    expect(a4.skip).toBe(false);
  });

  it('tiene revision separate per fileId diversi', () => {
    const guard = createRevisionGuard();

    expect(guard.checkAndUpdate('a.json', 5).skip).toBe(false);
    expect(guard.checkAndUpdate('b.json', 1).skip).toBe(false);
    expect(guard.checkAndUpdate('b.json', 0).skip).toBe(true);
    expect(guard.checkAndUpdate('a.json', 4).skip).toBe(true);
  });
});

