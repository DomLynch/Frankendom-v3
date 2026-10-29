// The as-data gate, cheap version (Strategy's live-zone brief, 2026-10-27; ported in spirit from V1 scripts/as-data/check.ts, which needs
// ast-grep fetched through npx; this one is plain Node, no download, and runs in a second).
//   node scripts/as-data/check.mjs [--root <dir>] [--write-baseline]        (npm run check:as-data)
// A number, a label or a content id written in the code of the live-zone files, where it belongs in a data row, is a finding. Exit 1 on any
// new finding, a stale allow entry or a stale baseline count; exit 0 and one summary line otherwise.
//   NUMBER   any numeric literal other than 0 and 1 (a timer, cap, radius, count, range). Named exemptions, printed by count every run:
//            `Math.PI * 2` / `Math.PI / 2` style geometry, and 1000 beside * or / (ms <-> s).
//   LABEL    a string literal a player could read: two or more words, or a Capitalised word. Exempt: an import/export specifier and the
//            text inside console.*(...), new Error(...) and assert(...) (diagnostics are not game text).
//   COMPARE  `=== 'x'`, `!== 'x'`, `== 'x'`, `!= 'x'`, `case 'x':` against a string literal (a branch on a content id), other than a typeof result.
//   DATA-ID  any string literal equal to an id the zone rows and fight row declare (data/zones/*.json id / kind / alias / zone, data/fight.json
//            opponent, data/brains.json ids): the code names a thing the data already names.
// Scope: scripts/as-data/scope.json (globs). Allow-list: scripts/as-data/allow.json, one explicit row per file + kind + literal with a reason.
// Ratchet: scripts/as-data/baseline.json holds the counts already in files that were there before the gate (V1 donor code in src/fight/world*.ts,
// open-fight.ts); more of a literal than the baseline is NEW, fewer is a stale baseline that must come down in the same PR. New files start at zero.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REASON_MIN = 12;
export const EXEMPT_CATEGORIES = ['baked-geometry', 'vfx-table', 'asset-table'];   // a whole-file exemption names why the file is numbers by nature
/** The kind a hit is totalled under: a compare against an id-like string (a boss, move or event name) is its own `name-compare`, so it ratchets on its own. */
export const totalKind = (h) => (h.kind === 'compare' && /^[A-Za-z][\w:.-]*$/.test(h.literal) ? 'name-compare' : h.kind);
const TYPEOF =new Set(['undefined', 'object', 'string', 'number', 'boolean', 'function', 'symbol', 'bigint']);

// ---- the scanner: source text -> findings. Pure, so the test can point it at fixtures. -------------------------------------------------------

