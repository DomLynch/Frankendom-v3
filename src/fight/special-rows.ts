import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import SPECIAL_DEFS from './special-defs.json' with { type: 'json' };
import SPECIAL_MANIFEST from './special-defs.manifest.json' with { type: 'json' };

// Special moves as data (Dom: everything as data; Lead's brief 2026-10-12). A special is ONE row of src/fight/special-defs.json, keyed by its
// ?special= id: its family (the fx module that draws it), the TEMPLATE in that module (the engine verb: the code path that paints the effect),
// whose cast it draws (`cast`: the side and, when it is one move, the move id) and the template's parameters. A new special is a row naming a
// template that exists; a new template is code. Donor: AzerothCore spell_dbc, shape only (a row names its effect handler and carries the
// handler's parameters; no code copied). Presentation only: no special row reaches the sim.
export type SpecialRow = { id: string; family: string; template: string; opponent: string; cast: { actor: number; move?: string }; params: Record<string, unknown> };
// A family's templates and, per template, the params a row of it must carry.
export type Templates = Readonly<Record<string, readonly string[]>>;

export function loadSpecialDefs(raw: unknown, manifest: Manifest, file = 'special-defs.json'): readonly SpecialRow[] {
  const table = tableFromFile(manifest, raw, file);
  loadRegistry([table]);   // bad key, duplicate id, missing field, wrong type: file:row:id + the rule
  return table.rows as readonly SpecialRow[];
}

// One family's rows, checked against the templates its module draws: a template the module does not have, or a missing param, is refused at load.
export function specialFamily(rows: readonly SpecialRow[], family: string, templates: Templates, file = 'special-defs.json'): readonly SpecialRow[] {
  const problems: string[] = [], out: SpecialRow[] = [];
  rows.forEach((r, i) => {
    if (r.family !== family) return;
    const need = Object.hasOwn(templates, r.template) ? templates[r.template]! : null;
    if (!need) problems.push(`${file}:${i}:${r.id} template "${r.template}" is not a ${family} verb (${Object.keys(templates).join(', ')})`);
    else for (const p of need) if (!Object.hasOwn(r.params, p)) problems.push(`${file}:${i}:${r.id} params.${p} is required by the ${r.template} template`);
    out.push(r);
  });
  if (problems.length) throw Error(problems.join('\n'));
  return out;
}

export const SPECIALS = loadSpecialDefs(SPECIAL_DEFS, SPECIAL_MANIFEST.tables[0] as Manifest);
// A day/night pair: the Night Pit (arena exposure > 1.5) takes its own number.
export const dayNight = <T>(v: { day: T; night: T }, night: boolean): T => (night ? v.night : v.day);
