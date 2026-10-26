// How long a frame's contacts hold the presentation clock, in ms. One owner: main.ts draws with it and scripts/impact-preview.mjs reproduces the same freeze.
// The lengths are rows (hit-stop-rules.json); a landed kick, and the extra frames a hit's impact tier adds, come from hit-impact.ts. Wall-clock presentation only: the sim never reads this.
import type { CombatEvent } from './fight/combat.ts';
import { KICK, impactStopMs, landedKick } from './fight/hit-impact.ts';
import { HEAVY_MOVES } from './fight/hud.ts';
import { HEAVY_BLOCK, HEAVY_HIT, HIT_STOP } from './hit-stop-rules.ts';

export function stopFor(events: readonly CombatEvent[]): number {
  if (events.some(landedKick)) return KICK.stopMs;   // a landed kick's beat is 2 frames in all (hit-impact.ts KICK)
  let ms = 0;
  for (const e of events) {
    const base = HIT_STOP[e.type] ?? 0;
    if (!base) continue;
    const heavy = !!e.charged || HEAVY_MOVES.has(e.move ?? '');
    ms = Math.max(
      ms,
      e.type === 'Hit' && heavy ? HEAVY_HIT : e.type === 'Blocked' && heavy ? HEAVY_BLOCK : base,
    );
  }
  return ms + impactStopMs(events);
}
