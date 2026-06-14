# 📱 Codex Mobile v4.0 — Android AI Coding Agent

> 基于 OpenAI Codex CLI 架构的移动端 AI 编程助手，支持 PWA + Android 原生双模式运行

![Version](https://img.shields.io/badge/version-4.0-blue)
![Tests](https://img.shields.io/badge/tests-86%2F86-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

## 🎯 v4.0 新特性

### 🆕 新增 4 大功能模块

| 功能 | 说明 |
|------|------|
| 💬 **会话历史管理器** | 每次对话自动保存到 IndexedDB，支持会话切换、导出 JSON、历史搜索 |
| ✏️ **代码编辑器** | 真正可编辑的代码编辑器（非只读），支持 8 语言语法高亮、Tab 缩进、Ctrl+S 保存、修改状态检测 |
| 📋 **项目模板系统** | 5 套预设模板（React / Vue / Express / Flask / 空项目），一键创建完整项目结构 |
| 📴 **离线 AI 缓存** | 离线状态下通过关键词模糊匹配缓存响应，7 天 TTL，自动清理 |

### 🔧 核心修复（基于真实 GLM API 测试）

- ✅ **VirtualFS → IndexedDB 异步桥接** — 所有 8 个 Agent 工具方法改为 `async/await`，兼容同步 VirtualFS 和异步 FileManager
- ✅ **SSE `finish_reason` 捕获** — 流式模式下正确捕获 `finish_reason`，修复工具调用后无响应的 bug
- ✅ **回调签名统一** — `_showToolCall` / `_showToolResult` / `_requestApproval` 的参数格式与 AgentLoop 回调对齐
- ✅ **full-auto 审批模式** — `_requestApproval` 自动批准，无需 UI 交互
- ✅ **主题持久化修复** — `localStorage` 条件写入，reload 后正确恢复主题
- ✅ **favicon 添加** — 消除 404 错误

## 🏗️ 架构概览

```
┌─────────────────────────────────────────────────┐
│                 Android Native Shell             │
│  MainActivity (WebView) + AgentService (FG)      │
│  + CodexBridge (@JavascriptInterface ×22)       │
├─────────────────────────────────────────────────┤
│              Native Bridge (JS ↔ Java)           │
│  auto-detect: CodexNative → native | web fallback│
├─────────────────────────────────────────────────┤
│                  PWA Web App                     │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │
│  │ Chat │ │Files │ │ Term │ │Analysis│ │Settings│ │
│  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘  │
│     │        │        │        │        │       │
│  ┌──┴────────┴────────┴────────┴────────┴───┐  │
│  │           Agent Loop (8 tools)            │  │
│  │  read_file | write_file | patch_file      │  │
│  │  list_files | search_files | run_command  │  │
│  │  analyze | create_file                    │  │
│  └──────────────┬───────────────────────────┘  │
│                 │                                │
│  ┌──────────────┴───────────────────────────┐  │
│  │     GLM API (SSE Streaming, JWT Auth)     │  │
│  └──────────────────────────────────────────┘  │
│                                                  │
│  IndexedDB: codex-mobile-fs (VFS)               │
│  IndexedDB: codex-mobile-history (会话)          │
│  IndexedDB: codex-mobile-cache (离线缓存)        │
│  Service Worker: sw.js (离线缓存静态资源)        │
└─────────────────────────────────────────────────┘
```

## 📁 项目结构

```
android-codex/
├── index.html              # HTML 入口 + PWA meta + SW 注册
├── manifest.json           # PWA Manifest
├── sw.js                   # Service Worker
├── favicon.svg             # 站点图标
├── css/
│   └── mobile.css          # Material Design 3 深色/浅色主题
├── js/
│   ├── app.js              # 主控制器 (~790行)
│   ├── agent/
│   │   └── loop.js         # Agent Loop + 8 工具 + SSE 流式 (~1343行)
│   ├── api/
│   │   ├── glm.js          # GLM API Client (JWT + SSE)
│   │   └── offline-cache.js # 离线 AI 缓存 (NEW v4.0)
│   ├── files/
│   │   └── file-manager.js # IndexedDB VFS
│   ├── editor/
│   │   ├── code-viewer.js  # 只读代码查看器
│   │   └── code-editor.js  # 可编辑代码编辑器 (NEW v4.0)
│   ├── terminal/
│   │   └── mobile-term.js  # 终端模拟器 (18+ 命令)
│   ├── analysis/
│   │   └── reverse.js      # Codex 逆向分析 (24 项对比)
│   └── ui/
│       ├── gestures.js     # 手势管理器
│       ├── android-features.js # Android 特性
│       ├── native-bridge.js # 原生桥接
│       ├── history-manager.js # 会话历史 (NEW v4.0)
│       └── templates.js    # 项目模板 (NEW v4.0)
└── android/                # Android 原生项目
    ├── app/build.gradle
    ├── app/src/main/java/com/codex/mobile/
    │   ├── MainActivity.java   # WebView 宿主
    │   ├── CodexBridge.java    # JS 桥接 (22+ 方法)
    │   └── AgentService.java   # 前台服务 + WakeLock
    └── app/src/main/res/       # 布局 + 主题 + 字符串
```

## 🧪 测试覆盖

| 测试套件 | 测试数 | 通过 | 失败 |
|----------|--------|------|------|
| 真实场景测试 (GLM API) | 56 | 56 | 0 |
| 10 轮压力测试 | 10 | 10 | 0 |
| v4.0 新功能测试 | 20 | 20 | 0 |
| **总计** | **86** | **86** | **0** |

### 测试场景

1. **真实 GLM API 调用** — Agent Loop SSE 流式、工具调用链
2. **IndexedDB 文件系统** — 增删改查、Patch、搜索、统计
3. **终端命令** — help/pwd/ls/echo/date/whoami/history
4. **代码查看器/编辑器** — 语法高亮、行号、保存
5. **Codex 逆向分析** — 架构/工具/对比/流程/配置 5 维度
6. **设置面板** — API Key、模型、温度、审批模式、主题
7. **导航 Tab 切换** — 快速切换不丢状态
8. **手势/原生桥接** — PWA + 模拟原生模式
9. **Service Worker / Manifest** — 离线缓存可访问
10. **会话历史** — 创建/加载/删除/自动保存
11. **项目模板** — 5 套模板一键创建
12. **离线缓存** — 写入/精确命中/模糊匹配

## 🚀 使用方法

### PWA 模式（浏览器）
```bash
# 启动本地服务器
cd android-codex
python3 -m http.server 8100
# 访问 http://localhost:8100
```

### Android 原生模式
1. 用 Android Studio 打开 `android/` 目录
2. 编译为 APK
3. 安装到 Android 设备

### 配置
- API Key: 设置面板中输入 GLM API Key
- 模型: glm-4-plus / glm-4-flash / glm-5.2
- 审批模式: suggest（需确认）/ full-auto（自动）

## 📊 版本历史

| 版本 | 日期 | 主要变更 |
|------|------|----------|
| v4.0 | 2026-06-14 | 4 大新功能 + 86 项真实测试全过 + 核心异步修复 |
| v3.0 | 2026-06-14 | Android 原生壳 + JS 桥接 + 前台服务 |
| v2.0 | 2026-06-13 | SSE 流式 + Service Worker + 手势 + Wake Lock |
| v1.0 | 2026-06-13 | 初始版本，8 工具 Agent Loop |

## 📄 License

MIT
