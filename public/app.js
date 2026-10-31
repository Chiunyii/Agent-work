// Page logic: listens to the team's event stream and draws the office,
// one card per teammate, and a shared timeline.
const $ = (id) => document.getElementById(id);
const log = $('log');
const emptyState = $('empty').cloneNode(true); // shown again after a reset

const STATUS = {
  idle: { label: '閒置中', icon: '–' },
  thinking: { label: '思考中', icon: '💭' },
  running: { label: '執行工具', icon: '⏳' },
  writing: { label: '撰寫回覆', icon: '✍️' },
  waiting: { label: '等你核准', icon: '🟠' },
  done: { label: '完成', icon: '✅' },
  interrupted: { label: '已中斷', icon: '■' },
  error: { label: '發生錯誤', icon: '❗' },
};
const WORKING = ['thinking', 'running', 'writing'];
const FINISHED = ['done', 'error', 'interrupted', 'idle'];
const TOOL_ICON = { list_files: '📂', read_file: '📄', write_file: '✏️', run_command: '💻', web_search: '🔎', delegate: '📋' };
const COLORS = Object.fromEntries(Object.entries(window.Office.PEOPLE).map(([id, p]) => [id, p.look.shirt]));

let team = []; // [{ id, name, role, lead }]
const members = new Map(); // id -> { status, detail, usage, tools, turnStart, current, card }
const tools = new Map(); // tool_use id -> details element
let busy = false;

const office = new window.Office($('office'), {
  onClick: (id) => {
    document.body.classList.remove('panel-closed');
    const card = members.get(id)?.card;
    if (!card) return;
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    card.classList.add('flash');
    setTimeout(() => card.classList.remove('flash'), 900);
  },
});

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const nameOf = (id) => team.find((m) => m.id === id)?.name ?? id;

// ---------- team cards ----------
function buildTeam(info) {
  team = info;
  members.clear();
  const cards = $('cards');
  cards.replaceChildren();
  const filters = $('filters');
  filters.querySelectorAll('[data-filter]:not([data-filter="all"])').forEach((b) => b.remove());
  for (const m of team) {
    const card = el('article', 'card');
    card.dataset.status = 'idle';
    card.style.setProperty('--who', COLORS[m.id] ?? 'var(--accent)');
    card.innerHTML = `
      <div class="card-top">
        <span class="avatar" aria-hidden="true"></span>
        <strong class="card-name"></strong>
        <span class="badge"></span>
        <span class="card-time"></span>
      </div>
      <div class="card-task">待命中</div>
      <div class="card-status"><span class="st-icon">–</span><span class="st-label">閒置中</span><code class="st-detail"></code></div>
      <div class="card-reply"></div>
      <div class="card-foot"><span class="card-usage">0 tokens · 0 個工具</span></div>`;
    card.querySelector('.avatar').textContent = m.name.slice(-1);
    card.querySelector('.card-name').textContent = m.name;
    card.querySelector('.badge').textContent = m.role;
    card.addEventListener('mouseenter', () => { office.hover = m.id; });
    card.addEventListener('mouseleave', () => { office.hover = null; });
    cards.append(card);
    members.set(m.id, { status: 'idle', detail: '', usage: null, tools: 0, turnStart: null, current: null, card });

    const chip = el('button', 'chip', m.name);
    chip.dataset.filter = m.id;
    chip.style.setProperty('--who', COLORS[m.id] ?? 'var(--accent)');
    filters.append(chip);
  }
}
const q = (id, sel) => members.get(id)?.card.querySelector(sel);

function setStatus(id, status, info = {}) {
  const m = members.get(id);
  if (!m) return;
  m.status = status;
  m.detail = info.detail || { thinking: '正在推理下一步', writing: '正在寫回覆' }[status] || '';
  const s = STATUS[status] ?? STATUS.idle;
  office.setStatus(id, status, { detail: m.detail, tool: info.tool });
  m.card.dataset.status = status;
  q(id, '.st-icon').textContent = s.icon;
  q(id, '.st-label').textContent = info.tool === 'delegate' && status === 'running' ? '等組員回報' : s.label;
  q(id, '.st-detail').textContent = m.detail;
  if (FINISHED.includes(status)) m.turnStart = null;
  refreshSummary();
}

