const fs = require('fs');

const snapPath = 'C:/Users/codyb/AppData/Roaming/safety-assistant-desktop/SafetyAssistantData/local_snapshot.json';
const outboxPath = 'C:/Users/codyb/AppData/Roaming/safety-assistant-desktop/SafetyAssistantData/sync_outbox.json';

const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
const outbox = JSON.parse(fs.readFileSync(outboxPath, 'utf8'));

const jobs = (snap.tables['job_tracking'] || snap.tables['Job Tracking']).rows;
const foremanByJob = {};
const statusByJob = {};
jobs.forEach(j => {
  const num = (j['Job Number'] || '').trim();
  if (num) {
    foremanByJob[num] = (j['Foreman'] || '').trim();
    statusByJob[num] = (j['Status'] || '').trim();
  }
});

const tt = snap.tables['training_tracking'] || snap.tables['Training Tracking'];
let updatedLeadCount = 0;
let reorderedAttendeesCount = 0;

tt.rows.forEach(r => {
  const crew = (r['Crew #'] || '').trim();
  const jtForeman = foremanByJob[crew];
  const jtStatus = (statusByJob[crew] || '').toLowerCase();

  // If active crew and valid foreman found
  if (jtForeman && jtStatus === 'active') {
    const curLead = (r['Crew Lead'] || '').trim();
    if (curLead.toLowerCase() !== jtForeman.toLowerCase()) {
      r['Crew Lead'] = jtForeman;
      updatedLeadCount++;
    }

    // Ensure foreman is listed first in attendees
    const attendees = String(r['Attendees'] || '').trim();
    if (attendees) {
      const parts = attendees.split(',').map(s => s.trim()).filter(Boolean);
      const leadIdx = parts.findIndex(p => p.toLowerCase() === jtForeman.toLowerCase());
      if (leadIdx > 0) {
        const [leadName] = parts.splice(leadIdx, 1);
        parts.unshift(leadName);
        r['Attendees'] = parts.join(', ');
        reorderedAttendeesCount++;
      }
    }
  }
});

// Sync rawGrid if present
if (tt.headers && tt.rawGrid) {
  tt.rawGrid = [tt.headers];
  tt.rows.forEach(r => {
    tt.rawGrid.push(tt.headers.map(h => r[h] !== undefined ? r[h] : ''));
  });
  tt.maxRows = tt.rawGrid.length;
}

fs.writeFileSync(snapPath, JSON.stringify(snap, null, 2), 'utf8');

// Queue REPLACE_TABLE_DATA in sync_outbox.json
const now = new Date().toISOString();
const filteredOutbox = outbox.filter(item => 
  !(item.type === 'REPLACE_TABLE_DATA' && ['training_tracking'].includes(item.table))
);

filteredOutbox.push({
  id: 'outbox_' + Date.now() + '_tt_leads',
  type: 'REPLACE_TABLE_DATA',
  action: 'REPLACE_TABLE_DATA',
  table: 'training_tracking',
  tableKey: 'training_tracking',
  sheetName: 'Training Tracking',
  data: tt.rows,
  headers: tt.headers,
  timestamp: now
});

fs.writeFileSync(outboxPath, JSON.stringify(filteredOutbox, null, 2), 'utf8');

console.log(`Updated ${updatedLeadCount} training rows with correct Job Tracking foremen.`);
console.log(`Reordered ${reorderedAttendeesCount} attendees lists so foreman appears first.`);
console.log(`Snapshot and Outbox updated successfully.`);
