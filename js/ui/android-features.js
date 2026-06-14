/**
 * android-features.js
 *
 * Android-specific Web API integrations for the Codex agent UI.
 *
 * Provides graceful-degradation wrappers around:
 *   - Screen Wake Lock (keep screen on during long tasks)
 *   - Haptic feedback via navigator.vibrate
 *   - Web Share API (share text + share files)
 *   - Connection status (online/offline, effectiveType)
 *   - Battery Status API (level, charging, change subscriptions)
 *   - PWA beforeinstallprompt capture + trigger
 *   - Clipboard copy (async writeText w/ execCommand fallback)
 *   - Fullscreen toggle (requestExitFullscreen + state check)
 *
 * Every method degrades gracefully when the underlying API is absent —
 * critical for running inside Android WebView where many "standard"
 * APIs are either missing or behaviourally different.
 *
 * ES6 module, default export is the AndroidFeatures class.
 */

/** Quick polyfill test — true if running inside an Android WebView */
const _IS_ANDROID = (() => {
  try {
    return /android/i.test(navigator.userAgent || '');
  } catch (_) {
    return false;
  }
})();

/**
 * Small helper to check whether a deep property path is a callable.
 * Keeps call-sites short and safe across WebView quirks.
 */
function _safe(obj, ...path) {
  let cur = obj;
  for (const key of path) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[key];
  }
  return cur;
}

export class AndroidFeatures {
  // ─────────────────────────────────────────────────────────────────────────
  // Internal state (initialised in constructor)
  // ─────────────────────────────────────────────────────────────────────────

  constructor() {
    /** @type {WakeLockSentinel|null} */
    this._wakeLock = null;

    /** @type {boolean} */
    this._wakeLockWanted = false;

    /** @type {BatteryManager|null} */
    this._batteryManager = null;

    /** @type {Function|null} */
    this._batteryCallback = null;

    /** @type {Set<Function>} */
    this._connCallbacks = new Set();

    /** @type {Event|null} */
    this._deferredPrompt = null;

    /** @type {boolean} */
    this._promptInstalled = false;

    // Initialise listeners once — constructor is called early in app lifecycle.
    this._initVisibilityListener();
    this._initInstallPromptListener();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Wake Lock
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Request a screen wake lock to keep the display on.
   * Stores the sentinel and tracks a "wanted" flag so the
   * visibilitychange handler can re-acquire after backgrounding.
   *
   * @returns {Promise<boolean>} true if the lock was acquired
   */
  async requestWakeLock() {
    if (!_safe(navigator, 'wakeLock', 'request')) {
      return false;
    }
    try {
      this._wakeLock = await navigator.wakeLock.request('screen');
      this._wakeLockWanted = true;
      this._wakeLock.addEventListener?.('release', () => {
        // Browser released the lock (tab hidden) — if still wanted, re-acquire
        if (this._wakeLockWanted) {
          this._reacquireWakeLock();
        }
      });
      return true;
    } catch (err) {
      // AbortError is normal (user denied / page not focused)
      return false;
    }
  }

  /**
   * Release the current wake lock and stop auto-reacquiring.
   */
  releaseWakeLock() {
    this._wakeLockWanted = false;
    if (this._wakeLock) {
      try {
        this._wakeLock.release();
      } catch (_) {
        /* already released */
      }
      this._wakeLock = null;
    }
  }

  /**
   * Internal: re-acquire the wake lock after it was released by the
   * browser (typically when the tab was hidden and is now visible again).
   */
  async _reacquireWakeLock() {
    if (document.visibilityState !== 'visible') return;
    if (this._wakeLock) return; // already held
    if (!this._wakeLockWanted) return;
    await this.requestWakeLock();
  }

  /**
   * Initialise the visibilitychange listener that auto-re-acquires
   * the wake lock on Android (where hiding the tab releases it).
   */
  _initVisibilityListener() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this._wakeLockWanted) {
        this._reacquireWakeLock();
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Haptic Feedback
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Low-level vibration wrapper.
   * @param {number|number[]} pattern – duration in ms or array of [on,off,...]
   */
  vibrate(pattern) {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
      return; // silently no-op
    }
    try {
      navigator.vibrate(pattern);
    } catch (_) {
      /* some WebView contexts throw SecurityError */
    }
  }

