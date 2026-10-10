import type { Finish } from './duel.ts';
import type { WeaponId } from './moves.ts';

// Finishers & gore v1 (owner-authorized 2026-09-17, GAME_SPEC "Owner-authorized finishers & gore"). The simulation decided
// the kill already: selection is a pure function of the Killed event's data (victim, location, move, heading) and the
// fighters' weapons — it consumes no simulation state, no wall clock, no randomness, so the same duel replays the same
// finisher. v1 has no weapon-dependent row (one table for every weapon); the weapons argument pins the contract for the
// per-weapon rows a later pass may add. Presentation falls back to the plain Death clip for any finisher whose clip has
// not shipped yet (ship order: Split Crown end-to-end first, then the set).
export type FinisherId = 'splitCrown' | 'decapitation' | 'runThrough' | 'plainDeath' | 'quietOne' | 'opened' | 'hamstrung' | 'execution';

// The beta rotation pool (owner 2026-09-20): five outcomes, evenly drawn (measured 19.6–20.6 % each over 20 000 kill events).
export const ROTATION = ['splitCrown', 'decapitation', 'runThrough', 'plainDeath', 'opened'] as const satisfies readonly FinisherId[];

// `previous` is the ceremony the last fight actually showed (owner 2026-09-20: "the same finish can't appear twice in a
// row — keeps it fresh"). It is excluded from the pool for this kill; the pick stays a pure function of the kill event
// and that one presentation fact, so a replay with the same history is identical. null = first fight / no ceremony yet.
export function selectFinisher(finish: Finish, weapons: readonly [WeaponId, WeaponId], previous: FinisherId | null = null): FinisherId | null {
  void weapons;   // v1: one table for every weapon — the parameter pins the contract for the per-weapon rows a later pass may add
  if (finish.draw) return null;                  // a double fall gets no ceremony
  if (finish.victim === 0) return null;          // the player's own death keeps the plain fall (v2 review)
  if (finish.move === 'kick') return null;       // kicked to death: no blade, no blade closer, no blood (2026-09-13)
  if (finish.move.startsWith('skill_')) return null;   // a skill kill is a plain death in V1 (docs/briefs/skill-witch-arm.md, Strategy ruling 3); the pommel is the hilt, not the blade
  // Owner rule 2026-09-18 (recorded on PR #112, broadened same day after the owner's live playtest): ANY blade kill plays
  // the finisher — light cut, thrust, riposte, heavy, critical, whatever the sim reports — universal across weapons and
  // characters. Nobody aims in this game, so gating the showpiece behind a blow type the player can't feel guaranteed it
  // never played.
  // Owner 2026-09-18 (after judging v1 on the phone): kills rotate through the SHIPPED SET + the plain death — Split Crown,
  // Decapitation, Run Through, The Quiet One, Opened, or no ceremony at all — picked by a deterministic rotation pool seeded from the kill event
  // (never wall-clock randomness — same duel, same finisher); the pool grows as the remaining finishers land. The plain
  // death staying in the mix is the owner's call: a kill landing on the default fall keeps it frighteningly ordinary.
  const seed = `${finish.victim}|${finish.location}|${finish.move}|${finish.heading}|${weapons[0]}|${weapons[1]}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  // Beta rotation (owner 2026-09-20, simplifying for the freeze): five outcomes — Split Crown, Decapitation, Run Through,
  // Opened, plain death. The Quiet One is out of the automatic pick (too subtle to read on a phone); its clip, pose and
  // gore stay shipped and the dev picker can still force it. Never the previous fight's ceremony again.
  const pool = ROTATION.filter((id) => id !== previous);
  return pool[Math.abs(hash % pool.length)];
}

// Which rigs carry which finisher clip today. null = the plain Death plays until the clip lands (the plain death is also a
// first-class rotation outcome, 'plainDeath'). The pose word is what characters.ts `update` understands. Decapitation reuses
// the Split Crown body collapse (the same straight-down drop); Run Through has its own clip — impaled on the blade, held
// beat gripping it, then kneels with it still embedded. Quiet One clutches the throat and collapses onto its side.
// Opened uses the existing upright jolt, followed by a separately posed waist bake; off keeps the intact collapse.
// Victim clips are 2.4 s, authored per rig and played at 0.75x on the presentation clock.
export const FINISHER_POSE: Record<FinisherId, 'splitCrown' | 'decapitation' | 'runThrough' | 'quietOne' | 'opened' | null> = {
  splitCrown: 'splitCrown',
  decapitation: 'decapitation',
  runThrough: 'runThrough',
  plainDeath: null,
  quietOne: 'quietOne',
  opened: 'opened',
  hamstrung: null,
  execution: null,
};

// How long each finisher actually takes to finish playing, in seconds from the Killed event — MEASURED, one number per
// finisher, never one constant for all of them (Lead brief 2026-09-22, for Web's loot panel).
//
// What the runtime uses: nothing here. The game keys on the event — `view.finishPhase().complete` in src/scene.ts, which
// latches off the scene's own state (the victim's clip has run out, the camera has settled, a severed head has come to
// rest). This table exists so Web can budget a layout against a real figure instead of a guessed delay, and so a drift in
// the ceremony shows up as a changed number here rather than as a panel that lands too early.
//
// How they were measured: `node scripts/finisher-preview.mjs --label finisher-durations --durations`, which plays each
// outcome's REAL captured kill window frame by frame on the production path and records the frame the scene's own latch
// fires on. Measured 2026-09-22 on the Veteran (the harness's default rig, seeds 731–748; The Quiet One is out of the
// automatic rotation, so its window is the dev picker's own path on a real kill, as the harness labels it). Receipt:
// `artifacts/character/finisher-durations/finisher-durations.json`. Re-measure with that command when a clip, the camera
// or the finisher clock changes — the harness asserts the latch fires and agrees with the scene's own finish age.
export const FINISHER_SECONDS = {
  splitCrown: 4.07,
  decapitation: 3.2,
  runThrough: 4.12,
  plainDeath: 2.4,
  quietOne: 3.77,
  opened: 3.2,
} as const satisfies Record<Exclude<FinisherId, 'hamstrung' | 'execution'>, number>;

// Hamstrung and Execution have no clip yet (FINISHER_POSE null): the plain death plays in their place, so their duration is
// DERIVED from the measured plain death, not measured in its own right. Everything else is the measured number above.
export function finisherSeconds(id: FinisherId): { seconds: number; measured: boolean } {
  const measured = (FINISHER_SECONDS as Partial<Record<FinisherId, number>>)[id];
  return measured === undefined ? { seconds: FINISHER_SECONDS.plainDeath, measured: false } : { seconds: measured, measured: true };
}
