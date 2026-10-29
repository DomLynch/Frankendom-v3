// The hit-stop lengths (ms the presentation clock holds on a contact) are rows in hit-stop-rules.json; main.ts stopFor reads them by event type.
// Wall-clock presentation only: the simulation never reads this file (it is not in the SIM list). Each export keeps the shape main.ts held.
import RULES from './hit-stop-rules.json' with { type: 'json' };
import type { CombatEvent } from './fight/combat.ts';

const ms = (rows: { id: string; ms: number }[]): Record<string, number> => Object.fromEntries(rows.map((r) => [r.id, r.ms]));
export const HIT_STOP: Partial<Record<CombatEvent['type'], number>> = ms(RULES.stop);
const HEAVY = ms(RULES.heavy);
export const HEAVY_HIT = HEAVY['Hit']!, HEAVY_BLOCK = HEAVY['Blocked']!;   // a heavy-class contact stops longer whether it lands or is blocked
