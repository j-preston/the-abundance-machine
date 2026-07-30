// The Ledger of Straight Lines — the semi-log chart that IS the HUD.
// Redraws at 10 Hz (throttled by main.js).
//
// Reading order the layout is built for: the drawn past is crisp and the
// unwritten future is dimmed; the shaded band between capability and assurance
// is the loudest thing on the chart; annotations along the axis say what
// happened and when.
import { sizeCanvas } from '../main.js';
import { computeGap, currentBar } from '../sim/tiers.js';
import { revealLevel } from '../sim/rivals.js';

let canvas;

export function initLedger() {
  canvas = document.getElementById('ledger-canvas');
}

const Y_MIN = 1, Y_MAX = 150000;
const PAD = { l: 32, r: 50, t: 18, b: 24 };
const MONO = '"IBM Plex Mono", monospace';
const CSS = {
  ink: '#1B2A41', inkFaint: 'rgba(27,42,65,0.11)', inkSoft: 'rgba(27,42,65,0.45)',
  capability: '#E4572E', assurance: '#17A398', sun: '#F2B705', danger: '#C1292E',
  rival: 'rgba(27,42,65,0.5)', paper: '#EDF2F4',
};

export function drawLedger(app, data) {
  const st = app.state;
  if (!st) return;
  const balance = data.balance;
  const ctx = sizeCanvas(canvas);
  const { width: w, height: h } = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, w, h);
  ctx.textAlign = 'left';

  const total = balance.time.totalMonths;
  const L = PAD.l, R = w - PAD.r, T = PAD.t, B = h - PAD.b;
  const xOf = (m) => L + (m / total) * (R - L);
  const l0 = Math.log10(Y_MIN), l1 = Math.log10(Y_MAX);
  const yOf = (v) => B - ((Math.log10(Math.max(Y_MIN, v)) - l0) / (l1 - l0)) * (B - T);
  const nowX = xOf(st.t);

  // ---- graph paper ----
  ctx.lineWidth = 1;
  ctx.strokeStyle = CSS.inkFaint;
  ctx.font = `9px ${MONO}`;
  const DECADES = ['1', '10', '100', '1k', '10k', '100k'];
  for (let d = 0; d <= 5; d++) {
    const y = yOf(Math.pow(10, d));
    ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke();
    ctx.fillStyle = CSS.inkSoft;
    ctx.textAlign = 'right';
    ctx.fillText(DECADES[d], L - 5, y + 3);
    ctx.textAlign = 'left';
  }
  for (let m = 0; m <= total; m += 12) {
    const x = xOf(m);
    ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, B); ctx.stroke();
  }

  // ---- tier lines (faint), with the next target picked out ----
  const ths = balance.tiers.thresholds;
  for (let i = 0; i < ths.length - 1; i++) {
    const isNext = i === st.tier;
    ctx.strokeStyle = isNext ? 'rgba(27,42,65,0.38)' : 'rgba(27,42,65,0.15)';
    ctx.lineWidth = isNext ? 1.2 : 1;
    const y = yOf(ths[i]);
    ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke();
  }

  // ---- the future is unwritten: dim everything right of now ----
  if (nowX < R) {
    ctx.fillStyle = 'rgba(237,242,244,0.62)';
    ctx.fillRect(nowX, T - 2, R - nowX + 1, B - T + 4);
  }

  // ---- the Threshold: the goal line, always crisp ----
  const tY = yOf(ths[ths.length - 1]);
  ctx.strokeStyle = CSS.sun;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(L, tY); ctx.lineTo(R, tY); ctx.stroke();
  ctx.setLineDash([]);

  // ---- tier labels in the right gutter, collision-resolved ----
  ctx.font = `9px ${MONO}`;
  let lastY = -99;
  for (let i = ths.length - 1; i >= 0; i--) {
    let y = yOf(ths[i]) + 3;
    if (y - lastY < 9.5) y = lastY + 9.5; // push down rather than overlap
    if (y > B) break;
    lastY = y;
    const crossed = st.tier > i;
    ctx.fillStyle = i === ths.length - 1 ? '#8A6A00' : crossed ? 'rgba(27,42,65,0.32)' : CSS.inkSoft;
    ctx.fillText(i === ths.length - 1 ? 'T7 ✦' : `T${i + 1}`, R + 6, y);
  }

  const H = st.history;
  const n = H.months.length;
  const G = computeGap(st, balance);

  // ---- the gap: the most important pixels in the game ----
  if (n > 1) {
    const heat = Math.max(0, Math.min(1, (G - 0.8) / 1.4));
    ctx.beginPath();
    for (let i = 0; i < n; i++) ctx.lineTo(xOf(H.months[i]), yOf(Math.max(H.c[i], 1)));
    ctx.lineTo(nowX, yOf(Math.max(st.capability, 1)));
    ctx.lineTo(nowX, yOf(Math.max(st.assurance, 1)));
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(xOf(H.months[i]), yOf(Math.max(H.a[i], 1)));
    ctx.closePath();
    const g = ctx.createLinearGradient(0, T, 0, B);
    const r0 = Math.round(228 + 20 * heat), g0 = Math.round(140 - 100 * heat), b0 = Math.round(50 - 25 * heat);
    g.addColorStop(0, `rgba(${r0},${g0},${b0},${0.30 + 0.34 * heat})`);
    g.addColorStop(1, `rgba(${r0},${g0},${b0},${0.12 + 0.20 * heat})`);
    ctx.fillStyle = g;
    ctx.fill();
  }

  // ---- rivals: thin, uncertain until you pay to see them ----
  const reveal = revealLevel(st, balance);
  const rivalLabels = [];
  for (let ri = 0; ri < st.rivals.length; ri++) {
    const series = H.rivals[ri];
    if (series.length < 2) continue;
    const bandDecades = (1 - reveal) * 0.3;
    if (bandDecades > 0.01) {
      ctx.beginPath();
      for (let i = 0; i < series.length; i++) ctx.lineTo(xOf(H.months[i]), yOf(series[i] * Math.pow(10, bandDecades)));
      for (let i = series.length - 1; i >= 0; i--) ctx.lineTo(xOf(H.months[i]), yOf(series[i] / Math.pow(10, bandDecades)));
      ctx.closePath();
      ctx.fillStyle = 'rgba(27,42,65,0.07)';
      ctx.fill();
    }
    ctx.strokeStyle = CSS.rival;
    ctx.lineWidth = 1;
    if (reveal < 1) ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (let i = 0; i < series.length; i++) ctx.lineTo(xOf(H.months[i]), yOf(series[i]));
    ctx.lineTo(nowX, yOf(st.rivals[ri].c));
    ctx.stroke();
    ctx.setLineDash([]);
    rivalLabels.push({ y: yOf(st.rivals[ri].c), text: st.rivals[ri].name.split(' ')[0] });
  }

  // ---- your two curves ----
  drawSeries(ctx, H.months, H.a, st.t, st.assurance, xOf, yOf, CSS.assurance, 1.7);
  drawSeries(ctx, H.months, H.c, st.t, st.capability, xOf, yOf, CSS.capability, 2.1);

  // Rival names, nudged apart so two labels never stack on one another.
  ctx.font = `9px ${MONO}`;
  ctx.fillStyle = CSS.rival;
  rivalLabels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < rivalLabels.length; i++) {
    if (rivalLabels[i].y - rivalLabels[i - 1].y < 10) rivalLabels[i].y = rivalLabels[i - 1].y + 10;
  }
  for (const lab of rivalLabels) {
    ctx.fillText(lab.text, Math.min(R - 4, nowX + 5), Math.max(T + 8, Math.min(B, lab.y + 3)));
  }

  // ---- now ----
  ctx.strokeStyle = 'rgba(27,42,65,0.35)';
  ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(nowX, T); ctx.lineTo(nowX, B); ctx.stroke();
  ctx.setLineDash([]);

  // ---- axis: years + what happened, and when ----
  ctx.font = `9px ${MONO}`;
  ctx.fillStyle = CSS.inkSoft;
  for (let m = 0; m <= total; m += 24) {
    ctx.textAlign = 'center';
    ctx.fillText(String(balance.time.startYear + m / 12), xOf(m), h - 3);
  }
  ctx.textAlign = 'left';
  drawMarks(ctx, st, xOf, B);

  // ---- instrument row ----
  drawHeader(ctx, st, balance, data, w, G);
}

