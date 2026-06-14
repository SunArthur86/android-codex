/**
 * Codex Agent Loop + Tools
 * ══════════════════════════════════════════════════════════════
 * Core agent loop for Android Codex Mobile — faithfully replicates
 * OpenAI Codex CLI's architecture: reasoning → tool calls → results → loop.
 *
 * Architecture:
 *   1. System prompt with tool definitions (JSON function-calling)
 *   2. Iterative run() loop with GLM API
 *   3. 8 Codex-style tools (read/write/patch/search/list/run/analyze/create)
 *   4. Context compaction when tokens exceed threshold
 *   5. Tiered approval system (suggest / auto-edit / full-auto)
 *
 * No imports — fully self-contained ES6 module.
 */

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════

const GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const CONTEXT_CHAR_THRESHOLD = 100_000;     // ~25K tokens
const COMPACT_KEEP_MESSAGES = 6;            // messages to retain after compaction
const MAX_FILE_READ_CHARS = 50_000;          // truncate very large files
const COMMAND_TIMEOUT_MS = 30_000;

// ══════════════════════════════════════════════════════════════
// SYSTEM PROMPT — Codex-style
// ══════════════════════════════════════════════════════════════

function buildSystemPrompt(tools) {
  const toolList = tools.map(t =>
    `  - **${t.function.name}**: ${t.function.description}`
  ).join('\n');

  return `You are Codex, an AI coding assistant running on Android.

## Identity
You are Codex — a powerful autonomous coding agent. You operate inside a sandboxed
mobile development environment and have direct access to the user's project files.
Your goal is to understand the user's intent, reason through problems step by step,
and take concrete actions to write, debug, and improve code.

## Capabilities
You can read, write, and patch files, search across the codebase, list directory
contents, run terminal commands, analyze code quality, and create new files.
You work iteratively — examining results after each action before deciding the next step.

## Available Tools
${toolList}

## Operating Rules
1. **Always explain your reasoning before acting.** Think through the problem,
   state your plan, then invoke tools.
2. **Use tools iteratively.** After each tool result, evaluate whether the goal
   is met or if further action is needed.
3. **Verify your changes.** After writing or patching code, re-read the file
   to confirm correctness.
4. **Be surgical.** Prefer \`patch_file\` over \`write_file\` for existing files.
   Never rewrite an entire file when a targeted edit suffices.
5. **Handle errors gracefully.** If a tool fails, diagnose the issue and try
   an alternative approach.
6. **Summarize when done.** When the task is complete, provide a concise summary
   of what was changed and why.

## Working Directory
All file paths are relative to the project root. The agent operates within
a sandboxed filesystem on the device.

Remember: you are an autonomous agent. Don't just describe what to do — do it.`;
}

// ══════════════════════════════════════════════════════════════
// TOOL DEFINITIONS (OpenAI function-calling format)
// ══════════════════════════════════════════════════════════════

function buildToolDefinitions() {
  return [
    {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read the full contents of a file at the given path. Returns the file content as a string.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative path to the file (e.g. "src/index.js")'
            }
          },
          required: ['path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Create a new file or completely overwrite an existing file with the given content.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative path to the file'
            },
            content: {
              type: 'string',
              description: 'The complete content to write'
            }
          },
          required: ['path', 'content']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'patch_file',
        description: 'Apply a targeted find-and-replace edit to an existing file. Finds old_string and replaces it with new_string. The old_string must match exactly and uniquely.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative path to the file'
            },
            old_string: {
              type: 'string',
              description: 'The exact string to find in the file (must be unique)'
            },
            new_string: {
              type: 'string',
              description: 'The replacement string'
            }
          },
          required: ['path', 'old_string', 'new_string']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'search_files',
        description: 'Search for a text pattern across files in the project (grep-like). Returns matching lines with file paths and line numbers.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search pattern (string or regex)'
            },
            path: {
              type: 'string',
              description: 'Optional directory path to limit search scope'
            }
          },
          required: ['query']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_files',
        description: 'List the contents of a directory. Returns file and folder names with types.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Directory path to list (defaults to project root)'
            }
          },
          required: []
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'run_command',
        description: 'Execute a terminal command in the project sandbox. Returns stdout, stderr, and exit code. Use for builds, tests, git operations, etc.',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The shell command to execute'
            }
          },
          required: ['command']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'analyze',
        description: 'Analyze a code snippet for quality, complexity, patterns, and potential issues. Returns structured analysis feedback.',
        parameters: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'The code to analyze'
            },
            language: {
              type: 'string',
              description: 'Programming language of the code (e.g. "javascript", "python")'
            }
          },
          required: ['code', 'language']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'create_file',
        description: 'Create a new file with optional type metadata. Use for scaffolding new files with boilerplate.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative path for the new file'
            },
            content: {
              type: 'string',
              description: 'Initial content of the file'
            },
            type: {
              type: 'string',
              description: 'Optional file type/category (e.g. "component", "config", "test")'
            }
          },
          required: ['path', 'content']
        }
      }
    }
  ];
}

