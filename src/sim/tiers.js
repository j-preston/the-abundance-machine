// Capability tiers, review gates, the Gap, incidents.
import { rand, randInt } from '../state.js';
import { applyTrust } from './economy.js';

/** Threshold the player is currently researching toward (null past T7). */
export function nextThreshold(state, balance) {
  if (state.tier >= 7) return null;
  return balance.tiers.thresholds[state.tier];
}

/** A-stock bar for the next review gate (with event discount). */
export function currentBar(state, balance) {
  if (state.tier >= 7) return 0;
  return balance.tiers.bars[state.tier] * state.nextBarMult;
}

/** Fractional progress through the current tier span, 0..1. */
export function tierFraction(state, balance) {
  const th = nextThreshold(state, balance);
  if (th == null) return 1;
  const prev = state.tier === 0 ? balance.start.capability : balance.tiers.thresholds[state.tier - 1];
  return Math.max(0, Math.min(1, (state.capability - prev) / (th - prev)));
}

/**
 * The Gap metric. G ≈ 1 means assurance is keeping pace with progress
 * through the current tier; G ≥ 2 near the top tiers is existential.
 */
export function computeGap(state, balance) {
  if (state.tier >= 7) return 0;
  const frac = tierFraction(state, balance);
  const aFrac = state.assurance / currentBar(state, balance);
  const eventAdd = state.month < state.gapAddUntil ? state.gapAdd : 0;
  return Math.min(balance.gap.gapMax, frac / Math.max(balance.gap.assuranceFloor, aFrac) + eventAdd);
}

/** Open a review gate if capability hit the next threshold. */
export function checkTierProgress(state, balance) {
  const th = nextThreshold(state, balance);
  if (th != null && !state.review && state.capability >= th) {
    state.capability = th;
    state.review = { tier: state.tier + 1, mode: 'open' };
    state.paused = true;
  }
}

/** Whether 'pass' is currently legal for the open review. */
export function canPassReview(state, balance) {
  if (!state.review) return false;
  const bar = currentBar(state, balance);
  if (state.assurance < bar) return false;
  if (state.review.tier === 7) {
    if (state.coordination < balance.tiers.finalCoordination) return false;
    if (state.openIncidents.length > 0) return false;
  }
  return true;
}

/**
 * Resolve an open review gate. choice: 'pass' | 'force' | 'hold'.
 * Returns true if the choice was applied.
 */
export function resolveReview(state, balance, choice) {
  if (!state.review) return false;
  const t = balance.tiers;
  if (choice === 'hold') {
    state.review.mode = 'hold';
    state.paused = false;
    return true;
  }
  if (choice === 'pass') {
    if (!canPassReview(state, balance)) return false;
    state.assurance -= currentBar(state, balance) * t.passBarSpend;
    applyTrust(state, balance, t.passTrust);
    advanceTier(state, balance, false);
    if (state.tier >= 7) state.ending = { type: 'gold', month: state.month };
    return true;
  }
  if (choice === 'force') {
    if (state.review.tier === 7) return false; // the final gate is the game
    applyTrust(state, balance, t.forceTrust);
    state.forceUntil = state.month + t.forceMonths;
    state.forcedCount++;
    state.toasts.push({ kind: 'warn', key: 'forced' });
    advanceTier(state, balance, true);
    return true;
  }
  return false;
}

function advanceTier(state, balance, forced) {
  state.tier++;
  state.tierMonths.push(state.month);
  state.marks.push({ m: state.month, kind: forced ? 'forced' : 'tier', tier: state.tier });
  state.deflation *= balance.economy.deflationPerTier;
  state.nextBarMult = 1;
  state.review = null;
  state.paused = false;
  state.toasts.push({ kind: 'tier', key: 'deflation', tier: state.tier });
}

/** Monthly incident roll. May set the cascade ending. */
export function monthlyIncidentRoll(state, balance, G) {
  const g = balance.gap;
  const diff = balance.difficulties[state.difficulty];
  const tier = state.tier;
  if (tier < 1) return;
  // While an incident is open, the world is watching and no new roll happens.
  if (state.openIncidents.length > 0) return;
  const forceMult = state.month < state.forceUntil ? balance.tiers.forceMultiplier : 1;
  const over = Math.max(0, G - g.healthyG);
  const P = g.incidentCoef * over * over * tier * tier * forceMult * diff.incidentMult;
  if (rand(state) >= P) return;

  if (G >= g.cascadeG && tier >= g.cascadeTier) {
    state.ending = { type: 'cascade', month: state.month };
    return;
  }
  state.marks.push({ m: state.month, kind: 'incident' });
  if (tier >= g.majorTier && G >= g.majorG) {
    applyTrust(state, balance, g.majorTrust);
    state.regulationUntil = state.month + g.regulationMonths;
    state.openIncidents.push({ sev: 'major', month: state.month, closesAt: state.month + g.majorOpenMonths });
    state.incidentCount.major++;
    state.lastMajorIncidentMonth = state.month;
    state.toasts.push({ kind: 'incident', key: 'major' });
  } else {
    applyTrust(state, balance, g.minorTrust);
    const dcs = state.buildings.filter((b) => b.type === 'datacenter' && b.done);
    if (dcs.length > 0) {
      const pick = dcs[randInt(state, dcs.length)];
      pick.offlineUntil = state.month + g.minorOfflineMonths;
    }
    state.openIncidents.push({ sev: 'minor', month: state.month, closesAt: state.month + g.minorOpenMonths });
    state.incidentCount.minor++;
    state.toasts.push({ kind: 'incident', key: 'minor' });
  }
}

/** Expire open incidents whose window has passed. */
export function expireIncidents(state) {
  state.openIncidents = state.openIncidents.filter((i) => i.closesAt > state.month);
}
