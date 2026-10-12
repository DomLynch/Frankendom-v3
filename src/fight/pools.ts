// Resource pools as data (Combat, core, 2026-10-12): the ceilings a fighter starts a duel with are a per-character row value, not literals in the duel.
// Health and stamina are read by the sim today (createFighter); mana and focus are DATA ONLY for now: a row may name them, the Fighter has no field for them yet (a new
// field would change hashed state), and the magic resource work reads them when it lands. Every default equals what the duel always used, so a row without `pools` fights byte for byte as before.
export type Pools = { health: number; stamina: number; mana: number; focus: number };
export const STAMINA_START = 100;   // the stamina every fighter began with (and its ceiling) before pools were data
/** The pools a fighter starts with: the row's own values, else today's (`health` is the caller's existing default: RULES.health for a man, the opponent row's health for a creature). */
export const poolsOf = (health: number, own?: Partial<Pools>): Pools => ({ health: own?.health ?? health, stamina: own?.stamina ?? STAMINA_START, mana: own?.mana ?? 0, focus: own?.focus ?? 0 });
