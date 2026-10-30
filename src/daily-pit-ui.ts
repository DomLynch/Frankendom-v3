// DAILY PIT, the page side (data/daily-pit.json ui; rules in src/daily-pit.ts): the "Daily Pit" button, its card (today's boss and twist, attempts left, the best score), the banner that names the twist in
// the fight, the result screen, and the controller that feeds the tracker one frame at a time and keeps the day's record in the progression save. Presentation and a record only: it never touches the sim,
// the camera or the input (the banner and the button take no touch from the stick or the look thumb except on their own box), and everything that reads storage is inside try/catch.
// Entering the daily: the button sets the mode key in sessionStorage (value = the UTC date) and reloads; the page then boots INTO the daily (src/client/main.ts asks `daily.run`). There is no URL flag.
import { attemptsLeft, clock, dailyZone, dayKey, emitResult, fill, finishAttempt, freshTracker, recordFor, runFor, spendAttempt, stepTracker, validateDaily, type DailyFile, type DailyRecord, type DailyResult, type DailyRun, type Frame, type Tracker } from './daily-pit.ts';
import { loadSave, writeSave, type ProgressionFile, type Store } from './progression.ts';
import type { TuneMap } from './tune.ts';
import type { ZoneRow } from './zone/zone-rows.ts';

/** The Daily Pit stylesheet (data/daily-pit.json ui.css): each rule with its {z} {zdown} {zup} (the row's z-index, one under, one over) and {gold} {ink} {panel} {line} colour slots filled in, one rule per line. */
export const dailyCss = (ui: DailyFile['ui']): string => ui.css.map((rule) => fill(rule, { z: ui.zIndex, zdown: ui.zIndex - 1, zup: ui.zIndex + 1, ...ui.colour })).join('\n');

type DailyOptions = {
  file: DailyFile; doc: Document; win: Window;
  /** The progression save's storage (localStorage) and its table; `useSave` false (?save=off, ?pitborn=v1) keeps the day's record in memory only. */
  store: Store | null; session: Store | null; progression: ProgressionFile; useSave: boolean;
  now: () => number; reload: () => void; cuts: () => number;
  /** A boss's name for the card: a profile row's `name`, else its id. */
  nameOf: (kind: string) => string;
};
type Daily = {
  /** The day's run when this page IS the daily, else null. */
  readonly run: DailyRun | null;
  /** The ?tune= map the daily lays over the boss (empty outside the daily). */
  readonly tune: TuneMap;
  /** The star level the daily's boss stands at (0 outside the daily). */
  readonly stars: number;
  /** The zone this page plays: the daily's one-boss zone inside the daily, else `zone` itself. */
  zoneFor(zone: ZoneRow): ZoneRow;
  /** One frame of the zone loop. */
  frame(f: Omit<Frame, 'cuts'>): void;
};

const safe = <T>(fn: () => T, otherwise: T): T => { try { return fn(); } catch { return otherwise; } };
/** The page's sessionStorage, or null when the browser blocks it (reading the property can throw). */
export const sessionOf = (win: { sessionStorage?: Store }): Store | null => safe(() => win.sessionStorage ?? null, null);

