/**
 * db.js - Local Database & Offline Mutation Outbox Manager
 */

class LocalDatabase {
  constructor() {
    this.snapshot = null;
    this.outbox = [];
    this.listeners = [];
  }

  async init() {
    // Load snapshot from desktop API or localStorage
    if (window.desktopAPI) {
      this.snapshot = await window.desktopAPI.getLocalSnapshot();
      this.outbox = await window.desktopAPI.getLocalOutbox() || [];
    } else {
      const stored = localStorage.getItem('sa_snapshot');
      if (stored) this.snapshot = JSON.parse(stored);
      const storedOutbox = localStorage.getItem('sa_outbox');
      if (storedOutbox) this.outbox = JSON.parse(storedOutbox);
    }
    this.notify();
    return this.snapshot;
  }

  getSnapshot() {
    return this.snapshot;
  }

  async setSnapshot(snapshot) {
    this.snapshot = snapshot;
    if (window.desktopAPI) {
      await window.desktopAPI.saveLocalSnapshot(snapshot);
    } else {
      localStorage.setItem('sa_snapshot', JSON.stringify(snapshot));
    }
    this.notify();
  }

  getTable(tableKey) {
    if (!this.snapshot || !this.snapshot.tables) return { headers: [], rows: [] };
    return this.snapshot.tables[tableKey] || { headers: [], rows: [] };
  }

  getOutbox() {
    return this.outbox;
  }

  getPendingCount() {
    return this.outbox.length;
  }

  async addMutation(mutation) {
    const mutRecord = {
      id: 'mut_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      timestamp: new Date().toISOString(),
      ...mutation
    };

    this.outbox.push(mutRecord);

    // Apply mutation optimistically to local in-memory snapshot
    this.applyLocalMutation(mutation);

    if (window.desktopAPI) {
      await window.desktopAPI.saveLocalOutbox(this.outbox);
      await window.desktopAPI.saveLocalSnapshot(this.snapshot);
    } else {
      localStorage.setItem('sa_outbox', JSON.stringify(this.outbox));
      localStorage.setItem('sa_snapshot', JSON.stringify(this.snapshot));
    }

    this.notify();
    return mutRecord;
  }

