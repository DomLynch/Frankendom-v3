import { HEAVY_CLASS } from './clash-sparks.ts';
import type { CombatEvent } from './duel.ts';

// Presentation only: what a contact does to the camera. A landing blow drops the camera and shoves it a little along the blow; a block
// rocks it less; a parry flicks it sideways with the deflection. Metres, seconds. Readable brutality: the frame shifts by a few pixels
// and settles in under a quarter second — the guard shudders, the screen never shakes. `null`: this event moves nothing.
export type Shove = { along: number; drop: number; side: number; hold: number; settle: number; screen?: number; push?: number };   // screen / push: metres along the camera's right / view (hit-impact.ts)
export function shoveFor(event: CombatEvent): Shove | null {
  const heavy = !!event.charged || HEAVY_CLASS.has(event.move ?? '');
  switch (event.type) {
    case 'GuardBroken': return { along: 0.05, drop: 0.06, side: 0, hold: 2 / 60, settle: 0.22 };
    case 'Hit': return heavy ? { along: 0.05, drop: 0.06, side: 0, hold: 2 / 60, settle: 0.22 } : { along: 0.02, drop: 0.012, side: 0, hold: 0, settle: 0.15 };
    case 'Parried': return { along: 0.01, drop: 0.008, side: event.move === 'light_left' ? -0.02 : 0.02, hold: 0, settle: 0.12 };
    case 'Blocked': return heavy ? { along: 0.02, drop: 0.028, side: 0, hold: 1 / 60, settle: 0.18 } : { along: 0.012, drop: event.perfect ? 0.014 : 0.01, side: 0, hold: 0, settle: 0.12 };
    default: return null;
  }
}
