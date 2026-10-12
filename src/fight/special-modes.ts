import type { TitheLight } from './special-lighting.ts';
import type * as THREE from 'three';
import type { GoblinSpecial } from './special-fx-goblin.ts';
import { RULES } from './moves.ts';
import type { CombatEvent, Fighter } from './duel.ts';
import type { OpponentId } from '../roster.ts';
import { actorPose, attackSpecs } from './combat.ts';
import { specialStage, SPECIAL_RECOVER, type SpecialTest } from './special-look.ts';
import { CUTS, CUT_GAP, cutAt, SLAM_AT } from './special-timing.ts';
import { chargeGait } from './charge-timing.ts';
import type { BossKind } from './special-boss-timing.ts';
import { BOSSES, type BossRow } from './boss-rows.ts';
import { classTravel, type ClassSpecial } from './special-class-timing.ts';

// The special-effect registry (Strategy 2026-10-01: thirty specials are coming, so a lane adds ONE entry here, not an if-branch in scene.ts). A mode is picked by the
// page's `?special=<id>` (special-look.ts SPECIAL_TESTS) and says everything the scene needs: how to load its effect (a lazy chunk), which bones it reads, how the
// caster is posed, how the struck body moves, and whether the game's pale weapon trail is hidden. A `?special=` with no entry, and every other fight, draws Hades' cloud.
export type Pose = ReturnType<typeof actorPose>;
export type SpecialFx = {
  render(dt: number, events: readonly CombatEvent[], fighters: readonly [Fighter, Fighter], tick: number, at: readonly [THREE.Vector3 | null, THREE.Vector3 | null], yielding: boolean, ...extra: any[]): void;   // eslint-disable-line @typescript-eslint/no-explicit-any
  clear(): void;
  readonly exposure?: number;   // a mode that dims the whole frame (Nightfall) reports its multiplier on the draw exposure; absent = 1
};
export type SpecialMode = {
  load(scene: THREE.Scene, opponent: OpponentId, exposure: number, camera: THREE.Camera, lighting?: TitheLight): Promise<SpecialFx>;
  at: 'feet' | 'head';   // which bone pair `render` gets: the feet (a ground effect) or the heads (a cloud)
  lift: number;          // the struck body's knee-dip, metres: negative drops him (the claw), positive lifts him (a column, a ripple under him)
  held?(pose: Pose, side: 0 | 1, fighters: readonly [Fighter, Fighter]): { pose: Pose; slam?: number };   // how the caster is posed through the cast (in place of Combat's placeholder heavy raise); `slam` is the Centurion's shield arm this frame
  hideTrail?: boolean;   // the game's pale weapon trail streaks above a raised sword through the cast
  travel?(side: 0 | 1, fighters: readonly [Fighter, Fighter]): number | undefined;   // m/s the rig is told this fighter travels while the mode wants him running or backing (his gait plays in a ready stance); undefined = the sim's own pose and speed
  extra?(w: { player: { boneWorld(name: string): THREE.Vector3 | null; anchor: THREE.Object3D }; opponent: { boneWorld(name: string): THREE.Vector3 | null; anchor: THREE.Object3D } } | undefined): unknown[];   // more arguments for `render` (bones, anchors)
};

// The one place the sim's speed and pose give way to a mode's: a mode with no `travel`, or one that answers undefined, leaves both exactly as the sim made them.
export function gait<P extends string>(mode: SpecialMode | undefined, side: 0 | 1, fighters: readonly [Fighter, Fighter], travel: number, pose: P): { travel: number; pose: P | 'ready' } {
  const speed = mode?.travel?.(side, fighters);
  return speed === undefined ? { travel, pose } : { travel: speed, pose: 'ready' };
}

const loadExecutioner = (scene: THREE.Scene, opponent: OpponentId, kind: BossKind, exposure: number) => import('./special-fx-executioner.ts').then(({ createExecutionerSpecial, bossLook }) => createExecutionerSpecial(scene, opponent, kind, bossLook(kind, exposure)));
// Blood Tithe's forward pose (Dom, 2026-10-01: the heavy's raise cocks the gladius back like a backhand, and the thrust held short of contact tucks the blade at his chest):
// the thrust clip held AT its contact pose through the gather, drawn back to TITHE_CHAMBER of it by TITHE_STRIKE_FROM, then driven to full contact on the strike tick.
export const TITHE_CHAMBER = 0.55, TITHE_CHAMBER_FROM = 0.84, TITHE_STRIKE_FROM = 0.92;

