// The shared registry loader. A table is rows plus a manifest beside them (key field, required fields with their types, refs: field -> table).
// The loader is generic over the manifest, so a new table is manifest + rows with no loader change. The same code is the data gate (scripts/registry-check.mjs
// reports every problem as file:row:id + the rule broken) and the runtime load (loadRegistry throws, never last-wins). Duplicate id, unknown ref, missing required
// field and wrong type all reject; nothing is a warning. No TypeScript id unions come out of a table: ids stay strings, checked against the loaded rows.
export type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'any';
// A field is its type ('integer') or the type with the range the game allows ({ type: 'integer', min: 1, max: 99 }). min and max are inclusive and only for number and integer fields;
// the loader refuses an out-of-range row with file:row:id, so the manifest, not a hand-written check beside the loader, is where a limit lives.
export type FieldSpec = FieldType | { type: FieldType; min?: number; max?: number };
export type Manifest = {
  table: string;
  file?: string;                      // rows file, relative to the manifest (omitted on a derived table)
  at?: string;                        // property of the file holding the rows (dotted); omitted = the file is the array
  keyed?: boolean;                    // rows are an object {id: fields}; the key becomes the row's key field
  from?: string;                      // a derived table: one row per value at `fan` in each row of table `from`, {[key]: value, from: <source row id>}
  fan?: string;
  key: string;                        // the id field
  required: Record<string, FieldSpec>;  // field path -> type (or type + min/max); `a.b` descends, `a[]` checks every element
  optional?: Record<string, FieldSpec>; // field path -> type (or type + min/max), checked only when the field is present (absent = fine)
  unique?: string[];                    // field paths whose present values must differ between rows of this table
  refs?: Record<string, string>;        // field path -> table whose ids the value (or each element) must be
};
export type TableData = { manifest: Manifest; rows: readonly Record<string, unknown>[]; file?: string };
export type Problem = { file: string; row: number; id: string; rule: 'duplicate-id' | 'unknown-ref' | 'missing-field' | 'wrong-type' | 'out-of-range' | 'duplicate-value' | 'bad-key' | 'bad-manifest'; message: string };
export type Registry = { ids: ReadonlyMap<string, ReadonlySet<string>>; rows: ReadonlyMap<string, ReadonlyMap<string, Record<string, unknown>>> };

export class RegistryError extends Error {
  readonly problems: readonly Problem[];
  constructor(problems: readonly Problem[]) {
    super(problems.map((p) => `${p.file}:${p.row}:${p.id} ${p.rule}: ${p.message}`).join('\n'));
    this.name = 'RegistryError';
    this.problems = problems;
  }
}

// A problem with the manifest itself rather than a row: it has no row number.
const manifestProblem = (file: string, id: string, message: string): Problem => ({ file, row: -1, id, rule: 'bad-manifest', message });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
// One value against a field spec: the type first, then the range (a wrong type is never also reported out of range). Returns the broken rule's message, or null.
function specProblem(v: unknown, field: string, spec: FieldSpec): { rule: 'wrong-type' | 'out-of-range'; message: string } | null {
  const type = typeof spec === 'string' ? spec : spec.type;
  if (!typeOk(v, type)) return { rule: 'wrong-type', message: `${field} must be ${type}` };
  if (typeof spec === 'string' || (spec.min === undefined && spec.max === undefined)) return null;
  const n = v as number;
  if ((spec.min !== undefined && n < spec.min) || (spec.max !== undefined && n > spec.max)) {
    return { rule: 'out-of-range', message: `${field} = ${n} is outside ${spec.min ?? '-inf'}..${spec.max ?? 'inf'}` };
  }
  return null;
}
const typeOk = (v: unknown, t: FieldType): boolean =>
  t === 'any' ? true : t === 'integer' ? Number.isInteger(v) : t === 'number' ? typeof v === 'number' && Number.isFinite(v)
  : t === 'array' ? Array.isArray(v) : t === 'object' ? isObj(v) : typeof v === t;

// Values at a path: `a.b` descends objects, `a[]` fans out over an array. `undefined` marks a missing leaf.
function valuesAt(value: unknown, path: string): unknown[] {
  let cur: unknown[] = [value];
  for (const seg of path.split('.')) {
    const fan = seg.endsWith('[]'), name = fan ? seg.slice(0, -2) : seg, next: unknown[] = [];
    for (const c of cur) {
      const v = isObj(c) && Object.hasOwn(c, name) ? c[name] : undefined;
      if (fan) { if (Array.isArray(v)) next.push(...v); else next.push(undefined); } else next.push(v);
    }
    cur = next;
  }
  return cur;
}

// Rows of a keyed table ({smith: {...}}) become ordinary rows ({id: 'smith', ...}).
export const keyedRows = (obj: Record<string, unknown>, key = 'id'): Record<string, unknown>[] =>
  Object.entries(obj).map(([k, v]) => ({ [key]: k, ...(isObj(v) ? v : {}) }));

// A derived table (manifest.from + fan): the link a row carries to other ids, made checkable. `rolledBy: [creature, ...]` on a loot row becomes
// {id: creature, loottable: <row id>} rows, so one creature in two rows is a duplicate-id like any other, and each end is a ref.
export function deriveRows(manifest: Manifest, source: TableData): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const row of source.rows) if (isObj(row)) for (const v of valuesAt(row, manifest.fan ?? '')) if (v !== undefined) out.push({ [manifest.key]: v, [manifest.from ?? 'from']: row[source.manifest.key] });
  return out;
}

