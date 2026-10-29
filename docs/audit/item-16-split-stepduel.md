# Audit item 16: split `stepDuel`, one kill helper (design only)

Status: DESIGN ONLY, no code moves in this PR. Read against `src/fight/duel.ts` on main `22610bb` (870 lines; `stepDuel` is lines 325-869), plus the diffs of #289 (`mechanics-batch` f9dbf05) and #298 (`audit/sim-fixes` 7e0bc75). Line numbers below are main's; #289 adds about 10 lines inside `stepDuel` and #298 changes 3 lines in `wound()`, so every reference also quotes the code so it can be found after those merge. Code starts only after both merge.

## 0. Findings

- Kill sequence: **7 copies** (6 inline plus the one inside `wound()`). They do **not** all match: 5 differences (section 2). None is a bug that changes a fight, all are pinned by hashes, so the helper takes them as parameters.
- Gate 0 never reaches 5 of the 7 copies (breath, volley, both missile kills, shared HP): its configs have no missile weapon, no cone, no spell, no `incoming`. **Gate 0 alone cannot prove this refactor.** A differential test (section 4) is step 0 and is mandatory.
- #298's knock rounding is behind `KNOCK_ROUND` (off in a headless run; its own comment says forcing it moved 46 of 56 V1-vs-V3 rows), so it does not move the 56 Gate 0 rows. The refactor PRs must leave all 56 untouched and the 16 V3 pinned rows exactly as #298 leaves them.
- Riskiest step: splitting contact resolution (phase 3: the `stagger`/`wound`/`walledHit` closures, `continue` to `return`, the `rolled()` draw order), step 6.
- Order: differential test, `killed`, `carry`, tick context, end-of-tick phases, movement phases, contact resolution last. Each its own small PR, no behaviour change, no flag change.

## 1. Map of `stepDuel` (main 22610bb)