const ease = (k: number) => k * k * (3 - 2 * k), clamp = (k: number) => Math.min(1, Math.max(0, k));

// The estoc held level at its contact pose (the thrust clip's extended pose): Seven Cuts' tell, its last stroke and the settling after it. Eases back to stance over the recover (Red Wind's way).
const heldThrust = (f: Fighter, stage: NonNullable<ReturnType<typeof specialStage>>): Pose => {
  const spec = attackSpecs(f.weapon).thrust, c = spec.contact / spec.recovery;
  return { pose: 'attack', attack: 'thrust', contact: c, progress: stage.stage === 'windup' ? c : c + (1 - c) * stage.progress };
};
const CUT_MOVES = ['light', 'return', 'heavy', 'return', 'light', 'riposte', 'thrust'] as const;   // six cuts, then the thrust
const CUT_TICKS = Array.from({ length: CUTS }, (_, i) => cutAt(i));
// The Pitborn's rank 8-10 bosses (special-fx-pitborn.ts, Dom's picks 2026-10-01): ground effects, drawn at the feet, on his Cleave's placeholder heavy raise (no `held` pose yet).
const pitborn = (kind: 'antaeus' | 'surtr' | 'typhon', lift: number): SpecialMode => ({ load: (scene, opponent, exposure) => import('./special-fx-pitborn.ts').then(({ createPitbornSpecial }) => createPitbornSpecial(scene, opponent, kind, exposure)), at: 'feet', lift,
  extra: (w) => [w?.opponent.anchor ?? null] });   // Typhon sways his body in the wind through the anchor; the other two ignore it
const loadGoblin = (kind: GoblinSpecial, scene: THREE.Scene, opponent: OpponentId, exposure: number) => import('./special-fx-goblin.ts').then(({ createGoblinSpecial }) => createGoblinSpecial(scene, kind, exposure, opponent));
const goblinExtra: NonNullable<SpecialMode['extra']> = (w) => [w?.opponent.anchor ?? null, w?.player.boneWorld('Head') ?? null];
// A Witch / Plague Doctor boss special (Multi Chars, special-fx-boss.ts): a ground-and-air effect that reads both feet, both heads and the two anchors. The struck
// body drops (the claw's dip).
const boss = (kind: BossKind, at: SpecialMode['at'], lift: number, travel?: SpecialMode['travel']): SpecialMode => ({
  load: (scene, opponent, exposure) => import('./special-fx-boss.ts').then(({ createBossSpecial }) => createBossSpecial(scene, opponent, kind, exposure, globalThis.document?.getElementById('world') ?? undefined)),
  at, lift, hideTrail: true,   // the game's pale weapon-trail ribbon (a flat-edged wedge by the staff tip) shows through every wind-up otherwise
  extra: (w) => [[w?.player.boneWorld('Head') ?? null, w?.opponent.boneWorld('Head') ?? null], w?.opponent.anchor, w?.player.anchor],
  ...(travel ? { travel } : {}),
});
// Foretold Step: through the last 23 ticks of her wind-up the target's rig plays a gait (1.6 m/s forward, in a ready stance), so he is visibly the one stepping into the ghost; the sim's own body does not move.
const foretold: SpecialMode['travel'] = (side, fighters) => (side === 0 && (fighters[1].special ?? 0) > 0 && (fighters[1].special ?? 0) <= 23 ? 1.6 : undefined);

