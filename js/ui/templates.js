/**
 * 项目模板系统 — 快速创建标准项目结构
 * Project Templates — Quickly scaffold standard project structures
 *
 * 预设模板：React、Vue、Node.js Express、Python Flask、空项目
 * 每个模板包含完整的目录结构和默认文件
 *
 * 用法：
 *   import { ProjectTemplates } from './ui/templates.js';
 *   const tpl = new ProjectTemplates({ fileManager: fm });
 *   await tpl.createFromTemplate('react');
 *   tpl.showSelector(); // 显示模板选择器 UI
 */

/* ── 预设模板定义 ────────────────────────────────────────────────── */

const BUILTIN_TEMPLATES = {
  /* ── React 项目 ── */
  react: {
    name: 'React',
    icon: '⚛️',
    description: 'React + Vite 单页应用',
    color: '#61dafb',
    files: {
      '/package.json': JSON.stringify({
        name: 'react-app',
        version: '1.0.0',
        description: 'React application created with Codex Mobile',
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'vite build',
          preview: 'vite preview',
        },
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0',
        },
        devDependencies: {
          vite: '^5.0.0',
          '@vitejs/plugin-react': '^4.0.0',
        },
      }, null, 2),

      '/README.md': [
        '# React App',
        '',
        'A React application built with Vite.',
        '',
        '## Getting Started',
        '',
        '```bash',
        'npm install',
        'npm run dev',
        '```',
        '',
        '## License',
        'MIT',
        '',
      ].join('\n'),

      '/index.html': [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '  <meta charset="UTF-8" />',
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        '  <title>React App</title>',
        '</head>',
        '<body>',
        '  <div id="root"></div>',
        '  <script type="module" src="/src/main.jsx"></script>',
        '</body>',
        '</html>',
        '',
      ].join('\n'),

      '/src/main.jsx': [
        "import React from 'react';",
        "import { createRoot } from 'react-dom/client';",
        "import App from './App.jsx';",
        "import './styles.css';",
        '',
        "createRoot(document.getElementById('root')).render(",
        '  <React.StrictMode>',
        '    <App />',
        '  </React.StrictMode>',
        ');',
        '',
      ].join('\n'),

      '/src/App.jsx': [
        "import React, { useState } from 'react';",
        '',
        "export default function App() {",
        "  const [count, setCount] = useState(0);",
        '',
        '  return (',
        '    <div className="app">',
        '      <h1>Hello React!</h1>',
        '      <button onClick={() => setCount(c => c + 1)}>',
        '        Count: {count}',
        '      </button>',
        '    </div>',
        '  );',
        '}',
        '',
      ].join('\n'),

      '/src/styles.css': [
        '.app {',
        '  font-family: system-ui, sans-serif;',
        '  max-width: 600px;',
        '  margin: 0 auto;',
        '  padding: 2rem;',
        '  text-align: center;',
        '}',
        '',
        'button {',
        '  padding: 8px 16px;',
        '  font-size: 16px;',
        '  cursor: pointer;',
        '}',
        '',
      ].join('\n'),

      '/vite.config.js': [
        "import { defineConfig } from 'vite';",
        "import react from '@vitejs/plugin-react';",
        '',
        "export default defineConfig({",
        "  plugins: [react()],",
        "});",
        '',
      ].join('\n'),

      '/.gitignore': [
        'node_modules/',
        'dist/',
        '.env',
        '*.log',
        '',
      ].join('\n'),
    },
  },

  /* ── Vue 项目 ── */
  vue: {
    name: 'Vue',
    icon: '💚',
    description: 'Vue 3 + Vite 单页应用',
    color: '#42b883',
    files: {
      '/package.json': JSON.stringify({
        name: 'vue-app',
        version: '1.0.0',
        description: 'Vue 3 application created with Codex Mobile',
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'vite build',
          preview: 'vite preview',
        },
        dependencies: {
          vue: '^3.4.0',
        },
        devDependencies: {
          vite: '^5.0.0',
          '@vitejs/plugin-vue': '^5.0.0',
        },
      }, null, 2),

      '/README.md': [
        '# Vue App',
        '',
        'A Vue 3 application built with Vite.',
        '',
        '## Getting Started',
        '',
        '```bash',
        'npm install',
        'npm run dev',
        '```',
        '',
      ].join('\n'),

      '/index.html': [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '  <meta charset="UTF-8" />',
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        '  <title>Vue App</title>',
        '</head>',
        '<body>',
        '  <div id="app"></div>',
        '  <script type="module" src="/src/main.js"></script>',
        '</body>',
        '</html>',
        '',
      ].join('\n'),

      '/src/main.js': [
        "import { createApp } from 'vue';",
        "import App from './App.vue';",
        "import './styles.css';",
        '',
        "createApp(App).mount('#app');",
        '',
      ].join('\n'),

      '/src/App.vue': [
        '<template>',
        '  <div class="app">',
        '    <h1>Hello Vue!</h1>',
        '    <button @click="count++">Count: {{ count }}</button>',
        '  </div>',
        '</template>',
        '',
        '<script setup>',
        "import { ref } from 'vue';",
        'const count = ref(0);',
        '</script>',
        '',
        '<style scoped>',
        '.app {',
        '  font-family: system-ui, sans-serif;',
        '  text-align: center;',
        '  padding: 2rem;',
        '}',
        '</style>',
        '',
      ].join('\n'),

      '/src/styles.css': [
        '* { margin: 0; padding: 0; box-sizing: border-box; }',
        'body { font-family: system-ui, sans-serif; }',
        '',
      ].join('\n'),

      '/vite.config.js': [
        "import { defineConfig } from 'vite';",
        "import vue from '@vitejs/plugin-vue';",
        '',
        "export default defineConfig({",
        "  plugins: [vue()],",
        "});",
        '',
      ].join('\n'),

      '/.gitignore': [
        'node_modules/',
        'dist/',
        '.env',
        '*.log',
        '',
      ].join('\n'),
    },
  },

  /* ── Node.js Express ── */
  express: {
    name: 'Node.js Express',
    icon: '🟢',
    description: 'Express 后端 API 服务',
    color: '#68a063',
    files: {
      '/package.json': JSON.stringify({
        name: 'express-app',
        version: '1.0.0',
        description: 'Express API server created with Codex Mobile',
        main: 'src/index.js',
        type: 'module',
        scripts: {
          start: 'node src/index.js',
          dev: 'node --watch src/index.js',
        },
        dependencies: {
          express: '^4.18.0',
          cors: '^2.8.5',
        },
      }, null, 2),

      '/README.md': [
        '# Express API',
        '',
        'A Node.js Express backend API server.',
        '',
        '## Getting Started',
        '',
        '```bash',
        'npm install',
        'npm start',
        '```',
        '',
        'Server runs on http://localhost:3000',
        '',
      ].join('\n'),

      '/src/index.js': [
        "import express from 'express';",
        "import cors from 'cors';",
        '',
        "const app = express();",
        "const PORT = process.env.PORT || 3000;",
        '',
        "// 中间件",
        "app.use(cors());",
        "app.use(express.json());",
        '',
        "// 健康检查",
        "app.get('/health', (req, res) => {",
        "  res.json({ status: 'ok', timestamp: Date.now() });",
        "});",
        '',
        "// 示例路由",
        "app.get('/api/items', (req, res) => {",
        "  res.json({ items: [] });",
        "});",
        '',
        "app.post('/api/items', (req, res) => {",
        "  const { name } = req.body;",
        "  if (!name) return res.status(400).json({ error: 'name is required' });",
        "  res.status(201).json({ id: Date.now(), name });",
        "});",
        '',
        "app.listen(PORT, () => {",
        "  console.log(`Server running on port ${PORT}`);",
        "});",
        '',
      ].join('\n'),

      '/src/routes/.gitkeep': '',

      '/.gitignore': [
        'node_modules/',
        '.env',
        '*.log',
        '',
      ].join('\n'),
    },
  },

  /* ── Python Flask ── */
  flask: {
    name: 'Python Flask',
    icon: '🐍',
    description: 'Flask Web 后端',
    color: '#3776ab',
    files: {
      '/requirements.txt': [
        'flask==3.0.0',
        'flask-cors==4.0.0',
        'gunicorn==21.2.0',
        '',
      ].join('\n'),

      '/README.md': [
        '# Flask API',
        '',
        'A Python Flask web application.',
        '',
        '## Getting Started',
        '',
        '```bash',
        'pip install -r requirements.txt',
        'python app.py',
        '```',
        '',
        'Server runs on http://localhost:5000',
        '',
      ].join('\n'),

      '/app.py': [
        '"""Flask 应用入口 — Codex Mobile 生成"""',
        'from flask import Flask, jsonify, request',
        'from flask_cors import CORS',
        '',
        'app = Flask(__name__)',
        'CORS(app)',
        '',
        '',
        '@app.route("/health")',
        'def health():',
        '    """健康检查端点"""',
        '    return jsonify({"status": "ok", "timestamp": int(__import__("time").time())})',
        '',
        '',
        '@app.route("/api/items", methods=["GET"])',
        'def get_items():',
        '    """获取项目列表"""',
        '    return jsonify({"items": []})',
        '',
        '',
        '@app.route("/api/items", methods=["POST"])',
        'def create_item():',
        '    """创建新项目"""',
        '    data = request.get_json()',
        '    if not data or "name" not in data:',
        '        return jsonify({"error": "name is required"}), 400',
        '    return jsonify({"id": 1, "name": data["name"]}), 201',
        '',
        '',
        'if __name__ == "__main__":',
        '    app.run(host="0.0.0.0", port=5000, debug=True)',
        '',
      ].join('\n'),

      '/config.py': [
        '"""配置文件"""',
        '',
        'DEBUG = True',
        'SECRET_KEY = "change-me-in-production"',
        '',
      ].join('\n'),

      '/.gitignore': [
        '__pycache__/',
        '*.pyc',
        '.env',
        'venv/',
        '',
      ].join('\n'),
    },
  },

  /* ── 空项目 ── */
  empty: {
    name: '空项目',
    icon: '📄',
    description: '空白项目，仅包含 README',
    color: '#888888',
    files: {
      '/README.md': [
        '# My Project',
        '',
        'Project created with Codex Mobile.',
        '',
        '## Description',
        '',
        'TODO: Add project description.',
        '',
      ].join('\n'),

      '/.gitignore': [
        'node_modules/',
        '.env',
        '*.log',
        '',
      ].join('\n'),
    },
  },
};

