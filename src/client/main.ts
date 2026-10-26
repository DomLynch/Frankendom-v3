// V3's driver: V1's duel (src/fight, lifted as it is) on V2's stage. It replaces V1's main.ts (1,765 lines) with the parts the one fight
// needs, in V1's own order: the career fight's start (match.ts begin), the fixed-step accumulator with the hit-stop hold, stepPractice on the
// quantized intent, the per-tick sound and HUD calls, the interpolated draw. No accounts, ladder, legends, loot, records, replays, PvP, coach
// or menus. Every number is a V1 row or a data/fight.json row; line refs are V1 src/main.ts @ 82a994d15.
import FIGHT from '../../data/fight.json' with { type: 'json' };
import BRAINS from '../../data/brains.json' with { type: 'json' };
import { brainFor, brainProfile } from '../brain.ts';
import SOUND from '../../data/sound.json' with { type: 'json' };
import { initialPractice, stepPractice, type CombatEvent, type Practice } from '../fight/combat.ts';
import { OPPONENTS, RULES, opponentAt, profileAt, weaponOf, type SkillId, type WeaponId } from '../fight/moves.ts';
import type { Fighter } from '../fight/duel.ts';
import { quantizeIntent } from '../fight/record.ts';
import { recordSpecials } from '../fight/replay.ts';
import { wrapAngle } from '../fight/sim.ts';
import { playScaleFor, setLateNotice, setPlayScale } from '../fight/play-radius.ts';
import { setStab } from '../fight/stab-rule.ts';
import { setStanceRows } from '../fight/stance-era.ts';
import type { PickedStance } from '../fight/stance.ts';
import { createScene } from '../fight/scene.ts';
import { setLockFrame } from '../fight/camera.ts';
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
import { bareName, resolveFinisher, type OpponentId } from '../roster.ts';
import { stopFor } from '../hit-stop.ts';
import { lockPageZoom } from '../zoom-guard.ts';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;   // :84
const search = location.search;
const canvas = element<HTMLCanvasElement>('world');
const opponentId = FIGHT.opponent as OpponentId, opponent = OPPONENTS[opponentId], level = FIGHT.level;
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
const hud = createHud(element);
mountManaBar();

// The fight (match.ts begin('career') :144-176 for a guest at level 1): the live era flags, then initialPractice on the career's picks.
let seed = FIGHT.seed, epoch = 0;
const nextSeed = (s: number): number => (Math.imul(s, 1664525) + 1013904223) >>> 0;   // match.ts:75
function fresh(): Practice {
  setPlayScale(playScaleFor(opponentId, Infinity)); setLateNotice(true); setStab(true); setStanceRows(true);
  epoch++;
  return initialPractice(seed, opponentAt(opponent, level), FIGHT.weapon as WeaponId, FIGHT.skill as SkillId,
    recordSpecials({ specials: FIGHT.specials, level, opponent: opponentId }), undefined, FIGHT.stance as PickedStance,
    undefined, undefined, undefined, undefined, undefined, FIGHT.skill2 as SkillId);
}
let practice = fresh(), frameEvents: CombatEvent[] = [];
// the warden's brain: data/fight.json `ai` (a data/brains.json row) over his V1 profile at his level; ?ai=v1 = V1's profile untouched
const aiProfile = brainProfile(profileAt(opponent, level), brainFor(BRAINS.brains, FIGHT.ai, search));
const identity = () => ({ opponent: opponentId, level });   // match.ts specialIdentity, no presets

// :530 the render pair and the accumulator; the camera stays locked (V1's default)
let state = practice.fighter, previous = state, accumulator = 0, hitStop = 0;
const locked = true;
let assetsReady = false, graphicsLost = false;
const step = () => 1 / FIGHT.tempoHz;
const paused = () => !assetsReady || graphicsLost || document.hidden;   // :823 without the welcome card, journal and versus card

// The lock camera: V2's lower, over-the-shoulder framing (data/fight.json camera); ?cam=v1 keeps V1's lock exactly.
if (!/[?&]cam=v1\b/.test(search)) setLockFrame(FIGHT.camera.lift, FIGHT.camera.side);

// :1278 the scene: V1's rigs, camera, effects and finishers; the arena slot holds V2's stage (src/arena-stage.ts via stubs.ts)
const gfxPost = gfxOn(search, FIGHT.gfx) ? () => import('../fight/gfx-lift.ts') : undefined;
const view = createScene(
  canvas,
  (status, kind) => {
    element('art-status').textContent = status;
    assetsReady = kind === 'ready';
    if (kind === 'ready') view.startStandoff();
  },
  opponentId, undefined, FIGHT.weapon as WeaponId, () => {}, level, undefined, undefined, gfxPost,
);
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
  const label = element('opponent-name'), name = bareName(opponentId);
  label.textContent = `THE ${name.toUpperCase()}`; label.dataset.mobile = name;
}
// :892 nextFight → match.rematch → began: the same warden, the next seed
function rematch() {
  seed = nextSeed(seed); practice = fresh(); frameEvents = [];
  clearInput(); state = previous = practice.fighter;
  view.restartStandoff(); updateHud();
}
element('reset-button').addEventListener('click', rematch);

function updateHud() {   // :684, the career fight's view
  hud.update(practice, { controlsReady: assetsReady && !graphicsLost, debug: false, opponentId, practiceOnly: false });
  const phase = practice.finish ? view.finishPhase() : null, hushed = !phase?.settled;
  document.documentElement.classList.toggle('endgame-fade', !!phase && (hushed || phase.touring));
  document.documentElement.classList.toggle('endgame-hush', !!phase && hushed);
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
      practice = stepPractice(practice, quantizeIntent({ move: { x: intent.x, z: intent.z, yaw: view.yaw, run: intent.run }, action: intent.action, guard: intent.guard,
        guardDirection: intent.guardDirection ?? undefined, held: intent.held, lock: locked, cancel: intent.cancel }), aiProfile);
      frameEvents.push(...practice.events);
      // :1552 the death's sound follows the renderer's own finisher pick
      const weapons = [practice.duel.fighters[0].weapon, practice.duel.fighters[1].weapon] as const;
      const pick = executionPick(hamstrungPick(null, view.hamstrungInstalled()), view.executionInstalled());
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
      accumulator -= step();
      // :1656 freeze on the contact tick: the frame ends here, the leftover time is dropped, the frozen frames show the contact tick's bodies
      const stop = stopFor(practice.events);
      if (stop) { hitStop = stop; accumulator = 0; previous = state; }
    }
  } else { accumulator = 0; previous = state; }
  const alpha = accumulator / step();
  view.render(
    { ...state, x: previous.x + (state.x - previous.x) * alpha, z: previous.z + (state.z - previous.z) * alpha, heading: previous.heading + wrapAngle(state.heading - previous.heading) * alpha },
    locked, paused() ? 0 : dt, practice, frameEvents, hitStop > 0, epoch, identity(),
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
requestAnimationFrame(frame);
