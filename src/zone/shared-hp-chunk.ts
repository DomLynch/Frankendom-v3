// The page's shared-hp chunk: what src/client/main.ts imports, only when the link has ?sharedhp= (data/zone-client.json `query`; default OFF, so a first visit fetches nothing and no line of this runs). The
// build makes it its own content-hashed module, b/vendor/sharedhp.<hash>.js (scripts/build.mjs, as the presence chunk is), so it adds nothing to main.js.
//   ?sharedhp=1                this page's own host at data/zone-client.json `path`
//   ?sharedhp=https://host/p   exactly that writer (http or https)
//   anything else              off
// In this step the handle is INERT until the wiring PR: it opens no connection by itself, and nothing in the page feeds it sim events or draws its bar. It exposes `create` (a shared-hp client driven by
// one timer for all clients), for the browser checks and for that PR. The sim's own health stays the truth of the fight.
import { ROWS, createSharedHp, type Options, type SharedHp } from './shared-hp-client.ts';
import { httpTransport, type Fetch } from './shared-hp-http.ts';

/** The writer's base URL this link asks for, or null (absent, malformed, off). */
export function sharedHpUrlFor(search: string, loc: { protocol: string; host: string }): string | null {
  const v = new URLSearchParams(search).get(ROWS.query);
  if (v === null) return null;
  if (/^1$/.test(v)) return `${loc.protocol}//${loc.host}${ROWS.path}`;
  const m = /^https?:\/\/([^\s/@]+)(\/\S*)?$/.exec(v);   // no userinfo: a host with an @ is refused
  if (!m) return null;
  const host = m[1]!.toLowerCase();
  return host === loc.host.toLowerCase() || ROWS.hosts.includes(host) ? v.replace(/\/+$/, '') : null;   // this page's own host, or one the rows name; any other host is off
}
const sameHost = (url: string, loc: { host: string }): boolean => new URL(url).host.toLowerCase() === loc.host.toLowerCase();

export type SharedHpHandle = {
  url: string;
  /** A client for one boss. Not started: the caller engages when the hero walks into the boss's aggro (wiring PR). */
  create(o: Omit<Options, 'transport' | 'session'>): SharedHp;
  clients(): SharedHp[];
  stop(): void;
};

export function startSharedHp(o: { search: string; location: { protocol: string; host: string }; fetch?: Fetch; now?: () => number; session?: string; every?: (fn: () => void, ms: number) => () => void }): SharedHpHandle | null {
  const url = sharedHpUrlFor(o.search, o.location);
  if (!url) return null;
  const now = o.now ?? (() => performance.now());
  const session = o.session ?? globalThis.crypto?.randomUUID?.() ?? String(now());
  const transport = httpTransport({ base: url, rows: ROWS, credentials: sameHost(url, o.location) ? 'same-origin' : 'include', fetch: o.fetch ?? ((u, init) => globalThis.fetch(u, init)) });
  const list = new Set<SharedHp>();
  const every = o.every ?? ((fn, ms) => { const id = setInterval(fn, ms); return () => clearInterval(id); });
  const stopTimer = every(() => { const t = now(); for (const c of list) void c.tick(t).catch(() => {}); }, ROWS.timing.tickMs);
  let n = 0;
  return {
    url,
    create(opts) {
      n += 1;
      const c = createSharedHp({ ...opts, transport, session: `${session}-${n}` });
      list.add(c);
      return c;
    },
    clients: () => [...list],
    stop() { stopTimer(); for (const c of list) c.stop(); list.clear(); },
  };
}
