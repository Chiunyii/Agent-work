// Small HTTP server: serves the page, streams the team's events over SSE and
// takes chat / approve / stop / reset requests.
import http from 'node:http';
import fs from 'node:fs/promises';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = nodePath.join(nodePath.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const MAX_HISTORY = 5000; // events kept so a reloaded page can replay the conversation

export function createServer(team, { info = {} } = {}) {
  const clients = new Set();
  let history = [];

  team.on('event', (event) => {
    if (event.type === 'reset') history = [];
    const stamped = { ...event, at: Date.now() };
    history.push(stamped);
    if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
    const line = `data: ${JSON.stringify(stamped)}\n\n`;
    for (const res of clients) res.write(line);
  });

  const send = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify({ type: 'hello', info, busy: team.busy, history })}\n\n`);
        clients.add(res);
        const ping = setInterval(() => res.write(': ping\n\n'), 20000);
        req.on('close', () => { clearInterval(ping); clients.delete(res); });
        return;
      }

      if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
        // Only accept same-origin requests: the agent can run commands on this machine.
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'cross-origin request refused' });
        const body = await readJson(req);
        switch (url.pathname) {
          case '/api/chat': {
            const text = String(body.text ?? '').trim();
            if (!text) return send(res, 400, { error: '訊息是空的' });
            if (team.busy) return send(res, 409, { error: '團隊還在工作中' });
            team.run(text); // runs in the background; progress arrives over SSE
            return send(res, 202, { ok: true });
          }
          case '/api/approve':
            return send(res, team.approve(body.id, body.allow) ? 200 : 404, { ok: true });
          case '/api/stop':
            team.stop();
            return send(res, 200, { ok: true });
          case '/api/reset':
            if (team.busy) return send(res, 409, { error: '請先停止目前的工作' });
            team.reset();
            return send(res, 200, { ok: true });
        }
        return send(res, 404, { error: 'not found' });
      }

      if (req.method === 'GET') {
        const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        const full = nodePath.join(PUBLIC_DIR, nodePath.normalize(file));
        if (!full.startsWith(PUBLIC_DIR + nodePath.sep)) return send(res, 404, { error: 'not found' });
        const data = await fs.readFile(full).catch(() => null);
        if (!data) return send(res, 404, { error: 'not found' });
        res.writeHead(200, { 'content-type': MIME[nodePath.extname(full)] ?? 'application/octet-stream' });
        return res.end(data);
      }
      send(res, 405, { error: 'method not allowed' });
    } catch (err) {
      send(res, 500, { error: err.message });
    }
  });
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1e6) throw new Error('request too large');
  }
  return raw ? JSON.parse(raw) : {};
}
