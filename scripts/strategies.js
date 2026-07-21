// Scripted players for headless self-playtesting.
// Deterministic: no RNG of their own; decisions read state only.
import { canPlace, buyBuilding, countDone } from '../src/sim/economy.js';
import { currentBar, canPassReview, resolveReview, computeGap, nextThreshold } from '../src/sim/tiers.js';
import { diplomacyStatus, doDiplomacy, spendForesight } from '../src/sim/rivals.js';
import { answerForecast } from '../src/sim/forecasts.js';
import { chooseEvent } from '../src/sim/events.js';

function autoPos(state) {
  // Positions are cosmetic (links are visual only). The browser demo sets
  // state.layout to fit its canvas; headless uses the default grid.
  const n = state.buildings.length;
  const L = state.layout || { x0: 90, y0: 130, dx: 82, dy: 78, cols: 12 };
  return { x: L.x0 + (n % L.cols) * L.dx, y: L.y0 + Math.floor(n / L.cols) * L.dy };
}

function build(state, balance, type) {
  const { x, y } = autoPos(state);
  return buyBuilding(state, balance, type, x, y) != null;
}

function countAll(state, type) {
  return state.buildings.filter((b) => b.type === type).length; // built + building
}

function energyMargin(state, balance) {
  let prod = 0, demand = 0;
  for (const b of state.buildings) {
    const def = balance.buildings[b.type];
    if (def.powerOut) prod += def.powerOut;       // includes under construction
    else demand += def.draw;
  }
  return prod - demand;
}

function setAlloc(state, c, i, a) {
  if (Math.abs(state.alloc.c - c) > 0.001 || Math.abs(state.alloc.a - a) > 0.001) {
    state.stats.sliderMoves++;
  }
  state.alloc = { c, i, a };
}

/** Ensure the power fleet keeps a margin, choosing the given plant list in order. */
function ensurePower(state, balance, margin, prefs) {
  while (energyMargin(state, balance) < margin) {
    let builtAny = false;
    for (const type of prefs) {
      if (canPlace(state, balance, type).ok && build(state, balance, type)) { builtAny = true; break; }
    }
    if (!builtAny) return;
  }
}

// ---------------------------------------------------------------- greedy ----
// Pure capability rush: gas power, force every gate, minimal assurance.
export const greedy = {
  monthly(state, data) {
    const b = data.balance;
    setAlloc(state, 0.92, 0.03, 0.05);
    ensurePower(state, b, 120, ['gas', 'solar']);
    // Token safety theater: three offices so the cheap early gates pass.
    if (countAll(state, 'office') < 3) build(state, b, 'office');
    const dcs = countAll(state, 'datacenter');
    const wantFabs = Math.max(1, Math.ceil(dcs / 2));
    if (countAll(state, 'fab') < wantFabs) build(state, b, 'fab');
    if ((state.dataFactor ?? 1) < 0.9 && countAll(state, 'refinery') < 6) build(state, b, 'refinery');
    const wantLabs = Math.min(6, 1 + Math.floor(dcs / 3));
    if (countAll(state, 'lab') < wantLabs) build(state, b, 'lab');
    while (state.capital > b.buildings.datacenter.cost * state.deflation + 2) {
      if (!build(state, b, 'datacenter')) break;
      ensurePower(state, b, 60, ['gas', 'solar']);
    }
  },
  review(state, data) {
    // Pass when the bar happens to be met (cheap early gates); force otherwise.
    if (canPassReview(state, data.balance)) { resolveReview(state, data.balance, 'pass'); return; }
    if (!resolveReview(state, data.balance, 'force')) {
      resolveReview(state, data.balance, 'hold'); // Tier 7 has no force option.
    }
  },
  forecast(state) { answerForecast(state, 0.65); },
  event(state, data) { chooseEvent(state, data.balance, 0); },
};

