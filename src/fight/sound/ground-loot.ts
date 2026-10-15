// Cues for ground loot (World & Audio, Dom's loot-path priority 2026-10-15): an item landing on the ground, a successful take, and a take that failed because someone else got it first. Each is a
// ROW in audio-rules-defs.json (`groundLoot`: which existing sprite cue, at what level, room send and pitch), so there is no new loader and no new sprite bytes; feedback.groundLoot(kind) plays it
// through the combat bus, silent until the sprite has decoded. Pure: no audio here, only the rows read ONCE at load (never a per-play search).
// Donor: ModernUO (Item.cs): one default lift sound (0x57) and one default drop sound (0x42) played at the item, with a per-item-class override (GetLiftSound/GetDropSound). We took the defaults-plus-override
// shape: a row `drop`, `pickup` or `refuse` is the default and a row `<kind>:<itemClass>` (say `pickup:coin`) overrides it for that class. UO has no sound for a failed take; our race (two players, one item) needs one.
import { MANIFEST } from '../../audio/manifest.ts';
import { GROUND_LOOT_ROWS, type GroundLootRow } from './audio-rules.ts';
import type { Cue, CueName } from './cues.ts';

export const GROUND_LOOT_KINDS = ['drop', 'pickup', 'refuse'] as const;
export type GroundLootKind = typeof GROUND_LOOT_KINDS[number];

/** The lookup: every row validated (a sprite cue that exists, level, room and pitch in range, a unique id, `<kind>` or `<kind>:<class>`), and each of the three kinds must have its default row. */
export function loadGroundLoot(rows: readonly GroundLootRow[]): ReadonlyMap<string, Cue> {
  const out = new Map<string, Cue>();
  for (const r of rows) {
    const [kind, itemClass, ...extra] = r.id.split(':');
    if (!GROUND_LOOT_KINDS.includes(kind as GroundLootKind) || extra.length || itemClass === '') throw Error(`ground-loot "${r.id}": the id is drop, pickup or refuse, optionally with :<itemClass>`);
    if (out.has(r.id)) throw Error(`ground-loot "${r.id}": duplicate row`);
    if (!Object.hasOwn(MANIFEST, r.cue)) throw Error(`ground-loot "${r.id}": "${r.cue}" is not a cue in the sprite`);
    if (!(r.gain > 0 && r.gain <= 1 && r.room >= 0 && r.room <= 1 && r.rate >= 0.25 && r.rate <= 4)) throw Error(`ground-loot "${r.id}": gain is 0-1, room 0-1, rate 0.25-4`);
    out.set(r.id, { name: r.cue as CueName, gain: r.gain, room: r.room, rate: r.rate });
  }
  for (const kind of GROUND_LOOT_KINDS) if (!out.has(kind)) throw Error(`ground-loot: the "${kind}" default row is missing`);
  return out;
}
const LOOKUP = loadGroundLoot(GROUND_LOOT_ROWS);   // read once, here: groundLootCue is a Map get

/** The cue for a ground-loot event: the class override (`pickup:coin`) when there is one, else the default. A fresh object, so a caller cannot change the row. */
export const groundLootCue = (kind: GroundLootKind, itemClass?: string, lookup: ReadonlyMap<string, Cue> = LOOKUP): Cue => ({ ...(((itemClass && lookup.get(`${kind}:${itemClass}`)) || lookup.get(kind))!) });
