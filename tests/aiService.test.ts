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
  qualityCheck: { enabled: true, verifierProvider: 'gemini', verifierModel: 'gemini-3-flash-preview', maxAutoRetries: 1 },
  gemini: { apiKey: key, model: 'gemini-3-pro-preview' },
  openai: { apiKey: 'sk-test', model: 'gpt-4o-mini', reasoningEffort: 'medium', verbosity: 'medium' },
  claude: { apiKey: '', model: 'claude-sonnet-4-6' },
  groq: { apiKey: '', model: 'llama-3.3-70b-versatile' }
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

  it('returns true and does not test connection when key is present', async () => {
    const settings = makeSettings('AIzaSy-test-key', 'gemini');
    const res1 = await ensureGeminiReady(settings);
    expect(res1.ok).toBe(true);
    expect(res1.fromCache).toBe(true);
    expect(testGeminiConnection).not.toHaveBeenCalled();
  });

  it('returns false if key is missing even when provider is not gemini', async () => {
    const res = await ensureGeminiReady(makeSettings('', 'openai'));
    expect(res.ok).toBe(false);
    expect(res.fromCache).toBe(false);
    expect(testGeminiConnection).not.toHaveBeenCalled();
  });

  it('always returns fromCache true due to optimization', async () => {
    const settings = makeSettings('AIzaSy-test-key', 'gemini');
    const res = await ensureGeminiReady(settings, 'gemini-3-flash-preview');
    expect(res.ok).toBe(true);
    expect(res.fromCache).toBe(true);
    expect(testGeminiConnection).not.toHaveBeenCalled();
  });
});
