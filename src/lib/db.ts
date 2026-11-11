import "server-only";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * The mariadb driver wants a `mariadb://` URL; MySQL 8's default auth plugin over a non-TLS
 * connection (Hostinger localhost, Docker) also needs public key retrieval enabled.
 */
function connectionString() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const url = new URL(raw.replace(/^mysql:/, "mariadb:"));
  if (!url.searchParams.has("allowPublicKeyRetrieval")) url.searchParams.set("allowPublicKeyRetrieval", "true");
  if (!url.searchParams.has("connectionLimit")) url.searchParams.set("connectionLimit", "5");
  return url.toString();
}

const createClient = () => new PrismaClient({ adapter: new PrismaMariaDb(connectionString()) });

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

/** MySQL deadlock (1213) / lock wait timeout (1205), or Prisma's write-conflict code. */
function isRetryable(err: unknown) {
  const e = err as { code?: string; message?: string; meta?: { code?: string } };
  return e?.code === "P2034" || /\b(1213|1205)\b|Deadlock found|Lock wait timeout/i.test(`${e?.meta?.code ?? ""} ${e?.message ?? ""}`);
}

/**
 * Interactive transaction with automatic retry on deadlocks. Use for every write that takes row
 * locks (document numbering, payment allocation). `fn` must be safe to re-run from the start.
 */
export async function runTx<T>(fn: (tx: Tx) => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await db.$transaction(fn, { timeout: 20_000, maxWait: 10_000 });
    } catch (err) {
      if (i >= attempts || !isRetryable(err)) throw err;
      await new Promise((r) => setTimeout(r, 20 * i + Math.random() * 50));
    }
  }
}
