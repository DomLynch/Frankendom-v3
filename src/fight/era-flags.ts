// The V3-era module flags a fight record stamps (audit C, 2026-10-29). stepDuel reads four module globals a driver sets (knock-sim, special-pace, special-terms,
// hero-mana); the record carried none of them, so a headless replay ran them OFF and could end a different fight than the page played. The record now carries which were ON
// when the fight began (createRecorder, one bit each, data/rows in era-flags-defs.json), and a replay sets exactly those for its run and puts the ambient ones back.
// A leaf of the simulation (no JSON of the game's own rows: the Gate 0 copy of the tree is `src/` alone; the rows a replay turns a flag ON from come in through an EraSource,
// src/fight/era-rows.ts). An absent stamp = every flag off = a headless run, so a record with no flag on is byte for byte as it was.
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import DEFS from './era-flags-defs.json' with { type: 'json' };
import MANIFEST from './era-flags-defs.manifest.json' with { type: 'json' };
import { KNOCK_SIM, setKnockSim, type KnockSim } from './knock-sim.ts';
import { SPECIAL_PACE, setSpecialPace, type SpecialPace } from './special-pace.ts';
import { SPECIAL_TERMS, setSpecialTerms, type SpecialTerms } from './special-terms.ts';
import { HERO_NO_MANA, setHeroNoMana } from './hero-mana.ts';
import { KNOCK_ROUND, setKnockRound } from './knock-round.ts';

/** The rows a replay turns each flag ON from (the page's own defaults: era-rows.ts reads data/fight.json and data/feel-sim.json). null / false = the data says that flag is off. */
export type EraSource = {
  readonly knockSim: () => KnockSim | null;
  readonly specialPace: () => SpecialPace | null;
  readonly specialTerms: () => SpecialTerms | null;
  readonly heroNoMana: () => boolean;
  readonly knockRound: () => boolean;
};
type Handler = { on: () => boolean; set: (on: boolean, src: EraSource) => void };
const need = <T>(v: T | null, id: string): T => { if (v === null) throw Error(`era flag ${id}: the record was fought with it ON and this build's data rows have it off, so the replay cannot step the same fight`); return v; };
const HANDLERS: Readonly<Record<string, Handler>> = {
  'knock-sim': { on: () => KNOCK_SIM !== null, set: (on, src) => setKnockSim(on ? need(src.knockSim(), 'knock-sim') : null) },
  'special-pace': { on: () => SPECIAL_PACE !== null, set: (on, src) => setSpecialPace(on ? need(src.specialPace(), 'special-pace') : null) },
  'special-terms': { on: () => SPECIAL_TERMS !== null, set: (on, src) => setSpecialTerms(on ? need(src.specialTerms(), 'special-terms') : null) },
  'hero-mana': { on: () => HERO_NO_MANA, set: (on, src) => { if (on && !src.heroNoMana()) need(null, 'hero-mana'); setHeroNoMana(on); } },
  'knock-round': { on: () => KNOCK_ROUND, set: (on, src) => { if (on && !src.knockRound()) need(null, 'knock-round'); setKnockRound(on); } },
};

const TABLE = tableFromFile(MANIFEST.tables[0] as unknown as Manifest, DEFS, 'era-flags-defs.json');
loadRegistry([TABLE]);
/** The flag rows in bit order. */
export const ERA_FLAGS: readonly { readonly id: string; readonly bit: number }[] = (TABLE.rows as unknown as { id: string; bit: number }[]).map((r) => ({ id: r.id, bit: r.bit })).sort((a, b) => a.bit - b.bit);
const mismatch = [...ERA_FLAGS.map((f) => f.id).filter((id) => !HANDLERS[id]), ...Object.keys(HANDLERS).filter((id) => !ERA_FLAGS.some((f) => f.id === id))];
if (mismatch.length) throw Error(`era-flags-defs.json and era-flags.ts disagree on: ${mismatch.join(', ')}`);

/** The ids of the flags that are ON right now, in bit order: what a fight beginning now is stamped with (undefined = none, the record is unchanged). */
export function eraStamp(): readonly string[] | undefined {
  const on = ERA_FLAGS.filter((f) => HANDLERS[f.id]!.on()).map((f) => f.id);
  return on.length ? on : undefined;
}
/** The stamp as the record's era byte. */
export const eraByte = (ids: readonly string[]): number => ids.reduce((b, id) => { const f = ERA_FLAGS.find((x) => x.id === id); if (!f) throw Error(`Fight record: unknown era flag "${id}"`); return b | (1 << f.bit); }, 0);
/** The era byte as ids in bit order; a bit no row names is refused (a record from a build that knew a flag this one does not). */
export function eraIds(byte: number): readonly string[] {
  const known = ERA_FLAGS.reduce((m, f) => m | (1 << f.bit), 0);
  if (byte === 0 || (byte & ~known) !== 0) throw Error('Fight record: unknown era flags');
  return ERA_FLAGS.filter((f) => byte & (1 << f.bit)).map((f) => f.id);
}
/** Runs `run` with exactly the stamped flags ON (from `src`) and every other flag OFF, then puts the ambient flags back. An absent stamp = all off (the headless run). */
export function underEra<T>(stamp: readonly string[] | undefined, src: EraSource, run: () => T): T {
  const outer = { knockSim: KNOCK_SIM, specialPace: SPECIAL_PACE, specialTerms: SPECIAL_TERMS, heroNoMana: HERO_NO_MANA, knockRound: KNOCK_ROUND };
  try {
    for (const f of ERA_FLAGS) HANDLERS[f.id]!.set(!!stamp?.includes(f.id), src);
    return run();
  } finally { setKnockSim(outer.knockSim); setSpecialPace(outer.specialPace); setSpecialTerms(outer.specialTerms); setHeroNoMana(outer.heroNoMana); setKnockRound(outer.knockRound); }
}
