# THE ABUNDANCE MACHINE
### An outro game for Moonshots — Design Document v1.0
*A factory-strategy game where the win condition is an aligned superintelligence — and the Dyson swarm is the credits sequence.*

---

## 0. One-Page Pitch (read this first)

**Genre:** Compressed factory/strategy game in the vein of Dyson Sphere Program — one run is one outro (10–15 minutes), played in the browser, no install.

**The inversion:** Dyson Sphere Program wins by scaling raw output forever. *The Abundance Machine* makes pure scaling a losing strategy. You build the classic exponential stack — energy → fabs → datacenters → frontier training runs — but every capability tier gates behind a second, worse-scaling resource: **assurance** (interpretability, evals, red-teaming, audit provenance). Compute compounds; oversight grows linearly unless you invest in automating it — which requires trusted AI, creating the game's central bootstrapping problem.

**The signature:** The HUD *is* a live log plot — "The Ledger of Straight Lines." Your capability curve, your assurance curve, and your rivals' curves, all drawn in real time on semi-log graph paper across the top of the screen. The shaded region between capability and assurance is the danger you are managing. The entire game is legible in one glance at one chart. (The law of straight lines, playable.)

**Win:** Cross the recursive self-improvement threshold with assurance above the bar and global coordination high enough that nobody races past you recklessly. The payoff: the epilogue. The machine you built starts building itself — fusion ignites, launch loops spin up, and a Dyson swarm assembles around the sun while your run's stats roll like film credits and the music swells. The sphere isn't the goal; it's the reward for getting the hard part right. **The epilogue is literally designed to be played over a podcast outro.**

**Also win:** If a *rival* lab crosses first — but crosses safely because of the evals you published and the coordination you funded — you get the "Rising Tide" ending. It's not a zero-sum race game. The world winning is you winning. (Abundance mindset, encoded in the victory conditions.)

**Lose (three ways, all thematic):**
1. **The Cascade** — capability outran assurance at the threshold; your own system defects.
2. **The Silent Race** — a rival crossed first with a low-assurance system while you dawdled.
3. **Pulled Plug** — you cut corners publicly, trust collapsed, governance shut down your compute.

**Built with:** Claude Code, vanilla JS + Canvas, generative WebAudio score, zero external assets, deployable to itch.io or GitHub Pages as a single link. Estimated build cost: $60–120 in API spend (budget cap $200, plan in §10).

---

## 1. Why This Fits Moonshots

The show's recurring motifs, translated directly into mechanics:

| Show motif | Game mechanic |
|---|---|
| The law of straight lines | The Ledger — the log-plot HUD that is the game's centerpiece |
| The bitter lesson / brute-force scaling | Scaling *works* in-game — capability research scales with compute. The question is never "does scaling work," it's "does oversight keep up" |
| Gigawatt datacenters, coherent power | Energy is the root of the tech tree; the mid-game is a power buildout race |
| 40x deflation / abundance economics | Every tier crossed deflates your build costs — the abundance flywheel is a core economic loop |
| US–China / lab-vs-lab race dynamics | Rival labs on the same chart, with diplomacy instead of sabotage |
| Optimism as a discipline, not a mood | The optimistic ending must be *earned* through mechanics, not assumed |
| Forecasting culture (Wissner-Gross extrapolation segments) | The Forecast Desk — Brier-scored prediction cards that reward calibration with real in-game power |
| Weekly Suno outro song | The epilogue has a music slot: drop in that week's outro track and the Dyson swarm assembles to it |

The submission framing: *"You challenged listeners to make outro games instead of outro music videos. Here's one where the win screen is designed to be the outro."*

---

## 2. Design Pillars

1. **One run = one outro.** 10–15 minutes, bounded, replayable. A daily seed makes runs comparable ("what did you score on today's seed?").
2. **The chart is the game.** Every system must be legible on the Ledger. If a mechanic can't be seen as a curve, cut it or fold it into one that can.
3. **Scaling is real, and so is the gap.** Never punish the player for building big. Punish them for building big *blind*. The fantasy is competent, fast, safe — all three, through skill.
4. **Optimism is the hard mode reward.** Losses are quick, legible lessons. The gold ending should feel like the best ending in a strategy game the player has seen this year, because it's the whole point of the submission.
5. **Buildable by Claude Code for under $200.** Every scoping decision below serves this. No asset pipeline, no engine, no build step, deterministic sim, data-driven balance.

