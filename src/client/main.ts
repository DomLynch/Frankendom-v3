// V3's driver: V1's duel (src/fight, lifted as it is) on V2's stage. It replaces V1's main.ts (1,765 lines) with the parts the one fight
// needs, in V1's own order: the career fight's start (match.ts begin), the fixed-step accumulator with the hit-stop hold, stepPractice on the
// quantized intent, the per-tick sound and HUD calls, the interpolated draw. No accounts, ladder, legends, loot, records, replays, PvP, coach
// or menus. Every number is a V1 row or a data/fight.json row; line refs are V1 src/main.ts @ 82a994d15.
import FIGHT from '../../data/fight.json' with { type: 'json' };
import BRAINS from '../../data/brains.json' with { type: 'json' };
import { brainFor, brainProfile } from '../brain.ts';
import DIFFICULTY from '../../data/difficulty.json' with { type: 'json' };
import PROFILES from '../../data/profiles.json' with { type: 'json' };
import { difficultyPick, profileFor, resolveFight, scaledOpponent, scaledPractice, type DifficultyFile } from '../difficulty.ts';
import { applyHeroClips } from '../hero-clips.ts';
import SOUND from '../../data/sound.json' with { type: 'json' };
import { initialPractice, stepPractice, type CombatEvent, type Practice } from '../fight/combat.ts';
import { OPPONENTS, RULES, opponentAt, profileAt, weaponOf, type SkillId, type WeaponId } from '../fight/moves.ts';
import type { Fighter } from '../fight/duel.ts';
import { quantizeIntent } from '../fight/record.ts';
import { recordSpecials } from '../fight/replay.ts';
import { RADIUS, initialState, wrapAngle, type State } from '../fight/sim.ts';
import { playScaleFor, setLateNotice, setPlayScale } from '../fight/play-radius.ts';
import { setStab } from '../fight/stab-rule.ts';
import { setStanceRows } from '../fight/stance-era.ts';
import { setSpecialPace, specialPaceFor } from '../fight/special-pace.ts';
import { setSpecialTerms, specialTermsFor } from '../fight/special-terms.ts';
import { setFoeSpecialReach, foeSpecialReachFor } from '../fight/foe-special-reach.ts';
import type { PickedStance } from '../fight/stance.ts';
import { createScene } from '../fight/scene.ts';
import { setLockFrame } from '../fight/camera.ts';
import { cameraZoom } from '../fight/camera-zoom.ts';
import { setGuardWalk } from '../fight/characters.ts';
import { setTrailOpacity } from '../fight/trail-opacity.ts';
import { heroSpecialFxFor, setHeroSpecialFx } from '../fight/hero-special-fx.ts';
import { setSpecialSink } from '../fight/special-sink.ts';
import { foeWeaponFor, setFoeWeapon } from '../fight/foe-weapon.ts';
import { foeDisplayName, foeNameFor, setFoeName } from '../fight/foe-name.ts';
import { fightOpponent } from '../fight/foe-pick.ts';
import { setBossBody } from '../fight/foe-body.ts';
import { foeSweepsFor } from '../fight/foe-reach.ts';
import { setBlend } from '../fight/anim-blend.ts';
import { createHud } from '../fight/hud.ts';
import { createInput } from '../fight/input.ts';
import { mountManaBar } from '../fight/mana-bar.ts';
import { createFeedback } from '../fight/sound/feedback.ts';
import { createKeep } from '../audio/keep.ts';
import { SPECIAL_CUE_OF } from '../fight/sound/special.ts';
import { bossSpecialFor, bossSpecialId } from '../fight/special-identity.ts';
import { classSpecialFor } from '../fight/class-special-identity.ts';
import { specialCueFor } from '../fight/sparring-special-runtime.ts';
import { PLAIN_DEATH, isTemplate } from '../fight/finisher-look.ts';
import { hamstrungPick, resolveHamstrung } from '../fight/hamstrung.ts';
import { executionPick, resolveExecution } from '../fight/execution.ts';
import { gfxOn } from '../fight/gfx-flag.ts';
import { ragdollFinisher } from '../fight/ragdoll.ts';
import { resolveFinisher, type OpponentId } from '../roster.ts';
import { stopFor } from '../hit-stop.ts';
import { lockPageZoom } from '../zoom-guard.ts';
import { autoStartOn, startAction } from '../auto-start.ts';
import { zoneLoopFor, roamStep } from '../fight/zone-loop.ts';
import { ATTACKERS, attackersOn, dropped, framingWiden, isStanding, joiners, validateFraming } from '../stubs.ts';
import { adopt, joinAttacker, stepAttackers, type Attacker } from '../fight/attacker-bout.ts';
import { OPENERS, WORLD, held, openerLeashLift, openerOn, openerReach, validateOpeners, idleOnes, inAggro, kill, leashed, nearestStanding, poseAt, spotsFor, tick, validateSpots, type Spawn } from '../stubs.ts';
import { zoneFor } from '../stubs.ts';
import type { DuelPose } from '../fight/duel.ts';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;   // :84
const search = location.search;
const canvas = element<HTMLCanvasElement>('world');
// V1's Pitborn in the Minotaur's body (data/fight.json opponent); ?pitborn=v1 = the Centurion's fight, on the same 106 body (src/fight/foe-pick.ts, the one read)
const opponentId = fightOpponent(FIGHT, search) as OpponentId, opponent = OPPONENTS[opponentId], level = FIGHT.level;
// The difficulty (data/difficulty.json over data/profiles.json, src/difficulty.ts): the fight config is { profile, difficulty row }; ?difficulty=1-10 picks the row
// (default row otherwise, a console warning for a bad value), ?difficulty=legacy the fight before this setting. Under ?pitborn=v1 (the Centurion, not this profile's opponent) it is off: V1's Centurion as before.
const resolved = resolveFight({ profile: FIGHT.profile, difficulty: difficultyPick(DIFFICULTY, search) }, PROFILES.profiles, DIFFICULTY as DifficultyFile, BRAINS.brains);
const difficultyOn = resolved.opponent === opponentId;
// :86 the opponent's swing parked in its chamber: the hold her rising charge cue climbs through
const foeHolding = (f: Fighter) => f.phase === 'attack' && f.charge > 0 && f.move !== null && f.age <= (weaponOf(f.weapon).moves[f.move].chamber ?? -1);

