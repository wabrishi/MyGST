import "server-only";
import { randomUUID } from "node:crypto";
import type { DocType } from "@/generated/prisma/enums";
import { financialYear, formatDocNumber } from "./gst/fy";
import type { Tx } from "./db";

export const DEFAULT_PREFIX: Record<DocType, string> = {
  INVOICE: "INV/",
  QUOTATION: "QT/",
  CREDIT_NOTE: "CN/",
  DEBIT_NOTE: "DN/",
};

export const DOC_LABEL: Record<DocType, string> = {
  INVOICE: "Tax Invoice",
  QUOTATION: "Quotation",
  CREDIT_NOTE: "Credit Note",
  DEBIT_NOTE: "Debit Note",
};

/** Prefix to use for a new FY: the most recently configured one for this doc type, else the default. */
async function prefixFor(tx: Tx, companyId: string, docType: DocType) {
  const latest = await tx.numberSeries.findFirst({ where: { companyId, docType }, orderBy: { fy: "desc" }, select: { prefix: true } });
  return latest?.prefix ?? DEFAULT_PREFIX[docType];
}

/** Ensures a series row exists for (company, type, fy). Safe under concurrency (INSERT IGNORE). */
export async function ensureSeries(tx: Tx, companyId: string, docType: DocType, fy: string) {
  const prefix = await prefixFor(tx, companyId, docType);
  await tx.$executeRaw`INSERT IGNORE INTO number_series (id, companyId, docType, fy, prefix, nextSeq)
    VALUES (${randomUUID()}, ${companyId}, ${docType}, ${fy}, ${prefix}, 1)`;
}

/**
 * Allocates the next gap-free number. MUST be called inside the same transaction that inserts the
 * document: the row lock (SELECT … FOR UPDATE) serialises concurrent invoice creation per series,
 * and a rollback releases the number.
 */
export async function allocateNumber(tx: Tx, companyId: string, docType: DocType, date: string) {
  const fy = financialYear(date);
  const lock = () =>
    tx.$queryRaw<Array<{ prefix: string; nextSeq: number }>>`
      SELECT prefix, nextSeq FROM number_series WHERE companyId = ${companyId} AND docType = ${docType} AND fy = ${fy} FOR UPDATE`;
  // Fast path: series exists, lock it. Only the first document of a FY inserts the row (deadlocks there are retried by runTx).
  let rows = await lock();
  if (rows.length === 0) {
    await ensureSeries(tx, companyId, docType, fy);
    rows = await lock();
  }
  const { prefix, nextSeq } = rows[0];
  const seq = Number(nextSeq);
  await tx.$executeRaw`UPDATE number_series SET nextSeq = ${seq + 1} WHERE companyId = ${companyId} AND docType = ${docType} AND fy = ${fy}`;
  return { fy, seq, number: formatDocNumber(prefix, fy, seq) };
}

/** Preview of the next number (not reserved). */
export async function peekNumber(tx: Tx, companyId: string, docType: DocType, date: string) {
  const fy = financialYear(date);
  const s = await tx.numberSeries.findUnique({ where: { companyId_docType_fy: { companyId, docType, fy } } });
  const prefix = s?.prefix ?? (await prefixFor(tx, companyId, docType));
  return formatDocNumber(prefix, fy, s?.nextSeq ?? 1);
}
