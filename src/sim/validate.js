// Data validator (V2 src/sim/validate.js, kept for the shell's own rows). Every data file has a closed key set, and
// so do its rows. An unknown key is an error, not a silent no-op. Armour is a threshold multiplier only, so no row
// anywhere may carry a block or immune field (Dom's ruling).
// Pure: callers pass parsed JSON, so it runs in Node tests and in the browser alike.
// V1's fight rows (src/fight/*-defs.json) keep V1's own loader checks (src/core/registry.ts); a schema here is
// added per file as V2's rows come back on top (PLAN.md section 5, step 5).

// file -> { keys: top-level keys, rows: { arrayKey: row keys }, maps: { objectKey: its keys } }
export const SCHEMA = {
  'stage': { keys: ['source', 'sky', 'fog', 'ground', 'grid', 'ruler', 'light', 'duel'], maps: { duel: ['about', 'id', 'fogDensity', 'sunPosition', 'floor'] } },
  'fight': { keys: ['about', 'opponent', 'profile', 'level', 'seed', 'weapon', 'skill', 'skill2', 'stance', 'specials', 'tempoHz', 'frameDtMaxS', 'gfx', 'camera', 'ai', 'guardWalk', 'specialPace', 'start', 'trail', 'specialTerms', 'readyRing', 'foeWeapon', 'foeName', 'opponentV1', 'blendMs', 'settleMs', 'bladeTables', 'foeReach', 'specialSink', 'foeSpecialReach', 'specialFx'], maps: { specialSink: ['about', 'sink'], opponentV1: ['about', 'opponent'], bladeTables: ['about', 'hero'], foeReach: ['about', 'opponent', 'body', 'rig', 'weapon', 'query', 'v1'], blendMs: ['about', 'locomotion', 'attackIn', 'attackOut', 'specialIn', 'specialOut', 'hurtIn', 'hurtOut', 'rollIn', 'rollOut'], settleMs: ['about', 'roll'], camera: ['about', 'lift', 'side', 'zoom', 'pitch'], guardWalk: ['about', 'lowerBones'], specialPace: ['about', 'skill', 'scale'], start: ['about', 'auto'], trail: ['about', 'light', 'return', 'heavy', 'riposte', 'slashRiposte', 'thrust', 'pommel'], specialTerms: ['about', 'cooldown', 'stamina'], readyRing: ['about', 'colour', 'width', 'glow', 'gap', 'track', 'staminaTrack', 'pulseMs'], foeWeapon: ['about', 'opponent', 'weapon', 'drawn'], foeName: ['about', 'opponent', 'name'], foeSpecialReach: ['about', 'on', 'start', 'release'], specialFx: ['about', 'skills', 'cameraKick', 'flash', 'sparks', 'trailSkill', 'trailReaping', 'soundGain', 'soundRows'] } },
  // V3's opponent brains (src/brain.ts): a row names only V1 AiProfile knobs (src/fight/moves.ts)
  'brains': { keys: ['about', 'brains'], rows: { brains: ['id', 'reaction', 'accuracy', 'parry', 'dodge', 'aggression', 'pressure', 'discipline', 'lapse', 'read'] } },
  // The difficulty ladder over an opponent profile row (src/difficulty.ts): a row names only the brain knobs and the two scales; checked by checkDifficulty below
  'difficulty': { keys: ['about', 'default', 'rows', 'named'], rows: { rows: ['id', 'reaction', 'accuracy', 'parry', 'dodge', 'aggression', 'pressure', 'discipline', 'lapse', 'read', 'foeHealthScale', 'foeDamageScale', 'about'], named: ['id', 'reaction', 'accuracy', 'parry', 'dodge', 'aggression', 'pressure', 'discipline', 'lapse', 'read', 'foeHealthScale', 'foeDamageScale', 'about'] } },
  'profiles': { keys: ['about', 'default', 'defaultBody', 'bodyQuery', 'profiles'], rows: { profiles: ['id', 'about', 'opponent', 'body', 'brain', 'foeHealthScale', 'foeDamageScale'] } },
  // Dom's picked hero strike and guard clips (src/hero-clips.ts, scripts/hero-clips/; `hold`: the guard's, src/fight/guard-hold.ts)
  'hero-clips': { keys: ['about', 'sweeps', 'rig', 'weapon', 'blade', 'clips'], rows: { clips: ['role', 'clip', 'mixamo', 'name', 'mirror', 'from', 'to', 'contact', 'pullback', 'aim', 'aimFrom', 'paths', 'hold', 'about'] }, maps: { blade: ['about', 'node', 'contact'], sweeps: ['about', 'default', 'query'] } },
  // The 65 -> 106 rig swap (src/fight/rig-bones.ts): which rig each side draws, the bone map, the weapon nodes and sockets, the 106 files.
  // `bones`, `files`, `weapons` and `gapFill` are keyed by names (bones, body stems, nodes, roles), so only their owners' keys are closed here.
  'rig': { keys: ['about', 'default', 'held', 'files', 'detect', 'bones', 'weapons', 'hide', 'gapFill', 'grip65', 'clips106', 'clipLoad'], maps: { default: ['hero', 'foe'], held: ['weapon', 'sword', 'sheath'], detect: ['65', '106'], grip65: ['hand', 'translation', 'rotation'], clips106: ['about', 'dir', 'files'], clipLoad: ['about', 'hero', 'afterFirstFrame'] } },
  // The zone loop's roam rows and way-back flag (src/fight/zone-loop.ts validateLoop checks the values); spawns, respawnSeconds and the hero's respawn are the zone row's
  'respawn': { keys: ['about', 'flag', 'postKill', 'spawn', 'world', 'heroDeath', 'openers', 'attackers', 'limits'], maps: { flag: ['query', 'off'], postKill: ['about', 'roam', 'startAfterSeconds', 'walkRadiusMetres', 'cameraMetres'], spawn: ['about', 'minDistance'], world: ['about', 'pitArea', 'centre', 'retargetMargin', 'edgeMetres', 'minSpacing', 'leashMargin', 'pitScale'], heroDeath: ['about', 'fallSeconds'], openers: ['about', 'on', 'delaySeconds', 'count', 'reachMetres', 'spawns', 'query', 'off'], attackers: ['about', 'on', 'query', 'off', 'camera'], limits: ['about', 'delaySeconds', 'count', 'reachMetres', 'fallSeconds', 'startAfterSeconds', 'walkRadiusMetres', 'cameraMetres', 'minDistance', 'retargetMargin', 'edgeMetres', 'centre', 'minSpacing', 'leashMargin', 'pitScale'] } },
  // What scripts/build.mjs never ships (106 only: the 65 bodies, kits and 65-keyed clip JSONs; test/rig-bones.test.mjs)
  'build': { keys: ['about', 'clipDecimals', 'firstVisitBytes', 'notShipped'] },
  // The presence service and its page client (server/presence/, src/presence/): V1's presence rule rows (id, value, unit); src/presence/rows.ts also checks every rule the code reads by name exists
  'presence': { keys: ['about', 'query', 'path', 'host', 'protocol', 'poseGlobal', 'frame', 'spawn', 'spawnAbout', 'rules'], rows: { rules: ['id', 'value', 'unit'] }, maps: { frame: ['centreCm', 'sizeCm'], spawn: ['x', 'z'] }, finite: { frame: ['centreCm', 'sizeCm'], spawn: ['x', 'z'] } },
  'sound': { keys: ['about', 'keep', 'statusMs', 'zone'], maps: { keep: ['about', 'samples', 'rate', 'volume'] } },
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
  // M7 knockback, shove and kick (src/fight/feel-kick.ts), opt-in ?feel=kick; presentation rows (value checks: validateFile 'feel-kick')
  'feel-kick': { keys: ['about', 'on', 'moves', 'massKg', 'massClamp', 'massExp', 'stance', 'track', 'fall', 'getUpS', 'knockdownAt', 'push', 'window', 'cue', 'shove', 'event'],
    maps: { stance: ['about', 'open', 'guarding', 'midSwing', 'recovering'], track: ['about', 'swingS', 'recoverS'], fall: ['about', 'push', 'down'], push: ['refImpulse', 'impulsePerForce', 'impulseClamp', 'lift', 'distanceM', 'pushS', 'part'], window: ['about', 'stagger', 'knockdown'], cue: ['about', 'on', 'text', 'color', 'sizePx', 'pulseS', 'xPct', 'yPct'], shove: ['about', 'moves'], event: ['name', 'log', 'keep'] },
    finite: { 'stance': ['open', 'guarding', 'midSwing', 'recovering'], 'track': ['swingS', 'recoverS'], 'fall': ['push', 'down'], 'push': ['refImpulse', 'impulsePerForce', 'pushS'], 'push.lift': ['stagger', 'knockdown'], 'push.distanceM': ['stagger', 'knockdown'], 'window.stagger': ['startS', 'lengthS'], 'window.knockdown': ['startS', 'lengthS'], 'cue': ['sizePx', 'pulseS', 'xPct', 'yPct'], 'event': ['keep'] } },
  // The SIM knockdown + finish window (src/fight/knock-sim.ts, step in duel.ts), behind ?feel=kick: whole seconds / per-mille rows; checkFeelSim below checks the values
  'feel-sim': { keys: ['about', 'flag', 'tickHz', 'knockdown', 'getUp', 'finishWindow', 'targets', 'knockdownAtPerMille', 'massKg', 'massBands', 'stance', 'moves'],
    maps: { flag: ['query', 'value'], knockdown: ['seconds'], getUp: ['seconds'], finishWindow: ['seconds'], stance: ['open', 'guarding', 'midSwing', 'recovering'] } },
  // The weapon clash on a block or parry (src/fight/feel-clash.ts, ?feel=clash): presentation rows; checkFeelClash below checks the values
  'feel-hitreact': { keys: ['about', 'frontCos', 'knockdownQuietS', 'defaultSide', 'zones'] },
  'feel-clash': { keys: ['about', 'on', 'query', 'value', 'tickHz', 'refKg', 'weaponKg', 'swing', 'impulse', 'kinds', 'parts', 'dipParts', 'timing', 'pushback', 'event', 'hero', 'spark', 'perf'],
    maps: { swing: ['light', 'heavy', 'charged'], impulse: ['base', 'lift', 'min', 'max'], kinds: ['blocked', 'perfect', 'parried', 'broken'], parts: ['attacker', 'defender'], dipParts: ['arm', 'forearm', 'hand', 'spine'], timing: ['easeInS', 'holdS', 'upS', 'lightScale'], pushback: ['metres', 'heavyOnly'], event: ['type', 'log'],
      hero: ['about', 'bones', 'weaponArmRad', 'guardArmRad', 'spineRad', 'maxStrength'], spark: ['on', 'at', 'liftM', 'count', 'countHeavy', 'speedMps', 'lifeS', 'sizePx', 'color', 'handBones', 'max'], perf: ['frameBudgetMs'] } },   // (values: checkFeelClash)
  // Phase 3 design rows (docs/ZONE-SERVER-DESIGN.md, src/server-model/zone-model.ts): nothing in the game reads them yet. The model's own parseRules checks values.
  'zone-server-rules': { keys: ['about', 'writerRoles', 'adminOnlyFunctions', 'ids', 'engage', 'hit', 'progression', 'weapons', 'share', 'caps', 'respawn', 'log', 'refusals', 'payReasons'],
    rows: { weapons: ['id', 'maxDamagePerHit', 'maxHitsPerS'], refusals: ['id', 'status', 'text'], payReasons: ['id', 'text'] },
    maps: { ids: ['instancePattern', 'tokenPattern', 'batchIdPattern', 'weaponPattern', 'note'], engage: ['tokenBytes', 'ttlS', 'maxOpenPerAccount', 'note'], hit: ['maxBatchRows', 'maxHitsPerRow', 'firstHitAllowanceS', 'maxElapsedS', 'dpsSlack', 'retryFailedBatch', 'note'],
      progression: ['maxDamageMult', 'note'], share: ['minSharePct', 'floorEqualShareFraction', 'renormalise', 'hitExpiryS', 'note'], caps: ['killsPerMin', 'killsPerHour', 'cooldownAcrossLayers', 'note'], respawn: ['minS', 'maxS', 'defaultS', 'note'], log: ['keepS', 'note'] } },
  // Phase 3 step 1, the page side of shared boss health (docs/ZONE-CLIENT-CONTRACT.md, src/zone/shared-hp-client.ts): OFF unless ?sharedhp=. The client's own parseClientRows checks the values and the action vocabulary.
  'zone-client': { keys: ['about', 'query', 'path', 'hosts', 'routes', 'timing', 'sim', 'batch', 'backoff', 'kill', 'refusals', 'sqlClasses', 'transportClasses', 'fallback'],
    rows: { refusals: ['id', 'action', 'delayMs'], sqlClasses: ['id', 'match', 'action'], transportClasses: ['id', 'kinds', 'status', 'action'] },
    maps: { routes: ['engage', 'touch', 'hits', 'state', 'kill'], timing: ['tickMs', 'flushMs', 'stateMs', 'touchMs', 'timeoutMs', 'engageRetryMs'], sim: ['hit', 'heroSide', 'foeSide'], batch: ['idPrefix', 'idSep'], backoff: ['baseMs', 'factor', 'maxMs', 'offlineAfter'], kill: ['tries', 'retryMs', 'settled', 'unpaid'], fallback: ['sql', 'transport'] },
    finite: { timing: ['tickMs', 'flushMs', 'stateMs', 'touchMs', 'timeoutMs', 'engageRetryMs'], sim: ['heroSide', 'foeSide'], backoff: ['baseMs', 'factor', 'maxMs', 'offlineAfter'], kill: ['tries', 'retryMs'] } },
};

