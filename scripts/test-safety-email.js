const https = require('https');
const { URL } = require('url');

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzsCSiAhGr5aOMoEF6OlSInIgdnkvQbx_9zRcgdtA7usX7nZbPzlfZulyHDVTfStiuA/exec';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) SafetyAssistant/2026.1 Chrome/120.0.0.0 Safari/537.36';

function requestWithRedirect(targetUrl, method, postData, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 6) return reject(new Error('Too many redirects'));

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
      if ([301, 302, 303, 307].includes(res.statusCode) && res.headers.location) {
        const nextUrl = new URL(res.headers.location, targetUrl).toString();
        return resolve(requestWithRedirect(nextUrl, 'GET', null, redirectCount + 1));
      }

      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: data });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timed out'));
    });

    req.on('error', err => reject(err));

    if (method === 'POST' && postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runMultiBatch() {
  console.log('Starting multi-batch test to see which batch causes 404 or error...');

  let batchIndex = 1;
  let isComplete = false;
  let isPostProcessing = false;
  let lastResult = null;

  while (!isComplete && batchIndex <= 10) {
    console.log(`\n--- Executing Batch #${batchIndex} (isPostProcessing=${isPostProcessing}) ---`);
    const payload = JSON.stringify({
      action: 'processSafetyEmails',
      daysBack: 7,
      batchSize: 15,
      reportTypeFilter: 'ALL',
      newOnlyMode: true,
      skipPdfExtraction: true,
      endDate: null,
      isPostProcessing: isPostProcessing,
      prevResult: lastResult,
      resetBatch: (batchIndex === 1 && !isPostProcessing)
    });

    const startTime = Date.now();
    try {
      const res = await requestWithRedirect(WEB_APP_URL, 'POST', payload);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`Batch #${batchIndex} completed in ${elapsed}s with status ${res.statusCode}`);
      
      if (res.statusCode !== 200) {
        console.error(`HTTP ${res.statusCode} Error body snippet:`, res.body.substring(0, 500));
        break;
      }

      let data;
      try {
        data = JSON.parse(res.body);
      } catch (e) {
        console.error('Failed to parse JSON body snippet:', res.body.substring(0, 500));
        break;
      }

      console.log('Result summary:', {
        status: data.status,
        success: data.success,
        complete: data.complete,
        isPostProcessing: data.isPostProcessing,
        threadsRemaining: data.result ? data.result.threadsRemaining : 'N/A',
        threadsProcessed: data.result ? data.result.threadsProcessed : 'N/A',
        processedThisBatch: data.result ? data.result.processedThisBatch : 'N/A',
        skippedThisBatch: data.result ? data.result.skippedThisBatch : 'N/A'
      });

      lastResult = data.result;
      if (data.complete) {
        console.log('\nProcessing fully complete!');
        isComplete = true;
      } else if (data.isPostProcessing) {
        isPostProcessing = true;
      }
      await new Promise(r => setTimeout(r, 1200));
      batchIndex++;
    } catch (err) {
      console.error(`Batch #${batchIndex} exception:`, err);
      break;
    }
  }
}

runMultiBatch();
