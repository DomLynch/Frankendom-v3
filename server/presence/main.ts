// node server/presence/main.ts (npm run presence): the presence service, standalone. Lifted from V1 origins/presence/main.ts without the Supabase, writer and OFF switch (running this IS the opt-in).
// The ONE env override is PRESENCE_HOST (the bind address; default the `host` row, 127.0.0.1: put a reverse proxy in front for anything public). Port, caps and logging are rows (data/presence.json).
import { presenceRule } from '../../src/presence/rows.ts';
import { createPresence, listenHost } from './server.ts';
import { RULES } from './interest.ts';

const host = listenHost(process.env), port = presenceRule('presencePort');
const presence = createPresence({ ipHeader: false });
presence.server.listen(port, host, () => console.log(`presence listening on ${host}:${presence.port()} (layers: soft ${RULES.softCap}, hard ${RULES.hardCap})`));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { void presence.close().then(() => process.exit(0)); });
