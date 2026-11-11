import "server-only";
import { createGzip } from "node:zlib";
import { db } from "../db";

/** JSON replacer: Decimal → string (via toJSON), bigint → string, bytes → base64. */
const replacer = (_k: string, v: unknown) => {
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Uint8Array) return { $base64: Buffer.from(v).toString("base64") };
  if (v && typeof v === "object" && (v as { type?: string }).type === "Buffer" && Array.isArray((v as { data?: unknown }).data)) {
    return { $base64: Buffer.from((v as { data: number[] }).data).toString("base64") };
  }
  return v;
};

/** Gzip a sequence of string chunks into one Buffer without building one huge string. */
async function gzipChunks(produce: (write: (s: string) => void) => Promise<void>): Promise<Buffer> {
  const gz = createGzip({ level: 9 });
  const parts: Buffer[] = [];
  gz.on("data", (b: Buffer) => parts.push(b));
  const done = new Promise<void>((resolve, reject) => {
    gz.on("end", resolve);
    gz.on("error", reject);
  });
  await produce((s) => gz.write(s));
  gz.end();
  await done;
  return Buffer.concat(parts);
}

// ───────────────────────── Company export ─────────────────────────

/** Everything belonging to one company. Used by "Export all data" and company backups. */
export async function exportCompanyData(companyId: string) {
  const where = { companyId };
  const [company, members, parties, products, numberSeries, documents, purchases, payments] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: companyId } }),
    db.membership.findMany({ where, select: { role: true, user: { select: { name: true, email: true } } } }),
    db.party.findMany({ where }),
    db.product.findMany({ where }),
    db.numberSeries.findMany({ where }),
    db.document.findMany({ where, include: { items: true }, orderBy: [{ date: "asc" }, { seq: "asc" }] }),
    db.purchaseBill.findMany({ where, include: { items: true }, orderBy: { billDate: "asc" } }),
    db.payment.findMany({ where, include: { allocations: true }, orderBy: { date: "asc" } }),
  ]);
  return { format: "mygst-company-v1", exportedAt: new Date().toISOString(), company, members, parties, products, numberSeries, documents, purchases, payments };
}

export const companyExportJson = async (companyId: string) => JSON.stringify(await exportCompanyData(companyId), replacer, 2);

export async function companyBackupFile(companyId: string) {
  const data = await exportCompanyData(companyId);
  const json = JSON.stringify(data, replacer);
  const gz = await gzipChunks(async (w) => w(json));
  const counts = { documents: data.documents.length, purchases: data.purchases.length, payments: data.payments.length, parties: data.parties.length };
  return { data: gz, counts };
}

// ───────────────────────── Platform dump ─────────────────────────

/**
 * Tables included in the full-platform backup, in restore order (parents before children).
 * Sessions/verification tokens are skipped (ephemeral); backup tables are skipped (they hold
 * encrypted Drive tokens and would be meaningless after a restore).
 */
const PLATFORM_TABLES = [
  "user",
  "account",
  "company",
  "membership",
  "invitation",
  "party",
  "product",
  "numberSeries",
  "document",
  "documentItem",
  "purchaseBill",
  "purchaseItem",
  "payment",
  "paymentAllocation",
  "auditLog",
] as const;

type Delegate = { findMany(args: { take: number; skip?: number; cursor?: { id: string }; orderBy: { id: "asc" } }): Promise<Array<{ id: string }>> };

/**
 * Full database dump as gzipped NDJSON:
 *   {"$meta": {...}}
 *   {"table":"user","row":{...}}  … one line per row
 * Rows are read in batches (cursor pagination) so memory stays flat as data grows.
 */
export async function platformBackupFile(batchSize = 1000) {
  const counts: Record<string, number> = {};
  const data = await gzipChunks(async (write) => {
    write(JSON.stringify({ $meta: { format: "mygst-platform-v1", exportedAt: new Date().toISOString(), tables: PLATFORM_TABLES } }) + "\n");
    for (const table of PLATFORM_TABLES) {
      const delegate = (db as unknown as Record<string, Delegate>)[table];
      let cursor: string | undefined;
      counts[table] = 0;
      for (;;) {
        const rows = await delegate.findMany({ take: batchSize, orderBy: { id: "asc" }, ...(cursor && { skip: 1, cursor: { id: cursor } }) });
        for (const row of rows) write(JSON.stringify({ table, row }, replacer) + "\n");
        counts[table] += rows.length;
        if (rows.length < batchSize) break;
        cursor = rows[rows.length - 1].id;
      }
    }
  });
  return { data, counts };
}
