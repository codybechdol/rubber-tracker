/**
 * scanner.js - Barcode & QR Code Camera Scanner for ESL IDs (Phase 9)
 * 
 * Provides live camera scanning for equipment ESL barcodes and QR codes,
 * instant equipment lookup across all inventory types, and 1-tap field actions.
 */

class CameraScannerEngine {
  constructor(db) {
    this.db = db;
    this.videoStream = null;
    this.isScanning = false;
    this.scanInterval = null;
    this.barcodeDetector = null;
    this.availableCameras = [];
    this.selectedCameraId = null;
    this.isTorchOn = false;

    // Initialize BarcodeDetector API if available in browser
    if ('BarcodeDetector' in window) {
      try {
        this.barcodeDetector = new BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'upc_a', 'data_matrix', 'codabar']
        });
      } catch (e) {
        console.warn('BarcodeDetector format error:', e);
      }
    }
  }

  /**
   * Opens the full-screen camera scanner modal.
   */
  async openScannerModal(initialQuery = '') {
    const modal = document.getElementById('camera-scanner-modal');
    if (!modal) return;

    modal.style.display = 'flex';
    this.renderScannerModalContent();

    if (initialQuery) {
      this.handleScannedCode(initialQuery);
    } else {
      await this.startCamera();
    }
  }

  /**
   * Closes the camera scanner and stops media streams.
   */
  closeScannerModal() {
    this.stopCamera();
    const modal = document.getElementById('camera-scanner-modal');
    if (modal) modal.style.display = 'none';
  }

  /**
   * Discovers available camera video inputs on device.
   */
  async discoverCameras() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.availableCameras = devices.filter(d => d.kind === 'videoinput');
      return this.availableCameras;
    } catch (err) {
      console.warn('Error discovering cameras:', err);
      return [];
    }
  }

  /**
   * Starts the camera stream inside video element.
   */
  async startCamera(deviceId = null) {
    const video = document.getElementById('scanner-video-preview');
    if (!video) return;

    this.stopCamera();
    await this.discoverCameras();

    const constraints = {
      video: deviceId 
        ? { deviceId: { exact: deviceId } } 
        : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    };

    try {
      this.videoStream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = this.videoStream;
      await video.play();

      this.isScanning = true;
      this.startScanningLoop();
      this.updateCameraControlsUi();
    } catch (err) {
      console.warn('Camera access error:', err);
      const statusEl = document.getElementById('scanner-status-message');
      if (statusEl) {
        statusEl.innerHTML = `<span style="color: #f87171;">⚠️ Camera access unavailable (${this.escapeHtml(err.message)}). Please enter code manually below.</span>`;
      }
    }
  }

  /**
   * Stops video stream and scanning loop.
   */
  stopCamera() {
    this.isScanning = false;
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    if (this.videoStream) {
      this.videoStream.getTracks().forEach(track => track.stop());
      this.videoStream = null;
    }
  }

  /**
   * Toggles camera torch/flashlight if supported.
   */
  async toggleTorch() {
    if (!this.videoStream) return;
    const track = this.videoStream.getVideoTracks()[0];
    if (!track) return;

    try {
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      if (capabilities.torch) {
        this.isTorchOn = !this.isTorchOn;
        await track.applyConstraints({
          advanced: [{ torch: this.isTorchOn }]
        });
        const btnTorch = document.getElementById('btn-scanner-torch');
        if (btnTorch) {
          btnTorch.style.background = this.isTorchOn ? '#eab308' : 'rgba(255,255,255,0.1)';
          btnTorch.style.color = this.isTorchOn ? '#000' : '#fff';
        }
      } else {
        alert('🔦 Flashlight/Torch is not supported on this camera device.');
      }
    } catch (e) {
      console.warn('Torch toggle error:', e);
    }
  }

  /**
   * Continuous scanning loop analyzing frames.
   */
  startScanningLoop() {
    const video = document.getElementById('scanner-video-preview');
    const canvas = document.getElementById('scanner-canvas');
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    this.scanInterval = setInterval(async () => {
      if (!this.isScanning || video.readyState !== video.HAVE_ENOUGH_DATA) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (this.barcodeDetector) {
        try {
          const barcodes = await this.barcodeDetector.detect(canvas);
          if (barcodes && barcodes.length > 0) {
            const rawVal = barcodes[0].rawValue;
            if (rawVal) {
              this.handleScannedCode(rawVal);
            }
          }
        } catch (e) {
          // Fallback or frame error
        }
      }
    }, 250);
  }

  /**
   * Looks up equipment by ESL ID, Item #, or Serial # across all inventory tables.
   */
  lookupItem(code) {
    if (!code) return null;
    const cleanCode = String(code).trim();
    const cleanLower = cleanCode.toLowerCase();

    const inventorySheets = [
      { key: 'gloves', title: 'Rubber Gloves', type: 'Glove' },
      { key: 'sleeves', title: 'Rubber Sleeves', type: 'Sleeve' },
      { key: 'blankets', title: 'Rubber Blankets', type: 'Blanket' },
      { key: 'macks', title: 'MACKs (Jumpers)', type: 'MACK' },
      { key: 'hv_testers', title: 'HV Testers', type: 'HV Tester' },
      { key: 'phasing_sets', title: 'Phasing Sets', type: 'Phasing Set' },
      { key: 'aed', title: 'AED Units', type: 'AED' },
      { key: 'grounds', title: 'Ground Sets', type: 'Grounds' },
      { key: 'hot_sticks', title: 'Hot Sticks', type: 'Hot Stick' }
    ];

    for (const sheet of inventorySheets) {
      const table = this.db.getTable(sheet.key);
      if (table && table.rows) {
        for (const row of table.rows) {
          const eslId = String(row['ESL ID'] || row['ESL'] || '').trim();
          const itemNum = String(row['Item #'] || row['Item Number'] || row['Item'] || row['Serial #'] || row['Serial'] || '').trim();
          const serial = String(row['Serial #'] || row['Serial'] || '').trim();

          const matchEsl = eslId && eslId.toLowerCase() === cleanLower;
          const matchItem = itemNum && itemNum.toLowerCase() === cleanLower;
          const matchSerial = serial && serial.toLowerCase() === cleanLower;

          if (matchEsl || matchItem || matchSerial) {
            return {
              sheetKey: sheet.key,
              sheetTitle: sheet.title,
              itemType: sheet.type,
              row: row,
              eslId: eslId || 'N/A',
              itemNum: itemNum || eslId,
              size: String(row['Size'] || '').trim(),
              classVal: String(row['Class'] || '').trim(),
              kv: String(row['KV'] || '').trim(),
              length: String(row['Length'] || '').trim(),
              model: String(row['Model'] || '').trim(),
              status: String(row['Status'] || 'Available').trim(),
              assignedTo: String(row['Assigned To'] || row['Employee'] || 'Unassigned').trim(),
              location: String(row['Location'] || 'Helena Base').trim(),
              testDate: String(row['Test Date'] || row['Calibration Date'] || 'N/A').trim(),
              changeOutDate: String(row['Change Out Date'] || row['Changeout Date'] || 'N/A').trim(),
              notes: String(row['Notes'] || '').trim()
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Handles a detected barcode or manually entered code.
   */
  handleScannedCode(rawCode) {
    const cleanCode = String(rawCode).trim();
    if (!cleanCode) return;

    // Beep / audio feedback if possible
    this.playScanBeep();

    const result = this.lookupItem(cleanCode);
    this.renderScanResult(cleanCode, result);
  }

  playScanBeep() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.12);
    } catch (e) {}
  }

  /**
   * Renders the modal layout.
   */
  renderScannerModalContent() {
    const body = document.getElementById('camera-scanner-modal-body');
    if (!body) return;

    body.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <!-- Top Instruction & Controls Banner -->
        <div style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(37, 99, 235, 0.05) 100%); border: 1px solid rgba(59, 130, 246, 0.35); border-radius: 8px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            <div style="font-size: 15px; font-weight: 800; color: #93c5fd; display: flex; align-items: center; gap: 8px;">
              <span>📷</span> Live Camera ESL / Barcode Scanner
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
              Point camera at equipment ESL tag or QR code for instant lookup and 1-tap field actions.
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button class="btn btn-secondary" id="btn-scanner-torch" onclick="window.cameraScanner.toggleTorch()" style="font-size: 12px; font-weight: 600;" title="Toggle flashlight">
              🔦 Flashlight
            </button>
            <select id="scanner-camera-select" onchange="window.cameraScanner.onCameraSelectChange(this.value)" style="padding: 4px 8px; font-size: 11.5px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: #fff;">
              <option value="">Auto Camera</option>
            </select>
          </div>
        </div>

        <!-- Viewfinder Box -->
        <div style="position: relative; width: 100%; height: 260px; background: #000; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; border: 2px solid #3b82f6;">
          <video id="scanner-video-preview" playsinline autoplay muted style="width: 100%; height: 100%; object-fit: cover;"></video>
          <canvas id="scanner-canvas" style="display: none;"></canvas>

          <!-- Reticle / Target Overlay -->
          <div style="position: absolute; width: 200px; height: 140px; border: 2px dashed rgba(59, 130, 246, 0.85); border-radius: 12px; pointer-events: none; box-shadow: 0 0 0 9999px rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center;">
            <div style="width: 100%; height: 2px; background: #ef4444; opacity: 0.75; animation: scanner-laser 2s infinite ease-in-out;"></div>
          </div>

          <div id="scanner-status-message" style="position: absolute; bottom: 8px; background: rgba(0,0,0,0.7); padding: 3px 10px; border-radius: 12px; font-size: 11px; color: #cbd5e1;">
            🟢 Align barcode or QR code in viewfinder
          </div>
        </div>

        <!-- Manual Input Row -->
        <div style="display: flex; gap: 8px; align-items: center;">
          <input type="text" id="scanner-manual-input" placeholder="⌨️ Or enter ESL ID / Item # manually (e.g. ESL-1049, G-012)..." style="flex: 1; padding: 8px 12px; font-size: 12.5px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: #fff;" onkeydown="if(event.key==='Enter') window.cameraScanner.handleScannedCode(this.value);" />
          <button class="btn btn-primary" onclick="window.cameraScanner.handleScannedCode(document.getElementById('scanner-manual-input').value)" style="padding: 8px 16px; font-size: 12.5px; font-weight: 700;">
            🔍 Lookup
          </button>
        </div>

        <!-- Result Details Card Container -->
        <div id="scanner-result-card"></div>
      </div>
    `;
  }

  updateCameraControlsUi() {
    const select = document.getElementById('scanner-camera-select');
    if (!select || !this.availableCameras || this.availableCameras.length === 0) return;

    select.innerHTML = this.availableCameras.map((c, i) => `
      <option value="${c.deviceId}">${c.label || `Camera ${i + 1}`}</option>
    `).join('');
  }

  onCameraSelectChange(deviceId) {
    if (deviceId) {
      this.selectedCameraId = deviceId;
      this.startCamera(deviceId);
    }
  }

  /**
   * Renders the equipment card upon successful lookup.
   */
  renderScanResult(code, item) {
    const resultBox = document.getElementById('scanner-result-card');
    if (!resultBox) return;

    if (!item) {
      resultBox.innerHTML = `
        <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 8px; padding: 14px 18px; text-align: center;">
          <div style="font-size: 15px; font-weight: 700; color: #f87171; margin-bottom: 4px;">
            ⚠️ Item Not Found: "${this.escapeHtml(code)}"
          </div>
          <div style="font-size: 12px; color: var(--text-secondary);">
            No matching ESL ID, Serial #, or Item # was found in local inventory tables.
          </div>
        </div>
      `;
      return;
    }

    const isAssigned = item.status.toLowerCase() === 'assigned';
    const isAvailable = item.status.toLowerCase() === 'available';
    const statusColor = isAssigned ? '#60a5fa' : (isAvailable ? '#10b981' : '#f59e0b');

    let specs = [];
    if (item.size) specs.push(`Size: <strong>${item.size}</strong>`);
    if (item.classVal) specs.push(`Class: <strong>${item.classVal}</strong>`);
    if (item.kv) specs.push(`KV: <strong>${item.kv}</strong>`);
    if (item.length) specs.push(`Length: <strong>${item.length}</strong>`);
    if (item.model) specs.push(`Model: <strong>${item.model}</strong>`);

    resultBox.innerHTML = `
      <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-left: 5px solid ${statusColor}; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
        <!-- Header Info -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
          <div>
            <div style="font-size: 16px; font-weight: 800; color: #f8fafc; display: flex; align-items: center; gap: 8px;">
              <span>⚡ ${this.escapeHtml(item.sheetTitle)}: ${this.escapeHtml(item.itemNum)}</span>
              ${item.eslId !== 'N/A' ? `<span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; font-family: monospace; font-size: 11px;">ESL: ${this.escapeHtml(item.eslId)}</span>` : ''}
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
              ${specs.join(' &nbsp;•&nbsp; ') || 'Standard Specifications'}
            </div>
          </div>
          <span class="badge" style="background: ${statusColor}33; color: ${statusColor}; border: 1px solid ${statusColor}66; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 4px;">
            ${this.escapeHtml(item.status)}
          </span>
        </div>

        <!-- Assignment & Dates Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px; font-size: 12px;">
          <div>
            <span style="color: var(--text-muted);">👤 Assigned Lineman:</span><br>
            <strong style="color: #60a5fa;">${this.escapeHtml(item.assignedTo)}</strong>
          </div>
          <div>
            <span style="color: var(--text-muted);">📍 Location / Base:</span><br>
            <strong style="color: #f8fafc;">${this.escapeHtml(item.location)}</strong>
          </div>
          <div>
            <span style="color: var(--text-muted);">🧪 Test / Cal Date:</span><br>
            <strong style="color: #cbd5e1;">${this.escapeHtml(item.testDate)}</strong>
          </div>
          <div>
            <span style="color: var(--text-muted);">📅 Change Out Date:</span><br>
            <strong style="color: #fde047;">${this.escapeHtml(item.changeOutDate)}</strong>
          </div>
        </div>

        <!-- Field Actions Toolbar -->
        <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; margin-top: 4px;">
          ${item.assignedTo !== 'Unassigned' ? `
            <button class="btn btn-secondary" onclick="window.cameraScanner.closeScannerModal(); if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeHtml(item.assignedTo)}');}" style="font-size: 11.5px; font-weight: 600;">
              👤 View Lineman
            </button>
            <button class="btn btn-secondary" onclick="window.cameraScanner.reclaimItem('${this.escapeHtml(item.sheetKey)}', '${this.escapeHtml(item.itemNum)}')" style="font-size: 11.5px; font-weight: 600; color: #f87171;">
              📦 Reclaim Item
            </button>
          ` : ''}
          <button class="btn btn-primary" onclick="window.cameraScanner.performFieldSwap('${this.escapeHtml(item.sheetKey)}', '${this.escapeHtml(item.itemNum)}')" style="font-size: 12px; font-weight: 700; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);">
            <span>🔄</span> Perform Field Swap
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Triggers a GPS-stamped Field Swap for the scanned item.
   */
  async performFieldSwap(sheetKey, itemNum) {
    if (!confirm(`🔄 Record field swap for item ${itemNum}?`)) return;

    let gpsStamp = '📍 Field Swap';
    if (window.gpsEngine) {
      gpsStamp = await window.gpsEngine.formatSwapGpsStamp();
    }

    if (this.db && this.db.addMutation) {
      this.db.addMutation({
        action: 'FIELD_EQUIPMENT_SWAP',
        sheetKey: sheetKey,
        itemNum: itemNum,
        gpsStamp: gpsStamp,
        timestamp: new Date().toISOString()
      });
    }

    alert(`✅ Field Swap recorded for ${itemNum}!\n${gpsStamp}`);
    this.closeScannerModal();
  }

  /**
   * Reclaims an item back to Helena warehouse.
   */
  async reclaimItem(sheetKey, itemNum) {
    if (!confirm(`📦 Reclaim item ${itemNum} back to Helena warehouse?`)) return;

    let gpsStamp = '📍 Helena Warehouse';
    if (window.gpsEngine) {
      gpsStamp = await window.gpsEngine.formatSwapGpsStamp();
    }

    if (this.db && this.db.addMutation) {
      this.db.addMutation({
        action: 'RECLAIM_ITEM',
        sheetKey: sheetKey,
        itemNum: itemNum,
        gpsStamp: gpsStamp,
        timestamp: new Date().toISOString()
      });
    }

    alert(`✅ Item ${itemNum} reclaimed successfully!\n${gpsStamp}`);
    this.closeScannerModal();
  }

  escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Attach globally
window.CameraScannerEngine = CameraScannerEngine;
