import type { PluginManifest } from "./manifest";

/**
 * Plugin data tables ("collections"), the pure part: maps a collection's declared fields to the indexed
 * columns of plugin_record (i1–i4 text, n1–n2 numbers) and turns SDK filters into a Prisma `where`.
 * No database here, so it's unit-tested directly. The database side is records.ts.
 */

export type IndexColumn = "i1" | "i2" | "i3" | "i4";
export type NumberColumn = "n1" | "n2";
export type Column = IndexColumn | NumberColumn;

export interface CollectionSpec {
  name: string;
  columns: Map<string, Column>;
}

/** Max characters of a text index value (the column is VARCHAR(191)). */
export const MAX_INDEX_CHARS = 191;
/** Max size of one record's JSON. */
export const MAX_RECORD_BYTES = 64_000;
/** Max records per plugin per company (all collections together). */
export const MAX_RECORDS = 200_000;
export const MAX_FIND_LIMIT = 500;

/** Field names the platform owns on every record. */
export const SYSTEM_FIELDS = ["id", "createdAt", "updatedAt", "createdById"] as const;

export class RecordQueryError extends Error {}

export function collectionSpec(manifest: Pick<PluginManifest, "collections">, name: string): CollectionSpec {
  const c = manifest.collections.find((x) => x.name === name);
  if (!c) throw new RecordQueryError(`Collection "${name}" is not declared in manifest.collections`);
  const columns = new Map<string, Column>();
  c.indexes.forEach((f, i) => columns.set(f, `i${i + 1}` as IndexColumn));
  c.numbers.forEach((f, i) => columns.set(f, `n${i + 1}` as NumberColumn));
  return { name, columns };
}

const isNumberColumn = (c: Column): c is NumberColumn => c.startsWith("n");

/** A text index value: strings as-is, numbers/booleans as text, null/undefined/empty stays null. */
export function indexText(field: string, v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "object") throw new RecordQueryError(`Indexed field "${field}" must be text, a number or true/false`);
  const s = String(v);
  if (s.length > MAX_INDEX_CHARS) throw new RecordQueryError(`Indexed field "${field}" is longer than ${MAX_INDEX_CHARS} characters`);
  return s;
}

export function numberValue(field: string, v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new RecordQueryError(`Number field "${field}" must be a number`);
  return n;
}

/** The indexed column values for a record's data. */
export function indexColumns(spec: CollectionSpec, data: Record<string, unknown>) {
  const out: Partial<Record<IndexColumn, string | null> & Record<NumberColumn, number | null>> = {};
  for (const [field, col] of spec.columns) {
    if (isNumberColumn(col)) out[col] = numberValue(field, data[field]);
    else out[col] = indexText(field, data[field]);
  }
  return out;
}

/** Checks a record's data and returns it as plain JSON (system fields are stripped). */
export function cleanData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new RecordQueryError("A record must be an object");
  const json = JSON.stringify(data);
  if (json.length > MAX_RECORD_BYTES) throw new RecordQueryError(`A record is limited to ${MAX_RECORD_BYTES / 1000} KB`);
  const out = JSON.parse(json) as Record<string, unknown>;
  for (const f of SYSTEM_FIELDS) delete out[f];
  return out;
}

type Scalar = string | number | boolean | null;
export interface Condition {
  eq?: Scalar;
  ne?: Scalar;
  in?: Scalar[];
  gt?: Scalar;
  gte?: Scalar;
  lt?: Scalar;
  lte?: Scalar;
  startsWith?: string;
  contains?: string;
}
/** `{ stage: "won" }` or `{ value: { gte: 1000 } }`. Only declared index/number fields, plus `id`/`createdAt`. */
export type RecordWhere = Record<string, Scalar | Condition | undefined>;

const OPS = new Set(["eq", "ne", "in", "gt", "gte", "lt", "lte", "startsWith", "contains"]);

function columnFor(spec: CollectionSpec, field: string): Column | "id" | "createdAt" | "updatedAt" {
  if (field === "id" || field === "createdAt" || field === "updatedAt") return field;
  const col = spec.columns.get(field);
  if (!col) throw new RecordQueryError(`"${field}" can't be filtered or sorted: add it to indexes or numbers of collection "${spec.name}"`);
  return col;
}

/** SDK filter → Prisma where for plugin_record (scope fields are added by the caller). */
export function buildWhere(spec: CollectionSpec, where: RecordWhere = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [field, raw] of Object.entries(where)) {
    if (raw === undefined) continue;
    const col = columnFor(spec, field);
    const conv = (v: unknown): unknown => {
      if (v === null) return null;
      if (col === "createdAt" || col === "updatedAt") {
        const d = new Date(String(v));
        if (Number.isNaN(d.getTime())) throw new RecordQueryError(`"${field}" needs a date`);
        return d;
      }
      if (col === "id") return String(v);
      return isNumberColumn(col) ? numberValue(field, v) : indexText(field, v);
    };
    const cond: Condition = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : { eq: raw as Scalar };
    const f: Record<string, unknown> = {};
    for (const [op, v] of Object.entries(cond)) {
      if (!OPS.has(op)) throw new RecordQueryError(`Unknown filter "${op}" on "${field}"`);
      if (v === undefined) continue;
      if (op === "eq") f.equals = conv(v);
      else if (op === "ne") f.not = conv(v);
      else if (op === "in") {
        if (!Array.isArray(v) || v.length > 500) throw new RecordQueryError(`"in" on "${field}" needs a list of up to 500 values`);
        f.in = v.map(conv).filter((x) => x !== null);
      } else if (op === "startsWith" || op === "contains") {
        if (isNumberColumn(col as Column) || col === "createdAt" || col === "updatedAt") throw new RecordQueryError(`"${op}" only works on text fields`);
        f[op] = String(v).slice(0, MAX_INDEX_CHARS);
      } else f[op] = conv(v);
    }
    // { eq: null } → IS NULL
    out[col] = "equals" in f && f.equals === null && Object.keys(f).length === 1 ? null : f;
  }
  return out;
}

export type RecordOrder = string | { field: string; dir?: "asc" | "desc" };

/** "-value" / { field: "value", dir: "desc" } → Prisma orderBy (newest first by default, id breaks ties). */
export function buildOrder(spec: CollectionSpec, order?: RecordOrder | RecordOrder[]): Array<Record<string, "asc" | "desc">> {
  const list = order === undefined ? [] : Array.isArray(order) ? order : [order];
  const out = list.map((o) => {
    const { field, dir } = typeof o === "string" ? (o.startsWith("-") ? { field: o.slice(1), dir: "desc" as const } : { field: o, dir: "asc" as const }) : { field: o.field, dir: o.dir ?? "asc" };
    return { [columnFor(spec, field)]: dir };
  });
  if (!out.length) out.push({ createdAt: "desc" });
  out.push({ id: "asc" });
  return out;
}

export const clampFindLimit = (n: number | undefined) => Math.min(Math.max(1, Math.floor(n ?? 50)), MAX_FIND_LIMIT);
