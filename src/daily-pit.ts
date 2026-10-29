// DAILY PIT (data/daily-pit.json; Dom 2026-10-28): one seeded boss fight a day with ONE chaos modifier, the same for everyone. This file is the pure rules: the UTC day, the boss and the modifier a date
// picks, the run the page is built with (a ?tune= map over the day's boss, a star level, a one-boss zone), the score, the tracker that turns frames into a result, and the optional `daily` field of the
// progression save. No DOM, no storage, no clock of its own (the caller hands in the time), so a fixed date is a fixed fight and a test needs no browser. The page side is src/daily-pit-ui.ts.
// Nothing here is a sim rule: a modifier is a ?tune= multiplier (src/tune.ts, merged OVER the page's tune by the caller with src/progression.ts mergeTune) and/or a data/stars.json level.
import { hash32 } from './fight/bout-seed.ts';
import type { TuneMap } from './tune.ts';
import type { ZoneRow } from './zone/zone-rows.ts';
import { checkDailyPit } from './sim/validate.js';

type DailyModifier = { id: string; name: string; about: string; tune: Readonly<Partial<Record<'health' | 'damage' | 'speed', number>>>; stars: number };
type DailyScoreRows = { base: number; perSecond: number; perDamage: number; perPart: number; min: number; max: number; fields: readonly ('time' | 'damage' | 'parts')[] };
export type DailyFile = {
  salt: string; attemptsPerDay: number; modeKey: string; event: string; cutLog: string; spawnId: string; respawnSeconds: number; resultDelaySeconds: { won: number; lost: number };
  bosses: readonly string[]; modifiers: readonly DailyModifier[]; score: DailyScoreRows;
  ui: { zIndex: number; colour: Record<'gold' | 'ink' | 'panel' | 'line' | 'win' | 'lose', string>; text: Record<string, string> };
  later: readonly { id: string; why: string }[];
};
/** One finished attempt: what the result screen shows and the save keeps. */
type DailyRow = { score: number; timeSeconds: number; damage: number; parts: number; won: boolean; boss: string; modifier: string };
/** The `daily` field of the progression save: today's attempts and best, and the best score ever. */
export type DailyRecord = { date: string; attempts: number; best: DailyRow | null; last: DailyRow | null; bestEver: number };
/** The day's fight: the boss, the modifier and what the page lays over the shipped game. */
export type DailyRun = { date: string; boss: string; modifier: DailyModifier; spawnId: string; respawnSeconds: number; tune: TuneMap; stars: number };
/** What the share clip and a later leaderboard receive (the DOM event's detail, `onResult`'s argument). */
export type DailyResult = { date: string; boss: string; modifier: string; attempt: number; row: DailyRow; best: DailyRow | null; bestEver: number; newBest: boolean };

/** Why `file` is not a good Daily Pit table (one string per problem; empty = fine). `ctx`: the parsed data/profiles.json, tune.json, physics.json and zone row for the cross-file checks. */
export const validateDaily = (file: DailyFile, ctx?: { profiles: unknown; tune: unknown; physics: unknown; zone: unknown }): string[] => checkDailyPit(file, ctx) as string[];

/** The UTC date of a time (ms since 1970): YYYY-MM-DD. The day rolls over at 00:00 UTC for everyone. */
export const dayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

const hashIndex = (file: DailyFile, date: string, part: string, n: number): number => hash32(`${file.salt}|${date}|${part}`, 0) % n;
/** The boss and the modifier of `date`: a pure function of the date and the table's salt. */
export function pickFor(file: DailyFile, date: string): { boss: string; modifier: DailyModifier } {
  return { boss: file.bosses[hashIndex(file, date, 'boss', file.bosses.length)]!, modifier: file.modifiers[hashIndex(file, date, 'modifier', file.modifiers.length)]! };
}

/** The run of `date`: the boss's ?tune= multipliers (empty when the modifier has none, so the merge returns the page's tune itself), the star level and the spawn slot. */
export function runFor(file: DailyFile, date: string): DailyRun {
  const { boss, modifier } = pickFor(file, date);
  return { date, boss, modifier, spawnId: file.spawnId, respawnSeconds: file.respawnSeconds, tune: Object.keys(modifier.tune).length ? { [boss]: { ...modifier.tune } as Record<string, number> } : {}, stars: modifier.stars };
}

