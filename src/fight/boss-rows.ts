// The boss specials' PRESENTATION rows (src/fight/bosses.json + bosses.manifest.json): one row per boss, read here. The two BossKind types, BOSS_KINDS, the class-skill map,
// the audio cue map and the effect registry entries are derived from these rows, so a new boss over an existing fx/at/travel verb is one row. `fx`, `at` and `travel` are verb ids
// (plain strings, checked against the code registries in tests/boss-rows.test.ts); a new mechanic is new code. Sim fields (Combat's) join the row when they reach it.
import ROWS from './bosses.json' with { type: 'json' };
import MANIFEST from './bosses.manifest.json' with { type: 'json' };
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';

export type BossRow = { id: string; label: string; opponent: string; rank: number; fx: string; at: 'feet' | 'head'; lift: number; cue: string; classSkill: string; travel?: string; look?: { day: BossLook; night: BossLook } };
export type BossLook = { core: readonly [number, number, number]; edge: readonly [number, number, number] };
export type BossKind = string;
loadRegistry(MANIFEST.tables.map((m) => tableFromFile(m as Manifest, ROWS, `src/fight/${m.file}`)));   // the shared loader (src/core/registry.ts): a duplicate id, missing field or wrong type throws at load, never last-wins; scripts/registry-check.mjs runs the same check, plus the raw duplicate-key scan, at the gate
export const BOSSES = ROWS as readonly BossRow[];
export const bossRow = (id: string) => BOSSES.find((r) => r.id === id);
export const kindsOf = (fx: string): readonly BossKind[] => BOSSES.filter((r) => r.fx === fx).map((r) => r.id);
export const classSkillOf = (fx: string, opponent: string) => BOSSES.find((r) => r.fx === fx && r.opponent === opponent)?.classSkill;
