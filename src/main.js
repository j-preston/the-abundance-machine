// Boot, fixed-timestep loop, mode switch (menu / run / ending).
import { createState, dailySeed, saveState, loadState } from './state.js';
import { simTick, isBlocked } from './sim/sim.js';
import { initLedger, drawLedger } from './ui/ledger.js';
import { initGrid, drawGrid } from './ui/grid.js';
import { initPanels, updatePanels, showToasts } from './ui/panels.js';
import { startEnding, drawEnding, disposeEnding } from './ui/endings.js';
import { audio } from './audio/score.js';
import { strategies, estimate } from '../scripts/strategies.js';

const SAVE_KEY = 'abundance-machine-save-v1';
const TICK_MS = 250; // 250 ms sim tick = 1/28 game-month at 1×
// Demo mode replays the balanced playbook on a seed known to end gold
// (verified by the headless simulator; the demo mirrors its tick ordering).
const DEMO_SEED = 5;

/** @type {{balance:object, events:object, forecasts:object, strings:object}} */
let data = null;

const app = {
  mode: 'menu', // menu | run | ending
  state: null,
  data: null,
  acc: 0,
  lastFrame: 0,
  lastLedgerDraw: 0,
  lastSaveMonth: -1,
  endingStartedAt: 0,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  uiTime: 0, // seconds, for animations only — never touches sim RNG
  selectedBuild: null,
  selectedBuilding: null,
  difficulty: localStorage.getItem('abundance-difficulty') || 'bitterLesson',
  demo: false,
  userPaused: false,
  demoLastMonth: -1,
  demoDecideAt: 0,     // wall-clock ms for the next scripted card decision
  demoStaged: false,   // forecast slider has been moved, commit pending
  demoDelayMs: 1300,   // how long cards linger before the script decides
};
window.__abundance = app; // console debugging

async function loadData() {
  const [balance, events, forecasts, strings] = await Promise.all(
    ['balance', 'events', 'forecasts', 'strings'].map((f) =>
      fetch(`data/${f}.json`).then((r) => r.json())
    )
  );
  return { balance, events, forecasts, strings };
}

