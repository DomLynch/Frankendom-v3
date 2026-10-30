# Audit item 15 (design only): split `src/client/main.ts` and `src/fight/scene.ts`

Status: design, no code moves in this PR. Read from `origin/main` @ 22610bb (main.ts 726 lines, 99 import statements / 95 distinct modules; scene.ts 1,433 lines, 81 distinct modules) and from #289 `mechanics-batch` @ f9dbf05 (main.ts 737, scene.ts 1,447). Line numbers below are main @ 22610bb; the #289 delta is listed in 1.3 so the writer re-bases the numbers once #289 is in.
Start gate: #289 (mechanics batch) and #298 (audit C, duel.ts + 2 import hunks in main.ts) merged. All suites, builds and browser runs go through `hfjob -- <cmd>` (never the Mac or the VPS directly); CI runs test + typecheck + built-game boot on every PR.

## 0. Why this is hard (read first)

Both files are closure monoliths. `main.ts` has ~45 module-level `let`s (practice, state, previous, spawns, current, engaged, attackers, roam, freeRoam, killAge, freeNow, lockState, walkBack, openerIdle ...) read and written by ~25 functions and the frame loop. `scene.ts` is ONE function, `createScene` (lines 135-1432), whose ~120 inner `let`/`const`s (warriors, ragdoll, heldCtl, tier, rankLook, finisher latches, idle/live foe maps, mob slots) are shared by `loadFighters`, `dress`, `heldBodies`, `syncIdleFoes`, `syncLiveFoes`, `syncMobs` and the 450-line `render()`. A cut-and-paste into new files breaks on every shared name. So every seam below is one of two shapes, both already used in this repo (reuse, no new framework):

- a **factory** `createX(ctx)` / `mountX(...)` that owns its private state and returns a small handle (precedents: `mountGolden`, `mountParts`, `createMobsRun`, `createHud`, `createInput`, `createFightFx`, `createCameraRig`, `createSkyline`, `zone-loop.ts`, `hand-over-input.ts`);
- a **context object** of getters (for state assigned late, e.g. `warriors` is set by `loadFighters`) passed in, never imported back (so no cycles).

For main.ts the shared mutable state becomes ONE record `Run` (2.1) so extracted functions take `run` instead of capturing 45 lets.

## 1. Responsibility map

### 1.1 `src/client/main.ts` (726 lines)

| Lines | Section | Owns | Shared state it reads/writes |
|---|---|---|---|
| 1-103 | imports | 99 statements, 95 modules | n/a |
| 105-109, 151-165 | bootstrap | `element`, `search`, telemetry + error sink, canvas, page-zoom lock, feedback/keep/audio unlock, `hud`, commentator, mana bar | feedback, keep, audioUnlock, hud |
| 111-146 | run config + kinds | `TUNED`, stars rows + validation, `PROG_ROWS` + validation, `daily`, `zoneFor`, `PROG`, corpse/golden load validation, `REWARD_WEAPON`/`HERO_WEAPON`, `BASE_TUNE`, `KIND_CTX`, `KINDS`, `foe/opponentId/opponent/difficultyOn/aiProfile`, `useKind` | KINDS (reassigned in onBossKilled), foe*, PROG.save |
| 167-199 | fight construction | `ZONE`, `ZONE_SOUND`, `seed/epoch/nextSeed`, `fresh()` (era flags 175-179), `make()`, first `practice`, accumulator, `paused()` | practice, state, previous, accumulator, hitStop, seed, epoch |
| 201-227 | one-shot feel rows | cam/pitch/guardWalk/trail/specialFx/specialSink/foeWeapon/foeName/kindNames/bossBody/blend/hero clips/autoStart (all `setX(rowFor(FIGHT.x, search))`, pure data to setter) | none (opponentId read at 217, 224) |
| 229-243 | scene | `createScene(...)`, zoom/wide/tier | `view`, assetsReady |
| 244-273 | input | `kbmFor/mountKbm`, `createInput`, `clearInput`, `resetInput`, blur/visibility/pageshow/focus rewake, pointerdown tour-stop | hitStop, accumulator, freeNow, engaged, practice |
| 275-280 | HUD name | `nameOpponent` (stars mark) | foe, opponentId |
| 290-337 | zone state | open ground, `__v3Renderer`, DEATH, FREE/LOOK/LOCK_ROWS, SPOTS validation, opener, `spawns`, `multi`, `walkBack*`, `attackers`, `widen`, `poseFor`, `kindAt`, `heroStands/heroDied` | the whole `Run` record |
| 339-403 | world features | corpse run (`startLinger/endLinger/onHeroDied/corpseStep`), parts hook, mobs run, mechanics mount (397-398), golden | CR, PROG.save, carriedWeapon, lingerIdx, spawns |
| 405-442 | sim hand-over | `rematch`, `hand`, `leashReset`, `poseOfAttacker`, `adoptAttacker` | practice, state, previous, current, engaged, attackers, roam, killAge ... (writes ~15) |
| 443-470 | progression | `onBossKilled`, `rollStarFor`, `__v3Stars` | KINDS, KIND_CTX.tune, PROG.save, starById, spawnKills |
| 471-529 | zone rules | `zoneStep` (timers, kills, aggro, leash, respawn, joiners), `syncSweeps`, `zoneDebug` | the whole `Run` record |
| 530-573 | listeners | respawn button/key, lock-switch tap, look-drag / ?look=off drag, recenter | lockState, freeNow, engaged, attackers |
| 575-588 | HUD + audio sync | `updateHud` (+ endgame classes), `syncSpecialAudio` | practice, roam, freeRoam, killAge |
| 590-708 | `frame()` | prelude 592-603; hit-stop + accumulator 605-609; **tick loop 610-669** (lock step, intent, stepPractice, walkBack, attackers, events/audio/HUD floats, roam, mobs, mechanics, hit-stop); presentation 671-707 (globals, widen, holdBody, ringLook, liveFoes, idleFoes, free camera, look, `view.render`, share clip, radar, golden, corpse HUD, `updateHud`) | everything |
| 709-726 | tail | shareClip, radar mount, build label, `?snd=1` status, presence and shared-HP chunks, first `requestAnimationFrame` | radar, shareClip |