/* ── ProjectTemplates ─────────────────────────────────────────────── */

export class ProjectTemplates {
  constructor(options = {}) {
    this.fileManager = options.fileManager || null;
    this.app = options.app || null;
    this._onCreate = options.onCreate || null;
    this._toastFn = options.toast || null;
    this._modalEl = null;
  }

  /**
   * 初始化 — 挂载 UI 到设置面板
   */
  async init() {
    // Attach "New Project" button to settings
    this.attachToSettings(document.body);
  }

  /* ── 模板操作 ──────────────────────────────────────────────────── */

  /**
   * 获取所有可用模板（内置 + 自定义）
   * @returns {Object}
   */
  getAllTemplates() {
    const custom = this._loadCustomTemplates();
    return { ...BUILTIN_TEMPLATES, ...custom };
  }

  /**
   * 从模板创建项目
   * 在 VFS 中批量创建所有文件
   * @param {string} templateName - 模板名称
   * @returns {Promise<{success, created, errors}>}
   */
  async createFromTemplate(templateName) {
    const templates = this.getAllTemplates();
    const template = templates[templateName];

    if (!template) {
      return { success: false, created: 0, errors: [`模板不存在: ${templateName}`] };
    }

    if (!this.fileManager) {
      return { success: false, created: 0, errors: ['FileManager 未初始化'] };
    }

    const created = [];
    const errors = [];

    for (const [path, content] of Object.entries(template.files)) {
      try {
        // 检查文件是否已存在
        const existing = await this.fileManager.readFile(path);
        if (existing) {
          // 覆盖
          await this.fileManager.writeFile(path, content);
        } else {
          await this.fileManager.writeFile(path, content);
        }
        created.push(path);
      } catch (err) {
        errors.push(`${path}: ${err.message}`);
        console.error(`模板创建文件失败 ${path}:`, err);
      }
    }

    const result = {
      success: errors.length === 0,
      created: created.length,
      errors,
    };

    if (this._onCreate) {
      this._onCreate(templateName, result);
    }

    this._toast(
      `✅ 从 ${template.name} 创建了 ${created.length} 个文件`,
      errors.length > 0 ? 'info' : 'success'
    );

    return result;
  }