function monthLabel(t) {
  const m = Math.min(119, Math.floor(t));
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[m % 12]} ${data.balance.time.startYear + Math.floor(m / 12)}`;
}

function eraLabel(month) {
  return data.strings.eras[month < 36 ? 0 : month < 84 ? 1 : 2];
}

// ------------------------------------------------------------------ menu --
function showMenu() {
  app.mode = 'menu';
  app.demo = false;
  document.getElementById('app').classList.remove('demo-mode');
  setDemoBadge(false);
  disposeEnding();
  audio.stopRun();
  const overlay = document.getElementById('overlay');
  overlay.classList.add('visible');
  const s = data.strings;
  const saved = localStorage.getItem(SAVE_KEY);
  let resumable = null;
  if (saved) {
    try {
      const st = loadState(saved);
      if (!st.ending) resumable = st;
    } catch { /* corrupt save */ }
  }
  const ui = document.getElementById('overlay-ui');
  ui.innerHTML = `
    <h1>${s.title}</h1>
    <div class="subtitle">${s.subtitle}</div>
    <div class="diff-row" id="diff-row">
      ${Object.entries(s.menu.difficulties).map(([k, label]) =>
        `<button class="diff-btn ${k === app.difficulty ? 'active' : ''}" data-diff="${k}" title="${s.menu.difficultyHints[k]}">${label}</button>`).join('')}
    </div>
    ${resumable ? `<button class="menu-btn" id="btn-resume">${s.menu.resume}</button>` : ''}
    <button class="menu-btn primary" id="btn-daily">${s.menu.dailySeed}</button>
    <button class="menu-btn" id="btn-new">${s.menu.newRun}</button>
    <button class="menu-btn" id="btn-demo" title="${s.menu.demoHint}">${s.menu.demo}</button>
    <div class="seed-line" id="seed-line">daily seed ${dailySeed(new Date())}</div>
    <div class="how">${s.menu.how.map((p) => `<p>${p}</p>`).join('')}</div>
  `;
  ui.querySelectorAll('.diff-btn').forEach((b) =>
    b.addEventListener('click', () => {
      app.difficulty = b.dataset.diff;
      localStorage.setItem('abundance-difficulty', app.difficulty);
      ui.querySelectorAll('.diff-btn').forEach((x) => x.classList.toggle('active', x === b));
    })
  );
  document.getElementById('btn-daily').addEventListener('click', () => startRun(dailySeed(new Date())));
  document.getElementById('btn-new').addEventListener('click', () => startRun((Math.random() * 0xffffffff) >>> 0));
  document.getElementById('btn-demo').addEventListener('click', () => startDemo());
  if (resumable) document.getElementById('btn-resume').addEventListener('click', () => resumeRun(resumable));
  drawMenuBackdrop();
}

function drawMenuBackdrop() {
  const canvas = document.getElementById('overlay-canvas');
  const ctx = sizeCanvas(canvas);
  const { width: w, height: h } = canvas.getBoundingClientRect();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#16233A');
  g.addColorStop(1, '#2A3C5C');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // A faint pre-dawn ledger: two straight lines waiting to be drawn.
  ctx.strokeStyle = 'rgba(237,242,244,0.07)';
  ctx.lineWidth = 1;
  for (let y = 40; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(228,87,46,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(w * 0.1, h * 0.8); ctx.lineTo(w * 0.62, h * 0.28); ctx.stroke();
  ctx.strokeStyle = 'rgba(23,163,152,0.5)';
  ctx.beginPath(); ctx.moveTo(w * 0.1, h * 0.82); ctx.lineTo(w * 0.62, h * 0.55); ctx.stroke();
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = 'rgba(242,183,5,0.55)';
  ctx.beginPath(); ctx.moveTo(0, h * 0.22); ctx.lineTo(w, h * 0.22); ctx.stroke();
  ctx.setLineDash([]);
}

// ------------------------------------------------------------------- run --
function startRun(seed) {
  app.state = createState(data.balance, seed, app.difficulty);
  app.state.paused = false;
  beginRun();
}

function resumeRun(state) {
  app.state = state;
  app.state.paused = true;
  beginRun();
}

// The demo: the scripted balanced player runs the machine while you watch.
// Only the speed controls stay live; everything else is display.
function startDemo() {
  app.state = createState(data.balance, DEMO_SEED, 'bitterLesson');
  app.state.paused = false;
  app.demo = true;
  app.demoLastMonth = -1;
  app.demoDecideAt = 0;
  app.demoStaged = false;
  // Lay the scripted build-out onto the visible canvas.
  const r = document.getElementById('grid-canvas').getBoundingClientRect();
  const cols = Math.max(10, Math.floor((Math.max(600, r.width) - 130) / 62));
  const rows = Math.max(6, Math.ceil(150 / cols));
  const dy = Math.max(44, Math.min(78, Math.floor((Math.max(400, r.height) - 170) / rows)));
  app.state.layout = { x0: 76, y0: 116, dx: 62, dy, cols };
  beginRun();
}

function beginRun() {
  app.mode = 'run';
  app.selectedBuild = null;
  app.selectedBuilding = null;
  app.lastSaveMonth = app.state.month;
  document.getElementById('overlay').classList.remove('visible');
  document.getElementById('app').classList.toggle('demo-mode', app.demo);
  setDemoBadge(app.demo);
  audio.startRun();
  updateSpeedButtons();
  updatePanels(app, data, true);
}

function setDemoBadge(on) {
  let badge = document.getElementById('demo-badge');
  if (on && !badge) {
    badge = document.createElement('div');
    badge.id = 'demo-badge';
    badge.textContent = data.strings.menu.demoBadge;
    document.getElementById('grid-wrap').appendChild(badge);
  } else if (!on && badge) {
    badge.remove();
  }
}

function endRun() {
  app.mode = 'ending';
  app.endingStartedAt = performance.now();
  if (!app.demo) localStorage.removeItem(SAVE_KEY);
  startEnding(app, data);
}

/**
 * Demo decision pump — mirrors the headless driver in scripts/simulate.js
 * exactly (blocked cards first, then the monthly playbook), so the demo run
 * is the same trajectory the acceptance tests verified ends in victory.
 * Cards linger for a beat so the player can read what the script is deciding.
 */
function demoPump(now) {
  const st = app.state;
  const strategy = strategies.balanced;
  // The viewer's pause freezes the script's decisions too.
  if (app.userPaused) { app.demoDecideAt = 0; return; }
  if (isBlocked(st)) {
    if (st.ending) return;
    if (!app.demoDecideAt) {
      app.demoDecideAt = now + app.demoDelayMs;
      app.demoStaged = false;
    }
    // Move the forecast slider to the script's answer before committing.
    const card = st.forecasts.pendingCard;
    if (card && !app.demoStaged && now >= app.demoDecideAt - app.demoDelayMs * 0.4) {
      const slider = document.querySelector('.card.forecast .prob-slider');
      if (slider) {
        const p = Math.round(estimate(st, data.balance, card) * 100);
        slider.value = p;
        const readout = document.getElementById('prob-val');
        if (readout) readout.textContent = String(p);
      }
      app.demoStaged = true;
    }
    if (now >= app.demoDecideAt) {
      app.demoDecideAt = 0;
      if (st.review && st.review.mode === 'open') strategy.review(st, data);
      else if (st.forecasts.pendingCard) strategy.forecast(st, data);
      else if (st.pendingEvent) strategy.event(st, data);
    }
    return;
  }
  if (st.month > app.demoLastMonth) {
    app.demoLastMonth = st.month;
    strategy.monthly(st, data);
    if (st.review && st.review.mode === 'hold') strategy.review(st, data);
  }
}

// ------------------------------------------------------------------ loop --
function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(100, now - (app.lastFrame || now));
  app.lastFrame = now;
  app.uiTime += dtReal / 1000;

  if (app.mode === 'run') {
    const st = app.state;
    if (app.demo) demoPump(now);
    const blocked = isBlocked(st);
    if (!st.paused && !blocked && st.speed > 0) {
      app.acc += dtReal * st.speed;
      let guard = 0;
      while (app.acc >= TICK_MS && guard++ < 64) {
        app.acc -= TICK_MS;
        const monthBefore = st.month;
        simTick(st, data);
        if (st.ending || isBlocked(st)) { app.acc = 0; break; }
        // In demo mode, stop at month boundaries so the playbook acts at the
        // exact same points as the headless driver (same trajectory).
        if (app.demo && st.month !== monthBefore) break;
      }
    }
    // Autosave once per game-month (never for demo runs).
    if (!app.demo && st.month !== app.lastSaveMonth && !st.ending) {
      app.lastSaveMonth = st.month;
      try { localStorage.setItem(SAVE_KEY, saveState(st)); } catch { /* storage full */ }
    }

    drawGrid(app, data);
    if (now - app.lastLedgerDraw > 100) { // 10 Hz
      app.lastLedgerDraw = now;
      drawLedger(app, data);
      document.getElementById('date-display').textContent = monthLabel(st.t);
      document.getElementById('era-label').textContent = eraLabel(st.month);
    }
    updatePanels(app, data, false);
    showToasts(app, data);
    audio.update(st, data, app);

    if (st.ending) endRun();
  } else if (app.mode === 'ending') {
    drawEnding(app, data, now);
  }
}

// ------------------------------------------------------------- controls --
function setSpeed(v) {
  if (!app.state) return;
  app.userPaused = v === 0;
  if (v === 0) {
    app.state.paused = true;
  } else {
    app.state.paused = false;
    app.state.speed = v;
  }
  updateSpeedButtons();
}

function updateSpeedButtons() {
  const st = app.state;
  document.querySelectorAll('#speed-controls button').forEach((b) => {
    const v = Number(b.dataset.speed);
    b.classList.toggle('active', st && (st.paused ? v === 0 : v === st.speed));
  });
}

function initControls() {
  document.querySelectorAll('#speed-controls button').forEach((b) =>
    b.addEventListener('click', () => setSpeed(Number(b.dataset.speed)))
  );
  const muteBtn = document.getElementById('mute-btn');
  const applyMute = () => muteBtn.classList.toggle('muted', audio.muted);
  muteBtn.addEventListener('click', () => { audio.toggleMute(); applyMute(); });
  applyMute();

  addEventListener('keydown', (e) => {
    if (app.mode !== 'run') return;
    if (e.code === 'Space') { e.preventDefault(); setSpeed(app.state.paused ? app.state.speed : 0); }
    else if (e.key === '1') setSpeed(1);
    else if (e.key === '2') setSpeed(2);
    else if (e.key === '3' || e.key === '4') setSpeed(4);
    else if (e.key === 'Escape' && !app.demo) { app.selectedBuild = null; app.selectedBuilding = null; }
  });

  // Resume audio context on first gesture (autoplay policy).
  const unlock = () => { audio.unlock(); removeEventListener('pointerdown', unlock); };
  addEventListener('pointerdown', unlock);
}

/** Resize a canvas to CSS size × devicePixelRatio; returns 2d ctx scaled to CSS px. */
export function sizeCanvas(canvas) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = Math.max(1, Math.round(r.width * dpr));
  const H = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export { showMenu, monthLabel, SAVE_KEY };

// ------------------------------------------------------------------ boot --
(async function boot() {
  data = await loadData();
  app.data = data;
  document.getElementById('ledger-title').textContent = data.strings.ledgerTitle;
  initLedger();
  initGrid(app, data);
  initPanels(app, data);
  initControls();
  if (matchMedia('(max-width: 700px)').matches) {
    // Mobile gets a hint toast but remains functional.
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'toast';
      el.textContent = data.strings.toasts.mobileHint;
      document.getElementById('toast-stack').appendChild(el);
      setTimeout(() => el.remove(), 5000);
    }, 800);
  }
  showMenu();
  requestAnimationFrame(frame);
})();