### 1.2 `src/fight/scene.ts` (1,433 lines)

| Lines | Section | Owns |
|---|---|---|
| 1-87 | imports | 81 modules |
| 52-53 | module consts | `CUT_BLOOD`, `CUT_STICK` (finisher camera rows) |
| 88-133 | module level, no closure | `RigLoadError`, `noClip`, `COMPILE_BOUND_MS`, `SIDES`, `EQUIP_URLS`/`equipUrl`, `FOE_EQUIP_URLS`, `FOE_OFFHAND_URLS`, `offhandUrlOf`, `foeEquipUrl`, `LOOK_BAKE_MS`, `CARRIED_WEAPONS` (main.ts imports it) |
| 134-159 | `GfxPost` type + `createScene` signature | 8 parameters |
| 160-227 | stage setup | renderer, scene, fog, skyline/skyfold, environment map, camera, key + hemisphere light, flinch/slouch/stance/fatigue flags, `gfx` post chain, `bloodEdge` |
| 228-292 | stage objects | `mesh/box/capsule` helpers, arena build, floor/foe fade, ground state, `player`/`opponent` capsule stand-ins |
| 293-415 | rig state | `warriors`, `homeActor`, weapons promise, shapes, `reshape`, `dress`, rank look (369-406), `ragdoll`, `pickup`, `heroRagdoll` |
| 416-508 | loader | `loadFighters` -> `ready` |
| 509-593 | finisher + special + camera state | blood, hamstrung/execution assets and latches (528-560), hero fall, cut-cam bones, finish clock/complete, special preview/presentation, signatures, `standoff`, `rig` |
| 594-681 | per-spawn bodies + held body | `bodyAssets`, `bodyRig`, `actorOfBody`, `heldBodies`/`heldCtl` |
| 682-762 | other foes | `syncIdleFoes` (689-726), `syncLiveFoes`/`foeAdoptAll` (727-762) |
| 763-816 | mobs view | `syncMobs`, `tintMobBody` |
| 817-842 | size + lens | `dip`, `width/height`, `applyLens`, resize |
| 843-964 | public API (return object) | ~40 members main.ts calls |
| 966-1432 | `render()` | 978-1006 special preview + finisher pick; 1007-1060 bake fallback, rank-look rebake, `fx.onContact`; 1061-1111 severed head, firelight, `arena.update`, transforms, poses; 1112-1145 finisher clock + steps; 1146-1192 actor updates; 1193-1250 ragdolls, decapitation, headings, flinch; 1251-1273 finisher aim; 1274-1335 wounds, signatures, specials, hit fx; 1336-1378 blood, dust, reach; 1379-1415 cut cam, `rig.update`, finish-complete latch; 1416-1432 exposure, fades, skyline, idle/live foes, draw, `rig.settle` |

### 1.3 What #289 adds (so the seams are cut for the post-#289 shape)

