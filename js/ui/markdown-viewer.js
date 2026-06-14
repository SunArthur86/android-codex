/**
 * MarkdownViewer — Markdown 渲染器
 * ====================================================
 * 将 Agent 返回的 Markdown 文本渲染为格式化 HTML，
 * 支持完整的 Markdown 语法，代码块复用 CodeViewer 语法高亮。
 *
 * 支持语法：
 *   标题 h1-h6、粗体、斜体、行内代码、代码块（带语言标签）、
 *   有序/无序列表、链接、引用块、分隔线、表格、任务列表
 *
 * 语法高亮：
 *   复用 CodeViewer 的 _highlight() 实例方法，
 *   支持 JS、TS、Python、Swift、JSON、CSS、XML。
 *
 * 用法：
 *   import MarkdownViewer from './ui/markdown-viewer.js';
 *   const mv = new MarkdownViewer({ codeViewer: cv });
 *   mv.open('# Hello\n\n**bold** text'); // 在模态面板显示
 *
 *   // 或渲染到任意元素（用于 Chat 消息）
 *   const html = mv.render(markdownText);
 *   element.innerHTML = html;
 */

/* ── 语言标签映射 ──────────────────────────────────────────────────── */

const LANG_ALIASES = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', python3: 'python',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  html: 'xml', htm: 'xml', svg: 'xml',
  yml: 'yaml',
  golang: 'go',
  rs: 'rust',
  kt: 'kotlin', kts: 'kotlin',
};

class MarkdownViewer {
  /**
   * @param {object} options
   * @param {object} [options.codeViewer]  CodeViewer 实例（用于语法高亮）
   * @param {HTMLElement|string} [options.container]  模态容器（默认 document.body）
   */
  constructor({ codeViewer, container } = {}) {
    this.codeViewer = codeViewer || null;

    this.containerEl = typeof container === 'string'
      ? document.getElementById(container)
      : (container || document.body);

    this._visible = false;
  }

  /* ── 公开 API ────────────────────────────────────────────────── */

  /**
   * 将 Markdown 渲染为 HTML 字符串
   * @param {string} markdown  原始 Markdown 文本
   * @returns {string} 渲染后的 HTML
   */
  render(markdown) {
    if (!markdown || typeof markdown !== 'string') return '';

    try {
      return this._parse(markdown);
    } catch (err) {
      console.error('MarkdownViewer.render 出错:', err);
      // 降级：至少做 HTML 转义
      return this._escapeHtml(markdown).replace(/\n/g, '<br>');
    }
  }

  /**
   * 渲染并显示在模态面板
   * @param {string} content  Markdown 文本
   */
  open(content) {
    const html = this.render(content);
    this._buildModal();
    this.contentEl.innerHTML = html;
    this._visible = true;
    this.el.style.display = 'flex';
  }

  /** 关闭模态面板 */
  close() {
    this._visible = false;
    if (this.el) this.el.style.display = 'none';
  }

  /* ── 核心解析引擎 ────────────────────────────────────────────── */