export function checkTables(tables: readonly TableData[], external: Readonly<Record<string, Iterable<string>>> = {}): { problems: Problem[]; registry: Registry } {
  const problems: Problem[] = [], ids = new Map<string, Set<string>>(), rows = new Map<string, Map<string, Record<string, unknown>>>();
  const fileOf = (t: TableData): string => t.file ?? t.manifest.file ?? t.manifest.table;
  for (const [name, set] of Object.entries(external)) ids.set(name, new Set(set));
  for (const t of tables) {
    if (ids.has(t.manifest.table) && !rows.has(t.manifest.table)) problems.push(manifestProblem(fileOf(t), t.manifest.table, `table "${t.manifest.table}" is also an external id set`));
    ids.set(t.manifest.table, new Set()); rows.set(t.manifest.table, new Map());
  }
  // Pass 1: keys and uniqueness. A table's ids exist before any ref is resolved, so tables may point at each other.
  for (const t of tables) {
    const { key, table } = t.manifest, file = fileOf(t), seen = rows.get(table)!;
    t.rows.forEach((row, i) => {
      const id = isObj(row) ? row[key] : undefined;
      if (typeof id !== 'string' || id === '') { problems.push({ file, row: i, id: String(id), rule: 'bad-key', message: `key field "${key}" must be a non-empty string` }); return; }
      if (seen.has(id)) { problems.push({ file, row: i, id, rule: 'duplicate-id', message: `"${id}" is already row ${[...seen.keys()].indexOf(id)} of ${table}` }); return; }
      seen.set(id, row); ids.get(table)!.add(id);
    });
  }
  // Pass 2: required fields, types, refs.
  for (const t of tables) {
    const { required, optional = {}, unique = [], refs = {}, table } = t.manifest, file = fileOf(t), claimed = new Map<string, Map<string, string>>(unique.map((f) => [f, new Map()]));
    for (const [field, to] of Object.entries(refs)) if (!ids.has(to)) problems.push(manifestProblem(file, table, `${field} refs table "${to}", which is not registered`));
    for (const [field, spec] of [...Object.entries(required), ...Object.entries(optional)]) {
      if (typeof spec === 'string') continue;
      const ranged = spec.min !== undefined || spec.max !== undefined;
      if (ranged && spec.type !== 'number' && spec.type !== 'integer') problems.push(manifestProblem(file, table, `${field}: min/max need a number or integer field, not ${spec.type}`));
      else if (spec.min !== undefined && spec.max !== undefined && spec.min > spec.max) problems.push(manifestProblem(file, table, `${field}: min ${spec.min} is above max ${spec.max}`));
    }
    t.rows.forEach((row, i) => {
      if (!isObj(row)) { problems.push({ file, row: i, id: '?', rule: 'wrong-type', message: 'a row must be an object' }); return; }
      const id = typeof row[t.manifest.key] === 'string' ? (row[t.manifest.key] as string) : '?';
      for (const [field, spec] of Object.entries(required)) {
        for (const v of valuesAt(row, field)) {
          if (v === undefined) { problems.push({ file, row: i, id, rule: 'missing-field', message: `${field} is required` }); continue; }
          const bad = specProblem(v, field, spec);
          if (bad) problems.push({ file, row: i, id, ...bad });
        }
      }
      for (const [field, spec] of Object.entries(optional)) {
        for (const v of valuesAt(row, field)) {
          const bad = v === undefined ? null : specProblem(v, field, spec);
          if (bad) problems.push({ file, row: i, id, ...bad });
        }
      }
      for (const [field, owners] of claimed) {
        for (const v of valuesAt(row, field)) {
          if (v === undefined) continue;
          const k = JSON.stringify(v), first = owners.get(k);
          if (first !== undefined) problems.push({ file, row: i, id, rule: 'duplicate-value', message: `${field} ${k} is already on ${first}` });
          else owners.set(k, id);
        }
      }
      for (const [field, to] of Object.entries(refs)) {
        const target = ids.get(to);
        if (!target) continue;
        for (const v of valuesAt(row, field)) {
          if (v === undefined) continue;   // absence is the required rule's business
          if (typeof v !== 'string' || !target.has(v)) problems.push({ file, row: i, id, rule: 'unknown-ref', message: `${field} = ${JSON.stringify(v)} is not a ${to} id` });
        }
      }
    });
  }
  return { problems, registry: { ids, rows } };
}

// Runtime load: any problem throws, so nothing is ever last-wins or silently dropped.
export function loadRegistry(tables: readonly TableData[], external: Readonly<Record<string, Iterable<string>>> = {}): Registry {
  const { problems, registry } = checkTables(tables, external);
  if (problems.length) throw new RegistryError(problems);
  return registry;
}

// Rows of a manifest out of its parsed rows file (the gate and the runtime both use this, so they read a file the same way).
export function tableFromFile(manifest: Manifest, parsed: unknown, file?: string): TableData {
  let cur: unknown = parsed;
  if (manifest.at) for (const seg of manifest.at.split('.')) cur = isObj(cur) ? cur[seg] : undefined;
  const rows = manifest.keyed ? (isObj(cur) ? keyedRows(cur, manifest.key) : []) : Array.isArray(cur) ? (cur as Record<string, unknown>[]) : [];
  return { manifest, rows, file: file ?? manifest.file ?? manifest.table };
}

// Every table of a set of manifests, plain ones from their parsed rows files and derived ones (manifest.from) from their source table.
export function buildTables(entries: readonly { manifest: Manifest; parsed?: unknown; file?: string }[]): TableData[] {
  const out = entries.map((e) => (e.manifest.from ? undefined : tableFromFile(e.manifest, e.parsed, e.file)));
  return entries.map((e, i) => {
    if (out[i]) return out[i]!;
    const source = out.find((t) => t?.manifest.table === e.manifest.from);
    return { manifest: e.manifest, rows: source ? deriveRows(e.manifest, source) : [], file: e.file ?? source?.file ?? e.manifest.file };
  });
}
