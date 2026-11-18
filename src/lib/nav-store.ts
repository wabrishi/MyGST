import "server-only";
import { cache } from "react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { DEFAULT_LAYOUT, parseLayout, type NavLayout } from "./nav";

/** The sidebar order a super admin saved in Admin → Menu (one row in system_state, for every company). */
export const NAV_LAYOUT_KEY = "nav.layout";

export const getNavLayout = cache(async (): Promise<NavLayout> => {
  const row = await db.systemState.findUnique({ where: { key: NAV_LAYOUT_KEY } }).catch(() => null);
  return row ? parseLayout(row.value) : DEFAULT_LAYOUT;
});

export async function saveNavLayout(raw: unknown) {
  const layout = parseLayout(raw);
  const value = layout as unknown as Prisma.InputJsonValue;
  await db.systemState.upsert({ where: { key: NAV_LAYOUT_KEY }, create: { key: NAV_LAYOUT_KEY, value }, update: { value } });
  return layout;
}

export async function resetNavLayout() {
  await db.systemState.deleteMany({ where: { key: NAV_LAYOUT_KEY } });
}
