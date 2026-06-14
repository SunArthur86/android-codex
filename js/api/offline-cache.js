/**
 * 离线 AI 缓存 — 在无网络时提供缓存响应
 * Offline AI Cache — Provide cached responses when offline
 *
 * 功能：
 *   - 缓存 GLM API 响应到 IndexedDB（store: 'ai-cache'）
 *   - 缓存 key = hash(messages + model + temperature)
 *   - 离线时模糊匹配相似查询，返回最相关的缓存响应
 *   - TTL: 7 天后过期，定期清理
 *   - UI: 离线模式徽章、缓存命中标注
 *   - 设置中可开关离线缓存
 *
 * 用法：
 *   import OfflineCache from './api/offline-cache.js';
 *   const cache = new OfflineCache();
 *   await cache.init();
 *   cache.store(key, messages, model, temp, response);
 *   const hit = await cache.lookup(messages, model, temp);
 */

/* ── 常量 ──────────────────────────────────────────────────────────── */

const DB_NAME = 'codex-mobile-cache';
const DB_VERSION = 1;
const STORE_NAME = 'ai-cache';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 每小时清理一次
const SETTINGS_KEY = 'codex-mobile-settings';

/* ── OfflineCache ────────────────────────────────────────────────── */

export class OfflineCache {
  constructor(options = {}) {
    this.db = null;
    this.enabled = true;
    this._cleanupTimer = null;
    this._badgeEl = null;
    this._settingsKey = options.settingsKey || SETTINGS_KEY;

    // 从设置加载开关状态
    this._loadEnabled();
  }

  /* ── IndexedDB ─────────────────────────────────────────────────── */

