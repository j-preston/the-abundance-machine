// Build palette, context cards, resource bar. DOM is rebuilt only when a
// coarse fingerprint changes; numbers update every frame.
import { buildingCost } from '../state.js';
import { canPlace } from '../sim/economy.js';
import { currentBar, canPassReview, resolveReview, computeGap, tierFraction } from '../sim/tiers.js';
import { diplomacyStatus, doDiplomacy, spendForesight } from '../sim/rivals.js';
import { answerForecast, meanBrier } from '../sim/forecasts.js';
import { chooseEvent } from '../sim/events.js';
import { fmt } from './ledger.js';

let els = {};
let contextKey = '';
let paletteKey = '';

export function initPanels(app, data) {
  els.palette = document.getElementById('build-palette');
  els.context = document.getElementById('context-panel');
  els.bar = document.getElementById('resource-bar');
  els.toasts = document.getElementById('toast-stack');
  buildResourceBar(app, data);
}

// -------------------------------------------------------------- palette --
const PALETTE_ORDER = ['solar', 'gas', 'fission', 'fusion', 'fab', 'datacenter', 'refinery', 'lab', 'office', 'wing', 'robotics', 'policy'];

function buildPalette(app, data) {
  const st = app.state;
  els.palette.innerHTML = '';
  for (const type of PALETTE_ORDER) {
    const def = data.balance.buildings[type];
    const check = canPlace(st, data.balance, type);
    const btn = document.createElement('button');
    btn.className = 'build-btn';
    btn.dataset.type = type;
    const locked = check.reason === 'locked' || check.reason === 'max';
    if (locked) btn.classList.add('locked');
    else if (check.reason === 'gated') btn.classList.add('locked', 'gated');
    else if (check.reason === 'capital') btn.classList.add('poor');
    if (app.selectedBuild === type) btn.classList.add('selected');
    const cost = buildingCost(st, data.balance, type);
    btn.innerHTML = `
      <span class="glyph">${def.glyph}</span>
      <span class="bname">${def.name}</span>
      <span class="bcost">${check.reason === 'locked' ? `T${def.unlockTier}` : `$${cost.toFixed(1)}B`}</span>`;
    btn.title = titleFor(type, def, check, data);
    btn.addEventListener('click', () => {
      if (locked || check.reason === 'gated') return;
      app.selectedBuild = app.selectedBuild === type ? null : type;
      app.selectedBuilding = null;
      paletteKey = ''; // force refresh
    });
    els.palette.appendChild(btn);
  }
}

function titleFor(type, def, check, data) {
  const lines = [def.name];
  if (def.powerOut) lines.push(`+${def.powerOut} MW`);
  if (def.draw) lines.push(`draw ${def.draw} MW`);
  if (def.chipsPerMo) lines.push(`${def.chipsPerMo} chips/mo`);
  if (def.chipSlots) lines.push(`hosts ${def.chipSlots} chips → ${def.chipSlots / data.balance.economy.chipsPerPF} PF`);
  if (def.dataPerMo) lines.push(`${def.dataPerMo} data/mo`);
  if (type === 'lab') lines.push('converts compute + data → capability');
  if (type === 'office') lines.push(`${data.balance.assurance.officeRate} A/mo — linear, that's the point`);
  if (type === 'wing') lines.push('A/mo = 4×√(PF alloc) — needs clean record');
  if (type === 'robotics') lines.push('−25% build times (multiplicative)');
  if (type === 'policy') lines.push('unlocks diplomacy + more forecasts');
  if (check.reason === 'gated') lines.push('GATED: zero open incidents + A above bar');
  lines.push(`builds in ${def.build} mo`);
  return lines.join('\n');
}

