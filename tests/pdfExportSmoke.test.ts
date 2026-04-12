import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('electron', () => {
  const handlers = new Map<string, any>();

  const ipcMain = {
    handle: (channel: string, handler: any) => {
      handlers.set(channel, handler);
    },
    removeHandler: (channel: string) => {
      handlers.delete(channel);
    },
    _handlers: handlers
  } as any;

  class BrowserWindowMock {
    webContents: any;
    private destroyed = false;

    constructor() {
      this.webContents = {
        printToPDF: vi.fn(async () => Buffer.from('%PDF-1.4\n%mock\n', 'utf-8'))
      };
    }

    async loadURL() {
      return;
    }

    isDestroyed() {
      return this.destroyed;
    }

    close() {
      this.destroyed = true;
    }
  }

  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'instanttraducer-export-'));
  const app = {
    getPath: (name: string) => {
      if (name === 'userData') return baseDir;
      if (name === 'temp') return baseDir;
      if (name === 'downloads') return path.join(baseDir, 'downloads');
      return baseDir;
    }
  } as any;

  const dialog = {
    showSaveDialog: vi.fn(async (_parent: any, options: any) => {
      const defaultPath = options?.defaultPath ? String(options.defaultPath) : path.join(baseDir, 'out.pdf');
      return { canceled: false, filePath: defaultPath, bookmark: '' };
    }),
    showMessageBox: vi.fn(async () => ({ response: 0 }))
  } as any;

  const shell = { openExternal: vi.fn(async () => true) } as any;

  return {
    app,
    ipcMain,
    dialog,
    shell,
    BrowserWindow: BrowserWindowMock
  };
});

describe('PDF export smoke', () => {
  it('exports translated PDF without crashing and writes output file', async () => {
    const { setupPdfHandlers } = await import('../electron/pdfHandlers.js');
    const electron = await import('electron');

    const logger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    } as any;

    setupPdfHandlers(logger, null);

    const handler = (electron as any).ipcMain._handlers.get('export-translations-pdf');
    expect(typeof handler).toBe('function');

    const res = await handler(null, {
      bookName: 'Test Book',
      pages: [{ pageNumber: 1, text: 'Ciao mondo', highlights: [], userNotes: [] }],
      exportOptions: { splitSpreadIntoTwoPages: false, insertBlankPages: false }
    });

    expect(res?.success).toBe(true);
    expect(typeof res?.path).toBe('string');
    expect(fs.existsSync(res.path)).toBe(true);
    expect(fs.statSync(res.path).size).toBeGreaterThan(0);
  });
});

