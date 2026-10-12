// The shared registry loader. A table is rows plus a manifest beside them (key field, required fields with their types, refs: field -> table).
// The loader is generic over the manifest, so a new table is manifest + rows with no loader change. The same code is the data gate (scripts/registry-check.mjs
// reports every problem as file:row:id + the rule broken) and the runtime load (loadRegistry throws, never last-wins). Duplicate id, unknown ref, missing required
// field and wrong type all reject; nothing is a warning. No TypeScript id unions come out of a table: ids stay strings, checked against the loaded rows.
export type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'any';
export type Manifest = {
  table: string;
  file?: string;                      // rows file, relative to the manifest (omitted on a derived table)
  at?: string;                        // property of the file holding the rows (dotted); omitted = the file is the array
  keyed?: boolean;                    // rows are an object {id: fields}; the key becomes the row's key field
  from?: string;                      // a derived table: one row per value at `fan` in each row of table `from`, {[key]: value, from: <source row id>}
  fan?: string;
  key: string;                        // the id field
  required: Record<string, FieldType>;  // field path -> type; `a.b` descends, `a[]` checks every element
  refs?: Record<string, string>;        // field path -> table whose ids the value (or each element) must be
};
export type TableData = { manifest: Manifest; rows: readonly Record<string, unknown>[]; file?: string };
export type Problem = { file: string; row: number; id: string; rule: 'duplicate-id' | 'unknown-ref' | 'missing-field' | 'wrong-type' | 'bad-key' | 'bad-manifest'; message: string };
export type Registry = { ids: ReadonlyMap<string, ReadonlySet<string>>; rows: ReadonlyMap<string, ReadonlyMap<string, Record<string, unknown>>> };

export class RegistryError extends Error {
  readonly problems: readonly Problem[];
  constructor(problems: readonly Problem[]) {
    super(problems.map((p) => `${p.file}:${p.row}:${p.id} ${p.rule}: ${p.message}`).join('\n'));
    this.name = 'RegistryError';
    this.problems = problems;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
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
    if (ids.has(t.manifest.table) && !rows.has(t.manifest.table)) problems.push({ file: fileOf(t), row: -1, id: t.manifest.table, rule: 'bad-manifest', message: `table "${t.manifest.table}" is also an external id set` });
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
    const { required, refs = {}, table } = t.manifest, file = fileOf(t);
    for (const [field, to] of Object.entries(refs)) if (!ids.has(to)) problems.push({ file, row: -1, id: table, rule: 'bad-manifest', message: `${field} refs table "${to}", which is not registered` });
    t.rows.forEach((row, i) => {
      if (!isObj(row)) { problems.push({ file, row: i, id: '?', rule: 'wrong-type', message: 'a row must be an object' }); return; }
      const id = typeof row[t.manifest.key] === 'string' ? (row[t.manifest.key] as string) : '?';
      for (const [field, type] of Object.entries(required)) {
        for (const v of valuesAt(row, field)) {
          if (v === undefined) problems.push({ file, row: i, id, rule: 'missing-field', message: `${field} is required` });
          else if (!typeOk(v, type)) problems.push({ file, row: i, id, rule: 'wrong-type', message: `${field} must be ${type}` });
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
