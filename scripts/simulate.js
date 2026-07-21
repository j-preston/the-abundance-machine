#!/usr/bin/env node
// Headless simulator: npm run simulate -- --seed=N --strategy=greedy|balanced|safety
// Sweep mode:        npm run simulate -- --sweep [--seeds=20] [--difficulty=bitterLesson]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createState, hashState } from '../src/state.js';
import { simTick, isBlocked } from '../src/sim/sim.js';
import { meanBrier } from '../src/sim/forecasts.js';
import { strategies } from './strategies.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadData() {
  const read = (f) => JSON.parse(readFileSync(join(root, 'data', f), 'utf8'));
  return {
    balance: read('balance.json'),
    events: read('events.json'),
    forecasts: read('forecasts.json'),
  };
}

/**
 * Run one full headless game.
 * @returns {{state: object, ending: string, month: number}}
 */
export function runGame(data, seed, strategyName, difficulty = 'bitterLesson') {
  const strategy = strategies[strategyName];
  if (!strategy) throw new Error(`unknown strategy: ${strategyName}`);
  const state = createState(data.balance, seed, difficulty);
  state.paused = false;
  let lastStrategyMonth = -1;
  let guard = 0;

  while (!state.ending && guard++ < 200000) {
    if (isBlocked(state)) {
      if (state.review && state.review.mode === 'open') strategy.review(state, data);
      else if (state.forecasts.pendingCard) strategy.forecast(state, data);
      else if (state.pendingEvent) strategy.event(state, data);
      continue;
    }
    if (state.month > lastStrategyMonth) {
      lastStrategyMonth = state.month;
      strategy.monthly(state, data);
      // A held review can be re-decided as conditions change.
      if (state.review && state.review.mode === 'hold') strategy.review(state, data);
    }
    simTick(state, data);
  }
  if (!state.ending) state.ending = { type: 'timeout', month: state.month };
  return { state, ending: state.ending.type, month: state.ending.month };
}

function monthName(m, balance) {
  const y = balance.time.startYear + Math.floor(m / 12);
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m % 12];
  return `${mo} ${y}`;
}

function summarize(r, data) {
  const s = r.state;
  const brier = meanBrier(s);
  return {
    ending: r.ending,
    month: r.month,
    date: monthName(Math.min(r.month, 119), data.balance),
    tier: s.tier,
    capability: Math.round(s.capability),
    assurance: Math.round(s.assurance),
    trust: Math.round(s.trust),
    coordination: Math.round(s.coordination),
    forced: s.forcedCount,
    incidents: s.incidentCount.minor + s.incidentCount.major,
    brier: brier != null ? brier.toFixed(3) : '—',
    buildings: s.buildings.length,
    hash: hashState(s),
  };
}

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] ?? true;
  }
  return args;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = parseArgs();
  const data = loadData();
  const difficulty = args.difficulty || 'bitterLesson';

  if (args.sweep) {
    const seeds = Number(args.seeds || 20);
    const tally = {};
    for (const name of Object.keys(strategies)) {
      tally[name] = {};
      const months = [];
      for (let seed = 1; seed <= seeds; seed++) {
        const r = runGame(data, seed, name, difficulty);
        tally[name][r.ending] = (tally[name][r.ending] || 0) + 1;
        months.push(r.month);
        if (args.verbose) {
          const s = summarize(r, data);
          console.log(`${name.padEnd(9)} seed ${String(seed).padStart(2)}: ${s.ending.padEnd(11)} ${s.date}  T${s.tier}  A=${s.assurance} coord=${s.coordination} trust=${s.trust} G-incidents=${s.incidents} brier=${s.brier}`);
        }
      }
      const avg = Math.round(months.reduce((a, b) => a + b, 0) / months.length);
      console.log(`${name.padEnd(9)} → ${JSON.stringify(tally[name])}  avg end month ${avg} (${monthName(Math.min(avg, 119), data.balance)})`);
    }
  } else {
    const seed = Number(args.seed ?? 1);
    const strategyName = args.strategy || 'balanced';
    const r = runGame(data, seed, strategyName, difficulty);
    console.log(JSON.stringify(summarize(r, data), null, 2));
  }
}
