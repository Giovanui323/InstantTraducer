
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { translateWithGemini, __resetGeminiStateForTests } from '../geminiService';
import { GoogleGenAI } from '@google/genai';
import { GEMINI_TRANSLATION_MODEL } from '../../constants';
import * as modelLogic from '../geminiModelLogic';

// Mock del modulo @google/genai
vi.mock('@google/genai', () => {
  const generateContentStreamMock = vi.fn();
  return {
    GoogleGenAI: vi.fn(() => ({
      models: {
        generateContentStream: generateContentStreamMock
      }
    })),
    HarmBlockThreshold: { BLOCK_NONE: 'BLOCK_NONE' },
    HarmCategory: {
      HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
      HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
      HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      HARM_CATEGORY_CIVIC_INTEGRITY: 'HARM_CATEGORY_CIVIC_INTEGRITY'
    }
  };
});

// Mock di geminiModelLogic per avere controllo deterministico sul fallback
vi.mock('../geminiModelLogic', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as any,
    getNextFallbackModel: vi.fn((model) => {
      if (model === 'gemini-2.5-pro') return 'gemini-fallback-mock';
      return model; // Stop recursion if same
    })
  };
});

// Helper per mockare lo stream
async function* mockStream(textChunks: string[]) {
  for (const text of textChunks) {
    yield {
      text: text // Proprietà diretta come usata nel codice
    };
  }
}