// The verbs a bosses.json row names (src/fight/boss-rows.ts): `fx` picks the effect module, `travel` the gait the target's rig plays. A row naming a verb not here is a gate error (tests/boss-rows.test.ts); a new mechanic is a new entry here.
export const FX_VERBS: Readonly<Record<string, (row: BossRow) => SpecialMode>> = {
  executioner: (r) => ({ load: (scene, opponent, exposure) => loadExecutioner(scene, opponent, r.id, exposure), at: r.at, lift: r.lift }),   // ground art off the feet, the caster in Combat's placeholder heavy raise
  boss: (r) => boss(r.id, r.at, r.lift, r.travel ? TRAVEL_VERBS[r.travel] : undefined),
  goblin: (r) => ({ load: (scene, opponent, exposure) => loadGoblin(r.id as GoblinSpecial, scene, opponent, exposure), at: r.at, lift: r.lift, hideTrail: true, extra: goblinExtra, ...(r.held ? { held: HELD_VERBS[r.held] } : {}) }),   // the Goblin's rank 8-10 bosses (special-fx-goblin.ts): the effect gets the target's feet, his rig anchor and head, and hides or shifts the caster itself, so nothing in scene.ts
  redwind: (r) => ({ load: (scene, opponent, exposure) => import('./special-fx-wind.ts').then(({ createRedWind, sandLook }) => createRedWind(scene, opponent, sandLook(exposure))), at: r.at, lift: r.lift, ...(r.held ? { held: HELD_VERBS[r.held] } : {}) }),   // Rank 8 Red Wind: the sand burst off his feet
  hades: (r) => ({ load: (scene, opponent) => import('./special-fx.ts').then(({ createSpecialFx }) => createSpecialFx(scene, opponent)), at: r.at, lift: r.lift }),   // Hades' cloud: what a mode-less special loads
  dwarfshield: (r) => ({ load: (scene, opponent, exposure) => import('./special-fx-dwarf-shield.ts').then(({ createBossFx }) => createBossFx(scene, opponent, r.id, exposure)), at: r.at, lift: r.lift }),   // the Dwarf's and the Shieldmaiden's ranks 8-10: one effect module, it reads both Head bones and poses nobody
  nightfall: (r) => ({ load: (scene, opponent, _exposure, camera) => import('./nightfall-fx.ts').then(({ createNightfallFx }) => createNightfallFx(scene, camera, opponent)), at: r.at, lift: r.lift }),   // Nyx's Nightfall: the exposure drains to near-black, a cold moon rims the pair
};
export const HELD_VERBS: Readonly<Record<string, NonNullable<SpecialMode['held']>>> = {
  ready: (pose, side, fighters) => (side === 1 && specialStage(fighters[1]) ? { pose: { ...pose, pose: 'ready', progress: 0 } } : { pose }),   // plain stance, not Combat's blade-raise: Reynard's scoop is the tell
  thrust: (pose, side, fighters) => {   // he holds his blade out level through the windup (the thrust clip's extended contact pose, held) and eases back to stance as it scours
    if (side !== 1) return { pose };
    const stage = specialStage(fighters[side]);
    if (!stage) return { pose };
    const spec = attackSpecs(fighters[side].weapon).thrust, c = spec.contact / spec.recovery;
    return { pose: { pose: 'attack', attack: 'thrust', contact: c, progress: stage.stage === 'windup' ? c : c + (1 - c) * stage.progress } };
  },
};
export const TRAVEL_VERBS: Readonly<Record<string, NonNullable<SpecialMode['travel']>>> = { foretold };
const bossModes = () => Object.fromEntries(BOSSES.map((r) => [r.id, FX_VERBS[r.fx](r)])) as Partial<Record<SpecialTest, SpecialMode>>;


// The Witch's, the Plague Doctor's and the Knight's class specials (Weapons, special-fx-class.ts): ground marks darker than the floor, read off the feet; the two that walk (Doctor's Tempo, Ground Drag) are handed
// the caster's rig anchor and write it absolutely every frame (the effect also reports the gait the rig plays, `classTravel`).
const classFx = (kind: ClassSpecial): SpecialMode => ({
  load: (scene, opponent, exposure) => import('./special-fx-class.ts').then(({ createClassSpecial }) => createClassSpecial(scene, opponent, kind, exposure)),
  at: 'feet', lift: -0.1, hideTrail: true,
  extra: (w) => [w?.opponent.anchor ?? null],
  ...(kind === 'tempo' || kind === 'drag' ? { travel: classTravel(kind) } : {}),
});

