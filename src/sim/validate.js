// Data validator (V2 src/sim/validate.js, kept for the shell's own rows). Every data file has a closed key set, and
// so do its rows. An unknown key is an error, not a silent no-op. Armour is a threshold multiplier only, so no row
// anywhere may carry a block or immune field (Dom's ruling).
// Pure: callers pass parsed JSON, so it runs in Node tests and in the browser alike.
// V1's fight rows (src/fight/*-defs.json) keep V1's own loader checks (src/core/registry.ts); a schema here is
// added per file as V2's rows come back on top (PLAN.md section 5, step 5).

// file -> { keys: top-level keys, rows: { arrayKey: row keys }, maps: { objectKey: its keys } }
export const SCHEMA = {
  'stage': { keys: ['source', 'sky', 'fog', 'ground', 'grid', 'ruler', 'light', 'duel'], maps: { duel: ['about', 'id', 'fogDensity', 'sunPosition', 'floor'] } },
  'fight': { keys: ['about', 'opponent', 'level', 'seed', 'weapon', 'skill', 'skill2', 'stance', 'specials', 'tempoHz', 'frameDtMaxS', 'gfx', 'camera', 'ai', 'guardWalk', 'start'], maps: { camera: ['about', 'lift', 'side'], guardWalk: ['about', 'lowerBones'], start: ['about', 'auto'] } },
  // V3's opponent brains (src/brain.ts): a row names only V1 AiProfile knobs (src/fight/moves.ts)
  'brains': { keys: ['about', 'brains'], rows: { brains: ['id', 'reaction', 'accuracy', 'parry', 'dodge', 'aggression', 'pressure', 'discipline', 'lapse', 'read'] } },
  'sound': { keys: ['about', 'keep', 'statusMs'], maps: { keep: ['about', 'samples', 'rate', 'volume'] } },
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
