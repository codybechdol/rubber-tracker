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
  savePdfToFile: (base64Data, defaultFilename) => ipcRenderer.invoke('save-pdf-to-file', { base64Data, defaultFilename })
});
