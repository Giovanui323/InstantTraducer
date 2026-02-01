export {};

declare global {
  interface Window {
    electronAPI: {
      getTranslations: () => Promise<any[]>;
      loadTranslation: (fileId: string) => Promise<any>;
      saveTranslation: (args: { fileId: string; data: any }) => Promise<any>;
      deleteTranslation: (fileId: string) => Promise<{ success: boolean; error?: string }>;
      getTrashContents: () => Promise<any[]>;
      restoreTrashItem: (trashId: string) => Promise<{ success: boolean; error?: string }>;
      restoreAllTrashItems: () => Promise<{ success: boolean; count?: number; error?: string }>;
      deleteTrashItemPermanently: (trashId: string) => Promise<{ success: boolean; error?: string }>;
      emptyTrash: () => Promise<{ success: boolean; error?: string }>;
      renameTranslation: (args: { fileId: string; newFileName: string }) => Promise<{ success: boolean; error?: string }>;
      openFileDialog: () => Promise<string | null>;
      selectDirectoryDialog: () => Promise<string | null>;
      readPdfFile: (filePath: string) => Promise<Uint8Array>;
      exportTranslationsPdf: (args: { bookName: string; pages: { pageNumber: number; text: string }[]; exportOptions?: { splitSpreadIntoTwoPages: boolean; insertBlankPages: boolean; outputFormat: 'A4' | 'original'; previewInReader?: boolean }; pageDims?: Record<number, { width: number; height: number }> }) => Promise<any>;
      saveSettings: (settings: any) => Promise<any>;
      loadSettings: () => Promise<any>;
      saveProjectImage: (args: { fileId: string; page: number; kind: 'source' | 'crop'; dataUrl?: string; sourceDataUrl?: string }) => Promise<any>;
      readProjectImage: (args: { fileId: string; relPath: string }) => Promise<any>;
      readProjectImageBase64: (args: { fileId: string; relPath: string }) => Promise<any>;
      deleteProjectImage: (args: { fileId: string; relPath: string }) => Promise<any>;
      copyOriginalPdf: (args: { fileId: string; sourcePath: string }) => Promise<{ success: boolean; path?: string; error?: string }>;
      saveOriginalPdfBuffer: (args: { fileId: string; buffer: Uint8Array }) => Promise<{ success: boolean; path?: string; error?: string }>;
      getOriginalPdfPath: (fileId: string) => Promise<{ success: boolean; path?: string; error?: string }>;
      exportProjectPackage: (args: { fileId: string }) => Promise<{ success: boolean; path?: string; error?: string; cancelled?: boolean }>;
      importProjectPackage: () => Promise<string | null>;
      openProjectDialog: () => Promise<string | null>;
      openLogsDir: () => Promise<{ success: boolean; path?: string; error?: string }>;
      loggerSelfcheck: () => Promise<{ success: boolean; path?: string; error?: string }>;
      loadGroups: () => Promise<string[]>;
      saveGroups: (groups: string[]) => Promise<{ success: boolean; error?: string }>;
      logToMain: (args: { level: 'debug' | 'info' | 'warn' | 'error'; message: string; meta?: any }) => void;
    };
  }
}
