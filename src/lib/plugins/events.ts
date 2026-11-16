import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "../db";
import { newEventId } from "../events/signing";
import { isPluginActive } from "./access";
import type { PluginEvent } from "./manifest";
import { manifestOf } from "./runner";

/**
 * Records one outbox row per active plugin subscribed to `type`, inside the caller's transaction
 * (so events exist only if the change committed). /api/cron/tick and deliverSoon() deliver them:
 * code plugins in-process, external plugins as signed HTTP POSTs — both with retries.
 */
export async function enqueuePluginEvents(tx: Tx, companyId: string, type: PluginEvent, data: Record<string, unknown>) {
  const plugins = await tx.plugin.findMany({
    where: { status: "INSTALLED", availability: { not: "NONE" } },
    include: { companies: { where: { companyId } } },
  });
  const occurredAt = new Date().toISOString();
  for (const { companies, ...plugin } of plugins) {
    if (!isPluginActive(plugin, companies[0])) continue;
    const manifest = manifestOf(plugin);
    if (!manifest?.events.includes(type)) continue;
    const id = newEventId();
    const envelope = { id, type, source: "gst", companyId, occurredAt, data: clean(data) };
    await tx.outboxEvent.create({ data: { id, companyId, type, envelope: envelope as Prisma.InputJsonValue, pluginId: plugin.id } });
  }
}

const clean = (o: Record<string, unknown>) => JSON.parse(JSON.stringify(o, (_k, v) => (v === undefined ? undefined : v))) as Record<string, unknown>;
