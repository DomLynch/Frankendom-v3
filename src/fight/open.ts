// The one door through which a page asks the Origins writer to `open` the signed-in account, and so the one place a character comes to exist (the writer's `open` makes the account's
// first character; Lead's rule 2026-10-09: one universal "your character exists"). Every entry (the Pit src/main.ts, every zone page origins/preview/main.ts, the gear sheet src/gear-server.ts)
// calls this and nothing else calls `open` (tests/open-single-path.test.ts). One request per page: the answer is shared by every caller, and kept per storage (a page has one).
// A failure is an answer, never a throw, and is not kept: a later caller (the gear sheet, a token that has since been renewed) asks again.
import { call, storedToken, writerBase, type Offline } from '../writer-call.ts';

export type OpenDeps = { storage: { getItem(key: string): string | null } | null; search: string; now?: () => number; fetch?: typeof fetch; timeoutMs?: number; retries?: number; retryMs?: number };
export type OpenReply = { result: unknown };   // the writer's reply, as sent: each caller maps what it needs (the zone page its career, the gear sheet the character id)

const once = new WeakMap<object, Promise<OpenReply | Offline>>();

// 8 s, not the 4 s default: the gear sheet opens while the page is busy drawing the mannequin, and a late answer beats the device's ledger shown in its place.
// A slow answer is not a refusal: a new account's first `open` also creates its character, and on a loaded box that took longer than the page waited (Dom's first /zone1/ visit, 2026-10-09: the writer
// committed the character 1 s after the page gave up, the page stayed offline and its kill never reached the writer). `open` is idempotent, so a timeout, a dropped connection or a 5xx asks again
// (twice by default) and finds the character; a refusal (401, 403, 404, 503 not installed) is final.
const TRANSIENT = /^(timeout|network|http-5(?!03$)\d\d)$/;
async function ask(d: OpenDeps, token: string | null): Promise<OpenReply | Offline> {
  const opts = { base: writerBase(d.search), timeoutMs: d.timeoutMs ?? 8000, ...(d.fetch ? { fetch: d.fetch } : {}) };
  let got = await call<OpenReply>('open', {}, token, (result) => ({ result }), opts);
  for (let left = d.retries ?? 2; left > 0 && 'offline' in got && TRANSIENT.test(got.offline); left--) {
    await new Promise((r) => setTimeout(r, d.retryMs ?? 1500));
    got = await call<OpenReply>('open', {}, token, (result) => ({ result }), opts);
  }
  return got;
}

export function openAccount(d: OpenDeps): Promise<OpenReply | Offline> {
  const kept = d.storage && once.get(d.storage);
  if (kept) return kept;
  const token = storedToken(d.storage, (d.now ?? Date.now)());
  const asked = ask(d, token);
  if (d.storage && token) { once.set(d.storage, asked); void asked.then((got) => { if ('offline' in got && once.get(d.storage!) === asked) once.delete(d.storage!); }); }
  return asked;
}

export const characterIdOf = (result: unknown): string | null => {
  const id = (result as { characters?: { id?: unknown }[] } | null)?.characters?.[0]?.id;
  return typeof id === 'string' ? id : null;
};

/** The account's character id (the first one, which `open` makes if the account has none), or null for a guest or a writer that does not answer. */
export async function openCharacter(d: OpenDeps): Promise<string | null> {
  const got = await openAccount(d);
  return 'offline' in got ? null : characterIdOf(got.result);
}

/** For the spawn tracker: the known id, else ask the door again (a failed open is not kept), so a character that came late is picked up before the first engage. */
export const characterFor = (d: OpenDeps, known: () => string | null, learn: (id: string) => void) => (): string | null | Promise<string | null> =>
  known() ?? openCharacter(d).then((id) => { if (id) learn(id); return id; });
