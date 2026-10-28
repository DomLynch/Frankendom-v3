// V3's driver: V1's duel (src/fight, lifted as it is) on V2's stage. It replaces V1's main.ts (1,765 lines) with the parts the one fight
// needs, in V1's own order: the career fight's start (match.ts begin), the fixed-step accumulator with the hit-stop hold, stepPractice on the
// quantized intent, the per-tick sound and HUD calls, the interpolated draw. No accounts, ladder, legends, loot, records, replays, PvP, coach
// or menus. Every number is a V1 row or a data/fight.json row; line refs are V1 src/main.ts @ 82a994d15.
import FIGHT from '../../data/fight.json' with { type: 'json' };
import BRAINS from '../../data/brains.json' with { type: 'json' };
import FEEL_SIM from '../../data/feel-sim.json' with { type: 'json' };
import FEEL_DEFAULTS from '../../data/feel-defaults.json' with { type: 'json' };
import { knockSimFor, setKnockSim, type KnockRows } from '../fight/knock-sim.ts';
import type { BrainRow } from '../brain.ts';
import { kindIds, kindPractice, kindTable, type KindCtx, type KindFight } from '../fight/spawn-kind.ts';   // a zone spawn's kind: its own opponent, stats, specials and brain
import DIFFICULTY from '../../data/difficulty.json' with { type: 'json' };
import PROFILES from '../../data/profiles.json' with { type: 'json' };
import TUNE from '../../data/tune.json' with { type: 'json' };
import { tuneFrom, type TuneFile } from '../tune.ts';
import { difficultyPick, type DifficultyFile, type ProfileRow } from '../difficulty.ts';
import { applyFoeSweeps, applyHeroClips } from '../hero-clips.ts';
import SOUND from '../../data/sound.json' with { type: 'json' };
import { project, stepPractice, type CombatEvent, type Practice } from '../fight/combat.ts';
import { RULES, weaponOf, isWeaponId, type AiProfile, type Opponent, type SkillId, type WeaponId } from '../fight/moves.ts';
import type { Fighter } from '../fight/duel.ts';
import { quantizeIntent } from '../fight/record.ts';
import { RADIUS, initialState, wrapAngle, type State } from '../fight/sim.ts';
import { OPEN_RADIUS, playScaleFor, setLateNotice, setPlayScale } from '../fight/play-radius.ts';
import { setStab } from '../fight/stab-rule.ts';
import { setStanceRows } from '../fight/stance-era.ts';
import { setSpecialPace, specialPaceFor } from '../fight/special-pace.ts';
import { setSpecialTerms, specialTermsFor } from '../fight/special-terms.ts';
import { setFoeSpecialReach, foeSpecialReachFor } from '../fight/foe-special-reach.ts';
import type { PickedStance } from '../fight/stance.ts';
import { startTelemetry } from '../telemetry.ts';
import { mountShareClip } from '../share-clip.ts';
import { setErrorSink } from '../stubs.ts';
import { createScene, CARRIED_WEAPONS } from '../fight/scene.ts';
import PROGRESSION from '../../data/progression.json' with { type: 'json' };
import STARS from '../../data/stars.json' with { type: 'json' };
import { rollStar, starMark, trophyText, validateStars, levelOf as starLevel, type StarsFile } from '../stars.ts';
import { addTrophy, escalation, heroWeapon, loadSave, mergeTune, progressionOn, recordKill, storageOf, unlockText, validateProgression, writeSave, type BossRow, type ProgressionFile } from '../progression.ts';
import { mountUnlockLine } from '../fight/unlock-line.ts';
import { mountParts } from '../fight/parts-hook.ts';
import { mountCommentator } from '../commentator.ts';   // the arena commentator (data/commentator.json): text lines on events, presentation only
import { setArenaClamp, setCameraPitch, setFreeCamera, setLockFrame, setWalkClamp } from '../fight/camera.ts';
import { freeCameraFor, handsOver, lookStarts, wantsFreeCamera } from '../fight/free-camera.ts';import { dropsInput, keepsInput } from '../fight/hand-over-input.ts';
import { createLook, lookFor } from '../fight/look-drag.ts';
import { freshLock, lockBreakFor, stepLock, toggleLock } from '../fight/lock-break.ts';
import { kbmFor, mountKbm } from '../fight/kbm.ts';
import { isTap, lockSwitchFor, pickTarget, swapHeld, type Press } from '../fight/lock-switch.ts';
import { pitchChoice, portraitPitch } from '../fight/camera-pitch.ts';
import { cameraZoom, wideRow } from '../fight/camera-zoom.ts';
import { setGuardWalk } from '../fight/characters.ts';
import { setTrailOpacity } from '../fight/trail-opacity.ts';
import { heroSpecialFxFor, setHeroSpecialFx } from '../fight/hero-special-fx.ts';
import { setSpecialSink } from '../fight/special-sink.ts';
import { foeWeaponFor, setFoeWeapon } from '../fight/foe-weapon.ts';
import { foeDisplayName, foeNameFor, setActiveKind, setFoeName, setKindNames } from '../fight/foe-name.ts';
import { pitbornV1 } from '../fight/foe-pick.ts';
import { orderedZone, orderProfile } from '../fight/boss-order.ts';
import { setBossBody, spotBodyProblems } from '../fight/foe-body.ts';
import { foeSweepsFor } from '../fight/foe-reach.ts';
import { setBlend } from '../fight/anim-blend.ts';
import { createHud } from '../fight/hud.ts';
import { CORPSE, atCamp, bank, carriedSave, dropPile, earn, inReach, lineOf, lingerSpot, regain, retrieve, validateCorpseRun } from '../corpse-run.ts';   // the corpse run (data/corpse-run.json; rides the progression save)
import { mountCorpseHud } from '../fight/corpse-hud.ts';
import { checkGolden, goldenWeaponAtLoad, mountGolden } from '../fight/golden-wire.ts';   // golden weapon drops (data/golden-weapons.json): the rest of the wiring lives there
import { goldenBlips } from '../zone/golden-drops.ts';
import { RADAR, bossBlips, mountRadar, pileBlip, playerBlips, radarOn } from '../fight/radar.ts';   // the radar (data/radar.json; ?radar=off): presentation only
import { createMobsRun } from '../mobs-run.ts';   // trash mob swarms (data/mobs.json, src/zone/mobs.ts)
import { createInput } from '../fight/input.ts';
import { strikeCut } from '../fight/cut-strike.ts';
import { mountManaBar } from '../fight/mana-bar.ts';
import { heroNoManaFor, setHeroNoMana } from '../fight/hero-mana.ts';
import { createFeedback } from '../fight/sound/feedback.ts';
import { toastOver, zoneSoundRows, type ZoneSoundRows } from '../audio/zone-cues.ts';
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
import { zoneLoopFor, validateWalk } from '../fight/zone-loop.ts';
import { freeHud, isFreeAction, startFreeRoam, stepFreeRoam, type FreeRoam } from '../fight/free-roam.ts';
import { heroDeathFor, respawnKey, respawnReady, standUpDue } from '../fight/hero-death.ts';
import { ATTACKERS, attackersOn, dropped, framingWiden, isStanding, joiners, validateFraming } from '../stubs.ts';
import { WALK_BACK, arrived, holdBack, reaggro, validateWalkBack, walkBackOn } from '../stubs.ts';   // the boss leash walk-back (src/zone/walk-back.ts, data/respawn.json walkBack)
import { adopt, joinAttacker, resetHeld, stepAttackers, type Attacker } from '../fight/attacker-bout.ts';
import { OPENERS, WORLD, held, openerLeashLift, openerOn, openerReach, validateOpeners, idleOnes, inAggro, kill, leashed, nearestStanding, pitOrigin, poseAt, poseFits, spotsFor, tick, validateSpots, withinLoad, bossLoadAfterKill, zoneDuel, type Spawn } from '../stubs.ts';
import { zoneFor as plainZoneFor } from '../stubs.ts';
import DAILY_ROWS from '../../data/daily-pit.json' with { type: 'json' };
import { createDaily, sessionOf } from '../daily-pit-ui.ts';   // the Daily Pit (data/daily-pit.json, src/daily-pit.ts): a button on every page; inside the daily the zone is the day's one boss with its modifier
import type { DailyFile } from '../daily-pit.ts';
import { groundFor, groundOn, sandOn } from '../zone/ground.ts';
import { ringLook, ringTune } from '../zone/rings.ts';   // the biome rings (data/rings.json): difficulty per ring, the ground tint and the sky plates by the hero's distance
import type { DuelPose } from '../fight/duel.ts';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;   // :84
const search = location.search;
const telemetry = startTelemetry();   // deaths and errors, anonymous (data/telemetry.json; off for ?telemetry=off, Do-Not-Track, localhost and the dev build). Every call below is a no-op when off and never throws
setErrorSink((e) => telemetry.error('caught', e));   // the existing captureException seam feeds js_error: no second hook
const canvas = element<HTMLCanvasElement>('world');
// V1's Pitborn in the Minotaur's body (data/fight.json opponent); ?pitborn=v1 = the Centurion's fight, on the same 106 body (src/fight/foe-pick.ts, the one read)
const level = FIGHT.level;
// The difficulty (data/difficulty.json over data/profiles.json, src/difficulty.ts): the fight config is { profile, difficulty row }; ?difficulty=1-10 picks the row
// (default row otherwise, a console warning for a bad value), ?difficulty=legacy the fight before this setting. Under ?pitborn=v1 (the Centurion, not this profile's opponent) it is off: V1's Centurion as before.
// PER-SPAWN KIND (src/fight/spawn-kind.ts): every zone spawn's `kind` is a data/profiles.json row; KINDS(kind) is its opponent, stats, scales and AI profile. The four lets below are the opponent of the
// spawn the sim HOLDS, reassigned by useKind when the sim is handed to a spawn of another kind (and back); nothing else on the page names an opponent. ?pitborn=v1 makes every kind the Centurion (override).
const TUNED = tuneFrom(TUNE as TuneFile, search);   // ?tune=gargantua.health:1.2 (data/tune.json): empty with no ?tune=, and then nothing below changes
// PROGRESSION AND SAVING (data/progression.json, src/progression.ts; Dom 2026-10-28): a boss's first kill unlocks a player weapon, every kill raises every boss's health and damage (capped) from the next respawn,
// and the kills are saved in localStorage (one key, try/catch on every read and write). With no save (or ?save=off, or the ?pitborn=v1 Centurion) PROG is null, the tune below is TUNED itself and the weapon is the fight row's: the game as before.
// STAR BOSSES (data/stars.json, src/stars.ts; Dom 2026-10-28, Valheim-style, no switch): a spawn instance stands as a 0-, 1- or 2-star boss, rolled when it respawns (deterministic: spawn id + its kill count; never on a boss's first encounter).
const STAR_ROWS = STARS as unknown as StarsFile;
{ const bad = validateStars(STAR_ROWS, [...DIFFICULTY.rows.map((r) => r.id), ...(DIFFICULTY.named ?? []).map((r) => r.id)]); if (bad.length) throw new Error(`data/stars.json: ${bad.join('; ')}`); }
const starById: Record<string, number> = {}, spawnKills: Record<string, number> = {}, kindKills: Record<string, number> = {};   // by spawn id / by kind: this visit's star level, kills of that spawn, kills of that boss kind
const PROG_ROWS = PROGRESSION as unknown as ProgressionFile;
{ const bad = validateProgression(PROG_ROWS, PROFILES.profiles.map((p) => p.id), isWeaponId); if (bad.length) throw new Error(`data/progression.json: ${bad.join('; ')}`); }
const daily = createDaily({ file: DAILY_ROWS as unknown as DailyFile, doc: document, win: window, store: storageOf(), session: sessionOf(window), progression: PROG_ROWS, useSave: progressionOn(PROG_ROWS, search) && !pitbornV1(search), now: () => Date.now(), reload: () => location.reload(), cuts: () => ((globalThis as Record<string, unknown[] | undefined>)[DAILY_ROWS.cutLog]?.length ?? 0), nameOf: (k) => PROFILES.profiles.find((p) => p.id === k)?.name ?? k });
const zoneFor = (s: string) => daily.zoneFor(plainZoneFor(s));   // the daily's one-boss zone inside the Daily Pit, else the zone as it is
if (daily.run) starById[daily.run.spawnId] = daily.stars;   // the day's star modifier: the boss stands with its star from the first frame
// inside the Daily Pit the save is not read for the fight (no escalation, no unlock, no corpse run): the same fight for everyone
const PROG = progressionOn(PROG_ROWS, search) && !pitbornV1(search) && !daily.run ? { store: storageOf(), save: null as ReturnType<typeof loadSave> | null } : null;
validateCorpseRun(CORPSE, PROFILES.profiles.map((p) => p.id));   // data/corpse-run.json: a bad row stops the page at load
if (PROG) PROG.save = loadSave(PROG.store, PROG_ROWS);
const REWARD_WEAPON = (PROG?.save ? heroWeapon(carriedSave(PROG.save), PROG_ROWS, FIGHT.weapon, CARRIED_WEAPONS, search) : FIGHT.weapon) as WeaponId;   // the newest unlock he can draw, or ?weapon=<id> (longsword or an unlock)
checkGolden(isWeaponId);   // data/golden-weapons.json: a bad row stops the page at load
const HERO_WEAPON = goldenWeaponAtLoad(PROG?.save?.golden, CARRIED_WEAPONS, REWARD_WEAPON) as WeaponId;   // drawn and fought with: a golden weapon held from the last visit is its own weapon from the first frame, else the boss-reward one (REWARD_WEAPON, which the corpse run carries)
const BASE_TUNE = mergeTune(mergeTune(TUNED, ringTune()), daily.tune);   // + the Daily Pit's modifier over the day's boss (empty outside it: the same object)   //   // the biome rings' difficulty multipliers (data/rings.json) under the address's own ?tune=; ring 1 and a zone with no rings add nothing
const KIND_CTX: KindCtx = { stars: STAR_ROWS, tune: PROG?.save ? mergeTune(BASE_TUNE, escalation(PROG.save, PROG_ROWS)) : BASE_TUNE, profiles: PROFILES.profiles as ProfileRow[], difficulty: DIFFICULTY as DifficultyFile, brains: BRAINS.brains as BrainRow[], pick: difficultyPick(DIFFICULTY, search), search, level, ai: FIGHT.ai,
  override: pitbornV1(search) ? FIGHT.opponentV1.opponent : null, weapon: HERO_WEAPON, skill: FIGHT.skill as SkillId, skill2: FIGHT.skill2 as SkillId, stance: FIGHT.stance as PickedStance, specials: FIGHT.specials };
