/**
 * gestures.js — Android-native gesture manager for mobile web app
 *
 * ES6 module exporting `GestureManager`.
 *
 * Gestures implemented:
 *   1. Swipe left/right to switch tabs
 *   2. Pull-to-refresh on Files & Analysis views
 *   3. Long-press context menu on .file-item
 *   4. Long-press context menu on .msg (chat message)
 *   5. Swipe-to-dismiss on #reasoning-panel
 *
 * Uses touch events only (touchstart / touchmove / touchend).
 */

/* ── CSS injected once ─────────────────────────────────────────── */

const GESTURE_CSS = `
/* swipe hint overlays */
.swipe-hint-left,
.swipe-hint-right {
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  z-index: 9998;
  font-size: 64px;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 0 0 12px rgba(0, 0, 0, 0.4);
  pointer-events: none;
  opacity: 0;
  transition: opacity 120ms ease-out;
  user-select: none;
}
.swipe-hint-left  { right: 24px; }
.swipe-hint-right { left: 24px; }
.swipe-hint-left.visible,
.swipe-hint-right.visible {
  opacity: 0.85;
}

/* pull-to-refresh spinner */
.pull-refresh-active {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9990;
}
.pull-refresh-active::before {
  content: '';
  width: 28px;
  height: 28px;
  border: 3px solid rgba(120, 120, 255, 0.25);
  border-top-color: rgba(120, 120, 255, 0.9);
  border-radius: 50%;
  animation: gm-spin 0.7s linear infinite;
}
@keyframes gm-spin { to { transform: rotate(360deg); } }

/* context menu */
.gm-context-menu {
  position: absolute;
  z-index: 10000;
  min-width: 160px;
  background: #2a2a35;
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.4);
  overflow: hidden;
  font-family: inherit;
  animation: gm-menu-in 120ms ease-out;
}
@keyframes gm-menu-in {
  from { transform: scale(0.9); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}
.gm-context-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  font-size: 15px;
  color: #e8e8ee;
  cursor: pointer;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  transition: background 80ms;
}
.gm-context-menu__item:last-child { border-bottom: none; }
.gm-context-menu__item:hover,
.gm-context-menu__item:active {
  background: rgba(255,255,255,0.08);
}
.gm-context-menu__item--danger { color: #ff6b6b; }
.gm-context-menu__backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: transparent;
}

/* reason panel slide-out */
#reasoning-panel.gm-dismissing {
  transition: transform 200ms ease-in;
  transform: translateX(110%);
}
`;

function _injectCSS() {
  if (document.getElementById('gm-gesture-css')) return;
  const style = document.createElement('style');
  style.id = 'gm-gesture-css';
  style.textContent = GESTURE_CSS;
  document.head.appendChild(style);
}

/* ── Helpers ───────────────────────────────────────────────────── */

const TAB_ORDER = ['chat', 'files', 'terminal', 'analysis'];

function _createSwipeHint(direction) {
  const el = document.createElement('div');
  el.className = direction === 'left' ? 'swipe-hint-left' : 'swipe-hint-right';
  el.textContent = direction === 'left' ? '→' : '←';
  document.body.appendChild(el);
  return el;
}

function _showHint(el, duration = 300) {
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), duration);
}

/**
 * Show a context menu at the given coordinates.
 * @param {number} x
 * @param {number} y
 * @param {{label:string,action:Function,danger?:boolean}[]} items
 * @returns {HTMLElement} menu element (also auto-dismissed on outside click)
 */
function _showContextMenu(x, y, items) {
  _dismissContextMenu();

  const backdrop = document.createElement('div');
  backdrop.className = 'gm-context-menu__backdrop';

  const menu = document.createElement('div');
  menu.className = 'gm-context-menu';

  items.forEach(({ label, action, danger }) => {
    const item = document.createElement('div');
    item.className = 'gm-context-menu__item' + (danger ? ' gm-context-menu__item--danger' : '');
    item.textContent = label;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      _dismissContextMenu();
      if (typeof action === 'function') action();
    });
    menu.appendChild(item);
  });

  // Position — clamp to viewport
  document.body.appendChild(backdrop);
  document.body.appendChild(menu);
  // Let layout settle, then clamp
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
    if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8;
    menu.style.left = Math.max(8, left) + 'px';
    menu.style.top = Math.max(8, top) + 'px';
  });

  backdrop.addEventListener('click', _dismissContextMenu);
  backdrop.addEventListener('touchstart', _dismissContextMenu, { passive: true });

  return menu;
}

