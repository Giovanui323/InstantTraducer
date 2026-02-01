const { contextBridge, ipcRenderer, clipboard } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: () => invoke('open-file-dialog'),
  selectDirectoryDialog: () => invoke('select-directory-dialog'),
  readPdfFile: (filePath) => invoke('read-pdf-file', filePath),

  getTranslations: () => invoke('get-translations'),
  loadTranslation: (fileId) => invoke('load-translation', fileId),
  saveTranslation: (payload) => {
    try {
      ipcRenderer.send('save-translation-requested', { fileId: payload?.fileId });
    } catch { }
    return invoke('save-translation', payload);
  },
  deleteTranslation: (fileId) => invoke('delete-translation', fileId),
  getTrashContents: () => invoke('get-trash-contents'),
  restoreTrashItem: (trashId) => invoke('restore-trash-item', trashId),
  restoreAllTrashItems: () => invoke('restore-all-trash-items'),
  deleteTrashItemPermanently: (trashId) => invoke('delete-trash-item-permanently', trashId),
  emptyTrash: () => invoke('empty-trash'),
  renameTranslation: (payload) => invoke('rename-translation', payload),

  saveSettings: (settings) => invoke('save-settings', settings),
  loadSettings: () => invoke('load-settings'),

  saveProjectImage: (payload) => invoke('save-project-image', payload),
  readProjectImage: (payload) => invoke('read-project-image', payload),
  readProjectImageBase64: (payload) => invoke('read-project-image-base64', payload),
  deleteProjectImage: (payload) => invoke('delete-project-image', payload),

  copyOriginalPdf: (payload) => invoke('copy-original-pdf', payload),
  saveOriginalPdfBuffer: (payload) => invoke('save-original-pdf-buffer', payload),
  getOriginalPdfPath: (fileId) => invoke('get-original-pdf-path', fileId),

  exportTranslationsPdf: (payload) => invoke('export-translations-pdf', payload),

  exportProjectPackage: (payload) => invoke('export-project-package', payload),
  importProjectPackage: () => invoke('import-project-package'),

  openProjectDialog: () => invoke('open-project-dialog'),
  openLogsDir: () => invoke('open-logs-dir'),
  loggerSelfcheck: () => invoke('logger-selfcheck'),
  loadGroups: () => invoke('load-groups'),
  saveGroups: (groups) => invoke('save-groups', groups),
  logToMain: (payload) => {
    try { ipcRenderer.send('renderer-log', payload) } catch {}
  },

  clipboard: {
    writeText: (text) => clipboard.writeText(text || '')
  }
});
