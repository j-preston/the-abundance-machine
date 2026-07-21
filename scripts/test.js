#!/usr/bin/env node
// Acceptance tests (design doc §9). Run with: npm test
import { loadData, runGame } from './simulate.js';
import { hashState } from '../src/state.js';

const data = loadData();
let failures = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

// 1. Sim determinism: same seed + same strategy ⇒ identical final state hash.
{
  const a = runGame(data, 3, 'balanced');
  const b = runGame(data, 3, 'balanced');
  check('determinism (balanced, seed 3)', hashState(a.state) === hashState(b.state),
    `${hashState(a.state)} vs ${hashState(b.state)}`);
  const c = runGame(data, 7, 'greedy');
  const d = runGame(data, 7, 'greedy');
  check('determinism (greedy, seed 7)', hashState(c.state) === hashState(d.state));
}

// 2. Economy sanity: balanced on seed 1 reaches Tier 5 between 2032–2034.
{
  const r = runGame(data, 1, 'balanced');
  const t5 = r.state.tierMonths[4]; // month Tier 5 was crossed
  const inWindow = t5 != null && t5 >= 60 && t5 < 96;
  check('economy sanity: balanced seed 1 reaches T5 in 2032–2034', inWindow,
    t5 != null ? `T5 at month ${t5} (${2027 + Math.floor(t5 / 12)})` : 'never reached T5');
}

// 3. All five endings reachable by the three scripted strategies, seeds 1–20.
{
  const seen = new Set();
  const tally = {};
  for (const strat of ['greedy', 'balanced', 'safety']) {
    tally[strat] = {};
    for (let seed = 1; seed <= 20; seed++) {
      const r = runGame(data, seed, strat);
      seen.add(r.ending);
      tally[strat][r.ending] = (tally[strat][r.ending] || 0) + 1;
    }
  }
  for (const e of ['gold', 'risingTide', 'cascade', 'silentRace', 'pulledPlug']) {
    check(`ending reachable: ${e}`, seen.has(e));
  }
  // §11 balance targets (soft, but asserted at generous bounds).
  const g = tally.greedy, s = tally.safety;
  check('greedy cascades ≥ 60% (target ≥ 80%)', (g.cascade || 0) >= 12, JSON.stringify(g));
  check('safety out-raced ≥ 70%', ((s.silentRace || 0) + (s.risingTide || 0)) >= 14, JSON.stringify(s));
  const b = tally.balanced;
  check('balanced wins (gold+risingTide) ≥ 60%', ((b.gold || 0) + (b.risingTide || 0)) >= 12, JSON.stringify(b));
  console.log('  tally:', JSON.stringify(tally));
}

// 4. Every run terminates with an ending by month 120.
{
  let allEnded = true;
  for (let seed = 21; seed <= 26; seed++) {
    for (const strat of ['greedy', 'balanced', 'safety']) {
      const r = runGame(data, seed, strat);
      if (!r.state.ending || r.ending === 'timeout') allEnded = false;
    }
  }
  check('all runs end by Dec 2036 (seeds 21–26 × 3 strategies)', allEnded);
}

console.log(failures === 0 ? '\nAll acceptance tests green.' : `\n${failures} test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
