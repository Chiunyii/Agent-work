#!/usr/bin/env node
// Start the agent with its web page, or run one task in the terminal with --task.
import fs from 'node:fs';
import nodePath from 'node:path';
import { execFile } from 'node:child_process';
import { parseArgs } from 'node:util';
import { Agent, summarizeCall } from '../src/agent.js';
import { createServer } from '../src/server.js';
import { fakeClient, DEMO_TURNS } from '../src/demo.js';

const { values: opts } = parseArgs({
  options: {
    port: { type: 'string', short: 'p', default: '4546' },
    host: { type: 'string', default: '127.0.0.1' },
    workspace: { type: 'string', short: 'w', default: 'workspace' },
    model: { type: 'string', default: 'claude-opus-5-5' },
    effort: { type: 'string', default: 'high' },
    'auto-approve': { type: 'boolean', default: false },
    'no-web': { type: 'boolean', default: false },
    'no-open': { type: 'boolean', default: false },
    demo: { type: 'boolean', default: false },
    task: { type: 'string', short: 't' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (opts.help) {
  console.log(`agent-work — 會自己規劃、使用工具的 AI Agent

用法：
  node bin/cli.js                 啟動網頁介面（預設 http://127.0.0.1:4546）
  node bin/cli.js -t "任務內容"    在終端機直接執行一個任務

選項：
  -p, --port <n>        網頁埠號（預設 4546）
      --host <addr>     綁定位址（預設 127.0.0.1，只有本機能連）
  -w, --workspace <dir> Agent 可以讀寫、執行指令的資料夾（預設 ./workspace）
      --model <id>      模型（預設 claude-opus-5-5）
      --effort <level>  low | medium | high | xhigh | max（預設 high）
      --auto-approve    執行指令前不詢問（小心使用）
      --no-web          關閉網路搜尋工具
      --no-open         不自動開瀏覽器
      --demo            示範模式：不呼叫 API，播放一段寫程式、執行的過程
  -h, --help            顯示說明

需要環境變數 ANTHROPIC_API_KEY（或已用 \`ant auth login\` 登入）。`);
  process.exit(0);
}

if (!opts.demo && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN && !process.env.ANTHROPIC_PROFILE) {
  console.warn('提醒：沒有設定 ANTHROPIC_API_KEY。若也沒用 `ant auth login` 登入，呼叫模型時會失敗。想先看看介面可以加 --demo。');
}

const workspace = nodePath.resolve(opts.workspace);
fs.mkdirSync(workspace, { recursive: true });

const agent = new Agent({
  workspace,
  model: opts.model,
  effort: opts.effort,
  autoApprove: opts['auto-approve'],
  webSearch: !opts['no-web'],
  ...(opts.demo && { client: fakeClient(DEMO_TURNS, { delayMs: 40 }) }),
});

if (opts.task) {
  await runInTerminal(opts.task);
} else {
  startServer();
}

function startServer() {
  const info = { model: opts.demo ? 'demo（未連線模型）' : opts.model, effort: opts.effort, workspace, autoApprove: agent.autoApprove };
  const server = createServer(agent, { info });
  server.listen(Number(opts.port), opts.host, () => {
    const url = `http://${opts.host === '0.0.0.0' ? 'localhost' : opts.host}:${server.address().port}`;
    console.log(`Agent-work 已啟動：${url}`);
    console.log(`工作資料夾：${workspace}`);
    if (!opts['no-open']) openBrowser(url);
  });
  process.on('SIGINT', () => { agent.stop(); server.close(); process.exit(0); });
}

async function runInTerminal(task) {
  const readline = await import('node:readline/promises');
  const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
  let section = null;
  const begin = (name) => { if (section !== name) { process.stdout.write(`\n\n[${name}]\n`); section = name; } };

  agent.on('event', async (e) => {
    switch (e.type) {
      case 'thinking_delta': begin('思考'); process.stdout.write(`\x1b[2m${e.text}\x1b[0m`); break;
      case 'text_delta': begin('回覆'); process.stdout.write(e.text); break;
      case 'tool_start': section = null; process.stdout.write(`\n\n⏳ ${e.server ? e.name : summarizeCall(e.name, e.input)}`); break;
      case 'tool_end': process.stdout.write(e.ok ? ' ✓' : ` ✗ ${String(e.output).slice(0, 200)}`); break;
      case 'notice': process.stdout.write(`\n(${e.text})`); break;
      case 'error': process.stdout.write(`\n❗ ${e.message}\n`); break;
      case 'approval': {
        if (!rl) {
          process.stdout.write(`\n（沒有終端機可以詢問，已拒絕：${e.input.command}。要自動允許請加 --auto-approve）`);
          agent.approve(e.id, false);
          break;
        }
        const answer = await rl.question(`\n要執行嗎？ ${e.input.command}  [y/N] `);
        agent.approve(e.id, /^y/i.test(answer));
        break;
      }
    }
  });
  process.on('SIGINT', () => agent.stop());
  await agent.run(task);
  const u = agent.usage;
  console.log(`\n\n(tokens：輸入 ${u.input_tokens}，快取讀取 ${u.cache_read_input_tokens}，輸出 ${u.output_tokens})`);
  rl?.close();
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  execFile(cmd, args, () => {}); // best effort; the URL is printed either way
}