const BANNED = /^(block|blocks|immune|immunity)$/i;

// data/fight.json camera.pitch (src/fight/camera-pitch.ts): the zone follow camera's pitch presets, in degrees inside the limits; 'default' is a preset name or an off word.
function checkCameraPitch(p) {
  const e = [], at = 'fight.camera.pitch', fin = (v) => typeof v === 'number' && Number.isFinite(v);
  if (!p || typeof p !== 'object' || Array.isArray(p)) return [`${at}: must be an object`];
  for (const k of Object.keys(p)) if (!['about', 'default', 'presets', 'limits', 'heroY', 'minEyeY', 'off', 'query'].includes(k)) e.push(`${at}.${k}: unknown key`);
  const lim = p.limits;
  const limOk = Array.isArray(lim) && lim.length === 2 && lim.every(fin) && lim[0] >= 5 && lim[1] <= 45 && lim[0] < lim[1];
  if (!limOk) e.push(`${at}.limits: must be [min, max] degrees inside 5..45`);
  const off = p.off;
  if (!Array.isArray(off) || off.length === 0 || off.some((o) => typeof o !== 'string' || !/^[a-z0-9]+$/.test(o))) e.push(`${at}.off: must be a non-empty list of lower-case words`);
  const pre = p.presets;
  if (!pre || typeof pre !== 'object' || Array.isArray(pre) || Object.keys(pre).length === 0) e.push(`${at}.presets: must be a non-empty object of name -> degrees`);
  else for (const [n, d] of Object.entries(pre)) {
    if (!/^[a-z][a-z0-9]*$/.test(n)) e.push(`${at}.presets.${n}: name must be a lower-case word`);
    else if (Array.isArray(off) && off.includes(n)) e.push(`${at}.presets.${n}: collides with an off word`);
    if (!fin(d) || (limOk && (d < lim[0] || d > lim[1]))) e.push(`${at}.presets.${n}: must be degrees inside the limits`);
  }
  if (typeof p.default !== 'string' || !((Array.isArray(off) && off.includes(p.default)) || (pre && Object.hasOwn(pre, p.default)))) e.push(`${at}.default: must be an off word or a preset name`);
  if (!fin(p.heroY) || p.heroY < 0 || p.heroY > 2) e.push(`${at}.heroY: must be a number in 0..2`);
  if (!fin(p.minEyeY) || p.minEyeY < 0.5 || p.minEyeY > 5) e.push(`${at}.minEyeY: must be a number in 0.5..5`);
  if (typeof p.query !== 'string' || !/^[a-z]+$/.test(p.query)) e.push(`${at}.query: must be a lower-case word`);
  return e;
}

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
  if (name === 'build' && !(Number.isInteger(json.clipDecimals) && json.clipDecimals >= 3 && json.clipDecimals <= 8)) errors.push('build.clipDecimals: must be an integer 3 to 8 (fewer than 3 decimals would be visible on positions in metres)');
  if (name === 'build' && !(Number.isInteger(json.firstVisitBytes) && json.firstVisitBytes > 0)) errors.push('build.firstVisitBytes: must be a positive integer (bytes on the wire at 375)');
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
  if (name === 'feel-kick') {   // ranges: positive forces and times, ordered clamps, known stances and outcomes, a plain #rrggbb (pasted into CSS), a moves list the sim knows
    const pos = (path, v) => { if (!Number.isFinite(v) || v <= 0) errors.push(`${name}.${path}: must be a finite number > 0`); };
    const pair = (path, v, lo) => { if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isFinite) || v[0] < lo || v[0] > v[1]) errors.push(`${name}.${path}: must be [min, max] with ${lo} <= min <= max`); };
    pair('massClamp', json.massClamp, 0.01); pair('push.impulseClamp', json.push?.impulseClamp, 0);
    for (const [k, v] of Object.entries(json.massKg ?? {})) pos(`massKg.${k}`, v);
    if (!json.massKg || !('default' in json.massKg)) errors.push(`${name}.massKg.default: a default mass is required`);
    for (const k of ['massExp', 'knockdownAt', 'getUpS']) pos(k, json[k]);    for (const k of ['open', 'guarding', 'midSwing', 'recovering']) pos(`stance.${k}`, json.stance?.[k]);
    pos('push.impulsePerForce', json.push?.impulsePerForce); pos('push.pushS', json.push?.pushS);
    for (const o of ['stagger', 'knockdown']) {
      pos(`push.distanceM.${o}`, json.push?.distanceM?.[o]); pos(`window.${o}.lengthS`, json.window?.[o]?.lengthS);
      if (!(json.window?.[o]?.startS >= 0)) errors.push(`${name}.window.${o}.startS: must be a finite number >= 0`);
    }
    for (const k of ['swingS', 'recoverS']) pos(`track.${k}`, json.track?.[k]);
    for (const k of ['push', 'down']) pos(`fall.${k}`, json.fall?.[k]);
    pos('push.refImpulse', json.push?.refImpulse);
    for (const k of ['xPct', 'yPct']) if (!(json.cue?.[k] >= 0 && json.cue[k] <= 100)) errors.push(`${name}.cue.${k}: must be a number in [0, 100]`);
    if (!Array.isArray(json.moves) || !json.moves.length || json.moves.some((m) => typeof m !== 'string')) errors.push(`${name}.moves: must be a non-empty list of move ids`);
    for (const [m, r] of Object.entries(json.shove?.moves ?? {})) {
      pos(`shove.moves.${m}.forceMult`, r.forceMult); if (typeof r.canKnockdown !== 'boolean') errors.push(`${name}.shove.moves.${m}.canKnockdown: must be a boolean`);
      for (const k of Object.keys(r)) if (!['forceMult', 'canKnockdown'].includes(k)) errors.push(`${name}.shove.moves.${m}.${k}: unknown key`);
      if ((json.moves ?? []).includes(m)) errors.push(`${name}.shove.moves.${m}: a move is a kick or a shove, not both`);
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(json.cue?.color ?? '')) errors.push(`${name}.cue.color: must be #rrggbb`);
    if (typeof json.cue?.text !== 'string' || !json.cue.text.trim()) errors.push(`${name}.cue.text: must be a non-empty string`);
    if (!Number.isInteger(json.event?.keep) || json.event.keep < 1) errors.push(`${name}.event.keep: must be an integer >= 1`);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(json.event?.log ?? '')) errors.push(`${name}.event.log: must be an identifier (a globalThis name)`);
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
  if (name === 'sound') errors.push(...checkSoundZone(json.zone));
  if (name === 'feel-sim') errors.push(...checkFeelSim(json));
  if (name === 'feel-clash') errors.push(...checkFeelClash(json));
  if (name === 'feel-hitreact') errors.push(...checkHitreact(json));
  if (name === 'fight' && json.camera) {   // the lens zoom (src/fight/camera-zoom.ts): a finite number in 0.5..2 (1 = the camera as before); an absent one would reach the page as NaN
    const z = json.camera.zoom;
    if (!Number.isFinite(z) || z < 0.5 || z > 2) errors.push(`${name}.camera.zoom: must be a finite number in 0.5..2`);
    errors.push(...checkCameraPitch(json.camera.pitch));
  }
  banned(json, name, errors);
  return errors;
}

