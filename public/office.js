// Isometric 2D office for a small team, in a cream wabi-sabi style.
// Working teammates sit at their desks (thought bubble, typing, code on the
// monitor); one who needs you stands and waves; the project manager goes to
// the meeting-room board while waiting on the team; off-duty teammates wander:
// coffee, tea, the couch, the bookshelf, ping-pong, the window, the plants.
// Plain canvas, no dependencies. Look inspired by Charonyuu/whatsmyagentdoing.
(() => {
  'use strict';

  const TW = 64; // tile width in px; tile height and one z unit are TW / 2
  const TH = 32;
  const W = 16; // room size in tiles
  const D = 12.5;
  const WALL_H = 2.4;
  const AISLE_Y = 6.1; // the main walkway everyone uses between zones
  const SPEED = 2.2; // tiles per second
  const WORKING = new Set(['thinking', 'running', 'writing', 'waiting', 'error']);

  const STATUS_COLOR = {
    thinking: '#8f7bc0', running: '#5b86a8', writing: '#5f9474', waiting: '#c98a3a',
    done: '#6f9358', error: '#c0574a', interrupted: '#a39a8c', idle: '#a39a8c',
  };
  const TOOL_LABEL = { run_command: '指令', write_file: '寫檔', read_file: '讀檔', list_files: '看資料夾', web_search: '搜尋', delegate: '交派' };

  // Each teammate: look, size and desk. Seats face the monitor (back to the viewer).
  const PEOPLE = {
    aizi: {
      name: '矮子', scale: 0.82,
      look: { skin: '#f0cba8', hair: '#2a2420', shirt: '#c39a4c', pants: '#4a3f33' },
      desk: [2, 2], seat: { x: 3.15, y: 3.3, entry: [[1.35, AISLE_Y], [1.35, 3.3]] },
    },
    aguan: {
      name: '阿關', scale: 1, glasses: true,
      look: { skin: '#e2b48e', hair: '#3a2c22', shirt: '#56697e', pants: '#33302c' },
      desk: [6.8, 2], seat: { x: 7.95, y: 3.3, entry: [[9.3, AISLE_Y], [9.3, 3.3]] },
    },
    xiaoya: {
      name: '小雅', scale: 0.95, longHair: true,
      look: { skin: '#f5d6bd', hair: '#5a3a28', shirt: '#c4908a', pants: '#6b5a4c' },
      desk: [4.4, 4.5], seat: { x: 5.55, y: 5.8, entry: [[5.55, AISLE_Y]] },
    },
  };
  const BOARD = { name: 'board', x: 13.3, y: 1.45, face: 'back', entry: [[11.75, AISLE_Y], [11.75, 1.45]] };

  // Places off-duty teammates go. `entry` is the route from the aisle to the spot.
  const SPOTS = [
    { name: 'coffee', x: 12.7, y: 10.15, emoji: '☕', face: 'front' },
    { name: 'fridge', x: 14.75, y: 8.2, emoji: '🍎', face: 'front' },
    { name: 'water', x: 11.45, y: 7.85, emoji: '💧', face: 'back' },
    { name: 'couch', x: 2.9, y: 10.75, emoji: '📱', pose: 'sit', face: 'front', entry: [[4.75, AISLE_Y], [4.75, 10.75]] },
    { name: 'books', x: 1.05, y: 7.45, emoji: '📖', face: 'front' },
    { name: 'pingpong', x: 7.7, y: 8.25, emoji: '🏓', face: 'back', entry: [[6.1, AISLE_Y], [6.1, 8.25]] },
    { name: 'tea', x: 9.95, y: 10.95, emoji: '🍵', pose: 'sit', z: 0.15, face: 'front' },
    { name: 'window', x: 3.7, y: 0.85, emoji: '☁️', face: 'back', entry: [[1.35, AISLE_Y], [1.35, 0.85]] },
    { name: 'plants', x: 10.15, y: 5.35, emoji: '🌱', face: 'back' },
    { name: 'whiteboard', x: 14.3, y: 1.45, emoji: '✏️', face: 'back', entry: [[11.75, AISLE_Y], [11.75, 1.45]] },
  ];
  for (const s of [BOARD, ...SPOTS, ...Object.values(PEOPLE).map((p) => p.seat)]) s.entry ??= [[s.x, AISLE_Y]];
  for (const p of Object.values(PEOPLE)) Object.assign(p.seat, { pose: 'sit', face: 'back', desk: true });

  const rand = (a, b) => a + Math.random() * (b - a);

  function palette() {
    const forced = document.documentElement.dataset.theme;
    const dark = forced ? forced === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    return dark ? {
      dark, wood1: '#3f372e', wood2: '#3a322a', woodLine: 'rgba(0,0,0,.18)',
      tileA: '#3b3631', tileB: '#34302b', jute: '#40382d',
      wallL: '#433c33', wallR: '#3a342c', wallTop: '#4d453b', trim: '#2c2722',
      deskTop: '#7d6a52', deskL: '#6a5843', deskR: '#5a4a38', monitor: '#1d1a17', screenOff: '#2a2622', chair: '#5a4e40',
      rug: '#4a4237', couch: '#6b6152', couchD: '#5c5345', counter: '#cfc6b7', counterL: '#a89e8e', counterR: '#968c7d',
      metal: '#8d867c', shoji: 'rgba(235,225,205,.10)', shojiFrame: 'rgba(150,125,95,.75)',
      text: '#ece5d8', tagBg: 'rgba(30,26,22,.86)', bubble: '#f3ede2', paper: '#e9e1d2', ink: '#2a2420',
      leaf: ['#5f7d50', '#6f8c5e', '#4f6b43', '#82996f'], olive: '#8a9a7c', pot: '#9c6a4f', ceramic: '#c9c0b2', basket: '#9a8060',
      shadow: 'rgba(0,0,0,.3)', panel: ['#5d5447', '#55503f', '#5f5243', '#4f5446'],
      book: ['#8a7058', '#6f7a5e', '#a08c72', '#5f574d', '#94684f'], walnut: '#4a3c2f',
    } : {
      dark, wood1: '#eadfcb', wood2: '#e4d7c0', woodLine: 'rgba(120,95,60,.10)',
      tileA: '#ede6da', tileB: '#e3dacb', jute: '#d9ccb3',
      wallL: '#f3ede2', wallR: '#ebe3d5', wallTop: '#f8f4ec', trim: '#d8ccb8',
      deskTop: '#dcc7a6', deskL: '#c8ae88', deskR: '#b89c76', monitor: '#3a3530', screenOff: '#4a453f', chair: '#a08c74',
      rug: '#e2d8c6', couch: '#e6dccb', couchD: '#d6cab5', counter: '#f1ece3', counterL: '#d9cfbf', counterR: '#cbbfae',
      metal: '#b8b0a4', shoji: 'rgba(252,248,238,.55)', shojiFrame: 'rgba(160,130,95,.8)',
      text: '#3b342b', tagBg: 'rgba(251,248,242,.95)', bubble: '#fffdf8', paper: '#f6f0e3', ink: '#2e2925',
      leaf: ['#6f8f5e', '#83a070', '#5d7d4f', '#9bb487'], olive: '#9fae8f', pot: '#b9805f', ceramic: '#ece5d8', basket: '#c9a97c',
      shadow: 'rgba(90,70,40,.14)', panel: ['#d9cdb9', '#c9bfa8', '#cdbba2', '#bfc3ae'],
      book: ['#a68a6d', '#8f9a7c', '#c7b299', '#7d7468', '#b9846a'], walnut: '#7a6049',
    };
  }

  function sky(d = new Date()) {
    const h = d.getHours() + d.getMinutes() / 60;
    if (h >= 7 && h < 17) return { color: '#b9d6e6', night: false };
    if (h >= 5 && h < 7) return { color: '#efd2b6', night: false };
    if (h >= 17 && h < 19) return { color: '#e8b48e', night: false };
    return { color: '#26304a', night: true };
  }

  class Office {
    constructor(canvas, { onClick } = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.onClick = onClick;
      this.pal = palette();
      this.people = Object.entries(PEOPLE).map(([id, def], i) => ({
        id, def, status: 'idle', tool: '', detail: '', doneAt: 0,
        x: def.seat.x, y: def.seat.y, at: def.seat, target: def.seat, path: [], until: performance.now() + 1500 + i * 2500, phase: i * 2.1,
      }));
      this.cat = { x: 8, y: 9.5, path: [], until: 0, face: 1 };
      this.hover = null;
      this.last = performance.now();
      this.t = 0;

      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { this.pal = palette(); });
      new ResizeObserver(() => this.resize()).observe(canvas);
      canvas.addEventListener('mousemove', (e) => this.pointer(e));
      canvas.addEventListener('mouseleave', () => { this.hover = null; canvas.style.cursor = ''; });
      canvas.addEventListener('click', (e) => { this.pointer(e); if (this.hover) this.onClick?.(this.hover); });
      this.resize();
      requestAnimationFrame((t) => this.frame(t));
    }

    person(id) { return this.people.find((p) => p.id === id); }

    setStatus(id, status, { detail = '', tool = '' } = {}) {
      const p = this.person(id);
      if (!p) return;
      if (status === 'done' && p.status !== 'done') p.doneAt = Date.now();
      if (!WORKING.has(status) && WORKING.has(p.status)) p.until = performance.now() + 2500;
      p.status = status;
      p.detail = detail;
      if (status === 'running') p.tool = tool;
    }

    refreshTheme() { this.pal = palette(); }

    // ---------- geometry ----------
    iso(x, y, z = 0) {
      return { x: (x - y) * (TW / 2), y: (x + y) * (TH / 2) - z * TH };
    }
    resize() {
      const dpr = window.devicePixelRatio || 1;
      const r = this.canvas.getBoundingClientRect();
      this.canvas.width = Math.max(1, Math.round(r.width * dpr));
      this.canvas.height = Math.max(1, Math.round(r.height * dpr));
      const minX = -D * (TW / 2), maxX = W * (TW / 2);
      const minY = -WALL_H * TH - 30, maxY = (W + D) * (TH / 2) + 10;
      const pad = 16;
      this.scale = Math.min((r.width - pad * 2) / (maxX - minX), (r.height - pad * 2) / (maxY - minY));
      this.ox = (r.width - (maxX - minX) * this.scale) / 2 - minX * this.scale;
      this.oy = (r.height - (maxY - minY) * this.scale) / 2 - minY * this.scale;
      this.dpr = dpr;
    }
    pointer(e) {
      const r = this.canvas.getBoundingClientRect();
      const mx = (e.clientX - r.left - this.ox) / this.scale;
      const my = (e.clientY - r.top - this.oy) / this.scale;
      this.hover = null;
      for (const p of this.people) {
        const s = this.iso(p.x, p.y);
        if (Math.abs(mx - s.x) < 14 && my < s.y + 6 && my > s.y - 50) this.hover = p.id;
      }
      this.canvas.style.cursor = this.hover ? 'pointer' : '';
    }

    // ---------- movement ----------
    wanted(p) {
      if (!WORKING.has(p.status)) return null;
      return p.status === 'running' && p.tool === 'delegate' ? BOARD : p.def.seat;
    }
    goTo(p, spot) {
      const from = p.at ? [...p.at.entry].reverse() : [[p.x, AISLE_Y]];
      p.path = [...from, ...spot.entry, [spot.x, spot.y]].map(([x, y]) => ({ x, y }));
      p.at = null;
      p.target = spot;
    }
    step(dt, now) {
      for (const p of this.people) {
        const want = this.wanted(p);
        if (want && p.target !== want) this.goTo(p, want);
        if (!want && !p.path.length && now > p.until) {
          const taken = new Set(this.people.filter((o) => o !== p).map((o) => o.target));
          const choices = SPOTS.filter((s) => s !== p.at && !taken.has(s));
          this.goTo(p, choices[Math.floor(Math.random() * choices.length)]);
        }
        if (p.path.length) {
          const n = p.path[0];
          const dx = n.x - p.x, dy = n.y - p.y, d = Math.hypot(dx, dy), v = SPEED * dt;
          if (d <= v) {
            p.x = n.x; p.y = n.y; p.path.shift();
            if (!p.path.length) { p.at = p.target; p.until = now + rand(7000, 15000); }
          } else { p.x += (dx / d) * v; p.y += (dy / d) * v; }
        }
      }

      const k = this.cat;
      if (!k.path.length && now > k.until) {
        const spots = [[7.5, AISLE_Y + 0.3], [3.5, 9.3], [10.6, 8.6], [5.5, AISLE_Y + 0.2], [9.5, AISLE_Y + 0.1]];
        const [tx, ty] = spots[Math.floor(Math.random() * spots.length)];
        k.path = [{ x: k.x, y: AISLE_Y + 0.25 }, { x: tx, y: AISLE_Y + 0.25 }, { x: tx, y: ty }];
        k.until = Infinity;
      }
      if (k.path.length) {
        const n = k.path[0];
        const dx = n.x - k.x, dy = n.y - k.y, d = Math.hypot(dx, dy), v = 0.9 * dt;
        if (d > 0.001) k.face = dx - dy >= 0 ? 1 : -1;
        if (d <= v) { k.x = n.x; k.y = n.y; k.path.shift(); if (!k.path.length) k.until = now + rand(5000, 15000); }
        else { k.x += (dx / d) * v; k.y += (dy / d) * v; }
      }
    }

    pose(p) {
      if (p.path.length) return { pose: 'walk', face: p.path[0].y < p.y || p.path[0].x < p.x ? 'back' : 'front', act: 'walk' };
      const spot = p.at ?? p.def.seat;
      if (spot === BOARD) return { pose: 'stand', face: 'back', act: 'whiteboard' };
      if (spot.desk && WORKING.has(p.status)) {
        if (p.status === 'waiting') return { pose: 'stand', face: 'front', act: 'wave' };
        if (p.status === 'running' || p.status === 'writing') return { pose: 'sit', face: 'back', act: 'type' };
        return { pose: 'sit', face: 'back', act: p.status === 'thinking' ? 'think' : 'rest' };
      }
      return { pose: spot.pose ?? 'stand', face: spot.face ?? 'front', act: spot.desk ? 'rest' : spot.name, z: spot.z };
    }

    // ---------- drawing primitives ----------
    poly(pts, fill, stroke, width = 1) {
      const c = this.ctx;
      c.beginPath();
      pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.closePath();
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
    }
    line(a, b, color, width = 1) {
      const c = this.ctx;
      c.strokeStyle = color; c.lineWidth = width;
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }
    box(x, y, z, w, d, h, top, left, right) {
      const I = (a, b, cz) => this.iso(a, b, cz);
      this.poly([I(x, y + d, z), I(x + w, y + d, z), I(x + w, y + d, z + h), I(x, y + d, z + h)], left);
      this.poly([I(x + w, y, z), I(x + w, y + d, z), I(x + w, y + d, z + h), I(x + w, y, z + h)], right);
      this.poly([I(x, y, z + h), I(x + w, y, z + h), I(x + w, y + d, z + h), I(x, y + d, z + h)], top);
    }
    tone(hex, amt) {
      const n = parseInt(hex.slice(1), 16);
      const f = (v) => Math.max(0, Math.min(255, v + amt));
      return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
    }
    wood(x, y, z, w, d, h, color) { this.box(x, y, z, w, d, h, color, this.tone(color, -16), this.tone(color, -30)); }
    rrect(x, y, w, h, r, fill) {
      const c = this.ctx;
      c.beginPath();
      c.roundRect(x, y, w, h, r);
      c.fillStyle = fill;
      c.fill();
    }
    blob(x, y, rx, ry, fill, rot = 0) {
      const c = this.ctx;
      c.fillStyle = fill;
      c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); c.fill();
    }

    // ---------- plants ----------
    pot(x, y, kind, s = 1, h = 0.35) {
      const P = this.pal;
      const color = { terracotta: P.pot, ceramic: P.ceramic, basket: P.basket }[kind] ?? P.pot;
      const w = 0.4 * s;
      this.box(x, y, 0, w, w, h * s, this.tone(color, 12), color, this.tone(color, -22));
      if (kind === 'basket') {
        for (let i = 1; i < 3; i++) this.line(this.iso(x, y + w, (h * s * i) / 3), this.iso(x + w, y + w, (h * s * i) / 3), this.tone(color, -30), 0.8);
      }
      return this.iso(x + w / 2, y + w / 2, h * s);
    }
    plant(x, y, kind = 'bush', s = 1) {
      const P = this.pal;
      const c = this.ctx;
      const L = P.leaf;
      const sway = Math.sin(this.t / 1800 + x * 1.3 + y) * 0.8;
      switch (kind) {
        case 'monstera': {
          const top = this.pot(x, y, 'ceramic', s * 1.3, 0.45);
          for (const [dx, dy, r, rot, i] of [[-14, -16, 13, -0.6, 0], [13, -18, 12, 0.6, 1], [0, -30, 13, 0, 2], [-8, -38, 10, -0.3, 3], [10, -34, 10, 0.4, 1]]) {
            const lx = top.x + (dx + sway) * s, ly = top.y + dy * s;
            this.line(top, { x: lx, y: ly + r * 0.5 * s }, L[2], 1.2);
            this.blob(lx, ly, r * s, r * 0.72 * s, L[i], rot);
            c.strokeStyle = P.dark ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.35)'; c.lineWidth = 1;
            for (const k of [-0.5, 0.2]) { c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + Math.cos(rot + k * 3) * r * s, ly + Math.sin(rot + k * 3) * r * 0.7 * s); c.stroke(); }
          }
          break;
        }
        case 'fig': {
          const top = this.pot(x, y, 'basket', s * 1.4, 0.4);
          this.line(top, { x: top.x + sway, y: top.y - 50 * s }, '#7a6048', 2.2);
          for (let i = 0; i < 14; i++) {
            const a = i * 2.4;
            const lx = top.x + sway + Math.cos(a) * (6 + (i % 4) * 4) * s;
            const ly = top.y - (34 + (i % 5) * 7 + Math.sin(a) * 4) * s;
            this.blob(lx, ly, 6 * s, 4.5 * s, L[i % 4], a);
          }
          break;
        }
        case 'olive': {
          const top = this.pot(x, y, 'terracotta', s * 1.3, 0.4);
          this.line(top, { x: top.x - 2 + sway, y: top.y - 26 * s }, '#8a7258', 1.8);
          this.line({ x: top.x - 1, y: top.y - 18 * s }, { x: top.x + 7 + sway, y: top.y - 34 * s }, '#8a7258', 1.4);
          for (let i = 0; i < 26; i++) {
            const a = i * 1.7;
            this.blob(top.x + sway + Math.cos(a) * (3 + (i % 6) * 2.4) * s, top.y - (30 + Math.sin(a * 1.3) * 9 + (i % 3) * 3) * s, 3.2 * s, 1.5 * s, i % 3 ? P.olive : L[2], a);
          }
          break;
        }
        case 'snake': {
          const top = this.pot(x, y, 'ceramic', s, 0.4);
          for (let i = 0; i < 6; i++) {
            const bx = top.x + (i - 2.5) * 2.6 * s, hgt = (20 + ((i * 7) % 4) * 6) * s, lean = (i - 2.5) * 1.2 + sway * 0.5;
            this.poly([{ x: bx - 2 * s, y: top.y }, { x: bx + 2 * s, y: top.y }, { x: bx + lean + 0.5, y: top.y - hgt }], i % 2 ? L[2] : L[0]);
          }
          break;
        }
        case 'succulent': {
          const top = this.iso(x, y, 0);
          this.blob(top.x, top.y - 2, 4 * s, 2.5 * s, P.ceramic);
          for (let i = 0; i < 6; i++) this.blob(top.x + Math.cos(i) * 2.5 * s, top.y - 5 * s + Math.sin(i) * 1.2 * s, 2.4 * s, 1.6 * s, L[(i + 1) % 4], i);
          break;
        }
        default: {
          const top = this.pot(x, y, 'terracotta', s);
          for (const [dx, dy, r, i] of [[0, -10, 9, 0], [-7, -5, 7, 1], [7, -5, 7, 3], [0, -18, 6, 1]]) this.blob(top.x + (dx + sway * 0.5) * s, top.y + dy * s, r * s, r * s, L[i]);
        }
      }
    }
    // Pothos hanging from the back wall, vines trailing down.
    hanging(x) {
      const P = this.pal;
      const hook = this.iso(x, 0.08, 2.35);
      const potTop = this.iso(x, 0.08, 1.95);
      this.line(hook, potTop, P.trim, 0.8);
      this.blob(potTop.x, potTop.y + 3, 7, 4, P.ceramic);
      for (let v = 0; v < 3; v++) {
        for (let i = 0; i < 6; i++) {
          const k = Math.sin(this.t / 2000 + v + i * 0.4) * 1.2;
          this.blob(potTop.x - 6 + v * 6 + k, potTop.y + 4 + i * 6 + v * 2, 3.2, 2.2, P.leaf[(i + v) % 4], i);
        }
      }
    }

    // ---------- room ----------
    floor() {
      const P = this.pal;
      for (let x = 0; x < W; x++) {
        for (let y = 0; y < Math.ceil(D); y++) {
          const h = Math.min(1, D - y);
          let fill = x % 2 ? P.wood1 : P.wood2;
          if (x >= 11 && y >= 6) fill = (x + y) % 2 ? P.tileA : P.tileB;
          else if (x >= 11 && y < 5) fill = P.jute;
          this.poly([this.iso(x, y), this.iso(x + 1, y), this.iso(x + 1, y + h), this.iso(x, y + h)], fill, x < 11 || y === 5 ? P.woodLine : null);
        }
      }
      this.poly([this.iso(1.2, 9.4), this.iso(6, 9.4), this.iso(6, 12.3), this.iso(1.2, 12.3)], P.rug); // linen rug
      this.poly([this.iso(8.3, 10.2), this.iso(10.6, 10.2), this.iso(10.6, 12.1), this.iso(8.3, 12.1)], P.jute); // tea mat
      this.poly([this.iso(0, 8.2), this.iso(0.8, 8.2), this.iso(0.8, 9.4), this.iso(0, 9.4)], P.jute); // door mat
    }
    walls() {
      const P = this.pal;
      const I = (x, y, z) => this.iso(x, y, z);
      const c = this.ctx;
      this.poly([I(0, 0, 0), I(0, D, 0), I(0, D, WALL_H), I(0, 0, WALL_H)], P.wallL);
      this.poly([I(0, 0, 0), I(W, 0, 0), I(W, 0, WALL_H), I(0, 0, WALL_H)], P.wallR);
      this.poly([I(0, 0, 0), I(0, D, 0), I(0, D, 0.12), I(0, 0, 0.12)], P.trim);
      this.poly([I(0, 0, 0), I(W, 0, 0), I(W, 0, 0.12), I(0, 0, 0.12)], P.trim);
      this.poly([I(0, 0, WALL_H), I(W, 0, WALL_H), I(W, -0.15, WALL_H), I(-0.15, -0.15, WALL_H), I(-0.15, D, WALL_H), I(0, D, WALL_H)], P.wallTop);

      // windows follow the local time of day; linen curtains and sill plants
      const s = sky();
      for (const wx of [2.6, 4.6, 6.6]) {
        this.poly([I(wx, 0, 1.0), I(wx + 1.3, 0, 1.0), I(wx + 1.3, 0, 2.0), I(wx, 0, 2.0)], s.color, P.walnut, 2);
        if (s.night) {
          c.fillStyle = '#fff';
          for (let i = 0; i < 4; i++) { const p = I(wx + 0.2 + ((i * 37) % 10) / 10, 0, 1.25 + ((i * 53) % 7) / 10); c.fillRect(p.x, p.y, 1.5, 1.5); }
        } else {
          const cloud = I(wx + 0.45 + Math.sin(this.t / 9000 + wx) * 0.25, 0, 1.6);
          this.blob(cloud.x, cloud.y, 8, 3, 'rgba(255,255,255,.8)', -0.46);
        }
        this.line(I(wx + 0.65, 0, 1.0), I(wx + 0.65, 0, 2.0), P.walnut, 2);
        this.poly([I(wx - 0.08, 0, 0.95), I(wx + 0.18, 0, 0.95), I(wx + 0.18, 0, 2.08), I(wx - 0.08, 0, 2.08)], P.dark ? 'rgba(230,220,200,.18)' : 'rgba(250,246,236,.85)');
        this.box(wx, 0, 1.0, 1.3, 0.12, 0.04, P.walnut, this.tone(P.walnut, -10), this.tone(P.walnut, -20));
        this.plant(wx + 0.95, 0.03, 'succulent', 0.9);
      }
      for (const hx of [4.27, 6.27, 8.35]) this.hanging(hx);

      // linen pinboard in the meeting room
      this.poly([I(12.2, 0, 0.9), I(14.8, 0, 0.9), I(14.8, 0, 1.9), I(12.2, 0, 1.9)], P.paper, P.walnut, 1.5);
      c.strokeStyle = '#b06e52'; c.lineWidth = 1.5;
      const a = I(12.5, 0, 1.6), b = I(13.4, 0, 1.3), cc = I(14.3, 0, 1.6);
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(cc.x, cc.y); c.stroke();
      for (const [nx, nz, col] of [[12.6, 1.15, '#e8d8a8'], [13.9, 1.2, '#d9c2b0'], [14.4, 1.75, '#c9d3b8']]) this.poly([I(nx, 0, nz), I(nx + 0.25, 0, nz), I(nx + 0.25, 0, nz + 0.2), I(nx, 0, nz + 0.2)], col);
      this.label('MEETING', I(14.6, 0, 2.15), P.trim, 8);

      // hanging scroll with an ensō, a wooden clock and the door
      this.poly([I(0, 1.25, 0.75), I(0, 1.95, 0.75), I(0, 1.95, 2.05), I(0, 1.25, 2.05)], P.paper, P.walnut, 1.2);
      this.line(I(0, 1.2, 2.08), I(0, 2.0, 2.08), P.walnut, 2.5);
      const enso = I(0, 1.6, 1.45);
      c.strokeStyle = P.ink; c.lineWidth = 2.6; c.lineCap = 'round';
      c.beginPath(); c.ellipse(enso.x, enso.y, 7, 10, 0.5, 0.4, Math.PI * 1.85); c.stroke();
      c.lineCap = 'butt';
      const clock = I(0, 4.2, 1.85);
      this.blob(clock.x, clock.y, 7, 9, P.walnut, 0.5);
      this.blob(clock.x, clock.y, 5.5, 7.5, P.paper, 0.5);
      const now = new Date();
      for (const [len, ang] of [[4, (now.getHours() % 12) / 12], [6, now.getMinutes() / 60]]) {
        const th = ang * Math.PI * 2 - Math.PI / 2;
        this.line(clock, { x: clock.x + Math.cos(th) * len * 0.8, y: clock.y + Math.sin(th) * len }, P.ink, 1);
      }
      this.poly([I(0, 8.3, 0), I(0, 9.3, 0), I(0, 9.3, 1.75), I(0, 8.3, 1.75)], this.tone(P.deskTop, -20), this.tone(P.deskTop, -45));
      const knob = I(0, 9.1, 0.85);
      this.blob(knob.x, knob.y, 1.6, 1.6, P.walnut);
    }
    label(text, p, color, size) {
      const c = this.ctx;
      c.save();
      c.fillStyle = color;
      c.font = `700 ${size}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, p.x, p.y);
      c.restore();
    }

    // ---------- furniture (each returns a depth-sorted draw item) ----------
    furniture() {
      const P = this.pal;
      const items = [];
      const add = (x, y, w, d, draw) => items.push({ depth: x + w / 2 + y + d / 2, draw });
      const owners = new Map(this.people.map((p) => [p.def.desk.join(), p]));

      // desks: a row of three at the back, three in front; teammates have their own
      const desks = [[2, 2], [4.4, 2], [6.8, 2], [2, 4.5], [4.4, 4.5], [6.8, 4.5]];
      desks.forEach(([x, y], i) => {
        const owner = owners.get([x, y].join());
        const on = owner && WORKING.has(owner.status) && owner.at === owner.def.seat;
        const panel = P.panel[i % 4];
        add(x, y - 0.2, 2.2, 0.1, () => {
          this.box(x, y - 0.25, 0, 2.2, 0.1, 1.2, this.tone(panel, 14), panel, this.tone(panel, -18));
          for (let k = 1; k < 8; k++) this.line(this.iso(x + k * 0.275, y - 0.15, 0.05), this.iso(x + k * 0.275, y - 0.15, 1.2), this.tone(panel, -14), 0.7);
        });
        add(x, y, 2.2, 0.9, () => {
          this.wood(x, y, 0, 2.2, 0.9, 0.72, P.deskTop);
          // monitor sits to the left so the screen stays visible past the person
          this.box(x + 0.2, y + 0.2, 0.72, 0.08, 0.08, 0.2, P.monitor, P.monitor, P.monitor);
          this.box(x + 0.05, y + 0.2, 0.92, 0.75, 0.08, 0.5, P.monitor, P.monitor, P.monitor);
          this.screen(x + 0.1, y + 0.28, 0.97, 0.65, 0.4, on, owner?.status);
          this.box(x + 1.0, y + 0.45, 0.72, 0.6, 0.2, 0.03, P.ceramic, this.tone(P.ceramic, -20), this.tone(P.ceramic, -32));
          if (owner) {
            this.box(x + 1.85, y + 0.25, 0.72, 0.16, 0.16, 0.2, P.ceramic, this.tone(P.ceramic, -14), this.tone(P.ceramic, -26)); // cup
            if (on) this.steam(this.iso(x + 1.93, y + 0.33, 0.95));
          }
          this.plantOnDesk(x + 1.75, y + 0.65, i);
        });
        if (!owner) add(x + 0.85, y + 1.2, 0.5, 0.5, () => this.chair(x + 0.85, y + 1.2));
      });
      for (const p of this.people) {
        const s = p.def.seat;
        add(s.x - 0.25, s.y + 0.15, 0.5, 0.5, () => this.chair(s.x - 0.25, s.y + 0.15));
      }

      // walnut cabinet with the server: LEDs blink faster while anyone works
      add(9.6, 0.2, 0.85, 0.8, () => {
        this.wood(9.6, 0.2, 0, 0.85, 0.8, 2.0, P.walnut);
        const busy = this.people.some((p) => WORKING.has(p.status));
        const rate = busy ? 9 : 1.5;
        for (let r = 0; r < 7; r++) {
          const lit = Math.sin(this.t / 1000 * rate + r * 1.7) > 0;
          const p = this.iso(9.75 + (r % 2) * 0.4, 1.0, 0.3 + r * 0.24);
          this.ctx.fillStyle = lit ? (r % 3 ? '#9fcf8a' : '#e6c27a') : 'rgba(0,0,0,.35)';
          this.ctx.fillRect(p.x - 1, p.y - 1, 2.5, 2.5);
        }
      });

      // ceramics niche shelf and bookshelf on the left wall
      add(0.1, 4.9, 0.6, 0.9, () => {
        this.wood(0.1, 4.9, 0, 0.6, 0.9, 1.9, P.deskTop);
        for (const [sz, vy, col, hh] of [[0.55, 5.05, P.ceramic, 0.3], [1.0, 5.35, '#b9a48a', 0.22], [1.45, 5.1, P.pot, 0.26]]) {
          this.box(0.7, 4.95, sz - 0.06, 0.02, 0.85, 0.04, this.tone(P.deskTop, -20), this.tone(P.deskTop, -30), this.tone(P.deskTop, -30));
          const v = this.iso(0.55, vy + 0.15, sz);
          this.rrect(v.x - 4, v.y - hh * 32, 8, hh * 32, 3, col);
        }
      });
      add(0.1, 6.6, 0.5, 1.6, () => {
        this.wood(0.1, 6.6, 0, 0.5, 1.6, 1.8, P.deskTop);
        for (let s = 0; s < 4; s++) {
          for (let b = 0; b < 6; b++) {
            if ((s * 6 + b) % 7 === 3) continue; // a few gaps, it's a real shelf
            const y0 = 6.7 + b * 0.24, z0 = 0.12 + s * 0.42;
            this.poly([this.iso(0.6, y0, z0), this.iso(0.6, y0 + 0.18, z0), this.iso(0.6, y0 + 0.18, z0 + 0.3), this.iso(0.6, y0, z0 + 0.3)], P.book[(s * 6 + b * 7) % 5]);
          }
        }
      });

      // ping-pong table in muted sage
      add(6.5, 6.6, 2.4, 1.3, () => {
        for (const [lx, ly] of [[6.6, 6.7], [8.7, 6.7], [6.6, 7.7], [8.7, 7.7]]) this.box(lx, ly, 0, 0.1, 0.1, 0.6, P.walnut, P.walnut, P.walnut);
        this.box(6.5, 6.6, 0.6, 2.4, 1.3, 0.08, '#93a28a', '#7f8e77', '#717f69');
        this.line(this.iso(7.7, 6.6, 0.68), this.iso(7.7, 7.9, 0.68), '#f6f0e3', 1);
      });

      // lounge: boucle couch, low walnut table, floor cushion, paper lantern
      add(1.6, 9.9, 2.8, 1.2, () => {
        const sh = (c, a) => this.tone(c, a);
        this.box(1.6, 9.9, 0, 2.8, 0.3, 0.9, P.couchD, sh(P.couchD, -10), sh(P.couchD, -24));
        this.box(1.6, 10.2, 0, 2.8, 0.85, 0.42, P.couch, sh(P.couch, -12), sh(P.couch, -26));
        this.box(1.4, 9.9, 0, 0.25, 1.15, 0.6, P.couchD, sh(P.couchD, -10), sh(P.couchD, -24));
        this.box(4.4, 9.9, 0, 0.25, 1.15, 0.6, P.couchD, sh(P.couchD, -10), sh(P.couchD, -24));
        const pillow = this.iso(2.1, 10.3, 0.7);
        this.blob(pillow.x, pillow.y, 8, 6, '#c9a27e', -0.4);
      });
      add(2.3, 11.45, 1.4, 0.6, () => {
        this.wood(2.3, 11.45, 0, 1.4, 0.6, 0.28, P.walnut);
        const vase = this.iso(2.7, 11.7, 0.28);
        this.rrect(vase.x - 3, vase.y - 9, 6, 9, 2.5, P.ceramic);
        this.line({ x: vase.x, y: vase.y - 9 }, { x: vase.x + 7, y: vase.y - 24 }, '#7a6048', 1);
        this.blob(vase.x + 5, vase.y - 19, 2.5, 1.5, P.leaf[1], -0.8);
        this.blob(vase.x + 7, vase.y - 24, 2.5, 1.5, P.leaf[0], -0.4);
      });
      add(5.1, 11.2, 0.7, 0.7, () => {
        const p = this.iso(5.45, 11.55, 0.12);
        this.blob(p.x, p.y, 15, 9, '#c4ab8a');
        this.blob(p.x, p.y - 2, 12, 7, this.tone('#c4ab8a', 12));
      });
      add(5.6, 9.6, 0.3, 0.3, () => {
        this.box(5.7, 9.7, 0, 0.05, 0.05, 1.4, P.walnut, P.walnut, P.walnut);
        const p = this.iso(5.73, 9.73, 1.65);
        const glow = sky().night ? '#fff1cf' : P.paper;
        if (sky().night) this.blob(p.x, p.y, 22, 18, 'rgba(255,230,180,.18)');
        this.blob(p.x, p.y, 10, 11, glow);
        for (let i = -1; i <= 1; i++) this.line({ x: p.x - 9, y: p.y + i * 4 }, { x: p.x + 9, y: p.y + i * 4 }, 'rgba(160,130,95,.35)', 0.6);
      });

      // tea corner: low table and floor cushions
      add(8.6, 10.6, 1.0, 0.7, () => {
        this.wood(8.6, 10.6, 0, 1.0, 0.7, 0.3, P.walnut);
        const pot = this.iso(9.0, 10.9, 0.3);
        this.blob(pot.x, pot.y - 4, 5, 4, '#7d6a58');
        this.blob(pot.x + 8, pot.y - 1, 2.5, 2, P.ceramic);
        if (this.people.some((p) => p.at?.name === 'tea')) this.steam({ x: pot.x, y: pot.y - 8 });
      });
      for (const [cx, cy] of [[8.6, 11.55], [9.75, 10.6]]) add(cx, cy, 0.5, 0.5, () => { const p = this.iso(cx + 0.25, cy + 0.25, 0.08); this.blob(p.x, p.y, 11, 6, '#b8a07f'); });

      // pantry: stone counter with coffee machine and sink, fridge, water urn, table
      add(11.8, 10.6, 3.8, 0.7, () => {
        this.box(11.8, 10.6, 0, 3.8, 0.7, 0.9, P.counter, this.tone(P.deskTop, -10), this.tone(P.deskTop, -24));
        this.box(12.4, 10.7, 0.9, 0.45, 0.4, 0.5, '#4a433b', '#3a342e', '#2f2a25');
        this.box(13.6, 10.7, 0.9, 0.7, 0.45, 0.02, P.metal, P.metal, P.metal);
        this.plant(14.9, 10.75, 'succulent', 1.1);
        if (this.people.some((p) => p.at?.name === 'coffee')) this.steam(this.iso(12.6, 10.9, 1.45));
      });
      add(15.1, 7.0, 0.8, 0.8, () => this.box(15.1, 7.0, 0, 0.8, 0.8, 1.9, P.counter, P.counterL, P.counterR));
      add(11.2, 7.0, 0.5, 0.5, () => {
        this.wood(11.2, 7.0, 0, 0.5, 0.5, 0.8, P.deskTop);
        const u = this.iso(11.45, 7.25, 0.8);
        this.rrect(u.x - 7, u.y - 16, 14, 16, 5, P.ceramic);
      });
      add(13.6, 8.3, 0.9, 0.9, () => {
        this.box(13.95, 8.65, 0, 0.12, 0.12, 0.7, P.walnut, P.walnut, P.walnut);
        const p = this.iso(14.05, 8.75, 0.72);
        this.blob(p.x, p.y, 22, 11, P.deskTop);
      });

      // meeting room: low table, chairs, shoji screens, an ikebana vase
      add(12.1, 2.3, 3, 1.2, () => {
        this.wood(12.1, 2.3, 0, 3, 1.2, 0.68, P.deskTop);
        const v = this.iso(13.6, 2.9, 0.68);
        this.rrect(v.x - 3.5, v.y - 10, 7, 10, 3, P.ceramic);
        this.line({ x: v.x, y: v.y - 10 }, { x: v.x - 8, y: v.y - 28 }, '#7a6048', 1.2);
        this.blob(v.x - 6, v.y - 22, 3, 2, '#d98e7a', 0.3);
        this.blob(v.x - 8, v.y - 28, 2.5, 1.8, '#e6a896', 0);
      });
      for (const cx of [12.4, 13.4, 14.4]) add(cx, 3.7, 0.5, 0.5, () => this.chair(cx, 3.7));
      add(11, 0, 0.05, 5, () => this.shoji([11, 0], [11, 4.4]));
      add(12.4, 5, 3.6, 0.05, () => this.shoji([12.4, 5], [16, 5]));

      // greenery
      const green = [
        [0.3, 11.5, 'monstera', 1.15], [0.35, 9.55, 'snake', 1.1], [0.35, 3.9, 'fig', 1], [10.2, 4.0, 'fig', 1.1],
        [15.3, 0.4, 'olive', 1.1], [10.75, 0.25, 'snake', 1], [15.45, 11.75, 'monstera', 1], [6.1, 11.6, 'snake', 1],
        [15.45, 3.8, 'bush', 1], [11.3, 11.75, 'bush', 0.9], [9.05, 6.65, 'bush', 0.8], [4.3, 9.45, 'succulent', 1.2],
      ];
      for (const [px, py, kind, s] of green) add(px, py, 0.4, 0.4, () => this.plant(px, py, kind, s));
      return items;
    }
    plantOnDesk(x, y, i) {
      const P = this.pal;
      const base = this.iso(x, y, 0.72);
      this.rrect(base.x - 3, base.y - 6, 6, 6, 1.5, i % 2 ? P.ceramic : P.pot);
      for (let k = 0; k < 4; k++) this.blob(base.x + Math.cos(k * 1.6 + i) * 2.5, base.y - 9 - (k % 2) * 2, 2.6, 1.8, P.leaf[(k + i) % 4], k);
    }
    chair(x, y) {
      const P = this.pal;
      this.box(x + 0.2, y + 0.2, 0, 0.08, 0.08, 0.35, P.walnut, P.walnut, this.tone(P.walnut, -15));
      this.box(x, y, 0.35, 0.5, 0.5, 0.08, P.chair, this.tone(P.chair, -12), this.tone(P.chair, -24));
      this.box(x, y + 0.42, 0.43, 0.5, 0.08, 0.4, P.chair, this.tone(P.chair, -12), this.tone(P.chair, -24));
    }
    shoji([x0, y0], [x1, y1]) {
      const P = this.pal;
      const I = (x, y, z) => this.iso(x, y, z);
      this.poly([I(x0, y0, 0), I(x1, y1, 0), I(x1, y1, 1.8), I(x0, y0, 1.8)], P.shoji, P.shojiFrame, 1.4);
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.round(len / 0.45);
      for (let i = 1; i < n; i++) {
        const t = i / n;
        this.line(I(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0), I(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 1.8), P.shojiFrame, i % 2 ? 0.5 : 0.9);
      }
      for (const z of [0.45, 0.9, 1.35]) this.line(I(x0, y0, z), I(x1, y1, z), P.shojiFrame, 0.6);
    }
    screen(x, y, z, w, h, on, status) {
      const P = this.pal;
      const I = (a, b, c) => this.iso(a, b, c);
      const q = [I(x, y, z), I(x + w, y, z), I(x + w, y, z + h), I(x, y, z + h)];
      this.poly(q, on ? '#1f2a33' : P.screenOff);
      if (!on) return;
      const c = this.ctx;
      c.save();
      c.beginPath();
      q.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.clip();
      const colors = ['#9cc3d6', '#bcd39a', '#e3b5a4', '#e8cf94'];
      const speed = status === 'thinking' ? 0.15 : 1;
      const scroll = (this.t / 1000 * speed * 0.35) % 0.1;
      for (let i = 0; i < 6; i++) {
        const zz = z + h - 0.06 - i * 0.065 + scroll;
        const len = 0.15 + ((i * 7) % 5) * 0.08;
        this.line(I(x + 0.06 + (i % 3) * 0.04, y, zz), I(x + 0.06 + (i % 3) * 0.04 + len, y, zz), colors[i % 4], 1.4);
      }
      c.restore();
    }
    steam(p) {
      const c = this.ctx;
      c.strokeStyle = 'rgba(200,190,175,.6)';
      c.lineWidth = 1.2;
      for (let i = 0; i < 2; i++) {
        const k = (this.t / 1200 + i / 2) % 1;
        c.globalAlpha = 1 - k;
        c.beginPath();
        c.moveTo(p.x + i * 3 - 1, p.y - k * 10);
        c.quadraticCurveTo(p.x + i * 3 + 2, p.y - k * 10 - 3, p.x + i * 3 - 1, p.y - k * 10 - 6);
        c.stroke();
      }
      c.globalAlpha = 1;
    }

    // ---------- a teammate ----------
    drawPerson(p) {
      const c = this.ctx;
      const t = this.t / 1000 + p.phase;
      const look = p.def.look;
      const { pose, face, act, z } = this.pose(p);
      const seated = pose === 'sit';
      const front = face !== 'back';
      const moving = pose === 'walk';
      const stepK = moving ? Math.sin(t * 12) : 0;
      const ground = this.iso(p.x, p.y);
      const base = this.iso(p.x, p.y, seated ? z ?? 0.45 : 0);
      const sc = p.def.scale;

      this.blob(ground.x, ground.y, 10 * sc, 5 * sc, this.pal.shadow);
      if (this.hover === p.id) {
        c.strokeStyle = STATUS_COLOR[p.status] ?? '#888'; c.lineWidth = 2;
        c.beginPath(); c.ellipse(ground.x, ground.y, 14, 7, 0, 0, Math.PI * 2); c.stroke();
      }

      c.save();
      c.translate(base.x + (act === 'pingpong' ? Math.sin(t * 7) * 4 : 0), base.y - (moving ? Math.abs(stepK) * 1.5 : 0));
      c.scale(sc, sc);
      const hip = seated ? -4 : -10;
      const hy = hip - 20 + (act === 'think' ? Math.sin(t * 1.5) * 0.6 : 0);
      if (p.def.longHair && !front) { c.fillStyle = look.hair; c.fillRect(-7, hy, 14, 13); }
      c.fillStyle = look.pants;
      if (seated) {
        c.fillRect(-5, -4, 4, 5); c.fillRect(1, -4, 4, 5);
      } else {
        c.fillRect(-5, -10, 4, 10 + stepK * 2); c.fillRect(1, -10, 4, 10 - stepK * 2);
        c.fillStyle = '#3a322b';
        c.fillRect(-5, -1 + stepK, 4, 2); c.fillRect(1, -1 - stepK, 4, 2);
      }
      this.rrect(-7, hip - 13, 14, 14, 3, look.shirt);
      const arm = this.tone(look.shirt, -18);
      const hand = (hx, hy2) => this.blob(hx, hy2, 2.2, 2.2, look.skin);
      c.fillStyle = arm;
      switch (act) {
        case 'wave': {
          const w = Math.sin(t * 8) * 2;
          c.fillRect(6, hip - 26, 3, 14); hand(7.5 + w * 0.6, hip - 27);
          c.fillStyle = arm; c.fillRect(-9, hip - 11, 3, 10);
          break;
        }
        case 'type': {
          const k = Math.sin(t * 18) > 0 ? 1 : 0;
          c.fillRect(-9, hip - 11 - k, 3, 8); c.fillRect(6, hip - 11 - (1 - k), 3, 8);
          break;
        }
        case 'think':
          c.fillRect(-9, hip - 11, 3, 10); c.fillRect(5, hip - 17, 3, 8); hand(6.5, hip - 18);
          break;
        case 'coffee': case 'water': case 'tea': {
          const sip = Math.sin(t * 0.9) > 0.6;
          c.fillRect(-9, hip - 11, 3, 10); c.fillRect(6, sip ? hip - 15 : hip - 11, 3, sip ? 7 : 10);
          c.fillStyle = act === 'water' ? 'rgba(190,215,230,.95)' : this.pal.ceramic;
          c.fillRect(6, sip && front ? hip - 19 : hip - 4, 5, 6);
          break;
        }
        case 'books': case 'couch':
          c.fillRect(-8, hip - 11, 3, 7); c.fillRect(5, hip - 11, 3, 7);
          if (front) { c.fillStyle = act === 'couch' ? '#2e2925' : '#8f9a7c'; c.fillRect(act === 'couch' ? -3 : -7, hip - 12, act === 'couch' ? 6 : 14, 9); }
          break;
        case 'whiteboard': case 'plants': {
          const k = Math.sin(t * 3);
          c.fillRect(-9, hip - 11, 3, 10); c.fillRect(6, hip - 20 + k * 2, 3, 12); hand(7.5, hip - 21 + k * 2);
          if (act === 'plants') { c.fillStyle = '#9aa7a0'; c.fillRect(8, hip - 24 + k * 2, 6, 4); }
          break;
        }
        case 'pingpong':
          c.fillRect(-9, hip - 11, 3, 10); c.fillRect(6, hip - 14, 3, 9);
          this.blob(10, hip - 16, 4, 4, '#b5604c');
          break;
        default: {
          const sw = moving ? stepK * 2 : 0;
          c.fillRect(-9, hip - 11 + sw, 3, 10); c.fillRect(6, hip - 11 - sw, 3, 10);
        }
      }
      this.blob(0, hy, 7, 7, look.skin);
      c.fillStyle = look.hair;
      if (front) {
        c.beginPath(); c.arc(0, hy - 1.5, 7, Math.PI * 1.05, Math.PI * 1.95); c.fill();
        if (p.def.longHair) { c.fillRect(-7.5, hy - 2, 2.5, 11); c.fillRect(5, hy - 2, 2.5, 11); }
        c.fillStyle = '#2a2018';
        c.fillRect(-3.5, hy, 1.6, 1.8); c.fillRect(2, hy, 1.6, 1.8);
        if (p.def.glasses) {
          c.strokeStyle = '#2a2018'; c.lineWidth = 0.8;
          c.strokeRect(-5, hy - 0.6, 4, 3); c.strokeRect(1, hy - 0.6, 4, 3);
          this.line({ x: -1, y: hy + 0.5 }, { x: 1, y: hy + 0.5 }, '#2a2018', 0.8);
        }
      } else {
        c.beginPath(); c.arc(0, hy - 0.5, 7.2, 0, Math.PI * 2); c.fill();
      }
      c.restore();
      return { x: base.x, y: base.y + (hip - 30) * sc };
    }

    // Name tag, status pill and bubbles above the head (drawn on top of everything).
    overlay(p, head) {
      const c = this.ctx;
      const t = this.t / 1000 + p.phase;
      const P = this.pal;
      const col = STATUS_COLOR[p.status] ?? '#999';
      const font = (w, s) => `${w} ${s}px system-ui, -apple-system, "Noto Sans TC", sans-serif`;
      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const pill = (text, fg, bg, y, x = head.x) => {
        c.font = font(600, 10);
        const w = c.measureText(text).width + 12;
        this.rrect(x - w / 2, y - 8, w, 16, 8, bg);
        c.fillStyle = fg;
        c.fillText(text, x, y + 0.5);
        return y - 10;
      };
      let top = head.y;
      const arrived = !p.path.length && p.at === this.wanted(p);

      if (arrived && p.status === 'thinking') {
        const bx = head.x + 14, by = head.y - 14;
        this.blob(head.x + 5, head.y - 2, 2.5, 2.5, P.bubble);
        this.rrect(bx - 16, by - 9, 32, 18, 9, P.bubble);
        for (let i = 0; i < 3; i++) {
          c.globalAlpha = 0.35 + 0.65 * Math.max(0, Math.sin(t * 5 - i * 0.8));
          this.blob(bx - 7 + i * 7, by, 2.2, 2.2, col);
        }
        c.globalAlpha = 1;
        top = by - 12;
      } else if (arrived && p.status === 'running') {
        top = pill(p.tool === 'delegate' ? '📋 等組員回報' : `⚙ ${TOOL_LABEL[p.tool] ?? p.tool ?? '工具'}`, '#fff', col, head.y - 6);
      } else if (arrived && p.status === 'writing') {
        top = pill('✍ 撰寫中', '#fff', col, head.y - 6);
      } else if (arrived && (p.status === 'waiting' || p.status === 'error')) {
        const jump = Math.abs(Math.sin(t * 4)) * 4;
        this.blob(head.x, head.y - 8 - jump, 9, 9, col);
        c.fillStyle = '#fff'; c.font = font(800, 12);
        c.fillText('!', head.x, head.y - 7.5 - jump);
        top = head.y - 19 - jump;
      } else if (!WORKING.has(p.status)) {
        const spot = p.at;
        if (p.status === 'done' && Date.now() - p.doneAt < 60000) {
          this.blob(head.x, head.y - 6, 7, 7, STATUS_COLOR.done);
          c.fillStyle = '#fff'; c.font = font(800, 9); c.fillText('✓', head.x, head.y - 5.5);
          top = head.y - 15;
        } else if (spot?.emoji && !p.path.length && (t % 8) < 2.4) {
          c.globalAlpha = Math.min(1, (t % 8) * 3, (2.4 - (t % 8)) * 3);
          c.font = font(400, 13);
          c.fillText(spot.emoji, head.x, head.y - 6);
          c.globalAlpha = 1;
          top = head.y - 15;
        }
      }
      pill(p.def.name, P.text, P.tagBg, top - 4);
      c.restore();
    }

    drawCat() {
      const c = this.ctx;
      const k = this.cat;
      const p = this.iso(k.x, k.y);
      const moving = k.path.length > 0;
      this.blob(p.x, p.y, 7, 3, this.pal.shadow);
      c.save();
      c.translate(p.x, p.y);
      c.scale(k.face, 1);
      const fur = '#cfa77a';
      c.fillStyle = fur;
      const leg = moving ? Math.sin(this.t / 80) * 1.5 : 0;
      c.fillRect(-5, -4 + leg, 2, 4); c.fillRect(3, -4 - leg, 2, 4);
      this.blob(0, -6, 7, 4, fur);
      this.blob(7, -9, 3.6, 3.6, fur);
      c.fillStyle = fur;
      c.beginPath(); c.moveTo(5, -12); c.lineTo(6, -15); c.lineTo(8, -12); c.fill();
      c.beginPath(); c.moveTo(8, -12); c.lineTo(10, -15); c.lineTo(10.5, -11); c.fill();
      c.strokeStyle = fur; c.lineWidth = 2;
      c.beginPath(); c.moveTo(-6, -7); c.quadraticCurveTo(-11, -10 + Math.sin(this.t / 400) * 2, -9, -15); c.stroke();
      c.restore();
    }

    frame(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.t = now;
      this.step(dt, now);

      const c = this.ctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, this.canvas.width, this.canvas.height);
      c.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, this.dpr * this.ox, this.dpr * this.oy);
      this.floor();
      this.walls();
      const items = this.furniture();
      const heads = [];
      for (const p of this.people) items.push({ depth: p.x + p.y + 0.01, draw: () => heads.push([p, this.drawPerson(p)]) });
      items.push({ depth: this.cat.x + this.cat.y, draw: () => this.drawCat() });
      items.sort((a, b) => a.depth - b.depth);
      for (const it of items) it.draw();
      for (const [p, head] of heads) this.overlay(p, head);
      requestAnimationFrame((t) => this.frame(t));
    }
  }

  Office.PEOPLE = PEOPLE;
  window.Office = Office;
})();
