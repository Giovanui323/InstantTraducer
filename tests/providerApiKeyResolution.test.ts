/**
 * Test: risoluzione API key per tutti i provider in TranslationExecutor.
 *
 * Regressione: il bug era che modal, groq, zai e custom non erano gestiti
 * nella logica di validazione API key, causando fallback su OpenAI e
 * l'errore "API non configurate: apri Impostazioni per usare OpenAI"
 * anche quando la chiave Modal era presente.
 *
 * Questo test estrae e verifica la logica di risoluzione provider → API key
 * e provider → label, simulando esattamente il codice in TranslationExecutor.
 */
import { describe, it, expect } from 'vitest';
import type { AISettings, AIProvider } from '../src/types';

// ─── Helpers: replica la logica di TranslationExecutor ───

function resolveProviderLabel(provider: AIProvider): string {
  return provider === 'gemini' ? 'Gemini'
    : provider === 'claude' ? 'Claude'
    : provider === 'groq' ? 'Groq'
    : provider === 'modal' ? 'Modal'
    : provider === 'zai' ? 'Z.ai'
    : provider === 'custom' ? 'Custom'
    : 'OpenAI';
}

function resolveApiKey(settings: AISettings): string {
  const provider = settings.provider;
  if (provider === 'gemini') return settings.gemini.apiKey || '';
  if (provider === 'claude') return settings.claude?.apiKey || '';
  if (provider === 'groq') return settings.groq?.apiKey || '';
  if (provider === 'modal') return settings.modal?.apiKey || '';
  if (provider === 'zai') return settings.zai?.apiKey || '';
  if (provider === 'custom') return settings.customProviders?.[0]?.apiKey || '';
  return settings.openai.apiKey || '';
}

// ─── Factory ───

