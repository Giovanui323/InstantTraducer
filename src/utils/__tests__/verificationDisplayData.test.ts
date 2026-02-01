import { describe, expect, it } from 'vitest';
import { getVerificationDisplayData } from '../verificationUi';

describe('getVerificationDisplayData', () => {
  it('nasconde report e dubbi se manca la traduzione', () => {
    const res = getVerificationDisplayData({
      translatedText: '   ',
      verification: { state: 'verified', severity: 'ok' } as any,
      annotations: [{ id: '1', comment: 'x', type: 'warning' }] as any
    });

    expect(res.hasText).toBe(false);
    expect(res.verification).toBeUndefined();
    expect(res.annotations).toEqual([]);
  });

  it('mantiene report e dubbi se la traduzione esiste', () => {
    const report = { state: 'verified', severity: 'minor' } as any;
    const annotations = [{ id: 'a', comment: 'y', type: 'warning' }] as any;
    const res = getVerificationDisplayData({
      translatedText: 'ciao',
      verification: report,
      annotations
    });

    expect(res.hasText).toBe(true);
    expect(res.verification).toBe(report);
    expect(res.annotations).toBe(annotations);
  });
});

