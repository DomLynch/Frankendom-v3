// Blood edge (Dom 2026-09-30: GPT's painted strips "look more real", three of them on sequential rotation): when the PLAYER is hit, a painted
// blood strip (public/game/img/blood/<name>.webp, left edge; the right edge is the same image mirrored) flashes on the screen edge the blow came
// from, 480 ms with the peak held ~150 ms. Presentation only, driven by the frame's Hit events (no sim change); an <img> overlay above the canvas
// (no GPU pass); always on, prefers-reduced-motion included (owner ruling 2026-09-29: hit feedback is on for everyone). Nothing is added to the
// page, and no image is fetched, until the first time the player is hit; the fight never waits on it.
// The move's direction is the attacker's side (what a guard mirrors), so it lands on the mirrored screen edge (the camera looks over the
// player's shoulder): right -> left edge, left -> right. Head-on blows (overhead, thrust, low: ~3 in 4 of all blows) show BOTH edges at
// HEAD_ON strength. LEFT and RIGHT only, never top or bottom. Each hit the player takes shows the next strip in order (smear, bleed, streak,
// smear...); the count restarts when the tick goes backwards (a new fight or a replay), so a replay shows the same strips.
import type { CombatEvent, Duel } from './duel.ts';
import { weaponOf, type Direction } from './moves.ts';

export type Edge = 'left' | 'right';
export const EDGE: Record<Direction, Edge | 'both'> = { right: 'left', left: 'right', overhead: 'both', thrust: 'both', low: 'both' };
export const STRIPS = ['wet-smear', 'soft-bleed', 'dragged-streak'] as const;
export const EDGE_MS = 480;
export const PEAK = [0.12, 0.43];   // opacity holds from 58 ms to 206 ms (~150 ms); the effect easing is linear (an effect-level ease-out warps the whole timeline), ease-out is on the fade keyframe only
export const HEAD_ON = 0.6;         // peak opacity of each edge for a head-on blow (Strategy's default until Dom rules)
export const WIDTH_VW = 6, SPAN = 68;   // each strip is 6 % of the screen width, the middle 68 % of its height
const SIDES: readonly Edge[] = ['left', 'right'];

export const edgesOf = (e: CombatEvent, duel: Duel): Edge[] | null => {
  if (e.type !== 'Hit' || e.target !== 0 || !e.move) return null;
  const direction = weaponOf(duel.fighters[e.actor].weapon).moves[e.move]?.direction;
  const edge = direction && EDGE[direction];
  return edge ? (edge === 'both' ? [...SIDES] : [edge]) : null;
};

// What the overlay needs from the page (the real document in the game; a stand-in in the tests).
export type Page = { document: Pick<Document, 'createElement'> };
const browserPage = (): Page => ({ document });

type Img = { style: CSSStyleDeclaration; animate: HTMLElement['animate'] };
const src = (name: string) => `/game/img/blood/${name}.webp`;

export function createBloodEdge(canvas: HTMLElement, page: Page = browserPage()) {
  let strips: Record<Edge, Img[]> | undefined, hits = 0, last = -1;
  const lay = () => {   // built on the first hit the player takes, never before
    const box = page.document.createElement('div');
    box.id = 'blood-edge';
    Object.assign(box.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '1' });
    const made = { left: [], right: [] } as Record<Edge, Img[]>;
    for (const edge of SIDES) for (const name of STRIPS) {
      const img = page.document.createElement('img');
      img.src = src(name); img.alt = ''; img.decoding = 'async'; img.draggable = false;
      Object.assign(img.style, { position: 'absolute', top: `${(100 - SPAN) / 2}%`, height: `${SPAN}%`, width: `${WIDTH_VW}vw`, objectFit: 'fill', opacity: '0',
        [edge]: `env(safe-area-inset-${edge})`, ...(edge === 'right' ? { transform: 'scaleX(-1)' } : {}) });
      box.append(img); made[edge].push(img);
    }
    canvas.after(box);
    return made;
  };
  return {
    reset() { hits = 0; last = -1; },   // a new fight starts the rotation over (scene.ts clears its effects when both health bars are full again), so a replay shows the same strips
    render(events: readonly CombatEvent[], duel: Duel) {
      for (const e of events) {
        const edges = edgesOf(e, duel);
        if (!edges) continue;
        if (e.tick < last) hits = 0;
        last = e.tick;
        const pick = hits++ % STRIPS.length, peak = edges.length > 1 ? HEAD_ON : 1;
        for (const edge of edges)
          (strips ??= lay())[edge][pick].animate([{ opacity: 0 }, { opacity: peak, offset: PEAK[0] }, { opacity: peak, offset: PEAK[1], easing: 'ease-out' }, { opacity: 0 }], { duration: EDGE_MS, easing: 'linear' });
      }
    },
  };
}
