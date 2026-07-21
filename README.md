# THE ABUNDANCE MACHINE

*A factory-strategy outro game where the win condition is an aligned
superintelligence — and the Dyson swarm is the credits sequence.*

Built to the spec in [`the-abundance-machine-design-doc.md`](the-abundance-machine-design-doc.md).
One run is one outro: 10–15 minutes, in the browser, no install, no build step.

## Play

Serve the folder statically and open it:

```
npm run serve        # python3 -m http.server 8000
# → http://localhost:8000
```

Or deploy the whole folder as-is to itch.io / GitHub Pages — it's plain ES
modules + Canvas 2D with zero dependencies.

## The game in one paragraph

Capital buys power; power feeds fabs and datacenters; datacenters turn chips
into compute; compute plus data becomes capability, which compounds — every
tier crossed deflates all future costs by 12%, so the machine accelerates
itself. But capability only *ships* through review gates that consume
**assurance**, and assurance is produced linearly by people in offices — until
you've proven trustworthy enough to let AI help oversee AI, at which point
oversight finally gets its own exponential. The whole game is the vertical
distance between two curves on one chart.

## How to play

- **The Ledger** (top) is the HUD: your capability curve (red), your assurance
  curve (teal), rivals (grey, uncertain unless you buy intel), and the shaded
  gap between them — the danger you're managing.
- **Build** from the left palette onto the grid. Links route automatically.
- **The C/A slider** in the bottom bar is your throttle — the most important
  control in the game.
- **Review gates** pause the run at each capability tier: pass (spend
  assurance), force through (fast, remembered), or hold.
- **Forecast cards** are Brier-scored; calibration earns Foresight, which buys
  real power.
- **Diplomacy** (Policy Desk) raises global Coordination. You need ≥ 60 at the
  final gate — or a rival crossing first becomes everyone's problem.
- Win by crossing Tier 7 with the lights on. There are five endings; four of
  them teach you something.

## Headless simulator & tests

The sim is deterministic, DOM-free, and runs under node:

```
npm run simulate -- --seed=1 --strategy=balanced   # one run, JSON summary
npm run simulate -- --sweep --seeds=20             # 3 strategies × 20 seeds
npm test                                           # acceptance tests
```

Every balance number lives in `data/balance.json`; strings in
`data/strings.json`; the event deck and forecast templates in their own JSON.
Tune the JSON, re-run the sweep.

## The outro-song slot

Drop an `epilogue.mp3` into `/assets/` and the Dyson swarm assembles to it
instead of the generative swell. That's the point.

## Architecture

See [`CLAUDE.md`](CLAUDE.md). Fixed-timestep sim (250 ms tick = 1/28
game-month) decoupled from rendering; one plain serializable `GameState`;
seeded mulberry32 RNG; daily seed is date-hashed. The score is generative
WebAudio bound to sim state — tempo follows compute throughput, harmony
follows the gap.
