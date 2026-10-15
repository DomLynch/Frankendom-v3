import { decide } from './ai.ts';
import type { AiState } from './ai.ts';
import type { Duel, Intent, Side } from './duel.ts';
import type { AiProfile } from './moves.ts';
import { HOLD_BACK, HOLD_BACK_ON, HOLD_FORWARD, HOLD_MARGIN, HOLD_ONLY_IN_OPENING, bestRange } from './bands.ts';
import { TACTIC_ROWS } from './tactic-rows.ts';
import { timing, type Fighter } from './duel.ts';

// The AI's holdBand (spec docs/specs/combat/positioning-gates.md, Strategy: the archetype tries to stand in its weapon's band, so the AI makes the same choice the player makes). A WRAPPER over ai.ts decide(), not an
// edit of it: when the duel has bands on and the profile names a tactic row with `holdBand`, and the warden has committed no action this tick, its walk is replaced by a step in (outside the best band), a step back
// (inside it), or none (in it). It adds no move and no timing and draws no random number. A duel without bands, or a profile without the row, returns decide()'s answer untouched, byte for byte.
// The step speeds are rows (band-defs.json holdForward / holdBack): the same fractions of walking speed decide() uses to close in and to give ground.
// The windows the warden already reads as an opening (ai.ts `opening`: a stagger it has had time to notice, an exhausted or exposed foe, a swing whose active window has passed without landing).
// Strategy's ruling: the AI crosses a band only in these, never at will, so crossing has a cost: the long weapon's answer is the stop-hit on a walk-in (duel.ts).
const inOpening = (foe: Fighter, profile: AiProfile): boolean => (foe.phase === 'hurt' && foe.age >= profile.reaction) || foe.exhausted || foe.exposed > 0
  || (foe.phase === 'attack' && !foe.landed && foe.age - timing(foe).windup - timing(foe).active >= profile.reaction);
export function decideBanded(duel: Duel, me: Side, ai: AiState, profile: AiProfile): { intent: Intent; ai: AiState } {
  const out = decide(duel, me, ai, profile);
  if (!duel.bands || !profile.tactic || !TACTIC_ROWS[profile.tactic]?.holdBand || out.intent.action !== null || out.ai.mode === 'guard') return out;
  const self = duel.fighters[me], foe = duel.fighters[(1 - me) as Side], range = bestRange(self.weapon);
  if (!range) return out;
  const dx = foe.body.x - self.body.x, dz = foe.body.z - self.body.z, gap = Math.hypot(dx, dz);
  if (!(gap > 0) || (HOLD_ONLY_IN_OPENING && !inOpening(foe, profile))) return out;
  const forward = gap > range[1] + HOLD_MARGIN ? HOLD_FORWARD : HOLD_BACK_ON && gap < range[0] - HOLD_MARGIN ? -HOLD_BACK : 0, ux = dx / gap, uz = dz / gap;
  if (forward === 0) return out;   // in the band or its dead zone: decide()'s own walk stands
  return { ...out, intent: { ...out.intent, move: { ...out.intent.move, x: ux * forward, z: uz * forward } } };
}
