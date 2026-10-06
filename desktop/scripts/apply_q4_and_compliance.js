const fs = require('fs');
const snapPath = 'C:/Users/codyb/AppData/Roaming/safety-assistant-desktop/SafetyAssistantData/local_snapshot.json';
const outboxPath = 'C:/Users/codyb/AppData/Roaming/safety-assistant-desktop/SafetyAssistantData/sync_outbox.json';

const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
const outbox = JSON.parse(fs.readFileSync(outboxPath, 'utf8'));

// 1. Build employee roster map
const emps = snap.tables['employees'].rows;
const activeEmps = emps.filter(e => {
  const loc = (e['Location']||'').toLowerCase();
  const lastDay = (e['Last Day']||'').trim();
  return !lastDay && !['previous employee', 'terminated', 'quit'].includes(loc);
});

const rosterByJob = {};
activeEmps.forEach(e => {
  const job = (e['Job Number']||'').trim();
  const base = job.split('.')[0];
  if (!base) return;
  if (!rosterByJob[base]) rosterByJob[base] = [];
  rosterByJob[base].push(e);
});

// Alias Map
const aliasMap = Object.assign({}, snap.configs['FY_TRANSITION_ALIAS_MAP'] || {});
aliasMap['048-26'] = '030-27';
aliasMap['050-26'] = '035-27';
aliasMap['018-16'] = '018-27';
aliasMap['042-27'] = '007-27';
aliasMap['048-27'] = '014-27';
aliasMap['040-26 (Fri-Sat)'] = '031-27';

// -------------------------------------------------------------------------
// PART 1: UPDATE TRAINING TRACKING (Q4)
// -------------------------------------------------------------------------
const tt = snap.tables['training_tracking'];
const q4Months = ['october', 'november', 'december'];

let updatedTTCount = 0;
// Keep non-Q4 rows exactly as is
const nonQ4Rows = tt.rows.filter(r => !q4Months.includes(String(r['Month']).toLowerCase()));
const q4Rows = tt.rows.filter(r => q4Months.includes(String(r['Month']).toLowerCase()));

// Deduplicate and map Q4 rows
const updatedQ4Rows = [];
const seenQ4Key = new Set();

q4Rows.forEach(r => {
  const m = String(r['Month']).trim();
  const curCrew = String(r['Crew #'] || '').trim();
  if (curCrew === '057-26') return; // Former employee/crew

  const targetCrew = aliasMap[curCrew] || curCrew;
  const key = m.toLowerCase() + '_' + targetCrew;
  if (seenQ4Key.has(key)) return; // Avoid duplicate rows
  seenQ4Key.add(key);

  const roster = rosterByJob[targetCrew] || [];
  const leadEmp = roster.find(e => (e['Crew Lead']||'').toLowerCase() === 'yes') || roster[0];
  const leadName = leadEmp ? leadEmp['Employee Name'] : r['Crew Lead'];
  const attendeeList = roster.length > 0 ? roster.map(e => e['Employee Name']).join(', ') : r['Attendees'];
  const crewSize = roster.length > 0 ? String(roster.length) : r['Crew Size'];

  r['Crew #'] = targetCrew;
  if (leadName) r['Crew Lead'] = leadName;
  if (attendeeList) r['Attendees'] = attendeeList;
  if (crewSize) r['Crew Size'] = crewSize;

  updatedQ4Rows.push(r);
  updatedTTCount++;
});

// Reassemble training tracking rows
tt.rows = [...nonQ4Rows, ...updatedQ4Rows];
// Renumber _rowIdx
tt.rows.forEach((r, idx) => { r._rowIdx = idx + 2; });

if (tt.headers) {
  tt.rawGrid = [tt.headers];
  tt.rows.forEach(r => {
    tt.rawGrid.push(tt.headers.map(h => r[h] !== undefined ? r[h] : ''));
  });
  tt.maxRows = tt.rawGrid.length;
}
console.log('Training Tracking rows updated for Q4:', updatedTTCount, 'Total TT rows now:', tt.rows.length);

