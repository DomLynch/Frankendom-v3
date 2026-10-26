// How a WORLD creature moves while it fights, as a row per creature kind (Dom, 2026-10-17: creatures twitch on his phone; the Pit's brain re-decides approach / circle / retreat every 0.6-1.3 s, snaps its facing by up
// to 180 degrees in one step and bursts sideways). Strategy's set: stand and face inside reach by default, stop at a share of the creature's own reach with a hysteresis band, a turn-rate cap (attacks exempt), and a
// seeded circle draw per re-decide with a strafe cap that applies only while circling. Donors: EQEmu mob_movement_manager RotateToCommand (a per-mob rotate speed), AzerothCore chase / 2004Scape Npc.ts (walk to
// range, stop, face, no strafing), Veloren (circle only close in). Read only by src/fight/open-fight.ts stepBout, so a Pit duel keeps the brain exactly as it was; a kind with no row also keeps it. A sim file.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import MOTION_DEFS from './creature-motion-defs.json' with { type: 'json' };
import MOTION_MANIFEST from './creature-motion-defs.manifest.json' with { type: 'json' };

/** circleChance: the chance (0-1), per re-decide, that it circles instead of standing (0 = never; then no strafe is read); circleWithinM: it circles only inside this many metres of the hero; stopAtReach: it stops walking in at this share
 *  of its own cut's reach; reapproach: it walks in again only past this share of reach (the hysteresis band); holdRedecideScale: while held inside its stop band the brain's re-decide interval is multiplied by this (a Combat addition to
 *  Strategy's set, acked: without it flips stay 0.19-0.30/s); turnRateCapRadPerS: the most its facing turns per second outside an attack (radians; pi = 180 degrees); circleRedecideMinS / MaxS: the seconds between circle draws;
 *  strafeSpeedCapMps: the most its sideways speed while circling, metres per second (0 = no cap). */
export type CreatureMotion = { readonly id: string; readonly circleChance: number; readonly circleWithinM: number; readonly stopAtReach: number; readonly reapproach: number; readonly holdRedecideScale: number; readonly turnRateCapRadPerS: number; readonly circleRedecideMinS: number; readonly circleRedecideMaxS: number; readonly strafeSpeedCapMps: number };
const TABLE = tableFromFile(MOTION_MANIFEST.tables[0] as unknown as Manifest, MOTION_DEFS, 'creature-motion-defs.json');
loadRegistry([TABLE]);
export const CREATURE_MOTIONS: readonly CreatureMotion[] = (TABLE.rows as unknown as CreatureMotion[]).map((r) => {
  if (r.circleChance < 0 || r.circleChance > 1 || r.circleWithinM <= 0 || r.stopAtReach <= 0 || r.reapproach < r.stopAtReach || r.holdRedecideScale < 1 || r.turnRateCapRadPerS <= 0 || r.circleRedecideMinS <= 0 || r.circleRedecideMaxS < r.circleRedecideMinS || r.strafeSpeedCapMps < 0) {
    throw Error(`creature-motion-defs "${r.id}": circle chance 0-1, circle range above 0, stop above 0, re-approach at or past the stop, a re-decide scale from 1, a positive turn cap, re-decide seconds ordered, strafe cap from 0`);
  }
  return r;
});
export const motionOf = (kind: string): CreatureMotion | undefined => CREATURE_MOTIONS.find((m) => m.id === kind);