let KINDS = kindTable(KIND_CTX);   // rebuilt after a kill (onBossKilled): the next respawn or fight is built from the raised scales
let foe: KindFight, opponentId: OpponentId, opponent: Opponent, difficultyOn: boolean, aiProfile: AiProfile;
function useKind(k: KindFight) {
  const changed = !foe || foe.opponentId !== k.opponentId || foe.kind !== k.kind || (foe.star ?? 0) !== (k.star ?? 0);   // two bosses on one archetype (a ring boss cloned from Arachne) differ by their profile row
  setActiveKind(k.kind, k.star ?? 0);
  foe = k; opponentId = k.opponentId as OpponentId; opponent = k.opponent; difficultyOn = k.scaled; aiProfile = k.ai;
  if (changed) nameOpponent();   // the HUD names the spawn the sim holds
}
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
const commentator = mountCommentator(document, Object.fromEntries(PROFILES.profiles.flatMap((p) => ((p as { name?: string }).name ? [[p.id, (p as { name?: string }).name!]] : []))));
setHeroNoMana(heroNoManaFor(FIGHT.heroMana, search));   // V3 (Dom: "remove mana for now"): the hero has no MANA bar and casts free (data/fight.json heroMana); ?mana=v1 = the bar and the mana cost
mountManaBar();