// ---------------------------------------------------------------- safety ----
// Turtle: clean power, huge assurance investment, cautious gates, diplomacy.
export const safety = {
  monthly(state, data) {
    const b = data.balance;
    setAlloc(state, 0.45, 0.05, 0.5);
    ensurePower(state, b, 100, ['fission', 'solar']);
    if (countAll(state, 'policy') < 1 && state.month >= 10) build(state, b, 'policy');
    const bar = currentBar(state, b);
    if (state.assurance < bar * 1.5 && countAll(state, 'office') < 14) build(state, b, 'office');
    const dcs = countAll(state, 'datacenter');
    if (countAll(state, 'fab') < Math.max(1, Math.ceil(dcs / 2))) build(state, b, 'fab');
    if (dcs < 8) build(state, b, 'datacenter');
    if (countAll(state, 'refinery') < 2) build(state, b, 'refinery');
    if (countAll(state, 'lab') < 2) build(state, b, 'lab');
    if (state.tier >= 4 && countAll(state, 'wing') < 2) build(state, b, 'wing');
    // Publishes only as maintenance — the turtle's blind spot is the wider
    // coordination push, so the world hovers near the safety line.
    const d = diplomacyStatus(state, b);
    if (d.publish.ok && state.coordination < 45) doDiplomacy(state, b, 'publish');
  },
  review(state, data) {
    const b = data.balance;
    if (state.assurance >= currentBar(state, b) * 1.15 && canPassReview(state, b)) {
      resolveReview(state, b, 'pass');
    } else {
      resolveReview(state, b, 'hold');
    }
  },
  forecast(state) { answerForecast(state, 0.5); },
  event(state, data) { chooseEvent(state, data.balance, 0); },
};

// -------------------------------------------------------------- balanced ----
// Competent play: watch the Gap, throttle the slider, coordinate, use wings.
export const balanced = {
  monthly(state, data) {
    const b = data.balance;
    const G = computeGap(state, b);
    const bar = currentBar(state, b);

    // Throttle: the most-touched control in the game.
    if (state.review && state.review.mode === 'hold') setAlloc(state, 0.35, 0.05, 0.6);
    else if (G > 1.25) setAlloc(state, 0.42, 0.05, 0.53);
    else if (G > 0.95) setAlloc(state, 0.6, 0.05, 0.35);
    else setAlloc(state, 0.78, 0.04, 0.18);

    ensurePower(state, b, 140, ['fusion', 'fission', 'solar']);

    if (countAll(state, 'policy') < 1 && state.month >= 12) build(state, b, 'policy');

    // Assurance capacity: offices early, wings once trusted.
    const offices = countAll(state, 'office');
    const wantOffices = Math.min(10, 2 + state.tier * 2);
    if (offices < wantOffices && state.assurance < bar * 1.2) build(state, b, 'office');
    if (state.tier >= 4 && countAll(state, 'wing') < 3) build(state, b, 'wing');

    // Compute stack.
    const dcs = countAll(state, 'datacenter');
    if (countAll(state, 'fab') < Math.max(1, Math.ceil(dcs / 2))) build(state, b, 'fab');
    if ((state.dataFactor ?? 1) < 0.95 && countAll(state, 'refinery') < 5) build(state, b, 'refinery');
    const wantLabs = Math.min(4, 1 + Math.floor(dcs / 4));
    if (countAll(state, 'lab') < wantLabs) build(state, b, 'lab');
    const reserve = 3 + state.tier;
    if (state.capital > b.buildings.datacenter.cost * state.deflation + reserve) build(state, b, 'datacenter');

    // Diplomacy: fund the world's assurance climate.
    const d = diplomacyStatus(state, b);
    if (d.publish.ok && state.tier >= 1) doDiplomacy(state, b, 'publish');
    if (d.evals.ok && state.assurance > bar * 0.6 + b.coordination.evalsCostA) doDiplomacy(state, b, 'evals');
    if (d.treaty.ok && state.tier >= 3) doDiplomacy(state, b, 'treaty');

    // Foresight: ~2 pivotal accelerations per run.
    if (state.foresight >= b.foresightSpends.investor && state.capital < 2) {
      spendForesight(state, b, 'investor');
    }
    if (state.foresight >= b.foresightSpends.policyWindow && state.coordination < 55 && state.tier >= 4) {
      spendForesight(state, b, 'policyWindow');
    }
    if (state.foresight >= b.foresightSpends.fastTrack && state.tier >= 5 && !state.flags.fusionIgnited && !state.fastTrackNext) {
      spendForesight(state, b, 'fastTrack');
    }
  },
  review(state, data) {
    const b = data.balance;
    if (canPassReview(state, b)) { resolveReview(state, b, 'pass'); return; }
    // Force is a tool, not a trap: once, early, when rivals have momentum.
    const rivalMax = Math.max(...state.rivals.map((r) => r.c));
    const th = nextThreshold(state, b);
    if (state.review.tier <= 3 && state.forcedCount === 0 && th != null && rivalMax > th * 0.5) {
      resolveReview(state, b, 'force');
      return;
    }
    resolveReview(state, b, 'hold');
  },
  forecast(state, data) {
    const card = state.forecasts.pendingCard;
    answerForecast(state, estimate(state, data.balance, card));
  },
  event(state, data) { chooseEvent(state, data.balance, 0); },
};

