// A local measurement of how long a thumb holds STRIKE (Strategy's condition on the one-button heavy hold, 2026-10-19; Lead's conditions): OFF unless the page is opened with `?taplog=1`. It times the STRIKE button's
// pointerdown to pointerup only, keeps the durations in memory, and shows n, the median and the p90 in a small panel with a copy button. Nothing is sent over the network and nothing is stored (no storage, no
// request, no telemetry hook): the panel text is the whole output, copied by the tester's own tap. View only: it reads the press, changes no intent and no default. Every label is a row (tap-log-defs.json).
import { loadRegistry, tableFromFile, type Manifest } from '../core/registry.ts';
import DEFS from './tap-log-defs.json' with { type: 'json' };
import MANIFEST from './tap-log-defs.manifest.json' with { type: 'json' };

loadRegistry((MANIFEST.tables as unknown as Manifest[]).map((m) => tableFromFile(m, DEFS, 'tap-log-defs.json')));
const LABEL = Object.fromEntries(DEFS.labels.map((l) => [l.id, l.text])) as Record<string, string>;
const NUM = Object.fromEntries(DEFS.numbers.map((r) => [r.id, r.value])) as Record<string, number>;   // half (the mean of two), p90Rank (the nearest rank), copiedMs (how long the button says "copied")

export const TAP_LOG_QUERY = /[?&;]taplog=1\b/;
export const tapLogOn = (search: string): boolean => TAP_LOG_QUERY.test(search);

export type TapStats = { n: number; median: number; p90: number };
/** The median (the mean of the two middle values for an even n) and the nearest-rank p90 of the durations, in ms; zeros for none. */
export function tapStats(durations: readonly number[]): TapStats {
  const n = durations.length; if (n === 0) return { n: 0, median: 0, p90: 0 };
  const s = [...durations].sort((a, b) => a - b);
  return { n, median: (s[(n - 1) >> 1]! + s[n >> 1]!) * NUM.half!, p90: s[Math.ceil(NUM.p90Rank! * n) - 1]! };   // the two middle values coincide for an odd n
}
/** The panel's text, from the label rows: "STRIKE taps  n 30  median 84 ms  p90 112 ms". */
export const tapText = (st: TapStats): string => `${LABEL.title}  ${LABEL.n} ${st.n}  ${LABEL.median} ${Math.round(st.median)} ${LABEL.unit}  ${LABEL.p90} ${Math.round(st.p90)} ${LABEL.unit}`;

/** Times one button's presses. `down` and `up` take the event's pointer id and its high-resolution timeStamp; an up with no matching down (a pointer that began elsewhere) is ignored. */
export function createTapTimer(onTap: (ms: number) => void) {
  const since = new Map<number, number>();
  return {
    down(id: number, at: number) { since.set(id, at); },
    up(id: number, at: number) { const t0 = since.get(id); since.delete(id); if (t0 !== undefined && at >= t0) onTap(at - t0); },
    cancel(id: number) { since.delete(id); },
  };
}

/** Put the panel on the page and wire the STRIKE button to it. Only called when `?taplog=1`. Local only: the copy button writes the panel text to the clipboard on the tester's own tap. */
export function attachTapLog(doc: Document, strike: HTMLElement): void {
  const durations: number[] = [];
  const panel = doc.createElement('div'); panel.id = 'tap-log';
  panel.setAttribute('style', 'position:fixed;left:8px;top:8px;z-index:50;padding:6px 8px;border-radius:6px;background:rgba(0,0,0,.72);color:#f2e6d6;font:600 11px/1.3 sans-serif;display:flex;gap:6px;align-items:center;pointer-events:auto');
  const text = doc.createElement('span'), button = (label: string) => { const b = doc.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('style', 'font:600 11px sans-serif;padding:3px 6px;border-radius:4px;min-height:28px'); return b; };
  const copy = button(LABEL.copy!), clear = button(LABEL.clear!);
  const show = () => { text.textContent = tapText(tapStats(durations)); };
  const timer = createTapTimer((ms) => { durations.push(ms); show(); });
  copy.addEventListener('click', () => { const t = text.textContent ?? ''; try { void navigator.clipboard?.writeText(t); copy.textContent = LABEL.copied!; setTimeout(() => { copy.textContent = LABEL.copy!; }, NUM.copiedMs!); } catch { /* clipboard refused: the text is on screen to copy by hand */ } });
  clear.addEventListener('click', () => { durations.length = 0; show(); });
  show(); panel.append(text, copy, clear); doc.body.append(panel);
  strike.addEventListener('pointerdown', (e) => timer.down((e as PointerEvent).pointerId, e.timeStamp));
  strike.addEventListener('pointerup', (e) => timer.up((e as PointerEvent).pointerId, e.timeStamp));
  strike.addEventListener('pointercancel', (e) => timer.cancel((e as PointerEvent).pointerId));
}