// The fight (match.ts begin('career') :144-176 for a guest at level 1): the live era flags, then initialPractice on the career's picks.
const ZONE = zoneLoopFor(orderedZone(zoneFor(search), FIGHT.order, search), search, kindIds(KIND_CTX.profiles));   // the live zone (every spawn kind must be a profile row) (null under ?postkill=v1: the single fight, whose pit is exactly as before)
// The zone's sound rows (data/sound.json zone): which scene-change cues stay silent and when the kill toast clears. Null under ?postkill=v1: every cue plays, the line stays.
const ZONE_SOUND: ZoneSoundRows | null = ZONE ? zoneSoundRows(SOUND.zone) : null;
feedback.zoneCues(ZONE_SOUND);
let seed = FIGHT.seed, epoch = 0;
const nextSeed = (s: number): number => (Math.imul(s, 1664525) + 1013904223) >>> 0;   // match.ts:75
function fresh(pose?: DuelPose): Practice {
  setPlayScale(ZONE ? WORLD.pitScale : playScaleFor(opponentId, Infinity)); setLateNotice(true); setStab(true); setStanceRows(true);   // the zone's pit is a wider circle (data/respawn.json world.pitScale) so the bosses stand further apart; the single fight keeps the Arena 1 circle
  setSpecialPace(specialPaceFor(FIGHT.specialPace, search));   // V3: the Skull Crack ×0.75 (data/fight.json specialPace); ?skull=v1 = today's timing
  setSpecialTerms(specialTermsFor(FIGHT.specialTerms, search));   // V3: the hero's specials every 9 s, no stamina (data/fight.json specialTerms); ?spec=v1 = V1's cooldowns and stamina
  setFoeSpecialReach(foeSpecialReachFor(FIGHT.foeSpecialReach, search));   // V3: an opponent's melee special starts inside 2.2 m and fizzles past 2.6 m (data/fight.json foeSpecialReach); ?special=v1 = V1's 3.0 m, no release check
  setKnockSim(knockSimFor(FEEL_SIM as KnockRows, search, FEEL_DEFAULTS));   // V3: the sim knockdown + finish window (data/feel-sim.json) rides the kick module: on by default (data/feel-defaults.json), ?kick=v1 or ?feel=v1 = the fight as before; a headless run (Gate 0) never calls this, so it steps as before, byte for byte
  epoch++;
  return make(seed, pose);
}
/** A whole fight on seed `s` against kind `k` (default: the spawn the sim holds; the hero and one boss, the profile's and difficulty rows' health and damage scales on the boss): `fresh`'s build without its side effects, which the zone's extra attackers reuse with their own kind. */
function make(s: number, pose?: DuelPose, k: KindFight = foe): Practice {
  const fits = !ZONE || !pose || poseFits(pose, RADIUS);   // a pose beyond the pit's wall is not the sim's to build: zoneDuel places it (spawns.ts)
  const scaled = kindPractice(k, KIND_CTX, s, fits ? pose : undefined);   // pose: a respawn stands the hero where he is (zone-loop.ts respawnPose); absent = the pit's marks
  return ZONE ? project(zoneDuel(scaled.duel, fits ? undefined : pose), scaled.ai, scaled) : scaled;   // the zone's duels have no ring wall and may begin far from the pit (spawns.ts zoneDuel); the single fight keeps the pit's circle
}
useKind(KINDS(ZONE ? ZONE.spawn.kind : orderProfile(FIGHT.profile, FIGHT.order, search)));   // the page opens on the first spawn's kind (the no-zone fight: the fight row's profile); every other spawn's kind is taken on its hand-over
let practice = fresh(), frameEvents: CombatEvent[] = [];
// the warden's brain (aiProfile, per kind: useKind): the kind's profile knobs over the difficulty row's over his V1 profile at his level (src/fight/spawn-kind.ts, src/difficulty.ts); ?ai=v1 = V1's profile untouched; off under ?pitborn=v1 (data/fight.json `ai`, a data/brains.json row)
const identity = () => ({ opponent: opponentId, level });   // match.ts specialIdentity, no presets

// :530 the render pair and the accumulator; the camera stays locked (V1's default)
let state = practice.fighter, previous = state, accumulator = 0, hitStop = 0;
const locked = true;
let assetsReady = false, graphicsLost = false;
const step = () => 1 / FIGHT.tempoHz;
const paused = () => !assetsReady || graphicsLost || document.hidden;   // :823 without the welcome card, journal and versus card

// The lock camera: V2's lower, over-the-shoulder framing (data/fight.json camera); ?cam=v1 keeps V1's lock exactly.
if (!/[?&]cam=v1\b/.test(search)) setLockFrame(FIGHT.camera.lift, FIGHT.camera.side);
// The zone follow camera's pitch (data/fight.json camera.pitch): off by default (the lock exactly as it was); ?pitch=low (flat, soft, or degrees) flattens it to show a band of horizon. Zone only; ?cam=v1 and ?postkill=v1 never read it.
if (ZONE && !/[?&]cam=v1\b/.test(search)) setCameraPitch(pitchChoice(FIGHT.camera.pitch, search), FIGHT.camera.pitch, portraitPitch(FIGHT.camera.pitch, search));
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
setFoeName(foeNameFor(FIGHT.foeName, search, pitbornV1(search) ? opponentId : FIGHT.foeName.opponent));   // the row names the Minotaur's opponent id (pitborn) wherever he stands (boss order: he is spawn 3); the Centurion of ?pitborn=v1 is drawn as him too
setKindNames(PROFILES.profiles);   // a profile row with a `name` (Gargantua, Arachne) names its own spawn over the bar; a row without one falls back to the row above / the roster
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
  opponentId, undefined, HERO_WEAPON, () => {}, level, gfxPost,
);
view.setZoom(cameraZoom(FIGHT.camera.zoom, search));   // the lens zoom (data/fight.json camera.zoom 1.1); ?zoom=1 = the camera as it was
view.setWide(wideRow(FIGHT.camera.wide, search));   // the wide-screen lens (data/fight.json camera.wide): more zoom on a landscape or desktop screen, none on a portrait one; ?wide=v1 = without it
view.setTier('Recruit'); view.setPlayerTier('Recruit');   // :1309 tierAt(0 marks): a guest's rung, and the Centurion met at it

