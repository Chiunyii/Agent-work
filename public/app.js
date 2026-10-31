// Page logic: listens to the agent's event stream and draws the office + timeline.
const $ = (id) => document.getElementById(id);
const log = $('log');
const emptyState = $('empty').cloneNode(true); // shown again after a reset

const STATUS = {
  idle: { label: '閒置中', icon: '–', color: 'var(--muted)' },
  thinking: { label: '思考中', icon: '💭', color: 'var(--think)' },
  running: { label: '執行工具', icon: '⏳', color: 'var(--run)' },
  writing: { label: '撰寫回覆', icon: '✍️', color: 'var(--write)' },
  waiting: { label: '等你核准', icon: '🟠', color: 'var(--wait)' },
  done: { label: '完成', icon: '✅', color: 'var(--done)' },
  interrupted: { label: '已中斷', icon: '■', color: 'var(--muted)' },
  error: { label: '發生錯誤', icon: '❗', color: 'var(--error)' },
};
const TOOL_ICON = { list_files: '📂', read_file: '📄', write_file: '✏️', run_command: '💻', web_search: '🔎' };

let current = null; // the thinking/reply element being streamed into
const tools = new Map(); // tool_use id -> details element
let toolCount = 0;
let busy = false;
let turnStart = null;

// ---------- office + card ----------
const office = new window.Office($('office'), {
  onClick: () => {
    document.body.classList.remove('panel-closed');
    const card = $('card');
    card.classList.add('flash');
    setTimeout(() => card.classList.remove('flash'), 900);
  },
});
let status = 'idle';
let detail = '';
let usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };

function setStatus(next, info = {}) {
  status = next;
  detail = info.detail || defaultDetail(next);
  const s = STATUS[next] ?? STATUS.idle;
  office.setStatus(next, { detail, tool: info.tool });
  $('card').dataset.status = next;
  $('stIcon').textContent = s.icon;
  $('statusText').textContent = s.label;
  $('statusDetail').textContent = detail;
  const working = ['thinking', 'running', 'writing'].includes(next);
  const needs = next === 'waiting' || next === 'error';
  $('cNeeds').textContent = needs ? 1 : 0;
  $('cWorking').textContent = working ? 1 : 0;
  $('cFinished').textContent = next === 'done' ? 1 : 0;
  document.querySelector('.pill[data-kind="needs"]').classList.toggle('on', needs);
  $('groupLabel').textContent = needs ? '需要你' : working ? '工作中' : next === 'done' ? '已完成' : '閒置';
  document.title = `${s.icon} ${s.label} · Agent-work`;
  if (['done', 'error', 'interrupted', 'idle'].includes(next)) turnStart = null;
}
function defaultDetail(s) {
  return { thinking: '正在推理下一步', writing: '正在寫給你的回覆' }[s] ?? '';
}
function showUsage() {
  const total = usage.input_tokens + usage.cache_read_input_tokens + usage.output_tokens;
  $('usage').textContent = `${total.toLocaleString()} tokens · ${toolCount} 個工具`;
  $('usage').title = `輸入 ${usage.input_tokens.toLocaleString()}／快取讀取 ${usage.cache_read_input_tokens.toLocaleString()}／輸出 ${usage.output_tokens.toLocaleString()}`;
}
setInterval(() => {
  if (!turnStart) return ($('timer').textContent = '');
  const s = Math.floor((Date.now() - turnStart) / 1000);
  $('timer').textContent = s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}, 500);

// Hovering the agent in the office shows what it is doing.
$('office').addEventListener('mousemove', (ev) => {
  const tip = $('tooltip');
  if (!office.hover) return (tip.hidden = true);
  tip.hidden = false;
  tip.replaceChildren(el('b', null, `Claude · ${STATUS[status]?.label ?? status}`), el('span', null, detail || $('task').textContent));
  tip.style.left = `${ev.clientX + 14}px`;
  tip.style.top = `${ev.clientY + 14}px`;
});
$('office').addEventListener('mouseleave', () => ($('tooltip').hidden = true));

function setBusy(value) {
  busy = value;
  $('stopBtn').disabled = !busy;
  $('sendBtn').disabled = busy;
  $('resetBtn').disabled = busy;
}

// ---------- timeline ----------
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function append(node) {
  $('empty')?.remove();
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 120;
  log.appendChild(node);
  if (nearBottom) log.scrollTop = log.scrollHeight;
}
function stick() {
  if (log.scrollHeight - log.scrollTop - log.clientHeight < 200) log.scrollTop = log.scrollHeight;
}
function step(kind, icon, label) {
  const d = el('details', `msg step ${kind}`);
  const s = el('summary');
  s.append(el('span', null, icon), el('span', 'label', label), el('span', 'state'));
  d.append(s, el('pre'));
  append(d);
  return d;
}
function describeTool(name, input = {}) {
  switch (name) {
    case 'run_command': return input.command;
    case 'write_file': return `寫入 ${input.path}`;
    case 'read_file': return `讀取 ${input.path}`;
    case 'list_files': return `查看 ${input.path ?? '.'}`;
    case 'web_search': return `搜尋「${input.query ?? ''}」`;
    default: return name;
  }
}

