// Frankendom parts, the page's one entry (data/parts.json, src/parts.ts): listens for every cut of a fallen boss (the feel bus's corpse:cut, whose payload names the boss's profile id and the unit) and keeps the
// part automatically (no Take button, no prompt on the body), then mounts the ☰ menu. The save is the page's own (PROG.save): read through `get` at each use and written through `put`, so a corpse-run write
// in between is never overwritten by a stale copy. The star a part is cut at is the star its boss was killed at (`noteKill`, called where the page records the kill). No save (?save=off) mounts nothing.
import { feel } from './feel.ts';
import PHYSICS from '../../data/physics.json' with { type: 'json' };
import { PARTS, collect, equip, unequip, validateParts } from '../parts.ts';
import { levelOf, type StarsFile } from '../stars.ts';
import type { ProgressionFile, Save } from '../progression.ts';
import { mountPartsPanel } from './parts-panel.ts';

type PartsHookCtx = {
  get(): Save | null;
  put(save: Save): void;
  profiles: readonly { id: string; name?: string }[];
  stars: StarsFile;
  prog: ProgressionFile;
};
type PartsHook = { remove(): void };

export function mountParts(ctx: PartsHookCtx, doc: Document = document): PartsHook {
  const bad = validateParts(PARTS, ctx.stars.levels.length);
  if (bad.length) throw new Error(`data/parts.json: ${bad.join('; ')}`);
  const names = new Map(ctx.profiles.map((p) => [p.id, p.name ?? p.id]));
  const write = (next: Save) => ctx.put(next);
  const panel = mountPartsPanel(doc as unknown as Parameters<typeof mountPartsPanel>[0], {
    rows: PARTS,
    get: () => ctx.get(),
    onEquip(slot, id) { const s = ctx.get(); if (!s) return; const next = id === null ? unequip(s, slot) : equip(s, id); if (next !== s) write(next); },
    bossName: (profile) => names.get(profile) ?? profile,
    trophyOf: (star) => levelOf(ctx.stars, star).trophy?.name ?? null,
    weapon() {
      const s = ctx.get(), id = s?.unlocked[s.unlocked.length - 1];
      const row = id ? ctx.prog.bosses.find((b) => b.weapon === id) : undefined;
      return row ? { name: row.name, boss: names.get(row.id) ?? row.id } : null;
    },
  });
  const off = feel.on((PHYSICS as { corpse: { event: string } }).corpse.event,(_name, payload) => {
    try {
      const p = payload as { unit?: unknown; profile?: unknown; star?: unknown } | undefined, s = ctx.get();
      if (!s || !p || typeof p.unit !== 'string' || typeof p.profile !== 'string' || !names.has(p.profile)) return;
      const next = collect(s, p.profile, p.unit, typeof p.star === 'number' ? p.star : 0);   // the star the boss had when it fell (ragdoll.ts reads it at the kill), never a later kill's
      if (next !== s) { write(next); panel.refresh(); }
    } catch (error) { console.warn('parts: cut not recorded', error); }
  });
  return { remove() { off(); panel.remove(); } };
}