  /**
   * Markdown → HTML 主解析流程
   * 策略：逐行扫描 + 块级元素匹配 + 行内格式化
   */
  _parse(md) {
    // 统一换行符
    md = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 预处理：提取代码块（用占位符保护，避免被后续规则破坏）
    const codeBlocks = [];
    md = md.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang: this._normalizeLang(lang), code: code.replace(/\n$/, '') });
      return `\x00CODEBLOCK_${idx}\x00`;
    });

    // 预处理：提取行内代码
    const inlineCodes = [];
    md = md.replace(/`([^`\n]+)`/g, (_m, code) => {
      const idx = inlineCodes.length;
      inlineCodes.push(code);
      return `\x00INLINECODE_${idx}\x00`;
    });

    // 按行处理块级元素
    const lines = md.split('\n');
    const blocks = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // 空行
      if (/^\s*$/.test(line)) {
        i++;
        continue;
      }

      // 分隔线 ---, ***, ___
      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
        blocks.push('<hr>');
        i++;
        continue;
      }

      // 标题 # ~ ######
      const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = this._inline(headingMatch[2]);
        blocks.push(`<h${level}>${text}</h${level}>`);
        i++;
        continue;
      }

      // 引用块 > text
      if (/^\s*>\s?/.test(line)) {
        const quoteLines = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        blocks.push(`<blockquote>${this._inline(quoteLines.join('\n')).replace(/\n/g, '<br>')}</blockquote>`);
        continue;
      }

      // 任务列表 - [ ] / - [x]
      if (/^\s*[-*+]\s+\[[ xX]\]\s/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*+]\s+\[[ xX]\]\s/.test(lines[i])) {
          const checked = /\[[xX]\]/.test(lines[i]);
          const text = lines[i].replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, '');
          items.push(
            `<li class="md-task${checked ? ' md-task-done' : ''}">` +
            `<input type="checkbox" ${checked ? 'checked' : ''} disabled> ` +
            `${this._inline(text)}</li>`
          );
          i++;
        }
        blocks.push(`<ul class="md-task-list">${items.join('')}</ul>`);
        continue;
      }

      // 无序列表 - * +
      if (/^\s*[-*+]\s+/.test(line)) {
        const items = [];
        // 记录缩进级别用于嵌套
        while (i < lines.length && /^\s*([-*+]\s+)/.test(lines[i])) {
          const indent = lines[i].match(/^(\s*)/)[1].length;
          const text = lines[i].replace(/^\s*[-*+]\s+/, '');
          items.push({ indent, html: this._inline(text) });
          i++;
        }
        blocks.push(this._renderList(items, 'ul'));
        continue;
      }

      // 有序列表 1. 2. 3.
      if (/^\s*\d+\.\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          const indent = lines[i].match(/^(\s*)/)[1].length;
          const text = lines[i].replace(/^\s*\d+\.\s+/, '');
          items.push({ indent, html: this._inline(text) });
          i++;
        }
        blocks.push(this._renderList(items, 'ol'));
        continue;
      }

      // 表格 | col1 | col2 |
      if (/^\s*\|.+?\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
        const tableLines = [];
        tableLines.push(lines[i]); // header
        i++;
        tableLines.push(lines[i]); // separator
        i++;
        while (i < lines.length && /^\s*\|.+?\|/.test(lines[i])) {
          tableLines.push(lines[i]);
          i++;
        }
        blocks.push(this._renderTable(tableLines));
        continue;
      }

      // 代码块占位符（单独一行）
      const codeBlockMatch = line.match(/^\x00CODEBLOCK_(\d+)\x00$/);
      if (codeBlockMatch) {
        const idx = parseInt(codeBlockMatch[1], 10);
        blocks.push(this._renderCodeBlock(codeBlocks[idx]));
        i++;
        continue;
      }

      // 普通段落：连续非空行合并
      const paraLines = [];
      while (i < lines.length && !/^\s*$/.test(lines[i])
        && !/^(#{1,6})\s/.test(lines[i])
        && !/^\s*>\s?/.test(lines[i])
        && !/^\s*([-*+]\s|\d+\.\s)/.test(lines[i])
        && !/^\s*([-*_])\1{2,}\s*$/.test(lines[i])
        && !/^\s*\|.+?\|/.test(lines[i])
        && !/^\x00CODEBLOCK_\d+\x00$/.test(lines[i])
      ) {
        paraLines.push(lines[i]);
        i++;
      }

      if (paraLines.length) {
        const text = paraLines.join(' ');
        blocks.push(`<p>${this._inline(text)}</p>`);
      }
    }

    let html = blocks.join('\n');

    // 恢复行内代码
    html = html.replace(/\x00INLINECODE_(\d+)\x00/g, (_m, idx) => {
      const code = inlineCodes[parseInt(idx, 10)];
      return `<code class="md-inline-code">${this._escapeHtml(code)}</code>`;
    });

    // 恢复代码块（可能在段落中间被引用的情况）
    html = html.replace(/\x00CODEBLOCK_(\d+)\x00/g, (_m, idx) => {
      return this._renderCodeBlock(codeBlocks[parseInt(idx, 10)]);
    });

    return html;
  }

  /* ── 行内格式化 ──────────────────────────────────────────────── */

  /**
   * 处理行内格式：粗体、斜体、链接、删除线等
   * 输入已经是 HTML 转义后的文本
   */
  _inline(text) {
    let result = this._escapeHtml(text);

    // 图片 ![alt](url)
    result = result.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
      (_m, alt, url, title) => {
        const t = title ? ` title="${title}"` : '';
        return `<img src="${url}" alt="${alt}"${t} style="max-width:100%;border-radius:8px;">`;
      });

    // 链接 [text](url)
    result = result.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
      (_m, linkText, url, title) => {
        const t = title ? ` title="${title}"` : '';
        return `<a href="${url}"${t} target="_blank" rel="noopener">${linkText}</a>`;
      });

    // 粗体 **text** 或 __text__
    result = result.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // 斜体 *text* 或 _text_（不匹配已在粗体中的）
    result = result.replace(/(?<!\*)\*(?!\*)([^\*\n]+?)\*(?!\*)/g, '<em>$1</em>');
    result = result.replace(/(?<!_)_(?!_)([^_\n]+?)_(?!_)/g, '<em>$1</em>');

    // 删除线 ~~text~~
    result = result.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // 换行
    result = result.replace(/\n/g, '<br>');

    return result;
  }

  /* ── 特殊块渲染 ──────────────────────────────────────────────── */

  /** 渲染代码块（带语法高亮） */
  _renderCodeBlock({ lang, code }) {
    const escapedCode = this._escapeHtml(code);

    // 尝试使用 CodeViewer 高亮
    let highlighted = escapedCode;
    if (this.codeViewer && typeof this.codeViewer._highlight === 'function') {
      try {
        // CodeViewer._highlight 接收原始代码，内部会先 escape
        highlighted = this.codeViewer._highlight(code, lang);
      } catch (err) {
        console.warn('MarkdownViewer: 语法高亮失败，降级为纯文本', err);
        highlighted = escapedCode;
      }
    }

    const langLabel = lang && lang !== 'plaintext'
      ? `<div class="md-code-lang">${this._escapeHtml(lang)}</div>`
      : '';

    return `<div class="md-code-block">${langLabel}<pre><code class="language-${lang || 'plaintext'}">${highlighted}</code></pre></div>`;
  }

  /** 渲染列表（支持嵌套缩进） */
  _renderList(items, tag) {
    if (items.length === 0) return '';

    const html = [];
    const baseIndent = items[0].indent;

    // 简化版：暂不支持复杂嵌套，将所有同级合并
    // 嵌套通过缩进差判断
    let prevIndent = baseIndent;
    let inSubList = false;
    let subItems = [];

    for (const item of items) {
      if (item.indent > baseIndent) {
        inSubList = true;
        subItems.push(item);
      } else {
        if (inSubList) {
          html.push(this._renderList(subItems, 'ul'));
          subItems = [];
          inSubList = false;
        }
        html.push(`<li>${item.html}</li>`);
        prevIndent = item.indent;
      }
    }

    // 处理末尾子列表
    if (inSubList && subItems.length > 0) {
      html.push(this._renderList(subItems, 'ul'));
    }

    return `<${tag}>${html.join('')}</${tag}>`;
  }

  /** 渲染表格 */
  _renderTable(tableLines) {
    // 第一行是表头
    const parseRow = (line) => {
      return line
        .replace(/^\s*\|/, '')
        .replace(/\|\s*$/, '')
        .split('|')
        .map(cell => cell.trim());
    };

    // 第二行是分隔符，判断对齐方式
    const separators = parseRow(tableLines[1]);
    const aligns = separators.map(sep => {
      if (/^:/.test(sep) && /:$/.test(sep)) return 'center';
      if (/:$/.test(sep)) return 'right';
      return 'left';
    });

    // 表头
    const headers = parseRow(tableLines[0]);
    let html = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
    headers.forEach((h, ci) => {
      const align = aligns[ci] || 'left';
      html += `<th style="text-align:${align}">${this._inline(h)}</th>`;
    });
    html += '</tr></thead><tbody>';

    // 数据行
    for (let i = 2; i < tableLines.length; i++) {
      const cells = parseRow(tableLines[i]);
      html += '<tr>';
      cells.forEach((cell, ci) => {
        const align = aligns[ci] || 'left';
        html += `<td style="text-align:${align}">${this._inline(cell)}</td>`;
      });
      html += '</tr>';
    }

    html += '</tbody></table></div>';
    return html;
  }

  /* ── 模态面板 DOM ────────────────────────────────────────────── */

  _buildModal() {
    if (this.el) return;

    this.el = document.createElement('div');
    this.el.className = 'md-viewer-modal';
    this.el.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2000',
      'display:flex',
      'flex-direction:column',
      'background:var(--bg-primary, #0d1117)',
    ].join(';');

    // ── 工具栏 ──
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
    title.textContent = '📄 Markdown 预览';
    title.style.cssText = 'flex:1;font-size:15px;font-weight:600;color:var(--text-primary, #e6edf3);';
    toolbar.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = [
      'background:var(--error, #f85149)',
      'color:#fff',
      'border:none',
      'border-radius:6px',
      'padding:4px 12px',
      'font-size:16px',
      'cursor:pointer',
    ].join(';');
    closeBtn.addEventListener('click', () => this.close());
    toolbar.appendChild(closeBtn);

    this.el.appendChild(toolbar);

    // ── 内容区域 ──
    const scrollWrap = document.createElement('div');
    scrollWrap.style.cssText = [
      'flex:1',
      'overflow-y:auto',
      '-webkit-overflow-scrolling:touch',
      'padding:16px',
    ].join(';');

    this.contentEl = document.createElement('div');
    this.contentEl.className = 'md-content';
    scrollWrap.appendChild(this.contentEl);
    this.el.appendChild(scrollWrap);

    this.containerEl.appendChild(this.el);

    // 注入样式
    MarkdownViewer._injectStyles();
  }

  /* ── 工具方法 ────────────────────────────────────────────────── */

  /** HTML 转义 */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  /** 语言别名标准化 */
  _normalizeLang(lang) {
    if (!lang) return 'plaintext';
    const lower = lang.toLowerCase().trim();
    return LANG_ALIASES[lower] || lower;
  }

  /** 注入样式（一次性） */
  static _injectStyles() {
    if (document.getElementById('md-viewer-styles')) return;
    const style = document.createElement('style');
    style.id = 'md-viewer-styles';
    style.textContent = `
      /* Markdown 渲染样式 */
      .md-content {
        font-family: 'Inter', -apple-system, sans-serif;
        font-size: 14px;
        line-height: 1.7;
        color: var(--text-primary, #e6edf3);
      }
      .md-content > *:first-child { margin-top: 0; }
      .md-content > *:last-child { margin-bottom: 0; }

      /* 标题 */
      .md-content h1 { font-size: 24px; font-weight: 700; margin: 20px 0 12px; border-bottom: 1px solid var(--border, #30363d); padding-bottom: 6px; }
      .md-content h2 { font-size: 20px; font-weight: 700; margin: 18px 0 10px; border-bottom: 1px solid var(--border-muted, #21262d); padding-bottom: 4px; }
      .md-content h3 { font-size: 17px; font-weight: 600; margin: 16px 0 8px; }
      .md-content h4 { font-size: 15px; font-weight: 600; margin: 14px 0 6px; }
      .md-content h5 { font-size: 14px; font-weight: 600; margin: 12px 0 4px; color: var(--text-secondary, #7d8590); }
      .md-content h6 { font-size: 13px; font-weight: 600; margin: 10px 0 4px; color: var(--text-secondary, #7d8590); }

      /* 段落 */
      .md-content p { margin: 8px 0; }

      /* 粗体 / 斜体 / 删除线 */
      .md-content strong { font-weight: 700; color: var(--text-primary, #e6edf3); }
      .md-content em { font-style: italic; }
      .md-content del { text-decoration: line-through; color: var(--text-secondary, #7d8590); }

      /* 行内代码 */
      .md-inline-code {
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(110,118,129,.2);
        color: var(--accent, #2f81f7);
      }

      /* 代码块 */
      .md-code-block {
        position: relative;
        margin: 12px 0;
        border-radius: 8px;
        overflow: hidden;
        background: #1e1e1e;
        border: 1px solid var(--border, #30363d);
      }
      .md-code-lang {
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        padding: 4px 12px;
        background: #2d2d2d;
        color: var(--text-secondary, #7d8590);
        border-bottom: 1px solid var(--border, #30363d);
        text-transform: uppercase;
        letter-spacing: .5px;
      }
      .md-code-block pre {
        margin: 0;
        padding: 12px;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      .md-code-block code {
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
        line-height: 1.5;
        white-space: pre;
        color: #d4d4d4;
      }

      /* 列表 */
      .md-content ul, .md-content ol { margin: 8px 0; padding-left: 24px; }
      .md-content li { margin: 4px 0; }
      .md-content ul li::marker { color: var(--accent, #2f81f7); }

      /* 任务列表 */
      .md-task-list { list-style: none; padding-left: 8px; }
      .md-task { display: flex; align-items: flex-start; gap: 6px; }
      .md-task input[type="checkbox"] { margin-top: 3px; }
      .md-task-done { opacity: .5; text-decoration: line-through; }

      /* 引用块 */
      .md-content blockquote {
        margin: 10px 0;
        padding: 8px 14px;
        border-left: 3px solid var(--accent, #2f81f7);
        background: rgba(47,129,247,.08);
        color: var(--text-secondary, #7d8590);
        border-radius: 0 6px 6px 0;
      }

      /* 分隔线 */
      .md-content hr {
        border: none;
        border-top: 1px solid var(--border, #30363d);
        margin: 16px 0;
      }

      /* 链接 */
      .md-content a {
        color: var(--accent, #2f81f7);
        text-decoration: none;
      }
      .md-content a:hover { text-decoration: underline; }

      /* 表格 */
      .md-table-wrap {
        overflow-x: auto;
        margin: 10px 0;
        border-radius: 8px;
        border: 1px solid var(--border, #30363d);
      }
      .md-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      .md-table th, .md-table td {
        padding: 8px 12px;
        border: 1px solid var(--border, #30363d);
      }
      .md-table th {
        background: var(--bg-secondary, #161b22);
        font-weight: 600;
      }
      .md-table tbody tr:nth-child(even) {
        background: rgba(255,255,255,.02);
      }

      /* Chat 消息中的 Markdown */
      .msg-agent .md-content { font-size: 14px; }
      .msg-agent .md-code-block { margin: 8px 0; }
      .msg-agent h1 { font-size: 18px; }
      .msg-agent h2 { font-size: 16px; }
    `;
    document.head.appendChild(style);
  }
}

export default MarkdownViewer;
