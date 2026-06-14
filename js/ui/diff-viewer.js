/**
 * DiffViewer — 文件差异对比器
 * ====================================================
 * 对比两个版本的文件内容，基于 LCS（最长公共子序列）
 * 算法生成行级 diff，以可视化方式展示增、删、不变行。
 *
 * 颜色方案：
 *   - 添加行：绿色背景 + '+'
 *   - 删除行：红色背景 + '-'
 *   - 不变行：灰色（无背景）+ ' '
 *
 * 用法：
 *   import DiffViewer from './ui/diff-viewer.js';
 *   const dv = new DiffViewer({ container: document.body });
 *   dv.compare(oldCode, newCode, 'main.js'); // 显示差异面板
 *
 *   // 或只获取 diff 结果数据
 *   const diff = dv.computeDiff(oldLines, newLines);
 *   dv.renderInline(diff, containerEl); // 渲染到指定元素
 */

/* ── diff 行类型常量 ───────────────────────────────────────────────── */

const DIFF_ADDED = 'added';       // 新增行
const DIFF_REMOVED = 'removed';   // 删除行
const DIFF_EQUAL = 'equal';       // 不变行

class DiffViewer {
  /**
   * @param {object} options
   * @param {HTMLElement|string} [options.container] 容器（默认 document.body）
   */
  constructor({ container } = {}) {
    this.containerEl = typeof container === 'string'
      ? document.getElementById(container)
      : (container || document.body);

    this._visible = false;
    this._stats = { added: 0, removed: 0, unchanged: 0 };
  }

  /* ── 公开 API ────────────────────────────────────────────────── */

  /**
   * 对比两段内容并显示差异面板
   * @param {string} oldContent  旧版本内容
   * @param {string} newContent  新版本内容
   * @param {string} filename    文件名（用于标题显示）
   */
  compare(oldContent, newContent, filename = 'untitled') {
    try {
      const oldLines = this._splitLines(oldContent);
      const newLines = this._splitLines(newContent);
      const diff = this.computeDiff(oldLines, newLines);

      this._buildModal(filename, diff);
      this._visible = true;
      this.el.style.display = 'flex';

      return diff;
    } catch (err) {
      console.error('DiffViewer.compare 出错:', err);
      return [];
    }
  }

  /** 关闭差异面板 */
  close() {
    this._visible = false;
    if (this.el) this.el.style.display = 'none';
  }

  /**
   * 渲染 diff 到指定容器元素（内联模式，不弹出模态）
   * @param {Array} diff     computeDiff() 的返回值
   * @param {HTMLElement} target  目标容器
   */
  renderInline(diff, target) {
    if (!target) return;
    DiffViewer._injectStyles();
    target.innerHTML = '';
    target.appendChild(this._createDiffContent(diff));
  }

  /* ── LCS Diff 算法 ───────────────────────────────────────────── */

  /**
   * 将文本分割为行数组（保留空行）
   * @param {string} content
   * @returns {string[]}
   */
  _splitLines(content) {
    if (!content) return [];
    // 移除末尾多余换行，然后分割
    return content.replace(/\n$/, '').split('\n');
  }

