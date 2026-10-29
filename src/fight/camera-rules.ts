// The camera and stage-timing numbers as data (World, Dom's data-layer day 2026-10-14): the lock camera's short- and low-foe terms (camera.ts), the follow camera's lead and look height, the title
// tour, the scene's compile and look-bake bounds, a severed head's life and the zone effects' idle time, one row each (id, value, unit) through the shared loader (src/core/registry.ts). Every
// default equals the literal it replaced (tests/camera-rules.test.ts pins them). None is read by the sim, so this table is NOT part of the world digest. Pure.
import { loadRegistry, tableFromFile } from '../core/registry.ts';
import DEFS from './camera-rules-defs.json' with { type: 'json' };
import MANIFEST from './camera-rules-defs.manifest.json' with { type: 'json' };

export type CameraRule = { readonly id: string; readonly value: number; readonly unit: string };
const NAMED = ['aimPerShrink', 'fightBackDefault', 'combatPitchMax','lowSide', 'lowLift', 'tallBack', 'tallLift', 'shoulder', 'sideClear', 'shortFade', 'followAhead', 'followLookY', 'compileBoundMs', 'lookBakeMs', 'tourDelay', 'tourAfterSettle', 'tourBlendIn', 'tourLap', 'tourBreathe', 'tourRise', 'tourRadius', 'tourBreath', 'tourLookY', 'tourLookYPortrait', 'introLap', 'introRadius', 'introBreath', 'introBreathe', 'introHeight', 'introRise', 'introRiseEvery', 'introLookY', 'introLookYPortrait', 'introBlendIn', 'introBlendOut', 'arenaClamp', 'lockBackFloor', 'lockLiftFloor', 'lockGapFloor', 'framingTallWraith', 'lockBackPerGap', 'lockBackBase', 'lockLiftPerGap', 'walkOrbitRadius', 'sideLookY', 'settleMin', 'settleStill', 'settleSpeed', 'dollyPush', 'dollySlide', 'dollyTurn', 'orbitPitchStart', 'orbitYawPerPx', 'orbitPitchPerPx', 'orbitPitchMin', 'orbitPitchMax', 'kickSettleDefault', 'camSettleRate', 'lockLookY', 'finishPushClock', 'finishPushRate', 'pushEyeY', 'pushEyeShare', 'pushLookY', 'pushLookShare', 'bigBodyScale', 'tourEyeLow', 'tourEyeHigh', 'tourRiseLow', 'tourRiseHigh', 'lookFoeAngle', 'lookFoeDistance', 'lookFoeEyeY', 'lookFoeLookY', 'baseFov', 'zoomLimitLow', 'zoomLimitHigh', 'wideZoomHigh', 'wideFromLow', 'wideFromHigh', 'wideHfovLow', 'wideHfovHigh', 'wideHfovNone', 'shoveFps', 'followOpenBack', 'followOpenUp', 'followStartY', 'followStartZ', 'followFpLookMetres', 'followFitUpShare', 'followCapUpShare', 'followStickDrop', 'followStickGaze', 'followEaseRate'] as const;
/** The one loader: rows keyed by id (a duplicate id or a missing or mistyped field is refused), every rule the stage reads by name must exist, with a positive value. */
export function loadCameraRules(raw: { rules?: readonly unknown[] }): readonly CameraRule[] {
  loadRegistry([tableFromFile(MANIFEST.tables[0], raw, 'camera-rules-defs.json')]);
  const rows = (raw.rules ?? []) as readonly CameraRule[];
  for (const r of rows) if (!(Number.isFinite(r.value) && r.value > 0)) throw Error(`camera-rules "${r.id}": value is a number > 0`);
  for (const must of NAMED) if (!rows.some((r) => r.id === must)) throw Error(`camera-rules: the stage reads the "${must}" rule by name, so it needs a row`);
  return rows;
}
export const CAMERA_RULES: readonly CameraRule[] = loadCameraRules(DEFS);
/** One contact's camera shove, a row of camera-rules-defs.json `shoves` (metres; `holdFrames` at the shoveFps rule; `settle` seconds). camera-kick.ts reads these by id; a missing id throws at load. */
export type ShoveRow = { readonly id: string; readonly along: number; readonly drop: number; readonly dropPerfect?: number; readonly side: number; readonly holdFrames: number; readonly settle: number };
const SHOVES = tableFromFile(MANIFEST.tables[1], DEFS, 'camera-rules-defs.json');
loadRegistry([SHOVES]);
const SHOVE_IDS = ['guardBroken', 'hitHeavy', 'hitLight', 'parried', 'blockedHeavy', 'blockedLight'] as const;
for (const must of SHOVE_IDS) if (!(SHOVES.rows as readonly ShoveRow[]).some((r) => r.id === must)) throw Error(`camera-rules: the camera kick reads the "${must}" shove by name, so it needs a row`);
export const shoveRow = (id: (typeof SHOVE_IDS)[number]): ShoveRow => (SHOVES.rows as readonly ShoveRow[]).find((r) => r.id === id)!;
const BY_ID = new Map(CAMERA_RULES.map((r) => [r.id, r.value]));
export const cameraRule = (id: (typeof NAMED)[number]): number => BY_ID.get(id)!;
/** The title tour's seconds and metres, one row each. */
export const tourRules = () => ({ delay: cameraRule('tourDelay'), afterSettle: cameraRule('tourAfterSettle'), blendIn: cameraRule('tourBlendIn'), lap: cameraRule('tourLap'), breathe: cameraRule('tourBreathe'), rise: cameraRule('tourRise'), radius: cameraRule('tourRadius'), breath: cameraRule('tourBreath'), lookY: cameraRule('tourLookY'), lookYPortrait: cameraRule('tourLookYPortrait') });
/** The first-visit intro orbit's seconds and metres, one row each (camera.ts introTour). */
export const introRules = () => ({ lap: cameraRule('introLap'), radius: cameraRule('introRadius'), breath: cameraRule('introBreath'), breathe: cameraRule('introBreathe'), height: cameraRule('introHeight'), rise: cameraRule('introRise'), riseEvery: cameraRule('introRiseEvery'), lookY: cameraRule('introLookY'), lookYPortrait: cameraRule('introLookYPortrait'), blendIn: cameraRule('introBlendIn'), blendOut: cameraRule('introBlendOut') });