---

## 3. Run Structure & Player Experience

- **Timeline:** Game starts January 2027, hard-ends December 2036 (120 game-months).
- **Time scale:** 1 game month = 7 real seconds at 1× speed (run length ≈ 14 min if played to the end; typical wins land 2033–2035). Speed controls: pause / 1× / 2× / 4×. Pausing to think is free and encouraged — forecast cards and assurance reviews auto-pause.
- **Session arc:**
  - **Minutes 0–3 (Foundation era):** Place first solar farms, a fab, a datacenter, a lab. Learn the routing. First forecast card arrives.
  - **Minutes 3–8 (Scaling era):** The exponential kicks in. Power becomes the bottleneck. Rivals' curves start climbing the Ledger. First assurance review gate. First real gap decision: push through or invest in oversight.
  - **Minutes 8–13 (Threshold era):** Fusion, automated alignment researchers, treaty diplomacy, the final review. Tension peaks as three curves converge on the threshold line.
  - **Endgame:** One of five endings (§7), each under 45 seconds, each teaching its lesson visually.
- **Difficulty modes:** *Straight Lines* (forgiving, tutorial toasts on), *Bitter Lesson* (default), *Hard Takeoff* (rivals faster, incidents harsher, forecasts count double).

---

## 4. Systems Specification

### 4.1 Resources

| Resource | Symbol | What it is | How it flows |
|---|---|---|---|
| Capital | $ | Funding, in $B | Passive investor income (scales with tier × trust) + Foresight spends. All buildings cost Capital. |
| Energy | MW | Grid power | Produced by power buildings; consumed continuously by fabs/datacenters. Hard cap on operations — brownouts idle buildings, newest first. |
| Chips | ◧ | Accelerators | Produced by Fabs; installed into Datacenters (capacity-limited). |
| Compute | PF | Aggregate training/inference throughput | Datacenters convert powered chips into PF. Allocated by player between **Capability**, **Assurance**, and **Rival intel** via a three-way slider. |
| Data | ▤ | Curated training data | Refineries produce it; Capability research consumes it. Synthetic data (Tier 3 unlock) multiplies it with compute — with a quality-decay risk (see events). |
| Capability | C | Frontier progress | Accumulated by Labs. The red curve. Tiered (§4.3). |
| Assurance | A | Interpretability, evals, red-team hours, audit provenance | Accumulated by Assurance offices. The teal curve. Spent at review gates; stock also passively suppresses incident risk. |
| Trust | ♥ | Public/governance standing, 0–100 | Moves on events, publishing, incidents, energy mix. 0 = shutdown loss. Gates treaties (≥70). |
| Foresight | ✦ | Calibration currency | Earned only via Brier-scored forecasts (§4.6). Spent on permits, funding, intel, policy windows. |

**Starting state (Bitter Lesson):** $12B, 0 MW, Trust 60, one free "Founding Lab" pre-placed, tutorial forecast card queued.

### 4.2 Buildings

All buildings are placed on a free-form node canvas and auto-link to what they serve (no conveyor micro — links are drawn automatically to the nearest valid consumer within range; the player's spatial skill is in clustering and coverage, not belt-spaghetti). Build times in game-months; costs deflate 12% per capability tier crossed (**the abundance flywheel** — visible as a small "deflation ×0.88" toast at each tier, one of the podcast's favorite numbers made tactile).

