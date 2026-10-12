import { FINISHERS, finisherRow, type FinisherId } from './finishers.ts';
import type { FinisherRow, FinisherTemplate } from './finisher-rows.ts';

// The presentation's questions about a finisher, answered from its row (src/fight/finisher-defs.json), never from its name: which template
// (the engine verb whose code path plays it), whether it is the plain death (the fall with no clip of its own: no ceremony), and whether its
// clip is shelved (kept, but the scene plays the plain fall in its place). Pure, three-free.
export const templateOf = (id: FinisherId | null): FinisherTemplate | null => (id === null ? null : finisherRow(id)?.template ?? null);
export const isTemplate = (id: FinisherId | null, ...templates: readonly FinisherTemplate[]): boolean => { const t = templateOf(id); return t !== null && templates.includes(t); };
export const isPlainDeath = (id: FinisherId | null): boolean => { const row = id === null ? undefined : finisherRow(id); return !!row && row.template === 'fall' && row.pose === null; };
export const isShelved = (id: FinisherId | null): boolean => (id === null ? false : finisherRow(id)?.shelved === true);
// Does any finisher of this template pass `supports` (an opponent's allow-list): the scene prepares a template's bake only for a body that can play it.
export const anyOfTemplate = (template: FinisherTemplate, supports: (id: FinisherId) => boolean): boolean => FINISHERS.rows.some((r) => r.template === template && supports(r.id));
// The finisher body a rig pose word names (characters.ts): its row, which side it is, and the clip role it plays. A pose word no row names (a
// combat pose: 'attack', 'guard', ...) is undefined.
export type FinisherBodyPose = { row: FinisherRow; side: 'victim' | 'killer'; role: string };
const BODY_POSES = new Map<string, FinisherBodyPose>(FINISHERS.rows.flatMap((row) => row.body
  ? [[row.body.victim.pose, { row, side: 'victim' as const, role: row.body.victim.role }] as const, ...(row.body.killer ? [[row.body.killer.pose, { row, side: 'killer' as const, role: row.body.killer.role }] as const] : [])]
  : []));
export const finisherBodyPose = (pose: string): FinisherBodyPose | undefined => BODY_POSES.get(pose);
// The plain death's id: the fall with no clip of its own (a staged pick whose clips are not installed by the kill falls back to it).
const PLAIN = FINISHERS.rows.find((r) => r.template === 'fall' && r.pose === null);
if (!PLAIN) throw Error('finisher-defs.json: no plain death (a fall row with pose null)');
export const PLAIN_DEATH: FinisherId = PLAIN.id;
// The pose word a template's own finisher hands its victim rig (its row's body.victim.pose): Hamstrung's and Execution's rows keep `pose` null.
export const bodyPoseOf = (id: FinisherId): string | null => finisherRow(id)?.body?.victim.pose ?? null;
