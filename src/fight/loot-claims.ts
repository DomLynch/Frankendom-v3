import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoragePort } from '../profile.ts';
import { readStanding, type Standing } from '../cloud-profile.ts';
import { isLootId } from './loot.ts';

// The claims outbox (SCOPE 9(a), Backend's contract 2026-09-25): every signed-in ladder win posts one loot_claims row (migration
// 202609230001), and the verifier replays its record and awards the mark and the piece. An entry is written AT THE KILL, tagged with
// the account that won, so a closed tab still claims the win. It becomes final on the player's last word on the loot — a take once
// the Undo line is gone, Leave it, or nothing left to offer — and only final entries are posted. A non-final entry found at the next
// load or fight is made final with no piece (settleClaims). Posts go on sign-in, on a page load and on the final word; never in a loop.
export type Claim = { userId: string; opponent: string; record: string; piece: string | null; final: boolean };
export const CLAIMS_KEY = 'frankendom.claims.v1';
export const CLAIMS_CAP = 50;   // 10 → 50 (Strategy 2026-09-29): a bounded outbox; each entry is one fight's share string
// Share stays hidden until the win's claim has been posted, or this long: the record hash is first-claimer-wins, so a link shared
// before the post lands would let whoever opens it claim the fight.
export const CLAIM_WAIT_MS = 3000;
// The DB's own checks on a claim (loot_claims): an entry that fails one could only ever be refused, so it is never stored.
const OPPONENT = /^[a-z]{1,32}$/, PIECE = /^[a-z]{1,32}\.[A-Za-z]{1,32}$/, RECORD = /^[A-Za-z0-9_-]+$/;
const isClaim = (value: unknown): value is Claim => {
  const c = value as Claim;
  return !!c && typeof c.userId === 'string' && !!c.userId && typeof c.opponent === 'string' && OPPONENT.test(c.opponent)
    && typeof c.record === 'string' && RECORD.test(c.record) && (c.piece === null || (typeof c.piece === 'string' && PIECE.test(c.piece))) && typeof c.final === 'boolean';
};
export function loadClaims(storage: StoragePort): Claim[] {
  try { const value: unknown = JSON.parse(storage.getItem(CLAIMS_KEY) ?? '[]'); return Array.isArray(value) ? value.filter(isClaim) : []; } catch { return []; }
}
// False when the write failed (storage full or blocked): the caller can tell the player the win is not held for the server.
export function saveClaims(storage: StoragePort, claims: Claim[]): boolean {
  try { storage.setItem(CLAIMS_KEY, JSON.stringify(claims)); return true; } catch { return false; }
}
// One entry per fight (its record). Past the cap an older unfinished entry goes first; a final one (a win the server has not answered yet)
// is never dropped, so when every older entry is final the new one is refused and the caller tells the player (GPT recheck 2026-09-29, B:
// the old rule dropped a win without a word).
export function addClaim(claims: Claim[], claim: Claim): Claim[] {
  const next = [...claims.filter((c) => c.record !== claim.record), claim];
  while (next.length > CLAIMS_CAP) {
    const open = next.findIndex((c) => !c.final && c !== claim);
    if (open < 0) return next.filter((c) => c !== claim);
    next.splice(open, 1);
  }
  return next;
}
// Save a new claim to the outbox. Refused (the outbox is full of unanswered wins) or not written (storage full or blocked), it tells the
// player, never silently (Strategy 2026-09-29), and returns false. A refused or unwritten win is not held anywhere, and the lines say so
// (GPT recheck 2026-09-29 at 303af39: the old refusal promised "Reconnect to bank this win", and a failed write still returned true).
export const CLAIM_REFUSED = `This win wasn't saved: ${CLAIMS_CAP} wins are already waiting for the server. Reconnect to send them.`;
export const CLAIM_UNSAVED = "This win couldn't be saved on this device, so it won't reach the server.";
export function bankClaim(storage: StoragePort, claim: Claim, tell: (line: string) => void): boolean {
  const next = addClaim(loadClaims(storage), claim);
  if (!next.some((c) => c.record === claim.record)) { tell(CLAIM_REFUSED); return false; }
  if (!saveClaims(storage, next)) { tell(CLAIM_UNSAVED); return false; }
  return true;
}
export const finalClaim = (claims: Claim[], record: string, piece: string | null): Claim[] =>
  claims.map((c) => (c.record === record && !c.final ? { ...c, piece, final: true } : c));
