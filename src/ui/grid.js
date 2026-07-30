// The Grid — node-and-link schematic under a daylight sky.
// All animation here is UI-time driven; sim RNG is never touched.
//
// `paintShape` is the single source of truth for what a building looks like —
// the build palette paints its icons with the same code, so the icon you click
// is exactly the object that appears on the grid.
import { sizeCanvas } from '../main.js';
import { buyBuilding, canPlace, isPowerType } from '../sim/economy.js';
import { buildingCost } from '../state.js';

let canvas, hover = null, linkCache = { key: '', links: [] };

const INK = '#1B2A41', PAPER = '#EDF2F4', SUN = '#F2B705', CAP = '#E4572E', ASSUR = '#17A398', DANGER = '#C1292E';

export function initGrid(app, data) {
  canvas = document.getElementById('grid-canvas');

  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    hover = { x: e.clientX - r.left, y: e.clientY - r.top };
  });
  canvas.addEventListener('pointerleave', () => { hover = null; });

  canvas.addEventListener('pointerdown', (e) => {
    if (app.mode !== 'run' || app.demo) return;
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
    const hit = pick(st, data, x, y);
    app.selectedBuilding = hit ? hit.id : null;
  });
}

/** Topmost building under a point, or null. */
function pick(st, data, x, y) {
  let best = null, bestD = 1e9;
  for (const b of st.buildings) {
    const def = data.balance.buildings[b.type];
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < def.radius * 0.55 + 8 && d < bestD) { best = b; bestD = d; }
  }
  return best;
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
const SKY_DAWN = [0x5C, 0x6F, 0x91], SKY_GOLD = [0xE6, 0xBE, 0x8A], SKY_NOON = [0x8F, 0xC1, 0xE3];
function rgb(c, a = 1) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }

export function skyColor(month) {
  const p = Math.max(0, Math.min(1, month / 108));
  return p < 0.32
    ? lerpColor(SKY_DAWN, SKY_GOLD, p / 0.32)
    : lerpColor(SKY_GOLD, SKY_NOON, (p - 0.32) / 0.68);
}

function drawSky(ctx, w, h, st, uiTime) {
  const c = skyColor(st.t);
  // Value climbs with the run: pre-dawn reads heavy, noon reads open and bright.
  const p = Math.max(0, Math.min(1, st.t / 108));
  const top = lerpColor(c, [255, 255, 255], 0.30 + 0.30 * p);
  const bottom = lerpColor(c, [255, 255, 255], 0.10 + 0.22 * p);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgb(top));
  g.addColorStop(0.62, rgb(lerpColor(top, bottom, 0.7)));
  g.addColorStop(1, rgb(bottom));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // The sun climbs with the run.
  const sx = w * (0.12 + 0.76 * p);
  const sy = h * (0.34 - 0.22 * Math.sin(p * Math.PI)) + h * 0.06;
  ctx.fillStyle = SUN;
  ctx.beginPath(); ctx.arc(sx, sy, 15, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(242,183,5,0.45)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + uiTime * 0.05;
    ctx.beginPath();
    ctx.moveTo(sx + Math.cos(a) * 20, sy + Math.sin(a) * 20);
    ctx.lineTo(sx + Math.cos(a) * 25, sy + Math.sin(a) * 25);
    ctx.stroke();
  }

  // Graph-paper dots — the schematic register.
  ctx.fillStyle = 'rgba(27,42,65,0.11)';
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
  power: { color: SUN, width: 1.1 },
  chips: { color: INK, width: 0.9 },
  data: { color: 'rgba(27,42,65,0.55)', width: 0.75 },
  capability: { color: CAP, width: 1 },
  assurance: { color: ASSUR, width: 1 },
};