// -------------------------------------------------------------------------
// PART 2: MERGE SAFETY COMPLIANCE WEEK 09/27/2026
// -------------------------------------------------------------------------
const sc = snap.tables['safety_compliance'];
const nonSep27Rows = sc.rows.filter(r => r['Week Start'] !== '09/27/2026');
const sep27Rows = sc.rows.filter(r => r['Week Start'] === '09/27/2026');

function mergeVals(vals) {
  if (vals.includes('✅')) return '✅';
  if (vals.includes('✅L')) return '✅L';
  if (vals.includes('⏳')) return '⏳';
  if (vals.includes('❌⏳')) return '❌⏳';
  if (vals.includes('N/A')) return 'N/A';
  if (vals.includes('❌')) return '❌';
  return '';
}

const groups = {};
sep27Rows.forEach(r => {
  const job = r['Job Number'];
  if (job === '048-26') return; // ignore orphan
  const canon = aliasMap[job] || job;
  if (!groups[canon]) groups[canon] = [];
  groups[canon].push(r);
});

const mergedSep27Rows = [];
const cols = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Weekly Meeting', 'Monthly Checklist'];

Object.keys(groups).sort().forEach(job => {
  const rows = groups[job];
  const foreman = rows.find(r => r['Job Number'] === job && r['Foreman'])?.Foreman || rows.find(r => r['Foreman'])?.Foreman || '';
  
  const mergedRow = {
    'Week Start': '09/27/2026',
    'Job Number': job,
    'Foreman': foreman
  };
  
  cols.forEach(c => {
    mergedRow[c] = mergeVals(rows.map(r => r[c]));
  });
  
  // Status calculation
  const dayVals = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => mergedRow[d]);
  const wm = mergedRow['Weekly Meeting'];
  const mc = mergedRow['Monthly Checklist'];
  
  const hasMissing = dayVals.includes('❌') || wm === '❌' || mc === '❌';
  const hasPending = dayVals.includes('⏳') || wm === '⏳' || mc === '❌⏳';
  
  if (hasMissing) {
    mergedRow['Status'] = 'Missing Reports';
  } else if (hasPending) {
    mergedRow['Status'] = 'Pending';
  } else {
    mergedRow['Status'] = 'Complete';
  }
  
  mergedRow['Updated'] = '10/05/2026 18:30';
  mergedSep27Rows.push(mergedRow);
});

sc.rows = [...nonSep27Rows, ...mergedSep27Rows];
sc.rows.forEach((r, idx) => { r._rowIdx = idx + 2; });

if (sc.headers) {
  sc.rawGrid = [sc.headers];
  sc.rows.forEach(r => {
    sc.rawGrid.push(sc.headers.map(h => r[h] !== undefined ? r[h] : ''));
  });
  sc.maxRows = sc.rawGrid.length;
}
console.log('Safety Compliance 09/27/2026 merged into:', mergedSep27Rows.length, 'rows. Total SC rows now:', sc.rows.length);

// Save snapshot
fs.writeFileSync(snapPath, JSON.stringify(snap, null, 2), 'utf8');
console.log('Saved local_snapshot.json successfully');

// -------------------------------------------------------------------------
// PART 3: QUEUE REPLACE_TABLE_DATA IN OUTBOX
// -------------------------------------------------------------------------
const now = new Date().toISOString();
// Clean previous REPLACE_TABLE_DATA for these tables if any
const filteredOutbox = outbox.filter(item => 
  !(item.type === 'REPLACE_TABLE_DATA' && ['training_tracking', 'safety_compliance'].includes(item.table))
);

filteredOutbox.push({
  id: 'outbox_' + Date.now() + '_tt',
  type: 'REPLACE_TABLE_DATA',
  table: 'training_tracking',
  sheetName: 'Training Tracking',
  data: tt.rows,
  headers: tt.headers,
  timestamp: now
});

filteredOutbox.push({
  id: 'outbox_' + Date.now() + '_sc',
  type: 'REPLACE_TABLE_DATA',
  table: 'safety_compliance',
  sheetName: 'Safety Compliance',
  data: sc.rows,
  headers: sc.headers,
  timestamp: now
});

fs.writeFileSync(outboxPath, JSON.stringify(filteredOutbox, null, 2), 'utf8');
console.log('Queued sync mutations in outbox. Total items in outbox:', filteredOutbox.length);