// data/sound.json `zone` (src/audio/zone-cues.ts): the gateable cue ids (all required, none unknown), each 'on' | 'off' | 'once', and a toast time in 0.5..30 s.
export const ZONE_CUE_IDS = ['bell', 'draw', 'crowd_cheer', 'crowd_gasp', 'kill', 'death_voice'];
export const ZONE_CUE_MODES = ['on', 'off', 'once'];
export function checkSoundZone(z) {
  const e = [], at = (p, m) => e.push(`sound.zone.${p}: ${m}`);
  if (z === null || typeof z !== 'object' || Array.isArray(z)) return ['sound.zone: must be an object'];
  for (const k of Object.keys(z)) if (!['about', 'cues', 'toastSeconds'].includes(k)) at(k, 'unknown key');
  const cues = z.cues;
  if (cues === null || typeof cues !== 'object' || Array.isArray(cues)) at('cues', 'must be an object of cue id -> on | off | once');
  else {
    for (const k of Object.keys(cues)) if (!ZONE_CUE_IDS.includes(k)) at(`cues.${k}`, `unknown cue id (${ZONE_CUE_IDS.join(', ')})`);
    for (const k of ZONE_CUE_IDS) if (!ZONE_CUE_MODES.includes(cues[k])) at(`cues.${k}`, `must be one of ${ZONE_CUE_MODES.join(', ')}`);
  }
  if (!Number.isFinite(z.toastSeconds) || z.toastSeconds < 0.5 || z.toastSeconds > 30) at('toastSeconds', 'must be a finite number in 0.5..30');
  return e;
}

