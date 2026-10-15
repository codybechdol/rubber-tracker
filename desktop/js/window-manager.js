/**
 * WindowManager - Desktop Multi-Window Modal Management Engine
 * 
 * Features:
 * 1. Multi-Window Non-Blocking Modals: Allows multiple modal dialogs to be open simultaneously.
 *    Eliminates black overlay veils that grey-out background dialogs.
 * 2. Header Dragging & Positioning: Makes every modal draggable by its header, with viewport clamping
 *    and double-click re-centering.
 * 3. Dynamic Z-Index Stacking: Automatically brings active/clicked windows to the front.
 * 4. Automatic Cascade: Staggers newly opened child dialogs so both parent and child windows remain visible.
 * 5. Global Dimmer: A single shared background backdrop dims the underlying app while keeping all open
 *    windows crisp, active, and interactive.
 */

class WindowManager {
  constructor() {
    this.baseZIndex = 12000;
    this.currentZIndex = 12000;
    this.activeModals = new Set();
    this.backdropEl = null;
    this.dragState = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    this.ensureGlobalBackdrop();
    this.setupGlobalListeners();
    this.setupMutationObserver();
    this.scanAndEnhanceModals();

    if (typeof window !== 'undefined') {
      window.windowManager = this;
    }
  }

  ensureGlobalBackdrop() {
    if (typeof document === 'undefined') return;
    let bd = document.getElementById('global-window-backdrop');
    if (!bd) {
      bd = document.createElement('div');
      bd.id = 'global-window-backdrop';
      bd.className = 'global-window-backdrop';
      document.body.appendChild(bd);
    }
    this.backdropEl = bd;

    this.backdropEl.addEventListener('click', (e) => {
      if (e.target === this.backdropEl) {
        this.onBackdropClicked();
      }
    });
  }

  onBackdropClicked() {
    const topmost = this.getTopmostModal();
    if (!topmost) return;

    // Gently pulse topmost window to indicate focus
    const box = this.getModalBox(topmost);
    if (box) {
      box.style.transition = 'transform 0.1s ease, box-shadow 0.1s ease';
      box.style.transform = 'scale(1.015)';
      setTimeout(() => {
        box.style.transform = '';
        setTimeout(() => { box.style.transition = ''; }, 120);
      }, 120);
    }
  }

  getModalBox(modal) {
    if (!modal) return null;
    return modal.querySelector('.modal-box, .dossier-modal-box, .history-issues-modal-box') || modal.firstElementChild;
  }

  getModalHeader(box) {
    if (!box) return null;
    return box.querySelector('.modal-header') || box.firstElementChild;
  }

  isModalActive(modal) {
    if (!modal || !modal.classList || !modal.classList.contains('modal-overlay')) return false;
    if (modal.id === 'incident-photos-lightbox-modal') return false; // Handled separately

    if (typeof window !== 'undefined' && modal.isConnected) {
      try {
        const comp = window.getComputedStyle(modal);
        if (comp && comp.display === 'none') return false;
      } catch (e) {}
    }

    const isDisplayNone = modal.style.display === 'none';
    const hasActive = modal.classList.contains('active');
    const hasFlex = modal.style.display === 'flex' || modal.style.display === 'block';
    return (hasActive || hasFlex) && !isDisplayNone;
  }

  setupGlobalListeners() {
    if (typeof document === 'undefined') return;

    // 1. Click/Pointerdown inside modal box elevates to front
    document.addEventListener('pointerdown', (e) => {
      // Do not alter styles or mutate DOM if interacting with form inputs / editable elements
      if (e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable], [contenteditable="true"], .editable, td.editable')) {
        return;
      }
      const modal = e.target.closest ? e.target.closest('.modal-overlay') : null;
      if (modal && this.isModalActive(modal)) {
        const box = this.getModalBox(modal);
        if (box && (box === e.target || box.contains(e.target))) {
          this.bringToFront(modal);
        }
      }
    });

    // 2. Drag pointermove handler
    window.addEventListener('pointermove', (e) => {
      if (!this.dragState) return;
      e.preventDefault();

      const { box, startX, startY, startLeft, startTop, width, height } = this.dragState;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let newLeft = startLeft + dx;
      let newTop = startTop + dy;

      // Clamping within viewport: titlebar must remain easily grabbable
      const minTop = 10;
      const maxTop = Math.max(10, window.innerHeight - 50);
      const minLeft = -(width - 100);
      const maxLeft = Math.max(10, window.innerWidth - 100);

      newTop = Math.max(minTop, Math.min(maxTop, newTop));
      newLeft = Math.max(minLeft, Math.min(maxLeft, newLeft));

      box.style.left = `${Math.round(newLeft)}px`;
      box.style.top = `${Math.round(newTop)}px`;
      box.dataset.hasCustomPos = 'true';
    });

