// The build's cut of V1's blade table (data/fight.json bladeTables): src/fight/blade-paths.ts bakes every (rig, weapon) sweep V1 ships,
// one JSON literal on one line; the bundle keeps only the rigs and weapons the row names. The source file stays V1's as copied.
// A named table missing from the source is an error here, never a silent gap (bladeFrames throws on a missing table in play).
const TABLE = /^(export const bladePathsByRig\b[^=]*= )(\{.*\});\s*$/m;
export function keepBladeTables(src, row) {
  const m = src.match(TABLE);
  if (!m) throw new Error('blade-paths.ts: bladePathsByRig literal not found');
  const all = JSON.parse(m[2]), kept = {};
  for (const [rig, weapons] of Object.entries(row)) {
    if (rig === 'about') continue;
    for (const weapon of weapons) {
      if (!all[rig]?.[weapon]) throw new Error(`blade-paths.ts: no ${rig}/${weapon} table to keep`);
      (kept[rig] ??= {})[weapon] = all[rig][weapon];
    }
  }
  return src.replace(TABLE, (_, head) => `${head}${JSON.stringify(kept)};`);
}
