// Fixed-timestep tick orchestrator. One tick = balance.time.tickMonths of
// game time. Deterministic: identical inputs ⇒ identical states.
import { tickEconomy } from './economy.js';
import { checkTierProgress, computeGap, monthlyIncidentRoll, expireIncidents } from './tiers.js';
import { monthlyRivals } from './rivals.js';
import { monthlyForecasts } from './forecasts.js';
import { monthlyEvents } from './events.js';

/** True while a modal decision blocks sim time. */
export function isBlocked(state) {
  return !!(
    state.ending ||
    (state.review && state.review.mode === 'open') ||
    state.forecasts.pendingCard ||
    state.pendingEvent
  );
}

/**
 * Advance the sim by one fixed tick.
 * @param {object} state GameState
 * @param {object} data {balance, events, forecasts}
 */
export function simTick(state, data) {
  if (isBlocked(state)) return;
  const balance = data.balance;
  const dt = balance.time.tickMonths;

  tickEconomy(state, balance, dt);
  checkTierProgress(state, balance);

  if (state.trust <= 0 && !state.ending) {
    state.ending = { type: 'pulledPlug', month: state.month };
    return;
  }

  state.t += dt;
  const newMonth = Math.floor(state.t + 1e-9);
  if (newMonth > state.month) {
    state.month = newMonth;
    runMonth(state, data);
  }
}

function runMonth(state, data) {
  const balance = data.balance;
  expireIncidents(state);
  monthlyRivals(state, balance);
  if (state.ending) { sampleHistory(state, balance); return; }

  const G = computeGap(state, balance);
  monthlyIncidentRoll(state, balance, G);
  if (state.ending) { sampleHistory(state, balance); return; }

  monthlyForecasts(state, balance, data.forecasts.templates);
  monthlyEvents(state, balance, data.events);
  sampleHistory(state, balance);

  // Hard end of the timeline: the world crosses eventually, with or without you.
  if (state.month >= balance.time.totalMonths && !state.ending) {
    const safe = state.coordination >= balance.tiers.finalCoordination;
    state.ending = { type: safe ? 'risingTide' : 'silentRace', month: state.month, rival: 'the world' };
  }
}

function sampleHistory(state, balance) {
  const h = state.history;
  h.months.push(state.month);
  h.c.push(state.capability);
  h.a.push(state.assurance);
  h.g.push(computeGap(state, balance));
  for (let i = 0; i < state.rivals.length; i++) h.rivals[i].push(state.rivals[i].c);
}
