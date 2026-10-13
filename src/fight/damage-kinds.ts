// Damage kinds as data (Wave A1 PR2, RV49; programme 2a: "slash -> stamina drain, crush -> posture/poise, pierce -> penetration"; our posture IS poise). A move row may carry `damageKind: <row id of
// damage-kind-defs.json>`; a move with none is today's blow, byte for byte. A kind is three numbers, each neutral at rest: `drain` = the share of the dealt health damage taken from the target's stamina as
// well (slash), `posture` = a multiplier on the posture the blow puts on the target (crush), `penetration` = the share of the target's armour dial the blow ignores (pierce; it reads the sheet's armour,
// so a target with no armour dial is untouched). Rows through the shared loader (src/core/registry.ts): a new kind is one row, a weapon or creature opts in with one move field.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import KIND_DEFS from './damage-kind-defs.json' with { type: 'json' };
import KIND_MANIFEST from './damage-kind-defs.manifest.json' with { type: 'json' };

export type DamageKind = { readonly id: string; readonly drain: number; readonly posture: number; readonly penetration: number };
const TABLE = tableFromFile(KIND_MANIFEST.tables[0] as Manifest, KIND_DEFS, 'damage-kind-defs.json');
loadRegistry([TABLE]);
export const DAMAGE_KINDS: Readonly<Record<string, DamageKind>> = Object.fromEntries((TABLE.rows as unknown as DamageKind[]).map((k) => {
  if (k.drain < 0 || k.drain > 1 || k.posture < 0 || k.penetration < 0 || k.penetration > 1) throw Error(`damage-kind-defs "${k.id}": drain and penetration are shares from 0 to 1, posture is a multiplier from 0`);
  return [k.id, k];
}));
export const DAMAGE_KIND_IDS: readonly string[] = Object.keys(DAMAGE_KINDS);
// The kind a move names; undefined = no kind (the plain blow). A name no row holds is a loader error at weapon load, so a miss here cannot happen on a loaded weapon.
export const kindOf = (name: string | undefined): DamageKind | undefined => (name === undefined ? undefined : DAMAGE_KINDS[name]);