  /**
   * 保存当前项目结构为自定义模板
   * @param {string} name - 模板名称
   * @param {string} [description] - 描述
   */
  async saveAsTemplate(name, description = '自定义模板') {
    if (!this.fileManager) {
      this._toast('FileManager 未初始化', 'error');
      return null;
    }

    // 获取所有文件
    const allFiles = await new Promise((resolve, reject) => {
      try {
        // 使用 fileManager 的内部获取方式
        this.fileManager.listFiles('/').then(rootEntries => {
          // 递归获取所有文件
          this._getAllFiles().then(resolve).catch(reject);
        }).catch(reject);
      } catch (e) {
        reject(e);
      }
    });

    const files = {};
    for (const file of allFiles) {
      const data = await this.fileManager.readFile(file);
      if (data) {
        files[file] = data.content;
      }
    }

    const templateKey = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const template = {
      name,
      icon: '⭐',
      description,
      color: '#FFD700',
      files,
    };

    // 保存到 localStorage
    const custom = this._loadCustomTemplates();
    custom[templateKey] = template;
    this._saveCustomTemplates(custom);

    this._toast(`模板 "${name}" 已保存`, 'success');
    return templateKey;
  }

  /**
   * 获取所有文件的路径列表（递归）
   */
  async _getAllFiles() {
    if (!this.fileManager) return [];

    // 直接使用 IndexedDB getAll 获取所有文件路径
    return new Promise((resolve, reject) => {
      if (this.fileManager.db) {
        const tx = this.fileManager.db.transaction('files', 'readonly');
        const req = tx.objectStore('files').getAllKeys();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      } else {
        resolve([]);
      }
    });
  }

