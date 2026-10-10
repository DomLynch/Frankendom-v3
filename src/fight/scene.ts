import { ROSTER, supportsFinishers, resolveFinisher } from '../roster.ts';
import * as THREE from 'three';
import { SPECIAL_STRUCK, specialStage } from './special-look.ts';
import { resolveSparringPreview } from './sparring-specials.ts';
import { gait, SPECIAL_MODES, type SpecialFx as ModeFx } from './special-modes.ts';
import { SCHOOL_OF, schoolTinter, schoolsFlag, schoolsStrength } from './spell-school.ts';
import { createTitheLighting } from './special-lighting.ts';
import { warmFirstFrame } from '../first-frame.ts';
import { createBossTelegraph, telegraphFlag } from './boss-telegraph.ts';
import { createSpecialPresentation, disposeSpecialGroup, type SpecialFightIdentity } from './special-presentation.ts';
import { captureException } from '@sentry/browser';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { sizeBeast, CHARGE_LEAN, defenceReaction, holdingCharge, loadLoot, MissingTextures, loadRankLook, loadShape, loadShield, loadPeerWarriors, loadWarriors, lootIds, lootWorn, SHIELD_CARRIERS } from './characters.ts';
import { shieldFor, SHIPPING_SHIELDS } from './shields.ts';
import { shapesFlag, shapesFor, shapesOn, SHIPPING_SHAPES } from './weapon-shapes.ts';
import { heroPreview } from '../hero-preview.ts';
import { bakeSafeFinisher, lookBakeOffFrom, lookBakes, rankLookFlag, runThroughForced, rankLookFor, rankLookStream, SHIPPING_LOOKS } from './rank-look.ts';
import { levelOf, type Tier } from '../grades.ts';
import { kitWorn } from './loot.ts';
import { standoffClock, standoffFlag, standoffPose } from './standoff.ts';
import { actorPose, initialPractice, type CombatEvent, type Practice } from './combat.ts';
import { ON_DEMAND_BEASTS, beastBodyUrl } from './beast-scale.ts';
import { OPPONENTS, PLAYER_WEAPONS, RULES, opponentAt, weaponOf, type OpponentId, type WeaponId } from './moves.ts';
import { type FinisherId } from './finishers.ts';
import { HAMSTRUNG_BEATS, HAMSTRUNG_SOURCE_PELVIS, HAMSTRUNG_VICTIMS, hamstrungPick, resolveHamstrung } from './hamstrung.ts';
import { EXECUTION_BEATS, EXECUTION_FLOOR_MARKS, EXECUTION_SOURCE_PELVIS, EXECUTION_VICTIMS, executionPick, poseOf, resolveExecution } from './execution.ts';
import { createHamstrungAssets } from './hamstrung-assets.ts';
import { PLAY_SCALE, TARGET, wrapAngle, type State } from './sim.ts';
import { buildArena, type Arena } from '../arena.ts';
import { arenaFor } from '../arena-themes.ts';
import { nightBronzeApplies, toneNightBronze } from './night-armour.ts';
import { createFootDust, dustToneFor } from './foot-dust.ts';
import { createWitchfire } from './witchfire.ts';
import { createMiasmaMark, marksFlag } from './miasma-mark.ts';
import { createSkillImpact } from './skill-impact.ts';
import { createFinisherBlood, finisherBloodSources } from './finisher-blood.ts';
import { phoneTier, pixelCap } from './quality.ts';
import { lookFrom } from '../look-flag.ts';
import { FOE_TUNE } from './fatigue-tune.ts';
import { fatigueReadFrom } from './fatigue-read.ts';
import { stanceFrom } from './stance-pose.ts';
import { armfeelFrom, Flinch } from './armfeel.ts';
import { createBurstPool } from './armfeel-fx.ts';
import { createBloodEdge } from './blood-edge.ts';
import { hideChildren } from '../stage-hide.ts';
import { createCameraRig, framingLow, framingTall } from '../camera.ts';
import { launchSeveredHead, stepSeveredHead, type SeveredHead } from './severed-head.ts';
import { createFightFx, impactTexture } from './fx.ts';
import { createSignatures, resolveSignature } from './signature.ts';
import { scorch } from './scorch.ts';
import './signature-dwarf.ts';   // registers the Dwarf's Hammer Stamp
import './signature-knight.ts';   // the Knight's Rivet Burst registers itself
import './signature-witch.ts';   // registers the Witch's Grasp
import './signature-pitborn.ts';   // registers the Pitborn's Butcher's Wake
import './signature-executioner.ts';   // the Executioner's Reaping Scar registers itself
import './signature-veteran.ts';   // the Veteran's Battle Scars registers itself
import './signature-nightborn.ts';   // Nightborn A: Blood Recall
import './signature-goblin.ts';   // Goblin A: Hooked Wound
import './signature-plaguedoctor.ts';   // Plague Doctor A: Rot Bloom
import './signature-shieldmaiden.ts';   // registers the Shieldmaiden's Splintered Defiance
import { settleWithin } from './warm-gate.ts';
const COMPILE_BOUND_MS = 6000;   // a compile (warm-up only) that has not settled by then is given up on: a lost context never settles it, and the walk must not wait
const SIDES = [0, 1] as const;   // the two fighters, for the per-frame loops: one shared tuple, not a new array every frame (armfeel is on for everyone now)

