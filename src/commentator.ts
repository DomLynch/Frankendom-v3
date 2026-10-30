// The arena commentator (data/commentator.json; Dom-approved idea 2026-10-28; TEXT only, pro sound comes later): a sarcastic announcer line fades in near the top of the screen on game events. Presentation only: it reads the
// sim's events and the zone loop's state, never writes either, and touches no fight number.
// Two halves. `createCommentator` is the pure picker: per-event cooldown, a global gap, lines per minute, lines per session, a probability, and a line chosen by hash32(seed, event, its own count) so a replay or a
// test picks the same lines (no Math.random, no clock; time is the dt the page feeds it), never the line it said last for that event. `mountCommentator` adds the one caption element and the localStorage opt-out.
// Nothing allocates per frame: the frame/event calls only read numbers and bump fixed-size state; a string is built only when a line is actually said.
// EXTENSION POINT: other features call `commentator.say(eventId, params)`, e.g. say('wearing_parts', { partName }) when the Frankendom equip feature wears a taken part.
import COMMENTATOR from '../data/commentator.json' with { type: 'json' };
import { checkCommentator } from './sim/validate.js';
import { hash32 } from './fight/bout-seed.ts';

type CommentatorEventRow = { about: string; cooldownSeconds: number; probability: number; priority?: boolean; params?: string[]; lines: string[] };
type CommentatorFile = {
  about: string; enabled: boolean; storageKey: string; seed: string;
  caps: { perSession: number; perMinute: number; gapSeconds: number; minuteSeconds: number };
  caption: { seconds: number; fadeMs: number; maxChars: number; topPct: number; maxWidthPct: number; fontPx: number; colour: string; shadow: string; zIndex: number; css: string };
  thresholds: { heroLowPct: number; bossLowPct: number; missStreak: number; rollCount: number; rollWindowSeconds: number; idleSeconds: number; lowResetPct: number; idleMoveEpsilon: number; starTwoLevel: number };
  partNames: Record<string, string>;
  events: Record<string, CommentatorEventRow>;
};
type SayParams = Record<string, string>;
/** The sim's events, as far as the commentator reads them (src/fight/duel.ts CombatEvent). */
type SimEvent = { type: string; actor: number; target?: number; action?: string };

export const ROWS = COMMENTATOR as unknown as CommentatorFile;
/** A bad row stops the page at load (the same rule as every data file); an empty list = fine. */
export function validateCommentator(rows: CommentatorFile = ROWS): string[] { return checkCommentator(rows); }

type Commentator = {
  /** Say event `id` if the caps, the cooldown and the probability allow it: returns the line, or null. `params` fills {name} in the line; a line needing a param the call lacks is not said. */
  say(id: string, params?: SayParams): string | null;
  /** Advance the clock by dt seconds (frame() does this too). */
  advance(dt: number): void;
  /** One frame of the zone loop's state. Plain numbers and booleans: no object is made. hero/boss percent are 0..100; kind is the boss's profile id; star its star level. */
  frame(dt: number, engaged: boolean, heroDown: boolean, bossDown: boolean, heroPct: number, bossPct: number, kind: string, star: number, x: number, z: number): void;
  /** The sim's events for one tick (the array the page already has). */
  events(list: readonly SimEvent[]): void;
  /** A part was cut off a corpse: unit is the cut unit's id (data/physics.json cut). */
  cut(unit: string): void;
  setEnabled(on: boolean): void;
  readonly enabled: boolean;
  /** Lines said this session. */
  readonly said: number;
};

