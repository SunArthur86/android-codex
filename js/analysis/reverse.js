/**
 * Codex Reverse-Engineering Analysis Module
 * ══════════════════════════════════════════════════════════════
 * Renders a structured reverse-engineering analysis of the OpenAI Codex CLI
 * into the Android Codex Mobile app's DOM elements.
 *
 * Based on public research of the open-source Codex CLI repository
 * (openai/codex on GitHub) and related documentation.
 *
 * Sections:
 *   1. Architecture Analysis       → #arch-body
 *   2. Tool System (8 tools)       → #tools-body
 *   3. Feature Comparison Table     → #compare-body
 *   4. Agent Loop Workflow          → #workflow-body
 *   5. Configuration System         → #config-body
 *
 * No imports — fully self-contained ES6 module.
 */

// ══════════════════════════════════════════════════════════════
// HARDCODED ANALYSIS DATA
// ══════════════════════════════════════════════════════════════

/** Core architectural components discovered through reverse engineering. */
const ARCHITECTURE = {
  pattern: '事件驱动循环 + 工具调用 (Event-Driven Loop with Tool Calling)',
  components: [
    {
      name: 'AgentLoop',
      description: '核心代理循环引擎，驱动整个对话-推理-执行流程。',
      details:
        '维护消息历史、调用 LLM API、解析响应（tool_calls 或纯文本）、' +
        '在工具执行后重新进入循环。设置最大迭代上限防止无限循环。' +
        '支持流式 SSE 响应和上下文压缩。',
    },
    {
      name: 'ToolDispatcher',
      description: '工具分发器，将 LLM 返回的 function_call 路由到对应执行器。',
      details:
        '维护 8 个工具的注册表（read_file、write_file、patch_file、' +
        'search_files、list_files、run_command、analyze、create_file）。' +
        '负责参数校验、沙盒隔离、超时控制和结果序列化。' +
        '每个工具返回结构化的 JSON 结果供 LLM 在下一轮使用。',
    },
    {
      name: 'ContextManager',
      description: '上下文管理器，控制系统提示词和对话历史的组装与压缩。',
      details:
        '构建 system prompt（包含身份、工具定义、操作规则）。' +
        '当消息历史的 token 数超过阈值（~25K tokens / 100K chars）时，' +
        '触发上下文压缩：保留最近 N 条消息，将较早的对话摘要为总结。' +
        '支持 AGENTS.md 项目上下文注入。',
    },
    {
      name: 'ApprovalSystem',
      description: '分级审批系统，控制工具执行前的人工确认策略。',
      details:
        '三级模式：suggest（每次操作需确认）、auto-edit（文件操作免确认、' +
        '命令需确认）、full-auto（全自动执行）。在 suggest/auto-edit 模式下，' +
        '命令执行前展示 diff 预览供用户审批。full-auto 模式下在沙盒中运行。',
    },
    {
      name: 'ReasoningChain',
      description: '推理链可视化模块，将 LLM 的思维过程展示给用户。',
      details:
        '解析 LLM 响应中的推理内容（CoT 思维链），在 UI 中以可折叠面板呈现。' +
        '每一步推理包含：分析、计划、工具调用意图。帮助用户理解 Agent 的' +
        '决策过程，增强透明度和可调试性。',
    },
  ],
};