  /* ── UI: 模板选择器 ────────────────────────────────────────────── */

  /**
   * 显示模板选择器（卡片式模态框）
   */
  showSelector() {
    // 如果已存在先关闭
    this.hideSelector();

    // 遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'tpl-overlay';
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'background:rgba(0,0,0,.7)',
      'z-index:1200',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'padding:20px',
    ].join(';');

    // 模态框
    const modal = document.createElement('div');
    modal.className = 'tpl-modal';
    modal.style.cssText = [
      'background:var(--bg-secondary,#1a1a2e)',
      'border-radius:16px',
      'max-width:500px',
      'width:100%',
      'max-height:80vh',
      'overflow-y:auto',
      '-webkit-overflow-scrolling:touch',
    ].join(';');

    // 头部
    const header = document.createElement('div');
    header.style.cssText = 'padding:16px 20px;border-bottom:1px solid var(--border,#333);display:flex;align-items:center;';
    header.innerHTML = '<span style="flex:1;font-size:16px;font-weight:700;color:var(--text,#e0e0e0);">🚀 新建项目</span>';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:transparent;border:none;color:var(--text-secondary,#888);font-size:20px;cursor:pointer;';
    closeBtn.addEventListener('click', () => this.hideSelector());
    header.appendChild(closeBtn);

    modal.appendChild(header);

    // 卡片网格
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;padding:16px;';

    const templates = this.getAllTemplates();

    for (const [key, tpl] of Object.entries(templates)) {
      const card = document.createElement('div');
      card.className = 'tpl-card';
      card.style.cssText = [
        'background:var(--bg-tertiary,#16162a)',
        'border:1px solid var(--border,#333)',
        'border-radius:12px',
        'padding:16px',
        'cursor:pointer',
        'text-align:center',
        'transition:border-color .2s',
      ].join(';');

      card.innerHTML = `
        <div style="font-size:36px;margin-bottom:8px;">${tpl.icon}</div>
        <div style="font-size:14px;font-weight:600;color:var(--text,#e0e0e0);margin-bottom:4px;">${this._escapeHtml(tpl.name)}</div>
        <div style="font-size:11px;color:var(--text-secondary,#777);line-height:1.4;">${this._escapeHtml(tpl.description || '')}</div>
        <div style="font-size:10px;color:var(--text-secondary,#555);margin-top:8px;">${Object.keys(tpl.files).length} 个文件</div>
      `;

      card.addEventListener('click', async () => {
        card.style.borderColor = tpl.color || '#5865F2';
        const result = await this.createFromTemplate(key);
        if (result.success || result.created > 0) {
          this.hideSelector();
        }
      });

      // hover 效果
      card.addEventListener('mouseenter', () => {
        card.style.borderColor = tpl.color || 'var(--primary)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.borderColor = 'var(--border,#333)';
      });

      grid.appendChild(card);
    }

    modal.appendChild(grid);

    // 底部：保存当前为模板
    const footer = document.createElement('div');
    footer.style.cssText = 'padding:12px 20px;border-top:1px solid var(--border,#333);display:flex;gap:8px;';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = '⭐ 保存当前项目为模板';
    saveBtn.style.cssText = [
      'flex:1',
      'background:transparent',
      'border:1px solid var(--border,#555)',
      'border-radius:8px',
      'padding:8px',
      'color:var(--text,#ccc)',
      'font-size:13px',
      'cursor:pointer',
    ].join(';');
    saveBtn.addEventListener('click', async () => {
      const name = prompt('模板名称:');
      if (!name) return;
      await this.saveAsTemplate(name);
    });
    footer.appendChild(saveBtn);

    modal.appendChild(footer);

    overlay.appendChild(modal);

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.hideSelector();
    });