export function createDaily(o: DailyOptions): Daily {
  const bad = validateDaily(o.file); if (bad.length) throw new Error(`data/daily-pit.json: ${bad.join('; ')}`);
  const { file, doc } = o, text = file.ui.text, colour = file.ui.colour, date = dayKey(o.now());
  const stored = (): DailyRecord | undefined => (o.useSave ? loadSave(o.store, o.progression).daily : undefined);
  let rec = recordFor(stored(), date);
  const left = () => attemptsLeft(file, rec, date);
  const mode = safe(() => o.session?.getItem(file.modeKey) === date, false);
  const canEnter = !!o.session;   // without sessionStorage the page cannot carry the mode across the reload: the card shows no Fight button
  const run = mode && left() > 0 ? runFor(file, date) : null;
  if (mode && !run) safe(() => o.session?.setItem(file.modeKey, ''), undefined);   // the day's attempts are spent: the next load is the plain world
  const persist = () => { if (!o.useSave) return; safe(() => { const s = loadSave(o.store, o.progression); writeSave(o.store, o.progression, { ...s, daily: rec }); }, undefined); };
  let tracker: Tracker = freshTracker();
  let lastResult: DailyResult | null = null;

  // ---- DOM ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const style = doc.createElement('style');
  style.textContent = dailyCss(file.ui);
  doc.head.append(style);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement = doc.body): HTMLElementTagNameMap[K] => { const e = doc.createElement(tag); e.className = cls; parent.append(e); return e; };

  const button = el('button', 'dp-btn'); button.type = 'button'; button.id = 'daily-pit-button'; button.textContent = run ? text.buttonLeave : text.button;
  const card = el('div', 'dp-card'); card.hidden = true; card.id = 'daily-pit-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', text.cardTitle);
  const bossName = o.nameOf((run ?? runFor(file, date)).boss), twist = (run ?? runFor(file, date)).modifier;

  function drawCard() {
    const best = rec.best, n = left();
    card.replaceChildren();
    const add = (tag: 'h2' | 'p' | 'small', s: string) => { const e = doc.createElement(tag); e.textContent = s; card.append(e); };
    add('h2', text.cardTitle); add('small', fill(text.cardToday, { date }));
    add('p', fill(text.cardBoss, { boss: bossName })); add('p', fill(text.cardModifier, { modifier: twist.name })); add('small', twist.about);
    add('p', fill(text.cardAttempts, { left: n, max: file.attemptsPerDay }));
    add('p', best ? fill(text.cardBest, { score: best.score }) : text.cardBestNone);
    if (rec.bestEver > 0) add('small', fill(text.cardBestEver, { score: rec.bestEver }));
    if (n === 0) add('small', text.noneLeft);
    const row = el('div', 'dp-row', card);
    if (n > 0 && canEnter) { const go = el('button', 'dp-go', row); go.type = 'button'; go.id = 'daily-pit-fight'; go.textContent = text.fight; go.addEventListener('click', () => { safe(() => o.session?.setItem(file.modeKey, date), undefined); o.reload(); }); }
    const close = el('button', '', row); close.type = 'button'; close.textContent = text.close; close.addEventListener('click', () => { card.hidden = true; });
  }
  button.addEventListener('click', () => {
    if (run) { safe(() => o.session?.setItem(file.modeKey, ''), undefined); o.reload(); return; }
    if (card.hidden) { rec = recordFor(stored() ?? rec, date); drawCard(); }
    card.hidden = !card.hidden;
  });

  if (run) {
    const banner = el('div', 'dp-banner'); banner.id = 'daily-pit-banner'; banner.setAttribute('role', 'status');
    const line = doc.createElement('span'); line.textContent = fill(text.banner, { modifier: run.modifier.name }); const sub = doc.createElement('small'); sub.textContent = run.modifier.about; banner.append(line, sub);
  }

  function showResult(r: DailyResult) {
    const wrap = el('div', 'dp-result'); wrap.id = 'daily-pit-result'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
    const panel = el('div', 'dp-panel', wrap);
    const h = el('h2', '', panel); h.textContent = r.row.won ? text.won : text.lost; h.style.color = r.row.won ? colour.win : colour.lose;
    const sub = el('small', '', panel); sub.textContent = `${bossName} · ${twist.name} · ${r.date}`;
    const big = el('div', 'dp-big', panel); big.textContent = `${text.score} ${r.row.score}`;
    const value = { time: clock(r.row.timeSeconds), damage: String(r.row.damage), parts: String(r.row.parts) };
    for (const f of file.score.fields) { const l = el('div', 'dp-line', panel); const a = doc.createElement('span'); a.textContent = text[f]!; const b = doc.createElement('span'); b.textContent = value[f]; l.append(a, b); }
    if (r.newBest) { const p = el('p', '', panel); p.textContent = text.newBest; p.style.color = colour.gold; }
    else if (r.best) { const p = el('small', '', panel); p.textContent = fill(text.cardBest, { score: r.best.score }); }
    const n = left(), row = el('div', 'dp-row', panel);
    if (n > 0) { const again = el('button', 'dp-go', row); again.type = 'button'; again.id = 'daily-pit-again'; again.textContent = fill(text.again, { left: n }); again.addEventListener('click', () => o.reload()); }
    else { const p = el('small', '', panel); p.textContent = text.noneLeft; panel.insertBefore(p, row); }
    const back = el('button', '', row); back.type = 'button'; back.id = 'daily-pit-back'; back.textContent = text.back; back.addEventListener('click', () => { safe(() => o.session?.setItem(file.modeKey, ''), undefined); o.reload(); });
  }

  const handle: Daily = {
    run, tune: run?.tune ?? {}, stars: run?.stars ?? 0,
    zoneFor: (zone) => (run ? dailyZone(zone, run) : zone),
    frame(f) {
      if (!run || tracker.phase === 'done') return;
      const out = stepTracker(tracker, { ...f, cuts: Math.max(0, safe(o.cuts, 0)) }, file, { boss: run.boss, modifier: run.modifier.id });
      tracker = out.t;
      if (out.spent) { rec = spendAttempt(rec, date); persist(); }
      if (!out.row) return;
      const fin = finishAttempt(rec, date, out.row);
      rec = fin.rec; persist();
      lastResult = { date, boss: run.boss, modifier: run.modifier.id, attempt: rec.attempts, row: out.row, best: rec.best, bestEver: rec.bestEver, newBest: fin.newBest };
      emitResult(lastResult);   // the share clip and a later leaderboard
      safe(() => o.win.dispatchEvent(new CustomEvent(file.event, { detail: lastResult })), undefined);
      showResult(lastResult);
    },
  };
  (globalThis as { __v3DailyPit?: unknown }).__v3DailyPit = { run, date, record: () => rec, tracker: () => tracker, result: () => lastResult, openCard: () => { drawCard(); card.hidden = false; } };   // the stills and the tests read this
  return handle;
}
