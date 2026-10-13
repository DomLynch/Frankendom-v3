// The Loadout shape, its identity and its caps: the part of gear-stats.ts the simulation reads (the open-world loop, world.ts, and the world record). Pure data with no imports, so it can sit inside the sim
// boundary (tests/sim-boundary.test.ts) while gear-stats.ts, which reads the loot ledger, stays outside. gear-stats.ts re-exports all three: nothing else moved.
// The two multipliers a fight is fought with. Both scale damage — Attack what you deal, RES what you take, chip included — and
// neither touches posture (`shake`) or any timing.
//
// A record of multipliers rather than a fixed pair by design: brief 19 asks for a shape the Origin character layer EXTENDS rather than
// replaces. That layer resolves item ids plus an approved allocation into the same kind of object, and its stats join as further
// fields without this table changing.
export type Loadout = { attack: number; res: number };
// No gear: the exact identity. Every number here is what the game does today, so a naked loadout must be a no-op at the seam and a
// naked fight must replay byte-identical to a record made before stats existed (that is deliverable 2's flag, proved against this).
export const NAKED: Loadout = { attack: 1, res: 1 };

// What a full Origin set is worth. Attack gets the smaller range on purpose (brief 19): raw damage is what kill timings, finisher
// windows and the fight-length pins are measured against, so it moves least.
export const CAPS = { attack: 1.15, res: 0.80 } as const;
