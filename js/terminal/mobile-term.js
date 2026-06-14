/**
 * MobileTerminal — Simulated terminal emulator for Codex Mobile
 * ------------------------------------------------------------------
 * Provides a lightweight, self-contained shell-like environment that
 * runs entirely in the browser / WebView.  All commands are simulated;
 * no real process is spawned.
 *
 * Dependencies:
 *   - A FileManager instance (passed to the constructor) for file ops.
 *
 * Usage:
 *   import { MobileTerminal } from './terminal/mobile-term.js';
 *   const term = new MobileTerminal({ container: 'terminal-root', fileManager: fm });
 *   term.appendCommand('help');
 */
export class MobileTerminal {

  /* ------------------------------------------------------------------ *
   *  Constructor & init
   * ------------------------------------------------------------------ */

  constructor({ container, fileManager }) {
    this.fileManager = fileManager || null;

    // Resolve container element (accept id-string or HTMLElement)
    this.containerEl = typeof container === 'string'
      ? document.getElementById(container)
      : container;
    if (!this.containerEl) {
      throw new Error('MobileTerminal: container element not found');
    }

    // State
    this.cwd          = '/';          // simulated current working directory
    this.history      = [];           // command history
    this.historyIndex = -1;           // navigation pointer
    this.maxHistory   = 50;
    this.user         = 'codex';
    this.host         = 'android';

    // Build DOM
    this._buildDOM();
    this._attachListeners();

    // Welcome banner
    this.print(
      'Codex Mobile Terminal v1.0\nType \'help\' for commands.',
      'system'
    );
    this._renderPrompt();
  }

  /* ------------------------------------------------------------------ *
   *  DOM construction
   * ------------------------------------------------------------------ */

  _buildDOM() {
    // Root wrapper
    this.el = document.createElement('div');
    this.el.className = 'mt-root';
    this.el.style.cssText = [
      'display:flex',
      'flex-direction:column',
      'height:100%',
      'width:100%',
      'background:#0c0c0c',
      'color:#e0e0e0',
      'font-family:"Cascadia Code","Fira Code","Courier New",monospace',
      'font-size:13px',
      'line-height:1.5',
      'overflow:hidden',
      'user-select:text',
      '-webkit-user-select:text',
    ].join(';');

    // Output scroll area
    this.outputEl = document.createElement('div');
    this.outputEl.className = 'mt-output';
    this.outputEl.style.cssText = [
      'flex:1',
      'overflow-y:auto',
      'overflow-x:hidden',
      'padding:8px',
      'word-break:break-word',
      'white-space:pre-wrap',
    ].join(';');

    // Input row
    this.inputRow = document.createElement('div');
    this.inputRow.className = 'mt-input-row';
    this.inputRow.style.cssText = [
      'display:flex',
      'align-items:center',
      'padding:4px 8px',
      'border-top:1px solid #333',
      'flex-shrink:0',
      'background:#111',
    ].join(';');

    // Prompt span
    this.promptSpan = document.createElement('span');
    this.promptSpan.className = 'mt-prompt';
    this.promptSpan.style.cssText = 'color:#4ecca3;margin-right:6px;white-space:nowrap;';

    // Input field
    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.className = 'mt-input';
    this.inputEl.style.cssText = [
      'flex:1',
      'background:transparent',
      'border:none',
      'outline:none',
      'color:#e0e0e0',
      'font-family:inherit',
      'font-size:inherit',
      'caret-color:#4ecca3',
    ].join(';');
    this.inputEl.setAttribute('autocomplete', 'off');
    this.inputEl.setAttribute('autocapitalize', 'off');
    this.inputEl.setAttribute('autocorrect', 'off');
    this.inputEl.setAttribute('spellcheck', 'false');

    this.inputRow.appendChild(this.promptSpan);
    this.inputRow.appendChild(this.inputEl);

    this.el.appendChild(this.outputEl);
    this.el.appendChild(this.inputRow);

    this.containerEl.appendChild(this.el);

    this._updatePromptText();
  }

  /* ------------------------------------------------------------------ *
   *  Event listeners
   * ------------------------------------------------------------------ */