// ---------------------------------------------------------- resource bar --
function buildResourceBar(app, data) {
  els.bar.innerHTML = `
    <span class="res"><span class="sym">$</span><span class="val" id="rb-capital"></span></span>
    <span class="res" id="rb-energy-wrap"><span class="sym">⚡</span><span class="val" id="rb-energy"></span></span>
    <span class="res"><span class="sym">◧</span><span class="val" id="rb-chips"></span></span>
    <span class="res"><span class="sym">PF</span><span class="val" id="rb-pf"></span></span>
    <div id="alloc-slider" title="${data.strings.ui.alloc} — drag the knobs">
      <span class="lbl" style="color:var(--capability)">C</span>
      <div id="alloc-track">
        <div class="seg c"></div><div class="seg i"></div><div class="seg a"></div>
        <div class="knob" data-knob="1"></div><div class="knob" data-knob="2"></div>
      </div>
      <span class="lbl" style="color:var(--assurance)">A</span>
    </div>
    <span class="res"><span class="sym">▤</span><span class="val" id="rb-data"></span></span>
    <span class="res"><span class="sym">♥</span><span class="val" id="rb-trust"></span></span>
    <span class="res sun"><span class="sym">✦</span><span class="val" id="rb-foresight"></span></span>
    <span class="res"><span class="sym">⚭</span><span class="val" id="rb-coord"></span></span>
    <span class="res assur"><span class="sym">A</span><span class="val" id="rb-assur"></span></span>
  `;
  initAllocSlider(app);
}

function initAllocSlider(app) {
  const track = document.getElementById('alloc-track');
  let dragging = null, moved = false;

  const setFromEvent = (e) => {
    const r = track.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const st = app.state;
    if (!st) return;
    let { c, i, a } = st.alloc;
    if (dragging === 1) {
      const k2 = c + i;
      c = Math.max(0.02, Math.min(k2 - 0.02, f));
      i = k2 - c;
    } else {
      const k2 = Math.max(c + 0.02, Math.min(0.98, f));
      i = k2 - c;
      a = 1 - k2;
    }
    a = 1 - c - i;
    st.alloc = { c, i, a };
    moved = true;
  };

  track.addEventListener('pointerdown', (e) => {
    const st = app.state;
    if (!st) return;
    const r = track.getBoundingClientRect();
    const f = (e.clientX - r.left) / r.width;
    dragging = Math.abs(f - st.alloc.c) < Math.abs(f - (st.alloc.c + st.alloc.i)) ? 1 : 2;
    moved = false;
    track.setPointerCapture(e.pointerId);
    setFromEvent(e);
  });
  track.addEventListener('pointermove', (e) => { if (dragging) setFromEvent(e); });
  const stop = () => {
    if (dragging && moved && app.state) app.state.stats.sliderMoves++;
    dragging = null;
  };
  track.addEventListener('pointerup', stop);
  track.addEventListener('pointercancel', stop);
}

function updateResourceBar(app, data) {
  const st = app.state;
  const bal = data.balance;
  const set = (id, v) => { const el = document.getElementById(id); if (el.textContent !== v) el.textContent = v; };
  set('rb-capital', `${st.capital.toFixed(1)}B`);
  set('rb-energy', `${Math.round(st.energyUsed || 0)}/${Math.round(st.energyProd || 0)} MW`);
  document.getElementById('rb-energy-wrap').classList.toggle('warn',
    (st.energyProd || 0) > 0 && (st.energyUsed || 0) / Math.max(1, st.energyProd) > 0.92);
  set('rb-chips', String(Math.floor(st.chips)));
  set('rb-pf', String(Math.round(st.pf || 0)));
  set('rb-data', String(Math.round(st.data)));
  set('rb-trust', String(Math.round(st.trust)));
  set('rb-foresight', String(st.foresight));
  set('rb-coord', String(Math.round(st.coordination)));
  set('rb-assur', `${fmt(st.assurance)}/${fmt(currentBar(st, bal))}`);
  const c = st.alloc.c, i = st.alloc.i;
  const track = document.getElementById('alloc-track');
  const segs = track.querySelectorAll('.seg');
  segs[0].style.cssText = `left:0;width:${c * 100}%`;
  segs[1].style.cssText = `left:${c * 100}%;width:${i * 100}%`;
  segs[2].style.cssText = `left:${(c + i) * 100}%;right:0`;
  const knobs = track.querySelectorAll('.knob');
  knobs[0].style.left = `calc(${c * 100}% - 3px)`;
  knobs[1].style.left = `calc(${(c + i) * 100}% - 3px)`;
}

