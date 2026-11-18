import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import mariadb, { type Connection } from "mariadb";

/**
 * Applies pending database migrations (prisma/migrations) when the server starts, so a deploy never
 * runs new code against an old schema, however the host starts the app (Hostinger may run
 * `next start` directly, skipping `npm start`'s `prisma migrate deploy`).
 *
 * Compatible with Prisma: it uses the same `_prisma_migrations` table and checksums, so
 * `prisma migrate deploy` / `status` keep working alongside it. Like Prisma it:
 * - runs each migration file as one script (multiple statements), oldest first;
 * - records a row before running and marks it finished after; a failure leaves the row unfinished
 *   with the error in `logs`, and later runs stop there until it's fixed
 *   (`npx prisma migrate resolve --rolled-back <name>` or `--applied <name>`);
 * - holds a database lock, so two app instances starting together don't both migrate.
 * Turn it off with AUTO_MIGRATE="false". It runs in production, or anywhere with AUTO_MIGRATE="true".
 */

export interface MigrationResult {
  ok: boolean;
  applied: string[];
  pending: string[];
  error?: string;
  at: string;
}

const LOCK = "mygst_migrate";
const migrationsDir = () => join(process.cwd(), "prisma", "migrations");

/** Migration folders shipped with this build, oldest first. */
export function bundledMigrations(dir = migrationsDir()) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((name) => {
      const sql = readFileSync(join(dir, name, "migration.sql"));
      return { name, sql: sql.toString("utf8"), checksum: createHash("sha256").update(sql).digest("hex") };
    });
}

function connectionUri() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const url = new URL(raw.replace(/^mysql:/, "mariadb:"));
  if (!url.searchParams.has("allowPublicKeyRetrieval")) url.searchParams.set("allowPublicKeyRetrieval", "true");
  url.searchParams.set("multipleStatements", "true");
  return url.toString();
}

// Prisma's own definition of the history table (used only when it doesn't exist yet).
const HISTORY_TABLE = `CREATE TABLE IF NOT EXISTS \`_prisma_migrations\` (
  \`id\` VARCHAR(36) PRIMARY KEY NOT NULL,
  \`checksum\` VARCHAR(64) NOT NULL,
  \`finished_at\` DATETIME(3),
  \`migration_name\` VARCHAR(255) NOT NULL,
  \`logs\` TEXT,
  \`rolled_back_at\` DATETIME(3),
  \`started_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`applied_steps_count\` INTEGER UNSIGNED NOT NULL DEFAULT 0
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`;

type Row = { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null };

export async function runMigrations(opts: { log?: (msg: string) => void; dir?: string } = {}): Promise<MigrationResult> {
  const log = opts.log ?? ((m: string) => console.info(`[migrate] ${m}`));
  const at = new Date().toISOString();
  const applied: string[] = [];
  let pending: string[] = [];
  let conn: Connection | null = null;
  try {
    const migrations = bundledMigrations(opts.dir);
    conn = await mariadb.createConnection(connectionUri());
    const [lock] = await conn.query<Array<{ got: number | bigint | null }>>("SELECT GET_LOCK(?, 300) AS got", [LOCK]);
    if (Number(lock?.got) !== 1) throw new Error("Another server is applying migrations; try again in a minute");
    try {
      const [{ n: hasHistory }] = await conn.query<Array<{ n: number | bigint }>>(
        "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '_prisma_migrations'",
      );
      if (!Number(hasHistory)) {
        // An existing database without history (tables made by hand or by `db push`) must be
        // baselined first, or the first migration would try to create tables that already exist.
        const [{ n: tables }] = await conn.query<Array<{ n: number | bigint }>>(
          "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE()",
        );
        if (Number(tables) > 0) {
          throw new Error("The database has tables but no _prisma_migrations history. Baseline it first (see README → Deploying), then restart.");
        }
        await conn.query(HISTORY_TABLE);
      }
      const rows = await conn.query<Row[]>("SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations");
      const failed = rows.filter((r) => !r.finished_at && !r.rolled_back_at).map((r) => r.migration_name);
      const done = new Set(rows.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name));
      pending = migrations.filter((m) => !done.has(m.name)).map((m) => m.name);
      if (failed.length) {
        throw new Error(
          `Migration ${failed.join(", ")} failed earlier and needs attention. Fix the database, then run \`npx prisma migrate resolve --applied <name>\` (or --rolled-back), and restart.`,
        );
      }
      if (!pending.length) return { ok: true, applied, pending, at };

      for (const m of migrations.filter((x) => pending.includes(x.name))) {
        const id = randomUUID();
        log(`applying ${m.name}`);
        await conn.query("INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count) VALUES (?, ?, ?, NOW(3), 0)", [id, m.checksum, m.name]);
        try {
          await conn.query(m.sql);
        } catch (e) {
          const msg = (e as Error).message;
          await conn.query("UPDATE _prisma_migrations SET logs = ? WHERE id = ?", [msg.slice(0, 60_000), id]).catch(() => {});
          throw new Error(`${m.name} failed: ${msg}`);
        }
        await conn.query("UPDATE _prisma_migrations SET finished_at = NOW(3), applied_steps_count = 1 WHERE id = ?", [id]);
        applied.push(m.name);
        pending = pending.filter((p) => p !== m.name);
      }
      log(`applied ${applied.length} migration(s)`);
      return { ok: true, applied, pending, at };
    } finally {
      await conn.query("SELECT RELEASE_LOCK(?)", [LOCK]).catch(() => {});
    }
  } catch (e) {
    const error = (e as Error).message;
    console.error(`[migrate] ${error}`);
    return { ok: false, applied, pending, error, at };
  } finally {
    await conn?.end().catch(() => {});
  }
}

/** The last startup run in this process (shown in Admin → System). */
const g = globalThis as unknown as { __mygstMigration?: MigrationResult };
export const lastMigrationRun = () => g.__mygstMigration ?? null;
export const rememberMigrationRun = (r: MigrationResult) => {
  g.__mygstMigration = r;
};

export const autoMigrateEnabled = () => {
  const flag = process.env.AUTO_MIGRATE?.toLowerCase();
  if (flag === "false" || flag === "0") return false;
  return flag === "true" || flag === "1" || process.env.NODE_ENV === "production";
};
