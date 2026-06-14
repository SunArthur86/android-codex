/**
 * SnippetsManager — 代码片段管理器
 * ====================================================
 * 保存常用代码片段到 IndexedDB，支持搜索、语言过滤、
 * 点击插入到 VFS 文件或复制到剪贴板。
 *
 * 架构设计：
 *   - 使用独立的 IndexedDB 数据库 `codex-snippets`，store 名 `snippets`
 *   - 与 FileManager (`codex-mobile-fs`) 兼容：insert() 通过 FileManager 写入 VFS
 *   - 内置 12 个常用工具函数片段，首次初始化自动种入
 *
 * 数据结构：
 *   { id: string, title: string, language: string, code: string, tags: string[], createdAt: number }
 *
 * 用法：
 *   import SnippetsManager from './ui/snippets.js';
 *   const sm = new SnippetsManager({ fileManager: fm, container: document.body });
 *   await sm.init();
 *   sm.open();           // 打开片段面板
 *   sm.insert('/src/utils.js', snippetId);  // 将片段写入文件
 *   sm.copy(snippetId);  // 复制到剪贴板
 */

/* ── 常量 ──────────────────────────────────────────────────────────── */

const SNIPPETS_DB_NAME = 'codex-snippets';
const SNIPPETS_DB_VERSION = 1;
const SNIPPETS_STORE = 'snippets';

/* ── 内置代码片段 ──────────────────────────────────────────────────── */

