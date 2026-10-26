// V3's opponent brains (data/brains.json): a row's knobs laid over the opponent's own V1 AI profile. The profile is only the argument
// stepPractice takes, so a brain row moves no sim code; with no row the V1 profile comes back as the same object (?ai=v1).
import type { AiProfile } from './fight/moves.ts';

export type BrainRow = { id: string } & Partial<AiProfile>;

export function brainProfile(base: AiProfile, row: BrainRow | undefined): AiProfile {
  if (!row) return base;
  const { id: _id, ...knobs } = row;
  return { ...base, ...knobs };
}

/** The row a fight plays: `?ai=v1` is V1's profile untouched (no row), otherwise the row `id` names (data/fight.json `ai`). */
export function brainFor(rows: readonly BrainRow[], id: string | undefined, search = ''): BrainRow | undefined {
  if (new URLSearchParams(search).get('ai') === 'v1' || id === undefined) return undefined;
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`brains.json has no row '${id}'`);
  return row;
}