export const settleClaims = (claims: Claim[]): Claim[] => claims.map((c) => (c.final ? c : { ...c, piece: null, final: true }));
// A write the device refuses (storage full or blocked) is held in memory for the page's life, so it is not lost (GPT audit of e65a6d8,
// F3: four callers dropped saveClaims()'s boolean — the final word's piece was lost and the reload claimed the win with none, a page
// closing sent nothing for an entry it could not finalise, and a posted entry whose removal failed was counted and posted again).
// unsaved: entries finalised in memory, posted and sent like stored ones; acked: posted entries still in storage, never posted or
// counted again (the server would answer 23505), removed at the next flush that can write. The outbox view merges both.
export const held: { unsaved: Claim[]; acked: Set<string> } = { unsaved: [], acked: new Set() };
export function outbox(storage: StoragePort): Claim[] {
  const stored = loadClaims(storage).map((c) => held.unsaved.find((u) => u.record === c.record) ?? c);   // the held copy stands in, in the stored order
  return [...stored, ...held.unsaved.filter((u) => !stored.includes(u))].filter((c) => !held.acked.has(c.record));
}
const hold = (claims: Claim[]) => { for (const c of claims) { held.unsaved = held.unsaved.filter((u) => u.record !== c.record); held.unsaved.push(c); } };
// Finalise this fight's entry with the player's last word. False when the write failed: the entry is held, so a flush still posts the piece.
export function finaliseClaim(storage: StoragePort, record: string, piece: string | null): boolean {
  const next = finalClaim(outbox(storage), record, piece), entry = next.find((c) => c.record === record);
  if (!entry) return true;
  if (saveClaims(storage, loadClaims(storage).map((c) => (c.record === record ? entry : c)))) return true;
  hold([entry]); return false;
}
// The entries a closed tab left open become final with no piece (settleClaims) at the next load; unwritten, they are held the same way.
export function settleOutbox(storage: StoragePort): boolean {
  const open = outbox(storage).filter((c) => !c.final).map((c) => ({ ...c, piece: null, final: true }));
  if (!open.length) return true;
  if (saveClaims(storage, settleClaims(loadClaims(storage)))) return true;
  hold(open); return false;
}
export const CLAIM_HELD = "This win couldn't be saved on this device: it's sent now, but may not survive a crash.";
// What the account has won on this device and the server does not hold yet: the rank and the loot offer add it to my_standing()'s pending.
export const pendingClaims = (claims: Claim[], userId: string | null): Claim[] => (userId ? claims.filter((c) => c.userId === userId) : []);

// The last my_standing() per account, kept on the device so the next boot's Match (built before account.ts has read the standing) fights at
// the level the HUD will show (Lead 2026-09-27). Replaced whenever my_standing answers; dropped on sign-out, and a new account replaces it.
// Not a trust hole: a forged cache moves only this player's own fight level. The server never reads it; marks and pieces come from verified
// claims, and the kit is awarded at the server's tier (kitAt).
export const STANDING_KEY = 'frankendom.standing.v1';
export type CachedStanding = { userId: string; standing: Standing };
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
export function loadStanding(storage: StoragePort): CachedStanding | null {
  try {
    const value = JSON.parse(storage.getItem(STANDING_KEY) ?? 'null') as { userId?: unknown; standing?: Partial<Record<keyof Standing, unknown>> } | null;
    const s = value?.standing;
    if (!value || typeof value.userId !== 'string' || !value.userId || !s || !count(s.marks) || !count(s.pending) || !Array.isArray(s.owned) || !Array.isArray(s.pendingOwned)) return null;
    return { userId: value.userId, standing: { marks: s.marks, pending: s.pending, owned: s.owned.filter(isLootId), pendingOwned: s.pendingOwned.filter(isLootId) } };
  } catch { return null; }
}
// A signed-in answer replaces the cache; a signed-in account with no answer keeps its own cache and drops another's; no account drops it.
export function saveStanding(storage: StoragePort, userId: string | null, standing: Standing | null): void {
  try {
    if (userId && standing) storage.setItem(STANDING_KEY, JSON.stringify({ userId, standing }));
    else if (!userId || loadStanding(storage)?.userId !== userId) storage.setItem(STANDING_KEY, 'null');
  } catch { /* storage unavailable: the next boot fights on the device count */ }
}