- main.ts (+11): `configureSimMechanics(MECHANICS_ROWS.mechanics)` after the imports (107); `tellStop` joins `hitStop` (199); the attacker join passes `mechanics?.of(kind)` when `.pure` (518); the stepPractice call becomes `mech/shaping` -> `pre` -> `stepPractice(..., layer)` -> `settle` -> `tell` (629-634); `mechCaption` -> commentator (641); `Math.max(stopFor(events), tellStop)` (677); `__v3Mech = mechanicView(...)` (686).
- scene.ts (+14): `createWallFx(scene)`/`wallFoot` (589); `heldMech`/`heldPhases` (732); `bodyMechanicFor(kind)?.view` in `syncLiveFoes` (759); `heldMech = bodyMechanicFor(...)` in the held swap (903); `ragdoll.setLost` + `heldMech.view` in `render` (1201-1204); the parry-wall block (1321-1325).
- Runtime hook surface (`src/fight/mechanics/runtime.ts`, `sim-hooks.ts`, `types.ts`): `MechanicRuntime` gains `layer`, `pre`, `settle`, `pure`, `tell`; plus `mechanicView`, `Tell`, `BodyNode`. These stay exactly as #289 left them; item 15 only moves the CALL SITS (`mech-wire.ts`, `scene-mech-view.ts`).

## 2. Proposed seams

All new files sit in `src/client/` (main side) and `src/fight/scene-*.ts` (scene side), the same directories as today, so every `new URL('../assets/...', import.meta.url)` literal and every relative import keeps its meaning. Hard rule for the writer: asset URL literals stay literal `new URL('<relative>', import.meta.url)` in a file of the SAME directory, or the bundler stops rewriting them; `scripts/boot-check.mjs` catches a miss as a 404.

### 2.1 main.ts seams

```ts
// src/client/run-state.ts   TYPES plus two tiny pure helpers. `import type` only. The `let` soup, as one record.
export type Run = {
  practice: Practice; state: State; previous: State; frameEvents: CombatEvent[];
  accumulator: number; hitStop: number; tellStop: number; seed: number; epoch: number;
  spawns: Spawn[]; current: number; engaged: boolean; killMarked: boolean; walkBack: boolean;
  attackers: Attacker[]; killedBy: number | null; widen: number;
  roam: State | null; freeRoam: FreeRoam | null; sinceDeath: number; killAge: number; fightSec: number;
  freeAfterKill: boolean; freeNow: boolean; respawnAsked: boolean; bossKilled: boolean;
  lockState: LockState; openerIdle: number; openerLift: number; openerSpent: boolean;
  assetsReady: boolean; graphicsLost: boolean;
};
export const heroStands = (r: Run, zone: boolean): boolean => ...;   // today :316
export const heroDied = (r: Run, zone: boolean): boolean => ...;     // today :317
```

```ts
// src/client/run-config.ts   lines 105-139 minus the lets: loads and VALIDATES every data row once, returns one record.
export type RunConfig = {
  search: string; telemetry: Telemetry; canvas: HTMLCanvasElement;
  TUNED: TuneRows; STAR_ROWS: StarsFile; PROG_ROWS: ProgressionFile;
  daily: ReturnType<typeof createDaily>; zoneFor(s: string): ZoneRow;
  PROG: { store: Storage; save: Save | null } | null;
  REWARD_WEAPON: WeaponId; HERO_WEAPON: WeaponId; BASE_TUNE: TuneRows; KIND_CTX: KindCtx;   // KIND_CTX.tune is the one mutable field (onBossKilled)
  ZONE: ZoneLoop | null; ZONE_SOUND: ZoneSoundRows | null; SPOTS: Spot[]; CR: CorpseRows | null; DEATH: DeathRows | null; FREE: FreeRows | null;
};
export function loadRunConfig(doc: Document, win: Window): RunConfig;   // the `throw new Error('data/x.json: ...')` validations move with it, in the same order
```

```ts
// src/client/kinds.ts   KINDS, foe, opponentId, opponent, aiProfile, difficultyOn, useKind, kindAt, rebuild (lines 138-146, 338, 459)
export type KindHolder = {
  readonly foe: KindFight; readonly opponentId: OpponentId; readonly opponent: Opponent; readonly aiProfile: AiProfile; readonly difficultyOn: boolean;
  use(k: KindFight): void;   // useKind: setActiveKind, setMechanicScale, then onChange() when the kind changed
  at(spawns: readonly Spawn[], index: number, starById: Readonly<Record<string, number>>): KindFight;   // kindAt
  rebuild(tune: TuneRows): void;   // KINDS = kindTable(KIND_CTX) after a kill
};
export function createKinds(cfg: RunConfig, onChange: () => void): KindHolder;
```

