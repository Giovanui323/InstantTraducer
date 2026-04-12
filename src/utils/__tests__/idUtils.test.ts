
import { describe, it, expect } from 'vitest';
import { 
  UUID_V4_FILEID_REGEX,
  isUuidV4FileId,
  normalizeProjectFileId,
  requireUuidV4FileId,
  getFileIdStem, 
  ensureJsonExtension,
  sanitizeExportName
} from '../idUtils';

describe('idUtils', () => {
  describe('UUID validation', () => {
    it('should validate UUID v4 ids', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(UUID_V4_FILEID_REGEX.test(uuid)).toBe(true);
      expect(isUuidV4FileId(uuid)).toBe(true);
      expect(isUuidV4FileId(`${uuid}.json`)).toBe(true);
      expect(isUuidV4FileId('not-a-uuid')).toBe(false);
    });

    it('should normalize and require UUID ids', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(normalizeProjectFileId(`${uuid}.json`)).toBe(`${uuid}.json`);
      expect(requireUuidV4FileId(uuid)).toBe(`${uuid}.json`);
      expect(() => requireUuidV4FileId('Libro')).toThrow();
    });
  });

  describe('getFileIdStem', () => {
    it('should remove .json extension', () => {
      expect(getFileIdStem('file.json')).toBe('file');
      expect(getFileIdStem('FILE.JSON')).toBe('FILE');
    });

    it('should return name as is if no extension', () => {
      expect(getFileIdStem('file')).toBe('file');
    });
  });

  describe('ensureJsonExtension', () => {
    it('should append .json if missing', () => {
      expect(ensureJsonExtension('file')).toBe('file.json');
    });

    it('should not append double extension', () => {
      expect(ensureJsonExtension('file.json')).toBe('file.json');
      expect(ensureJsonExtension('FILE.JSON')).toBe('file.json');
    });
  });

  describe('sanitizeExportName', () => {
    it('should return a safe export name', () => {
      expect(sanitizeExportName('')).toBe('Libro');
      expect(sanitizeExportName('My Book.pdf')).toBe('My Book');
    });
  });
});