// :96 page zoom locked on the fight surface; double taps refused there only
lockPageZoom(document, { surface: '#world, #joystick, #actions', clickDriven: '#reset-button, #camera-button, #recenter-button' });
const feedback = createFeedback();
// Sound start (data/sound.json; V2 #65, #48): the context is made and the sprite decoded now, the first touch only resumes it and starts
// the silent clip for iOS's ringer switch. ?snd=v1: V1's start, context and decode on the first touch (:101).
const snd = new URLSearchParams(search).get('snd'), v1Sound = snd === 'v1', keep = createKeep(SOUND.keep);
if (!v1Sound) feedback.prepare();
// :101 WebKit grants audio on touchend/click/keydown, not touch-start: the whole family unlocks
for (const type of v1Sound ? ['pointerdown', 'touchend', 'click', 'keydown'] : ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'])
  window.addEventListener(type, v1Sound ? () => feedback.unlock() : () => { keep.play(); feedback.resume(); }, { passive: true });
const hud = createHud(element, /[?&]ring=v1\b/.test(search) ? null : FIGHT.readyRing);   // the SPECIAL buttons' ready ring (data/fight.json readyRing); ?ring=v1 = today's HUD exactly
mountManaBar();

// The fight (match.ts begin('career') :144-176 for a guest at level 1): the live era flags, then initialPractice on the career's picks.
let seed = FIGHT.seed, epoch = 0;
const nextSeed = (s: number): number => (Math.imul(s, 1664525) + 1013904223) >>> 0;   // match.ts:75
function fresh(pose?: DuelPose): Practice {
  setPlayScale(playScaleFor(opponentId, Infinity)); setLateNotice(true); setStab(true); setStanceRows(true);
  setSpecialPace(specialPaceFor(FIGHT.specialPace, search));   // V3: the Skull Crack ×0.75 (data/fight.json specialPace); ?skull=v1 = today's timing
  setSpecialTerms(specialTermsFor(FIGHT.specialTerms, search));   // V3: the hero's specials every 9 s, no stamina (data/fight.json specialTerms); ?spec=v1 = V1's cooldowns and stamina
  setFoeSpecialReach(foeSpecialReachFor(FIGHT.foeSpecialReach, search));   // V3: an opponent's melee special starts inside 2.2 m and fizzles past 2.6 m (data/fight.json foeSpecialReach); ?special=v1 = V1's 3.0 m, no release check
  epoch++;
  return make(seed, pose);
}
/** A whole fight on seed `s` (the hero and one boss, the difficulty rows' health and damage scales on the boss): `fresh`'s build without its side effects, which the zone's extra attackers reuse. */
function make(s: number, pose?: DuelPose): Practice {
  const body = opponentAt(opponent, level);
  const made = initialPractice(s, difficultyOn ? scaledOpponent(body, resolved) : body, FIGHT.weapon as WeaponId, FIGHT.skill as SkillId,
    recordSpecials({ specials: FIGHT.specials, level, opponent: opponentId }), undefined, FIGHT.stance as PickedStance,
    pose, undefined, undefined, undefined, undefined, FIGHT.skill2 as SkillId);   // pose: a respawn stands the hero where he is (zone-loop.ts respawnPose); absent = the pit's marks
  return difficultyOn ? scaledPractice(made, resolved) : made;
}
let practice = fresh(), frameEvents: CombatEvent[] = [];
// the warden's brain: data/fight.json `ai` (a data/brains.json row) over his V1 profile at his level; ?ai=v1 = V1's profile untouched
// (the difficulty row's knobs over it, src/difficulty.ts; ?ai=v1 = V1's profile untouched; off under ?pitborn=v1)
const aiProfile = difficultyOn ? profileFor(profileAt(opponent, level), resolved, new URLSearchParams(search).get('ai') === 'v1')
  : brainProfile(profileAt(opponent, level), brainFor(BRAINS.brains, FIGHT.ai, search));
const identity = () => ({ opponent: opponentId, level });   // match.ts specialIdentity, no presets

// :530 the render pair and the accumulator; the camera stays locked (V1's default)
let state = practice.fighter, previous = state, accumulator = 0, hitStop = 0;
const locked = true;
let assetsReady = false, graphicsLost = false;
const step = () => 1 / FIGHT.tempoHz;
const paused = () => !assetsReady || graphicsLost || document.hidden;   // :823 without the welcome card, journal and versus card

// The lock camera: V2's lower, over-the-shoulder framing (data/fight.json camera); ?cam=v1 keeps V1's lock exactly.
if (!/[?&]cam=v1\b/.test(search)) setLockFrame(FIGHT.camera.lift, FIGHT.camera.side);
// Legs keep walking under a held guard (data/fight.json guardWalk); ?guard=v1 keeps V1's whole-body Guard. Set before the rigs are built.
setGuardWalk(/[?&]guard=v1\b/.test(search) ? null : FIGHT.guardWalk.lowerBones);
// The swing trail softer (data/fight.json trail: cuts at half, the stab 30% less, both fighters); ?trail=v1 = today's trail.
setTrailOpacity(/[?&]trail=v1\b/.test(search) ? null : FIGHT.trail);
// The hero's Skull Crack and Whirlwind throw a lighter contact kit (data/fight.json specialFx: camera kick, flash, sparks, the Whirlwind's trail, sound gains; hit-stop untouched); ?fx=v1 = today's.
setHeroSpecialFx(heroSpecialFxFor(FIGHT.specialFx, search));
// A landed special no longer sinks the struck body into the sand (data/fight.json specialSink, Dom); ?dip=v1 = V1's knee-dip drop.
setSpecialSink(/[?&]dip=v1\b/.test(search) || FIGHT.specialSink.sink);
// ?pitborn=v1: the Minotaur draws V1's Cleaver over the Centurion's gladius (data/fight.json foeWeapon, keyed to him, visual only; a no-op for the
// Pitborn, who fights with his own cleaver); ?foeweapon=v1 = the gladius.
setFoeWeapon(foeWeaponFor(FIGHT.foeWeapon, search));
// The HUD names the Minotaur body the Minotaur whoever fights in it (data/fight.json foeName, display only).
setFoeName(foeNameFor(FIGHT.foeName, search, opponentId));
setBossBody(search);   // [boss-body row] ?boss=<body>: draw the boss in another data/rig.json body (data/profiles.json bodyQuery); must run before the sweeps, scene and ragdoll below read the body
// Clip-to-clip blends in milliseconds (data/fight.json blendMs/settleMs, V2's rows: swings, hits and rolls ease in and out, the roll settles); ?blend=v1 = V1's transitions exactly.
if (/[?&]blend=v1\b/.test(search)) setBlend(null); else setBlend(FIGHT.blendMs, FIGHT.settleMs);
// Dom's picked strike clips on V1's blade sweeps (data/hero-clips.json); ?reach=clip = the sweeps re-baked from the clips; ?clips=v1 = V1's clips and sweeps exactly.
// The Pitborn's cleaver sweeps where the Minotaur draws it (data/fight.json foeReach, src/fight/foe-reach.ts); ?reach=v1 = V1's cleaver sweeps.
applyHeroClips(search, foeSweepsFor(FIGHT.foeReach, search, opponentId));
// The fight starts by itself (data/fight.json start, src/auto-start.ts): no Fight press, the driver draws for him on the first running
// tick, at load and after every Rematch. ?start=v1 keeps V1's Fight button (the first press draws).
const autoStart = autoStartOn(search, FIGHT.start.auto);

// :1278 the scene: V1's rigs, camera, effects and finishers; the arena slot holds V2's stage (src/arena-stage.ts via stubs.ts)
const gfxPost = gfxOn(search, FIGHT.gfx) ? () => import('../fight/gfx-lift.ts') : undefined;
const view = createScene(
  canvas,
  (status, kind) => {
    element('art-status').textContent = status;
    assetsReady = kind === 'ready';
    if (kind === 'ready') view.startStandoff();
  },
  opponentId, undefined, FIGHT.weapon as WeaponId, () => {}, level, gfxPost,
);
view.setZoom(cameraZoom(FIGHT.camera.zoom, search));   // the lens zoom (data/fight.json camera.zoom 1.1); ?zoom=1 = the camera as it was
view.setTier('Recruit'); view.setPlayerTier('Recruit');   // :1309 tierAt(0 marks): a guest's rung, and the Centurion met at it

const controls = createInput({   // :832
  element, window, paused,
  now: () => performance.now(),
  matchMedia: (query) => matchMedia(query),
  innerWidth: () => innerWidth,
  ready: () => assetsReady,
  practice: () => practice,
  quiet: () => feedback.quiet(),
});
function clearInput() { controls.clear(); hitStop = 0; accumulator = 0; }   // :713
window.addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', clearInput);
// Back on the page (app switch, a call, the lock screen): clearInput hushed the sound and the context is suspended or interrupted; ask
// again now (iOS grants it as soon as it allows) instead of waiting for the next touch. After clearInput, so it is not undone.
if (!v1Sound) {
  const rewake = () => { if (!document.hidden) feedback.unlock(); };
  window.addEventListener('pageshow', rewake); window.addEventListener('focus', rewake); document.addEventListener('visibilitychange', rewake);
}
document.addEventListener('pointerdown', () => { if (practice.finish && view.finishPhase().touring) view.stopTour(); });   // :1422

function nameOpponent() {   // :397 without the legend
  const label = element('opponent-name'), name = foeDisplayName(opponentId);
  label.textContent = `THE ${name.toUpperCase()}`; label.dataset.mobile = name;
}
// :892 nextFight → match.rematch → began: the same warden, the next seed
// The zone loop (data/zones/zone1.row.json via zoneFor, data/respawn.json, src/fight/zone-loop.ts; Dom 2026-10-27: a live real-time zone, not an instant duel). The duel sim stops at the kill
// as it always did (stepDuel returns early once a fighter has no health), so a hero who won keeps walking on a presentation-only body (`roam`, the
// sim's own advance), the corpse lies where it fell, and the spawn stands a fresh opponent `respawnSeconds` after the kill, where the hero stands (the dead body is left beside him).
// A hero who dies falls for `heroDeath.fallSeconds`, lies "You died" until the zone row's `respawn.downSeconds`, then stands at the pit's mark at full health. No Rematch in the zone.
// Several bosses (live-zone phase 1b, src/zone/spawns.ts, data/respawn.json world): the zone row's spawns each stand at their own spot with their own timers. The sim is still ONE duel, so it holds
// the spawn the hero is nearest to (`current`, the live rig); the others stand as frozen copies at their spots (view.idleFoes); the fight starts when the hero walks into the held one's aggro
// (`engaged`, which gates the auto-draw); a hero beyond its leash resets it; a kill starts only that spawn's timer; walking into another standing spawn's aggro hands the sim to it.
// ?postkill=v1 (ZONE null) = the frozen end screen with Rematch.
const ZONE = zoneLoopFor(zoneFor(search), search, Object.keys(OPPONENTS));
view.heroFall(ZONE ? ZONE.fallSeconds : 0);   // the hero's death fall (data/respawn.json heroDeath.fallSeconds; 0 = ?postkill=v1, the frozen end screen as before)
let roam: State | null = null, sinceDeath = 0;
const heroStands = () => !!ZONE && !!practice.finish && !practice.finish.draw && practice.finish.victim === 1 && practice.playerHealth > 0;
const heroDied = () => !!ZONE && !!practice.finish && practice.playerHealth === 0;
const SPOTS = ZONE ? spotsFor(zoneFor(search)) : [];
if (ZONE) validateSpots(SPOTS, initialState(), RADIUS, WORLD, ZONE.spawn.kind);
if (ZONE) validateOpeners(OPENERS, SPOTS);
let openerIdle = 0, openerLift = 0, openerSpent = !ZONE || !openerOn(search);   // the opener (data/respawn.json openers): idle seconds since the page was ready with nobody engaged; spent for the visit once anyone is engaged, killed or dead
let spawns: Spawn[] = SPOTS.map((s) => ({ ...s, deadFor: null })), current = 0, engaged = false, killMarked = false;
// Real-time aggro (data/respawn.json attackers, src/zone/attackers.ts, src/fight/attacker-bout.ts): while the hero fights the held boss, every other standing spawn whose aggro he enters fights him too, in its own duel on his one health pool.
// `attackers` holds them (a killed one stays, lying, until its own timer stands it again); `killedBy` is the attacker whose blow killed the hero (that boss starts again at full health). ?aggro=v1 / row off / ?postkill=v1: none, the others are frozen copies.
const multi = !!ZONE && attackersOn(search);
let attackers: Attacker[] = [], killedBy: number | null = null, widen = 1;   // widen: the lock camera's back-off for the attackers on him (framingWiden, eased); exactly 1 while only one boss is live
if (multi) validateFraming();
const heroStart = initialState();   // where the hero stands at a first load and after a death: the pit's mark
/** The duel pose of spawn `index` against a hero at `at`: stepped back from its spot when he stands on it (zone-loop.ts respawnPose). */
const poseFor = (index: number, at: { x: number; z: number }): DuelPose => poseAt(at, spawns[index]!, RADIUS, ZONE!.minDistance, heroStart);
if (ZONE) { current = nearestStanding(spawns, heroStart); practice = fresh(poseFor(current, heroStart)); state = previous = practice.fighter; }   // the page opens on the hero at the mark and the bosses at their spots
function rematch(pose?: DuelPose, index = current, restart = true) {
  if (ZONE) view.respawnFoe();   // first: the dead body is left standing before his sim body is reset (scene.ts, ragdoll.leaveCorpse)
  seed = nextSeed(seed); practice = fresh(pose); frameEvents = []; openerLift = 0;   // every reset (hand-over, leash reset, respawn) clears the opener's leash lift; the next frame sets it again for the opener's own fight
  roam = null; sinceDeath = 0; current = index; engaged = false; killMarked = false;
  attackers = attackers.filter((a) => a.dead); killedBy = null;   // every live attacker lets go and stands again at full health at its spot; a killed one keeps lying until its own timer is up
  clearInput(); state = previous = practice.fighter;
  if (restart) view.restartStandoff();
  updateHud();
}
/** The sim hands over to spawn `index` with the hero where he stands (no draw-in replayed: both rigs already stand armed). */
const hand = (index: number, at: { x: number; z: number }) => rematch(poseFor(index, at), index, false);
/** The opening pose of attacker `index`: its boss at its own spot, the hero where he stands (he is never moved: the sim reads his real body every tick). */
const poseOfAttacker = (index: number, at: { x: number; z: number }): DuelPose => ({ hero: { x: at.x, z: at.z }, foe: { x: spawns[index]!.x, z: spawns[index]!.z }, heroFacing: Math.atan2(spawns[index]!.x - at.x, spawns[index]!.z - at.z) });
/** The kill's ceremony is over and another boss is on him: that boss's fight becomes the sim's fight, the hero's health as it is now (the first boss's corpse is left lying, as at every hand-over). */
function adoptAttacker(a: Attacker, at: { x: number; z: number; heading: number }) {
  view.respawnFoe();
  const mine = practice.duel.fighters[0], hero: Fighter = { ...mine, body: { ...mine.body, x: at.x, z: at.z, heading: at.heading } };
  epoch++; seed = nextSeed(seed); practice = adopt(a, hero); frameEvents = []; openerLift = 0;
  roam = null; sinceDeath = 0; current = a.index; engaged = true; killMarked = false; killedBy = null;
  attackers = attackers.filter((x) => x !== a);
  clearInput(); state = previous = practice.fighter;
  updateHud();
}
/** One frame of the zone's rules: every spawn's own timer runs; a kill, an aggro, a leash or a respawn moves the sim between spawns. */
function zoneStep(dt: number) {
  const hero = state, timers = tick(spawns, dt);
  spawns = timers.spawns;
  if (multi) {   // a killed attacker lies until its own timer stands it again; the moment it dies its own timer starts (nobody else's moves)
    attackers = attackers.filter((a) => !(a.dead && timers.due.includes(a.index)));
    for (const a of attackers) if (a.dead && isStanding(spawns[a.index]!)) spawns = kill(spawns, a.index);
  }
  if (practice.finish) { openerSpent = true; openerLift = 0; }   // opener: a kill or a death spends it (no re-arm)
  if (heroStands() && !killMarked) { killMarked = true; engaged = false; spawns = kill(spawns, current); }   // this spawn's timer starts; nobody else's moves
  if (heroStands()) {   // walking on: a standing spawn he walks up to takes the sim; the held one's own timer coming due stands it (or the nearest) again
    const live = attackers.find((a) => !a.dead), phase = view.finishPhase();
    if (live) { if (roam || phase.complete || phase.age >= ZONE!.startAfterSeconds) adoptAttacker(live, hero); }   // another boss is already on him: once the kill's ceremony lets go, that fight goes on as THE fight (its health, its place), not a fresh boss
    else {
      const near = inAggro(spawns, hero), next = near >= 0 ? near : timers.due.includes(current) ? nearestStanding(spawns, hero) : -1;
      if (next >= 0) hand(next, hero);
    }
  } else if (heroDied()) {
    if ((sinceDeath += dt) >= ZONE!.diedSeconds) { const who = killedBy ?? current; rematch(poseFor(who, heroStart), who); }   // "You died" for diedSeconds, then the pit's mark at full health; the boss that killed him starts again at full health, the rest untouched
  } else if (!practice.finish) {
    if (engaged) openerSpent = true;   // opener: any engagement spends it
    if (!openerSpent && assetsReady) openerIdle += dt;   // the newcomer's idle clock; its due spawn's aggro reaches him (spawns.ts openerReach)
    const near = inAggro(openerSpent ? spawns : openerReach(spawns, OPENERS, openerIdle, hero), hero);
    if (near >= 0 && !openerSpent && openerIdle >= OPENERS.delaySeconds) openerLift = openerLeashLift(spawns[near]);   // the opener's fight keeps its leash lifted by the same reach (the newcomer stands beyond the plain leash)
    if (engaged) {
      if (leashed(spawns[current]!, hero, openerLift)) hand(current, hero);   // beyond the leash he resets at his spot at full health
      else if (multi) {   // real-time aggro: any other standing boss whose aggro he is inside attacks him now, whatever he is fighting; one beyond its own leash lets go
        const alive = () => attackers.filter((a) => !a.dead).map((a) => a.index);
        const gone = dropped(spawns, alive(), hero);
        attackers = attackers.filter((a) => !gone.includes(a.index));
        for (const i of joiners(spawns, current, alive(), hero)) attackers.push(joinAttacker(i, make(nextSeed((seed ^ (i + 1)) >>> 0), poseOfAttacker(i, hero))));
      }
    }
    else if (near >= 0) { if (near === current) engaged = true; else hand(near, hero); }   // walked into aggro: this one fights
    else { const at = held(spawns, current, hero, WORLD.retargetMargin); if (at >= 0 && at !== current) hand(at, hero); }   // nobody engaged: the sim holds the nearest
  }
}
// The zone's stills and the cost table read this (scripts/zone-stills.mjs)
function zoneDebug() { (globalThis as { __v3Zone?: unknown }).__v3Zone = { current, engaged, heroHealth: practice.playerHealth, foeHealth: practice.health, attackers: attackers.map((a) => ({ id: spawns[a.index]!.id, health: a.practice.health, dead: a.dead, phase: a.practice.duel.fighters[1].phase, x: +a.practice.enemy.x.toFixed(2), z: +a.practice.enemy.z.toFixed(2) })), live: view.liveFoeCount, openerIdle: +openerIdle.toFixed(2), openerSpent, spawns: spawns.map((s) => ({ id: s.id, x: s.x, z: s.z, deadFor: s.deadFor })), copies: view.idleFoeCount, calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles }; }
element('reset-button').addEventListener('click', () => rematch());

function updateHud() {   // :684, the career fight's view
  hud.update(practice, { controlsReady: assetsReady && !graphicsLost, debug: false, opponentId, practiceOnly: false, autoStart, zone: heroStands() || heroDied() });
  const phase = practice.finish ? view.finishPhase() : null, hushed = !phase?.settled, walking = roam !== null;   // a walking hero keeps the whole HUD (Respawn included) up
  document.documentElement.classList.toggle('endgame-fade', !!phase && !walking && (hushed || phase.touring));
  document.documentElement.classList.toggle('endgame-hush', !!phase && !walking && hushed);
}

// :1490 the opponent's special cue is decoded ahead of his first cast
function syncSpecialAudio() {
  if (!FIGHT.specials) return;
  const id = bossSpecialFor(opponentId, level) ?? classSpecialFor(opponentId, level), cue = id ? SPECIAL_CUE_OF[id] : undefined;
  if (cue) feedback.want(cue);
}
const specialAudioCasts = [-1, -1];

// :1498 one frame
let last = performance.now();
function frame(now: number) {
  syncSpecialAudio();
  if (view.renderer.getContext().isContextLost()) { graphicsLost = true; requestAnimationFrame(frame); return; }
  graphicsLost = false;
  const raw = (now - last) / 1000, elapsed = raw >= 0 && raw < 60 ? raw : 0;   // :1508 a clock jump is a resync, not fight time
  last = now;
  const dt = Math.min(elapsed, FIGHT.frameDtMaxS);
  if (!paused()) {
    if (ZONE) zoneStep(dt);   // every spawn's own timer; a kill, an aggro, a leash, a respawn or the hero's death moves the sim between spawns; the dead body is left lying (view.respawnFoe)
    controls.promoteDodge(now);
    // :1517 the pause spends the frame's time first; what is left after it goes on to the simulation
    if (hitStop > 0) {
      const spent = Math.min(hitStop, elapsed * 1000);
      hitStop -= spent;
      if (!hitStop) accumulator += Math.max(0, dt - spent / 1000);
    } else accumulator += dt;
    while (accumulator >= step()) {
      previous = state;
      const intent = controls.intent();
      // :1526 match.step: the live intent, quantized as the recorder stores it, stepped against the warden's profile at his level
      // the fight starts by itself: a sheathed hero with no press of his own steps with V1's draw press (src/auto-start.ts)
      const duelIntent = quantizeIntent({ move: { x: intent.x, z: intent.z, yaw: view.yaw, run: intent.run }, action: startAction(autoStart && (!ZONE || engaged), practice, intent.action), guard: intent.guard,
        guardDirection: intent.guardDirection ?? undefined, held: intent.held, lock: locked, cancel: intent.cancel });
      const prior = practice;
      practice = stepPractice(prior, duelIntent, aiProfile);
      if (attackers.length) {   // real-time aggro: each live attacker steps its own duel from the hero as he stood, the same intent; their damage lands on his one pool (src/fight/attacker-bout.ts)
        const stepped = stepAttackers(prior, practice, duelIntent, attackers, aiProfile);
        practice = stepped.practice; attackers = stepped.list; if (stepped.killer !== null) killedBy = stepped.killer;
      }
      frameEvents.push(...practice.events);
      // :1552 the death's sound follows the renderer's own finisher pick
      const weapons = [practice.duel.fighters[0].weapon, practice.duel.fighters[1].weapon] as const;
      const pick = executionPick(hamstrungPick(ragdollFinisher(practice.events), view.hamstrungInstalled()), view.executionInstalled());   // ?ragdoll=always: the plain death's cue, as the picture (ragdoll.ts)
      const deathAudio = practice.finish && practice.events.some((e) => e.type === 'Killed')
        ? { finish: practice.finish, weapons, gore: true, override: resolveExecution(opponentId, practice.finish, weapons, pick, view.previousFinisher(),
          resolveHamstrung(opponentId, practice.finish, weapons, pick, view.previousFinisher(), resolveFinisher(opponentId, practice.finish, weapons, isTemplate(pick, 'execute') ? null : pick, view.previousFinisher()))) ?? PLAIN_DEATH }
        : undefined;
      if (FIGHT.specials) for (const e of practice.events) {   // :1585 one cue per accepted cast, cut on a fizzle
        if (e.type === 'SpecialStarted' && e.tick > specialAudioCasts[e.actor]) {
          specialAudioCasts[e.actor] = e.tick;
          const cue = specialCueFor(e.name ? bossSpecialId(e.name) : e.actor === 1 ? classSpecialFor(opponentId, level) : null);
          if (cue) feedback.special(cue, 1, e.actor);
        } else if (e.type === 'SpecialFizzled' || e.type === 'SpecialInterrupted') feedback.cutSpecial(e.actor);
      }
      feedback.update(practice.events, deathAudio, {
        match: seed, ended: !!practice.finish, tick: practice.duel.tick, drawing: practice.duel.fighters[0].phase === 'draw',
        holding: foeHolding(practice.duel.fighters[1]), fatigue: practice.fatigue, opponent: opponentId,
        loiter: Math.max(practice.duel.fighters[0].loiter, practice.duel.fighters[1].loiter) / RULES.wall.loiter.ticks,
      }, practice.clarity);
      hud.refused(practice.clarity);
      hud.floatDamage(practice.events, practice.duel.fighters, view.project, true);   // :640 damage numbers on by default
      hud.floatSpell(practice.events, practice.duel.fighters, view.project);
      controls.consumed(practice.events);
      state = practice.fighter;
      if (heroStands()) {   // the zone loop: the sim is over, the hero walks (presentation only) once the kill's ceremony lets him go
        const phase = view.finishPhase();
        if (!roam && (intent.x || intent.z) && (phase.complete || phase.age >= ZONE!.startAfterSeconds)) roam = { ...practice.fighter };
        if (roam) state = roam = roamStep(roam, { x: intent.x, z: intent.z, yaw: view.yaw, run: intent.run }, practice.enemy, RADIUS);
      }
      accumulator -= step();
      // :1656 freeze on the contact tick: the frame ends here, the leftover time is dropped, the frozen frames show the contact tick's bodies
      const stop = stopFor(practice.events);
      if (stop) { hitStop = stop; accumulator = 0; previous = state; }
    }
  } else { accumulator = 0; previous = state; }
  (globalThis as { __v3Roam?: State | null }).__v3Roam = roam;   // the stills read the hero's walk after the kill (scripts/roam-stills.mjs)
  (globalThis as { __v3Fight?: Practice }).__v3Fight = practice;   // the stills read the sim's state here (scripts/foe-stills.mjs), as they read __weaponShapes
  const alpha = accumulator / step();
  if (multi) {   // every live attacker stays in frame: the lock backs off by framingWiden, eased; the dead lie where they fell and no longer count; with none it snaps back to exactly 1
    const aim = framingWiden({ x: (state.x + practice.enemy.x) / 2, z: (state.z + practice.enemy.z) / 2 }, attackers.filter((a) => !a.dead).map((a) => a.practice.enemy), ATTACKERS.camera, cameraZoom(FIGHT.camera.zoom, search)), rows = ATTACKERS.camera;
    widen += (aim - widen) * (1 - Math.exp(-dt / rows.easeSeconds));
    if (aim === 1 && widen - 1 < 1 / 1000) widen = 1;
    view.setWiden(widen);
  }
  if (ZONE) { view.liveFoes(attackers.map((a) => ({ id: spawns[a.index]!.id, practice: a.practice }))); }   // the attackers' rigs (a killed one lies until its timer is up)
  if (ZONE) { view.idleFoes(idleOnes(spawns, current).filter((s) => !attackers.some((a) => spawns[a.index] === s)).map((s) => ({ x: s.x, z: s.z, heading: Math.atan2(state.x - s.x, state.z - s.z) }))); zoneDebug(); }   // the other standing bosses, facing the hero
  view.render(
    { ...state, x: previous.x + (state.x - previous.x) * alpha, z: previous.z + (state.z - previous.z) * alpha, heading: previous.heading + wrapAngle(state.heading - previous.heading) * alpha },
    locked, paused() ? 0 : dt, practice, frameEvents, hitStop > 0, epoch, identity(), roam !== null,
  );
  frameEvents = [];
  updateHud();
  requestAnimationFrame(frame);
}
nameOpponent();
updateHud();
let buildLabel = '';
fetch('./build.txt?v=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).then((t) => { buildLabel = t.slice(0, 7); element('build').textContent = buildLabel; }).catch(() => {});
// ?snd=1: the audio state beside the build label, e.g. "f297c4e running+sprite+keep 12" (context, sprite decoded, silent clip, cues played)
if (snd === '1') setInterval(() => { element('build').textContent = `${buildLabel} ${feedback.state()}${keep.playing() ? '+keep' : ''}`; }, SOUND.statusMs);
// Other players (data/presence.json, src/presence/chunk.ts): OFF unless the link has ?presence=1 or ?presence=ws(s)://... Then the client chunk (its own file, nothing in this bundle) joins the presence
// service; the handle is on window.__v3Presence for the scene wiring step and the browser checks (remotes(), on(), self(), state()). Others have no collider and play no part in the fight.
// Shared boss health (data/zone-client.json, src/zone/shared-hp-chunk.ts, docs/ZONE-CLIENT-CONTRACT.md): OFF unless the link has ?sharedhp=1 or ?sharedhp=http(s)://... Then the chunk (its own file, nothing in this bundle) makes the handle on
// window.__v3SharedHp. INERT in this step: nothing feeds it sim events and nothing draws its bar; the sim's own health stays the truth of the fight (the wiring PR connects it).
if (/[?&]sharedhp=/.test(search)) void import('../zone/shared-hp-chunk.ts').then((m) => { (window as unknown as { __v3SharedHp?: unknown }).__v3SharedHp = m.startSharedHp({ search, location }); }).catch(() => {});
if (/[?&]presence=/.test(search)) void import('../presence/chunk.ts').then((m) => { (window as unknown as { __v3Presence?: unknown }).__v3Presence = m.startZonePresence({ search, location, hero: () => state, spawn: () => view.spawnRemote() }); }).catch(() => {});   // startZonePresence also installs globalThis.__v3HeroPose and draws the others (src/presence/draw.ts)
requestAnimationFrame(frame);
