const fs = require('fs');
const path = require('path');

const snapshotPath = 'C:\\Users\\codyb\\AppData\\Roaming\\safety-assistant-desktop\\SafetyAssistantData\\local_snapshot.json';

if (!fs.existsSync(snapshotPath)) {
  console.error('Snapshot file does not exist at:', snapshotPath);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const empTable = data.tables['employees'];
const certTable = data.tables['expiring_certs'];

function normalizeJob(job) {
  if (!job || typeof job !== 'string') return job;
  const clean = job.trim();
  const match = clean.match(/^(\d{3}-\d{2})\.0*(\d+)$/);
  if (match) {
    return match[1] + '.' + match[2];
  }
  return clean;
}

// 1. Specific employee hierarchy & deduplicated positions
const specificEmpUpdates = {
  'brian dixon': { job: '043-26.1', loc: 'Three Rivers' },
  'owen canavan': { job: '043-26.2', loc: 'Three Rivers' },
  'jeff pamin': { job: '043-26.3', loc: 'Three Rivers' },
  'gage northrup': { job: '043-26.4', loc: 'Three Rivers' },
  'zdenik strunk': { job: '043-26.5', loc: 'Three Rivers' },

  'cody schoonover': { job: '049-26.1', loc: 'Butte' },
  'dustyn hall': { job: '049-26.2', loc: 'Butte' },
  'dylan averyt': { job: '049-26.3', loc: 'Butte' },
  'austin bourdo': { job: '049-26.4', loc: 'Butte' },
  'john baker': { job: '049-26.5', loc: 'Butte' },
  'lucas kovalsky': { job: '049-26.6', loc: 'Butte' },

  'dustin graham': { job: '009-26.1', loc: 'Helena' },
  'dusty hendrickson': { job: '009-26.2', loc: 'Helena' },
  'randy dean': { job: '009-26.3', loc: 'Helena' },
  'jackson eads': { job: '009-26.4', loc: 'Helena' },

  'waco worts': { job: '029-26.1', loc: 'Belgrade' },
  'andrew west': { job: '029-26.2', loc: 'Belgrade' },
  'caleb uyboco': { job: '029-26.3', loc: 'Belgrade' },
  'gavin ruud': { job: '029-26.4', loc: 'Belgrade' },

  'cory didonato': { job: '005-26.5', loc: 'Helena' },
  'jt kale': { job: '005-26.6', loc: 'Helena' },
  'jaidon marcum': { job: '005-26.7', loc: 'Leave' }
};

let empUpdatedCount = 0;
let empNormalizedCount = 0;

empTable.rows.forEach(r => {
  const name = String(r['Employee Name'] || r['Name'] || Object.values(r)[0] || '').toLowerCase().trim();
  if (specificEmpUpdates[name]) {
    const u = specificEmpUpdates[name];
    if (u.job) r['Job Number'] = u.job;
    if (u.loc) r['Location'] = u.loc;
    empUpdatedCount++;
  } else {
    const cur = r['Job Number'];
    const norm = normalizeJob(cur);
    if (cur !== norm) {
      r['Job Number'] = norm;
      empNormalizedCount++;
    }
  }

  if (r['Secondary Job Number']) {
    const parts = r['Secondary Job Number'].split(',').map(s => normalizeJob(s.trim())).filter(Boolean);
    r['Secondary Job Number'] = parts.join(', ');
  }
});

console.log('Specific employee records updated:', empUpdatedCount);
console.log('General employee job numbers normalized to strip 0 placeholder:', empNormalizedCount);

// Rebuild employees rawGrid
if (empTable.headers && empTable.rawGrid) {
  empTable.rawGrid = [empTable.headers];
  empTable.rows.forEach(r => {
    empTable.rawGrid.push(empTable.headers.map(h => r[h] !== undefined ? r[h] : ''));
  });
  empTable.maxRows = empTable.rawGrid.length;
}

// Build map of employee name to normalized job number and location
const empLookup = new Map();
empTable.rows.forEach(r => {
  const name = String(r['Employee Name'] || r['Name'] || Object.values(r)[0] || '').toLowerCase().trim();
  if (name) {
    empLookup.set(name, {
      job: r['Job Number'],
      loc: r['Location']
    });
  }
});

// 2. Normalize expiring_certs table
let certsUpdatedCount = 0;
let trenchUpdatedCount = 0;

certTable.rows.forEach(r => {
  const name = String(r['Employee Name'] || r['Name'] || Object.values(r)[0] || '').toLowerCase().trim();
  const itemType = String(r['Item Type'] || r['Certification'] || '').toLowerCase().trim();

  let targetJob = '';
  let targetLoc = '';
  if (empLookup.has(name)) {
    targetJob = empLookup.get(name).job;
    targetLoc = empLookup.get(name).loc;
  } else {
    targetJob = normalizeJob(r['Job #']);
  }

  if (targetJob && r['Job #'] !== targetJob) {
    r['Job #'] = targetJob;
    certsUpdatedCount++;
  }
  if (targetLoc && r['Location'] !== targetLoc) {
    r['Location'] = targetLoc;
    certsUpdatedCount++;
  }

  // Reconcile OSHA Trench Comp Person
  if (itemType.includes('trench')) {
    let curAcq = String(r['Date Acquired'] || '').trim();
    let curExp = String(r['Expiration Date'] || '').trim();

    if (!curAcq && curExp && curExp !== 'N/A' && curExp !== 'No Date Set') {
      r['Date Acquired'] = curExp;
      curAcq = curExp;
    }

    r['Expiration Date'] = 'N/A';
    r['Days Until Expiration'] = 'N/A';
    const hasAcq = curAcq && curAcq !== 'N/A' && curAcq !== 'No Date Set';
    r['Status'] = hasAcq ? 'OK' : 'No Date Set';
    trenchUpdatedCount++;
  }
});

console.log('Expiring certs rows updated (Job#/Location):', certsUpdatedCount);
console.log('OSHA Trench cert rows updated to non-expiring N/A:', trenchUpdatedCount);

// Rebuild expiring_certs rawGrid
if (certTable.headers && certTable.rawGrid) {
  certTable.rawGrid = [certTable.headers];
  certTable.rows.forEach(r => {
    certTable.rawGrid.push(certTable.headers.map(h => r[h] !== undefined ? r[h] : ''));
  });
  certTable.maxRows = certTable.rawGrid.length;
}

// 3. Normalize other companion tables
['employee_history', 'dot_drug_tests', 'job_tracking'].forEach(tKey => {
  const tbl = data.tables[tKey];
  if (!tbl || !tbl.rows) return;
  let count = 0;
  tbl.rows.forEach(r => {
    for (const [k, v] of Object.entries(r)) {
      if (typeof v === 'string' && /^(\d{3}-\d{2})\.0+(\d+)$/.test(v.trim())) {
        r[k] = normalizeJob(v);
        count++;
      }
    }
  });
  if (count > 0 && tbl.headers && tbl.rawGrid) {
    tbl.rawGrid = [tbl.headers];
    tbl.rows.forEach(r => {
      tbl.rawGrid.push(tbl.headers.map(h => r[h] !== undefined ? r[h] : ''));
    });
    tbl.maxRows = tbl.rawGrid.length;
    console.log('Normalized', count, 'job numbers in table', tKey);
  }
});

// 4. Queue sync mutations
if (!data.syncQueue) data.syncQueue = [];
data.syncQueue.push({
  id: 'mut_' + Date.now() + '_strip0_emp',
  action: 'REPLACE_TABLE_DATA',
  sheetName: 'Employees',
  tableKey: 'employees',
  headers: empTable.headers,
  rows: empTable.rows,
  rawGrid: empTable.rawGrid,
  timestamp: Date.now()
});

data.syncQueue.push({
  id: 'mut_' + Date.now() + '_strip0_certs',
  action: 'REPLACE_TABLE_DATA',
  sheetName: 'Expiring Certs',
  tableKey: 'expiring_certs',
  headers: certTable.headers,
  rows: certTable.rows,
  rawGrid: certTable.rawGrid,
  timestamp: Date.now()
});

fs.writeFileSync(snapshotPath, JSON.stringify(data, null, 2), 'utf8');
console.log('Successfully saved local_snapshot.json with all 0 placeholders stripped!');
