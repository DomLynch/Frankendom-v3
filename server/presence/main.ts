// node server/presence/main.ts (npm run presence): the presence service, standalone. Lifted from V1 origins/presence/main.ts without the Supabase, writer and OFF switch (running this IS the opt-in).
// Env (all optional): PRESENCE_PORT (default: the presencePort row), PRESENCE_HOST (default 127.0.0.1; behind a reverse proxy keep it on loopback), PRESENCE_SOFT / PRESENCE_HARD /
// PRESENCE_MAX_LAYERS / PRESENCE_LOG_MS override the layer caps and the log interval for a run. Nothing here is a secret.
import { presenceRule } from '../../src/presence/rows.ts';
import { createPresence } from './server.ts';
import { RULES } from './interest.ts';

const num = (name: string, fallback: number): number => Number(process.env[name] ?? fallback);
const host = process.env.PRESENCE_HOST ?? '127.0.0.1', port = num('PRESENCE_PORT', presenceRule('presencePort'));
const rules = { ...RULES, softCap: num('PRESENCE_SOFT', RULES.softCap), hardCap: num('PRESENCE_HARD', RULES.hardCap) };
const presence = createPresence({ rules, maxLayers: num('PRESENCE_MAX_LAYERS', presenceRule('maxLayers')), logEveryMs: num('PRESENCE_LOG_MS', presenceRule('logEveryMs')), ipHeader: false });
presence.server.listen(port, host, () => console.log(`presence listening on ${host}:${presence.port()} (layers: soft ${rules.softCap}, hard ${rules.hardCap})`));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { void presence.close().then(() => process.exit(0)); });
