import { describe, it, expect } from 'vitest';
import { buildProjectSavePayload, mergeSaveDelta } from '../src/utils/saveQueueUtils';

describe('saveQueueUtils', () => {
  it('mergeSaveDelta accumula modifiche su campi diversi', () => {
    const d1 = { fileName: 'Libro', translations: { '1': 't1' } };
    const d2 = { annotations: { '2': [{ kind: 'note', text: 'n1' }] } };
    const merged = mergeSaveDelta(d1, d2);

    expect(merged.fileName).toBe('Libro');
    expect(merged.translations['1']).toBe('t1');
    expect(merged.annotations['2'][0].text).toBe('n1');
  });

  it('mergeSaveDelta gestisce delete per pageImages sources/crops con null', () => {
    const d1 = { pageImages: { sources: { '1': 'source-p1.jpg' }, crops: { '1': 'crop-p1.jpg' } } };
    const d2 = { pageImages: { sources: { '1': null }, crops: { '1': '' } } };
    const merged = mergeSaveDelta(d1, d2);

    expect(merged.pageImages.sources['1']).toBeUndefined();
    expect(merged.pageImages.crops['1']).toBeUndefined();
  });

  it('buildProjectSavePayload garantisce fileName/fileId e backfill scalari', () => {
    const base = { fileName: 'Libro', lastPage: 7, totalPages: 10, originalFilePath: '/tmp/a.pdf' };
    const data = { translations: { '3': 't3' } };
    const payload = buildProjectSavePayload('id.json', data, base);

    expect(payload).not.toBeNull();
    expect(payload.fileId).toBe('id.json');
    expect(payload.fileName).toBe('Libro');
    expect(payload.lastPage).toBe(7);
    expect(payload.totalPages).toBe(10);
    expect(payload.originalFilePath).toBe('/tmp/a.pdf');
    expect(payload.translations['3']).toBe('t3');
  });
});

