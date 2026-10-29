// One typed door for *-defs.json rows (audit 18). A rows file is parsed JSON, so TypeScript sees `string` where a manifest wants a FieldType and `unknown` where a row wants its fields;
// the 50-odd loaders each papered over that with `as unknown as Manifest` / `.rows as unknown as {...}[]`. The cast now lives here, once, and what stands behind it is the registry's own gate
// (src/core/registry.ts): required fields, types, ranges, refs and duplicate ids are checked before any row is handed out, and a failure names `file:row:id rule: message`.
//   const T = tableOf(MANIFEST.tables[0], DEFS, 'x-defs.json');                                    // a table; loadRegistry([T, ...]) validates it with its siblings
//   const ROWS = loadRows<{ id: string; value: number }>(MANIFEST.tables[0], DEFS, 'x-defs.json');  // a table with no refs to a sibling: validated, typed and frozen in one call
//   const rows = rowsOf<{ id: string; value: number }>(T);                                        // the typed rows of a table already built
// No behaviour of its own: the rows are the very objects the registry reads, in file order.
import { loadRegistry, tableFromFile, type Manifest, type TableData } from './registry.ts';

type RowShape = Record<string, unknown>;

/** The manifest entry and its parsed rows file as a table (not yet validated: hand it to loadRegistry, or use loadRows). */
export const tableOf = (manifest: object, parsed: unknown, file?: string): TableData => tableFromFile(manifest as Manifest, parsed, file);

/** The rows of a table, typed by the caller (the table's manifest, checked by loadRegistry, is the truth behind the type). */
export const rowsOf = <R extends RowShape = RowShape>(table: Pick<TableData, 'rows'>): readonly R[] => table.rows as readonly R[];

/** One table, validated and frozen. Throws RegistryError naming the file, row, id and the rule broken. For a table that refs a sibling, build both with tableOf and validate them in one loadRegistry call. */
export function loadRows<R extends RowShape = RowShape>(manifest: object, parsed: unknown, file?: string): readonly Readonly<R>[] {
  const table = tableOf(manifest, parsed, file);
  loadRegistry([table]);
  return Object.freeze([...rowsOf<R>(table)]);
}
