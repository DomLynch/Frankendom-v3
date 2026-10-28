// data/mobs.json against the rest of the data (src/zone/mobs.ts reads the rows; the checks live here, beside src/sim/validate.js, because diagnostics are plain words and src/zone/ is scanned for them).
// Pure: returns one string per problem, [] = fine. `rig`: data/rig.json; `ringIds`: the data/rings.json ring ids; `areaIds`: the zone row's area ids.
import { bodyProblem } from './validate.js';

const HEX = /^#[0-9a-fA-F]{6}$/;
const KIND_KEYS = ['body', 'scale', 'tint', 'tintMix', 'hp', 'speed', 'wanderSpeed', 'damage', 'aggroMetres', 'leashMetres', 'reachMetres', 'bodyMetres', 'windupSeconds', 'recoverSeconds', 'hurtSeconds', 'knockSpeed', 'drag', 'fallSeconds', 'coins', 'xp', 'heat'];

export function validateMobs(rows, rig, ringIds = [], areaIds = [], physics = null) {
  const e = [], L = rows.limits ?? {};
  const within = (v, [lo, hi]) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const num = (at, v, range) => { if (!within(v, range)) e.push(`mobs.${at} ${String(v)} is not in ${range[0]}..${range[1]}`); };
  if (typeof rows.on !== 'boolean') e.push('mobs.on is true or false');
  if (typeof rows.pitArea !== 'string' || !rows.pitArea) e.push('mobs.pitArea is a non-empty string');
  if (!Array.isArray(rows.hero?.roamStrikes) || rows.hero.roamStrikes.some((a) => !['light', 'light_left', 'light_right', 'heavy', 'thrust', 'kick', 'heavy_right', 'heavy_left', 'heavy_thrust'].includes(a))) e.push('mobs.hero.roamStrikes is a list of the hero\'s strike presses');
  if (areaIds.length && !areaIds.includes(rows.pitArea)) e.push(`mobs.pitArea "${rows.pitArea}" is no area of the zone row`);
  num('cap', rows.cap, L.cap); num('capMax', rows.capMax, L.cap);
  if (rows.cap > rows.capMax) e.push('mobs.cap is above capMax (the typed arrays are capMax long)');
  for (const k of ['activateMetres', 'despawnMetres', 'spawnMinMetres', 'startClearMetres', 'padMetres', 'swingMetres']) num(k, rows[k], L.metres);
  if (!(rows.despawnMetres > rows.activateMetres)) e.push('mobs.despawnMetres must be above activateMetres (a pack must not blink in and out at one distance)');
  if (!(rows.spawnMinMetres < rows.activateMetres)) e.push('mobs.spawnMinMetres must be below activateMetres (a pack would never come in)');
  num('scanSeconds', rows.scanSeconds, L.seconds); num('respawnSeconds', rows.respawnSeconds, L.seconds);
  num('lod.nearMetres', rows.lod?.nearMetres, L.metres);
  for (const k of ['nearStride', 'farStride']) if (!(Number.isInteger(rows.lod?.[k]) && rows.lod[k] >= 1 && rows.lod[k] <= 30)) e.push(`mobs.lod.${k} is a whole number of frames from 1 (1 = every frame)`);
  num('hitScale', rows.hitScale, L.scale); num('turnRate', rows.turnRate, L.speed); num('speedEase', rows.speedEase, L.speed);
  const g = rows.grid ?? {};
  num('grid.cellMetres', g.cellMetres, [4, 400]);
  for (const k of ['keySpan', 'seed']) if (!Number.isInteger(g[k])) e.push(`mobs.grid.${k} is a whole number`);
  for (const k of ['a', 'b', 'c', 's1', 's2', 'range']) if (!Number.isInteger(g.hash?.[k])) e.push(`mobs.grid.hash.${k} is a whole number`);
  for (const k of ['mul', 'add', 'range']) if (!Number.isInteger(g.lcg?.[k])) e.push(`mobs.grid.lcg.${k} is a whole number`);
  const salts = Object.values(g.salts ?? {});
  if (salts.length !== 6 || salts.some((v) => !Number.isInteger(v)) || new Set(salts).size !== 6) e.push('mobs.grid.salts: six different whole numbers');
  const p = rows.pack ?? {};
  num('pack.radiusMetres', p.radiusMetres, L.metres); num('pack.wanderMetres', p.wanderMetres, L.metres); num('pack.callMetres', p.callMetres, L.metres);
  if (!Array.isArray(p.wanderSeconds) || p.wanderSeconds.length !== 2 || !within(p.wanderSeconds[0], L.seconds) || !(p.wanderSeconds[1] >= p.wanderSeconds[0])) e.push('mobs.pack.wanderSeconds is [min, max] seconds');
  num('separation.metres', rows.separation?.metres, L.metres); num('separation.speed', rows.separation?.speed, L.speed);
  num('attack.maxAttackers', rows.attack?.maxAttackers, L.cap); num('attack.orbitMetres', rows.attack?.orbitMetres, L.metres); num('attack.slackMetres', rows.attack?.slackMetres, L.metres); num('attack.ringMetres', rows.attack?.ringMetres, L.metres); num('attack.arcRadians', rows.attack?.arcRadians, [0.1, 7]); num('attack.spreadRadians', rows.attack?.spreadRadians, [0, 7]);
  const h = rows.hero ?? {};
  num('hero.radiusMetres', h.radiusMetres, L.metres); num('hero.floorHealth', h.floorHealth, [0, 1000]);
  if (typeof h.lethal !== 'boolean') e.push('mobs.hero.lethal is true or false');
  if (!(Number.isInteger(h.guard) && Number.isInteger(h.roll) && h.guard > 0 && h.roll > 0 && h.guard !== h.roll)) e.push('mobs.hero.guard and roll are different whole numbers above 0 (0 is no defence)');
  const S = rows.states ?? {}, order = ['idle', 'chase', 'windup', 'recover', 'hurt', 'dying', 'lying', 'home'];
  if (order.some((k) => !Number.isInteger(S[k])) || new Set(order.map((k) => S[k])).size !== order.length) e.push('mobs.states: eight different whole numbers');
  else if (!(S.dying < S.lying) || order.filter((k) => !['dying', 'lying'].includes(k)).some((k) => S[k] >= S.dying)) e.push('mobs.states: the fightable states are all below dying, and dying is below lying (the core compares them in that order)');
  num('fall.lyingSeconds', rows.fall?.lyingSeconds, L.seconds); num('fall.fadeSeconds', rows.fall?.fadeSeconds, L.seconds);
  const c = rows.corpse ?? {};
  num('corpse.nearMetres', c.nearMetres, L.metres); num('corpse.graceSeconds', c.graceSeconds, L.seconds); num('corpse.holdSeconds', c.holdSeconds, L.seconds); num('corpse.max', c.max, L.cap);
  num('farm.decay', rows.farm?.decay, [0, 1]);
  if (physics) {   // the corpse cut (data/physics.json): the pad must cover the any-attack-press reach (cut.strike.nearM, PR #252) and outlast the standing corpse (corpse.keepSeconds)
    const strike = physics.cut?.strike?.nearM, keep = physics.corpse?.keepSeconds;
    if (typeof strike === 'number' && !(c.nearMetres >= strike)) e.push(`mobs.corpse.nearMetres ${c.nearMetres} is under physics.json cut.strike.nearM ${strike}: a pack could stand where the hero is cutting`);
    if (typeof keep === 'number' && !(c.holdSeconds >= keep)) e.push(`mobs.corpse.holdSeconds ${c.holdSeconds} is under physics.json corpse.keepSeconds ${keep}`);
  }
  for (const [id, r] of Object.entries(rows.rings ?? {})) {
    if (id !== 'default' && ringIds.length && !ringIds.includes(id)) e.push(`mobs.rings.${id} is no data/rings.json ring`);
    num(`rings.${id}.density`, r.density, L.density);
    if (!Array.isArray(r.size) || r.size.length !== 2 || !within(r.size[0], L.size) || !within(r.size[1], L.size) || r.size[1] < r.size[0] || !Number.isInteger(r.size[0]) || !Number.isInteger(r.size[1])) e.push(`mobs.rings.${id}.size is [min, max] whole pack sizes`);
    if (!Array.isArray(r.kinds) || !r.kinds.length || r.kinds.some((k) => !(k in (rows.kinds ?? {})))) e.push(`mobs.rings.${id}.kinds names a kind that is no row`);
  }
  if (!rows.rings?.default) e.push('mobs.rings.default is the row for a zone with no rings');
  for (const id of ringIds) if (!(id in (rows.rings ?? {}))) e.push(`mobs.rings has no row for ring ${id}`);
  if (!Object.keys(rows.kinds ?? {}).length) e.push('mobs.kinds needs at least one kind');
  for (const [id, k] of Object.entries(rows.kinds ?? {})) {
    const at = `kinds.${id}`;
    for (const key of Object.keys(k)) if (!KIND_KEYS.includes(key)) e.push(`mobs.${at}.${key}: unknown key`);
    for (const key of KIND_KEYS) if (!(key in k)) e.push(`mobs.${at}.${key}: missing`);
    if (rig) { const why = bodyProblem(k.body, rig); if (why) e.push(`mobs.${at}.body: ${why}`); }
    if (!HEX.test(k.tint ?? '')) e.push(`mobs.${at}.tint is a #rrggbb colour`);
    num(`${at}.tintMix`, k.tintMix, L.tintMix); num(`${at}.scale`, k.scale, L.scale); num(`${at}.hp`, k.hp, L.hp); num(`${at}.damage`, k.damage, L.damage);
    for (const key of ['speed', 'wanderSpeed', 'knockSpeed', 'drag']) num(`${at}.${key}`, k[key], L.speed);
    for (const key of ['aggroMetres', 'leashMetres', 'reachMetres', 'bodyMetres']) num(`${at}.${key}`, k[key], L.metres);
    for (const key of ['windupSeconds', 'recoverSeconds', 'hurtSeconds', 'fallSeconds']) num(`${at}.${key}`, k[key], L.seconds);
    for (const key of ['coins', 'xp', 'heat']) num(`${at}.${key}`, k[key], L.coins);
    if (!(k.leashMetres > k.aggroMetres)) e.push(`mobs.${at}.leashMetres must be above aggroMetres`);
  }
  return e;
}
