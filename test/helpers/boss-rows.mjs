// One reader for the boss weapon, profile, ring and physics rows, so a test derives what a body must resolve to from the DATA files (data/boss-weapons.json, profiles.json, rings.json,
// physics.json, rig.json) and adding or changing a boss weapon row never needs a test edit. No per-boss literals live here or in the tests that call it.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { foeRigFile } from '../../src/fight/rig-bones.ts';
import { profileBodyOf } from '../../src/fight/foe-body.ts';
import { OPPONENTS } from '../../src/fight/moves.ts';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const readData = (name) => JSON.parse(readFileSync(path.join(root, 'data', `${name}.json`), 'utf8'));
const WEAPONS = readData('boss-weapons'), PROFILES = readData('profiles'), RINGS = readData('rings'), PHYSICS = readData('physics'), RIG = readData('rig');

/** The boss weapon row a boss of profile `profileId` fights with, by the keying rule the data file states: the profile's own row (same archetype), else its archetype's shared row, else undefined. */
export const weaponRowOfProfile = (profileId) => {
  const p = PROFILES.profiles.find((q) => q.id === profileId);
  return p && (WEAPONS.rows.find((r) => r.profile === p.id && r.opponent === p.opponent) ?? WEAPONS.rows.find((r) => r.opponent === p.opponent && r.profile == null));
};
/** The sim weapon id a boss of profile `profileId` must fight with: its row's, else V1's weapon for its archetype. */
export const expectedWeaponOfProfile = (profileId) => weaponRowOfProfile(profileId)?.weapon ?? OPPONENTS[PROFILES.profiles.find((q) => q.id === profileId).opponent]?.weapon;
/** Every (profile, 106 body file) pair the scene finds a weapon row for by body: each archetype row's profile body (the profile whose body that is), and each ring boss's own body (its kind is the profile). */
export const bossBodyCases = () => [
  ...WEAPONS.rows.filter((r) => r.profile == null).map((r) => {
    const file = profileBodyOf(r.opponent);
    return { label: r.id, file, profile: PROFILES.profiles.filter((p) => p.opponent === r.opponent && file === foeRigFile(p.body) && !WEAPONS.rows.some((x) => x.profile === p.id)).at(-1)?.id };   // a profile with a row of its own is a ring boss case below, not the archetype's shared body
  }),
  ...RINGS.bosses.map((b) => ({ label: `ring ${b.kind}`, file: foeRigFile(b.body), profile: b.kind })),
].filter((c) => c.file && c.profile);
/** Bodies that have a data/physics.json opponents row AND a cut manifest beside their body file (data/rig.json files): exactly what physics-chunk.ts cutManifests must list. */
export const cuttableBodies = () => [...new Set(PHYSICS.opponents.map((o) => o.body))].filter((b) => RIG.files[b] && existsSync(path.join(root, `src/assets/${RIG.files[b]}.cut.manifest.json`))).sort();
/** The body keys a `cutManifests` object literal line lists (quoted or bare, digits allowed). */
export const listedCutManifests = (chunkSource) => [...(chunkSource.match(/export const cutManifests: Record<string, unknown> = \{(.*)\};/)?.[1] ?? '').matchAll(/["']?([\w-]+)["']?\s*:\s*\w+Manifest/g)].map((m) => m[1]).sort();