function makeSettings(provider: AIProvider, overrides: Partial<AISettings> = {}): AISettings {
  return {
    provider,
    qualityCheck: { enabled: true, verifierProvider: 'gemini', verifierModel: 'gemini-3-flash-preview', maxAutoRetries: 1 },
    metadataExtraction: { enabled: true, provider: 'gemini', model: 'gemini-3-flash-preview' },
    gemini: { apiKey: '', model: 'gemini-3-pro-preview' },
    openai: { apiKey: '', model: 'gpt-4o-mini', reasoningEffort: 'medium', verbosity: 'medium' },
    claude: { apiKey: '', model: 'claude-sonnet-4-6' },
    groq: { apiKey: '', model: 'llama-3.3-70b-versatile' },
    modal: { apiKey: '' },
    openrouter: { apiKey: '', model: 'anthropic/claude-sonnet-4-5-20250929' },
    zai: { apiKey: '', model: 'glm-4v-plus' },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════

describe('Provider API Key Resolution (TranslationExecutor)', () => {

  // ─── Gemini ───

  describe('provider = gemini', () => {
    it('trova la chiave quando presente', () => {
      const s = makeSettings('gemini', { gemini: { apiKey: 'AIzaSy-test', model: 'gemini-3-pro-preview' } });
      expect(resolveApiKey(s)).toBe('AIzaSy-test');
    });

    it('ritorna stringa vuota se chiave mancante', () => {
      const s = makeSettings('gemini');
      expect(resolveApiKey(s)).toBe('');
    });

    it('label corretta', () => {
      expect(resolveProviderLabel('gemini')).toBe('Gemini');
    });
  });

  // ─── OpenAI ───

  describe('provider = openai', () => {
    it('trova la chiave quando presente', () => {
      const s = makeSettings('openai', { openai: { apiKey: 'sk-test-openai', model: 'gpt-4o-mini', reasoningEffort: 'medium', verbosity: 'medium' } });
      expect(resolveApiKey(s)).toBe('sk-test-openai');
    });

    it('ritorna stringa vuota se chiave mancante', () => {
      const s = makeSettings('openai');
      expect(resolveApiKey(s)).toBe('');
    });

    it('label corretta', () => {
      expect(resolveProviderLabel('openai')).toBe('OpenAI');
    });
  });

  // ─── Claude ───

  describe('provider = claude', () => {
    it('trova la chiave quando presente', () => {
      const s = makeSettings('claude', { claude: { apiKey: 'sk-ant-test', model: 'claude-sonnet-4-6' } });
      expect(resolveApiKey(s)).toBe('sk-ant-test');
    });

    it('ritorna stringa vuota se chiave mancante', () => {
      const s = makeSettings('claude');
      expect(resolveApiKey(s)).toBe('');
    });

    it('label corretta', () => {
      expect(resolveProviderLabel('claude')).toBe('Claude');
    });
  });

  // ─── Groq (BUG: non era gestito, fallback su openai) ───

  describe('provider = groq', () => {
    it('trova la chiave quando presente', () => {
      const s = makeSettings('groq', { groq: { apiKey: 'gsk_test-key', model: 'llama-3.3-70b-versatile' } });
      expect(resolveApiKey(s)).toBe('gsk_test-key');
    });

    it('ritorna stringa vuota se chiave mancante', () => {
      const s = makeSettings('groq');
      expect(resolveApiKey(s)).toBe('');
    });

    it('NON fa fallback su openai.apiKey', () => {
      const s = makeSettings('groq', {
        openai: { apiKey: 'sk-openai-key', model: 'gpt-4o-mini', reasoningEffort: 'medium', verbosity: 'medium' },
        groq: { apiKey: '', model: 'llama-3.3-70b-versatile' },
      });
      // Groq key è vuota → deve tornare '', NON la OpenAI key
      expect(resolveApiKey(s)).toBe('');
    });

    it('label corretta', () => {
      expect(resolveProviderLabel('groq')).toBe('Groq');
    });
  });

  // ─── Modal (BUG ORIGINALE: non era gestito, fallback su openai) ───

  describe('provider = modal', () => {
    it('trova la chiave quando presente', () => {
      const s = makeSettings('modal', { modal: { apiKey: 'modal-token-abc123' } });
      expect(resolveApiKey(s)).toBe('modal-token-abc123');
    });

    it('ritorna stringa vuota se chiave mancante', () => {
      const s = makeSettings('modal');
      expect(resolveApiKey(s)).toBe('');
    });

    it('NON fa fallback su openai.apiKey quando modal key è vuota', () => {
      const s = makeSettings('modal', {
        openai: { apiKey: 'sk-openai-key', model: 'gpt-4o-mini', reasoningEffort: 'medium', verbosity: 'medium' },
        modal: { apiKey: '' },
      });
      // Modal key è vuota → deve tornare '', NON la OpenAI key
      expect(resolveApiKey(s)).toBe('');
    });

    it('NON restituisce openai key quando modal è il provider selezionato', () => {
      // Questo è il caso del bug: l'utente seleziona Modal ma il codice
      // cade nel ramo else (openai) e mostra "API non configurate: apri Impostazioni per usare OpenAI"
      const s = makeSettings('modal', { modal: { apiKey: 'modal-xyz' } });
      const key = resolveApiKey(s);
      expect(key).toBe('modal-xyz');
      expect(key).not.toBe('');
    });

    it('label corretta (NON "OpenAI")', () => {
      expect(resolveProviderLabel('modal')).toBe('Modal');
    });
  });

  // ─── Z.ai ───

  describe('provider = zai', () => {
    it('trova la chiave quando presente', () => {
      const s = makeSettings('zai', { zai: { apiKey: 'zai-test-key', model: 'glm-4v-plus' } });
      expect(resolveApiKey(s)).toBe('zai-test-key');
    });

    it('ritorna stringa vuota se chiave mancante', () => {
      const s = makeSettings('zai');
      expect(resolveApiKey(s)).toBe('');
    });

    it('NON fa fallback su openai.apiKey', () => {
      const s = makeSettings('zai', {
        openai: { apiKey: 'sk-openai-key', model: 'gpt-4o-mini', reasoningEffort: 'medium', verbosity: 'medium' },
        zai: { apiKey: '', model: 'glm-4v-plus' },
      });
      expect(resolveApiKey(s)).toBe('');
    });

    it('label corretta', () => {
      expect(resolveProviderLabel('zai')).toBe('Z.ai');
    });
  });

  // ─── Custom ───

  describe('provider = custom', () => {
    it('trova la chiave del primo custom provider', () => {
      const s = makeSettings('custom', {
        customProviders: [
          { id: 'cp1', name: 'MyProvider', apiFormat: 'openai' as const, baseUrl: 'https://api.example.com', model: 'my-model', apiKey: 'custom-key-123' },
        ],
      });
      expect(resolveApiKey(s)).toBe('custom-key-123');
    });

    it('ritorna stringa vuota se customProviders è vuoto', () => {
      const s = makeSettings('custom', { customProviders: [] });
      expect(resolveApiKey(s)).toBe('');
    });

    it('ritorna stringa vuota se customProviders è undefined', () => {
      const s = makeSettings('custom');
      expect(resolveApiKey(s)).toBe('');
    });

    it('label corretta', () => {
      expect(resolveProviderLabel('custom')).toBe('Custom');
    });
  });

  // ─── Simulazione flusso di validazione completo ───

  describe('Validazione completa (simula TranslationExecutor)', () => {
    it('modal con chiave NON genera errore "API non configurate"', () => {
      const s = makeSettings('modal', { modal: { apiKey: 'modal-token' } });
      const apiKey = resolveApiKey(s);
      const providerLabel = resolveProviderLabel(s.provider);

      // Simula il check in TranslationExecutor line ~136
      const hasValidKey = apiKey.trim().length > 0;

      expect(hasValidKey).toBe(true);
      expect(providerLabel).toBe('Modal');
      // Se hasValidKey è false con modal key presente, è il bug
    });

    it('modal senza chiave genera errore con label "Modal" (non "OpenAI")', () => {
      const s = makeSettings('modal');
      const apiKey = resolveApiKey(s);
      const providerLabel = resolveProviderLabel(s.provider);

      expect(apiKey.trim().length === 0).toBe(true);
      expect(providerLabel).toBe('Modal');
      // Il messaggio di errore sarà:
      // `API non configurate: apri Impostazioni per usare Modal.`
      // NON: `API non configurate: apri Impostazioni per usare OpenAI.`
    });

    it('ogni provider con la propria chiave valida passa la validazione', () => {
      const cases: Array<{ provider: AIProvider; settings: Partial<AISettings> }> = [
        { provider: 'gemini', settings: { gemini: { apiKey: 'AIzaSy-test', model: 'gemini-3-pro-preview' } } },
        { provider: 'openai', settings: { openai: { apiKey: 'sk-test', model: 'gpt-4o-mini', reasoningEffort: 'medium', verbosity: 'medium' } } },
        { provider: 'claude', settings: { claude: { apiKey: 'sk-ant-test', model: 'claude-sonnet-4-6' } } },
        { provider: 'groq', settings: { groq: { apiKey: 'gsk_test', model: 'llama-3.3-70b-versatile' } } },
        { provider: 'modal', settings: { modal: { apiKey: 'modal-token' } } },
        { provider: 'zai', settings: { zai: { apiKey: 'zai-key', model: 'glm-4v-plus' } } },
        { provider: 'custom', settings: { customProviders: [{ id: 'cp1', name: 'P', apiFormat: 'openai' as const, baseUrl: 'https://x.com', model: 'm', apiKey: 'custom-key' }] } },
      ];

      for (const { provider, settings } of cases) {
        const s = makeSettings(provider, settings);
        const apiKey = resolveApiKey(s);
        expect(apiKey.trim().length > 0).toBe(true);
        // Il label deve corrispondere al provider (non 'OpenAI' per provider non-openai)
        if (provider !== 'openai') {
          expect(resolveProviderLabel(provider)).not.toBe('OpenAI');
        }
      }
    });
  });
});
