import { loadRegistry } from '../core/registry.ts';
import { rowsOf, tableOf } from '../rows.ts';
import HERO_BODY_MANIFEST from './hero-body-rows.manifest.json' with { type: 'json' };
import HERO_BODY_ROWS from './hero-body-rows.json' with { type: 'json' };

// WHICH BODY THE HERO IS, as one row (hero-body-rows.json). `body` names the key of `files`; `files` maps a body to its 65 stem under
// src/assets/, which data/rig.json `files` maps to the 106 file drawn (rig-bones.ts heroRigFile).
// V3 (Dom 2026-10-26): Mixamo's Psyche is the hero, on the 106-joint rig only (src/assets/psyche-106.glb; "no risk of going back to the old
// 65 rig"). ?hero=v1 (V1's 65 warrior.glb) and the Exo / classic rows were removed with the 65 bodies; the 65 files stay in src/assets for the
// tests and the bakes but are never shipped (data/build.json notShipped). No query picks the hero's body.
const TABLE = tableOf(HERO_BODY_MANIFEST.tables[0], HERO_BODY_ROWS, 'hero-body-rows.json');
loadRegistry([TABLE]);
const ROW = rowsOf<{ id: string; fields: { body: string; files: Record<string, string>; contact: Record<string, Record<string, number>>; start: Record<string, Record<string, number>> } }>(TABLE)[0];   // the table holds exactly one row
if (TABLE.rows.length !== 1) throw new Error(`hero-body-rows.json must hold exactly one row, found ${TABLE.rows.length}`);
if (!ROW.fields.files[ROW.fields.body]) throw new Error(`hero-body-rows.json: body "${ROW.fields.body}" has no file`);
const body = ROW.fields.body;

/** The hero body's 65 stem under src/assets/ ('psyche'); the file drawn is its 106 one (rig-bones.ts heroRigFile: 'psyche-106'). */
export const heroBodyFile = (): string => ROW.fields.files[body]!;

// WHERE THE BODY'S OWN STRIKE CLIP MEETS AND WHERE IT STARTS (presentation only, Lead 2026-10-23: the sim ticks, the digest and RV stay put, as with the goblin 1.25 ruling). Per body and per clip role:
// `contact` is the 0-1 point of the clip where the blade is at full extension (a measured hand path of warrior.glb: Attack frame 24 of 52, Heavy frame 26 of 55; the OpenTrident "after wind-up" frames 45/51 are the
// settle after the strike, which made the wind-up play at 4.5x), `start` is where the clip's real build-up begins (it skips the flat lead-in: Attack frame 7, Heavy frame 4). characters.ts eases the clip from `start`
// to `contact` over the simulation's wind-up ticks. A body or role with no entry (the classic hero's own clips) keeps the path's `source` and plays from 0.
export const heroContact = (role: string): number | undefined => ROW.fields.contact[body]?.[role];
/** The clip fraction to play for the swing's eased progress `p` (swingProgress): from `start` at the first tick to `contact` at the contact tick, then the clip as it was. `own`: the hero rig's own clip. */
export const heroSwing = (role: string, p: number, own: boolean): number => {
  const c = heroContact(role), s = ROW.fields.start[body]?.[role];
  return own && c !== undefined && s !== undefined && p < c ? s + p * (1 - s / c) : p;
};
