// Spawn spread, measured (PR B2): pairwise distances between the zone row's spawns, each spawn's aggro and leash reach, how much of the spawn extent is covered by exactly one boss,
// and the margin by which no pair can ever be on the hero at once (leash + opener reach + aggro). Pure node, reads the rows.
//   node scripts/zone-spread-measure.mjs
import { zoneFor } from '../src/zone/zone-rows.ts';
import { OPENERS, WORLD, spotsFor } from '../src/zone/spawns.ts';

const s = spotsFor(zoneFor('')), d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
console.log('spots (frame of the zone row, relative to its pit-area centre):', s.map((x) => `${x.id}=(${x.x.toFixed(2)}, ${x.z.toFixed(2)}) r=${Math.hypot(x.x, x.z).toFixed(2)} aggro=${x.aggro} leash=${x.leash}`).join('; '));
for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
  const gap = d(s[i], s[j]) - s[i].leash - OPENERS.reachMetres - s[j].aggro, back = d(s[i], s[j]) - s[j].leash - OPENERS.reachMetres - s[i].aggro;
  console.log(`pair ${s[i].id} ~ ${s[j].id}: ${d(s[i], s[j]).toFixed(2)} m (minSpacing ${WORLD.minSpacing}); clear of leash+reach+aggro by ${Math.min(gap, back).toFixed(2)} m`);
}
const R = WORLD.spreadRadiusMetres;
let points = 0, one = 0, two = 0, lean = 0;
for (let x = -R; x <= R; x += 0.25) for (let z = -R; z <= R; z += 0.25) {
  if (Math.hypot(x, z) > R) continue;
  points++;
  const inAggro = s.filter((b) => d(b, { x, z }) <= b.aggro).length, inLeash = s.filter((b) => d(b, { x, z }) <= b.leash).length;
  if (inAggro === 1) one++; else if (inAggro > 1) two++;
  if (inLeash > 1) lean++;
}
console.log(`spawn extent ${R} m: ${points} sample points, ${one} in exactly one aggro, ${two} in two or more aggros, ${lean} inside two leashes`);