| Building | Glyph | Cost | Build | Output | Draw | Notes |
|---|---|---|---|---|---|---|
| Solar Farm | ○ | $0.6B | 1 mo | 100 MW | — | Clean. No trust penalty. Cheap, land-hungry (large footprint radius). |
| Gas Turbine | ◔ | $0.9B | 1 mo | 250 MW | — | Fast power, but −0.4 Trust/yr while running. The tempting shortcut. |
| Fission Plant | ◉ | $2.5B | 4 mo | 600 MW | — | Tier 2 unlock. Steady, clean. |
| Fusion Plant | ☀ | $6B | 5 mo | 2,500 MW | — | Tier 5 unlock. Endgame power. Igniting your first fusion plant is a scripted "wonder" moment. |
| Chip Fab | □ | $2.5B | 3 mo | 12 ◧/mo | 60 MW | |
| Datacenter | ⬡ | $1.8B | 2 mo | hosts 24 ◧ → 1 PF per 2 ◧ | 120 MW | The workhorse. Gigawatt-campus achievement at 1,000 MW total draw. |
| Data Refinery | ▤ | $1.2B | 2 mo | 10 ▤/mo | 40 MW | |
| Frontier Lab | △ | $3B | 3 mo | converts allocated PF + ▤ → C | 30 MW | Research rate: `C/mo = 2.0 × labs × √(PF_alloc) × dataFactor`. `dataFactor = min(1, ▤_stock / ▤_demand)^0.5`. |
| Assurance Office | ⬠ | $1.5B | 2 mo | 6 A/mo each | 20 MW | **Linear.** This is the whole point. Ten offices = 60 A/mo, forever, while capability compounds. |
| Automated Alignment Wing | ⬠⁺ | $4B | 3 mo | A/mo = `4 × √(PF_alloc_A)` | 50 MW | Tier 4 unlock, **purchase gated**: requires zero open incidents and A-stock above current tier's bar. Trusted AI doing oversight — the bootstrap, earned. |
| Robotics Bay | ⧉ | $3B | 3 mo | −25% build times globally per bay (multiplicative, max 3) | 80 MW | Tier 5 unlock. Physical abundance feeding back into the build. |
| Policy Desk | ✦ | $0.8B | 1 mo | +1 forecast card frequency; treaty actions | 10 MW | Max 1. Unlocks the diplomacy panel. |

### 4.3 Capability Tiers & Review Gates

Seven tiers. Thresholds triple: **100, 300, 900, 2,700, 8,100, 24,300, 72,900** cumulative C.

| Tier | Name (flavor) | Assurance bar (A-stock required at gate) |
|---|---|---|
| 1 | Reliable Agents | 40 |
| 2 | Autonomous Coding | 100 |
| 3 | Novel Science (math falls) | 240 |
| 4 | Self-Directed Research | 560 |
| 5 | Economic Takeover Speed | 1,280 |
| 6 | Recursive Improvement (contained) | 2,900 |
| 7 | **The Threshold** | 6,400 + Coordination ≥ 60 + zero open incidents |

**Review gates:** On reaching a tier threshold, research pauses and a Review card appears (auto-pause). Options:
- **Pass review** (if A-stock ≥ bar): spend 50% of the bar from A-stock, advance, +3 Trust, deflation ticks.
- **Force through** (always available, except Tier 7): advance immediately, no A spent, but incident-risk multiplier ×3 for 12 months and −8 Trust. The player can always choose speed. The game just remembers.
- **Hold** (wait, keep researching adjacent — converts 30% of lab output to A while held).

Tier 7 has no force option. The final gate is the game.

### 4.4 The Gap & Incidents

- **Gap metric:** `G = C_progress_current_tier / (A_stock × w)` where `w` normalizes so G ≈ 1.0 means "healthy." Rendered on the Ledger as the shaded band between the red and teal curves — the single most important pixel-region in the game.
- **Monthly incident roll:** `P = 0.4% × max(0, G − 0.8)² × tierWeight × forceMultiplier`. tierWeight = tier². So a wide gap at Tier 2 is a news story; a wide gap at Tier 6 is existential.
- **Incident ladder:**
  - **Minor** (G modest): a deployed model misbehaves. −4 Trust, one random datacenter offline 2 months.
  - **Major** (G high, Tier ≥ 4): autonomous system causes real-world harm. −15 Trust, global regulation event (all labs −20% research 12 mo — including rivals; safety failures are a public good problem).
  - **Cascade** (G ≥ 2.0 at Tier ≥ 6): loss ending #1. No second roll. The Ledger's red curve visibly bends *away* from your control in the final animation.