    document.body.appendChild(overlay);
    this._modalEl = overlay;
  }

  /**
   * 隐藏模板选择器
   */
  hideSelector() {
    if (this._modalEl) {
      this._modalEl.remove();
      this._modalEl = null;
    }
  }

  /**
   * 在设置面板中添加"新建项目"按钮
   * @param {HTMLElement} [container] - 要插入按钮的容器
   */
  attachToSettings(container) {
    const target = container || document.querySelector('.sheet-body');
    if (!target) return;

    const btn = document.createElement('button');
    btn.textContent = '🚀 新建项目';
    btn.style.cssText = [
      'width:100%',
      'background:var(--primary,#5865F2)',
      'color:#fff',
      'border:none',
      'border-radius:8px',
      'padding:10px',
      'font-size:14px',
      'font-weight:600',
      'cursor:pointer',
      'margin-top:8px',
    ].join(';');
    btn.addEventListener('click', () => this.showSelector());

    target.appendChild(btn);
  }

  /* ── 自定义模板存储 ────────────────────────────────────────────── */

  _loadCustomTemplates() {
    try {
      const data = localStorage.getItem('codex-mobile-custom-templates');
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.error('加载自定义模板失败:', e);
      return {};
    }
  }

  _saveCustomTemplates(templates) {
    try {
      localStorage.setItem('codex-mobile-custom-templates', JSON.stringify(templates));
    } catch (e) {
      console.error('保存自定义模板失败:', e);
      // localStorage 可能满了，尝试精简（只保留文件路径和少量内容）
    }
  }

  /**
   * 删除自定义模板
   */
  deleteCustomTemplate(key) {
    const custom = this._loadCustomTemplates();
    delete custom[key];
    this._saveCustomTemplates(custom);
    this._toast('模板已删除', 'info');
  }

  /* ── 工具方法 ──────────────────────────────────────────────────── */

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
}

export default ProjectTemplates;
