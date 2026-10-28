// The discreet "Unlocked: <weapon>" line (data/progression.json) shown on a boss's first kill. One small line of small caps in the pickup hint's gold, top centre under the bars, no panel, no button, no sound,
// pointer-events none (it never takes a touch from the stick or the look thumb), gone after `lineSeconds`. Presentation only: it touches nothing of the sim, and the elements exist only after the first unlock.
type Doc = { createElement(tag: string): HTMLElement; body: HTMLElement; head: HTMLElement };
export type UnlockLine = { show(text: string): void; remove(): void };

/** Mounts the line (hidden) in `doc`. `show(text)` fades it in for `seconds`; a second `show` replaces the text and restarts the time. `later`: the timer (a test passes its own). */
export function mountUnlockLine(doc: Doc, seconds: number, later: (fn: () => void, ms: number) => unknown = (fn, ms) => setTimeout(fn, ms), clear: (t: unknown) => void = (t) => clearTimeout(t as number)): UnlockLine {
  const style = doc.createElement('style');
  style.textContent = '.ul-line{position:fixed;left:50%;top:calc(18% + 22px);transform:translateX(-50%);z-index:29;pointer-events:none;opacity:0;transition:opacity .4s ease;white-space:nowrap;color:#ffd34a;'
    + "font:10px/1.25 Georgia,'Times New Roman',serif;font-variant-caps:all-small-caps;letter-spacing:.14em;text-shadow:0 1px 3px rgba(0,0,0,.85);user-select:none;-webkit-user-select:none}";
  doc.head.append(style);
  const el = doc.createElement('div'); el.className = 'ul-line'; el.dataset.unlock = 'true'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
  doc.body.append(el);
  let timer: unknown = null;
  return {
    show(text) { el.textContent = text; el.style.opacity = '1'; if (timer !== null) clear(timer); timer = later(() => { el.style.opacity = '0'; timer = null; }, seconds * 1000); },
    remove() { if (timer !== null) clear(timer); el.remove(); style.remove(); },
  };
}
