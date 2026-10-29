// Which boss kind has which mechanic: data/rings.json bosses[].mechanic (null = none). Kept apart from registry.ts because the sim reads the registry and imports no data/ json (the Gate 0 copy of the tree
// is `src/` alone); only the driver-side spawn-kind.ts reads this.
import RINGS from '../../../data/rings.json' with { type: 'json' };
import { SIM_HOOKS } from './sim-hooks.ts';

// Only a mechanic with sim hooks rides the Opponent (the duel calls it); the page-level ones (Gourd, King, Nan) are stepped by the page from index.ts and never touch the fighter.
const KINDS = new Map<string, string>((RINGS.bosses as { kind: string; mechanic: string | null }[]).flatMap((b) => (b.mechanic && Object.hasOwn(SIM_HOOKS, b.mechanic) ? [[b.kind, b.mechanic] as [string, string]] : [])));
/** The sim-hook mechanic id of a boss kind, or undefined. */
export const mechanicOf = (kind: string): string | undefined => KINDS.get(kind);