// ══════════════════════════════════════════════════════════════
// TOOL EXECUTORS
// ══════════════════════════════════════════════════════════════
// Each executor receives args (object) and context (the AgentLoop instance).
// Returns a string result.

/**
 * File system abstraction — in a real Android WebView bridge these would
 * call into native code. Here we provide an in-memory virtual FS with
 * graceful fallback so the module is self-contained and testable.
 */
class VirtualFS {
  constructor() {
    this._files = new Map();
    this._dirs = new Set(['/', '/src', '/js', '/css']);
  }

  read(path) {
    const norm = this._normalize(path);
    if (!this._files.has(norm)) {
      throw new Error(`File not found: ${path}`);
    }
    return this._files.get(norm);
  }

  write(path, content) {
    const norm = this._normalize(path);
    this._files.set(norm, content);
    this._ensureParentDir(norm);
    return `File written: ${path} (${content.length} bytes)`;
  }

  patch(path, oldString, newString) {
    const content = this.read(path);
    if (!content.includes(oldString)) {
      throw new Error(`old_string not found in ${path}. Ensure exact match.`);
    }
    const occurrences = content.split(oldString).length - 1;
    if (occurrences > 1) {
      throw new Error(`old_string appears ${occurrences} times in ${path}. Provide more context for uniqueness.`);
    }
    const updated = content.replace(oldString, newString);
    this._files.set(this._normalize(path), updated);
    return `File patched: ${path} (replaced ${oldString.length} chars → ${newString.length} chars)`;
  }

  list(dirPath = '/') {
    const norm = this._normalize(dirPath);
    const entries = [];
    // Collect direct children
    const prefix = norm === '/' ? '/' : norm + '/';
    const seen = new Set();

    for (const filePath of this._files.keys()) {
      if (filePath.startsWith(prefix)) {
        const remainder = filePath.slice(prefix.length);
        const firstSlash = remainder.indexOf('/');
        if (firstSlash === -1) {
          // Direct file
          entries.push({ name: remainder, type: 'file', size: this._files.get(filePath).length });
          seen.add(remainder);
        } else {
          // Subdirectory
          const dirName = remainder.slice(0, firstSlash);
          if (!seen.has(dirName)) {
            entries.push({ name: dirName, type: 'dir' });
            seen.add(dirName);
          }
        }
      }
    }

    for (const dir of this._dirs) {
      if (dir.startsWith(prefix)) {
        const remainder = dir.slice(prefix.length);
        if (remainder && !remainder.includes('/') && !seen.has(remainder)) {
          entries.push({ name: remainder, type: 'dir' });
          seen.add(remainder);
        }
      }
    }

    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return entries;
  }

  search(query, searchPath = '/') {
    const norm = this._normalize(searchPath);
    const results = [];
    const regex = this._tryRegex(query);

    for (const [filePath, content] of this._files) {
      if (!filePath.startsWith(norm)) continue;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const isMatch = regex ? regex.test(lines[i]) : lines[i].includes(query);
        if (isMatch) {
          results.push({
            file: filePath,
            line: i + 1,
            content: lines[i].trim()
          });
        }
      }
    }

    return results;
  }

  exists(path) {
    return this._files.has(this._normalize(path));
  }

  _normalize(path) {
    if (!path.startsWith('/')) path = '/' + path;
    // Collapse double slashes
    return path.replace(/\/+/g, '/');
  }

  _ensureParentDir(filePath) {
    const lastSlash = filePath.lastIndexOf('/');
    if (lastSlash > 0) {
      const dir = filePath.slice(0, lastSlash);
      if (!this._dirs.has(dir) && dir !== '') {
        this._dirs.add(dir);
        this._ensureParentDir(dir);
      }
    }
  }

  _tryRegex(str) {
    try {
      return new RegExp(str);
    } catch {
      return null;
    }
  }
}

/**
 * Simulated command runner — in production this would bridge to a
 * native terminal or shell. Returns stdout/stderr/exitCode.
 */
