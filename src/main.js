// Boot, fixed-timestep loop, mode switch (menu / run / ending).
import { createState, dailySeed, saveState, loadState } from './state.js';
import { simTick, isBlocked } from './sim/sim.js';
import { initLedger, drawLedger } from './ui/ledger.js';
import { initGrid, drawGrid } from './ui/grid.js';
import { initPanels, updatePanels, showToasts } from './ui/panels.js';
import { startEnding, drawEnding, disposeEnding } from './ui/endings.js';
import { audio } from './audio/score.js';

const SAVE_KEY = 'abundance-machine-save-v1';
const TICK_MS = 250; // 250 ms sim tick = 1/28 game-month at 1×

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

function beginRun() {
  app.mode = 'run';
  app.selectedBuild = null;
  app.selectedBuilding = null;
  app.lastSaveMonth = app.state.month;
  document.getElementById('overlay').classList.remove('visible');
  audio.startRun();
  updateSpeedButtons();
  updatePanels(app, data, true);
}

function endRun() {
  app.mode = 'ending';
  app.endingStartedAt = performance.now();
  localStorage.removeItem(SAVE_KEY);
  startEnding(app, data);
}

// ------------------------------------------------------------------ loop --
function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(100, now - (app.lastFrame || now));
  app.lastFrame = now;
  app.uiTime += dtReal / 1000;

  if (app.mode === 'run') {
    const st = app.state;
    const blocked = isBlocked(st);
    if (!st.paused && !blocked && st.speed > 0) {
      app.acc += dtReal * st.speed;
      let guard = 0;
      while (app.acc >= TICK_MS && guard++ < 64) {
        app.acc -= TICK_MS;
        simTick(st, data);
        if (st.ending || isBlocked(st)) { app.acc = 0; break; }
      }
    }
    // Autosave once per game-month.
    if (st.month !== app.lastSaveMonth && !st.ending) {
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
    else if (e.key === 'Escape') { app.selectedBuild = null; app.selectedBuilding = null; }
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
