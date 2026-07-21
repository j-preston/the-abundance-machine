// GameState factory, seeded RNG, save/load, hashing.
// Rule: GameState is ONE plain serializable object. No class instances.
// Sim determinism depends on state.rngState only being consumed by sim code.

/** Mulberry32 step. Mutates state.rngState, returns float in [0,1). */
export function rand(state) {
  let t = (state.rngState += 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  state.rngState = state.rngState >>> 0;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [0, n). */
export function randInt(state, n) {
  return Math.floor(rand(state) * n);
}

/** Hash a string to a uint32 (used for daily seeds). */
export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Daily seed from a Date. */
export function dailySeed(date) {
  const d = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
  return hashString(`abundance:${d}`);
}

/**
 * Create a fresh GameState.
 * @param {object} balance data/balance.json
 * @param {number} seed uint32
 * @param {string} difficulty straightLines|bitterLesson|hardTakeoff
 */
export function createState(balance, seed, difficulty = 'bitterLesson') {
  const b = balance;
  const state = {
    version: 1,
    seed: seed >>> 0,
    rngState: seed >>> 0,
    difficulty,

    t: 0,          // months, float
    month: 0,      // floor(t)
    speed: 1,      // 0=paused via `paused`, else 1/2/4
    paused: true,

    capital: b.start.capital,
    trust: b.start.trust,
    coordination: b.start.coordination,
    foresight: b.start.foresight,
    chips: b.start.chips,        // uninstalled chip stock
    data: b.start.data,          // curated data stock
    capability: b.start.capability,
    assurance: b.start.assurance,
    alloc: { ...b.start.alloc }, // {c, i, a} fractions summing to 1

    tier: 0,                     // tiers crossed (0..7)
    tierMonths: [],              // month each tier was crossed
    review: null,                // {tier, mode:'open'|'hold', barMult}
    nextBarMult: 1,              // event effect: next review bar discount
    forceUntil: -1,              // month until which incident mult applies
    forcedCount: 0,
    openIncidents: [],           // [{sev, month, closesAt}]
    incidentCount: { minor: 0, major: 0 },

    buildings: [],               // [{id,type,x,y,buildTime,progress,done,powered,chips,offlineUntil}]
    nextId: 1,
    fastTrackNext: false,

    deflation: 1,

    regulationUntil: -1,
    treatyUntil: -1,
    treatySigned: false,
    researchMult: 1,             // permanent event multipliers (player)
    rivalResearchMult: 1,
    officeRateAdd: 0,
    fabOutputMultUntil: -1, fabOutputMult: 1,
    dataFactorMultUntil: -1, dataFactorMult: 1,
    researchMultTempUntil: -1, researchMultTemp: 1,
    powerBuildDiscountUntil: -1, powerBuildDiscount: 1,
    fusionCostMult: 1,
    gapAddUntil: -1, gapAdd: 0,
    trustVolatilityUntil: -1,

    rivals: b.rivals.map((r) => ({
      key: r.key, name: r.name, c: r.startC, kMult: 1, boost: 0,
      crossedTier7: false,
    })),
    intelUntil: -1,              // foresight purchase: true curves visible
    evalsShared: false,          // permanent reveal

    diplo: { publish: -999, evals: -999, treaty: -999 }, // last-used month

    forecasts: { active: [], history: [], nextAt: b.forecasts.firstCardMonth, pendingCard: null },
    brierSum: 0, brierN: 0,

    eventsDrawn: [],
    lastEventMonth: -999,
    pendingEvent: null,          // {id, title, text, choices?} awaiting UI/strategy

    flags: {
      gigawatt: false, fusionIgnited: false,
      firstToasts: {},
    },

    history: { months: [], c: [], a: [], g: [], rivals: b.rivals.map(() => []) },

    ending: null,                // {type, month}
    stats: { built: 0, sliderMoves: 0, forecastsAnswered: 0, peakMW: 0, spends: 0 },

    toasts: [],                  // UI consumes; sim only pushes strings
  };
  // Pre-placed Founding Lab (free).
  placeBuildingRaw(state, balance, 'lab', 480, 300, true);
  return state;
}

/**
 * Place a building without cost checks (used for founding lab / event freebies).
 * Returns the building object.
 */
export function placeBuildingRaw(state, balance, type, x, y, done = false) {
  const def = balance.buildings[type];
  const bld = {
    id: state.nextId++,
    type, x, y,
    buildTime: def.build,
    progress: done ? def.build : 0,
    done,
    powered: true,
    chips: 0,
    offlineUntil: -1,
  };
  state.buildings.push(bld);
  return bld;
}

/** Effective (deflated, discounted) cost of a building type right now. */
export function buildingCost(state, balance, type) {
  const def = balance.buildings[type];
  let cost = def.cost * state.deflation;
  if (type === 'fusion') cost *= state.fusionCostMult;
  return cost;
}

/** Serialize for saving. */
export function saveState(state) {
  return JSON.stringify(state);
}

/** Deserialize a save. */
export function loadState(json) {
  return JSON.parse(json);
}

/** Deterministic hash of the full state (for determinism tests). */
export function hashState(state) {
  return hashString(JSON.stringify(state));
}
