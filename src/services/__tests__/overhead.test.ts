
import { describe, it, expect } from 'vitest';
import { ensureGeminiReady } from '../aiService';
import { AISettings } from '../../types';

describe('Overhead Fix Verification', () => {
  it('should skip pre-flight test and return immediately', async () => {
    const mockSettings: AISettings = {
      provider: 'gemini',
      gemini: { apiKey: 'fake-key', model: 'gemini-1.5-pro' },
      openai: { apiKey: 'fake-key', model: 'gpt-4' },
      qualityCheck: { enabled: false, verifierModel: 'gemini-1.5-flash', maxAutoRetries: 0 },
    } as any;

    const start = performance.now();
    const result = await ensureGeminiReady(mockSettings);
    const end = performance.now();

    console.log(`Time taken: ${end - start}ms`);

    expect(result.ok).toBe(true);
    expect(result.fromCache).toBe(true);
    // It should be extremely fast since it's just a sync check wrapped in async
    expect(end - start).toBeLessThan(100); 
  });
});
