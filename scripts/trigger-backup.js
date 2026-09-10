/**
 * trigger-backup.js - CLI runner to trigger Google Apps Script Backup
 *
 * Creates both:
 * 1. Google Sheet copy: Safety Assistant - Backup YYYY-MM-DD_HH-mm-ss
 * 2. Timestamped JSON snapshot: Safety Assistant - Backup YYYY-MM-DD_HH-mm-ss.json
 * in Google Drive folder "Glove Manager Backups".
 *
 * Usage: node scripts/trigger-backup.js
 */

const https = require('https');
const { URL } = require('url');

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzsCSiAhGr5aOMoEF6OlSInIgdnkvQbx_9zRcgdtA7usX7nZbPzlfZulyHDVTfStiuA/exec';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function requestWithRedirects(targetUrl, method, postData, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 6) {
      return reject(new Error('Too many redirects (max 6)'));
    }

    const parsed = new URL(targetUrl);
    const headers = {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json, text/plain, */*'
    };

    if (method === 'POST' && postData) {
      headers['Content-Type'] = 'text/plain;charset=utf-8';
      headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request({
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: method,
      headers: headers,
      timeout: 120000
    }, (res) => {
      // Follow HTTP 301, 302, 303, 307 redirects
      if ([301, 302, 303, 307].includes(res.statusCode) && res.headers.location) {
        const nextUrl = new URL(res.headers.location, targetUrl).toString();
        // Redirects from Apps Script Web App to script.googleusercontent.com are handled via GET
        return resolve(requestWithRedirects(nextUrl, 'GET', null, redirectCount + 1));
      }

      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP Error ${res.statusCode}: ${data.substring(0, 300)}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out after 60 seconds'));
    });

    req.on('error', err => reject(err));

    if (method === 'POST' && postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function triggerBackup() {
  console.log('----------------------------------------');
  console.log('Initiating Google Drive backup...');
  console.log(`Endpoint: ${WEB_APP_URL.substring(0, 65)}...`);
  console.log('Sending backup request (Google Sheet + JSON snapshot)...');
  console.log('----------------------------------------');

  const startTime = Date.now();
  const payload = JSON.stringify({
    action: 'createBackup',
    forceFullCopy: true
  });

  try {
    const rawResponse = await requestWithRedirects(WEB_APP_URL, 'POST', payload);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    let result = {};
    try {
      result = JSON.parse(rawResponse);
    } catch (e) {
      throw new Error(`Invalid JSON response: ${rawResponse.substring(0, 200)}`);
    }

    if (result.status === 'ok' && result.success) {
      console.log('\n========================================');
      console.log('  GOOGLE DRIVE BACKUP COMPLETED!');
      console.log('========================================');
      console.log(` [OK] Google Sheet Backup:  ${result.backupName || 'Created'}`);
      console.log(` [OK] JSON Snapshot Backup:  ${result.jsonBackupName || (result.backupName ? result.backupName + '.json' : 'Created')}`);
      console.log(` [OK] Offline Sync Cache:    SafetyAssistant_Sync_Snapshot.json (Updated)`);
      console.log(` [OK] Destination Folder:    Google Drive > Glove Manager Backups`);
      console.log(` [OK] Elapsed Time:          ${elapsed}s`);
      console.log('========================================\n');
      process.exit(0);
    } else {
      console.warn('\n[WARNING] Backup API returned unsuccessful response:');
      console.warn(result);
      process.exit(0); // Exit gracefully so push doesn't fail
    }

  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n[ERROR] Failed to create Google Drive backup (${elapsed}s):`, err.message);
    console.warn('The code deployment itself succeeded, but the backup trigger encountered an issue.');
    process.exit(0); // Exit 0 so local deployment isn't blocked if network/drive had a hiccup
  }
}

triggerBackup();
