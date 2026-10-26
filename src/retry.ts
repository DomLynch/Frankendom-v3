// Transient-failure retry, shared by the art loaders (characters.ts, lorarii.ts).
// A dropped connection is not a broken rig. Safari reports a failed fetch as `TypeError: Load failed` (Chrome: `Failed to fetch`),
// and a 5 MB fighter on a phone drops now and then (Sentry FRANKENDOM-6: nine sessions in five days, every release). Such a
// failure is retried with a short back-off before the game gives up on the art; a rig that parses but is wrong is not retried.
// One exception is retried too: a fighter that parsed with a skin map missing (MissingTextures). GLTFLoader turns a failed embedded
// image decode into a null map instead of rejecting (loadTextureImage's catch), so a first load in a fresh browser could come back bare
// and was never retried (Sentry FRANKENDOM-5, Dom's live test 2026-09-30: "Warrior art could not load", a refresh fixed it).
export class MissingTextures extends Error {
  readonly url: string; readonly missing: string; readonly attempts: number;
  constructor(url: string, missing: string, attempts: number) { super('Warrior textures did not load'); this.url = url; this.missing = missing; this.attempts = attempts; }
}
export const transientLoadError = (error: unknown): boolean => error instanceof TypeError || error instanceof MissingTextures || /Load failed|Failed to fetch|NetworkError|network error|ERR_(NETWORK|CONNECTION|INTERNET)/i.test(String((error as { message?: string })?.message ?? error));
export async function retryTransient<T>(attempt: (i: number) => Promise<T>, attempts = 3, delayMs = 800, sleep: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms))): Promise<T> {
  for (let i = 1; ; i++) {
    try { return await attempt(i); }
    catch (error) { if (i >= attempts || !transientLoadError(error)) throw error; await sleep(delayMs * i); }
  }
}
