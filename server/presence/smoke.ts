// npm run presence:smoke: a local two-client smoke test. It starts the service on a free loopback port (or uses PRESENCE_PORT of one already running), connects two WebSocket clients,
// walks each a few metres and prints what each one sees of the other. Exits 0 when both saw the other near where it stood, 1 otherwise.
import { createPresence } from './server.ts';
import { joinBot } from './test-client.ts';

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const external = process.env.PRESENCE_PORT ? Number(process.env.PRESENCE_PORT) : null;
const own = external === null ? createPresence({ log: () => {} }) : null;
if (own) await new Promise<void>((r) => own.server.listen(0, '127.0.0.1', r));
const port = external ?? own!.port();

const alice = await joinBot(port), bob = await joinBot(port);
console.log(`alice id ${alice.hello.id} layer ${alice.hello.layer} at (${alice.at().x}, ${alice.at().z}) m; bob id ${bob.hello.id} layer ${bob.hello.layer} at (${bob.at().x}, ${bob.at().z}) m`);
// both walk east at 3 m/s, bob 4 m north of alice, a pose every 100 ms
for (let i = 1; i <= 15; i++) { alice.pose(i * 0.3, 0); bob.pose(i * 0.3, 4); await wait(100); }
await wait(300);
const near = (seen: ReturnType<typeof alice.seen>, id: number, x: number, z: number): boolean => seen.some((e) => e.id === id && Math.hypot(e.x - x, e.z - z) < 1);
const aliceSeesBob = near(alice.seen(), bob.hello.id, 4.5, 4), bobSeesAlice = near(bob.seen(), alice.hello.id, 4.5, 0);
console.log('alice sees', JSON.stringify(alice.seen())); console.log('bob sees', JSON.stringify(bob.seen()));
console.log(`alice sees bob: ${aliceSeesBob}; bob sees alice: ${bobSeesAlice}`);
alice.close(); bob.close();
await wait(150);
if (own) { console.log('players left in the world:', own.world.stats().players); await own.close(); }
process.exit(aliceSeesBob && bobSeesAlice ? 0 : 1);
