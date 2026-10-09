// THE ACTOR DRIVER, in the shared fight core (src/fight/, Dom via Strategy 2026-10-09: the Pit and every zone play one fight, one animation system). Moved from src/characters.ts, which now re-exports it
// so the Pit's importers are untouched; Zone 1 imports it from src/fight/index.ts. Nothing in this file changed but the relative paths.
import { beastRenderScale } from '../beast-scale.ts';
import { spectralAppearance } from '../spectral.ts';
import { swingProgress } from '../blade.ts';
export { swingProgress } from '../blade.ts';
import { attackSpecs, POMMEL_BASH, type Attack, type Practice } from '../combat.ts';
import { weaponOf, type Direction, type WeaponId } from '../moves.ts';
import { movesOf, type Fighter } from '../duel.ts';
import type { OpponentId } from '../roster.ts';
import { AnimationMixer, MathUtils, Group, Mesh, PropertyBinding, type Material, type Texture, MeshStandardMaterial, MeshBasicMaterial, Object3D, SkinnedMesh, Uint16BufferAttribute, Float32BufferAttribute, BufferGeometry, BufferAttribute, DoubleSide, Vector3, Quaternion, Matrix3, Matrix4, Box3, LoopOnce, type AnimationAction, type AnimationClip, type BufferAttribute as BufferAttributeType, Skeleton } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { budgetTextures, FIGHTER_TEXTURE_CAP, phoneTier } from '../quality.ts';
import { splitSkull } from '../skull.ts';
import { openWaist, openWaistSteps } from '../opened.ts';
import { openPose, openWeight, NO_OPEN } from '../opening-pose.ts';
import { stancePose, type Stance } from '../stance-pose.ts';
import type { Opening } from '../combat.ts';
import { GUARD_DROP } from '../fatigue-tune.ts';
import type { Fatigue } from '../fatigue.ts';
import { type FatigueTune, breathe, fatigueLayer } from '../fatigue-layer.ts';
import { fatigueRead, readRate } from '../fatigue-read.ts';
import { HAMSTRUNG_BEATS } from '../hamstrung.ts';
import { EXECUTION_BEATS } from '../execution.ts';
import { prepareWeaponDrop } from '../dropped-weapon.ts';
import { tinted } from '../rank-tint.ts';
import type { Tier } from '../grades.ts';

export const COMBAT_CLIPS = ['Armed', 'Attack', 'Hit', 'Death', 'Draw', 'Roll', 'Guard', 'Return', 'Heavy', 'Riposte', 'ArmedWalk', 'StrafeLeft', 'StrafeRight', 'Kick', 'BlockImpact', 'Parry', 'Deflected'] as const;
export const CLIPS = ['Idle', 'Walk', 'Jog', 'Run'] as const;
// Finisher clips are additive (owner-authorized 2026-09-17): the 21 contract clips above stay frozen, Death_* variants append after them.
// Death_QuietOne: every rig GLB still carries it, nothing plays it (owner 2026-09-27); stripping it is an asset rebuild for the Character lane.
export const FINISHER_CLIPS = ['Death_SplitCrown', 'Death_RunThrough', 'Fin_RunThrough', 'Death_QuietOne'] as const;
// Paired scenes added per rig (scripts/build-hamstrung.mjs): a rig without the clip simply has no such role, and nothing that does not play the scene needs it.
// Death_Hamstrung is appended to the GLBs of the creatures that fall to it; the killer's Fin_Hamstrung ships beside warrior.glb (src/assets/hamstrung-killer.json,
// fitted to the hero) and is adopted by the player's actor only in a fight that can play the scene (adoptClip), so the hero's GLB and every other fight are untouched.
// Execution (scripts/build-execution.mjs) ships the same way for every hero-rig body: src/assets/execution-killer.json and execution-victim-hero.json, adopted on demand.
export const ADDITIVE_ROLES = ['Death_Hamstrung', 'Fin_Hamstrung', 'Death_Execution', 'Fin_Execution'] as const;
// Clips only the player's rig (warrior.glb) carries: the SKILL casts (docs/briefs/skill-witch-arm.md). Opponents never cast, so
// their rigs are the hero's clip set without these.
export const PLAYER_ONLY_CLIPS: readonly string[] = ['Skill_WitchArm', 'Skill_Pommel'];
// The renderer plays roles, never clip positions. The sword's roles are its clip names (the shipped warrior.glb set) plus Thrust: the
// sword thrusts with its Riposte clip. Each weapon maps roles to its own clips; an unlisted role plays the clip of its own name (the
// body clips are shared, and a two-handed weapon's fighter starts armed, so Draw never plays for him).
export type Role = (typeof CLIPS)[number] | (typeof COMBAT_CLIPS)[number] | (typeof FINISHER_CLIPS)[number] | (typeof ADDITIVE_ROLES)[number] | 'Thrust' | 'Pommel' | 'ArmedRun';
// ArmedRun: the Centurion's sprint with the sword arm held low (build-armed-run.mjs). Only a rig that carries the clip plays it, and only with a
// one-hand weapon; every other rig aliases the role to its ArmedWalk and never gives it weight, so nothing else moves.
export const ROLES: readonly Role[] = [...CLIPS, ...COMBAT_CLIPS, ...FINISHER_CLIPS, 'Thrust', 'Pommel', 'ArmedRun'];
export const WEAPON_CLIPS: Record<WeaponId, Partial<Record<Role, string>>> = {
  maul: { Idle: 'Maul_Idle', Walk: 'Maul_Walk', Jog: 'Maul_Walk', Run: 'Maul_Walk', Armed: 'Maul_Idle', ArmedWalk: 'Maul_Walk', StrafeLeft: 'Maul_StrafeLeft', StrafeRight: 'Maul_StrafeRight', Attack: 'Maul_Slash', Return: 'Maul_Slash', Heavy: 'Maul_Heavy', Thrust: 'Maul_Thrust', Riposte: 'Maul_Thrust', Guard: 'Maul_Guard', BlockImpact: 'Maul_Guard', Parry: 'Maul_Guard', Deflected: 'Maul_Hit', Hit: 'Maul_Hit', Death: 'Maul_Death' },   // Kick and Roll fall back to the shared clips (the warhammer's convention): the hero rig's Maul_* family (2026-09-23) has neither, and the held Minotaur carries plain Kick/Roll too
  reaper: { Idle: 'Reaper_Idle', Walk: 'Reaper_Walk', Jog: 'Reaper_Walk', Run: 'Reaper_Walk', Armed: 'Reaper_Idle', ArmedWalk: 'Reaper_Walk', StrafeLeft: 'Reaper_StrafeLeft', StrafeRight: 'Reaper_StrafeRight', Attack: 'Reaper_Slash', Return: 'Reaper_Slash', Heavy: 'Reaper_Heavy', Thrust: 'Reaper_Thrust', Riposte: 'Reaper_Thrust', Guard: 'Reaper_Guard', BlockImpact: 'Reaper_Guard', Parry: 'Reaper_Guard', Deflected: 'Reaper_Hit', Hit: 'Reaper_Hit', Death: 'Reaper_Death', Kick: 'Reaper_Kick', Roll: 'Reaper_Roll' },
  longsword: { Thrust: 'Riposte' },
  cleaver: { Thrust: 'Riposte' },   // the Pitborn's, on the sword clip family until the weapons lane lands its own
  knife: { Thrust: 'Riposte' },   // the goblin's, on the sword clip family until the weapons lane lands its own
  estoc: { Thrust: 'Riposte' },   // the Nightborn's, likewise
  // The Ash Wolf's bite (Combat, 2026-10-07; the quadruped rig of #1662, src/assets/wolf.glb): the role map is this row, no second loader. One attack clip, 'Bite', serves every strike role
  // (the sim's path timings tell a bite, a lunge and a maul apart); Hit is 'Hurt', Flee is the backstep. No Guard, Parry, Roll, Kick or Draw: the wolf never guards, never kicks and evades by
  // backstep (profile guard 0, kick 0). The non-hero rig load itself (scene.ts) is Characters'.
  // Every role the table asks for resolves to a clip the rig carries (tests/characters.test.ts): the roles a wolf never plays fall back to the nearest of its seven clips (Draw/Guard/Parry hold the idle,
  // Roll is the Flee gallop, Kick the Bite, the finisher and hamstrung deaths the plain Death), so nothing ever asks for a clip that is not there.
  bite: { Idle: 'Idle', Walk: 'Walk', Jog: 'Walk', Run: 'Run', Armed: 'Idle', ArmedWalk: 'Walk', StrafeLeft: 'Walk', StrafeRight: 'Walk', Attack: 'Bite', Return: 'Bite', Heavy: 'Bite', Thrust: 'Bite', Riposte: 'Bite', Kick: 'Bite', Hit: 'Hurt', BlockImpact: 'Hurt', Deflected: 'Hurt', Parry: 'Idle', Guard: 'Idle', Draw: 'Idle', Roll: 'Flee', Death: 'Death', Death_SplitCrown: 'Death', Death_RunThrough: 'Death', Fin_RunThrough: 'Death', Death_QuietOne: 'Death', Death_Hamstrung: 'Death', Fin_Hamstrung: 'Death' },
  gladius: { Thrust: 'Riposte' },   // the Centurion's: the sword family, zero clips (Strategy, 2026-09-23)
  scythe: { Idle: 'Scythe_Idle', Walk: 'Scythe_Walk', Jog: 'Scythe_Walk', Run: 'Scythe_Walk', Armed: 'Scythe_Idle', ArmedWalk: 'Scythe_Walk', StrafeLeft: 'Scythe_StrafeLeft', StrafeRight: 'Scythe_StrafeRight', Attack: 'Scythe_Reap', Return: 'Scythe_Reap', Heavy: 'Scythe_High', Thrust: 'Scythe_Thrust', Riposte: 'Scythe_Chain', Guard: 'Scythe_Guard', BlockImpact: 'Scythe_BlockImpact', Parry: 'Scythe_BlockImpact', Deflected: 'Scythe_Deflected', Hit: 'Scythe_Hit', Death: 'Scythe_Death' },   // the Executioner's, LIVE 2026-09-18 (the weapons lane's 13-clip family); one reap clip cuts both ways, and a shaft has no blade to turn, so a parry shows the block. The gait roles too — an unlisted role falls back to the SWORD's clip of that name, and the warden's pre-fight stand/walk read as a one-handed sword hold with the scythe mounted (owner review 2026-09-19: "arms behind his back"); a two-handed weapon has no jog/run of its own, the walk carries all gaits
  // One sweep clip cuts both ways (the sim's path is the same either side); no parry clip: a shaft has no blade to turn, so a parry shows the block.
  // The Dwarf's warhammer (weapons lane shelf, 2026-09-20): the maul's role map on the humanoid Warhammer_* family; Kick and Roll fall
  // back to the sword family's (both hands leave the haft there, as the char lane's grip check allows).
  warhammer: { Idle: 'Warhammer_Idle', Walk: 'Warhammer_Walk', Jog: 'Warhammer_Walk', Run: 'Warhammer_Walk', Armed: 'Warhammer_Idle', ArmedWalk: 'Warhammer_Walk', StrafeLeft: 'Warhammer_StrafeLeft', StrafeRight: 'Warhammer_StrafeRight', Attack: 'Warhammer_Slash', Return: 'Warhammer_Slash', Heavy: 'Warhammer_Heavy', Thrust: 'Warhammer_Thrust', Riposte: 'Warhammer_Thrust', Guard: 'Warhammer_Guard', BlockImpact: 'Warhammer_BlockImpact', Parry: 'Warhammer_Guard', Deflected: 'Warhammer_Deflected', Hit: 'Warhammer_Hit', Death: 'Warhammer_Death' },
  trident: { Idle: 'Trident_Idle', Walk: 'Trident_Walk', Jog: 'Trident_Walk', Run: 'Trident_Walk', Armed: 'Trident_Idle', ArmedWalk: 'Trident_Walk', StrafeLeft: 'Trident_StrafeLeft', StrafeRight: 'Trident_StrafeRight', Attack: 'Trident_Sweep', Return: 'Trident_Sweep', Heavy: 'Trident_High', Thrust: 'Trident_Thrust', Riposte: 'Trident_ThrustChain', Guard: 'Trident_Guard', BlockImpact: 'Trident_BlockImpact', Parry: 'Trident_BlockImpact', Deflected: 'Trident_Deflected', Hit: 'Trident_Hit', Death: 'Trident_Death' },   // the gait roles as on the scythe: unlisted falls back to the sword family, wrong for a two-handed pole
};
// The player's own overrides: only the player starts a fight sheathed (duel.ts initialDuel; opponents start ready, Strategy 2026-09-26), so a
// pole's sheathed carry and its draw live on the player's equip file alone and opponent rigs keep the shared row.
export const PLAYER_CLIPS: Partial<Record<WeaponId, Partial<Record<Role, string>>>> = { ...Object.fromEntries([...POMMEL_BASH].map(w => [w, { Pommel: 'Skill_Pommel' }])), trident: { Idle: 'Trident_Carry', Draw: 'Trident_Draw', Pommel: 'Trident_Pommel' }, scythe: { Idle: 'Scythe_Carry', Draw: 'Scythe_Draw' }, warhammer: { Idle: 'Warhammer_Carry', Draw: 'Warhammer_Draw', Pommel: 'Warhammer_Pommel' }, maul: { Idle: 'Maul_Carry', Draw: 'Maul_Draw', Pommel: 'Maul_Pommel' } };
// Pommel is the Pommel Strike's role: the hero's Skill_Pommel where the player's row names it, else the weapon's thrust clip.
export const clipFor = (weapon: WeaponId, role: Role, player = false): string => (player ? PLAYER_CLIPS[weapon]?.[role] : undefined) ?? WEAPON_CLIPS[weapon][role] ?? (role === 'Pommel' ? clipFor(weapon, 'Thrust') : role);
// A quadruped (scripts/character/quadruped_rig.py) carries seven clips, not the humanoid set. It is recognised by its Bite clip, not by a weapon id, so
// the same map serves every beast row (wolf, hound, boar). Every role the renderer asks for lands on one of the seven: any strike is the Bite, a hit
// the Hurt, a backstep or roll the Flee, a guard or draw the Idle (the beast's profile has no guard), every death its Death. Additive scenes it
// does not carry (Death_Hamstrung ...) stay unmapped and are skipped.
export const QUADRUPED_CLIPS: Partial<Record<Role, string>> = {
  Idle: 'Idle', Walk: 'Walk', Jog: 'Walk', Run: 'Run', Armed: 'Idle', ArmedWalk: 'Walk', ArmedRun: 'Run', StrafeLeft: 'Walk', StrafeRight: 'Walk',
  Attack: 'Bite', Return: 'Bite', Heavy: 'Bite', Riposte: 'Bite', Thrust: 'Bite', Pommel: 'Bite', Kick: 'Bite',
  Hit: 'Hurt', BlockImpact: 'Hurt', Deflected: 'Hurt', Parry: 'Hurt', Guard: 'Idle', Draw: 'Idle', Roll: 'Flee',
  Death: 'Death', Death_SplitCrown: 'Death', Death_RunThrough: 'Death', Death_QuietOne: 'Death', Fin_RunThrough: 'Idle',
};
export const isQuadruped = (asset: { animations: readonly { name: string }[] }): boolean => asset.animations.some(a => a.name === 'Bite');
// Every weapon starts sheathed (#741). The one-hand weapons play the hero's hip `Draw` on the draw beat. A pole family with its own
// sheathed carry (Strategy's B, 2026-09-25: the butt grounded by the right foot) maps Idle to `<Family>_Carry` and Draw to `<Family>_Draw`
// in PLAYER_CLIPS. A pole without a draw of its own goes in NO_HIP_DRAW (a hip mime with a pole reads wrong): it holds its armed idle
// and raises straight to ready. Empty since the warhammer and maul took their carries (2026-09-26).
export const NO_HIP_DRAW: readonly WeaponId[] = [];
export const drawRole = (weapon: WeaponId): Role | null => NO_HIP_DRAW.includes(weapon) ? null : 'Draw';
const ONE_SHOT: readonly Role[] = ['Attack', 'Hit', 'Death', 'Draw', 'Roll', 'Guard', 'Return', 'Heavy', 'Riposte', 'Thrust', 'Kick', 'BlockImpact', 'Parry', 'Deflected', 'Death_SplitCrown', 'Death_RunThrough', 'Fin_RunThrough', 'Pommel', 'Death_Hamstrung', 'Fin_Hamstrung', 'Death_Execution', 'Fin_Execution'];
// Match the gait to actual travel, including analog movement and collision stops.
export function gaitWeights(speed: number): number[] {
  speed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  const knots = [0, 1.7, 3, 5.2];
  for (let i = 1; i < knots.length; i++) if (speed < knots[i]) {
    const t = (speed - knots[i - 1]) / (knots[i] - knots[i - 1]);
    return knots.map((_, k) => k === i ? t : k === i - 1 ? 1 - t : 0);
  }
  return [0, 0, 0, 1];
}