/** All 8 Codex tools with their parameters and mappings. */
const TOOLS = [
  {
    name: 'read_file',
    params: 'path: string',
    description: '读取指定路径文件的完整内容，返回字符串。',
    codexEquiv: 'Codex CLI read_file — 完全对应',
  },
  {
    name: 'write_file',
    params: 'path: string, content: string',
    description: '创建新文件或完全覆盖已有文件的内容。',
    codexEquiv: 'Codex CLI write_file — 完全对应',
  },
  {
    name: 'patch_file',
    params: 'path: string, old_string: string, new_string: string',
    description: '对已有文件进行精确查找替换编辑，old_string 必须唯一匹配。',
    codexEquiv: 'Codex CLI patch (apply_patch) — 精确编辑',
  },
  {
    name: 'search_files',
    params: 'query: string, path?: string',
    description: '在项目文件中搜索文本模式（grep 风格），返回匹配行和行号。',
    codexEquiv: 'Codex CLI grep / search — 内容搜索',
  },
  {
    name: 'list_files',
    params: 'path?: string',
    description: '列出目录内容，返回文件和文件夹名称及类型。',
    codexEquiv: 'Codex CLI ls / list — 目录列表',
  },
  {
    name: 'run_command',
    params: 'command: string',
    description: '在项目沙盒中执行终端命令，返回 stdout/stderr/exit_code。',
    codexEquiv: 'Codex CLI shell — 命令执行',
  },
  {
    name: 'analyze',
    params: 'code: string, language: string',
    description: '分析代码片段的质量、复杂度、模式和潜在问题。',
    codexEquiv: 'Codex CLI reasoning — 代码分析推理',
  },
  {
    name: 'create_file',
    params: 'path: string, type?: string',
    description: '创建带类型元数据的新文件，用于脚手架和模板生成。',
    codexEquiv: 'Codex CLI write (scaffold) — 文件创建',
  },
];

/** Feature comparison: Codex CLI (desktop) vs Codex Mobile (this app). */
const COMPARISON = {
  headers: ['功能', 'CLI 桌面版', '移动版'],
  features: [
    { name: 'Agent Loop',       cli: 'yes',     mobile: 'yes'     },
    { name: 'Tool Calling',     cli: 'yes',     mobile: 'yes'     },
    { name: 'Reasoning Chain',  cli: 'yes',     mobile: 'yes'     },
    { name: 'Diff Preview',     cli: 'yes',     mobile: 'yes'     },
    { name: 'Approval Modes',   cli: 'yes',     mobile: 'yes'     },
    { name: 'Context Compaction', cli: 'yes',   mobile: 'yes'     },
    { name: 'AGENTS.md',        cli: 'yes',     mobile: 'partial' },
    { name: 'MCP Support',      cli: 'yes',     mobile: 'partial' },
    { name: 'Terminal',         cli: 'yes',     mobile: 'partial' },
    { name: 'File System',      cli: 'yes',     mobile: 'partial' },
    { name: 'Git Integration',  cli: 'yes',     mobile: 'partial' },
    { name: 'Multi-model',      cli: 'partial', mobile: 'yes'     },
    { name: 'Streaming',        cli: 'yes',     mobile: 'yes'     },
    { name: 'Offline',          cli: 'no',      mobile: 'no'      },
    { name: 'Touch UI',         cli: 'no',      mobile: 'yes'     },
  ],
};

/** Agent Loop workflow steps. */
const WORKFLOW = [
  {
    title: '用户发送消息',
    detail: '用户在聊天输入框中描述任务，消息被加入对话历史。',
  },
  {
    title: '构建上下文',
    detail:
      'ContextManager 组装 system prompt（身份 + 工具定义 + 规则）+ ' +
      '历史消息 + AGENTS.md 项目上下文。',
  },
  {
    title: '调用 LLM API',
    detail:
      'AgentLoop 向 GLM API 发送请求（含 tools 定义），使用 SSE 流式接收响应。',
  },
  {
    title: '解析响应',
    detail:
      '解析 LLM 返回内容：若包含 tool_calls 则进入工具执行分支；' +
      '若为纯文本则视为最终回答。',
  },
  {
    title: '工具执行（若有 tool_calls）',
    detail:
      'ApprovalSystem 检查审批模式 → 展示 diff 预览（如需）→ ' +
      'ToolDispatcher 执行工具 → 结果加入消息历史 → 返回步骤 3 重新调用 LLM。',
  },
  {
    title: '返回响应（若为纯文本）',
    detail:
      '将 LLM 的文本回答渲染到聊天界面，推理内容展示在推理面板中。' +
      '任务完成。',
  },
  {
    title: '上下文压缩',
    detail:
      '若消息历史的 token 数超过阈值（~25K tokens），ContextManager ' +
      '触发压缩：保留最近 6 条消息，将较早对话摘要为总结，控制上下文窗口。',
  },
];

