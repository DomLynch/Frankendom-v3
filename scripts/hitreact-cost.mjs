// The Node cost of ?feel=hitreact's own code (src/fight/feel-hitreact.ts): ms per frame of the hook's hit and frame calls against a stub ragdoll (no physics, no three: this is only
// the plan, the dips and the blend share). The page's real cost (Chromium) is `COST=1 node scripts/hitreact-clip.mjs`; the package's stagger/step cost is the default's too.
//   node scripts/hitreact-cost.mjs [frames]
import { hitreactHooks } from '../src/fight/feel-hitreact.ts';

const N = Number(process.argv[2] ?? 200000);
const rd = { setMotorStrength() {}, applyImpulse() {} };
const ctx = { rd, mode: 'alive', group: { rotation: { y: 0.3 } }, blendToward() {} };
const ZONES = ['head', 'torso', 'legs', 'arms'], HEADINGS = [Math.PI, 0, Math.PI / 2, -Math.PI / 2];
const time = (f) => { const t = process.hrtime.bigint(); f(); return Number(process.hrtime.bigint() - t) / 1e6; };
for (let i = 0; i < 2000; i++) { hitreactHooks.hit({ type: 'Hit', tick: i, location: 'torso', heading: 1 }, ctx); hitreactHooks.frame(1 / 60, [], ctx); }   // warm up
const idle = time(() => { for (let i = 0; i < N; i++) hitreactHooks.frame(1 / 60, [], ctx); });
let frames = 0;
const active = time(() => { for (let i = 0; i < N / 50; i++) { hitreactHooks.hit({ type: 'Hit', tick: i, location: ZONES[i % 4], heading: HEADINGS[i % 4] + 0.3 }, ctx); for (let k = 0; k < 50; k++) { hitreactHooks.frame(1 / 60, [], ctx); frames++; } } });
const hits = time(() => { for (let i = 0; i < N / 10; i++) hitreactHooks.hit({ type: 'Hit', tick: i, location: ZONES[i % 4], heading: HEADINGS[i % 4] + 0.3 }, ctx); });
console.log(`node ${process.version}: idle frame ${(idle / N).toFixed(6)} ms; active frame (a reaction in progress, plan + dips + blend) ${(active / frames).toFixed(6)} ms over ${frames} frames incl. one hit per 50; a hit alone ${(hits / (N / 10)).toFixed(6)} ms`);
