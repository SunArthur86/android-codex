# ⬢ Codex Mobile

**基于 OpenAI Codex CLI 架构的 Android AI 编程 Agent (PWA)**

一个忠实复刻 Codex CLI 架构的移动端 AI 编码助手，可直接在 Android 浏览器或"添加到主屏幕"后作为原生 App 使用。

## ✨ 核心特性

| 特性 | 说明 |
|------|------|
| 🧠 **Agent Loop** | 忠实复刻 Codex 的事件驱动循环：LLM → 推理 → 工具调用 → 迭代 |
| 🔧 **8 种工具** | read_file, write_file, patch_file, search_files, list_files, run_command, analyze, create_file |
| 🔒 **三级审批** | suggest（每次确认）/ auto-edit（自动编辑）/ full-auto（全自动）|
| 📁 **虚拟文件系统** | IndexedDB 持久化，支持完整 CRUD + 搜索 |
| 💻 **内置终端** | 18+ 命令模拟器，支持历史导航 |
| 🔬 **Codex 逆向分析** | 架构/工具/对比/流程/配置 五大维度深度分析 |
| 🌗 **深色/浅色主题** | Material Design 3 配色系统 |
| 📱 **PWA 安装** | 添加到主屏幕，全屏体验 |
| 📡 **GLM 驱动** | 默认 GLM-4-Plus，支持流式 SSE |

## 📸 截图

| 欢迎界面 | 文件管理器 | 代码查看器 |
|---------|----------|----------|
| 深色主题 + 特性展示 | IndexedDB 虚拟 FS | 语法高亮 + 行号 |

| 终端模拟器 | Codex 逆向分析 | 设置面板 |
|-----------|--------------|---------|
| 18+ 命令支持 | 5 维度架构解析 | API Key / 模型 / 审批 |

## 🏗️ 架构

```
android-codex/
├── index.html              # HTML 入口 (PWA meta + viewport)
├── manifest.json           # PWA manifest
├── css/
│   └── mobile.css          # Material Design 3 + 深色/浅色主题
├── js/
│   ├── app.js              # 主控制器 (导航/聊天/设置/Toast)
│   ├── agent/
│   │   └── loop.js         # Agent Loop (8 工具 + 上下文压缩 + 审批)
│   ├── api/
│   │   └── glm.js          # GLM API Client (SSE streaming + JWT)
│   ├── files/
│   │   └── file-manager.js # IndexedDB 文件管理器
│   ├── terminal/
│   │   └── mobile-term.js  # 移动终端模拟器 (18+ 命令)
│   ├── editor/
│   │   └── code-viewer.js  # 轻量代码查看器 (语法高亮 + 缩放)
│   └── analysis/
│       └── reverse.js      # Codex 逆向分析模块
└── assets/
```

## 🚀 使用方法

### 本地运行
```bash
cd android-codex
python3 -m http.server 8100
# 浏览器打开 http://localhost:8100
```

### Android 安装 (PWA)
1. 在 Chrome 中打开页面
2. 菜单 → "添加到主屏幕"
3. 从主屏幕图标启动 → 全屏原生体验

### 配置
1. 点击右上角 ⚙️ 设置
2. 输入 GLM API Key
3. 选择模型（推荐 GLM-4-Plus）
4. 设置审批模式
5. 保存 → 开始对话

## 🔬 Codex 逆向分析

内置 5 维度 Codex CLI 架构分析：

1. **架构分析** — AgentLoop / ToolDispatcher / ContextManager / ApprovalSystem / ReasoningChain
2. **工具系统** — 8 种工具的完整定义和参数说明
3. **功能对比** — Codex CLI (桌面) vs Codex Mobile (移动) 15 项功能对比
4. **Agent Loop 流程** — 7 步完整流程图
5. **配置系统** — 8 项配置参数详解

## 🧪 测试

```bash
# 97 项测试全部通过
node test-codex-mobile.js
```

测试覆盖：App 初始化、DOM 结构、底部导航、文件管理、代码查看器、终端、Codex 分析、设置面板、聊天输入、Agent Loop API、文件管理器 API、GLM API、主题切换、Toast 通知、PWA。

## 🛠️ 技术栈

- **纯前端**：vanilla ES6 modules，零框架依赖
- **存储**：IndexedDB (浏览器内持久化)
- **API**：GLM-4-Plus (智谱 AI)
- **设计**：Material Design 3 配色
- **PWA**：可安装到 Android 主屏幕

## 📄 License

MIT
