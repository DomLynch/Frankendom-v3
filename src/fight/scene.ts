import { cameraRule } from './camera-rules.ts';
import { specialLift } from './special-sink.ts';
import { impactTier } from './hit-impact.ts';
import { shardRows, specialShardsOf, specialTrailOf } from './sandbox-rules.ts';
import { trailScale } from './hero-special-fx.ts';
import { ROSTER, supportsFinishers, resolveFinisher } from '../roster.ts';
import * as THREE from 'three';
import { SPECIAL_STRUCK, specialStage } from './special-look.ts';
import { bloodHidden, type BloodMode } from './blood-mode.ts';
import { resolveSparringPreview } from './sparring-specials.ts';
import { gait, SPECIAL_MODES, type SpecialFx as ModeFx } from './special-modes.ts';
import { SCHOOL_OF, schoolTinter, schoolsFlag, schoolsStrength } from './spell-school.ts';
import { createTitheLighting } from './special-lighting.ts';
import { warmFirstFrame } from '../first-frame.ts';
import { firstFrameDrawn } from '../late-art.ts';
import { createBossTelegraph, telegraphFlag } from './boss-telegraph.ts';
import { createSpecialPresentation, disposeSpecialGroup, type SpecialFightIdentity } from './special-presentation.ts';
import { captureException } from '../stubs.ts';   // V3: @sentry/browser
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildWarriors, specialRoleOf, sizeBeast, CHARGE_LEAN, defenceReaction, holdingCharge, heroClipsOn, loadLoot, MissingTextures, loadFoeBody, loadRankLook, loadShape, loadShield, loadWarriors, lootWorn, SHIELD_CARRIERS } from './characters.ts';
import { shieldFor, SHIPPING_SHIELDS } from './shields.ts';
import { RemoteSwords } from '../presence/sword.ts';
import { shapesFlag,shapesFor, shapesOn, SHIPPING_SHAPES } from './weapon-shapes.ts';
import { bakeSafeFinisher, lookBakeOffFrom, lookBakes, rankLookFlag, runThroughForced, rankLookFor, rankLookStream, SHIPPING_LOOKS } from './rank-look.ts';
import { kitWorn, levelOf, type Tier } from '../stubs.ts';   // V3: core/grades.ts, core/loot.ts
import { STANDOFF_MS, standoffClock, standoffFlag, standoffPose } from './standoff.ts';
import { actorPose, initialPractice, type CombatEvent, type Practice } from './combat.ts';
import { ON_DEMAND_BEASTS, beastBodyUrl } from './beast-scale.ts';
import { OPPONENTS, PLAYER_WEAPONS, RULES, opponentAt, weaponOf, DEFAULT_WEAPON, WEAPON_LOOK, type OpponentId, type WeaponId } from './moves.ts';
import { finisherRow, type FinisherId } from './finishers.ts';
import { anyOfTemplate, isPlainDeath, isShelved, isTemplate } from './finisher-look.ts';
import { HAMSTRUNG_BEATS, HAMSTRUNG_SOURCE_PELVIS, HAMSTRUNG_VICTIMS, hamstrungPick, resolveHamstrung } from './hamstrung.ts';
import { EXECUTION_BEATS, EXECUTION_FLOOR_MARKS, EXECUTION_SOURCE_PELVIS, executionPick, poseOf, resolveExecution } from './execution.ts';
import { createHamstrungAssets } from './hamstrung-assets.ts';
import { PLAY_SCALE, TARGET, wrapAngle, type State } from './sim.ts';
import { arenaFor, buildArena } from '../stubs.ts';   // V3: arena.ts, arena-themes.ts (V2's flat stage)
import { nightBronzeApplies, toneNightBronze } from './night-armour.ts';
import { createFootDust, dustToneFor } from './foot-dust.ts';
import { createWitchfire } from './witchfire.ts';
import { createMiasmaMark, marksFlag } from './miasma-mark.ts';
import { createSkillImpact, impactPoint } from './skill-impact.ts';
import { countSpecial } from './special-counter.ts';
import { createImpactFx } from './impact-fx.ts';
import { createMissileFx } from './missile-fx.ts';
import { createWoundNotice } from './wound-notice.ts';
import { shardCapacity } from './special-shards-rows.ts';
import { createSpecialShards } from './special-shards.ts';
import { createFinisherBlood, finisherBloodSources } from './finisher-blood.ts';
import { phoneTier, pixelCap } from './quality.ts';
import { FOE_TUNE } from './fatigue-tune.ts';
import { fatigueReadFrom } from './fatigue-read.ts';
import { stanceFrom } from './stance-pose.ts';
import { readyOffset, slouchFrom } from './upright-ready.ts';
import { armfeelFrom, Flinch } from './armfeel.ts';
import { createBurstPool } from './armfeel-fx.ts';
import { createBloodEdge } from './blood-edge.ts';
import { createCameraRig, framingLow, framingTall, setLensBoost } from './camera.ts';
import { launchSeveredHead, stepSeveredHead, type SeveredHead } from './severed-head.ts';
import { createFightFx, impactTexture } from './fx.ts';
import { createSignatures } from './signature.ts';
import { scorch } from './scorch.ts';
import './signature-veteran.ts';   // the Veteran's Battle Scars registers itself (V3 meets only the veteran: the other nine opponents' signatures are not shipped)
import { settleWithin } from './warm-gate.ts';
import { heroBodyFile } from './hero-body-rows.ts';
import { foeBakedWeapon, foeBodyFile, foeBodySwapped, foeKitFile, spawnBodyFile } from './foe-body.ts';
import { bone as boneOf, heroRigFile, CLIP_LOAD } from './rig-bones.ts';
import { foeDrawnWeapon } from './foe-weapon.ts';
import { fovForZoom, wideBoost, type WideRow } from './camera-zoom.ts';
import { createSkyline } from './skyline.ts';
import { foeRagdollFor, ragdollBody, ragdollFinisher, snapshotRig, WARM_SCALE } from './ragdoll.ts';
/** A 106 body file that failed to load (106 only: there is no other body to fall back to). `files`: the hero's and the opponent's URLs asked for. */
export class RigLoadError extends Error {
  readonly files: string[];
  constructor(files: (string | undefined)[], cause: unknown) {
    super(`106 body load failed (${files.map((f) => f?.split('/').pop() ?? 'none').join(', ')}): ${(cause as Error)?.message ?? String(cause)}`, { cause });
    this.name = 'RigLoadError';
    this.files = files.map((f) => f ?? 'none');
  }
}
/** A baked clip a 106 body has no clips106 file for: rejected, never a 65-keyed file (none is shipped). */
const noClip = (role: string) => (): Promise<{ default: unknown }> => Promise.reject(new Error(`no 106 clip for ${role}`));
const COMPILE_BOUND_MS = cameraRule('compileBoundMs');   // a compile (warm-up only) that has not settled by then is given up on: a lost context never settles it, and the walk must not wait
const SIDES = [0, 1] as const;   // the two fighters, for the per-frame loops: one shared tuple, not a new array every frame (armfeel is on for everyone now)

// One GLB per opponent (moves.ts `OpponentId`); only the hero and the man he faces are ever loaded.
// The player weapons this build can draw: the longsword is warrior.glb's own, every other needs its equip file (scripts/build-player-weapon.mjs),
// fetched only when that weapon is the one in hand. main.ts offers the fight only these (loot.ts fightWeapon), so no pick can lack its art.
// V3: no Vite, so the globs below are the files the one fight ships, by URL (the Centurion's gladius at his level-1 loadout).
const EQUIP_URLS: Record<string, string> = { '../assets/weapons/player/gladius.glb': new URL('../assets/weapons/player/gladius.glb', import.meta.url).href };
const equipUrl = (weapon: WeaponId): string | undefined => EQUIP_URLS[`../assets/weapons/player/${weapon}.glb`];
// V3: the opponent's DRAWN weapon over the one he fights with (foe-weapon.ts, data/fight.json foeWeapon: V1's Cleaver on the Minotaur, the
// sim's gladius kept). Its equip file is the gladius's with the cleaver in the socket; fetched only when the row is in force (?foeweapon=v1: the gladius's).
const FOE_EQUIP_URLS: Record<string, string> = { '../assets/weapons/foe/cleaver.glb': new URL('../assets/weapons/foe/cleaver.glb', import.meta.url).href };
// The Pitborn (foe-pick.ts, Dom 2026-10-26) really fights with the cleaver: the same file, grafted over the trident his Minotaur body bakes.
const foeEquipUrl = (opponentId: string, weapon: WeaponId): string | undefined =>
  FOE_EQUIP_URLS[`../assets/weapons/foe/${foeDrawnWeapon(opponentId, weapon)}.glb`] ?? equipUrl(weapon);
