const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  getLocalSnapshot: () => ipcRenderer.invoke('get-local-snapshot'),
  saveLocalSnapshot: (snapshot) => ipcRenderer.invoke('save-local-snapshot', snapshot),
  getLocalOutbox: () => ipcRenderer.invoke('get-local-outbox'),
  saveLocalOutbox: (outbox) => ipcRenderer.invoke('save-local-outbox', outbox),
  selectSnapshotFile: () => ipcRenderer.invoke('select-snapshot-file')
});
