const https = require('https');
const { URL } = require('url');

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzsCSiAhGr5aOMoEF6OlSInIgdnkvQbx_9zRcgdtA7usX7nZbPzlfZulyHDVTfStiuA/exec';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) SafetyAssistant/2026.1 Chrome/120.0.0.0 Safari/537.36';

function requestWithRedirect(targetUrl, method, postData) {
  return new Promise((resolve, reject) => {
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
      port: 443,
      path: parsed.pathname + parsed.search,
      method: method,
      headers: headers,
      timeout: 120000
    }, (res) => {
      if ([301, 302, 303, 307].includes(res.statusCode) && res.headers.location) {
        return resolve(requestWithRedirect(res.headers.location, 'GET', null));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (method === 'POST' && postData) req.write(postData);
    req.end();
  });
}

async function testBatchSize1() {
  console.log('Testing with batchSize=1 (safe single-thread batching)...');
  let isComplete = false;
  let batchIndex = 1;
  let lastResult = null;

  while (!isComplete && batchIndex <= 10) {
    console.log(`\n--- Executing Batch #${batchIndex} with batchSize=1 ---`);
    const payload = JSON.stringify({
      action: 'processSafetyEmails',
      daysBack: 7,
      batchSize: 1,
      reportTypeFilter: 'ALL',
      newOnlyMode: true,
      skipPdfExtraction: false,
      endDate: null,
      isPostProcessing: false,
      prevResult: lastResult,
      resetBatch: (batchIndex === 1)
    });
    const t0 = Date.now();
    const res = await requestWithRedirect(WEB_APP_URL, 'POST', payload);
    const elapsed = ((Date.now() - t0)/1000).toFixed(1);
    console.log(`Batch #${batchIndex} completed in ${elapsed}s, status: ${res.statusCode}`);
    if (res.statusCode !== 200) {
      console.log('Error snippet:', res.body.substring(0, 300));
      break;
    }
    const data = JSON.parse(res.body);
    console.log(`Summary: processed=${data.result?.processedThisBatch}, skipped=${data.result?.skippedThisBatch}, remaining=${data.result?.threadsRemaining}`);
    lastResult = data.result;
    if (data.complete) break;
    batchIndex++;
  }
}

testBatchSize1();
