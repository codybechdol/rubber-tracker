const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const dns = require('dns');

try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {}

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

  // Enable Ctrl+R / F5 refresh and F12 / Ctrl+Shift+I for DevTools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
      mainWindow.reload();
    }
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // Remove default menu for sleek app interface
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(async () => {
  try {
    if (session && session.defaultSession) {
      await session.defaultSession.clearStorageData({
        storages: ['serviceworkers', 'cachestorage']
      });
    }
  } catch (e) {
    console.warn('Session clearStorageData warning:', e);
  }

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
    await fs.promises.writeFile(LOCAL_SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), 'utf8');
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
    await fs.promises.writeFile(LOCAL_OUTBOX_PATH, JSON.stringify(outbox, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    console.error('Error saving local outbox:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('select-snapshot-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'JSON/Text Snapshot', extensions: ['json', 'txt'] }]
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

// Native HTTPS Sync Bridge (bypasses browser CORS & redirects seamlessly)
const https = require('https');

function makeGoogleAppsScriptRequest(targetUrl, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    function requestWithRedirect(currentUrl, currentMethod, currentData, redirectCount = 0) {
      if (redirectCount > 5) {
        return reject(new Error('Too many redirects'));
      }

      const parsedUrl = new URL(currentUrl);
      const isPost = currentMethod === 'POST';
      const postBody = currentData ? (typeof currentData === 'string' ? currentData : JSON.stringify(currentData)) : null;

      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: currentMethod,
        family: 4,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) SafetyAssistant/2026.1 Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*'
        }
      };

      if (isPost && postBody) {
        options.headers['Content-Type'] = 'text/plain;charset=utf-8';
        options.headers['Content-Length'] = Buffer.byteLength(postBody);
      }

      const req = https.request(options, (res) => {
        // Automatically follow Google Apps Script 302/307 redirects to echo URL
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let redirectUrl = res.headers.location;
          if (!redirectUrl.startsWith('http')) {
            redirectUrl = new URL(redirectUrl, currentUrl).href;
          }
          return requestWithRedirect(redirectUrl, 'GET', null, redirectCount + 1);
        }

        let responseBody = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(responseBody);
            resolve({ success: true, statusCode: res.statusCode, data: json });
          } catch (e) {
            resolve({ success: false, statusCode: res.statusCode, raw: responseBody, error: 'Web App returned non-JSON response. Please verify in Google Sheets: Extensions > Apps Script > Deploy > Manage deployments, and ensure "Who has access" is set to "Anyone".' });
          }
        });
      });

      req.setTimeout(360000, () => {
        req.destroy(new Error('Sync network request timed out after 360 seconds. Please check your internet connection or Web App deployment.'));
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (isPost && postBody) {
        req.write(postBody);
      }
      req.end();
    }

    requestWithRedirect(targetUrl, method, data);
  });
}

ipcMain.handle('send-sync-request', async (event, { url, method, body }) => {
  try {
    return await makeGoogleAppsScriptRequest(url, method, body);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('open-external', async (event, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
  }
  return { success: true };
});