/** The pure picker. `sink` receives each line said (the page's caption); `names` maps a boss kind to its display name. */
export function createCommentator(rows: CommentatorFile, sink: (line: string) => void, names: Readonly<Record<string, string>> = {}, on: boolean = rows.enabled): Commentator {
  const { caps, thresholds: th } = rows;
  let enabled = on, clock = 0, said = 0, lastAny = -Infinity;
  const stamps = new Float64Array(caps.perMinute).fill(-Infinity);   // the times of the last perMinute lines (a ring): a new line needs the oldest one to be over a minute old
  let ring = 0;
  const lastAt: Record<string, number> = {}, lastLine: Record<string, number> = {}, calls: Record<string, number> = {}, rolls: Record<string, number> = {};
  for (const id of Object.keys(rows.events)) { lastAt[id] = -Infinity; lastLine[id] = -1; calls[id] = 0; rolls[id] = 0; }
  const rollTimes = new Float64Array(th.rollCount).fill(-Infinity); let rollAt = 0;
  // fight state
  let wasEngaged = false, wasHeroDown = false, wasBossDown = false, firstHit = false, misses = 0, heroLow = false, bossLow = false, idleFor = 0, lastX = NaN, lastZ = NaN;

  function say(id: string, params?: SayParams): string | null {
    const row = rows.events[id];
    if (!enabled || !row || said >= caps.perSession) return null;
    if (clock - lastAt[id]! < row.cooldownSeconds) return null;
    if (!row.priority && (clock - lastAny < caps.gapSeconds || clock - stamps[ring]! < caps.minuteSeconds)) return null;
    const need = row.params;
    if (need) for (let i = 0; i < need.length; i++) if (!params || typeof params[need[i]!] !== 'string') return null;
    if (row.probability < 1 && hash32(`${rows.seed}:p:${id}`, rolls[id]!++) / 4294967296 >= row.probability) return null;
    const n = row.lines.length, k = calls[id]!++;
    const last = lastLine[id]!, h = hash32(`${rows.seed}:${id}`, k);
    let pick = last < 0 ? h % n : h % (n - 1);   // after the first line: one of the OTHER lines (the last one said is skipped), so a line never repeats back to back
    if (last >= 0 && pick >= last) pick++;
    lastLine[id] = pick; lastAt[id] = clock; lastAny = clock; stamps[ring] = clock; ring = (ring + 1) % stamps.length; said++;
    let line = row.lines[pick]!;
    if (need) for (let i = 0; i < need.length; i++) line = line.split(`{${need[i]}}`).join(params![need[i]!]!);
    sink(line);
    return line;
  }
  const bossName = (kind: string) => names[kind] ?? kind.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const partName = (unit: string) => rows.partNames[unit] ?? unit.replace(/_/g, ' ');
  return {
    say,
    advance(dt) { if (dt > 0) clock += dt; },
    frame(dt, engaged, heroDown, bossDown, heroPct, bossPct, kind, star, x, z) {
      if (dt > 0) clock += dt;
      if (engaged && !wasEngaged && !heroDown) {   // a fight begins: its counters restart; a star boss gets his own introduction
        firstHit = false; misses = 0; heroLow = false; bossLow = false; rollTimes.fill(-Infinity);
        if (star > 0) { if (!say(star >= th.starTwoLevel ?'star_2' : 'star_1', { boss: bossName(kind) })) say('fight_start', { boss: bossName(kind) }); }
        else say('fight_start', { boss: bossName(kind) });
      }
      wasEngaged = engaged;
      if (heroDown && !wasHeroDown) say('hero_death');
      else if (!heroDown && wasHeroDown) { firstHit = false; misses = 0; heroLow = false; bossLow = false; say('respawn'); }
      wasHeroDown = heroDown;
      if (bossDown && !wasBossDown) say('boss_kill', { boss: bossName(kind) });
      wasBossDown = bossDown;
      if (engaged && !heroDown && !bossDown) {
        if (!heroLow && heroPct <= th.heroLowPct) { heroLow = true; say('hero_low'); }
        else if (heroLow && heroPct > th.heroLowPct + th.lowResetPct) heroLow = false;
        if (!bossLow && bossPct <= th.bossLowPct) { bossLow = true; say('boss_low'); }
        else if (bossLow && bossPct > th.bossLowPct + th.lowResetPct) bossLow = false;
      }
      if (!engaged && !heroDown && !bossDown) {   // idling: standing in the same place with nobody fighting him
        if (Math.abs(x - lastX) + Math.abs(z - lastZ) > th.idleMoveEpsilon|| lastX !== lastX) idleFor = 0; else idleFor += dt;
        if (idleFor >= th.idleSeconds) { idleFor = 0; say('idle'); }
      } else idleFor = 0;
      lastX = x; lastZ = z;
    },
    events(list) {
      for (let i = 0; i < list.length; i++) {
        const e = list[i]!;
        if (e.actor === 0) {
          if (e.type === 'Hit') { misses = 0; if (!firstHit) { firstHit = true; say('first_hit'); } }
          else if (e.type === 'AttackMissed') { if (++misses >= th.missStreak) { misses = 0; say('miss_streak'); } }
          else if (e.type === 'ActionStarted' && e.action === 'roll') {
            rollTimes[rollAt] = clock; rollAt = (rollAt + 1) % rollTimes.length;
            if (clock - rollTimes[rollAt]! <= th.rollWindowSeconds) { rollTimes.fill(-Infinity); say('roll_spam'); }   // the oldest of the last rollCount rolls is recent enough: that many in the window
          }
        } else if (e.type === 'GuardBroken' && e.target === 0) say('guard_break');
      }
    },
    cut(unit) { say('cut', { part: partName(unit) }); },
    setEnabled(v) { enabled = v; },
    get enabled() { return enabled; },
    get said() { return said; },
  };
}