let _activeMenu = null;
let _activeBackdrop = null;

function _dismissContextMenu() {
  if (_activeMenu)    { _activeMenu.remove();    _activeMenu = null; }
  if (_activeBackdrop) { _activeBackdrop.remove(); _activeBackdrop = null; }
}

/* ── GestureManager ────────────────────────────────────────────── */

class GestureManager {

  constructor({ app }) {
    this.app = app;
    this._enabled = false;

    // Hint elements
    this._hintLeft  = null;
    this._hintRight = null;

    // Touch tracking
    this._touch = {
      startX: 0,
      startY: 0,
      startTime: 0,
      currentX: 0,
      currentY: 0,
      active: false,
      target: null,
      longPressTimer: null,
      longPressFired: false,
      isScrolling: false,
    };

    // Bound handlers (so we can remove them later)
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove  = this._onTouchMove.bind(this);
    this._onTouchEnd   = this._onTouchEnd.bind(this);
  }

  /* ── Lifecycle ─────────────────────────────────────────────── */

  enable() {
    if (this._enabled) return;
    _injectCSS();

    this._hintLeft  = _createSwipeHint('left');
    this._hintRight = _createSwipeHint('right');

    const content = this._getContentArea();
    content.addEventListener('touchstart', this._onTouchStart, { passive: false });
    content.addEventListener('touchmove',  this._onTouchMove,  { passive: false });
    content.addEventListener('touchend',   this._onTouchEnd,   { passive: false });

    this._enabled = true;
  }

  disable() {
    if (!this._enabled) return;

    const content = this._getContentArea();
    content.removeEventListener('touchstart', this._onTouchStart);
    content.removeEventListener('touchmove',  this._onTouchMove);
    content.removeEventListener('touchend',   this._onTouchEnd);

    if (this._hintLeft)  { this._hintLeft.remove();  this._hintLeft = null; }
    if (this._hintRight) { this._hintRight.remove(); this._hintRight = null; }

    this._clearLongPressTimer();
    _dismissContextMenu();
    this._enabled = false;
  }

  /* ── Internal helpers ──────────────────────────────────────── */

  _getContentArea() {
    // Prefer an explicit element; fall back to document.body
    return document.querySelector('#app-content') ||
           document.querySelector('.app-content') ||
           document.querySelector('#main') ||
           document.body;
  }

  _currentTab() {
    if (this.app && typeof this.app.getState === 'function') {
      return this.app.getState().currentView || 'chat';
    }
    if (this.app && this.app.currentView) return this.app.currentView;
    return 'chat';
  }

  _switchTab(direction) {
    const current = this._currentTab();
    const idx = TAB_ORDER.indexOf(current);
    if (idx === -1) return;

    const newIdx = direction === 'next'
      ? Math.min(TAB_ORDER.length - 1, idx + 1)
      : Math.max(0, idx - 1);

    if (newIdx === idx) return; // already at edge

    const newTab = TAB_ORDER[newIdx];
    if (this.app && typeof this.app._switchView === 'function') {
      this.app._switchView(newTab);
    }
  }

  _clearLongPressTimer() {
    if (this._touch.longPressTimer) {
      clearTimeout(this._touch.longPressTimer);
      this._touch.longPressTimer = null;
    }
  }