// data/feel-sim.json values (src/fight/knock-sim.ts): every timer at least one tick, whole per-mille integers, ordered mass bands from 0, the finish window inside the time he is down.
// A bad row would change a fight's outcome, so each is refused here and again when the page parses the rows. Move ids are checked against the sim's own list in test/feel-sim.test.mjs.
function checkFeelSim(j) {
  const e = [], at = (p, m) => e.push(`feel-sim.${p}: ${m}`), obj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const secs = (p, v, hz) => { if (!Number.isFinite(v) || v <= 0 || v > 60 || Math.round(v * hz) < 1) at(p, 'must be a number of seconds in (0, 60], at least one tick'); };
  const pm = (p, v, lo = 1, hi = 5000) => { if (!Number.isInteger(v) || v < lo || v > hi) at(p, `must be a whole per-mille in ${lo}..${hi}`); };
  if (typeof j.flag?.query !== 'string' || !/^[a-z]+$/.test(j.flag.query) || typeof j.flag?.value !== 'string' || !/^[a-z]+$/.test(j.flag.value)) at('flag', 'query and value must be lowercase words');
  if (j.tickHz !== 60) at('tickHz', 'must be 60 (the sim step, src/fight/sim.ts STEP)');
  const hz = Number.isFinite(j.tickHz) && j.tickHz > 0 ? j.tickHz : 60;
  for (const k of ['knockdown', 'getUp', 'finishWindow']) secs(`${k}.seconds`, j[k]?.seconds, hz);
  if (Number.isFinite(j.finishWindow?.seconds) && Number.isFinite(j.knockdown?.seconds) && Math.round(j.finishWindow.seconds * hz) > Math.round(j.knockdown.seconds * hz)) at('finishWindow.seconds', 'must be <= knockdown.seconds (the window closes before he starts to rise)');
  if (!Array.isArray(j.targets) || !j.targets.length || j.targets.some((t) => t !== 'hero' && t !== 'foe') || new Set(j.targets).size !== j.targets.length) at('targets', "must be a non-empty list of 'hero' and / or 'foe'");
  pm('knockdownAtPerMille', j.knockdownAtPerMille);
  if (!obj(j.massKg) || !('default' in j.massKg)) at('massKg.default', 'a default mass is required');
  else for (const [k, v] of Object.entries(j.massKg)) if (!Number.isFinite(v) || v <= 0 || v > 100000) at(`massKg.${k}`, 'must be a finite kg > 0');
  if (!Array.isArray(j.massBands) || !j.massBands.length) at('massBands', 'must be a non-empty list');
  else {
    j.massBands.forEach((b, i) => {
      for (const k of Object.keys(b ?? {})) if (!['minRatioPct', 'perMille'].includes(k)) at(`massBands[${i}].${k}`, 'unknown key');
      if (!Number.isInteger(b?.minRatioPct) || b.minRatioPct < 0 || (i > 0 && !(b.minRatioPct > j.massBands[i - 1].minRatioPct))) at(`massBands[${i}].minRatioPct`, 'must be a whole percent, strictly rising');
      pm(`massBands[${i}].perMille`, b?.perMille);
    });
    if (j.massBands[0]?.minRatioPct !== 0) at('massBands[0].minRatioPct', 'the first band must start at 0');
  }
  for (const k of ['open', 'guarding', 'midSwing', 'recovering']) pm(`stance.${k}`, j.stance?.[k]);
  if (!obj(j.moves) || !Object.keys(j.moves).length) at('moves', 'must be a non-empty object of move id -> { perMille }');
  else for (const [m, r] of Object.entries(j.moves)) {
    for (const k of Object.keys(r ?? {})) if (k !== 'perMille') at(`moves.${m}.${k}`, 'unknown key');
    pm(`moves.${m}.perMille`, r?.perMille);
  }
  return e;
}

