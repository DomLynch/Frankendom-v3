// The Pit brain's distances, timings and reach margins as rows (ai-dial-defs.json; audit docs/audits/hardcoded-2026-10-17.md top-20 #1-#3; Dom, 2026-10-13: every game number lives in a data row). Each value is byte-identical to the
// literal it replaced in ai.ts, so no fight changes; only the digest moves (a sim file), under the batch's one RECORD_VERSION bump. A sim file: it imports only the shared row loader.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import DIAL_DEFS from './ai-dial-defs.json' with { type: 'json' };
import DIAL_MANIFEST from './ai-dial-defs.manifest.json' with { type: 'json' };

const DIAL_T = tableFromFile(DIAL_MANIFEST.tables[0] as unknown as Manifest, DIAL_DEFS, 'ai-dial-defs.json');
loadRegistry([DIAL_T]);
type DialId = 'startSeed' | 'startLastGap' | 'startDecision' | 'startWait' | 'disengageTicks' | 'retreatTicks' | 'waitBase' | 'waitSpread' | 'waitAggrCeil' | 'rangeSlack' | 'reachInset' | 'backstepTravelMul' | 'backstepSpeedShare'
  | 'advanceEps' | 'loiterShare' | 'backstepSlack' | 'shakyShare' | 'lowRetreatGap' | 'farApproachGap' | 'guardRollShare' | 'hardApproachGap' | 'midApproachGap' | 'lowCloseRetreatGap' | 'circleReturnGap' | 'guardHoldBase'
  | 'guardHoldSpread' | 'estimateMax' | 'kickWeight' | 'baitChance' | 'chargeOffset' | 'thrustCloseInset' | 'braceSlack' | 'kickHoverSlack' | 'lateralStep' | 'dashSlack' | 'wallSlack';
export const DIAL = Object.fromEntries((DIAL_T.rows as unknown as { id: string; value: number }[]).map((r) => [r.id, r.value])) as { readonly [K in DialId]: number };