// One GLB per opponent (moves.ts `OpponentId`); only the hero and the man he faces are ever loaded.
// The player weapons this build can draw: the longsword is warrior.glb's own, every other needs its equip file (scripts/build-player-weapon.mjs),
// fetched only when that weapon is the one in hand. main.ts offers the fight only these (loot.ts fightWeapon), so no pick can lack its art.
// Vite swaps each import.meta.glob for an object at build; under node (the unit tests load this module through the src/fight barrel) the call does not exist, so it reads as empty there.
const globbed = <T extends Record<string, string>>(read: () => T): T => { try { return read(); } catch { return {} as T; } };
const EQUIP_URLS = globbed(() => import.meta.glob<string>('../assets/weapons/player/*.glb', { eager: true, query: '?url', import: 'default' }));
const equipUrl = (weapon: WeaponId): string | undefined => EQUIP_URLS[`../assets/weapons/player/${weapon}.glb`];
// A rank look's pre-swap bake takes up to this many ms of each frame (it runs while the fight plays; one bounded step is ~8 ms at worst).
const LOOK_BAKE_MS = 6;
export const CARRIED_WEAPONS: readonly WeaponId[] = PLAYER_WEAPONS.filter((weapon) => weapon === 'longsword' || equipUrl(weapon));
// In-world fights (Origins ?worldfight, Dom 2026-10-07: "the Pit's own fight, where you stand, without the arena"). With a mount the duel scene is the same scene it always is, with
// the Pit's rigs, effects and locked camera in the arena's own coordinates, except that no arena, crowd or arena light is built: `holder` (the page's world, moved in by the page) is
// the ground, `background` and `fog` are the world's, and the page's renderer draws it (no second GL context). The page places `holder` with the inverse of where the duel stands in
// the world. Without a mount (every Pit and game page) none of this runs.
export type WorldMount = { renderer: THREE.WebGLRenderer; holder: THREE.Object3D; background: THREE.Color | THREE.Texture | null; fog: THREE.Fog | THREE.FogExp2 | null; walkCam?: { back: number; up: number } };   // walkCam: the walk camera's distance behind the hero and height (metres): a world fight keeps them and only the aim locks on
const worldArena = (): Arena => ({ group: new THREE.Group(), floor: new THREE.Mesh(), sky: Object.assign(new THREE.Texture(), { image: { width: 1 } }), materials: undefined, ready: Promise.resolve(), update() {}, raiseGate() {} }) as unknown as Arena;
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
  playerWeapon: WeaponId | Promise<WeaponId> = 'longsword',
  // The weapon the player's rig carries once it is built: the one asked for, or the longsword when its equip file failed. Called before
  // the 'ready' status, so the entry point can re-arm the fight (drawn = simulated) before the card lifts.
  playerDrawn: (weapon: WeaponId) => void = () => {},
  // The ladder level the opponent is met at, as the Match fights it: his loadout can change with it (moves.ts LOADOUT_FROM: the Centurion's
  // gladius + scutum from Legionary), so his rig is armed for that level. A rematch that crosses the change reloads the page (main.ts).
  // Default 1 = the first rung's loadout (the Centurion's baked trident): a harness caller that omits it (versus-cards.mjs) renders rung 1.
  opponentLevel: number | Promise<number> = 1,
  // A live duel only (main.ts `?duel=`): the peer's agreed weapon and worn gear, once the handshake has them (null: the duel ended before
  // it did). The rigs load behind the loading card until then and the peer is drawn on the hero's own rig; a page with no `?duel=` passes
  // nothing and every line below is the fight it always was.
  peerKit?: Promise<{ weapon: WeaponId; gear?: readonly string[] } | null>,
  world?: WorldMount,
) {
  const theme = arenaFor(opponentId, arenaOverride);
  // Phone tier (the owner's iPhone GPU-pressure defect, 2026-09-18): cap the backing store at 1.25× and the
  // shadow map at 512² — the MSAA framebuffer at 1.5× on a ~1170×2532-class phone is ~200 MB of GPU memory.
  const PHONE = phoneTier(),
    PIXEL_CAP = pixelCap(PHONE);   // ?dpr= overrides the ceiling for this load (quality.ts)
  const renderer = world?.renderer ?? new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  if (!world) {   // a world mount keeps the page's renderer as it is
    renderer.setPixelRatio(Math.min(devicePixelRatio, PIXEL_CAP));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = theme.exposure;
  }
  const scene = new THREE.Scene();
  // Special Moves (special-look.ts): the tick each side was last struck by a special (its head-hit stagger is presentation only). The cloud
  // is Finishers' special-fx.ts, loaded below only in a fight with Special Moves.
  const specialStruck = [-Infinity, -Infinity];
  scene.background = world ? world.background : new THREE.Color(theme.fog);
  scene.fog = world ? world.fog : new THREE.FogExp2(theme.fog, theme.fogDensity);
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
      scene.environmentIntensity = world ? 0.15 : environment ? 0.45 : 1.0;   // a world mount: the studio map must not wash the world's own ground and props
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
  if (!world) scene.add(hemisphere);   // a world mount is lit by the world's own lights (inside `holder`)
  const sun = new THREE.DirectionalLight(...theme.sun);
  const sunHome = new THREE.Vector3(...(theme.light?.sun ?? [-15, 26, -18])), sunPower = theme.sun[1];   // a theme may move the key light (noon overhead, firelight low)
  sun.position.copy(sunHome);
  sun.castShadow = true;
  sun.shadow.mapSize.set(PHONE ? 512 : 1024, PHONE ? 512 : 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 70 });   // the pit floor to the wall's foot (11.7 m), not the tiers: 1.25× sharper shadows on the sand for free (audit 2026-09-20)
  sun.shadow.normalBias = 0.04;
  if (!world) scene.add(sun);
  // Look test links (souls-look.ts): `?look=souls`, `?look=shade` or both. No flag fetches, builds and compiles nothing and draws
  // today's frame; with one, the module (and its post chain) is its own chunk, fetched beside the fight's art.
  const lookFlags = typeof location === 'undefined' ? undefined : lookFrom(location.search, PHONE);
  // `?look=armfeel&feel=high|low|off` (armfeel.ts): the victim's flinch on a visual pivot between the fighter's root and its rig. Absent or `off`: no pivot, today's frame.
  const feel = typeof location === 'undefined' ? undefined : armfeelFrom(location.search, typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const flinches = feel && feel !== 'off' ? [new Flinch(feel), new Flinch(feel)] : null;
  const stance = typeof location !== 'undefined' ? stanceFrom(location.search) : 'neutral';   // ?look=stances&stance=<name>: neutral (today's frame) without the flag
  const fatigueRead = typeof location !== 'undefined' && fatigueReadFrom(location.search);   // fatigue-read.ts: the tired pose made legible from behind, ON; ?off=fatigue-read = the live layer alone
  const pivots: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];
  const lean = new THREE.Quaternion(), hip = new THREE.Vector3(), swing = new THREE.Vector3(), axis = new THREE.Vector3();
  const burstPool = flinches ? createBurstPool(scene) : null;
  const right = new THREE.Vector3();
  let look: ReturnType<typeof import('../souls-look.ts').createLook> | undefined;
  if (lookFlags) void import('../souls-look.ts').then(({ createLook }) => { look = createLook(lookFlags, { renderer, scene, camera, hemisphere, sun, canvas }); resize(); }).catch(captureException);
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
  const arena = world ? worldArena() : buildArena(scene, theme),
    footDust = createFootDust(scene, dustToneFor(theme)),
    witchfire = createWitchfire(scene),
    skillImpact = createSkillImpact(scene),
    miasmaMark = marksFlag(globalThis.location?.search ?? '') ? createMiasmaMark(scene) : null;   // ?look=marks (miasma-mark.ts)
  if (world) scene.add(world.holder);
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
  let pitRestore: (() => void) | undefined;   // the gear seam (setArenaVisible): set while the arena is hidden, puts back what was shown
  let warriors: Awaited<ReturnType<typeof loadWarriors>> | undefined;
  const dustFeet: (THREE.Object3D | null)[] = [],
    dustPositions = Array.from({ length: 4 }, () => new THREE.Vector3());
  // The player, and the chosen opponent; each rig plays the clips of the weapon the simulation gives that side (moves.ts OPPONENTS, duel.ts initialDuel).
  let peer: { weapon: WeaponId; gear?: readonly string[] } | null = null;   // set once the duel's handshake has the peer's kit
  const weapons = Promise.all([playerWeapon, opponentLevel, peerKit ?? null]).then(([weapon, level, kit]) => {
    peer = kit;
    const pair = initialPractice(731, opponentAt(OPPONENTS[opponentId], level), weapon).duel.fighters.map((f) => f.weapon) as [WeaponId, WeaponId];
    return peer ? [pair[0], peer.weapon] as [WeaponId, WeaponId] : pair;
  });
  let builtFoeWeapon: WeaponId | undefined;
  // Every roster body except the held ones (roster.ts `hold`): glob patterns must be literals, so the exclusions are spelled out here —
  // tests/roster.test.ts checks the two lists agree. Held GLBs stay in src/assets for their lanes; they are just not in the beta bundle.
  // Hero preview (hero-preview.ts): a fitted set under /herolook/ stands in for the player's rig. It wears its armour on the rig itself, so
  // the player's loot pieces are never layered over it (the opponent still wears his kit); a file that fails to load falls back to warrior.glb.
  const heroUrl = heroPreview(typeof location === 'undefined' ? '' : location.search);
  const fighterUrls = globbed(() => import.meta.glob<string>(['../assets/*.glb', '!../assets/minotaur.glb', '!../assets/werewolf.glb', '!../assets/wraith.glb', '!../assets/skeleton.glb'], { eager: true, query: '?url', import: 'default' }));
  // The opponent's own cut of loot.glb (scripts/split-loot.mjs): a fight fetches his kit only, never the whole 9.4 MB file.
  const carrierUrls = globbed(() => import.meta.glob<string>('../assets/loot/carriers-*.glb', { eager: true, query: '?url', import: 'default' }));
  // The foe's rig file: a roster body from the glob, except the on-demand beasts (boar, bear), which are public/beasts/<id>.glb fetched by an absolute site-root URL (src/fight/beast-scale.ts), like the world bodies' '/world/...': the Origins preview build has no publicDir, so a BASE_URL-relative path would 404 there.
  const foeUrl = (id: string): string => ON_DEMAND_BEASTS.has(id) ? beastBodyUrl(id) : fighterUrls[`../assets/${ROSTER[id as OpponentId].body}.glb`]!;
  // Combat waits for the arena's worker textures and props too (arena.ready never rejects): their GPU uploads then land during the
  // loading screen instead of stalling the first exchange (measured 69 ms p95 in the first window when they arrived late under load).
  // The load is retryable: a phone that sleeps mid-download aborts the fetch (2 MiB of the Nightborn's 5.1 MB, 2026-09-21 09:15) and
  // the page is restored with the failure still showing. The capsules stay, the failure is reported, and `retryArt` runs the same
  // load again — the entry point calls it when the page returns to the foreground, the network comes back, or the player taps the notice.
  // Loot (brief 5): the worn ids the entry point last gave (`wear`), the pieces of loot.glb once fetched, and the fetch in flight. The fetch
  // starts only once the rigs are in and the worn set is non-empty, so it never shares the wire with a fight's download and never gates
  // readiness: the fight starts on the rigs alone and the pieces go on when they land.
  // Tier dressing (Block A; Phase L #589/#606 re-applied): the opponent wears his own armour pieces from his cut, the kit for `tier` (loot.ts
  // kitWorn: no crest at Recruit), the rung he is met at, grades.ts tierAt(marks), set by the entry point at load and at each rematch. The cut
  // downloads beside his rig so he is dressed before the opened-waist bake and never pops armour on mid-fight; a failed cut leaves him
  // undressed, not the fight. His kit shows the grade of that rung, the player's pieces the rung each was taken at (rank-tint.ts: a tint over the piece's own maps).
  let tier: Tier | undefined;
  let playerTier: Tier | undefined;   // the player's own rung (the rank the HUD shows), for his weapon's shape; setPlayerTier
  // Two-handed or not is the weapon he FIGHTS with (the sim's, `weapons` below): the Centurion's gladius brings his scutum up (SCOPE:76).
  let twoHanded = weaponOf(OPPONENTS[opponentId].weapon).grip === 'two-hand';
  const carrierUrl = !peerKit && kitWorn(opponentId, false).length ? carrierUrls[`../assets/loot/carriers-${opponentId}.glb`] : undefined;
  let worn: readonly string[] = [], wornTier: Readonly<Record<string, Tier>> = {}, lootPieces: THREE.SkinnedMesh[] | undefined, lootLoading: Promise<void> | null = null, carried: THREE.SkinnedMesh[] | undefined;
  // loot.glb, once per page (a failure is forgotten, so the next dress or Pit visit tries again): the worn set and the Pit's pieces share it.
  const loadLootPieces = () => (lootLoading ??= loadLoot(fighterUrls['../assets/loot.glb']!).then((pieces) => { lootPieces = pieces; dress(); }).catch((error: unknown) => { captureException(error); lootLoading = null; }));
  // Weapon shapes per rank (weapon-shapes.ts shapesFor): his weapon's file at the rung he is met at (`tier`, a ?tier= pin included), the
  // player's own at the player's own rung (`playerTier`, the career rank). A shape is GPT's painted finish: no rank tint over it. The dev
  // flag's table, else the shipping one.
  const shapeTable = (typeof location === 'undefined' ? undefined : shapesFlag(location.search)) ?? SHIPPING_SHAPES;
  const shapes = new Map<string, Promise<THREE.Mesh | undefined>>();
  function reshape() {
    const loaded = warriors; if (!loaded || !shapesOn(shapeTable)) return;   // no shape file on: today's parts, no call at all
    const urls = () => shapesFor({ player: loaded.playerWeapon, opponent: builtFoeWeapon, opponentId, playerLevel: levelOf(playerTier ?? 'Recruit'), opponentLevel: levelOf(tier ?? 'Recruit') }, shapeTable);
    for (const who of ['player', 'opponent'] as const) {
      const actor = loaded[who], url = urls()[who];
      if (!url) { actor.reshape(undefined); continue; }
      if (!shapes.has(url)) shapes.set(url, loadShape(url).catch((error: unknown) => { captureException(error, { tags: { shape: url } }); return undefined; }));
      void shapes.get(url)!.then((mesh) => { if (warriors === loaded && urls()[who] === url) { actor.reshape(mesh); ((globalThis as { __weaponShapes?: Record<string, string | undefined> }).__weaponShapes ??= {})[who] = mesh ? url : undefined; } });   // the stills and phone check read what went on
    }
  }
  const shieldsOn = SHIPPING_SHIELDS.has(opponentId), shields = new Map<string, THREE.SkinnedMesh>(), shieldLoads = new Set<string>();
  function dress() {
    if (!warriors) return;
    warriors.opponent.grade(tier);   // his weapon wears the rung he is met at, like his kit
    reshape();
    if (peer) {   // the peer wears what his handshake kit names, from the same loot.glb the player's own set comes from
      if (peer.gear?.length) { if (lootPieces) warriors.opponent.wear(lootPieces.filter((piece) => lootWorn(piece, peer!.gear!)), (id, error) => captureException(error, { tags: { loot: id } }), () => 'Recruit'); else void loadLootPieces(); }
    } else if (carried) {
      const kit = kitWorn(opponentId, twoHanded, tier), url = shieldFor(opponentId, levelOf(tier ?? 'Recruit'), shieldsOn), painted = url ? shields.get(url) : undefined;
      // The painted shield (shields.ts) in place of his own board once its file is in; until then, or if it never loads, he wears the board he has.
      const pieces = carried.filter((piece) => lootWorn(piece, kit)).filter((piece) => !painted || piece.userData.slot !== 'Shield');
      warriors.opponent.wear(painted ? [...pieces, painted] : pieces, (id, error) => captureException(error, { tags: { loot: id } }), () => tier);
      if (url && !painted && !shieldLoads.has(url)) { shieldLoads.add(url); loadShield(url).then((piece) => { shields.set(url, piece); dress(); }).catch((error: unknown) => captureException(error, { tags: { shield: url } })); }
    }
    if (heroUrl) return;
    if (!lootPieces) {
      if (worn.length) void loadLootPieces();
      return;
    }
    warriors.player.wear(lootPieces.filter((piece) => lootWorn(piece, worn)), (id, error) => captureException(error, { tags: { loot: id } }), (piece) => wornTier[lootIds(piece).find((id) => worn.includes(id)) ?? ''] ?? 'Recruit');
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
  const rankLook = !peerKit && (rankLookFlagged || SHIPPING_LOOKS[opponentId]) ? rankLookStream(() => { const url = lookStarted = rankLookUrl(); lookForced = runThroughForced(url); (globalThis as { __rankLookForced?: boolean }).__rankLookForced = lookForced; return url ? loadRankLook(url).then(async (look) => {
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
    const rig = lookBakes(supportsFinishers(opponentId, 'opened'), url, lookBakeOff) ? warriors?.opponent : undefined, g = globalThis as { __rankLookSteps?: [number, string][] };
    rig?.prepareLook(look);
    for (let done = !rig; !done;) {
      await frame(); const start = performance.now();
      do { const step = rig!.stepLook(); if (!step) { done = true; break; } (g.__rankLookSteps ??= []).push([step.ms, step.label]); done = step.done; } while (!done && performance.now() - start < LOOK_BAKE_MS);
    }
    await frame();
    return look;
  }) : undefined; }, (look) => { const swapped = warriors?.opponent.wearLook(look); if (swapped) (globalThis as { __rankLookOn?: typeof swapped }).__rankLookOn = swapped; }, captureException) : undefined;
  if (rankLook) (globalThis as { __rankLook?: typeof rankLook }).__rankLook = rankLook;
  let loading: Promise<void> | null = null;
  function loadFighters(): Promise<void> {
    if (warriors) return Promise.resolve();
    if (loading) return loading;
    assetStatus('Loading warriors…', 'loading');
    loading = Promise.all([
    weapons.then((pair) => {
      twoHanded = weaponOf(pair[1]).grip === 'two-hand'; builtFoeWeapon = pair[1];
      // A weapon his rig does not bake (ROSTER.weapon is what veteran.glb carries) comes from its equip file, grafted as the player's is.
      const opponentEquip = pair[1] === (peer ? 'longsword' : ROSTER[opponentId].weapon) ? undefined : equipUrl(pair[1]);   // the hero's rig bakes the longsword
      const load = (hero: string) => peer ? loadPeerWarriors(hero, pair, pair[0] === 'longsword' ? undefined : equipUrl(pair[0]), opponentEquip, (error) => captureException(error, { tags: { equip: pair[1] } })) : loadWarriors(hero, foeUrl(opponentId), pair, pair[0] === 'longsword' ? undefined : equipUrl(pair[0]), (error) => captureException(error, { tags: { equip: pair[0] } }), opponentEquip, SHIELD_CARRIERS.has(opponentId));
      return heroUrl ? load(heroUrl).catch(() => load(fighterUrls['../assets/warrior.glb']!)) : load(fighterUrls['../assets/warrior.glb']!);
    }),
    arena.ready,
    carrierUrl ? loadLoot(carrierUrl).then((pieces) => { carried = pieces; }).catch((error: unknown) => { captureException(error); }) : null,
  ])
    .then(async ([loaded]) => {
      warriors = loaded;
      if (!peer) sizeBeast(loaded, opponentId);   // a beast is drawn at the size it is met walking (src/fight/beast-scale.ts)
      dress();   // his kit before the opened-waist bake, so the cut body wears what the whole one did
      playerDrawn(loaded.playerWeapon);
      if (supportsFinishers(opponentId, 'opened')) loaded.opponent.prepareOpened();
      for (const proxy of [player, opponent]) {
        proxy.traverse((object) => {
          if (object instanceof THREE.Mesh) object.geometry.dispose();
        });
        proxy.clear();
      }
      if (flinches) { pivots[0].clear(); pivots[1].clear(); pivots[0].add(loaded.player.anchor); pivots[1].add(loaded.opponent.anchor); player.add(pivots[0]); opponent.add(pivots[1]); }
      else { player.add(loaded.player.anchor); opponent.add(loaded.opponent.anchor); }
      player.visible = opponent.visible = true;
      for (const rig of [loaded.player, loaded.opponent])
        for (const name of ['foot_l', 'foot_r']) dustFeet.push(rig.anchor.getObjectByName(name) ?? null);
      dress();
      // Every shader the fight can need is compiled here, behind the welcome card, instead of the first time its object is drawn
      // mid-fight (a landed blow's sparks and blood, a stain, the graded wall): compile() walks the whole scene, hidden pools included.
      // Not measurable on the Mac (2026-09-25, phone tier, ×4 CPU throttle, paired runs within noise): a one-off compile outside the sampled
      // window, and headless software GL cannot show a phone GPU's first-draw stall. The case is that stall, on the first blow of a fight.
      renderer.compile(scene, camera);
      // Then the first frame itself, behind the card (first-frame.ts): maps a slice per frame, one draw, at most 4 s, on macrotask yields and the clock only (never rAF or a timer: a paused page clock must still boot); a hidden tab skips it.
      if (typeof document === 'undefined' || !document.hidden) {
        const maps = new Set<THREE.Texture>(); scene.traverse((o) => { if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Line) for (const material of [o.material].flat()) for (const v of Object.values(material as object)) if (v instanceof THREE.Texture) maps.add(v); });
        performance.mark('first-frame-begin');
        const how = await warmFirstFrame({ textures: [...maps], upload: (t) => renderer.initTexture(t as THREE.Texture), draw: () => renderer.render(scene, camera), frame: () => new Promise<void>((done) => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); done(); }; c.port2.postMessage(0); }), budgetMs: 4000, sliceMs: 10, now: () => performance.now(), lost: () => renderer.getContext().isContextLost() });
        performance.mark('first-frame-' + how);
      }
      assetStatus('', 'ready');
      prefetchHamstrung();   // after ready, never before and never awaited: the loading card does not wait on a finisher that may not play
    })
    .catch((error) => {
      // A bare fighter after every retry (FRANKENDOM-5) names its file, the missing map and the tries, so the next event says which art failed.
      captureException(error, error instanceof MissingTextures ? { tags: { fighter: error.url.split('/').pop(), missing: error.missing, attempts: error.attempts } } : undefined);
      player.visible = opponent.visible = true;   // the capsules stand in so the fight is still readable while the notice offers a retry
      assetStatus('Warrior art could not load. Movement still works; tap here to retry.', 'failed');
    })
    .finally(() => {
      loading = null;
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
  const { clash, sparks, splats, bodyWounds, blade } = fx;
  let bloodMode: 'red' | 'dark' | 'off' = 'red';
  let finisherOverride: FinisherId | null = null; // dev/test pick (owner 2026-09-19): swap which finisher plays on a ceremonial kill; null = the spec's selection
  // Rotation memory (owner 2026-09-20: never the same ceremony twice in a row). `lastFinisher` is the ceremony the previous
  // fight showed and feeds this fight's pick; `fightFinisher` is this fight's, rolled into `lastFinisher` when the next
  // fight starts (practice.finish clears on rematch). Presentation state only — the simulation never sees it.
  let lastFinisher: FinisherId | null = null, fightFinisher: FinisherId | null = null;
  let bakeFallback: FinisherId | false | null = null;   // the finisher this finish plays instead (bakeSafeFinisher), false for none, null undecided
  let fallen: { victim: 0 | 1; draw: boolean } | null = null;   // the finish drawn last frame, for fallenRect() between frames
  let openedReach = 0;   // Opened: farthest horizontal extent of what lies on the sand, from the fallen's origin (camera fit)
  // Decapitation (owner 2026-09-18): the severed head, its ballistic state, and the killing blow's heading (the pop direction).
  let severHead: SeveredHead | null = null;
  // Fetched on demand (src/fight/hamstrung-assets.ts), never in loadFighters: the killer's clip, the victim's clip and his weapon-drop bake.
  const hamstrungAssets = createHamstrungAssets(
    async () => { const [{ default: killer }, { default: victim }] = await Promise.all([import('../assets/hamstrung-killer.json'), import('../assets/hamstrung-victim-hero.json')]); return { killer, victim }; },
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
  const wantHamstrung = (prefetch = false) => { if ((prefetch || finisherOverride === 'hamstrung') && warriors && HAMSTRUNG_VICTIMS.includes(opponentId)) void hamstrungAssets.request(warriors); };
  // Execution (src/fight/execution.ts) loads on the picker's choice only (no idle prefetch: it re-skins 12 poses), never as part of ready, and a failure is the plain death.
  const executionAssets = createHamstrungAssets(
    async () => { const [{ default: killer }, { default: victim }] = await Promise.all([import('../assets/execution-killer.json'), import('../assets/execution-victim-hero.json')]); return { killer, victim }; },
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
  const wantExecution = (prefetch = false) => { if ((prefetch || finisherOverride === 'execution') && warriors && EXECUTION_VICTIMS.includes(opponentId)) void executionAssets.request(warriors); };
  let executionSteps: THREE.Vector3 | null = null; // where the killer's anchor stands for the cut, solved once per finish
  let finishHold = 0; // Hamstrung: seconds left of the hit-stop a blow holds the scene for (the clock and both rigs stand still, the camera and the blood run on)
  let hamstrungSteps: { knee: THREE.Vector3; back: THREE.Vector3 } | null = null; // where the killer's anchor stands for each blow, solved once per finish
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
  const bossTelegraph = typeof location !== 'undefined' && telegraphFlag(location.search) ? createBossTelegraph(scene) : null;   // ?telegraph=1 look-test (boss-telegraph.ts)
  const runtimeSpecial = specialId ? null : createSpecialPresentation(scene, theme.exposure, camera);
  const signatures = createSignatures(scene, opponentId);   // the opponent's signature effect (signature.ts); the ruled variant (SHIPPED) unless the admin select or ?signature= asks
  let heading = Math.PI;
  const standoffOn = typeof location !== 'undefined' && standoffFlag(location.search);   // on by default, ?standoff=0 off (standoff.ts)
  const standoff = standoffClock();   // ms of frame time since the versus card lifted (frame dt, so a stepped harness clock plays it too); -1 before
  const rig = createCameraRig(camera);
  // World fights (seamless combat step 4, Dom 2026-10-08): the duel's camera does not cut in, it eases from where the walk's camera stood. `easeCamera` is set by the page at the engage; every frame after rig.update blends the rig's pose with that start (smoothstep), and the rig itself is untouched.
  let worldCam: { back: number; up: number } | null = null;   // set by the page at a world engage: the camera stays at the walk's distance and height (seamless S2)
  const wcFoe = new THREE.Vector3();
  let ease: { pos: THREE.Vector3; quat: THREE.Quaternion; age: number; dur: number } | null = null;
  const easePos = new THREE.Vector3(), easeQuat = new THREE.Quaternion();
  // Kill dip: the killing blow darkens the frame 6 % for two frames and recovers over two more — the cinematic reserve (GAME_SPEC 80/15/5),
  // never on an ordinary hit. Applied around the draw on top of whatever exposure the renderer holds, so nothing else has to know.
  let dip = 0; // frames remaining, counted down per drawn frame while time passes
  const DIP_FRAMES = 4, DIP_DEPTH = 0.06;
  const blockHeavy = [false, false]; // which fighter's standing block just caught a heavy (his recoil is deeper while `blocked` lasts)
  let ratio = Math.min(devicePixelRatio, PIXEL_CAP); // the context-loss recovery path lowers this to 1 from the tier's ceiling
  // The canvas box is the LAYOUT viewport, read from the root element, never innerWidth / innerHeight: iOS Safari reports the zoomed
  // VISUAL viewport there, so a pinch that slipped past main.ts's guard shrank the canvas to the zoomed area (the top half of the
  // phone, the page background below it, the HUD floating over the void, the camera framed for the wrong aspect) and it stayed that
  // way (live on a50f22f, 2026-09-23; scripts/viewport-check.mjs). The stylesheet owns the box (#world: fixed, inset 0, 100 %); the
  // renderer only sizes its drawing buffer to match, writing no inline style. The two screen projections below use the same numbers.
  let width = 1, height = 1;
  const resize = () => {
    width = document.documentElement.clientWidth || innerWidth; height = document.documentElement.clientHeight || innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (!world) renderer.setSize(width, height, false);   // the page sizes its own renderer
    look?.setSize(width, height, renderer.getPixelRatio());
  };
  resize();
  window.addEventListener('resize', resize);
  return {
    renderer,
    ready,
    // A world-mounted fight (pit-duel.ts stageFor) builds a scene per creature on the page's ONE renderer, which is never disposed: let go of this scene's GPU memory (every geometry,
    // material, texture, skeleton and the environment map under it) and its resize listener. The caller has taken the world's holder out of the scene first, so the world is never
    // touched; the renderer is not disposed here.
    dispose() {
      window.removeEventListener('resize', resize);
      scene.traverse((o) => {
        const m = o as THREE.Mesh & { skeleton?: THREE.Skeleton };
        m.geometry?.dispose();
        m.skeleton?.dispose();
        for (const material of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) {
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
          material.dispose();
        }
      });
      environmentTarget?.dispose();
      scene.environment = null;
    },
    // Load the rigs again after a failed attempt; a no-op while a load is running or once the rigs are in.
    retryArt: loadFighters,
    startStandoff() { standoff.start(); },   // main.ts, the moment the versus card lifts: idempotent (an art retry re-emits 'ready' mid-fight)
    restartStandoff() { standoff.restart(); },   // main.ts nextFight: the rematch plays the draw-in again (a no-op with ?standoff=0)
    opponentRoot: () => warriors?.opponent.anchor ?? null,   // the foe rig's root (undefined-safe): the Origins preview dresses a creature's cloth on it; the sim never reads it
    opponentWeapon: () => builtFoeWeapon,   // the weapon his rig was armed with (undefined until the rigs load)
    // The player's worn loot by id (src/fight/loot.ts equipped set): applied now when the rigs and pieces are in, else when they land.
    // `tiers`: the rung each worn id was taken at (loot.ts Provenance.tier); an id without one shows Recruit's finish.
    wear(ids: readonly string[], tiers: Readonly<Record<string, Tier>> = {}) { worn = ids; wornTier = tiers; dress(); },
    // The rung the opponent is met at (grades.ts tierAt): at load and at each rematch, never mid-fight. A change re-dresses him and bakes the
    // opened waist again (between fights).
    // world fights: warm this scene's own rigs (hero, foe, weapons) once they have loaded, before the engage. A program's variant depends on the lights it is lit by, and the world's lights only join this scene at the
    // attach, so they are borrowed here as clones. `compile` builds the lit programs, but the shadow pass's depth programs only exist once a shadow map is really rendered, so one frame is drawn into a 4x4 target (nothing shown), then the clones go.
    async warmOwn(lights: THREE.Object3D[]) {
      const borrowed = lights.map((light) => light.clone()); scene.add(...borrowed);
      try {
        await settleWithin('warm-own', renderer.compileAsync(scene, camera), COMPILE_BOUND_MS);
        const target = new THREE.WebGLRenderTarget(4, 4), before = renderer.getRenderTarget();
        try { renderer.setRenderTarget(target); renderer.render(scene, camera); } finally { renderer.setRenderTarget(before); target.dispose(); }
      } catch { /* a failed warm only means the first frame compiles, as before */ } finally {
        scene.remove(...borrowed); for (const light of borrowed) (light as THREE.Light).dispose?.();
      }
    },
    warmWorld(root: THREE.Object3D) { return settleWithin('warm-root', renderer.compileAsync(root, camera, scene), COMPILE_BOUND_MS).then(() => {}); },   // world fights: compile the page's world materials as THEY will be drawn here (this scene's environment and fog), before the engage, so the first duel frame does not compile them
    setWorldCamera(cam: { back: number; up: number } | null) { worldCam = cam; },   // world fights: keep the walk camera's distance and height (only the aim eases to the lock); null = the duel's own framing
    easeCamera(from: { position: THREE.Vector3; quaternion: THREE.Quaternion }, seconds: number) {   // start the duel's camera at `from` and ease to its own framing over `seconds` (a reduced-motion viewer gets the cut)
      ease = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? null : { pos: from.position.clone(), quat: from.quaternion.clone(), age: 0, dur: seconds };
    },
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
    // The gear sheet's seam (gear-room.ts, the live mannequin; it began as the Pit's seam and outlived the Pit room). Hidden (stage-hide.ts):
    // everything in the scene but the lights and the player, so the arena, the opponent and every fight effect go; all stay built for the
    // fight's return on this page, and each comes back exactly as it was. Nothing here disposes.
    gearStage() {
      return {
        scene, camera,
        setArenaVisible(on: boolean) {
          if (on === !pitRestore) return;
          if (on) { pitRestore?.(); pitRestore = undefined; }
          else pitRestore = hideChildren(scene, (child) => child === player || child instanceof THREE.Light);
        },
        hero: {
          // Stand the player's rig at (x, z) facing `heading`, walking at `speed` m/s (0: idle), weapon sheathed. Presentation only: the
          // simulation never sees it, and the next fight frame puts him back on the sim's state.
          place(x: number, z: number, heading: number, speed: number, dt: number) {
            player.position.set(x, 0, z); player.rotation.y = heading;
            warriors?.player.update(speed, dt, 'sheathed', 0);   // m/s, as the fight passes it (travel = distance / dt): the gait blends on speed
          },
        },
        draw() { renderer.render(scene, camera); },   // the sheet's frame: the fight's render() does not run while it shows
      };
    },
    arena,
    // The loot pieces drawn on the player right now as `name|slot|layer` (' (hidden)' if a worn copy is detached or invisible), and his own
    // draws a `replace` piece covers as `name|slot` (' (shown)' if one still shows) — for the debug probe, scripts/worn-loot-check.mjs.
    wornDraws: (): { worn: string[]; covered: string[] } => ({
      worn: (warriors?.player.worn() ?? []).map((m) => `${m.name}|${String(m.userData.slot)}|${String(m.userData.layer)}${m.visible && m.parent ? '' : ' (hidden)'}`),
      covered: (warriors?.player.covered() ?? []).map((m) => `${m.name}|${String(m.userData.slot)}${m.visible ? ' (shown)' : ''}`),
    }),
    bloodState() {
      const opened = warriors?.opponent.anchor.getObjectByName('Opened');
      return {
        ...finisherBlood.inspect(),
        head: severHead
          ? {
              position: severHead.group.position.toArray(),
              screen: this.project(severHead.group.position.toArray()),
              visible: severHead.group.visible,
            }
          : null,
        opened: opened
          ? {
              visible: opened.visible,
              pieces: opened.children
                .filter((p) => p.name !== 'OpenedWeapon')
                .map((p) => ({
                  name: p.name,
                  visible: p.visible,
                  opacity:
                    (
                      (p.getObjectByName('CreatureBody') as THREE.Mesh | undefined)?.material as
                        | THREE.MeshStandardMaterial
                        | undefined
                    )?.opacity ?? 1,
                })),
            }
          : null,
        sources: bloodSources.map((s) => ({
          site: s.site,
          position: s.position.toArray(),
          direction: s.direction.toArray(),
        })),
      };
    },
    setBloodMode(mode: 'red' | 'dark' | 'off') {
      bloodMode = mode;
      finisherBlood.group.visible = mode !== 'off' && bloodSources.length > 0;
      splats.clear(true);
      if (fx.state.flesh) {
        fx.state.impact = 0;
        sparks.visible = false;
      }
      if (mode === 'off') blade.set(false, warriors, mode);
      else if (blade.bloodied) blade.set(true, warriors, mode);
    },
    // The ceremony the previous fight showed (main.ts hands it to the audio resolver so both sides pick alike).
    previousFinisher(): FinisherId | null {
      return lastFinisher;
    },
    // Test/harness reset (the preview harness replays independent kills; each starts as a first fight).
    setPreviousFinisher(id: FinisherId | null) {
      lastFinisher = id;
      fightFinisher = null;
    },
    hamstrungInstalled() { return hamstrungLatch ?? hamstrungOk(); },   // main.ts feeds this to hamstrungPick for the audio
    executionInstalled() { return executionLatch ?? executionOk(); },   // and this to executionPick
    setFinisherOverride(id: FinisherId | null) {
      finisherOverride = id;
      wantHamstrung();
      wantExecution();
    },
    setSignature(search: string, selected: string | null, toolsOpen: boolean) {
      signatures.setMode(resolveSignature(search, selected, toolsOpen));   // the ruled variant unless the test tools are open (signature.ts)
    },
    signatureProbe() {
      return { ...signatures.probe(), marks: signatures.marks.where() };
    }, // debug probe: which signature effect is chosen, how often it fired, and the marks it holds
    get yaw() {
      return rig.yaw;
    },
    orbit(dx: number, dy: number) {
      rig.orbit(dx, dy);
    },
    stopTour() {
      rig.stopTour();
    },
    recenter() {
      rig.recenter();
    },
    lowerResolution() {
      if (ratio > 1) {
        ratio = 1;
        if (!world) renderer.setPixelRatio(ratio);   // a world mount keeps the page's renderer as it is
        resize();
      }
    },
    restoreGraphics() {
      this.lowerResolution();
      rebuildEnvironment();
    },
    // Debug probe: where the player's blade tip was drawn this frame (world metres), so a frame-by-frame check can see a held or moving pose.
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
    // The fallen fighter's body on screen, in CSS pixels (owner 2026-09-22 gate: no HUD element may intersect it at settle time):
    // the bounding box of the victim rig's bones as drawn this frame (the Opened halves share the skeleton, so they are covered),
    // unioned with the severed head's own box when Decapitation sent it away from the torso, padded by a hand's width. Null
    // outside a finish, on a draw, before the rigs are in, or when the body is entirely behind the camera.
    fallenRect(): { x: number; y: number; w: number; h: number } | null {
      if (!fallen || fallen.draw || !warriors) return null;
      const rig = fallen.victim === 1 ? warriors.opponent : warriors.player;
      rig.anchor.updateWorldMatrix(true, true);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const v = new THREE.Vector3();
      const take = (world: THREE.Vector3) => {
        v.copy(world).project(camera);
        if (v.z > 1) return;
        const sx = (v.x * 0.5 + 0.5) * width, sy = (-v.y * 0.5 + 0.5) * height;
        x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
      };
      const world = new THREE.Vector3();
      rig.anchor.traverse((o) => { if (o instanceof THREE.Bone) take(o.getWorldPosition(world)); });
      if (severHead) {
        const box = new THREE.Box3().setFromObject(severHead.group, true);
        if (!box.isEmpty()) for (let i = 0; i < 8; i++) take(world.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
      }
      if (x0 === Infinity) return null;
      const pad = 24;
      return { x: Math.round(x0 - pad), y: Math.round(y0 - pad), w: Math.round(x1 - x0 + 2 * pad), h: Math.round(y1 - y0 + 2 * pad) };
    },
    playing(): string {
      return warriors ? `${warriors.player.playing()} ${warriors.opponent.playing()}` : '';
    }, // debug probe: what each rig plays
    probe(): { sparks: number; burst: [number, number, number]; witchfire: { flames: number; glow: [boolean, boolean] }; skillImpact: { alive: number; last: [number, number, number] }; bodyWounds: [{ visible: number; used: number; reach: number[]; opacity: number; drip: number }, { visible: number; used: number; reach: number[]; opacity: number; drip: number }]; droplets: { falling: number; spots: number } } {
      // Body wounds showing per side (player, opponent): how many marks, and the strongest mark's opacity and drip length.
      const bodyWoundsVisible = bodyWounds.entries.map((marks) => ({ visible: marks.filter((m) => m.group.visible).length, used: marks.filter((m) => m.used).length, reach: marks.filter((m) => m.used).map((m) => +Math.min(9, m.reach).toFixed(3)), opacity: +Math.max(0, ...marks.filter((m) => m.group.visible).map((m) => m.mark.material.opacity)).toFixed(2), drip: +Math.max(0, ...marks.filter((m) => m.group.visible).map((m) => Math.max(0, ...m.strands.filter((s) => s.mesh.visible).map((s) => s.mesh.scale.y)))).toFixed(2) })) as [{ visible: number; used: number; reach: number[]; opacity: number; drip: number }, { visible: number; used: number; reach: number[]; opacity: number; drip: number }];
      return { sparks: clash.alive(), burst: clash.last(), witchfire: { flames: witchfire.alive(), glow: witchfire.glowing() }, skillImpact: { alive: skillImpact.alive(), last: skillImpact.last() }, bodyWounds: bodyWoundsVisible, droplets: { falling: bodyWounds.droplets.falling, spots: bodyWounds.droplets.spots } };
    }, // debug probe for the presentation harness: live contact effects and the body wounds
    bladeTip(): [number, number, number] | null {
      const anchor = warriors?.player.anchor,
        drawn = anchor?.getObjectByName('WeaponDrawn') ?? anchor?.getObjectByName('SwordDrawn');
      if (!drawn) return null;
      player.updateWorldMatrix(true, true);
      const tip = drawn.localToWorld(
        new THREE.Vector3(0, (drawn.userData.contact as { to: number } | undefined)?.to ?? 0.86, 0),
      );
      return [tip.x, tip.y, tip.z];
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
      const blow = events.find((e) => e.type === 'Hit' || e.type === 'GuardBroken'),
        contact = blow || events.some((e) => e.type === 'Blocked' || e.type === 'Parried');
      const killed = events.find((e) => e.type === 'Killed');
      bloodEdge.render(events, practice.duel);
      if (warriors) rankLook?.tick(practice);   // a rank look swaps on only at an idle beat, never with a finish playing
      fallen = practice.finish ? { victim: practice.finish.victim, draw: !!practice.finish.draw } : null;
      const fightWeapons = [practice.duel.fighters[0].weapon, practice.duel.fighters[1].weapon] as const;
      if (!practice.finish) { hamstrungLatch = null; executionLatch = null; } else { hamstrungLatch ??= hamstrungOk(); executionLatch ??= executionOk(); }
      const picked = executionPick(hamstrungPick(finisherOverride, hamstrungLatch === true), executionLatch === true);   // one id for the picture and (main.ts) the cues
      const resolved = practice.finish
        ? resolveExecution(opponentId, practice.finish, fightWeapons, picked, lastFinisher, resolveHamstrung(
            opponentId,
            practice.finish,
            fightWeapons,
            hamstrungPick(finisherOverride, hamstrungLatch === true),
            lastFinisher,
            resolveFinisher(opponentId, practice.finish, fightWeapons, picked === 'hamstrung' || picked === 'execution' ? null : picked, lastFinisher),
          ))
        : null;
      // Decided once per finish, on its first frame: an opened kill with his waist-cut bake still pending plays bakeSafeFinisher's pick (rank-look.ts).
      if (!practice.finish) bakeFallback = null;
      else if (bakeFallback === null) {
        const forced = lookForced && rankLook?.state() === 'on';
        const safe = bakeSafeFinisher(resolved, practice.finish.victim, forced || !!warriors?.opponent.bakePending(), (f) => supportsFinishers(opponentId, f));
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
        if (killed && resolved === 'opened' && practice.finish?.victim === 1 && !lookForced && warriors.opponent.bakePending()) g.__rankLookDrained = true;
        const step = lookBakeOff || lookForced ? null : warriors.opponent.stepOpened(); if (step) (g.__rankLookSteps ??= []).push([step.ms, step.label]);
      }
      // The Quiet One left the game (Dom, 2026-09-27) and nothing picks it; finishers.ts still names it because it is a kill-link-guarded
      // file (tests/record-version-guard.test.ts): dropping it there waits for the next RECORD_VERSION bump.
      const posed = finisher ? poseOf(finisher) : null, finisherPose = posed === 'quietOne' ? null : posed;
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
        if (supportsFinishers(opponentId, 'opened') && !lookForced) warriors?.opponent.prepareOpened();
        if (hamstrungOk()) warriors?.opponent.prepareHamstrung();
        if (executionOk()) warriors?.opponent.prepareExecution();
      } // a fresh match: both bars full again
      fx.onContact({ events, practice, state, dt, blow, contact, killed, finisher, detailedBlood, camera: rig.camera, kick: rig, blockHeavy, warriors, dustFeet, dustPositions, footDust, flinches, burstPool, feel, right, opponentId, bloodMode,
        DIP_FRAMES, setDip: (frames) => { dip = frames; } });   // the camera kick, the sand, the sparks, the wounds, the splats and the blade blood: src/fight/fx.ts
      fx.update(dt);   // moving the Pit's contact effects into src/fight/fx.ts: the clash sparks, the generic sparks, the splats
      // The severed head (decapitation): gravity, a bounce or two, then a roll without slipping until friction stops it.
      if (severHead) {
        severHead.group.visible = bloodMode !== 'off';
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
      const mine = stand(struck(held(actorPose(practice, 0), 0), 0)),
        theirs = stand(struck(held(actorPose(practice, 1), 1), 1));
      // The knee-dip: the struck body drops fast and rises back over SPECIAL_STRUCK (presentation only: the sim's body never moves).
      for (const [side, body] of [[0, player], [1, opponent]] as const) {
        const since = practice.duel.tick - specialStruck[side];
        // A mode may lift him (Red Wind's column scours UP through him, Shield Quake's ripple bursts up under him); the claw drops him.
        if (since >= 0 && since < SPECIAL_STRUCK) body.position.y = (runtimeSpecial ? specialLifts[side] : (mode?.lift ?? -0.28)) * (since < 6 ? since / 6 : 1 - (since - 6) / (SPECIAL_STRUCK - 6));
      }
      // Run Through revision (owner 2026-09-18): the blade STAYS through the body. The killer holds the downward drive
      // (Fin_RunThrough, keyed to settle by a quarter of the window then hold) on the same 0.75× finisher clock; the
      // tableau freezes at progress 1 for as long as the corpse kneels (practice.finish holds until rematch).
      const runThroughHold = finisher === 'runThrough' && practice.finish?.victim === 1;
      const hamstrungFinish = finisher === 'hamstrung' && practice.finish?.victim === 1;
      const executionFinish = finisher === 'execution' && practice.finish?.victim === 1;
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
      const mineGait = runtimeSpecial ? runtimeSpecial.gait(0, practice.duel.fighters, dx * Math.sin(state.heading) + dz * Math.cos(state.heading) < -0.0001 ? -travel : travel, hamstrungFinish ? 'hamstrungStrike' : executionFinish ? 'executionStrike' : runThroughHold ? 'runThroughHold' : playerDefence?.pose || mine.pose) : gait(mode, 0, practice.duel.fighters, dx * Math.sin(state.heading) + dz * Math.cos(state.heading) < -0.0001 ? -travel : travel, hamstrungFinish ? 'hamstrungStrike' : executionFinish ? 'executionStrike' : runThroughHold ? 'runThroughHold' : playerDefence?.pose || mine.pose);   // a mode may have him running or backing (special-modes.ts travel)
      warriors?.player.update(
        mineGait.travel,
        animationDt,
        mineGait.pose,
        runThroughHold || hamstrungFinish || executionFinish ? finishClock : (playerDefence?.progress ?? mine.progress),
        mine.attack,
        mine.contact,
        travel && dt ? (dx * Math.cos(state.heading) - dz * Math.sin(state.heading)) / (travel * dt) : 0,
        practice.result === 'blocked' ? (blockHeavy[0] ? 1.5 : 1) * Math.max(0, 1 - practice.resultAge / 12) : 0,
        practice.duel.fighters[0].guardDirection,
      );
      warriors?.player.opening(practice.opening?.side === 0 ? practice.opening : null);   // opening-pose.ts
      warriors?.opponent.opening(practice.opening?.side === 1 ? practice.opening : null);
      warriors?.player.setStance(stance);   // ?look=stances (stance-pose.ts): the hero's stance, look test only
      warriors?.player.fatigue(practice.fatigue[0], fatigueRead ? { read: true } : undefined);   // fatigue.ts, slice 1: the hero winded and tired (breathing, hunch, sagging blade arm); gassed, the second wind and the foes follow
      warriors?.player.slam(runtimeSpecial ? slams[0] : 0);
      warriors?.opponent.slam(runtimeSpecial ? slams[1] : slam);
      warriors?.opponent.fatigue(practice.fatigue[1], fatigueRead ? { ...FOE_TUNE[opponentId], read: true } : FOE_TUNE[opponentId]);   // fatigue-tune.ts: this body's own breathing
      const theirGait = runtimeSpecial ? runtimeSpecial.gait(1, practice.duel.fighters, ex * Math.sin(practice.enemy.heading) + ez * Math.cos(practice.enemy.heading) < -0.0001 ? -enemyTravel : enemyTravel, enemyDefence?.pose || (finisherPose ?? theirs.pose)) : gait(mode, 1, practice.duel.fighters, ex * Math.sin(practice.enemy.heading) + ez * Math.cos(practice.enemy.heading) < -0.0001 ? -enemyTravel : enemyTravel, enemyDefence?.pose || (finisherPose ?? theirs.pose));
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
      );
      if (finisher === 'opened' && practice.finish?.victim === 1) {
        warriors?.opponent.openWaist(victimProgress, bloodMode);
      }
      if (finisher === 'splitCrown' && practice.finish?.victim === 1)
        warriors?.opponent.splitCrown(victimProgress, bloodMode);
      // Decapitation (owner 2026-09-18): when the seeded rotation picks it, the head comes off just after the skull-gives jolt
      // (the clip's first 9 %) — baked from the rig at that pose, popped along the killing blow, ballistic to a stop. Blood
      // 'off' keeps the head on: gore is presentation, like the rest of the layer.
      if (
        warriors &&
        finisher === 'decapitation' &&
        bloodMode !== 'off' &&
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
        if (practice.finish && finisher !== null && finisher !== 'plainDeath') flinch.clear();
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
      if (hamstrungFinish && warriors && hamstrungSteps) {
        // The killer steps in to the knee, then on to the back (the same two steps solved above), the blade held on each wound as the blow lands.
        const smooth = (t: number) => { t = THREE.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
        const first = finishClock < 0.4;
        if (first) warriors.player.anchor.position.copy(hamstrungSteps.knee).multiplyScalar(smooth(finishClock / HAMSTRUNG_BEATS.knee));
        else warriors.player.anchor.position.lerpVectors(hamstrungSteps.knee, hamstrungSteps.back, smooth((finishClock - 0.4) / (HAMSTRUNG_BEATS.back - 0.4)));
        const target = warriors.opponent.boneWorld(first ? 'calf_r' : 'spine_02');
        const weight = first ? smooth((finishClock - 0.12) / 0.1) * (1 - smooth((finishClock - HAMSTRUNG_BEATS.knee) / 0.13)) : smooth((finishClock - 0.54) / 0.1);
        if (target) warriors.player.aimBladeAt(target, weight, false);
      }
      if (executionFinish && warriors && executionSteps) {
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
        [!!practice.finish && practice.finish.victim === 0 && finisher !== null && finisher !== 'plainDeath', detailedBlood && finisher !== 'plainDeath'],
        camera.position);   // the eye for the facing test: the camera is unparented, so its position is world
      // The signature effect answers this frame's events after the poses are final; it stands down while a finisher plays (the marks stay),
      // and a body the finisher's own gore has taken over hides its marks with its wounds.
      signatures.render(dt, events, {
        fighters: practice.duel.fighters,
        roots: [warriors?.player.anchor ?? null, warriors?.opponent.anchor ?? null],
        scale: [1, OPPONENTS[opponentId].scale],
        yielding: !!practice.finish,
        bloodMode,
      }, camera.position, [!!practice.finish && practice.finish.victim === 0 && finisher !== null && finisher !== 'plainDeath', detailedBlood && finisher !== 'plainDeath']);
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
      if (bossTelegraph) {
        const l = warriors?.player.boneWorld('foot_l'), r = warriors?.player.boneWorld('foot_r');
        bossTelegraph.update(practice.duel.fighters[1], l && r ? l.add(r).multiplyScalar(0.5).setY(Math.min(l.y, r.y)) : null, practice.duel.tick);
      }
      if (runtimeSpecial) {
        const feet = (w: NonNullable<typeof warriors>['player'] | undefined) => { const l = w?.boneWorld('foot_l'), r = w?.boneWorld('foot_r'); return l && r ? l.add(r).multiplyScalar(0.5).setY(Math.min(l.y, r.y)) : null; };
        runtimeSpecial.render(dt, practice.duel.fighters, practice.duel.tick, [feet(warriors?.player), feet(warriors?.opponent)], [warriors?.player.boneWorld('Head') ?? null, warriors?.opponent.boneWorld('Head') ?? null], warriors, !!practice.finish);
        for (const side of SIDES) if (runtimeSpecial.mode(side)?.hideTrail && specialStage(practice.duel.fighters[side])) {
          const trail = (side === 0 ? warriors?.player : warriors?.opponent)?.anchor.getObjectByName('WeaponTrail'); if (trail) trail.visible = false;
        }
      }
      // A landed skill blow's flash and sparks in its move's colour (skill-impact.ts, the kit every skill ships on): after the poses settle.
      skillImpact.fire(events, practice.duel.fighters, [1, OPPONENTS[opponentId].scale]); skillImpact.update(dt);
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
      if (finisher === 'opened' && practice.finish?.victim === 1 && warriors && victimProgress < 1) {
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
      } else if (finisher === 'execution' && practice.finish?.victim === 1 && warriors && victimProgress < 1) {
        // He pitches forward a body's length away from the killer: the side view must have room for where he lands (the same measure, over his extremities).
        const anchor = warriors.opponent.anchor, origin = anchor.getWorldPosition(new THREE.Vector3());
        let measured = 0;
        for (const name of ['Head', 'hand_l', 'hand_r', 'foot_l', 'foot_r']) { const p = warriors.opponent.boneWorld(name); if (p) measured = Math.max(measured, Math.hypot(p.x - origin.x, p.z - origin.z)); }
        openedReach = Math.min(Math.max(openedReach, measured), openedReach + 0.015);
      } else if (!practice.finish) openedReach = 0;
      rig.update(dt, state, practice.enemy, locked, practice.finish ? {
        finisher, posed: !!finisherPose, draw: !!practice.finish.draw, victim: practice.finish.victim, clock: finishClock,
        head: severHead ? { x: severHead.group.position.x, z: severHead.group.position.z } : null,
        big: ['wraith', 'minotaur'].includes(opponentId),
        reach: openedReach,
      } : null, OPPONENTS[opponentId].scale, framingTall(opponentId), framingLow(opponentId));
      if (worldCam) {   // behind the hero, away from the foe, at the walk camera's distance and height; the aim is the foe (the lock)
        const dx = state.x - practice.enemy.x, dz = state.z - practice.enemy.z, n = Math.hypot(dx, dz) || 1;
        // The camera steps to the hero's right so he stands left of centre (x ~ 35-40 % of the screen, clear of the button column) and the foe, on the line ahead, shows beside and beyond him; a low foe (wolf, boar) steps further so it does not hide behind him.
        const gap = Math.max(n, 0.8), side = Math.min(1.1, 0.7 + 0.4 * framingLow(opponentId) * (worldCam.back + gap) / (worldCam.back + 4));
        camera.position.set(state.x + dx / n * worldCam.back + dz / n * side, worldCam.up, state.z + dz / n * worldCam.back - dx / n * side);
        camera.lookAt(wcFoe.set(practice.enemy.x, 1.0, practice.enemy.z));
      }
      if (ease) {
        ease.age += dt; const k = Math.min(1, ease.age / ease.dur), e = k * k * (3 - 2 * k);
        easePos.copy(camera.position); easeQuat.copy(camera.quaternion);
        camera.position.lerpVectors(ease.pos, easePos, e); camera.quaternion.slerpQuaternions(ease.quat, easeQuat, e);
        if (k >= 1) ease = null;
      }
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
      if (!look?.render()) renderer.render(scene, camera);
      renderer.toneMappingExposure = exposure;
      if (dip > 0 && dt > 0) dip--;
      rig.settle(dt);
    },
  };
}
