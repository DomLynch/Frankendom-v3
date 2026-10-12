// What sheet a stored build says a record must carry (RV48). A sweep or a settle that grants anything on a replay loads the exact build version the record names and
// passes the sheet it resolves to as verifyRecord's expected sheet; the record's own sheet is the client's claim and never the source.
import type { FightRecord } from './record.ts';
import { sheetOf, type Build, type Sheet } from './sheet-rows.ts';

export type BuildLoader = (characterId: string, version: number) => Promise<Build | null>;
export type Expected = { ok: true; sheet: Sheet | undefined } | { ok: false; reason: string };

// The loader is handed the stored character id (`pc:<record id>`).
export const NO_BUILD = 'the record names a build version this server does not hold';
const DEFAULT_BUILD: Build = { level: 1, placed: {} };

// A record without a sheet needs nothing (sheet undefined, replayed as before). A sheet with no build reference claims the default build; one with a reference must find that exact
// (character, version) or it is refused. `gear`: the dial deltas of what the server knows the character wore (none held yet, so callers pass {}: a geared record is refused).
export async function expectedSheet(record: Pick<FightRecord, 'sheet' | 'characterId' | 'buildVersion'>, load: BuildLoader, gear: Readonly<Record<string, number>> = {}): Promise<Expected> {
  if (!record.sheet) return { ok: true, sheet: undefined };
  try {
    let build = DEFAULT_BUILD;
    if (record.characterId !== undefined) {
      const stored = await load(`pc:${record.characterId}`, record.buildVersion!);   // the record carries the id after `pc:` (record.ts CHARACTER_ID has no colon); the loader gets the character id the writer stores
      if (!stored) return { ok: false, reason: NO_BUILD };
      build = stored;
    }
    const sheet = sheetOf(build, gear);
    if (sheet) return { ok: true, sheet };
    return { ok: false, reason: record.characterId === undefined ? 'the record carries a sheet and names no stored build to check it against' : 'the stored build and worn gear give no sheet, the record carries one' };
  } catch (error) {
    return { ok: false, reason: `the stored build is not a legal one: ${error instanceof Error ? error.message : String(error)}` };
  }
}
