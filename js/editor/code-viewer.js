/**
 * CodeViewer — Lightweight syntax-highlighted code viewer for mobile
 * -------------------------------------------------------------------
 * Designed for Android WebView where Monaco Editor is too heavy.
 * Uses regex-based highlighting for common languages.
 *
 * Usage:
 *   import { CodeViewer } from './editor/code-viewer.js';
 *   const viewer = new CodeViewer({ container: 'viewer-root', fileManager: fm });
 *   viewer.show('src/main.swift');
 *   viewer.close();
 *
 * Public API:
 *   - show(path)            Load & display a file with highlighting
 *   - close()               Hide the viewer
 *   - setFontSize(px)       Manually adjust font size
 *   - _highlight(code, lang) Returns highlighted HTML
 */
export class CodeViewer {

  /* ------------------------------------------------------------------ *
   *  Constructor
   * ------------------------------------------------------------------ */

  constructor({ container, fileManager }) {
    this.fileManager = fileManager || null;

    // Resolve container element
    this.containerEl = typeof container === 'string'
      ? document.getElementById(container)
      : container;
    if (!this.containerEl) {
      throw new Error('CodeViewer: container element not found');
    }

    // State
    this.currentPath   = null;
    this.currentCode   = '';
    this.currentLang   = '';
    this.fontSize      = 13;       // px
    this.minFontSize   = 8;
    this.maxFontSize   = 32;
    this._visible      = false;

    // Pinch-to-zoom state
    this._pinchActive   = false;
    this._initialDist   = 0;
    this._initialFont   = this.fontSize;

    // Build DOM
    this._buildDOM();
    this._attachListeners();

    // Start hidden
    this.el.style.display = 'none';
  }

  /* ------------------------------------------------------------------ *
   *  DOM construction
   * ------------------------------------------------------------------ */

  _buildDOM() {
    // Root overlay
    this.el = document.createElement('div');
    this.el.className = 'cv-root';
    this.el.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:flex',
      'flex-direction:column',
      'background:#1e1e1e',
      'z-index:1000',
      'touch-action:pan-y',
    ].join(';');

