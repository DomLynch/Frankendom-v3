// Weapon shapes per rank (Strategy/Lead 2026-09-28, weapon-variants brief): GPT's painted shapes, today three per weapon type (PLAIN at rank
// levels 1–3, CRAFTED 4–7, ORNATE 8–10), wired PER RANK: each weapon has a ten-entry rank → file table (SHIPPING_SHAPES), so a later file for
// one rank (Dom: unique 8, 9 and 10 after launch) is a new file and one table entry, no code change. A file (`public/weapons/shapes/<file>.glb`,
// one mesh, hand at the origin, length along +Y, the brief's envelope: scripts/weapon-fit-check.mjs) replaces the weapon's own draws: the
// opponent's at the rung he is met at, the player's own weapon at the player's own rung (his career rank: shapesFor). Its finish is GPT's
// painted one: no rank tint over it (Strategy 2026-09-28, characters.ts `reshape`). Presentation only: the sim's blade tables and the node's
// contact extras stay, so reach and contact never move. No file for a rank = the weapon as shipped today, the rank tint over it as before.
//
// Every file ships pinned by sha256 in tests/weapon-shapes.test.ts. The dev flag `?shapes=maul-crafted,estoc-cane-ornate` names band files
// present under /weapons/shapes/ (a local drop), over the table.
import type { WeaponId } from './moves.ts';
import OVERRIDES from './shape-overrides.json' with { type: 'json' };
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import SHAPE_DEFS from './shipping-shapes-defs.json' with { type: 'json' };
import SHAPE_MANIFEST from './shipping-shapes-defs.manifest.json' with { type: 'json' };

export type Band = 'plain' | 'crafted' | 'ornate';
export const BANDS: readonly Band[] = ['plain', 'crafted', 'ornate'];
export const bandOf = (level: number): Band => level >= 8 ? 'ornate' : level >= 4 ? 'crafted' : 'plain';

// The file per rank level for each shape (index 0 = rank 1): a weapon id (`maul`), or an opponent's own shape on a weapon's envelope
// (`estoc-cane`). Undefined = that rank keeps today's part.
export type RankFiles = readonly (string | undefined)[];
export type ShapeTable = Readonly<Partial<Record<string, RankFiles>>>;
export const RANK_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
// A stem's band files laid over the ten ranks (the dev flag; a table row written by band).
export const byBand = (stem: string, bands: readonly Band[]): RankFiles => RANK_LEVELS.map((level) => bands.includes(bandOf(level)) ? `${stem}-${bandOf(level)}` : undefined);
// What ships (Dom 2026-09-28 "implement the maul"; Strategy 22:3x/23:1x the other trios, one PR per weapon): GPT's painted files, one per
// band for now (rank 1–3 plain, 4–7 crafted, 8–10 ornate). The maul's crafted is GPT's v3 Forge Warden (2026-09-29, a file swap); its plain and ornate files were flat grey and are out (the Knight's slab, 2026-09-30).
// The table is ROWS (shipping-shapes-defs.json, shared registry): one row per shape id with its ten rank files, null = that rank keeps today's part. Notes that sat beside the old literal: the maul's plain and ornate
// files were flat grey atlases and are out (its crafted is GPT's v3 Forge Warden, 2026-09-29); the trident's plain (1-3) is out like the maul's; 'estoc-cane' is the Plague Doctor's own estoc and 'witch-staff' the Witch's own.
const SHAPE_TABLE = tableFromFile(SHAPE_MANIFEST.tables[0] as unknown as Manifest, SHAPE_DEFS, 'shipping-shapes-defs.json');
loadRegistry([SHAPE_TABLE]);
export const SHIPPING_SHAPES: ShapeTable = Object.fromEntries((SHAPE_TABLE.rows as unknown as { id: string; ranks: (string | null)[] }[]).map((r) => {
  if (r.ranks.length !== RANK_LEVELS.length || r.ranks.some((f) => f !== null && (typeof f !== 'string' || !f))) throw Error(`shipping-shapes-defs "${r.id}": one file (or null) per rank (${RANK_LEVELS.length})`);
  return [r.id, r.ranks.map((f) => f ?? undefined)];
}));
// An opponent's own shape for a weapon (Dom via Strategy 2026-09-28): the Plague Doctor's estoc is a cane sword (cane-sword-brief.md, the
// estoc's envelope). He takes only his own files: an absent rank keeps today's part, never the generic painted weapon (Lead 2026-09-29:
// the cane is Dom's own art call to GPT, and a generic painted blade on him would pre-empt it).
export const SHAPE_OVERRIDES: Readonly<Record<string, Partial<Record<WeaponId, string>>>> = shapeOverrides();
function shapeOverrides(): Record<string, Partial<Record<WeaponId, string>>> {   // shape-overrides.json: one row per (opponent, weapon); the Witch's trident stands in for her bladed staff until the staff's files land
  const out: Record<string, Partial<Record<WeaponId, string>>> = {};
  for (const r of OVERRIDES.rows as readonly { opponent: string; weapon: WeaponId; shape: string }[]) (out[r.opponent] ??= {})[r.weapon] = r.shape;
  return out;
}

const ENTRY = /^([a-z]+(?:-[a-z]+)?)-(plain|crafted|ornate)$/;
export function shapesFlag(search: string): ShapeTable | undefined {
  const value = new URLSearchParams(search).get('shapes');
  if (!value) return undefined;
  const bands: Record<string, Band[]> = {};
  for (const entry of value.split(',')) {
    const match = ENTRY.exec(entry.trim());
    if (match) (bands[match[1]] ??= []).push(match[2] as Band);
  }
  return Object.fromEntries(Object.entries(bands).map(([stem, list]) => [stem, byBand(stem, list)]));
}
// Whether any shape file is on at all: with none (an empty table), scene.ts never resolves, loads or reshapes: every weapon is exactly
// its shipped part, untouched.
export const shapesOn = (table: ShapeTable): boolean => Object.values(table).some((ranks) => ranks?.some(Boolean));

// The file for this weapon at this rank level (on this opponent, if he has his own shape), or none (the weapon keeps its own shape).
export const shapeFor = (weapon: WeaponId, level: number, shipping: ShapeTable = SHIPPING_SHAPES, opponent?: string): string | undefined => {
  const own = opponent ? SHAPE_OVERRIDES[opponent]?.[weapon] : undefined;
  const file = shipping[own ?? weapon]?.[level - 1];
  return file ? `/weapons/shapes/${file}.glb` : undefined;
};

// Both fighters' shape files for a fight (scene.ts reshape): the player's own weapon at the PLAYER's rung (his career rank), the opponent's at the
// rung he is met at (Strategy's brief: "the player's rank for his own weapon"). Undefined = that weapon keeps today's part.
export type ShapeFight = { player?: WeaponId; opponent?: WeaponId; opponentId: string; playerLevel: number; opponentLevel: number };
export const shapesFor = (fight: ShapeFight, shipping: ShapeTable = SHIPPING_SHAPES): { player?: string; opponent?: string } => ({
  player: fight.player && shapeFor(fight.player, fight.playerLevel, shipping),
  opponent: fight.opponent && shapeFor(fight.opponent, fight.opponentLevel, shipping, fight.opponentId),
});