### 4.5 Rivals & Coordination

Two rival labs, fictional, visible as thin curves on the Ledger:
- **Apex Dynamics** — commercial frontier lab. Fast, noisy curve, low intrinsic assurance investment.
- **Prometheus Initiative** — state-backed program. Slower but relentless; immune to Trust dynamics, accelerates if you slow down (they interpret hesitancy as opportunity).

Rivals run on scripted-plus-noise capability curves (seeded), with AI assurance behavior influenced by **global assurance climate**:

- **Coordination score (0–100):** rises when you publish safety research, share evals, sign treaties; decays slowly. Rivals' effective assurance = their base × (0.5 + Coordination/100).
- **Diplomacy actions** (Policy Desk, each once per ~year):
  - **Publish safety research:** −5% of your C progress (you gave away some lead), +12 Coordination, +4 Trust.
  - **Share eval suite:** costs 150 A-stock, +15 Coordination, reveals rivals' true curves (they're otherwise rendered with uncertainty bands — fog of war on a chart).
  - **Compute treaty** (Trust ≥ 70, Coordination ≥ 50): all labs' research −15% for 18 months, +20 Coordination. Buying time for the world.
- **No sabotage, no espionage attacks.** Deliberate omission; the design space is cooperation vs. speed, not dirty tricks. (This is the abundance-mindset constraint and it makes the game more interesting, not less — say so in the submission notes.)

**Rival crossing outcomes:** If a rival reaches Tier 7 first:
- Coordination ≥ 60 → **"Rising Tide"** secondary win (their system is aligned partly because of infrastructure you funded; epilogue plays with a variant title card).
- Coordination < 60 → **"The Silent Race"** loss.

### 4.6 The Forecast Desk (the Wissner-Gross mechanic)

Every 8–10 months (more with Policy Desk), an auto-pausing Forecast card asks for a probability on a resolvable in-game question, answered with a slider (5%–95%):

- "Will Apex cross Tier 4 within 8 months?"
- "Will your grid exceed 1 GW by 2031?"
- "Will a major incident occur anywhere globally in the next year?"
- "Will fusion ignite before any lab reaches Tier 6?"

On resolution: Brier score `b = (p − outcome)²`, and **Foresight earned = round((0.25 − b) × 40)** — positive only if you beat a coin flip. Running calibration is tracked and shown on the end screen ("Your Brier: 0.14 — superforecaster territory").

**Foresight spends** (this is why calibration is power, not flavor):
- **Fast-track permit** (6 ✦): next building's build time −50%.
- **Investor confidence** (8 ✦): +$3B immediately.
- **Rival intelligence** (5 ✦): 12 months of true-curve visibility.
- **Policy window** (10 ✦): one diplomacy action refreshes early.

Design note: forecast questions are generated from live sim state with seeded resolution logic — spec'd in `data/forecasts.json` as templates with parameter ranges, so Claude Code implements ~10 templates, not bespoke events.

### 4.7 Event Deck

Seeded, ~24 events in `data/events.json`, weighted by era. Examples (each ≤ 2 sentences of copy, one choice or none):
- **"Frontier math falls."** A rival's system proves a millennium-class theorem. All labs +10% research permanently. (Era 2)
- **"Gigawatt campus online."** First lab (maybe you) to 1 GW draw: +5 Trust if it's clean-powered, −3 if gas-heavy.
- **"Synthetic data drift."** If synthetic data > 60% of your diet: choose −20% dataFactor for 6 mo (retrain on curated) or keep speed with +0.2 G for 6 mo. (Polanyi's revenge — the tacit stuff isn't in the synthetic distribution.)
- **"Talent wave."** +1 free Assurance office if Trust ≥ 65.
- **"Election year."** Trust volatility doubles for 12 months.
- **"Open-weights release."** Coordination +8, all rivals +5% research. Double-edged, no choice — the world does things without you.

