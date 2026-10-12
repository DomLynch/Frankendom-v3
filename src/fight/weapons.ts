// Weapons as data (Combat, core slice 4, 2026-10-12): the loader for src/fight/weapon-defs.json. A row is a weapon keyed by id; it may `extends` another row and then holds only the fields that differ
// (objects merge field by field, anything else replaces); a row with no `extends` is resolved over the ENGINE's base move and path tables (moves.ts MOVES / PATHS, the verbs). Nothing here names a weapon:
// a new weapon is one row. The resolved table is checked whole, so a row that forgets a move, names an unknown material or extends itself is refused at load, never found mid-fight.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import type { MoveDef, PathSpec, Weapon } from './moves.ts';
import WEAPON_MANIFEST from './weapon-defs.manifest.json' with { type: 'json' };

// Presentation flags a row may carry (never inherited, never on the Weapon, so they cannot move a fight): baked = the hero rig bakes this weapon (no equip file to load); pommelBash = a player equip plays the hilt-bash clip;
// lowerArm = false keeps the spectral Wraith's attacking arm up for this weapon; stabs = the finishing sound is a stab for it.
export const LOOK_KEYS = ['baked', 'pommelBash', 'lowerArm', 'stabs'] as const;
export type WeaponLook = Partial<Record<(typeof LOOK_KEYS)[number], boolean>>;
export type WeaponBase = { readonly moves: Readonly<Record<string, MoveDef>>; readonly paths: Readonly<Record<string, PathSpec>> };
export type WeaponEnums = { readonly materials: readonly string[]; readonly guards: readonly string[]; readonly grips: readonly string[] };
type Obj = Record<string, unknown>;
const isRecord = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
// Objects merge field by field; anything else replaces. A merge that changes nothing returns the BASE object itself, so a row that overrides nothing of a table shares it (the longsword's moves ARE MOVES).
const merge = (base: unknown, over: unknown): unknown => {
  if (!isRecord(base) || !isRecord(over)) return over;
  const out: Obj = { ...base };
  let changed = false;
  for (const k of Object.keys(over)) { const m = merge(base[k], over[k]); if (!(k in base) || m !== base[k]) { out[k] = m; changed = true; } }
  return changed ? out : base;
};

export function loadWeaponDefs(raw: { weapons?: readonly unknown[] }, base: WeaponBase, enums: WeaponEnums): { weapons: Record<string, Weapon>; player: string[]; offered: string[]; defaultId: string; natural: string[]; looks: Record<string, WeaponLook> } {
  loadRegistry([tableFromFile(WEAPON_MANIFEST.tables[0] as Manifest, raw, 'weapon-defs.json')]);   // the shared loader (src/core/registry.ts): a missing or duplicate id and an `extends` that names no weapon are refused as file:row:id + the rule
  const rows = new Map<string, Obj>();
  for (const r of (raw.weapons ?? []) as Obj[]) rows.set(r.id as string, r);
  const resolved = new Map<string, Obj>();
  const resolve = (id: string, chain: readonly string[]): Obj => {
    const done = resolved.get(id); if (done) return done;
    if (chain.includes(id)) throw Error(`weapon-defs: "${id}" extends itself (${[...chain, id].join(' -> ')})`);
    const own: Obj = { ...rows.get(id)! }, parent = own.extends;
    for (const k of ['id', 'extends', 'player', 'offered', 'default', 'natural', 'look']) delete own[k];   // a row's own markers: never inherited, never on the Weapon
    const out = merge(parent === undefined ? { moves: base.moves, paths: base.paths } : resolve(parent as string, [...chain, id]), own) as Obj;
    resolved.set(id, out);
    return out;
  };
  const weapons: Record<string, Weapon> = {};
  for (const id of rows.keys()) {
    const w = resolve(id, []), fight = w.fight as Obj | undefined;
    if (!enums.materials.includes(w.material as string)) throw Error(`weapon-defs "${id}": material "${String(w.material)}" is not one of ${enums.materials.join(', ')}`);
    if (!enums.guards.includes(w.guard as string)) throw Error(`weapon-defs "${id}": guard "${String(w.guard)}" is not one of ${enums.guards.join(', ')}`);
    if (!enums.grips.includes(w.grip as string)) throw Error(`weapon-defs "${id}": grip "${String(w.grip)}" is not one of ${enums.grips.join(', ')}`);
    if (typeof w.reach !== 'number' || !Number.isFinite(w.reach)) throw Error(`weapon-defs "${id}": reach is a number`);
    if (!fight || typeof fight.thrustShare !== 'number' || typeof fight.close !== 'number') throw Error(`weapon-defs "${id}": fight needs thrustShare and close`);
    for (const [table, must] of [['moves', base.moves], ['paths', base.paths]] as const) for (const key of Object.keys(must)) if (!isRecord((w[table] as Obj)?.[key])) throw Error(`weapon-defs "${id}": ${table} has no "${key}"`);
    weapons[id] = { id, ...w } as unknown as Weapon;
  }
  const order = (field: 'player' | 'offered'): string[] => [...rows.values()].filter((r) => r[field] !== undefined).sort((a, b) => (a[field] as number) - (b[field] as number)).map((r) => r.id as string);
  const defaults = [...rows.values()].filter((r) => r.default === true);
  if (defaults.length !== 1) throw Error('weapon-defs: exactly one row is the `default` weapon');
  const looks: Record<string, WeaponLook> = {};
  for (const [id, r] of rows) {
    const look = r.look ?? {};
    if (!isRecord(look) || Object.entries(look).some(([k, v]) => !LOOK_KEYS.includes(k) || typeof v !== 'boolean')) throw Error(`weapon-defs "${id}": look holds only ${LOOK_KEYS.join(', ')}, each true or false`);
    looks[id] = look as WeaponLook;
  }
  return { weapons, player: order('player'), offered: order('offered'), defaultId: defaults[0]!.id as string, natural: [...rows.values()].filter((r) => r.natural === true).map((r) => r.id as string), looks };
}
