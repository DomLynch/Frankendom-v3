// Gear stats (brief 19, deliverable 1): what a kit is worth, as two multipliers. Data only — nothing here changes a fight yet, and
// `src/loot.ts`'s "visual cosmetics only, no stats" header stands until deliverable 5 puts a Loadout into `stepDuel`.
//
// TWO stats, not four, and the boundary is the point. `docs/progression-direction.md` (owner, 2026-09-19) puts POISE, health (VIG) and
// stamina (END/DEX) in the Origin CHARACTER layer, and has the heavy armour classes COSTING stamina economy rather than granting it.
// So gear carries Attack and RES and nothing else. The first cut of this file had gear granting Poise and a bigger stamina pool, which
// would have put the gear layer in direct contradiction with the character layer before either shipped.
//
// The seam this file is built for: the simulation takes a `Loadout` — the resolved multipliers — and never sees a tier, a slot or a
// table. That is why this module is deliberately NOT in eslint.config.js's SIM list and never needs to be: the resolution happens
// once, outside the duel, and only its results cross the boundary. It also keeps `src/fight/duel.ts` free of any import of `loot.ts` or
// `grades.ts`, which the sim-boundary test would refuse.
//
// The bar (brief 19): gear tilts, skill decides. A full Origin set moves either stat by at most 20% against no gear, so a naked
// fighter can still beat every rung under its fairness cap. And **no stat changes the timing of any attack, parry, roll or wind-up** —
// a longsword tell is a longsword tell at every tier — which is why every number here is a damage multiplier and none is a duration.
// The caps below are the whole of that promise and `tests/gear-stats.test.ts` holds them exactly.
import { levelOf, type Tier } from '../grades.ts';
import { ARMOUR_SLOTS, WEAPON_SLOTS, isWeaponSlot, slotOf, type Loot, type LootId, type LootSlot } from '../loot.ts';
import type { OpponentId } from '../roster.ts';

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

// One number per tier per slot (brief 19: "no hand values per piece"). The number is a slot's COVERAGE WEIGHT, and the tier scales it
// linearly by its place on the ladder ABOVE THE BOTTOM RUNG — `levelOf - 1` over 9, so Recruit is 0 and Origin its whole weight. So the
// table below plus `levelOf` IS the 10 × 7 grid; `tests/gear-stats.test.ts` pins every one of its cells so a weight cannot be nudged
// without the grid saying so.
//
// Recruit is the identity and that is a design decision, not an off-by-one (Strategy, 2026-09-22, overriding this lane's first cut,
// which had rags at a tenth of a cap). Brief 14's Recruit is rag & scrap on 2 of 6 slots — salvage, not armour — and the naked bracket
// is only a real guarantee if the new player actually standing in rags is inside it. So Legionary leather is the first tilt in the game,
// and a Recruit fights on skill alone with nothing subtracted.
//
// The weights are a judgement about how much of a fighter each slot actually covers, and they are mine (Stats lane, 2026-09-22), not
// inherited from a brief: the tunic is the largest area and the legs the next, the head is small but is where the kill lands, and the
// gloves are the least armour a man wears. They sum to 100 so that a full set is exactly one whole cap and no constant is fitted.
//
// The Crest is 0 and that is the design, not an omission: brief 19 says it carries nothing, because it is a mark of rank and not
// armour. It stays in the table rather than being left out so that every armour slot resolves, and 0 reads as a decision.
// The Shield is 0 and that is Dom's decision, not a placeholder and not the Crest's reason repeated. Brief 19 Addendum C item 3
// (2026-09-23): the shield is the GUARD PROFILE only — two sides covered, stops heavies, cheaper hold, posture drains faster while
// held — with "no flat incoming reduction", and his earlier "−20 % incoming" withdrawn because one shield at Recruit would equal the
// whole Origin armour cap and stack to 36 %. A RES weight here would BE that withdrawn reduction, reinstated in a table. The shield
// already pays out, in `stepDuel`'s guard, and paying it twice is the double-count the addendum exists to stop.
export const SLOT_WEIGHT: Record<LootSlot, number> = {
  Helmet: 20, Crest: 0, Body: 30, Arms: 12, Gloves: 8, Greaves: 18, Boots: 12, Shield: 0,
  // A weapon carries the whole Attack pool by itself, at its own tier — there is one main hand, so a weapon's weight is not shared
  // with anything and every weapon weighs the same. Which weapon you hold is `moves.ts`'s business (reach, speed, the fairness table);
  // this number is only how much its TIER is worth.
  Trident: 100, Cleaver: 100, Knife: 100, Estoc: 100, Gladius: 100, Scythe: 100, Warhammer: 100, Maul: 100, Longsword: 100,
};
// The full armour pool and the full weapon pool, in the points `SLOT_WEIGHT × (levelOf - 1)` yields. Both are 900 (100 weight × the 9
// rungs above Recruit), which is what makes a full Origin set land exactly on a cap rather than near it.
export const FULL_POINTS = 900;

