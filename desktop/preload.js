const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  getLocalSnapshot: () => ipcRenderer.invoke('get-local-snapshot'),
  saveLocalSnapshot: (snapshot) => ipcRenderer.invoke('save-local-snapshot', snapshot),
  getLocalOutbox: () => ipcRenderer.invoke('get-local-outbox'),
  saveLocalOutbox: (outbox) => ipcRenderer.invoke('save-local-outbox', outbox),
  selectSnapshotFile: () => ipcRenderer.invoke('select-snapshot-file'),
  sendSyncRequest: (options) => ipcRenderer.invoke('send-sync-request', options),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openPdfExternally: (base64Data, filename) => ipcRenderer.invoke('open-pdf-externally', { base64Data, filename }),
  savePdfToFile: (base64Data, defaultFilename) => ipcRenderer.invoke('save-pdf-to-file', { base64Data, defaultFilename }),
  saveHtmlToPdf: (htmlContent, defaultFilename) => ipcRenderer.invoke('save-html-to-pdf', { htmlContent, defaultFilename }),
  forceFocusWindow: () => ipcRenderer.invoke('force-focus-window'),
  selectCertPhotoFile: () => ipcRenderer.invoke('select-cert-photo-file'),
  saveCertPhoto: (data) => ipcRenderer.invoke('save-cert-photo', data),
  getCertPhoto: (params) => ipcRenderer.invoke('get-cert-photo', params),
  openCertPhotoExternally: (params) => ipcRenderer.invoke('open-cert-photo-externally', params),
  showCertPhotoInFolder: (params) => ipcRenderer.invoke('show-cert-photo-in-folder', params),
  deleteCertPhoto: (params) => ipcRenderer.invoke('delete-cert-photo', params)
});