// ------------------------------------------------------------- context --
export function updatePanels(app, data, force) {
  const st = app.state;
  if (!st) return;
  updateResourceBar(app, data);

  const pk = PALETTE_ORDER.map((t) => {
    const ch = canPlace(st, data.balance, t);
    return `${t}:${ch.ok ? 'y' : ch.reason}:${app.selectedBuild === t ? 's' : ''}`;
  }).join('|') + `|${st.deflation.toFixed(2)}`;
  if (pk !== paletteKey || force) { paletteKey = pk; buildPalette(app, data); }

  const key = contextFingerprint(app, st);
  if (key !== contextKey || force) {
    contextKey = key;
    renderContext(app, data);
  } else {
    // Live-update the default panel's numbers without rebuilding.
    const g = document.getElementById('ctx-gap');
    if (g) g.textContent = computeGap(st, data.balance).toFixed(2);
    const pr = document.getElementById('ctx-progress');
    if (pr) pr.textContent = `${Math.round(tierFraction(st, data.balance) * 100)}%`;
  }
}

function contextFingerprint(app, st) {
  return [
    st.review ? `r${st.review.tier}${st.review.mode}` : '',
    st.forecasts.pendingCard ? `f${st.forecasts.pendingCard.tplId}` : '',
    st.pendingEvent ? `e${st.pendingEvent.id}` : '',
    app.selectedBuilding ?? '',
    st.tier, st.foresight, Math.round(st.coordination), st.treatySigned,
    st.openIncidents.length, st.month,
  ].join('|');
}

function renderContext(app, data) {
  const st = app.state;
  const s = data.strings;
  const bal = data.balance;
  const ctx = els.context;
  ctx.innerHTML = '';

  if (st.review) ctx.appendChild(reviewCard(app, data));
  if (st.forecasts.pendingCard) ctx.appendChild(forecastCard(app, data));
  if (st.pendingEvent) ctx.appendChild(eventCard(app, data));
  if (!st.review && !st.forecasts.pendingCard && !st.pendingEvent) {
    const sel = st.buildings.find((b) => b.id === app.selectedBuilding);
    if (sel) ctx.appendChild(buildingCard(app, data, sel));
    ctx.appendChild(statusCard(app, data));
    ctx.appendChild(diplomacyCard(app, data));
    ctx.appendChild(foresightCard(app, data));
  }
}

function el(html) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstChild;
}

function reviewCard(app, data) {
  const st = app.state, s = data.strings, bal = data.balance;
  const tier = st.review.tier;
  const bar = currentBar(st, bal);
  const name = bal.tiers.names[tier - 1];
  const canPass = canPassReview(st, bal);
  const isFinal = tier === 7;
  const holding = st.review.mode === 'hold';
  const card = el(`<div class="card review">
    <h3>${s.tiers.reviewTitle.replace('{n}', tier).replace('{name}', name)}</h3>
    <p>${s.tiers.reviewBody.replace('{n}', tier).replace('{a}', fmt(st.assurance)).replace('{bar}', fmt(bar))}</p>
    ${isFinal ? `<p class="mono" style="color:var(--ink-soft)">${s.tiers.finalLocked}</p>` : ''}
    <button class="action" data-act="pass" ${canPass ? '' : 'disabled'}>${s.tiers.pass}
      <span class="hint">${s.tiers.passHint.replace('{spend}', fmt(bar * bal.tiers.passBarSpend))}</span></button>
    ${isFinal ? '' : `<button class="action danger" data-act="force">${s.tiers.force}
      <span class="hint">${s.tiers.forceHint}</span></button>`}
    <button class="action" data-act="hold" ${holding ? 'disabled' : ''}>${holding ? 'HOLDING…' : s.tiers.hold}
      <span class="hint">${s.tiers.holdHint}</span></button>
  </div>`);
  card.querySelectorAll('button[data-act]').forEach((b) =>
    b.addEventListener('click', () => { resolveReview(st, bal, b.dataset.act); contextKey = ''; })
  );
  return card;
}

