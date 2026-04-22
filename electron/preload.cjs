const { contextBridge, ipcRenderer, clipboard } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);
let saveTranslationRevision = 0;

const sendRendererLog = (payload) => {
  try { ipcRenderer.send('renderer-log', payload) } catch {}
};

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  getAppVersion: () => invoke('get-app-version'),
  openFileDialog: () => invoke('open-file-dialog'),
  selectDirectoryDialog: () => invoke('select-directory-dialog'),
  readPdfFile: (filePath) => invoke('read-pdf-file', filePath),
  chooseAndSetProjectsBaseDir: () => invoke('choose-and-set-projects-base-dir'),
  resetProjectsBaseDirToDefault: () => invoke('reset-projects-base-dir-to-default'),

  getTranslations: () => invoke('get-translations'),
  loadTranslation: (fileId) => invoke('load-translation', fileId),
  blockSave: (fileId) => invoke('block-save', fileId),
  unblockSave: (fileId) => invoke('unblock-save', fileId),
  saveTranslation: (payload) => {
    try {
      ipcRenderer.send('save-translation-requested', { fileId: payload?.fileId });
    } catch { }
    const revision = (typeof payload?.revision === 'number') ? payload.revision : (saveTranslationRevision += 1);
    return invoke('save-translation', { ...(payload || {}), revision });
  },
  deleteTranslation: (fileId) => invoke('delete-translation', fileId),
  getTrashContents: () => invoke('get-trash-contents'),
  restoreTrashItem: (trashId) => invoke('restore-trash-item', trashId),
  restoreAllTrashItems: () => invoke('restore-all-trash-items'),
  deleteTrashItemPermanently: (trashId) => invoke('delete-trash-item-permanently', trashId),
  emptyTrash: () => invoke('empty-trash'),
  renameTranslation: (payload) => invoke('rename-translation', payload),
  setDisplayName: (payload) => invoke('set-display-name', payload),

  saveSettings: (settings) => invoke('save-settings', settings),
  loadSettings: () => invoke('load-settings'),

  saveProjectImage: (payload) => invoke('save-project-image', payload),
  readProjectImage: (payload) => invoke('read-project-image', payload),
  readProjectImageBase64: (payload) => invoke('read-project-image-base64', payload),
  deleteProjectImage: (payload) => invoke('delete-project-image', payload),

  initProjectShell: (payload) => invoke('init-project-shell', payload),
  copyOriginalPdf: (payload) => invoke('copy-original-pdf', payload),
  saveOriginalPdfBuffer: (payload) => invoke('save-original-pdf-buffer', payload),
  exportOriginalPdf: (fileId) => invoke('export-original-pdf', fileId),
  getOriginalPdfPath: (fileId) => invoke('get-original-pdf-path', fileId),
  calculateFileFingerprint: (filePath) => invoke('calculate-file-fingerprint', filePath),

  exportTranslationsPdf: (payload) => invoke('export-translations-pdf', payload),

  exportProjectPackage: (payload) => invoke('export-project-package', payload),
  importProjectPackage: () => invoke('import-project-package'),

  // Cover management
  coverSetFromFile: (payload) => invoke('cover-set-from-file', payload),
  coverSetFromBuffer: (payload) => invoke('cover-set-from-buffer', payload),
  coverSetFromUrl: (payload) => invoke('cover-set-from-url', payload),
  coverRemove: (payload) => invoke('cover-remove', payload),
  coverGetInfo: (payload) => invoke('cover-get-info', payload),

  openProjectDialog: () => invoke('open-project-dialog'),
  consolidateLibrary: () => invoke('consolidate-library'),
  openLogsDir: () => invoke('open-logs-dir'),
  loggerSelfcheck: () => invoke('logger-selfcheck'),
  getLibraryHealth: () => invoke('get-library-health'),
  getSystemHealth: () => invoke('get-system-health'),
  cleanupOrphanedAssets: () => invoke('cleanup-orphaned-assets'),
  loadGroups: () => invoke('load-groups'),
  saveGroups: (groups) => invoke('save-groups', groups),
  
  // Log management APIs
  getUserDataPath: () => invoke('get-user-data-path'),
  listLogFiles: () => invoke('list-log-files'),
  readLogFile: (filename) => invoke('read-log-file', filename),
  getLogFileInfo: (filename) => invoke('get-log-file-info', filename),
  cleanupOldLogs: (daysToKeep) => invoke('cleanup-old-logs', daysToKeep),
  deleteLogFiles: (filenames) => invoke('delete-log-files', { filenames }),
  
  logToMain: (payload) => {
    sendRendererLog(payload)
  },

  onCloseRequest: (callback) => {
    ipcRenderer.on('close-request', () => callback());
  },
  onLibraryRefresh: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('library-refresh', handler);
    return () => {
      try { ipcRenderer.removeListener('library-refresh', handler); } catch { }
    };
  },
  readyToClose: () => ipcRenderer.send('ready-to-close'),

  clipboard: {
    writeText: (text) => clipboard.writeText(text || '')
  }
});

process.once('loaded', () => {
  try {
    window.addEventListener('error', (event) => {
      const err = event?.error;
      const payload = {
        level: 'error',
        type: 'window-error',
        message: event?.message || 'Renderer window error',
        meta: {
          filename: event?.filename,
          lineno: event?.lineno,
          colno: event?.colno,
          stack: err?.stack
        }
      };
      sendRendererLog(payload);
      try { ipcRenderer.send('renderer-fatal', payload) } catch {}
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event?.reason;
      const payload = {
        level: 'error',
        type: 'unhandledrejection',
        message: reason?.message || String(reason || 'Unhandled rejection'),
        meta: { stack: reason?.stack }
      };
      sendRendererLog(payload);
      try { ipcRenderer.send('renderer-fatal', payload) } catch {}
    });
  } catch (e) {
    sendRendererLog({
      level: 'error',
      type: 'preload-error-hook-failed',
      message: e?.message || String(e)
    });
  }
});