/** @returns {{kind: 'number'|'label'|'compare'|'data-id'|'exempt', literal: string, line: number}[]} (exempt: a named class counted, never a failure) */
export function scan(source, dataIds = new Set()) {
  const out = [];
  let i = 0, line = 1;
  const n = source.length;
  let prev = '';                       // the previous significant token (text), for regex-vs-divide, compare and typeof checks
  let prev2 = '';
  const diag = [];                     // stack of paren depths that opened a diagnostic call (console.x( / Error( / assert( )
  let depth = 0;
  const isDiag = () => diag.length > 0;
  const add = (kind, literal, at) => out.push({ kind, literal, line: at });
  const prevIsValue = () => /^(?:[\w$\])}]|['"`])/.test(prev) && !/^(?:return|typeof|case|of|in|new|delete|void|throw|else|do|yield|await)$/.test(prev);

  function stringLiteral(q) {          // i is on the opening quote; returns the raw text; handles escapes; a template's ${} is scanned as code
    const at = line; let text = ''; i++;
    while (i < n) {
      const c = source[i];
      if (c === '\\') { text += source[i + 1] ?? ''; if (source[i + 1] === '\n') line++; i += 2; continue; }
      if (c === '\n') line++;
      if (q === '`' && c === '$' && source[i + 1] === '{') {
        i += 2; let d = 1;
        const start = i, exprLine = line;
        while (i < n && d > 0) {       // find the matching brace (nested strings/templates inside are scanned by the recursive call below)
          const ch = source[i];
          if (ch === '{') d++; else if (ch === '}') { d--; if (d === 0) break; }
          else if (ch === '\n') line++;
          else if (ch === '"' || ch === '\'' || ch === '`') { skipRaw(ch); continue; }
          i++;
        }
        const inner = source.slice(start, i);
        for (const f of scan(inner, dataIds)) out.push({ ...f, line: f.line + exprLine - 1 });
        i++; text += ' '; continue;
      }
      if (c === q) { i++; break; }
      text += c; i++;
    }
    return { text, at };
  }
  function skipRaw(q) {                // step over a string inside a template's ${...} (the recursive scan of that text reports it)
    i++;
    while (i < n && source[i] !== q) {
      if (source[i] === '\\') i++;
      else if (source[i] === '\n') line++;
      else if (q === '`' && source[i] === '$' && source[i + 1] === '{') { i += 2; let d = 1; while (i < n && d) { if (source[i] === '{') d++; else if (source[i] === '}') d--; i++; } continue; }
      i++;
    }
    i++;
  }

  while (i < n) {
    const c = source[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && source[i + 1] === '/') { while (i < n && source[i] !== '\n') i++; continue; }
    if (c === '/' && source[i + 1] === '*') { i += 2; while (i < n && !(source[i] === '*' && source[i + 1] === '/')) { if (source[i] === '\n') line++; i++; } i += 2; continue; }
    if (c === '"' || c === '\'' || c === '`') {
      const { text, at } = stringLiteral(c);
      const importSpec = /^(?:from|import)$/.test(prev) || (prev === '(' && prev2 === 'import');
      if (!importSpec && !isDiag()) {
        const compare = /^(?:===|!==|==|!=|case)$/.test(prev) && !TYPEOF.has(text) && text !== '';
        if (compare) add('compare', text, at);
        if (dataIds.has(text)) add('data-id', text, at);
        else if (!compare && (/[A-Za-z]+\s+[A-Za-z]+/.test(text) || /^[A-Z][a-z]{2,}[.!?]?$/.test(text))) add('label', text, at);
      }
      prev2 = prev; prev = c === '`' ? '`' : '"x"';
      // a string followed by a comparison (`'x' === y`) is also a compare
      const rest = source.slice(i, i + 5).trimStart();
      if (!importSpec && !isDiag() && /^(?:===|!==|==(?!=)|!=(?!=))/.test(rest) && !TYPEOF.has(text) && text !== '' && !out.some((f) => f.kind === 'compare' && f.line === at && f.literal === text)) add('compare', text, at);
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
      const m = /^(?:0[xXbBoO][\da-fA-F_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)n?/.exec(source.slice(i));
      const raw = m[0], at = line; i += raw.length;
      const value = Number(raw.replace(/_/g, '').replace(/n$/, ''));
      const after = source.slice(i, i + 24).trimStart();
      if (value === 0 || value === 1) { /* the identity numbers */ }
      else if (prev === '*' && value === 2 && /Math\.PI\s*$/.test(source.slice(Math.max(0, i - raw.length - 14), i - raw.length).replace(/\*\s*$/, ''))) add('exempt', 'Math.PI * 2', at);
      else if (prev === '/' && value === 2 && /Math\.PI\s*$/.test(source.slice(Math.max(0, i - raw.length - 14), i - raw.length).replace(/\/\s*$/, ''))) add('exempt', 'Math.PI / 2', at);
      else if (value === 2 && /^[*/]\s*Math\.PI\b/.test(after)) add('exempt', '2 * Math.PI', at);
      else if (value === 1000 && (/^[*/]/.test(after) || prev === '*' || prev === '/')) add('exempt', '1000 ms<->s', at);
      else add('number', raw, at);
      prev2 = prev; prev = '0'; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[\w$]+/.exec(source.slice(i)); const word = m[0]; i += word.length;
      if ((word === 'Error' || word === 'assert') && /^\s*\(/.test(source.slice(i))) diag.push(depth + 1);
      if (word === 'console') { const mm = /^\s*\.\s*\w+\s*\(/.exec(source.slice(i)); if (mm) { diag.push(depth + 1); } }
      prev2 = prev; prev = word; continue;
    }
    if (c === '/' && !prevIsValue()) {   // a regex literal: skip it whole
      i++; let cls = false;
      while (i < n && (source[i] !== '/' || cls)) { if (source[i] === '\\') i++; else if (source[i] === '[') cls = true; else if (source[i] === ']') cls = false; i++; }
      i++; while (/[a-z]/.test(source[i] ?? '')) i++;
      prev2 = prev; prev = '/re/'; continue;
    }
    // operators and punctuation
    const op = /^(?:===|!==|==|!=|=>|<=|>=|&&|\|\||\?\?|\+\+|--|\*\*|<<|>>>?|[-+*/%&|^!~<>=?:;,.(){}[\]@#])/.exec(source.slice(i));
    const t = op ? op[0] : c; i += t.length;
    if (t === '(') depth++;
    else if (t === ')') { if (diag.length && diag[diag.length - 1] === depth) diag.pop(); depth--; }
    prev2 = prev; prev = t;
  }
  return out;
}

// ---- the runner ---------------------------------------------------------------------------------------------------------------------------

const arg = (name) => { const k = process.argv.indexOf(name); return k < 0 ? undefined : process.argv[k + 1]; };
const globToRe = (g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\0').replace(/\*/g, '[^/]*').replace(/\0/g, '.*')}$`);
const walk = (root, dir = '') => readdirSync(join(root, dir)).flatMap((f) => {
  if (f === 'node_modules' || f.startsWith('.')) return [];
  const rel = dir ? `${dir}/${f}` : f;
  return statSync(join(root, rel)).isDirectory() ? walk(root, rel) : /\.(ts|js|mjs)$/.test(f) ? [rel] : [];
});

/** The ids the data declares (zone rows, the fight row's opponent, the brain rows): code that spells one is naming data. */
export function dataIds(root) {
  const ids = new Set();
  const take = (v, key) => { if (typeof v === 'string' && v.length > 1 && /^[\w:.-]+$/.test(v) && /^(?:id|kind|alias|zone|opponent)$/.test(key)) ids.add(v); };
  const visit = (v, key = '') => { if (Array.isArray(v)) v.forEach((x) => visit(x, key)); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, k); else take(v, key); };
  const zones = join(root, 'data/zones');
  if (existsSync(zones)) for (const f of readdirSync(zones)) if (f.endsWith('.json')) visit(JSON.parse(readFileSync(join(zones, f), 'utf8')));
  const fight = join(root, 'data/fight.json');
  if (existsSync(fight)) { const j = JSON.parse(readFileSync(fight, 'utf8')); if (typeof j.opponent === 'string') ids.add(j.opponent); }
  const brains = join(root, 'data/brains.json');
  if (existsSync(brains)) for (const b of JSON.parse(readFileSync(brains, 'utf8')).brains ?? []) if (typeof b.id === 'string') ids.add(b.id);
  ids.delete('1'); ids.delete('0');
  return ids;
}

/** Run the gate over a tree. Returns { problems: string[], exempt: Record<string, number>, scanned: number, tally } (no process exit: the test calls it). */
export function run(root, { allowFile = join(HERE, 'allow.json'), baselineFile = join(HERE, 'baseline.json'), scopeFile = join(HERE, 'scope.json') } = {}) {
  const scopeJson = JSON.parse(readFileSync(scopeFile, 'utf8'));
  const scope = scopeJson.globs.map(globToRe);
  const excluded = (scopeJson.exclude ?? []).map(globToRe);
  const legacy = new Set(scopeJson.legacy ?? []);   // these files carry a per-literal baseline (`counts`); every other file carries a per-kind TOTAL (`totals`) or starts at zero
  const allowJson = existsSync(allowFile) ? JSON.parse(readFileSync(allowFile, 'utf8')) : {};
  const allow = allowJson.allow ?? [];
  const exemptFiles = allowJson.files ?? [];        // whole-file exemptions from one kind, each with a category and a reason
  const baseJson = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : {};
  const rawBase = baseJson.counts ?? {};
  const totalsBase = baseJson.totals ?? {};
  const base = Object.fromEntries(Object.entries(rawBase).filter(([f]) => legacy.has(f)));
  const problems = [];
  for (const e of exemptFiles) {
    if (!e.file || !e.kind) problems.push(`exempt file row needs file and kind: ${JSON.stringify(e)}`);
    if (!e.reason || e.reason.trim().length < REASON_MIN) problems.push(`exempt file ${e.file} ${e.kind} needs a real reason (${REASON_MIN}+ characters)`);
    if (!e.category || !EXEMPT_CATEGORIES.includes(e.category)) problems.push(`exempt file ${e.file} ${e.kind} needs a category tag, one of: ${EXEMPT_CATEGORIES.join(', ')}`);
  }
  for (const a of allow) {
    if (!a.file || !a.kind || a.literal === undefined) problems.push(`allow entry needs file, kind and literal: ${JSON.stringify(a)}`);
    if (!a.reason || a.reason.trim().length < REASON_MIN) problems.push(`allow entry ${a.file} ${a.kind} ${a.literal} needs a real reason (${REASON_MIN}+ characters)`);
  }
  const ids = dataIds(root);
  const files = walk(root, 'src').filter((f) => scope.some((re) => re.test(f)) && !excluded.some((re) => re.test(f))).sort();
  const used = new Set(), usedExempt = new Set(), exempt = {}, tally = {}, measured = {}, areas = {};
  const area = (f) => { const p = f.split('/'); return p.length > 2 ? p[1] : 'src-top'; };
  const A = (f) => (areas[area(f)] ??= { files: 0, hits: {}, baselined: 0, allowed: 0, exempt: 0, new: 0 });
  for (const f of files) {
    const a = A(f); a.files++;
    const found = scan(readFileSync(join(root, f), 'utf8'), ids);
    const counts = {}, kinds = {};
    const newHits = [];
    for (const h of found) {
      if (h.kind === 'exempt') { exempt[h.literal] = (exempt[h.literal] ?? 0) + 1; continue; }
      const k2 = totalKind(h);
      a.hits[k2] = (a.hits[k2] ?? 0) + 1;
      const ex = exemptFiles.findIndex((e) => e.file === f && e.kind === h.kind);
      if (ex >= 0) { usedExempt.add(ex); a.exempt++; continue; }
      const entry = allow.findIndex((r) => r.file === f && (r.kind === h.kind || r.kind === k2) && String(r.literal) === h.literal);
      if (entry >= 0) { used.add(entry); a.allowed++; continue; }
      const key = `${h.kind}:${h.literal}`;
      counts[key] = (counts[key] ?? 0) + 1;
      kinds[k2] = (kinds[k2] ?? 0) + 1;
      if (legacy.has(f)) {
        if (counts[key] > (base[f]?.[key] ?? 0)) { problems.push(`${f}:${h.line} ${h.kind} ${JSON.stringify(h.literal)} belongs in a data row (or add an allow row with a reason)`); a.new++; } else a.baselined++;
      } else newHits.push(h);
    }
    if (Object.keys(counts).length) tally[f] = counts;
    if (!legacy.has(f) && Object.keys(kinds).length) measured[f] = kinds;
    if (legacy.has(f)) for (const [key, was] of Object.entries(base[f] ?? {})) if ((counts[key] ?? 0) < was) problems.push(`${f}: baseline says ${was} x ${key}, the file has ${counts[key] ?? 0}: lower scripts/as-data/baseline.json in this PR (npm run check:as-data -- --write-baseline)`);
    if (!legacy.has(f)) {          // the per-file TOTAL ratchet: a count may only go down
      const tb = totalsBase[f] ?? {};
      for (const k of new Set([...Object.keys(tb), ...Object.keys(kinds)])) {
        const now = kinds[k] ?? 0, was = tb[k] ?? 0;
        a.baselined += Math.min(now, was);
        if (now > was) {
          a.new += now - was;
          const lines = newHits.filter((h) => totalKind(h) === k).map((h) => h.line);
          if (was === 0) { for (const h of newHits.filter((x) => totalKind(x) === k)) problems.push(`${f}:${h.line} ${h.kind} ${JSON.stringify(h.literal)} belongs in a data row (or add an allow row with a reason)`); continue; }
          problems.push(`${f}: ${k} count ${now} is over the baseline ${was} (new hit(s) near line ${lines.slice(-(now - was)).join(', ')}): put the value in a data row, or add an allow row with a reason`);
        } else if (now < was) problems.push(`${f}: baseline says ${was} x ${k}, the file has ${now}: lower scripts/as-data/baseline.json in this PR (npm run check:as-data -- --write-baseline)`);
      }
    }
  }
  allow.forEach((r, k) => { if (!used.has(k) && files.includes(r.file)) problems.push(`stale allow entry ${r.file} ${r.kind} ${r.literal}: nothing matches it any more, delete the row`); else if (!files.includes(r.file)) problems.push(`stale allow entry ${r.file} ${r.kind} ${r.literal}: the file is not in scope or is gone`); });
  exemptFiles.forEach((e, k) => { if (!usedExempt.has(k)) problems.push(`stale exempt file ${e.file} ${e.kind}: the file has no ${e.kind} hit (or is not in scope), delete the row`); });
  for (const f of Object.keys(rawBase)) if (!legacy.has(f) || !files.includes(f)) problems.push(`baseline names ${f}, which is not a scanned legacy file (scope.json legacy): delete its baseline row`);
  for (const f of Object.keys(totalsBase)) if (legacy.has(f) || !files.includes(f)) problems.push(`baseline totals name ${f}, which is gone, out of scope or a per-literal legacy file: delete its totals row`);
  // BACKLOG: allow rows whose reason starts with DEFERRED are tuning or player text still in code. They are counted apart, may only shrink (the recorded count in baseline.json `backlog`), target 0.
  const backlog = allow.filter((a) => isBacklog(a)).length, backlogBase = Number.isInteger(baseJson.backlog) ? baseJson.backlog : 0;
  if (backlog > backlogBase) problems.push(`backlog: ${backlog} DEFERRED allow row(s), the baseline says ${backlogBase}: a DEFERRED row cannot be added, move the value into a data row (or give the row a plain non-DEFERRED reason if it is not tuning)`);
  else if (backlog < backlogBase) problems.push(`backlog: baseline says ${backlogBase} DEFERRED allow row(s), there are ${backlog}: lower scripts/as-data/baseline.json in this PR (npm run check:as-data -- --write-baseline)`);
  return { problems, exempt, scanned: files.length, tally, legacy, measured, areas, backlog };
}

/** An allow row whose reason starts with DEFERRED: a value that belongs in a data row and has not moved yet. */
export const isBacklog = (row) => /^DEFERRED\b/.test(String(row?.reason ?? '').trim());

/** The summary table, one row per area: files, hits by kind, and how each hit is covered. */
export function summaryTable(r) {
  const KINDS = ['number', 'label', 'compare', 'name-compare', 'data-id'];
  const head = ['area', 'files', ...KINDS, 'baselined', 'allowed', 'exempt', 'new'];
  const rows = Object.entries(r.areas).sort(([x], [y]) => x.localeCompare(y)).map(([n, a]) => [n, a.files, ...KINDS.map((k) => a.hits[k] ?? 0), a.baselined, a.allowed, a.exempt, a.new]);
  const sum = rows.reduce((t, row) => row.map((v, i) => (i === 0 ? 'total' : (t[i] ?? 0) + v)), []);
  const all = [head, ...rows, sum].map((row) => row.map(String));
  const w = head.map((_, i) => Math.max(...all.map((row) => row[i].length)));
  return all.map((row) => row.map((c, i) => (i === 0 ? c.padEnd(w[i]) : c.padStart(w[i]))).join('  ')).join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(arg('--root') ?? join(HERE, '..', '..'));
  if (process.argv.includes('--write-baseline')) {
    // lowers the backlog only: refuses while anything is new (a new site is fixed or allow-listed with a reason, never blessed here)
    const file = join(HERE, 'baseline.json');
    const oldJson = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    const old = oldJson?.counts ?? null, oldTotals = oldJson?.totals ?? {};
    const before = run(root);
    const counts = Object.fromEntries(Object.entries(before.tally).filter(([f]) => before.legacy.has(f)));
    const totals = before.measured;
    const grown = [
      ...(old ? Object.entries(counts).flatMap(([f, c]) => Object.entries(c).filter(([k, v]) => v > (old[f]?.[k] ?? 0)).map(([k]) => `${f} ${k}`)) : []),
      ...Object.entries(totals).flatMap(([f, c]) => Object.entries(c).filter(([k, v]) => v > (oldTotals[f]?.[k] ?? 0)).map(([k]) => `${f} ${k}`)),
    ];
    const oldBacklog = Number.isInteger(oldJson?.backlog) ? oldJson.backlog : null;
    if (oldBacklog !== null && before.backlog > oldBacklog) grown.push(`backlog ${before.backlog} > ${oldBacklog}`);
    if (grown.length) { console.error(`as-data: not writing the baseline, the baseline only shrinks; new sites:\n${grown.slice(0, 10).join('\n')}`); process.exit(1); }
    writeFileSync(file, `${JSON.stringify({ about: 'Counts already in the legacy files (V1 donor code that existed before the gate; scope.json legacy): per literal. More of a literal than this is new; fewer must come down here. Only ever shrinks.', counts, backlog_about: 'Count of allow.json rows whose reason starts with DEFERRED (a value that belongs in a data row and has not moved yet). Shrink-only, target 0.', backlog: before.backlog, totals_about: oldJson?.totals_about ?? '', totals }, null, 1)}\n`);
    console.log(`as-data: wrote ${relative(root, file)} (${Object.keys(counts).length} per-literal files, ${Object.keys(totals).length} total-ratchet files)`);
    process.exit(0);
  }
  const r = run(root);
  const ex = Object.entries(r.exempt).map(([k, v]) => `${k} x${v}`).join(', ') || 'none';
  console.log(summaryTable(r));
  if (r.problems.length) { console.error(`as-data: ${r.problems.length} problem(s) in ${r.scanned} scanned file(s):\n${r.problems.slice(0, 60).join('\n')}${r.problems.length > 60 ? `\n... and ${r.problems.length - 60} more` : ''}`); process.exit(1); }
  console.log(`as-data: backlog ${r.backlog} DEFERRED allow row(s) (shrink-only, target 0)`);
  console.log(`as-data: ${r.scanned} file(s) at or under their baseline (named exemptions: ${ex})`);
}
