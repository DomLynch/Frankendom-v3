import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';

// Finishers as data (Dom: everything as data; Lead's brief 2026-10-12). A finisher is ONE row of src/fight/finisher-defs.json naming its
// TEMPLATE plus its parameters; the template is the engine verb (the code path that plays the body and the gore), the row is content.
// Donor: AzerothCore spell_dbc, shape only (a row names its effect handler and carries the handler's parameters; no code copied).
// The verbs: fall (the victim's own clip, or the plain Death), cleave (the skull seam), sever (the severed head), impale (held on the
// blade), bisect (the waist bake), hamstring (two low blows timed on the scene, each holding it) and execute (the kneeling cut, its pose
// re-skinned onto the victim); those two fetch their clips lazily and each has its own scene path.
export const FINISHER_TEMPLATES = ['fall', 'cleave', 'sever', 'impale', 'bisect', 'hamstring', 'execute'] as const;
export type FinisherTemplate = (typeof FINISHER_TEMPLATES)[number];
// The clip words characters.ts `update` plays a finisher body with. Each one is still its own branch there, so the set is code until the
// characters.ts consumer pass turns those branches into row fields; a row's pose must be one of them (or null, the plain Death).
export const FINISHER_POSES = ['splitCrown', 'decapitation', 'runThrough', 'quietOne', 'opened'] as const;
export type FinisherPose = (typeof FINISHER_POSES)[number];

// `rotation`: in the automatic pick (file order is the pool order, which selectFinisher's hash indexes, so reordering rows moves picks).
// `pose`: the clip word characters.ts plays, null = the plain Death. `seconds`: the MEASURED duration (finishers.ts FINISHER_SECONDS);
// a finisher with no clip of its own names the row it borrows its figure from in `secondsFrom` instead, and reports it as not measured.
export type FinisherRow = { id: string; template: FinisherTemplate; rotation: boolean; pose: FinisherPose | null; seconds?: number; secondsFrom?: string };
export type FinisherTable = { rows: readonly FinisherRow[]; byId: ReadonlyMap<string, FinisherRow>; rotation: readonly string[] };

const isTemplate = (v: unknown): v is FinisherTemplate => (FINISHER_TEMPLATES as readonly unknown[]).includes(v);

// The shared loader first (bad key, duplicate id, missing field, wrong type, a secondsFrom naming no finisher: file:row:id + the rule),
// then what a manifest cannot say: the template is a verb the engine has, a pose is a clip word or null, and a row has exactly one of a
// measured `seconds` and a `secondsFrom` that names a measured row.
export function loadFinisherDefs(raw: unknown, manifest: Manifest, file = 'finisher-defs.json'): FinisherTable {
  const table = tableFromFile(manifest, raw, file);
  loadRegistry([table]);
  const rows = table.rows as readonly FinisherRow[], byId = new Map(rows.map((r) => [r.id, r]));
  const problems: string[] = [];
  rows.forEach((r, i) => {
    const at = `${file}:${i}:${r.id}`, measured = (x: FinisherRow | undefined) => typeof x?.seconds === 'number' && Number.isFinite(x.seconds) && x.seconds > 0;
    if (!isTemplate(r.template)) problems.push(`${at} template "${String(r.template)}" is not an engine verb (${FINISHER_TEMPLATES.join(', ')})`);
    if (r.pose !== null && !(FINISHER_POSES as readonly unknown[]).includes(r.pose)) problems.push(`${at} pose "${String(r.pose)}" is not a clip word characters.ts plays (${FINISHER_POSES.join(', ')}) or null`);
    if ((r.seconds === undefined) === (r.secondsFrom === undefined)) problems.push(`${at} needs exactly one of seconds and secondsFrom`);
    else if (r.seconds !== undefined && !measured(r)) problems.push(`${at} seconds must be a positive number`);
    else if (r.secondsFrom !== undefined && !measured(byId.get(r.secondsFrom))) problems.push(`${at} secondsFrom "${r.secondsFrom}" must name a row with measured seconds`);
  });
  if (problems.length) throw Error(problems.join('\n'));
  return { rows, byId, rotation: rows.filter((r) => r.rotation).map((r) => r.id) };
}