/** Tier crossings and incidents, pinned to the time axis. */
function drawMarks(ctx, st, xOf, B) {
  const y = B + 7;
  for (const mk of st.marks) {
    const x = xOf(mk.m);
    if (mk.kind === 'incident') {
      ctx.fillStyle = CSS.danger;
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
    } else {
      const forced = mk.kind === 'forced';
      ctx.beginPath();
      ctx.moveTo(x, y - 3.4); ctx.lineTo(x + 3, y + 2.4); ctx.lineTo(x - 3, y + 2.4);
      ctx.closePath();
      if (forced) {
        ctx.strokeStyle = CSS.danger; ctx.lineWidth = 1.2; ctx.stroke();
      } else {
        ctx.fillStyle = CSS.sun; ctx.fill();
        ctx.strokeStyle = 'rgba(27,42,65,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();
      }
    }
  }
}

/** Readouts left, legend right. Every number in Plex Mono — this is an instrument. */
function drawHeader(ctx, st, balance, data, w, G) {
  const y = 11;
  ctx.font = `500 10px ${MONO}`;
  ctx.textAlign = 'left';

  let x = PAD.l + 2;
  const chip = (label, value, color) => {
    ctx.fillStyle = CSS.inkSoft;
    ctx.fillText(label, x, y);
    x += ctx.measureText(label).width + 4;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
    x += ctx.measureText(value).width + 13;
  };
  chip('GAP', G.toFixed(2), G > 1.5 ? CSS.danger : G > 1 ? '#9A6A00' : CSS.assurance);
  chip('C', fmt(st.capability), CSS.capability);
  chip('A', `${fmt(st.assurance)}/${fmt(currentBar(st, balance))}`, CSS.assurance);
  if (st.tier > 0) {
    ctx.fillStyle = CSS.inkSoft;
    ctx.fillText(`T${st.tier} ${balance.tiers.names[st.tier - 1].toUpperCase()}`, x, y);
  }

  // Legend, right-aligned: which line is which, without a manual.
  const legend = [
    ['CAPABILITY', CSS.capability, 'solid'],
    ['ASSURANCE', CSS.assurance, 'solid'],
    ['RIVALS', CSS.rival, 'dash'],
  ];
  ctx.font = `9px ${MONO}`;
  let lw = 0;
  for (const [t] of legend) lw += 14 + ctx.measureText(t).width + 10;
  let lx = w - PAD.r - lw + 10;
  for (const [text, color, style] of legend) {
    ctx.strokeStyle = color;
    ctx.lineWidth = style === 'solid' ? 2 : 1;
    if (style === 'dash') ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(lx, y - 3); ctx.lineTo(lx + 10, y - 3); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = CSS.inkSoft;
    ctx.fillText(text, lx + 14, y);
    lx += 14 + ctx.measureText(text).width + 10;
  }
}

function drawSeries(ctx, months, arr, tNow, vNow, xOf, yOf, color, width) {
  if (months.length === 0) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < months.length; i++) ctx.lineTo(xOf(months[i]), yOf(Math.max(arr[i], 1)));
  ctx.lineTo(xOf(tNow), yOf(Math.max(vNow, 1)));
  ctx.stroke();
  // Live head.
  const hx = xOf(tNow), hy = yOf(Math.max(vNow, 1));
  ctx.fillStyle = CSS.paper;
  ctx.beginPath(); ctx.arc(hx, hy, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(hx, hy, 2.4, 0, Math.PI * 2); ctx.fill();
}

export function fmt(v) {
  if (v >= 10000) return `${Math.round(v / 1000)}k`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
}
