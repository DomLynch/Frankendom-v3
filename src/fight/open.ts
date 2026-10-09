// The one door through which a page asks the Origins writer to `open` the signed-in account, and so the one place a character comes to exist (the writer's `open` makes the account's
// first character; Lead's rule 2026-10-09: one universal "your character exists"). Every entry (the Pit src/main.ts, every zone page origins/preview/main.ts, the gear sheet src/gear-server.ts)
// calls this and nothing else calls `open` (tests/open-single-path.test.ts). One request per page: the answer is shared by every caller, and kept per storage (a page has one).
// A failure is an answer, never a throw, and is not kept: a later caller (the gear sheet, a token that has since been renewed) asks again.
import { call, storedToken, writerBase, type Offline } from '../writer-call.ts';

export type OpenDeps = { storage: { getItem(key: string): string | null } | null; search: string; now?: () => number; fetch?: typeof fetch; timeoutMs?: number };
export type OpenReply = { result: unknown };   // the writer's reply, as sent: each caller maps what it needs (the zone page its career, the gear sheet the character id)

const once = new WeakMap<object, Promise<OpenReply | Offline>>();

// 8 s, not the 4 s default: the gear sheet opens while the page is busy drawing the mannequin, and a late answer beats the device's ledger shown in its place.
export function openAccount(d: OpenDeps): Promise<OpenReply | Offline> {
  const kept = d.storage && once.get(d.storage);
  if (kept) return kept;
  const token = storedToken(d.storage, (d.now ?? Date.now)());
  const asked = call<OpenReply>('open', {}, token, (result) => ({ result }), { base: writerBase(d.search), timeoutMs: d.timeoutMs ?? 8000, ...(d.fetch ? { fetch: d.fetch } : {}) });
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