// data/feel-clash.json values (src/fight/feel-clash.ts): every number finite and in range, every weight a positive kg, every fraction in [0, 1]. A bad row would reach the page as NaN in a motor or an impulse.
export function checkFeelClash(j) {
  const e = [], at = (p, m) => e.push(`feel-clash.${p}: ${m}`), fin = (v) => Number.isFinite(v);
  const range = (p, v, lo, hi) => { if (!fin(v) || v < lo || v > hi) at(p, `must be a finite number in [${lo}, ${hi}]`); };
  const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (typeof j.on !== 'boolean') at('on', 'must be a boolean');
  for (const k of ['query', 'value']) if (typeof j[k] !== 'string' || !/^[a-z]+$/.test(j[k])) at(k, 'must be a lowercase word');
  range('tickHz', j.tickHz, 1, 240); range('refKg', j.refKg, 0.01, 100);
  if (!obj(j.weaponKg) || !Object.keys(j.weaponKg).length) at('weaponKg', 'must be an object of weapon id -> kg');
  else for (const [id, kg] of Object.entries(j.weaponKg)) range(`weaponKg.${id}`, kg, 0.01, 100);
  range('swing.light', j.swing?.light, 0.1, 10); range('swing.heavy', j.swing?.heavy, 0.1, 10); range('swing.charged', j.swing?.charged, 0.1, 10);
  range('impulse.base', j.impulse?.base, 0, 1000); range('impulse.lift', j.impulse?.lift, -50, 50); range('impulse.min', j.impulse?.min, 0, 1000); range('impulse.max', j.impulse?.max, 0, 1000);
  if (fin(j.impulse?.min) && fin(j.impulse?.max) && j.impulse.min > j.impulse.max) at('impulse.min', 'must be <= max');
  for (const kind of ['blocked', 'perfect', 'parried', 'broken']) {
    const k = j.kinds?.[kind];
    if (!obj(k)) { at(`kinds.${kind}`, 'missing'); continue; }
    for (const key of Object.keys(k)) if (!['recoil', 'absorbed', 'dip', 'stagger'].includes(key)) at(`kinds.${kind}.${key}`, 'unknown key');
    range(`kinds.${kind}.recoil`, k.recoil, 0, 10); range(`kinds.${kind}.absorbed`, k.absorbed, 0, 1); range(`kinds.${kind}.dip`, k.dip, 0.01, 1);
    if (typeof k.stagger !== 'boolean') at(`kinds.${kind}.stagger`, 'must be a boolean');
    range(`pushback.metres.${kind}`, j.pushback?.metres?.[kind], 0, 5);
  }
  for (const side of [['attacker', ['weapon', 'spine']], ['defender', ['guard', 'spine']]]) for (const g of side[1]) {
    const list = j.parts?.[side[0]]?.[g];
    if (!Array.isArray(list) || !list.length || list.some((p) => typeof p !== 'string' || !p)) at(`parts.${side[0]}.${g}`, 'must be a non-empty list of part ids');
  }
  for (const k of ['arm', 'forearm', 'hand', 'spine']) range(`dipParts.${k}`, j.dipParts?.[k], 0, 1);
  range('timing.easeInS', j.timing?.easeInS, 0, 5); range('timing.holdS', j.timing?.holdS, 0, 5); range('timing.upS', j.timing?.upS, 0.001, 5); range('timing.lightScale', j.timing?.lightScale, 0.1, 1);
  if (typeof j.pushback?.heavyOnly !== 'boolean') at('pushback.heavyOnly', 'must be a boolean');
  if (typeof j.event?.type !== 'string' || !j.event.type || typeof j.event?.log !== 'string' || !j.event.log) at('event', 'type and log must be non-empty strings');
  for (const k of ['weaponArmRad', 'guardArmRad', 'spineRad']) if (!Array.isArray(j.hero?.[k]) || j.hero[k].length !== 3 || j.hero[k].some((v) => !fin(v) || Math.abs(v) > 1.5)) at(`hero.${k}`, 'must be [x, y, z] radians, each within +-1.5');
  range('hero.maxStrength', j.hero?.maxStrength, 1, 10);
  for (const k of ['weaponArm', 'guardArm', 'spine']) if (typeof j.hero?.bones?.[k] !== 'string' || !j.hero.bones[k]) at(`hero.bones.${k}`, 'must be a bone name');
  const s = j.spark ?? {};
  if (typeof s.on !== 'boolean') at('spark.on', 'must be a boolean');
  range('spark.at', s.at, 0, 1); range('spark.liftM', s.liftM, -2, 2); range('spark.count', s.count, 0, 200); range('spark.countHeavy', s.countHeavy, 0, 200); range('spark.max', s.max, 1, 500);
  range('spark.speedMps', s.speedMps, 0, 50); range('spark.lifeS', s.lifeS, 0.01, 5); range('spark.sizePx', s.sizePx, 1, 64);
  if (!/^#[0-9a-fA-F]{6}$/.test(s.color ?? '')) at('spark.color', 'must be #rrggbb');
  if (typeof s.handBones?.hero !== 'string' || typeof s.handBones?.foe !== 'string') at('spark.handBones', 'hero and foe bone names are required');
  range('perf.frameBudgetMs', j.perf?.frameBudgetMs, 0, 100);
  return e;
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
  spawn: ['id', 'kind', 'position', 'respawnSeconds', 'roster', 'behaviour', 'body'],   // body: optional (per-spawn body, docs/BOSS-BODIES.md): a data/rig.json files stem drawn for this spawn instead of its kind's profile body
  behaviour: ['aggro', 'leash', 'roam', 'campSize'],
  index: ['about', 'default', 'zones'],
};

/** One zone row: a list of error strings (empty = valid). `kinds`: when given, every spawn `kind` must be one of them (the opponent profile ids). */
export function validateZone(row, kinds, rig) {   // rig (data/rig.json, optional): when given, a spawn's optional `body` must pass bodyProblem
  const e = [];
  const at = (path, msg) => e.push(`zone.${path}: ${msg}`);
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const num = (path, v, [lo, hi]) => { if (!Number.isFinite(v) || v < lo || v > hi) at(path, `must be a number in [${lo}, ${hi}]`); };
  const str = (path, v) => { if (typeof v !== 'string' || !v.trim()) at(path, 'must be a non-empty string'); };
  const keys = (path, obj, allowed) => { for (const k of Object.keys(obj)) if (!allowed.includes(k)) at(`${path}.${k}`, 'unknown key'); for (const k of allowed) if (k !== 'about' && k !== 'body' && !(k in obj)) at(`${path}.${k}`, 'missing'); };
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
    if ('body' in s) { if (rig) { const why = bodyProblem(s.body, rig); if (why) at(`${p}.body`, why); } else str(`${p}.body`, s.body); }
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

// Value ranges of a difficulty row (the V1 AiProfile knobs: reaction / discipline are whole numbers, the rest 0..1, the scales 0.1..1) and the direction each knob moves as the number rises
const KNOB_RANGE = { reaction: [1, 120, -1], accuracy: [0, 1, 1], parry: [0, 1, 1], dodge: [0, 1, 1], aggression: [0, 1, 1], pressure: [0, 1, 1], discipline: [0, 100, -1], lapse: [0, 1, -1], read: [0, 1, 1], foeHealthScale: [0.1, 1, 1], foeDamageScale: [0.1, 1, 1] };

// data/difficulty.json + data/profiles.json: every row has every knob in range, the ladder runs 1..N with each knob moving one way (never back), the default and `profile` ids resolve, a profile's brain is a brains.json row
export function checkDifficulty(difficulty, profiles, brains, fight) {
  const errors = [];
  const rows = difficulty.rows ?? [];
  const check = (row, where) => {
    for (const [k, [lo, hi]] of Object.entries(KNOB_RANGE)) {
      const v = row[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) errors.push(`${where}.${k}: ${String(v)} is not a number from ${lo} to ${hi}`);
      else if ((k === 'reaction' || k === 'discipline') && !Number.isInteger(v)) errors.push(`${where}.${k}: ${v} is a whole number of ticks / percent`);
    }
  };
  rows.forEach((r, i) => { if (r.id !== i + 1) errors.push(`difficulty.rows[${i}]: id ${String(r.id)}, the ladder runs 1..${rows.length} in order`); check(r, `difficulty.rows[${r.id}]`); });
  (difficulty.named ?? []).forEach((r) => { if (typeof r.id !== 'string' || rows.some((x) => x.id === r.id)) errors.push(`difficulty.named[${String(r.id)}]: a named row has a string id of its own`); check(r, `difficulty.named[${r.id}]`); });
  for (const [k, [, , dir]] of Object.entries(KNOB_RANGE)) for (let i = 1; i < rows.length; i++) if ((rows[i][k] - rows[i - 1][k]) * dir < 0) errors.push(`difficulty.rows[${rows[i].id}].${k}: ${rows[i][k]} moves the wrong way from row ${rows[i - 1].id}'s ${rows[i - 1][k]} (the ladder is monotonic)`);
  if (!rows.some((r) => r.id === difficulty.default)) errors.push(`difficulty.default: ${String(difficulty.default)} is not a ladder row`);
  for (const p of profiles.profiles ?? []) {
    if (p.brain !== null && !(brains.brains ?? []).some((b) => b.id === p.brain)) errors.push(`profiles.${p.id}.brain: '${p.brain}' is not a brains.json row`);
    for (const k of ['foeHealthScale', 'foeDamageScale']) if (!(p[k] >= 0.1 && p[k] <= 10)) errors.push(`profiles.${p.id}.${k}: ${String(p[k])} is not a number from 0.1 to 10`);
  }
  if (!(profiles.profiles ?? []).some((p) => p.id === profiles.default)) errors.push(`profiles.default: '${profiles.default}' is not a profile row`);
  if (fight && !(profiles.profiles ?? []).some((p) => p.id === fight.profile)) errors.push(`fight.profile: '${fight.profile}' is not a profiles.json row`);
  return errors;
}

// Why a body stem (a data/rig.json `files` key, a 65 body stem) cannot be a boss's body, or null: it must be a rig.json `files` row, and its 106 file must have a
// clips106 folder (the specials and finishers play the body's own retargeted clips; without it a special plays the plain swing). Dom 2026-10-27: a boss is a data row.
export function bodyProblem(body, rig, heroBody) {
  if (heroBody !== undefined && body === heroBody) return `'${body}' is the hero's body: the page would share one rig between hero and boss, and a shared rig carries one weapon`;
  if (typeof body !== 'string' || !Object.hasOwn(rig.files ?? {}, body)) return `'${String(body)}' is not a data/rig.json files row (${Object.keys(rig.files ?? {}).join(', ')})`;
  if (!Object.hasOwn(rig.clips106?.dir ?? {}, rig.files[body])) return `'${body}' (${rig.files[body]}) has no data/rig.json clips106.dir folder, so its specials and finishers would not play`;
  return null;
}
// data/profiles.json bodies against data/rig.json: the default and every row's body is a usable body, and one opponent id is drawn in one body (foe-body.ts keys by it).
// `heroBody` (a stem, optional): the hero's body; a boss cannot be drawn in it, because the page shares one loaded rig between two actors of one file and a shared rig carries one weapon (characters.ts buildWarriors).
export function checkBodies(profiles, rig, heroBody) {
  const errors = [], seen = new Map();
  const bad = (where, body) => { const why = bodyProblem(body, rig, heroBody); if (why) errors.push(`${where}: ${why}`); };
  bad('profiles.defaultBody', profiles.defaultBody);
  if (typeof profiles.bodyQuery !== 'string' || !/^[a-z]+$/.test(profiles.bodyQuery)) errors.push(`profiles.bodyQuery: '${String(profiles.bodyQuery)}' is not a lower-case query key`);
  for (const p of profiles.profiles ?? []) {
    const body = p.body ?? profiles.defaultBody;
    if (p.body !== undefined) bad(`profiles.${p.id}.body`, p.body);
    if (seen.has(p.opponent) && seen.get(p.opponent) !== body) errors.push(`profiles.${p.id}.body: '${body}' but another profile draws opponent '${p.opponent}' in '${seen.get(p.opponent)}' (one body per opponent id)`);
    seen.set(p.opponent, body);
  }
  return errors;
}

// data/feel-hitreact.json (src/fight/feel-hitreact.ts): closed keys per zone row, parts the package knows, and every number finite and in range (a bad one would reach the page as NaN).
const HIT_ZONES = ['head', 'torso', 'arms', 'legs'], HIT_SECTORS = ['front', 'back', 'left', 'right'];
const HIT_BASES = ['spine', 'spine1', 'spine2', 'neck', 'head', 'arm', 'forearm', 'hand', 'thigh', 'shin', 'foot', 'toe'], HIT_SIDED = ['arm', 'forearm', 'hand', 'thigh', 'shin', 'foot', 'toe'];
export function checkHitreact(json) {
  const e = [], at = (p, m) => e.push(`feel-hitreact.${p}: ${m}`), num = (p, v, ok, want) => { if (!Number.isFinite(v) || !ok(v)) at(p, `must be ${want}`); };
  const keys = (p, obj, allowed) => { if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { at(p, 'must be an object'); return false; } for (const k of Object.keys(obj)) if (!allowed.includes(k)) at(`${p}.${k}`, 'unknown key'); for (const k of allowed) if (!(k in obj)) at(`${p}.${k}`, 'missing'); return true; };
  num('frontCos', json.frontCos, (v) => v > 0 && v < 1, 'a finite number in (0, 1)');
  num('knockdownQuietS', json.knockdownQuietS, (v) => v >= 0 && v <= 5, 'a finite number in [0, 5]');
  if (!['Left', 'Right'].includes(json.defaultSide)) at('defaultSide', "must be 'Left' or 'Right'");
  if (!json.zones || typeof json.zones !== 'object') return [...e, 'feel-hitreact.zones: must be an object'];
  for (const z of Object.keys(json.zones)) if (!HIT_ZONES.includes(z)) at(`zones.${z}`, 'unknown zone (head, torso, arms, legs)');
  for (const z of HIT_ZONES) {
    const row = json.zones[z], p = `zones.${z}`;
    if (!row) { at(p, 'missing'); continue; }
    if (!keys(p, row, ['dips', 'timing', 'blend', 'impulse', 'lift', 'split', 'twist', 'dirs'])) continue;
    const part = (path, k) => { const base = k.replace('$near', ''); if (!HIT_BASES.includes(base)) at(`${path}.${k}`, 'unknown part'); else if (k.endsWith('$near') && !HIT_SIDED.includes(base)) at(`${path}.${k}`, '$near only on a limb part'); else if (!k.endsWith('$near') && HIT_SIDED.includes(base)) at(`${path}.${k}`, 'a limb part needs $near (the side the blow came from)'); };
    for (const [k, v] of Object.entries(row.dips ?? {})) { part(`${p}.dips`, k); num(`${p}.dips.${k}`, v, (x) => x >= 0 && x <= 1, 'a finite number in [0, 1]'); }
    for (const [k, v] of Object.entries(row.blend ?? {})) { part(`${p}.blend`, k); num(`${p}.blend.${k}`, v, (x) => x >= 0 && x <= 1, 'a finite number in [0, 1]'); }
    for (const [k, v] of Object.entries(row.split ?? {})) { part(`${p}.split`, k); num(`${p}.split.${k}`, v, (x) => x >= -2 && x <= 2, 'a finite number in [-2, 2]'); }
    if (!Object.keys(row.dips ?? {}).length) at(`${p}.dips`, 'needs at least one part');
    if (!Object.keys(row.split ?? {}).length) at(`${p}.split`, 'needs at least one part');
    if (keys(`${p}.timing`, row.timing, ['easeInS', 'holdS', 'backS'])) {
      num(`${p}.timing.easeInS`, row.timing.easeInS, (x) => x > 0 && x <= 1, 'a finite number in (0, 1]');
      num(`${p}.timing.holdS`, row.timing.holdS, (x) => x >= 0 && x <= 3, 'a finite number in [0, 3]');
      num(`${p}.timing.backS`, row.timing.backS, (x) => x > 0 && x <= 3, 'a finite number in (0, 3]');
    }
    num(`${p}.impulse`, row.impulse, (x) => x >= 0 && x <= 150, 'a finite number in [0, 150]');
    num(`${p}.lift`, row.lift, (x) => x >= 0 && x <= 50, 'a finite number in [0, 50]');
    num(`${p}.twist`, row.twist, (x) => x >= 0 && x <= 50, 'a finite number in [0, 50]');
    if (keys(`${p}.dirs`, row.dirs, HIT_SECTORS)) for (const s of HIT_SECTORS) if (keys(`${p}.dirs.${s}`, row.dirs[s], ['impulse', 'dip', 'twist'])) for (const k of ['impulse', 'dip', 'twist']) num(`${p}.dirs.${s}.${k}`, row.dirs[s][k], (x) => x >= 0 && x <= 3, 'a finite number in [0, 3]');
  }
  return e;
}

// all files together
export function validateAll(files) {
  const errors = Object.entries(files).flatMap(([name, json]) => validateFile(name, json));
  if (files.profiles && files.rig) errors.push(...checkBodies(files.profiles, files.rig));
  if (files.difficulty && files.profiles) errors.push(...checkDifficulty(files.difficulty, files.profiles, files.brains ?? {}, files.fight));
  return errors;
}
