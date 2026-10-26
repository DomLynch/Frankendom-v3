// Data validator (V2 src/sim/validate.js, kept for the shell's own rows). Every data file has a closed key set, and
// so do its rows. An unknown key is an error, not a silent no-op. Armour is a threshold multiplier only, so no row
// anywhere may carry a block or immune field (Dom's ruling).
// Pure: callers pass parsed JSON, so it runs in Node tests and in the browser alike.
// V1's fight rows (src/fight/*-defs.json) keep V1's own loader checks (src/core/registry.ts); a schema here is
// added per file as V2's rows come back on top (PLAN.md section 5, step 5).

// file -> { keys: top-level keys, rows: { arrayKey: row keys }, maps: { objectKey: its keys } }
export const SCHEMA = {
  'stage': { keys: ['source', 'sky', 'fog', 'ground', 'grid', 'ruler', 'light', 'duel'], maps: { duel: ['about', 'id', 'fogDensity', 'sunPosition', 'floor'] } },
  'fight': { keys: ['about', 'opponent', 'level', 'seed', 'weapon', 'skill', 'skill2', 'stance', 'specials', 'tempoHz', 'frameDtMaxS', 'gfx', 'camera', 'ai', 'guardWalk', 'specialPace', 'start', 'trail', 'specialTerms', 'readyRing', 'foeWeapon', 'foeName', 'opponentV1', 'blendMs', 'settleMs', 'bladeTables', 'foeReach', 'specialSink'], maps: { specialSink: ['about', 'sink'], opponentV1: ['about', 'opponent'], bladeTables: ['about', 'hero'], foeReach: ['about', 'opponent', 'body', 'rig', 'weapon', 'query', 'v1'], blendMs: ['about', 'locomotion', 'attackIn', 'attackOut', 'specialIn', 'specialOut', 'hurtIn', 'hurtOut', 'rollIn', 'rollOut'], settleMs: ['about', 'roll'], camera: ['about', 'lift', 'side'], guardWalk: ['about', 'lowerBones'], specialPace: ['about', 'skill', 'scale'], start: ['about', 'auto'], trail: ['about', 'light', 'return', 'heavy', 'riposte', 'slashRiposte', 'thrust', 'pommel'], specialTerms: ['about', 'cooldown', 'stamina'], readyRing: ['about', 'colour', 'width', 'glow', 'gap', 'track', 'staminaTrack', 'pulseMs'], foeWeapon: ['about', 'opponent', 'weapon', 'drawn'], foeName: ['about', 'opponent', 'name'] } },
  // V3's opponent brains (src/brain.ts): a row names only V1 AiProfile knobs (src/fight/moves.ts)
  'brains': { keys: ['about', 'brains'], rows: { brains: ['id', 'reaction', 'accuracy', 'parry', 'dodge', 'aggression', 'pressure', 'discipline', 'lapse', 'read'] } },
  // Dom's picked hero strike and guard clips (src/hero-clips.ts, scripts/hero-clips/; `hold`: the guard's, src/fight/guard-hold.ts)
  'hero-clips': { keys: ['about', 'sweeps', 'rig', 'weapon', 'blade', 'clips'], rows: { clips: ['role', 'clip', 'mixamo', 'name', 'mirror', 'from', 'to', 'contact', 'pullback', 'aim', 'aimFrom', 'paths', 'hold', 'about'] }, maps: { blade: ['about', 'node', 'contact'], sweeps: ['about', 'default', 'query'] } },
  // The 65 -> 106 rig swap (src/fight/rig-bones.ts): which rig each side draws, the bone map, the weapon nodes and sockets, the 106 files.
  // `bones`, `files`, `weapons` and `gapFill` are keyed by names (bones, body stems, nodes, roles), so only their owners' keys are closed here.
  'rig': { keys: ['about', 'default', 'held', 'files', 'detect', 'bones', 'weapons', 'hide', 'gapFill', 'grip65', 'clips106'], maps: { default: ['hero', 'foe'], held: ['weapon', 'sword', 'sheath'], detect: ['65', '106'], grip65: ['hand', 'translation', 'rotation'], clips106: ['about', 'dir', 'files'] } },
  'sound': { keys: ['about', 'keep', 'statusMs'], maps: { keep: ['about', 'samples', 'rate', 'volume'] } },
  // The opponent's presentation ragdoll (src/fight/ragdoll.ts, @frankendom/physics); `rigs` rows map the package's 20 part ids to bone names
  'physics': { keys: ['about', 'on', 'query', 'v1', 'seed', 'tickHz', 'maxTicksPerFrame', 'loadAfterFirstFrameMs', 'opponents', 'bones', 'motorGain', 'motorDamping', 'states', 'hit', 'kill', 'finisher'], rows: { opponents: ['id', 'body', 'measure'] },
    maps: { bones: ['hips', 'spine', 'spine1', 'spine2', 'neck', 'head', 'armLeft', 'forearmLeft', 'handLeft', 'armRight', 'forearmRight', 'handRight', 'thighLeft', 'shinLeft', 'footLeft', 'toeLeft', 'thighRight', 'shinRight', 'footRight', 'toeRight'],
      states: ['stagger', 'death'], hit: ['parts', 'impulse', 'lift', 'blend'], kill: ['parts', 'impulse', 'lift', 'blendInS'], finisher: ['default', 'query', 'values'] } },
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
  banned(json, name, errors);
  return errors;
}

// all files together
export function validateAll(files) {
  return Object.entries(files).flatMap(([name, json]) => validateFile(name, json));
}