function handle(e) {
  switch (e.type) {
    case 'reset':
      log.replaceChildren(emptyState.cloneNode(true));
      tools.clear();
      toolCount = 0;
      usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
      showUsage();
      $('task').textContent = '還沒有任務';
      $('lastReply').textContent = '';
      current = null;
      break;
    case 'user': {
      const m = el('div', 'msg user');
      m.append(el('div', 'body', e.text));
      append(m);
      $('task').textContent = e.text;
      $('lastReply').textContent = '';
      current = null;
      turnStart = e.at;
      setBusy(true);
      break;
    }
    case 'block_start':
      if (e.kind === 'thinking') {
        current = step('thinking', '💭', '思考過程');
        current.querySelector('.state').textContent = '思考中…';
      } else if (e.kind === 'text') {
        current = el('div', 'msg reply');
        current.append(el('div', 'body'));
        append(current);
      } else current = null;
      break;
    case 'thinking_delta':
      if (current?.classList.contains('thinking')) {
        current.querySelector('pre').textContent += e.text;
        current.querySelector('.label').textContent = firstLine(current.querySelector('pre').textContent) || '思考過程';
        current.querySelector('.state').textContent = '';
      }
      break;
    case 'text_delta':
      if (current?.classList.contains('reply')) {
        current.querySelector('.body').textContent += e.text;
        $('lastReply').textContent = `← ${firstLine(current.querySelector('.body').textContent)}`;
        stick();
      }
      break;
    case 'tool_start': {
      const d = step('tool', TOOL_ICON[e.name] ?? '🔧', describeTool(e.name, e.input));
      d.querySelector('.state').textContent = '執行中…';
      if (e.name === 'write_file') d.querySelector('pre').textContent = e.input.content ?? '';
      tools.set(e.id, d);
      toolCount++;
      showUsage();
      current = null;
      break;
    }
    case 'tool_end': {
      const d = tools.get(e.id);
      if (!d) break;
      d.classList.add(e.ok ? 'ok' : 'fail');
      d.querySelector('.state').textContent = e.ok ? '✓ 完成' : '✗ 失敗';
      const pre = d.querySelector('pre');
      pre.textContent = pre.textContent ? `${pre.textContent}\n\n── 結果 ──\n${e.output}` : e.output;
      break;
    }
    case 'approval': {
      const card = el('div', 'msg approval');
      card.dataset.id = e.id;
      card.append(el('strong', null, '🙋 Agent 想執行這個指令，可以嗎？'), el('code', null, e.input.command));
      const buttons = el('div', 'buttons');
      const allow = el('button', 'allow', '允許');
      const deny = el('button', null, '拒絕');
      allow.onclick = () => post('/api/approve', { id: e.id, allow: true });
      deny.onclick = () => post('/api/approve', { id: e.id, allow: false });
      buttons.append(allow, deny);
      card.append(buttons);
      append(card);
      break;
    }
    case 'approval_done': {
      const card = log.querySelector(`.approval[data-id="${CSS.escape(e.id)}"]`);
      card?.querySelector('.buttons')?.replaceWith(el('div', 'decided', e.allowed ? '✓ 已允許' : '✗ 已拒絕'));
      break;
    }
    case 'notice':
      append(el('div', 'msg notice', e.text));
      break;
    case 'error': {
      const m = el('div', 'msg error');
      m.append(el('div', 'body', `❗ ${e.message}`));
      append(m);
      break;
    }
    case 'status':
      setStatus(e.status, e);
      if (['done', 'error', 'interrupted', 'idle'].includes(e.status)) setBusy(false);
      break;
    case 'usage':
      usage = e.usage;
      showUsage();
      break;
  }
}
function firstLine(text) {
  const line = text.trim().split('\n')[0] ?? '';
  return line.length > 80 ? line.slice(0, 80) + '…' : line;
}

// ---------- connection ----------
function connect() {
  const source = new EventSource('/events');
  source.onmessage = (msg) => {
    const e = JSON.parse(msg.data);
    if (e.type !== 'hello') return handle(e);
    const { model, effort, workspace, autoApprove } = e.info;
    $('modelInfo').textContent = `${model} · effort ${effort}`;
    $('version').textContent = `工作資料夾 ${workspace}${autoApprove ? ' · 自動核准' : ''}`;
    // Replay what happened before this page connected.
    const hadHistory = e.history.length > 0;
    if (hadHistory) handle({ type: 'reset' });
    for (const past of e.history) handle(past);
    setBusy(e.busy);
    if (!hadHistory) setStatus('idle');
    log.scrollTop = log.scrollHeight;
  };
  source.onerror = () => {
    $('statusDetail').textContent = '與 Agent 伺服器的連線中斷，重新連線中…';
  };
}

async function post(path, body = {}) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({}));
    alert(error ?? `請求失敗（${res.status}）`);
  }
  return res.ok;
}

$('composer').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const text = $('input').value.trim();
  if (!text || busy) return;
  if (await post('/api/chat', { text })) $('input').value = '';
});
$('input').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
    ev.preventDefault();
    $('composer').requestSubmit();
  }
});
$('stopBtn').onclick = () => post('/api/stop');
$('resetBtn').onclick = () => post('/api/reset');
$('panelClose').onclick = () => document.body.classList.add('panel-closed');
$('panelTab').onclick = () => document.body.classList.remove('panel-closed');
$('themeBtn').onclick = () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('theme', root.dataset.theme); } catch {}
  office.refreshTheme();
};
try {
  const saved = localStorage.getItem('theme');
  if (saved) { document.documentElement.dataset.theme = saved; office.refreshTheme(); }
} catch {}
log.addEventListener('click', (ev) => {
  const ex = ev.target.closest('.example');
  if (ex) { $('input').value = ex.textContent; $('input').focus(); }
});

connect();
