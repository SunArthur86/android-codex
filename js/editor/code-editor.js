/**
 * 代码编辑器 — 真正可编辑的、带语法高亮的代码编辑器
 * Code Editor — Editable code editor with syntax highlighting
 *
 * 实现：
 *   - 透明 <textarea> 叠加在 <pre><code> 之上，输入时实时高亮
 *   - 复用 CodeViewer 的高亮规则集（独立实现，不依赖 CodeViewer 实例）
 *   - 行号 gutter、Tab 缩进（2空格）、自动括号匹配
 *   - Ctrl+S 保存、底部状态栏（文件名 / 修改状态 / 行列）
 *   - open(path) 加载文件 → save() 写回 IndexedDB（通过 FileManager）
 *   - 关闭时如有未保存修改，弹出确认对话框
 *
 * 用法：
 *   import CodeEditor from './editor/code-editor.js';
 *   const editor = new CodeEditor({ fileManager: fm });
 *   editor.open('/src/main.js');
 */

/* ── 语言关键词集 ─────────────────────────────────────────────────── */

const JS_KEYWORDS = [
  'class', 'const', 'let', 'var', 'function', 'return', 'if', 'else',
  'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new',
  'delete', 'typeof', 'instanceof', 'in', 'of', 'void', 'this', 'super',
  'extends', 'import', 'export', 'from', 'default', 'async', 'await',
  'yield', 'try', 'catch', 'finally', 'throw', 'static', 'get', 'set',
  'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
  'type', 'interface', 'enum', 'namespace', 'declare', 'readonly',
  'public', 'private', 'protected', 'abstract', 'implements', 'as', 'is',
  'keyof', 'infer', 'never', 'unknown', 'any', 'string', 'number',
  'boolean', 'symbol', 'bigint', 'object',
];

const PY_KEYWORDS = [
  'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while',
  'break', 'continue', 'pass', 'import', 'from', 'as', 'with',
  'try', 'except', 'finally', 'raise', 'yield', 'lambda', 'global',
  'nonlocal', 'assert', 'del', 'in', 'is', 'not', 'and', 'or',
  'None', 'True', 'False', 'async', 'await', 'self',
];

const SWIFT_KEYWORDS = [
  'class', 'struct', 'enum', 'protocol', 'extension', 'func', 'var', 'let',
  'static', 'if', 'guard', 'else', 'for', 'while', 'switch',
  'case', 'default', 'break', 'continue', 'return', 'throw', 'throws',
  'try', 'catch', 'do', 'defer', 'init', 'self', 'super', 'nil',
  'true', 'false', 'import', 'public', 'private', 'internal', 'final',
  'override', 'async', 'await', 'actor',
];

/* ── CodeEditor ──────────────────────────────────────────────────── */

export class CodeEditor {
  constructor(options = {}) {
    this.fileManager = options.fileManager || null;
    this.fontSize = 13;
    this.tabSize = 2;

    // 编辑状态
    this.currentPath = null;
    this.originalContent = '';
    this.isDirty = false;
    this._isVisible = false;

    // 构建 DOM
    this._buildDOM();
    this._attachListeners();
    this.el.style.display = 'none';
  }

  /* ── DOM 构建 ───────────────────────────────────────────────────── */

  _buildDOM() {
    // 根覆盖层
    this.el = document.createElement('div');
    this.el.className = 'ce-root';
    this.el.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:flex',
      'flex-direction:column',
      'background:#1e1e1e',
      'z-index:1100',
    ].join(';');

