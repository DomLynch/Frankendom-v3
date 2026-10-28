// The weapon a boss body is fought and drawn with, as ONE pure function set the scene (scene.ts) and the tests (test/boss-expect.test.mjs) both call. Moved verbatim out of scene.ts createScene
// (CI hardening 2026-10-28: three live breaks passed CI because nothing asserted the resolved weapon per boss). `liveBody` is the 106 file the page's own rig wears, `builtFoeWeapon` its built-in weapon.
import { OPPONENTS, type OpponentId, type WeaponId } from './moves.ts';
import { bossOpponent, bossRowOfBody, bossWeaponFor, type BossWeaponRow } from './boss-weapon.ts';
import { bodyOwnerOf, bodyProfileOf, profileBodyOf } from './foe-body.ts';

/** The boss weapon row for 106 body `file`, or undefined (the body fights with the page's weapon). A biome ring boss (data/rings.json) wears its own body: it takes the weapon row of the archetype it fights as, or its own profile's. */
export const bossOfBody = (file: string, liveBody: string, search: string): BossWeaponRow | undefined =>
  bossRowOfBody(file, profileBodyOf, search) ?? (file === liveBody || !bodyOwnerOf(file) ? undefined : bossWeaponFor(bodyOwnerOf(file)!, search, undefined, bodyProfileOf(file)));
/** The archetype whose profile row names body `file` (undefined for the live body). */
export const ownerOfBody = (file: string, liveBody: string): string | undefined => (file === liveBody ? undefined : bodyOwnerOf(file));
/** The sim weapon id body `file` fights with: its boss row's, else its owner archetype's (the Pitborn's cleaver on the Minotaur), else the page's own. */
export const weaponOfBody = (file: string, liveBody: string, builtFoeWeapon: WeaponId | undefined, search: string): WeaponId | undefined =>
  bossOfBody(file, liveBody, search)?.weapon ?? (ownerOfBody(file, liveBody) ? bossOpponent(OPPONENTS[ownerOfBody(file, liveBody)! as OpponentId], search, undefined, bodyProfileOf(file)).weapon : builtFoeWeapon);
