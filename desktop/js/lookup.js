/**
 * lookup.js - Instant Offline Employee & Equipment Lookup
 */

class LookupApp {
  constructor(db) {
    this.db = db;
    this.query = '';
  }

  init() {
    const input = document.getElementById('global-lookup-input');
    if (input) {
      input.addEventListener('input', (e) => {
        this.query = e.target.value.toLowerCase().trim();
        this.search();
      });
    }
  }

  search() {
    const resultsContainer = document.getElementById('lookup-results-container');
    if (!resultsContainer) return;

    if (!this.query || this.query.length < 2) {
      resultsContainer.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">
          <h3>Search Employees & Equipment</h3>
          <p style="margin-top: 8px;">Enter an employee name, phone number, item number, or serial number.</p>
        </div>
      `;
      return;
    }

    const snap = this.db.getSnapshot();
    if (!snap || !snap.tables) return;

    const matchedEmployees = (snap.tables['employees']?.rows || []).filter(e => 
      String(e['Name'] || '').toLowerCase().includes(this.query) ||
      String(e['Phone Number'] || '').toLowerCase().includes(this.query) ||
      String(e['Job Number'] || '').toLowerCase().includes(this.query)
    );

    const inventorySheets = ['gloves', 'sleeves', 'blankets', 'macks', 'hv_testers', 'phasing_sets', 'aed', 'grounds', 'hot_sticks'];
    const matchedItems = [];

    inventorySheets.forEach(sheetKey => {
      const t = snap.tables[sheetKey];
      if (t && t.rows) {
        t.rows.forEach(item => {
          const itemNum = String(item['Item #'] || item['Serial #'] || '').toLowerCase();
          const assignedTo = String(item['Assigned To'] || '').toLowerCase();
          const loc = String(item['Location'] || '').toLowerCase();

          if (itemNum.includes(this.query) || assignedTo.includes(this.query) || loc.includes(this.query)) {
            matchedItems.push({
              type: t.name,
              itemNum: item['Item #'] || item['Serial #'] || 'N/A',
              assignedTo: item['Assigned To'] || 'Unassigned',
              location: item['Location'] || 'Unknown',
              status: item['Status'] || 'In Stock',
              changeOutDate: item['Change Out Date'] || item['Pad Expiration'] || 'N/A'
            });
          }
        });
      }
    });

    let html = '';

    if (matchedEmployees.length > 0) {
      html += `<h4 style="margin: 16px 0 10px 0; color: var(--accent);">Employees (${matchedEmployees.length})</h4>`;
      matchedEmployees.forEach(emp => {
        html += `
          <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; margin-bottom: 8px;">
            <div style="font-weight: 700; font-size: 15px;">👤 ${emp['Name']}</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
              Location: <strong>${emp['Location']}</strong> &nbsp;|&nbsp; 
              Primary Job: <strong>${emp['Job Number']}</strong> &nbsp;|&nbsp; 
              Secondary Job: <strong>${emp['Secondary Job Number'] || 'None'}</strong> &nbsp;|&nbsp; 
              Role: <strong>${emp['Job Classification'] || 'N/A'}</strong>
            </div>
          </div>
        `;
      });
    }

    if (matchedItems.length > 0) {
      html += `<h4 style="margin: 20px 0 10px 0; color: var(--success);">Equipment & Inventory (${matchedItems.length})</h4>`;
      matchedItems.forEach(item => {
        html += `
          <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; margin-bottom: 8px;">
            <div style="font-weight: 700; font-size: 15px;">📦 ${item.type} — ${item.itemNum}</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
              Assigned To: <strong>${item.assignedTo}</strong> &nbsp;|&nbsp; 
              Location: <strong>${item.location}</strong> &nbsp;|&nbsp; 
              Status: <strong>${item.status}</strong> &nbsp;|&nbsp; 
              Change Out Date: <strong>${item.changeOutDate}</strong>
            </div>
          </div>
        `;
      });
    }

    if (matchedEmployees.length === 0 && matchedItems.length === 0) {
      html = `
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">
          <h3>No matching records found</h3>
          <p style="margin-top: 8px;">Try searching for a different name, job number, or item ID.</p>
        </div>
      `;
    }

    resultsContainer.innerHTML = html;
  }
}

window.lookupApp = new LookupApp(window.localDB);
