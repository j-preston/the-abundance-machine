// Five ending sequences + the epilogue. The epilogue IS the outro:
// pull-up from the grid, launch loops, a Dyson swarm assembling one panel
// per game-month survived, stats rolling like credits.
import { sizeCanvas, showMenu } from '../main.js';
import { meanBrier } from '../sim/forecasts.js';
import { skyColor } from './grid.js';
import { audio } from '../audio/score.js';

let ending = null; // {type, t0, cardShown, skipTo}

const INK = '#1B2A41', PAPER = '#EDF2F4', SUN = '#F2B705', CAP = '#E4572E', ASSUR = '#17A398';

export function startEnding(app, data) {
  const type = app.state.ending.type;
  ending = { type, t0: performance.now(), cardShown: false, skip: false };
  const overlay = document.getElementById('overlay');
  overlay.classList.add('visible');
  document.getElementById('overlay-ui').innerHTML = '';
  audio.ending(type);
  const canvas = document.getElementById('overlay-canvas');
  canvas.onclick = () => { if (ending && !ending.cardShown) ending.skip = true; };
}

export function disposeEnding() {
  ending = null;
  const canvas = document.getElementById('overlay-canvas');
  if (canvas) canvas.onclick = null;
}

export function drawEnding(app, data, now) {
  if (!ending) return;
  let e = (now - ending.t0) / 1000;
  const durations = { gold: 40, risingTide: 40, cascade: 18, silentRace: 14, pulledPlug: 12 };
  const D = durations[ending.type] ?? 14;
  if (ending.skip) e = Math.max(e, D - 0.01);

  const canvas = document.getElementById('overlay-canvas');
  const ctx = sizeCanvas(canvas);
  const { width: w, height: h } = canvas.getBoundingClientRect();

  if (ending.type === 'gold' || ending.type === 'risingTide') drawEpilogue(ctx, w, h, e, app, data);
  else if (ending.type === 'cascade') drawCascade(ctx, w, h, e, app, data);
  else if (ending.type === 'silentRace') drawSilentRace(ctx, w, h, e, app, data);
  else drawPulledPlug(ctx, w, h, e, app, data);

  if (e >= D && !ending.cardShown) {
    ending.cardShown = true;
    showEndCard(app, data);
  }
}

