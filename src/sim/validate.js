// Data validator (V2 src/sim/validate.js, kept for the shell's own rows). Every data file has a closed key set, and
// so do its rows. An unknown key is an error, not a silent no-op. Armour is a threshold multiplier only, so no row
// anywhere may carry a block or immune field (Dom's ruling).
// Pure: callers pass parsed JSON, so it runs in Node tests and in the browser alike.
// V1's fight rows (src/fight/*-defs.json) keep V1's own loader checks (src/core/registry.ts); a schema here is
// added per file as V2's rows come back on top (PLAN.md section 5, step 5).

// file -> { keys: top-level keys, rows: { arrayKey: row keys }, maps: { objectKey: its keys } }
export const SCHEMA = {
  'stage': { keys: ['source', 'sky', 'fog', 'ground', 'grid', 'skyline', 'ruler', 'light', 'duel'], maps: { duel: ['about', 'id', 'fogDensity', 'sunPosition', 'floor'] } },
  'fight': { keys: ['about', 'opponent', 'profile', 'level', 'seed', 'weapon', 'skill', 'skill2', 'stance', 'specials', 'tempoHz', 'frameDtMaxS', 'gfx', 'camera', 'ai', 'guardWalk', 'specialPace', 'start', 'trail', 'specialTerms', 'readyRing', 'foeWeapon', 'foeName', 'opponentV1', 'blendMs', 'settleMs', 'bladeTables', 'foeReach', 'specialSink', 'foeSpecialReach', 'specialFx'], maps: { specialSink: ['about', 'sink'], opponentV1: ['about', 'opponent'], bladeTables: ['about', 'hero'], foeReach: ['about', 'opponent', 'body', 'rig', 'weapon', 'query', 'v1'], blendMs: ['about', 'locomotion', 'attackIn', 'attackOut', 'specialIn', 'specialOut', 'hurtIn', 'hurtOut', 'rollIn', 'rollOut'], settleMs: ['about', 'roll'], camera: ['about', 'lift', 'side', 'zoom', 'pitch', 'wide'], guardWalk: ['about', 'lowerBones'], specialPace: ['about', 'skill', 'scale'], start: ['about', 'auto'], trail: ['about', 'light', 'return', 'heavy', 'riposte', 'slashRiposte', 'thrust', 'pommel'], specialTerms: ['about', 'cooldown', 'stamina'], readyRing: ['about', 'colour', 'width', 'glow', 'gap', 'track', 'staminaTrack', 'pulseMs'], foeWeapon: ['about', 'opponent', 'weapon', 'drawn'], foeName: ['about', 'opponent', 'name'], foeSpecialReach: ['about', 'on', 'start', 'release'], specialFx: ['about', 'skills', 'cameraKick', 'flash', 'sparks', 'trailSkill', 'trailReaping', 'soundGain', 'soundRows'] } },
  // V3's opponent brains (src/brain.ts): a row names only V1 AiProfile knobs (src/fight/moves.ts)
  'brains': { keys: ['about', 'brains'], rows: { brains: ['id', 'reaction', 'accuracy', 'parry', 'dodge', 'aggression', 'pressure', 'discipline', 'lapse', 'read'] } },
  // The difficulty ladder over an opponent profile row (src/difficulty.ts): a row names only the brain knobs and the two scales; checked by checkDifficulty below
  'difficulty': { keys: ['about', 'default', 'rows', 'named'], rows: { rows: ['id', 'reaction', 'accuracy', 'parry', 'dodge', 'aggression', 'pressure', 'discipline', 'lapse', 'read', 'foeHealthScale', 'foeDamageScale', 'about'], named: ['id', 'reaction', 'accuracy', 'parry', 'dodge', 'aggression', 'pressure', 'discipline', 'lapse', 'read', 'foeHealthScale', 'foeDamageScale', 'about'] } },
  'profiles': { keys: ['about', 'default', 'defaultBody', 'bodyQuery', 'profiles'], rows: { profiles: ['id', 'about', 'opponent', 'body', 'brain', 'foeHealthScale', 'foeDamageScale', 'knobs'] } },   // knobs: optional, this kind's own brain knobs over the difficulty row's (checkKinds)
  // Dom's picked hero strike and guard clips (src/hero-clips.ts, scripts/hero-clips/; `hold`: the guard's, src/fight/guard-hold.ts)
  'hero-clips': { keys: ['about', 'sweeps', 'rig', 'weapon', 'blade', 'clips'], rows: { clips: ['role', 'clip', 'mixamo', 'name', 'mirror', 'from', 'to', 'contact', 'pullback', 'aim', 'aimFrom', 'paths', 'hold', 'about'] }, maps: { blade: ['about', 'node', 'contact'], sweeps: ['about', 'default', 'query'] } },
  // The 65 -> 106 rig swap (src/fight/rig-bones.ts): which rig each side draws, the bone map, the weapon nodes and sockets, the 106 files.
  // `bones`, `files`, `weapons` and `gapFill` are keyed by names (bones, body stems, nodes, roles), so only their owners' keys are closed here.
  'rig': { keys: ['about', 'default', 'held', 'files', 'detect', 'bones', 'weapons', 'hide', 'gapFill', 'grip65', 'clips106', 'clipLoad'], maps: { default: ['hero', 'foe'], held: ['weapon', 'sword', 'sheath'], detect: ['65', '106'], grip65: ['hand', 'translation', 'rotation'], clips106: ['about', 'dir', 'files'], clipLoad: ['about', 'hero', 'afterFirstFrame'] } },
  // The zone loop's roam rows and way-back flag (src/fight/zone-loop.ts validateLoop checks the values); spawns, respawnSeconds and the hero's respawn are the zone row's
  'respawn': { keys: ['about', 'flag', 'postKill', 'freeCamera', 'look', 'spawn', 'world', 'heroDeath', 'openers', 'attackers', 'walkBack', 'input', 'limits'], maps: { flag: ['query', 'off'], postKill: ['about', 'roam', 'startAfterSeconds', 'walkRadiusMetres', 'cameraMetres'], freeCamera: ['about', 'on', 'query', 'off', 'gapMetres', 'handOverSeconds', 'swingTailSeconds', 'swingRate', 'stickEndsCeremony', 'fight'], look: ['about', 'on', 'query', 'off', 'sensitivityDegPerPx', 'deadzonePx', 'minXShare', 'inertiaSeconds', 'flingWindowMs', 'flingSmoothing'], spawn: ['about', 'minDistance'], world: ['about', 'pitArea', 'centre', 'retargetMargin', 'edgeMetres', 'minSpacing', 'startClearance', 'leashMargin', 'pitScale', 'spreadRadiusMetres'], heroDeath: ['about', 'fallSeconds'], openers: ['about', 'on', 'delaySeconds', 'count', 'reachMetres', 'withinMetres', 'spawns', 'query', 'off'], attackers: ['about', 'on', 'query', 'off', 'camera'], walkBack: ['about', 'on', 'query', 'off', 'speedMetresPerSecond', 'regenPerSecond', 'arriveMetres'], input: ['about', 'keepOnHandOver', 'query', 'off'], limits: ['about', 'walkSpeedMetresPerSecond', 'walkRegenPerSecond', 'walkArriveMetres','delaySeconds', 'count', 'reachMetres', 'withinMetres','fallSeconds', 'startAfterSeconds', 'walkRadiusMetres', 'cameraMetres', 'freeCamGapMetres', 'handOverSeconds', 'swingTailSeconds', 'swingRate', 'lookSensitivityDegPerPx', 'lookDeadzonePx', 'lookMinXShare', 'lookInertiaSeconds', 'lookFlingWindowMs', 'lookFlingSmoothing', 'minDistance', 'retargetMargin', 'edgeMetres', 'centre', 'minSpacing', 'startClearance', 'leashMargin', 'pitScale', 'spreadRadiusMetres'] } },
  // The zone's endless open ground (src/zone/ground.ts checkGround checks the values against the fog)
  'zone-ground': { keys: ['about', 'flag', 'groundRadiusMetres', 'gridRadiusMetres', 'edgeVisibility', 'cameraFarMetres', 'cameraOffsetMetres', 'groundFollow', 'floorDepthPush', 'limits'], maps: { flag: ['query', 'off'], groundFollow: ['on', 'snapMetres'], floorDepthPush: ['about', 'flag', 'factor', 'units'], limits: ['about', 'groundRadiusMetres', 'gridRadiusMetres', 'edgeVisibility', 'cameraFarMetres', 'cameraOffsetMetres', 'snapMetres', 'depthFactor', 'depthUnits'] } },
  // What scripts/build.mjs never ships (106 only: the 65 bodies, kits and 65-keyed clip JSONs; test/rig-bones.test.mjs)
  'build': { keys: ['about', 'clipDecimals', 'firstVisitBytes', 'notShipped'] },
  // The presence service and its page client (server/presence/, src/presence/): V1's presence rule rows (id, value, unit); src/presence/rows.ts also checks every rule the code reads by name exists
  'presence': { keys: ['about', 'query', 'path', 'host', 'protocol', 'poseGlobal', 'frame', 'spawn', 'spawnAbout', 'rules'], rows: { rules: ['id', 'value', 'unit'] }, maps: { frame: ['centreCm', 'sizeCm'], spawn: ['x', 'z'] }, finite: { frame: ['centreCm', 'sizeCm'], spawn: ['x', 'z'] } },
  'sound': { keys: ['about', 'keep', 'statusMs', 'zone'], maps: { keep: ['about', 'samples', 'rate', 'volume'] } },
  // The opponent's presentation ragdoll (src/fight/ragdoll.ts, @frankendom/physics); `rigs` rows map the package's 20 part ids to bone names
  'physics': { keys: ['about', 'on', 'query', 'v1', 'seed', 'tickHz', 'maxTicksPerFrame', 'loadAfterFirstFrameMs', 'opponents', 'hero', 'bones', 'motorTuning', 'solveHinges', 'states', 'hit', 'kill', 'cut', 'corpse', 'finisher', 'finisherCuts'], rows: { opponents: ['id', 'body', 'measure', 'helmet', 'gear'] },
    maps: { bones: ['hips', 'spine', 'spine1', 'spine2', 'neck', 'head', 'armLeft', 'forearmLeft', 'handLeft', 'armRight', 'forearmRight', 'handRight', 'thighLeft', 'shinLeft', 'footLeft', 'toeLeft', 'thighRight', 'shinRight', 'footRight', 'toeRight'],
      states: ['stagger', 'death'], hit: ['parts', 'impulse', 'lift', 'blend'], kill: ['parts', 'impulse', 'lift', 'blendInS'], cut: ['about', 'on', 'log', 'onKill', 'sever', 'kill', 'tap', 'cue', 'seam', 'cap', 'helmet'], corpse: ['about', 'keepSeconds', 'pieceSeconds', 'max', 'cuttable', 'slotSpacingM', 'event'], finisher: ['default', 'query', 'values'], finisherCuts: ['about', 'rows', 'halves'] },
    // an object of rows keyed by id: path -> the keys each row may carry
    rowMaps: { 'finisherCuts.rows': ['unit', 'also', 'fallback', 'atS', 'push', 'kill', 'plane'] },
    finite: { 'corpse': ['keepSeconds', 'pieceSeconds', 'max', 'slotSpacingM'], 'cut.cue': ['sizePx', 'pulseS', 'delayS'], 'cut.tap': ['maxMovePx', 'maxMs', 'impulse', 'lift', 'awayMult', 'sideMult'], 'finisherCuts.halves': ['apartM', 'overS'] } },
  // The package's M4 hit/cut rules evaluator driving that ragdoll (src/fight/rules-eval.ts), played by ?rules=m4 (and by a bare link when `default` is m4; it is v1 for now); `armour` and `weapons` are keyed by opponent / weapon ids
  'rules': { keys: ['about', 'on', 'default', 'query', 'v1', 'm4', 'variants', 'tickHz', 'handSpeedRef', 'handBone', 'handFrom', 'speedSpanS', 'speedWindow', 'speedScale', 'heavyDivisor', 'snapOver', 'speedMin', 'speedMaxRef', 'budgets', 'swordSide', 'legHp', 'legSide', 'heavyMoves', 'killAs', 'killAsSwings', 'knockdownSwing', 'renewOnKill', 'cut', 'impulseAt', 'impulseClamp', 'getUpS', 'log', 'armour', 'weapons'],
    maps: { budgets: ['head', 'torso', 'arm_sword', 'arm_off'], cut: ['about', 'precedence'] } },
  // M7 knockback, shove and kick (src/fight/feel-kick.ts), opt-in ?feel=kick; presentation rows (value checks: validateFile 'feel-kick')
  'feel-kick': { keys: ['about', 'on', 'moves', 'massKg', 'massClamp', 'massExp', 'stance', 'track', 'fall', 'getUpS', 'knockdownAt', 'push', 'window', 'cue', 'shove', 'event'],
    maps: { stance: ['about', 'open', 'guarding', 'midSwing', 'recovering'], track: ['about', 'swingS', 'recoverS'], fall: ['about', 'push', 'down'], push: ['refImpulse', 'impulsePerForce', 'impulseClamp', 'lift', 'distanceM', 'pushS', 'part'], window: ['about', 'stagger', 'knockdown'], cue: ['about', 'on', 'text', 'color', 'sizePx', 'pulseS', 'xPct', 'yPct'], shove: ['about', 'moves'], event: ['name', 'log', 'keep'] },
    finite: { 'stance': ['open', 'guarding', 'midSwing', 'recovering'], 'track': ['swingS', 'recoverS'], 'fall': ['push', 'down'], 'push': ['refImpulse', 'impulsePerForce', 'pushS'], 'push.lift': ['stagger', 'knockdown'], 'push.distanceM': ['stagger', 'knockdown'], 'window.stagger': ['startS', 'lengthS'], 'window.knockdown': ['startS', 'lengthS'], 'cue': ['sizePx', 'pulseS', 'xPct', 'yPct'], 'event': ['keep'] } },
  // The open-world performance budget (data/perf.json, docs/proposals/perf-open-world-2026-10-27.md): per tier a frame ceiling and the caps of the levers
  'perf': { keys: ['about', 'tiers', 'ladder', 'windowFrames', 'overWindows'], maps: { tiers: ['phone', 'full'] } },
  // The M7 feel modules that are on without a query (src/fight/feel-defaults.ts), each with its own ?x=v1 revert; test/feel-defaults.test.mjs pins the names against the registry
  'feel-defaults': { keys: ['about', 'query', 'off', 'modules', 'revert'] },
  // The SIM knockdown + finish window (src/fight/knock-sim.ts, step in duel.ts), on with the kick module (data/feel-defaults.json): whole seconds / per-mille rows; checkFeelSim below checks the values
  'feel-sim': { keys: ['about', 'flag', 'tickHz', 'knockdown', 'kick', 'kickOnInjuredLeg', 'getUp', 'finishWindow', 'targets', 'knockdownAtPerMille', 'massKg', 'massBands', 'stance', 'moves'],
    maps: { flag: ['query', 'value'], knockdown: ['seconds', 'minSecondsBetween'], kick: ['interruptSeconds', 'flinchSeconds', 'interruptThroughPoise', 'resistanceSeconds', 'cooldownSeconds'], kickOnInjuredLeg: ['hits', 'windowS'], getUp: ['seconds'], finishWindow: ['seconds'], stance: ['open', 'guarding', 'midSwing', 'recovering'] } },
  // The weapon clash on a block or parry (src/fight/feel-clash.ts, ?feel=clash): presentation rows; checkFeelClash below checks the values
  'feel-hitreact': { keys: ['about', 'frontCos', 'knockdownQuietS', 'defaultSide', 'zones'] },
  'feel-clash': { keys: ['about', 'on', 'query', 'value', 'tickHz', 'refKg', 'weaponKg', 'swing', 'impulse', 'kinds', 'parts', 'dipParts', 'timing', 'pushback', 'event', 'hero', 'spark', 'perf'],
    maps: { swing: ['light', 'heavy', 'charged'], impulse: ['base', 'lift', 'min', 'max'], kinds: ['blocked', 'perfect', 'parried', 'broken'], parts: ['attacker', 'defender'], dipParts: ['arm', 'forearm', 'hand', 'spine'], timing: ['easeInS', 'holdS', 'upS', 'lightScale'], pushback: ['metres', 'heavyOnly'], event: ['type', 'log'],
      hero: ['about', 'bones', 'weaponArmRad', 'guardArmRad', 'spineRad', 'maxStrength'], spark: ['on', 'at', 'liftM', 'count', 'countHeavy', 'speedMps', 'lifeS', 'sizePx', 'color', 'handBones', 'max'], perf: ['frameBudgetMs'] } },   // (values: checkFeelClash)
  // M7 limb damage that changes the fight (src/fight/feel-limbs.ts), opt-in ?feel=limbs (needs ?rules=m4); one row per part (leg, arm_sword, arm_off, torso, head). checked by the 'feel-limbs' block below
  'feel-limbs': { keys: ['about', 'on', 'query', 'value', 'needs', 'events', 'levelStep', 'limbs'], maps: { needs: ['query', 'value'], events: ['limp', 'guardDrop', 'weaponDrop'], limbs: ['parts'] },
    rowMaps: { 'limbs.parts': ['startFrac', 'sided', 'motor', 'blend', 'gait', 'stumble', 'drop', 'sim'] } },
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
  for (const k of Object.keys(p)) if (!['about', 'default', 'presets', 'limits', 'heroY', 'minEyeY', 'off', 'query', 'portrait'].includes(k)) e.push(`${at}.${k}: unknown key`);
  if (p.portrait !== undefined) {   // the pitch a portrait screen (aspect under belowAspect) gets when the link does not ask: a preset name, so the degrees stay in the presets row
    const q = p.portrait;
    if (!q || typeof q !== 'object' || Array.isArray(q)) e.push(`${at}.portrait: must be an object {preset, belowAspect}`);
    else {
      for (const k of Object.keys(q)) if (!['preset', 'belowAspect'].includes(k)) e.push(`${at}.portrait.${k}: unknown key`);
      if (typeof q.preset !== 'string' || !(p.presets && typeof p.presets === 'object' && Object.hasOwn(p.presets, q.preset))) e.push(`${at}.portrait.preset: must be a preset name`);
      if (!fin(q.belowAspect) || q.belowAspect < 0.3 || q.belowAspect > 1) e.push(`${at}.portrait.belowAspect: must be a number in 0.3..1 (landscape is never lifted)`);
    }
  }
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

// data/feel-limbs.json (src/fight/feel-limbs.ts): every number the module reads is finite and in range, every part has its rows, the roles are the package's, and the event names are strings.
// Absent or non-finite would reach the page as NaN (a motor strength NaN would freeze a joint), so this is the only guard.
export const FEEL_PARTS = ['leg', 'arm_sword', 'arm_off', 'torso', 'head'];
const FEEL_ROLES = ['arm', 'forearm', 'hand', 'thigh', 'shin', 'foot', 'toe', 'spine', 'spine1', 'spine2', 'neck', 'head'];
function checkFeelLimbs(json, errors) {
  const n = 'feel-limbs', fin = (v) => Number.isFinite(v);
  const num = (path, v, lo, hi) => { if (!fin(v) || v < lo || v > hi) errors.push(`${n}.${path}: must be a finite number in [${lo}, ${hi}]`); };
  for (const k of ['query', 'value']) if (typeof json[k] !== 'string' || !json[k]) errors.push(`${n}.${k}: must be a non-empty string`);
  if (typeof json.on !== 'boolean') errors.push(`${n}.on: must be a boolean`);
  for (const k of ['query', 'value']) if (typeof json.needs?.[k] !== 'string' || !json.needs[k]) errors.push(`${n}.needs.${k}: must be a non-empty string`);
  for (const k of ['limp', 'guardDrop', 'weaponDrop']) if (typeof json.events?.[k] !== 'string' || !json.events[k]) errors.push(`${n}.events.${k}: must be a non-empty string`);
  num('levelStep', json.levelStep, 0.01, 1);
  const parts = json.limbs?.parts ?? {};
  for (const id of FEEL_PARTS) if (!parts[id]) errors.push(`${n}.limbs.parts.${id}: missing`);
  for (const id of Object.keys(parts)) if (!FEEL_PARTS.includes(id)) errors.push(`${n}.limbs.parts.${id}: unknown part (${FEEL_PARTS.join(', ')})`);
  for (const [id, p] of Object.entries(parts)) {
    const at = `limbs.parts.${id}`;
    num(`${at}.startFrac`, p.startFrac, 0.01, 1);
    if (typeof p.sided !== 'boolean') errors.push(`${n}.${at}.sided: must be a boolean`);
    else if (p.sided !== (id !== 'head' && id !== 'torso')) errors.push(`${n}.${at}.sided: must be ${id !== 'head' && id !== 'torso'} (legs and arms take their side from the part id; head and torso have none)`);
    for (const [map, lo] of [['motor', 0.01], ['blend', 0]]) {
      if (!p[map] || !Object.keys(p[map]).length) errors.push(`${n}.${at}.${map}: needs at least one role`);
      for (const [role, v] of Object.entries(p[map] ?? {})) { if (!FEEL_ROLES.includes(role)) errors.push(`${n}.${at}.${map}.${role}: unknown role`); num(`${at}.${map}.${role}`, v, lo, 1); }
    }
    for (const role of Object.keys(p.blend ?? {})) if (!(role in (p.motor ?? {}))) errors.push(`${n}.${at}.blend.${role}: no motor row for that role`);
    if (p.gait) { for (const k of ['periodS']) num(`${at}.gait.${k}`, p.gait[k], 0.1, 10); for (const k of ['dipTo', 'goodDipTo']) num(`${at}.gait.${k}`, p.gait[k], 0.01, 1); num(`${at}.gait.dipFrac`, p.gait.dipFrac, 0.05, 0.95); num(`${at}.gait.hipsDropM`, p.gait.hipsDropM, 0, 0.5); num(`${at}.gait.hipsTiltRad`, p.gait.hipsTiltRad, 0, 1); num(`${at}.gait.hipsBaseFrac`, p.gait.hipsBaseFrac, 0, 1); }
    if (p.stumble) {
      const s = p.stumble;
      if (typeof s.heavyOnly !== 'boolean') errors.push(`${n}.${at}.stumble.heavyOnly: must be a boolean`);
      num(`${at}.stumble.level`, s.level, 0.01, 1); num(`${at}.stumble.dipTo`, s.dipTo, 0.01, 1); num(`${at}.stumble.blend`, s.blend, 0, 1); num(`${at}.stumble.hipsDropM`, s.hipsDropM, 0, 0.5); num(`${at}.stumble.hipsTiltRad`, s.hipsTiltRad, 0, 1);
      for (const k of ['inS', 'holdS', 'upS']) num(`${at}.stumble.${k}`, s[k], 0.01, 10); num(`${at}.stumble.cooldownS`, s.cooldownS, 0, 60);
    }
    if (p.drop) {
      const d = p.drop;
      num(`${at}.drop.afterS`, d.afterS, 0, 10); num(`${at}.drop.gravity`, d.gravity, 0.1, 50); num(`${at}.drop.restitution`, d.restitution, 0, 0.95); num(`${at}.drop.minBounceSpeed`, d.minBounceSpeed, 0, 10); num(`${at}.drop.bounceFriction`, d.bounceFriction, 0, 1); num(`${at}.drop.restHeightM`, d.restHeightM, 0, 1); num(`${at}.drop.lieS`, d.lieS, 0.05, 10);
      if (!Number.isInteger(d.bounces) || d.bounces < 0 || d.bounces > 6) errors.push(`${n}.${at}.drop.bounces: must be an integer in [0, 6]`);
      for (const k of ['velocity', 'spin']) if (!Array.isArray(d[k]) || d[k].length !== 3 || !d[k].every(fin)) errors.push(`${n}.${at}.drop.${k}: must be three finite numbers`);
    }
    if (!p.sim || typeof p.sim !== 'object') errors.push(`${n}.${at}.sim: missing (the sim-facing numbers)`);
    for (const [k, v] of Object.entries(p.sim ?? {})) if (typeof v === 'number' ? !fin(v) || v < 0 : typeof v !== 'boolean') errors.push(`${n}.${at}.sim.${k}: must be a finite number >= 0 or a boolean`);
  }
  if (!parts.leg?.gait) errors.push(`${n}.limbs.parts.leg.gait: missing`);
  if (!parts.leg?.stumble) errors.push(`${n}.limbs.parts.leg.stumble: missing`);
  if (!parts.arm_sword?.drop) errors.push(`${n}.limbs.parts.arm_sword.drop: missing`);
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
    // variants (rules-eval.ts variantFor / applyVariant, ?rules=<name>): per name only `about` and the package rows applyVariant lays over (a typo like rung_stik would be a dead key and the A/B would silently run the pin); a name is not the v1 / m4 row it would shadow
    if ('variants' in json) {
      const vs = json.variants, isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
      if (!isObj(vs)) errors.push(`${name}.variants: must be an object of name -> variant`);
      else for (const [vn, v] of Object.entries(vs)) {
        if ([json.v1, json.m4].includes(vn)) errors.push(`${name}.variants.${vn}: a variant cannot take the name of the ${vn} row`);
        if (!isObj(v)) { errors.push(`${name}.variants.${vn}: must be an object`); continue; }
        const known = { about: null, strength_scale: ['rung_hit', 'rung_stick', 'rung_cut'], melee_speed_gate: ['min_speed_m_s'] };
        for (const [k, val] of Object.entries(v)) {
          if (!Object.hasOwn(known, k)) { errors.push(`${name}.variants.${vn}.${k}: unknown key (about, strength_scale, melee_speed_gate)`); continue; }
          if (k === 'about') { if (typeof val !== 'string') errors.push(`${name}.variants.${vn}.about: must be a string`); continue; }
          if (!isObj(val)) { errors.push(`${name}.variants.${vn}.${k}: must be an object`); continue; }
          for (const [rk, rv] of Object.entries(val)) {
            if (!known[k].includes(rk)) errors.push(`${name}.variants.${vn}.${k}.${rk}: unknown key (${known[k].join(', ')})`);
            else if (!Number.isFinite(rv)) errors.push(`${name}.variants.${vn}.${k}.${rk}: must be a finite number`);
          }
        }
      }
    }
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
  if (name === 'feel-limbs') checkFeelLimbs(json, errors);
  if (name === 'physics' && json.cut?.cue) {   // the cue's units are the package's severable ids, every unit has a label, and the colour is pasted into CSS: a plain #rrggbb only
    const cue = json.cut.cue, UNITS = ['head', 'arm_left', 'arm_right', 'leg_left', 'leg_right', 'torso_waist'];
    for (const u of cue.units ?? []) if (!UNITS.includes(u)) errors.push(`${name}.cut.cue.units: unknown unit ${u}`);
    for (const u of cue.units ?? []) if (typeof cue.labels?.[u] !== 'string' || !cue.labels[u].trim()) errors.push(`${name}.cut.cue.labels.${u}: a unit needs a label`);
    if (!/^#[0-9a-fA-F]{6}$/.test(cue.color ?? '')) errors.push(`${name}.cut.cue.color: must be #rrggbb`);
  }
  if (name === 'physics' && json.hero !== undefined) {   // the hero's ragdoll row (?feel=hero): an opponent-shaped row, no helmet, no gear, a 106-rig measure file the package ships, and not an opponent's id
    const h = json.hero, at = `${name}.hero`;
    if (!h || typeof h !== 'object' || Array.isArray(h)) errors.push(`${at}: must be an object`);
    else {
      for (const k of Object.keys(h)) if (!['id', 'body', 'measure', 'helmet', 'gear'].includes(k)) errors.push(`${at}.${k}: unknown key`);
      for (const k of ['id', 'body']) if (typeof h[k] !== 'string' || !h[k]) errors.push(`${at}.${k}: must be a non-empty string`);
      if (h.helmet !== false) errors.push(`${at}.helmet: must be false`);
      if (!h.gear || typeof h.gear !== 'object' || Array.isArray(h.gear) || Object.keys(h.gear).length) errors.push(`${at}.gear: must be an empty object`);
      if (!h.measure || typeof h.measure !== 'object' || Array.isArray(h.measure)) errors.push(`${at}.measure: must be an object of rig -> path`);
      else {
        for (const [rig, p] of Object.entries(h.measure)) if (rig !== '106' || typeof p !== 'string' || !/^physics\/bodies\/[a-z0-9-]+\.measure\.json$/.test(p)) errors.push(`${at}.measure.${rig}: only the 106 rig, a physics/bodies/<body>.measure.json path`);
        if (!h.measure['106']) errors.push(`${at}.measure.106: missing`);
      }
      if ((json.opponents ?? []).some((o) => o.id === h.id)) errors.push(`${at}.id: '${h.id}' is an opponent's id`);
    }
  }
  if (name === 'physics' && json.finisherCuts?.rows) {   // a finisher row's units are the package's severable ids: the six real cuts and the two visual-only ones (physics 9056ef7); the fallback stand-in must be a real cut (a body without the visual unit gets it), and `also` holds no duplicate of `unit`
    const REAL = ['head', 'arm_left', 'arm_right', 'leg_left', 'leg_right', 'torso_waist'], VISUAL = ['head_split', 'belly_open'];
    for (const [id, row] of Object.entries(json.finisherCuts.rows)) {
      const at = `${name}.finisherCuts.rows.${id}`;
      if (row.unit !== null && ![...REAL, ...VISUAL].includes(row.unit)) errors.push(`${at}.unit: unknown unit ${row.unit}`);
      if (row.also !== undefined && (!Array.isArray(row.also) || row.also.some((u) => ![...REAL, ...VISUAL].includes(u) || u === row.unit))) errors.push(`${at}.also: must be a list of known units other than unit`);
      if (row.fallback !== undefined && row.fallback !== null && !REAL.includes(row.fallback)) errors.push(`${at}.fallback: must be null or a real cut unit (${REAL.join(', ')})`);
      if (row.fallback !== undefined && !VISUAL.includes(row.unit)) errors.push(`${at}.fallback: only a visual unit (${VISUAL.join(', ')}) needs a stand-in`);
    }
  }
  if (name === 'physics' && json.corpse) {   // how many corpses stand is a whole number (0 = none), and a corpse's pieces go no later than the body
    const c = json.corpse;
    if (!Number.isInteger(c.max) || c.max < 0) errors.push(`${name}.corpse.max: must be an integer >= 0`);
    if (Number.isFinite(c.keepSeconds) && Number.isFinite(c.pieceSeconds) && c.pieceSeconds > c.keepSeconds) errors.push(`${name}.corpse.pieceSeconds: must be <= keepSeconds`);
    if (typeof c.cuttable !== 'boolean') errors.push(`${name}.corpse.cuttable: must be true or false`);
    if (!(c.slotSpacingM >= 4)) errors.push(`${name}.corpse.slotSpacingM: must be >= 4 (each ragdoll in the one world has its own lane, wider than a lying body)`);
    if (typeof c.event !== 'string' || !c.event.trim()) errors.push(`${name}.corpse.event: must be the bus event name`);
  }
  if (name === 'sound') errors.push(...checkSoundZone(json.zone));
  if (name === 'stage') errors.push(...checkSkyline(json.skyline));
  if (name === 'perf') {   // each tier: positive frame ceilings, whole-number caps (0 = the lever is pulled from the start), flags a boolean; the ladder names known levers once each
    const KEYS = ['frameMsP95', 'jsMsBudget', 'corpsesMax', 'cutPiecesMax', 'reactionBlendOff', 'feelOff'], LEVERS = ['cutPieces', 'reactionBlend', 'corpses', 'feel'];
    for (const [tier, row] of Object.entries(json.tiers ?? {})) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) { errors.push(`${name}.tiers.${tier}: must be an object`); continue; }
      for (const k of Object.keys(row)) if (!KEYS.includes(k)) errors.push(`${name}.tiers.${tier}.${k}: unknown key`);
      for (const k of ['frameMsP95', 'jsMsBudget']) if (!Number.isFinite(row[k]) || row[k] <= 0) errors.push(`${name}.tiers.${tier}.${k}: must be a finite number > 0`);
      for (const k of ['corpsesMax', 'cutPiecesMax']) if (!Number.isInteger(row[k]) || row[k] < 0) errors.push(`${name}.tiers.${tier}.${k}: must be an integer >= 0`);
      for (const k of ['reactionBlendOff', 'feelOff']) if (typeof row[k] !== 'boolean') errors.push(`${name}.tiers.${tier}.${k}: must be true or false`);
    }
    for (const t of ['phone', 'full']) if (!json.tiers?.[t]) errors.push(`${name}.tiers.${t}: a tier row is required`);
    if (!Array.isArray(json.ladder) || json.ladder.length !== LEVERS.length || new Set(json.ladder).size !== json.ladder.length || json.ladder.some((l) => !LEVERS.includes(l))) errors.push(`${name}.ladder: must list each of ${LEVERS.join(', ')} exactly once`);
    for (const k of ['windowFrames', 'overWindows']) if (!Number.isInteger(json[k]) || json[k] < 1) errors.push(`${name}.${k}: must be an integer >= 1`);
  }
  if (name === 'feel-sim') errors.push(...checkFeelSim(json));
  if (name === 'feel-clash') errors.push(...checkFeelClash(json));
  if (name === 'feel-hitreact') errors.push(...checkHitreact(json));
  if (name === 'fight' && json.camera) {   // the lens zoom (src/fight/camera-zoom.ts): a finite number in 0.5..2 (1 = the camera as before); an absent one would reach the page as NaN
    const z = json.camera.zoom;
    if (!Number.isFinite(z) || z < 0.5 || z > 2) errors.push(`${name}.camera.zoom: must be a finite number in 0.5..2`);
    errors.push(...checkCameraPitch(json.camera.pitch));
    errors.push(...checkWideLens(json.camera.wide, name));
  }
  banned(json, name, errors);
  return errors;
}

