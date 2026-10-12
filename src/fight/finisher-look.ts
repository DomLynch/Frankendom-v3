import { FINISHERS, finisherRow, type FinisherId } from './finishers.ts';
import type { FinisherTemplate } from './finisher-rows.ts';

// The presentation's questions about a finisher, answered from its row (src/fight/finisher-defs.json), never from its name: which template
// (the engine verb whose code path plays it), whether it is the plain death (the fall with no clip of its own: no ceremony), and whether its
// clip is shelved (kept, but the scene plays the plain fall in its place). Pure, three-free.
export const templateOf = (id: FinisherId | null): FinisherTemplate | null => (id === null ? null : finisherRow(id)?.template ?? null);
export const isTemplate = (id: FinisherId | null, ...templates: readonly FinisherTemplate[]): boolean => { const t = templateOf(id); return t !== null && templates.includes(t); };
export const isPlainDeath = (id: FinisherId | null): boolean => { const row = id === null ? undefined : finisherRow(id); return !!row && row.template === 'fall' && row.pose === null; };
export const isShelved = (id: FinisherId | null): boolean => (id === null ? false : finisherRow(id)?.shelved === true);
// Does any finisher of this template pass `supports` (an opponent's allow-list): the scene prepares a template's bake only for a body that can play it.
export const anyOfTemplate = (template: FinisherTemplate, supports: (id: FinisherId) => boolean): boolean => FINISHERS.rows.some((r) => r.template === template && supports(r.id));