    // ---- Toolbar ----
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'cv-toolbar';
    this.toolbar.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:8px',
      'padding:6px 12px',
      'background:#2d2d2d',
      'border-bottom:1px solid #404040',
      'flex-shrink:0',
    ].join(';');

    // Title
    this.titleEl = document.createElement('span');
    this.titleEl.className = 'cv-title';
    this.titleEl.style.cssText = 'flex:1;color:#e0e0e0;font-size:13px;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    this.titleEl.textContent = '(no file)';

    // Font-size controls
    this.zoomOutBtn = this._makeBtn('−', () => this.setFontSize(this.fontSize - 1));
    this.zoomLabel  = document.createElement('span');
    this.zoomLabel.style.cssText = 'color:#888;font-size:11px;min-width:32px;text-align:center;';
    this.zoomLabel.textContent = `${this.fontSize}px`;
    this.zoomInBtn  = this._makeBtn('+', () => this.setFontSize(this.fontSize + 1));

    // Close button
    this.closeBtn = this._makeBtn('✕', () => this.close());
    this.closeBtn.style.color = '#ff5555';

    this.toolbar.appendChild(this.titleEl);
    this.toolbar.appendChild(this.zoomOutBtn);
    this.toolbar.appendChild(this.zoomLabel);
    this.toolbar.appendChild(this.zoomInBtn);
    this.toolbar.appendChild(this.closeBtn);

    // ---- Code area ----
    // Wrapper that holds the scrollable content
    this.scrollWrapper = document.createElement('div');
    this.scrollWrapper.className = 'cv-scroll';
    this.scrollWrapper.style.cssText = [
      'flex:1',
      'overflow:auto',
      'position:relative',
      '-webkit-overflow-scrolling:touch',
    ].join(';');

    // Inner content (line numbers + code)
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'cv-content';
    this.contentEl.style.cssText = [
      'display:flex',
      'min-width:100%',
      'width:fit-content',
    ].join(';');

    // Line-number gutter
    this.gutterEl = document.createElement('div');
    this.gutterEl.className = 'cv-gutter';
    this.gutterEl.style.cssText = [
      'flex-shrink:0',
      'padding:8px 8px 8px 12px',
      'text-align:right',
      'color:#6a6a6a',
      'background:#1a1a1a',
      'user-select:none',
      '-webkit-user-select:none',
      'border-right:1px solid #333',
      'line-height:1.6',
    ].join(';');

    // Code display
    this.codeEl = document.createElement('div');
    this.codeEl.className = 'cv-code';
    this.codeEl.style.cssText = [
      'flex:1',
      'padding:8px 12px',
      'white-space:pre',
      'overflow-x:auto',
      'line-height:1.6',
      'tab-size:4',
    ].join(';');

    this.contentEl.appendChild(this.gutterEl);
    this.contentEl.appendChild(this.codeEl);
    this.scrollWrapper.appendChild(this.contentEl);

    this.el.appendChild(this.toolbar);
    this.el.appendChild(this.scrollWrapper);

    this.containerEl.appendChild(this.el);

    this._applyFontSize();
  }

  _makeBtn(label, onClick) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = [
      'background:#3a3a3a',
      'color:#ccc',
      'border:1px solid #555',
      'border-radius:4px',
      'padding:2px 10px',
      'font-size:16px',
      'cursor:pointer',
      'line-height:1.4',
      'min-width:32px',
    ].join(';');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  /* ------------------------------------------------------------------ --
   *  Event listeners (pinch-to-zoom)
   * ------------------------------------------------------------------ */

  _attachListeners() {
    const area = this.scrollWrapper;

    area.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        this._pinchActive = true;
        this._initialDist = this._touchDistance(e.touches);
        this._initialFont = this.fontSize;
        e.preventDefault();
      }
    }, { passive: false });

    area.addEventListener('touchmove', (e) => {
      if (this._pinchActive && e.touches.length === 2) {
        const dist  = this._touchDistance(e.touches);
        const ratio = dist / (this._initialDist || 1);
        const newSize = Math.round(this._initialFont * ratio);
        this.setFontSize(newSize);
        e.preventDefault();
      }
    }, { passive: false });

    const endPinch = () => {
      this._pinchActive = false;
    };
    area.addEventListener('touchend',    endPinch);
    area.addEventListener('touchcancel', endPinch);

    // Mouse-wheel zoom with Ctrl
    area.addEventListener('wheel', (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        this.setFontSize(this.fontSize + (e.deltaY < 0 ? 1 : -1));
      }
    }, { passive: false });
  }

  _touchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  /* ------------------------------------------------------------------ *
   *  Public API
   * ------------------------------------------------------------------ */

  /**
   * Load and display a file.
   * @param {string} path — file path in the virtual FS
   */
  async show(path) {
    if (!path) {
      console.error('CodeViewer.show: path is required');
      return;
    }

    // Show container
    if (this.containerEl) this.containerEl.style.display = 'flex';

    let fileData = null;
    try {
      if (this.fileManager && typeof this.fileManager.readFile === 'function') {
        fileData = await this.fileManager.readFile(path);
      }
    } catch (e) {
      console.error('CodeViewer readFile error:', e);
    }

    if (!fileData || !fileData.content) {
      this.titleEl.textContent = path;
      this.codeEl.innerHTML = '<span style="color:#f44;">Unable to load file: ' + this._escapeHtml(path) + '</span>';
      this.gutterEl.innerHTML = '';
      this._render();
      return;
    }

    const content = typeof fileData === 'string' ? fileData : fileData.content;
    this.currentPath = path;
    this.currentCode = content;
    this.currentLang = fileData.language || this._detectLanguage(path);

    this.titleEl.textContent = `${path}  (${this.currentLang})`;

    // Highlight
    const highlighted = this._highlight(content, this.currentLang);
    this.codeEl.innerHTML = highlighted;

    // Line numbers
    this._renderLineNumbers(content);

    this._render();
  }

  /** Hide the viewer. */
  close() {
    this._visible = false;
    this.el.style.display = 'none';
    if (this.containerEl) this.containerEl.style.display = 'none';
  }

  /** Programmatically set font size (clamped). */
  setFontSize(px) {
    this.fontSize = Math.max(this.minFontSize, Math.min(this.maxFontSize, px));
    this._applyFontSize();
  }

  /* ------------------------------------------------------------------ *
   *  Internal helpers — rendering
   * ------------------------------------------------------------------ */

  _render() {
    this._visible = true;
    this.el.style.display = 'flex';
  }

  _applyFontSize() {
    if (this.gutterEl) this.gutterEl.style.fontSize = this.fontSize + 'px';
    if (this.codeEl)   this.codeEl.style.fontSize   = this.fontSize + 'px';
    this.zoomLabel.textContent = `${this.fontSize}px`;
  }

  _renderLineNumbers(code) {
    const lineCount = code.split('\n').length;
    const nums = [];
    for (let i = 1; i <= lineCount; i++) {
      nums.push(i);
    }
    this.gutterEl.innerHTML = nums
      .map(n => `<div>${n}</div>`)
      .join('');
  }

  /* ------------------------------------------------------------------ *
   *  Language detection
   * ------------------------------------------------------------------ */

  _detectLanguage(path) {
    const ext = (path.split('.').pop() || '').toLowerCase();
    const map = {
      swift:  'swift',
      js:     'javascript',
      mjs:    'javascript',
      jsx:    'javascript',
      ts:     'typescript',
      tsx:    'typescript',
      py:     'python',
      json:   'json',
      md:     'markdown',
      markdown: 'markdown',
      xml:    'xml',
      html:   'xml',
      htm:    'xml',
      css:    'css',
      scss:   'css',
      less:   'css',
    };
    return map[ext] || 'plaintext';
  }

  /* ------------------------------------------------------------------ *
   *  Syntax highlighting  (regex-based, NOT a full parser)
   *
   *  Strategy:
   *    1. Escape HTML first.
   *    2. Apply language-specific rules in a priority order that
   *       avoids conflicts:
   *       comments → strings → numbers → keywords
   *    3. Wrap matched tokens in <span class="cv-*"> tags.
   * ------------------------------------------------------------------ */

  _highlight(code, language) {
    // Always escape HTML entities first
    let html = this._escapeHtml(code);

    switch (language) {
      case 'swift':       html = this._highlightSwift(html); break;
      case 'javascript':  html = this._highlightJavaScript(html); break;
      case 'typescript':  html = this._highlightTypeScript(html); break;
      case 'python':      html = this._highlightPython(html); break;
      case 'json':        html = this._highlightJSON(html); break;
      case 'markdown':    html = this._highlightMarkdown(html); break;
      case 'xml':         html = this._highlightXML(html); break;
      case 'css':         html = this._highlightCSS(html); break;
      default:            /* plaintext — no highlighting */ break;
    }
    return html;
  }

  /* ---- Shared token replacer ----
   * Replaces regex matches in a string while protecting already-inserted
   * <span> tags from being re-processed by subsequent rules.
   *
   * Each rule receives the *current* html and returns the updated html.
   * We use placeholder sentinels to protect completed spans.
   */

  _applyRules(html, rules) {
    // Process rules in order; each rule is { regex, className }
    for (const { regex, className } of rules) {
      html = html.replace(regex, (match) => {
        return `\x00SPAN\x00${className}\x00${match}\x00END\x00`;
      });
    }

    // Convert sentinel-protected tokens to real spans, protecting inner
    // content from re-processing
    html = html
      .replace(/\x00SPAN\x00(\w+)\x00([\s\S]*?)\x00END\x00/g, (_m, cls, inner) => {
        // Clean up any nested sentinels inside inner
        inner = inner
          .replace(/\x00SPAN\x00\w+\x00/g, '')
          .replace(/\x00END\x00/g, '');
        return `<span class="cv-${cls}">${inner}</span>`;
      });

    return html;
  }

  /* ---- Comment & string rules (shared across many languages) ---- */

  _lineCommentRule() {
    return { regex: /\/\/[^\n]*/g, className: 'comment' };
  }

  _blockCommentRule() {
    return { regex: /\/\*[\s\S]*?\*\//g, className: 'comment' };
  }

  _hashCommentRule() {
    return { regex: /#[^\n]*/g, className: 'comment' };
  }

  _doubleQuoteStringRule() {
    // Matches double-quoted strings (no escaping complexity — good enough)
    return { regex: /"(?:[^"\\]|\\.)*"/g, className: 'string' };
  }

  _singleQuoteStringRule() {
    return { regex: /'(?:[^'\\]|\\.)*'/g, className: 'string' };
  }

  _backtickStringRule() {
    return { regex: /`(?:[^`\\]|\\.)*`/g, className: 'string' };
  }

  _tripleQuoteStringRule() {
    // Python triple-quoted strings  """...""" or '''...'''
    return { regex: /"""[\s\S]*?"""|'''[\s\S]*?'''/g, className: 'string' };
  }

  _numberRule() {
    return { regex: /\b(0x[0-9a-fA-F]+|0b[01]+|\d+\.?\d*(?:e[+-]?\d+)?)\b/g, className: 'number' };
  }

  _keywordRule(keywords) {
    const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(`\\b(${escaped.join('|')})\\b`, 'g');
    return { regex: re, className: 'keyword' };
  }

  /* ---- Per-language rule sets ---- */

  _highlightSwift(html) {
    return this._applyRules(html, [
      this._blockCommentRule(),
      this._lineCommentRule(),
      this._tripleQuoteStringRule(),
      this._doubleQuoteStringRule(),
      this._singleQuoteStringRule(),
      this._numberRule(),
      this._keywordRule([
        'class', 'struct', 'enum', 'protocol', 'extension', 'func', 'var', 'let',
        'const', 'static', 'if', 'guard', 'else', 'for', 'while', 'repeat', 'switch',
        'case', 'default', 'break', 'continue', 'return', 'throw', 'throws', 'rethrows',
        'try', 'catch', 'do', 'defer', 'init', 'deinit', 'self', 'super', 'nil',
        'true', 'false', 'in', 'as', 'is', 'where', 'import', 'public', 'private',
        'internal', 'fileprivate', 'open', 'final', 'override', 'lazy', 'weak',
        'unowned', 'inout', 'mutating', 'nonmutating', 'convenience', 'required',
        'optional', 'indirect', 'typealias', 'associatedtype', 'some', 'any',
        'async', 'await', 'actor', 'Sendable', 'Codable', 'Identifiable',
        'ObservableObject', 'Published', 'State', 'Binding', 'Environment',
        'EnvironmentObject', 'ObservedObject', 'View', 'some View',
      ]),
      // Types / built-ins (blue-ish)
      { regex: /\b(String|Int|Double|Float|Bool|Data|Array|Dictionary|Set|Range|Character|UInt8|UInt16|UInt32|UInt64|Int8|Int16|Int32|Int64|Void|Any|Never|URL|Date|UUID|Color|Image|Text|Button|VStack|HStack|ZStack|List|ScrollView|NavigationView|TabView|ForEach|Spacer|Divider|TextField|SecureField|Toggle|Slider|Picker|NavigationLink|Sheet|alert|Alert)\b/g, className: 'builtin' },
      // Attributes @MainActor, @State, etc.
      { regex: /@[A-Za-z_][A-Za-z0-9_]*/g, className: 'decorator' },
    ]);
  }

  _highlightJavaScript(html) {
    return this._highlightJavaScriptLike(html, [
      'class', 'const', 'let', 'var', 'function', 'return', 'if', 'else',
      'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new',
      'delete', 'typeof', 'instanceof', 'in', 'of', 'void', 'this', 'super',
      'extends', 'import', 'export', 'from', 'default', 'async', 'await',
      'yield', 'try', 'catch', 'finally', 'throw', 'static', 'get', 'set',
      'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
    ]);
  }

  _highlightTypeScript(html) {
    return this._highlightJavaScriptLike(html, [
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
    ]);
  }

  _highlightJavaScriptLike(html, keywords) {
    return this._applyRules(html, [
      this._blockCommentRule(),
      this._lineCommentRule(),
      this._backtickStringRule(),
      this._doubleQuoteStringRule(),
      this._singleQuoteStringRule(),
      this._numberRule(),
      this._keywordRule(keywords),
      // Built-in globals & common APIs
      { regex: /\b(console|document|window|globalThis|global|process|module|exports|require|Promise|Array|Object|String|Number|Boolean|Math|JSON|Date|RegExp|Map|Set|WeakMap|WeakSet|Symbol|Error|TypeError|RangeError|Function|setTimeout|setInterval|fetch|localStorage)\b/g, className: 'builtin' },
      // Function-call names
      { regex: /\b([a-zA-Z_$][\w$]*)(?=\s*\()/g, className: 'function' },
    ]);
  }

  _highlightPython(html) {
    return this._applyRules(html, [
      // Triple-quoted strings must come before hash comments
      this._tripleQuoteStringRule(),
      // f-strings and regular strings
      { regex: /[furbFURB]*("""[\s\S]*?"""|'''[\s\S]*?''')/g, className: 'string' },
      { regex: /[furbFURB]*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, className: 'string' },
      this._hashCommentRule(),
      this._numberRule(),
      this._keywordRule([
        'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while',
        'break', 'continue', 'pass', 'import', 'from', 'as', 'with',
        'try', 'except', 'finally', 'raise', 'yield', 'lambda', 'global',
        'nonlocal', 'assert', 'del', 'in', 'is', 'not', 'and', 'or',
        'None', 'True', 'False', 'async', 'await', 'self',
      ]),
      // Decorators
      { regex: /@[A-Za-z_][\w.]*/g, className: 'decorator' },
      // Built-in functions
      { regex: /\b(print|len|range|enumerate|zip|map|filter|sorted|reversed|sum|min|max|abs|round|isinstance|issubclass|type|id|dir|vars|getattr|setattr|hasattr|repr|str|int|float|list|dict|tuple|set|frozenset|bool|chr|ord|hex|oct|bin|input|open|format|super|property|staticmethod|classmethod|iter|next|any|all)\b/g, className: 'builtin' },
    ]);
  }

  _highlightJSON(html) {
    return this._applyRules(html, [
      this._doubleQuoteStringRule(),
      this._numberRule(),
      { regex: /\b(true|false|null)\b/g, className: 'keyword' },
    ]);
  }

  _highlightMarkdown(html) {
    // For markdown, highlight headings, bold, italic, code, links
    // We apply rules sequentially without the sentinel wrapper
    let result = html;

    // Fenced code blocks ```lang\n...\n```
    result = result.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, body) => {
      const highlighted = this._highlight(this._unescapeHtml(body), lang || 'plaintext');
      return `<span class="cv-comment">‎\`\`\`‎${lang}</span>\n${highlighted}<span class="cv-comment">\`\`\`</span>`;
    });

    result = this._applyRules(result, [
      // Headings  #..6
      { regex: /^#{1,6}\s+[^\n]+/gm, className: 'keyword' },
      // Bold  **text** or __text__
      { regex: /\*\*[\s\S]+?\*\*|__[\s\S]+?__/g, className: 'builtin' },
      // Inline code `code`
      { regex: /`[^`]+`/g, className: 'string' },
      // Links [text](url)
      { regex: /\[[^\]]*\]\([^)]*\)/g, className: 'decorator' },
      // Blockquotes > text
      { regex: /^&gt;\s+[^\n]*/gm, className: 'comment' },
      // List markers  - * + 1.
      { regex: /^\s*([-*+]|\d+\.)\s/gm, className: 'number' },
    ]);

    return result;
  }

  _highlightXML(html) {
    // Comments
    html = html.replace(/&lt;!--[\s\S]*?--&gt;/g, m => `\x00SPAN\x00comment\x00${m}\x00END\x00`);
    // Tag names
    html = html.replace(/(&lt;\/?)([\w:-]+)/g, (_m, p1, p2) => `${p1}\x00SPAN\x00keyword\x00${p2}\x00END\x00`);
    // Attribute names
    html = html.replace(/\s([\w:-]+)(=)/g, (_m, attr, eq) => ` \x00SPAN\x00decorator\x00${attr}\x00END\x00${eq}`);
    // Attribute values
    html = html.replace(/"[^"]*"/g, m => `\x00SPAN\x00string\x00${m}\x00END\x00`);
    // Tag punctuation
    html = html.replace(/\/?&gt;/g, m => `\x00SPAN\x00builtin\x00${m}\x00END\x00`);
    return this._finalizeSpans(html);
  }

  _highlightCSS(html) {
    // Comments
    html = html.replace(this._blockCommentRule().regex, m => `\x00SPAN\x00comment\x00${m}\x00END\x00`);
    // At-rules
    html = html.replace(/@[\w-]+/g, m => `\x00SPAN\x00decorator\x00${m}\x00END\x00`);
    // Selectors
    html = html.replace(/([^{}\n;]+)\{/g, (_m, selector) => `\x00SPAN\x00builtin\x00${selector}\x00END\x00{`);
    // Property: value;
    html = html.replace(/([\w-]+)(\s*:\s*)([^;{}]+)(;?)/g, (_m, prop, colon, val, semi) =>
      `\x00SPAN\x00keyword\x00${prop}\x00END\x00${colon}\x00SPAN\x00string\x00${val}\x00END\x00${semi}`);
    // Numbers with units
    html = html.replace(/\b(\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|fr|s|ms|deg|pt|pc|in|cm|mm|ex|ch)?)\b/g,
      m => `\x00SPAN\x00number\x00${m}\x00END\x00`);
    return this._finalizeSpans(html);
  }

  _finalizeSpans(html) {
    return html
      .replace(/\x00SPAN\x00(\w+)\x00([\s\S]*?)\x00END\x00/g, (_m, cls, inner) => {
        inner = inner.replace(/\x00SPAN\x00\w+\x00/g, '').replace(/\x00END\x00/g, '');
        return `<span class="cv-${cls}">${inner}</span>`;
      });
  }

  /* ------------------------------------------------------------------ *
   *  HTML utilities
   * ------------------------------------------------------------------ */

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

  /* ------------------------------------------------------------------ *
   *  Static CSS injector — call once on app startup to define colours
   *  cv-keyword  → blue/purple
   *  cv-string   → green
   *  cv-comment  → gray
   *  cv-number   → orange
   *  cv-builtin  → teal
   *  cv-function → yellow
   *  cv-decorator→ gold
   * ------------------------------------------------------------------ */

  static injectStyles(doc = document) {
    if (doc.getElementById('cv-styles')) return;
    const style = doc.createElement('style');
    style.id = 'cv-styles';
    style.textContent = `
      .cv-keyword   { color: #c586c0; }   /* purple — keywords */
      .cv-string    { color: #ce9178; }   /* orange-green — strings */
      .cv-comment   { color: #6a9955; }   /* gray-green — comments */
      .cv-number    { color: #b5cea8; }   /* light green — numbers */
      .cv-builtin   { color: #4fc1ff; }   /* teal — built-in types/functions */
      .cv-function  { color: #dcdcaa; }   /* pale yellow — function calls */
      .cv-decorator { color: #dcdcaa; }   /* gold — decorators/attributes */
    `;
    doc.head.appendChild(style);
  }
}

export default CodeViewer;