  /**
   * 基于 LCS 的行级 diff 算法
   *
   * 算法流程：
   *   1. 构建 LCS DP 表（O(n*m) 时间和空间）
   *   2. 回溯 DP 表生成 diff 序列
   *
   * @param {string[]} oldLines  旧行数组
   * @param {string[]} newLines  新行数组
   * @returns {Array<{type: string, content: string, oldLine?: number, newLine?: number}>}
   */
  computeDiff(oldLines, newLines) {
    const n = oldLines.length;
    const m = newLines.length;

    // 特殊情况：一边为空
    if (n === 0 && m === 0) return [];
    if (n === 0) {
      return newLines.map((line, i) => ({
        type: DIFF_ADDED, content: line, newLine: i + 1,
      }));
    }
    if (m === 0) {
      return oldLines.map((line, i) => ({
        type: DIFF_REMOVED, content: line, oldLine: i + 1,
      }));
    }

    // ── Step 1: 构建 LCS DP 表 ──
    // dp[i][j] = oldLines[0..i-1] 和 newLines[0..j-1] 的 LCS 长度
    const dp = this._buildLCS(oldLines, newLines);

    // ── Step 2: 回溯生成 diff ──
    const diff = [];
    let i = n, j = m;

    while (i > 0 && j > 0) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        // 相同行 → equal
        diff.unshift({
          type: DIFF_EQUAL,
          content: oldLines[i - 1],
          oldLine: i,
          newLine: j,
        });
        i--;
        j--;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        // 来自上方 → old 行被删除
        diff.unshift({
          type: DIFF_REMOVED,
          content: oldLines[i - 1],
          oldLine: i,
        });
        i--;
      } else {
        // 来自左方 → new 行被添加
        diff.unshift({
          type: DIFF_ADDED,
          content: newLines[j - 1],
          newLine: j,
        });
        j--;
      }
    }

    // 处理剩余行
    while (i > 0) {
      diff.unshift({
        type: DIFF_REMOVED,
        content: oldLines[i - 1],
        oldLine: i,
      });
      i--;
    }
    while (j > 0) {
      diff.unshift({
        type: DIFF_ADDED,
        content: newLines[j - 1],
        newLine: j,
      });
      j--;
    }

    return diff;
  }

  /**
   * 构建 LCS DP 表
   * 使用行哈希优化比较速度
   */
  _buildLCS(oldLines, newLines) {
    const n = oldLines.length;
    const m = newLines.length;

    // 初始化 DP 表（全 0）
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        if (oldLines[i - 1] === newLines[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    return dp;
  }

  /**
   * 计算 diff 统计信息
   * @param {Array} diff  computeDiff() 结果
   * @returns {{added: number, removed: number, unchanged: number}}
   */
  _computeStats(diff) {
    const stats = { added: 0, removed: 0, unchanged: 0 };
    for (const item of diff) {
      if (item.type === DIFF_ADDED) stats.added++;
      else if (item.type === DIFF_REMOVED) stats.removed++;
      else stats.unchanged++;
    }
    return stats;
  }

  /* ── 模态面板 DOM ────────────────────────────────────────────── */

  /**
   * 构建差异面板
   * @param {string} filename  文件名
   * @param {Array} diff      diff 数据
   */
  _buildModal(filename, diff) {
    this._stats = this._computeStats(diff);

    // 如果已存在则更新内容
    if (this.el) {
      this.statsEl.innerHTML = this._statsHTML();
      this.diffContentEl.innerHTML = '';
      this.diffContentEl.appendChild(this._createDiffContent(diff));
      return;
    }

    // ── 根容器 ──
    this.el = document.createElement('div');
    this.el.className = 'diff-viewer-modal';
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

    // 文件名标题
    const titleEl = document.createElement('span');
    titleEl.textContent = '🔄 ' + filename;
    titleEl.style.cssText = 'flex:1;font-size:14px;font-weight:600;color:var(--text-primary, #e6edf3);font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    toolbar.appendChild(titleEl);

    // 统计信息
    this.statsEl = document.createElement('div');
    this.statsEl.style.cssText = 'display:flex;gap:6px;font-size:12px;font-family:monospace;';
    this.statsEl.innerHTML = this._statsHTML();
    toolbar.appendChild(this.statsEl);

    // 关闭按钮
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
      'margin-left:8px',
    ].join(';');
    closeBtn.addEventListener('click', () => this.close());
    toolbar.appendChild(closeBtn);

    this.el.appendChild(toolbar);

    // ── diff 内容滚动区 ──
    const scrollWrap = document.createElement('div');
    scrollWrap.style.cssText = [
      'flex:1',
      'overflow:auto',
      '-webkit-overflow-scrolling:touch',
    ].join(';');

    this.diffContentEl = document.createElement('div');
    this.diffContentEl.className = 'diff-content';
    this.diffContentEl.appendChild(this._createDiffContent(diff));

    scrollWrap.appendChild(this.diffContentEl);
    this.el.appendChild(scrollWrap);

    this.containerEl.appendChild(this.el);

    // 注入样式
    DiffViewer._injectStyles();
  }

  /** 生成统计信息 HTML */
  _statsHTML() {
    return [
      `<span style="color:#3fb950;">+${this._stats.added}</span>`,
      `<span style="color:#f85149;">-${this._stats.removed}</span>`,
      `<span style="color:var(--text-secondary, #7d8590);">${this._stats.unchanged} unchanged</span>`,
    ].join('');
  }

  /**
   * 创建 diff 内容 DOM
   * 采用双列布局：行号 | 内容，每行带类型颜色
   */
  _createDiffContent(diff) {
    const container = document.createElement('div');
    container.className = 'diff-lines';

    // 表头
    const header = document.createElement('div');
    header.className = 'diff-row diff-header';
    header.innerHTML =
      '<span class="diff-sign"></span>' +
      '<span class="diff-lineno">old / new</span>' +
      '<span class="diff-text">content</span>';
    container.appendChild(header);

    if (diff.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:40px;text-align:center;color:var(--text-secondary, #7d8590);font-size:14px;';
      empty.textContent = '✅ 无差异';
      container.appendChild(empty);
      return container;
    }

    // 逐行渲染
    let oldLineNum = 0;
    let newLineNum = 0;

    for (const item of diff) {
      const row = document.createElement('div');
      row.className = `diff-row diff-${item.type}`;

      // 符号列
      const sign = document.createElement('span');
      sign.className = 'diff-sign';
      sign.textContent = item.type === DIFF_ADDED ? '+' : item.type === DIFF_REMOVED ? '-' : ' ';
      row.appendChild(sign);

      // 行号列
      const lineno = document.createElement('span');
      lineno.className = 'diff-lineno';
      if (item.type === DIFF_EQUAL) {
        oldLineNum++;
        newLineNum++;
        lineno.textContent = `${oldLineNum} / ${newLineNum}`;
      } else if (item.type === DIFF_REMOVED) {
        oldLineNum++;
        lineno.textContent = `${oldLineNum} / -`;
      } else {
        newLineNum++;
        lineno.textContent = `- / ${newLineNum}`;
      }
      row.appendChild(lineno);

      // 内容列（使用 textContent 防注入）
      const text = document.createElement('span');
      text.className = 'diff-text';
      text.textContent = item.content || ' '; // 空行至少占一个空格高度
      row.appendChild(text);

      container.appendChild(row);
    }

    return container;
  }

  /* ── 静态方法 ────────────────────────────────────────────────── */

  /** 注入样式（一次性） */
  static _injectStyles() {
    if (document.getElementById('diff-viewer-styles')) return;
    const style = document.createElement('style');
    style.id = 'diff-viewer-styles';
    style.textContent = `
      .diff-content {
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
      }

      .diff-row {
        display: flex;
        align-items: flex-start;
        min-height: 20px;
        line-height: 1.5;
      }

      /* 表头 */
      .diff-header {
        position: sticky;
        top: 0;
        z-index: 1;
        background: var(--bg-secondary, #161b22);
        border-bottom: 1px solid var(--border, #30363d);
        font-weight: 600;
        color: var(--text-secondary, #7d8590);
        font-size: 11px;
        padding: 4px 0;
      }

      /* 符号列 */
      .diff-sign {
        flex-shrink: 0;
        width: 20px;
        text-align: center;
        font-weight: 700;
        user-select: none;
        -webkit-user-select: none;
      }

      /* 行号列 */
      .diff-lineno {
        flex-shrink: 0;
        width: 80px;
        padding-right: 8px;
        text-align: right;
        color: var(--text-tertiary, #484f58);
        user-select: none;
        -webkit-user-select: none;
        border-right: 1px solid var(--border-muted, #21262d);
        margin-right: 8px;
        font-size: 10px;
        padding-top: 1px;
      }

      /* 内容列 */
      .diff-text {
        flex: 1;
        white-space: pre-wrap;
        word-break: break-all;
        padding-right: 12px;
      }

      /* 添加行 — 绿色 */
      .diff-added {
        background: rgba(63, 185, 80, .12);
      }
      .diff-added .diff-sign {
        color: #3fb950;
      }
      .diff-added .diff-text {
        color: #3fb950;
      }

      /* 删除行 — 红色 */
      .diff-removed {
        background: rgba(248, 81, 73, .12);
      }
      .diff-removed .diff-sign {
        color: #f85149;
      }
      .diff-removed .diff-text {
        color: #f85149;
      }

      /* 不变行 — 灰色 */
      .diff-equal .diff-sign,
      .diff-equal .diff-text {
        color: var(--text-secondary, #7d8590);
      }
      .diff-equal:hover {
        background: rgba(255, 255, 255, .03);
      }

      /* 头部列 */
      .diff-header .diff-sign,
      .diff-header .diff-lineno,
      .diff-header .diff-text {
        color: var(--text-secondary, #7d8590);
      }
    `;
    document.head.appendChild(style);
  }
}

export default DiffViewer;