/** `zone` as the daily plays it: the one spawn the row names, standing as the day's boss (same place, same id, so the opener opens the fight), and no other boss, ring or camp. Never mutates `zone`. */
export function dailyZone(zone: ZoneRow, run: DailyRun): ZoneRow {
  const slot = zone.spawns.find((s) => s.id === run.spawnId);
  if (!slot) return zone;
  return { ...zone, spawns: [{ ...slot, kind: run.boss, respawnSeconds: run.respawnSeconds }] };
}

/** The score of one attempt: a win is `base` less the time, the damage taken and plus the parts cut, held to min..max; a defeat is `min`. A whole number. */
export function scoreOf(file: Pick<DailyFile, 'score'>, a: { timeSeconds: number; damage: number; parts: number; won: boolean }): number {
  const s = file.score;
  if (!a.won) return s.min;
  return Math.round(Math.min(s.max, Math.max(s.min, s.base - s.perSecond * a.timeSeconds - s.perDamage * a.damage + s.perPart * a.parts)));
}

/** The record for `date`: the stored one when it is today's, else a new day (no attempts, no best) that keeps the best ever. */
export const recordFor = (rec: DailyRecord | undefined, date: string): DailyRecord => (rec && rec.date === date ? rec : { date, attempts: 0, best: null, last: null, bestEver: rec?.bestEver ?? 0 });
/** Attempts still open on `date`. */
export const attemptsLeft = (file: Pick<DailyFile, 'attemptsPerDay'>, rec: DailyRecord | undefined, date: string): number => Math.max(0, file.attemptsPerDay - recordFor(rec, date).attempts);
/** The record after an attempt starts (the boss engaged). */
export const spendAttempt = (rec: DailyRecord | undefined, date: string): DailyRecord => { const r = recordFor(rec, date); return { ...r, attempts: r.attempts + 1 }; };
/** The record after an attempt ends: `last` is the row, `best` the better win of the day, `bestEver` the best score ever. */
export function finishAttempt(rec: DailyRecord | undefined, date: string, row: DailyRow): { rec: DailyRecord; newBest: boolean } {
  const r = recordFor(rec, date), newBest = row.won && (!r.best || row.score > r.best.score);
  return { rec: { ...r, last: row, best: newBest ? row : r.best, bestEver: Math.max(r.bestEver, row.won ? row.score : 0) }, newBest };
}

// ---- the tracker: frames in, one result out ---------------------------------------------------------------------------------------------------------------------------------------------------------

type Phase = 'idle' | 'fighting' | 'won' | 'lost' | 'done';
export type Tracker = { phase: Phase; time: number; damage: number; lastHealth: number | null; cutsAtStart: number; wait: number };
/** One frame of the page: the step in seconds, whether the boss is engaged, the hero's health, whether he won / fell, and the length of the cut log. */
export type Frame = { dt: number; engaged: boolean; heroHealth: number; won: boolean; lost: boolean; cuts: number };
export const freshTracker = (): Tracker => ({ phase: 'idle', time: 0, damage: 0, lastHealth: null, cutsAtStart: 0, wait: 0 });
const round = (n: number, places: number): number => Math.round(n * 10 ** places) / 10 ** places;

/**
 * The tracker after `f`. `spent`: the boss engaged on this frame (the attempt is spent now). `row`: the attempt's result, once, `resultDelaySeconds` after the kill or the fall (so the ceremony and the
 * cuts are seen first). Time counts only while the boss is engaged and nobody has won or fallen; damage is every hit point the hero loses; parts are the cut log's growth since the first blow.
 */
