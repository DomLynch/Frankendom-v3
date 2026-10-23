import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import HERO_BODY_MANIFEST from './hero-body-rows.manifest.json' with { type: 'json' };
import HERO_BODY_ROWS from './hero-body-rows.json' with { type: 'json' };

// WHICH BODY THE HERO IS, as one row (hero-body-rows.json; Dom 2026-10-23: the Mixamo Exo Gray is the hero, the classic hero stays in the repo so a rollback is one row flip).
// `body` names the key of `files`; `files` maps a body to its src/assets/<file>.glb. The Exo body is warrior.glb (the file every consumer already names); the classic hero is hero-classic.glb.
// Flip `body` to "classic" and the duel scene, the open world and the gear stage all draw the classic hero again. Nothing else changes: the clips and the joints are the same 65 names.
const TABLE = tableFromFile(HERO_BODY_MANIFEST.tables[0] as Manifest, HERO_BODY_ROWS, 'hero-body-rows.json');
loadRegistry([TABLE]);
const ROW = (TABLE.rows as unknown as { id: string; fields: { body: string; files: Record<string, string> } }[]).find((r) => r.id === 'hero-body');
if (!ROW) throw new Error('hero-body-rows.json has no hero-body row');
const FILE = ROW.fields.files[ROW.fields.body];
if (!FILE) throw new Error(`hero-body-rows.json: body "${ROW.fields.body}" has no file`);

/** The hero body's file stem under src/assets/ ('warrior' for the Exo body, 'hero-classic' for the classic one). */
export const heroBodyFile = (): string => FILE;
/** Every file stem the row can name (a page that globs assets keeps them all addressable). */
export const heroBodyFiles = (): readonly string[] => Object.values(ROW.fields.files);
