// V3 (audit C, 2026-10-29): a blow's knockback is whole steps. V1 looped `k < knockback`, so a fraction became a whole extra step: a glancing (off-band, x0.4) thrust of 3 shoved
// ceil(1.2) = 2 steps, a kick of 6 shoved ceil(2.4) = 3, and a sliver under half a step still shoved one and could count as a wall impact. The two special-reaction shoves in duel.ts
// already round; with this flag on the blow's own shove does too (Math.round: 1.2 -> 1, 2.4 -> 2, 0.4 -> 0 = no shove and no wall impact; a whole number is unchanged).
//
// A leaf of the simulation (no imports), an ERA flag like special-terms.ts: OFF unless a driver sets it, so a headless run (Gate 0's V1-vs-V3 replays) steps V1's ceil byte for byte (forced
// rounding moved 46 of 56 V1-vs-V3 rows: V1 is the reference, so those cannot be re-pinned). src/client/main.ts sets it from data/fight.json `knockRound`; `?knock=v1` leaves it off. The fight
// record stamps it (era-flags.ts), so a replay steps the shove the page played.
export type KnockRoundRow = { readonly round: boolean };
export let KNOCK_ROUND = false;
export function setKnockRound(on: boolean): void { KNOCK_ROUND = on; }

/** True when the page rounds a blow's shove: the data row says `round: true` and the link is not `?knock=v1`. */
export function knockRoundFor(row: KnockRoundRow | undefined, search = ''): boolean {
  if (new URLSearchParams(search).get('knock') === 'v1' || !row) return false;
  if (typeof row.round !== 'boolean') throw new Error(`knockRound round ${String(row.round)} is not a boolean`);
  return row.round;
}

/** Whole shove steps for a blow of `knockback` (may be fractional: a glancing blow's knockback times its band factor). Flag off = V1's ceil (a positive fraction is a whole step); on = rounded. */
export const shoveSteps = (knockback: number): number => (KNOCK_ROUND ? Math.round(knockback) : Math.ceil(knockback));