---

## 5. The Economy in One Paragraph (for the submission)

Capital buys power; power feeds fabs and datacenters; datacenters turn chips into compute; compute plus data becomes capability, which compounds — every tier crossed deflates all future costs by 12%, so the machine accelerates itself. But capability only *ships* through review gates that consume assurance, and assurance is produced linearly by people in offices — until you've proven trustworthy enough to let AI help oversee AI, at which point oversight finally gets its own exponential. The whole game is the vertical distance between two curves on one chart.

---

## 6. UI Layout

Desktop-first, playable on tablet; mobile gets a "best on desktop" toast but remains functional.

```
┌──────────────────────────────────────────────────────────────┐
│  THE LEDGER OF STRAIGHT LINES        [Jan 2031]  ⏸ 1× 2× 4×  │
│  (semi-log chart: C red, A teal, rivals thin grey w/ bands,  │
│   gap shaded amber→red, tier lines horizontal, dashed        │
│   Threshold line at top labeled "T7")                        │
├────────┬────────────────────────────────────┬────────────────┤
│ BUILD  │                                    │ CONTEXT        │
│ ○◔◉☀   │        THE GRID (canvas)           │ selected bldg /│
│ □⬡▤    │   node-and-link schematic,         │ review cards / │
│ △⬠⬠⁺   │   pulses flowing along links,      │ forecast desk /│
│ ⧉✦     │   sky gradient behind (see §7)     │ diplomacy      │
├────────┴────────────────────────────────────┴────────────────┤
│ $12.4B  ⚡ 840/1,100 MW  ◧ 96  PF 41 [C●━━━○━A]  ▤ 210      │
│ ♥ 71   ✦ 9   Coordination 54          A-stock 486 / bar 560  │
└──────────────────────────────────────────────────────────────┘
```

- The compute allocation slider (`[C●━━━○━A]`) lives in the resource bar — always one drag away. This is the player's throttle and the most-touched control in the game.
- Review/Forecast cards slide in from the right and auto-pause. Everything else is ambient.
- Zero modal tutorials. *Straight Lines* difficulty gets contextual one-line toasts; the first three minutes are self-teaching by build-menu unlock order.

---

## 7. Art Direction

**Concept: "Daylight Factory."** Every factory game is set at night — Factorio's murk, DSP's void. This one is set in daylight, because it's a game about the future going *well*. The single biggest visual choice: **the sky behind the grid brightens as you progress** — pre-dawn blue-grey at 2027, golden hour through the scaling era, clear noon blue as you approach the Threshold. Players will feel the run's progress in ambient light before they read a single number. In the Cascade loss, the sky doesn't darken — it *whites out*, overexposed. In the shutdown loss it simply stops changing.

**Register:** NASA Graphics Standards Manual (1975) meets a clean modern schematic — engineering optimism, drawn like it's inked on a technical drawing. Flat vector, crisp geometry, no gradients except the sky, no texture noise, no glow except link pulses.

**Palette (6 tokens):**
- `--paper`: #EDF2F4 (panel surfaces, near-white cool)
- `--ink`: #1B2A41 (linework, text — deep blueprint blue, *not* black)
- `--sky-dawn` → `--sky-noon`: #5C6F91 → #8FC1E3 (animated background ramp)
- `--capability`: #E4572E (the red curve — warm, urgent, not evil)
- `--assurance`: #17A398 (the teal curve)
- `--sun`: #F2B705 (energy, Foresight, the epilogue's star)

**Typography (Google Fonts, self-hosted for itch.io):**
- Display: **Archivo Expanded** (wide, engineered, all-caps for era titles and ending cards)
- Body/UI: **Archivo** regular
- Data/Ledger axes: **IBM Plex Mono** (every number in the game is Plex Mono — the Ledger should read like an instrument)

