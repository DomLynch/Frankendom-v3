// The character driver's pose styles as rows (character-style-defs.json; the Combat sandbox's CS31, Dom 2026-10-18: "whatever is in the sandboxes for the 2 devs is approved by me ... get it migrated and deployed
// into the main game"). Donor: combat sandbox @93b1138c7. Presentation only, read by characters.ts after the mixer; none of it is read by the sim, a record or the digest. Everything is OFF by default:
//  - `?ready=1|2|3` picks a readyStyles row (radians per mille, added to the lower, middle and upper spine and the neck while the fighter stands armed and calm; negative = back/up);
//  - `?hurt=1|2|3` picks a hurtStyles row (`weight`: per-mille of the recorded Hit clip that stays, the rest is the standing pose; s1 / s2 lean the spine, `twist` turns the lower spine);
//  - the `posture` row's `plain` flag, true = no procedural posture on top of the recorded clips (no tired hunch and sagging sword arm, no open-stagger lift and lean, no charge lean, no stance silhouette; guard tilt and the finishers stay).
// No query and plain false = the character exactly as it was.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import DEFS from './character-style-defs.json' with { type: 'json' };
import MANIFEST from './character-style-defs.manifest.json' with { type: 'json' };

export type ReadyStyle = { readonly id: string; readonly s1: number; readonly s2: number; readonly s3: number; readonly neck: number };
export type HurtStyle = { readonly id: string; readonly weight: number; readonly s1: number; readonly s2: number; readonly twist: number };

loadRegistry((MANIFEST.tables as unknown as Manifest[]).map((m) => tableFromFile(m, DEFS, 'character-style-defs.json')));

export const READY_STYLES: readonly ReadyStyle[] = DEFS.readyStyles;
export const HURT_STYLES: readonly HurtStyle[] = DEFS.hurtStyles;
export const PLAIN_POSTURE: boolean = DEFS.posture[0]!.plain;

/** The row a `?ready=` / `?hurt=` query names, or undefined (no query, or an id with no row = today's pose). */
export const pickStyle = <T extends { readonly id: string }>(rows: readonly T[], key: 'ready' | 'hurt', search: string): T | undefined => {
  const want = new URLSearchParams(search).get(key);
  return want === null ? undefined : rows.find((r) => r.id === want);
};
