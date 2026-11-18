import "server-only";
import type { Prisma, PluginRecord } from "@/generated/prisma/client";
import { db } from "../db";
import type { PluginManifest } from "./manifest";
import {
  buildOrder,
  buildWhere,
  clampFindLimit,
  cleanData,
  collectionSpec,
  indexColumns,
  MAX_RECORDS,
  RecordQueryError,
  type CollectionSpec,
  type RecordOrder,
  type RecordWhere,
} from "./record-query";

/**
 * Plugin data tables (ctx.db.collection(name)): records scoped to one plugin and one company. Fields
 * declared in manifest.collections[].indexes/numbers are copied into indexed columns, so they can be
 * filtered, sorted and summed; everything else lives in the record's JSON.
 */

export type StoredRecord<T = Record<string, unknown>> = T & { id: string; createdAt: string; updatedAt: string; createdById: string | null };

export interface FindOptions {
  where?: RecordWhere;
  /** "field" ascending, "-field" descending, or a list. Default: newest first. */
  orderBy?: RecordOrder | RecordOrder[];
  limit?: number;
  offset?: number;
}

export interface Collection<T = Record<string, unknown>> {
  insert(data: T): Promise<StoredRecord<T>>;
  get(id: string): Promise<StoredRecord<T> | null>;
  /** Merges `patch` into the record (a field set to null is kept as null). */
  update(id: string, patch: Partial<T>): Promise<StoredRecord<T>>;
  replace(id: string, data: T): Promise<StoredRecord<T>>;
  delete(id: string): Promise<boolean>;
  deleteMany(where: RecordWhere): Promise<number>;
  find(opts?: FindOptions): Promise<Array<StoredRecord<T>>>;
  findOne(where: RecordWhere): Promise<StoredRecord<T> | null>;
  count(where?: RecordWhere): Promise<number>;
  /** Sum of a number field (0 when nothing matches). */
  sum(field: string, where?: RecordWhere): Promise<number>;
}

export interface PluginDb {
  collection<T = Record<string, unknown>>(name: string): Collection<T>;
}

const toRecord = <T,>(r: PluginRecord): StoredRecord<T> =>
  ({ ...(r.data as Record<string, unknown>), id: r.id, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), createdById: r.createdById }) as StoredRecord<T>;

export function pluginDb(scope: { pluginId: string; companyId: string; manifest: Pick<PluginManifest, "collections">; userId?: string | null }): PluginDb {
  const { pluginId, companyId } = scope;
  return {
    collection<T = Record<string, unknown>>(name: string): Collection<T> {
      const spec: CollectionSpec = collectionSpec(scope.manifest, name);
      const base = { pluginId, companyId, collection: name };
      const where = (w?: RecordWhere) => ({ ...buildWhere(spec, w), ...base }) as Prisma.PluginRecordWhereInput;
      const write = (data: unknown) => {
        const clean = cleanData(data);
        return { data: clean as Prisma.InputJsonValue, ...indexColumns(spec, clean) };
      };
      const existing = async (id: string) => {
        const r = await db.pluginRecord.findFirst({ where: { id: String(id), ...base } });
        if (!r) throw new RecordQueryError(`${name} record "${id}" not found`);
        return r;
      };
      return {
        async insert(data) {
          const total = await db.pluginRecord.count({ where: { pluginId, companyId } });
          if (total >= MAX_RECORDS) throw new RecordQueryError(`This plugin has reached its limit of ${MAX_RECORDS.toLocaleString("en-IN")} records for this company`);
          return toRecord<T>(await db.pluginRecord.create({ data: { ...base, ...write(data), createdById: scope.userId ?? null } }));
        },
        async get(id) {
          const r = await db.pluginRecord.findFirst({ where: { id: String(id), ...base } });
          return r ? toRecord<T>(r) : null;
        },
        async update(id, patch) {
          const r = await existing(id);
          const merged = { ...(r.data as Record<string, unknown>), ...cleanData(patch) };
          return toRecord<T>(await db.pluginRecord.update({ where: { id: r.id }, data: write(merged) }));
        },
        async replace(id, data) {
          const r = await existing(id);
          return toRecord<T>(await db.pluginRecord.update({ where: { id: r.id }, data: write(data) }));
        },
        async delete(id) {
          return (await db.pluginRecord.deleteMany({ where: { id: String(id), ...base } })).count > 0;
        },
        async deleteMany(w) {
          if (!w || !Object.keys(w).length) throw new RecordQueryError("deleteMany needs a filter");
          return (await db.pluginRecord.deleteMany({ where: where(w) })).count;
        },
        async find(opts = {}) {
          const rows = await db.pluginRecord.findMany({
            where: where(opts.where),
            orderBy: buildOrder(spec, opts.orderBy) as Prisma.PluginRecordOrderByWithRelationInput[],
            take: clampFindLimit(opts.limit),
            skip: Math.max(0, Math.floor(opts.offset ?? 0)),
          });
          return rows.map((r) => toRecord<T>(r));
        },
        async findOne(w) {
          const r = await db.pluginRecord.findFirst({ where: where(w), orderBy: buildOrder(spec) as Prisma.PluginRecordOrderByWithRelationInput[] });
          return r ? toRecord<T>(r) : null;
        },
        async count(w) {
          return db.pluginRecord.count({ where: where(w) });
        },
        async sum(field, w) {
          const col = spec.columns.get(field);
          if (!col || !col.startsWith("n")) throw new RecordQueryError(`sum("${field}"): add it to numbers of collection "${name}"`);
          const r = await db.pluginRecord.aggregate({ where: where(w), _sum: { [col]: true } as Prisma.PluginRecordSumAggregateInputType });
          const v = (r._sum as Record<string, { toNumber(): number } | null>)[col];
          return v ? v.toNumber() : 0;
        },
      };
    },
  };
}