**Buildings:** geometric glyphs (the table in §4.2) rendered as 2px ink strokes with flat paper fills, each with one tiny kinetic tell when active — solar panels tilt with the sky-time, fab gates blink, datacenter hexes breathe, assurance pentagons rotate slowly. Links are 1px ink lines carrying colored pulses (gold = power, ink = chips, red = compute-to-capability, teal = compute-to-assurance). Reduced-motion media query stills everything except the Ledger.

**The epilogue (the outro):** Camera pulls up from your grid — the schematic recedes into a coastline, a hemisphere, a planet drawn in the same 2px ink style. Launch-loop arcs leave the surface. A ring of `--sun` gold panels assembles around a stylized sun, one panel per game-month you survived, snapping in on the beat of the music. Your run's stats roll credit-style in Plex Mono (final curves, Brier score, incidents: 0, months to Threshold, "cost of intelligence: −94%"). Closing title card in Archivo Expanded: **"THE MACHINE BUILDS THE MACHINE."** Then: *"Made for Moonshots. Your moonshot here."* Total: 40 seconds, loopable, and it's the piece you screenshot for the submission email.

---

## 8. Audio Direction

Fully generative, WebAudio (Tone.js), zero audio files — with one exception (below).

**The score is the sim, sonified:**
- **Pulse layer:** a soft synth ostinato whose tempo maps to total PF throughput (60 BPM idle → 132 BPM at gigawatt scale). The game literally speeds up musically as you scale.
- **Harmony layer:** keyed to the Gap. G ≤ 1: consonant pads, lydian-leaning (the "optimism" mode). G rising: pads thin out, a detuned drone fades in underneath. The player *hears* the curves diverging before they look up.
- **Chime grammar:** builds complete on a pentatonic pluck; tier crossings get a rising fourth; forecast resolutions play a two-note interval — major second if calibrated, tritone if not. Fusion ignition: one huge bloomed chord with a long tail (the wonder moment).
- **Endings:** Cascade = the pulse layer continues but the harmony drops out entirely (the machine runs on without you — more chilling than a minor chord). Shutdown = tape-stop. Wins = full ensemble swells into the epilogue.
- **Epilogue slot:** `epilogue.mp3`, if present in `/assets/`, replaces the generative swell — **the drop-in slot for that week's Suno outro song**, so the Dyson swarm assembles to the actual episode outro. Ship the itch.io build with the generative version; note the slot in the submission email.

Mix rules: −14 LUFS target, everything ducks under card-open SFX, master mute persistent in settings.

---

## 9. Technical Architecture (Claude Code build spec)

**Stack:** Vanilla ES modules + Canvas 2D + Tone.js (CDN pinned). **No build step, no framework, no bundler.** Rationale: eliminates toolchain debugging from the budget, makes every Claude Code session start instantly, and the whole game deploys as a folder to itch.io/GitHub Pages.

**Repo layout:**
```
/index.html
/style.css
/CLAUDE.md
/src/
  main.js          # boot, fixed-timestep loop, mode switch (menu/run/ending)
  state.js         # single serializable GameState object + seeded RNG (mulberry32)
  sim/
    economy.js     # resources, buildings, production tick
    tiers.js       # capability progress, gates, gap, incidents
    rivals.js      # rival curves, coordination
    forecasts.js   # template instantiation + Brier resolution
    events.js      # deck draw + effects
  ui/
    ledger.js      # the semi-log chart (own canvas)
    grid.js        # build canvas: placement, links, pulses, sky
    panels.js      # build palette, context cards, resource bar
    endings.js     # five ending sequences + epilogue
  audio/
    score.js       # Tone.js layers bound to state observers
/data/
  balance.json     # every number in §4 lives here, not in code
  events.json
  forecasts.json
  strings.json     # all copy
```