// -------------------------------------------------------------- epilogue --
function drawEpilogue(ctx, w, h, e, app, data) {
  const st = app.state;
  // Sky: full noon, brightening to space as we pull up.
  const up = smooth(clamp(e / 8)); // 0..1 pull-up
  const sky = skyColor(120);
  ctx.fillStyle = `rgb(${lerp(sky[0], 16, up)},${lerp(sky[1], 26, up)},${lerp(sky[2], 48, up)})`;
  ctx.fillRect(0, 0, w, h);

  // Stars fade in.
  if (up > 0.5) {
    ctx.fillStyle = `rgba(237,242,244,${(up - 0.5) * 1.2})`;
    for (let i = 0; i < 90; i++) {
      const x = (i * 137.5) % w, y = (i * 89.7) % (h * 0.8);
      ctx.fillRect(x, y, 1.2, 1.2);
    }
  }

  // The planet: rises from the bottom as the camera pulls away.
  const pr = lerp(h * 3.2, h * 0.62, smooth(clamp(e / 10)));
  const pcx = w * 0.5, pcy = h * 1.02 + pr * 0.0 + (h * 0.55) * (1 - clamp(e / 10)) + pr;
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(pcx, pcy, pr, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(27,42,65,0.65)';
  ctx.fill();
  // Coastline detail — same 2px ink register.
  ctx.save();
  ctx.beginPath(); ctx.arc(pcx, pcy, pr, 0, Math.PI * 2); ctx.clip();
  ctx.strokeStyle = 'rgba(237,242,244,0.4)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    for (let a = 0; a <= 1; a += 0.05) {
      const ang = -Math.PI / 2 + (a - 0.5) * 1.6 + i * 0.7;
      const rr = pr * (0.72 + 0.1 * Math.sin(a * 9 + i * 3));
      const x = pcx + Math.cos(ang) * rr, y = pcy + Math.sin(ang) * rr;
      a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Your grid: a gold spark on the surface.
  const gx = pcx + Math.cos(-Math.PI / 2 + 0.25) * pr * 0.99;
  const gy = pcy + Math.sin(-Math.PI / 2 + 0.25) * pr * 0.99;
  ctx.fillStyle = SUN;
  ctx.fillRect(gx - 2, gy - 2, 4, 4);
  ctx.restore();

  // Launch loops: arcs leaving the surface (6s+).
  if (e > 5) {
    const ln = Math.min(5, Math.floor((e - 5) / 1.6));
    for (let i = 0; i <= ln; i++) {
      const baseA = -Math.PI / 2 + (i - 2) * 0.28;
      const bx = pcx + Math.cos(baseA) * pr, by = pcy + Math.sin(baseA) * pr;
      const tipR = pr * (1.5 + 0.15 * i);
      const tx = pcx + Math.cos(baseA - 0.35) * tipR, ty = pcy + Math.sin(baseA - 0.35) * tipR;
      ctx.strokeStyle = 'rgba(242,183,5,0.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(pcx + Math.cos(baseA) * pr * 1.4, pcy + Math.sin(baseA) * pr * 1.4, tx, ty);
      ctx.stroke();
      const p = ((e * 0.5 + i * 0.3) % 1);
      const px = qbez(bx, pcx + Math.cos(baseA) * pr * 1.4, tx, p);
      const py = qbez(by, pcy + Math.sin(baseA) * pr * 1.4, ty, p);
      ctx.fillStyle = SUN;
      ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  // The Dyson swarm: one panel per game-month survived, snapping to the beat.
  if (e > 10) {
    const scx = w * 0.5, scy = h * 0.30;
    const sunR = 26;
    ctx.fillStyle = SUN;
    ctx.beginPath(); ctx.arc(scx, scy, sunR, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();

    const total = Math.max(24, app.state.ending.month);
    const beat = audio.beatCount ? audio.beatCount() : Math.floor((e - 10) / 0.3);
    const placed = Math.min(total, Math.max(0, ending._beat0 == null ? 0 : beat - ending._beat0));
    if (ending._beat0 == null) ending._beat0 = beat;
    for (let i = 0; i < placed; i++) {
      const ring = Math.floor(i / 36);
      const a = (i % 36) / 36 * Math.PI * 2 + ring * 0.35 - Math.PI / 2;
      const rr = sunR + 18 + ring * 13;
      const x = scx + Math.cos(a) * rr, y = scy + Math.sin(a) * rr * 0.72;
      const snap = i === placed - 1 ? 1.6 : 1; // the newest panel lands big
      ctx.save();
      ctx.translate(x, y); ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = SUN;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.8;
      ctx.fillRect(-3.4 * snap, -2.2 * snap, 6.8 * snap, 4.4 * snap);
      ctx.strokeRect(-3.4 * snap, -2.2 * snap, 6.8 * snap, 4.4 * snap);
      ctx.restore();
    }
  }

  // Stats roll — Plex Mono credits.
  if (e > 14) {
    const lines = statLines(app, data);
    ctx.font = '13px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    const speed = 26; // px/s
    const y0 = h + 20 - (e - 14) * speed;
    for (let i = 0; i < lines.length; i++) {
      const y = y0 + i * 30;
      if (y < -20 || y > h + 20) continue;
      ctx.fillStyle = 'rgba(237,242,244,0.9)';
      ctx.fillText(lines[i][0], w * 0.09, y);
      ctx.fillStyle = SUN;
      ctx.textAlign = 'right';
      ctx.fillText(lines[i][1], w * 0.4, y);
      ctx.textAlign = 'left';
    }
  }
}

function statLines(app, data) {
  const st = app.state;
  const s = data.strings.endings;
  const brier = meanBrier(st);
  const months = st.ending.month;
  const defl = Math.round((1 - st.deflation) * 100);
  return [
    [s.statsHeader, ''],
    ['months to threshold', String(months)],
    ['final capability', Math.round(st.capability).toLocaleString('en-US')],
    ['final assurance', Math.round(st.assurance).toLocaleString('en-US')],
    ['coordination', String(Math.round(st.coordination))],
    ['trust', String(Math.round(st.trust))],
    ['incidents', String(st.incidentCount.minor + st.incidentCount.major)],
    ['gates forced', String(st.forcedCount)],
    ['peak grid draw', `${Math.round(st.stats.peakMW).toLocaleString('en-US')} MW`],
    ['buildings', String(st.buildings.length)],
    ['forecasts answered', String(st.stats.forecastsAnswered)],
    ['your Brier', brier != null ? brier.toFixed(2) + (brier <= 0.15 ? ' — superforecaster' : '') : '—'],
    ['cost of intelligence', `−${defl}% and falling`],
    ['', ''],
    [s.creditLine1, ''],
    [s.creditLine2, ''],
  ];
}

// --------------------------------------------------------------- cascade --
function drawCascade(ctx, w, h, e, app, data) {
  // The sky doesn't darken. It whites out — overexposed.
  const sky = skyColor(app.state.t);
  ctx.fillStyle = `rgb(${sky[0]},${sky[1]},${sky[2]})`;
  ctx.fillRect(0, 0, w, h);

  // The Ledger, big: the red curve bends away from your control.
  const H = app.state.history;
  const n = H.months.length;
  const xOf = (i) => w * 0.1 + (i / Math.max(1, n + 30)) * w * 0.8;
  const yOfLog = (v) => h * 0.85 - (Math.log10(Math.max(1, v)) / 5.5) * h * 0.62;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = ASSUR;
  ctx.beginPath();
  for (let i = 0; i < n; i++) ctx.lineTo(xOf(i), yOfLog(H.a[i]));
  ctx.stroke();
  ctx.strokeStyle = CAP;
  ctx.beginPath();
  for (let i = 0; i < n; i++) ctx.lineTo(xOf(i), yOfLog(H.c[i]));
  // The bend: past "now" the curve accelerates beyond the chart's discipline.
  const bendSteps = Math.floor(clamp(e / 6) * 30);
  let lv = H.c[n - 1] ?? 100;
  for (let i = 0; i < bendSteps; i++) {
    lv *= 1.35 + i * 0.03;
    ctx.lineTo(xOf(n + i), yOfLog(lv));
  }
  ctx.stroke();

  ctx.font = '12px "IBM Plex Mono", monospace';
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.fillText('assurance', w * 0.12, yOfLog(H.a[n - 1] ?? 1) - 8);
  ctx.fillText('capability — no longer yours', w * 0.12, yOfLog(H.c[n - 1] ?? 1) - 8);

  // Whiteout.
  const white = smooth(clamp((e - 6) / 9));
  ctx.fillStyle = `rgba(255,255,255,${white * 0.96})`;
  ctx.fillRect(0, 0, w, h);
}

// ------------------------------------------------------------ silentRace --
function drawSilentRace(ctx, w, h, e, app, data) {
  ctx.fillStyle = '#2A3444';
  ctx.fillRect(0, 0, w, h);
  const H = app.state.history;
  const n = H.months.length;
  const xOf = (i) => w * 0.1 + (i / Math.max(1, n)) * w * 0.8;
  const yOfLog = (v) => h * 0.82 - (Math.log10(Math.max(1, v)) / 5.5) * h * 0.6;
  // The threshold line.
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = SUN; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(w * 0.08, yOfLog(72900)); ctx.lineTo(w * 0.92, yOfLog(72900)); ctx.stroke();
  ctx.setLineDash([]);
  // Your curves, dimmed.
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = CAP; ctx.lineWidth = 2;
  ctx.beginPath(); for (let i = 0; i < n; i++) ctx.lineTo(xOf(i), yOfLog(H.c[i])); ctx.stroke();
  ctx.strokeStyle = ASSUR;
  ctx.beginPath(); for (let i = 0; i < n; i++) ctx.lineTo(xOf(i), yOfLog(H.a[i])); ctx.stroke();
  ctx.globalAlpha = 1;
  // The rival that crossed, sharp and pale, punching through the line.
  const reveal = clamp(e / 4);
  for (let ri = 0; ri < H.rivals.length; ri++) {
    ctx.strokeStyle = `rgba(237,242,244,${0.35 + 0.5 * reveal})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const m = Math.floor(n * (0.7 + 0.3 * reveal));
    for (let i = 0; i < m; i++) ctx.lineTo(xOf(i), yOfLog(H.rivals[ri][i] ?? 1));
    ctx.stroke();
  }
  ctx.font = '12px "IBM Plex Mono", monospace';
  ctx.fillStyle = 'rgba(237,242,244,0.8)';
  ctx.textAlign = 'center';
  const who = app.state.ending.rival ?? 'a rival';
  if (e > 3) ctx.fillText(`${who} crossed first. Nobody audited it.`, w / 2, yOfLog(72900) - 14);
}

// ------------------------------------------------------------ pulledPlug --
function drawPulledPlug(ctx, w, h, e, app, data) {
  // The sky simply stops changing; then the lights go out, newest first.
  const sky = skyColor(app.state.t);
  const grey = clamp(e / 8);
  const g = [lerp(sky[0], 90, grey), lerp(sky[1], 95, grey), lerp(sky[2], 100, grey)];
  ctx.fillStyle = `rgb(${g[0] | 0},${g[1] | 0},${g[2] | 0})`;
  ctx.fillRect(0, 0, w, h);

  const st = app.state;
  const bs = [...st.buildings].sort((a, b) => b.id - a.id);
  const dead = Math.floor(clamp(e / 7) * bs.length);
  ctx.font = '15px system-ui';
  ctx.textAlign = 'center';
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i];
    const off = i < dead;
    ctx.globalAlpha = off ? 0.18 : 0.9;
    ctx.fillStyle = INK;
    ctx.fillText(data.balance.buildings[b.type].glyph, b.x * (w / 900), 120 + (b.y % (h - 200)));
  }
  ctx.globalAlpha = 1;
  if (e > 4) {
    ctx.font = '13px "IBM Plex Mono", monospace';
    ctx.fillStyle = 'rgba(27,42,65,0.85)';
    ctx.fillText('COMPUTE ALLOCATION REVOKED — EXECUTIVE ORDER 2031-14', w / 2, h * 0.12);
  }
}

// -------------------------------------------------------------- end card --
function showEndCard(app, data) {
  const st = app.state;
  const s = data.strings.endings;
  const spec = s[st.ending.type];
  const ui = document.getElementById('overlay-ui');
  const isWin = st.ending.type === 'gold' || st.ending.type === 'risingTide';
  const brier = meanBrier(st);
  ui.innerHTML = `
    <h1 style="color:${isWin ? 'var(--sun)' : 'var(--paper)'}">${spec.title}</h1>
    <div class="subtitle">${spec.sub}</div>
    <div class="subtitle" style="opacity:0.7;font-size:13px">${spec.flavor}</div>
    <div class="stats-roll">
      <div class="row"><span class="k">ending</span><span>${st.ending.type} · month ${st.ending.month}</span></div>
      <div class="row"><span class="k">tier reached</span><span>${st.tier} / 7</span></div>
      <div class="row"><span class="k">incidents · forced gates</span><span>${st.incidentCount.minor + st.incidentCount.major} · ${st.forcedCount}</span></div>
      <div class="row"><span class="k">coordination · trust</span><span>${Math.round(st.coordination)} · ${Math.round(st.trust)}</span></div>
      <div class="row"><span class="k">Brier</span><span>${brier != null ? brier.toFixed(2) : '—'}</span></div>
      <div class="row"><span class="k">seed</span><span>${st.seed} · ${st.difficulty}</span></div>
    </div>
    <div style="display:flex;gap:10px">
      <button class="menu-btn primary" id="btn-again">${s.playAgain}</button>
      <button class="menu-btn" id="btn-menu">${s.toMenu}</button>
    </div>
  `;
  document.getElementById('btn-again').addEventListener('click', () => showMenu());
  document.getElementById('btn-menu').addEventListener('click', () => showMenu());
}

// ------------------------------------------------------------------ util --
function clamp(v) { return Math.max(0, Math.min(1, v)); }
function smooth(t) { return t * t * (3 - 2 * t); }
function lerp(a, b, t) { return a + (b - a) * t; }
function qbez(a, b, c, t) { return (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c; }
