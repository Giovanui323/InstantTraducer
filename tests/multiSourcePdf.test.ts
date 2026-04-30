import { describe, it, expect } from 'vitest';
import { resolveSourceForPage, getPhysicalPageInfo } from '../src/utils/pdfSourceUtils';
import { remapPageData } from '../src/utils/pageRemapping';
import type { SourcePdf, ReadingProgress } from '../src/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSources(): SourcePdf[] {
  return [
    {
      sourceId: 'src-1',
      filePath: '/path/to/book1.pdf',
      fileName: 'Book1.pdf',
      startPage: 1,
      endPage: 10,
      pageCount: 10,
      addedAt: Date.now()
    },
    {
      sourceId: 'src-2',
      filePath: '/path/to/book2.pdf',
      fileName: 'Book2.pdf',
      startPage: 11,
      endPage: 15,
      pageCount: 5,
      addedAt: Date.now()
    },
    {
      sourceId: 'src-3',
      filePath: '/path/to/book3.pdf',
      fileName: 'Book3.pdf',
      startPage: 16,
      endPage: 20,
      pageCount: 5,
      addedAt: Date.now()
    }
  ];
}

// ─── resolveSourceForPage ───────────────────────────────────────────────────

describe('resolveSourceForPage', () => {
  const sources = makeSources();

  it('resolves first page of the first source', () => {
    const result = resolveSourceForPage(sources, 1);
    expect(result).not.toBeNull();
    expect(result!.source.sourceId).toBe('src-1');
    expect(result!.physicalPage).toBe(1);
  });

  it('resolves last page of the first source', () => {
    const result = resolveSourceForPage(sources, 10);
    expect(result).not.toBeNull();
    expect(result!.source.sourceId).toBe('src-1');
    expect(result!.physicalPage).toBe(10);
  });

  it('resolves first page of the second source', () => {
    const result = resolveSourceForPage(sources, 11);
    expect(result).not.toBeNull();
    expect(result!.source.sourceId).toBe('src-2');
    expect(result!.physicalPage).toBe(1);
  });

  it('resolves middle page of the second source', () => {
    const result = resolveSourceForPage(sources, 13);
    expect(result).not.toBeNull();
    expect(result!.source.sourceId).toBe('src-2');
    expect(result!.physicalPage).toBe(3);
  });

  it('resolves last page of the third source', () => {
    const result = resolveSourceForPage(sources, 20);
    expect(result).not.toBeNull();
    expect(result!.source.sourceId).toBe('src-3');
    expect(result!.physicalPage).toBe(5);
  });

  it('returns null for page 0 (out of range)', () => {
    expect(resolveSourceForPage(sources, 0)).toBeNull();
  });

  it('returns null for page beyond the last source', () => {
    expect(resolveSourceForPage(sources, 21)).toBeNull();
  });

  it('returns null for empty sources array', () => {
    expect(resolveSourceForPage([], 5)).toBeNull();
  });

  it('handles a single-source project (1-20)', () => {
    const single: SourcePdf[] = [{
      sourceId: 'only', filePath: '/x.pdf', fileName: 'x.pdf',
      startPage: 1, endPage: 20, pageCount: 20, addedAt: Date.now()
    }];
    const r = resolveSourceForPage(single, 15);
    expect(r!.source.sourceId).toBe('only');
    expect(r!.physicalPage).toBe(15);
  });
});

// ─── getPhysicalPageInfo ────────────────────────────────────────────────────

describe('getPhysicalPageInfo', () => {
  it('falls back to originalFilePath when pdfSources is empty', () => {
    const project: Partial<ReadingProgress> = {
      originalFilePath: '/legacy.pdf',
      pdfSources: []
    };
    const info = getPhysicalPageInfo(project as ReadingProgress, 5);
    expect(info.filePath).toBe('/legacy.pdf');
    expect(info.physicalPage).toBe(5);
  });

  it('falls back to originalFilePath when pdfSources is undefined', () => {
    const project: Partial<ReadingProgress> = {
      originalFilePath: '/legacy.pdf'
    };
    const info = getPhysicalPageInfo(project as ReadingProgress, 3);
    expect(info.filePath).toBe('/legacy.pdf');
    expect(info.physicalPage).toBe(3);
  });

  it('resolves via pdfSources when present', () => {
    const project: Partial<ReadingProgress> = {
      originalFilePath: '/legacy.pdf',
      pdfSources: makeSources()
    };
    const info = getPhysicalPageInfo(project as ReadingProgress, 12);
    expect(info.filePath).toBe('/path/to/book2.pdf');
    expect(info.physicalPage).toBe(2);
  });
});