export const SPECIAL_MODES: Partial<Record<SpecialTest, SpecialMode>> = {
  setfoot: { load: (scene, opponent, exposure) => import('./special-fx-legion.ts').then(({ createSetFoot }) => createSetFoot(scene, opponent, exposure)), at: 'feet', lift: -0.1, hideTrail: true },
  heelreap: { load: (scene, opponent, exposure) => import('./special-fx-executioner.ts').then(({ createHeelReap }) => createHeelReap(scene, opponent, exposure)), at: 'feet', lift: -0.1, hideTrail: true },
  lunge: { load: (scene, opponent, exposure) => import('./special-fx-nightborn.ts').then(({ createPaleLunge }) => createPaleLunge(scene, opponent, exposure)), at: 'feet', lift: -0.1, hideTrail: true },
  knuckledirt: { load: (scene, opponent, exposure) => import('./special-fx-goblin.ts').then(({ createKnuckleDirt }) => createKnuckleDirt(scene, opponent, exposure)), at: 'feet', lift: -0.1, hideTrail: true },
  cleaverset: { load: (scene, opponent, exposure) => import('./special-fx-pitborn.ts').then(({ createCleaverSet }) => createCleaverSet(scene, opponent, exposure)), at: 'feet', lift: -0.1, hideTrail: true },
  groundset: { load: (scene, opponent, exposure) => import('./special-fx-dwarf-shield.ts').then(({ createGroundSet }) => createGroundSet(scene, opponent, exposure)), at: 'feet', lift: -0.1, hideTrail: true },
  cutmark: { load: (scene, opponent, exposure) => import('./special-fx-dwarf-shield.ts').then(({ createCutMark }) => createCutMark(scene, opponent, exposure)), at: 'feet', lift: -0.1, hideTrail: true },

  blackfurrow: { load: (scene, opponent, exposure) => import('./special-fx-executioner.ts').then(({ createBlackFurrow }) => createBlackFurrow(scene, opponent, exposure)), at: 'feet', lift: -0.1, hideTrail: true },
  earthfold: { load: (scene, opponent, exposure) => import('./special-fx-pitborn.ts').then(({ createEarthFold }) => createEarthFold(scene, opponent, exposure)), at: 'feet', lift: -0.1, hideTrail: true },
  ironsettle: { load: (scene, opponent, exposure) => import('./special-fx-dwarf-shield.ts').then(({ createIronSettle }) => createIronSettle(scene, opponent, exposure)), at: 'feet', lift: -0.1, hideTrail: true },
  gatherededge: { load: (scene, opponent, exposure) => import('./special-fx-dwarf-shield.ts').then(({ createGatheredEdge }) => createGatheredEdge(scene, opponent, exposure)), at: 'feet', lift: -0.1, hideTrail: true },
  antaeus: pitborn('antaeus', 0.12),   // Cracking Ground: seams split out of the sand from his own feet toward the target
  surtr: pitborn('surtr', -0.2),   // Ash Fall: the cleave drives him down
  typhon: pitborn('typhon', 0),   // Wind Wall: the gale and the lunge, no knee-dip
  // The Nightborn's rank 4-7 class special (special-fx-nightborn.ts; Dom 2026-10-01: dark ink only, nothing pale or glowing). Seven Cuts (ranks 4-7): the blade plays six cuts and the thrust in the last 24 ticks of the windup, the thrust held at contact range.
  cuts: {
    load: (scene, opponent) => import('./special-fx-nightborn.ts').then(({ createSevenCuts }) => createSevenCuts(scene, opponent)),
    at: 'feet', lift: -0.06, hideTrail: true,
    held(pose, side, fighters) {
      const stage = side === 1 ? specialStage(fighters[1]) : null;
      if (!stage) return { pose };
      const age = stage.stage === 'windup' ? stage.progress * RULES.special.windup : RULES.special.windup + stage.progress * SPECIAL_RECOVER, i = CUT_TICKS.findIndex((at) => age <= at);
      if (i < 0 || age < CUT_TICKS[0] - CUT_GAP) return { pose: heldThrust(fighters[1], stage) };   // the tell, and the settling after the seventh: the blade out at contact range
      const attack = CUT_MOVES[i], spec = attackSpecs(fighters[1].weapon)[attack], c = spec.contact / spec.recovery;
      return { pose: { pose: 'attack', attack, contact: c, progress: c * ease(clamp((age - (CUT_TICKS[i] - CUT_GAP)) / CUT_GAP)) } };   // each stroke sweeps from its windup to its contact in CUT_GAP ticks
    },
  },
  // Rank 8 Shield Quake (the Centurion's Ajax): the shield goes up over the windup, is driven down at SLAM_AT (the ripple starts there) and stays planted while the sand runs.
  shield: {
    load: (scene, opponent, exposure) => import('./special-fx-quake.ts').then(({ createShieldQuake, quakeLook }) => createShieldQuake(scene, opponent, quakeLook(exposure))),
    at: 'feet', lift: 0.12, hideTrail: true,
    held(pose, side, fighters) {
      const stage = side === 1 ? specialStage(fighters[1]) : null;
      if (!stage) return { pose };
      const age = stage.stage === 'windup' ? stage.progress * RULES.special.windup : RULES.special.windup + stage.progress * SPECIAL_RECOVER;
      return { pose, slam: age < SLAM_AT - 14 ? ease(clamp(age / (SLAM_AT - 14))) : age < SLAM_AT ? 1 + clamp((age - (SLAM_AT - 14)) / 14) : age < RULES.special.windup + 18 ? 2 : 2 * (1 - ease(clamp((age - RULES.special.windup - 18) / 20))) };
    },
  },
  wake: classFx('wake'), stirring: classFx('stirring'), tempo: classFx('tempo'), pulse: classFx('pulse'), drag: classFx('drag'), swing: classFx('swing'),
  ...bossModes(),   // the twelve rows of bosses.json (Executioner, Witch, Plague Doctor, Knight): at / lift / fx / travel come from the row
  // Rank 10 Blood Tithe (the Centurion's Mars): the thrust held at contact (the sword arm extended), a short chamber, then the strike; the effect hides his weapon trail and yaws the arm itself.
  tithe: {
    load: (scene, opponent, _exposure, _camera, lighting) => import('./special-tithe.ts').then(({ createBloodTithe }) => createBloodTithe(scene, opponent, lighting)),
    at: 'head', lift: -0.28,
    extra: (w) => [[w?.player.boneWorld('hand_r') ?? null, w?.opponent.boneWorld('hand_r') ?? null], [w?.player.anchor ?? null, w?.opponent.anchor ?? null]],
    held(pose, side, fighters) {
      const stage = side === 1 ? specialStage(fighters[1]) : null;
      if (!stage) return { pose };
      const t = attackSpecs(fighters[1].weapon).thrust, c = t.contact / t.recovery, k = stage.progress;
      const windup = c * (1 - (1 - TITHE_CHAMBER) * (ease(clamp((k - TITHE_CHAMBER_FROM) / (TITHE_STRIKE_FROM - TITHE_CHAMBER_FROM))) - ease(clamp((k - TITHE_STRIKE_FROM) / (1 - TITHE_STRIKE_FROM)))));
      return { pose: { pose: 'attack', attack: 'thrust', contact: c, progress: stage.stage === 'windup' ? windup : c + (1 - c) * k } };
    },
  },

  ratrun: { load: (scene, opponent, exposure) => loadGoblin('ratrun', scene, opponent, exposure), at: 'feet', lift: -0.1, hideTrail: true, extra: goblinExtra },
  // Rank 9 The Charge (the Centurion's Alexander): a low dust line races along the ground and breaks over the foe's feet; his body is drawn riding the front (the anchors, `extra`) and
  // his gait runs it (`travel`: walking back to gather, then the armed run, charge-timing.ts). lift -0.28 is the default knee-dip, kept: the blow drops the foe a little.
  centurion: {
    load: (scene, opponent) => import('./charge-fx.ts').then(({ createChargeFx }) => createChargeFx(scene, opponent)),
    at: 'feet', lift: -0.28,
    extra: (w) => [[w?.player.anchor ?? null, w?.opponent.anchor ?? null]],
    travel: (side, fighters) => { const stage = side === 1 ? specialStage(fighters[1]) : null; return stage?.stage === 'windup' ? chargeGait(stage.progress * RULES.special.windup) : undefined; },
  },
  // Accepted Centurion class B, ranks 4-7 (levels 16-35); Combat owns selection.
  standfast: { load: (scene, opponent) => import('./special-fx-legion.ts').then(({ createLegionSpecial }) => createLegionSpecial(scene, opponent)), at: 'feet', lift: -0.1, hideTrail: true },
};
