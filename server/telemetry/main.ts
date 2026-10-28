// node server/telemetry/main.ts (npm run telemetry): the collector, standalone. Binds the `server.host` row (loopback) on `server.port`; the one env override is TELEMETRY_DIR (the log folder, default the `logDir` row).
import { TELEMETRY } from '../../src/telemetry-rows.ts';
import { createCollector } from './server.ts';

const S = TELEMETRY.server, c = createCollector();
c.server.listen(S.port, S.host, () => console.log(`telemetry collector on ${S.host}:${S.port}${TELEMETRY.path}, log ${c.log.file} (max ${S.maxFileBytes} bytes x ${S.keepFiles} files)`));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { void c.close().then(() => process.exit(0)); });
