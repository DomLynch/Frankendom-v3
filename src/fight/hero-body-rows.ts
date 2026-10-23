import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import HERO_BODY_MANIFEST from './hero-body-rows.manifest.json' with { type: 'json' };
import HERO_BODY_ROWS from './hero-body-rows.json' with { type: 'json' };

// WHICH BODY THE HERO IS, as one row (hero-body-rows.json; Dom 2026-10-23: the Mixamo Exo Gray is the hero, the classic hero stays in the repo so a rollback is one row flip).
// `body` names the key of `files`; `files` maps a body to its src/assets/<file>.glb. The Exo body is warrior.glb (the file every consumer already names); the classic hero is hero-classic.glb.
// Flip `body` to "classic" and the duel scene, the open world and the gear stage all draw the classic hero again. Nothing else changes: the clips and the joints are the same 65 names.
const TABLE = tableFromFile(HERO_BODY_MANIFEST.tables[0] as Manifest, HERO_BODY_ROWS, 'hero-body-rows.json');
loadRegistry([TABLE]);
const ROW = (TABLE.rows as unknown as { id: string; fields: { body: string; files: Record<string, string>; contact: Record<string, Record<string, number>> } }[])[0];   // the table holds exactly one row
if (TABLE.rows.length !== 1) throw new Error(`hero-body-rows.json must hold exactly one row, found ${TABLE.rows.length}`);
const FILE = ROW.fields.files[ROW.fields.body];
if (!FILE) throw new Error(`hero-body-rows.json: body "${ROW.fields.body}" has no file`);

/** The hero body's file stem under src/assets/ ('warrior' for the Exo body, 'hero-classic' for the classic one). */
export const heroBodyFile = (): string => FILE;
/** Every file stem the row can name (a page that globs assets keeps them all addressable). */
export const heroBodyFiles = (): readonly string[] => Object.values(ROW.fields.files);

// WHERE THE BODY'S OWN STRIKE CLIP MEETS (presentation only, Lead 2026-10-23: the sim ticks, the digest and RV stay put, as with the goblin 1.25 ruling). Per body and per clip role, the 0-1 point of the clip
// where the blade is furthest forward AFTER the wind-up (OpenTrident hit_frames.json "hit_frame_after_windup", README-exo-mx.md; Attack frame 45 of 52, Heavy 51 of 55), not the clip-start stance. characters.ts eases the clip
// to it at the simulation's contact tick, in place of the path's `source`. A body or role with no entry (the classic hero's own clips) keeps the path's `source`.
export const heroContact = (role: string): number | undefined => ROW.fields.contact[ROW.fields.body]?.[role];