const BUILTIN_SNIPPETS = [
  {
    id: 'builtin-debounce',
    title: 'debounce — 防抖函数',
    language: 'javascript',
    tags: ['performance', 'event', 'utility'],
    code: [
      '/**',
      ' * 防抖：在停止触发 delay 毫秒后才执行',
      ' * @param {Function} fn  目标函数',
      ' * @param {number} delay 延迟毫秒',
      ' * @returns {Function} 防抖后的函数',
      ' */',
      'function debounce(fn, delay = 300) {',
      '  let timer = null;',
      '  return function (...args) {',
      '    clearTimeout(timer);',
      '    timer = setTimeout(() => fn.apply(this, args), delay);',
      '  };',
      '}',
    ].join('\n'),
  },
  {
    id: 'builtin-throttle',
    title: 'throttle — 节流函数',
    language: 'javascript',
    tags: ['performance', 'event', 'utility'],
    code: [
      '/**',
      ' * 节流：在 interval 毫秒内最多执行一次',
      ' * @param {Function} fn      目标函数',
      ' * @param {number} interval  间隔毫秒',
      ' * @returns {Function} 节流后的函数',
      ' */',
      'function throttle(fn, interval = 200) {',
      '  let lastTime = 0;',
      '  return function (...args) {',
      '    const now = Date.now();',
      '    if (now - lastTime >= interval) {',
      '      lastTime = now;',
      '      fn.apply(this, args);',
      '    }',
      '  };',
      '}',
    ].join('\n'),
  },
  {
    id: 'builtin-deepclone',
    title: 'deepClone — 深拷贝',
    language: 'javascript',
    tags: ['object', 'utility', 'clone'],
    code: [
      '/**',
      ' * 深拷贝：递归克隆对象，支持数组、日期、正则',
      ' * @param {*} obj 要克隆的值',
      ' * @returns {*} 深拷贝结果',
      ' */',
      'function deepClone(obj, seen = new WeakMap()) {',
      '  if (obj === null || typeof obj !== "object") return obj;',
      '  if (seen.has(obj)) return seen.get(obj); // 处理循环引用',
      '  if (obj instanceof Date) return new Date(obj.getTime());',
      '  if (obj instanceof RegExp) return new RegExp(obj.source, obj.flags);',
      '  const clone = Array.isArray(obj) ? [] : {};',
      '  seen.set(obj, clone);',
      '  for (const key of Object.keys(obj)) {',
      '    clone[key] = deepClone(obj[key], seen);',
      '  }',
      '  return clone;',
      '}',
    ].join('\n'),
  },
  {
    id: 'builtin-quicksort',
    title: 'quickSort — 快速排序',
    language: 'javascript',
    tags: ['algorithm', 'sort', 'array'],
    code: [
      '/**',
      ' * 快速排序（原地分区版本）',
      ' * @param {number[]} arr 待排序数组',
      ' * @returns {number[]} 排序后数组',
      ' */',
      'function quickSort(arr, lo = 0, hi = arr.length - 1) {',
      '  if (lo >= hi) return arr;',
      '  const pivot = arr[lo + ((hi - lo) >> 1)];',
      '  let i = lo, j = hi;',
      '  while (i <= j) {',
      '    while (arr[i] < pivot) i++;',
      '    while (arr[j] > pivot) j--;',
      '    if (i <= j) {',
      '      [arr[i], arr[j]] = [arr[j], arr[i]];',
      '      i++; j--;',
      '    }',
      '  }',
      '  quickSort(arr, lo, j);',
      '  quickSort(arr, i, hi);',
      '  return arr;',
      '}',
    ].join('\n'),
  },
  {
    id: 'builtin-fetchretry',
    title: 'fetchRetry — 带重试的 fetch',
    language: 'javascript',
    tags: ['network', 'fetch', 'async'],
    code: [
      '/**',
      ' * 带自动重试的 fetch',
      ' * @param {string} url      请求地址',
      ' * @param {object} options  fetch 选项',
      ' * @param {number} retries  最大重试次数',
      ' * @returns {Promise<Response>} fetch 响应',
      ' */',
      'async function fetchRetry(url, options = {}, retries = 3) {',
      '  for (let attempt = 0; attempt <= retries; attempt++) {',
      '    try {',
      '      const res = await fetch(url, options);',
      '      if (!res.ok) throw new Error(`HTTP ${res.status}`);',
      '      return res;',
      '    } catch (err) {',
      '      if (attempt === retries) throw err;',
      '      // 指数退避：1s → 2s → 4s ...',
      '      await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));',
      '    }',
      '  }',
      '}',
    ].join('\n'),
  },
  {
    id: 'builtin-formatdate',
    title: 'formatDate — 日期格式化',
    language: 'javascript',
    tags: ['date', 'format', 'utility'],
    code: [
      '/**',
      ' * 日期格式化（类似 PHP date() 风格）',
      ' * @param {Date|string|number} date  日期',
      ' * @param {string} fmt              格式串，如 "YYYY-MM-DD HH:mm:ss"',
      ' * @returns {string} 格式化后的日期字符串',
      ' */',
      'function formatDate(date, fmt = "YYYY-MM-DD HH:mm:ss") {',
      '  const d = new Date(date);',
      '  const pad = n => String(n).padStart(2, "0");',
      '  const map = {',
      '    YYYY: d.getFullYear(),',
      '    MM: pad(d.getMonth() + 1),',
      '    DD: pad(d.getDate()),',
      '    HH: pad(d.getHours()),',
      '    mm: pad(d.getMinutes()),',
      '    ss: pad(d.getSeconds()),',
      '  };',
      '  return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, m => map[m]);',
      '}',
    ].join('\n'),
  },
  {
    id: 'builtin-arraychunk',
    title: 'arrayChunk — 数组分块',
    language: 'javascript',
    tags: ['array', 'utility'],
    code: [
      '/**',
      ' * 将数组分割为固定大小的子数组',
      ' * @param {Array} arr  源数组',
      ' * @param {number} size 每块大小',
      ' * @returns {Array[]} 分块后的二维数组',
      ' */',
      'function arrayChunk(arr, size = 1) {',
      '  if (size < 1) throw new Error("size must be >= 1");',
      '  const chunks = [];',
      '  for (let i = 0; i < arr.length; i += size) {',
      '    chunks.push(arr.slice(i, i + size));',
      '  }',
      '  return chunks;',
      '}',
    ].join('\n'),
  },
  {
    id: 'builtin-pipe-compose',
    title: 'pipe / compose — 函数组合',
    language: 'javascript',
    tags: ['functional', 'utility'],
    code: [
      '/**',
      ' * pipe：从左到右依次执行（Unix 管道风格）',
      ' * compose：从右到左依次执行（数学组合风格）',
      ' * @param {...Function} fns 要组合的函数',
      ' * @returns {Function} 组合后的函数',
      ' */',
      'const pipe = (...fns) => x => fns.reduce((v, f) => f(v), x);',
      'const compose = (...fns) => x => fns.reduceRight((v, f) => f(v), x);',
      '',
      '// 示例：',
      '// const f = pipe(x => x + 1, x => x * 2, x => x - 3);',
      '// f(5); // → (5+1)*2-3 = 9',
    ].join('\n'),
  },
  {
    id: 'builtin-memoize',
    title: 'memoize — 记忆化函数',
    language: 'javascript',
    tags: ['performance', 'functional', 'cache'],
    code: [
      '/**',
      ' * 记忆化：缓存纯函数的返回值，避免重复计算',
      ' * @param {Function} fn 纯函数',
      ' * @returns {Function} 带缓存的函数',
      ' */',
      'function memoize(fn, keyFn = JSON.stringify) {',
      '  const cache = new Map();',
      '  return function (...args) {',
      '    const key = keyFn(args);',
      '    if (cache.has(key)) return cache.get(key);',
      '    const result = fn.apply(this, args);',
      '    cache.set(key, result);',
      '    return result;',
      '  };',
      '}',
    ].join('\n'),
  },
  {
    id: 'builtin-sleep',
    title: 'sleep — Promise 延时',
    language: 'javascript',
    tags: ['async', 'utility', 'promise'],
    code: [
      '/**',
      ' * Promise 版延时等待',
      ' * @param {number} ms 等待毫秒数',
      ' * @returns {Promise<void>}',
      ' */',
      'function sleep(ms) {',
      '  return new Promise(resolve => setTimeout(resolve, ms));',
      '}',
      '',
      '// 使用示例：',
      '// await sleep(500);',
      '// 或与 for 循环配合做轮询',
    ].join('\n'),
  },
  {
    id: 'builtin-unique',
    title: 'unique — 数组去重',
    language: 'javascript',
    tags: ['array', 'utility'],
    code: [
      '/**',
      ' * 数组去重（保持顺序，基于 Set）',
      ' * @param {Array} arr 源数组',
      ' * @returns {Array} 去重后的新数组',
      ' */',
      'function unique(arr) {',
      '  return [...new Set(arr)];',
      '}',
      '',
      '// 对象数组去重（按 key）',
      'function uniqueBy(arr, key) {',
      '  const seen = new Set();',
      '  return arr.filter(item => {',
      '    const val = typeof key === "function" ? key(item) : item[key];',
      '    if (seen.has(val)) return false;',
      '    seen.add(val);',
      '    return true;',
      '  });',
      '}',
    ].join('\n'),
  },
  {
    id: 'builtin-range',
    title: 'range — 生成整数序列',
    language: 'python',
    tags: ['utility', 'python', 'sequence'],
    code: [
      'def range_list(start, stop=None, step=1):',
      '    """生成整数序列（类似 Python 3 range 但返回 list）"""',
      '    if stop is None:',
      '        start, stop = 0, start',
      '    return list(range(start, stop, step))',
      '',
      '',
      '# 使用示例：',
      '# range_list(5)        → [0, 1, 2, 3, 4]',
      '# range_list(2, 10, 2) → [2, 4, 6, 8]',
    ].join('\n'),
  },
];