type Doc = { createElement(tag: string): HTMLElement; body: HTMLElement; head: HTMLElement };
type Store = { getItem(k: string): string | null };
/** Off when the player's browser says so (localStorage[storageKey] === 'off'); every read is guarded. */
export function commentatorOn(rows: CommentatorFile, store: Store | null): boolean {
  if (!rows.enabled) return false;
  try { return store?.getItem(rows.storageKey) !== 'off'; } catch { return rows.enabled; }
}
function storeOf(): Store | null { try { return (globalThis as { localStorage?: Store }).localStorage ?? null; } catch { return null; } }

/** The caption's stylesheet (data/commentator.json caption.css) with its {topPct} {zIndex} {fadeMs} {maxWidthPct} {colour} {fontPx} {shadow} slots filled from the same row. */
export const captionCss = (c: CommentatorFile['caption']): string => { const { css, ...slots } = c as Record<string, unknown> & { css: string }; return css.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m)); };

/** The caption: one fixed element near the top (pointer-events none, under the bars and the radar's corner, above nothing the player taps), faded in for `caption.seconds`; a new line replaces the old. */
export function mountCaption(doc: Doc, rows: CommentatorFile, later: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms), clear: (t: unknown) => void = (t) => clearTimeout(t as number)) {
  const c = rows.caption, style = doc.createElement('style');
  style.textContent = captionCss(c);
  doc.head.append(style);
  const el = doc.createElement('div'); el.className = 'cm-line'; el.dataset.commentator = 'true'; el.setAttribute('aria-hidden', 'true');
  doc.body.append(el);
  let timer: unknown = null;
  return {
    show(text: string) { el.textContent = text; el.style.opacity = '1'; if (timer !== null) clear(timer); timer = later(() => { el.style.opacity = '0'; timer = null; }, c.seconds * 1000); },
    remove() { if (timer !== null) clear(timer); el.remove(); style.remove(); },
  };
}

/** The page's commentator: validated rows, the caption, the opt-out, the cut event from the ragdoll, and a debug handle. */
export function mountCommentator(doc: Doc, names: Readonly<Record<string, string>>, store: Store | null = storeOf()): Commentator {
  const bad = validateCommentator(); if (bad.length) throw new Error(`data/commentator.json: ${bad.join('; ')}`);
  let caption: ReturnType<typeof mountCaption> | null = null;
  const cm = createCommentator(ROWS, (line) => { (caption ??= mountCaption(doc, ROWS)).show(line); }, names, commentatorOn(ROWS, store));
  try { (globalThis as { addEventListener?: (t: string, f: (e: Event) => void) => void }).addEventListener?.('frankendom:cut', (e) => { const unit = (e as CustomEvent<{ unit?: unknown }>).detail?.unit; if (typeof unit === 'string') cm.cut(unit); }); } catch { /* no window */ }
  (globalThis as { __v3Commentator?: unknown }).__v3Commentator = cm;   // the stills and the tests say a line through the real path
  return cm;
}