    // ── 工具栏 ──
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'ce-toolbar';
    this.toolbar.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:8px',
      'padding:6px 12px',
      'background:#2d2d2d',
      'border-bottom:1px solid #404040',
      'flex-shrink:0',
    ].join(';');

    this.titleEl = document.createElement('span');
    this.titleEl.className = 'ce-title';
    this.titleEl.style.cssText = 'flex:1;color:#e0e0e0;font-size:13px;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    this.titleEl.textContent = '(未打开文件)';

    // 保存按钮
    this.saveBtn = this._makeBtn('💾 保存', () => this.save(), '#4CAF50');
    this.saveBtn.style.display = 'none';

    // 关闭按钮
    this.closeBtn = this._makeBtn('✕', () => this.close(), '#ff5555');

    this.toolbar.appendChild(this.titleEl);
    this.toolbar.appendChild(this.saveBtn);
    this.toolbar.appendChild(this.closeBtn);

    // ── 编辑区 ──
    this.editorWrapper = document.createElement('div');
    this.editorWrapper.style.cssText = 'flex:1;position:relative;overflow:hidden;display:flex;';

    // 行号 gutter
    this.gutterEl = document.createElement('div');
    this.gutterEl.className = 'ce-gutter';
    this.gutterEl.style.cssText = [
      'flex-shrink:0',
      'padding:8px 6px 8px 12px',
      'text-align:right',
      'color:#6a6a6a',
      'background:#1a1a1a',
      'user-select:none',
      '-webkit-user-select:none',
      'border-right:1px solid #333',
      'line-height:1.6',
      'font-family:monospace',
      'overflow:hidden',
    ].join(';');

    // 代码容器（pre + textarea 叠加）
    this.codeContainer = document.createElement('div');
    this.codeContainer.style.cssText = 'flex:1;position:relative;overflow:auto;-webkit-overflow-scrolling:touch;';

    // 高亮显示层 <pre><code>
    this.highlightEl = document.createElement('pre');
    this.highlightEl.style.cssText = [
      'position:absolute',
      'top:0',
      'left:0',
      'right:0',
      'bottom:0',
      'margin:0',
      'padding:8px 12px',
      'white-space:pre-wrap',
      'word-break:break-word',
      'font-family:monospace',
      'line-height:1.6',
      'tab-size:2',
      'pointer-events:none',
      'color:#d4d4d4',
      'overflow:hidden',
    ].join(';');

    this.codeInner = document.createElement('code');
    this.codeInner.style.cssText = 'font-family:inherit;font-size:inherit;';
    this.highlightEl.appendChild(this.codeInner);

    // 透明 <textarea>
    this.textareaEl = document.createElement('textarea');
    this.textareaEl.className = 'ce-textarea';
    this.textareaEl.setAttribute('spellcheck', 'false');
    this.textareaEl.setAttribute('autocapitalize', 'off');
    this.textareaEl.setAttribute('autocomplete', 'off');
    this.textareaEl.style.cssText = [
      'position:absolute',
      'top:0',
      'left:0',
      'right:0',
      'bottom:0',
      'width:100%',
      'height:100%',
      'margin:0',
      'padding:8px 12px',
      'border:none',
      'background:transparent',
      'color:transparent',
      'caret-color:#fff',
      'font-family:monospace',
      'font-size:13px',
      'line-height:1.6',
      'tab-size:2',
      'white-space:pre-wrap',
      'word-break:break-word',
      'resize:none',
      'outline:none',
      '-webkit-appearance:none',
      'z-index:2',
    ].join(';');

    this.codeContainer.appendChild(this.highlightEl);
    this.codeContainer.appendChild(this.textareaEl);

    this.editorWrapper.appendChild(this.gutterEl);
    this.editorWrapper.appendChild(this.codeContainer);

    // ── 状态栏 ──
    this.statusBar = document.createElement('div');
    this.statusBar.className = 'ce-statusbar';
    this.statusBar.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:8px',
      'padding:4px 12px',
      'background:#2d2d2d',
      'border-top:1px solid #404040',
      'font-size:11px',
      'color:#888',
      'font-family:monospace',
      'flex-shrink:0',
    ].join(';');

    this.statusFile = document.createElement('span');
    this.statusFile.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    this.statusFile.textContent = '—';

    this.statusModified = document.createElement('span');
    this.statusModified.style.cssText = 'color:#ff5555;font-weight:bold;display:none;';
    this.statusModified.textContent = '● 已修改';

    this.statusCursor = document.createElement('span');
    this.statusCursor.textContent = '行 1, 列 1';

    this.statusBar.appendChild(this.statusFile);
    this.statusBar.appendChild(this.statusModified);
    this.statusBar.appendChild(this.statusCursor);

    // 组装
    this.el.appendChild(this.toolbar);
    this.el.appendChild(this.editorWrapper);
    this.el.appendChild(this.statusBar);

    document.body.appendChild(this.el);

    // 注入高亮样式（如果 CodeViewer 尚未注入）
    this._injectStyles();

    this._applyFontSize();
  }

  _makeBtn(label, onClick, color) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = [
      `background:#3a3a3a`,
      `color:${color || '#ccc'}`,
      'border:1px solid #555',
      'border-radius:4px',
      'padding:2px 10px',
      'font-size:13px',
      'cursor:pointer',
      'white-space:nowrap',
    ].join(';');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  /* ── 事件绑定 ───────────────────────────────────────────────────── */

  _attachListeners() {
    // 输入 → 实时高亮
    this.textareaEl.addEventListener('input', () => {
      this._updateHighlight();
      this._updateModifiedState();
    });

    // 光标移动 → 更新行列
    this.textareaEl.addEventListener('keyup', () => this._updateCursor());
    this.textareaEl.addEventListener('click', () => this._updateCursor());

    // 滚动同步
    this.textareaEl.addEventListener('scroll', () => {
      this.highlightEl.scrollTop = this.textareaEl.scrollTop;
      this.highlightEl.scrollLeft = this.textareaEl.scrollLeft;
    });

    // Tab 缩进
    this.textareaEl.addEventListener('keydown', (e) => this._handleKeyDown(e));

    // Ctrl+S 保存
    this.el.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.save();
      }
    });
  }

  /**
   * 处理键盘事件：Tab 缩进、自动括号匹配
   */
  _handleKeyDown(e) {
    // Tab → 插入空格
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = this.textareaEl.selectionStart;
      const end = this.textareaEl.selectionEnd;
      const spaces = ' '.repeat(this.tabSize);

      if (start === end) {
        // 无选区：插入缩进
        const value = this.textareaEl.value;
        this.textareaEl.value = value.substring(0, start) + spaces + value.substring(end);
        this.textareaEl.selectionStart = this.textareaEl.selectionEnd = start + this.tabSize;
      } else {
        // 有选区：每行缩进
        const value = this.textareaEl.value;
        const before = value.substring(0, start);
        const selection = value.substring(start, end);
        const after = value.substring(end);

        const lineStart = before.lastIndexOf('\n') + 1;
        const fullSelection = value.substring(lineStart, end);
        const indented = fullSelection.split('\n').map(line => spaces + line).join('\n');
        this.textareaEl.value = value.substring(0, lineStart) + indented + after;
        this.textareaEl.selectionStart = lineStart;
        this.textareaEl.selectionEnd = lineStart + indented.length;
      }
      this._updateHighlight();
      this._updateModifiedState();
      return;
    }

    // 自动括号匹配
    const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
    if (pairs[e.key] && this.textareaEl.selectionStart === this.textareaEl.selectionEnd) {
      e.preventDefault();
      const pos = this.textareaEl.selectionStart;
      const value = this.textareaEl.value;
      const closing = pairs[e.key];
      this.textareaEl.value = value.substring(0, pos) + e.key + closing + value.substring(pos);
      this.textareaEl.selectionStart = this.textareaEl.selectionEnd = pos + 1;
      this._updateHighlight();
      this._updateModifiedState();
      return;
    }

    // 跳过配对的右括号
    const closingChars = { ')': '(', ']': '[', '}': '{' };
    if (closingChars[e.key]) {
      const pos = this.textareaEl.selectionStart;
      const value = this.textareaEl.value;
      if (value[pos] === e.key) {
        e.preventDefault();
        this.textareaEl.selectionStart = this.textareaEl.selectionEnd = pos + 1;
        return;
      }
    }
  }

  /* ── 公共 API ──────────────────────────────────────────────────── */

  /**
   * 打开文件到编辑器
   * @param {string} path - 文件路径
   */
  async open(path) {
    if (!path || !this.fileManager) {
      console.error('CodeEditor.open: 缺少路径或 FileManager');
      return;
    }

    let fileData = null;
    try {
      fileData = await this.fileManager.readFile(path);
    } catch (err) {
      console.error('CodeEditor 读取文件失败:', err);
    }

    if (!fileData || fileData.content === undefined) {
      this._toast('无法加载文件: ' + path, 'error');
      return;
    }

    this.currentPath = path;
    this.originalContent = fileData.content;
    this.textareaEl.value = fileData.content;
    this.isDirty = false;

    const lang = fileData.language || this._detectLanguage(path);
    this.currentLang = lang;

    this.titleEl.textContent = `${path}`;
    this.statusFile.textContent = path;

    this._updateHighlight(lang);
    this._renderLineNumbers(fileData.content);
    this._updateModifiedState();
    this._updateCursor();

    this._show();
    // 聚焦编辑器
    setTimeout(() => this.textareaEl.focus(), 100);
  }

  /**
   * 保存文件到 IndexedDB
   */
  async save() {
    if (!this.currentPath || !this.fileManager) return;

    try {
      await this.fileManager.writeFile(this.currentPath, this.textareaEl.value);
      this.originalContent = this.textareaEl.value;
      this.isDirty = false;
      this._updateModifiedState();
      this._toast('✅ 已保存', 'success');
    } catch (err) {
      console.error('CodeEditor 保存失败:', err);
      this._toast('保存失败: ' + err.message, 'error');
    }
  }

  /**
   * 关闭编辑器（有未保存修改时弹出确认）
   */
  close(force) {
    if (this.isDirty && !force) {
      if (!confirm('有未保存的修改，确定关闭？')) return;
    }
    this._isVisible = false;
    this.el.style.display = 'none';
    this.currentPath = null;
    this.textareaEl.value = '';
    this.isDirty = false;
  }

  /**
   * 获取当前修改状态
   */
  isModified() {
    return this.isDirty;
  }

  /* ── 内部渲染 ──────────────────────────────────────────────────── */

  _show() {
    this._isVisible = true;
    this.el.style.display = 'flex';
  }

  _applyFontSize() {
    this.textareaEl.style.fontSize = this.fontSize + 'px';
    this.highlightEl.style.fontSize = this.fontSize + 'px';
    this.gutterEl.style.fontSize = this.fontSize + 'px';
  }

  /**
   * 设置字体大小
   */
  setFontSize(px) {
    this.fontSize = Math.max(8, Math.min(32, px));
    this._applyFontSize();
  }

  /**
   * 更新高亮显示
   */
  _updateHighlight(lang) {
    const code = this.textareaEl.value;
    const language = lang || this.currentLang || 'plaintext';
    const html = this._highlight(code, language);

    // 末尾加一个空格确保最后一行有高度
    this.codeInner.innerHTML = html + '\n';
    this._renderLineNumbers(code);
  }

  /**
   * 渲染行号
   */
  _renderLineNumbers(code) {
    const lines = code.split('\n');
    const count = lines.length;
    let html = '';
    for (let i = 1; i <= count; i++) {
      html += i + '\n';
    }
    this.gutterEl.textContent = html;
  }

  /**
   * 更新修改状态
   */
  _updateModifiedState() {
    this.isDirty = this.textareaEl.value !== this.originalContent;
    this.statusModified.style.display = this.isDirty ? '' : 'none';
    this.saveBtn.style.display = this.isDirty ? '' : 'none';
  }

  /**
   * 更新光标位置状态栏
   */
  _updateCursor() {
    const pos = this.textareaEl.selectionStart;
    const before = this.textareaEl.value.substring(0, pos);
    const lines = before.split('\n');
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;
    this.statusCursor.textContent = `行 ${line}, 列 ${col}`;
  }

  /* ── 语言检测 ──────────────────────────────────────────────────── */

  _detectLanguage(path) {
    const ext = (path.split('.').pop() || '').toLowerCase();
    const map = {
      js: 'javascript', mjs: 'javascript', jsx: 'javascript',
      ts: 'typescript', tsx: 'typescript',
      py: 'python', swift: 'swift', json: 'json',
      md: 'markdown', markdown: 'markdown',
      html: 'xml', htm: 'xml', xml: 'xml',
      css: 'css', scss: 'css', less: 'css',
      java: 'java', kt: 'kotlin', go: 'go',
      rs: 'rust', c: 'c', cpp: 'cpp', h: 'c',
      sh: 'shell', yml: 'yaml', yaml: 'yaml',
      vue: 'javascript', sql: 'sql', rb: 'ruby',
      php: 'php', lua: 'lua', dart: 'dart',
    };
    return map[ext] || 'plaintext';
  }

  /* ── 语法高亮（复用 CodeViewer 逻辑） ─────────────────────────── */

  _highlight(code, language) {
    let html = this._escapeHtml(code);
    switch (language) {
      case 'javascript': html = this._highlightJSLike(html, JS_KEYWORDS); break;
      case 'typescript': html = this._highlightJSLike(html, JS_KEYWORDS); break;
      case 'python':     html = this._highlightPython(html); break;
      case 'swift':      html = this._highlightSwift(html); break;
      case 'json':       html = this._highlightJSON(html); break;
      case 'markdown':   html = this._highlightMarkdown(html); break;
      case 'xml':        html = this._highlightXML(html); break;
      case 'css':        html = this._highlightCSS(html); break;
      default: break;
    }
    return html;
  }

  _applyRules(html, rules) {
    for (const { regex, className } of rules) {
      html = html.replace(regex, (match) =>
        `\x00SPAN\x00${className}\x00${match}\x00END\x00`
      );
    }
    html = html
      .replace(/\x00SPAN\x00(\w+)\x00([\s\S]*?)\x00END\x00/g, (_m, cls, inner) => {
        inner = inner.replace(/\x00SPAN\x00\w+\x00/g, '').replace(/\x00END\x00/g, '');
        return `<span class="cv-${cls}">${inner}</span>`;
      });
    return html;
  }

  _highlightJSLike(html, keywords) {
    return this._applyRules(html, [
      { regex: /\/\*[\s\S]*?\*\//g, className: 'comment' },
      { regex: /\/\/[^\n]*/g, className: 'comment' },
      { regex: /`(?:[^`\\]|\\.)*`/g, className: 'string' },
      { regex: /"(?:[^"\\]|\\.)*"/g, className: 'string' },
      { regex: /'(?:[^'\\]|\\.)*'/g, className: 'string' },
      { regex: /\b(0x[0-9a-fA-F]+|0b[01]+|\d+\.?\d*(?:e[+-]?\d+)?)\b/g, className: 'number' },
      { regex: new RegExp(`\\b(${keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g'), className: 'keyword' },
      { regex: /\b(console|document|window|globalThis|process|module|exports|require|Promise|Array|Object|String|Number|Boolean|Math|JSON|Date|RegExp|Map|Set|Symbol|Error|fetch|localStorage|indexedDB)\b/g, className: 'builtin' },
      { regex: /\b([a-zA-Z_$][\w$]*)(?=\s*\()/g, className: 'function' },
    ]);
  }

  _highlightPython(html) {
    return this._applyRules(html, [
      { regex: /"""[\s\S]*?"""|'''[\s\S]*?'''/g, className: 'string' },
      { regex: /[furbFURB]*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, className: 'string' },
      { regex: /#[^\n]*/g, className: 'comment' },
      { regex: /\b(0x[0-9a-fA-F]+|0b[01]+|\d+\.?\d*(?:e[+-]?\d+)?)\b/g, className: 'number' },
      { regex: new RegExp(`\\b(${PY_KEYWORDS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g'), className: 'keyword' },
      { regex: /@[A-Za-z_][\w.]*/g, className: 'decorator' },
      { regex: /\b(print|len|range|enumerate|zip|map|filter|sorted|reversed|sum|min|max|abs|round|isinstance|type|id|dir|str|int|float|list|dict|tuple|set|bool|open|format|super)\b/g, className: 'builtin' },
    ]);
  }

  _highlightSwift(html) {
    return this._applyRules(html, [
      { regex: /\/\*[\s\S]*?\*\//g, className: 'comment' },
      { regex: /\/\/[^\n]*/g, className: 'comment' },
      { regex: /"""[\s\S]*?"""|'''[\s\S]*?'''/g, className: 'string' },
      { regex: /"(?:[^"\\]|\\.)*"/g, className: 'string' },
      { regex: /'(?:[^'\\]|\\.)*'/g, className: 'string' },
      { regex: /\b(0x[0-9a-fA-F]+|0b[01]+|\d+\.?\d*(?:e[+-]?\d+)?)\b/g, className: 'number' },
      { regex: new RegExp(`\\b(${SWIFT_KEYWORDS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g'), className: 'keyword' },
      { regex: /\b(String|Int|Double|Float|Bool|Array|Dictionary|Set|Range|Void|Any|URL|Date|UUID)\b/g, className: 'builtin' },
      { regex: /@[A-Za-z_][A-Za-z0-9_]*/g, className: 'decorator' },
    ]);
  }

  _highlightJSON(html) {
    return this._applyRules(html, [
      { regex: /"(?:[^"\\]|\\.)*"/g, className: 'string' },
      { regex: /\b(0x[0-9a-fA-F]+|\d+\.?\d*(?:e[+-]?\d+)?)\b/g, className: 'number' },
      { regex: /\b(true|false|null)\b/g, className: 'keyword' },
    ]);
  }

  _highlightMarkdown(html) {
    let result = html;
    result = result.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, body) => {
      const highlighted = this._highlight(this._unescapeHtml(body), lang || 'plaintext');
      return `<span class="cv-comment">\`\`\`${lang}</span>\n${highlighted}<span class="cv-comment">\`\`\`</span>`;
    });
    return this._applyRules(result, [
      { regex: /^#{1,6}\s+[^\n]+/gm, className: 'keyword' },
      { regex: /\*\*[\s\S]+?\*\*|__[\s\S]+?__/g, className: 'builtin' },
      { regex: /`[^`]+`/g, className: 'string' },
      { regex: /\[[^\]]*\]\([^)]*\)/g, className: 'decorator' },
      { regex: /^&gt;\s+[^\n]*/gm, className: 'comment' },
      { regex: /^\s*([-*+]|\d+\.)\s/gm, className: 'number' },
    ]);
  }

  _highlightXML(html) {
    html = html.replace(/&lt;!--[\s\S]*?--&gt;/g, m => `\x00SPAN\x00comment\x00${m}\x00END\x00`);
    html = html.replace(/(&lt;\/?)([\w:-]+)/g, (_m, p1, p2) => `${p1}\x00SPAN\x00keyword\x00${p2}\x00END\x00`);
    html = html.replace(/\s([\w:-]+)(=)/g, (_m, attr, eq) => ` \x00SPAN\x00decorator\x00${attr}\x00END\x00${eq}`);
    html = html.replace(/"[^"]*"/g, m => `\x00SPAN\x00string\x00${m}\x00END\x00`);
    html = html.replace(/\/?&gt;/g, m => `\x00SPAN\x00builtin\x00${m}\x00END\x00`);
    return html.replace(/\x00SPAN\x00(\w+)\x00([\s\S]*?)\x00END\x00/g, (_m, cls, inner) => {
      inner = inner.replace(/\x00SPAN\x00\w+\x00/g, '').replace(/\x00END\x00/g, '');
      return `<span class="cv-${cls}">${inner}</span>`;
    });
  }

  _highlightCSS(html) {
    html = html.replace(/\/\*[\s\S]*?\*\//g, m => `\x00SPAN\x00comment\x00${m}\x00END\x00`);
    html = html.replace(/@[\w-]+/g, m => `\x00SPAN\x00decorator\x00${m}\x00END\x00`);
    html = html.replace(/([{};])/g, '\x00SPAN\x00builtin\x00$1\x00END\x00');
    html = html.replace(/([\w-]+)(\s*:\s*)([^;{}]+)(;?)/g, (_m, prop, colon, val, semi) =>
      `\x00SPAN\x00keyword\x00${prop}\x00END\x00${colon}\x00SPAN\x00string\x00${val}\x00END\x00${semi}`);
    html = html.replace(/\b(\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|fr|s|ms|deg)?)\b/g,
      m => `\x00SPAN\x00number\x00${m}\x00END\x00`);
    return html.replace(/\x00SPAN\x00(\w+)\x00([\s\S]*?)\x00END\x00/g, (_m, cls, inner) => {
      inner = inner.replace(/\x00SPAN\x00\w+\x00/g, '').replace(/\x00END\x00/g, '');
      return `<span class="cv-${cls}">${inner}</span>`;
    });
  }

  /* ── HTML 工具 ─────────────────────────────────────────────────── */

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  _unescapeHtml(html) {
    const txt = document.createElement('textarea');
    txt.innerHTML = html;
    return txt.value;
  }

  _toast(msg, type) {
    const container = document.getElementById('toast-container');
    if (container) {
      const toast = document.createElement('div');
      toast.className = `toast ${type || 'info'}`;
      toast.textContent = msg;
      container.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity .25s';
        setTimeout(() => toast.remove(), 250);
      }, 2500);
    } else {
      console.log(`[${type}] ${msg}`);
    }
  }

  /**
   * 注入语法高亮 CSS（与 CodeViewer 共用样式名 cv-*）
   */
  _injectStyles() {
    if (document.getElementById('ce-styles')) return;
    const style = document.createElement('style');
    style.id = 'ce-styles';
    style.textContent = `
      .cv-keyword   { color: #c586c0; }
      .cv-string    { color: #ce9178; }
      .cv-comment   { color: #6a9955; }
      .cv-number    { color: #b5cea8; }
      .cv-builtin   { color: #4fc1ff; }
      .cv-function  { color: #dcdcaa; }
      .cv-decorator { color: #dcdcaa; }
    `;
    document.head.appendChild(style);
  }
}

export default CodeEditor;
