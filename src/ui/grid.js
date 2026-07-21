// The Grid — node-and-link schematic under a daylight sky.
// All animation here is UI-time driven; sim RNG is never touched.
import { sizeCanvas } from '../main.js';
import { buyBuilding, canPlace, isPowerType } from '../sim/economy.js';
import { buildingCost } from '../state.js';

let canvas, hover = null, linkCache = { key: '', links: [] };

export function initGrid(app, data) {
  canvas = document.getElementById('grid-canvas');

  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    hover = { x: e.clientX - r.left, y: e.clientY - r.top };
  });
  canvas.addEventListener('pointerleave', () => { hover = null; });

  canvas.addEventListener('pointerdown', (e) => {
    if (app.mode !== 'run') return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const st = app.state;

    if (app.selectedBuild) {
      const type = app.selectedBuild;
      if (placementValid(st, data, type, x, y, r.width, r.height)) {
        const bld = buyBuilding(st, data.balance, type, Math.round(x), Math.round(y));
        if (bld && !e.shiftKey) app.selectedBuild = null;
        if (bld) app.selectedBuilding = null;
      }
      return;
    }
    // Select an existing building.
    let best = null, bestD = 1e9;
    for (const b of st.buildings) {
      const def = data.balance.buildings[b.type];
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < def.radius * 0.75 + 8 && d < bestD) { best = b; bestD = d; }
    }
    app.selectedBuilding = best ? best.id : null;
  });
}

function placementValid(st, data, type, x, y, w, h) {
  if (!canPlace(st, data.balance, type).ok) return false;
  const def = data.balance.buildings[type];
  const m = def.radius * 0.6;
  if (x < m || y < m || x > w - m || y > h - m) return false;
  for (const b of st.buildings) {
    const other = data.balance.buildings[b.type];
    if (Math.hypot(b.x - x, b.y - y) < (def.radius + other.radius) * 0.55) return false;
  }
  return true;
}

// ------------------------------------------------------------------ sky --
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpColor(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}
const SKY_DAWN = [0x5C, 0x6F, 0x91], SKY_GOLD = [0xB9, 0x9C, 0x74], SKY_NOON = [0x8F, 0xC1, 0xE3];
function rgb(c, a = 1) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }

export function skyColor(month) {
  const p = Math.max(0, Math.min(1, month / 108));
  return p < 0.45
    ? lerpColor(SKY_DAWN, SKY_GOLD, p / 0.45)
    : lerpColor(SKY_GOLD, SKY_NOON, (p - 0.45) / 0.55);
}

