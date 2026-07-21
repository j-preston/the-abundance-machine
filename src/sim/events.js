// Event deck: seeded draws, condition gates, effect interpreter.
import { rand, randInt, placeBuildingRaw } from '../state.js';
import { applyTrust } from './economy.js';

function era(month) {
  return month < 36 ? 1 : month < 84 ? 2 : 3;
}

function countType(state, type) {
  return state.buildings.filter((b) => b.type === type && b.done).length;
}

function conditionMet(state, balance, cond) {
  if (!cond) return true;
  if (cond.minTrust != null && state.trust < cond.minTrust) return false;
  if (cond.maxTrust != null && state.trust > cond.maxTrust) return false;
  if (cond.minTier != null && state.tier < cond.minTier) return false;
  if (cond.minCapital != null && state.capital < cond.minCapital) return false;
  if (cond.maxCoordination != null && state.coordination > cond.maxCoordination) return false;
  if (cond.forcedAny && state.forcedCount === 0) return false;
  if (cond.forcedNone && state.forcedCount > 0) return false;
  if (cond.syntheticHeavy && (state.synthFraction || 0) < balance.economy.syntheticFractionThreshold) return false;
  if (cond.minBuildings) {
    for (const [type, n] of Object.entries(cond.minBuildings)) {
      if (countType(state, type) < n) return false;
    }
  }
  return true;
}

/** Apply an event's effects object to state. */
export function applyEffects(state, balance, fx) {
  if (!fx) return;
  const dur = fx.durationMonths ?? 0;
  if (fx.trust) applyTrust(state, balance, fx.trust);
  if (fx.coordination) state.coordination = Math.max(0, Math.min(100, state.coordination + fx.coordination));
  if (fx.capital) state.capital = Math.max(0, state.capital + fx.capital);
  if (fx.assurance) state.assurance += fx.assurance;
  if (fx.data) state.data += fx.data;
  if (fx.foresight) state.foresight = Math.max(0, state.foresight + fx.foresight);
  if (fx.researchMult) state.researchMult *= fx.researchMult;
  if (fx.rivalResearchMult) for (const r of state.rivals) r.kMult *= fx.rivalResearchMult;
  if (fx.rivalBoost) for (const r of state.rivals) r.boost += fx.rivalBoost;
  if (fx.officeRateAdd) state.officeRateAdd += fx.officeRateAdd;
  if (fx.nextBarMult) state.nextBarMult *= fx.nextBarMult;
  if (fx.fusionCostMult) state.fusionCostMult *= fx.fusionCostMult;
  if (fx.trustVolatility) state.trustVolatilityUntil = state.month + dur;
  if (fx.fabOutputMult) { state.fabOutputMult = fx.fabOutputMult; state.fabOutputMultUntil = state.month + dur; }
  if (fx.dataFactorMult) { state.dataFactorMult = fx.dataFactorMult; state.dataFactorMultUntil = state.month + dur; }
  if (fx.researchMultTemp) { state.researchMultTemp = fx.researchMultTemp; state.researchMultTempUntil = state.month + dur; }
  if (fx.powerBuildDiscount) { state.powerBuildDiscount = fx.powerBuildDiscount; state.powerBuildDiscountUntil = state.month + dur; }
  if (fx.gapAdd) { state.gapAdd = fx.gapAdd; state.gapAddUntil = state.month + dur; }
  if (fx.regulationMonths) {
    state.regulationUntil = Math.max(state.regulationUntil, state.month + fx.regulationMonths);
    state.lastMajorIncidentMonth = state.month; // a global near-miss counts as news
  }
  if (fx.freeBuilding) {
    const n = state.buildings.length;
    const x = 200 + (n % 8) * 90, y = 520 + Math.floor(n / 8) * 70;
    placeBuildingRaw(state, balance, fx.freeBuilding, x, y, true);
  }
  if (fx.randomDCOffline) {
    const dcs = state.buildings.filter((b) => b.type === 'datacenter' && b.done);
    if (dcs.length > 0) dcs[randInt(state, dcs.length)].offlineUntil = state.month + fx.randomDCOffline;
  }
}

/** Player (or strategy) picks a choice index on the pending event. */
export function chooseEvent(state, balance, index) {
  const ev = state.pendingEvent;
  if (!ev) return false;
  const choice = ev.choices[index];
  if (!choice) return false;
  applyEffects(state, balance, choice.effects);
  state.pendingEvent = null;
  state.paused = false;
  return true;
}

/** Monthly deck check: maybe draw one event. */
export function monthlyEvents(state, balance, deck) {
  const cfg = balance.events;
  if (state.month < cfg.checkFrom) return;
  if (state.pendingEvent || state.forecasts.pendingCard || state.review?.mode === 'open') return;
  if (state.month - state.lastEventMonth < cfg.minGapMonths) return;
  if (rand(state) >= cfg.perMonthChance) return;

  const e = era(state.month);
  const eligible = deck.events.filter(
    (ev) => ev.era.includes(e) && !state.eventsDrawn.includes(ev.id) && conditionMet(state, balance, ev.condition)
  );
  if (eligible.length === 0) return;
  const ev = eligible[randInt(state, eligible.length)];
  state.eventsDrawn.push(ev.id);
  state.lastEventMonth = state.month;

  if (ev.choices) {
    const choices = ev.choices.filter(
      (c) => !c.requires || (c.requires.minCapital == null || state.capital >= c.requires.minCapital)
    );
    state.pendingEvent = { id: ev.id, title: ev.title, text: ev.text, choices };
    state.paused = true;
  } else {
    applyEffects(state, balance, ev.effects);
    state.toasts.push({ kind: 'event', id: ev.id, title: ev.title, text: ev.text });
  }
}