// Keyboard + mouse and the wide screen (data/input.json, src/fight/kbm.ts): null under ?input=v1 / the row off, and then the controls and the screen are exactly as before (no listener, no attribute, no style)
const KBM = kbmFor(search);
if (KBM) mountKbm(document, window, KBM);
const controls = createInput({   // :832
  kbm: KBM, free: () => freeNow, walking: () => heroStands(),
  element, window, paused,
  now: () => performance.now(),
  matchMedia: (query) => matchMedia(query),
  innerWidth: () => innerWidth,
  ready: () => assetsReady,
  practice: () => practice,
  quiet: () => feedback.quiet(),
  strike: (aim) => { if ((practice.finish && practice.finish.victim === 1) || (ZONE && !engaged)) strikeCut(aim); },   // data/physics.json cut.strike: an attack press while the foe is down (not while another boss is on him) cuts the fallen body
});
function clearInput() { controls.clear(); hitStop = 0; accumulator = 0; }   // :713
const KEEP_INPUT = !!ZONE && keepsInput(search);   // data/respawn.json input: a hand-over while he free-walks leaves the stick alone (?input=v1 = clear as before)
/** A sim reset: clears the controls unless it is a hand-over of a walking hero (hand-over-input.ts); the frame clock restarts either way (a fresh sim). */
function resetInput(handOver: boolean) {
  if (dropsInput(KEEP_INPUT, handOver)) clearInput();
  else { hitStop = 0; accumulator = 0; }
}
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
  const marks = starMark(STAR_ROWS, foe?.star ?? 0);   // data/stars.json: one small gold star per level beside the name, in the class slot's style (#opponent-name .opponent-class)
  if (marks) { const small = document.createElement('small'); small.className = 'opponent-class opponent-stars'; small.textContent = marks; small.style.color = STAR_ROWS.hudColour; small.style.opacity = '1'; label.append(' ', small); }
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
if (ZONE && groundOn(search)) view.openGround(groundFor(WORLD.pitScale, undefined, sandOn(search)));   // the zone's open ground beyond the pit (data/zone-ground.json); ?ground=v1 and ?postkill=v1 keep the pit's floor
if (ZONE) (globalThis as { __v3Renderer?: unknown }).__v3Renderer = view.renderer;   // the stills put the camera at the pit's edge (scripts/ground-stills.mjs)
const DEATH = heroDeathFor(!!ZONE, search);   // data/hero-death.json: the death ragdoll, camera, 'You fell' line and Respawn button; null = ?herodeath=v1 (or ?postkill=v1): the fall, 'You died' and the automatic stand-up as before
let respawnAsked = false;
view.heroDeath(DEATH);
view.heroFall(ZONE ? ZONE.fallSeconds : 0);   // the hero's death fall (data/respawn.json heroDeath.fallSeconds; 0 = ?postkill=v1, the frozen end screen as before)
let roam: State | null = null, freeRoam: FreeRoam | null = null, sinceDeath = 0, bossKilled = false;
let fightSec = 0;   // seconds the hero has been engaged in this fight (telemetry's `sec`); reset at every rematch and after each report
/** Telemetry's boss_death / boss_kill row: the boss's kind, the seconds engaged, and the percent of max health each side has left. */
function reportFight(name: 'boss_death' | 'boss_kill', index: number) {
  const hero = practice.duel.fighters[0], foeFighter = index === current ? practice.duel.fighters[1] : attackers.find((a) => a.index === index)?.practice.duel.fighters[1];
  const pct = (f?: { health: number; maxHealth: number }) => (f && f.maxHealth > 0 ? (100 * f.health) / f.maxHealth : 0);
  telemetry.event(name, { boss: spawns[index]?.kind ?? 'unknown', sec: fightSec, heroHp: pct(hero), bossHp: pct(foeFighter) });
  if (name === 'boss_kill') shareClip.moment(spawns[index]?.kind); else shareClip.cancel();   // the Share clip button (src/share-clip.ts): keep the last seconds at a kill, drop the buffer at a death
  fightSec = 0;
}
// The zone's free follow camera (data/respawn.json freeCamera, src/fight/free-camera.ts; Dom 2026-10-27: after the kill shot the camera goes free so he can move round): the camera follows the hero whenever nobody fights him and, after a kill, once the
// ceremony is over or he moves the stick; any stick input ends the ceremony at once. killAge counts the seconds since the kill landed (the rig's own finish age restarts when its finisher camera lets go); freeAfterKill latches the hand-over for this kill.
// FREE is null under ?postkill=v1 (no zone), ?freecam=v1 and the row off: the lock camera exactly as it was
const FREE = freeCameraFor(!!ZONE, search);
setFreeCamera(FREE);
// The look thumb's rows (data/respawn.json look): null = ?look=off, the row off, or no free camera
const LOOK = lookFor(!!FREE, search), look = LOOK ? createLook(LOOK) : null;
const LOCK_ROWS = FREE ? lockBreakFor(!!ZONE, search) : null;   // the soft lock (src/fight/lock-break.ts): null = the old hard lock (?lock=v1, ?freecam=v1, ?postkill=v1)
let lockState = freshLock();
let killAge = 0, freeAfterKill = false, freeNow = false;
const heroStands = () => !!ZONE && !!practice.finish && !practice.finish.draw && practice.finish.victim === 1 && practice.playerHealth > 0;
const heroDied = () => !!ZONE && !!practice.finish && practice.playerHealth === 0;
const SPOTS = ZONE ? spotsFor(orderedZone(zoneFor(search), FIGHT.order, search)) : [];
if (ZONE) { validateSpots(SPOTS, initialState(), RADIUS, WORLD, kindIds(KIND_CTX.profiles)); for (const s of SPOTS) KINDS(s.kind); }   // every spawn fights as its own kind: each must be a profile row whose opponent is an archetype (built now, so a bad row fails at load)
if (ZONE) validateWalk(ZONE.walkRadius, RADIUS);
if (ZONE) validateOpeners(OPENERS, SPOTS);
if (ZONE) setArenaClamp(OPEN_RADIUS);   // endless open ground: every camera clamp (walk, finisher side view, tour, intro orbit) is out of reach in the zone, so the camera follows the hero wherever he runs
if (ZONE) { const bad = spotBodyProblems(SPOTS); if (bad.length) throw new Error(`zone row bodies: ${bad.join('; ')}`); }   // a spawn's own body (zone row spawns[].body) is a usable boss body; none in the shipped zone
let openerIdle = 0, openerLift = 0, openerSpent = !ZONE || !openerOn(search);   // the opener (data/respawn.json openers): idle seconds since the page was ready with nobody engaged; spent for the visit once anyone is engaged, killed or dead
let spawns: Spawn[] = SPOTS.map((s) => ({ ...s, deadFor: null })), current = 0, engaged = false, killMarked = false;
// Real-time aggro (data/respawn.json attackers, src/zone/attackers.ts, src/fight/attacker-bout.ts): while the hero fights the held boss, every other standing spawn whose aggro he enters fights him too, in its own duel on his one health pool.
// `attackers` holds them (a killed one stays, lying, until its own timer stands it again); `killedBy` is the attacker whose blow killed the hero (that boss starts again at full health). ?aggro=v1 / row off / ?postkill=v1: none, the others are frozen copies.
const multi = !!ZONE && attackersOn(search);
const walkBackEnabled = !!ZONE && walkBackOn(search);   // a leashed boss walks home regenerating (?leash=v1 / row off / ?postkill=v1: the instant reset as before)
if (walkBackEnabled) validateWalkBack();
let walkBack = false;   // the held boss is walking back to its spot: untouchable, harmless, engaged is false until it arrives or the hero re-aggros it
let attackers: Attacker[] = [], killedBy: number | null = null, widen = 1;   // widen: the lock camera's back-off for the attackers on him (framingWiden, eased); exactly 1 while only one boss is live
if (multi) validateFraming();
const heroStart = initialState();   // where the hero stands at a first load and after a death: the pit's mark
/** The duel pose of spawn `index` against a hero at `at`: stepped back from its spot when he stands on it (zone-loop.ts respawnPose). */
const poseFor = (index: number, at: { x: number; z: number }): DuelPose => poseAt(at, spawns[index]!, OPEN_RADIUS, ZONE!.minDistance, heroStart);
/** The kind spawn `index` fights as (its zone row's `kind`, a data/profiles.json row): the sim's opponent whenever it holds that spawn or that spawn joins as an attacker. */
const kindAt = (index: number): KindFight => KINDS(spawns[index]!.kind, starById[spawns[index]!.id] ?? 0);
// THE CORPSE RUN (data/corpse-run.json, src/corpse-run.ts; Dom 2026-10-28, Valheim style, no flag of its own): a boss kill pays coins the hero carries until he banks them at camp; when he dies his carried coins and the
// weapon he carries leave him as ONE pile where he fell (a second death replaces it), he respawns at camp with no coins and the weapon withdrawn from his save (the rig built at load keeps the weapon already drawn until the next load), and walking over the pile gives them back. The boss that killed him lingers at the pile: its
// spot moves there with the row's leash for the row's seconds (the existing aggro, leash and walk-home rules, no new AI). The pile lives in the progression save (so ?save=off and ?pitborn=v1 are the game as before).
const CR = ZONE && PROG ? CORPSE : null;
const crHud = CR ? mountCorpseHud(document, CR) : null;
const pileXY: [number, number] = [0, 0];   // the pile marker's screen spot, rewritten each frame (no per-frame allocation)
let carriedWeapon: string = REWARD_WEAPON, lingerIdx = -1, lingerLeft = 0, crClock = 0;
const weaponName = (w: string) => PROG_ROWS.bosses.find((b) => b.weapon === w)?.name ?? w;
function crPut(save: ReturnType<typeof loadSave>) { if (!PROG) return; PROG.save = save; writeSave(PROG.store, PROG_ROWS, save); }
const PARTS_HOOK = PROG ? mountParts({ get: () => PROG.save, put: crPut, profiles: PROFILES.profiles, stars: STAR_ROWS, prog: PROG_ROWS }) : null;   // Frankendom parts (data/parts.json): cut parts are kept automatically; the ☰ menu
function crLine(text: string) { (unlockLine ??= mountUnlockLine(document, PROG_ROWS.lineSeconds)).show(text); }
function startLinger(idx: number) {
  const pile = PROG?.save?.pile;
  if (!CR || !pile || idx < 0 || !spawns[idx]) return;
  endLinger();
  lingerIdx = idx; lingerLeft = CR.linger.seconds; spawns = spawns.map((s, i) => (i === idx ? lingerSpot(CR, s, pile) : s));
}
function endLinger() {
  if (lingerIdx < 0) return;
  const i = lingerIdx; lingerIdx = -1;
  spawns = spawns.map((s, k) => (k === i ? { ...SPOTS[i]!, deadFor: s.deadFor } : s));
  if (i === current && !engaged && !practice.finish) leashReset(i, state);   // the lingering boss that stands alone goes home (the existing reset, at its own spot)
}
/** The hero has just died: what he carries leaves him as the pile; the boss that killed him lingers at it. Nothing here throws. */
function onHeroDied() {
  try { golden?.died(state); } catch (error) { console.warn('golden: weapon not dropped', error); }   // the golden weapon he held lies where he fell, with its charges
  if (!CR || !PROG?.save) return;
  try {
    const who = killedBy ?? current, out = dropPile(PROG.save, CR, { x: state.x, z: state.z }, spawns[who]!.kind, carriedWeapon !== FIGHT.weapon ? carriedWeapon : null);
    if (!out.pile) return;
    crPut(out.save); carriedWeapon = FIGHT.weapon;
    startLinger(who);
  } catch (error) { console.warn('corpse run: pile not dropped', error); }
}
/** Every frame: the pile is retrieved on touch, carried coins bank at camp, the lingering boss goes home when its time is up. */
function corpseStep(dt: number) {
  if (!CR || !PROG?.save) return;
  try {
    crClock += dt;
    const alive = practice.playerHealth > 0, pile = PROG.save.pile;
    if (alive && pile && inReach(CR, pile, state)) {
      const out = retrieve(PROG.save, CR);
      crPut(out.save); if (out.weapon) carriedWeapon = out.weapon; commentator.say('retrieve');
      crLine(lineOf(out.weapon ? CR.pile.lineWeapon : CR.pile.line, { coins: out.coins, weapon: out.weapon ? weaponName(out.weapon) : '' }));
    } else if (alive && PROG.save.coins > 0 && atCamp(CR, heroStart, state)) {
      const out = bank(PROG.save, CR);
      crPut(out.save); crLine(lineOf(CR.bank.line, { coins: out.coins }));
    }
    if (lingerIdx >= 0) {
      lingerLeft -= dt;
      if (lingerLeft <= 0 && !(engaged && lingerIdx === current) && !attackers.some((a) => a.index === lingerIdx && !a.dead)) endLinger();
    }
  } catch (error) { console.warn('corpse run: step failed', error); }
}
if (CR) (globalThis as { __v3Corpse?: unknown }).__v3Corpse = { give: (n: number) => { if (PROG?.save) crPut({ ...PROG.save, coins: PROG.save.coins + Math.max(0, Math.floor(n)) }); } };   // the stills hand the hero carried coins (scripts/corpse-run-stills.mjs), as they read __v3Fight
// TRASH MOBS (data/mobs.json; Dom 2026-10-28): packs in the open world outside the boss pads; none while a boss fight is on. A kill pays coins into the corpse run's carried coins (window.__v3Heat?.(event) is the Hunter heat hook).
const mobsRun = ZONE && !daily.run ? createMobsRun({ zone: zoneFor(search), origin: pitOrigin(zoneFor(search), WORLD), bosses: () => spawns, suppress: () => !assetsReady || engaged || walkBack || heroDied() || attackers.some((a) => !a.dead), coins: (n) => { if (CR && PROG?.save) crPut({ ...PROG.save, coins: Math.min(CR.coins.cap, PROG.save.coins + n) }); }, rangeMetres: RADAR.rangeMetres }) : null;
if (mobsRun) { view.mobs(mobsRun.view); (globalThis as { __v3Mobs?: unknown }).__v3Mobs = mobsRun; }   // the stills and the tests drive the same handle
if (CR && PROG?.save?.pile) startLinger(spawns.findIndex((s) => s.kind === PROG!.save!.pile!.boss));   // a pile from an earlier visit: its boss stands at it from the first frame
// GOLDEN WEAPON DROPS (data/golden-weapons.json, src/zone/golden-drops.ts; Dom 2026-10-28): rare weapons lie in the world; walking onto one makes it his for N charges (the HUD counts them), his blows hurt more, and at 0 he
// reverts. Rides the progression save (optional `golden` field), so ?save=off and ?pitborn=v1 mount nothing. Other lanes: __v3Golden.dropGolden(position, tier) and .onPickup(fn).
const golden = ZONE && PROG ? mountGolden({ doc: document, view, spots: SPOTS, drawable: CARRIED_WEAPONS, get: () => PROG.save?.golden, put: (next) => { if (PROG.save) { PROG.save = { ...PROG.save, golden: next }; writeSave(PROG.store, PROG_ROWS, PROG.save); } } }) : null;
(globalThis as { __v3Golden?: unknown }).__v3Golden = golden;
if (ZONE) { current = nearestStanding(spawns, heroStart); useKind(kindAt(current)); practice = fresh(poseFor(current, heroStart)); state = previous = practice.fighter; }   // the page opens on the hero at the mark and the bosses at their spots
function rematch(pose?: DuelPose, index = current, restart = true, handOver = false) {
  if (ZONE) useKind(kindAt(index));   // the sim's opponent becomes the spawn it is handed to (and back as the hero walks to another)
  if (ZONE) view.respawnFoe();   // first: the dead body is left standing before his sim body is reset (scene.ts, ragdoll.leaveCorpse)
  seed = nextSeed(seed); practice = fresh(pose); frameEvents = []; openerLift = 0;   // every reset (hand-over, leash reset, respawn) clears the opener's leash lift; the next frame sets it again for the opener's own fight
  roam = null; sinceDeath = 0; fightSec = 0; killAge = 0; freeAfterKill = false; current = index; engaged = false; killMarked = false; walkBack = false;
  attackers = attackers.filter((a) => a.dead); killedBy = null;   // every live attacker lets go and stands again at full health at its spot; a killed one keeps lying until its own timer is up
  resetInput(handOver); state = previous = practice.fighter;
  if (restart) view.restartStandoff();
  updateHud();
}
/** The sim hands over to spawn `index` with the hero where he stands (no draw-in replayed: both rigs already stand armed). */
const hand = (index: number, at: { x: number; z: number }) => rematch(poseFor(index, at), index, false, true);
/**
 * A boss past its leash resets ONLY that boss (MMO style): it stands again at its spot at full health; the hero's health and body, the other attackers and their fights are untouched, nothing is
 * `fresh()`ed. With another boss already on him that boss's fight becomes the sim's (as when the first boss dies, `adoptAttacker`); alone, the same boss is rebuilt at its spot and the hero carries on, not engaged.
 */