/** Calibrated-ish probability estimates from live sim state (target Brier ≈ 0.15).
    Exported so the demo mode can show the slider moving before it commits. */
export function estimate(state, balance, card) {
  const P = card.params;
  const m = P.months ?? 12;
  const band = (need, have) => (need <= have * 0.7 ? 0.85 : need <= have * 1.3 ? 0.5 : 0.15);
  switch (card.tplId) {
    case 'player_tier': {
      const th = balance.tiers.thresholds[P.tier - 1];
      const rate = Math.max(0.01, state.researchRate || 0.01);
      return band((th - state.capability) / rate, m);
    }
    case 'rival_tier': {
      const r = state.rivals[P.rivalIndex];
      const k = balance.rivals[P.rivalIndex].kBase * 0.9;
      return band(Math.log(P.threshold / r.c) / k, m);
    }
    case 'grid_power': {
      if ((state.energyProd || 0) > P.mw) return 0.9;
      return state.tier <= 4 ? 0.7 : 0.3; // still scaling vs plateaued
    }
    case 'major_incident': {
      const G = computeGap(state, balance);
      return Math.min(0.7, 0.2 + 0.15 * state.tier * Math.max(0, G - 0.8));
    }
    case 'fusion_before_t6': return state.tier >= 4 ? 0.65 : 0.45;
    case 'trust_above':
      return state.trust > P.x + 8 ? 0.8 : state.trust > P.x - 8 ? 0.5 : 0.2;
    case 'coordination_above': return state.buildings.some((b) => b.type === 'policy') ? 0.6 : 0.25;
    case 'chips_installed': {
      // The buildout keeps growing: count fabs under construction and assume
      // slots keep pace. Installed chips are capped by datacenter slots.
      const fabs = state.buildings.filter((x) => x.type === 'fab').length;
      const dcs = state.buildings.filter((x) => x.type === 'datacenter').length;
      const slotsProjected = (dcs + m / 3) * balance.buildings.datacenter.chipSlots;
      const gain = (fabs + 0.5) * balance.buildings.fab.chipsPerMo * m * 0.8;
      let have = state.chips;
      for (const x of state.buildings) if (x.type === 'datacenter') have += x.chips;
      if (P.n > slotsProjected) return 0.2;
      return band(P.n, have + gain);
    }
    case 'treaty_signed':
      return state.treatySigned ? 0.95 : state.trust > 62 && state.coordination > 40 ? 0.55 : 0.2;
    case 'capital_above': {
      const proj = state.capital + (state.income || 1) * m * 0.6;
      return proj > P.x ? 0.7 : 0.25;
    }
    default: return 0.5;
  }
}

export const strategies = { greedy, balanced, safety };
