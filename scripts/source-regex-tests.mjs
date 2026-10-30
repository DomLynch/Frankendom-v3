// Inventory of test cases that assert on SOURCE TEXT (a regex / includes over readFileSync of src/*.ts, index.html or a script) instead of behaviour (audit item 19).
//   node scripts/source-regex-tests.mjs           table
//   node scripts/source-regex-tests.mjs --json    the same as JSON
//   node scripts/source-regex-tests.mjs --check   exit 1 when a test case OUTSIDE test/source-pins/ asserts on source text and is neither HELD nor CONFIG below
//
// How a case is found: a top-level test(...) is split into statements; a statement is a "source read" when it calls readFileSync / a reader helper (const read = (p) => readFileSync(...))
// on a path ending .ts .html .mjs .js .css .md, or uses a variable that holds such text; it counts when such a statement asserts (assert.match / doesNotMatch / includes / test / indexOf / match).
// A statement that reads JSON / GLB / WebP is data, not source, and never counts.
// Classes:  wiring = pins that module A calls / imports / builds B (convert to a behaviour or import test where cheap);  absent = pins that dead or forbidden code is absent (a grep gate).
// Where a pin lives:  test/source-pins/ (kept, each file headed by what it pins and why)  |  HELD (an open PR edits the file; moves in a follow-up)  |  CONFIG (pins a deploy/CSS artifact's own format, not code).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

// files this PR did not touch, with the reason; matched as a prefix of the path under test/
export const HELD = {
  'mechanics': 'open mechanics batch #289 (and #276 #278 #279 #280 #283) adds or edits it', 'mech-': '#289', 'rings': '#289', 'commentator': '#289', 'all-bosses': '#289', 'envoy-latch': '#289',
  'reginald-limb-loss': '#289', 'king-aura': '#289', 'mechanic-main-hooks': '#289', 'kind-per-spawn': '#278 #289 edit it', 'cut-strike': 'audit C (cut-strike) in flight, #277', 'mobs-review': '#277 edits it',
  'pickup': '#277 edits it', 'skyview': '#241 edits it', 'zone-spawns': '#264 edits it', 'held-body': 'reads test/helpers/boss-rows.mjs (audit C)', 'spawn-body': 'reads test/helpers/boss-rows.mjs (audit C)',
  'hero-mana': 'replay / era-flag tests (audit C)', 'foe-special-reach': 'replay / era-flag tests (audit C)', 'specials-ring': 'replay / era-flag tests (audit C)', 'skull': 'replay / era-flag tests (audit C)',
  'defaults-on': 'replay tests (audit C)', 'difficulty': 'replay tests (audit C)', 'directional-heavies': 'replay tests (audit C)', 'feel-limbs': 'replay tests (audit C)', 'finisher-every-kill': 'replay tests (audit C)',
  'radar': 'replay tests (audit C)', 'zone-client': 'replay tests (audit C)', 'zone-model': 'replay tests (audit C)', 'zone-migration': 'replay tests (audit C)', 'gate0': 'Gate 0 is untouched by rule',
  'sql/': 'replay tests (audit C)', 'rig-bones': 'CI runs it by name against dist/ (DIST_REQUIRED)', 'blade-tables': 'reads the BUILT bundle, not source', 'boss-expect': 'CI runs it by name against dist/',
};
export const CONFIG = { 'deploy-presence': 'pins the systemd unit / nginx snippet / runbook, which are the artifact itself', 'kbm': 'walks the selectors of src/style.css (a structured CSS check)' };

const SRC_EXT = /\.(ts|html|mjs|js|css|md)['"`]/;

export function testFiles(dir = join(ROOT, 'test')) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (e !== 'fixtures' && e !== 'helpers') out.push(...testFiles(p)); } else if (e.endsWith('.test.mjs')) out.push(p);
  }
  return out.sort();
}