function leashReset(index: number, at: { x: number; z: number }) {
  view.respawnFoe();
  epoch++; seed = nextSeed(seed); frameEvents = []; openerLift = 0; walkBack = false;
  const out = resetHeld(practice, attackers, index, () => make(seed, poseFor(index, at), kindAt(index)));
  practice = out.practice; attackers = out.list; current = out.index; engaged = out.engaged; useKind(kindAt(current));   // an attacker may take the sim: its kind with it
  state = previous = practice.fighter;
  updateHud();
}
/** The opening pose of attacker `index`: its boss at its own spot, the hero where he stands (he is never moved: the sim reads his real body every tick). */
const poseOfAttacker = (index: number, at: { x: number; z: number }): DuelPose => ({ hero: { x: at.x, z: at.z }, foe: { x: spawns[index]!.x, z: spawns[index]!.z }, heroFacing: Math.atan2(spawns[index]!.x - at.x, spawns[index]!.z - at.z) });
/** The kill's ceremony is over and another boss is on him: that boss's fight becomes the sim's fight, the hero's health as it is now (the first boss's corpse is left lying, as at every hand-over). */
function adoptAttacker(a: Attacker, at: { x: number; z: number; heading: number }) {
  view.respawnFoe();
  const walking = roam !== null;   // read before the reset below: a hero free-walking keeps his stick when another boss takes the sim
  const mine = practice.duel.fighters[0], hero: Fighter = { ...mine, body: { ...mine.body, x: at.x, z: at.z, heading: at.heading } };   // the hero stays where he stands: the ground is unbounded and a zone duel has no wall to draw him to
  epoch++; seed = nextSeed(seed); practice = adopt(a, hero); frameEvents = []; openerLift = 0;
  roam = null; sinceDeath = 0; killAge = 0; freeAfterKill = false; current = a.index; engaged = true; killMarked = false; killedBy = null; walkBack = false;
  useKind(kindAt(current));   // the attacker's own kind is now the sim's opponent (its duel was already built and stepped as that kind)
  attackers = attackers.filter((x) => x !== a);
  resetInput(walking); state = previous = practice.fighter;
  updateHud();
}
/** A boss falls to the hero (the zone loop; data/progression.json): the kill goes on the ladder and in the save, the boss's first kill shows the discreet "Unlocked: <weapon>" line, and the kinds are rebuilt at the raised scales so the next respawn or fight meets them. Nothing here throws. */
let unlockLine: ReturnType<typeof mountUnlockLine> | null = null;
function onBossKilled(kind: string, star = 0, at?: { x: number; z: number }) {
  if (!PROG?.save) return;
  if (at) try { golden?.killed(at, star); } catch (error) { console.warn('golden: drop failed', error); }   // a golden weapon may lie where it fell
  try {
    const out = recordKill(PROG.save, kind, PROG_ROWS);
    if (out.save === PROG.save) return;
    let next = out.save, regained: BossRow | null = null;
    if (CR) {   // the corpse run: the kill pays coins, and a weapon lost with a replaced pile comes back with its boss's next kill
      next = earn(next, CR, kind);
      const row = PROG_ROWS.bosses.find((b) => b.id === kind), back = row ? regain(next, row.weapon) : null;
      if (back?.regained) { next = back.save; regained = row!; }
    }
    const trophy = trophyText(STAR_ROWS, star), tier = starLevel(STAR_ROWS, star).trophy?.tier;   // data/stars.json: a star kill drops that level's trophy (a count in the save and a line), no item art
    PROG.save = tier === undefined ? next : addTrophy(next, tier); writeSave(PROG.store, PROG_ROWS, PROG.save);
    KIND_CTX.tune = mergeTune(BASE_TUNE, escalation(PROG.save, PROG_ROWS)); KINDS = kindTable(KIND_CTX);
    const line = [out.unlocked || regained ? unlockText((out.unlocked ?? regained)!) : null, trophy].filter(Boolean).join(' · ');
    if (line) (unlockLine ??= mountUnlockLine(document, PROG_ROWS.lineSeconds)).show(line);
  } catch (error) { console.warn('progression: kill not recorded', error); }
}
/** Spawn `id` stands again: its star is rolled from the spawn's own kill count and how often that boss kind has fallen (this visit's count or the save's, the larger). */
function rollStarFor(spawn: Spawn) {
  spawnKills[spawn.id] = (spawnKills[spawn.id] ?? 0) + 1; kindKills[spawn.kind] = (kindKills[spawn.kind] ?? 0) + 1;
  starById[spawn.id] = rollStar(STAR_ROWS, KIND_CTX.pick, spawn.id, spawnKills[spawn.id]!, Math.max(kindKills[spawn.kind]!, PROG?.save?.kills[spawn.kind] ?? 0));
}
// The stills' and the tests' hook (no URL switch): force spawn `id` to `n` stars now (the held boss is rebuilt at the hero's side as a fresh fight), or read the table and the stars.
(globalThis as { __v3Stars?: unknown }).__v3Stars = { rows: STAR_ROWS, of: () => ({ ...starById }), force(id: string, n: number): boolean { const i = spawns.findIndex((s) => s.id === id); if (i < 0) return false; starById[id] = n; if (i === current) rematch(poseFor(i, state), i); return true; } };
/** One frame of the zone's rules: every spawn's own timer runs; a kill, an aggro, a leash or a respawn moves the sim between spawns. */
function zoneStep(dt: number) {
  const hero = state, timers = tick(spawns, dt);
  daily.frame({ dt, engaged, heroHealth: practice.playerHealth, won: heroStands(), lost: heroDied() });   // the Daily Pit's score tracker (no-op outside it)
  if (engaged && !practice.finish) fightSec += dt;
  spawns = timers.spawns;
  corpseStep(dt);
  for (const i of timers.due) rollStarFor(spawns[i]!);   // a spawn stands again: its next star, before anything builds its fight
  if (multi) {   // a killed attacker lies until its own timer stands it again; the moment it dies its own timer starts (nobody else's moves)
    attackers = attackers.filter((a) => !(a.dead && timers.due.includes(a.index)));
    for (const a of attackers) if (a.dead && isStanding(spawns[a.index]!)) { onBossKilled(spawns[a.index]!.kind, starById[spawns[a.index]!.id] ?? 0, a.practice.enemy); spawns = kill(spawns, a.index); }
  }
  if (practice.finish) { openerSpent = true; openerLift = 0; }   // opener: a kill or a death spends it (no re-arm)
  if (heroStands() && !killMarked) { killMarked = true; engaged = false; reportFight('boss_kill', current); onBossKilled(spawns[current]!.kind, starById[spawns[current]!.id] ?? 0, practice.enemy); spawns = kill(spawns, current); if (!attackers.some((a) => !a.dead)) radar?.armFlash(); }   // the radar's red dots pulse yellow until the next fight (data/radar.json flash; not while another boss is already on him); this spawn's timer starts; nobody else's moves
  if (heroStands()) {   // walking on: a standing spawn he walks up to takes the sim; the held one's own timer coming due stands it (or the nearest) again
    const live = attackers.find((a) => !a.dead), phase = view.finishPhase();
    if (live) { if (roam || freeAfterKill || phase.complete || killAge >= ZONE!.startAfterSeconds) adoptAttacker(live, hero); }   // another boss is already on him: once the kill's ceremony lets go, that fight goes on as THE fight (its health, its place), not a fresh boss
    else {
      const near = inAggro(spawns, hero), next = near >= 0 ? near : timers.due.includes(current) ? nearestStanding(spawns, hero) : -1;
      if (next >= 0) hand(next, hero);
    }
  } else if (heroDied()) {
    if (sinceDeath === 0) reportFight('boss_death', killedBy ?? current);
    if (sinceDeath === 0) onHeroDied();   // the first frame of the death: what he carries drops where he fell
    sinceDeath += dt;
    if (DEATH ? standUpDue(DEATH, sinceDeath, respawnAsked) : sinceDeath >= ZONE!.diedSeconds) { respawnAsked = false; const who = killedBy ?? current; rematch(poseFor(who, heroStart), who); }   // "You died" for diedSeconds, then the pit's mark at full health; the boss that killed him starts again at full health, the rest untouched
  } else if (!practice.finish && walkBack) {   // the held boss walks home (frame(): holdBack moves it): it arrives and resets to full; the hero re-aggroing it inside its leash cancels the walk; walking into another standing boss's aggro hands the sim to that one
    const near = inAggro(spawns, hero);
    if (near >= 0 && near !== current) hand(near, hero);
    else if (reaggro(spawns[current]!, practice.enemy, hero)) { walkBack = false; engaged = true; }
    else if (arrived(spawns[current]!, practice.enemy)) leashReset(current, hero);
  } else if (!practice.finish) {
    if (engaged) openerSpent = true;   // opener: any engagement spends it
    if (!openerSpent && assetsReady) openerIdle += dt;   // the newcomer's idle clock; its due spawn's aggro reaches him (spawns.ts openerReach)
    const near = inAggro(openerSpent ? spawns : openerReach(spawns, OPENERS, openerIdle, hero), hero);
    if (near >= 0 && !openerSpent && openerIdle >= OPENERS.delaySeconds) openerLift = openerLeashLift(spawns[near]);   // the opener's fight keeps its leash lifted by the same reach (the newcomer stands beyond the plain leash)
    if (engaged) {
      if (leashed(spawns[current]!, practice.enemy, openerLift)) { if (walkBackEnabled && !attackers.some((a) => !a.dead)) { walkBack = true; engaged = false; } else leashReset(current, hero); }   // walk home (visible, regenerating, harmless) when it is the only boss on him; otherwise the instant reset
      // the BOSS chased past its leash from its spot (not the hero crossing a line): it gives up and resets at its spot at full health; only that boss resets
      else if (multi) {   // real-time aggro: any other standing boss whose aggro he is inside attacks him now, whatever he is fighting; one beyond its own leash lets go
        const alive = () => attackers.filter((a) => !a.dead).map((a) => a.index);
        const gone = dropped(spawns, alive(), (i) => attackers.find((a) => a.index === i)!.practice.enemy);
        attackers = attackers.filter((a) => !gone.includes(a.index));
        for (const i of joiners(spawns, current, alive(), hero)) attackers.push(joinAttacker(i, make(nextSeed((seed ^ (i + 1)) >>> 0), poseOfAttacker(i, hero), kindAt(i)), kindAt(i).ai));   // each attacker fights as its own kind, its own brain
      }
    }
    else if (near >= 0) { if (near === current) engaged = true; else hand(near, hero); }   // walked into aggro: this one fights
    else { const at = held(spawns, current, hero, WORLD.retargetMargin); if (at >= 0 && at !== current) hand(at, hero); }   // nobody engaged: the sim holds the nearest
  }
}
/** The cleaver sweep override is one global table per (rig, weapon) (blade.ts setSweepOverride): it follows the kinds on the hero now (the held one and the live attackers), the first kind with a bake of its own (foe-reach.ts foeSweepsFor) laying its table; none = V1's. Re-laid only when that kind changes. */
let sweepOwner: string | null = foeSweepsFor(FIGHT.foeReach, search, opponentId) ? opponentId : null;
function syncSweeps() {
  const owner = [foe, ...attackers.filter((a) => !a.dead).map((a) => kindAt(a.index))].find((k) => foeSweepsFor(FIGHT.foeReach, search, k.opponentId) !== null)?.opponentId ?? null;
  if (owner === sweepOwner) return;
  sweepOwner = owner; applyFoeSweeps(search, owner === null ? null : foeSweepsFor(FIGHT.foeReach, search, owner));
}
// The zone's stills and the cost table read this (scripts/zone-stills.mjs)
function zoneDebug() { (globalThis as { __v3Zone?: unknown }).__v3Zone = { current, engaged, heroHealth: practice.playerHealth, foeHealth: practice.health, attackers: attackers.map((a) => ({ id: spawns[a.index]!.id, health: a.practice.health, dead: a.dead, phase: a.practice.duel.fighters[1].phase, x: +a.practice.enemy.x.toFixed(2), z: +a.practice.enemy.z.toFixed(2) })), live: view.liveFoeCount, openerIdle: +openerIdle.toFixed(2), openerSpent, spawns: spawns.map((s) => ({ id: s.id, x: s.x, z: s.z, deadFor: s.deadFor })), ...(Object.keys(TUNED).length ? { tune: TUNED } : {}), copies: view.idleFoeCount, calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles }; }
// The hero's death (data/hero-death.json, src/fight/hero-death.ts): after the fall the HUD says 'You fell' and the Respawn button (the Rematch button) or a key stands him up; the existing respawn does it (zoneStep).
function askRespawn() { if (DEATH && heroDied() && respawnReady(DEATH, sinceDeath)) respawnAsked = true; }
element('reset-button').addEventListener('click', () => { if (DEATH && heroDied()) askRespawn(); else rematch(); });
if (DEATH) window.addEventListener('keydown', (e) => { if (heroDied() && respawnKey(DEATH, e.code)) { e.preventDefault(); askRespawn(); } });
// Tap-to-switch the soft lock (data/respawn.json lockSwitch, src/fight/lock-switch.ts; ?lockswitch=v1 off): a tap on another boss that is on him swaps the held fight with that boss's. A press listener of its own: the look drag, the corpse cut tap and the buttons are not touched.
const SWITCH = LOCK_ROWS && multi ? lockSwitchFor(true, search) : null;
if (SWITCH) {
  let pressed: Press | null = null;
  canvas.addEventListener('pointerdown', (e) => { pressed = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId }; });
  canvas.addEventListener('pointerup', (e) => {
    const down = pressed; pressed = null;
    if (paused() || !engaged || lockState.broken || practice.finish || !isTap(SWITCH, down, { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId })) return;
    const box = canvas.getBoundingClientRect(), on = attackers.filter((a) => !a.dead).map((a) => { const p = view.project([a.practice.enemy.x, SWITCH.aimHeightMetres, a.practice.enemy.z]); return { index: a.index, x: p ? p[0] : NaN, y: p ? p[1] : NaN }; });
    const pick = pickTarget(SWITCH, { x: e.clientX - box.left, y: e.clientY - box.top }, on, current), out = pick === null ? null : swapHeld(practice, attackers, current, pick, kindAt(current).ai);
    (globalThis as { __v3Switch?: unknown }).__v3Switch = { tap: [e.clientX - box.left, e.clientY - box.top], on, pick, held: current, switched: !!out };   // the stills read the last tap's picture (scripts/*-stills.mjs)
    if (out) { epoch++; practice = out.practice; attackers = out.list; current = out.index; useKind(kindAt(current)); updateHud(); }
  });
}
if (FREE) {   // the free follow camera's hands (V1's open world: a one-finger drag on empty ground looks round; the recenter key R stands behind him). The tap that cuts a corpse is a press that stays put (ragdoll.listenTaps), so a drag is never a cut.
  // The look thumb (data/respawn.json look, src/fight/look-drag.ts): its own pointer id, so the left thumb's stick and every button keep working; only while the camera is free (frame(): a fight cancels it)
  if (look) {
    // Just after a kill the finisher camera still holds the view (freeNow false) for up to startAfterSeconds: a look finger is taken then too, and once it drags past the dead zone it ends the ceremony as the stick does (free-camera.ts lookStarts); a tap on the corpse is still a tap
    const lookReady = () => lookStarts(FREE, freeNow, heroStands(), freeAfterKill || view.finishPhase().complete || killAge >= ZONE!.startAfterSeconds, killAge, view.finishPhase().stickBeat);
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || paused() || !lookReady() || !look.down(e.pointerId, e.clientX, window.innerWidth, e.pointerType, e.timeStamp)) return;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      const turn = look.move(e.pointerId, e.clientX, e.timeStamp);
      if (!turn) return;
      if (!freeNow && lookReady()) { freeAfterKill = true; freeNow = true; view.stopTour(); }   // the drag is the hand-over: the ceremony ends now, the camera swings to the free follow
      if (freeNow) view.lookYaw(-turn);
    });
    for (const name of ['pointerup', 'lostpointercapture']) canvas.addEventListener(name, (e) => { look.up((e as PointerEvent).pointerId, (e as PointerEvent).timeStamp); });
    canvas.addEventListener('pointercancel', (e) => { look.abort((e as PointerEvent).pointerId); });
  } else {
    // ?look=off: the plain one-finger drag the free camera shipped with
    let drag: { id: number; x: number } | null = null;
    canvas.addEventListener('pointerdown', (e) => { if (drag || e.button !== 0 || paused()) return; drag = { id: e.pointerId, x: e.clientX }; try { canvas.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ } });
    canvas.addEventListener('pointermove', (e) => { if (!drag || drag.id !== e.pointerId) return; if (freeNow) view.lookRound(e.clientX - drag.x); drag.x = e.clientX; });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, (e) => { if (drag?.id === (e as PointerEvent).pointerId) drag = null; });
  }
  element('recenter-button').addEventListener('click', () => { if (freeNow) view.faceBehind(state.heading); });
}

