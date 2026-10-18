// The camera and stage-timing numbers as data (World, Dom's data-layer day 2026-10-14): the lock camera's short- and low-foe terms (camera.ts), the follow camera's lead and look height, the title
// tour, the scene's compile and look-bake bounds, a severed head's life and the zone effects' idle time, one row each (id, value, unit) through the shared loader (src/core/registry.ts). Every
// default equals the literal it replaced (tests/camera-rules.test.ts pins them). None is read by the sim, so this table is NOT part of the world digest. Pure.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import DEFS from './camera-rules-defs.json' with { type: 'json' };
import MANIFEST from './camera-rules-defs.manifest.json' with { type: 'json' };

export type CameraRule = { readonly id: string; readonly value: number; readonly unit: string };
const NAMED = ['aimPerShrink', 'fightBackDefault','lowSide', 'worldGapFloor', 'worldSideMax', 'worldSideBase', 'worldSideLow', 'worldSideRef', 'lowLift', 'tallBack', 'tallLift', 'shoulder', 'sideClear', 'shortFade', 'followAhead', 'followLookY', 'compileBoundMs', 'lookBakeMs', 'tourDelay', 'tourAfterSettle', 'tourBlendIn', 'tourLap', 'tourBreathe', 'tourRise', 'tourRadius', 'tourBreath', 'tourLookY', 'tourLookYPortrait', 'introLap', 'introRadius', 'introBreath', 'introBreathe', 'introHeight', 'introRise', 'introRiseEvery', 'introLookY', 'introLookYPortrait', 'introBlendIn', 'introBlendOut', 'arenaClamp', 'lockBackFloor', 'lockLiftFloor', 'lockGapFloor'] as const;
/** The one loader: rows keyed by id (a duplicate id or a missing or mistyped field is refused), every rule the stage reads by name must exist, with a positive value. */
export function loadCameraRules(raw: { rules?: readonly unknown[] }): readonly CameraRule[] {
  loadRegistry([tableFromFile(MANIFEST.tables[0] as unknown as Manifest, raw, 'camera-rules-defs.json')]);
  const rows = (raw.rules ?? []) as readonly CameraRule[];
  for (const r of rows) if (!(Number.isFinite(r.value) && r.value > 0)) throw Error(`camera-rules "${r.id}": value is a number > 0`);
  for (const must of NAMED) if (!rows.some((r) => r.id === must)) throw Error(`camera-rules: the stage reads the "${must}" rule by name, so it needs a row`);
  return rows;
}
export const CAMERA_RULES: readonly CameraRule[] = loadCameraRules(DEFS);
export const cameraRule = (id: (typeof NAMED)[number]): number => CAMERA_RULES.find((r) => r.id === id)!.value;
/** The title tour's seconds and metres, one row each. */
export const tourRules = () => ({ delay: cameraRule('tourDelay'), afterSettle: cameraRule('tourAfterSettle'), blendIn: cameraRule('tourBlendIn'), lap: cameraRule('tourLap'), breathe: cameraRule('tourBreathe'), rise: cameraRule('tourRise'), radius: cameraRule('tourRadius'), breath: cameraRule('tourBreath'), lookY: cameraRule('tourLookY'), lookYPortrait: cameraRule('tourLookYPortrait') });
/** The first-visit intro orbit's seconds and metres, one row each (camera.ts introTour). */
export const introRules = () => ({ lap: cameraRule('introLap'), radius: cameraRule('introRadius'), breath: cameraRule('introBreath'), breathe: cameraRule('introBreathe'), height: cameraRule('introHeight'), rise: cameraRule('introRise'), riseEvery: cameraRule('introRiseEvery'), lookY: cameraRule('introLookY'), lookYPortrait: cameraRule('introLookYPortrait'), blendIn: cameraRule('introBlendIn'), blendOut: cameraRule('introBlendOut') });
