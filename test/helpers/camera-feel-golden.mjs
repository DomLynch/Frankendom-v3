// node test/helpers/camera-feel-golden.mjs  -> rewrites test/fixtures/camera-feel-ab.json from the code as it stands. Run it ONLY on a deliberate retune.
import { writeFileSync } from 'node:fs';
import { probe } from './camera-feel-probe.mjs';
writeFileSync(new URL('../fixtures/camera-feel-ab.json', import.meta.url), JSON.stringify(probe()));
