// The page's side of the golden weapon drops (data/golden-weapons.json, src/zone/golden-drops.ts): builds the controller on the page's progression save and the HUD on its view.
// Kept out of src/client/main.ts (many lanes edit it): main.ts calls mountGolden once and then step / strike / died / killed. A page with no save (?save=off, ?pitborn=v1, the Daily Pit) mounts nothing and the game is as before.
import type { Object3D } from 'three';
import { GOLDEN, createGolden, freshGolden, loadWeapon, type GoldenSave } from '../zone/golden-drops.ts';
import { RINGS } from '../zone/rings.ts';
import { mountGoldenHud } from './golden-hud.ts';
import { clearOf, validateGolden, type Spot } from './golden-check.ts';

type Doc = Parameters<typeof mountGoldenHud>[0];
export type GoldenPage = {
  doc: Doc;
  view: { projectInto(x: number, y: number, z: number, out: [number, number]): boolean; heroWeaponNode(): Object3D | undefined };
  spots: readonly Spot[];                                   // the zone's boss spots in the pit's frame (spotsFor): roaming points keep clear of every one
  drawable: readonly string[];                              // the weapons the hero can draw (scene.ts CARRIED_WEAPONS)
  get(): GoldenSave | undefined; put(next: GoldenSave): void;   // the progression save's optional field, and the page's write-back (which persists)
};

/** Checks the table (a bad row stops the page at load, like every data file). */
export const checkGolden = (isWeapon: (id: string) => boolean): void => validateGolden(GOLDEN, isWeapon, RINGS.rings);

/** The weapon the hero is built with at load: the golden weapon's own id when he holds one he can draw, else `fallback`. */
export const goldenWeaponAtLoad = (save: GoldenSave | undefined, drawable: readonly string[], fallback: string): string => loadWeapon(save, GOLDEN, drawable, fallback);

export function mountGolden(p: GoldenPage) {
  const rows = clearOf(GOLDEN, p.spots);   // a roaming pickup inside a boss's leash would drag the hero into a fight: such a point is left out here (named in the console) and the test fails the PR that made it so
  const ui = mountGoldenHud(p.doc, rows, () => p.view.heroWeaponNode(), (x, y, z, out) => p.view.projectInto(x, y, z, out), () => performance.now());
  return createGolden({ rows, drawable: p.drawable, ui, get: () => p.get() ?? freshGolden(), put: p.put, now: () => Date.now(), rng: Math.random });
}