describe('Gemini Service - Critical Logic', () => {
  let mockGenerateContentStream: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    __resetGeminiStateForTests();
    // Recupera il mock dalla factory
    const mockInstance = new GoogleGenAI({ apiKey: 'test' });
    mockGenerateContentStream = mockInstance.models.generateContentStream;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should successfully translate a page', async () => {
    mockGenerateContentStream.mockResolvedValue(mockStream(['Ciao', ' Mondo']));

    const result = await translateWithGemini(
      'base64image',
      1,
      'English',
      '',
      undefined, undefined, undefined, undefined,
      'gemini-2.5-pro',
      'fake-api-key'
    );

    expect(result.text).toBe('Ciao Mondo');
    expect(mockGenerateContentStream).toHaveBeenCalledTimes(1);
    expect(mockGenerateContentStream).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-2.5-pro'
    }));
  });

  it('should handle quota exceeded error and trigger fallback', async () => {
    // Primo tentativo: Errore Quota (429)
    mockGenerateContentStream.mockRejectedValueOnce({
      error: { message: 'Quota exceeded', code: 429 }
    });
    // Secondo tentativo (Retry automatico dello stesso modello): Ancora Errore Quota
    mockGenerateContentStream.mockRejectedValueOnce({
      error: { message: 'Quota exceeded', code: 429 }
    });
    
    // Terzo tentativo (Fallback): Successo
    mockGenerateContentStream.mockResolvedValueOnce(mockStream(['Traduzione', ' Fallback']));

    const onProgress = vi.fn();

    // Avvia la promise ma non aspettare ancora (potrebbe esserci un delay)
    const promise = translateWithGemini(
      'base64image',
      1,
      'English',
      '',
      undefined, undefined, undefined, undefined,
      'gemini-2.5-pro',
      'fake-api-key',
      undefined,
      onProgress
    );
    
    // Avanza il tempo per eventuali delay di retry/cooldown
    // Retry 1: 3000ms
    // Fallback: 0ms (immediato dopo errore quota)
    await vi.advanceTimersByTimeAsync(10000);
    
    const result = await promise;

    expect(result.text).toBe('Traduzione Fallback');
    
    // Deve aver chiamato 3 volte: 2 col modello principale (initial + retry), 1 col fallback
    expect(mockGenerateContentStream).toHaveBeenCalledTimes(3);
    
    const calls = mockGenerateContentStream.mock.calls;
    expect(calls[0][0].model).toBe('gemini-2.5-pro');
    expect(calls[1][0].model).toBe('gemini-2.5-pro'); // Retry
    expect(calls[2][0].model).toBe('gemini-fallback-mock'); // Fallback
    
    expect(onProgress).toHaveBeenCalledWith(expect.stringContaining('Fallback'));
  });

  it('should retry on transient errors', async () => {
    // Primo tentativo: Errore generico (transient)
    mockGenerateContentStream.mockRejectedValueOnce(new Error('Temporary connection error'));
    
    // Secondo tentativo: Successo
    mockGenerateContentStream.mockResolvedValueOnce(mockStream(['Successo', ' dopo retry']));

    const promise = translateWithGemini(
      'base64image',
      1,
      'English',
      '',
      undefined, undefined, undefined, undefined,
      'gemini-2.5-pro',
      'fake-api-key'
    );

    // Avanza il tempo per il backoff esponenziale
    await vi.advanceTimersByTimeAsync(5000);

    const result = await promise;

    expect(result.text).toBe('Successo dopo retry');
    expect(mockGenerateContentStream).toHaveBeenCalledTimes(2);
    expect(mockGenerateContentStream.mock.calls[0][0].model).toBe('gemini-2.5-pro');
    expect(mockGenerateContentStream.mock.calls[1][0].model).toBe('gemini-2.5-pro');
  });

  it('should throw error if all attempts fail', async () => {
    mockGenerateContentStream.mockRejectedValue(new Error('Persistent error'));

    const promise = translateWithGemini(
      'base64image',
      1,
      'English',
      '',
      undefined, undefined, undefined, undefined,
      'gemini-2.5-pro',
      'fake-api-key'
    );
    
    // Attach expectation immediately to handle potential async rejection during timer advancement
    const assertPromise = expect(promise).rejects.toThrow('Persistent error');

    // Avanza il tempo per coprire tutti i retry
    await vi.advanceTimersByTimeAsync(30000);

    await assertPromise;
    
    // Dovrebbe aver riprovato 2 volte (configurato a 2 tentativi totali nel service: 1 initial + 1 retry se inteso come attempts=2)
    // Controlliamo il codice: retry(fn, 2) -> loop i < 2 -> 0, 1. Quindi 2 chiamate.
    expect(mockGenerateContentStream).toHaveBeenCalledTimes(2); 
  });

  it('should respect critical instruction (retry mode)', async () => {
    mockGenerateContentStream.mockResolvedValue(mockStream(['Corrected Text']));

    await translateWithGemini(
      'base64image',
      1,
      'English',
      '',
      undefined, undefined, undefined, undefined,
      'gemini-2.5-pro',
      'fake-api-key',
      'CORREGGI QUESTA TRADUZIONE' // Extra instruction
    );

    expect(mockGenerateContentStream).toHaveBeenCalledWith(expect.objectContaining({
      contents: expect.arrayContaining([
        expect.objectContaining({
          parts: expect.arrayContaining([
            expect.objectContaining({ text: expect.stringContaining('CORREGGI QUESTA TRADUZIONE') })
          ])
        })
      ])
    }));
  });

  it('should handle metadata extraction with fallback', async () => {
    // Importa la funzione
    const { extractPdfMetadataWithGemini } = await import('../geminiService');
    
    // Configura il mock per restituire sia generateContentStream (per translate) che generateContent (per metadata)
    const mockGenerateContent = vi.fn();
    const mockGenerateContentStream = vi.fn();
    
    // Aggiorna l'implementazione del mock di GoogleGenAI
    // IMPORTANTE: il mock deve essere sulla classe istanziata, non solo sul modulo
    vi.mocked(GoogleGenAI).mockImplementation(() => ({
      models: {
        generateContentStream: mockGenerateContentStream,
        generateContent: mockGenerateContent
      },
      getGenerativeModel: vi.fn() // Aggiungiamo anche questo per completezza se usato
    } as any));

    // Primo tentativo: Errore
    mockGenerateContent.mockRejectedValueOnce(new Error('Quota exceeded'));
    
    // Secondo tentativo (Fallback): Successo
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({ title: 'Test Book', author: 'Test Author', year: '2023' })
      }
    });

    // Avvia la chiamata
    const promise = extractPdfMetadataWithGemini(
      'fake-api-key',
      'gemini-2.5-pro',
      ['base64image']
    );
    
    // Attendi i timer per gestire i retry (2000ms delay nel codice reale)
    await vi.advanceTimersByTimeAsync(10000);

    const result = await promise;

    expect(result).toEqual({
      title: 'Test Book',
      author: 'Test Author',
      year: '2023'
    });
    
    // Verifica che abbia chiamato almeno 2 volte (1 fail + 1 success)
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });
});
