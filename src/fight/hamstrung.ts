import { FINISHER_POSE, selectFinisher, type FinisherId } from './finishers.ts';
import type { Finish } from './duel.ts';
import type { WeaponId } from './moves.ts';
import { isHeld, ROSTER, type OpponentId } from '../roster.ts';

// Hamstrung: a paired finisher (Death_Hamstrung on the victim, Fin_Hamstrung on the killer): a low cut at the knee, then a thrust
// into the back. Presentation only. It lives here, not in finishers.ts or roster.ts, because both are in the kill-link guard's
// digest (tests/record-version-guard.test.ts SIM_FILES): wiring it there would force a RECORD_VERSION bump for a change the
// simulation never sees. The pick is unchanged (it is NOT in ROTATION): only the dev picker plays it.

// The authored beats, shared by the offline clip build (scripts/build-hamstrung.mjs) and the runtime. knee/back are fractions of
// `duration` (seconds); `hold` is the hit-stop, in seconds, each blow holds the scene for.
export const HAMSTRUNG_BEATS = { knee: .22, back: .64, duration: 3.8, hold: .07 } as const;

// The bodies that play Hamstrung: every playable (not held) body on the hero rig, the skeleton warrior.glb carries. Their victim clip is
// src/assets/hamstrung-victim-hero.json (built from warrior.glb by scripts/build-hamstrung.mjs, adopted at runtime like the killer's); a body on
// another rig (goblin, nightborn) or a held creature keeps the plain death. minotaur.glb and wraith.glb also carry a Death_Hamstrung of their own
// (fitted to the creatures' feet), reachable the day those bodies are no longer held and this filter admits them.
export const HAMSTRUNG_VICTIMS: readonly OpponentId[] = (Object.keys(ROSTER) as OpponentId[]).filter(id => ROSTER[id].rig === 'hero' && !isHeld(id));
// warrior.glb's pelvis rest length, the one the victim and killer clips were authored on: adoptClip scales the clip's pelvis path by a body's own over this.
export const HAMSTRUNG_SOURCE_PELVIS = .95;

// roster.ts resolveFinisher's rule, widened by one outcome. The picker never overrides kill eligibility (a draw, a kick, a skill kill
// and the player's own death keep no ceremony), and a body without Death_Hamstrung plays no ceremony for it rather than a missing
// clip (roster.ts would pass the pick through for any body that lists no `finishers`). Every other pick is exactly `resolved`.
export function resolveHamstrung(id: OpponentId, finish: Finish, weapons: readonly [WeaponId, WeaponId], override: FinisherId | null, previous: FinisherId | null, resolved: FinisherId | null): FinisherId | null {
  if (override !== 'hamstrung') return resolved;
  return HAMSTRUNG_VICTIMS.includes(id) && selectFinisher(finish, weapons, previous) ? 'hamstrung' : null;
}

// FINISHER_POSE[id] with Hamstrung's pose word added (the table itself stays as it was, for the same reason as above).
export const poseOf = (id: FinisherId): NonNullable<(typeof FINISHER_POSE)[FinisherId]> | 'hamstrung' | null => id === 'hamstrung' ? 'hamstrung' : FINISHER_POSE[id];

// The picker's Hamstrung pick as the scene AND the audio must both read it, decided once per finish: if the clips are not installed by the kill, the
// pick becomes the plain death for the picture and for the cues (src/audio/cues.ts keys on this id), so no knee or back sound plays over a plain fall.
export const hamstrungPick = (pick: FinisherId | null, installed: boolean): FinisherId | null => pick === 'hamstrung' && !installed ? 'plainDeath' : pick;
