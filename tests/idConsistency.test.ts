import { describe, it, expect } from 'vitest';
import {
  ensureJsonExtension as rendererEnsureJsonExtension,
  getFileIdStem as rendererGetFileIdStem,
  isUuidV4FileId as rendererIsUuidV4FileId,
  normalizeProjectFileId as rendererNormalizeProjectFileId,
  requireUuidV4FileId as rendererRequireUuidV4FileId
} from '../src/utils/idUtils';
// @ts-ignore
import {
  ensureJsonExtension as mainEnsureJsonExtension,
  getFileIdStem as mainGetFileIdStem,
  isUuidV4FileId as mainIsUuidV4FileId,
  normalizeProjectFileId as mainNormalizeProjectFileId,
  requireUuidV4FileId as mainRequireUuidV4FileId
} from '../electron/idUtils.js';

describe('ID Consistency between Main and Renderer', () => {
  it('should normalize IDs identically', () => {
    const samples = [
      '550e8400-e29b-41d4-a716-446655440000',
      '550e8400-e29b-41d4-a716-446655440000.json',
      '  550e8400-e29b-41d4-a716-446655440000  ',
      'FILE.JSON',
      'undefined.json',
      '.json'
    ];

    for (const s of samples) {
      expect(rendererEnsureJsonExtension(s)).toBe(mainEnsureJsonExtension(s));
      expect(rendererNormalizeProjectFileId(s as any)).toBe(mainNormalizeProjectFileId(s as any));
      expect(rendererIsUuidV4FileId(s as any)).toBe(mainIsUuidV4FileId(s as any));
      expect(rendererGetFileIdStem(s)).toBe(mainGetFileIdStem(s));
    }
  });

  it('should require UUID v4 identically', () => {
    const valid = '550e8400-e29b-41d4-a716-446655440000';
    expect(rendererRequireUuidV4FileId(valid)).toBe(mainRequireUuidV4FileId(valid));
    expect(() => rendererRequireUuidV4FileId('Libro' as any)).toThrow();
    expect(() => mainRequireUuidV4FileId('Libro' as any)).toThrow();
  });
});
