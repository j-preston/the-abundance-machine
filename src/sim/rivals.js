// Rival labs, coordination, diplomacy. No sabotage — cooperation vs speed only.
import { rand } from '../state.js';
import { applyTrust } from './economy.js';

const T7 = 72900;

/** Monthly rival capability step. May set risingTide/silentRace endings. */
export function monthlyRivals(state, balance) {
  const diff = balance.difficulties[state.difficulty];
  const rules = balance.rivalRules;
  const regMult = state.month < state.regulationUntil ? balance.gap.regulationMult : 1;
  const treatyMult = state.month < state.treatyUntil ? balance.coordination.treatyMult : 1;
  const drag = 1 - rules.coordSafetyDrag * (state.coordination / 100);

  for (let i = 0; i < state.rivals.length; i++) {
    const r = state.rivals[i];
    const cfg = balance.rivals[i];
    if (r.crossedTier7) { rand(state); continue; } // keep RNG cadence stable

    const noise = 1 + cfg.noise * (rand(state) * 2 - 1);
    let opp = 1;
    if (cfg.opportunist) {
      const h = state.history;
      const n = h.c.length;
      if (n > rules.opportunistWindow) {
        const ago = h.c[n - 1 - rules.opportunistWindow];
        const growth = state.capability / Math.max(1, ago);
        const bar = Math.exp(cfg.kBase * rules.opportunistWindow * rules.opportunistRatio);
        if (growth < bar) opp = cfg.opportunistMult;
      }
    }
    const k = cfg.kBase * noise * diff.rivalMult * drag * regMult * treatyMult * opp * r.kMult;
    r.c *= Math.exp(k) * (1 + r.boost);
    r.boost = 0;

    if (r.c >= T7) {
      r.crossedTier7 = true;
      if (!state.ending) {
        const safe = state.coordination >= balance.tiers.finalCoordination;
        state.ending = { type: safe ? 'risingTide' : 'silentRace', month: state.month, rival: r.name };
      }
    }
  }
}

/** Rivals' effective assurance share (for UI): base × (0.5 + Coordination/100). */
export function rivalAssurance(state, balance, i) {
  return balance.rivals[i].assuranceBase * (0.5 + state.coordination / 100);
}

/** 0..1 — how much of the rivals' true curves the player can see. */
export function revealLevel(state, balance) {
  if (state.evalsShared || state.month < state.intelUntil) return 1;
  return Math.min(1, (state.pfI || 0) / balance.rivalRules.revealIntelPF);
}

function hasPolicyDesk(state) {
  return state.buildings.some((b) => b.type === 'policy' && b.done);
}

/** Which diplomacy actions are currently available, with reasons. */
export function diplomacyStatus(state, balance) {
  const c = balance.coordination;
  const desk = hasPolicyDesk(state);
  const cd = (key) => state.month - state.diplo[key] >= c.diploCooldown;
  return {
    desk,
    publish: { ok: desk && cd('publish'), cooldown: !cd('publish') },
    evals: {
      ok: desk && cd('evals') && state.assurance >= c.evalsCostA,
      cooldown: !cd('evals'), needA: state.assurance < c.evalsCostA,
    },
    treaty: {
      ok: desk && cd('treaty') && state.trust >= c.treatyTrustReq &&
          state.coordination >= c.treatyCoordReq && !state.treatySigned,
      cooldown: !cd('treaty'),
      needTrust: state.trust < c.treatyTrustReq,
      needCoord: state.coordination < c.treatyCoordReq,
      done: state.treatySigned,
    },
  };
}

/** Perform a diplomacy action: 'publish' | 'evals' | 'treaty'. */
export function doDiplomacy(state, balance, action) {
  const st = diplomacyStatus(state, balance);
  if (!st[action] || !st[action].ok) return false;
  const c = balance.coordination;
  if (action === 'publish') {
    const prev = state.tier === 0 ? balance.start.capability : balance.tiers.thresholds[state.tier - 1];
    state.capability -= (state.capability - prev) * c.publishCost;
    state.coordination = Math.min(100, state.coordination + c.publishCoord);
    applyTrust(state, balance, c.publishTrust);
  } else if (action === 'evals') {
    state.assurance -= c.evalsCostA;
    state.coordination = Math.min(100, state.coordination + c.evalsCoord);
    state.evalsShared = true;
  } else if (action === 'treaty') {
    state.treatyUntil = state.month + c.treatyMonths;
    state.treatySigned = true;
    state.coordination = Math.min(100, state.coordination + c.treatyCoord);
  }
  state.diplo[action] = state.month;
  return true;
}

/** Spend Foresight: 'fastTrack' | 'investor' | 'intel' | 'policyWindow'. */
export function spendForesight(state, balance, what) {
  const f = balance.foresightSpends;
  const cost = { fastTrack: f.fastTrack, investor: f.investor, intel: f.intel, policyWindow: f.policyWindow }[what];
  if (cost == null || state.foresight < cost) return false;
  if (what === 'fastTrack' && state.fastTrackNext) return false;
  state.foresight -= cost;
  state.stats.spends++;
  if (what === 'fastTrack') state.fastTrackNext = true;
  else if (what === 'investor') state.capital += f.investorCapital;
  else if (what === 'intel') state.intelUntil = state.month + f.intelMonths;
  else if (what === 'policyWindow') {
    // Refresh the diplomacy action that has been on cooldown the longest.
    let best = null;
    for (const key of ['publish', 'evals', 'treaty']) {
      if (key === 'treaty' && state.treatySigned) continue;
      if (state.month - state.diplo[key] < balance.coordination.diploCooldown) {
        if (best == null || state.diplo[key] < state.diplo[best]) best = key;
      }
    }
    if (best == null) { state.foresight += cost; state.stats.spends--; return false; }
    state.diplo[best] = -999;
  }
  return true;
}
