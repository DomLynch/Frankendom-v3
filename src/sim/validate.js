// Data validator (V2 src/sim/validate.js, kept for the shell's own rows). Every data file has a closed key set, and
// so do its rows. An unknown key is an error, not a silent no-op. Armour is a threshold multiplier only, so no row
// anywhere may carry a block or immune field (Dom's ruling).
// Pure: callers pass parsed JSON, so it runs in Node tests and in the browser alike.
// V1's fight rows (src/fight/*-defs.json) keep V1's own loader checks (src/core/registry.ts); a schema here is
// added per file as V2's rows come back on top (PLAN.md section 5, step 5).

// file -> { keys: top-level keys, rows: { arrayKey: row keys }, maps: { objectKey: its keys } }
export const SCHEMA = {
  'stage': { keys: ['source', 'sky', 'fog', 'ground', 'grid', 'ruler', 'light', 'duel'], maps: { duel: ['about', 'id', 'fogDensity', 'sunPosition', 'floor'] } },
  'fight': { keys: ['about', 'opponent', 'level', 'seed', 'weapon', 'skill', 'skill2', 'stance', 'specials', 'tempoHz', 'frameDtMaxS', 'gfx', 'camera', 'ai', 'guardWalk', 'specialPace', 'start', 'trail', 'specialTerms', 'readyRing', 'foeWeapon', 'foeName', 'opponentV1', 'blendMs', 'settleMs', 'bladeTables', 'foeReach', 'specialSink', 'foeSpecialReach', 'specialFx'], maps: { specialSink: ['about', 'sink'], opponentV1: ['about', 'opponent'], bladeTables: ['about', 'hero'], foeReach: ['about', 'opponent', 'body', 'rig', 'weapon', 'query', 'v1'], blendMs: ['about', 'locomotion', 'attackIn', 'attackOut', 'specialIn', 'specialOut', 'hurtIn', 'hurtOut', 'rollIn', 'rollOut'], settleMs: ['about', 'roll'], camera: ['about', 'lift', 'side'], guardWalk: ['about', 'lowerBones'], specialPace: ['about', 'skill', 'scale'], start: ['about', 'auto'], trail: ['about', 'light', 'return', 'heavy', 'riposte', 'slashRiposte', 'thrust', 'pommel'], specialTerms: ['about', 'cooldown', 'stamina'], readyRing: ['about', 'colour', 'width', 'glow', 'gap', 'track', 'staminaTrack', 'pulseMs'], foeWeapon: ['about', 'opponent', 'weapon', 'drawn'], foeName: ['about', 'opponent', 'name'], foeSpecialReach: ['about', 'on', 'start', 'release'], specialFx: ['about', 'skills', 'cameraKick', 'flash', 'sparks', 'trailSkill', 'trailReaping', 'soundGain', 'soundRows'] } },
  // V3's opponent brains (src/brain.ts): a row names only V1 AiProfile knobs (src/fight/moves.ts)
  'brains': { keys: ['about', 'brains'], rows: { brains: ['id', 'reaction', 'accuracy', 'parry', 'dodge', 'aggression', 'pressure', 'discipline', 'lapse', 'read'] } },
  // Dom's picked hero strike and guard clips (src/hero-clips.ts, scripts/hero-clips/; `hold`: the guard's, src/fight/guard-hold.ts)
  'hero-clips': { keys: ['about', 'sweeps', 'rig', 'weapon', 'blade', 'clips'], rows: { clips: ['role', 'clip', 'mixamo', 'name', 'mirror', 'from', 'to', 'contact', 'pullback', 'aim', 'aimFrom', 'paths', 'hold', 'about'] }, maps: { blade: ['about', 'node', 'contact'], sweeps: ['about', 'default', 'query'] } },
  // The 65 -> 106 rig swap (src/fight/rig-bones.ts): which rig each side draws, the bone map, the weapon nodes and sockets, the 106 files.
  // `bones`, `files`, `weapons` and `gapFill` are keyed by names (bones, body stems, nodes, roles), so only their owners' keys are closed here.
  'rig': { keys: ['about', 'default', 'held', 'files', 'detect', 'bones', 'weapons', 'hide', 'gapFill', 'grip65', 'clips106', 'clipLoad'], maps: { default: ['hero', 'foe'], held: ['weapon', 'sword', 'sheath'], detect: ['65', '106'], grip65: ['hand', 'translation', 'rotation'], clips106: ['about', 'dir', 'files'], clipLoad: ['about', 'hero', 'afterFirstFrame'] } },
  // What scripts/build.mjs never ships (106 only: the 65 bodies, kits and 65-keyed clip JSONs; test/rig-bones.test.mjs)
  'build': { keys: ['about', 'notShipped'] },
  'sound': { keys: ['about', 'keep', 'statusMs'], maps: { keep: ['about', 'samples', 'rate', 'volume'] } },
  // The opponent's presentation ragdoll (src/fight/ragdoll.ts, @frankendom/physics); `rigs` rows map the package's 20 part ids to bone names
  'physics': { keys: ['about', 'on', 'query', 'v1', 'seed', 'tickHz', 'maxTicksPerFrame', 'loadAfterFirstFrameMs', 'opponents', 'bones', 'motorTuning', 'solveHinges', 'states', 'hit', 'kill', 'cut', 'corpse', 'finisher', 'finisherCuts'], rows: { opponents: ['id', 'body', 'measure', 'helmet', 'gear'] },
    maps: { bones: ['hips', 'spine', 'spine1', 'spine2', 'neck', 'head', 'armLeft', 'forearmLeft', 'handLeft', 'armRight', 'forearmRight', 'handRight', 'thighLeft', 'shinLeft', 'footLeft', 'toeLeft', 'thighRight', 'shinRight', 'footRight', 'toeRight'],
      states: ['stagger', 'death'], hit: ['parts', 'impulse', 'lift', 'blend'], kill: ['parts', 'impulse', 'lift', 'blendInS'], cut: ['about', 'on', 'log', 'onKill', 'sever', 'kill', 'tap', 'cue', 'seam', 'cap', 'helmet'], corpse: ['about', 'keepSeconds', 'pieceSeconds', 'max'], finisher: ['default', 'query', 'values'], finisherCuts: ['about', 'rows'] },
    // an object of rows keyed by id: path -> the keys each row may carry
    rowMaps: { 'finisherCuts.rows': ['unit', 'atS', 'push', 'kill', 'plane'] },
    finite: { 'corpse': ['keepSeconds', 'pieceSeconds', 'max'], 'cut.cue': ['sizePx', 'pulseS', 'delayS'], 'cut.tap': ['maxMovePx', 'maxMs', 'impulse', 'lift', 'awayMult', 'sideMult'] } },
  // The package's M4 hit/cut rules evaluator driving that ragdoll (src/fight/rules-eval.ts), opt-in ?rules=m4; `armour` and `weapons` are keyed by opponent / weapon ids
  'rules': { keys: ['about', 'on', 'query', 'v1', 'm4', 'tickHz', 'handSpeedRef', 'handBone', 'handFrom', 'speedSpanS', 'speedWindow', 'speedScale', 'heavyDivisor', 'snapOver', 'speedMin', 'speedMaxRef', 'budgets', 'swordSide', 'legHp', 'legSide', 'heavyMoves', 'killAs', 'renewOnKill', 'cut', 'impulseAt', 'impulseClamp', 'getUpS', 'log', 'armour', 'weapons'],
    maps: { budgets: ['head', 'torso', 'arm_sword', 'arm_off'], cut: ['about', 'precedence'] } },
  // Phase 3 design rows (docs/ZONE-SERVER-DESIGN.md, src/server-model/zone-model.ts): nothing in the game reads them yet. The model's own parseRules checks values.
  'zone-server-rules': { keys: ['about', 'writerRoles', 'ids', 'engage', 'hit', 'progression', 'weapons', 'share', 'caps', 'respawn', 'log', 'refusals', 'payReasons'],
    rows: { weapons: ['id', 'maxDamagePerHit', 'maxHitsPerS'], refusals: ['id', 'status', 'text'], payReasons: ['id', 'text'] },
    maps: { ids: ['instancePattern', 'tokenPattern', 'batchIdPattern', 'weaponPattern', 'note'], engage: ['tokenBytes', 'ttlS', 'maxOpenPerAccount', 'note'], hit: ['maxBatchRows', 'maxHitsPerRow', 'firstHitAllowanceS', 'maxElapsedS', 'dpsSlack', 'retryFailedBatch', 'note'],
      progression: ['maxDamageMult', 'note'], share: ['minSharePct', 'renormalise', 'hitExpiryS', 'note'], caps: ['killsPerMin', 'killsPerHour', 'cooldownAcrossLayers', 'note'], respawn: ['minS', 'maxS', 'defaultS', 'note'], log: ['keepS', 'note'] } },
};