// ─── remapPageData ──────────────────────────────────────────────────────────

describe('remapPageData', () => {
  it('remaps page keys by the given offset', () => {
    const data: Record<number, string> = { 1: 'Page 1', 2: 'Page 2', 5: 'Page 5' };
    const remapped = remapPageData(data, 10);
    expect(remapped).toEqual({ 11: 'Page 1', 12: 'Page 2', 15: 'Page 5' });
  });

  it('returns empty object for undefined input', () => {
    expect(remapPageData(undefined, 10)).toEqual({});
  });

  it('returns empty object for empty input', () => {
    expect(remapPageData({}, 5)).toEqual({});
  });

  it('preserves complex values during remapping', () => {
    const annotations: Record<number, { id: string; text: string }[]> = {
      1: [{ id: 'a1', text: 'note on page 1' }],
      3: [{ id: 'a2', text: 'note on page 3' }, { id: 'a3', text: 'another' }]
    };
    const remapped = remapPageData(annotations, 20);
    expect(remapped[21]).toEqual([{ id: 'a1', text: 'note on page 1' }]);
    expect(remapped[23]).toHaveLength(2);
    expect(remapped[1]).toBeUndefined();
    expect(remapped[3]).toBeUndefined();
  });

  it('handles offset of 0 (identity)', () => {
    const data = { 5: 'hello' };
    expect(remapPageData(data, 0)).toEqual({ 5: 'hello' });
  });
});

// ─── Integration: merge scenario ────────────────────────────────────────────

describe('Multi-source merge scenario', () => {
  it('correctly computes merged pdfSources and remapped translations', () => {
    // Simulate target project (10 pages) + source project (5 pages)
    const targetSources: SourcePdf[] = [{
      sourceId: 'base', filePath: '/target.pdf', fileName: 'target.pdf',
      startPage: 1, endPage: 10, pageCount: 10, addedAt: 1000
    }];

    const sourceTranslations: Record<number, string> = {
      1: 'Source page 1 text',
      2: 'Source page 2 text',
      5: 'Source page 5 text'
    };

    const currentPages = 10;
    const sourcePagesCount = 5;

    // Build merged pdfSources
    const mergedSources: SourcePdf[] = [
      ...targetSources,
      {
        sourceId: 'merged_src',
        filePath: '/source.pdf',
        fileName: 'source.pdf',
        startPage: currentPages + 1,  // 11
        endPage: currentPages + sourcePagesCount,  // 15
        pageCount: sourcePagesCount,
        addedAt: Date.now()
      }
    ];

    // Remap source translations
    const remappedTranslations = remapPageData(sourceTranslations, currentPages);

    // Verify: source page 1 → logical page 11
    expect(remappedTranslations[11]).toBe('Source page 1 text');
    expect(remappedTranslations[12]).toBe('Source page 2 text');
    expect(remappedTranslations[15]).toBe('Source page 5 text');

    // Verify: logical page 11 → source PDF, physical page 1
    const resolved11 = resolveSourceForPage(mergedSources, 11);
    expect(resolved11!.source.sourceId).toBe('merged_src');
    expect(resolved11!.physicalPage).toBe(1);

    // Verify: logical page 15 → source PDF, physical page 5
    const resolved15 = resolveSourceForPage(mergedSources, 15);
    expect(resolved15!.source.sourceId).toBe('merged_src');
    expect(resolved15!.physicalPage).toBe(5);

    // Verify: original pages still resolve correctly
    const resolved5 = resolveSourceForPage(mergedSources, 5);
    expect(resolved5!.source.sourceId).toBe('base');
    expect(resolved5!.physicalPage).toBe(5);
  });
});

