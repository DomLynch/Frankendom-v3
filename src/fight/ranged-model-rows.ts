// The painted ranged-weapon models (CS23, the combat sandbox's bow): one row per missile kind, all data (ranged-model-defs.json, shared registry): the file, the node
// the model is built on, the hand bone it hangs under, the hold (Euler XYZ degrees, absolute under the hand bone) and the matte the painted material needs (TRELLIS
// exports metalness 1 / roughness 1, which draws black with no environment map). Presentation only: no sim file reads this, so no RV. DORMANT in the game: no
// game weapon is bound to a missile kind (sandbox-rules-defs.json missile rows say weapon "none"; the sandbox bound one by a URL param), so nothing asks for a model
// until Strategy/Dom decide a bow weapon. The loader in characters.ts takes the row for kind `bow` only; the crossbow stays out (CS22, dropped by Dom).
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import DEFS from './ranged-model-defs.json' with { type: 'json' };
import MANIFEST from './ranged-model-defs.manifest.json' with { type: 'json' };

export type RangedModel = { readonly id: string; readonly file: string; readonly node: string; readonly hand: string; readonly holdDeg: readonly [number, number, number]; readonly holdPos: readonly [number, number, number]; readonly clips: 'warrior' | 'equip'; readonly metalness: number; readonly roughness: number };   // holdPos: metres under the hand bone (the staff points out from the fist like the maul and trident, SwordDrawn's offset)

const TABLE = tableFromFile(MANIFEST.tables[0] as unknown as Manifest, DEFS, 'ranged-model-defs.json');
loadRegistry([TABLE]);
type Row = { id: string; file: string; node: string; hand: string; holdRxDeg: number; holdRyDeg: number; holdRzDeg: number; holdPx: number; holdPy: number; holdPz: number; clips: string; metalness: number; roughness: number };
export const RANGED_MODELS: readonly RangedModel[] = (TABLE.rows as unknown as Row[]).map((r) => ({ id: r.id, file: r.file, node: r.node, hand: r.hand, holdDeg: [r.holdRxDeg, r.holdRyDeg, r.holdRzDeg] as const, holdPos: [r.holdPx, r.holdPy, r.holdPz] as const, clips: r.clips === 'equip' ? 'equip' : 'warrior', metalness: r.metalness, roughness: r.roughness }));

/** The row for a missile kind (`bow`), or undefined: the kind keeps whatever the game draws for it today. */
export const rangedModelOf = (kind: string): RangedModel | undefined => RANGED_MODELS.find((m) => m.id === kind);
/** The served URL of a model file (public/<file>). */
export const rangedModelUrl = (model: RangedModel): string => `/${model.file}`;
