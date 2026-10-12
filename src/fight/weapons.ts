// Weapons as data (Combat, core slice 4, 2026-10-12): the loader for src/fight/weapon-defs.json. A row is a weapon keyed by id; it may `extends` another row and then holds only the fields that differ
// (objects merge field by field, anything else replaces); a row with no `extends` is resolved over the ENGINE's base move and path tables (moves.ts MOVES / PATHS, the verbs). Nothing here names a weapon:
// a new weapon is one row. The resolved table is checked whole, so a row that forgets a move, names an unknown material or extends itself is refused at load, never found mid-fight.
import type { MoveDef, PathSpec, Weapon } from './moves.ts';

export type WeaponBase = { readonly moves: Readonly<Record<string, MoveDef>>; readonly paths: Readonly<Record<string, PathSpec>> };
export type WeaponEnums = { readonly materials: readonly string[]; readonly guards: readonly string[]; readonly grips: readonly string[] };
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const merge = (base: unknown, over: unknown): unknown => isObj(base) && isObj(over)
  ? Object.fromEntries([...Object.keys(base), ...Object.keys(over).filter((k) => !(k in base))].map((k) => [k, k in over ? merge(base[k], over[k]) : base[k]]))
  : over;

export function loadWeaponDefs(raw: { weapons?: readonly unknown[] }, base: WeaponBase, enums: WeaponEnums): { weapons: Record<string, Weapon>; player: string[]; offered: string[] } {
  const rows = new Map<string, Obj>();
  (raw.weapons ?? []).forEach((r, i) => {
    if (!isObj(r) || typeof r.id !== 'string' || !r.id) throw Error(`weapon-defs row ${i}: id is a non-empty string`);
    if (rows.has(r.id)) throw Error(`weapon-defs: duplicate weapon "${r.id}"`);
    rows.set(r.id, r);
  });
  const resolved = new Map<string, Obj>();
  const resolve = (id: string, chain: readonly string[]): Obj => {
    const done = resolved.get(id); if (done) return done;
    if (chain.includes(id)) throw Error(`weapon-defs: "${id}" extends itself (${[...chain, id].join(' -> ')})`);
    const { id: _id, extends: parent, player: _p, offered: _o, ...own } = rows.get(id)!;
    if (parent !== undefined && (typeof parent !== 'string' || !rows.has(parent))) throw Error(`weapon-defs "${id}": extends "${String(parent)}", which is no weapon`);
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
    for (const [table, must] of [['moves', base.moves], ['paths', base.paths]] as const) for (const key of Object.keys(must)) if (!isObj((w[table] as Obj)?.[key])) throw Error(`weapon-defs "${id}": ${table} has no "${key}"`);
    weapons[id] = { id, ...w } as unknown as Weapon;
  }
  const order = (field: 'player' | 'offered'): string[] => [...rows.values()].filter((r) => r[field] !== undefined).sort((a, b) => (a[field] as number) - (b[field] as number)).map((r) => r.id as string);
  return { weapons, player: order('player'), offered: order('offered') };
}
