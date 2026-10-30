// node server/zone/main.ts (npm run zone-writer): the proof zone writer, standalone, loopback, in memory (server/zone/writer.ts). Port and bind are rows (server/zone/writer-rows.json); ZONE_WRITER_PORT overrides the port.
import { createWriter, WRITER } from './writer.ts';

const port = Number(process.env.ZONE_WRITER_PORT) || WRITER.port, w = createWriter();
w.server.listen(port, WRITER.host, () => console.log(`zone writer (proof, in memory) on ${WRITER.host}:${w.port()}`));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { w.server.close(() => process.exit(0)); });