// ─── translationMerge: pdfSources replacement ──────────────────────────────

import { mergeProjectData } from '../electron/translationMerge.js';

describe('mergeProjectData — pdfSources handling', () => {
  it('replaces pdfSources entirely when incoming has pdfSources', () => {
    const existing = {
      fileName: 'Book',
      totalPages: 10,
      translations: { 1: 'page 1' },
      pdfSources: [
        { sourceId: 'old-1', filePath: '/old.pdf', fileName: 'old.pdf', startPage: 1, endPage: 10, pageCount: 10, addedAt: 1000 }
      ]
    };

    const incoming = {
      pdfSources: [
        { sourceId: 'new-1', filePath: '/a.pdf', fileName: 'a.pdf', startPage: 1, endPage: 5, pageCount: 5, addedAt: 2000 },
        { sourceId: 'new-2', filePath: '/b.pdf', fileName: 'b.pdf', startPage: 6, endPage: 15, pageCount: 10, addedAt: 2000 }
      ],
      totalPages: 15
    };

    const merged = mergeProjectData(existing, incoming);

    // pdfSources should be REPLACED, not merged/appended
    expect(merged.pdfSources).toHaveLength(2);
    expect(merged.pdfSources[0].sourceId).toBe('new-1');
    expect(merged.pdfSources[1].sourceId).toBe('new-2');
    expect(merged.pdfSources.find((s: any) => s.sourceId === 'old-1')).toBeUndefined();
  });

  it('preserves existing pdfSources when incoming does NOT have pdfSources', () => {
    const existing = {
      fileName: 'Book',
      totalPages: 10,
      pdfSources: [
        { sourceId: 'base', filePath: '/x.pdf', fileName: 'x.pdf', startPage: 1, endPage: 10, pageCount: 10, addedAt: 1000 }
      ]
    };

    const incoming = {
      translations: { 5: 'new translation for page 5' }
    };

    const merged = mergeProjectData(existing, incoming);
    expect(merged.pdfSources).toHaveLength(1);
    expect(merged.pdfSources[0].sourceId).toBe('base');
  });

  it('merges translations normally even when pdfSources is replaced', () => {
    const existing = {
      translations: { 1: 'hello', 2: 'world' },
      pdfSources: [{ sourceId: 'old', filePath: '/old.pdf', fileName: 'old.pdf', startPage: 1, endPage: 5, pageCount: 5, addedAt: 1 }]
    };

    const incoming = {
      translations: { 3: 'new page' },
      pdfSources: [{ sourceId: 'new', filePath: '/new.pdf', fileName: 'new.pdf', startPage: 1, endPage: 10, pageCount: 10, addedAt: 2 }]
    };

    const merged = mergeProjectData(existing, incoming);
    expect(merged.translations[1]).toBe('hello');
    expect(merged.translations[2]).toBe('world');
    expect(merged.translations[3]).toBe('new page');
    expect(merged.pdfSources).toHaveLength(1);
    expect(merged.pdfSources[0].sourceId).toBe('new');
  });
});

// ─── Double multi-source merge (chained) ────────────────────────────────────