function forecastCard(app, data) {
  const st = app.state, s = data.strings;
  const card = el(`<div class="card forecast">
    <h3>${s.ui.forecastTitle}</h3>
    <p>${st.forecasts.pendingCard.text}</p>
    <div class="prob-readout"><span id="prob-val">50</span>%</div>
    <input type="range" class="prob-slider" min="5" max="95" value="50" step="1">
    <button class="action" data-act="commit">COMMIT
      <span class="hint">${s.ui.forecastHint}</span></button>
  </div>`);
  const slider = card.querySelector('.prob-slider');
  const readout = card.querySelector('#prob-val');
  slider.addEventListener('input', () => { readout.textContent = slider.value; });
  card.querySelector('[data-act=commit]').addEventListener('click', () => {
    answerForecast(st, Number(slider.value) / 100);
    contextKey = '';
  });
  return card;
}

function eventCard(app, data) {
  const st = app.state, s = data.strings;
  const ev = st.pendingEvent;
  const card = el(`<div class="card">
    <h3>${s.ui.eventTitle} — ${ev.title.toUpperCase()}</h3>
    <p>${ev.text}</p>
    ${ev.choices.map((c, i) => `<button class="action" data-i="${i}">${c.label}</button>`).join('')}
  </div>`);
  card.querySelectorAll('button[data-i]').forEach((b) =>
    b.addEventListener('click', () => { chooseEvent(st, data.balance, Number(b.dataset.i)); contextKey = ''; })
  );
  return card;
}

function buildingCard(app, data, b) {
  const def = data.balance.buildings[b.type];
  const st = app.state;
  const status = !b.done
    ? `building — ${Math.round((b.progress / b.buildTime) * 100)}%`
    : st.month < b.offlineUntil ? 'OFFLINE (incident review)'
    : b.powered ? 'active' : 'idle — no power';
  const rows = [['status', status]];
  if (def.powerOut) rows.push(['output', `${def.powerOut} MW`]);
  if (def.draw) rows.push(['draw', `${def.draw} MW`]);
  if (def.chipSlots) rows.push(['chips', `${Math.floor(b.chips)}/${def.chipSlots}`]);
  return el(`<div class="card">
    <h3>${def.glyph} ${def.name.toUpperCase()}</h3>
    ${rows.map(([k, v]) => `<div class="kv"><span>${k}</span><span class="v">${v}</span></div>`).join('')}
  </div>`);
}

function statusCard(app, data) {
  const st = app.state, bal = data.balance;
  const G = computeGap(st, bal);
  const tierName = st.tier === 0 ? '—' : bal.tiers.names[st.tier - 1];
  const next = st.tier < 7 ? bal.tiers.names[st.tier] : null;
  return el(`<div class="card">
    <div class="section-label">STATUS</div>
    <div class="kv"><span>tier ${st.tier}</span><span class="v">${tierName}</span></div>
    ${next ? `<div class="kv"><span>researching</span><span class="v">${next}</span></div>` : ''}
    <div class="kv"><span>tier progress</span><span class="v" id="ctx-progress">${Math.round(tierFraction(st, bal) * 100)}%</span></div>
    <div class="kv"><span>the gap G</span><span class="v" id="ctx-gap">${G.toFixed(2)}</span></div>
    <div class="kv"><span>open incidents</span><span class="v">${st.openIncidents.length}</span></div>
    <div class="kv"><span>cost deflation</span><span class="v">×${st.deflation.toFixed(2)}</span></div>
    ${meanBrier(st) != null ? `<div class="kv"><span>Brier</span><span class="v">${meanBrier(st).toFixed(2)}</span></div>` : ''}
  </div>`);
}