    // 3. Drag pointerup / cancel handler
    const endDrag = (e) => {
      if (this.dragState) {
        const { box, header, pointerId } = this.dragState;
        if (header && typeof header.releasePointerCapture === 'function' && pointerId !== undefined) {
          try { header.releasePointerCapture(pointerId); } catch (err) {}
        }
        if (box) {
          box.classList.remove('is-dragging');
        }
        if (header) {
          header.classList.remove('is-dragging');
        }
        this.dragState = null;
      }
      document.body.style.userSelect = '';
      if (document.body.style.removeProperty) {
        document.body.style.removeProperty('user-select');
        document.body.style.removeProperty('-webkit-user-select');
      }
    };

    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('blur', endDrag);

    // 4. Keyboard Escape key closes topmost modal
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        const topmost = this.getTopmostModal();
        if (topmost) {
          const closeBtn = topmost.querySelector('.modal-header button, button[onclick*="close"], .btn-secondary');
          if (closeBtn && typeof closeBtn.click === 'function') {
            closeBtn.click();
          } else {
            topmost.classList.remove('active');
            topmost.style.display = 'none';
          }
        }
      }
    });

    // 5. Window resize: clamp any positioned floating modals into viewport
    window.addEventListener('resize', () => {
      this.activeModals.forEach(modal => {
        const box = this.getModalBox(modal);
        if (!box || !box.dataset.hasCustomPos || box.style.position !== 'fixed') return;
        const rect = box.getBoundingClientRect();
        const minTop = 10;
        const maxTop = Math.max(10, window.innerHeight - 50);
        const minLeft = -(rect.width - 100);
        const maxLeft = Math.max(10, window.innerWidth - 100);

        let curLeft = parseFloat(box.style.left) || rect.left;
        let curTop = parseFloat(box.style.top) || rect.top;

        curTop = Math.max(minTop, Math.min(maxTop, curTop));
        curLeft = Math.max(minLeft, Math.min(maxLeft, curLeft));

        box.style.left = `${Math.round(curLeft)}px`;
        box.style.top = `${Math.round(curTop)}px`;
      });
    });
  }

  setupMutationObserver() {
    if (typeof MutationObserver === 'undefined') return;

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && (m.attributeName === 'class' || m.attributeName === 'style')) {
          const target = m.target;
          if (target && target.classList && target.classList.contains('modal-overlay')) {
            const activeNow = this.isModalActive(target);
            const wasActive = this.activeModals.has(target);
            if (activeNow && !wasActive) {
              this.onModalOpened(target);
            } else if (!activeNow && wasActive) {
              this.onModalClosed(target);
            }
          }
        } else if (m.type === 'childList') {
          m.addedNodes.forEach(node => {
            if (node.nodeType === 1) {
              if (node.classList && node.classList.contains('modal-overlay')) {
                this.enhanceModal(node);
                if (this.isModalActive(node)) this.onModalOpened(node);
              } else {
                const subModals = node.querySelectorAll ? node.querySelectorAll('.modal-overlay') : [];
                subModals.forEach(sm => {
                  this.enhanceModal(sm);
                  if (this.isModalActive(sm)) this.onModalOpened(sm);
                });
              }
            }
          });
        }
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style'],
      childList: true,
      subtree: true
    });
  }

  scanAndEnhanceModals() {
    if (typeof document === 'undefined') return;
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(m => {
      this.enhanceModal(m);
      if (this.isModalActive(m)) {
        this.onModalOpened(m);
      }
    });
  }

  enhanceModal(modal) {
    if (!modal || modal.dataset.wmEnhanced === 'true') return;
    if (modal.id === 'incident-photos-lightbox-modal') return;

    modal.dataset.wmEnhanced = 'true';
    const box = this.getModalBox(modal);
    if (!box) return;

    const header = this.getModalHeader(box);
    if (header) {
      header.classList.add('wm-draggable-header');
      if (!header.title) {
        header.title = 'Drag to move window • Double-click to re-center';
      }

      header.addEventListener('pointerdown', (e) => {
        // Do not drag if clicking on buttons, links, inputs, selects, close icons
        if (e.target.closest('button, a, input, select, textarea, .no-drag, [data-no-drag]')) {
          return;
        }

        e.preventDefault();
        this.bringToFront(modal);

        const rect = box.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;

        // Freeze in fixed coordinate space without layout shifts
        if (box.style.position !== 'fixed') {
          box.style.position = 'fixed';
          box.style.margin = '0';
          box.style.left = `${Math.round(rect.left)}px`;
          box.style.top = `${Math.round(rect.top)}px`;
          box.style.width = `${Math.round(rect.width)}px`;
        }

        const startLeft = parseFloat(box.style.left) || rect.left;
        const startTop = parseFloat(box.style.top) || rect.top;

        this.dragState = {
          modal,
          box,
          header,
          startX,
          startY,
          startLeft,
          startTop,
          width: rect.width,
          height: rect.height,
          pointerId: e.pointerId
        };

        if (typeof header.setPointerCapture === 'function') {
          try { header.setPointerCapture(e.pointerId); } catch (err) {}
        }

        box.classList.add('is-dragging');
        header.classList.add('is-dragging');
        document.body.style.userSelect = 'none';
      });

      // Double click header to re-center window
      header.addEventListener('dblclick', (e) => {
        if (e.target.closest('button, a, input, select, textarea, .no-drag')) return;
        this.recenterModal(modal);
      });
    }
  }

  recenterModal(modal) {
    const box = this.getModalBox(modal);
    if (!box) return;
    box.style.transition = 'all 0.2s ease-out';
    box.style.position = '';
    box.style.left = '';
    box.style.top = '';
    box.style.width = '';
    box.style.margin = '';
    delete box.dataset.hasCustomPos;
    setTimeout(() => {
      box.style.transition = '';
    }, 220);
  }

  onModalOpened(modal) {
    if (!modal || this.activeModals.has(modal)) return;
    this.enhanceModal(modal);
    this.activeModals.add(modal);

    // Dynamic z-index elevation
    this.bringToFront(modal);

    // Stagger child modal if another window is already active
    if (this.activeModals.size > 1) {
      const box = this.getModalBox(modal);
      if (box && !box.dataset.hasCustomPos) {
        setTimeout(() => {
          if (!this.activeModals.has(modal) || box.dataset.hasCustomPos) return;
          const rect = box.getBoundingClientRect();
          const count = (this.activeModals.size - 1);
          const shiftX = ((count * 38) % 190);
          const shiftY = ((count * 28) % 140);

          let newL = rect.left + shiftX;
          let newT = rect.top + shiftY;

          // Keep inside viewport
          newL = Math.min(window.innerWidth - rect.width - 20, Math.max(20, newL));
          newT = Math.min(window.innerHeight - rect.height - 20, Math.max(20, newT));

          box.style.position = 'fixed';
          box.style.margin = '0';
          box.style.left = `${Math.round(newL)}px`;
          box.style.top = `${Math.round(newT)}px`;
          box.style.width = `${Math.round(rect.width)}px`;
          box.dataset.hasCustomPos = 'true';
        }, 10);
      }
    }

    this.updateBackdrop();
  }

  onModalClosed(modal) {
    if (!modal) return;
    this.activeModals.delete(modal);
    modal.classList.remove('is-topmost');

    // Reset position for next clean opening
    const box = this.getModalBox(modal);
    if (box) {
      box.style.position = '';
      box.style.left = '';
      box.style.top = '';
      box.style.width = '';
      box.style.margin = '';
      delete box.dataset.hasCustomPos;
    }

    const topmost = this.getTopmostModal();
    if (topmost) {
      topmost.classList.add('is-topmost');
    }

    this.updateBackdrop();
  }

  bringToFront(modal) {
    if (!modal) return;
    const isAlreadyTop = this.getTopmostModal() === modal;
    if (isAlreadyTop && modal.classList.contains('is-topmost')) {
      return; // Already topmost, avoid redundant DOM class/style mutations
    }
    if (!modal.style.zIndex || !isAlreadyTop) {
      this.currentZIndex++;
      modal.style.zIndex = String(this.currentZIndex);
    }

    // Update topmost styling class
    this.activeModals.forEach(m => {
      if (m !== modal) m.classList.remove('is-topmost');
    });
    modal.classList.add('is-topmost');
  }

  getTopmostModal() {
    let top = null;
    let maxZ = -1;
    this.activeModals.forEach(m => {
      const z = parseInt(m.style.zIndex || '0', 10);
      if (z > maxZ) {
        maxZ = z;
        top = m;
      }
    });
    return top;
  }

  updateBackdrop() {
    if (!this.backdropEl) this.ensureGlobalBackdrop();
    if (this.activeModals.size > 0) {
      this.backdropEl.classList.add('active');
    } else {
      this.backdropEl.classList.remove('active');
    }
  }
}

// Instantiate and expose globally
if (typeof window !== 'undefined') {
  window.WindowManager = WindowManager;
  window.windowManager = new WindowManager();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WindowManager };
}
