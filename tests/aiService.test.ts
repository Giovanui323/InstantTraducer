import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AISettings } from '../src/types';

vi.mock('../src/services/geminiService', async () => {
  return {
    testGeminiConnection: vi.fn().mockResolvedValue(true)
  };
});

import { ensureGeminiReady, __resetGeminiCacheForTests } from '../src/services/aiService';
import { testGeminiConnection } from '../src/services/geminiService';

const makeSettings = (key: string, provider: 'gemini' | 'openai' = 'gemini'): AISettings => ({
  provider,
  qualityCheck: { enabled: true, verifierModel: 'gemini-3-flash-preview', maxAutoRetries: 1 },
  gemini: { apiKey: key, model: 'gemini-3-pro-preview' },
  openai: { apiKey: 'sk-test', model: 'gpt-4o-mini', reasoningEffort: 'medium', verbosity: 'medium' }
});

describe('ensureGeminiReady', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (testGeminiConnection as any).mockResolvedValue(true);
    __resetGeminiCacheForTests();
  });

  it('returns false when provider is gemini and key is empty', async () => {
    const res = await ensureGeminiReady(makeSettings('', 'gemini'));
    expect(res.ok).toBe(false);
    expect(res.fromCache).toBe(false);
  });

  it('returns true and caches success for TTL', async () => {
    const settings = makeSettings('AIzaSy-test-key', 'gemini');
    const res1 = await ensureGeminiReady(settings);
    expect(res1.ok).toBe(true);
    expect(res1.fromCache).toBe(false);
    expect(testGeminiConnection).toHaveBeenCalledTimes(1);
    const res2 = await ensureGeminiReady(settings);
    expect(res2.ok).toBe(true);
    expect(res2.fromCache).toBe(true);
    expect(testGeminiConnection).toHaveBeenCalledTimes(1);
  });

  it('returns true for non-gemini provider without testing', async () => {
    const res = await ensureGeminiReady(makeSettings('', 'openai'));
    expect(res.ok).toBe(true);
    expect(res.fromCache).toBe(true);
    expect(testGeminiConnection).not.toHaveBeenCalled();
  });

  it('propagates failure when testGeminiConnection throws', async () => {
    (testGeminiConnection as any).mockRejectedValue(new Error('bad key'));
    const res = await ensureGeminiReady(makeSettings('bad', 'gemini'));
    expect(res.ok).toBe(false);
    expect(res.fromCache).toBe(false);
  });

  it('caches readiness per model', async () => {
    const settings = makeSettings('AIzaSy-test-key', 'gemini');
    const res1 = await ensureGeminiReady(settings, 'gemini-3-flash-preview');
    expect(res1.ok).toBe(true);
    expect(res1.fromCache).toBe(false);
    const res2 = await ensureGeminiReady(settings, 'gemini-3-flash-preview');
    expect(res2.ok).toBe(true);
    expect(res2.fromCache).toBe(true);
    expect(testGeminiConnection).toHaveBeenCalledTimes(1);
    const res3 = await ensureGeminiReady(settings, 'gemini-3-pro-preview');
    expect(res3.ok).toBe(true);
    expect(res3.fromCache).toBe(false);
    expect(testGeminiConnection).toHaveBeenCalledTimes(2);
  });
});
