const fs = require('fs');
const path = require('path');

const snapshotPath = 'C:\\Users\\codyb\\AppData\\Roaming\\safety-assistant-desktop\\SafetyAssistantData\\local_snapshot.json';

if (!fs.existsSync(snapshotPath)) {
  console.error('Snapshot not found at:', snapshotPath);
  process.exit(1);
}

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

// Setup globals for node
global.window = {
  desktopAPI: {
    getLocalSnapshot: async () => snapshot,
    saveLocalSnapshot: async (data) => {
      fs.writeFileSync(snapshotPath, JSON.stringify(data, null, 2), 'utf8');
      return { success: true };
    },
    getLocalOutbox: async () => [],
    saveLocalOutbox: async () => ({ success: true })
  }
};
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

async function run() {
  const dbCode = fs.readFileSync(path.join(__dirname, '../js/db.js'), 'utf8');
  const swapsCode = fs.readFileSync(path.join(__dirname, '../js/swaps.js'), 'utf8');

  eval(dbCode);
  eval(swapsCode);

  await window.localDB.init();

  console.log('Running generateAllSwaps()...');
  const stats = await window.swapEngine.generateAllSwaps();
  console.log('Swap generation stats:', stats);

  // Force persist current in-memory snapshot to disk
  const finalSnapshot = window.localDB.getSnapshot();
  fs.writeFileSync(snapshotPath, JSON.stringify(finalSnapshot, null, 2), 'utf8');
  console.log('✅ Final snapshot successfully saved to disk.');

  // Read saved snapshot from disk to verify
  const updatedSnapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const gloveSwaps = updatedSnapshot.tables['glove_swaps'];

  if (!gloveSwaps) {
    console.error('❌ glove_swaps table missing!');
    process.exit(1);
  }

  console.log('\n--- Checking Glove Swaps ---');
  console.log('Total glove swap rows:', gloveSwaps.rows ? gloveSwaps.rows.length : 0);

  const darrellRows = (gloveSwaps.rows || []).filter(r => String(r['Employee'] || '').toLowerCase().includes('darrell swann'));
  console.log(`Found ${darrellRows.length} Darrell Swann row(s) in glove_swaps:`);
  darrellRows.forEach(dr => {
    console.log({
      Employee: dr['Employee'],
      Glove: dr['Current Glove #'],
      Size: dr['Size'],
      ChangeOutDate: dr['Change Out Date'],
      DaysLeft: dr['Days Left'],
      PickList: dr['Pick List Item #'],
      Status: dr['Status'],
      Location: dr._location,
      Foreman: dr._foreman
    });
  });

  const austinRow = (gloveSwaps.rows || []).find(r => String(r['Employee'] || '').toLowerCase().includes('austin bourdo'));
  if (austinRow) {
    console.log('\nAustin Bourdo in glove_swaps:', {
      Employee: austinRow['Employee'],
      Glove: austinRow['Current Glove #'],
      Location: austinRow._location,
      Foreman: austinRow._foreman
    });
  }

  // Print rawGrid sections for Belgrade
  console.log('\n--- Belgrade Section in rawGrid ---');
  let inBelgrade = false;
  for (let i = 0; i < gloveSwaps.rawGrid.length; i++) {
    const row = gloveSwaps.rawGrid[i];
    const firstCell = String(row[0] || '').trim();
    if (firstCell.startsWith('🔍 Belgrade')) {
      inBelgrade = true;
      console.log(`[Row ${i}] Header: ${firstCell}`);
      continue;
    }
    if (inBelgrade) {
      if (firstCell.startsWith('🔍') || firstCell.includes('Swaps')) {
        inBelgrade = false;
        continue;
      }
      console.log(`[Row ${i}]`, row.slice(0, 9));
    }
  }
}

run().catch(err => {
  console.error('Error running script:', err);
  process.exit(1);
});
