import "dotenv/config";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mariadb from "mariadb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bundledMigrations, runMigrations } from "@/lib/migrate";

/**
 * The startup migration runner, against throw-away databases on the test server: fresh install,
 * re-run, Prisma compatibility, a failing migration, and an un-baselined database.
 */
// Applying every migration takes a while when other test files share the database server.
describe("startup migrations", { timeout: 240_000 }, () => {
  const original = process.env.DATABASE_URL!;
  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const names = { fresh: `mygst_mig_${stamp}`, broken: `mygst_mig_${stamp}_b`, legacy: `mygst_mig_${stamp}_l` };
  const urlFor = (db: string) => {
    const u = new URL(original);
    u.pathname = `/${db}`;
    return u.toString();
  };
  const admin = () => mariadb.createConnection({ ...connOpts(original), database: undefined });
  const connOpts = (raw: string) => {
    const u = new URL(raw);
    return { host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), allowPublicKeyRetrieval: true };
  };
  const withDb = async <T,>(db: string, fn: () => Promise<T>) => {
    process.env.DATABASE_URL = urlFor(db);
    try {
      return await fn();
    } finally {
      process.env.DATABASE_URL = original;
    }
  };
  const silent = { log: () => {} };
  let tmp = "";

  beforeAll(async () => {
    const c = await admin();
    for (const n of Object.values(names)) await c.query(`CREATE DATABASE \`${n}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await c.end();
    tmp = mkdtempSync(join(tmpdir(), "mygst-mig-"));
  }, 120_000); // creating databases waits behind other test files on a busy server

  afterAll(async () => {
    const c = await admin();
    for (const n of Object.values(names)) await c.query(`DROP DATABASE IF EXISTS \`${n}\``);
    await c.end();
    rmSync(tmp, { recursive: true, force: true });
  }, 120_000);

  it("applies every migration to an empty database, then has nothing to do", async () => {
    const all = bundledMigrations().map((m) => m.name);
    const first = await withDb(names.fresh, () => runMigrations(silent));
    expect(first).toMatchObject({ ok: true, applied: all, pending: [] });
    const again = await withDb(names.fresh, () => runMigrations(silent));
    expect(again).toMatchObject({ ok: true, applied: [], pending: [] });
  });

  it("leaves a history Prisma agrees with (same checksums, nothing pending, no drift)", () => {
    const env = { ...process.env, DATABASE_URL: urlFor(names.fresh) };
    const status = execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "status"], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    expect(status).toMatch(/Database schema is up to date/);
    const diff = execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--script"], {
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(diff).toMatch(/empty migration/);
  });

  it("a failing migration is recorded and blocks later runs until resolved", async () => {
    const dir = join(tmp, "migrations");
    cpSync(join(process.cwd(), "prisma", "migrations"), dir, { recursive: true });
    mkdirSync(join(dir, "29990101000000_broken"));
    writeFileSync(join(dir, "29990101000000_broken", "migration.sql"), "CREATE TABLE `ok_part` (`id` INT PRIMARY KEY);\nALTER TABLE `no_such_table` ADD COLUMN `x` INT;\n");

    const r = await withDb(names.broken, () => runMigrations({ ...silent, dir }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/29990101000000_broken failed/);
    expect(r.applied).toHaveLength(bundledMigrations().length); // everything before it went in

    const c = await mariadb.createConnection({ ...connOpts(original), database: names.broken });
    const [row] = await c.query("SELECT finished_at, logs FROM _prisma_migrations WHERE migration_name = '29990101000000_broken'");
    await c.end();
    expect(row.finished_at).toBeNull();
    expect(row.logs).toMatch(/no_such_table/);

    const next = await withDb(names.broken, () => runMigrations({ ...silent, dir }));
    expect(next.ok).toBe(false);
    expect(next.error).toMatch(/failed earlier and needs attention/);
  });

  it("refuses a database that has tables but no migration history", async () => {
    const c = await mariadb.createConnection({ ...connOpts(original), database: names.legacy });
    await c.query("CREATE TABLE `user` (`id` VARCHAR(191) PRIMARY KEY)");
    await c.end();
    const r = await withDb(names.legacy, () => runMigrations(silent));
    expect(r).toMatchObject({ ok: false, applied: [] });
    expect(r.error).toMatch(/no _prisma_migrations history/);
  });
});
