// Isometric 2D office for one agent. While it works it sits at its cubicle
// (thought bubble, typing, code on the monitor); when it needs you it stands
// up and waves; off duty it wanders: coffee, water, the couch, the bookshelf,
// ping-pong, the arcade, the window, the meeting-room whiteboard.
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
    thinking: '#8b6be6', running: '#3b8ee0', writing: '#22a874', waiting: '#e09412',
    done: '#5f9a4c', error: '#de4b40', interrupted: '#9b9a94', idle: '#9b9a94',
  };
  const LOOK = { skin: '#f3cfb0', hair: '#4b3020', shirt: '#c96442', pants: '#34405a' };
  const rand = (a, b) => a + Math.random() * (b - a);

  function palette() {
    const forced = document.documentElement.dataset.theme;
    const dark = forced ? forced === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    return dark ? {
      dark, wood1: '#4a3f35', wood2: '#453a31', woodLine: 'rgba(0,0,0,.22)',
      tileA: '#3d4044', tileB: '#35383c', carpet: '#33404d',
      wallL: '#4a4640', wallR: '#3f3b36', wallTop: '#5a554e', trim: '#2b2926',
      deskTop: '#8a6a4c', deskL: '#6e533b', deskR: '#5c4431', monitor: '#18181a', screenOff: '#26282c', chair: '#2d2d32',
      rug: '#47544f', couch: '#5b6b8c', couchD: '#4a587a', counter: '#d9d4c9', counterL: '#a9a397', counterR: '#958f84',
      metal: '#8d939a', glass: 'rgba(160,200,230,.10)', glassEdge: 'rgba(190,220,240,.35)',
      text: '#ecebe6', tagBg: 'rgba(20,20,19,.82)', bubble: '#f4f3ee', bubbleInk: '#1c1c1a',
      plant: '#4f8a52', pot: '#9a5b3c', shadow: 'rgba(0,0,0,.28)', panel: ['#5d6f96', '#a86d55', '#628a6c', '#9d8240'],
      book: ['#c96442', '#3b8ee0', '#5f9a4c', '#c9a24c', '#8b6be6'],
    } : {
      dark, wood1: '#e6d3b6', wood2: '#dfcaab', woodLine: 'rgba(120,90,50,.12)',
      tileA: '#f4f4f1', tileB: '#e6e7e3', carpet: '#c9d3dc',
      wallL: '#f4efe6', wallR: '#e8e1d4', wallTop: '#fbf8f2', trim: '#cfc5b3',
      deskTop: '#c89f72', deskL: '#a8825a', deskR: '#946f4b', monitor: '#2a2a2e', screenOff: '#3a3d44', chair: '#4a4a52',
      rug: '#c4d4cb', couch: '#7d93c4', couchD: '#6a80b0', counter: '#fbfaf7', counterL: '#d9d4c9', counterR: '#c9c3b6',
      metal: '#b5bcc4', glass: 'rgba(170,210,235,.16)', glassEdge: 'rgba(120,160,190,.55)',
      text: '#1c1c1a', tagBg: 'rgba(255,255,255,.92)', bubble: '#ffffff', bubbleInk: '#1c1c1a',
      plant: '#5a9b5d', pot: '#b86f4b', shadow: 'rgba(60,40,20,.18)', panel: ['#7d93c4', '#d98b6a', '#7fb08a', '#c9a24c'],
      book: ['#c96442', '#3b8ee0', '#5f9a4c', '#c9a24c', '#8b6be6'],
    };
  }

  function sky(d = new Date()) {
    const h = d.getHours() + d.getMinutes() / 60;
    if (h >= 7 && h < 17) return { color: '#a9d4f2', night: false };
    if (h >= 5 && h < 7) return { color: '#f3c9a8', night: false };
    if (h >= 17 && h < 19) return { color: '#f0a679', night: false };
    return { color: '#1d2747', night: true };
  }

  // Places the agent goes. `entry` is the route from the aisle to the spot.
  const DESK = { x: 3.15, y: 3.3, pose: 'sit', face: 'back', entry: [[1.35, AISLE_Y], [1.35, 3.3]] };
  const SPOTS = [
    { name: 'coffee', x: 12.7, y: 10.15, emoji: '☕', face: 'front' },
    { name: 'fridge', x: 14.75, y: 8.2, emoji: '🍎', face: 'front' },
    { name: 'water', x: 11.45, y: 7.85, emoji: '💧', face: 'back' },
    { name: 'couch', x: 2.9, y: 10.75, emoji: '📱', pose: 'sit', face: 'front', entry: [[4.75, AISLE_Y], [4.75, 10.75]] },
    { name: 'books', x: 1.05, y: 7.45, emoji: '📖', face: 'front' },
    { name: 'pingpong', x: 7.7, y: 8.25, emoji: '🏓', face: 'back', entry: [[6.1, AISLE_Y], [6.1, 8.25]] },
    { name: 'arcade', x: 9.6, y: 11.55, emoji: '🎮', face: 'back' },
    { name: 'window', x: 3.7, y: 0.85, emoji: '☁️', face: 'back', entry: [[1.35, AISLE_Y], [1.35, 0.85]] },
    { name: 'whiteboard', x: 13.3, y: 1.45, emoji: '✏️', face: 'back', entry: [[11.75, AISLE_Y], [11.75, 1.45]] },
  ];
  for (const s of [DESK, ...SPOTS]) s.entry ??= [[s.x, AISLE_Y]];

  class Office {
    constructor(canvas, { onClick } = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.onClick = onClick;
      this.status = 'idle';
      this.detail = '';
      this.tool = '';
      this.pal = palette();
      this.agent = { x: DESK.x, y: DESK.y, at: DESK, path: [], until: 0, phase: Math.random() * 6 };
      this.cat = { x: 8, y: 9.5, path: [], until: 0, face: 1 };
      this.hover = false;
      this.last = performance.now();
      this.t = 0;

      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { this.pal = palette(); });
      new ResizeObserver(() => this.resize()).observe(canvas);
      canvas.addEventListener('mousemove', (e) => this.pointer(e));
      canvas.addEventListener('mouseleave', () => { this.hover = false; canvas.style.cursor = ''; });
      canvas.addEventListener('click', (e) => { this.pointer(e); if (this.hover) this.onClick?.(); });
      this.resize();
      requestAnimationFrame((t) => this.frame(t));
    }

    setStatus(status, { detail = '', tool = '' } = {}) {
      const was = this.status;
      this.status = status;
      this.detail = detail;
      if (tool) this.tool = tool;
      if (WORKING.has(status) && !WORKING.has(was)) this.goTo(DESK);
      if (!WORKING.has(status) && WORKING.has(was)) this.agent.until = performance.now() + 2500;
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
      const p = this.iso(this.agent.x, this.agent.y);
      this.hover = Math.abs(mx - p.x) < 14 && my < p.y + 6 && my > p.y - 48;
      this.canvas.style.cursor = this.hover ? 'pointer' : '';
    }

    // ---------- movement ----------
    goTo(spot) {
      const a = this.agent;
      if (a.at === spot && !a.path.length) return;
      const from = a.at ? [...a.at.entry].reverse() : [[a.x, AISLE_Y]];
      a.path = [...from, ...spot.entry, [spot.x, spot.y]].map(([x, y]) => ({ x, y }));
      a.at = null;
      a.target = spot;
    }
    step(dt, now) {
      const a = this.agent;
      if (!WORKING.has(this.status) && !a.path.length && now > a.until) {
        const choices = SPOTS.filter((s) => s !== a.at);
        this.goTo(choices[Math.floor(Math.random() * choices.length)]);
      }
      if (a.path.length) {
        const n = a.path[0];
        const dx = n.x - a.x, dy = n.y - a.y, d = Math.hypot(dx, dy), v = SPEED * dt;
        if (d <= v) {
          a.x = n.x; a.y = n.y; a.path.shift();
          if (!a.path.length) { a.at = a.target; a.until = now + rand(7000, 14000); }
        } else { a.x += (dx / d) * v; a.y += (dy / d) * v; }
      }

      const k = this.cat;
      if (!k.path.length && now > k.until) {
        const spots = [[7.5, AISLE_Y + 0.3], [3.5, 9.3], [10.2, 8.6], [5.5, AISLE_Y + 0.2], [9.5, AISLE_Y + 0.1]];
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

    pose() {
      const a = this.agent;
      if (a.path.length) return { pose: 'walk', face: a.path[0].y < a.y || a.path[0].x < a.x ? 'back' : 'front', act: 'walk' };
      if (a.at === DESK) {
        if (this.status === 'waiting') return { pose: 'stand', face: 'front', act: 'wave' };
        if (this.status === 'running' || this.status === 'writing') return { pose: 'sit', face: 'back', act: 'type' };
        return { pose: 'sit', face: 'back', act: this.status === 'thinking' ? 'think' : 'rest' };
      }
      const spot = a.at ?? DESK;
      return { pose: spot.pose ?? 'stand', face: spot.face ?? 'front', act: spot.name ?? 'rest' };
    }

    // ---------- drawing primitives ----------
    poly(pts, fill, stroke) {
      const c = this.ctx;
      c.beginPath();
      pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.closePath();
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
    }
    box(x, y, z, w, d, h, top, left, right) {
      const I = (a, b, cz) => this.iso(a, b, cz);
      this.poly([I(x, y + d, z), I(x + w, y + d, z), I(x + w, y + d, z + h), I(x, y + d, z + h)], left);
      this.poly([I(x + w, y, z), I(x + w, y + d, z), I(x + w, y + d, z + h), I(x + w, y, z + h)], right);
      this.poly([I(x, y, z + h), I(x + w, y, z + h), I(x + w, y + d, z + h), I(x, y + d, z + h)], top);
    }
    shade(hex, amt) {
      const n = parseInt(hex.slice(1), 16);
      const f = (v) => Math.max(0, Math.min(255, v + amt));
      return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
    }
    rrect(x, y, w, h, r, fill) {
      const c = this.ctx;
      c.beginPath();
      c.roundRect(x, y, w, h, r);
      c.fillStyle = fill;
      c.fill();
    }
    plant(x, y, size = 1) {
      const P = this.pal;
      this.box(x, y, 0, 0.4, 0.4, 0.35, this.shade(P.pot, 12), P.pot, this.shade(P.pot, -18));
      const top = this.iso(x + 0.2, y + 0.2, 0.35);
      const c = this.ctx;
      c.fillStyle = P.plant;
      for (const [dx, dy, r] of [[0, -10, 9], [-7, -5, 7], [7, -5, 7], [0, -18, 6]]) {
        c.beginPath(); c.arc(top.x + dx * size, top.y + dy * size, r * size, 0, Math.PI * 2); c.fill();
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
          else if (x >= 11 && y < 5) fill = P.carpet;
          this.poly([this.iso(x, y), this.iso(x + 1, y), this.iso(x + 1, y + h), this.iso(x, y + h)], fill, x < 11 || y === 5 ? P.woodLine : null);
        }
      }
      // lounge rug
      this.poly([this.iso(1.2, 9.4), this.iso(6, 9.4), this.iso(6, 12.3), this.iso(1.2, 12.3)], P.rug);
      // door mat
      this.poly([this.iso(0, 8.2), this.iso(0.8, 8.2), this.iso(0.8, 9.4), this.iso(0, 9.4)], '#b0563a');
    }
    walls() {
      const P = this.pal;
      const I = (x, y, z) => this.iso(x, y, z);
      this.poly([I(0, 0, 0), I(0, D, 0), I(0, D, WALL_H), I(0, 0, WALL_H)], P.wallL);
      this.poly([I(0, 0, 0), I(W, 0, 0), I(W, 0, WALL_H), I(0, 0, WALL_H)], P.wallR);
      this.poly([I(0, 0, 0), I(0, D, 0), I(0, D, 0.12), I(0, 0, 0.12)], P.trim);
      this.poly([I(0, 0, 0), I(W, 0, 0), I(W, 0, 0.12), I(0, 0, 0.12)], P.trim);
      // wall tops
      this.poly([I(0, 0, WALL_H), I(W, 0, WALL_H), I(W, -0.15, WALL_H), I(-0.15, -0.15, WALL_H), I(-0.15, D, WALL_H), I(0, D, WALL_H)], P.wallTop);

      // windows on the back wall follow the local time of day
      const s = sky();
      for (const wx of [2.6, 4.6, 6.6]) {
        this.poly([I(wx, 0, 1.0), I(wx + 1.3, 0, 1.0), I(wx + 1.3, 0, 2.0), I(wx, 0, 2.0)], s.color, P.trim);
        const c = this.ctx;
        if (s.night) {
          c.fillStyle = '#fff';
          for (let i = 0; i < 4; i++) {
            const p = I(wx + 0.2 + ((i * 37) % 10) / 10, 0, 1.25 + ((i * 53) % 7) / 10);
            c.fillRect(p.x, p.y, 1.5, 1.5);
          }
        } else {
          c.fillStyle = 'rgba(255,255,255,.8)';
          const cloud = I(wx + 0.45 + Math.sin(this.t / 9000 + wx) * 0.25, 0, 1.6);
          c.beginPath(); c.ellipse(cloud.x, cloud.y, 8, 3, -0.46, 0, Math.PI * 2); c.fill();
        }
        const mid = [I(wx + 0.65, 0, 1.0), I(wx + 0.65, 0, 2.0)];
        this.ctx.strokeStyle = P.trim; this.ctx.lineWidth = 2;
        this.ctx.beginPath(); this.ctx.moveTo(mid[0].x, mid[0].y); this.ctx.lineTo(mid[1].x, mid[1].y); this.ctx.stroke();
      }
      // whiteboard in the meeting room
      this.poly([I(12.2, 0, 0.9), I(14.8, 0, 0.9), I(14.8, 0, 1.9), I(12.2, 0, 1.9)], '#fdfdfb', '#a9b1ba');
      this.ctx.strokeStyle = '#e06a4c'; this.ctx.lineWidth = 1.5;
      const a = I(12.5, 0, 1.6), b = I(13.4, 0, 1.3), cc = I(14.3, 0, 1.6);
      this.ctx.beginPath(); this.ctx.moveTo(a.x, a.y); this.ctx.lineTo(b.x, b.y); this.ctx.lineTo(cc.x, cc.y); this.ctx.stroke();
      this.label('MEETING', I(14.6, 0, 2.15), '#9b9a94', 8);
      // poster, clock and door on the left wall
      this.poly([I(0, 1.2, 1.1), I(0, 2.0, 1.1), I(0, 2.0, 1.9), I(0, 1.2, 1.9)], '#2fa36b');
      this.label('SHIP IT', I(0, 1.6, 1.5), '#fff', 7);
      const clock = I(0, 4.2, 1.85);
      this.ctx.fillStyle = '#fff'; this.ctx.strokeStyle = P.trim;
      this.ctx.beginPath(); this.ctx.ellipse(clock.x, clock.y, 6, 8, 0.5, 0, Math.PI * 2); this.ctx.fill(); this.ctx.stroke();
      const now = new Date();
      for (const [len, ang] of [[4, (now.getHours() % 12) / 12], [6, now.getMinutes() / 60]]) {
        const th = ang * Math.PI * 2 - Math.PI / 2;
        this.ctx.strokeStyle = '#333'; this.ctx.lineWidth = 1;
        this.ctx.beginPath(); this.ctx.moveTo(clock.x, clock.y); this.ctx.lineTo(clock.x + Math.cos(th) * len * 0.8, clock.y + Math.sin(th) * len); this.ctx.stroke();
      }
      this.poly([I(0, 8.3, 0), I(0, 9.3, 0), I(0, 9.3, 1.75), I(0, 8.3, 1.75)], '#8a5a3a', '#6b4229');
      const knob = I(0, 9.1, 0.85);
      this.ctx.fillStyle = '#e8c06a'; this.ctx.beginPath(); this.ctx.arc(knob.x, knob.y, 1.6, 0, Math.PI * 2); this.ctx.fill();
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
      const working = WORKING.has(this.status) && this.agent.at === DESK;

      // cubicles: 2 rows x 2 desks; ours is the front-left of the back row
      const desks = [[2, 2], [4.4, 2], [2, 4.5], [4.4, 4.5], [6.8, 2], [6.8, 4.5]];
      desks.forEach(([x, y], i) => {
        const mine = i === 0;
        add(x, y - 0.2, 2.2, 0.1, () => this.box(x, y - 0.25, 0, 2.2, 0.1, 1.25, this.shade(P.panel[i % 4], 25), P.panel[i % 4], this.shade(P.panel[i % 4], -20)));
        add(x, y, 2.2, 0.9, () => {
          this.box(x, y, 0, 2.2, 0.9, 0.72, P.deskTop, P.deskL, P.deskR);
          // monitor sits to the left so the screen stays visible past the person
          this.box(x + 0.2, y + 0.2, 0.72, 0.08, 0.08, 0.2, P.monitor, P.monitor, P.monitor);
          this.box(x + 0.05, y + 0.2, 0.92, 0.75, 0.08, 0.5, P.monitor, P.monitor, P.monitor);
          this.screen(x + 0.1, y + 0.28, 0.97, 0.65, 0.4, mine && working);
          this.box(x + 1.0, y + 0.45, 0.72, 0.6, 0.2, 0.03, '#d4d6da', '#b8bbc0', '#a6a9ae');
          if (mine) {
            this.box(x + 1.85, y + 0.25, 0.72, 0.16, 0.16, 0.2, '#fafafa', '#e6e6e6', '#d4d4d4'); // mug
            if (working) this.steam(this.iso(x + 1.93, y + 0.33, 0.95));
          }
        });
        if (!mine) add(x + 0.85, y + 1.2, 0.5, 0.5, () => this.chair(x + 0.85, y + 1.2));
      });
      add(DESK.x - 0.25, DESK.y + 0.15, 0.5, 0.5, () => this.chair(DESK.x - 0.25, DESK.y + 0.15));

      // server rack: LEDs blink faster while the agent works
      add(9.6, 0.2, 0.85, 0.8, () => {
        this.box(9.6, 0.2, 0, 0.85, 0.8, 2.0, '#2a2c31', '#1e2024', '#16181b');
        const rate = WORKING.has(this.status) ? 9 : 1.5;
        for (let r = 0; r < 7; r++) {
          const on = Math.sin(this.t / 1000 * rate + r * 1.7) > 0;
          const p = this.iso(9.75 + (r % 2) * 0.4, 1.0, 0.3 + r * 0.24);
          this.ctx.fillStyle = on ? (r % 3 ? '#4ade80' : '#60a5fa') : '#334';
          this.ctx.fillRect(p.x - 1, p.y - 1, 2.5, 2.5);
        }
      });

      // vending machine + bookshelf on the left wall
      add(0.1, 4.9, 0.8, 0.9, () => {
        this.box(0.1, 4.9, 0, 0.8, 0.9, 1.9, '#d24b3c', '#b33a2d', '#9a3125');
        this.poly([this.iso(0.9, 5.0, 0.6), this.iso(0.9, 5.6, 0.6), this.iso(0.9, 5.6, 1.7), this.iso(0.9, 5.0, 1.7)], '#9fd3f0');
      });
      add(0.1, 6.6, 0.5, 1.6, () => {
        this.box(0.1, 6.6, 0, 0.5, 1.6, 1.8, '#a07a55', '#8a6646', '#73553a');
        for (let s = 0; s < 4; s++) {
          for (let b = 0; b < 6; b++) {
            const y0 = 6.7 + b * 0.24;
            const z0 = 0.12 + s * 0.42;
            this.poly([this.iso(0.6, y0, z0), this.iso(0.6, y0 + 0.18, z0), this.iso(0.6, y0 + 0.18, z0 + 0.3), this.iso(0.6, y0, z0 + 0.3)], P.book[(s * 6 + b * 7) % 5]);
          }
        }
      });

      // ping-pong table
      add(6.5, 6.6, 2.4, 1.3, () => {
        for (const [lx, ly] of [[6.6, 6.7], [8.7, 6.7], [6.6, 7.7], [8.7, 7.7]]) this.box(lx, ly, 0, 0.1, 0.1, 0.6, '#333', '#333', '#222');
        this.box(6.5, 6.6, 0.6, 2.4, 1.3, 0.08, '#2e8b57', '#256f46', '#1f5d3a');
        const a = this.iso(7.7, 6.6, 0.68), b = this.iso(7.7, 7.9, 0.68);
        this.ctx.strokeStyle = '#fff'; this.ctx.lineWidth = 1;
        this.ctx.beginPath(); this.ctx.moveTo(a.x, a.y); this.ctx.lineTo(b.x, b.y); this.ctx.stroke();
      });

      // lounge: couch (back on the far side), coffee table, beanbag, lamp
      add(1.6, 9.9, 2.8, 1.2, () => {
        this.box(1.6, 9.9, 0, 2.8, 0.3, 0.95, P.couchD, this.shade(P.couchD, -10), this.shade(P.couchD, -25));
        this.box(1.6, 10.2, 0, 2.8, 0.85, 0.45, P.couch, this.shade(P.couch, -12), this.shade(P.couch, -28));
        this.box(1.4, 9.9, 0, 0.25, 1.15, 0.65, P.couchD, this.shade(P.couchD, -10), this.shade(P.couchD, -25));
        this.box(4.4, 9.9, 0, 0.25, 1.15, 0.65, P.couchD, this.shade(P.couchD, -10), this.shade(P.couchD, -25));
      });
      add(2.3, 11.45, 1.4, 0.6, () => this.box(2.3, 11.45, 0, 1.4, 0.6, 0.35, '#b98a5e', '#9c7149', '#865f3c'));
      add(5.1, 11.2, 0.7, 0.7, () => {
        const p = this.iso(5.45, 11.55, 0.15);
        this.ctx.fillStyle = '#e58a3a'; this.ctx.beginPath(); this.ctx.ellipse(p.x, p.y, 15, 9, 0, 0, Math.PI * 2); this.ctx.fill();
      });
      add(5.6, 9.6, 0.3, 0.3, () => {
        this.box(5.7, 9.7, 0, 0.06, 0.06, 1.7, '#555', '#555', '#444');
        const p = this.iso(5.73, 9.73, 1.75);
        this.ctx.fillStyle = sky().night ? '#ffe9a8' : '#f4efe0';
        this.ctx.beginPath(); this.ctx.moveTo(p.x - 7, p.y + 5); this.ctx.lineTo(p.x + 7, p.y + 5); this.ctx.lineTo(p.x + 4, p.y - 5); this.ctx.lineTo(p.x - 4, p.y - 5); this.ctx.fill();
      });

      // arcade cabinet
      add(9.2, 10.4, 0.8, 0.7, () => {
        this.box(9.2, 10.4, 0, 0.8, 0.7, 1.75, '#3b2a6b', '#2f2157', '#261a47');
        const blink = Math.sin(this.t / 300) > 0;
        this.poly([this.iso(9.3, 11.1, 1.0), this.iso(9.9, 11.1, 1.0), this.iso(9.9, 11.1, 1.45), this.iso(9.3, 11.1, 1.45)], blink ? '#ff5ec4' : '#5ee7ff');
      });

      // pantry: counter with coffee machine and sink, fridge, water cooler, table
      add(11.8, 10.6, 3.8, 0.7, () => {
        this.box(11.8, 10.6, 0, 3.8, 0.7, 0.9, P.counter, P.counterL, P.counterR);
        this.box(12.4, 10.7, 0.9, 0.45, 0.4, 0.5, '#2f2f33', '#232326', '#1b1b1e'); // coffee machine
        this.box(13.6, 10.7, 0.9, 0.7, 0.45, 0.02, P.metal, P.metal, P.metal); // sink
        if (this.agent.at?.name === 'coffee') this.steam(this.iso(12.6, 10.9, 1.45));
      });
      add(15.1, 7.0, 0.8, 0.8, () => this.box(15.1, 7.0, 0, 0.8, 0.8, 1.9, '#eef0f2', '#d6dadf', '#c3c8ce'));
      add(11.2, 7.0, 0.5, 0.5, () => {
        this.box(11.2, 7.0, 0, 0.5, 0.5, 0.8, '#e8ecef', '#d0d5da', '#bfc5cb');
        this.box(11.25, 7.05, 0.8, 0.4, 0.4, 0.45, 'rgba(150,200,240,.85)', 'rgba(120,180,230,.85)', 'rgba(100,160,215,.85)');
      });
      add(13.6, 8.3, 0.9, 0.9, () => {
        this.box(13.95, 8.65, 0, 0.12, 0.12, 0.7, '#666', '#666', '#555');
        const p = this.iso(14.05, 8.75, 0.72);
        this.ctx.fillStyle = '#d7b98e'; this.ctx.beginPath(); this.ctx.ellipse(p.x, p.y, 22, 11, 0, 0, Math.PI * 2); this.ctx.fill();
      });

      // meeting room: table, chairs, glass walls
      add(12.1, 2.3, 3, 1.2, () => this.box(12.1, 2.3, 0, 3, 1.2, 0.7, '#b98a5e', '#9c7149', '#865f3c'));
      for (const cx of [12.4, 13.4, 14.4]) add(cx, 3.7, 0.5, 0.5, () => this.chair(cx, 3.7));
      add(11, 0, 0.05, 5, () => this.glass([[11, 0], [11, 4.4]]));
      add(12.4, 5, 3.6, 0.05, () => this.glass([[12.4, 5], [16, 5]]));

      // plants
      add(10.6, 0.2, 0.4, 0.4, () => this.plant(10.6, 0.2));
      add(0.3, 11.9, 0.4, 0.4, () => this.plant(0.3, 11.6, 1.1));
      add(15.4, 0.3, 0.4, 0.4, () => this.plant(15.4, 0.3));
      add(8.5, 4.6, 0.4, 0.4, () => this.plant(9.3, 4.6, 0.9));
      return items;
    }
    chair(x, y) {
      const P = this.pal;
      this.box(x + 0.2, y + 0.2, 0, 0.08, 0.08, 0.35, '#333', '#333', '#222');
      this.box(x, y, 0.35, 0.5, 0.5, 0.08, P.chair, this.shade(P.chair, -12), this.shade(P.chair, -24));
      this.box(x, y + 0.42, 0.43, 0.5, 0.08, 0.4, P.chair, this.shade(P.chair, -12), this.shade(P.chair, -24));
    }
    glass(points) {
      const P = this.pal;
      const [[x0, y0], [x1, y1]] = points;
      this.poly([this.iso(x0, y0, 0), this.iso(x1, y1, 0), this.iso(x1, y1, 1.7), this.iso(x0, y0, 1.7)], P.glass, P.glassEdge);
    }
    screen(x, y, z, w, h, on) {
      const P = this.pal;
      const I = (a, b, c) => this.iso(a, b, c);
      this.poly([I(x, y, z), I(x + w, y, z), I(x + w, y, z + h), I(x, y, z + h)], on ? '#13203a' : P.screenOff);
      if (!on) return;
      const c = this.ctx;
      c.save();
      c.beginPath();
      const q = [I(x, y, z), I(x + w, y, z), I(x + w, y, z + h), I(x, y, z + h)];
      q.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.clip();
      const colors = ['#38bdf8', '#a3e635', '#f472b6', '#fbbf24'];
      const speed = this.status === 'thinking' ? 0.15 : 1;
      const scroll = (this.t / 1000 * speed * 0.35) % 0.1;
      for (let i = 0; i < 6; i++) {
        const zz = z + h - 0.06 - i * 0.065 + scroll;
        const len = 0.15 + ((i * 7) % 5) * 0.08;
        const a = I(x + 0.06 + (i % 3) * 0.04, y, zz), b = I(x + 0.06 + (i % 3) * 0.04 + len, y, zz);
        c.strokeStyle = colors[i % 4]; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      }
      c.restore();
    }
    steam(p) {
      const c = this.ctx;
      c.strokeStyle = 'rgba(200,200,200,.6)';
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

    // ---------- the agent ----------
    person() {
      const c = this.ctx;
      const a = this.agent;
      const t = this.t / 1000;
      const { pose, face, act } = this.pose();
      const seated = pose === 'sit';
      const front = face !== 'back';
      const moving = pose === 'walk';
      const stepK = moving ? Math.sin(t * 12) : 0;
      const ground = this.iso(a.x, a.y);
      const base = this.iso(a.x, a.y, seated ? 0.45 : 0);

      c.fillStyle = this.pal.shadow;
      c.beginPath(); c.ellipse(ground.x, ground.y, 10, 5, 0, 0, Math.PI * 2); c.fill();
      if (this.hover) {
        c.strokeStyle = STATUS_COLOR[this.status] ?? '#888'; c.lineWidth = 2;
        c.beginPath(); c.ellipse(ground.x, ground.y, 14, 7, 0, 0, Math.PI * 2); c.stroke();
      }

      c.save();
      c.translate(base.x + (act === 'pingpong' ? Math.sin(t * 7) * 4 : 0), base.y - (moving ? Math.abs(stepK) * 1.5 : 0));
      c.fillStyle = LOOK.pants;
      if (seated) {
        c.fillRect(-5, -4, 4, 5); c.fillRect(1, -4, 4, 5);
      } else {
        c.fillRect(-5, -10, 4, 10 + stepK * 2); c.fillRect(1, -10, 4, 10 - stepK * 2);
        c.fillStyle = '#2a2a2a';
        c.fillRect(-5, -1 + stepK, 4, 2); c.fillRect(1, -1 - stepK, 4, 2);
      }
      const hip = seated ? -4 : -10;
      this.rrect(-7, hip - 13, 14, 14, 3, LOOK.shirt);
      const arm = this.shade(LOOK.shirt, -18);
      const hand = (hx, hy) => { c.fillStyle = LOOK.skin; c.beginPath(); c.arc(hx, hy, 2.2, 0, Math.PI * 2); c.fill(); };
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
        case 'coffee':
        case 'water': {
          const sip = Math.sin(t * 0.9) > 0.6;
          c.fillRect(-9, hip - 11, 3, 10); c.fillRect(6, sip ? hip - 15 : hip - 11, 3, sip ? 7 : 10);
          c.fillStyle = act === 'water' ? 'rgba(170,215,255,.95)' : '#fafafa';
          c.fillRect(6, sip && front ? hip - 19 : hip - 4, 5, 6);
          break;
        }
        case 'books':
        case 'couch':
          c.fillRect(-8, hip - 11, 3, 7); c.fillRect(5, hip - 11, 3, 7);
          if (front) { c.fillStyle = act === 'couch' ? '#222' : '#3b8ee0'; c.fillRect(act === 'couch' ? -3 : -7, hip - 12, act === 'couch' ? 6 : 14, 9); }
          break;
        case 'arcade':
        case 'whiteboard': {
          const k = Math.sin(t * (act === 'arcade' ? 14 : 3));
          c.fillRect(-9, hip - 11, 3, 10); c.fillRect(6, hip - 20 + k * 2, 3, 12); hand(7.5, hip - 21 + k * 2);
          break;
        }
        case 'pingpong':
          c.fillRect(-9, hip - 11, 3, 10); c.fillRect(6, hip - 14, 3, 9);
          c.fillStyle = '#c0392b'; c.beginPath(); c.arc(10, hip - 16, 4, 0, Math.PI * 2); c.fill();
          break;
        default: {
          const sw = moving ? stepK * 2 : 0;
          c.fillRect(-9, hip - 11 + sw, 3, 10); c.fillRect(6, hip - 11 - sw, 3, 10);
        }
      }
      const hy = hip - 20 + (act === 'think' ? Math.sin(t * 1.5) * 0.6 : 0);
      c.fillStyle = LOOK.skin;
      c.beginPath(); c.arc(0, hy, 7, 0, Math.PI * 2); c.fill();
      c.fillStyle = LOOK.hair;
      if (front) {
        c.beginPath(); c.arc(0, hy - 1.5, 7, Math.PI * 1.05, Math.PI * 1.95); c.fill();
        c.fillStyle = '#2a2018';
        c.fillRect(-3.5, hy, 1.6, 1.8); c.fillRect(2, hy, 1.6, 1.8);
      } else {
        c.beginPath(); c.arc(0, hy - 0.5, 7.2, 0, Math.PI * 2); c.fill();
      }
      c.restore();
      return { x: base.x, y: base.y + hip - 30 };
    }

    // Name tag, status pill and bubbles above the head (drawn on top of everything).
    overlay(head) {
      const c = this.ctx;
      const t = this.t / 1000;
      const P = this.pal;
      const col = STATUS_COLOR[this.status] ?? '#999';
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
      const atDesk = this.agent.at === DESK && !this.agent.path.length;

      if (atDesk && this.status === 'thinking') {
        const bx = head.x + 14, by = head.y - 14;
        c.fillStyle = P.bubble;
        c.beginPath(); c.arc(head.x + 5, head.y - 2, 2.5, 0, Math.PI * 2); c.fill();
        this.rrect(bx - 16, by - 9, 32, 18, 9, P.bubble);
        c.fillStyle = col;
        for (let i = 0; i < 3; i++) {
          c.globalAlpha = 0.35 + 0.65 * Math.max(0, Math.sin(t * 5 - i * 0.8));
          c.beginPath(); c.arc(bx - 7 + i * 7, by, 2.2, 0, Math.PI * 2); c.fill();
        }
        c.globalAlpha = 1;
        top = by - 12;
      } else if (atDesk && this.status === 'running') {
        top = pill(`⚙ ${this.tool || '工具'}`, '#fff', col, head.y - 6);
      } else if (atDesk && this.status === 'writing') {
        top = pill('✍ 撰寫回覆', '#fff', col, head.y - 6);
      } else if (atDesk && (this.status === 'waiting' || this.status === 'error')) {
        const jump = Math.abs(Math.sin(t * 4)) * 4;
        c.fillStyle = col;
        c.beginPath(); c.arc(head.x, head.y - 8 - jump, 9, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#fff'; c.font = font(800, 12);
        c.fillText('!', head.x, head.y - 7.5 - jump);
        top = head.y - 19 - jump;
      } else if (!WORKING.has(this.status)) {
        const spot = this.agent.at;
        if (this.status === 'done' && Date.now() - (this.doneAt ?? 0) < 60000) {
          c.fillStyle = STATUS_COLOR.done;
          c.beginPath(); c.arc(head.x, head.y - 6, 7, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#fff'; c.font = font(800, 9); c.fillText('✓', head.x, head.y - 5.5);
          top = head.y - 15;
        } else if (spot?.emoji && !this.agent.path.length && (t % 8) < 2.4) {
          c.globalAlpha = Math.min(1, (t % 8) * 3, (2.4 - (t % 8)) * 3);
          c.font = font(400, 13);
          c.fillText(spot.emoji, head.x, head.y - 6);
          c.globalAlpha = 1;
          top = head.y - 15;
        } else if (this.status === 'idle' && spot?.name === 'couch') {
          c.fillStyle = STATUS_COLOR.idle; c.font = font(700, 10);
          for (let i = 0; i < 3; i++) {
            const k = (t * 0.6 + i / 3) % 1;
            c.globalAlpha = 1 - k;
            c.fillText('z', head.x + 6 + k * 10, head.y - k * 18);
          }
          c.globalAlpha = 1;
          top = head.y - 16;
        }
      }
      pill('Claude', P.text, P.tagBg, top - 4);
      c.restore();
    }

    drawCat() {
      const c = this.ctx;
      const k = this.cat;
      const p = this.iso(k.x, k.y);
      const moving = k.path.length > 0;
      c.fillStyle = this.pal.shadow;
      c.beginPath(); c.ellipse(p.x, p.y, 7, 3, 0, 0, Math.PI * 2); c.fill();
      c.save();
      c.translate(p.x, p.y);
      c.scale(k.face, 1);
      c.fillStyle = '#e09a4c';
      const leg = moving ? Math.sin(this.t / 80) * 1.5 : 0;
      c.fillRect(-5, -4 + leg, 2, 4); c.fillRect(3, -4 - leg, 2, 4);
      c.beginPath(); c.ellipse(0, -6, 7, 4, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(7, -9, 3.6, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(5, -12); c.lineTo(6, -15); c.lineTo(8, -12); c.fill();
      c.beginPath(); c.moveTo(8, -12); c.lineTo(10, -15); c.lineTo(10.5, -11); c.fill();
      c.strokeStyle = '#e09a4c'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(-6, -7); c.quadraticCurveTo(-11, -10 + Math.sin(this.t / 400) * 2, -9, -15); c.stroke();
      c.restore();
    }

    frame(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.t = now;
      if (this.status === 'done' && this.prevStatus !== 'done') this.doneAt = Date.now();
      this.prevStatus = this.status;
      this.step(dt, now);

      const c = this.ctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, this.canvas.width, this.canvas.height);
      c.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, this.dpr * this.ox, this.dpr * this.oy);
      this.floor();
      this.walls();
      const items = this.furniture();
      let head = null;
      items.push({ depth: this.agent.x + this.agent.y + 0.01, draw: () => { head = this.person(); } });
      items.push({ depth: this.cat.x + this.cat.y, draw: () => this.drawCat() });
      items.sort((a, b) => a.depth - b.depth);
      for (const it of items) it.draw();
      if (head) this.overlay(head);
      requestAnimationFrame((t) => this.frame(t));
    }
  }

  window.Office = Office;
})();
