// Boss tuning by URL (data/tune.json): ?tune=gargantua.health:1.2,arachne.damage:0.9 multiplies one boss's health, damage or speed for one page view, so Dom tunes on his phone and the
// final numbers are committed once. The table of kinds and keys (with min/max clamps) is data; no ?tune= is an empty map and every function here returns its input untouched, so the
// default fight is byte for byte the one before this file. Pure: the page, the tests and the debug readout ask the same functions.
import type { Opponent } from './fight/moves.ts';
import type { Resolved } from './difficulty.ts';

type TuneKey = { id: string; min: number; max: number; about?: string };
export type TuneFile = { query: string; kinds: Record<string, string>; keys: readonly TuneKey[] };
/** profile id -> key id -> multiplier (only what the address named). */
export type TuneMap = Readonly<Record<string, Readonly<Record<string, number>>>>;

/** Why `file` is not a good tune table (one string per problem; empty = fine). `profileIds`: the data/profiles.json row ids a kind may name. */
export function validateTune(file: TuneFile, profileIds: readonly string[]): string[] {
  const e: string[] = [];
  if (typeof file.query !== 'string' || !/^[a-z]+$/.test(file.query)) e.push('tune.query: a lower-case word');
  for (const [name, id] of Object.entries(file.kinds ?? {})) if (!/^[a-z]+$/.test(name) || !profileIds.includes(id)) e.push(`tune.kinds.${name}: "${String(id)}" is no profiles.json row`);
  if (!Object.keys(file.kinds ?? {}).length) e.push('tune.kinds: at least one kind');
  const seen = new Set<string>();
  for (const k of file.keys ?? []) {
    if (typeof k.id !== 'string' || !/^[a-z]+$/.test(k.id) || seen.has(k.id)) e.push(`tune.keys.${String(k.id)}: a unique lower-case word`); else seen.add(k.id);
    if (!(k.min > 0 && Number.isFinite(k.max) && k.min <= 1 && k.max >= 1)) e.push(`tune.keys.${k.id}: 0 < min <= 1 <= max (1 is the default, no override)`);
  }
  if (!seen.size) e.push('tune.keys: at least one key');
  return e;
}

/** The overrides `?tune=` names. Unknown kinds/keys and non-numbers are dropped, out-of-range numbers clamped, each with a warning (never throws). */
export function tuneFrom(file: TuneFile, search: string, warn: (m: string) => void = (m) => console.warn(m)): TuneMap {
  const raw = new URLSearchParams(search).get(file.query);
  if (raw === null) return {};
  const out: Record<string, Record<string, number>> = {};
  for (const item of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = /^([a-z]+)\.([a-z]+):(.+)$/.exec(item);
    const kind = m ? file.kinds[m[1]!] : undefined, key = m ? file.keys.find((k) => k.id === m[2]) : undefined, n = m && /^\d*\.?\d+$/.test(m[3]!) ? Number(m[3]) : NaN;
    if (!m || kind === undefined || !key || !Number.isFinite(n)) { warn(`?${file.query}=${item} ignored (want <${Object.keys(file.kinds).join('|')}>.<${file.keys.map((k) => k.id).join('|')}>:<number>)`); continue; }
    const v = Math.min(key.max, Math.max(key.min, n));
    if (v !== n) warn(`?${file.query}=${item} clamped to ${v} (${key.id} runs ${key.min}-${key.max})`);
    (out[kind] ??= {})[key.id] = v;
  }
  return out;
}

/** `r` with the kind's health and damage multipliers laid over its scales; no override for the kind returns the same object. */
export function tunedResolved(r: Resolved, tune: TuneMap | undefined, kind: string): Resolved {
  const t = tune?.[kind];
  if (!t) return r;
  return { ...r, foeHealthScale: r.foeHealthScale * (t.health ?? 1), foeDamageScale: r.foeDamageScale * (t.damage ?? 1) };
}

/** `o` with the kind's speed multiplier laid over his pace; no speed override returns the same object. */
export function tunedOpponent(o: Opponent, tune: TuneMap | undefined, kind: string): Opponent {
  const s = tune?.[kind]?.speed;
  return s === undefined ? o : { ...o, speed: (o.speed ?? 1) * s };
}
