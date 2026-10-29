// The page's audio-unlock gestures, armed only while the audio is locked. WebKit grants audio on a gesture, so main.ts listens for a family of them; before this, those listeners stayed for the life of the
// page and every touch, click and key ran the unlock again (feedback.resume() allocates a one-sample buffer each time). Now the first gesture that finds the context running removes them all, and
// they are armed again only if the page is locked again (a call, Siri, an app switch: main.ts calls arm() from its wake handler while `unlocked()` is false). Pure DOM-event plumbing: no sound here.
export type UnlockTarget = { addEventListener(type: string, fn: () => void, opts?: { passive: boolean }): void; removeEventListener(type: string, fn: () => void): void };

export function createAudioUnlock(o: { target: UnlockTarget; types: readonly string[]; run: () => void; unlocked: () => boolean }) {
  let armed = false;
  const onGesture = (): void => { o.run(); if (o.unlocked()) disarm(); };
  function arm(): void { if (armed) return; armed = true; for (const t of o.types) o.target.addEventListener(t, onGesture, { passive: true }); }
  function disarm(): void { if (!armed) return; armed = false; for (const t of o.types) o.target.removeEventListener(t, onGesture); }
  return { arm, disarm, armed: () => armed };
}