// Every Deflected clip opens on the attack's contact pose — identical to a blocked blow — and is thrown widest by its .35 key (build-warrior.mjs,
// build-weapon.mjs). Starting there puts the lost line on the impact frame; the clip's tail still recovers to the rest grip.
const DEFLECT_FROM = .35;
// Presentation follows confirmed contact; a new action or defeat immediately takes precedence.
export function defenceReaction(s: Practice, opponent=false): {pose:'block'|'parry'|'deflected';progress:number} | undefined {
  if (!s.health || !s.playerHealth) return;
  // A broken guard is flung open (the Deflected pose, whatever phase the stagger left him in) instead of reading as a plain hit (SCOPE 7, pick C).
  if (s.result === (opponent ? 'enemyBroken' : 'broken') && s.resultAge < 36) return { pose: 'deflected', progress: s.resultAge / 36 };
  if(opponent ? !s.reaction && s.enemyMode!=='guard' : s.phase!=='ready' && s.phase!=='guard') return;
  const pose=opponent ? s.result==='enemyBlocked' ? 'block' : s.result==='parried' ? 'deflected' : undefined : s.result==='blocked' ? 'block' : s.result==='parried' ? 'parry' : undefined;
  const duration=pose==='deflected' ? 36 : pose==='parry' ? 18 : 12;
  if(pose && s.resultAge<duration) return {pose,progress:s.resultAge/duration};
}

type FighterAsset = { scene: Group; animations: AnimationClip[] };
// One fighter GLB: the same rig, clip names and sword attachments as every other (blade paths are baked once).
import { MissingTextures, retryTransient } from '../retry.ts';
export { MissingTextures, retryTransient, transientLoadError } from '../retry.ts';
// The skin map a parsed fighter lacks ('' when it has them all): a creature's body needs map + roughnessMap, a warrior's Steel map + normalMap.
function missingMap(scene: Group): string {
  const creature = scene.getObjectByName('CreatureBody');
  const mesh = creature ?? scene.getObjectByName('Steel');
  const name = creature ? 'CreatureBody' : 'Steel';
  if (!(creature ? mesh instanceof SkinnedMesh : mesh instanceof Mesh) || !((mesh as Mesh).material instanceof MeshStandardMaterial)) return `${name} mesh`;
  const material = (mesh as Mesh).material as MeshStandardMaterial;
  return !material.map ? `${name}.map` : !(creature ? material.roughnessMap : material.normalMap) ? `${name}.${creature ? 'roughnessMap' : 'normalMap'}` : '';
}
// The check runs INSIDE the retried load, so a bare parse is re-loaded with the same back-off as a dropped fetch (FRANKENDOM-5).
export const loadTextured = (url: string, load: () => Promise<FighterAsset>, sleep?: (ms: number) => Promise<void>): Promise<FighterAsset> =>
  retryTransient(async (i) => {
    const asset = await load(), missing = missingMap(asset.scene);
    if (missing) throw new MissingTextures(url, missing, i);
    return asset;
  }, 3, 800, sleep);