  /** Light tap (10 ms) */
  light() { this.vibrate(10); }

  /** Medium tap (30 ms) */
  medium() { this.vibrate(30); }

  /** Heavy tap (50 ms) */
  heavy() { this.vibrate(50); }

  /** Success pattern: short–pause–short */
  success() { this.vibrate([10, 30, 10]); }

  /** Error pattern: three long pulses */
  error() { this.vibrate([50, 50, 50]); }

  /** Warning pattern: triple medium pulse */
  warning() { this.vibrate([30, 20, 30, 20, 30]); }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Web Share API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Share text data.  Falls back to clipboard + toast.
   *
   * @param {string} title
   * @param {string} text
   * @param {string} [url]
   * @returns {Promise<boolean>} true if shared or copied, false on failure
   */
  async share(title, text, url) {
    const shareData = { title: title || '', text: text || '' };
    if (url) shareData.url = url;

    // Prefer native share sheet
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return true;
      } catch (err) {
        if (err && err.name === 'AbortError') return false; // user cancelled
        // fall through to clipboard fallback
      }
    }

    // Fallback: copy combined text + toast
    const combined = [shareData.title, shareData.text, shareData.url].filter(Boolean).join('\n');
    const copied = await this.copy(combined);
    this._toast(copied ? 'Copied to clipboard' : 'Share not supported');
    return copied;
  }

  /**
   * Share a file via the Web Share API (Level 2 — files param).
   *
   * @param {string} filename – suggested file name
   * @param {Blob|ArrayBuffer|string} content – raw content
   * @returns {Promise<boolean>}
   */
  async shareFile(filename, content) {
    // Build Blob if needed
    let blob;
    if (content instanceof Blob) {
      blob = content;
    } else if (content instanceof ArrayBuffer) {
      blob = new Blob([content]);
    } else {
      blob = new Blob([String(content)], { type: 'text/plain' });
    }

    // Try attaching File metadata
    let file;
    try {
      file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    } catch (_) {
      file = blob; // old browsers without File constructor
    }

    // navigator.canShare check
    if (navigator.canShare && navigator.share) {
      const shareObj = { files: [file] };
      try {
        if (navigator.canShare(shareObj)) {
          await navigator.share(shareObj);
          return true;
        }
      } catch (err) {
        if (err && err.name === 'AbortError') return false;
        // fall through
      }
    }

    // Fallback: download the file
    this._downloadBlob(file, filename);
    this._toast('File downloaded (share not supported)');
    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Connection Status
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * @returns {boolean} true if the browser reports an online connection
   */
  isOnline() {
    return typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
  }

  /**
   * Register a callback for online/offline transitions.
   * @param {(online: boolean) => void} callback
   * @returns {() => void} unsubscribe function
   */
  onStatusChange(callback) {
    if (typeof callback !== 'function') return () => {};

    const handler = () => callback(this.isOnline());
    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);
    this._connCallbacks.add(callback);

    return () => {
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
      this._connCallbacks.delete(callback);
    };
  }

  /**
   * @returns {string} '4g' | '3g' | '2g' | 'slow-2g' | 'unknown'
   */
  getConnectionType() {
    const type = _safe(navigator, 'connection', 'effectiveType');
    return type || 'unknown';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Battery Status
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * @returns {Promise<number|null>} 0–1, or null if unavailable
   */
  async getBatteryLevel() {
    const battery = await this._getBatteryManager();
    if (!battery) return null;
    return battery.level;
  }

  /**
   * @returns {Promise<boolean>}
   */
  async isLowBattery() {
    const battery = await this._getBatteryManager();
    if (!battery) return false;
    return battery.level < 0.15 && !battery.charging;
  }

  /**
   * Subscribe to battery level changes.
   * Called immediately with the current battery object (if available).
   *
   * @param {(info: {level: number, charging: boolean}|null) => void} callback
   * @returns {() => void} unsubscribe function
   */
  onBatteryChange(callback) {
    if (typeof callback !== 'function') return () => {};

    let unsub = () => {};

    this._getBatteryManager().then((battery) => {
      if (!battery) {
        callback(null);
        return;
      }

      const handler = () => {
        callback({ level: battery.level, charging: battery.charging });
      };

      // Fire immediately
      handler();

      battery.addEventListener('levelchange', handler);
      battery.addEventListener('chargingchange', handler);
      this._batteryCallback = callback;

      unsub = () => {
        battery.removeEventListener('levelchange', handler);
        battery.removeEventListener('chargingchange', handler);
        if (this._batteryCallback === callback) this._batteryCallback = null;
      };
    });

    return () => unsub();
  }

  /**
   * Internal helper to obtain (and cache) the BatteryManager.
   * @returns {Promise<BatteryManager|null>}
   */
  async _getBatteryManager() {
    if (this._batteryManager) return this._batteryManager;
    if (!navigator.getBattery) return null;
    try {
      this._batteryManager = await navigator.getBattery();
      return this._batteryManager;
    } catch (_) {
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Install Prompt (PWA)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Initialise the beforeinstallprompt / appinstalled listeners.
   * Called once from the constructor.
   */
  _initInstallPromptListener() {
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent the mini-infobar on Android Chrome
      e.preventDefault();
      this._deferredPrompt = e;
    });

    window.addEventListener('appinstalled', () => {
      this._promptInstalled = true;
      this._deferredPrompt = null;
    });
  }

  /**
   * @returns {boolean} whether the deferred install prompt is available
   */
  canInstall() {
    return this._deferredPrompt !== null && !this._promptInstalled;
  }

  /**
   * Trigger the stored beforeinstallprompt.
   * @returns {Promise<boolean>} true if the user accepted
   */
  async promptInstall() {
    if (!this._deferredPrompt) return false;

    try {
      this._deferredPrompt.prompt();
      const choice = await this._deferredPrompt.userChoice;
      this._deferredPrompt = null;
      return choice.outcome === 'accepted';
    } catch (_) {
      this._deferredPrompt = null;
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Copy to Clipboard
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Copy text to the system clipboard with fallback.
   * @param {string} text
   * @returns {Promise<boolean>}
   */
  async copy(text) {
    // Preferred async clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) {
        // fall through to legacy method
      }
    }

    // Legacy fallback — works in most WebView contexts
    return this._copyFallback(text);
  }

  /**
   * execCommand-based clipboard fallback.
   * @param {string} text
   * @returns {boolean}
   */
  _copyFallback(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      ta.setAttribute('readonly', '');
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (_) {
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 8. Fullscreen
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Enter fullscreen on document.documentElement.
   * Tries vendor-prefixed methods for older Android WebViews.
   * @returns {Promise<boolean>}
   */
  async enterFullscreen() {
    const el = document.documentElement;
    const fn =
      el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.webkitRequestFullScreen ||
      el.mozRequestFullScreen ||
      el.msRequestFullscreen;
    if (!fn) return false;
    try {
      await fn.call(el);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Exit fullscreen.
   * @returns {Promise<boolean>}
   */
  async exitFullscreen() {
    const fn =
      document.exitFullscreen ||
      document.webkitExitFullscreen ||
      document.webkitCancelFullScreen ||
      document.mozCancelFullScreen ||
      document.msExitFullscreen;
    if (!fn) return false;
    try {
      await fn.call(document);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Check whether the document is currently in fullscreen.
   * @returns {boolean}
   */
  isFullscreen() {
    const fsEl =
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.webkitCurrentFullScreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement;
    return !!fsEl;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal UI helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Minimal toast notification.
   * Looks for a global toast function, otherwise creates a transient div.
   * @param {string} message
   */
  _toast(message) {
    // If the host app exposes a toast utility, prefer it
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast(message);
      return;
    }

    try {
      const el = document.createElement('div');
      el.textContent = message;
      el.style.cssText = [
        'position:fixed',
        'bottom:24px',
        'left:50%',
        'transform:translateX(-50%)',
        'background:rgba(33,33,33,0.92)',
        'color:#fff',
        'padding:10px 20px',
        'border-radius:8px',
        'font-size:14px',
        'z-index:99999',
        'pointer-events:none',
        'transition:opacity .3s',
      ].join(';');
      document.body.appendChild(el);
      setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
      }, 2200);
    } catch (_) {
      /* DOM not available */
    }
  }

  /**
   * Trigger a file download (fallback for shareFile).
   * @param {Blob} blob
   * @param {string} filename
   */
  _downloadBlob(blob, filename) {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (_) {
      /* no-op */
    }
  }
}

export default AndroidFeatures;
