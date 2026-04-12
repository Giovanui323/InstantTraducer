import { describe, it, expect, vi } from 'vitest';

// Mock electron modules
vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/userData',
    getAppPath: () => '/tmp/appPath'
  },
  ipcMain: { handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn(), removeAllListeners: vi.fn() },
  dialog: { showOpenDialog: vi.fn() }
}));

// Mock logger
vi.mock('../electron/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
}));

// Mock fileUtils
vi.mock('../electron/fileUtils.js', () => ({
  getTranslationsDir: vi.fn(),
  getAssetsRootDir: vi.fn(),
  projectAssetsDirFromFileId: vi.fn(),
  findOriginalPdfInAssetsDir: vi.fn(),
  safeWriteFile: vi.fn()
}));

// Mock translationMerge
vi.mock('../electron/translationMerge.js', () => ({
  mergeProjectData: vi.fn(),
  normalizeLoadedProjectData: vi.fn()
}));

// Mock pathSecurity
vi.mock('../electron/pathSecurity.js', () => ({
  safeJoin: vi.fn()
}));

// Import the function to test
import { groupProjectsForConsolidation } from '../electron/projectLogic.js';

describe('Consolidation Logic - Regression Tests', () => {
  it('should NOT merge projects with different names even if they share page count and generic PDF name', () => {
    // This replicates the bug scenario where "Book A" and "Book B" were merged because they both had "original.pdf"
    const projects = [
      {
        fileId: 'id_1.json',
        fileName: 'Pierre Michel Le Corre',
        originalFilePath: '/path/to/assets/id_1/original.pdf',
        totalPages: 5
      },
      {
        fileId: 'id_2.json',
        fileName: 'Stephane Zinty',
        originalFilePath: '/path/to/assets/id_2/original.pdf',
        totalPages: 5
      }
    ];
    
    const groups = groupProjectsForConsolidation(projects);
    
    // Expect 2 distinct groups
    expect(groups.size).toBe(2);
    
    const keys = Array.from(groups.keys());
    expect(keys).toContain('name:pierremichellecorre|pages:5');
    expect(keys).toContain('name:stephanezinty|pages:5');
  });

  it('should merge projects that ARE actually duplicates (same name, same pages)', () => {
    const projects = [
      {
        fileId: 'id_1.json',
        fileName: 'My Book',
        originalFilePath: '/path/to/assets/id_1/original.pdf',
        totalPages: 10
      },
      {
        fileId: 'id_2.json',
        fileName: 'My Book',
        originalFilePath: '/path/to/assets/id_2/original.pdf',
        totalPages: 10
      }
    ];
    
    const groups = groupProjectsForConsolidation(projects);
    expect(groups.size).toBe(1);
    expect(groups.get('name:mybook|pages:10')).toHaveLength(2);
  });

  it('should fall back to originalFilePath only if fileName is missing and path is specific', () => {
    const projects = [
      {
        fileId: 'id_1.json',
        fileName: undefined,
        originalFilePath: '/path/to/assets/id_1/SpecificName.pdf',
        totalPages: 8
      }
    ];
    
    const groups = groupProjectsForConsolidation(projects);
    expect(groups.size).toBe(1);
    expect(groups.has('name:specificname|pages:8')).toBe(true);
  });

  it('should NOT use "original.pdf" as a name if fileName is missing', () => {
    const projects = [
      {
        fileId: 'id_stem_123.json',
        fileName: undefined,
        originalFilePath: '/path/to/assets/id_1/original.pdf',
        totalPages: 8
      }
    ];
    
    const groups = groupProjectsForConsolidation(projects);
    // Should fallback to fileId stem "id_stem_123"
    expect(groups.has('name:idstem123|pages:8')).toBe(true);
    expect(groups.has('name:original|pages:8')).toBe(false);
  });
});
