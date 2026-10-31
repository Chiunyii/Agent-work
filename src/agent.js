// The agent loop: ask Claude, run the tools it calls, feed the results back,
// and repeat until it answers. Every step is emitted as an event for the UI,
// tagged with the agent's id so a team can share one event stream.
import { EventEmitter } from 'node:events';
import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFINITIONS, NEEDS_APPROVAL, validateInput, runTool } from './tools.js';

export const BASE_PROMPT = `You work inside a workspace folder on the user's computer. You can list, read and write files there, run shell commands there, and search the web. Work in small, verifiable steps: look before you change things, and after you write code, run it to check that it works. If a command is declined, find another way or explain what you need.

When you finish, reply with a short summary of what you did and where the results are. Reply in the language the user writes in (for Traditional Chinese, use Traditional Chinese).`;

const MAX_STEPS = 40; // model calls per message, so a confused run can't loop forever
const MAX_JSON_RETRIES = 2;

export class Agent extends EventEmitter {
  constructor({
    id = 'agent',
    name = 'Agent',
    system = `You are Agent-work, an autonomous assistant.\n\n${BASE_PROMPT}`,
    workspace,
    model = 'claude-opus-5-5',
    effort = 'high',
    autoApprove = false,
    webSearch = true,
    extraTools = [], // [{ definition, run(input, { id }), summary?(input) }] handled by the caller, e.g. delegation
    client = new Anthropic(),
  }) {
    super();
    Object.assign(this, { id, name, system, workspace, model, effort, autoApprove, client });
    this.handlers = new Map(extraTools.map((t) => [t.definition.name, t]));
    this.clientTools = [...TOOL_DEFINITIONS, ...extraTools.map((t) => t.definition)];
    this.tools = [...this.clientTools];
    if (webSearch) this.tools.push({ type: 'web_search_20260209', name: 'web_search', max_uses: 5 });
    this.messages = [];
    this.busy = false;
    this.usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
    this.pendingApprovals = new Map();
    this.stream = null;
    this.abort = null;
  }

  send(event) {
    this.emit('event', { agent: this.id, ...event });
  }

  status(status, detail = '', tool = '') {
    this.send({ type: 'status', status, detail, ...(tool && { tool }) });
  }

  reset() {
    if (this.busy) throw new Error('agent is busy');
    this.messages = [];
    this.usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
    this.status('idle');
  }

  stop() {
    if (!this.busy) return;
    this.stopped = true;
    this.stream?.abort();
    this.abort?.abort();
    for (const resolve of this.pendingApprovals.values()) resolve(false);
    this.pendingApprovals.clear();
  }

  approve(id, allow) {
    const resolve = this.pendingApprovals.get(id);
    if (!resolve) return false;
    this.pendingApprovals.delete(id);
    resolve(Boolean(allow));
    return true;
  }

  // Add the user's text. If a stopped turn left the history ending on a user
  // message (e.g. tool results), append to it so roles keep alternating.
  addUserText(text) {
    const last = this.messages.at(-1);
    if (last?.role === 'user') {
      if (typeof last.content === 'string') last.content = [{ type: 'text', text: last.content }];
      last.content.push({ type: 'text', text });
    } else {
      this.messages.push({ role: 'user', content: text });
    }
  }

  // Run one message to completion. `from` names a teammate who assigned it.
  // Resolves to { ok, text } with the final reply; never throws.
  async run(text, { from } = {}) {
    if (this.busy) throw new Error('agent is busy');
    this.busy = true;
    this.stopped = false;
    this.abort = new AbortController();
    this.send(from ? { type: 'task', from, text } : { type: 'user', text });
    this.addUserText(from ? `${from} assigned you this task:\n\n${text}` : text);
    try {
      return { ok: true, text: await this.loop() };
    } catch (err) {
      if (this.stopped || err instanceof Anthropic.APIUserAbortError) {
        this.status('interrupted', '已停止');
        return { ok: false, text: 'stopped by the user' };
      }
      this.send({ type: 'error', message: describeError(err) });
      this.status('error', describeError(err));
      return { ok: false, text: describeError(err) };
    } finally {
      this.busy = false;
      this.stream = null;
      this.send({ type: 'usage', usage: { ...this.usage } });
    }
  }

  async loop() {
    let jsonRetries = 0;
    for (let step = 0; step < MAX_STEPS; step++) {
      if (this.stopped) throw new Anthropic.APIUserAbortError();
      this.status('thinking');
      const message = await this.callModel().catch((err) => {
        // With eager input streaming, unparseable tool JSON rejects here; retry that turn only.
        if (err instanceof Anthropic.APIError || this.stopped || jsonRetries >= MAX_JSON_RETRIES) throw err;
        jsonRetries++;
        return null;
      });
      if (!message) continue;
      jsonRetries = 0;
      this.addUsage(message.usage);

      if (message.stop_reason === 'refusal') {
        this.messages.push({ role: 'assistant', content: message.content });
        this.send({ type: 'turn_end', stop_reason: 'refusal' });
        this.status('error', '模型拒絕了這個請求');
        throw new Error('模型拒絕了這個請求');
      }
      if (message.stop_reason === 'pause_turn') {
        // A server tool (web search) paused a long turn; send it back to continue.
        this.messages.push({ role: 'assistant', content: message.content });
        continue;
      }

      const toolUses = message.content.filter((b) => b.type === 'tool_use');
      if (toolUses.length === 0) {
        this.messages.push({ role: 'assistant', content: message.content });
        this.send({ type: 'turn_end', stop_reason: message.stop_reason });
        this.status('done');
        return message.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      }
      if (message.stop_reason === 'max_tokens') {
        // A tool input cut off at max_tokens may parse as a valid but truncated object.
        throw new Error('工具參數超過輸出上限被截斷，請把任務拆小一點再試');
      }

      this.messages.push({ role: 'assistant', content: message.content });
      // Handed-off work (delegation) runs side by side; local tools run one at a time.
      const results = toolUses.every((b) => this.handlers.has(b.name))
        ? await Promise.all(toolUses.map((b) => this.callTool(b)))
        : await toolUses.reduce(async (acc, b) => [...(await acc), await this.callTool(b)], []);
      // All results go back in one user message so parallel tool calls keep working.
      this.messages.push({ role: 'user', content: results });
    }
    throw new Error(`超過 ${MAX_STEPS} 個步驟仍未完成，已暫停。可以再傳一則訊息讓它繼續。`);
  }

