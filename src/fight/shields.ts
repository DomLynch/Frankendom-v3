// The painted shields (GPT job 5, 2026-09-30; Strategy's shield brief): one file per carrier and rank band, `public/shields/<stem>-<band>.glb`,
// loaded after the fight is playable (never part of a fight's load) and hung on the carrier's off hand through the shield carry (characters.ts
// SHIELD_CARRY). A shield GLB is one mesh, upright, face +Z, origin at the grip (scripts/shield-fit-check.mjs states the delivery format).
import { bandOf } from './weapon-shapes.ts';

// The carriers that have shield files, and the stem their files carry: the Centurion is the `veteran` rig. Both sets ship, so the old `?shields=on` link flag is gone: an old shared link that still carries it simply loads the same shields.
export const SHIELD_STEM: Readonly<Record<string, string>> = { shieldmaiden: 'shieldmaiden', veteran: 'centurion' };
// Strategy 2026-10-01 (conformance to Dom's brief): both sets ship. Opt-out is one line: make this `new Set()`.
export const SHIPPING_SHIELDS: ReadonlySet<string> = new Set(Object.keys(SHIELD_STEM));
// The Centurion has no rank-1 shield (his trident fights at Recruit). undefined = his own board, as on trunk.
export function shieldFor(opponentId: string, level: number, on: boolean): string | undefined {
  const stem = SHIELD_STEM[opponentId];
  if (!stem || !on || (opponentId === 'veteran' && level < 2)) return undefined;
  return `/shields/${stem}-${bandOf(level)}.glb`;
}