  _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('keywords', 'keywords', { multiEntry: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * 初始化缓存系统
   */
  async init() {
    try {
      this.db = await this._openDB();
      console.log('✅ OfflineCache 已初始化');

      // 启动定期清理
      this._startCleanup();

      // 立即执行一次清理
      this.cleanup();

      // 监听网络状态
      this._watchNetwork();
    } catch (err) {
      console.error('OfflineCache 初始化失败:', err);
    }
    return this;
  }

  /* ── 缓存操作 ──────────────────────────────────────────────────── */

  /**
   * 存储 API 响应到缓存
   * @param {Array} messages - 请求消息数组
   * @param {string} model - 模型名
   * @param {number} temperature - 温度参数
   * @param {Object|string} response - API 响应
   */
  async store(messages, model, temperature, response) {
    if (!this.enabled || !this.db) return;

    try {
      const key = this._hashKey(messages, model, temperature);
      const keywords = this._extractKeywords(messages);
      const lastUserMsg = this._getLastUserMessage(messages);
      const record = {
        key,
        messages: this._serializeMessages(messages),
        lastUserMessage: lastUserMsg,
        model,
        temperature,
        response: typeof response === 'string' ? response : JSON.stringify(response),
        keywords,
        timestamp: Date.now(),
        expiresAt: Date.now() + TTL_MS,
      };

      await this._put(record);
    } catch (err) {
      console.error('OfflineCache store 失败:', err);
    }
  }

  /**
   * 查找缓存响应
   * - 先精确匹配（key 相同）
   * - 离线时再做模糊匹配
   * @param {Array} messages
   * @param {string} model
   * @param {number} temperature
   * @returns {Promise<{hit: boolean, response: string|null, fromCache: boolean, fuzzy: boolean}>}
   */
  async lookup(messages, model, temperature) {
    if (!this.db) return { hit: false, response: null, fromCache: false, fuzzy: false };

    // 精确匹配
    const exactKey = this._hashKey(messages, model, temperature);
    const exact = await this._get(exactKey);
    if (exact && !this._isExpired(exact)) {
      return {
        hit: true,
        response: exact.response,
        fromCache: true,
        fuzzy: false,
      };
    }

    // 离线时尝试模糊匹配
    if (this.isOffline()) {
      const fuzzy = await this._fuzzyMatch(messages, model);
      if (fuzzy) {
        return {
          hit: true,
          response: fuzzy.response,
          fromCache: true,
          fuzzy: true,
        };
      }
    }

    return { hit: false, response: null, fromCache: false, fuzzy: false };
  }

  /**
   * 模糊匹配：使用关键词重叠度算法
   * @param {Array} messages
   * @param {string} model
   * @returns {Promise<Object|null>}
   */
  async _fuzzyMatch(messages, model) {
    const queryKeywords = new Set(this._extractKeywords(messages));
    if (queryKeywords.size === 0) return null;

    // 获取所有未过期缓存
    const all = await this._getAll();
    const valid = all.filter(r => !this._isExpired(r));

    let bestMatch = null;
    let bestScore = 0;

    for (const record of valid) {
      // 模型不一致则跳过（可选：放宽）
      if (record.model !== model) continue;

      const recordKeywords = new Set(record.keywords || []);
      if (recordKeywords.size === 0) continue;

      // 计算关键词重叠度 (Jaccard 系数)
      let intersection = 0;
      for (const kw of queryKeywords) {
        if (recordKeywords.has(kw)) intersection++;
      }
      const union = queryKeywords.size + recordKeywords.size - intersection;
      const score = intersection / union;

      // 阈值：至少 30% 关键词重叠
      if (score > 0.3 && score > bestScore) {
        bestScore = score;
        bestMatch = record;
      }
    }

    return bestMatch;
  }

  /**
   * 清空所有缓存
   */
  async clear() {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('数据库未初始化'));
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * 清理过期缓存
   */
  async cleanup() {
    if (!this.db) return 0;

    const all = await this._getAll();
    const now = Date.now();
    let cleaned = 0;

    for (const record of all) {
      if (this._isExpired(record)) {
        await this._delete(record.key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`OfflineCache: 清理了 ${cleaned} 条过期缓存`);
    }

    return cleaned;
  }

  /**
   * 获取缓存统计
   */
  async getStats() {
    const all = await this._getAll();
    const valid = all.filter(r => !this._isExpired(r));
    const totalSize = valid.reduce((sum, r) => {
      return sum + (r.response ? r.response.length : 0);
    }, 0);

    return {
      count: valid.length,
      expired: all.length - valid.length,
      totalSize,
      enabled: this.enabled,
    };
  }

  /* ── 开关控制 ──────────────────────────────────────────────────── */

  /**
   * 启用/禁用离线缓存
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    this._saveEnabled();
    if (enabled) {
      this._startCleanup();
    } else {
      this._stopCleanup();
    }
  }

  isEnabled() {
    return this.enabled;
  }

  _loadEnabled() {
    try {
      const settings = JSON.parse(localStorage.getItem(this._settingsKey) || '{}');
      this.enabled = settings.offlineCache !== false; // 默认启用
    } catch (e) {
      this.enabled = true;
    }
  }

  _saveEnabled() {
    try {
      const settings = JSON.parse(localStorage.getItem(this._settingsKey) || '{}');
      settings.offlineCache = this.enabled;
      localStorage.setItem(this._settingsKey, JSON.stringify(settings));
    } catch (e) {
      console.error('保存离线缓存设置失败:', e);
    }
  }

  /* ── 网络状态 ──────────────────────────────────────────────────── */

  isOffline() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  _watchNetwork() {
    window.addEventListener('online', () => this._updateBadge(false));
    window.addEventListener('offline', () => this._updateBadge(true));
    this._updateBadge(this.isOffline());
  }

  /* ── UI ────────────────────────────────────────────────────────── */

  /**
   * 更新离线模式徽章
   * @param {boolean} offline
   */
  _updateBadge(offline) {
    if (!this._badgeEl) {
      this._badgeEl = document.createElement('div');
      this._badgeEl.id = 'offline-badge';
      this._badgeEl.style.cssText = [
        'position:fixed',
        'top:4px',
        'right:50%',
        'transform:translateX(50%)',
        'background:#f39c12',
        'color:#fff',
        'font-size:10px',
        'padding:2px 10px',
        'border-radius:0 0 8px 8px',
        'z-index:2000',
        'font-weight:600',
        'transition:opacity .3s',
        'display:none',
      ].join(';');
      document.body.appendChild(this._badgeEl);
    }

    if (offline) {
      this._badgeEl.textContent = '📴 离线模式';
      this._badgeEl.style.display = '';
    } else {
      this._badgeEl.style.display = 'none';
    }
  }

  /**
   * 显示缓存命中提示
   * 在聊天气泡中添加"⚡ 缓存响应"标注
   * @param {HTMLElement} messageEl - 消息 DOM 元素
   */
  markCacheHit(messageEl, fuzzy = false) {
    if (!messageEl) return;

    const badge = document.createElement('span');
    badge.style.cssText = [
      'display:inline-block',
      'font-size:10px',
      'padding:1px 6px',
      'border-radius:4px',
      'margin-bottom:4px',
      'background:' + (fuzzy ? '#e67e22' : '#27ae60'),
      'color:#fff',
      'font-weight:600',
    ].join(';');
    badge.textContent = fuzzy ? '⚡ 模糊缓存响应' : '⚡ 缓存响应';

    messageEl.insertBefore(badge, messageEl.firstChild);
  }

  /**
   * 在设置面板中添加缓存开关
   * @param {HTMLElement} [container]
   */
  attachToSettings(container) {
    const target = container || document.querySelector('.sheet-body');
    if (!target) return;

    const group = document.createElement('div');
    group.className = 'setting-group';
    group.style.cssText = 'margin-top:12px;';

    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.enabled;
    checkbox.style.cssText = 'width:18px;height:18px;cursor:pointer;';
    checkbox.addEventListener('change', () => {
      this.setEnabled(checkbox.checked);
    });

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode('离线 AI 缓存（无网络时返回缓存响应）'));

    group.appendChild(label);

    // 缓存统计 + 清除按钮
    const statsRow = document.createElement('div');
    statsRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:8px;';

    this._statsLabel = document.createElement('span');
    this._statsLabel.style.cssText = 'flex:1;font-size:11px;color:var(--text-secondary,#888);';
    this._statsLabel.textContent = '缓存: 加载中...';

    const clearBtn = document.createElement('button');
    clearBtn.textContent = '🗑 清空';
    clearBtn.style.cssText = [
      'background:transparent',
      'border:1px solid var(--border,#555)',
      'border-radius:6px',
      'padding:4px 10px',
      'font-size:11px',
      'color:var(--text-secondary,#aaa)',
      'cursor:pointer',
    ].join(';');
    clearBtn.addEventListener('click', async () => {
      await this.clear();
      this._refreshStats();
      console.log('缓存已清空');
    });

    statsRow.appendChild(this._statsLabel);
    statsRow.appendChild(clearBtn);
    group.appendChild(statsRow);

    target.appendChild(group);

    // 刷新统计
    this._refreshStats();
    // 定期刷新
    setInterval(() => this._refreshStats(), 5000);
  }

  async _refreshStats() {
    if (!this._statsLabel) return;
    try {
      const stats = await this.getStats();
      const sizeKB = Math.round(stats.totalSize / 1024);
      this._statsLabel.textContent = `缓存: ${stats.count} 条, ${sizeKB} KB${stats.enabled ? '' : ' (已禁用)'}`;
    } catch (e) {
      this._statsLabel.textContent = '缓存: 不可用';
    }
  }

  /* ── 定期清理 ──────────────────────────────────────────────────── */

  _startCleanup() {
    this._stopCleanup();
    this._cleanupTimer = setInterval(() => {
      this.cleanup().catch(err => console.error('缓存清理失败:', err));
    }, CLEANUP_INTERVAL_MS);
  }

  _stopCleanup() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }

  /* ── 工具方法 ──────────────────────────────────────────────────── */

  /**
   * 生成缓存 key = hash(messages + model + temperature)
   */
  _hashKey(messages, model, temperature) {
    const str = this._serializeMessages(messages) + '|' + model + '|' + temperature;
    return this._hash(str);
  }

  /**
   * 简单 hash 函数（djb2 变体）
   */
  _hash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & hash; // 转 32 位整数
    }
    return 'cache_' + (hash >>> 0).toString(36);
  }

  /**
   * 序列化消息数组为字符串
   */
  _serializeMessages(messages) {
    if (!Array.isArray(messages)) return String(messages || '');
    return messages.map(m => {
      const role = m.role || 'unknown';
      const content = typeof m === 'string' ? m : (m.content || '');
      return role + ':' + content;
    }).join('\n');
  }

  /**
   * 获取最后一条用户消息
   */
  _getLastUserMessage(messages) {
    if (!Array.isArray(messages)) return '';
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return typeof messages[i] === 'string' ? messages[i] : (messages[i].content || '');
      }
    }
    return '';
  }

  /**
   * 提取关键词（用于模糊匹配）
   * 策略：分词 → 去停用词 → 小写化 → 取长度 > 2 的词
   */
  _extractKeywords(messages) {
    const text = this._getLastUserMessage(messages);
    if (!text) return [];

    // 停用词列表
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
      'could', 'may', 'might', 'must', 'can', 'need', 'shall',
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
      'my', 'your', 'his', 'its', 'our', 'their',
      'this', 'that', 'these', 'those', 'and', 'or', 'but', 'not', 'no', 'so',
      'if', 'then', 'else', 'when', 'where', 'why', 'how', 'what', 'which', 'who',
      'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'as', 'about',
      'into', 'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down',
      'out', 'off', 'over', 'under', 'again', 'further', 'all', 'any', 'both',
      'each', 'few', 'more', 'most', 'other', 'some', 'such',
      'am', 'im', 'dont', 'cant', 'wont', 'id',
      '的', '了', '是', '在', '我', '你', '他', '她', '它', '们',
      '这', '那', '和', '与', '或', '但', '不', '没', '有', '为',
      '请', '帮', '给', '让', '用', '把', '被', '到', '从', '对',
      '上', '下', '里', '外', '中', '要', '会', '能', '可', '以',
    ]);

    // 英文分词
    const words = text.toLowerCase().match(/[a-z][a-z0-9_]*/g) || [];
    // 中文分词（简单：取连续中文字符块，每 2-4 字为一组）
    const chineseBlocks = text.match(/[\u4e00-\u9fa5]+/g) || [];

    const keywords = [];

    // 英文关键词
    for (const word of words) {
      if (word.length > 2 && !stopWords.has(word)) {
        keywords.push(word);
      }
    }

    // 中文关键词：对每个连续块，取 2-gram
    for (const block of chineseBlocks) {
      if (block.length <= 2) {
        keywords.push(block);
      } else {
        // 取 2-gram 和 3-gram
        for (let i = 0; i < block.length - 1; i++) {
          keywords.push(block.substring(i, i + 2));
          if (i < block.length - 2) {
            keywords.push(block.substring(i, i + 3));
          }
        }
      }
    }

    // 去重
    return [...new Set(keywords)];
  }

  /**
   * 判断缓存是否过期
   */
  _isExpired(record) {
    if (!record.expiresAt) return true;
    return Date.now() > record.expiresAt;
  }

  /* ── IndexedDB 底层 ────────────────────────────────────────────── */

  _put(record) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('数据库未初始化'));
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = () => reject(req.error);
    });
  }

  _get(key) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('数据库未初始化'));
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  _getAll() {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('数据库未初始化'));
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  _delete(key) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('数据库未初始化'));
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }
}

export default OfflineCache;