/* ── SnippetsManager 类 ────────────────────────────────────────────── */

class SnippetsManager {
  /**
   * @param {object} options
   * @param {object} options.fileManager  FileManager 实例（用于 insert 写入 VFS）
   * @param {HTMLElement|string} options.container  容器元素或 ID
   */
  constructor({ fileManager, container }) {
    this.fileManager = fileManager || null;

    // 解析容器
    this.containerEl = typeof container === 'string'
      ? document.getElementById(container)
      : container;
    if (!this.containerEl) {
      this.containerEl = document.body;
    }

    this.db = null;
    this.snippets = [];
    this._searchQuery = '';
    this._langFilter = 'all';
    this._visible = false;
  }

  /* ── IndexedDB ──────────────────────────────────────────────── */

  /** 打开数据库，创建 store */
  _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(SNIPPETS_DB_NAME, SNIPPETS_DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(SNIPPETS_STORE)) {
          const store = db.createObjectStore(SNIPPETS_STORE, { keyPath: 'id' });
          store.createIndex('language', 'language', { unique: false });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /** 执行 store 操作并返回 Promise */
  _tx(mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(SNIPPETS_STORE, mode);
      const store = tx.objectStore(SNIPPETS_STORE);
      const req = fn(store);
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  /* ── 初始化 ──────────────────────────────────────────────────── */

  /** 初始化：打开 DB，如果空则种入内置片段 */
  async init() {
    this.db = await this._openDB();

    const count = await this._tx('readonly', s => s.count());
    if (count === 0) {
      await this._seedBuiltins();
    }

    await this._loadAll();
    return this;
  }

  /** 种入内置片段 */
  async _seedBuiltins() {
    const now = Date.now();
    const records = BUILTIN_SNIPPETS.map((s, i) => ({
      ...s,
      createdAt: now - (BUILTIN_SNIPPETS.length - i) * 1000,
    }));

    await new Promise((resolve, reject) => {
      const tx = this.db.transaction(SNIPPETS_STORE, 'readwrite');
      const store = tx.objectStore(SNIPPETS_STORE);
      for (const rec of records) store.put(rec);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /** 从 DB 加载全部片段 */
  async _loadAll() {
    try {
      this.snippets = await this._tx('readonly', s => s.getAll());
      // 按创建时间降序
      this.snippets.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch (err) {
      console.error('SnippetsManager 加载失败:', err);
      this.snippets = [];
    }
    return this.snippets;
  }

  /* ── 增删改 ──────────────────────────────────────────────────── */

  /** 添加自定义片段 */
  async add(snippet) {
    if (!snippet.title || !snippet.code) {
      throw new Error('片段至少需要 title 和 code');
    }
    const record = {
      id: snippet.id || `snippet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: snippet.title,
      language: snippet.language || 'javascript',
      code: snippet.code,
      tags: Array.isArray(snippet.tags) ? snippet.tags : [],
      createdAt: Date.now(),
    };

    await this._tx('readwrite', s => s.put(record));
    this.snippets.unshift(record);
    if (this._visible) this._renderList();
    return record;
  }

  /** 删除片段 */
  async remove(id) {
    await this._tx('readwrite', s => s.delete(id));
    this.snippets = this.snippets.filter(s => s.id !== id);
    if (this._visible) this._renderList();
  }

  /** 按 ID 获取片段 */
  getById(id) {
    return this.snippets.find(s => s.id === id) || null;
  }

  /* ── 核心操作 ────────────────────────────────────────────────── */

  /**
   * 将片段内容写入 VFS 文件
   * @param {string} path  目标文件路径
   * @param {string} id    片段 ID
   */
  async insert(path, id) {
    const snippet = this.getById(id);
    if (!snippet) {
      console.error('SnippetsManager.insert: 片段不存在', id);
      return null;
    }

    if (!this.fileManager || typeof this.fileManager.writeFile !== 'function') {
      console.error('SnippetsManager.insert: FileManager 不可用');
      return null;
    }

    try {
      // 追加模式：如果文件已存在则追加，否则创建
      let existing = '';
      try {
        const file = await this.fileManager.readFile(path);
        if (file && file.content) existing = file.content;
      } catch (_) { /* 文件不存在，忽略 */ }

      const newContent = existing
        ? existing + '\n\n' + snippet.code
        : snippet.code;

      await this.fileManager.writeFile(path, newContent);
      console.log(`✅ 片段 "${snippet.title}" 已插入 ${path}`);
      return newContent;
    } catch (err) {
      console.error('SnippetsManager.insert 写入失败:', err);
      return null;
    }
  }

  /**
   * 复制片段到剪贴板
   * @param {string} id 片段 ID
   * @returns {Promise<boolean>} 是否成功
   */
  async copy(id) {
    const snippet = this.getById(id);
    if (!snippet) {
      console.error('SnippetsManager.copy: 片段不存在', id);
      return false;
    }

    try {
      // 优先使用 Clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(snippet.code);
        return true;
      }

      // 降级方案：使用 textarea + execCommand
      const textarea = document.createElement('textarea');
      textarea.value = snippet.code;
      textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch (err) {
      console.error('SnippetsManager.copy 复制失败:', err);
      return false;
    }
  }

  /* ── 过滤 ────────────────────────────────────────────────────── */

  /** 获取过滤后的片段列表 */
  _filtered() {
    let result = this.snippets;

    // 语言过滤
    if (this._langFilter !== 'all') {
      result = result.filter(s => s.language === this._langFilter);
    }

    // 关键词搜索（标题、标签、代码）
    const q = this._searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(s => {
        const inTitle = (s.title || '').toLowerCase().includes(q);
        const inCode = (s.code || '').toLowerCase().includes(q);
        const inTags = (s.tags || []).some(t => t.toLowerCase().includes(q));
        return inTitle || inCode || inTags;
      });
    }

    return result;
  }

  /** 获取所有语言种类（用于过滤器） */
  _getLanguages() {
    const set = new Set();
    for (const s of this.snippets) set.add(s.language);
    return ['all', ...[...set].sort()];
  }

  /* ── DOM 渲染 ────────────────────────────────────────────────── */

  /** 打开片段面板 */
  open() {
    this._visible = true;
    this._buildDOM();
    this._renderList();
    this.el.style.display = 'flex';
  }

  /** 关闭面板 */
  close() {
    this._visible = false;
    if (this.el) this.el.style.display = 'none';
  }

  /** 构建面板 DOM（只构建一次） */
  _buildDOM() {
    if (this.el) return;

    // ── 根容器 ──
    this.el = document.createElement('div');
    this.el.className = 'snippets-overlay';
    this.el.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2000',
      'display:flex',
      'flex-direction:column',
      'background:var(--bg-primary, #0d1117)',
    ].join(';');

    // ── 顶部工具栏 ──
    const toolbar = document.createElement('div');
    toolbar.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:8px',
      'padding:10px 12px',
      'background:var(--bg-secondary, #161b22)',
      'border-bottom:1px solid var(--border, #30363d)',
      'flex-shrink:0',
    ].join(';');

    const title = document.createElement('span');
    title.textContent = '📋 代码片段';
    title.style.cssText = 'flex:1;font-size:16px;font-weight:600;color:var(--text-primary, #e6edf3);';
    toolbar.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = this._btnStyle('#f85149');
    closeBtn.addEventListener('click', () => this.close());
    toolbar.appendChild(closeBtn);

    this.el.appendChild(toolbar);

    // ── 搜索栏 + 语言过滤 ──
    const filterBar = document.createElement('div');
    filterBar.style.cssText = [
      'display:flex',
      'gap:8px',
      'padding:8px 12px',
      'background:var(--bg-secondary, #161b22)',
      'border-bottom:1px solid var(--border, #30363d)',
      'flex-shrink:0',
    ].join(';');

    // 搜索输入框
    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.placeholder = '🔍 搜索片段...';
    this.searchInput.style.cssText = [
      'flex:1',
      'padding:8px 12px',
      'border:1px solid var(--border, #30363d)',
      'border-radius:8px',
      'background:var(--bg-primary, #0d1117)',
      'color:var(--text-primary, #e6edf3)',
      'font-size:14px',
      'outline:none',
    ].join(';');
    this.searchInput.addEventListener('input', () => {
      this._searchQuery = this.searchInput.value;
      this._renderList();
    });
    filterBar.appendChild(this.searchInput);

    // 语言下拉过滤器
    this.langSelect = document.createElement('select');
    this.langSelect.style.cssText = [
      'padding:8px 10px',
      'border:1px solid var(--border, #30363d)',
      'border-radius:8px',
      'background:var(--bg-primary, #0d1117)',
      'color:var(--text-primary, #e6edf3)',
      'font-size:13px',
      'flex-shrink:0',
    ].join(';');
    this.langSelect.addEventListener('change', () => {
      this._langFilter = this.langSelect.value;
      this._renderList();
    });
    filterBar.appendChild(this.langSelect);

    this.el.appendChild(filterBar);

    // ── 片段列表区域 ──
    this.listEl = document.createElement('div');
    this.listEl.style.cssText = [
      'flex:1',
      'overflow-y:auto',
      '-webkit-overflow-scrolling:touch',
      'padding:12px',
    ].join(';');

    this.el.appendChild(this.listEl);
    this.containerEl.appendChild(this.el);

    // 注入样式
    SnippetsManager._injectStyles();
  }

  /** 更新语言下拉选项 */
  _updateLangOptions() {
    if (!this.langSelect) return;
    const langs = this._getLanguages();
    const labels = { all: '全部语言' };
    this.langSelect.innerHTML = langs.map(l =>
      `<option value="${l}"${l === this._langFilter ? ' selected' : ''}>${labels[l] || l}</option>`
    ).join('');
  }

  /** 渲染片段卡片列表 */
  _renderList() {
    if (!this.listEl) return;

    // 更新语言过滤器
    this._updateLangOptions();

    const snippets = this._filtered();

    if (snippets.length === 0) {
      this.listEl.innerHTML = `
        <div style="text-align:center;padding:40px 20px;color:var(--text-secondary, #7d8590);font-size:14px;">
          ${this.snippets.length === 0 ? '📭 暂无代码片段' : '🔍 未找到匹配的片段'}
        </div>
      `;
      return;
    }

    // 构建 DOM 片段（安全：textContent 防注入）
    const frag = document.createDocumentFragment();

    for (const snippet of snippets) {
      const card = this._createCard(snippet);
      frag.appendChild(card);
    }

    this.listEl.innerHTML = '';
    this.listEl.appendChild(frag);
  }

  /** 创建单个片段卡片 */
  _createCard(snippet) {
    const card = document.createElement('div');
    card.className = 'snippet-card';
    card.style.cssText = [
      'background:var(--bg-secondary, #161b22)',
      'border:1px solid var(--border, #30363d)',
      'border-radius:12px',
      'padding:12px 14px',
      'margin-bottom:10px',
      'transition:border-color 0.2s',
    ].join(';');

    // 标题行
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';

    const langIcon = SnippetsManager._langIcon(snippet.language);
    const titleEl = document.createElement('span');
    titleEl.style.cssText = 'flex:1;font-size:14px;font-weight:600;color:var(--text-primary, #e6edf3);';
    titleEl.textContent = `${langIcon} ${snippet.title}`;

    header.appendChild(titleEl);

    // 标签
    if (snippet.tags && snippet.tags.length) {
      const tagsWrap = document.createElement('div');
      tagsWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;';
      for (const tag of snippet.tags) {
        const tagEl = document.createElement('span');
        tagEl.className = 'snippet-tag';
        tagEl.textContent = '#' + tag;
        tagsWrap.appendChild(tagEl);
      }
      card.appendChild(header);
      card.appendChild(tagsWrap);
    } else {
      card.appendChild(header);
    }

    // 代码预览
    const preview = document.createElement('pre');
    preview.style.cssText = [
      'background:var(--bg-primary, #0d1117)',
      'border-radius:8px',
      'padding:8px 10px',
      'font-family:JetBrains Mono, monospace',
      'font-size:11px',
      'line-height:1.5',
      'color:var(--text-secondary, #7d8590)',
      'overflow-x:auto',
      'white-space:pre',
      'max-height:100px',
      'margin-bottom:8px',
    ].join(';');
    // 截取前 5 行预览
    const lines = snippet.code.split('\n');
    preview.textContent = lines.slice(0, 5).join('\n') + (lines.length > 5 ? '\n...' : '');
    card.appendChild(preview);

    // 操作按钮组
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:6px;';

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 复制';
    copyBtn.style.cssText = this._btnStyle('var(--accent, #2f81f7)');
    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await this.copy(snippet.id);
      copyBtn.textContent = ok ? '✅ 已复制' : '❌ 失败';
      setTimeout(() => { copyBtn.textContent = '📋 复制'; }, 1500);
    });
    actions.appendChild(copyBtn);

    // 插入按钮（仅当 FileManager 可用时显示）
    if (this.fileManager) {
      const insertBtn = document.createElement('button');
      insertBtn.textContent = '📝 插入';
      insertBtn.style.cssText = this._btnStyle('var(--success, #3fb950)');
      insertBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const path = prompt('输入目标文件路径：', '/src/snippet-' + snippet.id + '.js');
        if (!path) return;
        const result = await this.insert(path, snippet.id);
        insertBtn.textContent = result ? '✅ 已插入' : '❌ 失败';
        setTimeout(() => { insertBtn.textContent = '📝 插入'; }, 1500);
      });
      actions.appendChild(insertBtn);
    }

    // 删除按钮（自定义片段才显示）
    if (!snippet.id.startsWith('builtin-')) {
      const delBtn = document.createElement('button');
      delBtn.textContent = '🗑️';
      delBtn.style.cssText = this._btnStyle('var(--error, #f85149)');
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('确认删除此片段？')) {
          await this.remove(snippet.id);
        }
      });
      actions.appendChild(delBtn);
    }

    card.appendChild(actions);

    // 卡片点击 → 复制
    card.addEventListener('click', () => {
      this.copy(snippet.id);
      card.style.borderColor = 'var(--accent, #2f81f7)';
      setTimeout(() => { card.style.borderColor = 'var(--border, #30363d)'; }, 300);
    });

    return card;
  }

  /* ── 工具方法 ────────────────────────────────────────────────── */

  _btnStyle(bgColor) {
    return [
      `background:${bgColor}`,
      'color:#fff',
      'border:none',
      'border-radius:6px',
      'padding:6px 12px',
      'font-size:12px',
      'cursor:pointer',
      'font-weight:500',
      'white-space:nowrap',
    ].join(';');
  }

  static _langIcon(lang) {
    const icons = {
      javascript: '📜', typescript: '📘', python: '🐍',
      swift: '🦅', json: '⚙️', css: '🎨', html: '🌐',
      java: '☕', go: '🐹', rust: '🦀', shell: '🖥️',
    };
    return icons[lang] || '📄';
  }

  /** 注入标签样式（一次性） */
  static _injectStyles() {
    if (document.getElementById('snippets-styles')) return;
    const style = document.createElement('style');
    style.id = 'snippets-styles';
    style.textContent = `
      .snippet-tag {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--accent-bg, rgba(47,129,247,.12));
        color: var(--accent, #2f81f7);
        font-family: monospace;
      }
      .snippet-card:active {
        transform: scale(0.98);
      }
    `;
    document.head.appendChild(style);
  }
}

export default SnippetsManager;
