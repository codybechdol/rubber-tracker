const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

app.setAppUserModelId('com.safetyassistant.desktop');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    title: 'Safety Assistant (Offline Field App)',
    backgroundColor: '#1e293b',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Enable Ctrl+R / F5 refresh
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
      mainWindow.reload();
    }
  });

  // Remove default menu for sleek app interface
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers for Local Data Files
const USER_DATA_DIR = path.join(app.getPath('userData'), 'SafetyAssistantData');
if (!fs.existsSync(USER_DATA_DIR)) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

const LOCAL_SNAPSHOT_PATH = path.join(USER_DATA_DIR, 'local_snapshot.json');
const LOCAL_OUTBOX_PATH = path.join(USER_DATA_DIR, 'sync_outbox.json');

ipcMain.handle('get-local-snapshot', async () => {
  try {
    if (fs.existsSync(LOCAL_SNAPSHOT_PATH)) {
      const data = fs.readFileSync(LOCAL_SNAPSHOT_PATH, 'utf8');
      return JSON.parse(data);
    }
    return null;
  } catch (err) {
    console.error('Error reading local snapshot:', err);
    return null;
  }
});

ipcMain.handle('save-local-snapshot', async (event, snapshot) => {
  try {
    fs.writeFileSync(LOCAL_SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    console.error('Error saving local snapshot:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-local-outbox', async () => {
  try {
    if (fs.existsSync(LOCAL_OUTBOX_PATH)) {
      const data = fs.readFileSync(LOCAL_OUTBOX_PATH, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (err) {
    console.error('Error reading local outbox:', err);
    return [];
  }
});

ipcMain.handle('save-local-outbox', async (event, outbox) => {
  try {
    fs.writeFileSync(LOCAL_OUTBOX_PATH, JSON.stringify(outbox, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    console.error('Error saving local outbox:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('select-snapshot-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'JSON Snapshot', extensions: ['json'] }]
  });
  if (!result.canceled && result.filePaths.length > 0) {
    try {
      const content = fs.readFileSync(result.filePaths[0], 'utf8');
      return JSON.parse(content);
    } catch (e) {
      return { error: e.message };
    }
  }
  return null;
});
