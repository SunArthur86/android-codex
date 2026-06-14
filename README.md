# ⬢ Codex Mobile

**基于 OpenAI Codex CLI 架构的 Android AI 编程 Agent (PWA)**

v2.0 — 增加离线缓存、SSE 流式推理、Android 手势、原生 API 集成

## ✨ 核心特性

### v1.0 基础架构
| 特性 | 说明 |
|------|------|
| 🧠 **Agent Loop** | 忠实复刻 Codex 的事件驱动循环：LLM → 推理 → 工具调用 → 迭代 |
| 🔧 **8 种工具** | read_file, write_file, patch_file, search_files, list_files, run_command, analyze, create_file |
| 🔒 **三级审批** | suggest（每次确认）/ auto-edit（自动编辑）/ full-auto（全自动）|
| 📁 **虚拟文件系统** | IndexedDB 持久化，支持完整 CRUD + 搜索 |
| 💻 **内置终端** | 18+ 命令模拟器，支持历史导航 |
| 🔬 **Codex 逆向分析** | 架构/工具/对比/流程/配置 五大维度深度分析 |

### v2.0 新增 — Android 原生体验
| 特性 | 说明 |
|------|------|
| 📡 **SSE 流式推理** | 实时显示 reasoning_content 和 content，逐字符流式输出 |
| 📴 **Service Worker** | PWA 离线缓存，静态资源 cache-first，运行时 stale-while-revalidate |
| 👆 **手势控制** | 左右滑动切换 Tab，下拉刷新，长按弹出上下文菜单 |
| ⚡ **Wake Lock** | Agent 执行时保持屏幕常亮，执行完毕自动释放 |
| 📳 **震动反馈** | 发送消息、工具调用、错误提示都有触觉反馈 |
| 🔗 **Web Share API** | 分享对话内容到其他 App |
| 🔋 **电池监控** | 低电量时智能降级 |
| 📋 **剪贴板 API** | 一键复制代码和对话 |

## 📸 界面预览

深色 Material Design 3 界面，390×844 移动端视口，4-Tab 底部导航（对话/文件/终端/分析）

## 🏗️ 架构

```
android-codex/
├── index.html              # HTML 入口 (PWA + Service Worker 注册)
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker (离线缓存策略)
├── css/
│   └── mobile.css          # Material Design 3 + 深色/浅色 + 流式动画
├── js/
│   ├── app.js              # 主控制器 (导航/聊天/SSE回调/手势集成)
│   ├── agent/
│   │   └── loop.js         # Agent Loop (8工具 + SSE流式 + 上下文压缩 + 审批)
│   ├── api/
│   │   └── glm.js          # GLM API Client (SSE streaming + JWT)
│   ├── files/
│   │   └── file-manager.js # IndexedDB 文件管理器
│   ├── terminal/
│   │   └── mobile-term.js  # 移动终端模拟器 (18+ 命令)
│   ├── editor/
│   │   └── code-viewer.js  # 轻量代码查看器 (8语言高亮 + 缩放)
│   ├── ui/
│   │   ├── gestures.js     # 🆕 手势管理器 (滑动/长按/下拉刷新)
│   │   └── android-features.js # 🆕 Android原生API (WakeLock/震动/分享)
│   └── analysis/
│       └── reverse.js      # Codex 逆向分析 (24项对比)
└── assets/
```

## 🔬 Codex CLI 对比 (v2.0)

| 功能 | CLI 桌面版 | 移动版 v2.0 |
|------|:---------:|:----------:|
| Agent Loop | ✅ | ✅ |
| Tool Calling (8 tools) | ✅ | ✅ |
| Reasoning Chain | ✅ | ✅ |
| SSE Streaming | ✅ | ✅ |
| Approval Modes | ✅ | ✅ |
| Context Compaction | ✅ | ✅ |
| Prompt Caching | ✅ | ⚡ 部分 |
| AGENTS.md Cascade | ✅ | ⚡ 部分 |
| MCP Support | ✅ | ❌ |
| Offline PWA | ❌ | ✅ |
| Touch UI | ❌ | ✅ |
| Gesture Controls | ❌ | ✅ |
| Wake Lock | ❌ | ✅ |
| Haptic Feedback | ❌ | ✅ |
| Web Share | ❌ | ✅ |
| Battery Monitor | ❌ | ✅ |

## 🧪 测试

```
v1.0 核心测试: 97/97 ✅
v2.0 扩展测试: 42/42 ✅
─────────────────────
总计:           139/139 ✅  0 JS 错误
```

## 🚀 使用方法

### 本地运行
```bash
cd android-codex
python3 -m http.server 8100
```

### Android 安装
1. Chrome 打开页面 → 菜单 → **"添加到主屏幕"**
2. 从主屏幕图标启动 → 全屏原生体验
3. Service Worker 自动注册，支持离线使用

### 配置
1. 点击 ⚙️ 设置
2. 输入 GLM API Key
3. 选择模型（推荐 GLM-4-Plus）
4. 选择审批模式
5. 保存 → 开始对话

## 🛠️ 技术栈

- **纯前端**: vanilla ES6 modules，零框架
- **存储**: IndexedDB (浏览器持久化)
- **PWA**: Service Worker + Web App Manifest
- **API**: GLM-4-Plus (智谱 AI) + SSE streaming
- **Android API**: Wake Lock, Vibration, Web Share, Battery, Clipboard
- **设计**: Material Design 3 深色/浅色主题

## 📄 License

MIT
