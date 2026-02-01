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
    const ok = await ensureGeminiReady(makeSettings('', 'gemini'));
    expect(ok).toBe(false);
  });

  it('returns true and caches success for TTL', async () => {
    const settings = makeSettings('AIzaSy-test-key', 'gemini');
    const ok1 = await ensureGeminiReady(settings);
    expect(ok1).toBe(true);
    expect(testGeminiConnection).toHaveBeenCalledTimes(1);
    const ok2 = await ensureGeminiReady(settings);
    expect(ok2).toBe(true);
    expect(testGeminiConnection).toHaveBeenCalledTimes(1);
  });

  it('returns true for non-gemini provider without testing', async () => {
    const ok = await ensureGeminiReady(makeSettings('', 'openai'));
    expect(ok).toBe(true);
    expect(testGeminiConnection).not.toHaveBeenCalled();
  });

  it('propagates failure when testGeminiConnection throws', async () => {
    (testGeminiConnection as any).mockRejectedValue(new Error('bad key'));
    const ok = await ensureGeminiReady(makeSettings('bad', 'gemini'));
    expect(ok).toBe(false);
  });

  it('caches readiness per model', async () => {
    const settings = makeSettings('AIzaSy-test-key', 'gemini');
    const ok1 = await ensureGeminiReady(settings, 'gemini-3-flash-preview');
    expect(ok1).toBe(true);
    const ok2 = await ensureGeminiReady(settings, 'gemini-3-flash-preview');
    expect(ok2).toBe(true);
    expect(testGeminiConnection).toHaveBeenCalledTimes(1);
    const ok3 = await ensureGeminiReady(settings, 'gemini-3-pro-preview');
    expect(ok3).toBe(true);
    expect(testGeminiConnection).toHaveBeenCalledTimes(2);
  });
});