export function stepTracker(t: Tracker, f: Frame, file: Pick<DailyFile, 'score' | 'resultDelaySeconds'>, who: { boss: string; modifier: string }): { t: Tracker; spent: boolean; row: DailyRow | null } {
  if (t.phase === 'done') return { t, spent: false, row: null };
  if (t.phase === 'idle') return f.engaged ? { t: { ...t, phase: 'fighting', lastHealth: f.heroHealth, cutsAtStart: f.cuts }, spent: true, row: null } : { t, spent: false, row: null };
  const lost = t.lastHealth !== null ? Math.max(0, t.lastHealth - f.heroHealth) : 0;
  let n: Tracker = { ...t, damage: t.damage + lost, lastHealth: f.heroHealth };
  if (n.phase === 'fighting') {
    if (f.won) n = { ...n, phase: 'won', wait: 0 };
    else if (f.lost) n = { ...n, phase: 'lost', wait: 0 };
    else return { t: f.engaged ? { ...n, time: n.time + f.dt } : n, spent: false, row: null };
  }
  n = { ...n, wait: n.wait + f.dt };
  const won = n.phase === 'won';
  if (n.wait < (won ? file.resultDelaySeconds.won : file.resultDelaySeconds.lost)) return { t: n, spent: false, row: null };
  const a = { timeSeconds: round(n.time, 1), damage: Math.round(n.damage), parts: Math.max(0, f.cuts - n.cutsAtStart), won };
  return { t: { ...n, phase: 'done' }, spent: false, row: { ...a, score: scoreOf(file, a), boss: who.boss, modifier: who.modifier } };
}

// ---- the save field ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const WORD = /^[a-z0-9-]{1,32}$/, DATE = /^\d{4}-\d{2}-\d{2}$/;
const whole = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null);
function cleanRow(v: unknown): DailyRow | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>, score = whole(r.score, 1e7), damage = whole(r.damage, 1e7), parts = whole(r.parts, 999);
  const time = typeof r.timeSeconds === 'number' && Number.isFinite(r.timeSeconds) && r.timeSeconds >= 0 && r.timeSeconds <= 86400 ? r.timeSeconds : null;
  if (score === null || damage === null || parts === null || time === null || typeof r.won !== 'boolean' || typeof r.boss !== 'string' || !WORD.test(r.boss) || typeof r.modifier !== 'string' || !WORD.test(r.modifier)) return null;
  return { score, timeSeconds: time, damage, parts, won: r.won, boss: r.boss, modifier: r.modifier };
}
/** The `daily` field of a stored save object: `{ daily }` when it is well-formed, `{}` for a save from before the Daily Pit or a corrupt field (the old save loads as it was). */
export function cleanDaily(j: { daily?: unknown }): { daily?: DailyRecord } {
  const d = j.daily;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return {};
  const r = d as Record<string, unknown>, attempts = whole(r.attempts, 999), bestEver = whole(r.bestEver, 1e7);
  if (typeof r.date !== 'string' || !DATE.test(r.date) || attempts === null || bestEver === null) return {};
  return { daily: { date: r.date, attempts, best: cleanRow(r.best), last: cleanRow(r.last), bestEver } };
}

/** `{boss}`-style slots of a data/daily-pit.json ui.text line filled in. */
export const fill = (line: string, v: Record<string, string | number>): string => line.replace(/\{([a-z]+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
/** Seconds as m:ss.t for the result screen. */
export function clock(seconds: number): string {
  const t = Math.max(0, Math.round(seconds * 10)), m = Math.floor(t / 600), s = t - m * 600;
  return `${m}:${String(Math.floor(s / 10)).padStart(2, '0')}.${s % 10}`;
}

// ---- the hook for the share clip and the leaderboard ---------------------------------------------------------------------------------------------------------------------------------------------

type Sink = (r: DailyResult) => void;
const sinks: Sink[] = [];
/** Listens for every finished attempt. The share clip lane subscribes here (or to the DOM event, data/daily-pit.json `event`); a Supabase leaderboard submit is one more `onResult` after online lands. Returns the unsubscribe. */
export function onResult(fn: Sink): () => void { sinks.push(fn); return () => { const i = sinks.indexOf(fn); if (i >= 0) sinks.splice(i, 1); }; }
/** Hands `r` to every listener; one that throws never stops the others or the page. */
export function emitResult(r: DailyResult): void { for (const fn of [...sinks]) { try { fn(r); } catch (error) { console.warn('daily pit: a result listener threw', error); } } }
