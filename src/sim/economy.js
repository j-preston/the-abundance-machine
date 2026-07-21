// Resources, buildings, production tick. Pure state-in/state-out, DOM-free.
import { placeBuildingRaw, buildingCost } from '../state.js';

const POWER_TYPES = ['solar', 'gas', 'fission', 'fusion'];

export function isPowerType(type) {
  return POWER_TYPES.includes(type);
}

/** Count of completed, non-offline buildings of a type. */
export function countDone(state, type) {
  let n = 0;
  for (const b of state.buildings) if (b.type === type && b.done) n++;
  return n;
}

/** Count of completed AND powered buildings of a type. */
export function countActive(state, type) {
  let n = 0;
  for (const b of state.buildings) if (b.type === type && b.done && b.powered) n++;
  return n;
}

/** Apply a trust delta, honoring election-year volatility. Clamps to [0,100]. */
export function applyTrust(state, balance, delta) {
  const vol = state.month < state.trustVolatilityUntil ? 2 : 1;
  state.trust = Math.max(0, Math.min(balance.trust.max, state.trust + delta * vol));
}

/** Can the player place this building type right now? */
export function canPlace(state, balance, type) {
  const def = balance.buildings[type];
  if (!def) return { ok: false, reason: 'unknown' };
  if (state.tier < def.unlockTier) return { ok: false, reason: 'locked' };
  if (def.max && state.buildings.filter((b) => b.type === type).length >= def.max) {
    return { ok: false, reason: 'max' };
  }
  if (def.gated) {
    const bar = balance.tiers.bars[Math.min(state.tier, 6)] * state.nextBarMult;
    if (state.openIncidents.length > 0 || state.assurance < bar) {
      return { ok: false, reason: 'gated' };
    }
  }
  if (state.capital < buildingCost(state, balance, type)) {
    return { ok: false, reason: 'capital' };
  }
  return { ok: true };
}

/** Purchase + place a building. Returns the building or null. */
export function buyBuilding(state, balance, type, x, y) {
  const check = canPlace(state, balance, type);
  if (!check.ok) return null;
  state.capital -= buildingCost(state, balance, type);
  const bld = placeBuildingRaw(state, balance, type, x, y, false);
  if (state.fastTrackNext) {
    bld.buildTime *= 0.5;
    state.fastTrackNext = false;
  }
  state.stats.built++;
  return bld;
}

/**
 * One fixed sim tick of the economy. dt is in game-months.
 * Caches derived values (energyProd, pf, ...) on state for UI/forecasts.
 */