// Post one claim. Only an answer that can never change drops it: 23505 (this fight is already claimed) and 23514 (it fails a check and
// never will pass; reported). Everything else keeps it for the next sign-in or load — 42501 (the hourly cap, or RLS before the apply),
// PGRST205/404 (the table is not there yet) and the network. user_id is the server's (auth.uid()) and is never sent.
export async function postClaim(db: SupabaseClient, claim: Claim, report: (error: unknown) => void): Promise<'drop' | 'keep'> {
  try {
    const { error } = await db.from('loot_claims').insert({ opponent: claim.opponent, piece: claim.piece, record: claim.record });
    if (!error || error.code === '23505') return 'drop';
    if (error.code === '23514') { report(error); return 'drop'; }
    return 'keep';
  } catch { return 'keep'; }
}
// Post this account's final entries one at a time, stopping at the first one kept; another account's entries are never posted.
// The client is shared and the server keys a claim on auth.uid(), so its session is read again before every post: an account switch or
// sign-out mid-flush stops it, and the unsent entries stay for their owner's next sign-in (GPT recheck 2026-09-29, A).
// Flushes are chained, so a sign-in and a final word landing together never post the same entry twice. Resolves to how many left.
let flushing: Promise<number> = Promise.resolve(0);
const signedIn = async (db: SupabaseClient): Promise<string | null> => { try { return (await db.auth.getSession()).data.session?.user.id ?? null; } catch { return null; } };
export function flushClaims(db: SupabaseClient, userId: string, storage: StoragePort, report: (error: unknown) => void): Promise<number> {
  flushing = flushing.then(async () => {
    let left = 0;
    // Retry final words and removals before the network: recovered storage must keep a take through an offline reload.
    if ((held.unsaved.length || held.acked.size) && saveClaims(storage, outbox(storage))) {
      held.unsaved = []; held.acked.clear();
    }
    for (const claim of outbox(storage).filter((c) => c.final && c.userId === userId)) {
      if (await signedIn(db) !== userId || await postClaim(db, claim, report) === 'keep') break;
      held.unsaved = held.unsaved.filter((u) => u.record !== claim.record);
      if (!saveClaims(storage, loadClaims(storage).filter((c) => c.record !== claim.record))) held.acked.add(claim.record);
      left++;
    }
    return left;
  }, () => 0);
  return flushing;
}
// The page is going for good (pagehide, not the back/forward cache): the leaving is this fight's last word, as leaving the kill screen is
// (a take still in its Undo line stands), and this account's final entries are sent with keepalive so a win whose player never comes
// back on this browser is still claimed (Lead 2026-09-27). Synchronous, fire-and-forget: the requests must start before the page is gone.
// Entries stay in the outbox: the next load posts them again and the global record hash answers 23505, which drops them, so it is one
// claim either way. The token is supabase-js's stored session (account.ts storageKey); none, or expired, sends nothing and the next load
// posts. Keepalive bodies share 64 KB in flight, so it sends at most what fits.
export const AUTH_KEY = 'frankendom.auth.v1', KEEPALIVE_BYTES = 60000;
export function claimOnHide(storage: StoragePort, userId: string, piece: string | null, api: { url: string; key: string } | null, send: typeof fetch, now = Date.now()): number {
  const open = outbox(storage).filter((c) => !c.final && c.userId === userId).at(-1);
  if (open) finaliseClaim(storage, open.record, piece);   // unwritten, the entry is held and sent below all the same
  let token: unknown = null;
  try { const stored = JSON.parse(storage.getItem(AUTH_KEY) ?? 'null') as { access_token?: unknown; expires_at?: unknown } | null; if (typeof stored?.expires_at === 'number' && stored.expires_at * 1000 > now) token = stored.access_token; } catch { /* no session */ }
  if (!api || typeof token !== 'string' || !token) return 0;
  let bytes = 0, sent = 0;
  for (const claim of outbox(storage).filter((c) => c.final && c.userId === userId)) {
    const body = JSON.stringify({ opponent: claim.opponent, piece: claim.piece, record: claim.record });
    if ((bytes += body.length) > KEEPALIVE_BYTES) break;
    void send(`${api.url}/rest/v1/loot_claims`, { method: 'POST', keepalive: true, body, headers: { apikey: api.key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' } }).catch(() => {});
    sent++;
  }
  return sent;
}
// A flush, then the standing to draw. An entry that left the outbox must already be in my_standing()'s pending when the rank redraws,
// or the rank dips by one until the sweep settles it (Lead's blocker, 2026-09-26): so after any post the standing is read again first.
export async function flushThenStanding(db: SupabaseClient, userId: string, storage: StoragePort, report: (error: unknown) => void, current: Standing | null): Promise<Standing | null> {
  return (await flushClaims(db, userId, storage, report)) ? readStanding(db) : current;
}

// Leaving the kill screen for the next rung: the profile is already advanced and persisted, so the page MUST reload whether the settle
// succeeded or threw (a storage write in finaliseClaim/bankClaim can throw in a private window); a failure is logged, never a stuck screen.
export const reloadAfter = (settled: Promise<unknown>, reload: () => void, warn: (error: unknown) => void = (error) => console.warn('loot claim: settle failed before the reload', error)): Promise<void> =>
  settled.then(undefined, warn).then(reload);
