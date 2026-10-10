// The engine's gear screen reads the ONE item ledger (origins/inventory, Backend's gear_open / gear_equip / gear_unequip, #1982) instead of a local copy:
// this file is the pure half. It reads a gear_open reply into the Loot shape the gear sheet already draws (so the sheet changes nothing), and turns a wear /
// stow into the server calls that make it (the server has no silent swap: a slot's occupant is unequipped first, to the pack). No network, DOM or clock.
import { TIERS, type Tier } from '../grades.ts';
import { paperdollOf, slotOf, stow, unwear, wear, wearFromPack, type Loot, type LootId, type Paperdoll, type Provenance } from './loot.ts';

export type GearPiece = { id: string; item: string; lootId: string | null; slot: string | null; where: 'pack' | 'bank' | 'equipped'; index: number | null; paperdoll: string | null; tier: string | null; version: number };
export type GearView = { pieces: GearPiece[]; worn: Record<string, string>; packSize: number; bankSize: number };
export type Step = { op: 'gear_equip' | 'gear_unequip'; id: string };

const isPiece = (p: unknown): p is GearPiece => {
  const x = p as Partial<GearPiece> | null;
  return !!x && typeof x === 'object' && typeof x.id === 'string' && typeof x.item === 'string' && (x.lootId === null || typeof x.lootId === 'string') && (x.where === 'pack' || x.where === 'bank' || x.where === 'equipped')
    && (x.paperdoll === null || typeof x.paperdoll === 'string') && (x.tier === null || typeof x.tier === 'string') && (x.index === null || Number.isInteger(x.index));
};
// A reply that is not the documented shape is no reply (the caller keeps what it has and says offline).
export function viewOf(r: unknown): GearView | null {
  const v = r as Partial<GearView> | null;
  if (!v || typeof v !== 'object' || !Array.isArray(v.pieces) || !v.pieces.every(isPiece) || !v.worn || typeof v.worn !== 'object' || !Number.isInteger(v.packSize) || !Number.isInteger(v.bankSize)) return null;
  return { pieces: v.pieces, worn: v.worn, packSize: v.packSize!, bankSize: v.bankSize! };
}
// The Loot the sheet draws: every held piece owned; the pack in grid order; the worn set by paperdoll key. A piece's rung rides as the take's tier (rank text, finish);
// the server keeps no attempt / health-left, so a piece from it carries none (the rack's provenance line reads only what exists).
export function lootOfView(v: GearView): Loot {
  const held = v.pieces.filter((p): p is GearPiece & { lootId: string } => p.lootId !== null);
  const idOf = new Map(held.map((p) => [p.id, p.lootId as LootId]));
  const equipped: Partial<Record<Paperdoll, LootId>> = {};
  for (const [key, id] of Object.entries(v.worn)) { const lootId = idOf.get(id); if (lootId) equipped[key as Paperdoll] = lootId; }
  const pack = held.filter((p) => p.where === 'pack').sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((p) => p.lootId as LootId);
  const taken: Loot['taken'] = {};
  for (const p of held) { const level = p.tier ? TIERS.indexOf(p.tier as (typeof TIERS)[number]) + 1 : 0; if (level > 0) taken[p.lootId as LootId] = { tier: level } as Provenance; }   // only the rung is real; the sheet's provenance line reads what exists
  return { owned: held.map((p) => p.lootId as LootId), equipped, pack, taken };
}
// The copy that can be put on: the server equips only from the pack (inventory.equip: "is not in the backpack"), so a duplicate lootId resolves to its PACK instance, never a worn or banked one.
const packedOf = (v: GearView, lootId: LootId): GearPiece | undefined => v.pieces.find((p) => p.lootId === lootId && p.where === 'pack');
// Wear a piece: the slot's occupant (if any) comes off into the pack first, then the piece goes on. [] when the piece is not in the pack (worn, banked or unknown: the server refuses
// equip from anywhere else), and [] when a swap has no free pack cell for the occupant (inventory.unequip needs one; the sheet keeps its "Pack full" line). Backend has no swap op; if one
// lands, the full-pack case becomes one call.
export function stepsToWear(v: GearView, lootId: LootId): Step[] {
  const piece = packedOf(v, lootId);
  if (!piece) return [];
  const occupant = v.worn[paperdollOf(slotOf(lootId))];
  if (occupant && v.pieces.filter((p) => p.where === 'pack').length >= v.packSize) return [];
  return [...(occupant ? [{ op: 'gear_unequip' as const, id: occupant }] : []), { op: 'gear_equip', id: piece.id }];
}
// Take a worn slot's piece off into the pack. [] for an empty slot.
export function stepsToStow(v: GearView, key: Paperdoll): Step[] { const id = v.worn[key]; return id ? [{ op: 'gear_unequip', id }] : []; }

// Every wear / stow the gear sheet makes is one of these, and the sheet hands it to ONE function (its `act`): a guest's local ledger applies it (applyLocal, src/fight/loot.ts), a
// signed-in character's goes to the server as the calls stepsFor names. The Pit and Zone 1 mount the same sheet, so they decide nothing apart.
export type GearOp = { kind: 'wear'; id: LootId } | { kind: 'wearFromPack'; id: LootId } | { kind: 'unwear'; key: Paperdoll } | { kind: 'stow'; key: Paperdoll };
export const applyLocal = (loot: Loot, op: GearOp): Loot => (op.kind === 'wear' ? wear(loot, op.id) : op.kind === 'wearFromPack' ? wearFromPack(loot, op.id) : op.kind === 'unwear' ? unwear(loot, op.key) : stow(loot, op.key));
// The server has one way to take a piece off (into the pack), so Wear's swap and Wear-from-pack are the same calls, and Take off and Store are the same call.
export const stepsFor = (v: GearView, op: GearOp): Step[] => (op.kind === 'wear' || op.kind === 'wearFromPack' ? stepsToWear(v, op.id) : stepsToStow(v, op.key));
// What the rig wears, and at which rung (a piece's take tier; none reads Recruit): the same answer for the Pit's profile and for the ledger a zone shows.
export const wornIdsOf = (loot: Loot | undefined): LootId[] => Object.values(loot?.equipped ?? {}) as LootId[];
export const wornTiersOf = (loot: Loot | undefined): Record<string, Tier> => Object.fromEntries(wornIdsOf(loot).flatMap((id) => { const level = loot?.taken?.[id]?.tier; return level ? [[id, TIERS[level - 1] ?? 'Recruit']] : []; }));