// What one piece is worth. Pure arithmetic on two integers, so the same on any platform — no transcendentals, nothing the arm64/x64
// digest drift (docs/state/lead.md) can reach.
export const pointsFor = (tier: Tier, slot: LootSlot): number => SLOT_WEIGHT[slot] * (levelOf(tier) - 1);

// A kit as the paperdoll holds it: at most one piece per slot, each at its own tier. A map rather than a list so a duplicated slot
// cannot be expressed at all.
export type Kit = Partial<Record<LootSlot, Tier>>;

// The one place a points total becomes numbers, and the only place a cap is spelled out (lead's condition, 2026-09-22). Isolating it
// is what made the four-stats-to-two cut a small edit rather than a rewrite: nothing outside this function ever knew how many totals
// or how many stats there were, so the Origin character layer can extend it the same way.
//
// Every multiplier is one integer division of exact integers, so a full set is exactly its cap (72000/90000, not 0.7999999…) and a
// partial kit is the correctly-rounded double of an exact ratio on every machine. The literals 15/20/25 below are the caps' distances
// from 1 (0.15, 0.20) times 90000 / FULL_POINTS, and the test derives the caps from the table rather than repeating them.
function multipliers(armour: number, weapon: number): Loadout {
  return {
    attack: (90000 + 15 * weapon) / 90000,
    res: (90000 - 20 * armour) / 90000,
  };
}

// The two multipliers for a kit. Total function: it validates nothing and throws nothing, because a fight must start with whatever
// the player is actually wearing.
export function loadoutFor(kit: Kit): Loadout {
  let armour = 0, weapon = 0;
  for (const [slot, tier] of Object.entries(kit) as [LootSlot, Tier][]) {
    const points = pointsFor(tier, slot);
    // The paperdoll holds ONE main hand, so a kit naming two weapons is already malformed; the better one wins rather than the last
    // one iterated, so the answer never depends on key order.
    if (isWeaponSlot(slot)) weapon = Math.max(weapon, points);
    else armour += points;
  }
  return multipliers(armour, weapon);
}

// A full set at one tier: the six wearing armour slots (never the Crest, which is worth nothing) and, given a weapon slot, that weapon too.
// The Origin case is the cap row the whole brief is measured against, so it is worth having one name rather than six call sites
// spelling it out.
export const fullSet = (tier: Tier, weapon?: (typeof WEAPON_SLOTS)[number]): Kit =>
  Object.fromEntries([...ARMOUR_SLOTS.filter(slot => SLOT_WEIGHT[slot] > 0), ...(weapon ? [weapon] : [])].map(slot => [slot, tier]));

// ---- what the player is actually wearing ----------------------------------------------------------------------------------------
// A `LootId` is `<opponent>.<slot>` (src/loot.ts) and carries NO tier. Nor is there a per-opponent kit-tier table to look one up in:
// a tier is a property of the FIGHT, not of the recipe (Strategy, 2026-09-22, withdrawing the per-opponent reading) — `tierAt(marks)`
// in src/grades.ts is `rankFor(marks).title`, so the same Centurion is a Recruit's Centurion early and a Praetorian's later.
//
// So the tier arrives as a lookup keyed on the PIECE, and what a piece's tier means is the caller's decision, not this table's: the
// rung the fight was made at, a provenance record, whatever the owning lane lands. Keying it on the opponent instead would have baked
// the withdrawn reading into the signature and forced a second lookup later.
export type TierOf = (piece: LootId) => Tier | null | undefined;

// The opponent a piece dropped from, for callers that need it. The id's shape is pinned by `isLootId`, so the split is safe on
// anything that passed it.
export const opponentOf = (id: LootId): OpponentId => id.split('.')[0] as OpponentId;

// The equipped paperdoll as a `Kit`. A piece with no tier is LEFT OUT, which resolves it to exactly 1.00 — the identity, never a
// guess, and never a default rung that would quietly hand a player stats nobody decided. That matters while the lookup does not exist:
// today every kit resolves naked, which is the honest answer and not a bug to paper over with a fallback.
//
// This resolution happens OUTSIDE the simulation (Strategy's ruling): the duel takes a resolved `Loadout` as input and never sees a
// tier, a slot or a table. The opponent's side resolves the same way from its own rung, into the same shape.
export function kitFrom(equipped: Loot['equipped'], tierOf: TierOf): Kit {
  const kit: Kit = {};
  for (const id of Object.values(equipped) as LootId[]) {
    const tier = tierOf(id);
    if (tier) kit[slotOf(id)] = tier;
  }
  return kit;
}

// The pair a screen shows, in WHOLE POINTS (brief 19 Addendum C: integers, never 1.15). Unsigned — the paperdoll reads `ATK 15 · RES 20`,
// both as magnitudes of the tilt away from no gear, because they move in opposite directions and a sign on the pair reads as one being
// a loss. The kill-screen take shows a SIGNED delta instead (brief 19 line 49, `+6 ATK` / `-4 RES`); that is a different screen and a
// different function, and it is Web's copy either way — this returns numbers, not text.
export const wholePoints = (l: Loadout): { atk: number; res: number } => ({
  atk: Math.round((l.attack - 1) * 100),
  res: Math.round((1 - l.res) * 100),
});