function diplomacyCard(app, data) {
  const st = app.state, s = data.strings, bal = data.balance;
  const d = diplomacyStatus(st, bal);
  if (!d.desk) {
    return el(`<div class="card"><div class="section-label">DIPLOMACY</div>
      <p style="font-size:11.5px;color:var(--ink-soft)">Build a Policy Desk ✦ to unlock diplomacy and more forecasts.</p></div>`);
  }
  const btn = (key, label, hint, ok) =>
    `<button class="action" data-dip="${key}" ${ok ? '' : 'disabled'}>${label}<span class="hint">${hint}</span></button>`;
  const card = el(`<div class="card">
    <div class="section-label">DIPLOMACY — ${s.ui.coordination} ${Math.round(st.coordination)}</div>
    ${btn('publish', s.diplomacy.publish, s.diplomacy.publishHint, d.publish.ok)}
    ${btn('evals', s.diplomacy.evals, s.diplomacy.evalsHint, d.evals.ok)}
    ${btn('treaty', st.treatySigned ? 'Treaty signed ✓' : s.diplomacy.treaty, s.diplomacy.treatyHint, d.treaty.ok)}
  </div>`);
  card.querySelectorAll('button[data-dip]').forEach((b) =>
    b.addEventListener('click', () => { doDiplomacy(st, bal, b.dataset.dip); contextKey = ''; })
  );
  return card;
}

function foresightCard(app, data) {
  const st = app.state, s = data.strings, f = data.balance.foresightSpends;
  const btn = (key, cost, label, hint) =>
    `<button class="action" data-fs="${key}" ${st.foresight >= cost ? '' : 'disabled'}>${label} <span class="mono">${cost}✦</span><span class="hint">${hint}</span></button>`;
  const card = el(`<div class="card">
    <div class="section-label">FORESIGHT ✦ ${st.foresight}</div>
    ${btn('fastTrack', f.fastTrack, s.foresight.fastTrack, s.foresight.fastTrackHint)}
    ${btn('investor', f.investor, s.foresight.investor, s.foresight.investorHint)}
    ${btn('intel', f.intel, s.foresight.intel, s.foresight.intelHint)}
    ${btn('policyWindow', f.policyWindow, s.foresight.policyWindow, s.foresight.policyWindowHint)}
  </div>`);
  card.querySelectorAll('button[data-fs]').forEach((b) =>
    b.addEventListener('click', () => { spendForesight(st, data.balance, b.dataset.fs); contextKey = ''; })
  );
  return card;
}

// --------------------------------------------------------------- toasts --
export function showToasts(app, data) {
  const st = app.state;
  const s = data.strings;
  while (st.toasts.length > 0) {
    const t = st.toasts.shift();
    let text = '', cls = '';
    if (t.kind === 'incident') { text = s.incidents[t.key]; cls = 'incident'; }
    else if (t.kind === 'tier') { text = `TIER ${t.tier} — ${data.balance.tiers.names[t.tier - 1]}. ${s.tiers.deflation}`; cls = 'tier'; }
    else if (t.kind === 'event') { text = `${t.title}: ${t.text}`; }
    else if (t.kind === 'forecast') {
      text = (t.f > 0 ? s.ui.resolveGood : s.ui.resolveBad).replace('{f}', t.f);
    } else if (t.kind === 'fusion') { text = s.toasts.fusion; cls = 'tier'; }
    else {
      // hint/info/warn keys — Straight Lines difficulty gets the tutorial hints.
      if (t.kind === 'hint' && !data.balance.difficulties[st.difficulty].toasts) continue;
      text = s.toasts[t.key] ?? t.key;
    }
    if (!text) continue;
    const div = document.createElement('div');
    div.className = `toast ${cls}`;
    div.textContent = text;
    els.toasts.appendChild(div);
    while (els.toasts.children.length > 4) els.toasts.firstChild.remove();
    setTimeout(() => { div.classList.add('fading'); setTimeout(() => div.remove(), 700); }, 5200);
    audioToastHook(t, app, data);
  }
}

// Late-bound audio hook (avoids circular import).
let audioHook = null;
export function setAudioToastHook(fn) { audioHook = fn; }
function audioToastHook(t, app, data) { if (audioHook) audioHook(t, app, data); }