const BANNED = /^(block|blocks|immune|immunity)$/i;

function banned(value, path, errors) {
  if (Array.isArray(value)) value.forEach((v, i) => banned(v, `${path}[${i}]`, errors));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (BANNED.test(k)) errors.push(`${path}.${k}: armour may not block or grant immunity`);
      banned(v, `${path}.${k}`, errors);
    }
  }
}

// one file: returns a list of error strings (empty = valid)
export function validateFile(name, json) {
  const errors = [];
  const s = SCHEMA[name];
  if (!s) return [`${name}: no schema (add one to src/sim/validate.js)`];
  for (const k of Object.keys(json)) if (!s.keys.includes(k)) errors.push(`${name}.${k}: unknown key`);
  for (const [arr, keys] of Object.entries(s.rows || {})) {
    (json[arr] || []).forEach((row, i) => {
      for (const k of Object.keys(row)) if (!keys.includes(k)) errors.push(`${name}.${arr}[${i}] (${row.id ?? row.press}).${k}: unknown key`);
    });
  }
  for (const [obj, keys] of Object.entries(s.maps || {})) {
    for (const k of Object.keys(json[obj] || {})) if (!keys.includes(k)) errors.push(`${name}.${obj}.${k}: unknown key`);
  }
  for (const [path, keys] of Object.entries(s.rowMaps || {})) {
    const [a, b] = path.split('.');
    for (const [id, row] of Object.entries(json[a]?.[b] || {})) for (const k of Object.keys(row)) if (!keys.includes(k)) errors.push(`${name}.${path}.${id}.${k}: unknown key`);
  }
  for (const [path, keys] of Object.entries(s.finite || {})) {   // numeric rows: each key must be present and a finite number (a missing one would reach the page as NaN)
    const obj = path.split('.').reduce((o, p) => o?.[p], json);
    for (const k of keys) if (!Number.isFinite(obj?.[k])) errors.push(`${name}.${path}.${k}: must be a finite number`);
  }
  if (name === 'rules') {   // the hand-speed rows (rules-eval.ts handSpeedOf): finite, scale in (0, 1], divisor at least 1, span and window positive (an absent or bad one would reach the page as NaN)
    const num = (k, ok, want) => { if (!Number.isFinite(json[k]) || !ok(json[k])) errors.push(`${name}.${k}: must be ${want}`); };
    num('speedScale', (v) => v > 0 && v <= 1, 'a finite number in (0, 1]'); num('heavyDivisor', (v) => v >= 1, 'a finite number >= 1');
    num('speedSpanS', (v) => v > 0, 'a finite number > 0'); num('speedWindow', (v) => v >= 1 && Number.isInteger(v), 'an integer >= 1');
    num('speedMin', (v) => v > 0, 'a finite number > 0'); num('snapOver', (v) => v > 0, 'a finite number > 0');
    // cut.precedence (rules-eval.ts cutPrecedence): per hit zone, who wins a KILLING blow: the evaluator's cut or the sim's finisher rotation. A zone with no entry is the rotation.
    const pr = json.cut?.precedence;
    if (!pr || typeof pr !== 'object' || Array.isArray(pr)) errors.push(`${name}.cut.precedence: must be an object of zone -> 'evaluator' | 'finisher'`);
    else for (const [zone, who] of Object.entries(pr)) {
      if (!['head', 'torso', 'legs'].includes(zone)) errors.push(`${name}.cut.precedence.${zone}: unknown zone (head, torso, legs)`);
      if (who !== 'evaluator' && who !== 'finisher') errors.push(`${name}.cut.precedence.${zone}: must be 'evaluator' or 'finisher'`);
    }
  }
  if (name === 'physics' && json.cut?.cue) {   // the cue's units are the package's severable ids, every unit has a label, and the colour is pasted into CSS: a plain #rrggbb only
    const cue = json.cut.cue, UNITS = ['head', 'arm_left', 'arm_right', 'leg_left', 'leg_right', 'torso_waist'];
    for (const u of cue.units ?? []) if (!UNITS.includes(u)) errors.push(`${name}.cut.cue.units: unknown unit ${u}`);
    for (const u of cue.units ?? []) if (typeof cue.labels?.[u] !== 'string' || !cue.labels[u].trim()) errors.push(`${name}.cut.cue.labels.${u}: a unit needs a label`);
    if (!/^#[0-9a-fA-F]{6}$/.test(cue.color ?? '')) errors.push(`${name}.cut.cue.color: must be #rrggbb`);
  }
  if (name === 'physics' && json.corpse) {   // how many corpses stand is a whole number (0 = none), and a corpse's pieces go no later than the body
    const c = json.corpse;
    if (!Number.isInteger(c.max) || c.max < 0) errors.push(`${name}.corpse.max: must be an integer >= 0`);
    if (Number.isFinite(c.keepSeconds) && Number.isFinite(c.pieceSeconds) && c.pieceSeconds > c.keepSeconds) errors.push(`${name}.corpse.pieceSeconds: must be <= keepSeconds`);
  }
  banned(json, name, errors);
  return errors;
}

// ---- zone rows (data/zones/*.json; read by src/zone/zone-rows.ts). Closed key sets and a closed range for every number. ----------------------
// ZONE_RANGES is the one place the allowed spans live: [min, max] inclusive. The test pins them against the shipped row.
export const ZONE_RANGES = {
  band: [1, 100], facing: [-7, 7], downSeconds: [0.1, 60], respawnSeconds: [1, 3600],
  aggro: [0.5, 100], leash: [0.5, 200], roam: [0, 50], campSize: [1, 16], coord: [-100000, 100000],
};
const ZONE_ID = /^[a-z0-9][a-z0-9-]*$/;   // a string id; "z01:" and a bare number are refused (V1 migration 20261022110000: zone 0 was once stored as zone 1)
const ZONE_KEYS = {
  row: ['about', 'id', 'name', 'alias', 'band', 'pvp', 'respawn', 'areas', 'spawns'],
  respawn: ['x', 'z', 'facing', 'downSeconds', 'died'],
  area: ['id', 'name', 'shape', 'min', 'max', 'pvp', 'spawnsAllowed'],
  spawn: ['id', 'kind', 'position', 'respawnSeconds', 'roster', 'behaviour'],
  behaviour: ['aggro', 'leash', 'roam', 'campSize'],
  index: ['about', 'default', 'zones'],
};

/** One zone row: a list of error strings (empty = valid). `kinds`: when given, every spawn `kind` must be one of them (the opponent profile ids). */
export function validateZone(row, kinds) {
  const e = [];
  const at = (path, msg) => e.push(`zone.${path}: ${msg}`);
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const num = (path, v, [lo, hi]) => { if (!Number.isFinite(v) || v < lo || v > hi) at(path, `must be a number in [${lo}, ${hi}]`); };
  const str = (path, v) => { if (typeof v !== 'string' || !v.trim()) at(path, 'must be a non-empty string'); };
  const keys = (path, obj, allowed) => { for (const k of Object.keys(obj)) if (!allowed.includes(k)) at(`${path}.${k}`, 'unknown key'); for (const k of allowed) if (k !== 'about' && !(k in obj)) at(`${path}.${k}`, 'missing'); };
  const pair = (path, v, range) => { if (!Array.isArray(v) || v.length !== 2) at(path, 'must be [a, b]'); else { num(`${path}[0]`, v[0], range); num(`${path}[1]`, v[1], range); } };
  if (!isObj(row)) return ['zone: must be an object'];
  keys('row', row, ZONE_KEYS.row);
  if (typeof row.id !== 'string' || !ZONE_ID.test(row.id)) at('id', 'must be a lowercase string id (a number or a "z01:" form is refused)');
  str('name', row.name);
  if (typeof row.alias !== 'string' || !/^[a-z][a-z0-9-]*$/.test(row.alias)) at('alias', 'must be a lowercase word');
  pair('band', row.band, ZONE_RANGES.band);
  if (Array.isArray(row.band) && row.band[0] > row.band[1]) at('band', 'min is above max');
  if (!['on', 'off'].includes(row.pvp)) at('pvp', "must be 'on' or 'off'");
  if (!isObj(row.respawn)) at('respawn', 'must be an object');
  else {
    keys('respawn', row.respawn, ZONE_KEYS.respawn);
    num('respawn.x', row.respawn.x, ZONE_RANGES.coord); num('respawn.z', row.respawn.z, ZONE_RANGES.coord);
    num('respawn.facing', row.respawn.facing, ZONE_RANGES.facing); num('respawn.downSeconds', row.respawn.downSeconds, ZONE_RANGES.downSeconds);
    str('respawn.died', row.respawn.died);
  }
  const inside = (a, x, z) => x >= a.min[0] && x <= a.max[0] && z >= a.min[1] && z <= a.max[1];
  const areas = Array.isArray(row.areas) ? row.areas : (at('areas', 'must be an array'), []);
  const seenArea = new Set();
  areas.forEach((a, i) => {
    const p = `areas[${i}]`;
    if (!isObj(a)) return at(p, 'must be an object');
    keys(p, a, ZONE_KEYS.area);
    str(`${p}.id`, a.id); str(`${p}.name`, a.name);
    if (seenArea.has(a.id)) at(`${p}.id`, `duplicate id '${a.id}'`); seenArea.add(a.id);
    if (a.shape !== 'rect') at(`${p}.shape`, "must be 'rect'");
    pair(`${p}.min`, a.min, ZONE_RANGES.coord); pair(`${p}.max`, a.max, ZONE_RANGES.coord);
    if (Array.isArray(a.min) && Array.isArray(a.max) && (a.min[0] >= a.max[0] || a.min[1] >= a.max[1])) at(p, 'min must be below max on both axes');
    if (!['on', 'off'].includes(a.pvp)) at(`${p}.pvp`, "must be 'on' or 'off'");
    if (typeof a.spawnsAllowed !== 'boolean') at(`${p}.spawnsAllowed`, 'must be a boolean');
  });
  const spawns = Array.isArray(row.spawns) ? row.spawns : (at('spawns', 'must be an array'), []);
  if (!spawns.length) at('spawns', 'needs at least one spawn row');
  const seenSpawn = new Set();
  spawns.forEach((s, i) => {
    const p = `spawns[${i}]`;
    if (!isObj(s)) return at(p, 'must be an object');
    keys(p, s, ZONE_KEYS.spawn);
    str(`${p}.id`, s.id); str(`${p}.kind`, s.kind);
    if (seenSpawn.has(s.id)) at(`${p}.id`, `duplicate id '${s.id}'`); seenSpawn.add(s.id);
    if (kinds && !kinds.includes(s.kind)) at(`${p}.kind`, `'${s.kind}' is not an opponent profile id`);
    if (!isObj(s.position)) at(`${p}.position`, 'must be {x, z}');
    else {
      keys(`${p}.position`, s.position, ['x', 'z']);
      num(`${p}.position.x`, s.position.x, ZONE_RANGES.coord); num(`${p}.position.z`, s.position.z, ZONE_RANGES.coord);
      for (const a of areas) if (a.spawnsAllowed === false && Array.isArray(a.min) && Array.isArray(a.max) && inside(a, s.position.x, s.position.z)) at(`${p}.position`, `is inside area '${a.id}', which allows no spawns`);
    }
    num(`${p}.respawnSeconds`, s.respawnSeconds, ZONE_RANGES.respawnSeconds);
    if (typeof s.roster !== 'boolean') at(`${p}.roster`, 'must be a boolean');
    if (!isObj(s.behaviour)) at(`${p}.behaviour`, 'must be an object');
    else {
      const b = s.behaviour;
      keys(`${p}.behaviour`, b, ZONE_KEYS.behaviour);
      num(`${p}.behaviour.aggro`, b.aggro, ZONE_RANGES.aggro); num(`${p}.behaviour.leash`, b.leash, ZONE_RANGES.leash); num(`${p}.behaviour.roam`, b.roam, ZONE_RANGES.roam);
      if (Number.isFinite(b.aggro) && Number.isFinite(b.leash) && b.leash < b.aggro) at(`${p}.behaviour.leash`, 'is shorter than aggro');
      pair(`${p}.behaviour.campSize`, b.campSize, ZONE_RANGES.campSize);
      if (Array.isArray(b.campSize) && (!Number.isInteger(b.campSize[0]) || !Number.isInteger(b.campSize[1]) || b.campSize[0] > b.campSize[1])) at(`${p}.behaviour.campSize`, 'must be whole numbers, min <= max');
    }
  });
  banned(row, 'zone', e);
  return e;
}

/** data/zones/index.json against the loaded rows (`rows`: id -> row): the default is a listed id, every listed id has a row whose own id matches. */
export function validateZoneIndex(index, rows) {
  const e = [];
  for (const k of Object.keys(index ?? {})) if (!ZONE_KEYS.index.includes(k)) e.push(`zones.index.${k}: unknown key`);
  if (typeof index?.default !== 'string' || !ZONE_ID.test(index.default)) e.push('zones.index.default: must be a string zone id');
  if (!Array.isArray(index?.zones) || !index.zones.length) e.push('zones.index.zones: needs at least one id');
  else {
    if (!index.zones.includes(index.default)) e.push(`zones.index.default '${index.default}' is not in zones`);
    for (const id of index.zones) if (rows[id]?.id !== id) e.push(`zones.index: '${id}' has no row with that id`);
    for (const id of Object.keys(rows)) if (!index.zones.includes(id)) e.push(`zones.index: row '${id}' is not listed`);
  }
  return e;
}

// all files together
export function validateAll(files) {
  return Object.entries(files).flatMap(([name, json]) => validateFile(name, json));
}