  _attachListeners() {
    // Enter submits, Arrow keys navigate history
    this.inputEl.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          this._submit();
          break;
        case 'ArrowUp':
          e.preventDefault();
          this._navigateHistory(-1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this._navigateHistory(1);
          break;
        case 'l':
          if (e.ctrlKey) {
            e.preventDefault();
            this.clear();
          }
          break;
      }
    });

    // Tap anywhere in the terminal focuses the input
    this.el.addEventListener('click', () => {
      if (document.activeElement !== this.inputEl) {
        this.inputEl.focus();
      }
    });
  }

  /* ------------------------------------------------------------------ *
   *  Prompt helpers
   * ------------------------------------------------------------------ */

  _updatePromptText() {
    this.promptSpan.textContent = `${this.user}@${this.host}:${this.cwd}$`;
  }

  _renderPrompt(text = '') {
    const line = document.createElement('div');
    line.style.cssText = 'margin-top:4px;';
    line.innerHTML =
      `<span style="color:#4ecca3;">${this.user}@${this.host}:${this.cwd}</span>` +
      `<span style="color:#e0e0e0;">$</span> ` +
      this._escapeHtml(text);
    this.outputEl.appendChild(line);
    this._scrollToBottom();
  }

  /* ------------------------------------------------------------------ *
   *  Public API
   * ------------------------------------------------------------------ */

  /**
   * Append a message to the terminal output.
   * @param {string} text  — content to display
   * @param {string} [type='stdout'] — 'stdout'|'stderr'|'system'|'success'|'error'
   */
  print(text, type = 'stdout') {
    const line = document.createElement('div');
    line.className = `mt-line mt-${type}`;
    line.style.cssText = 'white-space:pre-wrap;word-break:break-word;';
    line.textContent = text;                           // safe by default
    this.outputEl.appendChild(line);
    this._scrollToBottom();
    return line;
  }

  /** Clear all output. */
  clear() {
    this.outputEl.innerHTML = '';
  }

  /**
   * Add a command to history, echo it, and execute it.
   * @param {string} cmd — raw command string
   */
  appendCommand(cmd) {
    cmd = (cmd || '').trim();
    if (!cmd) {
      this._renderPrompt('');
      return;
    }

    // Show the prompt + typed command
    this._renderPrompt(cmd);

    // Store in history (avoid consecutive duplicates)
    if (this.history[this.history.length - 1] !== cmd) {
      this.history.push(cmd);
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
    }
    this.historyIndex = this.history.length;  // reset pointer to "after last"

    // Execute
    this._execute(cmd);
  }

  /** Focus the terminal input. */
  focus() {
    this.inputEl.focus();
  }

  /** Destroy the terminal and free DOM listeners (best-effort). */
  destroy() {
    this.el.remove();
  }

  /* ------------------------------------------------------------------ *
   *  Internal: submit, history, execute
   * ------------------------------------------------------------------ */

  _submit() {
    const cmd = this.inputEl.value;
    this.inputEl.value = '';
    this.appendCommand(cmd);
  }

  _navigateHistory(dir) {
    if (this.history.length === 0) return;

    this.historyIndex += dir;

    if (this.historyIndex < 0) {
      this.historyIndex = 0;
    } else if (this.historyIndex >= this.history.length) {
      this.historyIndex = this.history.length;
      this.inputEl.value = '';
      return;
    }
    this.inputEl.value = this.history[this.historyIndex] || '';
  }

  async _execute(cmd) {
    // Split into program + args (respect simple quotes)
    const parts  = this._tokenize(cmd);
    const program = parts[0];
    const args    = parts.slice(1);

    try {
      switch (program) {
        case 'help':    this._cmdHelp(); break;
        case 'ls':      this._cmdLs(args); break;
        case 'cat':     this._cmdCat(args); break;
        case 'pwd':     this.print(this.cwd, 'stdout'); break;
        case 'cd':      this._cmdCd(args); break;
        case 'echo':    this.print(args.join(' '), 'stdout'); break;
        case 'clear':   this.clear(); break;
        case 'date':    this.print(new Date().toString(), 'stdout'); break;
        case 'whoami':  this.print(this.user, 'stdout'); break;
        case 'mkdir':   this._cmdMkdir(args); break;
        case 'touch':   this._cmdTouch(args); break;
        case 'rm':      this._cmdRm(args); break;
        case 'grep':    this._cmdGrep(args); break;
        case 'find':    this._cmdFind(args); break;
        case 'history': this._cmdHistory(); break;
        case 'python':  this._cmdSimExec('python', args); break;
        case 'swift':   this._cmdSimExec('swift', args); break;
        case 'node':    this._cmdSimExec('node', args); break;
        case 'git':     this._cmdGit(args); break;
        default:
          this.print(`command not found: ${program}`, 'error');
      }
    } catch (err) {
      this.print(String(err && err.message || err), 'error');
    }
  }

  /* ------------------------------------------------------------------ *
   *  Command implementations
   * ------------------------------------------------------------------ */

  _cmdHelp() {
    const commands = [
      ['help',              'Show this help message'],
      ['ls [path]',         'List files in directory'],
      ['cat <file>',        'Display file contents'],
      ['pwd',               'Print current directory'],
      ['cd <path>',         'Change directory'],
      ['echo <text>',       'Print text'],
      ['clear',             'Clear the terminal'],
      ['date',              'Show current date and time'],
      ['whoami',            'Show current user'],
      ['mkdir <name>',      'Create a new folder'],
      ['touch <name>',      'Create an empty file'],
      ['rm <file>',         'Delete a file'],
      ['grep <pattern> <f>','Search for pattern in a file'],
      ['find <pattern>',    'Search across all files'],
      ['history',           'Show command history'],
      ['python -c "...',    'Simulate Python execution'],
      ['swift -c "...',     'Simulate Swift execution'],
      ['node -e "...',      'Simulate Node.js execution'],
      ['git status',        'Show simulated git status'],
      ['git log',           'Show simulated git log'],
    ];
    const padWidth = Math.max(...commands.map(c => c[0].length));
    const body = commands
      .map(([cmd, desc]) => `  ${cmd.padEnd(padWidth)}  ${desc}`)
      .join('\n');
    this.print('Available commands:\n' + body, 'system');
  }

  _cmdLs(args) {
    const targetPath = args[0]
      ? this._resolvePath(args[0])
      : this.cwd;

    let entries;
    if (this.fileManager && typeof this.fileManager.listFiles === 'function') {
      entries = this.fileManager.listFiles(targetPath);
    } else {
      entries = [];
    }

    if (!entries || entries.length === 0) {
      this.print('(empty)', 'system');
      return;
    }

    // Normalise to {name, isDir}
    const items = entries.map(e => {
      if (typeof e === 'string') return { name: e, isDir: false };
      return { name: e.name || e.path || String(e), isDir: !!e.isDirectory || !!e.isDir };
    });

    const out = items.map(i => {
      return i.isDir ? `${i.name}/` : i.name;
    }).join('   ');
    this.print(out, 'stdout');
  }

  _cmdCat(args) {
    if (!args[0]) {
      this.print('cat: missing file operand', 'stderr');
      return;
    }
    const filePath = this._resolvePath(args[0]);
    let content;
    if (this.fileManager && typeof this.fileManager.readFile === 'function') {
      content = this.fileManager.readFile(filePath);
    }
    if (content == null) {
      this.print(`cat: ${args[0]}: No such file or directory`, 'stderr');
      return;
    }
    this.print(content, 'stdout');
  }

  _cmdCd(args) {
    if (!args[0] || args[0] === '~') {
      this.cwd = '/';
      this._updatePromptText();
      return;
    }
    const target = this._resolvePath(args[0]);
    // We don't have a real FS — accept any path that looks valid
    this.cwd = target;
    this._updatePromptText();
  }

  _cmdMkdir(args) {
    if (!args[0]) {
      this.print('mkdir: missing operand', 'stderr');
      return;
    }
    if (this.fileManager && typeof this.fileManager.createDir === 'function') {
      try {
        this.fileManager.createDir(this._resolvePath(args[0]));
        this.print(`Created directory: ${args[0]}`, 'success');
      } catch {
        this.print(`mkdir: cannot create directory '${args[0]}'`, 'error');
      }
    } else {
      this.print(`(simulated) Created directory: ${args[0]}`, 'success');
    }
  }

  _cmdTouch(args) {
    if (!args[0]) {
      this.print('touch: missing operand', 'stderr');
      return;
    }
    const filePath = this._resolvePath(args[0]);
    if (this.fileManager && typeof this.fileManager.writeFile === 'function') {
      try {
        this.fileManager.writeFile(filePath, '');
        this.print(`Created file: ${args[0]}`, 'success');
      } catch {
        this.print(`touch: cannot create file '${args[0]}'`, 'error');
      }
    } else {
      this.print(`(simulated) Created file: ${args[0]}`, 'success');
    }
  }

  _cmdRm(args) {
    if (!args[0]) {
      this.print('rm: missing operand', 'stderr');
      return;
    }
    // Ignore common flags like -f or -r
    const fileName = args.filter(a => !a.startsWith('-'))[0];
    if (!fileName) {
      this.print('rm: missing operand', 'stderr');
      return;
    }
    const filePath = this._resolvePath(fileName);
    if (this.fileManager && typeof this.fileManager.deleteFile === 'function') {
      const ok = this.fileManager.deleteFile(filePath);
      if (ok) {
        this.print(`Removed: ${fileName}`, 'success');
      } else {
        this.print(`rm: cannot remove '${fileName}': No such file or directory`, 'error');
      }
    } else {
      this.print(`(simulated) Removed: ${fileName}`, 'success');
    }
  }

  _cmdGrep(args) {
    if (args.length < 2) {
      this.print('grep: usage: grep <pattern> <file>', 'stderr');
      return;
    }
    const pattern = args[0];
    const fileName = args.slice(1).join(' ');
    const filePath = this._resolvePath(fileName);

    let content;
    if (this.fileManager && typeof this.fileManager.readFile === 'function') {
      content = this.fileManager.readFile(filePath);
    }
    if (content == null) {
      this.print(`grep: ${fileName}: No such file or directory`, 'stderr');
      return;
    }

    const lines = content.split('\n');
    const regex = this._safeRegex(pattern);
    let matched = 0;
    lines.forEach((line, idx) => {
      if (regex && regex.test(line)) {
        this.print(`${idx + 1}: ${line}`, 'stdout');
        matched++;
      }
    });
    if (matched === 0) {
      this.print('(no matches)', 'system');
    }
  }

  _cmdFind(args) {
    if (!args[0]) {
      this.print('find: usage: find <pattern>', 'stderr');
      return;
    }
    const pattern = args[0];
    let results;
    if (this.fileManager && typeof this.fileManager.searchFiles === 'function') {
      results = this.fileManager.searchFiles(pattern);
    }
    if (!results || results.length === 0) {
      this.print('(no results)', 'system');
      return;
    }
    const out = results.map(r => {
      if (typeof r === 'string') return r;
      return r.path || r.name || JSON.stringify(r);
    }).join('\n');
    this.print(out, 'stdout');
  }

  _cmdHistory() {
    if (this.history.length === 0) {
      this.print('(empty)', 'system');
      return;
    }
    const body = this.history
      .map((cmd, i) => `  ${(i + 1).toString().padStart(3, ' ')}  ${cmd}`)
      .join('\n');
    this.print(body, 'system');
  }

  /* ----- Simulated code execution ----- */

  _cmdSimExec(lang, args) {
    // Accept  -c "...", -c "...", or -e "..."  (node)
    const supportedFlags = ['-c', '-e', '--eval'];
    const flagIdx = args.findIndex(a => supportedFlags.includes(a));
    let code = '';

    if (flagIdx !== -1 && args[flagIdx + 1] !== undefined) {
      code = args[flagIdx + 1];
    } else {
      // Everything after any non-flag args is treated as inline code
      code = args.filter(a => !supportedFlags.includes(a)).join(' ');
    }

    // Strip surrounding quotes if present
    if (code.length >= 2 && code[0] === code[code.length - 1] && (code[0] === '"' || code[0] === '\'')) {
      code = code.slice(1, -1);
    }

    if (!code.trim()) {
      this.print(`${lang}: no code provided`, 'stderr');
      return;
    }

    const langName = { python: 'Python 3.11', swift: 'Swift 5.9', node: 'Node.js v20' }[lang] || lang;

    // Very simple "simulation" — try to evaluate print/console.log
    const simOutput = this._simulateOutput(lang, code);

    this.print(
      `[${langName} — simulated]\n${simOutput}`,
      'stdout'
    );
  }

  _simulateOutput(lang, code) {
    // Try to extract a print() / console.log() / print() literal argument
    const patterns = [
      /console\.log\s*\(\s*(['"`])(.*?)\1/g,   // JS
      /print\s*\(\s*(['"`])(.*?)\1/g,           // Python / Swift
    ];

    const captures = [];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(code)) !== null) {
        captures.push(m[2]);
      }
    }
    if (captures.length) {
      return captures.join('\n');
    }

    // Fallback: echo a compact representation
    const preview = code.length > 60 ? code.slice(0, 57) + '...' : code;
    return `> ${preview}\n(simulated execution — no real interpreter)`;
  }

  /* ----- Simulated git ----- */

  _cmdGit(args) {
    const sub = args[0];
    switch (sub) {
      case 'status':
        this.print(
          'On branch main\n' +
          'Your branch is up to date with \'origin/main\'.\n\n' +
          'Changes not staged for commit:\n' +
          '  (use "git add <file>..." to update what will be committed)\n' +
          '  (use "git restore <file>..." to discard changes)\n' +
          '\tmodified:   src/main.swift\n' +
          '\tmodified:   README.md\n\n' +
          'no changes added to commit (use "git add")',
          'stdout'
        );
        break;
      case 'log':
        this.print(
          'commit a1b2c3d4e5f6789012345678 (HEAD -> main)\n' +
          'Author: codex <codex@android.local>\n' +
          'Date:   ' + new Date().toDateString() + '\n\n' +
          '    Initial commit\n\n' +
          'commit 0987654321fedcba (origin/main)\n' +
          'Author: codex <codex@android.local>\n' +
          'Date:   ' + new Date(Date.now() - 86400000).toDateString() + '\n\n' +
          '    Bootstrap project structure',
          'stdout'
        );
        break;
      case undefined:
        this.print('git: usage: git <command> [args]\nSupported: status, log', 'stderr');
        break;
      default:
        this.print(`git: '${sub}' is not supported (try: status, log)`, 'stderr');
    }
  }

  /* ------------------------------------------------------------------ *
   *  Utility helpers
   * ------------------------------------------------------------------ */

  /** Resolve a possibly-relative path against cwd. */
  _resolvePath(p) {
    if (!p) return this.cwd;
    if (p === '.')  return this.cwd;
    if (p === '..') {
      const parts = this.cwd.split('/').filter(Boolean);
      parts.pop();
      return '/' + parts.join('/');
    }
    if (p.startsWith('/')) return p;                // absolute
    if (p.startsWith('./')) p = p.slice(2);
    return this._normalizePath(this.cwd + (this.cwd.endsWith('/') ? '' : '/') + p);
  }

  _normalizePath(p) {
    const parts = [];
    for (const seg of p.split('/')) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    return '/' + parts.join('/');
  }

  /** Compile a user-supplied pattern into a RegExp, safely. */
  _safeRegex(pattern) {
    try {
      return new RegExp(pattern);
    } catch {
      // Fall back to literal string match
      return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    }
  }

  /** Tokenise a command string respecting double-quotes. */
  _tokenize(cmd) {
    const tokens = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < cmd.length; i++) {
      const ch = cmd[i];

      if (inQuote) {
        if (ch === quoteChar) {
          inQuote = false;
        } else {
          current += ch;
        }
        continue;
      }

      if (ch === '"' || ch === '\'') {
        inQuote = true;
        quoteChar = ch;
        continue;
      }

      if (ch === ' ' || ch === '\t') {
        if (current) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += ch;
      }
    }
    if (current) tokens.push(current);
    return tokens;
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  _scrollToBottom() {
    // Defer to next tick to ensure DOM is painted
    requestAnimationFrame(() => {
      this.outputEl.scrollTop = this.outputEl.scrollHeight;
    });
  }
}

export default MobileTerminal;