function drawSky(ctx, w, h, st, uiTime) {
  const c = skyColor(st.t);
  const top = lerpColor(c, [255, 255, 255], 0.3);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgb(top));
  g.addColorStop(1, rgb(c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // The sun climbs with the run.
  const p = Math.max(0, Math.min(1, st.t / 108));
  const sx = w * (0.12 + 0.76 * p);
  const sy = h * (0.34 - 0.22 * Math.sin(p * Math.PI)) + h * 0.06;
  ctx.fillStyle = '#F2B705';
  ctx.beginPath(); ctx.arc(sx, sy, 16, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(242,183,5,0.5)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + uiTime * 0.05;
    ctx.beginPath();
    ctx.moveTo(sx + Math.cos(a) * 21, sy + Math.sin(a) * 21);
    ctx.lineTo(sx + Math.cos(a) * 26, sy + Math.sin(a) * 26);
    ctx.stroke();
  }

  // Graph-paper dots — the schematic register.
  ctx.fillStyle = 'rgba(27,42,65,0.13)';
  for (let x = 20; x < w; x += 40) {
    for (let y = 20; y < h; y += 40) ctx.fillRect(x, y, 1.5, 1.5);
  }
}

// ---------------------------------------------------------------- links --
function computeLinks(st, balance) {
  const key = st.buildings.map((b) => `${b.id}${b.done ? 1 : 0}`).join(',');
  if (linkCache.key === key) return linkCache.links;
  const links = [];
  const done = st.buildings.filter((b) => b.done);
  const power = done.filter((b) => isPowerType(b.type));
  const dcs = done.filter((b) => b.type === 'datacenter');
  const labs = done.filter((b) => b.type === 'lab');
  const sinks = done.filter((b) => b.type === 'office' || b.type === 'wing');
  const nearest = (from, list) => {
    let best = null, bd = 1e9;
    for (const t of list) {
      const d = Math.hypot(t.x - from.x, t.y - from.y);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  };
  for (const b of done) {
    if (!isPowerType(b.type) && balance.buildings[b.type].draw > 0) {
      const p = nearest(b, power);
      if (p) links.push({ a: p, b, kind: 'power' });
    }
    if (b.type === 'fab') {
      const d = nearest(b, dcs);
      if (d) links.push({ a: b, b: d, kind: 'chips' });
    }
    if (b.type === 'refinery') {
      const l = nearest(b, labs);
      if (l) links.push({ a: b, b: l, kind: 'data' });
    }
    if (b.type === 'datacenter') {
      const l = nearest(b, labs);
      if (l) links.push({ a: b, b: l, kind: 'capability' });
      const s = nearest(b, sinks);
      if (s) links.push({ a: b, b: s, kind: 'assurance' });
    }
  }
  linkCache = { key, links };
  return links;
}

const LINK_STYLE = {
  power: { color: '#F2B705', width: 1 },
  chips: { color: '#1B2A41', width: 1 },
  data: { color: 'rgba(27,42,65,0.5)', width: 0.75 },
  capability: { color: '#E4572E', width: 1 },
  assurance: { color: '#17A398', width: 1 },
};

function drawLinks(ctx, st, balance, uiTime, reduced) {
  const links = computeLinks(st, balance);
  for (let i = 0; i < links.length; i++) {
    const L = links[i];
    const s = LINK_STYLE[L.kind];
    let alpha = 1;
    if (L.kind === 'capability') alpha = 0.25 + 0.75 * st.alloc.c;
    if (L.kind === 'assurance') alpha = 0.25 + 0.75 * st.alloc.a;
    if (!L.b.powered) alpha *= 0.25;
    ctx.globalAlpha = 0.5 * alpha;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.beginPath(); ctx.moveTo(L.a.x, L.a.y); ctx.lineTo(L.b.x, L.b.y); ctx.stroke();

    // Pulses — the one permitted glow.
    if (!reduced && L.b.powered && !st.paused) {
      const phase = ((uiTime * 0.4 * st.speed + i * 0.37) % 1);
      const px = lerp(L.a.x, L.b.x, phase), py = lerp(L.a.y, L.b.y, phase);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.arc(px, py, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------ buildings --
const INK = '#1B2A41', PAPER = '#EDF2F4';

function drawBuilding(ctx, st, b, def, uiTime, reduced, selected) {
  const r = def.radius * 0.42;
  const { x, y } = b;
  const t = reduced ? 0 : uiTime;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.fillStyle = PAPER;

  const offline = st.month < b.offlineUntil;
  if (!b.done) { ctx.setLineDash([4, 3]); ctx.globalAlpha = 0.75; }
  else if (!b.powered) ctx.globalAlpha = 0.45;

  switch (b.type) {
    case 'solar': {
      // Land-hungry array of panels tilting with the sky-time.
      const tilt = Math.sin(Math.min(1, st.t / 108) * Math.PI) * 0.35 - 0.18;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2); ctx.globalAlpha *= 0.35; ctx.stroke(); ctx.globalAlpha = b.done ? (b.powered ? 1 : 0.45) : 0.75;
      for (let i = -1; i <= 1; i++) {
        ctx.save(); ctx.translate(i * r * 0.85, 0); ctx.rotate(tilt);
        ctx.fillRect(-r * 0.33, -r * 0.55, r * 0.66, r * 1.1);
        ctx.strokeRect(-r * 0.33, -r * 0.55, r * 0.66, r * 1.1);
        ctx.restore();
      }
      break;
    }
    case 'gas': {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, -Math.PI / 2, 0); ctx.closePath();
      ctx.fillStyle = INK; ctx.fill();
      break;
    }
    case 'fission': {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
      break;
    }
    case 'fusion': {
      ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2); ctx.fillStyle = '#F2B705'; ctx.fill(); ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + t * 0.3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.lineTo(Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35);
        ctx.stroke();
      }
      break;
    }
    case 'fab': {
      ctx.fillRect(-r, -r, r * 2, r * 2); ctx.strokeRect(-r, -r, r * 2, r * 2);
      // Gate blinks when active.
      const blink = b.done && b.powered && Math.sin(t * 6) > 0;
      ctx.fillStyle = blink ? '#F2B705' : INK;
      ctx.fillRect(-r * 0.25, r * 0.35, r * 0.5, r * 0.6);
      break;
    }
    case 'datacenter': {
      const breathe = b.done && b.powered ? 1 + 0.03 * Math.sin(t * 2 + b.id) : 1;
      hexPath(ctx, r * breathe); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK;
      const slots = Math.round((b.chips / 24) * 3);
      for (let i = 0; i < slots; i++) ctx.fillRect(-r * 0.45 + i * r * 0.45, -r * 0.15, r * 0.3, r * 0.3);
      break;
    }
    case 'refinery': {
      ctx.fillRect(-r, -r * 0.8, r * 2, r * 1.6); ctx.strokeRect(-r, -r * 0.8, r * 2, r * 1.6);
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(-r * 0.7, i * r * 0.4); ctx.lineTo(r * 0.7, i * r * 0.4); ctx.stroke();
      }
      break;
    }
    case 'lab': {
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.15); ctx.lineTo(r, r * 0.85); ctx.lineTo(-r, r * 0.85); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#E4572E';
      ctx.beginPath(); ctx.arc(0, r * 0.2, r * 0.22, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'office': case 'wing': {
      const spin = b.done && b.powered ? t * 0.25 : 0;
      ctx.save(); ctx.rotate(spin);
      pentPath(ctx, r); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#17A398';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.24, 0, Math.PI * 2); ctx.fill();
      if (b.type === 'wing') {
        ctx.strokeStyle = '#17A398'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(r * 0.9, -r * 1.15); ctx.lineTo(r * 0.9, -r * 0.55); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(r * 0.6, -r * 0.85); ctx.lineTo(r * 1.2, -r * 0.85); ctx.stroke();
      }
      break;
    }
    case 'robotics': {
      ctx.strokeRect(-r, -r * 0.6, r * 1.4, r * 1.4);
      ctx.fillRect(-r * 0.4, -r, r * 1.4, r * 1.4); ctx.strokeRect(-r * 0.4, -r, r * 1.4, r * 1.4);
      break;
    }
    case 'policy': {
      starPath(ctx, r, 4); ctx.fillStyle = '#F2B705'; ctx.fill(); ctx.stroke();
      break;
    }
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // Construction progress arc.
  if (!b.done) {
    ctx.strokeStyle = '#F2B705';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, r + 6, -Math.PI / 2, -Math.PI / 2 + (b.progress / b.buildTime) * Math.PI * 2);
    ctx.stroke();
  }
  if (offline) {
    ctx.strokeStyle = '#C1292E'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-r * 0.8, -r * 0.8); ctx.lineTo(r * 0.8, r * 0.8);
    ctx.moveTo(r * 0.8, -r * 0.8); ctx.lineTo(-r * 0.8, r * 0.8);
    ctx.stroke();
  }
  if (selected) {
    ctx.strokeStyle = INK; ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(0, 0, r + 9, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function hexPath(ctx, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}
function pentPath(ctx, r) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}
function starPath(ctx, r, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.4;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}

// ----------------------------------------------------------------- draw --
export function drawGrid(app, data) {
  const st = app.state;
  if (!st) return;
  const ctx = sizeCanvas(canvas);
  const { width: w, height: h } = canvas.getBoundingClientRect();
  const reduced = app.reducedMotion;

  drawSky(ctx, w, h, st, app.uiTime);
  drawLinks(ctx, st, data.balance, app.uiTime, reduced);

  for (const b of st.buildings) {
    drawBuilding(ctx, st, b, data.balance.buildings[b.type], app.uiTime, reduced, b.id === app.selectedBuilding);
  }

  // Placement ghost.
  if (app.selectedBuild && hover) {
    const type = app.selectedBuild;
    const def = data.balance.buildings[type];
    const ok = placementValid(st, data, type, hover.x, hover.y, w, h);
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = ok ? INK : '#C1292E';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(hover.x, hover.y, def.radius * 0.6, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '16px system-ui';
    ctx.fillStyle = ok ? INK : '#C1292E';
    ctx.textAlign = 'center';
    ctx.fillText(def.glyph, hover.x, hover.y + 6);
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.fillText(`$${buildingCost(st, data.balance, type).toFixed(1)}B`, hover.x, hover.y + def.radius * 0.6 + 14);
    ctx.restore();
  }
}
