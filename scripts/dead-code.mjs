// Dead-code report for src/: orphan modules (no file imports them, no text file names them) and unused exports
// (no other file imports the name), each with its evidence.  Static analysis only; nothing runs.
//   node scripts/dead-code.mjs                 -> report
//   node scripts/dead-code.mjs --json          -> machine-readable report
//   node scripts/dead-code.mjs --apply-exports [--skip=a.ts,b.ts] [--keep=regex] [--keep-sim]
//        -> drops `export` from names nothing imports (keeps the declaration when the file uses it itself) and deletes a
//           declaration nothing uses at all (function / type / interface / enum, or a const with a pure initializer)
// The import graph covers src/**, scripts/**, test/**, server/** (ts, js, mjs), index.html and the build's chunk entries
// (scripts/build.mjs names them).  Conservative on purpose: `export *`, a namespace import that escapes, a side-effect import
// and a dynamic import() count as using every export of the target; an orphan is kept (reported "referenced") when ANY text
// file outside dist/node_modules names its path or basename, or when a built-by-prefix string (template/concat head) could
// reach it.
import ts from 'typescript';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, basename } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');
const APPLY = argv.includes('--apply-exports');
const KEEP_SIM = argv.includes('--keep-sim');
const KEEP = new RegExp((argv.find((a) => a.startsWith('--keep=')) ?? '--keep=$^').slice(7), 'i');   // `file name` matching it is listed, never edited
const SKIP = new Set((argv.find((a) => a.startsWith('--skip=')) ?? '').slice(7).split(',').filter(Boolean));
const rel = (p) => relative(root, p).split('\\').join('/');

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'stills']);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name), st = statSync(p);
    if (st.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const CODE = /\.(ts|js|mjs)$/;
const TEXT = /\.(ts|js|mjs|json|md|yml|yaml|html|css|sql|txt|sh|toml|conf)$/;
const all = walk(root);
const codeFiles = all.filter((f) => CODE.test(f) && !f.endsWith('.d.ts'));
const srcFiles = codeFiles.filter((f) => rel(f).startsWith('src/'));
const textFiles = all.filter((f) => TEXT.test(f) && statSync(f).size < 4_000_000);
const textOf = new Map(textFiles.map((f) => [f, readFileSync(f, 'utf8')]));

function resolveSpec(from, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null;
  const base = resolve(dirname(from), spec);
  const stem = base.replace(/\.(js|mjs)$/, '');
  for (const c of [base, stem + '.ts', stem + '.js', stem + '.mjs', base + '.ts', base + '.js', base + '.mjs', base + '.json', join(base, 'index.ts'), join(base, 'index.js')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

// ---- parse every code file -------------------------------------------------------------------------------------------------
const importers = new Map();         // target file -> Set(importer file)
const uses = new Map();              // target file -> Map(name -> Set(importer))   ('*' = everything)
const exportsOf = new Map();         // file -> [{name, st, ...}]
const prefixes = new Set();          // static heads of template / concat strings that look like paths
const fwd = new Map();               // importer -> Set(target)
const addUse = (target, name, by) => {
  if (!fwd.has(by)) fwd.set(by, new Set());
  fwd.get(by).add(target);
  if (!importers.has(target)) importers.set(target, new Set());
  importers.get(target).add(by);
  if (!uses.has(target)) uses.set(target, new Map());
  const m = uses.get(target);
  if (!m.has(name)) m.set(name, new Set());
  m.get(name).add(by);
};
const sfOf = new Map();
for (const f of codeFiles) {
  const text = textOf.get(f) ?? readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, f.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  sfOf.set(f, sf);
  const nsAlias = new Map();         // local alias -> target file
  const visit = (n) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const t = resolveSpec(f, n.moduleSpecifier.text);
      if (t) {
        const c = n.importClause;
        if (!c) addUse(t, '*', f);                                            // side-effect import
        else {
          if (c.name) addUse(t, 'default', f);
          if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) nsAlias.set(c.namedBindings.name.text, t);
          else if (c.namedBindings) for (const e of c.namedBindings.elements) addUse(t, (e.propertyName ?? e.name).text, f);
        }
      }
    } else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      const t = resolveSpec(f, n.moduleSpecifier.text);
      if (t) {
        if (!n.exportClause || ts.isNamespaceExport(n.exportClause)) addUse(t, '*', f);
        else for (const e of n.exportClause.elements) addUse(t, (e.propertyName ?? e.name).text, f);
      }
    } else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const a = n.arguments[0];
      if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) { const t = resolveSpec(f, a.text); if (t) addUse(t, '*', f); }
      else if (a && ts.isTemplateExpression(a)) prefixes.add(a.head.text);
      else if (a && ts.isBinaryExpression(a) && ts.isStringLiteral(a.left)) prefixes.add(a.left.text);
    } else if (ts.isTemplateExpression(n) && /\//.test(n.head.text)) prefixes.add(n.head.text);
    else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken && ts.isStringLiteral(n.left) && /\//.test(n.left.text)) prefixes.add(n.left.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  // namespace aliases: `ns.name` is a named use; any other use of the alias is '*'
  if (nsAlias.size) {
    const visit2 = (n) => {
      if (ts.isIdentifier(n) && nsAlias.has(n.text) && !ts.isNamespaceImport(n.parent)) {
        const p = n.parent;
        if (ts.isPropertyAccessExpression(p) && p.expression === n) addUse(nsAlias.get(n.text), p.name.text, f);
        else addUse(nsAlias.get(n.text), '*', f);
      }
      ts.forEachChild(n, visit2);
    };
    visit2(sf);
  }
  // exports declared here (src only)
  if (rel(f).startsWith('src/')) {
    const exps = [];
    for (const st of sf.statements) {
      const mods = ts.canHaveModifiers(st) ? ts.getModifiers(st) : undefined;
      const isExp = mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      const isDef = mods?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      if (isExp) {
        if (ts.isVariableStatement(st)) { for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) exps.push({ name: d.name.text, st, decl: d, kind: 'const' }); else exps.push({ name: '<destructure>', st, kind: 'destructure', keep: true }); }
        else if (st.name) exps.push({ name: isDef ? 'default' : st.name.text, local: st.name.text, st, kind: ts.SyntaxKind[st.kind].replace('Declaration', '') });
        else if (isDef) exps.push({ name: 'default', st, kind: 'default', keep: true });
      } else if (ts.isExportDeclaration(st) && !st.moduleSpecifier && st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const e of st.exportClause.elements) exps.push({ name: e.name.text, local: (e.propertyName ?? e.name).text, st, spec: e, kind: 'list' });
      } else if (ts.isExportAssignment(st)) exps.push({ name: 'default', st, kind: 'default', keep: true });
    }
    exportsOf.set(f, exps);
  }
}
// index.html module scripts and build.mjs chunk entries are roots
const roots = new Set();
const html = readFileSync(join(root, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:src|href)=["']([^"']+\.(?:ts|js|mjs))["']/g)) { const t = resolveSpec(join(root, 'index.html'), m[1].startsWith('.') ? m[1] : './' + m[1]); if (t) roots.add(t); }
const buildSrc = readFileSync(join(root, 'scripts/build.mjs'), 'utf8');
for (const m of buildSrc.matchAll(/(src\/[\w./-]+\.(?:ts|js))/g)) { const t = join(root, m[1]); if (existsSync(t)) roots.add(t); }
for (const t of roots) addUse(t, '*', join(root, 'scripts/build.mjs'));
// Gate 0's harness loads a list of src/fight modules by a computed file URL (`[...names].map(mod)`): every export of those is in use
const harness = join(root, 'test/gate0/harness.mjs');
for (const m of readFileSync(harness, 'utf8').matchAll(/\[((?:'[\w-]+',?\s*)+)\]\.map\(mod\)/g)) {
  for (const n of m[1].matchAll(/'([\w-]+)'/g)) { const t = join(root, 'src/fight', n[1] + '.ts'); if (existsSync(t)) addUse(t, '*', harness); }
}

