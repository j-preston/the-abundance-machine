# The Abundance Machine — engineering notes

A compressed factory/strategy game (one run ≈ 10–15 min) built to the spec in
`the-abundance-machine-design-doc.md`. Vanilla ES modules + Canvas 2D, zero
dependencies, no build step. Deploys as a static folder.

## Non-negotiable engineering rules

1. Fixed-timestep sim (250 ms sim tick = 1/28 game-month) fully decoupled from
   rAF rendering. The sim must produce identical results at any speed setting
   and any frame rate.
2. `GameState` is one plain serializable object. No class instances in state.
   Save = `JSON.stringify` to localStorage; daily seed = date-hashed.
3. All balance values load from `data/balance.json`. A test run with a fixed
   seed must be reproducible — edit JSON, not code, to tune.
4. Headless mode: `npm run simulate -- --seed=N --strategy=greedy|balanced|safety`
   runs the sim without rendering and prints the ending + month reached.
5. No external dependencies. (The design doc allows Tone.js; the score is
   implemented in raw WebAudio instead so the game is fully self-contained and
   works offline in itch.io embeds.) No TypeScript; JSDoc types on state and
   sim functions.
6. 60 fps target with 150 buildings; the Ledger redraws at 10 Hz, not per-frame.

## Layout

```
index.html style.css        UI shell
src/main.js                 boot, fixed-timestep loop, mode switch (menu/run/ending)
src/state.js                GameState factory + mulberry32 RNG + save/load + hash
src/sim/sim.js              tick orchestrator (economy → monthly systems)
src/sim/economy.js          resources, buildings, production tick
src/sim/tiers.js            capability tiers, review gates, gap, incidents
src/sim/rivals.js           rival curves, coordination, diplomacy
src/sim/forecasts.js        forecast card templates + Brier resolution
src/sim/events.js           event deck draw + effect interpreter
src/ui/ledger.js            the semi-log chart
src/ui/grid.js              build canvas: placement, links, pulses, sky
src/ui/panels.js            build palette, context cards, resource bar
src/ui/endings.js           five ending sequences + epilogue
src/audio/score.js          generative WebAudio score bound to state
data/*.json                 every number and string in the game
scripts/simulate.js         headless runner (node)
scripts/strategies.js       greedy / balanced / safety scripted players
scripts/test.js             acceptance tests
```

Sim modules are DOM-free and run unmodified under node (used by the headless
simulator and tests). UI-only randomness must never touch `state.rngState` —
sim determinism depends on it.

Demo mode (menu → WATCH THE DEMO) replays `strategies.balanced` on
`DEMO_SEED` in `src/main.js`, mirroring the headless driver's tick ordering so
the trajectory is identical to `npm run simulate -- --seed=5 --strategy=balanced`.
If balance changes, re-verify that seed still ends gold (or pick a new one)
before shipping.

## Acceptance tests (`npm test` — keep green)

- Sim determinism: same seed + same strategy ⇒ identical final state hash.
- Economy sanity: `balanced` on seed 1 reaches Tier 5 between 2032–2034.
- All five endings reachable by the three scripted strategies across seeds 1–20.

## Balance targets (design doc §11 — tune to these, not vibes)

- Greedy rush: Tier 6 fast, then Cascade ≥ 80% of the time.
- Pure-safety turtle: out-raced by a rival ≥ 70% of the time.
- Balanced competent play: gold ending ≈ 35% of runs; some ending in 100% of runs.
