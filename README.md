# ⬢ Codex Mobile

**Android 原生 AI 编程 Agent — 基于开源 Codex CLI 架构**

v3.0 — 完整 Android 原生壳 + WebView JS 桥接

## 🏗️ 三层架构

```
┌─────────────────────────────────────────────────────┐
│              Android 原生层 (Java)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ MainActivity │  │ CodexBridge  │  │AgentService│  │
│  │  (WebView)   │──│ @Javascript  │  │ (Foreground│  │
│  │              │  │  Interface)  │  │  Service)  │  │
│  └──────────────┘  └──────────────┘  └───────────┘  │
│         ↕ window.CodexNative                         │
├─────────────────────────────────────────────────────┤
│            桥接抽象层 (NativeBridge.js)                │
│  原生模式 → CodexNative.xxx()                        │
│  PWA 模式 → Web API 回退                             │
├─────────────────────────────────────────────────────┤
│              Web 应用层 (ES6 Modules)                 │
│  Agent Loop / GLM SSE / VFS / Terminal / Analysis   │
└─────────────────────────────────────────────────────┘
```

## ✨ 功能矩阵

### v1.0 — 核心架构
| 功能 | 说明 |
|------|------|
| 🧠 Agent Loop | 事件驱动循环：LLM→推理→工具→迭代，8 种工具 |
| 🔒 三级审批 | suggest / auto-edit / full-auto |
| 📁 IndexedDB VFS | 虚拟文件系统，7 默认项目文件 |
| 💻 终端模拟 | 18+ 命令 |
| 🔬 Codex 逆向分析 | 架构/工具/对比/流程/配置 |

### v2.0 — PWA + SSE + 手势
| 功能 | 说明 |
|------|------|
| 📡 SSE 流式推理 | `stream:true` + reasoning_content 增量推送 |
| 📴 Service Worker | 离线 PWA，cache-first / stale-while-revalidate |
| 👆 手势控制 | 滑动切换 Tab、下拉刷新、长按上下文菜单 |
| ⚡ Wake Lock | Agent 执行时屏幕常亮 |
| 📳 震动反馈 | 5 种模式（light/medium/success/error/warning）|
| 🔗 Web Share | 分享对话到其他 App |
| 🔋 电池监控 | 低电量检测 |

### v3.0 — Android 原生壳 🆕
| 功能 | 说明 |
|------|------|
| 🏠 **MainActivity** | WebView 宿主，JavaScript 桥接，返回键导航，原生启动屏 |
| 🔌 **CodexBridge** | 22+ `@JavascriptInterface` 方法：文件系统/终端/通知/分享/剪贴板/下载 |
| 🚀 **AgentService** | 前台服务 + PARTIAL_WAKE_LOCK — **后台运行 4-5 小时不被杀** |
| 📱 **Deep Link** | `codex://mobile` URI scheme |
| 🔔 **系统通知** | 任务完成通知栏推送（无需用户授权）|
| 🔋 **电池豁免** | 申请电池优化白名单 — Agent 不受省电限制 |
| 🖥️ **真实文件系统** | 读写真实 Android 文件（非 IndexedDB）|
| ⌨️ **真实终端** | `Runtime.exec()` 执行真实 shell 命令 |
| 🌉 **NativeBridge.js** | 自动检测运行环境，原生优先 + Web 回退 |

## 📂 项目结构

```
android-codex/
├── index.html, manifest.json, sw.js     # PWA 层
├── css/mobile.css                        # Material Design 3
├── js/
│   ├── app.js                           # 主控制器 (700+ 行)
│   ├── agent/loop.js                    # Agent Loop + SSE (1200+ 行)
│   ├── api/glm.js                       # GLM API Client
│   ├── files/file-manager.js            # IndexedDB VFS
│   ├── terminal/mobile-term.js          # 终端模拟器
│   ├── editor/code-viewer.js            # 代码查看器
│   ├── ui/
│   │   ├── gestures.js                  # 手势管理器
│   │   ├── android-features.js          # Web API 封装
│   │   └── native-bridge.js    🆕       # JS↔Android 桥接抽象
│   └── analysis/reverse.js              # Codex 逆向分析
├── android/                      🆕 Android 原生壳
│   ├── build.gradle, settings.gradle     # Gradle 配置
│   ├── app/
│   │   ├── build.gradle                  # com.codex.mobile, SDK 34
│   │   └── src/main/
│   │       ├── AndroidManifest.xml       # 权限 + Deep Link
│   │       ├── java/com/codex/mobile/
│   │       │   ├── MainActivity.java     # WebView 宿主
│   │       │   ├── CodexBridge.java      # JS 桥接 (22+ 方法)
│   │       │   └── AgentService.java     # 前台服务
│   │       └── res/                      # 布局/主题/颜色
│   └── gradle/wrapper/
└── README.md
```

## 🧪 测试

```
v1.0 核心测试:  97/97 ✅
v2.0 扩展测试:  42/42 ✅
v3.0 原生测试:  60/60 ✅  (PWA 模式 + 模拟原生模式 + Android 文件)
────────────────────────────
总计:           199/199 ✅  0 JS 错误
```

## 🚀 构建

### PWA 模式（浏览器）
```bash
cd android-codex
python3 -m http.server 8100
# 浏览器打开 → Android Chrome "添加到主屏幕"
```

### 原生 APK 模式
```bash
cd android-codex/android
# 1. 将 web 资源复制到 assets
cp -r ../index.html ../css ../js ../manifest.json app/src/main/assets/www/

# 2. Android Studio 打开 android/ 目录
# 3. Build → Generate APK
# 4. 或命令行:
./gradlew assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk
```

## 🔬 Codex CLI vs Codex Mobile v3.0

| 功能 | CLI | Mobile v3.0 | 优势方 |
|------|:---:|:-----------:|:------:|
| Agent Loop + 8 Tools | ✅ | ✅ | = |
| SSE Streaming | ✅ | ✅ | = |
| Context Compaction | ✅ | ✅ | = |
| Approval Modes | ✅ | ✅ | = |
| **后台运行 4-5h** | ✅ | ✅ | = |
| **真实 Shell** | ✅ | ✅ (原生) | = |
| **真实文件系统** | ✅ | ✅ (原生) | = |
| MCP Server | ✅ | ❌ | CLI |
| 离线模式 | ❌ | ✅ | **Mobile** |
| 手势控制 | ❌ | ✅ | **Mobile** |
| 震动反馈 | ❌ | ✅ | **Mobile** |
| 系统通知 | ❌ | ✅ | **Mobile** |
| 触摸优化 | ❌ | ✅ | **Mobile** |

## 🛠️ 技术栈

- **Android**: Java 17, AGP 8.2, Material 3, WebView, Foreground Service
- **Web**: vanilla ES6 modules, IndexedDB, Service Worker, SSE
- **API**: GLM-4-Plus (智谱 AI)
- **桥接**: @JavascriptInterface + NativeBridge.js 双路径

## 📄 License

MIT
