#!/usr/bin/env node
// Start the team with its web page, or run one task in the terminal with --task.
import fs from 'node:fs';
import nodePath from 'node:path';
import { execFile } from 'node:child_process';
import { parseArgs } from 'node:util';
import { summarizeCall } from '../src/agent.js';
import { Team, TEAM } from '../src/team.js';
import { createServer } from '../src/server.js';
import { demoClients } from '../src/demo.js';

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
  console.log(`agent-work — 會自己規劃、分工、使用工具的 AI 工作團隊

團隊：矮子（專案管理，你直接交代他）、阿關（公關媒體組）、小雅（社群行銷組）

用法：
  node bin/cli.js                 啟動網頁介面（預設 http://127.0.0.1:4546）
  node bin/cli.js -t "任務內容"    在終端機直接執行一個任務

選項：
  -p, --port <n>        網頁埠號（預設 4546，被占用時自動往後找）
      --host <addr>     綁定位址（預設 127.0.0.1，只有本機能連）
  -w, --workspace <dir> Agent 可以讀寫、執行指令的資料夾（預設 ./workspace）
      --model <id>      模型（預設 claude-opus-5-5）
      --effort <level>  low | medium | high | xhigh | max（預設 high）
      --auto-approve    執行指令前不詢問（小心使用）
      --no-web          關閉網路搜尋工具
      --no-open         不自動開瀏覽器
      --demo            示範模式：不呼叫 API，播放一段團隊分工的過程
  -h, --help            顯示說明

需要環境變數 ANTHROPIC_API_KEY（或已用 \`ant auth login\` 登入）。`);
  process.exit(0);
}

if (!opts.demo && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN && !process.env.ANTHROPIC_PROFILE) {
  console.warn('提醒：沒有設定 ANTHROPIC_API_KEY。若也沒用 `ant auth login` 登入，呼叫模型時會失敗。想先看看介面可以加 --demo。');
}

const workspace = nodePath.resolve(opts.workspace);
fs.mkdirSync(workspace, { recursive: true });

const team = new Team({
  workspace,
  model: opts.model,
  effort: opts.effort,
  autoApprove: opts['auto-approve'],
  webSearch: !opts['no-web'],
  ...(opts.demo && { clients: demoClients({ delayMs: 40 }) }),
});

if (opts.task) {
  await runInTerminal(opts.task);
} else {
  startServer();
}

function startServer() {
  const info = { model: opts.demo ? 'demo（未連線模型）' : opts.model, effort: opts.effort, workspace, autoApprove: team.autoApprove, team: team.info };
  const server = createServer(team, { info });
  let port = Number(opts.port);
  server.on('error', (err) => {
    // Port taken: try the next one, a few times.
    if (err.code === 'EADDRINUSE' && port < Number(opts.port) + 10) return server.listen(++port, opts.host);
    console.error(`無法啟動伺服器：${err.message}`);
    process.exit(1);
  });
  server.listen(port, opts.host, () => {
    const url = `http://${opts.host === '0.0.0.0' ? 'localhost' : opts.host}:${server.address().port}`;
    console.log(`Agent-work 已啟動：${url}`);
    console.log(`工作資料夾：${workspace}`);
    if (!opts['no-open']) openBrowser(url);
  });
  process.on('SIGINT', () => { team.stop(); server.close(); process.exit(0); });
}

async function runInTerminal(task) {
  const readline = await import('node:readline/promises');
  const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
  const names = Object.fromEntries(TEAM.map((m) => [m.id, m.name]));
  let section = null;
  // Teammates can work at the same time, so every section names who is speaking.
  const begin = (who, kind) => {
    const key = `${who}·${kind}`;
    if (section !== key) { process.stdout.write(`\n\n[${names[who] ?? who} ${kind}]\n`); section = key; }
  };

  team.on('event', async (e) => {
    const who = names[e.agent] ?? '';
    switch (e.type) {
      case 'task': section = null; process.stdout.write(`\n\n📋 ${e.from} → ${who}：${e.text.split('\n')[0]}`); break;
      case 'thinking_delta': begin(e.agent, '思考'); process.stdout.write(`\x1b[2m${e.text}\x1b[0m`); break;
      case 'text_delta': begin(e.agent, '回覆'); process.stdout.write(e.text); break;
      case 'tool_start': section = null; process.stdout.write(`\n\n⏳ ${who}：${e.server ? e.name : e.name === 'delegate' ? `交派給${names[e.input.member]}` : summarizeCall(e.name, e.input)}`); break;
      case 'tool_end': section = null; process.stdout.write(e.ok ? ` ✓` : ` ✗ ${String(e.output).slice(0, 200)}`); break;
      case 'notice': process.stdout.write(`\n(${e.text})`); break;
      case 'error': process.stdout.write(`\n❗ ${e.message}\n`); break;
      case 'approval': {
        if (!rl) {
          process.stdout.write(`\n（沒有終端機可以詢問，已拒絕：${e.input.command}。要自動允許請加 --auto-approve）`);
          team.approve(e.id, false);
          break;
        }
        const answer = await rl.question(`\n${who}要執行：${e.input.command}  可以嗎？[y/N] `);
        team.approve(e.id, /^y/i.test(answer));
        break;
      }
    }
  });
  process.on('SIGINT', () => team.stop());
  await team.run(task);
  const u = team.usage;
  console.log(`\n\n(tokens：輸入 ${u.input_tokens}，快取讀取 ${u.cache_read_input_tokens}，輸出 ${u.output_tokens})`);
  rl?.close();
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  execFile(cmd, args, () => {}); // best effort; the URL is printed either way
}
