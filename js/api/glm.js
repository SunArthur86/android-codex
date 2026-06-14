/**
 * GLM API Client
 * Handles chat completions, streaming, function-calling, and JWT auth
 * for the Zhipu BigModel (GLM) API.
 *
 * @module glm
 */

/* ── JWT helpers (HS256, browser-native, no deps) ───────────────────────── */

function _base64UrlEncode(input) {
  let bytes;
  if (input instanceof Uint8Array) {
    bytes = input;
  } else {
    bytes = new TextEncoder().encode(input);
  }
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  const b64 = btoa(str);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function _base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

async function _hmacSha256(keyStr, message) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(keyStr),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return new Uint8Array(sig);
}

/**
 * Generate a JWT token for GLM API authentication.
 * apiKey may be "id.secret" or a plain string (treated as id with empty secret).
 */
export function generateGLMToken(apiKey) {
  const parts = apiKey.split('.');
  const id = parts[0];
  const secret = parts.length > 1 ? parts.slice(1).join('.') : '';
  const payload = {
    api_key: id,
    exp: Math.floor(Date.now()) + 3600 * 1000,
    timestamp: Date.now(),
  };
  const header = { alg: 'HS256', sign_type: 'SIGN' };
  const headerEncoded = _base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = _base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerEncoded}.${payloadEncoded}`;

  return _hmacSha256(secret, signingInput).then((sig) => {
    const sigEncoded = _base64UrlEncode(sig);
    return `${signingInput}.${sigEncoded}`;
  });
}

/* ── GLM Client ─────────────────────────────────────────────────────────── */

export class GLMClient {
  /**
   * @param {Object} opts
   * @param {string} opts.apiKey      - GLM API key ("id.secret" format)
   * @param {string} [opts.model]     - Model name (default 'glm-4')
   * @param {number} [opts.temperature]
   * @param {string} [opts.baseUrl]   - API endpoint
   */
  constructor({
    apiKey = '',
    model = 'glm-4',
    temperature = 0.7,
    baseUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  } = {}) {
    this.apiKey = apiKey;
    this.model = model;
    this.temperature = temperature;
    this.baseUrl = baseUrl;
    this._totalTokens = 0;
    this._maxRetries = 3;
  }

  /* ── Config setters ─────────────────────────────────────────────────── */

  setApiKey(key) {
    this.apiKey = key;
  }

  setModel(model) {
    this.model = model;
  }

  setTemperature(temp) {
    this.temperature = temp;
  }

  getTotalTokens() {
    return this._totalTokens;
  }

  /* ── Auth ──────────────────────────────────────────────────────────── */

  async _getAuthHeaders() {
    const token = await generateGLMToken(this.apiKey);
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  /* ── Build request body ────────────────────────────────────────────── */

  _buildBody(messages, options = {}) {
    const body = {
      model: this.model,
      messages,
      temperature: options.temperature ?? this.temperature,
    };
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
      body.tool_choice = options.tool_choice ?? 'auto';
    }
    if (options.max_tokens != null) {
      body.max_tokens = options.max_tokens;
    }
    if (options.top_p != null) body.top_p = options.top_p;
    if (options.stop != null) body.stop = options.stop;
    return body;
  }

  /* ── Non-streaming chat ────────────────────────────────────────────── */

  /**
   * Send a chat completion request.
   * @param {Array} messages - [{role, content, tool_calls?}]
   * @param {Object} [options] - { tools, temperature, max_tokens }
   * @returns {Promise<{content, tool_calls, reasoning_content}>}
   */
  async chat(messages, options = {}) {
    const body = this._buildBody(messages, options);
    let lastError = null;

    for (let attempt = 0; attempt <= this._maxRetries; attempt++) {
      try {
        const headers = await this._getAuthHeaders();
        const res = await fetch(this.baseUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        if (res.status === 429 && attempt < this._maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          await this._sleep(delay);
          continue;
        }

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new GLMError(
            `GLM API error ${res.status}: ${errText}`,
            res.status,
            errText,
          );
        }

        const data = await res.json();

        // Accumulate tokens
        if (data.usage && data.usage.total_tokens) {
          this._totalTokens += data.usage.total_tokens;
        }

        const choice = data.choices && data.choices[0];
        if (!choice) {
          throw new GLMError('GLM API returned no choices', 200, JSON.stringify(data));
        }

        const msg = choice.message || {};
        return {
          content: msg.content || '',
          tool_calls: msg.tool_calls || null,
          reasoning_content: msg.reasoning_content || '',
          finish_reason: choice.finish_reason || null,
          usage: data.usage || null,
        };
      } catch (err) {
        lastError = err;
        // Only retry on network errors or 429
        if (err instanceof GLMError && err.status !== 429 && err.status >= 500 && attempt < this._maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          await this._sleep(delay);
          continue;
        }
        // Re-throw immediately for other client errors
        if (err instanceof GLMError && err.status >= 400 && err.status < 500 && err.status !== 429) {
          throw err;
        }
        // Retry on network errors
        if (!(err instanceof GLMError) && attempt < this._maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          await this._sleep(delay);
          continue;
        }
        throw err;
      }
    }

    throw lastError || new GLMError('Max retries exceeded', 500);
  }

  /* ── Streaming chat (callback) ─────────────────────────────────────── */

  /**
   * Streaming chat using callback for each chunk.
   * @param {Array} messages
   * @param {Object} [options]
   * @param {function} onChunk - called with each text delta
   * @returns {Promise<{content, tool_calls, reasoning_content}>}
   */
  async chatStream(messages, options = {}, onChunk) {
    if (typeof options === 'function') {
      onChunk = options;
      options = {};
    }

    const body = this._buildBody(messages, options);
    body.stream = true;

    let lastError = null;

    for (let attempt = 0; attempt <= this._maxRetries; attempt++) {
      try {
        const headers = await this._getAuthHeaders();
        const res = await fetch(this.baseUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        if (res.status === 429 && attempt < this._maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          await this._sleep(delay);
          continue;
        }

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new GLMError(
            `GLM API error ${res.status}: ${errText}`,
            res.status,
            errText,
          );
        }

        // Process SSE stream
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        let fullReasoning = '';
        let toolCalls = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Split on SSE boundaries
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (!trimmed.startsWith('data:')) continue;

            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') continue;

            try {
              const chunk = JSON.parse(dataStr);
              const choice = chunk.choices && chunk.choices[0];
              if (!choice) continue;

              const delta = choice.delta || {};

              if (delta.content) {
                fullContent += delta.content;
                if (onChunk) onChunk(delta.content);
              }

              if (delta.reasoning_content) {
                fullReasoning += delta.reasoning_content;
              }

              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index || 0;
                  if (!toolCalls[idx]) {
                    toolCalls[idx] = {
                      id: tc.id || '',
                      type: 'function',
                      function: { name: '', arguments: '' },
                    };
                  }
                  if (tc.function) {
                    if (tc.function.name) {
                      toolCalls[idx].function.name += tc.function.name;
                    }
                    if (tc.function.arguments) {
                      toolCalls[idx].function.arguments += tc.function.arguments;
                    }
                  }
                }
              }

              // Accumulate tokens from usage if present in stream
              if (chunk.usage && chunk.usage.total_tokens) {
                this._totalTokens += chunk.usage.total_tokens;
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }

        // Process any remaining buffer
        if (buffer.trim().startsWith('data:')) {
          const dataStr = buffer.trim().slice(5).trim();
          if (dataStr && dataStr !== '[DONE]') {
            try {
              const chunk = JSON.parse(dataStr);
              const choice = chunk.choices && chunk.choices[0];
              if (choice && choice.delta && choice.delta.content) {
                fullContent += choice.delta.content;
                if (onChunk) onChunk(choice.delta.content);
              }
              if (chunk.usage && chunk.usage.total_tokens) {
                this._totalTokens += chunk.usage.total_tokens;
              }
            } catch {
              // ignore
            }
          }
        }

        return {
          content: fullContent,
          tool_calls: toolCalls.length > 0 ? toolCalls : null,
          reasoning_content: fullReasoning,
        };
      } catch (err) {
        lastError = err;
        if (err instanceof GLMError && err.status >= 400 && err.status < 500 && err.status !== 429) {
          throw err;
        }
        if (attempt < this._maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          await this._sleep(delay);
          continue;
        }
        throw err;
      }
    }

    throw lastError || new GLMError('Max retries exceeded', 500);
  }

  /* ── Streaming chat (async generator) ──────────────────────────────── */

  /**
   * Async generator version of streaming chat.
   * @param {Array} messages
   * @param {Object} [options]
   * @yields {{ type, content }} chunks where type is 'content' | 'reasoning' | 'tool_call'
   */
  async *chatStreamGen(messages, options = {}) {
    const body = this._buildBody(messages, options);
    body.stream = true;

    let lastError = null;

    for (let attempt = 0; attempt <= this._maxRetries; attempt++) {
      try {
        const headers = await this._getAuthHeaders();
        const res = await fetch(this.baseUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        if (res.status === 429 && attempt < this._maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          await this._sleep(delay);
          continue;
        }

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new GLMError(
            `GLM API error ${res.status}: ${errText}`,
            res.status,
            errText,
          );
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let toolCalls = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;

            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') continue;

            try {
              const chunk = JSON.parse(dataStr);
              const choice = chunk.choices && chunk.choices[0];
              if (!choice) continue;

              const delta = choice.delta || {};

              if (delta.content) {
                yield { type: 'content', content: delta.content };
              }

              if (delta.reasoning_content) {
                yield { type: 'reasoning', content: delta.reasoning_content };
              }

              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index || 0;
                  if (!toolCalls[idx]) {
                    toolCalls[idx] = {
                      id: tc.id || '',
                      type: 'function',
                      function: { name: '', arguments: '' },
                    };
                  }
                  if (tc.function) {
                    if (tc.function.name) {
                      toolCalls[idx].function.name += tc.function.name;
                    }
                    if (tc.function.arguments) {
                      toolCalls[idx].function.arguments += tc.function.arguments;
                    }
                  }
                  yield {
                    type: 'tool_call',
                    content: {
                      index: idx,
                      id: tc.id || '',
                      name: tc.function?.name || '',
                      arguments: tc.function?.arguments || '',
                    },
                  };
                }
              }

              if (chunk.usage && chunk.usage.total_tokens) {
                this._totalTokens += chunk.usage.total_tokens;
              }
            } catch {
              // skip malformed
            }
          }
        }

        return;
      } catch (err) {
        lastError = err;
        if (err instanceof GLMError && err.status >= 400 && err.status < 500 && err.status !== 429) {
          throw err;
        }
        if (attempt < this._maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          await this._sleep(delay);
          continue;
        }
        throw err;
      }
    }

    throw lastError || new GLMError('Max retries exceeded', 500);
  }

  /* ── Utility ───────────────────────────────────────────────────────── */

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/* ── Custom error ───────────────────────────────────────────────────────── */

export class GLMError extends Error {
  constructor(message, status = 0, raw = '') {
    super(message);
    this.name = 'GLMError';
    this.status = status;
    this.raw = raw;
  }
}

export default GLMClient;
