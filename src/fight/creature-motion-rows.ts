// How a WORLD creature moves while it fights, as a row per creature kind (Dom, 2026-10-17: creatures twitch on his phone; the Pit's brain re-decides approach / circle / retreat every 0.6-1.3 s,
// snaps its facing by up to 180 degrees in one step and bursts sideways). Donors: EQEmu mob_movement_manager RotateToCommand (a per-mob rotate speed), AzerothCore chase / 2004Scape Npc.ts (walk to range,
// stop, face, no strafing). Read only by src/fight/open-fight.ts stepBout, so a Pit duel keeps the brain exactly as it was; a kind with no row also keeps it. A sim file (it changes how a world fight plays).
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import MOTION_DEFS from './creature-motion-defs.json' with { type: 'json' };
import MOTION_MANIFEST from './creature-motion-defs.manifest.json' with { type: 'json' };

/** decisionScalePct: the brain's re-decide interval (36-80 ticks) times this percent (300 = 3x, about 1.8-4 s); turnDegPerS: the most the creature's facing turns per second; strafeMaxMps: the most its sideways
 *  speed, metres per second (0 = no cap); standAndFace: 1 = in 'circle' mode inside reach it stands and faces instead of strafing. */
export type CreatureMotion = { readonly id: string; readonly decisionScalePct: number; readonly turnDegPerS: number; readonly strafeMaxMps: number; readonly standAndFace: number };
const TABLE = tableFromFile(MOTION_MANIFEST.tables[0] as unknown as Manifest, MOTION_DEFS, 'creature-motion-defs.json');
loadRegistry([TABLE]);
export const CREATURE_MOTIONS: readonly CreatureMotion[] = (TABLE.rows as unknown as CreatureMotion[]).map((r) => {
  if (r.decisionScalePct < 100 || r.turnDegPerS <= 0 || r.strafeMaxMps < 0 || (r.standAndFace !== 0 && r.standAndFace !== 1)) throw Error(`creature-motion-defs "${r.id}": scale from 100 percent, a positive turn rate, strafe cap from 0, standAndFace 0 or 1`);
  return r;
});
export const motionOf = (kind: string): CreatureMotion | undefined => CREATURE_MOTIONS.find((m) => m.id === kind);