// A rank look's pre-swap bake takes up to this many ms of each frame (it runs while the fight plays; one bounded step is ~8 ms at worst).
const LOOK_BAKE_MS = cameraRule('lookBakeMs');
export const CARRIED_WEAPONS: readonly WeaponId[] = PLAYER_WEAPONS.filter((weapon) => WEAPON_LOOK[weapon]?.baked || equipUrl(weapon));
/** The better graphics (gfx-lift.ts, one module for every page): the Pit page hands the lazily imported module in (undefined = off, the chunk was never fetched). */
export type GfxPost = { patchHeightFog(): void; createGfxLift(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): { render(): void; setSize(w: number, h: number): void; compile(): void } };
export function createScene(
  canvas: HTMLCanvasElement,
  // `kind` is the machine-readable outcome; `status` is only ever display text — main.ts must never infer readiness or
  // failure from the string (audit 2026-09-22: it used to key the versus card on `status !== 'Loading warriors\u2026'`,
  // which any future in-progress status line would have defeated).
  assetStatus: (status: string, kind: 'loading' | 'ready' | 'failed') => void = () => {},
  opponentId: OpponentId = 'veteran',
  arenaOverride?: string,   // ?arena=3b: a dev look / still capture; otherwise the ladder band picks (arena-themes.ts)
  // The player's weapon, as the Match fights it. A promise when the page is still waiting on a kill link (the record
  // decides the weapon): the rigs load once it settles, so the hand always holds what the simulation swings.
  playerWeapon: WeaponId | Promise<WeaponId> = DEFAULT_WEAPON,
  // The weapon the player's rig carries once it is built: the one asked for, or the longsword when its equip file failed. Called before
  // the 'ready' status, so the entry point can re-arm the fight (drawn = simulated) before the card lifts.
  playerDrawn: (weapon: WeaponId) => void = () => {},
  // The ladder level the opponent is met at, as the Match fights it: his loadout can change with it (moves.ts LOADOUT_FROM: the Centurion's
  // gladius + scutum from Legionary), so his rig is armed for that level. A rematch that crosses the change reloads the page (main.ts).
  // Default 1 = the first rung's loadout (the Centurion's baked trident): a harness caller that omits it (versus-cards.mjs) renders rung 1.
  opponentLevel: number | Promise<number> = 1,
  post?: () => Promise<GfxPost>,   // a LOADER, called once the renderer exists, so a page with no WebGL never starts the import (the chunk imports the entry, which has thrown: a second, identical pageerror)
) {
  const theme = arenaFor(opponentId, arenaOverride);
  // Phone tier (the owner's iPhone GPU-pressure defect, 2026-09-18): cap the backing store at 1.25× and the
  // shadow map at 512² — the MSAA framebuffer at 1.5× on a ~1170×2532-class phone is ~200 MB of GPU memory.
  const PHONE = phoneTier(),
    PIXEL_CAP = pixelCap(PHONE);   // ?dpr= overrides the ceiling for this load (quality.ts)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, PIXEL_CAP));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = theme.exposure;
  const scene = new THREE.Scene();
  (globalThis as { __v3Scene?: THREE.Scene }).__v3Scene = scene;   // the stills' close-up camera finds a body's bones here (scripts/finisher-cuts-stills.mjs CAM=)
  // Special Moves (special-look.ts): the tick each side was last struck by a special (its head-hit stagger is presentation only). The cloud
  // is Finishers' special-fx.ts, loaded below only in a fight with Special Moves.
  const specialStruck = [-Infinity, -Infinity];
  scene.background = new THREE.Color(theme.fog);
  scene.fog = new THREE.FogExp2(theme.fog, theme.fogDensity);
  const skyline = createSkyline(scene, typeof location === 'undefined' ? '' : location.search);   // data/stage.json skyline: the 360-degree sunset strip, fetched after the first frame; ?sky=v1 = the flat sky above, nothing built
  let environmentTarget: THREE.WebGLRenderTarget | undefined;
  // The environment map: the arena's own ash sky (an equirect the world lane paints, warm sand below the horizon) once it has landed,
  // so bronze and iron reflect this place; the studio RoomEnvironment only until then (audit 2026-09-20).
  let arenaSky: THREE.Texture | undefined;
  function rebuildEnvironment() {
    const pmrem = new THREE.PMREMGenerator(renderer), environment = arenaSky ? null : new RoomEnvironment();
    try {
      const target = environment ? pmrem.fromScene(environment, 0.04) : pmrem.fromEquirectangular(arenaSky!);
      environmentTarget?.dispose();
      environmentTarget = target;
      scene.environment = target.texture;
      scene.environmentIntensity = environment ? 0.45 : 1.0;
    } finally {
      environment?.dispose();
      pmrem.dispose();
    }
  }
  rebuildEnvironment();
  const camera = new THREE.PerspectiveCamera(51, 1, 0.1, 180);
  const metal = new THREE.MeshStandardMaterial({ color: '#89949b', metalness: 0.72, roughness: 0.4 });
  // Brass for the capsule stand-ins (it warms on a threat while they stand in); the arena has its own materials in arena.ts.
  // The brass target ring under the opponent is gone (owner 2026-09-21: a UI shape on the sand, and the hero never had one).
  const brass = new THREE.MeshStandardMaterial({ color: '#ad9365', metalness: 0.65, roughness: 0.48 });
  const hemisphere = new THREE.HemisphereLight(...theme.hemisphere);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(...theme.sun);
  const sunHome = new THREE.Vector3(...(theme.light?.sun ?? [-15, 26, -18])), sunPower = theme.sun[1];   // a theme may move the key light (noon overhead, firelight low)
  sun.position.copy(sunHome);
  sun.castShadow = true;
  sun.shadow.mapSize.set(PHONE ? 512 : 1024, PHONE ? 512 : 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 70 });   // the pit floor to the wall's foot (11.7 m), not the tiers: 1.25× sharper shadows on the sand for free (audit 2026-09-20)
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  // V3: the `?look=souls|shade` test chunk (souls-look.ts) is not carried; `look` stays undefined, which is today's frame.
  // `?look=armfeel&feel=high|low|off` (armfeel.ts): the victim's flinch on a visual pivot between the fighter's root and its rig. Absent or `off`: no pivot, today's frame.
  const feel = typeof location === 'undefined' ? undefined : armfeelFrom(location.search, typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const flinches = feel && feel !== 'off' ? [new Flinch(feel), new Flinch(feel)] : null;
  const slouch = typeof location !== 'undefined' && slouchFrom(location.search);   // ?look=slouch (upright-ready.ts): the old stoop, for comparing; the upright ready pose is on by default
  const stance = typeof location !== 'undefined' ? stanceFrom(location.search) : 'neutral';   // ?look=stances&stance=<name>: neutral (today's frame) without the flag
  const fatigueRead = typeof location !== 'undefined' && fatigueReadFrom(location.search);   // fatigue-read.ts: the tired pose made legible from behind, ON; ?off=fatigue-read = the live layer alone
  const pivots: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];
  const lean = new THREE.Quaternion(), hip = new THREE.Vector3(), swing = new THREE.Vector3(), axis = new THREE.Vector3();
  const burstPool = flinches ? createBurstPool(scene) : null;
  const right = new THREE.Vector3();
  const look = undefined as { key?: number; setSize(w: number, h: number, r: number): void; update(anchors: unknown[], feet: THREE.Vector3[]): void; render(): boolean } | undefined;
  // The lift: the fog chunk is patched BEFORE any material compiles (the loading card waits on gfxReady below), the composer then draws every frame in place of the plain render. A failed chunk leaves the Pit exactly as it was.
  let gfx: ReturnType<GfxPost['createGfxLift']> | undefined;
  const gfxReady: Promise<unknown> = post ? post().then((m) => { m.patchHeightFog(); gfx = m.createGfxLift(renderer, scene, camera); gfx.setSize(width, height); }).catch(captureException) : Promise.resolve();
  const bloodEdge = createBloodEdge(canvas);   // the player's hits: a crimson streak on the edge the blow came from (blood-edge.ts)
  function mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = scene,
  ) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
    parent: THREE.Object3D = scene,
  ) {
    return mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z, parent);
  }
  const arena = buildArena(scene, theme),
    footDust = createFootDust(scene, dustToneFor(theme)),
    witchfire = createWitchfire(scene),
    skillImpact = createSkillImpact(scene),
    specialShards = shardRows() ? createSpecialShards(scene, shardCapacity()) : null,   // sandbox specialShards rows: lit 3D chips off a landed melee special (special-shards.ts); no rows (trunk) builds nothing
    shardAt = new THREE.Vector3(),
    woundNotice = createWoundNotice(),   // sandbox-mech wounds: the temporary on-screen message
    missileFx = createMissileFx(scene),   // sandbox-mech missiles: the bolt in flight, nothing while none flies
    impactFx = createImpactFx(scene),   // a flash + ground ring per contact row (hit-stop-defs.json flash/ring/tint columns; a row without them draws nothing)
    miasmaMark = marksFlag(globalThis.location?.search ?? '') ? createMiasmaMark(scene) : null;   // ?look=marks (miasma-mark.ts)
  missileFx.warm(() => renderer.compile(scene, camera));   // sandbox heal: its shader programs and its light are compiled now, not at the first cast
  arena.group.scale.setScalar(PLAY_SCALE); { const ring = arena.group.getObjectByName('boundary'); if (ring) ring.visible = PLAY_SCALE === 1; }   // from the first frame; render() follows a new fight's circle
  arena.ready.then(() => { if ((arena.sky.image as { width: number }).width > 2) { arenaSky = arena.sky; rebuildEnvironment(); } }).catch(() => {});
  function capsule(x: number, z: number, material: THREE.Material) {
    const group = new THREE.Group();
    scene.add(group);
    group.position.set(x, 0, z);
    mesh(new THREE.CapsuleGeometry(0.31, 1.12, 6, 14), material, 0, 0.88, 0, group);
    const band = mesh(new THREE.TorusGeometry(0.315, 0.025, 5, 20), brass, 0, 0.8, 0, group);
    band.rotation.x = Math.PI / 2;
    box(0.055, 0.85, 0.065, 0, 0.95, 0.305, brass, group);
    return group;
  }
  const player = capsule(0, 4, metal);
  const opponent = capsule(
    TARGET.x,
    TARGET.z,
    new THREE.MeshStandardMaterial({ color: '#6d5447', roughness: 0.8, metalness: 0.25 }),
  );
  // The capsules are the fallback when the art cannot load, not a loading screen: hidden until the rigs are in or the load has
  // failed. Owner's phone 2026-09-21: they showed for the split second between the first frame and the versus still's own
  // load (main.ts shows the card only once its image arrives), so every opponent switch flashed two blocks in the arena.
  player.visible = opponent.visible = false;
  let warriors: Awaited<ReturnType<typeof loadWarriors>> | undefined;
  const dustFeet: (THREE.Object3D | null)[] = [],
    dustPositions = Array.from({ length: 4 }, () => new THREE.Vector3());
  // The player, and the chosen opponent; each rig plays the clips of the weapon the simulation gives that side (moves.ts OPPONENTS, duel.ts initialDuel).
  const weapons = Promise.all([playerWeapon, opponentLevel]).then(([weapon, level]) =>
    initialPractice(731, opponentAt(OPPONENTS[opponentId], level), weapon).duel.fighters.map((f) => f.weapon) as [WeaponId, WeaponId]);
  let builtFoeWeapon: WeaponId | undefined;
  // Every roster body except the held ones (roster.ts `hold`): glob patterns must be literals, so the exclusions are spelled out here —
  // tests/roster.test.ts checks the two lists agree. Held GLBs stay in src/assets for their lanes; they are just not in the beta bundle.
  // 106 ONLY (Dom 2026-10-26: "no risk of going back to the old 65 rig"; docs/PLAN.md section 10). The loader table holds the 106-joint
  // Psyche and Minotaur and nothing else: no 65 body (psyche.glb, minotaur.glb, warrior.glb, veteran.glb) is addressable, so none is
  // built into dist/ (data/build.json notShipped; test/rig-bones.test.mjs is the lock). No query picks a body.
  const fighterUrls: Record<string, string> = { '../assets/psyche-106.glb': new URL('../assets/psyche-106.glb', import.meta.url).href, '../assets/minotaur-106.glb': new URL('../assets/minotaur-106.glb', import.meta.url).href };
  // The opponent's own cut of loot.glb (scripts/split-loot.mjs): none in V3. The Minotaur wears no kit (foe-body.ts) and the old cuts
  // (carriers-minotaur.glb, carriers-veteran.glb) are skinned to the 65 rig, so they are not shipped.
  const carrierUrls: Record<string, string> = {};
  // The foe's rig file: his 106 body from the table above, except the on-demand beasts (boar, bear), which are public/beasts/<id>.glb fetched by an absolute site-root URL (src/fight/beast-scale.ts).
  const foeUrl = (id: string): string => ON_DEMAND_BEASTS.has(id) ? beastBodyUrl(id) : fighterUrls[`../assets/${foeBodyFile(id, ROSTER[id as OpponentId].body)}.glb`]!;
  // Combat waits for the arena's worker textures and props too (arena.ready never rejects): their GPU uploads then land during the
  // loading screen instead of stalling the first exchange (measured 69 ms p95 in the first window when they arrived late under load).
  // The load is retryable: a phone that sleeps mid-download aborts the fetch (2 MiB of the Nightborn's 5.1 MB, 2026-09-21 09:15) and
  // the page is restored with the failure still showing. The capsules stay and the failure is reported (V3 has no retry hook: V1's
  // `retryArt` was never called here).
  // Tier dressing (Block A; Phase L #589/#606 re-applied): the opponent wears his own armour pieces from his cut, the kit for `tier` (loot.ts
  // kitWorn: no crest at Recruit), the rung he is met at, grades.ts tierAt(marks), set by the entry point at load and at each rematch. The cut
  // downloads beside his rig so he is dressed before the opened-waist bake and never pops armour on mid-fight; a failed cut leaves him
  // undressed, not the fight. His kit shows the grade of that rung (rank-tint.ts: a tint over the piece's own maps).
  let tier: Tier | undefined;
  let playerTier: Tier | undefined;   // the player's own rung (the rank the HUD shows), for his weapon's shape; setPlayerTier
  // Two-handed or not is the weapon he FIGHTS with (the sim's, `weapons` below): the Centurion's gladius brings his scutum up (SCOPE:76).
  let twoHanded = weaponOf(OPPONENTS[opponentId].weapon).grip === 'two-hand';
  const kitFile = foeKitFile(opponentId);   // null: no kit on him (the shieldless Minotaur, foe-body.ts)
  const carrierUrl = kitFile && kitWorn(opponentId, false).length ? carrierUrls[`../assets/loot/${kitFile}.glb`] : undefined;
  // V3 fast load (2026-10-26): his kit (armour, helmet, scutum; 3.0 MB) streams in after the first frame instead of gating it, then he is
  // dressed and his opened-waist bake is taken again, as a rematch at a new rung does (setTier). ?load=v1: V1's order, the kit beside his rig.
  const lateKit = !(typeof location !== 'undefined' && /[?&]load=v1\b/.test(location.search));
  const loadKit = () => loadLoot(carrierUrl!).then((pieces) => { carried = pieces; }).catch((error: unknown) => { captureException(error); });
  // The late kit's download starts with the rigs (2026-10-26, after a ~3.4 s pop-in measured on #16): only the dressing waits for the first
  // frame, so by then the file is usually in and the pop-in is the dress step. A failed fetch is forgotten, so a retry fetches again.
  let kitFetch: Promise<THREE.SkinnedMesh[] | undefined> | undefined;
  const fetchKit = () => (kitFetch ??= loadLoot(carrierUrl!).catch((error: unknown) => { captureException(error); kitFetch = undefined; return undefined; }));
  let carried: THREE.SkinnedMesh[] | undefined;
  // Weapon shapes per rank (weapon-shapes.ts shapesFor): his weapon's file at the rung he is met at (`tier`, a ?tier= pin included), the
  // player's own at the player's own rung (`playerTier`, the career rank). A shape is GPT's painted finish: no rank tint over it. The dev
  // flag's table, else the shipping one.
  const shapeTable = (typeof location === 'undefined' ? undefined : shapesFlag(location.search)) ?? SHIPPING_SHAPES;
  const shapes = new Map<string, Promise<THREE.Mesh | undefined>>();
  const remoteSwords = new RemoteSwords<THREE.Mesh>();   // other players' bodies wear the hero's shape whenever it lands or changes (presence/sword.ts)
  // The two sword files (~1 MB each, PNG) still start once the rigs are in, not beside them (tried 2026-10-26: on a 9 Mbps link they
  // share the wire with the rigs and the fight became playable ~1.6 s later; they never gated playable). Until they land each fighter holds
  // his weapon's own part.
  function reshape() {
    const loaded = warriors; if (!loaded || !shapesOn(shapeTable)) return;   // no shape file on: today's parts, no call at all
    const urls = () => shapesFor({ player: loaded.playerWeapon, opponent: builtFoeWeapon ? foeDrawnWeapon(opponentId, builtFoeWeapon) : builtFoeWeapon, opponentId, playerLevel: levelOf(playerTier ?? 'Recruit'), opponentLevel: levelOf(tier ?? 'Recruit') }, shapeTable);
    for (const who of ['player', 'opponent'] as const) {
      const actor = loaded[who], url = urls()[who];
      if (!url) { actor.reshape(undefined); continue; }
      if (!shapes.has(url)) shapes.set(url, loadShape(url).catch((error: unknown) => { captureException(error, { tags: { shape: url } }); return undefined; }));
      void shapes.get(url)!.then((mesh) => { if (warriors === loaded && urls()[who] === url) { actor.reshape(mesh); if (who === 'player') remoteSwords.set(mesh);((globalThis as { __weaponShapes?: Record<string, string | undefined> }).__weaponShapes ??= {})[who] = mesh ? url : undefined; } });   // the stills and phone check read what went on
    }
  }
  const shieldsOn = SHIPPING_SHIELDS.has(opponentId), shields = new Map<string, THREE.SkinnedMesh>(), shieldLoads = new Set<string>();
  function dress() {
    if (!warriors) return;
    warriors.opponent.grade(tier);   // his weapon wears the rung he is met at, like his kit
    reshape();
    if (carried) {
      const kit = kitWorn(opponentId, twoHanded, tier), url = shieldFor(opponentId, levelOf(tier ?? 'Recruit'), shieldsOn), painted = url ? shields.get(url) : undefined;
      // The painted shield (shields.ts) in place of his own board once its file is in; until then, or if it never loads, he wears the board he has.
      const pieces = carried.filter((piece) => lootWorn(piece, kit)).filter((piece) => !painted || piece.userData.slot !== 'Shield');
      warriors.opponent.wear(painted ? [...pieces, painted] : pieces, (id, error) => captureException(error, { tags: { loot: id } }), () => tier);
      if (url && !painted && !shieldLoads.has(url)) { shieldLoads.add(url); loadShield(url).then((piece) => { shields.set(url, piece); dress(); }).catch((error: unknown) => captureException(error, { tags: { shield: url } })); }
    }
  }
  // Rank look (rank-look.ts): the dev flag's file, else his shipping look at the rung he is met at (`tier`, set before the fight is playable;
  // `?tier=` picks it for stills). It streams once the rung is set and the rigs are in (setTier, before the Fight tap; else at first playable)
  // and swaps on at an idle beat of the fight (render()). The gate reads its state and stamps off window.__rankLook.
  const rankLookFlagged = typeof location === 'undefined' ? undefined : rankLookFlag(location.search);
  // Dev/gate only: `?off=lookbake` (the old `?lookbake=off` still works) takes no waist-cut bake for the look at all (before or after the swap), so an opened kill finds it pending
  // and the fallback runs (Lead: condition 3 tested once with the bake forced off).
  const lookBakeOff = typeof location !== 'undefined' && lookBakeOffFrom(location.search);
  let lookForced = false;   // this fight's look plays runThrough for opened, with no waist-cut bake (RUN_THROUGH_LOOKS)
  const rankLookUrl = () => rankLookFlagged ?? rankLookFor(opponentId, levelOf(tier ?? 'Recruit'), PHONE);
  let lookStarted: string | undefined | null = null;   // the look file the stream started on (undefined: none at that rung), null before it starts
  // A swapped body (foe-body.ts: the Minotaur) wears no rank look: the look files are fitted to the V1 body.
  const rankLook = (rankLookFlagged || (SHIPPING_LOOKS[opponentId] && !foeBodySwapped(opponentId))) ? rankLookStream(() => { const url = lookStarted = rankLookUrl(); lookForced = runThroughForced(url); (globalThis as { __rankLookForced?: boolean }).__rankLookForced = lookForced; return url ? loadRankLook(url).then(async (look) => {
    if (nightBronzeApplies(theme.id, opponentId, levelOf(tier ?? 'Recruit'))) toneNightBronze(look);
    // Warm-up before the swap frame: its shaders compile (with this scene's lights and shadows) and its maps upload now, off the beat.
    // Measured without it: a 150 ms swap frame at 375 (goblin-l3, dist).
    const warm = new THREE.Group(); for (const draw of look.draws) warm.add(draw);
    // A context lost meanwhile (Sentry FRANKENDOM-3: createShader returns null, shaderSource throws) skips the warm-up, as a lost draw does
    // (main.ts): the look still swaps in, and three recompiles and re-uploads on the first frame after the context is restored.
    const lost = () => renderer.getContext().isContextLost();
    const compiled = renderer.compileAsync(warm, camera, scene).then(() => null, (error: unknown) => error);   // an error is captured, a compile that never settles (a lost context) is given up on after the bound
    if (await settleWithin('scene-look', compiled, COMPILE_BOUND_MS)) { const error = await compiled; if (error && !lost()) throw error; }
    // One map per frame: uploading them all in one task was a 59–111 ms long task right before the swap (goblin-l3-6269f661, row 4).
    // The look is ready a frame after the last, so the swap never shares a frame with an upload.
    const maps = new Set<THREE.Texture>(); warm.traverse((o) => { if (o instanceof THREE.Mesh) for (const v of Object.values(o.material as object)) if (v instanceof THREE.Texture) maps.add(v); });
    const frame = () => new Promise((done) => requestAnimationFrame(done));
    for (const map of maps) { await frame(); if (!lost()) renderer.initTexture(map); }
    // His waist-cut bake with the look in, before the swap (Lead's ruling on #1025 row C): steps within LOOK_BAKE_MS a frame, each step itself
    // bounded (opened.ts); the gate reads every step. A kill meanwhile cuts his base look, which is still the one on screen.
    const rig = lookBakes(anyOfTemplate('bisect', (f) => supportsFinishers(opponentId, f)), url, lookBakeOff) ? warriors?.opponent : undefined, g = globalThis as { __rankLookSteps?: [number, string][] };
    rig?.prepareLook(look);
    for (let done = !rig; !done;) {
      await frame(); const start = performance.now();
      do { const step = rig!.stepLook(); if (!step) { done = true; break; } (g.__rankLookSteps ??= []).push([step.ms, step.label]); done = step.done; } while (!done && performance.now() - start < LOOK_BAKE_MS);
    }
    await frame();
    return look;
  }) : undefined; }, (look) => { const swapped = warriors?.opponent.wearLook(look); if (swapped) (globalThis as { __rankLookOn?: typeof swapped }).__rankLookOn = swapped; }, captureException) : undefined;
  if (rankLook) (globalThis as { __rankLook?: typeof rankLook }).__rankLook = rankLook;
  const ragdoll = typeof location === 'undefined' ? null : foeRagdollFor(location.search, opponentId);   // null under ?physics=v1 or for a foe without one
  ragdoll?.listenTaps(canvas, camera);   // data/physics.json cut.tap: a tap on his frozen corpse cuts the part it strikes (presentation only)
  let loading: Promise<void> | null = null;
  function loadFighters(): Promise<void> {
    if (warriors) return Promise.resolve();
    if (loading) return loading;
    assetStatus('Loading warriors…', 'loading');
    loading = Promise.all([
    weapons.then((pair) => {
      twoHanded = weaponOf(pair[1]).grip === 'two-hand'; builtFoeWeapon = pair[1];
      // A weapon his rig does not bake (ROSTER.weapon is what veteran.glb carries) comes from its equip file, grafted as the player's is.
      // The weapon his drawn body bakes (foe-body.ts: the Minotaur's is veteran.glb's trident; a 106 body bakes none) needs no file; a drawn weapon over his (foe-weapon.ts) is its own file.
      const opponentEquip = pair[1] === foeBakedWeapon(opponentId, ROSTER[opponentId].weapon) ? undefined : foeEquipUrl(opponentId, pair[1]);
      const foe = foeUrl(opponentId);
      const load = (hero: string) => loadWarriors(hero, foe, pair, WEAPON_LOOK[pair[0]]?.baked ? undefined : equipUrl(pair[0]), (error) => captureException(error, { tags: { equip: pair[0] } }), opponentEquip, SHIELD_CARRIERS.has(opponentId));
      // 106 only: both sides load their 106 files. A failure is NOT papered over with another body (the 65 fallback is gone, Dom 2026-10-26):
      // it is a RigLoadError, reported and shown on screen by the catch below, so a broken 106 file is noticed.
      const hero = fighterUrls[`../assets/${heroRigFile(heroBodyFile())}.glb`];
      const loadBody = () => (hero && foe ? load(hero) : Promise.reject(new Error(`no 106 body in the loader table for ${hero ? opponentId : heroBodyFile()}`)))
        .catch((error: unknown) => { throw new RigLoadError([hero, foe], error); });
      return loadBody();
    }),
    arena.ready,
    carrierUrl && !lateKit ? loadKit() : null,
    carrierUrl && lateKit && !carried ? void fetchKit() : null,   // started, never awaited here
  ])
    .then(async ([loaded]) => {
      warriors = loaded;
      // Which body file each side drew, so each 106 body takes its own baked clips (data/rig.json clips106).
      loaded.player.useClips106(heroRigFile(heroBodyFile())); loaded.opponent.useClips106(foeBodyFile(opponentId, ROSTER[opponentId as OpponentId].body));
      loaded.player.prefetchClips(CLIP_LOAD.hero);   // the hero's special clips first (data/rig.json clipLoad), before the opponent's finisher set and the first frame
      sizeBeast(loaded, opponentId);   // a beast is drawn at the size it is met walking (src/fight/beast-scale.ts)
      dress();   // his kit before the opened-waist bake, so the cut body wears what the whole one did
      playerDrawn(loaded.playerWeapon);
      if (anyOfTemplate('bisect', (f) => supportsFinishers(opponentId, f))) loaded.opponent.prepareOpened();
      for (const proxy of [player, opponent]) {
        proxy.traverse((object) => {
          if (object instanceof THREE.Mesh) object.geometry.dispose();
        });
        proxy.clear();
      }
      if (flinches) { pivots[0].clear(); pivots[1].clear(); pivots[0].add(loaded.player.anchor); pivots[1].add(loaded.opponent.anchor); player.add(pivots[0]); opponent.add(pivots[1]); }
      else { player.add(loaded.player.anchor); opponent.add(loaded.opponent.anchor); }
      ragdoll?.attach(opponent, loaded.opponent, loaded.player).catch(captureException);   // his presentation ragdoll (ragdoll.ts): the chunk loads after the first frame
      player.visible = opponent.visible = true;
      for (const rig of [loaded.player, loaded.opponent])
        for (const name of ['foot_l', 'foot_r']) dustFeet.push(boneOf(rig.anchor, name) ?? null);
      dress();
      // Every shader the fight can need is compiled here, behind the welcome card, instead of the first time its object is drawn
      // mid-fight (a landed blow's sparks and blood, a stain, the graded wall): compile() walks the whole scene, hidden pools included.
      // Not measurable on the Mac (2026-09-25, phone tier, ×4 CPU throttle, paired runs within noise): a one-off compile outside the sampled
      // window, and headless software GL cannot show a phone GPU's first-draw stall. The case is that stall, on the first blow of a fight.
      await gfxReady;   // the lift's fog patch lands before the first compile; its programs (keyed on the composer's target) are compiled below too
      renderer.compile(scene, camera);
      gfx?.compile();
      // Then the first frame itself, behind the card (first-frame.ts): maps a slice per frame, one draw, at most 4 s, on macrotask yields and the clock only (never rAF or a timer: a paused page clock must still boot); a hidden tab skips it.
      if (typeof document === 'undefined' || !document.hidden) {
        const maps = new Set<THREE.Texture>(); scene.traverse((o) => { if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Line) for (const material of [o.material].flat()) for (const v of Object.values(material as object)) if (v instanceof THREE.Texture) maps.add(v); });
        performance.mark('first-frame-begin');
        const how = await warmFirstFrame({ textures: [...maps], upload: (t) => renderer.initTexture(t as THREE.Texture), draw: () => { if (gfx) gfx.render(); else renderer.render(scene, camera); }, frame: () => new Promise<void>((done) => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); done(); }; c.port2.postMessage(0); }), budgetMs: 4000, sliceMs: 10, now: () => performance.now(), lost: () => renderer.getContext().isContextLost() });
        performance.mark('first-frame-' + how);
      }
      assetStatus('', 'ready');
      if (carrierUrl && lateKit && !carried) void fetchKit().then((pieces) => {
        if (!pieces || carried || !warriors) return;
        carried = pieces;
        dress(); performance.mark('kit-dressed');
        if (!lookForced) warriors.opponent.rebakeOpened();
        performance.mark('kit-on');   // the load trace reads first-frame-* -> kit-on as the pop-in
        void renderer.compileAsync(scene, camera).catch(() => {});   // his kit's shaders, off the frame they first draw on
      });
      prefetchHamstrung();   // after ready, never before and never awaited: the loading card does not wait on a finisher that may not play
    })
    .catch((error) => {
      // A bare fighter after every retry (FRANKENDOM-5) names its file, the missing map and the tries, so the next event says which art failed.
      // A 106 body that failed (RigLoadError) is tagged rig: '106' with the files asked for, and says so on screen: nothing else is drawn in its place.
      const rig = error instanceof RigLoadError, cause: unknown = rig ? error.cause : error;
      const tags = { ...(cause instanceof MissingTextures ? { fighter: cause.url.split('/').pop(), missing: cause.missing, attempts: cause.attempts } : {}), ...(rig ? { rig: '106', files: error.files.join(' ') } : {}) };
      captureException(cause, Object.keys(tags).length ? { tags } : undefined);
      if (rig) (globalThis as { __rigLoadError?: { files: string[]; message: string } }).__rigLoadError = { files: error.files, message: String((cause as Error)?.message ?? cause) };   // the browser check reads it
      player.visible = opponent.visible = true;   // the capsules stand in so the fight is still readable while the notice offers a retry
      assetStatus(rig ? 'The fighters (106-joint rig) could not load, so they are not drawn. Reload to try again; the error has been reported.' : 'Warrior art could not load. Movement still works; tap here to retry.', 'failed');
    })
    .finally(() => {
      loading = null;
      firstFrameDrawn(() => void renderer.compileAsync(scene, camera).catch(() => {}));   // the blood textures start now (late-art.ts; ?load=v1 / ?blood=v1: fetched before)
    });
    return loading;
  }
  const ready = loadFighters();
  const dropTexture = impactTexture(false),
    splatTexture = impactTexture(true);
  const finisherBlood = createFinisherBlood(splatTexture);
  scene.add(finisherBlood.group);
  let bloodSources: ReturnType<typeof finisherBloodSources> = [];
  const fx = createFightFx({ scene, dropTexture, splatTexture });   // moving the Pit's contact effects into src/fight/fx.ts
  const { splats, bodyWounds, blade } = fx;
  let bloodMode: BloodMode = 'red';
  let finisherOverride: FinisherId | null = null; // dev/test pick (owner 2026-09-19): swap which finisher plays on a ceremonial kill; null = the spec's selection
  // Rotation memory (owner 2026-09-20: never the same ceremony twice in a row). `lastFinisher` is the ceremony the previous
  // fight showed and feeds this fight's pick; `fightFinisher` is this fight's, rolled into `lastFinisher` when the next
  // fight starts (practice.finish clears on rematch). Presentation state only — the simulation never sees it.
  let lastFinisher: FinisherId | null = null, fightFinisher: FinisherId | null = null;
  let bodyLatch: boolean | null = null;   // ragdollBody() on the first frame of this finish (?ragdoll=finishers: V1's camera, blood and sound, the victim's body the ragdoll; one answer for the whole kill)
  let bakeFallback: FinisherId | false | null = null;  // the finisher this finish plays instead (bakeSafeFinisher), false for none, null undecided
  let openedReach = 0;   // Opened: farthest horizontal extent of what lies on the sand, from the fallen's origin (camera fit)
  // Decapitation (owner 2026-09-18): the severed head, its ballistic state, and the killing blow's heading (the pop direction).
  let severHead: SeveredHead | null = null;
  // Fetched on demand (src/fight/hamstrung-assets.ts), never in loadFighters: the killer's clip, the victim's clip and his weapon-drop bake.
  const hamstrungAssets = createHamstrungAssets(
    // Each body its own data/rig.json clips106 file (characters.ts clipLoader; the killer is the player, the victim the opponent). No 65 clip JSON is shipped: a body without its file rejects (the plain death).
    async () => { const [{ default: killer }, { default: victim }] = await Promise.all([(warriors?.player.clipLoader('Fin_Hamstrung') ?? noClip('Fin_Hamstrung'))(), (warriors?.opponent.clipLoader('Death_Hamstrung') ?? noClip('Death_Hamstrung'))()]); return { killer, victim }; },
    (loaded: NonNullable<typeof warriors>, { killer, victim }) => {
      const parse = (clip: unknown) => THREE.AnimationClip.parse(clip as Parameters<typeof THREE.AnimationClip.parse>[0]);
      loaded.player.adoptClip('Fin_Hamstrung', parse(killer));
      loaded.opponent.adoptClip('Death_Hamstrung', parse(victim), HAMSTRUNG_SOURCE_PELVIS);
      loaded.opponent.prepareHamstrung();
    },
    (error) => { captureException(error); },
  );
  const hamstrungOk = () => hamstrungAssets.ready(warriors);
  let hamstrungLatch: boolean | null = null;   // hamstrungOk() as it stood on the first frame of this finish: the picture and the audio keep one answer for the whole kill
  // The kill picks its finisher (once Hamstrung is in the rotation), so the clips are fetched in the background once the fight is ready, on idle. Silent on failure: hamstrungPick keeps the plain death.
  const prefetchHamstrung = () => { const start = () => { wantHamstrung(true); }; if (typeof requestIdleCallback === 'function') requestIdleCallback(start, { timeout: 4000 }); else setTimeout(start, 1500); };
  // A 106 body without a clips106 file for its side of the scene (data/rig.json) fetches nothing: the kill is the plain death.
  const wantHamstrung = (prefetch = false) => { if (((prefetch && CLIP_LOAD.afterFirstFrame.includes('Fin_Hamstrung')) || isTemplate(finisherOverride, 'hamstring')) && warriors && HAMSTRUNG_VICTIMS.includes(opponentId) && warriors.player.takesBaked('Fin_Hamstrung') && warriors.opponent.takesBaked('Death_Hamstrung')) void hamstrungAssets.request(warriors); };
  // Execution (src/fight/execution.ts) loads on the picker's choice only (no idle prefetch: it re-skins 12 poses), never as part of ready, and a failure is the plain death.
  const executionAssets = createHamstrungAssets(
    async () => { const [{ default: killer }, { default: victim }] = await Promise.all([(warriors?.player.clipLoader('Fin_Execution') ?? noClip('Fin_Execution'))(), (warriors?.opponent.clipLoader('Death_Execution') ?? noClip('Death_Execution'))()]); return { killer, victim }; },
    (loaded: NonNullable<typeof warriors>, { killer, victim }) => {
      const parse = (clip: unknown) => THREE.AnimationClip.parse(clip as Parameters<typeof THREE.AnimationClip.parse>[0]);
      loaded.player.adoptClip('Fin_Execution', parse(killer));
      loaded.opponent.adoptClip('Death_Execution', parse(victim), EXECUTION_SOURCE_PELVIS, EXECUTION_FLOOR_MARKS);
      loaded.opponent.prepareExecution();
    },
    (error) => { captureException(error); },
  );
  const executionOk = () => executionAssets.ready(warriors);
  let executionLatch: boolean | null = null;   // executionOk() as it stood on the first frame of this finish (one answer for picture and audio)
  let executionSteps: THREE.Vector3 | null = null; // where the killer's anchor stands for the cut, solved once per finish
  let finishHold = 0; // Hamstrung: seconds left of the hit-stop a blow holds the scene for (the clock and both rigs stand still, the camera and the blood run on)
  let hamstrungSteps: { knee: THREE.Vector3; back: THREE.Vector3 } | null = null; // where the killer's anchor stands for each blow, solved once per finish
  // The hero's death fall (zone loop, data/respawn.json heroDeath.fallSeconds via main.ts heroFall; 0 = off): the sim is stopped at his death, so his Death clip is driven by this clock instead, and holds its last frame.
  let fallSeconds = 0, fallAge = 0;
  const heroFalls = <P extends { pose: string; progress: number }>(p: P, dead: boolean, dt: number): P => {
    if (!fallSeconds || !dead) { fallAge = 0; return p; }
    fallAge += dt; return { ...p, pose: 'death', progress: Math.min(1, fallAge / fallSeconds) };
  };
  let finishClock = -1; // the finisher corpse animates at 0.75× on a presentation clock (owner 2026-09-18: savour it) — the sim window stays 144 ticks
  // Finisher complete (Lead brief 2026-09-22, for Web's loot panel): has the ceremony FINISHED PLAYING, and at what finish
  // age did it first say so. Latched from the scene's own state in the frame loop below, never from a delay; cleared with
  // the finish. `finishCompleteAt` is the number the FINISHER_SECONDS table in src/fight/finishers.ts was measured from.
  let finishComplete = false,
    finishCompleteAt = 0;
  // Hades' Shadow (special-fx.ts): loaded the first frame a fighter carries a special share, so a fight without Special Moves never fetches it.
  // The page's special (`?special=<id>`, special-look.ts) picks an entry in the registry (special-modes.ts): its effect, bones, pose, knee-dip. No entry = Hades' cloud.
  const preview = resolveSparringPreview(globalThis.location?.search ?? '', CARRIED_WEAPONS);
  // Per-side selections use the common caster adapter, including an explicit foe preset.
  const specialId = 'selection' in preview && preview.selection ? null : preview.special, mode = specialId ? SPECIAL_MODES[specialId] : undefined;
  let slam = 0; const slams = [0, 0], specialLifts = [-0.28, -0.28];   // the Centurion's shield arm this frame (characters.ts slam): the mode's held() sets it from the cast
  let specialFx: import('./special-fx.ts').SpecialFx | ModeFx | undefined, specialFxLoading = false;
  let previewGeneration = 0, previewEpoch = -1, previewTick = -1, previewBlocked = false;
  let previewGroup: THREE.Scene | undefined;
  const previewLighting = createTitheLighting(scene);
  const previewBackground = scene.background instanceof THREE.Color ? scene.background.clone() : null;
  const bossRing = typeof location !== 'undefined' && telegraphFlag(location.search);   // ?telegraph=1 look-test: the boss ring (boss-telegraph.ts); a spell cast's tell is always on
  const castTells = [createBossTelegraph(scene), createBossTelegraph(scene)] as const;   // one ring per caster side, drawn under the other fighter
  const runtimeSpecial = specialId ? null : createSpecialPresentation(scene, theme.exposure, camera);
  const signatures = createSignatures(scene, opponentId);   // the opponent's signature effect (signature.ts); the ruled variant (SHIPPED) unless the admin select or ?signature= asks
  let heading = Math.PI;
  const standoffOn = typeof location !== 'undefined' && standoffFlag(location.search);   // on by default, ?standoff=0 off (standoff.ts)
  const standoff = standoffClock();   // ms of frame time since the versus card lifted (frame dt, so a stepped harness clock plays it too); -1 before
  const rig = createCameraRig(camera);
  // The zone's other bosses (live-zone phase 1b, src/zone/spawns.ts): the sim holds ONE foe, the live rig above; every other standing spawn is a frozen copy of that rig as it stands at rest
  // (the same SkeletonUtils clone the corpse copy is, ragdoll.snapshotRig: geometry, materials and the weapon shared, its own bones; no mixer, no ragdoll, no sim) at its spot.
  // main.ts hands the list each frame (`idleFoes`); the copies are made once, the first frame the live foe stands at rest after the draw-in, and are only moved, shown or hidden after that.
  // Per-spawn bodies (Dom 2026-10-27, mixed bosses; docs/BOSS-BODIES.md): a spawn whose body (the zone row's `body`, else its kind's profile body, foe-body.ts spawnBodyFile) is not the live rig's is drawn from ITS body's rig, loaded
  // once into `bodyAssets` (keyed by the 106 file stem, the body id) the first time a spawn of that body stands or attacks. A spawn in the live body (every spawn of the shipped zone) takes the paths below unchanged.
  const liveBody = foeBodyFile(opponentId, ROSTER[opponentId as OpponentId].body);
  type SpawnRef = { kind: string; body?: string };
  const bodyOfSpawn = (s: SpawnRef): string => spawnBodyFile(s.kind, ROSTER[s.kind as OpponentId]?.body ?? ROSTER[opponentId as OpponentId].body, s.body);
  const bodyAssets = new Map<string, { asset?: Awaited<ReturnType<typeof loadFoeBody>>; failed?: boolean }>();
  /** The loaded asset of boss body `file` (undefined while it loads or when it failed: the spawn is then not drawn, the fight goes on). The first ask starts the load. */
  function bodyRig(file: string) {
    let entry = bodyAssets.get(file);
    if (!entry) {
      const row: { asset?: Awaited<ReturnType<typeof loadFoeBody>>; failed?: boolean } = entry = {}; bodyAssets.set(file, row);
      const url = fighterUrls[`../assets/${file}.glb`], weapon = builtFoeWeapon;
      if (!url || !weapon) row.failed = true;
      else void loadFoeBody(url, weapon === foeBakedWeapon(opponentId, ROSTER[opponentId].weapon) ? undefined : foeEquipUrl(opponentId, weapon), (error) => captureException(error, { tags: { equip: weapon } }), SHIELD_CARRIERS.has(opponentId))
        .then((asset) => { row.asset = asset; }, (error: unknown) => { row.failed = true; captureException(error); });
    }
    return entry.asset;
  }
  /** One more actor in boss body `file` (the live body: the opponent's own spawnFoe), or undefined while that body's rig is not loaded. */
  function actorOfBody(file: string): NonNullable<typeof warriors>['opponent'] | undefined {
    if (!warriors) return undefined;
    if (file === liveBody) return warriors.spawnFoe();
    const asset = bodyRig(file);
    if (!asset || !builtFoeWeapon) return undefined;
    const actor = warriors.spawnBody(asset, builtFoeWeapon);
    actor.useClips106(file);   // this body's own baked clips (data/rig.json clips106)
    return actor;
  }
  let idleList: readonly { x: number; z: number; heading: number }[] = [];
  let idleOther: readonly { id: string; x: number; z: number; heading: number; file: string }[] = [];   // the standing spawns in another body than the live rig
  const idleOtherActors = new Map<string, { group: THREE.Group; actor: NonNullable<typeof warriors>['opponent']; pose: ReturnType<typeof actorPose>; guard: Practice['duel']['fighters'][1]['guardDirection']; holding: boolean }>();
  const idleCopies: THREE.Group[] = [];
  function syncIdleFoes(practice: Practice, dt: number) {
    const rest = standoffOn ? standoff.age >= STANDOFF_MS : standoff.age >= 0, foe = practice.duel.fighters[1];
    const atRest = !!warriors && opponent.visible && rest && (!ragdoll || ragdoll.state === 'alive') && !practice.finish && foe.health === foe.maxHealth && (foe.phase === 'sheathed' || foe.phase === 'ready') && foe.age >= 0;
    if (idleOther.length || idleOtherActors.size) {
      const seen = new Set<string>();
      for (const at of idleOther) {
        seen.add(at.id);
        let entry = idleOtherActors.get(at.id);
        if (!entry && atRest) {   // made the first frame the live foe stands at rest (as the copies are), and only if that body's rig has loaded
          const actor = actorOfBody(at.file);
          if (actor) {
            const group = new THREE.Group(), pose = actorPose(practice, 1);
            group.add(actor.anchor); sizeBeast({ opponent: actor }, opponentId); actor.setUpright(readyOffset(opponentId)); scene.add(group);
            entry = { group, actor, pose, guard: foe.guardDirection, holding: holdingCharge(foe) };
            idleOtherActors.set(at.id, entry);
          }
        }
        if (!entry) continue;
        entry.group.visible = true; entry.group.position.set(at.x, 0, at.z); entry.group.rotation.y = at.heading;
        const { pose } = entry;
        entry.actor.update(0, dt, pose.pose, pose.progress, pose.attack, pose.contact, 0, 0, entry.guard, CHARGE_LEAN[opponentId] ?? null, entry.holding, pose.span ?? null);   // the rest pose it was made in, held (speed 0)
      }
      for (const [id, entry] of idleOtherActors) if (!seen.has(id)) entry.group.visible = false;
    }
    if (atRest)
      while (idleCopies.length < idleList.length) {
        const holder = new THREE.Group(), { copy } = snapshotRig(opponent, false);
        copy.position.set(0, 0, 0); copy.rotation.set(0, 0, 0);   // the live foe's own place and heading: the holder carries the copy's now
        copy.traverse((o) => { if (o !== copy && o.scale.x <= WARM_SCALE) o.visible = false; });   // the cut caps' warm-up specks (ragdoll.ts prepareCutArt) are the live rig's to hide, not a copy's to carry
        holder.add(copy); scene.add(holder); idleCopies.push(holder);
      }
    idleCopies.forEach((holder, i) => {
      const at = idleList[i];
      holder.visible = !!at;
      if (at) { holder.position.set(at.x, 0, at.z); holder.rotation.y = at.heading; }
    });
  }
  // The zone's live attackers (src/fight/attacker-bout.ts): one animated rig per attacking boss, built the first time it is needed from the foe's own asset, then pooled (hidden when it lets go).
  let liveList: readonly { id: string; practice: Practice; spawn?: SpawnRef }[] = [], frameWiden = 1;
  const liveFoes = new Map<string, { group: THREE.Group; actor: NonNullable<typeof warriors>['opponent']; x: number; z: number }>();
  function syncLiveFoes(dt: number) {
    const seen = new Set<string>();
    if (warriors) for (const { id, practice: p, spawn } of liveList) {
      seen.add(id);
      let live = liveFoes.get(id);
      if (!live) {
        const actor = actorOfBody(spawn ? bodyOfSpawn(spawn) : liveBody), group = new THREE.Group();
        if (!actor) continue;   // another body's rig is still loading (or failed): not drawn yet, the fight goes on

        group.add(actor.anchor); sizeBeast({ opponent: actor }, opponentId); actor.setUpright(readyOffset(opponentId)); scene.add(group);
        live = { group, actor, x: p.enemy.x, z: p.enemy.z }; liveFoes.set(id, live);
      }
      const pose = actorPose(p, 1), f = p.duel.fighters[1], speed = dt > 0 ? Math.hypot(p.enemy.x - live.x, p.enemy.z - live.z) / dt : 0;
      live.x = p.enemy.x; live.z = p.enemy.z;
      live.group.visible = true; live.group.position.set(p.enemy.x, 0, p.enemy.z); live.group.rotation.y = p.enemy.heading;
      live.actor.fatigue(p.fatigue[1], FOE_TUNE[opponentId]);
      live.actor.update(speed, dt, pose.pose, pose.progress, pose.attack, pose.contact, 0, 0, f.guardDirection, CHARGE_LEAN[opponentId] ?? null, holdingCharge(f), pose.span ?? null);
    }
    for (const [id, live] of liveFoes) if (!seen.has(id)) live.group.visible = false;
  }
  // Kill dip: the killing blow darkens the frame 6 % for two frames and recovers over two more — the cinematic reserve (GAME_SPEC 80/15/5),
  // never on an ordinary hit. Applied around the draw on top of whatever exposure the renderer holds, so nothing else has to know.
  let dip = 0; // frames remaining, counted down per drawn frame while time passes
  const DIP_FRAMES = 4, DIP_DEPTH = 0.06;
  const blockHeavy = [false, false]; // which fighter's standing block just caught a heavy (his recoil is deeper while `blocked` lasts)
  // The canvas box is the LAYOUT viewport, read from the root element, never innerWidth / innerHeight: iOS Safari reports the zoomed
  // VISUAL viewport there, so a pinch that slipped past main.ts's guard shrank the canvas to the zoomed area (the top half of the
  // phone, the page background below it, the HUD floating over the void, the camera framed for the wrong aspect) and it stayed that
  // way (live on a50f22f, 2026-09-23; scripts/viewport-check.mjs). The stylesheet owns the box (#world: fixed, inset 0, 100 %); the
  // renderer only sizes its drawing buffer to match, writing no inline style. The two screen projections below use the same numbers.
  let width = 1, height = 1;
  let lensZoom = 1, lensWide: WideRow | null = null, lensBoost = 1;   // the page's lens zoom (setZoom), the wide-screen row (setWide, null = none) and the boost the screen's shape gets from it (camera-zoom.ts wideBoost: exactly 1 on a portrait screen)
  const applyLens = () => {
    lensBoost = lensWide ? wideBoost(camera.aspect, lensZoom, lensWide) : 1;
    camera.fov = fovForZoom(lensBoost === 1 ? lensZoom : lensZoom * lensBoost);
    setLensBoost(lensBoost);
    camera.updateProjectionMatrix();
  };
  const resize = () => {
    width = document.documentElement.clientWidth || innerWidth; height = document.documentElement.clientHeight || innerHeight;
    camera.aspect = width / height;
    applyLens();
    renderer.setSize(width, height, false);
    look?.setSize(width, height, renderer.getPixelRatio());
    gfx?.setSize(width, height);
  };
  resize();
  window.addEventListener('resize', resize);
  return {
    // V3: only the members src/client/main.ts calls. V1's journal, zone, gear-room, loot and test-probe hooks are gone (docs/V3-OWED-2026-10-26.md §3, PR 1).
    renderer,
    /** The lens zoom (data/fight.json camera.zoom, camera-zoom.ts): 1 = the 51 degree lens as it was. Presentation only. */
    setZoom(zoom: number): void { lensZoom = zoom; applyLens(); },
    /** The wide-screen lens row (data/fight.json camera.wide, camera-zoom.ts): extra zoom on a landscape or desktop screen, none on a portrait one. The zone's attacker back-off reads `lensBoost`. */
    setWide(row: WideRow | null): void { lensWide = row; applyLens(); },
    get lensBoost(): number { return lensBoost; },
    // --- other players (presence wiring, src/presence/draw.ts; called only with ?presence=) --------------------------------------------------------------------------------------------------
    // One more body of the hero's own rig, cloned from the asset the hero was built from (buildWarriors clones: no fetch, no parse, the hero's materials and programs), hung in the scene on its own group.
    // Null until the hero's rig is built. No collider, no sim: the caller poses it. Not in the fight: nothing else in this file knows it exists.
    spawnRemote() {
      if (!warriors) return null;
      const actor = buildWarriors(warriors.asset, undefined, [warriors.playerWeapon, warriors.playerWeapon], true).player, group = new THREE.Group();
      group.visible = false; group.add(actor.anchor); actor.setUpright(readyOffset('hero')); scene.add(group);
      // His sword: the hero's own painted shape (no new fetch). remoteSwords (presence/sword.ts) gives it now if it has landed, else when reshape() above resolves it, and again at a rank change. Same weapon node, hand and held transform; the mesh is shared, never disposed with the pooled body.
      remoteSwords.add(actor);
      return { group, update: (speed: number, dt: number, contact: number) => { actor.update(speed, dt, 'ready', 0, 'light', contact, 0); } };
    },
    // --- end other players ------------------------------------------------------------------------------------------------------------------------------------------------------------------
    startStandoff() { standoff.start(); },   // main.ts, the moment the versus card lifts: idempotent (an art retry re-emits 'ready' mid-fight)
    restartStandoff() { standoff.restart(); },   // main.ts nextFight: the rematch plays the draw-in again (a no-op with ?standoff=0)
    // The rung the opponent is met at (grades.ts tierAt): at load and at each rematch, never mid-fight. A change re-dresses him and bakes the
    // opened waist again (between fights).
    setTier(next: Tier) {
      if (next !== tier) {
        tier = next; dress(); if (carried && !lookForced) warriors?.opponent.rebakeOpened();
        if (lookStarted !== null && rankLookUrl() !== lookStarted) rankLook?.restart();   // a prefetch on the old rung's file never goes on
      }
      // His look starts streaming now that his rung is known, after his rig (never ahead of it on the wire); a rig that failed leaves it to first playable.
      void ready.then(() => rankLook?.prefetch(), () => {});
    },
    // The player's own rung (grades.ts tierAt of his marks): his weapon's shape (weapon-shapes.ts). A ?tier= pin never moves it.
    setPlayerTier(next: Tier) { if (next === playerTier) return; playerTier = next; dress(); },
    // The ceremony the previous fight showed (main.ts hands it to the audio resolver so both sides pick alike).
    previousFinisher(): FinisherId | null {
      return lastFinisher;
    },
    hamstrungInstalled() { return hamstrungLatch ?? hamstrungOk(); },   // main.ts feeds this to hamstrungPick for the audio
    executionInstalled() { return executionLatch ?? executionOk(); },   // and this to executionPick
    get yaw() {
      return rig.yaw;
    },
    // The ONE call site of a foe respawn (src/client/main.ts rematch, zone only), called BEFORE his sim body is reset: the dead rig is left as it lies beside the live one
    // (ragdoll.leaveCorpse: cuts, pieces and caps kept, it ages out on data/physics.json corpse.keepSeconds), and the live rig is rebuilt whole. False = nothing to leave.
    respawnFoe(): boolean { return ragdoll?.leaveCorpse() ?? false; },
    // The zone's other standing bosses (main.ts, every frame): where each stands (the pit's frame) and which way it faces. Drawn as frozen copies of the live foe at rest (syncIdleFoes).
    // `spawn` (optional, the spawn's kind and its zone row's `body`): a spawn in another body than the live rig is drawn from that body's own rig (bodyRig); absent or the live body: the frozen copies as before.
    idleFoes(list: readonly { x: number; z: number; heading: number; id?: string; spawn?: SpawnRef }[]) {
      idleList = list.every((e) => !e.spawn || bodyOfSpawn(e.spawn) === liveBody) ? list : list.filter((e) => !e.spawn || bodyOfSpawn(e.spawn) === liveBody);
      idleOther = list.flatMap((e) => (e.spawn && e.id !== undefined && bodyOfSpawn(e.spawn) !== liveBody ? [{ id: e.id, x: e.x, z: e.z, heading: e.heading, file: bodyOfSpawn(e.spawn) }] : []));
    },
    get idleFoeCount() { return idleCopies.filter((c) => c.visible).length + [...idleOtherActors.values()].filter((e) => e.group.visible).length; },   // the stills and the cost table read how many copies are on screen
    // The zone's live attackers (real-time aggro, main.ts every frame): each is another boss in its own fight with the hero, drawn as a second animated rig of the foe's own asset (spawnFoe: shared geometry, materials and
    // programs, its own bones and mixer), posed from that fight's own Practice. Presentation only; the first boss is the live rig above and is never in this list.
    liveFoes(list: readonly { id: string; practice: Practice; spawn?: SpawnRef }[]) { liveList = list; },
    setWiden(k: number) { frameWiden = k; },   // main.ts every frame: how far the lock camera backs off for the attackers on him (data/respawn.json attackers.camera); 1 = none
    get liveFoeCount() { return [...liveFoes.values()].filter((l) => l.group.visible).length; },
    heroFall(seconds: number) { fallSeconds = seconds; },   // the hero's death fall, seconds (0 = none: he keeps the pose the sim left)
    stopTour() {
      rig.stopTour();
    },
    // World → CSS pixels for DOM overlays (damage numbers). Null when the point is behind the camera.
    project(point: [number, number, number]): [number, number] | null {
      const v = new THREE.Vector3(point[0], point[1], point[2]).project(camera);
      if (v.z > 1) return null;
      return [(v.x * 0.5 + 0.5) * width, (-v.y * 0.5 + 0.5) * height];
    },
    // End-of-fight timing for the HUD (owner 2026-09-22: nothing over the body until the finisher camera has settled; the text
    // fades while the arena cam tours). `settled`: the push-in/reveal has run its course, or SETTLE seconds of finish age when
    // there is no push. `touring`: the arena cam is orbiting the fallen (from TOUR.afterSettle seconds after settled first
    // latches — the player always gets at least that much readable text — until a touch or Rematch). `age`: seconds since the
    // finish began, 0 outside a finish. Poll it in the frame loop; the rig owns the clocks.
    // `complete` is the finisher-complete event Web's loot panel keys on: the ceremony has finished playing (see the latch in
    // the frame loop). `completeAt` is the finish age in seconds when it first latched — 0 until then.
    finishPhase(): { settled: boolean; touring: boolean; age: number; complete: boolean; completeAt: number } {
      return { settled: rig.settled, touring: rig.touring, age: rig.finishAge, complete: finishComplete, completeAt: finishCompleteAt };
    },
    // Effects consume the simulation's events for the frame; they never infer contact from animation.
    // `frozen`: the frame loop is in a hit-stop. Effects (sparks, blood, camera kick) keep running on dt; the rigs evaluate their pose for the
    // frozen tick without advancing their clocks — the one impact pause is the frame loop's.
    render(
      state: State,
      locked: boolean,
      dt: number,
      practice: Practice,
      events: CombatEvent[] = practice.events,
      frozen = false,
      specialEpoch = 0,
      specialFight?: SpecialFightIdentity,
      roamed = false,   // the zone loop (src/fight/respawn.ts): the hero has walked off after the kill; the sim is over, his body is free, the camera follows him and the corpse stays as it fell
    ) {
      if (arena.group.scale.x !== PLAY_SCALE) { arena.group.scale.setScalar(PLAY_SCALE); const ring = arena.group.getObjectByName('boundary'); if (ring) ring.visible = PLAY_SCALE === 1; }   // the painted boundary ring is the full arena's circle: in a smaller one the wall is the edge   // the floor, ring, backdrop and props come inward with the play circle of the fight on screen (play-radius.ts; Match sets it)
      if (specialId && (previewEpoch !== specialEpoch || practice.duel.tick < previewTick)) {
        previewGeneration++; specialFx?.clear(); previewBlocked = false; if (!specialFx) { specialFxLoading = false; if (previewGroup) disposeSpecialGroup(previewGroup); }
      }
      previewEpoch = specialEpoch; previewTick = practice.duel.tick;
      if (specialId && !specialFx) for (const event of events) {
        if (event.type === 'SpecialStarted' && event.actor === 1) previewBlocked = false;
        if ((event.type === 'SpecialFizzled' || event.type === 'SpecialInterrupted') && event.actor === 1) { previewGeneration++; previewBlocked = true; specialFxLoading = false; if (previewGroup) disposeSpecialGroup(previewGroup); }
      }
      const blow = events.find((e) => e.type === 'Hit' || e.type === 'GuardBroken' || impactTier(e) === 'special'),   // a landed melee special is a blow when its hit-stop row has frames (hit-impact.ts; the trunk row is 0)
        contact = blow || events.some((e) => e.type === 'Blocked' || e.type === 'Parried');
      const killed = events.find((e) => e.type === 'Killed');
      bloodEdge.render(events, practice.duel);
      if (warriors) rankLook?.tick(practice);   // a rank look swaps on only at an idle beat, never with a finish playing
      const fightWeapons = [practice.duel.fighters[0].weapon, practice.duel.fighters[1].weapon] as const;
      if (!practice.finish) { hamstrungLatch = null; executionLatch = null; } else { hamstrungLatch ??= hamstrungOk(); executionLatch ??= executionOk(); }
      finisherOverride = ragdollFinisher(events);   // ?rules=m4 cut.precedence: a head-zone kill the evaluator cuts is the plain death too. ?ragdoll=always (data/physics.json finisher): his death is the plain one, as a ragdoll; null otherwise (ragdoll.ts)
      const picked = executionPick(hamstrungPick(finisherOverride, hamstrungLatch === true), executionLatch === true);   // one id for the picture and (main.ts) the cues
      const resolved = practice.finish
        ? resolveExecution(opponentId, practice.finish, fightWeapons, picked, lastFinisher, resolveHamstrung(
            opponentId,
            practice.finish,
            fightWeapons,
            hamstrungPick(finisherOverride, hamstrungLatch === true),
            lastFinisher,
            resolveFinisher(opponentId, practice.finish, fightWeapons, isTemplate(picked, 'hamstring', 'execute') ? null : picked, lastFinisher),
          ))
        : null;
      // Decided once per finish, on its first frame: an opened kill with his waist-cut bake still pending plays bakeSafeFinisher's pick (rank-look.ts).
      if (!practice.finish) { bakeFallback = null; bodyLatch = null; }
      else if (bakeFallback === null) {
        const forced = lookForced && rankLook?.state() === 'on';
        bodyLatch = practice.finish.victim === 1 && ragdollBody(resolved);   // the ragdoll is the body: no waist-cut bake is read, so none is pending
        const safe = bodyLatch ? resolved : bakeSafeFinisher(resolved, practice.finish.victim, forced || !!warriors?.opponent.bakePending(), (f) => supportsFinishers(opponentId, f));
        bakeFallback = safe !== resolved ? safe : false;
        if (bakeFallback) { const log = `rank look: ${forced ? 'forced at this rank (RUN_THROUGH_LOOKS)' : 'opened kill with the waist-cut bake pending'}: ${resolved} -> ${safe}`; console.warn(log); ((globalThis as { __rankLookFallback?: string[] }).__rankLookFallback ??= []).push(log); }
      }
      const finisher = bakeFallback || resolved;
      if (resolved) fightFinisher = resolved;   // the rotation follows the pick, not the fallback
      else if (!practice.finish && fightFinisher) { lastFinisher = fightFinisher; fightFinisher = null; }
      // A rank look's waist-cut rebake, one step a frame (Lead ruling on #918: whole, it froze the kill for 1983 ms at CPU ×4). The gate
      // reads each step's ms; an opened kill that lands before the last step finishes it in openWaist() and is flagged.
      if (rankLook && warriors) {
        const g = globalThis as { __rankLookSteps?: [number, string][]; __rankLookDrained?: boolean };
        if (killed && isTemplate(resolved, 'bisect') && practice.finish?.victim === 1 && !lookForced && warriors.opponent.bakePending()) g.__rankLookDrained = true;
        const step = lookBakeOff || lookForced ? null : warriors.opponent.stepOpened(); if (step) (g.__rankLookSteps ??= []).push([step.ms, step.label]);
      }
      // A shelved row (the Quiet One left the game, Dom 2026-09-27; nothing picks it) keeps its clip but plays the plain fall.
      const posed = finisher ? poseOf(finisher) : null, finisherPose = (isShelved(finisher) ? null : posed) as Parameters<NonNullable<typeof warriors>['opponent']['update']>[2] | null;   // a pose word characters.ts plays (a shelved clip's word is not one)
      const ragBody = bodyLatch === true && finisher !== null;   // ?ragdoll=finishers: his body is the ragdoll (data/physics.json finisherCuts); the clock, camera, blood and sound stay the finisher's own
      const detailedBlood = finisher !== null && practice.finish?.victim === 1;
      if (
        practice.health === practice.enemyMaxHealth &&
        practice.playerHealth === practice.maxHealth &&
        (fx.state.lastHealth < practice.enemyMaxHealth || fx.state.lastPlayerHealth < practice.maxHealth)
      ) {
        finisherBlood.reset();
        bloodEdge.reset();
        bloodSources = [];
        fx.state.impact = 0;
        splats.clear(false);
        bodyWounds.clear();
        signatures.clear();
        specialFx?.clear(); runtimeSpecial?.clear();
        blade.set(false, warriors, bloodMode);
        if (severHead) {
          scene.remove(severHead.group);
          severHead.group.traverse((o) => {
            if (o instanceof THREE.Mesh) o.geometry.dispose();
          });
          severHead = null;
        }
        warriors?.player.unsever();
        warriors?.opponent.unsever();
        if (anyOfTemplate('bisect', (f) => supportsFinishers(opponentId, f)) && !lookForced) warriors?.opponent.prepareOpened();
        if (hamstrungOk()) warriors?.opponent.prepareHamstrung();
        if (executionOk()) warriors?.opponent.prepareExecution();
      } // a fresh match: both bars full again
      fx.onContact({ events, practice, state, dt, blow, contact, killed, finisher, detailedBlood, camera: rig.camera, kick: rig, blockHeavy, warriors, dustFeet, dustPositions, footDust, flinches, burstPool, feel, right, opponentId, bloodMode,
        DIP_FRAMES, setDip: (frames) => { dip = frames; } });   // the camera kick, the sand, the sparks, the wounds, the splats and the blade blood: src/fight/fx.ts
      fx.update(dt);   // moving the Pit's contact effects into src/fight/fx.ts: the clash sparks, the generic sparks, the splats
      // The severed head (decapitation): gravity, a bounce or two, then a roll without slipping until friction stops it.
      if (severHead) {
        severHead.group.visible = !bloodHidden(bloodMode);
        stepSeveredHead(severHead, dt);
      }
      let animationDt = frozen ? 0 : dt;   // a Hamstrung blow's hit-stop zeroes it below
      if (theme.light?.flicker) {   // firelight: the key light breathes and sways a little, so the long shadows move
        const t = performance.now() / 1000, f = theme.light.flicker;
        sun.intensity = sunPower * (look?.key ?? 1) * (1 + f * (0.6 * Math.sin(t * 7.3) + 0.4 * Math.sin(t * 13.1 + 1.3)));
        sun.position.set(sunHome.x + 0.7 * Math.sin(t * 1.7), sunHome.y + 0.3 * Math.sin(t * 2.9), sunHome.z + 0.7 * Math.cos(t * 1.3));
      }
      arena.update(animationDt, events, rig.started ? camera : undefined, { tick: practice.duel.tick, fighters: [state, practice.enemy] });   // the crowd culls against the settled camera; the first frame draws everyone; the lorarii pace on the sim tick and watch the fighters
      const dx = state.x - player.position.x,
        dz = state.z - player.position.z,
        ex = practice.enemy.x - opponent.position.x,
        ez = practice.enemy.z - opponent.position.z;
      const travel =
        rig.started && dt > 0 ? Math.hypot(state.x - player.position.x, state.z - player.position.z) / dt : 0;
      const enemyTravel =
        rig.started && dt > 0
          ? Math.hypot(practice.enemy.x - opponent.position.x, practice.enemy.z - opponent.position.z) / dt
          : 0;
      player.position.set(state.x, 0, state.z);
      opponent.position.set(practice.enemy.x, 0, practice.enemy.z);
      const playerDefence = defenceReaction(practice),
        enemyDefence = defenceReaction(practice, true);
      // Both actors present the same per-move combat state; the rig's clip and contact pose come from the simulation's data.
      // A special's strike drives the target down (the hurt clip until the pilot's own head-hit), unless he is already acting.
      runtimeSpecial?.prepare(specialEpoch, events, practice.duel.fighters, practice.duel.tick, !!practice.finish, specialFight);
      for (const e of events) if (e.type === 'SpecialLanded' && e.target !== undefined) { specialStruck[e.target] = practice.duel.tick; specialLifts[e.target] = (runtimeSpecial?.mode(e.actor) ?? mode)?.lift ?? -0.28; }
      const struck = (p: ReturnType<typeof actorPose>, side: 0 | 1): ReturnType<typeof actorPose> => {
        const since = practice.duel.tick - specialStruck[side];
        return p.pose === 'ready' && since >= 0 && since < SPECIAL_STRUCK ? { ...p, pose: 'hit', progress: since / SPECIAL_STRUCK } : p;
      };
      // A mode may pose the caster through its cast (Red Wind's held blade, Shield Quake's raised shield); presentation only.
      slam = 0; slams[0] = slams[1] = 0;
      const held = (p: ReturnType<typeof actorPose>, side: 0 | 1): ReturnType<typeof actorPose> => {
        const h = runtimeSpecial ? runtimeSpecial.held(p, side, practice.duel.fighters) : mode?.held?.(p, side, practice.duel.fighters);
        if (h?.slam !== undefined) { slam = h.slam; slams[side] = h.slam; }
        return h?.pose ?? p;
      };
      standoff.advance(dt * 1000);
      const stand = (p: ReturnType<typeof actorPose>) => standoffOn && standoff.age >= 0 && !practice.finish ? standoffPose(p, standoff.age) : p;
      const mine = heroFalls(stand(struck(held(actorPose(practice, 0), 0), 0)), practice.finish?.victim === 0, animationDt),
        theirs = stand(struck(held(actorPose(practice, 1), 1), 1));
      // The knee-dip: the struck body drops fast and rises back over SPECIAL_STRUCK (presentation only: the sim's body never moves).
      for (const [side, body] of [[0, player], [1, opponent]] as const) {
        const since = practice.duel.tick - specialStruck[side];
        // A mode may lift him (Red Wind's column scours UP through him, Shield Quake's ripple bursts up under him); the claw drops him.
        if (since >= 0 && since < SPECIAL_STRUCK) body.position.y = specialLift(runtimeSpecial ? specialLifts[side] : (mode?.lift ?? -0.28)) * (since < 6 ? since / 6 : 1 - (since - 6) / (SPECIAL_STRUCK - 6));
      }
      // Run Through revision (owner 2026-09-18): the blade STAYS through the body. The killer holds the downward drive
      // (Fin_RunThrough, keyed to settle by a quarter of the window then hold) on the same 0.75× finisher clock; the
      // tableau freezes at progress 1 for as long as the corpse kneels (practice.finish holds until rematch).
      const runThroughHold = !roamed && isTemplate(finisher, 'impale') && practice.finish?.victim === 1;   // roamed: the killer's held finisher pose and steps are over (his body is the stick's)
      const hamstrungFinish = isTemplate(finisher, 'hamstring') && practice.finish?.victim === 1;
      const executionFinish = isTemplate(finisher, 'execute') && practice.finish?.victim === 1;
      const killerPose = !roamed && practice.finish?.victim === 1 && finisher !== null ? finisherRow(finisher)?.body?.killer?.pose : undefined;   // the killer's own body in the finisher (its row's body.killer): Run Through's held drive, Hamstrung's and Execution's strikes
      // Owner 2026-09-18: savour the killshot — a cinematic finisher's corpse animates at 0.75× on a presentation clock that
      // may run past the sim window (the spec's "presentation may hold past the window": no simulation slow motion, the
      // 144-tick death and the hit-stop are untouched). A plain-death pick plays at full speed, exactly like an unadorned kill.
      // Hamstrung runs its own length (HAMSTRUNG_BEATS.duration) and stops the clock for `hold` seconds at each blow: the clock lands exactly on the beat, then waits.
      // Execution runs EXECUTION_BEATS.duration authored seconds at EXECUTION_BEATS.speed (the spec's 0.75x) on the same clock, with its held half-second baked into the clips: no hit-stop here.
      if (!practice.finish) { finishClock = -1; finishHold = 0; hamstrungSteps = null; executionSteps = null; }
      else if (finishClock < 0) finishClock = 0;
      else if (hamstrungFinish && finishHold > 0) { finishHold = Math.max(0, finishHold - dt); animationDt = 0; }
      else {
        let next = Math.min(1, finishClock + (hamstrungFinish ? dt / HAMSTRUNG_BEATS.duration : executionFinish ? (dt * EXECUTION_BEATS.speed) / EXECUTION_BEATS.duration : (dt * 0.75) / (RULES.death / 60)));
        if (hamstrungFinish) for (const beat of [HAMSTRUNG_BEATS.knee, HAMSTRUNG_BEATS.back]) if (finishClock < beat && next >= beat) { next = beat; finishHold = HAMSTRUNG_BEATS.hold; break; }
        finishClock = next;
      }
      const victimProgress = finisherPose && practice.finish?.victim === 1 ? finishClock : theirs.progress;
      if (hamstrungFinish && !hamstrungSteps && warriors) {
        // Once, with both actors faced as they fell: the victim's knee and back at the two blows, then where the killer must stand for each.
        player.rotation.y = state.heading;
        opponent.rotation.y = practice.enemy.heading;
        const contacts = warriors.opponent.hamstrungContacts();
        hamstrungSteps = { knee: warriors.player.hamstrungStep(HAMSTRUNG_BEATS.knee, contacts.knee), back: warriors.player.hamstrungStep(HAMSTRUNG_BEATS.back, contacts.back) };
      }
      if (executionFinish && !executionSteps && warriors) {
        // Once, with both actors faced as they fell: the victim's nape at the cut, then where the killer must stand for the blade to meet it.
        player.rotation.y = state.heading;
        opponent.rotation.y = practice.enemy.heading;
        executionSteps = warriors.player.executionStep(EXECUTION_BEATS.strike, warriors.opponent.executionContacts().nape);
      }
      const mineGait = runtimeSpecial ? runtimeSpecial.gait(0, practice.duel.fighters, dx * Math.sin(state.heading) + dz * Math.cos(state.heading) < -0.0001 ? -travel : travel, killerPose ?? (playerDefence?.pose || mine.pose)) : gait(mode, 0, practice.duel.fighters, dx * Math.sin(state.heading) + dz * Math.cos(state.heading) < -0.0001 ? -travel : travel, killerPose ?? (playerDefence?.pose || mine.pose));   // a mode may have him running or backing (special-modes.ts travel)
      warriors?.player.update(
        mineGait.travel,
        animationDt,
        mineGait.pose,
        runThroughHold || (!roamed && (hamstrungFinish || executionFinish)) ? finishClock : (playerDefence?.progress ?? mine.progress),
        // V3 (data/hero-clips.json): a chained thrust is the stab too (V1 shows it with the riposte's clip); ?clips=v1 keeps V1's
        heroClipsOn() && mine.attack === 'riposte' && practice.duel.fighters[0].lastMove === 'thrust' ? 'thrust' : mine.attack,
        mine.contact,
        travel && dt ? (dx * Math.cos(state.heading) - dz * Math.sin(state.heading)) / (travel * dt) : 0,
        practice.result === 'blocked' ? (blockHeavy[0] ? 1.5 : 1) * Math.max(0, 1 - practice.resultAge / 12) : 0,
        practice.duel.fighters[0].guardDirection,
        null,
        false,
        mine.span ?? null,   // V3 blend rows (anim-blend.ts): the move's ticks, honoured only while this pose and progress are shown
      );
      warriors?.player.opening(practice.opening?.side === 0 ? practice.opening : null);   // opening-pose.ts
      warriors?.opponent.opening(practice.opening?.side === 1 ? practice.opening : null);
      if (!slouch) { warriors?.player.setUpright(readyOffset('hero')); warriors?.opponent.setUpright(readyOffset(opponentId)); }
      warriors?.player.setStance(stance);   // ?look=stances (stance-pose.ts): the hero's stance, look test only
      warriors?.player.fatigue(practice.fatigue[0], fatigueRead ? { read: true } : undefined);   // fatigue.ts, slice 1: the hero winded and tired (breathing, hunch, sagging blade arm); gassed, the second wind and the foes follow
      warriors?.player.slam(runtimeSpecial ? slams[0] : 0);
      warriors?.opponent.slam(runtimeSpecial ? slams[1] : slam);
      warriors?.opponent.fatigue(practice.fatigue[1], fatigueRead ? { ...FOE_TUNE[opponentId], read: true } : FOE_TUNE[opponentId]);   // fatigue-tune.ts: this body's own breathing
      const theirGait = runtimeSpecial ? runtimeSpecial.gait(1, practice.duel.fighters, ex * Math.sin(practice.enemy.heading) + ez * Math.cos(practice.enemy.heading) < -0.0001 ? -enemyTravel : enemyTravel, enemyDefence?.pose || (ragBody ? theirs.pose : finisherPose ?? theirs.pose)) : gait(mode, 1, practice.duel.fighters, ex * Math.sin(practice.enemy.heading) + ez * Math.cos(practice.enemy.heading) < -0.0001 ? -enemyTravel : enemyTravel, enemyDefence?.pose || (ragBody ? theirs.pose : finisherPose ?? theirs.pose));
      warriors?.opponent.update(
        theirGait.travel,
        animationDt,
        theirGait.pose,
        enemyDefence?.progress ?? victimProgress,
        theirs.attack,
        theirs.contact,
        enemyTravel && dt
          ? (ex * Math.cos(practice.enemy.heading) - ez * Math.sin(practice.enemy.heading)) /
              (enemyTravel * dt)
          : 0,
        practice.result === 'enemyBlocked' ? (blockHeavy[1] ? 1.5 : 1) * Math.max(0, 1 - practice.resultAge / 12) : 0,
        practice.duel.fighters[1].guardDirection,
        CHARGE_LEAN[opponentId] ?? null,
        holdingCharge(practice.duel.fighters[1]),
        theirs.span ?? null,
      );
      if (isTemplate(finisher, 'bisect') && practice.finish?.victim === 1 && !ragBody) {
        warriors?.opponent.openWaist(victimProgress, bloodMode);
      }
      if (isTemplate(finisher, 'cleave') && practice.finish?.victim === 1 && !ragBody)
        warriors?.opponent.splitCrown(victimProgress, bloodMode);
      ragdoll?.frame(animationDt, events, practice.finish, finisher, !bloodHidden(bloodMode));   // data/physics.json: his stagger on a landed blow, his plain death as a ragdoll (presentation only)
      // Decapitation (owner 2026-09-18): when the seeded rotation picks it, the head comes off just after the skull-gives jolt
      // (the clip's first 9 %) — baked from the rig at that pose, popped along the killing blow, ballistic to a stop. Blood
      // 'off' keeps the head on: gore is presentation, like the rest of the layer.
      if (
        warriors &&
        isTemplate(finisher, 'sever') &&
        !ragBody &&   // ?ragdoll=finishers: the head is the package's cut (finisherCuts), not V1's baked flying head
        !bloodHidden(bloodMode) &&
        !severHead &&
        practice.finish?.victim === 1 &&
        victimProgress >= 0.05 &&
        victimProgress < 1
      ) {
        const headCutPosition = warriors.opponent.boneWorld('neck_01')!;
        const built = warriors.opponent.sever();
        if (built) {
          const headCut = new THREE.Object3D();
          headCut.name = 'BloodHeadCut';
          headCut.position.copy(headCutPosition).sub(built.group.position);
          built.group.add(headCut);
          scene.add(built.group);
          // A short lateral fall clears the victor's silhouette in the original front camera.
          const axis = new THREE.Vector3(
            practice.enemy.x - state.x,
            0,
            practice.enemy.z - state.z,
          ).normalize();
          severHead = launchSeveredHead(built.group, built.radius, axis, fx.state.killHeading);
          ragdoll?.finisherCut();   // the package's cut of the same head (data/physics.json cut.sever): its event and gear go on the page's list
        }
      }
      brass.color.set(practice.threat ? '#e7a35e' : '#ad9365');
      if (practice.health) opponent.rotation.y = practice.enemy.heading;
      const blend = 1 - Math.exp(-dt * 8);
      heading += wrapAngle(state.heading - heading) * blend;
      if (['kick', 'attack', 'roll', 'guard', 'hurt', 'dead'].includes(practice.phase))
        heading = state.heading;
      player.rotation.y = heading;
      // The victims' flinch (armfeel.ts): frozen frames hold the pose, a finisher's own body takes over from the first frame it plays. The root group
      // and the collider never move; the pose is the rig's pivot, a lean about the hip and a nudge along the blow, in the root's own frame.
      if (burstPool) burstPool.update(dt);
      if (flinches) for (const side of SIDES) {
        const root = side ? opponent : player, pivot = pivots[side], flinch = flinches[side];
        if (practice.finish && finisher !== null && !isPlainDeath(finisher)) flinch.clear();
        const pose = flinch.update(frozen ? 0 : dt);
        if (!flinch.active) { pivot.position.set(0, 0, 0); pivot.quaternion.identity(); continue; }
        const r = root.rotation.y, c = Math.cos(r), s = Math.sin(r), mag = Math.hypot(pose.dx, pose.dz) || 1;
        const dx = (pose.dx * c - pose.dz * s) / mag, dz = (pose.dx * s + pose.dz * c) / mag;   // the blow's direction in the root's frame (unit)
        lean.setFromAxisAngle(axis.set(dz, 0, -dx), pose.lean);
        hip.set(0, 0.9 * (side ? OPPONENTS[opponentId].scale : 1), 0);
        pivot.quaternion.copy(lean);
        pivot.position.copy(hip).sub(swing.copy(hip).applyQuaternion(lean)).add(swing.set(dx * mag, 0, dz * mag));
      }
      // Poses and headings must be final before aiming at the animated torso. Simulation positions stay untouched.
      const chest = runThroughHold ? warriors?.opponent.boneWorld('spine_02') : null;
      if (chest) warriors?.player.aimBladeAt(chest, Math.min(1, finishClock / 0.25));
      if (roamed && warriors) warriors.player.anchor.position.set(0, 0, 0);   // the killer's finisher steps (below) are over: he walks from where the sim put him
      if (!roamed && hamstrungFinish && warriors && hamstrungSteps) {
        // The killer steps in to the knee, then on to the back (the same two steps solved above), the blade held on each wound as the blow lands.
        const smooth = (t: number) => { t = THREE.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
        const first = finishClock < 0.4;
        if (first) warriors.player.anchor.position.copy(hamstrungSteps.knee).multiplyScalar(smooth(finishClock / HAMSTRUNG_BEATS.knee));
        else warriors.player.anchor.position.lerpVectors(hamstrungSteps.knee, hamstrungSteps.back, smooth((finishClock - 0.4) / (HAMSTRUNG_BEATS.back - 0.4)));
        const target = warriors.opponent.boneWorld(first ? 'calf_r' : 'spine_02');
        const weight = first ? smooth((finishClock - 0.12) / 0.1) * (1 - smooth((finishClock - HAMSTRUNG_BEATS.knee) / 0.13)) : smooth((finishClock - 0.54) / 0.1);
        if (target) warriors.player.aimBladeAt(target, weight, false);
      }
      if (!roamed && executionFinish && warriors && executionSteps) {
        // The killer steps in behind the kneeling man over the first part of the clip and stands there through the held half-second; the arm turns onto the nape only
        // for the cut (the blade rises on the clip's own pose until then), and lets go as he falls.
        const smooth = (t: number) => { t = THREE.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
        warriors.player.anchor.position.copy(executionSteps).multiplyScalar(smooth((finishClock - 0.02) / (EXECUTION_BEATS.raise - 0.1)));
        const target = warriors.opponent.boneWorld('neck_01');
        const weight = smooth((finishClock - (EXECUTION_BEATS.strike - 0.05)) / 0.05) * (1 - smooth((finishClock - (EXECUTION_BEATS.strike + 0.03)) / 0.1));
        if (target) warriors.player.aimBladeAt(target, weight, false);
      }
      // The marks ride the final poses; a cinematic finisher's own gore takes over the victim's body (the plain death keeps his wounds).
      bodyWounds.update(dt, [warriors?.player.anchor ?? null, warriors?.opponent.anchor ?? null],
        [practice.playerHealth / practice.maxHealth, practice.health / practice.enemyMaxHealth], bloodMode,
        [!!practice.finish && practice.finish.victim === 0 && finisher !== null && !isPlainDeath(finisher), detailedBlood && !isPlainDeath(finisher)],
        camera.position);   // the eye for the facing test: the camera is unparented, so its position is world
      // The signature effect answers this frame's events after the poses are final; it stands down while a finisher plays (the marks stay),
      // and a body the finisher's own gore has taken over hides its marks with its wounds.
      signatures.render(dt, events, {
        fighters: practice.duel.fighters,
        roots: [warriors?.player.anchor ?? null, warriors?.opponent.anchor ?? null],
        scale: [1, OPPONENTS[opponentId].scale],
        yielding: !!practice.finish,
        bloodMode,
      }, camera.position, [!!practice.finish && practice.finish.victim === 0 && finisher !== null && !isPlainDeath(finisher), detailedBlood && !isPlainDeath(finisher)]);
      if (specialId && !previewBlocked && !specialFxLoading && practice.duel.fighters.some((f) => f.specialShare !== undefined)) {
        specialFxLoading = true; const token = previewGeneration, group = new THREE.Scene();
        group.name = 'special preview'; group.background = previewBackground?.clone() ?? null; previewGroup = group; scene.add(group);
        // ?look=schools on the ?special= preview too (spell-school.ts)
        void (mode ? mode.load(group, opponentId, theme.exposure, camera, previewLighting.forGroup(group)) : import('./special-fx.ts').then(({ createSpecialFx }) => createSpecialFx(group, opponentId))).then((fx) => { if (token !== previewGeneration) { fx.clear(); disposeSpecialGroup(group); return; } const school = schoolsFlag(globalThis.location?.search ?? '') && specialId ? SCHOOL_OF[specialId] : undefined; if (school) { const tint = schoolTinter(group, school, schoolsStrength(globalThis.location?.search ?? '')), draw = (fx as ModeFx).render.bind(fx); (fx as ModeFx).render = (...a: Parameters<typeof draw>) => { draw(...a); tint(); }; } specialFx = fx; }).catch((error) => { disposeSpecialGroup(group); if (token === previewGeneration) { specialFxLoading = false; previewBlocked = true; captureException(error); } });
      }
      if (specialFx) {
        previewLighting.beginFrame();   // the effect reads the bones its mode names: the feet for a ground effect, the heads for a cloud
        const feet = (w: NonNullable<typeof warriors>['player'] | undefined) => { const l = w?.boneWorld('foot_l'), r = w?.boneWorld('foot_r'); return l && r ? l.add(r).multiplyScalar(0.5).setY(Math.min(l.y, r.y)) : null; };
        const at = mode?.at === 'feet' ? [feet(warriors?.player), feet(warriors?.opponent)] as const : [warriors?.player.boneWorld('Head') ?? null, warriors?.opponent.boneWorld('Head') ?? null] as const;
        (specialFx as ModeFx).render(dt, events, practice.duel.fighters, practice.duel.tick, at, !!practice.finish, ...(mode?.extra?.(warriors) ?? []));
        if (mode?.hideTrail && specialStage(practice.duel.fighters[1])) { const trail = warriors?.opponent.anchor.getObjectByName('WeaponTrail'); if (trail) trail.visible = false; }   // the game's pale weapon trail streaks above a raised sword
      }
      for (const side of SIDES) {   // a melee special's own weapon trail (sandbox specialTrail rows): longer and firmer than the swing's, from `lead` ticks before the release to `tail` after
        const f = practice.duel.fighters[side], w = side === 0 ? warriors?.player : warriors?.opponent, row = f.skill && !f.spell ? specialTrailOf(f.skill) : undefined;
        const live = !!row && ((f.special ?? 0) > 0 ? (f.special ?? 0) <= row.lead : (f.specialRecover ?? 0) > RULES.special.recovery - row.tail);
        w?.specialTrail(live && row ? row : null);
        w?.trailScale(f.phase === 'attack' ? trailScale(side, f.lastMove ?? undefined) : 1);   // hero-special-fx.ts: the hero's Whirlwind swing's trail softer (data/fight.json specialFx)
      }
      for (const side of SIDES) (side === 0 ? warriors?.player : warriors?.opponent)?.specialMove(specialRoleOf(practice.duel.fighters[side]));   // the move's own clip (src/assets/special-clips.json)
      for (const side of SIDES) {
        const foe = (side === 0 ? warriors?.opponent : warriors?.player), l = foe?.boneWorld('foot_l'), r = foe?.boneWorld('foot_r');
        castTells[side].update(practice.duel.fighters[side], l && r ? l.add(r).multiplyScalar(0.5).setY(Math.min(l.y, r.y)) : null, practice.duel.tick, bossRing && side === 1);
      }
      if (runtimeSpecial) {
        const feet = (w: NonNullable<typeof warriors>['player'] | undefined) => { const l = w?.boneWorld('foot_l'), r = w?.boneWorld('foot_r'); return l && r ? l.add(r).multiplyScalar(0.5).setY(Math.min(l.y, r.y)) : null; };
        runtimeSpecial.render(dt, practice.duel.fighters, practice.duel.tick, [feet(warriors?.player), feet(warriors?.opponent)], [warriors?.player.boneWorld('Head') ?? null, warriors?.opponent.boneWorld('Head') ?? null], warriors, !!practice.finish);
        for (const side of SIDES) if (runtimeSpecial.mode(side)?.hideTrail && specialStage(practice.duel.fighters[side])) {
          const trail = (side === 0 ? warriors?.player : warriors?.opponent)?.anchor.getObjectByName('WeaponTrail'); if (trail) trail.visible = false;
        }
      }
      // A landed skill blow's flash and sparks in its move's colour (skill-impact.ts, the kit every skill ships on): after the poses settle.
      countSpecial('fx', skillImpact.fire(events, practice.duel.fighters, [1, OPPONENTS[opponentId].scale])); skillImpact.update(dt);   // ?debug=1 counter (special-counter.ts): the real spawns only
      if (specialShards) {   // a landed melee special throws its rows' chips off the contact, away from the attacker
        for (const e of events) {
          if (e.type !== 'SpecialLanded' || e.spell || e.target === undefined || e.target === e.actor || !e.move?.startsWith('skill_')) continue;
          const rows = specialShardsOf(e.move.slice('skill_'.length)), by = practice.duel.fighters[e.actor]!.body, to = practice.duel.fighters[e.target]!.body;
          if (rows.length) { impactPoint(e, practice.duel.fighters, [1, OPPONENTS[opponentId].scale], shardAt); for (const row of rows) countSpecial('fx', specialShards.burst(row, shardAt.x, shardAt.y, shardAt.z, to.x - by.x, to.z - by.z)); }
        }
        specialShards.update(dt);
      }
      impactFx.fire(events, practice.duel.fighters); impactFx.update(dt); missileFx.burst(events, practice.duel.fighters); missileFx.update(practice.duel.tick, practice.duel.fighters); woundNotice.update(practice.duel.fighters, dt);
      if (miasmaMark) { miasmaMark.fire(events); miasmaMark.update(dt, practice.duel.fighters, [1, OPPONENTS[opponentId].scale], [warriors?.player.boneWorld('Head') ?? null, warriors?.opponent.boneWorld('Head') ?? null]); }

      // The Witch-fire skill's glow, gout and embers (witchfire.ts), read off the sim's clock on the final poses.
      witchfire.update(dt, practice.duel.fighters, [warriors?.player.anchor ?? null, warriors?.opponent.anchor ?? null]);
      // A landed Witch-fire chars the struck body (scorch.ts), in the same mark pool: it stays for the fight and clears with the wounds.
      scorch(events, practice.duel.fighters, [warriors?.player.anchor ?? null, warriors?.opponent.anchor ?? null], [1, OPPONENTS[opponentId].scale], signatures.marks);
      bloodSources =
        detailedBlood && warriors
          ? finisherBloodSources(finisher!, opponent, severHead?.group ?? null, practice.finish?.location)
          : [];
      finisherBlood.update(dt, detailedBlood ? finisher : null, victimProgress, bloodSources, bloodMode);
      // Read feet after the rigs and headings settle; only grounded locomotion kicks up sand.
      const canScuff = (pose: string, speed: number) =>
        ['sheathed', 'ready', 'guard'].includes(pose) && speed > 0.25 && speed < 6;
      footDust.update(
        animationDt,
        dustFeet.map((foot, i) => foot?.getWorldPosition(dustPositions[i]) ?? null),
        [
          canScuff(mine.pose, travel),
          canScuff(mine.pose, travel),
          canScuff(theirs.pose, enemyTravel),
          canScuff(theirs.pose, enemyTravel),
        ],
      );
      look?.update([warriors?.player.anchor, warriors?.opponent.anchor], dustFeet.length === 4 ? dustPositions : []);
      // Reach: the farthest horizontal extent of what actually lies on the sand — Opened's pieces — from the fallen's origin,
      // for the side-view fit.
      // Measured only while the victim clip still moves things, then frozen; monotonic, and its growth is rate-limited so
      // the camera's back-off never exceeds the reveal's per-frame step when a toppling piece's bounds jump (check 20).
      if (isTemplate(finisher, 'bisect') && practice.finish?.victim === 1 && warriors && victimProgress < 1 && !ragBody) {
        const anchor = warriors.opponent.anchor, subject = anchor.getObjectByName('Opened');
        let measured = 0;
        if (subject?.visible) {
          const origin = anchor.getWorldPosition(new THREE.Vector3());
          for (const piece of subject.children) {
            if (!piece.visible || !piece.children.length) continue;
            const box = new THREE.Box3().setFromObject(piece, true);
            if (box.isEmpty()) continue;
            for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) measured = Math.max(measured, Math.hypot(x - origin.x, z - origin.z));
          }
        }
        openedReach = Math.min(Math.max(openedReach, measured), openedReach + 0.015);   // ≤ 1.5 cm of reach per frame
      } else if ((isTemplate(finisher, 'execute') || (ragBody && isTemplate(finisher, 'bisect'))) && practice.finish?.victim === 1 && warriors && victimProgress < 1) {   // the ragdoll's Opened: the side view's reach is read off his extremities, as Execution's
        // He pitches forward a body's length away from the killer: the side view must have room for where he lands (the same measure, over his extremities).
        const anchor = warriors.opponent.anchor, origin = anchor.getWorldPosition(new THREE.Vector3());
        let measured = 0;
        for (const name of ['Head', 'hand_l', 'hand_r', 'foot_l', 'foot_r']) { const p = warriors.opponent.boneWorld(name); if (p) measured = Math.max(measured, Math.hypot(p.x - origin.x, p.z - origin.z)); }
        openedReach = Math.min(Math.max(openedReach, measured), openedReach + 0.015);
      } else if (!practice.finish) openedReach = 0;
      rig.update(dt, state, practice.enemy, locked, practice.finish && !roamed ? {   // roamed: no finisher camera, the follow lock on the walking hero
        finisher, posed: !!finisherPose, draw: !!practice.finish.draw, victim: practice.finish.victim, clock: finishClock,
        head: severHead ? { x: severHead.group.position.x, z: severHead.group.position.z } : null,
        big: ['wraith', 'minotaur'].includes(opponentId),
        reach: openedReach,
      } : null, OPPONENTS[opponentId].scale, framingTall(opponentId), framingLow(opponentId), frameWiden);
      // Finisher complete (Lead brief 2026-09-22): the kill has finished PLAYING, read off what the scene is actually doing
      // rather than a guessed delay — (1) the victim's clip has run out (`victimProgress`: the slowed 0.75× finisher clock
      // for a posed finisher, the plain fall's own progress for a plain death, so the plain death completes earlier and the
      // number is per finisher), (2) the camera has settled (camera.ts SETTLE — the push-in and the side-view reveal end at
      // different ages for different finishers), and (3) Decapitation's severed head has come to rest. Opened needs no term
      // of its own: its reach stops growing at victimProgress 1 by construction above. Latches once and holds until the
      // finish clears, so a late camera nudge cannot un-complete a ceremony the player has already watched end.
      if (!practice.finish) {
        finishComplete = false;
        finishCompleteAt = 0;
      } else if (!finishComplete && victimProgress >= 1 && rig.settled && (!severHead || severHead.resting)) {
        finishComplete = true;
        finishCompleteAt = rig.finishAge;
      }
      const exposure = renderer.toneMappingExposure;
      const specialDim = runtimeSpecial?.exposure ?? (specialFx as ModeFx | undefined)?.exposure ?? 1;   // Nyx's Nightfall drain
      if (dip > 0 || specialDim !== 1) renderer.toneMappingExposure = exposure * (dip > 0 ? 1 - DIP_DEPTH * Math.min(1, dip / (DIP_FRAMES - 1)) : 1) * specialDim;   // the kill dip held then eased back
      if (specialId) previewLighting.apply(specialDim);
      skyline?.update(camera.position, dt);   // the backdrop follows the eye (skyline.ts); the camera was placed by rig.update above
      syncIdleFoes(practice, dt);
      syncLiveFoes(dt);
      if (!look?.render()) { if (gfx) gfx.render(); else renderer.render(scene, camera); }
      renderer.toneMappingExposure = exposure;
      if (dip > 0 && dt > 0) dip--;
      rig.settle(dt);
    },
  };
}
