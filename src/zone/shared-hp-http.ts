// The fetch transport of the shared-hp client (docs/ZONE-CLIENT-CONTRACT.md section 2): five POST routes under one base URL, JSON in and out. The ONLY file of the client that touches the network, and
// it does nothing else: it maps an HTTP answer onto the Transport the state machine takes.
//   2xx                         -> the JSON body
//   a body with `refused`       -> the body, whatever the status (a refusal is DATA: the rows decide what it means; the writer sends 409 / 429 / 422 for them)
//   any other HTTP error        -> rejects { kind: status, status, code? } where code is the body's `error` (the SQLSTATE or O-code the writer relays)
//   no answer / aborted         -> rejects { kind: offline } or { kind: timeout }
import type { ClientRows, Transport, TransportError } from './shared-hp-client.ts';

export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal; credentials: 'include' }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function httpTransport(o: { base: string; rows: ClientRows; fetch: Fetch }): Transport {
  const base = o.base.replace(/\/+$/, ''), kinds = { offline: 'offline', timeout: 'timeout', status: 'status' };
  async function post(route: string, body: unknown): Promise<any> {
    let res;
    try {
      res = await o.fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(o.rows.timing.timeoutMs), credentials: 'include' });
    } catch (err) {
      const e: TransportError = { kind: /timeout|abort/i.test(String((err as { name?: unknown })?.name)) ? kinds.timeout : kinds.offline };
      throw e;
    }
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.ok || (json && typeof json.refused === 'string')) return json;
    const e: TransportError = { kind: kinds.status, status: res.status, code: typeof json?.error === 'string' ? json.error : undefined };
    throw e;
  }
  const R = o.rows.routes;
  return {
    engage: (q) => post(R.engage, q),
    touch: (q) => post(R.touch, q),
    hits: (q) => post(R.hits, q),
    state: (q) => post(R.state, q),
    killReport: (q) => post(R.kill, q),
  };
}
