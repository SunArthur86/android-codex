/**
 * 会话历史管理器 — 保存和管理 Agent 对话历史
 * History Manager — Persist and manage Agent conversation sessions
 *
 * 功能：
 *   - 每次对话自动保存到 IndexedDB（store: 'sessions'）
 *   - 支持列表 / 加载 / 删除 / 创建 / 更新会话
 *   - UI 抽屉：下拉露出历史会话列表，点击可切换
 *   - 导出会话为 JSON 文件
 *
 * 使用独立 IndexedDB 数据库，与 FileManager 的 codex-mobile-fs 隔离，
 * 避免版本冲突。
 */

/* ── 常量 ──────────────────────────────────────────────────────────── */

const DB_NAME = 'codex-mobile-history';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';

/* ── HistoryManager ────────────────────────────────────────────────── */

export class HistoryManager {
  constructor(options = {}) {
    this.db = null;
    this.currentSessionId = null;
    this._container = options.container || document.body;
    this._drawerEl = null;
    this._drawerToggleBtn = null;
    this._onSessionSwitch = options.onSessionSwitch || null;
    this._toastFn = options.toast || null;
  }

  /* ── IndexedDB 初始化 ───────────────────────────────────────────── */

  /**
   * 打开数据库，创建 sessions store（keyPath='id'）
   */
  _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * 初始化，打开数据库
   */
  async init() {
    try {
      this.db = await this._openDB();
      console.log('✅ HistoryManager 已初始化');
    } catch (err) {
      console.error('HistoryManager 初始化失败:', err);
    }
    return this;
  }

  /* ── 核心 CRUD ──────────────────────────────────────────────────── */

  /**
   * 创建新会话
   * @param {string} model - 使用的模型名
   * @returns {Promise<string>} 新会话 id
   */
  async createSession(model = '') {
    const session = {
      id: this._generateId(),
      title: '新会话',
      messages: [],
      timestamp: Date.now(),
      updatedAt: Date.now(),
      model,
      tokenStats: { promptTokens: 0, completionTokens: 0, iterations: 0 },
    };

    await this._put(session);
    this.currentSessionId = session.id;
    return session.id;
  }

  /**
   * 加载会话
   * @param {string} id - 会话 id
   * @returns {Promise<Object|null>}
   */
  async loadSession(id) {
    const session = await this._get(id);
    if (session) {
      this.currentSessionId = id;
    }
    return session;
  }

  /**
   * 更新会话数据
   * @param {string} id
   * @param {Object} data - 要合并的字段
   */
  async updateSession(id, data) {
    const session = await this._get(id);
    if (!session) {
      console.warn('HistoryManager: 会话不存在:', id);
      return null;
    }
    Object.assign(session, data);
    session.updatedAt = Date.now();
    await this._put(session);
    return session;
  }

  /**
   * 删除会话
   * @param {string} id
   */
  async deleteSession(id) {
    if (!id) return false;
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('数据库未初始化'));
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * 列出所有会话（按更新时间倒序）
   * @returns {Promise<Array>}
   */
  async listSessions() {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('数据库未初始化'));
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        const sessions = (req.result || []).sort((a, b) =>
          (b.updatedAt || b.timestamp || 0) - (a.updatedAt || a.timestamp || 0)
        );
        resolve(sessions);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /* ── 自动保存 ───────────────────────────────────────────────────── */