  async callModel() {
    const stream = this.client.beta.messages.stream({
      model: this.model,
      max_tokens: 64000,
      system: this.system,
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: this.effort },
      // If a safety classifier declines, the API retries on a suitable fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      cache_control: { type: 'ephemeral' },
      tools: this.tools,
      messages: this.messages,
    });
    this.stream = stream;

    stream.on('streamEvent', (event) => {
      if (event.type !== 'content_block_start') return;
      const block = event.content_block;
      if (block.type === 'thinking') this.status('thinking');
      else if (block.type === 'text') this.status('writing');
      else if (block.type === 'tool_use') this.status('running', `準備 ${block.name}…`, block.name);
      else if (block.type === 'server_tool_use') this.status('running', block.name, block.name);
      this.send({ type: 'block_start', kind: block.type, name: block.name });
    });
    stream.on('thinking', (delta) => this.send({ type: 'thinking_delta', text: delta }));
    stream.on('text', (delta) => this.send({ type: 'text_delta', text: delta }));
    stream.on('contentBlock', (block) => {
      if (block.type === 'server_tool_use') {
        this.send({ type: 'tool_start', id: block.id, name: block.name, input: block.input, server: true });
      } else if (block.type === 'web_search_tool_result') {
        const ok = Array.isArray(block.content);
        const output = ok
          ? block.content.map((r) => `${r.title}\n${r.url}`).join('\n\n')
          : `搜尋失敗：${block.content?.error_code}`;
        this.send({ type: 'tool_end', id: block.tool_use_id, ok, output });
      } else if (block.type === 'fallback') {
        this.send({ type: 'notice', text: `${block.from?.model} 拒絕，改由 ${block.to?.model} 接手` });
      }
    });

    return await stream.finalMessage();
  }

  async callTool(block) {
    const { id, name, input } = block;
    this.send({ type: 'tool_start', id, name, input });
    const result = (content, isError = false) => {
      this.send({ type: 'tool_end', id, ok: !isError, output: content });
      return { type: 'tool_result', tool_use_id: id, content, ...(isError && { is_error: true }) };
    };

    const invalid = validateInput(name, input, this.clientTools);
    if (invalid) return result(`INVALID_INPUT: ${invalid}`, true);
    if (this.stopped) return result('stopped by the user', true);

    const handler = this.handlers.get(name);
    if (handler) {
      this.status('running', handler.summary?.(input) ?? name, name);
      const { ok, text } = await handler.run(input, { id });
      return result(text, !ok);
    }

    if (NEEDS_APPROVAL.has(name) && !this.autoApprove) {
      this.status('waiting', `等你核准：${name}`, name);
      // Register the pending approval before announcing it, so an immediate answer isn't lost.
      const decision = new Promise((resolve) => this.pendingApprovals.set(id, resolve));
      this.send({ type: 'approval', id, name, input });
      const allowed = await decision;
      this.send({ type: 'approval_done', id, allowed });
      if (!allowed) return result('The user declined to run this.', true);
    }

    this.status('running', summarizeCall(name, input), name);
    try {
      return result(await runTool(name, input, { workspace: this.workspace, signal: this.abort.signal }));
    } catch (err) {
      return result(`Error: ${err.message}`, true);
    }
  }

  addUsage(usage) {
    if (!usage) return;
    this.usage.input_tokens += (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
    this.usage.cache_read_input_tokens += usage.cache_read_input_tokens ?? 0;
    this.usage.output_tokens += usage.output_tokens ?? 0;
    this.send({ type: 'usage', usage: { ...this.usage } });
  }
}

export function summarizeCall(name, input) {
  switch (name) {
    case 'run_command': return `執行指令：${input.command}`;
    case 'write_file': return `寫入 ${input.path}`;
    case 'read_file': return `讀取 ${input.path}`;
    case 'list_files': return `查看資料夾 ${input.path ?? '.'}`;
    default: return name;
  }
}

function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return '認證失敗：請設定有效的 ANTHROPIC_API_KEY';
  if (err instanceof Anthropic.RateLimitError) return '請求太頻繁（429），請稍後再試';
  if (err instanceof Anthropic.BadRequestError) return `請求格式錯誤（400）：${err.message}`;
  if (err instanceof Anthropic.APIError) return `API 錯誤 ${err.status ?? ''}：${err.message}`;
  return err?.message ?? String(err);
}