async function loadFighter(url: string) {
  const asset = await loadTextured(url, () => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url));
  // The owner's iPhone defect (2026-09-18): under GPU memory pressure iOS silently drops uploaded fighter
  // textures — black mannequins. On phones we cap the skins at 1K before the first upload (the 2K Gambeson
  // atlas is the offender); desktop keeps the full set. three.js uploads lazily, so this runs pre-render.
  if (phoneTier()) {
    const { textures, resized } = budgetTextures(asset.scene, FIGHTER_TEXTURE_CAP);
    console.info(`phone tier: ${resized}/${textures} fighter textures capped at ${FIGHTER_TEXTURE_CAP}px (the iPhone black-fighters defect)`);
  }
  return asset;
}
// The opponent is his own man (opponentUrl) when one is given; with a single GLB both fighters share the geometry and
// the opponent's Heraldry is recoloured so they are not twins.
// `equipUrl`: the player's weapon's equip file (none for the longsword, which warrior.glb carries). A file that fails to load or fit is
// reported and the player's rig falls back to the longsword, so a weapon never costs the fight its art; `playerWeapon` says which the
// rig carries, and the entry point fights with that one (drawn = simulated).
// `opponentEquipUrl`: the equip file of a weapon the opponent's rig does not bake (the Centurion's gladius over his trident, SCOPE:76). It is
// grafted onto his rig the same way; a file that fails is reported and he keeps the weapon his rig bakes (a fight never waits on it).
export async function loadWarriors(url: string, opponentUrl = url, weapons: [WeaponId, WeaponId] = ['longsword', 'longsword'], equipUrl?: string, equipFailed: (error: unknown) => void = () => {}, opponentEquipUrl?: string, carry = false) {
  const equip = (u?: string) => u ? loadEquip(u).catch((error: unknown) => (error instanceof Error ? error : Error(String(error)))) : undefined;
  const [hero, enemy, part, enemyPart] = await Promise.all([
    loadFighter(url),
    opponentUrl === url ? undefined : loadFighter(opponentUrl),
    equip(equipUrl),
    opponentUrl === url ? undefined : equip(opponentEquipUrl),
  ]);
  let opponent: FighterAsset | undefined = enemy;
  if (opponent && enemyPart) try { if (enemyPart instanceof Error) throw enemyPart; opponent = armOpponent(opponent, enemyPart); } catch (error) { equipFailed(error); }
  return armWarriors(hero, opponent, weapons, part, equipFailed, carry);
}
// A live duel's peer drawn on the HERO rig (Strategy 2026-10-01, Option A): the page's second fighter is the hero's own warrior.glb, loaded a
// second time under another cache key, with the peer's weapon grafted exactly as the player's is (equipWeapon, no shield carry), so he reads
// as a player and not as the page's roster opponent. Only a ?duel= page reaches this, and only once both kits are known (scene.ts `peerKit`).
const PEER_RIG_KEY = '#peer';
export async function loadPeerWarriors(url: string, weapons: [WeaponId, WeaponId], equipUrl?: string, peerEquipUrl?: string, equipFailed: (error: unknown) => void = () => {}) {
  const equip = (u?: string) => u ? loadEquip(u).catch((error: unknown) => (error instanceof Error ? error : Error(String(error)))) : undefined;
  const [hero, foe, part, foePart] = await Promise.all([loadFighter(url), loadFighter(url + PEER_RIG_KEY), equip(equipUrl), equip(peerEquipUrl)]);
  let peer = foe;
  if (foePart) try { if (foePart instanceof Error) throw foePart; peer = equipWeapon(foe, foePart); } catch (error) { equipFailed(error); }
  return armWarriors(hero, peer, weapons, part, equipFailed);
}
// The warriors with the player's weapon in hand. `part`: none for the longsword, the equip file, or the Error its load threw. A failed
// load or a file that does not fit is reported and the rig carries the longsword instead; `playerWeapon` names the one it carries.
// The shield carry is the Centurion's (Lead's ruling A, 2026-09-28: the opponent grafted with his rung kit, the gladius over the trident, so his
// scutum is on a one-hand arm) and, since 2026-09-30 (Strategy, shield ruling), the Shieldmaiden's: on the clips' arm her 0.74 m board faced
// sideways at ready and dipped 9 cm under the floor in the roll. A hero with a taken shield keeps the clips' arm, as on trunk.
export function withShieldCarry(asset: FighterAsset): FighterAsset { asset.scene.userData.shieldCarry = true; return asset; }
// The opponents that carry a one-hand shield on the carry arm and opt in to it in loadWarriors (`carry`): the Shieldmaiden's own rig, and the Centurion, whose
// painted set (public/shields/centurion-*.glb) replaces his scutum (Strategy 2026-10-01). His grafted kit (armOpponent) flags him too: either path opts him in.
export const SHIELD_CARRIERS: ReadonlySet<string> = new Set(['shieldmaiden', 'veteran']);
// The opponent with his rung kit grafted on (loadWarriors): the equip file in his hand, and the carry his scutum arm needs.
export const armOpponent = (opponent: FighterAsset, kit: FighterAsset): FighterAsset => withShieldCarry(equipWeapon(opponent, kit));
export function armWarriors(hero: FighterAsset, enemy: FighterAsset | undefined, weapons: [WeaponId, WeaponId], part?: FighterAsset | Error, equipFailed: (error: unknown) => void = () => {}, carry = false) {
  if (carry && enemy) withShieldCarry(enemy);
  if (part && !(part instanceof Error)) try { return { ...buildWarriors(equipWeapon(hero, part), enemy, weapons), playerWeapon: weapons[0] }; } catch (error) { part = error instanceof Error ? error : Error(String(error)); }
  if (part) equipFailed(part);
  const playerWeapon: WeaponId = part ? 'longsword' : weapons[0];
  return { ...buildWarriors(hero, enemy, [playerWeapon, weapons[1]]), playerWeapon };
}
// A player weapon's equip file (scripts/build-player-weapon.mjs, the #309 contract): its WeaponDrawn part, placed under hand_r exactly as
// the hero build places it, and the weapon's own clip family when it has one. Nothing of the body.
async function loadEquip(url: string): Promise<FighterAsset> {
  const asset = await retryTransient(() => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url));
  if (phoneTier()) budgetTextures(asset.scene, FIGHTER_TEXTURE_CAP);
  return asset;
}
// A weapon shape file (weapon-shapes.ts): its one mesh, in the file's own frame (hand at the origin, +Y), with GPT's painted material as it is.
export async function loadShape(url: string): Promise<Mesh> {
  const asset = await retryTransient(() => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url));
  if (phoneTier()) budgetTextures(asset.scene, FIGHTER_TEXTURE_CAP);
  return shapeMeshOf(asset.scene);
}
export function shapeMeshOf(scene: Object3D): Mesh {
  const meshes: Mesh[] = []; scene.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
  if (meshes.length !== 1 || !(meshes[0].material instanceof MeshStandardMaterial)) throw new Error(`A weapon shape is one mesh with one standard material (found ${meshes.length})`);
  scene.updateMatrixWorld(true);
  const mesh = new Mesh(meshes[0].geometry.clone().applyMatrix4(meshes[0].matrixWorld), meshes[0].material.clone());
  mesh.name = 'WeaponShape';
  return mesh;
}
// The hero rig with the equip file's weapon in place of the sword pair (a WeaponDrawn is always in hand: no sheath), and the file's clips
// played over warrior.glb's same-named ones. A copy: the loaded rig stays whole for the longsword fallback.
export function equipWeapon(hero: FighterAsset, part: FighterAsset): FighterAsset {
  const scene = clone(hero.scene) as Group, hand = scene.getObjectByName('hand_r'), weapon = part.scene.getObjectByName('WeaponDrawn');
  if (!hand || !weapon) throw new Error('Equip file has no WeaponDrawn, or the rig no hand_r');
  // Whatever the rig carries goes: warrior.glb's sword pair, or an opponent's baked weapon (the Centurion's trident is WeaponDrawn, _1, _2).
  const carriedNodes: Object3D[] = []; scene.traverse(o => { if (/^(SwordSheathed|SwordDrawn|WeaponDrawn|WeaponSheathed)(_\d+)?$/.test(o.name)) carriedNodes.push(o); });
  for (const node of carriedNodes) node.removeFromParent();
  hand.add(weapon.clone());
  const own = new Set(part.animations.map(clip => clip.name));
  return { scene, animations: [...part.animations, ...hero.animations.filter(clip => !own.has(clip.name))] };
}
// Loot (brief 5): the pieces of loot.glb, skinned to the hero rig with warrior.glb's bind (build-warrior.mjs WARRIOR_LOOT). Fetched on its own,
// after the rigs, never as part of a fight's load; the player's actor wears the pieces (`wear`) once both are in. Each draw's userData names
// its opponent, slot and layer; its id is `<opponent>.<slot>` (src/loot.ts).
export async function loadLoot(url: string): Promise<SkinnedMesh[]> {
  const asset = await retryTransient(() => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url));
  if (phoneTier()) budgetTextures(asset.scene, FIGHTER_TEXTURE_CAP);
  return lootPiecesOf(asset.scene);
}
// A painted shield (shields.ts): one mesh, face +Z, origin at the grip, as a loot-shaped piece the carry already knows. `gripBone` tells `wear`
// where to hang it: the piece is skinned 100 % to that bone at its bind position, so the board follows the arm and the carry's face roll.
export async function loadShield(url: string): Promise<SkinnedMesh> {
  const asset = await retryTransient(() => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url));
  const mesh = shapeMeshOf(asset.scene);
  const piece = new SkinnedMesh(mesh.geometry, mesh.material);
  piece.name = 'Shield.painted'; piece.userData = { slot: 'Shield', layer: 'over', painted: true, gripBone: 'hand_l' };
  return piece;
}
// The piece's geometry skinned to `bone` at its bind position: every vertex moves with the bone, the grip origin on the bone's bind joint.
export function gripFit(geometry: BufferGeometry, skeleton: Skeleton, bone: string): BufferGeometry {
  const index = skeleton.bones.findIndex(b => b.name === bone);
  if (index < 0) throw new Error(`The rig has no ${bone} to hang a shield on`);
  const joint = new Vector3().setFromMatrixPosition(skeleton.boneInverses[index].clone().invert()), fitted = geometry.clone().translate(joint.x, joint.y, joint.z), count = fitted.getAttribute('position').count;
  fitted.setAttribute('skinIndex', new Uint16BufferAttribute(Uint16Array.from({ length: count * 4 }, (_, i) => (i % 4 === 0 ? index : 0)), 4));
  fitted.setAttribute('skinWeight', new Float32BufferAttribute(Float32Array.from({ length: count * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)), 4));
  return fitted;
}
// A rank look file (rank-look.ts): skinned draws on the opponent's own rig (same bone names), fetched after first playable. `keep` names his
// own draws the look leaves on (face, skin, ...), read from the file's `extras.keep`; a file without it is refused (readRankLook).
export type RankLook = { draws: SkinnedMesh[]; keep: readonly string[] };
export async function loadRankLook(url: string): Promise<RankLook> {
  const asset = await retryTransient(() => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url));
  if (phoneTier()) budgetTextures(asset.scene, FIGHTER_TEXTURE_CAP);
  return readRankLook(asset.scene);
}
// A look file's skinned draws, and its `extras.keep` (on any node): the names of his own draws that stay; every other one goes off.
// Required (Lead, #918): a file without it is refused, so the stream stays on the base look ('failed'), never a guessed hide set.
export function readRankLook(scene: Object3D): RankLook {
  const draws: SkinnedMesh[] = []; let keep: readonly string[] | undefined;
  scene.traverse(object => {
    if (object instanceof SkinnedMesh) draws.push(object);
    // Names as the loader leaves them: GLTFLoader sanitises node names ('Wrap.Boots' loads as 'WrapBoots'), extras stay raw.
    if (Array.isArray(object.userData.keep)) keep = object.userData.keep.map(k => PropertyBinding.sanitizeNodeName(String(k)));
  });
  if (!draws.length) throw new Error('The rank look has no skinned draws');
  if (!keep) throw new Error('The rank look has no extras.keep list');
  return { draws, keep };
}
// The pieces of a parsed loot.glb, each carrying every id it answers to. One function so the game and its tests read the file the same
// way — the last time this traversal was written twice, a shared draw resolved in one and not the other.
//
// Shared draws (brief 14): a piece the whole roster wears is exported ONCE, named `~<id>`, and the file's own map says which
// `<opponent>.<slot>` resolve to it. Read the map off whichever node carries it — three's GLTFExporter puts a root Object3D's userData
// on that object's NODE, not on the glTF scene. A draw with no entry answers to its own name exactly as before, so an old-style file
// and a new one both load and the loader never has to land in the same PR as the asset.
export function lootPiecesOf(scene: Object3D): SkinnedMesh[] {
  const pieces: SkinnedMesh[] = [];
  let map: Record<string, string> = {};
  scene.traverse(object => {
    if (object instanceof SkinnedMesh && typeof object.userData.slot === 'string') pieces.push(object);
    const carried = object.userData?.pieces as Record<string, string> | undefined; if (carried) map = { ...map, ...carried };
  });
  if (!pieces.length) throw new Error('loot.glb carries no pieces');
  for (const piece of pieces) {
    const own = `${piece.userData.opponent}.${piece.userData.slot}`;
    const shared = Object.entries(map).filter(([, target]) => target === own).map(([ref]) => ref);
    piece.userData.ids = shared.length ? shared : [own];
  }
  return pieces;
}
export const lootId = (piece: SkinnedMesh): string => `${piece.userData.opponent}.${piece.userData.slot}`;
// Strategy's ruling C (#705, 2026-09-25): a worn piece keeps the finish it had on the opponent it came from, on every wearer. `wear` swaps a
// piece's mapless palette material for the wearer's same-named mapped one only where the SOURCE opponent's rig maps that name too, so the
// hero resolves a Knight piece exactly as the Knight does (his rig has no mapped Steel: the carrier's own Steel, ungraded).
// Nothing is graded: not the hero's pieces, not an opponent's kit. Each rig's mapped loot-palette names; tests/grade-materials.test.ts reads them from the GLBs.
export const SOURCE_MAPPED: Partial<Record<OpponentId, readonly string[]>> = {
  dwarf: ['Steel', 'Leather'], executioner: ['Leather'], goblin: ['Steel', 'Leather', 'Heraldry', 'Wrap'], knight: ['Leather'],
  nightborn: ['Steel', 'Leather', 'Heraldry', 'Wrap'], pitborn: ['Steel', 'Leather', 'Heraldry', 'Wrap'], plaguedoctor: [],
  shieldmaiden: ['Steel', 'Leather', 'Heraldry', 'Wrap'], veteran: ['Bronze'], witch: [],
};
// A rig's mapped palette materials by name (skipping `skip`, e.g. the worn copies), and the material a loot piece shows on that rig: its mapless
// palette material swapped for the rig's same-named mapped one where the piece's source rig maps that name too (ruling C). `wear` and the
// Pit's rack both resolve a piece this way, so a piece on the rack reads as it will on him (goblin.Boots' Wrap is mapless white alone).
export function rigMaterials(root: Object3D, skip: ReadonlySet<Object3D> = new Set()): Map<string, MeshStandardMaterial> {
  const materials = new Map<string, MeshStandardMaterial>();
  root.traverse(object => { if (object instanceof Mesh && !skip.has(object) && object.material instanceof MeshStandardMaterial && object.material.name && object.material.map) materials.set(object.material.name, object.material); });
  return materials;
}
// A palette name the source rig does not map keeps loot.glb's own entry, and loot.glb's palette is the HERO's (build-warrior.mjs): the
// Executioner's hood came out in the hero's madder red on the player (Dom, 2026-10-07). Where the source opponent wears a different dye of
// that name (scripts/warrior-appearance.mjs; tests/grade-materials.test.ts pins it), the piece wears that dye instead.
export const SOURCE_DYE: Partial<Record<OpponentId, Readonly<Record<string, string>>>> = { executioner: { Heraldry: '#171310' } };
const dyed = new WeakMap<MeshStandardMaterial, MeshStandardMaterial>();
export function sourceMaterial(piece: Mesh, materials: ReadonlyMap<string, MeshStandardMaterial>) {
  const own = piece.material, opponent = piece.userData.opponent as OpponentId;
  if (!(own instanceof MeshStandardMaterial)) return own;
  if (SOURCE_MAPPED[opponent]?.includes(own.name)) return materials.get(own.name) ?? own;
  const dye = SOURCE_DYE[opponent]?.[own.name];
  if (!dye) return own;
  let copy = dyed.get(own);
  if (!copy) { copy = own.clone(); copy.color.set(dye); dyed.set(own, copy); }
  return copy;
}
// Every id a piece answers to: one for an ordinary draw, several for a shared one.
export const lootIds = (piece: SkinnedMesh): string[] => (piece.userData.ids as string[] | undefined) ?? [lootId(piece)];
export const lootWorn = (piece: SkinnedMesh, worn: readonly string[]): boolean => lootIds(piece).some(id => worn.includes(id));
// The clip each role plays for this weapon. Two roles on one clip (the trident's sweep) get their own copies: the mixer keys actions by clip.
function fighterClips(asset: FighterAsset, weapon: WeaponId, player: boolean): Record<Role, AnimationClip> {
  const clips = {} as Record<Role, AnimationClip>, used = new Set<AnimationClip>(), quadruped = isQuadruped(asset);
  for (const role of [...ROLES, ...ADDITIVE_ROLES]) {
    // A player override needs the rig to carry it: the equip file does (tests/weapons.test.ts pins it); a shared opponent rig standing in
    // for the player (buildWarriors without an opponent asset) keeps the shared row.
    const own = player ? PLAYER_CLIPS[weapon]?.[role] : undefined;
    const name = own && asset.animations.some(a => a.name === own) ? own : (quadruped && QUADRUPED_CLIPS[role]) || clipFor(weapon, role), clip = asset.animations.find(a => a.name === name) ?? (role === 'ArmedRun' ? asset.animations.find(a => a.name === 'ArmedWalk') : undefined);
    if (!clip && (ADDITIVE_ROLES as readonly string[]).includes(role)) continue;   // an appended scene this rig does not carry
    if (!clip?.tracks.length || !Number.isFinite(clip.duration) || clip.duration <= 0) throw new Error(`Warrior is missing ${name}`);
    clips[role] = used.has(clip) ? clip.clone() : clip; used.add(clip);
  }
  return clips;
}
// Two actors from parsed assets (textures already checked by the loader; tests build from the parsed rig alone): the
// player from `asset`, the opponent from `opponentAsset` when given, else a recoloured clone of the same asset. `weapons` names
// what each carries (the simulation's word, duel.ts): it picks the clips, the swing's contact key and the striking part the trail follows.
// Per side: torso yaw (spine_01.y), sword-arm pitch (upperarm_r.x) and chest pitch (spine_02.x), radians, added to the Guard clip's frame.
export const GUARD_TILT: Record<Direction, { yaw: number; arm: number; spine: number }> = {
  thrust: { yaw: 0, arm: 0, spine: 0 }, left: { yaw: .45, arm: 0, spine: 0 }, right: { yaw: -.45, arm: 0, spine: 0 },
  overhead: { yaw: 0, arm: -.5, spine: -.25 }, low: { yaw: 0, arm: .5, spine: .25 },
};
// Charged-heavy lean (Strategy 2026-09-24, mockup B "Lean-out"): from the chase camera the player's own body covers the middle of the
// opponent, so a held heavy read as a plain one. While the swing is parked at its chamber the whole upper body leans out to the side, clear
// of the player's silhouette, the weapon arm lifting the head of the weapon skyward. Added after the mixer like the guard tilt (radians:
// spine_01 yaw and side-bend, spine_02 side-bend, upperarm_r lift), eased in over the hold and out through the swing. Presentation only.
export type ChargeLean = { yaw: number; side: number; chest: number; arm: number; lift?: number };   // lift: upperarm_r pitch, negative raises the arm
const NO_LEAN: ChargeLean = { yaw: 0, side: 0, chest: 0, arm: 0 };
// One entry per active opponent, fitted on the roster sheet (held heavy at 375x812, the player guarding). Tall rigs share the Witch's lean;
// the Dwarf sits under the player's shoulder, so he bends further and twists the other way to bring the hammer head up clear. The Goblin is
// too short for any lean to clear the player (LEAN_LOW hid his knife behind the left shoulder, Strategy 2026-09-24): he leans the other way
// and throws the knife arm straight up, so the hooked blade stands above the player's right shoulder.
const LEAN_OUT: ChargeLean = { yaw: .25, side: .55, chest: .25, arm: .55 }, LEAN_LOW: ChargeLean = { yaw: -.5, side: .9, chest: .35, arm: .3 };
const LEAN_HIGH: ChargeLean = { yaw: .4, side: -.7, chest: -.3, arm: 1, lift: -1.6 };
export const CHARGE_LEAN: Partial<Record<OpponentId, ChargeLean>> = {
  veteran: LEAN_OUT, pitborn: LEAN_OUT, nightborn: LEAN_OUT, executioner: LEAN_OUT, plaguedoctor: LEAN_OUT, knight: LEAN_OUT, witch: LEAN_OUT,
  shieldmaiden: LEAN_OUT, dwarf: LEAN_LOW, goblin: LEAN_HIGH,
};
// A charging swing parked at its chamber (duel.ts rewinds age to the chamber while held); false from the tick it is released.
export function holdingCharge(f: Pick<Fighter, 'phase' | 'move' | 'charge' | 'age' | 'weapon'>): boolean {
  if (f.phase !== 'attack' || !f.move || f.charge <= 0) return false;
  const move = movesOf(f)[f.move];
  return move.charges && move.chamber !== null && f.age <= move.chamber;
}
// A shield's face is a single-sided disc (loot.glb `~kit.Shield.Leather`: every normal and triangle faces bind +Z), so from behind (most
// angles on the arm) it was culled and only the rim torus drew, a hoop (owner's iPhone, 2026-09-23 15:21). Shield draws render both sides,
// on their own copy of the material they were given, so the rig's own Leather/brass on his body stays front-sided.
const twoSided = new WeakMap<MeshStandardMaterial, MeshStandardMaterial>();
function bothSides(material: MeshStandardMaterial): MeshStandardMaterial {
  let copy = twoSided.get(material);
  if (!copy) {
    copy = material.clone(); copy.side = DoubleSide;
    // clone() copies userData (so a lighting pass's "already patched" mark) but not the shader hooks it installed: carry them over, whatever they are.
    copy.onBeforeCompile = material.onBeforeCompile; copy.customProgramCacheKey = material.customProgramCacheKey;
    twoSided.set(material, copy);
  }
  return copy;
}
// The shield carry (Centurion gladius + scutum, 2026-09-23). The sword clips close the off hand on the hilt and #478's shield is rigid
// to hand_l, so a one-hand fighter wearing a shield would hold the board across his own blade in every armed clip. After the mixer, the
// left arm is re-aimed in the fighter's own frame (x = his left, y = up, z = toward the opponent): shoulder→elbow, then elbow→wrist — each
// bone keeps its own length — and the wrist rolls the board about the forearm to face the front. RAISED is the guard: the board comes
// up and forward over the chest; STRIKE swings it out to his left while the sword cuts across the front (the sword clips bring the sword
// hand to the midline): measured, the blade crosses the board on 3 frames of ~250, all at the rim or on the first frame of a clip
// (tests/shield-carry.test.ts), where the clips' own hold crosses it on 66. Directions only, so any rig's proportions carry it; the
// player's shield reuses it. No clip changes.
export const SHIELD_CARRY = {
  carry: { elbow: new Vector3(.35, -.8, .45).normalize(), wrist: new Vector3(-.85, .1, .5).normalize() },
  raised: { elbow: new Vector3(.15, 0, 1).normalize(), wrist: new Vector3(-.9, .35, .3).normalize() },
  strike: { elbow: new Vector3(.6, -.8, -.1).normalize(), wrist: new Vector3(.3, -.2, .93).normalize() },
  // The Centurion's Shield Quake (special-fx-quake.ts): the board held up and back over the shoulder, then driven down in front of him, rim to the sand.
  lifted: { elbow: new Vector3(.3, .55, .35).normalize(), wrist: new Vector3(-.2, 1, .25).normalize() },
  planted: { elbow: new Vector3(.3, -.75, .6).normalize(), wrist: new Vector3(.05, -1, .3).normalize() },
} as const;
// A beast is drawn at the size it is met walking (src/beast-scale.ts), by roster id: render only, the sim's capsule is untouched. scene.ts calls this once the foe's rig is built.
export function sizeBeast(warriors: { opponent: { anchor: Group } }, opponentId: string): void {
  const k = beastRenderScale(opponentId);
  if (k !== 1) warriors.opponent.anchor.scale.setScalar(k);
}
export function buildWarriors(asset: FighterAsset, opponentAsset?: FighterAsset, weapons: [WeaponId, WeaponId] = ['longsword', 'longsword']) {
  const hero = { asset, weapon: weapons[0], clips: fighterClips(asset, weapons[0], true) }, enemy = opponentAsset ? { asset: opponentAsset, weapon: weapons[1], clips: fighterClips(opponentAsset, weapons[1], false) } : undefined;
  if (!enemy && weapons[1] !== weapons[0]) throw new Error('A shared rig carries one weapon');
  function create(opponent: boolean) {
    const { asset, clips, weapon } = opponent && enemy ? enemy : hero, specs = attackSpecs(weapon);
    const roles = [...ROLES, ...ADDITIVE_ROLES].filter(role => clips[role]);   // the roles this rig carries clips for (the appended scenes are optional)
    const root = clone(asset.scene), anchor = new Group(); anchor.add(root);
    // A re-proportioned fighter's walk cycle covers less ground than a man's (build-warrior.mjs writes `stride`, root scale × leg scale, on
    // the rig node): his locomotion clips play faster by that so the feet keep planting at the simulation's travel speed. A man's is 1.
    let stride = 1; asset.scene.traverse(o => { if (typeof o.userData.stride === 'number' && o.userData.stride > 0) stride = o.userData.stride; });
    root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = object.receiveShadow = true;
      // Only two small actors: avoid culling against a bind-pose box during motion.
      object.frustumCulled = false;
      if (object.material instanceof MeshStandardMaterial && object.material.name === 'Heraldry' && opponent && !enemy) {
        object.material = object.material.clone(); object.material.color.set('#663c32');
      }
    });
    let opened: ReturnType<typeof openWaist> | undefined, openedJob: ReturnType<typeof openWaistSteps> | undefined;
    // A rank look being baked before its swap (prepareLook): its plan, the stepped job, then the finished bake.
    let lookPrep: { look: RankLook; own: SkinnedMesh[]; body: SkinnedMesh; keep: Set<string>; added: SkinnedMesh[]; job?: ReturnType<typeof openWaistSteps>; opened?: ReturnType<typeof openWaist> } | undefined;
    const worn: SkinnedMesh[] = [], covered = new Map<Mesh, boolean>(), lookHidden = new Set<Mesh>();   // lookHidden: his own draws a rank look turned off (wearLook)   // loot pieces on this rig, and the rig's own draws they hide (with their visibility before)
    const spectral = spectralAppearance(root);
    let spectralLife = 1;
    const mixer = new AnimationMixer(root);
    const actions = {} as Record<Role, AnimationAction>;
    const armedRun = asset.animations.some(a => a.name === 'ArmedRun') && weaponOf(weapon).grip === 'one-hand';   // the rig carries the clip and holds a one-hand weapon
    for (const role of roles) { actions[role] = mixer.clipAction(clips[role]).play(); actions[role].setEffectiveWeight(role === 'Idle' ? 1 : 0); }
    // The weapon on the rig: a WeaponDrawn node (a two-handed weapon, always in hand: no sheathed/drawn swap) or the sword's two nodes.
    // The trail follows the striking part: the node's own contact segment (extras.contact, metres along its Y) or the sword's blade.
    const weaponNode = root.getObjectByName('WeaponDrawn'), sheathed = root.getObjectByName('SwordSheathed'), drawn = root.getObjectByName('SwordDrawn');
    if (!weaponNode && !(sheathed && drawn)) throw new Error('Warrior weapon attachments are missing');
    // The weapon's own draws and their materials, for `grade` (read after spectralAppearance, so a spectral weapon keeps its own material).
    const weaponDraws: [Mesh, MeshStandardMaterial][] = [];
    for (const node of [weaponNode, sheathed, drawn]) node?.traverse(object => { if (object instanceof Mesh && object.material instanceof MeshStandardMaterial) weaponDraws.push([object, object.material]); });
    // `reshape` swaps a shape over the own draws: every mesh the weapon carries goes off, the graded ones come back as they were.
    const ownMeshes: Mesh[] = []; let shaped: Mesh[] = [];
    for (const node of [weaponNode, sheathed, drawn]) node?.traverse(object => { if (object instanceof Mesh) ownMeshes.push(object); });
    const blade = (weaponNode?.userData.contactNode ? root.getObjectByName(weaponNode.userData.contactNode) : weaponNode) ?? drawn!, contactSegment = blade?.userData.contact as { from: number; to: number } | undefined, segment = contactSegment ? [contactSegment.from, contactSegment.to] : [.24, .85];
    for (const role of ONE_SHOT) { const action = actions[role]; if (!action) continue; action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.paused = true; }
    if (opponent) actions.Idle.time = clips.Idle.duration * 0.4;
    mixer.update(0);
    const ribbon = new BufferGeometry(), ribbonVertices = new Float32Array(6 * 6 * 3);
    ribbon.setAttribute('position', new BufferAttribute(ribbonVertices, 3));
    const trail = new Mesh(ribbon, new MeshBasicMaterial({ color: '#e8dfc8', transparent: true, opacity: .12, side: DoubleSide, depthWrite: false }));
    trail.name = 'WeaponTrail'; trail.frustumCulled = false; trail.visible = false; anchor.add(trail);   // named: the Witch-fire hides it (witchfire.ts)
    const samples: Vector3[][] = [];
    const contactByClip = weaponNode?.userData.contactByClip as Record<string, { from: number; to: number }> | undefined;
    const upperArm = root.getObjectByName('upperarm_r');
    let aimedRotation: Quaternion | undefined;
    const offHand = ['upperarm_l', 'lowerarm_l', 'hand_l'].map(n => root.getObjectByName(n)), swordHand = root.getObjectByName('hand_r');
    let aimedOffHand: [Quaternion, Quaternion] | undefined;
    // The shield carry's state: whether he holds a shield on the off hand, the carry's, the guard lift's and the strike's eased weights, and the three
    // left-arm bones as the mixer left them (restored before every update, as the guard tilt is: a held clip does not rewrite them).
    let shieldArm = false, carry = 0, raise = 0, strike = 0, carried = false, faceLocal: Vector3 | undefined;
    const uncarried = [new Quaternion(), new Quaternion(), new Quaternion()];
    const aimBone = (bone: Object3D, child: Object3D, dir: Vector3, amount: number) => {
      bone.updateWorldMatrix(true, true);   // the arm chain only: the renderer and the trail refresh the rest themselves
      const origin = bone.getWorldPosition(new Vector3()), delta = new Quaternion().setFromUnitVectors(child.getWorldPosition(new Vector3()).sub(origin).normalize(), dir);
      bone.quaternion.copy(bone.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(new Quaternion().slerp(delta, amount)).multiply(bone.getWorldQuaternion(new Quaternion())));
    };
    let slam = 0;   // Shield Quake's weight, 0 none, 1 the shield held up, 2 driven down (the scene sets it from the cast)
    function carryShield(amount: number, lift: number, open: number) {
      const [upperL, lowerL, handL] = offHand;
      if (!upperL?.parent || !lowerL || !handL || amount <= 0) return;
      if (!faceLocal) {   // the board's face in hand_l's own frame: +Z in the rig's bind space (build-warrior.mjs lays it face-out along +Z)
        let inverse: Matrix4 | undefined;
        root.traverse(o => { if (!inverse && o instanceof SkinnedMesh) { const i = o.skeleton.bones.findIndex(b => b.name === 'hand_l'); if (i >= 0) inverse = o.skeleton.boneInverses[i]; } });
        if (!inverse) return;
        faceLocal = new Vector3(0, 0, 1).transformDirection(inverse);
      }
      uncarried.forEach((q, i) => q.copy(offHand[i]!.quaternion)); carried = true;
      root.updateWorldMatrix(true, false);
      const frame = root.getWorldQuaternion(new Quaternion()), { carry: c, raised: r, strike: s } = SHIELD_CARRY;
      const toward = (key: 'elbow' | 'wrist') => {
        const v = c[key].clone().lerp(r[key], lift).lerp(s[key], open).lerp(SHIELD_CARRY.lifted[key], Math.min(1, slam)).lerp(SHIELD_CARRY.planted[key], Math.max(0, slam - 1)).normalize();
        if (readGuard) { v.y -= (key === 'elbow' ? .3 : .45) * readGuard; v.normalize(); }   // ?look=fatigue-read: the guard hand sinks with the tiredness (0 without the flag)
        return v.applyQuaternion(frame);
      };
      const elbow = toward('elbow'), wrist = toward('wrist');
      aimBone(upperL, lowerL, elbow, amount);
      aimBone(lowerL, handL, wrist, amount);
      // Roll the board about the forearm until its face points as far toward the opponent as a board strapped along that forearm can.
      lowerL.updateWorldMatrix(true, true);
      const axis = handL.getWorldPosition(new Vector3()).sub(lowerL.getWorldPosition(new Vector3())).normalize();
      const face = faceLocal.clone().applyQuaternion(handL.getWorldQuaternion(new Quaternion())), front = new Vector3(0, 0, 1).applyQuaternion(frame);
      face.addScaledVector(axis, -face.dot(axis)); front.addScaledVector(axis, -front.dot(axis));
      if (face.lengthSq() < 1e-6 || front.lengthSq() < 1e-6) return;
      const roll = new Quaternion().slerp(new Quaternion().setFromUnitVectors(face.normalize(), front.normalize()), amount);
      handL.quaternion.copy(handL.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(roll).multiply(handL.getWorldQuaternion(new Quaternion())));
    }
    // Guard side (owner 2026-09-20, five sides): the one Guard clip is the straight guard; a side tilts it after the mixer writes the
    // frame — the torso turns to that side, the sword arm lifts or drops. Measured on the warrior rig from the Guard pose (blade tip
    // relative to the pelvis, the fighter's right = −x): left +.14 m across, right −.23 m, overhead +.35 m up, low −.37 m down. Code-
    // tilted for the beta; the weapons lane replaces it with authored guard clips family by family. Blended so a slide never snaps.
    const spine1 = root.getObjectByName('spine_01'), spine2 = root.getObjectByName('spine_02');
    const tilt = { yaw: 0, arm: 0, spine: 0 }, tilted = [spine1, spine2, upperArm].filter((b): b is NonNullable<typeof b> => !!b), untilted = tilted.map(b => b.quaternion.clone());
    let open: Opening | null = null, openW = 0;   // opening-pose.ts: the sim's open stagger on this body, and its eased weight
    let tired: Pick<Fatigue, 'level' | 'gassed' | 'second'> = { level: 0, gassed: 0, second: 0 }, tune: FatigueTune | undefined, breath = 0, calmWeight = 0;   // fatigue.ts: the tired-body layer (presentation only), its body's tuning, the breath clock and how calm the pose is
    // ?look=fatigue-read (fatigue-read.ts): the extra bones its pose moves, restored before every update like the guard tilt; empty and untouched without the flag.
    const FORWARD = new Vector3(0, 0, 1);
    const readBones = ['spine_03', 'neck_01', 'Head', 'clavicle_l', 'clavicle_r'].map(n => root.getObjectByName(n)), readSaved = readBones.map(() => new Quaternion());
    let readApplied = false, readBreath = 0, readGuard = 0;
    // ?look=stances (stance-pose.ts): the stance's extra bones, restored before every update; empty and untouched without the flag.
    let stance: Stance = 'neutral', stanceW = 0, stanceClock = 0, stanceApplied = false;
    const stanceBones = ['pelvis', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'upperarm_r', 'lowerarm_r', 'upperarm_l'].map(n => root.getObjectByName(n)), stanceSaved = stanceBones.map(() => new Quaternion()), stancePelvis = new Vector3();
    const turnAbout = (bone: Object3D | null | undefined, axis: Vector3, angle: number) => {   // a world-axis turn of a bone (the clavicles' own axes are not the fighter's)
      if (!bone?.parent || !angle) return;
      const parent = bone.parent.getWorldQuaternion(new Quaternion()), turn = new Quaternion().setFromAxisAngle(axis.clone().applyQuaternion(root.getWorldQuaternion(new Quaternion())), angle);
      bone.quaternion.premultiply(parent.clone().invert().multiply(turn).multiply(parent));
    };
    let leaning = 0, leanDrive = 0;   // the charged-heavy lean's weight, 0..1, and the ease that drives it
    let tiltApplied = false;   // the mixer rewrites a bone only when its clip value changes (a held guard's does not), so the tilt is undone by hand before every update
    let speed = 0;
    let severed = false;   // decapitation is once per kill; unsever() resets on rematch
    let crown: ReturnType<typeof splitSkull> | undefined;
    let droppedWeapon: ReturnType<typeof prepareWeaponDrop> | undefined;
    // Probe a paired scene's contact pose without advancing clocks, fading the ghost or changing the live actor state.
    function sample<T>(role: Role, progress: number, read: () => T): T {
      if (!clips[role]) throw new Error(`Missing paired role ${role}`);
      const saved = roles.map(r => ({ role: r, time: actions[r].time, weight: actions[r].getEffectiveWeight() }));
      const position = root.position.clone(), rotation = root.quaternion.clone(), offset = anchor.position.clone();
      const arm = upperArm?.quaternion.clone(), aim = aimedRotation, hand = offHand.map(b => b?.quaternion.clone()), aimHand = aimedOffHand;
      try {
        for (const r of roles) actions[r].setEffectiveWeight(Number(r === role));
        actions[role].time = progress * clips[role].duration; mixer.update(0);
        root.position.set(0, 0, 0); root.quaternion.identity(); anchor.position.set(0, 0, 0); root.updateWorldMatrix(true, true);
        return read();
      } finally {
        for (const state of saved) { actions[state.role].time = state.time; actions[state.role].setEffectiveWeight(state.weight); }
        mixer.update(0); root.position.copy(position); root.quaternion.copy(rotation); anchor.position.copy(offset);
        if (arm && upperArm) upperArm.quaternion.copy(arm);
        offHand.forEach((b, i) => { if (b && hand[i]) b.quaternion.copy(hand[i]!); });
        aimedRotation = aim; aimedOffHand = aimHand; root.updateWorldMatrix(true, true);
      }
    }
    return {
      anchor,
      // Rank finish on the weapon (Lead via Strategy, 2026-09-27: per-rank weapon looks): the armour's tint (rank-tint.ts) over the weapon's own
      // maps, so no GLB byte changes. What takes it is grades.ts CLASS_OF (blade metal, fittings trim; wood, stone and bone stay). No tier = its own finish.
      grade(tier: Tier | undefined) { for (const [draw, own] of weaponDraws) draw.material = tier ? tinted(own, tier) : own; },
      // Weapon shape per rank band (weapon-shapes.ts): the band's mesh in place of the weapon's own draws, hung on the weapon node itself (the
      // file's frame is the node's: hand at the origin, +Y along the weapon), so it follows every clip and the draw/sheathe swap. The node, its
      // contact extras and the sim's blade tables stay: reach and contact never move. Its finish is GPT's painted one, never the rung's tint
      // (Strategy 2026-09-28: painted per band, no runtime tint on shaped weapons), so `grade` leaves it be. None = his own.
      reshape(shape: Mesh | undefined) {
        if (!shape && !shaped.length) return;   // never shaped: nothing to give back, and his own draws' visibility stays the rig's
        for (const draw of shaped) draw.removeFromParent();
        shaped = [];
        for (const mesh of ownMeshes) mesh.visible = !shape;
        if (shape) for (const node of weaponNode ? [weaponNode] : [drawn!, sheathed!]) {
          const draw = shape.clone(); draw.userData.weaponShape = true; node.add(draw); shaped.push(draw);
        }
      },
      // Wear these loot pieces (loadLoot) and nothing else: each is bound to this rig's skeleton beside his own body draw, so it follows every
      // clip; a `replace` piece hides his own draws in that slot (a helmet hides hair too); an `over` piece sits on top of them. A piece's
      // mapless palette material is swapped for his material of the same name (Steel, Leather, Heraldry, Gambeson) where the piece's source rig
      // maps that name too (SOURCE_MAPPED, ruling C); the rest keep their own.
      // One bad piece never undresses the rest: each is dressed on its own, and a piece that throws is skipped (its slot stays his own),
      // warned and handed to `failed` with its id; only a rig with no body to hang anything on throws.
      // Rank finishes (rank-tint.ts): `tierOf` names the rung a piece shows — the rung it was taken at on the player, the rung he is met at on an
      // opponent — and its metal, trim and leather take that grade as a tint over their own maps. Without it nothing is graded (ruling C, #705).
      // His own draws are never touched.
      wear(pieces: readonly SkinnedMesh[], failed: (id: string, error: unknown) => void = () => {}, tierOf: (piece: SkinnedMesh) => Tier | undefined = () => undefined) {
        for (const piece of worn) piece.removeFromParent(); worn.length = 0;
        for (const [draw, visible] of covered) draw.visible = visible; covered.clear();
        let body: SkinnedMesh | undefined; const materials = rigMaterials(root);
        root.traverse(object => {
          // A creature-pipeline body (Veteran, Dwarf, Executioner) is one untagged `CreatureBody` draw on the same skeleton; its Body slot names empty nodes.
          if (object instanceof SkinnedMesh && (object.userData.slot === 'Body' || object.name === 'CreatureBody') && !body) body = object;
        });
        if (!body) throw new Error('The rig has no Body draw to hang loot on');
        // The rig's bones with the PIECE's own inverse binds (#606): every loot.glb draw is authored on the hero's bind pose, so on a
        // re-proportioned body it must follow his joints — with the rig's own inverse binds the Dwarf's gloves hung above his head. On the
        // hero they are identical, so he keeps his own skeleton; elsewhere one retargeted skeleton per source skin.
        const retargeted = new Map<Skeleton, Skeleton>(), rig = body.skeleton;
        const skeletonFor = (source: Skeleton): Skeleton => {
          let skeleton = retargeted.get(source);
          if (!skeleton) retargeted.set(source, (skeleton = source.boneInverses.length === rig.boneInverses.length && source.boneInverses.every((m, i) => m.equals(rig.boneInverses[i])) ? rig : new Skeleton(rig.bones, source.boneInverses)));
          return skeleton;
        };
        for (const piece of pieces) {
          try {
            const painted = piece.userData.painted === true, mapped = painted ? piece.material : sourceMaterial(piece, materials);   // a painted piece keeps its own finish: no rig map, no rank tint
            const tier = painted ? undefined : tierOf(piece), own = tier && mapped instanceof MeshStandardMaterial ? tinted(mapped, tier) : mapped;
            const material = piece.userData.slot === 'Shield' && own instanceof MeshStandardMaterial ? bothSides(own) : own;
            const copy = new SkinnedMesh(typeof piece.userData.gripBone === 'string' ? gripFit(piece.geometry, rig, piece.userData.gripBone) : piece.geometry, material);
            copy.name = piece.name; copy.userData = { ...piece.userData }; copy.castShadow = copy.receiveShadow = true; copy.frustumCulled = false;
            copy.bind(piece.skeleton ? skeletonFor(piece.skeleton) : body.skeleton, body.bindMatrix);
            body.parent!.add(copy); worn.push(copy);
          } catch (error) {
            const id = lootId(piece); console.warn(`loot: ${id} (${piece.name}) could not be worn and was skipped`, error); failed(id, error);
          }
        }
        shieldArm = asset.scene.userData.shieldCarry === true && weaponOf(weapon).grip === 'one-hand' && worn.some(p => p.userData.slot === 'Shield');   // a two-hander's shield stows (#478's `stow`): no carry
        const slots = new Set(worn.filter(p => p.userData.layer === 'replace').map(p => String(p.userData.slot)));
        if (slots.has('Helmet')) slots.add('Hair');
        root.traverse(object => { if (object instanceof Mesh && !worn.includes(object as SkinnedMesh) && !object.userData.rankLook && slots.has(String(object.userData.slot))) { covered.set(object, object.visible); object.visible = false; } });
        // Under a rank look a re-dress (a rematch at a new rung) never brings his base look back: the carriers stay off with it (a shield stays on).
        if (lookHidden.size) { for (const piece of worn) if (piece.userData.slot !== 'Shield') piece.visible = false; for (const draw of lookHidden) draw.visible = false; }
      },
      // What wearing this look takes: his own skinned draws, the one it hangs on, what it keeps and its draws bound to his bones (not yet added).
      lookPlan(look: RankLook) {
        const bones = new Map<string, Object3D>(); root.traverse(object => { if ((object as { isBone?: boolean }).isBone) bones.set(object.name, object); });
        const own: SkinnedMesh[] = []; root.traverse(object => { if (object instanceof SkinnedMesh && !worn.includes(object) && !object.userData.rankLook) own.push(object); });
        const body = own.find(o => o.userData.slot === 'Body' || o.name === 'CreatureBody') ?? own[0];
        if (!body) throw new Error('The rig has no skinned draw to hang a rank look on');
        const names = new Set(own.map(o => o.name)), keep = new Set(look.keep);
        // A look draw named like one of his that stays is his (not doubled); named like one that goes off, it replaces it.
        const added = look.draws.filter(d => !(names.has(d.name) && keep.has(d.name))).map(draw => {
          const skeleton = new Skeleton(draw.skeleton.bones.map(b => { const bone = bones.get(b.name); if (!bone) throw new Error(`The rank look's bone ${b.name} is not on this rig`); return bone as typeof b; }), draw.skeleton.boneInverses);
          const copy = new SkinnedMesh(draw.geometry, draw.material);
          // No shadow from a look draw on the phone tier (Auditer, 2026-09-28, Dom's "phone slower" after the Plague Doctor looks): his L2–L10 files
          // are 121k skinned vertices (the Goblin's 39k, his shipped rig 57k), and castShadow skins every one of them a second time each frame
          // into a 512² map that barely shows the coat. His shipped draws keep their shadow (loadWarrior), so the figure still stands in one.
          copy.name = draw.name; copy.userData = { ...draw.userData, rankLook: true }; copy.castShadow = !phoneTier(); copy.receiveShadow = true; copy.frustumCulled = false;
          // Three's first render of a SkinnedMesh with no bounding sphere skins every vertex on the CPU to make one, for depth sorting, culled or
          // not: 20–88 ms at cpu×4 in the Witch L10-phone swap frame (Hero Look sampler, 2026-09-29). Only sorting reads it here, so the file's
          // bind-pose sphere (the glTF loader sets it from the POSITION min/max) serves.
          copy.boundingSphere = (draw.geometry.boundingSphere ?? (draw.geometry.computeBoundingSphere(), draw.geometry.boundingSphere!)).clone();
          copy.bind(skeleton, body.bindMatrix);
          return copy;
        });
        return { own, body, keep, added };
      },
      // The look's waist-cut bake, taken before it is on (Lead's ruling on #1025 row C: an opened kill at L8/L10 came before a rebake stepped
      // after the swap had drained, nightborn-L8/L10-f3c54a6f). Its draws hang on him hidden; the bake cuts them in and the draws it turns off
      // out. stepLook() takes it in steps while the look streams (scene.ts); the swap then wears the finished bake and has nothing left to take.
      prepareLook(look: RankLook) {
        const plan = this.lookPlan(look);
        for (const copy of plan.added) { copy.visible = false; plan.body.parent!.add(copy); }
        const shows = new Set<Object3D>(plan.added), off = new Set<Object3D>([...plan.own.filter(d => !plan.keep.has(d.name)), ...worn.filter(p => p.userData.slot !== 'Shield')]);
        lookPrep = { look, ...plan, job: openWaistSteps(root, anchor, false, (o, shown) => shows.has(o) || (shown && !off.has(o))) };
      },
      // One step of it, in the bake pose: its milliseconds, what it did and whether it is done; null with none pending.
      stepLook(): { ms: number; label: string; done: boolean } | null {
        const prep = lookPrep; if (!prep?.job) return null;
        const start = performance.now(), step = this.inBakePose(() => prep.job!.next());
        if (step.done) { prep.opened = step.value; prep.opened.group.visible = false; prep.job = undefined; }
        return { ms: performance.now() - start, label: step.done ? 'floor table (last)' : step.value, done: !!step.done };
      },
      // The rank look (tier-looks-runtime.md, the set rule): every one of his own skinned draws goes off and the look goes on, AS A SET, except
      // the draws the look keeps; his carriers go off with them. One call, once per fight; his weapon (unskinned) is never touched. The look's
      // draws follow his bones by name with their own inverse binds, as a loot piece does (#606). The opened-waist bake is taken again so a
      // finisher cuts the body he now wears.
      wearLook(look: RankLook) {
        const prep = lookPrep?.look === look ? lookPrep : undefined; lookPrep = undefined;
        const { own, body, keep, added } = prep ?? this.lookPlan(look);
        for (const copy of added) { copy.visible = true; if (!copy.parent) body.parent!.add(copy); }
        // Hidden for good (a look is once per fight and stays for the rematches): their GPU buffers are freed, so a phone never holds both.
        // Row 5a nets only what was drawn: a draw already off (the Centurion's BronzeHelmet below his helmet rank) frees nothing.
        for (const draw of own) if (!keep.has(draw.name)) { draw.userData.tris = draw.visible ? (draw.geometry.index ? draw.geometry.index.count : draw.geometry.getAttribute('position').count) / 3 : 0; draw.visible = false; draw.geometry.dispose(); lookHidden.add(draw); }
        // His carriers go off with his look; a worn shield stays (no look file carries one: the Veteran's scutum, a kit shield).
        for (const piece of worn) if (piece.userData.slot !== 'Shield') piece.visible = false;
        // Their maps too, unless a draw still shown on him uses them (a kept draw, the look): three uploads a disposed map again if it is ever drawn.
        const mapsOf = (m: Material | Material[]) => (Array.isArray(m) ? m : [m]).flatMap(x => Object.values(x).filter((v): v is Texture => !!v && (v as Texture).isTexture));
        const shown = new Set<Texture>(); root.traverse(o => { if (o instanceof Mesh && o.visible) for (const t of mapsOf(o.material)) shown.add(t); });
        for (const draw of lookHidden) for (const t of mapsOf(draw.material)) if (!shown.has(t)) t.dispose();
        // The opened-waist bake is taken again, but not on this frame and not in one: whole, it cost 1983 ms at CPU ×4 (goblin-l3-6269f661,
        // row C). stepOpened() takes it one draw per frame from the next frame on (scene.ts); a kill that comes first finishes it (prepareOpened).
        // With the look's bake taken while it streamed (prepareLook), the swap wears it: nothing is left for a kill to finish.
        if (prep?.opened) { opened?.dispose(); opened = prep.opened; openedJob = undefined; }
        else if (opened) { opened.dispose(); opened = undefined; openedJob = openWaistSteps(root, anchor); }
        // What the look costs on this device (the gate's phone memory row): its triangles and its textures as uploaded (RGBA with mips).
        const maps = new Set<{ image?: { width?: number; height?: number } }>();
        for (const d of added) for (const m of Array.isArray(d.material) ? d.material : [d.material]) for (const v of Object.values(m)) if (v && (v as { isTexture?: boolean }).isTexture) maps.add(v as { image?: { width?: number; height?: number } });
        const tris = added.reduce((n, d) => n + (d.geometry.index ? d.geometry.index.count : d.geometry.getAttribute('position').count) / 3, 0);
        // What the phone's GPU pays: every skinned vertex of the look, each pass (Dom 2026-09-28, the fight-stats table: PD L10 121,511 against
        // the 53,679 body it frees; the Goblin's 39,413). The gate's row 5c reads it whole for a body-replacing look, ≤ 60k on the phone tier.
        const vertices = added.reduce((n, d) => n + d.geometry.getAttribute('position').count, 0);
        // A look that replaces his whole body (extras.keep = []: a scanned rig's fused CreatureBody, or every draw of a built rig such as the
        // Nightborn's, goes off) is held to the phone-memory bar net of the body it frees (Lead's ruling on #1001 row 5a): the gate reads
        // tris - bodyFreed (each count taken as it went off, above).
        const bodyFreed = keep.size ? 0 : [...lookHidden].reduce((n, d) => n + (d.userData.tris as number), 0);
        const gpuBytes = [...maps].reduce((n, t) => n + (t.image?.width ?? 0) * (t.image?.height ?? 0) * 4 * 4 / 3, 0);
        return { added: added.map(d => d.name), hidden: [...lookHidden].map(d => d.name), tris, vertices, bodyFreed, maps: maps.size, gpuMB: +(gpuBytes / 2 ** 20).toFixed(1) };
      },
      slam(weight: number) { slam = weight; },
      // Fatigue (fatigue.ts, Lead's brief B): the driver's value for this body this frame, and the body's own tuning (Goblin quick and shallow, Executioner slow and deep).
      opening(o: Opening | null) { open = o; },   // opening-pose.ts: this body's open stagger (Practice.opening when its side is this body), or null
      fatigue(f: Pick<Fatigue, 'level' | 'gassed' | 'second'>, t?: FatigueTune) { tired = f; tune = t; },
      setStance(s: Stance) { stance = s; },   // stance-pose.ts: this body's stance (look test only; neutral = nothing)
      worn: (): readonly SkinnedMesh[] => worn,
      covered: (): readonly Mesh[] => [...covered.keys()],   // his own draws a `replace` piece hides (the debug probe asserts they stay hidden)
      // The clip carrying most of the pose right now and the node the weapon hangs from (the debug probe's word for what the rig is doing): `role:clip@node`.
      playing(): string { if (opened?.group.visible) return `Opened:WaistCut@${blade.name}`; let best: Role = 'Idle'; for (const role of roles) if (actions[role].getEffectiveWeight() > actions[best].getEffectiveWeight()) best = role; return `${best}:${clips[best].name}@${blade.name}`; },
      update(travelSpeed: number, dt: number, pose: 'sheathed' | 'draw' | 'ready' | 'attack' | 'hit' | 'death' | 'splitCrown' | 'decapitation' | 'runThrough' | 'runThroughHold' | 'opened' | 'hamstrung' | 'hamstrungStrike' | 'execution' | 'executionStrike' | 'roll' | 'guard' | 'kick' | 'block' | 'parry' | 'deflected' = 'sheathed', progress = 0, attack: Attack = 'light', contact = .35, lateral = 0, recoil = 0, guardSide: Direction | null = null, lean: ChargeLean | null = null, holding = false) {
        // dt 0 evaluates the pose for the current tick without advancing anything (the frame loop's hit-stop): clip times still follow `progress`,
        // weights and gait hold, the mixer applies at zero, and no trail sample is taken.
        if (pose !== 'opened' && opened) { opened.group.visible = false; root.visible = true; }
        if ((pose === 'hamstrung' || pose === 'hamstrungStrike') && !clips[pose === 'hamstrung' ? 'Death_Hamstrung' : 'Fin_Hamstrung']) throw new Error('Hamstrung clips are not installed on this rig');
        if ((pose === 'execution' || pose === 'executionStrike') && !clips[pose === 'execution' ? 'Death_Execution' : 'Fin_Execution']) throw new Error('Execution clips are not installed on this rig');
        const step = Math.max(0, Math.min(dt, 0.1));
        speed += (Math.abs(travelSpeed) - speed) * (1 - Math.exp(-step * 14));
        if (speed < 0.015) speed = 0;
        for (const role of ['Walk', 'Jog', 'Run'] as const) actions[role].setEffectiveTimeScale(travelSpeed < 0 ? -1 : 1);
        const gait = gaitWeights(speed), weights: Partial<Record<Role, number>> = { Idle: gait[0], Walk: gait[1], Jog: gait[2], Run: gait[3] };
        // An armed rig with its own run (armedRun) blends ArmedWalk into it from 3.2 to 4 m/s and keeps it above; without one the armed walk holds to 4.2 and the plain Run takes over, as before.
        if (pose !== 'sheathed' && (speed < 4.2 || armedRun)) { const movement = 1-gait[0], side = Math.min(1,Math.abs(lateral)), run = armedRun ? MathUtils.smoothstep(speed, 3.2, 4) : 0; weights.Walk = weights.Jog = weights.Run = 0; weights.ArmedWalk = movement*(1-side)*(1-run); weights[lateral < 0 ? 'StrafeLeft' : 'StrafeRight'] = movement*side*(1-run); weights.ArmedRun = movement*run; }
        actions.ArmedWalk.setEffectiveTimeScale((travelSpeed < 0 ? -1 : 1)*Math.max(.25,speed/(1.7*stride)));
        actions.ArmedRun.setEffectiveTimeScale((travelSpeed < 0 ? -1 : 1)*Math.max(.5,speed/(5.2*stride)));   // the sprint's ground speed is the gait table's 5.2 m/s knot
        for (const role of ['StrafeLeft', 'StrafeRight'] as const) actions[role].setEffectiveTimeScale(Math.max(.25,speed/(.75*stride)));
        const combatRole: Role | null = pose === 'block' ? 'BlockImpact' : pose === 'parry' ? 'Parry' : pose === 'deflected' ? 'Deflected' : pose === 'kick' ? 'Kick' : pose === 'attack' ? attack === 'return' ? 'Return' : attack === 'heavy' ? 'Heavy' : attack === 'riposte' ? 'Riposte' : attack === 'thrust' ? 'Thrust' : attack === 'pommel' ? 'Pommel' : 'Attack' : pose === 'hit' ? 'Hit' : pose === 'death' ? 'Death' : pose === 'splitCrown' || pose === 'decapitation' || pose === 'opened' ? 'Death_SplitCrown' : pose === 'runThrough' ? 'Death_RunThrough' : pose === 'runThroughHold' ? 'Fin_RunThrough' : pose === 'hamstrung' ? 'Death_Hamstrung' : pose === 'hamstrungStrike' ? 'Fin_Hamstrung' : pose === 'execution' ? 'Death_Execution' : pose === 'executionStrike' ? 'Fin_Execution' : pose === 'draw' ? drawRole(weapon) : pose === 'roll' ? 'Roll' : pose === 'guard' ? 'Guard' : null;
        const armed = pose !== 'sheathed';
        if (armed) { weights.Armed = weights.Idle; weights.Idle = 0; }
        const dead = pose === 'death' || pose === 'splitCrown' || pose === 'decapitation' || pose === 'runThrough' || pose === 'opened' || pose === 'hamstrung' || pose === 'execution';
        for (const role of roles) {
          const a = actions[role];
          const fade = pose === 'opened' ? Math.min(1,progress/.04) : combatRole === null ? 0 : ['draw','guard','block','parry','deflected','runThroughHold','hamstrungStrike','executionStrike'].includes(pose) ? 1 : Math.min(1, progress * 12, dead ? 1 : (1 - progress) * 10);
          const target = (weights[role] || 0) * (1 - fade) + Number(role === combatRole) * fade;
          const activeBlade = pose === 'attack' && progress >= contact-1/specs[attack].recovery && progress <= contact+4/specs[attack].recovery;
          // A parried attacker is thrown off line on the impact tick itself (Strategy 2026-09-24: the parry's tell is the attacker, not a spark):
          // the weight snaps like a live blade does — the parry's hit-stop runs at dt 0, where an eased weight would hold the attack pose.
          a.setEffectiveWeight(pose === 'opened' || ((pose === 'hamstrung' || pose === 'hamstrungStrike' || pose === 'execution' || pose === 'executionStrike') && progress >= .05) ? target : activeBlade || pose === 'deflected' ? Number(role === combatRole) : a.getEffectiveWeight() + (target - a.getEffectiveWeight()) * (1 - Math.exp(-step * 24)));
          if (role === combatRole) a.time = Math.min(.999999, Math.max(0, pose === 'attack' ? swingProgress(progress, contact, specs[attack].source) : pose === 'deflected' ? DEFLECT_FROM + progress * (1 - DEFLECT_FROM) : progress)) * clips[role].duration;
        }
        if (!weaponNode) { drawn!.visible = armed && (pose !== 'draw' || progress >= .29); sheathed!.visible = !drawn!.visible; }
        anchor.position.set(0, 0, 0); // only the presentation anchor steps into a Run Through
        if (aimedRotation && upperArm) upperArm.quaternion.copy(aimedRotation);
        aimedRotation = undefined;
        if (aimedOffHand) { offHand[0]!.quaternion.copy(aimedOffHand[0]); offHand[1]!.quaternion.copy(aimedOffHand[1]); aimedOffHand = undefined; }
        if (stanceApplied) { stanceBones.forEach((b, i) => b?.quaternion.copy(stanceSaved[i])); stanceBones[0]?.position.copy(stancePelvis); stanceApplied = false; }
        if (readApplied) { readBones.forEach((b, i) => b?.quaternion.copy(readSaved[i])); readApplied = false; }
        if (tiltApplied) { tilted.forEach((b, i) => b.quaternion.copy(untilted[i])); tiltApplied = false; }
        if (carried) { offHand.forEach((b, i) => b!.quaternion.copy(uncarried[i])); carried = false; }
        mixer.update(step);
        const guarding = guardSide && (pose === 'guard' || pose === 'block' || pose === 'parry') ? GUARD_TILT[guardSide] : GUARD_TILT.thrust, ease = 1 - Math.exp(-step * 16);
        for (const k of ['yaw', 'arm', 'spine'] as const) tilt[k] += (guarding[k] - tilt[k]) * ease;
        // Two cascaded eases: the lean starts and stops at zero speed, so neither the hold nor the release pops.
        const follow = 1 - Math.exp(-step * 18);
        leanDrive += (Number(!!lean && holding) - leanDrive) * follow; leaning += (leanDrive - leaning) * follow;
        if (leaning < 1e-3 && leanDrive < 1e-3) leaning = leanDrive = 0;
        const l = lean ?? NO_LEAN;
        // The tired body (fatigue.ts): breathing in the chest, a hunch, the sword arm sagging; only while the pose is calm (a swing's contact pose is the sim's blade).
        calmWeight += (Number(!dead && (pose === 'ready' || pose === 'guard' || pose === 'sheathed')) - calmWeight) * ease;
        breath += step * breathe(tired, tune); readBreath += step * readRate(tired, tune);
        const layer = tired.level > 0 || tired.gassed > 0 || calmWeight > .001 ? fatigueLayer(tired, breath, calmWeight, tune) : null;
        openW += (openWeight(open) - openW) * (1 - Math.exp(-step * 30));   // quick: it follows the sim's own ramp, which is already eased
        if (openW < 1e-3 && !open) openW = 0;
        const gap = dead || pose === 'attack' ? NO_OPEN : openPose(openW, open?.kind);
        if (tilt.yaw || tilt.spine || tilt.arm || leaning || layer || gap !== NO_OPEN) {
          tilted.forEach((b, i) => untilted[i].copy(b.quaternion)); tiltApplied = true;
          if (spine1) { spine1.rotation.y += tilt.yaw + leaning * l.yaw; spine1.rotation.z += leaning * l.side; }
          if (spine2) { spine2.rotation.x += tilt.spine; spine2.rotation.z += leaning * l.chest; }
          if (upperArm) { upperArm.rotation.x += tilt.arm + leaning * (l.lift ?? 0); upperArm.rotation.y += leaning * l.arm; }
          if (gap !== NO_OPEN) { if (spine1) { spine1.rotation.x += gap.lean; spine1.rotation.z += gap.tilt; } if (upperArm) upperArm.rotation.x += gap.arm; }
          if (layer && tune?.read) {   // ?look=fatigue-read: the whole spine, head and shoulders carry the tell; the sword arm keeps the live sag
            const r = fatigueRead(tired, readBreath, calmWeight, layer, tune); readGuard = r.guard;
            if (spine1) spine1.rotation.x += r.spine1; if (spine2) spine2.rotation.x += r.spine2; if (upperArm) upperArm.rotation.x += r.arm;
            readBones.forEach((b, i) => b && readSaved[i].copy(b.quaternion)); readApplied = true;
            if (readBones[0]) readBones[0].rotation.x += r.spine3;
            if (readBones[1]) readBones[1].rotation.x += r.neck;
            if (readBones[2]) readBones[2].rotation.x += r.head;
            root.updateWorldMatrix(true, true);
            turnAbout(readBones[3], FORWARD, r.shrug + r.heave); turnAbout(readBones[4], FORWARD, -(r.shrug + r.heave));
          } else {
            readGuard = 0;
            if (layer) { if (spine1) spine1.rotation.x += layer.hunch; if (spine2) spine2.rotation.x += layer.chest; if (upperArm) upperArm.rotation.x += layer.arm; }
          }
        }
        stanceW += (Number(stance !== 'neutral' && !dead && (pose === 'ready' || pose === 'guard')) - stanceW) * ease; stanceClock += step;
        if (stanceW > .001) {   // ?look=stances: the stance's bones on top of the calm pose (stance-pose.ts); restored at the top of the next update
          const sp = stancePose(stance, stanceW, stanceClock), b = stanceBones;
          b.forEach((bone, i) => bone && stanceSaved[i].copy(bone.quaternion)); if (b[0]) stancePelvis.copy(b[0].position); stanceApplied = true;
          if (b[0]) { b[0].position.y -= sp.drop; b[0].position.x += sp.sway; }
          if (b[1]) b[1].rotation.x += sp.hip; if (b[2]) b[2].rotation.x += sp.hip; if (b[3]) b[3].rotation.x += sp.knee; if (b[4]) b[4].rotation.x += sp.knee;
          if (b[5]) { b[5].rotation.x += sp.spine1; b[5].rotation.z += sp.lean; } if (b[6]) b[6].rotation.x += sp.spine2; if (b[7]) b[7].rotation.x += sp.spine3;
          if (b[8]) b[8].rotation.x += sp.neck; if (b[9]) { b[9].rotation.x += sp.head; b[9].rotation.z += sp.headTilt; }
          if (b[10]) b[10].rotation.x += sp.arm; if (b[11]) b[11].rotation.x += sp.fore; if (b[12]) b[12].rotation.x += sp.offArm;
        }
        const shieldHeld = shieldArm && armed && !dead, guardUp = shieldHeld && (pose === 'guard' || pose === 'block' || pose === 'parry'), cutting = shieldHeld && (pose === 'attack' || pose === 'kick' || pose === 'deflected' || pose === 'roll');   // a deflect throws the arm open; a roll tucks it
        carry += (Number(shieldHeld) - carry) * ease; raise += (Number(guardUp) * gap.guard * (1 - GUARD_DROP * Math.max(tired.level, tired.gassed) * calmWeight) - raise) * ease; strike += (Number(cutting) - strike) * ease;
        if (carry < .001) carry = 0;
        carryShield(carry, raise, strike);
        spectralLife = spectral?.(step, dead, progress, pose === 'opened' || pose === 'hamstrung' || pose === 'execution', pose === 'hamstrung' ? HAMSTRUNG_BEATS.duration + .6 : pose === 'execution' ? EXECUTION_BEATS.duration / EXECUTION_BEATS.speed + .6 : 3.6) ?? 1;   // the ghost outlasts the whole scene, as it outlasts Opened's separation
        droppedWeapon?.apply(pose === 'hamstrung' ? (progress - HAMSTRUNG_BEATS.knee) * HAMSTRUNG_BEATS.duration : pose === 'execution' ? (progress - EXECUTION_BEATS.drop) * EXECUTION_BEATS.duration / EXECUTION_BEATS.speed : -1);   // seconds since the knee blow; negative keeps it in his hand
        root.rotation.z = pose === 'hit' ? Math.sin(Math.PI*Math.min(1,progress))*(attack === 'return' ? -.12 : .12) : recoil*.06;
        root.position.z = -Math.abs(recoil)*.045;
        // The enlarged Wraith lowers its attacking arm toward the original strike height.
        // Blend through wind-up/recovery; keep its body, grip and simulation untouched.
        if (spectral && weapon !== 'reaper' && upperArm?.parent && pose === 'attack') {
          root.updateWorldMatrix(true, true);
          const middle = blade.localToWorld(new Vector3(0, (segment[0] + segment[1]) / 2, 0));
          const target = root.worldToLocal(middle.clone()); target.y /= root.scale.y;
          root.localToWorld(target);
          const parent = upperArm.parent;
          const from = parent.worldToLocal(middle).sub(upperArm.position).normalize();
          const to = parent.worldToLocal(target).sub(upperArm.position).normalize();
          const amount = Math.max(0, Math.min(1, progress * 8, (1 - progress) * 6));
          aimedRotation = upperArm.quaternion.clone();
          upperArm.quaternion.premultiply(new Quaternion().slerp(new Quaternion().setFromUnitVectors(from, to), amount));
          root.updateWorldMatrix(true, true);
        }
        trail.visible = pose === 'attack' && progress > contact * .7 && progress < contact + .18;
        if (trail.visible && step > 0) {
          anchor.updateWorldMatrix(true, true);
          const override = combatRole && contactByClip?.[clips[combatRole].name], strike = override ? [override.from, override.to] : segment;
          samples.unshift(strike.map(y => anchor.worldToLocal(blade.localToWorld(new Vector3(0, y, 0)))));
          if (samples.length > 7) samples.pop();
          let offset = 0;
          for (let i = 1; i < samples.length; i++) for (const point of [samples[i-1][0],samples[i-1][1],samples[i][0],samples[i][0],samples[i-1][1],samples[i][1]]) { point.toArray(ribbonVertices, offset); offset += 3; }
          ribbon.setDrawRange(0, offset / 3); ribbon.attributes.position.needsUpdate = true;
        } else if (!trail.visible) samples.length = 0;
      },
      // Decapitation (owner 2026-09-18): bake the fighter's OWN head — face, hair, whatever helm he wears — out of the skinned
      // draws into a static prop at its current pose, and collapse the rig's Head bone so the corpse reads headless. Runs once
      // per kill; the caller re-parents the returned group to the world and owns the ballistics (and disposes it on rematch).
      sever() {
        if (severed) return null;
        const bone = root.getObjectByName('Head');
        if (!bone) return null;
        severed = true;
        root.updateWorldMatrix(true, true);
        root.updateMatrixWorld(true); // refresh SkinnedMesh bind inverses after actor movement before baking world vertices
        const group = new Group();
        root.traverse(object => {
          if (!(object instanceof SkinnedMesh) || !object.visible) return;   // only what he shows: a draw a loot piece or a rank look hid stays off the head too
          const headIndex = object.skeleton.bones.findIndex(b => b.name === 'Head');
          const geometry = object.geometry, position = geometry.getAttribute('position'), skinIndex = geometry.getAttribute('skinIndex'), skinWeight = geometry.getAttribute('skinWeight');
          if (headIndex < 0 || !position || !skinIndex || !skinWeight) return;
          object.skeleton.update();   // bake from THIS frame's pose, not last render's
          const boneMatrices = object.skeleton.boneMatrices;
          if (!boneMatrices) return;
          const index = geometry.getIndex();
          const sources = Object.entries(geometry.attributes).filter(([name]) => name !== 'skinIndex' && name !== 'skinWeight') as [string, BufferAttributeType][];
          const remap = new Map<number, number>(), baked: Record<string, number[]> = {}, kept: number[] = [];
          const v = new Vector3(), n = new Vector3(), nb = new Vector3(), nt = new Vector3(), m4 = new Matrix4(), nm = new Matrix3();
          const vertex = (i: number): number => {
            let at = remap.get(i);
            if (at !== undefined) return at;
            at = remap.size; remap.set(i, at);
            for (const [name, attr] of sources) {
              const dst = baked[name] ??= [];
              if (name === 'position') {
                object.applyBoneTransform(i, v.fromBufferAttribute(attr, i)); object.localToWorld(v);
                dst.push(v.x, v.y, v.z);
              } else if (name === 'normal') {
                n.set(0, 0, 0); nb.fromBufferAttribute(attr, i);
                for (let k = 0; k < 4; k++) {   // the vertex shader's influence mix, with per-influence normal matrices (non-uniform bone scales)
                  const w = skinWeight.getComponent(i, k);
                  if (w) { m4.fromArray(boneMatrices, skinIndex.getComponent(i, k) * 16).multiply(object.bindMatrix); n.addScaledVector(nt.copy(nb).applyMatrix3(nm.getNormalMatrix(m4)), w); }
                }
                n.normalize().transformDirection(object.bindMatrixInverse).transformDirection(object.matrixWorld);
                dst.push(n.x, n.y, n.z);
              } else for (let c = 0; c < attr.itemSize; c++) dst.push(attr.getComponent(i, c));
            }
            return at;
          };
          const triangles = (index ? index.count : position.count) / 3;
          for (let t = 0; t < triangles; t++) {
            let weight = 0;
            for (let k = 0; k < 3; k++) { const i = index ? index.getX(t * 3 + k) : t * 3 + k; for (let j = 0; j < 4; j++) if (skinIndex.getComponent(i, j) === headIndex) weight += skinWeight.getComponent(i, j); }
            if (weight / 3 < .5) continue;   // keep triangles the Head bone dominates: skull, scalp, helm — not the neck blend
            for (let k = 0; k < 3; k++) kept.push(vertex(index ? index.getX(t * 3 + k) : t * 3 + k));
          }
          if (!kept.length) return;
          const head = new BufferGeometry();
          for (const [name, attr] of sources) head.setAttribute(name, new BufferAttribute(new Float32Array(baked[name]), attr.itemSize));
          head.setIndex(kept);
          const prop = new Mesh(head, object.material);
          prop.castShadow = true; prop.frustumCulled = false;
          group.add(prop);
        });
        const box = new Box3().setFromObject(group), size = box.getSize(new Vector3()), center = box.getCenter(new Vector3());
        for (const prop of group.children) if (prop instanceof Mesh) prop.geometry.translate(-center.x, -center.y, -center.z);
        group.position.copy(center);
        bone.scale.setScalar(.0001);   // no clip tracks bone scale, so the collapse holds; the neck-blend smear hides under the sever burst
        return { group, radius: Math.max(.07, Math.min(.24, Math.max(size.x, size.z) * .38)) };
      },
      // A fresh match (rematch): the rig grows its head back; the caller has already disposed the world-parented prop.
      unsever() {
        opened?.dispose(); opened = undefined; root.visible = true;
        crown?.dispose(); crown = undefined;
        droppedWeapon?.dispose(); droppedWeapon = undefined;
        if (!severed) return;
        severed = false;
        root.getObjectByName('Head')?.scale.setScalar(1);
      },
      // The opened-waist bake snapshots what he wears; a re-dress at a new tier (a rematch after a rank-up) bakes it again, between fights.
      rebakeOpened() { if (!opened && !openedJob) return; opened?.dispose(); opened = undefined; openedJob = undefined; this.prepareOpened(); },
      // One step of a rank look's rebake (wearLook), in the bake pose and back within the call: its milliseconds and what it did, or null with none pending.
      stepOpened(): { ms: number; label: string } | null {
        if (!openedJob) return null;
        const start = performance.now(), step = this.inBakePose(() => openedJob!.next());
        if (step.done) { opened = step.value; opened.group.visible = false; openedJob = undefined; }
        return { ms: performance.now() - start, label: step.done ? 'floor table (last)' : step.value };
      },
      bakePending: () => !!openedJob,
      // The bake reads him in the split-crown pose at 4.5 %, at the origin, blade drawn; everything is put back before the call returns.
      inBakePose<T>(bake: () => T): T {
        const saved = roles.map(role => ({role, time:actions[role].time, weight:actions[role].getEffectiveWeight()}));
        const shown = [blade.visible,sheathed?.visible,root.visible], position = root.position.clone(), rotation = root.quaternion.clone();
        for (const role of roles) actions[role].setEffectiveWeight(Number(role === 'Death_SplitCrown'));
        actions.Death_SplitCrown.time = clips.Death_SplitCrown.duration * .045;
        mixer.update(0); root.visible = true; root.position.set(0,0,0); root.quaternion.identity();
        blade.visible = true; if (sheathed) sheathed.visible = false;
        try { return bake(); } finally {
          for (const state of saved) { actions[state.role].time = state.time; actions[state.role].setEffectiveWeight(state.weight); }
          mixer.update(0); root.position.copy(position); root.quaternion.copy(rotation);
          blade.visible = shown[0]!; if (sheathed) sheathed.visible = shown[1]!; root.visible = shown[2]!;
        }
      },
      // Bake during loading/reset, keeping the one-time mesh work outside the killing frame; a pending stepped rebake is finished here.
      prepareOpened() {
        if (opened) return;
        const job = openedJob ?? openWaistSteps(root, anchor); openedJob = undefined;
        opened = this.inBakePose(() => { for (;;) { const step = job.next(); if (step.done) return step.value; } });
        opened.group.visible = false;
      },
      // Give this actor a clip for an additive role its rig does not carry (the killer's Fin_Hamstrung): the clip gets its own one-shot action, like a rig's own.
      // `sourcePelvis`: the rest length of the pelvis bone the clip was authored on (warrior.glb's); a body reproportioned from the hero rig with a shorter or
      // longer pelvis (the Dwarf) gets the clip's pelvis path scaled by the ratio, so it sits on the floor instead of hovering or sinking. Omitted for the hero's own clip.
      // `fitFloor`: the clip's own beats (fractions) at which this body's real skin is measured against the floor, and the pelvis path lifted or lowered between them so
      // the kneel and the fall rest on the sand whatever the mesh (a body's feet, chest and face differ from the one the clip was authored on, which the pelvis ratio cannot see).
      adoptClip(role: (typeof ADDITIVE_ROLES)[number], clip: AnimationClip, sourcePelvis?: number, fitFloor?: readonly number[]) {
        if (clips[role]) return;
        const rest = asset.scene.getObjectByName('pelvis')?.position.length();
        if (sourcePelvis && rest && Math.abs(rest / sourcePelvis - 1) > 1e-4) {
          clip = clip.clone();
          for (const track of clip.tracks) if (track.name === 'pelvis.position') track.values = track.values.map(v => v * rest / sourcePelvis);
        }
        if (!clip.uuid) (clip as { uuid: string }).uuid = MathUtils.generateUUID();   // clip JSON ships without one (the build is byte-stable) and parse() leaves it undefined: the mixer keys its actions by uuid, so two adopted clips would be ONE action
        clips[role] = clip; roles.push(role);
        const action = actions[role] = mixer.clipAction(clip).play(); action.setEffectiveWeight(0); action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.paused = true;
        const track = fitFloor && clip.tracks.find(t => t.name === 'pelvis.position');
        if (track) {
          const point = new Vector3();   // every 4th skinned vertex of what is drawn: the floor to a centimetre at a quarter of the cost of the exact box
          const low = (progress: number) => sample(role, progress, () => {
            let min = Infinity;
            root.traverse(o => { if (o instanceof SkinnedMesh && o.visible) { o.skeleton.update(); for (let v = 0, n = o.geometry.getAttribute('position').count; v < n; v += 4) min = Math.min(min, o.getVertexPosition(v, point).applyMatrix4(o.matrixWorld).y); } });
            return min;
          });
          const marks = [...new Set([0, ...fitFloor!, 1])].sort((a, b) => a - b), start = low(0), lift = marks.map(m => (m ? start - low(m) : 0));
          const up = root.getObjectByName('pelvis')!.parent!.matrixWorld.elements, rise = Math.hypot(up[8], up[9], up[10]);   // the rig's up is the pelvis parent's local z (Blender's), scaled
          for (let i = 0; i < track.times.length; i++) {   // in place: the mixer's interpolant reads this very array
            const at = track.times[i] / clip.duration, next = marks.findIndex(m => m > at), k = next < 0 ? marks.length - 2 : Math.max(0, next - 1), f = Math.min(1, Math.max(0, (at - marks[k]) / (marks[k + 1] - marks[k])));
            track.values[i * 3 + 2] += (lift[k] + (lift[k + 1] - lift[k]) * f) / rise;
          }
        }
      },
      // Hamstrung (src/hamstrung.ts): the victim's weapon is cached at its release pose while he stands, so the knee blow costs no mesh work.
      prepareHamstrung() {
        if (droppedWeapon) return;
        droppedWeapon = sample('Death_Hamstrung', HAMSTRUNG_BEATS.knee, () => prepareWeaponDrop(root, anchor));
        anchor.add(droppedWeapon.group);
      },
      // Execution (src/execution.ts): the same cached weapon, released while he still stands (his pose at EXECUTION_BEATS.drop is the standing one, as at Hamstrung's knee).
      prepareExecution() {
        if (droppedWeapon) return;
        droppedWeapon = sample('Death_Execution', EXECUTION_BEATS.drop, () => prepareWeaponDrop(root, anchor));
        anchor.add(droppedWeapon.group);
      },
      // The victim's nape (his neck bone) at the cut, at the origin, for the killer's step (executionStep); the live pose is untouched.
      executionContacts() {
        return { nape: sample('Death_Execution', EXECUTION_BEATS.strike, () => root.getObjectByName('neck_01')!.getWorldPosition(new Vector3())) };
      },
      // Where the killer's anchor must stand, at `progress` of Fin_Execution, for the middle of the blade to meet `target`.
      executionStep(progress: number, target: Vector3) {
        return sample('Fin_Execution', progress, () => { this.aimBladeAt(target); return anchor.position.clone(); });
      },
      // The victim's knee and upper back at the two blows, at the origin, for the killer's steps (hamstrungStep); the live pose is untouched.
      hamstrungContacts() {
        return {
          knee: sample('Death_Hamstrung', HAMSTRUNG_BEATS.knee, () => root.getObjectByName('calf_r')!.getWorldPosition(new Vector3())),
          back: sample('Death_Hamstrung', HAMSTRUNG_BEATS.back, () => root.getObjectByName('spine_02')!.getWorldPosition(new Vector3())),
        };
      },
      // Where the killer's anchor must stand, at `progress` of Fin_Hamstrung, for the middle of the blade to meet `target`.
      hamstrungStep(progress: number, target: Vector3) {
        return sample('Fin_Hamstrung', progress, () => { this.aimBladeAt(target); return anchor.position.clone(); });
      },
      // Both the intact rig and the cached pieces follow the same presentation clock; modes can change mid-finish.
      openWaist(progress: number, mode: 'red' | 'dark' | 'off') {
        if (progress < .045) return;
        if (!opened && mode !== 'off') this.prepareOpened();
        if (!opened) return;
        if (mode !== 'off' && !opened.group.parent) anchor.add(opened.group);
        opened.group.visible = mode !== 'off'; root.visible = mode === 'off';
        opened.update(progress, mode === 'dark', spectralLife);
      },
      // Skull-only split, owner 2026-09-19. Reuse the proven head bake; keep the halves attached through the collapse.
      splitCrown(progress: number, mode: 'red' | 'dark' | 'off') {
        const bone = root.getObjectByName('Head');
        if (!bone || progress < .045) return;
        if (!crown && mode !== 'off') {
          root.updateWorldMatrix(true, true);
          root.updateMatrixWorld(true);   // SkinnedMesh refreshes bindMatrixInverse here, including before the first render
          const inverse = bone.matrixWorld.clone().invert(), head = this.sever();
          if (!head) return;
          const transform = inverse.multiply(new Matrix4().makeTranslation(head.group.position.x, head.group.position.y, head.group.position.z));
          for (const part of head.group.children) if (part instanceof Mesh) part.geometry.applyMatrix4(transform);
          head.group.position.set(0, 0, 0);
          crown = splitSkull(head.group);
          head.group.traverse(o => { if (o instanceof Mesh) o.geometry.dispose(); });
          bone.parent!.add(crown.group);
        }
        if (!crown) return;
        crown.group.position.copy(bone.position); crown.group.quaternion.copy(bone.quaternion);
        crown.group.visible = mode !== 'off'; bone.scale.setScalar(mode === 'off' ? 1 : .0001);
        const t = Math.min(1, (progress - .045) / .12);
        crown.open(t*t*(3 - 2*t), mode === 'dark');
      },
      // Apply after both rigs and their scene transforms update. Put the MIDDLE of the blade through the chest,
      // not the shoulder→tip ray. A grounded presentation step supplies reach without stretching bones or the weapon.
      aimBladeAt(target: Vector3, amount = 1, stepInto = true) {   // stepInto false: the caller has already placed the anchor (Hamstrung's own steps), only the arm turns
        const upper = upperArm;
        if (!upper?.parent || amount <= 0) return;
        root.updateWorldMatrix(true, true);
        const parent = upper.parent, shoulder = upper.getWorldPosition(new Vector3());
        const embedded = blade.localToWorld(new Vector3(0, (segment[0] + segment[1]) / 2, 0));
        const from = parent.worldToLocal(embedded).sub(upper.position);
        let to = parent.worldToLocal(target.clone()).sub(upper.position);
        if (stepInto) {
          const forward = target.clone().sub(shoulder).setY(0).normalize();
          const axis = parent.worldToLocal(shoulder.clone().add(forward)).sub(upper.position);
          // Solve |to - step * axis| = |from| in the shoulder's parent frame (rig bones have nonuniform scales).
          const a = axis.lengthSq(), b = to.dot(axis), discriminant = b*b - a*(to.lengthSq() - from.lengthSq());
          if (a < 1e-8 || discriminant < 0) return;
          const step = (b - Math.sqrt(discriminant)) / a;
          const position = anchor.getWorldPosition(new Vector3()).addScaledVector(forward, step * amount);
          anchor.position.copy(anchor.parent ? anchor.parent.worldToLocal(position) : position);
          root.updateWorldMatrix(true, true);
          to = parent.worldToLocal(target.clone()).sub(upper.position);
        }
        const turn = new Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
        aimedRotation = upper.quaternion.clone();
        upper.quaternion.premultiply(new Quaternion().slerp(turn, amount));
        root.updateWorldMatrix(true, true);
        // The hold is two-handed (owner 2026-09-21): the clip closes the off-hand on the hilt, but the aim above turns only the sword
        // arm, so the fist was left hanging in the air by the face. Re-solve the left arm onto the grip a hand's width behind the
        // sword hand, keeping the clip's own elbow bend (two-bone reach; no bone or weapon stretches).
        const [upperL, lowerL, handL] = offHand;
        if (!upperL?.parent || !lowerL || !handL || !swordHand || shieldArm) return;   // a shield arm keeps its carry: the off hand is not on the hilt
        const s = upperL.getWorldPosition(new Vector3()), e = lowerL.getWorldPosition(new Vector3()), h = handL.getWorldPosition(new Vector3());
        const pommelward = blade.localToWorld(new Vector3(0, -1, 0)).sub(blade.localToWorld(new Vector3())).normalize();
        const goal = swordHand.getWorldPosition(new Vector3()).addScaledVector(pommelward, .07);
        const a2 = s.distanceTo(e), b2 = e.distanceTo(h), dir = goal.clone().sub(s);
        const d = Math.max(.03, Math.min(dir.length(), a2 + b2 - .001)); dir.normalize();
        const along = (a2*a2 - b2*b2 + d*d) / (2*d), bend = e.clone().sub(s);
        bend.addScaledVector(dir, -bend.dot(dir)); if (bend.lengthSq() < 1e-6) return; bend.normalize();
        const elbow = s.clone().addScaledVector(dir, along).addScaledVector(bend, Math.sqrt(Math.max(0, a2*a2 - along*along)));
        aimedOffHand = [upperL.quaternion.clone(), lowerL.quaternion.clone()];
        for (const [bone, child, dest] of [[upperL, lowerL, elbow], [lowerL, handL, goal]] as const) {
          root.updateWorldMatrix(true, true);
          const origin = bone.getWorldPosition(new Vector3());
          const delta = new Quaternion().setFromUnitVectors(child.getWorldPosition(new Vector3()).sub(origin).normalize(), dest.clone().sub(origin).normalize());
          bone.quaternion.copy(bone.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(new Quaternion().slerp(delta, amount)).multiply(bone.getWorldQuaternion(new Quaternion())));
        }
        root.updateWorldMatrix(true, true);
      },
      // The world position of a named bone right now (the scene takes the victim's chest with it).
      boneWorld(name: string): Vector3 | null { const bone = root.getObjectByName(name); if (!bone) return null; root.updateWorldMatrix(true, true); return bone.getWorldPosition(new Vector3()); }
    };
  }
  return { player: create(false), opponent: create(true) };
}
