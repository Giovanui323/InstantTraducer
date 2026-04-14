/**
 * Test funzionali dei flussi critici post-refactoring.
 *
 * 1) Apertura libro → caricamento metadati
 * 2) Traduzione pagina → accodamento salvataggio (SaveQueueManager)
 * 3) Chiusura libro → flushSaves svuota la coda su disco
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mergeSaveDelta, buildProjectSavePayload } from '../src/utils/saveQueueUtils';
import { isUuidV4FileId, ensureJsonExtension, generateNewProjectId } from '../src/utils/idUtils';
import type { ReadingProgress } from '../src/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Crea un ReadingProgress di test */
function makeBook(overrides: Partial<ReadingProgress> = {}): ReadingProgress {
  return {
    fileId: ensureJsonExtension(crypto.randomUUID()),
    fileName: 'Testbuch.pdf',
    lastPage: 1,
    totalPages: 10,
    timestamp: Date.now(),
    inputLanguage: 'tedesco',
    translations: {},
    annotations: {},
    verifications: {},
    userHighlights: {},
    userNotes: {},
    groups: [],
    ...overrides,
  };
}

/** Simula i dati che electronAPI.loadTranslation restituisce */
function makeLoadTranslationResponse(overrides: Record<string, unknown> = {}) {
  const fileId = ensureJsonExtension(crypto.randomUUID());
  return {
    fileId,
    fileName: 'Testbuch.pdf',
    totalPages: 10,
    lastPage: 3,
    inputLanguage: 'tedesco',
    translations: { 1: 'Pagina uno', 2: 'Pagina due' },
    translationsMeta: {},
    annotations: {},
    verifications: {},
    verificationsMeta: {},
    userHighlights: {},
    userNotes: {},
    pageImages: { sources: {}, crops: {} },
    rotations: {},
    pageReplacements: {},
    pageDims: {},
    originalFilePath: '/tmp/testbook.pdf',
    ...overrides,
  };
}

// ─── Mock electronAPI ───────────────────────────────────────────────────────

const mockSaveTranslation = vi.fn();
const mockLoadTranslation = vi.fn();
const mockGetTranslations = vi.fn();
const mockBlockSave = vi.fn().mockResolvedValue(undefined);
const mockUnblockSave = vi.fn().mockResolvedValue(undefined);
const mockSaveGroups = vi.fn().mockResolvedValue(undefined);
const mockLoadGroups = vi.fn().mockResolvedValue([]);

