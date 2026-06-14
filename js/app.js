/**
 * Codex Mobile — Main Application Controller
 * Orchestrates all modules: Agent, Files, Terminal, Analysis, Settings
 */

import { AgentLoop } from './agent/loop.js';
import { GLMClient } from './api/glm.js';
import { FileManager } from './files/file-manager.js';
import { MobileTerminal } from './terminal/mobile-term.js';
import { CodeViewer } from './editor/code-viewer.js';
import { CodexAnalysis } from './analysis/reverse.js';
import { GestureManager } from './ui/gestures.js';
import { AndroidFeatures } from './ui/android-features.js';

class CodexApp {
  constructor() {
    this.settings = this._loadSettings();
    this.glm = null;
    this.agentLoop = null;
    this.fileManager = null;
    this.terminal = null;
    this.codeViewer = null;
    this.analysis = null;
    this.currentView = 'chat';
    this.isRunning = false;
    this.chatHistory = [];
  }

  // ═══════════════════════════════════════════════════════════════
  async init() {
    // Apply theme
    document.documentElement.setAttribute('data-theme', this.settings.theme);

    // Init modules
    this.fileManager = new FileManager();
    await this.fileManager.init();

    // Init GLM client
    this.glm = new GLMClient({
      apiKey: this.settings.apiKey,
      model: this.settings.model,
      temperature: this.settings.temperature,
    });

    // Init Agent Loop
    this.agentLoop = new AgentLoop({
      apiKey: this.settings.apiKey,
      model: this.settings.model,
      maxIterations: this.settings.maxIterations,
      approvalMode: this.settings.approvalMode,
      temperature: this.settings.temperature,
      onReasoning: (text) => this._showReasoning(text),
      onReasoningChunk: (chunk) => this._appendReasoningChunk(chunk),
      onContentChunk: (chunk) => this._appendContentChunk(chunk),
      onToolCall: (tool, args) => this._showToolCall(tool, args),
      onToolResult: (tool, result) => this._showToolResult(tool, result),
      onMessage: (text) => this._showAgentMessage(text),
      onApproval: (tool, args) => this._requestApproval(tool, args),
      onDone: (result) => this._onAgentDone(result),
    });

    // Init Terminal
    this.terminal = new MobileTerminal({
      container: 'terminal-output',
      fileManager: this.fileManager,
    });

    // Wire up terminal input
    const termInput = document.getElementById('terminal-input');
    termInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = termInput.value;
        termInput.value = '';
        this.terminal.appendCommand(cmd);
      }
    });

    // Init Code Viewer
    this.codeViewer = new CodeViewer({
      container: 'code-viewer',
      fileManager: this.fileManager,
    });

    // Init Codex Analysis
    this.analysis = new CodexAnalysis();
    this.analysis.renderAll();

    // Init Android Features (Wake Lock, Vibration, Web Share, etc.)
    this.android = new AndroidFeatures();

    // Init Gesture Manager (swipe tabs, pull-refresh, long-press)
    this.gestures = new GestureManager({ app: this });
    this.gestures.enable();

    // Setup online/offline indicator
    this.android.onStatusChange((online) => {
      this._toast(online ? '🌐 已连接网络' : '📴 网络已断开', online ? 'success' : 'error');
    });

    // Setup UI
    this._setupNavigation();
    this._setupSettings();
    this._setupChat();
    this._setupFiles();
    this._renderFileList();

    // Load model badge
    document.getElementById('model-badge').textContent = this.settings.model;

    console.log('✅ Codex Mobile initialized');
  }

  // ═══════════════════════════════════════════════════════════════
  // Settings
  // ═══════════════════════════════════════════════════════════════
  _loadSettings() {
    const saved = localStorage.getItem('codex-mobile-settings');
    const defaults = {
      apiKey: '',
      model: 'glm-4-plus',
      temperature: 0.7,
      maxIterations: 25,
      approvalMode: 'suggest',
      theme: 'dark',
      projectDir: '/workspace',
    };
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  }

  _saveSettings() {
    localStorage.setItem('codex-mobile-settings', JSON.stringify(this.settings));
  }

  _setupSettings() {
    const overlay = document.getElementById('sheet-overlay');
    const sheet = document.getElementById('settings-sheet');
    const btnSettings = document.getElementById('btn-settings');

    // Open
    btnSettings.addEventListener('click', () => {
      // Populate
      document.getElementById('setting-api-key').value = this.settings.apiKey;
      document.getElementById('setting-model').value = this.settings.model;
      document.getElementById('setting-temp').value = this.settings.temperature;
      document.getElementById('temp-val').textContent = this.settings.temperature;
      document.getElementById('setting-max-iter').value = this.settings.maxIterations;
      document.getElementById('max-iter-val').textContent = this.settings.maxIterations;
      document.getElementById('setting-approval').value = this.settings.approvalMode;
      document.getElementById('setting-project').value = this.settings.projectDir;

      // Theme buttons
      document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === this.settings.theme);
      });

      overlay.classList.add('visible');
      sheet.classList.add('visible');
    });

    // Close on overlay click
    overlay.addEventListener('click', () => {
      overlay.classList.remove('visible');
      sheet.classList.remove('visible');
    });

    // Temperature slider live update
    document.getElementById('setting-temp').addEventListener('input', (e) => {
      document.getElementById('temp-val').textContent = e.target.value;
    });
    document.getElementById('setting-max-iter').addEventListener('input', (e) => {
      document.getElementById('max-iter-val').textContent = e.target.value;
    });

    // Theme toggle
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Save
    document.getElementById('btn-save-settings').addEventListener('click', () => {
      this.settings.apiKey = document.getElementById('setting-api-key').value.trim();
      this.settings.model = document.getElementById('setting-model').value;
      this.settings.temperature = parseFloat(document.getElementById('setting-temp').value);
      this.settings.maxIterations = parseInt(document.getElementById('setting-max-iter').value);
      this.settings.approvalMode = document.getElementById('setting-approval').value;
      this.settings.projectDir = document.getElementById('setting-project').value;

      const activeTheme = document.querySelector('.theme-btn.active');
      if (activeTheme) this.settings.theme = activeTheme.dataset.theme;

      this._saveSettings();
      document.documentElement.setAttribute('data-theme', this.settings.theme);

      // Update GLM client and Agent Loop
      if (this.glm) {
        this.glm.setApiKey(this.settings.apiKey);
        this.glm.setModel(this.settings.model);
        this.glm.setTemperature(this.settings.temperature);
      }
      if (this.agentLoop) {
        this.agentLoop.apiKey = this.settings.apiKey;
        this.agentLoop.model = this.settings.model;
        this.agentLoop.maxIterations = this.settings.maxIterations;
        this.agentLoop.approvalMode = this.settings.approvalMode;
      }

      document.getElementById('model-badge').textContent = this.settings.model;
      overlay.classList.remove('visible');
      sheet.classList.remove('visible');
      this._toast('设置已保存', 'success');
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Navigation
  // ═══════════════════════════════════════════════════════════════
  _setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const view = item.dataset.view;
        this._switchView(view);
      });
    });
  }

  _switchView(view) {
    this.currentView = view;
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');

    // Show/hide chat input bar
    const inputBar = document.getElementById('chat-input-bar');
    inputBar.style.display = view === 'chat' ? '' : 'none';
  }

  // ═══════════════════════════════════════════════════════════════
  // Chat
  // ═══════════════════════════════════════════════════════════════
  _setupChat() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('btn-send');
    const approvalSelect = document.getElementById('approval-mode');

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Send on Enter (without Shift)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._sendMessage();
      }
    });

    sendBtn.addEventListener('click', () => {
      if (this.isRunning) {
        this._stopAgent();
      } else {
        this._sendMessage();
      }
    });

    // Approval mode selector
    approvalSelect.value = this.settings.approvalMode;
    approvalSelect.addEventListener('change', (e) => {
      this.settings.approvalMode = e.target.value;
      this.agentLoop.approvalMode = e.target.value;
      this._saveSettings();
      this._toast(`审批模式: ${e.target.options[e.target.selectedIndex].text}`, 'info');
    });
  }

  async _sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message || this.isRunning) return;

    // Check API key
    if (!this.settings.apiKey) {
      this._toast('请先设置 GLM API Key', 'error');
      document.getElementById('btn-settings').click();
      return;
    }

    // Show user message
    this._addMessage('user', message);
    input.value = '';
    input.style.height = 'auto';

    // Hide welcome
    const welcome = document.getElementById('chat-welcome');
    if (welcome) welcome.style.display = 'none';

    // Show typing indicator
    const typing = this._addMessage('typing', '');
    this._setRunning(true);

    // Wake lock — keep screen on during agent execution
    if (this.android) this.android.requestWakeLock();

    // Clear previous reasoning/tools
    document.getElementById('reasoning-panel').style.display = 'none';
    document.getElementById('reasoning-body').innerHTML = '';
    document.getElementById('reasoning-body').classList.remove('collapsed');
    document.getElementById('tool-timeline').innerHTML = '';

    // Vibration feedback on send
    if (this.android) this.android.vibrate('light');

    try {
      const result = await this.agentLoop.run(message);
      typing.remove();
    } catch (err) {
      typing.remove();
      this._addMessage('agent', `❌ 错误: ${err.message}`);
      if (this.android) this.android.vibrate('error');
      console.error(err);
    }

      this._setRunning(false);
      // Release wake lock
      if (this.android) this.android.releaseWakeLock();
    }

  _setRunning(running) {
    this.isRunning = running;
    const sendBtn = document.getElementById('btn-send');
    const input = document.getElementById('chat-input');
    if (running) {
      sendBtn.classList.add('is-stop');
      sendBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
      input.placeholder = 'Agent 运行中...';
    } else {
      sendBtn.classList.remove('is-stop');
      sendBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>';
      input.placeholder = '描述你的任务...';
    }
  }

  _stopAgent() {
    if (this.agentLoop) {
      this.agentLoop.stop();
      this._setRunning(false);
      this._toast('已停止', 'info');
    }
  }

  _addMessage(role, text) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `msg msg-${role === 'typing' ? 'typing' : role}`;

    if (role === 'user') {
      div.textContent = text;
    } else if (role === 'agent') {
      div.innerHTML = this._renderMarkdown(text);
    }

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
  }

  _renderMarkdown(text) {
    let html = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/```(\w*)\n([\s\S]*?)```/g, (m, lang, code) =>
        `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
    return html;
  }

  // ═══ Agent Callbacks ═══
  _showReasoning(text) {
    const panel = document.getElementById('reasoning-panel');
    const body = document.getElementById('reasoning-body');
    panel.style.display = '';
    if (typeof text === 'object' && text.text) text = text.text;
    body.innerHTML += `<div style="margin-bottom:6px;">${text}</div>`;
    this._scrollChat();
  }

  _appendReasoningChunk(chunk) {
    const panel = document.getElementById('reasoning-panel');
    const body = document.getElementById('reasoning-body');
    panel.style.display = '';
    // Append raw text without re-rendering (high performance)
    body.appendChild(document.createTextNode(chunk));
    this._scrollChat();
  }

  _appendContentChunk(chunk) {
    // Remove typing indicator
    const typing = document.querySelector('.msg-typing');
    if (typing) typing.remove();

    // Find or create streaming message bubble
    let stream = document.getElementById('streaming-msg');
    if (!stream) {
      stream = document.createElement('div');
      stream.id = 'streaming-msg';
      stream.className = 'msg msg-agent';
      document.getElementById('chat-messages').appendChild(stream);
    }
    stream.textContent += chunk;
    this._scrollChat();
  }

  _scrollChat() {
    const container = document.getElementById('chat-messages');
    container.scrollTop = container.scrollHeight;
  }

  _showToolCall(tool, args) {
    const timeline = document.getElementById('tool-timeline');
    const entry = document.createElement('div');
    entry.className = 'tool-entry';
    entry.innerHTML = `
      <div class="tool-entry-header">🔧 ${tool}</div>
      <div class="tool-entry-detail">${this._formatArgs(args)}</div>
    `;
    timeline.appendChild(entry);
    const container = document.getElementById('chat-messages');
    container.scrollTop = container.scrollHeight;
  }

  _showToolResult(tool, result) {
    const timeline = document.getElementById('tool-timeline');
    const entries = timeline.querySelectorAll('.tool-entry');
    const last = entries[entries.length - 1];
    if (last) {
      const summary = typeof result === 'string' ? result.substring(0, 100) : JSON.stringify(result).substring(0, 100);
      const resultDiv = document.createElement('div');
      resultDiv.className = 'tool-entry-result';
      resultDiv.textContent = '✓ ' + summary + (summary.length >= 100 ? '...' : '');
      last.appendChild(resultDiv);
    }
  }

  _showAgentMessage(text) {
    // Remove typing indicator
    const typing = document.querySelector('.msg-typing');
    if (typing) typing.remove();
    // Remove streaming message (already displayed via chunks)
    const stream = document.getElementById('streaming-msg');
    if (stream) stream.remove();
    // Add final rendered message
    const msgText = typeof text === 'object' ? (text.text || '') : text;
    if (msgText) this._addMessage('agent', msgText);
  }

  async _requestApproval(tool, args) {
    return new Promise((resolve) => {
      const dialog = document.getElementById('approval-dialog');
      const title = document.getElementById('approval-title');
      const desc = document.getElementById('approval-desc');
      const diff = document.getElementById('approval-diff');
      const btnYes = document.getElementById('btn-approve-yes');
      const btnNo = document.getElementById('btn-approve-deny');

      title.textContent = `确认: ${tool}`;
      desc.textContent = `参数: ${JSON.stringify(args, null, 2)}`;

      // Show diff for file operations
      if (tool === 'write_file' || tool === 'patch_file' || tool === 'create_file') {
        const content = args.content || args.new_string || '';
        diff.innerHTML = `<span class="add">+ ${content.substring(0, 500)}</span>`;
        diff.style.display = '';
      } else {
        diff.style.display = 'none';
      }

      dialog.style.display = 'flex';

      const cleanup = () => {
        dialog.style.display = 'none';
        btnYes.removeEventListener('click', onYes);
        btnNo.removeEventListener('click', onNo);
      };
      const onYes = () => { cleanup(); resolve(true); };
      const onNo = () => { cleanup(); resolve(false); };

      btnYes.addEventListener('click', onYes);
      btnNo.addEventListener('click', onNo);
    });
  }

  _onAgentDone(result) {
    console.log('Agent done:', result);
  }

  // ═══════════════════════════════════════════════════════════════
  // Files
  // ═══════════════════════════════════════════════════════════════
  _setupFiles() {
    document.getElementById('btn-new-file').addEventListener('click', async () => {
      const name = prompt('文件名:');
      if (name) {
        await this.fileManager.writeFile(name, '');
        this._renderFileList();
        this._toast(`已创建: ${name}`, 'success');
      }
    });

    document.getElementById('btn-new-folder').addEventListener('click', () => {
      this._toast('文件夹功能：使用路径创建文件即可', 'info');
    });

    document.getElementById('btn-close-viewer').addEventListener('click', () => {
      this.codeViewer.close();
    });
  }

  async _renderFileList(path) {
    const list = document.getElementById('file-list');
    const breadcrumb = document.getElementById('file-breadcrumb');
    const files = await this.fileManager.listFiles(path || '/');

    // Breadcrumb
    breadcrumb.innerHTML = `<span>${path || '/'}</span>`;

    // Render
    list.innerHTML = '';
    for (const file of files) {
      const item = document.createElement('div');
      item.className = 'file-item';
      item.innerHTML = `
        <span class="file-icon">${file.icon || (file.isFolder ? '📁' : '📄')}</span>
        <span class="file-name">${file.name}</span>
        <span class="file-meta">${file.isFolder ? '' : (file.size + ' B')}</span>
      `;
      item.addEventListener('click', async () => {
        if (file.isFolder) {
          await this._renderFileList(file.path);
        } else {
          await this.codeViewer.show(file.path);
        }
      });
      list.appendChild(item);
    }

    if (files.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);">无文件</div>';
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Utilities
  // ═══════════════════════════════════════════════════════════════
  _formatArgs(args) {
    if (!args || typeof args !== 'object') return String(args);
    const parts = [];
    for (const [k, v] of Object.entries(args)) {
      let val = String(v);
      if (val.length > 60) val = val.substring(0, 60) + '...';
      parts.push(`<strong>${k}</strong>: ${val}`);
    }
    return parts.join(', ');
  }

  _toast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity .25s';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }
}

// ═══ Boot ═══
const app = new CodexApp();
app.init().catch(err => console.error('Init failed:', err));
window.codexApp = app;
