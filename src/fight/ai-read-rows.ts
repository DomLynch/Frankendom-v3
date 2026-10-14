// ai-read's tables as AI_READ_ROW_MAP (Dom, "centralized game engine, no hard coding"; the debt entries in scripts/as-data/allow.json). The numbers live in ai-read-defs.json, manifest-loaded through the shared
// registry; this file only rebuilds, key for key and in the same order, the objects the sim files always held. A sim file: it imports only the shared row loader.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import AI_READ_DEFS from './ai-read-defs.json' with { type: 'json' };
import AI_READ_MANIFEST from './ai-read-defs.manifest.json' with { type: 'json' };

// READ as the code held it before it became rows (comments are the owners' rulings):
// | {
// |   feint: 1 / 6, after: 2, parry: .5, guardTicks: 180, guardShare: .45, roll: .4, swings: 11, lightShare: .7, baitHold: 12,
// |   parryBoost: 2, parryCap: .85, chargeBoost: .4, kickBoost: .3, anticipate: 8, baitShare: .7, parkShare: .5, lateNotice: 6, holdTicks: 6, latch: 600, plus: 2, decay: 0,
// | }
const READ_T = tableFromFile(AI_READ_MANIFEST.tables[0] as unknown as Manifest, AI_READ_DEFS, 'ai-read-defs.json');
loadRegistry([READ_T]);
export const READ_ROWS = Object.fromEntries((READ_T.rows as unknown as { id: string; value: number }[]).map((r) => [r.id, r.value])) as unknown as { readonly feint: number; readonly after: number; readonly parry: number; readonly guardTicks: number; readonly guardShare: number; readonly roll: number; readonly swings: number; readonly lightShare: number; readonly baitHold: number; readonly parryBoost: number; readonly parryCap: number; readonly chargeBoost: number; readonly kickBoost: number; readonly anticipate: number; readonly baitShare: number; readonly parkShare: number; readonly lateNotice: number; readonly holdTicks: number; readonly latch: number; readonly plus: number; readonly decay: number };
