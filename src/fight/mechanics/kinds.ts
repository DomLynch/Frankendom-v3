// Which boss kind has which mechanic: data/rings.json bosses[].mechanic (null = none). Kept apart from registry.ts because the sim reads the registry and imports no data/ json (the Gate 0 copy of the tree
// is `src/` alone); only the driver-side spawn-kind.ts reads this.
import RINGS from '../../../data/rings.json' with { type: 'json' };

const KINDS = new Map<string, string>((RINGS.bosses as { kind: string; mechanic: string | null }[]).flatMap((b) => (b.mechanic ? [[b.kind, b.mechanic] as [string, string]] : [])));
/** The mechanic id of a boss kind, or undefined. */
export const mechanicOf = (kind: string): string | undefined => KINDS.get(kind);