describe('Chained multi-source merge', () => {
  it('correctly merges a project with 2 sources into one with 2 sources', () => {
    const targetSources: SourcePdf[] = [
      { sourceId: 'a', filePath: '/a.pdf', fileName: 'a.pdf', startPage: 1, endPage: 10, pageCount: 10, addedAt: 1 },
      { sourceId: 'b', filePath: '/b.pdf', fileName: 'b.pdf', startPage: 11, endPage: 15, pageCount: 5, addedAt: 2 }
    ];
    const targetPages = 15;

    const sourceSources: SourcePdf[] = [
      { sourceId: 'c', filePath: '/c.pdf', fileName: 'c.pdf', startPage: 1, endPage: 5, pageCount: 5, addedAt: 3 },
      { sourceId: 'd', filePath: '/d.pdf', fileName: 'd.pdf', startPage: 6, endPage: 8, pageCount: 3, addedAt: 4 }
    ];

    const sourceTranslations: Record<number, string> = { 1: 'c1', 3: 'c3', 7: 'd2' };

    const mergedSources = [...targetSources];
    for (const src of sourceSources) {
      mergedSources.push({
        ...src,
        sourceId: `m_${src.sourceId}`,
        startPage: src.startPage + targetPages,
        endPage: src.endPage + targetPages
      });
    }

    const remappedTranslations = remapPageData(sourceTranslations, targetPages);

    // 4 total sources
    expect(mergedSources).toHaveLength(4);
    expect(mergedSources[2].startPage).toBe(16);
    expect(mergedSources[2].endPage).toBe(20);
    expect(mergedSources[3].startPage).toBe(21);
    expect(mergedSources[3].endPage).toBe(23);

    // Remapped translations
    expect(remappedTranslations[16]).toBe('c1');
    expect(remappedTranslations[18]).toBe('c3');
    expect(remappedTranslations[22]).toBe('d2');

    // Resolution across all 4 sources
    expect(resolveSourceForPage(mergedSources, 5)!.source.sourceId).toBe('a');
    expect(resolveSourceForPage(mergedSources, 12)!.source.sourceId).toBe('b');
    expect(resolveSourceForPage(mergedSources, 17)!.source.sourceId).toBe('m_c');
    expect(resolveSourceForPage(mergedSources, 22)!.source.sourceId).toBe('m_d');
    expect(resolveSourceForPage(mergedSources, 22)!.physicalPage).toBe(2);
  });
});

// ─── Backward compatibility ─────────────────────────────────────────────────

describe('Backward compatibility — legacy projects', () => {
  it('resolveSourceForPage returns null for empty array (legacy fallback)', () => {
    expect(resolveSourceForPage([], 1)).toBeNull();
    expect(resolveSourceForPage([], 10)).toBeNull();
  });

  it('getPhysicalPageInfo returns identity for legacy project without pdfSources', () => {
    const legacy: Partial<ReadingProgress> = {
      originalFilePath: '/Users/docs/mybook.pdf',
      totalPages: 50
    };
    const info = getPhysicalPageInfo(legacy as ReadingProgress, 42);
    expect(info.filePath).toBe('/Users/docs/mybook.pdf');
    expect(info.physicalPage).toBe(42);
  });

  it('mergeProjectData preserves legacy project without introducing pdfSources', () => {
    const legacy = {
      fileId: 'abc.json',
      fileName: 'Old Book',
      originalFilePath: '/old.pdf',
      totalPages: 20,
      lastPage: 5,
      translations: { 1: 'hello', 2: 'world' }
    };

    const update = { translations: { 3: 'new page' }, lastPage: 6 };
    const merged = mergeProjectData(legacy, update);

    expect(merged.pdfSources).toBeUndefined();
    expect(merged.fileName).toBe('Old Book');
    expect(merged.translations[1]).toBe('hello');
    expect(merged.translations[3]).toBe('new page');
    expect(merged.lastPage).toBe(6);
  });

  it('first append to legacy project creates correct pdfSources', () => {
    const pdfSources: SourcePdf[] = [];

    // Simulate creating base entry for legacy project
    pdfSources.push({
      sourceId: 'base_abc', filePath: '/legacy.pdf', fileName: 'Legacy Book',
      startPage: 1, endPage: 10, pageCount: 10, addedAt: 5000
    });

    // Add new source
    pdfSources.push({
      sourceId: 'appended_1', filePath: '/new.pdf', fileName: 'New PDF',
      startPage: 11, endPage: 18, pageCount: 8, addedAt: Date.now()
    });

    expect(pdfSources).toHaveLength(2);

    // Full range resolution
    expect(resolveSourceForPage(pdfSources, 1)!.source.sourceId).toBe('base_abc');
    expect(resolveSourceForPage(pdfSources, 10)!.physicalPage).toBe(10);
    expect(resolveSourceForPage(pdfSources, 11)!.source.sourceId).toBe('appended_1');
    expect(resolveSourceForPage(pdfSources, 11)!.physicalPage).toBe(1);
    expect(resolveSourceForPage(pdfSources, 18)!.physicalPage).toBe(8);
    expect(resolveSourceForPage(pdfSources, 19)).toBeNull();
  });
});