```ts
// src/client/boot-rows.ts   lines 175-179 (era flags) and 201-227 (one-shot feel rows). Straight cut: setter(rowFor(FIGHT.x, search)).
export function applyFeelRows(search: string, zone: boolean, opponentId: OpponentId): { autoStart: boolean; gfxPost?: () => Promise<typeof import('../fight/gfx-lift.ts')> };
export function applyEraFlags(search: string, zone: boolean, opponentId: OpponentId): void;   // called from fresh(), as today
```

```ts
// src/client/audio-wire.ts   152-161, 269-272 (rewake), 582-588 (syncSpecialAudio), 631-650 (per-tick sound), 633-638 (death audio pick)
export type AudioWire = {
  feedback: Feedback; keep: Keep; v1Sound: boolean;
  onTick(practice: Practice, ctx: { seed: number; opponentId: OpponentId; view: Pick<SceneView, 'hamstrungInstalled' | 'executionInstalled' | 'previousFinisher'> }): void;   // hot, per tick; same allocation profile as today
  syncSpecialAudio(opponentId: OpponentId): void;
  rewake(): void;
};
export function mountAudio(cfg: RunConfig): AudioWire;   // feedback.prepare, createAudioUnlock, rearmWhenLocked, listeners
```

```ts
// src/client/hud-wire.ts   nameOpponent (275-280), updateHud (575-580), element ids, reset button, build label (716-719), ?snd=1 status (719)
export type HudWire = { update(run: Run, kinds: KindHolder): void; nameOpponent(kinds: KindHolder): void; askRespawn(run: Run): void };
export function mountHudWire(cfg: RunConfig, hud: Hud, view: Pick<SceneView, 'finishPhase'>, audio: AudioWire): HudWire;
```

```ts
// src/client/input-wire.ts   244-273, 530-533 (respawn key), 534-547 (lock switch), 548-573 (look / drag / recenter)
export type InputWire = { controls: Controls; clear(run: Run): void; reset(run: Run, handOver: boolean): void; stepLock(run: Run, intent: LiveIntent): boolean /* lockOn */ };
export function mountInputWire(cfg: RunConfig, run: Run, view: SceneView, canvas: HTMLCanvasElement,
  hooks: { paused(): boolean; heroStands(): boolean; kindAt(i: number): KindFight; useKind(k: KindFight): void; updateHud(): void }): InputWire;
```