function refreshSummary() {
  const all = [...members.values()];
  const needs = all.filter((m) => m.status === 'waiting' || m.status === 'error').length;
  const working = all.filter((m) => WORKING.includes(m.status)).length;
  $('cNeeds').textContent = needs;
  $('cWorking').textContent = working;
  $('cFinished').textContent = all.filter((m) => m.status === 'done').length;
  document.querySelector('.pill[data-kind="needs"]').classList.toggle('on', needs > 0);
  const total = all.reduce((n, m) => n + (m.usage ? m.usage.input_tokens + m.usage.cache_read_input_tokens + m.usage.output_tokens : 0), 0);
  $('usageTotal').textContent = total ? `共 ${total.toLocaleString()} tokens` : '';
  const title = needs ? `🟠 ${needs} 位需要你` : working ? `⏳ ${working} 位工作中` : '✅ 團隊待命';
  document.title = `${title} · Agent-work`;
}

function showUsage(id) {
  const m = members.get(id);
  const u = m.usage ?? { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
  const total = u.input_tokens + u.cache_read_input_tokens + u.output_tokens;
  const node = q(id, '.card-usage');
  node.textContent = `${total.toLocaleString()} tokens · ${m.tools} 個工具`;
  node.title = `輸入 ${u.input_tokens.toLocaleString()}／快取讀取 ${u.cache_read_input_tokens.toLocaleString()}／輸出 ${u.output_tokens.toLocaleString()}`;
}

setInterval(() => {
  for (const [id, m] of members) {
    if (!m.turnStart) { q(id, '.card-time').textContent = ''; continue; }
    const s = Math.floor((Date.now() - m.turnStart) / 1000);
    q(id, '.card-time').textContent = s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  }
}, 500);

// Hovering a teammate in the office shows what they are doing.
$('office').addEventListener('mousemove', (ev) => {
  const tip = $('tooltip');
  const m = office.hover && members.get(office.hover);
  if (!m) return (tip.hidden = true);
  const info = team.find((t) => t.id === office.hover);
  tip.hidden = false;
  tip.replaceChildren(
    el('b', null, `${info.name}・${info.role}`),
    el('span', null, `${STATUS[m.status]?.label ?? m.status}${m.detail ? `：${m.detail}` : ''}`),
  );
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
function append(node, who) {
  $('empty')?.remove();
  if (who) {
    node.dataset.agent = who;
    node.style.setProperty('--who', COLORS[who] ?? 'var(--accent)');
  }
  applyFilter(node);
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 120;
  log.appendChild(node);
  if (nearBottom) log.scrollTop = log.scrollHeight;
}
function applyFilter(node) {
  const f = log.dataset.filter;
  node.hidden = f !== 'all' && node.dataset.agent !== f;
}
function stick() {
  if (log.scrollHeight - log.scrollTop - log.clientHeight < 200) log.scrollTop = log.scrollHeight;
}
function step(kind, icon, label, who) {
  const d = el('details', `msg step ${kind}`);
  const s = el('summary');
  s.append(el('span', 'who', nameOf(who)), el('span', null, icon), el('span', 'label', label), el('span', 'state'));
  d.append(s, el('pre'));
  append(d, who);
  return d;
}
function describeTool(name, input = {}) {
  switch (name) {
    case 'run_command': return input.command;
    case 'write_file': return `寫入 ${input.path}`;
    case 'read_file': return `讀取 ${input.path}`;
    case 'list_files': return `查看 ${input.path ?? '.'}`;
    case 'web_search': return `搜尋「${input.query ?? ''}」`;
    case 'delegate': return `交派給 ${nameOf(input.member)}：${firstLine(input.task ?? '')}`;
    default: return name;
  }
}
function firstLine(text) {
  const line = text.trim().split('\n')[0] ?? '';
  return line.length > 80 ? line.slice(0, 80) + '…' : line;
}

function handle(e) {
  const who = e.agent;
  const m = who && members.get(who);
  switch (e.type) {
    case 'reset':
      log.replaceChildren(emptyState.cloneNode(true));
      tools.clear();
      for (const [id, mm] of members) {
        Object.assign(mm, { usage: null, tools: 0, current: null, turnStart: null });
        q(id, '.card-task').textContent = '待命中';
        q(id, '.card-reply').textContent = '';
        showUsage(id);
      }
      refreshSummary();
      break;
    case 'user': {
      const msg = el('div', 'msg user');
      msg.append(el('div', 'body', e.text));
      append(msg, who);
      q(who, '.card-task').textContent = e.text;
      q(who, '.card-reply').textContent = '';
      m.current = null;
      m.turnStart = e.at;
      setBusy(true);
      break;
    }
    case 'task': {
      const msg = el('div', 'msg task');
      msg.append(el('span', 'who', `${e.from} → ${nameOf(who)}`), el('div', 'body', e.text));
      append(msg, who);
      q(who, '.card-task').textContent = `📋 ${e.from}交派：${firstLine(e.text)}`;
      q(who, '.card-reply').textContent = '';
      m.current = null;
      m.turnStart = e.at;
      break;
    }
    case 'block_start':
      if (e.kind === 'thinking') {
        m.current = step('thinking', '💭', '思考過程', who);
        m.current.querySelector('.state').textContent = '思考中…';
      } else if (e.kind === 'text') {
        m.current = el('div', 'msg reply');
        m.current.append(el('span', 'who', nameOf(who)), el('div', 'body'));
        append(m.current, who);
      } else m.current = null;
      break;
    case 'thinking_delta':
      if (m?.current?.classList.contains('thinking')) {
        const pre = m.current.querySelector('pre');
        pre.textContent += e.text;
        m.current.querySelector('.label').textContent = firstLine(pre.textContent) || '思考過程';
        m.current.querySelector('.state').textContent = '';
      }
      break;
    case 'text_delta':
      if (m?.current?.classList.contains('reply')) {
        const body = m.current.querySelector('.body');
        body.textContent += e.text;
        q(who, '.card-reply').textContent = `← ${firstLine(body.textContent)}`;
        stick();
      }
      break;
    case 'tool_start': {
      const d = step('tool', TOOL_ICON[e.name] ?? '🔧', describeTool(e.name, e.input), who);
      d.querySelector('.state').textContent = e.name === 'delegate' ? '進行中…' : '執行中…';
      if (e.name === 'write_file') d.querySelector('pre').textContent = e.input.content ?? '';
      if (e.name === 'delegate') { d.classList.add('delegate'); d.querySelector('pre').textContent = e.input.task ?? ''; }
      tools.set(e.id, d);
      m.tools++;
      showUsage(who);
      m.current = null;
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
      card.append(el('strong', null, `🙋 ${nameOf(who)}想執行這個指令，可以嗎？`), el('code', null, e.input.command));
      const buttons = el('div', 'buttons');
      const allow = el('button', 'allow', '允許');
      const deny = el('button', null, '拒絕');
      allow.onclick = () => post('/api/approve', { id: e.id, allow: true });
      deny.onclick = () => post('/api/approve', { id: e.id, allow: false });
      buttons.append(allow, deny);
      card.append(buttons);
      append(card, who);
      break;
    }
    case 'approval_done': {
      const card = log.querySelector(`.approval[data-id="${CSS.escape(e.id)}"]`);
      card?.querySelector('.buttons')?.replaceWith(el('div', 'decided', e.allowed ? '✓ 已允許' : '✗ 已拒絕'));
      break;
    }
    case 'notice':
      append(el('div', 'msg notice', e.text), who);
      break;
    case 'error': {
      const msg = el('div', 'msg error');
      msg.append(el('div', 'body', `❗ ${nameOf(who)}：${e.message}`));
      append(msg, who);
      break;
    }
    case 'status': {
      setStatus(who, e.status, e);
      const lead = team.find((t) => t.lead)?.id;
      if (who === lead && FINISHED.includes(e.status)) setBusy(false);
      break;
    }
    case 'usage':
      m.usage = e.usage;
      showUsage(who);
      refreshSummary();
      break;
  }
}

// ---------- connection ----------
function connect() {
  const source = new EventSource('/events');
  source.onmessage = (msg) => {
    const e = JSON.parse(msg.data);
    if (e.type !== 'hello') return handle(e);
    const { model, effort, workspace, autoApprove } = e.info;
    buildTeam(e.info.team ?? []);
    $('version').textContent = `${model} · effort ${effort} · 工作資料夾 ${workspace}${autoApprove ? ' · 自動核准' : ''}`;
    // Replay what happened before this page connected.
    if (e.history.length) handle({ type: 'reset' });
    for (const past of e.history) handle(past);
    setBusy(e.busy);
    log.scrollTop = log.scrollHeight;
  };
  source.onerror = () => {
    $('version').textContent = '與伺服器的連線中斷，重新連線中…';
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
$('filters').addEventListener('click', (ev) => {
  const chip = ev.target.closest('[data-filter]');
  if (!chip) return;
  $('filters').querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === chip));
  log.dataset.filter = chip.dataset.filter;
  for (const node of log.children) if (node.id !== 'empty') applyFilter(node);
  log.scrollTop = log.scrollHeight;
});
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
