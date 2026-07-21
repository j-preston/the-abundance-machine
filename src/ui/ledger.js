// The Ledger of Straight Lines — the semi-log chart that IS the HUD.
// Redraws at 10 Hz (throttled by main.js).
import { sizeCanvas } from '../main.js';
import { computeGap, currentBar } from '../sim/tiers.js';
import { revealLevel } from '../sim/rivals.js';

let canvas;

export function initLedger() {
  canvas = document.getElementById('ledger-canvas');
}

const Y_MIN = 1, Y_MAX = 200000; // log10 range: 0 → 5.3
const CSS = {
  ink: '#1B2A41', inkFaint: 'rgba(27,42,65,0.12)', inkSoft: 'rgba(27,42,65,0.45)',
  capability: '#E4572E', assurance: '#17A398', sun: '#F2B705', danger: '#C1292E',
  rival: 'rgba(27,42,65,0.5)',
};

export function drawLedger(app, data) {
  const st = app.state;
  if (!st) return;
  const balance = data.balance;
  const ctx = sizeCanvas(canvas);
  const { width: w, height: h } = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, w, h);

  const total = balance.time.totalMonths;
  const xOf = (m) => 34 + (m / total) * (w - 42);
  const yOf = (v) => {
    const lv = Math.log10(Math.max(Y_MIN, v));
    const l0 = Math.log10(Y_MIN), l1 = Math.log10(Y_MAX);
    return h - 14 - ((lv - l0) / (l1 - l0)) * (h - 20);
  };

  // Graph paper: decade lines + year ticks.
  ctx.lineWidth = 1;
  ctx.strokeStyle = CSS.inkFaint;
  ctx.fillStyle = CSS.inkSoft;
  ctx.font = '9px "IBM Plex Mono", monospace';
  for (let d = 0; d <= 5; d++) {
    const v = Math.pow(10, d);
    const y = yOf(v);
    ctx.beginPath(); ctx.moveTo(34, y); ctx.lineTo(w - 8, y); ctx.stroke();
    ctx.fillText(d === 0 ? '1' : `10${superscript(d)}`, 4, y + 3);
  }
  for (let m = 0; m <= total; m += 12) {
    const x = xOf(m);
    ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x, h - 14); ctx.stroke();
    if (m % 24 === 0) ctx.fillText(String(balance.time.startYear + m / 12), x - 12, h - 3);
  }

  // Tier thresholds — horizontal rules; T7 dashed and labeled.
  const ths = balance.tiers.thresholds;
  for (let i = 0; i < ths.length; i++) {
    const y = yOf(ths[i]);
    const isFinal = i === ths.length - 1;
    ctx.strokeStyle = isFinal ? CSS.sun : 'rgba(27,42,65,0.22)';
    ctx.lineWidth = isFinal ? 1.5 : 1;
    if (isFinal) ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(34, y); ctx.lineTo(w - 8, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = isFinal ? '#8A6A00' : CSS.inkSoft;
    ctx.fillText(isFinal ? data.strings.ui.threshold : `T${i + 1}`, w - (isFinal ? 118 : 26), y - 3);
  }

  const H = st.history;
  const n = H.months.length;

  // The gap: shaded region between C and A where C is above — amber → red by G.
  const G = computeGap(st, balance);
  if (n > 1) {
    const heat = Math.max(0, Math.min(1, (G - 0.8) / 1.6));
    ctx.beginPath();
    for (let i = 0; i < n; i++) ctx.lineTo(xOf(H.months[i]), yOf(Math.max(H.c[i], 1)));
    ctx.lineTo(xOf(st.t), yOf(Math.max(st.capability, 1)));
    ctx.lineTo(xOf(st.t), yOf(Math.max(st.assurance, 1)));
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(xOf(H.months[i]), yOf(Math.max(H.a[i], 1)));
    ctx.closePath();
    ctx.fillStyle = `rgba(${Math.round(228 + 27 * heat)}, ${Math.round(150 - 100 * heat)}, ${Math.round(46 - 20 * heat)}, ${0.10 + 0.22 * heat})`;
    ctx.fill();
  }

  // Rival curves — thin grey, with uncertainty bands when unrevealed.
  const reveal = revealLevel(st, balance);
  for (let ri = 0; ri < st.rivals.length; ri++) {
    const series = H.rivals[ri];
    if (series.length < 2) continue;
    const bandDecades = (1 - reveal) * 0.3;
    if (bandDecades > 0.01) {
      ctx.beginPath();
      for (let i = 0; i < series.length; i++) ctx.lineTo(xOf(H.months[i]), yOf(series[i] * Math.pow(10, bandDecades)));
      for (let i = series.length - 1; i >= 0; i--) ctx.lineTo(xOf(H.months[i]), yOf(series[i] / Math.pow(10, bandDecades)));
      ctx.closePath();
      ctx.fillStyle = 'rgba(27,42,65,0.06)';
      ctx.fill();
    }
    ctx.strokeStyle = CSS.rival;
    ctx.lineWidth = 1;
    if (reveal < 1) ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (let i = 0; i < series.length; i++) ctx.lineTo(xOf(H.months[i]), yOf(series[i]));
    ctx.lineTo(xOf(st.t), yOf(st.rivals[ri].c));
    ctx.stroke();
    ctx.setLineDash([]);
    // Label at curve end.
    ctx.fillStyle = CSS.rival;
    ctx.fillText(st.rivals[ri].name.split(' ')[0], Math.min(w - 60, xOf(st.t) + 4), yOf(st.rivals[ri].c) + 3);
  }

  // Assurance — the teal curve.
  drawSeries(ctx, H.months, H.a, st.t, st.assurance, xOf, yOf, CSS.assurance, 1.6);
  // Capability — the red curve.
  drawSeries(ctx, H.months, H.c, st.t, st.capability, xOf, yOf, CSS.capability, 2);

  // Live "now" tick.
  ctx.strokeStyle = 'rgba(27,42,65,0.3)';
  ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(xOf(st.t), 6); ctx.lineTo(xOf(st.t), h - 14); ctx.stroke();
  ctx.setLineDash([]);

  // Gap readout badge.
  const gy = 12;
  ctx.font = '10px "IBM Plex Mono", monospace';
  ctx.fillStyle = G > 1.5 ? CSS.danger : G > 1 ? '#9A6A00' : CSS.assurance;
  ctx.fillText(`G ${G.toFixed(2)}`, 38, gy);
  ctx.fillStyle = CSS.capability;
  ctx.fillText(`C ${fmt(st.capability)}`, 92, gy);
  ctx.fillStyle = CSS.assurance;
  ctx.fillText(`A ${fmt(st.assurance)} / ${fmt(currentBar(st, balance))}`, 156, gy);
}

function drawSeries(ctx, months, arr, tNow, vNow, xOf, yOf, color, width) {
  if (months.length === 0) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < months.length; i++) ctx.lineTo(xOf(months[i]), yOf(Math.max(arr[i], 1)));
  ctx.lineTo(xOf(tNow), yOf(Math.max(vNow, 1)));
  ctx.stroke();
  // Live dot.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(xOf(tNow), yOf(Math.max(vNow, 1)), 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function superscript(d) {
  return ['⁰', '¹', '²', '³', '⁴', '⁵'][d] || d;
}

export function fmt(v) {
  if (v >= 10000) return `${Math.round(v / 1000)}k`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
}
