// How a creature is hurt and how it bleeds, read from its catalogue row (World's #2000 schema, Release K5). Pure: no renderer, nothing keyed by creature name. A creature is a catalogue
// row with a `wounds` field (src/fight/catalogue.ts); the body families (which part a hit can land on) and the species (the blood) are the tables in src/fight/body-tables.ts. A row with no
// `wounds`, or a species with no blood, draws nothing here (the Pit's own gore stays the men's and the goblin's). Presentation only: nothing here is read by the simulation, and every roll
// comes from a seed the caller derives from the fight's own tick, so a replay draws the same wounds. Donor: Cataclysm-DDA (CC BY-SA, shape only): body_parts hit_size -> Part.weight,
// monster bleed_rate -> Wounds.bleedRate.
import { BODYTYPES, SPECIES } from './body-tables.ts';
import { makeRng } from './blood-style.ts';
import { catalogueRow } from './catalogue-rows.ts';
import type { Part, Species, Wounds } from './catalogue.ts';

export type WoundSpec = { id: string; wounds: Wounds; parts: readonly Part[]; species: Species };

const specs = new Map<string, WoundSpec | null>();
/** The wound spec of a creature: its catalogue row by the `character:` id (the Ember wolf's own row), else by its body's roster id (the Ash wolf is the `wolf` row); null = it draws no wounds. */
export function woundSpec(character: string, body: string): WoundSpec | null {
  const key = `${character}|${body}`;
  if (specs.has(key)) return specs.get(key)!;
  const row = catalogueRow(character.replace(/^character:/, '')) ?? catalogueRow(body), w = row?.wounds, bt = w && BODYTYPES[w.body], sp = w && SPECIES[w.species];
  const out = row && w && bt && sp ? { id: row.id, wounds: w, parts: bt.parts, species: sp } : null;
  specs.set(key, out);
  return out;
}

/** One unit-interval stream from a seed (mulberry32), so a roll is the fight's, not the clock's. */
export const unit = (seed: number): number => makeRng(seed)();

/** The part a hit lands on: the parts' weights as shares (CDDA hit_size), `u` in [0, 1). */
export function pickPart(spec: WoundSpec, u: number): Part {
  let at = u * spec.parts.reduce((n, p) => n + p.weight, 0);
  for (const p of spec.parts) { at -= p.weight; if (at < 0) return p; }
  return spec.parts[spec.parts.length - 1]!;
}

/** What one hit sprays: the multiple of the Pit's particle counts (species spray x the creature's size) and the colours; null = it does not bleed. */
export function sprayOf(spec: WoundSpec): { amount: number; start: string; end: string } | null {
  const b = spec.species.blood;
  return b ? { amount: spec.species.spray * spec.wounds.size, start: b.start, end: b.end } : null;
}

/** The deepest tier an hp fraction has fallen below (tiers are strictly descending), or -1 while it is still whole enough. */
export function tierAt(w: Wounds, hpFrac: number): number {
  let at = -1;
  for (let i = 0; i < w.tiers.length; i++) if (hpFrac < w.tiers[i]!.below) at = i;
  return at;
}

/** Drips per second at an hp fraction: the row's bleed rate x the species spray x its size x the tier's drip (0 above the first tier, or for a species that does not bleed). */
export function dripRate(spec: WoundSpec, hpFrac: number): number {
  const t = tierAt(spec.wounds, hpFrac);
  return t < 0 || !spec.species.blood ? 0 : spec.wounds.bleedRate * spec.species.spray * spec.wounds.size * spec.wounds.tiers[t]!.drip;
}

/** Bleeding over time, one entry per creature: how many drips fall this frame and how many new marks the creature has earned by crossing a tier. */
export function createBleeders() {
  const state = new Map<string, { acc: number; marks: number }>();
  return {
    tick(id: string, spec: WoundSpec, hpFrac: number, dt: number): { drips: number; marks: number } {
      const s = state.get(id) ?? { acc: 0, marks: 0 }; state.set(id, s);
      s.acc += dripRate(spec, hpFrac) * dt;
      const drips = Math.floor(s.acc); s.acc -= drips;
      const t = tierAt(spec.wounds, hpFrac), want = t < 0 ? 0 : spec.wounds.tiers[t]!.decals, marks = Math.max(0, want - s.marks);
      s.marks = Math.max(s.marks, want);
      return { drips, marks };
    },
    forget(id: string): void { state.delete(id); },
  };
}