| # | Phase | Lines | Reads | Writes |
|---|---|---|---|---|
| H | Header: `tick`, `events`, `before`, `wall`; closure `stunned` (cc ladder); forced idle intent while a special winds up | 325-330 | `duel`, `intents`, `before[*].special`, `R` | `intents` (parameter reassigned), `f.cc` via `stunned` |
| T | Per-tick timers: the big `fighters = before.map(f => ({...f, age, stall, wound, chain, parryCooldown, skillCooldown(2), punish, critical, posture decay, postureRest, rest, exposed, evaded, counterWindow, buffer}))`, loops for poiseRest, specialRecover, unsheathed, down, kickCd/interruptCd/downCd, feintEdge; bind/disarm (338-343); poison (344) | 331-344 | `before`, `R`, `intents[i].action`, `legal(before[i],'kick')`, `tick` | `fighters` (the new copies; every later phase mutates these in place) |
| E | Early return when either side already has 0 health (carries `bands/roll/gambit/cast/radius/ccBase/crowd`) | 345 | `duel`, `before` | returns |
| L | Tick locals `gdraws`, `casts`, `hits`, `lastRoll`; closures `geared`, `crowded`, `rolled`, `rollTag`, `spend` | 346-365 | `duel.roll/gambit/cast/crowd`, `before[*].sheet/stance/move/health`, `R` | the four counters (captured by closure); `spend` writes `fighters[i].stamina/rest/exhausted`, pushes `StaminaExhausted` |
| 1 | Input to intent: gambit arming, buffer, dodge, backstep, special commit (cast / bow / melee / heal; mana, stamina, `SpecialRefused`), kick, attacks (`beginAttack`), feint, guard | 366-438 | `before[i]`, `before[1-i]`, `intents[i]`, `legal`, `chooseMove`, `R`, `wall` | `fighters[i]` (`next`), `events`, mana/stamina through `spend` |
| 2 | Phase expiry, chamber/charge, wind-up lunge, roll, backstep, ready/guard movement, anti-turtle rest, sprint cost, stamina and mana regen, exhaustion recovery | 439-491 | `fighters[i]`, `before[1-i].body`, `intents[i]`, `R`, `wall` | `fighters[i]` (phase, age, body, stamina, rest, mana, exhausted, charge, guard fields), `events` (`Charging`, `Charged`, `StaminaExhausted`) |
| 2a | Symmetric separation | 492-500 | `fighters[*].body` | both bodies |
| P | Closure `shake(target, amount)`: posture, posture break (`PostureBroken`, stun via `stunned`, punish/critical on the other side) | 501-513 | `fighters`, `R`, `stunned` | `T.posture/postureRest/phase/age/stun/buffer/counterWindow/charge/charged`, `O.punish/critical`, `events` |
| 2b | Lorarii whip (loiter clock, `WhipRaised`, `Whipped`, chip min 1, `shake`, shove) | 514-538 | `fighters`, `duel.finish`, `wall`, `R.wall.loiter` | `F.loiter/lashed/health/body`, `events` |
| 3 | Contacts, both sides against `snapshot` (540). `let finish = duel.finish` (541) is declared here and written by every later phase | 539-687 | `snapshot` (a, d), `fighters` (A, D), `before` bodies, `duel.roll/bands/gambit`, `R` | `A`/`D` fields, `finish`, `gdraws`, `hits`, `lastRoll`, `events` |
| 3a | Missile-weapon swing (throws a bolt, `continue`) | 547-564 | `missileOf`, mana/ammo | `A.mana/manaRest/ammo/missile`, `events` |
| 3b | Hit test: `bladeImpact` or kick reach, `AttackMissed`, `A.stall` | 565-582 | weapon paths, bodies | `location` (local), `A.stall`, `events` |
| 3c | Per-contact locals and closures: `g`, `facing`, `kind/pen`, `dealtPosture`, `raised`, `guarding`, `beaten`, `breaks`, `blockCost`; closure `stagger(ticks)` (reads `walledHit`, declared after it); `let walledHit`; closure `wound(damage, knockback, mark)` (health, wound marks, attrition, scars, knockback loop, wall impact, **kill sequence**); `trip` | 583-615 | all of the above | `D.*`, `walledHit`, `finish`, `events` |
| 3d | Resolution ladder: Dodged (616); ward reflect (617-620); parry (621-625); kick into off-side guard (626-627); block with chip (628-636); guard break (639); clean hit with poise tier, gambit, counter/stop/rear/flank, KNOCK_SIM kick interrupt and knockdown, posture (640-685) | 616-686 | as above | as above; `continue` at 660 (gambit fail) |
| 4 | Special releases (both sides judged from one `releasing`/`standing` snapshot): fizzle rules, cone breath start, heal, spell outcome draw (`casts++`), long-spell missile, direct damage, volley start, poison, react shove, **kill** | 688-746 | `fighters[i].special === 1`, `duel.cast`, spell rows | `A.special/skillCooldown/specialRecover/missile/breath/volley/health`, `D.*`, `finish`, `casts`, `events` |
| 4b | Breath pulses (cone) | 747-764 | `A.breath`, cone rows | `A.breath`, `D.health`, poison fields, `finish`, `events` |
| 4c | Volley pulses | 765-779 | `A.volley` | `A.volley`, `D.health`, `finish`, `events` |
| 4d | Boss phase rows (foe only) | 780-789 | `PHASES` | `B.phases/specialShare/skillCooldown`, `events` |
| 4e | Special windup countdown, interrupt, pushback | 790-808 | `before[i].health` vs `A.health` | `A.special/castHurt/castPush`, cooldown, `events` |
| 4f | Missiles arriving (dodge, miss, partly or fully guarded, hit, react or pin, **two kills**) | 809-855 | `A.missile`, `D` | `D.*`, `finish`, `events` |
| 5 | Shared creature HP (`duel.incoming`), **kill** | 856-867 | `duel.incoming` | `D.health`, `finish`, `events` |
| R | Return: the carry object of 345 with updated `roll.hits`, `gambit.draws`, `cast.n` and `finish` | 868 | locals | the next `Duel` |

State that crosses phases (the whole reason this is hard):

- `fighters`: shallow copies made at T, mutated in place by everything after. `snapshot` (540) is a shallow copy of `fighters` taken before phase 3 and shares nested objects with it (only whole-object replacement is safe, as the code does today).
- `before`: the previous tick's fighters (never mutated). `intents`: a parameter, reassigned at H.
- `events`: one array, pushed in program order across all phases.
- `finish`: `let` at 541, written inside `wound()` and in 6 inline blocks, read by the return at 868.
- `gdraws`, `casts`, `hits`, `lastRoll`: `let`s at 346-347 captured by `rolled`/`rollTag`/phase 3/phase 4. `lastRoll` is not reset between calls within a tick (a stale read is impossible today only because every `rollTag()` follows a `rolled()` in the same branch).
- `walledHit`: per-contact `let` (598), written by `wound()`, read by `stagger()`.

## 2. The kill sequences