function drawLinks(ctx, st, balance, uiTime, reduced, focusId) {
  const links = computeLinks(st, balance);
  for (let i = 0; i < links.length; i++) {
    const L = links[i];
    const s = LINK_STYLE[L.kind];
    let alpha = 1;
    if (L.kind === 'capability') alpha = 0.25 + 0.75 * st.alloc.c;
    if (L.kind === 'assurance') alpha = 0.25 + 0.75 * st.alloc.a;
    if (!L.b.powered) alpha *= 0.25;
    // Focus: a hovered or selected building lights up its own routing and
    // pushes everything else back, so dense factories stay readable.
    const focused = focusId != null && (L.a.id === focusId || L.b.id === focusId);
    if (focusId != null) alpha *= focused ? 1 : 0.18;

    ctx.globalAlpha = 0.45 * alpha;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = focused ? s.width * 2 : s.width;
    ctx.beginPath(); ctx.moveTo(L.a.x, L.a.y); ctx.lineTo(L.b.x, L.b.y); ctx.stroke();

    // Pulses — the one permitted glow.
    if (!reduced && L.b.powered && !st.paused) {
      const phase = ((uiTime * 0.4 * st.speed + i * 0.37) % 1);
      const px = lerp(L.a.x, L.b.x, phase), py = lerp(L.a.y, L.b.y, phase);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.arc(px, py, focused ? 2.4 : 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------- building shapes --
/**
 * Paint one building's vector shape centred on the current origin.
 * Shared by the grid and the build palette so icons and objects never drift.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} type building key
 * @param {number} r visual radius in px
 * @param {{t?:number, fill?:number, tilt?:number, active?:boolean}} [o]
 */
export function paintShape(ctx, type, r, o = {}) {
  const t = o.t ?? 0;
  const active = o.active !== false;
  const fill = o.fill ?? 0;
  ctx.lineWidth = Math.max(1.2, r * 0.17);
  ctx.strokeStyle = INK;
  ctx.fillStyle = PAPER;
  ctx.lineJoin = 'round';

  switch (type) {
    case 'solar': {
      // Panels tilt to follow the sky-time.
      const tilt = o.tilt ?? -0.18;
      for (let i = -1; i <= 1; i++) {
        ctx.save(); ctx.translate(i * r * 0.8, 0); ctx.rotate(tilt);
        ctx.beginPath(); ctx.rect(-r * 0.3, -r * 0.52, r * 0.6, r * 1.04);
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'gas': {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r * 0.94, -Math.PI / 2, 0); ctx.closePath();
      ctx.fillStyle = INK; ctx.fill();
      break;
    }
    case 'fission': {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
      break;
    }
    case 'fusion': {
      ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = SUN; ctx.fill(); ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + t * 0.3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.98, Math.sin(a) * r * 0.98);
        ctx.lineTo(Math.cos(a) * r * 1.32, Math.sin(a) * r * 1.32);
        ctx.stroke();
      }
      break;
    }
    case 'fab': {
      ctx.beginPath(); ctx.rect(-r * 0.92, -r * 0.92, r * 1.84, r * 1.84);
      ctx.fill(); ctx.stroke();
      // The gate blinks while wafers are moving.
      const blink = active && Math.sin(t * 6) > 0;
      ctx.fillStyle = blink ? SUN : INK;
      ctx.fillRect(-r * 0.24, r * 0.28, r * 0.48, r * 0.64);
      break;
    }
    case 'datacenter': {
      const breathe = active ? 1 + 0.03 * Math.sin(t * 2 + (o.seed ?? 0)) : 1;
      hexPath(ctx, r * breathe); ctx.fill(); ctx.stroke();
      // Three rack bays that fill as chips get installed — a gauge you can
      // read at a glance across a hundred datacenters.
      const bw = r * 0.98, bh = r * 0.23, gap = r * 0.14;
      const top = -(bh * 3 + gap * 2) / 2;
      const f = Math.max(0, Math.min(1, fill));
      ctx.lineWidth = Math.max(0.7, r * 0.08);
      for (let i = 0; i < 3; i++) {
        const share = Math.max(0, Math.min(1, f * 3 - i)); // bays fill bottom-up
        const y = top + (2 - i) * (bh + gap);
        ctx.strokeStyle = 'rgba(27,42,65,0.45)';
        ctx.strokeRect(-bw / 2, y, bw, bh);
        if (share > 0) {
          ctx.fillStyle = INK;
          ctx.fillRect(-bw / 2, y, bw * share, bh);
        }
      }
      break;
    }
    case 'refinery': {
      ctx.beginPath(); ctx.rect(-r * 0.95, -r * 0.75, r * 1.9, r * 1.5);
      ctx.fill(); ctx.stroke();
      ctx.lineWidth = Math.max(0.8, r * 0.1);
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.62, i * r * 0.38); ctx.lineTo(r * 0.62, i * r * 0.38);
        ctx.stroke();
      }
      break;
    }
    case 'lab': {
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.08); ctx.lineTo(r * 0.95, r * 0.78); ctx.lineTo(-r * 0.95, r * 0.78);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = CAP;
      ctx.beginPath(); ctx.arc(0, r * 0.24, r * 0.24, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'office':
    case 'wing': {
      ctx.save();
      if (active) ctx.rotate(t * 0.25);
      pentPath(ctx, r); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = ASSUR;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2); ctx.fill();
      if (type === 'wing') {
        // The bootstrap: oversight that scales. Marked with a teal plus.
        ctx.strokeStyle = ASSUR;
        ctx.lineWidth = Math.max(1.2, r * 0.16);
        ctx.beginPath(); ctx.moveTo(r * 0.95, -r * 1.2); ctx.lineTo(r * 0.95, -r * 0.6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(r * 0.65, -r * 0.9); ctx.lineTo(r * 1.25, -r * 0.9); ctx.stroke();
      }
      break;
    }
    case 'robotics': {
      ctx.beginPath(); ctx.rect(-r * 0.95, -r * 0.5, r * 1.45, r * 1.45);
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.rect(-r * 0.5, -r * 0.95, r * 1.45, r * 1.45);
      ctx.fill(); ctx.stroke();
      break;
    }
    case 'policy': {
      starPath(ctx, r, 4); ctx.fillStyle = SUN; ctx.fill(); ctx.stroke();
      break;
    }
  }
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

function drawBuilding(ctx, st, b, def, uiTime, reduced, selected, hovered, showLabel) {
  const r = def.radius * 0.42;
  const t = reduced ? 0 : uiTime;
  const offline = st.month < b.offlineUntil;
  const idle = b.done && !b.powered && !offline;

  ctx.save();
  ctx.translate(b.x, b.y);

  // Land footprint is a placement concern, so it only shows when you're
  // thinking about placement — on hover or selection, not as permanent clutter.
  if (def.radius >= 34 && (hovered || selected)) {
    ctx.strokeStyle = 'rgba(27,42,65,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.arc(0, 0, def.radius * 0.6, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }

  if (!b.done) ctx.globalAlpha = 0.5;
  else if (idle || offline) ctx.globalAlpha = 0.42;

  paintShape(ctx, b.type, r, {
    t,
    active: b.done && b.powered && !offline,
    fill: def.chipSlots ? b.chips / def.chipSlots : 0,
    tilt: Math.sin(Math.min(1, st.t / 108) * Math.PI) * 0.35 - 0.18,
    seed: b.id,
  });
  ctx.globalAlpha = 1;

  // Construction progress ring.
  if (!b.done) {
    ctx.strokeStyle = SUN;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, r + 6, -Math.PI / 2, -Math.PI / 2 + (b.progress / b.buildTime) * Math.PI * 2);
    ctx.stroke();
  }
  // Idle for want of power — the brownout tell.
  if (idle) {
    ctx.strokeStyle = DANGER; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, r + 5, 0, Math.PI * 2); ctx.setLineDash([2, 3]); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (offline) {
    ctx.strokeStyle = DANGER; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-r * 0.8, -r * 0.8); ctx.lineTo(r * 0.8, r * 0.8);
    ctx.moveTo(r * 0.8, -r * 0.8); ctx.lineTo(-r * 0.8, r * 0.8);
    ctx.stroke();
  }
  if (selected || hovered) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = selected ? 1.5 : 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(0, 0, r + 9, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  // Self-teaching labels while the factory is still small.
  if (showLabel) {
    ctx.font = '7.5px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(27,42,65,0.62)';
    ctx.fillText(def.short ?? def.name, 0, r + 15);
  }
  ctx.restore();
}

// -------------------------------------------------------------- tooltip --
function tooltipFor(st, b, def, balance) {
  const lines = [];
  const offline = st.month < b.offlineUntil;
  if (!b.done) lines.push(`building — ${Math.round((b.progress / b.buildTime) * 100)}%`);
  else if (offline) lines.push('offline — incident review');
  else if (!b.powered) lines.push('idle — not enough power');
  else lines.push('active');
  if (def.powerOut) lines.push(`+${def.powerOut} MW`);
  if (def.draw) lines.push(`draws ${def.draw} MW`);
  if (def.chipSlots) lines.push(`${Math.floor(b.chips)}/${def.chipSlots} chips · ${(b.chips / balance.economy.chipsPerPF).toFixed(1)} PF`);
  if (def.chipsPerMo) lines.push(`${def.chipsPerMo} chips/mo`);
  if (def.dataPerMo) lines.push(`${def.dataPerMo} data/mo`);
  if (b.type === 'lab') lines.push('compute + data → capability');
  if (b.type === 'office') lines.push(`${balance.assurance.officeRate + st.officeRateAdd} A/mo — linear`);
  if (b.type === 'wing') lines.push('A/mo = 4×√(PF on assurance)');
  return { title: def.name.toUpperCase(), lines };
}

function drawTooltip(ctx, w, h, x, y, title, lines) {
  ctx.font = '600 10.5px Archivo, system-ui, sans-serif';
  let width = ctx.measureText(title).width;
  ctx.font = '10px "IBM Plex Mono", monospace';
  for (const l of lines) width = Math.max(width, ctx.measureText(l).width);
  const padX = 8, padY = 6, lh = 13;
  const bw = width + padX * 2;
  const bh = padY * 2 + 14 + lines.length * lh;
  let bx = x + 16, by = y - bh / 2;
  if (bx + bw > w - 6) bx = x - 16 - bw;
  by = Math.max(6, Math.min(h - bh - 6, by));

  ctx.fillStyle = 'rgba(237,242,244,0.97)';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.fill(); ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = '600 10.5px Archivo, system-ui, sans-serif';
  ctx.fillText(title, bx + padX, by + padY + 10);
  ctx.font = '10px "IBM Plex Mono", monospace';
  ctx.fillStyle = 'rgba(27,42,65,0.7)';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], bx + padX, by + padY + 24 + i * lh);
  }
}