  applyLocalMutation(mut) {
    if (!this.snapshot || !this.snapshot.tables) return;

    const addMonths = (dateStr, months) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      d.setMonth(d.getMonth() + months);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${mm}/${dd}/${yyyy}`;
    };

    // Direct cell edit
    if (mut.action === 'UPDATE_CELL') {
      const table = Object.values(this.snapshot.tables).find(t => t.name === mut.sheetName);
      const sheetNameLower = (mut.sheetName || '').toLowerCase();

      // 1. If edit is on a Swap Sheet (Glove Swaps, Sleeve Swaps, Blanket Swaps, MACK Swaps)
      if (sheetNameLower.includes('swaps') && table && table.rawGrid) {
        const rowIdx = mut.row - 1;
        const colIdx = mut.col - 1;
        if (table.rawGrid[rowIdx]) {
          table.rawGrid[rowIdx][colIdx] = mut.value;

          // Find the subheader row to get column positions dynamically
          let colPick = -1;
          let colStat = -1;
          let colPickList = -1;

          for (let r = 0; r < Math.min(table.rawGrid.length, 10); r++) {
            const subRow = table.rawGrid[r];
            if (subRow && (subRow[0] === 'Employee' || (subRow[1] && String(subRow[1]).includes('Current')) || (subRow[3] && String(subRow[3]).includes('Current')))) {
              subRow.forEach((cVal, ci) => {
                const s = String(cVal || '').toLowerCase().trim();
                if (s === 'picked' && colPick === -1) colPick = ci;
                else if (s === 'status' && colStat === -1) colStat = ci;
                else if (s.includes('pick list') && colPickList === -1) colPickList = ci;
              });
              break;
            }
          }

          // Fallbacks for standard swap sheets (A=0:Emp, B=1:Current, C=2:Size, D=3:Date, E=4:ChangeOut, F=5:Days, G=6:PickList, H=7:Status, I=8:Picked, J=9:DateChanged)
          if (colPick === -1) colPick = 8;
          if (colStat === -1) colStat = 7;
          if (colPickList === -1) colPickList = 6;

          const headerLower = String(mut.header || '').toLowerCase();
          const isPickedCol = headerLower.includes('picked') || colIdx === colPick;

          const isDateChangedCol = headerLower.includes('changed') || colIdx === 9;

          if (isPickedCol) {
          const empName = String(table.rawGrid[rowIdx][0] || '').trim();
          const oldItemNum = String(table.rawGrid[rowIdx][1] || '').trim();
          const pickItemNum = String(table.rawGrid[rowIdx][colPickList] || '').trim();
          const daysLeft = String(table.rawGrid[rowIdx][5] || '').trim().toUpperCase();

          const isPrevEmpRow = (daysLeft === 'PREV EMP' || (!pickItemNum || pickItemNum === '—' || pickItemNum === '-'));
          const isLostRow = (daysLeft === 'LOST-LOCATE');

          // Find matching inventory table (gloves, sleeves, blankets, macks)
          let invTableKey = 'gloves';
          if (sheetNameLower.includes('sleeve')) invTableKey = 'sleeves';
          else if (sheetNameLower.includes('blanket')) invTableKey = 'blankets';
          else if (sheetNameLower.includes('mack')) invTableKey = 'macks';
          const invTable = this.snapshot.tables[invTableKey];

          if (isPickedCol) {
            const isChecked = (mut.value === true || mut.value === 'TRUE' || mut.value === 'true');

            if (isPrevEmpRow) {
              // PREVIOUS EMPLOYEE ROW PICKED
              if (colStat !== -1) {
                table.rawGrid[rowIdx][colStat] = isChecked ? 'Ready For Test' : 'Return to Shelf';
              }
              if (invTable && invTable.rows && oldItemNum && oldItemNum !== '—' && oldItemNum !== '-') {
                const oldRow = invTable.rows.find(r => {
                  const itemKeys = Object.keys(r);
                  const firstKey = itemKeys[0] || 'Item #';
                  const iNum = String(r['Item #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['ESL ID'] || r['Serial #'] || r[firstKey] || '').trim();
                  const esl = String(r['ESL ID'] || '').trim();
                  return iNum === oldItemNum || esl === oldItemNum;
                });
                if (oldRow) {
                  if (isChecked) {
                    oldRow['Location'] = "Cody's Truck";
                    oldRow['Status'] = 'Ready For Test';
                    oldRow['Assigned To'] = 'Packed For Testing';
                    oldRow['Picked For'] = '';
                  } else {
                    oldRow['Location'] = 'Previous Employee';
                    oldRow['Status'] = 'Assigned';
                    oldRow['Assigned To'] = empName;
                    oldRow['Picked For'] = '';
                  }
                }
              }
            } else if (isLostRow) {
              if (colStat !== -1) {
                table.rawGrid[rowIdx][colStat] = 'Locate Item 🔍';
              }
            } else {
              // STANDARD SWAP OR CLASS RECLAIM
              if (colStat !== -1) {
                table.rawGrid[rowIdx][colStat] = isChecked ? 'Ready For Delivery 🚚' : 'In Stock';
              }

              if (invTable && invTable.rows && pickItemNum && pickItemNum !== '—' && pickItemNum !== '-') {
                const invRow = invTable.rows.find(r => {
                  const itemKeys = Object.keys(r);
                  const firstKey = itemKeys[0] || 'Item #';
                  const iNum = String(r['Item #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['ESL ID'] || r['Serial #'] || r[firstKey] || '').trim();
                  const esl = String(r['ESL ID'] || '').trim();
                  return iNum === pickItemNum || esl === pickItemNum;
                });

                if (invRow) {
                  if (isChecked) {
                    const now = new Date();
                    const mm = String(now.getMonth() + 1).padStart(2, '0');
                    const dd = String(now.getDate()).padStart(2, '0');
                    const yyyy = now.getFullYear();
                    const todayFormatted = `${mm}/${dd}/${yyyy}`;
                    const todayIso = `${yyyy}-${mm}-${dd}`;

                    invRow['Location'] = "Cody's Truck";
                    invRow['Status'] = 'Ready For Delivery';
                    invRow['Assigned To'] = 'Packed For Delivery';
                    invRow['Date Assigned'] = todayFormatted;
                    invRow['Picked For'] = `${empName} Picked On ${todayIso}`;

                    let months = 12;
                    if (sheetNameLower.includes('glove')) months = 3;
                    else if (sheetNameLower.includes('hot_stick') || sheetNameLower.includes('hot stick')) months = 24;
                    invRow['Change Out Date'] = addMonths(todayFormatted, months);
                  } else {
                    // Stage 5 Revert
                    invRow['Location'] = 'Helena';
                    invRow['Status'] = 'In Stock';
                    invRow['Assigned To'] = 'On Shelf';
                    invRow['Date Assigned'] = '';
                    invRow['Picked For'] = '';
                    invRow['Change Out Date'] = '';
                  }
                }
              }
            }
          } else if (isDateChangedCol) {
            const hasDate = (mut.value !== null && mut.value !== undefined && String(mut.value).trim() !== '');

            if (isPrevEmpRow) {
              // PREVIOUS EMPLOYEE ROW DATE CHANGED
              if (colStat !== -1) {
                table.rawGrid[rowIdx][colStat] = hasDate ? 'Packed For Testing' : 'Return to Shelf';
              }
              if (invTable && invTable.rows && oldItemNum && oldItemNum !== '—' && oldItemNum !== '-') {
                const oldRow = invTable.rows.find(r => {
                  const itemKeys = Object.keys(r);
                  const firstKey = itemKeys[0] || 'Item #';
                  const iNum = String(r['Item #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['ESL ID'] || r['Serial #'] || r[firstKey] || '').trim();
                  const esl = String(r['ESL ID'] || '').trim();
                  return iNum === oldItemNum || esl === oldItemNum;
                });
                if (oldRow) {
                  if (hasDate) {
                    oldRow['Location'] = "Cody's Truck";
                    oldRow['Status'] = 'Ready For Test';
                    oldRow['Assigned To'] = 'Packed For Testing';
                    oldRow['Date Assigned'] = String(mut.value);
                    oldRow['Change Out Date'] = addMonths(String(mut.value), 12);
                    oldRow['Picked For'] = '';
                  } else {
                    oldRow['Location'] = "Cody's Truck";
                    oldRow['Status'] = 'Ready For Test';
                    oldRow['Assigned To'] = 'Packed For Testing';
                    oldRow['Date Assigned'] = '';
                    oldRow['Change Out Date'] = '';
                    oldRow['Picked For'] = '';
                  }
                }
              }
            } else {
              // STANDARD SWAP OR CLASS RECLAIM
              if (hasDate) {
                // Update status badge and days left on swap sheet
                if (colStat !== -1) {
                  table.rawGrid[rowIdx][colStat] = 'Assigned';
                }
                if (table.rawGrid[rowIdx][5] !== undefined) {
                  table.rawGrid[rowIdx][5] = 'Assigned';
                }

                // Look up employee location from employees table
                let empLoc = 'Helena';
                const empTable = this.snapshot.tables['employees'];
                if (empTable && empTable.rows) {
                  const emp = empTable.rows.find(e => String(e['Name'] || e['Employee Name'] || '').trim().toLowerCase() === empName.toLowerCase());
                  if (emp && emp['Location']) empLoc = emp['Location'];
                }

                if (invTable && invTable.rows) {
                  // 1. Pick list item -> Assigned
                  if (pickItemNum && pickItemNum !== '—' && pickItemNum !== '-') {
                    const pickRow = invTable.rows.find(r => {
                      const itemKeys = Object.keys(r);
                      const firstKey = itemKeys[0] || 'Item #';
                      const iNum = String(r['Item #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['ESL ID'] || r['Serial #'] || r[firstKey] || '').trim();
                      const esl = String(r['ESL ID'] || '').trim();
                      return iNum === pickItemNum || esl === pickItemNum;
                    });
                    if (pickRow) {
                      pickRow['Location'] = empLoc;
                      pickRow['Status'] = 'Assigned';
                      pickRow['Assigned To'] = empName;
                      pickRow['Date Assigned'] = String(mut.value);
                      pickRow['Picked For'] = ''; // Clear Picked For note!

                      let months = 12;
                      if (sheetNameLower.includes('glove')) months = (empLoc.toLowerCase() === 'helena' ? 3 : 6);
                      pickRow['Change Out Date'] = addMonths(String(mut.value), months);
                    }
                  }

                  // 2. Old item -> Ready For Test
                  if (oldItemNum && oldItemNum !== '—' && oldItemNum !== '-') {
                    const oldRow = invTable.rows.find(r => {
                      const itemKeys = Object.keys(r);
                      const firstKey = itemKeys[0] || 'Item #';
                      const iNum = String(r['Item #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['ESL ID'] || r['Serial #'] || r[firstKey] || '').trim();
                      const esl = String(r['ESL ID'] || '').trim();
                      return iNum === oldItemNum || esl === oldItemNum;
                    });
                    if (oldRow) {
                      oldRow['Location'] = "Cody's Truck";
                      oldRow['Status'] = 'Ready For Test';
                      oldRow['Assigned To'] = 'Packed For Testing';
                      oldRow['Date Assigned'] = String(mut.value);
                      oldRow['Picked For'] = '';

                      let months = 12;
                      if (sheetNameLower.includes('glove')) months = 3;
                      oldRow['Change Out Date'] = addMonths(String(mut.value), months);
                    }
                  }
                }
              } else {
                // Date Changed cleared -> Revert to Ready For Delivery
                if (colStat !== -1) {
                  table.rawGrid[rowIdx][colStat] = 'Ready For Delivery 🚚';
                }
              }
            }
          }
          }
        }
      }

      // 2. If edit is on an Inventory Sheet (Gloves, Sleeves, Blankets, MACKs, HV Testers, Phasing Sets, AED, Grounds, Hot Sticks)
      if (table && table.rows && table.headers) {
        const row = table.rows[mut.row - 2]; // 1-based sheet row (row 1 is header)
        const colHeader = mut.header || table.headers[mut.col - 1];
        if (row && colHeader) {
          row[colHeader] = mut.value;

          const hLower = colHeader.toLowerCase();

          // A. If Assigned To was edited
          if (hLower === 'assigned to' || hLower.includes('assigned to')) {
            const assignedName = String(mut.value || '').trim();
            const assignedLower = assignedName.toLowerCase();

            let newStatus = '';
            let newLocation = '';

            if (assignedLower === 'on shelf') {
              newStatus = 'On Shelf';
              newLocation = 'Helena';
              row['Picked For'] = '';
            } else if (assignedLower === 'packed for delivery') {
              newStatus = 'Ready For Delivery';
              newLocation = "Cody's Truck";
            } else if (assignedLower === 'packed for testing') {
              newStatus = 'Ready For Test';
              newLocation = "Cody's Truck";
            } else if (assignedLower === 'in testing') {
              newStatus = 'In Testing';
              newLocation = 'Arnett / JM Test';
            } else if (assignedLower === 'failed rubber' || assignedLower === 'not repairable') {
              newStatus = 'Failed Rubber';
              newLocation = 'Destroyed';
              row['Change Out Date'] = 'N/A';
            } else if (assignedLower === 'lost') {
              newStatus = 'Lost';
              newLocation = 'Lost';
              row['Change Out Date'] = 'N/A';
            } else if (assignedName) {
              newStatus = 'Assigned';
              // Look up employee location from employees table
              const empTable = this.snapshot.tables['employees'];
              if (empTable && empTable.rows) {
                const emp = empTable.rows.find(e => String(e['Name'] || e['Employee Name'] || '').trim().toLowerCase() === assignedLower);
                if (emp && emp['Location']) {
                  newLocation = emp['Location'];
                }
              }
              if (!newLocation) newLocation = 'Helena';

              // Calculate Change Out Date if Date Assigned exists
              const dateAssigned = row['Date Assigned'] || row['Calibration Date'] || row['Test Date'];
              if (dateAssigned) {
                let months = 12;
                if (sheetNameLower.includes('glove')) months = (newLocation.toLowerCase() === 'helena' ? 3 : 6);
                else if (sheetNameLower.includes('hot_stick') || sheetNameLower.includes('hot stick')) months = 24;
                row['Change Out Date'] = addMonths(dateAssigned, months);
              }
            }

            if (newStatus) row['Status'] = newStatus;
            if (newLocation) row['Location'] = newLocation;
          }

          // B. If Status was edited directly
          if (hLower === 'status' || hLower === 'item status') {
            const statusVal = String(mut.value || '').trim();
            const statusLower = statusVal.toLowerCase();

            if (statusLower === 'on shelf') {
              row['Assigned To'] = 'On Shelf';
              row['Location'] = 'Helena';
              row['Picked For'] = '';
            } else if (statusLower === 'ready for delivery') {
              row['Assigned To'] = 'Packed For Delivery';
              row['Location'] = "Cody's Truck";
            } else if (statusLower === 'ready for test') {
              row['Assigned To'] = 'Packed For Testing';
              row['Location'] = "Cody's Truck";
            } else if (statusLower === 'in testing') {
              row['Assigned To'] = 'In Testing';
              row['Location'] = 'Arnett / JM Test';
            } else if (statusLower === 'failed rubber' || statusLower === 'not repairable') {
              row['Assigned To'] = 'Failed Rubber';
              row['Location'] = 'Destroyed';
              row['Change Out Date'] = 'N/A';
            } else if (statusLower === 'lost') {
              row['Assigned To'] = 'Lost';
              row['Location'] = 'Lost';
              row['Change Out Date'] = 'N/A';
            }
          }

          // C. If Date Assigned / Test Date was edited
          if (hLower.includes('date assigned') || hLower.includes('calibration') || hLower.includes('test date')) {
            const dateAssigned = String(mut.value || '').trim();
            if (dateAssigned) {
              const loc = String(row['Location'] || '').toLowerCase();
              let months = 12;
              if (sheetNameLower.includes('glove')) months = (loc === 'helena' ? 3 : 6);
              else if (sheetNameLower.includes('hot_stick') || sheetNameLower.includes('hot stick')) months = 24;
              row['Change Out Date'] = addMonths(dateAssigned, months);
            }
          }
        }
      }
    }

    // Row update by key
    if (mut.action === 'UPDATE_ROW_BY_KEY') {
      const table = Object.values(this.snapshot.tables).find(t => t.name === mut.sheetName);
      if (table && table.rows) {
        const row = table.rows.find(r => String(r[mut.keyColName] || '').trim() === String(mut.keyValue || '').trim());
        if (row && mut.updates) {
          Object.assign(row, mut.updates);
        }
      }
    }

    // Task completion
    if (mut.action === 'SET_TASK_STATUS') {
      const taskTable = this.snapshot.tables['task_metadata'];
      if (taskTable && taskTable.rows) {
        const task = taskTable.rows.find(t => t['Task ID'] === mut.taskId);
        if (task) {
          task['Status'] = mut.status || 'Complete';
          if (mut.completedDate) task['Completed Date'] = mut.completedDate;
        }
      }
    }
  }

  async clearOutbox() {
    this.outbox = [];
    if (window.desktopAPI) {
      await window.desktopAPI.saveLocalOutbox([]);
    } else {
      localStorage.removeItem('sa_outbox');
    }
    this.notify();
  }

  subscribe(callback) {
    this.listeners.push(callback);
  }

  notify() {
    this.listeners.forEach(cb => cb(this.snapshot, this.outbox));
  }
}

window.localDB = new LocalDatabase();