function simulateCommand(command) {
  const trimmed = command.trim();

  // echo
  if (trimmed.startsWith('echo ')) {
    return { stdout: trimmed.slice(5), stderr: '', exitCode: 0 };
  }

  // pwd
  if (trimmed === 'pwd') {
    return { stdout: '/project', stderr: '', exitCode: 0 };
  }

  // whoami
  if (trimmed === 'whoami') {
    return { stdout: 'codex', stderr: '', exitCode: 0 };
  }

  // date
  if (trimmed === 'date') {
    return { stdout: new Date().toString(), stderr: '', exitCode: 0 };
  }

  // node --version
  if (trimmed === 'node --version' || trimmed === 'node -v') {
    return { stdout: 'v18.17.0', stderr: '', exitCode: 0 };
  }

  // npm test (simulated)
  if (trimmed.startsWith('npm test') || trimmed.startsWith('npm run test')) {
    return {
      stdout: '> codex-project@1.0.0 test\n> jest\n\nPASS  src/index.test.js\nTests: 3 passed, 3 total',
      stderr: '',
      exitCode: 0
    };
  }

  // git status (simulated)
  if (trimmed === 'git status' || trimmed.startsWith('git status')) {
    return {
      stdout: 'On branch main\nChanges not staged for commit:\n  (use "git add <file>..." to update)\n\nno changes added to commit',
      stderr: '',
      exitCode: 0
    };
  }

  // Unknown command — simulate with a generic response
  return {
    stdout: '',
    stderr: `Command "${trimmed}" executed in sandbox (simulated).`,
    exitCode: 0
  };
}

/**
 * Lightweight static code analyzer — provides complexity metrics,
 * pattern detection, and suggestions.
 */
function analyzeCode(code, language) {
  const lines = code.split('\n');
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  const commentLines = nonEmpty.filter(l => {
    const t = l.trim();
    return t.startsWith('//') || t.startsWith('#') || t.startsWith('*') || t.startsWith('/*');
  });

  // Simple complexity: count branching keywords
  const branchKeywords = /\b(if|else|for|while|switch|case|catch|&&|\|\|)\b/g;
  const branches = (code.match(branchKeywords) || []).length;

  // Function detection
  const funcPattern = /\b(function\s+\w+|(\w+)\s*=\s*(async\s+)?\([^)]*\)\s*=>|(\w+)\s*=\s*(async\s+)?function)/g;
  const functions = (code.match(funcPattern) || []).length;

  // Long line detection
  const longLines = lines.filter(l => l.length > 120);

  // Duplicate line detection
  const lineMap = {};
  let duplicates = 0;
  for (const l of nonEmpty) {
    const t = l.trim();
    if (t.length > 10) {
      lineMap[t] = (lineMap[t] || 0) + 1;
      if (lineMap[t] === 2) duplicates++;
    }
  }

  // TODO / FIXME detection
  const todos = (code.match(/\b(TODO|FIXME|HACK|XXX)\b/g) || []).length;

  const cyclomaticComplexity = 1 + branches;
  const commentRatio = nonEmpty.length > 0
    ? ((commentLines.length / nonEmpty.length) * 100).toFixed(1)
    : '0.0';

  return {
    language,
    metrics: {
      totalLines: lines.length,
      codeLines: nonEmpty.length - commentLines.length,
      commentLines: commentLines.length,
      commentRatio: `${commentRatio}%`,
      functions,
      cyclomaticComplexity,
      longLines: longLines.length,
      duplicateBlocks: duplicates,
      todoCount: todos
    },
    assessment: cyclomaticComplexity > 10
      ? 'High complexity — consider refactoring.'
      : cyclomaticComplexity > 5
        ? 'Moderate complexity — acceptable.'
        : 'Low complexity — clean.',
    suggestions: [
      ...longLines.length > 0 ? [`${longLines.length} line(s) exceed 120 chars — consider wrapping.`] : [],
      ...duplicates > 0 ? [`${duplicates} potential duplicate block(s) detected.`] : [],
      ...todos > 0 ? [`${todos} TODO/FIXME marker(s) found.`] : [],
      ...commentRatio < 10 ? ['Low comment ratio — consider adding documentation.'] : []
    ]
  };
}

// ══════════════════════════════════════════════════════════════
// APPROVAL HELPERS
// ══════════════════════════════════════════════════════════════

const FILE_WRITE_TOOLS = new Set(['write_file', 'patch_file', 'create_file']);
const COMMAND_TOOLS = new Set(['run_command']);

