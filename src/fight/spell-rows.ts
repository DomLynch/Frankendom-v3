import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import { PORTRAIT_KEYS } from '../legends.ts';
import SCHOOL_DEFS from './school-defs.json' with { type: 'json' };
import SCHOOL_MANIFEST from './school-defs.manifest.json' with { type: 'json' };
import SPECIAL_DEFS from './special-defs.json' with { type: 'json' };
import SPECIAL_MANIFEST from './special-defs.manifest.json' with { type: 'json' };
import SPELL_DEFS from './spell-defs.json' with { type: 'json' };
import SPELL_MANIFEST from './spell-defs.manifest.json' with { type: 'json' };
import { SPECIALS, type SpecialRow } from './special-rows.ts';

// Grimoire spells as data (Lead's queue 2026-10-13, programme 2b: "the sim casts it through the existing special template, so the fight engine never knows a spell was composed").
// A spell is ONE row of src/fight/spell-defs.json: the legend it is taken from (`legendId`, a skull key `<opponent>-<rung>`, the one Provenance.legendId a verified first win writes),
// its school, the special row it casts through (`special`) and the parameter overrides its bricks apply. `spellCast` resolves it to a SpecialRow, the same shape
// the fx modules already draw, so no fx module and no sim file changes. Presentation only. Donor: Ryzom's spell (a row of bricks over one root effect), shape only.
export type SpellRow = { id: string; legendId: string; school: string; special: string; params: Record<string, unknown> };

// The spell table is loaded together with the special and school tables it points at (refs: an unknown special or school is refused at load, file:row:id + the rule).
export function loadSpellDefs(raw: unknown, manifest: Manifest, file = 'spell-defs.json'): readonly SpellRow[] {
  const spell = tableFromFile(manifest, raw, file);
  loadRegistry([tableFromFile(SCHOOL_MANIFEST.tables[0] as Manifest, SCHOOL_DEFS, 'school-defs.json'), tableFromFile(SPECIAL_MANIFEST.tables[0] as Manifest, SPECIAL_DEFS, 'special-defs.json'), spell]);
  const problems: string[] = [];
  (spell.rows as readonly SpellRow[]).forEach((r, i) => {
    if (!PORTRAIT_KEYS.includes(r.legendId)) problems.push(`${file}:${i}:${r.id} legendId "${r.legendId}" is not a legend (<opponent>-<rung 1..10>)`);
    const base = SPECIALS.find((s) => s.id === r.special);
    for (const k of Object.keys(r.params)) if (base && !Object.hasOwn(base.params, k)) problems.push(`${file}:${i}:${r.id} params.${k} is not a parameter of the ${r.special} special`);
  });
  if (problems.length) throw Error(problems.join('\n'));
  return spell.rows as readonly SpellRow[];
}
export const SPELLS = loadSpellDefs(SPELL_DEFS, SPELL_MANIFEST.tables[0] as Manifest);
// The row the fx module draws for a spell: its special with the spell's overrides on the params, the spell's id as the cast id.
export const spellCast = (spell: SpellRow): SpecialRow => {
  const base = SPECIALS.find((s) => s.id === spell.special)!;
  return { ...base, id: spell.id, params: { ...base.params, ...spell.params } };
};
// The spells a legend's kill takes: Backend's `spell-taken` reason keys on Provenance.legendId.
export const spellsOf = (legendId: string): readonly SpellRow[] => SPELLS.filter((s) => s.legendId === legendId);
