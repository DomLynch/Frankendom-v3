// LOOK TEST behind `?look=kickclose` (default OFF; Lead + Combat 2026-10-07, on #1582's audit): the KICK light also goes out while the foe is opening the
// gap. Presentation only: the HUD keeps a short rolling gap history; no sim input, no record change. The rule (Combat's probe table is in the PR body):
// lit = gap <= KICK_LANDS (hud.ts) AND NOT (gap grew by more than 0.03 m over the last 4 ticks AND the player was not in the hurt phase in that window).
// The hurt exception is Combat's refinement (a hit's knockback opens the gap without the foe retreating: 124 of the 199 landings the plain rule cost were those). With no sample 4 ticks old yet the foe is not called retreating.
export const kickCloseFlag = (search: string) => (new URLSearchParams(search).get('look') ?? '').split(',').includes('kickclose');

export const KICK_CLOSE_TICKS = 4;
export const KICK_CLOSE_GROWTH = 0.03;   // metres the gap may grow over the window before the light goes out

export function createGapHistory() {
  let samples: { tick: number; gap: number; hurt: boolean }[] = [];
  return {
    // One sample per sim tick (a repeated tick overwrites); a tick that goes backwards is a new fight or a replay seek: start over.
    record(tick: number, gap: number, hurt = false) {
      const last = samples[samples.length - 1];
      if (last && tick < last.tick) samples = [];
      if (last && tick === last.tick) samples[samples.length - 1] = { tick, gap, hurt: hurt || last.hurt };
      else samples.push({ tick, gap, hurt });
      if (samples.length > 16) samples.shift();
    },
    // The newest sample at least KICK_CLOSE_TICKS old is the "4 ticks ago" gap (a frame that carried several ticks skips samples; the older one stands in).
    retreating(tick: number, gap: number): boolean {
      for (let i = samples.length - 1; i >= 0; i--) if (samples[i].tick <= tick - KICK_CLOSE_TICKS) {
        if (samples.slice(i).some(x => x.hurt)) return false;   // the player was hurt somewhere in the window: knockback, not a retreat
        return gap - samples[i].gap > KICK_CLOSE_GROWTH + 1e-9;   // the epsilon: 1.03 - 1.0 is 0.030000000000000027 in floats, and exactly 3 cm is not more than 3 cm
      }
      return false;
    },
  };
}