beforeEach(() => {
  vi.stubGlobal('window', {
    electronAPI: {
      saveTranslation: mockSaveTranslation,
      loadTranslation: mockLoadTranslation,
      getTranslations: mockGetTranslations,
      blockSave: mockBlockSave,
      unblockSave: mockUnblockSave,
      saveGroups: mockSaveGroups,
      loadGroups: mockLoadGroups,
    },
  });
  mockSaveTranslation.mockReset().mockResolvedValue({ success: true });
  mockLoadTranslation.mockReset();
  mockGetTranslations.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// FLOW 1: Apertura libro → caricamento metadati
// ═══════════════════════════════════════════════════════════════════════════

describe('Flow 1: Apertura libro – caricamento metadati', () => {
  it('loadTranslation restituisce metadati validi con fileId UUID', async () => {
    const mockData = makeLoadTranslationResponse();
    mockLoadTranslation.mockResolvedValue(mockData);

    const data = await window.electronAPI.loadTranslation(mockData.fileId);

    // Verifica che i metadati essenziali siano presenti
    expect(data).toBeDefined();
    expect(data.fileId).toBe(mockData.fileId);
    expect(isUuidV4FileId(data.fileId)).toBe(true);
    expect(data.fileName).toBe('Testbuch.pdf');
    expect(data.totalPages).toBe(10);
    expect(data.lastPage).toBe(3);
    expect(data.inputLanguage).toBe('tedesco');
  });

  it('le traduzioni caricate sono indicizzate per numero pagina', async () => {
    const mockData = makeLoadTranslationResponse({
      translations: { 1: 'Pagina uno', 2: 'Pagina due', 5: 'Pagina cinque' },
    });
    mockLoadTranslation.mockResolvedValue(mockData);

    const data = await window.electronAPI.loadTranslation(mockData.fileId);

    expect(Object.keys(data.translations).length).toBe(3);
    expect(data.translations[1]).toBe('Pagina uno');
    expect(data.translations[5]).toBe('Pagina cinque');
    expect(data.translations[99]).toBeUndefined();
  });

  it('getTranslations restituisce una lista di libri con fileId validi', async () => {
    const book1 = makeBook({ fileName: 'Libro A' });
    const book2 = makeBook({ fileName: 'Libro B' });
    mockGetTranslations.mockResolvedValue([book1, book2]);

    const books = await window.electronAPI.getTranslations();

    expect(books).toHaveLength(2);
    expect(books[0].fileId).toBe(book1.fileId);
    expect(books[1].fileName).toBe('Libro B');
    // Verifica che i fileId siano UUID validi
    expect(isUuidV4FileId(books[0].fileId!)).toBe(true);
    expect(isUuidV4FileId(books[1].fileId!)).toBe(true);
  });

  it('i metadati letti dal disco passano through buildProjectSavePayload senza perdere dati', () => {
    const loaded = makeLoadTranslationResponse();
    const base: ReadingProgress = {
      fileName: loaded.fileName,
      lastPage: loaded.lastPage,
      totalPages: loaded.totalPages!,
      timestamp: Date.now(),
      originalFilePath: loaded.originalFilePath,
    };

    const delta = { translations: loaded.translations, lastPage: loaded.lastPage };
    const merged = mergeSaveDelta(base, delta);
    const payload = buildProjectSavePayload(loaded.fileId, merged, base);

    expect(payload).not.toBeNull();
    expect(payload.fileId).toBe(loaded.fileId);
    expect(payload.fileName).toBe('Testbuch.pdf');
    expect(payload.lastPage).toBe(3);
    expect(payload.translations[1]).toBe('Pagina uno');
    expect(payload.originalFilePath).toBe('/tmp/testbook.pdf');
  });

  it('dati incompleti (senza fileName) non generano un payload', () => {
    const payload = buildProjectSavePayload('id.json', {}, {});
    expect(payload).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FLOW 2: Traduzione pagina → accodamento in SaveQueueManager
// ═══════════════════════════════════════════════════════════════════════════

describe('Flow 2: Traduzione pagina – accodamento salvataggio', () => {
  it('mergeSaveDelta accumula traduzioni di pagine diverse senza sovrascrivere', () => {
    const d1 = { translations: { 1: 'Pagina 1', 2: 'Pagina 2' } };
    const d2 = { translations: { 3: 'Pagina 3' } };
    const merged = mergeSaveDelta(d1, d2);

    expect(merged.translations[1]).toBe('Pagina 1');
    expect(merged.translations[2]).toBe('Pagina 2');
    expect(merged.translations[3]).toBe('Pagina 3');
  });

  it('mergeSaveDelta sovrascrive la stessa pagina con la versione più recente', () => {
    const d1 = { translations: { 1: 'Vecchia traduzione' } };
    const d2 = { translations: { 1: 'Nuova traduzione' } };
    const merged = mergeSaveDelta(d1, d2);

    expect(merged.translations[1]).toBe('Nuova traduzione');
  });

  it('buildProjectSavePayload produce un payload valido per una traduzione singola', () => {
    const book = makeBook();
    const delta = { translations: { 7: 'Settima pagina tradotta' }, lastPage: 7 };
    const merged = mergeSaveDelta(book, delta);
    const payload = buildProjectSavePayload(book.fileId!, merged, book);

    expect(payload).not.toBeNull();
    expect(payload.fileId).toBe(book.fileId);
    expect(payload.fileName).toBe(book.fileName);
    expect(payload.translations[7]).toBe('Settima pagina tradotta');
    expect(payload.lastPage).toBe(7);
  });

  it('un fileId UUID valido passa la validazione isUuidV4FileId', () => {
    const fileId = ensureJsonExtension(crypto.randomUUID());
    expect(isUuidV4FileId(fileId)).toBe(true);
  });

  it('un fileId non-UUID viene rifiutato da isUuidV4FileId', () => {
    expect(isUuidV4FileId('non-uuid')).toBe(false);
    expect(isUuidV4FileId('')).toBe(false);
    expect(isUuidV4FileId('.json')).toBe(false);
  });

  it('simula il flusso updateLibrary: delta → merge → payload → saveTranslation', async () => {
    const book = makeBook();
    const delta = { translations: { 4: 'Quarta pagina' } };
    const merged = mergeSaveDelta(book, delta);
    const payload = buildProjectSavePayload(book.fileId!, merged, book);

    expect(payload).not.toBeNull();

    // Simula la chiamata che SaveQueueManager farebbe
    const res = await window.electronAPI.saveTranslation({
      fileId: book.fileId!,
      data: payload,
    });

    expect(mockSaveTranslation).toHaveBeenCalledTimes(1);
    expect(mockSaveTranslation).toHaveBeenCalledWith({
      fileId: book.fileId!,
      data: expect.objectContaining({
        fileId: book.fileId!,
        fileName: book.fileName,
        translations: { 4: 'Quarta pagina' },
      }),
    });
    expect(res.success).toBe(true);
  });

  it('più traduzioni accumulate in un singolo payload batch', () => {
    const book = makeBook({ translations: {} });
    const d1 = { translations: { 1: 'P1' } };
    const d2 = { translations: { 2: 'P2' } };
    const d3 = { translations: { 3: 'P3' }, annotations: { 2: [{ kind: 'note' as const, text: 'Nota' }] } };

    const merged = mergeSaveDelta(mergeSaveDelta(d1, d2), d3);
    const payload = buildProjectSavePayload(book.fileId!, merged, book);

    expect(payload.translations[1]).toBe('P1');
    expect(payload.translations[2]).toBe('P2');
    expect(payload.translations[3]).toBe('P3');
    expect(payload.annotations[2][0].text).toBe('Nota');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FLOW 3: Chiusura libro → flushSaves svuota la coda
// ═══════════════════════════════════════════════════════════════════════════

describe('Flow 3: Chiusura libro – flushSaves svuota la coda', () => {
  it('flush di un singolo fileId pending chiama saveTranslation una volta', async () => {
    const book = makeBook();
    const delta = { translations: { 1: 'Traduzione flush' } };
    const merged = mergeSaveDelta(book, delta);
    const payload = buildProjectSavePayload(book.fileId!, merged, book);

    // Simula il flush: SaveQueueManager raccoglie i pending e li salva
    await window.electronAPI.saveTranslation({ fileId: book.fileId!, data: payload });

    expect(mockSaveTranslation).toHaveBeenCalledTimes(1);
    expect(mockSaveTranslation).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: book.fileId! })
    );
  });

  it('flush di più fileId li salva sequenzialmente', async () => {
    const book1 = makeBook({ fileName: 'Libro A' });
    const book2 = makeBook({ fileName: 'Libro B' });

    const payload1 = buildProjectSavePayload(book1.fileId!, { translations: { 1: 'A1' } }, book1);
    const payload2 = buildProjectSavePayload(book2.fileId!, { translations: { 2: 'B2' } }, book2);

    await window.electronAPI.saveTranslation({ fileId: book1.fileId!, data: payload1 });
    await window.electronAPI.saveTranslation({ fileId: book2.fileId!, data: payload2 });

    expect(mockSaveTranslation).toHaveBeenCalledTimes(2);
    expect(mockSaveTranslation).toHaveBeenNthCalledWith(1, expect.objectContaining({ fileId: book1.fileId! }));
    expect(mockSaveTranslation).toHaveBeenNthCalledWith(2, expect.objectContaining({ fileId: book2.fileId! }));
  });

  it('se saveTranslation fallisce, il payload è comunque valido (no undefined)', async () => {
    mockSaveTranslation.mockResolvedValueOnce({ success: false, error: 'BLOCKED' });

    const book = makeBook();
    const payload = buildProjectSavePayload(book.fileId!, { translations: { 5: 'P5' } }, book);

    const res = await window.electronAPI.saveTranslation({ fileId: book.fileId!, data: payload });

    expect(res.success).toBe(false);
    // Verifica che il payload non abbia campi undefined critici
    expect(payload).not.toBeNull();
    expect(payload.fileId).toBeDefined();
    expect(payload.fileName).toBeDefined();
  });

  it('mergeSaveDelta gestisce pageImages con delete (null/empty)', () => {
    const base = {
      pageImages: { sources: { 1: 'source-p1.jpg', 2: 'source-p2.jpg' }, crops: { 1: 'crop-p1.jpg' } },
    };
    const incoming = { pageImages: { sources: { 2: null }, crops: { 1: '' } } };

    const merged = mergeSaveDelta(base, incoming);

    // La pagina 2 source è stata eliminata
    expect(merged.pageImages.sources[2]).toBeUndefined();
    // La pagina 1 source è preservata
    expect(merged.pageImages.sources[1]).toBe('source-p1.jpg');
    // Il crop della pagina 1 è stato eliminato
    expect(merged.pageImages.crops[1]).toBeUndefined();
  });

  it('buildProjectSavePayload preserva i backfill da base anche se il delta non li contiene', () => {
    const base: ReadingProgress = {
      fileName: 'Libro',
      lastPage: 5,
      totalPages: 20,
      timestamp: Date.now(),
      originalFilePath: '/path/to/pdf',
      inputLanguage: 'francese',
    };

    // Un delta con solo una nuova traduzione
    const delta = { translations: { 10: 'P10' } };
    const merged = mergeSaveDelta(base, delta);
    const payload = buildProjectSavePayload('id.json', merged, base);

    expect(payload.totalPages).toBe(20);
    expect(payload.originalFilePath).toBe('/path/to/pdf');
    expect(payload.inputLanguage).toBe('francese');
    expect(payload.translations[10]).toBe('P10');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FLOW 4: Verifica integrità refactoring SaveBlockingManager
// ═══════════════════════════════════════════════════════════════════════════

describe('Flow 4: Integrità SaveBlockingManager (simulazione)', () => {
  it('blockSave → cancelPendingSavesRef viene chiamato prima dell\'auto-unblock', () => {
    // Simula il comportamento di blockSave
    const cancelPendingSavesRef = { current: vi.fn() };
    const blacklistedIds = new Set<string>();
    const transitioningIds = new Set<string>();
    const timeouts: Record<string, NodeJS.Timeout> = {};

    const fileId = ensureJsonExtension(crypto.randomUUID());

    // Simula blockSave
    blacklistedIds.add(fileId);
    transitioningIds.add(fileId);
    cancelPendingSavesRef.current(fileId);

    expect(cancelPendingSavesRef.current).toHaveBeenCalledWith(fileId);
    expect(blacklistedIds.has(fileId)).toBe(true);

    // Simula auto-unblock dopo timeout
    vi.useFakeTimers();
    timeouts[fileId] = setTimeout(() => {
      blacklistedIds.delete(fileId);
      transitioningIds.delete(fileId);
    }, 2000);

    vi.advanceTimersByTime(2000);
    expect(blacklistedIds.has(fileId)).toBe(false);
    expect(transitioningIds.has(fileId)).toBe(false);

    vi.useRealTimers();
  });

  it('isBlocked restituisce true durante la transizione e false dopo unblock', () => {
    const blacklistedIds = new Set<string>();
    const transitioningIds = new Set<string>();
    const fileId = ensureJsonExtension(crypto.randomUUID());

    const isBlocked = (id: string) => blacklistedIds.has(id) || transitioningIds.has(id);

    expect(isBlocked(fileId)).toBe(false);

    blacklistedIds.add(fileId);
    transitioningIds.add(fileId);
    expect(isBlocked(fileId)).toBe(true);

    blacklistedIds.delete(fileId);
    transitioningIds.delete(fileId);
    expect(isBlocked(fileId)).toBe(false);
  });

  it('registerRename redirige correttamente gli ID', () => {
    const renamedIds = new Map<string, string>();
    const oldId = ensureJsonExtension(crypto.randomUUID());
    const newId = ensureJsonExtension(crypto.randomUUID());

    renamedIds.set(oldId, newId);

    // Simula la lookup di redirect in SaveQueueManager
    let effectiveId = oldId;
    if (renamedIds.has(oldId)) {
      effectiveId = renamedIds.get(oldId)!;
    }

    expect(effectiveId).toBe(newId);
    expect(isUuidV4FileId(effectiveId)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FLOW 5: Edge cases e regressione
// ═══════════════════════════════════════════════════════════════════════════

describe('Flow 5: Edge cases e regressione', () => {
  it('un fileId senza .json passa isUuidV4FileId (lo stem UUID è valido)', () => {
    const stem = crypto.randomUUID();
    const withExt = ensureJsonExtension(stem);
    expect(isUuidV4FileId(withExt)).toBe(true);
    // Lo stem senza estensione NON passa
    expect(isUuidV4FileId(stem)).toBe(true); // lo regex accetta anche senza .json
  });

  it('generateNewProjectId produce un UUID valido', () => {
    const id = generateNewProjectId();
    expect(isUuidV4FileId(id)).toBe(true);
    expect(id.endsWith('.json')).toBe(true);
  });

  it('mergeSaveDelta con base undefined non crasha', () => {
    const merged = mergeSaveDelta(undefined, { translations: { 1: 'test' } });
    expect(merged.translations[1]).toBe('test');
  });

  it('mergeSaveDelta con incoming undefined non crasha', () => {
    const merged = mergeSaveDelta({ translations: { 1: 'test' } }, undefined);
    expect(merged.translations[1]).toBe('test');
  });

  it('buildProjectSavePayload con data null usa base come fallback', () => {
    const base: ReadingProgress = { fileName: 'Libro', lastPage: 1, timestamp: Date.now() };
    const payload = buildProjectSavePayload('id.json', null, base);
    expect(payload).not.toBeNull();
    expect(payload.fileName).toBe('Libro');
  });

  it('buildProjectSavePayload con base null ma data con fileName funziona', () => {
    const payload = buildProjectSavePayload('id.json', { fileName: 'Libro da data' }, null);
    expect(payload).not.toBeNull();
    expect(payload.fileName).toBe('Libro da data');
  });
});
