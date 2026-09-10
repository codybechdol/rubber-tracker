const https = require('https');
const { URL } = require('url');

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzsCSiAhGr5aOMoEF6OlSInIgdnkvQbx_9zRcgdtA7usX7nZbPzlfZulyHDVTfStiuA/exec';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) SafetyAssistant/2026.1 Chrome/120.0.0.0 Safari/537.36';

function requestDetailed(targetUrl, method, postData) {
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
    console.log(`Sending ${method} to ${targetUrl.substring(0, 60)}...`);
    const req = https.request({
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: method,
      headers: headers,
      timeout: 120000
    }, (res) => {
      console.log(`Response status: ${res.statusCode}`);
      console.log(`Response headers:`, res.headers);
      if ([301, 302, 303, 307].includes(res.statusCode) && res.headers.location) {
        console.log(`Redirecting to: ${res.headers.location.substring(0, 80)}...`);
        return resolve(requestDetailed(res.headers.location, 'GET', null));
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

async function runSingleBatch() {
  // Let's run just ONE batch with resetBatch: false (resuming at Batch 10)
  const payload = JSON.stringify({
    action: 'processSafetyEmails',
    daysBack: 7,
    batchSize: 1,
    reportTypeFilter: 'ALL',
    newOnlyMode: true,
    skipPdfExtraction: false,
    endDate: null,
    isPostProcessing: false,
    prevResult: null,
    resetBatch: false
  });
  const t0 = Date.now();
  const res = await requestDetailed(WEB_APP_URL, 'POST', payload);
  console.log(`Elapsed: ${((Date.now() - t0)/1000).toFixed(1)}s`);
  console.log('Final status code:', res.statusCode);
  console.log('Body length:', res.body.length);
  console.log('Body start:', res.body.substring(0, 600));
}

runSingleBatch();