// ---- a small JS scanner: walks code characters only (skips strings, template text, regex literals, comments) ----
function walk(text, cb) {
  const n = text.length; let i = 0, depth = 0, prev = '';
  const skipStr = (j) => { const q = text[j]; j++; while (j < n && text[j] !== q) { if (text[j] === '\\') j++; j++; } return j + 1; };
  const skipBraces = (j) => { let d = 0; while (j < n) { const c = text[j]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) return j + 1; } else if (c === '`') { j = skipTpl(j); continue; } else if (c === '"' || c === "'") { j = skipStr(j); continue; } j++; } return j; };
  const skipTpl = (j) => { j++; while (j < n && text[j] !== '`') { if (text[j] === '\\') j += 2; else if (text[j] === '$' && text[j + 1] === '{') j = skipBraces(j + 1); else j++; } return j + 1; };
  while (i < n) {
    const c = text[i], d = text[i + 1];
    if (c === '/' && d === '/') { while (i < n && text[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i = text.indexOf('*/', i + 2); i = i < 0 ? n : i + 2; continue; }
    if (c === '"' || c === "'") { i = skipStr(i); prev = 'S'; continue; }
    if (c === '`') { i = skipTpl(i); prev = 'S'; continue; }
    if (c === '/' && !/[)\]}\w$S]/.test(prev || ';')) {
      i++; let cls = false;
      while (i < n) { const e = text[i]; if (e === '\\') { i += 2; continue; } if (e === '[') cls = true; else if (e === ']') cls = false; else if (e === '/' && !cls) break; i++; }
      i++; while (i < n && /[a-z]/.test(text[i])) i++;
      prev = 'S'; continue;
    }
    const before = depth; if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--;
    if (cb(i, c, before, depth) === 'stop') return;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
}
function splitStatements(body) {
  const out = []; let start = 0;
  walk(body, (i, c, before, after) => {
    if (after !== 0) return;
    let end = -1;
    if (c === ';' && before === 0) end = i + 1;
    else if (c === '}' && before === 1) {
      const rest = body.slice(i + 1).replace(/^(?:\s|\/\/[^\n]*\n)*/, '');
      if (/^(else|catch|finally)\b/.test(rest) || /^[;,).?:]/.test(rest)) return;
      end = i + 1;
    }
    if (end < 0) return;
    const tail = /^[ \t]*\/\/[^\n]*/.exec(body.slice(end)); if (tail) end += tail[0].length;
    out.push(body.slice(start, end)); start = end;
  });
  if (body.slice(start).trim()) out.push(body.slice(start));
  return out;
}
function splitCommas(str) {
  const parts = []; let s = 0;
  walk(str, (i, c, before) => { if (c === ',' && before === 0) { parts.push(str.slice(s, i)); s = i + 1; } });
  parts.push(str.slice(s)); return parts;
}
const stripLead = (st) => st.replace(/^(?:\s*\/\/[^\n]*\n|\s*\/\*[\s\S]*?\*\/\s*|\s*\n)*/, '').trimStart();
function declarators(code) {
  const m = /^(const|let)\s+/.exec(code); if (!m) return null;
  let rest = code.slice(m[0].length); const semi = /;\s*(?:\/\/[^\n]*)?\s*$/.exec(rest); if (semi) rest = rest.slice(0, semi.index);
  return splitCommas(rest).map((s) => s.trim()).filter(Boolean);
}
function walkEq(item) { let at = item.length; walk(item, (i, c, b) => { if (c === '=' && b === 0 && item[i + 1] !== '=' && item[i + 1] !== '>') { at = i; return 'stop'; } }); return at; }
const declName = (item) => { const m = /^([A-Za-z_$][\w$]*)\s*=/.exec(item); if (m) return [m[1]]; if (/^[{[]/.test(item)) return [...item.slice(0, walkEq(item)).matchAll(/[A-Za-z_$][\w$]*/g)].map((x) => x[0]); return []; };
const idsOf = (text) => { let code = ''; walk(text, (i, c) => { code += c; }); const out = new Set(code.match(/[A-Za-z_$][\w$]*/g) ?? []); for (const m of text.matchAll(/\$\{([^}]*)\}/g)) for (const x of m[1].match(/[A-Za-z_$][\w$]*/g) ?? []) out.add(x); return out; };

// column-0 blocks (a block runs to the next column-0 line that starts with an identifier)
function topBlocks(text) {
  const lines = text.split('\n'), blocks = []; let cur = null;
  lines.forEach((l, i) => { if (/^[A-Za-z_$]/.test(l)) { if (cur) blocks.push(cur); cur = { code: l, line: i + 1 }; } else if (cur && !/^\/\//.test(l)) cur.code += '\n' + l; else if (cur) { blocks.push(cur); cur = null; } });
  if (cur) blocks.push(cur);
  return blocks;
}
const READER_ITEM = /^[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?\(?[\w$, ]*\)?\s*=>[^]*readFileSync\(/;
function fileLevel(blocks) {
  const readers = new Set(), consts = new Set();
  for (const b of blocks) for (const item of declarators(b.code) ?? []) {
    if (!/readFileSync\(/.test(item)) continue;
    const nm = /^([A-Za-z_$][\w$]*)\s*=/.exec(item)?.[1]; if (!nm) continue;
    if (READER_ITEM.test(item)) readers.add(nm); else if (SRC_EXT.test(item)) consts.add(nm);
  }
  return { readers, consts };
}
function isSourceExpr(expr, readers, tainted) {
  if (/readFileSync\(/.test(expr) && SRC_EXT.test(expr)) return true;
  for (const r of readers) if (new RegExp(`\\b${r}\\(`).test(expr) && (expr.match(/['"`][^'"`]*['"`]/g) ?? []).some((s) => SRC_EXT.test(s))) return true;
  const set = idsOf(expr); for (const t of tainted) if (set.has(t)) return true;
  return false;
}
const ASSERTS = /assert\.(match|doesNotMatch)\(|\.(includes|test|indexOf|match|search)\(/;
const NEGATIVE = /doesNotMatch|!\s*\/|!\w+\.test\(|assert\.ok\(!|\.length, 0|, false\)/;

// the source-text assertions inside one test(...) block: [{text, kind}]
export function sourceAssertions(code, fileReaders, fileConsts) {
  const hm = /^(test|it)(\.\w+)?\(([\s\S]*?)(async\s*)?\(\)\s*=>\s*\{\n/.exec(code), tailM = /\n\}\);?\s*$/.exec(code);
  if (!hm || !tailM) return [];
  const readers = new Set(fileReaders), tainted = new Set(fileConsts), out = [];
  for (const st of splitStatements(code.slice(hm[0].length, tailM.index + 1))) {
    const body = stripLead(st), items = declarators(body);
    if (items) {
      for (const it of items) {
        if (READER_ITEM.test(it)) { readers.add(/^([\w$]+)/.exec(it)[1]); continue; }
        if (isSourceExpr(it, readers, tainted)) { for (const nm of declName(it)) tainted.add(nm); if (ASSERTS.test(it)) out.push({ text: it, kind: NEGATIVE.test(it) ? 'absent' : 'wiring' }); }
      }
      continue;
    }
    if (isSourceExpr(body, readers, tainted) && ASSERTS.test(body)) out.push({ text: body, kind: NEGATIVE.test(body) ? 'absent' : 'wiring' });
  }
  return out;
}

const where = (rel, table) => Object.entries(table).find(([k]) => rel.replace(/^test\//, '').startsWith(k))?.[1];
export function inventory(files = testFiles()) {
  const rows = [];
  for (const file of files) {
    const rel = relative(ROOT, file), blocks = topBlocks(readFileSync(file, 'utf8')), { readers, consts } = fileLevel(blocks);
    for (const b of blocks) {
      if (!/^(test|it)\b/.test(b.code)) continue;
      const found = sourceAssertions(b.code, readers, consts);
      if (!found.length) continue;
      const name = (/^(?:test|it)(?:\.\w+)?\(\s*(['"`])((?:\\.|(?!\1).)*)\1/s.exec(b.code) ?? [])[2] ?? '?';
      const kinds = new Set(found.map((f) => f.kind));
      const status = rel.startsWith('test/source-pins/') ? 'pinned' : where(rel, CONFIG) ? 'config' : where(rel, HELD) ? 'held' : 'loose';
      rows.push({ file: rel, line: b.line, name, kind: kinds.size > 1 ? 'mixed' : [...kinds][0], statements: found.length, status, why: where(rel, CONFIG) ?? where(rel, HELD) ?? '' });
    }
  }
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = inventory(), count = (key, fn = (r) => r[key]) => rows.reduce((m, r) => ((m[fn(r)] = (m[fn(r)] ?? 0) + 1), m), {});
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
  else {
    for (const r of rows) console.log(`${r.file}:${r.line}  [${r.status}/${r.kind}]  ${r.name.slice(0, 90)}${r.why ? `   (${r.why})` : ''}`);
    console.log(`\n${rows.length} test cases assert on source text in ${new Set(rows.map((r) => r.file)).size} of ${testFiles().length} test files; by status ${JSON.stringify(count('status'))}; by kind ${JSON.stringify(count('kind'))}`);
  }
  const loose = rows.filter((r) => r.status === 'loose');
  if (process.argv.includes('--check') && loose.length) { console.error(`${loose.length} test case(s) assert on source text outside test/source-pins/ (move the pin there with a header line, or convert it to a behaviour test):\n${loose.map((r) => `  ${r.file}:${r.line} ${r.name.slice(0, 80)}`).join('\n')}`); process.exit(1); }
}