**Non-negotiable engineering rules (put these in CLAUDE.md verbatim):**
1. Fixed-timestep sim (250 ms sim tick = 1/28 game-month) fully decoupled from rAF rendering. The sim must produce identical results at any speed setting and any frame rate.
2. `GameState` is one plain serializable object. No class instances in state. Save = `JSON.stringify` to localStorage; daily seed = date-hashed.
3. All balance values load from `balance.json`. A test run with a fixed seed must be reproducible — this is the audit-friendly harness pattern, and it's also how you'll balance-tune cheaply (edit JSON, not code).
4. Headless mode: `npm run simulate -- --seed=N --strategy=greedy|balanced|safety` runs the sim without rendering and prints the ending + month reached. Claude Code uses this to self-playtest for pennies instead of you hand-testing every balance change. *(This is the single biggest budget-saver in the plan.)*
5. No dependencies beyond Tone.js. No TypeScript (skip the toolchain), but JSDoc types on state and sim functions.
6. 60 fps target with 150 buildings on a 2020 laptop; the Ledger redraws at 10 Hz, not per-frame.

**Acceptance tests per phase** (Claude Code should write and keep these green):
- Sim determinism: same seed + same input log ⇒ identical final state hash.
- Economy sanity: `balanced` strategy on seed 1 reaches Tier 5 between 2032–2034.
- All five endings reachable by the three scripted strategies across seeds 1–20.

---

## 10. Build Plan & Budget

Phased for Claude Code sessions; each phase ends with the game runnable and its acceptance tests green. Estimates assume Sonnet-class model for implementation with occasional stronger-model passes on design-sensitive files (ledger, endings, audio).

| Phase | Scope | Est. spend |
|---|---|---|
| 0 | Scaffold, state, RNG, fixed-timestep loop, headless simulate mode | $5–10 |
| 1 | Economy sim + grid canvas: place, link, produce, brownouts, resource bar | $15–25 |
| 2 | The Ledger + tiers, gates, gap, incidents | $10–20 |
| 3 | Rivals, coordination, diplomacy, event deck | $10–15 |
| 4 | Forecast Desk + all five endings + epilogue sequence | $15–25 |
| 5 | Generative score (Tone.js layers, chime grammar, ending audio) | $10–15 |
| 6 | Art pass to §7 spec (sky ramp, glyph animation, type, cards) | $10–20 |
| 7 | Balance via headless sweeps + hand playtests, difficulty modes, deploy | $10–20 |
| | **Total** | **$85–150** |

Under the $200 cap with headroom. Cost discipline rules: keep sessions single-phase; commit + `/clear` context between phases; let the headless simulator do playtesting; only escalate model tier for `ledger.js`, `endings.js`, and balance interpretation.

**Cut list if over budget (in order):** Robotics Bay → uncertainty bands on rival curves → event deck to 12 cards → 4× speed → generative harmony layer (keep pulse + chimes).

**Stretch (post-submission):** shareable end-card PNG with seed + Brier + curves; weekly seed leaderboard via itch.io comments; second map layout.

---

## 11. Balance Targets (tune to these, not to vibes)

- *Bitter Lesson*, competent play: gold ending ≈ 35% of runs, some ending by minute 15 in 100% of runs.
- Pure-capability rush (greedy strategy): should reach Tier 6 fast and then Cascade ≥ 80% of the time. The bitter lesson about the bitter lesson.
- Pure-safety turtle: should get out-raced by Prometheus ≥ 70% of the time. Slowness is not safety.
- Force-through should be *correct* roughly once per winning run (usually Tier 2 or 3) — a real tool, not a trap.
- Median winning Brier ≤ 0.20; Foresight should fund ~2 pivotal accelerations per run.
- The compute-allocation slider should move ≥ 8 times in a good run. If players set-and-forget it, the gap math needs sharpening.

---

## 12. Submission Package

1. **Playable link** (itch.io embed, works in the YouTube-description click-through).
2. **90-second capture:** 60s of mid-game (Ledger visible, curves converging) + the full 40s epilogue with the outro-song slot filled.
3. **One-paragraph pitch** (§5's economy paragraph + the inversion line from §0).
4. **This document**, for the "how it was made" angle: designed in conversation with Claude, built end-to-end by Claude Code for under $200 — which is itself a data point for the show's thesis about the collapsing cost of creation.

---

*The Abundance Machine — because the machine was never the sphere. The machine is the process that earns it.*