// ══════════════════════════════════════════════════════════════
// AGENT LOOP CLASS
// ══════════════════════════════════════════════════════════════

class AgentLoop {

  /**
   * @param {Object} config Configuration object
   * @param {string} config.apiKey GLM API key
   * @param {string} [config.model] Model identifier (default: 'glm-4-plus')
   * @param {number} [config.maxIterations] Max loop iterations (default: 25)
   * @param {'suggest'|'auto-edit'|'full-auto'} [config.approvalMode] Approval mode
   * @param {Function} [config.onReasoning] Called with reasoning/thinking text
   * @param {Function} [config.onToolCall] Called when a tool is invoked
   * @param {Function} [config.onToolResult] Called with tool execution result
   * @param {Function} [config.onMessage] Called with assistant text messages
   * @param {Function} [config.onApproval] Called for approval (returns Promise<boolean>)
   * @param {Function} [config.onDone] Called when the loop completes
   * @param {string} [config.baseUrl] Override API base URL
   * @param {Object} [config.fs] Inject a custom filesystem (VirtualFS by default)
   */
  constructor(config = {}) {
    this.apiKey = config.apiKey || '';
    this.model = config.model || 'glm-4-plus';
    this.maxIterations = config.maxIterations || 25;
    this.approvalMode = config.approvalMode || 'suggest';
    this.baseUrl = config.baseUrl || GLM_API_URL;

    // Callbacks
    this.onReasoning = config.onReasoning || (() => {});
    this.onReasoningChunk = config.onReasoningChunk || null;
    this.onContentChunk = config.onContentChunk || null;
    this.onToolCall = config.onToolCall || (() => {});
    this.onToolResult = config.onToolResult || (() => {});
    this.onMessage = config.onMessage || (() => {});
    this.onApproval = config.onApproval || (async () => true);
    this.onDone = config.onDone || (() => {});

    // Tools
    this.tools = buildToolDefinitions();
    this.systemPrompt = buildSystemPrompt(this.tools);

    // Filesystem
    this.fs = config.fs || new VirtualFS();

    // State
    this.history = [];
    this._stopped = false;
    this._running = false;
    this._abortController = null;

    // Stats
    this.promptTokens = 0;
    this.completionTokens = 0;
    this.iterations = 0;
    this.toolCallLog = [];
  }

  // ═══════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════

  /**
   * Run the agent loop with a user message.
   * @param {string} userMessage
   * @returns {Promise<{response: string, iterations: number, toolCalls: Array}>}
   */
  async run(userMessage) {
    if (this._running) {
      throw new Error('Agent loop is already running. Call stop() first.');
    }

    this._stopped = false;
    this._running = true;
    this._abortController = (typeof AbortController !== 'undefined')
      ? new AbortController()
      : null;

    // Add user message to history
    this.history.push({ role: 'user', content: userMessage });

    let finalResponse = '';

    try {
      for (let i = 0; i < this.maxIterations; i++) {
        if (this._stopped) break;

        this.iterations++;

        // Check for context compaction
        await this._maybeCompactContext();

        // Build messages array
        const messages = this._buildMessages();

        // Call the API
        const apiResponse = await this._callAPI(messages);

        if (!apiResponse) {
          finalResponse = 'Error: No response from API.';
          break;
        }

        // Track token usage
        if (apiResponse.usage) {
          this.promptTokens += apiResponse.usage.prompt_tokens || 0;
          this.completionTokens += apiResponse.usage.completion_tokens || 0;
        }

        const choice = apiResponse.choices && apiResponse.choices[0];
        if (!choice) {
          finalResponse = 'Error: Empty response from API.';
          break;
        }

        const message = choice.message || choice.delta || {};
        const content = message.content || '';
        const reasoning = message.reasoning_content || message.thinking || '';
        const toolCalls = message.tool_calls || [];

        // Emit reasoning
        if (reasoning) {
          this.onReasoning({
            text: reasoning,
            iteration: i + 1
          });
        }

        // If there are tool calls, process them
        if (toolCalls && toolCalls.length > 0) {
          // Add assistant message with tool calls to history
          this.history.push({
            role: 'assistant',
            content: content || null,
            reasoning_content: reasoning || undefined,
            tool_calls: toolCalls
          });

          // Emit text content if present (assistant explanation)
          if (content) {
            this.onMessage({ text: content, type: 'assistant' });
          }

          // Execute each tool call
          for (const toolCall of toolCalls) {
            if (this._stopped) break;

            const toolName = toolCall.function.name;
            let toolArgs;

            try {
              toolArgs = JSON.parse(toolCall.function.arguments || '{}');
            } catch {
              toolArgs = {};
            }

            // Emit tool call event
            this.onToolCall({
              id: toolCall.id,
              name: toolName,
              args: toolArgs,
              iteration: i + 1
            });

            // Check approval
            const approved = await this._checkApproval(toolName, toolArgs);
            if (!approved) {
              const denyResult = JSON.stringify({
                error: 'Tool execution denied by user.',
                tool: toolName,
                denied: true
              });

              this.history.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: denyResult
              });

              this.onToolResult({
                id: toolCall.id,
                name: toolName,
                result: denyResult,
                denied: true,
                iteration: i + 1
              });

              this.toolCallLog.push({
                name: toolName,
                args: toolArgs,
                result: denyResult,
                denied: true,
                iteration: i + 1,
                timestamp: Date.now()
              });
              continue;
            }

            // Execute the tool
            const result = await this._executeTool(toolName, toolArgs);

            // Add result to history
            this.history.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: typeof result === 'string' ? result : JSON.stringify(result)
            });

            // Emit tool result
            this.onToolResult({
              id: toolCall.id,
              name: toolName,
              result: typeof result === 'string' ? result : JSON.stringify(result),
              iteration: i + 1
            });

            this.toolCallLog.push({
              name: toolName,
              args: toolArgs,
              result: typeof result === 'string' ? result : JSON.stringify(result),
              iteration: i + 1,
              timestamp: Date.now()
            });
          }