Shape of one copy: `finish = finish ? { ...finish, draw: true } : { victim, location, move, heading }` then `events.push({ tick, type: 'Killed', actor, target, move, location, heading })`. The first victim stays in `finish`; a later kill on the same tick only sets `draw` (the double kill).

| # | Where (main) | Trigger | Settles the body in the copy? | Other effects | location | move | heading | actor/target |
|---|---|---|---|---|---|---|---|---|
| K1 | 612, inside `wound()` | any blow: hit, guard break, block chip, kick into off-side guard | **No**: `stagger()` runs after and sets `phase 'dead'`, `age 0`, `stun R.death`, `buffer null`, `counterWindow 0`, and pushes `Staggered` | the Hit/GuardBroken event is pushed **after** `wound()` returns, so the order is `Killed`, `Hit`, `Staggered` (block chip: `Blocked`, `Killed`, `Staggered`) | the blow's `location!` | `a.move!` | `a.body.heading` | i, j |
| K2 | 741-745, special release | `D.health` 0 after a direct special | yes: `phase 'dead'`, `age 0`, `stun R.death`, `buffer null` | `delete A.volley` first | `'torso'` | `move` (SKILL_MOVE) | `A.body.heading` | i, j |
| K3 | 760-763, breath pulse | pulse takes D to 0 | yes (same four) | none | `'torso'` | `move` | `A.body.heading` | i, j |
| K4 | 775-778, volley pulse | pulse takes D to 0 | yes | none | `'torso'` | `move` | `A.body.heading` | i, j |
| K5 | 832-836, missile fully guarded | `through` (a `chipKills` row) takes D to 0 | yes | none | `'torso'` | `m.move` | `A.body.heading` | i, j |
| K6 | 852-854, missile hit | `D.health` 0 after the hit | yes | none | `'torso'` | `m.move` | `A.body.heading` | i, j |
| K7 | 862-866, shared HP | `incoming` takes D to 0 | yes | none | `'torso'` | `A.lastMove ?? SKILL_MOVE[DAY_ONE_SKILL]` | `A.body.heading` | **0, 1** only |

Differences, each classified:

1. **K1 does not settle the body, K2-K7 do.** K1's settle is `stagger()`, which also resets `counterWindow` and emits a `Staggered` event; K2-K7 never touch `counterWindow`, `charge`, `charged` and emit no `Staggered`. Intentional by accident, benign (a dead fighter's counter window is moot), pinned: `counterWindow` is in the Gate 0 state hash and `Staggered` is in the event stream. Kept as a parameter (`settle`).
2. **K1's event order: `Killed` precedes `Hit`.** `wound()` is called before the `Hit` push at 627 and 667 and before the `GuardBroken` push at 639 (the block-chip path at 634-635 is the other way round: `Blocked`, then `Killed`, then `Staggered`). Quirk, pinned by event order in Gate 0 and by every consumer of the stream. NOT fixed in the refactor; if ever wanted, a separate behaviour PR with a re-pin. The helper is called from the same program point, so the order is preserved for free.
3. **`delete A.volley` only in K2.** K3-K7 leave the attacker's volley key for one more tick (4c deletes it next tick because `!D.health`). Latent inconsistency, harmless, but the stale key is visible in the next state hash. Kept: a one-line call-site statement before `killed(...)` in K2, not folded into the helper.
4. **`location` is `'torso'` in six copies and the real hit site in K1.** Intentional (non-blade damage has no site; `finish.location` feeds the finisher).
5. **K7 hard-codes actor 0 and victim 1; K1-K6 are symmetric (i, j).** Intentional (shared HP belongs to the foe's one stream). The helper takes `(i, j)`; K7 passes `0, 1`.
6. `finish.heading` is `A.body.heading` in all seven. Only the `move` source differs (K7's fallback); the caller computes `move` exactly as today.
7. **Not kills:** the ward reflect (`Math.min(A.health - 1, ...)`), the whip chip, poison, gambit fail and the pack chip all floor at 1 health and never reach a kill sequence. They stay untouched. After step 1, `grep "type: 'Killed'"` finds exactly one site.

No difference is a bug that alters a fight today. Items 1-3 are inconsistencies worth a later, separately re-pinned PR (not part of item 16).

The single helper, declared inside `stepDuel` right after `let finish = duel.finish` (541) so it closes over `finish`, `events`, `tick`, `R` exactly as the copies do; its first version must not leave the function:

```ts
// the one place a fall is recorded. settle = K2-K7 (the body is set dead here); K1 passes false because stagger() settles it right after.
const killed = (i: Side, j: Side, move: MoveId, location: HitLocation, heading: number, settle: boolean): void => {
  if (settle) { const D = fighters[j]; D.phase = 'dead'; D.age = 0; D.stun = R.death; D.buffer = null; }
  finish = finish ? { ...finish, draw: true } : { victim: j, location, move, heading };
  events.push({ tick, type: 'Killed', actor: i, target: j, move, location, heading });
};
```

Call sites: K1 `killed(i, j, a.move!, location!, a.body.heading, false)`; K2 `delete A.volley; killed(i, j, move, 'torso', A.body.heading, true)`; K3 and K4 the same without the delete; K5 and K6 `killed(i, j, m.move, 'torso', A.body.heading, true)`; K7 `killed(0, 1, move, 'torso', A.body.heading, true)`. The `if (D.health) continue;` guards and the surrounding control flow stay at the call sites. The helper does no arithmetic, draws no RNG and pushes one event in the same slot, so order, floats and draws cannot move.

## 3. Extraction order (each its own PR, pure refactor)

Precondition for all: #289 and #298 merged, and #298's re-pin (if any) already in `test/gate0/v3-golden.json` on main. Every refactor PR is based on that main, and `duel.ts` is frozen to other PRs while one is open (merge each within a day; the rebase cost of a moved block is the real hazard).

Hashes that must NOT move in steps 1-7 (all pass untouched; no re-pin, no edit to `v3-golden.json` or `configs.json`):

- `test/gate0/gate0.test.mjs`: all 56 rows `gate 0: V3 = V1, <config> seed <s> <script>` (configs career, page-first, page-first-novice, page-first-clips, page-reach-clip at seed 731; base at 731/828/4242; 7 scripts each). V1 is the reference and cannot be re-pinned, so a diff here is always a refactor bug.
- `test/gate0/v3-gate0.test.mjs`: the 16 pinned rows in `v3-golden.json` (8 seed-configs x 2 V3 scripts), exactly as #298 leaves them.
- `npm test` whole (era-replay, era-stamp, knock-round, minotaur-hits, feel-sim, directional-heavies, the rest), `npm run typecheck`, `npm run lint`.
- The new differential test (step 0), old tree vs new tree, zero differing ticks.

| Step | PR | Change | Proof beyond the above | Effort |
|---|---|---|---|---|
| 0 | test-only | Differential harness, fixtures, coverage assertions (section 4). Lands first, runs old-vs-old green, plus self-checks that must fail | the test itself; it must fail when K1's `Killed`/`Hit` order is swapped | 1 day |
| 1 | `killed` helper | Section 2: 7 call sites, one helper (about -20 lines) | all 7 kill signatures hit in the differential run; `grep "type: 'Killed'"` = 1 | 2 h code, 1 h review |
| 2 | `carry` | Extract the duplicated return object (345 and 868) into `carry(duel)`; 868 spreads the `roll/gambit/cast/finish` overrides after it. Keep the conditional spreads so an absent key stays absent (records and `canon` both see key presence) | differential; record round-trip tests | 1 h |
| 3 | tick context | One `TickCtx` object created at 346: `{ tick, events, before, fighters, wall, R, duel, hits, lastRoll, gdraws, casts, finish }`; `stunned`, `geared`, `crowded`, `rolled`, `rollTag`, `spend`, `shake`, `killed` take it. Still inside `duel.ts`, called in the same order. `lastRoll` MUST start `undefined` each tick (it is a per-call `let` today) | differential with roll (`withRoll`), crowd, sheet, stance fixtures | 0.5 day |
| 4 | end-of-tick phases to functions | Move 5 (shared HP), 4f (missiles), 4c, 4b, then 4 and 4e, then 4d, as `function stepX(ctx)`, in that order, one or two per PR. Same `for (const i of [0, 1])` loops, same call order in `stepDuel` | differential; each of K2-K7 exercised | 1.5 days total |
| 5 | movement phases | Move T (timers), 1 (intent), 2 (expiry and movement), 2a, 2b. Phases 1 and 2 read `before[1-i]` and the H-reassigned `intents`: pass both explicitly | Gate 0 scripts cover these fully (idle, mash, charge, guard, roll, kick, random) | 1 day |
| 6 | contact resolution (RISKIEST) | `resolveContact(ctx, snapshot, i)` for 3 to 3d. A per-contact `Contact` struct holds `a, d, A, D, i, j, def, location, g, facing, raised, guarding, beaten, kind, pen, walledHit`. `stagger` and `wound` become functions of `(ctx, c, ...)`; `walledHit` is a field, never a copied parameter. The `continue`s become `return`. Second PR: split the ladder branches (dodge, ward, parry, off-side kick, block, guard break, clean hit) into `landX(ctx, c)` functions in the same order. #289's wall-parry and wall-break branches go with them | Gate 0 covers most of it; the differential covers kick/KNOCK_SIM, ward, gambit, poise ladder, cones | 2.5 days incl. review; one full-N differential run |
| 7 | file split | Move the functions into `src/fight/step/*.ts` as a pure move (`git diff --color-moved` clean). New sim files follow the same determinism rules (no `Math.<transcendental>`, no single-precision spellings; `M` from detmath) | all of the above | 0.5 day |
| 8 | optional | Behaviour clean-ups from section 2 items 1-3, each its own PR with a deliberate re-pin and Dom's say-so. Not part of item 16 | n/a | n/a |

Total: about 6 to 7 working days for steps 0-7 in small PRs; the critical path is the review of steps 3 and 6. Steps 0 and 1 alone remove the copy-paste and can ship the day #289 and #298 merge.

## 4. Risks and how they are tested

1. **Floating point order of operations.** The chains in `damage` (638), `plain`/`stun` (652), the posture decay (331), `perked` (113) and the many `Math.round(a * b * c)` are not associative in float. Rule: move code verbatim; never re-group; never pull a sub-product into a named helper; never replace `x` with `x * 1` (the file already says why); never hoist a repeated expression across a mutation. Reviewer check: `git diff -w --color-moved=dimmed-zebra`; every moved line must show as moved, not changed.
2. **RNG draw order.** `rolled()` takes `hits++` only when `duel.roll` exists and is called in a fixed order per branch (ward 618 before `wound`; chip 631 before `spend`; guard break 639; clean hit 667). `gdraws++` once per resolved armed swing (655, before `dealt`); `casts++` before `mult` (720). Rule: no call to `rolled`, `gambitUnit` or `castOutcome` is added, removed, reordered or deferred (for example by turning an argument into a lazy thunk). Contact order i=0 then i=1 is part of the draw order.
3. **Event order.** One shared `events` array, pushed in place. No helper returns events to be concatenated later. Pinned quirks to keep: `Killed` before `Hit`/`GuardBroken` (but after the chip `Blocked`); `Staggered` after `Hit`; `SpecialStarted` after the mana/stamina spend.
4. **Tick-order semantics.** Phases run 1, 2, 2a, 2b, 3, 4, 4b, 4c, 4d, 4e, 4f, 5. Each reads either `before` (start of tick) or `fighters` (live). Mixing them is the classic extraction bug: phase 1 decides from `before`; phase 3 hits from `snapshot` but writes `fighters`; phase 4 reads `releasing`/`standing` computed once at 691. Rule: every extracted function takes `before`, `fighters`, `snapshot` under those names; no renaming of `a/A/d/D`.
5. **Closure captures.** `finish`, `walledHit`, `hits`, `lastRoll`, `gdraws`, `casts` are mutable captured lets. Rule: they become fields on one object (`TickCtx` / `Contact`), never parameters or return values. `stagger` references `walledHit` before its declaration (legal today because it is only called later): the field must be initialised before any call. TypeScript strict (audit A) catches many of these; it does not catch a copied counter.
6. **Control flow.** `continue`s inside the contact loop (547-564, 660) and the release and missile loops. Each becomes `return` in the extracted function; a `return` one level too deep silently skips what follows (the knockdown block at 677 and `shake` at 684).
7. **The two returns (345, 868)** carry different counters; step 2 keeps that.
8. **Era flags.** Module-global flags (`KNOCK_SIM`, `SPECIAL_PACE`, `SPECIAL_TERMS`, `HERO_NO_MANA`, `KNOCK_ROUND` from #298's `era-flags.ts`, plus `CONE_ON`, `POISE_LADDER_ON`, `STANCE_ROWS_ON`, `SANDBOX_ON`, `ROWS79_ON`, `ARMOUR_ON`, `OID_ON`, the mana rows) are read inside phases. An extraction must not copy a flag into a module-load `const` where the code reads the live `let` binding today (setters change it per run).

Differential test (step 0), `test/duel-diff.test.mjs`:

- **Old side vs new side.** Old = the base commit's `src` extracted to a temp dir (`git archive <base> src data`; the same pattern as Gate 0's `loadV1`/`loadV3Copy`, reusing `loadSide`); new = the working tree. `DUEL_DIFF_BASE=<sha>` names the base; unset, the tree is compared with itself (smoke run and the self-checks).
- **Seeds and inputs.** 300 seeds by default (`DUEL_DIFF_SEEDS`), each a random script from Gate 0's own seeded generator (`randomSegments`, mulberry32), 2400 ticks or to the finish. Fighters get scaled-down health so most seeds end in a kill; the killer alternates between sides.
- **Scenario matrix** built through the public doors (`initialDuel`, `withSpecials`, `withSpell`, `withSkill2`, `withRoll`, `withSheet`, `withStances`, `withGambit`, `withPerks`, `pose`) so each kill site is reachable:
  - K1: plain, rolled (`withRoll` with swarm and attacker), crowd slot 2, sheet and stance, perk;
  - K2: a direct special on a low-health foe (melee-picked, boss share, spell with fail/crit draws);
  - K3: a cone special (`CONE_ON` with a cone row); K4: a pulsed spell (`hits.length > 1`);
  - K5/K6: a bow or crossbow weapon (missile rows, a `chipKills` row), a long-range spell, a bow special with `react` and `pin`;
  - K7: `incoming` carried into `stepDuel` the way `pack.ts` does, including a same-tick blow kill (draw);
  - double kills on one tick (draw): K1+K2, K1+K7, K6+K7.
- **Flag matrix.** Each era flag on and off, enumerated from `era-flags.ts` (its `HANDLERS` table), so a new flag cannot be forgotten: the test fails if a handler id is missing from its matrix. The 2^5 corners of the five era flags at a reduced seed count; the other flags singly.
- **Comparison.** Per tick `canon({duel, ai, events})` (Gate 0's own serialiser: -0, NaN, key presence and every float bit count), the first differing tick and path reported like `describe()`. Also the final state, `finish`, and the ordered event type list, so an event moved within a tick shows.
- **Coverage assertions** (the test fails if the fixtures stop reaching the code): K1 to K7 each fire at least once (signatures: K1 `Killed` then `Hit`/`GuardBroken`, or `Blocked` then `Killed`, on the same tick; K2 `Killed` after a `SpecialLanded` without `pulse`; K3 after `SpecialLanded` with `cone`; K4 after `SpecialLanded` with `pulse > 0`; K5 `Killed` after a `Blocked` carrying `damage` with no `Hit`; K6 after a `Hit` with `missile: true`; K7 after `SharedHit`); `finish.draw` is seen at least once; every member of the `EventType` union that `duel.ts` pushes appears at least once.
- **Self-checks** (as Gate 0 has): swapping the `Killed` and `Hit` order, or dropping `delete A.volley` in K2, makes the test fail.
- **Where it runs.** Heavy: via `hfjob`, never directly on the Mac or VPS. CI runs a reduced-seed run on every PR touching `src/fight/**` (about a minute) and the full N on the PRs of steps 3, 4 and 6.

## 5. Dom's rules

- **Keep opponent spells, missiles and mana.** Nothing here removes or simplifies the spell, missile, volley, breath, mana, ward or bind paths. K3-K6 stay live and get their own differential coverage, so any later cut is a measured change, not a guess. `SpecialStarted`, the mana spend, `castSlot`, `skillCooldown2`, `spell2` all stay.
- **No flag changes.** No era flag is added, removed, flipped, defaulted or read differently. `KNOCK_ROUND`, `KNOCK_SIM` and the rest keep their off-in-headless default; Gate 0 keeps stepping V1's numbers. No data row changes.
- **No behaviour fixes inside the split.** The inconsistencies in section 2 (items 1 to 3) and the `Killed`-before-`Hit` order are recorded, not fixed.
- Audit draft PR, exempt from the cap, not merged by this lane.

## 6. Effort summary

| Step | Effort | Gate |
|---|---|---|
| 0 differential test | 1 day | green old-vs-old, self-checks fail as intended |
| 1 `killed` | 3 h | Gate 0 56 + 16 unchanged, differential, one `Killed` site |
| 2 `carry` | 1 h | same |
| 3 tick context | 0.5 day | same, with roll/crowd/sheet fixtures |
| 4 end-of-tick phases | 1.5 days | same, K2-K7 hit |
| 5 movement phases | 1 day | same |
| 6 contact resolution | 2.5 days incl. review | same, full-N differential once |
| 7 file split | 0.5 day | `git diff --color-moved` clean |

About 6 to 7 working days in 8 small PRs.
