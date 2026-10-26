// The tutorial start scene's instructions (`?tutorial=1`, Match 'tutorial'): ONE large word above the fight and a short "how" line under it, for the
// step the foe is waiting on (src/tutorial.ts, Characters & Art, decides when a step is done; this file only says what to do). Words are the
// phone buttons' own labels (index.html data-mobile). Presentation only: no sim, no record, no camera.
import { TUTORIAL_STEPS, type TutorialStep } from '../tutorial.ts';

export type TutorialPrompt = { word: string; how: string; now?: boolean; ready?: boolean };

const PROMPT: Record<TutorialStep, { word: string; how: string }> = {
  slash: { word: 'SLASH', how: 'tap Slash' },
  stab: { word: 'STAB', how: 'tap Stab' },
  heavy: { word: 'HEAVY', how: 'hold Heavy, then let go' },
  guard: { word: 'GUARD', how: 'hold Guard as his stab comes' },
  parry: { word: 'PARRY', how: 'slide Guard UP when it says NOW!' },
  kick: { word: 'KICK', how: 'he is guarding: tap Kick' },
  roll: { word: 'ROLL', how: 'hold Roll as his swing starts' },
};
export const TUTORIAL_CLOSER: TutorialPrompt = { word: 'STEP CLOSER', how: 'move toward him' };
export const TUTORIAL_READY: TutorialPrompt = { word: "YOU'RE READY", how: 'tap Fight!', ready: true };

/** The prompt for the step the foe waits on; the ready card once every step is done; null when there is nothing to show. `parryWindow` is the fight's own (tutorial.ts): true from the first tick a guard press would catch the heavy until contact. */
export function tutorialPrompt(current: TutorialStep | null, done: number, parryWindow: boolean, drawn = true, tooFar = false): TutorialPrompt | null {
  if (current === null) return done === TUTORIAL_STEPS.length ? TUTORIAL_READY : null;
  if (tooFar) return TUTORIAL_CLOSER;   // beyond his swing range and nothing is happening: the step cannot land from here
  const base = current === 'slash' && !drawn ? { word: PROMPT.slash.word, how: 'tap Fight to draw' } : PROMPT[current];   // the button reads FIGHT until the sword is out, then SLASH
  return current === 'parry' && parryWindow ? { word: 'NOW!', how: 'slide Guard UP!', now: true } : base;
}

type Lookup = <T extends HTMLElement>(id: string) => T;
export function createTutorialUi(element: Lookup, onGo: () => void) {
  const box = element('tutorial-prompt'), word = element('tutorial-word'), how = element('tutorial-how'), go = element<HTMLButtonElement>('tutorial-go');
  go.addEventListener('click', onGo);
  let last = '';
  return {
    update(current: TutorialStep | null, done: number, parryWindow: boolean, drawn: boolean, tooFar: boolean, show: boolean) {
      const p = show ? tutorialPrompt(current, done, parryWindow, drawn, tooFar) : null, key = p ? `${p.word}|${p.how}` : '';
      if (key === last) return;
      last = key;
      box.hidden = !p;
      if (!p) return;
      word.textContent = p.word; how.textContent = p.how;
      box.dataset.now = p.now ? '1' : ''; box.dataset.ready = p.ready ? '1' : '';
      go.hidden = !p.ready;
    },
  };
}
