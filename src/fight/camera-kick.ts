import { HEAVY_CLASS } from './clash-sparks.ts';
import type { CombatEvent } from './duel.ts';
import { strikeOf } from './move-rows.ts';
import { cameraRule, shoveRow, type ShoveRow } from './camera-rules.ts';

// Presentation only: what a contact does to the camera. A landing blow drops the camera and shoves it a little along the blow; a block
// rocks it less; a parry flicks it sideways with the deflection. Metres, seconds. Readable brutality: the frame shifts by a few pixels
// and settles in under a quarter second — the guard shudders, the screen never shakes. `null`: this event moves nothing.
export type Shove = { along: number; drop: number; side: number; hold: number; settle: number; screen?: number; push?: number };   // screen / push: metres along the camera's right / view (hit-impact.ts)
const FPS = cameraRule('shoveFps');   // data/ camera-rules-defs.json: the frame rate a row's holdFrames are counted at
const shove = (row: ShoveRow, drop = row.drop, side = row.side): Shove => ({ along: row.along, drop, side, hold: row.holdFrames / FPS, settle: row.settle });   // a row of camera-rules-defs.json `shoves`
export function shoveFor(event: CombatEvent): Shove | null {
  const heavy = !!event.charged || HEAVY_CLASS.has(event.move ?? '');
  switch (event.type) {
    case 'GuardBroken': return shove(shoveRow('guardBroken'));
    case 'Hit': return shove(shoveRow(heavy ? 'hitHeavy' : 'hitLight'));
    case 'Parried': { const row = shoveRow('parried'); return shove(row, row.drop, strikeOf(event.move) === 'light_left' ? -row.side : row.side); }   // the left cut or the heavy left cut (its blade is the left cut's)
    case 'Blocked': { const row = shoveRow(heavy ? 'blockedHeavy' : 'blockedLight'); return shove(row, !heavy && event.perfect ? row.dropPerfect ?? row.drop : row.drop); }
    default: return null;
  }
}