// The simulation: every file Gate 0's harness reaches (the modules it loads by computed URL and everything those import).  `--keep-sim`
// lists but never edits them: the sim files are frozen (Gate 0), and some carry documented test-setup API (forceSandbox).
const simFiles = new Set();
{
  const stack = [];
  for (const m of readFileSync(harness, 'utf8').matchAll(/\[((?:'[\w-]+',?\s*)+)\]\.map\(mod\)/g)) for (const n of m[1].matchAll(/'([\w-]+)'/g)) stack.push(join(root, 'src/fight', n[1] + '.ts'));
  while (stack.length) { const f = stack.pop(); if (simFiles.has(f) || !existsSync(f)) continue; simFiles.add(f); for (const t of fwd.get(f) ?? []) stack.push(t); }
}

// ---- orphans -----------------------------------------------------------------------------------------------------------------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const evidenceFor = (f) => {
  // a text file "names" the module when it carries the repo path (src/fight/x) or the last two segments (fight/x) or a relative
  // specifier ending in its basename ('./x', '../fight/x.ts')
  const r = rel(f), noExt = r.replace(/\.(ts|js|mjs)$/, ''), base = basename(noExt), dirBase = noExt.split('/').slice(-2).join('/');
  const re = new RegExp(`['"\`](?:\\.{1,2}/)+(?:[\\w.-]+/)*${esc(base)}(?:\\.(?:ts|js|mjs|json))?['"\`]`);
  const hits = [];
  for (const [tf, tx] of textOf) {
    if (tf === f) continue;
    if (tx.includes(noExt) || tx.includes(dirBase + '.') || tx.includes(dirBase + "'") || tx.includes(dirBase + '"') || re.test(tx)) hits.push(rel(tf));
  }
  // built-by-prefix strings (`../src/fight/${name}.ts`): listed per head so the callers can be read by hand
  // A head that is just a whole directory (`../src/`, `src/fight/`) reads files named by literals at its call sites (`src('fight/x.ts')`);
  // those literals are the text hits above, so a bare-directory head is not evidence on its own.
  const pre = [...prefixes].filter((p) => { const q = p.replace(/^(\.\.?\/)+/, ''); return q.length > 3 && ('/' + r).includes(q) && !(q.endsWith('/') && existsSync(join(root, q))); });
  return { hits, pre };
};
const orphans = [], referenced = [];
for (const f of srcFiles) {
  if (roots.has(f) || importers.get(f)?.size) continue;
  const { hits, pre } = evidenceFor(f);
  (hits.length || pre.length ? referenced : orphans).push({ file: rel(f), textRefs: hits, prefixSuspects: pre });
}