// data/stage.json `skyline` (src/fight/skyline.ts): the 360-degree backdrop. Ranges keep it inside the camera's BASE far plane (180 m, src/fight/scene.ts; the zone's open ground only
// lengthens it, data/zone-ground.json cameraFarMetres 420, test/skyview.test.mjs pins both) and the file a plain asset name. SKYLINE_RIM_LIMIT is that 180 less a margin.
export const SKYLINE_RIM_LIMIT = 175;
export const SKYLINE_KEYS = ['about', 'on', 'query', 'v1', 'file', 'seamOverlapPx', 'quality', 'radius', 'heightMetres', 'horizonFraction', 'yawDegrees', 'followOffsetDegrees', 'face', 'yawFollow', 'yawFollowSeconds', 'followQuery', 'followV1', 'brightness', 'fadeSeconds', 'loadAfterFirstFrameMs', 'plate', 'views', 'fold'];
export const SKYPLATE_KEYS = ['about', 'on', 'query', 'v1', 'file', 'spanDegrees', 'cropAspect', 'face', 'horizonFraction', 'faceElevationDegrees', 'turnDegrees', 'orderOffset', 'edgeFadeFraction', 'topFadeFraction', 'bottomFadeFraction', 'segments', 'sky', 'anim', 'flatFile', 'flatQuery', 'flatValue'];
// data/stage.json `skyline.plate` (src/fight/skyplate.ts): the far backdrop arc. A plain file name, a face inside the picture, fractions in range, colours as #rrggbb, and the rim (the arc at its tallest, the sky cylinder) inside the far plane.
function checkSkyPlate(s) {
  const e = [], at = (p, m) => e.push(`stage.skyline.plate.${p}: ${m}`), p = s.plate;
  if (p === null || typeof p !== 'object' || Array.isArray(p)) return ['stage.skyline.plate: must be an object'];
  for (const k of Object.keys(p)) if (!SKYPLATE_KEYS.includes(k)) at(k, 'unknown key');
  if (typeof p.on !== 'boolean') at('on', 'must be true or false');
  for (const k of ['query', 'v1']) if (typeof p[k] !== 'string' || !/^[a-z0-9]+$/i.test(p[k])) at(k, 'must be a plain word');
  const taken = [s.query, s.followQuery, s.views && s.views.query, s.views && s.views.foeFadeQuery, s.fold && s.fold.query];
  if (typeof p.query === 'string' && taken.includes(p.query)) at('query', 'must differ from the other skyline query words');
  if (typeof p.file !== 'string' || !/^[a-z0-9][a-z0-9._-]*\.webp$/i.test(p.file)) at('file', 'must be a plain .webp file name in src/assets/skyline/');
  if (typeof p.flatFile !== 'string' || !/^[a-z0-9][a-z0-9._-]*\.webp$/i.test(p.flatFile)) at('flatFile', 'must be a plain .webp file name in src/assets/skyline/ (the old flattened plate picture, shown with no layers under ?skyflat)');
  for (const k of ['flatQuery', 'flatValue']) if (typeof p[k] !== 'string' || !/^[a-z0-9]+$/i.test(p[k])) at(k, 'must be a plain word');
  if (typeof p.flatQuery === 'string' && (taken.includes(p.flatQuery) || p.flatQuery === p.query || p.flatQuery === (p.anim || {}).query)) at('flatQuery', 'must differ from the other skyline query words');
  const rng = (o, k, lo, hi, int, path = k) => { if (!Number.isFinite(o[k]) || o[k] < lo || o[k] > hi || (int && !Number.isInteger(o[k]))) at(path, `must be ${int ? 'an integer' : 'a finite number'} in ${lo}..${hi}`); };
  rng(p, 'spanDegrees', 20, 180); rng(p, 'cropAspect', 1, 12); rng(p, 'horizonFraction', 0.3, 1); rng(p, 'faceElevationDegrees', -30, 30); rng(p, 'turnDegrees', -360, 360);
  rng(p, 'orderOffset', 1, 99, true); if (Number.isInteger(p.orderOffset) && s.fold && Number.isInteger(s.fold.orderOffset) && !(p.orderOffset > s.fold.orderOffset)) at('orderOffset', 'must draw after the folded floor (above fold.orderOffset) and before the sand (under 100)');
  rng(p, 'edgeFadeFraction', 0, 0.5); rng(p, 'topFadeFraction', 0, 0.5); rng(p, 'bottomFadeFraction', 0, 0.5); rng(p, 'segments', 8, 256, true);
  if (p.face === null || typeof p.face !== 'object' || Array.isArray(p.face)) at('face', 'must be an object {u, v}: the face centre as a fraction across and down the picture');
  else { for (const k of Object.keys(p.face)) if (!['u', 'v'].includes(k)) at(`face.${k}`, 'unknown key'); for (const k of ['u', 'v']) rng(p.face, k, 0, 1, false, `face.${k}`); }
  const k = p.sky;
  if (k === null || typeof k !== 'object' || Array.isArray(k)) at('sky', 'must be an object');
  else {
    for (const q of Object.keys(k)) if (!['topColor', 'horizonColor', 'hazeColor', 'halfHeightMetres', 'rings'].includes(q)) at(`sky.${q}`, 'unknown key');
    for (const q of ['topColor', 'horizonColor', 'hazeColor']) if (typeof k[q] !== 'string' || !/^#[0-9a-f]{6}$/i.test(k[q])) at(`sky.${q}`, 'must be a #rrggbb colour');
    rng(k, 'halfHeightMetres', 10, 400, false, 'sky.halfHeightMetres'); rng(k, 'rings', 2, 128, true, 'sky.rings');
    if (Number.isFinite(s.radius) && Number.isFinite(k.halfHeightMetres) && Math.hypot(s.radius, k.halfHeightMetres) > SKYLINE_RIM_LIMIT) at('sky.halfHeightMetres', 'the sky cylinder rim must stay inside the camera far plane (180 m)');
  }
  if (Number.isFinite(s.radius) && Number.isFinite(p.spanDegrees) && Number.isFinite(p.cropAspect) && Number.isFinite(p.face && p.face.v) && Number.isFinite(p.faceElevationDegrees)) {
    const h = (s.radius * p.spanDegrees * Math.PI / 180) / p.cropAspect, top = s.radius * Math.tan(p.faceElevationDegrees * Math.PI / 180) + (1 - p.face.v) * h, bottom = top - h;
    if (Math.hypot(s.radius, Math.max(Math.abs(top), Math.abs(bottom))) > SKYLINE_RIM_LIMIT) at('spanDegrees', 'the arc, at the shape cropAspect gives it, must stay inside the camera far plane (180 m)');
  }
  e.push(...checkSkyAnim(p.anim, p.query));
  return e;
}
// data/stage.json `skyline.plate.anim` (src/fight/skyanim.ts): the plate's layers and small coded motion. Every layer is a row with a plain picture file name (.webp or .png in src/assets/skyline/), fractions in range, a crop rect inside the plate, positive periods, #rrggbb colours; the sprite sheet's frame rects are real rects, one per frame.
function checkSkyAnim(a, plateQuery) {
  const e = [], at = (p, m) => e.push(`stage.skyline.plate.anim${p ? `.${p}` : ''}: ${m}`);
  if (a === null || typeof a !== 'object' || Array.isArray(a)) return ['stage.skyline.plate.anim: must be an object'];
  const J = (path, k) => (path ? `${path}.${k}` : k);
  const keys = (o, allowed, path) => { if (o === null || typeof o !== 'object' || Array.isArray(o)) { at(path, 'must be an object'); return false; } for (const k of Object.keys(o)) if (!allowed.includes(k)) at(J(path, k), 'unknown key'); for (const k of allowed) if (!(k in o)) at(J(path, k), 'missing'); return true; };
  const rng = (o, k, lo, hi, path, int) => { if (!Number.isFinite(o[k]) || o[k] < lo || o[k] > hi || (int && !Number.isInteger(o[k]))) at(J(path, k), `must be ${int ? 'an integer' : 'a finite number'} in ${lo}..${hi}`); };
  const col = (o, k, path) => { if (typeof o[k] !== 'string' || !/^#[0-9a-f]{6}$/i.test(o[k])) at(J(path, k), 'must be a #rrggbb colour'); };
  const bool = (o, k, path) => { if (typeof o[k] !== 'boolean') at(J(path, k), 'must be true or false'); };
  const file = (o, k, path) => { if (typeof o[k] !== 'string' || !/^[a-z0-9][a-z0-9._-]*\.(webp|png)$/i.test(o[k])) at(J(path, k), 'must be a plain .webp or .png file name in src/assets/skyline/'); };
  const centre = (o, path) => { if (keys(o.centre, ['u', 'v'], J(path, 'centre'))) { rng(o.centre, 'u', 0, 1, J(path, 'centre')); rng(o.centre, 'v', 0, 1, J(path, 'centre')); } };
  const rect = (o, path) => { if (keys(o.rect, ['u0', 'v0', 'u1', 'v1'], J(path, 'rect'))) { for (const k of ['u0', 'v0', 'u1', 'v1']) rng(o.rect, k, 0, 1, J(path, 'rect')); if (!(o.rect.u1 > o.rect.u0 + 0.005) || !(o.rect.v1 > o.rect.v0 + 0.005)) at(J(path, 'rect'), 'must be a real rect (u1 above u0, v1 above v0)'); } return o.rect; };
  const inside = (r, c, rad, path) => { if (r && c && Number.isFinite(c.u) && Number.isFinite(c.v) && Number.isFinite(rad) && !(c.u - rad >= r.u0 - 1e-9 && c.u + rad <= r.u1 + 1e-9 && c.v >= r.v0 && c.v <= r.v1)) at(J(path, 'rect'), 'must contain the layer (its centre and a radius either side)'); };
  keys(a, ['about', 'on', 'query', 'off', 'respectReducedMotion', 'readyTimeoutSeconds', 'planet', 'globe', 'glisten', 'sparkle', 'crownGlow', 'breathing'], '');
  if (typeof a.about !== 'string' || a.about.length < 200) at('about', 'must explain the rows (at least 200 characters)');
  for (const k of ['on', 'respectReducedMotion']) bool(a, k, '');
  for (const k of ['query', 'off']) if (typeof a[k] !== 'string' || !/^[a-z0-9]+$/i.test(a[k])) at(k, 'must be a plain word');
  if (a.query === plateQuery) at('query', 'must differ from the plate query word');
  rng(a, 'readyTimeoutSeconds', 0.5, 30, '');
  const p = a.planet;
  if (keys(p, ['on', 'file', 'rect', 'centre', 'radius', 'glow'], 'planet')) {
    bool(p, 'on', 'planet'); file(p, 'file', 'planet'); centre(p, 'planet'); rng(p, 'radius', 0.001, 0.3, 'planet'); const r = rect(p, 'planet'); inside(r, p.centre, Number.isFinite(p.radius) ? Math.min(p.radius, 0.0) : 0, 'planet');
    if (keys(p.glow, ['on', 'color', 'strength', 'pulseSeconds', 'lowerFadeFrom'], 'planet.glow')) { bool(p.glow, 'on', 'planet.glow'); col(p.glow, 'color', 'planet.glow'); rng(p.glow, 'strength', 0, 1, 'planet.glow'); rng(p.glow, 'pulseSeconds', 0.5, 600, 'planet.glow'); rng(p.glow, 'lowerFadeFrom', -1, 1, 'planet.glow'); }
  }
  const g = a.globe;
  if (keys(g, ['on', 'file', 'rect', 'centre', 'radius', 'bob', 'spin', 'highlight', 'sprite'], 'globe')) {
    if (keys(g.bob, ['on', 'amplitudePx', 'periodSeconds', 'phase'], 'globe.bob')) { bool(g.bob, 'on', 'globe.bob'); rng(g.bob, 'amplitudePx', 0, 12, 'globe.bob'); rng(g.bob, 'periodSeconds', 0.5, 600, 'globe.bob'); rng(g.bob, 'phase', 0, 1, 'globe.bob'); }
    bool(g, 'on', 'globe'); file(g, 'file', 'globe'); centre(g, 'globe'); rng(g, 'radius', 0.001, 0.1, 'globe'); const r = rect(g, 'globe'); inside(r, g.centre, Number.isFinite(g.radius) ? g.radius : 0, 'globe');
    if (keys(g.spin, ['on', 'secondsPerTurn', 'swingDegrees'], 'globe.spin')) { bool(g.spin, 'on', 'globe.spin'); rng(g.spin, 'secondsPerTurn', 1, 3600, 'globe.spin'); rng(g.spin, 'swingDegrees', 0, 90, 'globe.spin'); }
    if (keys(g.highlight, ['on', 'strength', 'size', 'orbit', 'lift', 'orbitSeconds'], 'globe.highlight')) { const h = g.highlight; bool(h, 'on', 'globe.highlight'); rng(h, 'strength', 0, 1, 'globe.highlight'); rng(h, 'size', 0.05, 2, 'globe.highlight'); rng(h, 'orbit', 0, 1, 'globe.highlight'); rng(h, 'lift', -1, 1, 'globe.highlight'); rng(h, 'orbitSeconds', 1, 600, 'globe.highlight'); }
    const s = g.sprite;
    if (keys(s, ['on', 'file', 'columns', 'rows', 'frames', 'frameSeconds', 'cellPx', 'ballRadiusPx', 'sheetPx', 'loadScale', 'rects'], 'globe.sprite')) {
      bool(s, 'on', 'globe.sprite'); file(s, 'file', 'globe.sprite'); rng(s, 'columns', 1, 64, 'globe.sprite', true); rng(s, 'rows', 1, 64, 'globe.sprite', true); rng(s, 'frames', 1, 256, 'globe.sprite', true);
      rng(s, 'frameSeconds', 0.02, 10, 'globe.sprite'); rng(s, 'cellPx', 8, 4096, 'globe.sprite'); rng(s, 'ballRadiusPx', 4, 2048, 'globe.sprite'); rng(s, 'loadScale', 0.1, 1, 'globe.sprite');
      if (Number.isFinite(s.cellPx) && Number.isFinite(s.ballRadiusPx) && s.ballRadiusPx * 2 > s.cellPx + 1) at('globe.sprite.ballRadiusPx', 'the sphere must fit its cell');
      if (Number.isFinite(s.columns) && Number.isFinite(s.rows) && Number.isFinite(s.frames) && s.frames > s.columns * s.rows) at('globe.sprite.frames', 'cannot exceed columns x rows');
      let W = 0, H = 0;
      if (keys(s.sheetPx, ['w', 'h'], 'globe.sprite.sheetPx')) { rng(s.sheetPx, 'w', 8, 16384, 'globe.sprite.sheetPx', true); rng(s.sheetPx, 'h', 8, 16384, 'globe.sprite.sheetPx', true); W = s.sheetPx.w; H = s.sheetPx.h; }
      if (!Array.isArray(s.rects) || s.rects.length !== s.frames) at('globe.sprite.rects', 'must be an array with one rect per frame');
      else for (const [i, q] of s.rects.entries()) {
        const pth = `globe.sprite.rects.${i}`;
        if (!keys(q, ['x', 'y', 'w', 'h'], pth)) continue;
        for (const k of ['x', 'y', 'w', 'h']) rng(q, k, 0, 16384, pth);
        if (W && H && Number.isFinite(q.x + q.y + q.w + q.h) && (q.x + q.w > W || q.y + q.h > H)) at(pth, 'must lie inside the sheet');
      }
    }
  }
  const l = a.glisten;
  if (keys(l, ['on', 'file', 'rect', 'periodSeconds', 'sweepSeconds', 'width', 'slant', 'strength', 'color', 'baseGlow', 'twinkle', 'spreadTexels'], 'glisten')) {
    bool(l, 'on', 'glisten'); file(l, 'file', 'glisten'); rect(l, 'glisten'); col(l, 'color', 'glisten'); rng(l, 'periodSeconds', 1, 600, 'glisten'); rng(l, 'sweepSeconds', 0.2, 600, 'glisten'); rng(l, 'width', 0.002, 0.3, 'glisten'); rng(l, 'slant', -2, 2, 'glisten'); rng(l, 'strength', 0, 2, 'glisten'); rng(l, 'baseGlow', 0, 2, 'glisten'); rng(l, 'spreadTexels', 0, 8, 'glisten');
    if (Number.isFinite(l.periodSeconds) && Number.isFinite(l.sweepSeconds) && l.sweepSeconds > l.periodSeconds) at('glisten.sweepSeconds', 'must not exceed periodSeconds');
    if (keys(l.twinkle, ['periodSeconds', 'cells', 'amount'], 'glisten.twinkle')) { rng(l.twinkle, 'periodSeconds', 0.2, 600, 'glisten.twinkle'); rng(l.twinkle, 'cells', 10, 8192, 'glisten.twinkle'); rng(l.twinkle, 'amount', 0, 1, 'glisten.twinkle'); }
  }
  // Sky life: a procedural star glint on a list of anchors, a slow crown glow pulse, a body breath (a feathered sine lift) over a rect.
  const sk = a.sparkle;
  if (keys(sk, ['on', 'color', 'strength', 'size', 'durationSeconds', 'minGapSeconds', 'maxGapSeconds', 'firstDelaySeconds', 'seed', 'anchors'], 'sparkle')) {
    bool(sk, 'on', 'sparkle'); col(sk, 'color', 'sparkle'); rng(sk, 'strength', 0, 3, 'sparkle'); rng(sk, 'size', 0.0005, 0.05, 'sparkle'); rng(sk, 'durationSeconds', 0.05, 5, 'sparkle');
    rng(sk, 'minGapSeconds', 0.1, 600, 'sparkle'); rng(sk, 'maxGapSeconds', 0.1, 600, 'sparkle'); rng(sk, 'firstDelaySeconds', 0, 600, 'sparkle'); rng(sk, 'seed', 0, 4294967295, 'sparkle', true);
    if (Number.isFinite(sk.minGapSeconds) && Number.isFinite(sk.maxGapSeconds) && sk.maxGapSeconds < sk.minGapSeconds) at('sparkle.maxGapSeconds', 'must not be below minGapSeconds');
    if (Number.isFinite(sk.minGapSeconds) && Number.isFinite(sk.durationSeconds) && sk.minGapSeconds < sk.durationSeconds) at('sparkle.minGapSeconds', 'must not be below durationSeconds (one glint at a time)');
    if (!Array.isArray(sk.anchors) || sk.anchors.length < 2 || sk.anchors.length > 16) at('sparkle.anchors', 'must be a list of 2 to 16 anchors (so it can avoid the same one twice running)');
    else for (const [i, q] of sk.anchors.entries()) { const pth = `sparkle.anchors.${i}`; if (keys(q, ['name', 'u', 'v', 'scale'], pth)) { if (typeof q.name !== 'string' || !q.name) at(`${pth}.name`, 'must be a name'); rng(q, 'u', 0, 1, pth); rng(q, 'v', 0, 1, pth); rng(q, 'scale', 0.1, 4, pth); } }
  }
  const cg = a.crownGlow;
  if (keys(cg, ['on', 'centre', 'radiusU', 'radiusV', 'color', 'strength', 'pulseSeconds'], 'crownGlow')) { bool(cg, 'on', 'crownGlow'); centre(cg, 'crownGlow'); rng(cg, 'radiusU', 0.001, 0.2, 'crownGlow'); rng(cg, 'radiusV', 0.001, 0.2, 'crownGlow'); col(cg, 'color', 'crownGlow'); rng(cg, 'strength', 0, 1, 'crownGlow'); rng(cg, 'pulseSeconds', 0.5, 600, 'crownGlow'); }
  const br = a.breathing;
  if (keys(br, ['on', 'rect', 'featherFraction', 'amplitudePx', 'periodSeconds', 'phase'], 'breathing')) { bool(br, 'on', 'breathing'); rect(br, 'breathing'); rng(br, 'featherFraction', 0.05, 0.5, 'breathing'); rng(br, 'amplitudePx', 0, 12, 'breathing'); rng(br, 'periodSeconds', 0.5, 600, 'breathing'); rng(br, 'phase', 0, 1, 'breathing'); }
  return e;
}
/** data/fight.json camera.wide(src/fight/camera-zoom.ts WideRow): the extra lens zoom on a wide screen. fromAspect 0.75..2 (never below a portrait tablet: every portrait phone stays exactly as it was), toAspect above it, zoom 1..2, maxHfovDeg 40..120. */
function checkWideLens(w, name) {
  const at = (key, why) => `${name}.camera.wide.${key}: ${why}`, errors = [];
  if (!w || typeof w !== 'object') return [`${name}.camera.wide: the wide-screen lens row is required`];
  for (const k of Object.keys(w)) if (!['about', 'fromAspect', 'toAspect', 'zoom', 'maxHfovDeg'].includes(k)) errors.push(at(k, 'unknown key'));
  if (!(Number.isFinite(w.fromAspect) && w.fromAspect >= 0.75 && w.fromAspect <= 2)) errors.push(at('fromAspect', 'must be a number in 0.75..2 (a portrait phone never gets the wide zoom)'));
  if (!(Number.isFinite(w.toAspect) && Number.isFinite(w.fromAspect) && w.toAspect > w.fromAspect && w.toAspect <= 4)) errors.push(at('toAspect', 'must be a number above fromAspect, at most 4'));
  if (!(Number.isFinite(w.zoom) && w.zoom >= 1 && w.zoom <= 2)) errors.push(at('zoom', 'must be a number in 1..2 (1 = no wide-screen zoom)'));
  if (!(Number.isFinite(w.maxHfovDeg) && w.maxHfovDeg >= 40 && w.maxHfovDeg <= 120)) errors.push(at('maxHfovDeg', 'must be a number in 40..120 degrees'));
  return errors;
}
function checkSkyline(s) {
  const e = [], at = (p, m) => e.push(`stage.skyline.${p}: ${m}`);
  if (s === null || typeof s !== 'object' || Array.isArray(s)) return ['stage.skyline: must be an object'];
  for (const k of Object.keys(s)) if (!SKYLINE_KEYS.includes(k)) at(k, 'unknown key');
  if (typeof s.on !== 'boolean') at('on', 'must be true or false');
  for (const k of ['query', 'v1', 'followQuery', 'followV1']) if (typeof s[k] !== 'string' || !/^[a-z0-9]+$/i.test(s[k])) at(k, 'must be a plain word');
  if (typeof s.file !== 'string' || !/^[a-z0-9][a-z0-9._-]*\.webp$/i.test(s.file)) at('file', 'must be a plain .webp file name in src/assets/skyline/');
  const rng = (k, lo, hi, int) => { if (!Number.isFinite(s[k]) || s[k] < lo || s[k] > hi || (int && !Number.isInteger(s[k]))) at(k, `must be ${int ? 'an integer' : 'a finite number'} in ${lo}..${hi}`); };
  rng('seamOverlapPx', 0, 2000, true); rng('quality', 40, 100, true); rng('radius', 20, 160); rng('heightMetres', 5, 400); rng('horizonFraction', 0.5, 1);
  if (s.face === null || typeof s.face !== 'object' || Array.isArray(s.face)) at('face', 'must be an object {u, v}: the alien face centre as a fraction across and down the picture');
  else {
    for (const k of Object.keys(s.face)) if (!['u', 'v'].includes(k)) at(`face.${k}`, 'unknown key');
    for (const k of ['u', 'v']) if (!Number.isFinite(s.face[k]) || s.face[k] < 0 || s.face[k] > 1) at(`face.${k}`, 'must be a finite number in 0..1');
  }
  rng('yawDegrees', -360, 360); rng('followOffsetDegrees', -360, 360); rng('yawFollow', 0, 1); rng('yawFollowSeconds', 0, 20);
  if (typeof s.followQuery === 'string' && (s.followQuery === s.query || s.followQuery === (s.views || {}).query)) at('followQuery', 'must be a plain word other than skyline.query and skyline.views.query'); rng('brightness', 0.1, 1.5); rng('fadeSeconds', 0, 10); rng('loadAfterFirstFrameMs', 0, 10000, true);
  if (Number.isFinite(s.radius) && Number.isFinite(s.heightMetres) && Number.isFinite(s.horizonFraction) && Math.hypot(s.radius, Math.max(s.horizonFraction, 1 - s.horizonFraction) * s.heightMetres) > SKYLINE_RIM_LIMIT) at('radius', 'the cylinder rim must stay inside the camera far plane (180 m)');
  e.push(...checkSkyViews(s));
  e.push(...checkSkyFold(s));
  e.push(...checkSkyPlate(s));
  return e;
}

// data/stage.json `skyline.fold` (src/fight/skyfold.ts): the strip's lower band laid flat as a cloud floor under the sand. The far edge stays inside the far plane (SKYLINE_RIM_LIMIT), the near edge nearer than the far one, each variant's band a non-empty slice of its picture.
export const SKYFOLD_KEYS = ['about', 'on', 'query', 'v1', 'default', 'variants', 'farMetres', 'nearMetres', 'featherFraction', 'groundY', 'orderOffset', 'around', 'rings'];
function checkSkyFold(s) {
  const e = [], at = (p, m) => e.push(`stage.skyline.fold.${p}: ${m}`), f = s.fold;
  if (f === null || typeof f !== 'object' || Array.isArray(f)) return ['stage.skyline.fold: must be an object'];
  for (const k of Object.keys(f)) if (!SKYFOLD_KEYS.includes(k)) at(k, 'unknown key');
  if (typeof f.on !== 'boolean') at('on', 'must be true or false');
  for (const k of ['query', 'v1']) if (typeof f[k] !== 'string' || !/^[a-z0-9]+$/i.test(f[k])) at(k, 'must be a plain word');
  if (typeof f.query === 'string' && (f.query === s.query || (s.views && f.query === s.views.query))) at('query', 'must differ from skyline.query and skyline.views.query');
  const rng = (k, lo, hi, int) => { if (!Number.isFinite(f[k]) || f[k] < lo || f[k] > hi || (int && !Number.isInteger(f[k]))) at(k, `must be ${int ? 'an integer' : 'a finite number'} in ${lo}..${hi}`); };
  rng('farMetres', 20, SKYLINE_RIM_LIMIT - 5); rng('nearMetres', 1, 100); rng('featherFraction', 0, 1); rng('groundY', -5, 5); rng('orderOffset', 1, 99, true); rng('around', 8, 512, true); rng('rings', 2, 256, true);
  if (Number.isFinite(f.nearMetres) && Number.isFinite(f.farMetres) && !(f.nearMetres < f.farMetres)) at('nearMetres', 'must be nearer than farMetres');
  const vs = f.variants;
  if (vs === null || typeof vs !== 'object' || Array.isArray(vs)) return [...e, 'stage.skyline.fold.variants: must be an object'];
  if (typeof f.default !== 'string' || !Object.prototype.hasOwnProperty.call(vs, f.default)) at('default', 'must be one of the variant ids');
  if (typeof f.v1 === 'string' && Object.prototype.hasOwnProperty.call(vs, f.v1)) at('v1', 'must not also be a variant id');
  for (const [id, w] of Object.entries(vs)) {
    const p = `variants.${id}`;
    if (!/^[a-z0-9]+$/i.test(id)) at(p, 'the id must be a plain word');
    if (w === null || typeof w !== 'object' || Array.isArray(w)) { at(p, 'must be an object'); continue; }
    for (const k of Object.keys(w)) if (!['file', 'bandTopFraction', 'bandBottomFraction'].includes(k)) at(`${p}.${k}`, 'unknown key');
    if (typeof w.file !== 'string' || !(w.file === '' || /^[a-z0-9][a-z0-9._-]*\.webp$/i.test(w.file))) at(`${p}.file`, "must be '' (the strip's own picture) or a plain .webp file name in src/assets/skyline/");
    for (const k of ['bandTopFraction', 'bandBottomFraction']) if (!Number.isFinite(w[k]) || w[k] < 0 || w[k] > 1) at(`${p}.${k}`, 'must be a finite number in 0..1');
    if (Number.isFinite(w.bandTopFraction) && Number.isFinite(w.bandBottomFraction) && !(w.bandBottomFraction - w.bandTopFraction >= 0.02)) at(`${p}.bandBottomFraction`, 'must be at least 0.02 below bandTopFraction (a non-empty band)');
  }
  return e;
}

// data/stage.json `skyline.views` (src/fight/skyview.ts): the ?skyview= looks. Every variant has every key; the band is both 0 (off) or start > end (degrees below the horizon: it fades from the start angle down to the end angle); the strip, lowered or resized, keeps its rim inside the far plane.
export const SKYVIEW_KEYS = ['fogColor', 'fogDensity', 'fadeStartDegrees', 'fadeEndDegrees', 'dropMetres', 'heightMetres', 'brightness', 'foeFade', 'foeFadeMinOpacity', 'foeFadeClearMetres'];
function checkSkyViews(s) {
  const e = [], at = (p, m) => e.push(`stage.skyline.views.${p}: ${m}`), v = s.views;
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return ['stage.skyline.views: must be an object'];
  for (const k of Object.keys(v)) if (!['about', 'query', 'v1', 'foeFadeQuery', 'foeFadeV1', 'default', 'variants'].includes(k)) at(k, 'unknown key');
  if (typeof v.query !== 'string' || !/^[a-z0-9]+$/i.test(v.query) || v.query === s.query) at('query', 'must be a plain word other than skyline.query');
  if (typeof v.v1 !== 'string' || !/^[a-z0-9]+$/i.test(v.v1)) at('v1', 'must be a plain word (the link value for the look before the variants)');
  for (const k of ['foeFadeQuery', 'foeFadeV1']) if (typeof v[k] !== 'string' || !/^[a-z0-9]+$/i.test(v[k])) at(k, 'must be a plain word');
  if (v.foeFadeQuery === v.query || v.foeFadeQuery === s.query) at('foeFadeQuery', 'must differ from the skyview and sky query words');
  const vs = v.variants;
  if (vs === null || typeof vs !== 'object' || Array.isArray(vs)) return [...e, 'stage.skyline.views.variants: must be an object'];
  if (typeof v.default !== 'string' || !(v.default === v.v1 || Object.prototype.hasOwnProperty.call(vs, v.default))) at('default', 'must be one of the variant ids, or the v1 word (the look before)');
  if (typeof v.v1 === 'string' && Object.prototype.hasOwnProperty.call(vs, v.v1)) at('v1', 'must not also be a variant id');
  for (const [id, w] of Object.entries(vs)) {
    const p = `variants.${id}`, bad = (k, m) => at(`${p}.${k}`, m);
    if (!/^[a-z0-9]+$/i.test(id)) at(p, 'the id must be a plain word');
    if (w === null || typeof w !== 'object' || Array.isArray(w)) { at(p, 'must be an object'); continue; }
    for (const k of Object.keys(w)) if (!SKYVIEW_KEYS.includes(k)) bad(k, 'unknown key');
    if (typeof w.fogColor !== 'string' || !(w.fogColor === '' || /^#[0-9a-f]{6}$/i.test(w.fogColor))) bad('fogColor', "must be '' or a #rrggbb colour");
    const rng = (k, lo, hi) => { if (!Number.isFinite(w[k]) || w[k] < lo || w[k] > hi) bad(k, `must be a finite number in ${lo}..${hi}`); };
    rng('fogDensity', 0, 0.1); rng('fadeStartDegrees', 0, 89); rng('fadeEndDegrees', 0, 89); rng('dropMetres', -120, 120); rng('brightness', 0.1, 1.5); rng('foeFadeMinOpacity', 0, 1); rng('foeFadeClearMetres', 0, 150);
    if (typeof w.foeFade !== 'boolean') bad('foeFade', 'must be true or false');
    else if (w.foeFade && !(w.fadeStartDegrees > w.fadeEndDegrees)) bad('foeFade', 'needs a fade band (fadeStartDegrees above fadeEndDegrees)');
    if (!Number.isFinite(w.heightMetres) || (w.heightMetres !== 0 && (w.heightMetres < 5 || w.heightMetres > 400))) bad('heightMetres', 'must be 0 (the strip row\'s) or a number in 5..400');
    if (Number.isFinite(w.fadeStartDegrees) && Number.isFinite(w.fadeEndDegrees) && !(w.fadeStartDegrees === 0 && w.fadeEndDegrees === 0) && !(w.fadeStartDegrees > w.fadeEndDegrees)) bad('fadeStartDegrees', 'must be above fadeEndDegrees (or both 0 = off)');
    const h = w.heightMetres > 0 ? w.heightMetres : s.heightMetres;
    if (Number.isFinite(s.radius) && Number.isFinite(h) && Number.isFinite(s.horizonFraction) && Number.isFinite(w.dropMetres) && Math.hypot(s.radius, Math.max(Math.abs(s.horizonFraction * h - w.dropMetres), Math.abs((1 - s.horizonFraction) * h + w.dropMetres))) > SKYLINE_RIM_LIMIT) bad('dropMetres', 'the strip, lowered, must keep its rim inside the camera far plane (180 m)');
  }
  return e;
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
  const sec0 = (p, v, lo) => { if (!Number.isFinite(v) || v < 0 || v > 60 || Math.round(v * hz) < lo) at(p, `must be a number of seconds in ${lo ? '(0' : '[0'}, 60]${lo ? ', at least one tick' : ''}`); };
  sec0('knockdown.minSecondsBetween', j.knockdown?.minSecondsBetween, 0); sec0('kick.interruptSeconds', j.kick?.interruptSeconds, 1); sec0('kick.flinchSeconds', j.kick?.flinchSeconds, 0); if (typeof j.kick?.interruptThroughPoise !== 'boolean') at('kick.interruptThroughPoise', 'must be true or false'); sec0('kick.resistanceSeconds', j.kick?.resistanceSeconds, 0); sec0('kick.cooldownSeconds', j.kick?.cooldownSeconds, 0);
  if (!Number.isInteger(j.kickOnInjuredLeg?.hits) || j.kickOnInjuredLeg.hits < 1 || j.kickOnInjuredLeg.hits > 100) at('kickOnInjuredLeg.hits', 'must be a whole number in 1..100');
  if (!Number.isFinite(j.kickOnInjuredLeg?.windowS) || j.kickOnInjuredLeg.windowS <= 0 || j.kickOnInjuredLeg.windowS > 120 || Math.round(j.kickOnInjuredLeg.windowS * hz) < 1) at('kickOnInjuredLeg.windowS', 'must be seconds in (0, 120], at least one tick');
  if (j.moves?.kick?.perMille !== 0) at('moves.kick.perMille', 'must be 0: a kick interrupts, it never knocks down by force');
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
    pm(`moves.${m}.perMille`, r?.perMille, 0);
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

// data/profiles.json as the per-kind rows of the zone (Strategy + Dom 2026-10-27, one profile row per spawn `kind`; src/fight/spawn-kind.ts): ids are unique, each `opponent` is an archetype
// (`archetypes`: src/fight/archetype-defs.json ids, i.e. Object.keys(OPPONENTS)), and an optional `knobs` row names only brain knobs, each in the difficulty ladder's range.
export function checkKinds(profiles, archetypes) {
  const errors = [], seen = new Set();
  for (const p of profiles.profiles ?? []) {
    if (seen.has(p.id)) errors.push(`profiles.${p.id}: duplicate id (a spawn kind names exactly one row)`); seen.add(p.id);
    if (!archetypes.includes(p.opponent)) errors.push(`profiles.${p.id}.opponent: '${String(p.opponent)}' is not an archetype (${archetypes.join(', ')})`);
    if (p.knobs === undefined) continue;
    if (!p.knobs || typeof p.knobs !== 'object' || Array.isArray(p.knobs)) { errors.push(`profiles.${p.id}.knobs: must be an object of brain knobs`); continue; }
    for (const [k, v] of Object.entries(p.knobs)) {
      const range = ['reaction', 'accuracy', 'parry', 'dodge', 'aggression', 'pressure', 'discipline', 'lapse', 'read'].includes(k) ? KNOB_RANGE[k] : null;
      if (!range) { errors.push(`profiles.${p.id}.knobs.${k}: unknown knob`); continue; }
      if (typeof v !== 'number' || !Number.isFinite(v) || v < range[0] || v > range[1]) errors.push(`profiles.${p.id}.knobs.${k}: ${String(v)} is not a number from ${range[0]} to ${range[1]}`);
      else if ((k === 'reaction' || k === 'discipline') && !Number.isInteger(v)) errors.push(`profiles.${p.id}.knobs.${k}: ${v} is a whole number of ticks / percent`);
    }
  }
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