// ----------------------------------------------------------------- draw --
export function drawGrid(app, data) {
  const st = app.state;
  if (!st) return;
  const ctx = sizeCanvas(canvas);
  const { width: w, height: h } = canvas.getBoundingClientRect();
  const reduced = app.reducedMotion;

  drawSky(ctx, w, h, st, app.uiTime);

  const hoveredB = hover && !app.selectedBuild && !app.demo ? pick(st, data, hover.x, hover.y) : null;
  const focusId = hoveredB ? hoveredB.id : app.selectedBuilding;
  drawLinks(ctx, st, data.balance, app.uiTime, reduced, focusId);

  // Labels teach the first minutes, then get out of the way.
  const showLabels = st.buildings.length <= 26;
  for (const b of st.buildings) {
    const def = data.balance.buildings[b.type];
    drawBuilding(ctx, st, b, def, app.uiTime, reduced,
      b.id === app.selectedBuilding, hoveredB && b.id === hoveredB.id,
      showLabels || (hoveredB && b.id === hoveredB.id));
  }

  if (hoveredB) {
    const def = data.balance.buildings[hoveredB.type];
    const { title, lines } = tooltipFor(st, hoveredB, def, data.balance);
    drawTooltip(ctx, w, h, hoveredB.x, hoveredB.y, title, lines);
  }

  // Placement ghost.
  if (app.selectedBuild && hover) {
    const type = app.selectedBuild;
    const def = data.balance.buildings[type];
    const ok = placementValid(st, data, type, hover.x, hover.y, w, h);
    ctx.save();
    ctx.translate(hover.x, hover.y);
    ctx.globalAlpha = ok ? 0.75 : 0.4;
    paintShape(ctx, type, def.radius * 0.42, { t: 0, active: false, fill: 0, tilt: -0.18 });
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ok ? INK : DANGER;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, def.radius * 0.62, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.fillStyle = ok ? INK : DANGER;
    ctx.textAlign = 'center';
    ctx.fillText(`$${buildingCost(st, data.balance, type).toFixed(1)}B`, 0, def.radius * 0.62 + 14);
    ctx.restore();
  }
}