// ---- unused exports ----------------------------------------------------------------------------------------------------------
const unusedExports = [];
for (const [f, exps] of exportsOf) {
  const u = uses.get(f);
  if (u?.has('*')) continue;                   // side-effect / dynamic / star: all considered used
  if (!importers.get(f)?.size) continue;       // the whole file is an orphan: reported above
  const sf = sfOf.get(f);
  for (const e of exps) {
    if (u?.has(e.name)) continue;
    const local = e.local ?? e.name;
    let internal = 0;
    const visit = (n) => {
      if (ts.isIdentifier(n) && n.text === local) {
        const isDecl = (e.decl && e.decl.name === n) || (e.st.name === n) || (e.spec && (e.spec.name === n || e.spec.propertyName === n));
        if (!isDecl) internal++;
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    unusedExports.push({ file: rel(f), name: e.name, kind: e.kind, internalUses: internal, keep: !!e.keep, importers: importers.get(f).size });
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({ orphans, referenced, unusedExports, roots: [...roots].map(rel) }, null, 1));
} else if (!APPLY) {
  console.log(`ORPHAN MODULES (${orphans.length}): no file imports them and no text file names them`);
  for (const o of orphans) console.log(`  ${o.file}\n    evidence: 0 importers across src/scripts/test/server/index.html/build entries; 0 text references in any non-dist file; 0 built-by-prefix heads match`);
  console.log(`\nKEPT, unimported but referenced (${referenced.length})`);
  for (const o of referenced) console.log(`  ${o.file}\n    text refs: ${o.textRefs.slice(0, 6).join(', ') || '-'}   prefix heads: ${o.prefixSuspects.join(' ') || '-'}`);
  console.log(`\nUNUSED EXPORTS (${unusedExports.length}) across ${new Set(unusedExports.map((x) => x.file)).size} files`);
  for (const x of unusedExports) console.log(`  ${x.file}  ${x.name}  [${x.kind}; no importer names it (${x.importers} file(s) import the module); ${x.internalUses ? `used inside the file x${x.internalUses}: drop export only` : 'unused anywhere: delete'}]`);
}

// ---- apply: drop `export` / delete dead declarations (back to front so offsets stay valid) ---------------------------------
if (APPLY) {
  const byFile = new Map();
  for (const x of unusedExports) { if (SKIP.has(x.file) || x.keep || (KEEP_SIM && simFiles.has(join(root, x.file))) || KEEP.test(`${x.file} ${x.name}`)) continue; if (!byFile.has(x.file)) byFile.set(x.file, []); byFile.get(x.file).push(x); }
  let dropped = 0, deleted = 0;
  const PURE = (n) => !n || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isNumericLiteral(n) || ts.isStringLiteral(n) || ts.isArrayLiteralExpression(n) || ts.isObjectLiteralExpression(n) || ts.isNoSubstitutionTemplateLiteral(n) || n.kind === ts.SyntaxKind.TrueKeyword || n.kind === ts.SyntaxKind.FalseKeyword;
  for (const [file, xs] of byFile) {
    const f = join(root, file), sf = sfOf.get(f);
    let text = sf.getFullText();
    const edits = [];
    const exps = exportsOf.get(f);
    const listDone = new Set();
    for (const x of xs) {
      const e = exps.find((q) => q.name === x.name);
      if (e.kind === 'list') {
        if (listDone.has(e.st)) continue;
        listDone.add(e.st);
        const gone = new Set(xs.filter((q) => exps.find((r) => r.name === q.name)?.st === e.st).map((q) => q.name));
        const left = e.st.exportClause.elements.filter((s) => !gone.has(s.name.text));
        edits.push({ start: e.st.getStart(), end: e.st.getEnd(), repl: left.length ? `export { ${left.map((s) => s.getText()).join(', ')} };` : '', del: !left.length });
        dropped += gone.size;
        continue;
      }
      const st = e.st;
      const expMod = ts.getModifiers(st).find((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      const multiVar = e.decl && st.declarationList.declarations.length > 1;
      // `export const a = 1, b = 2;` shares one `export`: only dropped when every declarator in it is unused (else it stays whole)
      if (multiVar && !st.declarationList.declarations.every((d) => xs.some((q) => q.name === d.name.text))) continue;
      const declLike = e.decl ? PURE(e.decl.initializer) : /^(FunctionDeclaration|FunctionDeclaration|TypeAlias|Interface|Enum)$/.test(e.kind);
      const deletable = x.internalUses === 0 && !multiVar && declLike && !ts.getModifiers(st).some((m) => m.kind === ts.SyntaxKind.DeclareKeyword);
      if (deletable) { edits.push({ start: st.getStart(sf, true), end: st.getEnd(), repl: '', del: true }); deleted++; }
      else { edits.push({ start: expMod.getStart(), end: expMod.getEnd() + 1, repl: '' }); dropped++; }
    }
    // one `export const a = 1, b = 2;` statement yields one edit per declarator: apply the shared `export ` removal once
    for (let i = edits.length - 1; i >= 0; i--) if (edits.findIndex((q) => q.start === edits[i].start) !== i) edits.splice(i, 1);
    edits.sort((a, b) => b.start - a.start);
    for (const ed of edits) {
      let { start, end } = ed;
      if (ed.del) { if (text[end] === '\n') end++; while (text[end] === '\n' && text[start - 1] === '\n') end++; }
      text = text.slice(0, start) + ed.repl + text.slice(end);
    }
    writeFileSync(f, text);
  }
  console.log(`applied: dropped export on ${dropped}, deleted ${deleted} declaration(s) in ${byFile.size} file(s)`);
}