/** Codex configuration options. */
const CONFIG = [
  {
    key: 'model',
    value: '使用的 LLM 模型（如 o4-mini、gpt-4.1、glm-4-plus）',
  },
  {
    key: 'approval_mode',
    value: '审批模式：suggest / auto-edit / full-auto',
  },
  {
    key: 'max_iterations',
    value: '代理循环最大迭代轮数（防止无限循环，默认 25）',
  },
  {
    key: 'temperature',
    value: 'LLM 采样温度（0.0 确定性 ~ 1.0 创造性，默认 0.7）',
  },
  {
    key: 'context_window',
    value: '上下文窗口 token 上限（触发压缩的阈值）',
  },
  {
    key: 'sandbox_mode',
    value: '沙盒模式：隔离文件系统和命令执行的权限边界',
  },
  {
    key: 'mcp_servers',
    value: 'MCP（Model Context Protocol）服务器配置 — 扩展工具集',
  },
  {
    key: 'AGENTS.md',
    value: '项目级指令文件，注入到 system prompt 中指导 Agent 行为',
  },
];

// ══════════════════════════════════════════════════════════════
// HELPER UTILITIES
// ══════════════════════════════════════════════════════════════

/** Escape HTML special characters to prevent injection. */
function esc(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/** Convert status key to badge class + display text. */
const BADGE_MAP = {
  yes:     { cls: 'badge-yes',     text: '✓ 支持' },
  no:      { cls: 'badge-no',      text: '✗ 不支持' },
  partial: { cls: 'badge-partial', text: '◐ 部分' },
};

// ══════════════════════════════════════════════════════════════
// CODEX ANALYSIS CLASS
// ══════════════════════════════════════════════════════════════

class CodexAnalysis {
  /**
   * Create a new CodexAnalysis instance.
   * No arguments — all analysis data is hardcoded within the module.
   */
  constructor() {
    this.architecture = ARCHITECTURE;
    this.tools = TOOLS;
    this.comparison = COMPARISON;
    this.workflow = WORKFLOW;
    this.config = CONFIG;
  }

  // ───────────────────────────────────────────────────────────
  // SECTION RENDERERS
  // ───────────────────────────────────────────────────────────

  /**
   * Render architecture analysis into the target element.
   * @param {HTMLElement} el — container element (#arch-body)
   */
  renderArchitecture(el) {
    let html = '';

    // Architecture pattern
    html += `<div class="arch-item">`;
    html += `<span class="arch-label">架构模式</span>`;
    html += `<span>${esc(this.architecture.pattern)}</span>`;
    html += `</div>`;

    // Core components
    for (const comp of this.architecture.components) {
      html += `<div class="arch-item">`;
      html += `<span class="arch-label">${esc(comp.name)}</span>`;
      html += `<div>`;
      html += `<div>${esc(comp.description)}</div>`;
      html += `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">${esc(comp.details)}</div>`;
      html += `</div>`;
      html += `</div>`;
    }

    el.innerHTML = html;
  }

  /**
   * Render the tool system table into the target element.
   * @param {HTMLElement} el — container element (#tools-body)
   */
  renderTools(el) {
    let html = '';

    html += `<div style="margin-bottom:8px;font-size:12px;color:var(--text-secondary);">`;
    html += `共 <strong style="color:var(--accent);">${this.tools.length}</strong> 个核心工具`;
    html += `</div>`;

    for (const tool of this.tools) {
      html += `<div class="arch-item">`;
      html += `<span class="arch-label"><code>${esc(tool.name)}</code></span>`;
      html += `<div>`;
      html += `<div style="font-size:12px;color:var(--tool);">参数: ${esc(tool.params)}</div>`;
      html += `<div style="margin-top:2px;">${esc(tool.description)}</div>`;
      html += `<div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">${esc(tool.codexEquiv)}</div>`;
      html += `</div>`;
      html += `</div>`;
    }

    el.innerHTML = html;
  }

  /**
   * Render the feature comparison table into the target element.
   * @param {HTMLElement} el — container element (#compare-body)
   */
  renderComparison(el) {
    let html = '';

    // Header row
    html += `<div class="compare-row" style="border-bottom:2px solid var(--border);">`;
    html += `<span class="compare-feature" style="font-weight:600;">${esc(this.comparison.headers[0])}</span>`;
    html += `<span class="compare-badge" style="min-width:72px;text-align:center;background:var(--bg-tertiary);">${esc(this.comparison.headers[1])}</span>`;
    html += `<span class="compare-badge" style="min-width:60px;text-align:center;background:var(--bg-tertiary);">${esc(this.comparison.headers[2])}</span>`;
    html += `</div>`;

    // Feature rows
    for (const feat of this.comparison.features) {
      const cliBadge = BADGE_MAP[feat.cli] || BADGE_MAP.no;
      const mobileBadge = BADGE_MAP[feat.mobile] || BADGE_MAP.no;

      html += `<div class="compare-row">`;
      html += `<span class="compare-feature">${esc(feat.name)}</span>`;
      html += `<span class="compare-badge ${cliBadge.cls}" style="min-width:72px;text-align:center;">${esc(cliBadge.text)}</span>`;
      html += `<span class="compare-badge ${mobileBadge.cls}" style="min-width:60px;text-align:center;">${esc(mobileBadge.text)}</span>`;
      html += `</div>`;
    }

    el.innerHTML = html;
  }

  /**
   * Render the agent loop workflow into the target element.
   * @param {HTMLElement} el — container element (#workflow-body)
   */
  renderWorkflow(el) {
    let html = '';

    this.workflow.forEach((step, i) => {
      html += `<div class="workflow-step">`;
      html += `<strong>步骤 ${i + 1}：${esc(step.title)}</strong>`;
      html += `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">${esc(step.detail)}</div>`;
      html += `</div>`;
    });

    el.innerHTML = html;
  }

  /**
   * Render the configuration system into the target element.
   * @param {HTMLElement} el — container element (#config-body)
   */
  renderConfig(el) {
    let html = '';

    for (const item of this.config) {
      html += `<div class="config-item">`;
      html += `<span class="config-key">${esc(item.key)}</span>`;
      html += `<span class="config-val" style="flex:1;text-align:right;padding-left:12px;">${esc(item.value)}</span>`;
      html += `</div>`;
    }

    el.innerHTML = html;
  }

  // ───────────────────────────────────────────────────────────
  // MASTER RENDER
  // ───────────────────────────────────────────────────────────

  /**
   * Render all analysis sections into their respective DOM containers.
   *
   * @param {Object} [containerIds] — optional override of element IDs.
   *        Defaults match the HTML in index.html.
   * @param {string} [containerIds.arch]     — #arch-body id
   * @param {string} [containerIds.tools]    — #tools-body id
   * @param {string} [containerIds.compare]  — #compare-body id
   * @param {string} [containerIds.workflow] — #workflow-body id
   * @param {string} [containerIds.config]   — #config-body id
   */
  renderAll(containerIds = {}) {
    const ids = {
      arch: containerIds.arch || 'arch-body',
      tools: containerIds.tools || 'tools-body',
      compare: containerIds.compare || 'compare-body',
      workflow: containerIds.workflow || 'workflow-body',
      config: containerIds.config || 'config-body',
    };

    const sections = [
      { id: ids.arch,     renderer: (el) => this.renderArchitecture(el) },
      { id: ids.tools,    renderer: (el) => this.renderTools(el) },
      { id: ids.compare,  renderer: (el) => this.renderComparison(el) },
      { id: ids.workflow, renderer: (el) => this.renderWorkflow(el) },
      { id: ids.config,   renderer: (el) => this.renderConfig(el) },
    ];

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) {
        section.renderer(el);
      } else {
        console.warn(`[CodexAnalysis] Element #${section.id} not found in DOM.`);
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════════════════════════

export { CodexAnalysis };
export default CodexAnalysis;