export function tickEconomy(state, balance, dt) {
  const b = balance;
  const month = state.month;

  // --- construction ---
  const bays = countDone(state, 'robotics');
  const baySpeed = 1 / Math.pow(b.buildings.robotics.buildTimeMult, bays);
  const powerDiscount = month < state.powerBuildDiscountUntil ? 1 / state.powerBuildDiscount : 1;
  for (const bld of state.buildings) {
    if (bld.done) continue;
    const rate = baySpeed * (isPowerType(bld.type) ? powerDiscount : 1);
    bld.progress += dt * rate;
    if (bld.progress >= bld.buildTime) {
      bld.done = true;
      bld.progress = bld.buildTime;
      firstToast(state, bld.type);
      if (bld.type === 'fusion' && !state.flags.fusionIgnited) {
        state.flags.fusionIgnited = true;
        state.toasts.push({ kind: 'fusion', key: 'fusion' });
      }
    }
  }

  // --- energy: brownouts idle newest consumers first ---
  let prod = 0;
  for (const bld of state.buildings) {
    if (bld.done && isPowerType(bld.type)) prod += b.buildings[bld.type].powerOut;
  }
  const consumers = state.buildings
    .filter((x) => x.done && !isPowerType(x.type))
    .sort((p, q) => p.id - q.id);
  let used = 0;
  let brownout = false;
  for (const bld of consumers) {
    if (month < bld.offlineUntil) { bld.powered = false; continue; }
    const draw = b.buildings[bld.type].draw;
    if (used + draw <= prod) {
      used += draw;
      bld.powered = true;
    } else {
      bld.powered = false;
      brownout = true;
    }
  }
  state.energyProd = prod;
  state.energyUsed = used;
  if (used > state.stats.peakMW) state.stats.peakMW = used;
  if (brownout && !state.flags.firstToasts.brownout) {
    state.flags.firstToasts.brownout = true;
    state.toasts.push({ kind: 'warn', key: 'brownout' });
  }

  // Gigawatt campus moment.
  if (!state.flags.gigawatt && used >= b.economy.gigawattMW) {
    state.flags.gigawatt = true;
    const gasMW = countDone(state, 'gas') * b.buildings.gas.powerOut;
    const gasHeavy = gasMW / Math.max(1, prod) >= b.trust.gasHeavyFraction;
    applyTrust(state, b, gasHeavy ? b.trust.gasGigawattTrust : b.trust.cleanGigawattTrust);
    state.toasts.push({ kind: 'info', key: gasHeavy ? 'gigawattGas' : 'gigawattClean' });
  }

  // --- chips: fabs produce, datacenters install ---
  const fabMult = month < state.fabOutputMultUntil ? state.fabOutputMult : 1;
  state.chips += countActive(state, 'fab') * b.buildings.fab.chipsPerMo * fabMult * dt;
  for (const bld of state.buildings) {
    if (bld.type !== 'datacenter' || !bld.done) continue;
    const room = b.buildings.datacenter.chipSlots - bld.chips;
    if (room > 0 && state.chips > 0) {
      const put = Math.min(room, state.chips);
      bld.chips += put;
      state.chips -= put;
    }
  }

  // --- compute ---
  let pf = 0;
  for (const bld of state.buildings) {
    if (bld.type === 'datacenter' && bld.done && bld.powered) {
      pf += bld.chips / b.economy.chipsPerPF;
    }
  }
  state.pf = pf;
  const pfC = pf * state.alloc.c;
  const pfA = pf * state.alloc.a;
  state.pfC = pfC; state.pfA = pfA; state.pfI = pf * state.alloc.i;

  // --- data ---
  let dataRate = countActive(state, 'refinery') * b.buildings.refinery.dataPerMo;
  let synthFraction = 0;
  if (state.tier >= 3 && dataRate > 0) {
    const m = Math.min(b.economy.syntheticDataCap, 1 + b.economy.syntheticDataCoef * Math.sqrt(pf));
    synthFraction = (m - 1) / m;
    dataRate *= m;
  }
  state.synthFraction = synthFraction;
  state.data += dataRate * dt;
  const labs = countActive(state, 'lab');
  const demand = b.economy.dataDemandCoef * labs * Math.sqrt(pfC); // per month
  let satisfaction = 1;
  if (demand > 0) {
    const want = demand * dt;
    const got = Math.min(state.data, want);
    state.data -= got;
    satisfaction = got / want;
  }
  const dfMult = month < state.dataFactorMultUntil ? state.dataFactorMult : 1;
  const dataFactor = Math.pow(satisfaction, b.economy.dataFactorExp) * dfMult;
  state.dataFactor = dataFactor;

  // --- research (capability) ---
  const regMult = month < state.regulationUntil ? b.gap.regulationMult : 1;
  const treatyMult = month < state.treatyUntil ? b.coordination.treatyMult : 1;
  const tempMult = month < state.researchMultTempUntil ? state.researchMultTemp : 1;
  const rate =
    b.research.labCoef * labs * Math.sqrt(pfC) * dataFactor *
    Math.pow(b.research.tierMult, state.tier) *
    state.researchMult * tempMult * regMult * treatyMult;
  state.researchRate = rate;
  if (state.review && state.review.mode === 'hold') {
    state.assurance += rate * b.research.holdConversion * dt;
  } else if (!state.review) {
    state.capability += rate * dt;
  }

  // --- assurance ---
  const officeRate = (b.assurance.officeRate + state.officeRateAdd) * countActive(state, 'office');
  const wings = countActive(state, 'wing');
  const wingRate = wings > 0 ? b.assurance.wingCoef * Math.sqrt(pfA * wings) : 0;
  state.assuranceRate = officeRate + wingRate;
  state.assurance += (officeRate + wingRate) * dt;

  // --- trust drain from gas, slow recovery when the record is clean ---
  const gasN = countDone(state, 'gas');
  if (gasN > 0) applyTrust(state, b, (b.buildings.gas.trustPerYear / 12) * gasN * dt);
  if (state.openIncidents.length === 0 && state.trust < b.trust.recoveryCeiling) {
    state.trust = Math.min(b.trust.recoveryCeiling, state.trust + b.trust.recoveryPerMonth * dt);
  }

  // --- coordination decay ---
  state.coordination = Math.max(0, state.coordination - b.coordination.decayPerMonth * dt);

  // --- income ---
  const income =
    (b.economy.incomeBase + b.economy.incomePerTier * state.tier) *
    (b.economy.trustIncomeFloor + state.trust / 100);
  state.capital += income * dt;
  state.income = income;
}

function firstToast(state, type) {
  const map = { solar: 'firstSolar', fab: 'firstFab', datacenter: 'firstDC', lab: 'firstLab', office: 'firstOffice' };
  const key = map[type];
  if (key && !state.flags.firstToasts[key]) {
    state.flags.firstToasts[key] = true;
    state.toasts.push({ kind: 'hint', key });
  }
}