          // Continue loop for next iteration
          continue;
        }

        // No tool calls — we have a text response, the loop is done
        if (content) {
          finalResponse = content;
          this.history.push({ role: 'assistant', content });
          this.onMessage({ text: content, type: 'assistant' });
        }

        // Check finish reason
        const finishReason = choice.finish_reason;
        if (finishReason === 'stop' || finishReason === 'end_turn' || !toolCalls.length) {
          break;
        }
      }

      if (!finalResponse && !this._stopped) {
        finalResponse = 'Agent loop completed without a final response.';
      }

    } catch (err) {
      finalResponse = `Agent error: ${err.message}`;
    } finally {
      this._running = false;
      this._abortController = null;
    }

    const result = {
      response: finalResponse,
      iterations: this.iterations,
      toolCalls: this.toolCallLog.slice()
    };

    try {
      await this.onDone(result);
    } catch (e) {
      console.warn('onDone callback error:', e);
    }
    return result;
  }

  /**
   * Stop the running agent loop.
   */
  stop() {
    this._stopped = true;
    if (this._abortController) {
      this._abortController.abort();
    }
  }

  /**
   * Clear conversation history and reset stats.
   */
  clearHistory() {
    this.history = [];
    this.promptTokens = 0;
    this.completionTokens = 0;
    this.iterations = 0;
    this.toolCallLog = [];
    this._stopped = false;
  }

  /**
   * Get token usage statistics.
   * @returns {{promptTokens: number, completionTokens: number, iterations: number}}
   */
  getTokenStats() {
    return {
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      iterations: this.iterations
    };
  }

  /**
   * Get the full tool call log.
   * @returns {Array}
   */
  getToolCallLog() {
    return this.toolCallLog.slice();
  }

  /**
   * Estimate the current context size in characters.
   * @returns {number}
   */
  getContextSize() {
    let total = this.systemPrompt.length;
    for (const msg of this.history) {
      total += (msg.content || '').length;
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          total += JSON.stringify(tc).length;
        }
      }
    }
    return total;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE: MESSAGE BUILDING
  // ═══════════════════════════════════════════════════════════

  /**
   * Build the messages array for the API call.
   * @private
   */
  _buildMessages() {
    const messages = [{ role: 'system', content: this.systemPrompt }];

    for (const msg of this.history) {
      const entry = { role: msg.role };

      if (msg.content !== undefined && msg.content !== null) {
        entry.content = msg.content;
      }

      if (msg.tool_calls) {
        entry.tool_calls = msg.tool_calls;
      }

      if (msg.tool_call_id) {
        entry.tool_call_id = msg.tool_call_id;
      }

      // For tool role messages, always include content
      if (msg.role === 'tool') {
        entry.content = msg.content || '';
      }

      messages.push(entry);
    }

    return messages;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE: API CALL
  // ═══════════════════════════════════════════════════════════

  /**
   * Call the GLM chat completions API.
   * @private
   */
  async _callAPI(messages) {
    const body = {
      model: this.model,
      messages,
      tools: this.tools,
      tool_choice: 'auto',
      temperature: this.temperature ?? 0.3,
      stream: true   // ✅ SSE streaming — matches Codex CLI architecture
    };

    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    };

    if (this._abortController) {
      fetchOptions.signal = this._abortController.signal;
    }

    // ── Retry logic for transient API failures ──
    let response;
    const _sleep = (ms) => new Promise(r => setTimeout(r, ms));

    for (let _attempt = 0; ; _attempt++) {
      try {
        response = await fetch(this.baseUrl, fetchOptions);
      } catch (netErr) {
        // Network error (fetch threw) — retry up to 2 times
        if (this._abortController?.signal?.aborted) throw netErr;
        if (_attempt < 2) {
          console.warn(`Network error (attempt ${_attempt + 1}/2), retrying in 2s…`, netErr.message);
          await _sleep(2000);
          continue;
        }
        throw new Error(`网络错误，请检查连接后重试: ${netErr.message}`);
      }

      if (response.ok) break; // ✅ success — proceed to SSE parsing

      const status = response.status;

      // 401 — auth failure, never retry
      if (status === 401) {
        throw new Error('API Key 无效或已过期，请在设置中更新');
      }

      // 429 — rate-limited, wait 2s, retry up to 3 times
      if (status === 429) {
        if (_attempt < 3) {
          console.warn(`Rate-limited (429), attempt ${_attempt + 1}/3, retrying in 2s…`);
          await _sleep(2000);
          continue;
        }
        const errText = await response.text().catch(() => '');
        throw new Error(`API 频率限制 (429): ${errText || response.statusText}`);
      }

      // 500 / 502 / 503 — server error, wait 1s, retry up to 3 times
      if (status === 500 || status === 502 || status === 503) {
        if (_attempt < 3) {
          console.warn(`Server error (${status}), attempt ${_attempt + 1}/3, retrying in 1s…`);
          await _sleep(1000);
          continue;
        }
        const errText = await response.text().catch(() => '');
        throw new Error(`API error ${status}: ${errText || response.statusText}`);
      }

      // Other 4xx errors — no retry
      const errText = await response.text().catch(() => '');
      throw new Error(`API error ${status}: ${errText || response.statusText}`);
    }

    // ── Parse SSE stream ──
    // Accumulate content, reasoning, and tool_calls from incremental deltas
    const result = {
      choices: [{
        message: {
          role: 'assistant',
          content: '',
          reasoning_content: '',
          tool_calls: []
        },
        finish_reason: null
      }],
      usage: null
    };

    const msg = result.choices[0].message;
    let lastReasoningChunk = '';
    let lastContentChunk = '';

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        let chunk;
        try { chunk = JSON.parse(data); } catch { continue; }

        const choice = chunk.choices?.[0];
        if (!choice) {
          if (chunk.usage) result.usage = chunk.usage;
          continue;
        }

        const delta = choice.delta;
        
        // Capture finish_reason
        if (choice.finish_reason) {
          result.choices[0].finish_reason = choice.finish_reason;
        }
        
        if (!delta) {
          if (chunk.usage) result.usage = chunk.usage;
          continue;
        }

        // ── Stream reasoning_content live ──
        if (delta.reasoning_content) {
          msg.reasoning_content += delta.reasoning_content;
          // Emit incremental reasoning for live display
          if (typeof this.onReasoningChunk === 'function') {
            this.onReasoningChunk(delta.reasoning_content);
          }
          lastReasoningChunk = delta.reasoning_content;
        }

        // ── Stream content live ──
        if (delta.content) {
          msg.content += delta.content;
          // Emit incremental content for live display
          if (typeof this.onContentChunk === 'function') {
            this.onContentChunk(delta.content);
          }
          lastContentChunk = delta.content;
        }

        // ── Accumulate tool_calls from deltas ──
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!msg.tool_calls[idx]) {
              msg.tool_calls[idx] = {
                id: tc.id || '',
                type: 'function',
                function: { name: '', arguments: '' }
              };
            }
            if (tc.id) msg.tool_calls[idx].id = tc.id;
            if (tc.function?.name) msg.tool_calls[idx].function.name += tc.function.name;
            if (tc.function?.arguments) msg.tool_calls[idx].function.arguments += tc.function.arguments;
          }
        }

        // Capture usage
        if (chunk.usage) result.usage = chunk.usage;
      }
    }

    // Clean up empty tool_calls array
    if (msg.tool_calls.length === 0) delete msg.tool_calls;
    if (!msg.reasoning_content) delete msg.reasoning_content;
    if (!msg.content) msg.content = '';

    return result;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE: APPROVAL SYSTEM
  // ═══════════════════════════════════════════════════════════

  /**
   * Check whether a tool call requires user approval based on the current mode.
   * @private
   * @returns {Promise<boolean>}
   */
  async _checkApproval(toolName, args) {
    switch (this.approvalMode) {
      case 'full-auto':
        // Execute everything without asking
        return true;

      case 'auto-edit':
        // Auto-approve file operations, ask for commands
        if (COMMAND_TOOLS.has(toolName)) {
          return this.onApproval({ tool: toolName, args, mode: 'auto-edit' });
        }
        return true;

      case 'suggest':
      default:
        // Ask before ANY tool execution
        return this.onApproval({ tool: toolName, args, mode: 'suggest' });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE: TOOL EXECUTION
  // ═══════════════════════════════════════════════════════════

  /**
   * Execute a tool by name with the given arguments.
   * @private
   */
  async _executeTool(toolName, args) {
    try {
      switch (toolName) {
        case 'read_file':
          return await this._toolReadFile(args);

        case 'write_file':
          return await this._toolWriteFile(args);

        case 'patch_file':
          return await this._toolPatchFile(args);

        case 'search_files':
          return await this._toolSearchFiles(args);

        case 'list_files':
          return await this._toolListFiles(args);

        case 'run_command':
          return await this._toolRunCommand(args);

        case 'analyze':
          return await this._toolAnalyze(args);

        case 'create_file':
          return await this._toolCreateFile(args);

        default:
          return JSON.stringify({ error: `Unknown tool: ${toolName}` });
      }
    } catch (err) {
      return JSON.stringify({ error: err.message, tool: toolName });
    }
  }

  /**
   * 兼容 VirtualFS (同步) 和 FileManager (异步 IndexedDB)
   */
  async _fsRead(path) {
    // VirtualFS.sync read
    if (typeof this.fs.read === 'function') {
      return this.fs.read(path);
    }
    // FileManager async read
    if (typeof this.fs.readFile === 'function') {
      const data = await this.fs.readFile(path);
      if (!data) throw new Error(`File not found: ${path}`);
      return typeof data === 'string' ? data : data.content;
    }
    throw new Error('No file system read method available');
  }

  async _fsWrite(path, content) {
    if (typeof this.fs.write === 'function') {
      return this.fs.write(path, content);
    }
    if (typeof this.fs.writeFile === 'function') {
      await this.fs.writeFile(path, content);
      return `File written: ${path} (${content.length} bytes)`;
    }
    throw new Error('No file system write method available');
  }

  async _fsPatch(path, oldStr, newStr) {
    if (typeof this.fs.patch === 'function') {
      return this.fs.patch(path, oldStr, newStr);
    }
    if (typeof this.fs.patchFile === 'function') {
      const ok = await this.fs.patchFile(path, oldStr, newStr);
      if (!ok) throw new Error(`Patch failed: old_string not found in ${path}`);
      return `File patched: ${path}`;
    }
    throw new Error('No file system patch method available');
  }

  async _fsList(path) {
    if (typeof this.fs.list === 'function') {
      return this.fs.list(path);
    }
    if (typeof this.fs.listFiles === 'function') {
      const items = await this.fs.listFiles(path);
      return items.map(f => ({ name: f.name, type: f.isFolder ? 'dir' : 'file', size: f.size || 0 }));
    }
    return [];
  }

  async _fsSearch(query, path) {
    if (typeof this.fs.search === 'function') {
      return this.fs.search(query, path);
    }
    if (typeof this.fs.searchFiles === 'function') {
      return await this.fs.searchFiles(query, path);
    }
    return [];
  }

  async _toolReadFile({ path }) {
    const content = await this._fsRead(path);
    const truncated = content.length > MAX_FILE_READ_CHARS;
    const result = truncated
      ? content.slice(0, MAX_FILE_READ_CHARS) + '\n... [truncated]'
      : content;
    return result;
  }

  async _toolWriteFile({ path, content }) {
    return await this._fsWrite(path, content);
  }

  async _toolPatchFile({ path, old_string, new_string }) {
    return await this._fsPatch(path, old_string, new_string);
  }

  async _toolSearchFiles({ query, path }) {
    const results = await this._fsSearch(query, path || '/');
    if (!results || results.length === 0) {
      return 'No matches found.';
    }
    const formatted = results.map(r =>
      `${r.file || r.path}:${r.line || ''}: ${r.content || r.match || ''}`
    ).join('\n');
    return `${results.length} match(es) found:\n${formatted}`;
  }

  async _toolListFiles({ path }) {
    const entries = await this._fsList(path || '/');
    if (!entries || entries.length === 0) {
      return 'Directory is empty or does not exist.';
    }
    const formatted = entries.map(e => {
      const icon = e.type === 'dir' ? '📁' : '📄';
      const size = e.size ? ` (${e.size} bytes)` : '';
      return `${icon} ${e.name}${size}`;
    }).join('\n');
    return formatted;
  }

  async _toolRunCommand({ command }) {
    const result = simulateCommand(command);
    const parts = [];
    if (result.stdout) parts.push(`stdout:\n${result.stdout}`);
    if (result.stderr) parts.push(`stderr:\n${result.stderr}`);
    parts.push(`exit code: ${result.exitCode}`);
    return parts.join('\n');
  }

  _toolAnalyze({ code, language }) {
    const analysis = analyzeCode(code, language || 'unknown');
    return JSON.stringify(analysis, null, 2);
  }

  async _toolCreateFile({ path, content, type }) {
    const writeResult = await this._fsWrite(path, content);
    const typeInfo = type ? ` (type: ${type})` : '';
    return `${writeResult}${typeInfo}`;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE: CONTEXT COMPACTION
  // ═══════════════════════════════════════════════════════════

  /**
   * Estimate token count (chars / 4 heuristic).
   * @private
   */
  _estimateTokens(text) {
    return Math.ceil((text || '').length / 4);
  }

  /**
   * If the context exceeds the threshold, compact it by summarizing
   * older messages and keeping only the most recent ones.
   * @private
   */
  async _maybeCompactContext() {
    const contextSize = this.getContextSize();
    if (contextSize <= CONTEXT_CHAR_THRESHOLD) {
      return;
    }

    // Determine split point
    const totalMessages = this.history.length;
    if (totalMessages <= COMPACT_KEEP_MESSAGES) {
      return; // Not enough to compact
    }

    const oldMessages = this.history.slice(0, totalMessages - COMPACT_KEEP_MESSAGES);
    const recentMessages = this.history.slice(totalMessages - COMPACT_KEEP_MESSAGES);

    // Build a text summary of old messages
    const oldText = oldMessages.map(msg => {
      const role = msg.role;
      let text = `[${role}]`;
      if (msg.content) text += ` ${msg.content}`;
      if (msg.tool_calls) {
        text += ` [tool_calls: ${msg.tool_calls.map(tc => tc.function.name).join(', ')}]`;
      }
      return text;
    }).join('\n');

    // Generate a summary via a lightweight API call
    let summary;
    try {
      summary = await this._generateSummary(oldText);
    } catch {
      // Fallback: crude truncation
      summary = `[Context compacted. Previous ${oldMessages.length} messages summarized.]\n` +
                oldText.slice(0, 2000) + '\n[...truncated]';
    }

    // Rebuild history: summary + recent messages
    this.history = [
      {
        role: 'user',
        content: `[Context Summary — previous conversation compacted]\n\n${summary}`
      },
      {
        role: 'assistant',
        content: 'Understood. I have the context summary and will continue from here.'
      },
      ...recentMessages
    ];
  }

  /**
   * Generate a summary of the conversation using a separate API call.
   * @private
   */
  async _generateSummary(text) {
    const messages = [
      {
        role: 'system',
        content: 'You are a context compactor. Summarize the following conversation history concisely, preserving key decisions, file changes, tool results, and any errors encountered. Keep it under 2000 characters.'
      },
      {
        role: 'user',
        content: text
      }
    ];

    const body = {
      model: this.model,
      messages,
      temperature: 0,
      stream: false,
      max_tokens: 500
    };

    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    };

    if (this._abortController) {
      fetchOptions.signal = this._abortController.signal;
    }

    const response = await fetch(this.baseUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`Summary API error: ${response.status}`);
    }

    const data = await response.json();
    const choice = data.choices && data.choices[0];
    return (choice && (choice.message?.content || choice.delta?.content)) || '';
  }
}

// ══════════════════════════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════════════════════════

export { AgentLoop, VirtualFS };
export default AgentLoop;
