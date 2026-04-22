export { };

declare global {
  interface Window {
    electronAPI: {
      platform: string;
      getAppVersion: () => Promise<string>;
      getSystemHealth: () => Promise<{
        appVersion: string;
        platform: string;
        arch: string;
        isPackaged: boolean;
        userDataPath: string;
        translationsPath: string;
        logsPath: string;
        processMemory: any;
        systemMemory: any;
      }>;
      getTranslations: () => Promise<any[]>;
      loadTranslation: (fileId: string) => Promise<any>;
      blockSave: (fileId: string) => Promise<{ success: boolean }>;
      unblockSave: (fileId: string) => Promise<{ success: boolean }>;
      saveTranslation: (args: { fileId: string; data: any }) => Promise<any>;
      deleteTranslation: (fileId: string) => Promise<{ success: boolean; error?: string }>;
      getTrashContents: () => Promise<any[]>;
      restoreTrashItem: (trashId: string) => Promise<{ success: boolean; error?: string }>;
      restoreAllTrashItems: () => Promise<{ success: boolean; count?: number; error?: string }>;
      deleteTrashItemPermanently: (trashId: string) => Promise<{ success: boolean; error?: string }>;
      emptyTrash: () => Promise<{ success: boolean; error?: string }>;
      renameTranslation: (args: { fileId: string; newFileName: string; newInputLanguage?: string }) => Promise<{ success: boolean; newFileId?: string; error?: string }>;
      setDisplayName: (args: { fileId: string; displayName: string; inputLanguage?: string }) => Promise<{ success: boolean; fileId?: string; fileName?: string; error?: string }>;
      openFileDialog: () => Promise<string | null>;
      selectDirectoryDialog: () => Promise<string | null>;
      chooseAndSetProjectsBaseDir: () => Promise<{ success: boolean; cancelled?: boolean; customProjectsPath?: string; mode?: 'moved' | 'new'; error?: string }>;
      resetProjectsBaseDirToDefault: () => Promise<{ success: boolean; cancelled?: boolean; customProjectsPath?: string; mode?: 'moved' | 'new'; error?: string }>;
      readPdfFile: (filePath: string) => Promise<Uint8Array>;
      exportTranslationsPdf: (args: { bookName: string; pages: { pageNumber: number; text: string }[]; exportOptions?: { splitSpreadIntoTwoPages: boolean; insertBlankPages: boolean; outputFormat: 'A4' | 'original'; previewInReader?: boolean }; pageDims?: Record<number, { width: number; height: number }> }) => Promise<any>;
      saveSettings: (settings: any) => Promise<any>;
      loadSettings: () => Promise<any>;
      saveProjectImage: (args: { fileId: string; page: number; kind: 'source' | 'crop'; dataUrl?: string; sourceDataUrl?: string }) => Promise<any>;
      readProjectImage: (args: { fileId: string; relPath: string }) => Promise<any>;
      readProjectImageBase64: (args: { fileId: string; relPath: string }) => Promise<any>;
      deleteProjectImage: (args: { fileId: string; relPath: string }) => Promise<any>;
      initProjectShell: (args: { fileId: string; fileName?: string; inputLanguage?: string; groups?: string[] }) => Promise<{ success: boolean; fileId?: string; error?: string }>;
      copyOriginalPdf: (args: { fileId: string; sourcePath: string; fileName?: string }) => Promise<{ success: boolean; fileId?: string; path?: string; error?: string }>;
      saveOriginalPdfBuffer: (args: { fileId: string; buffer: Uint8Array; fileName?: string }) => Promise<{ success: boolean; fileId?: string; isDuplicate?: boolean; fileName?: string; path?: string; error?: string }>;
      exportOriginalPdf: (fileId: string) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;
      getOriginalPdfPath: (fileId: string) => Promise<{ success: boolean; path?: string; error?: string }>;
      calculateFileFingerprint: (filePath: string) => Promise<string | null>;
      exportProjectPackage: (args: { fileId: string }) => Promise<{ success: boolean; path?: string; error?: string; cancelled?: boolean }>;
      importProjectPackage: () => Promise<string | null>;
      coverSetFromFile: (args: { fileId: string }) => Promise<{ success: boolean; thumbnail?: string; error?: string; cancelled?: boolean }>;
      coverSetFromBuffer: (args: { fileId: string; dataUrl: string; source?: string }) => Promise<{ success: boolean; thumbnail?: string; error?: string }>;
      coverSetFromUrl: (args: { fileId: string; url: string; source?: string; isbn?: string }) => Promise<{ success: boolean; thumbnail?: string; error?: string }>;
      coverRemove: (args: { fileId: string }) => Promise<{ success: boolean; error?: string }>;
      coverGetInfo: (args: { fileId: string }) => Promise<{ hasCustomCover: boolean; hasFirstPage: boolean; coverSource?: string; isbn?: string; error?: string }>;
      openProjectDialog: () => Promise<string | null>;
      consolidateLibrary: () => Promise<{ success: boolean; fixedCount: number; missingCount: number; error?: string }>;
      getLibraryHealth: () => Promise<any>;
      factoryReset: () => Promise<void>;
      cleanupOrphanedAssets: () => Promise<number>;
      openLogsDir: () => Promise<{ success: boolean; path?: string; error?: string }>;
      loggerSelfcheck: () => Promise<{ success: boolean; path?: string; error?: string }>;

      // Log management APIs
      getUserDataPath: () => Promise<string>;
      listLogFiles: () => Promise<string[]>;
      readLogFile: (filename: string) => Promise<string>;
      getLogFileInfo: (filename: string) => Promise<{ size: number; modified: Date } | null>;
      cleanupOldLogs: (daysToKeep?: number) => Promise<any>;
      deleteLogFiles: (filenames: string[]) => Promise<{ deletedCount: number; totalRequested: number; failed: { filename: string; error: string }[]; error?: string }>;
      loadGroups: () => Promise<({ id: string; name: string } | string)[]>;
      saveGroups: (groups: { id: string; name: string }[]) => Promise<{ success: boolean; error?: string }>;
      logToMain: (args: { level: 'debug' | 'info' | 'warn' | 'error'; message: string; meta?: any }) => void;
      onCloseRequest: (callback: () => void) => void;
      readyToClose: () => void;
    };
  }
}