  _vibrate(pattern = 15) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (_) { /* noop */ }
    }
  }

  /* ── Long-press detection ──────────────────────────────────── */

  _startLongPressTracking(target, x, y) {
    this._clearLongPressTimer();
    this._touch.longPressFired = false;

    this._touch.longPressTimer = setTimeout(() => {
      this._touch.longPressFired = true;

      // File item context menu
      const fileItem = target.closest('.file-item');
      if (fileItem) {
        this._vibrate(20);
        this._showFileMenu(fileItem, x, y);
        return;
      }

      // Chat message context menu
      const msgEl = target.closest('.msg');
      if (msgEl) {
        this._vibrate(20);
        this._showMessageMenu(msgEl, x, y);
        return;
      }
    }, 500);
  }

  _showFileMenu(fileItem, x, y) {
    const getFileName = () => fileItem.querySelector('.file-name, .name')?.textContent?.trim() || 'file';

    _showContextMenu(x, y, [
      {
        label: '📂 Open',
        action: () => {
          if (this.app?.openFile) this.app.openFile(getFileName());
          else fileItem.click();
        },
      },
      {
        label: '✏️ Rename',
        action: () => {
          if (this.app?.renameFile) this.app.renameFile(getFileName());
        },
      },
      {
        label: '🗑 Delete',
        danger: true,
        action: () => {
          if (this.app?.deleteFile) this.app.deleteFile(getFileName());
        },
      },
      {
        label: '🔗 Share',
        action: () => {
          if (this.app?.shareFile) this.app.shareFile(getFileName());
          else if (navigator.share) {
            navigator.share({ title: getFileName(), text: getFileName() }).catch(() => {});
          }
        },
      },
    ]);
  }

  _showMessageMenu(msgEl, x, y) {
    const getText = () => msgEl.querySelector('.msg-text, .content, .text')?.textContent?.trim()
                    || msgEl.textContent?.trim() || '';

    _showContextMenu(x, y, [
      {
        label: '📋 Copy',
        action: () => {
          const text = getText();
          if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text);
        },
      },
      {
        label: '🔗 Share',
        action: () => {
          const text = getText();
          if (navigator.share) navigator.share({ text }).catch(() => {});
        },
      },
      {
        label: '🗑 Delete',
        danger: true,
        action: () => {
          if (this.app?.deleteMessage) {
            const msgId = msgEl.dataset.id || msgEl.dataset.messageId;
            this.app.deleteMessage(msgId);
          } else {
            msgEl.remove();
          }
        },
      },
    ]);
  }

  /* ── Pull-to-refresh ───────────────────────────────────────── */

  _handlePullRefresh(target, deltaY) {
    const tab = this._currentTab();
    if (tab !== 'files' && tab !== 'analysis') return;

    // Check if the scrollable ancestor is at top
    let scrollEl = target.closest('[data-scrollable], .scrollable, .view-content, .panel-body');
    if (!scrollEl) scrollEl = this._getContentArea();

    const atTop = (scrollEl.scrollTop ?? 0) <= 0;
    if (!atTop) return;

    // Create / update spinner overlay
    let spinner = scrollEl.querySelector('.pull-refresh-active');
    if (!spinner) {
      spinner = document.createElement('div');
      spinner.className = 'pull-refresh-active';
      const parent = scrollEl.style.position === 'absolute' || scrollEl.style.position === 'relative'
        ? scrollEl : (scrollEl.style.position = 'relative', scrollEl);
      parent.insertBefore(spinner, parent.firstChild);
    }

    spinner.style.transform = `translateY(${Math.min(deltaY - 20, 60)}px)`;

    if (deltaY > 60 && !spinner.dataset.triggered) {
      spinner.dataset.triggered = '1';
      this._vibrate(15);
      this._triggerRefresh(tab, () => {
        spinner.remove();
      });
    }
  }

  _triggerRefresh(tab, done) {
    const app = this.app;
    try {
      if (tab === 'files' && typeof app?.renderFiles === 'function') {
        app.renderFiles();
      } else if (tab === 'files' && typeof app?.refreshFiles === 'function') {
        app.refreshFiles();
      } else if (tab === 'analysis' && typeof app?.renderAnalysis === 'function') {
        app.renderAnalysis();
      } else if (tab === 'analysis' && typeof app?.refreshAnalysis === 'function') {
        app.refreshAnalysis();
      }
    } finally {
      // Give the spinner at least 600ms of visibility
      setTimeout(done, 600);
    }
  }

  /* ── Swipe-to-dismiss reasoning panel ──────────────────────── */

  _handleReasoningSwipe(deltaX) {
    const panel = document.getElementById('reasoning-panel');
    if (!panel || panel.classList.contains('gm-dismissing')) return;

    // Apply live transform during swipe
    const progress = Math.min(1, Math.abs(deltaX) / panel.offsetWidth);
    panel.style.transition = 'none';
    panel.style.transform = `translateX(${Math.max(0, deltaX)}px)`;

    return progress;
  }

  _commitReasoningDismiss() {
    const panel = document.getElementById('reasoning-panel');
    if (!panel) return;
    panel.style.transition = '';
    panel.style.transform = '';
    panel.classList.add('gm-dismissing');
    setTimeout(() => {
      panel.style.display = 'none';
      panel.classList.remove('gm-dismissing');
      if (this.app?.toggleReasoning) this.app.toggleReasoning(false);
    }, 200);
  }

  _cancelReasoningSwipe() {
    const panel = document.getElementById('reasoning-panel');
    if (!panel) return;
    panel.style.transition = 'transform 200ms ease-out';
    panel.style.transform = '';
    setTimeout(() => { panel.style.transition = ''; }, 220);
  }

  /* ── Touch event handlers ──────────────────────────────────── */

  _onTouchStart(e) {
    if (e.touches.length !== 1) {
      this._clearLongPressTimer();
      return;
    }

    const t = e.touches[0];
    this._touch.startX    = t.clientX;
    this._touch.startY    = t.clientY;
    this._touch.currentX  = t.clientX;
    this._touch.currentY  = t.clientY;
    this._touch.startTime = Date.now();
    this._touch.active    = true;
    this._touch.target    = e.target;
    this._touch.isScrolling = false;

    // Start long-press timer for file items and messages
    this._startLongPressTracking(e.target, t.clientX, t.clientY);
  }

  _onTouchMove(e) {
    if (!this._touch.active || e.touches.length !== 1) return;

    const t = e.touches[0];
    this._touch.currentX = t.clientX;
    this._touch.currentY = t.clientY;

    const deltaX = t.clientX - this._touch.startX;
    const deltaY = t.clientY - this._touch.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // If movement exceeds threshold, cancel long-press
    if (absX > 10 || absY > 10) {
      this._clearLongPressTimer();
    }

    // Determine scroll direction on first significant move
    if (!this._touch.isScrolling) {
      if (absY > absX && absY > 10) {
        this._touch.isScrolling = true; // vertical scroll — don't prevent default
      }
    }

    // Reasoning panel swipe tracking
    if (absX > absY && absX > 20) {
      const panel = document.getElementById('reasoning-panel');
      if (panel && !panel.hidden && panel.style.display !== 'none' &&
          this._touch.target.closest?.('#reasoning-panel')) {
        e.preventDefault();
        this._handleReasoningSwipe(deltaX);
        return;
      }
    }

    // Pull-to-refresh tracking
    if (deltaY > 0 && absY > absX && deltaY > 10) {
      const tab = this._currentTab();
      if (tab === 'files' || tab === 'analysis') {
        this._handlePullRefresh(e.target, deltaY);
      }
    }
  }

  _onTouchEnd(e) {
    if (!this._touch.active) return;

    const dx = this._touch.currentX - this._touch.startX;
    const dy = this._touch.currentY - this._touch.startY;
    const dt = Date.now() - this._touch.startTime;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    this._clearLongPressTimer();
    this._touch.active = false;

    // If long-press fired, don't treat as swipe
    if (this._touch.longPressFired) {
      this._touch.longPressFired = false;
      return;
    }

    /* ── Reasoning panel swipe-to-dismiss ── */
    const panel = document.getElementById('reasoning-panel');
    if (panel && this._touch.target.closest?.('#reasoning-panel')) {
      if (dx > 80 && absX > absY) {
        this._commitReasoningDismiss();
      } else {
        this._cancelReasoningSwipe();
      }
      // Don't also treat as tab swipe
      return;
    }

    /* ── Swipe left/right for tabs ── */
    if (absX > 50 && absX > absY * 1.5 && dt < 300) {
      // Prevent the underlying click
      if (e.cancelable) e.preventDefault();

      if (dx > 0) {
        // Swipe right → previous tab
        if (this._hintRight) _showHint(this._hintRight, 250);
        this._switchTab('prev');
      } else {
        // Swipe left → next tab
        if (this._hintLeft) _showHint(this._hintLeft, 250);
        this._switchTab('next');
      }
      return;
    }

    /* ── Pull-to-refresh commit (if threshold met during move, already triggered) ── */
    // Cleanup spinner transform on release
    const spinner = this._getContentArea().querySelector('.pull-refresh-active');
    if (spinner && !spinner.dataset.triggered) {
      spinner.style.transition = 'transform 200ms ease-out';
      spinner.style.transform = 'translateY(-48px)';
      setTimeout(() => spinner.remove(), 220);
    }
  }
}

export { GestureManager };
export default GestureManager;
