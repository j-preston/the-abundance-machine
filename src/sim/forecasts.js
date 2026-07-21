// The Forecast Desk: template instantiation + Brier resolution.
import { rand, randInt } from '../state.js';

const T6 = 24300;

function installedChips(state) {
  let n = 0;
  for (const b of state.buildings) if (b.type === 'datacenter') n += b.chips;
  return n;
}

function tierThresholdAbove(balance, c) {
  for (let i = 0; i < balance.tiers.thresholds.length; i++) {
    if (balance.tiers.thresholds[i] > c) return { tier: i + 1, value: balance.tiers.thresholds[i] };
  }
  return null;
}

/** Current truth value of a card's proposition. */
function outcomeNow(state, balance, card) {
  const p = card.params;
  switch (card.tplId) {
    case 'rival_tier': {
      const r = state.rivals[p.rivalIndex];
      return r.c >= p.threshold;
    }
    case 'player_tier': return state.tier >= p.tier;
    case 'grid_power': return (state.energyProd || 0) > p.mw;
    case 'major_incident':
      return (state.lastMajorIncidentMonth ?? -1) >= card.askedMonth;
    case 'fusion_before_t6': return state.flags.fusionIgnited;
    case 'trust_above': return state.trust > p.x;
    case 'coordination_above': return state.coordination > p.x;
    case 'chips_installed': return installedChips(state) >= p.n;
    case 'treaty_signed': return state.treatySigned;
    case 'capital_above': return state.capital > p.x;
    default: return false;
  }
}

/** fusion_before_t6 has a special "race" resolution. */
function fusionRaceLost(state) {
  if (state.tier >= 6) return true;
  for (const r of state.rivals) if (r.c >= T6) return true;
  return false;
}

/** Build a card from an eligible template. Returns null if none fit. */
function generateCard(state, balance, templates) {
  const eligible = templates.filter((t) => {
    if (t.minTier && state.tier < t.minTier) return false;
    if (t.id === 'fusion_before_t6' && (state.flags.fusionIgnited || fusionRaceLost(state))) return false;
    if (t.id === 'treaty_signed' && state.treatySigned) return false;
    if (t.id === 'player_tier' && state.tier >= 7) return false;
    // Avoid duplicates of an active template.
    if (state.forecasts.active.some((c) => c.tplId === t.id)) return false;
    return true;
  });
  if (eligible.length === 0) return null;
  const tpl = eligible[randInt(state, eligible.length)];
  const months = tpl.params?.months
    ? tpl.params.months[0] + randInt(state, tpl.params.months[1] - tpl.params.months[0] + 1)
    : null;
  const card = {
    tplId: tpl.id,
    askedMonth: state.month,
    dueMonth: months != null ? state.month + months : 999,
    earlyResolve: !!tpl.earlyResolve,
    params: { months },
    p: null,
  };
  const P = card.params;
  switch (tpl.id) {
    case 'rival_tier': {
      P.rivalIndex = randInt(state, state.rivals.length);
      const r = state.rivals[P.rivalIndex];
      const next = tierThresholdAbove(balance, r.c * 1.25);
      if (!next) return null;
      P.tier = next.tier; P.threshold = next.value; P.rivalName = r.name;
      break;
    }
    case 'player_tier': P.tier = Math.min(7, state.tier + 1); break;
    case 'grid_power':
      P.mw = Math.max(200, Math.ceil(((state.energyProd || 0) * 1.5 + 100) / 100) * 100);
      break;
    case 'trust_above':
      P.x = Math.round(Math.max(20, Math.min(90, state.trust + rand(state) * 20 - 10)));
      break;
    case 'coordination_above':
      P.x = Math.round(Math.max(20, Math.min(90, state.coordination + 15)));
      break;
    case 'chips_installed':
      P.n = Math.round((installedChips(state) + 12) * 1.5);
      break;
    case 'capital_above':
      P.x = Math.max(5, Math.round(state.capital * 1.6));
      break;
  }
  card.text = renderText(tpl.text, P);
  return card;
}

function renderText(text, P) {
  return text
    .replace('{rival}', P.rivalName ?? '')
    .replace('{tier}', P.tier ?? '')
    .replace('{months}', P.months ?? '')
    .replace('{mw}', P.mw != null ? P.mw.toLocaleString('en-US') : '')
    .replace('{x}', P.x ?? '')
    .replace('{n}', P.n ?? '');
}

/** Player (or strategy) answers the pending card with probability p. */
export function answerForecast(state, p) {
  const card = state.forecasts.pendingCard;
  if (!card) return false;
  card.p = Math.max(0.05, Math.min(0.95, p));
  state.forecasts.active.push(card);
  state.forecasts.pendingCard = null;
  state.stats.forecastsAnswered++;
  state.paused = false;
  return true;
}

function resolveCard(state, balance, card, outcome) {
  const diff = balance.difficulties[state.difficulty];
  const b = (card.p - (outcome ? 1 : 0)) ** 2;
  const delta = Math.round((0.25 - b) * balance.forecasts.foresightScale * diff.foresightMult);
  state.foresight = Math.max(0, state.foresight + delta);
  state.brierSum += b; state.brierN++;
  card.resolved = state.month; card.outcome = outcome; card.brier = b; card.foresight = delta;
  state.forecasts.history.push(card);
  state.toasts.push({ kind: 'forecast', key: delta > 0 ? 'resolveGood' : 'resolveBad', f: delta, brier: b });
}

/** Monthly: resolve due cards, maybe deal a new one (auto-pauses). */
export function monthlyForecasts(state, balance, templates) {
  // Resolve.
  const still = [];
  for (const card of state.forecasts.active) {
    const now = outcomeNow(state, balance, card);
    if (card.tplId === 'fusion_before_t6') {
      if (now) resolveCard(state, balance, card, true);
      else if (fusionRaceLost(state)) resolveCard(state, balance, card, false);
      else still.push(card);
      continue;
    }
    if (card.earlyResolve && now) { resolveCard(state, balance, card, true); continue; }
    if (state.month >= card.dueMonth) { resolveCard(state, balance, card, now); continue; }
    still.push(card);
  }
  state.forecasts.active = still;

  // Deal.
  if (state.month >= state.forecasts.nextAt && !state.forecasts.pendingCard && !state.pendingEvent) {
    const card = generateCard(state, balance, templates);
    const f = balance.forecasts;
    const desk = state.buildings.some((x) => x.type === 'policy' && x.done);
    const interval = f.intervalMin + randInt(state, f.intervalMax - f.intervalMin + 1) - (desk ? f.policyDeskBonus : 0);
    state.forecasts.nextAt = state.month + Math.max(4, interval);
    if (card) {
      state.forecasts.pendingCard = card;
      state.paused = true;
    }
  }
}

/** Mean Brier score so far (0.25 = coin flips). */
export function meanBrier(state) {
  return state.brierN > 0 ? state.brierSum / state.brierN : null;
}
