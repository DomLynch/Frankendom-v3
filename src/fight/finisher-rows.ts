import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';

// Finishers as data (Dom: everything as data; Lead's brief 2026-10-12). A finisher is ONE row of src/fight/finisher-defs.json naming its
// TEMPLATE plus its parameters; the template is the engine verb (the code path that plays the body and the gore), the row is content.
// Donor: AzerothCore spell_dbc, shape only (a row names its effect handler and carries the handler's parameters; no code copied).
// The verbs: fall (the victim's own clip, or the plain Death), cleave (the skull seam), sever (the severed head), impale (held on the
// blade), bisect (the waist bake), hamstring (two low blows timed on the scene, each holding it) and execute (the kneeling cut, its pose
// re-skinned onto the victim); those two fetch their clips lazily and each has its own scene path.
export const FINISHER_TEMPLATES = ['fall', 'cleave', 'sever', 'impale', 'bisect', 'hamstring', 'execute'] as const;
export type FinisherTemplate = (typeof FINISHER_TEMPLATES)[number];
// A row's `pose` is its clip word (null: the plain Death). characters.ts no longer branches on the word: what it plays for a finisher body is the
// row's `body` (the victim's and the killer's pose words and the clip role each plays), and the template picks any code path of its own.
export type FinisherPose = string;
// `body` (characters.ts): the pose word the scene hands each rig and the clip role it plays. `victim` falls (a dead pose); `killer`, when the scene
// has the killer act (Run Through's held drive, Hamstrung's and Execution's strikes), holds its pose at full weight.
export type FinisherBodyPart = { pose: string; role: string };
export type FinisherBody = { victim: FinisherBodyPart; killer?: FinisherBodyPart };

// `rotation`: in the automatic pick (file order is the pool order, which selectFinisher's hash indexes, so reordering rows moves picks).
// `pose`: the clip word characters.ts plays, null = the plain Death. `seconds`: the MEASURED duration (finishers.ts FINISHER_SECONDS);
// a finisher with no clip of its own names the row it borrows its figure from in `secondsFrom` instead, and reports it as not measured.
// `camera` (camera.ts): the death-window dolly every finisher gets (push toward the fallen, slide off the killer's axis, turn the look); the late
// side-view `reveal` (when on the finisher clock it opens and over how long, and whose `side` view it takes); and a `side` view of its own: the angle
// off the killer→fallen axis (radians), the eye height (plus eyeYPerScale per unit of extra body scale), the minimum distance back, what must show
// beyond the fallen (a fixed margin, or beyondBody × body scale against the measured reach + reachPad), and whether a big body widens the choices.
export type FinisherSide = { angle: number; eyeY: number; eyeYPerScale?: number; minBack: number; beyond?: number; beyondBody?: number; reachPad?: number; wideWhenBig?: boolean };
export type FinisherCamera = { dolly: { push: number; slide: number; turn: number }; reveal?: { from: number; over: number; overBig?: number; side: string }; side?: FinisherSide };
// `shelved`: the clip and pose stay, but the scene plays the plain fall in their place (the Quiet One left the game, Dom 2026-09-27; nothing picks it).
export type FinisherRow = { id: string; template: FinisherTemplate; rotation: boolean; pose: FinisherPose | null; seconds?: number; secondsFrom?: string; shelved?: boolean; body?: FinisherBody; camera: FinisherCamera };
export type FinisherTable = { rows: readonly FinisherRow[]; byId: ReadonlyMap<string, FinisherRow>; rotation: readonly string[] };

const isTemplate = (v: unknown): v is FinisherTemplate => (FINISHER_TEMPLATES as readonly unknown[]).includes(v);

// The shared loader first (bad key, duplicate id, missing field, wrong type, a secondsFrom naming no finisher: file:row:id + the rule),
// then what a manifest cannot say: the template is a verb the engine has, a pose is a clip word or null, a row has exactly one of a
// measured `seconds` and a `secondsFrom` that names a measured row, and a camera reveal takes a side view some row defines.
export function loadFinisherDefs(raw: unknown, manifest: Manifest, file = 'finisher-defs.json'): FinisherTable {
  const table = tableFromFile(manifest, raw, file);
  loadRegistry([table]);
  const rows = table.rows as readonly FinisherRow[], byId = new Map(rows.map((r) => [r.id, r]));
  const problems: string[] = [];
  rows.forEach((r, i) => {
    const at = `${file}:${i}:${r.id}`, measured = (x: FinisherRow | undefined) => typeof x?.seconds === 'number' && Number.isFinite(x.seconds) && x.seconds > 0;
    if (!isTemplate(r.template)) problems.push(`${at} template "${String(r.template)}" is not an engine verb (${FINISHER_TEMPLATES.join(', ')})`);
    if (r.pose !== null && (typeof r.pose !== 'string' || r.pose === '')) problems.push(`${at} pose must be a clip word or null`);
    for (const part of r.body ? [r.body.victim, r.body.killer] : []) if (part !== undefined && !(typeof part?.pose === 'string' && part.pose && typeof part.role === 'string' && part.role)) problems.push(`${at} body parts need a pose word and a clip role`);
    if ((r.seconds === undefined) === (r.secondsFrom === undefined)) problems.push(`${at} needs exactly one of seconds and secondsFrom`);
    else if (r.seconds !== undefined && !measured(r)) problems.push(`${at} seconds must be a positive number`);
    else if (r.secondsFrom !== undefined && !measured(byId.get(r.secondsFrom))) problems.push(`${at} secondsFrom "${r.secondsFrom}" must name a row with measured seconds`);
    const { reveal, side } = r.camera, num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
    if (reveal && (!num(reveal.from) || !num(reveal.over) || reveal.over <= 0 || (reveal.overBig !== undefined && !(num(reveal.overBig) && reveal.overBig > 0)))) problems.push(`${at} camera.reveal needs from and a positive over (and overBig, when given)`);
    if (reveal && !byId.get(reveal.side)?.camera.side) problems.push(`${at} camera.reveal.side "${reveal.side}" must name a row with a camera.side view`);
    if (side && (![side.angle, side.eyeY, side.minBack].every(num) || (side.beyond === undefined ? !(num(side.beyondBody) && num(side.reachPad)) : !num(side.beyond)))) problems.push(`${at} camera.side needs angle, eyeY, minBack and either beyond or beyondBody + reachPad`);
  });
  const words = rows.flatMap((r) => (r.body ? [r.body.victim.pose, ...(r.body.killer ? [r.body.killer.pose] : [])] : []));
  for (const w of words) if (words.indexOf(w) !== words.lastIndexOf(w)) { problems.push(`${file}: body pose "${w}" is used twice (a rig's pose word names one finisher body)`); break; }
  if (problems.length) throw Error(problems.join('\n'));
  return { rows, byId, rotation: rows.filter((r) => r.rotation).map((r) => r.id) };
}