  /**
   * Agent 每次回复后调用，自动保存当前对话
   * @param {Array} messages - 消息数组
   * @param {string} model - 模型名
   * @param {Object} tokenStats - token 统计
   */
  async autoSave(messages, model = '', tokenStats = null) {
    if (!messages || messages.length === 0) return;

    // 确保有 currentSessionId
    if (!this.currentSessionId) {
      this.currentSessionId = await this.createSession(model);
    }

    // 标题 = 首条用户消息前 30 字
    const firstUserMsg = messages.find(m => m.role === 'user');
    const title = firstUserMsg
      ? firstUserMsg.content.substring(0, 30)
      : '新会话';

    await this.updateSession(this.currentSessionId, {
      title,
      messages: messages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        timestamp: m.timestamp || Date.now(),
      })),
      model,
      tokenStats: tokenStats || {},
    });
  }

  /* ── 导出 ───────────────────────────────────────────────────────── */

  /**
   * 导出会话为 JSON 并触发下载
   * @param {string} id - 会话 id
   */
  async exportSession(id) {
    const session = await this._get(id);
    if (!session) {
      this._toast('会话不存在', 'error');
      return;
    }

    const json = JSON.stringify(session, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-${session.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}-${id.substring(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── IndexedDB 底层 ────────────────────────────────────────────── */

  _put(session) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('数据库未初始化'));
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).put(session);
      req.onsuccess = () => resolve(session);
      req.onerror = () => reject(req.error);
    });
  }

  _get(id) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('数据库未初始化'));
      if (!id) return resolve(null);
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  _generateId() {
    return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  }

  /* ── UI: 历史抽屉 ──────────────────────────────────────────────── */

  /**
   * 构建 UI 组件并挂载到容器
   */
  buildUI() {
    // 抽屉根容器
    this._drawerEl = document.createElement('div');
    this._drawerEl.className = 'history-drawer';
    this._drawerEl.style.cssText = [
      'position:absolute',
      'top:0',
      'left:0',
      'right:0',
      'max-height:0',
      'overflow:hidden',
      'background:var(--bg-secondary,#1a1a2e)',
      'border-bottom:1px solid var(--border,#333)',
      'transition:max-height .3s ease',
      'z-index:500',
      'box-shadow:0 4px 12px rgba(0,0,0,.3)',
    ].join(';');

    // 抽屉头部
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--border,#333);';
    header.innerHTML = `
      <span style="flex:1;font-size:14px;font-weight:600;color:var(--text,#e0e0e0);">📋 历史会话</span>
    `;

    // 新建会话按钮
    const newBtn = document.createElement('button');
    newBtn.textContent = '＋ 新建';
    newBtn.style.cssText = [
      'background:var(--primary,#5865F2)',
      'color:#fff',
      'border:none',
      'border-radius:6px',
      'padding:4px 12px',
      'font-size:12px',
      'cursor:pointer',
    ].join(';');
    newBtn.addEventListener('click', async () => {
      const id = await this.createSession();
      this._toast('新会话已创建', 'success');
      if (this._onSessionSwitch) this._onSessionSwitch(await this.loadSession(id));
      this._refreshList();
    });
    header.appendChild(newBtn);

    // 关闭按钮
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:transparent;border:none;color:var(--text-secondary,#888);font-size:18px;cursor:pointer;';
    closeBtn.addEventListener('click', () => this.toggleDrawer(false));
    header.appendChild(closeBtn);

    // 会话列表容器
    this._listEl = document.createElement('div');
    this._listEl.className = 'history-list';
    this._listEl.style.cssText = 'max-height:280px;overflow-y:auto;-webkit-overflow-scrolling:touch;';

    this._drawerEl.appendChild(header);
    this._drawerEl.appendChild(this._listEl);

    // 触发按钮（放在 chat 区域顶部）
    this._drawerToggleBtn = document.createElement('button');
    this._drawerToggleBtn.className = 'history-toggle';
    this._drawerToggleBtn.innerHTML = '📋 <span style="font-size:11px;">历史会话</span> ▼';
    this._drawerToggleBtn.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:4px',
      'width:100%',
      'background:var(--bg-tertiary,#16162a)',
      'border:none',
      'border-bottom:1px solid var(--border,#333)',
      'color:var(--text-secondary,#aaa)',
      'padding:6px 16px',
      'font-size:13px',
      'cursor:pointer',
      'text-align:center',
      'justify-content:center',
    ].join(';');
    this._drawerToggleBtn.addEventListener('click', () => this.toggleDrawer());

    // 插入到 chat view
    const chatView = document.getElementById('view-chat');
    if (chatView) {
      chatView.insertBefore(this._drawerToggleBtn, chatView.firstChild);
      chatView.insertBefore(this._drawerEl, this._drawerToggleBtn.nextSibling);
    }

    this._refreshList();
  }

  /**
   * 打开/关闭抽屉
   * @param {boolean} [force] - 强制打开或关闭
   */
  toggleDrawer(force) {
    if (!this._drawerEl) return;
    const open = force !== undefined ? force : this._drawerEl.style.maxHeight === '0px';
    this._drawerEl.style.maxHeight = open ? '350px' : '0px';
    if (open) this._refreshList();
    if (this._drawerToggleBtn) {
      this._drawerToggleBtn.innerHTML = open
        ? '📋 <span style="font-size:11px;">历史会话</span> ▲'
        : '📋 <span style="font-size:11px;">历史会话</span> ▼';
    }
  }

  /**
   * 刷新会话列表 UI
   */
  async _refreshList() {
    if (!this._listEl) return;

    const sessions = await this.listSessions();
    this._listEl.innerHTML = '';

    if (sessions.length === 0) {
      this._listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary,#666);font-size:13px;">暂无历史会话</div>';
      return;
    }

    for (const session of sessions) {
      const item = document.createElement('div');
      const isActive = session.id === this.currentSessionId;
      item.className = 'history-item';
      item.style.cssText = [
        'display:flex',
        'align-items:center',
        'gap:8px',
        'padding:10px 16px',
        'border-bottom:1px solid rgba(255,255,255,.05)',
        'cursor:pointer',
        isActive ? 'background:rgba(88,101,242,.15)' : '',
      ].join(';');

      // 消息摘要
      const msgCount = (session.messages || []).length;
      const timeStr = this._formatTime(session.updatedAt || session.timestamp);

      item.innerHTML = `
        <span style="font-size:16px;">💬</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;color:var(--text,#e0e0e0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:${isActive ? '600' : '400'};">${this._escapeHtml(session.title || '未命名')}</div>
          <div style="font-size:11px;color:var(--text-secondary,#777);margin-top:2px;">${msgCount} 条消息 · ${timeStr}</div>
        </div>
      `;

      // 操作按钮容器
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:4px;flex-shrink:0;';

      // 导出按钮
      const exportBtn = document.createElement('button');
      exportBtn.textContent = '📥';
      exportBtn.title = '导出';
      exportBtn.style.cssText = this._miniBtnStyle();
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.exportSession(session.id);
      });
      actions.appendChild(exportBtn);

      // 删除按钮
      const delBtn = document.createElement('button');
      delBtn.textContent = '🗑';
      delBtn.title = '删除';
      delBtn.style.cssText = this._miniBtnStyle();
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('确定删除此会话？')) return;
        await this.deleteSession(session.id);
        if (session.id === this.currentSessionId) {
          this.currentSessionId = null;
        }
        this._refreshList();
        this._toast('会话已删除', 'info');
      });
      actions.appendChild(delBtn);

      item.appendChild(actions);

      // 点击切换会话
      item.addEventListener('click', async () => {
        const loaded = await this.loadSession(session.id);
        this.toggleDrawer(false);
        if (this._onSessionSwitch) {
          this._onSessionSwitch(loaded);
        }
        this._refreshList();
      });

      this._listEl.appendChild(item);
    }
  }

  /* ── 工具方法 ───────────────────────────────────────────────────── */

  _formatTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const min = 60 * 1000;
    const hour = 60 * min;
    const day = 24 * hour;
    if (diff < min) return '刚刚';
    if (diff < hour) return Math.floor(diff / min) + ' 分钟前';
    if (diff < day) return Math.floor(diff / hour) + ' 小时前';
    if (diff < 7 * day) return Math.floor(diff / day) + ' 天前';
    return new Date(ts).toLocaleDateString('zh-CN');
  }

  _miniBtnStyle() {
    return [
      'background:transparent',
      'border:none',
      'font-size:16px',
      'padding:2px 4px',
      'cursor:pointer',
      'opacity:.6',
    ].join(';');
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  _toast(msg, type) {
    if (this._toastFn) {
      this._toastFn(msg, type);
    } else {
      console.log(`[${type}] ${msg}`);
    }
  }

  /**
   * 清理过期/空会话（可选，用于维护）
   * @param {number} maxAge - 最大年龄（毫秒），默认 30 天
   */
  async cleanup(maxAge = 30 * 24 * 60 * 60 * 1000) {
    const sessions = await this.listSessions();
    const now = Date.now();
    let cleaned = 0;
    for (const s of sessions) {
      const age = now - (s.updatedAt || s.timestamp || 0);
      if (age > maxAge && (!s.messages || s.messages.length === 0)) {
        await this.deleteSession(s.id);
        cleaned++;
      }
    }
    if (cleaned > 0) console.log(`HistoryManager: 清理了 ${cleaned} 个空会话`);
    return cleaned;
  }
}

export default HistoryManager;
