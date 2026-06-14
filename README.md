# 📱 Codex Mobile v5.0 — Android AI Coding Agent

> 基于 OpenAI Codex CLI 架构的移动端 AI 编程助手 | PWA + Android 原生双模式

![Version](https://img.shields.io/badge/version-5.0-blue)
![Tests](https://img.shields.io/badge/tests-91%2F91-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

## 🎯 v5.0 更新

### 🆕 新增 3 大功能模块

| 功能 | 文件 | 行数 | 说明 |
|------|------|------|------|
| 📝 **代码片段管理器** | `js/ui/snippets.js` | 888 | 12 个内置片段（debounce/throttle/quickSort/memoize 等），IndexedDB 存储，搜索/过滤/复制/插入 |
| 📄 **Markdown 渲染器** | `js/ui/markdown-viewer.js` | 637 | 完整 Markdown 渲染（标题/粗体/代码块/列表/表格/引用块），语法高亮复用 CodeViewer |
| 🔀 **文件差异对比器** | `js/ui/diff-viewer.js` | 501 | LCS 算法行级 diff，可视化 +N/-N 统计，红绿色编码 |

### 🔧 核心修复
- `exportSession` 返回 JSON 字符串（之前无返回值）
- `export default` 与 named import 统一
- IndexedDB 空参数保护

## 🏗️ 架构

```
┌─────────────────────────────────────────────────┐
│              Android Native Shell                │
│  MainActivity(WebView) + AgentService(FG+WakeLock)│
│  + CodexBridge(@JavascriptInterface ×22)        │
├─────────────────────────────────────────────────┤
│           PWA Web App (16 modules)              │
│                                                  │
│  Chat │ Files │ Terminal │ Analysis │ Settings  │
│                                                  │
│  Agent Loop (8 tools) + GLM SSE Streaming       │
│  FileManager (IndexedDB VFS)                    │
│  CodeViewer + CodeEditor                        │
│  HistoryManager + ProjectTemplates              │
│  OfflineCache + SnippetsManager                 │
│  MarkdownViewer + DiffViewer                    │
│  GestureManager + AndroidFeatures               │
│  NativeBridge + CodexAnalysis                   │
│                                                  │
│  Service Worker (offline static cache)          │
└─────────────────────────────────────────────────┘
```

## 📊 测试覆盖 (91/91 全过)

| 套件 | 数量 | 结果 |
|------|------|------|
| 全功能真实场景测试 (GLM API) | 68 | ✅ 68/68 |
| 10 轮深度压力测试 | 10 | ✅ 10/10 |
| v5.0 新功能测试 | 13 | ✅ 13/13 |

## 📁 项目结构 (16 JS 模块, ~11,600 行)

```
android-codex/
├── index.html, manifest.json, sw.js, favicon.svg
├── css/mobile.css
├── js/
│   ├── app.js                    # 主控制器
│   ├── agent/loop.js             # Agent Loop + 8 工具 + SSE
│   ├── api/glm.js                # GLM API Client
│   ├── api/offline-cache.js      # 离线 AI 缓存
│   ├── files/file-manager.js     # IndexedDB VFS
│   ├── editor/code-viewer.js     # 只读代码查看器
│   ├── editor/code-editor.js     # 可编辑代码编辑器
│   ├── terminal/mobile-term.js   # 终端模拟器
│   ├── analysis/reverse.js       # Codex 逆向分析
│   ├── ui/gestures.js            # 手势管理
│   ├── ui/android-features.js    # Android 特性
│   ├── ui/native-bridge.js       # 原生桥接
│   ├── ui/history-manager.js     # 会话历史
│   ├── ui/templates.js           # 项目模板
│   ├── ui/snippets.js            # 代码片段 (NEW v5)
│   ├── ui/markdown-viewer.js     # Markdown 渲染 (NEW v5)
│   └── ui/diff-viewer.js         # 差异对比 (NEW v5)
└── android/                      # Android 原生项目
```

## 📄 License

MIT
