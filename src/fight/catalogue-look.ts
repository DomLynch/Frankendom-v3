// What a catalogue row says about how a character LOOKS on screen, resolved for one meeting (K11 slice 1; Characters 2026-10-09): the draw scale, the Pit rung it is met at, the rank-look
// file that rung ships, and whether its kit takes the rung's finish (src/rank-tint.ts). A zone mob is a character at a level, so a client asks here instead of keeping a second table
// of scales and look files (origins/preview/mob-looks.ts). Per-CHARACTER dressing (cloth tint, soot, gear, spread) is not here: it stays in zone data, the row holds only the BODY's look.
// Pure data in, data out: no DOM, no three.js.
import { rankLookFor } from '../rank-look.ts';
import { rungOf } from '../legends.ts';
import { catalogueRow } from './catalogue-rows.ts';

export type CatalogueLook = { scale: number; rung: number | null; rankLook: string | undefined; tint: boolean };

/** `id` is the roster id (the catalogue key); `level` the level it is met at. A row with no Pit ranks has no rung and no rank look. Null for an id with no row. */
export function catalogueLook(id: string, level: number, phone = false): CatalogueLook | null {
  const row = catalogueRow(id);
  if (!row) return null;
  const rung = row.ranks.length ? rungOf(level) : null;
  return { scale: row.render.scale, rung, rankLook: rung !== null && row.look.levels.includes(rung) ? rankLookFor(id, rung, phone && row.look.phone) : undefined, tint: row.look.tint };
}