function updateHud() {   // :684, the career fight's view
  hud.update(practice, { controlsReady: assetsReady && !graphicsLost, debug: false, opponentId, practiceOnly: false, autoStart, zone: heroStands() || heroDied(), toastOver: heroStands() && toastOver(ZONE_SOUND, killAge), ...(roam && freeRoam ? { free: freeHud(freeRoam) } : {}), death: DEATH && heroDied() ? { line: DEATH.line, button: DEATH.button, ready: respawnReady(DEATH, sinceDeath) } : undefined });
  const phase = practice.finish ? view.finishPhase() : null, hushed = !phase?.settled, walking = roam !== null || (!!DEATH && heroDied());   // a walking hero keeps the whole HUD (Respawn included) up; so does a fallen one under the death loop (the camera is still moving, so "settled" would hide the line and Respawn)
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
    if (ZONE) { zoneStep(dt); syncSweeps(); }
    if (ZONE) commentator.frame(dt, engaged, heroDied(), heroStands(), 100 * practice.playerHealth / practice.maxHealth, 100 * practice.health / practice.enemyMaxHealth, spawns[current]!.kind, starById[spawns[current]!.id] ?? 0, state.x, state.z);   // the arena commentator's captions (presentation only)   // every spawn's own timer; a kill, an aggro, a leash, a respawn or the hero's death moves the sim between spawns; the dead body is left lying (view.respawnFoe)
    if (heroStands()) killAge += dt;
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
      let lockOn: boolean = locked;   // the soft lock (data/respawn.json lockBreak): held in a fight until the stick breaks it; free facing (lock:false, the sim's own) when broken or when nobody fights him
      if (LOCK_ROWS) {
        const fighting = engaged || attackers.some((a) => !a.dead);
        if (KBM && controls.takeLockToggle() && fighting) lockState = toggleLock(lockState);   // Tab (data/input.json keys.lock): let go of the lock / lock on again
        lockState = stepLock(LOCK_ROWS, lockState, { dt: step(), fighting, stick: { x: intent.x, z: intent.z }, yaw: view.yaw, hero: state, foe: practice.enemy, action: intent.action }).state;
        lockOn = locked && fighting && !lockState.broken;
      }
      const duelIntent = quantizeIntent({ move: { x: intent.x, z: intent.z, yaw: view.yaw, run: intent.run }, action: startAction(autoStart && (!ZONE || engaged), practice, intent.action), guard: intent.guard,
        guardDirection: intent.guardDirection ?? undefined, held: intent.held, lock: lockOn, cancel: intent.cancel });
      const prior = practice;
      practice = stepPractice(prior, duelIntent, aiProfile);
      if (walkBack) practice = holdBack(prior, practice, spawns[current]!);   // the leashed boss walks home, regenerating; nothing lands on either side
      if (attackers.length) {   // real-time aggro: each live attacker steps its own duel from the hero as he stood, the same intent; their damage lands on his one pool (src/fight/attacker-bout.ts)
        const stepped = stepAttackers(prior, practice, duelIntent, attackers, aiProfile);
        practice = stepped.practice; attackers = stepped.list; if (stepped.killer !== null) killedBy = stepped.killer;
      }
      frameEvents.push(...practice.events); commentator.events(practice.events); if (golden) practice = golden.strike(practice);   // each blow he lands hurts the boss more and spends a golden charge, now
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
        // the ceremony is over, or (freeCamera.stickEndsCeremony) any stick input ends it
        if (!roam) freeRoam = null;
        if (!roam && handsOver(FREE, freeAfterKill || phase.complete || killAge >= ZONE!.startAfterSeconds, !!(intent.x || intent.z || intent.guard || isFreeAction(duelIntent.action)), killAge, intent.guard || isFreeAction(duelIntent.action) ? 0 : phase.stickBeat)) { roam = { ...practice.fighter }; view.stopTour(); }   // finisher-cam.json stickBeatS: a held stick does not end a finisher the camera frames until its whole length has played (0 = at once: ?finishercam=v1, a plain death)
        if (roam) { freeRoam ??= startFreeRoam(practice.duel, ZONE!.walkRadius); const walked = stepFreeRoam(freeRoam, roam, duelIntent, ZONE!.walkRadius); freeRoam = walked.free; state = roam = walked.body; }   // roll, step back and guard on the walk (src/fight/free-roam.ts, data/free-moves.json): idle it is exactly zone-loop.ts roamStep;   // the zone's free walk: past the pit's wall out to data/respawn.json postKill.walkRadiusMetres (the duel sim's RADIUS is untouched)
      }
      if (mobsRun) practice = mobsRun.tick(practice, roam && freeRoam ? freeRoam.duel.fighters[0] : practice.duel.fighters[0], step());   // trash mobs (data/mobs.json): the hero's blow on them, theirs on him
      accumulator -= step();
      // :1656 freeze on the contact tick: the frame ends here, the leftover time is dropped, the frozen frames show the contact tick's bodies
      const stop = stopFor(practice.events);
      if (stop) { hitStop = stop; accumulator = 0; previous = state; }
    }
  } else { accumulator = 0; previous = state; }
  if (ZONE) setWalkClamp(roam ? ZONE.walkRadius + ZONE.cameraMetres : 0);   // the follow camera stands behind a hero who walked beyond the pit (data/respawn.json postKill.cameraMetres); the fight camera is unchanged
  (globalThis as { __v3FreeHero?: unknown }).__v3FreeHero = roam && freeRoam ? freeRoam.duel.fighters[0] : null;   // the walking hero's roll/guard fighter (tests, stills)
  (globalThis as { __v3Roam?: State | null }).__v3Roam = roam;   // the stills read the hero's walk after the kill (scripts/roam-stills.mjs)
  (globalThis as { __v3Yaw?: number }).__v3Yaw = +view.yaw.toFixed(4);
  (globalThis as { __v3FreeShare?: number }).__v3FreeShare = +view.freeShare.toFixed(3);   // the stills read how far the camera has swung to the free follow camera (scripts/free-camera-stills.mjs)
  (globalThis as { __v3Fight?: Practice }).__v3Fight = practice;   // the stills read the sim's state here (scripts/foe-stills.mjs), as they read __weaponShapes
  const alpha = accumulator / step();
  if (multi) {   // every live attacker stays in frame: the lock backs off by framingWiden, eased; the dead lie where they fell and no longer count; with none it snaps back to exactly 1
    const aim = framingWiden({ x: (state.x + practice.enemy.x) / 2, z: (state.z + practice.enemy.z) / 2 }, attackers.filter((a) => !a.dead).map((a) => a.practice.enemy), ATTACKERS.camera, cameraZoom(FIGHT.camera.zoom, search) * view.lensBoost), rows = ATTACKERS.camera;
    widen += (aim - widen) * (1 - Math.exp(-dt / rows.easeSeconds));
    if (aim === 1 && widen - 1 < 1 / 1000) widen = 1;
    view.setWiden(widen);
  }
  if (roam && bossLoadAfterKill(location.search)) bossKilled = true;   // the first kill's roam has started: far bosses are fetched and stand at their spots (respawn.json world.loadAfterKill, ?bossload=v1 off)
  if (ZONE) view.holdBody(spawns[current], withinLoad(spawns[current]!, state, undefined, bossKilled));   // [held-body] (a body not yet fetched is fetched only once the hero is within respawn.json world.loadWithinMetres of the spawn) the live foe wears the body of the spawn the sim holds (scene.ts, held-body.ts); the default (every spawn the Minotaur) builds nothing
  if (ZONE) { const look = ringLook(Math.hypot(state.x, state.z)); view.ringLook(look.tintA, look.tintB, look.t, look.plates); }   // the biome ring's ground tint and sky-plate weights by the hero's distance from the pit (data/rings.json); ring 1 is today's look
  if (ZONE) { view.liveFoes(attackers.map((a) => ({ id: spawns[a.index]!.id, practice: a.practice, spawn: spawns[a.index]!, star: starById[spawns[a.index]!.id] ?? 0 }))); }
  if (ZONE) view.liveStar(starById[spawns[current]!.id] ?? 0);   // the attackers' rigs (a killed one lies until its timer is up)
  if (ZONE) { view.idleFoes(idleOnes(spawns, current).filter((s) => !attackers.some((a) => spawns[a.index] === s)).map((s) => ({ x: s.x, z: s.z, heading: Math.atan2(state.x - s.x, state.z - s.z), id: s.id, spawn: s, star: starById[s.id] ?? 0, near: withinLoad(s, state, undefined, bossKilled) }))); zoneDebug(); }   // the other standing bosses, facing the hero
  if (FREE && heroStands() && !freeAfterKill && (roam || view.finishPhase().complete || killAge >= ZONE!.startAfterSeconds)) freeAfterKill = true;   // latched for this kill: the rig's finish age restarts once its finisher camera lets go
  // the camera follows the hero: free when nobody fights him and after a kill, the lock only in a fight
  freeNow = wantsFreeCamera(FREE, { finished: !!practice.finish, heroStands: heroStands(), ceremonyOver: freeAfterKill, roaming: roam !== null, engaged, broken: lockState.broken });
  // a fight (or a pause) drops the look finger and its glide cleanly; the walk's move already reads view.yaw, so the stick stays camera-relative as the view turns
  if (look) { if (freeNow && !paused()) view.lookYaw(-look.step(dt)); else if (paused() || look.active === null || !heroStands()) look.cancel(); }   // a finger held down through the kill's ceremony is kept (its drag hands the camera over); a fight or a pause drops it
  view.render(
    { ...state, x: previous.x + (state.x - previous.x) * alpha, z: previous.z + (state.z - previous.z) * alpha, heading: previous.heading + wrapAngle(state.heading - previous.heading) * alpha },
    locked, paused() ? 0 : dt, roam && freeRoam && freeRoam.duel.fighters[0].phase !== 'ready' ? { ...practice, duel: { ...practice.duel, fighters: [freeRoam.duel.fighters[0], practice.duel.fighters[1]] } } : practice, frameEvents, hitStop > 0, epoch, identity(), roam !== null, freeNow,
  );
  frameEvents = [];
  shareClip.frame(engaged);   // right after the render: the arena canvas into the clip buffer
  if (engaged) radar?.stopFlash();   // the next fight began: the kill flash ends
  radar?.frame(state.x, state.z, view.yaw);
  golden?.step(state, practice.playerHealth > 0);
  if (crHud && PROG?.save) { const p = PROG.save.pile; crHud.marker(p && view.projectInto(p.x, 0.15, p.z, pileXY) ? pileXY : null,p && !heroDied() ? Math.hypot(p.x - state.x, p.z - state.z) : 99, crClock); crHud.coins(PROG.save.coins, PROG.save.banked); }   // (dead on the spot, the marker stays full: it shows where he fell)
  updateHud();
  requestAnimationFrame(frame);
}
const shareClip = mountShareClip({ source: canvas, audio: () => feedback.stream(), untap: () => feedback.untap(), telemetry });   // Share clip (data/share-clip.json); event v3:clip-moment is the hook for the Pit modes
nameOpponent();
updateHud();
const radarOrigin = ZONE ? pitOrigin(zoneFor(search), WORLD) : { x: 0, z: 0 };   // the radar (data/radar.json): bosses at their live spots, other players from the presence handle; hero and yaw come in per frame
const radarLive = (i: number) => { if (i === current) return practice.enemy; for (let k = 0; k < attackers.length; k++) if (attackers[k]!.index === i) return attackers[k]!.practice.enemy; return undefined; };   // a boss in a fight is at its sim position, the rest at their spots
const radar = ZONE && radarOn(search) ? mountRadar(document, { each: (emit) => { bossBlips(RADAR, spawns, radarLive, emit); playerBlips((window as unknown as { __v3Presence?: Parameters<typeof playerBlips>[0] }).__v3Presence, performance.now(), radarOrigin, emit); if (CR) pileBlip(PROG?.save?.pile, emit); if (golden) goldenBlips(golden.items(), emit); mobsRun?.radar(state.x, state.z, emit); } }) : null;
(globalThis as { __v3Radar?: unknown }).__v3Radar = radar;   // debug handle for the stills (armFlash / stopFlash / flashPhase), like __v3Zone
let buildLabel = '';
fetch('./build.txt?v=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).then((t) => { buildLabel = t.slice(0, 7); element('build').textContent = buildLabel; }).catch(() => {});
// ?snd=1: the audio state beside the build label, e.g. "f297c4e running+sprite+keep 12" (context, sprite decoded, silent clip, cues played)
if (snd === '1') setInterval(() => { element('build').textContent = `${buildLabel} ${feedback.state()}${keep.playing() ? '+keep' : ''}`; }, SOUND.statusMs);
// Other players (data/presence.json, src/presence/chunk.ts): OFF unless the link has ?presence=1 or ?presence=ws(s)://... Then the client chunk (its own file, nothing in this bundle) joins the presence
// service; the handle is on window.__v3Presence for the scene wiring step and the browser checks (remotes(), on(), self(), state()). Others have no collider and play no part in the fight.
// Shared boss health (data/zone-client.json, src/zone/shared-hp-chunk.ts, docs/ZONE-CLIENT-CONTRACT.md): OFF unless the link has ?sharedhp=1 or ?sharedhp=http(s)://... Then the chunk (its own file, nothing in this bundle) makes the handle on
// window.__v3SharedHp. INERT in this step: nothing feeds it sim events and nothing draws its bar; the sim's own health stays the truth of the fight (the wiring PR connects it).
if (/[?&]sharedhp=/.test(search)) void import('../zone/shared-hp-chunk.ts').then((m) => { (window as unknown as { __v3SharedHp?: unknown }).__v3SharedHp = m.startSharedHp({ search, location }); }).catch(() => {});
if (/[?&]presence=/.test(search)) void import('../presence/chunk.ts').then((m) => { const origin = ZONE ? pitOrigin(zoneFor(search), WORLD) : undefined; if (!m.zoneFrameOk(origin)) return void console.warn('presence: this page\'s pit origin is not the service spawn row (data/presence.json spawn), so presence stays off'); (window as unknown as { __v3Presence?: unknown }).__v3Presence = m.startZonePresence({ search, location, hero: () => state, spawn: () => view.spawnRemote(), origin }); }).catch(() => {});   // startZonePresence also installs globalThis.__v3HeroPose and draws the others (src/presence/draw.ts)
requestAnimationFrame(frame);
