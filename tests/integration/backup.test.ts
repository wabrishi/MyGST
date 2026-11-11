import "dotenv/config";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encryptSecret } from "@/lib/backup/crypto";
import type { DriveApi, DriveFile } from "@/lib/backup/google-drive";
import { runBackup, runDueBackups } from "@/lib/backup/runner";
import { db } from "@/lib/db";

/** In-memory stand-in for Google Drive. */
function fakeDrive() {
  const folders = new Set<string>();
  const files = new Map<string, DriveFile & { folderId: string; data: Buffer }>();
  let n = 0;
  const api: DriveApi & { fail?: boolean } = {
    async accessTokenFrom(rt) {
      if (api.fail) throw new Error("Google access was revoked");
      expect(rt).toBe("refresh-123");
      return "access";
    },
    async folderExists(_t, id) {
      return folders.has(id);
    },
    async createFolder() {
      const id = `folder-${++n}`;
      folders.add(id);
      return id;
    },
    async uploadFile(_t, folderId, name, data) {
      const id = `file-${++n}`;
      files.set(id, { id, name, createdTime: new Date().toISOString(), folderId, data });
      return id;
    },
    async listFiles(_t, folderId) {
      return [...files.values()].filter((f) => f.folderId === folderId);
    },
    async deleteFile(_t, id) {
      files.delete(id);
    },
  };
  return { api, folders, files };
}

describe("backup runner", () => {
  let companyId = "";
  let targetId = "";
  const drive = fakeDrive();

  beforeAll(async () => {
    const c = await db.company.create({ data: { legalName: "Backup Test Co", stateCode: "27" } });
    companyId = c.id;
    await db.party.create({ data: { companyId, name: "Backup Customer", stateCode: "27" } });
    drive.folders.add("folder-0");
    // An old backup (40 days) and an unrelated file that retention must not touch.
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
    drive.files.set("old", { id: "old", name: "mygst-old.json.gz", createdTime: old, folderId: "folder-0", data: Buffer.alloc(0) });
    drive.files.set("mine", { id: "mine", name: "my-notes.txt", createdTime: old, folderId: "folder-0", data: Buffer.alloc(0) });
    const t = await db.backupTarget.create({
      data: {
        scopeKey: `company:${companyId}`,
        scope: "COMPANY",
        companyId,
        accountEmail: "owner@example.com",
        refreshTokenEnc: encryptSecret("refresh-123"),
        folderId: "folder-0",
        connectedById: "test",
      },
    });
    targetId = t.id;
  });

  afterAll(async () => {
    await db.company.delete({ where: { id: companyId } }); // cascades to target, runs, parties
    await db.$disconnect();
  });

  it("uploads a gzipped company export and applies 30-day retention", async () => {
    const r = await runBackup(targetId, "MANUAL", drive.api);
    expect(r.status).toBe("SUCCESS");
    expect(r.fileName).toMatch(/^mygst-Backup-Test-Co-\d{4}-\d{2}-\d{2}T\d{6}Z\.json\.gz$/);
    expect(r.deleted).toBe(1);
    expect(drive.files.has("old")).toBe(false);
    expect(drive.files.has("mine")).toBe(true); // not ours by name → kept

    const uploaded = [...drive.files.values()].find((f) => f.name === r.fileName)!;
    const json = JSON.parse(gunzipSync(uploaded.data).toString("utf8"));
    expect(json.format).toBe("mygst-company-v1");
    expect(json.company.id).toBe(companyId);
    expect(json.parties.map((p: { name: string }) => p.name)).toContain("Backup Customer");

    const t = await db.backupTarget.findUniqueOrThrow({ where: { id: targetId }, include: { runs: true } });
    expect(t.lastSuccessAt).not.toBeNull();
    expect(t.runningSince).toBeNull();
    expect(t.runs[0].status).toBe("SUCCESS");
  });

  it("is not due again right after a success", async () => {
    const results = await runDueBackups({ drive: drive.api });
    expect(results.find((r) => r.targetId === targetId)).toBeUndefined();
  });

  it("never runs twice at the same time", async () => {
    const [a, b] = await Promise.all([runBackup(targetId, "MANUAL", drive.api), runBackup(targetId, "MANUAL", drive.api)]);
    expect([a.status, b.status].sort()).toEqual(["SKIPPED", "SUCCESS"]);
  });

  it("re-creates the Drive folder if the user deleted it", async () => {
    drive.folders.clear();
    const r = await runBackup(targetId, "MANUAL", drive.api);
    expect(r.status).toBe("SUCCESS");
    const t = await db.backupTarget.findUniqueOrThrow({ where: { id: targetId } });
    expect(t.folderId).not.toBe("folder-0");
    expect(drive.folders.has(t.folderId)).toBe(true);
  });

  it("records failures and releases the lock", async () => {
    drive.api.fail = true;
    const r = await runBackup(targetId, "MANUAL", drive.api);
    drive.api.fail = false;
    expect(r.status).toBe("FAILED");
    expect(r.error).toMatch(/revoked/);
    const t = await db.backupTarget.findUniqueOrThrow({ where: { id: targetId }, include: { runs: { orderBy: { startedAt: "desc" }, take: 1 } } });
    expect(t.runningSince).toBeNull();
    expect(t.runs[0].status).toBe("FAILED");
  });
});

describe("platform backup", () => {
  it("dumps every table as gzipped NDJSON", async () => {
    const { platformBackupFile } = await import("@/lib/backup/export");
    const { data, counts } = await platformBackupFile(50);
    const lines = gunzipSync(data).toString("utf8").trim().split("\n");
    expect(JSON.parse(lines[0]).$meta.format).toBe("mygst-platform-v1");
    expect(counts.company).toBeGreaterThan(0);
    const tables = new Set(lines.slice(1).map((l) => JSON.parse(l).table));
    expect(tables.has("company")).toBe(true);
    expect(tables.has("session")).toBe(false); // ephemeral tables excluded
    expect(lines.length - 1).toBe(Object.values(counts).reduce((a, b) => a + b, 0));
  });
});
