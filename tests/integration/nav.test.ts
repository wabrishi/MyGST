import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getNavLayout, NAV_LAYOUT_KEY, resetNavLayout, saveNavLayout } from "@/lib/nav-store";

/** The saved sidebar order (system_state "nav.layout"); the row is restored afterwards. */
describe("menu order storage", () => {
  let before: unknown = undefined;

  beforeAll(async () => {
    before = (await db.systemState.findUnique({ where: { key: NAV_LAYOUT_KEY } }))?.value;
  });
  afterAll(async () => {
    if (before === undefined) await db.systemState.deleteMany({ where: { key: NAV_LAYOUT_KEY } });
    else await db.systemState.upsert({ where: { key: NAV_LAYOUT_KEY }, create: { key: NAV_LAYOUT_KEY, value: before as object }, update: { value: before as object } });
    await db.$disconnect();
  });

  it("saves (cleaned), reads back, and resets", async () => {
    const saved = await saveNavLayout({ sections: ["purchases", "sales", "bad key!"], items: { sales: ["payments"] }, extra: true });
    expect(saved).toEqual({ sections: ["purchases", "sales"], items: { sales: ["payments"] } });
    const row = await db.systemState.findUniqueOrThrow({ where: { key: NAV_LAYOUT_KEY } });
    expect(row.value).toEqual(saved);
    expect(await getNavLayout()).toEqual(saved);

    await resetNavLayout();
    expect(await db.systemState.findUnique({ where: { key: NAV_LAYOUT_KEY } })).toBeNull();
  });
});
