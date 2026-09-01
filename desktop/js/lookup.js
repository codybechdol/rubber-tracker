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
        const empName = emp['Name'] || emp['Employee Name'] || '';
        html += `
          <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; margin-bottom: 8px; cursor: pointer; transition: all 0.15s ease;"
               onmouseover="this.style.borderColor='var(--accent)';" 
               onmouseout="this.style.borderColor='var(--border-color)';"
               onclick="if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(empName)}');}">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div style="font-weight: 700; font-size: 15px; color: #60a5fa;">👤 ${this.escapeHtml(empName)}</div>
              <span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4); font-size: 11px; padding: 2px 8px; border-radius: 4px;">
                View Profile & Certs ➔
              </span>
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 6px;">
              Location: <strong>${this.escapeHtml(emp['Location'] || 'Unknown')}</strong> &nbsp;|&nbsp; 
              Primary Job: <strong>${this.escapeHtml(emp['Job Number'] || 'N/A')}</strong> &nbsp;|&nbsp; 
              Secondary Job: <strong>${this.escapeHtml(emp['Secondary Job Number'] || 'None')}</strong> &nbsp;|&nbsp; 
              Role: <strong>${this.escapeHtml(emp['Job Classification'] || 'N/A')}</strong>
            </div>
          </div>
        `;
      });
    }

    if (matchedItems.length > 0) {
      html += `<h4 style="margin: 20px 0 10px 0; color: var(--success);">Equipment & Inventory (${matchedItems.length})</h4>`;
      matchedItems.forEach(item => {
        const histKey = item.type.toLowerCase().replace(/\s+/g, '_') + '_history';
        html += `
          <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; margin-bottom: 8px; cursor: pointer; transition: all 0.15s ease;"
               onmouseover="this.style.borderColor='var(--success)';" 
               onmouseout="this.style.borderColor='var(--border-color)';"
               onclick="if(window.itemStatsEngine){window.itemStatsEngine.openDossierModal('${this.escapeJs(item.itemNum)}', '${this.escapeJs(histKey)}');}">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div style="font-weight: 700; font-size: 15px; color: #34d399;">📦 ${this.escapeHtml(item.type)} — #${this.escapeHtml(item.itemNum)}</div>
              <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.4); font-size: 11px; padding: 2px 8px; border-radius: 4px;">
                View Lifecycle Dossier ➔
              </span>
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 6px;">
              Assigned To: <strong>${this.escapeHtml(item.assignedTo)}</strong> &nbsp;|&nbsp; 
              Location: <strong>${this.escapeHtml(item.location)}</strong> &nbsp;|&nbsp; 
              Status: <strong>${this.escapeHtml(item.status)}</strong> &nbsp;|&nbsp; 
              Change Out Date: <strong>${this.escapeHtml(item.changeOutDate)}</strong>
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

  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  escapeJs(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '&quot;')
      .replace(/[\n\r]/g, ' ');
  }
}

window.lookupApp = new LookupApp(window.localDB);
