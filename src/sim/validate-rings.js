// data/rings.json against the rest of the data (src/zone/rings.ts reads the rows; the checks live here, beside src/sim/validate.js, because diagnostics are plain words and src/zone/ is
// scanned for them). Pure: returns one string per problem, [] = fine.
import { bodyProblem } from './validate.js';

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * `rows`: data/rings.json. `zone`: the zone row (ring 1 holds its own spawns). `origin`: the pit's centre in the zone's frame. `kinds`: the data/profiles.json ids. `rig`: data/rig.json.
 * `plates`: the sky ring's plate ids (data/stage.json skyline.ring.plates). `mechanics`: the mechanic ids a boss may name (data/mechanics.json rows; the registry in src/fight/mechanics); omitted = none.
 */
export function validateRings(rows, zone, origin, kinds, rig, plates, mechanics) {
  const e = [];
  const within = (v, [lo, hi]) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const L = rows.limits;
  if (!(Number.isFinite(rows.roundTo) && rows.roundTo >= 1)) e.push('rings.roundTo must be a number from 1');
  if (!(Number.isFinite(rows.halfTurnDegrees) && rows.halfTurnDegrees > 0)) e.push('rings.halfTurnDegrees must be above 0');
  if (!Array.isArray(rows.rings) || !rows.rings.length) return [...e, 'rings.rings needs at least one ring'];
  const seen = new Set(), bossKinds = new Set();
  for (const b of rows.bosses ?? []) {
    const at = `rings.bosses.${String(b.kind)}`;
    if (bossKinds.has(b.kind)) e.push(`${at}: two bosses rows share a kind`); else bossKinds.add(b.kind);
    if (!kinds.includes(b.kind)) e.push(`${at}: no data/profiles.json row`);
    if (typeof b.name !== 'string' || !b.name.trim()) e.push(`${at}.name: a non-empty string`);
    const why = bodyProblem(b.body, rig); if (why) e.push(`${at}.body: ${why}`);
    if (b.mechanic !== null && !(typeof b.mechanic === 'string' && (mechanics ?? []).includes(b.mechanic))) e.push(`${at}.mechanic: null, or one of the registered mechanics (${(mechanics ?? []).join(', ') || 'none'})`);
    if (!within(b.respawnSeconds, L.respawnSeconds)) e.push(`${at}.respawnSeconds out of range`);
    for (const k of ['aggro', 'leash', 'roam']) if (!(Number.isFinite(b[k]) && b[k] >= 0)) e.push(`${at}.${k}: a number from 0`);
    if (!(b.leash > b.aggro)) e.push(`${at}.leash must be above its aggro`);
  }
  const sorted = [...rows.rings].sort((p, q) => p.minDist - q.minDist);
  sorted.forEach((r, i) => {
    const at = `rings.${String(r.id)}`;
    if (typeof r.id !== 'string' || !r.id || seen.has(r.id)) e.push(`${at}: a unique non-empty id`); else seen.add(r.id);
    if (!within(r.minDist, L.distance) || !within(r.maxDist, L.distance) || !(r.minDist < r.maxDist)) e.push(`${at}: minDist..maxDist must be an increasing band inside ${L.distance[0]}..${L.distance[1]}`);
    if (i > 0 && !(r.minDist > sorted[i - 1].maxDist)) e.push(`${at}: its band overlaps ring ${sorted[i - 1].id}`);
    if (!within(r.blendAtMetres, L.distance)) e.push(`${at}.blendAtMetres out of range`);
    if (typeof r.groundTint !== 'string' || !HEX.test(r.groundTint)) e.push(`${at}.groundTint: a #rrggbb`);
    for (const p of plates) if (!within(r.skyPlates?.[p], L.plateWeight)) e.push(`${at}.skyPlates.${p}: a weight in ${L.plateWeight[0]}..${L.plateWeight[1]}`);
    for (const p of Object.keys(r.skyPlates ?? {})) if (!plates.includes(p)) e.push(`${at}.skyPlates.${p}: no sky ring plate (${plates.join(', ')})`);
    for (const k of ['health', 'damage']) if (!within(r[k], L.multiplier)) e.push(`${at}.${k}: a multiplier in ${L.multiplier[0]}..${L.multiplier[1]}`);
    if (r.loadAfterKillMetres !== null && !within(r.loadAfterKillMetres, L.distance)) e.push(`${at}.loadAfterKillMetres: null or a distance`);
    for (const s of r.spawns ?? []) {
      if (!bossKinds.has(s.kind)) e.push(`${at}.spawns: kind "${String(s.kind)}" has no bosses row`);
      if (!Number.isInteger(s.count) || !within(s.count, L.count)) e.push(`${at}.spawns.${String(s.kind)}.count out of range`);
      if (!within(s.angleDeg, L.angleDeg) || !within(s.stepDeg, L.angleDeg)) e.push(`${at}.spawns.${String(s.kind)} angle out of range`);
      if (!(s.distance >= r.minDist && s.distance <= r.maxDist)) e.push(`${at}.spawns.${String(s.kind)}.distance ${s.distance} is outside the band ${r.minDist}..${r.maxDist}`);
    }
  });
  const used = rows.rings.flatMap((r) => r.spawns.map((s) => s.kind));
  if (new Set(used).size !== used.length) e.push('rings: a boss kind stands in two places (a kind carries one ring multiplier)');
  for (const b of rows.bosses ?? []) if (!used.includes(b.kind)) e.push(`rings.bosses.${b.kind}: no ring spawn uses it`);
  const first = sorted[0];
  for (const s of zone.spawns) { const d = Math.hypot(s.position.x - origin.x, s.position.z - origin.z); if (!(d >= first.minDist && d <= first.maxDist)) e.push(`zone spawn ${s.id} stands ${d} m from the pit, outside ring ${first.id} (${first.minDist}..${first.maxDist})`); }
  return e;
}