```ts
// src/client/mech-wire.ts   the #289 call sites: main.ts 518 (pure attacker mechanic), 629-634 (pre/layer/settle/tell), 641 (mechCaption), 686 (__v3Mech)
export type MechWire = {
  attackerMech(kind: string): MechanicRuntime | null;   // `m?.pure ? m : null`
  step(prior: Practice, intent: Intent, aiProfile: AiProfile, kind: string, active: boolean): { practice: Practice; tellStop: number };   // pre -> stepPractice(layer) -> settle -> tell
  publish(kind: string): void;   // __v3Mech
};
export function createMechWire(mechanics: Mechanics | null, commentator: Commentator): MechWire;
```
`mech-wire.step` replaces the 6-line block in the tick loop with ONE call and must not allocate when the boss has no `layer` (today's `shaping` is `undefined` -> plain `stepPractice(prior, duelIntent, aiProfile)`).

```ts
// src/client/world-wire.ts   corpse run (339-393), mobs mount (395-396), mechanics mount (397-398), golden (402-403), radar mount (712-715), share clip (709), progression (443-470)
export type World = {
  corpse: CorpseRun | null; golden: Golden | null; mobsRun: MobsRun | null; mechanics: Mechanics | null; radar: Radar | null; shareClip: ShareClip;
  onHeroDied(run: Run): void; corpseStep(run: Run, dt: number): void;
  onBossKilled(kind: string, star: number, at?: XZ): void; rollStarFor(spawn: Spawn): void; startLinger(run: Run, idx: number): void;
  starById: Record<string, number>;
};
export function mountWorld(cfg: RunConfig, run: Run, view: SceneView, kinds: KindHolder,
  hooks: { assetsReady(): boolean; leashReset(i: number, at: XZ): void; commentator: Commentator }): World;
```

```ts
// src/client/zone-run.ts   290-337 setup, 405-442 hand-over, 471-529 rules (the heart: every Run writer lives here and in frame.ts)
export type ZoneRun = {
  fresh(pose?: DuelPose): Practice; make(seed: number, pose?: DuelPose, k?: KindFight): Practice;
  rematch(pose?: DuelPose, index?: number, restart?: boolean, handOver?: boolean): void;
  hand(index: number, at: XZ): void; leashReset(index: number, at: XZ): void; adoptAttacker(a: Attacker, at: Pose): void;
  step(dt: number): void;   // zoneStep
  syncSweeps(): void; debug(): void; poseFor(i: number, at: XZ): DuelPose;
};
export function createZoneRun(cfg: RunConfig, run: Run, kinds: KindHolder, view: SceneView, world: World, input: InputWire,
  ui: { updateHud(): void; reportFight(name: 'boss_death' | 'boss_kill', i: number): void }): ZoneRun;
```

```ts
// src/client/frame.ts   590-708 as two named functions (NOT a closure per frame; the deps object is built once at boot)
export function createFrame(deps: FrameDeps): { start(): void };
function simTick(d: FrameDeps): void;   // lines 611-668 verbatim: the accumulator body, one call per sim tick
function present(d: FrameDeps, dt: number, alpha: number): void;   // lines 671-707 verbatim
```

`main.ts` after the split (target <= 150 lines, <= 28 imports): `loadRunConfig` -> `applyFeelRows` -> `mountAudio` -> `createHud` -> `createKinds` -> `createScene` -> `mountWorld` -> `mountInputWire` -> `createZoneRun` -> `createFrame(...).start()` + the presence/shared-HP `import()` chunks (lines 720-725, unchanged: lazy chunks stay literal dynamic imports in a file the build bundles as today).

**Import order, main side (strict DAG; lower layers never import higher ones):**
`run-state` (types) -> `run-config` -> `boot-rows`, `kinds`, `audio-wire` -> `hud-wire`, `mech-wire`, `input-wire` -> `world-wire` -> `zone-run` -> `frame` -> `main`.
Callbacks (`updateHud`, `reportFight`, `paused`) are passed DOWN as hook arguments, never imported up; `run-state` is `import type` only. That is what keeps `hud-wire <-> zone-run` and `input-wire <-> zone-run` from becoming cycles.

### 2.2 scene.ts seams

```ts
// src/fight/scene-ctx.ts   TYPES ONLY. What every extracted scene unit receives. Getters, because warriors/ragdoll/heldCtl are assigned late.
export type SceneCtx = {
  readonly scene: THREE.Scene; readonly camera: THREE.PerspectiveCamera; readonly renderer: THREE.WebGLRenderer; readonly theme: ArenaTheme;
  readonly rig: CameraRig; readonly arena: Arena; readonly opponentId: OpponentId; readonly search: string;
  warriors(): Warriors | undefined; ragdoll(): FoeRagdoll | null; held(): HeldCtl | null;
};
```

| New file | Moves (scene.ts lines) | Public interface | Stays behind |
|---|---|---|---|
| `scene-equip.ts` | 88-133: `RigLoadError`, `equipUrl`, `FOE_EQUIP_URLS`, `FOE_OFFHAND_URLS`, `offhandUrlOf`, `foeEquipUrl`, `CARRIED_WEAPONS`, `GfxPost` type | same exports as today (main.ts re-points ONE import) | nothing |
| `scene-stage.ts` | 160-227 minus flags, 228-272, 817-842: renderer, scene, fog, skyline/skyfold, env map, camera, lights, arena, ground, fade, size, lens | `createStage(canvas, theme, search, post): Stage` = `{renderer, scene, camera, arena, skyline, skyfold, floorFade, foeFade, bloodEdge, resize(w,h), applyLens(), openGround(s), ringLook(...), preRender(), draw()}` | the `gfx` chain handle lives on Stage; `render()` calls `stage.draw()` |
| `scene-loader.ts` | 293-415, 416-508: weapons promise, `loadFighters`, `reshape`, `dress`, shields, rank look, tier | `createRigLoader(ctx0, flags): { ready: Promise<void>; setTier; setPlayerTier; rankLook; warriors(); dress(); reshape() }` | status callbacks stay in createScene |
| `scene-bodies.ts` | 594-681: `bodyAssets`, `bodyRig`, `actorOfBody`, `heldBodies`, `activeBody`, `holdBody` | `createBodies(ctx, loader): { hold(spawn, near): string; active(): string; has(file): boolean; held(): HeldCtl \| null; bodyOfSpawn }` | none |
| `scene-foes.ts` | 682-762: `syncIdleFoes`, `syncLiveFoes`, `foeAdoptAll`, idle/live maps | `createFoes(ctx, bodies, mechView): { idleFoes(list); liveFoes(list); liveStar(n); sync(practice, dt): void; counts }` | the public setters stay one-line delegations |
| `scene-mobs-view.ts` | 763-816: `syncMobs`, `tintMobBody`, frustum scratch | `createMobsView(ctx): { set(view \| null); sync(dt): void; drawn(): number }` | none |
| `scene-mech-view.ts` | the #289 call sites: `createWallFx` (589), `heldMech/heldPhases` (732), `bodyMechanicFor` in live foes (759) and the held swap (903), `ragdoll.setLost`/`heldMech.view` (1201-1204), wall block (1321-1325) | `createMechView(ctx): { setHeld(kind); forLive(group, fighter, spawn); frameHeld(practice, opponent); frameWall(practice, dt): void }` | `src/fight/mechanics/*` untouched |
| `scene-finisher.ts` | 509-560, 567-573 and render 1007-1060 (pick, bake fallback), 1112-1145 (clock, steps), 1188-1192, 1251-1273, 1359-1415 (cut cam, reach, complete latch) | `createFinisherDirector(ctx, loader, bodies): { begin(practice, events, roamed): FinishFrame; clock(dt): number; aim(); camFeed(): CamFeed; phase(): { complete, completeAt, stickBeat }; previous(): FinisherId \| null }`; `FinishFrame = { finisher, ragBody, runThroughHold, hamstrungFinish, executionFinish, detailedBlood, victimProgress }` | `render()` keeps the ORDER of calls |
| `scene-specials.ts` | 575-589 (special preview/presentation/signatures/castTells), `specialStruck` (170), render 980-987, 1288-1318 | `createSpecialsView(ctx): { prepare(epoch, events, practice, fight); lift/slam/gait accessors; render(practice, events, dt): void; exposure(): number }` | none |

After the split `scene.ts` is the composition root: `createScene` builds the units in the order above, owns the public API object (843-964, one-line delegations) and `render()` as a ~150-line ORDERED list of unit calls. Target: <= 450 lines and <= 35 imports.

**Import order, scene side:** `scene-equip` (leaf) -> `scene-ctx` (types) -> `scene-stage` -> `scene-loader` -> `scene-bodies` -> `scene-mech-view` and `scene-mobs-view` (depend on stage/loader only) -> `scene-foes` (bodies, mech-view) -> `scene-specials` -> `scene-finisher` (loader, bodies) -> `scene.ts`. `src/client/*` imports only `scene.ts` and `scene-equip.ts` (for `CARRIED_WEAPONS`); nothing in `src/fight/scene-*` imports `src/client/*`.

## 3. Step order (small PRs, each independently mergeable, behaviour-preserving)

Proof used by EVERY step ("P0"): CI `test` (includes the all-bosses rows `test/boss-expect.test.mjs`, `boss-rows`, `boss-order`, `zone-cues-wiring`), `typecheck` + `lint`, built-game boot (`scripts/boot-check.mjs` on `dist/`, reads `__v3Fight`, `__ragdoll`, `__weaponShapes`), and Gate 0 table + V3-golden unchanged. Neither file is in the sim, so the Gate 0 digest must be byte-identical: any diff is a stop-and-revert signal. Item 15 PRs touch no `duel.ts`, `stepDuel`, `attacker-bout.ts`, `sim-hooks.ts` or `mechanics/*`.
Added proof for the render/frame steps ("P1"): the frame-trace diff from step 0 (run through `hfjob`). No stills are needed (nothing the player sees changes); if P1 differs by one value the PR is wrong.

| # | PR title | Moves | Proof | Effort |
|---|---|---|---|---|
| 0 | `test: module layers + frame trace (guard rails)` | Adds `data/module-layers.json` (file -> layer rank, plus line/import ceilings) + `test/module-layers.test.mjs` (parses `import` lines of `src/client/*.ts` and `src/fight/scene*.ts`, fails on an edge to an equal/higher rank and on main.ts/scene.ts exceeding the ceilings, which each step lowers) + `scripts/frame-trace.mjs` (built game, fixed seed, 600 frames, every 30th: `__v3Fight` tick and health, `view.yaw`, camera position, `renderer.info.render.calls/triangles`, one hash). Reuses the shared Playwright helper from audit 12 (#297). Baseline trace stored as a CI artifact, re-run per step. | P0 + baseline | 3 h |
| 1 | `refactor: scene-equip` | scene.ts 88-133 (pure, no closure) | P0 | 1 h |
| 2 | `refactor: boot-rows` | main.ts 175-179, 201-227 | P0 | 1.5 h |
| 3 | `refactor: run-config + kinds` | main.ts 105-146, 338, 459 (data load + validation + KINDS) | P0 | 3 h |
| 4 | `refactor: audio-wire` | main.ts 152-161, 269-272, 582-588, 631-650 | P0 + P1 | 2.5 h |
| 5 | `refactor: hud-wire + mech-wire` | main.ts 275-280, 575-580, 716-719; the #289 tick block (629-634, 641, 686, 518) | P0 + P1 | 3 h |
| 6 | `refactor: scene-stage, scene-mobs-view, scene-mech-view` | scene.ts 160-272, 763-842 and the #289 scene hooks | P0 + P1 | 5 h |
| 7 | `refactor: scene-loader, scene-bodies, scene-foes` | scene.ts 293-508, 594-762 | P0 + P1 (held-body swap covered by the all-bosses rows and boot) | 6 h |
| 8 | `refactor: scene-specials, scene-finisher` | scene.ts 509-593 and the render slices in 2.2 | P0 + P1 + the existing per-finisher kill rows | 8 h |
| 9 | `refactor: input-wire` | main.ts 244-273, 530-573 | P0 + P1; existing look/lock-switch rows keep their selectors | 4 h |
| 10 | `refactor: run-state (Run record)` | converts main.ts's ~45 `let`s to `run.x` IN PLACE, no file moves (mechanical, reviewable as a rename) | P0 + P1 | 4 h |
| 11 | `refactor: world-wire` | main.ts 339-403, 443-470, 709, 712-715 | P0 + P1 | 4 h |
| 12 | `refactor: zone-run` | main.ts 290-337, 405-442, 471-529 | P0 + P1 | 6 h |
| 13 | `refactor: frame (simTick + present); main.ts shrinks to composition` | main.ts 590-708 | P0 + P1 | 4 h |
| 14 | `chore: debug-handles registry` (optional) | the ~15 `globalThis.__v3*` assignments in one file | P0 + P1; boot-check and every `scripts/*-stills.mjs` read the same names | 2 h |

### 3.1 Riskiest first or last

- **Riskiest in main.ts: step 12 (zone-run), with step 10 right before it.** Every rule reads and writes the same record in one tick; a missed `run.` rename or a changed evaluation order (zoneStep before commentator, `killMarked` before `onBossKilled`, `attackers` filtered before `joiners`) is a silent behaviour change the boot check will not see. Do it LAST in main.ts: after steps 1-9 have shrunk the surface, after the step 0 trace exists, and after the draft PRs that touch `zoneStep/adoptAttacker` have merged or rebased (3.2). Step 10 is split from 12 on purpose: a pure rename PR is reviewable, a rename plus a move is not.
- **Riskiest in scene.ts: step 8 (finisher).** It owns ~10 latches read across `render()` (finishClock, hamstrungSteps, executionSteps, bodyLatch, bakeFallback, openedReach, cut-cam bones, finishComplete) and a draw order that matters. It goes AFTER the leaf scene units (6, 7) so its blast radius is small and the trace already covers stage and bodies, but BEFORE main's zone-run so scene.ts is stable when main moves.
- Safest first: 1, 2, 3 (data and pure setters, no shared mutable state), then 4, 5 (small, hook-shaped).

### 3.2 Conflict map (open PRs at 22610bb; files and hunks read from `gh pr diff`)

| PR | main.ts hunks | scene.ts hunks | Collides with step |
|---|---|---|---|
| #289 mechanics-batch (ready) | 42-43, 69, 107, 199, 518, 629-634, 641, 677, 686 | 17, 87, 589, 732, 759, 903, 1201-1204, 1321-1325 | MERGE FIRST (start gate); steps 5, 6, 7, 8 are cut around its shape |
| #298 audit C (draft) | imports 71, 162 | none | merge first; trivial |
| #263 heat tally, #270 hunter chase | imports 57/91, `adoptAttacker` 414, `zoneStep` 448-464, `frame` 657-678 | none | steps 11-13; ask the owners to rebase after step 9, or park until after 13 |
| #264 flesh market | import 37, corpse lets 332, `zoneStep` 450, `frame` 659 | none | steps 10-13 |
| #277 mobs read corpse state | import 63, `createInput` 242 | imports 80, 400 | step 9 (input) and step 7 (loader), small |
| #241 terrain from seed | import 86, `nameOpponent` 265 | 35, 256, 685, 729, 838, 894, 998, 1309, 1317, 1335 (10 hunks) | steps 5-8: the heaviest scene.ts collision; land or rebase it BEFORE step 6 or it conflicts at each of 6-8 |
| #267 body (merchant crowd) | none | 304 (small) | step 7 |
| #296 rows loader, #299 bone cache, #297, #300, #301, #213, #294 | none in main.ts / scene.ts bodies (#296 touches `scene-rows.ts`, `camera-rules.ts`; #300 `hud.ts`, `camera-pitch.ts`) | none | none; #296 changes the type `cameraRule()` returns, so re-run typecheck on step 6 |

Hunk lists are from the PR diffs at the time of writing and move as drafts update; the writer re-reads `gh pr diff` for each open PR before cutting a step. Rule: one step in flight at a time, each merged before the next branch is cut from main; announce each merge so draft owners rebase (moved line ranges are in this document). If a draft is about to land first, let it land and re-derive the ranges rather than hand-resolving conflicts.

## 4. Data layer and Dom's rules

- **No new URL flags.** Every `[?&]x=v1` check and every `?flag=` read moves with its code and keeps its exact regex and name (`cam`, `ring`, `guard`, `trail`, `dip`, `blend`, `look`, `lock`, `lockswitch`, `freecam`, `postkill`, `aggro`, `leash`, `input`, `radar`, `snd`, `presence`, `sharedhp`, `save`, `pitborn`, `difficulty`, `tune`, ...). A `flagV1(search, name)` helper is allowed only as a byte-for-byte refactor of those regexes with a test that pins the name list against the pre-split source; no flag is added, renamed or retired in item 15. With no query string the behaviour is unchanged.
- **Data rows, not literals.** The only new tables are structural: `data/module-layers.json` (layer ranks and line/import ceilings, read by the guard test) and, if step 14 ships, the debug-handle name list (read by `boot-check`). No new tunables: every number the moved code uses stays the row it already reads (`data/fight.json`, `respawn.json`, `input.json`, `hero-death.json`, ...).
- **Reuse, never build custom.** Follow the existing wire/mount/factory shape (`golden-wire.ts`, `parts-hook.ts`, `mobs-run.ts`, `zone-loop.ts`, `hand-over-input.ts`, `corpse-hud.ts`, `createFightFx`, `createCameraRig`). No DI framework, event bus, ECS or state library. `Run` is a plain object.
- **No behaviour, art or balance change.** No stills (visible output identical, proven by P1); a PR that needs stills to justify itself is out of scope for item 15.

## 5. What NOT to move

- **Hot loops stay as single straight-line functions** (cut and paste, no per-frame closures, no per-tick objects the original did not make): `frame()`'s accumulator `while` (611-668), `render()`'s ordered body, `syncIdleFoes`/`syncLiveFoes` (allocation-free scratch objects), `syncMobs` (frustum scratch), foot dust, the `SIDES` loops, and the `__v3*` per-frame globals (their write order is part of what the stills read). Extracted units are called from the same place in the same order; a unit's inner loop is the original code untouched.
- **Everything audit C (#298) and item 16 (`stepDuel`) own:** `src/fight/duel.ts`, `stepPractice`/`combat.ts`, `attacker-bout.ts`, `sim.ts`, `record.ts`, `knock-sim.ts`, `src/fight/mechanics/*` (including #289's `runtime.ts`, `sim-hooks.ts`, `types.ts`), `data/mechanics.json`, `src/sim/validate.js`. Item 15 moves only the page-side CALLS to them. `quantizeIntent` and the Gate 0 digest path stay as they are.
- **Do not reorder** what runs before `createScene`: `setBossBody`, `setGuardWalk`, `applyHeroClips` write data the scene and ragdoll read at build time (comments at main.ts 205, 219).
- **Do not split** `createScene`'s public return object into several objects (main.ts, boot-check and `scripts/*-stills.mjs` read it by member name); keep it one object of one-line delegations.
- **Do not touch** `src/stubs.ts`, `hud` internals, `src/zone/*`, `src/presence/*`, `src/mobs-run.ts`, the lazy `import()` chunks (main.ts 720-725), `scripts/*`, CI workflows, or `src/fight/*` modules that are already separate.

## 6. Effort summary

- Step 0 (guard rails): 3 h, ships first, lowers the risk of every later step.
- Leaf PRs 1-5: ~11 h, same day as the #289/#298 merge.
- Scene PRs 6-8: ~19 h; main-side PRs 9-13: ~22 h; optional 14: 2 h. Total ~57 h of writer time across 15 PRs; wall clock about 2 working days with the merge-then-branch rule (CI, ~20 min a run, is the bottleneck).
- Exit criteria: `main.ts` <= 150 lines and <= 28 imports; `scene.ts` <= 450 lines and <= 35 imports; the guard test green; trace identical to the step 0 baseline on every PR; Gate 0 byte-identical; no new flag, no new tunable, no stills needed.
