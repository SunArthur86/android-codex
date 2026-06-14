/**
 * NativeBridge — Web↔Android 桥接抽象层
 * ════════════════════════════════════════════════════════════════
 * 检测 window.CodexNative (Android @JavascriptInterface)。
 * 如果存在 → 使用原生 Android API（更强、更可靠）。
 * 如果不存在 → 回退到 Web API（PWA 模式）。
 *
 * 每个方法都实现双路径：native → web fallback → no-op。
 */

class NativeBridge {
  constructor() {
    /** 是否运行在 Android 原生壳中 */
    this.isNative = typeof window.CodexNative !== 'undefined';
    /** Android bridge 引用 */
    this._bridge = this.isNative ? window.CodexNative : null;
    /** Web API 备用实例 */
    this._webFallback = null;
    /** 连接状态回调列表 */
    this._statusCallbacks = [];

    if (this.isNative) {
      console.log('🤖 NativeBridge: 运行在 Android 原生壳中');
      this._setupNativeListeners();
    } else {
      console.log('🌐 NativeBridge: 运行在 PWA 模式（浏览器）');
      this._setupWebListeners();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 模式判断
  // ═══════════════════════════════════════════════════════════════

  /** 返回当前运行模式 */
  getMode() {
    return this.isNative ? 'native' : 'pwa';
  }

  /** 获取设备信息 */
  async getDeviceInfo() {
    if (this.isNative) {
      try {
        return JSON.parse(this._bridge.getSystemInfo());
      } catch {
        return { platform: 'android-native', error: 'parse failed' };
      }
    }
    // Web fallback
    return {
      platform: navigator.platform || 'web',
      userAgent: navigator.userAgent,
      language: navigator.language,
      online: navigator.onLine,
      screen: { w: screen.width, h: screen.height },
      cookies: navigator.cookieEnabled,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 文件系统
  // ═══════════════════════════════════════════════════════════════

  /**
   * 读取真实文件（原生模式）或虚拟文件（PWA 模式）
   * @returns {Promise<string|null>} 文件内容或 null
   */
  async readFile(path) {
    if (this.isNative) {
      try {
        const result = JSON.parse(this._bridge.readFile(path));
        return result.ok ? result.content : null;
      } catch { return null; }
    }
    return null; // PWA 模式由 FileManager (IndexedDB) 处理
  }

  /**
   * 写入真实文件（原生）或虚拟文件（PWA）
   * @returns {Promise<boolean>}
   */
  async writeFile(path, content) {
    if (this.isNative) {
      try {
        const result = JSON.parse(this._bridge.writeFile(path, content));
        return result.ok === true;
      } catch { return false; }
    }
    return false; // PWA 模式由 FileManager 处理
  }

  /**
   * 列出真实目录文件
   * @returns {Promise<Array>}
   */
  async listFiles(path) {
    if (this.isNative) {
      try {
        const result = JSON.parse(this._bridge.listFiles(path || '/'));
        return result.ok ? result.items : [];
      } catch { return []; }
    }
    return []; // PWA 模式由 FileManager 处理
  }

  // ═══════════════════════════════════════════════════════════════
  // 终端命令执行
  // ═══════════════════════════════════════════════════════════════

  /**
   * 执行真实 shell 命令（原生模式）或返回 null（PWA 模式）
   * @returns {Promise<{stdout:string, stderr:string, exitCode:number}|null>}
   */
  async execCommand(command) {
    if (this.isNative) {
      try {
        const result = JSON.parse(this._bridge.runCommand(command));
        return {
          stdout: result.stdout || '',
          stderr: result.stderr || '',
          exitCode: result.exitCode ?? -1,
        };
      } catch { return null; }
    }
    return null; // PWA 模式使用模拟终端
  }

  // ═══════════════════════════════════════════════════════════════
  // 震动反馈
  // ═══════════════════════════════════════════════════════════════

  vibrate(pattern) {
    const patterns = {
      light: 10, medium: 30, heavy: 50,
      success: [10, 30, 10], error: [50, 50, 50],
      warning: [30, 20, 30, 20, 30],
    };
    const raw = typeof pattern === 'string' ? (patterns[pattern] || 10) : pattern;

    if (this.isNative) {
      try {
        // Java bridge expects string pattern name or JSON array
        if (typeof pattern === 'string') {
          this._bridge.vibrate(pattern);
        } else if (Array.isArray(raw)) {
          this._bridge.vibrate(JSON.stringify(raw));
        } else {
          this._bridge.vibrate(String(raw));
        }
      } catch {}
    } else if (navigator.vibrate) {
      navigator.vibrate(raw);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Wake Lock
  // ═══════════════════════════════════════════════════════════════

  async requestWakeLock() {
    if (this.isNative) {
      try { this._bridge.requestWakeLock(); return; } catch {}
    }
    // Web fallback
    if ('wakeLock' in navigator) {
      try {
        this._webWakeLock = await navigator.wakeLock.request('screen');
      } catch {}
    }
  }

  async releaseWakeLock() {
    if (this.isNative) {
      try { this._bridge.releaseWakeLock(); return; } catch {}
    }
    if (this._webWakeLock) {
      try { await this._webWakeLock.release(); this._webWakeLock = null; } catch {}
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 通知
  // ═══════════════════════════════════════════════════════════════

  /**
   * 显示系统通知
   * 原生模式: Android Notification (无需权限请求)
   * PWA 模式: Notification API (需要用户授权)
   */
  async showNotification(title, text) {
    if (this.isNative) {
      try { this._bridge.showNotification(title, text); return true; } catch { return false; }
    }
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, { body: text, icon: '/manifest-icon.png' });
        return true;
      } else if (Notification.permission !== 'denied') {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          new Notification(title, { body: text });
          return true;
        }
      }
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════
  // 分享
  // ═══════════════════════════════════════════════════════════════

  async share(title, text, url) {
    const shareData = { title, text: text || '', url: url || '' };

    if (this.isNative) {
      try { this._bridge.share(title, text || ''); return true; } catch { return false; }
    }
    if (navigator.share) {
      try { await navigator.share(shareData); return true; } catch { return false; }
    }
    // Fallback: copy to clipboard
    const fullText = url ? `${title}\n${text}\n${url}` : `${title}\n${text}`;
    return this.copyToClipboard(fullText);
  }

  // ═══════════════════════════════════════════════════════════════
  // 剪贴板
  // ═══════════════════════════════════════════════════════════════

  async copyToClipboard(text) {
    if (this.isNative) {
      try { this._bridge.copyToClipboard(text); return true; } catch { return false; }
    }
    if (navigator.clipboard) {
      try { await navigator.clipboard.writeText(text); return true; } catch {}
    }
    // Legacy fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); document.body.removeChild(ta); return true; }
    catch { document.body.removeChild(ta); return false; }
  }

  async getClipboardText() {
    if (this.isNative) {
      try { return this._bridge.getClipboardText(); } catch { return ''; }
    }
    if (navigator.clipboard && navigator.clipboard.readText) {
      try { return await navigator.clipboard.readText(); } catch { return ''; }
    }
    return '';
  }

  // ═══════════════════════════════════════════════════════════════
  // 网络状态
  // ═══════════════════════════════════════════════════════════════

  isOnline() {
    if (this.isNative) {
      try { return this._bridge.isOnline(); } catch {}
    }
    return navigator.onLine;
  }

  getConnectionType() {
    if (navigator.connection) {
      return navigator.connection.effectiveType || 'unknown';
    }
    return this.isOnline() ? 'online' : 'offline';
  }

  onStatusChange(callback) {
    this._statusCallbacks.push(callback);
  }

  _setupWebListeners() {
    window.addEventListener('online', () => {
      this._statusCallbacks.forEach(cb => cb(true));
    });
    window.addEventListener('offline', () => {
      this._statusCallbacks.forEach(cb => cb(false));
    });
  }

  _setupNativeListeners() {
    // Native listeners are set up via AndroidBridge callbacks
    // But also listen to web events as backup
    this._setupWebListeners();
  }

  // ═══════════════════════════════════════════════════════════════
  // 后台 Agent 服务（仅原生模式）
  // ═══════════════════════════════════════════════════════════════

  /**
   * 启动前台服务（原生模式独有功能）
   * 允许 Agent 在后台持续运行 4-5 小时
   */
  startAgentService(task) {
    if (this.isNative) {
      try { this._bridge.startAgentService(task || ''); return true; } catch { return false; }
    }
    console.warn('startAgentService: 仅在原生模式可用');
    return false;
  }

  /** 停止前台服务 */
  stopAgentService() {
    if (this.isNative) {
      try { this._bridge.stopAgentService(); return true; } catch { return false; }
    }
    return false;
  }

  /**
   * 请求电池优化豁免
   * 让系统不要在省电模式下杀掉 Agent 服务
   */
  requestBatteryOptimizationExemption() {
    if (this.isNative) {
      try { this._bridge.requestBatteryOptimizationExemption(); return true; } catch {}
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════
  // 下载文件
  // ═══════════════════════════════════════════════════════════════

  async downloadFile(filename, content) {
    if (this.isNative) {
      try { this._bridge.downloadFile(filename, content); return true; } catch {}
    }
    // Web fallback: create download link
    try {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return true;
    } catch { return false; }
  }

  // ═══════════════════════════════════════════════════════════════
  // 全屏 / 状态栏
  // ═══════════════════════════════════════════════════════════════

  async enterFullscreen() {
    if (this.isNative) {
      try { this._bridge.enterFullscreen(); return; } catch {}
    }
    const el = document.documentElement;
    if (el.requestFullscreen) await el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  }

  setStatusBarColor(hexColor) {
    if (this.isNative) {
      try { this._bridge.setStatusBarColor(hexColor); } catch {}
    }
    // Web fallback: update theme-color meta tag
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', hexColor);
  }

  // ═══════════════════════════════════════════════════════════════
  // Toast
  // ═══════════════════════════════════════════════════════════════

  showToast(message, long = false) {
    if (this.isNative) {
      try { this._bridge.showToast(message); return; } catch {}
    }
    // Web fallback: use app toast
    if (window.codexApp && window.codexApp._toast) {
      window.codexApp._toast(message, 'info');
    }
  }
}

// Export singleton
export const nativeBridge = new NativeBridge();
export default NativeBridge;
